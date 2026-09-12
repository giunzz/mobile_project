#include "loadcell_controller.h"
#include "hardware_pins.h"
#include "app_config.h"
#include <HX711.h>
#include <Preferences.h>
#include <math.h>

static HX711 scale1;
static HX711 scale2;
static Preferences prefs;

static float factor1 = 0.0f;
static float factor2 = 0.0f;

static HX711 &scaleFor(FeederChannel feeder) {
  return (feeder == FeederChannel::DOG) ? scale1 : scale2;
}

static float &factorFor(FeederChannel feeder) {
  return (feeder == FeederChannel::DOG) ? factor1 : factor2;
}

static const char *factorKey(FeederChannel feeder) {
  return (feeder == FeederChannel::DOG) ? "hx1_factor" : "hx2_factor";
}

bool loadCellsBegin() {
  scale1.begin(HX1_DT_PIN, HX1_SCK_PIN);
  scale2.begin(HX2_DT_PIN, HX2_SCK_PIN);

  prefs.begin("petfeeder", false);
  factor1 = prefs.getFloat("hx1_factor", 0.0f);
  factor2 = prefs.getFloat("hx2_factor", 0.0f);

  if (fabsf(factor1) >= CALIBRATION_FACTOR_MIN_ABS) scale1.set_scale(factor1);
  else scale1.set_scale(1.0f);

  if (fabsf(factor2) >= CALIBRATION_FACTOR_MIN_ABS) scale2.set_scale(factor2);
  else scale2.set_scale(1.0f);

  bool ready1 = scale1.wait_ready_timeout(1500);
  bool ready2 = scale2.wait_ready_timeout(1500);

  if (ready1) {
    scale1.tare(15);
    Serial.println("[HX711-1] Ready and tared.");
  } else {
    Serial.println("[HX711-1][ERROR] Not ready.");
  }

  if (ready2) {
    scale2.tare(15);
    Serial.println("[HX711-2] Ready and tared.");
  } else {
    Serial.println("[HX711-2][ERROR] Not ready.");
  }

  loadCellPrintCalibration();

  if (!loadCellCalibrated(FeederChannel::DOG) ||
      !loadCellCalibrated(FeederChannel::CAT)) {
    Serial.println("[HX711][WARN] Calibration required before Feed Now is allowed.");
  }

  return ready1 && ready2;
}

bool loadCellReady(FeederChannel feeder) {
  return scaleFor(feeder).is_ready();
}

bool loadCellCalibrated(FeederChannel feeder) {
  return fabsf(factorFor(feeder)) >= CALIBRATION_FACTOR_MIN_ABS;
}

float loadCellReadGrams(FeederChannel feeder, uint8_t samples) {
  HX711 &scale = scaleFor(feeder);
  if (!scale.wait_ready_timeout(700)) return NAN;
  if (!loadCellCalibrated(feeder)) return NAN;
  return scale.get_units(samples);
}

void loadCellTare(FeederChannel feeder) {
  HX711 &scale = scaleFor(feeder);
  if (!scale.wait_ready_timeout(1200)) {
    Serial.println("[HX711][ERROR] Cannot tare: device not ready.");
    return;
  }
  scale.tare(15);
  Serial.printf("[HX711] Feeder %u tared.\n", (unsigned)feeder);
}

bool loadCellCalibrate(FeederChannel feeder, float knownWeightGrams) {
  if (knownWeightGrams <= 0.0f) {
    Serial.println("[CAL][ERROR] Known weight must be > 0 g.");
    return false;
  }

  HX711 &scale = scaleFor(feeder);
  if (!scale.wait_ready_timeout(1500)) {
    Serial.println("[CAL][ERROR] HX711 not ready.");
    return false;
  }

  // scale.get_value() = averaged raw reading - tare offset.
  long netRaw = scale.get_value(CALIBRATION_SAMPLES);
  float factor = (float)netRaw / knownWeightGrams;

  if (fabsf(factor) < CALIBRATION_FACTOR_MIN_ABS) {
    Serial.printf("[CAL][ERROR] Invalid factor calculated: %.6f\n", factor);
    return false;
  }

  factorFor(feeder) = factor;
  scale.set_scale(factor);
  prefs.putFloat(factorKey(feeder), factor);

  Serial.printf("[CAL] Feeder %u calibrated. Known=%.2fg, raw=%ld, factor=%.6f\n",
                (unsigned)feeder, knownWeightGrams, netRaw, factor);
  Serial.printf("[CAL] Verification reading: %.2f g\n", scale.get_units(10));
  return true;
}

float loadCellGetCalibrationFactor(FeederChannel feeder) {
  return factorFor(feeder);
}

void loadCellPrintCalibration() {
  Serial.printf("[CAL] HX711-1 DOG factor: %.6f (%s)\n",
                factor1, loadCellCalibrated(FeederChannel::DOG) ? "OK" : "NOT CALIBRATED");
  Serial.printf("[CAL] HX711-2 CAT factor: %.6f (%s)\n",
                factor2, loadCellCalibrated(FeederChannel::CAT) ? "OK" : "NOT CALIBRATED");
}

void loadCellHandleSerialCommand(const String &line) {
  if (line == "TARE1") {
    loadCellTare(FeederChannel::DOG);
  } else if (line == "TARE2") {
    loadCellTare(FeederChannel::CAT);
  } else if (line == "SHOWCAL") {
    loadCellPrintCalibration();
  } else if (line == "WEIGHT") {
    float w1 = loadCellReadGrams(FeederChannel::DOG, 5);
    float w2 = loadCellReadGrams(FeederChannel::CAT, 5);
    Serial.printf("[WEIGHT] DOG=%.2fg CAT=%.2fg\n", w1, w2);
  } else if (line.startsWith("CAL1 ")) {
    float known = line.substring(5).toFloat();
    loadCellCalibrate(FeederChannel::DOG, known);
  } else if (line.startsWith("CAL2 ")) {
    float known = line.substring(5).toFloat();
    loadCellCalibrate(FeederChannel::CAT, known);
  }
}
