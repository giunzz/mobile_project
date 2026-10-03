# AI Smart Pet Feeder — Firebase v4

Bản mã nguồn React Native/TypeScript đã chuyển sang cấu trúc RTDB trong hai tài liệu nhóm cung cấp: [hợp đồng Firebase](docs/contract/Firebase_RTDB_Contract.txt) và [JSON mẫu](docs/contract/ai-smart-pet-feeder-rtdb-final.json). Phiên bản app: **1.1.0**. Thiết bị: **feeder-01**. Android package: **com.aismartpetfeeder**.

## Những phần đã sửa

- Hai ngăn độc lập: **Dog = feeder 1 / servo 1 / load cell 1**, **Cat = feeder 2 / servo 2 / load cell 2**.
- Đọc/ghi khẩu phần, giới hạn ngày, cooldown, bật tự động và thông báo theo từng loài.
- Thêm, sửa, bật/tắt, xóa lịch tại cấu hình thiết bị dùng chung. Lịch `dog/schedule-01` và `cat/schedule-01` được phân biệt.
- Feed now gửi đúng một lệnh vào `command`, chờ ESP32 cập nhật trạng thái; dùng transaction để tránh ghi đè lệnh đang chạy của điện thoại khác.
- Đọc trực tiếp trạng thái thiết bị, lượng đang cân, cooldown và kết quả nhận diện. Không còn mô phỏng ESP32 hay tự tạo lịch sử cho ăn.
- Kiểm tra kết nối, heartbeat, mã lỗi, trạng thái đang chạy, cooldown và giới hạn ngày trước khi gửi lệnh.
- Dashboard, lịch sử, thống kê và thông báo trong app dùng dữ liệu nhận được. Dữ liệu chưa có được hiển thị rõ.
- Cập nhật heartbeat không làm mất phần khẩu phần đang sửa dở.

**Tích hợp firmware 1.1.0:** Firmware hiện có AI, lịch cho ăn và giới hạn ngày theo UTC+7. App hiển thị kết quả nhận diện khi firmware ghi `runtime/latestDetection`; lịch sử và thông báo trong app lấy từ bản ghi `feedingHistory` của thiết bị. Xem [quy tắc đồng bộ](../ESP32/docs/FIREBASE_SYNC_V1_1.md) và [hướng dẫn bàn giao](docs/FIREBASE_HANDOFF.md). Chỉ xác nhận đã lưu lệnh lên Firebase chưa chứng minh máy đã cấp thức ăn.

## Chạy trên máy Windows đã cài Android Studio

1. Giải nén rồi đặt **thư mục chứa trực tiếp `package.json`, `src`, `android`** tại `C:\PetFeeder`. Đường dẫn đúng là `C:\PetFeeder\package.json`. Nếu có thư mục PetFeeder cũ, lưu bản cũ ở tên khác trước.
2. Trong VS Code chọn **File → Open Folder → C:\PetFeeder**.
3. Mở Android Studio → **Device Manager**, chạy máy ảo và đợi tới màn hình chính Android.
4. Dừng Metro của các bản app cũ bằng **Ctrl+C** trong cửa sổ đang chạy Metro đó.
5. VS Code → **Terminal → New Terminal**. Kiểm tra terminal đang ở `C:\PetFeeder`, chạy:

```sh
npm ci
npm start -- --reset-cache
```

Giữ terminal này mở. Khi thấy `Dev server ready`, mở **terminal thứ hai** trong VS Code, cũng tại `C:\PetFeeder`:

```sh
adb devices
adb reverse tcp:8081 tcp:8081
npm run android -- --active-arch-only --no-packager --port 8081
```

Các lệnh trên giả định chỉ có một máy ảo/điện thoại kết nối. Đợi `BUILD SUCCESSFUL`, app sẽ mở trên Android. Giữ Metro chạy khi dùng bản debug. Mỗi lần chạy lại chỉ cần mở máy ảo, khởi động Metro và chạy lệnh Android; `npm ci` chỉ cần khi cài bản mã nguồn mới hoặc thay lockfile.

**Nếu có lỗi `ENOENT package.json`:** bạn đang mở sai tầng thư mục. Dùng File Explorer tìm `package.json`, rồi mở đúng thư mục chứa file đó trong VS Code.

**Nếu lỗi tên file dài hơn 260 ký tự:** dùng đường dẫn ngắn `C:\PetFeeder`; không giữ nhiều thư mục `AISmartPetFeeder...` lồng nhau. ZIP này không chứa cache build cũ.

**Nếu app vẫn hiện bản cũ:** kiểm tra VS Code và Metro đều đang chạy từ `C:\PetFeeder`, dừng Metro cũ rồi chạy lại hai terminal trên.

## Cấu hình Firebase

| Mục                 | Giá trị của bản này                                                             |
| ------------------- | ------------------------------------------------------------------------------- |
| Firebase project    | `ai-smart-pet-feeder`                                                           |
| Android package     | `com.aismartpetfeeder`                                                          |
| Cấu hình Android    | `android/app/google-services.json`                                              |
| Database URL        | `https://ai-smart-pet-feeder-default-rtdb.asia-southeast1.firebasedatabase.app` |
| Root thiết bị       | `devices/feeder-01`                                                             |
| Cấu hình trong code | `src/firebase/config.ts`                                                        |
| Cách đăng nhập      | Firebase Authentication, Email/Password                                         |

