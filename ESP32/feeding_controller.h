#pragma once
#include <Arduino.h>
#include "firebase_client.h"

void feedingControllerBegin();
void feedingControllerLoop();
void feedingScheduleLoop();

bool feedSpecies(const String &speciesId,
                 float requestedTargetGrams,
                 const String &requestId,
                 const String &mode);

void feedingControllerHandleSerialCommand(const String &line);
void feedingControllerResetCooldown();
