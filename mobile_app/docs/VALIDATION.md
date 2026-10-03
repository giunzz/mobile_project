# Kết quả kiểm tra bản Firebase v4 (app 1.1.0)

## Kiểm tra lại ngày 26/09/2026

Sau khi đồng bộ firmware 1.1.0 và logic giới hạn ngày UTC+7:

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | Qua |
| `npm run lint` | Qua |
| `npm test -- --runInBand` | 40 test qua, 4 suites |
| Bộ kiểm tra logic lịch/lịch sử firmware bằng C++ | Qua |
| Kiểm tra cú pháp `feeding_controller.cpp` với Arduino stubs | Qua |
| Android `assembleDebug` | Chưa tạo APK: biên dịch native của React Native gặp giới hạn đường dẫn 260 ký tự trên Windows tại `react-native-safe-area-context` |
| Arduino build / nạp ESP32 / Firebase thật | Chưa thực hiện trong lượt này |

Các kiểm tra C++ chạy trên máy tính, không thay thế biên dịch bằng Arduino IDE
và kiểm thử servo/load cell trên thiết bị. Phần dưới là kết quả của bản bàn giao
trước khi thêm logic firmware 1.1.0.

Android SDK và NDK 27.1.12297006 đã có trên máy. Thử build trực tiếp đi qua
các bước Java/Kotlin rồi dừng tại Ninja vì đường dẫn đối tượng C++ quá dài.
Không thay đổi kiến trúc React Native của dự án để né lỗi môi trường này.

## Đã thực hiện

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run typecheck` | Qua, không có lỗi TypeScript |
| `npm run lint` | Qua, không có lỗi/cảnh báo ESLint |
| `npm test -- --runInBand` | 39 tests qua, 3 test suites |
| Metro bundle JavaScript cho Android, `dev=false` | Qua |
| `google-services.json` | Project `ai-smart-pet-feeder`, package `com.aismartpetfeeder` khớp app |
| Hai tài liệu contract đi kèm | SHA-256 khớp nguyên bản nhóm cung cấp |
| Version npm / lockfile / Android | Đồng bộ 1.1.0, Android versionCode 2 |

Dependency trong môi trường kiểm thử được tái sử dụng qua symlink. Lần chạy Metro CLI thành công dùng cấu hình tạm chỉ bổ sung watchFolders/projectRoot để nhìn thấy symlink đó. Cấu hình này không đóng gói vào app; `metro.config.js` bàn giao giữ cấu hình React Native thông thường. Bundle ở đây chỉ xác minh JavaScript, không phải APK; không đóng gói bộ asset/native runtime cho thiết bị.

## Các luồng được bộ kiểm thử kiểm tra

- Đọc đúng Dog/Cat và hai lịch trùng `schedule-01` mà không tạo dữ liệu mẫu.
- Profile chỉ ghi 5 trường contract ở đúng node dùng chung.
- Thêm, sửa, bật/tắt, xóa lịch Dog không chạm lịch Cat; từ chối chuyển loài khi sửa, ID sai đường dẫn, lịch đã bị xóa và lượng/giờ không hợp lệ.
- Feed now chỉ ghi 6 trường vào singleton command; không tự sửa runtime/status, không sinh lịch sử và không báo completed giả.
- Transaction xử lý tranh chấp hai client trong mô hình RTDB giả; lệnh pending/processing không bị ghi đè.
- Chặn yêu cầu khi mất kết nối, heartbeat cũ, lỗi thiết bị, runtime bận, cooldown thiếu/chưa hết, profile không hợp lệ, lượng/loài sai hoặc vượt hạn mức dựa trên lịch sử nhận được.
- Đọc phản hồi ESP32, theo dõi kết nối, hủy listeners và giữ lỗi permission khi subscription bị hủy.
- Đọc epoch giây/mili giây; nhận diện timestamp/mode/measurement còn thiếu mà không bịa số liệu.
- Các phương thức đổi tên/chế độ thiết bị bị từ chối; đọc thông báo không ghi vào node của firmware.
- Component Feed now chỉ báo hoàn tất sau khi snapshot nhận trạng thái completed; mở lại màn hình không gửi lệnh mới.
- Heartbeat không làm mất phần khẩu phần người dùng đang sửa.
- Dashboard/Statistics hiển thị đúng khi chưa có lịch sử/AI; màn thiết bị chỉ có dữ liệu đọc.

## Chưa được kiểm chứng bằng thiết bị thật

- Không có Android SDK trong môi trường này nên **chưa chạy Gradle build/install APK** cho bản mới.
- Chưa mở bản mới trên máy ảo Android/điện thoại thật; test giao diện dùng React renderer, không phải ảnh chụp thiết bị.
- Không đăng nhập hoặc đọc/ghi project Firebase thật trong đợt kiểm tra; không thay Rules hay dữ liệu trên server.
- Chưa xác minh firmware mới nhận lệnh, servo/load cell, tự chạy lịch, hạn mức/cooldown trên máy, hay cảnh báo phần cứng.
- Schema chi tiết của `feedingHistory`, đơn vị epoch và nhịp heartbeat cần đối chiếu với người làm firmware theo `FIREBASE_HANDOFF.md`.

Thực hiện `RUN_FIREBASE.md` để kiểm tra toàn bộ chuỗi app → Firebase → ESP32 → Firebase → app. Các kiểm thử tự động là kiểm tra mã ứng dụng và mô hình dữ liệu, không thay thế buổi kiểm thử đó.
