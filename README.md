# 🎵 IG Web Music Player (v1.8.0 - Tối Ưu Tải Tin Nổi Bật Highlights & Story)

Extension dành cho các trình duyệt Chromium (Google Chrome, Microsoft Edge, Cốc Cốc, Brave...) giúp tự động phát hiện, chèn trình phát nhạc và tải toàn bộ ảnh/video chất lượng cao từ bài viết và Story trên Instagram Web desktop.

---

## ✨ Cải tiến trong phiên bản v1.8.0

1. **🎯 TRÍCH XUẤT CHUẨN XÁC 100% QUA REACT FIBER (Sửa triệt để lỗi tải nhầm Story ở Highlights):**
   * **Nguyên nhân ở Highlights (`/stories/highlights/...`):**
     * Trong Tin nổi bật (Highlights), URL chỉ có ID của cả bộ sưu tập Highlights (chứ không có ID riêng của từng story bên trong).
     * Khi xem các story tiếp theo trong Highlights, tiện ích trước đó không xác định được index của slide và bị fallback về tải nhầm story khác.
   * **Đã sửa triệt để:**
     * Trích xuất trực tiếp `props.item` từ cấu trúc **React Fiber** của Story slide đang mở trên màn hình (`getActiveStoryFromFiber`).
     * `props.item` chứa đầy đủ ID, loại media (`media_type`), link ảnh gốc `.jpg` và link video gốc `.mp4` của **chính xác slide bạn đang nhìn thấy**.
     * Hoạt động chính xác 100% trên cả Story người dùng (`/stories/username/`) lẫn Tin nổi bật (`/stories/highlights/id/`).

2. **🎬 XỬ LÝ CHUẨN ĐỊNH DẠNG THEO YÊU CẦU:**
   * Nếu Story là **Video** (hoặc ảnh được Instagram dựng thành video kèm hiệu ứng/nhạc): Tải về chuẩn file video **`.mp4`** hoàn chỉnh gồm cả hình ảnh và âm thanh.
   * Nếu Story là **Ảnh tĩnh**: Tải về file ảnh gốc **`.jpg`** chất lượng cao nhất.

---

## 🚀 Hướng dẫn cập nhật và kiểm tra

1. Mở trang quản lý tiện ích: `chrome://extensions` (hoặc `edge://extensions`).
2. Bấm biểu tượng **Tải lại (Reload 🔄)** tại thẻ tiện ích **IG Web Music Player** (phiên bản sẽ hiển thị **1.8.0**).
3. **F5 lại tab Instagram**:
   * Mở link Story thường (ví dụ: `https://www.instagram.com/stories/thuychaang_/`) -> Bấm tải Story đang xem.
   * Mở link Highlights (ví dụ: `https://www.instagram.com/stories/highlights/18080290825966972/`) -> Chuyển qua các slide khác nhau và bấm tải -> Tải chính xác từng slide đang xem!
