# 🎵 IG Web Music Player (v2.0.0 - Thêm Nút Tải Profile Trọn Gói & Đóng Gói ZIP)

Extension dành cho các trình duyệt Chromium (Google Chrome, Microsoft Edge, Cốc Cốc, Brave...) giúp tự động phát hiện, chèn trình phát nhạc, tải toàn bộ ảnh/video chất lượng cao từ bài viết, Story, Highlights và **tải trọn gói toàn bộ dữ liệu Trang cá nhân (Profile) Instagram** đóng vào file `.ZIP`.

---

## ✨ Tính năng mới nổi bật trong phiên bản v2.0.0

### 🚀 NÚT DOWNLOAD PROFILE ĐẶT NGAY TRANG CÁ NHÂN (PROFILE HEADER):
1. **Vị trí hiển thị tinh tế chuẩn Instagram:**
   * Nút **"Tải Profile"** xuất hiện ngay cạnh biểu tượng bánh răng (Settings / Options) trên hàng trên cùng của Profile Header.
   * Giao diện bo góc hiện đại, icon tải sắc nét, tương thích hoàn hảo cả giao diện Sáng (Light) và Tối (Dark).

2. **4 Tùy chọn tải thông minh:**
   * 📦 **Tất cả (All in One)**: Tải toàn bộ Ảnh + Video bài viết + Story 24h đang phát + toàn bộ các album Tin nổi bật (Highlights) vào 1 file ZIP duy nhất.
   * 🖼️ **File ảnh (Photos only)**: Chỉ tải toàn bộ ảnh gốc độ phân giải cao nhất từ các bài viết (hỗ trợ đầy đủ bài viết đa ảnh / carousel).
   * 🎬 **File video (Videos & Reels)**: Chỉ tải toàn bộ video bài viết và Instagram Reels kèm âm thanh gốc chất lượng cao.
   * 💫 **Story & Highlights**: Tải trọn bộ Story 24h hiện tại và tất cả các slide trong toàn bộ album Tin nổi bật (Highlights).

3. **Tùy chọn giới hạn số lượng bài viết:**
   * Hỗ trợ chọn nhanh: "Tất cả bài viết (Toàn bộ)", "50 bài gần nhất", "30 bài gần nhất", "12 bài mới nhất" giúp người dùng linh hoạt tải theo nhu cầu mà không lo chờ đợi lâu với các tài khoản hàng nghìn bài.

4. **Trải nghiệm Dashboard Loading % & Đóng gói ZIP thời gian thực (VIP Experience):**
   * **Hiệu ứng tiến trình trực quan**: Chỉ số % siêu lớn, thanh progress bar chuyển màu gradient Instagram với vệt sáng lướt qua (shimmer animation).
   * **Thống kê thời gian thực**: Hiển thị số file đã tải, tổng dung lượng MB đã tải về và số luồng tải song song (3 worker concurrency).
   * **File Stream Ticker**: Hiển thị tên file và dung lượng từng file vừa tải xong để người dùng an tâm theo dõi nội dung đang về máy.
   * **Nút "Dừng & Nén ngay"**: Cho phép người dùng dừng bất kỳ lúc nào để đóng gói ngay lập tức số file đã tải được vào file ZIP mà không bị mất công chờ đợi.
   * **Đóng gói ZIP cấu trúc thư mục ngăn nắp & hỗ trợ UTF-8 chuẩn PKZIP 2.0**:
     - `posts/`: Ảnh và video bài viết
     - `stories/`: Story 24h
     - `highlights/[Tên_Album]/`: Các slide theo từng album Tin nổi bật
   * **Màn hình chúc mừng (Celebration Screen)**: Hiển thị icon tích xanh rực rỡ, tổng kết số file, dung lượng và tự động kích hoạt tải file ZIP về máy.

---

## 🚀 Hướng dẫn cập nhật và kiểm tra

1. Mở trang quản lý tiện ích: `chrome://extensions` (hoặc `edge://extensions`).
2. Bật chế độ dành cho nhà phát triển (Developer mode) nếu chưa bật.
3. Bấm biểu tượng **Tải lại (Reload 🔄)** tại thẻ tiện ích **IG Web Music Player** (phiên bản sẽ hiển thị **2.0.0**).
4. **F5 lại tab Instagram**:
   * Truy cập vào bất kỳ trang cá nhân (Profile) nào (ví dụ: profile của bạn hoặc bạn bè).
   * Nhìn vào hàng trên cùng cạnh nút bánh răng Settings / Options -> Bạn sẽ thấy nút **"Tải Profile"**.
   * Bấm nút -> Chọn chế độ muốn tải -> Tận hưởng trải nghiệm thanh loading % và nhận file ZIP trọn gói!
