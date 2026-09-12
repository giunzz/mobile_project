#include "feeding_controller.h"
#include "app_config.h"
#include "servo_controller.h"
#include "loadcell_controller.h"
#include "feedback_controller.h"
#include "firebase_client.h"
#include <math.h>

static uint32_t lastDogFeedMs = 0;
static uint32_t lastCatFeedMs = 0;
static String lastProcessedRequestId = "";

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

static bool cooldownActive(const String &speciesId, int cooldownMinutes) {
  uint64_t nowEpoch = currentEpochSeconds();
  uint64_t untilEpoch = firebaseGetCooldownUntil(speciesId);

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
                        const String &mode) {
  servosCloseAll();
  feedingLed(false);
  beepError();

  firebaseSetFeedingRuntime("failed", speciesId, target, actual, false);
  firebaseSetCommandStatus("failed", actual, errorCode);
  firebasePushHistory(requestId, speciesId, mode,
                      target, actual, "failed", errorCode);

  Serial.printf("[FEED][FAILED] species=%s error=%s actual=%.2fg\n",
                speciesId.c_str(), errorCode.c_str(), actual);
}

void feedingControllerBegin() {
  firebaseSetFeedingRuntime("idle", "none", 0, 0, false);
}

bool feedSpecies(const String &speciesId,
                 float requestedTargetGrams,
                 const String &requestId,
                 const String &mode) {
  if (!validSpecies(speciesId)) {
    failCommand(speciesId, requestId, requestedTargetGrams,
                0, "unsupported_species", mode);
    return false;
  }

  FeederChannel feeder = feederForSpecies(speciesId);

  if (!loadCellCalibrated(feeder)) {
    failCommand(speciesId, requestId, requestedTargetGrams,
                0, "loadcell_not_calibrated", mode);
    return false;
  }

  float fallback = defaultPortion(speciesId);
  float target = requestedTargetGrams > 0.0f
                   ? requestedTargetGrams
                   : firebaseGetPortionGrams(speciesId, fallback);

  if (target <= 0.0f) target = fallback;

  int cooldownMin = firebaseGetCooldownMinutes(
      speciesId, defaultCooldown(speciesId));

  if (cooldownActive(speciesId, cooldownMin)) {
    failCommand(speciesId, requestId, target,
                0, "cooldown_active", mode);
    return false;
  }

  float initialWeight = loadCellReadGrams(feeder, 8);
  if (isnan(initialWeight)) {
    failCommand(speciesId, requestId, target,
                0, "loadcell_read_failed", mode);
    return false;
  }

  Serial.println();
  Serial.printf("[FEED] START species=%s target=%.2fg initial=%.2fg\n",
                speciesId.c_str(), target, initialWeight);

  firebaseSetCommandStatus("processing");
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
                actualDispensed, errorCode, mode);
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
  firebaseSetCommandStatus("completed", actualDispensed, "none");
  firebasePushHistory(requestId, speciesId, mode,
                      target, actualDispensed, "completed", "none");

  beepSuccess();

  Serial.printf("[FEED][DONE] species=%s actual=%.2fg cooldown=%d min\n",
                speciesId.c_str(), actualDispensed, cooldownMin);
  return true;
}

void feedingControllerLoop() {
  if (!firebaseReady()) return;

  FeedCommand cmd;
  if (!firebaseFetchPendingCommand(cmd)) return;

  if (cmd.requestId.length() > 0 &&
      cmd.requestId == lastProcessedRequestId) {
    return;
  }

  if (cmd.requestId.length() > 0) {
    lastProcessedRequestId = cmd.requestId;
  }

  feedSpecies(cmd.speciesId,
              cmd.targetGrams,
              cmd.requestId,
              "manual");
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
