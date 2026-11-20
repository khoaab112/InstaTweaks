const fs = require('fs');

function patchRecommendedRatio(code) {
  // 1. Dọn dẹp các lời gọi updateRatioRecommendationUI bị lặp lại trước đây (nếu có)
  code = code.replace(/(updateRatioRecommendationUI\(\);\s*){2,}/g, 'updateRatioRecommendationUI();\n');

  // 2. Cập nhật khởi tạo template thanh tỉ lệ trong openStudio
  // Chuẩn Instagram:
  // - Bài viết (Post / Feed / Album): Gốc, 1:1, 4:5, 16:9 (Theo đúng thứ tự menu Instagram, KHÔNG có 9:16)
  // - Tin (Story) & Thước phim (Reel): 9:16 toàn màn hình chuẩn Instagram
  const oldRatioBarBlock = /<!-- Thanh chọn tỉ lệ[^>]*-->\s*<div class="igt-studio-ratio-bar">[\s\S]*?<\/div>/;
  const newRatioBarBlock = `<!-- Thanh chọn tỉ lệ chuẩn Instagram (Post: Gốc, 1:1, 4:5, 16:9 | Story/Reel: 9:16) -->
            <div class="igt-studio-ratio-bar">
              \${(studioState.mode === 'post') ? \`
                <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === 'original' ? 'active' : ''}" data-ratio="original" title="Gốc - Giữ nguyên tỉ lệ ảnh gốc">Gốc</button>
                <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === '1:1' ? 'active' : ''}" data-ratio="1:1" title="1:1 - Khung vuông Instagram">1:1</button>
                <button type="button" class="igt-studio-ratio-btn is-recommended \${studioState.ratio === '4:5' ? 'active' : ''}" data-ratio="4:5" title="4:5 ★ Dọc chuẩn Instagram (Tối ưu diện tích hiển thị feed nhất)">4:5</button>
                <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === '16:9' ? 'active' : ''}" data-ratio="16:9" title="16:9 - Khung ngang Instagram">16:9</button>
              \` : \`
                <button type="button" class="igt-studio-ratio-btn is-recommended active" data-ratio="9:16" title="9:16 ★ Toàn màn hình chuẩn Story & Reel (1080×1920)">9:16</button>
              \`}
            </div>`;

  if (oldRatioBarBlock.test(code)) {
    code = code.replace(oldRatioBarBlock, newRatioBarBlock);
    console.log('[patchRecommendedRatio] 1. Updated initial ratio bar template to match Instagram native');
  }

  // 3. Cập nhật sự kiện chuyển Mode trong modal: tự động cập nhật lại danh sách nút tỉ lệ và tỉ lệ tương ứng
  const oldModeSwitchBlock = /if\s*\(m === 'story' \|\| m === 'reel'\)\s*\{\s*setRatio\('9:16'\);\s*\}\s*else\s*\{\s*setRatio\('4:5'\);\s*\}\s*(updateRatioRecommendationUI\(\);)?/;
  const newModeSwitchBlock = `if (m === 'story' || m === 'reel') {
          studioState.ratio = '9:16';
        } else {
          if (studioState.ratio === '9:16' || !['original', '1:1', '4:5', '16:9'].includes(studioState.ratio)) {
            studioState.ratio = 'original';
          }
        }
        renderRatioBar(modal);
        setRatio(studioState.ratio);`;

  if (oldModeSwitchBlock.test(code)) {
    code = code.replace(oldModeSwitchBlock, newModeSwitchBlock);
    console.log('[patchRecommendedRatio] 2. Updated mode switch to re-render ratio bar');
  }

  // 4. Định nghĩa hàm renderRatioBar, updateRatioRecommendationUI và setRatio
  const setRatioBlockRegex = /(function renderRatioBar\([\s\S]*?)?(function updateRatioRecommendationUI\(\)[\s\S]*?)?function setRatio\(ratioKey[\s\S]*?applyFitMode\(\);\s*updateMediaTransform\(\);\s*if \(pushHistory\) \{\s*takeSnapshot\('Change ratio'\);\s*\}\s*\}/;
  const newSetRatioBlock = `function renderRatioBar(modal) {
    if (!modal) modal = document.getElementById('igt-studio-modal');
    if (!modal) return;
    const bar = modal.querySelector('.igt-studio-ratio-bar');
    if (!bar) return;

    if (studioState.mode === 'post') {
      // Chuẩn bài viết Instagram (Post Feed / Album): CHỈ CÓ 4 TỈ LỆ theo đúng thứ tự menu Instagram: Gốc, 1:1, 4:5, 16:9 (KHÔNG CÓ 9:16)
      if (studioState.ratio === '9:16' || !['original', '1:1', '4:5', '16:9'].includes(studioState.ratio)) {
        studioState.ratio = 'original';
      }
      bar.innerHTML = \`
        <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === 'original' ? 'active' : ''}" data-ratio="original" title="Gốc - Giữ nguyên tỉ lệ ảnh gốc">Gốc</button>
        <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === '1:1' ? 'active' : ''}" data-ratio="1:1" title="1:1 - Khung vuông Instagram">1:1</button>
        <button type="button" class="igt-studio-ratio-btn is-recommended \${studioState.ratio === '4:5' ? 'active' : ''}" data-ratio="4:5" title="4:5 ★ Dọc chuẩn Instagram (Tối ưu diện tích hiển thị feed nhất)">4:5</button>
        <button type="button" class="igt-studio-ratio-btn \${studioState.ratio === '16:9' ? 'active' : ''}" data-ratio="16:9" title="16:9 - Khung ngang Instagram">16:9</button>
      \`;
    } else {
      // Tin (Story) và Thước phim (Reel): Luôn là định dạng dọc 9:16 toàn màn hình (1080×1920)
      if (studioState.ratio !== '9:16') {
        studioState.ratio = '9:16';
      }
      bar.innerHTML = \`
        <button type="button" class="igt-studio-ratio-btn is-recommended active" data-ratio="9:16" title="9:16 ★ Toàn màn hình chuẩn Story & Reel (1080×1920)">9:16</button>
      \`;
    }

    bar.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
      btn.onclick = () => {
        const r = btn.getAttribute('data-ratio');
        setRatio(r);
      };
    });
  }

  function updateRatioRecommendationUI() {
    const modal = document.getElementById('igt-studio-modal');
    if (!modal) return;
    renderRatioBar(modal);
  }

  function setRatio(ratioKey, pushHistory = true) {
    studioState.ratio = ratioKey;
    const modal = document.getElementById('igt-studio-modal');
    if (!modal) return;

    modal.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
      const r = btn.getAttribute('data-ratio');
      btn.classList.toggle('active', r === ratioKey);
      btn.classList.toggle('is-recommended', (studioState.mode === 'post' ? r === '4:5' : r === '9:16'));
    });

    const frame = modal.querySelector('#igt-studio-phone-frame');
    if (!frame) return;

    const cfg = RATIO_CONFIGS[ratioKey] || RATIO_CONFIGS['4:5'];
    if (ratioKey === 'original' && studioState.naturalWidth && studioState.naturalHeight) {
      // Tính toán kích thước vừa vặn cho tỉ lệ gốc (Trong Bài viết giới hạn từ 4:5 đến 1.91:1 như Instagram)
      let aspect = studioState.naturalWidth / studioState.naturalHeight;
      if (studioState.mode === 'post') {
        if (aspect < 0.8) aspect = 0.8;
        if (aspect > 1.91) aspect = 1.91;
      }
      let w = 380;
      let h = Math.round(w / aspect);
      if (h > 540) {
        h = 540;
        w = Math.round(h * aspect);
      }
      frame.style.setProperty('width', w + 'px', 'important');
      frame.style.setProperty('height', h + 'px', 'important');
    } else {
      frame.style.setProperty('width', cfg.frameW + 'px', 'important');
      frame.style.setProperty('height', cfg.frameH + 'px', 'important');
    }

    applyFitMode();
    updateMediaTransform();
    if (pushHistory) {
      takeSnapshot('Change ratio');
    }
  }`;

  if (setRatioBlockRegex.test(code)) {
    code = code.replace(setRatioBlockRegex, newSetRatioBlock);
    console.log('[patchRecommendedRatio] 3. Replaced setRatio and ratio recommendation engine');
  }

  return code;
}

module.exports = { patchRecommendedRatio };
