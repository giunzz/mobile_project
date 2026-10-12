#include "csunet_model.h"
#include "csunet_weights.h"
#include <float.h>
#include <math.h>
#include <string.h>

_Static_assert(sizeof(float) == 4 && FLT_RADIX == 2 && FLT_MANT_DIG == 24,
               "This model requires IEEE-754 binary32 floats");

static float relu(float v) { return v > 0.0f ? v : 0.0f; }

/* Same symmetric zero padding as nn.Conv2d(padding=kernel/2), including
 * stride=2. TensorFlow SAME's asymmetric padding must not be substituted.
 */
static void conv_relu(const float *x, int h, int w, const CSUNetConv *p,
                       float *y) {
    int k = p->kernel, pad = k / 2;
    int oh = (h + 2 * pad - k) / p->stride + 1;
    int ow = (w + 2 * pad - k) / p->stride + 1;
    int plane = h * w, out_plane = oh * ow;
    if (k == 1 && p->stride == 1 && p->groups == 1) {
        for (int oc = 0; oc < p->cout; ++oc) {
            float *dst = y + oc * out_plane;
            for (int pos = 0; pos < out_plane; ++pos) dst[pos] = p->bias[oc];
            for (int ic = 0; ic < p->cin; ++ic) {
                float weight = p->weights[oc * p->cin + ic];
                const float *src = x + ic * plane;
                for (int pos = 0; pos < plane; ++pos) dst[pos] += weight * src[pos];
            }
            for (int pos = 0; pos < out_plane; ++pos) dst[pos] = relu(dst[pos]);
        }
        return;
    }
    int depthwise = p->groups == p->cin && p->cout == p->cin;
    for (int oc = 0; oc < p->cout; ++oc) {
        int first_ic = depthwise ? oc : 0;
        int last_ic = depthwise ? oc + 1 : p->cin;
        for (int oy = 0; oy < oh; ++oy) {
            for (int ox = 0; ox < ow; ++ox) {
                float acc = p->bias[oc];
                for (int ic = first_ic; ic < last_ic; ++ic) {
                    const float *kernel = p->weights +
                        (depthwise ? oc : oc * p->cin + ic) * k * k;
                    for (int ky = 0; ky < k; ++ky) {
                        int iy = oy * p->stride + ky - pad;
                        if (iy < 0 || iy >= h) continue;
                        for (int kx = 0; kx < k; ++kx) {
                            int ix = ox * p->stride + kx - pad;
                            if (ix >= 0 && ix < w)
                                acc += x[ic * plane + iy * w + ix] * kernel[ky * k + kx];
                        }
                    }
                }
                y[oc * out_plane + oy * ow + ox] = relu(acc);
            }
        }
    }
}

static void add_inplace(float *a, const float *b, int n) {
    for (int i = 0; i < n; ++i) a[i] += b[i];
}

static void run_conv(int layer, const float *x, int h, int w, float *y,
                     CSUNetYieldHook hook, void *user) {
    conv_relu(x, h, w, &csunet_encoder_layers[layer], y);
    if (hook) hook(user);
}

/* Independent subsets of atoms synthesize shared/cat/dog feature content. */
static void synthesize(const float *z, int first, int count, float *y) {
    for (int oc = 0; oc < 12; ++oc) {
        for (int oy = 0; oy < 8; ++oy) {
            for (int ox = 0; ox < 8; ++ox) {
                float acc = 0.0f;
                for (int atom = first; atom < first + count; ++atom) {
                    const float *kernel = csunet_dsyn + (oc * 10 + atom) * 9;
                    for (int ky = 0; ky < 3; ++ky) {
                        int iy = oy + ky - 1;
                        if (iy < 0 || iy >= 8) continue;
                        for (int kx = 0; kx < 3; ++kx) {
                            int ix = ox + kx - 1;
                            if (ix >= 0 && ix < 8)
                                acc += z[atom * 64 + iy * 8 + ix] * kernel[ky * 3 + kx];
                        }
                    }
                }
                y[oc * 64 + oy * 8 + ox] = acc;
            }
        }
    }
}

static void analysis_conv(const float *error, float *grad) {
    for (int atom = 0; atom < 10; ++atom) {
        for (int oy = 0; oy < 8; ++oy) {
            for (int ox = 0; ox < 8; ++ox) {
                float acc = 0.0f;
                for (int ic = 0; ic < 12; ++ic) {
                    const float *kernel = csunet_wn + (atom * 12 + ic) * 9;
                    for (int ky = 0; ky < 3; ++ky) {
                        int iy = oy + ky - 1;
                        if (iy < 0 || iy >= 8) continue;
                        for (int kx = 0; kx < 3; ++kx) {
                            int ix = ox + kx - 1;
                            if (ix >= 0 && ix < 8)
                                acc += error[ic * 64 + iy * 8 + ix] * kernel[ky * 3 + kx];
                        }
                    }
                }
                grad[atom * 64 + oy * 8 + ox] = acc;
            }
        }
    }
}

