# Chạy và kiểm tra với Firebase mới

Hướng dẫn mở VS Code, máy ảo và hai terminal nằm trong [README](../README.md). Thực hiện trên database/thiết bị mà nhóm dùng để kiểm thử. Các kiểm thử tự động của bản mã nguồn không gửi lệnh đến Firebase thật.

## 1. Đăng nhập và đọc dữ liệu

- Mở Firebase Console của `ai-smart-pet-feeder` → Realtime Database → Data.
- Mở `devices/feeder-01` và kiểm tra đã có `config`, `status`, `runtime`, `command` như contract.
- Trong app, đăng nhập tài khoản được cấp quyền. Dashboard phải hiện hai ngăn Dog/Cat.
- Nếu `permission-denied`: chủ Firebase kiểm tra quyền tài khoản đó. Tạo tài khoản không tự cấp quyền thiết bị. Sau khi sửa quyền, bấm **Try again** để đăng ký lại listener.
- Nếu thiếu `config`: nhờ bạn Firebase đối chiếu và bổ sung phần thiếu theo contract; không import đè toàn bộ JSON mẫu lên dữ liệu đang chạy.

## 2. Thử đọc/ghi cấu hình, chưa cần ESP32

- Profiles → Dog → ghi nhớ cooldown ban đầu → tăng 1 phút → Save.
- Firebase phải đổi đúng `config/speciesProfiles/dog/cooldownMinutes`. Cat không đổi.
- Khôi phục giá trị cooldown ban đầu và Save.
- Schedule → Add → chọn Cat → đặt giờ và lượng hợp lệ → Create. Lịch mới mặc định tắt.
- Firebase xuất hiện `config/schedules/cat/{key}` với đúng ba trường `time`, `portionGrams`, `enabled`.
- Sửa giờ; Firebase cập nhật cùng key. Xóa lịch vừa thử; đúng child đó biến mất.
- Nếu Dog và Cat cùng có `schedule-01`, sửa/xóa Dog không được ảnh hưởng Cat.
- Mở app trên máy khác bằng tài khoản được cấp quyền: thay đổi config phải đồng bộ. Không tìm lịch mới dưới `users/{uid}` nữa.

## 3. Thử Feed now với ESP32

- Xác nhận với bạn firmware đơn vị `requestedAtEpoch`, heartbeat, múi giờ và cơ chế nhận lệnh mới.
- Bật máy cho ăn. Firebase cần có `status.online=true`, `errorCode='none'`, heartbeat mới trong 120 giây; `runtime/feeding/status` là `idle` hoặc trạng thái kết thúc; cooldown của ngăn đã hết.
- Nếu nút bị khóa, xem lý do trên màn hình Feed now và thông tin Device status. Không tạo heartbeat giả để mở khóa máy đang chạy.
- Chọn đúng ngăn và lượng thử đã thống nhất với người vận hành → Request → xác nhận gửi.
- Quan sát `command`: app tạo requestId mới và trạng thái `pending`. ESP32 phải chuyển `processing`, rồi `completed`/`failed` mà giữ requestId.
- App phải hiện cùng trạng thái. Lượng cân trực tiếp ở `runtime/feeding` phải tương ứng ngăn đang chạy.
- Lệnh chờ lâu không tự gửi lại. Kiểm tra log/kết nối ESP32 và requestId; không đổi thủ công `pending` thành `completed` rồi gọi đó là thử phần cứng thành công.

## 4. Kiểm tra lịch chạy thật

- Khi máy và đồng hồ đã sẵn sàng, tạo lịch gần thời điểm hiện tại theo múi giờ ESP32.
- Chọn đúng ngăn, lượng; bật `enabled` và cấu hình `autoFeedEnabled` theo cách firmware đã thống nhất.
- Xác nhận ESP32 đọc config, đến giờ chạy đúng ngăn/đúng một lần và báo kết quả.
- Chỉ việc lịch có mặt trong Firebase chưa chứng minh phần hẹn giờ của firmware hoạt động. Sau thử, tắt hoặc xóa lịch thử để tránh chạy lại ngày sau.

## 5. Lịch sử, thống kê và thông báo

- Sau khi ESP32 hoàn tất, kiểm tra node **`feedingHistory`** (chữ H hoa), không phải node `feeding_history` của bản cũ.
- Đối chiếu record thực tế với [định dạng adapter](FIREBASE_HANDOFF.md#định-dạng-lịch-sử-adapter-hiện-hỗ-trợ).
- Màn History hiển thị lượng đo thật; Statistics chỉ tính bản ghi có thời gian hợp lệ. Bản ghi thiếu `mode` hiện Unknown.
- Feed screen chỉ liên kết lượng thực tế vào lệnh khi history có `requestId` khớp.
- Notifications hiển thị kết quả trong app nếu profile bật thông báo. Không phải thông báo đẩy khi app tắt; dấu đã đọc không đồng bộ giữa các điện thoại.
- Nếu `feedingHistory` chưa được firmware tạo hoặc dùng trường chưa hỗ trợ, màn hình rỗng/cảnh báo là đúng. Gửi một bản ghi thật cho người sửa adapter; không chèn lịch sử giả vào database để chứng minh thiết bị đã cho ăn.

## 6. Tình huống cần nhóm kiểm tra trước buổi demo

| Tình huống                            | Kết quả mong đợi                                                           |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Rút mạng ESP32                        | Heartbeat cũ quá ngưỡng hoặc online=false; app khóa yêu cầu mới            |
| App mất mạng                          | Hiện ngắt kết nối; không chủ động cho gửi yêu cầu mới                      |
| Hai điện thoại gửi đồng thời          | Một lệnh giành được slot; lệnh còn lại bị từ chối vì bận                   |
| Đang cooldown Dog                     | Dog bị khóa, Cat vẫn theo cooldown riêng                                   |
| Firmware báo lỗi                      | Không gửi thêm lệnh cho tới khi lỗi được giải quyết                        |
| App đóng/mở lại khi lệnh pending      | Hiện lệnh hiện có; không tự gửi lại                                        |
| Lệnh cũ quay lại sau mất mạng/restart | ESP32 kiểm tra requestId và tuổi lệnh; không cho ăn lặp                    |
| AI chưa tích hợp                      | App ghi chưa có nhận diện; chức năng thủ công vẫn phụ thuộc trạng thái máy |

Các mục phần cứng trong bảng cần nhóm thực hiện trên thiết bị thật; chúng chưa được xác minh bằng bộ kiểm thử JavaScript.
