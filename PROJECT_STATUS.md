> **Lưu ý 26/09/2026:** Đây là báo cáo lịch sử cho firmware 1.0.0.
> Mã firmware 1.1.0 và app hiện theo [quy tắc đồng bộ mới](ESP32/docs/FIREBASE_SYNC_V1_1.md).
> Các ZIP ở thư mục gốc là gói cũ; dùng mã nguồn trong `ESP32`
> và `mobile_app` khi kiểm thử bản mới. Màn camera trong app chưa được
> triển khai; stream tiếp tục xem qua trình duyệt bằng IP ESP32.

# BÁO CÁO TRẠNG THÁI HIỆN TẠI DỰ ÁN (PROJECT STATUS REPORT)
**Dự án:** Hệ thống Cho Thú Cưng Ăn Thông Minh (AI Smart Pet Feeder)  
**Ngày cập nhật:** 25/09/2026  
**Phiên bản Firmware:** V1.0.0  
**Phiên bản Mobile App:** V1.1.0  
**Đối tượng:** ESP32-S3 Edge AI + Firebase Realtime Database + React Native App  

---

## 1. TỔNG QUAN HỆ THỐNG (SYSTEM OVERVIEW)

Hệ thống **AI Smart Pet Feeder** là giải pháp IoT tích hợp Trí tuệ nhân tạo biên (Edge AI) nhằm tự động nhận diện vật nuôi (Chó hoặc Mèo), định lượng phần ăn bằng cảm biến tải trọng (Load cell), cấp phát thức ăn độc lập qua 2 phễu servo, truyền phát video trực tiếp (Camera MJPEG stream) và đồng bộ trạng thái hai chiều theo thời gian thực với ứng dụng di động qua Firebase.

```
       +-------------------------------------------------------------+
       |                       ESP32-S3 CAM                          |
       |  - Camera OV2640 (Live Stream + AI Frame Capture)          |
       |  - Edge AI (TFLite Micro: Phân loại Chó / Mèo)             |
       |  - 2x Servo PWM (Phễu Chó / Phễu Mèo)                      |
       |  - 2x Load cell HX711 (Cân đĩa Chó / Cân đĩa Mèo)          |
       |  - Còi Buzzer + Đèn LED chỉ thị                            |
       +------------------------------+------------------------------+
                                      |
                         Wi-Fi / HTTPS | WSS Realtime
                                      v
       +-------------------------------------------------------------+
       |               FIREBASE REALTIME DATABASE                    |
       |  - /devices/feeder-01/status (Heartbeat, Online, IP)        |
       |  - /devices/feeder-01/runtime/latestDetection (Loài, Conf)  |
       |  - /devices/feeder-01/runtime/feeding (Đang nhả, Số gram)   |
       |  - /devices/feeder-01/runtime/cooldown (Thời gian nghỉ)     |
       |  - /devices/feeder-01/command (Nhận lệnh từ xa)             |
       |  - /devices/feeder-01/feedingHistory (Nhật ký lịch sử)      |
       +------------------------------+------------------------------+
                                      ^
                                      | Firebase SDK
       +------------------------------+------------------------------+
       |                     REACT NATIVE APP                        |
       |  - Giám sát trạng thái thiết bị thời gian thực             |
       |  - Xem Video Stream camera trực tiếp từ ESP32               |
       |  - Điều khiển cho ăn thủ công (Manual Feed)                 |
       |  - Cài đặt cấu hình phần ăn & thời gian nghỉ từng loài     |
       |  - Xem lịch sử cấp thức ăn và thống kê                      |
       +-------------------------------------------------------------+
```

---

## 2. TRẠNG THÁI HIỆN TẠI TỪNG PHÂN HỆ (MODULE STATUS)

