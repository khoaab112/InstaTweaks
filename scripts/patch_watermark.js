const fs = require('fs');

function patchWatermark(fullCode) {
  // 1. Thêm globalWatermarkColor vào studioState nếu chưa có
  if (!fullCode.includes('globalWatermarkColor:')) {
    fullCode = fullCode.replace(
      "globalWatermarkOpacity: 75,",
      "globalWatermarkOpacity: 75,\n    globalWatermarkColor: '#ffffff',"
    );
  }

  // 2. Cập nhật renderStickers để áp dụng màu chữ ký trên preview
  fullCode = fullCode.replace(
    'let style = `position: absolute; color: #fff; font-size: 11.5px;',
    'let style = `position: absolute; color: ${studioState.globalWatermarkColor || "#ffffff"}; font-size: 11.5px;'
  );

  // 3. Cập nhật drawStickersOnExportCanvas để áp dụng màu chữ ký trên Canvas xuất Ultra HD
  fullCode = fullCode.replace(
    "ctx.font = `bold ${fontSize}px ${fontName}`;\n      ctx.fillStyle = '#ffffff';",
    "ctx.font = `bold ${fontSize}px ${fontName}`;\n      ctx.fillStyle = studioState.globalWatermarkColor || '#ffffff';"
  );

  // 4. Bỏ các mục gạch đỏ (badge Đồng bộ & dòng mô tả) và thêm bộ chọn Màu sắc chữ ký
  const oldWmHeader = `        <div class="igt-studio-setting-title" style="display: flex; align-items: center; justify-content: space-between;">
          <span>🏷️ Đóng dấu bản quyền (Watermark) toàn album</span>
          <span style="font-size: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.12); padding: 2px 7px; border-radius: 4px; font-weight: 700;">Đồng bộ \${count} slide</span>
        </div>
        <div style="font-size: 10.5px; color: #94a3b8; margin-bottom: 10px; line-height: 1.4;">
          Tự động chèn chữ ký, thương hiệu hoặc @username vào cùng vị trí trên toàn bộ các slide trong album bài viết.
        </div>`;

  const newWmHeader = `        <div class="igt-studio-setting-title">
          🏷️ Đóng dấu bản quyền (Watermark) toàn album
        </div>`;

  if (fullCode.includes(oldWmHeader)) {
    fullCode = fullCode.replace(oldWmHeader, newWmHeader);
  }

  // 5. Thêm giao diện chọn Màu sắc chữ ký sau phần chọn Kiểu font chữ ký
  const fontSectionOld = `            <option value="impact" \${studioState.globalWatermarkFont === 'impact' ? 'selected' : ''}>💥 Đậm cá tính (Bold Impact)</option>
          </select>
        </div>`;

  const fontSectionWithColor = `            <option value="impact" \${studioState.globalWatermarkFont === 'impact' ? 'selected' : ''}>💥 Đậm cá tính (Bold Impact)</option>
          </select>
        </div>

        <!-- Thêm màu cho chữ ký bản quyền -->
        <div style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Màu sắc chữ ký:</label>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="color" id="igt-global-watermark-color-picker" value="\${studioState.globalWatermarkColor || '#ffffff'}" style="width: 22px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; background: transparent; cursor: pointer;" title="Tùy chọn màu tùy ý" />
              <span id="igt-global-watermark-color-hex" style="font-size: 10px; color: #94a3b8; font-family: monospace;">\${studioState.globalWatermarkColor || '#ffffff'}</span>
            </div>
          </div>
          <div style="display: flex; gap: 7px; flex-wrap: wrap;">
            \${[
              { color: '#ffffff', label: 'Trắng' },
              { color: '#000000', label: 'Đen' },
              { color: '#fbbf24', label: 'Vàng kim' },
              { color: '#ec4899', label: 'Hồng neon' },
              { color: '#38bdf8', label: 'Xanh lam' },
              { color: '#10b981', label: 'Xanh lục' },
              { color: '#ef4444', label: 'Đỏ' }
            ].map(c => \`
              <button type="button" class="igt-wm-color-btn \\\${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? 'active' : ''}" data-color="\${c.color}" style="width: 22px; height: 22px; border-radius: 50%; background: \${c.color}; border: 2px solid \\\${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? '#38bdf8' : 'rgba(255,255,255,0.2)'}; cursor: pointer; padding: 0; box-shadow: \\\${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none'};" title="\${c.label}"></button>
            \`).join('')}
          </div>
        </div>`;

  if (!fullCode.includes('igt-global-watermark-color-picker') && fullCode.includes(fontSectionOld)) {
    fullCode = fullCode.replace(fontSectionOld, fontSectionWithColor);
  }

  // 6. Đổi màu nhãn vị trí sang đồng bộ với hệ thống (#38bdf8 thay vì #22c55e)
  fullCode = fullCode.replace(
    '<span id="igt-wm-pos-label" style="font-size: 10.5px; color: #22c55e; font-weight: 700;">',
    '<span id="igt-wm-pos-label" style="font-size: 10.5px; color: #38bdf8; font-weight: 700;">'
  );

  // 7. Gắn sự kiện đổi màu chữ ký vào renderGeneralTabContent
  const oldEventsMarker = "const wmOpacity = container.querySelector('#igt-global-watermark-opacity');";
  const newColorEvents = `    const wmColorPicker = container.querySelector('#igt-global-watermark-color-picker');
    const wmColorHex = container.querySelector('#igt-global-watermark-color-hex');
    if (wmColorPicker) {
      wmColorPicker.oninput = (e) => {
        const c = e.target.value;
        studioState.globalWatermarkColor = c;
        if (wmColorHex) wmColorHex.innerText = c;
        container.querySelectorAll('.igt-wm-color-btn').forEach(btn => {
          const isAct = btn.getAttribute('data-color').toLowerCase() === c.toLowerCase();
          btn.style.borderColor = isAct ? '#38bdf8' : 'rgba(255,255,255,0.2)';
          btn.style.boxShadow = isAct ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none';
        });
        renderStickers();
      };
    }

    container.querySelectorAll('.igt-wm-color-btn').forEach(btn => {
      btn.onclick = () => {
        const c = btn.getAttribute('data-color');
        studioState.globalWatermarkColor = c;
        if (wmColorPicker) wmColorPicker.value = c;
        if (wmColorHex) wmColorHex.innerText = c;
        container.querySelectorAll('.igt-wm-color-btn').forEach(b => {
          const isAct = b === btn;
          b.style.borderColor = isAct ? '#38bdf8' : 'rgba(255,255,255,0.2)';
          b.style.boxShadow = isAct ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none';
        });
        renderStickers();
      };
    });

    const wmOpacity = container.querySelector('#igt-global-watermark-opacity');`;

  if (!fullCode.includes('wmColorPicker') && fullCode.includes(oldEventsMarker)) {
    fullCode = fullCode.replace(oldEventsMarker, newColorEvents);
  }

  return fullCode;
}

module.exports = { patchWatermark };
