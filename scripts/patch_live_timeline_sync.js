const fs = require('fs');

function patchLiveTimelineSync(code) {
  // 1. Cập nhật togglePlayPause để hỗ trợ cả Video, Ảnh tĩnh và Ảnh Live (kim timeline chạy 100% mượt mà)
  const oldToggleStart = '  function togglePlayPause() {';
  const oldToggleEnd = '  function setVideoVolume(val, toggleMute = false) {';
  const tStartIdx = code.indexOf(oldToggleStart);
  const tEndIdx = code.indexOf(oldToggleEnd);

  if (tStartIdx !== -1 && tEndIdx !== -1) {
    const completeToggleFn = `  function togglePlayPause() {
    const video = document.getElementById('igt-studio-active-media');
    const playIcon = document.getElementById('igt-timeline-play-icon');
    const isPlaying = studioState.isVideoPlaying;

    if (isPlaying) {
      studioState.isVideoPlaying = false;
      if (studioState.imagePlayTimer) {
        cancelAnimationFrame(studioState.imagePlayTimer);
        studioState.imagePlayTimer = null;
      }
      if (studioState.videoPlayTimer) {
        cancelAnimationFrame(studioState.videoPlayTimer);
        studioState.videoPlayTimer = null;
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

      const totalTimelineDur = getTotalTimelineDuration();
      const maxTimelineDur = (studioState.mediaType === 'image')
        ? ((studioState.mode === 'story' || studioState.mode === 'reel') ? (studioState.imageDuration || 15) : (studioState.videoDuration || 15))
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
        const aPromise = studioState.audioElement.play();
        if (aPromise !== undefined) {
          aPromise.catch(err => {
            console.warn('[Studio Playback] Audio play caught:', err);
            if (studioState.audioUrl && studioState.audioUrl.startsWith('http')) {
              getSafePlayableAudio(studioState.audioUrl).then(sUrl => {
                if (sUrl && studioState.audioElement) {
                  studioState.audioUrl = sUrl;
                  studioState.audioElement.src = sUrl;
                  studioState.audioElement.currentTime = audioTime;
                  studioState.audioElement.play().catch(() => {});
                }
              });
            }
          });
        }
      }

      // 2. Kích hoạt phát Video nếu media là Video thật
      if (video && studioState.mediaType === 'video') {
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

        if (studioState.videoPlayTimer) cancelAnimationFrame(studioState.videoPlayTimer);
        const videoTimelineLoop = () => {
          if (!studioState.isVideoPlaying || studioState.mediaType !== 'video') {
            studioState.videoPlayTimer = null;
            return;
          }

          if (video && !video.paused) {
            const curVidT = video.currentTime;
            const curTimelineT = (studioState.videoClips && studioState.videoClips.length > 0)
              ? getTimelineTimeFromVideoTime(currentPlayingClipIndex, curVidT)
              : curVidT;

            studioState.currentTime = curTimelineT;
            updateTimelineNeedle();
            checkAndApplyLiveTransition(curTimelineT);

            // Đồng bộ âm thanh nền liên tục theo kim timeline, tự động loop mượt mà nếu bài hát ngắn hơn video
            if (studioState.audioElement && studioState.audioUrl) {
              const audioDur = studioState.audioDuration || 30;
              const startT = (studioState.audioClips && studioState.audioClips[0]) ? (studioState.audioClips[0].start || 0) : (studioState.audioStart || 0);
              const availDur = Math.max(1, audioDur - startT);
              const elapsed = Math.max(0, curTimelineT);
              const targetAudioTime = startT + (elapsed % availDur);

              if (studioState.audioElement.paused && !studioState.isAudioMuted) {
                studioState.audioElement.play().catch(() => {});
              }
              if (Math.abs((studioState.audioElement.currentTime || 0) - targetAudioTime) > 0.45) {
                try { studioState.audioElement.currentTime = targetAudioTime; } catch (_) {}
              }
            }

            if (studioState.videoClips && studioState.videoClips.length > 0) {
              const curClip = studioState.videoClips[currentPlayingClipIndex] || studioState.videoClips[0];
              if (curVidT >= (curClip.end || 60) - 0.04) {
                if (currentPlayingClipIndex < studioState.videoClips.length - 1) {
                  currentPlayingClipIndex++;
                  const nextClip = studioState.videoClips[currentPlayingClipIndex];
                  studioState.selectedClipId = nextClip.id;
                  ensureVideoClipLoaded(nextClip, nextClip.start, true);
                  renderTimeline();
                  if (studioState.activeTab === 'main') renderTabContent('main');
                } else {
                  if (studioState.isVideoLoop || studioState.isTimelineLoop) {
                    currentPlayingClipIndex = 0;
                    const firstClip = studioState.videoClips[0];
                    studioState.selectedClipId = firstClip.id;
                    ensureVideoClipLoaded(firstClip, firstClip.start, true);
                    renderTimeline();
                    if (studioState.activeTab === 'main') renderTabContent('main');
                  } else {
                    video.pause();
                    studioState.isVideoPlaying = false;
                    const playIcon = document.getElementById('igt-timeline-play-icon');
                    if (playIcon) playIcon.innerText = '▶';
                    return;
                  }
                }
              }
            }
          }

          studioState.videoPlayTimer = requestAnimationFrame(videoTimelineLoop);
        };
        studioState.videoPlayTimer = requestAnimationFrame(videoTimelineLoop);
      }

      // 3. Kích hoạt bộ điều khiển dòng thời gian thời gian thực cho Ảnh tĩnh hoặc Live Photo (Đồng bộ kim chạy 100%)
      if (studioState.mediaType === 'image') {
        if (studioState.imagePlayTimer) cancelAnimationFrame(studioState.imagePlayTimer);
        let lastTimestamp = performance.now();

        // Nếu trên canvas là thẻ video của Live Photo, kích hoạt phát chuyển động loop
        if (video && video.tagName === 'VIDEO') {
          video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
          video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
          video.play().catch(() => {});
        }

        const imageTimelineLoop = (now) => {
          if (!studioState.isVideoPlaying || studioState.mediaType !== 'image') {
            studioState.imagePlayTimer = null;
            return;
          }
          const dt = (now - lastTimestamp) / 1000;
          lastTimestamp = now;
          studioState.currentTime = (studioState.currentTime || 0) + dt;

          // Đồng bộ âm thanh nền liên tục theo kim timeline cho ảnh tĩnh và Live Photo
          if (studioState.audioElement && studioState.audioUrl) {
            const audioDur = studioState.audioDuration || 30;
            const startT = (studioState.audioClips && studioState.audioClips[0]) ? (studioState.audioClips[0].start || 0) : (studioState.audioStart || 0);
            const availDur = Math.max(1, audioDur - startT);
            const elapsed = Math.max(0, studioState.currentTime || 0);
            const targetAudioTime = startT + (elapsed % availDur);

            if (studioState.audioElement.paused && !studioState.isAudioMuted) {
              studioState.audioElement.play().catch(() => {});
            }
            if (Math.abs((studioState.audioElement.currentTime || 0) - targetAudioTime) > 0.45) {
              try { studioState.audioElement.currentTime = targetAudioTime; } catch (_) {}
            }
          }

          const totalStoryDur = (studioState.mode === 'story' || studioState.mode === 'reel') ? (studioState.imageDuration || 15) : (studioState.videoDuration || 15);

          if (studioState.currentTime >= totalStoryDur) {
            if (studioState.isAudioLoop || studioState.isVideoLoop || studioState.isTimelineLoop) {
              studioState.currentTime = 0;
              if (studioState.audioElement && studioState.audioUrl) {
                studioState.audioElement.currentTime = (studioState.audioClips && studioState.audioClips[0]) ? studioState.audioClips[0].start : (studioState.audioStart || 0);
                studioState.audioElement.play().catch(() => {});
              }
              if (video && video.tagName === 'VIDEO') {
                video.currentTime = 0;
                video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
                video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
                video.play().catch(() => {});
              }
            } else {
              studioState.currentTime = 0;
              togglePlayPause();
              return;
            }
          }

          // Đồng bộ vị trí phát của video Live Photo theo chu kỳ lặp
          if (video && video.tagName === 'VIDEO' && video.duration > 0) {
            const expVidTime = studioState.currentTime % video.duration;
            if (Math.abs(video.currentTime - expVidTime) > 0.3) {
              try { video.currentTime = expVidTime; } catch (_) {}
            }
          }

          // Đồng bộ liên tục âm thanh nền nếu có và tự động loop mượt mà không bị mất tiếng
          if (studioState.audioElement && studioState.audioUrl) {
            studioState.audioElement.muted = studioState.isAudioMuted;
            studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume !== undefined ? studioState.audioVolume : 0.8);
            if (studioState.audioElement.paused) {
              studioState.audioElement.play().catch(() => {});
            }
            const songDur = studioState.audioDuration || 30;
            const startT = studioState.audioStart || 0;
            const availDur = Math.max(1, songDur - startT);
            const elapsedAudio = Math.max(0, studioState.currentTime - (studioState.audioOffset || 0));
            const expAudioT = startT + (elapsedAudio % availDur);
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

    code = code.slice(0, tStartIdx) + completeToggleFn + code.slice(tEndIdx);
    console.log('[patchLiveTimelineSync] 1. Updated togglePlayPause: timeline needle and audio sync reliably for both Still and Live photos');
  }

  // 2. Cập nhật renderActiveMediaDOM: Khi là Live Photo chuyển động, video chạy loop mượt mà và không can thiệp sai vào timeline
  const oldLiveVideoSetup = `    if (item.mediaType === 'image' && isLiveLoopActive && item.liveVideoUrl) {
      // Ảnh Live ở chế độ Live: Tự động chạy lặp (loop) liên tục video motion chuyển động
      const video = document.createElement('video');
      video.id = 'igt-studio-active-media';
      video.className = 'igt-studio-active-media';
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.src = item.liveVideoUrl;`;

  const newLiveVideoSetup = `    if (item.mediaType === 'image' && isLiveLoopActive && item.liveVideoUrl) {
      // Ảnh Live ở chế độ Live: Tự động chạy lặp (loop) liên tục video motion chuyển động
      const video = document.createElement('video');
      video.id = 'igt-studio-active-media';
      video.className = 'igt-studio-active-media';
      video.autoplay = true;
      video.loop = true;
      video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
      video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
      video.playsInline = true;
      video.src = item.liveVideoUrl;

      // Không gắn timeupdate ghi đè studioState.currentTime để kim timeline Story 15s tự do chạy đồng bộ qua togglePlayPause`;

  code = code.replace(/(\n\s*\/\/\s*Không gắn timeupdate ghi đè studioState\.currentTime để kim timeline Story 15s tự do chạy đồng bộ qua togglePlayPause\s*)+/g, '\n\n      // Không gắn timeupdate ghi đè studioState.currentTime để kim timeline Story 15s tự do chạy đồng bộ qua togglePlayPause\n\n');

  if (code.includes(oldLiveVideoSetup) && !code.includes('Không gắn timeupdate ghi đè')) {
    code = code.replace(oldLiveVideoSetup, newLiveVideoSetup);
    console.log('[patchLiveTimelineSync] 2. Cleaned Live Photo video listeners to let main timeline loop control needle');
  }

  // 3. Xóa bỏ hoàn toàn data-preview-src trên khay tệp bên trái (Queue Cards) để tuyệt đối không có hover preview gây khó chịu
  const oldQueueCardTag = `<div class="igt-media-queue-card \${idx === studioState.activeMediaIndex ? 'active' : ''}" data-idx="\${idx}" data-preview-src="\${escapeHtml(item.mediaType === 'video' ? (item.mediaUrl || '') : (item.liveVideoUrl || ''))}" draggable="true" title="Bấm để kích hoạt | Kéo thả vào dòng thời gian hoặc bấm dấu + để thêm vào edit">`;
  const newQueueCardTag = `<div class="igt-media-queue-card \${idx === studioState.activeMediaIndex ? 'active' : ''}" data-idx="\${idx}" draggable="true" title="Bấm để kích hoạt | Kéo thả vào dòng thời gian hoặc bấm dấu + để thêm vào edit">`;

  if (code.includes(oldQueueCardTag)) {
    code = code.replace(oldQueueCardTag, newQueueCardTag);
    console.log('[patchLiveTimelineSync] 3. Removed data-preview-src from left media queue cards');
  }

  // 4. Đồng bộ âm lượng và Mute cho cả Video thật và thẻ Video của Live Photo
  code = code.replace(/if\s*\(\s*video\s*&&\s*studioState\.mediaType\s*===\s*'video'\s*\)\s*\{\s*video\.muted\s*=\s*studioState\.isVideoMuted;\s*video\.volume\s*=\s*studioState\.isVideoMuted\s*\?\s*0\s*:\s*\(studioState\.videoVolume\s*\?\?\s*1\);\s*\}/g,
    `if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
      video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
      video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
    }`);

  return code;
}

module.exports = { patchLiveTimelineSync };
