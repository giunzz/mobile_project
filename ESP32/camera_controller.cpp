#include "camera_controller.h"
#include "hardware_pins.h"
#include "app_config.h"
#include "esp_camera.h"

bool cameraBegin() {
#if !ENABLE_CAMERA_V1
  Serial.println("[CAM] Disabled by configuration.");
  return true;
#else
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = CAM_PIN_Y2;
  config.pin_d1 = CAM_PIN_Y3;
  config.pin_d2 = CAM_PIN_Y4;
  config.pin_d3 = CAM_PIN_Y5;
  config.pin_d4 = CAM_PIN_Y6;
  config.pin_d5 = CAM_PIN_Y7;
  config.pin_d6 = CAM_PIN_Y8;
  config.pin_d7 = CAM_PIN_Y9;

  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_pclk = CAM_PIN_PCLK;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;

  // Reuse the verified camera-test settings.
  config.xclk_freq_hz = 10000000;
  config.frame_size = FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 12;
  config.fb_count = 2;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM][ERROR] esp_camera_init failed: 0x%x\n", err);
    return false;
  }

  Serial.println("[CAM] Camera initialized.");
  return true;
#endif
}

bool cameraCaptureDiagnostic() {
#if !ENABLE_CAMERA_V1
  return false;
#else
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM][ERROR] Capture failed.");
    return false;
  }

  Serial.printf("[CAM] Frame: %ux%u, %u bytes, format=%d\n",
                fb->width, fb->height, fb->len, fb->format);
  esp_camera_fb_return(fb);
  return true;
#endif
}
