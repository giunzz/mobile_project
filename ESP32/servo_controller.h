#pragma once
#include <Arduino.h>

enum class FeederChannel : uint8_t {
  DOG = 1,
  CAT = 2
};

bool servosBegin();
void servoOpen(FeederChannel feeder);
void servoClose(FeederChannel feeder);
void servosCloseAll();
