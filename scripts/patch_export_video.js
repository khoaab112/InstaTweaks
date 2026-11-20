const fs = require('fs');

function patchExportVideo(code) {
  // 1. Thêm helper shouldExportAsVideo
  const helperCode = `  // Tự động xác định đối tượng cần xuất/đăng dưới dạng VIDEO:
  // - Khi là video gốc
  // - Hoặc khi là ảnh nhưng có gắn nhạc nền, có hiệu ứng động sticker/FX, hoặc có giới hạn thời gian hiển thị Story
  function shouldExportAsVideo() {
    if (studioState.mediaType === 'video') return true;
    if (studioState.audioUrl || studioState.audioFile) return true;
    if (studioState.stickers && studioState.stickers.some(s => s.anim && s.anim !== 'none')) return true;
    if (studioState.isLiveItemMode) return true;
    if (studioState.specialFx && studioState.specialFx !== 'none') return true;
    if (studioState.mode === 'story' && (studioState.audioUrl || studioState.customStoryDurationSet)) return true;
    if (studioState.mode === 'reel') return true;
    return false;
  }
`;

  if (!code.includes('function shouldExportAsVideo()')) {
    const targetPlace = '  // Xuất Video Ultra HD 1080p với toàn bộ Chỉnh sửa, Tỉ lệ, Nhãn dán và Âm thanh';
    if (code.includes(targetPlace)) {
      code = code.replace(targetPlace, helperCode + '\n' + targetPlace);
      console.log('[patchExportVideo] 1. Added shouldExportAsVideo helper function');
    }
  }

  // 2. Cập nhật exportAndDownloadUltraHD để dùng shouldExportAsVideo()
  const oldExportCheck = `    // 2. Tùy theo loại media (Video hay Ảnh) mà gọi bộ kết xuất chuẩn
    if (studioState.mediaType === 'video') {
      const totalDur = (studioState.videoClips && studioState.videoClips.length > 0)
        ? getVideoClipsTotalDuration()
        : Math.max(0.5, (studioState.trimEnd || studioState.videoDuration || 15) - (studioState.trimStart || 0));

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
          if (!res || !res.success) break; // Người dùng hủy xuất
        }
        return firstRes || { success: false };
      } else {
        return await exportVideoUltraHD(cfg, preloadedImages, null, options);
      }
    } else {
      return await exportImageUltraHD(cfg, preloadedImages, options);
    }`;

  const newExportCheck = `    // 2. Tự động nhận diện Video hay Ảnh (Hỗ trợ Ảnh gắn nhạc / hiệu ứng động xuất ra Video):
    if (shouldExportAsVideo()) {
      const isImg = (studioState.mediaType === 'image');
      const isStory = studioState.mode === 'story';
      const isReel = studioState.mode === 'reel';
      const totalDur = isImg
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
    }`;

  if (code.includes(oldExportCheck)) {
    code = code.replace(oldExportCheck, newExportCheck);
    console.log('[patchExportVideo] 2. Updated exportAndDownloadUltraHD to use shouldExportAsVideo');
  }

  // 3. Cập nhật openPublishModal để nhận diện isVideo = shouldExportAsVideo()
  const oldPublishModalCheck = `    const isVideo = studioState.mediaType === 'video';
    const totalDur = isVideo
      ? (studioState.videoClips && studioState.videoClips.length > 0 ? getVideoClipsTotalDuration() : Math.max(0.5, (studioState.trimEnd || studioState.videoDuration || 15) - (studioState.trimStart || 0)))
      : 15;`;

  const newPublishModalCheck = `    const isVideo = shouldExportAsVideo();
    const isStory = studioState.mode === 'story';
    const isReel = studioState.mode === 'reel';
    const isPost = studioState.mode === 'post';
    const totalDur = isVideo
      ? (studioState.mediaType === 'video'
          ? (studioState.videoClips && studioState.videoClips.length > 0 ? getVideoClipsTotalDuration() : Math.max(0.5, (studioState.trimEnd || studioState.videoDuration || 15) - (studioState.trimStart || 0)))
          : ((isStory || isReel) ? (studioState.imageDuration || 15) : (studioState.audioDuration > 0 ? studioState.audioDuration : (studioState.imageDuration || 15))))
      : (isStory ? (studioState.imageDuration || 15) : 15);`;

  if (code.includes(oldPublishModalCheck)) {
    code = code.replace(oldPublishModalCheck, newPublishModalCheck);
    console.log('[patchExportVideo] 3. Updated openPublishModal isVideo check');
  }

  // Cập nhật nhãn định dạng trong openPublishModal
  const oldMimeLabel = `<b style="color: #38bdf8;">\${isVideo ? 'MP4 Ultra HD (60fps)' : 'JPEG Ultra HD (100%)'}</b>`;
  const newMimeLabel = `<b style="color: #38bdf8;">\${isVideo ? (studioState.mediaType === 'image' ? 'MP4 Video Story (1080p)' : 'MP4 Ultra HD (60fps)') : 'JPEG Ultra HD (100%)'}</b>`;
  if (code.includes(oldMimeLabel)) {
    code = code.replace(oldMimeLabel, newMimeLabel);
    console.log('[patchExportVideo] 4. Updated openPublishModal MIME format label');
  }

  // Cập nhật chọn ảnh bìa Cover chỉ hiện cho video thật
  const oldCoverCheck = `            \${isVideo ? \`
              <!-- Chọn ảnh bìa Cover cho Video/Reel -->`;
  const newCoverCheck = `            \${(studioState.mediaType === 'video') ? \`
              <!-- Chọn ảnh bìa Cover cho Video/Reel -->`;
  if (code.includes(oldCoverCheck)) {
    code = code.replace(oldCoverCheck, newCoverCheck);
    console.log('[patchExportVideo] 5. Updated Cover slider condition');
  }

  // 4. Cập nhật exportVideoUltraHD để hỗ trợ kết xuất Ảnh kèm Nhạc/Hiệu ứng động thành Video MP4/WebM
  const oldVideoInit = `        exportVideo = document.createElement('video');
        if (studioState.mediaUrl && !studioState.mediaUrl.startsWith('blob:') && !studioState.mediaUrl.startsWith('data:')) {
          exportVideo.crossOrigin = 'anonymous';
        }
        exportVideo.playsInline = true;
        exportVideo.muted = true;
        exportVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        modal.appendChild(exportVideo);

        if (!isSequence) {
          exportVideo.src = studioState.mediaUrl;
          await new Promise(r => {
            exportVideo.addEventListener('loadedmetadata', () => r(), { once: true });
            exportVideo.addEventListener('error', () => r(), { once: true });
            setTimeout(r, 2000);
          });

          const knownDur = (exportVideo.duration && !isNaN(exportVideo.duration) && isFinite(exportVideo.duration) && exportVideo.duration > 0)
            ? exportVideo.duration
            : (studioState.videoDuration || 15);

          const isPresetActive = studioState.trimPreset && studioState.trimPreset !== 'none';
          const baseStart = isPresetActive ? (studioState.trimStart || 0) : 0;
          startTime = chunkInfo ? (baseStart + chunkInfo.chunkStart) : baseStart;

          const rawEnd = isPresetActive ? (studioState.trimEnd || knownDur) : knownDur;
          const maxEnd = Math.max(startTime + 0.5, rawEnd);
          endTime = chunkInfo ? Math.min(maxEnd, baseStart + chunkInfo.chunkEnd) : maxEnd;
          totalDuration = Math.max(0.5, endTime - startTime);
          exportClips[0].start = startTime;
          exportClips[0].end = endTime;
        } else {
          const firstUrl = exportClips[0].mediaUrl || studioState.mediaUrl;
          if (firstUrl && !firstUrl.startsWith('blob:') && !firstUrl.startsWith('data:')) {
            exportVideo.crossOrigin = 'anonymous';
          }
          exportVideo.src = firstUrl;
          await new Promise(r => {
            exportVideo.addEventListener('loadedmetadata', () => r(), { once: true });
            exportVideo.addEventListener('error', () => r(), { once: true });
            setTimeout(r, 2000);
          });
          const knownDur = (exportVideo.duration && !isNaN(exportVideo.duration) && isFinite(exportVideo.duration) && exportVideo.duration > 0)
            ? exportVideo.duration
            : (studioState.videoDuration || 15);
          startTime = exportClips[0].start || 0;
          endTime = exportClips[0].end || knownDur;
          totalDuration = Math.max(0.5, exportClips.reduce((sum, c) => sum + ((c.end || knownDur) - (c.start || 0)) / (c.speed || 1), 0));
        }

        // Đợi frame đầu tiên sẵn sàng
        if (exportVideo.readyState < 2) {
          await new Promise(r => {
            const onReady = () => {
              exportVideo.removeEventListener('loadeddata', onReady);
              exportVideo.removeEventListener('canplay', onReady);
              r();
            };
            exportVideo.addEventListener('loadeddata', onReady, { once: true });
            exportVideo.addEventListener('canplay', onReady, { once: true });
            setTimeout(onReady, 1000);
          });
        }`;

  const newVideoInit = `        const isImageMedia = (studioState.mediaType === 'image');
        let exportImg = null;

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
          exportVideo = document.createElement('video');
          if (studioState.mediaUrl && !studioState.mediaUrl.startsWith('blob:') && !studioState.mediaUrl.startsWith('data:')) {
            exportVideo.crossOrigin = 'anonymous';
          }
          exportVideo.playsInline = true;
          exportVideo.muted = true;
          exportVideo.style.cssText = 'position:fixed;bottom:0;right:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:-1;';
          modal.appendChild(exportVideo);

          if (!isSequence) {
            exportVideo.src = studioState.mediaUrl;
            await new Promise(r => {
              exportVideo.addEventListener('loadedmetadata', () => r(), { once: true });
              exportVideo.addEventListener('error', () => r(), { once: true });
              setTimeout(r, 2000);
            });

            const knownDur = (exportVideo.duration && !isNaN(exportVideo.duration) && isFinite(exportVideo.duration) && exportVideo.duration > 0)
              ? exportVideo.duration
              : (studioState.videoDuration || 15);

            const isPresetActive = studioState.trimPreset && studioState.trimPreset !== 'none';
            const baseStart = isPresetActive ? (studioState.trimStart || 0) : 0;
            startTime = chunkInfo ? (baseStart + chunkInfo.chunkStart) : baseStart;

            const rawEnd = isPresetActive ? (studioState.trimEnd || knownDur) : knownDur;
            const maxEnd = Math.max(startTime + 0.5, rawEnd);
            endTime = chunkInfo ? Math.min(maxEnd, baseStart + chunkInfo.chunkEnd) : maxEnd;
            totalDuration = Math.max(0.5, endTime - startTime);
            exportClips[0].start = startTime;
            exportClips[0].end = endTime;
          } else {
            const firstUrl = exportClips[0].mediaUrl || studioState.mediaUrl;
            if (firstUrl && !firstUrl.startsWith('blob:') && !firstUrl.startsWith('data:')) {
              exportVideo.crossOrigin = 'anonymous';
            }
            exportVideo.src = firstUrl;
            await new Promise(r => {
              exportVideo.addEventListener('loadedmetadata', () => r(), { once: true });
              exportVideo.addEventListener('error', () => r(), { once: true });
              setTimeout(r, 2000);
            });
            const knownDur = (exportVideo.duration && !isNaN(exportVideo.duration) && isFinite(exportVideo.duration) && exportVideo.duration > 0)
              ? exportVideo.duration
              : (studioState.videoDuration || 15);
            startTime = exportClips[0].start || 0;
            endTime = exportClips[0].end || knownDur;
            totalDuration = Math.max(0.5, exportClips.reduce((sum, c) => sum + ((c.end || knownDur) - (c.start || 0)) / (c.speed || 1), 0));
          }

          // Đợi frame đầu tiên sẵn sàng
          if (exportVideo.readyState < 2) {
            await new Promise(r => {
              const onReady = () => {
                exportVideo.removeEventListener('loadeddata', onReady);
                exportVideo.removeEventListener('canplay', onReady);
                r();
              };
              exportVideo.addEventListener('loadeddata', onReady, { once: true });
              exportVideo.addEventListener('canplay', onReady, { once: true });
              setTimeout(onReady, 1000);
            });
          }
        }`;

  if (code.includes(oldVideoInit)) {
    code = code.replace(oldVideoInit, newVideoInit);
    console.log('[patchExportVideo] 6. Updated exportVideoUltraHD media initialization for image and video');
  }

  // 5. Cập nhật phần audio và renderLoop để tách nhánh Image và Video
  const oldPlaybackStart = `        // 6. Tua video đến đúng vị trí bắt đầu
        exportVideo.currentTime = startTime;
        if (Math.abs(exportVideo.currentTime - startTime) > 0.05) {
          await new Promise((resSeek) => {
            let timer = null;
            const onSeek = () => {
              clearTimeout(timer);
              exportVideo.removeEventListener('seeked', onSeek);
              resSeek();
            };
            exportVideo.addEventListener('seeked', onSeek, { once: true });
            timer = setTimeout(onSeek, 600);
            exportVideo.currentTime = startTime;
          });
        }

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
          await audioCtx.resume().catch(() => { });
        }

        try {
          await exportVideo.play();
        } catch (pErr) {
          console.warn('[Studio Export] Video play warning:', pErr);
        }
        if (bgAudioEl) bgAudioEl.play().catch(() => { });

        let currentClipIndex = 0;
        let accumulatedTimelineDuration = 0;
        let isSwitchingClip = false;

        // Vòng lặp render frame theo thời gian thực (Hỗ trợ cả đơn lẻ và chuỗi ghép nối đa video)
        function renderLoop() {`;

  const newPlaybackStart = `        // 6. Chuẩn bị Audio & Bắt đầu ghi hình Canvas
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
          await audioCtx.resume().catch(() => { });
        }
        if (bgAudioEl) bgAudioEl.play().catch(() => { });

        // --- NHÁNH 1: MEDIA LÀ ẢNH (Kèm Nhạc / Hiệu ứng động / Story Timeline) ---
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

        // --- NHÁNH 2: MEDIA LÀ VIDEO GỐC ---
        exportVideo.currentTime = startTime;
        if (Math.abs(exportVideo.currentTime - startTime) > 0.05) {
          await new Promise((resSeek) => {
            let timer = null;
            const onSeek = () => {
              clearTimeout(timer);
              exportVideo.removeEventListener('seeked', onSeek);
              resSeek();
            };
            exportVideo.addEventListener('seeked', onSeek, { once: true });
            timer = setTimeout(onSeek, 600);
            exportVideo.currentTime = startTime;
          });
        }

        try {
          await exportVideo.play();
        } catch (pErr) {
          console.warn('[Studio Export] Video play warning:', pErr);
        }

        let currentClipIndex = 0;
        let accumulatedTimelineDuration = 0;
        let isSwitchingClip = false;

        // Vòng lặp render frame theo thời gian thực (Hỗ trợ cả đơn lẻ và chuỗi ghép nối đa video)
        function renderLoop() {`;

  if (code.includes(oldPlaybackStart)) {
    code = code.replace(oldPlaybackStart, newPlaybackStart);
    console.log('[patchExportVideo] 7. Updated playback start and separated Image vs Video render loops');
  }

  // 6. Cập nhật window.__IGT_STUDIO_API__ để xuất shouldExportAsVideo
  const oldApiExport = `    exportVideoUltraHD,
    exportImageUltraHD,`;
  const newApiExport = `    shouldExportAsVideo,
    exportVideoUltraHD,
    exportImageUltraHD,`;
  if (code.includes(oldApiExport)) {
    code = code.replace(oldApiExport, newApiExport);
    console.log('[patchExportVideo] 8. Added shouldExportAsVideo to window.__IGT_STUDIO_API__');
  }

  const oldOffscreenStyle = "exportVideo.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';";
  const newOffscreenStyle = "exportVideo.style.cssText = 'position:fixed;bottom:0;right:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:-1;';";
  if (code.includes(oldOffscreenStyle)) {
    code = code.replace(oldOffscreenStyle, newOffscreenStyle);
    console.log('[patchExportVideo] 9. Updated exportVideo style for reliable frame decoding');
  }

  const oldRecError = `        recorder.onerror = (e) => {
          console.error('[Studio Export] MediaRecorder error:', e);
        };`;
  const newRecError = `        recorder.onerror = (e) => {
          console.error('[Studio Export] MediaRecorder error:', e);
          cleanupResources();
          resolve({ success: false, error: 'Lỗi ghi hình video trình duyệt: ' + (e?.error?.message || e?.name || 'MediaRecorder failed') });
        };`;
  if (code.includes(oldRecError)) {
    code = code.replace(oldRecError, newRecError);
    console.log('[patchExportVideo] 10. Added explicit error handling to recorder.onerror');
  }

  return code;
}

module.exports = { patchExportVideo };
