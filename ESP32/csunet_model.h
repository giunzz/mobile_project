#ifndef CSUNET_MODEL_H
#define CSUNET_MODEL_H
#include <stddef.h>
#include <stdint.h>

#define CSUNET_INPUT_WIDTH 128
#define CSUNET_INPUT_HEIGHT 128
#define CSUNET_INPUT_CHANNELS 3
#define CSUNET_INPUT_FLOATS (3u * 128u * 128u)
#define CSUNET_WORKSPACE_FLOATS (49152u + 98304u + 65536u + 65536u)
#define CSUNET_WORKSPACE_BYTES (CSUNET_WORKSPACE_FLOATS * sizeof(float))

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    CSUNET_OK = 0,
    CSUNET_BAD_ARGUMENT = -1,
    CSUNET_WORKSPACE_TOO_SMALL = -2,
    CSUNET_NONFINITE_INPUT = -3,
    CSUNET_NONFINITE_OUTPUT = -4
} CSUNetStatus;

typedef struct {
    float logits[2];
    float residuals[2];
    float probabilities[2];
    int class_id; /* 0 = cat; 1 = dog */
    float confidence;
} CSUNetResult;

typedef void (*CSUNetYieldHook)(void *user);
size_t csunet_workspace_bytes(void);
const char *csunet_class_name(int class_id);
CSUNetStatus csunet_predict_chw(
    const float *input, size_t input_count,
    void *workspace, size_t workspace_bytes, CSUNetResult *result);
CSUNetStatus csunet_predict_chw_with_hook(
    const float *input, size_t input_count,
    void *workspace, size_t workspace_bytes, CSUNetResult *result,
    CSUNetYieldHook hook, void *user);

/* RGB888 -> shortest-edge resize to 141 with antialiased bilinear filtering,
 * center crop 128x128 -> CHW normalized with mean=std=0.5.
 * Supported original width/height: 1..4096. row_stride is in bytes.
 */
CSUNetStatus csunet_preprocess_rgb888(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t row_stride, float *output, size_t output_count);
CSUNetStatus csunet_predict_rgb888(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t row_stride, void *workspace, size_t workspace_bytes,
    CSUNetResult *result);
CSUNetStatus csunet_predict_rgb888_with_hook(
    const uint8_t *rgb, size_t rgb_bytes, int width, int height,
    size_t row_stride, void *workspace, size_t workspace_bytes,
    CSUNetResult *result, CSUNetYieldHook hook, void *user);

#ifdef __cplusplus
}
#endif
#endif
