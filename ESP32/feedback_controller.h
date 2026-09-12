#pragma once
#include <Arduino.h>

void feedbackBegin();
void feedingLed(bool on);
void beepSuccess();
void beepError();
void blinkError(uint8_t times = 3);