size_t csunet_workspace_bytes(void) { return CSUNET_WORKSPACE_BYTES; }
const char *csunet_class_name(int id) {
    return id == 0 ? "cat" : id == 1 ? "dog" : "none";
}

static CSUNetStatus check_workspace(void *workspace, size_t bytes) {
    if (!workspace || (uintptr_t)workspace % _Alignof(float)) return CSUNET_BAD_ARGUMENT;
    return bytes < CSUNET_WORKSPACE_BYTES ? CSUNET_WORKSPACE_TOO_SMALL : CSUNET_OK;
}

CSUNetStatus csunet_predict_chw_with_hook(
    const float *input, size_t input_count, void *workspace, size_t bytes,
    CSUNetResult *result, CSUNetYieldHook hook, void *user) {
    if (!input || !result || input_count != CSUNET_INPUT_FLOATS) return CSUNET_BAD_ARGUMENT;
    memset(result, 0, sizeof(*result));
    result->class_id = -1;
    CSUNetStatus status = check_workspace(workspace, bytes);
    if (status != CSUNET_OK) return status;
    for (size_t i = 0; i < input_count; ++i)
        if (!isfinite(input[i])) return CSUNET_NONFINITE_INPUT;
    float *a = (float *)workspace + CSUNET_INPUT_FLOATS;
    float *b = a + 98304;
    float *c = b + 65536;

    /* Encoder. Reuse 3 buffers and preserve each residual input until addition. */
    run_conv(0, input, 128, 128, a, hook, user);
    run_conv(1, a, 64, 64, b, hook, user);
    run_conv(2, a, 64, 64, c, hook, user);
    add_inplace(b, c, 16 * 64 * 64);
    run_conv(3, b, 64, 64, a, hook, user);
    run_conv(4, a, 64, 64, b, hook, user);
    run_conv(5, b, 32, 32, c, hook, user);
    run_conv(6, c, 32, 32, b, hook, user);
    run_conv(7, b, 32, 32, a, hook, user);
    add_inplace(c, a, 32 * 32 * 32);
    run_conv(8, c, 32, 32, b, hook, user);
    run_conv(9, b, 16, 16, c, hook, user);
    run_conv(10, c, 16, 16, b, hook, user);
    run_conv(11, b, 16, 16, a, hook, user);
    add_inplace(c, a, 48 * 16 * 16);
    run_conv(12, c, 16, 16, b, hook, user);
    run_conv(13, b, 8, 8, c, hook, user);
    run_conv(14, c, 8, 8, b, hook, user);
    run_conv(15, b, 8, 8, a, hook, user);
    add_inplace(c, a, 64 * 8 * 8);
    run_conv(16, c, 8, 8, a, hook, user);
    memcpy(c, a, 12 * 64 * sizeof(float));

    /* SSR/LISTA: Z <- soft_threshold(Z + step * W(F - D Z), threshold). */
    float *z = b;
    float *grad = b + 640;
    float *shared = a + 768;
    memset(z, 0, 640 * sizeof(float));
    for (int stage = 0; stage < 4; ++stage) {
        synthesize(z, 0, 10, a);
        for (int i = 0; i < 768; ++i) a[i] = c[i] - a[i];
        analysis_conv(a, grad);
        for (int atom = 0; atom < 10; ++atom) {
            float threshold = csunet_thresholds[stage * 10 + atom];
            for (int pos = 0; pos < 64; ++pos) {
                int i = atom * 64 + pos;
                float v = z[i] + csunet_steps[stage] * grad[i];
                z[i] = relu(v - threshold) - relu(-v - threshold);
            }
        }
        if (hook) hook(user);
    }
    synthesize(z, 0, 2, shared);
    for (int cls = 0; cls < 2; ++cls) {
        synthesize(z, 2 + cls * 4, 4, a);
        float sum = 0.0f;
        for (int i = 0; i < 768; ++i) {
            float e = c[i] - shared[i] - a[i];
            sum += e * e;
        }
        result->residuals[cls] = sum / 768.0f;
        result->logits[cls] = -csunet_scale[0] * result->residuals[cls] + csunet_bias[cls];
        if (!isfinite(result->logits[cls])) return CSUNET_NONFINITE_OUTPUT;
    }
    float max_logit = fmaxf(result->logits[0], result->logits[1]);
    float p0 = expf(result->logits[0] - max_logit);
    float p1 = expf(result->logits[1] - max_logit);
    float sum = p0 + p1;
    result->probabilities[0] = p0 / sum;
    result->probabilities[1] = p1 / sum;
    result->class_id = p0 >= p1 ? 0 : 1;
    result->confidence = result->probabilities[result->class_id];
    return CSUNET_OK;
}

CSUNetStatus csunet_predict_chw(const float *input, size_t count, void *workspace,
                              size_t bytes, CSUNetResult *result) {
    return csunet_predict_chw_with_hook(input, count, workspace, bytes, result, NULL, NULL);
}

