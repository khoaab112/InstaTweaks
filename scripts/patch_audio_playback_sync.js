const fs = require('fs');

function patchAudioPlaybackSync(code) {
  // 1. Cập nhật togglePlayPause để hỗ trợ cả Video và Ảnh (đồng bộ kim timeline và phát audio)
  const oldToggleStart = '  function togglePlayPause() {';
  const oldToggleEnd = '  function setVideoVolume(val, toggleMute = false) {';
  const tStartIdx = code.indexOf(oldToggleStart);
  const tEndIdx = code.indexOf(oldToggleEnd);

  if (tStartIdx !== -1 && tEndIdx !== -1) {
    const newToggleFn = `  function togglePlayPause() {
    const video = document.getElementById('igt-studio-active-media');
    const playIcon = document.getElementById('igt-timeline-play-icon');
    const isPlaying = studioState.isVideoPlaying;

    if (isPlaying) {
      studioState.isVideoPlaying = false;
      if (studioState.imagePlayTimer) {
        cancelAnimationFrame(studioState.imagePlayTimer);
        studioState.imagePlayTimer = null;
      }
      if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
        video.pause();
      }
      if (studioState.audioElement) {
        studioState.audioElement.pause();
      }
      if (playIcon) playIcon.innerText = '▶';
    } else {
      studioState.isVideoPlaying = true;
      if (playIcon) playIcon.innerText = '⏸';

      const maxTimelineDur = (studioState.mediaType === 'image')
        ? (studioState.mode === 'story' ? (studioState.imageDuration || 15) : (studioState.videoDuration || 15))
        : (studioState.trimEnd && studioState.trimEnd > (studioState.trimStart || 0) ? studioState.trimEnd : (studioState.videoDuration || 60));

      const activeTrimStart = (studioState.mediaType === 'image') ? 0 : (studioState.trimStart || 0);
      const activeTrimEnd = maxTimelineDur;

      let curT = studioState.currentTime || 0;
      if (curT >= activeTrimEnd - 0.05 || curT < activeTrimStart) {
        curT = activeTrimStart;
        studioState.currentTime = activeTrimStart;
      }

      // 1. Kích hoạt phát âm thanh nền (Audio Track) đồng bộ
      if (studioState.audioElement && studioState.audioUrl) {
        let audioTime = 0;
        if (studioState.audioClips && studioState.audioClips.length > 0) {
          const activeAClip = studioState.audioClips.find(ac => curT >= ac.offset && curT <= ac.offset + (ac.end - ac.start));
          audioTime = activeAClip ? (activeAClip.start + (curT - activeAClip.offset)) : (studioState.audioClips[0].start || 0);
        } else {
          audioTime = (curT - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
        }
        try {
          studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration || 60, audioTime));
        } catch (_) {}
        studioState.audioElement.muted = studioState.isAudioMuted;
        studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume !== undefined ? studioState.audioVolume : 0.8);
        studioState.audioElement.play().catch(err => {
          console.warn('[Studio Playback] Audio play caught:', err);
        });
      }

      // 2. Kích hoạt phát Video nếu media là Video
      if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
        if (studioState.videoClips && studioState.videoClips.length > 0) {
          const info = getClipAtTimelineTime(curT);
          if (info) {
            currentPlayingClipIndex = info.index;
            studioState.selectedClipId = info.clip.id;
            ensureVideoClipLoaded(info.clip, info.videoTime, true);
          }
        }
        const targetVidTime = (studioState.videoClips && studioState.videoClips.length > 0)
          ? (getClipAtTimelineTime(curT)?.videoTime ?? curT)
          : curT;
        if (Math.abs((video.currentTime || 0) - targetVidTime) > 0.08) {
          video.currentTime = targetVidTime;
        }
        video.muted = studioState.isVideoMuted;
        video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
        video.play().catch((err) => {
          console.warn('[Studio] video.play error:', err);
        });
      }

      // 3. Kích hoạt bộ điều khiển dòng thời gian thời gian thực nếu media là Ảnh
      if (studioState.mediaType === 'image') {
        if (studioState.imagePlayTimer) cancelAnimationFrame(studioState.imagePlayTimer);
        let lastTimestamp = performance.now();

        const imageTimelineLoop = (now) => {
          if (!studioState.isVideoPlaying || studioState.mediaType !== 'image') {
            studioState.imagePlayTimer = null;
            return;
          }
          const dt = (now - lastTimestamp) / 1000;
          lastTimestamp = now;
          studioState.currentTime = (studioState.currentTime || 0) + dt;

          const totalStoryDur = (studioState.mode === 'story') ? (studioState.imageDuration || 15) : (studioState.videoDuration || 15);

          if (studioState.currentTime >= totalStoryDur) {
            if (studioState.isAudioLoop || studioState.isVideoLoop || studioState.isTimelineLoop) {
              studioState.currentTime = 0;
              if (studioState.audioElement && studioState.audioUrl) {
                studioState.audioElement.currentTime = (studioState.audioClips && studioState.audioClips[0]) ? studioState.audioClips[0].start : (studioState.audioStart || 0);
                studioState.audioElement.play().catch(() => {});
              }
            } else {
              studioState.currentTime = 0;
              togglePlayPause();
              return;
            }
          }

          // Đồng bộ liên tục âm thanh nền nếu có
          if (studioState.audioElement && studioState.audioUrl) {
            studioState.audioElement.muted = studioState.isAudioMuted;
            studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume !== undefined ? studioState.audioVolume : 0.8);
            if (studioState.audioElement.paused) {
              studioState.audioElement.play().catch(() => {});
            }
            const expAudioT = (studioState.currentTime - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
            if (Math.abs(studioState.audioElement.currentTime - expAudioT) > 0.35) {
              try { studioState.audioElement.currentTime = expAudioT; } catch (_) {}
            }
          }

          updateTimelineNeedle();
          studioState.imagePlayTimer = requestAnimationFrame(imageTimelineLoop);
        };

        studioState.imagePlayTimer = requestAnimationFrame(imageTimelineLoop);
      }

      updateTimelineNeedle();
    }
  }\n\n`;

    code = code.slice(0, tStartIdx) + newToggleFn + code.slice(tEndIdx);
    console.log('[patchAudioPlaybackSync] 1. Updated togglePlayPause to support Video and Image sync playback!');
  }

  // 2. Cập nhật btn-use-song: Tự động kích hoạt play() khi safeUrl nạp xong nếu timeline đang chạy
  const oldSafeUrlBlock = `          // 2. Chuyển đổi an toàn sang Blob URL ngầm (Bypass triệt để CSP Instagram)
          if (song.audioUrl) {
            getSafePlayableAudio(song.audioUrl).then(safeUrl => {
              if (safeUrl && safeUrl !== song.audioUrl) {
                studioState.audioUrl = safeUrl;
                if (studioState.audioElement) studioState.audioElement.src = safeUrl;
              }
            }).catch(() => {});
          }`;

  const newSafeUrlBlock = `          // 2. Chuyển đổi an toàn sang Blob URL ngầm (Bypass triệt để CSP Instagram)
          if (song.audioUrl) {
            getSafePlayableAudio(song.audioUrl).then(safeUrl => {
              if (safeUrl) {
                studioState.audioUrl = safeUrl;
                if (studioState.audioElement) {
                  studioState.audioElement.src = safeUrl;
                  studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
                  studioState.audioElement.load();
                  if (studioState.isVideoPlaying) {
                    const curT = studioState.currentTime || 0;
                    const aTime = (curT - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
                    try { studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration || 60, aTime)); } catch (_) {}
                    studioState.audioElement.play().catch(() => {});
                  }
                }
              }
            }).catch(() => {});
          }`;

  if (code.includes(oldSafeUrlBlock)) {
    code = code.replace(oldSafeUrlBlock, newSafeUrlBlock);
    console.log('[patchAudioPlaybackSync] 2. Updated song usage safeUrl handler with auto-play on active playback');
  }

  // 3. Cập nhật timeupdate listener của video để đồng bộ volume, loop mượt mà không bao giờ mất tiếng
  if (code.includes('// [IGT_VIDEO_TIMEUPDATE_AUDIO_LOOP_SYNC]')) {
    console.log('[patchAudioPlaybackSync] 3. video timeupdate audio sync already up to date');
  } else {
    const videoTimeupdateRegex = /if \(studioState\.audioElement && studioState\.audioUrl && studioState\.isVideoPlaying\) \{[\s\S]*?studioState\.audioElement\.pause\(\);\s*\}\s*\}/;

    const newTimeupdateBlock = `if (studioState.audioElement && studioState.audioUrl && studioState.isVideoPlaying) {
          // [IGT_VIDEO_TIMEUPDATE_AUDIO_LOOP_SYNC]
          const curT = studioState.currentTime || 0;
          let matchedAudioTime = null;

          if (studioState.audioClips && studioState.audioClips.length > 0) {
            const activeAClip = studioState.audioClips.find(ac => curT >= ac.offset && curT <= ac.offset + (ac.end - ac.start));
            if (activeAClip) {
              const songDur = studioState.audioDuration || 30;
              const startT = activeAClip.start || 0;
              const availDur = Math.max(1, songDur - startT);
              const elapsedAudio = Math.max(0, curT - activeAClip.offset);
              matchedAudioTime = startT + (elapsedAudio % availDur);
            }
          }
          if (matchedAudioTime === null) {
            const songDur = studioState.audioDuration || 30;
            const startT = studioState.audioStart || 0;
            const availDur = Math.max(1, songDur - startT);
            const elapsedAudio = Math.max(0, curT - (studioState.audioOffset || 0));
            matchedAudioTime = startT + (elapsedAudio % availDur);
          }

          if (matchedAudioTime !== null) {
            studioState.audioElement.muted = studioState.isAudioMuted;
            studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
            if (studioState.audioElement.paused) studioState.audioElement.play().catch(() => { });
            if (Math.abs(studioState.audioElement.currentTime - matchedAudioTime) > 0.35) {
              try { studioState.audioElement.currentTime = matchedAudioTime; } catch (_) {}
            }
          }
        }`;

    if (videoTimeupdateRegex.test(code)) {
      code = code.replace(videoTimeupdateRegex, newTimeupdateBlock);
      console.log('[patchAudioPlaybackSync] 3. Updated video timeupdate with audio loop and harmony sync');
    }
  }

  // 4. Bổ sung class .is-dragging khi bắt đầu kéo sticker và gỡ bỏ khi kết thúc kéo
  const oldStkDragStart = `        let isDraggingSticker = true;
        let startMouseX = e.clientX;
        let startMouseY = e.clientY;
        let startX = s.x;
        let startY = s.y;
        el.classList.add('selected');`;

  const newStkDragStart = `        let isDraggingSticker = true;
        let startMouseX = e.clientX;
        let startMouseY = e.clientY;
        let startX = s.x;
        let startY = s.y;
        el.classList.add('selected', 'is-dragging');`;

  if (code.includes(oldStkDragStart)) {
    code = code.replace(oldStkDragStart, newStkDragStart);
    console.log('[patchAudioPlaybackSync] 4a. Added is-dragging class to sticker drag start');
  }

  const oldStkDragEnd = `        const onStickerMouseUp = () => {
          if (!isDraggingSticker) return;
          isDraggingSticker = false;`;

  const newStkDragEnd = `        const onStickerMouseUp = () => {
          if (!isDraggingSticker) return;
          isDraggingSticker = false;
          el.classList.remove('is-dragging');`;

  if (code.includes(oldStkDragEnd)) {
    code = code.replace(oldStkDragEnd, newStkDragEnd);
    console.log('[patchAudioPlaybackSync] 4b. Removed is-dragging class on sticker drag end');
  }

  return code;
}

module.exports = { patchAudioPlaybackSync };
