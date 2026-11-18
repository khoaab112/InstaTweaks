# 🎯 KẾ HOẠCH TRIỂN KHAI CHÍNH THỨC - INSTATWEAKS v3.0 (ĐÃ ĐIỀU CHỈNH)

> **Phiên bản khởi đầu**: `v3.0.0`  
> **Trạng thái**: Đã thống nhất & sẵn sàng thực hiện!  
> **Lộ trình**: 5 Phase tuần tự  

---

## 🧭 CÁC NGUYÊN TẮC THIẾT KẾ ĐÃ ĐƯỢC CHỐT
1. 🎚️ **Làm nét Video**: Giao diện chỉ có **1 nút gạt Toggle (Bật / Tắt)** duy nhất. Logic kỹ thuật (ép 1080p + SVG/CSS filter) tự động chạy ngầm.
2. 💾 **Lưu trữ IndexedDB**: Lưu cục bộ an toàn, không mất khi đóng tab; hỗ trợ sẵn **Nút Xuất Backup (.json)** và **Khôi phục (Restore)** 1 cú click.
3. 📦 **Kiến trúc v3**: Tách riêng biệt hoàn toàn với các tính năng cũ (Media Player & Tải Profile ZIP), giao diện tổng thể v3 sẽ chờ phương án thiết kế cụ thể từ bạn.

---

## 🗺️ TỔNG QUAN LỘ TRÌNH (5 PHASES)

```mermaid
flowchart TD
    A["🚀 Phase 1: v3.0.0\nStealth Privacy, Video HD (1 nút gạt) & Quick Inspector"] --> B["📦 Phase 2: v3.1.0\nWatchlist, Safe Scanner & Backup/Restore DB"]
    B --> C["⚡ Phase 3: v3.2.0\nDiffing Engine (Follow/Unfollow) & Mutual Follow"]
    C --> D["📊 Phase 4: v3.3.0\nProfile History Audit & Growth Charts"]
    D --> E["🔔 Phase 5: v3.4.0\nAlerts, Daily Digest & Giao diện v3 theo thiết kế riêng"]
```

---

## 📋 CHI TIẾT TỪNG PHIÊN BẢN

### 🟢 PHASE 1: BẢN v3.0.0 (ĐÃ HOÀN THÀNH 100% ✅)
- [x] **1. Nâng cấp Version**: Cập nhật `manifest.json` lên `version: "3.0.0"`.
- [x] **2. Nút Sidebar v3 & Drawer Panel**:
  - Nút icon con ma pixel xanh (`ghost.png`) đặt tại vị trí thanh navigation bên trái (dưới logo Instagram, trên icon Home).
  - Khi click: Mở Drawer trượt từ bên trái với tiêu đề **INSTATWEAKS v3.0**.
- [x] **3. Ghost Story Viewer**: Chặn triệt để request `POST .../stories/reel/seen/` và GraphQL `mark_seen` (xem story ẩn danh, không tăng view).
- [x] **4. Ghost DM Reader**: Chặn request báo đã đọc `direct_v2/threads/.../seen/` (đọc tin nhắn ẩn danh).
- [x] **5. Clean Feed AdBlock**: Lọc bỏ hoàn toàn các bài viết `is_sponsored: true` và Sponsored text khỏi Newfeed.
- [x] **6. Chế độ làm nét Video HD**:
  - Giao diện: 1 nút gạt Toggle bật/tắt duy nhất.
  - Ngầm: Ép luồng 1080p + Bộ lọc SVG/CSS Convolution Filter làm sắc nét viền, tăng contrast và màu sắc thời gian thực.
- [x] **7. Quick Profile Inspector**: Hiển thị User ID số thực tế, Bio links mở rộng, Website trong Drawer khi ở Profile bất kỳ.
- [x] **8. Nền tảng IndexedDB (Kèm module Export/Import Backup)**: Khởi tạo `InstaTweaksDB` lưu trữ an toàn, hỗ trợ sao lưu và khôi phục JSON 1 cú click.

---