/* Separable antialiased bilinear resize, with uint8 rounding after each pass.
 * Coefficients use 22 fractional bits; at most 60 taps for 4096 -> 141.
 */
typedef struct { int start, count; int32_t weights[64]; } Filter;

static void make_filter(int input_size, int output_size, int output_pos, Filter *f) {
    double scale = (double)input_size / output_size;
    double support = scale > 1.0 ? scale : 1.0;
    double center = (output_pos + 0.5) * scale;
    int start = (int)(center - support + 0.5);
    int end = (int)(center + support + 0.5);
    if (start < 0) start = 0;
    if (end > input_size) end = input_size;
    double coeffs[64], sum = 0.0;
    f->start = start;
    f->count = end - start;
    for (int i = 0; i < f->count; ++i) {
        double distance = fabs((start + i - center + 0.5) / support);
        coeffs[i] = distance < 1.0 ? 1.0 - distance : 0.0;
        sum += coeffs[i];
    }
    for (int i = 0; i < f->count; ++i)
        f->weights[i] = (int32_t)(coeffs[i] / sum * 4194304.0 + 0.5);
}

static int rounded_half_even(int value) {
    int half = value / 2;
    return (value % 2 && half % 2) ? half + 1 : half;
}

static int clip_u8(int64_t v) {
    int value = (int)(v >> 22);
    return value < 0 ? 0 : value > 255 ? 255 : value;
}

static CSUNetStatus preprocess_rgb888(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t row_stride, float *out, size_t out_count,
    CSUNetYieldHook hook, void *user) {
    if (!rgb || !out || out_count != CSUNET_INPUT_FLOATS ||
        width < 1 || height < 1 || width > 4096 || height > 4096 ||
        row_stride < (size_t)width * 3) return CSUNET_BAD_ARGUMENT;
    if ((size_t)(height - 1) > (SIZE_MAX - (size_t)width * 3) / row_stride ||
        rgb_bytes < (size_t)(height - 1) * row_stride + (size_t)width * 3)
        return CSUNET_BAD_ARGUMENT;
    int resized_w = width <= height ? 141 : 141 * width / height;
    int resized_h = height <= width ? 141 : 141 * height / width;
    int crop_x = rounded_half_even(resized_w - 128);
    int crop_y = rounded_half_even(resized_h - 128);
    for (int y = 0; y < 128; ++y) {
        Filter fy;
        make_filter(height, resized_h, crop_y + y, &fy);
        for (int x = 0; x < 128; ++x) {
            Filter fx;
            make_filter(width, resized_w, crop_x + x, &fx);
            int64_t vertical[3] = {2097152, 2097152, 2097152};
            for (int iy = 0; iy < fy.count; ++iy) {
                int64_t horizontal[3] = {2097152, 2097152, 2097152};
                const uint8_t *row = rgb + (size_t)(fy.start + iy) * row_stride;
                for (int ix = 0; ix < fx.count; ++ix) {
                    const uint8_t *pixel = row + (size_t)(fx.start + ix) * 3;
                    for (int ch = 0; ch < 3; ++ch)
                        horizontal[ch] += (int64_t)pixel[ch] * fx.weights[ix];
                }
                for (int ch = 0; ch < 3; ++ch)
                    vertical[ch] += (int64_t)clip_u8(horizontal[ch]) * fy.weights[iy];
            }
            for (int ch = 0; ch < 3; ++ch) {
                float pixel = (float)clip_u8(vertical[ch]);
                out[ch * 128 * 128 + y * 128 + x] = (pixel / 255.0f - 0.5f) / 0.5f;
            }
        }
        if (hook) hook(user);
    }
    return CSUNET_OK;
}

CSUNetStatus csunet_preprocess_rgb888(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t row_stride, float *out, size_t out_count) {
    return preprocess_rgb888(rgb, rgb_bytes, width, height, row_stride,
                             out, out_count, NULL, NULL);
}

CSUNetStatus csunet_predict_rgb888_with_hook(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t stride, void *workspace, size_t bytes, CSUNetResult *result,
    CSUNetYieldHook hook, void *user) {
    if (!result) return CSUNET_BAD_ARGUMENT;
    memset(result, 0, sizeof(*result));
    result->class_id = -1;
    CSUNetStatus status = check_workspace(workspace, bytes);
    if (status != CSUNET_OK) return status;
    status = preprocess_rgb888(rgb, rgb_bytes, width, height, stride,
                               (float *)workspace, CSUNET_INPUT_FLOATS, hook, user);
    if (status != CSUNET_OK) return status;
    return csunet_predict_chw_with_hook((float *)workspace, CSUNET_INPUT_FLOATS,
                                      workspace, bytes, result, hook, user);
}

CSUNetStatus csunet_predict_rgb888(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t stride, void *workspace, size_t bytes, CSUNetResult *result) {
    return csunet_predict_rgb888_with_hook(rgb, rgb_bytes, width, height, stride,
                                          workspace, bytes, result, NULL, NULL);
}
