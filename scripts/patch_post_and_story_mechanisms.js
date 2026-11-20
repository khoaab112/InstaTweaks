const fs = require('fs');

function patchPostAndStoryMechanisms(code) {
  // 1. Cập nhật shouldExportAsVideo():
  // - Nếu có video, hoặc Live Photo ở chế độ Live -> Xuất Video
  // - Nếu có bài hát (nhạc nền) đang bật tiếng -> Chuyển thành Video để giữ trọn âm thanh trên Instagram
  // - Nếu là Ảnh tĩnh thuần túy không nhạc -> Giữ nguyên Ảnh JPEG Ultra HD
  if (code.includes('// [IGT_SHOULD_EXPORT_VIDEO_AUDIO_SYNC]')) {
    console.log('[patchPostAndStoryMechanisms] 1. shouldExportAsVideo already up to date.');
  } else {
    const shouldExportRegex = /function shouldExportAsVideo\(\)\s*\{[\s\S]*?\n  \}\s*(?=\n\s*\n\s*\/\/\s*Xuất Video Ultra HD)/;

    const newShouldExport = `function shouldExportAsVideo() {
    // [IGT_SHOULD_EXPORT_VIDEO_AUDIO_SYNC]
    if (studioState.mediaType === 'video') return true;

    // 1. Live Photo ở chế độ Live (cần xuất Video để giữ chuyển động mượt mà)
    if (studioState.isLiveItemMode) return true;
    const activeItem = (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]);
    if (activeItem && (activeItem.isLivePhoto || activeItem.liveVideoUrl) && activeItem.liveMode === 'live') return true;

    // 2. Có bài hát / nhạc nền được gắn và không bị tắt tiếng (chuyển sang Video để phát nhạc trên Instagram)
    const hasActiveAudio = Boolean((studioState.audioUrl || studioState.audioFile) && !studioState.isAudioMuted);
    if (hasActiveAudio) return true;

    // 3. Sticker động hoặc hiệu ứng đặc biệt
    if (studioState.stickers && studioState.stickers.some(s => s.anim && s.anim !== 'none')) return true;
    if (studioState.specialFx && studioState.specialFx !== 'none') return true;

    // 4. Chế độ Story có thời lượng tùy chỉnh
    if (studioState.mode === 'story' && studioState.customStoryDurationSet) return true;

    // 5. Chế độ Reel luôn là Video
    if (studioState.mode === 'reel') return true;

    return false;
  }`;

    if (shouldExportRegex.test(code)) {
      code = code.replace(shouldExportRegex, newShouldExport);
      console.log('[patchPostAndStoryMechanisms] 1. Updated shouldExportAsVideo with Live & Audio sync!');
    }
  }

  // 2. Cập nhật applyTrimPreset: hỗ trợ các template 10s, 20s, 30s, 60s, all, custom
  const oldApplyTrimPreset = `    let targetLen = maxBoundary;
    if (preset === '15s') targetLen = 15;
    else if (preset === '30s') targetLen = 30;
    else if (preset === '60s') targetLen = 60;
    else if (preset === 'all') targetLen = maxBoundary;`;

  const newApplyTrimPreset = `    let targetLen = maxBoundary;
    if (preset === '10s') targetLen = 10;
    else if (preset === '15s') targetLen = 15;
    else if (preset === '20s') targetLen = 20;
    else if (preset === '30s') targetLen = 30;
    else if (preset === '60s') targetLen = 60;
    else if (preset === 'all') targetLen = maxBoundary;

    // Tự động đồng bộ mốc chia Story con theo đúng template được chọn
    if (preset === '10s') studioState.sequenceSplitDuration = 10;
    else if (preset === '20s') studioState.sequenceSplitDuration = 20;
    else if (preset === '30s') studioState.sequenceSplitDuration = 30;
    else if (preset === '60s') studioState.sequenceSplitDuration = 60;
    else if (preset === '15s') studioState.sequenceSplitDuration = 15;
    else if (preset === 'all') studioState.sequenceSplitDuration = Math.min(60, maxBoundary);`;

  if (code.includes(oldApplyTrimPreset)) {
    code = code.replace(oldApplyTrimPreset, newApplyTrimPreset);
    console.log('[patchPostAndStoryMechanisms] 2. Updated applyTrimPreset with 10s, 20s, 30s, 60s templates!');
  }

  // 3. Cập nhật hàng nút Template Presets trong giao diện Cắt xén Video
  const oldTrimTemplateRow = `          <!-- 4 Nút Template Presets giống ảnh mẫu -->
          <div class="igt-trim-templates-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 10px;">
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '15s' ? 'active' : ''}" data-preset="15s">15s (Story)</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '30s' ? 'active' : ''}" data-preset="30s">30s (Reel)</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '60s' ? 'active' : ''}" data-preset="60s">60s</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === 'all' ? 'active' : ''}" data-preset="all">Toàn bộ</button>
          </div>`;

  const newTrimTemplateRow = `          <!-- Các Nút Template Presets: 10s, 20s, 30s, 60s, Toàn bộ -->
          <div class="igt-trim-templates-row" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 10px;">
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '10s' ? 'active' : ''}" data-preset="10s">10s</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '20s' ? 'active' : ''}" data-preset="20s">20s</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '30s' ? 'active' : ''}" data-preset="30s">30s</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === '60s' ? 'active' : ''}" data-preset="60s">60s (IG)</button>
            <button type="button" class="igt-trim-preset-btn \${studioState.trimPreset === 'all' ? 'active' : ''}" data-preset="all">Toàn bộ</button>
          </div>`;

  if (code.includes(oldTrimTemplateRow)) {
    code = code.replace(oldTrimTemplateRow, newTrimTemplateRow);
    console.log('[patchPostAndStoryMechanisms] 3. Updated trim templates row in UI!');
  }

  // 4. Cập nhật badgeTitle hiển thị tên template trên Timeline
  const oldBadgeTitle = `        let badgeTitle = \`\${durSec}s\`;
        if (studioState.trimPreset === '15s') badgeTitle = '15s (Story)';
        else if (studioState.trimPreset === '30s') badgeTitle = '30s (Reel)';
        else if (studioState.trimPreset === '60s') badgeTitle = '60s';
        else if (studioState.trimPreset === 'all') badgeTitle = 'Toàn bộ';
        else if (studioState.trimPreset === 'custom') badgeTitle = \`\${durSec}s (Tùy chỉnh)\`;`;

  const newBadgeTitle = `        let badgeTitle = \`\${durSec}s\`;
        if (studioState.trimPreset === '10s') badgeTitle = '10s (Template)';
        else if (studioState.trimPreset === '20s') badgeTitle = '20s (Template)';
        else if (studioState.trimPreset === '15s') badgeTitle = '15s (Template)';
        else if (studioState.trimPreset === '30s') badgeTitle = '30s (Template)';
        else if (studioState.trimPreset === '60s') badgeTitle = '60s (Story IG)';
        else if (studioState.trimPreset === 'all') badgeTitle = 'Toàn bộ';
        else if (studioState.trimPreset === 'custom') badgeTitle = \`\${durSec}s (Tùy chỉnh)\`;`;

  if (code.includes(oldBadgeTitle)) {
    code = code.replace(oldBadgeTitle, newBadgeTitle);
    console.log('[patchPostAndStoryMechanisms] 4. Updated timeline trim badge title!');
  }

  // 5. Cập nhật trọn bộ Export Engine V4 (Hỗ trợ toàn diện Live Photo chuyển động, Video Ultra HD 25Mbps, zero auto-download):
  if (code.includes('// [IGT_POST_AND_STORY_EXPORT_ENGINE_V4]')) {
    console.log('[patchPostAndStoryMechanisms] 5. Export engine V4 already up to date.');
  } else {
    let sIdx = code.indexOf('// [IGT_POST_AND_STORY_EXPORT_ENGINE_V3]');
    if (sIdx === -1) {
      sIdx = code.indexOf('  // Xuất Video Ultra HD 1080p với toàn bộ Chỉnh sửa, Tỉ lệ, Nhãn dán và Âm thanh');
    }
    const exportEndMarker = '  function drawRoundedRect(ctx, x, y, width, height, radius = 0) {';
    const eIdx = code.indexOf(exportEndMarker);

    if (sIdx !== -1 && eIdx !== -1 && sIdx < eIdx) {
      const newExportEngineCode = `  // [IGT_POST_AND_STORY_EXPORT_ENGINE_V4]
  // 1. Hàm đóng gói toàn bộ Album Bài viết (Post / Carousel)
  async function exportPostAlbumZip(cfg, preloadedImages, options = {}) {
    const items = studioState.mediaList;
    if (!items || items.length === 0) return { success: false, error: 'Chưa có slide nào trong Album' };

    const zipFiles = [];
    const slideFiles = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const isLiveCandidate = Boolean(it.isLivePhoto || /^mvimg_|_live|_motion/i.test(it.name || '') || it.liveVideoUrl);
      const isStill = (it.liveMode === 'still');
      const isVid = (it.mediaType === 'video' && !isStill) || (isLiveCandidate && it.liveMode === 'live');
      const mediaSourceUrl = isVid ? (it.liveVideoUrl || it.mediaUrl) : (it.mediaUrl || (it.file ? URL.createObjectURL(it.file) : ''));

      if (isVid) {
        try {
          let vidBlob = (isLiveCandidate && it.liveVideoBlob) ? it.liveVideoBlob : null;
          if (!vidBlob && mediaSourceUrl) {
            const res = await fetch(mediaSourceUrl);
            vidBlob = await res.blob();
          }
          if (!vidBlob && it.file && it.mediaType === 'video') {
            vidBlob = it.file;
          }
          if (vidBlob) {
            const ab = await vidBlob.arrayBuffer();
            const slideName = \`post_slide_\${i + 1}_video.mp4\`;
            zipFiles.push({
              name: slideName,
              data: new Uint8Array(ab)
            });
            slideFiles.push(new File([vidBlob], slideName, { type: 'video/mp4' }));
          }
        } catch (_) {}
      } else {
        try {
          const imgCanvas = document.createElement('canvas');
          const targetW = (studioState.ratio === 'original' && (it.naturalWidth || studioState.naturalWidth)) ? (it.naturalWidth || studioState.naturalWidth) : (cfg.targetW || 1080);
          const targetH = (studioState.ratio === 'original' && (it.naturalHeight || studioState.naturalHeight)) ? (it.naturalHeight || studioState.naturalHeight) : (cfg.targetH || 1920);
          imgCanvas.width = targetW;
          imgCanvas.height = targetH;
          const ctx = imgCanvas.getContext('2d', { alpha: false });

          const img = new Image();
          if (mediaSourceUrl && !mediaSourceUrl.startsWith('blob:') && !mediaSourceUrl.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
          }
          img.src = mediaSourceUrl;
          await new Promise(r => {
            img.addEventListener('load', () => r(), { once: true });
            img.addEventListener('error', () => r(), { once: true });
            setTimeout(r, 2000);
          });

          renderMediaFrameToCanvas(ctx, img, targetW, targetH, cfg);
          if (typeof drawStickersOnExportCanvas === 'function') {
            drawStickersOnExportCanvas(ctx, targetW, targetH, cfg.frameW, cfg.frameH, 0, preloadedImages);
          }

          const imgBlob = await new Promise(r => imgCanvas.toBlob(r, 'image/jpeg', 0.95));
          if (imgBlob) {
            const ab = await imgBlob.arrayBuffer();
            const slideName = \`post_slide_\${i + 1}_image.jpg\`;
            zipFiles.push({
              name: slideName,
              data: new Uint8Array(ab)
            });
            slideFiles.push(new File([imgBlob], slideName, { type: 'image/jpeg' }));
          }
        } catch (_) {}
      }
    }

    if (zipFiles.length > 0 || slideFiles.length > 0) {
      const zipBlob = (typeof createZipBlob === 'function')
        ? createZipBlob(zipFiles)
        : ((typeof window !== 'undefined' && typeof window.__IGT_CREATE_ZIP__ === 'function') ? window.__IGT_CREATE_ZIP__(zipFiles) : null);

      const zipName = \`instatweaks_post_album_ultra_hd_\${Date.now()}.zip\`;
      if (zipBlob && !options.skipDownload) {
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = zipName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
      }
      return {
        success: true,
        isAlbum: true,
        blob: zipBlob,
        fileName: zipName,
        slideFiles: slideFiles
      };
    }
    return { success: false, error: 'Không thể kết xuất slide nào trong album' };
  }

  // 2. Xuất Video Ultra HD 1080p với toàn bộ Chỉnh sửa, Tỉ lệ, Nhãn dán, Live Photo và Âm thanh
  async function exportVideoUltraHD(cfg, preloadedImages, chunkInfo = null, options = {}) {
    const modal = document.getElementById('igt-studio-modal');
    if (!modal) return { success: false, error: 'Studio modal not found' };

    return new Promise(async (resolve) => {
      // 1. Tạo overlay tiến trình kết xuất
      const progressOverlay = document.createElement('div');
      progressOverlay.className = 'igt-render-progress-overlay';
      progressOverlay.innerHTML = \`
        <div class="igt-render-card">
          <div class="igt-render-spinner"></div>
          <div class="igt-render-title">🎬 Đang xuất Video Ultra HD 1080p</div>
          <div class="igt-render-bar-track">
            <div class="igt-render-bar-fill" id="igt-render-bar-fill"></div>
          </div>
          <div class="igt-render-pct" id="igt-render-pct">0%</div>
          <div class="igt-render-sub">Đang hòa trộn hình ảnh, nhãn dán và âm thanh theo thời gian thực...</div>
          <button type="button" class="igt-render-cancel-btn" id="igt-render-cancel-btn">✕ Hủy xuất video</button>
        </div>
      \`;
      modal.appendChild(progressOverlay);

      const barFill = progressOverlay.querySelector('#igt-render-bar-fill');
      const pctLabel = progressOverlay.querySelector('#igt-render-pct');
      const btnCancel = progressOverlay.querySelector('#igt-render-cancel-btn');

      let isCancelled = false;
      const cleanupResources = () => {
        try { progressOverlay.remove(); } catch (_) {}
      };

      btnCancel.onclick = () => {
        isCancelled = true;
        cleanupResources();
        resolve({ success: false, cancelled: true });
      };

      const targetW = (studioState.ratio === 'original' && studioState.naturalWidth) ? studioState.naturalWidth : (cfg.targetW || 1080);
      const targetH = (studioState.ratio === 'original' && studioState.naturalHeight) ? studioState.naturalHeight : (cfg.targetH || 1920);

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { alpha: false });

      // Nhận diện Live Photo chuyển động thực sự
      const curItem = (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]);
      const isLiveCandidate = Boolean(curItem && (curItem.isLivePhoto || /^mvimg_|_live|_motion/i.test(curItem.name || '') || curItem.liveVideoUrl || curItem.liveVideoBlob));
      const isLiveActive = Boolean(isLiveCandidate && (curItem.liveMode !== 'still') && (curItem.liveVideoUrl || curItem.liveVideoBlob));
      const isImageMedia = (studioState.mediaType === 'image') && !isLiveActive;

      let exportVideo = null;
      let exportImg = null;
      let startTime = 0;
      let endTime = 15;
      let totalDuration = 15;

      if (isImageMedia) {
        exportImg = new Image();
        if (studioState.mediaUrl && !studioState.mediaUrl.startsWith('blob:') && !studioState.mediaUrl.startsWith('data:')) {
          exportImg.crossOrigin = 'anonymous';
        }
        exportImg.src = studioState.mediaUrl;
        await new Promise(r => {
          exportImg.addEventListener('load', () => r(), { once: true });
          exportImg.addEventListener('error', () => r(), { once: true });
          setTimeout(r, 2000);
        });

        const baseDur = (studioState.mode === 'story' || studioState.mode === 'reel')
          ? (studioState.imageDuration || 15)
          : ((studioState.audioDuration && studioState.audioDuration > 0)
              ? studioState.audioDuration
              : (studioState.imageDuration || 15));

        startTime = chunkInfo ? chunkInfo.chunkStart : 0;
        endTime = chunkInfo ? chunkInfo.chunkEnd : baseDur;
        totalDuration = Math.max(0.5, endTime - startTime);
      } else {
        // 2. Chuẩn bị video playback ẩn để đọc frame (Video thông thường hoặc Live Photo Motion MP4)
        exportVideo = document.createElement('video');
        const activeVideoSrc = isLiveActive
          ? (curItem.liveVideoUrl || (curItem.liveVideoBlob ? URL.createObjectURL(curItem.liveVideoBlob) : studioState.mediaUrl))
          : studioState.mediaUrl;

        if (activeVideoSrc && !activeVideoSrc.startsWith('blob:') && !activeVideoSrc.startsWith('data:')) {
          exportVideo.crossOrigin = 'anonymous';
        }
        exportVideo.playsInline = true;
        exportVideo.muted = false;
        if (isLiveActive) {
          exportVideo.loop = true; // Cho phép Live Photo loop mượt mà theo timeline Story
        }
        exportVideo.style.cssText = 'position:fixed;bottom:0;right:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:-1;';
        modal.appendChild(exportVideo);

        exportVideo.src = activeVideoSrc;
        await new Promise(r => {
          exportVideo.addEventListener('loadedmetadata', () => r(), { once: true });
          exportVideo.addEventListener('error', () => r(), { once: true });
          setTimeout(r, 2000);
        });

        const knownDur = (exportVideo.duration && !isNaN(exportVideo.duration) && isFinite(exportVideo.duration) && exportVideo.duration > 0)
          ? exportVideo.duration
          : (studioState.videoDuration || 15);

        if (isLiveActive) {
          // Với Live Photo: Thời lượng chuẩn theo cài đặt Story (hoặc imageDuration)
          const liveStoryDur = (studioState.mode === 'story' || studioState.mode === 'reel')
            ? (studioState.imageDuration || 15)
            : ((studioState.audioDuration && studioState.audioDuration > 0)
                ? studioState.audioDuration
                : (knownDur || 15));
          startTime = chunkInfo ? chunkInfo.chunkStart : 0;
          endTime = chunkInfo ? chunkInfo.chunkEnd : liveStoryDur;
          totalDuration = Math.max(0.5, endTime - startTime);
        } else {
          const isPresetActive = studioState.trimPreset && studioState.trimPreset !== 'none';
          const baseStart = isPresetActive ? (studioState.trimStart || 0) : (studioState.trimStart || 0);
          startTime = chunkInfo ? (baseStart + chunkInfo.chunkStart) : baseStart;

          const rawEnd = isPresetActive ? (studioState.trimEnd || knownDur) : (studioState.trimEnd || knownDur);
          const maxEnd = Math.max(startTime + 0.5, rawEnd);
          endTime = chunkInfo ? Math.min(maxEnd, baseStart + chunkInfo.chunkEnd) : maxEnd;
          totalDuration = Math.max(0.5, endTime - startTime);
        }
      }

      // 3. Chuẩn bị AudioContext & MediaStreamDestination
      let audioCtx = null;
      let audioDest = null;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioDest = audioCtx.createMediaStreamDestination();

        // Video Audio
        if (exportVideo && !studioState.isVideoMuted && (studioState.videoVolume ?? 1) > 0) {
          const vidSource = audioCtx.createMediaElementSource(exportVideo);
          const vidGain = audioCtx.createGain();
          vidGain.gain.value = studioState.videoVolume ?? 1;
          vidSource.connect(vidGain);
          vidGain.connect(audioDest);
        }
      } catch (_) {}

      // Background Music Audio
      let bgAudioEl = null;
      if (studioState.audioUrl && !studioState.isAudioMuted && (studioState.audioVolume ?? 0.8) > 0 && audioCtx && audioDest) {
        try {
          bgAudioEl = document.createElement('audio');
          bgAudioEl.src = studioState.audioUrl;
          bgAudioEl.crossOrigin = 'anonymous';
          const bgSource = audioCtx.createMediaElementSource(bgAudioEl);
          const bgGain = audioCtx.createGain();
          bgGain.gain.value = studioState.audioVolume ?? 0.8;
          bgSource.connect(bgGain);
          bgGain.connect(audioDest);
        } catch (_) {}
      }

      // 4. Capture Canvas Stream (60fps)
      const stream = canvas.captureStream(60);
      if (audioDest && audioDest.stream) {
        const audioTracks = audioDest.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      }

      // 5. Khởi tạo MediaRecorder với bitrate cao 25 Mbps
      let mimeType = 'video/mp4';
      if (!MediaRecorder.isTypeSupported('video/mp4')) {
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
          mimeType = 'video/webm;codecs=vp9,opus';
        } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
          mimeType = 'video/webm;codecs=vp8,opus';
        } else {
          mimeType = 'video/webm';
        }
      }

      const recordedChunks = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 25000000,
        audioBitsPerSecond: 256000
      });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onerror = (e) => {
        console.error('[Studio Export] MediaRecorder error:', e);
        cleanupResources();
        if (exportVideo) { try { exportVideo.remove(); } catch (_) {} }
        resolve({ success: false, error: 'Lỗi MediaRecorder' });
      };

      recorder.onstop = () => {
        if (isCancelled) return;
        cleanupResources();
        if (exportVideo) { try { exportVideo.remove(); } catch (_) {} }

        const blob = new Blob(recordedChunks, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const prefix = studioState.mode || 'story';
        const chunkSuffix = chunkInfo ? \`_part\${chunkInfo.chunkIndex + 1}\` : '';
        const fileName = \`instatweaks_video_\${prefix}_ultra_hd_\${Date.now()}\${chunkSuffix}.\${ext}\`;

        if (!options.skipDownload) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        resolve({
          success: true,
          blob: blob,
          fileName: fileName,
          ext: ext,
          duration: totalDuration,
          isVideo: true
        });
      };

      // 6. Bắt đầu thu và phát video/audio
      if (bgAudioEl) {
        const bgOffset = chunkInfo ? chunkInfo.chunkStart : 0;
        bgAudioEl.currentTime = (studioState.audioStart || 0) + bgOffset;
      }

      try {
        recorder.start(100);
      } catch (_) {
        recorder.start();
      }

      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      if (bgAudioEl) bgAudioEl.play().catch(() => {});

      if (isImageMedia) {
        const animStartTime = performance.now();
        function imageRenderLoop() {
          if (isCancelled) {
            cleanupResources();
            resolve({ success: false, cancelled: true });
            return;
          }
          const now = performance.now();
          const elapsedSec = (now - animStartTime) / 1000;
          const progress = Math.min(100, Math.max(0, (elapsedSec / totalDuration) * 100));

          if (barFill) barFill.style.setProperty('width', \`\${progress}%\`, 'important');
          if (pctLabel) pctLabel.innerText = \`\${Math.round(progress)}%\`;

          try {
            renderMediaFrameToCanvas(ctx, exportImg, targetW, targetH, cfg);
            drawStickersOnExportCanvas(ctx, targetW, targetH, cfg.frameW, cfg.frameH, elapsedSec, preloadedImages);
          } catch (fErr) {
            console.warn('[Studio Export] Image-video render error:', fErr);
          }

          if (elapsedSec >= totalDuration) {
            if (bgAudioEl) bgAudioEl.pause();
            if (barFill) barFill.style.setProperty('width', '100%', 'important');
            if (pctLabel) pctLabel.innerText = '100%';
            if (recorder && recorder.state === 'recording') {
              recorder.stop();
            }
            return;
          }

          requestAnimationFrame(imageRenderLoop);
        }

        imageRenderLoop();
        return;
      }

      // Media là video (Video clip thường hoặc Live Photo Motion MP4)
      exportVideo.currentTime = startTime;
      await exportVideo.play().catch(() => {});

      const videoAnimStartTime = performance.now();

      function renderLoop() {
        if (isCancelled) {
          try { recorder.stop(); exportVideo.pause(); if (bgAudioEl) bgAudioEl.pause(); } catch (_) {}
          cleanupResources();
          if (exportVideo) { try { exportVideo.remove(); } catch (_) {} }
          return;
        }

        let isFinished = false;
        let progress = 0;
        let currentTimestamp = 0;

        if (isLiveActive) {
          // Với Live Photo: Dùng wall-clock elapsed time vì video loop liên tục
          const now = performance.now();
          const elapsedSec = (now - videoAnimStartTime) / 1000;
          progress = Math.min(100, Math.max(0, (elapsedSec / totalDuration) * 100));
          currentTimestamp = elapsedSec;
          if (elapsedSec >= totalDuration) {
            isFinished = true;
          }
        } else {
          // Với Video thông thường: Đo theo timeline currentTime
          const curT = exportVideo.currentTime;
          progress = Math.min(100, Math.max(0, ((curT - startTime) / totalDuration) * 100));
          currentTimestamp = curT;
          if (curT >= endTime || exportVideo.ended) {
            isFinished = true;
          }
        }

        if (barFill) barFill.style.width = \`\${progress}%\`;
        if (pctLabel) pctLabel.innerText = \`\${Math.round(progress)}%\`;

        try {
          renderMediaFrameToCanvas(ctx, exportVideo, targetW, targetH, cfg);
          drawStickersOnExportCanvas(ctx, targetW, targetH, cfg.frameW, cfg.frameH, currentTimestamp, preloadedImages);
        } catch (fErr) {
          console.warn('[Studio Export] Video render error:', fErr);
        }

        if (isFinished) {
          exportVideo.pause();
          if (bgAudioEl) bgAudioEl.pause();
          if (barFill) barFill.style.setProperty('width', '100%', 'important');
          if (pctLabel) pctLabel.innerText = '100%';
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        requestAnimationFrame(renderLoop);
      }

      renderLoop();
    });
  }

  // 3. Xuất Hình Ảnh Ultra HD với toàn bộ Chỉnh sửa, Tỉ lệ và Nhãn dán
  async function exportImageUltraHD(cfg, preloadedImages, options = {}) {
    const targetW = (studioState.ratio === 'original' && studioState.naturalWidth) ? studioState.naturalWidth : (cfg.targetW || 1080);
    const targetH = (studioState.ratio === 'original' && studioState.naturalHeight) ? studioState.naturalHeight : (cfg.targetH || 1920);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: false });

    const img = new Image();
    if (studioState.mediaUrl && !studioState.mediaUrl.startsWith('blob:') && !studioState.mediaUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = studioState.mediaUrl;
    await new Promise(r => {
      img.onload = r;
      img.onerror = r;
      setTimeout(r, 2000);
    });

    // 1. Vẽ hình ảnh với Pan & Zoom + nền mờ / cover
    renderMediaFrameToCanvas(ctx, img, targetW, targetH, cfg);

    // 2. Vẽ toàn bộ Stickers lên ảnh
    drawStickersOnExportCanvas(ctx, targetW, targetH, cfg.frameW, cfg.frameH, 0, preloadedImages);

    // 3. Xuất file với chất lượng 100% (Lossless JPEG 1.0)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve({ success: false, error: 'Không thể tạo ảnh từ canvas' });
          return;
        }
        const prefix = studioState.mode === 'story' ? 'story' : (studioState.mode === 'reel' ? 'reel' : 'post');
        const fileName = \`instatweaks_\${prefix}_ultra_hd_\${Date.now()}.jpg\`;

        if (!options.skipDownload) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        resolve({
          success: true,
          blob: blob,
          fileName: fileName,
          ext: 'jpg',
          isVideo: false,
          duration: 0
        });
      }, 'image/jpeg', 1.0);
    });
  }

  // 4. Hàm xuất bản chính thức Ultra HD
  async function exportAndDownloadUltraHD(options = {}) {
    if (!studioState.mediaUrl) {
      alert('Vui lòng thêm ảnh hoặc video trước khi xuất file!');
      return { success: false, error: 'Chưa có file media' };
    }

    const cfg = RATIO_CONFIGS[studioState.ratio] || RATIO_CONFIGS['9:16'];

    // 1. Preload trước toàn bộ tài nguyên sticker (ảnh GIF, avatar mention, v.v.)
    const preloadedImages = await preloadAllStickerAssets();

    // 1b. Fast-pass cho video đơn lẻ không chỉnh sửa hiệu ứng/nhãn dán/nhạc ngoài (Lossless Ultra HD 0ms)
    const curActiveMedia = (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]);
    const origVideoFile = curActiveMedia?.file || studioState.mediaFile;
    const isSinglePlainVideo = (studioState.mediaType === 'video') &&
      (!studioState.isSequenceMode || !studioState.videoClips || studioState.videoClips.length <= 1) &&
      (!studioState.stickers || studioState.stickers.length === 0) &&
      (!studioState.specialFx || studioState.specialFx === 'none') &&
      (!studioState.audioUrl || studioState.isAudioMuted) &&
      (!studioState.imageFilter || studioState.imageFilter === 'none') &&
      (studioState.zoom === 1) && !studioState.panX && !studioState.panY &&
      !studioState.rotation && !studioState.freeAngle && !studioState.flipH && !studioState.flipV &&
      (!studioState.trimPreset || studioState.trimPreset === 'none') &&
      origVideoFile;

    if (isSinglePlainVideo) {
      const fileName = origVideoFile.name || ('instatweaks_video_' + Date.now() + '.mp4');
      const ext = fileName.split('.').pop() || 'mp4';
      if (!options.skipDownload) {
        const dlUrl = URL.createObjectURL(origVideoFile);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(dlUrl), 10000);
      }
      return {
        success: true,
        blob: origVideoFile,
        fileName: fileName,
        ext: ext,
        duration: studioState.videoDuration || 15,
        isDirectOriginal: true
      };
    }

    // 2. Chế độ Bài viết (Post / Feed):
    if (studioState.mode === 'post') {
      if (studioState.mediaList && studioState.mediaList.length > 1) {
        return await exportPostAlbumZip(cfg, preloadedImages, options);
      }
      if (shouldExportAsVideo()) {
        return await exportVideoUltraHD(cfg, preloadedImages, null, options);
      }
      return await exportImageUltraHD(cfg, preloadedImages, options);
    }

    // 3. Chế độ Story và Reel: Tự động xuất Video nếu có nhạc/live/hiệu ứng động
    if (shouldExportAsVideo()) {
      const curItem = (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]);
      const isLiveCandidate = Boolean(curItem && (curItem.isLivePhoto || /^mvimg_|_live|_motion/i.test(curItem.name || '') || curItem.liveVideoUrl || curItem.liveVideoBlob));
      const isLiveActive = Boolean(isLiveCandidate && (curItem.liveMode !== 'still') && (curItem.liveVideoUrl || curItem.liveVideoBlob));
      const isImg = (studioState.mediaType === 'image') && !isLiveActive;
      const isStory = studioState.mode === 'story';
      const isReel = studioState.mode === 'reel';
      const totalDur = (isImg || isLiveActive)
        ? ((isStory || isReel) ? (studioState.imageDuration || 15) : (studioState.audioDuration > 0 ? studioState.audioDuration : (studioState.imageDuration || 15)))
        : ((studioState.videoClips && studioState.videoClips.length > 0)
            ? getVideoClipsTotalDuration()
            : Math.max(0.5, (studioState.trimEnd || studioState.videoDuration || 15) - (studioState.trimStart || 0)));

      const splitSec = studioState.sequenceSplitDuration || 15;
      const shouldSplit = (studioState.mode === 'story' && studioState.autoSplitStories && totalDur > splitSec);
      const numChunks = shouldSplit ? Math.ceil(totalDur / splitSec) : 1;

      if (numChunks > 1) {
        let firstRes = null;
        for (let i = 0; i < numChunks; i++) {
          const chunkStart = i * splitSec;
          const chunkEnd = Math.min(totalDur, (i + 1) * splitSec);
          const res = await exportVideoUltraHD(cfg, preloadedImages, {
            chunkIndex: i,
            totalChunks: numChunks,
            chunkStart,
            chunkEnd
          }, options);
          if (!firstRes) firstRes = res;
          if (!res || !res.success) break;
        }
        return firstRes || { success: false };
      } else {
        return await exportVideoUltraHD(cfg, preloadedImages, null, options);
      }
    } else {
      return await exportImageUltraHD(cfg, preloadedImages, options);
    }
  }`;

      code = code.slice(0, sIdx) + newExportEngineCode + '\n\n' + code.slice(eIdx);
      console.log('[patchPostAndStoryMechanisms] 5. Replaced export engine with complete V4 (Live Photo Motion Ultra HD, zero auto-download)!');
    }
  }

  return code;
}

module.exports = { patchPostAndStoryMechanisms };

if (require.main === module) {
  let c = fs.readFileSync('scripts/studio_core.js', 'utf8');
  c = patchPostAndStoryMechanisms(c);
  fs.writeFileSync('scripts/studio_core.js', c, 'utf8');
  console.log('Successfully patched studio_core.js with Post and Story mechanisms!');
}
