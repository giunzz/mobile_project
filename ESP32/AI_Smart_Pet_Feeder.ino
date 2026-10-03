#include <Arduino.h>
#include <TensorFlowLite_ESP32.h>
#include <WiFi.h>

#include "app_config.h"
#include "hardware_pins.h"
#include "camera_controller.h"
#include "servo_controller.h"
#include "feedback_controller.h"
#include "loadcell_controller.h"
#include "firebase_client.h"
#include "feeding_controller.h"
#include "ai_interface.h"

static uint32_t lastCommandPollMs = 0;
static uint32_t lastHeartbeatMs = 0;
static uint32_t lastAiScanMs = 0;
static uint32_t lastSchedulePollMs = 0;
static bool firebaseRuntimeInitialized = false;
static const char *bootErrorCode = "none";

static void printConsoleHelp() {
  Serial.println();
  Serial.println("================ SERIAL COMMANDS ================");
  Serial.println("HELP               : Show this help");
  Serial.println("TARE1              : Tare DOG load cell");
  Serial.println("TARE2              : Tare CAT load cell");
  Serial.println("CAL1 <grams>       : Calibrate DOG load cell");
  Serial.println("CAL2 <grams>       : Calibrate CAT load cell");
  Serial.println("SHOWCAL            : Show saved calibration factors");
  Serial.println("WEIGHT             : Read both load cells in grams");
  Serial.println("TESTDOG <grams>    : Test DOG feeder (cooldown applies)");
  Serial.println("TESTCAT <grams>    : Test CAT feeder (cooldown applies)");
  Serial.println("RESETCOOLDOWN      : Clear feeding cooldowns for DOG and CAT");
  Serial.println("CAM                : Capture one diagnostic camera frame");
  Serial.println("AITEST             : Trigger AI inference test now");
  Serial.println("=================================================");
  Serial.println();
}

static void handleSerialConsole() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\n');
  line.trim();
  line.toUpperCase();

  if (line.length() == 0) return;

  if (line == "HELP") {
    printConsoleHelp();
  } else if (line == "CAM") {
    cameraCaptureDiagnostic();
  } else if (line == "AITEST") {
    Serial.println("[CLI] Running manual AI inference...");
    AIResult res = aiRunInference();
    Serial.printf("[CLI] Result: species=%s, confidence=%.2f, valid=%s\n",
                  res.speciesId.c_str(), res.confidence, res.valid ? "YES" : "NO");
    if (res.valid && firebaseReady()) {
      firebaseSetLatestDetection(res.speciesId, (res.speciesId == "none") ? 0.0f : res.confidence);
    }
  } else if (line == "RESETCOOLDOWN") {
    feedingControllerResetCooldown();
  } else if (line == "TARE1" || line == "TARE2" ||
             line == "SHOWCAL" || line == "WEIGHT" ||
             line.startsWith("CAL1 ") ||
             line.startsWith("CAL2 ")) {
    loadCellHandleSerialCommand(line);
  } else if (line.startsWith("TESTDOG ") ||
             line.startsWith("TESTCAT ")) {
    feedingControllerHandleSerialCommand(line);
  } else {
    Serial.printf("[CLI] Unknown command: %s\n", line.c_str());
    printConsoleHelp();
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);

  Serial.println();
  Serial.println("=================================================");
  Serial.println(" AI SMART PET FEEDER - Firmware V1");
  Serial.printf(" Version: %s\n", FIRMWARE_VERSION);
  Serial.println(" Device : " DEVICE_ID);
  Serial.println("=================================================");

  feedbackBegin();

  bool cameraOk = cameraBegin();
  bool servoOk = servosBegin();
  bool scaleOk = loadCellsBegin();
  if (!cameraOk || !servoOk || !scaleOk) {
    bootErrorCode = "boot_partial_failure";
  }

  Serial.printf("[BOOT] camera=%s servo=%s hx711=%s\n",
                cameraOk ? "OK" : "FAIL",
                servoOk ? "OK" : "FAIL",
                scaleOk ? "OK" : "FAIL");

#if ENABLE_AI
  bool aiOk = aiBegin();
  Serial.printf("[BOOT] ai=%s\n", aiOk ? "OK" : "FAIL");