### 2.1. Phân hệ Phần cứng & Firmware (ESP32-S3)
* **Trạng thái:** ✅ **HOẠT ĐỘNG ỔN ĐỊNH / ĐÃ NẠP THÀNH CÔNG**
* **Môi trường build:** Arduino IDE / ESP-IDF (Board: `ESP32S3 Dev Module`, PSRAM: `OPI PSRAM`).
* **Chi tiết chức năng:**
  - **Camera OV2640:**
    - Khởi tạo thành công với cấu hình chân camera ESP32-S3 chuẩn.
    - Tích hợp máy chủ **MJPEG Video Streaming Server** tại cổng 80 (`http://<ESP32_IP>/` và `http://<ESP32_IP>/stream`) cho phép xem trực tiếp trên App hoặc trình duyệt.
    - Hỗ trợ lấy khung hình chụp riêng biệt cho mô hình AI phân loại.
  - **Cơ cấu Servo (Đóng/Mở phễu):**
    - Sử dụng thư viện `ESP32Servo`, điều khiển 2 kênh PWM độc lập: Servo 1 (Chó) và Servo 2 (Mèo).
    - Góc đóng: `0°`, góc mở: `90°`.
  - **Cảm biến cân nặng (HX711 Load Cells):**
    - Đọc 2 kênh load cell độc lập bằng ngắt đa chân (Pins HX711_1 và HX711_2 chung clock).
    - Cơ chế hiệu chuẩn lưu vào EEPROM / NVS.
    - Hỗ trợ thuật toán kiểm soát khối lượng thời gian thực: Dừng sớm trước ngưỡng dung sai (`STOP_EARLY_TOLERANCE_G = 2.0g`) và ngắt an toàn nếu quá 5 giây không thấy hạt rơi (`NO_WEIGHT_PROGRESS_TIMEOUT_MS = 5000ms`).
  - **Phản hồi âm thanh/ánh sáng:**
    - Còi buzzer phát âm beep xác nhận khi hoàn tất và 3 tiếng cảnh báo khi gặp lỗi.
    - Đèn LED báo quá trình đang xả thức ăn. Đã triệt tiêu hoàn toàn lỗi khởi tạo LEDC.
  - **Serial CLI Console (115200 baud):**
    - Hỗ trợ hệ thống lệnh CLI toàn diện: `TARE1`, `TARE2`, `CAL1 <grams>`, `CAL2 <grams>`, `SHOWCAL`, `WEIGHT`, `TESTDOG <g>`, `TESTCAT <g>`, `CAM`, `AITEST`, `RESETCOOLDOWN`.

---

### 2.2. Phân hệ Trí tuệ Nhân tạo Biên (Edge AI)
* **Trạng thái:** ✅ **ĐÃ TÍCH HỢP & HOẠT ĐỘNG** (Đang trong lộ trình tối ưu hóa tốc độ)
* **Framework:** TensorFlow Lite for Microcontrollers (TFLM / `TensorFlowLite_ESP32`).
* **Bộ nhớ:** Cấp phát **2 MB Tensor Arena** trong OPI PSRAM (`ps_malloc`) để chứa mô hình và bộ đệm tensor trung gian.
* **Mô hình hiện tại:**
  - File: `model.h` / `model.tflite` (~119 KB Float32).
  - Đầu vào: Tensor Float32 $[1, 128, 128, 3]$, chuẩn hóa $[0.0, 1.0]$.
  - Đầu ra: Tensor Float32 $[1, 2]$, chuyển hóa xác suất qua hàm Softmax (Lớp 0: `cat`, Lớp 1: `dog`).
* **Các cơ chế an toàn AI đã triển khai:**
  1. **Ngưỡng tin cậy (Confidence Threshold):** `AI_CONFIDENCE_THRESHOLD = 0.88f` (88%). Nhiễu phòng trống (~77%) bị loại bỏ hoàn toàn, trả về trạng thái `"none"`.
  2. **Bộ lọc xác nhận liên tiếp (Debounce 2-Frames):** `AI_CONSECUTIVE_CONFIRMATIONS = 2`. Máy phải nhìn thấy cùng một con vật 2 lần quét liên tiếp mới kích hoạt nhả thức ăn, ngăn chặn các khoảnh khắc nhiễu sáng ngẫu nhiên.
  3. **Cooldown an toàn khi kiểm thử trên bàn:** Kích hoạt thời gian nghỉ an toàn ($1 - 2$ phút) ngay cả khi lệnh cho ăn bị hủy do không có hạt thức ăn thật (`no_weight_progress`), triệt tiêu vòng lặp cho ăn vô tận.
  4. **Lệnh xóa Cooldown tức thì:** Bổ sung lệnh `RESETCOOLDOWN` trên Serial Monitor phục vụ demo/test nhanh.
* **Tốc độ suy luận hiện tại:** ~6.5 giây/lần quét (do đang chạy Float32 trên CPU ESP32).

---

