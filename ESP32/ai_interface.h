#pragma once
#include <Arduino.h>
struct AIResult {
  String speciesId;
  float confidence;
  bool valid;
};
// Allocate the pure-C float32 model workspace in PSRAM.
bool aiBegin();
// Capture/decode image, then preprocess and infer with the C model.
// Returns "none" when confidence is below AI_CONFIDENCE_THRESHOLD.
AIResult aiRunInference();
