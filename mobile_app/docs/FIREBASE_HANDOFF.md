# Bàn giao Firebase v4 cho nhóm App / Firebase / ESP32

Đầu vào: `contract/Firebase_RTDB_Contract.txt` và `contract/ai-smart-pet-feeder-rtdb-final.json`. Bản này chuyển toàn bộ phần cấu hình đang dùng sang `devices/feeder-01`. Các node cũ dưới `users` hoặc `feeding_commands` / `feeding_history` không được đọc hay tự di chuyển, và không bị xóa khỏi Firebase.

## Quyền ghi theo hợp đồng

Tất cả đường dẫn dưới đây tương đối với `devices/feeder-01`.

| Đường dẫn                                  | App                                     | ESP32                          |
| ------------------------------------------ | --------------------------------------- | ------------------------------ |
| `config/speciesProfiles/{dog\|cat}`        | Đọc, sửa 5 trường cấu hình              | Đọc để áp dụng                 |
| `config/schedules/{dog\|cat}/{scheduleId}` | Đọc, thêm/sửa/bật/tắt/xóa               | Đọc để thực hiện               |
| `command`                                  | Đọc; ghi yêu cầu mới nếu slot không bận | Nhận lệnh; cập nhật trạng thái |
| `status`                                   | Chỉ đọc                                 | Ghi trạng thái/heartbeat       |
| `runtime/feeding`                          | Chỉ đọc                                 | Ghi trạng thái và cân          |
| `runtime/cooldown`                         | Chỉ đọc                                 | Ghi thời điểm hết cooldown     |
| `runtime/latestDetection`                  | Chỉ đọc                                 | Firmware/Edge AI cập nhật      |
| `feedingHistory/{pushId}`                  | Chỉ đọc; adapter lịch sử xem bên dưới   | Tạo bản ghi đo thực tế         |

App không đổi tên thiết bị hay ghi trực tiếp `status/operatingMode`, không tự reset lệnh bận, không tạo dữ liệu mẫu, không ghi lịch sử cho ăn và không tạo `users/{uid}/fcm_tokens`. Các dấu đã đọc thông báo chỉ nằm trong phiên đăng nhập của app.

## Lệnh cho ăn

Payload app ghi **đúng 6 trường** vào singleton `command`:

```json
{
  "requestId": "ID-duy-nhat-do-Firebase-push-key-tao",
  "type": "feed_now",
  "speciesId": "dog",
  "targetGrams": 80,
  "status": "pending",
  "requestedAtEpoch": 1800000000
}
```

`push()` chỉ tạo requestId; app không tạo `command/{requestId}`. Một transaction giành slot `command`: không ghi đè nếu trạng thái đang `pending`, `processing` hoặc không hiểu được. Lệnh mới chỉ thay slot rỗng hoặc trạng thái `idle`, `completed`, `failed`. Transaction tắt hiển thị cập nhật lạc quan (`applyLocally:false`).

ESP32 phải theo dõi **thay đổi giá trị** của `command`, nhận lệnh `pending` mới, giữ nguyên `requestId`, đổi trạng thái `processing`, rồi `completed` hoặc `failed`. Firebase đã ghi thành công chỉ có nghĩa yêu cầu đã được lưu. App không đánh dấu hoàn thành khi chỉ nhận xác nhận ghi dữ liệu.

Giao diện luôn hiện lệnh mới nhất của thiết bị, kể cả khi mở lại màn hình hoặc lệnh đến từ điện thoại khác. Lệnh chờ quá 30 giây vẫn hiện chờ và không tự gửi lại. `command` không có lượng thực tế/thời gian hoàn tất trong hợp đồng; app không lấy cân của một yêu cầu khác gán vào lệnh này.

## Những điểm cần thống nhất với bạn làm firmware