File `google-services.json` của dự án đã có trong bản mã nguồn. Đăng nhập bằng tài khoản Firebase được nhóm cấp quyền sử dụng thiết bị. Tạo tài khoản mới không tự cấp quyền đọc/ghi thiết bị. App không tạo lại dữ liệu mẫu khi đăng ký hoặc đăng nhập.

Chủ Firebase cần bảo đảm dữ liệu thiết bị có cấu trúc mới và Security Rules cho phép đúng tài khoản thao tác. **JSON trong `docs/contract` là mẫu đối chiếu, không phải dữ liệu cần import đè lên database đang chạy.** App không triển khai hoặc thay Rules. Rules cũ cho phép mọi tài khoản ghi toàn bộ thiết bị đã được bỏ khỏi mã nguồn bàn giao; xem [phân quyền](docs/FIREBASE_HANDOFF.md#phân-quyền).

## Kiểm tra nhanh Firebase có hoạt động

Mở Firebase Console → **Realtime Database → Data → devices → feeder-01** cùng lúc với app.

| Thao tác trên app                    | Chỗ kiểm tra trong `devices/feeder-01`                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Profiles → Dog → đổi cooldown → Save | `config/speciesProfiles/dog/cooldownMinutes`                                 |
| Schedule → Add → chọn Cat → Create   | `config/schedules/cat/{scheduleId}`                                          |
| Sửa, bật/tắt hoặc xóa lịch Dog       | `config/schedules/dog/{scheduleId}`; lịch Cat không đổi                      |
| Feed now → Dog → gửi yêu cầu         | `command`, với `type=feed_now`, `speciesId=dog`, `status=pending`            |
| ESP32 nhận và thực hiện lệnh         | ESP32 đổi `command/status` thành `processing`, rồi `completed` hoặc `failed` |
| ESP32 gửi cân/trạng thái             | `runtime/feeding`, `status`, `runtime/cooldown`                              |
| ESP32 lưu lịch sử                    | `feedingHistory/{pushId}`                                                    |

Lịch tạo mới mặc định **tắt** để bạn kiểm tra giờ, lượng và đúng ngăn trước khi bật. Firmware 1.1.0 chạy lịch theo UTC+7 khi lịch và `autoFeedEnabled` của loài đều bật. Xem lịch sử để xác nhận lịch thực sự đã chạy.

Nếu chưa nối ESP32, bạn vẫn kiểm tra được đăng nhập, sửa cấu hình, CRUD lịch và đồng bộ giữa hai máy. Nút Feed bị khóa khi không có heartbeat hợp lệ. Không sửa giả `online`/`lastSeenEpoch` trên database đang nối thiết bị chỉ để vượt kiểm tra này. Hướng dẫn kiểm tra từng bước: [RUN_FIREBASE.md](docs/RUN_FIREBASE.md).

## Công cụ và thư viện

| Thành phần                   | Phiên bản khai báo                              |
| ---------------------------- | ----------------------------------------------- |
| React Native / React         | 0.86.3 / 19.2.3                                 |
| React Native Firebase        | 26.3.3 (`app`, `auth`, `database`, `messaging`) |
| TypeScript                   | theo `package-lock.json`                        |
| Node.js                      | >= 22.11.0 theo `package.json`                  |
| Android compile / target SDK | 36                                              |
| Android Build Tools          | 36.0.0                                          |
| Android NDK                  | 27.1.12297006                                   |

Giữ Java/Android SDK đã build được bản trước; bản này không thêm thư viện native. Module messaging vẫn được giữ để không thay tập dependency đã cài, nhưng đăng ký token và background handler bị tắt: hợp đồng mới chưa có luồng push. Bật Notifications trong Profiles hiện điều khiển thông báo kết quả **trong app**.

## Kiểm thử và các file chính

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
```

- `src/firebase/deviceContract.ts`: kiểm tra, chuyển đổi dữ liệu và tên đường dẫn.
- `src/repositories/FirebaseFeederRepository.ts`: đọc/ghi RTDB, theo dõi thời gian thực và transaction.
- `src/screens/`: giao diện app.
- `docs/contract/`: hai tài liệu gốc của nhóm, giữ nguyên.
- `docs/FIREBASE_HANDOFF.md`: hợp đồng app ↔ ESP32, giả định và điểm nhóm cần thống nhất.
- `docs/RUN_FIREBASE.md`: kiểm tra trên Firebase thật và thiết bị thật.
- `__tests__/`: kiểm thử bằng RTDB giả lập trong bộ nhớ, không kết nối Firebase thật.
- `docs/VALIDATION.md`: kết quả kiểm tra bản bàn giao và giới hạn kiểm chứng.

## Đưa vào GitHub

Đưa **mã nguồn đã giải nén** vào thư mục app/mobile của repository nhóm, giữ nguyên các thư mục của AI, ESP32 và backend. Không chỉ upload file ZIP. Giữ `package.json`, `package-lock.json`, `src`, `android`, file cấu hình và tài liệu; không đưa `node_modules`, `android/app/build`, `.gradle`, `.cxx` hay APK lên Git. ZIP này đã loại các thư mục sinh ra khi cài/build nên nhẹ hơn thư mục làm việc vài GB.

`google-services.json` là cấu hình ứng dụng Android của nhóm; quyền dữ liệu phải được kiểm soát bằng Authentication và Security Rules. Không đưa service-account/private signing keys vào app hoặc repository.

Tham khảo: [React Native Firebase — Realtime Database](https://rnfirebase.io/database/usage), [Firebase — Security Rules conditions](https://firebase.google.com/docs/database/security/rules-conditions).
