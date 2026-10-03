#include "feeding_controller.h"
#include "app_config.h"
#include "servo_controller.h"
#include "loadcell_controller.h"
#include "feedback_controller.h"
#include "firebase_client.h"
#include "contract_logic.h"
#include <Preferences.h>
#include <math.h>

static uint32_t lastDogFeedMs = 0;
static uint32_t lastCatFeedMs = 0;

static bool rememberManualRequest(const String &requestId) {
  Preferences preferences;
  if (!preferences.begin("feeder-cmd", false)) return false;
  const size_t written = preferences.putString("last-id", requestId);
  preferences.end();
  return written == requestId.length();
}

static String lastManualRequest() {
  Preferences preferences;
  if (!preferences.begin("feeder-cmd", true)) return "";
  String id = preferences.getString("last-id", "");
  preferences.end();
  return id;
}

static String scheduleStorageKey(const String &speciesId, const char *id) {
  // NVS keys are limited to 15 characters. A 64-bit hash keeps the dynamic
  // Firebase schedule ID stable across restarts without truncating it.
  uint64_t hash = 14695981039346656037ULL;
  const String full = speciesId + "/" + String(id);
  for (size_t i = 0; i < full.length(); ++i) {
    hash ^= static_cast<uint8_t>(full[i]);
    hash *= 1099511628211ULL;
  }
  char key[15];
  key[0] = 's';
  for (int i = 13; i > 0; --i) {
    const uint8_t digit = hash % 36;
    key[i] = digit < 10 ? '0' + digit : 'a' + digit - 10;
    hash /= 36;
  }
  key[14] = '\0';
  return String(key);
}

static bool claimScheduleForDay(const String &speciesId,
                                const char *scheduleId,
                                uint32_t localDay) {
  Preferences preferences;
  if (!preferences.begin("feeder-sched", false)) return false;
  const String key = scheduleStorageKey(speciesId, scheduleId);
  if (preferences.getUInt(key.c_str(), 0) == localDay) {
    preferences.end();
    return false;
  }
  const size_t written = preferences.putUInt(key.c_str(), localDay);
  preferences.end();
  return written == sizeof(uint32_t);
}

static FeederChannel feederForSpecies(const String &speciesId) {
  return (speciesId == "dog") ? FeederChannel::DOG : FeederChannel::CAT;
}

static bool validSpecies(const String &speciesId) {
  return speciesId == "dog" || speciesId == "cat";
}

static float defaultPortion(const String &speciesId) {
  return (speciesId == "dog") ? DEFAULT_DOG_PORTION_G : DEFAULT_CAT_PORTION_G;
}

static int defaultCooldown(const String &speciesId) {
  return (speciesId == "dog") ? DEFAULT_DOG_COOLDOWN_MIN : DEFAULT_CAT_COOLDOWN_MIN;
}

static uint32_t &lastFeedMsFor(const String &speciesId) {
  return (speciesId == "dog") ? lastDogFeedMs : lastCatFeedMs;
}

static bool cooldownActive(const String &speciesId, int cooldownMinutes,
                           bool &available) {
  uint64_t nowEpoch = currentEpochSeconds();
  uint64_t untilEpoch = 0;
  available = firebaseGetCooldownUntil(speciesId, untilEpoch);
  if (!available) return true;

  if (nowEpoch > 0 && untilEpoch > nowEpoch) {
    Serial.printf("[FEED] %s cooldown active for %llu more seconds.\n",
                  speciesId.c_str(),
                  (unsigned long long)(untilEpoch - nowEpoch));
    return true;
  }

  uint32_t lastMs = lastFeedMsFor(speciesId);
  if (lastMs != 0 && cooldownMinutes > 0) {
    uint32_t cooldownMs = (uint32_t)cooldownMinutes * 60UL * 1000UL;
    if ((uint32_t)(millis() - lastMs) < cooldownMs) {
      Serial.printf("[FEED] %s local cooldown active.\n", speciesId.c_str());
      return true;
    }
  }

  return false;
}

