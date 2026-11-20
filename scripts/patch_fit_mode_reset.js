const fs = require('fs');

function patchFitModeReset(code) {
  // 1. Thêm nút [↺ Đặt lại] vào tiêu đề "Kiểu hiển thị khung hình"
  const oldTitle = '<div class="igt-studio-setting-title">Kiểu hiển thị khung hình</div>';
  const newHeader = `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">Kiểu hiển thị khung hình</div>
            <button type="button" class="igt-btn-reset-fit-transform" title="Đưa ảnh/video về vị trí ban đầu cân đối và đẹp nhất trong khung hình" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.18s ease;">
              <span>↺</span>
              <span>Đặt lại</span>
            </button>
          </div>`;

  if (code.includes(oldTitle)) {
    code = code.split(oldTitle).join(newHeader);
    console.log('[patchFitModeReset] 1. Replaced "Kiểu hiển thị khung hình" titles with reset button');
  }

  // 2. Thêm hàm resetMediaTransformToDefault
  if (!code.includes('function resetMediaTransformToDefault()')) {
    const fnCode = `  function resetMediaTransformToDefault() {
    studioState.zoom = 1;
    studioState.panX = 0;
    studioState.panY = 0;
    studioState.rotation = 0;
    studioState.freeAngle = 0;
    studioState.flipH = false;
    studioState.flipV = false;
    studioState.fitMode = 'blur_fit';

    if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
      const cur = studioState.mediaList[studioState.activeMediaIndex];
      cur.zoom = 1;
      cur.panX = 0;
      cur.panY = 0;
      cur.rotation = 0;
      cur.freeAngle = 0;
      cur.flipH = false;
      cur.flipV = false;
      cur.fitMode = 'blur_fit';
    }

    const mediaEl = document.getElementById('igt-studio-active-media');
    if (mediaEl) {
      mediaEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      setTimeout(() => {
        if (mediaEl) mediaEl.style.transition = '';
      }, 240);
    }

    applyFitMode();
    updateMediaTransform();

    const tabZoomSlider = document.getElementById('igt-tab-zoom-slider');
    if (tabZoomSlider) tabZoomSlider.value = '1';
    const tabZoomVal = document.getElementById('igt-tab-zoom-val');
    if (tabZoomVal) tabZoomVal.innerText = '100%';

    const bottomZoomSlider = document.getElementById('igt-studio-zoom-slider');
    if (bottomZoomSlider) bottomZoomSlider.value = '1';

    const angleSlider = document.getElementById('igt-slider-free-angle');
    if (angleSlider) angleSlider.value = '0';
    const valAngle = document.getElementById('igt-free-angle-val');
    if (valAngle) valAngle.innerText = '0°';

    const modal = document.getElementById('igt-studio-modal');
    if (modal) {
      modal.querySelectorAll('.igt-studio-fit-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-fit') === 'blur_fit');
      });
    }

    takeSnapshot('Đặt lại vị trí ban đầu');
  }
`;
    const targetPlace = '  function applyFitMode() {';
    if (code.includes(targetPlace)) {
      code = code.replace(targetPlace, fnCode + '\n' + targetPlace);
      console.log('[patchFitModeReset] 2. Added resetMediaTransformToDefault function');
    }
  }

  // 3. Gắn sự kiện click cho .igt-btn-reset-fit-transform trong setupStudioEventListeners
  const setupTarget = "const btnClose = modal.querySelector('#igt-studio-close-btn');";
  const setupReplacement = `const btnClose = modal.querySelector('#igt-studio-close-btn');
    modal.querySelectorAll('.igt-btn-reset-fit-transform').forEach(b => {
      b.onclick = () => resetMediaTransformToDefault();
    });`;

  if (!code.includes("modal.querySelectorAll('.igt-btn-reset-fit-transform')") && code.includes(setupTarget)) {
    code = code.replace(setupTarget, setupReplacement);
    console.log('[patchFitModeReset] 3. Bound reset button in setupStudioEventListeners');
  }

  // 4. Gắn sự kiện click cho .igt-btn-reset-fit-transform trong renderTabContent
  const renderTabTarget = "container.querySelectorAll('.igt-studio-fit-btn').forEach(b => {";
  const renderTabReplacement = `container.querySelectorAll('.igt-btn-reset-fit-transform').forEach(b => {
        b.onclick = () => resetMediaTransformToDefault();
      });

      container.querySelectorAll('.igt-studio-fit-btn').forEach(b => {`;

  if (!code.includes("container.querySelectorAll('.igt-btn-reset-fit-transform')") && code.includes(renderTabTarget)) {
    code = code.replace(renderTabTarget, renderTabReplacement);
    console.log('[patchFitModeReset] 4. Bound reset button in renderTabContent');
  }

  return code;
}

module.exports = { patchFitModeReset };

if (require.main === module) {
  let c = fs.readFileSync('scripts/studio_core.js', 'utf8');
  c = patchFitModeReset(c);
  fs.writeFileSync('scripts/studio_core.js', c, 'utf8');
  console.log('Successfully patched studio_core.js with Fit Mode Reset!');
}
