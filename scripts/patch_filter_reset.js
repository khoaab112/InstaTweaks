const fs = require('fs');

function patchFilterReset(fullCode) {
  const oldHeader = `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">🎨 BỘ LỌC MÀU INSTAGRAM</div>
            <span style="font-size: 10px; color: #38bdf8; font-weight: 600;">\${IMAGE_FILTERS.find(f => f.id === studioState.imageFilter)?.name || 'Gốc'}</span>
          </div>`;

  const newHeader = `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">🎨 BỘ LỌC MÀU INSTAGRAM</div>
            <button type="button" id="igt-btn-reset-insta-filter" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.18s ease;" title="Đặt lại về ảnh gốc (Không áp dụng bộ lọc)">
              <span>↺</span>
              <span>Gốc</span>
            </button>
          </div>`;

  if (fullCode.includes(oldHeader)) {
    fullCode = fullCode.replace(oldHeader, newHeader);
  }

  const oldChipEvent = `        // 2. Bộ lọc màu Instagram
        container.querySelectorAll('.igt-filter-chip').forEach(chip => {`;

  const newChipEvent = `        // 2. Bộ lọc màu Instagram
        const btnResetFilter = container.querySelector('#igt-btn-reset-insta-filter');
        if (btnResetFilter) {
          btnResetFilter.onclick = () => {
            studioState.imageFilter = 'normal';
            if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
              studioState.mediaList[studioState.activeMediaIndex].imageFilter = 'normal';
            }
            container.querySelectorAll('.igt-filter-chip').forEach(c => {
              c.classList.toggle('active', c.getAttribute('data-filter') === 'normal');
            });
            applyMediaFilters();
            takeSnapshot('Reset Bộ lọc gốc');
          };
        }

        container.querySelectorAll('.igt-filter-chip').forEach(chip => {`;

  if (!fullCode.includes('igt-btn-reset-insta-filter') && fullCode.includes(oldChipEvent)) {
    fullCode = fullCode.replace(oldChipEvent, newChipEvent);
  } else if (fullCode.includes('igt-btn-reset-insta-filter') && !fullCode.includes('btnResetFilter =') && fullCode.includes(oldChipEvent)) {
    fullCode = fullCode.replace(oldChipEvent, newChipEvent);
  }

  return fullCode;
}

module.exports = { patchFilterReset };
