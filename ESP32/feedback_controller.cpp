#include "feedback_controller.h"
#include "hardware_pins.h"
#include "app_config.h"

void feedbackBegin() {
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}

void feedingLed(bool on) {
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

void beepSuccess() {
#if ENABLE_BUZZER
  tone(BUZZER_PIN, 2200);
  delay(120);
  noTone(BUZZER_PIN);
#endif
}

void beepError() {
#if ENABLE_BUZZER
  for (int i = 0; i < 3; ++i) {
    tone(BUZZER_PIN, 1200);
    delay(100);
    noTone(BUZZER_PIN);
    delay(100);
  }
#endif
}

void blinkError(uint8_t times) {
  for (uint8_t i = 0; i < times; ++i) {
    digitalWrite(LED_PIN, HIGH);
    delay(120);
    digitalWrite(LED_PIN, LOW);
    delay(120);
  }
}
