const fs = require('fs');

function patchTextDrag(code) {
  // 1. Sửa bindInlineEdit
  const oldBindInline = `    function bindInlineEdit(targetEl, setter, isBlock = false) {
      if (!targetEl) return;
      targetEl.setAttribute('contenteditable', 'true');
      targetEl.setAttribute('spellcheck', 'false');
      targetEl.title = 'Bấm trực tiếp để sửa nội dung (hoặc sửa ở thanh bên phải)';

      targetEl.onmousedown = (e) => {
        e.stopPropagation();
      };

      targetEl.onfocus = () => {
        targetEl.classList.add('igt-inline-editing');
      };

      targetEl.oninput = () => {
        const val = targetEl.innerText.trim();
        setter(val);
      };

      targetEl.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !isBlock) {
          e.preventDefault();
          targetEl.blur();
        }
      };

      targetEl.onblur = () => {
        targetEl.classList.remove('igt-inline-editing');
        takeSnapshot('Sửa chữ trực tiếp trên sticker');
        renderTabContent('stickers');
      };
    }`;

  const newBindInline = `    function bindInlineEdit(targetEl, setter, isBlock = false) {
      if (!targetEl) return;
      targetEl.setAttribute('contenteditable', 'false');
      targetEl.setAttribute('spellcheck', 'false');
      targetEl.title = 'Kéo để di chuyển • Bấm đúp để sửa chữ trực tiếp';
      targetEl.style.userSelect = 'none';

      targetEl.ondblclick = (e) => {
        e.stopPropagation();
        targetEl.setAttribute('contenteditable', 'true');
        targetEl.style.userSelect = 'text';
        targetEl.focus();
        try {
          const range = document.createRange();
          range.selectNodeContents(targetEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
      };

      targetEl.onmousedown = (e) => {
        if (targetEl.getAttribute('contenteditable') === 'true' && document.activeElement === targetEl) {
          e.stopPropagation();
        }
      };

      targetEl.onfocus = () => {
        targetEl.classList.add('igt-inline-editing');
      };

      targetEl.oninput = () => {
        const val = targetEl.innerText.trim();
        setter(val);
      };

      targetEl.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && !isBlock) {
          e.preventDefault();
          targetEl.blur();
        }
      };

      targetEl.onblur = () => {
        targetEl.setAttribute('contenteditable', 'false');
        targetEl.style.userSelect = 'none';
        targetEl.classList.remove('igt-inline-editing');
        takeSnapshot('Sửa chữ trực tiếp trên sticker');
        if (studioState.activeTab === 'text') {
          renderTabContent('text');
        } else {
          renderTabContent('stickers');
        }
      };
    }`;

  if (code.includes(oldBindInline)) {
    code = code.replace(oldBindInline, newBindInline);
    console.log('[patchTextDrag] 1. Replaced bindInlineEdit successfully!');
  }

  // 2. Sửa txt.onclick trong s.type === 'text'
  const oldTxtClick = `        txt.textContent = s.text || '';
        txt.title = 'Bấm trực tiếp để sửa chữ (hoặc sửa ở tab Chữ)';
        bindInlineEdit(txt, (v) => { s.text = v; }, true);

        // Click vào chữ để mở chế độ Edit bên Tab Chữ
        txt.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'text');
        };`;

  const newTxtClick = `        txt.textContent = s.text || '';
        txt.title = 'Kéo để di chuyển • Bấm đúp để sửa chữ trực tiếp';
        bindInlineEdit(txt, (v) => { s.text = v; }, true);

        txt.onclick = (e) => {
          e.stopPropagation();
        };`;

  if (code.includes(oldTxtClick)) {
    code = code.replace(oldTxtClick, newTxtClick);
    console.log('[patchTextDrag] 2. Replaced txt.onclick successfully!');
  }

  // 3. Sửa el.onmousedown và thêm hasDraggedSticker
  const oldStkDragBlock = `      // KÉO THẢ DI CHUYỂN VỊ TRÍ STICKER
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
        el.classList.add('selected', 'is-dragging');`;

  const newStkDragBlock = `      // KÉO THẢ DI CHUYỂN VỊ TRÍ STICKER
      let hasDraggedSticker = false;
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

        if (document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true') {
          return;
        }

        e.stopPropagation();
        e.preventDefault();

        hasDraggedSticker = false;
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
        el.classList.add('selected', 'is-dragging');`;

  if (code.includes(oldStkDragBlock)) {
    code = code.replace(oldStkDragBlock, newStkDragBlock);
    console.log('[patchTextDrag] 3. Replaced oldStkDragBlock successfully!');
  }

  // 4. Sửa onMouseMove để đánh dấu hasDraggedSticker
  const oldOnMouseMoveStart = `        const onMouseMove = (ev) => {
          if (!isDraggingSticker) return;`;

  const newOnMouseMoveStart = `        const onMouseMove = (ev) => {
          if (!isDraggingSticker) return;
          const dist = Math.hypot(ev.clientX - startMouseX, ev.clientY - startMouseY);
          if (dist >= 6) {
            hasDraggedSticker = true;
          }`;

  if (code.includes(oldOnMouseMoveStart) && !code.includes('hasDraggedSticker = true;')) {
    code = code.replace(oldOnMouseMoveStart, newOnMouseMoveStart);
    console.log('[patchTextDrag] 4. Replaced onMouseMoveStart successfully!');
  }

  // 5. Sửa el.onclick
  const oldElClick = `      // Sự kiện Click trực tiếp trên container của sticker
      el.onclick = (e) => {
        if (e.target.closest('.igt-sticker-del-btn') || e.target.closest('.igt-sticker-resize-handle') || e.target.closest('.igt-sticker-scale-toolbar')) {
          return;
        }
        e.stopPropagation();
        const targetTab = getStickerTab(s.type);
        if (targetTab) {
          switchToEditSticker(s.id, targetTab);
        }
      };`;

  const newElClick = `      // Sự kiện Click trực tiếp trên container của sticker
      el.onclick = (e) => {
        if (hasDraggedSticker) {
          hasDraggedSticker = false;
          e.stopPropagation();
          return;
        }
        if (e.target.closest('.igt-sticker-del-btn') || e.target.closest('.igt-sticker-resize-handle') || e.target.closest('.igt-sticker-scale-toolbar')) {
          return;
        }
        e.stopPropagation();
        const targetTab = getStickerTab(s.type);
        if (targetTab) {
          switchToEditSticker(s.id, targetTab);
        }
      };`;

  if (code.includes(oldElClick)) {
    code = code.replace(oldElClick, newElClick);
    console.log('[patchTextDrag] 5. Replaced oldElClick successfully!');
  }

  return code;
}

module.exports = { patchTextDrag };

if (require.main === module) {
  let c = fs.readFileSync('scripts/studio_core.js', 'utf8');
  c = patchTextDrag(c);
  fs.writeFileSync('scripts/studio_core.js', c, 'utf8');
  console.log('Successfully patched studio_core.js directly!');
}