### 2.3. Phân hệ Đám mây & Cơ sở dữ liệu (Firebase Realtime Database)
* **Trạng thái:** ✅ **ĐỒNG BỘ HAI CHIỀU ỔN ĐỊNH**
* **URL Database:** `https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app/`
* **Cơ chế:** Thư viện `FirebaseClient` chính thức của Espressif/Mobizt, kết nối bất đồng bộ qua SSL/TLS với NTP epoch timestamp.
* **Cấu trúc cây dữ liệu hoạt động:**
  - `/devices/feeder-01/status`: Nhịp tim (Heartbeat 10s/lần), IP máy, cường độ sóng Wi-Fi RSSI, chế độ hoạt động `operatingMode: "automatic"`.
  - `/devices/feeder-01/runtime/latestDetection`: Cập nhật kết quả AI (`speciesId`: "cat"/"dog"/"none", `confidence`, `capturedAtEpoch`). Tự động làm sạch về `"none"` khi khởi động hoặc khi vật nuôi rời đi.
  - `/devices/feeder-01/runtime/feeding`: Giám sát hành trình xả hạt thời gian thực (`targetGrams`, `actualGrams`, `ledOn`, `status`).
  - `/devices/feeder-01/runtime/cooldown`: Quản lý mốc thời gian hết giờ nghỉ (`dogUntilEpoch`, `catUntilEpoch`).
  - `/devices/feeder-01/command`: Lắng nghe lệnh cho ăn tức thì từ App di động (`type: "feed_now"`, xử lý chuyển trạng thái `pending` $\rightarrow$ `processing` $\rightarrow$ `completed`/`failed`).
  - `/devices/feeder-01/feedingHistory`: Ghi nhận nhật ký tự động sau mỗi lần cấp hạt thành công hoặc thất bại.

---

### 2.4. Phân hệ Ứng dụng Di động (Mobile App - React Native)
* **Trạng thái:** ✅ **ĐÃ LIÊN KẾT & ĐỒNG BỘ SCHEMA**
* **Đường dẫn mã nguồn:** `mobile_project/mobile_app/` (và bản gốc `src_app_androi/PetFeeder/`).
* **Công nghệ:** React Native (TypeScript), React Navigation, Firebase App/Database SDK.
* **Tính năng đã hoàn thiện:**
  - Màn hình Dashboard giám sát trực quan trạng thái kết nối Online/Offline và IP của ESP32.
  - Hiển thị nhận diện AI mới nhất (Icon, độ tin cậy, thời điểm phát hiện).
  - Tích hợp màn hình xem Video Camera Streaming trực tiếp từ IP của ESP32.
  - Nút bấm ra lệnh cho ăn thủ công (Manual Feed) với thanh trượt chỉnh số gram thức ăn.
  - Hiển thị thanh đếm ngược thời gian chờ Cooldown cho từng loài.
  - Danh sách lịch sử các lần cho ăn có phân loại nhãn (Tự động AI / Thủ công / Thất bại).
  - Khung cấu hình thông số vật nuôi (Tên, phần ăn mặc định, thời gian nghỉ).

---

## 3. NHẬT KÝ CÁC VẤN ĐỀ ĐÃ XỬ LÝ (RESOLVED ISSUES LOG)

| STT | Vấn đề / Triệu chứng | Nguyên nhân gốc rễ | Giải pháp đã khắc phục | Trạng thái |
| :---: | :--- | :--- | :--- | :---: |
| **1** | Phòng trống không có vật nuôi nhưng AI luôn đoán Mèo (~77%) | Model nhị phân 2 lớp không có lớp Background; Softmax ép tổng bằng 100%; đặc trưng phòng trống trùng bối cảnh ảnh mèo trong dataset. | Tăng ngưỡng tin cậy lên 88%; gán kết quả là `"none"` nếu dưới ngưỡng; thêm debounce 2-frame. | ✅ Triệt để |
| **2** | Hệ thống mở servo cho ăn liên tục thành vòng lặp vô tận | Khi test trên bàn không có hạt rơi $\rightarrow$ báo lỗi `no_weight_progress`, nhưng code cũ chỉ lưu cooldown khi thành công nên không ghi nhận thời gian chờ. | Bổ sung Safety Cooldown ($1 - 2$ phút) ngay cả khi thất bại; thêm lệnh CLI `RESETCOOLDOWN`. | ✅ Triệt để |
| **3** | Reset máy xong App vẫn giữ kết quả là Mèo | Firmware cũ không làm sạch trường `latestDetection` trên Firebase khi khởi động lại. | Bổ sung hàm `firebaseSetLatestDetection("none", 0.0f)` ngay trong hàm `setup()` khi boot xong. | ✅ Triệt để |
| **4** | Cảnh báo đỏ `ledc: ledc_set_duty: LEDC is not initialized` lúc bật nguồn | Hàm `feedbackBegin()` gọi `noTone(BUZZER_PIN)` trước khi kênh PWM của buzzer được gán. | Thay thế bằng `digitalWrite(BUZZER_PIN, LOW)` khi khởi tạo. | ✅ Triệt để |
| **5** | Thiếu thư viện và thiếu `#include <WiFi.h>` khi biên dịch firmware | File `.ino` thiếu header mạng và xung đột phiên bản thư viện TFLite Micro trên ESP32 core mới. | Đã bổ sung đầy đủ thư viện, cấu hình OPI PSRAM và đóng gói bộ thư viện chuẩn `Arduino_TensorFlowLite_ESP32.zip`. | ✅ Triệt để |
| **6** | Lỗi `pip install tensorflow` trên máy tính cá nhân | Máy tính cài mặc định Python 3.14 (quá mới, chưa có wheel hỗ trợ cho TensorFlow/PyTorch). | Sử dụng công cụ `uv` với Python 3.11 có sẵn trên máy hoặc dùng Google Colab. | ✅ Đã hướng dẫn |

