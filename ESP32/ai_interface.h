#pragma once
#include <Arduino.h>

struct AIResult {
  String speciesId;   // "dog", "cat", "none"
  float confidence;   // 0.0 ~ 1.0
  bool valid;
};

// Initializes the TFLite Micro model and allocates tensor arena in PSRAM
bool aiBegin();

// Captures a frame from the camera, preprocesses it to 128x128 RGB float,
// executes model inference, and returns the classification result.
AIResult aiRunInference();
