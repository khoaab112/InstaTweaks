const fs = require('fs');

function patchSlideReorderCleanup(code) {
  // 1. Bỏ text gạch chéo trong Tab "Chung" (CÀI ĐẶT CHUNG ALBUM BÀI VIẾT)
  const oldGeneralText1 = `        <div style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-bottom: 12px;">
          Các thiết lập tại tab này sẽ được áp dụng đồng bộ cho toàn bộ các slide ảnh/video trong bài viết.
        </div>`;
  if (code.includes(oldGeneralText1)) {
    code = code.replace(oldGeneralText1, '');
    console.log('[patchSlideReorderCleanup] 1a. Removed general tab album description text');
  }

  // 1b. Bỏ toàn bộ khối "Tỉ lệ khung hình đồng bộ (Album)" trong tab Chung vì đã có thanh tỉ lệ mặc định trên đỉnh
  const ratioBlockTarget = `<!-- 2. Khung hình đồng bộ (Aspect Ratio Lock) -->`;
  const bulkFitTarget = `<!-- 3. Căn chỉnh kích thước hàng loạt (Bulk Fit Mode) -->`;
  const rbIdx = code.indexOf(ratioBlockTarget);
  const bfIdx = code.indexOf(bulkFitTarget);
  if (rbIdx !== -1 && bfIdx !== -1 && rbIdx < bfIdx) {
    code = code.slice(0, rbIdx) + code.slice(bfIdx);
    console.log('[patchSlideReorderCleanup] 1b. Removed redundant aspect ratio block from general tab');
  }

  // 2. Bỏ text subtitle gạch chéo trong Reorder Modal
  const oldReorderSub = `<div class="igt-reorder-subtitle">Kéo thả thẻ tệp hoặc sử dụng các nút mũi tên để thay đổi thứ tự xuất hiện khi đăng lên Instagram.</div>`;
  if (code.includes(oldReorderSub)) {
    code = code.replace(oldReorderSub, '');
    console.log('[patchSlideReorderCleanup] 1c. Removed reorder modal subtitle text');
  }

  // 3. Cập nhật Reorder Modal: Xóa 2 nút mũi tên ◀ ▶, thêm hover preview video/live, và click badge đổi type
  const oldReorderCardTemplate = `              \${tempItems.map((item, idx) => \`
                <div class="igt-reorder-card" data-idx="\${idx}" draggable="true" title="Kéo thả hoặc dùng mũi tên để đổi vị trí">
                  <span class="igt-reorder-badge">#\${idx + 1}</span>
                  <div class="igt-reorder-actions">
                    <button type="button" draggable="false" class="igt-reorder-btn btn-move-left" data-move-idx="\${idx}" data-dir="-1" \${idx === 0 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Di chuyển lên trước">◀</button>
                    <button type="button" draggable="false" class="igt-reorder-btn btn-move-right" data-move-idx="\${idx}" data-dir="1" \${idx === tempItems.length - 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''} title="Di chuyển về sau">▶</button>
                    <button type="button" draggable="false" class="igt-reorder-btn btn-reorder-del" data-del-idx="\${idx}" style="color: #ef4444;" title="Xóa slide này">✕</button>
                  </div>
                  \${item.thumbUrl ? \`<img class="igt-reorder-thumb" src="\${escapeHtml(item.thumbUrl)}" draggable="false" />\` : \`
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">\${item.mediaType === 'video' ? '🎬' : '🖼️'}</div>
                  \`}
                  <div class="igt-reorder-meta">
                    <span style="overflow: hidden; text-overflow: ellipsis; max-width: 75%;">\${escapeHtml(item.name || \`Slide #\${idx + 1}\`)}</span>
                    <span style="font-weight: 700; color: #38bdf8;">\${item.liveMode === 'still' ? 'Ảnh tĩnh' : (item.mediaType === 'video' ? 'Video' : 'Ảnh')}</span>
                  </div>
                </div>
              \`).join('')}`;

  const newReorderCardTemplate = `              \${tempItems.map((item, idx) => {
                const isLiveCandidate = item.isLivePhoto || /^mvimg_|_live|_motion/i.test(item.name || '') || !!item.liveVideoUrl;
                const isStill = (item.liveMode === 'still');
                let typeLabel = 'Ảnh';
                let typeBadgeStyle = 'background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);';
                if (item.mediaType === 'video') {
                  typeLabel = isStill ? 'Ảnh tĩnh' : 'Video';
                  typeBadgeStyle = isStill ? 'background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border-color: rgba(148, 163, 184, 0.4);' : 'background: rgba(168, 85, 247, 0.25); color: #c084fc; border-color: rgba(168, 85, 247, 0.45);';
                } else if (isLiveCandidate) {
                  typeLabel = isStill ? 'Ảnh tĩnh' : 'Live';
                  typeBadgeStyle = isStill ? 'background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border-color: rgba(148, 163, 184, 0.4);' : 'background: rgba(236, 72, 153, 0.25); color: #f472b6; border-color: rgba(236, 72, 153, 0.45);';
                } else {
                  typeLabel = (item.liveMode === 'live') ? 'Live' : 'Ảnh';
                  typeBadgeStyle = (item.liveMode === 'live') ? 'background: rgba(236, 72, 153, 0.25); color: #f472b6; border-color: rgba(236, 72, 153, 0.45);' : 'background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-color: rgba(56, 189, 248, 0.4);';
                }

                const previewVideoSrc = (item.mediaType === 'video' ? item.mediaUrl : (item.liveVideoUrl || ''));
                return \`
                <div class="igt-reorder-card" data-idx="\${idx}" data-preview-src="\${escapeHtml(previewVideoSrc)}" draggable="true" title="Kéo thả thẻ để đổi thứ tự slide">
                  <span class="igt-reorder-badge">#\${idx + 1}</span>
                  <div class="igt-reorder-actions">
                    <button type="button" draggable="false" class="igt-reorder-btn btn-reorder-del" data-del-idx="\${idx}" style="color: #ef4444;" title="Xóa slide này">✕</button>
                  </div>
                  \${item.thumbUrl ? \`<img class="igt-reorder-thumb" src="\${escapeHtml(item.thumbUrl)}" draggable="false" />\` : \`
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">\${item.mediaType === 'video' ? '🎬' : '🖼️'}</div>
                  \`}
                  <div class="igt-reorder-meta">
                    <span style="overflow: hidden; text-overflow: ellipsis; max-width: 65%; font-size: 10px;">\${escapeHtml(item.name || \`Slide #\${idx + 1}\`)}</span>
                    <button type="button" draggable="false" class="igt-reorder-type-btn" data-type-idx="\${idx}" style="\${typeBadgeStyle}" title="Bấm để đổi loại (Live ↔ Ảnh tĩnh)">\${typeLabel}</button>
                  </div>
                </div>
              \`;
              }).join('')}`;

  if (code.includes(oldReorderCardTemplate)) {
    code = code.replace(oldReorderCardTemplate, newReorderCardTemplate);
    console.log('[patchSlideReorderCleanup] 2. Updated Reorder Modal card template: removed arrows, added type toggle button and preview src');
  }

  // 4. Cập nhật event bindings trong Reorder Modal:
  // - Bỏ btn-move-left/btn-move-right
  // - Thêm event click igt-reorder-type-btn để đổi type
  // - Thêm hover preview cho Live/Video
  const oldBtnMoveEvents = `      overlay.querySelectorAll('.btn-move-left, .btn-move-right').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-move-idx'), 10);
          const dir = parseInt(btn.getAttribute('data-dir'), 10);
          const targetIdx = idx + dir;
          if (targetIdx >= 0 && targetIdx < tempItems.length) {
            const temp = tempItems[idx];
            tempItems[idx] = tempItems[targetIdx];
            tempItems[targetIdx] = temp;
            renderModalUI();
          }
        };
      });`;

  const newCardInteractiveEvents = `      // 1. Click vào ô Type để đổi loại (Ảnh ↔ Live/Ảnh tĩnh)
      overlay.querySelectorAll('.igt-reorder-type-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-type-idx'), 10);
          const item = tempItems[idx];
          if (!item) return;

          const isLiveCandidate = item.isLivePhoto || /^mvimg_|_live|_motion/i.test(item.name || '') || !!item.liveVideoUrl;
          if (isLiveCandidate) {
            item.liveMode = (item.liveMode === 'still') ? 'live' : 'still';
          } else if (item.mediaType === 'video') {
            item.liveMode = (item.liveMode === 'still') ? 'live' : 'still';
          } else {
            item.liveMode = (item.liveMode === 'live') ? 'still' : 'live';
          }

          // Đồng bộ với mediaList chính nếu cùng tệp
          if (studioState.mediaList && studioState.mediaList[idx]) {
            studioState.mediaList[idx].liveMode = item.liveMode;
            if (studioState.activeMediaIndex === idx) {
              renderActiveMediaDOM(studioState.mediaList[idx]);
            }
          }

          renderModalUI();
        };
      });`;

  if (code.includes(oldBtnMoveEvents)) {
    code = code.replace(oldBtnMoveEvents, newCardInteractiveEvents);
    console.log('[patchSlideReorderCleanup] 3. Replaced arrow buttons handler with type toggle click & hover preview');
  }

  // 4. Đảm bảo khay tệp bên trái (Queue Cards) KHÔNG chạy hover preview (theo yêu cầu người dùng)
  const leftQueueHoverPattern = /    \/\/ Hover preview video\/live trên thẻ tệp bên trái[\s\S]*?\/\/ Click chọn tệp để kích hoạt/;
  if (leftQueueHoverPattern.test(code)) {
    code = code.replace(leftQueueHoverPattern, '    // Click chọn tệp để kích hoạt');
    console.log('[patchSlideReorderCleanup] 4. Removed hover preview from left media queue cards');
  }

  return code;
}

module.exports = { patchSlideReorderCleanup };
