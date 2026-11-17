/**
 * IG Web Music Player - Content Script (v2.5.0)
 * 
 * TÍNH NĂNG MỚI NỔI BẬT v2.5.0: THANH TRƯỢT MEDIA TOÀN DIỆN (Media Scrubber Slider):
 * 1. THANH TRƯỢT TUA CHO VIDEO BÀI VIẾT, REELS, MODAL POPUP:
 *    - Bổ sung thanh tiến trình timeline scrubber cho mọi video Instagram PC (Feed, Reels, Post Modal /p/).
 *    - Hỗ trợ click / drag để tua tới bất kỳ giây nào, xem thời gian thực (0:15 / 1:20), xem thanh buffer.
 *    - Tích hợp cụm nút tiện ích: Play/Pause, Tua lùi 5s (-5s), Tua tới 5s (+5s), Tốc độ phát (1x, 1.25x, 1.5x, 2x, 0.75x),
 *      thanh trượt Âm lượng (0 - 100%), Toàn màn hình (Fullscreen) và Tải video nhanh.
 *    - Tự động ẩn thông minh khi không rê chuột sau 2.2s (giữ 1 vạch mỏng thanh lịch ở đáy).
 *    - Hỗ trợ phím tắt khi hover: Space (Play/Pause), Mũi tên Trái/Phải (-5s/+5s), Lên/Xuống (Volume), M (Mute).
 * 2. THANH TRƯỢT TUA CHO STORY DẠNG VIDEO & HIGHLIGHTS (TIN NỔI BẬT):
 *    - Thanh điều khiển kính mờ Glassmorphism nổi tinh tế ở đáy màn hình Story / Highlights.
 *    - Cho phép tua ngược xem lại hoặc tua tới bất kỳ đoạn nào trong Story video & Tin nổi bật Highlights.
 *    - Hỗ trợ cả slide Story / Highlight dạng ảnh có chèn nhạc.
 *    - Nút tua nhanh -5s / +5s, nút tốc độ phát (1x, 1.5x, 2x) và hiển thị thời gian chính xác.
 * 3. THANH TRƯỢT NÂNG CẤP CHO BÀI VIẾT ẢNH CHÈN NHẠC (FEED BAR SCRUBBER):
 *    - Biến thanh tiến trình tĩnh dưới ảnh thành thanh trượt tương tác cao cấp (drag & click to seek).
 *    - Núm trượt tròn phát sáng khi hover, hiển thị tooltip thời gian khi rê chuột, đồng bộ thời gian chạy mượt mà.
 */

