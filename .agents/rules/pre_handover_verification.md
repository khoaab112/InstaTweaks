---
description: Mandatory pre-handover syntax verification, zero-lag check and audit log proof rule
trigger: always_on
---

# Quy Tắc Bắt Buộc Trước Khi Bàn Giao (Pre-Handover Verification Rule)

Trước khi đưa ra bất kỳ phản hồi bàn giao nào cho người dùng (hoặc tuyên bố hoàn thành / đã sửa xong):

1. **BẮT BUỘC CHẠY KIỂM THỬ TỰ ĐỘNG TOÀN BỘ CODEBASE**:
   ```bash
   node scripts/verify_codebase.js
   ```
2. **YÊU CẦU BẰNG CHỨNG (PROOF OF AUDIT)**:
   - Trong phản hồi bàn giao, Agent **BẮT BUỘC PHẢI TRÍCH DẪN KHỐI LOG THỰC TẾ** kết quả chạy lệnh này, chứa dòng xác nhận:
     `✅ KẾT QUẢ: 100% CÁC FILE ĐỀU ĐẠT CHUẨN CÚ PHÁP & SẴN SÀNG BÀN GIAO!`
   - Mọi câu trả lời bàn giao thiếu khối log này đều bị coi là vi phạm nghiêm trọng.

3. **KIỂM TRA CÚ PHÁP TỨC THỜI (ZERO-LAG)**:
   - Ngay sau mỗi lần chỉnh sửa file JS: chạy `node --check <file>` hoặc `node scripts/verify_codebase.js`.
   - Nếu có lỗi cú pháp, PHẢI DỪNG LẠI SỬA NGAY, tuyệt đối không sửa tiếp các phần khác khi file đang lỗi.

4. **KHÔNG ĐỂ SÓT LỖI CÚ PHÁP SƠ ĐẲNG**:
   - `Unexpected token 'else'`, `Unexpected token '}'`, `Unexpected token 'class'`.
   - Chuỗi mẫu (Template literals `` ` ``) bị thiếu đóng/mở hoặc quên escape dấu `\` trong template lồng nhau.
   - Thiếu/thừa dấu ngoặc `}`, `)`, `]`.
   - Chuỗi cắt diff `...[truncated`.
   - Lỗi logic JSON trong `manifest.json`.

5. **QUY TRÌNH BUILD STUDIO_CORE.JS (IDEMPOTENCY)**:
   - Chạy 2 lần `node scripts/build_studio.js` để đảm bảo kích thước byte file không thay đổi (Idempotent) và cả 2 lần đều in: `7. VM SYNTAX CHECK: 100% SUCCESS!`.

6. **CHÍNH SÁCH KHÔNG RÁC THỪA (ZERO-GARBAGE)**:
   - Không tạo và bỏ quên file tạm trong `temp/` hay thư mục dự án. Dọn sạch file nháp trước khi kết thúc turn.
