# Firebase handoff – AI Smart Pet Feeder

Firebase đã được tích hợp bằng API modular của React Native Firebase:

- `@react-native-firebase/app`
- `@react-native-firebase/auth`
- `@react-native-firebase/database`
- `@react-native-firebase/messaging`

`FeederContext` theo dõi Firebase Authentication. Sau khi có `uid`, context tạo `FirebaseFeederRepository`, bootstrap các node còn thiếu và đăng ký listener Realtime Database. Các screen không phụ thuộc trực tiếp vào Firebase.

## Cấu trúc dữ liệu

```text
users/{uid}/
  profile/
  species_profiles/{speciesId}/
  feeding_schedules/{scheduleId}/
  notifications/{notificationId}/
  fcm_tokens/android_primary/

devices/feeder-01/
  status/
  latest_detection/
  feeding_commands/{commandId}/
  feeding_history/{historyId}/
```

## Feed Now

1. Mobile kiểm tra online, profile và giới hạn ăn trong ngày.
2. Mobile tạo command Firebase với `status = pending`.
3. Khi `DEMO_DEVICE_SIMULATOR_ENABLED = true`, app mô phỏng thiết bị và ghi `processing → completed`, history, notification và lượng thức ăn còn lại lên Firebase.
4. Khi cờ trên là `false`, app chờ ESP32 cập nhật command tối đa 30 giây.

ESP32 phải ghi nhớ command đã xử lý để không cấp thức ăn hai lần sau khi mất mạng hoặc khởi động lại. `actualGrams` thực tế phải lấy từ HX711/load cell.

## AI và phần cứng

ESP32-S3 CAM phân loại loài tại edge và cập nhật:

```text
devices/feeder-01/latest_detection
  speciesId
  confidence
  capturedAt
```

App không nhận dạng cá thể và không chạy model. Giá trị `speciesId` hợp lệ: `cat`, `dog`, `rabbit`, `hamster`, `guinea_pig`.

## Push notification

App xin quyền thông báo Android, lấy FCM token và lưu tại `users/{uid}/fcm_tokens/android_primary`. Cloud Function hoặc backend tin cậy chịu trách nhiệm gửi FCM. Không lưu service-account key hay FCM server key trong mobile app/firmware.

## Security

Rules đề xuất nằm tại `database.rules.json`. User chỉ đọc/ghi node của chính `uid`; user đã xác thực có thể thao tác thiết bị demo chung. Khi có firmware thật, nhóm backend cần bổ sung cơ chế xác thực/ủy quyền riêng cho ESP32 trước khi triển khai production.

Xem `RUN_FIREBASE.md` để chạy và kiểm tra từng node trong Firebase Console.