1. **Đơn vị epoch:** tài liệu chỉ ghi tên trường. App hiện gửi `requestedAtEpoch` bằng **giây Unix** (`COMMAND_EPOCH_UNIT='seconds'` trong `src/firebase/config.ts`). Nếu firmware dùng mili giây, đổi thành `'milliseconds'`. Dữ liệu nhận vào chấp nhận số epoch giây hoặc mili giây ở thời điểm hiện nay; giá trị dưới `10^12` được hiểu là giây, số lớn hơn là mili giây. Không nhận chuỗi số; `0` là chưa báo thời gian, ngoại trừ cooldown `0` nghĩa không còn chờ.
2. **Heartbeat:** app mặc định yêu cầu `status.online=true`, `errorCode='none'`, `lastSeenEpoch` không quá **120 giây** và không ở tương lai quá 30 giây. Đây là ngưỡng thận trọng của app, không phải ngưỡng đã có trong hợp đồng. Firmware cần gửi heartbeat thường xuyên hơn ngưỡng này hoặc hai bên chỉnh `DEVICE_HEARTBEAT_MAX_AGE_MS`. Lúc gửi lệnh, app dùng `.info/serverTimeOffset` để bù giờ điện thoại; nhãn đếm thời gian trên giao diện vẫn dựa trên đồng hồ điện thoại.
3. **Cooldown:** ESP32 gửi `dogUntilEpoch` / `catUntilEpoch` tương ứng từng ngăn. Thiếu hoặc sai kiểu thì app khóa gửi thủ công cho ngăn đó.
4. **Chạy lịch:** `time` là `HH:MM`, không có ngày trong tuần/múi giờ trong contract. App hiểu đây là giờ chạy hằng ngày theo đồng hồ ESP32. Nhóm cần thống nhất múi giờ, thời điểm đặt lại bộ đếm ngày và quan hệ giữa `autoFeedEnabled` với lịch đã `enabled`. Dashboard chỉ gợi ý giờ cấu hình tiếp theo theo đồng hồ điện thoại, không xác nhận firmware đã lập lịch.
5. **Lịch sử:** firmware sẽ tạo node nhưng chưa cung cấp schema bản ghi. Định dạng app đọc được hiện mô tả dưới đây; cần đối chiếu với một bản ghi thật để chốt.
6. **AI:** Firmware V1 chưa yêu cầu AI. `latestDetection.speciesId='none'` nghĩa chưa có kết quả, không được hiển thị như phát hiện một con vật.

## Kiểm tra trước lệnh và trách nhiệm firmware

App kiểm tra kết nối Firebase, online/heartbeat/error, `runtime/feeding/status`, cooldown, cấu hình hợp lệ và giới hạn ngày dựa trên lịch sử đã nhận. Phần giới hạn ngày tính từ 00:00 trên điện thoại và chỉ cộng lượng đo ở bản ghi `completed` có thời gian hợp lệ. Nếu firmware chưa có lịch sử hoặc cấu trúc chưa được hỗ trợ, con số này chưa phản ánh đầy đủ ngày đó.

**ESP32 phải kiểm tra lại trước khi mở servo**: phần cứng/lỗi cảm biến, hạn mức ngày, cooldown, requestId đã xử lý, tuổi lệnh, trạng thái đang cho ăn và giới hạn vận hành của máy. Các kiểm tra runtime của app diễn ra trước transaction và không tạo khóa nguyên tử trên phần cứng. SDK có thể tiếp tục ghi một yêu cầu đang chờ khi mạng trở lại; firmware cần bỏ qua lệnh quá cũ theo ngưỡng nhóm thống nhất. Không tự chạy lại lệnh sau restart chỉ vì trạng thái vẫn pending.

Không có ứng dụng giả lập thiết bị chạy trong bản bàn giao này. Test trong `__tests__` dùng dữ liệu giả trong bộ nhớ, không điều khiển Firebase thật hay servo.

## Định dạng lịch sử adapter hiện hỗ trợ

Đây là **định dạng đề xuất cho phần chưa được hợp đồng định nghĩa**, không phải kết luận đã kiểm tra firmware. Ví dụ `feedingHistory/{pushId}`:

```json
{
  "requestId": "cung-ID-voi-command",
  "speciesId": "dog",
  "mode": "manual",
  "targetGrams": 80,
  "actualGrams": 79.6,
  "result": "completed",
  "completedAtEpoch": 1800000000
}
```

