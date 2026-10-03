#ifndef CSUNET_WEIGHTS_H
#define CSUNET_WEIGHTS_H
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
    int cin, cout, kernel, stride, groups;
    const float *weights;
    const float *bias;
} CSUNetConv;
extern const CSUNetConv csunet_encoder_layers[17];
extern const float csunet_dsyn[12 * 10 * 3 * 3];
extern const float csunet_wn[10 * 12 * 3 * 3];
extern const float csunet_steps[4];
extern const float csunet_thresholds[4 * 10];
extern const float csunet_scale[1];
extern const float csunet_bias[2];
#ifdef __cplusplus
}
#endif
#endif
