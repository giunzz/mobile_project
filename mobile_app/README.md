# AI Smart Pet Feeder

Ứng dụng Android quản lý máy cho thú cưng ăn thông minh, xây dựng bằng **React Native 0.86.3 + TypeScript** và tích hợp **Firebase Authentication, Realtime Database và Cloud Messaging**.


## Chức năng

- Đăng ký, đăng nhập, duy trì phiên và đăng xuất bằng Firebase Authentication.
- Dashboard hiển thị trạng thái thiết bị, lượng thức ăn, Wi-Fi, chế độ hoạt động, kết quả AI, lịch tiếp theo và lần cho ăn gần nhất.
- Quản lý hồ sơ Cat, Dog, Rabbit, Hamster và Guinea pig.
- Cấu hình loại thức ăn, khẩu phần, giới hạn mỗi ngày, tự động cho ăn và thông báo theo từng loài.
- `Feed Now` ghi lệnh thật lên Firebase với vòng đời `pending → processing → completed/rejected`.
- Thêm, sửa, bật/tắt và xóa lịch cho ăn; dữ liệu được đồng bộ realtime.
- Lịch sử cho ăn, bộ lọc, thống kê và thông báo.
- Lưu FCM token để backend có thể gửi push notification.

> **Phạm vi demo:** app đang bật mô phỏng phản hồi ESP32 bằng `DEMO_DEVICE_SIMULATOR_ENABLED = true`. Dữ liệu vẫn được đọc/ghi trên Firebase thật. Khi có firmware ESP32, đổi cờ này thành `false` trong `src/firebase/config.ts`.

## Công nghệ và yêu cầu

- Windows 10/11 64-bit.
- Node.js từ `22.11.0` trở lên và npm.
- JDK 17.
- Android Studio và Android SDK.
- Android SDK Platform 36, Build Tools 36.0.0.
- NDK `27.1.12297006` và CMake `3.22.1`.
- Một Android Emulator đang chạy, khuyến nghị API 35 hoặc 36.

Kiểm tra môi trường:

```powershell
node --version
npm --version
java -version
adb --version
emulator -version
```

Biến môi trường Windows:

```text
ANDROID_HOME=C:\Users\<USERNAME>\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Microsoft\jdk-17...
```

Các mục nên có trong `Path`:

```text
%JAVA_HOME%\bin
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\emulator
%ANDROID_HOME%\cmdline-tools\latest\bin
```

## Cài đặt sau khi clone

Nên đặt project ở đường dẫn ngắn như `C:\PetFeeder` để tránh lỗi CMake/Ninja `Filename longer than 260 characters`.

```powershell
git clone <URL_REPOSITORY>
cd <THU_MUC_PROJECT>
Test-Path .\package.json
npm ci
```

`Test-Path` phải trả về `True`. Nếu là `False`, bạn đang đứng ngoài thư mục chứa project.

## Cấu hình Firebase

Bản này đã có cấu hình Android tại:

```text
android/app/google-services.json
```

Package name phải là:

```text
com.aismartpetfeeder
```

Trong Firebase Console:

1. Vào **Authentication → Sign-in method** và bật **Email/Password**.
2. Tạo **Realtime Database**.
3. Vào **Realtime Database → Rules**, dán nội dung `database.rules.json` rồi bấm **Publish**.
4. Nếu dùng Firebase project khác, tải `google-services.json` mới và thay đúng file trong `android/app/`.

`google-services.json` là cấu hình Firebase phía client, không phải service-account key. Tuyệt đối không đưa `service-account.json`, FCM server key hoặc private release keystore lên GitHub. Với hệ thống production, cần giới hạn API key, bật App Check và siết quyền thiết bị.

## Chạy ứng dụng Android

### 1. Khởi động máy ảo

Mở Android Studio → **Device Manager** → chạy emulator. Sau đó kiểm tra:

```powershell
adb devices
```

Thiết bị phải có trạng thái `device`.

### 2. Chạy Metro

Mở terminal thứ nhất tại thư mục có `package.json`:

```powershell
adb reverse tcp:8081 tcp:8081
npm start -- --reset-cache
```

Giữ terminal này mở. Khi hiện `Dev server ready`, chuyển sang bước tiếp theo.

### 3. Build và cài app

Mở terminal thứ hai tại cùng thư mục:

```powershell
npm run android
```

Nếu CLI báo cổng `8081` đang được Metro của chính project sử dụng và hỏi chuyển sang `8082`, chọn **No**.

## Kiểm tra Firebase hoạt động

1. Trên app, nhập email hợp lệ và mật khẩu ít nhất 6 ký tự.
2. Nhấn **Create Firebase account** nếu tài khoản chưa tồn tại; lần sau dùng **Sign in**.
3. Firebase Console → **Authentication → Users** phải xuất hiện email vừa tạo.
4. Firebase Console → **Realtime Database → Data** phải xuất hiện `users/{uid}` và `devices/feeder-01`.
5. Tạo hoặc sửa Schedule rồi kiểm tra `users/{uid}/feeding_schedules`.
6. Nhấn Feed Now rồi kiểm tra `devices/feeder-01/feeding_commands` và `feeding_history`.
7. Sửa `devices/feeder-01/status/foodLevelPercent` trực tiếp trên Console; Dashboard phải cập nhật mà không cần build lại.

## Cấu trúc Firebase

```text
users/{uid}/
├── profile/
├── species_profiles/{speciesId}/
├── feeding_schedules/{scheduleId}/
├── notifications/{notificationId}/
└── fcm_tokens/android_primary/

devices/feeder-01/
├── status/
├── latest_detection/
├── feeding_commands/{commandId}/
└── feeding_history/{historyId}/
```

- Schedule thuộc từng tài khoản nên nằm trong `users/{uid}`.
- Feed Now là lệnh gửi tới thiết bị vật lý nên nằm trong `devices/feeder-01`.
- ESP32 sau này theo dõi `feeding_commands`, thực hiện lệnh rồi cập nhật trạng thái và lịch sử.

## Cấu trúc source code

```text
src/
├── components/       Thành phần giao diện dùng chung
├── context/          State và thao tác toàn ứng dụng
├── data/             Dữ liệu khởi tạo cho tài khoản mới
├── firebase/         Cấu hình database và FCM
├── repositories/     Lớp truy cập Firebase và mock dùng cho test
├── screens/          Các màn hình chức năng
├── types/            Kiểu dữ liệu TypeScript
├── utils/            Hàm định dạng
└── RootApp.tsx        Điều hướng ứng dụng
```

## Kiểm tra mã nguồn

```powershell
npm run typecheck
npm run lint
npm test -- --runInBand
```

## Build APK debug

```powershell
cd android
.\gradlew assembleDebug
cd ..
```

APK được tạo tại:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Xử lý lỗi thường gặp

### `Could not read package.json` / `ENOENT`

Chuyển đến đúng thư mục chứa `package.json`:

```powershell
Get-ChildItem -Filter package.json -File -Recurse |
  Where-Object { $_.FullName -notlike '*\node_modules\*' }
```

### `Filename longer than 260 characters`

Di chuyển project tới đường dẫn ngắn, ví dụ:

```text
C:\PetFeeder
```

Sau đó xóa cache build cũ và build lại:

```powershell
Remove-Item -Recurse -Force .\android\app\.cxx -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\android\app\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\android\build -ErrorAction SilentlyContinue
npm run android
```

### Màn hình đỏ `Unable to load script`

Đảm bảo Metro đang chạy rồi thực hiện:

```powershell
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.aismartpetfeeder
adb shell am start -n com.aismartpetfeeder/.MainActivity
```

### Thêm native library nhưng app chưa nhận

```powershell
cd android
.\gradlew --stop
.\gradlew clean
cd ..
npm run android
```

## Đưa project lên GitHub

Tạo một repository rỗng trên GitHub, không chọn tạo sẵn README hoặc `.gitignore`. Tại thư mục project chạy:

```powershell
git init
git add .
git status
git commit -m "Initial commit: AI Smart Pet Feeder"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPOSITORY>.git
git push -u origin main
```

Trước khi commit, kiểm tra `git status`: không được có `node_modules`, `.gradle`, `.cxx`, `android/build` hoặc `android/app/build`. Những thư mục này đã được chặn trong `.gitignore`.

## Tài liệu bổ sung

- `docs/RUN_FIREBASE.md`: chạy và kiểm tra Firebase theo từng bước.
- `docs/FIREBASE_HANDOFF.md`: cấu trúc dữ liệu và giao tiếp với ESP32.
