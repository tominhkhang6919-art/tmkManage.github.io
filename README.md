# TMK Manage Money

Ứng dụng quản lý thu chi cá nhân. Mở `index.html`, xem splash TMK rồi ứng dụng tự chuyển thẳng vào dashboard; không cần màn hình hay thao tác đăng nhập.

## Cấu trúc dự án

```text
Manage_money/
├── index.html          # Splash TMK và chuyển đến dashboard
├── dashboard.html      # Trang quản lý thu chi
├── supabase_schema.sql # Schema và chính sách RLS của Supabase
├── css/
│   └── style.css       # Giao diện, theme, animation, responsive
└── js/
    ├── supabaseClient.js # Kết nối Supabase và tiện ích tiền tệ
    ├── auth.js           # Tạo phiên Supabase ẩn danh và quản lý profile
    └── dashboard.js      # Thu chi, realtime và cài đặt
```

## Cấu hình Supabase

1. Trong Supabase, mở **SQL Editor**, chạy toàn bộ `supabase_schema.sql` để tạo các bảng và chính sách RLS. Có thể chạy lại script an toàn khi dự án đã có một phần schema; script bổ sung các cột còn thiếu trên `transactions`, gồm `local_id` để đồng bộ lặp an toàn, gỡ ràng buộc bắt buộc của cột `description` cũ nếu có, và giữ lại dữ liệu hiện có.
2. Vào **Authentication → Sign In / Providers** và bật **Anonymous Sign-Ins**. Ứng dụng cần nhà cung cấp này để tự tạo phiên an toàn mà không hiện màn hình đăng nhập.
3. Mở **Project Settings → API** và xác nhận URL cùng anon/public key trong `js/supabaseClient.js` khớp với dự án.

Giao dịch và hồ sơ được lưu trên Supabase theo phiên người dùng, với RLS chỉ cho phép phiên đó truy cập dữ liệu của chính nó. Phiên được lưu trong trình duyệt để những lần mở sau tiếp tục dùng cùng dữ liệu.

Nếu Supabase báo Anonymous Sign-Ins đang tắt, ứng dụng tự chuyển sang lưu cục bộ bằng `localStorage` và hiển thị thông báo; dữ liệu chưa được đồng bộ lên đám mây trong thời gian này. Khi bật Anonymous Sign-Ins và mở lại ứng dụng, dữ liệu cục bộ sẽ tự được chuyển lên phiên Supabase hiện tại. Việc chuyển dùng ID cục bộ duy nhất để có thể thử lại an toàn nếu quá trình đồng bộ bị gián đoạn; chỉ xóa bản cục bộ sau khi tất cả giao dịch đã được Supabase xác nhận. Nếu việc đồng bộ thất bại, ứng dụng báo lỗi và giữ nguyên dữ liệu cục bộ.

> Phiên ẩn danh gắn với trình duyệt/thiết bị hiện tại. Nếu xóa dữ liệu trang web hoặc dùng trình duyệt/thiết bị khác, ứng dụng không thể khôi phục phiên cũ; dữ liệu vẫn nằm trên Supabase nhưng sẽ không thể truy cập từ phiên mới.

## Chạy ứng dụng

Mở `index.html` bằng Live Server trong VS Code hoặc một web server cục bộ. Không mở bằng `file://`; Supabase cần ứng dụng được phục vụ qua HTTP/HTTPS.

## Tính năng

| Tính năng | Mô tả |
|---|---|
| Splash TMK | Tự chuyển thẳng vào ứng dụng |
| Phiên ẩn danh | Không yêu cầu đăng nhập; giữ phiên và dữ liệu trên cùng trình duyệt |
| Số dư | Hiển thị/ẩn số dư |
| Thu và chi | Thêm, sửa, xóa từng giao dịch hoặc xóa theo ngày/tháng/năm |
| Thống kê | Tổng hợp theo ngày/tháng/năm |
| Chi tiết | Lọc, sắp xếp và phân trang giao dịch |
| Đồng bộ | Lưu dữ liệu và nhận cập nhật realtime qua Supabase |
| 8 vùng tiền tệ | VN/US/UK/EU/CN/JP/KR/DE |
| 3 giao diện | Xanh da trời / Xanh lá / Vàng nhạt |
| Avatar | Chọn emoji hoặc URL ảnh |
