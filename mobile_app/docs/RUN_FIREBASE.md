# Chạy và kiểm tra Firebase thật

## 1. Kiểm tra Firebase Console

1. **Authentication → Sign-in method**: Email/Password phải ở trạng thái Enabled.
2. **Realtime Database → Rules**: dùng nội dung trong `database.rules.json`, sau đó nhấn Publish.
3. Android app trong Project settings phải có package `com.aismartpetfeeder`.

## 2. Chạy trên Windows

Mở Pixel 6 AVD trước. Tại thư mục project:

```powershell
npm install
adb reverse tcp:8081 tcp:8081
npm start -- --reset-cache
```

Giữ Metro chạy. Mở terminal thứ hai:

```powershell
cd android
.\gradlew clean
cd ..
npm run android
```

Nếu CLI hỏi dùng port 8082 vì 8081 đã chạy, chọn **No**.

## 3. Tạo tài khoản và kiểm tra dữ liệu

1. Nhập email hợp lệ và mật khẩu từ 6 ký tự.
2. Nhấn **Create Firebase account**. Lần sau dùng **Sign in**.
3. Trong Console mở **Authentication → Users**: tài khoản vừa tạo phải xuất hiện.
4. Mở **Realtime Database → Data**. App tự tạo:

```text
users/{uid}/profile
users/{uid}/species_profiles
users/{uid}/feeding_schedules
users/{uid}/notifications
users/{uid}/fcm_tokens
devices/feeder-01/status
devices/feeder-01/latest_detection
devices/feeder-01/feeding_history
```

## 4. Demo đồng bộ realtime

- **Profiles → Save profile**: kiểm tra `users/{uid}/species_profiles/{speciesId}`.
- **Schedule → Add**: kiểm tra `users/{uid}/feeding_schedules`.
- **Feed now → Dispense**: theo dõi `devices/feeder-01/feeding_commands`; trạng thái lần lượt là `pending`, `processing`, `completed`.
- Sau Feed Now: kiểm tra bản ghi mới trong `feeding_history` và `users/{uid}/notifications`.
- Sửa một trường trực tiếp trong Firebase Console, ví dụ `foodLevelPercent`; Dashboard trên app sẽ đổi realtime.

## 5. Ghép ESP32 thật

Trong `src/firebase/config.ts`, đổi:

```ts
export const DEMO_DEVICE_SIMULATOR_ENABLED = false;
```

ESP32 phải theo dõi `devices/feeder-01/feeding_commands`, xử lý command `pending`, cập nhật `processing` rồi `completed`/`failed`, đồng thời tạo history và notification. App sẽ chờ tối đa 30 giây cho phản hồi.

FCM token đã được lưu trong `users/{uid}/fcm_tokens`. Để gửi push khi app chạy nền, Cloud Function hoặc backend tin cậy phải gửi FCM; không đặt server key trong app hay ESP32.
