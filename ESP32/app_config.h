#pragma once
#include <Arduino.h>

#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_ID "feeder-01"
#define DEVICE_ROOT "/devices/" DEVICE_ID

// V1 scope
#define ENABLE_CAMERA_V1 true
#define ENABLE_BUZZER true
#define ENABLE_FIREBASE true

// Servo geometry
constexpr int SERVO1_CLOSE_ANGLE = 0;
constexpr int SERVO1_OPEN_ANGLE  = 90;
constexpr int SERVO2_CLOSE_ANGLE = 0;
constexpr int SERVO2_OPEN_ANGLE  = 90;
constexpr int SERVO_MIN_US = 500;
constexpr int SERVO_MAX_US = 2400;

// Default portions if Firebase value/command is missing or invalid.
constexpr float DEFAULT_DOG_PORTION_G = 80.0f;
constexpr float DEFAULT_CAT_PORTION_G = 45.0f;

// Feeding safety
constexpr float STOP_EARLY_TOLERANCE_G = 2.0f;
constexpr float MIN_PROGRESS_G = 0.8f;
constexpr uint32_t NO_WEIGHT_PROGRESS_TIMEOUT_MS = 5000;
constexpr uint32_t FEEDING_TIMEOUT_MS = 20000;
constexpr uint32_t WEIGHT_SAMPLE_INTERVAL_MS = 120;
constexpr uint32_t SERVO_SETTLE_MS = 500;
constexpr uint32_t FOOD_SETTLE_MS = 800;

// Per-species default cooldown.
constexpr int DEFAULT_DOG_COOLDOWN_MIN = 10;
constexpr int DEFAULT_CAT_COOLDOWN_MIN = 10;

// Firebase polling / heartbeat
constexpr uint32_t COMMAND_POLL_INTERVAL_MS = 1200;
constexpr uint32_t HEARTBEAT_INTERVAL_MS = 10000;
constexpr uint32_t WIFI_RECONNECT_INTERVAL_MS = 5000;

// NTP - epoch timestamps are UTC seconds.
constexpr long GMT_OFFSET_SEC = 0;
constexpr int DAYLIGHT_OFFSET_SEC = 0;

// Calibration
constexpr float CALIBRATION_FACTOR_MIN_ABS = 1.0f;
constexpr uint8_t CALIBRATION_SAMPLES = 15;

// Diagnostics
constexpr uint32_t SERIAL_BAUD = 115200;
