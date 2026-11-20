# Bộ Quy Tắc Vận Hành Bắt Buộc Của Dự Án InstaTweaks (Strict Operational Rules)

> ⚠️ **LƯU Ý CỐT TỬ DÀNH CHO MỌI AI AGENT (ANTIGRAVITY / GEMINI / CLAUDE / CURSOR / CODEX):**
> Bạn đang làm việc trên extension Chrome production với các tệp mã nguồn rất lớn (>600 KB, >13.000 dòng). Người dùng **TUYỆT ĐỐI KHÔNG CHẤP NHẬN** bất kỳ lỗi cú pháp ngớ ngẩn nào (`Unexpected token`, `Unexpected identifier`, `Unclosed backticks`, template string bị hỏng, ngoặc thừa/thiếu, tệp rác thừa thãi). Mọi vi phạm đều bị coi là không hoàn thành nhiệm vụ.

---

## 🚨 ĐIỀU 1: NGUYÊN TẮC "BẰNG CHỨNG KIỂM THỬ BẮT BUỘC" (MANDATORY PROOF OF AUDIT)
Trước khi đưa ra bất kỳ phản hồi bàn giao nào cho người dùng (hoặc tuyên bố "đã sửa xong", "đã hoàn tất"):
1. Agent **BẮT BUỘC** phải chạy lệnh:
   ```bash
   node scripts/verify_codebase.js
   ```
2. **YÊU CẦU BẰNG CHỨNG (PROOF REQUIREMENT)**: Trong câu trả lời phản hồi cho người dùng, Agent **BẮT BUỘC PHẢI TRÍCH DẪN KHỐI LOG THỰC TẾ** kết quả chạy lệnh này, chứa dòng xác nhận:
   `✅ KẾT QUẢ: 100% CÁC FILE ĐỀU ĐẠT CHUẨN CÚ PHÁP & SẴN SÀNG BÀN GIAO!`
3. **CẤM TUYỆT ĐỐI**: Không được phép nói "Tôi đã kiểm tra và code hoạt động tốt" nếu không có log thực thi lệnh verify ngay trong turn đó. Mọi câu trả lời thiếu log chứng minh đều bị coi là vi phạm nghiêm trọng.

---

## 🚨 ĐIỀU 2: CHÍNH SÁCH "KIỂM TRA CÚ PHÁP TỨC THỜI" (ZERO-LAG SYNTAX CHECK)
1. **Kiểm tra ngay sau mỗi lần sửa (Immediate Check)**:
   - Ngay sau khi dùng `edit_file` hoặc `write_file` trên bất kỳ tệp JS nào, Agent phải chạy ngay:
     ```bash
     node --check <đường_dẫn_tệp>
     ```
   - Nếu có lỗi cú pháp, Agent **PHẢI DỪNG LẠI VÀ KHẮC PHỤC NGAY LẬP TỨC**, tuyệt đối không được tiếp tục sửa tệp khác hay chạy bước tiếp theo khi tệp hiện tại đang bị lỗi.
2. **Không để sót các lỗi cú pháp sơ đẳng**:
   - `Unexpected token 'else'`, `Unexpected token '}'`, `Unexpected token 'class'`.
   - Chuỗi mẫu (Template literals `` ` ``) bị thiếu đóng/mở hoặc quên escape dấu `\` bên trong chuỗi lồng nhau (`\${...}`).
   - Dấu ngoặc thừa hoặc thiếu (`{`, `}`, `(`, `)`, `[`, `]`).
   - Chuỗi cắt diff công cụ (`...[truncated for diff preview]`).
   - Lỗi cú pháp JSON trong `manifest.json`.

---

## 🚨 ĐIỀU 3: QUY CHUẨN BUILD STUDIO_CORE.JS (IDEMPOTENCY & TAIL RECOVERY)
Khi thao tác với `scripts/studio_core.js` (Studio Pro):
1. Không sửa trực tiếp tùy tiện các khối logic lớn bằng tay; phải sử dụng hoặc cập nhật qua script patch tương ứng (`scripts/patch_*.js`) hoặc `scripts/build_studio.js`.
2. Sau khi sửa, **bắt buộc chạy 2 lần liên tiếp**:
   ```bash
   node scripts/build_studio.js
   ```
3. Xác nhận cả 2 lần đều in: `7. VM SYNTAX CHECK: 100% SUCCESS!` và **kích thước byte của tệp phải giữ nguyên ổn định 100%** (Tính chất Idempotent - không bị phình to hay teo tóp sau mỗi lần build).

---

## 🚨 ĐIỀU 4: NGUYÊN TẮC "KHÔNG ĐỂ LẠI RÁC" (ZERO-GARBAGE POLICY)
1. Tuyệt đối không tạo các tệp nháp vụn vặt (dạng `temp_recover.js`, `api_match_*.js`, `edit_step_*.js`, `snippet_*.js`) rồi bỏ quên trong thư mục `temp/` hoặc thư mục gốc dự án.
2. Mọi tệp tạm phục vụ phân tích trong phiên làm việc phải được dọn dẹp (xóa) sạch sẽ trước khi bàn giao.
3. Thư mục dự án chỉ chứa đúng các tệp mã nguồn sạch sẽ, có mục đích rõ ràng.

---

## 🚨 ĐIỀU 5: NGUYÊN TẮC AN TOÀN HỆ THỐNG & NHÁNH
1. Chỉ làm việc trên branch hiện tại, không tự ý switch branch hay push code lên remote repository nếu người dùng chưa yêu cầu.
2. Tuân thủ triệt để Git Pre-commit hook: Nếu lệnh `node scripts/verify_codebase.js` trả về mã lỗi (`exit 1`), không được phép ép commit (`--no-verify`).