static void failCommand(const String &speciesId,
                        const String &requestId,
                        float target,
                        float actual,
                        const String &errorCode,
                        const String &mode,
                        int cooldownMin = 0) {
  servosCloseAll();
  feedingLed(false);
  beepError();

  // Safety cooldown to prevent infinite retry loops on empty hopper or bench test
  if (cooldownMin > 0 && validSpecies(speciesId)) {
    lastFeedMsFor(speciesId) = millis();
    uint64_t nowEpoch = currentEpochSeconds();
    int failCooldownMin = max(1, min(cooldownMin, 2)); // 1-2 minutes safety cooldown
    uint64_t cooldownUntil =
        nowEpoch > 0 ? nowEpoch + (uint64_t)failCooldownMin * 60ULL : 0;
    firebaseSetCooldownUntil(speciesId, cooldownUntil);
    Serial.printf("[FEED] Safety cooldown of %d min applied to prevent infinite feeding loop.\n", failCooldownMin);
  }

  firebaseSetFeedingRuntime("failed", speciesId, target, actual, false);
  if (mode == "manual") {
    firebaseSetCommandStatus(requestId, "failed", actual, errorCode);
  }
  firebasePushHistory(requestId, speciesId, mode,
                      target, actual, "failed", errorCode);

  Serial.printf("[FEED][FAILED] species=%s error=%s actual=%.2fg\n",
                speciesId.c_str(), errorCode.c_str(), actual);
}

static void rejectBeforeFeeding(const String &speciesId,
                                const String &requestId,
                                float target,
                                const String &errorCode,
                                const String &mode) {
  // AI can retry every scan. A skipped automatic attempt dispenses nothing,
  // so keep it out of measured history and avoid repeated error beeps.
  if (mode == "automatic") {
    Serial.printf("[FEED][SKIP] species=%s error=%s\n",
                  speciesId.c_str(), errorCode.c_str());
    return;
  }
  failCommand(speciesId, requestId, target, 0, errorCode, mode);
}

void feedingControllerBegin() {
  firebaseSetFeedingRuntime("idle", "none", 0, 0, false);
}