| Trường                       | Adapter đọc                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `speciesId`                  | Bắt buộc `dog` hoặc `cat`                                                            |
| `targetGrams`, `actualGrams` | Bắt buộc là số hữu hạn >= 0; không suy ra actual từ target                           |
| `result`                     | `completed`, `failed`, `cancelled`; có thể dùng trường `status` thay `result`        |
| Thời gian                    | `completedAtEpoch` hoặc `timestampEpoch` dạng số; hoặc `timestamp` dạng ISO/số epoch |
| `mode`                       | `manual` hoặc `automatic`; thiếu/khác thì hiển thị `unknown`                         |
| `requestId`                  | Để đối chiếu với yêu cầu thủ công; không bắt buộc cho bản ghi tự động                |

Thiếu lượng đo, loài hoặc kết quả hợp lệ: app bỏ qua bản ghi và báo trên Dashboard rằng thống kê có thể thiếu. Thiếu thời gian: vẫn hiện bản ghi nhưng ghi “Time not reported” và không cộng vào biểu đồ/ngày. Không tự thêm bản ghi giả để lấp chỗ trống.

Khi firmware dùng tên trường khác, sửa adapter tại `src/firebase/deviceContract.ts` và thêm bản ghi thật đã bỏ thông tin riêng vào fixture kiểm thử. Không cần đổi toàn bộ giao diện.

## Cấu hình và lịch

- Profile ghi đúng `portionGrams`, `dailyLimitGrams`, `cooldownMinutes`, `autoFeedEnabled`, `notificationsEnabled`; tên, emoji và mô tả ngăn chỉ là thông tin giao diện.
- Lịch ghi đúng `time`, `portionGrams`, `enabled`. App dùng ID nội bộ `dog/{key}` hoặc `cat/{key}` để tránh sửa nhầm hai lịch trùng key.
- Lịch mới mặc định tắt. Sửa lịch giữ nguyên loài; muốn chuyển ngăn, xóa lịch cũ rồi tạo lịch mới.
- Xóa lịch là xóa đúng child node; sửa/bật/tắt không được tạo lại lịch đã bị người khác xóa.
- Config dùng chung thiết bị: hai tài khoản được cấp quyền nhìn thấy cùng lịch và khẩu phần. App không dùng lịch theo user như bản v3.
- Không có ACK áp dụng config từ ESP32 trong contract. “Saved to Firebase” chỉ xác nhận ghi config, không khẳng định firmware đã áp dụng.

## Phân quyền

App tiếp tục dùng Firebase Authentication Email/Password. Bạn phụ trách Firebase cần kiểm tra Rules đang triển khai:

- Chỉ tài khoản được nhóm cấp quyền đọc thiết bị và sửa config/gửi lệnh.
- Tài khoản app không được ghi `status`, `runtime` hoặc tự tạo lịch sử; ESP32 có danh tính/quyền riêng để ghi các node này.
- Transaction `command` cần quyền đọc và ghi đúng node. Quy tắc nên kiểm tra các trường, loài, lượng, trạng thái chuyển và không để người dùng giả trạng thái hoàn thành.
- Không dùng quy tắc ghi rộng ở node cha để rồi mong quy tắc ở node con giới hạn lại: quyền ở cha có thể cấp truy cập cho cả cây.
- Cấu trúc Rules/IAM hiện tại chưa được gửi cùng hợp đồng nên bản app này **không triển khai Rules** và không thêm mô hình phân quyền mới vào RTDB. File Rules demo cũ và cấu hình deploy Rules tương ứng đã được bỏ để tránh triển khai nhầm.

Tài khoản Android Firebase đã đúng package. `google-services.json` không cấp quyền quản trị và không thay thế Security Rules. Tài liệu chính thức: [điều kiện Security Rules](https://firebase.google.com/docs/database/security/rules-conditions), [đọc/ghi RTDB với React Native Firebase](https://rnfirebase.io/database/usage).

## Phạm vi chưa có trong bản này

- Chưa có firmware ESP32 và thiết bị thật để xác nhận servo/load cell, chạy lịch, chống cho ăn lặp và thực thi cooldown/hạn mức.
- Chưa có schema lịch sử chính thức hoặc bản ghi thực tế từ firmware mới.
- Chưa có backend gửi FCM hay schema token của contract mới; không bật push bằng cờ cấu hình trước khi thống nhất và bổ sung tích hợp.
- Không tự import JSON gốc, di chuyển dữ liệu cũ, thay project Firebase hay thay Rules trên server.
