#pragma once
#include <Arduino.h>
#include "servo_controller.h"

bool loadCellsBegin();

bool loadCellReady(FeederChannel feeder);
bool loadCellCalibrated(FeederChannel feeder);

float loadCellReadGrams(FeederChannel feeder, uint8_t samples = 5);
void loadCellTare(FeederChannel feeder);

bool loadCellCalibrate(FeederChannel feeder, float knownWeightGrams);
float loadCellGetCalibrationFactor(FeederChannel feeder);
void loadCellPrintCalibration();

void loadCellHandleSerialCommand(const String &line);