bool feedSpecies(const String &speciesId,
                 float requestedTargetGrams,
                 const String &requestId,
                 const String &mode) {
  if (!validSpecies(speciesId)) {
    rejectBeforeFeeding(speciesId, requestId, requestedTargetGrams,
                        "unsupported_species", mode);
    return false;
  }

  if (mode == "automatic" &&
      (!firebaseGetAutoFeedEnabled(speciesId) ||
       firebaseHasPendingCommand())) {
    return false;
  }

  FeederChannel feeder = feederForSpecies(speciesId);

  if (!loadCellCalibrated(feeder)) {
    rejectBeforeFeeding(speciesId, requestId, requestedTargetGrams,
                        "loadcell_not_calibrated", mode);
    return false;
  }

  float fallback = defaultPortion(speciesId);
  float target = requestedTargetGrams > 0.0f
                   ? requestedTargetGrams
                   : firebaseGetPortionGrams(speciesId, fallback);

  if (target <= 0.0f) target = fallback;

  int cooldownMin = firebaseGetCooldownMinutes(
      speciesId, defaultCooldown(speciesId));
  bool cooldownAvailable = false;
  if (cooldownActive(speciesId, cooldownMin, cooldownAvailable)) {
    if (mode == "automatic") return false;
    rejectBeforeFeeding(speciesId, requestId, target,
                        cooldownAvailable ? "cooldown_active" :
                                            "cooldown_unavailable", mode);
    return false;
  }

  const uint64_t requestEpoch = currentEpochSeconds();
  if (requestEpoch == 0) {
    rejectBeforeFeeding(speciesId, requestId, target,
                        "clock_unavailable", mode);
    return false;
  }

  const float dailyLimit = firebaseGetDailyLimitGrams(speciesId);
  float measuredToday = 0.0f;
  const uint64_t dayStart = contractDayStartEpoch(
      requestEpoch, FEEDING_UTC_OFFSET_SEC);
  if (dailyLimit <= 0.0f ||
      !firebaseGetTodayMeasuredGrams(speciesId, dayStart, measuredToday)) {
    rejectBeforeFeeding(speciesId, requestId, target,
                        "daily_history_unavailable", mode);
    return false;
  }
  if (target + measuredToday > dailyLimit + 0.001f) {
    rejectBeforeFeeding(speciesId, requestId, target,
                        "daily_limit_exceeded", mode);
    return false;
  }

  float initialWeight = loadCellReadGrams(feeder, 8);
  if (isnan(initialWeight)) {
    rejectBeforeFeeding(speciesId, requestId, target,
                        "loadcell_read_failed", mode);
    return false;
  }

  Serial.println();
  Serial.printf("[FEED] START species=%s target=%.2fg initial=%.2fg\n",
                speciesId.c_str(), target, initialWeight);

  if (mode == "manual" &&
      !firebaseSetCommandStatus(requestId, "processing")) {
    Serial.println("[FEED][ERROR] Could not acknowledge manual request; servo remains closed.");
    return false;
  }
  firebaseSetFeedingRuntime("feeding", speciesId, target, 0, true);

  feedingLed(true);
  servoOpen(feeder);
  delay(SERVO_SETTLE_MS);

  uint32_t startMs = millis();
  uint32_t lastSampleMs = 0;
  uint32_t lastProgressMs = millis();

  float bestDispensed = 0.0f;
  float actualDispensed = 0.0f;

  const float stopThreshold =
      max(0.0f, target - STOP_EARLY_TOLERANCE_G);

  bool success = false;
  String errorCode = "none";

  while (true) {
    firebaseLoop();

    uint32_t nowMs = millis();

    if (nowMs - startMs >= FEEDING_TIMEOUT_MS) {
      errorCode = "feeding_timeout";
      break;
    }

    if (nowMs - lastSampleMs < WEIGHT_SAMPLE_INTERVAL_MS) {
      delay(5);
      continue;
    }
    lastSampleMs = nowMs;

    float currentWeight = loadCellReadGrams(feeder, 3);
    if (isnan(currentWeight)) {
      errorCode = "loadcell_read_failed";
      break;
    }

    actualDispensed = currentWeight - initialWeight;
    if (actualDispensed < 0.0f) actualDispensed = 0.0f;

    Serial.printf("[FEED] %s %.2f / %.2f g\n",
                  speciesId.c_str(), actualDispensed, target);

    firebaseSetFeedingRuntime(
        "feeding", speciesId, target, actualDispensed, true);

    if (actualDispensed >= stopThreshold) {
      success = true;
      break;
    }

    if (actualDispensed >= bestDispensed + MIN_PROGRESS_G) {
      bestDispensed = actualDispensed;
      lastProgressMs = nowMs;
    } else if (nowMs - lastProgressMs >= NO_WEIGHT_PROGRESS_TIMEOUT_MS) {
      errorCode = "no_weight_progress";
      break;
    }
  }

  servoClose(feeder);
  delay(FOOD_SETTLE_MS);
  feedingLed(false);

  // Final measurement captures pellets that fall after the gate closes.
  float finalWeight = loadCellReadGrams(feeder, 6);
  if (!isnan(finalWeight)) {
    actualDispensed = max(0.0f, finalWeight - initialWeight);
  }

  if (!success) {
    failCommand(speciesId, requestId, target,
                actualDispensed, errorCode, mode, cooldownMin);
    return false;
  }

  uint32_t nowMs = millis();
  lastFeedMsFor(speciesId) = nowMs;

  uint64_t nowEpoch = currentEpochSeconds();
  uint64_t cooldownUntil =
      nowEpoch > 0 ? nowEpoch + (uint64_t)cooldownMin * 60ULL : 0;
  firebaseSetCooldownUntil(speciesId, cooldownUntil);

  firebaseSetFeedingRuntime(
      "completed", speciesId, target, actualDispensed, false);
  if (mode == "manual") {
    firebaseSetCommandStatus(requestId, "completed", actualDispensed, "none");
  }
  firebasePushHistory(requestId, speciesId, mode,
                      target, actualDispensed, "completed", "none");

  beepSuccess();

  Serial.printf("[FEED][DONE] species=%s actual=%.2fg cooldown=%d min\n",
                speciesId.c_str(), actualDispensed, cooldownMin);
  return true;
}

