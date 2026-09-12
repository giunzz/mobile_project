# Hướng dẫn tích hợp AI vào Firmware – AI Smart Pet Feeder

## 1. Mục tiêu

Phần AI chỉ chịu trách nhiệm:

```text
Camera frame
    ↓
Pre-process
    ↓
AI inference
    ↓
speciesId + confidence
```

Kết quả AI phải trả về một trong các giá trị:

```text
dog
cat
none
```

AI **không điều khiển trực tiếp Servo, Load Cell, LED, Buzzer hoặc Firebase feeding logic**.

Firmware hiện tại tiếp tục xử lý:

```text
speciesId
   ↓
Cooldown check
   ↓
Đọc feeding profile
   ↓
Servo
   ↓
Load Cell
   ↓
LED / Buzzer
   ↓
Firebase status + history
```

## 2. Cấu trúc firmware hiện tại

Giữ nguyên các module hiện có, chỉ thêm module AI:

```text
AI_Smart_Pet_Feeder_Firmware/
│
├── AI_Smart_Pet_Feeder.ino
├── app_config.h
├── hardware_pins.h
├── camera_controller.*
├── servo_controller.*
├── loadcell_controller.*
├── feeding_controller.*
├── firebase_client.*
├── feedback_controller.*
│
└── AI/
    ├── ai_interface.h
    ├── ai_interface.cpp
    ├── model_data.h
    ├── model_data.cpp
    └── labels.h
```

Không sửa lại logic Servo/Load Cell/Firebase nếu không cần thiết.

## 3. API bắt buộc giữa AI và Firmware

### `ai_interface.h`

```cpp
#pragma once
#include <Arduino.h>

struct AIResult {
    String speciesId;   // "dog", "cat", "none"
    float confidence;   // 0.0 ~ 1.0
    bool valid;
};

bool aiBegin();
AIResult aiRunInference();
```

Firmware chỉ cần gọi hai API trên.

## 4. Trình tự triển khai AI

### Bước 1 – Đưa model vào firmware

```text
model.tflite
    ↓
model_data.h
model_data.cpp
```

Ưu tiên model nhỏ, INT8, phù hợp ESP32-S3 + OPI PSRAM.

### Bước 2 – Khởi tạo AI

Trong `aiBegin()`:

```text
Load model
↓
Allocate tensor arena / buffer
↓
Init interpreter/runtime
↓
Check input/output tensor
↓
Return true nếu thành công
```

Nếu init AI lỗi thì `return false`, không được làm firmware crash.

### Bước 3 – Capture ảnh

Dùng camera đã có sẵn:

```cpp
camera_fb_t *fb = esp_camera_fb_get();
```

Không init camera lần thứ hai.

Sau khi xử lý xong:

```cpp
esp_camera_fb_return(fb);
```

### Bước 4 – Pre-process

```text
Camera frame
   ↓
Decode/convert
   ↓
Resize đúng input size
   ↓
Normalize / Quantize
   ↓
Copy vào input tensor
```

Ví dụ nếu model input là:

```text
96 x 96 x 3 INT8
```

thì preprocessing phải đúng kích thước và kiểu dữ liệu này.

### Bước 5 – Run inference

Trong `aiRunInference()`:

```text
Capture
↓
Pre-process
↓
Run model
↓
Parse output
↓
Return AIResult
```

Ví dụ:

```cpp
AIResult result;

result.speciesId = "dog";
result.confidence = 0.93;
result.valid = true;

return result;
```

Nếu inference lỗi hoặc không chắc chắn:

```cpp
result.speciesId = "none";
result.confidence = 0;
result.valid = false;
```

## 5. Confidence threshold

Thêm ngưỡng, ví dụ:

```cpp
constexpr float AI_CONFIDENCE_THRESHOLD = 0.80f;
```

Chỉ chấp nhận khi:

```text
confidence >= 0.80
```

Ví dụ:

```text
DOG = 0.94 → Accept
DOG = 0.58 → Reject
```

Nếu reject:

```text
speciesId = none
Không gọi feeding controller
```

## 6. Tích hợp vào firmware chính

Trong `setup()`:

```cpp
bool aiOk = aiBegin();
```

Trong `loop()` hoặc auto-mode:

```cpp
AIResult result = aiRunInference();

if (result.valid &&
    result.confidence >= AI_CONFIDENCE_THRESHOLD) {

    feedSpecies(
        result.speciesId,
        0,
        "ai-" + String(millis()),
        "automatic"
    );
}
```

`targetGrams = 0` nghĩa là:

```text
Firmware đọc portion từ Firebase
↓
Nếu Firebase không có
↓
Dùng default
```

Default hiện tại:

```text
DOG = 80 g
CAT = 45 g
```

## 7. Mapping hardware hiện tại

Không thay đổi mapping:

```text
DOG
 ↓
Servo 1 - GPIO 42
Load Cell 1 - DT GPIO1 / SCK GPIO2

CAT
 ↓
Servo 2 - GPIO 41
Load Cell 2 - DT GPIO39 / SCK GPIO40
```

AI chỉ trả `dog` hoặc `cat`.

## 8. Cooldown vẫn do firmware xử lý

Ví dụ:

```text
09:00 DOG detected
→ feed DOG
→ DOG cooldown 10 phút

09:02 DOG detected
→ AI vẫn trả DOG
→ feeding controller từ chối

09:10+
→ DOG được phép feed lại
```

Không viết cooldown bên trong AI module.

## 9. Update Firebase AI result

Sau inference thành công, update:

```text
/devices/feeder-01/runtime/latestDetection
```

Ví dụ:

```json
{
  "speciesId": "dog",
  "confidence": 0.94,
  "capturedAtEpoch": 1780000000
}
```

App chỉ đọc và hiển thị kết quả này.

## 10. Không sửa các module sau nếu không cần

```text
servo_controller.*
loadcell_controller.*
feeding_controller.*
firebase_client.*
feedback_controller.*
```

Nếu cần thay đổi interface, phải trao đổi trước vì đây là phần điều khiển hệ thống chính.

## 11. Output cần bàn giao

```text
AI/
├── ai_interface.h
├── ai_interface.cpp
├── model_data.h
├── model_data.cpp
├── labels.h
└── README_AI.md
```

`README_AI.md` cần ghi:

```text
Model name
Input size
Input format
Quantization
Output labels
Confidence threshold
Required libraries
RAM/PSRAM usage
Average inference time
Known limitations
```

## 12. Thứ tự test sau khi merge

```text
1. Build firmware
2. Boot ESP32-S3 CAM
3. Confirm camera OK
4. Confirm aiBegin() OK
5. Test inference only
6. Confirm speciesId + confidence
7. Test DOG → Feeder 1
8. Test CAT → Feeder 2
9. Test cooldown
10. Test Firebase latestDetection
11. Test full automatic flow
```

Không test full feeding ngay từ đầu.

## 13. Flow cuối cùng

```text
Camera
  ↓
AI module
  ↓
speciesId + confidence
  ↓
Confidence check
  ↓
Feeding Controller
  ↓
Cooldown check
  ↓
Firebase feeding profile
  ↓
DOG → Servo1 + LoadCell1
CAT → Servo2 + LoadCell2
  ↓
LED + Buzzer
  ↓
Firebase status/history
  ↓
Mobile App
```

## Kết luận

Chỉ cần biến:

```text
Camera frame
```

thành:

```text
dog / cat / none
+ confidence
```

và trả kết quả qua `ai_interface`.

Toàn bộ logic cho ăn, cooldown, Servo, Load Cell và Firebase tiếp tục dùng firmware hiện tại.
