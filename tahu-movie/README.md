# TaHu Cinema - Web Xem Phim NguonC (Cấu Trúc Tách File Mô-đun)

Dự án này được tối ưu hóa và tách nhỏ toàn bộ cấu trúc từ file HTML đơn khối ban đầu thành hệ thống tệp tin rõ ràng, chuẩn ES Modules, dễ dàng bảo trì, thêm bớt tính năng và tuỳ chỉnh giao diện.

---

## 📁 Cấu trúc thư mục dự án

```
tahu-movie/
├── index.html                    # File HTML chính (Giao diện sạch sẽ, chỉ chứa khung markup)
├── README.md                     # Hướng dẫn chi tiết dự án
└── assets/
    ├── css/
    │   └── style.css             # Toàn bộ mã CSS được gom nhóm chuyên nghiệp & responsive
    └── js/
        ├── app.js                # Entry point chính điều phối toàn bộ luồng ứng dụng
        └── modules/
            ├── config.js         # Cấu hình API, mật khẩu truy cập, khóa lưu trữ LocalStorage
            ├── utils.js          # Các hàm tiện ích dùng chung (Toast, Cache, URL, Format text)
            ├── api.js            # Gọi các API nguồn phim (Tìm kiếm, Phân trang, Chi tiết tập)
            ├── storage.js        # Quản lý Danh sách Yêu thích & Lịch sử xem phim
            ├── ui.js             # Render Card phim, Skeleton loading
            ├── hero.js           # Slider Banner phim nổi bật (vuốt cảm ứng, phím mũi tên)
            └── player.js         # Trình phát video đa chế độ (iFrame/HLS), điều khiển Server & Tập
```

---

## 💡 Phân tích các mô-đun và chức năng

### 1. `assets/js/modules/config.js`
Nơi bạn có thể tinh chỉnh các thông số của website mà không cần sửa code chức năng:
- `API_BASE`: Endpoint API của `phim.nguonc.com`.
- `ACCESS_PASSWORD`: Mật khẩu bảo vệ web (mặc định: `123456`, nếu muốn tắt chỉ cần đặt thành `""`).
- `CACHE_TTL`: Thời gian lưu đệm kết quả vào LocalStorage (mặc định 5 phút).
- `FETCH_TIMEOUT`: Giới hạn thời gian kết nối tới API để tránh treo web.

### 2. `assets/js/modules/api.js`
Xử lý toàn bộ logic gọi mạng:
- `fetchMovieList`: Lấy phim mới, phim lẻ, phim bộ, hoạt hình hoặc theo thể loại kèm phân trang.
- `searchMovies`: Tìm kiếm phim theo từ khóa.
- `fetchMovieDetail`: Tải chi tiết nội dung, diễn viên, đạo diễn và danh sách server/tập phim.
- `prefetchMovie`: Tự động tải trước dữ liệu phim khi người dùng rê chuột lên card.

### 3. `assets/js/modules/player.js`
Quản lý Modal và Video Player:
- Hỗ trợ 2 chế độ phát: **⚡ Siêu tốc (iFrame)** và **🌐 HLS Player (M3U8)** qua Plyr.js.
- Chuyển đổi giữa các Server nguồn mượt mà.
- Lưu tập đang xem vào LocalStorage và URL (hỗ trợ tính năng sao chép link tập phim để chia sẻ với bạn bè).

### 4. `assets/js/modules/hero.js`
- Slider phim nổi bật đầu trang.
- Tự động chuyển slide sau mỗi 6 giây.
- Hỗ trợ kéo chuột (Drag), vuốt trên màn hình điện thoại (Touch Swipe), và điều hướng bằng phím mũi tên trên bàn phím.

### 5. `assets/js/modules/storage.js`
- Quản lý danh sách phim Yêu thích (Favorites).
- Quản lý Lịch sử các phim/tập đã xem (History).
- Thuật toán ưu tiên kết quả tìm kiếm theo gu phim yêu thích của người dùng.

### 6. `assets/js/modules/ui.js`
- Render linh hoạt các thẻ Movie Card với nhãn tập, chất lượng, hiệu ứng hover mượt mà.
- Hiệu ứng Skeleton Loading mô phỏng khung hình khi chờ tải mạng.

---

## 🚀 Cách chạy dự án

Do dự án sử dụng chuẩn **JavaScript ES Modules** (`import` / `export`), trình duyệt yêu cầu chạy qua một HTTP Server cục bộ (local server) thay vì mở trực tiếp dạng `file://`:

### Cách 1: Sử dụng tiện ích Live Server trong VS Code
- Cài extension **Live Server** trong VS Code.
- Mở thư mục `tahu-movie`, nhấp chuột phải vào file `index.html` và chọn **"Open with Live Server"**.

### Cách 2: Sử dụng Python (có sẵn trên máy)
Mở Terminal/PowerShell tại thư mục `tahu-movie` và chạy:
```bash
python -m http.server 3000
```
Sau đó mở trình duyệt truy cập: `http://localhost:3000`

### Cách 3: Sử dụng Node.js (npx serve)
```bash
npx serve .
```