void feedingControllerLoop() {
  if (!firebaseReady()) return;

  // The loop is blocked while the servo is active. Any processing command
  // seen here has lost its final acknowledgement and must not be replayed.
  firebaseRecoverInterruptedCommand("completion_unconfirmed");

  FeedCommand cmd;
  if (!firebaseFetchPendingCommand(cmd)) return;

  if (cmd.requestId.length() == 0) {
    Serial.println("[FEED][WARN] Pending command has no requestId.");
    return;
  }
  const uint64_t nowEpoch = currentEpochSeconds();
  if (!contractCommandIsFresh(cmd.requestedAtEpoch, nowEpoch,
                              COMMAND_MAX_AGE_SEC,
                              COMMAND_FUTURE_TOLERANCE_SEC)) {
    firebaseSetCommandStatus(cmd.requestId, "failed", 0,
                             "command_expired");
    return;
  }
  if (cmd.requestId == lastManualRequest()) {
    firebaseSetCommandStatus(cmd.requestId, "failed", 0,
                             "duplicate_request");
    return;
  }
  if (!rememberManualRequest(cmd.requestId)) {
    firebaseSetCommandStatus(cmd.requestId, "failed", 0,
                             "request_storage_unavailable");
    return;
  }

  feedSpecies(cmd.speciesId,
              cmd.targetGrams,
              cmd.requestId,
              "manual");
}

void feedingScheduleLoop() {
  if (!firebaseReady() || firebaseHasPendingCommand()) return;
  const uint64_t nowEpoch = currentEpochSeconds();
  if (nowEpoch == 0) return;
  const uint64_t localEpoch = nowEpoch + FEEDING_UTC_OFFSET_SEC;
  const int minuteOfDay = static_cast<int>((localEpoch % 86400) / 60);
  const uint32_t localDay = static_cast<uint32_t>(localEpoch / 86400);

  const char *species[] = {"dog", "cat"};
  for (const char *name : species) {
    const String speciesId(name);
    if (!firebaseGetAutoFeedEnabled(speciesId)) continue;
    String json;
    if (!firebaseGetSchedulesJson(speciesId, json)) continue;
    static ContractSchedule schedules[MAX_SCHEDULES_PER_SPECIES];
    size_t count = 0;
    if (!parseContractSchedules(json.c_str(), schedules,
                                MAX_SCHEDULES_PER_SPECIES, count)) {
      Serial.printf("[SCHEDULE][ERROR] Invalid or excessive %s schedules.\n", name);
      continue;
    }
    for (size_t i = 0; i < count; ++i) {
      const ContractSchedule &schedule = schedules[i];
      if (!schedule.enabled || schedule.minuteOfDay != minuteOfDay) continue;
      if (firebaseHasPendingCommand()) return;
      if (!claimScheduleForDay(speciesId, schedule.id, localDay)) continue;
      Serial.printf("[SCHEDULE] Running %s/%s at UTC+7 minute %d.\n",
                    name, schedule.id, minuteOfDay);
      feedSpecies(speciesId, static_cast<float>(schedule.portionGrams),
                  "schedule-" + speciesId + "-" + schedule.id +
                      "-" + String(localDay),
                  "automatic");
    }
  }
}

void feedingControllerHandleSerialCommand(const String &line) {
  if (line.startsWith("TESTDOG ")) {
    float grams = line.substring(8).toFloat();
    feedSpecies("dog", grams,
                "serial-" + String(millis()),
                "serial");
  } else if (line.startsWith("TESTCAT ")) {
    float grams = line.substring(8).toFloat();
    feedSpecies("cat", grams,
                "serial-" + String(millis()),
                "serial");
  }
}

void feedingControllerResetCooldown() {
  lastDogFeedMs = 0;
  lastCatFeedMs = 0;
  if (firebaseReady()) {
    firebaseSetCooldownUntil("dog", 0);
    firebaseSetCooldownUntil("cat", 0);
  }
  Serial.println("[FEED] Both DOG and CAT cooldowns reset.");
}