### 🟢 PHASE 2: BẢN v3.1.0 (ĐÃ HOÀN THÀNH 100% ✅)
- [x] **1. Nâng cấp Version**: Cập nhật `manifest.json` và Header Drawer lên `v3.1.0`.
- [x] **2. Gỡ bỏ Profile Inspector**: Loại bỏ hoàn toàn khối soi User ID thừa thãi, dọn dẹp Sidebar tinh gọn, sang trọng.
- [x] **3. Nút "+ Watchlist" thông minh trên Profile Header**:
  - Tự động gắn nút `+ Watchlist` / `★ Trong Watchlist` trên Header trang cá nhân bất kỳ.
  - 1-click thêm/xem tài khoản được giám sát bí mật.
- [x] **4. Quản lý Watchlist trong Drawer**:
  - Thanh tìm kiếm nhanh theo username / họ tên.
  - Nút "👤 Quét tôi" quét trực tiếp Follower/Following của tài khoản đang đăng nhập.
  - Danh thiếp từng user trong Watchlist với số lượng follower/following, lần quét gần nhất và nút xóa nhanh.
- [x] **5. Safe Scanner Engine (Chống Checkpoint/Rate-limit)**:
  - Cào Followers & Following theo lô 50 tài khoản qua REST Web API chuẩn xác.
  - Thuật toán **Smart Delay ngẫu nhiên 2.5s - 4.5s** giữa mỗi lượt cào, kèm thanh tiến độ thời gian thực (Progress Bar & Counter).
  - Nút **Tạm dừng / Tiếp tục** và **Dừng lại & Lưu dữ liệu** an toàn bất cứ lúc nào.
  - Tự động phát hiện Rate Limit 429 và dừng khẩn cấp để bảo vệ an toàn tuyệt đối cho tài khoản.
- [x] **6. Trình xem Snapshot, Bộ lọc & Xuất File (CSV / JSON)**:
  - Xem danh sách tài khoản đã quét kèm tích xanh, chế độ riêng tư, link profile.
  - Ô tìm kiếm live mượt mà.
  - Nút **Xuất CSV (Excel)**: Kèm ký tự UTF-8 BOM chuẩn tiếng Việt không lỗi font.
  - Nút **Xuất JSON**: Chuẩn cấu trúc phục vụ lưu trữ hoặc lập trình.
- [x] **7. Lưu trữ bền vững vào IndexedDB**: Toàn bộ dữ liệu Watchlist và các bản Snapshot được lưu cục bộ an toàn trong `InstaTweaksDB`, sẵn sàng làm nguyên liệu cho **Phase 3 (Diffing Engine)**.

---

### ⚡ PHASE 3: BẢN v3.2.0
- Thuật toán Snapshot Diffing ($T_1$ vs $T_0$).
- Báo cáo: Ai mới Follow mình, Ai vừa Unfollow mình, Mình mới Follow / vừa Unfollow ai.
- Báo cáo biến động Follow/Unfollow của User trong Watchlist.
- Phân tích Follow chung: Người cả 2 cùng follow, người cùng follow cả 2, quan hệ follow chéo.

---

### 📊 PHASE 4: BẢN v3.3.0
- Nhật ký thay đổi User (Audit Log): Đổi avatar, username, tên hiển thị, bio.
- Phát hiện nick bị đổi tên, khóa tài khoản hoặc xóa khỏi danh sách follow.
- Biểu đồ tăng trưởng trực quan (Growth Charts) theo tuần, tháng.
- Thống kê tỷ lệ biến động ròng (Follow mới vs Unfollow theo ngày).

---

### 🔔 PHASE 5: BẢN v3.4.0 (HOÀN THIỆN)
- Hệ thống cảnh báo Chrome Desktop Notifications khi bị unfollow hoặc biến động bất thường.
- Daily Digest: Bảng tổng kết biến động trong 24 giờ qua.
- **Giao diện v3 độc lập**: Triển khai giao diện chuyên biệt theo đúng phương án thiết kế của bạn.
