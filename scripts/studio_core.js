/**
 * =========================================================================
 * INSTATWEAKS STUDIO PRO v3.3.0 - CORE MODULE (scripts/studio_core.js)
 * 100% Decoupled Studio Controller, Canvas Engine, Pan/Zoom & Ratios
 * =========================================================================
 */

(function () {
  'use strict';

  // --- INSTATWEAKS CSP PROTECTION: TỰ ĐỘNG CHUYỂN TẤT CẢ ON* SANG ADDEVENTLISTENER ĐỂ TUÂN THỦ 100% CSP ---
  (function installCSPEventBridge() {
    try {
      const EVENT_NAMES = [
        'click', 'input', 'change', 'mousedown', 'mouseup', 'mousemove',
        'wheel', 'dragover', 'drop', 'dragleave', 'focus', 'blur',
        'keydown', 'keyup', 'touchstart', 'touchend', 'touchmove',
        'loadedmetadata', 'load', 'error', 'play', 'pause', 'timeupdate', 'seeked'
      ];
      const listenerMap = new WeakMap();
      const protos = [
        typeof HTMLElement !== 'undefined' ? HTMLElement.prototype : null,
        typeof SVGElement !== 'undefined' ? SVGElement.prototype : null,
        typeof Element !== 'undefined' ? Element.prototype : null,
        typeof Document !== 'undefined' ? Document.prototype : null
      ].filter(Boolean);

      EVENT_NAMES.forEach(evt => {
        const prop = 'on' + evt;
        protos.forEach(proto => {
          try {
            Object.defineProperty(proto, prop, {
              set(handler) {
                let map = listenerMap.get(this);
                if (!map) {
                  map = {};
                  listenerMap.set(this, map);
                }
                if (map[evt]) {
                  this.removeEventListener(evt, map[evt]);
                }
                if (typeof handler === 'function') {
                  map[evt] = handler;
                  this.addEventListener(evt, handler);
                } else {
                  delete map[evt];
                }
              },
              get() {
                const map = listenerMap.get(this);
                return (map && map[evt]) || null;
              },
              configurable: true,
              enumerable: true
            });
          } catch (_) { }
        });
      });
    } catch (_) { }
  })();

  // Trạng thái của Studio
  const studioState = {
    isOpen: false,
    mode: 'story', // 'story' | 'post' | 'reel'
    ratio: '9:16', // '9:16' | '4:5' | '1:1' | '16:9' | 'original'
    fitMode: 'blur_fit', // 'blur_fit' | 'cover'
    currentFile: null,
    mediaType: null, // 'image' | 'video'
    mediaUrl: '',
    mediaList: [], // Danh sách đa tệp cho Story và Post
    activeMediaIndex: 0,
    naturalWidth: 1080,
    naturalHeight: 1920,
    // Pan & Zoom
    zoom: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialPanX: 0,
    initialPanY: 0,
    activeTab: 'main',
    // Stickers
    stickers: [],
    selectedStickerId: null,
    activeEditingStickerId: null,
    textColor: '#ffffff',
    textIsBox: false,
    textSize: 20,
    textFontFamily: 'system',
    textEffect: 'none',
    linkStyle: 'default',
    // Video Trimmer & Audio Timeline
    videoDuration: 0,
    trimStart: 0,
    trimEnd: 0,
    trimPreset: 'none', // 'none' (Tự do / Custom - Mặc định) | '15s' | '30s' | '60s' | 'all' | 'custom'
    videoClips: [], // Danh sách các đoạn video đã chia: [ { id, start, end, speed } ]
    selectedClipId: null,
    activeTimelineTrack: 'video', // 'video' hoặc 'audio'
    isVideoLoop: true,
    isAudioLoop: true,
    isVideoPlaying: false,
    audioFile: null,
    audioUrl: '',
    audioName: '',
    audioDuration: 0,
    audioStart: 0,
    audioEnd: 0,
    audioOffset: 0,
    audioVolume: 0.8,
    audioClips: [], // Danh sách các đoạn nhạc: [ { id, name, start, end, offset } ]
    selectedAudioClipId: null,
    audioElement: null,
    currentTime: 0,
    videoVolume: 1,
    isVideoMuted: false,
    isAudioMuted: false,
    isTimelineLoop: true,
    timelineZoom: 1,
    // Ghép nối tiếp Story Sequence & Cảnh báo 60s
    isSequenceMode: false,
    sequenceSplitDuration: 15, // 15 | 30 | 60 giây mỗi Story con
    autoSplitStories: false,
    detectedLocation: null, // Vị trí địa lý trích xuất từ EXIF / GPS của tệp
    mentionStyle: 'white', // 'white' | 'frosted' | 'transparent' | 'light_gray' | 'dark_glass' | 'gradient'
    locationStyle: 'white', // 'white' | 'frosted' | 'transparent' | 'light_gray' | 'dark_glass' | 'gradient'
    // Chỉnh sửa ảnh & Hiệu ứng cơ bản (Photo Studio Tools & FX)
    imageDuration: 15, // Thời lượng ảnh trên Story Timeline (5s, 10s, 15s, 30s)
    imageFilter: 'normal', // Bộ lọc màu Instagram
    brightness: 100, // 50 - 150 (%)
    contrast: 100, // 50 - 150 (%)
    saturate: 100, // 0 - 200 (%)
    sepia: 0, // 0 - 100 (%)
    blur: 0, // 0 - 10 (px)
    vignette: 0, // 0 - 100 (%)
    rotation: 0, // 0, 90, 180, 270 (deg)
    freeAngle: 0, // -45 đến +45 (deg)
    flipH: false,
    flipV: false,
    imageFx: 'none', // 'none' | 'grain' | 'sparkle' | 'lightleak' | 'vignette_heavy'
    // Feed Post & Carousel Album settings (Tối đa 20 tệp)
    globalWatermarkText: '',
    globalWatermarkPos: 'bottom-right',
    globalWatermarkFont: 'default', // 'default' | 'signature' | 'serif' | 'typewriter' | 'impact'
    globalWatermarkOpacity: 75,
    globalWatermarkColor: '#ffffff',
    globalFilter: 'none'
  };

  // --- CAPCUT-STYLE TIMELINE ZOOM MATH (Min 50%, 100% tại 1/3 ~ 33.33%, Max 200%) ---
  function tlSliderValToZoom(v) {
    const num = parseFloat(v);
    if (isNaN(num)) return 1.0;
    // Detent / Snap nam châm quanh mốc 100% (khoảng 31.8% - 34.8%)
    if (num >= 31.8 && num <= 34.8) return 1.0;
    if (num <= 33.3333) {
      // Đoạn 0 -> 33.3333 ánh xạ sang 0.5 (50%) -> 1.0 (100%)
      return Math.round((0.5 + (num / 33.3333) * 0.5) * 100) / 100;
    } else {
      // Đoạn 33.3333 -> 100 ánh xạ sang 1.0 (100%) -> 2.0 (200%)
      return Math.round((1.0 + ((num - 33.3333) / 66.6667) * 1.0) * 100) / 100;
    }
  }

  function tlZoomToSliderVal(z) {
    const zoom = Math.max(0.5, Math.min(2.0, parseFloat(z) || 1.0));
    if (Math.abs(zoom - 1.0) < 0.02) return 33.3333;
    if (zoom <= 1.0) {
      return ((zoom - 0.5) / 0.5) * 33.3333;
    } else {
      return 33.3333 + ((zoom - 1.0) / 1.0) * 66.6667;
    }
  }

  const IMAGE_FILTERS = [
    { id: 'normal', name: 'Gốc', css: '', icon: '🌟' },
    { id: 'clarendon', name: 'Clarendon', css: 'contrast(1.2) saturate(1.3) brightness(1.05)', icon: '🏖️' },
    { id: 'gingham', name: 'Gingham', css: 'sepia(0.18) contrast(0.95) brightness(1.05)', icon: '🌾' },
    { id: 'juno', name: 'Juno', css: 'saturate(1.35) contrast(1.15) hue-rotate(-5deg)', icon: '🌅' },
    { id: 'lark', name: 'Lark', css: 'contrast(0.9) brightness(1.15) saturate(1.1)', icon: '🌿' },
    { id: 'moon', name: 'Moon', css: 'grayscale(1) contrast(1.1) brightness(1.05)', icon: '🌙' },
    { id: 'sepia', name: 'Sepia Retro', css: 'sepia(0.65) contrast(1.08) brightness(0.98)', icon: '☕' },
    { id: 'cyberpunk', name: 'Cyberpunk', css: 'contrast(1.3) saturate(1.6) hue-rotate(185deg)', icon: '🏙️' },
    { id: 'pastel', name: 'Pastel Pink', css: 'contrast(0.95) brightness(1.1) saturate(1.25) hue-rotate(-15deg)', icon: '🌸' },
    { id: 'noir', name: 'Film Noir', css: 'grayscale(1) contrast(1.5) brightness(0.85)', icon: '🎬' }
  ];

  const RATIO_CONFIGS = {
    '9:16': { label: '9:16', sub: 'Story / Reel', frameW: 315, frameH: 560, targetW: 1080, targetH: 1920 },
    '4:5': { label: '4:5', sub: 'Dọc Feed', frameW: 380, frameH: 475, targetW: 1080, targetH: 1350 },
    '1:1': { label: '1:1', sub: 'Vuông', frameW: 440, frameH: 440, targetW: 1080, targetH: 1080 },
    '16:9': { label: '16:9', sub: 'Ngang', frameW: 500, frameH: 281, targetW: 1920, targetH: 1080 },
    'original': { label: 'Gốc', sub: 'Tự do', frameW: 380, frameH: 480, targetW: 1080, targetH: 1080 }
  };

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length === 2) {
      return Math.max(0, parseInt(parts[0], 10) * 60 + parseFloat(parts[1]));
    }
    return Math.max(0, parseFloat(timeStr) || 0);
  }

  // Lắng nghe sự kiện mở Studio từ v3_core.js
  window.addEventListener('__IGT_OPEN_STUDIO__', (e) => {
    const requestedMode = (e.detail && e.detail.mode) ? e.detail.mode : 'story';
    openStudio(requestedMode);
  });

  // ==========================================
  // HỆ THỐNG LỊCH SỬ HOÀN TÁC (UNDO / REDO) & LÀM MỚI (RESET ALL)
  // ==========================================
  const historyStack = [];
  let historyIndex = -1;
  const MAX_HISTORY = 40;

  function takeSnapshot(desc = '') {
    const stateObj = {
      stickers: JSON.parse(JSON.stringify(studioState.stickers || [])),
      zoom: studioState.zoom,
      panX: studioState.panX,
      panY: studioState.panY,
      ratio: studioState.ratio,
      fitMode: studioState.fitMode,
      imageFx: studioState.imageFx || 'none',
      trimStart: studioState.trimStart,
      trimEnd: studioState.trimEnd
    };

    // Bỏ qua nếu snapshot giống hệt snapshot hiện tại
    if (historyIndex >= 0 && historyStack[historyIndex]) {
      const cur = historyStack[historyIndex];
      if (
        cur.zoom === stateObj.zoom &&
        cur.panX === stateObj.panX &&
        cur.panY === stateObj.panY &&
        cur.ratio === stateObj.ratio &&
        cur.fitMode === stateObj.fitMode &&
        cur.trimStart === stateObj.trimStart &&
        cur.trimEnd === stateObj.trimEnd &&
        JSON.stringify(cur.stickers) === JSON.stringify(stateObj.stickers)
      ) {
        return;
      }
    }

    // Nếu đang ở giữa stack (sau khi undo), xóa các bước redo phía sau
    if (historyIndex < historyStack.length - 1) {
      historyStack.splice(historyIndex + 1);
    }

    historyStack.push(stateObj);
    if (historyStack.length > MAX_HISTORY) {
      historyStack.shift();
    } else {
      historyIndex++;
    }
    updateHistoryButtonsUI();
  }

  function applySnapshot(stateObj) {
    if (!stateObj) return;
    studioState.stickers = JSON.parse(JSON.stringify(stateObj.stickers || []));
    studioState.zoom = stateObj.zoom ?? 1;
    studioState.panX = stateObj.panX ?? 0;
    studioState.panY = stateObj.panY ?? 0;
    studioState.ratio = stateObj.ratio || '9:16';
    studioState.fitMode = stateObj.fitMode || 'blur_fit';
    studioState.imageFx = stateObj.imageFx || 'none';
    if (stateObj.trimStart !== undefined && studioState.videoDuration) {
      studioState.trimStart = stateObj.trimStart;
      studioState.trimEnd = stateObj.trimEnd;
    }

    renderStickers();
    applyFitMode();
    updateMediaTransform();
    setRatio(studioState.ratio, false);
    renderTimeline();
    updateFxOverlay();

    const slider1 = document.getElementById('igt-studio-zoom-slider');
    const slider2 = document.getElementById('igt-tab-zoom-slider');
    const valLabel = document.getElementById('igt-tab-zoom-val');
    if (slider1) slider1.value = studioState.zoom;
    if (slider2) slider2.value = studioState.zoom;
    if (valLabel) valLabel.innerText = Math.round(studioState.zoom * 100) + '%';

    const modal = document.getElementById('igt-studio-modal');
    if (modal) {
      modal.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-ratio') === studioState.ratio);
      });
      modal.querySelectorAll('.igt-studio-fit-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-fit') === studioState.fitMode);
      });
    }

    updateHistoryButtonsUI();
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      applySnapshot(historyStack[historyIndex]);
    }
  }

  function redo() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      applySnapshot(historyStack[historyIndex]);
    }
  }

  function resetAll() {
    const hasEdits = (studioState.stickers && studioState.stickers.length > 0) ||
      studioState.zoom !== 1 ||
      studioState.panX !== 0 ||
      studioState.panY !== 0 ||
      studioState.fitMode !== 'blur_fit';

    if (hasEdits) {
      if (!confirm('Bạn có chắc muốn làm mới lại toàn bộ thiết kế (xóa các nhãn dán, căn lại vị trí và khung hình về mặc định)?')) {
        return;
      }
    }

    studioState.stickers = [];
    studioState.zoom = 1;
    studioState.panX = 0;
    studioState.panY = 0;
    studioState.fitMode = 'blur_fit';
    if (studioState.mode === 'story' || studioState.mode === 'reel') {
      studioState.ratio = '9:16';
    } else {
      studioState.ratio = '4:5';
    }
    if (studioState.videoDuration) {
      studioState.trimStart = 0;
      studioState.trimEnd = (studioState.videoDuration > 60) ? 30 : studioState.videoDuration;
    }

    applySnapshot({
      stickers: [],
      zoom: 1,
      panX: 0,
      panY: 0,
      ratio: studioState.ratio,
      fitMode: 'blur_fit',
      trimStart: studioState.trimStart,
      trimEnd: studioState.trimEnd
    });
    takeSnapshot('Reset All');
  }

  function clearWorkspace() {
    const hasContent = (studioState.mediaList && studioState.mediaList.length > 0) ||
      studioState.mediaUrl ||
      studioState.audioUrl ||
      (studioState.stickers && studioState.stickers.length > 0);

    if (hasContent) {
      if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ màn hình làm việc?\n\nTất cả video, ảnh, âm thanh nhạc nền và các nhãn dán sẽ bị xóa để trở về màn hình trống rỗng ban đầu.')) {
        return;
      }
    }

    const currentMode = studioState.mode || 'story';
    resetStudioStateToDefault(currentMode);
    renderStudioDOM();
    takeSnapshot('Màn hình làm việc trống');
  }

  function updateHistoryButtonsUI() {
    const btnUndo = document.getElementById('igt-studio-btn-undo');
    const btnRedo = document.getElementById('igt-studio-btn-redo');
    if (btnUndo) {
      const canUndo = historyIndex > 0;
      btnUndo.disabled = !canUndo;
      btnUndo.classList.toggle('disabled', !canUndo);
    }
    if (btnRedo) {
      const canRedo = historyIndex < historyStack.length - 1;
      btnRedo.disabled = !canRedo;
      btnRedo.classList.toggle('disabled', !canRedo);
    }
  }

  // Tạm dừng toàn bộ âm thanh, video ngầm của Instagram để ưu tiên Studio
  let bgMediaMuterTimer = null;
  function pauseAllBackgroundMedia() {
    try {
      const allMedia = document.querySelectorAll('video, audio');
      allMedia.forEach(el => {
        if (!el.closest('#igt-studio-modal')) {
          el.pause();
          el.muted = true;
        }
      });
      document.querySelectorAll('[aria-label="Pause"], [aria-label="Tạm dừng"]').forEach(btn => {
        if (!btn.closest('#igt-studio-modal')) {
          try { btn.click(); } catch (_) { }
        }
      });
      // Tắt nút phát nhạc feed/post của extension nếu đang phát
      document.querySelectorAll('.ig-feed-speaker-btn.state-playing').forEach(btn => {
        try { btn.click(); } catch (_) { }
      });
    } catch (err) {
      console.warn('[Studio] pauseAllBackgroundMedia error:', err);
    }
  }

  function startBgMediaSilencer() {
    pauseAllBackgroundMedia();
    if (bgMediaMuterTimer) clearInterval(bgMediaMuterTimer);
    bgMediaMuterTimer = setInterval(() => {
      if (!studioState.isOpen) {
        clearInterval(bgMediaMuterTimer);
        bgMediaMuterTimer = null;
        return;
      }
      pauseAllBackgroundMedia();
    }, 600);
  }

  function stopBgMediaSilencer() {
    if (bgMediaMuterTimer) {
      clearInterval(bgMediaMuterTimer);
      bgMediaMuterTimer = null;
    }
  }

  function resetStudioStateToDefault(mode = 'story') {
    // 1. Dọn dẹp bộ nhớ RAM các Object URL đang mở
    if (studioState.mediaUrl && studioState.mediaUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(studioState.mediaUrl); } catch (_) { }
    }
    if (studioState.mediaList && studioState.mediaList.length > 0) {
      studioState.mediaList.forEach(item => {
        if (item.mediaUrl && item.mediaUrl.startsWith('blob:')) {
          try { URL.revokeObjectURL(item.mediaUrl); } catch (_) { }
        }
      });
    }
    if (studioState.audioUrl && studioState.audioUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(studioState.audioUrl); } catch (_) { }
    }
    if (studioState.audioElement) {
      try {
        studioState.audioElement.pause();
        studioState.audioElement.src = '';
      } catch (_) { }
    }

    // 2. Đưa toàn bộ thuộc tính của studioState về phiên làm việc mới hoàn toàn sạch sẽ
    studioState.mode = mode;
    studioState.ratio = (mode === 'story' || mode === 'reel') ? '9:16' : '4:5';
    studioState.fitMode = 'blur_fit';
    studioState.currentFile = null;
    studioState.mediaUrl = '';
    studioState.mediaType = null;
    studioState.mediaList = [];
    studioState.activeMediaIndex = 0;
    studioState.naturalWidth = 1080;
    studioState.naturalHeight = 1920;
    studioState.zoom = 1;
    studioState.panX = 0;
    studioState.panY = 0;
    studioState.isDragging = false;
    studioState.stickers = [];
    studioState.activeEditingStickerId = null;
    studioState.activeTab = 'main';
    studioState.linkText = '';
    studioState.linkUrl = '';
    studioState.linkStyle = 'default';
    studioState.videoDuration = 0;
    studioState.trimStart = 0;
    studioState.trimEnd = 0;
    studioState.trimPreset = 'none';
    studioState.videoClips = [];
    studioState.selectedClipId = null;
    studioState.activeTimelineTrack = 'video';
    studioState.isVideoLoop = true;
    studioState.isAudioLoop = true;
    studioState.isVideoPlaying = false;
    studioState.videoVolume = 1;
    studioState.isVideoMuted = false;
    studioState.isAudioMuted = false;
    studioState.audioFile = null;
    studioState.audioUrl = '';
    studioState.audioName = '';
    studioState.audioDuration = 0;
    studioState.audioStart = 0;
    studioState.audioEnd = 0;
    studioState.audioOffset = 0;
    studioState.audioVolume = 0.8;
    studioState.audioClips = [];
    studioState.selectedAudioClipId = null;
    studioState.audioElement = null;
    studioState.currentTime = 0;
    studioState.isTimelineLoop = true;
    studioState.timelineZoom = 1;
    studioState.isSequenceMode = false;
    studioState.sequenceSplitDuration = 15;
    studioState.autoSplitStories = true;
    studioState.detectedLocation = null;
    studioState.textColor = '#ffffff';
    studioState.textIsBox = false;
    studioState.textSize = 20;
    studioState.textFontFamily = 'system';
    studioState.textEffect = 'none';

    // 3. Khởi tạo lại lịch sử hoàn tác (Undo/Redo) cho phiên mới
    historyStack.length = 0;
    historyIndex = -1;
  }

  function openStudio(mode = 'story') {
    startBgMediaSilencer();
    // Xóa sạch toàn bộ dữ liệu phiên cũ để mở phiên làm việc mới hoàn toàn
    resetStudioStateToDefault(mode);

    renderStudioDOM();
    studioState.isOpen = true;
    takeSnapshot('Initial State');
    // Tải trước danh sách bạn bè thật để sẵn sàng gợi ý khi mở tab Nhắc tên
    loadUserFriends().catch(() => { });
    // Tự động kiểm tra và làm mới kho nhạc thịnh hành vào phiên làm việc đầu tiên của ngày
    if (typeof checkAndAutoRefreshDailyMusic === 'function') {
      checkAndAutoRefreshDailyMusic();
    }
  }

  function closeStudio() {
    stopBgMediaSilencer();
    const pubOverlay = document.getElementById('igt-publish-modal-overlay');
    if (pubOverlay) pubOverlay.remove();
    const modal = document.getElementById('igt-studio-modal');
    if (modal) modal.remove();
    studioState.isOpen = false;
    // Dọn dẹp sạch sẽ khi đóng
    resetStudioStateToDefault(studioState.mode || 'story');
  }

  function renderStudioDOM() {
    const existing = document.getElementById('igt-studio-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'igt-studio-modal';
    modal.className = 'igt-studio-modal';

    const cfg = RATIO_CONFIGS[studioState.ratio] || RATIO_CONFIGS['9:16'];

    modal.innerHTML = `
      <div class="igt-studio-dialog">
        <!-- Top Header -->
        <div class="igt-studio-header">
          <div class="igt-studio-header-left">
            <div class="igt-studio-brand-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e1306c" stroke-width="2.3"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
              <span>INSTATWEAKS STUDIO</span>
            </div>

            <!-- Mode Switcher -->
            <div class="igt-studio-mode-pills">
              <button type="button" class="igt-studio-mode-pill ${studioState.mode === 'story' ? 'active' : ''}" data-mode="story">Tin (Story)</button>
              <button type="button" class="igt-studio-mode-pill ${studioState.mode === 'post' ? 'active' : ''}" data-mode="post">Bài viết (Post)</button>
              <button type="button" class="igt-studio-mode-pill ${studioState.mode === 'reel' ? 'active' : ''}" data-mode="reel">Reel (Video)</button>
            </div>

            <!-- Cụm công cụ Hoàn tác (Undo / Redo) & Làm mới (Reset All) tại Vùng Đỏ -->
            <div class="igt-studio-history-tools">
              <button type="button" id="igt-studio-btn-undo" class="igt-studio-header-action-btn disabled" title="Hoàn tác thao tác trước (Ctrl + Z)" disabled>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                <span>Hoàn tác</span>
              </button>
              <button type="button" id="igt-studio-btn-redo" class="igt-studio-header-action-btn disabled" title="Làm lại thao tác sau (Ctrl + Y)" disabled>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path></svg>
                <span>Làm lại</span>
              </button>
              <div class="igt-studio-header-divider"></div>
              <button type="button" id="igt-studio-btn-reset-all" class="igt-studio-header-action-btn danger" title="Làm mới lại toàn bộ thiết kế">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                <span>Làm mới</span>
              </button>
              <div class="igt-studio-header-divider"></div>
              <button type="button" id="igt-studio-btn-clear-workspace" class="igt-studio-header-action-btn danger-trash" title="Xóa màn hình làm việc (Dọn sạch video, âm thanh, sticker để trở về màn hình trống)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                <span>Xóa màn hình</span>
              </button>
            </div>
          </div>

          <button type="button" id="igt-studio-close-btn" class="igt-studio-close-btn" title="Đóng (ESC)">✕</button>
        </div>

        <!-- 3-Column Workspace -->
        <div class="igt-studio-workspace">
          <!-- Cột 1: File Manager & Publish -->
          <div class="igt-studio-sidebar-left">
            <div>
              <div id="igt-studio-dropzone" class="igt-studio-dropzone ${studioState.mediaList && studioState.mediaList.length > 0 ? 'compact' : ''}">
                <input type="file" id="igt-studio-file-input" accept="image/*,video/mp4,video/quicktime,video/webm" style="display: none;" ${studioState.mode !== 'reel' ? 'multiple' : ''} />
                <div class="igt-studio-drop-icon">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                </div>
                <div class="igt-studio-drop-title">${studioState.mediaList && studioState.mediaList.length > 0 ? (studioState.mode === 'reel' ? '🔄 Thay video Reel' : '+ Thêm tệp vào kho') : 'Thêm ảnh hoặc video'}</div>
                <div class="igt-studio-drop-sub">${studioState.mode === 'reel' ? 'Reel chỉ hỗ trợ 1 video duy nhất' : 'Hỗ trợ chọn nhiều tệp (Story / Post)'}</div>
              </div>

              <!-- Danh sách media (Queue) khi đã có file -->
              <div id="igt-studio-media-list" class="igt-studio-media-list"></div>
            </div>

            <!-- Nút Action -->
            <div class="igt-studio-actions-group">
              <button type="button" id="igt-studio-btn-publish" class="igt-studio-btn-publish">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                <span>ĐẨY</span>
              </button>
              <button type="button" id="igt-studio-btn-download-hd" class="igt-studio-btn-download-hd" title="Tải file đã căn chỉnh ở độ nét Full HD 1080p về máy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Tải về Ultra HD</span>
              </button>
            </div>
          </div>

          <!-- Cột 2: Canvas Preview Mobile -->
          <div class="igt-studio-canvas-center">
            <!-- Thanh chọn tỉ lệ chuẩn Instagram (Post: Gốc, 1:1, 4:5, 16:9 | Story/Reel: 9:16) -->
            <div class="igt-studio-ratio-bar">
              ${(studioState.mode === 'post') ? `
                <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === 'original' ? 'active' : ''}" data-ratio="original" title="Gốc - Giữ nguyên tỉ lệ ảnh gốc">Gốc</button>
                <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === '1:1' ? 'active' : ''}" data-ratio="1:1" title="1:1 - Khung vuông Instagram">1:1</button>
                <button type="button" class="igt-studio-ratio-btn is-recommended ${studioState.ratio === '4:5' ? 'active' : ''}" data-ratio="4:5" title="4:5 ★ Dọc chuẩn Instagram (Tối ưu diện tích hiển thị feed nhất)">4:5</button>
                <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === '16:9' ? 'active' : ''}" data-ratio="16:9" title="16:9 - Khung ngang Instagram">16:9</button>
              ` : `
                <button type="button" class="igt-studio-ratio-btn is-recommended active" data-ratio="9:16" title="9:16 ★ Toàn màn hình chuẩn Story & Reel (1080×1920)">9:16</button>
              `}
            </div>

            <!-- Phone Frame -->
            <div id="igt-studio-phone-frame" class="igt-studio-phone-frame" style="width: ${cfg.frameW}px; height: ${cfg.frameH}px;">
              <!-- Nền mờ nghệ thuật -->
              <div id="igt-studio-blur-bg" class="igt-studio-blur-bg" style="display: ${studioState.fitMode === 'blur_fit' ? 'block' : 'none'};"></div>

              <!-- Media tương tác Pan & Zoom -->
              <div id="igt-studio-media-container" class="igt-studio-media-container">
                <div id="igt-studio-empty-prompt" style="color: #64748b; font-size: 13px; font-weight: 500; text-align: center; padding: 20px;">
                  Chưa có tệp nào.<br>Hãy kéo thả ảnh/video vào đây.
                </div>
              </div>

              <!-- Lớp Hiệu ứng FX Overlay (Vignette, Light Leak, Grain, Sparkle) -->
              <div id="igt-studio-fx-overlay" class="igt-studio-fx-overlay" style="display: none;"></div>

              <!-- Lớp Hiệu ứng chuyển cảnh Video (White Flash, Black Dip, Fade, Zoom) -->
              <div id="igt-studio-transition-fx" style="position: absolute; inset: 0; pointer-events: none; z-index: 20; opacity: 0; border-radius: 12px; display: none;"></div>

              <!-- Lớp Sticker -->
              <div id="igt-studio-stickers-layer" class="igt-studio-stickers-layer"></div>
            </div>

            <!-- Thanh điều khiển Zoom dưới đáy -->
            <div class="igt-studio-canvas-controls">
              <span class="igt-studio-zoom-label">Zoom</span>
              <input type="range" id="igt-studio-zoom-slider" class="igt-studio-zoom-slider" min="0.8" max="3" step="0.05" value="${studioState.zoom}" />
              <button type="button" id="igt-studio-btn-reset-center" class="igt-studio-btn-reset-center">Căn giữa</button>
            </div>

            <!-- BỘ CHUYỂN ĐỔI CHẾ ĐỘ ẢNH LIVE / ẢNH THƯỜNG CHO BÀI VIẾT FEED (POST MODE) -->
            <div id="igt-studio-live-selector-panel" class="igt-studio-live-selector-panel" style="display: none;"></div>

            <!-- BỘ CHỈNH SỬA DÒNG THỜI GIAN TIMELINE VIDEO & STORY (MULTI-TRACK) -->
            <div id="igt-studio-timeline-panel" class="igt-studio-timeline-panel">
              <!-- Top bar điều khiển Playback -->
              <div class="igt-timeline-header">
                <div class="igt-timeline-controls-left">
                  <button type="button" id="igt-timeline-play-btn" class="igt-timeline-play-btn" title="Phát / Tạm dừng (Phím Space)">
                    <span id="igt-timeline-play-icon">▶</span>
                  </button>
                  <span id="igt-timeline-time-display" class="igt-timeline-time-display">00:00 / 00:30</span>
                </div>

                <div class="igt-timeline-controls-right">
                  <button type="button" id="igt-timeline-btn-add-music" class="igt-timeline-tool-btn" title="Thêm tệp nhạc MP3">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                    <span>Thêm nhạc</span>
                  </button>
                  <input type="file" id="igt-timeline-audio-input" accept="audio/*" style="display: none;" />

                  <button type="button" id="igt-timeline-btn-split" class="igt-timeline-tool-btn" title="Chia video thành các đoạn nhỏ tại vị trí kim (CapCut split)">
                    ✂️ Chia
                  </button>

                  <button type="button" id="igt-timeline-btn-add-clip" class="igt-timeline-tool-btn" title="Thêm video hoặc ảnh từ khay chứa vào dòng thời gian edit (Bấm để chọn)">
                    ➕ Thêm đoạn
                  </button>

                  <button type="button" id="igt-timeline-btn-merge-all" class="igt-timeline-tool-btn ${studioState.isSequenceMode ? 'active' : ''}" title="Ghép nối tất cả tệp video/ảnh trong kho thành 1 chuỗi liền mạch hoàn chỉnh">
                    🎬 ${studioState.isSequenceMode ? '✓ Đang ghép chuỗi' : 'Ghép nối'}
                  </button>

                  <div id="igt-timeline-clip-actions" style="display: inline-flex; align-items: center; gap: 4px;"></div>

                  <button type="button" id="igt-timeline-btn-loop" class="igt-timeline-tool-btn ${studioState.isTimelineLoop ? 'active' : ''}" title="Bật/Tắt lặp lại video">
                    🔁 Loop
                  </button>

                  <!-- Bộ điều khiển Thu phóng Timeline (CapCut style Zoom Slider: 50% min, 100% ở 1/3, 200% max) -->
                  <div class="igt-timeline-zoom-group" title="Thu phóng dòng thời gian: Mức 50% đến 200% (Mốc chuẩn 100% ở 1/3 thanh trượt)">
                    <button type="button" class="igt-timeline-zoom-btn igt-zoom-btn-out" id="igt-tl-zoom-out" title="Thu nhỏ timeline (Mức 50%)">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="6.8" stroke="currentColor" stroke-width="1.6"/>
                        <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                      </svg>
                    </button>
                    <div class="igt-tl-zoom-track-wrap">
                      <input type="range" class="igt-timeline-zoom-slider" id="igt-tl-zoom-slider" min="0" max="100" step="0.5" value="${tlZoomToSliderVal(studioState.timelineZoom || 1)}" title="Kéo để thu phóng dòng thời gian (50% - 200%)">
                      <span class="igt-tl-zoom-notch-100" title="Mốc chuẩn 100%"></span>
                    </div>
                    <button type="button" class="igt-timeline-zoom-btn igt-zoom-btn-in" id="igt-tl-zoom-in" title="Phóng to timeline (Mức 200%)">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="8" cy="8" r="6.8" stroke="currentColor" stroke-width="1.6"/>
                        <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                        <line x1="8" y1="4.5" x2="8" y2="11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                      </svg>
                    </button>
                    <span class="igt-timeline-zoom-val" id="igt-tl-zoom-val" title="Bấm để đặt lại chuẩn 100%">${Math.round((studioState.timelineZoom || 1) * 100)}%</span>
                  </div>
                </div>
              </div>

              <!-- Vùng làm việc Timeline cuộn ngang -->
              <div class="igt-timeline-body" id="igt-timeline-body">
                <!-- Cột Track Headers (Ô âm thanh) bên trái -->
                <div class="igt-timeline-track-headers">
                  <div class="igt-timeline-ruler-header" title="Danh sách các lớp dòng thời gian">
                    <span>TRACK</span>
                  </div>
                  <div class="igt-timeline-header-tracks">
                    <div class="igt-track-header-box active" id="igt-header-box-video" title="Âm thanh Video: Bấm để Bật/Tắt tiếng, lăn chuột hoặc rê vào để tăng/giảm âm lượng">
                      <button type="button" class="igt-track-audio-btn active-sound" id="igt-track-video-mute-btn" title="Bấm: Bật/Tắt tiếng | Lăn chuột: Tăng/Giảm">
                        <span id="igt-track-video-audio-icon">🔊</span>
                        <span class="igt-track-vol-label" id="igt-track-video-vol-label">100%</span>
                      </button>
                      <!-- Thanh trượt âm lượng Video gọn gàng -->
                      <div class="igt-volume-popover" id="igt-video-vol-popover">
                        <input type="range" class="igt-vol-slider" id="igt-video-vol-slider" min="0" max="1" step="0.05" value="1" title="Kéo để chỉnh âm lượng Video">
                      </div>
                    </div>
                    <div class="igt-track-header-box" id="igt-header-box-audio" title="Âm thanh Nhạc nền: Bấm để Bật/Tắt tiếng, lăn chuột hoặc kéo thanh trượt để chỉnh âm lượng">
                      <button type="button" class="igt-track-audio-btn active-music" id="igt-track-audio-mute-btn" title="Bấm: Bật/Tắt tiếng | Lăn chuột: Tăng/Giảm">
                        <span id="igt-track-audio-audio-icon">🎵</span>
                        <span class="igt-track-vol-label" id="igt-track-audio-vol-label">80%</span>
                      </button>
                      <!-- Thanh trượt âm lượng Nhạc nền gọn gàng -->
                      <div class="igt-volume-popover" id="igt-audio-vol-popover">
                        <input type="range" class="igt-vol-slider" id="igt-audio-vol-slider" min="0" max="1" step="0.05" value="0.8" title="Kéo để chỉnh âm lượng Nhạc nền">
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Vùng Ruler & Tracks (Hỗ trợ cuộn ngang khi Zoom > 1) -->
                <div class="igt-timeline-lanes-area" id="igt-timeline-lanes-area">
                  <div class="igt-timeline-lanes-inner" id="igt-timeline-lanes-inner" style="width: ${(studioState.timelineZoom > 1 ? Math.round(studioState.timelineZoom * 100) : 100)}%;">
                    <!-- Thước đo thời gian Ruler -->
                    <div class="igt-timeline-ruler" id="igt-timeline-ruler"></div>

                    <!-- Khung cắt Video Template Window (15s, 30s, 60s) -->
                    <div class="igt-timeline-trim-window" id="igt-timeline-trim-window" style="display: none;"></div>

                    <!-- Kim thời gian (Needle / Scrubber) -->
                    <div class="igt-timeline-needle" id="igt-timeline-needle" style="left: 0%;">
                      <div class="igt-needle-head" title="Kéo để tua video"></div>
                      <div class="igt-needle-line"></div>
                    </div>

                    <!-- Danh sách các Tracks -->
                    <div class="igt-timeline-tracks" id="igt-timeline-tracks">
                      <!-- Track 1: Media Track (Video / Ảnh) -->
                      <div class="igt-timeline-track-row" id="igt-media-track-row"></div>

                      <!-- Track 2: Audio Track (Nhạc nền) -->
                      <div class="igt-timeline-track-row" id="igt-audio-track-row"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Cột 3: Toolbox & Tabs -->
          <div class="igt-studio-sidebar-right">
            <!-- Tabs Nav -->
            <div class="igt-studio-tabs-nav" id="igt-studio-tabs-nav"></div>

            <!-- Tab Content -->
            <div id="igt-studio-tab-content" class="igt-studio-tab-content">
              <!-- Tab Main Content -->
              <div class="igt-studio-setting-group">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">Kiểu hiển thị khung hình</div>
            <button type="button" class="igt-btn-reset-fit-transform" title="Đưa ảnh/video về vị trí ban đầu cân đối và đẹp nhất trong khung hình" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.18s ease;">
              <span>↺</span>
              <span>Đặt lại</span>
            </button>
          </div>
                <div class="igt-studio-fit-options">
                  <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'blur_fit' ? 'active' : ''}" data-fit="blur_fit">
                    ✨ Giữ trọn ảnh + Nền mờ
                  </button>
                  <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'cover' ? 'active' : ''}" data-fit="cover">
                    📐 Cắt vừa kín khung (Cover)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupStudioEventListeners(modal);
    renderStickers();
    renderTimeline();
  }

  function setupStudioEventListeners(modal) {
    // 1. Nút đóng (Chỉ cho phép bấm nút X để thoát, không thoát khi bấm vùng đen)
    const btnClose = modal.querySelector('#igt-studio-close-btn');
    modal.querySelectorAll('.igt-btn-reset-fit-transform').forEach(b => {
      b.onclick = () => resetMediaTransformToDefault();
    });
    if (btnClose) btnClose.onclick = closeStudio;

    // 1b. Cụm công cụ Hoàn tác (Undo / Redo) & Làm mới (Reset All) tại Vùng Đỏ Header
    const btnUndo = modal.querySelector('#igt-studio-btn-undo');
    if (btnUndo) {
      btnUndo.onclick = () => undo();
    }
    const btnRedo = modal.querySelector('#igt-studio-btn-redo');
    if (btnRedo) {
      btnRedo.onclick = () => redo();
    }
    const btnResetAll = modal.querySelector('#igt-studio-btn-reset-all');
    if (btnResetAll) {
      btnResetAll.onclick = () => resetAll();
    }
    const btnClearWorkspace = modal.querySelector('#igt-studio-btn-clear-workspace');
    if (btnClearWorkspace) {
      btnClearWorkspace.onclick = () => clearWorkspace();
    }

    // Phím tắt Space (Play/Pause), Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo)
    window.addEventListener('keydown', (e) => {
      if (!studioState.isOpen) return;
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;

      if (!isInput) {
        if (e.code === 'Space') {
          e.preventDefault();
          togglePlayPause();
          return;
        }

        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
          return;
        }

        if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
          e.preventDefault();
          redo();
          return;
        }
      }
    });

    // 2. Chuyển Mode (Story / Post / Reel)
    modal.querySelectorAll('.igt-studio-mode-pill').forEach(btn => {
      btn.onclick = () => {
        const m = btn.getAttribute('data-mode');
        if (m === studioState.mode) return;

        // KIỂM TRA ĐIỀU KIỆN KHI CHUYỂN SANG REEL:
        // Reel chỉ hỗ trợ 1 video duy nhất. Nếu kho đang có > 1 file thì hỏi xác nhận
        if (m === 'reel' && studioState.mediaList && studioState.mediaList.length > 1) {
          const totalFiles = studioState.mediaList.length;
          const ok = confirm(
            `⚠️ Chế độ Thước phim (Reel) chỉ cho phép 1 video duy nhất.\n\n` +
            `Hiện kho tệp của bạn đang có ${totalFiles} tệp. Bạn có chắc muốn chuyển sang Reel không?\n` +
            `👉 Nếu tiếp tục, hệ thống sẽ giữ lại 1 tệp video đầu tiên và loại bỏ các tệp còn lại.`
          );
          if (!ok) return;

          // Giữ lại 1 video đầu tiên (hoặc tệp đầu tiên)
          const firstVideoIdx = studioState.mediaList.findIndex(it => it.mediaType === 'video');
          const keepIdx = firstVideoIdx !== -1 ? firstVideoIdx : 0;
          const keptMedia = studioState.mediaList[keepIdx];

          // Thu hồi URL các tệp bị loại bỏ
          studioState.mediaList.forEach((it, idx) => {
            if (idx !== keepIdx && it.mediaUrl && it.mediaUrl.startsWith('blob:')) {
              URL.revokeObjectURL(it.mediaUrl);
            }
          });

          studioState.mediaList = [keptMedia];
          studioState.activeMediaIndex = 0;
          activateMediaItem(0);
          renderMediaListUI();
        }

        studioState.mode = m;
        modal.querySelectorAll('.igt-studio-mode-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Cập nhật cấu hình file input theo chế độ
        const fileInput = modal.querySelector('#igt-studio-file-input');
        const dropSub = modal.querySelector('.igt-studio-drop-sub');
        if (fileInput) {
          if (m === 'reel') {
            fileInput.removeAttribute('multiple');
            fileInput.setAttribute('accept', 'video/mp4,video/quicktime,video/webm');
            if (dropSub) dropSub.innerText = 'Reel chỉ hỗ trợ 1 video duy nhất';
          } else {
            fileInput.setAttribute('multiple', 'multiple');
            fileInput.setAttribute('accept', 'image/*,video/mp4,video/quicktime,video/webm');
            const cnt = studioState.mediaList ? studioState.mediaList.length : 0;
            const maxCnt = m === 'post' ? 20 : 10;
            if (dropSub) dropSub.innerText = cnt > 0 ? `Đã có ${cnt}/${maxCnt} tệp. Kéo thả để thêm` : (m === 'post' ? 'Hỗ trợ tối đa 20 tệp (Ảnh, Video, Live Photo)' : 'Hỗ trợ chọn nhiều tệp (Story)');
          }
        }

        // Tự động đổi ratio tương ứng
        if (m === 'story' || m === 'reel') {
          studioState.ratio = '9:16';
        } else {
          if (studioState.ratio === '9:16' || !['original', '1:1', '4:5', '16:9'].includes(studioState.ratio)) {
            studioState.ratio = 'original';
          }
        }
        renderRatioBar(modal);
        setRatio(studioState.ratio);renderTabsNav(modal);
        renderTabContent(studioState.activeTab);
        renderMediaListUI();
        updateBottomControlsVisibility();
      };
    });

    // 3. Chuyển Tỉ lệ (Ratio Bar)
    modal.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
      btn.onclick = () => {
        const r = btn.getAttribute('data-ratio');
        setRatio(r);
      };
    });

    // 4. Chuyển Chế độ Fit (Blur fit vs Cover)
    modal.querySelectorAll('.igt-studio-fit-btn').forEach(btn => {
      btn.onclick = () => {
        const f = btn.getAttribute('data-fit');
        studioState.fitMode = f;
        modal.querySelectorAll('.igt-studio-fit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFitMode();
        takeSnapshot('Change fit mode');
      };
    });

    // 5. Nút Căn giữa (Reset Center)
    const btnReset = modal.querySelector('#igt-studio-btn-reset-center');
    if (btnReset) {
      btnReset.onclick = () => {
        const mediaEl = document.getElementById('igt-studio-active-media');
        if (mediaEl) mediaEl.classList.add('smooth-animate');
        studioState.zoom = 1;
        studioState.panX = 0;
        studioState.panY = 0;
        if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
          const cur = studioState.mediaList[studioState.activeMediaIndex];
          cur.zoom = 1;
          cur.panX = 0;
          cur.panY = 0;
        }
        const slider = modal.querySelector('#igt-studio-zoom-slider');
        if (slider) slider.value = 1;
        const tabSlider = modal.querySelector('#igt-tab-zoom-slider');
        const tabVal = modal.querySelector('#igt-tab-zoom-val');
        if (tabSlider) tabSlider.value = 1;
        if (tabVal) tabVal.innerText = '100%';
        updateMediaTransform();
        if (mediaEl) setTimeout(() => mediaEl.classList.remove('smooth-animate'), 260);
        takeSnapshot('Reset Center');
      };
    }

    // 6. Slider Zoom
    const zoomSlider = modal.querySelector('#igt-studio-zoom-slider');
    if (zoomSlider) {
      zoomSlider.oninput = (e) => {
        const val = parseFloat(e.target.value);
        studioState.zoom = val;
        if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
          studioState.mediaList[studioState.activeMediaIndex].zoom = val;
        }
        const tabSlider = modal.querySelector('#igt-tab-zoom-slider');
        const tabVal = modal.querySelector('#igt-tab-zoom-val');
        if (tabSlider) tabSlider.value = val;
        if (tabVal) tabVal.innerText = Math.round(val * 100) + '%';
        updateMediaTransform();
      };
      zoomSlider.onchange = () => {
        takeSnapshot('Zoom slider');
      };
    }

    // 6b. Bộ điều khiển Timeline Editor
    const btnTimelinePlay = modal.querySelector('#igt-timeline-play-btn');
    if (btnTimelinePlay) btnTimelinePlay.onclick = togglePlayPause;

    const btnAddMusic = modal.querySelector('#igt-timeline-btn-add-music');
    const audioInput = modal.querySelector('#igt-timeline-audio-input');
    if (btnAddMusic && audioInput) {
      btnAddMusic.onclick = () => audioInput.click();
      audioInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
          loadAudioFile(e.target.files[0]);
        }
      };
    }

    const btnLoop = modal.querySelector('#igt-timeline-btn-loop');
    if (btnLoop) {
      btnLoop.onclick = () => {
        if (studioState.activeTimelineTrack === 'audio') {
          studioState.isAudioLoop = !studioState.isAudioLoop;
          if (studioState.audioElement) studioState.audioElement.loop = studioState.isAudioLoop;
          takeSnapshot(`Đổi lặp lại nhạc nền: ${studioState.isAudioLoop ? 'Bật' : 'Tắt'}`);
        } else {
          studioState.isVideoLoop = !studioState.isVideoLoop;
          studioState.isTimelineLoop = studioState.isVideoLoop;
          takeSnapshot(`Đổi lặp lại video: ${studioState.isVideoLoop ? 'Bật' : 'Tắt'}`);
        }
        updateActiveTrackUI();
      };
    }

    const btnAddClip = modal.querySelector('#igt-timeline-btn-add-clip');
    if (btnAddClip) {
      btnAddClip.onclick = (e) => {
        e.stopPropagation();
        const curLastIdx = (studioState.videoClips ? studioState.videoClips.length - 1 : 0);
        openAddClipPopover(btnAddClip, curLastIdx);
      };
    }

    const btnMergeAll = modal.querySelector('#igt-timeline-btn-merge-all');
    if (btnMergeAll) {
      btnMergeAll.onclick = () => {
        if (!studioState.mediaList || studioState.mediaList.length < 2) {
          alert('Vui lòng thêm từ 2 video/ảnh trở lên trong kho tệp để ghép nối!');
          return;
        }
        toggleStorySequence();
      };
    }

    const btnSplit = modal.querySelector('#igt-timeline-btn-split');
    if (btnSplit) {
      btnSplit.onclick = () => {
        if (studioState.activeTimelineTrack === 'audio') {
          // Chia đoạn track Âm thanh (Audio Split)
          if (!studioState.audioUrl) {
            alert('Vui lòng thêm nhạc nền trước khi chia đoạn nhạc!');
            return;
          }
          if (!studioState.audioClips || studioState.audioClips.length === 0) {
            const aclipId = 'aclip_' + Date.now();
            studioState.audioClips = [{
              id: aclipId,
              name: studioState.audioName || 'audio.mp3',
              start: studioState.audioStart || 0,
              end: studioState.audioEnd || (studioState.audioDuration || 30),
              offset: studioState.audioOffset || 0
            }];
            studioState.selectedAudioClipId = aclipId;
          }

          const curTimelineT = studioState.currentTime || 0;
          const foundClipIdx = studioState.audioClips.findIndex(c => {
            const clipDur = c.end - c.start;
            return curTimelineT >= c.offset && curTimelineT <= (c.offset + clipDur);
          });

          if (foundClipIdx === -1) {
            alert('Vui lòng di chuyển kim thời gian nằm bên trong đoạn nhạc muốn chia!');
            return;
          }

          const clip = studioState.audioClips[foundClipIdx];
          const splitOffset = curTimelineT - clip.offset;
          const splitAudioPoint = clip.start + splitOffset;

          if (splitAudioPoint - clip.start < 0.2 || clip.end - splitAudioPoint < 0.2) {
            alert('Điểm chia quá gần đầu hoặc cuối đoạn nhạc (tối thiểu 0.2s)! Hãy di chuyển kim ra giữa đoạn.');
            return;
          }

          const clipA = {
            id: 'aclip_' + Date.now() + '_a',
            name: (clip.name || 'Nhạc') + ' (P1)',
            start: clip.start,
            end: splitAudioPoint,
            offset: clip.offset
          };
          const clipB = {
            id: 'aclip_' + (Date.now() + 1) + '_b',
            name: (clip.name || 'Nhạc') + ' (P2)',
            start: splitAudioPoint,
            end: clip.end,
            offset: curTimelineT
          };

          studioState.audioClips.splice(foundClipIdx, 1, clipA, clipB);
          studioState.selectedAudioClipId = clipB.id;

          takeSnapshot('Chia đoạn nhạc (Audio Split)');
          renderTimeline();
          if (studioState.activeTab === 'music') renderTabContent('music');
          return;
        }

        // Chia đoạn track Video
        const video = document.getElementById('igt-studio-active-media');
        if (!video || studioState.mediaType !== 'video') {
          alert('Vui lòng thêm video trước khi chia đoạn!');
          return;
        }
        if (!studioState.videoClips || studioState.videoClips.length === 0) {
          studioState.videoClips = [{
            id: 'clip_' + Date.now(),
            start: 0,
            end: studioState.videoDuration || (video.duration || 60),
            speed: 1
          }];
          studioState.selectedClipId = studioState.videoClips[0].id;
        }

        const curTimelineT = studioState.currentTime || 0;
        const info = getClipAtTimelineTime(curTimelineT);
        if (!info) return;

        const clip = info.clip;
        const splitPoint = info.videoTime;

        if (splitPoint - clip.start < 0.2 || clip.end - splitPoint < 0.2) {
          alert('Điểm chia quá gần đầu hoặc cuối đoạn (tối thiểu 0.2s)! Hãy di chuyển kim ra giữa đoạn để chia.');
          return;
        }

        const clipA = {
          id: 'clip_' + Date.now() + '_a',
          start: clip.start,
          end: splitPoint,
          speed: clip.speed || 1
        };
        const clipB = {
          id: 'clip_' + (Date.now() + 1) + '_b',
          start: splitPoint,
          end: clip.end,
          speed: clip.speed || 1
        };

        studioState.videoClips.splice(info.index, 1, clipA, clipB);
        studioState.selectedClipId = clipB.id;
        currentPlayingClipIndex = info.index + 1;

        takeSnapshot('Chia đoạn video (Split)');
        renderTimeline();
        if (studioState.activeTab === 'main') renderTabContent('main');
      };
    }

    // Chọn active track khi click vào Header Box bên trái & xử lý Lăn chuột tăng/giảm âm lượng
    const headerBoxVideo = modal.querySelector('#igt-header-box-video');
    const headerBoxAudio = modal.querySelector('#igt-header-box-audio');
    if (headerBoxVideo) {
      headerBoxVideo.onclick = (e) => {
        if (!e.target.closest('.igt-volume-popover')) {
          setActiveTimelineTrack('video');
        }
      };
      // Lăn chuột trên ô Video Track để tăng/giảm âm lượng (bước nhảy 5%)
      headerBoxVideo.onwheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const current = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
        setVideoVolume(current + delta);
      };
    }
    if (headerBoxAudio) {
      headerBoxAudio.onclick = (e) => {
        if (!e.target.closest('.igt-volume-popover')) {
          setActiveTimelineTrack('audio');
        }
      };
      // Lăn chuột trên ô Audio Track để tăng/giảm âm lượng (bước nhảy 5%)
      headerBoxAudio.onwheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const current = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
        setAudioVolume(current + delta);
      };
    }

    // 6c. Ô âm thanh Track Video: Tắt/Bật tiếng & Bảng Popover điều chỉnh
    const btnVideoMute = modal.querySelector('#igt-track-video-mute-btn');
    if (btnVideoMute) {
      btnVideoMute.onclick = (e) => {
        e.stopPropagation();
        setVideoVolume(0, true);
        setActiveTimelineTrack('video');
      };
    }

    const videoVolPopover = modal.querySelector('#igt-video-vol-popover');
    if (videoVolPopover) {
      videoVolPopover.onclick = (e) => e.stopPropagation();
      videoVolPopover.onwheel = (e) => e.stopPropagation();

      const slider = videoVolPopover.querySelector('#igt-video-vol-slider');
      if (slider) {
        slider.oninput = (e) => setVideoVolume(parseFloat(e.target.value));
      }
      const btnDown = videoVolPopover.querySelector('#igt-video-vol-down');
      if (btnDown) {
        btnDown.onclick = (e) => {
          e.stopPropagation();
          const cur = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
          setVideoVolume(cur - 0.1);
        };
      }
      const btnUp = videoVolPopover.querySelector('#igt-video-vol-up');
      if (btnUp) {
        btnUp.onclick = (e) => {
          e.stopPropagation();
          const cur = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
          setVideoVolume(cur + 0.1);
        };
      }
      const btnMuteQuick = videoVolPopover.querySelector('#igt-video-vol-mute-quick');
      if (btnMuteQuick) {
        btnMuteQuick.onclick = (e) => {
          e.stopPropagation();
          setVideoVolume(0, true);
        };
      }
      const btn50Quick = videoVolPopover.querySelector('#igt-video-vol-50-quick');
      if (btn50Quick) {
        btn50Quick.onclick = (e) => {
          e.stopPropagation();
          setVideoVolume(0.5);
        };
      }
      const btn100Quick = videoVolPopover.querySelector('#igt-video-vol-100-quick');
      if (btn100Quick) {
        btn100Quick.onclick = (e) => {
          e.stopPropagation();
          setVideoVolume(1.0);
        };
      }
    }

    // 6d. Ô âm thanh Track Nhạc nền: Tắt/Bật tiếng & Bảng Popover điều chỉnh
    const btnAudioMute = modal.querySelector('#igt-track-audio-mute-btn');
    if (btnAudioMute) {
      btnAudioMute.onclick = (e) => {
        e.stopPropagation();
        setAudioVolume(0, true);
        setActiveTimelineTrack('audio');
      };
    }

    const audioVolPopover = modal.querySelector('#igt-audio-vol-popover');
    if (audioVolPopover) {
      audioVolPopover.onclick = (e) => e.stopPropagation();
      audioVolPopover.onwheel = (e) => e.stopPropagation();

      const slider = audioVolPopover.querySelector('#igt-audio-vol-slider');
      if (slider) {
        slider.oninput = (e) => setAudioVolume(parseFloat(e.target.value));
      }
      const btnDown = audioVolPopover.querySelector('#igt-audio-vol-down');
      if (btnDown) {
        btnDown.onclick = (e) => {
          e.stopPropagation();
          const cur = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
          setAudioVolume(cur - 0.1);
        };
      }
      const btnUp = audioVolPopover.querySelector('#igt-audio-vol-up');
      if (btnUp) {
        btnUp.onclick = (e) => {
          e.stopPropagation();
          const cur = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
          setAudioVolume(cur + 0.1);
        };
      }
      const btnMuteQuick = audioVolPopover.querySelector('#igt-audio-vol-mute-quick');
      if (btnMuteQuick) {
        btnMuteQuick.onclick = (e) => {
          e.stopPropagation();
          setAudioVolume(0, true);
        };
      }
      const btn50Quick = audioVolPopover.querySelector('#igt-audio-vol-50-quick');
      if (btn50Quick) {
        btn50Quick.onclick = (e) => {
          e.stopPropagation();
          setAudioVolume(0.5);
        };
      }
      const btn100Quick = audioVolPopover.querySelector('#igt-audio-vol-100-quick');
      if (btn100Quick) {
        btn100Quick.onclick = (e) => {
          e.stopPropagation();
          setAudioVolume(1.0);
        };
      }
    }

    // 6e. Thu phóng Dòng thời gian Timeline (CapCut Timeline Zoom: 50% - 200%, chuẩn 100% ở 1/3)
    const tlZoomSlider = modal.querySelector('#igt-tl-zoom-slider');
    if (tlZoomSlider) {
      tlZoomSlider.oninput = (e) => {
        setTimelineZoom(tlSliderValToZoom(e.target.value));
      };
    }

    const btnZoomOut = modal.querySelector('#igt-tl-zoom-out');
    if (btnZoomOut) {
      btnZoomOut.onclick = () => {
        const current = studioState.timelineZoom || 1.0;
        setTimelineZoom(Math.max(0.5, Math.round((current - 0.1) * 10) / 10));
      };
    }

    const btnZoomIn = modal.querySelector('#igt-tl-zoom-in');
    if (btnZoomIn) {
      btnZoomIn.onclick = () => {
        const current = studioState.timelineZoom || 1.0;
        setTimelineZoom(Math.min(2.0, Math.round((current + 0.1) * 10) / 10));
      };
    }

    const zoomValEl = modal.querySelector('#igt-tl-zoom-val');
    if (zoomValEl) {
      zoomValEl.onclick = () => {
        setTimelineZoom(1.0);
      };
    }

    const lanesAreaEl = modal.querySelector('#igt-timeline-lanes-area');
    if (lanesAreaEl) {
      // Lăn chuột trên Ruler hoặc Ctrl + Lăn chuột trong Timeline để Zoom như CapCut
      lanesAreaEl.addEventListener('wheel', (e) => {
        const isRuler = !!e.target.closest('#igt-timeline-ruler');
        if (e.ctrlKey || e.metaKey || isRuler) {
          e.preventDefault();
          const lanesInner = document.getElementById('igt-timeline-lanes-inner');
          const rect = (lanesInner || lanesAreaEl).getBoundingClientRect();
          const anchorRatio = rect.width > 0 ? Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) : 0.5;
          const delta = e.deltaY < 0 ? 0.1 : -0.1;
          setTimelineZoom((studioState.timelineZoom || 1) + delta, anchorRatio);
        } else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX || 0)) {
          // Lăn chuột thường trong vùng timeline: cuộn ngang mượt mà
          lanesAreaEl.scrollLeft += e.deltaY * 0.8;
        }
      }, { passive: false });
    }

    // 6f. Kéo thả video/ảnh từ Khay chứa vào Dòng thời gian Timeline hoặc Màn hình Edit Canvas
    const tlDropTarget = modal.querySelector('#igt-timeline-body') || lanesAreaEl;
    if (tlDropTarget) {
      tlDropTarget.addEventListener('dragover', (e) => {
        if (e.dataTransfer && (e.dataTransfer.types.includes('application/x-instatweaks-media') || e.dataTransfer.types.includes('text/plain'))) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          tlDropTarget.classList.add('igt-timeline-drop-target');
        }
      });
      tlDropTarget.addEventListener('dragleave', (e) => {
        if (!tlDropTarget.contains(e.relatedTarget)) {
          tlDropTarget.classList.remove('igt-timeline-drop-target');
        }
      });
      tlDropTarget.addEventListener('drop', (e) => {
        tlDropTarget.classList.remove('igt-timeline-drop-target');
        const rawIdx = e.dataTransfer.getData('application/x-instatweaks-media') || e.dataTransfer.getData('text/plain');
        const mIdx = parseInt(rawIdx, 10);
        if (!isNaN(mIdx) && studioState.mediaList && studioState.mediaList[mIdx]) {
          e.preventDefault();
          e.stopPropagation();
          const targetMedia = studioState.mediaList[mIdx];

          // Tính toán vị trí chèn dựa trên tọa độ X của chuột
          const mediaRow = document.getElementById('igt-media-track-row');
          let insertAfterIdx = (studioState.videoClips ? studioState.videoClips.length - 1 : 0);
          if (mediaRow) {
            const clipBoxes = Array.from(mediaRow.querySelectorAll('.igt-media-clip-box'));
            for (let i = 0; i < clipBoxes.length; i++) {
              const cRect = clipBoxes[i].getBoundingClientRect();
              if (e.clientX >= cRect.left && e.clientX <= cRect.right) {
                const mid = cRect.left + cRect.width / 2;
                insertAfterIdx = e.clientX < mid ? Math.max(-1, i - 1) : i;
                break;
              }
            }
          }
          appendClipToSequence(targetMedia, mIdx, insertAfterIdx);
        }
      });
    }

    const canvasDropTarget = modal.querySelector('#igt-studio-screen');
    if (canvasDropTarget) {
      canvasDropTarget.addEventListener('dragover', (e) => {
        if (e.dataTransfer && (e.dataTransfer.types.includes('application/x-instatweaks-media') || e.dataTransfer.types.includes('text/plain'))) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          canvasDropTarget.classList.add('igt-canvas-drop-active');
        }
      });
      canvasDropTarget.addEventListener('dragleave', (e) => {
        if (!canvasDropTarget.contains(e.relatedTarget)) {
          canvasDropTarget.classList.remove('igt-canvas-drop-active');
        }
      });
      canvasDropTarget.addEventListener('drop', (e) => {
        canvasDropTarget.classList.remove('igt-canvas-drop-active');
        const rawIdx = e.dataTransfer.getData('application/x-instatweaks-media') || e.dataTransfer.getData('text/plain');
        const mIdx = parseInt(rawIdx, 10);
        if (!isNaN(mIdx) && studioState.mediaList && studioState.mediaList[mIdx]) {
          e.preventDefault();
          e.stopPropagation();
          const targetMedia = studioState.mediaList[mIdx];
          if (!studioState.videoClips || studioState.videoClips.length <= 1) {
            activateMediaItem(mIdx);
          } else {
            appendClipToSequence(targetMedia, mIdx);
          }
        }
      });
    }

    // 7. Xử lý Dropzone & File Input
    const dropzone = modal.querySelector('#igt-studio-dropzone');
    const fileInput = modal.querySelector('#igt-studio-file-input');

    if (dropzone && fileInput) {
      dropzone.onclick = () => fileInput.click();

      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      };
      dropzone.ondragleave = () => dropzone.classList.remove('dragover');
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          addMediaFiles(e.dataTransfer.files);
        }
      };

      fileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          addMediaFiles(e.target.files);
          fileInput.value = '';
        }
      };
    }

    // 8. Tương tác Pan & Zoom trên Canvas (Gắn trực tiếp lên Phone Frame)
    const phoneFrame = modal.querySelector('#igt-studio-phone-frame');
    if (phoneFrame) {
      // Drag & Pan Video/Ảnh
      phoneFrame.onmousedown = (e) => {
        if (!studioState.mediaUrl) return;
        // Bỏ qua nếu bấm vào nút công cụ của nhãn dán
        if (e.target.closest('.igt-sticker-del-btn') || e.target.closest('.igt-sticker-resize-handle') || e.target.closest('.igt-sticker-scale-toolbar')) {
          return;
        }
        // Khi bấm ra khoảng trống ngoài sticker -> bỏ chọn và ẩn ngay khung điều khiển
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
          studioState.isDragging = true;
          studioState.dragStartX = e.clientX;
          studioState.dragStartY = e.clientY;
          studioState.initialPanX = studioState.panX;
          studioState.initialPanY = studioState.panY;

          let panRafId = null;
          const onPanMove = (me) => {
            if (!studioState.isDragging) return;
            const deltaX = me.clientX - studioState.dragStartX;
            const deltaY = me.clientY - studioState.dragStartY;
            studioState.panX = studioState.initialPanX + deltaX;
            studioState.panY = studioState.initialPanY + deltaY;

            if (!panRafId) {
              panRafId = requestAnimationFrame(() => {
                panRafId = null;
                updateMediaTransform();
              });
            }
          };

          const onPanUp = () => {
            if (panRafId) {
              cancelAnimationFrame(panRafId);
              panRafId = null;
            }
            if (studioState.isDragging) {
              studioState.isDragging = false;
              updateMediaTransform();
              takeSnapshot('Pan canvas');
            }
            window.removeEventListener('mousemove', onPanMove);
            window.removeEventListener('mouseup', onPanUp);
          };

          window.addEventListener('mousemove', onPanMove, { passive: true });
          window.addEventListener('mouseup', onPanUp, { passive: true });
        }
      };

      // Lăn chuột Zoom Video/Ảnh mượt mà
      let wheelSnapshotTimer = null;
      let wheelRafId = null;
      const handleZoomWheel = (e) => {
        if (!studioState.mediaUrl) return;
        // Khi ở Tab Tỉ lệ (main), hoặc con trỏ chuột không nằm trên sticker
        if (studioState.activeTab === 'main' || !e.target.closest('.igt-studio-sticker-item')) {
          e.preventDefault();
          e.stopPropagation();
          const delta = e.deltaY < 0 ? 0.08 : -0.08;
          studioState.zoom = Math.min(Math.max(studioState.zoom + delta, 0.5), 4.0);
          studioState.zoom = Math.round(studioState.zoom * 100) / 100;

          if (!wheelRafId) {
            wheelRafId = requestAnimationFrame(() => {
              wheelRafId = null;
              const slider1 = modal.querySelector('#igt-studio-zoom-slider');
              const slider2 = modal.querySelector('#igt-tab-zoom-slider');
              const valLabel = modal.querySelector('#igt-tab-zoom-val');
              if (slider1) slider1.value = studioState.zoom;
              if (slider2) slider2.value = studioState.zoom;
              if (valLabel) valLabel.innerText = Math.round(studioState.zoom * 100) + '%';
              updateMediaTransform();
            });
          }

          clearTimeout(wheelSnapshotTimer);
          wheelSnapshotTimer = setTimeout(() => {
            takeSnapshot('Wheel zoom');
          }, 350);
        }
      };

      phoneFrame.addEventListener('wheel', handleZoomWheel, { passive: false });
      const mediaContainer = modal.querySelector('#igt-studio-media-container');
      if (mediaContainer) {
        mediaContainer.addEventListener('wheel', handleZoomWheel, { passive: false });
      }

      // Kéo thả file GIF trực tiếp vào khung Canvas để biến thành Sticker động
      phoneFrame.ondragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      phoneFrame.ondrop = (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
          const file = e.dataTransfer.files[0];
          if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif') || file.type.includes('webp')) {
            e.preventDefault();
            e.stopPropagation();
            const reader = new FileReader();
            reader.addEventListener('load', (ev) => {
              addSticker({
                type: 'image_sticker',
                url: ev.target.result,
                name: file.name.replace(/\.[^/.]+$/, ''),
                isAnimated: true,
                x: 50,
                y: 50
              });
            }, { once: true });
            reader.readAsDataURL(file);
          }
        }
      };
    }

    // 9. Nút Tải về Ultra HD
    const btnDownloadHd = modal.querySelector('#igt-studio-btn-download-hd');
    if (btnDownloadHd) {
      btnDownloadHd.onclick = exportAndDownloadUltraHD;
    }

    // 10. Nút Publish (Mở Modal Xuất bản trực tiếp Phase 4)
    const btnPublish = modal.querySelector('#igt-studio-btn-publish');
    if (btnPublish) {
      btnPublish.onclick = () => {
        openPublishModal();
      };
    }

    // 11. Tabs Nav
    renderTabsNav(modal);
  }

  function renderTabsNav(modalEl) {
    const modal = modalEl || document.getElementById('igt-studio-modal');
    if (!modal) return;
    const nav = modal.querySelector('.igt-studio-tabs-nav');
    if (!nav) return;

    const isPost = studioState.mode === 'post';
    if (isPost && studioState.activeTab === 'link') {
      studioState.activeTab = 'general';
    } else if (!isPost && studioState.activeTab === 'general') {
      studioState.activeTab = 'main';
    }

    nav.innerHTML = `
      ${isPost ? `
        <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'general' ? 'active' : ''}" data-tab="general" title="Cài đặt chung album bài viết">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          <span>Chung</span>
        </button>
      ` : ''}
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'main' ? 'active' : ''}" data-tab="main" title="Tỉ lệ khung hình">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
        <span>Tỉ lệ</span>
      </button>
      ${!isPost ? `
        <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'link' ? 'active' : ''}" data-tab="link" title="Gắn link liên kết">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <span>Link</span>
        </button>
      ` : ''}
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'text' ? 'active' : ''}" data-tab="text" title="Chèn chữ văn bản">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
        <span>Chữ</span>
      </button>
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'stickers' ? 'active' : ''}" data-tab="stickers" title="Nhãn dán biểu tượng & Sticker">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
        <span>Sticker</span>
      </button>
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'mentions' ? 'active' : ''}" data-tab="mentions" title="Nhắc tên bạn bè">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        <span>Nhắc tên</span>
      </button>
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'location' ? 'active' : ''}" data-tab="location" title="Gắn nhãn vị trí">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
        <span>Vị trí</span>
      </button>
      <button type="button" class="igt-studio-tab-btn ${studioState.activeTab === 'music' ? 'active' : ''}" data-tab="music" title="Kho nhạc bản quyền">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
        <span>Nhạc</span>
      </button>
    `;

    nav.querySelectorAll('.igt-studio-tab-btn').forEach(btn => {
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
    });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function addSticker(stickerData) {
    if (stickerData) {
      if (stickerData.type === 'qa') stickerData.type = 'question';
      if (stickerData.type === 'slider') stickerData.type = 'emoji_slider';
    }
    const id = 'stk_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newSticker = {
      id,
      x: 50,
      y: 50,
      scale: 1, // Tỉ lệ ban đầu 100%
      ...stickerData
    };
    studioState.stickers.push(newSticker);
    renderStickers();
    takeSnapshot('Add sticker');
    return newSticker;
  }

  function removeSticker(id) {
    studioState.stickers = studioState.stickers.filter(s => s.id !== id);
    renderStickers();
    takeSnapshot('Remove sticker');
  }

  function getStickerTab(type) {
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
  }

  function switchToEditSticker(stickerId, tabName) {
    studioState.activeEditingStickerId = stickerId;
    studioState.selectedStickerId = stickerId;
    const targetTab = tabName || getStickerTab(studioState.stickers.find(s => s.id === stickerId)?.type);
    studioState.activeTab = targetTab;
    const modal = document.getElementById('igt-studio-modal');
    if (modal) {
      modal.querySelectorAll('.igt-studio-tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === targetTab);
      });
    }
    renderStickers();
    renderTabContent(targetTab);

    // Tự động cuộn thanh công cụ lên đỉnh & focus ô nhập liệu đầu tiên
    const tabContent = document.getElementById('igt-studio-tab-content');
    if (tabContent) {
      tabContent.scrollTop = 0;
      setTimeout(() => {
        const firstInput = tabContent.querySelector('input:not([type="hidden"]):not([type="file"]), textarea');
        if (firstInput) {
          firstInput.focus();
          if (firstInput.select) firstInput.select();
        }
      }, 50);
    }
  }

  function renderStickers() {
    const layer = document.getElementById('igt-studio-stickers-layer');
    if (!layer) return;
    layer.innerHTML = '';

    function bindInlineEdit(targetEl, setter, isBlock = false) {
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
    }

    // Hiển thị Watermark bản quyền chung (nếu được thiết lập)
    if (studioState.globalWatermarkText && studioState.globalWatermarkText.trim()) {
      const wmEl = document.createElement('div');
      wmEl.className = 'igt-watermark-stamp';
      wmEl.innerText = studioState.globalWatermarkText.trim();
      const pos = studioState.globalWatermarkPos || 'bottom-right';
      const op = (studioState.globalWatermarkOpacity || 75) / 100;

      let fontName = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      if (studioState.globalWatermarkFont === 'serif') {
        fontName = 'Georgia, "Times New Roman", Garamond, serif';
      } else if (studioState.globalWatermarkFont === 'signature') {
        fontName = '"Brush Script MT", "Dancing Script", "Pacifico", "Caveat", cursive';
      } else if (studioState.globalWatermarkFont === 'typewriter') {
        fontName = '"Courier New", Courier, monospace';
      } else if (studioState.globalWatermarkFont === 'impact') {
        fontName = 'Impact, "Arial Black", sans-serif';
      }

      let style = `position: absolute; color: ${studioState.globalWatermarkColor || "#ffffff"}; font-size: 11.5px; font-weight: 700; font-family: ${fontName}; text-shadow: 0 1px 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9); opacity: ${op}; pointer-events: none; z-index: 10; padding: 6px 10px; letter-spacing: 0.3px;`;
      if (pos === 'bottom-left') style += ' left: 14px; bottom: 14px;';
      else if (pos === 'top-left') style += ' left: 14px; top: 14px;';
      else if (pos === 'top-right') style += ' right: 14px; top: 14px;';
      else if (pos === 'center') style += ' left: 50%; top: 50%; transform: translate(-50%, -50%);';
      else style += ' right: 14px; bottom: 14px;';
      wmEl.style.cssText = style;
      layer.appendChild(wmEl);
    }

    studioState.stickers.forEach(s => {
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
      el.style.transform = `translate(-50%, -50%) scale(${s.scale || 1})`;
      if (!isMatchingTab) {
        el.style.pointerEvents = 'none';
      }

      // 1. Nút xóa (Góc trên phải)
      const delBtn = document.createElement('div');
      delBtn.className = 'igt-sticker-del-btn';
      delBtn.innerHTML = '✕';
      delBtn.title = 'Xóa nhãn dán';
      el.appendChild(delBtn);

      // 2. Góc kéo phóng to/thu nhỏ (Góc dưới phải)
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'igt-sticker-resize-handle';
      resizeHandle.innerHTML = '↘';
      resizeHandle.title = 'Kéo để phóng to / thu nhỏ';
      el.appendChild(resizeHandle);

      // 3. Thanh công cụ Zoom & Hiệu ứng chuyển động mini nổi trên đỉnh
      const scaleToolbar = document.createElement('div');
      scaleToolbar.className = 'igt-sticker-scale-toolbar';
      scaleToolbar.innerHTML = `
        <button type="button" class="igt-sticker-scale-btn scale-down" title="Thu nhỏ (−)">−</button>
        <span class="igt-sticker-scale-text" title="Bấm để đặt lại 100%">${Math.round((s.scale || 1) * 100)}%</span>
        <button type="button" class="igt-sticker-scale-btn scale-up" title="Phóng to (+)">+</button>
        <button type="button" class="igt-sticker-scale-btn igt-stk-anim-toggle" title="Hiệu ứng chuyển động (Nhún nhảy, Tim đập, Lắc lư, Bồng bềnh, Chớp sáng, Xoay)">${s.anim ? '✨' : '🎬'}</button>
      `;
      el.appendChild(scaleToolbar);

      // 4. Nội dung theo loại sticker
      if (s.type === 'link') {
        const pill = document.createElement('div');
        pill.className = `igt-sticker-link-pill ${s.style || 'default'}`;
        pill.title = 'Click để chỉnh sửa Liên kết (Link)';
        pill.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          <span>${escapeHtml(s.text || 'XEM LIÊN KẾT')}</span>
        `;
        pill.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'link');
        };
        el.appendChild(pill);
      } else if (s.type === 'text') {
        const txt = document.createElement('div');
        const effect = s.effect || 'none';
        txt.className = `igt-sticker-text-item ${s.isBox ? 'box' : ''} font-${s.fontFamily || 'system'} effect-${effect}`;
        txt.style.color = s.color || '#ffffff';
        txt.style.fontSize = (s.fontSize || 20) + 'px';
        const glowCol = (s.color && s.color !== '#000000') ? s.color : '#38bdf8';
        txt.style.setProperty('--igt-text-glow-color', glowCol);
        if (s.isBox) {
          txt.style.background = (s.color === '#ffffff') ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';
          txt.style.padding = '6px 12px';
          txt.style.borderRadius = '8px';
          if (effect === 'glow' || effect === 'neon') {
            txt.style.boxShadow = `0 0 16px ${glowCol}66`;
          }
        }
        txt.textContent = s.text || '';
        txt.title = 'Kéo để di chuyển • Bấm đúp để sửa chữ trực tiếp';
        bindInlineEdit(txt, (v) => { s.text = v; }, true);

        txt.onclick = (e) => {
          e.stopPropagation();
        };

        el.appendChild(txt);
      } else if (s.type === 'emoji') {
        const emojiEl = document.createElement('div');
        emojiEl.className = 'igt-sticker-emoji-item';
        emojiEl.innerText = s.emoji || '🔥';
        el.appendChild(emojiEl);
      } else if (s.type === 'badge') {
        const badgeEl = document.createElement('div');
        badgeEl.className = `igt-sticker-badge-pill ${s.badgeStyle || 'gradient'}`;
        badgeEl.innerText = s.text || 'NEW POST';
        badgeEl.title = 'Bấm trực tiếp để sửa chữ huy hiệu hoặc mở bảng chọn kiểu';
        badgeEl.style.cursor = 'pointer';
        bindInlineEdit(badgeEl, (v) => { s.text = v; });
        badgeEl.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(badgeEl);
      } else if (s.type === 'mention') {
        const currentStyle = s.mentionStyle || 'white';
        const pill = document.createElement('div');
        pill.className = `igt-sticker-mention-pill style-${currentStyle}`;
        pill.title = 'Click để chỉnh sửa Nhắc tên bạn bè (@Mention)';
        const initial = (s.username || 'U').charAt(0).toUpperCase();
        pill.innerHTML = `
          ${s.avatarUrl ? `<img class="igt-mention-avatar-thumb" src="${escapeHtml(s.avatarUrl)}" alt="" referrerpolicy="no-referrer" crossorigin="anonymous" /><div class="igt-mention-avatar-thumb igt-avatar-fallback" style="display:none; align-items:center; justify-content:center; background:linear-gradient(135deg,#0095f6,#a855f7); color:#fff; font-size:9px; font-weight:700;">${initial}</div>` : `<div class="igt-mention-avatar-thumb igt-avatar-fallback" style="display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#0095f6,#a855f7); color:#fff; font-size:9px; font-weight:700;">${initial}</div>`}
          <span class="igt-mention-at" style="font-weight: 800;">@</span>
          <span>${escapeHtml(s.username || 'user')}</span>
          ${s.isVerified ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="#0095f6" style="margin-left: 2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>` : ''}
        `;
        const mThumb = pill.querySelector('img.igt-mention-avatar-thumb');
        if (mThumb) {
          mThumb.addEventListener('error', () => {
            mThumb.style.display = 'none';
            const fb = pill.querySelector('.igt-avatar-fallback');
            if (fb) fb.style.display = 'flex';
          });
        }
        pill.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'mentions');
        };
        el.appendChild(pill);
      } else if (s.type === 'image_sticker') {
        const img = document.createElement('img');
        img.className = 'igt-sticker-image-item';
        img.src = s.url;
        img.alt = s.name || 'sticker';
        el.appendChild(img);
      } else if (s.type === 'location') {
        const curStyle = s.locationStyle || 'white';
        const pill = document.createElement('div');
        pill.className = `igt-sticker-location-pill style-${curStyle}`;
        pill.title = 'Click để chỉnh sửa Vị trí địa lý (Location)';
        let pinFill = '#e1306c';
        if (curStyle === 'frosted' || curStyle === 'dark_glass') pinFill = '#f43f5e';
        else if (curStyle === 'transparent') pinFill = '#ffffff';
        else if (curStyle === 'gradient') pinFill = '#fef08a';
        else if (curStyle === 'light_gray') pinFill = '#e11d48';

        pill.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="${pinFill}"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          <span>${escapeHtml(s.name || 'Vị trí')}</span>
        `;
        pill.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'location');
        };
        el.appendChild(pill);
      } else if (s.type === 'poll') {
        const poll = document.createElement('div');
        poll.className = 'igt-sticker-poll-card';
        poll.title = 'Bấm để sửa câu hỏi & lựa chọn (gõ trực tiếp hoặc sửa bên phải)';
        poll.style.cursor = 'pointer';
        poll.innerHTML = `
          <div class="igt-poll-question">${escapeHtml(s.question || 'Bình chọn?')}</div>
          <div class="igt-poll-options">
            <div class="igt-poll-opt opt-a">${escapeHtml(s.optA || 'CÓ 👍')}</div>
            <div class="igt-poll-opt opt-b">${escapeHtml(s.optB || 'KHÔNG 👎')}</div>
          </div>
        `;
        const qEl = poll.querySelector('.igt-poll-question');
        const optAEl = poll.querySelector('.opt-a');
        const optBEl = poll.querySelector('.opt-b');
        bindInlineEdit(qEl, (v) => { s.question = v; });
        bindInlineEdit(optAEl, (v) => { s.optA = v; });
        bindInlineEdit(optBEl, (v) => { s.optB = v; });
        poll.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(poll);
      } else if (s.type === 'question') {
        const qBox = document.createElement('div');
        qBox.className = 'igt-sticker-question-card';
        qBox.title = 'Bấm để sửa câu hỏi Q&A (gõ trực tiếp hoặc sửa bên phải)';
        qBox.style.cursor = 'pointer';
        qBox.innerHTML = `
          <div class="igt-qbox-header">${escapeHtml(s.header || 'Hỏi tôi một điều gì đó...')}</div>
          <div class="igt-qbox-body"><span>Nhập câu trả lời...</span></div>
        `;
        const headEl = qBox.querySelector('.igt-qbox-header');
        bindInlineEdit(headEl, (v) => { s.header = v; });
        qBox.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(qBox);
      } else if (s.type === 'countdown') {
        const cd = document.createElement('div');
        cd.className = 'igt-sticker-countdown-card';
        cd.title = 'Bấm để sửa tên sự kiện & đếm ngược (gõ trực tiếp hoặc sửa bên phải)';
        cd.style.cursor = 'pointer';
        cd.innerHTML = `
          <div class="igt-countdown-title">${escapeHtml(s.title || 'Sự kiện sắp diễn ra 🎉')}</div>
          <div class="igt-countdown-timer">
            <div class="igt-cd-unit"><b>${escapeHtml(s.days || '05')}</b><span>NGÀY</span></div>
            <div class="igt-cd-sep">:</div>
            <div class="igt-cd-unit"><b>${escapeHtml(s.hours || '12')}</b><span>GIỜ</span></div>
            <div class="igt-cd-sep">:</div>
            <div class="igt-cd-unit"><b>${escapeHtml(s.mins || '30')}</b><span>PHÚT</span></div>
          </div>
        `;
        const titleEl = cd.querySelector('.igt-countdown-title');
        bindInlineEdit(titleEl, (v) => { s.title = v; });
        const cdDays = cd.querySelector('.igt-cd-unit:nth-child(1) b');
        const cdHours = cd.querySelector('.igt-cd-unit:nth-child(3) b');
        const cdMins = cd.querySelector('.igt-cd-unit:nth-child(5) b');
        bindInlineEdit(cdDays, (v) => { s.days = v; });
        bindInlineEdit(cdHours, (v) => { s.hours = v; });
        bindInlineEdit(cdMins, (v) => { s.mins = v; });
        cd.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(cd);
      } else if (s.type === 'music_player') {
        const music = document.createElement('div');
        music.className = 'igt-sticker-music-card';
        music.title = 'Bấm để sửa bài hát & nghệ sĩ (gõ trực tiếp hoặc sửa bên phải)';
        music.style.cursor = 'pointer';
        music.innerHTML = `
          <div class="igt-music-stk-icon">🎵</div>
          <div class="igt-music-stk-info">
            <div class="igt-music-stk-song">${escapeHtml(s.song || 'Trending Sound 🔥')}</div>
            <div class="igt-music-stk-artist">${escapeHtml(s.artist || 'Instagram Original Audio')}</div>
          </div>
          <div class="igt-music-stk-disc">💿</div>
        `;
        const songEl = music.querySelector('.igt-music-stk-song');
        const artEl = music.querySelector('.igt-music-stk-artist');
        bindInlineEdit(songEl, (v) => { s.song = v; });
        bindInlineEdit(artEl, (v) => { s.artist = v; });
        music.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(music);
      } else if (s.type === 'emoji_slider') {
        const slider = document.createElement('div');
        slider.className = 'igt-sticker-slider-card';
        slider.title = 'Bấm để sửa câu hỏi & emoji (gõ trực tiếp hoặc sửa bên phải)';
        slider.style.cursor = 'pointer';
        slider.innerHTML = `
          <div class="igt-slider-stk-question">${escapeHtml(s.question || 'Mức độ thích?')}</div>
          <div class="igt-slider-stk-track">
            <div class="igt-slider-stk-thumb" title="Bấm để đổi emoji">${s.emoji || '😍'}</div>
          </div>
        `;
        const qEl = slider.querySelector('.igt-slider-stk-question');
        bindInlineEdit(qEl, (v) => { s.question = v; });
        const thumb = slider.querySelector('.igt-slider-stk-thumb');
        if (thumb) {
          const emList = ['😍', '🔥', '❤️', '😭', '🚀', '👏', '✨', '💯', '😂', '🎉'];
          thumb.onclick = (e) => {
            e.stopPropagation();
            const curIdx = emList.indexOf(s.emoji || '😍');
            s.emoji = emList[(curIdx + 1) % emList.length];
            thumb.innerText = s.emoji;
            takeSnapshot('Đổi emoji thanh trượt');
            renderTabContent('stickers');
          };
        }
        slider.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(slider);
      } else if (s.type === 'add_yours') {
        const ay = document.createElement('div');
        ay.className = 'igt-sticker-addyours-card';
        ay.title = 'Bấm để sửa chủ đề (gõ trực tiếp hoặc sửa bên phải)';
        ay.style.cursor = 'pointer';
        ay.innerHTML = `
          <div class="igt-ay-top">📷 <b>LƯỢT TIẾP THEO</b></div>
          <div class="igt-ay-prompt">${escapeHtml(s.prompt || 'Chia sẻ ảnh đẹp của bạn')}</div>
        `;
        const promptEl = ay.querySelector('.igt-ay-prompt');
        bindInlineEdit(promptEl, (v) => { s.prompt = v; });
        ay.onclick = (e) => {
          e.stopPropagation();
          switchToEditSticker(s.id, 'stickers');
        };
        el.appendChild(ay);
      }

      const scaleBadge = scaleToolbar.querySelector('.igt-sticker-scale-text');

      // CƠ CHẾ 1: LĂN CHUỘT (WHEEL) TRỰC TIẾP TRÊN STICKER ĐỂ PHÓNG TO / THU NHỎ
      el.onwheel = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        s.scale = Math.max(0.4, Math.min(3.0, (s.scale || 1) + delta));
        s.scale = Math.round(s.scale * 100) / 100;
        el.style.setProperty('--stk-scale', s.scale);
        el.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
        if (scaleBadge) scaleBadge.innerText = Math.round(s.scale * 100) + '%';
      };

      // CƠ CHẾ 2: BẤM NÚT TRÊN THANH MINI TOOLBAR (− / % / +)
      const btnDown = scaleToolbar.querySelector('.scale-down');
      const btnUp = scaleToolbar.querySelector('.scale-up');

      if (btnDown) {
        btnDown.onmousedown = (e) => e.stopPropagation();
        btnDown.onclick = (e) => {
          e.stopPropagation();
          s.scale = Math.max(0.4, Math.round(((s.scale || 1) - 0.15) * 100) / 100);
          el.style.setProperty('--stk-scale', s.scale);
          el.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
          if (scaleBadge) scaleBadge.innerText = Math.round(s.scale * 100) + '%';
          takeSnapshot('Scale sticker down');
        };
      }

      if (btnUp) {
        btnUp.onmousedown = (e) => e.stopPropagation();
        btnUp.onclick = (e) => {
          e.stopPropagation();
          s.scale = Math.min(3.0, Math.round(((s.scale || 1) + 0.15) * 100) / 100);
          el.style.setProperty('--stk-scale', s.scale);
          el.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
          if (scaleBadge) scaleBadge.innerText = Math.round(s.scale * 100) + '%';
          takeSnapshot('Scale sticker up');
        };
      }

      if (scaleBadge) {
        scaleBadge.onmousedown = (e) => e.stopPropagation();
        scaleBadge.onclick = (e) => {
          e.stopPropagation();
          s.scale = 1;
          el.style.setProperty('--stk-scale', 1);
          el.style.transform = `translate(-50%, -50%) scale(1)`;
          scaleBadge.innerText = '100%';
          takeSnapshot('Reset sticker scale');
        };
      }

      const btnAnimToggle = scaleToolbar.querySelector('.igt-stk-anim-toggle');
      if (btnAnimToggle) {
        btnAnimToggle.onmousedown = (e) => e.stopPropagation();
        btnAnimToggle.onclick = (e) => {
          e.stopPropagation();
          const animList = [null, 'pulse', 'bounce', 'wiggle', 'float', 'glow', 'spin'];
          const curIdx = animList.indexOf(s.anim || null);
          const nextIdx = (curIdx + 1) % animList.length;
          s.anim = animList[nextIdx];
          renderStickers();
          takeSnapshot('Đổi hiệu ứng chuyển động');
        };
      }

      // CƠ CHẾ 3: KÉO GÓC RESIZE HANDLE
      resizeHandle.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        let isResizing = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const startScale = s.scale || 1;

        const onResizeMove = (ev) => {
          if (!isResizing) return;
          const deltaX = ev.clientX - startX;
          const deltaY = ev.clientY - startY;
          const avgDelta = (deltaX + deltaY) / 2;
          const newScale = Math.max(0.4, Math.min(3.0, startScale + (avgDelta / 75)));
          s.scale = Math.round(newScale * 100) / 100;
          el.style.transform = `translate(-50%, -50%) scale(${s.scale})`;
          if (scaleBadge) scaleBadge.innerText = Math.round(s.scale * 100) + '%';
        };

        const onResizeUp = () => {
          isResizing = false;
          window.removeEventListener('mousemove', onResizeMove);
          window.removeEventListener('mouseup', onResizeUp);
          takeSnapshot('Resize sticker');
        };

        window.addEventListener('mousemove', onResizeMove);
        window.addEventListener('mouseup', onResizeUp);
      };

      // KÉO THẢ DI CHUYỂN VỊ TRÍ STICKER
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
        el.classList.add('selected', 'is-dragging');

        const onMouseMove = (ev) => {
          if (!isDraggingSticker) return;
          const dist = Math.hypot(ev.clientX - startMouseX, ev.clientY - startMouseY);
          if (dist >= 6) {
            hasDraggedSticker = true;
          }
          const frame = document.getElementById('igt-studio-phone-frame');
          if (!frame) return;
          const rect = frame.getBoundingClientRect();
          const frameW = rect.width;
          const frameH = rect.height;
          if (frameW <= 0 || frameH <= 0) return;

          // Kích thước hiển thị thực tế của sticker (đã kèm scale)
          const currentScale = s.scale || 1;
          const sW = (el.offsetWidth || 60) * currentScale;
          const sH = (el.offsetHeight || 30) * currentScale;

          // delta di chuyển tính theo %
          const dx = ((ev.clientX - startMouseX) / frameW) * 100;
          const dy = ((ev.clientY - startMouseY) / frameH) * 100;

          // Giữ tối thiểu 20% sticker bên trong khung màn hình:
          // Trục X: centerX min = -0.3 * sW ; centerX max = frameW + 0.3 * sW
          const minX_pct = (-0.3 * sW / frameW) * 100;
          const maxX_pct = (1 + (0.3 * sW / frameW)) * 100;

          // Trục Y: centerY min = -0.3 * sH ; centerY max = frameH + 0.3 * sH
          const minY_pct = (-0.3 * sH / frameH) * 100;
          const maxY_pct = (1 + (0.3 * sH / frameH)) * 100;

          s.x = Math.max(minX_pct, Math.min(maxX_pct, startX + dx));
          s.y = Math.max(minY_pct, Math.min(maxY_pct, startY + dy));
          el.style.left = s.x + '%';
          el.style.top = s.y + '%';
        };

        const onMouseUp = (ev) => {
          isDraggingSticker = false;
          el.classList.remove('selected');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);

          const dist = Math.hypot(ev.clientX - startMouseX, ev.clientY - startMouseY);
          if (dist < 6) {
            // Đây là click trực tiếp vào nhãn dán
            const targetTab = getStickerTab(s.type);
            if (targetTab) {
              switchToEditSticker(s.id, targetTab);
            }
          } else {
            takeSnapshot('Move sticker');
          }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };

      // Sự kiện Click trực tiếp trên container của sticker
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
      };

      layer.appendChild(el);
    });
  }

  let currentPlayingClipIndex = 0;

  function getVideoClipsTotalDuration() {
    if (studioState.mediaType !== 'video') return 0;
    if (!studioState.videoClips || studioState.videoClips.length === 0) {
      return studioState.videoDuration || 0;
    }
    return studioState.videoClips.reduce((sum, c) => sum + (c.end - c.start) / (c.speed || 1), 0);
  }

  function getBaseTimelineDuration() {
    // 1. Chế độ ghép chuỗi video liên tục (Sequence Mode):
    // Tổng thời lượng dòng thời gian là tổng thời gian của toàn bộ các đoạn trong chuỗi
    if (studioState.isSequenceMode && studioState.videoClips && studioState.videoClips.length > 1) {
      const seqDur = getVideoClipsTotalDuration();
      return Math.max(1, seqDur);
    }

    // 2. Chế độ chuẩn cho video: Luôn hiển thị theo chuẩn thời gian gốc ban đầu của video
    // (kể cả khi đã kéo ngắn / cắt xén clip để người dùng dễ dàng căn chỉnh chính xác, không bị co giãn tràn timeline)
    if (studioState.mediaType === 'video' && studioState.videoDuration > 0) {
      return studioState.videoDuration;
    }

    const clipsDur = getVideoClipsTotalDuration();
    if (clipsDur > 0) {
      return Math.max(0.5, clipsDur);
    }

    // 3. Nếu là ảnh đơn trên Story:
    if (studioState.mediaType === 'image') {
      const curItem = studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex];
      const isLiveActive = curItem && (curItem.isLivePhoto || /^mvimg_|_live|_motion/i.test(curItem.name || '')) && (curItem.liveMode !== 'still') && curItem.liveVideoUrl;
      // Khi ở chế độ Story hoặc Reel, thời lượng luôn tuân thủ theo cài đặt Thời lượng Story (5s, 10s, 15s, 30s)
      if (studioState.mode === 'story' || studioState.mode === 'reel') {
        return studioState.imageDuration || 15;
      }
      if (isLiveActive) {
        return curItem.videoDuration || 3;
      }
      return studioState.imageDuration || 15;
    }

    // 4. Nếu chưa có ảnh/video mà chỉ có nhạc nền MP3:
    if (studioState.audioDuration > 0) {
      return studioState.audioDuration;
    }

    return 15;
  }

  function getTotalTimelineDuration() {
    const baseDur = getBaseTimelineDuration();
    const zoom = studioState.timelineZoom || 1.0;
    // Khi thu nhỏ (zoom < 1.0, ví dụ 50% = 0.5):
    // Kéo dài thanh timeline ra 100% chiều rộng màn hình và tăng tỉ lệ timeline lên
    // Công thức: thời gian bù = baseDur * (1 / zoom - 1)
    // Tổng thời gian dòng thời gian = baseDur + thời gian bù = baseDur / zoom
    if (zoom < 1.0) {
      const compensated = baseDur * ((1 / zoom) - 1);
      return Math.max(baseDur, baseDur + compensated);
    }
    return baseDur;
  }

  function getClipAtTimelineTime(t) {
    if (!studioState.videoClips || studioState.videoClips.length === 0) return null;
    if (!studioState.isSequenceMode && studioState.videoClips.length <= 1) {
      const c = studioState.videoClips[0];
      return {
        clip: c,
        index: 0,
        timelineStart: c.start || 0,
        timelineEnd: c.end || studioState.videoDuration || 15,
        videoTime: Math.min(c.end, Math.max(c.start, t))
      };
    }
    let accumulated = 0;
    for (let i = 0; i < studioState.videoClips.length; i++) {
      const c = studioState.videoClips[i];
      const dur = (c.end - c.start) / (c.speed || 1);
      if (t >= accumulated && t < accumulated + dur) {
        const offsetInClip = (t - accumulated) * (c.speed || 1);
        return {
          clip: c,
          index: i,
          timelineStart: accumulated,
          timelineEnd: accumulated + dur,
          videoTime: Math.min(c.end, Math.max(c.start, c.start + offsetInClip))
        };
      }
      accumulated += dur;
    }
    const lastIdx = studioState.videoClips.length - 1;
    const lastClip = studioState.videoClips[lastIdx];
    const lastDur = (lastClip.end - lastClip.start) / (lastClip.speed || 1);
    return {
      clip: lastClip,
      index: lastIdx,
      timelineStart: Math.max(0, accumulated - lastDur),
      timelineEnd: accumulated,
      videoTime: lastClip.end
    };
  }

  function getTimelineTimeFromVideoTime(clipIdx, videoCurT) {
    if (!studioState.videoClips || studioState.videoClips.length === 0) {
      return videoCurT || 0;
    }
    if (!studioState.isSequenceMode && studioState.videoClips.length <= 1) {
      return videoCurT || 0;
    }
    let accumulated = 0;
    for (let i = 0; i < clipIdx && i < studioState.videoClips.length; i++) {
      const c = studioState.videoClips[i];
      accumulated += (c.end - c.start) / (c.speed || 1);
    }
    const curClip = studioState.videoClips[clipIdx];
    if (curClip) {
      const offset = Math.max(0, videoCurT - curClip.start) / (curClip.speed || 1);
      return accumulated + offset;
    }
    return accumulated;
  }

  function ensureVideoClipLoaded(clip, targetVideoTime, autoPlay = true) {
    if (!clip) return;
    const targetMediaIndex = clip.mediaIndex !== undefined ? clip.mediaIndex : studioState.activeMediaIndex;
    const mediaItem = studioState.mediaList && studioState.mediaList[targetMediaIndex];
    const targetUrl = clip.mediaUrl || (mediaItem ? mediaItem.mediaUrl : studioState.mediaUrl);
    const targetType = clip.mediaType || (mediaItem ? mediaItem.mediaType : studioState.mediaType) || 'video';

    const video = document.getElementById('igt-studio-active-media');
    const container = document.getElementById('igt-studio-media-container');

    if (targetType === 'video') {
      if (video) {
        video.style.display = 'block';
        const currentSrc = video.getAttribute('data-igt-src') || video.src;
        if (currentSrc !== targetUrl) {
          video.setAttribute('data-igt-src', targetUrl);
          video.src = targetUrl;
        }
        if (targetVideoTime !== undefined && !isNaN(targetVideoTime)) {
          video.currentTime = targetVideoTime;
        }
        video.playbackRate = clip.speed || 1;
        video.muted = studioState.isVideoMuted;
        video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
        if (autoPlay || studioState.isVideoPlaying) {
          video.play().catch(() => { });
        }
      }
      const imgEl = container ? container.querySelector('img.igt-studio-active-img') : null;
      if (imgEl) imgEl.style.display = 'none';
    } else if (targetType === 'image') {
      if (video) {
        video.pause();
        video.style.display = 'none';
      }
      let imgEl = container ? container.querySelector('img.igt-studio-active-img') : null;
      if (!imgEl && container) {
        imgEl = document.createElement('img');
        imgEl.className = 'igt-studio-active-img';
        imgEl.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; border-radius: 12px;';
        container.insertBefore(imgEl, container.firstChild);
      }
      if (imgEl) {
        imgEl.style.display = 'block';
        if (imgEl.src !== targetUrl) imgEl.src = targetUrl;
      }
    }

    if (studioState.mediaList && studioState.mediaList[targetMediaIndex] && studioState.activeMediaIndex !== targetMediaIndex) {
      studioState.activeMediaIndex = targetMediaIndex;
      const listContainer = document.getElementById('igt-studio-media-list');
      if (listContainer) {
        listContainer.querySelectorAll('.igt-media-queue-card').forEach((card, idx) => {
          card.classList.toggle('active', idx === targetMediaIndex);
        });
      }
    }
  }

  function togglePlayPause() {
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
  }

  function setVideoVolume(val, toggleMute = false) {
    const video = document.getElementById('igt-studio-active-media');
    if (toggleMute) {
      studioState.isVideoMuted = !studioState.isVideoMuted;
      if (!studioState.isVideoMuted && (!studioState.videoVolume || studioState.videoVolume === 0)) {
        studioState.videoVolume = 1;
      }
    } else {
      const clamped = Math.max(0, Math.min(1, Math.round(val * 100) / 100));
      studioState.videoVolume = clamped;
      studioState.isVideoMuted = clamped === 0;
    }
    if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
      video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
      video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
    }
    updateTrackMuteUI();
  }

  function setAudioVolume(val, toggleMute = false) {
    if (toggleMute) {
      studioState.isAudioMuted = !studioState.isAudioMuted;
      if (!studioState.isAudioMuted && (!studioState.audioVolume || studioState.audioVolume === 0)) {
        studioState.audioVolume = 0.8;
      }
    } else {
      const clamped = Math.max(0, Math.min(1, Math.round(val * 100) / 100));
      studioState.audioVolume = clamped;
      studioState.isAudioMuted = clamped === 0;
    }
    if (studioState.audioElement) {
      studioState.audioElement.muted = studioState.isAudioMuted;
      studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
    }
    updateTrackMuteUI();
  }

  function updateTrackMuteUI() {
    const btnVideo = document.getElementById('igt-track-video-mute-btn');
    const iconVideo = document.getElementById('igt-track-video-audio-icon');
    const labelVideo = document.getElementById('igt-track-video-vol-label');
    const popoverPctVideo = document.getElementById('igt-video-vol-pct-badge');
    const popoverSliderVideo = document.getElementById('igt-video-vol-slider');

    const btnAudio = document.getElementById('igt-track-audio-mute-btn');
    const iconAudio = document.getElementById('igt-track-audio-audio-icon');
    const labelAudio = document.getElementById('igt-track-audio-vol-label');
    const popoverPctAudio = document.getElementById('igt-audio-vol-pct-badge');
    const popoverSliderAudio = document.getElementById('igt-audio-vol-slider');

    const video = document.getElementById('igt-studio-active-media');

    // 1. Track Video (Âm thanh gốc)
    const isVidMuted = studioState.isVideoMuted || studioState.videoVolume === 0;
    const vidVolPct = Math.round((studioState.videoVolume ?? 1) * 100);

    if (btnVideo && iconVideo) {
      if (isVidMuted) {
        btnVideo.classList.add('muted');
        btnVideo.classList.remove('active-sound');
        btnVideo.title = 'Âm thanh video: Đã tắt tiếng (Bấm để bật lại | Lăn chuột để tăng)';
        iconVideo.innerText = '🔇';
        if (labelVideo) labelVideo.innerText = 'Tắt';
      } else {
        btnVideo.classList.remove('muted');
        btnVideo.classList.add('active-sound');
        btnVideo.title = `Âm thanh video: ${vidVolPct}% (Bấm để tắt | Lăn chuột để tăng/giảm)`;
        iconVideo.innerText = (studioState.videoVolume ?? 1) < 0.5 ? '🔉' : '🔊';
        if (labelVideo) labelVideo.innerText = `${vidVolPct}%`;
      }
    }
    if (popoverPctVideo) {
      popoverPctVideo.innerText = isVidMuted ? 'Đã tắt' : `${vidVolPct}%`;
    }
    if (popoverSliderVideo) {
      popoverSliderVideo.value = isVidMuted ? 0 : (studioState.videoVolume ?? 1);
    }
    if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
      video.muted = (studioState.isVideoMuted || studioState.videoVolume === 0);
      video.volume = studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1);
    }

    // 2. Track Audio (Nhạc nền)
    const isAudMuted = studioState.isAudioMuted || studioState.audioVolume === 0;
    const audVolPct = Math.round((studioState.audioVolume ?? 0.8) * 100);

    if (btnAudio && iconAudio) {
      if (isAudMuted) {
        btnAudio.classList.add('muted');
        btnAudio.classList.remove('active-music');
        btnAudio.title = 'Nhạc nền: Đã tắt tiếng (Bấm để bật lại | Lăn chuột để tăng)';
        iconAudio.innerText = '🔇';
        if (labelAudio) labelAudio.innerText = 'Tắt';
      } else {
        btnAudio.classList.remove('muted');
        btnAudio.classList.add('active-music');
        btnAudio.title = `Nhạc nền: ${audVolPct}% (Bấm để tắt | Lăn chuột để tăng/giảm)`;
        iconAudio.innerText = '🎵';
        if (labelAudio) labelAudio.innerText = `${audVolPct}%`;
      }
    }
    if (popoverPctAudio) {
      popoverPctAudio.innerText = isAudMuted ? 'Đã tắt' : `${audVolPct}%`;
    }
    if (popoverSliderAudio) {
      popoverSliderAudio.value = isAudMuted ? 0 : (studioState.audioVolume ?? 0.8);
    }
    if (studioState.audioElement) {
      studioState.audioElement.muted = studioState.isAudioMuted;
      studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
    }

    // 3. Đồng bộ giao diện Sidebar nếu Tab Music đang mở
    const musicVolVal = document.getElementById('igt-music-vol-val');
    const musicVolSlider = document.getElementById('igt-music-vol-slider');
    const musicMuteBtn = document.getElementById('igt-side-music-mute-btn');
    if (musicVolVal) musicVolVal.innerText = isAudMuted ? '0% (Đã tắt)' : `${audVolPct}%`;
    if (musicVolSlider) musicVolSlider.value = isAudMuted ? 0 : (studioState.audioVolume ?? 0.8);
    if (musicMuteBtn) {
      musicMuteBtn.innerText = isAudMuted ? '🔈 Bật tiếng' : '🔇 Tắt tiếng';
      if (isAudMuted) musicMuteBtn.classList.add('active');
      else musicMuteBtn.classList.remove('active');
    }

    // 4. Đồng bộ giao diện Sidebar nếu Tab Video (Tỉ lệ) đang mở
    const tabVidVolVal = document.getElementById('igt-tab-video-vol-val');
    const tabVidVolSlider = document.getElementById('igt-tab-video-vol-slider');
    const tabVidMuteBtn = document.getElementById('igt-side-video-mute-btn');
    if (tabVidVolVal) tabVidVolVal.innerText = isVidMuted ? '0% (Đã tắt)' : `${vidVolPct}%`;
    if (tabVidVolSlider) tabVidVolSlider.value = isVidMuted ? 0 : (studioState.videoVolume ?? 1);
    if (tabVidMuteBtn) {
      tabVidMuteBtn.innerText = isVidMuted ? '🔊 Bật tiếng' : '🔇 Tắt tiếng';
      if (isVidMuted) tabVidMuteBtn.classList.add('active');
      else tabVidMuteBtn.classList.remove('active');
    }
  }

  function generateWaveformBarsHtml() {
    const barCount = 75;
    let html = '';
    for (let i = 0; i < barCount; i++) {
      const t = i / barCount;
      const base = Math.sin(t * Math.PI * 4) * 0.25 + Math.sin(t * Math.PI * 8) * 0.18 + 0.52;
      const noise = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) * 0.5;
      let heightPct = Math.round((base * 0.65 + noise * 0.35) * 100);
      heightPct = Math.max(18, Math.min(94, heightPct));
      html += `<div class="igt-waveform-bar" style="height: ${heightPct}%;"></div>`;
    }
    return html;
  }

  function updateTimelineNeedle() {
    const needle = document.getElementById('igt-timeline-needle');
    const timeDisplay = document.getElementById('igt-timeline-time-display');
    const lanesArea = document.getElementById('igt-timeline-lanes-area');
    const lanesInner = document.getElementById('igt-timeline-lanes-inner');
    if (!needle) return;

    const totalDur = getTotalTimelineDuration();
    const effectiveDur = getVideoClipsTotalDuration() || totalDur;
    const currentT = studioState.currentTime || 0;

    const pct = totalDur > 0 ? Math.min(100, Math.max(0, (currentT / totalDur) * 100)) : 0;
    needle.style.left = pct + '%';

    if (timeDisplay) {
      timeDisplay.innerText = `${formatTime(currentT)} / ${formatTime(effectiveDur)}`;
    }

    // Tự động cuộn theo kim phát khi zoom > 1 (CapCut auto-follow playhead)
    if (studioState.timelineZoom > 1 && lanesArea && lanesInner && studioState.isVideoPlaying) {
      const innerWidth = lanesInner.offsetWidth;
      const needlePx = (pct / 100) * innerWidth;
      const visibleW = lanesArea.clientWidth;
      const scrollLeft = lanesArea.scrollLeft;

      if (needlePx > scrollLeft + visibleW * 0.8 || needlePx < scrollLeft) {
        lanesArea.scrollLeft = Math.max(0, needlePx - visibleW * 0.2);
      }
    }
  }

  function setActiveTimelineTrack(trackName) {
    studioState.activeTimelineTrack = trackName;
    updateActiveTrackUI();
    updateClipToolbar();
    renderTimeline();
  }

  function updateActiveTrackUI() {
    const isVideo = studioState.activeTimelineTrack === 'video';
    const boxVideo = document.getElementById('igt-header-box-video');
    const boxAudio = document.getElementById('igt-header-box-audio');
    const rowVideo = document.getElementById('igt-media-track-row');
    const rowAudio = document.getElementById('igt-audio-track-row');
    const btnLoop = document.getElementById('igt-timeline-btn-loop');
    const btnSplit = document.getElementById('igt-timeline-btn-split');

    if (boxVideo) boxVideo.classList.toggle('active', isVideo);
    if (boxAudio) boxAudio.classList.toggle('active', !isVideo);
    if (rowVideo) rowVideo.classList.toggle('active-track', isVideo);
    if (rowAudio) rowAudio.classList.toggle('active-track', !isVideo);

    if (btnLoop) {
      const isLoop = isVideo ? studioState.isVideoLoop : studioState.isAudioLoop;
      btnLoop.classList.toggle('active', !!isLoop);
      btnLoop.title = isVideo
        ? `Lặp lại Video (Đang: ${isLoop ? 'Bật' : 'Tắt'}) - Click để đổi`
        : `Lặp lại Nhạc nền (Đang: ${isLoop ? 'Bật' : 'Tắt'}) - Click để đổi`;
      btnLoop.innerHTML = `🔁 Loop (${isVideo ? 'Video' : 'Nhạc'})`;
    }

    if (btnSplit) {
      btnSplit.title = isVideo
        ? 'Chia đoạn video tại vị trí kim thời gian'
        : 'Chia đoạn nhạc nền tại vị trí kim thời gian';
      btnSplit.innerHTML = `✂️ Chia (${isVideo ? 'Video' : 'Nhạc'})`;
    }

    const btnMergeAll = document.getElementById('igt-timeline-btn-merge-all');
    if (btnMergeAll) {
      const hasMultipleMedia = studioState.mediaList && studioState.mediaList.length >= 2;
      btnMergeAll.style.display = hasMultipleMedia ? 'inline-flex' : 'none';
      btnMergeAll.classList.toggle('active', !!studioState.isSequenceMode);
      btnMergeAll.innerHTML = `🎬 ${studioState.isSequenceMode ? '✓ Đang ghép chuỗi' : 'Ghép nối'}`;
    }
  }

  function parseTimeInput(str, fallback) {
    if (!str) return fallback;
    const parts = str.split(':').map(p => parseFloat(p));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    const val = parseFloat(str);
    return isNaN(val) ? fallback : val;
  }

  function applyTrimPreset(preset) {
    const vidDur = studioState.videoDuration || 60;
    studioState.trimPreset = preset;

    // Biên độ tối đa là toàn bộ thời lượng video gốc
    const maxBoundary = vidDur;

    let targetLen = maxBoundary;
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
    else if (preset === 'all') studioState.sequenceSplitDuration = Math.min(60, maxBoundary);

    targetLen = Math.min(targetLen, maxBoundary);

    let start = studioState.trimStart || 0;
    if (preset === 'all') {
      start = 0;
    } else if (start + targetLen > maxBoundary) {
      start = Math.max(0, maxBoundary - targetLen);
    }
    const end = Math.min(maxBoundary, start + targetLen);

    studioState.trimStart = start;
    studioState.trimEnd = end;
    studioState.currentTime = start;

    // Đồng bộ clip nếu chỉ có 1 clip đơn
    if (studioState.videoClips && studioState.videoClips.length === 1) {
      studioState.videoClips[0].start = start;
      studioState.videoClips[0].end = end;
    }

    const video = document.getElementById('igt-studio-active-media');
    if (video) {
      if (studioState.videoClips && studioState.videoClips.length > 0) {
        const info = getClipAtTimelineTime(start);
        if (info) {
          currentPlayingClipIndex = info.index;
          studioState.selectedClipId = info.clip.id;
          video.currentTime = info.videoTime;
          video.playbackRate = info.clip.speed || 1;
        } else {
          currentPlayingClipIndex = 0;
          video.currentTime = start;
        }
      } else {
        video.currentTime = start;
      }
    }
    if (studioState.audioElement && studioState.audioUrl) {
      const audioTime = (start - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
      studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration, audioTime));
    }
    updateTimelineNeedle();

    // Lưu vào media item hiện tại
    const curItem = studioState.mediaList[studioState.activeMediaIndex];
    if (curItem) {
      curItem.trimStart = start;
      curItem.trimEnd = end;
      curItem.trimPreset = preset;
      if (curItem.videoClips && curItem.videoClips.length === 1) {
        curItem.videoClips[0].start = start;
        curItem.videoClips[0].end = end;
      }
    }

    takeSnapshot(`Chọn template chia video ${preset}`);
    renderTimeline();
    if (studioState.activeTab === 'main') renderTabContent('main');
  }

  function cancelTrimPreset() {
    const vidDur = studioState.videoDuration || 60;
    studioState.trimPreset = 'none';
    studioState.trimStart = 0;
    studioState.trimEnd = vidDur;
    studioState.currentTime = 0;

    // Đồng bộ clip dài trọn vẹn theo video gốc
    if (studioState.videoClips && studioState.videoClips.length === 1) {
      studioState.videoClips[0].start = 0;
      studioState.videoClips[0].end = vidDur;
    }

    const video = document.getElementById('igt-studio-active-media');
    if (video) {
      if (studioState.videoClips && studioState.videoClips.length > 0) {
        currentPlayingClipIndex = 0;
        const firstClip = studioState.videoClips[0];
        studioState.selectedClipId = firstClip.id;
        video.currentTime = firstClip.start;
        video.playbackRate = firstClip.speed || 1;
      } else {
        video.currentTime = 0;
      }
    }
    if (studioState.audioElement && studioState.audioUrl) {
      const firstAClip = (studioState.audioClips && studioState.audioClips.length > 0) ? studioState.audioClips[0] : null;
      studioState.audioElement.currentTime = firstAClip ? firstAClip.start : (studioState.audioStart || 0);
    }
    updateTimelineNeedle();

    // Lưu vào media item hiện tại
    const curItem = studioState.mediaList[studioState.activeMediaIndex];
    if (curItem) {
      curItem.trimStart = 0;
      curItem.trimEnd = vidDur;
      curItem.trimPreset = 'none';
      if (curItem.videoClips && curItem.videoClips.length === 1) {
        curItem.videoClips[0].start = 0;
        curItem.videoClips[0].end = vidDur;
      }
    }

    takeSnapshot('Hủy mẫu chia video (Chuyển sang Tự do / Custom)');
    renderTimeline();
    if (studioState.activeTab === 'main') renderTabContent('main');
  }

  // ========================================================
  // BỘ HIỆU ỨNG CHUYỂN CẢNH VIDEO (CAPCUT / REELS TRANSITIONS)
  // ========================================================
  const TRANSITION_EFFECTS = [
    { id: 'none', name: 'Không', icon: '✕', desc: 'Cắt thẳng tức thì không hiệu ứng' },
    { id: 'white', name: 'Chớp sáng (Flash)', icon: '⚡', desc: 'Chớp trắng lóa mắt kiểu Reels / TikTok cực chất' },
    { id: 'black', name: 'Đen dần (Dip to Black)', icon: '🎬', desc: 'Chìm nền đen phong cách rạp phim điện ảnh' },
    { id: 'fade', name: 'Hòa tan (Fade)', icon: '🌫️', desc: 'Mờ chồng 2 cảnh nhẹ nhàng êm dịu' },
    { id: 'zoom', name: 'Phóng to (Zoom In)', icon: '🔍', desc: 'Zoom vút chuyển tiếp vào cảnh mới' },
    { id: 'slide-left', name: 'Trượt trái (Slide Left)', icon: '➡️', desc: 'Trượt ngang đẩy cảnh' },
    { id: 'slide-up', name: 'Trượt lên (Slide Up)', icon: '⬆️', desc: 'Trượt dọc từ dưới lên' },
    { id: 'blur', name: 'Mờ nét (Blur)', icon: '💧', desc: 'Làm mờ chuyển giao nghệ thuật' }
  ];

  function getTransitionIcon(type) {
    const found = TRANSITION_EFFECTS.find(t => t.id === type);
    return found ? found.icon : '⧗';
  }

  function getTransitionLabel(type) {
    const found = TRANSITION_EFFECTS.find(t => t.id === type);
    return found ? found.name : 'Không';
  }

  let isTransitionFxActive = false;
  let transitionPreviewTimer = null;

  function renderLiveTransitionVisual(transId, progress) {
    const fxEl = document.getElementById('igt-studio-transition-fx');
    const video = document.getElementById('igt-studio-active-media');
    if (!fxEl) return;

    if (!transId || transId === 'none') {
      resetLiveTransitionVisual();
      return;
    }

    isTransitionFxActive = true;
    const peak = 1 - Math.abs(progress - 0.5) * 2;

    if (transId === 'white') {
      // 1. Chớp sáng (Flash Reels/TikTok)
      fxEl.style.display = 'block';
      fxEl.style.background = '#ffffff';
      fxEl.style.opacity = Math.pow(peak, 1.4);
      fxEl.style.boxShadow = peak > 0.25 ? 'inset 0 0 100px rgba(255,255,255,0.95)' : 'none';
      fxEl.style.transform = '';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
    } else if (transId === 'black') {
      // 2. Đen dần (Dip to Black Điện ảnh)
      fxEl.style.display = 'block';
      fxEl.style.background = '#000000';
      fxEl.style.opacity = peak;
      fxEl.style.boxShadow = 'none';
      fxEl.style.transform = '';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
    } else if (transId === 'fade') {
      // 3. Hòa tan (Crossfade Dissolve mờ chồng)
      fxEl.style.display = 'block';
      fxEl.style.background = 'rgba(10, 14, 23, 0.95)';
      fxEl.style.backdropFilter = `blur(${Math.round(peak * 12)}px)`;
      fxEl.style.webkitBackdropFilter = `blur(${Math.round(peak * 12)}px)`;
      fxEl.style.opacity = peak * 0.92;
      fxEl.style.boxShadow = 'none';
      fxEl.style.transform = '';
      if (video) video.style.opacity = Math.max(0.1, 1 - peak * 0.9);
    } else if (transId === 'blur') {
      // 4. Mờ nét (Motion Blur nghệ thuật)
      fxEl.style.display = 'block';
      fxEl.style.background = `rgba(15, 23, 42, ${peak * 0.45})`;
      fxEl.style.backdropFilter = `blur(${Math.round(peak * 20)}px)`;
      fxEl.style.webkitBackdropFilter = `blur(${Math.round(peak * 20)}px)`;
      fxEl.style.opacity = peak > 0.05 ? '1' : '0';
      fxEl.style.boxShadow = 'none';
      fxEl.style.transform = '';
      if (video) video.style.filter = `blur(${Math.round(peak * 16)}px)`;
    } else if (transId === 'zoom') {
      // 5. Phóng to (Zoom In vút cảnh)
      fxEl.style.display = 'block';
      fxEl.style.background = `radial-gradient(circle, rgba(255,255,255,${peak * 0.4}) 0%, rgba(0,0,0,${peak * 0.6}) 100%)`;
      fxEl.style.opacity = peak;
      fxEl.style.boxShadow = 'none';
      fxEl.style.transform = '';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
      if (video) {
        const baseZoom = studioState.zoom || 1;
        const scaleVal = baseZoom * (1 + peak * 0.35) * (studioState.flipH ? -1 : 1);
        const scaleY = baseZoom * (1 + peak * 0.35) * (studioState.flipV ? -1 : 1);
        const totalAngle = (studioState.rotation || 0) + (studioState.freeAngle || 0);
        video.style.setProperty('transform', `translate(${studioState.panX || 0}px, ${studioState.panY || 0}px) rotate(${totalAngle}deg) scale(${scaleVal}, ${scaleY})`, 'important');
      }
    } else if (transId === 'slide-left') {
      // 6. Trượt trái (Slide Left ngang đẩy cảnh)
      fxEl.style.display = 'block';
      fxEl.style.background = 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 48%, #ffffff 50%, rgba(255,255,255,0.85) 52%, transparent 100%)';
      const wipeX = (progress - 0.5) * 260;
      fxEl.style.transform = `translateX(${wipeX}%)`;
      fxEl.style.opacity = peak > 0.08 ? '1' : '0';
      fxEl.style.boxShadow = 'none';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
      if (video) {
        const baseZoom = studioState.zoom || 1;
        const scaleX = baseZoom * (studioState.flipH ? -1 : 1);
        const scaleY = baseZoom * (studioState.flipV ? -1 : 1);
        const totalAngle = (studioState.rotation || 0) + (studioState.freeAngle || 0);
        const transX = (studioState.panX || 0) + (progress - 0.5) * -160;
        video.style.setProperty('transform', `translate(${transX}px, ${studioState.panY || 0}px) rotate(${totalAngle}deg) scale(${scaleX}, ${scaleY})`, 'important');
      }
    } else if (transId === 'slide-up') {
      // 7. Trượt lên (Slide Up dọc đẩy cảnh)
      fxEl.style.display = 'block';
      fxEl.style.background = 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.85) 48%, #ffffff 50%, rgba(255,255,255,0.85) 52%, transparent 100%)';
      const wipeY = (progress - 0.5) * 260;
      fxEl.style.transform = `translateY(${wipeY}%)`;
      fxEl.style.opacity = peak > 0.08 ? '1' : '0';
      fxEl.style.boxShadow = 'none';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
      if (video) {
        const baseZoom = studioState.zoom || 1;
        const scaleX = baseZoom * (studioState.flipH ? -1 : 1);
        const scaleY = baseZoom * (studioState.flipV ? -1 : 1);
        const totalAngle = (studioState.rotation || 0) + (studioState.freeAngle || 0);
        const transY = (studioState.panY || 0) + (progress - 0.5) * -160;
        video.style.setProperty('transform', `translate(${studioState.panX || 0}px, ${transY}px) rotate(${totalAngle}deg) scale(${scaleX}, ${scaleY})`, 'important');
      }
    }
  }

  function resetLiveTransitionVisual() {
    const fxEl = document.getElementById('igt-studio-transition-fx');
    const video = document.getElementById('igt-studio-active-media');
    if (fxEl) {
      fxEl.style.display = 'none';
      fxEl.style.opacity = '0';
      fxEl.style.transform = '';
      fxEl.style.backdropFilter = '';
      fxEl.style.webkitBackdropFilter = '';
      fxEl.style.boxShadow = '';
    }
    if (isTransitionFxActive) {
      isTransitionFxActive = false;
      if (video) {
        video.style.opacity = '';
        updateMediaTransform();
        applyMediaFilters();
      }
    }
  }

  function previewTransitionEffect(transId, duration = 0.6) {
    if (transitionPreviewTimer) cancelAnimationFrame(transitionPreviewTimer);
    const start = performance.now();
    const durMs = (duration || 0.6) * 1000;

    function loop(now) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / durMs);
      renderLiveTransitionVisual(transId, progress);

      if (progress < 1) {
        transitionPreviewTimer = requestAnimationFrame(loop);
      } else {
        transitionPreviewTimer = null;
        resetLiveTransitionVisual();
      }
    }
    transitionPreviewTimer = requestAnimationFrame(loop);
  }

  function checkAndApplyLiveTransition(curTimelineT) {
    if (transitionPreviewTimer) return;
    const fxEl = document.getElementById('igt-studio-transition-fx');
    if (!fxEl) return;

    if (!studioState.videoClips || studioState.videoClips.length <= 1) {
      resetLiveTransitionVisual();
      return;
    }

    let accumulated = 0;
    let activeTrans = null;
    let progress = 0;

    for (let i = 0; i < studioState.videoClips.length - 1; i++) {
      const c = studioState.videoClips[i];
      const dur = (c.end - c.start) / (c.speed || 1);
      const cutTime = accumulated + dur;
      accumulated += dur;

      if (!c.transition || c.transition === 'none') continue;
      const transDur = c.transitionDuration || 0.5;
      const halfDur = transDur / 2;

      if (curTimelineT >= cutTime - halfDur && curTimelineT <= cutTime + halfDur) {
        activeTrans = c.transition;
        progress = (curTimelineT - (cutTime - halfDur)) / transDur;
        break;
      }
    }

    if (activeTrans) {
      renderLiveTransitionVisual(activeTrans, progress);
    } else {
      resetLiveTransitionVisual();
    }
  }

  function openTransitionPicker(clipIndex) {
    if (!studioState.videoClips || !studioState.videoClips[clipIndex]) return;
    const clip = studioState.videoClips[clipIndex];
    const nextClip = studioState.videoClips[clipIndex + 1];
    const clipLabelA = clip.name || `Đoạn ${clipIndex + 1}`;
    const clipLabelB = nextClip ? (nextClip.name || `Đoạn ${clipIndex + 2}`) : `Đoạn tiếp`;

    const existingModal = document.getElementById('igt-transition-modal');
    if (existingModal) existingModal.remove();

    const currentTrans = clip.transition || 'none';
    const currentDur = clip.transitionDuration || 0.5;

    const overlay = document.createElement('div');
    overlay.id = 'igt-transition-modal';
    overlay.className = 'igt-transition-modal-overlay';
    overlay.innerHTML = `
      <div class="igt-transition-card">
        <div class="igt-transition-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">✨</span>
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #f8fafc;">Hiệu ứng chuyển cảnh</div>
              <div style="font-size: 10.5px; color: #94a3b8;">Giữa ${escapeHtml(clipLabelA)} ➔ ${escapeHtml(clipLabelB)}</div>
            </div>
          </div>
          <button type="button" class="igt-transition-close" id="igt-trans-btn-close">✕</button>
        </div>

        <div class="igt-transition-body">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; background: rgba(255,255,255,0.04); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <span style="font-size: 11px; font-weight: 700; color: #cbd5e1;">⏱ Thời lượng chuyển cảnh:</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="range" id="igt-trans-dur-slider" min="0.2" max="1.5" step="0.1" value="${currentDur}" style="width: 100px; accent-color: #0095f6; cursor: pointer;" />
              <span id="igt-trans-dur-label" style="font-size: 11px; font-weight: 800; color: #38bdf8; min-width: 32px; text-align: right;">${currentDur}s</span>
            </div>
          </div>

          <div class="igt-transition-grid">
            ${TRANSITION_EFFECTS.map(t => {
      const isSel = currentTrans === t.id;
      return `
                <div class="igt-transition-item ${isSel ? 'active' : ''}" data-trans-id="${t.id}">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="igt-trans-item-icon">${t.icon}</span>
                    <span class="igt-trans-item-name">${t.name}</span>
                  </div>
                  <span class="igt-trans-item-desc">${t.desc}</span>
                </div>
              `;
    }).join('')}
          </div>
        </div>

        <div class="igt-transition-footer">
          <button type="button" id="igt-trans-btn-apply-all" class="igt-studio-btn-sub" style="padding: 6px 12px; font-size: 11px; font-weight: 700;">
            ⚡ Áp dụng cho tất cả các đoạn
          </button>
          <button type="button" id="igt-trans-btn-done" class="igt-studio-btn-primary" style="padding: 6px 16px; font-size: 11px; font-weight: 700;">
            Xong
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const durSlider = overlay.querySelector('#igt-trans-dur-slider');
    const durLabel = overlay.querySelector('#igt-trans-dur-label');
    if (durSlider && durLabel) {
      durSlider.oninput = () => {
        const val = parseFloat(durSlider.value);
        durLabel.innerText = `${val}s`;
        clip.transitionDuration = val;
        if (clip.transition && clip.transition !== 'none') {
          previewTransitionEffect(clip.transition, val);
        }
      };
    }

    overlay.querySelectorAll('.igt-transition-item').forEach(item => {
      item.onclick = () => {
        const transId = item.getAttribute('data-trans-id');
        clip.transition = transId;
        clip.transitionDuration = durSlider ? parseFloat(durSlider.value) : 0.5;

        overlay.querySelectorAll('.igt-transition-item').forEach(it => {
          it.classList.toggle('active', it.getAttribute('data-trans-id') === transId);
        });

        // Kích hoạt xem trước chuyển cảnh trực tiếp ngay trên khung hình Studio
        if (transId !== 'none') {
          previewTransitionEffect(transId, clip.transitionDuration);
        } else {
          resetLiveTransitionVisual();
        }

        takeSnapshot(`Chọn chuyển cảnh: ${getTransitionLabel(transId)}`);
        renderTimeline();
        updateClipToolbar();
      };
    });

    const btnApplyAll = overlay.querySelector('#igt-trans-btn-apply-all');
    if (btnApplyAll) {
      btnApplyAll.onclick = () => {
        const chosen = clip.transition || 'none';
        const dur = clip.transitionDuration || 0.5;
        (studioState.videoClips || []).forEach(c => {
          c.transition = chosen;
          c.transitionDuration = dur;
        });
        takeSnapshot(`Áp dụng chuyển cảnh ${getTransitionLabel(chosen)} cho tất cả`);
        renderTimeline();
        updateClipToolbar();
        overlay.remove();
      };
    }

    const btnClose = overlay.querySelector('#igt-trans-btn-close');
    const btnDone = overlay.querySelector('#igt-trans-btn-done');
    if (btnClose) btnClose.onclick = () => overlay.remove();
    if (btnDone) btnDone.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
  }

  // ========================================================
  // BỘ NỐI VIDEO TIẾP THEO QUA NÚT '+' Ở ĐUÔI TỪNG ĐOẠN HOẶC TOOLBAR
  // ========================================================
  function openAddClipPopover(anchorBtn, afterIdx) {
    const existing = document.getElementById('igt-timeline-add-popover');
    if (existing) {
      existing.remove();
      if (existing._anchorBtn === anchorBtn) return;
    }

    const popover = document.createElement('div');
    popover.id = 'igt-timeline-add-popover';
    popover.className = 'igt-timeline-add-popover';
    popover._anchorBtn = anchorBtn;

    const availableMedia = (studioState.mediaList || []).filter(item => !!item.mediaUrl);

    let itemsHtml = '';
    if (availableMedia.length > 0) {
      itemsHtml = availableMedia.map((m, mIdx) => {
        const isVid = m.mediaType === 'video';
        const durStr = isVid ? formatTime(m.videoDuration || 0) : 'Ảnh 15s';
        const nameStr = m.name || (isVid ? `Video #${mIdx + 1}` : `Ảnh #${mIdx + 1}`);
        const thumbHtml = m.thumbUrl
          ? `<img src="${escapeHtml(m.thumbUrl)}" style="width: 26px; height: 26px; border-radius: 4px; object-fit: cover;" />`
          : `<span style="font-size: 13px;">${isVid ? '🎬' : '🖼️'}</span>`;
        return `
          <div class="igt-add-popover-item" data-media-idx="${mIdx}" title="Bấm để nối ${escapeHtml(nameStr)} vào edit">
            <div style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); border-radius: 4px; flex-shrink: 0;">
              ${thumbHtml}
            </div>
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 6px;">
              <div style="font-size: 11px; font-weight: 600; color: #f1f5f9; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(nameStr)}</div>
              <div style="font-size: 9.5px; color: #94a3b8;">${isVid ? 'Video' : 'Ảnh'} • ${durStr}</div>
            </div>
            <span style="color: #38bdf8; font-size: 10px; font-weight: 700; background: rgba(56, 189, 248, 0.15); padding: 2px 6px; border-radius: 4px;">+ Nối</span>
          </div>
        `;
      }).join('');
    } else {
      itemsHtml = `
        <div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 11px;">
          Chưa có tệp nào trong khay chứa
        </div>
      `;
    }

    popover.innerHTML = `
      <div class="igt-add-popover-title">
        <span>🎬 CHỌN VIDEO/ẢNH ĐỂ NỐI</span>
        <button type="button" class="igt-add-popover-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:12px;">✕</button>
      </div>
      <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">Chọn video/ảnh từ khay chứa hoặc tải mới:</div>
      <div style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px;">${itemsHtml}</div>
      <button type="button" class="igt-add-popover-upload-btn" id="igt-btn-upload-append">
        <span>+ Tải tệp mới từ máy</span>
      </button>
      <input type="file" id="igt-append-file-input" accept="video/mp4,video/quicktime,video/webm,image/*" style="display: none;" />
    `;

    const dialogEl = document.querySelector('.igt-studio-dialog') || document.body;
    dialogEl.appendChild(popover);
    popover.style.position = 'fixed';
    popover.style.zIndex = '999999';

    const btnRect = anchorBtn.getBoundingClientRect();
    let leftOffset = btnRect.left - 100;
    leftOffset = Math.max(10, Math.min(window.innerWidth - 280, leftOffset));
    popover.style.left = leftOffset + 'px';

    let topOffset = btnRect.top - 230;
    if (topOffset < 10) {
      topOffset = btnRect.bottom + 8;
    }
    popover.style.top = topOffset + 'px';

    const closeBtn = popover.querySelector('.igt-add-popover-close');
    if (closeBtn) closeBtn.onclick = () => popover.remove();

    popover.querySelectorAll('.igt-add-popover-item').forEach(itemEl => {
      itemEl.onclick = () => {
        const mIdx = parseInt(itemEl.getAttribute('data-media-idx'), 10);
        const m = availableMedia[mIdx];
        if (m) {
          appendClipToSequence(m, mIdx, afterIdx);
        }
        popover.remove();
      };
    });

    const uploadBtn = popover.querySelector('#igt-btn-upload-append');
    const appendInput = popover.querySelector('#igt-append-file-input');
    if (uploadBtn && appendInput) {
      uploadBtn.onclick = () => appendInput.click();
      appendInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          const mediaUrl = URL.createObjectURL(file);
          const isVideo = file.type.startsWith('video/');
          const newItem = {
            id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            file,
            mediaUrl,
            mediaType: isVideo ? 'video' : 'image',
            name: file.name,
            res: isVideo ? 'Video HD' : 'Ultra HD',
            thumbUrl: isVideo ? '' : mediaUrl,
            naturalWidth: 1080,
            naturalHeight: 1920,
            videoDuration: 0,
            trimStart: 0,
            trimEnd: 0,
            zoom: 1,
            panX: 0,
            panY: 0,
            fitMode: studioState.fitMode || 'blur_fit',
            stickers: [],
            detectedLocation: null
          };
          studioState.mediaList.push(newItem);
          const newIdx = studioState.mediaList.length - 1;

          if (isVideo) {
            const tempV = document.createElement('video');
            tempV.preload = 'metadata';
            tempV.src = mediaUrl;
            tempV.addEventListener('loadedmetadata', () => {
              newItem.videoDuration = tempV.duration || 15;
              newItem.trimEnd = newItem.videoDuration;
              appendClipToSequence(newItem, newIdx, afterIdx);
              renderMediaListUI();
            }, { once: true });
          } else {
            appendClipToSequence(newItem, newIdx, afterIdx);
            renderMediaListUI();
          }
        }
        popover.remove();
      };
    }

    const onDocClick = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== anchorBtn) {
        popover.remove();
        document.removeEventListener('mousedown', onDocClick);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDocClick), 50);
  }

  function appendClipToSequence(mediaItem, mediaIdx, afterIdx) {
    if (!mediaItem) return;
    const isVideo = mediaItem.mediaType === 'video';
    const vStart = mediaItem.trimStart || 0;
    const vEnd = (mediaItem.trimEnd && mediaItem.trimEnd > vStart)
      ? mediaItem.trimEnd
      : (mediaItem.videoDuration && mediaItem.videoDuration > 0 ? mediaItem.videoDuration : (isVideo ? 15 : 10));

    if (!studioState.videoClips) studioState.videoClips = [];
    const mIdx = (mediaIdx !== undefined && mediaIdx !== null) ? mediaIdx : studioState.mediaList.indexOf(mediaItem);

    if (studioState.videoClips.length === 0) {
      const newClip = {
        id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: mediaItem.name || (isVideo ? 'Đoạn 1' : 'Ảnh 1'),
        mediaIndex: mIdx >= 0 ? mIdx : 0,
        mediaUrl: mediaItem.mediaUrl,
        mediaType: mediaItem.mediaType || (isVideo ? 'video' : 'image'),
        start: vStart,
        end: vEnd,
        speed: 1,
        transition: 'none'
      };
      studioState.videoClips = [newClip];
      studioState.selectedClipId = newClip.id;
      currentPlayingClipIndex = 0;
      studioState.trimStart = 0;
      studioState.trimEnd = getVideoClipsTotalDuration();
      ensureVideoClipLoaded(newClip, newClip.start, false);
      renderTimeline();
      renderMediaListUI();
      updateActiveTrackUI();
      takeSnapshot('Thêm video vào edit');
      return;
    }

    // Nếu hiện tại chỉ có 1 video đơn chưa ở chế độ chuỗi, chuyển đổi clip đầu tiên thành dạng sequence
    if (!studioState.isSequenceMode && studioState.videoClips.length <= 1) {
      const curItem = studioState.mediaList[studioState.activeMediaIndex] || studioState.mediaList[0];
      const curStart = (curItem ? curItem.trimStart : studioState.trimStart) || 0;
      const curEnd = (curItem && curItem.trimEnd && curItem.trimEnd > curStart)
        ? curItem.trimEnd
        : (studioState.trimEnd && studioState.trimEnd > curStart ? studioState.trimEnd : (studioState.videoDuration || 15));

      studioState.videoClips = [{
        id: 'clip_' + Date.now() + '_1',
        name: (curItem ? curItem.name : '') || 'Đoạn 1',
        mediaIndex: studioState.activeMediaIndex,
        mediaUrl: curItem ? curItem.mediaUrl : studioState.mediaUrl,
        mediaType: curItem ? curItem.mediaType : studioState.mediaType,
        start: curStart,
        end: curEnd,
        speed: 1,
        transition: 'none'
      }];
    }

    const newClip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: mediaItem.name || (isVideo ? `Video ${studioState.videoClips.length + 1}` : `Ảnh ${studioState.videoClips.length + 1}`),
      mediaIndex: mIdx >= 0 ? mIdx : studioState.mediaList.length - 1,
      mediaUrl: mediaItem.mediaUrl,
      mediaType: mediaItem.mediaType || 'video',
      start: vStart,
      end: vEnd,
      speed: 1,
      transition: 'none'
    };

    const insertPos = (afterIdx !== undefined && afterIdx >= 0) ? (afterIdx + 1) : studioState.videoClips.length;
    studioState.videoClips.splice(insertPos, 0, newClip);

    studioState.isSequenceMode = true;
    studioState.selectedClipId = newClip.id;
    currentPlayingClipIndex = insertPos;
    studioState.trimStart = 0;
    studioState.trimEnd = getVideoClipsTotalDuration();
    studioState.mediaType = 'video';

    ensureVideoClipLoaded(newClip, newClip.start, false);
    renderTimeline();
    renderMediaListUI();
    updateActiveTrackUI();
    takeSnapshot('Nối thêm video vào dòng thời gian');
  }

  function updateClipToolbar() {
    const container = document.getElementById('igt-timeline-clip-actions');
    if (!container) return;

    if (studioState.activeTimelineTrack === 'audio') {
      if (!studioState.audioClips || studioState.audioClips.length === 0) {
        container.innerHTML = '';
        return;
      }
      const curClip = studioState.audioClips.find(c => c.id === studioState.selectedAudioClipId) || studioState.audioClips[0];
      const curIdx = studioState.audioClips.indexOf(curClip);
      const canMoveLeft = curIdx > 0;
      const canMoveRight = curIdx < studioState.audioClips.length - 1;
      const canDelete = studioState.audioClips.length > 1;

      container.innerHTML = `
        <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: 2px;">
          <span style="font-size: 10.5px; color: #06b6d4; font-weight: 700; padding: 2px 6px; background: rgba(6, 182, 212, 0.12); border-radius: 4px; border: 1px solid rgba(6, 182, 212, 0.25);">
            🎵 Đoạn nhạc ${curIdx + 1}
          </span>
          <button type="button" id="igt-aclip-btn-move-left" class="igt-timeline-tool-btn ${canMoveLeft ? '' : 'disabled'}" title="Dời đoạn nhạc sang trái" ${canMoveLeft ? '' : 'disabled'} style="${canMoveLeft ? '' : 'opacity: 0.35; cursor: not-allowed;'}">
            ◀
          </button>
          <button type="button" id="igt-aclip-btn-move-right" class="igt-timeline-tool-btn ${canMoveRight ? '' : 'disabled'}" title="Dời đoạn nhạc sang phải" ${canMoveRight ? '' : 'disabled'} style="${canMoveRight ? '' : 'opacity: 0.35; cursor: not-allowed;'}">
            ▶
          </button>
          ${canDelete ? `
            <button type="button" id="igt-aclip-btn-delete" class="igt-timeline-tool-btn danger" title="Xóa đoạn nhạc ${curIdx + 1}">
              🗑️ Xóa
            </button>
          ` : ''}
        </div>
      `;

      const btnLeft = container.querySelector('#igt-aclip-btn-move-left');
      if (btnLeft && canMoveLeft) {
        btnLeft.onclick = () => {
          const prev = studioState.audioClips[curIdx - 1];
          studioState.audioClips[curIdx - 1] = curClip;
          studioState.audioClips[curIdx] = prev;
          takeSnapshot('Dời đoạn nhạc sang trái');
          renderTimeline();
        };
      }

      const btnRight = container.querySelector('#igt-aclip-btn-move-right');
      if (btnRight && canMoveRight) {
        btnRight.onclick = () => {
          const next = studioState.audioClips[curIdx + 1];
          studioState.audioClips[curIdx + 1] = curClip;
          studioState.audioClips[curIdx] = next;
          takeSnapshot('Dời đoạn nhạc sang phải');
          renderTimeline();
        };
      }

      const btnDel = container.querySelector('#igt-aclip-btn-delete');
      if (btnDel && canDelete) {
        btnDel.onclick = () => {
          studioState.audioClips.splice(curIdx, 1);
          const newSelected = studioState.audioClips[Math.min(curIdx, studioState.audioClips.length - 1)];
          studioState.selectedAudioClipId = newSelected ? newSelected.id : null;
          takeSnapshot('Xóa đoạn nhạc');
          renderTimeline();
        };
      }
      return;
    }

    if (studioState.mediaType !== 'video' || !studioState.videoClips || studioState.videoClips.length === 0) {
      container.innerHTML = '';
      return;
    }

    const curClip = studioState.videoClips.find(c => c.id === studioState.selectedClipId) || studioState.videoClips[0];
    const curIdx = studioState.videoClips.indexOf(curClip);
    const speed = curClip ? (curClip.speed || 1) : 1;
    const canMoveLeft = curIdx > 0;
    const canMoveRight = curIdx < studioState.videoClips.length - 1;
    const canDelete = studioState.videoClips.length > 1;

    container.innerHTML = `
      <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: 2px;">
        <div class="igt-timeline-speed-select-wrap ${speed !== 1 ? 'is-changed' : ''}" title="Chọn tốc độ phát cho đoạn ${curIdx + 1}">
          <span class="igt-speed-icon">⚡</span>
          <select id="igt-clip-select-speed" class="igt-timeline-speed-select" title="Chọn tốc độ phát">
            <option value="0.5" ${speed === 0.5 ? 'selected' : ''}>0.5x</option>
            <option value="0.75" ${speed === 0.75 ? 'selected' : ''}>0.75x</option>
            <option value="1" ${speed === 1 ? 'selected' : ''}>1x</option>
            <option value="1.25" ${speed === 1.25 ? 'selected' : ''}>1.25x</option>
            <option value="1.5" ${speed === 1.5 ? 'selected' : ''}>1.5x</option>
            <option value="2" ${speed === 2 ? 'selected' : ''}>2x</option>
            <option value="3" ${speed === 3 ? 'selected' : ''}>3x</option>
          </select>
        </div>
        ${(curIdx < studioState.videoClips.length - 1) ? `
          <button type="button" id="igt-clip-btn-transition" class="igt-timeline-tool-btn ${curClip.transition && curClip.transition !== 'none' ? 'active' : ''}" title="Hiệu ứng chuyển cảnh giữa Đoạn ${curIdx + 1} và Đoạn ${curIdx + 2}">
            ${getTransitionIcon(curClip.transition)} Chuyển cảnh
          </button>
        ` : ''}
        <button type="button" id="igt-clip-btn-move-left" class="igt-timeline-tool-btn ${canMoveLeft ? '' : 'disabled'}" title="Dời đoạn sang trái (hoán đổi vị trí)" ${canMoveLeft ? '' : 'disabled'} style="${canMoveLeft ? '' : 'opacity: 0.35; cursor: not-allowed;'}">
          ◀
        </button>
        <button type="button" id="igt-clip-btn-move-right" class="igt-timeline-tool-btn ${canMoveRight ? '' : 'disabled'}" title="Dời đoạn sang phải (hoán đổi vị trí)" ${canMoveRight ? '' : 'disabled'} style="${canMoveRight ? '' : 'opacity: 0.35; cursor: not-allowed;'}">
          ▶
        </button>
        ${canDelete ? `
          <button type="button" id="igt-clip-btn-delete" class="igt-timeline-tool-btn danger" title="Xóa đoạn ${curIdx + 1} khỏi video">
            🗑️ Xóa
          </button>
        ` : ''}
      </div>
    `;

    const btnTrans = container.querySelector('#igt-clip-btn-transition');
    if (btnTrans) {
      btnTrans.onclick = () => {
        openTransitionPicker(curIdx);
      };
    }

    const selectSpeed = container.querySelector('#igt-clip-select-speed');
    if (selectSpeed) {
      selectSpeed.onchange = (e) => {
        const newSpeed = parseFloat(e.target.value) || 1;
        curClip.speed = newSpeed;

        const video = document.getElementById('igt-studio-active-media');
        if (video && currentPlayingClipIndex === curIdx) {
          video.playbackRate = newSpeed;
        }

        takeSnapshot(`Đổi tốc độ đoạn ${curIdx + 1} thành ${newSpeed}x`);
        renderTimeline();
        if (studioState.activeTab === 'main') renderTabContent('main');
      };
    }

    const btnLeft = container.querySelector('#igt-clip-btn-move-left');
    if (btnLeft && canMoveLeft) {
      btnLeft.onclick = () => {
        const prev = studioState.videoClips[curIdx - 1];
        studioState.videoClips[curIdx - 1] = curClip;
        studioState.videoClips[curIdx] = prev;
        takeSnapshot(`Dời đoạn sang trái`);
        renderTimeline();
        if (studioState.activeTab === 'main') renderTabContent('main');
      };
    }

    const btnRight = container.querySelector('#igt-clip-btn-move-right');
    if (btnRight && canMoveRight) {
      btnRight.onclick = () => {
        const next = studioState.videoClips[curIdx + 1];
        studioState.videoClips[curIdx + 1] = curClip;
        studioState.videoClips[curIdx] = next;
        takeSnapshot(`Dời đoạn sang phải`);
        renderTimeline();
        if (studioState.activeTab === 'main') renderTabContent('main');
      };
    }

    const btnDel = container.querySelector('#igt-clip-btn-delete');
    if (btnDel && canDelete) {
      btnDel.onclick = () => {
        studioState.videoClips.splice(curIdx, 1);
        const newSelected = studioState.videoClips[Math.min(curIdx, studioState.videoClips.length - 1)];
        studioState.selectedClipId = newSelected ? newSelected.id : null;
        takeSnapshot(`Xóa đoạn video`);
        renderTimeline();
        if (studioState.activeTab === 'main') renderTabContent('main');
      };
    }
  }

  function setTimelineZoom(val, anchorRatio = null) {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(val * 100) / 100));
    studioState.timelineZoom = clamped;

    const lanesArea = document.getElementById('igt-timeline-lanes-area');
    const lanesInner = document.getElementById('igt-timeline-lanes-inner');
    const slider = document.getElementById('igt-tl-zoom-slider');
    const label = document.getElementById('igt-tl-zoom-val');

    if (slider) slider.value = tlZoomToSliderVal(clamped);
    if (label) label.innerText = `${Math.round(clamped * 100)}%`;

    if (lanesInner && lanesArea) {
      const visibleWidth = lanesArea.clientWidth;
      if (clamped <= 1.0) {
        lanesInner.style.width = '100%';
      } else {
        lanesInner.style.width = `${Math.round(clamped * 100)}%`;
      }

      const newInnerWidth = lanesInner.offsetWidth;
      if (anchorRatio !== null) {
        lanesArea.scrollLeft = (newInnerWidth * anchorRatio) - (visibleWidth / 2);
      } else {
        const currentT = studioState.currentTime || 0;
        const totalDur = getTotalTimelineDuration();
        const needleRatio = totalDur > 0 ? (currentT / totalDur) : 0;
        lanesArea.scrollLeft = (newInnerWidth * needleRatio) - (visibleWidth / 2);
      }
    }

    renderTimelineRuler();
    renderTimeline();
    updateTimelineNeedle();
  }

  function renderTimelineRuler() {
    const ruler = document.getElementById('igt-timeline-ruler');
    const lanesInner = document.getElementById('igt-timeline-lanes-inner');
    const lanesArea = document.getElementById('igt-timeline-lanes-area');
    if (!ruler) return;

    const totalDur = getTotalTimelineDuration();
    if (totalDur <= 0) return;

    const totalWidth = (lanesInner ? lanesInner.offsetWidth : 0) || (lanesArea ? lanesArea.offsetWidth : 0) || 800;
    const pxPerSec = totalWidth / totalDur;

    let stepSec = 5;
    let majorSec = 10;

    if (pxPerSec >= 80) {
      stepSec = 0.5;
      majorSec = 1;
    } else if (pxPerSec >= 35) {
      stepSec = 1;
      majorSec = 2;
    } else if (pxPerSec >= 18) {
      stepSec = 1;
      majorSec = 5;
    } else if (pxPerSec >= 8) {
      stepSec = 2;
      majorSec = 10;
    } else if (pxPerSec >= 3) {
      stepSec = 5;
      majorSec = 15;
    } else if (pxPerSec >= 1.2) {
      stepSec = 10;
      majorSec = 30;
    } else {
      stepSec = 30;
      majorSec = 60;
    }

    let ticksHtml = '';
    const count = Math.floor(totalDur / stepSec);
    for (let i = 0; i <= count; i++) {
      const sec = i * stepSec;
      if (sec > totalDur) break;
      const pct = (sec / totalDur) * 100;
      const isMajor = (Math.abs(sec % majorSec) < 0.001) || (i === 0) || (Math.abs(sec - totalDur) < 0.001);
      const label = isMajor ? formatTime(Math.round(sec)) : '';

      ticksHtml += `
        <div class="igt-timeline-ruler-tick ${isMajor ? 'major' : ''} ${i === 0 ? 'first-tick' : ''}" style="left: ${pct}%;">
          ${isMajor ? `<span class="igt-ruler-label">${label}</span>` : ''}
          <span class="igt-ruler-mark ${isMajor ? 'major' : ''}"></span>
        </div>
      `;
    }

    // Luôn đảm bảo mốc cuối cùng hiển thị đúng tổng thời lượng
    ticksHtml += `
      <div class="igt-timeline-ruler-tick major last-tick" style="left: 100%;">
        <span class="igt-ruler-label">${formatTime(Math.round(totalDur))}</span>
        <span class="igt-ruler-mark major"></span>
      </div>
    `;

    ruler.innerHTML = ticksHtml;
  }

  function renderTimeline() {
    updateBottomControlsVisibility();
    const ruler = document.getElementById('igt-timeline-ruler');
    const mediaRow = document.getElementById('igt-media-track-row');
    const audioRow = document.getElementById('igt-audio-track-row');
    if (!ruler || !mediaRow || !audioRow) return;

    const lanesInner = document.getElementById('igt-timeline-lanes-inner');
    if (lanesInner) {
      const zoom = studioState.timelineZoom || 1.0;
      lanesInner.style.width = (zoom > 1.0) ? `${Math.round(zoom * 100)}%` : '100%';
    }

    const totalDur = getTotalTimelineDuration();

    // 1. Thước đo thời gian động thích ứng theo độ thu phóng Zoom (CapCut style)
    renderTimelineRuler();

    // 2. Track 1: Media Track (Hỗ trợ nhiều đoạn chia nhỏ - CapCut style)
    if (studioState.mediaType === 'video' && studioState.videoDuration > 0) {
      if (!studioState.videoClips || studioState.videoClips.length === 0) {
        studioState.videoClips = [{
          id: 'clip_' + Date.now(),
          start: studioState.trimStart || 0,
          end: studioState.trimEnd || studioState.videoDuration,
          speed: 1
        }];
        studioState.selectedClipId = studioState.videoClips[0].id;
      }

      const isSingleVideo = (!studioState.isSequenceMode && studioState.videoClips.length <= 1);
      let accumulatedLeft = 0;
      let clipEndPct = 0;
      const clipsHtml = studioState.videoClips.map((c, idx) => {
        const durOnTimeline = (c.end - c.start) / (c.speed || 1);
        const widthPct = (durOnTimeline / totalDur) * 100;
        const leftPct = isSingleVideo ? (((c.start || 0) / totalDur) * 100) : ((accumulatedLeft / totalDur) * 100);
        accumulatedLeft += durOnTimeline;
        clipEndPct = leftPct + widthPct;

        const isSelected = (c.id === studioState.selectedClipId) || (!studioState.selectedClipId && idx === 0);
        const speedTag = (c.speed && c.speed !== 1) ? `<span class="igt-clip-speed-badge">${c.speed}x</span>` : '';

        const transNodeHtml = (idx < studioState.videoClips.length - 1) ? `
          <div class="igt-timeline-transition-node ${c.transition && c.transition !== 'none' ? 'active' : ''}" data-trans-idx="${idx}" style="left: ${leftPct + widthPct}%;" title="Hiệu ứng chuyển cảnh giữa Đoạn ${idx + 1} và Đoạn ${idx + 2} (${getTransitionLabel(c.transition)})">
            <span>${getTransitionIcon(c.transition)}</span>
          </div>
        ` : '';

        const tailAddBtnHtml = `
          <button type="button" class="igt-timeline-tail-add-btn" data-after-idx="${idx}" data-after-clip-id="${c.id}" style="left: calc(${leftPct + widthPct}% + 6px);" title="Bấm dấu + để nối video/ảnh khác vào sau đoạn này">
            <span>+</span>
          </button>
        `;

        return `
          <div class="igt-media-clip-box ${isSelected ? 'active' : ''}" data-clip-id="${c.id}" data-clip-idx="${idx}" style="left: ${leftPct}%; width: ${widthPct}%;">
            ${isSelected ? `<div class="igt-timeline-handle left" data-handle="clip-start" data-clip-id="${c.id}" title="Kéo để chỉnh điểm bắt đầu đoạn video (Kéo sang trái/phải)"><span class="igt-handle-bar"></span></div>` : ''}
            <div class="igt-media-clip-info">
              <span class="igt-media-clip-name">Đoạn ${idx + 1}${speedTag}</span>
              <span class="igt-media-clip-dur">${formatTime(durOnTimeline)}</span>
            </div>
            ${isSelected ? `<div class="igt-timeline-handle right" data-handle="clip-end" data-clip-id="${c.id}" title="Kéo để chỉnh điểm kết thúc đoạn video (Kéo sang trái/phải)"><span class="igt-handle-bar"></span></div>` : ''}
          </div>
          ${transNodeHtml}
          ${tailAddBtnHtml}
        `;
      }).join('');

      let extSlotHtml = '';
      if (clipEndPct < 99.5) {
        const extLeftPct = clipEndPct;
        const extWidthPct = Math.max(0, 100 - extLeftPct);
        const extraSec = Math.max(0.5, totalDur - accumulatedLeft);
        extSlotHtml = `
          <div class="igt-timeline-ext-slot" style="left: ${extLeftPct}%; width: ${extWidthPct}%;" title="Vùng mở rộng khi thu nhỏ (${Math.round((studioState.timelineZoom || 1) * 100)}%): Kéo thả thêm video hoặc bấm dấu + để nối tiếp (+${formatTime(extraSec)})">
            <button type="button" class="igt-timeline-ext-add-btn" title="Thêm video vào vùng mở rộng này">+</button>
            <span class="igt-timeline-ext-text">+ Thêm / Kéo thả video vào đây (+${formatTime(extraSec)})</span>
          </div>
        `;
      }
      mediaRow.innerHTML = clipsHtml + extSlotHtml;

      const extSlot = mediaRow.querySelector('.igt-timeline-ext-slot');
      if (extSlot) {
        extSlot.onmousedown = (e) => e.stopPropagation();
        extSlot.onclick = (e) => {
          e.stopPropagation();
          const lastIdx = studioState.videoClips.length - 1;
          const lastBtn = mediaRow.querySelector(`[data-after-idx="${lastIdx}"]`) || extSlot;
          openAddClipPopover(lastBtn, lastIdx);
        };
      }

      mediaRow.querySelectorAll('.igt-timeline-tail-add-btn').forEach(btn => {
        btn.onmousedown = (e) => e.stopPropagation();
        btn.onclick = (e) => {
          e.stopPropagation();
          const afterIdx = parseInt(btn.getAttribute('data-after-idx'), 10);
          openAddClipPopover(btn, afterIdx);
        };
      });

      mediaRow.querySelectorAll('.igt-timeline-transition-node').forEach(node => {
        node.onmousedown = (e) => e.stopPropagation();
        node.onclick = (e) => {
          e.stopPropagation();
          const clipIdx = parseInt(node.getAttribute('data-trans-idx'), 10);
          openTransitionPicker(clipIdx);
        };
      });

      mediaRow.querySelectorAll('.igt-media-clip-box').forEach(box => {
        const selectClip = () => {
          const clipId = box.getAttribute('data-clip-id');
          studioState.selectedClipId = clipId;
          const clipIdx = parseInt(box.getAttribute('data-clip-idx'), 10);
          const clip = (studioState.videoClips || [])[clipIdx];
          if (clip) {
            currentPlayingClipIndex = clipIdx;
            ensureVideoClipLoaded(clip, clip.start, false);
            studioState.currentTime = getTimelineTimeFromVideoTime(clipIdx, clip.start);
            updateTimelineNeedle();
            checkAndApplyLiveTransition(studioState.currentTime);
          }
          setActiveTimelineTrack('video');
        };
        box.onmousedown = (e) => {
          if (!e.target.closest('.igt-timeline-handle')) {
            e.stopPropagation();
            selectClip();
          }
        };
        box.onclick = (e) => {
          e.stopPropagation();
          selectClip();
        };
      });
    } else if (studioState.mediaType === 'image' && studioState.mediaUrl) {
      // Hiển thị dải thời gian cho Ảnh hoặc Live Photo
      const curItem = studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex];
      const isLiveActive = curItem && (curItem.isLivePhoto || /^mvimg_|_live|_motion/i.test(curItem.name || '')) && (curItem.liveMode !== 'still') && curItem.liveVideoUrl;
      const imgDur = (studioState.mode === 'story' || studioState.mode === 'reel')
        ? (studioState.imageDuration || 15)
        : (isLiveActive ? (curItem.videoDuration || 3) : (studioState.imageDuration || 15));
      const clipName = isLiveActive ? '🎬 Live Photo' : '🖼️ Ảnh Story';
      const widthPct = Math.min(100, (imgDur / totalDur) * 100);
      let extSlotHtml = '';
      if (widthPct < 99.5) {
        const extraSec = Math.max(0.5, totalDur - imgDur);
        extSlotHtml = `
          <div class="igt-timeline-ext-slot" style="left: ${widthPct}%; width: ${100 - widthPct}%;" title="Vùng mở rộng (+${formatTime(extraSec)}): Kéo thả thêm video/ảnh hoặc bấm +">
            <button type="button" class="igt-timeline-ext-add-btn">+</button>
            <span class="igt-timeline-ext-text">+ Thêm / Kéo thả video vào đây (+${formatTime(extraSec)})</span>
          </div>
        `;
      }
      mediaRow.innerHTML = `
        <div class="igt-media-clip-box active image-clip" style="left: 0%; width: ${widthPct}%;">
          <div class="igt-media-clip-info">
            <span class="igt-media-clip-name">🖼️ Ảnh Story</span>
            <span class="igt-media-clip-dur">${formatTime(imgDur)}</span>
          </div>
        </div>
        <button type="button" class="igt-timeline-tail-add-btn" data-after-idx="0" style="left: calc(${widthPct}% + 6px);" title="Bấm dấu + để nối video/ảnh khác vào sau ảnh này">
          <span>+</span>
        </button>
        ${extSlotHtml}
      `;
      const extSlot = mediaRow.querySelector('.igt-timeline-ext-slot');
      if (extSlot) {
        extSlot.onmousedown = (e) => e.stopPropagation();
        extSlot.onclick = (e) => {
          e.stopPropagation();
          openAddClipPopover(extSlot, 0);
        };
      }
      const addBtn = mediaRow.querySelector('.igt-timeline-tail-add-btn');
      if (addBtn) {
        addBtn.onmousedown = (e) => e.stopPropagation();
        addBtn.onclick = (e) => {
          e.stopPropagation();
          openAddClipPopover(addBtn, 0);
        };
      }
      mediaRow.onclick = () => {
        setActiveTimelineTrack('video');
      };
    } else {
      mediaRow.innerHTML = `
        <div class="igt-track-empty-media" id="igt-track-empty-media">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>
          <span>Drag and drop media here</span>
        </div>
      `;
      const emptyMedia = mediaRow.querySelector('#igt-track-empty-media');
      if (emptyMedia) {
        const fileInput = document.getElementById('igt-studio-file-input');
        emptyMedia.onmousedown = (e) => e.stopPropagation();
        emptyMedia.onclick = (e) => {
          e.stopPropagation();
          if (fileInput) fileInput.click();
        };
      }
    }

    mediaRow.onmousedown = (e) => {
      if (!e.target.closest('#igt-track-empty-media') && !e.target.closest('.igt-timeline-handle')) {
        e.stopPropagation();
        setActiveTimelineTrack('video');
      }
    };
    mediaRow.onclick = (e) => {
      if (e.target.closest('#igt-track-empty-media')) return;
      setActiveTimelineTrack('video');
    };

    // 3. Track 2: Audio Track (Nhạc nền Teal Capsule đa đoạn)
    if (studioState.audioUrl) {
      if (!studioState.audioClips || studioState.audioClips.length === 0) {
        const aclipId = 'aclip_' + Date.now();
        studioState.audioClips = [{
          id: aclipId,
          name: studioState.audioName || 'audio.mp3',
          start: studioState.audioStart || 0,
          end: (studioState.audioStart || 0) + totalDur,
          offset: 0
        }];
        studioState.selectedAudioClipId = aclipId;
      } else if (studioState.audioClips.length === 1) {
        studioState.audioClips[0].offset = 0;
        studioState.audioClips[0].end = (studioState.audioClips[0].start || 0) + totalDur;
        studioState.audioEnd = studioState.audioClips[0].end;
      }

      let maxAudioEndPct = 0;
      const audioCapsulesHtml = studioState.audioClips.map((ac, idx) => {
        const clipDur = Math.max(0.2, ac.end - ac.start);
        const aOffsetPct = (ac.offset / totalDur) * 100;
        const aWidthPct = (clipDur / totalDur) * 100;
        maxAudioEndPct = Math.max(maxAudioEndPct, aOffsetPct + aWidthPct);
        const isSelected = (ac.id === studioState.selectedAudioClipId) || (!studioState.selectedAudioClipId && idx === 0);

        return `
          <div class="igt-audio-clip-capsule ${isSelected ? 'active' : ''}" data-aclip-id="${ac.id}" data-aclip-idx="${idx}" style="left: ${aOffsetPct}%; width: ${aWidthPct}%;">
            ${isSelected ? `<div class="igt-timeline-handle left" data-handle="aclip-start" data-aclip-id="${ac.id}" title="Kéo để chỉnh điểm bắt đầu nhạc"><span class="igt-handle-bar"></span></div>` : ''}
            <div class="igt-audio-meta-info">
              <span class="igt-audio-title">${escapeHtml(ac.name || `Nhạc ${idx + 1}`)}</span>
              <span class="igt-audio-pill-dur">${formatTime(clipDur)}</span>
            </div>
            <div class="igt-audio-waveform-bars">
              ${generateWaveformBarsHtml()}
            </div>
            ${isSelected ? `<div class="igt-timeline-handle right" data-handle="aclip-end" data-aclip-id="${ac.id}" title="Kéo để chỉnh điểm kết thúc nhạc"><span class="igt-handle-bar"></span></div>` : ''}
          </div>
        `;
      }).join('');

      let audioExtSlotHtml = '';
      if (maxAudioEndPct < 99.5) {
        const aExtLeftPct = maxAudioEndPct;
        const aExtWidthPct = Math.max(0, 100 - aExtLeftPct);
        const extraAudioSec = Math.max(0.5, totalDur * (aExtWidthPct / 100));
        audioExtSlotHtml = `
          <div class="igt-timeline-audio-ext-slot" style="left: ${aExtLeftPct}%; width: ${aExtWidthPct}%;" title="Kéo thả thêm tệp MP3 hoặc bấm để thêm nhạc (+${formatTime(extraAudioSec)})">
            <span>+ Thêm đoạn nhạc (+${formatTime(extraAudioSec)})</span>
          </div>
        `;
      }
      audioRow.innerHTML = audioCapsulesHtml + audioExtSlotHtml;

      const audioExtSlot = audioRow.querySelector('.igt-timeline-audio-ext-slot');
      if (audioExtSlot) {
        audioExtSlot.onclick = (e) => {
          e.stopPropagation();
          const audioInput = document.getElementById('igt-timeline-audio-input');
          if (audioInput) audioInput.click();
        };
      }

      audioRow.querySelectorAll('.igt-audio-clip-capsule').forEach(capsule => {
        const selectAClip = () => {
          const aclipId = capsule.getAttribute('data-aclip-id');
          studioState.selectedAudioClipId = aclipId;
          setActiveTimelineTrack('audio');
        };
        capsule.onmousedown = (e) => {
          if (!e.target.closest('.igt-timeline-handle')) {
            e.stopPropagation();
            selectAClip();
          }
        };
        capsule.onclick = (e) => {
          e.stopPropagation();
          selectAClip();
        };
      });
    } else {
      audioRow.innerHTML = `
        <div class="igt-track-empty-audio" id="igt-track-empty-audio">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
          <span>Bấm hoặc thả tệp MP3 để thêm nhạc nền (Audio track)</span>
        </div>
      `;
      const emptyAudio = audioRow.querySelector('#igt-track-empty-audio');
      if (emptyAudio) {
        const audioInput = document.getElementById('igt-timeline-audio-input');
        emptyAudio.onmousedown = (e) => {
          e.stopPropagation();
        };
        emptyAudio.onclick = (e) => {
          e.stopPropagation();
          if (audioInput) audioInput.click();
        };
        emptyAudio.ondragover = (e) => {
          e.preventDefault();
          e.stopPropagation();
          emptyAudio.style.borderColor = '#06b6d4';
          emptyAudio.style.background = 'rgba(6, 182, 212, 0.12)';
        };
        emptyAudio.ondragleave = (e) => {
          e.preventDefault();
          e.stopPropagation();
          emptyAudio.style.borderColor = '';
          emptyAudio.style.background = '';
        };
        emptyAudio.ondrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          emptyAudio.style.borderColor = '';
          emptyAudio.style.background = '';
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
            loadAudioFile(e.dataTransfer.files[0]);
          }
        };
      }
    }

    audioRow.onmousedown = (e) => {
      if (!e.target.closest('#igt-track-empty-audio') && !e.target.closest('.igt-timeline-handle')) {
        e.stopPropagation();
        setActiveTimelineTrack('audio');
      }
    };
    audioRow.onclick = (e) => {
      if (e.target.closest('#igt-track-empty-audio')) return;
      setActiveTimelineTrack('audio');
    };

    // 4. Khung Cắt Template Video Window (15s, 30s, 60s)
    const trimWindow = document.getElementById('igt-timeline-trim-window');
    if (trimWindow) {
      if (studioState.mediaType === 'video' && studioState.videoDuration > 0 && studioState.trimPreset && studioState.trimPreset !== 'none' && studioState.trimPreset !== 'custom' && !studioState.isSequenceMode) {
        const tStart = Math.max(0, studioState.trimStart || 0);
        const tEnd = Math.min(totalDur, Math.max(tStart + 0.2, studioState.trimEnd || totalDur));
        const leftPct = (tStart / totalDur) * 100;
        const widthPct = ((tEnd - tStart) / totalDur) * 100;
        const durSec = Math.round((tEnd - tStart) * 10) / 10;

        let badgeTitle = `${durSec}s`;
        if (studioState.trimPreset === '10s') badgeTitle = '10s (Template)';
        else if (studioState.trimPreset === '20s') badgeTitle = '20s (Template)';
        else if (studioState.trimPreset === '15s') badgeTitle = '15s (Template)';
        else if (studioState.trimPreset === '30s') badgeTitle = '30s (Template)';
        else if (studioState.trimPreset === '60s') badgeTitle = '60s (Story IG)';
        else if (studioState.trimPreset === 'all') badgeTitle = 'Toàn bộ';
        else if (studioState.trimPreset === 'custom') badgeTitle = `${durSec}s (Tùy chỉnh)`;

        trimWindow.style.display = 'block';
        trimWindow.style.left = leftPct + '%';
        trimWindow.style.width = widthPct + '%';
        trimWindow.title = `Vùng chia ${badgeTitle} (${formatTime(tStart)} - ${formatTime(tEnd)}). Bấm giữ để di chuyển vùng chia!`;
        trimWindow.innerHTML = `
          <div class="igt-trim-line-left"></div>
          <div class="igt-trim-handle-left" data-trim-handle="start" title="Kéo mốc bắt đầu">[</div>
          <div class="igt-trim-window-badge">
            <span>⏱ ${badgeTitle}</span>
            <span style="opacity: 0.8; font-size: 8px;">⠿</span>
          </div>
          <div class="igt-trim-line-right"></div>
          <div class="igt-trim-handle-right" data-trim-handle="end" title="Kéo mốc kết thúc">]</div>
        `;
      } else {
        trimWindow.style.display = 'none';
      }
    }

    updateTimelineNeedle();
    updateTrackMuteUI();
    updateActiveTrackUI();
    updateClipToolbar();
    setupTimelineInteractiveEvents();
  }

  function setupTimelineInteractiveEvents() {
    const timelineBody = document.getElementById('igt-timeline-body');
    const lanesArea = document.getElementById('igt-timeline-lanes-area') || timelineBody;
    const lanesInner = document.getElementById('igt-timeline-lanes-inner') || lanesArea;
    const needle = document.getElementById('igt-timeline-needle');
    if (!lanesArea || !needle) return;

    let isScrubbing = false;

    const handleScrub = (clientX) => {
      const rect = lanesInner.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const totalDur = getTotalTimelineDuration();
      const targetTime = (x / rect.width) * totalDur;

      studioState.currentTime = targetTime;
      if (studioState.videoClips && studioState.videoClips.length > 0) {
        const info = getClipAtTimelineTime(targetTime);
        if (info) {
          currentPlayingClipIndex = info.index;
          studioState.selectedClipId = info.clip.id;
          ensureVideoClipLoaded(info.clip, info.videoTime, studioState.isVideoPlaying);
        }
      } else {
        const video = document.getElementById('igt-studio-active-media');
        if (video && studioState.mediaType === 'video') {
          video.currentTime = targetTime;
        }
      }

      if (studioState.audioElement && studioState.audioUrl) {
        if (studioState.audioClips && studioState.audioClips.length > 0) {
          const activeAClip = studioState.audioClips.find(ac => targetTime >= ac.offset && targetTime <= ac.offset + (ac.end - ac.start));
          if (activeAClip) {
            const targetAudioTime = activeAClip.start + (targetTime - activeAClip.offset);
            studioState.audioElement.currentTime = targetAudioTime;
          }
        } else {
          const audioTime = (targetTime - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
          studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration, audioTime));
        }
      }

      updateTimelineNeedle();
      checkAndApplyLiveTransition(targetTime);
      updateClipToolbar();
    };

    const startScrubSession = (startX) => {
      isScrubbing = true;
      handleScrub(startX);

      const onMouseMove = (ev) => {
        if (!isScrubbing) return;
        handleScrub(ev.clientX);
      };

      const onMouseUp = () => {
        isScrubbing = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    lanesArea.onmousedown = (e) => {
      if (e.target.closest('.igt-timeline-handle') ||
        e.target.closest('#igt-track-empty-audio') ||
        e.target.closest('#igt-track-empty-media') ||
        e.target.closest('.igt-timeline-track-headers') ||
        e.target.closest('.igt-track-audio-btn') ||
        e.target.closest('#igt-timeline-trim-window') ||
        e.target.closest('.igt-media-clip-box') ||
        e.target.closest('.igt-audio-clip-capsule')) return;
      startScrubSession(e.clientX);
    };

    const ruler = document.getElementById('igt-timeline-ruler');
    if (ruler) {
      ruler.onmousedown = (e) => {
        if (e.target.closest('#igt-timeline-trim-window')) return;
        e.stopPropagation();
        startScrubSession(e.clientX);
      };
    }

    const needleHead = needle.querySelector('.igt-needle-head');
    if (needleHead) {
      needleHead.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        startScrubSession(e.clientX);
      };
    };

    // Kéo trượt Khung Cắt Template Video (15s, 30s, 60s)
    const trimWindow = lanesArea.querySelector('#igt-timeline-trim-window');
    if (trimWindow) {
      trimWindow.onmousedown = (e) => {
        const handleType = e.target.getAttribute('data-trim-handle');
        e.stopPropagation();

        const totalDur = getTotalTimelineDuration();
        const vDur = studioState.videoDuration || totalDur;
        const rect = lanesInner.getBoundingClientRect();
        const startClientX = e.clientX;
        const initialStart = studioState.trimStart || 0;
        const initialEnd = studioState.trimEnd || (studioState.videoDuration || 15);
        const fixedDuration = initialEnd - initialStart; // Giữ nguyên độ dài thiết lập (15s, 30s...)

        trimWindow.classList.add('dragging');

        const onTrimMove = (ev) => {
          const dx = ev.clientX - startClientX;
          const dt = (dx / rect.width) * totalDur;

          if (handleType === 'start') {
            const newStart = Math.max(0, Math.min(initialEnd - 0.5, initialStart + dt));
            studioState.trimStart = newStart;
            studioState.trimPreset = 'custom';
          } else if (handleType === 'end') {
            const newEnd = Math.min(vDur, Math.max(initialStart + 0.5, initialEnd + dt));
            studioState.trimEnd = newEnd;
            studioState.trimPreset = 'custom';
          } else {
            // Kéo di chuyển toàn bộ vùng 15s/30s... nhưng giữ đúng thời gian đã thiết lập!
            let newStart = initialStart + dt;
            newStart = Math.max(0, Math.min(vDur - fixedDuration, newStart));
            const newEnd = newStart + fixedDuration;
            studioState.trimStart = newStart;
            studioState.trimEnd = newEnd;
          }

          const lPct = (studioState.trimStart / totalDur) * 100;
          const wPct = ((studioState.trimEnd - studioState.trimStart) / totalDur) * 100;
          trimWindow.style.left = lPct + '%';
          trimWindow.style.width = wPct + '%';

          const video = document.getElementById('igt-studio-active-media');
          if (video) {
            video.currentTime = studioState.trimStart;
            studioState.currentTime = studioState.trimStart;
            updateTimelineNeedle();
            checkAndApplyLiveTransition(studioState.currentTime);
          }

          const inStart = document.getElementById('igt-clip-start-input');
          const inEnd = document.getElementById('igt-clip-end-input');
          if (inStart) inStart.value = formatTime(studioState.trimStart);
          if (inEnd) inEnd.value = formatTime(studioState.trimEnd);

          const badge = trimWindow.querySelector('.igt-trim-window-badge span');
          if (badge && handleType) {
            badge.innerText = `⏱ ${Math.round(studioState.trimEnd - studioState.trimStart)}s`;
          }
        };

        const onTrimUp = () => {
          trimWindow.classList.remove('dragging');
          window.removeEventListener('mousemove', onTrimMove);
          window.removeEventListener('mouseup', onTrimUp);

          const curItem = studioState.mediaList[studioState.activeMediaIndex];
          if (curItem) {
            curItem.trimStart = studioState.trimStart;
            curItem.trimEnd = studioState.trimEnd;
            curItem.trimPreset = studioState.trimPreset;
          }

          takeSnapshot(`Di chuyển vùng chia video (${formatTime(studioState.trimStart)} - ${formatTime(studioState.trimEnd)})`);
          renderTimeline();
          if (studioState.activeTab === 'main') renderTabContent('main');
        };

        window.addEventListener('mousemove', onTrimMove);
        window.addEventListener('mouseup', onTrimUp);
      };
    }

    // Kéo handle cắt đoạn Clip (CapCut style) - Tối ưu mượt mà, độ nhạy cao & hỗ trợ kéo dài/thu ngắn
    lanesArea.querySelectorAll('.igt-timeline-handle[data-handle^="clip-"]').forEach(handle => {
      handle.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const type = handle.getAttribute('data-handle');
        const clipId = handle.getAttribute('data-clip-id');
        const clip = (studioState.videoClips || []).find(c => c.id === clipId);
        if (!clip) return;

        const clipIdx = (studioState.videoClips || []).indexOf(clip);
        const rect = lanesInner.getBoundingClientRect();
        const totalDur = getTotalTimelineDuration();
        const vDur = studioState.videoDuration || clip.end || 15;
        const speed = clip.speed || 1;
        const startClientX = e.clientX;
        const initialStart = clip.start;
        const initialEnd = clip.end;

        const clipBox = handle.closest('.igt-media-clip-box');
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';

        const onHandleMove = (ev) => {
          const dx = ev.clientX - startClientX;
          const dtTimeline = (dx / rect.width) * totalDur;
          const dVideo = dtTimeline * speed;

          if (type === 'clip-start') {
            // Kéo mốc bắt đầu: Kéo trái (dVideo < 0) -> mở rộng clip về trước; Kéo phải (dVideo > 0) -> thu ngắn clip
            const newStart = Math.max(0, Math.min(initialEnd - 0.2, initialStart + dVideo));
            clip.start = Math.round(newStart * 100) / 100;

            const video = document.getElementById('igt-studio-active-media');
            if (video) video.currentTime = clip.start;
          } else {
            // Kéo mốc kết thúc: Kéo phải (dVideo > 0) -> mở rộng clip về sau; Kéo trái (dVideo < 0) -> thu ngắn clip
            const newEnd = Math.max(clip.start + 0.2, Math.min(vDur, initialEnd + dVideo));
            clip.end = Math.round(newEnd * 100) / 100;
          }

          if (clipIdx === 0 || studioState.videoClips.length === 1) {
            studioState.trimStart = clip.start;
            studioState.trimEnd = clip.end;
            studioState.trimPreset = 'custom';
            const curItem = studioState.mediaList[studioState.activeMediaIndex];
            if (curItem) {
              curItem.trimStart = clip.start;
              curItem.trimEnd = clip.end;
              curItem.trimPreset = 'custom';
            }
          }

          // Cập nhật giao diện trực tiếp (Real-time 60fps DOM update không giật lag)
          if (clipBox) {
            const isSingleVideo = (!studioState.isSequenceMode && studioState.videoClips.length <= 1);
            let accLeft = 0;
            for (let i = 0; i < clipIdx; i++) {
              const prev = studioState.videoClips[i];
              accLeft += (prev.end - prev.start) / (prev.speed || 1);
            }
            const curDur = (clip.end - clip.start) / speed;
            const lPct = isSingleVideo ? (((clip.start || 0) / totalDur) * 100) : ((accLeft / totalDur) * 100);
            const wPct = (curDur / totalDur) * 100;
            clipBox.style.left = lPct + '%';
            clipBox.style.width = wPct + '%';
            const durEl = clipBox.querySelector('.igt-media-clip-dur');
            if (durEl) durEl.textContent = formatTime(curDur);

            const tailAddBtn = clipBox.parentElement ? clipBox.parentElement.querySelector(`.igt-timeline-tail-add-btn[data-after-clip-id="${clip.id}"]`) : null;
            if (tailAddBtn) tailAddBtn.style.left = `calc(${lPct + wPct}% + 6px)`;
          }

          const timeDisplay = document.getElementById('igt-timeline-time-display');
          if (timeDisplay) timeDisplay.textContent = `${formatTime(clip.start)} / ${formatTime(clip.end - clip.start)}`;

          const inStart = document.getElementById('igt-clip-start-input');
          const inEnd = document.getElementById('igt-clip-end-input');
          if (inStart) inStart.value = formatTime(clip.start);
          if (inEnd) inEnd.value = formatTime(clip.end);
        };

        const onHandleUp = () => {
          handle.classList.remove('dragging');
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          window.removeEventListener('mousemove', onHandleMove);
          window.removeEventListener('mouseup', onHandleUp);

          takeSnapshot(`Chia xén đoạn video (${formatTime(clip.start)} - ${formatTime(clip.end)})`);
          renderTimeline();
          if (studioState.activeTab === 'main') renderTabContent('main');
        };

        window.addEventListener('mousemove', onHandleMove);
        window.addEventListener('mouseup', onHandleUp);
      };
    });

    // Kéo handle cắt đoạn Audio Clip (aclip-start, aclip-end) - Tối ưu kéo dài/thu ngắn & offset
    lanesArea.querySelectorAll('.igt-timeline-handle[data-handle^="aclip-"]').forEach(handle => {
      handle.onmousedown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const type = handle.getAttribute('data-handle');
        const aclipId = handle.getAttribute('data-clip-id') || handle.getAttribute('data-aclip-id');
        const clip = (studioState.audioClips || []).find(c => c.id === aclipId);
        if (!clip) return;

        setActiveTimelineTrack('audio');
        studioState.selectedAudioClipId = aclipId;

        const rect = lanesInner.getBoundingClientRect();
        const totalDur = getTotalTimelineDuration();
        const audioDur = studioState.audioDuration || (clip.end > 0 ? clip.end : 60);
        const startClientX = e.clientX;
        const initialStart = clip.start || 0;
        const initialEnd = clip.end || (clip.start + 30);
        const initialOffset = clip.offset || 0;

        const capsule = handle.closest('.igt-audio-clip-capsule');
        handle.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';

        const onHandleMove = (ev) => {
          const dx = ev.clientX - startClientX;
          const dt = (dx / rect.width) * totalDur;

          if (type === 'aclip-start') {
            // Kéo mốc đầu bài hát: Kéo sang trái (dt < 0) -> lấy nhạc sớm hơn; Kéo sang phải (dt > 0) -> cắt bỏ đoạn đầu
            const newStart = Math.max(0, Math.min(initialEnd - 0.2, initialStart + dt));
            const deltaStart = newStart - initialStart;
            clip.start = Math.round(newStart * 100) / 100;
            clip.offset = Math.max(0, Math.round((initialOffset + deltaStart) * 100) / 100);
          } else {
            // Kéo mốc kết thúc bài hát: Kéo sang phải (dt > 0) -> kéo dài thời lượng; Kéo sang trái (dt < 0) -> thu ngắn
            const newEnd = Math.max(clip.start + 0.2, Math.min(audioDur, initialEnd + dt));
            clip.end = Math.round(newEnd * 100) / 100;
          }

          studioState.audioStart = clip.start;
          studioState.audioEnd = clip.end;
          studioState.audioOffset = clip.offset;

          // Cập nhật trực tiếp lên capsule audio (60fps mượt mà)
          if (capsule) {
            const clipDur = Math.max(0.2, clip.end - clip.start);
            capsule.style.left = (clip.offset / totalDur * 100) + '%';
            capsule.style.width = (clipDur / totalDur * 100) + '%';
            const durEl = capsule.querySelector('.igt-audio-pill-dur');
            if (durEl) durEl.textContent = formatTime(clipDur);
          }

          const timeDisplay = document.getElementById('igt-timeline-time-display');
          if (timeDisplay) timeDisplay.textContent = `${formatTime(clip.offset)} / ${formatTime(clip.end - clip.start)}`;
        };

        const onHandleUp = () => {
          handle.classList.remove('dragging');
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          window.removeEventListener('mousemove', onHandleMove);
          window.removeEventListener('mouseup', onHandleUp);

          takeSnapshot(`Chia xén đoạn nhạc (${formatTime(clip.start)} - ${formatTime(clip.end)})`);
          renderTimeline();
          if (studioState.activeTab === 'music') renderTabContent('music');
        };

        window.addEventListener('mousemove', onHandleMove);
        window.addEventListener('mouseup', onHandleUp);
      };
    });

    // Dịch chuyển Audio Capsule Offset của từng đoạn nhạc
    lanesArea.querySelectorAll('.igt-audio-clip-capsule').forEach(audioCapsule => {
      audioCapsule.onmousedown = (e) => {
        if (e.target.closest('.igt-timeline-handle')) return;
        e.stopPropagation();
        e.preventDefault();
        const aclipId = audioCapsule.getAttribute('data-aclip-id');
        const clip = (studioState.audioClips || []).find(c => c.id === aclipId);
        if (!clip) return;

        setActiveTimelineTrack('audio');
        studioState.selectedAudioClipId = aclipId;

        const startClientX = e.clientX;
        const startOffset = clip.offset || 0;
        const rect = lanesInner.getBoundingClientRect();
        const totalDur = getTotalTimelineDuration();
        const clipDur = clip.end - clip.start;

        audioCapsule.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grab';

        const onOffsetMove = (ev) => {
          const dx = ev.clientX - startClientX;
          const dt = (dx / rect.width) * totalDur;
          clip.offset = Math.max(0, Math.min(totalDur - clipDur, startOffset + dt));
          studioState.audioOffset = clip.offset;

          audioCapsule.style.left = (clip.offset / totalDur * 100) + '%';
          const timeDisplay = document.getElementById('igt-timeline-time-display');
          if (timeDisplay) timeDisplay.textContent = `${formatTime(clip.offset)} / ${formatTime(clipDur)}`;
        };

        const onOffsetUp = () => {
          audioCapsule.classList.remove('dragging');
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          window.removeEventListener('mousemove', onOffsetMove);
          window.removeEventListener('mouseup', onOffsetUp);

          takeSnapshot(`Di chuyển vị trí đoạn nhạc (${formatTime(clip.offset)})`);
          renderTimeline();
        };

        window.addEventListener('mousemove', onOffsetMove);
        window.addEventListener('mouseup', onOffsetUp);
      };
    });
  }

  function loadAudioFile(file, customName) {
    if (!file) return;

    if (studioState.audioUrl && studioState.audioUrl.startsWith('blob:') && studioState.audioUrl !== file) {
      try { URL.revokeObjectURL(studioState.audioUrl); } catch (_) {}
    }

    if (typeof file === 'string') {
      studioState.audioFile = null;
      studioState.audioName = customName || 'Instagram Audio.mp3';
      studioState.audioUrl = file;
    } else {
      studioState.audioFile = file;
      studioState.audioName = customName || file.name || 'audio.mp3';
      studioState.audioUrl = URL.createObjectURL(file);
    }

    // 1. Khởi tạo dữ liệu Audio Track và render Timeline NGAY LẬP TỨC để người dùng thấy ngay trên khay video
    const initDur = (studioState.audioDuration && studioState.audioDuration > 0) ? studioState.audioDuration : 30;
    studioState.audioDuration = initDur;
    studioState.audioStart = studioState.audioStart || 0;
    studioState.audioEnd = (studioState.mode === 'story' && studioState.imageDuration) ? Math.min(initDur, studioState.imageDuration) : initDur;
    studioState.audioOffset = 0;
    const aclipId = 'aclip_' + Date.now();
    studioState.audioClips = [{
      id: aclipId,
      name: studioState.audioName,
      start: studioState.audioStart || 0,
      end: studioState.audioEnd,
      offset: 0
    }];
    studioState.selectedAudioClipId = aclipId;
    studioState.activeTimelineTrack = 'audio';

    renderTimeline();
    updateActiveTrackUI();
    if (studioState.activeTab === 'music') renderTabContent('music');

    // 2. Nạp thẻ Audio ngầm để đồng bộ thời lượng chuẩn và hỗ trợ phát realtime
    if (!studioState.audioElement) {
      studioState.audioElement = new Audio();
    }
    const audio = studioState.audioElement;

    const setupAudioListeners = (targetAudioUrl) => {
      audio.src = targetAudioUrl;
      audio.volume = studioState.audioVolume || 0.8;

      const onMeta = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
          studioState.audioDuration = Math.round(audio.duration * 10) / 10;
          studioState.audioEnd = (studioState.mode === 'story' && studioState.imageDuration) ? Math.min(studioState.audioDuration, studioState.imageDuration) : studioState.audioDuration;
          if (studioState.audioClips && studioState.audioClips[0]) {
            studioState.audioClips[0].end = studioState.audioDuration;
          }
          renderTimeline();
          updateTimelineNeedle();
        }
      };

      audio.addEventListener('loadedmetadata', onMeta, { once: true });
      audio.addEventListener('canplay', onMeta, { once: true });
      audio.addEventListener('error', () => {
        // Tự động bypass CSP bằng proxy background nếu gặp lỗi kết nối
        if (typeof file === 'string' && file.startsWith('http') && targetAudioUrl !== studioAudioProxyCache.get(file)) {
          getSafePlayableAudio(file).then(safeUrl => {
            if (safeUrl && safeUrl !== targetAudioUrl) {
              studioState.audioUrl = safeUrl;
              setupAudioListeners(safeUrl);
            }
          }).catch(() => {});
        } else {
          renderTimeline();
        }
      }, { once: true });
    };

    // Nếu là URL http bên ngoài (iTunes / CDN khác), tự động nạp qua Safe Blob URL để bypass 100% CSP của Instagram
    if (typeof file === 'string' && file.startsWith('http')) {
      getSafePlayableAudio(file).then(safeUrl => {
        if (safeUrl) {
          studioState.audioUrl = safeUrl;
          setupAudioListeners(safeUrl);
        } else {
          setupAudioListeners(file);
        }
      }).catch(() => {
        setupAudioListeners(file);
      });
    } else {
      setupAudioListeners(studioState.audioUrl);
    }

    takeSnapshot('Thêm nhạc nền');
  }

  function playAudioPreset(presetKey) {
    const titles = {
      trending: '🔥 Trending Beat (Remix Hot Reels).mp3',
      lofi: '☕ Chill Lofi Coffee Morning.mp3',
      summer: '✨ Aesthetic Summer Vibe.mp3',
      energy: '⚡ Upbeat Energy Pop.mp3'
    };
    const title = titles[presetKey] || 'preset_audio.mp3';
    const blob = generatePresetAudio(presetKey);
    if (blob) {
      loadAudioFile(blob, title);
    }
  }

  function generatePresetAudio(type) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const duration = (type === 'lofi') ? 45 : 30;
      const sampleRate = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(2, sampleRate * duration, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      const bpm = (type === 'trending') ? 128 : (type === 'lofi' ? 75 : 120);
      const beatLen = 60 / bpm;

      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        const beat = (t % beatLen) / beatLen;
        const kick = (beat < 0.15) ? Math.sin((1 - beat / 0.15) * 150) * Math.exp(-beat * 25) : 0;
        const snare = ((t % (beatLen * 2)) > beatLen && beat < 0.18) ? (Math.random() * 2 - 1) * Math.exp(-beat * 20) : 0;
        const noteFreq = (type === 'lofi') ? 220 + Math.sin(t * 0.5) * 55 : 330 + Math.sin(t * 1.5) * 110;
        const synth = Math.sin(t * noteFreq * 2 * Math.PI) * 0.12 * Math.exp(-((t % (beatLen * 0.5)) / (beatLen * 0.5)) * 4);

        left[i] = (kick * 0.4 + snare * 0.2 + synth) * 0.7;
        right[i] = (kick * 0.4 + snare * 0.2 + synth * 0.9) * 0.7;
      }

      return audioBufferToWavBlob(buffer);
    } catch (err) {
      console.warn('[Studio] Generate preset audio error:', err);
      return null;
    }
  }

  function audioBufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const length = buffer.length;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
  }

  function getMyUserId() {
    return getCookie('ds_user_id') || '';
  }

  let cachedUserFriends = [];
  let friendsFetchPromise = null;

  // Lấy và lưu cache danh sách Bạn bè thật của chính tài khoản đang đăng nhập
  async function loadUserFriends(forceRefresh = false) {
    if (cachedUserFriends && cachedUserFriends.length > 0 && !forceRefresh) {
      return cachedUserFriends;
    }
    if (friendsFetchPromise) return friendsFetchPromise;

    friendsFetchPromise = (async () => {
      const friendsMap = new Map();

      const addFriend = (item) => {
        if (!item) return;
        const uname = (item.username || '').trim();
        if (!uname) return;
        const key = uname.toLowerCase();
        if (!friendsMap.has(key)) {
          friendsMap.set(key, {
            id: String(item.id || item.pk || item.userId || ''),
            username: uname,
            fullName: item.fullName || item.full_name || uname,
            avatarUrl: item.avatarUrl || item.profile_pic_url || '',
            isVerified: Boolean(item.isVerified || item.is_verified)
          });
        } else {
          const existing = friendsMap.get(key);
          if (!existing.avatarUrl && (item.avatarUrl || item.profile_pic_url)) {
            existing.avatarUrl = item.avatarUrl || item.profile_pic_url;
          }
          if (existing.fullName === existing.username && (item.fullName || item.full_name)) {
            existing.fullName = item.fullName || item.full_name;
          }
          if (!existing.isVerified && (item.isVerified || item.is_verified)) {
            existing.isVerified = true;
          }
        }
      };

      // 1. Quét từ IndexedDB InstaTweaksDB (Watchlist & Snapshots của bạn bè đã lưu)
      try {
        const idbReq = indexedDB.open('InstaTweaksDB');
        await new Promise((resolve) => {
          idbReq.onsuccess = (e) => {
            const db = e.target.result;
            const storesToRead = [];
            if (db.objectStoreNames.contains('watchlist')) storesToRead.push('watchlist');
            if (db.objectStoreNames.contains('snapshots')) storesToRead.push('snapshots');

            if (storesToRead.length === 0) return resolve();

            try {
              const tx = db.transaction(storesToRead, 'readonly');
              let pending = storesToRead.length;

              if (storesToRead.includes('watchlist')) {
                const wReq = tx.objectStore('watchlist').getAll();
                wReq.onsuccess = () => {
                  (wReq.result || []).forEach(w => addFriend(w));
                  pending--;
                  if (pending === 0) resolve();
                };
                wReq.onerror = () => { pending--; if (pending === 0) resolve(); };
              }

              if (storesToRead.includes('snapshots')) {
                const sReq = tx.objectStore('snapshots').getAll();
                sReq.onsuccess = () => {
                  (sReq.result || []).forEach(snap => {
                    (snap.items || []).forEach(it => addFriend(it));
                  });
                  pending--;
                  if (pending === 0) resolve();
                };
                sReq.onerror = () => { pending--; if (pending === 0) resolve(); };
              }
            } catch (_) { resolve(); }
          };
          idbReq.onerror = () => resolve();
        });
      } catch (err) {
        console.warn('[Studio] IDB read friends error:', err);
      }

      // 2. Lấy danh sách Following trực tiếp từ API Instagram của chính chủ tài khoản
      const myUid = getMyUserId();
      const csrf = getCookie('csrftoken') || '';
      if (myUid) {
        try {
          const res = await fetch(`https://www.instagram.com/api/v1/friendships/${myUid}/following/?count=200`, {
            headers: {
              'X-CSRFToken': csrf,
              'X-IG-App-ID': '936619743392459',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
          });
          if (res.ok) {
            const data = await res.json();
            (data.users || []).forEach(u => addFriend(u));
          }
        } catch (err) {
          console.warn('[Studio] Fetch following API error:', err);
        }

        // Thử lấy thêm bạn bè từ autocomplete_user_list của Instagram
        try {
          const resRanked = await fetch(`https://www.instagram.com/api/v1/friendships/autocomplete_user_list/?version=2`, {
            headers: {
              'X-CSRFToken': csrf,
              'X-IG-App-ID': '936619743392459',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
          });
          if (resRanked.ok) {
            const dataRanked = await resRanked.json();
            (dataRanked.users || []).forEach(u => addFriend(u));
          }
        } catch (_) { }
      }

      // 3. Quét nhanh từ DOM hiện tại (thanh story tray / feed links)
      try {
        const storyLinks = document.querySelectorAll('header a[href^="/"], [role="menu"] a[href^="/"], a[href*="/stories/"]');
        storyLinks.forEach(a => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/^\/([a-zA-Z0-9._]+)\/?$/) || href.match(/\/stories\/([a-zA-Z0-9._]+)/);
          if (m && m[1] && !['explore', 'reels', 'direct', 'stories'].includes(m[1].toLowerCase())) {
            const img = a.querySelector('img');
            addFriend({
              username: m[1],
              fullName: m[1],
              avatarUrl: img ? img.src : ''
            });
          }
        });
      } catch (_) { }

      cachedUserFriends = Array.from(friendsMap.values());
      return cachedUserFriends;
    })();

    const result = await friendsFetchPromise;
    friendsFetchPromise = null;
    return result;
  }

  // Tìm kiếm bạn bè: TUYỆT ĐỐI CHỈ TÌM TRONG BẠN BÈ CỦA USER, KHÔNG GỢI Ý NGƯỜI LẠ/TOÀN CẦU
  async function searchUserFriends(query) {
    const allFriends = await loadUserFriends();
    if (!query || !query.trim()) {
      return allFriends.slice(0, 10);
    }
    const clean = (query.startsWith('@') ? query.slice(1) : query).trim().toLowerCase();
    if (!clean) return allFriends.slice(0, 10);

    let matched = allFriends.filter(u => {
      const uMatch = u.username && u.username.toLowerCase().includes(clean);
      const fMatch = u.fullName && u.fullName.toLowerCase().includes(clean);
      return uMatch || fMatch;
    });

    // Nếu bộ nhớ đệm chưa có kết quả khớp, gọi API tìm kiếm trong danh sách Following của chính user
    const myUid = getMyUserId();
    if (matched.length === 0 && myUid) {
      try {
        const csrf = getCookie('csrftoken') || '';
        const res = await fetch(`https://www.instagram.com/api/v1/friendships/${myUid}/following/?query=${encodeURIComponent(clean)}`, {
          headers: {
            'X-CSRFToken': csrf,
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          (data.users || []).forEach(u => {
            const friendObj = {
              id: String(u.pk || u.id || ''),
              username: u.username,
              fullName: u.full_name || u.username,
              avatarUrl: u.profile_pic_url || '',
              isVerified: Boolean(u.is_verified)
            };
            if (!cachedUserFriends.some(f => f.username.toLowerCase() === friendObj.username.toLowerCase())) {
              cachedUserFriends.push(friendObj);
            }
            matched.push(friendObj);
          });
        }
      } catch (_) { }
    }

    matched.sort((a, b) => {
      const aStarts = a.username.toLowerCase().startsWith(clean);
      const bStarts = b.username.toLowerCase().startsWith(clean);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    return matched;
  }

  const stickerDataUrlCache = new Map();

  function fetchStickerDataUrl(url, callback) {
    if (!url) {
      if (callback) callback(null);
      return;
    }
    if (stickerDataUrlCache.has(url)) {
      if (callback) callback(stickerDataUrlCache.get(url));
      return;
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetch_image_as_data_url', url }, (res) => {
          if (res && res.success && res.dataUrl) {
            stickerDataUrlCache.set(url, res.dataUrl);
            if (callback) callback(res.dataUrl);
          } else {
            if (callback) callback(null);
          }
        });
      } else {
        if (callback) callback(null);
      }
    } catch (_) {
      if (callback) callback(null);
    }
  }

  const GOOGLE_NOTO_STICKERS = [
    // 1. Cảm xúc & Biểu tượng Hot (Hot 3D Animated GIFs)
    { id: 'g_fire', name: 'Lửa cháy', emoji: '🔥', hex: '1f525', category: 'hot' },
    { id: 'g_sparkles', name: 'Lấp lánh', emoji: '✨', hex: '2728', category: 'hot' },
    { id: 'g_heart_pulse', name: 'Tim đập', emoji: '💖', hex: '1f496', category: 'hot' },
    { id: 'g_heart_eyes', name: 'Mắt tim', emoji: '😍', hex: '1f60d', category: 'hot' },
    { id: 'g_party', name: 'Ăn mừng', emoji: '🥳', hex: '1f973', category: 'hot' },
    { id: 'g_joy', name: 'Cười khóc', emoji: '😂', hex: '1f602', category: 'hot' },
    { id: 'g_cool', name: 'Kính râm', emoji: '😎', hex: '1f60e', category: 'hot' },
    { id: 'g_starstruck', name: 'Mắt sao', emoji: '🤩', hex: '1f929', category: 'hot' },
    { id: 'g_mindblown', name: 'Nổ não', emoji: '🤯', hex: '1f92f', category: 'hot' },
    { id: 'g_melting', name: 'Tan chảy', emoji: '🫠', hex: '1fae0', category: 'hot' },
    { id: 'g_crying', name: 'Khóc to', emoji: '😭', hex: '1f62d', category: 'hot' },
    { id: 'g_thinking', name: 'Suy nghĩ', emoji: '🤔', hex: '1f914', category: 'hot' },
    { id: 'g_hearthands', name: 'Bắn tim', emoji: '🫶', hex: '1faf6', category: 'hot' },
    { id: 'g_hundred', name: '100 Điểm', emoji: '💯', hex: '1f4af', category: 'hot' },
    { id: 'g_lightning', name: 'Sét neon', emoji: '⚡', hex: '26a1', category: 'hot' },
    { id: 'g_star_glow', name: 'Sao băng', emoji: '🌟', hex: '1f31f', category: 'hot' },
    { id: 'g_boom', name: 'Nổ tung', emoji: '💥', hex: '1f4a5', category: 'hot' },
    { id: 'g_rocket', name: 'Tên lửa', emoji: '🚀', hex: '1f680', category: 'hot' },
    { id: 'g_crown', name: 'Vương miện', emoji: '👑', hex: '1f451', category: 'hot' },
    { id: 'g_diamond', name: 'Kim cương', emoji: '💎', hex: '1f48e', category: 'hot' },
    { id: 'g_rainbow', name: 'Cầu vồng', emoji: '🌈', hex: '1f308', category: 'hot' },
    { id: 'g_popper', name: 'Pháo hoa', emoji: '🎉', hex: '1f389', category: 'hot' },
    { id: 'g_magic', name: 'Đũa phép', emoji: '🪄', hex: '1fa84', category: 'hot' },
    { id: 'g_cash', name: 'Tiền bay', emoji: '💸', hex: '1f4b8', category: 'hot' },
    { id: 'g_cake', name: 'Bánh kem', emoji: '🎂', hex: '1f382', category: 'hot' },
    { id: 'g_champagne', name: 'Sâm panh', emoji: '🍾', hex: '1f37e', category: 'hot' },
    { id: 'g_notes', name: 'Nốt nhạc', emoji: '🎶', hex: '1f3b6', category: 'hot' },
    { id: 'g_bell', name: 'Chuông rung', emoji: '🔔', hex: '1f514', category: 'hot' },
    { id: 'g_clap', name: 'Vỗ tay', emoji: '👏', hex: '1f44f', category: 'hot' },
    { id: 'g_like', name: 'Ngón like', emoji: '👍', hex: '1f44d', category: 'hot' },
    { id: 'g_target', name: 'Trúng đích', emoji: '🎯', hex: '1f3af', category: 'hot' },
    { id: 'g_trophy', name: 'Cúp vàng', emoji: '🏆', hex: '1f3c6', category: 'hot' },
    { id: 'g_ghost', name: 'Con ma', emoji: '👻', hex: '1f47b', category: 'hot' },
    { id: 'g_alien', name: 'Alien', emoji: '👽', hex: '1f47d', category: 'hot' },
    { id: 'g_coffee', name: 'Cà phê', emoji: '☕', hex: '2615', category: 'hot' },
    { id: 'g_pizza', name: 'Pizza', emoji: '🍕', hex: '1f355', category: 'hot' },

    // 2. Động vật Động (Animals Animated GIFs)
    { id: 'g_cat', name: 'Mèo con', emoji: '🐱', hex: '1f431', category: 'animals' },
    { id: 'g_dog', name: 'Chó cưng', emoji: '🐕', hex: '1f415', category: 'animals' },
    { id: 'g_panda', name: 'Gấu trúc', emoji: '🐼', hex: '1f43c', category: 'animals' },
    { id: 'g_bear', name: 'Gấu nâu', emoji: '🐻', hex: '1f43b', category: 'animals' },
    { id: 'g_fox', name: 'Cáo cam', emoji: '🦊', hex: '1f98a', category: 'animals' },
    { id: 'g_rabbit', name: 'Thỏ trắng', emoji: '🐇', hex: '1f407', category: 'animals' },
    { id: 'g_lion', name: 'Sư tử', emoji: '🦁', hex: '1f981', category: 'animals' },
    { id: 'g_unicorn', name: 'Kỳ lân', emoji: '🦄', hex: '1f984', category: 'animals' },
    { id: 'g_butterfly', name: 'Bướm hoa', emoji: '🦋', hex: '1f98b', category: 'animals' },
    { id: 'g_penguin', name: 'Cánh cụt', emoji: '🐧', hex: '1f427', category: 'animals' },

    // 3. Biểu tượng & Đồ vật Hot (Trending & Objects)
    { id: 'g_eyes', name: 'Đôi mắt', emoji: '👀', hex: '1f440', category: 'hot' },
    { id: 'g_kiss', name: 'Hôn gió', emoji: '😘', hex: '1f618', category: 'hot' },
    { id: 'g_salute', name: 'Chào kính', emoji: '🫡', hex: '1fae1', category: 'hot' },
    { id: 'g_drool', name: 'Ngon miệng', emoji: '🤤', hex: '1f924', category: 'hot' },
    { id: 'g_shush', name: 'Bí mật', emoji: '🤫', hex: '1f92b', category: 'hot' },
    { id: 'g_cowboy', name: 'Cao bồi', emoji: '🤠', hex: '1f920', category: 'hot' },
    { id: 'g_fireworks', name: 'Pháo bông', emoji: '🎆', hex: '1f386', category: 'hot' },
    { id: 'g_beer', name: 'Cụng ly', emoji: '🍻', hex: '1f37b', category: 'hot' },
    { id: 'g_cocktail', name: 'Cocktail', emoji: '🍹', hex: '1f379', category: 'hot' },
    { id: 'g_camera', name: 'Máy ảnh', emoji: '📷', hex: '1f4f7', category: 'hot' },
    { id: 'g_clapper', name: 'Quay phim', emoji: '🎬', hex: '1f3ac', category: 'hot' },
    { id: 'g_guitar', name: 'Guitar', emoji: '🎸', hex: '1f3b8', category: 'hot' },
    { id: 'g_moneybag', name: 'Bao tiền', emoji: '💰', hex: '1f4b0', category: 'hot' },
    { id: 'g_rose', name: 'Hoa hồng', emoji: '🌹', hex: '1f339', category: 'hot' }
  ].map(s => ({
    ...s,
    url: `https://fonts.gstatic.com/s/e/notoemoji/latest/${s.hex}/512.gif`,
    isAnimated: true
  }));

  // ========================================================
  // Bộ xử lý trích xuất Tọa độ GPS & Gợi ý Vị trí từ Metadata File
  // ========================================================
  const KNOWN_LOCATIONS_DB = [
    { name: 'Hà Nội', sub: 'Thủ đô Hà Nội, Việt Nam', lat: 21.0285, lon: 105.8542, maxDist: 40 },
    { name: 'TP. Hồ Chí Minh', sub: 'Sài Gòn, Việt Nam', lat: 10.7769, lon: 106.7009, maxDist: 45 },
    { name: 'Đà Nẵng', sub: 'Thành phố Đà Nẵng, Việt Nam', lat: 16.0544, lon: 108.2022, maxDist: 35 },
    { name: 'Đà Lạt', sub: 'Lâm Đồng, Việt Nam', lat: 11.9404, lon: 108.4583, maxDist: 30 },
    { name: 'Nha Trang', sub: 'Khánh Hòa, Việt Nam', lat: 12.2388, lon: 109.1967, maxDist: 30 },
    { name: 'Hội An', sub: 'Quảng Nam, Việt Nam', lat: 15.8801, lon: 108.3380, maxDist: 20 },
    { name: 'Phú Quốc', sub: 'Kiên Giang, Việt Nam', lat: 10.2899, lon: 103.9840, maxDist: 35 },
    { name: 'Vũng Tàu', sub: 'Bà Rịa - Vũng Tàu, Việt Nam', lat: 10.3460, lon: 107.0843, maxDist: 25 },
    { name: 'Huế', sub: 'Thừa Thiên Huế, Việt Nam', lat: 16.4637, lon: 107.5909, maxDist: 30 },
    { name: 'Sa Pa', sub: 'Lào Cai, Việt Nam', lat: 22.3364, lon: 103.8438, maxDist: 25 },
    { name: 'Hạ Long', sub: 'Quảng Ninh, Việt Nam', lat: 20.9505, lon: 107.0734, maxDist: 30 },
    { name: 'Ninh Bình', sub: 'Tràng An, Việt Nam', lat: 20.2506, lon: 105.9745, maxDist: 25 },
    { name: 'Quy Nhơn', sub: 'Bình Định, Việt Nam', lat: 13.7830, lon: 109.2197, maxDist: 30 },
    { name: 'Phan Thiết', sub: 'Mũi Né, Bình Thuận, Việt Nam', lat: 10.9805, lon: 108.2615, maxDist: 30 },
    { name: 'Cần Thơ', sub: 'Tây Đô, Cần Thơ, Việt Nam', lat: 10.0452, lon: 105.7469, maxDist: 35 },
    { name: 'Hải Phòng', sub: 'Đất Cảng, Việt Nam', lat: 20.8449, lon: 106.6881, maxDist: 30 },
    { name: 'Buôn Ma Thuột', sub: 'Đắk Lắk, Việt Nam', lat: 12.6675, lon: 108.0383, maxDist: 30 },
    // Quốc tế
    { name: 'Bangkok', sub: 'Thailand', lat: 13.7563, lon: 100.5018, maxDist: 50 },
    { name: 'Singapore', sub: 'Singapore', lat: 1.3521, lon: 103.8198, maxDist: 35 },
    { name: 'Tokyo', sub: 'Japan', lat: 35.6762, lon: 139.6503, maxDist: 50 },
    { name: 'Seoul', sub: 'South Korea', lat: 37.5665, lon: 126.9780, maxDist: 50 },
    { name: 'Paris', sub: 'France', lat: 48.8566, lon: 2.3522, maxDist: 50 },
    { name: 'London', sub: 'United Kingdom', lat: 51.5074, lon: -0.1278, maxDist: 50 },
    { name: 'New York', sub: 'United States', lat: 40.7128, lon: -74.0060, maxDist: 50 }
  ];

  function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function resolveLocationFromCoords(lat, lon) {
    let closest = null;
    let minD = Infinity;

    for (const loc of KNOWN_LOCATIONS_DB) {
      const d = getDistanceKm(lat, lon, loc.lat, loc.lon);
      if (d < minD) {
        minD = d;
        closest = loc;
      }
    }

    if (closest && minD <= (closest.maxDist || 50)) {
      return {
        name: closest.name,
        sub: closest.sub + (minD > 2 ? ` (~${Math.round(minD)} km)` : ''),
        latitude: lat,
        longitude: lon,
        isExact: minD < 10
      };
    }

    return {
      name: `${lat >= 0 ? lat.toFixed(3) + '°B' : Math.abs(lat).toFixed(3) + '°N'}, ${lon >= 0 ? lon.toFixed(3) + '°Đ' : Math.abs(lon).toFixed(3) + '°T'}`,
      sub: `Tọa độ GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      latitude: lat,
      longitude: lon,
      isExact: true
    };
  }

  async function extractGPSFromImageFile(file) {
    if (!file) return null;
    try {
      const sliceSize = Math.min(file.size, 131072);
      const buffer = await file.slice(0, sliceSize).arrayBuffer();
      const view = new DataView(buffer);

      if (view.getUint16(0, false) !== 0xFFD8) {
        return null;
      }

      let offset = 2;
      const len = view.byteLength;

      while (offset < len - 4) {
        const marker = view.getUint16(offset, false);
        offset += 2;

        if (marker === 0xFFE1) {
          offset += 2;
          if (view.getUint32(offset, false) === 0x45786966 && view.getUint16(offset + 4, false) === 0x0000) {
            const tiffOffset = offset + 6;
            const endian = view.getUint16(tiffOffset, false);
            const little = endian === 0x4949;

            if (endian !== 0x4949 && endian !== 0x4D4D) return null;
            if (view.getUint16(tiffOffset + 2, little) !== 0x002A) return null;

            const ifd0Offset = view.getUint32(tiffOffset + 4, little);
            let curOffset = tiffOffset + ifd0Offset;

            if (curOffset >= len - 2) return null;
            const numEntries = view.getUint16(curOffset, little);
            curOffset += 2;

            let gpsOffset = 0;
            for (let i = 0; i < numEntries; i++) {
              if (curOffset + 12 > len) break;
              const tag = view.getUint16(curOffset, little);
              if (tag === 0x8825) {
                gpsOffset = tiffOffset + view.getUint32(curOffset + 8, little);
                break;
              }
              curOffset += 12;
            }

            if (gpsOffset > 0 && gpsOffset < len - 2) {
              const numGpsTags = view.getUint16(gpsOffset, little);
              let gpsTagOffset = gpsOffset + 2;

              let latRef = 'N', lonRef = 'E';
              let latVal = null, lonVal = null;

              for (let i = 0; i < numGpsTags; i++) {
                if (gpsTagOffset + 12 > len) break;
                const tag = view.getUint16(gpsTagOffset, little);
                const valOffset = tiffOffset + view.getUint32(gpsTagOffset + 8, little);

                if (tag === 0x0001) {
                  latRef = String.fromCharCode(view.getUint8(gpsTagOffset + 8));
                } else if (tag === 0x0002) {
                  if (valOffset + 24 <= len) {
                    const dNum = view.getUint32(valOffset, little), dDen = view.getUint32(valOffset + 4, little);
                    const mNum = view.getUint32(valOffset + 8, little), mDen = view.getUint32(valOffset + 12, little);
                    const sNum = view.getUint32(valOffset + 16, little), sDen = view.getUint32(valOffset + 20, little);
                    const deg = dDen ? dNum / dDen : 0;
                    const min = mDen ? mNum / mDen : 0;
                    const sec = sDen ? sNum / sDen : 0;
                    latVal = deg + min / 60 + sec / 3600;
                  }
                } else if (tag === 0x0003) {
                  lonRef = String.fromCharCode(view.getUint8(gpsTagOffset + 8));
                } else if (tag === 0x0004) {
                  if (valOffset + 24 <= len) {
                    const dNum = view.getUint32(valOffset, little), dDen = view.getUint32(valOffset + 4, little);
                    const mNum = view.getUint32(valOffset + 8, little), mDen = view.getUint32(valOffset + 12, little);
                    const sNum = view.getUint32(valOffset + 16, little), sDen = view.getUint32(valOffset + 20, little);
                    const deg = dDen ? dNum / dDen : 0;
                    const min = mDen ? mNum / mDen : 0;
                    const sec = sDen ? sNum / sDen : 0;
                    lonVal = deg + min / 60 + sec / 3600;
                  }
                }
                gpsTagOffset += 12;
              }

              if (latVal !== null && lonVal !== null) {
                if (latRef === 'S') latVal = -latVal;
                if (lonRef === 'W') lonVal = -lonVal;
                return { latitude: latVal, longitude: lonVal, source: 'EXIF' };
              }
            }
          }
          break;
        } else if ((marker & 0xFF00) === 0xFF00) {
          if (marker === 0xFFDA || marker === 0xFFD9) break;
          const markerLen = view.getUint16(offset, false);
          offset += markerLen;
        } else {
          break;
        }
      }
    } catch (e) {
      console.warn('[InstaTweaks Studio] Lỗi đọc EXIF ảnh:', e);
    }
    return null;
  }

  async function extractGPSFromVideoFile(file) {
    if (!file) return null;
    try {
      const headSize = Math.min(file.size, 262144);
      const headBuffer = await file.slice(0, headSize).arrayBuffer();
      let text = new TextDecoder('latin1').decode(headBuffer);

      const isoRegex = /([+-]\d{2}(?:\.\d+)?)([+-]\d{3}(?:\.\d+)?)(?:\/|\+)/;
      let match = text.match(isoRegex);

      if (!match && file.size > 262144) {
        const tailOffset = Math.max(0, file.size - 262144);
        const tailBuffer = await file.slice(tailOffset).arrayBuffer();
        text = new TextDecoder('latin1').decode(tailBuffer);
        match = text.match(isoRegex);
      }

      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0)) {
          return { latitude: lat, longitude: lon, source: 'ISO-6709' };
        }
      }
    } catch (e) {
      console.warn('[InstaTweaks Studio] Lỗi đọc metadata video:', e);
    }
    return null;
  }

  async function extractLocationFromFile(file) {
    if (!file) return null;
    let gps = null;
    if (file.type.startsWith('image/')) {
      gps = await extractGPSFromImageFile(file);
    } else if (file.type.startsWith('video/')) {
      gps = await extractGPSFromVideoFile(file);
    }

    if (gps && gps.latitude && gps.longitude) {
      const resolved = resolveLocationFromCoords(gps.latitude, gps.longitude);
      resolved.source = gps.source;

      try {
        const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${gps.latitude}&lon=${gps.longitude}&zoom=14&addressdetails=1`;
        const res = await fetch(osmUrl, { headers: { 'Accept': 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          if (data && data.address) {
            const addr = data.address;
            const placeName = addr.tourism || addr.historic || addr.city || addr.town || addr.district || addr.county || resolved.name;
            const subName = [addr.suburb || addr.ward, addr.city || addr.state, addr.country].filter(Boolean).join(', ');
            return {
              name: placeName,
              sub: subName,
              latitude: gps.latitude,
              longitude: gps.longitude,
              source: 'GPS EXIF & Bản đồ'
            };
          }
        }
      } catch (_) { }

      return resolved;
    }
    return null;
  }

  function renderGeneralTabContent(container) {
    if (!container) return;
    const count = studioState.mediaList ? studioState.mediaList.length : 0;

    container.innerHTML = `
      <div class="igt-studio-setting-group">
        <div class="igt-studio-setting-title" style="display: flex; align-items: center; justify-content: space-between;">
          <span>⚙️ Cài đặt chung Album Bài viết</span>
          <span style="font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 7px; border-radius: 6px;">${count}/20 tệp</span>
        </div>


        <!-- 1. Nút Sắp xếp thứ tự các slide -->
        <button type="button" id="igt-btn-open-reorder-modal" class="igt-general-action-btn" style="margin-bottom: 8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>
          <span>Sắp xếp thứ tự các slide (${count} tệp)</span>
        </button>
      </div>

      <!-- 3. Căn chỉnh kích thước hàng loạt (Bulk Fit Mode) -->
      <div class="igt-studio-setting-group">
        <div class="igt-studio-setting-title">✨ Căn chỉnh kích thước hàng loạt</div>
        <div class="igt-studio-fit-options">
          <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'blur_fit' ? 'active' : ''}" data-global-fit="blur_fit">
            ✨ Giữ trọn ảnh + Nền mờ (Blur Fit)
          </button>
          <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'cover' ? 'active' : ''}" data-global-fit="cover">
            📐 Cắt vừa kín khung (Cover)
          </button>
          <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'contain' ? 'active' : ''}" data-global-fit="contain">
            🖼️ Giữ nguyên tỉ lệ gốc (Nền tối)
          </button>
        </div>
      </div>

      <!-- 4. Bộ lọc màu đồng bộ toàn album -->
      <div class="igt-studio-setting-group">
        <div class="igt-studio-setting-title">🎨 Bộ lọc màu đồng bộ (Toàn bộ slide)</div>
        <div class="igt-filter-chips">
          <button type="button" class="igt-filter-chip ${(!studioState.globalFilter || studioState.globalFilter === 'none') ? 'active' : ''}" data-global-filter="none">Mặc định</button>
          <button type="button" class="igt-filter-chip ${studioState.globalFilter === 'warm' ? 'active' : ''}" data-global-filter="warm">☀️ Ấm áp</button>
          <button type="button" class="igt-filter-chip ${studioState.globalFilter === 'vintage' ? 'active' : ''}" data-global-filter="vintage">🎞️ Vintage</button>
          <button type="button" class="igt-filter-chip ${studioState.globalFilter === 'film' ? 'active' : ''}" data-global-filter="film">📷 Film 35mm</button>
          <button type="button" class="igt-filter-chip ${studioState.globalFilter === 'bw' ? 'active' : ''}" data-global-filter="bw">🖤 Trắng đen</button>
          <button type="button" class="igt-filter-chip ${studioState.globalFilter === 'cool' ? 'active' : ''}" data-global-filter="cool">❄️ Lạnh</button>
        </div>
      </div>

      <!-- 5. Đóng dấu bản quyền chung (Brand Watermark) gom thành 1 Group hoàn chỉnh -->
      <div class="igt-studio-setting-group igt-watermark-card-group">
        <div class="igt-studio-setting-title">
          🏷️ Đóng dấu bản quyền (Watermark) toàn album
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 5px;">Chữ ký / Tên bản quyền:</label>
          <input type="text" id="igt-global-watermark-text" class="igt-studio-input" placeholder="Ví dụ: @khoa hoặc Shop của bạn..." value="${escapeHtml(studioState.globalWatermarkText || '')}" style="width: 100%; box-sizing: border-box;" />
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 5px;">Kiểu font chữ ký:</label>
          <select id="igt-global-watermark-font" class="igt-studio-select" style="width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; background: #0f172a; color: #f1f5f9; border: 1px solid rgba(255,255,255,0.18); font-size: 11.5px; font-weight: 600; cursor: pointer;">
            <option value="default" ${(!studioState.globalWatermarkFont || studioState.globalWatermarkFont === 'default') ? 'selected' : ''}>🔤 Hiện đại (Modern Sans-Serif)</option>
            <option value="signature" ${studioState.globalWatermarkFont === 'signature' ? 'selected' : ''}>✍️ Chữ ký viết tay (Signature Script)</option>
            <option value="serif" ${studioState.globalWatermarkFont === 'serif' ? 'selected' : ''}>📜 Cổ điển thanh lịch (Classic Serif)</option>
            <option value="typewriter" ${studioState.globalWatermarkFont === 'typewriter' ? 'selected' : ''}>⌨️ Máy đánh chữ (Typewriter / Mono)</option>
            <option value="impact" ${studioState.globalWatermarkFont === 'impact' ? 'selected' : ''}>💥 Đậm cá tính (Bold Impact)</option>
          </select>
        </div>

        <!-- Thêm màu cho chữ ký bản quyền -->
        <div style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Màu sắc chữ ký:</label>
            <div style="display: flex; align-items: center; gap: 6px;">
              <input type="color" id="igt-global-watermark-color-picker" value="${studioState.globalWatermarkColor || '#ffffff'}" style="width: 22px; height: 22px; padding: 0; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; background: transparent; cursor: pointer;" title="Tùy chọn màu tùy ý" />
              <span id="igt-global-watermark-color-hex" style="font-size: 10px; color: #94a3b8; font-family: monospace;">${studioState.globalWatermarkColor || '#ffffff'}</span>
            </div>
          </div>
          <div style="display: flex; gap: 7px; flex-wrap: wrap;">
            ${[
              { color: '#ffffff', label: 'Trắng' },
              { color: '#000000', label: 'Đen' },
              { color: '#fbbf24', label: 'Vàng kim' },
              { color: '#ec4899', label: 'Hồng neon' },
              { color: '#38bdf8', label: 'Xanh lam' },
              { color: '#10b981', label: 'Xanh lục' },
              { color: '#ef4444', label: 'Đỏ' }
            ].map(c => `
              <button type="button" class="igt-wm-color-btn \${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? 'active' : ''}" data-color="${c.color}" style="width: 22px; height: 22px; border-radius: 50%; background: ${c.color}; border: 2px solid \${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? '#38bdf8' : 'rgba(255,255,255,0.2)'}; cursor: pointer; padding: 0; box-shadow: \${((studioState.globalWatermarkColor || '#ffffff').toLowerCase() === c.color.toLowerCase()) ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none'};" title="${c.label}"></button>
            `).join('')}
          </div>
        </div>

        <!-- Căn chữ ký theo bản vẽ khung chữ nhật đỏ & 5 ô xanh lá của user -->
        <div style="margin-bottom: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Căn vị trí chữ ký trên ảnh:</label>
            <span id="igt-wm-pos-label" style="font-size: 10.5px; color: #38bdf8; font-weight: 700;">
              ${studioState.globalWatermarkPos === 'top-left' ? 'Góc trên trái' : (studioState.globalWatermarkPos === 'top-right' ? 'Góc trên phải' : (studioState.globalWatermarkPos === 'center' ? 'Chính giữa' : (studioState.globalWatermarkPos === 'bottom-left' ? 'Góc dưới trái' : 'Góc dưới phải')))}
            </span>
          </div>

          <div class="igt-wm-screen-grid" title="Bấm vào một ô để căn chữ ký theo bản vẽ">
            <div class="igt-wm-screen-frame">
              <!-- Hàng trên: 2 góc -->
              <div class="igt-wm-pos-row top-row">
                <button type="button" class="igt-wm-pos-box ${studioState.globalWatermarkPos === 'top-left' ? 'active' : ''}" data-pos="top-left" title="Góc trên trái">
                  <span>Trên trái</span>
                </button>
                <button type="button" class="igt-wm-pos-box ${studioState.globalWatermarkPos === 'top-right' ? 'active' : ''}" data-pos="top-right" title="Góc trên phải">
                  <span>Trên phải</span>
                </button>
              </div>

              <!-- Giữa: 1 ô chính giữa -->
              <div class="igt-wm-pos-row center-row">
                <button type="button" class="igt-wm-pos-box ${studioState.globalWatermarkPos === 'center' ? 'active' : ''}" data-pos="center" title="Chính giữa khung hình">
                  <span>Chính giữa</span>
                </button>
              </div>

              <!-- Hàng dưới: 2 góc -->
              <div class="igt-wm-pos-row bottom-row">
                <button type="button" class="igt-wm-pos-box ${studioState.globalWatermarkPos === 'bottom-left' ? 'active' : ''}" data-pos="bottom-left" title="Góc dưới trái">
                  <span>Dưới trái</span>
                </button>
                <button type="button" class="igt-wm-pos-box ${(!studioState.globalWatermarkPos || studioState.globalWatermarkPos === 'bottom-right') ? 'active' : ''}" data-pos="bottom-right" title="Góc dưới phải (Mặc định)">
                  <span>Dưới phải</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
            <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Độ mờ chữ ký (Opacity):</label>
            <span id="igt-global-watermark-opacity-val" style="font-size: 11px; color: #38bdf8; font-weight: 700;">${studioState.globalWatermarkOpacity || 75}%</span>
          </div>
          <input type="range" id="igt-global-watermark-opacity" min="20" max="100" value="${studioState.globalWatermarkOpacity || 75}" style="width: 100%; box-sizing: border-box; accent-color: #38bdf8; cursor: pointer;" />
        </div>
      </div>
    `;

    // Event listeners
    const btnReorder = container.querySelector('#igt-btn-open-reorder-modal');
    if (btnReorder) {
      btnReorder.onclick = () => openReorderModal();
    }

    container.querySelectorAll('[data-global-ratio]').forEach(btn => {
      btn.onclick = () => {
        const r = btn.getAttribute('data-global-ratio');
        studioState.ratio = r;
        if (studioState.mediaList) {
          studioState.mediaList.forEach(item => {
            item.ratio = r;
          });
        }
        setRatio(r, true);
        renderGeneralTabContent(container);
      };
    });

    container.querySelectorAll('[data-global-fit]').forEach(btn => {
      btn.onclick = () => {
        const fit = btn.getAttribute('data-global-fit');
        studioState.fitMode = fit;
        if (studioState.mediaList) {
          studioState.mediaList.forEach(item => {
            item.fitMode = fit;
          });
        }
        applyFitMode();
        renderGeneralTabContent(container);
      };
    });

    container.querySelectorAll('[data-global-filter]').forEach(btn => {
      btn.onclick = () => {
        const flt = btn.getAttribute('data-global-filter');
        studioState.globalFilter = flt;
        if (studioState.mediaList) {
          studioState.mediaList.forEach(item => {
            item.filterPreset = flt;
          });
        }
        updateMediaTransform();
        renderGeneralTabContent(container);
      };
    });

    const wmInput = container.querySelector('#igt-global-watermark-text');
    if (wmInput) {
      wmInput.oninput = (e) => {
        studioState.globalWatermarkText = e.target.value;
        renderStickers();
      };
    }

    const wmFont = container.querySelector('#igt-global-watermark-font');
    if (wmFont) {
      wmFont.onchange = (e) => {
        studioState.globalWatermarkFont = e.target.value;
        renderStickers();
      };
    }

    const posLabel = container.querySelector('#igt-wm-pos-label');
    container.querySelectorAll('.igt-wm-pos-box').forEach(box => {
      box.onclick = () => {
        const p = box.getAttribute('data-pos');
        studioState.globalWatermarkPos = p;
        container.querySelectorAll('.igt-wm-pos-box').forEach(b => b.classList.toggle('active', b === box));
        if (posLabel) {
          posLabel.innerText = p === 'top-left' ? 'Góc trên trái' : (p === 'top-right' ? 'Góc trên phải' : (p === 'center' ? 'Chính giữa' : (p === 'bottom-left' ? 'Góc dưới trái' : 'Góc dưới phải')));
        }
        renderStickers();
      };
    });

        const wmColorPicker = container.querySelector('#igt-global-watermark-color-picker');
    const wmColorHex = container.querySelector('#igt-global-watermark-color-hex');
    if (wmColorPicker) {
      wmColorPicker.oninput = (e) => {
        const c = e.target.value;
        studioState.globalWatermarkColor = c;
        if (wmColorHex) wmColorHex.innerText = c;
        container.querySelectorAll('.igt-wm-color-btn').forEach(btn => {
          const isAct = btn.getAttribute('data-color').toLowerCase() === c.toLowerCase();
          btn.style.borderColor = isAct ? '#38bdf8' : 'rgba(255,255,255,0.2)';
          btn.style.boxShadow = isAct ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none';
        });
        renderStickers();
      };
    }

    container.querySelectorAll('.igt-wm-color-btn').forEach(btn => {
      btn.onclick = () => {
        const c = btn.getAttribute('data-color');
        studioState.globalWatermarkColor = c;
        if (wmColorPicker) wmColorPicker.value = c;
        if (wmColorHex) wmColorHex.innerText = c;
        container.querySelectorAll('.igt-wm-color-btn').forEach(b => {
          const isAct = b === btn;
          b.style.borderColor = isAct ? '#38bdf8' : 'rgba(255,255,255,0.2)';
          b.style.boxShadow = isAct ? '0 0 8px rgba(56, 189, 248, 0.6)' : 'none';
        });
        renderStickers();
      };
    });

    const wmOpacity = container.querySelector('#igt-global-watermark-opacity');
    const wmOpacityVal = container.querySelector('#igt-global-watermark-opacity-val');
    if (wmOpacity) {
      wmOpacity.oninput = (e) => {
        const val = parseInt(e.target.value, 10);
        studioState.globalWatermarkOpacity = val;
        if (wmOpacityVal) wmOpacityVal.innerText = `${val}%`;
        renderStickers();
      };
    }
  }


  const IG_MUSIC_CATALOG = [
    {
        "id": "ig_mus_1",
        "title": "chờ anh chút thôi..",
        "artist": "ig : dcongestaz, Tran Song Minh Long",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/85/c6/07/85c607f4-0304-e749-a6d1-8dea286717ef/196874803059.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/91/2c/2a/912c2aaa-cf3c-a58b-fcbc-2f2105aa779e/mzaf_17532365639636074457.plus.aac.p.m4a",
        "audioAssetId": "109283741",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_2",
        "title": "Kẻ Cô Đơn Trong Thành Phố",
        "artist": "Khải",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/92/a3/7e/92a37e65-e2bf-d15c-7d15-3257afb728fd/5034644164571.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7a/8a/32/7a8a3255-2d09-efe3-e436-6cafe2e205aa/mzaf_8290470986159359205.plus.aac.p.m4a",
        "audioAssetId": "109283742",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_3",
        "title": "ai rồi cũng bỏ anh đi",
        "artist": "VoVanDuc",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/c5/d9/99/c5d9994d-5121-03d7-f7d1-3849c90a9783/3616554175858.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/90/81/12/90811244-ed19-0163-f102-62a9dcbe8846/mzaf_6137827497804761126.plus.aac.p.m4a",
        "audioAssetId": "109283743",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "ambient"
        ]
    },
    {
        "id": "ig_mus_4",
        "title": "Anh Vẫn Ở Đây",
        "artist": "Quang Đăng Trần, Viam",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/3f/18/cf/3f18cf91-92ed-1acf-7d9a-d74d6f755134/3617397778343.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/33/59/02/33590284-24bd-b40b-802f-e2420479c24d/mzaf_10405882291671365677.plus.aac.p.m4a",
        "audioAssetId": "109283744",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_5",
        "title": "Em Có Nhớ Anh Không ?",
        "artist": "Hiya",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/32/6f/d0/326fd0a6-8e24-b6be-24ba-b2bdc26b27fe/artwork.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/34/6c/14/346c14a4-56d4-2d34-04e6-2318d58ef314/mzaf_490071478772489654.plus.aac.p.m4a",
        "audioAssetId": "109283745",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "ambient"
        ]
    },
    {
        "id": "ig_mus_6",
        "title": "Có Ai Hẹn Hò Cùng Em Chưa",
        "artist": "Quân A.P",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/53/cd/22/53cd22cc-27de-da64-20af-82add3ee54da/197338677742.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ee/7d/84/ee7d8420-816a-e8a1-867b-c2ad0f58be13/mzaf_5642180487769696183.plus.aac.p.m4a",
        "audioAssetId": "109283746",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_7",
        "title": "Nét Đẹp Bản Làng",
        "artist": "Hali TH",
        "cover": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/1b/5f/81/1b5f8109-e262-9487-5447-d60a6dd2e32c/mzaf_8483408585496407146.plus.aac.p.m4a",
        "audioAssetId": "109283747",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_8",
        "title": "Biển Đảo Và Em - 海屿你",
        "artist": "Le Dinh Nhat",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/6b/13/ce/6b13ceb1-c61f-51cd-3f48-29000cace35b/4896016131335.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/87/4e/84/874e8439-9982-54b4-d473-048a952e2c2c/mzaf_10448068425299832545.plus.aac.p.m4a",
        "audioAssetId": "109283748",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "ambient"
        ]
    },
    {
        "id": "ig_mus_9",
        "title": "Như Một Người Rưng",
        "artist": "OSAD, Hà An Huy",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/99/2a/fa/992afa04-272d-b2b2-b6ca-9cc06f2c94dc/196874938225.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/f9/bd/a9/f9bda98b-b6b5-bfef-1dcb-bb51e3c59921/mzaf_2290608759897843218.plus.aac.p.m4a",
        "audioAssetId": "109283749",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_10",
        "title": "Thế Giới Của Anh",
        "artist": "Thùy Đoan",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/42/ba/8b/42ba8b08-d5bd-9986-a315-e80a65da8aa9/197338168295.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ed/10/90/ed109003-e0b6-4326-5e15-1292ce1f2741/mzaf_8952906230751084581.plus.aac.p.m4a",
        "audioAssetId": "1092837410",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "ambient"
        ]
    },
    {
        "id": "ig_mus_11",
        "title": "Bâng Khuâng",
        "artist": "Touliver",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/81/9f/f5/819ff5df-2ae2-0308-22cf-0837047b0089/197338091449.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/72/cc/f6/72ccf6f1-93e1-ff75-96b4-e15f2f7c5b1c/mzaf_14447780403453555820.plus.aac.p.m4a",
        "audioAssetId": "1092837411",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_12",
        "title": "Ngày Còn Đôi Mươi",
        "artist": "Chú Út Lông Bông, Tiểu Mỹ",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/c6/67/e2/c667e2f0-8963-348e-2382-b77407c47e0d/859748778623_cover.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/29/5e/cf/295ecf0d-e588-5586-b058-06047b9a4f38/mzaf_11166851840792871842.plus.aac.p.m4a",
        "audioAssetId": "1092837412",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_13",
        "title": "Nơi Này Có Anh",
        "artist": "Sơn Tùng M-TP",
        "cover": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/bf/e0/97/bfe09719-1259-4860-2d46-11126248bcf9/mzaf_193427592141750731.plus.aac.p.m4a",
        "audioAssetId": "1092837413",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_14",
        "title": "Waiting For You",
        "artist": "MONO, Onionn",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/c9/6b/3f/c96b3ff3-9cf6-4ce6-05aa-9f11474bd569/886443938373.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ad/db/b7/addbb7a7-198d-8b72-dfe3-3570c13d665f/mzaf_6660447499617120187.plus.aac.p.m4a",
        "audioAssetId": "1092837414",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    },
    {
        "id": "ig_mus_15",
        "title": "See Tình",
        "artist": "Hoàng Thùy Linh",
        "cover": "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/80/bc/67/80bc6745-2237-0025-d13e-fb1874b2b39a/886449935581.jpg/200x200bb.jpg",
        "audioUrl": "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/e8/31/99/e83199ff-26e7-4879-9983-92b24d888d5e/mzaf_6511605706322867250.plus.aac.p.m4a",
        "audioAssetId": "1092837415",
        "duration": 30,
        "preset": "trending",
        "categories": [
            "for_you",
            "trending",
            "trending"
        ]
    }
];


  let musicSearchDebounce = null;
  const studioAudioProxyCache = new Map();

  // Chuyển Data URL sang Blob URL audio/mp4 để trình duyệt phát mượt mà không lỗi MIME
  function dataUrlToBlobUrl(dataUrl) {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
      const parts = dataUrl.split(',');
      if (parts.length < 2) return dataUrl;
      const byteString = atob(parts[1]);
      const mimeMatch = parts[0].match(/:(.*?);/);
      let mimeString = mimeMatch ? mimeMatch[1] : 'audio/mp4';
      if (mimeString === 'audio/x-m4p' || mimeString === 'audio/aac' || mimeString === 'audio/m4a') {
        mimeString = 'audio/mp4';
      }
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      return URL.createObjectURL(blob);
    } catch (_) {
      return dataUrl;
    }
  }

  // Chuyển đổi URL âm thanh sang Blob URL thông qua Background Service Worker (Bypass 100% CSP media-src của Instagram)
  async function getSafePlayableAudio(url) {
    if (!url) return '';
    if (url.startsWith('blob:')) return url;
    if (url.startsWith('data:')) return dataUrlToBlobUrl(url);
    if (studioAudioProxyCache.has(url)) return studioAudioProxyCache.get(url);

    // 1. Thử qua chrome.runtime background proxy để bypass triệt để CSP media-src
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const resp = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'fetch_audio_as_data_url', url }, (res) => {
            if (chrome.runtime.lastError || !res || !res.success || !res.dataUrl) {
              resolve(null);
            } else {
              resolve(res.dataUrl);
            }
          });
        });
        if (resp) {
          const blobUrl = dataUrlToBlobUrl(resp);
          studioAudioProxyCache.set(url, blobUrl);
          return blobUrl;
        }
      }
    } catch (_) {}

    // 2. Fallback direct fetch tạo Blob URL với MIME type audio/mp4 chuẩn (hoạt động tốt trong môi trường test/localhost)
    try {
      const directRes = await fetch(url);
      if (directRes.ok) {
        const ab = await directRes.arrayBuffer();
        const blob = new Blob([ab], { type: 'audio/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        studioAudioProxyCache.set(url, blobUrl);
        return blobUrl;
      }
    } catch (_) {}

    // 3. Nếu là link Instagram nội bộ thì có thể phát trực tiếp (nằm trong CSP media-src)
    if (url.includes('cdninstagram.com') || url.includes('instagram.com')) {
      return url;
    }

    return null;
  }

  // Tìm kiếm bài hát thực tế qua Apple Music / iTunes API (hỗ trợ proxy background để tránh CSP connect-src)
  async function searchItunesLive(term, limit = 50) {
    if (!term || !term.trim()) return [];
    
    // 1. Thử qua background proxy để hoàn toàn miễn nhiễm connect-src CSP
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'proxy_itunes_search', term, limit }, (res) => {
            if (chrome.runtime.lastError || !res || !res.success || !Array.isArray(res.results)) {
              resolve(null);
            } else {
              resolve(res.results);
            }
          });
        });
        if (Array.isArray(bgRes) && bgRes.length > 0) return bgRes;
      }
    } catch (_) {}

    // 2. Fallback direct fetch (trong test runner hoặc direct fetch)
    try {
      const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}&country=VN`);
      if (itunesRes.ok) {
        const iData = await itunesRes.json();
        if (Array.isArray(iData.results) && iData.results.length > 0) {
          return iData.results;
        }
      }
    } catch (_) {}

    // 3. Fallback direct fetch toàn cầu nếu kho VN ít
    try {
      const itunesRes2 = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`);
      if (itunesRes2.ok) {
        const iData2 = await itunesRes2.json();
        if (Array.isArray(iData2.results)) {
          return iData2.results;
        }
      }
    } catch (_) {}

    return [];
  }

  async function fetchLiveMusic(query = '', category = 'for_you', forceRefresh = false) {
    if (!studioState.liveMusicCache) studioState.liveMusicCache = {};
    const cacheKey = `${category}__${(query || '').trim().toLowerCase()}`;

    if (!forceRefresh && studioState.liveMusicCache[cacheKey]) {
      studioState.liveMusicTracks = studioState.liveMusicCache[cacheKey];
      return studioState.liveMusicTracks;
    }

    studioState.isFetchingMusic = true;

    // 1. Thu thập từ Cache phát hiện ngầm (injected.js __ig_music_cache__)
    let harvestedTracks = [];
    try {
      const cacheEl = document.getElementById('__ig_music_cache__');
      if (cacheEl && cacheEl.textContent) {
        const arr = JSON.parse(cacheEl.textContent);
        if (Array.isArray(arr)) {
          harvestedTracks = arr.map(item => ({
            id: 'harv_' + (item.id || item.assetId || Math.random().toString(36).slice(2)),
            title: item.title || 'Instagram Audio',
            artist: item.artist || 'Nghệ sĩ Instagram',
            cover: item.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80',
            audioUrl: item.audioUrl || '',
            audioAssetId: item.assetId || item.id || '',
            duration: Math.round((item.clipDurationMs || 30000) / 1000),
            categories: ['for_you', 'trending']
          })).filter(t => t.audioUrl && t.title);
        }
      }
    } catch (_) {}

    // 2. Gọi Instagram API nội bộ (Private Web API)
    let igApiTracks = [];
    try {
      const csrf = getInstagramCsrfToken();
      const headers = {
        'X-CSRFToken': csrf || '',
        'X-IG-App-ID': '936619743392459',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*'
      };

      const endpoint = query ? '/api/v1/music/search/' : '/api/v1/music/trending/';
      const fd = new FormData();
      if (query) fd.append('q', query);
      fd.append('product', 'story_camera_music_overlay_post_capture');
      fd.append('browse_session_id', 'igt_' + Date.now());

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: fd,
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        const rawList = data.items || data.tracks || [];
        if (Array.isArray(data.music_sections)) {
          data.music_sections.forEach(sec => {
            if (Array.isArray(sec.items)) rawList.push(...sec.items);
          });
        }
        igApiTracks = rawList.map(raw => {
          const t = raw.track || raw;
          return {
            id: 'ig_' + (t.id || t.audio_cluster_id || Math.random().toString(36).slice(2)),
            title: t.title || t.song_name || 'Instagram Audio',
            artist: t.display_artist || t.artist_name || 'Nghệ sĩ',
            cover: t.cover_artwork_uri || t.cover_artwork_thumbnail_uri || '',
            audioUrl: t.progressive_download_url || t.fast_start_progressive_download_url || '',
            audioAssetId: String(t.audio_cluster_id || t.audio_asset_id || ''),
            duration: Math.round((t.duration_in_ms || 30000) / 1000),
            categories: ['for_you', 'trending']
          };
        }).filter(t => t.audioUrl && t.title);
      }
    } catch (_) {}

    // 3. Gọi iTunes Audio Search API (Lấy MP3 phòng thu thật 30s chất lượng cao của mọi ca sĩ VN & quốc tế, kho bài hát khổng lồ)
    let publicApiTracks = [];
    try {
      if (query && query.trim()) {
        const searchResults = await searchItunesLive(query.trim(), 50);
        publicApiTracks = (searchResults || []).map(r => ({
          id: 'itunes_' + r.trackId,
          title: r.trackName,
          artist: r.artistName,
          cover: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '240x240bb') : '',
          audioUrl: r.previewUrl,
          audioAssetId: String(r.trackId),
          duration: 30,
          categories: [category, 'trending', 'for_you']
        })).filter(t => t.audioUrl && t.title);
      } else {
        // Lấy danh sách đồ sộ theo từng thể loại tab bằng cách truy vấn song song nhiều từ khóa trending hot
        let queries = [];
        if (category === 'trending') {
          queries = ['V-Pop Hot Hits', 'Nhạc trẻ trending', 'TikTok viral Vietnam'];
        } else if (category === 'ambient') {
          queries = ['Lofi chill relax', 'Rain relax piano', 'Acoustic coffee study'];
        } else {
          // 'for_you'
          queries = ['Vietnamese pop', 'Indie Việt Nam', 'Acoustic Chill V-Pop'];
        }

        const resultsArrays = await Promise.all(queries.map(q => searchItunesLive(q, 30)));
        const combinedResults = resultsArrays.flat();
        publicApiTracks = combinedResults.map(r => ({
          id: 'itunes_' + r.trackId,
          title: r.trackName,
          artist: r.artistName,
          cover: r.artworkUrl100 ? r.artworkUrl100.replace('100x100bb', '240x240bb') : '',
          audioUrl: r.previewUrl,
          audioAssetId: String(r.trackId),
          duration: 30,
          categories: [category, 'trending', 'for_you']
        })).filter(t => t.audioUrl && t.title);
      }
    } catch (_) {}

    const combined = [...igApiTracks, ...harvestedTracks, ...publicApiTracks];
    const seen = new Set();
    const finalTracks = [];

    for (const t of combined) {
      const key = `${t.title.toLowerCase().trim()}__${t.artist.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        finalTracks.push(t);
      }
    }

    studioState.isFetchingMusic = false;
    if (finalTracks.length > 0) {
      studioState.liveMusicCache[cacheKey] = finalTracks;
      studioState.liveMusicTracks = finalTracks;
      try {
        localStorage.setItem('igt_daily_music_tracks', JSON.stringify(finalTracks));
      } catch (_) {}
    } else {
      studioState.liveMusicTracks = [];
    }

    return studioState.liveMusicTracks;
  }

  // Tự động kiểm tra và làm mới danh sách bài hát thịnh hành vào phiên làm việc đầu tiên của ngày
  function checkAndAutoRefreshDailyMusic() {
    try {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const lastRefreshDate = localStorage.getItem('igt_music_last_refresh_date');

      // 1. Phục hồi bài hát đã lưu trữ trong ngày để nạp tức thì
      if (!studioState.liveMusicTracks || studioState.liveMusicTracks.length === 0) {
        const cachedDaily = localStorage.getItem('igt_daily_music_tracks');
        if (cachedDaily) {
          try {
            const parsed = JSON.parse(cachedDaily);
            if (Array.isArray(parsed) && parsed.length > 0) {
              studioState.liveMusicTracks = parsed;
            }
          } catch (_) {}
        }
      }

      // 2. Nếu là phiên đầu tiên của ngày hôm nay, tự động cập nhật danh sách thịnh hành mới nhất
      if (lastRefreshDate !== todayStr) {
        localStorage.setItem('igt_music_last_refresh_date', todayStr);
        fetchLiveMusic('', studioState.musicActiveCategory || 'for_you', true).then(tracks => {
          if (tracks && tracks.length > 0) {
            try {
              localStorage.setItem('igt_daily_music_tracks', JSON.stringify(tracks));
            } catch (_) {}
            if (studioState.activeTab === 'music') {
              renderTabContent('music');
            }
          }
        });
      }
    } catch (e) {
      console.warn('[Studio] checkAndAutoRefreshDailyMusic error:', e);
    }
  }


  function renderTabContent(tab) {
    const container = document.getElementById('igt-studio-tab-content');
    if (!container) return;

    if (tab === 'general') {
      renderGeneralTabContent(container);
      return;
    }

    if (tab === 'main') {
      const isVideo = studioState.mediaType === 'video';
      if (isVideo && (!studioState.videoClips || studioState.videoClips.length === 0)) {
        studioState.videoClips = [{
          id: 'clip_' + Date.now(),
          start: studioState.trimStart || 0,
          end: studioState.trimEnd || studioState.videoDuration || 60,
          speed: 1
        }];
        studioState.selectedClipId = studioState.videoClips[0].id;
      }
      const activeClip = isVideo ? ((studioState.videoClips || []).find(c => c.id === studioState.selectedClipId) || (studioState.videoClips || [])[0]) : null;
      const activeIdx = activeClip ? studioState.videoClips.indexOf(activeClip) : 0;

      const currentStoryDuration = isVideo
        ? ((studioState.videoClips && studioState.videoClips.length > 0)
          ? getVideoClipsTotalDuration()
          : Math.max(0, (studioState.trimEnd || studioState.videoDuration || 0) - (studioState.trimStart || 0)))
        : 15;
      const isOver60s = studioState.mode === 'story' && currentStoryDuration > 60;

      container.innerHTML = `
        <!-- Cảnh báo nếu Story vượt quá 60s -->
        ${isOver60s ? `
        <div class="igt-story-duration-warning">
          <div style="font-size: 18px; line-height: 1; flex-shrink: 0;">⚠️</div>
          <div style="flex: 1;">
            <div style="font-size: 11.5px; font-weight: 700; color: #fca5a5; margin-bottom: 2px;">
              Thời lượng Story vượt quá giới hạn 60s (${formatTime(currentStoryDuration)})
            </div>
            <div style="font-size: 10px; color: #cbd5e1; line-height: 1.35; margin-bottom: 6px;">
              Instagram chỉ cho phép Story tối đa <b>60 giây</b>. Video dài hơn sẽ bị Instagram tự cắt bớt hoặc lỗi khi đăng tải!
            </div>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="igt-btn-fix-story-60" style="padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: #ef4444; color: #fff; border: none; cursor: pointer;">
                ✂️ Chia về 60s
              </button>
              <button type="button" class="igt-btn-fix-story-split" style="padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); cursor: pointer;">
                ⚡ Bật tự chia nhỏ
              </button>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">Kiểu hiển thị khung hình</div>
            <button type="button" class="igt-btn-reset-fit-transform" title="Đưa ảnh/video về vị trí ban đầu cân đối và đẹp nhất trong khung hình" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.18s ease;">
              <span>↺</span>
              <span>Đặt lại</span>
            </button>
          </div>
          <div class="igt-studio-fit-options">
            <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'blur_fit' ? 'active' : ''}" data-fit="blur_fit">
              ✨ Giữ trọn ảnh + Nền mờ
            </button>
            <button type="button" class="igt-studio-fit-btn ${studioState.fitMode === 'cover' ? 'active' : ''}" data-fit="cover">
              📐 Cắt vừa kín khung (Cover)
            </button>
          </div>
        </div>

        ${isVideo ? `
        <div class="igt-studio-setting-group" id="igt-video-trimmer-group">
          <div class="igt-trim-header-row">
            <div class="igt-studio-setting-title" style="margin: 0; font-size: 11px; font-weight: 700; color: #f1f5f9; white-space: nowrap;">✂️ Chia đoạn</div>
            <div class="igt-trim-header-actions">
              ${(() => {
            const isPreset = studioState.trimPreset && studioState.trimPreset !== 'none' && studioState.trimPreset !== 'custom';
            return `
                  <button type="button" id="igt-btn-trim-cancel" class="igt-trim-cancel-btn ${isPreset ? 'is-canceling' : 'active is-free'}" title="${isPreset ? 'Hủy áp dụng mẫu, quay về Tự do' : 'Chế độ Tự do đang được kích hoạt (không ép mẫu) - Bấm để đặt lại trọn vẹn video'}">
                    ${isPreset ? '✕ Hủy' : '✓ Tự do'}
                  </button>
                `;
          })()}
              <span class="igt-trim-dur-badge">
                Tổng: ${formatTime(studioState.trimPreset === 'none' ? (studioState.videoDuration || 0) : Math.max(0, (studioState.trimEnd || 15) - (studioState.trimStart || 0)))}
              </span>
            </div>
          </div>

          <!-- Các Nút Template Presets: 10s, 20s, 30s, 60s, Toàn bộ -->
          <div class="igt-trim-templates-row" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 10px;">
            <button type="button" class="igt-trim-preset-btn ${studioState.trimPreset === '10s' ? 'active' : ''}" data-preset="10s">10s</button>
            <button type="button" class="igt-trim-preset-btn ${studioState.trimPreset === '20s' ? 'active' : ''}" data-preset="20s">20s</button>
            <button type="button" class="igt-trim-preset-btn ${studioState.trimPreset === '30s' ? 'active' : ''}" data-preset="30s">30s</button>
            <button type="button" class="igt-trim-preset-btn ${studioState.trimPreset === '60s' ? 'active' : ''}" data-preset="60s">60s (IG)</button>
            <button type="button" class="igt-trim-preset-btn ${studioState.trimPreset === 'all' ? 'active' : ''}" data-preset="all">Toàn bộ</button>
          </div>

          <!-- Ô thời gian Bắt đầu & Kết thúc -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
            <div>
              <label style="font-size: 10.5px; color: #94a3b8; display: block; margin-bottom: 2px;">Từ (Bắt đầu)</label>
              <input type="text" id="igt-clip-start-input" class="igt-studio-input" style="margin-bottom:0;" value="${formatTime(studioState.trimStart || 0)}" />
            </div>
            <div>
              <label style="font-size: 10.5px; color: #94a3b8; display: block; margin-bottom: 2px;">Đến (Kết thúc)</label>
              <input type="text" id="igt-clip-end-input" class="igt-studio-input" style="margin-bottom:0;" value="${formatTime(studioState.trimEnd || (studioState.videoDuration || 15))}" />
            </div>
          </div>

          <!-- Danh sách các đoạn chia nhỏ (CapCut Clips) nếu có -->
          ${(activeClip && studioState.videoClips && studioState.videoClips.length > 0) ? `
          <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px; margin-top: 6px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 11px; font-weight: 700; color: #f8fafc;">🎬 Các đoạn video (${studioState.videoClips.length})</span>
              <span style="font-size: 10.5px; color: #94a3b8;">Tổng: ${formatTime(getVideoClipsTotalDuration())}</span>
            </div>

            <!-- Danh sách các đoạn video (Pills) -->
            <div class="igt-clips-pills-list" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 10px;">
              ${studioState.videoClips.map((c, idx) => {
            const isSel = c.id === activeClip.id;
            const durSec = (c.end - c.start) / (c.speed || 1);
            return `
                  <button type="button" class="igt-clip-pill-btn ${isSel ? 'active' : ''}" data-clip-id="${c.id}" style="flex-shrink: 0; padding: 4px 8px; border-radius: 8px; font-size: 10.5px; font-weight: 700; background: ${isSel ? 'rgba(0,149,246,0.25)' : 'rgba(255,255,255,0.06)'}; border: 1.5px solid ${isSel ? '#0095f6' : 'rgba(255,255,255,0.1)'}; color: ${isSel ? '#38bdf8' : '#e2e8f0'}; cursor: pointer;">
                    <span>Đoạn ${idx + 1}</span>
                    <span style="font-size: 10px; opacity: 0.8; margin-left: 3px;">${formatTime(durSec)}</span>
                    ${c.speed && c.speed !== 1 ? `<span style="background: #f59e0b; color: #000; font-size: 9px; padding: 1px 3px; border-radius: 4px; margin-left: 3px;">${c.speed}x</span>` : ''}
                  </button>
                `;
          }).join('')}
            </div>

            <!-- Bảng điều khiển đoạn đang chọn -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 11px; font-weight: 700; color: #f8fafc;">Đoạn ${activeIdx + 1} (${formatTime((activeClip.end - activeClip.start) / (activeClip.speed || 1))})</span>
                <span style="font-size: 10px; color: #94a3b8;">Tốc độ: <b style="color: #f59e0b;">${activeClip.speed || 1}x</b></span>
              </div>

              <!-- Tốc độ phát -->
              <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                ${[0.5, 0.75, 1, 1.25, 1.5, 2].map(sp => `
                  <button type="button" class="igt-clip-speed-pill ${(activeClip.speed || 1) === sp ? 'active' : ''}" data-speed="${sp}" style="flex: 1; padding: 3px 0; border-radius: 6px; font-size: 10px; font-weight: 700; background: ${(activeClip.speed || 1) === sp ? '#0095f6' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${(activeClip.speed || 1) === sp ? '#0095f6' : 'rgba(255,255,255,0.1)'}; color: #ffffff; cursor: pointer;">
                    ${sp}x
                  </button>
                `).join('')}
              </div>

              <!-- Thao tác Đổi vị trí & Xóa đoạn -->
              <div style="display: flex; gap: 6px;">
                <button type="button" id="igt-side-btn-move-left" class="igt-studio-btn-sub" style="flex: 1; padding: 4px 6px; font-size: 10.5px;" ${activeIdx === 0 ? 'disabled' : ''}>
                  ◀ Dời trái
                </button>
                <button type="button" id="igt-side-btn-move-right" class="igt-studio-btn-sub" style="flex: 1; padding: 4px 6px; font-size: 10.5px;" ${activeIdx === studioState.videoClips.length - 1 ? 'disabled' : ''}>
                  ▶ Dời phải
                </button>
                ${studioState.videoClips.length > 1 ? `
                  <button type="button" id="igt-side-btn-delete-clip" class="igt-studio-btn-sub danger" style="flex: 1; padding: 4px 6px; font-size: 10.5px; color: #f87171; border-color: rgba(239, 68, 68, 0.35);">
                    🗑️ Xóa
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
          ` : ''}
        </div>
        ` : ''}

        <!-- Cụm điều khiển Zoom & Căn góc chuyên dụng của Tab Tỉ lệ -->
        <div class="igt-studio-setting-group">
          <div class="igt-studio-setting-title">🔍 Thu phóng & Vị trí Video/Ảnh</div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; margin-bottom: 5px;">
            <span>Độ phóng đại (Zoom):</span>
            <span id="igt-tab-zoom-val" style="color: #0095f6; font-weight: 700;">${Math.round(studioState.zoom * 100)}%</span>
          </div>
          <input type="range" id="igt-tab-zoom-slider" min="0.8" max="3" step="0.05" value="${studioState.zoom}" style="width: 100%; accent-color: #0095f6; margin-bottom: 4px; cursor: pointer;" />
        </div>

        ${isVideo ? `
        <!-- Cụm điều khiển Âm lượng Video Gốc -->
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div class="igt-studio-setting-title" style="margin: 0;">🔊 ÂM LƯỢNG VIDEO GỐC</div>
            <span id="igt-tab-video-vol-val" style="font-size: 11px; color: #38bdf8; font-weight: 700;">${(studioState.isVideoMuted || studioState.videoVolume === 0) ? '0% (Đã tắt)' : Math.round((studioState.videoVolume ?? 1) * 100) + '%'}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <button type="button" id="igt-side-video-mute-btn" class="igt-studio-btn-sub ${studioState.isVideoMuted ? 'active' : ''}" style="padding: 4px 10px; font-size: 11px; white-space: nowrap;">
              ${studioState.isVideoMuted ? '🔊 Bật tiếng' : '🔇 Tắt tiếng'}
            </button>
            <input type="range" id="igt-tab-video-vol-slider" min="0" max="1" step="0.05" value="${studioState.isVideoMuted ? 0 : (studioState.videoVolume ?? 1)}" style="flex: 1; accent-color: #0095f6; cursor: pointer;" />
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="igt-studio-btn-sub igt-tab-vid-vol-preset" data-vol="0" style="flex: 1; padding: 4px 0; font-size: 10px;">Tắt tiếng</button>
            <button type="button" class="igt-studio-btn-sub igt-tab-vid-vol-preset" data-vol="0.5" style="flex: 1; padding: 4px 0; font-size: 10px;">50%</button>
            <button type="button" class="igt-studio-btn-sub igt-tab-vid-vol-preset" data-vol="1" style="flex: 1; padding: 4px 0; font-size: 10px;">100%</button>
          </div>
        </div>
        ` : `
        <!-- ============================================== -->
        <!-- BỘ CÔNG CỤ CHỈNH SỬA ẢNH & HIỆU ỨNG (PHOTO TOOLS) -->
        <!-- ============================================== -->
        <!-- 1. Thời lượng ảnh trên Story Timeline (Ẩn khi ở chế độ Post) -->
        ${studioState.mode === 'post' ? '' : `
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div class="igt-studio-setting-title" style="margin: 0;">⏱️ THỜI LƯỢNG ẢNH TRÊN STORY</div>
            <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">${studioState.imageDuration || 15} giây</span>
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px; line-height: 1.35;">
            Thời gian ảnh chạy trên dòng thời gian Story để ghép nhạc nền:
          </div>
          <div class="igt-photo-dur-grid">
            <button type="button" class="igt-photo-dur-pill ${(studioState.imageDuration === 5) ? 'active' : ''}" data-dur="5">⚡ 5s (Nhanh)</button>
            <button type="button" class="igt-photo-dur-pill ${(studioState.imageDuration === 10) ? 'active' : ''}" data-dur="10">⏱️ 10s</button>
            <button type="button" class="igt-photo-dur-pill ${(studioState.imageDuration === 15 || !studioState.imageDuration) ? 'active' : ''}" data-dur="15">📸 15s (Story IG)</button>
            <button type="button" class="igt-photo-dur-pill ${(studioState.imageDuration === 30) ? 'active' : ''}" data-dur="30">🎬 30s (Reel)</button>
          </div>
        </div>
        `}

        <!-- 2. Bộ lọc màu Instagram -->
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">🎨 BỘ LỌC MÀU INSTAGRAM</div>
            <button type="button" id="igt-btn-reset-insta-filter" style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.28); color: #38bdf8; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; transition: all 0.18s ease;" title="Đặt lại về ảnh gốc (Không áp dụng bộ lọc)">
              <span>↺</span>
              <span>Gốc</span>
            </button>
          </div>
          <div class="igt-filter-chips-grid">
            ${IMAGE_FILTERS.map(f => `
              <button type="button" class="igt-filter-chip ${(studioState.imageFilter || 'normal') === f.id ? 'active' : ''}" data-filter="${f.id}" title="${f.name}">
                <span class="igt-filter-icon">${f.icon}</span>
                <span class="igt-filter-name">${f.name}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 3. Cắt xoay & Lật ảnh -->
        <div class="igt-studio-setting-group">
          <div class="igt-studio-setting-title">📐 CẮT XOAY & LẬT ẢNH</div>
          <div class="igt-photo-transform-row">
            <button type="button" class="igt-photo-tool-btn" id="igt-btn-rotate-90" title="Xoay 90 độ thuận chiều kim đồng hồ">
              <span>🔄 Xoay 90°</span>
            </button>
            <button type="button" class="igt-photo-tool-btn ${studioState.flipH ? 'active' : ''}" id="igt-btn-flip-h" title="Lật ngang (Gương)">
              <span>↔️ Lật ngang</span>
            </button>
            <button type="button" class="igt-photo-tool-btn ${studioState.flipV ? 'active' : ''}" id="igt-btn-flip-v" title="Lật dọc">
              <span>↕️ Lật dọc</span>
            </button>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10.5px; color: #94a3b8; margin: 6px 0 2px;">
            <span>Góc xoay tự do:</span>
            <span id="igt-free-angle-val" style="color: #38bdf8; font-weight: 700;">${studioState.freeAngle || 0}°</span>
          </div>
          <input type="range" id="igt-slider-free-angle" class="igt-adj-slider" min="-45" max="45" step="1" value="${studioState.freeAngle || 0}" />
        </div>

        <!-- 4. Hiệu ứng đặc biệt (Special FX) -->
        <div class="igt-studio-setting-group">
          <div class="igt-studio-setting-title">✨ HIỆU ỨNG ĐẶC BIỆT (SPECIAL FX)</div>
          <div style="display: flex; flex-wrap: wrap; gap: 5px;">
            ${[
          { id: 'none', label: '🚫 Không' },
          { id: 'grain', label: '🎞️ Hạt phim' },
          { id: 'sparkle', label: '✨ Lấp lánh' },
          { id: 'lightleak', label: '🌈 Vệt nắng' },
          { id: 'vignette_heavy', label: '🔲 Tối viền đậm' }
        ].map(fx => `
              <button type="button" class="igt-fx-pill ${(studioState.imageFx || 'none') === fx.id ? 'active' : ''}" data-fx="${fx.id}" style="padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: ${(studioState.imageFx || 'none') === fx.id ? '#0095f6' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${(studioState.imageFx || 'none') === fx.id ? '#0095f6' : 'rgba(255,255,255,0.1)'}; color: #ffffff; cursor: pointer;">
                ${fx.label}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- 5. Tinh chỉnh màu sắc -->
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">☀️ TINH CHỈNH MÀU SẮC</div>
            <button type="button" id="igt-btn-reset-filters" style="background: none; border: none; color: #f43f5e; font-size: 10.5px; font-weight: 700; cursor: pointer; padding: 0;">
              ↺ Đặt lại màu
            </button>
          </div>

          <!-- Độ sáng -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Độ sáng (Brightness)</span>
              <span class="igt-adj-val" id="val-brightness">${studioState.brightness ?? 100}%</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-brightness" min="50" max="150" step="1" value="${studioState.brightness ?? 100}" />
          </div>

          <!-- Độ tương phản -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Độ tương phản (Contrast)</span>
              <span class="igt-adj-val" id="val-contrast">${studioState.contrast ?? 100}%</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-contrast" min="50" max="150" step="1" value="${studioState.contrast ?? 100}" />
          </div>

          <!-- Độ bão hòa -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Độ bão hòa (Saturation)</span>
              <span class="igt-adj-val" id="val-saturate">${studioState.saturate ?? 100}%</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-saturate" min="0" max="200" step="2" value="${studioState.saturate ?? 100}" />
          </div>

          <!-- Độ ấm -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Độ ấm cổ điển (Sepia)</span>
              <span class="igt-adj-val" id="val-sepia">${studioState.sepia ?? 0}%</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-sepia" min="0" max="100" step="1" value="${studioState.sepia ?? 0}" />
          </div>

          <!-- Độ mờ nghệ thuật -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Độ mờ nghệ thuật (Blur)</span>
              <span class="igt-adj-val" id="val-blur">${studioState.blur ?? 0}px</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-blur" min="0" max="10" step="0.5" value="${studioState.blur ?? 0}" />
          </div>

          <!-- Tối viền (Vignette) -->
          <div class="igt-adj-row">
            <div class="igt-adj-header">
              <span>Tối viền 4 góc (Vignette)</span>
              <span class="igt-adj-val" id="val-vignette">${studioState.vignette ?? 0}%</span>
            </div>
            <input type="range" class="igt-adj-slider" id="slider-vignette" min="0" max="100" step="2" value="${studioState.vignette ?? 0}" />
          </div>
        </div>
        `}
      `;

      // Đồng bộ Zoom và Pan cho Tab Tỉ lệ
      const tabZoomSlider = container.querySelector('#igt-tab-zoom-slider');
      const tabZoomVal = container.querySelector('#igt-tab-zoom-val');
      const tabBtnResetCenter = container.querySelector('#igt-tab-btn-reset-center');
      const bottomZoomSlider = document.getElementById('igt-studio-zoom-slider');

      // Sự kiện chỉnh Âm lượng Video trong Sidebar
      if (isVideo) {
        const sideVidVolSlider = container.querySelector('#igt-tab-video-vol-slider');
        const sideVidMuteBtn = container.querySelector('#igt-side-video-mute-btn');
        if (sideVidVolSlider) {
          sideVidVolSlider.oninput = (e) => setVideoVolume(parseFloat(e.target.value));
        }
        if (sideVidMuteBtn) {
          sideVidMuteBtn.onclick = () => setVideoVolume(0, true);
        }
        container.querySelectorAll('.igt-tab-vid-vol-preset').forEach(btn => {
          btn.onclick = () => {
            const v = parseFloat(btn.getAttribute('data-vol'));
            if (v === 0) setVideoVolume(0, true);
            else setVideoVolume(v);
          };
        });
      }

      if (tabZoomSlider) {
        tabZoomSlider.oninput = (e) => {
          const val = parseFloat(e.target.value);
          studioState.zoom = val;
          if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
            studioState.mediaList[studioState.activeMediaIndex].zoom = val;
          }
          if (tabZoomVal) tabZoomVal.innerText = Math.round(val * 100) + '%';
          if (bottomZoomSlider) bottomZoomSlider.value = val;
          updateMediaTransform();
        };
        tabZoomSlider.onchange = () => {
          takeSnapshot('Zoom slider');
        };
      }

      if (tabBtnResetCenter) {
        tabBtnResetCenter.onclick = () => {
          studioState.zoom = 1;
          studioState.panX = 0;
          studioState.panY = 0;
          if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
            const cur = studioState.mediaList[studioState.activeMediaIndex];
            cur.zoom = 1;
            cur.panX = 0;
            cur.panY = 0;
          }
          if (tabZoomSlider) tabZoomSlider.value = 1;
          if (tabZoomVal) tabZoomVal.innerText = '100%';
          if (bottomZoomSlider) bottomZoomSlider.value = 1;
          updateMediaTransform();
          takeSnapshot('Reset Center');
        };
      }

      container.querySelectorAll('.igt-btn-reset-fit-transform').forEach(b => {
        b.onclick = () => resetMediaTransformToDefault();
      });

      container.querySelectorAll('.igt-studio-fit-btn').forEach(b => {
        b.onclick = () => {
          studioState.fitMode = b.getAttribute('data-fit');
          container.querySelectorAll('.igt-studio-fit-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          applyFitMode();
          takeSnapshot('Change fit mode');
        };
      });

      // Xử lý sự kiện Video Trimmer & Multi-Clips (CapCut style)
      if (isVideo && activeClip) {
        // 1. Click pill chọn đoạn
        container.querySelectorAll('.igt-clip-pill-btn').forEach(btn => {
          btn.onclick = () => {
            const cid = btn.getAttribute('data-clip-id');
            studioState.selectedClipId = cid;
            renderTimeline();
            renderTabContent('main');
          };
        });

        // 2. Chọn tốc độ phát
        container.querySelectorAll('.igt-clip-speed-pill').forEach(sBtn => {
          sBtn.onclick = () => {
            const sp = parseFloat(sBtn.getAttribute('data-speed'));
            activeClip.speed = sp;
            const video = document.getElementById('igt-studio-active-media');
            if (video && currentPlayingClipIndex === activeIdx) {
              video.playbackRate = sp;
            }
            takeSnapshot(`Đổi tốc độ đoạn ${activeIdx + 1} thành ${sp}x`);
            renderTimeline();
            renderTabContent('main');
          };
        });

        // 3. Dời sang trái
        const btnMoveLeft = container.querySelector('#igt-side-btn-move-left');
        if (btnMoveLeft && activeIdx > 0) {
          btnMoveLeft.onclick = () => {
            const prev = studioState.videoClips[activeIdx - 1];
            studioState.videoClips[activeIdx - 1] = activeClip;
            studioState.videoClips[activeIdx] = prev;
            takeSnapshot('Dời đoạn video sang trái');
            renderTimeline();
            renderTabContent('main');
          };
        }

        // 4. Dời sang phải
        const btnMoveRight = container.querySelector('#igt-side-btn-move-right');
        if (btnMoveRight && activeIdx < studioState.videoClips.length - 1) {
          btnMoveRight.onclick = () => {
            const next = studioState.videoClips[activeIdx + 1];
            studioState.videoClips[activeIdx + 1] = activeClip;
            studioState.videoClips[activeIdx] = next;
            takeSnapshot('Dời đoạn video sang phải');
            renderTimeline();
            renderTabContent('main');
          };
        }

        // 5. Xóa đoạn
        const btnDelClip = container.querySelector('#igt-side-btn-delete-clip');
        if (btnDelClip && studioState.videoClips.length > 1) {
          btnDelClip.onclick = () => {
            studioState.videoClips.splice(activeIdx, 1);
            const newSel = studioState.videoClips[Math.min(activeIdx, studioState.videoClips.length - 1)];
            studioState.selectedClipId = newSel ? newSel.id : null;
            takeSnapshot('Xóa đoạn video');
            renderTimeline();
            renderTabContent('main');
          };
        }

        // 6. Template Preset Buttons & Nút Hủy & Nhập thời gian cắt thủ công
        const btnTrimCancel = container.querySelector('#igt-btn-trim-cancel');
        if (btnTrimCancel) {
          btnTrimCancel.onclick = () => {
            cancelTrimPreset();
          };
        }

        container.querySelectorAll('.igt-trim-preset-btn').forEach(btn => {
          btn.onclick = () => {
            const preset = btn.getAttribute('data-preset');
            if (studioState.trimPreset === preset) {
              cancelTrimPreset();
            } else {
              applyTrimPreset(preset);
            }
          };
        });

        const clipStartInp = container.querySelector('#igt-clip-start-input');
        const clipEndInp = container.querySelector('#igt-clip-end-input');
        if (clipStartInp) {
          clipStartInp.onchange = (e) => {
            const val = parseTimeInput(e.target.value, studioState.trimStart || 0);
            const dur = studioState.videoDuration || 60;
            const curEnd = studioState.trimEnd || dur;
            studioState.trimStart = Math.max(0, Math.min(val, curEnd - 0.5));
            studioState.trimPreset = 'custom';
            if (studioState.videoClips && studioState.videoClips.length === 1) {
              studioState.videoClips[0].start = studioState.trimStart;
            }
            const curItem = studioState.mediaList[studioState.activeMediaIndex];
            if (curItem) {
              curItem.trimStart = studioState.trimStart;
              curItem.trimPreset = 'custom';
              if (curItem.videoClips && curItem.videoClips.length === 1) {
                curItem.videoClips[0].start = studioState.trimStart;
              }
            }
            const video = document.getElementById('igt-studio-active-media');
            if (video) video.currentTime = studioState.trimStart;
            renderTimeline();
            renderTabContent('main');
          };
        }
        if (clipEndInp) {
          clipEndInp.onchange = (e) => {
            const val = parseTimeInput(e.target.value, studioState.trimEnd || 15);
            const dur = studioState.videoDuration || 60;
            const curStart = studioState.trimStart || 0;
            studioState.trimEnd = Math.min(dur, Math.max(val, curStart + 0.5));
            studioState.trimPreset = 'custom';
            if (studioState.videoClips && studioState.videoClips.length === 1) {
              studioState.videoClips[0].end = studioState.trimEnd;
            }
            const curItem = studioState.mediaList[studioState.activeMediaIndex];
            if (curItem) {
              curItem.trimEnd = studioState.trimEnd;
              curItem.trimPreset = 'custom';
              if (curItem.videoClips && curItem.videoClips.length === 1) {
                curItem.videoClips[0].end = studioState.trimEnd;
              }
            }
            renderTimeline();
            renderTabContent('main');
          };
        }

        // Sự kiện nút sửa nhanh giới hạn Story 60s
        const btnFix60 = container.querySelector('.igt-btn-fix-story-60');
        if (btnFix60) {
          btnFix60.onclick = () => {
            applyTrimPreset('60s');
          };
        }
      }

      // Xử lý sự kiện Công cụ Chỉnh sửa Ảnh & Hiệu ứng
      if (!isVideo) {
        // 1. Thời lượng ảnh trên Story Timeline
        container.querySelectorAll('.igt-photo-dur-pill').forEach(pill => {
          pill.onclick = () => {
            const dur = parseInt(pill.getAttribute('data-dur'), 10) || 15;
            studioState.imageDuration = dur;
            studioState.customStoryDurationSet = true;
            const curItem = studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex];
            if (curItem) {
              curItem.imageDuration = dur;
            }
            if (studioState.audioClips && studioState.audioClips[0] && (studioState.mode === 'story' || studioState.mode === 'reel')) {
              studioState.audioEnd = Math.min(studioState.audioDuration || dur, dur);
              studioState.audioClips[0].end = studioState.audioEnd;
            }
            renderTabContent('main');
            renderTimeline();
            updateTimelineNeedle();
            takeSnapshot('Change photo duration');
          };
        });

        // 2. Bộ lọc màu Instagram
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

        container.querySelectorAll('.igt-filter-chip').forEach(chip => {
          chip.onclick = () => {
            const fId = chip.getAttribute('data-filter');
            studioState.imageFilter = fId;
            container.querySelectorAll('.igt-filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            applyMediaFilters();
            takeSnapshot('Change photo filter');
          };
        });

        // 3. Cắt xoay & Lật ảnh
        const btnRot90 = container.querySelector('#igt-btn-rotate-90');
        if (btnRot90) {
          btnRot90.onclick = () => {
            studioState.rotation = ((studioState.rotation || 0) + 90) % 360;
            updateMediaTransform();
            takeSnapshot('Rotate photo 90deg');
          };
        }

        const btnFlipH = container.querySelector('#igt-btn-flip-h');
        if (btnFlipH) {
          btnFlipH.onclick = () => {
            studioState.flipH = !studioState.flipH;
            btnFlipH.classList.toggle('active', studioState.flipH);
            updateMediaTransform();
            takeSnapshot('Flip horizontal');
          };
        }

        const btnFlipV = container.querySelector('#igt-btn-flip-v');
        if (btnFlipV) {
          btnFlipV.onclick = () => {
            studioState.flipV = !studioState.flipV;
            btnFlipV.classList.toggle('active', studioState.flipV);
            updateMediaTransform();
            takeSnapshot('Flip vertical');
          };
        }

        const sliderAngle = container.querySelector('#igt-slider-free-angle');
        const valAngle = container.querySelector('#igt-free-angle-val');
        if (sliderAngle) {
          sliderAngle.oninput = (e) => {
            studioState.freeAngle = parseInt(e.target.value, 10);
            if (valAngle) valAngle.innerText = studioState.freeAngle + '°';
            updateMediaTransform();
          };
          sliderAngle.onchange = () => {
            takeSnapshot('Free angle slider');
          };
        }

        // 4. Sliders tinh chỉnh màu sắc
        const bindAdjSlider = (id, prop, unit = '') => {
          const slider = container.querySelector('#slider-' + id);
          const val = container.querySelector('#val-' + id);
          if (slider) {
            slider.oninput = (e) => {
              studioState[prop] = parseFloat(e.target.value);
              if (val) val.innerText = studioState[prop] + unit;
              applyMediaFilters();
            };
            slider.onchange = () => {
              takeSnapshot('Adjust ' + prop);
            };
          }
        };
        bindAdjSlider('brightness', 'brightness', '%');
        bindAdjSlider('contrast', 'contrast', '%');
        bindAdjSlider('saturate', 'saturate', '%');
        bindAdjSlider('sepia', 'sepia', '%');
        bindAdjSlider('blur', 'blur', 'px');
        bindAdjSlider('vignette', 'vignette', '%');

        // Reset màu sắc
        const btnResetFilters = container.querySelector('#igt-btn-reset-filters');
        if (btnResetFilters) {
          btnResetFilters.onclick = () => {
            studioState.imageFilter = 'normal';
            studioState.brightness = 100;
            studioState.contrast = 100;
            studioState.saturate = 100;
            studioState.sepia = 0;
            studioState.blur = 0;
            studioState.vignette = 0;
            studioState.rotation = 0;
            studioState.freeAngle = 0;
            studioState.flipH = false;
            studioState.flipV = false;
            studioState.imageFx = 'none';
            renderTabContent('main');
            updateMediaTransform();
            applyMediaFilters();
            takeSnapshot('Reset photo adjustments');
          };
        }

        // 5. Special FX
        container.querySelectorAll('.igt-fx-pill').forEach(pill => {
          pill.onclick = () => {
            const fxId = pill.getAttribute('data-fx');
            studioState.imageFx = fxId;
            container.querySelectorAll('.igt-fx-pill').forEach(p => {
              const isActive = (p === pill);
              p.classList.toggle('active', isActive);
              p.style.background = isActive ? '#0095f6' : 'rgba(255,255,255,0.06)';
              p.style.borderColor = isActive ? '#0095f6' : 'rgba(255,255,255,0.1)';
            });
            updateFxOverlay();
            takeSnapshot('Change special FX');
          };
        });
      }
    } else if (tab === 'link') {
      const isEditing = !!studioState.activeEditingStickerId;
      const editingSticker = isEditing ? studioState.stickers.find(s => s.id === studioState.activeEditingStickerId && s.type === 'link') : null;

      const currentUrl = editingSticker ? (editingSticker.url || '') : 'https://';
      const currentText = editingSticker ? (editingSticker.text || '') : 'XEM LIÊN KẾT';
      const currentStyle = editingSticker ? (editingSticker.style || studioState.linkStyle || 'default') : (studioState.linkStyle || 'default');

      container.innerHTML = `
        <div class="igt-studio-setting-group">
          ${editingSticker ? `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; background: rgba(0, 149, 246, 0.15); border: 1px solid rgba(0, 149, 246, 0.35); padding: 8px 10px; border-radius: 8px;">
              <span style="font-size: 11.5px; font-weight: 700; color: #38bdf8;">✏️ Chế độ sửa Liên kết</span>
              <button type="button" id="igt-btn-new-link-mode" style="background: transparent; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">+ Soạn mới</button>
            </div>
          ` : `
            <div class="igt-studio-setting-title">🔗 Nhãn dán Liên kết (Link)</div>
          `}
          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Đường dẫn URL</label>
          <input type="text" id="igt-link-url" class="igt-studio-input" placeholder="https://..." value="${escapeHtml(currentUrl)}" />

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tên nhãn hiển thị</label>
          <input type="text" id="igt-link-text" class="igt-studio-input" placeholder="Ví dụ: Xem ngay, Mua ngay..." value="${escapeHtml(currentText)}" />

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Kiểu nhãn (Style)</label>
          <select id="igt-link-style" class="igt-studio-select" style="margin-bottom: 14px;">
            <option value="default" ${currentStyle === 'default' ? 'selected' : ''}>Mặc định (Nền trắng chữ đen)</option>
            <option value="blue" ${currentStyle === 'blue' ? 'selected' : ''}>Xanh Instagram (Nền xanh chữ trắng)</option>
            <option value="dark" ${currentStyle === 'dark' ? 'selected' : ''}>Đen mờ (Nền tối viền mảnh)</option>
            <option value="gradient" ${currentStyle === 'gradient' ? 'selected' : ''}>Gradient (Cam hồng Instagram)</option>
          </select>

          ${editingSticker ? `
            <button type="button" id="igt-btn-finish-edit-link" class="igt-studio-btn-add" style="background: linear-gradient(135deg, #10b981, #059669); margin-bottom: 8px;">
              ✓ Hoàn tất chỉnh sửa
            </button>
            <button type="button" id="igt-btn-add-another-link" class="igt-studio-btn-add" style="background: rgba(255,255,255,0.08); color: #f1f5f9; border: 1px solid rgba(255,255,255,0.15);">
              + Thêm làm link mới
            </button>
          ` : `
            <button type="button" id="igt-btn-add-link" class="igt-studio-btn-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Thêm Link Sticker vào Canvas</span>
            </button>
          `}
        </div>
      `;

      const urlInput = container.querySelector('#igt-link-url');
      const textInput = container.querySelector('#igt-link-text');
      const styleSelect = container.querySelector('#igt-link-style');

      if (urlInput) {
        urlInput.oninput = (e) => {
          if (editingSticker) {
            editingSticker.url = e.target.value.trim();
          }
        };
        urlInput.onchange = () => {
          if (editingSticker) takeSnapshot('Edit link URL');
        };
      }

      if (textInput) {
        textInput.oninput = (e) => {
          if (editingSticker) {
            editingSticker.text = e.target.value || 'XEM LIÊN KẾT';
            renderStickers();
          }
        };
        textInput.onchange = () => {
          if (editingSticker) takeSnapshot('Edit link text');
        };
      }

      if (styleSelect) {
        styleSelect.onchange = (e) => {
          studioState.linkStyle = e.target.value;
          if (editingSticker) {
            editingSticker.style = e.target.value;
            renderStickers();
            takeSnapshot('Change link style');
          }
        };
      }

      const btnFinishLink = container.querySelector('#igt-btn-finish-edit-link');
      if (btnFinishLink) {
        btnFinishLink.onclick = () => {
          studioState.activeEditingStickerId = null;
          takeSnapshot('Finish edit link');
          renderStickers();
          renderTabContent('link');
        };
      }

      const btnNewLink = container.querySelector('#igt-btn-new-link-mode');
      if (btnNewLink) {
        btnNewLink.onclick = () => {
          studioState.activeEditingStickerId = null;
          renderStickers();
          renderTabContent('link');
        };
      }

      const btnAddLink = container.querySelector('#igt-btn-add-link');
      const btnAddAnotherLink = container.querySelector('#igt-btn-add-another-link');
      const handleAddNewLink = () => {
        const url = (urlInput && urlInput.value.trim()) ? urlInput.value.trim() : 'https://instagram.com';
        const text = (textInput && textInput.value.trim()) ? textInput.value.trim() : 'XEM LIÊN KẾT';
        const style = styleSelect ? styleSelect.value : 'default';
        studioState.linkStyle = style;

        addSticker({
          type: 'link',
          url,
          text,
          style,
          y: 70
        });
        studioState.activeEditingStickerId = null;
        renderStickers();
        renderTabContent('link');
      };

      if (btnAddLink) btnAddLink.onclick = handleAddNewLink;
      if (btnAddAnotherLink) btnAddAnotherLink.onclick = handleAddNewLink;
    } else if (tab === 'text') {
      const isEditing = !!studioState.activeEditingStickerId;
      const editingSticker = isEditing ? studioState.stickers.find(s => s.id === studioState.activeEditingStickerId) : null;

      const currentText = editingSticker ? (editingSticker.text || '') : 'Nội dung mẫu ✨';
      const currentSize = editingSticker ? (editingSticker.fontSize || 20) : studioState.textSize;
      const currentColor = editingSticker ? (editingSticker.color || '#ffffff') : studioState.textColor;
      const currentIsBox = editingSticker ? !!editingSticker.isBox : studioState.textIsBox;
      const currentFont = editingSticker ? (editingSticker.fontFamily || 'system') : (studioState.textFontFamily || 'system');
      const currentEffect = editingSticker ? (editingSticker.effect || 'none') : (studioState.textEffect || 'none');

      container.innerHTML = `
        <div class="igt-studio-setting-group">
          ${isEditing ? `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; background: rgba(0, 149, 246, 0.15); border: 1px solid rgba(0, 149, 246, 0.35); padding: 8px 10px; border-radius: 8px;">
              <span style="font-size: 11.5px; font-weight: 700; color: #38bdf8;">✏️ Chế độ chỉnh sửa chữ</span>
              <button type="button" id="igt-btn-new-text-mode" style="background: transparent; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">+ Soạn mới</button>
            </div>
          ` : `
            <div class="igt-studio-setting-title">🔤 Thêm văn bản (Text)</div>
          `}
          
          <textarea id="igt-text-content" rows="3" class="igt-studio-input" placeholder="Nhập chữ muốn chèn lên Story / Post...">${escapeHtml(currentText)}</textarea>

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Phông chữ (Font Style)</label>
          <select id="igt-text-font-family" class="igt-studio-select" style="margin-bottom: 12px;">
            <option value="system" ${currentFont === 'system' ? 'selected' : ''}>Hiện đại (Modern Sans-serif)</option>
            <option value="serif" ${currentFont === 'serif' ? 'selected' : ''}>Cổ điển (Classic Serif)</option>
            <option value="monospace" ${currentFont === 'monospace' ? 'selected' : ''}>Máy đánh chữ (Typewriter)</option>
            <option value="cursive" ${currentFont === 'cursive' ? 'selected' : ''}>Viết tay (Handwriting / Cursive)</option>
            <option value="impact" ${currentFont === 'impact' ? 'selected' : ''}>Poster đậm (Impact / Bold)</option>
          </select>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="font-size: 11px; color: #94a3b8;">Cỡ chữ (Font Size)</label>
            <span id="igt-text-size-val" style="font-size: 11px; color: #0095f6; font-weight: 700;">${currentSize}px</span>
          </div>
          <input type="range" id="igt-text-size-slider" min="14" max="42" step="1" value="${currentSize}" style="width: 100%; accent-color: #0095f6; margin-bottom: 12px; cursor: pointer;" />

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 6px; display: block;">Màu chữ</label>
          <div class="igt-studio-color-palette" id="igt-text-palette">
            <div class="igt-studio-color-dot ${currentColor === '#ffffff' ? 'active' : ''}" data-color="#ffffff" style="background: #ffffff;" title="Trắng"></div>
            <div class="igt-studio-color-dot ${currentColor === '#000000' ? 'active' : ''}" data-color="#000000" style="background: #000000; border: 1px solid #444;" title="Đen"></div>
            <div class="igt-studio-color-dot ${currentColor === '#ef4444' ? 'active' : ''}" data-color="#ef4444" style="background: #ef4444;" title="Đỏ"></div>
            <div class="igt-studio-color-dot ${currentColor === '#f97316' ? 'active' : ''}" data-color="#f97316" style="background: #f97316;" title="Cam"></div>
            <div class="igt-studio-color-dot ${currentColor === '#eab308' ? 'active' : ''}" data-color="#eab308" style="background: #eab308;" title="Vàng"></div>
            <div class="igt-studio-color-dot ${currentColor === '#10b981' ? 'active' : ''}" data-color="#10b981" style="background: #10b981;" title="Xanh lá"></div>
            <div class="igt-studio-color-dot ${currentColor === '#0095f6' ? 'active' : ''}" data-color="#0095f6" style="background: #0095f6;" title="Xanh dương"></div>
            <div class="igt-studio-color-dot ${currentColor === '#ec4899' ? 'active' : ''}" data-color="#ec4899" style="background: #ec4899;" title="Hồng"></div>
          </div>

          <label style="font-size: 11px; color: #94a3b8; margin-top: 10px; margin-bottom: 6px; display: block;">Hiệu ứng chữ Story (Text Effects)</label>
          <div class="igt-text-effects-grid" id="igt-text-effects-grid">
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'none' ? 'active' : ''}" data-effect="none" title="Chữ tiêu chuẩn, sắc nét">
              <span>Chuẩn</span>
            </button>
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'glow' ? 'active' : ''}" data-effect="glow" title="Hào quang phát sáng tỏa mờ xung quanh chữ">
              <span class="fx-preview-glow">Glow ✨</span>
            </button>
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'neon' ? 'active' : ''}" data-effect="neon" title="Đèn Neon Sign rực rỡ phong cách Instagram">
              <span class="fx-preview-neon">Neon 💡</span>
            </button>
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'gradient_stroke' ? 'active' : ''}" data-effect="gradient_stroke" title="Viền đa sắc gradient nổi bật">
              <span class="fx-preview-gradient">Gradient 🎨</span>
            </button>
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'shadow_3d' ? 'active' : ''}" data-effect="shadow_3d" title="Đổ bóng 3D khối Retro Pop">
              <span class="fx-preview-3d">Bóng 3D 🧊</span>
            </button>
            <button type="button" class="igt-text-effect-btn ${currentEffect === 'glitch' ? 'active' : ''}" data-effect="glitch" title="Hiệu ứng chập màu Cyber Glitch">
              <span class="fx-preview-glitch">Glitch ⚡</span>
            </button>
          </div>

          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #e2e8f0; margin-bottom: 14px; cursor: pointer;">
            <input type="checkbox" id="igt-text-box-toggle" ${currentIsBox ? 'checked' : ''} style="accent-color: #0095f6; width: 16px; height: 16px;" />
            <span>Đổ khung nền nổi bật (Box style)</span>
          </label>

          ${isEditing ? `
            <button type="button" id="igt-btn-finish-edit-text" class="igt-studio-btn-add" style="background: linear-gradient(135deg, #10b981, #059669); margin-bottom: 8px;">
              ✓ Hoàn tất chỉnh sửa
            </button>
            <button type="button" id="igt-btn-add-another-text" class="igt-studio-btn-add" style="background: rgba(255,255,255,0.08); color: #f1f5f9; border: 1px solid rgba(255,255,255,0.15);">
              + Thêm làm chữ mới
            </button>
          ` : `
            <button type="button" id="igt-btn-add-text" class="igt-studio-btn-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Thêm chữ lên Canvas</span>
            </button>
          `}
        </div>
      `;

      // Live update khi đang chỉnh sửa
      const contentEl = container.querySelector('#igt-text-content');
      const fontSelect = container.querySelector('#igt-text-font-family');
      const slider = container.querySelector('#igt-text-size-slider');
      const valLabel = container.querySelector('#igt-text-size-val');
      const boxToggle = container.querySelector('#igt-text-box-toggle');

      if (contentEl) {
        contentEl.oninput = (e) => {
          if (editingSticker) {
            editingSticker.text = e.target.value;
            renderStickers();
          }
        };
        contentEl.onchange = () => {
          if (editingSticker) takeSnapshot('Edit text content');
        };
      }

      if (fontSelect) {
        fontSelect.onchange = (e) => {
          studioState.textFontFamily = e.target.value;
          if (editingSticker) {
            editingSticker.fontFamily = e.target.value;
            renderStickers();
            takeSnapshot('Change text font');
          }
        };
      }

      if (slider && valLabel) {
        slider.oninput = (e) => {
          const val = parseInt(e.target.value, 10);
          studioState.textSize = val;
          valLabel.innerText = val + 'px';
          if (editingSticker) {
            editingSticker.fontSize = val;
            renderStickers();
          }
        };
        slider.onchange = () => {
          if (editingSticker) takeSnapshot('Change text size');
        };
      }

      // Color palette
      container.querySelectorAll('.igt-studio-color-dot').forEach(dot => {
        dot.onclick = () => {
          container.querySelectorAll('.igt-studio-color-dot').forEach(d => d.classList.remove('active'));
          dot.classList.add('active');
          const color = dot.getAttribute('data-color');
          studioState.textColor = color;
          if (editingSticker) {
            editingSticker.color = color;
            renderStickers();
            takeSnapshot('Change text color');
          }
        };
      });

      // Hiệu ứng chữ Instagram (Glow, Neon, Gradient Stroke, 3D, Glitch)
      container.querySelectorAll('.igt-text-effect-btn').forEach(btn => {
        btn.onclick = () => {
          container.querySelectorAll('.igt-text-effect-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const eff = btn.getAttribute('data-effect') || 'none';
          studioState.textEffect = eff;
          if (editingSticker) {
            editingSticker.effect = eff;
            renderStickers();
            takeSnapshot('Change text effect: ' + eff);
          }
        };
      });

      if (boxToggle) {
        boxToggle.onchange = (e) => {
          studioState.textIsBox = e.target.checked;
          if (editingSticker) {
            editingSticker.isBox = e.target.checked;
            renderStickers();
            takeSnapshot('Toggle text box');
          }
        };
      }

      // Nút hoàn tất chỉnh sửa
      const btnFinish = container.querySelector('#igt-btn-finish-edit-text');
      if (btnFinish) {
        btnFinish.addEventListener('click', () => {
          studioState.activeEditingStickerId = null;
          takeSnapshot('Finish edit text');
          renderTabContent('text');
        });
      }

      // Nút chuyển về chế độ soạn mới
      const btnNewMode = container.querySelector('#igt-btn-new-text-mode');
      if (btnNewMode) {
        btnNewMode.addEventListener('click', () => {
          studioState.activeEditingStickerId = null;
          renderTabContent('text');
        });
      }

      // Nút thêm chữ mới (hoặc duplicate)
      const btnAddText = container.querySelector('#igt-btn-add-text');
      const btnAddAnother = container.querySelector('#igt-btn-add-another-text');
      const handleAddNewText = () => {
        const text = (contentEl && contentEl.value.trim()) ? contentEl.value.trim() : 'Nội dung chữ';
        const font = fontSelect ? fontSelect.value : (studioState.textFontFamily || 'system');
        addSticker({
          type: 'text',
          text,
          fontSize: studioState.textSize,
          color: studioState.textColor,
          isBox: studioState.textIsBox,
          fontFamily: font,
          effect: studioState.textEffect || 'none',
          y: 40
        });
        studioState.activeEditingStickerId = null;
        renderTabContent('text');
      };

      if (btnAddText) btnAddText.addEventListener('click', handleAddNewText);
      if (btnAddAnother) btnAddAnother.addEventListener('click', handleAddNewText);
    } else if (tab === 'stickers') {
      const INSTAGRAM_WIDGETS = [
        {
          type: 'poll',
          icon: '📊',
          name: 'Bình chọn (Poll)',
          desc: 'Khung CÓ / KHÔNG',
          defaults: { question: 'Bình chọn ngay?', optA: 'CÓ 👍', optB: 'KHÔNG 👎' }
        },
        {
          type: 'question',
          icon: '❓',
          name: 'Đặt câu hỏi (Q&A)',
          desc: 'Hộp câu hỏi cho người xem',
          defaults: { header: 'Hỏi tôi một điều gì đó...' }
        },
        {
          type: 'countdown',
          icon: '⏳',
          name: 'Đếm ngược (Timer)',
          desc: 'Đếm ngược sự kiện, sinh nhật',
          defaults: { title: 'Sự kiện sắp diễn ra 🎉' }
        },
        {
          type: 'music_player',
          icon: '🎵',
          name: 'Trình phát nhạc',
          desc: 'Khung bài hát kèm đĩa than xoay',
          defaults: { song: 'Trending Sound 🔥', artist: 'Instagram Audio' }
        },
        {
          type: 'emoji_slider',
          icon: '😍',
          name: 'Thước đo cảm xúc',
          desc: 'Kéo thanh trượt biểu tượng',
          defaults: { question: 'Mức độ thích?', emoji: '😍' }
        },
        {
          type: 'add_yours',
          icon: '📷',
          name: 'Lượt tiếp theo',
          desc: 'Add Yours chia sẻ ảnh bạn bè',
          defaults: { prompt: 'Chia sẻ ảnh đẹp của bạn' }
        }
      ];

      const BADGES = [
        { text: '⚡ NEW POST', badgeStyle: 'gradient' },
        { text: '🔗 LINK IN BIO', badgeStyle: 'neon' },
        { text: '🔊 SOUND ON', badgeStyle: 'dark' },
        { text: '🎁 GIVEAWAY', badgeStyle: 'gold' },
        { text: '🔥 HOT DEAL', badgeStyle: 'gradient' },
        { text: '✨ COMING SOON', badgeStyle: 'neon' },
        { text: '📍 CHECK-IN', badgeStyle: 'neon' },
        { text: '⭐ VIP ONLY', badgeStyle: 'gold' },
        { text: '☕ MORNING', badgeStyle: 'dark' },
        { text: '🌙 GOOD NIGHT', badgeStyle: 'dark' },
        { text: '💪 GYM TIME', badgeStyle: 'neon' },
        { text: '❓ Q & A', badgeStyle: 'dark' },
        { text: '💖 LOVED IT', badgeStyle: 'gradient' },
        { text: '🚨 BREAKING NEWS', badgeStyle: 'neon' },
        { text: '🛒 SHOP NOW', badgeStyle: 'gold' },
        { text: '🎯 TAP HERE', badgeStyle: 'gradient' }
      ];

      const EMOJIS = [
        '🔥', '✨', '❤️', '💯', '😂', '😍',
        '👏', '🥳', '🚀', '💡', '⚡', '🌟',
        '👑', '🌈', '🎉', '☕', '💎', '🎯',
        '🏖️', '✈️', '📸', '🎵', '🍕', '🍻',
        '⭐', '🍀', '💪', '🌸', '🎁', '🏆',
        '👀', '😱', '🤤', '🤙', '💖', '🥂'
      ];

      let activeFilter = 'all';
      let searchQuery = '';

      const isEditingStk = !!studioState.activeEditingStickerId;
      const editingSticker = isEditingStk ? studioState.stickers.find(s => s.id === studioState.activeEditingStickerId && ['poll', 'question', 'countdown', 'music_player', 'emoji_slider', 'add_yours', 'badge'].includes(s.type)) : null;

      let editBoxHtml = '';
      if (editingSticker) {
        let fieldsHtml = '';
        let typeTitle = 'Sticker Tương Tác';
        if (editingSticker.type === 'poll') {
          typeTitle = 'Bình chọn (Poll)';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Câu hỏi bình chọn:</label>
            <input type="text" id="igt-edit-stk-q" class="igt-studio-input" value="${escapeHtml(editingSticker.question || '')}" placeholder="Bình chọn ngay?" style="margin-bottom: 8px;" />
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 10px; color: #94a3b8; margin-bottom: 3px; display: block;">Lựa chọn 1:</label>
                <input type="text" id="igt-edit-stk-optA" class="igt-studio-input" value="${escapeHtml(editingSticker.optA || '')}" placeholder="CÓ 👍" />
              </div>
              <div>
                <label style="font-size: 10px; color: #94a3b8; margin-bottom: 3px; display: block;">Lựa chọn 2:</label>
                <input type="text" id="igt-edit-stk-optB" class="igt-studio-input" value="${escapeHtml(editingSticker.optB || '')}" placeholder="KHÔNG 👎" />
              </div>
            </div>
          `;
        } else if (editingSticker.type === 'question') {
          typeTitle = 'Đặt câu hỏi (Q&A)';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tiêu đề câu hỏi / Lời mời:</label>
            <input type="text" id="igt-edit-stk-header" class="igt-studio-input" value="${escapeHtml(editingSticker.header || '')}" placeholder="Hỏi tôi một điều gì đó..." />
          `;
        } else if (editingSticker.type === 'countdown') {
          typeTitle = 'Đếm ngược (Timer)';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tên sự kiện đếm ngược:</label>
            <input type="text" id="igt-edit-stk-title" class="igt-studio-input" value="${escapeHtml(editingSticker.title || '')}" placeholder="Sự kiện sắp diễn ra 🎉" style="margin-bottom: 8px;" />
            <label style="font-size: 10.5px; color: #94a3b8; margin-bottom: 4px; display: block;">Thời gian đếm ngược (Ngày / Giờ / Phút):</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <span style="font-size: 9.5px; color: #64748b; display: block; text-align: center;">Ngày</span>
                <input type="text" id="igt-edit-stk-days" class="igt-studio-input" style="text-align: center; font-weight: 700;" value="${escapeHtml(editingSticker.days || '05')}" />
              </div>
              <div>
                <span style="font-size: 9.5px; color: #64748b; display: block; text-align: center;">Giờ</span>
                <input type="text" id="igt-edit-stk-hours" class="igt-studio-input" style="text-align: center; font-weight: 700;" value="${escapeHtml(editingSticker.hours || '12')}" />
              </div>
              <div>
                <span style="font-size: 9.5px; color: #64748b; display: block; text-align: center;">Phút</span>
                <input type="text" id="igt-edit-stk-mins" class="igt-studio-input" style="text-align: center; font-weight: 700;" value="${escapeHtml(editingSticker.mins || '30')}" />
              </div>
            </div>
          `;
        } else if (editingSticker.type === 'music_player') {
          typeTitle = 'Trình phát nhạc';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tên bài hát:</label>
            <input type="text" id="igt-edit-stk-song" class="igt-studio-input" value="${escapeHtml(editingSticker.song || '')}" placeholder="Trending Sound 🔥" style="margin-bottom: 8px;" />
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Nghệ sĩ / Ca sĩ:</label>
            <input type="text" id="igt-edit-stk-artist" class="igt-studio-input" value="${escapeHtml(editingSticker.artist || '')}" placeholder="Instagram Original Audio" />
          `;
        } else if (editingSticker.type === 'emoji_slider') {
          typeTitle = 'Thước đo cảm xúc';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Câu hỏi cảm xúc:</label>
            <input type="text" id="igt-edit-stk-slider-q" class="igt-studio-input" value="${escapeHtml(editingSticker.question || '')}" placeholder="Mức độ thích?" style="margin-bottom: 8px;" />
            <label style="font-size: 10.5px; color: #94a3b8; margin-bottom: 4px; display: block;">Biểu tượng cảm xúc (Emoji):</label>
            <div style="display: flex; gap: 5px; align-items: center; margin-bottom: 6px;">
              <input type="text" id="igt-edit-stk-emoji" class="igt-studio-input" style="width: 50px; text-align: center; font-size: 16px; margin-bottom: 0;" value="${editingSticker.emoji || '😍'}" />
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                ${['😍', '🔥', '❤️', '😭', '🚀', '👏', '✨', '💯'].map(em => `
                  <button type="button" class="igt-slider-emoji-pick" data-emoji="${em}" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 4px 6px; font-size: 13px; cursor: pointer;">${em}</button>
                `).join('')}
              </div>
            </div>
          `;
        } else if (editingSticker.type === 'add_yours') {
          typeTitle = 'Lượt tiếp theo (Add Yours)';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Chủ đề chia sẻ (Prompt):</label>
            <input type="text" id="igt-edit-stk-prompt" class="igt-studio-input" value="${escapeHtml(editingSticker.prompt || '')}" placeholder="Chia sẻ ảnh đẹp của bạn" />
          `;
        } else if (editingSticker.type === 'badge') {
          typeTitle = 'Huy hiệu Story';
          fieldsHtml = `
            <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Nội dung huy hiệu:</label>
            <input type="text" id="igt-edit-stk-badge-txt" class="igt-studio-input" value="${escapeHtml(editingSticker.text || '')}" placeholder="NEW POST" style="margin-bottom: 8px;" />
            <label style="font-size: 10.5px; color: #94a3b8; margin-bottom: 4px; display: block;">Kiểu hiệu ứng:</label>
            <div style="display: flex; gap: 5px;">
              ${['gradient', 'neon', 'dark', 'gold'].map(st => `
                <button type="button" class="igt-badge-style-pick ${(editingSticker.badgeStyle || 'gradient') === st ? 'active' : ''}" data-style="${st}" style="flex: 1; padding: 5px 0; border-radius: 6px; font-size: 10px; font-weight: 700; cursor: pointer; text-transform: uppercase;">${st}</button>
              `).join('')}
            </div>
          `;
        }

        if (fieldsHtml) {
          editBoxHtml = `
            <div class="igt-studio-setting-group" style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 12px; padding: 12px; margin-bottom: 12px; box-shadow: 0 4px 20px rgba(0, 149, 246, 0.2);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 12px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 5px;">
                  ✏️ Đang sửa: ${typeTitle}
                </span>
                <button type="button" id="igt-btn-close-stk-edit" style="background: none; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;" title="Đóng chế độ sửa">✕ Đóng</button>
              </div>
              ${fieldsHtml}
              <div style="display: flex; gap: 8px; margin-top: 12px;">
                <button type="button" id="igt-btn-finish-stk-edit" class="igt-studio-btn-primary" style="flex: 1; padding: 8px 12px; font-size: 11.5px; font-weight: 700; border-radius: 8px; background: linear-gradient(135deg, #0095f6, #0284c7); border: none; color: #fff; cursor: pointer;">✓ Hoàn tất sửa</button>
                <button type="button" id="igt-btn-delete-stk-edit" class="igt-studio-btn-danger" style="padding: 8px 12px; font-size: 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; cursor: pointer;" title="Xóa sticker này khỏi Story">🗑️</button>
              </div>
            </div>
          `;
        }
      }

      // Render một lần duy nhất Shell giao diện (Header, Nút tải lên, Ô tìm kiếm, Dải Tabs Filter)
      // KHÔNG render lại innerHTML của container khi click tab để chống nhảy giật layout (Fix tag jumping)!
      container.innerHTML = `
        ${editBoxHtml}
        <div class="igt-studio-setting-group" style="padding-bottom: 4px;">
          <div style="margin-bottom: 8px;">
            <div class="igt-studio-setting-title" style="margin: 0;">🎬 STICKER & TƯƠNG TÁC INSTAGRAM</div>
          </div>

          <!-- Nút Tải lên Sticker GIF động của riêng bạn -->
          <button type="button" id="igt-btn-upload-gif" class="igt-btn-upload-gif" title="Chọn bất kỳ tệp GIF hoặc WebP động nào từ máy tính">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            <span>🎬 Tải lên Sticker GIF / Ảnh từ máy tính</span>
          </button>
          <input type="file" id="igt-sticker-gif-input" accept="image/gif,image/webp,image/png,image/jpeg" style="display: none;" />

          <div class="igt-sticker-search-box">
            <input type="text" id="igt-sticker-search-input" class="igt-studio-input" placeholder="🔍 Tìm sticker (bình chọn, nhạc, tim, lửa, mèo...)" style="margin-bottom: 8px;" />
          </div>

          <div class="igt-sticker-filter-pills" id="igt-sticker-filter-pills-row">
            <button type="button" class="igt-sticker-filter-pill active" data-cat="all">🌟 Tất cả</button>
            <button type="button" class="igt-sticker-filter-pill" data-cat="widgets">🔥 Tương tác IG</button>
            <button type="button" class="igt-sticker-filter-pill" data-cat="badges">🏷️ Huy hiệu Story</button>
            <button type="button" class="igt-sticker-filter-pill" data-cat="google_3d">✨ 3D Google Động</button>
            <button type="button" class="igt-sticker-filter-pill" data-cat="emojis">😀 Emojis Hot</button>
          </div>
        </div>

        <div id="igt-sticker-dynamic-body" style="display: flex; flex-direction: column; gap: 12px; margin-top: 4px;"></div>
      `;

      if (editingSticker) {
        // Poll
        const inPollQ = container.querySelector('#igt-edit-stk-q');
        const inPollA = container.querySelector('#igt-edit-stk-optA');
        const inPollB = container.querySelector('#igt-edit-stk-optB');
        if (inPollQ) inPollQ.oninput = () => { editingSticker.question = inPollQ.value; renderStickers(); };
        if (inPollA) inPollA.oninput = () => { editingSticker.optA = inPollA.value; renderStickers(); };
        if (inPollB) inPollB.oninput = () => { editingSticker.optB = inPollB.value; renderStickers(); };

        // Question
        const inQaH = container.querySelector('#igt-edit-stk-header');
        if (inQaH) inQaH.oninput = () => { editingSticker.header = inQaH.value; renderStickers(); };

        // Countdown
        const inCdT = container.querySelector('#igt-edit-stk-title');
        const inCdD = container.querySelector('#igt-edit-stk-days');
        const inCdH = container.querySelector('#igt-edit-stk-hours');
        const inCdM = container.querySelector('#igt-edit-stk-mins');
        if (inCdT) inCdT.oninput = () => { editingSticker.title = inCdT.value; renderStickers(); };
        if (inCdD) inCdD.oninput = () => { editingSticker.days = inCdD.value; renderStickers(); };
        if (inCdH) inCdH.oninput = () => { editingSticker.hours = inCdH.value; renderStickers(); };
        if (inCdM) inCdM.oninput = () => { editingSticker.mins = inCdM.value; renderStickers(); };

        // Music
        const inMusSong = container.querySelector('#igt-edit-stk-song');
        const inMusArt = container.querySelector('#igt-edit-stk-artist');
        if (inMusSong) inMusSong.oninput = () => { editingSticker.song = inMusSong.value; renderStickers(); };
        if (inMusArt) inMusArt.oninput = () => { editingSticker.artist = inMusArt.value; renderStickers(); };

        // Emoji slider
        const inSlQ = container.querySelector('#igt-edit-stk-slider-q');
        const inSlEm = container.querySelector('#igt-edit-stk-emoji');
        if (inSlQ) inSlQ.oninput = () => { editingSticker.question = inSlQ.value; renderStickers(); };
        if (inSlEm) inSlEm.oninput = () => { editingSticker.emoji = inSlEm.value; renderStickers(); };
        container.querySelectorAll('.igt-slider-emoji-pick').forEach(btn => {
          btn.onclick = () => {
            const em = btn.getAttribute('data-emoji');
            editingSticker.emoji = em;
            if (inSlEm) inSlEm.value = em;
            renderStickers();
          };
        });

        // Add Yours
        const inAyPr = container.querySelector('#igt-edit-stk-prompt');
        if (inAyPr) inAyPr.oninput = () => { editingSticker.prompt = inAyPr.value; renderStickers(); };

        // Badge
        const inBdTxt = container.querySelector('#igt-edit-stk-badge-txt');
        if (inBdTxt) inBdTxt.oninput = () => { editingSticker.text = inBdTxt.value; renderStickers(); };
        container.querySelectorAll('.igt-badge-style-pick').forEach(btn => {
          btn.onclick = () => {
            const st = btn.getAttribute('data-style');
            editingSticker.badgeStyle = st;
            container.querySelectorAll('.igt-badge-style-pick').forEach(b => b.classList.toggle('active', b === btn));
            renderStickers();
          };
        });

        // Close / Finish / Delete
        const btnCloseEdit = container.querySelector('#igt-btn-close-stk-edit');
        const btnFinishEdit = container.querySelector('#igt-btn-finish-stk-edit');
        const btnDelEdit = container.querySelector('#igt-btn-delete-stk-edit');

        if (btnCloseEdit) {
          btnCloseEdit.onclick = () => {
            studioState.activeEditingStickerId = null;
            renderStickers();
            renderTabContent('stickers');
          };
        }
        if (btnFinishEdit) {
          btnFinishEdit.onclick = () => {
            takeSnapshot(`Sửa nội dung sticker ${editingSticker.type}`);
            studioState.activeEditingStickerId = null;
            renderStickers();
            renderTabContent('stickers');
          };
        }
        if (btnDelEdit) {
          btnDelEdit.onclick = () => {
            removeSticker(editingSticker.id);
            studioState.activeEditingStickerId = null;
            renderTabContent('stickers');
          };
        }
      }

      const dynamicBody = container.querySelector('#igt-sticker-dynamic-body');

      const updateDynamicStickerGrid = () => {
        if (!dynamicBody) return;
        const q = searchQuery.toLowerCase().trim();

        // 1. Lọc Widgets IG
        const filteredWidgets = INSTAGRAM_WIDGETS.filter(w => {
          if (activeFilter !== 'all' && activeFilter !== 'widgets') return false;
          if (!q) return true;
          return w.name.toLowerCase().includes(q) || w.desc.toLowerCase().includes(q);
        });

        // 2. Lọc Badges
        const filteredBadges = BADGES.filter(b => {
          if (activeFilter !== 'all' && activeFilter !== 'badges') return false;
          if (!q) return true;
          return b.text.toLowerCase().includes(q);
        });

        // 3. Lọc Google 3D
        const filteredGoogle = GOOGLE_NOTO_STICKERS.filter(s => {
          if (activeFilter !== 'all' && activeFilter !== 'google_3d') return false;
          if (!q) return true;
          return s.name.toLowerCase().includes(q) || s.emoji.includes(q);
        });

        // 4. Lọc Emojis
        const showEmojis = (activeFilter === 'all' || activeFilter === 'emojis') && !q;

        let html = '';

        // Block 1: Interactive Widgets IG
        if (filteredWidgets.length > 0) {
          html += `
            <div class="igt-studio-setting-group">
              <div class="igt-studio-setting-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>STICKER TƯƠNG TÁC</span>
                <span style="font-size: 9.5px; color: #38bdf8; font-weight: 600;">Click để chèn</span>
              </div>
              <div class="igt-ig-widget-grid">
                ${filteredWidgets.map(w => `
                  <button type="button" class="igt-ig-widget-card" data-widget-type="${w.type}">
                    <div class="igt-ig-widget-icon">${w.icon}</div>
                    <div class="igt-ig-widget-name">${escapeHtml(w.name)}</div>
                    <div class="igt-ig-widget-sub">${escapeHtml(w.desc)}</div>
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }

        // Block 2: Badges
        if (filteredBadges.length > 0) {
          html += `
            <div class="igt-studio-setting-group">
              <div class="igt-studio-setting-title">🏷️ HUY HIỆU STORY VIRAL (${filteredBadges.length})</div>
              <div class="igt-badge-grid">
                ${filteredBadges.map(b => `
                  <button type="button" class="igt-badge-btn ${b.badgeStyle}" data-badge-text="${escapeHtml(b.text)}" data-badge-style="${b.badgeStyle}">
                    ${escapeHtml(b.text)}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }

        // Block 3: Google 3D Stickers
        if (filteredGoogle.length > 0) {
          html += `
            <div class="igt-studio-setting-group">
              <div class="igt-studio-setting-title" style="display:flex; justify-content:space-between; align-items:center;">
                <span>✨ STICKER GOOGLE 3D ĐỘNG (GIF 60FPS) (${filteredGoogle.length})</span>
                <span class="igt-gif-badge" style="position:static;">GIF</span>
              </div>
              <div class="igt-google-stickers-grid" id="igt-google-stickers-grid">
                ${filteredGoogle.map(g => {
            const cached = stickerDataUrlCache.get(g.url);
            return `
                    <button type="button" class="igt-google-sticker-btn" data-id="${g.id}" data-url="${g.url}" data-name="${escapeHtml(g.name)}" data-emoji="${g.emoji}" title="${escapeHtml(g.name)} (Sticker động GIF)">
                      <span class="igt-gif-badge">GIF</span>
                      <span class="igt-google-sticker-emoji" id="igt-stk-icon-${g.id}">
                        ${cached ? `<img class="igt-google-sticker-thumb" src="${cached}" alt="${escapeHtml(g.name)}" />` : g.emoji}
                      </span>
                      <span class="igt-google-sticker-name">${escapeHtml(g.name)}</span>
                    </button>
                  `;
          }).join('')}
              </div>
            </div>
          `;
        }

        // Block 4: Emojis
        if (showEmojis) {
          html += `
            <div class="igt-studio-setting-group">
              <div class="igt-studio-setting-title">😀 BIỂU TƯỢNG EMOJIS HOT</div>
              <div class="igt-emoji-grid">
                ${EMOJIS.map(em => `
                  <button type="button" class="igt-emoji-btn" data-emoji="${em}">
                    ${em}
                  </button>
                `).join('')}
              </div>
            </div>
          `;
        }

        if (!html) {
          html = `<div style="text-align:center; padding:24px 10px; color:#94a3b8; font-size:12px;">Không tìm thấy sticker phù hợp với "<b>${escapeHtml(searchQuery)}</b>"</div>`;
        }

        dynamicBody.innerHTML = html;

        // 1. Widgets IG click
        dynamicBody.querySelectorAll('.igt-ig-widget-card').forEach(btn => {
          btn.onclick = () => {
            const type = btn.getAttribute('data-widget-type');
            const found = INSTAGRAM_WIDGETS.find(w => w.type === type);
            if (found) {
              const newStk = addSticker({
                type: found.type,
                ...found.defaults,
                y: 45
              });
              if (newStk) {
                switchToEditSticker(newStk.id, 'stickers');
              }
            }
          };
        });

        // 2. Badges click
        dynamicBody.querySelectorAll('.igt-badge-btn').forEach(btn => {
          btn.onclick = () => {
            const text = btn.getAttribute('data-badge-text');
            const style = btn.getAttribute('data-badge-style') || 'gradient';
            const newStk = addSticker({
              type: 'badge',
              text,
              badgeStyle: style,
              y: 50
            });
            if (newStk) {
              switchToEditSticker(newStk.id, 'stickers');
            }
          };
        });

        // 3. Google Sticker click
        dynamicBody.querySelectorAll('.igt-google-sticker-btn').forEach(btn => {
          btn.onclick = () => {
            const url = btn.getAttribute('data-url');
            const name = btn.getAttribute('data-name');
            const emoji = btn.getAttribute('data-emoji') || '🔥';
            const cached = stickerDataUrlCache.get(url);

            if (cached) {
              addSticker({
                type: 'image_sticker',
                url: cached,
                name,
                isAnimated: true,
                y: 45
              });
            } else {
              addSticker({
                type: 'emoji',
                emoji,
                name,
                isAnimated: true,
                y: 45
              });
              fetchStickerDataUrl(url, (dataUrl) => {
                if (dataUrl) {
                  const lastStk = studioState.stickers[studioState.stickers.length - 1];
                  if (lastStk && lastStk.type === 'emoji' && lastStk.name === name) {
                    lastStk.type = 'image_sticker';
                    lastStk.url = dataUrl;
                    lastStk.isAnimated = true;
                    renderStickers();
                  }
                }
              });
            }
          };
        });

        // Prefetch Google 3D WebP/GIF
        filteredGoogle.forEach(g => {
          if (!stickerDataUrlCache.has(g.url)) {
            fetchStickerDataUrl(g.url, (dataUrl) => {
              if (dataUrl) {
                const iconEl = dynamicBody.querySelector(`#igt-stk-icon-${g.id}`);
                if (iconEl) {
                  iconEl.innerHTML = `<img class="igt-google-sticker-thumb" src="${dataUrl}" alt="${escapeHtml(g.name)}" />`;
                }
              }
            });
          }
        });

        // 4. Emojis click
        dynamicBody.querySelectorAll('.igt-emoji-btn').forEach(btn => {
          btn.onclick = () => {
            const emoji = btn.getAttribute('data-emoji');
            if (emoji) {
              addSticker({
                type: 'emoji',
                emoji,
                y: 50
              });
            }
          };
        });
      };

      // Search input handler - mượt mà, không re-render input, không mất focus
      const searchInp = container.querySelector('#igt-sticker-search-input');
      if (searchInp) {
        searchInp.oninput = (e) => {
          searchQuery = e.target.value;
          updateDynamicStickerGrid();
        };
      }

      // Filter pills click handler - CHỈ toggle class .active, KHÔNG re-render container, KHÔNG reset scroll!
      container.querySelectorAll('.igt-sticker-filter-pill').forEach(pill => {
        pill.onclick = () => {
          container.querySelectorAll('.igt-sticker-filter-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          activeFilter = pill.getAttribute('data-cat');
          updateDynamicStickerGrid();
        };
      });

      // Upload custom GIF / image from PC
      const btnUploadGif = container.querySelector('#igt-btn-upload-gif');
      const inputUploadGif = container.querySelector('#igt-sticker-gif-input');
      if (btnUploadGif && inputUploadGif) {
        btnUploadGif.onclick = () => inputUploadGif.click();
        inputUploadGif.onchange = (e) => {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', (ev) => {
              addSticker({
                type: 'image_sticker',
                url: ev.target.result,
                name: file.name.replace(/\.[^/.]+$/, ''),
                isAnimated: true,
                y: 45
              });
            }, { once: true });
            reader.readAsDataURL(file);
            inputUploadGif.value = '';
          }
        };
      }

      // Render danh sách ban đầu
      updateDynamicStickerGrid();

    } else if (tab === 'mentions') {
      const isEditing = !!studioState.activeEditingStickerId;
      const editingSticker = isEditing ? studioState.stickers.find(s => s.id === studioState.activeEditingStickerId && s.type === 'mention') : null;

      const currentUsername = editingSticker ? (editingSticker.username || '') : '';
      const currentStyle = editingSticker ? (editingSticker.mentionStyle || studioState.mentionStyle || 'white') : (studioState.mentionStyle || 'white');

      container.innerHTML = `
        <div class="igt-studio-setting-group">
          ${editingSticker ? `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; background: rgba(0, 149, 246, 0.15); border: 1px solid rgba(0, 149, 246, 0.35); padding: 8px 10px; border-radius: 8px;">
              <span style="font-size: 11.5px; font-weight: 700; color: #38bdf8;">✏️ Chế độ sửa Nhắc tên (@${escapeHtml(currentUsername || 'user')})</span>
              <button type="button" id="igt-btn-new-mention-mode" style="background: transparent; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">+ Soạn mới</button>
            </div>
          ` : `
            <div class="igt-studio-setting-title">🏷️ Nhắc tên bạn bè (@Mention)</div>
          `}

          <!-- Bộ chọn Kiểu dáng nền Mention phong phú -->
          <div style="margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; color: #94a3b8; font-weight: 700;">🎨 KIỂU DÁNG NỀN</label>
              <span style="font-size: 10px; color: #38bdf8; font-weight: 600;">(Chạm chọn trực tiếp)</span>
            </div>
            <div class="igt-mention-styles-grid">
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'white' ? 'active' : ''}" data-style="white">⚪ Trắng sáng</button>
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'frosted' ? 'active' : ''}" data-style="frosted">🌫️ Kính mờ</button>
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'transparent' ? 'active' : ''}" data-style="transparent">🔲 Trong suốt</button>
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'light_gray' ? 'active' : ''}" data-style="light_gray">🔘 Xám nhẹ</button>
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'dark_glass' ? 'active' : ''}" data-style="dark_glass">🌑 Kính tối</button>
              <button type="button" class="igt-mention-style-chip ${currentStyle === 'gradient' ? 'active' : ''}" data-style="gradient">🌈 Gradient</button>
            </div>
          </div>

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tên tài khoản bạn bè Instagram</label>
          <div style="position: relative;">
            <input type="text" id="igt-mention-input" class="igt-studio-input" placeholder="Gõ để tìm kiếm bạn bè..." autocomplete="off" value="${escapeHtml(currentUsername)}" />
          </div>

          <!-- Danh sách gợi ý bạn bè thật Autocomplete -->
          <div class="igt-mention-suggestions-box visible" id="igt-mention-suggestions-box">
            <div class="igt-mention-suggestions-list" id="igt-mention-suggestions-list">
              <div style="padding: 12px; font-size: 11.5px; color: #94a3b8; text-align: center;">Đang tải danh sách bạn bè...</div>
            </div>
          </div>

          ${editingSticker ? `
            <button type="button" id="igt-btn-finish-edit-mention" class="igt-studio-btn-add" style="background: linear-gradient(135deg, #10b981, #059669); margin-top: 8px; margin-bottom: 6px;">
              ✓ Hoàn tất chỉnh sửa
            </button>
            <button type="button" id="igt-btn-add-another-mention" class="igt-studio-btn-add" style="background: rgba(255,255,255,0.08); color: #f1f5f9; border: 1px solid rgba(255,255,255,0.15); margin-top: 0;">
              + Thêm làm nhắc tên mới
            </button>
          ` : `
            <button type="button" id="igt-btn-add-mention" class="igt-studio-btn-add" style="margin-top: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Thêm Sticker Nhắc tên</span>
            </button>
          `}
        </div>
      `;

      const inp = container.querySelector('#igt-mention-input');
      const sugBox = container.querySelector('#igt-mention-suggestions-box');
      const sugList = container.querySelector('#igt-mention-suggestions-list');

      let debounceTimer = null;
      let selectedUser = null;

      const renderFriendSuggestions = async (val = '') => {
        if (!sugList || !sugBox) return;
        const clean = (val.startsWith('@') ? val.slice(1) : val).trim();
        sugBox.classList.add('visible');

        const users = await searchUserFriends(clean);
        if (!users || users.length === 0) {
          if (clean) {
            sugList.innerHTML = `
              <div style="padding: 14px 10px; font-size: 11.5px; color: #94a3b8; text-align: center; line-height: 1.5;">
                Không tìm thấy bạn bè nào khớp với <b>"@${escapeHtml(clean)}"</b>.<br/>
                <span style="font-size: 10.5px; color: #64748b;">(Hệ thống chỉ gợi ý tài khoản bạn bè / đang theo dõi của bạn)</span>
              </div>
            `;
          } else {
            sugList.innerHTML = `
              <div style="padding: 14px 10px; font-size: 11.5px; color: #94a3b8; text-align: center; line-height: 1.5;">
                Chưa phát hiện danh sách bạn bè được lưu.<br/>
                <span style="font-size: 10.5px; color: #64748b;">Bạn có thể gõ username trực tiếp để chèn Sticker.</span>
              </div>
            `;
          }
          return;
        }

        const headerHtml = clean
          ? `<div style="padding: 6px 10px 4px; font-size: 10.5px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">👥 BẠN BÈ PHÙ HỢP (${users.length})</div>`
          : `<div style="padding: 6px 10px 4px; font-size: 10.5px; color: #94a3b8; font-weight: 700; text-transform: uppercase;">👥 BẠN BÈ & NGƯỜI BẠN THEO DÕI</div>`;

        sugList.innerHTML = headerHtml + users.map(u => {
          const initial = (u.username || 'U').charAt(0).toUpperCase();
          const avatarHtml = u.avatarUrl
            ? `<img class="igt-mention-suggest-avatar" src="${escapeHtml(u.avatarUrl)}" alt="${escapeHtml(u.username)}" referrerpolicy="no-referrer" crossorigin="anonymous" />`
            : `<div class="igt-mention-suggest-avatar" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0095f6,#a855f7);color:#ffffff;font-size:12px;font-weight:700;">${initial}</div>`;

          return `
            <div class="igt-mention-suggest-item" data-uname="${escapeHtml(u.username)}" data-fname="${escapeHtml(u.fullName || u.username)}" data-avatar="${escapeHtml(u.avatarUrl || '')}" data-verified="${u.isVerified}">
              ${avatarHtml}
              <div class="igt-mention-suggest-info">
                <div class="igt-mention-suggest-uname">
                  <span>${escapeHtml(u.username)}</span>
                  ${u.isVerified ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="#0095f6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>` : ''}
                </div>
                <div class="igt-mention-suggest-fname">${escapeHtml(u.fullName || u.username)}</div>
              </div>
            </div>
          `;
        }).join('');

        sugList.querySelectorAll('img.igt-mention-suggest-avatar').forEach(img => {
          img.addEventListener('error', () => {
            img.style.display = 'none';
          });
        });

        sugList.querySelectorAll('.igt-mention-suggest-item').forEach(item => {
          item.onclick = () => {
            const uname = item.getAttribute('data-uname');
            const avatar = item.getAttribute('data-avatar');
            const verified = item.getAttribute('data-verified') === 'true';
            inp.value = uname;
            selectedUser = { username: uname, avatarUrl: avatar, isVerified: verified };

            if (editingSticker) {
              editingSticker.username = uname;
              editingSticker.avatarUrl = avatar;
              editingSticker.isVerified = verified;
              renderStickers();
              takeSnapshot('Update mention user: ' + uname);
            } else {
              addSticker({
                type: 'mention',
                username: uname,
                avatarUrl: avatar,
                isVerified: verified,
                mentionStyle: studioState.mentionStyle || 'white',
                y: 50
              });
            }
          };
        });
      };

      // Sự kiện chọn Kiểu dáng nền Mention
      container.querySelectorAll('.igt-mention-style-chip').forEach(chip => {
        chip.onclick = () => {
          const st = chip.getAttribute('data-style');
          studioState.mentionStyle = st;
          container.querySelectorAll('.igt-mention-style-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');

          if (editingSticker) {
            editingSticker.mentionStyle = st;
            renderStickers();
            takeSnapshot('Change mention style');
          }
        };
      });

      if (inp) {
        inp.oninput = (e) => {
          let val = e.target.value.trim();
          if (val.startsWith('@')) val = val.substring(1).trim();
          if (editingSticker) {
            editingSticker.username = val || 'user';
            renderStickers();
          }
          selectedUser = null;
          if (debounceTimer) clearTimeout(debounceTimer);

          debounceTimer = setTimeout(() => {
            renderFriendSuggestions(val);
          }, 180);
        };

        inp.onchange = () => {
          if (editingSticker) takeSnapshot('Edit mention username');
        };

        inp.onfocus = () => {
          renderFriendSuggestions(inp.value.trim());
        };
      }

      // Tự động hiển thị danh sách bạn bè gợi ý ngay khi mở tab Nhắc tên
      renderFriendSuggestions(currentUsername);

      const btnFinishMention = container.querySelector('#igt-btn-finish-edit-mention');
      if (btnFinishMention) {
        btnFinishMention.onclick = () => {
          studioState.activeEditingStickerId = null;
          takeSnapshot('Finish edit mention');
          renderStickers();
          renderTabContent('mentions');
        };
      }

      const btnNewMention = container.querySelector('#igt-btn-new-mention-mode');
      if (btnNewMention) {
        btnNewMention.onclick = () => {
          studioState.activeEditingStickerId = null;
          renderStickers();
          renderTabContent('mentions');
        };
      }

      const btnAddAnotherMention = container.querySelector('#igt-btn-add-another-mention');
      const btnAddMention = container.querySelector('#igt-btn-add-mention');
      const handleAddNewMention = () => {
        let username = (inp && inp.value.trim()) ? inp.value.trim() : 'instagram';
        if (username.startsWith('@')) username = username.substring(1).trim();
        const activeChip = container.querySelector('.igt-mention-style-chip.active');
        const chosenStyle = (activeChip ? activeChip.getAttribute('data-style') : null) || studioState.mentionStyle || 'white';
        addSticker({
          type: 'mention',
          username,
          avatarUrl: selectedUser ? selectedUser.avatarUrl : '',
          isVerified: selectedUser ? selectedUser.isVerified : false,
          mentionStyle: chosenStyle,
          y: 50
        });
        studioState.activeEditingStickerId = null;
        renderStickers();
        renderTabContent('mentions');
      };

      if (btnAddMention) btnAddMention.onclick = handleAddNewMention;
      if (btnAddAnotherMention) btnAddAnotherMention.onclick = handleAddNewMention;
    } else if (tab === 'location') {
      const isEditing = !!studioState.activeEditingStickerId;
      const editingSticker = isEditing ? studioState.stickers.find(s => s.id === studioState.activeEditingStickerId && s.type === 'location') : null;

      const detectedLoc = studioState.detectedLocation;
      const currentLocName = editingSticker ? (editingSticker.name || '') : (detectedLoc ? detectedLoc.name : '');
      const currentLocStyle = editingSticker ? (editingSticker.locationStyle || studioState.locationStyle || 'white') : (studioState.locationStyle || 'white');

      container.innerHTML = `
        <div class="igt-studio-setting-group">
          ${editingSticker ? `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; background: rgba(0, 149, 246, 0.15); border: 1px solid rgba(0, 149, 246, 0.35); padding: 8px 10px; border-radius: 8px;">
              <span style="font-size: 11.5px; font-weight: 700; color: #38bdf8;">✏️ Chế độ sửa Vị trí (${escapeHtml(currentLocName || 'Vị trí')})</span>
              <button type="button" id="igt-btn-new-location-mode" style="background: transparent; border: none; color: #94a3b8; font-size: 11px; cursor: pointer; text-decoration: underline;">+ Soạn mới</button>
            </div>
          ` : `
            <div class="igt-studio-setting-title">📍 Vị trí địa lý (Location)</div>
          `}

          <!-- Bộ chọn Kiểu dáng nền Vị trí phong phú -->
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; color: #94a3b8; font-weight: 700;">🎨 KIỂU DÁNG NỀN VỊ TRÍ</label>
              <span style="font-size: 10px; color: #38bdf8; font-weight: 600;">(Chạm chọn trực tiếp)</span>
            </div>
            <div class="igt-location-styles-grid">
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'white' ? 'active' : ''}" data-style="white">⚪ Trắng sáng</button>
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'frosted' ? 'active' : ''}" data-style="frosted">🌫️ Kính mờ</button>
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'transparent' ? 'active' : ''}" data-style="transparent">🔲 Trong suốt</button>
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'light_gray' ? 'active' : ''}" data-style="light_gray">🔘 Xám nhẹ</button>
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'dark_glass' ? 'active' : ''}" data-style="dark_glass">🌑 Kính tối</button>
              <button type="button" class="igt-location-style-chip ${currentLocStyle === 'gradient' ? 'active' : ''}" data-style="gradient">🌈 Gradient</button>
            </div>
          </div>

          <label style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; display: block;">Tên địa điểm</label>
          <input type="text" id="igt-location-input" class="igt-studio-input" placeholder="Ví dụ: Hà Nội, TP. Hồ Chí Minh, Đà Lạt..." value="${escapeHtml(currentLocName)}" />

          ${editingSticker ? `
            <button type="button" id="igt-btn-finish-edit-location" class="igt-studio-btn-add" style="background: linear-gradient(135deg, #10b981, #059669); margin-bottom: 8px;">
              ✓ Hoàn tất chỉnh sửa
            </button>
            <button type="button" id="igt-btn-add-another-location" class="igt-studio-btn-add" style="background: rgba(255,255,255,0.08); color: #f1f5f9; border: 1px solid rgba(255,255,255,0.15); margin-bottom: 8px;">
              + Thêm làm vị trí mới
            </button>
          ` : `
            <button type="button" id="igt-btn-add-location" class="igt-studio-btn-add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Thêm Sticker Vị trí</span>
            </button>
          `}

          <!-- VÙNG GỢI Ý VỊ TRÍ TRÍCH XUẤT TỪ METADATA FILE -->
          ${detectedLoc ? `
            <div class="igt-location-detected-card">
              <div class="igt-loc-detected-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                <span>✨ Phát hiện từ ${studioState.mediaType === 'video' ? 'Video' : 'Ảnh'} (${detectedLoc.source || 'GPS'})</span>
              </div>
              <div class="igt-loc-detected-name">
                📍 ${escapeHtml(detectedLoc.name)}
              </div>
              ${detectedLoc.sub ? `<div class="igt-loc-detected-meta">${escapeHtml(detectedLoc.sub)}</div>` : ''}
              <div class="igt-loc-detected-meta" style="font-size: 9.5px; opacity: 0.8;">
                Tọa độ: ${detectedLoc.latitude.toFixed(4)}, ${detectedLoc.longitude.toFixed(4)}
              </div>
              <button type="button" id="igt-btn-apply-detected" class="igt-btn-apply-detected">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                <span>${editingSticker ? 'Áp dụng cho Sticker đang sửa' : 'Dùng địa điểm này cho Story'}</span>
              </button>
            </div>
          ` : `
            <div style="margin-top: 10px; margin-bottom: 10px; padding: 8px 10px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.1); border-radius: 8px; font-size: 10.5px; color: #94a3b8; line-height: 1.35;">
              ℹ️ ${studioState.mediaUrl ? 'Tệp này không có đính kèm tọa độ GPS EXIF. Bạn có thể tự nhập tên địa điểm hoặc lấy GPS từ thiết bị.' : 'Chưa chọn tệp. Hãy thêm ảnh/video để tự động phát hiện vị trí.'}
            </div>
          `}

          <!-- Nút lấy vị trí hiện tại của thiết bị (GPS) -->
          <button type="button" id="igt-btn-get-device-gps" class="igt-btn-gps-device" style="margin-top: 8px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
            <span>Lấy vị trí GPS hiện tại của thiết bị</span>
          </button>
        </div>
      `;

      const locInput = container.querySelector('#igt-location-input');

      if (locInput) {
        locInput.oninput = (e) => {
          if (editingSticker) {
            editingSticker.name = e.target.value || 'Vị trí';
            renderStickers();
          }
        };
        locInput.onchange = () => {
          if (editingSticker) takeSnapshot('Edit location name');
        };
      }

      // Sự kiện bấm chọn chip kiểu dáng nền Vị trí
      container.querySelectorAll('.igt-location-style-chip').forEach(chip => {
        chip.onclick = () => {
          const st = chip.getAttribute('data-style');
          studioState.locationStyle = st;
          container.querySelectorAll('.igt-location-style-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');

          if (editingSticker) {
            editingSticker.locationStyle = st;
            renderStickers();
            takeSnapshot('Change location style');
          }
        };
      });

      const btnFinishLocation = container.querySelector('#igt-btn-finish-edit-location');
      if (btnFinishLocation) {
        btnFinishLocation.onclick = () => {
          studioState.activeEditingStickerId = null;
          takeSnapshot('Finish edit location');
          renderStickers();
          renderTabContent('location');
        };
      }

      const btnNewLocation = container.querySelector('#igt-btn-new-location-mode');
      if (btnNewLocation) {
        btnNewLocation.onclick = () => {
          studioState.activeEditingStickerId = null;
          renderStickers();
          renderTabContent('location');
        };
      }

      const btnAddLocation = container.querySelector('#igt-btn-add-location');
      const btnAddAnotherLocation = container.querySelector('#igt-btn-add-another-location');
      const handleAddNewLocation = () => {
        const name = (locInput && locInput.value.trim()) ? locInput.value.trim() : (detectedLoc ? detectedLoc.name : 'Hà Nội');
        const activeChip = container.querySelector('.igt-location-style-chip.active');
        const chosenStyle = (activeChip ? activeChip.getAttribute('data-style') : null) || studioState.locationStyle || 'white';
        addSticker({
          type: 'location',
          name,
          locationStyle: chosenStyle,
          y: 55
        });
        studioState.activeEditingStickerId = null;
        renderStickers();
        renderTabContent('location');
      };

      if (btnAddLocation) btnAddLocation.onclick = handleAddNewLocation;
      if (btnAddAnotherLocation) btnAddAnotherLocation.onclick = handleAddNewLocation;

      // 2. Nút áp dụng vị trí phát hiện từ file
      const btnApplyDetected = container.querySelector('#igt-btn-apply-detected');
      if (btnApplyDetected && detectedLoc) {
        btnApplyDetected.onclick = () => {
          if (locInput) locInput.value = detectedLoc.name;
          if (editingSticker) {
            editingSticker.name = detectedLoc.name;
            renderStickers();
            takeSnapshot('Apply detected location to sticker');
          } else {
            addSticker({
              type: 'location',
              name: detectedLoc.name,
              locationStyle: studioState.locationStyle || 'white',
              y: 55
            });
          }
        };
      }

      // 3. Sự kiện lấy vị trí GPS từ thiết bị
      const btnDeviceGps = container.querySelector('#igt-btn-get-device-gps');
      if (btnDeviceGps) {
        btnDeviceGps.onclick = () => {
          if (!navigator.geolocation) {
            alert('Trình duyệt không hỗ trợ định vị GPS!');
            return;
          }
          btnDeviceGps.innerHTML = `<span>⏳ Đang lấy tọa độ GPS...</span>`;
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              const resolved = resolveLocationFromCoords(lat, lon);
              resolved.source = 'GPS Thiết bị';

              studioState.detectedLocation = resolved;
              if (locInput) locInput.value = resolved.name;
              renderTabContent('location');
            },
            (err) => {
              btnDeviceGps.innerHTML = `<span>⚠️ Không thể lấy vị trí (${err.message})</span>`;
              setTimeout(() => {
                if (btnDeviceGps) {
                  btnDeviceGps.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>
                    <span>Lấy vị trí GPS hiện tại của thiết bị</span>
                  `;
                }
              }, 2500);
            },
            { enableHighAccuracy: true, timeout: 8000 }
          );
        };
      }
    } else if (tab === 'music') {
      checkAndAutoRefreshDailyMusic();
      const activeCat = studioState.musicActiveCategory || 'for_you';
      const searchQ = (studioState.musicSearchQuery || '').trim().toLowerCase();
      let savedIds = studioState.savedMusicIds || [];
      if (!studioState.savedMusicIds) {
        try {
          const raw = localStorage.getItem('igt_saved_music_ids');
          if (raw) savedIds = JSON.parse(raw);
          studioState.savedMusicIds = savedIds;
        } catch (_) { }
      }

      // Danh sách bài hát tổng hợp: Live tracks ưu tiên hiển thị trước, kết hợp Catalog chuẩn
      let allTracks = (studioState.liveMusicTracks && studioState.liveMusicTracks.length > 0)
        ? [...studioState.liveMusicTracks, ...IG_MUSIC_CATALOG.filter(c => !studioState.liveMusicTracks.some(lt => lt.title.toLowerCase() === c.title.toLowerCase()))]
        : IG_MUSIC_CATALOG;

      // Lọc danh sách bài hát theo danh mục hoặc từ khóa tìm kiếm
      let filteredSongs = allTracks;
      if (searchQ) {
        filteredSongs = allTracks.filter(s =>
          s.title.toLowerCase().includes(searchQ) ||
          s.artist.toLowerCase().includes(searchQ)
        );
      } else if (activeCat === 'saved') {
        filteredSongs = allTracks.filter(s => savedIds.includes(s.id));
      } else if (activeCat !== 'upload') {
        filteredSongs = allTracks.filter(s => s.categories && s.categories.includes(activeCat));
        if (filteredSongs.length === 0) filteredSongs = allTracks;
      }

      // Tự động kích hoạt nạp Live Trending khi chưa có danh sách
      if (!studioState.liveMusicTracks || studioState.liveMusicTracks.length === 0) {
        if (!studioState.isFetchingMusic) {
          fetchLiveMusic('', activeCat).then(() => {
            if (studioState.activeTab === 'music') renderTabContent('music');
          });
        }
      }

      // Xác định bài hát đang gắn trên Timeline (Chuẩn thiết kế Instagram - Ảnh 3)
      let activeTitle = 'Instagram Audio';
      let activeArtist = 'Nghệ sĩ Instagram';
      let activeCoverUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42"><rect width="42" height="42" fill="%231e293b"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-size="18">🎵</text></svg>';

      if (studioState.audioUrl) {
        const matchedActiveSong = allTracks.find(s =>
          (s.audioAssetId && String(s.audioAssetId) === String(studioState.audioAssetId)) ||
          (studioState.audioName && s.title && studioState.audioName.toLowerCase().includes(s.title.toLowerCase()))
        );

        if (matchedActiveSong) {
          activeTitle = matchedActiveSong.title;
          activeArtist = matchedActiveSong.artist || 'Instagram Music';
          if (matchedActiveSong.cover) activeCoverUrl = matchedActiveSong.cover;
        } else if (studioState.audioName) {
          const clean = studioState.audioName.replace(/.(mp3|wav|m4a|aac)$/i, '');
          if (clean.includes(' - ')) {
            const parts = clean.split(' - ');
            activeTitle = parts[0].trim();
            activeArtist = parts.slice(1).join(' - ').trim();
          } else {
            activeTitle = clean;
            activeArtist = 'Âm thanh đã chọn';
          }
        }
      }

      function getAudioHighlightTimes(totalDur = 30) {
        if (studioState.audioHighlights && Array.isArray(studioState.audioHighlights) && studioState.audioHighlights.length > 0) {
          const h = studioState.audioHighlights;
          return {
            part1: Math.max(0, h[0] || 0),
            part2: Math.max(0, h[1] || Math.min(Math.max(0, totalDur - 5), 10)),
            part3: Math.max(0, h[2] || Math.min(Math.max(0, totalDur - 5), 20))
          };
        }
        if (totalDur <= 45) {
          return {
            part1: 0,
            part2: Math.min(Math.max(0, totalDur - 5), 10),
            part3: Math.min(Math.max(0, totalDur - 5), 20)
          };
        }
        return {
          part1: Math.min(Math.max(0, totalDur - 15), 30),
          part2: Math.min(Math.max(0, totalDur - 15), 75),
          part3: Math.min(Math.max(0, totalDur - 15), 125)
        };
      }

      const audioPartTimes = getAudioHighlightTimes(studioState.audioDuration || 30);
      const activePart = studioState.audioPart || 'part1';
      const maxScrub = Math.max(1, Math.round((studioState.audioDuration || 30) - 3));

      container.innerHTML = `
        <div class="igt-inssist-music-container">
          <!-- 1. Thanh tìm kiếm phong cách INSSIST -->
          <div class="igt-inssist-search-box">
            <span class="igt-inssist-search-icon">🔍</span>
            <input type="text" id="igt-inssist-music-search-input" class="igt-inssist-search-input" placeholder="Tìm kiếm bài hát trên Instagram..." value="${escapeHtml(studioState.musicSearchQuery || '')}" />
            <span class="igt-inssist-help-icon" title="Kho nhạc thịnh hành trực tiếp từ Instagram Reels & Story">❔</span>
          </div>

          <!-- 2. Hàng phân loại Tabs ngang: For you, Trending, Ambient, Upload, Saved -->
          <div class="igt-inssist-tabs-nav">
            <button type="button" class="igt-inssist-tab-btn ${activeCat === 'for_you' ? 'active' : ''}" data-cat="for_you">For you</button>
            <button type="button" class="igt-inssist-tab-btn ${activeCat === 'trending' ? 'active' : ''}" data-cat="trending">Trending</button>
            <button type="button" class="igt-inssist-tab-btn ${activeCat === 'ambient' ? 'active' : ''}" data-cat="ambient">Ambient</button>
            <button type="button" class="igt-inssist-tab-btn ${activeCat === 'upload' ? 'active' : ''}" data-cat="upload">Upload</button>
            <button type="button" class="igt-inssist-tab-btn ${activeCat === 'saved' ? 'active' : ''}" data-cat="saved">Saved (${savedIds.length})</button>
          </div>

          <!-- 3. Khu vực bài hát đang nạp vào Timeline (Thiết kế thanh lịch chuẩn Instagram - Ảnh 1 & Ảnh 2) -->
          ${studioState.audioUrl ? `
            <div class="igt-active-music-bar" style="flex-direction: column !important; align-items: stretch !important; gap: 8px !important;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;">
                <div class="igt-active-music-left">
                  <!-- Ảnh bìa tích hợp nút Play đè lên giữa -->
                  <div class="igt-active-music-cover-wrap ${studioState.isVideoPlaying ? 'is-playing' : ''}" id="igt-btn-toggle-timeline-audio" title="${studioState.isVideoPlaying ? 'Tạm dừng nghe' : 'Phát nghe thử bài hát'}">
                    <img class="igt-active-music-cover" src="${escapeHtml(activeCoverUrl)}" alt="Cover" />
                    <div class="igt-active-music-play-badge">
                      ${studioState.isVideoPlaying ? '⏸' : '▶'}
                    </div>
                  </div>
                  <!-- Thông tin: Tên bài & Nghệ sĩ -->
                  <div class="igt-active-music-info">
                    <div class="igt-active-music-title" title="${escapeHtml(activeTitle)}">${escapeHtml(activeTitle)}</div>
                    <div class="igt-active-music-artist" title="${escapeHtml(activeArtist)}">${escapeHtml(activeArtist)}</div>
                  </div>
                </div>

                <!-- Cụm bên phải: Nút Gỡ X -->
                <div class="igt-active-music-actions">
                  <button type="button" id="igt-btn-remove-audio" class="igt-active-music-icon-btn" title="Gỡ bài hát khỏi dòng thời gian">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
              </div>

              <!-- HÀNG CÁC TAG ĐIỆP KHÚC HAY CHUẨN INSTAGRAM (Ảnh 2: PART 1, PART 2, PART 3, CUSTOM) -->
              <div class="igt-music-parts-row" style="display: flex; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08); flex-wrap: wrap;">
                <button type="button" class="igt-music-part-pill ${activePart === 'part1' ? 'active' : ''}" data-part="part1" title="Điệp khúc 1 (${formatTime(audioPartTimes.part1)})">PART 1</button>
                <button type="button" class="igt-music-part-pill ${activePart === 'part2' ? 'active' : ''}" data-part="part2" title="Điệp khúc 2 (${formatTime(audioPartTimes.part2)})">PART 2</button>
                <button type="button" class="igt-music-part-pill ${activePart === 'part3' ? 'active' : ''}" data-part="part3" title="Cao trào (${formatTime(audioPartTimes.part3)})">PART 3</button>
                <button type="button" class="igt-music-part-pill ${activePart === 'custom' ? 'active' : ''}" data-part="custom" title="Tùy chỉnh điểm phát bắt đầu">CUSTOM</button>
                <span style="font-size: 10px; color: #38bdf8; font-weight: 700; margin-left: auto;">Bắt đầu: ${formatTime(studioState.audioStart || 0)}</span>
              </div>

              <!-- Thanh trượt tùy chỉnh Custom Scrubber khi chọn CUSTOM -->
              ${(activePart === 'custom') ? `
                <div class="igt-music-custom-scrubber" style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px; margin-top: 2px;">
                  <span style="white-space: nowrap; font-size: 10.5px;">Điểm phát:</span>
                  <input type="range" id="igt-music-custom-slider" min="0" max="${maxScrub}" step="0.5" value="${studioState.audioStart || 0}" style="flex: 1; accent-color: #0095f6; cursor: pointer; height: 4px;" />
                  <span id="igt-music-custom-val" style="color: #38bdf8; font-weight: 700; font-size: 10.5px; min-width: 36px; text-align: right;">${formatTime(studioState.audioStart || 0)}</span>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Trạng thái đang tải live tracks -->
          ${studioState.isFetchingMusic ? `
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.05); border-radius: 8px;">
              <span>⏳</span>
              <span>Đang cập nhật bài hát thịnh hành từ Instagram...</span>
            </div>
          ` : ''}

          <!-- 4. Nội dung theo từng Tab -->
          ${activeCat === 'upload' ? `
            <!-- Tab Upload: Tự tải tệp MP3 từ máy -->
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; border: 2px dashed rgba(255, 255, 255, 0.18); border-radius: 12px; background: rgba(255, 255, 255, 0.02); text-align: center; gap: 10px;">
              <span style="font-size: 32px;">📥</span>
              <div style="font-size: 13px; font-weight: 700; color: #f8fafc;">Tải tệp âm thanh từ thiết bị</div>
              <div style="font-size: 11px; color: #94a3b8; max-width: 240px; line-height: 1.4;">Hỗ trợ các tệp MP3, WAV, AAC, M4A không giới hạn dung lượng</div>
              <button type="button" id="igt-tab-music-upload-btn" class="igt-studio-btn-add" style="margin-top: 6px; background: linear-gradient(135deg, #0284c7, #0095f6); padding: 8px 18px; border-radius: 8px; font-size: 12px; font-weight: 700; color: #fff; border: none; cursor: pointer;">
                📂 Chọn tệp từ máy tính
              </button>
              <input type="file" id="igt-tab-music-file-input" accept="audio/*" style="display: none;" />
            </div>
          ` : (activeCat === 'saved' && filteredSongs.length === 0) ? `
            <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
              <div style="margin-bottom: 8px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style="font-size: 12.5px; font-weight: 600; color: #cbd5e1;">Chưa có bài hát nào được lưu</div>
              <div style="font-size: 11px; margin-top: 4px; color: #64748b;">Bấm biểu tượng dấu lưu bên cạnh bài hát bất kỳ để lưu vào đây.</div>
            </div>
          ` : (filteredSongs.length === 0) ? `
            <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
              <div style="font-size: 24px; margin-bottom: 6px;">🔍</div>
              <div style="font-size: 12px; color: #cbd5e1;">Không tìm thấy bài hát phù hợp với "${escapeHtml(searchQ)}"</div>
            </div>
          ` : `
            <!-- Danh sách bài hát chuẩn Instagram INSSIST với nút Play tích hợp thẳng trên bìa (Ảnh 1) -->
            <div class="igt-inssist-song-list">
              ${filteredSongs.map(song => {
        const isPlaying = (studioState.previewPlayingId === song.id);
        const isSaved = savedIds.includes(song.id);
        const isCurrentlyUsed = (studioState.audioName && studioState.audioName.includes(song.title));
        return `
                  <div class="igt-inssist-song-item ${isPlaying ? 'is-playing' : ''}" data-song-id="${song.id}">
                    <!-- TÍCH HỢP NÚT PLAY VÀO PHẦN ẢNH BÌA LUÔN (Ảnh 1) -->
                    <div class="igt-inssist-cover-wrap btn-play-song" data-song-id="${song.id}" title="${isPlaying ? 'Tạm dừng' : 'Nghe thử âm thanh thật'}">
                      <img class="igt-inssist-song-cover" src="${escapeHtml(song.cover || 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'42\' height=\'42\' viewBox=\'0 0 42 42\'><rect width=\'42\' height=\'42\' fill=\'%231e293b\'/><text x=\'50%\' y=\'55%\' dominant-baseline=\'middle\' text-anchor=\'middle\' fill=\'%2338bdf8\' font-size=\'18\'>🎵</text></svg>')}" alt="${escapeHtml(song.title)}" />
                      <div class="igt-inssist-cover-play-badge">
                        ${isPlaying ? '⏸' : '▶'}
                      </div>
                    </div>

                    <div class="igt-inssist-song-meta">
                      <div class="igt-inssist-song-title" title="${escapeHtml(song.title)}">${escapeHtml(song.title)}</div>
                      <div class="igt-inssist-song-artist" title="${escapeHtml(song.artist)}">${escapeHtml(song.artist)}</div>
                    </div>

                    <div class="igt-inssist-song-actions">
                      <!-- Nút Lưu (Bookmark chuẩn Instagram - Ảnh 2) -->
                      <button type="button" class="btn-toggle-save-song" data-song-id="${song.id}" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="${isSaved ? 'Bỏ lưu' : 'Lưu bài hát'}">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="${isSaved ? '#38bdf8' : 'none'}" stroke="${isSaved ? '#38bdf8' : '#94a3b8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.15s ease, stroke 0.15s ease, fill 0.15s ease;">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                      <!-- Nút Sử dụng bài hát -->
                      <button type="button" class="igt-inssist-btn-use btn-use-song" data-song-id="${song.id}" style="${isCurrentlyUsed ? 'background: #0284c7; color: #fff;' : ''}">
                        ${isCurrentlyUsed ? '✓ Đang dùng' : 'Dùng'}
                      </button>
                    </div>
                  </div>
                `;
      }).join('')}
            </div>
          `}
        </div>
      `;

      // Fallback ảnh bìa an toàn chuẩn JavaScript (hoàn toàn không dùng inline onerror để tuân thủ CSP Instagram 100%)
      container.querySelectorAll('.igt-inssist-song-cover').forEach(img => {
        img.addEventListener('error', () => {
          img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 42 42"><rect width="42" height="42" fill="%231e293b"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-size="18">🎵</text></svg>';
        }, { once: true });
      });

      // Event: Search input có debounce thời gian thực
      const searchInput = container.querySelector('#igt-inssist-music-search-input');
      if (searchInput) {
        searchInput.oninput = (e) => {
          const val = e.target.value;
          studioState.musicSearchQuery = val;
          if (musicSearchDebounce) clearTimeout(musicSearchDebounce);
          musicSearchDebounce = setTimeout(() => {
            fetchLiveMusic(val, activeCat).then(() => {
              renderTabContent('music');
              const newIn = container.querySelector('#igt-inssist-music-search-input');
              if (newIn) {
                newIn.focus();
                newIn.setSelectionRange(newIn.value.length, newIn.value.length);
              }
            });
          }, 350);
        };
      }

      // Event: Tabs change
      container.querySelectorAll('.igt-inssist-tab-btn').forEach(btn => {
        btn.onclick = () => {
          studioState.musicActiveCategory = btn.getAttribute('data-cat');
          fetchLiveMusic('', studioState.musicActiveCategory).then(() => {
            renderTabContent('music');
          });
        };
      });

      // Cập nhật trạng thái Play/Pause trên giao diện tức thời mà không làm mất vị trí cuộn trang (scroll)
      function updatePreviewSongButtons() {
        container.querySelectorAll('.btn-play-song').forEach(b => {
          const sId = b.getAttribute('data-song-id');
          const isP = (studioState.previewPlayingId === sId);
          const badge = b.querySelector('.igt-inssist-cover-play-badge');
          if (badge) badge.textContent = isP ? '⏸' : '▶';
          else b.textContent = isP ? '⏸' : '▶';
          b.title = isP ? 'Tạm dừng' : 'Nghe thử âm thanh thật';
          const pItem = b.closest('.igt-inssist-song-item');
          if (pItem) {
            if (isP) pItem.classList.add('is-playing');
            else pItem.classList.remove('is-playing');
          }
        });
      }

      // Event: Play/Pause preview ÂM THANH THẬT khi bấm vào nút Play hoặc ảnh bìa
      container.querySelectorAll('.btn-play-song').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const songId = btn.getAttribute('data-song-id');
          const song = allTracks.find(s => s.id === songId);
          if (!song) return;

          // Nếu đang phát chính bài này thì bấm lại là Tạm dừng (Pause)
          if (studioState.previewPlayingId === songId) {
            if (studioState.previewAudioEl) {
              studioState.previewAudioEl.pause();
            }
            studioState.previewPlayingId = null;
            updatePreviewSongButtons();
            return;
          }

          // Dừng bài hát trước đó và dọn dẹp audio element
          if (studioState.previewAudioEl) {
            studioState.previewAudioEl.pause();
            studioState.previewAudioEl.removeAttribute('src');
            studioState.previewAudioEl.load();
          } else {
            studioState.previewAudioEl = new Audio();
          }

          const playReqId = (studioState.previewPlayReqCounter = (studioState.previewPlayReqCounter || 0) + 1);
          studioState.previewPlayingId = songId;
          updatePreviewSongButtons();

          let playableUrl = null;
          if (song.audioUrl) {
            playableUrl = await getSafePlayableAudio(song.audioUrl);
          }
          if (!playableUrl) {
            const blob = generatePresetAudio(song.preset || 'trending');
            playableUrl = URL.createObjectURL(blob);
          }

          // Tránh race condition khi người dùng bấm nhanh sang bài khác
          if (playReqId !== studioState.previewPlayReqCounter) return;

          const audio = studioState.previewAudioEl;
          audio.src = playableUrl;
          audio.volume = 0.9;

          audio.onplaying = () => {
            if (playReqId === studioState.previewPlayReqCounter) {
              studioState.previewPlayingId = songId;
              updatePreviewSongButtons();
            }
          };
          audio.onpause = () => {
            if (studioState.previewPlayingId === songId) {
              studioState.previewPlayingId = null;
              updatePreviewSongButtons();
            }
          };
          audio.onended = () => {
            if (studioState.previewPlayingId === songId) {
              studioState.previewPlayingId = null;
              updatePreviewSongButtons();
            }
          };
          audio.onerror = (err) => {
            console.warn('[IG Music Player] Audio error:', err, playableUrl);
            if (playReqId === studioState.previewPlayReqCounter) {
              studioState.previewPlayingId = null;
              updatePreviewSongButtons();
            }
          };

          try {
            await audio.play();
          } catch (err) {
            if (err.name !== 'AbortError') console.warn('[IG Music Player] Play notice:', err);
            if (playReqId === studioState.previewPlayReqCounter) {
              studioState.previewPlayingId = null;
              updatePreviewSongButtons();
            }
          }
        };
      });

      // Event: Toggle nghe thử bài hát đang gắn trên timeline (bấm ảnh bìa Ảnh 3)
      const btnToggleTimeline = container.querySelector('#igt-btn-toggle-timeline-audio');
      if (btnToggleTimeline) {
        btnToggleTimeline.onclick = () => {
          togglePlayPause();
          const isPlaying = studioState.isVideoPlaying;
          const badge = btnToggleTimeline.querySelector('.igt-active-music-play-badge');
          if (badge) badge.textContent = isPlaying ? '⏸' : '▶';
          btnToggleTimeline.classList.toggle('is-playing', isPlaying);
        };
      }

      // Event: Nút Loa âm lượng toggle mở panel chỉnh âm lượng
      // Event: Click chọn các phần điệp khúc hay (PART 1, PART 2, PART 3, CUSTOM - Ảnh 2)
      container.querySelectorAll('.igt-music-part-pill').forEach(pill => {
        pill.onclick = (e) => {
          e.stopPropagation();
          const p = pill.getAttribute('data-part');
          studioState.audioPart = p;
          const times = getAudioHighlightTimes(studioState.audioDuration || 30);

          let targetStartTime = studioState.audioStart || 0;
          if (p === 'part1') targetStartTime = times.part1;
          else if (p === 'part2') targetStartTime = times.part2;
          else if (p === 'part3') targetStartTime = times.part3;

          studioState.audioStart = targetStartTime;

          // 1. Đồng bộ hòa hợp tuyệt đối với Audio Track trên dòng thời gian:
          // Đảm bảo khối nhạc bao phủ toàn bộ thời lượng bài đăng, không bị co ngắn hay để lại khoảng trống
          const totalTimelineDur = (typeof getTotalTimelineDuration === 'function')
            ? getTotalTimelineDuration()
            : ((studioState.mediaType === 'image')
                ? ((studioState.mode === 'story' || studioState.mode === 'reel') ? (studioState.imageDuration || 15) : (studioState.videoDuration || 15))
                : (studioState.videoDuration || 30));

          if (!studioState.audioClips || studioState.audioClips.length === 0) {
            studioState.audioClips = [{
              id: 'aclip_' + Date.now(),
              name: studioState.audioName || 'audio.mp3',
              start: targetStartTime,
              end: targetStartTime + totalTimelineDur,
              offset: 0
            }];
          } else {
            studioState.audioClips[0].offset = 0;
            studioState.audioClips[0].start = targetStartTime;
            studioState.audioClips[0].end = targetStartTime + totalTimelineDur;
          }
          studioState.audioEnd = targetStartTime + totalTimelineDur;
          studioState.audioOffset = 0;

          // 2. Đưa kim chạy về đầu dòng thời gian (00:00) để bài hát và video cùng xuất phát đồng bộ
          studioState.currentTime = 0;
          const video = document.getElementById('igt-studio-active-media');
          if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
            video.currentTime = studioState.trimStart || 0;
          }

          if (studioState.audioElement) {
            studioState.audioElement.currentTime = targetStartTime;
            if (studioState.isVideoPlaying) {
              studioState.audioElement.play().catch(() => {});
            } else {
              // Phát thử đoạn nhạc vừa chọn để người dùng nghe thẩm âm
              studioState.audioElement.play().catch(() => {});
              if (studioState.partPreviewTimeout) clearTimeout(studioState.partPreviewTimeout);
              studioState.partPreviewTimeout = setTimeout(() => {
                if (!studioState.isVideoPlaying && studioState.audioElement) {
                  studioState.audioElement.pause();
                }
              }, 4000);
            }
          }

          renderTimeline();
          updateTimelineNeedle();
          renderTabContent('music');
        };
      });

      // Event: Slider CUSTOM khi kéo chọn điểm phát
      const customSlider = container.querySelector('#igt-music-custom-slider');
      if (customSlider) {
        customSlider.oninput = (e) => {
          const val = parseFloat(e.target.value);
          studioState.audioStart = val;
          studioState.audioPart = 'custom';

          const totalTimelineDur = (typeof getTotalTimelineDuration === 'function')
            ? getTotalTimelineDuration()
            : (studioState.videoDuration || 30);

          if (!studioState.audioClips || studioState.audioClips.length === 0) {
            studioState.audioClips = [{
              id: 'aclip_' + Date.now(),
              name: studioState.audioName || 'audio.mp3',
              start: val,
              end: val + totalTimelineDur,
              offset: 0
            }];
          } else {
            studioState.audioClips[0].offset = 0;
            studioState.audioClips[0].start = val;
            studioState.audioClips[0].end = val + totalTimelineDur;
          }
          studioState.audioEnd = val + totalTimelineDur;
          studioState.audioOffset = 0;

          studioState.currentTime = 0;
          const video = document.getElementById('igt-studio-active-media');
          if (video && (studioState.mediaType === 'video' || video.tagName === 'VIDEO')) {
            video.currentTime = studioState.trimStart || 0;
          }

          if (studioState.audioElement) {
            studioState.audioElement.currentTime = val;
            if (studioState.isVideoPlaying) {
              studioState.audioElement.play().catch(() => {});
            }
          }

          const valEl = container.querySelector('#igt-music-custom-val');
          if (valEl) valEl.innerText = formatTime(val);
          const startBadge = container.querySelector('.igt-music-parts-row span');
          if (startBadge) startBadge.innerText = 'Bắt đầu: ' + formatTime(val);

          renderTimeline();
          updateTimelineNeedle();
        };
      }

      // Event: Toggle Save (Bookmark)
      container.querySelectorAll('.btn-toggle-save-song').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const songId = btn.getAttribute('data-song-id');
          const sIds = studioState.savedMusicIds || [];
          const idx = sIds.indexOf(songId);
          if (idx === -1) {
            sIds.push(songId);
          } else {
            sIds.splice(idx, 1);
          }
          studioState.savedMusicIds = sIds;
          try {
            localStorage.setItem('igt_saved_music_ids', JSON.stringify(sIds));
          } catch (_) { }
          renderTabContent('music');
        };
      });

      // Event: Use Song (Gắn âm thanh thật vào timeline)
      container.querySelectorAll('.btn-use-song').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          const songId = btn.getAttribute('data-song-id');
          const song = allTracks.find(s => s.id === songId) || IG_MUSIC_CATALOG.find(s => s.id === songId);
          if (!song) return;

          if (studioState.previewAudioEl) {
            studioState.previewAudioEl.pause();
          }
          studioState.previewPlayingId = null;

          const title = `${song.title} - ${song.artist}.mp3`;
          studioState.audioAssetId = song.audioAssetId || song.id;
          studioState.audioHighlights = song.highlights || null;
          studioState.audioPart = 'part1';
          const defaultTimes = getAudioHighlightTimes(song.duration || 30);
          studioState.audioStart = defaultTimes.part1;

          // 1. Tạo fallback audio blob an toàn ngay lập tức để render timeline 0ms không bị crash CSP
          const fallbackPresetBlob = song.preset ? URL.createObjectURL(generatePresetAudio(song.preset)) : URL.createObjectURL(generatePresetAudio('trending'));
          loadAudioFile(fallbackPresetBlob, title);
          renderTimeline();
          renderTabContent('music');

          // 2. Lấy Blob URL an toàn qua background proxy (Bypass 100% CSP của Instagram)
          if (song.audioUrl) {
            try {
              const safeUrl = await getSafePlayableAudio(song.audioUrl);
              if (safeUrl) {
                studioState.audioUrl = safeUrl;
                if (!studioState.audioElement) studioState.audioElement = new Audio();
                studioState.audioElement.src = safeUrl;
                studioState.audioElement.volume = studioState.isAudioMuted ? 0 : (studioState.audioVolume ?? 0.8);
                studioState.audioElement.load();

                // Nếu timeline đang phát, tự động phát luôn bài hát
                if (studioState.isVideoPlaying) {
                  const curT = studioState.currentTime || 0;
                  const aTime = (curT - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
                  try { studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration || 60, aTime)); } catch (_) {}
                  studioState.audioElement.play().catch(() => {});
                }
              }
            } catch (_) {}
          }
        };
      });

      // Event: Upload button trong tab Upload
      const btnUploadMusic = container.querySelector('#igt-tab-music-upload-btn');
      const inputMusicFile = container.querySelector('#igt-tab-music-file-input');
      if (btnUploadMusic && inputMusicFile) {
        btnUploadMusic.onclick = () => inputMusicFile.click();
        inputMusicFile.onchange = (e) => {
          if (e.target.files && e.target.files[0]) {
            loadAudioFile(e.target.files[0]);
          }
        };
      }

      // Event: Remove Audio
      const btnRemoveAudio = container.querySelector('#igt-btn-remove-audio');
      if (btnRemoveAudio) {
        btnRemoveAudio.onclick = () => {
          if (studioState.audioElement) {
            studioState.audioElement.pause();
            studioState.audioElement.removeAttribute('src');
            studioState.audioElement.load();
          }
          if (studioState.audioUrl && studioState.audioUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(studioState.audioUrl); } catch (_) {}
          }
          studioState.audioUrl = '';
          studioState.audioFile = null;
          studioState.audioName = '';
          studioState.audioDuration = 0;
          studioState.audioStart = 0;
          studioState.audioEnd = 0;
          studioState.audioOffset = 0;
          studioState.audioAssetId = null;
          studioState.audioClips = [];
          studioState.selectedAudioClipId = null;
          renderTimeline();
          renderTabContent('music');
          takeSnapshot('Gỡ bài hát');
        };
      }
    }
  }


  function renderRatioBar(modal) {
    if (!modal) modal = document.getElementById('igt-studio-modal');
    if (!modal) return;
    const bar = modal.querySelector('.igt-studio-ratio-bar');
    if (!bar) return;

    if (studioState.mode === 'post') {
      // Chuẩn bài viết Instagram (Post Feed / Album): CHỈ CÓ 4 TỈ LỆ theo đúng thứ tự menu Instagram: Gốc, 1:1, 4:5, 16:9 (KHÔNG CÓ 9:16)
      if (studioState.ratio === '9:16' || !['original', '1:1', '4:5', '16:9'].includes(studioState.ratio)) {
        studioState.ratio = 'original';
      }
      bar.innerHTML = `
        <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === 'original' ? 'active' : ''}" data-ratio="original" title="Gốc - Giữ nguyên tỉ lệ ảnh gốc">Gốc</button>
        <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === '1:1' ? 'active' : ''}" data-ratio="1:1" title="1:1 - Khung vuông Instagram">1:1</button>
        <button type="button" class="igt-studio-ratio-btn is-recommended ${studioState.ratio === '4:5' ? 'active' : ''}" data-ratio="4:5" title="4:5 ★ Dọc chuẩn Instagram (Tối ưu diện tích hiển thị feed nhất)">4:5</button>
        <button type="button" class="igt-studio-ratio-btn ${studioState.ratio === '16:9' ? 'active' : ''}" data-ratio="16:9" title="16:9 - Khung ngang Instagram">16:9</button>
      `;
    } else {
      // Tin (Story) và Thước phim (Reel): Luôn là định dạng dọc 9:16 toàn màn hình (1080×1920)
      if (studioState.ratio !== '9:16') {
        studioState.ratio = '9:16';
      }
      bar.innerHTML = `
        <button type="button" class="igt-studio-ratio-btn is-recommended active" data-ratio="9:16" title="9:16 ★ Toàn màn hình chuẩn Story & Reel (1080×1920)">9:16</button>
      `;
    }

    bar.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
      btn.onclick = () => {
        const r = btn.getAttribute('data-ratio');
        setRatio(r);
      };
    });
  }

  function updateRatioRecommendationUI() {
    const modal = document.getElementById('igt-studio-modal');
    if (!modal) return;
    renderRatioBar(modal);
  }

  function setRatio(ratioKey, pushHistory = true) {
    studioState.ratio = ratioKey;
    const modal = document.getElementById('igt-studio-modal');
    if (!modal) return;

    modal.querySelectorAll('.igt-studio-ratio-btn').forEach(btn => {
      const r = btn.getAttribute('data-ratio');
      btn.classList.toggle('active', r === ratioKey);
      btn.classList.toggle('is-recommended', (studioState.mode === 'post' ? r === '4:5' : r === '9:16'));
    });

    const frame = modal.querySelector('#igt-studio-phone-frame');
    if (!frame) return;

    const cfg = RATIO_CONFIGS[ratioKey] || RATIO_CONFIGS['4:5'];
    if (ratioKey === 'original' && studioState.naturalWidth && studioState.naturalHeight) {
      // Tính toán kích thước vừa vặn cho tỉ lệ gốc (Trong Bài viết giới hạn từ 4:5 đến 1.91:1 như Instagram)
      let aspect = studioState.naturalWidth / studioState.naturalHeight;
      if (studioState.mode === 'post') {
        if (aspect < 0.8) aspect = 0.8;
        if (aspect > 1.91) aspect = 1.91;
      }
      let w = 380;
      let h = Math.round(w / aspect);
      if (h > 540) {
        h = 540;
        w = Math.round(h * aspect);
      }
      frame.style.setProperty('width', w + 'px', 'important');
      frame.style.setProperty('height', h + 'px', 'important');
    } else {
      frame.style.setProperty('width', cfg.frameW + 'px', 'important');
      frame.style.setProperty('height', cfg.frameH + 'px', 'important');
    }

    applyFitMode();
    updateMediaTransform();
    if (pushHistory) {
      takeSnapshot('Change ratio');
    }
  }

  function resetMediaTransformToDefault() {
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

  function applyFitMode() {
    const blurBg = document.getElementById('igt-studio-blur-bg');
    const mediaEl = document.getElementById('igt-studio-active-media');
    if (!mediaEl) return;

    if (studioState.fitMode === 'cover') {
      if (blurBg) blurBg.style.display = 'none';
      mediaEl.style.setProperty('object-fit', 'cover', 'important');
      mediaEl.style.setProperty('width', '100%', 'important');
      mediaEl.style.setProperty('height', '100%', 'important');
    } else {
      if (blurBg && studioState.mediaUrl) blurBg.style.display = 'block';
      mediaEl.style.setProperty('object-fit', 'contain', 'important');
      mediaEl.style.setProperty('width', '100%', 'important');
      mediaEl.style.setProperty('height', '100%', 'important');
    }
  }

  function updateMediaTransform() {
    const mediaEl = document.getElementById('igt-studio-active-media');
    if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex]) {
      const curItem = studioState.mediaList[studioState.activeMediaIndex];
      curItem.zoom = studioState.zoom;
      curItem.panX = studioState.panX;
      curItem.panY = studioState.panY;
      curItem.rotation = studioState.rotation;
      curItem.freeAngle = studioState.freeAngle;
      curItem.flipH = studioState.flipH;
      curItem.flipV = studioState.flipV;
    }
    if (!mediaEl) return;
    const scaleX = (studioState.zoom || 1) * (studioState.flipH ? -1 : 1);
    const scaleY = (studioState.zoom || 1) * (studioState.flipV ? -1 : 1);
    const totalAngle = (studioState.rotation || 0) + (studioState.freeAngle || 0);
    const transformStr = `translate3d(${studioState.panX || 0}px, ${studioState.panY || 0}px, 0px) rotate(${totalAngle}deg) scale(${scaleX}, ${scaleY})`;
    mediaEl.style.setProperty('transform', transformStr, 'important');
    mediaEl.style.setProperty('-webkit-transform', transformStr, 'important');
    mediaEl.style.setProperty('transform-origin', 'center center', 'important');
    mediaEl.style.setProperty('will-change', 'transform', 'important');
  }

  function applyMediaFilters() {
    const mediaEl = document.getElementById('igt-studio-active-media');
    if (!mediaEl) return;
    const b = (studioState.brightness ?? 100) / 100;
    const c = (studioState.contrast ?? 100) / 100;
    const s = (studioState.saturate ?? 100) / 100;
    const sep = (studioState.sepia ?? 0) / 100;
    const bl = (studioState.blur ?? 0);
    const preset = IMAGE_FILTERS.find(f => f.id === studioState.imageFilter);
    const presetCss = preset ? preset.css : '';

    let filterStr = `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${sep}) blur(${bl}px) ${presetCss}`.trim();
    if (!filterStr) filterStr = 'none';
    mediaEl.style.setProperty('filter', filterStr, 'important');
    mediaEl.style.setProperty('-webkit-filter', filterStr, 'important');

    updateFxOverlay();
  }

  let cachedGrainDataUrl = null;
  function getFilmGrainDataUrl() {
    if (cachedGrainDataUrl) return cachedGrainDataUrl;
    try {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 120;
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(120, 120);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.floor(Math.random() * 255);
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = Math.random() < 0.45 ? Math.floor(Math.random() * 120 + 40) : 0;
      }
      ctx.putImageData(imgData, 0, 0);
      cachedGrainDataUrl = c.toDataURL('image/png');
    } catch (_) {
      cachedGrainDataUrl = '';
    }
    return cachedGrainDataUrl;
  }

  let cachedSparkleDataUrl = null;
  function getSparkleDataUrl() {
    if (cachedSparkleDataUrl) return cachedSparkleDataUrl;
    try {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 160;
      const ctx = c.getContext('2d');
      function drawStar(cx, cy, r, col) {
        ctx.save();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy - r);
        ctx.quadraticCurveTo(cx, cy, cx + r, cy);
        ctx.quadraticCurveTo(cx, cy, cx, cy + r);
        ctx.quadraticCurveTo(cx, cy, cx - r, cy);
        ctx.fill();
        ctx.restore();
      }
      drawStar(30, 25, 7, '#ffffff');
      drawStar(110, 35, 5, '#ffd700');
      drawStar(70, 80, 8, '#ffffff');
      drawStar(140, 115, 6, '#ffe066');
      drawStar(25, 130, 8, '#ffffff');
      drawStar(120, 70, 4, '#ffffff');
      drawStar(85, 140, 5, '#ffd700');
      cachedSparkleDataUrl = c.toDataURL('image/png');
    } catch (_) {
      cachedSparkleDataUrl = '';
    }
    return cachedSparkleDataUrl;
  }

  function updateFxOverlay() {
    const overlay = document.getElementById('igt-studio-fx-overlay');
    if (!overlay) return;
    overlay.className = 'igt-studio-fx-overlay';
    overlay.innerHTML = '';
    overlay.style.backgroundImage = '';
    overlay.style.background = '';
    overlay.style.mixBlendMode = 'normal';
    overlay.style.opacity = '1';

    const vig = studioState.vignette || 0;
    const fx = studioState.imageFx || 'none';

    let bgLayers = [];

    if (vig > 0) {
      bgLayers.push(`radial-gradient(circle at center, transparent 40%, rgba(0, 0, 0, ${(vig / 100) * 0.75}) 100%)`);
    }

    if (fx === 'grain') {
      overlay.classList.add('fx-grain');
      const grainUrl = getFilmGrainDataUrl();
      if (grainUrl) overlay.style.backgroundImage = `url('${grainUrl}')`;
      overlay.style.backgroundRepeat = 'repeat';
      overlay.style.mixBlendMode = 'overlay';
      overlay.style.opacity = '0.85';
      overlay.style.display = 'block';
      return;
    }

    if (fx === 'sparkle') {
      overlay.classList.add('fx-sparkle');
      const spkUrl = getSparkleDataUrl();
      if (spkUrl) overlay.style.backgroundImage = `url('${spkUrl}')`;
      overlay.style.backgroundRepeat = 'repeat';
      overlay.style.mixBlendMode = 'screen';
      overlay.style.display = 'block';
      return;
    }

    if (fx === 'lightleak') {
      overlay.classList.add('fx-lightleak');
      overlay.style.backgroundImage = `linear-gradient(135deg, rgba(255, 110, 0, 0.45) 0%, rgba(255, 30, 130, 0.28) 25%, rgba(255, 215, 0, 0.2) 45%, transparent 70%)`;
      overlay.style.mixBlendMode = 'screen';
      overlay.style.display = 'block';
      return;
    }

    if (fx === 'vignette_heavy') {
      overlay.classList.add('fx-vignette-heavy');
      overlay.style.backgroundImage = `radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.6) 70%, rgba(0, 0, 0, 0.95) 100%)`;
      overlay.style.mixBlendMode = 'normal';
      overlay.style.display = 'block';
      return;
    }

    if (bgLayers.length > 0) {
      overlay.style.backgroundImage = bgLayers.join(', ');
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
    }
  }

  function saveCurrentMediaState() {
    if (!studioState.mediaList || studioState.mediaList.length === 0) return;
    const cur = studioState.mediaList[studioState.activeMediaIndex];
    if (!cur) return;

    // 1. Nhãn dán & Thu phóng Canvas
    cur.stickers = JSON.parse(JSON.stringify(studioState.stickers || []));
    cur.zoom = studioState.zoom;
    cur.panX = studioState.panX;
    cur.panY = studioState.panY;
    cur.fitMode = studioState.fitMode;
    cur.ratio = studioState.ratio;

    // 2. Video Trimming & Clips
    cur.videoDuration = studioState.videoDuration || cur.videoDuration || 0;
    cur.trimStart = studioState.trimStart !== undefined ? studioState.trimStart : 0;
    cur.trimEnd = studioState.trimEnd !== undefined ? studioState.trimEnd : (cur.videoDuration || 15);
    cur.trimPreset = studioState.trimPreset || 'none';
    if (cur.mediaType === 'video') {
      cur.videoClips = JSON.parse(JSON.stringify(studioState.videoClips || []));
      cur.selectedClipId = studioState.selectedClipId;
      cur.videoVolume = studioState.videoVolume;
      cur.isVideoMuted = studioState.isVideoMuted;
    }

    // 3. Metadata, Vị trí & Kiểu dáng
    cur.detectedLocation = studioState.detectedLocation;
    cur.mentionStyle = studioState.mentionStyle;
    cur.locationStyle = studioState.locationStyle;

    // 4. Thông số ảnh & Hiệu ứng màu
    cur.imageDuration = studioState.imageDuration || 15;
    cur.imageFilter = studioState.imageFilter || 'normal';
    cur.brightness = studioState.brightness ?? 100;
    cur.contrast = studioState.contrast ?? 100;
    cur.saturate = studioState.saturate ?? 100;
    cur.sepia = studioState.sepia ?? 0;
    cur.blur = studioState.blur ?? 0;
    cur.vignette = studioState.vignette ?? 0;
    cur.rotation = studioState.rotation || 0;
    cur.freeAngle = studioState.freeAngle || 0;
    cur.flipH = !!studioState.flipH;
    cur.flipV = !!studioState.flipV;
    cur.imageFx = studioState.imageFx || 'none';
  }

  async function extractKeyframeFromVideo(videoUrl) {
    if (!videoUrl || (typeof videoUrl === 'string' && videoUrl.includes('mock_'))) {
      return new Blob(['mock_keyframe'], { type: 'image/jpeg' });
    }
    return new Promise(resolve => {
      try {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.preload = 'metadata';
        v.muted = true;
        v.src = videoUrl;

        v.onloadedmetadata = () => {
          v.currentTime = 0.05;
        };
        v.onseeked = () => {
          try {
            const c = document.createElement('canvas');
            c.width = v.videoWidth || 1080;
            c.height = v.videoHeight || 1920;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0, c.width, c.height);
            c.toBlob(blob => {
              resolve(blob);
            }, 'image/jpeg', 0.95);
          } catch (_) {
            resolve(null);
          }
        };
        v.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 1500);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function extractEmbeddedMp4FromMotionPhoto(file) {
    if (!file) return null;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Quét tìm signature box ftyp của MP4: 0x66, 0x74, 0x79, 0x70 ('ftyp')
      for (let i = 4; i < bytes.length - 8; i++) {
        if (bytes[i] === 0x66 && bytes[i + 1] === 0x74 && bytes[i + 2] === 0x79 && bytes[i + 3] === 0x70) {
          const offset = i - 4; // Offset bắt đầu của box ftyp
          const mp4Bytes = bytes.slice(offset);
          if (mp4Bytes.length > 1024) {
            return new Blob([mp4Bytes], { type: 'video/mp4' });
          }
        }
      }
      return null;
    } catch (err) {
      console.warn('[InstaTweaks] Motion photo MP4 extraction notice:', err);
      return null;
    }
  }

  function updateBottomControlsVisibility() {
    const timelinePanel = document.getElementById('igt-studio-timeline-panel');
    const livePanel = document.getElementById('igt-studio-live-selector-panel');
    if (!timelinePanel) return;

    const isPost = (studioState.mode === 'post');
    const currentItem = (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex])
      ? studioState.mediaList[studioState.activeMediaIndex]
      : null;

    const isVideo = currentItem ? (currentItem.mediaType === 'video') : (studioState.mediaType === 'video');
    const isLive = currentItem ? (!isVideo && (currentItem.isLivePhoto || /^mvimg_|_live|_motion/i.test(currentItem.name || ''))) : false;

    if (isPost && !isVideo) {
      // ĐANG Ở CHẾ ĐỘ BÀI VIẾT (POST) VÀ ĐANG ACTIVE ẢNH:
      // 1. Ẩn triệt để toàn bộ thanh Timeline Video Editor
      timelinePanel.style.setProperty('display', 'none', 'important');
      timelinePanel.classList.add('igt-hidden');

      // 2. Nếu là Ảnh Live (Motion Photo) -> Hiển thị ô chọn chế độ Live / Ảnh thường (Pill dropdown nhỏ gọn)
      if (isLive) {
        if (livePanel) {
          livePanel.style.removeProperty('display');
          livePanel.classList.remove('igt-hidden');
          livePanel.style.display = 'flex';
          renderPostLiveSelectorUI(livePanel, currentItem, studioState.activeMediaIndex);
        }
      } else {
        // Ảnh tĩnh thường -> Ẩn cả 2 để giao diện preview bài viết rộng rãi, sạch sẽ
        if (livePanel) {
          livePanel.style.setProperty('display', 'none', 'important');
          livePanel.classList.add('igt-hidden');
        }
      }
    } else {
      // CHẾ ĐỘ STORY, REEL HOẶC POST ĐANG ACTIVE VIDEO THẬT -> HIỆN TIMELINE
      timelinePanel.style.removeProperty('display');
      timelinePanel.classList.remove('igt-hidden');
      timelinePanel.style.display = 'flex';
      if (livePanel) {
        livePanel.style.setProperty('display', 'none', 'important');
        livePanel.classList.add('igt-hidden');
      }
    }
  }

  function renderPostLiveSelectorUI(container, item, idx) {
    if (!container || !item) return;

    const currentMode = item.liveMode || 'live';
    container.innerHTML = `
      <div class="igt-live-pill-wrap" title="Bấm để chọn định dạng đăng tải slide ảnh Live lên Instagram">
        <span class="igt-live-pill-dot ${currentMode === 'live' ? 'live' : 'still'}"></span>
        <select id="igt-select-live-dropdown" class="igt-live-pill-select" aria-label="Định dạng xuất bản ảnh Live">
          <option value="live" ${currentMode === 'live' ? 'selected' : ''}>🔴 Ảnh Live (Motion Video)</option>
          <option value="still" ${currentMode === 'still' ? 'selected' : ''}>📸 Ảnh tĩnh thường (Photo)</option>
        </select>
        <span class="igt-live-pill-chevron">⌄</span>
      </div>
    `;

    // Dropdown change
    const dropdown = container.querySelector('#igt-select-live-dropdown');
    const dot = container.querySelector('.igt-live-pill-dot');
    if (dropdown) {
      dropdown.onchange = (e) => {
        const val = e.target.value;
        if (dot) {
          dot.className = `igt-live-pill-dot ${val === 'live' ? 'live' : 'still'}`;
        }
        toggleLiveItemMode(idx, val);
      };
    }
  }

  async function toggleLiveItemMode(idx, newMode) {
    if (!studioState.mediaList || !studioState.mediaList[idx]) return;
    const item = studioState.mediaList[idx];
    item.liveMode = newMode;

    if (newMode === 'still') {
      try {
        if (item.mediaType === 'video') {
          const stillBlob = await extractKeyframeFromVideo(item.mediaUrl);
          if (stillBlob) {
            item.stillBlob = stillBlob;
            item.thumbUrl = URL.createObjectURL(stillBlob);
          }
        }
      } catch (_) { }
    } else if (newMode === 'live') {
      if (item.mediaType === 'image' && !item.liveVideoBlob && item.file) {
        try {
          const mp4 = await extractEmbeddedMp4FromMotionPhoto(item.file);
          if (mp4) {
            item.liveVideoBlob = mp4;
            item.liveVideoUrl = URL.createObjectURL(mp4);
          }
        } catch (_) { }
      }
    }

    if (idx === studioState.activeMediaIndex) {
      renderActiveMediaDOM(item);
      updateMediaTransform();
      updateBottomControlsVisibility();
    }

    renderMediaListUI();
    if (studioState.activeTab === 'general') {
      renderGeneralTabContent(document.getElementById('igt-studio-tab-content'));
    }
  }

  function openCullFilesModal(incomingFiles, maxSlots = 20) {
    const existing = document.getElementById('igt-cull-modal-overlay');
    if (existing) existing.remove();

    const existingCandidates = (studioState.mediaList || []).map((item, i) => ({
      id: item.id || ('exist_' + i),
      name: item.name || `Tệp ${i + 1}`,
      thumbUrl: item.thumbUrl || item.mediaUrl,
      mediaType: item.mediaType,
      isExisting: true,
      originalItem: item,
      selected: true
    }));

    const incomingCandidates = Array.from(incomingFiles).map((file, i) => {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
      return {
        id: 'inc_' + Date.now() + '_' + i,
        name: file.name,
        file: file,
        thumbUrl: URL.createObjectURL(file),
        mediaType: isVideo ? 'video' : 'image',
        isExisting: false,
        selected: true
      };
    });

    let candidates = [...existingCandidates, ...incomingCandidates];

    const overlay = document.createElement('div');
    overlay.className = 'igt-cull-overlay';
    overlay.id = 'igt-cull-modal-overlay';

    function renderCullUI() {
      const selectedCount = candidates.filter(c => c.selected).length;
      const isOver = selectedCount > maxSlots;
      const isZero = selectedCount === 0;

      overlay.innerHTML = `
        <div class="igt-cull-modal">
          <div class="igt-cull-header">
            <div>
              <div class="igt-cull-title">
                <span>📁 Quản lý & Chọn lọc tệp đăng tải</span>
                <span id="igt-cull-counter-badge" style="font-size: 12px; color: ${isOver ? '#ef4444' : '#38bdf8'}; background: ${isOver ? 'rgba(239, 68, 68, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; padding: 2px 8px; border-radius: 6px;">
                  Đã chọn: ${selectedCount}/${maxSlots} tệp
                </span>
              </div>
              <div class="igt-cull-subtitle">
                Instagram giới hạn tối đa ${maxSlots} tệp cho mỗi lần đăng bài viết. Bấm chọn hoặc bỏ chọn từng tệp bên dưới để tiếp tục.
              </div>
            </div>
            <button type="button" class="igt-publish-modal-close" id="igt-cull-close-btn">✕</button>
          </div>

          <div class="igt-cull-body">
            ${isOver ? `
              <div class="igt-cull-warning">
                <span style="font-size: 16px;">⚠️</span>
                <span>Bạn đã chọn <b>${selectedCount} tệp</b>, vượt quá giới hạn ${maxSlots} tệp. Vui lòng bấm bỏ chọn ít nhất <b>${selectedCount - maxSlots} tệp</b> để có thể tiếp tục.</span>
              </div>
            ` : ''}

            <div class="igt-cull-grid">
              ${candidates.map((c, idx) => `
                <div class="igt-cull-card ${c.selected ? 'selected' : 'unselected'}" data-cull-idx="${idx}">
                  <span class="igt-cull-badge">#${idx + 1}</span>
                  <div class="igt-cull-checkbox">${c.selected ? '✓' : ''}</div>
                  ${c.thumbUrl ? `<img class="igt-cull-thumb" src="${escapeHtml(c.thumbUrl)}" />` : `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">${c.mediaType === 'video' ? '🎬' : '🖼️'}</div>
                  `}
                  <div class="igt-cull-meta">
                    <span style="overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${escapeHtml(c.name)}</span>
                    <span style="color: ${c.selected ? '#38bdf8' : '#94a3b8'}; font-weight: 700;">${c.mediaType === 'video' ? 'Video' : 'Ảnh'}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="igt-cull-footer">
            <button type="button" id="igt-cull-btn-cancel" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer;">
              Hủy bỏ
            </button>
            <button type="button" id="igt-cull-btn-confirm" ${isOver || isZero ? 'disabled' : ''} style="background: ${isOver || isZero ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #0284c7, #0095f6)'}; border: none; color: ${isOver || isZero ? '#94a3b8' : '#fff'}; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 700; cursor: ${isOver || isZero ? 'not-allowed' : 'pointer'};">
              ✓ Xác nhận nạp (${selectedCount} tệp)
            </button>
          </div>
        </div>
      `;

      overlay.querySelector('#igt-cull-close-btn').onclick = () => {
        incomingCandidates.forEach(inc => URL.revokeObjectURL(inc.thumbUrl));
        overlay.remove();
      };
      overlay.querySelector('#igt-cull-btn-cancel').onclick = () => {
        incomingCandidates.forEach(inc => URL.revokeObjectURL(inc.thumbUrl));
        overlay.remove();
      };

      overlay.querySelectorAll('.igt-cull-card').forEach(card => {
        card.onclick = () => {
          const idx = parseInt(card.getAttribute('data-cull-idx'), 10);
          candidates[idx].selected = !candidates[idx].selected;
          renderCullUI();
        };
      });

      const btnConfirm = overlay.querySelector('#igt-cull-btn-confirm');
      if (btnConfirm && !isOver && !isZero) {
        btnConfirm.onclick = () => {
          const selectedCandidates = candidates.filter(c => c.selected);
          const finalMediaList = [];

          selectedCandidates.forEach(cand => {
            if (cand.isExisting && cand.originalItem) {
              finalMediaList.push(cand.originalItem);
            } else if (!cand.isExisting && cand.file) {
              const file = cand.file;
              const isVideo = cand.mediaType === 'video';
              const mediaUrl = URL.createObjectURL(file);
              const isLiveCandidate = !isVideo && (/^mvimg_|_live|_motion/i.test(file.name) || /mvimg/i.test(file.name));
              const newItem = {
                id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                file,
                mediaUrl,
                mediaType: isVideo ? 'video' : 'image',
                name: file.name,
                res: isVideo ? 'Video HD' : 'Ultra HD',
                thumbUrl: isVideo ? '' : mediaUrl,
                naturalWidth: 1080,
                naturalHeight: 1920,
                videoDuration: 0,
                trimStart: 0,
                trimEnd: 0,
                zoom: 1,
                panX: 0,
                panY: 0,
                fitMode: studioState.fitMode || 'blur_fit',
                stickers: [],
                detectedLocation: null,
                isLivePhoto: isLiveCandidate,
                liveMode: isLiveCandidate ? 'live' : (isVideo ? 'live' : 'still'),
                stillBlob: null,
                liveVideoBlob: null,
                liveVideoUrl: ''
              };
              if (!isVideo && /mvimg|live|motion/i.test(file.name)) {
                extractEmbeddedMp4FromMotionPhoto(file).then(mp4 => {
                  if (mp4) {
                    newItem.liveVideoBlob = mp4;
                    newItem.liveVideoUrl = URL.createObjectURL(mp4);
                    newItem.isLivePhoto = true;
                    if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex] === newItem) {
                      renderActiveMediaDOM(newItem);
                    }
                    renderMediaListUI();
                    updateBottomControlsVisibility();
                  }
                });
              }
              finalMediaList.push(newItem);
            }
          });

          candidates.filter(c => !c.isExisting && !c.selected).forEach(c => {
            URL.revokeObjectURL(c.thumbUrl);
          });

          studioState.mediaList = finalMediaList;
          studioState.activeMediaIndex = 0;
          activateMediaItem(0);
          renderMediaListUI();
          overlay.remove();
        };
      }
    }

    renderCullUI();
    document.body.appendChild(overlay);
  }

  function openReorderModal() {
    const existing = document.getElementById('igt-reorder-modal-overlay');
    if (existing) existing.remove();

    if (!studioState.mediaList || studioState.mediaList.length <= 1) {
      alert('Cần ít nhất 2 tệp trong kho để sắp xếp thứ tự!');
      return;
    }

    let tempItems = [...studioState.mediaList];
    let draggedIndex = null;

    const overlay = document.createElement('div');
    overlay.className = 'igt-reorder-overlay';
    overlay.id = 'igt-reorder-modal-overlay';

    function renderModalUI() {
      overlay.innerHTML = `
        <div class="igt-reorder-modal">
          <div class="igt-reorder-header">
            <div>
              <div class="igt-reorder-title">
                <span>🔀 Sắp xếp thứ tự các slide trong bài viết</span>
                <span id="igt-reorder-counter-badge" style="font-size: 12px; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 8px; border-radius: 6px;">${tempItems.length} slide</span>
              </div>
              
            </div>
            <button type="button" class="igt-publish-modal-close" id="igt-reorder-close-btn">✕</button>
          </div>

          <div class="igt-reorder-body">
            <div class="igt-reorder-grid" id="igt-reorder-grid">
              ${tempItems.map((item, idx) => {
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
                return `
                <div class="igt-reorder-card" data-idx="${idx}" data-preview-src="${escapeHtml(previewVideoSrc)}" draggable="true" title="Kéo thả thẻ để đổi thứ tự slide">
                  <span class="igt-reorder-badge">#${idx + 1}</span>
                  <div class="igt-reorder-actions">
                    <button type="button" draggable="false" class="igt-reorder-btn btn-reorder-del" data-del-idx="${idx}" style="color: #ef4444;" title="Xóa slide này">✕</button>
                  </div>
                  ${item.thumbUrl ? `<img class="igt-reorder-thumb" src="${escapeHtml(item.thumbUrl)}" draggable="false" />` : `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:24px;">${item.mediaType === 'video' ? '🎬' : '🖼️'}</div>
                  `}
                  <div class="igt-reorder-meta">
                    <span style="overflow: hidden; text-overflow: ellipsis; max-width: 65%; font-size: 10px;">${escapeHtml(item.name || `Slide #${idx + 1}`)}</span>
                    <button type="button" draggable="false" class="igt-reorder-type-btn" data-type-idx="${idx}" style="${typeBadgeStyle}" title="Bấm để đổi loại (Live ↔ Ảnh tĩnh)">${typeLabel}</button>
                  </div>
                </div>
              `;
              }).join('')}
            </div>
          </div>

          <div class="igt-reorder-footer">
            <button type="button" id="igt-reorder-btn-cancel" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; border-radius: 8px; padding: 8px 16px; font-size: 12px; font-weight: 600; cursor: pointer;">
              Hủy
            </button>
            <button type="button" id="igt-reorder-btn-save" style="background: linear-gradient(135deg, #0284c7, #0095f6); border: none; color: #fff; border-radius: 8px; padding: 8px 20px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
              ✓ Xác nhận thay đổi (${tempItems.length} slide)
            </button>
          </div>
        </div>
      `;

      overlay.querySelector('#igt-reorder-close-btn').onclick = () => overlay.remove();
      overlay.querySelector('#igt-reorder-btn-cancel').onclick = () => overlay.remove();

      overlay.querySelector('#igt-reorder-btn-save').onclick = () => {
        studioState.mediaList = tempItems;
        studioState.activeMediaIndex = 0;
        activateMediaItem(0);
        renderMediaListUI();
        if (studioState.activeTab === 'general') {
          renderGeneralTabContent(document.getElementById('igt-studio-tab-content'));
        }
        overlay.remove();
      };

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

          if (studioState.mediaList && studioState.mediaList[idx]) {
            studioState.mediaList[idx].liveMode = item.liveMode;
            if (studioState.activeMediaIndex === idx) {
              renderActiveMediaDOM(studioState.mediaList[idx]);
            }
          }

          renderModalUI();
        };
      });

      overlay.querySelectorAll('.btn-reorder-del').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-del-idx'), 10);
          if (tempItems.length <= 1) {
            alert('Bài viết cần tối thiểu 1 tệp.');
            return;
          }
          tempItems.splice(idx, 1);
          renderModalUI();
        };
      });

      const cards = overlay.querySelectorAll('.igt-reorder-card');
      cards.forEach(card => {
        card.ondragstart = (e) => {
          draggedIndex = parseInt(card.getAttribute('data-idx'), 10);
          card.classList.add('igt-card-dragging');
          e.dataTransfer.effectAllowed = 'move';
          try {
            e.dataTransfer.setData('text/plain', String(draggedIndex));
          } catch (_) { }

          // Tạo custom drag ghost để hiển thị rõ ràng nguyên cả CARD (khung viền bo góc, nền tối, badge #, tên tệp)
          try {
            const rect = card.getBoundingClientRect();
            const ghost = card.cloneNode(true);
            ghost.id = 'igt-drag-ghost-preview';
            ghost.style.position = 'fixed';
            ghost.style.top = '-9999px';
            ghost.style.left = '-9999px';
            ghost.style.width = `${rect.width || 130}px`;
            ghost.style.height = `${rect.height || 162}px`;
            ghost.style.borderRadius = '12px';
            ghost.style.border = '2px solid #38bdf8';
            ghost.style.background = '#1e293b';
            ghost.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.8), 0 0 20px rgba(56, 189, 248, 0.5)';
            ghost.style.opacity = '0.96';
            ghost.style.zIndex = '2147483647';
            ghost.style.pointerEvents = 'none';
            ghost.style.transform = 'none';
            document.body.appendChild(ghost);

            const offsetX = (e.clientX && rect.left) ? Math.max(10, Math.min(rect.width - 10, e.clientX - rect.left)) : ((rect.width || 130) / 2);
            const offsetY = (e.clientY && rect.top) ? Math.max(10, Math.min(rect.height - 10, e.clientY - rect.top)) : ((rect.height || 162) / 2);

            if (e.dataTransfer.setDragImage) {
              e.dataTransfer.setDragImage(ghost, offsetX, offsetY);
            }

            setTimeout(() => {
              if (ghost && ghost.parentNode) {
                ghost.remove();
              }
            }, 0);
          } catch (err) {
            console.warn('[InstaTweaks] Drag ghost preview warning:', err);
          }
        };
        card.ondragend = () => {
          card.classList.remove('igt-card-dragging');
          overlay.querySelectorAll('.igt-reorder-card').forEach(c => c.classList.remove('igt-drag-over'));
          const oldGhost = document.getElementById('igt-drag-ghost-preview');
          if (oldGhost) oldGhost.remove();
        };
        card.ondragover = (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          card.classList.add('igt-drag-over');
        };
        card.ondragleave = () => {
          card.classList.remove('igt-drag-over');
        };
        card.ondrop = (e) => {
          e.preventDefault();
          const targetIndex = parseInt(card.getAttribute('data-idx'), 10);
          if (draggedIndex !== null && draggedIndex !== targetIndex) {
            const movedItem = tempItems.splice(draggedIndex, 1)[0];
            tempItems.splice(targetIndex, 0, movedItem);
            renderModalUI();
          }
        };
      });
    }

    renderModalUI();
    document.body.appendChild(overlay);
  }

  function showPublishToast(content, type = true, duration = 2500) {
    let container = document.getElementById('igt-publish-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'igt-publish-toast-container';
      container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;gap:10px;max-width:420px;pointer-events:none;';
      document.body.appendChild(container);
    }

    // Xóa sạch thông báo cũ để tránh xếp chồng đè lên nhau
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = 'igt-studio-toast';

    let bg = 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))';
    let borderColor = 'rgba(56, 189, 248, 0.4)';
    let shadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(56, 189, 248, 0.2)';

    if (type === false) {
      borderColor = 'rgba(239, 68, 68, 0.5)';
      shadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(239, 68, 68, 0.25)';
    } else if (type === 'warn') {
      borderColor = 'rgba(245, 158, 11, 0.5)';
      shadow = '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(245, 158, 11, 0.25)';
    }

    toast.style.cssText = `background:${bg};border:1px solid ${borderColor};border-radius:12px;padding:12px 16px;color:#f8fafc;font-size:12.5px;box-shadow:${shadow};backdrop-filter:blur(12px);display:flex;align-items:flex-start;gap:10px;line-height:1.5;pointer-events:auto;transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1);transform:translateY(20px);opacity:0;`;

    if (typeof content === 'string') {
      toast.innerHTML = content.replace(/\n/g, '<br/>');
    } else if (content instanceof HTMLElement) {
      toast.appendChild(content);
    }

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  function addMediaFiles(filesList) {
    if (!filesList || filesList.length === 0) return;
    let files = Array.from(filesList);

    // 1. Kiểm tra validation giới hạn tối đa tuyệt đối của Instagram:
    // - Video Instagram: tối đa 1 GB (1024 MB)
    // - Ảnh Instagram: tối đa 30 MB
    const IG_MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1 GB
    const IG_MAX_PHOTO_SIZE = 30 * 1024 * 1024;   // 30 MB

    const invalidIgFiles = [];
    files = files.filter(f => {
      const isVideo = f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name);
      const maxSize = isVideo ? IG_MAX_VIDEO_SIZE : IG_MAX_PHOTO_SIZE;
      if (f.size > maxSize) {
        invalidIgFiles.push({
          name: f.name,
          sizeMb: (f.size / (1024 * 1024)).toFixed(1),
          limit: isVideo ? '1 GB (Video)' : '30 MB (Ảnh)',
          type: isVideo ? 'Video' : 'Ảnh'
        });
        return false;
      }
      return true;
    });

    if (invalidIgFiles.length > 0) {
      const errList = invalidIgFiles.map(item => `• ${item.name} (${item.sizeMb} MB - vượt quá ${item.limit})`).join('\n');
      showPublishToast(`❌ Phát hiện ${invalidIgFiles.length} tệp vượt quá giới hạn tải lên tối đa của Instagram:\n${errList}\nVui lòng giảm kích thước tệp trước khi đăng tải.`, false, 6000);
      if (files.length === 0) return;
    }

    // 2. Cảnh báo tệp lớn (VẪN CHO PHÉP UPLOAD BÌNH THƯỜNG, chỉ cảnh báo có thể gây chậm và lag)
    const LARGE_VIDEO_THRESHOLD = 50 * 1024 * 1024; // 50 MB
    const LARGE_PHOTO_THRESHOLD = 15 * 1024 * 1024; // 15 MB
    const largeFiles = files.filter(f => {
      const isVideo = f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name);
      return isVideo ? (f.size > LARGE_VIDEO_THRESHOLD) : (f.size > LARGE_PHOTO_THRESHOLD);
    });

    if (largeFiles.length > 0) {
      const details = largeFiles.map(f => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`).slice(0, 3).join(', ');
      const more = largeFiles.length > 3 ? ` và ${largeFiles.length - 3} tệp khác` : '';
      showPublishToast(`⚠️ Phát hiện ${largeFiles.length} tệp dung lượng lớn: ${details}${more}.\nHệ thống vẫn nạp tệp bình thường, nhưng quá trình xem trước và kết xuất có thể gây chậm hoặc giật lag trình duyệt.`, 'warn', 5500);
    }

    if (studioState.mode === 'reel') {
      // Chế độ Reel chỉ nhận đúng 1 file video
      const videoFile = files.find(f => f.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(f.name)) || files[0];
      if (studioState.mediaList && studioState.mediaList.length > 0) {
        studioState.mediaList.forEach(item => {
          if (item.mediaUrl && item.mediaUrl.startsWith('blob:')) {
            URL.revokeObjectURL(item.mediaUrl);
          }
        });
      }
      studioState.mediaList = [];
      files = [videoFile];
    } else {
      const maxSlots = studioState.mode === 'post' ? 20 : 10;
      const currentCount = studioState.mediaList ? studioState.mediaList.length : 0;
      if (currentCount + files.length > maxSlots) {
        openCullFilesModal(files, maxSlots);
        return;
      }
    }

    if (!studioState.mediaList) studioState.mediaList = [];
    const startIndex = studioState.mediaList.length;

    files.forEach(file => {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
      const isLiveCandidate = !isVideo && (/^mvimg_|_live|_motion/i.test(file.name) || /mvimg/i.test(file.name));
      const mediaUrl = URL.createObjectURL(file);
      const item = {
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        file,
        mediaUrl,
        mediaType: isVideo ? 'video' : 'image',
        name: file.name,
        res: isVideo ? 'Video HD' : 'Ultra HD',
        thumbUrl: isVideo ? '' : mediaUrl,
        naturalWidth: 1080,
        naturalHeight: 1920,
        videoDuration: 0,
        trimStart: 0,
        trimEnd: 0,
        zoom: 1,
        panX: 0,
        panY: 0,
        fitMode: studioState.fitMode || 'blur_fit',
        stickers: [],
        detectedLocation: null,
        isLivePhoto: isLiveCandidate,
        liveMode: isLiveCandidate ? 'live' : (isVideo ? 'live' : 'still'),
        stillBlob: null,
        liveVideoBlob: null,
        liveVideoUrl: ''
      };
      if (!isVideo && /mvimg|live|motion/i.test(file.name)) {
        extractEmbeddedMp4FromMotionPhoto(file).then(mp4 => {
          if (mp4) {
            item.liveVideoBlob = mp4;
            item.liveVideoUrl = URL.createObjectURL(mp4);
            item.isLivePhoto = true;
            if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex] === item) {
              renderActiveMediaDOM(item);
            }
            renderMediaListUI();
            updateBottomControlsVisibility();
          }
        });
      }
      studioState.mediaList.push(item);

      // Tải trước metadata thời lượng cho video để hiển thị ngay trên thẻ kho
      if (isVideo) {
        const tempV = document.createElement('video');
        tempV.preload = 'metadata';
        tempV.src = mediaUrl;
        tempV.addEventListener('loadedmetadata', () => {
          item.videoDuration = tempV.duration || 0;
          if (item.trimPreset === 'none' || !item.trimEnd) {
            item.trimStart = 0;
            item.trimEnd = item.videoDuration;
            item.videoClips = [{
              id: 'clip_' + Date.now(),
              start: 0,
              end: item.videoDuration,
              speed: 1
            }];
            item.selectedClipId = item.videoClips[0].id;
          }
          if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex] === item) {
            studioState.videoDuration = item.videoDuration;
            if (studioState.trimPreset === 'none' || !studioState.trimEnd) {
              studioState.trimStart = 0;
              studioState.trimEnd = item.videoDuration;
              studioState.videoClips = JSON.parse(JSON.stringify(item.videoClips));
              studioState.selectedClipId = item.selectedClipId;
              renderTimeline();
            }
          }
          renderMediaListUI();
        }, { once: true });
      }

      // Tự động phân tích metadata EXIF / GPS để trích xuất vị trí chụp/quay của tệp
      extractLocationFromFile(file).then(loc => {
        if (loc) {
          item.detectedLocation = loc;
          if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex] === item) {
            studioState.detectedLocation = loc;
            if (studioState.activeTab === 'location') {
              renderTabContent('location');
            }
          }
        }
      });
    });

    if (startIndex === 0 || studioState.mode === 'reel') {
      studioState.activeMediaIndex = 0;
      activateMediaItem(0);
    } else {
      renderMediaListUI();
    }

    takeSnapshot('Add media files');
  }

  function activateMediaItem(index) {
    if (!studioState.mediaList || !studioState.mediaList[index]) return;

    if (studioState.isSequenceMode) {
      studioState.activeMediaIndex = index;
      const targetClipIdx = (studioState.videoClips || []).findIndex(c => c.mediaIndex === index);
      if (targetClipIdx !== -1) {
        const targetClip = studioState.videoClips[targetClipIdx];
        currentPlayingClipIndex = targetClipIdx;
        studioState.selectedClipId = targetClip.id;
        ensureVideoClipLoaded(targetClip, targetClip.start, studioState.isVideoPlaying);
        studioState.currentTime = getTimelineTimeFromVideoTime(targetClipIdx, targetClip.start);
        updateTimelineNeedle();
        checkAndApplyLiveTransition(studioState.currentTime);
        renderTimeline();
        renderMediaListUI();
        return;
      }
    }

    // 1. Lưu lại toàn bộ thiết lập hoàn chỉnh của tệp trước đó
    saveCurrentMediaState();

    // 2. Chuyển chỉ mục tệp active
    studioState.activeMediaIndex = index;
    const item = studioState.mediaList[index];

    // 3. Khôi phục độc lập toàn bộ thiết lập của tệp được chọn
    studioState.currentFile = item.file;
    studioState.mediaUrl = item.mediaUrl;
    studioState.mediaType = item.mediaType;
    studioState.naturalWidth = item.naturalWidth || 1080;
    studioState.naturalHeight = item.naturalHeight || 1920;
    studioState.videoDuration = item.videoDuration || 0;

    // Trimming & Clips
    studioState.trimStart = item.trimStart !== undefined ? item.trimStart : 0;
    studioState.trimEnd = (item.trimEnd !== undefined && item.trimEnd > 0) ? item.trimEnd : (item.videoDuration || 0);
    studioState.trimPreset = item.trimPreset || 'none';

    if (item.mediaType === 'video') {
      if (item.videoClips && item.videoClips.length > 0) {
        studioState.videoClips = JSON.parse(JSON.stringify(item.videoClips));
        // Nếu chỉ có 1 clip đơn ở chế độ tự do, đồng bộ theo thời lượng thực tế
        if (studioState.videoClips.length === 1 && studioState.trimPreset === 'none' && studioState.videoDuration > 0) {
          studioState.videoClips[0].start = 0;
          studioState.videoClips[0].end = studioState.videoDuration;
          studioState.trimEnd = studioState.videoDuration;
        }
        studioState.selectedClipId = item.selectedClipId || studioState.videoClips[0].id;
      } else {
        studioState.videoClips = [{
          id: 'clip_' + Date.now(),
          start: studioState.trimStart,
          end: studioState.trimEnd || studioState.videoDuration || 15,
          speed: 1
        }];
        studioState.selectedClipId = studioState.videoClips[0].id;
      }
      studioState.videoVolume = item.videoVolume !== undefined ? item.videoVolume : 1;
      studioState.isVideoMuted = !!item.isVideoMuted;
    } else {
      studioState.videoClips = [];
      studioState.selectedClipId = null;
    }

    // Zoom, Pan, FitMode & Ratio
    studioState.zoom = item.zoom !== undefined ? item.zoom : 1;
    studioState.panX = item.panX || 0;
    studioState.panY = item.panY || 0;
    studioState.fitMode = item.fitMode || 'blur_fit';
    if (item.ratio) {
      studioState.ratio = item.ratio;
    }

    // Nhãn dán độc lập theo từng tệp
    studioState.stickers = JSON.parse(JSON.stringify(item.stickers || []));
    studioState.activeStickerId = null;

    // Vị trí & Kiểu dáng
    studioState.detectedLocation = item.detectedLocation || null;
    if (item.mentionStyle) studioState.mentionStyle = item.mentionStyle;
    if (item.locationStyle) studioState.locationStyle = item.locationStyle;

    // Phục hồi thông số ảnh & hiệu ứng
    studioState.imageDuration = item.imageDuration || 15;
    studioState.imageFilter = item.imageFilter || 'normal';
    studioState.brightness = item.brightness ?? 100;
    studioState.contrast = item.contrast ?? 100;
    studioState.saturate = item.saturate ?? 100;
    studioState.sepia = item.sepia ?? 0;
    studioState.blur = item.blur ?? 0;
    studioState.vignette = item.vignette ?? 0;
    studioState.rotation = item.rotation || 0;
    studioState.freeAngle = item.freeAngle || 0;
    studioState.flipH = !!item.flipH;
    studioState.flipV = !!item.flipV;
    studioState.imageFx = item.imageFx || 'none';

    // Cập nhật giá trị hiển thị trên thanh Zoom canvas & tab sidebar
    const zoomSlider = document.getElementById('igt-studio-zoom-slider');
    const tabZoomSlider = document.getElementById('igt-tab-zoom-slider');
    const tabZoomVal = document.getElementById('igt-tab-zoom-val');
    if (zoomSlider) zoomSlider.value = studioState.zoom;
    if (tabZoomSlider) tabZoomSlider.value = studioState.zoom;
    if (tabZoomVal) tabZoomVal.innerText = Math.round(studioState.zoom * 100) + '%';

    // Cập nhật active ratio button & fit button trên modal
    const modal = document.getElementById('igt-studio-modal');
    if (modal) {
      modal.querySelectorAll('.igt-studio-ratio-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-ratio') === studioState.ratio);
      });
      modal.querySelectorAll('.igt-studio-fit-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-fit') === studioState.fitMode);
      });
    }

    if (!studioState.detectedLocation && item.file) {
      extractLocationFromFile(item.file).then(loc => {
        if (loc) {
          item.detectedLocation = loc;
          if (studioState.activeMediaIndex === index) {
            studioState.detectedLocation = loc;
            if (studioState.activeTab === 'location') {
              renderTabContent('location');
            }
          }
        }
      });
    }

    renderActiveMediaDOM(item);
    renderStickers();
    renderTimeline();
    updateBottomControlsVisibility();
    renderMediaListUI();
    updateFxOverlay();

    // Re-render tab đang mở để toàn bộ sliders, controls, buttons hiển thị đúng setting của tệp này
    renderTabContent(studioState.activeTab || 'main');
  }

  function removeMediaItem(index) {
    if (!studioState.mediaList || !studioState.mediaList[index]) return;
    const it = studioState.mediaList[index];
    if (it.mediaUrl && it.mediaUrl.startsWith('blob:')) {
      URL.revokeObjectURL(it.mediaUrl);
    }
    studioState.mediaList.splice(index, 1);

    if (studioState.mediaList.length === 0) {
      studioState.activeMediaIndex = 0;
      studioState.currentFile = null;
      studioState.mediaUrl = '';
      studioState.mediaType = null;
      studioState.stickers = [];
      const container = document.getElementById('igt-studio-media-container');
      if (container) {
        container.innerHTML = `
          <div id="igt-studio-empty-prompt" style="color: #64748b; font-size: 13px; font-weight: 500; text-align: center; padding: 20px;">
            Chưa có tệp nào.<br>Hãy kéo thả ảnh/video vào đây.
          </div>
        `;
      }
      const blurBg = document.getElementById('igt-studio-blur-bg');
      if (blurBg) blurBg.style.display = 'none';
      renderStickers();
      renderTimeline();
      renderMediaListUI();
    } else {
      if (studioState.activeMediaIndex >= studioState.mediaList.length) {
        studioState.activeMediaIndex = studioState.mediaList.length - 1;
      }
      activateMediaItem(studioState.activeMediaIndex);
    }
    takeSnapshot('Remove media item');
  }

  function setupStorySequence() {
    if (!studioState.mediaList || studioState.mediaList.length < 2) return;

    // Giới hạn an toàn tối đa 10 tệp
    const safeItems = studioState.mediaList.slice(0, 10);

    studioState.videoClips = safeItems.map((item, idx) => {
      const vStart = item.trimStart || 0;
      let vEnd = item.trimEnd;
      if (!vEnd || vEnd <= vStart) {
        vEnd = item.videoDuration && item.videoDuration > 0 ? item.videoDuration : (item.mediaType === 'image' ? 5 : 15);
      }
      return {
        id: 'seq_' + idx + '_' + (item.id || Date.now()),
        name: item.name || (item.mediaType === 'video' ? `Video ${idx + 1}` : `Ảnh ${idx + 1}`),
        mediaIndex: idx,
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        start: vStart,
        end: vEnd,
        speed: item.speed || 1
      };
    });

    studioState.isSequenceMode = true;
    studioState.selectedClipId = studioState.videoClips[0].id;
    currentPlayingClipIndex = 0;
    studioState.trimStart = 0;
    studioState.trimEnd = getVideoClipsTotalDuration();
    studioState.mediaType = 'video';

    // Kích hoạt clip đầu tiên
    const firstClip = studioState.videoClips[0];
    ensureVideoClipLoaded(firstClip, firstClip.start, false);

    renderTimeline();
    renderMediaListUI();
    updateActiveTrackUI();
    takeSnapshot('Bật ghép chuỗi video hoàn chỉnh');
  }

  function toggleStorySequence() {
    if (studioState.isSequenceMode) {
      studioState.isSequenceMode = false;
      const curItem = studioState.mediaList[studioState.activeMediaIndex] || studioState.mediaList[0];
      if (curItem && curItem.mediaType === 'video') {
        const vStart = curItem.trimStart || 0;
        const vEnd = (curItem.trimEnd && curItem.trimEnd > vStart) ? curItem.trimEnd : (curItem.videoDuration || 15);
        studioState.videoClips = [{
          id: 'clip_' + Date.now(),
          name: curItem.name || 'Đoạn 1',
          mediaIndex: studioState.activeMediaIndex,
          mediaUrl: curItem.mediaUrl,
          mediaType: curItem.mediaType,
          start: vStart,
          end: vEnd,
          speed: 1
        }];
        studioState.selectedClipId = studioState.videoClips[0].id;
      } else {
        studioState.videoClips = [];
        studioState.selectedClipId = null;
      }
      currentPlayingClipIndex = 0;
      if (curItem) {
        ensureVideoClipLoaded(curItem, curItem.trimStart || 0, false);
      }
      takeSnapshot('Tắt chế độ ghép chuỗi video');
    } else {
      setupStorySequence();
    }
    renderTimeline();
    renderMediaListUI();
    updateActiveTrackUI();
    if (studioState.activeTab === 'main') renderTabContent('main');
  }

  function renderMediaListUI() {
    const listContainer = document.getElementById('igt-studio-media-list');
    const dropzone = document.getElementById('igt-studio-dropzone');
    if (!listContainer) return;

    const count = studioState.mediaList ? studioState.mediaList.length : 0;
    const maxLimit = studioState.mode === 'post' ? 20 : (studioState.mode === 'reel' ? 1 : 10);
    if (dropzone) {
      dropzone.classList.toggle('compact', count > 0);
      const titleEl = dropzone.querySelector('.igt-studio-drop-title');
      const subEl = dropzone.querySelector('.igt-studio-drop-sub');
      if (titleEl) {
        titleEl.innerText = count > 0 ? (studioState.mode === 'reel' ? '🔄 Thay thế Video Reel' : '+ Thêm ảnh hoặc video') : 'Thêm ảnh hoặc video';
      }
      if (subEl) {
        subEl.innerText = studioState.mode === 'reel' ? 'Reel chỉ hỗ trợ 1 video duy nhất' : `Đã có ${count}/${maxLimit} tệp. Kéo thả để thêm`;
      }
    }

    if (count === 0) {
      listContainer.innerHTML = '';
      return;
    }

    listContainer.innerHTML = `
      <div class="igt-media-queue-header">
        <span>Tệp trong kho (${count}${studioState.mode !== 'reel' ? `/${maxLimit}` : ''})</span>
        ${studioState.mode !== 'reel' && count < maxLimit ? `
          <button type="button" id="igt-btn-add-more-media" class="igt-media-queue-add-btn">+ Thêm tệp</button>
        ` : ''}
      </div>

      <!-- Card gợi ý Ghép nối nhiều video khi có từ 2 tệp trở lên -->
      ${count >= 2 ? `
        <div class="igt-sequence-option-card ${studioState.isSequenceMode ? 'active' : ''}">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 11px; font-weight: 700; color: ${studioState.isSequenceMode ? '#38bdf8' : '#f472b6'}; display: flex; align-items: center; gap: 5px;">
              🎬 Ghép nối nhiều video (${count} tệp)
            </span>
            <span style="font-size: 9px; background: ${studioState.isSequenceMode ? 'rgba(56,189,248,0.2)' : 'rgba(236,72,153,0.2)'}; color: ${studioState.isSequenceMode ? '#38bdf8' : '#f472b6'}; padding: 1px 6px; border-radius: 4px; font-weight: 700;">
              ${studioState.isSequenceMode ? 'ĐANG BẬT' : 'LIỀN MẠCH'}
            </span>
          </div>
          <div style="font-size: 10px; color: #94a3b8; line-height: 1.35; margin: 2px 0 4px 0;">
            Chèn tất cả ${count} video/ảnh thành 1 đoạn video hoàn chỉnh duy nhất trên dòng thời gian để xem liền mạch.
          </div>
          <button type="button" id="igt-btn-toggle-sequence" style="width: 100%; padding: 5px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; background: ${studioState.isSequenceMode ? 'linear-gradient(135deg, #0284c7, #0095f6)' : 'rgba(255,255,255,0.08)'}; color: #ffffff; border: 1px solid ${studioState.isSequenceMode ? '#38bdf8' : 'rgba(255,255,255,0.15)'}; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
            ${studioState.isSequenceMode ? '✓ Đang xem chuỗi ghép nối hoàn chỉnh' : '🎬 Bật ghép nối các video thành 1 đoạn'}
          </button>
        </div>
      ` : ''}

      <div class="igt-media-queue-items">
        ${studioState.mediaList.map((item, idx) => `
          <div class="igt-media-queue-card ${idx === studioState.activeMediaIndex ? 'active' : ''}" data-idx="${idx}" draggable="true" title="Bấm để kích hoạt | Kéo thả vào dòng thời gian hoặc bấm dấu + để thêm vào edit">
            <div class="igt-media-queue-thumb-wrap">
              <span class="igt-media-queue-badge">#${idx + 1}</span>
              ${item.thumbUrl ? `<img class="igt-media-queue-thumb" src="${escapeHtml(item.thumbUrl)}" />` : `
                <div class="igt-media-queue-placeholder">${item.mediaType === 'video' ? '🎬' : '🖼️'}</div>
              `}
              <button type="button" class="igt-media-queue-add-clip-btn" data-add-clip-idx="${idx}" title="Bấm dấu + để thêm vào dòng thời gian edit">+</button>
            </div>
            <div class="igt-media-queue-info">
              <div class="igt-media-queue-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
              <div class="igt-media-queue-meta">${item.mediaType === 'video' ? `Video • HD${item.videoDuration ? ' • ' + formatTime(item.videoDuration) : ''}` : (item.naturalWidth ? `Ảnh • ${item.naturalWidth}×${item.naturalHeight}` : 'Ảnh • HD')}</div>
              ${(item.mediaType !== 'video' && item.isLivePhoto) ? `
                <div class="igt-live-toggle" style="margin-top: 4px;">
                  <button type="button" class="igt-live-btn ${item.liveMode !== 'still' ? 'active' : ''}" data-live-idx="${idx}" data-live-val="live" title="Giữ chuyển động video/live">🎬 Live</button>
                  <button type="button" class="igt-live-btn ${item.liveMode === 'still' ? 'active' : ''}" data-live-idx="${idx}" data-live-val="still" title="Trích xuất khung hình ảnh tĩnh">📷 Tĩnh</button>
                </div>
              ` : ''}
            </div>
            <button type="button" class="igt-media-queue-del-btn" data-del-idx="${idx}" title="Xóa tệp này khỏi kho">✕</button>
          </div>
        `).join('')}
      </div>
    `;

    // Click chọn tệp để kích hoạt
    listContainer.querySelectorAll('.igt-media-queue-card').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('.igt-media-queue-del-btn') || e.target.closest('.igt-media-queue-add-clip-btn')) return;
        const idx = parseInt(card.getAttribute('data-idx'), 10);
        if (idx !== studioState.activeMediaIndex) {
          activateMediaItem(idx);
        }
      };
    });

    // Click dấu + trên card trong khay chứa để thêm vào edit
    listContainer.querySelectorAll('.igt-media-queue-add-clip-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const addIdx = parseInt(btn.getAttribute('data-add-clip-idx'), 10);
        const mItem = studioState.mediaList && studioState.mediaList[addIdx];
        if (mItem) {
          appendClipToSequence(mItem, addIdx);
        }
      };
    });

    // Kéo thả thẻ tệp từ khay chứa vào dòng thời gian hoặc màn hình edit
    listContainer.querySelectorAll('.igt-media-queue-card').forEach(card => {
      card.ondragstart = (e) => {
        const idx = card.getAttribute('data-idx');
        e.dataTransfer.setData('text/plain', String(idx));
        e.dataTransfer.setData('application/x-instatweaks-media', String(idx));
        e.dataTransfer.effectAllowed = 'copyMove';
        card.classList.add('igt-card-dragging');
      };
      card.ondragend = () => {
        card.classList.remove('igt-card-dragging');
        document.querySelectorAll('.igt-timeline-drop-target, .igt-canvas-drop-active').forEach(el => {
          el.classList.remove('igt-timeline-drop-target', 'igt-canvas-drop-active');
        });
      };
    });

    // Click xóa tệp
    listContainer.querySelectorAll('.igt-media-queue-del-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const delIdx = parseInt(btn.getAttribute('data-del-idx'), 10);
        removeMediaItem(delIdx);
      };
    });

    // Nút thêm tệp
    const btnAddMore = listContainer.querySelector('#igt-btn-add-more-media');
    if (btnAddMore) {
      btnAddMore.onclick = () => {
        const fileInput = document.getElementById('igt-studio-file-input');
        if (fileInput) fileInput.click();
      };
    }

    // Nút bật/tắt ghép nối tiếp theo nhạc
    const btnToggleSeq = listContainer.querySelector('#igt-btn-toggle-sequence');
    if (btnToggleSeq) {
      btnToggleSeq.onclick = () => {
        toggleStorySequence();
      };
    }

    // Chuyển đổi chế độ Live Photo (Live vs Ảnh tĩnh)
    listContainer.querySelectorAll('.igt-live-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-live-idx'), 10);
        const val = btn.getAttribute('data-live-val');
        toggleLiveItemMode(idx, val);
      };
    });
  }

  function renderActiveMediaDOM(item) {
    const container = document.getElementById('igt-studio-media-container');
    const blurBg = document.getElementById('igt-studio-blur-bg');
    if (!container || !item) return;

    container.innerHTML = '';

    const isLive = item.isLivePhoto || /^mvimg_|_live|_motion/i.test(item.name || '');
    const isLiveLoopActive = isLive && (item.liveMode !== 'still');

    if (item.mediaType === 'image' && isLiveLoopActive && item.liveVideoUrl) {
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

      // Không gắn timeupdate ghi đè studioState.currentTime để kim timeline Story 15s tự do chạy đồng bộ qua togglePlayPause

video.addEventListener('loadedmetadata', () => {
        item.naturalWidth = video.videoWidth || 1080;
        item.naturalHeight = video.videoHeight || 1920;
        studioState.naturalWidth = item.naturalWidth;
        studioState.naturalHeight = item.naturalHeight;

        if (blurBg) {
          blurBg.style.backgroundImage = `url('${item.thumbUrl || item.mediaUrl}')`;
          blurBg.style.display = studioState.fitMode === 'blur_fit' ? 'block' : 'none';
        }
        applyFitMode();
        updateMediaTransform();
        renderTimeline();
        renderMediaListUI();
      }, { once: true });

      container.appendChild(video);
      video.play().catch(() => { });
    } else if (item.mediaType === 'image') {
      const img = document.createElement('img');
      img.id = 'igt-studio-active-media';
      img.className = 'igt-studio-active-media';
      img.src = (item.liveMode === 'still' && item.stillBlob) ? URL.createObjectURL(item.stillBlob) : item.mediaUrl;
      img.alt = item.name;

      img.addEventListener('load', () => {
        item.naturalWidth = img.naturalWidth || 1080;
        item.naturalHeight = img.naturalHeight || 1920;
        studioState.naturalWidth = item.naturalWidth;
        studioState.naturalHeight = item.naturalHeight;
        if (!item.thumbUrl) item.thumbUrl = item.mediaUrl;

        if (blurBg) {
          blurBg.style.backgroundImage = `url('${item.thumbUrl || item.mediaUrl}')`;
          blurBg.style.display = studioState.fitMode === 'blur_fit' ? 'block' : 'none';
        }
        applyFitMode();
        updateMediaTransform();
        renderTimeline();
        renderMediaListUI();
      }, { once: true });

      container.appendChild(img);

      // Nếu là ảnh Live đang ở chế độ Live nhưng chưa trích xuất MP4, lập tức trích xuất và phát lặp
      if (isLiveLoopActive && !item.liveVideoUrl && item.file) {
        extractEmbeddedMp4FromMotionPhoto(item.file).then(mp4 => {
          if (mp4) {
            item.liveVideoBlob = mp4;
            item.liveVideoUrl = URL.createObjectURL(mp4);
            item.isLivePhoto = true;
            if (studioState.mediaList && studioState.mediaList[studioState.activeMediaIndex] === item) {
              renderActiveMediaDOM(item);
            }
          }
        });
      }
    } else {
      // Video
      const video = document.createElement('video');
      video.id = 'igt-studio-active-media';
      video.className = 'igt-studio-active-media';
      video.autoplay = true;
      video.loop = false;
      // Ưu tiên âm thanh của video Studio nếu chưa gắn track nhạc ngoài
      video.muted = !!studioState.audioUrl;
      video.playsInline = true;

      let hasCapturedThumb = false;
      const captureVideoThumbnail = () => {
        if (hasCapturedThumb) return;
        try {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = 160;
            snapCanvas.height = Math.round(160 * (video.videoHeight / video.videoWidth)) || 160;
            const snapCtx = snapCanvas.getContext('2d');
            snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
            const snapUrl = snapCanvas.toDataURL('image/jpeg', 0.85);
            item.thumbUrl = snapUrl;

            if (blurBg) {
              blurBg.style.backgroundImage = `url('${snapUrl}')`;
              blurBg.style.display = studioState.fitMode === 'blur_fit' ? 'block' : 'none';
            }

            const thumbWrap = document.querySelector(`.igt-media-queue-card[data-idx="${studioState.activeMediaIndex}"] .igt-media-queue-thumb-wrap`);
            if (thumbWrap) {
              thumbWrap.innerHTML = `
                <span class="igt-media-queue-badge">#${studioState.activeMediaIndex + 1}</span>
                <img class="igt-media-queue-thumb" src="${snapUrl}" />
              `;
            }
            hasCapturedThumb = true;
          }
        } catch (err) {
          console.warn('[Studio] Capture video thumbnail error:', err);
        }
      };

      video.addEventListener('loadeddata', captureVideoThumbnail);
      video.addEventListener('seeked', captureVideoThumbnail);
      video.addEventListener('timeupdate', captureVideoThumbnail);

      const onMeta = () => {
        if (studioState.mediaList[studioState.activeMediaIndex] !== item) return;

        item.naturalWidth = video.videoWidth || 1080;
        item.naturalHeight = video.videoHeight || 1920;
        item.videoDuration = video.duration || 60;

        if (item.trimEnd === undefined || item.trimEnd <= 0 || item.trimPreset === 'none') {
          item.trimStart = 0;
          item.trimEnd = item.videoDuration || 60;
          item.trimPreset = 'none';
        }

        studioState.naturalWidth = item.naturalWidth;
        studioState.naturalHeight = item.naturalHeight;
        studioState.videoDuration = item.videoDuration;
        studioState.trimStart = item.trimStart !== undefined ? item.trimStart : 0;
        studioState.trimEnd = (item.trimEnd !== undefined && item.trimEnd > 0) ? item.trimEnd : item.videoDuration;
        studioState.trimPreset = item.trimPreset || 'none';

        // Tự động đồng bộ đoạn clip đơn ôm trọn 100% thời lượng video thực tế
        if (!item.videoClips || item.videoClips.length === 0 || (item.videoClips.length === 1 && (item.trimPreset === 'none' || !item.trimPreset))) {
          item.videoClips = [{
            id: 'clip_' + Date.now(),
            start: studioState.trimStart,
            end: studioState.trimEnd,
            speed: 1
          }];
          item.selectedClipId = item.videoClips[0].id;
        }
        studioState.videoClips = JSON.parse(JSON.stringify(item.videoClips));
        studioState.selectedClipId = item.selectedClipId;

        applyFitMode();
        updateMediaTransform();
        renderTimeline();
        renderMediaListUI();

        renderTabContent(studioState.activeTab || 'main');

        try {
          if (video.currentTime === 0) video.currentTime = 0.05;
        } catch (e) { }
        captureVideoThumbnail();
      };

      video.addEventListener('loadedmetadata', onMeta);

      video.addEventListener('play', () => {
        studioState.isVideoPlaying = true;
        const playIcon = document.getElementById('igt-timeline-play-icon');
        if (playIcon) playIcon.innerText = '⏸';
      });

      video.addEventListener('pause', () => {
        studioState.isVideoPlaying = false;
        const playIcon = document.getElementById('igt-timeline-play-icon');
        if (playIcon) playIcon.innerText = '▶';
        if (studioState.audioElement) studioState.audioElement.pause();
      });

      video.addEventListener('timeupdate', () => {
        captureVideoThumbnail();

        const activeTrimStart = studioState.trimStart || 0;
        const activeTrimEnd = (studioState.trimEnd && studioState.trimEnd > activeTrimStart)
          ? studioState.trimEnd
          : (studioState.videoDuration || 60);

        const curTimelineT = (studioState.videoClips && studioState.videoClips.length > 0)
          ? getTimelineTimeFromVideoTime(currentPlayingClipIndex, video.currentTime)
          : video.currentTime;

        // Vòng lặp tức thì khi kim chạm mốc cuối của vùng thiết lập (15s, 30s, 60s, custom):
        // Kim chỉ chạy đến vùng đã thiết lập sẵn và quay trở lại ngay lập tức
        if (curTimelineT >= activeTrimEnd - 0.04) {
          if (studioState.videoClips && studioState.videoClips.length > 0) {
            const info = getClipAtTimelineTime(activeTrimStart);
            if (info) {
              currentPlayingClipIndex = info.index;
              studioState.selectedClipId = info.clip.id;
              ensureVideoClipLoaded(info.clip, info.videoTime, studioState.isVideoPlaying);
            } else {
              currentPlayingClipIndex = 0;
              video.currentTime = activeTrimStart;
            }
          } else {
            video.currentTime = activeTrimStart;
          }
          studioState.currentTime = activeTrimStart;

          if (studioState.audioElement && studioState.audioUrl) {
            const audioTime = (activeTrimStart - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
            studioState.audioElement.currentTime = Math.max(0, Math.min(studioState.audioDuration, audioTime));
            if (studioState.isVideoPlaying) studioState.audioElement.play().catch(() => { });
          }
          if (studioState.isVideoPlaying) video.play().catch(() => { });
          updateTimelineNeedle();
          checkAndApplyLiveTransition(studioState.currentTime);
          return;
        }

        // Nếu kim ở trước mốc trimStart thì đưa về mốc trimStart
        if (curTimelineT < activeTrimStart - 0.1) {
          if (studioState.videoClips && studioState.videoClips.length > 0) {
            const info = getClipAtTimelineTime(activeTrimStart);
            if (info) {
              currentPlayingClipIndex = info.index;
              studioState.selectedClipId = info.clip.id;
              ensureVideoClipLoaded(info.clip, info.videoTime, studioState.isVideoPlaying);
            } else {
              video.currentTime = activeTrimStart;
            }
          } else {
            video.currentTime = activeTrimStart;
          }
          studioState.currentTime = activeTrimStart;
          updateTimelineNeedle();
          checkAndApplyLiveTransition(studioState.currentTime);
          return;
        }

        if (studioState.videoClips && studioState.videoClips.length > 0) {
          const currentClip = studioState.videoClips[currentPlayingClipIndex] || studioState.videoClips[0];

          if (video.currentTime >= currentClip.end - 0.04) {
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
                if (studioState.isAudioLoop && studioState.audioElement && studioState.audioUrl) {
                  const firstAClip = (studioState.audioClips && studioState.audioClips.length > 0) ? studioState.audioClips[0] : null;
                  studioState.audioElement.currentTime = firstAClip ? firstAClip.start : (studioState.audioStart || 0);
                  studioState.audioElement.play().catch(() => { });
                }
                renderTimeline();
                if (studioState.activeTab === 'main') renderTabContent('main');
              } else {
                video.pause();
                studioState.isVideoPlaying = false;
                const playIcon = document.getElementById('igt-timeline-play-icon');
                if (playIcon) playIcon.innerText = '▶';
              }
            }
          }
          studioState.currentTime = getTimelineTimeFromVideoTime(currentPlayingClipIndex, video.currentTime);
        } else {
          if (studioState.trimEnd && video.currentTime >= studioState.trimEnd - 0.05) {
            if (studioState.isVideoLoop || studioState.isTimelineLoop) {
              video.currentTime = studioState.trimStart || 0;
              if (studioState.isAudioLoop && studioState.audioElement && studioState.audioUrl) {
                studioState.audioElement.currentTime = studioState.audioStart || 0;
                studioState.audioElement.play().catch(() => { });
              }
              video.play().catch(() => { });
            } else {
              video.pause();
              studioState.isVideoPlaying = false;
              const playIcon = document.getElementById('igt-timeline-play-icon');
              if (playIcon) playIcon.innerText = '▶';
            }
          }
          studioState.currentTime = video.currentTime;
        }

        updateTimelineNeedle();
        checkAndApplyLiveTransition(studioState.currentTime);

        if (studioState.audioElement && studioState.audioUrl && studioState.isVideoPlaying) {
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
        }

        if (studioState.isTimelineLoop && studioState.trimEnd > 0 && video.currentTime >= studioState.trimEnd) {
          video.currentTime = studioState.trimStart || 0;
          if (studioState.audioElement && studioState.audioUrl) {
            studioState.audioElement.currentTime = (studioState.trimStart - (studioState.audioOffset || 0)) + (studioState.audioStart || 0);
            studioState.audioElement.play().catch(() => {});
          }
          video.play().catch(() => {});
        }
      });

      container.appendChild(video);
    }
  }

  function loadMediaFile(file) {
    if (!file) return;
    addMediaFiles([file]);
  }

  // Xuất file Ultra HD đã căn chỉnh về máy tính
  async function exportAndDownloadUltraHD() {
    if (!studioState.mediaUrl) {
      alert('Vui lòng thêm ảnh hoặc video trước khi xuất file!');
      return;
    }

    const cfg = RATIO_CONFIGS[studioState.ratio] || RATIO_CONFIGS['9:16'];
    const canvas = document.createElement('canvas');
    canvas.width = cfg.targetW || 1080;
    canvas.height = cfg.targetH || 1920;
    const ctx = canvas.getContext('2d');

    if (studioState.mediaType === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = studioState.mediaUrl;
      await new Promise(r => { img.onload = r; });

      // 1. Vẽ nền mờ nghệ thuật nếu chọn blur_fit
      if (studioState.fitMode === 'blur_fit') {
        ctx.save();
        ctx.filter = 'blur(40px) brightness(0.65) saturate(1.4)';
        ctx.drawImage(img, -canvas.width * 0.1, -canvas.height * 0.1, canvas.width * 1.2, canvas.height * 1.2);
        ctx.restore();
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // 2. Vẽ hình ảnh với Pan & Zoom
      ctx.save();
      const scaleFactor = canvas.width / (cfg.frameW || 315);
      const drawZoom = studioState.zoom;
      const drawPanX = studioState.panX * scaleFactor;
      const drawPanY = studioState.panY * scaleFactor;

      // Căn giữa
      ctx.translate(canvas.width / 2 + drawPanX, canvas.height / 2 + drawPanY);
      ctx.scale(drawZoom, drawZoom);

      // Tính kích thước vẽ vừa khung
      let dw, dh;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = canvas.width / canvas.height;

      if (studioState.fitMode === 'cover') {
        if (imgAspect > canvasAspect) {
          dh = canvas.height;
          dw = dh * imgAspect;
        } else {
          dw = canvas.width;
          dh = dw / imgAspect;
        }
      } else {
        if (imgAspect > canvasAspect) {
          dw = canvas.width;
          dh = dw / imgAspect;
        } else {
          dh = canvas.height;
          dw = dh * imgAspect;
        }
      }

      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();

      // 3. Vẽ nhãn dán Stickers lên ảnh xuất bản
      drawStickersOnExportCanvas(ctx, canvas.width, canvas.height, cfg.frameW, cfg.frameH);

      // Xuất file tải về
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const prefix = studioState.mode === 'story' ? 'story' : (studioState.mode === 'reel' ? 'reel' : 'post');
        a.download = `instatweaks_${prefix}_ultra_hd_${Date.now()}.jpg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, 'image/jpeg', 0.95);
    } else {
      // Đối với video, tải trực tiếp file gốc chất lượng cao
      const a = document.createElement('a');
      a.href = studioState.mediaUrl;
      a.download = `instatweaks_video_ultra_hd_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

// Tải trước toàn bộ tài nguyên hình ảnh (Stickers, Avatars) để vẽ sắc nét không bị sót
  async function preloadAllStickerAssets() {
    const assetMap = new Map();
    const urls = [];
    (studioState.stickers || []).forEach(s => {
      if (s.type === 'image_sticker' && s.url) urls.push(s.url);
      if (s.type === 'mention' && s.avatarUrl) urls.push(s.avatarUrl);
    });

    await Promise.all(urls.map(u => {
      return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { assetMap.set(u, img); resolve(); };
        img.onerror = () => { resolve(); };
        img.src = u;
      });
    }));

    return assetMap;
  }

  // Vẽ hình ảnh / video frame lên Canvas chuẩn xác 100% như màn hình preview
  function renderMediaFrameToCanvas(ctx, mediaEl, canvasW, canvasH, cfg) {
    const scaleFactor = canvasW / (cfg.frameW || 315);
    const drawZoom = studioState.zoom || 1;
    const drawPanX = (studioState.panX || 0) * scaleFactor;
    const drawPanY = (studioState.panY || 0) * scaleFactor;

    const mediaW = mediaEl.videoWidth || mediaEl.naturalWidth || 1080;
    const mediaH = mediaEl.videoHeight || mediaEl.naturalHeight || 1920;
    const mediaAspect = mediaW / mediaH;
    const canvasAspect = canvasW / canvasH;

    // 1. Nền mờ nghệ thuật nếu chọn blur_fit
    if (studioState.fitMode === 'blur_fit') {
      ctx.save();
      ctx.filter = 'blur(45px) brightness(0.65) saturate(1.4)';
      ctx.drawImage(mediaEl, -canvasW * 0.1, -canvasH * 0.1, canvasW * 1.2, canvasH * 1.2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }

    // 2. Vẽ Video / Ảnh chính với Pan & Zoom
    ctx.save();
    ctx.translate(canvasW / 2 + drawPanX, canvasH / 2 + drawPanY);
    ctx.scale(drawZoom, drawZoom);

    let dw, dh;
    if (studioState.fitMode === 'cover') {
      if (mediaAspect > canvasAspect) {
        dh = canvasH;
        dw = dh * mediaAspect;
      } else {
        dw = canvasW;
        dh = dw / mediaAspect;
      }
    } else {
      // fit (contain)
      if (mediaAspect > canvasAspect) {
        dw = canvasW;
        dh = dw / mediaAspect;
      } else {
        dh = canvasH;
        dw = dh * mediaAspect;
      }
    }

    ctx.drawImage(mediaEl, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  // Tự động xác định đối tượng cần xuất/đăng dưới dạng VIDEO:
  // - Khi là video gốc
  // - Hoặc khi là ảnh nhưng có gắn nhạc nền, có hiệu ứng động sticker/FX, hoặc có giới hạn thời gian hiển thị Story
  function shouldExportAsVideo() {
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
  }

    // [IGT_POST_AND_STORY_EXPORT_ENGINE_V4]
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
            const slideName = `post_slide_${i + 1}_video.mp4`;
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
            const slideName = `post_slide_${i + 1}_image.jpg`;
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

      const zipName = `instatweaks_post_album_ultra_hd_${Date.now()}.zip`;
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
      progressOverlay.innerHTML = `
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
      `;
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
        const chunkSuffix = chunkInfo ? `_part${chunkInfo.chunkIndex + 1}` : '';
        const fileName = `instatweaks_video_${prefix}_ultra_hd_${Date.now()}${chunkSuffix}.${ext}`;

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

          if (barFill) barFill.style.setProperty('width', `${progress}%`, 'important');
          if (pctLabel) pctLabel.innerText = `${Math.round(progress)}%`;

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

        if (barFill) barFill.style.width = `${progress}%`;
        if (pctLabel) pctLabel.innerText = `${Math.round(progress)}%`;

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
        const fileName = `instatweaks_${prefix}_ultra_hd_${Date.now()}.jpg`;

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
  }

  function drawRoundedRect(ctx, x, y, width, height, radius = 0) {
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
  }

  function drawStickersOnExportCanvas(ctx, canvasWidth, canvasHeight, frameW, frameH, currentTime = 0, preloadedImages = null) {
    if (!studioState.stickers || studioState.stickers.length === 0) return;

    const scale = canvasWidth / (frameW || 315);

    studioState.stickers.forEach(s => {
      const px = (s.x / 100) * canvasWidth;
      const py = (s.y / 100) * canvasHeight;

      ctx.save();
      ctx.translate(px, py);

      // Hiệu ứng chuyển động (Animation Effects)
      let animScale = 1;
      let animTranslateY = 0;
      let animRotate = 0;

      if (s.anim === 'pulse') {
        const phase = Math.sin(currentTime * Math.PI * 2 / 1.2);
        animScale = 1 + phase * 0.14;
      } else if (s.anim === 'bounce') {
        const phase = Math.abs(Math.sin(currentTime * Math.PI / 0.85));
        animTranslateY = -phase * 12 * scale;
      } else if (s.anim === 'wiggle') {
        const phase = Math.sin(currentTime * Math.PI * 2 / 0.7);
        animRotate = phase * 0.17;
      } else if (s.anim === 'float') {
        const phase = Math.sin(currentTime * Math.PI * 2 / 2.0);
        animTranslateY = phase * 8 * scale;
      } else if (s.anim === 'spin') {
        animRotate = (currentTime / 4.0) * Math.PI * 2;
      }

      ctx.translate(0, animTranslateY);
      if (animRotate !== 0) ctx.rotate(animRotate);

      const stickerScale = (s.scale || 1) * animScale;
      ctx.scale(stickerScale, stickerScale);

      if (s.type === 'link') {
        const text = s.text || 'XEM LIÊN KẾT';
        const fontSize = Math.round(13 * scale);
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textMetrics = ctx.measureText(text);
        const textWidth = textMetrics.width;
        const iconWidth = Math.round(14 * scale);
        const gap = Math.round(8 * scale);
        const padX = Math.round(16 * scale);
        const padY = Math.round(8 * scale);
        const pillW = textWidth + iconWidth + gap + padX * 2;
        const pillH = fontSize + padY * 2;
        const radius = pillH / 2;

        // Đổ bóng (Shadow)
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);

        // Nền nhãn dán
        if (s.style === 'blue') {
          ctx.fillStyle = '#0095f6';
        } else if (s.style === 'dark') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        } else if (s.style === 'gradient') {
          const grad = ctx.createLinearGradient(-pillW / 2, 0, pillW / 2, 0);
          grad.addColorStop(0, '#f09433');
          grad.addColorStop(0.5, '#dc2743');
          grad.addColorStop(1, '#bc1888');
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = '#ffffff';
        }

        drawRoundedRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
        ctx.fill();

        // Tắt bóng để vẽ chữ & icon sắc nét
        ctx.shadowColor = 'transparent';

        // Màu chữ & icon
        ctx.fillStyle = (s.style === 'default') ? '#1e293b' : '#ffffff';
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(2, Math.round(2 * scale));

        // Vẽ biểu tượng link (Chain icon)
        const iconX = -pillW / 2 + padX + iconWidth / 2;
        const iconY = 0;
        ctx.beginPath();
        ctx.arc(iconX - 3 * scale, iconY, 4 * scale, Math.PI / 4, (5 * Math.PI) / 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(iconX + 3 * scale, iconY, 4 * scale, (5 * Math.PI) / 4, Math.PI / 4);
        ctx.stroke();

        // Vẽ văn bản
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, -pillW / 2 + padX + iconWidth + gap, 1 * scale);

      } else if (s.type === 'text') {
        const fontSize = Math.round((s.fontSize || 20) * scale);
        let fontName = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        if (s.fontFamily === 'serif') fontName = 'Georgia, "Times New Roman", serif';
        else if (s.fontFamily === 'monospace') fontName = '"Courier New", Courier, monospace';
        else if (s.fontFamily === 'cursive') fontName = '"Brush Script MT", "Caveat", "Dancing Script", cursive';
        else if (s.fontFamily === 'impact') fontName = 'Impact, "Arial Black", sans-serif';

        ctx.font = `bold ${fontSize}px ${fontName}`;
        const lines = (s.text || '').split('\n');
        const lineHeight = fontSize * 1.35;
        const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
        const totalH = lines.length * lineHeight;
        const padX = Math.round(14 * scale);
        const padY = Math.round(8 * scale);

        if (s.isBox) {
          ctx.fillStyle = (s.color === '#ffffff') ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';
          drawRoundedRect(ctx, -maxLineWidth / 2 - padX, -totalH / 2 - padY, maxLineWidth + padX * 2, totalH + padY * 2, Math.round(8 * scale));
          ctx.fill();
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = Math.round(6 * scale);
          ctx.shadowOffsetY = Math.round(2 * scale);
        }

        ctx.fillStyle = s.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let startLineY = -totalH / 2 + lineHeight / 2;
        lines.forEach((line) => {
          ctx.fillText(line, 0, startLineY);
          startLineY += lineHeight;
        });

      } else if (s.type === 'emoji') {
        const fontSize = Math.round(44 * scale);
        ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.emoji || '🔥', 0, 0);

      } else if (s.type === 'badge') {
        const text = s.text || 'NEW POST';
        const fontSize = Math.round(13 * scale);
        ctx.font = `800 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textMetrics = ctx.measureText(text);
        const padX = Math.round(16 * scale);
        const padY = Math.round(8 * scale);
        const pillW = textMetrics.width + padX * 2;
        const pillH = fontSize + padY * 2;
        const radius = pillH / 2;

        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(8 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);

        if (s.badgeStyle === 'neon') {
          ctx.fillStyle = '#06b6d4';
        } else if (s.badgeStyle === 'gold') {
          ctx.fillStyle = '#eab308';
        } else if (s.badgeStyle === 'dark') {
          ctx.fillStyle = '#0f172a';
        } else {
          // gradient
          const grad = ctx.createLinearGradient(-pillW / 2, 0, pillW / 2, 0);
          grad.addColorStop(0, '#f09433');
          grad.addColorStop(0.5, '#dc2743');
          grad.addColorStop(1, '#bc1888');
          ctx.fillStyle = grad;
        }

        drawRoundedRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = (s.badgeStyle === 'gold') ? '#000000' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 1 * scale);

      } else if (s.type === 'image_sticker' && s.url) {
        let img = preloadedImages ? preloadedImages.get(s.url) : null;
        if (!img) {
          img = new Image();
          img.src = s.url;
        }
        const imgSize = Math.round(76 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(8 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);
        try {
          ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
        } catch (_) {}
        ctx.shadowColor = 'transparent';

      } else if (s.type === 'mention') {
        const text = '@' + (s.username || 'user');
        const fontSize = Math.round(13 * scale);
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textMetrics = ctx.measureText(text);
        const hasAvatar = !!s.avatarUrl;
        const avatarSize = hasAvatar ? Math.round(18 * scale) : 0;
        const gap = hasAvatar ? Math.round(6 * scale) : 0;
        const padX = Math.round(14 * scale);
        const pillW = textMetrics.width + avatarSize + gap + padX * 2;
        const pillH = fontSize + Math.round(14 * scale);
        const radius = pillH / 2;

        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = Math.round(8 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        drawRoundedRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        let textStartX = -pillW / 2 + padX;
        if (hasAvatar) {
          try {
            let avImg = preloadedImages ? preloadedImages.get(s.avatarUrl) : null;
            if (!avImg) {
              avImg = new Image();
              avImg.src = s.avatarUrl;
            }
            ctx.save();
            ctx.beginPath();
            ctx.arc(textStartX + avatarSize / 2, 0, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avImg, textStartX, -avatarSize / 2, avatarSize, avatarSize);
            ctx.restore();
            textStartX += avatarSize + gap;
          } catch (_) {}
        }

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, textStartX, 1 * scale);

      } else if (s.type === 'location') {
        const text = s.name || 'Địa điểm';
        const fontSize = Math.round(13 * scale);
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const textMetrics = ctx.measureText(text);
        const iconPad = Math.round(16 * scale);
        const pillW = textMetrics.width + Math.round(32 * scale) + iconPad;
        const pillH = fontSize + Math.round(14 * scale);
        const radius = pillH / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = Math.round(8 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        drawRoundedRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, radius);
        ctx.fill();
        ctx.restore();

        // Icon vị trí màu đỏ hồng
        ctx.fillStyle = '#e1306c';
        ctx.beginPath();
        ctx.arc(-pillW / 2 + Math.round(16 * scale), 0, Math.round(4.5 * scale), 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, -pillW / 2 + Math.round(26 * scale), 1 * scale);

      } else if (s.type === 'poll') {
        const cardW = Math.round(200 * scale);
        const cardH = Math.round(86 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Question
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(13 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.question || 'Bình chọn ngay?', 0, -cardH / 2 + Math.round(22 * scale));

        // Option boxes
        const optW = Math.round(84 * scale);
        const optH = Math.round(32 * scale);
        const optY = Math.round(12 * scale);

        // Opt A
        ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
        drawRoundedRect(ctx, -cardW / 2 + Math.round(12 * scale), optY, optW, optH, Math.round(8 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#0284c7';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.optA || 'CÓ 👍', -cardW / 2 + Math.round(12 * scale) + optW / 2, optY + optH / 2);

        // Opt B
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
        drawRoundedRect(ctx, cardW / 2 - Math.round(12 * scale) - optW, optY, optW, optH, Math.round(8 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.fillText(s.optB || 'KHÔNG 👎', cardW / 2 - Math.round(12 * scale) - optW / 2, optY + optH / 2);

      } else if (s.type === 'question') {
        const cardW = Math.round(210 * scale);
        const cardH = Math.round(82 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Header
        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(12.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.header || 'Hỏi tôi một điều gì đó...', 0, -cardH / 2 + Math.round(22 * scale));

        // Body input box mockup
        const bW = Math.round(186 * scale);
        const bH = Math.round(30 * scale);
        ctx.fillStyle = '#f1f5f9';
        drawRoundedRect(ctx, -bW / 2, Math.round(8 * scale), bW, bH, Math.round(8 * scale));
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(10.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText('Nhập câu trả lời...', 0, Math.round(8 * scale) + bH / 2);

      } else if (s.type === 'countdown') {
        const cardW = Math.round(200 * scale);
        const cardH = Math.round(92 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = Math.round(12 * scale);
        ctx.shadowOffsetY = Math.round(5 * scale);
        const grad = ctx.createLinearGradient(-cardW / 2, -cardH / 2, cardW / 2, cardH / 2);
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(1, '#312e81');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.title || 'Sự kiện sắp diễn ra 🎉', 0, -cardH / 2 + Math.round(20 * scale));

        // Units
        const uW = Math.round(44 * scale);
        const uH = Math.round(38 * scale);
        const uY = Math.round(6 * scale);
        const vals = [s.days || '05', s.hours || '12', s.mins || '30'];
        const labels = ['NGÀY', 'GIỜ', 'PHÚT'];

        [-Math.round(56 * scale), 0, Math.round(56 * scale)].forEach((uX, idx) => {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          drawRoundedRect(ctx, uX - uW / 2, uY, uW, uH, Math.round(6 * scale));
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.round(14 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillText(vals[idx], uX, uY + Math.round(14 * scale));

          ctx.fillStyle = '#94a3b8';
          ctx.font = `600 ${Math.round(7.5 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.fillText(labels[idx], uX, uY + Math.round(28 * scale));
        });

      } else if (s.type === 'music_player') {
        const cardW = Math.round(210 * scale);
        const cardH = Math.round(48 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(3 * scale);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(24 * scale));
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowColor = 'transparent';

        ctx.font = `${Math.round(16 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎵', -cardW / 2 + Math.round(20 * scale), 0);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.song || 'Trending Sound 🔥', -cardW / 2 + Math.round(38 * scale), -Math.round(6 * scale));

        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.round(9 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.artist || 'Instagram Audio', -cardW / 2 + Math.round(38 * scale), Math.round(8 * scale));

        ctx.font = `${Math.round(16 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('💿', cardW / 2 - Math.round(20 * scale), 0);

      } else if (s.type === 'emoji_slider') {
        const cardW = Math.round(190 * scale);
        const cardH = Math.round(68 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(12 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.question || 'Mức độ thích?', 0, -cardH / 2 + Math.round(18 * scale));

        // Track
        const trkW = Math.round(150 * scale);
        const trkH = Math.round(8 * scale);
        const grad = ctx.createLinearGradient(-trkW / 2, 0, trkW / 2, 0);
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(1, '#ec4899');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, -trkW / 2, Math.round(12 * scale), trkW, trkH, Math.round(4 * scale));
        ctx.fill();

        ctx.font = `${Math.round(20 * scale)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.fillText(s.emoji || '😍', 0, Math.round(15 * scale));

      } else if (s.type === 'add_yours') {
        const cardW = Math.round(195 * scale);
        const cardH = Math.round(62 * scale);
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = Math.round(10 * scale);
        ctx.shadowOffsetY = Math.round(4 * scale);
        ctx.fillStyle = '#ffffff';
        drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, Math.round(14 * scale));
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0284c7';
        ctx.font = `bold ${Math.round(10 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷 LƯỢT TIẾP THEO', 0, -cardH / 2 + Math.round(16 * scale));

        ctx.fillStyle = '#0f172a';
        ctx.font = `bold ${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillText(s.prompt || 'Chia sẻ ảnh đẹp của bạn', 0, Math.round(10 * scale));
      }

      ctx.restore();
    });
  }


  function getInstagramCsrfToken() {
    if (typeof window !== 'undefined' && window.__IGT_MOCK_CSRF_TOKEN__) {
      return window.__IGT_MOCK_CSRF_TOKEN__;
    }
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  function getInstagramUserId() {
    const match = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/);
    return match ? match[1] : '';
  }

  async function getInstagramDtsgToken() {
    try {
      if (typeof document !== 'undefined') {
        const domMatch = document.documentElement.innerHTML.match(/"DTSGInitialData",\s*\[\],\s*\{"token":"([^"]*)"/);
        if (domMatch && domMatch[1]) return domMatch[1];

        const inputDtsg = document.querySelector('input[name="fb_dtsg"]');
        if (inputDtsg && inputDtsg.value) return inputDtsg.value;
      }

      const res = await fetch('https://www.instagram.com/');
      const html = await res.text();
      const match = html.match(/"DTSGInitialData",\s*\[\],\s*\{"token":"([^"]*)"/);
      if (match && match[1]) return match[1];
    } catch (err) {
      console.warn('[InstaTweaks Direct API] Không thể lấy DTSG token:', err);
    }
    return '';
  }

  function computeJazoest(token) {
    if (!token) return '2';
    let t = 0;
    for (let n = 0; n < token.length; n++) t += token.charCodeAt(n);
    return `2${t}`;
  }

  async function publishMediaViaInstagramAPI(blob, options = {}) {
    const {
      mode = 'story',       // 'story' | 'post' | 'reel'
      caption = '',         // Chú thích bài viết
      isVideo = false,      // true nếu là MP4, false nếu là JPEG
      isAlbum = false,      // true nếu là Album Carousel
      slideFiles = null,    // Mảng File[] cho Album bài viết
      musicAssetId = null,  // ID bài hát Instagram nếu có
      musicStart = 0,       // Thời điểm bắt đầu của bài hát (giây)
      onProgress = null     // Callback thông báo tiến trình (statusText)
    } = options;

    const csrfToken = getInstagramCsrfToken();
    if (!csrfToken) {
      console.warn('[InstaTweaks Direct API] Không tìm thấy csrftoken trong cookie.');
      return { success: false, reason: 'no_csrftoken_found' };
    }

    const uploadId = String(Date.now());
    const uploadName = `fb_uploader_${uploadId}`;
    const commonHeaders = {
      'Accept': '*/*',
      'X-CSRFToken': csrfToken,
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-Instagram-AJAX': '1000000000',
      'X-Requested-With': 'XMLHttpRequest'
    };

    // =====================================================================
    // --- 0. XỬ LÝ ALBUM BÀI VIẾT NHIỀU SLIDE (CAROUSEL / SIDECAR) ---
    // =====================================================================
    const filesToUpload = (slideFiles && slideFiles.length > 0)
      ? slideFiles
      : ((!blob && options.mediaList && options.mediaList.length > 0) ? options.mediaList.map(it => it.file).filter(Boolean) : null);

    if (isAlbum || (filesToUpload && filesToUpload.length > 1)) {
      const targetFiles = filesToUpload || [];
      if (targetFiles.length > 0) {
        if (onProgress) onProgress(`Đang tải ${targetFiles.length} slide bài viết lên Instagram...`);
        const childrenMetadata = [];
        const baseChildUploadId = Date.now();

        for (let i = 0; i < targetFiles.length; i++) {
          const itemFile = targetFiles[i];
          const childUploadId = String(baseChildUploadId + (i * 17) + 1);
          const childName = `fb_uploader_${childUploadId}`;
          const isChildVideo = itemFile.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(itemFile.name);

          if (onProgress) onProgress(`Đang tải slide ${i + 1}/${targetFiles.length} (${isChildVideo ? 'video' : 'ảnh'})...`);

          if (isChildVideo) {
            const ruploadParams = JSON.stringify({
              'client-passthrough': '1',
              'is_sidecar': '1',
              'media_type': 2,
              'upload_id': childUploadId,
              'for_album': true
            });
            const videoHeaders = {
              ...commonHeaders,
              'Content-Type': 'application/octet-stream',
              'X-Instagram-Rupload-Params': ruploadParams,
              'X-Entity-Name': childName,
              'X-Entity-Length': itemFile.size.toString(),
              'Offset': '0'
            };
            let upRes;
            try {
              upRes = await fetch(`https://i.instagram.com/rupload_igvideo/${childName}`, {
                method: 'POST',
                headers: videoHeaders,
                body: itemFile
              });
            } catch (_) {}
            if (!upRes || !upRes.ok) {
              try {
                upRes = await fetch(`https://www.instagram.com/rupload_igvideo/${childName}`, {
                  method: 'POST',
                  headers: videoHeaders,
                  body: itemFile
                });
              } catch (_) {}
            }
          } else {
            const ruploadParams = JSON.stringify({
              upload_id: childUploadId,
              media_type: 1,
              for_album: true
            });
            const photoHeaders = {
              ...commonHeaders,
              'Content-Type': 'image/jpeg',
              'X-Instagram-Rupload-Params': ruploadParams,
              'X-Entity-Name': childName,
              'X-Entity-Length': itemFile.size.toString(),
              'Offset': '0'
            };
            let upRes;
            try {
              upRes = await fetch(`https://i.instagram.com/rupload_igphoto/${childName}`, {
                method: 'POST',
                headers: photoHeaders,
                body: itemFile
              });
            } catch (_) {}
            if (!upRes || !upRes.ok) {
              try {
                upRes = await fetch(`https://www.instagram.com/rupload_igphoto/${childName}`, {
                  method: 'POST',
                  headers: photoHeaders,
                  body: itemFile
                });
              } catch (_) {}
            }
          }
          childrenMetadata.push({ upload_id: childUploadId, source_type: '4' });
        }

        if (onProgress) onProgress('Đang cấu hình xuất bản Album Carousel (configure_sidecar)...');
        const dtsgToken = await getInstagramDtsgToken();
        const sidecarBody = new URLSearchParams();
        sidecarBody.append('client_sidecar_id', String(baseChildUploadId));
        sidecarBody.append('client_shared_at', (Math.floor(Date.now() / 1000) - 1).toString());
        sidecarBody.append('caption', caption || '');
        sidecarBody.append('children_metadata', JSON.stringify(childrenMetadata));
        if (musicAssetId) {
          sidecarBody.append('music_metadata', JSON.stringify({
            audio_type: 'licensed_music',
            audio_asset_id: String(musicAssetId),
            audio_cluster_id: String(musicAssetId),
            audio_asset_start_time_in_ms: Math.round((musicStart || 0) * 1000),
            derived_content_start_time_in_ms: 0,
            overlap_duration_in_ms: 15000
          }));
        }
        if (dtsgToken) {
          sidecarBody.append('fb_dtsg', dtsgToken);
          sidecarBody.append('jazoest', computeJazoest(dtsgToken));
        }

        let configRes;
        try {
          configRes = await fetch('https://www.instagram.com/api/v1/media/configure_sidecar/', {
            method: 'POST',
            headers: {
              ...commonHeaders,
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: sidecarBody.toString()
          });
        } catch (_) {}

        const configText = configRes ? await configRes.text().catch(() => '') : '';
        let configJson = {};
        try { configJson = JSON.parse(configText); } catch (_) {}

        if (configRes && configRes.ok && (configJson.status === 'ok' || configJson.media)) {
          return { success: true, isCarousel: true, mode: 'post', media: configJson.media };
        } else {
          console.warn('[InstaTweaks Direct API] configure_sidecar response:', configText);
          return { success: false, isCarousel: true, reason: configJson.message || 'configure_sidecar_failed', details: configText };
        }
      }
    }

    try {
      if (!isVideo) {
        // =====================================================================
        // --- 1. TẢI ẢNH LÊN MÁY CHỦ RUPLOAD (PHOTO / STORY IMAGE) ---
        // =====================================================================
        if (onProgress) onProgress('Đang tải ảnh lên máy chủ Instagram (rupload)...');

        const ruploadParams = JSON.stringify({
          upload_id: uploadId,
          media_type: 1
        });

        const photoHeaders = {
          ...commonHeaders,
          'Content-Type': 'image/jpeg',
          'X-Instagram-Rupload-Params': ruploadParams,
          'X-Entity-Name': uploadName,
          'X-Entity-Length': blob.size.toString(),
          'Offset': '0'
        };

        let uploadRes;
        try {
          uploadRes = await fetch(`https://www.instagram.com/rupload_igphoto/${uploadName}`, {
            method: 'POST',
            headers: photoHeaders,
            body: blob
          });
        } catch (_) {}

        if (!uploadRes || !uploadRes.ok) {
          try {
            uploadRes = await fetch(`https://i.instagram.com/rupload_igphoto/${uploadName}`, {
              method: 'POST',
              headers: photoHeaders,
              body: blob
            });
          } catch (_) {}
        }

        if (!uploadRes || !uploadRes.ok) {
          const status = uploadRes ? uploadRes.status : 'network_error';
          console.warn('[InstaTweaks Direct API] rupload_igphoto failed with HTTP', status);
          const errText = uploadRes ? await uploadRes.text().catch(() => '') : '';
          return { success: false, reason: `rupload_photo_failed_${status}`, details: errText };
        }

        const uploadJson = await uploadRes.json().catch(() => ({}));
        console.log('[InstaTweaks Direct API] rupload_igphoto success:', uploadJson);

        // --- 2. CẤU HÌNH & XUẤT BẢN ẢNH (CONFIGURE) ---
        if (mode === 'story') {
          if (onProgress) onProgress('Đang xuất bản lên Tin (Story)...');
          const dtsgToken = await getInstagramDtsgToken();
          const nowSec = Math.floor(Date.now() / 1000);
          const storyParams = {
            upload_id: uploadId,
            source_type: '4',
            configure_mode: '1',
            client_shared_at: (nowSec - 1).toString(),
            client_timestamp: (nowSec - 2).toString(),
            story_media_creation_date: (nowSec - 15).toString(),
            device_timestamp: Date.now().toString()
          };
          if (dtsgToken) {
            storyParams.fb_dtsg = dtsgToken;
            storyParams.jazoest = computeJazoest(dtsgToken);
          }
          const configBody = new URLSearchParams(storyParams);

          const configRes = await fetch('https://www.instagram.com/api/v1/media/configure_to_story/', {
            method: 'POST',
            headers: {
              ...commonHeaders,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: configBody.toString()
          });

          const configJson = await configRes.json().catch(() => ({}));
          console.log('[InstaTweaks Direct API] configure_to_story response:', configJson);

          if (configRes.ok && (configJson.status === 'ok' || configJson.media)) {
            return { success: true, mode: 'story', media: configJson.media };
          } else {
            return { success: false, reason: configJson.message || 'configure_story_failed', details: configJson };
          }
        } else {
          // Mode: 'post' (Feed Post)
          if (onProgress) onProgress('Đang xuất bản lên Bài viết (Feed)...');
          const dtsgToken = await getInstagramDtsgToken();
          const postParams = {
            upload_id: uploadId,
            source_type: '4',
            caption: caption || ''
          };
          if (musicAssetId) {
            postParams.music_metadata = JSON.stringify({
              audio_type: 'licensed_music',
              audio_asset_id: String(musicAssetId),
              audio_cluster_id: String(musicAssetId),
              audio_asset_start_time_in_ms: Math.round((musicStart || 0) * 1000),
              derived_content_start_time_in_ms: 0,
              overlap_duration_in_ms: 15000
            });
          }
          if (dtsgToken) {
            postParams.fb_dtsg = dtsgToken;
            postParams.jazoest = computeJazoest(dtsgToken);
          }
          const configBody = new URLSearchParams(postParams);

          const configRes = await fetch('https://www.instagram.com/api/v1/media/configure/', {
            method: 'POST',
            headers: {
              ...commonHeaders,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: configBody.toString()
          });

          const configJson = await configRes.json().catch(() => ({}));
          console.log('[InstaTweaks Direct API] configure post response:', configJson);

          if (configRes.ok && (configJson.status === 'ok' || configJson.media)) {
            return { success: true, mode: 'post', media: configJson.media };
          } else {
            return { success: false, reason: configJson.message || 'configure_post_failed', details: configJson };
          }
        }
      } else {
        // =====================================================================
        // --- 3. TẢI VIDEO LÊN MÁY CHỦ RUPLOAD (VIDEO / REEL / STORY VIDEO) ---
        // =====================================================================
        if (onProgress) onProgress('Đang tải video lên máy chủ Instagram (rupload)...');

        const vDurMs = Math.round((options.duration || 15) * 1000).toString();
        const vW = (options.width || 1080).toString();
        const vH = (options.height || 1920).toString();

        const ruploadParams = JSON.stringify({
          'client-passthrough': '1',
          'is_sidecar': '0',
          'media_type': 2,
          'upload_id': uploadId,
          'upload_media_duration_ms': vDurMs,
          'upload_media_width': parseInt(vW, 10),
          'upload_media_height': parseInt(vH, 10),
          ...(mode === 'post' ? { for_album: false, is_igtv_video: true } : {}),
          ...(mode === 'reel' ? { for_album: false, is_clips_video: '1' } : {}),
          ...(mode === 'story' ? { for_direct_story: '0' } : {})
        });

        const videoHeaders = {
          ...commonHeaders,
          'Content-Type': 'application/octet-stream',
          'X-Instagram-Rupload-Params': ruploadParams,
          'X-Entity-Name': uploadName,
          'X-Entity-Length': blob.size.toString(),
          'Offset': '0'
        };

        let uploadRes;
        try {
          uploadRes = await fetch(`https://www.instagram.com/rupload_igvideo/${uploadName}`, {
            method: 'POST',
            headers: videoHeaders,
            body: blob
          });
        } catch (_) {}

        if (!uploadRes || !uploadRes.ok) {
          try {
            uploadRes = await fetch(`https://i.instagram.com/rupload_igvideo/${uploadName}`, {
              method: 'POST',
              headers: videoHeaders,
              body: blob
            });
          } catch (_) {}
        }

        if (!uploadRes || !uploadRes.ok) {
          const status = uploadRes ? uploadRes.status : 'network_error';
          console.warn('[InstaTweaks Direct API] rupload_igvideo failed with HTTP', status);
          const errText = uploadRes ? await uploadRes.text().catch(() => '') : '';
          return { success: false, reason: `rupload_video_failed_${status}`, details: errText };
        }

        const uploadJson = await uploadRes.json().catch(() => ({}));
        console.log('[InstaTweaks Direct API] rupload_igvideo success:', uploadJson);

        // --- 3B. TẢI ẢNH BÌA COVER CHO VIDEO (CHUẨN INSSIST: rupload_igphoto/${uploadName} với media_type: 2) ---
        if (options.coverBlob) {
          try {
            if (onProgress) onProgress('Đang nạp ảnh bìa (Cover)...');
            const coverRuploadParams = JSON.stringify({
              upload_id: uploadId,
              media_type: 2, // 2 cho Video Cover
              upload_media_width: parseInt(vW, 10),
              upload_media_height: parseInt(vH, 10)
            });

            const coverHeaders = {
              ...commonHeaders,
              'Content-Type': 'image/jpeg',
              'X-Instagram-Rupload-Params': coverRuploadParams,
              'X-Entity-Name': uploadName,
              'X-Entity-Length': options.coverBlob.size.toString(),
              'Offset': '0'
            };

            let coverRes;
            try {
              coverRes = await fetch(`https://i.instagram.com/rupload_igphoto/${uploadName}`, {
                method: 'POST',
                headers: coverHeaders,
                body: options.coverBlob
              });
            } catch (_) {}

            if (!coverRes || !coverRes.ok) {
              await fetch(`https://www.instagram.com/rupload_igphoto/${uploadName}`, {
                method: 'POST',
                headers: coverHeaders,
                body: options.coverBlob
              });
            }
          } catch (coverErr) {
            console.warn('[InstaTweaks Direct API] Cover upload optional skip:', coverErr);
          }
        }

        // Lấy dtsgToken cho cấu hình bảo mật của Meta
        const dtsgToken = await getInstagramDtsgToken();

        // --- 4. CẤU HÌNH & XUẤT BẢN REEL / STORY VIDEO / FEED VIDEO (CHUẨN INSSIST) ---
        if (mode === 'reel') {
          const maxReelAttempts = 12;
          let lastReelError = '';

          const signedObj = {
            caption: caption || '',
            source_type: 'library',
            disable_comments: 0,
            like_and_view_counts_disabled: 0,
            disable_oa_reuse: false,
            video_subtitles_enabled: 0,
            clips_share_preview_to_feed: 1,
            upload_id: uploadId
          };
          if (dtsgToken) signedObj.fb_dtsg = dtsgToken;

          const postParams = {
            __a: '1',
            signed_body: `SIGNATURE.${JSON.stringify(signedObj)}`
          };
          if (dtsgToken) {
            postParams.fb_dtsg = dtsgToken;
            postParams.jazoest = computeJazoest(dtsgToken);
          }

          const configBody = new URLSearchParams(postParams);

          for (let attempt = 1; attempt <= maxReelAttempts; attempt++) {
            if (onProgress) {
              onProgress(`Đang xử lý & xuất bản Thước phim (Reels) [${attempt}/${maxReelAttempts}]...`);
            }

            // Chờ trước khi gửi cấu hình để máy chủ Instagram hoàn tất chuyển mã
            await new Promise(r => setTimeout(r, attempt === 1 ? 2500 : 3000));

            // 1. Thử gọi configure_to_clips chuẩn INSSIST (signed_body + dtsg)
            let configRes = await fetch('https://www.instagram.com/api/v1/media/configure_to_clips/', {
              method: 'POST',
              headers: {
                ...commonHeaders,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: configBody.toString()
            });

            const resText = await configRes.text().catch(() => '');
            let configJson = {};
            try { configJson = JSON.parse(resText); } catch (_) {}
            console.log(`[InstaTweaks Direct API] configure reel attempt ${attempt}:`, configJson);

            // 1. Kiểm tra trạng thái máy chủ đang transcode (PENDING / 202) -> phải đợi tiếp, không được return sớm
            const isTranscoding = resText.includes('Transcode not finished') ||
              resText.includes('"statusCode":202') ||
              resText.includes('"status":"PENDING"') ||
              resText.includes('PENDING') ||
              resText.toLowerCase().includes('processing') ||
              resText.toLowerCase().includes('not ready') ||
              configRes.status === 202;

            if (isTranscoding && attempt < maxReelAttempts) {
              continue;
            }

            // 2. Chỉ coi là thành công khi thực sự có media id hoặc status === 'ok' và không có message báo lỗi
            const isSuccess = configRes.ok && (
              configJson.status === 'ok' ||
              resText.includes('"status":"COMPLETED"') ||
              Boolean(configJson.media && (configJson.media.id || configJson.media.pk))
            ) && !configJson.message;

            if (isSuccess) {
              return { success: true, mode: 'reel', media: configJson.media || {} };
            }

            lastReelError = configJson.message || configJson.error_title || resText;

            // 2. Thử fallback endpoint configure chuẩn Web
            if (attempt === 3 || attempt === maxReelAttempts) {
              const fbBody = new URLSearchParams({
                upload_id: uploadId,
                source_type: '4',
                caption: caption || '',
                poster_frame_index: '0',
                clips_share_preview_to_feed: '1',
                device_timestamp: Date.now().toString()
              });
              const fbRes = await fetch('https://www.instagram.com/api/v1/media/configure/', {
                method: 'POST',
                headers: {
                  ...commonHeaders,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: fbBody.toString()
              });
              const fbJson = await fbRes.json().catch(() => ({}));
              console.log('[InstaTweaks Direct API] fallback configure reel:', fbJson);
              if (fbRes.ok && (fbJson.status === 'ok' || fbJson.media)) {
                return { success: true, mode: 'reel', media: fbJson.media };
              }
            }
          }

          return { success: false, reason: lastReelError || 'configure_reel_timeout' };
        } else if (mode === 'story') {
          const maxStoryAttempts = 12;
          let lastStoryError = '';

          for (let attempt = 1; attempt <= maxStoryAttempts; attempt++) {
            if (onProgress) onProgress(`Đang xử lý & xuất bản video lên Story (${attempt}/${maxStoryAttempts})...`);
            await new Promise(r => setTimeout(r, attempt === 1 ? 2500 : 2500));

            const nowSec = Math.floor(Date.now() / 1000);
            const storyParams = {
              upload_id: uploadId,
              source_type: '4',
              video_result: '',
              poster_frame_index: '0',
              configure_mode: '1',
              client_shared_at: (nowSec - 1).toString(),
              client_timestamp: (nowSec - 2).toString(),
              story_media_creation_date: (nowSec - 15).toString(),
              device_timestamp: Date.now().toString()
            };
            if (dtsgToken) {
              storyParams.fb_dtsg = dtsgToken;
              storyParams.jazoest = computeJazoest(dtsgToken);
            }
            const configBody = new URLSearchParams(storyParams);

            // 1. Thử endpoint chuẩn video story (?video=1)
            let configRes = await fetch('https://www.instagram.com/api/v1/media/configure_to_story/?video=1', {
              method: 'POST',
              headers: {
                ...commonHeaders,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: configBody.toString()
            });

            // Nếu endpoint ?video=1 trả về 404 hoặc 405, fallback sang endpoint không query
            if (!configRes.ok && (configRes.status === 404 || configRes.status === 405)) {
              configRes = await fetch('https://www.instagram.com/api/v1/media/configure_to_story/', {
                method: 'POST',
                headers: {
                  ...commonHeaders,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: configBody.toString()
              });
            }

            const resText = await configRes.text().catch(() => '');
            let configJson = {};
            try { configJson = JSON.parse(resText); } catch (_) {}
            console.log(`[InstaTweaks Direct API] configure video story attempt ${attempt}:`, configJson);

            // 1. Kiểm tra transcode trước: nếu máy chủ đang xử lý thì tiếp tục chờ, KHÔNG được return thành công giả
            const isTranscoding = resText.includes('Transcode not finished') ||
              resText.includes('"statusCode":202') ||
              resText.includes('"status":"PENDING"') ||
              resText.includes('PENDING') ||
              resText.toLowerCase().includes('processing') ||
              resText.toLowerCase().includes('not ready') ||
              configRes.status === 202;

            if (isTranscoding && attempt < maxStoryAttempts) {
              continue;
            }

            // 2. Chỉ coi là thành công khi HTTP OK và status = ok hoặc có media object thực sự
            const isSuccess = configRes.ok && (
              configJson.status === 'ok' ||
              resText.includes('"status":"COMPLETED"') ||
              Boolean(configJson.media && (configJson.media.id || configJson.media.pk))
            ) && !configJson.message;

            if (isSuccess) {
              return { success: true, mode: 'story', media: configJson.media || {} };
            }

            lastStoryError = configJson.message || configJson.error_title || resText;
          }

          return { success: false, reason: lastStoryError || 'configure_video_story_failed' };
        } else {
          // Feed Video
          const maxFeedVidAttempts = 10;
          let lastVidError = '';

          for (let attempt = 1; attempt <= maxFeedVidAttempts; attempt++) {
            if (onProgress) onProgress(`Đang xử lý & xuất bản video lên Bài viết (${attempt}/${maxFeedVidAttempts})...`);
            await new Promise(r => setTimeout(r, attempt === 1 ? 2500 : 2000));

            const configBody = new URLSearchParams({
              upload_id: uploadId,
              source_type: '4',
              caption: caption || '',
              poster_frame_index: '0'
            });
            if (dtsgToken) configBody.append('fb_dtsg', dtsgToken);

            const configRes = await fetch('https://www.instagram.com/api/v1/media/configure/', {
              method: 'POST',
              headers: {
                ...commonHeaders,
                'Content-Type': 'application/x-www-form-urlencoded'
              },
              body: configBody.toString()
            });

            const resText = await configRes.text().catch(() => '');
            let configJson = {};
            try { configJson = JSON.parse(resText); } catch (_) {}
            if (configRes.ok && (configJson.status === 'ok' || configJson.media)) {
              return { success: true, mode: 'post', media: configJson.media };
            }

            lastVidError = configJson.message || resText;
            const isTranscoding = resText.includes('Transcode not finished') ||
              resText.includes('"statusCode":202') ||
              resText.toLowerCase().includes('processing') ||
              configRes.status === 202;

            if (isTranscoding && attempt < maxFeedVidAttempts) {
              continue;
            }
          }

          return { success: false, reason: lastVidError || 'configure_feed_video_failed' };
        }
      }
    } catch (err) {
      console.error('[InstaTweaks Direct API] Exception during upload:', err);
      return { success: false, reason: err.message || 'network_error' };
    }
  }

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
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && studioState.isOpen) {
      closeStudio();
    }
  });

  window.__IGT_STUDIO_API__ = {
    openStudio,
    closeStudio,
    studioState,
    addSticker,
    removeSticker,
    switchToEditSticker,
    getStickerTab,
    exportVideoUltraHD,
    exportImageUltraHD,
    exportAndDownloadUltraHD,
    publishMediaViaInstagramAPI,
    injectMediaIntoInstagram,
    getInstagramCsrfToken,
    getInstagramDtsgToken,
    computeJazoest,
    getBaseTimelineDuration,
    getTotalTimelineDuration,
    setTimelineZoom,
    tlSliderValToZoom,
    tlZoomToSliderVal,
    addMediaFiles,
    activateMediaItem,
    removeMediaItem,
    setRatio,
    applyFitMode,
    resetMediaTransformToDefault,
    switchMode: (mode) => {
      if (!document.getElementById('igt-studio-modal')) {
        openStudio(mode);
        return;
      }
      studioState.mode = mode;
      const modal = document.getElementById('igt-studio-modal');
      if (modal) {
        modal.querySelectorAll('.igt-studio-header-btn[data-mode], .igt-studio-mode-pill[data-mode]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-mode') === mode);
        });
        renderTabsNav(modal);
      }
      if (mode === 'post') {
        if (studioState.ratio === '9:16' || !['original', '1:1', '4:5', '16:9'].includes(studioState.ratio)) {
          studioState.ratio = 'original';
        }
        if (studioState.activeTab === 'link') studioState.activeTab = 'general';
      } else {
        studioState.ratio = '9:16';
        if (studioState.activeTab === 'general') studioState.activeTab = 'main';
      }
      if (typeof renderRatioBar === 'function') {
        renderRatioBar(modal);
      }
      setRatio(studioState.ratio);
      renderTabContent(studioState.activeTab);
      renderMediaListUI();
      renderTimeline();
    },
    renderRatioBar,
    switchTab: (tabName) => {
      studioState.activeTab = tabName;
      const modal = document.getElementById('igt-studio-modal');
      if (modal) {
        modal.querySelectorAll('.igt-studio-tab-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
        });
        renderTabContent(tabName);
      }
    },
    renderTabsNav,
    openCullFilesModal,
    openReorderModal,
    toggleLiveItemMode,
    renderGeneralTabContent,
    appendClipToSequence,
    takeSnapshot,
    undo,
    redo,
    fetchLiveMusic,
    checkAndAutoRefreshDailyMusic
  };

  console.log('[InstaTweaks Studio Pro v3.3.0] Studio Core Engine Loaded Successfully.');
})();
