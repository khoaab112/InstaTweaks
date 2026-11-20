// ========================================================
// BỘ XUẤT BẢN TRỰC TIẾP (DIRECT PUBLISH ENGINE & MODAL)
// ========================================================

// Cầu nối đẩy file trực tiếp vào khung Upload của Instagram Web (Direct File Bridge Fallback)
function getInstagramNativeFileInput() {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
  return inputs.find(inp => {
    if (inp.id && inp.id.startsWith('igt-')) return false;
    if (inp.closest && inp.closest('#igt-studio-modal, #igt-v3-drawer, #igt-publish-modal-overlay, .igt-reorder-overlay, [id^="igt-"]')) return false;
    const accept = (inp.getAttribute('accept') || '').toLowerCase();
    return accept.includes('image') || accept.includes('video') || inp.hasAttribute('multiple') || inp.classList.contains('_ac69');
  });
}

async function injectMediaIntoInstagram(fileOrFiles, captionText = '') {
  try {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
    let fileInput = getInstagramNativeFileInput();

    if (!fileInput) {
      const createBtn = document.querySelector('svg[aria-label="New post"], svg[aria-label="Bài viết mới"], svg[aria-label="Create"], svg[aria-label="Tạo"]')?.closest('a, div[role="button"], button')
        || Array.from(document.querySelectorAll('a, div[role="button"], button')).find(el => {
          if (el.closest('[id^="igt-"]')) return false;
          const txt = (el.innerText || '').trim();
          return txt === 'Tạo' || txt === 'Create' || txt === 'Bài viết mới';
        });

      if (createBtn) {
        createBtn.click();
      }

      for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 120));
        fileInput = getInstagramNativeFileInput();
        if (fileInput) break;

        const postOption = Array.from(document.querySelectorAll('a, div[role="menuitem"], span, div')).find(el => {
          if (el.closest('[id^="igt-"]')) return false;
          const t = (el.innerText || '').trim();
          return t === 'Bài viết' || t === 'Post' || t === 'Reel' || t === 'Thước phim';
        });
        if (postOption) {
          postOption.click();
        }
      }
    }

    if (fileInput) {
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      fileInput.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[InstaTweaks Direct Publish] Files pushed successfully to Instagram upload input:', files.map(f => f.name));

      // Tự động sao chép chú thích vào clipboard để người dùng dán nhanh nếu Instagram không tự điền
      if (captionText) {
        try {
          await navigator.clipboard.writeText(captionText);
        } catch (_) { }
      }
      return true;
    } else {
      console.warn('[InstaTweaks Direct Publish] Could not find Instagram file input after click.');
      return false;
    }
  } catch (err) {
    console.error('[InstaTweaks Direct Publish] Error injecting media into Instagram:', err);
    return false;
  }
}

