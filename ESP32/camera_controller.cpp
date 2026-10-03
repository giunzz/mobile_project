#include "camera_controller.h"
#include "hardware_pins.h"
#include "app_config.h"
#include "esp_camera.h"
#include "esp_http_server.h"

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

#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

static httpd_handle_t stream_httpd = NULL;

static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t *_jpg_buf = NULL;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) return res;

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
      break;
    }
    _jpg_buf_len = fb->len;
    _jpg_buf = fb->buf;

    if (res == ESP_OK) {
      size_t hlen = snprintf(part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    esp_camera_fb_return(fb);
    fb = NULL;
    if (res != ESP_OK) break;
    vTaskDelay(pdMS_TO_TICKS(50)); // ~20 FPS smooth stream
  }
  return res;
}

static esp_err_t index_handler(httpd_req_t *req) {
  const char *html =
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>Pet Feeder Camera</title>"
    "<style>"
    "body{margin:0;background:#181818;color:#eee;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;}"
    "h2{margin:12px 0 6px 0;font-size:20px;}"
    "p{color:#aaa;margin:0 0 12px 0;font-size:14px;}"
    ".frame{position:relative;border:3px solid #00E676;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.6);display:inline-block;}"
    "img{display:block;max-width:92vw;max-height:70vh;}"
    ".target{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border:2px dashed rgba(255,255,255,0.7);width:160px;height:160px;border-radius:12px;pointer-events:none;}"
    "</style></head><body>"
    "<h2>AI Smart Pet Feeder - Camera Stream</h2>"
    "<p>Canh hinh anh meo/cho vao khung vuong o giua</p>"
    "<div class='frame'>"
    "<img src='/stream' />"
    "<div class='target'></div>"
    "</div>"
    "<p style='margin-top:12px;'>Mo Serial Monitor go <b>AITEST</b> de nhan dien ngay</p>"
    "</body></html>";

  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, html, strlen(html));
}

bool startCameraServer() {
#if !ENABLE_CAMERA_V1
  return false;
#else
  if (stream_httpd != NULL) return true;

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;

  httpd_uri_t index_uri = {
    .uri       = "/",
    .method    = HTTP_GET,
    .handler   = index_handler,
    .user_ctx  = NULL
  };

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&stream_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &index_uri);
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[CAM] Web stream server running on port 80.");
    return true;
  }
  Serial.println("[CAM][ERROR] Failed to start web stream server.");
  return false;
#endif
}
