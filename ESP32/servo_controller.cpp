#include "servo_controller.h"
#include "hardware_pins.h"
#include "app_config.h"
#include <ESP32Servo.h>

static Servo servo1;
static Servo servo2;
static bool initialized = false;

bool servosBegin() {
  servo1.setPeriodHertz(50);
  servo2.setPeriodHertz(50);

  int ch1 = servo1.attach(SERVO1_PIN, SERVO_MIN_US, SERVO_MAX_US);
  int ch2 = servo2.attach(SERVO2_PIN, SERVO_MIN_US, SERVO_MAX_US);

  if (ch1 < 0 || ch2 < 0) {
    Serial.printf("[SERVO][ERROR] Attach failed. ch1=%d ch2=%d\n", ch1, ch2);
    initialized = false;
    return false;
  }

  initialized = true;
  servosCloseAll();
  delay(SERVO_SETTLE_MS);

  Serial.println("[SERVO] Servo 1/2 initialized and closed.");
  return true;
}

void servoOpen(FeederChannel feeder) {
  if (!initialized) return;
  if (feeder == FeederChannel::DOG) {
    servo1.write(SERVO1_OPEN_ANGLE);
    Serial.println("[SERVO1] OPEN (DOG)");
  } else {
    servo2.write(SERVO2_OPEN_ANGLE);
    Serial.println("[SERVO2] OPEN (CAT)");
  }
}

void servoClose(FeederChannel feeder) {
  if (!initialized) return;
  if (feeder == FeederChannel::DOG) {
    servo1.write(SERVO1_CLOSE_ANGLE);
    Serial.println("[SERVO1] CLOSE (DOG)");
  } else {
    servo2.write(SERVO2_CLOSE_ANGLE);
    Serial.println("[SERVO2] CLOSE (CAT)");
  }
}

void servosCloseAll() {
  if (!initialized) return;
  servo1.write(SERVO1_CLOSE_ANGLE);
  servo2.write(SERVO2_CLOSE_ANGLE);
}