---

## 4. BẢNG CẤU HÌNH PHẦN CỨNG & THÔNG SỐ (PINOUT & CONFIG)

### 4.1. Sơ đồ nối chân ESP32-S3 (Pinout)
- **Servo 1 (Khay thức ăn Chó):** GPIO `1`
- **Servo 2 (Khay thức ăn Mèo):** GPIO `2`
- **HX711 Loadcell 1 (Cân Chó - DOUT):** GPIO `41`
- **HX711 Loadcell 2 (Cân Mèo - DOUT):** GPIO `42`
- **HX711 Chung (SCK - Clock):** GPIO `40`
- **Đèn LED báo trạng thái cho ăn:** GPIO `21`
- **Còi Buzzer báo âm:** GPIO `47`
- **Camera OV2640:** Các chân D0-D7, PCLK, VSYNC, HREF, XCLK, SIOC, SIOD cấu hình theo chuẩn Freenove / ESP32-S3 CAM WROOM-1.

### 4.2. Các thông số cấu hình chính (`app_config.h`)
```cpp
constexpr float AI_CONFIDENCE_THRESHOLD = 0.88f;         // Ngưỡng tin cậy tối thiểu (88%)
constexpr uint32_t AI_SCAN_INTERVAL_MS = 5000;           // Chu kỳ quét AI (5 giây)
constexpr int AI_CONSECUTIVE_CONFIRMATIONS = 2;          // Số lần xác nhận liên tiếp (Debounce)
constexpr float DEFAULT_DOG_PORTION_G = 80.0f;           // Khẩu phần mặc định cho Chó
constexpr float DEFAULT_CAT_PORTION_G = 45.0f;           // Khẩu phần mặc định cho Mèo
constexpr int DEFAULT_DOG_COOLDOWN_MIN = 10;             // Thời gian nghỉ mặc định của Chó (phút)
constexpr int DEFAULT_CAT_COOLDOWN_MIN = 10;             // Thời gian nghỉ mặc định của Mèo (phút)
constexpr uint32_t NO_WEIGHT_PROGRESS_TIMEOUT_MS = 5000; // Thời gian chờ tối đa nếu hạt không rơi
```

---

## 5. KẾ HOẠCH TỐI ƯU HÓA TIẾP THEO (NEXT MILESTONES)

1. **Tối ưu tiền xử lý ảnh (Center-Crop):**
   - Chuyển đổi từ phép co giãn ảnh toàn phần ($320 \times 240 \rightarrow 128 \times 128$) sang **cắt vuông chính giữa (Center-Crop $240 \times 240 \rightarrow 128 \times 128$)** để chống hiện tượng méo tỉ lệ giải phẫu học của vật nuôi, giúp tăng độ chính xác của mạng nơ-ron.
2. **Tăng tốc suy luận bằng lượng tử hóa INT8 (Post-Training Quantization):**
   - Lượng tử hóa mô hình sang INT8 tận dụng tập lệnh vector tăng tốc của ESP32-S3 nhằm hạ thời gian suy luận từ **$6.5\text{s}$ xuống dưới $0.5\text{s}$**, đạt tốc độ nhận diện thời gian thực.
3. **Triển khai mô hình mới `csunet_ssr_s3_best.pt`:**
   - Hoàn tất xuất file checkpoint PyTorch vừa được đưa vào dự án sang định dạng `model.h` và kiểm thử độ nhạy thực tế trên đĩa ăn.
4. **Đóng gói sản phẩm hoàn thiện:**
   - Cân chỉnh cơ khí góc nghiêng camera $30^\circ - 40^\circ$ chiếu vào đĩa ăn.
   - Hoàn thiện tài liệu nghiệm thu đề tài và hướng dẫn sử dụng cho người dùng cuối.

---
*Báo cáo được tổng hợp tự động và đồng bộ trực tiếp với toàn bộ mã nguồn của dự án.*
