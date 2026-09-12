#include <Arduino.h>

#include "app_config.h"
#include "hardware_pins.h"
#include "camera_controller.h"
#include "servo_controller.h"
#include "feedback_controller.h"
#include "loadcell_controller.h"
#include "firebase_client.h"
#include "feeding_controller.h"

static uint32_t lastCommandPollMs = 0;
static uint32_t lastHeartbeatMs = 0;

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
  Serial.println("CAM                : Capture one diagnostic camera frame");
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

  Serial.printf("[BOOT] camera=%s servo=%s hx711=%s\n",
                cameraOk ? "OK" : "FAIL",
                servoOk ? "OK" : "FAIL",
                scaleOk ? "OK" : "FAIL");

  firebaseBegin();

  // Authentication may still be running asynchronously.
  uint32_t waitStart = millis();
  while (!firebaseReady() && millis() - waitStart < 10000) {
    firebaseLoop();
    delay(20);
  }

  if (firebaseReady()) {
    firebaseHeartbeat(
      (!cameraOk || !servoOk || !scaleOk) ? "boot_partial_failure" : "none");
    feedingControllerBegin();
    Serial.println("[FIREBASE] Ready.");
  } else {
    Serial.println("[FIREBASE][WARN] Not ready yet; loop will continue retrying.");
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

  uint32_t now = millis();

  if (firebaseReady() &&
      now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    firebaseHeartbeat("none");
  }

  if (firebaseReady() &&
      now - lastCommandPollMs >= COMMAND_POLL_INTERVAL_MS) {
    lastCommandPollMs = now;
    feedingControllerLoop();
  }

  delay(5);
}