(function () {
  'use strict';

  const tracksByCode = new Map();
  const noAudioSet = new Set();
  const inspectQueue = new Set();
  const activeInspections = new Set();

  let currentActive = null;

  // Trạng thái âm thanh của phiên lướt web (Ghi nhớ nếu người dùng đã bật tiếng)
  let isSoundSessionActive = sessionStorage.getItem('__ig_sound_active__') === 'true';

  // Cache các icon option ngay từ đầu để tránh lỗi 'Extension context invalidated' khi tiện ích được reload trong Chrome
  const CACHED_PROFILE_ICONS = {
    all: '',
    archive: '',
    story: '',
    highlight: '',
    video: '',
    photos: ''
  };
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      CACHED_PROFILE_ICONS.all = chrome.runtime.getURL('icons/opt_all.png');
      CACHED_PROFILE_ICONS.archive = chrome.runtime.getURL('icons/opt_archive.png');
      CACHED_PROFILE_ICONS.story = chrome.runtime.getURL('icons/opt_story.png');
      CACHED_PROFILE_ICONS.highlight = chrome.runtime.getURL('icons/opt_highlight.png');
      CACHED_PROFILE_ICONS.video = chrome.runtime.getURL('icons/opt_video.png');
      CACHED_PROFILE_ICONS.photos = chrome.runtime.getURL('icons/opt_photos.png');
    }
  } catch (_) { }

  const config = {
    autoplay: true,
    autoUnmute: true,
    volume: 0.8,
    loop: true,
    showBadge: true
  };

  if (chrome?.storage?.sync) {
    chrome.storage.sync.get(['autoplay', 'autoUnmute', 'volume', 'loop', 'showBadge'], (items) => {
      if (items.autoplay !== undefined) config.autoplay = items.autoplay;
      if (items.autoUnmute !== undefined) config.autoUnmute = items.autoUnmute;
      if (items.volume !== undefined) config.volume = items.volume;
      if (items.loop !== undefined) config.loop = items.loop;
      if (items.showBadge !== undefined) config.showBadge = items.showBadge;
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.autoplay) config.autoplay = changes.autoplay.newValue;
      if (changes.autoUnmute) config.autoUnmute = changes.autoUnmute.newValue;
      if (changes.volume) {
        config.volume = changes.volume.newValue;
        if (currentActive?.audio) currentActive.audio.volume = config.volume;
      }
      if (changes.loop) {
        config.loop = changes.loop.newValue;
        if (currentActive?.audio) currentActive.audio.loop = config.loop;
      }
    });
  }

  // --- 1. ĐỌC CACHE TỪ DOM VÀ LẮNG NGHE SỰ KIỆN TỪ INJECTED SCRIPT ---
  function readInitialCache() {
    const cacheEl = document.getElementById('__ig_music_cache__');
    if (cacheEl && cacheEl.textContent) {
      try {
        const list = JSON.parse(cacheEl.textContent);
        if (Array.isArray(list)) {
          list.forEach(saveTrackLocally);
        }
      } catch (_) { }
    }
  }

  function saveTrackLocally(track) {
    if (!track) return;
    if (track.code) tracksByCode.set(track.code, track);

    const pageShortcode = getPageShortcode();
    if (pageShortcode && !track.code) {
      track.code = pageShortcode;
      tracksByCode.set(pageShortcode, track);
    }
  }

  window.addEventListener('__IG_AUDIO_FOUND__', (event) => {
    const track = event.detail;
    saveTrackLocally(track);
    if (track?.code) {
      activeInspections.delete(track.code);
      inspectQueue.delete(track.code);
      updateFeedBarForPost(track.code, track, 'ready');
    }
    processInspectQueue();
    scanAndAttachPlayers();
  });

  window.addEventListener('__IG_AUDIO_NOT_FOUND__', (event) => {
    const { shortcode } = event.detail || {};
    if (shortcode) {
      noAudioSet.add(shortcode);
      activeInspections.delete(shortcode);
      inspectQueue.delete(shortcode);
      updateFeedBarForPost(shortcode, null, 'no-music');
    }
    processInspectQueue();
  });

  readInitialCache();
  window.dispatchEvent(new CustomEvent('__IG_CONTENT_READY__'));

  // --- 2. ICONS SVG ---
  const SVG_SPEAKER_ON = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
    </svg>`;

  const SVG_SPEAKER_MUTED = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>`;

  const SVG_MUSIC_NOTE = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
    </svg>`;

  const SVG_DOWNLOAD = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>`;

  const SVG_CHECKMARK = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;

  const SVG_SPINNER = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="32" stroke-dashoffset="10" style="animation: ig-feed-spin 0.8s linear infinite;">
      <circle cx="12" cy="12" r="10"></circle>
    </svg>
    <style>@keyframes ig-feed-spin { 100% { transform: rotate(360deg); } }</style>`;

  const SVG_PLAY = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6 3 20 12 6 21 6 3"></polygon>
    </svg>`;

  const SVG_PAUSE = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1"></rect>
      <rect x="14" y="4" width="4" height="16" rx="1"></rect>
    </svg>`;

  const SVG_REWIND_5 = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
      <polyline points="3 3 3 8 8 8"></polyline>
      <text x="12" y="15.5" font-size="8.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">5</text>
    </svg>`;

  const SVG_FORWARD_5 = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
      <polyline points="21 3 21 8 16 8"></polyline>
      <text x="12" y="15.5" font-size="8.5" font-weight="bold" fill="currentColor" stroke="none" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">5</text>
    </svg>`;

  const SVG_FULLSCREEN = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
    </svg>`;

  const SVG_FULLSCREEN_EXIT = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
    </svg>`;

  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  // --- 2.1. PURE JS ZIP CREATOR (STORE method, 0% CPU, 100% standard zip) ---
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function calculateCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Tính toán CRC32 dạng Stream theo từng chunk 64KB (Bộ nhớ RAM tiêu hao tối đa chỉ 64KB, Zero RAM Leak)
  async function calculateBlobCrc32(blob) {
    const reader = blob.stream().getReader();
    let crc = 0xFFFFFFFF;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ value[i]) & 0xFF];
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Đóng gói file ZIP từ các Blob trực tiếp (W3C Zero-Copy: Blob được lưu trên Disk Cache của trình duyệt, không copy vào V8 JS Heap, tiêu thụ < 50MB RAM kể cả với 100+ file video)
  function createZipBlobFromBlobs(fileRecords) {
    let offset = 0;
    const parts = [];

    for (const rec of fileRecords) {
      const localHeader = new Uint8Array(30 + rec.nameBytes.length);
      const view = new DataView(localHeader.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true); // UTF-8 filename flag
      view.setUint16(8, 0, true); // STORE (0% CPU)
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, rec.crc, true);
      view.setUint32(18, rec.size, true);
      view.setUint32(22, rec.size, true);
      view.setUint16(26, rec.nameBytes.length, true);
      view.setUint16(28, 0, true);
      localHeader.set(rec.nameBytes, 30);

      rec.offset = offset;
      parts.push(localHeader);
      parts.push(rec.blob); // Đưa trực tiếp Blob vào: Zero Heap RAM overhead
      offset += localHeader.length + rec.size;
    }

    const cdOffset = offset;
    for (const rec of fileRecords) {
      const cd = new Uint8Array(46 + rec.nameBytes.length);
      const view = new DataView(cd.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, rec.crc, true);
      view.setUint32(20, rec.size, true);
      view.setUint32(24, rec.size, true);
      view.setUint16(28, rec.nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, rec.offset, true);
      cd.set(rec.nameBytes, 46);
      parts.push(cd);
      offset += cd.length;
    }

    const cdSize = offset - cdOffset;
    const eocd = new Uint8Array(22);
    const eView = new DataView(eocd.buffer);
    eView.setUint32(0, 0x06054b50, true);
    eView.setUint16(4, 0, true);
    eView.setUint16(6, 0, true);
    eView.setUint16(8, fileRecords.length, true);
    eView.setUint16(10, fileRecords.length, true);
    eView.setUint32(12, cdSize, true);
    eView.setUint32(16, cdOffset, true);
    eView.setUint16(20, 0, true);
    parts.push(eocd);

    return new Blob(parts, { type: 'application/zip' });
  }

  function createZipBlob(files) {
    const fileRecords = [];
    let offset = 0;
    const textEncoder = new TextEncoder();

    for (const file of files) {
      const nameBytes = textEncoder.encode(file.name);
      const dataBytes = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const crc = calculateCrc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const view = new DataView(localHeader.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, size, true);
      view.setUint32(22, size, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      fileRecords.push({
        nameBytes,
        crc,
        size,
        offset,
        localHeader,
        dataBytes
      });

      offset += localHeader.length + dataBytes.length;
    }

    const cdOffset = offset;
    const cdRecords = [];

    for (const rec of fileRecords) {
      const cd = new Uint8Array(46 + rec.nameBytes.length);
      const view = new DataView(cd.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 20, true);
      view.setUint16(8, 0x0800, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      view.setUint32(16, rec.crc, true);
      view.setUint32(20, rec.size, true);
      view.setUint32(24, rec.size, true);
      view.setUint16(28, rec.nameBytes.length, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, rec.offset, true);
      cd.set(rec.nameBytes, 46);
      cdRecords.push(cd);
      offset += cd.length;
    }

    const cdSize = offset - cdOffset;

    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, cdOffset, true);
    eocdView.setUint16(20, 0, true);

    const parts = [];
    for (const rec of fileRecords) {
      parts.push(rec.localHeader, rec.dataBytes);
    }
    for (const cd of cdRecords) {
      parts.push(cd);
    }
    parts.push(eocd);

    return new Blob(parts, { type: 'application/zip' });
  }

  // --- 2.2. DOWNLOAD HELPERS ---
  // Kiểm tra cấu trúc MP4 để phân biệt chính xác 100% giữa Video thật (>= 24 FPS) và Ảnh kèm nhạc (1 FPS)
  function isMp41FpsPseudoVideo(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 64) return false;
    try {
      const view = new DataView(arrayBuffer);
      const len = arrayBuffer.byteLength;

      function findBox(start, end, targetType) {
        let p = start;
        while (p < end - 8) {
          const size = view.getUint32(p);
          if (size < 8) break;
          const type = String.fromCharCode(view.getUint8(p + 4), view.getUint8(p + 5), view.getUint8(p + 6), view.getUint8(p + 7));
          const boxEnd = size === 1 ? p + Number(view.getBigUint64(p + 8)) : p + size;
          if (type === targetType) {
            return {
              pos: p,
              size,
              end: Math.min(boxEnd, end),
              dataPos: size === 1 ? p + 16 : p + 8
            };
          }
          if (boxEnd <= p || boxEnd > end) break;
          p = boxEnd;
        }
        return null;
      }

      const moov = findBox(0, len, 'moov');
      if (!moov) return false;

      let p = moov.dataPos;
      while (p < moov.end - 8) {
        const trak = findBox(p, moov.end, 'trak');
        if (!trak) break;
        p = trak.end;

        const mdia = findBox(trak.dataPos, trak.end, 'mdia');
        if (!mdia) continue;

        const hdlr = findBox(mdia.dataPos, mdia.end, 'hdlr');
        if (hdlr) {
          const handler = String.fromCharCode(view.getUint8(hdlr.dataPos + 8), view.getUint8(hdlr.dataPos + 9), view.getUint8(hdlr.dataPos + 10), view.getUint8(hdlr.dataPos + 11));
          if (handler !== 'vide') continue;
        }

        const mdhd = findBox(mdia.dataPos, mdia.end, 'mdhd');
        let durationSec = 0;
        if (mdhd) {
          const ver = view.getUint8(mdhd.dataPos);
          const timescale = ver === 0 ? view.getUint32(mdhd.dataPos + 12) : view.getUint32(mdhd.dataPos + 20);
          const duration = ver === 0 ? view.getUint32(mdhd.dataPos + 16) : Number(view.getBigUint64(mdhd.dataPos + 24));
          if (timescale > 0) durationSec = duration / timescale;
        }

        const minf = findBox(mdia.dataPos, mdia.end, 'minf');
        if (!minf) continue;
        const stbl = findBox(minf.dataPos, minf.end, 'stbl');
        if (!stbl) continue;
        const stsz = findBox(stbl.dataPos, stbl.end, 'stsz');
        if (!stsz) continue;

        const sampleCount = view.getUint32(stsz.dataPos + 8);
        const fps = durationSec > 0 ? sampleCount / durationSec : 0;
        // Instagram tạo video wrapper 1 FPS cho ảnh kèm nhạc (1 sample/giây). Video thật luôn >= 24 FPS.
        return (fps > 0 && fps < 3) || (sampleCount > 0 && sampleCount <= 25 && durationSec >= 5);
      }
    } catch (_) { }
    return false;
  }

  // Tải chuẩn xác 1 trong 3 loại Story:
  // 1. Ảnh không kèm nhạc -> Tải file ảnh .jpg
  // 2. Ảnh kèm nhạc -> Nhận diện video 1-fps và tự động tải file ảnh .jpg gốc sắc nét nhất (tránh lỗi đen màn hình trên PC)
  // 3. Video -> Tải file video .mp4 chất lượng cao nhất (chuyển động + âm thanh)
  async function downloadStoryMedia({ videoUrl, imageUrl, username, timestamp }) {
    // A. Nếu có videoUrl: Tải dữ liệu video về để phân định thực tế
    if (videoUrl && !isDashAudioUrl(videoUrl)) {
      try {
        const res = await fetch(videoUrl, { credentials: 'omit' });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const is1FpsPseudo = isMp41FpsPseudoVideo(buffer);

          if (is1FpsPseudo) {
            // ĐÂY LÀ "ẢNH KÈM NHẠC":
            // Video 1-fps này bị đen màn hình trên PC, do đó tải file ảnh .jpg gốc nét nhất:
            const bestImgUrl = imageUrl || getBestImageUrl(getActiveStoryImage());
            if (bestImgUrl) {
              const filename = `instagram_story_${username}_${timestamp}.jpg`;
              return await downloadUrlAsBlob(bestImgUrl, filename);
            }
          }

          // NẾU KHÔNG PHẢI 1-FPS PSEUDO VIDEO -> ĐÂY LÀ "VIDEO THẬT" 100%!
          // Tải file .mp4 chất lượng gốc:
          const blob = new Blob([buffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `instagram_story_${username}_${timestamp}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
          return true;
        }
      } catch (err) {
        console.warn('[IG Story Downloader] Failed fetching video buffer:', err);
      }
    }

    // B. Nếu không có videoUrl hoặc fetch video lỗi:
    // Chắc chắn là "ẢNH KHÔNG KÈM NHẠC" hoặc Ảnh trong DOM -> Tải .jpg
    const bestImgUrl = imageUrl || getBestImageUrl(getActiveStoryImage());
    if (bestImgUrl) {
      const filename = `instagram_story_${username}_${timestamp}.jpg`;
      return await downloadUrlAsBlob(bestImgUrl, filename);
    }

    return false;
  }

  async function downloadUrlAsBlob(url, filename) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error('Fetch status ' + res.status);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 20000);
      return true;
    } catch (err) {
      console.warn('[IG Downloader] Direct blob fetch failed, falling back to link click:', err);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return true;
    }
  }

  function requestPostMedia(shortcode) {
    return new Promise((resolve) => {
      let done = false;
      const onFound = (e) => {
        if (e.detail?.shortcode === shortcode) {
          cleanup();
          resolve(e.detail.items || []);
        }
      };
      const onNotFound = (e) => {
        if (e.detail?.shortcode === shortcode) {
          cleanup();
          resolve([]);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 2500);

      function cleanup() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('__IG_POST_MEDIA_FOUND__', onFound);
        window.removeEventListener('__IG_POST_MEDIA_NOT_FOUND__', onNotFound);
      }

      window.addEventListener('__IG_POST_MEDIA_FOUND__', onFound);
      window.addEventListener('__IG_POST_MEDIA_NOT_FOUND__', onNotFound);

      window.dispatchEvent(new CustomEvent('__IG_REQUEST_POST_MEDIA__', {
        detail: { shortcode }
      }));
    });
  }

  function getPostMediaFromDOM(postContainer) {
    if (!postContainer) return [];
    const items = [];
    const seenUrls = new Set();

    // 1. Kiểm tra ảnh bài viết (loại trừ avatar, header, icon)
    const imgs = Array.from(postContainer.querySelectorAll('img')).filter(img => {
      if (img.closest('header') || img.closest('aside')) return false;
      const rect = img.getBoundingClientRect();
      return rect.width > 160 && rect.height > 160 && img.naturalWidth > 150;
    });

    // 2. Kiểm tra video bài viết (bắt buộc videoWidth > 0 để loại bỏ thẻ phát nhạc ngầm)
    const videos = Array.from(postContainer.querySelectorAll('video')).filter(v => {
      const style = window.getComputedStyle(v);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.1;
      return isVisible && v.videoWidth > 0 && v.videoHeight > 0 && v.offsetWidth > 160;
    });

    // Nếu bài viết có ảnh lớn và không có video hiển thị hình ảnh -> ĐÂY LÀ BÀI VIẾT ẢNH (KỂ CẢ CÓ NHẠC NỀN)
    if (imgs.length > 0 && videos.length === 0) {
      for (const img of imgs) {
        let url = img.currentSrc || img.src;
        if (img.srcset) {
          const parts = img.srcset.split(',').map(s => s.trim().split(' '));
          const best = parts.sort((a, b) => parseInt(b[1] || '0') - parseInt(a[1] || '0'))[0];
          if (best && best[0]) url = best[0];
        }
        if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          items.push({ type: 'image', url });
        }
      }
      return items;
    }

    // Nếu là video bài viết:
    if (videos.length > 0) {
      for (const vid of videos) {
        const src = vid.currentSrc || vid.src;
        if (src && !seenUrls.has(src)) {
          seenUrls.add(src);
          items.push({ type: 'video', url: src });
        }
      }
      return items;
    }

    // Fallback:
    for (const img of imgs) {
      let url = img.currentSrc || img.src;
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        items.push({ type: 'image', url });
      }
    }

    return items;
  }

  // --- TẢI FILE NÉN .ZIP ---
  async function executeZipDownload(shortcode, items, downloadBtn) {
    if (downloadBtn._isDownloading) return;
    downloadBtn._isDownloading = true;

    const originalHtml = downloadBtn.innerHTML;
    downloadBtn.innerHTML = SVG_SPINNER;
    downloadBtn.classList.add('downloading');

    try {
      const filesToZip = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isVideo = item.type === 'video' || item.url.includes('.mp4');
        const ext = isVideo ? 'mp4' : 'jpg';
        const filename = `instagram_${shortcode || 'post'}_${i + 1}.${ext}`;

        try {
          const res = await fetch(item.url, { credentials: 'omit' });
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            filesToZip.push({ name: filename, data: new Uint8Array(arrayBuf) });
          }
        } catch (_) { }
      }

      if (filesToZip.length > 0) {
        const zipBlob = createZipBlob(filesToZip);
        const blobUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `instagram_${shortcode || 'post'}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 25000);

        downloadBtn.innerHTML = SVG_CHECKMARK;
        downloadBtn.classList.remove('downloading');
        downloadBtn.classList.add('success');
        setTimeout(() => {
          downloadBtn.innerHTML = originalHtml;
          downloadBtn.classList.remove('success');
          downloadBtn._isDownloading = false;
        }, 2200);
      } else {
        downloadBtn.innerHTML = originalHtml;
        downloadBtn._isDownloading = false;
        downloadBtn.classList.remove('downloading');
      }
    } catch (err) {
      console.error('[IG ZIP Download] Error:', err);
      downloadBtn.innerHTML = originalHtml;
      downloadBtn._isDownloading = false;
      downloadBtn.classList.remove('downloading');
    }
  }

  // --- TẢI TỪNG FILE RIÊNG LẺ ---
  async function executeIndividualDownload(shortcode, items, downloadBtn) {
    if (downloadBtn._isDownloading) return;
    downloadBtn._isDownloading = true;

    const originalHtml = downloadBtn.innerHTML;
    downloadBtn.innerHTML = SVG_SPINNER;
    downloadBtn.classList.add('downloading');

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isVideo = item.type === 'video' || item.url.includes('.mp4');
        const ext = isVideo ? 'mp4' : 'jpg';
        const filename = items.length === 1
          ? `instagram_${shortcode || 'post'}.${ext}`
          : `instagram_${shortcode || 'post'}_${i + 1}.${ext}`;

        await downloadUrlAsBlob(item.url, filename);
        if (i < items.length - 1) {
          await new Promise(r => setTimeout(r, 350));
        }
      }

      downloadBtn.innerHTML = SVG_CHECKMARK;
      downloadBtn.classList.remove('downloading');
      downloadBtn.classList.add('success');

      setTimeout(() => {
        downloadBtn.innerHTML = originalHtml;
        downloadBtn.classList.remove('success');
        downloadBtn._isDownloading = false;
      }, 2200);
    } catch (err) {
      console.error('[IG Individual Download] Error:', err);
      downloadBtn.innerHTML = originalHtml;
      downloadBtn._isDownloading = false;
      downloadBtn.classList.remove('downloading');
    }
  }

  // --- DIALOG CHỌN HÌNH THỨC TẢI (.ZIP HOẶC TỪNG FILE) ---
  function showDownloadChoiceDialog({ shortcode, items, downloadBtn }) {
    document.querySelectorAll('.ig-download-dialog-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'ig-download-dialog-overlay';

    const zipIconUrl = chrome.runtime.getURL('icons/zip.png');

    overlay.innerHTML = `
      <div class="ig-download-dialog" role="dialog" aria-modal="true">
        <div class="ig-download-dialog-header">
          <span class="ig-dl-title">Tải bài viết (${items.length} tệp)</span>
          <button class="ig-dl-close-btn" type="button" title="Đóng">&times;</button>
        </div>
        <div class="ig-download-dialog-desc">Bài viết có nhiều ảnh/video. Bạn muốn tải theo hình thức nào?</div>
        <div class="ig-download-dialog-actions">
          <button class="ig-dl-choice-btn btn-zip" type="button">
            <img src="${zipIconUrl}" class="ig-choice-zip-icon" alt="ZIP">
            <div class="ig-choice-info">
              <strong>Nén thành 1 file .ZIP (Khuyên dùng)</strong>
              <small>Gọn gàng trong 1 tệp, không bị trình duyệt chặn</small>
            </div>
          </button>
          <button class="ig-dl-choice-btn btn-individual" type="button">
            <svg class="ig-choice-files-icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <div class="ig-choice-info">
              <strong>Tải từng file riêng lẻ</strong>
              <small>Tải lần lượt từng ảnh/video (.jpg, .mp4)</small>
            </div>
          </button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.querySelector('.ig-dl-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('.btn-zip').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      executeZipDownload(shortcode, items, downloadBtn);
    });

    overlay.querySelector('.btn-individual').addEventListener('click', (e) => {
      e.stopPropagation();
      close();
      executeIndividualDownload(shortcode, items, downloadBtn);
    });

    document.body.appendChild(overlay);
  }

  // --- HÀM TẢI BÀI VIẾT TỔNG HỢP ---
  async function downloadAllPostMedia(shortcode, postContainer, downloadBtn) {
    if (downloadBtn._isDownloading) return;

    const originalHtml = downloadBtn.innerHTML;
    downloadBtn.innerHTML = SVG_SPINNER;
    downloadBtn.classList.add('downloading');

    try {
      let items = [];
      if (shortcode) {
        items = await requestPostMedia(shortcode);
      }

      if (!items || items.length === 0) {
        items = getPostMediaFromDOM(postContainer);
      }

      downloadBtn.innerHTML = originalHtml;
      downloadBtn.classList.remove('downloading');

      if (!items || items.length === 0) {
        console.warn('[IG Downloader] No media found for post:', shortcode);
        return;
      }

      if (items.length === 1) {
        // Chỉ có 1 file ảnh hoặc 1 video: Tải trực tiếp không cần hỏi
        await executeIndividualDownload(shortcode, items, downloadBtn);
      } else {
        // Có từ 2 file trở lên: Hiện popup để người dùng lựa chọn ZIP hay Từng file
        showDownloadChoiceDialog({ shortcode, items, downloadBtn });
      }

    } catch (err) {
      console.error('[IG Downloader] Error:', err);
      downloadBtn.innerHTML = originalHtml;
      downloadBtn.classList.remove('downloading');
    }
  }

  // --- 3. DỪNG NHẠC VÀ DỌN DẸP TRIỆT ĐỂ ---
  function pauseCurrentAudio() {
    if (currentActive) {
      try {
        currentActive.audio.pause();
        currentActive.audio.currentTime = 0;
      } catch (_) { }
      if (currentActive.updatePausedUI) {
        currentActive.updatePausedUI();
      }
      currentActive = null;
    }
  }

  function getActivePostDialog() {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const d of dialogs) {
      if (d.getAttribute('aria-hidden') === 'true') continue;
      const rect = d.getBoundingClientRect();
      if (rect.width <= 150 || rect.height <= 150) continue;
      const style = window.getComputedStyle(d);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      if (d.querySelector('article') || d.querySelector('button[aria-label*="Next"], button[aria-label*="Tiếp"]') || d.querySelector('img[src*="instagram"], img[src*="fbcdn"]')) {
        return d;
      }
    }
    return null;
  }

  function isPostViewingContext() {
    const path = window.location.pathname;
    if (path === '/') return true;
    if (path.includes('/p/') || path.includes('/reel/')) return true;
    if (getActivePostDialog()) return true;
    return false;
  }

  function isSingleVideoPost(postElement) {
    if (!postElement) return false;
    const video = postElement.querySelector('video');
    if (!video) return false;

    // BẮT BUỘC: video phải có kích thước khung hình thật (không phải audio player của ảnh có nhạc)
    if (video.videoWidth === 0 && video.videoHeight === 0) return false;

    // Nếu bài viết có ảnh lớn (naturalWidth > 150), đây là BÀI VIẾT ẢNH CÓ NHẠC, không phải single video!
    const largeImg = postElement.querySelector('article img, div[role="button"] img, img[src*="cdninstagram"], img[src*="fbcdn"]');
    if (largeImg && largeImg.naturalWidth > 150 && largeImg.offsetWidth > 160) {
      return false;
    }

    const hasCarouselNav = Boolean(
      postElement.querySelector(
        'button[aria-label*="Next"], button[aria-label*="Go back"], button[aria-label*="Tiếp"], button[aria-label*="Quay lại"]'
      )
    );
    const carouselDots = postElement.querySelectorAll('div[role="tablist"] [role="tab"], .coreSpriteMediaNavigationDot');
    const carouselSlides = postElement.querySelectorAll('ul li img, ul li video');

    if (hasCarouselNav || carouselDots.length > 1 || carouselSlides.length > 1) {
      return false;
    }
    return true;
  }

  function cleanupIfPostClosed() {
    if (!isPostViewingContext()) {
      pauseCurrentAudio();
      document.querySelectorAll('.ig-music-controls-container, .ig-music-feed-bar').forEach(el => el.remove());
      return;
    }

    if (currentActive) {
      if (!currentActive.wrapper?.isConnected || !document.body.contains(currentActive.wrapper)) {
        pauseCurrentAudio();
        return;
      }

      const parentDialog = currentActive.wrapper.closest('div[role="dialog"]');
      if (parentDialog && (parentDialog.getAttribute('aria-hidden') === 'true' || parentDialog.offsetWidth <= 0)) {
        pauseCurrentAudio();
      }
    }
  }

  // --- 4. HÀNG ĐỢI TRUY VẤN THEO MÀN HÌNH (Viewport Priority) ---
  function queuePostInspection(shortcode) {
    if (!shortcode || tracksByCode.has(shortcode) || noAudioSet.has(shortcode)) return;
    if (activeInspections.has(shortcode) || inspectQueue.has(shortcode)) return;

    inspectQueue.add(shortcode);
    processInspectQueue();
  }

  function processInspectQueue() {
    if (activeInspections.size >= 2 || inspectQueue.size === 0) return;

    const iterator = inspectQueue.values();
    const nextCode = iterator.next().value;
    inspectQueue.delete(nextCode);
    activeInspections.add(nextCode);

    window.dispatchEvent(new CustomEvent('__IG_REQUEST_INSPECT_POST__', {
      detail: { shortcode: nextCode }
    }));
  }

  // --- 5. VỊ TRÍ CHÈN VÀ TỰ ĐỘNG BÙ TRỪ PADDING ---
  function findFeedInsertionPoint(postElement) {
    const section = postElement.querySelector('section');
    if (section && section.parentElement) {
      return { parent: section.parentElement, refNode: section };
    }

    const mediaFrame = findStableMediaFrame(postElement);
    if (mediaFrame && mediaFrame.parentElement) {
      return { parent: mediaFrame.parentElement, refNode: mediaFrame.nextSibling };
    }

    return null;
  }

  function adjustFeedBarWidth(bar, postElement) {
    if (!bar || !postElement) return;

    const isModalOrDirect = Boolean(postElement.closest('div[role="dialog"]') || window.location.pathname.includes('/p/'));
    if (isModalOrDirect) {
      bar.style.width = '100%';
      bar.style.maxWidth = '100%';
      bar.style.marginLeft = '0';
      bar.style.marginRight = '0';
      bar.style.boxSizing = 'border-box';
      return;
    }

    const parent = bar.parentElement;
    if (!parent) return;

    const postWidth = postElement.clientWidth || postElement.getBoundingClientRect().width;
    const parentWidth = parent.clientWidth || parent.getBoundingClientRect().width;

    if (postWidth > 0 && parentWidth > 0) {
      const diff = postWidth - parentWidth;
      if (diff > 0) {
        const half = Math.round(diff / 2);
        bar.style.setProperty('margin-left', `-${half}px`, 'important');
        bar.style.setProperty('margin-right', `-${half}px`, 'important');
        bar.style.setProperty('width', `${postWidth}px`, 'important');
        bar.style.setProperty('max-width', `${postWidth}px`, 'important');
        bar.style.setProperty('box-sizing', 'border-box', 'important');
      }
    }
  }

  // --- 6. TẠO THANH PHÁT NHẠC MẶC ĐỊNH (Áp dụng đồng bộ mọi trang) ---
  function createFeedBarElement(postShortcode) {
    const bar = document.createElement('div');
    bar.className = 'ig-music-feed-bar state-loading';
    bar.setAttribute('data-ig-shortcode', postShortcode);

    bar.innerHTML = `
      <button class="ig-feed-download-btn" type="button" title="Tải toàn bộ bài viết (ảnh & video)">
        ${SVG_DOWNLOAD}
      </button>
      <div class="ig-feed-bar-left">
        <div class="ig-music-icon-box">
          <span class="ig-static-note">${SVG_MUSIC_NOTE}</span>
          <div class="ig-eq-wave">
            <span class="eq-bar bar-1"></span>
            <span class="eq-bar bar-2"></span>
            <span class="eq-bar bar-3"></span>
          </div>
        </div>
        <div class="ig-feed-content-area">
          <div class="ig-feed-loading-text">
            ${SVG_SPINNER} <span>Đang tải âm thanh...</span>
          </div>
        </div>
      </div>
      <button class="ig-feed-speaker-btn" type="button" title="Phát nhạc" disabled>
        ${SVG_SPEAKER_MUTED}
      </button>
      <div class="ig-progress-track" style="display: none;" title="Kéo hoặc bấm để tua nhạc">
        <div class="ig-progress-fill"></div>
        <div class="ig-progress-thumb"></div>
        <div class="ig-progress-tooltip">0:00</div>
      </div>
    `;

    const downloadBtn = bar.querySelector('.ig-feed-download-btn');
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const postContainer = bar.closest('article') || bar.closest('div[role="dialog"]') || document.querySelector('main');
      downloadAllPostMedia(postShortcode, postContainer, downloadBtn);
    });

    return bar;
  }

  function updateFeedBarForPost(shortcode, track, state) {
    const bars = document.querySelectorAll(`.ig-music-feed-bar[data-ig-shortcode="${shortcode}"]`);
    bars.forEach(bar => {
      bar.classList.remove('state-loading', 'state-ready', 'state-no-music');
      bar.classList.add(`state-${state}`);

      const contentArea = bar.querySelector('.ig-feed-content-area');
      const speakerBtn = bar.querySelector('.ig-feed-speaker-btn');
      const progressTrack = bar.querySelector('.ig-progress-track');

      const postContainer = bar.closest('article') || bar.closest('div[role="dialog"]') || document.querySelector('main');
      if (postContainer) {
        adjustFeedBarWidth(bar, postContainer);
      }

      if (state === 'ready' && track) {
        const clipDurationSec = (track.clipDurationMs || 30000) / 1000;
        contentArea.innerHTML = `
          <div class="ig-track-info" title="${track.title} - ${track.artist}">
            <span class="ig-track-title">${track.title}</span>
            ${track.artist ? `<span class="ig-track-divider">•</span><span class="ig-track-artist">${track.artist}</span>` : ''}
            <div class="ig-feed-time-wrap">
              <span class="ig-feed-cur-time">0:00</span>
              <span class="ig-feed-time-sep">/</span>
              <span class="ig-clip-duration">${formatTime(clipDurationSec)}</span>
            </div>
          </div>
        `;
        speakerBtn.removeAttribute('disabled');
        progressTrack.style.display = 'block';

        bindAudioToFeedBar(bar, track);

        // NẾU Ở BẢNG TIN HOME & ÂM THANH ĐANG ACTIVE:
        // Tự động phát ngay nếu bài viết này đang nằm trong trung tâm màn hình!
        const isHomeFeed = (window.location.pathname === '/' && !document.querySelector('div[role="dialog"]'));
        if (isHomeFeed && isSoundSessionActive) {
          const rect = bar.getBoundingClientRect();
          if (rect.top > 0 && rect.bottom < window.innerHeight) {
            if (!currentActive && bar._startPlayFn) {
              bar._startPlayFn();
            }
          }
        }

        // Nếu ở Modal Dialog hoặc Trang đơn /p/ và có bật Autoplay:
        const isModalOrDirect = Boolean(bar.closest('div[role="dialog"]') || window.location.pathname.includes('/p/'));
        if (isModalOrDirect && config.autoplay && !currentActive) {
          setTimeout(() => {
            if (bar.isConnected && !currentActive) {
              speakerBtn.click();
            }
          }, 250);
        }
      } else if (state === 'no-music') {
        contentArea.innerHTML = `
          <div class="ig-feed-no-music-text">
            <span>Bài viết không có nhạc</span>
          </div>
        `;
        speakerBtn.setAttribute('disabled', 'true');
        speakerBtn.innerHTML = SVG_SPEAKER_MUTED;
        progressTrack.style.display = 'none';
      }
    });
  }

  function bindAudioToFeedBar(bar, track) {
    if (bar._hasAudioBinding) return;
    bar._hasAudioBinding = true;

    const speakerBtn = bar.querySelector('.ig-feed-speaker-btn');
    const barLeft = bar.querySelector('.ig-feed-bar-left');
    const progressTrack = bar.querySelector('.ig-progress-track');
    const progressFill = bar.querySelector('.ig-progress-fill');
    const progressThumb = bar.querySelector('.ig-progress-thumb');
    const progressTooltip = bar.querySelector('.ig-progress-tooltip');
    const curTimeEl = bar.querySelector('.ig-feed-cur-time');

    let isDraggingAudio = false;

    const startSec = (track.startTimeMs || 0) / 1000;
    const clipDurationSec = (track.clipDurationMs || 30000) / 1000;
    const endSec = startSec + clipDurationSec;

    const audio = new Audio(track.audioUrl);
    audio.preload = 'none';
    audio.volume = config.volume;

    const applyStartTime = () => {
      if (startSec > 0 && Math.abs(audio.currentTime - startSec) > 0.4) {
        try {
          audio.currentTime = startSec;
        } catch (_) { }
      }
    };
    audio.addEventListener('loadedmetadata', applyStartTime);
    audio.addEventListener('canplay', applyStartTime);

    const updatePausedUI = () => {
      speakerBtn.innerHTML = SVG_SPEAKER_MUTED;
      speakerBtn.classList.remove('playing');
      bar.classList.remove('playing');
    };

    const updatePlayingUI = () => {
      speakerBtn.innerHTML = SVG_SPEAKER_ON;
      speakerBtn.classList.add('playing');
      bar.classList.add('playing');
    };

    const startPlay = () => {
      if (!isPostViewingContext() || !bar.isConnected) return;

      pauseCurrentAudio();
      audio.volume = config.volume;
      applyStartTime();

      // KÍCH HOẠT PHÁT NHẠC ĐỒNG BỘ TRONG USER GESTURE
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          if (!isPostViewingContext() || !bar.isConnected) {
            audio.pause();
            return;
          }
          updatePlayingUI();
          currentActive = {
            audio,
            speakerBtn,
            badge: bar,
            wrapper: bar,
            track,
            updatePausedUI
          };
        }).catch((err) => {
          console.warn('[IG Music Player] Playback error:', err);
          updatePausedUI();
          const unlockAudio = () => {
            document.removeEventListener('click', unlockAudio);
            if (audio.paused && bar.isConnected && isPostViewingContext()) {
              audio.play().then(updatePlayingUI).catch(() => { });
            }
          };
          document.addEventListener('click', unlockAudio, { once: true });
        });
      }
    };

    bar._startPlayFn = startPlay;
    bar._audio = audio;

    const togglePlay = (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (currentActive?.audio === audio && !audio.paused) {
        // NGƯỜI DÙNG BẤM TẮT TIẾNG (MUTE): Dừng tự phát các bài sau
        isSoundSessionActive = false;
        sessionStorage.setItem('__ig_sound_active__', 'false');
        pauseCurrentAudio();
      } else {
        // NGƯỜI DÙNG BẤM BẬT TIẾNG (ACTIVATE): Kích hoạt tự phát các bài tiếp theo!
        isSoundSessionActive = true;
        sessionStorage.setItem('__ig_sound_active__', 'true');
        startPlay();
      }
    };

    speakerBtn.addEventListener('click', togglePlay);
    barLeft.addEventListener('click', togglePlay);

    // --- THANH TRƯỢT TƯƠNG TÁC CHO BÀI VIẾT ẢNH CHÈN NHẠC (FEED SCRUBBER) ---
    const getAudioScrubPct = (e) => {
      if (!progressTrack) return 0;
      const rect = progressTrack.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const applyScrubAudio = (pct) => {
      const relativeSec = pct * clipDurationSec;
      const actualSec = startSec + relativeSec;
      audio.currentTime = actualSec;
      if (progressFill) progressFill.style.width = `${pct * 100}%`;
      if (progressThumb) progressThumb.style.left = `${pct * 100}%`;
      if (curTimeEl) curTimeEl.textContent = formatTime(relativeSec);
    };

    if (progressTrack) {
      progressTrack.addEventListener('pointerenter', () => {
        if (progressTooltip) progressTooltip.style.opacity = '1';
      });

      progressTrack.addEventListener('pointerleave', () => {
        if (!isDraggingAudio && progressTooltip) {
          progressTooltip.style.opacity = '0';
        }
      });

      const onAudioScrubEnd = (e) => {
        if (!isDraggingAudio) return;
        isDraggingAudio = false;
        progressTrack.classList.remove('is-dragging');
        if (e && e.pointerId !== undefined) {
          try {
            progressTrack.releasePointerCapture(e.pointerId);
          } catch (_) { }
        }
        window.removeEventListener('pointerup', onAudioScrubEnd, true);
        window.removeEventListener('pointercancel', onAudioScrubEnd, true);
        window.removeEventListener('mouseup', onAudioScrubEnd, true);
        window.removeEventListener('blur', onAudioScrubEnd, true);
        if (progressTooltip) progressTooltip.style.opacity = '0';
      };

      progressTrack.addEventListener('pointermove', (e) => {
        if (isDraggingAudio && (e.buttons === 0 || (e.buttons !== undefined && (e.buttons & 1) === 0))) {
          onAudioScrubEnd(e);
          return;
        }
        const pct = getAudioScrubPct(e);
        const relativeSec = pct * clipDurationSec;
        if (progressTooltip) {
          progressTooltip.textContent = formatTime(relativeSec);
          progressTooltip.style.left = `${(pct * 100).toFixed(1)}%`;
        }
        if (isDraggingAudio) {
          applyScrubAudio(pct);
        }
      });

      progressTrack.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingAudio = true;
        progressTrack.classList.add('is-dragging');
        try {
          progressTrack.setPointerCapture(e.pointerId);
        } catch (_) { }

        const pct = getAudioScrubPct(e);
        applyScrubAudio(pct);

        if (progressTooltip) {
          progressTooltip.style.opacity = '1';
          progressTooltip.textContent = formatTime(pct * clipDurationSec);
          progressTooltip.style.left = `${(pct * 100).toFixed(1)}%`;
        }

        // Tự động phát nếu đang pause
        if (audio.paused && !currentActive) {
          startPlay();
        }

        window.addEventListener('pointerup', onAudioScrubEnd, true);
        window.addEventListener('pointercancel', onAudioScrubEnd, true);
        window.addEventListener('mouseup', onAudioScrubEnd, true);
        window.addEventListener('blur', onAudioScrubEnd, true);
      });

      progressTrack.addEventListener('pointerup', onAudioScrubEnd);
      progressTrack.addEventListener('pointercancel', onAudioScrubEnd);
    }

    // KHI THAO TÁC BÀI VIẾT (NEXT ẢNH, LIKE, CLICK ẢNH): TỰ ĐỘNG PHÁT NHẠC & KÍCH HOẠT PHIÊN ÂM THANH
    const postContainer = bar.closest('article') || bar.closest('div[role="dialog"]');
    if (postContainer && !postContainer._hasPostInteractionListener) {
      postContainer._hasPostInteractionListener = true;

      postContainer.addEventListener('click', (e) => {
        if (e.target.closest('.ig-music-feed-bar, .ig-music-controls-container')) return;
        const link = e.target.closest('a');
        if (link && link.getAttribute('href') && !link.getAttribute('href').includes('/p/')) return;

        // Nếu bài viết này ĐÃ ĐANG PHÁT NHẠC: Bỏ qua ngay lập tức để Instagram chuyển ảnh siêu mượt!
        if (currentActive?.audio === audio && !audio.paused) return;

        isSoundSessionActive = true;
        sessionStorage.setItem('__ig_sound_active__', 'true');
        startPlay();
      }, { passive: true });
    }

    audio.addEventListener('timeupdate', () => {
      if (!isPostViewingContext() || !bar.isConnected) {
        audio.pause();
        audio.currentTime = 0;
        cleanupIfPostClosed();
        return;
      }

      if (audio.currentTime >= endSec) {
        if (config.loop) {
          audio.currentTime = startSec;
          audio.play().catch(() => { });
        } else {
          audio.pause();
          audio.currentTime = startSec;
          updatePausedUI();
          if (currentActive?.audio === audio) currentActive = null;
        }
      }

      if (!isDraggingAudio) {
        const elapsed = Math.max(0, audio.currentTime - startSec);
        const percent = Math.min(100, (elapsed / clipDurationSec) * 100);
        if (progressFill) progressFill.style.width = `${percent.toFixed(1)}%`;
        if (progressThumb) progressThumb.style.left = `${percent.toFixed(1)}%`;
        if (curTimeEl) curTimeEl.textContent = formatTime(elapsed);
      }
    });
  }

  // --- 7. TRÍCH XUẤT SHORTCODE & KHUNG MEDIA ---
  function getPageShortcode() {
    const match = window.location.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function getShortcodeFromPost(post) {
    if (!post) return null;
    const timeAnchor = post.querySelector('a:has(time), a[href*="/p/"] time, a[href*="/reel/"] time');
    if (timeAnchor) {
      const a = timeAnchor.closest('a');
      const m = a?.getAttribute('href')?.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }

    const directLinks = Array.from(post.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
    for (const link of directLinks) {
      const href = link.getAttribute('href') || '';
      const m = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      if (m && !href.includes('/comments/')) return m[1];
    }
    return null;
  }

  function findStableMediaFrame(postElement) {
    const navBtn = postElement.querySelector(
      'button[aria-label*="Next"], button[aria-label*="Go back"], button[aria-label*="Tiếp"], button[aria-label*="Quay lại"]'
    );
    if (navBtn) {
      let cur = navBtn.parentElement;
      while (cur && cur !== postElement) {
        if (cur.querySelector('img, ul')) return cur;
        cur = cur.parentElement;
      }
    }

    const images = Array.from(postElement.querySelectorAll('img'))
      .filter(img => {
        if (img.closest('header') || img.closest('aside')) return false;
        const rect = img.getBoundingClientRect();
        return rect.width > 160 && rect.height > 160;
      })
      .sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectA.top - rectB.top || (rectB.width * rectB.height) - (rectA.width * rectA.height);
      });

    if (images.length > 0) {
      let cur = images[0].parentElement;
      let best = cur;
      while (cur && cur !== postElement) {
        if (cur.tagName === 'ARTICLE' || cur.querySelector('section')) break;
        best = cur;
        if (cur.querySelector('ul') || cur.getAttribute('role') === 'button') break;
        cur = cur.parentElement;
      }
      return best;
    }

    return postElement.querySelector('div[role="button"]') || postElement;
  }

  function getValidPostArticles() {
    if (!isPostViewingContext()) return [];

    const activeDialog = getActivePostDialog();
    if (activeDialog) {
      const art = activeDialog.querySelector('article');
      return art ? [art] : [activeDialog];
    }

    const path = window.location.pathname;
    if (path.includes('/p/') || path.includes('/reel/')) {
      const art = document.querySelector('main article, article');
      if (art) return [art];
      const main = document.querySelector('main');
      if (main) return [main];
      return [];
    }

    if (path !== '/') return [];

    const articles = Array.from(document.querySelectorAll('main article, article'));
    return articles.filter(art => {
      if (art.closest('div[role="dialog"]') || art.closest('aside')) return false;
      return Boolean(art.querySelector('img, video'));
    });
  }

  // --- 7.1. NÚT DOWNLOAD NỔI CHO VIDEO ĐƠN LẺ (Single Video Posts) ---
  function attachFloatingDownloadButton(post) {
    // Trong v2.5.0: Video đơn lẻ đã có nút Download tích hợp ngay trong thanh điều khiển trượt lên,
    // không tạo thêm nút tròn nổi lẻ loi ở góc trái nữa để tránh trùng lặp và vướng giao diện.
    if (!post) return;
    const existing = post.querySelector('.ig-floating-download-btn');
    if (existing) existing.remove();
  }

  // --- 8. TỰ ĐỘNG BẬT TIẾNG & THANH ĐIỀU KHIỂN VIDEO (v2.5.0 - Tối ưu RAM & Hiệu năng) ---
  const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  function ensureVideoUnmuted(video) {
    if (config.autoUnmute === false) return;
    if (!video || video._userMuted) return;

    const targetVolume = (typeof config.volume === 'number' && config.volume > 0) ? config.volume : 0.8;

    const applyUnmute = () => {
      if (!video || video._userMuted) return;
      try {
        if (video.muted) {
          video.muted = false;
        }
        if (video.volume === 0 || Math.abs(video.volume - targetVolume) > 0.3) {
          video.volume = targetVolume;
        }
      } catch (_) { }
    };

    applyUnmute();
    requestAnimationFrame(applyUnmute);
    setTimeout(applyUnmute, 120);
    setTimeout(applyUnmute, 350);
  }

  function findVideoContainer(video) {
    if (!video) return null;
    // Đi tìm khung chứa bao quát cả video và các lớp overlay/nút bấm của Instagram
    let cur = video.parentElement;
    let best = video.parentElement;
    while (cur && cur.tagName !== 'ARTICLE' && !cur.getAttribute('role')?.includes('dialog') && cur.tagName !== 'BODY') {
      const cW = cur.offsetWidth || 0;
      const cH = cur.offsetHeight || 0;
      const vW = video.offsetWidth || 0;
      const vH = video.offsetHeight || 0;

      // Nếu chứa các nút điều khiển âm thanh mặc định của IG hoặc là khung tương tác chính
      const hasNativeControls = cur.querySelector(`
        button:not(.ig-vctl-btn):is([aria-label*="audio" i], [aria-label*="sound" i], [aria-label*="volume" i], [aria-label*="mute" i], [aria-label*="unmute" i], [aria-label*="tiếng" i], [aria-label*="âm thanh" i]),
        [role="button"]:not(.ig-vctl-btn):is([aria-label*="audio" i], [aria-label*="sound" i], [aria-label*="volume" i], [aria-label*="mute" i], [aria-label*="unmute" i], [aria-label*="tiếng" i], [aria-label*="âm thanh" i]),
        button:not(.ig-vctl-btn):has(svg:is([aria-label*="audio" i], [aria-label*="sound" i], [aria-label*="volume" i], [aria-label*="mute" i], [aria-label*="unmute" i], [aria-label*="tiếng" i], [aria-label*="âm thanh" i])),
        [role="button"]:not(.ig-vctl-btn):has(svg:is([aria-label*="audio" i], [aria-label*="sound" i], [aria-label*="volume" i], [aria-label*="mute" i], [aria-label*="unmute" i], [aria-label*="tiếng" i], [aria-label*="âm thanh" i]))
      `);
      if (hasNativeControls && cur.contains(video)) {
        return cur;
      }

      if (vW > 0 && vH > 0 && Math.abs(cW - vW) < 30 && Math.abs(cH - vH) < 30) {
        best = cur;
      }
      cur = cur.parentElement;
    }
    return best || video.parentElement;
  }

  function detachVideoController(video) {
    if (!video) return;
    if (video._controllerCleanup) {
      try {
        video._controllerCleanup();
      } catch (_) { }
      video._controllerCleanup = null;
    }
    if (video._controllerEl) {
      video._controllerEl.remove();
      video._controllerEl = null;
    }
    if (video._miniProgressEl) {
      video._miniProgressEl.remove();
      video._miniProgressEl = null;
    }
    if (video._vctlContainer) {
      try {
        video._vctlContainer.removeAttribute('data-ig-vctl-container');
        video._vctlContainer.classList.remove('vctl-active');
      } catch (_) { }
      video._vctlContainer = null;
    }
    video._hasCustomController = false;
  }

  function attachVideoController(video) {
    if (!video || video._hasCustomController || !video.isConnected) return;
    if (window.location.pathname.includes('/stories/')) return;

    const w = video.offsetWidth || video.videoWidth || 0;
    const h = video.offsetHeight || video.videoHeight || 0;
    if (w < 100 || h < 100) return;
    if (video.closest('header') || video.closest('nav') || video.closest('aside')) return;

    const container = findVideoContainer(video);
    if (!container) return;

    video._hasCustomController = true;
    video._vctlContainer = container;

    // Đánh dấu container để CSS kích hoạt slide-up/slide-down mượt mà
    container.setAttribute('data-ig-vctl-container', 'true');
    if (container.style.position === 'static' || !container.style.position) {
      container.style.position = 'relative';
    }

    container.querySelectorAll('.ig-video-controller, .ig-vctl-mini-progress').forEach(el => el.remove());

    // Ẩn triệt để nút loa mặc định của Instagram khi đã có controller tùy chỉnh
    const hideNativeAudioButtons = () => {
      const scopes = [
        container,
        container.parentElement,
        container.parentElement?.parentElement,
        container.closest('article'),
        container.closest('div[role="dialog"]'),
        container.closest('main')
      ];
      scopes.forEach(sc => {
        if (!sc) return;
        const candidates = sc.querySelectorAll('button:not(.ig-vctl-btn), [role="button"]:not(.ig-vctl-btn)');
        candidates.forEach(el => {
          if (el.closest('.ig-video-controller')) return;
          const label = (
            (el.getAttribute('aria-label') || '') + ' ' +
            (el.querySelector('svg')?.getAttribute('aria-label') || '') + ' ' +
            (el.querySelector('title')?.textContent || '')
          ).toLowerCase();

          if (/audio|sound|volume|mute|unmute|âm thanh|tiếng|tắt tiếng|bật tiếng/i.test(label)) {
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('visibility', 'hidden', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            el.setAttribute('data-ig-native-audio-hidden', 'true');
          }
        });
      });

      // Phương án dự phòng quét theo tọa độ góc dưới bên phải video (nếu Instagram đổi nhãn hoặc không có nhãn)
      try {
        const vRect = video.getBoundingClientRect();
        if (vRect.width > 0 && vRect.height > 0) {
          const root = container.closest('article') || container.closest('div[role="dialog"]') || container.parentElement || container;
          root.querySelectorAll('button:not(.ig-vctl-btn), [role="button"]:not(.ig-vctl-btn)').forEach(el => {
            if (el.closest('.ig-video-controller')) return;
            if (el.getAttribute('data-ig-native-audio-hidden') === 'true') return;
            const eRect = el.getBoundingClientRect();
            const isBottomRight = (
              eRect.width > 0 && eRect.width <= 65 &&
              eRect.height > 0 && eRect.height <= 65 &&
              eRect.right <= vRect.right + 25 &&
              eRect.right >= vRect.right - 90 &&
              eRect.bottom <= vRect.bottom + 25 &&
              eRect.bottom >= vRect.bottom - 90
            );
            if (isBottomRight && el.querySelector('svg')) {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('opacity', '0', 'important');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
              el.setAttribute('data-ig-native-audio-hidden', 'true');
            }
          });
        }
      } catch (_) { }
    };

    hideNativeAudioButtons();
    setTimeout(hideNativeAudioButtons, 100);
    setTimeout(hideNativeAudioButtons, 300);
    setTimeout(hideNativeAudioButtons, 700);
    setTimeout(hideNativeAudioButtons, 1500);

    const nativeAudioObserver = new MutationObserver(() => {
      hideNativeAudioButtons();
    });
    try {
      nativeAudioObserver.observe(container, { childList: true, subtree: true });
      if (container.parentElement) {
        nativeAudioObserver.observe(container.parentElement, { childList: true, subtree: true });
      }
    } catch (_) { }

    // 1. Tạo vạch tiến trình mini (hiển thị mỏng ở đáy khi ẩn thanh điều khiển)
    const miniProgress = document.createElement('div');
    miniProgress.className = 'ig-vctl-mini-progress';
    miniProgress.innerHTML = `<div class="ig-vctl-mini-fill"></div>`;
    const miniFill = miniProgress.querySelector('.ig-vctl-mini-fill');
    container.appendChild(miniProgress);
    video._miniProgressEl = miniProgress;

    // 2. Tạo Controller chính
    const controller = document.createElement('div');
    controller.className = 'ig-video-controller';
    video._controllerEl = controller;

    controller.innerHTML = `
      <div class="ig-vctl-progress-container" title="Kéo hoặc bấm để tua video">
        <div class="ig-vctl-progress-track">
          <div class="ig-vctl-progress-buffer"></div>
          <div class="ig-vctl-progress-hover"></div>
          <div class="ig-vctl-progress-fill"></div>
          <div class="ig-vctl-progress-thumb"></div>
        </div>
        <div class="ig-vctl-time-bubble">0:00</div>
      </div>
      <div class="ig-vctl-row">
        <div class="ig-vctl-left">
          <button class="ig-vctl-btn ig-vctl-play-btn" type="button" title="Phát / Tạm dừng (Space)">
            ${video.paused ? SVG_PLAY : SVG_PAUSE}
          </button>
          <button class="ig-vctl-btn ig-vctl-rewind-btn" type="button" title="Tua lùi 5 giây (←)">
            ${SVG_REWIND_5}
          </button>
          <button class="ig-vctl-btn ig-vctl-forward-btn" type="button" title="Tua tới 5 giây (→)">
            ${SVG_FORWARD_5}
          </button>
          <div class="ig-vctl-vol-group">
            <button class="ig-vctl-btn ig-vctl-vol-btn" type="button" title="Bật / Tắt tiếng (M)">
              ${(video.muted || video.volume === 0) ? SVG_SPEAKER_MUTED : SVG_SPEAKER_ON}
            </button>
            <div class="ig-vctl-vol-slider-wrap">
              <input type="range" class="ig-vctl-vol-slider" min="0" max="1" step="0.05" value="${video.muted ? 0 : video.volume}">
            </div>
          </div>
          <div class="ig-vctl-time-display">
            <span class="ig-vctl-cur-time">${formatTime(video.currentTime || 0)}</span>
            <span class="ig-vctl-time-sep">/</span>
            <span class="ig-vctl-dur-time">${formatTime(video.duration || 0)}</span>
          </div>
        </div>
        <div class="ig-vctl-right">
          <select class="ig-vctl-speed-select" title="Tốc độ phát video">
            ${SPEED_OPTIONS.map(spd => `<option value="${spd}" ${(video.playbackRate || 1) === spd ? 'selected' : ''}>${spd}x</option>`).join('')}
          </select>
          <button class="ig-vctl-btn ig-vctl-fullscreen-btn" type="button" title="Toàn màn hình">
            ${SVG_FULLSCREEN}
          </button>
          <button class="ig-vctl-btn ig-vctl-dl-btn" type="button" title="Tải video này về máy">
            ${SVG_DOWNLOAD}
          </button>
        </div>
      </div>
    `;

    container.appendChild(controller);

    const progressContainer = controller.querySelector('.ig-vctl-progress-container');
    const progressTrack = controller.querySelector('.ig-vctl-progress-track');
    const bufferBar = controller.querySelector('.ig-vctl-progress-buffer');
    const hoverBar = controller.querySelector('.ig-vctl-progress-hover');
    const fillBar = controller.querySelector('.ig-vctl-progress-fill');
    const thumbEl = controller.querySelector('.ig-vctl-progress-thumb');
    const timeBubble = controller.querySelector('.ig-vctl-time-bubble');

    const playBtn = controller.querySelector('.ig-vctl-play-btn');
    const rewindBtn = controller.querySelector('.ig-vctl-rewind-btn');
    const forwardBtn = controller.querySelector('.ig-vctl-forward-btn');
    const curTimeEl = controller.querySelector('.ig-vctl-cur-time');
    const durTimeEl = controller.querySelector('.ig-vctl-dur-time');

    const speedSelect = controller.querySelector('.ig-vctl-speed-select');
    const volBtn = controller.querySelector('.ig-vctl-vol-btn');
    const volSlider = controller.querySelector('.ig-vctl-vol-slider');
    const fullscreenBtn = controller.querySelector('.ig-vctl-fullscreen-btn');
    const dlBtn = controller.querySelector('.ig-vctl-dl-btn');

    let isDragging = false;
    let wasPlayingBeforeDrag = false;
    let cachedTrackRect = null;
    let hideTimer = null;
    let savedVolume = video.volume > 0 ? video.volume : 0.8;

    const showControls = () => {
      container.classList.add('vctl-active');
      controller.classList.add('is-active');
      clearTimeout(hideTimer);
      if (!video.paused && !isDragging) {
        hideTimer = setTimeout(() => {
          if (!video.paused && !isDragging && !controller.matches(':hover') && !container.matches(':hover')) {
            container.classList.remove('vctl-active');
            controller.classList.remove('is-active');
          }
        }, 2200);
      }
    };

    const hideControlsImmediate = (e) => {
      clearTimeout(hideTimer);
      if (e?.relatedTarget && (container.contains(e.relatedTarget) || controller.contains(e.relatedTarget))) {
        return;
      }
      if (!video.paused && !isDragging) {
        container.classList.remove('vctl-active');
        controller.classList.remove('is-active');
      }
    };

    container.addEventListener('pointerenter', showControls);
    container.addEventListener('pointermove', showControls);
    container.addEventListener('pointerleave', hideControlsImmediate);
    video.addEventListener('pointerenter', showControls);
    video.addEventListener('pointermove', showControls);
    video.addEventListener('pointerleave', hideControlsImmediate);
    controller.addEventListener('pointerenter', showControls);
    controller.addEventListener('pointermove', showControls);
    controller.addEventListener('pointerleave', hideControlsImmediate);

    // Ngăn chặn sự kiện tương tác trên toolbar nổi bọt lên các lớp cha/overlay của Instagram (ở bubbling phase để các nút con hoạt động bình thường)
    const stopBubble = (e) => {
      // TUYỆT ĐỐI KHÔNG chặn pointerup, pointercancel, mouseup - để window luôn bắt được sự kiện nhả chuột!
      if (e.type === 'pointerup' || e.type === 'pointercancel' || e.type === 'mouseup') return;
      e.stopPropagation();
    };
    controller.addEventListener('click', stopBubble);
    controller.addEventListener('pointerdown', stopBubble);
    controller.addEventListener('mousedown', stopBubble);
    controller.addEventListener('touchstart', stopBubble, { passive: true });

    let rafTicker = null;
    const startTicker = () => {
      stopTicker();
      const tick = () => {
        if (!video.paused && !video.ended) {
          updateProgressUI();
          rafTicker = requestAnimationFrame(tick);
        }
      };
      rafTicker = requestAnimationFrame(tick);
    };
    const stopTicker = () => {
      if (rafTicker) {
        cancelAnimationFrame(rafTicker);
        rafTicker = null;
      }
    };

    const updateProgressUI = () => {
      if (isDragging) return;
      const cur = video.currentTime || 0;
      const dur = video.duration || 0;
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;

      fillBar.style.setProperty('width', `${pct}%`, 'important');
      thumbEl.style.setProperty('left', `${pct}%`, 'important');
      if (miniFill) miniFill.style.setProperty('width', `${pct}%`, 'important');

      curTimeEl.textContent = formatTime(cur);
      if (dur > 0) durTimeEl.textContent = formatTime(dur);

      if (video.buffered && video.buffered.length > 0 && dur > 0) {
        try {
          const bufEnd = video.buffered.end(video.buffered.length - 1);
          const bufPct = Math.min(100, Math.max(0, (bufEnd / dur) * 100));
          bufferBar.style.setProperty('width', `${bufPct}%`, 'important');
        } catch (_) { }
      }
    };

    const getScrubPct = (clientX) => {
      const rect = cachedTrackRect || progressTrack.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const updateScrubDisplay = (pct) => {
      const dur = video.duration || 0;
      if (dur > 0) {
        try {
          video.currentTime = pct * dur;
        } catch (_) { }
      }
      const pctStr = `${(pct * 100).toFixed(2)}%`;
      fillBar.style.setProperty('width', pctStr, 'important');
      thumbEl.style.setProperty('left', pctStr, 'important');
      if (miniFill) miniFill.style.setProperty('width', pctStr, 'important');
      curTimeEl.textContent = formatTime(pct * dur);

      timeBubble.textContent = formatTime(pct * dur);
      timeBubble.style.setProperty('left', pctStr, 'important');
      timeBubble.style.opacity = '1';
    };

    const onScrubMove = (e) => {
      if (!isDragging) return;
      // QUAN TRỌNG NHẤT: Nếu chuột di chuyển mà không hề nhấn giữ phím chuột trái (e.buttons === 0),
      // ngay lập tức ngắt trạng thái kéo, tuyệt đối không để thanh trượt bám theo chuột!
      if (e.buttons === 0 || (e.buttons !== undefined && (e.buttons & 1) === 0)) {
        onScrubEnd(e);
        return;
      }
      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const pct = getScrubPct(clientX);
      updateScrubDisplay(pct);
    };

    const onScrubEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      controller.classList.remove('is-dragging');
      progressContainer.classList.remove('is-dragging');
      cachedTrackRect = null;

      if (e && e.pointerId !== undefined) {
        try { progressContainer.releasePointerCapture(e.pointerId); } catch (_) { }
      }

      window.removeEventListener('pointermove', onScrubMove, true);
      window.removeEventListener('pointerup', onScrubEnd, true);
      window.removeEventListener('pointercancel', onScrubEnd, true);
      window.removeEventListener('mouseup', onScrubEnd, true);
      window.removeEventListener('blur', onScrubEnd, true);
      progressContainer.removeEventListener('pointerup', onScrubEnd);
      progressContainer.removeEventListener('pointercancel', onScrubEnd);

      if (!progressContainer.matches(':hover')) {
        timeBubble.style.opacity = '0';
        if (hoverBar) hoverBar.style.setProperty('width', '0%', 'important');
      }

      if (wasPlayingBeforeDrag) {
        wasPlayingBeforeDrag = false;
        video.play().catch(() => { });
      }

      showControls();
    };

    const onScrubStart = (e) => {
      // Chỉ nhận chuột trái (button === 0) hoặc touch
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      isDragging = true;
      wasPlayingBeforeDrag = !video.paused;
      if (wasPlayingBeforeDrag) {
        video.pause();
      }

      controller.classList.add('is-dragging');
      progressContainer.classList.add('is-dragging');
      cachedTrackRect = progressTrack.getBoundingClientRect();

      try {
        progressContainer.setPointerCapture(e.pointerId);
      } catch (_) { }

      const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
      const pct = getScrubPct(clientX);
      updateScrubDisplay(pct);

      // Đăng ký toàn cục ở capture phase để đón sự kiện nhả chuột dù chuột ở bất cứ đâu trên màn hình
      window.addEventListener('pointermove', onScrubMove, true);
      window.addEventListener('pointerup', onScrubEnd, true);
      window.addEventListener('pointercancel', onScrubEnd, true);
      window.addEventListener('mouseup', onScrubEnd, true);
      window.addEventListener('blur', onScrubEnd, true);
      progressContainer.addEventListener('pointerup', onScrubEnd);
      progressContainer.addEventListener('pointercancel', onScrubEnd);
    };

    progressContainer.addEventListener('pointerdown', onScrubStart);
    progressContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    progressContainer.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Hover preview (vạch ghost mờ và bong bóng thời gian giống YouTube)
    progressContainer.addEventListener('pointerenter', () => {
      timeBubble.style.opacity = '1';
    });

    progressContainer.addEventListener('pointerleave', () => {
      if (!isDragging) {
        timeBubble.style.opacity = '0';
        if (hoverBar) hoverBar.style.setProperty('width', '0%', 'important');
      }
    });

    progressContainer.addEventListener('pointermove', (e) => {
      if (isDragging) return;
      const rect = progressTrack.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = video.duration || 0;
      const pctStr = `${(pct * 100).toFixed(1)}%`;

      if (hoverBar) {
        hoverBar.style.setProperty('width', pctStr, 'important');
      }
      timeBubble.textContent = formatTime(pct * dur);
      timeBubble.style.setProperty('left', pctStr, 'important');
      timeBubble.style.opacity = '1';
    });

    playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (video.paused) video.play().catch(() => { });
      else video.pause();
    });

    rewindBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      video.currentTime = Math.max(0, (video.currentTime || 0) - 5);
      showControls();
    });

    forwardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dur = video.duration || Infinity;
      video.currentTime = Math.min(dur, (video.currentTime || 0) + 5);
      showControls();
    });

    speedSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      const newSpeed = parseFloat(speedSelect.value);
      video.playbackRate = newSpeed;
      showControls();
    });

    const updateVolumeUI = () => {
      const isMuted = video.muted || video.volume === 0;
      volBtn.innerHTML = isMuted ? SVG_SPEAKER_MUTED : SVG_SPEAKER_ON;
      volSlider.value = isMuted ? 0 : video.volume;
    };

    volBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (video.muted || video.volume === 0) {
        video._userMuted = false;
        video.muted = false;
        video.volume = savedVolume > 0 ? savedVolume : (config.volume || 0.8);
      } else {
        video._userMuted = true;
        savedVolume = video.volume;
        video.muted = true;
      }
      updateVolumeUI();
      showControls();
    });

    volSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const val = parseFloat(volSlider.value);
      video.volume = val;
      if (val === 0) {
        video.muted = true;
        video._userMuted = true;
      } else {
        video.muted = false;
        video._userMuted = false;
        savedVolume = val;
      }
      updateVolumeUI();
      showControls();
    });

    fullscreenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const fsEl = document.fullscreenElement;
      if (!fsEl) {
        if (container.requestFullscreen) {
          container.requestFullscreen().catch(() => video.requestFullscreen?.());
        } else if (video.requestFullscreen) {
          video.requestFullscreen();
        }
      } else {
        document.exitFullscreen?.();
      }
    });

    dlBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dlBtn._isDownloading) return;
      dlBtn._isDownloading = true;

      const origHtml = dlBtn.innerHTML;
      dlBtn.innerHTML = SVG_SPINNER;
      dlBtn.classList.add('downloading');

      try {
        let videoUrl = video.currentSrc || video.src;
        const post = container.closest('article') || container.closest('div[role="dialog"]');
        const shortcode = (post ? getShortcodeFromPost(post) : null) || getPageShortcode();
        if (shortcode) {
          const items = await requestPostMedia(shortcode);
          const vidItem = items.find(i => i.type === 'video');
          if (vidItem?.url) videoUrl = vidItem.url;
        }

        if (videoUrl) {
          await downloadUrlAsBlob(videoUrl, `instagram_${shortcode || 'video'}.mp4`);
          dlBtn.innerHTML = SVG_CHECKMARK;
          setTimeout(() => {
            dlBtn.innerHTML = origHtml;
            dlBtn.classList.remove('downloading');
            dlBtn._isDownloading = false;
          }, 2000);
        } else {
          dlBtn.innerHTML = origHtml;
          dlBtn.classList.remove('downloading');
          dlBtn._isDownloading = false;
        }
      } catch (_) {
        dlBtn.innerHTML = origHtml;
        dlBtn.classList.remove('downloading');
        dlBtn._isDownloading = false;
      }
    });

    const onPlay = () => {
      playBtn.innerHTML = SVG_PAUSE;
      controller.classList.remove('is-paused');
      ensureVideoUnmuted(video);
      showControls();
      startTicker();
    };

    const onPause = () => {
      playBtn.innerHTML = SVG_PLAY;
      controller.classList.add('is-paused');
      controller.classList.add('is-active');
      stopTicker();
      updateProgressUI();
    };

    const onEnded = () => {
      playBtn.innerHTML = SVG_PLAY;
      controller.classList.add('is-paused');
      controller.classList.add('is-active');
      stopTicker();
      updateProgressUI();
    };

    video.addEventListener('timeupdate', updateProgressUI);
    video.addEventListener('progress', updateProgressUI);
    video.addEventListener('loadedmetadata', updateProgressUI);
    video.addEventListener('durationchange', updateProgressUI);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('volumechange', updateVolumeUI);
    video.addEventListener('play', hideNativeAudioButtons);
    video.addEventListener('playing', hideNativeAudioButtons);
    video.addEventListener('pause', hideNativeAudioButtons);
    container.addEventListener('pointerenter', hideNativeAudioButtons);

    // DỌN DẸP SẠCH SẼ TẤT CẢ EVENT LISTENER KHI VIDEO RA KHỎI VIEWPORT HOẶC BỊ HỦY (CHỐNG LEAK RAM)
    video._controllerCleanup = () => {
      stopTicker();
      if (isDragging) {
        onScrubEnd();
      }
      try { nativeAudioObserver.disconnect(); } catch (_) { }
      window.removeEventListener('pointermove', onScrubMove, true);
      window.removeEventListener('pointerup', onScrubEnd, true);
      window.removeEventListener('pointercancel', onScrubEnd, true);
      window.removeEventListener('mouseup', onScrubEnd, true);
      window.removeEventListener('blur', onScrubEnd, true);
      video.removeEventListener('timeupdate', updateProgressUI);
      video.removeEventListener('progress', updateProgressUI);
      video.removeEventListener('loadedmetadata', updateProgressUI);
      video.removeEventListener('durationchange', updateProgressUI);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('volumechange', updateVolumeUI);
      video.removeEventListener('play', hideNativeAudioButtons);
      video.removeEventListener('playing', hideNativeAudioButtons);
      video.removeEventListener('pause', hideNativeAudioButtons);
      container.removeEventListener('pointerenter', hideNativeAudioButtons);
      video.removeEventListener('pointerenter', showControls);
      video.removeEventListener('pointermove', showControls);
      video.removeEventListener('pointerleave', hideControlsImmediate);
      container.removeEventListener('pointerenter', showControls);
      container.removeEventListener('pointermove', showControls);
      container.removeEventListener('pointerleave', hideControlsImmediate);
      controller.removeEventListener('pointerenter', showControls);
      controller.removeEventListener('pointermove', showControls);
      controller.removeEventListener('pointerleave', hideControlsImmediate);
      clearTimeout(hideTimer);
    };

    ensureVideoUnmuted(video);
    if (!video.paused) {
      startTicker();
    } else {
      controller.classList.add('is-paused');
      controller.classList.add('is-active');
    }
    updateProgressUI();
    updateVolumeUI();
  }

  // GLOBAL FULLSCREEN LISTENER (Chỉ đăng ký 1 lần duy nhất, không nhân bản theo từng video)
  document.addEventListener('fullscreenchange', () => {
    const fsEl = document.fullscreenElement;
    document.querySelectorAll('.ig-vctl-fullscreen-btn').forEach(btn => {
      const isFs = Boolean(fsEl && (fsEl.contains(btn) || btn.closest(fsEl.tagName)));
      btn.innerHTML = isFs ? SVG_FULLSCREEN_EXIT : SVG_FULLSCREEN;
    });
  });

  // VIRTUAL SCROLLING OBSERVER CHO VIDEO (CHỈ GẮN CONTROLLER CHO VIDEO ĐANG Ở TRONG VIEWPORT)
  const videoIntersectionObserver = (typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target;
        if (entry.isIntersecting) {
          if (!video._hasCustomController && video.isConnected) {
            attachVideoController(video);
          }
        } else {
          // Khi video cuộn ra xa khỏi màn hình -> tháo gỡ controller giải phóng RAM tức thì!
          if (video._hasCustomController) {
            detachVideoController(video);
          }
        }
      });
    }, {
      rootMargin: '250px 0px 250px 0px',
      threshold: 0.05
    })
    : null;

  function scanAndAttachVideoControllers() {
    if (window.location.pathname.includes('/stories/')) {
      return;
    }

    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      if (video._isObservedByController) {
        if (video._hasCustomController && !video.isConnected) {
          detachVideoController(video);
        }
        continue;
      }

      if (video.closest('header') || video.closest('nav') || video.closest('aside')) continue;

      video._isObservedByController = true;
      if (videoIntersectionObserver) {
        videoIntersectionObserver.observe(video);
      } else {
        attachVideoController(video);
      }
    }
  }

  // --- 8.1. THANH TRƯỢT STORY & HIGHLIGHTS (v2.5.0 - Thanh đỉnh chuyên biệt 100% không bị vỡ vạch) ---
  let activeStoryScrubber = null;

  function scanAndAttachStoryScrubber() {
    // 1. Dọn dẹp triệt để bất kỳ thanh đáy cũ và badge cũ nếu còn sót lại
    const oldBar = document.querySelector('.ig-story-scrubber-bar');
    if (oldBar) oldBar.remove();
    const oldTopTime = document.querySelector('.ig-story-top-time');
    if (oldTopTime) oldTopTime.remove();

    if (!window.location.pathname.includes('/stories/')) {
      if (activeStoryScrubber) {
        if (activeStoryScrubber.cleanup) activeStoryScrubber.cleanup();
        activeStoryScrubber = null;
      }
      const t = document.querySelector('.ig-story-header-time');
      if (t) t.remove();
      const topBar = document.querySelector('.ig-story-top-progress-bar');
      if (topBar) topBar.remove();
      return;
    }

    const storyVideo = getActiveStoryVideo();
    if (!storyVideo) {
      const t = document.querySelector('.ig-story-header-time');
      if (t) t.style.display = 'none';
      const topBar = document.querySelector('.ig-story-top-progress-bar');
      if (topBar) topBar.style.display = 'none';
      return;
    }

    ensureVideoUnmuted(storyVideo);

    const progressContainer = findStoryProgressBarContainer();
    if (!progressContainer) return;

    const currentSlideIndex = getActiveStorySlideIndex();

    // Nếu đã gắn đúng video, progress container và slide index này thì chỉ cập nhật UI
    if (activeStoryScrubber &&
        activeStoryScrubber.video === storyVideo &&
        activeStoryScrubber.container === progressContainer &&
        activeStoryScrubber.slideIndex === currentSlideIndex) {
      if (activeStoryScrubber.updateUI) activeStoryScrubber.updateUI();
      return;
    }

    // Nếu video hoặc slide thay đổi -> gỡ bỏ listener cũ
    if (activeStoryScrubber?.cleanup) {
      activeStoryScrubber.cleanup();
    }

    // 2. Trả nguyên các vạch - - - - của Instagram gốc về vị trí cũ (hoàn toàn không can thiệp hay ẩn)
    progressContainer.classList.remove('ig-story-native-progress-hidden');
    progressContainer.style.removeProperty('display');
    progressContainer.style.removeProperty('visibility');
    progressContainer.style.removeProperty('opacity');
    progressContainer.style.removeProperty('height');

    // 3. Đưa thanh tiến trình custom lên trên hẳn sát mép đỉnh của Story (phía trên các vạch gốc)
    let topBar = document.querySelector('.ig-story-top-progress-bar');
    if (!topBar) {
      topBar = document.createElement('div');
      topBar.className = 'ig-story-top-progress-bar';
      topBar.title = 'Kéo hoặc bấm để tua Story';
      topBar.innerHTML = `
        <div class="ig-story-top-track">
          <div class="ig-story-top-hover"></div>
          <div class="ig-story-top-fill"></div>
          <div class="ig-story-top-thumb"></div>
        </div>
        <div class="ig-story-top-tooltip">0:00</div>
      `;
    }
    topBar.style.display = 'flex';

    // Đính vào container cha chứa progress bar ở sát mép trên cùng
    const mountParent = progressContainer.parentElement;
    if (mountParent) {
      const pos = window.getComputedStyle(mountParent).position;
      if (pos === 'static' || !pos) {
        mountParent.style.position = 'relative';
      }
      if (topBar.parentElement !== mountParent) {
        mountParent.appendChild(topBar);
      }
    }

    const track = topBar.querySelector('.ig-story-top-track');
    const hover = topBar.querySelector('.ig-story-top-hover');
    const fill = topBar.querySelector('.ig-story-top-fill');
    const thumb = topBar.querySelector('.ig-story-top-thumb');
    const tooltip = topBar.querySelector('.ig-story-top-tooltip');

    // 4. Ẩn nút Loa mặc định trong Header Story (do đã auto phát âm thanh/nhạc)
    const hideStorySpeakerButtons = () => {
      document.querySelectorAll('header button, div[role="dialog"] button, section header button, div[role="button"]').forEach(btn => {
        if (btn.classList.contains('ig-story-download-btn') || btn.classList.contains('ig-vctl-btn')) return;
        const rect = btn.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < 220 && rect.width >= 10 && rect.height >= 10) {
          const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
          const svgAria = (btn.querySelector('svg')?.getAttribute('aria-label') || '').toLowerCase();
          const title = (btn.getAttribute('title') || '').toLowerCase();
          const label = `${aria} ${svgAria} ${title}`;
          if (/audio|mute|sound|tiếng|âm thanh/i.test(label)) {
            btn.style.setProperty('display', 'none', 'important');
            btn.style.setProperty('visibility', 'hidden', 'important');
            btn.style.setProperty('opacity', '0', 'important');
            btn.style.setProperty('pointer-events', 'none', 'important');
            btn.setAttribute('data-ig-story-speaker-hidden', 'true');
          }
        }
      });
    };
    hideStorySpeakerButtons();

    // 5. Hiển thị thời gian trực tiếp trong hàng Action Header Story (nằm trước nút Play/Pause)
    const attachHeaderTime = () => {
      hideStorySpeakerButtons();
      const controls = findStoryControlsContainer();
      if (!controls || !controls.parent) return null;

      let timeEl = controls.parent.querySelector('.ig-story-header-time');
      if (!timeEl) {
        timeEl = document.createElement('div');
        timeEl.className = 'ig-story-header-time';
        timeEl.innerHTML = `<span class="ig-story-sc-cur">0:00</span><span class="ig-story-sc-sep">/</span><span class="ig-story-sc-dur">0:00</span>`;
      }

      // Đưa time vào trước nút Pause (hoặc trước Download / Options)
      const anchor = (controls.pauseBtn && controls.pauseBtn.parentElement === controls.parent) ? controls.pauseBtn :
                     (controls.optionsBtn && controls.optionsBtn.parentElement === controls.parent) ? controls.optionsBtn :
                     controls.parent.querySelector('.ig-story-download-btn') || controls.parent.firstElementChild;

      if (anchor && anchor !== timeEl) {
        if (timeEl.nextSibling !== anchor) {
          controls.parent.insertBefore(timeEl, anchor);
        }
      } else if (timeEl.parentElement !== controls.parent) {
        controls.parent.prepend(timeEl);
      }

      timeEl.style.display = 'inline-flex';
      return timeEl;
    };

    const timeBadge = attachHeaderTime();
    const curEl = timeBadge?.querySelector('.ig-story-sc-cur');
    const durEl = timeBadge?.querySelector('.ig-story-sc-dur');

    let isDraggingStory = false;

    // 6. Xử lý thao tác kéo hoặc bấm tua trên thanh đỉnh chuyên biệt
    const applyScrub = (clientX) => {
      const trackRect = track.getBoundingClientRect();
      if (trackRect.width <= 0) return;
      const rawPct = (clientX - trackRect.left) / trackRect.width;
      const pct = Math.max(0, Math.min(0.995, rawPct));
      const dur = storyVideo.duration || 0;
      if (dur > 0) {
        storyVideo.currentTime = pct * dur;
      }
      const pct100 = (pct * 100).toFixed(2) + '%';
      if (fill) fill.style.setProperty('width', pct100, 'important');
      if (thumb) thumb.style.setProperty('left', pct100, 'important');
      if (tooltip) {
        tooltip.style.setProperty('left', pct100, 'important');
        tooltip.textContent = formatTime(pct * dur);
        tooltip.style.opacity = '1';
      }
      const badge = attachHeaderTime();
      const currentCurEl = badge?.querySelector('.ig-story-sc-cur') || curEl;
      if (currentCurEl) currentCurEl.textContent = formatTime(pct * dur);
    };

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();

      isDraggingStory = true;
      topBar.classList.add('is-dragging');
      applyScrub(e.clientX);

      const onPointerMove = (moveEvt) => {
        if (!isDraggingStory) return;
        if (moveEvt.buttons === 0 || (moveEvt.buttons !== undefined && (moveEvt.buttons & 1) === 0)) {
          onPointerUp(moveEvt);
          return;
        }
        applyScrub(moveEvt.clientX);
      };

      const onPointerUp = () => {
        if (!isDraggingStory) return;
        isDraggingStory = false;
        topBar.classList.remove('is-dragging');
        if (tooltip && !topBar.matches(':hover')) tooltip.style.opacity = '0';
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerUp, true);
        window.removeEventListener('mouseup', onPointerUp, true);
        window.removeEventListener('blur', onPointerUp, true);
      };

      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      window.addEventListener('mouseup', onPointerUp, true);
      window.addEventListener('blur', onPointerUp, true);
    };

    const onPointerHoverMove = (e) => {
      if (isDraggingStory) return;
      const trackRect = track.getBoundingClientRect();
      if (trackRect.width <= 0) return;
      const rawPct = (e.clientX - trackRect.left) / trackRect.width;
      const pct = Math.max(0, Math.min(1, rawPct));
      const dur = storyVideo.duration || 0;
      const pct100 = (pct * 100).toFixed(2) + '%';
      if (hover) hover.style.setProperty('width', pct100, 'important');
      if (tooltip) {
        tooltip.style.setProperty('left', pct100, 'important');
        tooltip.textContent = formatTime(pct * dur);
        tooltip.style.opacity = '1';
      }
    };

    const onPointerLeave = () => {
      if (!isDraggingStory) {
        if (hover) hover.style.setProperty('width', '0%', 'important');
        if (tooltip) tooltip.style.opacity = '0';
      }
    };

    const stopCapture = (e) => {
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    topBar.addEventListener('pointerdown', onPointerDown, true);
    topBar.addEventListener('mousedown', stopCapture, true);
    topBar.addEventListener('click', stopCapture, true);
    topBar.addEventListener('pointermove', onPointerHoverMove);
    topBar.addEventListener('pointerleave', onPointerLeave);

    const updateStoryUI = () => {
      const latestSlideIdx = getActiveStorySlideIndex();
      if (latestSlideIdx !== currentSlideIndex) {
        scanAndAttachStoryScrubber();
        return;
      }

      if (isDraggingStory) return;
      const cur = storyVideo.currentTime || 0;
      const dur = storyVideo.duration || 0;
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      const pctStr = `${pct.toFixed(2)}%`;

      if (fill) fill.style.setProperty('width', pctStr, 'important');
      if (thumb) thumb.style.setProperty('left', pctStr, 'important');

      const badge = attachHeaderTime();
      const currentCurEl = badge?.querySelector('.ig-story-sc-cur') || curEl;
      const currentDurEl = badge?.querySelector('.ig-story-sc-dur') || durEl;

      if (currentCurEl) currentCurEl.textContent = formatTime(cur);
      if (currentDurEl && dur > 0) currentDurEl.textContent = formatTime(dur);
    };

    storyVideo.addEventListener('timeupdate', updateStoryUI);
    storyVideo.addEventListener('loadedmetadata', updateStoryUI);
    storyVideo.addEventListener('durationchange', updateStoryUI);

    activeStoryScrubber = {
      video: storyVideo,
      container: progressContainer,
      slideIndex: currentSlideIndex,
      updateUI: updateStoryUI,
      cleanup: () => {
        storyVideo.removeEventListener('timeupdate', updateStoryUI);
        storyVideo.removeEventListener('loadedmetadata', updateStoryUI);
        storyVideo.removeEventListener('durationchange', updateStoryUI);

        topBar.removeEventListener('pointerdown', onPointerDown, true);
        topBar.removeEventListener('mousedown', stopCapture, true);
        topBar.removeEventListener('click', stopCapture, true);
        topBar.removeEventListener('pointermove', onPointerHoverMove);
        topBar.removeEventListener('pointerleave', onPointerLeave);

        progressContainer.classList.remove('ig-story-native-progress-hidden');
        if (topBar) topBar.style.display = 'none';

        const timeElem = document.querySelector('.ig-story-header-time');
        if (timeElem) timeElem.style.display = 'none';
      }
    };

    updateStoryUI();
  }

  // LẮNG NGHE SỰ KIỆN PHÁT CỦA MỌI VIDEO TRÊN TRANG ĐỂ TỰ ĐỘNG BẬT TIẾNG (Feed, Reels, Dialog, Stories)
  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      ensureVideoUnmuted(e.target);
    }
  }, { capture: true, passive: true });

  document.addEventListener('playing', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      ensureVideoUnmuted(e.target);
    }
  }, { capture: true, passive: true });

  // Đảm bảo kích hoạt âm thanh ngay khi người dùng tương tác lần đầu trên trang
  const onFirstUserGesture = () => {
    document.querySelectorAll('video').forEach(vid => {
      if (!vid.paused && !vid._userMuted) {
        ensureVideoUnmuted(vid);
      }
    });
  };
  window.addEventListener('pointerdown', onFirstUserGesture, { once: true, passive: true });
  window.addEventListener('keydown', onFirstUserGesture, { once: true, passive: true });

  // --- 7.2. DOWNLOAD CHO INSTAGRAM STORIES ---
  function getBestImageUrl(img) {
    if (!img) return null;
    if (img.srcset) {
      const parts = img.srcset.split(',').map(s => s.trim().split(' '));
      const sorted = parts.sort((a, b) => parseInt(b[1] || '0') - parseInt(a[1] || '0'));
      if (sorted[0] && sorted[0][0]) return sorted[0][0];
    }
    return img.currentSrc || img.src || null;
  }

  // Tìm container chứa các vạch tiến trình (progress bar) trên Stories / Highlights
  function findStoryProgressBarContainer() {
    const existing = document.querySelector('[data-ig-story-progress="true"]');
    if (existing && existing.isConnected) return existing;

    const allDivs = Array.from(document.body.querySelectorAll('div')).filter(d => {
      if (d.closest('.ig-video-controller, .ig-music-feed-bar, .ig-story-scrubber-bar, .ig-story-top-progress-bar')) return false;
      const count = d.children.length;
      if (count < 1 || count > 100) return false;
      const r = d.getBoundingClientRect();
      // Vạch tiến trình Story luôn nằm ở đỉnh (top <= 140px) và có chiều cao mảnh (height <= 25px)
      if (r.top < 0 || r.top > 140) return false;
      if (r.width < 120 || r.height > 25 || r.height < 1) return false;
      if (count > 1) {
        const c0 = d.children[0].getBoundingClientRect();
        const c1 = d.children[1].getBoundingClientRect();
        return c1.left > c0.left;
      }
      const c0 = d.children[0].getBoundingClientRect();
      return c0.width > 80 && c0.height <= 25;
    });

    if (allDivs.length === 0) return null;
    allDivs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return allDivs[0];
  }

  // Xác định số thứ tự (index) của Slide Story / Highlight đang xem dựa vào thanh tiến trình
  function getActiveStorySlideIndex() {
    const container = findStoryProgressBarContainer();
    if (!container) return 0;

    const segments = Array.from(container.children);
    const total = segments.length;
    if (total <= 1) return 0;

    // 1. Quy tắc Instagram: Segment đang active DUY NHẤT chứa thẻ con (thanh fill tiến trình đang chạy)
    const segmentsWithChild = [];
    for (let i = 0; i < total; i++) {
      if (segments[i].firstElementChild !== null || segments[i].children.length > 0) {
        segmentsWithChild.push(i);
      }
    }
    if (segmentsWithChild.length === 1) {
      return segmentsWithChild[0];
    }
    if (segmentsWithChild.length > 1) {
      // Nếu có nhiều vạch có thẻ con (vạch đã qua vẫn giữ element), tìm vạch đang animate (0 < scale < 0.999)
      for (const idx of segmentsWithChild) {
        const seg = segments[idx];
        const fill = seg.firstElementChild || seg;
        const inlineStyle = (fill.getAttribute('style') || '') + (seg.getAttribute('style') || '');
        const m = inlineStyle.match(/scaleX\(([0-9.]+)\)/i) || inlineStyle.match(/width:\s*([0-9.]+)%/i);
        if (m) {
          const val = parseFloat(m[1]);
          const norm = inlineStyle.includes('%') ? val / 100 : val;
          if (norm > 0.005 && norm < 0.995) return idx;
        }
      }
      return segmentsWithChild[segmentsWithChild.length - 1];
    }

    // 2. Dự phòng: Quét inline style / transform scaleX nếu không tìm thấy thẻ con
    for (let i = 0; i < total; i++) {
      const seg = segments[i];
      const fill = seg.firstElementChild || seg;
      const inlineStyle = (fill.getAttribute('style') || '') + (seg.getAttribute('style') || '');
      const m = inlineStyle.match(/scaleX\(([0-9.]+)\)/i) || inlineStyle.match(/width:\s*([0-9.]+)%/i);
      if (m) {
        const val = parseFloat(m[1]);
        const norm = inlineStyle.includes('%') ? val / 100 : val;
        if (norm > 0.005 && norm < 0.995) return i;
      }
      try {
        const cs = window.getComputedStyle(fill);
        const tr = cs.transform;
        if (tr && tr.startsWith('matrix')) {
          const match = tr.match(/matrix\(([0-9.-]+)/);
          if (match) {
            const scale = parseFloat(match[1]);
            if (scale > 0.005 && scale < 0.995) return i;
          }
        }
      } catch (_) { }
    }

    return 0;
  }

  // Kiểm tra xem Story đang xem có gắn sticker bài hát / âm thanh hay không
  function hasStoryMusicInHeader() {
    const header = document.querySelector('header');
    if (!header) return false;
    if (header.querySelector('a[href*="/audio/"], a[href*="/music/"], a[href*="/explore/audio/"]')) {
      return true;
    }
    const headerText = (header.textContent || '').toLowerCase();
    if (headerText.includes('♪') || headerText.includes('♫')) {
      return true;
    }
    const audioSvgs = header.querySelectorAll('svg[aria-label*="audio" i], svg[aria-label*="âm thanh" i], svg[aria-label*="music" i], svg[aria-label*="nhạc" i]');
    if (audioSvgs.length > 0) return true;
    return false;
  }

  // Tìm phần tử Ảnh của Story đang hiển thị ở TRUNG TÂM màn hình
  function getActiveStoryImage() {
    const screenCenterX = window.innerWidth / 2;

    const images = Array.from(document.querySelectorAll('img')).filter(img => {
      // 1. Loại trừ ảnh trong header, nav, aside (avatar, icon, navigation)
      if (img.closest('header') || img.closest('nav') || img.closest('aside')) return false;

      // 2. Không ẩn
      const style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

      // 3. Phải có kích thước lớn của Story (ảnh chính story luôn rộng > 120 và cao > 160)
      const r = img.getBoundingClientRect();
      const hasSize = (r.width >= 120 && r.height >= 160) || (img.naturalWidth >= 200 && img.naturalHeight >= 200);
      if (!hasSize) return false;

      // 4. Phải nằm trong viewport
      const inViewport = r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
      if (!inViewport) return false;

      // 5. Phải có src hợp lệ
      return Boolean(img.currentSrc || img.src || img.srcset);
    });

    if (images.length === 0) return null;

    // Lấy ảnh có vị trí gần trung tâm màn hình nhất, nếu tương đương lấy ảnh có diện tích lớn nhất
    images.sort((a, b) => {
      const rA = a.getBoundingClientRect();
      const rB = b.getBoundingClientRect();
      const distA = Math.abs((rA.left + rA.width / 2) - screenCenterX);
      const distB = Math.abs((rB.left + rB.width / 2) - screenCenterX);
      if (Math.abs(distA - distB) > 80) return distA - distB;
      return (rB.width * rB.height) - (rA.width * rA.height);
    });

    return images[0];
  }

  // Tìm phần tử Video của Story đang hiển thị ở TRUNG TÂM màn hình
  function getActiveStoryVideo() {
    const screenCenterX = window.innerWidth / 2;

    const videos = Array.from(document.querySelectorAll('video')).filter(v => {
      const style = window.getComputedStyle(v);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

      const r = v.getBoundingClientRect();
      if (r.width < 120 || r.height < 160) return false;

      const inViewport = r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
      return inViewport;
    });

    if (videos.length === 0) return null;

    videos.sort((a, b) => {
      if (!a.paused && b.paused) return -1;
      if (a.paused && !b.paused) return 1;
      const rA = a.getBoundingClientRect();
      const rB = b.getBoundingClientRect();
      const distA = Math.abs((rA.left + rA.width / 2) - screenCenterX);
      const distB = Math.abs((rB.left + rB.width / 2) - screenCenterX);
      if (Math.abs(distA - distB) > 80) return distA - distB;
      return (rB.width * rB.height) - (rA.width * rA.height);
    });

    return videos[0];
  }

  // Định vị chính xác media (ảnh hoặc video) của Story ĐANG HIỂN THỊ TRÊN MÀN HÌNH
  function getActiveStoryMediaElement(btn) {
    if (!btn) return null;

    // 1. Quét tìm thẻ <video> đang hiển thị trong Story (kể cả đang play hay pause)
    const visibleVideos = Array.from(document.querySelectorAll('video')).filter(v => {
      const style = window.getComputedStyle(v);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = v.getBoundingClientRect();
      const inView = r.width > 120 && r.height > 180 && r.top < window.innerHeight && r.bottom > 0;
      const hasSrc = Boolean(v.currentSrc || v.src);
      return inView && hasSrc;
    });

    if (visibleVideos.length > 0) {
      visibleVideos.sort((a, b) => {
        if (!a.paused && b.paused) return -1;
        if (a.paused && !b.paused) return 1;
        const rA = a.getBoundingClientRect();
        const rB = b.getBoundingClientRect();
        return (rB.width * rB.height) - (rA.width * rA.height);
      });
      return { type: 'video', el: visibleVideos[0] };
    }

    // 2. Nếu KHÔNG CÓ video trong viewport -> Quét tìm thẻ <img> đang hiển thị
    const visibleImages = Array.from(document.querySelectorAll('img')).filter(img => {
      if (img.closest('header') || img.closest('nav') || img.closest('aside')) return false;
      const style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const r = img.getBoundingClientRect();
      const inView = r.width > 120 && r.height > 180 && r.top < window.innerHeight && r.bottom > 0;
      const hasSize = (img.naturalWidth > 150 || r.width > 150) && (img.naturalHeight > 150 || r.height > 180);
      const hasSrc = Boolean(img.currentSrc || img.src || img.srcset);
      return inView && hasSize && hasSrc;
    });

    if (visibleImages.length > 0) {
      visibleImages.sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));
      return { type: 'image', el: visibleImages[0] };
    }

    return null;
  }

  function isDashAudioUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (
      url.includes('_audio') ||
      url.includes('dash_ln_heaac') ||
      url.includes('audio_dashinit') ||
      url.includes('dash_baseline_0_a') ||
      url.includes('baseline_0_a') ||
      url.includes('dash_r2evaac') ||
      url.includes('dash_r1gen2aac') ||
      url.includes('dash_aac') ||
      url.includes('heaac') ||
      url.includes('/audio/') ||
      url.includes('audio/mp4') ||
      url.includes('t39.1172') ||
      url.includes('/1172-') ||
      url.includes('audio_asset') ||
      url.includes('music_asset') ||
      url.includes('sound_asset')
    ) {
      return true;
    }
    const efgMatch = url.match(/[?&]efg=([a-zA-Z0-9_\-=]+)/);
    if (efgMatch) {
      try {
        const decoded = atob(efgMatch[1].replace(/-/g, '+').replace(/_/g, '/'));
        if (
          decoded.includes('audio') ||
          decoded.includes('dash_ln_heaac') ||
          decoded.includes('baseline_0_a') ||
          decoded.includes('dash_aac') ||
          decoded.includes('heaac')
        ) {
          return true;
        }
      } catch (_) { }
    }
    return false;
  }

  async function handleStoryDownload(btn) {
    if (btn._isDownloading) return;
    btn._isDownloading = true;

    const originalHtml = btn.innerHTML;
    btn.innerHTML = SVG_SPINNER;
    btn.classList.add('downloading');

    try {
      const path = window.location.pathname;
      let reelId = '';
      let username = '';
      let storyId = '';

      const highlightMatch = path.match(/\/stories\/highlights\/([^\/]+)/);
      if (highlightMatch) {
        reelId = highlightMatch[1];
        username = 'highlight';
      } else {
        const storyMatch = path.match(/\/stories\/([^\/]+)(?:\/(\d+))?/);
        if (storyMatch) {
          username = storyMatch[1];
          storyId = storyMatch[2] || '';
          reelId = username;
        }
      }

      if (!username || username === 'stories' || username === 'highlights' || username === 'highlight') {
        const header = btn.closest('header') || document.querySelector('header');
        if (header) {
          const userLinks = Array.from(header.querySelectorAll('a[href^="/"]'));
          for (const a of userLinks) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/^\/([A-Za-z0-9._]+)\/?$/);
            if (m && m[1] && !['stories', 'explore', 'reels', 'direct', 'p'].includes(m[1].toLowerCase())) {
              username = m[1];
              break;
            }
          }
          if (!username || username === 'highlight' || username === 'stories' || username === 'highlights') {
            const userEl = header.querySelector('h2, span[dir="auto"], div[dir="auto"]');
            if (userEl && userEl.textContent.trim()) {
              username = userEl.textContent.trim().replace(/^@/, '');
            }
          }
        }
        if (!username || username === 'stories' || username === 'highlights' || username === 'highlight') {
          username = 'story';
        }
      }

      const timestamp = Date.now();
      const slideIndex = getActiveStorySlideIndex();

      // =========================================================================
      // BƯỚC 1: TRUY VẤN MEDIA TỪ INJECTED.JS (CHÍNH XÁC NHẤT THEO API & FIBER)
      // =========================================================================
      const activeVid = getActiveStoryVideo();
      if (activeVid) activeVid.setAttribute('data-ig-target-story-video', 'true');

      let mediaResult = await new Promise((resolve) => {
        const onResult = (e) => {
          window.removeEventListener('__IG_ACTIVE_STORY_MEDIA_RESULT__', onResult);
          resolve(e.detail);
        };
        window.addEventListener('__IG_ACTIVE_STORY_MEDIA_RESULT__', onResult);
        setTimeout(() => {
          window.removeEventListener('__IG_ACTIVE_STORY_MEDIA_RESULT__', onResult);
          resolve(null);
        }, 2500);

        window.dispatchEvent(new CustomEvent('__IG_GET_ACTIVE_STORY_MEDIA__', {
          detail: { reelId, username, storyId, slideIndex }
        }));
      });
      if (activeVid) activeVid.removeAttribute('data-ig-target-story-video');

      // =========================================================================
      // BƯỚC 1: XỬ LÝ KẾT QUẢ TỪ INJECTED.JS (CHÍNH XÁC NHẤT)
      // =========================================================================
      if (mediaResult) {
        const user = mediaResult.user || username;
        const videoUrl = mediaResult.videoUrl || (mediaResult.type === 'video' ? mediaResult.url : null);
        const imageUrl = mediaResult.imageUrl || (mediaResult.type === 'image' ? mediaResult.url : null);

        const ok = await downloadStoryMedia({
          videoUrl,
          imageUrl,
          username: user,
          timestamp
        });
        if (ok) {
          showDownloadSuccess(btn, originalHtml);
          return;
        }
      }

      // =========================================================================
      // BƯỚC 2: DỰ PHÒNG KHI INJECTED.JS CHƯA KỊP NẠP (DOM & RESOURCE TIMING)
      // =========================================================================
      let fallbackVideoUrl = null;

      // 2.1. Nếu có video trên màn hình
      if (activeVid) {
        activeVid.setAttribute('data-ig-target-story-video', 'true');
        const videoData = await new Promise((resolve) => {
          const onResult = (e) => {
            window.removeEventListener('__IG_ACTIVE_STORY_VIDEO_RESULT__', onResult);
            resolve(e.detail);
          };
          window.addEventListener('__IG_ACTIVE_STORY_VIDEO_RESULT__', onResult);
          setTimeout(() => {
            window.removeEventListener('__IG_ACTIVE_STORY_VIDEO_RESULT__', onResult);
            resolve(null);
          }, 1500);

          window.dispatchEvent(new CustomEvent('__IG_GET_ACTIVE_STORY_VIDEO__', {
            detail: { storyId, username, slideIndex }
          }));
        });
        activeVid.removeAttribute('data-ig-target-story-video');

        if (videoData?.url && !isDashAudioUrl(videoData.url)) {
          fallbackVideoUrl = videoData.url;
        } else {
          const directUrl = activeVid.getAttribute('src') || activeVid.currentSrc || activeVid.src || '';
          if (directUrl && !directUrl.startsWith('blob:') && directUrl.startsWith('http') && !isDashAudioUrl(directUrl)) {
            fallbackVideoUrl = directUrl;
          }
        }
      }

      // 2.2. Nếu chưa có video, quét Resource Timing
      if (!fallbackVideoUrl) {
        const perfEntries = (window.performance && typeof window.performance.getEntriesByType === 'function')
          ? window.performance.getEntriesByType('resource')
          : [];
        const videoEntries = perfEntries
          .filter(r => r.name && (r.name.includes('.mp4') || r.name.includes('/o1/v/') || r.name.includes('/v/t')) && (r.name.includes('fbcdn.net') || r.name.includes('cdninstagram.com')) && !isDashAudioUrl(r.name))
          .sort((a, b) => b.startTime - a.startTime);

        if (videoEntries.length > 0) {
          fallbackVideoUrl = videoEntries[0].name.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
        }
      }

      // 2.3. Lấy ảnh DOM nếu có
      const storyImg = getActiveStoryImage();
      const domImgUrl = storyImg ? getBestImageUrl(storyImg) : null;

      // 2.4. Thực hiện tải qua downloadStoryMedia (tự động phân biệt chính xác 100% Video thật vs Ảnh kèm nhạc)
      if (fallbackVideoUrl || domImgUrl) {
        const ok = await downloadStoryMedia({
          videoUrl: fallbackVideoUrl,
          imageUrl: domImgUrl,
          username,
          timestamp
        });
        if (ok) {
          showDownloadSuccess(btn, originalHtml);
          return;
        }
      }

      console.warn('[IG Story Downloader] Không tìm thấy media Story để tải');
      btn.innerHTML = originalHtml;
      btn._isDownloading = false;
      btn.classList.remove('downloading');

    } catch (err) {
      console.error('[IG Story Downloader] Download failed:', err);
      btn.innerHTML = originalHtml;
      btn._isDownloading = false;
      btn.classList.remove('downloading');
    }
  }

  function showDownloadSuccess(btn, originalHtml) {
    btn.innerHTML = SVG_CHECKMARK;
    btn.classList.remove('downloading');
    btn.classList.add('success');
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('success');
      btn._isDownloading = false;
    }, 2200);
  }

  function findStoryControlsContainer() {
    const allButtons = Array.from(document.querySelectorAll('header button, div[role="dialog"] button, section button, button, div[role="button"]'))
      .filter(btn => {
        if (btn.classList.contains('ig-story-download-btn')) return false;
        const rect = btn.getBoundingClientRect();
        const inTopHeader = rect.top >= 0 && rect.top < 220;
        return inTopHeader && rect.width >= 10 && rect.height >= 10;
      });

    let pauseBtn = null;
    let speakerBtn = null;
    let optionsBtn = null;

    for (const btn of allButtons) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const svgAria = (btn.querySelector('svg')?.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const label = `${aria} ${svgAria} ${title}`;

      // Nút Pause hoặc Play (Dấu || hoặc tam giác)
      if (label.includes('pause') || label.includes('tạm dừng') || label.includes('play') || label.includes('phát') || btn.querySelector('svg polygon, svg rect')) {
        if (!label.includes('audio') && !label.includes('âm thanh')) {
          pauseBtn = btn;
        }
      }
      // Nút Loa / Audio / Mute
      else if (label.includes('audio') || label.includes('mute') || label.includes('sound') || label.includes('tiếng') || label.includes('âm thanh')) {
        speakerBtn = btn;
      }
      // Nút Ba chấm (...) hoặc Menu
      else if (label.includes('more') || label.includes('khác') || label.includes('options') || label.includes('menu') || btn.querySelector('svg circle')) {
        optionsBtn = btn;
      }
    }

    const parent = pauseBtn?.parentElement || speakerBtn?.parentElement || optionsBtn?.parentElement || null;
    if (!parent) return null;

    let insertAfter = null;
    let insertBefore = null;

    if (pauseBtn && pauseBtn.parentElement === parent) {
      insertAfter = pauseBtn;
    } else if (optionsBtn && optionsBtn.parentElement === parent) {
      insertBefore = optionsBtn;
    } else if (speakerBtn && speakerBtn.parentElement === parent) {
      insertAfter = speakerBtn;
    }

    return {
      parent,
      speakerBtn,
      pauseBtn,
      optionsBtn,
      insertAfter,
      insertBefore
    };
  }

  function scanAndAttachStoryDownload() {
    // Chỉ kích hoạt khi đang ở URL stories
    if (!window.location.pathname.includes('/stories/')) {
      document.querySelectorAll('.ig-story-download-btn').forEach(b => b.remove());
      return;
    }

    const controls = findStoryControlsContainer();
    if (!controls || !controls.parent) {
      return;
    }

    // Nếu thanh điều khiển này đã có nút tải thì không tạo thêm
    if (controls.parent.querySelector('.ig-story-download-btn')) {
      return;
    }

    // Dọn các nút cũ mồ côi nếu có trên trang
    document.querySelectorAll('.ig-story-download-btn').forEach(b => {
      if (!controls.parent.contains(b)) b.remove();
    });

    const btn = document.createElement('button');
    btn.className = 'ig-story-download-btn';
    btn.type = 'button';
    btn.title = 'Tải Story này (ảnh/video)';
    btn.innerHTML = SVG_DOWNLOAD;

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleStoryDownload(btn);
    });

    if (controls.insertAfter && controls.insertAfter.parentElement === controls.parent) {
      controls.insertAfter.insertAdjacentElement('afterend', btn);
    } else if (controls.insertBefore && controls.insertBefore.parentElement === controls.parent) {
      controls.parent.insertBefore(btn, controls.insertBefore);
    } else {
      controls.parent.appendChild(btn);
    }
  }

  // --- 7.3. TẢI TOÀN BỘ NỘI DUNG PROFILE (TẤT CẢ, ẢNH, VIDEO, STORY & HIGHLIGHTS) ---
  function getProfileUsername() {
    // 1. Ưu tiên đọc username chuẩn xác nhất từ DOM Header (h2, h1, [role="heading"])
    const header = document.querySelector('header');
    if (header) {
      const heading = header.querySelector('h2, h1, [role="heading"]');
      if (heading && heading.textContent) {
        const text = heading.textContent.trim().replace(/^@/, '');
        if (text && !text.includes(' ') && /^[a-zA-Z0-9._]{1,35}$/.test(text)) {
          return text;
        }
      }
    }

    // 2. Dự phòng: Đọc từ pathname URL
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return null;

    const reserved = new Set([
      'explore', 'reels', 'stories', 'direct', 'accounts', 'emails',
      'developer', 'about', 'legal', 'directory', 'lite', 'help',
      'api', 'graphql', 'p', 'reel', 'tv'
    ]);

    const firstSeg = segments[0].toLowerCase();
    if (reserved.has(firstSeg)) return null;

    if (segments.length > 1) {
      const validSubTabs = new Set(['reels', 'saved', 'tagged', 'channel']);
      if (!validSubTabs.has(segments[1].toLowerCase())) {
        return null;
      }
    }

    return segments[0];
  }

  function findProfileButtonPlacement(username) {
    const header = document.querySelector('header');
    if (!header) return null;

    // 1. Tìm nút bánh răng (Settings) hoặc nút Ba chấm (Options)
    const optionSvgs = Array.from(header.querySelectorAll('svg')).filter(svg => {
      const label = (svg.getAttribute('aria-label') || '').toLowerCase();
      const title = (svg.querySelector('title')?.textContent || '').toLowerCase();
      return label.includes('option') || label.includes('tùy chọn') || label.includes('cài đặt') || label.includes('settings') ||
        title.includes('option') || title.includes('tùy chọn') || title.includes('cài đặt') || title.includes('settings');
    });

    if (optionSvgs.length > 0) {
      const targetSvg = optionSvgs[0];
      const btn = targetSvg.closest('button, a, div[role="button"]') || targetSvg;
      return {
        parent: btn.parentElement,
        insertAfter: btn
      };
    }

    // 2. Tìm nút "Chỉnh sửa trang cá nhân" / "Edit profile" hoặc "Theo dõi" / "Follow"
    const actionBtn = header.querySelector('a[href*="/accounts/edit/"], a[href*="/archive/"], button');
    if (actionBtn && actionBtn.parentElement) {
      return {
        parent: actionBtn.parentElement,
        insertAfter: actionBtn
      };
    }

    // 3. Fallback: Dòng đầu tiên của section trong header
    const section = header.querySelector('section');
    if (section && section.firstElementChild) {
      return {
        parent: section.firstElementChild,
        appendChild: true
      };
    }

    return null;
  }

  function scanAndAttachProfileDownload() {
    const username = getProfileUsername();
    if (!username) {
      document.querySelectorAll('.ig-profile-download-btn').forEach(b => b.remove());
      return;
    }

    const existingBtn = document.querySelector('.ig-profile-download-btn');
    if (existingBtn) {
      if (existingBtn._igUsername === username && document.body.contains(existingBtn)) {
        return;
      }
      existingBtn.remove();
    }

    const placement = findProfileButtonPlacement(username);
    if (!placement || !placement.parent) return;

    const btn = document.createElement('button');
    btn.className = 'ig-profile-download-btn';
    btn.type = 'button';
    btn._igUsername = username;
    btn.title = `Tải toàn bộ nội dung profile @${username} (ảnh, video, story, highlights)`;
    btn.innerHTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span class="ig-profile-btn-text">Tải Profile</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (typeof chrome !== 'undefined' && !chrome.runtime?.id) {
          alert('Tiện ích InstaTweaks vừa được cập nhật lại trong Chrome.\nVui lòng nhấn F5 (Tải lại trang) để tiếp tục!');
          return;
        }
        openProfileDownloadDialog(username);
      } catch (err) {
        if (String(err?.message || '').includes('Extension context invalidated')) {
          alert('Tiện ích InstaTweaks vừa được cập nhật lại trong Chrome.\nVui lòng nhấn F5 (Tải lại trang) để tiếp tục!');
          return;
        }
        console.error('[InstaTweaks] Lỗi khi mở hộp thoại:', err);
      }
    });

    if (placement.insertAfter && placement.insertAfter.parentElement === placement.parent) {
      placement.insertAfter.insertAdjacentElement('afterend', btn);
    } else {
      placement.parent.appendChild(btn);
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function openProfileDownloadDialog(username) {
    const existingOverlay = document.querySelector('.ig-profile-modal-overlay');
    if (existingOverlay) existingOverlay.remove();

    const headerImg = document.querySelector('header img');
    const avatarSrc = headerImg ? (headerImg.currentSrc || headerImg.src) : '';

    let iconAllUrl = CACHED_PROFILE_ICONS.all || CACHED_PROFILE_ICONS.archive;
    let iconArchiveUrl = CACHED_PROFILE_ICONS.archive || CACHED_PROFILE_ICONS.all;
    let iconStoryUrl = CACHED_PROFILE_ICONS.story;
    let iconHighlightUrl = CACHED_PROFILE_ICONS.highlight;
    let iconVideoUrl = CACHED_PROFILE_ICONS.video;
    let iconPhotosUrl = CACHED_PROFILE_ICONS.photos;

    try {
      if (!iconArchiveUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconArchiveUrl = chrome.runtime.getURL('icons/opt_archive.png');
      }
      if (!iconAllUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconAllUrl = iconArchiveUrl || chrome.runtime.getURL('icons/opt_all.png');
      }
      if (!iconStoryUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconStoryUrl = chrome.runtime.getURL('icons/opt_story.png');
      }
      if (!iconHighlightUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconHighlightUrl = chrome.runtime.getURL('icons/opt_highlight.png');
      }
      if (!iconVideoUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconVideoUrl = chrome.runtime.getURL('icons/opt_video.png');
      }
      if (!iconPhotosUrl && typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        iconPhotosUrl = chrome.runtime.getURL('icons/opt_photos.png');
      }
    } catch (_) { }

    const overlay = document.createElement('div');
    overlay.className = 'ig-profile-modal-overlay';

    overlay.innerHTML = `
      <div class="ig-profile-modal">
        <div class="ig-profile-modal-header">
          <div class="ig-profile-header-user">
            ${avatarSrc ? `<img class="ig-profile-header-avatar" src="${avatarSrc}" alt="${username}">` : '<div class="ig-profile-header-avatar" style="display:flex;align-items:center;justify-content:center;font-size:20px;">👤</div>'}
            <div class="ig-profile-header-meta">
              <div class="ig-profile-header-title">@${username}</div>
              <div class="ig-profile-header-sub">Tải xuống & Đóng gói dữ liệu tài khoản</div>
            </div>
          </div>
          <button class="ig-profile-modal-close" type="button" title="Đóng">&times;</button>
        </div>

        <div class="ig-profile-options-grid">
          <div class="ig-profile-opt-card active" data-mode="all" style="grid-column: span 2;">
            <div class="ig-opt-card-top">
              <img src="${iconArchiveUrl}" class="ig-opt-icon-img" alt="Lưu trữ">
              <span class="ig-opt-badge">Đầy đủ</span>
            </div>
            <div class="ig-opt-title">Lưu trữ toàn bộ (All in One)</div>
            <div class="ig-opt-desc">Tải toàn bộ ảnh, video bài viết, story 24h &amp; tin nổi bật theo thư mục chuẩn xác.</div>
          </div>

          <div class="ig-profile-opt-card" data-mode="story">
            <div class="ig-opt-card-top">
              <img src="${iconStoryUrl}" class="ig-opt-icon-img" alt="Story">
            </div>
            <div class="ig-opt-title">Story 24h</div>
            <div class="ig-opt-desc">Chỉ tải các tin Story đang phát sóng trong 24h qua của tài khoản.</div>
          </div>

          <div class="ig-profile-opt-card" data-mode="highlight">
            <div class="ig-opt-card-top">
              <img src="${iconHighlightUrl}" class="ig-opt-icon-img" alt="Tin nổi bật">
            </div>
            <div class="ig-opt-title">Tin nổi bật (Highlights)</div>
            <div class="ig-opt-desc">Tải trọn bộ các album Tin nổi bật (Highlights) còn lưu trên trang.</div>
          </div>

          <div class="ig-profile-opt-card" data-mode="videos">
            <div class="ig-opt-card-top">
              <img src="${iconVideoUrl}" class="ig-opt-icon-img" alt="Video">
            </div>
            <div class="ig-opt-title">File video (Videos & Reels)</div>
            <div class="ig-opt-desc">Chỉ tải toàn bộ video bài viết và Instagram Reels kèm âm thanh gốc.</div>
          </div>

          <div class="ig-profile-opt-card" data-mode="photos">
            <div class="ig-opt-card-top">
              <img src="${iconPhotosUrl}" class="ig-opt-icon-img" alt="Ảnh">
            </div>
            <div class="ig-opt-title">File ảnh (Photos)</div>
            <div class="ig-opt-desc">Chỉ tải ảnh gốc chất lượng cao từ tất cả bài viết (kể cả carousel).</div>
          </div>
        </div>

        <div class="ig-profile-struct-section" style="margin-bottom: 12px;">
          <div class="ig-profile-struct-header">
            <span>Cấu trúc xuất file:</span>
            <span class="ig-profile-struct-badge">Tùy chọn sắp xếp</span>
          </div>
          <div class="ig-profile-struct-grid">
            <div class="ig-struct-card active" data-struct="folders">
              <div class="ig-struct-card-top">
                <span class="ig-struct-icon">📁</span>
                <span class="ig-struct-radio-dot"></span>
              </div>
              <div class="ig-struct-title">Theo thư mục</div>
              <div class="ig-struct-tooltip">
                Phân loại theo từng thư mục (Story, Highlight, Post, Reels). Tên file đánh số theo thứ tự.
              </div>
            </div>

            <div class="ig-struct-card" data-struct="bulk">
              <div class="ig-struct-card-top">
                <span class="ig-struct-icon">📦</span>
                <span class="ig-struct-radio-dot"></span>
              </div>
              <div class="ig-struct-title">Xuất hàng loạt</div>
              <div class="ig-struct-tooltip">
                Tất cả file ảnh, video, story được gom chung vào các thư mục lớn (Post, Story, Highlight, Reels).
              </div>
            </div>
          </div>
        </div>

        <div class="ig-profile-limit-row" style="margin-bottom: 18px;">
          <span>Giới hạn số lượng bài viết:</span>
          <select class="ig-profile-limit-select">
            <option value="0" selected>Tất cả bài viết (Toàn bộ)</option>
            <option value="50">50 bài gần nhất</option>
            <option value="30">30 bài gần nhất</option>
            <option value="12">12 bài mới nhất</option>
          </select>
        </div>

        <button class="ig-profile-start-btn" type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Bắt đầu tải về máy</span>
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedMode = 'all';

    const cards = overlay.querySelectorAll('.ig-profile-opt-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        cards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedMode = card.getAttribute('data-mode') || 'all';
      });
    });

    let selectedExportStruct = 'folders';

    const structCards = overlay.querySelectorAll('.ig-struct-card');
    structCards.forEach(card => {
      card.addEventListener('click', () => {
        structCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedExportStruct = card.getAttribute('data-struct') || 'folders';
      });
    });

    const closeBtn = overlay.querySelector('.ig-profile-modal-close');
    closeBtn.addEventListener('click', () => {
      if (overlay.__isDownloading && typeof overlay.__minimizeFn === 'function') {
        overlay.__minimizeFn();
      } else {
        overlay.remove();
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        if (overlay.__isDownloading && typeof overlay.__minimizeFn === 'function') {
          overlay.__minimizeFn();
        } else {
          overlay.remove();
        }
      }
    });

    const startBtn = overlay.querySelector('.ig-profile-start-btn');
    startBtn.addEventListener('click', async () => {
      const limitSelect = overlay.querySelector('.ig-profile-limit-select');
      const postLimit = parseInt(limitSelect?.value || '0', 10);
      const zipFilename = `instagram_${username}_${selectedMode}_${Math.floor(Date.now() / 1000)}.zip`;

      let fileHandle = null;
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: zipFilename,
            types: [{
              description: 'Tệp nén ZIP (*.zip)',
              accept: { 'application/zip': ['.zip'] }
            }]
          });
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // Người dùng ấn Hủy (Cancel) trên hộp thoại lưu file
          }
          console.warn('[Profile Downloader] showSaveFilePicker not used:', err);
        }
      }

      startProfileBatchDownload(username, selectedMode, postLimit, overlay, selectedExportStruct, fileHandle, zipFilename);
    });
  }

  async function startProfileBatchDownload(username, selectedMode, postLimit, overlay, exportStruct = 'folders', fileHandle = null, zipFilename = null) {
    const modal = overlay.querySelector('.ig-profile-modal');
    if (!modal) return;

    if (!zipFilename) {
      zipFilename = `instagram_${username}_${selectedMode}_${Math.floor(Date.now() / 1000)}.zip`;
    }

    let isCancelled = false;
    let stopEarlyAndZip = false;
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

    overlay.__isDownloading = true;

    const modeLabels = {
      all: 'Lưu trữ (All in One)',
      story: 'Story 24h',
      stories: 'Story 24h',
      highlight: 'Tin nổi bật (Highlights)',
      highlights: 'Tin nổi bật (Highlights)',
      videos: 'File video (Videos & Reels)',
      photos: 'File ảnh (Photos)'
    };

    modal.innerHTML = `
      <div class="ig-profile-modal-header">
        <div class="ig-profile-header-user">
          <div class="ig-profile-header-meta">
            <div class="ig-profile-header-title">Đang xử lý @${username}</div>
            <div class="ig-profile-header-sub">Chế độ: ${modeLabels[selectedMode] || selectedMode}</div>
          </div>
        </div>
        <div class="ig-profile-modal-header-actions" style="display:flex;align-items:center;gap:6px;">
          <button class="ig-profile-modal-min ig-btn-minimize" type="button" title="Thu nhỏ / Ẩn thanh tiến trình" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.8);border-radius:8px;cursor:pointer;transition:all 0.2s ease;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button class="ig-profile-modal-close ig-btn-cancel-top" type="button" title="Hủy bỏ">&times;</button>
        </div>
      </div>

      <div class="ig-profile-progress-view">
        <div class="ig-progress-hero">
          <div class="ig-progress-hero-text">
            <div class="ig-progress-stage-title">Đang kết nối & quét dữ liệu...</div>
            <div class="ig-progress-stage-sub">Đang trích xuất danh sách bài viết & story</div>
          </div>
          <div class="ig-progress-percentage-big">0%</div>
        </div>

        <div class="ig-progress-bar-track">
          <div class="ig-progress-bar-fill"></div>
        </div>

        <div class="ig-progress-stats-row">
          <div class="ig-stat-box">
            <span>Đã tải</span>
            <strong class="ig-stat-files">0 / 0</strong>
          </div>
          <div class="ig-stat-box">
            <span>Đã ghi vào đĩa</span>
            <strong class="ig-stat-bytes">0 MB</strong>
          </div>
          <div class="ig-stat-box">
            <span>Trạng thái</span>
            <strong class="ig-stat-status">Đang quét...</strong>
          </div>
        </div>

        <div class="ig-progress-ticker">
          <div class="ig-ticker-dot"></div>
          <span class="ig-ticker-text">Đang phân tích cấu trúc tài khoản @${username}...</span>
        </div>

        <div class="ig-progress-actions">
          <button class="ig-btn-stop-save" type="button" disabled>Dừng tải (0 file)</button>
          <button class="ig-btn-cancel" type="button">Hủy bỏ</button>
        </div>
      </div>
    `;

    const percentEl = modal.querySelector('.ig-progress-percentage-big');
    const stageTitleEl = modal.querySelector('.ig-progress-stage-title');
    const stageSubEl = modal.querySelector('.ig-progress-stage-sub');
    const fillEl = modal.querySelector('.ig-progress-bar-fill');
    const statFilesEl = modal.querySelector('.ig-stat-files');
    const statBytesEl = modal.querySelector('.ig-stat-bytes');
    const statStatusEl = modal.querySelector('.ig-stat-status');
    const tickerTextEl = modal.querySelector('.ig-ticker-text');
    const stopSaveBtn = modal.querySelector('.ig-btn-stop-save');
    const cancelBtn = modal.querySelector('.ig-btn-cancel');
    const cancelTopBtn = modal.querySelector('.ig-btn-cancel-top');
    const minBtn = modal.querySelector('.ig-btn-minimize');

    let floatingPill = null;
    let currentPercent = 0;
    let currentStatusText = 'Đang phân tích tài khoản...';
    let currentFilesText = '0 / 0';

    function createOrUpdateFloatingPill(percent, statusText, filesText) {
      if (isCancelled) return;
      if (!floatingPill) {
        floatingPill = document.createElement('div');
        floatingPill.className = 'ig-profile-floating-pill';
        floatingPill.title = 'Nhấn để mở lại cửa sổ tiến trình tải @' + username;
        floatingPill.innerHTML = `
          <div class="ig-floating-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <div class="ig-floating-info">
            <div class="ig-floating-title-row">
              <span class="ig-floating-title">@${username}</span>
              <span class="ig-floating-percent">${percent}%</span>
            </div>
            <div class="ig-floating-status">${statusText || 'Đang xử lý...'}</div>
            <div class="ig-floating-bar-track">
              <div class="ig-floating-bar-fill" style="width: ${percent}%;"></div>
            </div>
          </div>
          <div class="ig-floating-actions">
            <button class="ig-floating-btn-expand" type="button" title="Mở lại cửa sổ">Phóng to</button>
            <button class="ig-floating-btn-cancel" type="button" title="Hủy bỏ tiến trình" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.12);border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:14px;line-height:1;margin-left:4px;">&times;</button>
          </div>
        `;

        floatingPill.querySelector('.ig-floating-btn-cancel').addEventListener('click', (e) => {
          e.stopPropagation();
          cancelProcess();
        });

        floatingPill.addEventListener('click', (e) => {
          e.stopPropagation();
          restoreFromFloating();
        });

        document.body.appendChild(floatingPill);
      }

      const pEl = floatingPill.querySelector('.ig-floating-percent');
      const sEl = floatingPill.querySelector('.ig-floating-status');
      const bEl = floatingPill.querySelector('.ig-floating-bar-fill');

      if (pEl) pEl.textContent = `${percent}%`;
      if (sEl) sEl.textContent = statusText || (filesText ? `${filesText}` : 'Đang xử lý...');
      if (bEl) bEl.style.width = `${percent}%`;
    }

    function minimizeToFloating() {
      if (isCancelled) return;
      overlay.classList.add('ig-minimized');
      createOrUpdateFloatingPill(currentPercent, currentStatusText, currentFilesText);
    }

    function restoreFromFloating() {
      if (floatingPill) {
        floatingPill.remove();
        floatingPill = null;
      }
      overlay.classList.remove('ig-minimized');
    }

    overlay.__minimizeFn = minimizeToFloating;

    if (minBtn) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        minimizeToFloating();
      });
    }

    function cancelProcess() {
      if (isCancelled) return;
      isCancelled = true;
      overlay.__isDownloading = false;
      cleanupListeners();
      if (floatingPill) {
        floatingPill.remove();
        floatingPill = null;
      }
      overlay.remove();
    }

    cancelBtn.addEventListener('click', cancelProcess);
    cancelTopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      minimizeToFloating();
    });

    stopSaveBtn.addEventListener('click', () => {
      stopEarlyAndZip = true;
      stopSaveBtn.disabled = true;
      stopSaveBtn.textContent = 'Đang hoàn tất đóng gói...';
      statStatusEl.textContent = 'Đang dừng...';
    });

    function setProgress(percent, stageTitle, stageSub, tickerText) {
      if (isCancelled) return;
      const cleanPct = Math.min(100, Math.max(0, Math.floor(percent)));
      currentPercent = cleanPct;
      if (stageTitle) currentStatusText = stageTitle;
      if (percentEl) percentEl.textContent = `${cleanPct}%`;
      if (fillEl) fillEl.style.width = `${cleanPct}%`;
      if (stageTitle && stageTitleEl) stageTitleEl.textContent = stageTitle;
      if (stageSub && stageSubEl) stageSubEl.textContent = stageSub;
      if (tickerText && tickerTextEl) tickerTextEl.textContent = tickerText;
      if (floatingPill) {
        createOrUpdateFloatingPill(currentPercent, currentStatusText, currentFilesText);
      }
    }

    const onScanProgress = (e) => {
      if (isCancelled) return;
      if (e.detail?.requestId !== requestId) return;
      const { stage, message, currentCount } = e.detail;
      if (currentCount !== undefined && statFilesEl) {
        statFilesEl.textContent = `Tìm thấy ${currentCount}`;
      }
      if (message) {
        if (stageTitleEl) stageTitleEl.textContent = message;
        if (tickerTextEl) tickerTextEl.textContent = message;
      }
      if (stage === 'init') setProgress(5);
      else if (stage === 'profile_loaded') setProgress(10);
      else if (stage === 'scanning_posts') setProgress(15);
      else if (stage === 'scanning_stories') setProgress(20);
      else if (stage === 'scanning_highlights') setProgress(25);
    };

    window.addEventListener('__IG_PROFILE_SCAN_PROGRESS__', onScanProgress);

    const items = await new Promise((resolve) => {
      const onResult = (e) => {
        if (e.detail?.requestId !== requestId) return;
        cleanupResultListener();
        if (e.detail.error) {
          resolve({ error: e.detail.error });
        } else {
          resolve({ items: e.detail.items || [], user: e.detail.user });
        }
      };

      function cleanupResultListener() {
        window.removeEventListener('__IG_PROFILE_MEDIA_RESULT__', onResult);
      }

      window.addEventListener('__IG_PROFILE_MEDIA_RESULT__', onResult);

      window.dispatchEvent(new CustomEvent('__IG_REQUEST_PROFILE_MEDIA__', {
        detail: {
          requestId,
          username,
          options: {
            type: selectedMode,
            postLimit: postLimit,
            exportStruct: exportStruct,
            includePosts: (selectedMode === 'all' || selectedMode === 'videos' || selectedMode === 'photos'),
            includeStories: (selectedMode === 'all' || selectedMode === 'story' || selectedMode === 'stories'),
            includeHighlights: (selectedMode === 'all' || selectedMode === 'highlight' || selectedMode === 'highlights')
          }
        }
      }));
    });

    function cleanupListeners() {
      window.removeEventListener('__IG_PROFILE_SCAN_PROGRESS__', onScanProgress);
    }

    if (isCancelled) {
      cleanupListeners();
      return;
    }

    if (items.error) {
      cleanupListeners();
      restoreFromFloating();
      overlay.__isDownloading = false;
      modal.innerHTML = `
        <div class="ig-profile-modal-header">
          <div class="ig-profile-header-title">Thông báo</div>
          <button class="ig-profile-modal-close" type="button">&times;</button>
        </div>
        <div style="padding: 20px 0; text-align: center; color: #ef4444; font-size: 14px; line-height: 1.5;">
          ${items.error}
        </div>
        <button class="ig-profile-start-btn" style="background:#3f3f46;" type="button">Đóng</button>
      `;
      modal.querySelector('.ig-profile-modal-close').addEventListener('click', () => overlay.remove());
      modal.querySelector('.ig-profile-start-btn').addEventListener('click', () => overlay.remove());
      return;
    }

    const mediaList = items.items || [];
    if (mediaList.length === 0) {
      cleanupListeners();
      restoreFromFloating();
      overlay.__isDownloading = false;
      modal.innerHTML = `
        <div class="ig-profile-modal-header">
          <div class="ig-profile-header-title">Không tìm thấy nội dung</div>
          <button class="ig-profile-modal-close" type="button">&times;</button>
        </div>
        <div style="padding: 20px 0; text-align: center; color: rgba(255,255,255,0.7); font-size: 13.5px; line-height: 1.5;">
          Không tìm thấy hình ảnh hay video nào phù hợp với tùy chọn của bạn trong tài khoản @${username}.
        </div>
        <button class="ig-profile-start-btn" style="background:#3f3f46;" type="button">Đóng</button>
      `;
      modal.querySelector('.ig-profile-modal-close').addEventListener('click', () => overlay.remove());
      modal.querySelector('.ig-profile-start-btn').addEventListener('click', () => overlay.remove());
      return;
    }

    // BẮT ĐẦU TẢI DỮ LIỆU MEDIA QUA STREAMING TRỰC TIẾP XUỐNG Ổ CỨNG HOẶC ZERO-COPY ZIP
    const rootFolder = `Instagram_${username}`;
    let totalDownloadedBytes = 0;
    const downloadedItems = [];
    let totalZipSizeMB = '0.0';

    let writable = null;
    if (fileHandle) {
      try {
        writable = await fileHandle.createWritable();
      } catch (err) {
        console.warn('[Profile Downloader] createWritable failed, fallback to memory:', err);
      }
    }

    if (writable) {
      // =========================================================================
      // CHẾ ĐỘ STREAMING TRỰC TIẾP XUỐNG Ổ CỨNG (FILE SYSTEM ACCESS API - RAM < 15MB)
      // Dữ liệu đọc từ mạng đến đâu ghi ngay từng chunk 64KB xuống ổ cứng đến đó.
      // Tuyệt đối không giữ video trong RAM -> RAM tab luôn giữ ở mức 10MB - 15MB.
      // =========================================================================
      setProgress(30, 'Bắt đầu nạp & ghi file...', `Tổng cộng ${mediaList.length} file`, `Đang lưu media về máy...`);
      statStatusEl.textContent = 'Đang lưu';
      stopSaveBtn.disabled = false;
      stopSaveBtn.textContent = `Dừng & Hoàn tất (0/${mediaList.length})`;

      let downloadedCount = 0;
      let currentOffset = 0;
      const centralRecords = [];
      const textEncoder = new TextEncoder();

      for (let idx = 0; idx < mediaList.length; idx++) {
        if (isCancelled || stopEarlyAndZip) break;
        const item = mediaList[idx];
        let downloadUrl = item.url;
        let targetZipPath = `${rootFolder}/${item.filename}`;

        // Kiểm tra đối với Story: nếu là video nhưng có imageUrl dự phòng, kiểm tra buffer để nhận diện video 1-fps (ảnh kèm nhạc)
        if (item.category === 'story' && item.type === 'video' && item.imageUrl) {
          try {
            const probeRes = await fetch(item.url, { credentials: 'omit' });
            if (probeRes.ok) {
              const buf = await probeRes.arrayBuffer();
              if (isMp41FpsPseudoVideo(buf)) {
                // ĐÂY LÀ ẢNH KÈM NHẠC -> Tự động chuyển sang lưu ảnh gốc .jpg (tránh lỗi đen màn hình trên PC)
                downloadUrl = item.imageUrl;
                targetZipPath = targetZipPath.replace(/\.mp4$/i, '.jpg');
                item.type = 'image';
              }
            }
          } catch (_) { }
        }

        const nameBytes = textEncoder.encode(targetZipPath);
        const fileOffset = currentOffset;

        try {
          // 1. Ghi Local File Header với Flag Data Descriptor (0x0808)
          const lh = new Uint8Array(30 + nameBytes.length);
          const view = new DataView(lh.buffer);
          view.setUint32(0, 0x04034b50, true);
          view.setUint16(4, 20, true);
          view.setUint16(6, 0x0808, true); // bit 3 (data descriptor) + bit 11 (utf-8)
          view.setUint16(8, 0, true); // STORE
          view.setUint16(10, 0, true);
          view.setUint16(12, 0, true);
          view.setUint32(14, 0, true);
          view.setUint32(18, 0, true);
          view.setUint32(22, 0, true);
          view.setUint16(26, nameBytes.length, true);
          view.setUint16(28, 0, true);
          lh.set(nameBytes, 30);
          await writable.write(lh);
          currentOffset += lh.length;

          // 2. Fetch và Stream trực tiếp từng chunk 64KB xuống file (RAM < 15MB)
          const res = await fetch(downloadUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const reader = res.body.getReader();
          let crc = 0xFFFFFFFF;
          let fileSize = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fileSize += value.length;
            for (let i = 0; i < value.length; i++) {
              crc = (crc >>> 8) ^ crcTable[(crc ^ value[i]) & 0xFF];
            }
            await writable.write(value);
            currentOffset += value.length;
          }
          crc = (crc ^ 0xFFFFFFFF) >>> 0;

          // 3. Ghi 16-byte Data Descriptor
          const dd = new Uint8Array(16);
          const ddView = new DataView(dd.buffer);
          ddView.setUint32(0, 0x08074b50, true);
          ddView.setUint32(4, crc, true);
          ddView.setUint32(8, fileSize, true);
          ddView.setUint32(12, fileSize, true);
          await writable.write(dd);
          currentOffset += 16;

          centralRecords.push({
            nameBytes,
            crc,
            size: fileSize,
            offset: fileOffset
          });

          downloadedCount++;
          downloadedItems.push(item);
          totalDownloadedBytes += fileSize;

          const pct = 30 + Math.floor((downloadedCount / mediaList.length) * 65);
          const totalMB = (totalDownloadedBytes / (1024 * 1024)).toFixed(1);

          setProgress(
            pct,
            `Đang tải media: ${downloadedCount} / ${mediaList.length} file...`,
            `Đã ghi ${totalMB} MB (${Math.round((downloadedCount / mediaList.length) * 100)}%)`,
            `✓ ${item.filename}`
          );

          if (statFilesEl) statFilesEl.textContent = `${downloadedCount} / ${mediaList.length}`;
          if (statBytesEl) statBytesEl.textContent = `${totalMB} MB`;
          if (stopSaveBtn) stopSaveBtn.textContent = `Dừng & Hoàn tất (${downloadedCount}/${mediaList.length})`;
        } catch (err) {
          console.warn('[Profile Downloader] stream write error:', item.url, err);
        }
      }

      if (isCancelled) {
        try { await writable.abort(); } catch (_) { }
        cleanupListeners();
        return;
      }

      if (centralRecords.length === 0) {
        try { await writable.abort(); } catch (_) { }
        cleanupListeners();
        restoreFromFloating();
        overlay.__isDownloading = false;
        alert('Không thể tải các tệp tin media. Vui lòng kiểm tra lại kết nối mạng.');
        overlay.remove();
        return;
      }

      // 4. Ghi Central Directory và End of Central Directory
      setProgress(98, 'Đang hoàn tất tệp ZIP...', `Đã ghi ${centralRecords.length} file vào ổ cứng`, 'Đang cập nhật chỉ mục file ZIP...');

      const cdOffset = currentOffset;
      for (const rec of centralRecords) {
        const cd = new Uint8Array(46 + rec.nameBytes.length);
        const view = new DataView(cd.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0808, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, 0, true);
        view.setUint16(14, 0, true);
        view.setUint32(16, rec.crc, true);
        view.setUint32(20, rec.size, true);
        view.setUint32(24, rec.size, true);
        view.setUint16(28, rec.nameBytes.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, rec.offset, true);
        cd.set(rec.nameBytes, 46);
        await writable.write(cd);
        currentOffset += cd.length;
      }

      const cdSize = currentOffset - cdOffset;
      const eocd = new Uint8Array(22);
      const eView = new DataView(eocd.buffer);
      eView.setUint32(0, 0x06054b50, true);
      eView.setUint16(4, 0, true);
      eView.setUint16(6, 0, true);
      eView.setUint16(8, centralRecords.length, true);
      eView.setUint16(10, centralRecords.length, true);
      eView.setUint32(12, cdSize, true);
      eView.setUint32(16, cdOffset, true);
      eView.setUint16(20, 0, true);
      await writable.write(eocd);

      await writable.close();

      totalZipSizeMB = (totalDownloadedBytes / (1024 * 1024)).toFixed(1);
      setProgress(100, 'Tải về hoàn tất!', `Đã lưu tệp ZIP (${totalZipSizeMB} MB) vào máy`, `✓ Hoàn tất đóng gói ${centralRecords.length} file`);
      await new Promise(r => setTimeout(r, 350));
    } else {
      // Fallback: nếu không có fileHandle (người dùng từ chối cấp quyền hoặc trình duyệt không hỗ trợ)
      setProgress(30, 'Bắt đầu nạp media...', `Tổng cộng ${mediaList.length} file`, `Đang nạp media...`);
      statStatusEl.textContent = 'Đang tải';
      stopSaveBtn.disabled = false;
      stopSaveBtn.textContent = `Dừng & Nén ngay (0/${mediaList.length})`;

      let downloadedCount = 0;
      let fileIndex = 0;
      const concurrency = 2;
      const filesToZip = [];
      const textEncoder = new TextEncoder();

      async function downloadWorker() {
        while (fileIndex < mediaList.length) {
          if (isCancelled || stopEarlyAndZip) break;
          const idx = fileIndex++;
          const item = mediaList[idx];
          const targetZipPath = `${rootFolder}/${item.filename}`;

          try {
            const res = await fetch(item.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const crc = await calculateBlobCrc32(blob);

            totalDownloadedBytes += blob.size;
            downloadedCount++;
            downloadedItems.push(item);
            filesToZip.push({
              nameBytes: textEncoder.encode(targetZipPath),
              blob: blob,
              size: blob.size,
              crc: crc
            });

            if (isCancelled) break;

            const pct = 30 + Math.floor((downloadedCount / mediaList.length) * 62);
            const totalMB = (totalDownloadedBytes / (1024 * 1024)).toFixed(1);

            setProgress(
              pct,
              `Đang tải media: ${downloadedCount} / ${mediaList.length} file...`,
              `Đã tải ${totalMB} MB (${Math.round((downloadedCount / mediaList.length) * 100)}%)`,
              `✓ ${item.filename}`
            );

            if (statFilesEl) statFilesEl.textContent = `${downloadedCount} / ${mediaList.length}`;
            if (statBytesEl) statBytesEl.textContent = `${totalMB} MB`;
            if (stopSaveBtn) stopSaveBtn.textContent = `Dừng & Nén ngay (${downloadedCount}/${mediaList.length})`;
          } catch (err) {
            console.warn('[Profile Downloader] fetch error:', item.url, err);
          }
        }
      }

      const workers = [];
      const numWorkers = Math.min(concurrency, mediaList.length);
      for (let w = 0; w < numWorkers; w++) {
        workers.push(downloadWorker());
      }

      await Promise.all(workers);

      if (isCancelled) {
        cleanupListeners();
        return;
      }

      if (filesToZip.length === 0) {
        cleanupListeners();
        restoreFromFloating();
        overlay.__isDownloading = false;
        alert('Không thể tải các tệp tin media. Vui lòng kiểm tra lại kết nối mạng.');
        overlay.remove();
        return;
      }

      setProgress(95, 'Đang tạo tệp ZIP...', `Đang đóng gói ${filesToZip.length} file...`, `Tạo tệp ZIP duy nhất...`);

      const zipBlob = createZipBlobFromBlobs(filesToZip);
      totalZipSizeMB = (zipBlob.size / (1024 * 1024)).toFixed(1);
      const blobUrl = URL.createObjectURL(zipBlob);

      await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({
            action: 'download_file',
            url: blobUrl,
            filename: zipFilename
          }, (res) => {
            if (!res || !res.success) {
              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = zipFilename;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
            resolve(true);
          });
        } else {
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = zipFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          resolve(true);
        }
      });

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      setProgress(100, 'Tải về hoàn tất!', `Đã lưu tệp ZIP (${totalZipSizeMB} MB) vào máy`, `✓ Hoàn tất đóng gói ${filesToZip.length} file`);
      await new Promise(r => setTimeout(r, 350));
    }

    restoreFromFloating();
    overlay.__isDownloading = false;

    // Thống kê chi tiết số lượng file theo từng thể loại
    let imageCount = 0;
    let videoCount = 0;
    let storyCount = 0;
    let highlightCount = 0;

    for (const f of downloadedItems) {
      const fn = f.filename || '';
      if (f.category === 'story' || fn.startsWith('Story/')) {
        storyCount++;
      } else if (f.category === 'highlight' || fn.startsWith('Highlight/')) {
        highlightCount++;
      } else if (f.type === 'video' || f.category === 'videos' || fn.startsWith('Reels/') || fn.endsWith('.mp4')) {
        videoCount++;
      } else {
        imageCount++;
      }
    }

    const iconPhotosUrl = CACHED_PROFILE_ICONS.photos || (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/opt_photos.png') : '');
    const iconVideoUrl = CACHED_PROFILE_ICONS.video || (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/opt_video.png') : '');
    const iconStoryUrl = CACHED_PROFILE_ICONS.story || (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/opt_story.png') : '');
    const iconHighlightUrl = CACHED_PROFILE_ICONS.highlight || (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/opt_highlight.png') : '');
    const iconArchiveUrl = CACHED_PROFILE_ICONS.archive || CACHED_PROFILE_ICONS.all || (typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('icons/opt_archive.png') : '');

    const statsSegments = [];
    if (selectedMode === 'all') {
      statsSegments.push(`<span><img src="${iconPhotosUrl}" class="ig-success-stat-icon" alt="Ảnh"> <strong>${imageCount}</strong> ảnh</span>`);
      statsSegments.push(`<span>•</span>`);
      statsSegments.push(`<span><img src="${iconVideoUrl}" class="ig-success-stat-icon" alt="Video"> <strong>${videoCount}</strong> video</span>`);
      statsSegments.push(`<span>•</span>`);
      statsSegments.push(`<span><img src="${iconStoryUrl}" class="ig-success-stat-icon" alt="Story"> <strong>${storyCount}</strong> story</span>`);
      statsSegments.push(`<span>•</span>`);
      statsSegments.push(`<span><img src="${iconHighlightUrl}" class="ig-success-stat-icon" alt="Highlight"> <strong>${highlightCount}</strong> highlight</span>`);
      statsSegments.push(`<span>•</span>`);
    } else {
      if (imageCount > 0 || selectedMode === 'photos') {
        statsSegments.push(`<span><img src="${iconPhotosUrl}" class="ig-success-stat-icon" alt="Ảnh"> <strong>${imageCount}</strong> ảnh</span>`);
        statsSegments.push(`<span>•</span>`);
      }
      if (videoCount > 0 || selectedMode === 'videos') {
        statsSegments.push(`<span><img src="${iconVideoUrl}" class="ig-success-stat-icon" alt="Video"> <strong>${videoCount}</strong> video</span>`);
        statsSegments.push(`<span>•</span>`);
      }
      if (storyCount > 0 || selectedMode === 'stories' || selectedMode === 'story') {
        statsSegments.push(`<span><img src="${iconStoryUrl}" class="ig-success-stat-icon" alt="Story"> <strong>${storyCount}</strong> story</span>`);
        statsSegments.push(`<span>•</span>`);
      }
      if (highlightCount > 0 || selectedMode === 'stories' || selectedMode === 'highlight' || selectedMode === 'highlights') {
        statsSegments.push(`<span><img src="${iconHighlightUrl}" class="ig-success-stat-icon" alt="Highlight"> <strong>${highlightCount}</strong> highlight</span>`);
        statsSegments.push(`<span>•</span>`);
      }
    }
    statsSegments.push(`<span><img src="${iconArchiveUrl}" class="ig-success-stat-icon" alt="Lưu trữ"> <strong>${totalZipSizeMB} MB</strong></span>`);

    const typeSuccessTitle = `${modeLabels[selectedMode] || 'Tải xuống'} thành công!`;

    // MÀN HÌNH CHÚC MỪNG THÀNH CÔNG (CELEBRATION VIEW)
    modal.innerHTML = `
      <div class="ig-profile-success-view">
        <div class="ig-success-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="ig-success-title">${typeSuccessTitle}</div>
        <div class="ig-success-desc">
          <strong>@${username}</strong> đã được lưu thành công vào 1 file ZIP duy nhất.<br>
          <span style="font-size:12px;color:rgba(255,255,255,0.7);display:inline-block;margin-top:4px;">Tên tệp: <code>${zipFilename}</code> (${totalZipSizeMB} MB)</span>
        </div>
        <div class="ig-success-stats-pill">
          ${statsSegments.join('\n          ')}
        </div>
        <button class="ig-success-close-btn" type="button" style="margin-top:16px !important;width:100%;">Xong &amp; Đóng</button>
      </div>
    `;

    cleanupListeners();
    modal.querySelector('.ig-success-close-btn').addEventListener('click', () => overlay.remove());
  }

  // --- 8. QUAN SÁT THEO MÀN HÌNH (Viewport Priority) CHO HOME FEED ---
  const feedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        handleFeedPostInViewport(entry.target);
      }
    });
  }, {
    rootMargin: '250px 0px 250px 0px',
    threshold: 0.05
  });

  function handleFeedPostInViewport(post) {
    if (isSingleVideoPost(post)) {
      attachFloatingDownloadButton(post);
      return;
    }
    if (post.querySelector('.ig-music-feed-bar')) return;

    const shortcode = getShortcodeFromPost(post) || getPageShortcode();
    if (!shortcode) return;

    const insertion = findFeedInsertionPoint(post);
    if (!insertion) return;

    const bar = createFeedBarElement(shortcode);
    insertion.parent.insertBefore(bar, insertion.refNode);

    adjustFeedBarWidth(bar, post);

    if (tracksByCode.has(shortcode)) {
      updateFeedBarForPost(shortcode, tracksByCode.get(shortcode), 'ready');
    } else if (noAudioSet.has(shortcode)) {
      updateFeedBarForPost(shortcode, null, 'no-music');
    } else {
      queuePostInspection(shortcode);
    }
  }

  function scanAndAttachPlayers() {
    readInitialCache();
    scanAndAttachStoryDownload();
    if (window.location.pathname.includes('/stories/')) {
      scanAndAttachStoryScrubber();
    } else {
      scanAndAttachVideoControllers();
    }

    if (!isPostViewingContext()) {
      cleanupIfPostClosed();
      return;
    }

    const posts = getValidPostArticles();
    const isHomeFeed = (window.location.pathname === '/');

    if (posts.length === 0) {
      cleanupIfPostClosed();
      return;
    }

    posts.forEach((post) => {
      if (isSingleVideoPost(post)) {
        if (currentActive?.wrapper && post.contains(currentActive.wrapper)) {
          pauseCurrentAudio();
        }
        post.querySelectorAll('.ig-music-controls-container, .ig-music-feed-bar').forEach(el => el.remove());
        attachFloatingDownloadButton(post);
        return;
      }

      const postInDialog = Boolean(post.closest('div[role="dialog"]'));

      if (isHomeFeed && !postInDialog) {
        feedObserver.observe(post);
        return;
      }

      handleFeedPostInViewport(post);
    });
  }

  // --- 9. TỰ ĐỘNG PHÁT THÔNG MINH KHI CUỘN HOME FEED (Smart Continuous Autoplay) ---
  function checkAutoplayOnScroll() {
    if (!isPostViewingContext()) {
      pauseCurrentAudio();
      return;
    }

    const isHomeFeed = (window.location.pathname === '/' && !document.querySelector('div[role="dialog"]'));

    if (isHomeFeed && isSoundSessionActive) {
      const viewportCenter = window.innerHeight / 2;
      const feedPosts = Array.from(document.querySelectorAll('main article, article'));
      let activePost = null;
      let minDistance = Infinity;

      for (const post of feedPosts) {
        const rect = post.getBoundingClientRect();
        // Bài viết đang chiếm lĩnh khu vực trung tâm màn hình
        if (rect.bottom > 100 && rect.top < window.innerHeight - 100) {
          const postCenter = rect.top + rect.height / 2;
          const distance = Math.abs(postCenter - viewportCenter);
          if (distance < minDistance) {
            minDistance = distance;
            activePost = post;
          }
        }
      }

      if (activePost) {
        // Nếu bài viết này là 1 Video duy nhất: Nhường âm thanh cho video gốc
        if (isSingleVideoPost(activePost)) {
          pauseCurrentAudio();
          return;
        }

        const bar = activePost.querySelector('.ig-music-feed-bar');
        if (bar) {
          if (bar.classList.contains('state-ready') && bar._startPlayFn) {
            // Nếu bài viết này chưa phát: TỰ ĐỘNG PHÁT NGAY!
            if (currentActive?.badge !== bar) {
              bar._startPlayFn();
            }
          } else if (bar.classList.contains('state-no-music')) {
            pauseCurrentAudio();
          }
        }
        return;
      }
    }

    // Nếu âm thanh đang tắt hoặc bài đang phát trôi hẳn khỏi màn hình:
    if (currentActive?.wrapper) {
      const rect = currentActive.wrapper.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        pauseCurrentAudio();
      }
    }
  }

  let scrollThrottleTimer = null;
  window.addEventListener('scroll', () => {
    if (scrollThrottleTimer) return;

    scrollThrottleTimer = setTimeout(() => {
      scrollThrottleTimer = null;
      checkAutoplayOnScroll();
    }, 120);
  }, { passive: true });

  // --- 10. SỰ KIỆN ĐIỀU HƯỚNG VÀ ĐÓNG BÀI VIẾT ---
  window.addEventListener('__IG_NAVIGATED__', () => {
    cleanupIfPostClosed();
    scanAndAttachProfileDownload();
    setTimeout(scanAndAttachPlayers, 100);
    setTimeout(scanAndAttachPlayers, 400);
  });

  window.addEventListener('popstate', () => {
    setTimeout(cleanupIfPostClosed, 40);
    setTimeout(scanAndAttachProfileDownload, 60);
    setTimeout(scanAndAttachPlayers, 150);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setTimeout(cleanupIfPostClosed, 40);
      setTimeout(cleanupIfPostClosed, 150);
      return;
    }

    // Phím tắt điều khiển Video khi hover chuột qua video (Space, Mũi tên Trái/Phải, Lên/Xuống, M)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return;
    }

    const hoveredCtrl = document.querySelector('.ig-video-controller.is-active, .ig-video-controller:hover');
    const hoveredVideo = hoveredCtrl?.parentElement?.querySelector('video');
    if (hoveredVideo) {
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (hoveredVideo.paused) hoveredVideo.play().catch(() => { });
        else hoveredVideo.pause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        hoveredVideo.currentTime = Math.max(0, (hoveredVideo.currentTime || 0) - 5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const dur = hoveredVideo.duration || Infinity;
        hoveredVideo.currentTime = Math.min(dur, (hoveredVideo.currentTime || 0) + 5);
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        hoveredVideo.volume = Math.min(1, (hoveredVideo.volume || 0) + 0.1);
        hoveredVideo.muted = false;
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        hoveredVideo.volume = Math.max(0, (hoveredVideo.volume || 0) - 0.1);
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        e.stopPropagation();
        hoveredVideo.muted = !hoveredVideo.muted;
        hoveredVideo._userMuted = hoveredVideo.muted;
      }
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (target) {
      const isCloseBtn = target.closest(
        'svg[aria-label*="Close"], svg[aria-label*="Đóng"], button[aria-label*="Close"], button[aria-label*="Đóng"]'
      );
      const isDialogBackdrop = target.getAttribute && target.getAttribute('role') === 'dialog';
      if (isCloseBtn || isDialogBackdrop) {
        setTimeout(cleanupIfPostClosed, 30);
        setTimeout(cleanupIfPostClosed, 120);
      }
    }
  }, true);

  window.addEventListener('resize', () => {
    document.querySelectorAll('.ig-music-feed-bar').forEach(bar => {
      const post = bar.closest('article') || bar.closest('div[role="dialog"]');
      if (post) adjustFeedBarWidth(bar, post);
    });
  }, { passive: true });

  setInterval(() => {
    if (document.hidden) return;
    cleanupIfPostClosed();
    scanAndAttachStoryDownload();
    scanAndAttachProfileDownload();
    if (window.location.pathname.includes('/stories/')) {
      scanAndAttachStoryScrubber();
    } else {
      scanAndAttachVideoControllers();
    }
  }, 1200);

  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    // Chỉ kích hoạt khi có phần tử mới được thêm/bớt vào DOM (ví dụ cuộn thêm bài mới vào feed)
    // Bỏ qua các thay đổi style/attribute trong khi Instagram animate chuyển ảnh carousel
    let hasStructuralChanges = false;
    for (let i = 0; i < mutations.length; i++) {
      if (mutations[i].addedNodes.length > 0 || mutations[i].removedNodes.length > 0) {
        hasStructuralChanges = true;
        break;
      }
    }
    if (!hasStructuralChanges) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      cleanupIfPostClosed();
      scanAndAttachStoryDownload();
      scanAndAttachProfileDownload();
      if (window.location.pathname.includes('/stories/')) {
        scanAndAttachStoryScrubber();
      } else {
        scanAndAttachVideoControllers();
      }

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(scanAndAttachPlayers);
      } else {
        scanAndAttachPlayers();
      }
    }, 350);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(scanAndAttachPlayers, 150);
  setTimeout(scanAndAttachPlayers, 600);
  setTimeout(scanAndAttachProfileDownload, 200);
  setTimeout(scanAndAttachProfileDownload, 800);
})();
