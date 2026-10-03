#include "ai_interface.h"
#include "labels.h"
#include "app_config.h"
#include "esp_camera.h"
#include "img_converters.h"
#include "model.h"

// TensorFlow Lite for Microcontrollers headers
#include <TensorFlowLite_ESP32.h>
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_error_reporter.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"

#include <math.h>

namespace {
tflite::ErrorReporter *error_reporter = nullptr;
const tflite::Model *tflite_model = nullptr;
tflite::MicroInterpreter *interpreter = nullptr;
TfLiteTensor *input_tensor = nullptr;
TfLiteTensor *output_tensor = nullptr;

// Allocate tensor arena in PSRAM (Model requires ~1.5 - 2MB for Float32 activations)
constexpr int kTensorArenaSize = 2048 * 1024;
uint8_t *tensor_arena = nullptr;
bool ai_initialized = false;
} // namespace

bool aiBegin() {
  if (ai_initialized) return true;

  Serial.println("[AI] Initializing TensorFlow Lite Micro...");

  if (!psramFound()) {
    Serial.println("[AI][ERROR] PSRAM not found! Please set Tools -> PSRAM: 'OPI PSRAM' in Arduino IDE.");
    return false;
  }

  static tflite::MicroErrorReporter micro_error_reporter;
  error_reporter = &micro_error_reporter;

  tflite_model = tflite::GetModel(model_tflite);
  if (tflite_model->version() != TFLITE_SCHEMA_VERSION) {
    Serial.printf("[AI][ERROR] Model schema version %d != supported %d\n",
                  tflite_model->version(), TFLITE_SCHEMA_VERSION);
    return false;
  }

  tensor_arena = (uint8_t *)ps_malloc(kTensorArenaSize);
  if (tensor_arena) {
    Serial.printf("[AI] Allocated %d bytes (2 MB) tensor arena in PSRAM.\n", kTensorArenaSize);
  } else {
    Serial.println("[AI][ERROR] Failed to allocate 2MB tensor arena in PSRAM!");
    return false;
  }

  static tflite::AllOpsResolver resolver;

  static tflite::MicroInterpreter static_interpreter(
      tflite_model, resolver, tensor_arena, kTensorArenaSize, error_reporter);
  interpreter = &static_interpreter;

  TfLiteStatus allocate_status = interpreter->AllocateTensors();
  if (allocate_status != kTfLiteOk) {
    Serial.println("[AI][ERROR] AllocateTensors() failed!");
    return false;
  }

  input_tensor = interpreter->input(0);
  output_tensor = interpreter->output(0);

  if (!input_tensor || !output_tensor) {
    Serial.println("[AI][ERROR] Input or output tensor not found!");
    return false;
  }

  Serial.printf("[AI] Model loaded successfully.\n");
  Serial.printf("[AI] Input tensor: %d bytes, shape [%d, %d, %d, %d], type=%d\n",
                input_tensor->bytes,
                input_tensor->dims->data[0], input_tensor->dims->data[1],
                input_tensor->dims->data[2], input_tensor->dims->data[3],
                input_tensor->type);
  Serial.printf("[AI] Output tensor: %d bytes, shape [%d, %d], type=%d\n",
                output_tensor->bytes,
                output_tensor->dims->data[0], output_tensor->dims->data[1],
                output_tensor->type);

  ai_initialized = true;
  return true;
}

AIResult aiRunInference() {
  AIResult result;
  result.speciesId = "none";
  result.confidence = 0.0f;
  result.valid = false;

  if (!ai_initialized) {
    Serial.println("[AI][WARN] Inference requested before aiBegin().");
    return result;
  }

  // 1. Capture camera frame
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[AI][ERROR] Camera capture failed.");
    return result;
  }

  // 2. Decode frame into RGB888 buffer
  size_t rgb_size = fb->width * fb->height * 3;
  uint8_t *rgb_buf = nullptr;
  if (psramFound()) {
    rgb_buf = (uint8_t *)ps_malloc(rgb_size);
  }
  if (!rgb_buf) {
    rgb_buf = (uint8_t *)malloc(rgb_size);
  }

  if (!rgb_buf) {
    Serial.println("[AI][ERROR] Failed to allocate temporary RGB buffer.");
    esp_camera_fb_return(fb);
    return result;
  }

  bool decode_ok = fmt2rgb888(fb->buf, fb->len, fb->format, rgb_buf);
  uint16_t src_w = fb->width;
  uint16_t src_h = fb->height;
  esp_camera_fb_return(fb);

  if (!decode_ok) {
    Serial.println("[AI][ERROR] fmt2rgb888 conversion failed.");
    free(rgb_buf);
    return result;
  }

  // 3. Resize and normalize into input_tensor (128 x 128 x 3 FLOAT32 in range [0.0, 1.0])
  float *input_data = input_tensor->data.f;
  for (int y = 0; y < AI_INPUT_HEIGHT; ++y) {
    int src_y = (y * src_h) / AI_INPUT_HEIGHT;
    for (int x = 0; x < AI_INPUT_WIDTH; ++x) {
      int src_x = (x * src_w) / AI_INPUT_WIDTH;

      size_t src_idx = ((size_t)src_y * src_w + src_x) * 3;
      size_t dst_idx = ((size_t)y * AI_INPUT_WIDTH + x) * 3;

      input_data[dst_idx + 0] = (float)rgb_buf[src_idx + 0] / 255.0f; // R
      input_data[dst_idx + 1] = (float)rgb_buf[src_idx + 1] / 255.0f; // G
      input_data[dst_idx + 2] = (float)rgb_buf[src_idx + 2] / 255.0f; // B
    }
  }

  free(rgb_buf);

  // 4. Run model inference
  uint32_t t_start = millis();
  TfLiteStatus invoke_status = interpreter->Invoke();
  uint32_t t_inference = millis() - t_start;

  if (invoke_status != kTfLiteOk) {
    Serial.println("[AI][ERROR] Interpreter Invoke() failed.");
    return result;
  }

  // 5. Read output logits and apply Softmax
  float logit0 = output_tensor->data.f[0];
  float logit1 = output_tensor->data.f[1];

  float max_logit = fmaxf(logit0, logit1);
  float exp0 = expf(logit0 - max_logit);
  float exp1 = expf(logit1 - max_logit);
  float sum_exp = exp0 + exp1;

  float prob0 = exp0 / sum_exp; // Class 0 probability (cat)
  float prob1 = exp1 / sum_exp; // Class 1 probability (dog)

  float bestProb = fmaxf(prob0, prob1);
  String bestSpecies = (prob0 >= prob1) ? AI_CLASS_0 : AI_CLASS_1;

  result.valid = true;

  if (bestProb >= AI_CONFIDENCE_THRESHOLD) {
    result.speciesId = bestSpecies;
    result.confidence = bestProb;
    Serial.printf("[AI] Inference took %u ms | %s: %.1f%%, %s: %.1f%% -> DETECTED: %s (%.1f%%)\n",
                  t_inference,
                  AI_CLASS_0, prob0 * 100.0f,
                  AI_CLASS_1, prob1 * 100.0f,
                  bestSpecies.c_str(), bestProb * 100.0f);
  } else {
    result.speciesId = "none";
    result.confidence = bestProb;
    Serial.printf("[AI] Inference took %u ms | %s: %.1f%%, %s: %.1f%% -> NO PET (Noise below %.0f%%)\n",
                  t_inference,
                  AI_CLASS_0, prob0 * 100.0f,
                  AI_CLASS_1, prob1 * 100.0f,
                  AI_CONFIDENCE_THRESHOLD * 100.0f);
  }

  return result;
}