#endif

  firebaseBegin();

  // Authentication may still be running asynchronously.
  uint32_t waitStart = millis();
  while (!firebaseReady() && millis() - waitStart < 10000) {
    firebaseLoop();
    delay(20);
  }

  if (firebaseReady()) {
    firebaseHeartbeat(bootErrorCode);
    firebaseRecoverInterruptedCommand();
    feedingControllerBegin();
    firebaseSetLatestDetection("none", 0.0f);
    firebaseRuntimeInitialized = true;
    Serial.println("[FIREBASE] Ready.");
  } else {
    Serial.println("[FIREBASE][WARN] Not ready yet; loop will continue retrying.");
  }

  startCameraServer();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.printf("[CAM] >>> LIVE CAMERA STREAM: http://%s/ <<<\n", WiFi.localIP().toString().c_str());
    Serial.printf("[CAM] >>> Direct Stream URL : http://%s/stream <<<\n", WiFi.localIP().toString().c_str());
    Serial.println();
  }

  printConsoleHelp();

  if (!loadCellCalibrated(FeederChannel::DOG) ||
      !loadCellCalibrated(FeederChannel::CAT)) {
    Serial.println("[ACTION REQUIRED] Calibrate both load cells before feeding.");
    Serial.println("Example:");
    Serial.println("  1) Remove test weight -> TARE1");
    Serial.println("  2) Put 100g known weight -> CAL1 100");
    Serial.println("  3) Repeat for channel 2.");
  }
}

void loop() {
  firebaseLoop();
  handleSerialConsole();

  if (firebaseReady() && !firebaseRuntimeInitialized) {
    firebaseHeartbeat(bootErrorCode);
    firebaseRecoverInterruptedCommand();
    feedingControllerBegin();
    firebaseSetLatestDetection("none", 0.0f);
    firebaseRuntimeInitialized = true;
  }

  uint32_t now = millis();

  if (firebaseReady() &&
      now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    firebaseHeartbeat(bootErrorCode);
  }

  if (firebaseReady() &&
      now - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs = now;
    feedingControllerLoop();
  }

  if (firebaseReady() &&
      now - lastSchedulePollMs >= SCHEDULE_POLL_INTERVAL_MS) {
    lastSchedulePollMs = now;
    feedingScheduleLoop();
  }

#if ENABLE_AI
  if (now - lastAiScanMs >= AI_SCAN_INTERVAL_MS) {
    lastAiScanMs = now;
    AIResult aiRes = aiRunInference();

    static String pendingSpecies = "none";
    static int consecutiveHits = 0;
    static String lastReportedSpecies = "none";

    if (aiRes.valid && aiRes.speciesId != "none") {
      if (aiRes.speciesId == pendingSpecies) {
        consecutiveHits++;
      } else {
        pendingSpecies = aiRes.speciesId;
        consecutiveHits = 1;
      }

      Serial.printf("[AI] Candidate %s (%.1f%%) | Confirmation: %d/%d\n",
                    aiRes.speciesId.c_str(), aiRes.confidence * 100.0f,
                    consecutiveHits, AI_CONSECUTIVE_CONFIRMATIONS);

      if (consecutiveHits >= AI_CONSECUTIVE_CONFIRMATIONS) {
        Serial.printf("[AI] >>> CONFIRMED %s! Triggering automatic feed <<<\n",
                      aiRes.speciesId.c_str());
        consecutiveHits = 0;
        pendingSpecies = "none";

        if (firebaseReady()) {
          firebaseSetLatestDetection(aiRes.speciesId, aiRes.confidence);
          lastReportedSpecies = aiRes.speciesId;
        }

        if (firebaseGetAutoFeedEnabled(aiRes.speciesId)) {
          feedSpecies(aiRes.speciesId, 0.0f,
                      "ai-" + String(currentEpochSeconds()) +
                          "-" + String(millis()),
                      "automatic");
        }
      }
    } else {
      if (consecutiveHits > 0) {
        Serial.println("[AI] Candidate lost or below threshold. Confirmation reset.");
      }
      consecutiveHits = 0;
      pendingSpecies = "none";

      // Reset Firebase to 'none' once when frame is empty
      if (lastReportedSpecies != "none" && firebaseReady()) {
        firebaseSetLatestDetection("none", 0.0f);
        lastReportedSpecies = "none";
      }
    }
  }
#endif

  delay(5);
}
