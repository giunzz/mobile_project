/* Arduino bridge only. All model arithmetic is compiled from .c files. */
#include "ai_interface.h"
#include "app_config.h"
#include "csunet_model.h"
#include "esp_camera.h"
#include "img_converters.h"
#include <stdlib.h>

// Espressif's legacy fmt2rgb888 conversion commonly stores pixels in B,G,R
// byte order (BMP-compatible). Set to 0 if a red/blue calibration confirms
// your installed camera decoder returns R,G,B already.
#ifndef AI_CAMERA_DECODE_IS_BGR
#define AI_CAMERA_DECODE_IS_BGR 1
#endif

// Set to 1 only if your installed img_converters.h declares this newer API.
#ifndef AI_USE_BOUNDED_CAMERA_DECODE
#define AI_USE_BOUNDED_CAMERA_DECODE 0
#endif

namespace {
void *workspace = nullptr;
bool initialized = false;
bool busy = false;
void yieldToArduino(void *) { delay(1); }
}

bool aiBegin() {
  if (initialized) return true;
  if (!psramFound()) {
    Serial.println("[AI-C][ERROR] Enable PSRAM. Float32 model workspace exceeds internal SRAM.");
    return false;
  }
  workspace = ps_malloc(csunet_workspace_bytes());
  if (!workspace) {
    Serial.printf("[AI-C][ERROR] Cannot allocate %u workspace bytes in PSRAM.\n",
                  (unsigned)csunet_workspace_bytes());
    return false;
  }
  initialized = true;
  Serial.printf("[AI-C] CSUNet-SSR-S3 ready. C float32; workspace=%u bytes.\n",
                (unsigned)csunet_workspace_bytes());
  return true;
}

AIResult aiRunInference() {
  AIResult result;
  result.speciesId = "none";
  result.confidence = 0.0f;
  result.valid = false;
  if (!initialized || busy) return result;
  busy = true;
  const uint32_t total_start_us = micros();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[AI-C][ERROR] Camera capture failed.");
    busy = false;
    return result;
  }
  const uint32_t capture_end_us = micros();
  const int width = fb->width;
  const int height = fb->height;
  if (width < 1 || height < 1 || width > 4096 || height > 4096) {
    esp_camera_fb_return(fb);
    busy = false;
    return result;
  }
  const size_t rgb_bytes = (size_t)width * height * 3;
  uint8_t *rgb = (uint8_t *)ps_malloc(rgb_bytes);
  if (!rgb) {
    Serial.println("[AI-C][ERROR] Cannot allocate camera RGB buffer in PSRAM.");
    esp_camera_fb_return(fb);
    busy = false;
    return result;
  }
#if AI_USE_BOUNDED_CAMERA_DECODE
  bool decoded = fmt2rgb888_bounded(fb->buf, fb->len, fb->format, rgb, rgb_bytes);
#else
  bool decoded = fmt2rgb888(fb->buf, fb->len, fb->format, rgb);
#endif
  esp_camera_fb_return(fb);
  if (!decoded) {
    free(rgb);
    busy = false;
    Serial.println("[AI-C][ERROR] Camera decode failed.");
    return result;
  }
#if AI_CAMERA_DECODE_IS_BGR
  for (size_t i = 0; i < rgb_bytes; i += 3) {
    uint8_t temporary = rgb[i];
    rgb[i] = rgb[i + 2];
    rgb[i + 2] = temporary;
  }
#endif
  const uint32_t decode_end_us = micros();

  const CSUNetStatus preprocess_status = csunet_preprocess_rgb888(
      rgb, rgb_bytes, width, height, (size_t)width * 3,
      (float *)workspace, CSUNET_INPUT_FLOATS);
  const uint32_t preprocess_end_us = micros();
  free(rgb);
  if (preprocess_status != CSUNET_OK) {
    busy = false;
    Serial.printf("[AI-C][ERROR] Preprocess status=%d\n", (int)preprocess_status);
    return result;
  }

  CSUNetResult prediction;
  const uint32_t infer_start_us = micros();
  const CSUNetStatus status = csunet_predict_chw_with_hook(
      (const float *)workspace, CSUNET_INPUT_FLOATS,
      workspace, csunet_workspace_bytes(), &prediction, yieldToArduino, nullptr);
  const uint32_t infer_end_us = micros();
  busy = false;
  if (status != CSUNET_OK) {
    Serial.printf("[AI-C][ERROR] Inference status=%d\n", (int)status);
    return result;
  }
  result.speciesId = prediction.confidence >= AI_CONFIDENCE_THRESHOLD
                         ? csunet_class_name(prediction.class_id)
                         : "none";
  result.confidence = prediction.confidence;
  result.valid = true;
  Serial.printf("[AI-C] capture=%.1f ms decode=%.1f ms preprocess=%.1f ms "
                "infer=%.1f ms total=%.1f ms | cat=%.1f%% dog=%.1f%% -> %s "
                "(threshold=%.0f%%)\n",
                (capture_end_us - total_start_us) / 1000.0f,
                (decode_end_us - capture_end_us) / 1000.0f,
                (preprocess_end_us - decode_end_us) / 1000.0f,
                (infer_end_us - infer_start_us) / 1000.0f,
                (infer_end_us - total_start_us) / 1000.0f,
                prediction.probabilities[0] * 100.0f,
                prediction.probabilities[1] * 100.0f,
                result.speciesId.c_str(), AI_CONFIDENCE_THRESHOLD * 100.0f);
  return result;
}
