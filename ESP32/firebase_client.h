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
void firebaseRecoverInterruptedCommand(
    const String &errorCode = "interrupted_by_restart");
bool firebaseSetCommandStatus(const String &requestId,
                              const String &status,
                              float actualGrams = -1.0f,
                              const String &errorCode = "none");
bool firebaseHasPendingCommand();

float firebaseGetPortionGrams(const String &speciesId, float fallback);
int firebaseGetCooldownMinutes(const String &speciesId, int fallback);
float firebaseGetDailyLimitGrams(const String &speciesId);
bool firebaseGetAutoFeedEnabled(const String &speciesId);
bool firebaseGetSchedulesJson(const String &speciesId, String &json);
bool firebaseGetTodayMeasuredGrams(const String &speciesId,
                                   uint64_t dayStartEpoch,
                                   float &grams);

bool firebaseGetCooldownUntil(const String &speciesId, uint64_t &epoch);
bool firebaseSetCooldownUntil(const String &speciesId, uint64_t epoch);

bool firebaseSetFeedingRuntime(const String &status,
                               const String &speciesId,
                               float targetGrams,
                               float actualGrams,
                               bool ledOn);

bool firebaseSetLatestDetection(const String &speciesId, float confidence);

bool firebasePushHistory(const String &requestId,
                         const String &speciesId,
                         const String &mode,
                         float targetGrams,
                         float actualGrams,
                         const String &result,
                         const String &errorCode);

void firebaseHeartbeat(const String &errorCode = "none");
uint64_t currentEpochSeconds();