function openPublishModal() {
  if (!studioState.mediaUrl) {
    alert('Vui lòng thêm ảnh hoặc video trước khi xuất bản!');
    return;
  }

  const modal = document.getElementById('igt-studio-modal');
  if (!modal) return;

  // Xóa modal cũ nếu có
  const existing = document.getElementById('igt-publish-modal-overlay');
  if (existing) existing.remove();

  const isVideo = (typeof shouldExportAsVideo === 'function') ? shouldExportAsVideo() : (studioState.mediaType === 'video');
  const isStory = studioState.mode === 'story';
  const isReel = studioState.mode === 'reel';
  const isPost = studioState.mode === 'post';
  const totalDur = isVideo
    ? (studioState.mediaType === 'video'
      ? (studioState.videoClips && studioState.videoClips.length > 0 ? getVideoClipsTotalDuration() : Math.max(0.5, (studioState.trimEnd || studioState.videoDuration || 15) - (studioState.trimStart || 0)))
      : ((isStory || isReel) ? (studioState.imageDuration || 15) : (studioState.audioDuration > 0 ? studioState.audioDuration : (studioState.imageDuration || 15))))
    : (isStory ? (studioState.imageDuration || 15) : 15);
  const splitSec = studioState.sequenceSplitDuration || 15;
  const isMultiStory = (isStory && studioState.autoSplitStories && totalDur > splitSec);
  const numChunks = isMultiStory ? Math.ceil(totalDur / splitSec) : 1;

  // Chỉ hiển thị địa điểm khi người dùng thực sự đã bấm áp dụng vị trí (hoặc có sticker location), KHÔNG tự tiện lấy EXIF
  const hasLocationSticker = studioState.stickers && studioState.stickers.some(s => s.type === 'location');
  const locationToShow = studioState.appliedLocation || (hasLocationSticker ? studioState.detectedLocation : null);
  const showLocation = !isStory && !!locationToShow;

  // Đếm số lượng video, ảnh, live photo
  let countPhoto = 0;
  let countLive = 0;
  let countVideo = 0;

  if (studioState.mediaList && studioState.mediaList.length > 0) {
    studioState.mediaList.forEach(item => {
      const isLiveCandidate = item.isLivePhoto || /^mvimg_|_live|_motion/i.test(item.name || '') || !!item.liveVideoUrl;
      const isStill = (item.liveMode === 'still');
      if (item.mediaType === 'video') {
        if (isStill) countPhoto++;
        else countVideo++;
      } else if (isLiveCandidate) {
        if (isStill) countPhoto++;
        else countLive++;
      } else {
        if (item.liveMode === 'live') countLive++;
        else countPhoto++;
      }
    });
  } else {
    if (studioState.mediaType === 'video') countVideo = 1;
    else if (studioState.isLiveItemMode) countLive = 1;
    else countPhoto = 1;
  }

  const countParts = [];
  if (countVideo > 0) countParts.push(`${countVideo} video`);
  if (countPhoto > 0) countParts.push(`${countPhoto} ảnh`);
  if (countLive > 0) countParts.push(`${countLive} live photo`);
  if (countParts.length === 0) countParts.push(isVideo ? '1 video' : '1 ảnh');

  const totalItemsCount = (studioState.mediaList && studioState.mediaList.length > 0) ? studioState.mediaList.length : 1;
  const mediaCountDetail = totalItemsCount > 1
    ? `${totalItemsCount} slide (${countParts.join(', ')})`
    : countParts.join(', ');
  const mediaCountLabel = mediaCountDetail;

  const specsBoxHtml = `
    <!-- Thông số kỹ thuật -->
    <div class="igt-publish-specs-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px;">
      <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">
        📊 Thông số kỹ thuật ${isStory ? 'Story' : ''}
      </div>
      <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.04);">
        <span style="color: #94a3b8;">Định dạng:</span>
        <b style="color: #38bdf8;">${totalItemsCount > 1 ? `Album (${mediaCountLabel})` : (isVideo ? (isStory ? 'MP4 Video Story (1080p)' : (isReel ? 'MP4 Reel (1080p)' : 'MP4 Video Feed (1080p)')) : 'JPEG Ultra HD (100%)')}</b>
      </div>
      <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.04);">
        <span style="color: #94a3b8;">Tỉ lệ:</span>
        <b>${RATIO_CONFIGS[studioState.ratio]?.label || '9:16'} (${RATIO_CONFIGS[studioState.ratio]?.targetW || 1080}×${RATIO_CONFIGS[studioState.ratio]?.targetH || 1920})</b>
      </div>
      <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.04);">
        <span style="color: #94a3b8;">Thời lượng ${isStory ? 'Story' : (isReel ? 'Reel' : 'bài đăng')}:</span>
        <b style="color: #f8fafc;">${formatTime(totalDur)} (${Math.round(totalDur)}s)</b>
      </div>
      ${studioState.audioUrl ? `
        <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.04);">
          <span style="color: #94a3b8;">Nhạc nền:</span>
          <b style="color: #06b6d4;">${escapeHtml(studioState.audioName || 'Custom Audio')}</b>
        </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #94a3b8;">Số lượng:</span>
        <b style="color: #a78bfa;">${mediaCountLabel}</b>
      </div>
      ${isMultiStory ? `
        <div style="display: flex; justify-content: space-between; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.04);">
          <span style="color: #94a3b8;">Tự chia Story:</span>
          <b style="color: #f472b6;">${numChunks} Story (mỗi tin ${splitSec}s)</b>
        </div>
      ` : ''}
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'igt-publish-modal-overlay';
  overlay.id = 'igt-publish-modal-overlay';

  overlay.innerHTML = `
      <div class="igt-publish-modal-card">
        <div class="igt-publish-modal-header">
          <div class="igt-publish-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0095f6" stroke-width="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>Xuất bản trực tiếp lên Instagram</span>
          </div>
          <button type="button" class="igt-publish-modal-close" id="igt-publish-modal-close">✕</button>
        </div>

        <div class="igt-publish-modal-body">
          <!-- Cột trái: Xem trước & Chọn Ảnh bìa -->
          <div class="igt-publish-preview-col">
            <div class="igt-publish-preview-box" id="igt-publish-preview-box">
              ${(studioState.mediaType === 'video') ? `
                <video id="igt-publish-preview-video" src="${studioState.mediaUrl}" playsinline muted></video>
              ` : `
                <img id="igt-publish-preview-img" src="${studioState.mediaUrl}" />
              `}
            </div>

            ${(studioState.mediaType === 'video') ? `
              <!-- Chọn ảnh bìa Cover cho Video/Reel thật -->
              <div class="igt-publish-cover-slider-wrap">
                <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #f8fafc;">
                  <span>🖼️ Chọn ảnh bìa (Cover)</span>
                  <span id="igt-publish-cover-time" style="color: #38bdf8;">${formatTime(studioState.trimStart || 0)}</span>
                </div>
                <input type="range" id="igt-publish-cover-slider" min="${studioState.trimStart || 0}" max="${studioState.trimEnd || studioState.videoDuration || 15}" step="0.1" value="${studioState.trimStart || 0}" style="width: 100%; accent-color: #0095f6; cursor: pointer;" />
                <div style="font-size: 10px; color: #94a3b8;">Khung hình này sẽ được chọn làm ảnh đại diện khi đăng lên Instagram.</div>
              </div>
            ` : ''}

            <!-- Thông số kỹ thuật cho Feed / Reel (Ở chế độ Story sẽ chuyển sang cột phải theo yêu cầu) -->
            ${isStory ? '' : specsBoxHtml}
          </div>

          <!-- Cột phải: Mục tiêu & Chú thích bài viết (Set cứng theo Mode đã chọn từ màn Edit) -->
          <div class="igt-publish-info-col">
            <!-- Nơi đăng tải: Set cứng theo chế độ từ màn hình Edit -->
            <div>
              <label style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Nơi đăng tải (Đã chọn từ Studio)</label>
              <div class="igt-publish-target-selector" style="pointer-events: none;">
                <div class="igt-publish-target-btn active" style="flex: 1; justify-content: center; cursor: default; border-color: #38bdf8; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 800;">
                  ${isStory ? '🌟 Tin (Story)' : (isReel ? '🎬 Thước phim (Reel)' : '📸 Bài viết (Feed)')}
                </div>
              </div>
            </div>

            ${isStory ? specsBoxHtml : `
              <!-- CHẾ ĐỘ BÀI VIẾT (FEED) HOẶC REEL: Có Caption & Hashtags -->
              <div class="igt-publish-caption-box">
                <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; color: #94a3b8;">
                  <span>📝 Chú thích bài viết (Caption)</span>
                  <span id="igt-publish-caption-count" style="color: #64748b;">${(studioState.captionText || '').length} / 2,200</span>
                </div>
                <textarea id="igt-publish-caption-input" class="igt-publish-caption-textarea" placeholder="Viết chú thích cuốn hút cho bài viết, tag bạn bè và thêm hashtag...">${escapeHtml(studioState.captionText || '')}</textarea>

                <!-- Thẻ hashtag nhanh -->
                <div>
                  <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px; font-weight: 600;">Gợi ý Hashtag thịnh hành:</div>
                  <div class="igt-publish-quick-tags">
                    ${['#reels', '#trending', '#viral', '#instagram', '#fyp', '#vietnam', '#aesthetic', '#photography', '#lifestyle', '#travel'].map(tag => `
                      <button type="button" class="igt-publish-tag-pill" data-tag="${tag}">${tag}</button>
                    `).join('')}
                  </div>
                </div>
              </div>

              <!-- Vị trí đính kèm CHỈ KHI NGƯỜI DÙNG THỰC SỰ ĐÃ APPLY VỊ TRÍ -->
              ${showLocation ? `
                <div style="background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 14px;">📍</span>
                    <div>
                      <div style="font-size: 11.5px; font-weight: 700; color: #f8fafc;">${escapeHtml(locationToShow.name)}</div>
                      <div style="font-size: 10px; color: #94a3b8;">${escapeHtml(locationToShow.sub || '')}</div>
                    </div>
                  </div>
                  <span style="font-size: 10px; color: #38bdf8; font-weight: 600;">Đã gắn vị trí</span>
                </div>
              ` : ''}
            `}
          </div>
        </div>

        <!-- Footer Hành động: XÓA BỎ nút Tải Ultra HD ở đây vì ngoài màn hình edit đã có -->
        <div class="igt-publish-modal-footer" style="justify-content: flex-end;">
          <button type="button" class="igt-studio-btn-publish" id="igt-btn-publish-direct" style="padding: 10px 24px; font-size: 13px; font-weight: 700; width: 100%; justify-content: center; border-radius: 10px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            <span>🚀 Đẩy trực tiếp vào Instagram</span>
          </button>
        </div>
      </div>
    `;

  document.body.appendChild(overlay);

  // Đồng bộ phát âm thanh khi bấm nút Play trên thanh điều khiển video gốc
  const prevVid = overlay.querySelector('#igt-publish-preview-video');

  function stopPreview() {
    if (prevVid) {
      try { prevVid.pause(); } catch (_) { }
    }
    if (studioState.audioElement) {
      try { studioState.audioElement.pause(); } catch (_) { }
    }
  }

  if (prevVid) {
    prevVid.onplay = () => {
      if (studioState.audioElement && studioState.audioUrl) {
        studioState.audioElement.currentTime = (studioState.audioStart || 0);
        studioState.audioElement.muted = studioState.isAudioMuted;
        studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
        studioState.audioElement.play().catch(() => { });
      }
    };
    prevVid.onpause = () => {
      if (studioState.audioElement) {
        try { studioState.audioElement.pause(); } catch (_) { }
      }
    };
    prevVid.onended = () => {
      stopPreview();
    };
  }

  function closePublishModal() {
    stopPreview();
    overlay.remove();
  }

  // Xử lý sự kiện đóng
  const btnClose = overlay.querySelector('#igt-publish-modal-close');
  if (btnClose) {
    btnClose.onclick = () => closePublishModal();
  }
  overlay.onclick = (e) => {
    if (e.target === overlay) closePublishModal();
  };

  // Slider chọn ảnh bìa Cover cho Video thật
  if (studioState.mediaType === 'video') {
    const coverSlider = overlay.querySelector('#igt-publish-cover-slider');
    const coverTimeLabel = overlay.querySelector('#igt-publish-cover-time');
    const prevVideo = overlay.querySelector('#igt-publish-preview-video');

    if (coverSlider && prevVideo) {
      coverSlider.oninput = (e) => {
        const t = parseFloat(e.target.value);
        prevVideo.currentTime = t;
        if (coverTimeLabel) coverTimeLabel.innerText = formatTime(t);
        studioState.coverTime = t;
      };
    }
  }

  // Xử lý Chú thích (Caption) và Thẻ Hashtag gợi ý
  const captionInput = overlay.querySelector('#igt-publish-caption-input');
  const captionCount = overlay.querySelector('#igt-publish-caption-count');

  function updateTagPillsActive() {
    if (!captionInput) return;
    const currentVal = captionInput.value || '';
    overlay.querySelectorAll('.igt-publish-tag-pill').forEach(pill => {
      const tag = pill.getAttribute('data-tag');
      if (!tag) return;
      const cleanTag = tag.replace('#', '');
      const hasTag = new RegExp(`(^|\\s)#${cleanTag}(\\s|$)`, 'i').test(currentVal);
      pill.classList.toggle('active', hasTag);
    });
  }

  if (captionInput) {
    captionInput.oninput = () => {
      studioState.captionText = captionInput.value;
      if (captionCount) {
        captionCount.innerText = `${captionInput.value.length} / 2,200`;
      }
      updateTagPillsActive();
    };
    updateTagPillsActive();
  }

  // Bấm vào thẻ hashtag gợi ý -> bật/tắt (toggle) ngay trong caption
  overlay.querySelectorAll('.igt-publish-tag-pill').forEach(pill => {
    pill.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const tag = pill.getAttribute('data-tag');
      if (!tag || !captionInput) return;

      let val = captionInput.value || '';
      const cleanTag = tag.replace('#', '');
      const regex = new RegExp(`(^|\\s)#${cleanTag}(\\s|$)`, 'i');
      if (regex.test(val)) {
        // Đã có hashtag -> Bỏ đi (toggle off)
        val = val.replace(regex, '$1').replace(/\s{2,}/g, ' ').trim();
      } else {
        // Chưa có hashtag -> Thêm vào (toggle on)
        val = val.trim();
        val = val ? `${val} ${tag}` : tag;
      }
      captionInput.value = val;
      studioState.captionText = val;
      if (captionCount) {
        captionCount.innerText = `${val.length} / 2,200`;
      }
      updateTagPillsActive();
      captionInput.focus();
    };
  });

  // Nút Đẩy trực tiếp vào Instagram (Direct Publish Engine qua Instagram Private Web API - Chuẩn INSSIST)
  const btnPublishDirect = overlay.querySelector('#igt-btn-publish-direct');
  if (btnPublishDirect) {
    btnPublishDirect.onclick = async () => {
      btnPublishDirect.disabled = true;
      const originalBtnHtml = btnPublishDirect.innerHTML;
      const updateStatus = (statusText) => {
        btnPublishDirect.innerHTML = `
          <span style="display: inline-block; animation: igt-spin 1s linear infinite; margin-right: 8px;">⏳</span>
          <span>${statusText}</span>
        `;
      };

      updateStatus('Đang kết xuất Ultra HD trong bộ nhớ...');

      if (studioState.captionText && !isStory) {
        try {
          await navigator.clipboard.writeText(studioState.captionText);
        } catch (_) { }
      }

      // 1. Kết xuất file Ultra HD TRONG BỘ NHỚ (skipDownload: true - TUYỆT ĐỐI KHÔNG TẢI VỀ MÁY)
      const exportRes = await exportAndDownloadUltraHD({ skipDownload: true });

      if (!exportRes || !exportRes.success) {
        btnPublishDirect.disabled = false;
        btnPublishDirect.innerHTML = originalBtnHtml;
        const errMsg = exportRes?.error ? `Không thể kết xuất: ${exportRes.error}` : 'Không thể kết xuất hoặc tác vụ đã bị hủy.';
        showPublishToast(errMsg, false);
        return;
      }

      // XỬ LÝ ALBUM BÀI VIẾT (POST) NHIỀU SLIDE: Đẩy toàn bộ danh sách File[], không gửi ZIP
      const isAlbumPost = (studioState.mode === 'post' && exportRes.slideFiles && exportRes.slideFiles.length > 1);

      if (isAlbumPost) {
        updateStatus(`Đang xuất bản Album ${exportRes.slideFiles.length} slide lên Instagram...`);

        const apiRes = await publishMediaViaInstagramAPI(null, {
          mode: 'post',
          isAlbum: true,
          slideFiles: exportRes.slideFiles,
          caption: studioState.captionText || '',
          musicAssetId: studioState.audioAssetId,
          musicStart: studioState.audioStart || 0,
          onProgress: (txt) => updateStatus(txt)
        });

        if (apiRes && apiRes.success) {
          overlay.remove();
          closeStudio();
          showPublishToast(`
            <div>
              <div style="font-weight: 700; color: #38bdf8; font-size: 14px; margin-bottom: 4px;">🎉 Đã đăng Album thành công lên Instagram!</div>
              <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">${exportRes.slideFiles.length} slide đã được xuất bản trực tiếp qua API nền mà không cần mở hộp thoại phụ.</div>
            </div>
          `, true);
          return;
        }

        console.warn('[InstaTweaks Direct Publish] API direct album post failed, fallback to DOM:', apiRes?.reason);
        updateStatus('Đang chuyển hướng nạp toàn bộ slide vào giao diện Instagram...');
        overlay.remove();
        closeStudio();

        const injected = await injectMediaIntoInstagram(exportRes.slideFiles, studioState.captionText);
        if (injected) {
          showPublishToast(`
            <div>
              <div style="font-weight: 700; color: #38bdf8; font-size: 13.5px; margin-bottom: 3px;">🚀 Đã nạp ${exportRes.slideFiles.length} slide vào Instagram thành công!</div>
              <div style="color: #94a3b8; font-size: 12px;">Instagram đã mở trình tạo bài viết Album với đầy đủ các slide. ${studioState.captionText ? 'Nhấn <b>Ctrl+V</b> để dán Chú thích.' : ''}</div>
            </div>
          `, true);
        } else {
          showPublishToast(`
            <div>
              <div style="font-weight: 700; color: #ef4444; font-size: 13.5px; margin-bottom: 3px;">⚠️ Xuất bản tự động chưa hoàn tất</div>
              <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">${apiRes?.reason ? `Lý do: <b>${escapeHtml(apiRes.reason)}</b>. ` : ''}Không thể nạp tự động vào giao diện Instagram. Bạn có thể bấm nút <b>"Tải file về máy"</b> trên thanh công cụ Studio nếu muốn lưu file.</div>
            </div>
          `, false);
        }
        return;
      }

      // XỬ LÝ 1 FILE ĐƠN LẺ (ẢNH / VIDEO / REEL / STORY)
      const publishMode = studioState.mode || (isStory ? 'story' : (isVideo ? 'reel' : 'post'));
      const mediaWord = isVideo ? 'video' : 'ảnh';

      updateStatus('Đang kết nối API Instagram (Chuẩn INSSIST)...');

      // Tạo Cover Blob thumbnail cho video nếu chưa có
      let coverBlob = exportRes.coverBlob || null;
      if (isVideo && !coverBlob) {
        try {
          const cvs = document.createElement('canvas');
          const tw = RATIO_CONFIGS[studioState.ratio]?.targetW || 1080;
          const th = RATIO_CONFIGS[studioState.ratio]?.targetH || 1920;
          cvs.width = tw;
          cvs.height = th;
          const cx = cvs.getContext('2d');
          const pImg = overlay.querySelector('#igt-publish-preview-img');
          const pVid = overlay.querySelector('#igt-publish-preview-video');
          if (pImg && pImg.complete && pImg.naturalWidth > 0) {
            cx.drawImage(pImg, 0, 0, tw, th);
          } else if (pVid) {
            cx.drawImage(pVid, 0, 0, tw, th);
          }
          coverBlob = await new Promise(r => cvs.toBlob(r, 'image/jpeg', 0.9));
        } catch (_) { }
      }

      // 2. Đẩy trực tiếp qua Instagram Private Web API (rupload + configure)
      const apiRes = await publishMediaViaInstagramAPI(exportRes.blob, {
        mode: publishMode,
        caption: isStory ? '' : (studioState.captionText || ''),
        isVideo: isVideo,
        duration: exportRes.duration || totalDur || 15,
        width: RATIO_CONFIGS[studioState.ratio]?.targetW || 1080,
        height: RATIO_CONFIGS[studioState.ratio]?.targetH || 1920,
        coverBlob: coverBlob,
        musicAssetId: studioState.audioAssetId,
        musicStart: studioState.audioStart || 0,
        onProgress: (txt) => updateStatus(txt)
      });

      if (apiRes && apiRes.success) {
        overlay.remove();
        closeStudio();

        let modeName = 'Tin (Story)';
        if (publishMode === 'post') modeName = 'Bài viết (Feed)';
        if (publishMode === 'reel') modeName = 'Thước phim (Reel)';

        showPublishToast(`
          <div>
            <div style="font-weight: 700; color: #38bdf8; font-size: 14px; margin-bottom: 4px;">🎉 Đã đăng ${modeName} thành công lên Instagram!</div>
            <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">Tệp ${mediaWord} đã được xuất bản trực tiếp qua API nền mà không cần mở hộp thoại phụ và không tải file về máy.</div>
          </div>
        `, true);
        return;
      }

      // 3. Nếu Direct API gặp sự cố
      console.warn('[InstaTweaks Direct Publish] API direct post failed or returned error:', apiRes?.reason);

      if (isStory) {
        // Giao diện Instagram Web desktop KHÔNG CÓ luồng đăng Story qua DOM (chỉ có Post/Reel).
        // Tuyệt đối KHÔNG inject vào DOM Post và TUYỆT ĐỐI KHÔNG TỰ ĐỘNG TẢI FILE VỀ MÁY!
        overlay.remove();
        closeStudio();
        showPublishToast(`
          <div>
            <div style="font-weight: 700; color: #ef4444; font-size: 13.5px; margin-bottom: 3px;">⚠️ Không thể xuất bản Story lên Instagram</div>
            <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">${apiRes?.reason ? `Lý do: <b>${escapeHtml(apiRes.reason)}</b>. ` : ''}Phiên làm việc Instagram chưa phản hồi hoặc đang bị hạn chế. Bạn có thể thử lại sau hoặc bấm nút <b>"Tải file về máy"</b> trên thanh công cụ Studio để lưu Story.</div>
          </div>
        `, false);
        return;
      }

      // Đối với Feed (Bài viết) hoặc Reel: Thử kích hoạt dự phòng qua giao diện Web Instagram
      updateStatus('Đang chuyển hướng dự phòng sang giao diện Instagram...');

      const file = new File([exportRes.blob], exportRes.fileName || (isVideo ? 'export.mp4' : 'export.jpg'), {
        type: exportRes.blob?.type || (isVideo ? 'video/mp4' : 'image/jpeg')
      });

      overlay.remove();
      closeStudio();

      const injected = await injectMediaIntoInstagram(file, studioState.captionText);

      if (injected) {
        showPublishToast(`
          <div>
            <div style="font-weight: 700; color: #38bdf8; font-size: 13.5px; margin-bottom: 3px;">🚀 Đã nạp ${mediaWord} vào Instagram thành công!</div>
            <div style="color: #94a3b8; font-size: 12px;">Instagram đã mở bước xem trước bài viết. ${studioState.captionText ? 'Nhấn <b>Ctrl+V</b> để dán Chú thích.' : ''}</div>
          </div>
        `, true);
      } else {
        // Tuyệt đối không tự động tải file về máy khi lỗi xuất bản!
        showPublishToast(`
          <div>
            <div style="font-weight: 700; color: #ef4444; font-size: 13.5px; margin-bottom: 3px;">⚠️ Xuất bản tự động chưa hoàn tất</div>
            <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">${apiRes?.reason ? `Lý do: <b>${escapeHtml(apiRes.reason)}</b>. ` : ''}Không thể nạp tự động vào giao diện Instagram. Bạn có thể bấm nút <b>"Tải file về máy"</b> trên thanh công cụ Studio để lưu file thủ công.</div>
          </div>
        `, false);
      }
    };
  }
}

// Phím tắt ESC đóng Studio
