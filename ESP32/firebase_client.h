#pragma once
#include <Arduino.h>

struct FeedCommand {
  String requestId;
  String type;
  String speciesId;
  float targetGrams = 0.0f;
  String status;
  uint64_t requestedAtEpoch = 0;
};

bool firebaseBegin();
void firebaseLoop();
bool firebaseReady();

bool firebaseFetchPendingCommand(FeedCommand &cmd);
bool firebaseSetCommandStatus(const String &status,
                              float actualGrams = -1.0f,
                              const String &errorCode = "none");

float firebaseGetPortionGrams(const String &speciesId, float fallback);
int firebaseGetCooldownMinutes(const String &speciesId, int fallback);

uint64_t firebaseGetCooldownUntil(const String &speciesId);
bool firebaseSetCooldownUntil(const String &speciesId, uint64_t epoch);

bool firebaseSetFeedingRuntime(const String &status,
                               const String &speciesId,
                               float targetGrams,
                               float actualGrams,
                               bool ledOn);

bool firebasePushHistory(const String &requestId,
                         const String &speciesId,
                         const String &mode,
                         float targetGrams,
                         float actualGrams,
                         const String &result,
                         const String &errorCode);

void firebaseHeartbeat(const String &errorCode = "none");
uint64_t currentEpochSeconds();
