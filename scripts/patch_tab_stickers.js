const fs = require('fs');

function patchTabStickers(code) {
  // 1. Thêm isStickerMatchingActiveTab ngay sau getStickerTab
  const getTabDef = `  function getStickerTab(type) {
    if (type === 'text') return 'text';
    if (type === 'mention') return 'mentions';
    if (type === 'location') return 'location';
    if (type === 'link') return 'link';
    return 'stickers'; // poll, question, countdown, music_player, emoji_slider, add_yours, badge
  }`;

  const getTabWithMatcher = `  function getStickerTab(type) {
    if (type === 'text') return 'text';
    if (type === 'mention') return 'mentions';
    if (type === 'location') return 'location';
    if (type === 'link') return 'link';
    return 'stickers'; // poll, question, countdown, music_player, emoji_slider, add_yours, badge
  }

  function isStickerMatchingActiveTab(type) {
    const curTab = studioState.activeTab;
    if (!curTab) return false;
    return getStickerTab(type) === curTab;
  }`;

  if (code.includes(getTabDef) && !code.includes('function isStickerMatchingActiveTab')) {
    code = code.replace(getTabDef, getTabWithMatcher);
    console.log('[patchTabStickers] 1. Added isStickerMatchingActiveTab helper');
  }

  // 2. Cập nhật renderStickers để phân quyền hiển thị và pointer-events theo tab
  const oldStickerLoop = `    studioState.stickers.forEach(s => {
      const el = document.createElement('div');
      const isEditingThis = (studioState.activeEditingStickerId === s.id);
      el.className = 'igt-studio-sticker-item' + (s.anim ? ' anim-' + s.anim : '') + (isEditingThis ? ' is-active-editing' : '');
      el.setAttribute('data-id', s.id);
      el.style.left = s.x + '%';
      el.style.top = s.y + '%';
      el.style.setProperty('--stk-scale', s.scale || 1);
      el.style.transform = \`translate(-50%, -50%) scale(\${s.scale || 1})\`;`;

  const newStickerLoop = `    studioState.stickers.forEach(s => {
      const el = document.createElement('div');
      const isMatchingTab = isStickerMatchingActiveTab(s.type);
      const isEditingThis = isMatchingTab && (studioState.activeEditingStickerId === s.id);
      el.className = 'igt-studio-sticker-item' +
        (s.anim ? ' anim-' + s.anim : '') +
        (isEditingThis ? ' is-active-editing' : '') +
        (!isMatchingTab ? ' igt-stk-inactive-tab' : '');
      el.setAttribute('data-id', s.id);
      el.style.left = s.x + '%';
      el.style.top = s.y + '%';
      el.style.setProperty('--stk-scale', s.scale || 1);
      el.style.transform = \`translate(-50%, -50%) scale(\${s.scale || 1})\`;
      if (!isMatchingTab) {
        el.style.pointerEvents = 'none';
      }`;

  if (code.includes(oldStickerLoop)) {
    code = code.replace(oldStickerLoop, newStickerLoop);
    console.log('[patchTabStickers] 2. Updated sticker element creation with isMatchingTab & igt-stk-inactive-tab');
  }

  // 3. Cập nhật kéo thả sticker: chỉ thực hiện khi isMatchingTab
  const oldStkMouseDown = `      // KÉO THẢ DI CHUYỂN VỊ TRÍ STICKER
      el.onmousedown = (e) => {
        if (e.target.closest('.igt-sticker-del-btn')) {
          e.stopPropagation();
          removeSticker(s.id);
          return;
        }
        if (e.target.closest('.igt-sticker-resize-handle') || e.target.closest('.igt-sticker-scale-toolbar')) {
          return;
        }

        e.stopPropagation();
        let isDraggingSticker = true;
        let startMouseX = e.clientX;
        let startMouseY = e.clientY;
        let startX = s.x;
        let startY = s.y;
        el.classList.add('selected');`;

  const newStkMouseDown = `      // KÉO THẢ DI CHUYỂN VỊ TRÍ STICKER
      el.onmousedown = (e) => {
        if (!isMatchingTab) return;
        if (e.target.closest('.igt-sticker-del-btn')) {
          e.stopPropagation();
          removeSticker(s.id);
          return;
        }
        if (e.target.closest('.igt-sticker-resize-handle') || e.target.closest('.igt-sticker-scale-toolbar')) {
          return;
        }

        e.stopPropagation();
        studioState.activeEditingStickerId = s.id;
        studioState.selectedStickerId = s.id;
        const allItems = layer.querySelectorAll('.igt-studio-sticker-item');
        allItems.forEach(it => {
          if (it === el) {
            it.classList.add('selected', 'is-active-editing');
          } else {
            it.classList.remove('selected', 'is-active-editing');
          }
        });

        let isDraggingSticker = true;
        let startMouseX = e.clientX;
        let startMouseY = e.clientY;
        let startX = s.x;
        let startY = s.y;
        el.classList.add('selected');`;

  if (code.includes(oldStkMouseDown)) {
    code = code.replace(oldStkMouseDown, newStkMouseDown);
    console.log('[patchTabStickers] 3. Updated sticker onmousedown with active selection state');
  }

  // 4. Cập nhật click chuyển tab trong renderTabsNav để reset active selection và re-render stickers
  const oldTabNavClick = `    nav.querySelectorAll('.igt-studio-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        studioState.activeTab = tab;
        modal.querySelectorAll('.igt-studio-tab-btn').forEach(b => b.classList.remove('active'));
        nav.querySelectorAll('.igt-studio-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderTabContent(tab);
      };
    });`;

  const newTabNavClick = `    nav.querySelectorAll('.igt-studio-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.getAttribute('data-tab');
        studioState.activeTab = tab;
        modal.querySelectorAll('.igt-studio-tab-btn').forEach(b => b.classList.remove('active'));
        nav.querySelectorAll('.igt-studio-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Bỏ active editing khi chuyển tab và render lại stickers để áp dụng đúng quyền tương tác tab mới
        studioState.activeEditingStickerId = null;
        studioState.selectedStickerId = null;
        renderStickers();

        renderTabContent(tab);
      };
    });`;

  if (code.includes(oldTabNavClick)) {
    code = code.replace(oldTabNavClick, newTabNavClick);
    console.log('[patchTabStickers] 4. Updated tab nav click to deselect and renderStickers');
  }

  // 5. Cập nhật phoneFrame.onmousedown để deselect khi click ra ngoài sticker
  code = code.replace(/(\s*\/\/\s*Khi bấm ra khoảng trống ngoài sticker -> bỏ chọn và ẩn ngay khung điều khiển[\s\S]*?modal\.querySelectorAll\('\.igt-studio-sticker-item'\)\.forEach\(stk => \{\s*stk\.classList\.remove\('is-active-editing', 'selected'\);\s*\}\);\s*\}\s*\}\s*){2,}/g, '');

  const oldPhoneFrameMouseDown = `        // Khi ở Tab Tỉ lệ (main), hoặc khi bấm ra khoảng trống ngoài sticker
        if (studioState.activeTab === 'main' || !e.target.closest('.igt-studio-sticker-item')) {
          studioState.isDragging = true;`;

  const newPhoneFrameMouseDown = `        // Khi bấm ra khoảng trống ngoài sticker -> bỏ chọn và ẩn ngay khung điều khiển
        if (!e.target.closest('.igt-studio-sticker-item')) {
          if (studioState.activeEditingStickerId || studioState.selectedStickerId) {
            studioState.activeEditingStickerId = null;
            studioState.selectedStickerId = null;
            modal.querySelectorAll('.igt-studio-sticker-item').forEach(stk => {
              stk.classList.remove('is-active-editing', 'selected');
            });
          }
        }

        // Khi ở Tab Tỉ lệ (main), hoặc khi bấm ra khoảng trống ngoài sticker
        if (studioState.activeTab === 'main' || !e.target.closest('.igt-studio-sticker-item')) {
          studioState.isDragging = true;`;

  if (code.includes(oldPhoneFrameMouseDown) && !code.includes('Khi bấm ra khoảng trống ngoài sticker -> bỏ chọn')) {
    code = code.replace(oldPhoneFrameMouseDown, newPhoneFrameMouseDown);
    console.log('[patchTabStickers] 5. Updated phoneFrame.onmousedown to deselect stickers on empty click');
  }

  // 6. Thêm modal-wide click listener để tự động deselect khi click vào bất kỳ vùng trống nào trong modal
  const oldAfterNav = `    renderTabsNav();
    renderStickers();`;

  const newAfterNav = `    renderTabsNav();
    renderStickers();

    // Tự động bỏ chọn nhãn dán khi bấm ra ngoài các vùng thao tác
    modal.addEventListener('mousedown', (e) => {
      if (e.target.closest('.igt-studio-sticker-item') ||
          e.target.closest('#igt-studio-sidebar-right') ||
          e.target.closest('.igt-studio-tab-btn') ||
          e.target.closest('.igt-studio-header-action-btn') ||
          e.target.closest('.igt-studio-ratio-btn') ||
          e.target.closest('.igt-timeline-container') ||
          e.target.closest('.igt-studio-dialog-overlay')) {
        return;
      }
      if (studioState.activeEditingStickerId || studioState.selectedStickerId) {
        studioState.activeEditingStickerId = null;
        studioState.selectedStickerId = null;
        modal.querySelectorAll('.igt-studio-sticker-item').forEach(stk => {
          stk.classList.remove('is-active-editing', 'selected');
        });
      }
    });`;

  if (code.includes(oldAfterNav) && !code.includes('Tự động bỏ chọn nhãn dán khi bấm ra ngoài các vùng thao tác')) {
    code = code.replace(oldAfterNav, newAfterNav);
    console.log('[patchTabStickers] 6. Added modal-wide outside click listener for deselecting stickers');
  }

  // 7. Định nghĩa drawRoundedRect để hỗ trợ vẽ bo góc tất cả nhãn dán trên Canvas Export
  const drawStkTarget = '  function drawStickersOnExportCanvas(';
  const drawRoundedRectHelper = `  function drawRoundedRect(ctx, x, y, width, height, radius = 0) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }\n\n`;

  if (code.includes(drawStkTarget) && !code.includes('function drawRoundedRect')) {
    code = code.replace(drawStkTarget, drawRoundedRectHelper + drawStkTarget);
    console.log('[patchTabStickers] 7. Added drawRoundedRect canvas helper');
  }

  return code;
}

module.exports = { patchTabStickers };
