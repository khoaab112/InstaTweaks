/**
 * INSTATWEAKS v3.0 - CORE MODULE
 * - Quản lý Sidebar v3.0 Drawer
 * - Ghost Story & Ghost DM Controller
 * - Clean Feed AdBlocker
 * - Làm nét Video HD (Cấp 1 & Cấp 2 - 1 Nút gạt duy nhất)
 * - Quick Profile Inspector
 * - IndexedDB Engine & Backup/Restore System
 */

(function () {
  'use strict';

  // --- 0. AN TOÀN EXTENSION CONTEXT (TRÁNH LỖI INVALIDATED KHI RELOAD EXTENSION) ---
  function isExtensionValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function safeGetURL(path) {
    try {
      if (isExtensionValid() && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(path);
      }
    } catch (_) { }
    return '';
  }

  // --- 1. QUẢN LÝ CÀI ĐẶT (SETTINGS) ---
  const DEFAULT_SETTINGS = {
    ghostStory: true,
    ghostDM: true,
    adblock: true,
    videoSharpness: true,
    ghostViewOnce: true,
    hdAvatar: true
  };

  let v3Settings = { ...DEFAULT_SETTINGS };

  function loadSettings() {
    try {
      const gs = localStorage.getItem('__igt_ghost_story__');
      const gdm = localStorage.getItem('__igt_ghost_dm__');
      const ab = localStorage.getItem('__igt_adblock__');
      const vs = localStorage.getItem('__igt_video_sharpness__');
      const ha = localStorage.getItem('__igt_hd_avatar__');
      const gvo = localStorage.getItem('__igt_ghost_view_once__');

      if (gs !== null) v3Settings.ghostStory = gs !== 'false';
      if (gdm !== null) v3Settings.ghostDM = gdm !== 'false';
      if (ab !== null) v3Settings.adblock = ab !== 'false';
      if (vs !== null) v3Settings.videoSharpness = vs !== 'false';
      if (ha !== null) v3Settings.hdAvatar = ha !== 'false';
      if (gvo !== null) v3Settings.ghostViewOnce = gvo !== 'false';
    } catch (_) { }
    syncSettingsToInjected();
  }

  function saveSettings(key, value) {
    v3Settings[key] = Boolean(value);
    try {
      if (key === 'ghostStory') localStorage.setItem('__igt_ghost_story__', String(v3Settings.ghostStory));
      if (key === 'ghostDM') localStorage.setItem('__igt_ghost_dm__', String(v3Settings.ghostDM));
      if (key === 'adblock') localStorage.setItem('__igt_adblock__', String(v3Settings.adblock));
      if (key === 'videoSharpness') localStorage.setItem('__igt_video_sharpness__', String(v3Settings.videoSharpness));
      if (key === 'hdAvatar') localStorage.setItem('__igt_hd_avatar__', String(v3Settings.hdAvatar));
      if (key === 'ghostViewOnce') localStorage.setItem('__igt_ghost_view_once__', String(v3Settings.ghostViewOnce));

      if (isExtensionValid() && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ igt_v3_settings: v3Settings }).catch(() => { });
      }
    } catch (_) { }

    syncSettingsToInjected();
    applyActiveSettings();
  }

  function syncSettingsToInjected() {
    window.dispatchEvent(new CustomEvent('__IGT_SYNC_SETTINGS__', { detail: v3Settings }));
  }

  // --- 2. CƠ SỞ DỮ LIỆU INDEXEDDB (INSTATWEAKS DB) ---
  const DB_NAME = 'InstaTweaksDB';
  const DB_VERSION = 4; // Bump v4 để khởi tạo bảng dm_vault
  let dbInstance = null;
  let dbInitPromise = null;

  async function cleanupOldInvalidMessagesInVault() {
    try {
      const db = await ensureDb();
      if (!db || !db.objectStoreNames.contains('dm_vault')) return;
      const tx = db.transaction('dm_vault', 'readwrite');
      const store = tx.objectStore('dm_vault');
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          // Tự động dọn dẹp các tin nhắn cũ trước phiên hoặc tin nhắn không bị thu hồi
          if (val.isPreExisting || !val.isUnsent || (!val.unsentAt && val.timestamp < (EXTENSION_BOOT_TIME - 120000))) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (_) { }
  }

  function initIndexedDB() {
    if (dbInitPromise) return dbInitPromise;
    dbInitPromise = new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('watchlist')) {
          db.createObjectStore('watchlist', { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('audit_logs')) {
          db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('dm_vault')) {
          const dmStore = db.createObjectStore('dm_vault', { keyPath: 'id' });
          dmStore.createIndex('threadId', 'threadId', { unique: false });
          dmStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      request.onerror = () => resolve(null);
    });
    return dbInitPromise;
  }

  async function ensureDb() {
    if (dbInstance) return dbInstance;
    return await initIndexedDB();
    cleanupOldInvalidMessagesInVault();
  }

  async function dbSaveDmMessages(messages) {
    const db = await ensureDb();
    return new Promise((resolve) => {
      if (!db || !Array.isArray(messages) || messages.length === 0) return resolve(false);
      try {
        if (!db.objectStoreNames.contains('dm_vault')) return resolve(false);
        const tx = db.transaction('dm_vault', 'readwrite');
        const store = tx.objectStore('dm_vault');
        messages.forEach(msg => {
          if (msg && msg.id) {
            // Loại bỏ các tham chiếu DOM node trước khi lưu vào IndexedDB tránh DataCloneError
            const clean = {
              id: String(msg.id),
              threadId: String(msg.threadId || ''),
              text: msg.text || '',
              mediaUrl: msg.mediaUrl || '',
              mediaType: msg.mediaType || '',
              sender: msg.sender || '',
              isSelf: Boolean(msg.isSelf),
              timestamp: msg.timestamp || Date.now(),
              isUnsent: Boolean(msg.isUnsent),
              unsentAt: msg.unsentAt || null
            };
            store.put(clean);
          }
        });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  async function dbGetDmMessagesByThread(threadId) {
    const db = await ensureDb();
    return new Promise((resolve) => {
      if (!db || !threadId) return resolve([]);
      try {
        if (!db.objectStoreNames.contains('dm_vault')) return resolve([]);
        const tx = db.transaction('dm_vault', 'readonly');
        const store = tx.objectStore('dm_vault');
        const index = store.index('threadId');
        const req = index.getAll(IDBKeyRange.only(String(threadId)));
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  async function dbGetUnsentMessages(threadId = null) {
    const db = await ensureDb();
    return new Promise((resolve) => {
      if (!db) return resolve([]);
      try {
        if (!db.objectStoreNames.contains('dm_vault')) return resolve([]);
        const tx = db.transaction('dm_vault', 'readonly');
        const store = tx.objectStore('dm_vault');
        const req = store.getAll();
        req.onsuccess = () => {
          // CHỈ LẤY CÁC TIN NHẮN THỰC SỰ BỊ THU HỒI
          let list = (req.result || []).filter(m => m.isUnsent && m.unsentAt > 0);
          if (threadId) list = list.filter(m => String(m.threadId) === String(threadId));
          list.forEach(m => {
            if (m.mediaUrl && isInstagramAvatarUrl(m.mediaUrl)) {
              m.mediaUrl = '';
              m.mediaType = '';
            }
          });
          list.sort((a, b) => (b.unsentAt || b.timestamp || 0) - (a.unsentAt || a.timestamp || 0));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  async function dbClearUnsentMessages(threadId = null) {
    const db = await ensureDb();
    return new Promise((resolve) => {
      if (!db) return resolve(false);
      try {
        if (!db.objectStoreNames.contains('dm_vault')) return resolve(false);
        const tx = db.transaction('dm_vault', 'readwrite');
        const store = tx.objectStore('dm_vault');
        if (!threadId) {
          store.clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } else {
          const index = store.index('threadId');
          const req = index.openCursor(IDBKeyRange.only(String(threadId)));
          req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              if (cursor.value.isUnsent) cursor.delete();
              cursor.continue();
            }
          };
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        }
      } catch (_) { resolve(false); }
    });
  }

  async function exportDatabaseToJSON() {
    if (!dbInstance) await initIndexedDB();
    if (!dbInstance) {
      alert('Không thể kết nối cơ sở dữ liệu IndexedDB.');
      return;
    }

    const stores = ['watchlist', 'snapshots', 'audit_logs', 'settings'];
    const backupData = {
      version: '3.0.0',
      exportedAt: new Date().toISOString(),
      settings: v3Settings,
      data: {}
    };

    let completed = 0;
    stores.forEach((storeName) => {
      try {
        const tx = dbInstance.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          backupData.data[storeName] = req.result || [];
          completed++;
          if (completed === stores.length) {
            downloadJSONBackup(backupData);
          }
        };
        req.onerror = () => {
          completed++;
          if (completed === stores.length) downloadJSONBackup(backupData);
        };
      } catch (_) {
        completed++;
        if (completed === stores.length) downloadJSONBackup(backupData);
      }
    });
  }

  function downloadJSONBackup(data) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `InstaTweaks_Backup_v3_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  async function importDatabaseFromJSON(jsonText) {
    try {
      if (!jsonText || typeof jsonText !== 'string' || !jsonText.trim().startsWith('{')) {
        return;
      }
      const parsed = JSON.parse(jsonText);
      if (!parsed || !parsed.data) {
        alert('File sao lưu không hợp lệ.');
        return;
      }
      if (!dbInstance) await initIndexedDB();
      if (!dbInstance) return;

      const stores = Object.keys(parsed.data);
      for (const sName of stores) {
        if (dbInstance.objectStoreNames.contains(sName)) {
          const tx = dbInstance.transaction(sName, 'readwrite');
          const store = tx.objectStore(sName);
          const items = parsed.data[sName];
          if (Array.isArray(items)) {
            for (const item of items) {
              store.put(item);
            }
          }
        }
      }
      if (parsed.settings) {
        Object.keys(parsed.settings).forEach((k) => saveSettings(k, parsed.settings[k]));
      }
      alert('Khôi phục dữ liệu InstaTweaks v3.0 thành công!');
      updateUIControls();
    } catch (err) {
      alert('Lỗi đọc file JSON: ' + err.message);
    }
  }

  // --- 3. BỘ LỌC LÀM NÉT VIDEO HD (CẤP 1 & CẤP 2 - 1 NÚT GẠT DUY NHẤT) ---
  function injectSVGFilters() {
    if (document.getElementById('igt-svg-filters')) return;
    const svgWrap = document.createElement('div');
    svgWrap.id = 'igt-svg-filters';
    svgWrap.style.cssText = 'position: absolute; width: 0; height: 0; pointer-events: none; opacity: 0; overflow: hidden;';
    svgWrap.innerHTML = `
      <svg width="0" height="0" version="1.1" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="igt-video-sharpen">
            <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.5 0  -0.5 3 -0.5  0 -0.5 0" />
          </filter>
        </defs>
      </svg>
    `;
    document.body.appendChild(svgWrap);
  }

  // --- CHẨN ĐOÁN TOÀN DIỆN: PHẦN CỨNG + BĂNG THÔNG MẠNG CHO LÀM NÉT VIDEO HD ---
  function getSystemPerformanceDiagnosis() {
    // 1. ĐO CẤU HÌNH PHẦN CỨNG (CPU, RAM, GPU)
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 8;

    let gpuName = '';
    let isDedicatedGpu = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
          if (/nvidia|geforce|rtx|gtx|radeon|amd|apple/i.test(gpuName)) {
            isDedicatedGpu = true;
          }
        }
      }
    } catch (_) { }

    const isHardwareGood = cores >= 4 && memory >= 4;

    // 2. ĐO BĂNG THÔNG MẠNG THỰC TẾ (DOWNLINK, PING, EFFECTIVE TYPE)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const downlink = typeof conn?.downlink === 'number' ? conn.downlink : 10; // Mbps
    const rtt = typeof conn?.rtt === 'number' ? conn.rtt : 40; // ms
    const isSaveData = Boolean(conn?.saveData);
    const is3GOr2G = conn?.effectiveType === '3g' || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g';

    // Đánh giá trạng thái mạng (Video 1080p cần tối thiểu ~4.5 - 5 Mbps để buffer mượt mà)
    let netStatus = 'good';
    let netText = `~${downlink} Mbps (Ping ${rtt}ms)`;
    let isNetworkGood = true;

    if (isSaveData || is3GOr2G || downlink < 2.5) {
      netStatus = 'bad';
      netText = isSaveData ? 'Tiết kiệm 3G/4G' : `Chậm (~${downlink} Mbps)`;
      isNetworkGood = false;
    } else if (downlink >= 2.5 && downlink < 5) {
      netStatus = 'warn';
      netText = `Vừa đủ (~${downlink} Mbps)`;
      isNetworkGood = false; // Có thể bị delay buffer nhẹ khi lướt nhanh
    } else {
      netStatus = 'good';
      netText = `Mạnh (~${downlink} Mbps, ${rtt}ms)`;
      isNetworkGood = true;
    }

    // 3. TỔNG HỢP KHUYẾN NGHỊ THỜI ĐIỂM HIỆN TẠI
    if (isHardwareGood && isNetworkGood) {
      return {
        level: 'optimal',
        badge: '⚡ Khuyên bật',
        statusText: 'Rất mượt mà',
        hwStatus: 'good',
        hwText: `Đạt chuẩn (${cores} Cores, ${memory >= 8 ? '≥8GB' : memory + 'GB'} RAM)`,
        netStatus,
        netText,
        advice: `Cả cấu hình máy lẫn băng thông mạng (~${downlink} Mbps) đều đạt chuẩn cao để phát 1080p mượt mà không lo xoay vòng chờ tải.`
      };
    } else if (isHardwareGood && !isNetworkGood) {
      return {
        level: 'moderate',
        badge: '⚠️ Mạng chậm',
        statusText: 'Băng thông yếu',
        hwStatus: 'good',
        hwText: `Đủ mạnh (${cores} Cores CPU)`,
        netStatus,
        netText,
        advice: `Máy bạn đủ mạnh nhưng băng thông mạng hiện tại (~${downlink} Mbps) hơi thấp. Ép 1080p có thể khiến video bị xoay vòng chờ tải (buffering).`
      };
    } else if (!isHardwareGood && isNetworkGood) {
      return {
        level: 'moderate',
        badge: '⚠️ Máy yếu',
        statusText: 'Phần cứng thấp',
        hwStatus: 'warn',
        hwText: `Cơ bản (${cores} Cores CPU)`,
        netStatus,
        netText,
        advice: `Băng thông mạng rất tốt nhưng CPU/GPU máy bạn có thể bị khựng khung hình khi áp bộ lọc nét. Hãy tắt nếu thấy giật lag.`
      };
    } else {
      return {
        level: 'low',
        badge: '🛑 Khuyên tắt',
        statusText: 'Không khuyến nghị',
        hwStatus: 'bad',
        hwText: 'Cấu hình thấp',
        netStatus,
        netText,
        advice: `Cả máy lẫn mạng đều đang bị hạn chế. Bạn nên tắt chế độ này để Instagram tải và phát video ổn định nhất.`
      };
    }
  }

  // TỐI ƯU HIỆU NĂNG: Chỉ áp dụng bộ lọc cho video ĐANG TRONG KHUNG NHÌN (Viewport)
  let videoIntersectionObserver = null;
  function getOrCreateVideoObserver() {
    if (!videoIntersectionObserver && typeof IntersectionObserver !== 'undefined') {
      videoIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const vid = entry.target;
          if (entry.isIntersecting && v3Settings.videoSharpness) {
            if (!vid.classList.contains('igt-sharp-video')) {
              vid.classList.add('igt-sharp-video');
            }
          } else {
            vid.classList.remove('igt-sharp-video');
          }
        });
      }, { threshold: 0.15 });
    }
    return videoIntersectionObserver;
  }

  function applyVideoSharpness() {
    // Xóa bỏ hoàn toàn logo / badge HD PRO trên video theo yêu cầu
    const existingBadges = document.querySelectorAll('.igt-video-hd-badge');
    existingBadges.forEach((b) => b.remove());

    const isEnabled = v3Settings.videoSharpness;
    const observer = getOrCreateVideoObserver();

    if (!isEnabled) {
      document.querySelectorAll('.igt-sharp-video').forEach((v) => {
        v.classList.remove('igt-sharp-video');
        v.removeAttribute('data-igt-sharp-tracked');
        if (observer) observer.unobserve(v);
      });
      return;
    }

    const videos = document.querySelectorAll('video:not([data-igt-sharp-tracked])');
    videos.forEach((video) => {
      video.setAttribute('data-igt-sharp-tracked', '1');
      if (observer) {
        observer.observe(video);
      } else if (!video.classList.contains('igt-sharp-video')) {
        video.classList.add('igt-sharp-video');
      }
    });
  }

  // --- 4. CHẶN QUẢNG CÁO NEWFEED (CLEAN FEED ADBLOCK CHÍNH XÁC 100%, KHÔNG LỖI KHOẢNG TRẮNG) ---
  const AD_TAG_TEXTS = new Set([
    'ad', 'sponsored', 'được tài trợ', 'quảng cáo', 'patrocinado',
    'publicidad', 'gesponsert', 'sponsorisé', 'sponsorizzato', 'sponsorowane', 'anzeige'
  ]);

  // CHỈ GIỮ CÁC TỪ KHÓA NÚT KÊU GỌI QUẢNG CÁO (CTA) ĐẶC TRƯNG - TUYỆT ĐỐI KHÔNG DÙNG "XEM THÊM" HOẶC "MORE"
  const AD_CTA_KEYWORDS = [
    'apply now', 'learn more', 'shop now', 'sign up', 'install now',
    'get offer', 'book now', 'contact us', 'order now', 'get quote',
    'đăng ký ngay', 'tìm hiểu thêm', 'mua ngay', 'tải ngay'
  ];

  let blockedAdsCount = 0;

  function findExactPostContainer(node) {
    if (!node) return null;
    const art = node.closest('article');
    if (art) return art;

    let cur = node.parentElement;
    while (cur && cur !== document.body && cur.tagName !== 'MAIN') {
      // Dừng lại ngay lập tức ở container đầu tiên có chứa nút Like và Bình luận của bài viết
      const hasLike = cur.querySelector && cur.querySelector('svg[aria-label*="Like"], svg[aria-label*="Thích"]');
      const hasComment = cur.querySelector && cur.querySelector('svg[aria-label*="Comment"], svg[aria-label*="Bình luận"]');
      if (hasLike && hasComment) {
        return cur; // Khớp chuẩn xác thẻ bài viết, không trèo lên container ảo hay khung feed cha
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function hideAdPost(post) {
    if (!post || post.classList.contains('igt-ad-blocked')) return;
    post.classList.add('igt-ad-blocked');
    post.style.setProperty('display', 'none', 'important');
    post.style.setProperty('height', '0px', 'important');
    post.style.setProperty('min-height', '0px', 'important');
    post.style.setProperty('max-height', '0px', 'important');
    post.style.setProperty('margin', '0px', 'important');
    post.style.setProperty('padding', '0px', 'important');
    post.style.setProperty('overflow', 'hidden', 'important');

    // Nếu thẻ cha là wrapper 1-1 của bài viết trong bộ cuộn ảo thì thu gọn luôn để tránh khoảng trống
    const parent = post.parentElement;
    if (parent && parent.children.length === 1 && parent.tagName !== 'MAIN' && parent.tagName !== 'BODY') {
      parent.classList.add('igt-ad-blocked');
      parent.style.setProperty('display', 'none', 'important');
      parent.style.setProperty('height', '0px', 'important');
      parent.style.setProperty('min-height', '0px', 'important');
      parent.style.setProperty('margin', '0px', 'important');
      parent.style.setProperty('padding', '0px', 'important');
    }

    blockedAdsCount++;
    updateAdBlockCountUI();
  }

  function unblockAllAds() {
    document.querySelectorAll('.igt-ad-blocked').forEach((el) => {
      el.classList.remove('igt-ad-blocked');
      el.style.removeProperty('display');
      el.style.removeProperty('height');
      el.style.removeProperty('min-height');
      el.style.removeProperty('max-height');
      el.style.removeProperty('margin');
      el.style.removeProperty('padding');
      el.style.removeProperty('overflow');
    });
    document.querySelectorAll('[data-igt-ad-checked]').forEach((el) => {
      el.removeAttribute('data-igt-ad-checked');
    });
    blockedAdsCount = 0;
    updateAdBlockCountUI();
  }

  function cleanFeedAds() {
    if (!v3Settings.adblock) {
      unblockAllAds();
      return;
    }

    // 1. Quét tìm các bài viết (article) mới xuất hiện chưa được kiểm tra
    const articles = document.querySelectorAll('article:not([data-igt-ad-checked])');
    if (articles.length === 0) return;

    articles.forEach((art) => {
      art.setAttribute('data-igt-ad-checked', '1');

      // 1. Kiểm tra link chuyển hướng quảng cáo (l.instagram.com)
      const adLink = art.querySelector('a[href*="l.instagram.com"], a[href*="instagram.com/ads/"]');
      if (adLink) {
        hideAdPost(art);
        return;
      }

      // 2. Quét nhanh nhãn "Ad" / "Được tài trợ" hoặc nút CTA quảng cáo trong article
      const candidates = art.querySelectorAll('header span, header a, div[role="button"], a[role="link"], button');
      for (let i = 0; i < candidates.length; i++) {
        const el = candidates[i];
        if (el.children.length > 2) continue;
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (!text || text.length > 25) continue;

        let isAdMatch = false;
        if (AD_TAG_TEXTS.has(text)) {
          isAdMatch = true;
        } else if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') {
          if (AD_CTA_KEYWORDS.some((cta) => text === cta || text === cta + ' >' || text.startsWith(cta + ' '))) {
            isAdMatch = true;
          }
        }

        if (isAdMatch) {
          hideAdPost(art);
          break;
        }
      }
    });
  }

  function updateAdBlockCountUI() {
    const el = document.getElementById('igt-adblock-count-label');
    if (el) el.innerText = `(Đã lọc: ${blockedAdsCount})`;
  }

  // --- 4.1. TÌM VỊ TRÍ HEADER CỘT TIN NHẮN TRỰC TIẾP (DIRECT INBOX HEADER) ---
  function findDirectHeaderTarget() {
    if (!window.location.pathname.includes('/direct/')) return null;

    // 1. Tìm nút Tạo tin nhắn mới (Pencil/New message icon) trên đầu danh sách Direct
    const newMsgIcon = document.querySelector(
      'a[href*="/direct/new"], ' +
      'svg[aria-label="New message"], svg[aria-label="Tin nhắn mới"], ' +
      'svg[aria-label*="message" i], svg[aria-label*="tin nhắn" i]'
    );

    if (newMsgIcon) {
      const btn = newMsgIcon.closest('div[role="button"], a, button') || newMsgIcon;
      const rect = btn.getBoundingClientRect();
      // Đảm bảo nút này nằm ở dải header trên cùng của cột Direct (top < 130px, left giữa 60px và 550px)
      if (rect.top >= 0 && rect.top < 130 && rect.left >= 60 && rect.left < 550) {
        return { insertBefore: btn, container: btn.parentElement };
      }
    }

    // 2. Tìm phần hiển thị Username ở header Direct (thường có chevron v kế bên)
    const chevron = document.querySelector(
      'div[role="button"] svg[aria-label*="chevron" i], ' +
      'div[role="button"] svg[aria-label*="Down chevron" i], ' +
      'div[role="button"] svg[aria-label*="hướng xuống" i]'
    );
    if (chevron) {
      const userBtn = chevron.closest('div[role="button"]') || chevron;
      const rect = userBtn.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 130 && rect.left >= 60 && rect.left < 550) {
        return { insertAfter: userBtn, container: userBtn.parentElement };
      }
    }

    // 3. Quét thẻ header trong cột Direct Inbox
    const headers = document.querySelectorAll('header');
    for (const h of headers) {
      const rect = h.getBoundingClientRect();
      if (rect.top >= 0 && rect.top < 130 && rect.left >= 60 && rect.left < 550 && rect.width > 120) {
        return { container: h };
      }
    }

    return null;
  }

  // --- 4.2. TÌM VÀ CẬP NHẬT STATUS BADGE TRÊN CỬA SỔ CHAT POPUP (GÓC PHẢI DƯỚI) ---
  function findFloatingChatBox() {
    if (window.location.pathname.startsWith('/direct/')) return null;

    // 1. Tìm thông qua dialog/popup chat nổi
    const popups = document.querySelectorAll('div[role="dialog"], section[role="region"], div[data-pagelet*="Chat" i]');
    for (const el of popups) {
      if (el.querySelector('textarea, div[role="textbox"]')) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 200 && rect.right > window.innerWidth - 650) {
          return el;
        }
      }
    }

    // 2. Tìm qua input tin nhắn trong popup chat
    const inputs = document.querySelectorAll(
      'div[role="textbox"][aria-label*="message" i], div[role="textbox"][placeholder*="message" i], ' +
      'div[role="textbox"][aria-label*="tin nhắn" i], div[role="textbox"][placeholder*="tin nhắn" i], ' +
      'textarea[placeholder*="message" i], textarea[placeholder*="tin nhắn" i]'
    );
    for (const input of inputs) {
      let el = input.parentElement;
      let depth = 0;
      while (el && el !== document.body && depth < 8) {
        const rect = el.getBoundingClientRect();
        if (rect.width >= 240 && rect.width <= 500 && rect.height >= 240 && rect.bottom >= window.innerHeight - 80) {
          return el;
        }
        el = el.parentElement;
        depth++;
      }
    }

    return null;
  }

  function updateFloatingChatBadge() {
    let badge = document.getElementById('igt-v3-floating-dm-badge');

    // Nếu tính năng Ghost DM bị tắt -> Ẩn badge nếu có
    if (!v3Settings.ghostDM) {
      if (badge) badge.style.display = 'none';
      return;
    }

    const chatBox = findFloatingChatBox();
    if (!chatBox) {
      if (badge) badge.style.display = 'none';
      return;
    }

    const chatRect = chatBox.getBoundingClientRect();
    if (chatRect.width === 0 || chatRect.height === 0 || chatRect.top <= 0) {
      if (badge) badge.style.display = 'none';
      return;
    }

    const catIconUrl = safeGetURL('icons/dm_cat.gif');

    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'igt-v3-floating-dm-badge';
      badge.className = 'igt-v3-stealth-badge igt-v3-floating-dm-badge';
      badge.setAttribute('title', 'InstaTweaks: Chế độ Đọc tin nhắn Ẩn danh đang BẬT (Bấm để mở cài đặt)');
      badge.innerHTML = `
        <img class="igt-v3-dm-cat-img" src="${catIconUrl}" alt="Stealth Cat" />
        <span class="igt-v3-stealth-dot"></span>
        <span class="igt-v3-stealth-text">Ẩn danh</span>
      `;
      badge.addEventListener('click', () => openV3Drawer());
      document.body.appendChild(badge);
    }

    // Đặt vị trí chính xác ở dải màu đỏ ngay phía trên đỉnh của cửa sổ chat popup
    badge.style.display = 'inline-flex';
    const bottomPx = Math.max(10, Math.round(window.innerHeight - chatRect.top + 8));
    badge.style.setProperty('bottom', `${bottomPx}px`, 'important');

    // Căn giữa theo chiều ngang của hộp chat popup
    const badgeWidth = badge.offsetWidth || 115;
    const centerLeft = Math.round(chatRect.left + (chatRect.width - badgeWidth) / 2);
    badge.style.setProperty('left', `${centerLeft}px`, 'important');
    badge.style.setProperty('right', 'auto', 'important');
    badge.style.setProperty('top', 'auto', 'important');
  }

  // --- STATUS BADGE (GHOST STORY Ở SIDEBAR & ẨN DANH TRÊN HEADER TIN NHẮN) ---
  function updateGhostStatusBadge() {
    updateFloatingChatBadge();

    // Xóa các banner cũ nếu có
    const oldStory = document.getElementById('igt-ghost-story-banner');
    if (oldStory) oldStory.remove();
    const oldDm = document.getElementById('igt-ghost-dm-banner');
    if (oldDm) oldDm.remove();

    const isStory = window.location.pathname.includes('/stories/');
    const isDM = window.location.pathname.includes('/direct/');

    let badgeText = '';
    if (isStory && v3Settings.ghostStory) {
      badgeText = 'Ghost Story';
    } else if (isDM && v3Settings.ghostDM) {
      badgeText = 'Ẩn danh';
    }

    let badge = document.getElementById('igt-v3-stealth-badge');

    // Nếu không thuộc Story/DM hoặc tính năng tương ứng bị tắt -> Ẩn/Xóa badge
    if (!badgeText) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'igt-v3-stealth-badge';
      badge.addEventListener('click', () => openV3Drawer());
    }

    // TRƯỜNG HỢP 1: TIN NHẮN TRỰC TIẾP (DIRECT MESSAGES - GHOST DM)
    // Đưa lên thanh tiêu đề Direct theo hướng mũi tên và dùng icon chú mèo GIF động
    if (isDM) {
      const catIconUrl = safeGetURL('icons/dm_cat.gif');

      badge.className = 'igt-v3-stealth-badge igt-v3-dm-header';
      badge.setAttribute('title', 'InstaTweaks: Chế độ Đọc tin nhắn Ẩn danh đang BẬT (Bấm để mở cài đặt)');
      badge.innerHTML = `
        <img class="igt-v3-dm-cat-img" src="${catIconUrl}" alt="Stealth Cat" />
        <span class="igt-v3-stealth-dot"></span>
        <span class="igt-v3-stealth-text">Ẩn danh</span>
      `;

      const targetHeader = findDirectHeaderTarget();
      if (targetHeader) {
        badge.classList.remove('igt-v3-dm-fixed', 'igt-v3-fixed-fallback');
        if (targetHeader.insertBefore && targetHeader.insertBefore.parentNode) {
          if (targetHeader.insertBefore.previousSibling !== badge) {
            targetHeader.insertBefore.parentNode.insertBefore(badge, targetHeader.insertBefore);
          }
        } else if (targetHeader.insertAfter && targetHeader.insertAfter.parentNode) {
          if (targetHeader.insertAfter.nextSibling !== badge) {
            targetHeader.insertAfter.parentNode.insertBefore(badge, targetHeader.insertAfter.nextSibling);
          }
        } else if (targetHeader.container) {
          if (badge.parentNode !== targetHeader.container) {
            targetHeader.container.appendChild(badge);
          }
        }
      } else {
        // Fallback cố định ở vị trí thanh tiêu đề Direct nếu DOM chưa kịp mount
        badge.classList.remove('igt-v3-dm-header');
        badge.classList.add('igt-v3-dm-fixed');
        if (badge.parentNode !== document.body) {
          document.body.appendChild(badge);
        }
      }
      return;
    }

    // TRƯỜNG HỢP 2: GHOST STORY (XEM STORY ẨN DANH Ở VÙNG ĐỎ BÊN TRÁI DƯỚI LOGO INSTAGRAM)
    if (isStory) {
      const storyCatUrl = safeGetURL('icons/story_cat.gif');

      badge.className = 'igt-v3-stealth-badge igt-v3-story-badge';
      badge.setAttribute('title', 'InstaTweaks: Chế độ Xem Story Ẩn danh đang BẬT (Bấm để mở cài đặt)');
      badge.innerHTML = `
        <img class="igt-v3-story-cat-img" src="${storyCatUrl}" alt="Ghost Story Cat" />
        <span class="igt-v3-stealth-dot"></span>
        <span class="igt-v3-stealth-text">Ghost Story</span>
      `;

      // Trong giao diện Story, luôn gắn trực tiếp vào body với vị trí cố định ngay dưới logo Instagram (vùng đỏ)
      if (badge.parentNode !== document.body) {
        document.body.appendChild(badge);
      }
      return;
    }

    // TRƯỜNG HỢP 3: CÁC TRANG KHÁC (FALLBACK NẾU CÓ)
    const stealthIconUrl = safeGetURL('icons/stealth.png');

    badge.className = 'igt-v3-stealth-badge';
    badge.setAttribute('title', 'InstaTweaks: Chế độ Ẩn danh đang BẬT');
    badge.innerHTML = `
      <img class="igt-v3-stealth-icon-img" src="${stealthIconUrl}" alt="Stealth" />
      <span class="igt-v3-stealth-dot"></span>
      <span class="igt-v3-stealth-text">${badgeText}</span>
    `;

    const navBtn = document.getElementById('igt-v3-sidebar-nav-btn');
    if (navBtn && navBtn.parentNode) {
      if (navBtn.classList.contains('igt-v3-fixed-fallback')) {
        badge.classList.add('igt-v3-fixed-fallback');
        if (badge.parentNode !== document.body) {
          document.body.appendChild(badge);
        }
      } else {
        badge.classList.remove('igt-v3-fixed-fallback');
        if (navBtn.nextSibling !== badge) {
          navBtn.parentNode.insertBefore(badge, navBtn.nextSibling);
        }
      }
    } else {
      badge.classList.add('igt-v3-fixed-fallback');
      if (badge.parentNode !== document.body) {
        document.body.appendChild(badge);
      }
    }
  }

  // --- 4.2. TỰ ĐỘNG ĐỒNG BỘ ĐÃ XEM KHI NGƯỜI DÙNG THỰC HIỆN TRẢ LỜI TIN NHẮN ---
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.location.pathname.includes('/direct/')) {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.getAttribute('role') === 'textbox' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        window.dispatchEvent(new CustomEvent('__IGT_USER_SENT_DM__'));
      }
    }
  }, true);

  window.addEventListener('click', (e) => {
    if (!window.location.pathname.includes('/direct/')) return;
    const target = e.target;
    if (!target) return;
    const sendBtn = target.closest('div[role="button"], button');
    if (sendBtn) {
      const txt = (sendBtn.innerText || sendBtn.textContent || '').trim().toLowerCase();
      const aria = (sendBtn.getAttribute('aria-label') || '').toLowerCase();
      if (txt === 'send' || txt === 'gửi' || aria.includes('send') || aria.includes('gửi')) {
        window.dispatchEvent(new CustomEvent('__IGT_USER_SENT_DM__'));
      }
    }
  }, true);

  // =========================================================================
  // --- 4.3. CHẾ ĐỘ TIN NHẮN TỐI THƯỢNG (PHASE 3.5 - ANTI-UNSEND & GHOST VIEW ONCE) ---
  // =========================================================================

  let activeDmItemsMap = new Map(); // id -> item data

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Lắng nghe sự kiện đồng bộ từ injected.js khi tải tin nhắn qua API / Network

  // Helper: Lấy thông tin đối phương trong khung chat
  function getRealChatPartnerInfo() {
    let name = '';
    let avatar = '';

    // 1. Kiểm tra trong floating chat popup
    const floatingBox = document.querySelector('div[aria-label*="Chat"], div[aria-label*="Trò chuyện"]');
    if (floatingBox) {
      const imgs = Array.from(floatingBox.querySelectorAll('header img, div[role="button"] img'));
      if (imgs.length > 0) {
        avatar = imgs[0].currentSrc || imgs[0].src;
      }
      const titleCandidates = floatingBox.querySelectorAll('h2, span[dir="auto"], div[dir="auto"]');
      if (titleCandidates.length > 0) {
        name = titleCandidates[0].innerText.trim();
      }
    }

    // 2. Kiểm tra trong trang Direct chính (/direct/t/...)
    if (!name || !avatar) {
      const mainChat = document.querySelector('div[role="main"], main');
      if (mainChat) {
        const header = mainChat.querySelector('header') || mainChat.querySelector('div[style*="border-bottom"]');
        if (header) {
          const hImgs = Array.from(header.querySelectorAll('img')).filter(img => {
            const src = img.currentSrc || img.src || '';
            return src && !src.includes('emoji.php') && !src.includes('/rsrc.php/');
          });
          if (hImgs.length > 0 && !avatar) {
            avatar = hImgs[0].currentSrc || hImgs[0].src;
            const alt = hImgs[0].getAttribute('alt') || '';
            if (alt && !alt.toLowerCase().includes('profile') && !alt.toLowerCase().includes('avatar')) {
              name = alt;
            }
          }
          if (!name) {
            const hTitles = header.querySelectorAll('h1, h2, h3, span[dir="auto"]');
            for (const el of hTitles) {
              const t = (el.innerText || '').trim();
              if (t && t !== 'Messages' && t !== 'Tin nhắn' && !t.includes('Active') && !t.includes('Hoạt động') && t.length < 50) {
                name = t;
                break;
              }
            }
          }
        }
      }
    }

    // 3. Tra cứu từ thanh danh sách chat (active thread item)
    if (!name || !avatar) {
      const activeThread = document.querySelector('a[href*="/direct/t/"][aria-current="page"], [role="listitem"] [aria-selected="true"], [role="navigation"] a[href*="/direct/t/"]');
      if (activeThread) {
        const img = activeThread.querySelector('img');
        if (img && !avatar) avatar = img.currentSrc || img.src;
        const span = activeThread.querySelector('span[dir="auto"]');
        if (span && !name) name = span.innerText.trim();
      }
    }

    return { name, avatar };
  }

  function showUnsendAlertBanner(item) {
    // Deprecated / Cancelled
  }

  function renderInlineUnsendCard(item, containerEl, parentContainer, nextSiblingNode) {
    // Deprecated / Cancelled
  }

  async function showUnsendHistoryModal(threadId = null) {
    // Deprecated / Cancelled
  }

  // MODAL XEM ẢNH/VIDEO TỰ HỦY (VIEW ONCE)
  function showViewOnceModal(mediaItem) {
    if (!mediaItem || !mediaItem.mediaUrl) return;

    let modal = document.getElementById('igt-view-once-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'igt-view-once-modal';
      modal.className = 'igt-v3-vo-modal';
      document.body.appendChild(modal);
    }
    modal.classList.remove('igt-hidden');
    modal.style.display = 'flex';

    modal.innerHTML = `
      <div class="igt-v3-vo-backdrop"></div>
      <div class="igt-v3-vo-dialog">
        <div class="igt-v3-vo-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            <span style="font-weight: 700; font-size: 15px; color: #fff;">Phương tiện Xem 1 Lần (Khôi phục bởi InstaTweaks)</span>
          </div>
          <button id="igt-vo-close-btn" class="igt-v3-unsend-close-btn" title="Đóng">✕</button>
        </div>
        <div class="igt-v3-vo-body" style="padding: 18px; text-align: center;">
          ${mediaItem.mediaType === 'video' ? `
            <video src="${mediaItem.mediaUrl}" controls autoplay style="max-width: 100%; max-height: 70vh; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.6);"></video>
            <div style="margin-top: 14px;"><a href="${mediaItem.mediaUrl}" target="_blank" download="view_once_video.mp4" class="igt-v3-download-link" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-weight: 600;">⬇️ Tải video gốc</a></div>
          ` : `
            <img src="${mediaItem.mediaUrl}" style="max-width: 100%; max-height: 70vh; border-radius: 12px; object-fit: contain; box-shadow: 0 8px 30px rgba(0,0,0,0.6);" alt="Ảnh tự hủy" />
            <div style="margin-top: 14px;"><a href="${mediaItem.mediaUrl}" target="_blank" download="view_once_photo.jpg" class="igt-v3-download-link" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; font-weight: 600;">⬇️ Tải ảnh gốc</a></div>
          `}
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('#igt-vo-close-btn');
    const backdrop = modal.querySelector('.igt-v3-vo-backdrop');
    const closeModal = () => {
      modal.classList.add('igt-hidden');
      modal.style.display = 'none';
    };
    if (closeBtn) closeBtn.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;
  }

  // --- 4.4. QUÉT NÚT XEM ẢNH/VIDEO TỰ HỦY TRONG CHAT (VIEW ONCE PILL) ---
  function scanAndAttachViewOnceButtons() {
    const containers = getActiveChatContainers();
    if (containers.length === 0) return;

    if (v3Settings.ghostViewOnce) {
      containers.forEach(c => {
        const visualCandidates = Array.from(c.root.querySelectorAll('[aria-roledescription="message"], [roledescription="message"]'))
          .filter(el => !el.closest('nav, [role="navigation"], aside'));

        visualCandidates.forEach(async row => {
          if (row.getAttribute('data-igt-vo-checked')) return;
          const text = (row.innerText || '').toLowerCase();
          const isExpiringMedia = text.includes('phát lại') || text.includes('1 lần') || text.includes('2 lần') ||
            text.includes('ứng dụng di động') || text.includes('mobile app') ||
            text.includes('xem ảnh') || text.includes('xem video') ||
            text.includes('photo') || text.includes('video') ||
            text.includes('view photo') || text.includes('view video') ||
            text.includes('ảnh xem 1 lần') || text.includes('opened') || text.includes('đã mở');

          if (isExpiringMedia) {
            let matchedItem = null;
            for (const item of activeDmItemsMap.values()) {
              if (item.isVisual && item.mediaUrl) {
                matchedItem = item;
                break;
              }
            }
            if (!matchedItem && c.id) {
              const cached = await dbGetDmMessagesByThread(c.id);
              matchedItem = cached.find(it => it.isVisual && it.mediaUrl);
            }

            if (matchedItem && matchedItem.mediaUrl) {
              row.setAttribute('data-igt-vo-checked', '1');
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'igt-v3-view-once-pill';
              btn.innerHTML = `<span>👁️ Mở ${matchedItem.mediaType === 'video' ? 'video' : 'ảnh'} tự hủy (InstaTweaks)</span>`;
              btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                showViewOnceModal(matchedItem);
              };
              row.appendChild(btn);
            }
          }
        });
      });
    }
  }

  // --- BỘ QUAN SÁT & BẮT TIN NHẮN THU HỒI TOÀN DIỆN (FULL DIRECT & FLOATING POPUP) ---
  function getActiveChatContainers() {
    const list = [];

    // 1. Direct page chính quy (/direct/): Luôn lấy main hoặc div[role="main"] để bao trọn 100% khung tin nhắn
    if (window.location.pathname.includes('/direct/')) {
      const match = window.location.pathname.match(/\/direct\/t\/([^\/]+)/);
      const mainChat = document.querySelector('div[role="main"], main');
      if (mainChat) {
        list.push({
          id: match ? match[1] : 'direct_page',
          root: mainChat,
          isFloating: false
        });
      }
    }

    // 2. Floating Popup Chat (ngoài trang chủ hoặc bất kỳ trang nào)
    const floatingBox = findFloatingChatBox();
    if (floatingBox) {
      const userEl = floatingBox.querySelector('h1, h2, h3, span[dir="auto"], div[dir="auto"]');
      const title = (userEl?.innerText || 'popup_chat').trim();
      list.push({
        id: 'floating_' + title,
        root: floatingBox,
        isFloating: true
      });
    }
    return list;
  }

  // Trích xuất Media thật trong tin nhắn, TUYỆT ĐỐI LOẠI TRỪ ẢNH ĐẠI DIỆN (AVATAR)
  function isInstagramAvatarUrl(src) {
    if (!src || typeof src !== 'string') return false;
    const lower = src.toLowerCase();
    if (lower.includes('/t51.2885-19/') || lower.includes('-19/') || lower.includes('s150x150') || lower.includes('s320x320') || lower.includes('s50x50') || lower.includes('/profile_pic')) return true;
    return false;
  }

  function extractRealMessageMedia(node) {
    if (!node) return { mediaUrl: '', mediaType: '' };
    const video = node.querySelector('video');
    if (video && video.src && !video.src.startsWith('blob:')) {
      return { mediaUrl: video.src, mediaType: 'video' };
    }
    const audio = node.querySelector('audio');
    if (audio && audio.src) {
      return { mediaUrl: audio.src, mediaType: 'audio' };
    }

    // Lọc ảnh: TUYỆT ĐỐI LOẠI BỎ AVATAR
    const imgs = Array.from(node.querySelectorAll('img')).filter(img => {
      const src = img.currentSrc || img.src || '';
      if (!src) return false;
      if (isInstagramAvatarUrl(src)) return false;
      if (img.closest('a[href*="/"]') && !img.closest('[aria-roledescription="message"], [roledescription="message"]')) return false;
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      if (alt.includes('profile picture') || alt.includes('ảnh đại diện') || alt.includes('avatar')) return false;
      if (src.includes('emoji.php') || src.includes('/rsrc.php/')) return false;
      const w = img.naturalWidth || img.clientWidth || img.width || 0;
      const h = img.naturalHeight || img.clientHeight || img.height || 0;
      if ((w > 0 && w <= 50) || (h > 0 && h <= 50)) return false;
      return true;
    });

    if (imgs.length > 0 && imgs[0].src && !isInstagramAvatarUrl(imgs[0].src)) {
      return { mediaUrl: imgs[0].currentSrc || imgs[0].src, mediaType: 'image' };
    }
    return { mediaUrl: '', mediaType: '' };
  }

  // Bộ theo dõi trạng thái các tin nhắn đang hiển thị theo từng cuộc trò chuyện
  const EXTENSION_BOOT_TIME = Date.now();
  const threadInitialScanDone = new Set();
  let lastChatScrollTime = 0;

  // containerId -> Map(msgId -> msgData)
  const trackedMessagesByContainer = new Map();
  let currentActiveThreadId = '';

  function monitorLiveChatMessages() {
    // Deprecated / Cancelled
  }

  // Anti-Unsend task cancelled / deprecated

  // =========================================================================
  // --- 4.5. BỘ XEM & TẢI ẢNH ĐẠI DIỆN FULL HD 1080P & ẢNH BÌA HIGHLIGHT ---
  // =========================================================================

  const hdAvatarCache = new Map(); // username/highlightId -> result
  let activeHoverPopover = null;
  let popoverHideTimer = null;
  let currentTargetInfo = null;

  // Kiểm tra xem trang hiện tại có phải trang Profile người dùng hay không (ví dụ: instagram.com/nguy_er/)
  function isUserProfilePage() {
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null; // Trang chủ feed /

    // Các đường dẫn hệ thống tuyệt đối không phải profile cá nhân
    const systemRoutes = [
      'explore', 'direct', 'reels', 'stories', 'accounts', 'p', 'reel', 'tv',
      'home', 'settings', 'legal', 'your_activity', 'archive', 'emails', 'developer',
      'about', 'privacy', 'terms', 'directory'
    ];

    // Nếu URL đang xem story, reel, post, tin nhắn -> Tuyệt đối không thực thi
    if (path.includes('/stories/') || path.includes('/p/') || path.includes('/reel/') || path.includes('/direct/')) {
      return null;
    }

    const first = parts[0].toLowerCase();
    if (systemRoutes.includes(first)) return null;

    // Profile page chỉ có 1 cấp /username/ hoặc tối đa 2 cấp /username/saved/ hoặc /username/tagged/
    if (parts.length > 2) return null;
    if (parts.length === 2 && !['saved', 'tagged'].includes(parts[1].toLowerCase())) {
      return null;
    }

    return parts[0];
  }

  async function fetchHdHighlightCover(highlightId, fallbackUrl) {
    if (!highlightId) return fallbackUrl;
    if (hdAvatarCache.has('hl_' + highlightId)) {
      return hdAvatarCache.get('hl_' + highlightId);
    }

    let hdUrl = fallbackUrl;
    try {
      const csrf = getCookie('csrftoken') || '';
      const res = await fetch(`https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight%3A${encodeURIComponent(highlightId)}`, {
        headers: {
          'X-CSRFToken': csrf,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'X-ASBD-ID': '129477'
        },
        credentials: 'include'
      });

      if (res.ok) {
        const j = await res.json();
        const reelKey = 'highlight:' + highlightId;
        const reel = j.reels?.[reelKey] || (j.reels ? Object.values(j.reels)[0] : null);
        if (reel && reel.cover_media) {
          const cover = reel.cover_media.cropped_image_version?.url || reel.cover_media.image_versions2?.candidates?.[0]?.url;
          if (cover) hdUrl = cover;
        }
      }
    } catch (_) { }

    hdAvatarCache.set('hl_' + highlightId, hdUrl);
    return hdUrl;
  }

  async function fetchHdAvatarInfo(username, fallbackUrl) {
    if (!username) {
      return {
        username: '',
        fullName: 'Ảnh đại diện',
        hdUrl: fallbackUrl || '',
        isVerified: false
      };
    }

    const cleanUname = username.replace(/^@|\/$/g, '').trim();
    if (hdAvatarCache.has(cleanUname)) {
      return hdAvatarCache.get(cleanUname);
    }

    let hdUrl = fallbackUrl || '';
    let fullName = cleanUname;
    let isVerified = false;

    try {
      const csrf = getCookie('csrftoken') || '';
      const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUname)}`, {
        headers: {
          'X-CSRFToken': csrf,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'X-ASBD-ID': '129477'
        },
        credentials: 'include'
      });

      if (res.ok) {
        const j = await res.json();
        const u = j.data?.user || j.user;
        if (u) {
          hdUrl = u.profile_pic_url_hd || u.hd_profile_pic_url_info?.url || u.profile_pic_url || fallbackUrl;
          fullName = u.full_name || cleanUname;
          isVerified = Boolean(u.is_verified);
        }
      }
    } catch (_) { }

    const result = {
      username: cleanUname,
      fullName: fullName,
      hdUrl: hdUrl,
      isVerified: isVerified
    };

    hdAvatarCache.set(cleanUname, result);
    return result;
  }

  function findAvatarElementAndInfo(target) {
    if (!target) return null;

    // Tuyệt đối không can thiệp nếu URL đang là Story hoặc đang mở Story Viewer
    if (window.location.pathname.includes('/stories/') || document.querySelector('section[role="region"]') || (target.closest && target.closest('section[role="region"]'))) {
      return null;
    }

    // 1. Chỉ thực thi trên trang Profile cá nhân
    const profileUsername = isUserProfilePage();
    if (!profileUsername) return null;

    // 2. Tuyệt đối bỏ qua nếu nằm trong:
    // - Thanh điều hướng bên trái / mobile nav (nav, [role="navigation"], aside)
    // - Lưới bài viết (article, a[href*="/p/"], a[href*="/reel/"])
    // - Bảng thông báo (Notifications), Hộp tin nhắn (Direct/Chat), Khung tìm kiếm (Search)
    // - Bất kỳ popup / modal nào (div[role="dialog"])
    if (target.closest('nav, [role="navigation"], aside, article, div[role="dialog"], [aria-label*="Notification" i], [aria-label*="Thông báo" i], [aria-label*="Search" i], [aria-label*="Tìm kiếm" i], [aria-label*="Direct" i], [aria-label*="Chat" i], [aria-label*="Tin nhắn" i], a[href*="/p/"], a[href*="/reel/"]')) {
      return null;
    }

    // 3. Phải nằm trong vùng nội dung chính <main>
    const mainEl = target.closest('main');
    if (!mainEl) return null;

    // --- TRƯỜNG HỢP A: ẢNH BÌA HIGHLIGHTS (TIN NỔI BẬT) ---
    const hLink = target.closest('a[href*="/stories/highlights/"]');
    if (hLink) {
      const hImg = hLink.querySelector('img') || (target.tagName === 'IMG' ? target : null);
      if (hImg) {
        const src = hImg.currentSrc || hImg.src || '';
        if (src && !src.includes('emoji.php') && !src.includes('/rsrc.php/')) {
          let highlightId = '';
          const hm = (hLink.getAttribute('href') || '').match(/\/stories\/highlights\/([0-9]+)/);
          if (hm && hm[1]) highlightId = hm[1];

          // Lấy Title của Highlight (chữ hiển thị ngay dưới vòng tròn)
          let highlightTitle = '';
          const hWrapper = hLink.closest('li, [role="menuitem"], [role="button"]') || hLink.parentElement;
          if (hWrapper) {
            const titleSpan = hWrapper.querySelector('div[dir="auto"], span[dir="auto"], span');
            if (titleSpan) {
              const tText = titleSpan.innerText.trim();
              if (tText && tText.length < 50) highlightTitle = tText;
            }
          }
          const alt = (hImg.getAttribute('alt') || '').trim();
          if (!highlightTitle && alt && alt.length < 40 && !/profile picture|ảnh đại diện|avatar/i.test(alt)) {
            highlightTitle = alt;
          }

          return {
            isHighlight: true,
            highlightId: highlightId,
            highlightTitle: highlightTitle || 'Tin nổi bật',
            ownerUsername: profileUsername,
            username: profileUsername,
            fullName: highlightTitle ? `Tin nổi bật: ${highlightTitle}` : 'Ảnh bìa Tin nổi bật',
            imgUrl: src,
            imgEl: hImg
          };
        }
      }
    }

    // --- TRƯỜNG HỢP B: AVATAR CHÍNH CỦA PROFILE ---
    let avatarImg = null;
    if (target.tagName === 'IMG') {
      avatarImg = target;
    } else {
      // Nếu rê chuột vào container bọc avatar (button, canvas, vòng tròn story)
      const btn = target.closest('button, [role="button"], a, span');
      if (btn && !btn.querySelector('h1, h2, h3, p') && btn.innerText.trim().length < 5) {
        avatarImg = btn.querySelector('img');
      }
    }

    if (avatarImg) {
      // Xác minh avatarImg có phải avatar của profile không:
      // - Không nằm trong highlight link
      // - Không nằm trong article (bài viết)
      // - Kích thước hợp lệ của avatar (>= 40px và <= 250px)
      if (!avatarImg.closest('a[href*="/stories/highlights/"], article')) {
        const rect = avatarImg.getBoundingClientRect();
        if (rect.width >= 40 && rect.width <= 250 && rect.height >= 40 && rect.height <= 250) {
          const alt = (avatarImg.getAttribute('alt') || '').toLowerCase();
          const isAvatar = /profile picture|ảnh đại diện|avatar|ảnh hồ sơ|'s photo/i.test(alt) ||
            Boolean(avatarImg.closest('header')) ||
            Boolean(target.closest('[aria-label*="Ảnh đại diện" i], [aria-label*="profile picture" i]'));

          if (isAvatar) {
            const src = avatarImg.currentSrc || avatarImg.src || '';
            if (src && !src.includes('emoji.php') && !src.includes('/rsrc.php/')) {
              let fullName = '';
              const hTitle = mainEl.querySelector('header h2, header h1, h2, h1');
              if (hTitle) fullName = hTitle.innerText.trim();

              return {
                isHighlight: false,
                username: profileUsername,
                fullName: fullName || profileUsername,
                imgUrl: src,
                imgEl: avatarImg
              };
            }
          }
        }
      }
    }

    return null;
  }

  function showAvatarHoverPopover(info) {
    if (!info || !info.imgEl) return;
    if (window.location.pathname.includes('/stories/') || document.querySelector('section[role="region"]')) {
      return;
    }
    currentTargetInfo = info;

    const labelText = info.isHighlight ? 'Xem ảnh bìa' : 'Xem ảnh';

    if (!activeHoverPopover) {
      activeHoverPopover = document.createElement('div');
      activeHoverPopover.id = 'igt-avatar-hover-popover';
      activeHoverPopover.className = 'igt-avatar-hover-popover';
      document.body.appendChild(activeHoverPopover);

      activeHoverPopover.onmouseenter = () => {
        if (popoverHideTimer) clearTimeout(popoverHideTimer);
      };
      activeHoverPopover.onmouseleave = () => {
        hideAvatarHoverPopover(120);
      };

      activeHoverPopover.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetInfo = activeHoverPopover._info || currentTargetInfo;
        hideAvatarHoverPopover(0);
        if (targetInfo) {
          openHdAvatarModal(targetInfo);
        }
      };
    }

    // Luôn lưu đối tượng info trực tiếp vào popover để không bị mất khi đóng
    activeHoverPopover._info = info;

    activeHoverPopover.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <span>${labelText}</span>
    `;

    const rect = info.imgEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let popLeft = Math.round(rect.left + rect.width / 2 - 45);
    let popTop = Math.round(rect.top - 28);

    if (popTop < 10) {
      popTop = Math.round(rect.bottom + 6);
    }
    if (popLeft < 10) popLeft = 10;
    if (popLeft + 95 > window.innerWidth) popLeft = window.innerWidth - 100;

    activeHoverPopover.style.left = popLeft + 'px';
    activeHoverPopover.style.top = popTop + 'px';
    activeHoverPopover.style.display = 'flex';
  }

  function hideAvatarHoverPopover(delay = 150) {
    if (popoverHideTimer) clearTimeout(popoverHideTimer);
    if (delay === 0) {
      if (activeHoverPopover) {
        activeHoverPopover.remove();
        activeHoverPopover = null;
      }
      currentTargetInfo = null;
      return;
    }
    popoverHideTimer = setTimeout(() => {
      if (activeHoverPopover) {
        activeHoverPopover.remove();
        activeHoverPopover = null;
      }
      currentTargetInfo = null;
    }, delay);
  }

  async function openHdAvatarModal(info) {
    if (!info) return;
    if (window.location.pathname.includes('/stories/') || document.querySelector('section[role="region"]')) {
      return;
    }

    // Đóng và gỡ bỏ modal cũ nếu có
    const existing = document.getElementById('igt-hd-avatar-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'igt-hd-avatar-modal';
    modal.className = 'igt-hd-avatar-modal';
    document.body.appendChild(modal);

    const initialSrc = info.imgUrl;
    let initialName = '';
    let initialUser = '';
    let downloadBtnText = 'Tải ảnh Full HD';

    if (info.isHighlight) {
      initialName = escapeHtml(info.fullName || 'Ảnh bìa Tin nổi bật');
      initialUser = info.ownerUsername ? `@${escapeHtml(info.ownerUsername)} • Tin nổi bật` : 'Instagram Highlight';
      downloadBtnText = 'Tải ảnh bìa Highlight';
    } else {
      initialUser = info.username ? `@${escapeHtml(info.username)}` : '';
      initialName = info.fullName ? escapeHtml(info.fullName) : (initialUser || 'Ảnh đại diện');
      downloadBtnText = 'Tải ảnh Full HD';
    }

    modal.innerHTML = `
      <div class="igt-hd-avatar-backdrop"></div>
      <div class="igt-hd-avatar-dialog">
        <!-- Header (ĐÃ BỎ TÍCH XANH HOÀN TOÀN THEO YÊU CẦU) -->
        <div class="igt-hd-avatar-header">
          <div class="igt-hd-avatar-user-info">
            <img class="igt-hd-avatar-thumb-mini" src="${initialSrc}" alt="" />
            <div class="igt-hd-avatar-names">
              <div class="igt-hd-avatar-title-row">
                <span id="igt-hd-modal-fullname" class="igt-hd-modal-fullname">${initialName}</span>
              </div>
              <span id="igt-hd-modal-username" class="igt-hd-modal-username">${initialUser}</span>
            </div>
          </div>
          <button type="button" id="igt-hd-close-btn" class="igt-hd-close-btn" title="Đóng (ESC)">✕</button>
        </div>

        <!-- Main Image Area (Luôn bo tròn) -->
        <div class="igt-hd-avatar-body">
          <div class="igt-hd-avatar-img-wrap">
            <div id="igt-hd-img-spinner" class="igt-hd-center-spinner"></div>
            <img id="igt-hd-modal-img" class="igt-hd-modal-img" src="${initialSrc}" alt="Ảnh xem phóng to" />
          </div>
        </div>

        <!-- Footer / Action Bar (Màu xanh IG) -->
        <div class="igt-hd-avatar-footer">
          <button type="button" id="igt-hd-btn-download" class="igt-hd-action-btn primary" title="Tải ảnh gốc về máy">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>${downloadBtnText}</span>
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';

    const modalImg = modal.querySelector('#igt-hd-modal-img');
    const spinner = modal.querySelector('#igt-hd-img-spinner');
    const fullNameEl = modal.querySelector('#igt-hd-modal-fullname');
    const usernameEl = modal.querySelector('#igt-hd-modal-username');
    const btnDownload = modal.querySelector('#igt-hd-btn-download');
    const btnClose = modal.querySelector('#igt-hd-close-btn');
    const backdrop = modal.querySelector('.igt-hd-avatar-backdrop');

    // Đóng modal triệt để bằng remove()
    const closeModal = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      modal.remove();
    };

    if (btnClose) btnClose.onclick = closeModal;
    if (backdrop) backdrop.onclick = closeModal;

    let currentHdUrl = initialSrc;

    // Xử lý nạp ảnh chất lượng cao
    if (info.isHighlight && info.highlightId) {
      fetchHdHighlightCover(info.highlightId, initialSrc).then(hdCover => {
        currentHdUrl = hdCover || initialSrc;
        const preloader = new Image();
        preloader.src = currentHdUrl;
        preloader.onload = () => {
          if (!document.body.contains(modal)) return;
          modalImg.src = currentHdUrl;
          if (spinner) spinner.style.display = 'none';
        };
        preloader.onerror = () => {
          if (!document.body.contains(modal)) return;
          if (spinner) spinner.style.display = 'none';
        };
      });
    } else if (info.username) {
      fetchHdAvatarInfo(info.username, initialSrc).then(res => {
        currentHdUrl = res.hdUrl || initialSrc;
        if (fullNameEl && res.fullName && !info.isHighlight) fullNameEl.innerText = res.fullName;
        if (usernameEl && res.username && !info.isHighlight) usernameEl.innerText = `@${res.username}`;

        const preloader = new Image();
        preloader.src = currentHdUrl;
        preloader.onload = () => {
          if (!document.body.contains(modal)) return;
          modalImg.src = currentHdUrl;
          if (spinner) spinner.style.display = 'none';
        };
        preloader.onerror = () => {
          if (!document.body.contains(modal)) return;
          if (spinner) spinner.style.display = 'none';
        };
      });
    } else {
      if (spinner) spinner.style.display = 'none';
    }

    if (btnDownload) {
      btnDownload.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (info.isHighlight) {
          const safeTitle = (info.highlightTitle || 'story').replace(/[^a-zA-Z0-9_]/g, '_');
          downloadImageDirect(currentHdUrl, `highlight_${safeTitle}_cover.jpg`);
        } else {
          const uname = info.username || 'instagram_user';
          downloadImageDirect(currentHdUrl, `avatar_${uname}_1080p.jpg`);
        }
      };
    }
  }

  // Helper tải ảnh trực tiếp không bị chặn
  async function downloadImageDirect(url, filename) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'avatar_hd.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (_) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.download = filename || 'avatar_hd.jpg';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // Lắng nghe sự kiện rê chuột (hover) để hiện Popover "Xem ảnh" / "Xem ảnh bìa"
  document.addEventListener('mouseover', (e) => {
    if (!v3Settings.hdAvatar) return;
    const target = e.target;
    // Bỏ qua nếu chuột đang nằm trong chính Popover
    if (target && target.closest && target.closest('.igt-avatar-hover-popover')) {
      if (popoverHideTimer) clearTimeout(popoverHideTimer);
      return;
    }

    const info = findAvatarElementAndInfo(target);
    if (info) {
      if (popoverHideTimer) clearTimeout(popoverHideTimer);
      if (activeHoverPopover && currentTargetInfo && currentTargetInfo.imgEl === info.imgEl) {
        return;
      }
      showAvatarHoverPopover(info);
    } else {
      hideAvatarHoverPopover(150);
    }
  }, { passive: true });

  document.addEventListener('mouseout', (e) => {
    if (!v3Settings.hdAvatar) return;
    const related = e.relatedTarget;
    if (related && (related.closest('.igt-avatar-hover-popover') || findAvatarElementAndInfo(related))) {
      return;
    }
    hideAvatarHoverPopover(150);
  }, { passive: true });

  // Lắng nghe sự kiện Click & Double-Click vào Avatar / Highlight Cover:
  // 1. Click vào nút Popover "Xem ảnh" / "Xem ảnh bìa"
  // 2. Alt + Click hoặc Double-Click vào Avatar (Tránh đè lên hành vi bấm xem Story mặc định của Instagram)
  document.addEventListener('click', (e) => {
    if (!v3Settings.hdAvatar) return;
    if (e.target.closest('#igt-hd-avatar-modal')) return;

    // 1. Click vào nút Popover nổi "Xem ảnh"
    const pop = e.target.closest('.igt-avatar-hover-popover');
    if (pop) {
      e.preventDefault();
      e.stopPropagation();
      const targetInfo = pop._info || currentTargetInfo;
      hideAvatarHoverPopover(0);
      if (targetInfo) openHdAvatarModal(targetInfo);
      return;
    }

    // 2. Alt + Click vào Avatar để xem Full HD (Không làm gián đoạn khi bấm bình thường để xem Story)
    if (e.altKey) {
      const info = findAvatarElementAndInfo(e.target);
      if (info && !info.isHighlight) {
        e.preventDefault();
        e.stopPropagation();
        hideAvatarHoverPopover(0);
        openHdAvatarModal(info);
      }
    }
  }, true);

  // Phím tắt ESC đóng Modal ngay lập tức
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('igt-hd-avatar-modal');
      if (modal) modal.remove();
      hideAvatarHoverPopover(0);
    }
  });

  // --- 5. HỆ THỐNG WATCHLIST & AN TOÀN SCANNER (PHASE 2 - v3.1.0) ---
  let currentProfileData = null;

  window.addEventListener('__IGT_PROFILE_INFO__', (e) => {
    if (e.detail && e.detail.username) {
      currentProfileData = e.detail;
      scanAndAttachWatchlistButton();
      if (isDrawerOpen) renderWatchlistInDrawer();
    }
  });

  // Helper lấy cookie Instagram
  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : '';
  }

  // Lấy thông tin tài khoản người dùng đang đăng nhập
  async function getLoggedInUserInfo() {
    let myUid = getCookie('ds_user_id') || '';
    let myUname = '';
    let myAvatar = '';
    let myFullName = 'Chính tôi';
    let myFlwCount = 0;
    let myFlwingCount = 0;

    // 1. Thử lấy username từ profile link bên menu trái của Instagram
    const profileLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
    const navProfileA = profileLinks.find(a =>
      a.querySelector('img[alt*="profile picture"], img[alt*="ảnh đại diện"]') ||
      a.innerText.trim().toLowerCase() === 'profile' ||
      a.innerText.trim().toLowerCase() === 'trang cá nhân'
    );
    if (navProfileA) {
      const href = navProfileA.getAttribute('href').replace(/\//g, '').trim();
      if (href && !['explore', 'reels', 'direct', 'stories', 'accounts', 'emails', 'p', 'reel', 'tv'].includes(href.toLowerCase())) {
        myUname = href;
      }
    }

    // 2. Thử tìm trong Watchlist xem đã lưu tài khoản trùng myUid hoặc myUname chưa
    const currentList = await dbGetWatchlist();
    const match = currentList.find(u => (myUid && String(u.userId) === String(myUid)) || (myUname && u.username?.toLowerCase() === myUname.toLowerCase()));
    if (match) {
      if (!myUid && match.userId) myUid = match.userId;
      if (!myUname && match.username) myUname = match.username;
      myFullName = match.fullName || myFullName;
      myAvatar = match.avatarUrl || myAvatar;
      myFlwCount = match.followerCount || myFlwCount;
      myFlwingCount = match.followingCount || myFlwingCount;
    }

    // 3. Nếu có myUid mà chưa có username, thử truy vấn API
    if (myUid && !myUname) {
      try {
        const res = await fetch(`https://www.instagram.com/api/v1/users/${myUid}/info/`, {
          headers: {
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include'
        });
        if (res.ok) {
          const pj = await res.json();
          if (pj.user) {
            if (pj.user.username) myUname = pj.user.username;
            if (pj.user.full_name) myFullName = pj.user.full_name;
            if (pj.user.profile_pic_url) myAvatar = pj.user.profile_pic_url;
            if (pj.user.follower_count != null) myFlwCount = pj.user.follower_count;
            if (pj.user.following_count != null) myFlwingCount = pj.user.following_count;
          }
        }
      } catch (_) { }
    }

    return {
      userId: myUid,
      username: myUname,
      fullName: myFullName,
      avatarUrl: myAvatar || DEFAULT_AVATAR,
      followerCount: myFlwCount,
      followingCount: myFlwingCount
    };
  }

  // Lấy bối cảnh Snapshot của chủ tài khoản để đối soát mối quan hệ
  async function getLoggedInUserContext() {
    const myInfo = await getLoggedInUserInfo();
    let myFollowersSnap = null;
    let myFollowingSnap = null;

    if (myInfo.userId) {
      myFollowersSnap = await dbGetLatestSnapshot(myInfo.userId, 'followers');
      myFollowingSnap = await dbGetLatestSnapshot(myInfo.userId, 'following');
    }
    if (!myFollowersSnap && myInfo.username) {
      myFollowersSnap = await dbGetLatestSnapshot(myInfo.username, 'followers');
    }
    if (!myFollowingSnap && myInfo.username) {
      myFollowingSnap = await dbGetLatestSnapshot(myInfo.username, 'following');
    }

    const myFollowingSet = new Set();
    (myFollowingSnap?.items || []).forEach(u => {
      if (u.username) myFollowingSet.add(u.username.toLowerCase());
      if (u.id) myFollowingSet.add(String(u.id));
    });

    const myFollowersSet = new Set();
    (myFollowersSnap?.items || []).forEach(u => {
      if (u.username) myFollowersSet.add(u.username.toLowerCase());
      if (u.id) myFollowersSet.add(String(u.id));
    });

    return {
      myInfo,
      hasMySnapshots: Boolean(myFollowersSnap || myFollowingSnap),
      myFollowingSet,
      myFollowersSet
    };
  }

  // TÍNH TOÁN MỐI QUAN HỆ VỚI CHỦ TÀI KHOẢN (người lạ, bạn bè, Followers, following)
  async function computeRelationshipWithViewer(item, myContext) {
    if (!myContext || !myContext.myInfo) {
      return { type: 'stranger', label: 'người lạ' };
    }

    const { myInfo, myFollowingSet, myFollowersSet } = myContext;
    const targetUname = (item.username || '').toLowerCase();
    const targetUid = String(item.userId || '');
    const myUname = (myInfo.username || '').toLowerCase();
    const myUid = String(myInfo.userId || '');

    // 1. Nếu chính là chủ tài khoản
    if ((myUname && myUname === targetUname) || (myUid && targetUid && myUid === targetUid)) {
      return { type: 'self', label: 'Chủ acc' };
    }

    let isFollowing = false; // Chủ acc có theo dõi target không
    let isFollower = false;  // Target có theo dõi chủ acc không

    // 2. Kiểm tra từ snapshot của Chủ acc (nếu đã quét tôi)
    if (myFollowingSet.size > 0) {
      isFollowing = myFollowingSet.has(targetUname) || (targetUid && myFollowingSet.has(targetUid));
    }
    if (myFollowersSet.size > 0) {
      isFollower = myFollowersSet.has(targetUname) || (targetUid && myFollowersSet.has(targetUid));
    }

    // 3. Nếu chưa xác định được từ snapshot chủ acc, kiểm tra ngược từ snapshot của chính target user
    if (!isFollowing || !isFollower) {
      if (!isFollowing) {
        const targetFlwSnap = await dbGetLatestSnapshot(item.userId || item.username, 'followers');
        if (targetFlwSnap?.items && myUname) {
          isFollowing = targetFlwSnap.items.some(u => (u.username && u.username.toLowerCase() === myUname) || (myUid && String(u.id) === myUid));
        }
      }
      if (!isFollower) {
        const targetFlwingSnap = await dbGetLatestSnapshot(item.userId || item.username, 'following');
        if (targetFlwingSnap?.items && myUname) {
          isFollower = targetFlwingSnap.items.some(u => (u.username && u.username.toLowerCase() === myUname) || (myUid && String(u.id) === myUid));
        }
      }
    }

    // 4. Nếu vẫn chưa có snapshot, kiểm tra theo dữ liệu bắt từ Instagram (followedByViewer / followsViewer)
    if (!isFollowing && item.followedByViewer) isFollowing = true;
    if (!isFollower && item.followsViewer) isFollower = true;

    // 5. Kết luận mối quan hệ
    if (isFollowing && isFollower) {
      return { type: 'friends', label: 'bạn bè' };
    }
    if (isFollowing && !isFollower) {
      return { type: 'following', label: 'following' };
    }
    if (!isFollowing && isFollower) {
      return { type: 'followers', label: 'Followers' };
    }
    return { type: 'stranger', label: 'người lạ' };
  }

  // --- CÁC HÀM TƯƠNG TÁC INDEXEDDB CHO WATCHLIST & SNAPSHOTS ---
  function dbGetWatchlist() {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve([]);
      try {
        const tx = dbInstance.transaction('watchlist', 'readonly');
        const store = tx.objectStore('watchlist');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  function dbSaveToWatchlist(item) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve(false);
      try {
        const tx = dbInstance.transaction('watchlist', 'readwrite');
        const store = tx.objectStore('watchlist');
        store.put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function dbRemoveFromWatchlist(userId, username) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve(false);
      try {
        const tx = dbInstance.transaction('watchlist', 'readwrite');
        const store = tx.objectStore('watchlist');
        if (userId) store.delete(userId);
        if (username) {
          const req = store.getAll();
          req.onsuccess = () => {
            const all = req.result || [];
            all.forEach(item => {
              if (item.username?.toLowerCase() === username.toLowerCase() || String(item.userId) === String(userId)) {
                store.delete(item.userId);
              }
            });
          };
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) { resolve(false); }
    });
  }

  function dbSaveSnapshot(snapshot) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve(null);
      try {
        const tx = dbInstance.transaction('snapshots', 'readwrite');
        const store = tx.objectStore('snapshots');
        const req = store.add(snapshot);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  function dbGetLatestSnapshot(targetUserId, type) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve(null);
      try {
        const tx = dbInstance.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const req = store.getAll();
        req.onsuccess = () => {
          const all = req.result || [];
          const matches = all.filter(s => (String(s.targetUserId) === String(targetUserId) || (s.targetUsername && String(s.targetUsername).toLowerCase() === String(targetUserId).toLowerCase())) && (!type || s.type === type));
          if (matches.length === 0) return resolve(null);
          matches.sort((a, b) => b.timestamp - a.timestamp);
          resolve(matches[0]);
        };
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  function dbGetSnapshotsHistory(targetUserId, type) {
    return new Promise((resolve) => {
      if (!dbInstance) return resolve([]);
      try {
        const tx = dbInstance.transaction('snapshots', 'readonly');
        const store = tx.objectStore('snapshots');
        const req = store.getAll();
        req.onsuccess = () => {
          const all = req.result || [];
          const matches = all.filter(s => (String(s.targetUserId) === String(targetUserId) || (s.targetUsername && String(s.targetUsername).toLowerCase() === String(targetUserId).toLowerCase())) && (!type || s.type === type));
          matches.sort((a, b) => b.timestamp - a.timestamp);
          resolve(matches);
        };
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  // =========================================================================
  // THUẬT TOÁN SNAPSHOT DIFFING & MUTUAL ANALYSIS (PHASE 3 - v3.2.0)
  // =========================================================================

  function computeSnapshotDiff(oldSnap, newSnap) {
    if (!newSnap || !newSnap.items) return null;
    if (!oldSnap || !oldSnap.items) {
      return {
        isFirstBaseline: true,
        baselineCount: newSnap.items.length,
        newUsers: [],
        lostUsers: [],
        stableUsers: newSnap.items,
        timestampOld: null,
        timestampNew: newSnap.timestamp
      };
    }

    const oldMap = new Map();
    oldSnap.items.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      oldMap.set(key, u);
    });

    const newMap = new Map();
    newSnap.items.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      newMap.set(key, u);
    });

    const newUsers = [];
    const stableUsers = [];
    newSnap.items.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      if (!oldMap.has(key)) {
        newUsers.push({ ...u, diffType: 'added', diffStatus: 'Mới Follow (+)' });
      } else {
        stableUsers.push({ ...u, diffType: 'stable', diffStatus: 'Ổn định (=)' });
      }
    });

    const lostUsers = [];
    oldSnap.items.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      if (!newMap.has(key)) {
        lostUsers.push({ ...u, diffType: 'removed', diffStatus: 'Đã Unfollow (-)' });
      }
    });

    return {
      isFirstBaseline: false,
      newUsers,
      lostUsers,
      stableUsers,
      timestampOld: oldSnap.timestamp,
      timestampNew: newSnap.timestamp
    };
  }

  function computeMutualAnalysis(followersSnap, followingSnap) {
    const followers = followersSnap?.items || [];
    const following = followingSnap?.items || [];

    const followerMap = new Map();
    followers.forEach(u => followerMap.set(String(u.id || u.username).toLowerCase(), u));

    const followingMap = new Map();
    following.forEach(u => followingMap.set(String(u.id || u.username).toLowerCase(), u));

    // 1. Không follow lại (User đang follow họ, nhưng họ không follow lại user)
    const notFollowingBack = [];
    following.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      if (!followerMap.has(key)) {
        notFollowingBack.push({ ...u, mutualStatus: 'Không follow lại bạn' });
      }
    });

    // 2. Người hâm mộ (Fans: Họ follow user, nhưng user chưa follow họ)
    const fans = [];
    followers.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      if (!followingMap.has(key)) {
        fans.push({ ...u, mutualStatus: 'Người hâm mộ (Fan)' });
      }
    });

    // 3. Bạn bè follow chéo (Mutual): Cả 2 cùng follow nhau
    const mutual = [];
    following.forEach(u => {
      const key = String(u.id || u.username).toLowerCase();
      if (followerMap.has(key)) {
        mutual.push({ ...u, mutualStatus: 'Bạn bè (Follow chéo)' });
      }
    });

    return {
      hasFollowers: Boolean(followersSnap),
      hasFollowing: Boolean(followingSnap),
      notFollowingBack,
      fans,
      mutual
    };
  }

  function computeCrossUserCommon(myFollowingSnap, targetFollowingSnap, myFollowersSnap, targetFollowersSnap) {
    const commonFollowing = [];
    const commonFollowers = [];
    const commonMutualFriends = [];
    const allCommonMap = new Map();

    const myFollowingMap = new Map();
    (myFollowingSnap?.items || []).forEach(u => myFollowingMap.set(String(u.id || u.username).toLowerCase(), u));

    const myFollowersMap = new Map();
    (myFollowersSnap?.items || []).forEach(u => myFollowersMap.set(String(u.id || u.username).toLowerCase(), u));

    const targetFollowingMap = new Map();
    (targetFollowingSnap?.items || []).forEach(u => targetFollowingMap.set(String(u.id || u.username).toLowerCase(), u));

    const targetFollowersMap = new Map();
    (targetFollowersSnap?.items || []).forEach(u => targetFollowersMap.set(String(u.id || u.username).toLowerCase(), u));

    // 1. Cả 2 cùng follow ai (Cả bạn và user so sánh đều đang follow người này)
    if (myFollowingSnap?.items && targetFollowingSnap?.items) {
      targetFollowingSnap.items.forEach(u => {
        const key = String(u.id || u.username).toLowerCase();
        if (myFollowingMap.has(key)) {
          const item = { ...u, commonType: 'following', commonLabel: 'Cả 2 cùng follow' };
          commonFollowing.push(item);
          allCommonMap.set(key, item);
        }
      });
    }



    // 2. Ai được cả 2 follow / Ai cùng follow cả 2 (Người này đang theo dõi cả bạn và user so sánh)
    if (myFollowersSnap?.items && targetFollowersSnap?.items) {
      targetFollowersSnap.items.forEach(u => {
        const key = String(u.id || u.username).toLowerCase();
        if (myFollowersMap.has(key)) {
          const item = { ...u, commonType: 'followers', commonLabel: 'Cùng follow cả 2' };
          commonFollowers.push(item);
          if (!allCommonMap.has(key)) {
            allCommonMap.set(key, item);
          } else {
            const existing = allCommonMap.get(key);
            existing.commonLabel = 'Cùng follow & Cả 2 theo dõi';
          }
        }
      });
    }



    // 3. Bạn bè chung là những ai (Người là bạn bè follow chéo của Bạn VÀ đồng thời cũng là bạn bè follow chéo của User so sánh)
    allCommonMap.forEach((u, key) => {
      const isMyMutual = myFollowingMap.has(key) && myFollowersMap.has(key);
      const isTargetMutual = targetFollowingMap.has(key) && targetFollowersMap.has(key);
      if (isMyMutual && isTargetMutual) {
        const item = { ...u, commonType: 'mutual_friends', commonLabel: '🤝 Bạn bè chung' };
        commonMutualFriends.push(item);
        allCommonMap.set(key, item);
      }
    });

    const allCommonList = Array.from(allCommonMap.values());

    return {
      commonFollowing,
      commonFollowers,
      commonMutualFriends,
      allCommonList
    };
  }

  // Nhận diện Profile đang xem
  function getActiveProfileInfo() {
    const parts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    const firstPart = parts[0] || '';
    const ignored = ['explore', 'reels', 'direct', 'stories', 'accounts', 'emails', 'p', 'reel', 'tv', ''];
    if (!firstPart || ignored.includes(firstPart)) return null;

    // Cho phép các sub-tab profile như /username/saved/, /username/reels/, /username/tagged/
    if (parts.length > 2) return null;
    if (parts.length === 2 && !['saved', 'tagged', 'reels', 'channel'].includes(parts[1])) return null;

    const username = firstPart;
    const header = document.querySelector('header');

    const avatarImg = header ? header.querySelector('img[alt*="ảnh đại diện"], img[alt*="profile picture"], img') : null;
    const avatarUrl = avatarImg ? avatarImg.src : '';
    const nameEl = header ? header.querySelector('span, h2, h1') : null;
    const fullName = nameEl ? nameEl.innerText.trim() : username;

    let followerCount = 0;
    let followingCount = 0;
    if (header) {
      try {
        const statItems = header.querySelectorAll('ul li, div');
        statItems.forEach(item => {
          const txt = (item.innerText || '').toLowerCase();
          const numMatch = txt.match(/([\d,\.]+)\s*(người theo dõi|follower|followers|đang theo dõi|following)/i);
          if (numMatch) {
            const count = parseInt(numMatch[1].replace(/[,.]/g, ''), 10) || 0;
            if (/người theo dõi|follower/i.test(numMatch[2])) followerCount = count;
            if (/đang theo dõi|following/i.test(numMatch[2])) followingCount = count;
          }
        });
      } catch (_) { }
    }

    if (currentProfileData && currentProfileData.username === username) {
      return {
        userId: String(currentProfileData.id),
        username: currentProfileData.username,
        fullName: currentProfileData.fullName || fullName,
        avatarUrl: currentProfileData.profilePicUrl || avatarUrl,
        followerCount: currentProfileData.followersCount || followerCount,
        followingCount: currentProfileData.followingCount || followingCount,
        isVerified: currentProfileData.isVerified || false,
        isPrivate: currentProfileData.isPrivate || false
      };
    }

    return {
      userId: username,
      username,
      fullName,
      avatarUrl,
      followerCount,
      followingCount,
      isVerified: false,
      isPrivate: false
    };
  }

  // Nhận diện xem người dùng có đang xem trang cá nhân của NGƯỜI KHÁC hay không
  function isViewingOtherUserProfile() {
    const profile = getActiveProfileInfo();
    if (!profile || !profile.username) return null;

    // 1. Kiểm tra nút "Chỉnh sửa trang cá nhân" (Edit Profile) - Chỉ có trên profile của chính mình
    const isEditProfilePresent = document.querySelector('a[href*="/accounts/edit"], a[href="/accounts/edit/"]');
    if (isEditProfilePresent) return null;

    // 2. Kiểm tra qua username liên kết Menu Profile bên trái
    const profileLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
    const navProfileA = profileLinks.find(a =>
      a.querySelector('img[alt*="profile picture"], img[alt*="ảnh đại diện"]') ||
      a.innerText.trim().toLowerCase() === 'profile' ||
      a.innerText.trim().toLowerCase() === 'trang cá nhân'
    );
    if (navProfileA) {
      const myHref = navProfileA.getAttribute('href').replace(/\//g, '').trim().toLowerCase();
      if (myHref && myHref === profile.username.toLowerCase()) {
        return null;
      }
    }

    // 3. Kiểm tra qua cookie ds_user_id
    const myUid = getCookie('ds_user_id');
    if (myUid && profile.userId && String(profile.userId) === String(myUid)) {
      return null;
    }

    return profile;
  }

  // Cập nhật nhãn và hành vi nút "quét tôi" / "quét user này"
  function updateScanMyselfButtonUI() {
    const btn = document.getElementById('igt-btn-scan-myself');
    if (!btn) return;

    const otherProfile = isViewingOtherUserProfile();
    if (otherProfile && otherProfile.username) {
      btn.innerText = 'quét user này';
      btn.setAttribute('title', `Quét & thêm @${otherProfile.username} vào Watchlist ngay lập tức`);
      btn.setAttribute('data-target-user', otherProfile.username);
      btn.classList.add('target-user');
    } else {
      btn.innerText = 'quét tôi';
      btn.setAttribute('title', 'Quét & thêm tài khoản của chính bạn');
      btn.removeAttribute('data-target-user');
      btn.classList.remove('target-user');
    }
  }

  // BỘ PHÂN GIẢI DỮ LIỆU TÀI KHOẢN TOÀN DIỆN (LẤY USER ID SỐ, FOLLOWERS, AVATAR CHUẨN XÁC 100%)
  async function resolveUserProfileDetails(username, fallbackId = '') {
    const cleanUname = String(username || '').replace(/^@|\/$/g, '').trim().toLowerCase();
    if (!cleanUname) return null;

    let resData = {
      userId: (fallbackId && /^\d+$/.test(String(fallbackId))) ? String(fallbackId) : '',
      username: cleanUname,
      fullName: cleanUname,
      avatarUrl: DEFAULT_AVATAR,
      followerCount: 0,
      followingCount: 0,
      isVerified: false,
      isPrivate: false
    };

    // 1. Kiểm tra bộ nhớ đệm currentProfileData (được injected.js bắt trực tiếp từ luồng mạng của trang)
    if (currentProfileData && currentProfileData.username?.toLowerCase() === cleanUname) {
      if (currentProfileData.id && /^\d+$/.test(currentProfileData.id)) resData.userId = String(currentProfileData.id);
      if (currentProfileData.fullName) resData.fullName = currentProfileData.fullName;
      if (currentProfileData.profilePicUrl) resData.avatarUrl = currentProfileData.profilePicUrl;
      if (currentProfileData.followersCount != null) resData.followerCount = currentProfileData.followersCount;
      if (currentProfileData.followingCount != null) resData.followingCount = currentProfileData.followingCount;
      resData.isVerified = Boolean(currentProfileData.isVerified);
      resData.isPrivate = Boolean(currentProfileData.isPrivate);
      if (resData.userId && resData.followerCount > 0) return resData;
    }

    // 2. Nếu đang ở đúng trang profile của người này, lấy trực tiếp từ DOM và thẻ Meta của Instagram
    const pathParts = window.location.pathname.replace(/^\/|\/$/g, '').split('/');
    if (pathParts[0] && pathParts[0].toLowerCase() === cleanUname) {
      // 2.1. Thẻ meta của Instagram chứa User ID số
      const metaOwner = document.querySelector('meta[property="instapp:owner_user_id"]');
      if (metaOwner && metaOwner.content && /^\d+$/.test(metaOwner.content)) {
        resData.userId = String(metaOwner.content);
      }

      // 2.2. Trích xuất từ Header trên màn hình
      const header = document.querySelector('header');
      if (header) {
        const avatarImg = header.querySelector('img[alt*="ảnh đại diện"], img[alt*="profile picture"], img');
        if (avatarImg && avatarImg.src) resData.avatarUrl = avatarImg.src;

        const nameEl = header.querySelector('span, h2, h1');
        if (nameEl && nameEl.innerText.trim()) resData.fullName = nameEl.innerText.trim();

        const statItems = header.querySelectorAll('ul li, div');
        statItems.forEach(item => {
          const txt = (item.innerText || '').toLowerCase();
          const numMatch = txt.match(/([\d,\.]+)\s*(người theo dõi|follower|followers|đang theo dõi|following)/i);
          if (numMatch) {
            const count = parseInt(numMatch[1].replace(/[,.]/g, ''), 10) || 0;
            if (/người theo dõi|follower/i.test(numMatch[2])) resData.followerCount = count;
            if (/đang theo dõi|following/i.test(numMatch[2])) resData.followingCount = count;
          }
        });
      }

      // 2.3. Quét thẻ script HTML tìm "username":"cleanUname",..."id":"12345678"
      if (!resData.userId) {
        const scripts = document.querySelectorAll('script');
        for (let i = 0; i < scripts.length; i++) {
          const txt = scripts[i].textContent || '';
          if (txt.includes(cleanUname)) {
            const m1 = txt.match(new RegExp(`"username"\\s*:\\s*"${cleanUname}"[\\s\\S]{0,400}?"(?:id|pk)"\\s*:\\s*"(\\d+)"`, 'i'));
            if (m1 && m1[1]) { resData.userId = m1[1]; break; }
            const m2 = txt.match(new RegExp(`"(?:id|pk)"\\s*:\\s*"(\\d+)"[\\s\\S]{0,400}?"username"\\s*:\\s*"${cleanUname}"`, 'i'));
            if (m2 && m2[1]) { resData.userId = m2[1]; break; }
          }
        }
      }

      if (resData.userId && resData.followerCount > 0) return resData;
    }

    const csrf = getCookie('csrftoken');

    // 3. Gọi API web_profile_info với đầy đủ headers chuẩn Instagram
    try {
      const res1 = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUname)}`, {
        headers: {
          'X-CSRFToken': csrf,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
          'X-ASBD-ID': '129477'
        },
        credentials: 'include'
      });
      if (res1.ok) {
        const j1 = await res1.json();
        const u = j1.data?.user || j1.user;
        if (u) {
          if (u.id || u.pk) resData.userId = String(u.id || u.pk);
          if (u.full_name) resData.fullName = u.full_name;
          if (u.profile_pic_url) resData.avatarUrl = u.profile_pic_url;
          if (u.edge_followed_by?.count != null) resData.followerCount = u.edge_followed_by.count;
          if (u.edge_follow?.count != null) resData.followingCount = u.edge_follow.count;
          resData.isVerified = Boolean(u.is_verified);
          resData.isPrivate = Boolean(u.is_private);
          if (resData.userId) return resData;
        }
      }
    } catch (_) { }

    // 4. Fallback siêu mạnh mẽ: Gọi API Topsearch (API này không bao giờ bị chặn và luôn trả về user.pk chuẩn 100%)
    try {
      const res2 = await fetch(`https://www.instagram.com/api/v1/web/search/topsearch/?context=blended&query=${encodeURIComponent(cleanUname)}`, {
        headers: {
          'X-CSRFToken': csrf,
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      if (res2.ok) {
        const j2 = await res2.json();
        const users = j2.users || [];
        for (let i = 0; i < users.length; i++) {
          const u = users[i].user;
          if (u && u.username?.toLowerCase() === cleanUname && (u.pk || u.id)) {
            resData.userId = String(u.pk || u.id);
            if (u.full_name && !resData.fullName) resData.fullName = u.full_name;
            if (u.profile_pic_url && resData.avatarUrl === DEFAULT_AVATAR) resData.avatarUrl = u.profile_pic_url;
            if (u.is_verified != null) resData.isVerified = Boolean(u.is_verified);
            if (u.is_private != null) resData.isPrivate = Boolean(u.is_private);
            return resData;
          }
        }
      }
    } catch (_) { }

    return resData;
  }

  // Tự động đính nút "+ Watchlist" lên Profile Header của Instagram (ĐÃ TẠM ẨN ĐỂ TỐI ƯU TẢI TRANG)
  async function scanAndAttachWatchlistButton() {
    const existing = document.getElementById('igt-v3-profile-watchlist-btn');
    if (existing) existing.remove();
    return; // Đã vô hiệu hóa để tối ưu hiệu năng tải trang

    updateScanMyselfButtonUI();

    const profile = getActiveProfileInfo();
    if (!profile) {
      const existing = document.getElementById('igt-v3-profile-watchlist-btn');
      if (existing) existing.remove();
      return;
    }

    const header = document.querySelector('header');
    if (!header) return;

    let btn = document.getElementById('igt-v3-profile-watchlist-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'igt-v3-profile-watchlist-btn';
      btn.className = 'igt-v3-watchlist-btn';
      btn.type = 'button';
    }

    const list = await dbGetWatchlist();
    const isWatched = list.some(u => u.username === profile.username || (u.userId && u.userId === profile.userId));

    if (isWatched) {
      btn.classList.add('active');
      btn.innerHTML = `<span>★ Trong Watchlist</span>`;
      btn.title = `Tài khoản @${profile.username} đang được theo dõi bí mật. Click để mở bảng điều khiển.`;
    } else {
      btn.classList.remove('active');
      btn.innerHTML = `<span>+ Watchlist</span>`;
      btn.title = `Thêm @${profile.username} vào Watchlist để theo dõi biến động Follower/Following`;
    }

    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentList = await dbGetWatchlist();
      const exists = currentList.find(u => u.username === profile.username || (u.userId && u.userId === profile.userId));

      if (exists) {
        openV3Drawer();
      } else {
        const item = {
          userId: profile.userId,
          username: profile.username,
          fullName: profile.fullName,
          avatarUrl: profile.avatarUrl,
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
          addedAt: Date.now(),
          lastScannedAt: null
        };
        await dbSaveToWatchlist(item);
        btn.classList.add('active');
        btn.innerHTML = `<span>★ Trong Watchlist</span>`;
        if (isDrawerOpen) renderWatchlistInDrawer();
        openV3Drawer();
      }
    };

    // Chèn sau nút Tải Profile nếu có, hoặc sau các nút hành động của Instagram
    const igtDownloadBtn = header.querySelector('.ig-profile-download-btn');
    if (igtDownloadBtn && igtDownloadBtn.parentElement) {
      if (btn.previousSibling !== igtDownloadBtn) {
        igtDownloadBtn.parentElement.insertBefore(btn, igtDownloadBtn.nextSibling);
      }
      return;
    }

    const actionBtn = header.querySelector('a[href*="/accounts/edit/"], a[href*="/archive/"], button, [role="button"]');
    if (actionBtn && actionBtn.parentElement) {
      if (btn.previousSibling !== actionBtn) {
        actionBtn.parentElement.insertBefore(btn, actionBtn.nextSibling);
      }
      return;
    }

    if (!btn.parentElement) {
      const targetContainer = header.querySelector('section, div') || header;
      targetContainer.appendChild(btn);
    }
  }

  // --- 6. GIAO DIỆN NÚT SIDEBAR INSTAGRAM (CĂN CHUẨN THẲNG HÀNG VỚI ICON HOME) ---
  function alignNavButtonWithInstagram() {
    const btn = document.getElementById('igt-v3-sidebar-nav-btn');
    if (!btn) return;

    if (btn.classList.contains('igt-v3-fixed-fallback')) {
      btn.style.removeProperty('margin-left');
      return;
    }

    // 1. Luôn reset margin-left về 0 trước khi đo để TUYỆT ĐỐI KHÔNG BAO GIỜ bị cộng dồn vô hạn (loại bỏ triệt để Feedback Loop)
    btn.style.removeProperty('margin-left');

    const targetSvg = document.querySelector(
      'svg[aria-label*="Home"], svg[aria-label*="Trang chủ"], svg[aria-label*="Search"], svg[aria-label*="Tìm kiếm"], svg[aria-label*="Reels"], svg[aria-label*="Messages"], svg[aria-label*="Tin nhắn"]'
    );
    if (!targetSvg) return;

    const ghostImg = btn.querySelector('.igt-v3-ghost-icon') || btn;
    const targetRect = targetSvg.getBoundingClientRect();
    const ghostRect = ghostImg.getBoundingClientRect();

    if (targetRect.width === 0 || ghostRect.width === 0) return;

    // Tính tâm hoành độ (Center X) của icon Instagram và icon Ghost của Tool
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const ghostCenterX = ghostRect.left + ghostRect.width / 2;
    const diff = Math.round((targetCenterX - ghostCenterX) * 10) / 10;

    // Chỉ bù lề vi sai cực nhỏ (-20px đến +20px) để icon thẳng hàng chuẩn xác.
    // Nếu diff vượt quá 20px (do menu đang thu gọn/mở rộng hoặc responsive), tuyệt đối không bù để tránh vỡ giao diện!
    if (Math.abs(diff) >= 0.5 && Math.abs(diff) <= 20) {
      btn.style.setProperty('margin-left', `${diff}px`, 'important');

      // Đồng bộ lề cho badge ở sidebar (nếu có)
      const badge = document.getElementById('igt-v3-stealth-badge');
      if (badge && !badge.classList.contains('igt-v3-fixed-fallback') && !badge.classList.contains('igt-v3-dm-header') && !badge.classList.contains('igt-v3-dm-fixed') && !badge.classList.contains('igt-v3-story-badge')) {
        badge.style.setProperty('margin-left', `${diff}px`, 'important');
      }
    } else {
      const badge = document.getElementById('igt-v3-stealth-badge');
      if (badge && !badge.classList.contains('igt-v3-fixed-fallback') && !badge.classList.contains('igt-v3-dm-header') && !badge.classList.contains('igt-v3-dm-fixed') && !badge.classList.contains('igt-v3-story-badge')) {
        badge.style.removeProperty('margin-left');
      }
    }
  }

  function injectSidebarNavButton() {
    if (!isExtensionValid()) return;
    let btn = document.getElementById('igt-v3-sidebar-nav-btn');

    // Nếu đang ở màn hình xem Story -> ẩn nút sidebar để tránh chèn đè lên header của Story
    if (window.location.pathname.includes('/stories/')) {
      if (btn) btn.style.display = 'none';
      return;
    } else {
      if (btn) btn.style.display = '';
    }

    const ghostIconUrl = safeGetURL('icons/ghost.png');

    if (!btn) {
      btn = document.createElement('div');
      btn.id = 'igt-v3-sidebar-nav-btn';
      btn.className = 'igt-v3-nav-item';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('title', 'Mở InstaTweaks v3.1');
      btn.innerHTML = `
        <div class="igt-v3-icon-box">
          <img class="igt-v3-ghost-icon" src="${ghostIconUrl}" alt="InstaTweaks v3" />
          <span class="igt-v3-pulse-dot"></span>
        </div>
      `;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleV3Drawer();
      });

      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleV3Drawer();
        }
      });
    }



    // Cách 1: Tìm icon Home hoặc danh sách link menu bên trái của Instagram
    const homeIconSvg = document.querySelector('svg[aria-label*="Home"], svg[aria-label*="Trang chủ"]');
    const homeLink = homeIconSvg ? homeIconSvg.closest('a') : null;

    if (homeLink) {
      // Tìm đúng item bọc ngoài của Home (thẻ con trực tiếp của danh sách menu dọc)
      let itemBox = homeLink;
      while (itemBox.parentElement && itemBox.parentElement !== document.body && itemBox.parentElement.children.length === 1) {
        itemBox = itemBox.parentElement;
      }
      const listContainer = itemBox.parentElement;
      if (listContainer) {
        btn.classList.remove('igt-v3-fixed-fallback');
        if (btn.nextSibling !== itemBox) {
          listContainer.insertBefore(btn, itemBox);
        }
        alignNavButtonWithInstagram();
        return;
      }
    }

    // Cách 2: Tìm link logo Instagram đầu tiên
    const logoLink = document.querySelector('a[href="/"]');
    if (logoLink && logoLink.parentNode) {
      let logoBox = logoLink;
      while (logoBox.parentElement && logoBox.parentElement.children.length === 1 && logoBox.parentElement.tagName === 'DIV' && logoBox.parentElement !== document.body) {
        logoBox = logoBox.parentElement;
      }
      if (logoBox.parentNode) {
        btn.classList.remove('igt-v3-fixed-fallback');
        if (logoBox.nextSibling) {
          if (btn.previousSibling !== logoBox) {
            logoBox.parentNode.insertBefore(btn, logoBox.nextSibling);
          }
        } else {
          logoBox.parentNode.appendChild(btn);
        }
        alignNavButtonWithInstagram();
        return;
      }
    }

    // Cách 3: Fallback định vị Fixed chuẩn xác vào tọa độ ô màu đỏ
    btn.classList.add('igt-v3-fixed-fallback');
    if (btn.parentNode !== document.body) {
      document.body.appendChild(btn);
    }
    alignNavButtonWithInstagram();
  }

  // --- 7. TẠO GIAO DIỆN DRAWER SIDEBAR v3.0 ---
  let isDrawerOpen = false;

  const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2371717a'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M12 14c-6.1 0-8 4-8 4v2h16v-2s-1.9-4-8-4z'/%3E%3C/svg%3E";

  function createDrawerDOM() {
    if (document.getElementById('igt-v3-drawer-panel')) return;

    const ghostIconUrl = safeGetURL('icons/ghost.png');
    const icon1Stealth = safeGetURL('icons/v3_stealth.png');
    const icon2Display = safeGetURL('icons/v3_display.png');
    const icon3Advanced = safeGetURL('icons/v3_advanced.png');
    const icon4Search = safeGetURL('icons/v3_search.png');
    const icon5Backup = safeGetURL('icons/v3_backup_section.png');
    const icon6Export = safeGetURL('icons/v3_export_btn.png');
    const icon7Restore = safeGetURL('icons/v3_restore_btn.png');
    const studioStoryIcon = safeGetURL('icons/studio_story.png');
    const studioPostIcon = safeGetURL('icons/studio_post.png');
    const studioReelIcon = safeGetURL('icons/studio_reel.png');

    // 1. Backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'igt-v3-backdrop';
    backdrop.className = 'igt-v3-backdrop';
    backdrop.addEventListener('click', closeV3Drawer);
    document.body.appendChild(backdrop);

    // 2. Drawer Panel
    const diag = getSystemPerformanceDiagnosis();
    const drawer = document.createElement('aside');
    drawer.id = 'igt-v3-drawer-panel';
    drawer.className = 'igt-v3-drawer-panel';
    drawer.innerHTML = `
      <!-- Header -->
      <div class="igt-v3-drawer-header">
        <div class="igt-v3-brand-wrap">
          <img class="igt-v3-brand-icon" src="${ghostIconUrl}" alt="Ghost" />
          <h2 class="igt-v3-brand-title">
            INSTATWEAKS
            <span class="igt-v3-phase-pill">v3.2.0</span>
          </h2>
        </div>
        <button id="igt-v3-close-btn" class="igt-v3-close-btn" title="Đóng">✕</button>
      </div>

      <!-- Scrollable Body -->
      <div class="igt-v3-drawer-body">
        
        <!-- SECTION: STUDIO SÁNG TẠO & ĐĂNG BÀI (TẠM ẨN / COMMENT THEO YÊU CẦU) -->
        <!--
        <div class="igt-studio-banner-group">
          <div class="igt-studio-grid">
            <button type="button" class="igt-studio-card-btn" id="igt-studio-open-story" title="Đăng Tin (Story)">
              <div class="igt-studio-btn-icon-wrap">
                <img class="igt-studio-btn-icon" src="${studioStoryIcon}" alt="Story" />
              </div>
              <div class="igt-studio-btn-text">
                <span class="igt-studio-btn-name">TIN</span>
                <span class="igt-studio-btn-sub">Story</span>
              </div>
            </button>
            <button type="button" class="igt-studio-card-btn" id="igt-studio-open-post" title="Đăng Bài viết (Post)">
              <div class="igt-studio-btn-icon-wrap">
                <img class="igt-studio-btn-icon" src="${studioPostIcon}" alt="Post" />
              </div>
              <div class="igt-studio-btn-text">
                <span class="igt-studio-btn-name">BÀI VIẾT</span>
                <span class="igt-studio-btn-sub">Post</span>
              </div>
            </button>
            <button type="button" class="igt-studio-card-btn" id="igt-studio-open-reel" title="Đăng Thước phim (Reel)">
              <div class="igt-studio-btn-icon-wrap">
                <img class="igt-studio-btn-icon" src="${studioReelIcon}" alt="Reel" />
              </div>
              <div class="igt-studio-btn-text">
                <span class="igt-studio-btn-name">REEL</span>
                <span class="igt-studio-btn-sub">Video</span>
              </div>
            </button>
          </div>
        </div>
        -->

        <!-- SECTION 1: CHẾ ĐỘ ẨN DANH -->
        <div class="igt-v3-section-group">
          <div class="igt-v3-section-title">
            <img class="igt-v3-sec-icon" src="${icon1Stealth}" alt="" />
            <span>Chế độ Ẩn danh</span>
          </div>
          <div class="igt-v3-section">
            <div class="igt-v3-grid-row">
              
              <!-- Xem Story Ẩn danh -->
              <div class="igt-v3-feature-col">
                <div class="igt-v3-feat-left">
                  <div class="igt-v3-popover-wrap">
                    <span class="igt-v3-info-icon" title="Xem chú thích">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    <div class="igt-v3-popover-box">
                      <div class="igt-v3-popover-title">👻 Xem Story Ẩn danh</div>
                      <div class="igt-v3-popover-desc">Xem Story mà không tăng view, chủ tài khoản hoàn toàn không biết bạn đã xem.</div>
                    </div>
                  </div>
                  <span class="igt-v3-feat-name">Xem Story Ẩn danh</span>
                </div>
                <label class="igt-v3-switch">
                  <input type="checkbox" id="igt-toggle-ghost-story" ${v3Settings.ghostStory ? 'checked' : ''} />
                  <span class="igt-v3-slider"></span>
                </label>
              </div>

              <!-- Đọc Tin nhắn Ẩn danh -->
              <div class="igt-v3-feature-col">
                <div class="igt-v3-feat-left">
                  <div class="igt-v3-popover-wrap">
                    <span class="igt-v3-info-icon" title="Xem chú thích">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    <div class="igt-v3-popover-box">
                      <div class="igt-v3-popover-title">🕶️ Đọc Tin nhắn Ẩn danh</div>
                      <div class="igt-v3-popover-desc">Đọc tin không hiện "Đã xem". Tự động gửi đã xem khi bạn nhắn lại để tránh lộ tool.</div>
                    </div>
                  </div>
                  <span class="igt-v3-feat-name">Đọc Tin nhắn Ẩn danh</span>
                </div>
                <label class="igt-v3-switch">
                  <input type="checkbox" id="igt-toggle-ghost-dm" ${v3Settings.ghostDM ? 'checked' : ''} />
                  <span class="igt-v3-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION 2: HIỂN THỊ -->
        <div class="igt-v3-section-group">
          <div class="igt-v3-section-title">
            <img class="igt-v3-sec-icon" src="${icon2Display}" alt="" />
            <span>Hiển thị</span>
          </div>
          <div class="igt-v3-section">
            <div class="igt-v3-grid-row">

              <!-- Chặn Quảng Cáo Web -->
              <div class="igt-v3-feature-col">
                <div class="igt-v3-feat-left">
                  <div class="igt-v3-popover-wrap">
                    <span class="igt-v3-info-icon" title="Xem chú thích">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    <div class="igt-v3-popover-box">
                      <div class="igt-v3-popover-title">🛡️ Chặn Quảng Cáo Web</div>
                      <div class="igt-v3-popover-desc">Lọc sạch các bài viết Được tài trợ (Sponsored/Ad) trên Bảng tin.</div>
                    </div>
                  </div>
                  <span class="igt-v3-feat-name">
                    Chặn Quảng Cáo
                    <span id="igt-adblock-count-label" style="font-size: 10px; color: #22c55e; margin-left: 2px;"></span>
                  </span>
                </div>
                <label class="igt-v3-switch">
                  <input type="checkbox" id="igt-toggle-adblock" ${v3Settings.adblock ? 'checked' : ''} />
                  <span class="igt-v3-slider"></span>
                </label>
              </div>

              <!-- Làm Nét Video HD (1080p) -->
              <div class="igt-v3-feature-col">
                <div class="igt-v3-feat-left">
                  <div class="igt-v3-popover-wrap">
                    <span class="igt-v3-info-icon" title="Xem chú thích & Chẩn đoán cấu hình">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    <div class="igt-v3-popover-box">
                      <div class="igt-v3-popover-title">🎬 Làm Nét Video HD (1080p)</div>
                      <div class="igt-v3-popover-desc">Ép phát luồng 1080p và làm nét viền thời gian thực (đã bật chế độ chống lag).</div>
                      <div class="igt-v3-diag-box">
                        <div class="igt-v3-diag-row">
                          <span>💻 Cấu hình máy:</span>
                          <span class="igt-v3-diag-val ${diag.hwStatus}">${diag.hwText}</span>
                        </div>
                        <div class="igt-v3-diag-row">
                          <span>🌐 Băng thông mạng:</span>
                          <span class="igt-v3-diag-val ${diag.netStatus}">${diag.netText}</span>
                        </div>
                        <div class="igt-v3-diag-row" style="margin-top: 3px;">
                          <span>⚡ Đánh giá:</span>
                          <strong class="igt-diag-tag ${diag.level}">${diag.statusText}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                  <span class="igt-v3-feat-name">
                    Làm Nét Video HD
                    <span id="igt-perf-badge-label" class="igt-perf-badge ${diag.level}" title="Chẩn đoán phần cứng & mạng">${diag.badge}</span>
                  </span>
                </div>
                <label class="igt-v3-switch">
                  <input type="checkbox" id="igt-toggle-sharpness" ${v3Settings.videoSharpness ? 'checked' : ''} />
                  <span class="igt-v3-slider"></span>
                </label>
              </div>
            </div>

            <!-- HÀNG 2: XEM ẢNH ĐẠI DIỆN FULL HD 1080P -->
            <div class="igt-v3-grid-row" style="margin-top: 8px;">
              <div class="igt-v3-feature-col">
                <div class="igt-v3-feat-left">
                  <div class="igt-v3-popover-wrap">
                    <span class="igt-v3-info-icon" title="Xem chú thích">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </span>
                    <div class="igt-v3-popover-box">
                      <div class="igt-v3-popover-title">🔍 Xem Avatar Full HD (1080p)</div>
                      <div class="igt-v3-popover-desc">Nhấp đúp hoặc Alt + Click vào bất kỳ ảnh đại diện nào để mở popup xem ảnh gốc 1080p và tải về.</div>
                    </div>
                  </div>
                  <span class="igt-v3-feat-name">Xem Avatar Full HD</span>
                </div>
                <label class="igt-v3-switch">
                  <input type="checkbox" id="igt-toggle-hd-avatar" ${v3Settings.hdAvatar ? 'checked' : ''} />
                  <span class="igt-v3-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- SECTION 3: CHẾ ĐỘ XEM NÂNG CAO (ĐÃ ẨN & COMMENT THEO YÊU CẦU ĐỂ TỐI ƯU TẢI TRANG) -->
        <!--
        <div class="igt-v3-section-group igt-v3-watchlist-section" style="display: none !important;">
          <div class="igt-v3-section-title" style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img class="igt-v3-sec-icon" src="${icon3Advanced}" alt="" />
              <span>Chế độ xem Nâng cao</span>
            </div>
            <button id="igt-btn-expand-wl" class="igt-v3-wl-expand-btn" title="Mở rộng danh sách tài khoản sang cửa sổ bên cạnh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              <span>Mở rộng</span>
            </button>
          </div>
          <div class="igt-v3-section">
            <div class="igt-v3-wl-toolbar">
              <div class="igt-v3-search-wrap">
                <img class="igt-v3-search-icon-img" src="${icon4Search}" alt="" />
                <input type="text" id="igt-wl-search-input" class="igt-v3-search-input" placeholder="Tìm hoặc nhập @user để thêm..." />
              </div>
              <button id="igt-btn-add-user" class="igt-v3-my-account-btn add-btn" title="Thêm tài khoản vào Watchlist">+ Thêm</button>
              <button id="igt-btn-scan-myself" class="igt-v3-my-account-btn" title="Quét & thêm tài khoản của chính bạn">quét tôi</button>
            </div>
            <div id="igt-v3-watchlist-container" class="igt-v3-watchlist-list"></div>
          </div>
        </div>
        -->

        <!-- SECTION 4: SAO LƯU (INDEXEDDB) - TẠM ẨN THEO YÊU CẦU -->
        <!--
        <div class="igt-v3-section-group">
          <div class="igt-v3-section-title">
            <img class="igt-v3-sec-icon" src="${icon5Backup}" alt="" />
            <span>Sao Lưu</span>
          </div>
          <div class="igt-v3-section">
            <div class="igt-v3-btn-group">
              <button id="igt-btn-backup" class="igt-v3-action-btn primary" title="Xuất dữ liệu dự phòng ra file JSON">
                <img class="igt-v3-btn-icon" src="${icon6Export}" alt="" />
                <span>Sao lưu (.json)</span>
              </button>
              <button id="igt-btn-restore" class="igt-v3-action-btn" title="Khôi phục dữ liệu từ file JSON">
                <img class="igt-v3-btn-icon" src="${icon7Restore}" alt="" />
                <span>Khôi phục</span>
              </button>
              <input type="file" id="igt-file-input" accept=".json" style="display: none;" />
            </div>
          </div>
        </div>
        -->

      </div>
    `;

    document.body.appendChild(drawer);

    // Lắng nghe các nút Toggle & Action
    setupDrawerEventListeners();
    // renderWatchlistInDrawer(); // Tạm ẩn theo yêu cầu để tối ưu tải trang
  }

  function setupDrawerEventListeners() {
    const closeBtn = document.getElementById('igt-v3-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeV3Drawer);

    // Nút mở Studio Sáng tạo (Tạm dừng / Comment theo yêu cầu)
    /*
    const sStory = document.getElementById('igt-studio-open-story');
    if (sStory) sStory.addEventListener('click', () => {
      closeV3Drawer();
      window.dispatchEvent(new CustomEvent('__IGT_OPEN_STUDIO__', { detail: { mode: 'story' } }));
    });
    const sPost = document.getElementById('igt-studio-open-post');
    if (sPost) sPost.addEventListener('click', () => {
      closeV3Drawer();
      window.dispatchEvent(new CustomEvent('__IGT_OPEN_STUDIO__', { detail: { mode: 'post' } }));
    });
    const sReel = document.getElementById('igt-studio-open-reel');
    if (sReel) sReel.addEventListener('click', () => {
      closeV3Drawer();
      window.dispatchEvent(new CustomEvent('__IGT_OPEN_STUDIO__', { detail: { mode: 'reel' } }));
    });
    */

    // Toggle Switches
    const tStory = document.getElementById('igt-toggle-ghost-story');
    if (tStory) tStory.addEventListener('change', (e) => saveSettings('ghostStory', e.target.checked));

    const tDM = document.getElementById('igt-toggle-ghost-dm');
    if (tDM) tDM.addEventListener('change', (e) => saveSettings('ghostDM', e.target.checked));

    const tAd = document.getElementById('igt-toggle-adblock');
    if (tAd) tAd.addEventListener('change', (e) => saveSettings('adblock', e.target.checked));

    const tAvatar = document.getElementById('igt-toggle-hd-avatar');
    if (tAvatar) tAvatar.addEventListener('change', (e) => saveSettings('hdAvatar', e.target.checked));

    const tSharp = document.getElementById('igt-toggle-sharpness');
    if (tSharp) {
      tSharp.addEventListener('change', (e) => {
        saveSettings('videoSharpness', e.target.checked);
        if (e.target.checked) {
          const currentDiag = getSystemPerformanceDiagnosis();
          if (currentDiag.level !== 'optimal') {
            console.log(`[InstaTweaks 3.0] HD Video bật khi mạng/phần cứng ở mức "${currentDiag.statusText}": ${currentDiag.advice}`);
          }
        }
      });
    }



    // Tự động lắng nghe thay đổi băng thông mạng thời gian thực
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && typeof conn.addEventListener === 'function') {
      conn.addEventListener('change', () => {
        const diag = getSystemPerformanceDiagnosis();
        const badgeEl = document.getElementById('igt-perf-badge-label');
        if (badgeEl) {
          badgeEl.className = `igt-perf-badge ${diag.level}`;
          badgeEl.innerText = diag.badge;
        }
      });
    }



    // Xử lý Popover Chú thích (Hỗ trợ cả Hover chuột lẫn Click)
    const popoverWraps = document.querySelectorAll('.igt-v3-popover-wrap');
    popoverWraps.forEach((wrap) => {
      const icon = wrap.querySelector('.igt-v3-info-icon');
      if (!icon) return;

      wrap.addEventListener('mouseenter', () => {
        popoverWraps.forEach((w) => { if (w !== wrap) w.classList.remove('igt-active'); });
        wrap.classList.add('igt-active');
      });

      wrap.addEventListener('mouseleave', () => {
        wrap.classList.remove('igt-active');
      });

      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const wasActive = wrap.classList.contains('igt-active');
        popoverWraps.forEach((w) => w.classList.remove('igt-active'));
        if (!wasActive) wrap.classList.add('igt-active');
      });
    });

    document.addEventListener('click', () => {
      document.querySelectorAll('.igt-v3-popover-wrap.igt-active').forEach((w) => w.classList.remove('igt-active'));
    });

    // Watchlist Toolbar Listeners
    async function addUserToWatchlistByUsername(uname) {
      if (!uname) return;
      const cleanUname = uname.replace(/^@|\/$/g, '').trim();
      if (!cleanUname) return;

      const currentList = await dbGetWatchlist();
      const exists = currentList.find(u => u.username.toLowerCase() === cleanUname.toLowerCase());
      if (exists) {
        alert(`Tài khoản @${cleanUname} đã có trong Watchlist rồi!`);
        return;
      }

      // Giải quyết toàn diện thông tin tài khoản (ID số, Followers, Avatar)
      const details = await resolveUserProfileDetails(cleanUname);
      const newItem = {
        userId: details?.userId || cleanUname,
        username: details?.username || cleanUname,
        fullName: details?.fullName || cleanUname,
        avatarUrl: details?.avatarUrl || DEFAULT_AVATAR,
        followerCount: details?.followerCount || 0,
        followingCount: details?.followingCount || 0,
        addedAt: Date.now(),
        lastScannedAt: null
      };
      await dbSaveToWatchlist(newItem);
      renderWatchlistInDrawer();
      const searchInput = document.getElementById('igt-wl-search-input');
      if (searchInput) searchInput.value = '';
      const countMsg = newItem.followerCount > 0 ? ` (${newItem.followerCount.toLocaleString()} followers)` : '';
      alert(`Đã thêm @${newItem.username}${countMsg} vào Watchlist thành công!`);
    }

    const btnAddUser = document.getElementById('igt-btn-add-user');
    if (btnAddUser) {
      btnAddUser.addEventListener('click', () => {
        const searchInput = document.getElementById('igt-wl-search-input');
        const val = searchInput ? searchInput.value.trim() : '';
        if (val) {
          addUserToWatchlistByUsername(val);
        } else {
          const promptVal = prompt('Nhập username Instagram muốn thêm vào Watchlist (ví dụ: nguy_er hoặc haanhpham.1806):');
          if (promptVal) addUserToWatchlistByUsername(promptVal);
        }
      });
    }



    const btnExpandWl = document.getElementById('igt-btn-expand-wl');
    if (btnExpandWl) {
      btnExpandWl.addEventListener('click', () => {
        toggleExpandedWatchlist();
      });
    }

    const searchInput = document.getElementById('igt-wl-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderWatchlistInDrawer(e.target.value);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = searchInput.value.trim();
          if (val) {
            addUserToWatchlistByUsername(val);
          }
        }
      });
    }



    const scanMyselfBtn = document.getElementById('igt-btn-scan-myself');
    if (scanMyselfBtn) {
      scanMyselfBtn.addEventListener('click', async () => {
        // KIỂM TRA NẾU ĐANG Ở TRANG CÁ NHÂN CỦA NGƯỜI KHÁC -> QUÉT USER NÀY
        const otherProfile = isViewingOtherUserProfile();
        if (otherProfile && otherProfile.username) {
          const targetUname = otherProfile.username;
          const details = await resolveUserProfileDetails(targetUname, otherProfile.userId);

          const currentList = await dbGetWatchlist();
          let targetUser = currentList.find(u => u.username.toLowerCase() === targetUname.toLowerCase());
          if (!targetUser) {
            targetUser = {
              userId: details?.userId || otherProfile.userId || targetUname,
              username: targetUname,
              fullName: details?.fullName || otherProfile.fullName || targetUname,
              avatarUrl: details?.avatarUrl || otherProfile.avatarUrl || DEFAULT_AVATAR,
              followerCount: details?.followerCount || otherProfile.followerCount || 0,
              followingCount: details?.followingCount || otherProfile.followingCount || 0,
              addedAt: Date.now(),
              lastScannedAt: null
            };
            await dbSaveToWatchlist(targetUser);
            renderWatchlistInDrawer();
          } else {
            if (details?.userId && /^\d+$/.test(details.userId)) targetUser.userId = details.userId;
            if (details?.followerCount) targetUser.followerCount = details.followerCount;
            if (details?.followingCount) targetUser.followingCount = details.followingCount;
            if (details?.avatarUrl && details.avatarUrl !== DEFAULT_AVATAR) targetUser.avatarUrl = details.avatarUrl;
            if (details?.fullName) targetUser.fullName = details.fullName;
            await dbSaveToWatchlist(targetUser);
          }

          const ok = confirm(`Bắt đầu quét toàn bộ dữ liệu tài khoản @${targetUname} (Followers & Following)?\n\n• Nhấn OK để xác nhận bắt đầu quét tất cả\n• Nhấn Cancel để hủy bỏ`);
          if (!ok) return;

          runSafeScan(targetUser, 'all');
          return;
        }

        // NẾU KHÔNG PHẢI TRANG NGƯỜI KHÁC -> QUÉT TÔI (CHÍNH TÀI KHOẢN CỦA MÌNH)
        let myUid = getCookie('ds_user_id') || '';
        let myUname = '';
        let myAvatar = '';
        let myFullName = 'Chính tôi';
        let myFlwCount = 0;
        let myFlwingCount = 0;

        // 1. Thử lấy username từ profile link bên menu trái của Instagram
        const profileLinks = Array.from(document.querySelectorAll('a[href^="/"]'));
        const navProfileA = profileLinks.find(a =>
          a.querySelector('img[alt*="profile picture"], img[alt*="ảnh đại diện"]') ||
          a.innerText.trim().toLowerCase() === 'profile' ||
          a.innerText.trim().toLowerCase() === 'trang cá nhân'
        );
        if (navProfileA) {
          const href = navProfileA.getAttribute('href').replace(/\//g, '').trim();
          if (href && !['explore', 'reels', 'direct', 'stories', 'accounts', 'emails'].includes(href.toLowerCase())) {
            myUname = href;
          }
        }

        // 2. Thử truy vấn API của chính tài khoản qua ID số
        if (myUid) {
          try {
            const res = await fetch(`https://www.instagram.com/api/v1/users/${myUid}/info/`, {
              headers: {
                'X-IG-App-ID': '936619743392459',
                'X-Requested-With': 'XMLHttpRequest'
              },
              credentials: 'include'
            });
            if (res.ok) {
              const pj = await res.json();
              if (pj.user) {
                if (pj.user.username) myUname = pj.user.username;
                if (pj.user.full_name) myFullName = pj.user.full_name;
                if (pj.user.profile_pic_url) myAvatar = pj.user.profile_pic_url;
                if (pj.user.follower_count != null) myFlwCount = pj.user.follower_count;
                if (pj.user.following_count != null) myFlwingCount = pj.user.following_count;
              }
            }
          } catch (_) { }
        }

        // 3. Nếu có myUname nhưng chưa có follower/following, gọi web_profile_info
        if (myUname && (!myFlwCount || !myFlwingCount)) {
          try {
            const res2 = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(myUname)}`, {
              headers: {
                'X-IG-App-ID': '936619743392459',
                'X-Requested-With': 'XMLHttpRequest'
              },
              credentials: 'include'
            });
            if (res2.ok) {
              const pj2 = await res2.json();
              if (pj2.data?.user) {
                const u = pj2.data.user;
                if (u.id) myUid = String(u.id);
                if (u.edge_followed_by?.count != null) myFlwCount = u.edge_followed_by.count;
                if (u.edge_follow?.count != null) myFlwingCount = u.edge_follow.count;
                if (u.profile_pic_url) myAvatar = u.profile_pic_url;
                if (u.full_name) myFullName = u.full_name;
              }
            }
          } catch (_) { }
        }

        if (!myUname) {
          const userPrompt = prompt('Nhập username Instagram của bạn để thêm vào Watchlist:');
          if (userPrompt) myUname = userPrompt.replace(/@/g, '').trim();
        }

        if (!myUname) {
          alert('Chưa xác định được username tài khoản của bạn.');
          return;
        }

        const myUser = {
          userId: myUid || myUname,
          username: myUname,
          fullName: myFullName || 'Chính tôi',
          avatarUrl: myAvatar || DEFAULT_AVATAR,
          followerCount: myFlwCount,
          followingCount: myFlwingCount,
          addedAt: Date.now(),
          lastScannedAt: null
        };

        await dbSaveToWatchlist(myUser);
        renderWatchlistInDrawer();

        const okMy = confirm(`Bắt đầu quét toàn bộ dữ liệu tài khoản của bạn @${myUname} (Followers & Following)?\n\n• Nhấn OK để xác nhận bắt đầu quét tất cả\n• Nhấn Cancel để hủy bỏ`);
        if (!okMy) return;

        runSafeScan(myUser, 'all');
      });
    }

    // Backup & Restore Buttons (Tạm ẩn theo yêu cầu)
    /*
    const btnBackup = document.getElementById('igt-btn-backup');
    if (btnBackup) btnBackup.addEventListener('click', exportDatabaseToJSON);

    const btnRestore = document.getElementById('igt-btn-restore');
    const fileInput = document.getElementById('igt-file-input');
    if (btnRestore && fileInput) {
      fileInput.accept = '.json,application/json';
      btnRestore.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file && (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json')) {
          const reader = new FileReader();
          reader.onload = (evt) => importDatabaseFromJSON(evt.target.result);
          reader.readAsText(file);
        }
        fileInput.value = '';
      });
    }
    */



    // Phím tắt ESC để đóng Drawer
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        closeV3Drawer();
      }
    });
  }

  // --- HIỂN THỊ DANH SÁCH WATCHLIST TRONG DRAWER ---
  function buildWatchlistCardsHtml(userList) {
    return userList.map(item => {
      const avatar = (item.avatarUrl && !item.avatarUrl.includes('<svg')) ? item.avatarUrl : DEFAULT_AVATAR;
      const lastScanned = item.lastScannedAt ? new Date(item.lastScannedAt).toLocaleDateString('vi-VN') : 'Chưa quét';
      const rel = item.relationship || { type: 'stranger', label: 'người lạ' };
      const hasCheckpoint = item.checkpoints?.followers?.cursor || item.checkpoints?.following?.cursor;
      const scanStatusText = hasCheckpoint
        ? `${lastScanned} <span style="color: #38bdf8; font-weight: 700;" title="Đang có điểm dừng để cào tiếp tục an toàn">• Dở dang</span>`
        : lastScanned;

      return `
        <div class="igt-v3-wl-card" data-uid="${item.userId}" data-uname="${item.username}">
          <div class="igt-v3-wl-top">
            <div class="igt-v3-wl-user-row">
              <img class="igt-v3-wl-avatar" src="${avatar}" alt="${item.username}" />
              <div class="igt-v3-wl-meta">
                <div class="igt-v3-wl-name">
                  <a href="/${item.username}/" target="_blank" style="color: inherit; text-decoration: none;">${item.fullName || item.username}</a>
                </div>
                <div class="igt-v3-wl-user">@${item.username}</div>
              </div>
            </div>

            <!-- Tag mối quan hệ với chủ acc (người lạ, bạn bè, Followers, following) -->
            <span class="igt-v3-rel-tag tag-${rel.type}">${rel.label}</span>

            <!-- Thông tin fl (Followers / Following) -->
            <div class="igt-v3-wl-stats">
              <span class="igt-v3-stat-chip igt-stat-flwer">${item.followerCount ? item.followerCount.toLocaleString() : '0'} flwer</span>
              <span class="igt-v3-stat-chip igt-stat-flwing">${item.followingCount ? item.followingCount.toLocaleString() : '0'} flwing</span>
            </div>

            <!-- Thời gian lần quét & nút xóa -->
            <div class="igt-v3-wl-right-meta">
              <span class="igt-v3-wl-last-scanned">Lần quét: ${scanStatusText}</span>
              <button class="igt-v3-wl-remove" data-action="remove" title="Xóa khỏi Watchlist">✕</button>
            </div>
          </div>

          <div class="igt-v3-wl-actions">
            <button class="igt-v3-scan-sub-btn" data-action="scan-followers" title="Cào danh sách Followers an toàn">
              Quét Followers
            </button>
            <button class="igt-v3-scan-sub-btn" data-action="scan-following" title="Cào danh sách Đang theo dõi an toàn">
              Quét Following
            </button>
            <button class="igt-v3-scan-sub-btn view-snap" data-action="view-snapshot" title="Xem lịch sử Snapshot đã lưu">
              Snapshot
            </button>
            <button class="igt-v3-scan-sub-btn diff-btn" data-action="view-diff" title="Phân tích Chuyên sâu (Biến động & Tương hỗ)">
              Chuyên sâu
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function bindWatchlistCardEvents(cardContainer, fullList, filterText = '') {
    if (!cardContainer) return;
    cardContainer.querySelectorAll('.igt-v3-wl-card').forEach(card => {
      const uid = card.getAttribute('data-uid');
      const uname = card.getAttribute('data-uname');
      const targetUser = fullList.find(u => u.username === uname || u.userId === uid);
      if (!targetUser) return;

      const removeBtn = card.querySelector('[data-action="remove"]');
      if (removeBtn) {
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm(`Bạn có chắc chắn muốn xóa @${uname} khỏi Watchlist?`)) {
            await dbRemoveFromWatchlist(uid, uname);
            scanAndAttachWatchlistButton();
            renderWatchlistInDrawer(filterText);
          }
        });
      }

      const scanFlwBtn = card.querySelector('[data-action="scan-followers"]');
      if (scanFlwBtn) {
        scanFlwBtn.addEventListener('click', () => {
          runSafeScan(targetUser, 'followers');
        });
      }

      const scanFlwingBtn = card.querySelector('[data-action="scan-following"]');
      if (scanFlwingBtn) {
        scanFlwingBtn.addEventListener('click', () => {
          runSafeScan(targetUser, 'following');
        });
      }

      const snapBtn = card.querySelector('[data-action="view-snapshot"]');
      if (snapBtn) {
        snapBtn.addEventListener('click', async () => {
          const targetUid = targetUser.userId || targetUser.username;
          const followersSnap = await dbGetLatestSnapshot(targetUid, 'followers');
          const followingSnap = await dbGetLatestSnapshot(targetUid, 'following');
          const latestSnap = followersSnap || followingSnap || (await dbGetLatestSnapshot(targetUid));
          // Mở Snapshot Viewer, nếu chưa quét sẽ có nút bắt đầu quét ngay thay vì alert cụt
          showSnapshotViewer(latestSnap || targetUser);
        });
      }

      const diffBtn = card.querySelector('[data-action="view-diff"]');
      if (diffBtn) {
        diffBtn.addEventListener('click', () => {
          showSnapshotViewer(targetUser, 'mutual');
        });
      }
    });
  }

  // --- CỬA SỔ PHỤ MỞ RỘNG DANH SÁCH WATCHLIST (ẢNH 2) ---
  let isExpandedWatchlistOpen = false;

  function toggleExpandedWatchlist() {
    const existingPanel = document.getElementById('igt-v3-expanded-panel');
    if (existingPanel) existingPanel.remove();
    return; // Đã tạm ẩn theo yêu cầu để tối ưu hiệu năng
    isExpandedWatchlistOpen = !isExpandedWatchlistOpen;
    const expandBtn = document.getElementById('igt-btn-expand-wl');
    let panel = document.getElementById('igt-v3-expanded-panel');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'igt-v3-expanded-panel';
      panel.className = 'igt-v3-expanded-panel';
      document.body.appendChild(panel);

      const searchIconUrl = safeGetURL('icons/v3_search.png');
      const advancedIconUrl = safeGetURL('icons/v3_advanced.png');

      panel.innerHTML = `
        <div class="igt-v3-expanded-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img class="igt-v3-sec-icon" src="${advancedIconUrl}" alt="" />
            <span style="font-size: 14.5px; font-weight: 700; color: #fff;">Watchlist Mở Rộng</span>
            <span id="igt-expanded-count-badge" class="igt-v3-snap-tab-badge">0 tài khoản</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="igt-expanded-collapse-btn" class="igt-v3-wl-expand-btn active" title="Thu gọn cửa sổ">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              <span>Thu gọn</span>
            </button>
            <button id="igt-expanded-close-btn" class="igt-v3-close-btn" title="Đóng cửa sổ">✕</button>
          </div>
        </div>

        <div style="padding: 10px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
          <div class="igt-v3-search-wrap">
            <img class="igt-v3-search-icon-img" src="${searchIconUrl}" alt="" />
            <input type="text" id="igt-expanded-search-input" class="igt-v3-search-input" placeholder="Lọc nhanh danh sách trong cửa sổ này..." />
          </div>
        </div>

        <div id="igt-expanded-cards-wrap" class="igt-v3-expanded-cards-wrap"></div>
      `;

      const collapseBtn = document.getElementById('igt-expanded-collapse-btn');
      if (collapseBtn) collapseBtn.onclick = () => toggleExpandedWatchlist();

      const closeBtn = document.getElementById('igt-expanded-close-btn');
      if (closeBtn) closeBtn.onclick = () => toggleExpandedWatchlist();

      const expSearchInput = document.getElementById('igt-expanded-search-input');
      if (expSearchInput) {
        expSearchInput.oninput = (e) => renderExpandedWatchlist(e.target.value);
      }
    }

    if (isExpandedWatchlistOpen) {
      panel.classList.add('igt-open');
      if (expandBtn) expandBtn.classList.add('active');
      renderExpandedWatchlist();
    } else {
      panel.classList.remove('igt-open');
      if (expandBtn) expandBtn.classList.remove('active');
    }
  }

  function closeExpandedWatchlist() {
    isExpandedWatchlistOpen = false;
    const panel = document.getElementById('igt-v3-expanded-panel');
    if (panel) panel.classList.remove('igt-open');
    const expandBtn = document.getElementById('igt-btn-expand-wl');
    if (expandBtn) expandBtn.classList.remove('active');
  }

  async function renderExpandedWatchlist(filterText = '') {
    const wrap = document.getElementById('igt-expanded-cards-wrap');
    if (!wrap) return;

    const list = await dbGetWatchlist();
    const countBadge = document.getElementById('igt-expanded-count-badge');
    if (countBadge) countBadge.innerText = `${list.length} tài khoản`;

    let filtered = list;
    if (filterText && filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      filtered = list.filter(u => u.username.toLowerCase().includes(q) || (u.fullName && u.fullName.toLowerCase().includes(q)));
    }

    if (filtered.length === 0) {
      wrap.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #71717a; padding: 40px; font-size: 13px;">Không có tài khoản nào phù hợp.</div>`;
      return;
    }

    const myContext = await getLoggedInUserContext();
    for (const item of filtered) {
      item.relationship = await computeRelationshipWithViewer(item, myContext);
    }

    wrap.innerHTML = buildWatchlistCardsHtml(filtered);
    bindWatchlistCardEvents(wrap, list, filterText);
  }

  async function renderWatchlistInDrawer(filterText = '') {
    return; // Đã tạm ẩn Watchlist để tránh nặng và tối ưu hiệu năng tải trang
    updateScanMyselfButtonUI();
    const container = document.getElementById('igt-v3-watchlist-container');
    if (!container) return;

    const list = await dbGetWatchlist();
    if (!list || list.length === 0) {
      container.innerHTML = `
        <div class="igt-v3-watchlist-empty">
          Chưa có tài khoản nào trong Watchlist.<br>
          Nhập <strong>@username</strong> vào ô trên và bấm <strong>+ Thêm</strong>, hoặc bấm <strong>quét tôi</strong> để bắt đầu!
        </div>
      `;
      if (isExpandedWatchlistOpen) renderExpandedWatchlist(filterText);
      return;
    }

    let filtered = list;
    if (filterText && filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      filtered = list.filter(u => u.username.toLowerCase().includes(q) || (u.fullName && u.fullName.toLowerCase().includes(q)));
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="igt-v3-watchlist-empty">
          Không tìm thấy tài khoản nào khớp từ khóa "${filterText}".
        </div>
      `;
      if (isExpandedWatchlistOpen) renderExpandedWatchlist(filterText);
      return;
    }

    const myContext = await getLoggedInUserContext();
    for (const item of filtered) {
      item.relationship = await computeRelationshipWithViewer(item, myContext);
    }

    container.innerHTML = buildWatchlistCardsHtml(filtered);
    bindWatchlistCardEvents(container, list, filterText);

    if (isExpandedWatchlistOpen) {
      renderExpandedWatchlist(filterText);
    }

    // Tự động làm mới và cập nhật số Follower / Following ngầm nếu đang là 0
    filtered.forEach(item => {
      if ((!item.followerCount || !item.followingCount) && item.username) {
        fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(item.username)}`, {
          headers: {
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'include'
        }).then(r => r.ok ? r.json() : null).then(async (pj) => {
          if (pj?.data?.user) {
            const u = pj.data.user;
            let dirty = false;
            if (u.edge_followed_by?.count != null && item.followerCount !== u.edge_followed_by.count) {
              item.followerCount = u.edge_followed_by.count;
              dirty = true;
            }
            if (u.edge_follow?.count != null && item.followingCount !== u.edge_follow.count) {
              item.followingCount = u.edge_follow.count;
              dirty = true;
            }
            if (u.id && (!item.userId || !/^\d+$/.test(item.userId))) {
              item.userId = String(u.id);
              dirty = true;
            }
            if (u.profile_pic_url && (!item.avatarUrl || item.avatarUrl === DEFAULT_AVATAR)) {
              item.avatarUrl = u.profile_pic_url;
              dirty = true;
            }
            if (dirty) {
              await dbSaveToWatchlist(item);
              const card = container.querySelector(`[data-uname="${item.username}"]`);
              if (card) {
                const flw = card.querySelector('.igt-stat-flwer');
                const flwing = card.querySelector('.igt-stat-flwing');
                if (flw) flw.innerText = `${item.followerCount.toLocaleString()} flwer`;
                if (flwing) flwing.innerText = `${item.followingCount.toLocaleString()} flwing`;
                if (item.avatarUrl) {
                  const img = card.querySelector('.igt-v3-wl-avatar');
                  if (img) img.src = item.avatarUrl;
                }
              }
            }
          }
        }).catch(() => { });
      }
    });
  }

  // --- SAFE SCANNER ENGINE (BỘ CÀO FOLLOWER/FOLLOWING AN TOÀN CHỐNG 429) ---
  let activeScanState = null;

  async function runSafeScan(targetUser, type = 'all', options = {}) {
    if (!targetUser) return;

    let overlay = document.getElementById('igt-v3-scanner-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'igt-v3-scanner-overlay';
      overlay.className = 'igt-v3-scanner-overlay';
      const drawer = document.getElementById('igt-v3-drawer-panel');
      if (drawer) drawer.appendChild(overlay);
    }
    overlay.classList.remove('igt-hidden');
    overlay.style.setProperty('display', 'flex', 'important');

    function closeScannerOverlay() {
      if (overlay) {
        overlay.classList.add('igt-hidden');
        overlay.style.setProperty('display', 'none', 'important');
      }
    }

    let numericUserId = targetUser.userId;
    if (!numericUserId || !/^\d+$/.test(numericUserId) || !targetUser.followerCount) {
      const details = await resolveUserProfileDetails(targetUser.username, targetUser.userId);
      if (details) {
        if (details.userId && /^\d+$/.test(details.userId)) {
          numericUserId = details.userId;
          targetUser.userId = numericUserId;
        }
        if (details.followerCount > 0) targetUser.followerCount = details.followerCount;
        if (details.followingCount > 0) targetUser.followingCount = details.followingCount;
        if (details.avatarUrl && details.avatarUrl !== DEFAULT_AVATAR) targetUser.avatarUrl = details.avatarUrl;
        if (details.fullName) targetUser.fullName = details.fullName;
        await dbSaveToWatchlist(targetUser);
        renderWatchlistInDrawer();
      }
    }

    if (!numericUserId || !/^\d+$/.test(numericUserId)) {
      const details = await resolveUserProfileDetails(targetUser.username);
      if (details?.userId && /^\d+$/.test(details.userId)) {
        numericUserId = details.userId;
        targetUser.userId = numericUserId;
        await dbSaveToWatchlist(targetUser);
      }
    }

    if (!numericUserId || !/^\d+$/.test(numericUserId)) {
      alert(`Không thể xác định User ID số của tài khoản @${targetUser.username}. Vui lòng thử lại!`);
      closeScannerOverlay();
      return;
    }

    const typesToScan = (type === 'all') ? ['followers', 'following'] : [type];
    const initialTypeLabel = (type === 'all')
      ? 'Tất cả (Followers & Following)'
      : (type === 'followers' ? 'Followers (Người theo dõi)' : 'Following (Đang theo dõi)');

    const playGifUrl = safeGetURL('icons/scan_play.gif');
    const loadingGifUrl = safeGetURL('icons/scan_stop.gif');

    overlay.innerHTML = `
      <div class="igt-v3-scan-header">
        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="igt-scan-back-btn" class="igt-v3-snap-back-btn" title="Quay lại danh sách Watchlist">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Quay lại</span>
          </button>
          <div>
            <div class="igt-v3-scan-target">Đang quét @${targetUser.username}</div>
            <div id="igt-scan-type-badge" style="font-size: 11.5px; color: #a1a1aa; margin-top: 3px;">Phân loại: <strong>${initialTypeLabel}</strong></div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="igt-scan-status-tag" class="igt-v3-scan-status-tag running">
            <img class="igt-v3-scan-loading-gif" src="${loadingGifUrl}" alt="" />
            <span>Đang quét</span>
          </span>
          <button id="igt-scan-close-btn" class="igt-v3-close-btn" title="Đóng">✕</button>
        </div>
      </div>

      <!-- Khối tiến độ -->
      <div class="igt-v3-progress-box">
        <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #fff;">
          <span id="igt-scan-count-text">Đang kết nối...</span>
          <span id="igt-scan-percent-text">0%</span>
        </div>
        <div class="igt-v3-progress-track">
          <div id="igt-scan-progress-fill" class="igt-v3-progress-fill indeterminate" style="width: 0%;"></div>
        </div>
        <div id="igt-scan-status-text" class="igt-v3-scan-status-text">
          Đang khởi tạo kết nối an toàn với máy chủ Instagram...
        </div>
      </div>

      <!-- Chọn giới hạn an toàn chống 429 (Safe Batch Limit) -->
      <div class="igt-v3-scan-limit-box">
        <span style="font-size: 11.5px; color: #a1a1aa; font-weight: 600;">Giới hạn đợt quét:</span>
        <div class="igt-v3-scan-limit-pills" id="igt-scan-limit-pills">
          <button type="button" class="igt-v3-limit-pill" data-limit="100">100</button>
          <button type="button" class="igt-v3-limit-pill active" data-limit="250" title="Khuyên dùng: Tuyệt đối an toàn, tránh 429">250 ★</button>
          <button type="button" class="igt-v3-limit-pill" data-limit="500">500</button>
          <button type="button" class="igt-v3-limit-pill" data-limit="1000">1,000</button>
          <button type="button" class="igt-v3-limit-pill" data-limit="0">Tất cả</button>
        </div>
      </div>

      <div class="igt-v3-scan-ctrls">
        <button id="igt-scan-pause-btn" class="igt-v3-action-btn" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
          <img class="igt-v3-scan-btn-icon" id="igt-scan-pause-icon" src="${playGifUrl}" style="display: none;" alt="" />
          <svg id="igt-scan-pause-svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>
          <span id="igt-scan-pause-text">Tạm dừng</span>
        </button>
        <button id="igt-scan-stop-btn" class="igt-v3-action-btn primary" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"></rect></svg>
          <span>Dừng & Lưu checkpoint</span>
        </button>
      </div>
    `;

    const state = {
      isPaused: false,
      isStopped: false,
      batchLimit: 250, // Mặc định 250 người/đợt để chống 429
      collected: [],
      currentScanType: typesToScan[0]
    };
    activeScanState = state;

    // Gắn sự kiện chọn Batch Limit Pills
    const limitContainer = document.getElementById('igt-scan-limit-pills');
    if (limitContainer) {
      limitContainer.querySelectorAll('.igt-v3-limit-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          limitContainer.querySelectorAll('.igt-v3-limit-pill').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const lim = parseInt(btn.getAttribute('data-limit'), 10) || 0;
          state.batchLimit = lim;
          const statusText = document.getElementById('igt-scan-status-text');
          if (statusText) {
            statusText.innerText = lim > 0
              ? `Đã đặt giới hạn đợt quét: ${lim.toLocaleString()} tài khoản (Tự lưu và tạo điểm dừng an toàn).`
              : `Đã chọn: Quét toàn bộ (Không giới hạn).`;
          }
        });
      });
    }

    const pauseBtn = document.getElementById('igt-scan-pause-btn');
    const stopBtn = document.getElementById('igt-scan-stop-btn');
    const scanBackBtn = document.getElementById('igt-scan-back-btn');
    const scanCloseBtn = document.getElementById('igt-scan-close-btn');
    const statusTag = document.getElementById('igt-scan-status-tag');
    const countText = document.getElementById('igt-scan-count-text');
    const percentText = document.getElementById('igt-scan-percent-text');
    const fillBar = document.getElementById('igt-scan-progress-fill');
    const statusText = document.getElementById('igt-scan-status-text');
    const typeBadge = document.getElementById('igt-scan-type-badge');

    pauseBtn.onclick = () => {
      state.isPaused = !state.isPaused;
      const pauseText = document.getElementById('igt-scan-pause-text');
      const pauseSvg = document.getElementById('igt-scan-pause-svg');
      const pauseIcon = document.getElementById('igt-scan-pause-icon');
      if (state.isPaused) {
        pauseBtn.classList.add('paused');
        if (pauseText) pauseText.innerText = 'Tiếp tục';
        if (pauseSvg) pauseSvg.style.display = 'none';
        if (pauseIcon) pauseIcon.style.display = 'inline-block';
        if (statusTag) {
          statusTag.className = 'igt-v3-scan-status-tag paused';
          statusTag.innerHTML = '<span>🔴 Đang dừng</span>';
        }
        statusText.innerText = 'Đã tạm dừng tiến trình quét.';
      } else {
        pauseBtn.classList.remove('paused');
        if (pauseText) pauseText.innerText = 'Tạm dừng';
        if (pauseSvg) pauseSvg.style.display = 'inline-block';
        if (pauseIcon) pauseIcon.style.display = 'none';
        if (statusTag) {
          statusTag.className = 'igt-v3-scan-status-tag running';
          statusTag.innerHTML = `<img class="igt-v3-scan-loading-gif" src="${loadingGifUrl}" alt="" /><span>Đang quét</span>`;
        }
        statusText.innerText = 'Đang tiếp tục quét...';
      }
    };

    async function handleAbortOrBack() {
      state.isStopped = true;
      closeScannerOverlay();
    }

    if (scanBackBtn) scanBackBtn.onclick = handleAbortOrBack;
    if (scanCloseBtn) scanCloseBtn.onclick = handleAbortOrBack;

    stopBtn.onclick = () => {
      state.isStopped = true;
      statusText.innerText = 'Đang dừng và lưu dữ liệu + điểm dừng (Checkpoint)...';
    };

    const csrfToken = getCookie('csrftoken');
    let lastSavedSnapshot = null;

    // Chạy tuần tự qua các loại cần quét
    for (let tIdx = 0; tIdx < typesToScan.length; tIdx++) {
      if (state.isStopped) break;

      const currentType = typesToScan[tIdx];
      state.currentScanType = currentType;
      const typeDisplay = currentType === 'followers' ? 'Followers' : 'Following';
      const totalExpected = currentType === 'followers' ? (targetUser.followerCount || 0) : (targetUser.followingCount || 0);

      if (typeBadge) {
        typeBadge.innerHTML = typesToScan.length > 1
          ? `Phân loại: <strong>Tất cả</strong> (Bước ${tIdx + 1}/2: Quét ${typeDisplay})`
          : `Phân loại: <strong>${typeDisplay}</strong>`;
      }

      fillBar.style.width = '0%';
      fillBar.classList.add('indeterminate');
      percentText.innerText = '0%';
      countText.innerText = `Đã thu thập: 0 / ${totalExpected > 0 ? totalExpected.toLocaleString() : '?'}`;
      statusText.innerText = `Đang bắt đầu quét danh sách ${typeDisplay}...`;

      let cursor = null;
      let pageCount = 0;
      let consecutive429Retries = 0;
      const MAX_429_RETRIES = 2;
      const collectedCurrent = [];

      // Kiểm tra xem tài khoản này có Checkpoint quét dở dang từ trước không
      targetUser.checkpoints = targetUser.checkpoints || {};
      const existingCp = targetUser.checkpoints[currentType];
      if (existingCp && existingCp.cursor && Array.isArray(existingCp.collected) && existingCp.collected.length > 0) {
        let wantResume = options.resume;
        if (wantResume === undefined) {
          wantResume = confirm(`Phát hiện tiến độ quét dở dang: Đang có sẵn ${existingCp.collected.length.toLocaleString()} ${typeDisplay} được lưu an toàn.\n\n• Nhấn OK để QUÉT TIẾP TỤC từ điểm dừng (Gom tiếp, an toàn không lo 429)\n• Nhấn Cancel để QUÉT LẠI TỪ ĐẦU`);
        }
        if (wantResume) {
          cursor = existingCp.cursor;
          collectedCurrent.push(...existingCp.collected);
          statusText.innerText = `[Phục hồi] Đang có sẵn ${collectedCurrent.length} ${typeDisplay}. Chuẩn bị quét gói tiếp theo...`;
        } else {
          delete targetUser.checkpoints[currentType];
          await dbSaveToWatchlist(targetUser);
        }
      }

      while (!state.isStopped) {
        while (state.isPaused && !state.isStopped) {
          await new Promise(r => setTimeout(r, 200));
        }
        if (state.isStopped) break;

        // Kiểm tra đạt Giới hạn đợt an toàn (Batch Limit)
        if (state.batchLimit > 0 && collectedCurrent.length >= state.batchLimit) {
          statusText.innerText = `✓ Đã hoàn thành đợt quét an toàn (${collectedCurrent.length} tài khoản)! Đã lưu Checkpoint để bạn quét tiếp đợt sau.`;
          break;
        }

        pageCount++;
        // Giảm kích thước mỗi đợt gọi từ 50 xuống 35 để giảm điểm nghi vấn từ Instagram API
        const batchQueryCount = 35;
        const queryUrl = `https://www.instagram.com/api/v1/friendships/${numericUserId}/${currentType}/?count=${batchQueryCount}${cursor ? '&max_id=' + encodeURIComponent(cursor) : ''}`;
        statusText.innerText = `[${typeDisplay}] Đang tải gói ${pageCount} (${batchQueryCount} tài khoản)...`;

        try {
          const res = await fetch(queryUrl, {
            headers: {
              'X-CSRFToken': csrfToken,
              'X-IG-App-ID': '936619743392459',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': '*/*'
            },
            credentials: 'include'
          });

          if (res.status === 429) {
            consecutive429Retries++;
            // Lưu ngay Checkpoint khẩn cấp để đảm bảo không mất 1 tài khoản nào
            targetUser.checkpoints = targetUser.checkpoints || {};
            if (cursor && collectedCurrent.length > 0) {
              targetUser.checkpoints[currentType] = {
                cursor: cursor,
                collected: collectedCurrent,
                updatedAt: Date.now()
              };
              await dbSaveToWatchlist(targetUser);
            }

            if (consecutive429Retries <= MAX_429_RETRIES) {
              if (statusTag) {
                statusTag.className = 'igt-v3-scan-status-tag paused';
                statusTag.innerHTML = '<span>⏳ Đang làm mát (429)</span>';
              }
              const coolSeconds = 60; // Nghỉ hẳn 60s để giải phóng Rate Limit bucket
              for (let sec = coolSeconds; sec > 0; sec--) {
                if (state.isStopped) break;
                statusText.innerText = `⚠️ Instagram phản hồi tần suất (429). Đang tự động làm mát trong ${sec}s để bảo vệ tài khoản...`;
                await new Promise(r => setTimeout(r, 1000));
              }
              if (state.isStopped) break;
              if (statusTag) {
                statusTag.className = 'igt-v3-scan-status-tag running';
                statusTag.innerHTML = `<img class="igt-v3-scan-loading-gif" src="${loadingGifUrl}" alt="" /><span>Đang quét</span>`;
              }
              statusText.innerText = `[${typeDisplay}] Tiếp tục quét gói ${pageCount} sau khi làm mát an toàn...`;
              pageCount--; // Thử lại lượt tải này
              continue;
            } else {
              alert(`Instagram tạm giới hạn tần suất (Rate Limit 429). Hệ thống đã LƯU AN TOÀN toàn bộ ${collectedCurrent.length} tài khoản và điểm dừng (Checkpoint).\n\nBạn có thể quay lại sau ít phút và bấm "Quét ${typeDisplay}" để cào tiếp mà không cần làm lại từ đầu!`);
              state.isStopped = true;
              break;
            }
          }
          // Đã gọi thành công -> reset retry counter
          consecutive429Retries = 0;

          if (!res.ok) {
            statusText.innerText = `Phản hồi HTTP ${res.status}. Tự động lưu ${typeDisplay} đã quét.`;
            break;
          }

          const json = await res.json();
          const users = json.users || [];
          if (users.length === 0) break;

          for (const u of users) {
            const uidStr = String(u.pk || u.id);
            if (!collectedCurrent.some(item => item.id === uidStr)) {
              collectedCurrent.push({
                id: uidStr,
                username: u.username,
                fullName: u.full_name || '',
                avatarUrl: u.profile_pic_url || '',
                isVerified: Boolean(u.is_verified),
                isPrivate: Boolean(u.is_private)
              });
            }
          }

          if (totalExpected > 0) {
            const pct = Math.min(100, Math.round((collectedCurrent.length / totalExpected) * 100));
            countText.innerText = `[${typeDisplay}] Đã thu: ${collectedCurrent.length.toLocaleString()} / ${totalExpected.toLocaleString()}`;
            percentText.innerText = `${pct}%`;
            fillBar.classList.remove('indeterminate');
            fillBar.style.width = `${pct}%`;
          } else {
            countText.innerText = `[${typeDisplay}] Đã thu: ${collectedCurrent.length.toLocaleString()} tài khoản`;
            percentText.innerText = `Đang quét...`;
            fillBar.classList.add('indeterminate');
          }

          if (!json.next_max_id) {
            statusText.innerText = `Đã hoàn tất quét danh sách ${typeDisplay}!`;
            fillBar.classList.remove('indeterminate');
            fillBar.style.width = '100%';
            percentText.innerText = '100%';
            // Hoàn tất 100% -> Xóa checkpoint dở dang
            if (targetUser.checkpoints) {
              delete targetUser.checkpoints[currentType];
            }
            break;
          }
          cursor = json.next_max_id;

          // Giãn cách an toàn ngẫu nhiên (3.2s - 5.5s) mô phỏng tốc độ cuộn người thật
          let delayMs = Math.floor(3200 + Math.random() * 2300);

          // Cứ sau 4 gói (~140 tài khoản), nghỉ thêm 4.5s làm mát
          if (pageCount % 4 === 0) {
            delayMs += Math.floor(4500 + Math.random() * 2000);
          }

          const startWait = Date.now();
          while (Date.now() - startWait < delayMs && !state.isStopped) {
            while (state.isPaused && !state.isStopped) {
              await new Promise(r => setTimeout(r, 200));
            }
            const remainSec = Math.max(0, ((delayMs - (Date.now() - startWait)) / 1000)).toFixed(1);
            statusText.innerText = `[${typeDisplay}] Đã thu ${collectedCurrent.length} người. Giãn cách an toàn IG: ${remainSec}s...`;
            await new Promise(r => setTimeout(r, 150));
          }
          if (state.isStopped) break;

        } catch (err) {
          statusText.innerText = `Lỗi kết nối: ${err.message}. Đang lưu dữ liệu đã quét.`;
          break;
        }
      }

      // Lưu snapshot của lượt quét này (dù hoàn thành hay dừng giữa chừng)
      if (collectedCurrent.length > 0) {
        const snap = {
          targetUserId: String(numericUserId),
          targetUsername: targetUser.username,
          type: currentType,
          timestamp: Date.now(),
          totalCount: collectedCurrent.length,
          items: collectedCurrent
        };
        await dbSaveSnapshot(snap);
        lastSavedSnapshot = snap;

        targetUser.lastScannedAt = Date.now();
        if (currentType === 'followers' && (!targetUser.followerCount || targetUser.followerCount < collectedCurrent.length)) {
          targetUser.followerCount = collectedCurrent.length;
        }
        if (currentType === 'following' && (!targetUser.followingCount || targetUser.followingCount < collectedCurrent.length)) {
          targetUser.followingCount = collectedCurrent.length;
        }

        // Nếu còn cursor dở dang (chưa quét hết toàn bộ) -> lưu checkpoint để cào tiếp nối
        if (cursor) {
          targetUser.checkpoints = targetUser.checkpoints || {};
          targetUser.checkpoints[currentType] = {
            cursor: cursor,
            collected: collectedCurrent,
            updatedAt: Date.now()
          };
        }
        await dbSaveToWatchlist(targetUser);
        renderWatchlistInDrawer();
      }

      // Nghỉ an toàn giữa 2 đợt quét Followers và Following nếu quét 'all' (4s)
      if (typesToScan.length > 1 && tIdx === 0 && !state.isStopped) {
        for (let s = 4; s > 0; s--) {
          if (state.isStopped) break;
          statusText.innerText = `Đã xong Followers! Đang nghỉ an toàn ${s}s trước khi quét Following...`;
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    if (lastSavedSnapshot) {
      statusText.innerText = `Hoàn tất toàn bộ! Đã lưu Snapshot (${lastSavedSnapshot.totalCount.toLocaleString()} tài khoản).`;
      closeScannerOverlay();
      showSnapshotViewer(lastSavedSnapshot);
    } else {
      if (!state.isStopped) {
        alert('Không lấy được dữ liệu tài khoản nào (Có thể tài khoản này ở chế độ Riêng tư mà bạn chưa follow).');
      }
      closeScannerOverlay();
    }
  }

  // --- TRÌNH XEM SNAPSHOT & BỘ LỌC TÌM KIẾM ---
  async function showSnapshotViewer(snapshotOrUser, preferredType) {
    createDrawerDOM();
    openV3Drawer();
    let modal = document.getElementById('igt-v3-snap-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'igt-v3-snap-modal';
      modal.className = 'igt-v3-snap-modal';
      const drawer = document.getElementById('igt-v3-drawer-panel');
      if (drawer) {
        drawer.appendChild(modal);
      } else {
        document.body.appendChild(modal);
      }
    }
    modal.classList.remove('igt-hidden');
    modal.style.setProperty('display', 'flex', 'important');

    const targetUserId = snapshotOrUser.targetUserId || snapshotOrUser.userId || snapshotOrUser.username;
    const targetUsername = snapshotOrUser.targetUsername || snapshotOrUser.username || '';

    // Lấy toàn bộ lịch sử Snapshot từ IndexedDB
    let followersHistory = await dbGetSnapshotsHistory(targetUserId, 'followers');
    if (followersHistory.length === 0 && targetUsername) {
      followersHistory = await dbGetSnapshotsHistory(targetUsername, 'followers');
    }
    let followingHistory = await dbGetSnapshotsHistory(targetUserId, 'following');
    if (followingHistory.length === 0 && targetUsername) {
      followingHistory = await dbGetSnapshotsHistory(targetUsername, 'following');
    }

    // Nếu snapshot vừa quét xong được truyền trực tiếp vào
    if (snapshotOrUser.items && snapshotOrUser.type === 'followers') {
      if (!followersHistory.some(s => s.timestamp === snapshotOrUser.timestamp)) {
        followersHistory.unshift(snapshotOrUser);
      }
    }
    if (snapshotOrUser.items && snapshotOrUser.type === 'following') {
      if (!followingHistory.some(s => s.timestamp === snapshotOrUser.timestamp)) {
        followingHistory.unshift(snapshotOrUser);
      }
    }

    let followersSnap = followersHistory[0] || null;
    let followingSnap = followingHistory[0] || null;

    // Quyết định Tab khởi đầu (followers, following, diff, mutual)
    let currentTab = preferredType || snapshotOrUser.type;
    if (!currentTab) {
      currentTab = followersSnap ? 'followers' : (followingSnap ? 'following' : 'followers');
    }

    let diffType = 'followers'; // 'followers' hoặc 'following'
    let diffFilter = 'all';     // 'all', 'added', 'removed'
    let mutualFilter = 'not_following_back'; // 'not_following_back', 'fans', 'mutual', 'common'
    let commonSubFilter = 'all'; // 'all', 'following', 'followers', 'mutual_friends'

    const flwCount = followersSnap?.totalCount != null ? followersSnap.totalCount : (snapshotOrUser.followerCount || 0);
    const flwingCount = followingSnap?.totalCount != null ? followingSnap.totalCount : (snapshotOrUser.followingCount || 0);

    const searchIconUrl = safeGetURL('icons/v3_search.png');
    const csvIconUrl = safeGetURL('icons/v3_csv.png');
    const jsonIconUrl = safeGetURL('icons/v3_json.png');
    const privateShieldUrl = safeGetURL('icons/v3_private_shield.png');

    modal.innerHTML = `
      <!-- Header Row: Back button, Title, Close -->
      <div class="igt-v3-snap-header-row">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
          <button id="igt-snap-back-btn" class="igt-v3-snap-back-btn" title="Quay lại danh sách Watchlist">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Quay lại</span>
          </button>
          <div style="min-width: 0;">
            <div style="font-size: 13.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" id="igt-snap-title">Snapshot & Chuyên sâu: @${targetUsername}</div>
            <div style="font-size: 11px; color: #a1a1aa; white-space: nowrap;" id="igt-snap-subtitle">Đang tải...</div>
          </div>
        </div>

        <button id="igt-snap-close-btn" class="igt-v3-close-btn" title="Đóng">✕</button>
      </div>

      <!-- 4 Tabs Chuyên Sâu: Followers, Following, ⚡ Biến động (Diff), 👥 Tương hỗ (Mutual) -->
      <div class="igt-v3-snap-tabs-bar">
        <button class="igt-v3-snap-tab ${currentTab === 'followers' ? 'active' : ''}" id="igt-snap-tab-followers" data-tab="followers">
          <span>Followers</span>
          <span class="igt-v3-snap-tab-badge" id="igt-snap-tab-flw-count">${flwCount.toLocaleString()}</span>
        </button>
        <button class="igt-v3-snap-tab ${currentTab === 'following' ? 'active' : ''}" id="igt-snap-tab-following" data-tab="following">
          <span>Following</span>
          <span class="igt-v3-snap-tab-badge" id="igt-snap-tab-flwing-count">${flwingCount.toLocaleString()}</span>
        </button>
        <button class="igt-v3-snap-tab ${currentTab === 'diff' ? 'active' : ''}" id="igt-snap-tab-diff" data-tab="diff">
          <span>Biến động</span>
          <span class="igt-v3-snap-tab-badge igt-diff-badge" id="igt-snap-tab-diff-count">Diff</span>
        </button>
        <button class="igt-v3-snap-tab ${currentTab === 'mutual' ? 'active' : ''}" id="igt-snap-tab-mutual" data-tab="mutual">
          <span>Chuyên sâu</span>
          <span class="igt-v3-snap-tab-badge igt-mutual-badge">Phân tích</span>
        </button>
      </div>

      <!-- Vùng điều khiển phụ động (thay đổi theo tab) -->
      <div id="igt-snap-dynamic-controls" style="display: flex; flex-direction: column; gap: 8px;"></div>

      <!-- Toolbar tìm kiếm & Xuất dữ liệu -->
      <div class="igt-v3-snap-toolbar" id="igt-snap-toolbar">
        <div class="igt-v3-search-wrap" style="flex: 1;">
          <img class="igt-v3-search-icon-img" src="${searchIconUrl}" alt="" />
          <input type="text" id="igt-snap-search" class="igt-v3-search-input" placeholder="Lọc theo username hoặc tên..." />
        </div>
        <button id="igt-btn-export-csv" class="igt-v3-snap-export-btn csv-btn" title="Xuất dữ liệu ra file CSV mở bằng Excel">
          <img class="igt-v3-snap-btn-icon" src="${csvIconUrl}" alt="CSV" />
          <span>Xuất CSV</span>
        </button>
        <button id="igt-btn-export-json" class="igt-v3-snap-export-btn json-btn" title="Xuất dữ liệu dự phòng JSON">
          <img class="igt-v3-snap-btn-icon" src="${jsonIconUrl}" alt="JSON" />
          <span>JSON</span>
        </button>
      </div>

      <!-- Items List Container -->
      <div id="igt-snap-items-list" class="igt-v3-snap-table-wrap"></div>
    `;

    function closeSnapshotModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      modal.classList.add('igt-hidden');
      modal.style.setProperty('display', 'none', 'important');
    }

    const closeBtn = document.getElementById('igt-snap-close-btn');
    if (closeBtn) closeBtn.onclick = closeSnapshotModal;

    const snapBackBtn = document.getElementById('igt-snap-back-btn');
    if (snapBackBtn) snapBackBtn.onclick = closeSnapshotModal;

    const searchInput = document.getElementById('igt-snap-search');
    const listWrap = document.getElementById('igt-snap-items-list');
    const dynamicControls = document.getElementById('igt-snap-dynamic-controls');
    const subtitleEl = document.getElementById('igt-snap-subtitle');
    const exportCsvBtn = document.getElementById('igt-btn-export-csv');
    const exportJsonBtn = document.getElementById('igt-btn-export-json');

    // Lưu danh sách đang hiển thị để xuất file
    let currentRenderedItems = [];

    // Chuyển đổi tab chính
    modal.querySelectorAll('.igt-v3-snap-tabs-bar .igt-v3-snap-tab').forEach(tabBtn => {
      tabBtn.onclick = () => {
        const selectedTab = tabBtn.getAttribute('data-tab');
        if (currentTab !== selectedTab) {
          currentTab = selectedTab;
          modal.querySelectorAll('.igt-v3-snap-tabs-bar .igt-v3-snap-tab').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-tab') === currentTab);
          });
          if (searchInput) searchInput.value = '';
          renderActiveView();
        }
      };
    });

    function renderActiveView() {
      if (currentTab === 'followers' || currentTab === 'following') {
        renderStandardSnapshotView();
      } else if (currentTab === 'diff') {
        renderDiffView();
      } else if (currentTab === 'mutual') {
        renderMutualView();
      }
    }

    // --- TAB 1 & TAB 2: FOLLOWERS & FOLLOWING TIÊU CHUẨN ---
    function renderStandardSnapshotView() {
      dynamicControls.innerHTML = '';
      exportJsonBtn.style.display = 'inline-flex';

      const activeSnap = currentTab === 'followers' ? followersSnap : followingSnap;
      const typeLabel = currentTab === 'followers' ? 'Followers' : 'Following';

      if (subtitleEl) {
        if (activeSnap && activeSnap.timestamp) {
          const dateStr = new Date(activeSnap.timestamp).toLocaleString('vi-VN');
          subtitleEl.innerText = `${activeSnap.totalCount.toLocaleString()} người • Lưu lúc: ${dateStr}`;
        } else {
          subtitleEl.innerText = `Chưa có bản lưu ${typeLabel}`;
        }
      }

      exportCsvBtn.onclick = () => exportSnapshotToCSV(activeSnap);
      exportJsonBtn.onclick = () => exportSnapshotToJSON(activeSnap);

      renderUserList(activeSnap?.items || [], (u) => `
        <div class="igt-v3-snap-item">
          <div class="igt-v3-snap-col-user">
            <img class="igt-v3-snap-item-img" src="${(u.avatarUrl && !u.avatarUrl.includes('<svg')) ? u.avatarUrl : DEFAULT_AVATAR}" alt="${u.username}" />
            <div class="igt-v3-snap-item-info">
              <div class="igt-v3-snap-item-uname">
                <a href="/${u.username}/" target="_blank" style="color: inherit; text-decoration: none;">@${u.username}</a>
                ${u.isVerified ? '<span style="color: #38bdf8; font-size: 11px;"> ✓</span>' : ''}
              </div>
              <div class="igt-v3-snap-item-fname">${u.fullName || ''}</div>
            </div>
          </div>
          <div class="igt-v3-snap-col-status">
            ${u.isPrivate ? `<span class="igt-v3-private-tag"><img class="igt-v3-private-shield-img" src="${privateShieldUrl}" alt="" /> Riêng tư</span>` : ''}
          </div>
        </div>
      `, `Chưa có bản lưu ${typeLabel}`, `Tài khoản @${targetUsername} chưa có dữ liệu Snapshot cho mục này.`, () => {
        closeSnapshotModal();
        runSafeScan(snapshotOrUser, currentTab);
      });
    }

    // --- TAB 3: ⚡ SNAPSHOT DIFFING (T1 vs T0) ---
    function renderDiffView() {
      exportJsonBtn.style.display = 'none';
      const history = diffType === 'followers' ? followersHistory : followingHistory;

      dynamicControls.innerHTML = `
        <div class="igt-v3-diff-sub-bar">
          <div class="igt-v3-diff-modes">
            <button class="igt-v3-diff-mode-btn ${diffType === 'followers' ? 'active' : ''}" id="igt-diff-mode-followers">👥 Biến động Followers</button>
            <button class="igt-v3-diff-mode-btn ${diffType === 'following' ? 'active' : ''}" id="igt-diff-mode-following">🧭 Biến động Following</button>
          </div>
          <div id="igt-diff-time-range" style="font-size: 11px; color: #a1a1aa;"></div>
        </div>
        <div id="igt-diff-metrics-area"></div>
      `;

      const modeFlwBtn = document.getElementById('igt-diff-mode-followers');
      const modeFlwingBtn = document.getElementById('igt-diff-mode-following');
      if (modeFlwBtn) {
        modeFlwBtn.onclick = () => {
          if (diffType !== 'followers') {
            diffType = 'followers';
            diffFilter = 'all';
            renderDiffView();
          }
        };
      }
      if (modeFlwingBtn) {
        modeFlwingBtn.onclick = () => {
          if (diffType !== 'following') {
            diffType = 'following';
            diffFilter = 'all';
            renderDiffView();
          }
        };
      }

      const metricsArea = document.getElementById('igt-diff-metrics-area');
      const timeRangeEl = document.getElementById('igt-diff-time-range');

      if (history.length === 0) {
        if (subtitleEl) subtitleEl.innerText = `Chưa có bản quét ${diffType === 'followers' ? 'Followers' : 'Following'}`;
        listWrap.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; color: #71717a; gap: 10px; text-align: center; padding: 20px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <div style="color: #e4e4e7; font-size: 13.5px; font-weight: 600;">Chưa có dữ liệu để so sánh</div>
            <div style="font-size: 11.5px; color: #71717a; max-width: 320px;">Bạn cần quét danh sách ít nhất 1 lần để tạo mốc cơ sở (T₀).</div>
            <button id="igt-diff-scan-first-btn" class="igt-v3-action-btn primary" style="margin-top: 8px; padding: 7px 18px; font-size: 12px; cursor: pointer; border-radius: 8px;">
              <span>⚡ Quét ${diffType === 'followers' ? 'Followers' : 'Following'} ngay</span>
            </button>
          </div>
        `;
        const scanFirstBtn = document.getElementById('igt-diff-scan-first-btn');
        if (scanFirstBtn) {
          scanFirstBtn.onclick = () => {
            closeSnapshotModal();
            runSafeScan(snapshotOrUser, diffType);
          };
        }
        return;
      }

      if (history.length === 1) {
        const base = history[0];
        const dateStr = new Date(base.timestamp).toLocaleString('vi-VN');
        if (subtitleEl) subtitleEl.innerText = `Mốc cơ sở T₀ • ${base.totalCount.toLocaleString()} người`;
        if (timeRangeEl) timeRangeEl.innerText = `Đã lưu mốc gốc: ${dateStr}`;

        listWrap.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 280px; color: #71717a; gap: 12px; text-align: center; padding: 24px;">
            <div style="font-size: 32px;">🌱</div>
            <div style="color: #4ade80; font-size: 14px; font-weight: 700;">Đã thiết lập Mốc Gốc Cơ Sở (T₀)</div>
            <div style="font-size: 12px; color: #cbd5e1; max-width: 360px; line-height: 1.5;">
              Hệ thống đã lưu danh sách gồm <strong>${base.totalCount.toLocaleString()}</strong> tài khoản lúc ${dateStr}.<br/><br/>
              Khi bạn bấm <strong>Quét lại</strong> sau một thời gian, Thuật toán Diffing sẽ đối chiếu 100% tài khoản và lập tức phát hiện:
              <span style="color: #4ade80;">+ Ai mới follow</span> và <span style="color: #f87171;">- Ai vừa unfollow bạn!</span>
            </div>
            <button id="igt-diff-scan-second-btn" class="igt-v3-action-btn primary" style="margin-top: 10px; padding: 8px 20px; font-size: 12px; cursor: pointer; border-radius: 8px;">
              <span>⚡ Quét lại lần nữa để kiểm tra biến động ngay</span>
            </button>
          </div>
        `;
        const scanSecondBtn = document.getElementById('igt-diff-scan-second-btn');
        if (scanSecondBtn) {
          scanSecondBtn.onclick = () => {
            closeSnapshotModal();
            runSafeScan(snapshotOrUser, diffType);
          };
        }
        return;
      }

      // Có >= 2 bản quét: So sánh bản mới nhất (T₁) với bản liền kề trước đó (T₀)
      const newSnap = history[0];
      const oldSnap = history[1];
      const diffResult = computeSnapshotDiff(oldSnap, newSnap);

      const dNewStr = new Date(newSnap.timestamp).toLocaleString('vi-VN');
      const dOldStr = new Date(oldSnap.timestamp).toLocaleString('vi-VN');
      if (subtitleEl) subtitleEl.innerText = `So sánh giữa ${dNewStr} và ${dOldStr}`;
      if (timeRangeEl) timeRangeEl.innerText = `${dOldStr} ➜ ${dNewStr}`;

      const totalChanges = diffResult.newUsers.length + diffResult.lostUsers.length;

      // Render 3 Metric Cards
      metricsArea.innerHTML = `
        <div class="igt-v3-diff-metrics-grid">
          <div class="igt-v3-diff-card green ${diffFilter === 'added' ? 'active' : ''}" id="igt-diff-card-added" title="Xem người mới Follow">
            <div class="igt-v3-diff-card-num">+${diffResult.newUsers.length.toLocaleString()}</div>
            <div class="igt-v3-diff-card-lbl">${diffType === 'followers' ? 'Mới Follow' : 'Mới Theo Dõi'}</div>
          </div>
          <div class="igt-v3-diff-card red ${diffFilter === 'removed' ? 'active' : ''}" id="igt-diff-card-removed" title="Xem người đã Unfollow">
            <div class="igt-v3-diff-card-num">-${diffResult.lostUsers.length.toLocaleString()}</div>
            <div class="igt-v3-diff-card-lbl">${diffType === 'followers' ? 'Đã Unfollow' : 'Đã Hủy Follow'}</div>
          </div>
          <div class="igt-v3-diff-card grey ${diffFilter === 'all' ? 'active' : ''}" id="igt-diff-card-all" title="Xem toàn bộ biến động">
            <div class="igt-v3-diff-card-num">${totalChanges.toLocaleString()}</div>
            <div class="igt-v3-diff-card-lbl">Tổng Biến Động</div>
          </div>
        </div>
      `;

      document.getElementById('igt-diff-card-added').onclick = () => {
        diffFilter = 'added';
        renderDiffView();
      };
      document.getElementById('igt-diff-card-removed').onclick = () => {
        diffFilter = 'removed';
        renderDiffView();
      };
      document.getElementById('igt-diff-card-all').onclick = () => {
        diffFilter = 'all';
        renderDiffView();
      };

      // Xác định danh sách theo filter
      let diffList = [];
      if (diffFilter === 'added') diffList = diffResult.newUsers;
      else if (diffFilter === 'removed') diffList = diffResult.lostUsers;
      else diffList = [...diffResult.newUsers, ...diffResult.lostUsers];

      exportCsvBtn.onclick = () => {
        exportCustomListToCSV(diffList, `InstaTweaks_Diff_${targetUsername}_${diffType}`, 'Loại Biến Động');
      };

      if (totalChanges === 0) {
        listWrap.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 240px; color: #71717a; gap: 8px; text-align: center; padding: 20px;">
            <div style="font-size: 28px;">✨</div>
            <div style="color: #cbd5e1; font-size: 13.5px; font-weight: 600;">Không có bất kỳ biến động nào!</div>
            <div style="font-size: 11.5px; color: #71717a; max-width: 320px;">100% tài khoản (${newSnap.totalCount.toLocaleString()} người) vẫn giữ nguyên trạng thái giữa 2 lần quét.</div>
          </div>
        `;
        return;
      }

      renderUserList(diffList, (u) => `
        <div class="igt-v3-snap-item">
          <div class="igt-v3-snap-col-user">
            <img class="igt-v3-snap-item-img" src="${(u.avatarUrl && !u.avatarUrl.includes('<svg')) ? u.avatarUrl : DEFAULT_AVATAR}" alt="${u.username}" />
            <div class="igt-v3-snap-item-info">
              <div class="igt-v3-snap-item-uname">
                <a href="/${u.username}/" target="_blank" style="color: inherit; text-decoration: none;">@${u.username}</a>
                ${u.isVerified ? '<span style="color: #38bdf8; font-size: 11px;"> ✓</span>' : ''}
              </div>
              <div class="igt-v3-snap-item-fname">${u.fullName || ''}</div>
            </div>
          </div>
          <div class="igt-v3-snap-col-status">
            ${u.diffType === 'added' ? '<span class="igt-v3-tag-added">▲ + MỚI FOLLOW</span>' : '<span class="igt-v3-tag-removed">▼ - ĐÃ UNFOLLOW</span>'}
            ${u.isPrivate ? `<span class="igt-v3-private-tag" style="margin-left: 4px;"><img class="igt-v3-private-shield-img" src="${privateShieldUrl}" alt="" /></span>` : ''}
          </div>
        </div>
      `, 'Không có biến động nào trong bộ lọc này.', 'Thử chọn bộ lọc khác hoặc tìm kiếm từ khóa khác.');
    }

    // --- TAB 4: 👥 PHÂN TÍCH TƯƠNG HỖ & FOLLOW CHÉO (MUTUAL) ---
    async function renderMutualView() {
      exportJsonBtn.style.display = 'none';

      // Kiểm tra có đủ cả Followers và Following của target không
      if (!followersSnap || !followingSnap) {
        const missing = !followersSnap ? 'Followers' : 'Following';
        if (subtitleEl) subtitleEl.innerText = `Cần quét thêm ${missing}`;
        dynamicControls.innerHTML = '';
        listWrap.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; color: #71717a; gap: 10px; text-align: center; padding: 20px;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <div style="color: #e4e4e7; font-size: 13.5px; font-weight: 600;">Cần dữ liệu của cả 2 danh sách</div>
            <div style="font-size: 11.5px; color: #71717a; max-width: 320px;">Để phân tích ai không follow lại hoặc ai là fan, hệ thống cần có bản Snapshot của cả Followers và Following.</div>
            <button id="igt-mutual-scan-missing-btn" class="igt-v3-action-btn primary" style="margin-top: 8px; padding: 7px 18px; font-size: 12px; cursor: pointer; border-radius: 8px;">
              <span>⚡ Quét ${missing} ngay</span>
            </button>
          </div>
        `;
        const scanMissingBtn = document.getElementById('igt-mutual-scan-missing-btn');
        if (scanMissingBtn) {
          scanMissingBtn.onclick = () => {
            closeSnapshotModal();
            runSafeScan(snapshotOrUser, missing.toLowerCase());
          };
        }
        return;
      }

      const mutualResult = computeMutualAnalysis(followersSnap, followingSnap);

      // Lấy thông tin tài khoản người dùng đang đăng nhập (Tài khoản của tôi)
      const myInfo = await getLoggedInUserInfo();
      const isMyself = Boolean(
        myInfo.username && targetUsername && (
          myInfo.username.toLowerCase() === targetUsername.toLowerCase() ||
          (myInfo.userId && String(myInfo.userId) === String(targetUserId))
        )
      );

      let myFollowersSnap = null;
      let myFollowingSnap = null;
      let crossCommon = null;

      if (!isMyself) {
        if (myInfo.userId) {
          myFollowersSnap = await dbGetLatestSnapshot(myInfo.userId, 'followers');
          myFollowingSnap = await dbGetLatestSnapshot(myInfo.userId, 'following');
        }
        if (!myFollowersSnap && myInfo.username) {
          myFollowersSnap = await dbGetLatestSnapshot(myInfo.username, 'followers');
        }
        if (!myFollowingSnap && myInfo.username) {
          myFollowingSnap = await dbGetLatestSnapshot(myInfo.username, 'following');
        }

        if (myFollowersSnap || myFollowingSnap) {
          crossCommon = computeCrossUserCommon(myFollowingSnap, followingSnap, myFollowersSnap, followersSnap);
        }
      }

      const commonTotal = crossCommon ? crossCommon.allCommonList.length : 0;

      if (subtitleEl) {
        if (mutualFilter === 'common') {
          subtitleEl.innerText = `Điểm chung giữa Bạn (@${myInfo.username || 'tôi'}) và @${targetUsername}`;
        } else {
          subtitleEl.innerText = `Phân tích tương hỗ giữa ${followersSnap.totalCount.toLocaleString()} flwer và ${followingSnap.totalCount.toLocaleString()} flwing`;
        }
      }

      dynamicControls.innerHTML = `
        <div class="igt-v3-mutual-nav">
          <button class="igt-v3-mutual-pill ${mutualFilter === 'not_following_back' ? 'active' : ''}" data-filter="not_following_back">
            ❌ Không follow lại (${mutualResult.notFollowingBack.length.toLocaleString()})
          </button>
          <button class="igt-v3-mutual-pill ${mutualFilter === 'fans' ? 'active' : ''}" data-filter="fans">
            💖 Người hâm mộ (${mutualResult.fans.length.toLocaleString()})
          </button>
          <button class="igt-v3-mutual-pill ${mutualFilter === 'mutual' ? 'active' : ''}" data-filter="mutual">
            🤝 Follow chéo (${mutualResult.mutual.length.toLocaleString()})
          </button>
          <button class="igt-v3-mutual-pill ${mutualFilter === 'common' ? 'active' : ''}" data-filter="common" title="Những người có điểm chung giữa bạn và @${targetUsername}">
            👥 Điểm chung ${crossCommon ? `(${commonTotal.toLocaleString()})` : ''}
          </button>
        </div>
      `;

      dynamicControls.querySelectorAll('.igt-v3-mutual-pill').forEach(pill => {
        pill.onclick = () => {
          const f = pill.getAttribute('data-filter');
          if (mutualFilter !== f) {
            mutualFilter = f;
            renderMutualView();
          }
        };
      });

      // XỬ LÝ SUB-TAB 4: ĐIỂM CHUNG GIỮA BẠN VÀ USER SO SÁNH
      if (mutualFilter === 'common') {
        if (isMyself) {
          if (subtitleEl) subtitleEl.innerText = `Điểm chung: Bạn đang xem chính tài khoản của mình`;
          listWrap.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 260px; color: #71717a; gap: 10px; text-align: center; padding: 20px;">
              <div style="font-size: 32px;">👤</div>
              <div style="color: #e4e4e7; font-size: 13.5px; font-weight: 600;">Bạn đang xem chính tài khoản của mình</div>
              <div style="font-size: 12px; color: #a1a1aa; max-width: 340px; line-height: 1.5;">
                Tính năng <strong>Điểm chung</strong> giúp bạn đối chiếu xem bạn và một người khác trong Watchlist: <strong>Cả 2 cùng follow ai</strong>, <strong>Ai cùng follow cả 2</strong> và <strong>Có bạn bè chung là những ai</strong>.<br/><br/>
                Hãy bấm <strong>Quay lại</strong> và mở tài khoản của một người khác để bắt đầu đối chiếu điểm chung!
              </div>
            </div>
          `;
          return;
        }

        if (!myFollowersSnap && !myFollowingSnap) {
          if (subtitleEl) subtitleEl.innerText = `Cần quét tài khoản của bạn để đối chiếu Điểm chung`;
          listWrap.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 280px; color: #71717a; gap: 12px; text-align: center; padding: 24px;">
              <div style="font-size: 34px;">🔍</div>
              <div style="color: #38bdf8; font-size: 14px; font-weight: 700;">Chưa có dữ liệu tài khoản của bạn để đối chiếu</div>
              <div style="font-size: 12px; color: #cbd5e1; max-width: 360px; line-height: 1.5;">
                Để phát hiện:<br/>
                • <strong>Cả 2 cùng follow ai</strong><br/>
                • <strong>Ai được cả 2 follow / cùng follow cả 2</strong><br/>
                • <strong>Có bạn bè chung là những ai</strong><br/><br/>
                Hệ thống cần có bản Snapshot dữ liệu của chính bạn (${myInfo.username ? '@' + myInfo.username : 'tài khoản đang đăng nhập'}).
              </div>
              <button id="igt-scan-myself-for-common-btn" class="igt-v3-action-btn primary" style="margin-top: 6px; padding: 8px 20px; font-size: 12px; cursor: pointer; border-radius: 8px;">
                <span>⚡ Quét tài khoản của tôi ngay</span>
              </button>
            </div>
          `;
          const scanMyBtn = document.getElementById('igt-scan-myself-for-common-btn');
          if (scanMyBtn) {
            scanMyBtn.onclick = async () => {
              closeSnapshotModal();
              const myTarget = {
                userId: myInfo.userId || myInfo.username,
                username: myInfo.username || 'me',
                fullName: myInfo.fullName || 'Chính tôi',
                avatarUrl: myInfo.avatarUrl || DEFAULT_AVATAR
              };
              runSafeScan(myTarget, 'all');
            };
          }
          return;
        }

        // Đã có dữ liệu đối chiếu -> Hiển thị danh sách điểm chung với sub-filter
        const subNav = document.createElement('div');
        subNav.className = 'igt-v3-common-sub-nav';
        subNav.innerHTML = `
          <button class="igt-v3-common-sub-pill ${commonSubFilter === 'all' ? 'active' : ''}" data-sub="all">
            Tất cả điểm chung (${crossCommon.allCommonList.length.toLocaleString()})
          </button>
          <button class="igt-v3-common-sub-pill ${commonSubFilter === 'following' ? 'active' : ''}" data-sub="following" title="Những người cả Bạn và @${targetUsername} đều đang follow">
            🧭 Cả 2 cùng follow (${crossCommon.commonFollowing.length.toLocaleString()})
          </button>
          <button class="igt-v3-common-sub-pill ${commonSubFilter === 'followers' ? 'active' : ''}" data-sub="followers" title="Những người đang follow cả Bạn và @${targetUsername}">
            👥 Cùng follow cả 2 (${crossCommon.commonFollowers.length.toLocaleString()})
          </button>
          <button class="igt-v3-common-sub-pill ${commonSubFilter === 'mutual_friends' ? 'active' : ''}" data-sub="mutual_friends" title="Những người vừa là bạn bè follow chéo của Bạn, vừa là bạn của @${targetUsername}">
            🤝 Bạn bè chung (${crossCommon.commonMutualFriends.length.toLocaleString()})
          </button>
        `;
        dynamicControls.appendChild(subNav);

        subNav.querySelectorAll('.igt-v3-common-sub-pill').forEach(sp => {
          sp.onclick = () => {
            const sub = sp.getAttribute('data-sub');
            if (commonSubFilter !== sub) {
              commonSubFilter = sub;
              renderMutualView();
            }
          };
        });

        let commonList = [];
        let commonLabel = '';
        if (commonSubFilter === 'following') {
          commonList = crossCommon.commonFollowing;
          commonLabel = 'Cả 2 cùng follow';
        } else if (commonSubFilter === 'followers') {
          commonList = crossCommon.commonFollowers;
          commonLabel = 'Cùng follow cả 2';
        } else if (commonSubFilter === 'mutual_friends') {
          commonList = crossCommon.commonMutualFriends;
          commonLabel = 'Bạn bè chung';
        } else {
          commonList = crossCommon.allCommonList;
          commonLabel = 'Điểm chung';
        }

        if (subtitleEl) {
          subtitleEl.innerText = `Điểm chung giữa Bạn (@${myInfo.username || 'tôi'}) và @${targetUsername} • ${commonList.length.toLocaleString()} người`;
        }

        exportCsvBtn.onclick = () => {
          exportCustomListToCSV(commonList, `InstaTweaks_DiemChung_${targetUsername}_${commonSubFilter}`, 'Loại Điểm Chung');
        };

        renderUserList(commonList, (u) => {
          let badgeHtml = '';
          if (u.commonType === 'mutual_friends') {
            badgeHtml = '<span class="igt-v3-tag-common mutual">🤝 Bạn bè chung</span>';
          } else if (u.commonType === 'following') {
            badgeHtml = '<span class="igt-v3-tag-common following">🧭 Cả 2 cùng fl</span>';
          } else if (u.commonType === 'followers') {
            badgeHtml = '<span class="igt-v3-tag-common followers">👥 Cùng fl cả 2</span>';
          } else {
            badgeHtml = `<span class="igt-v3-tag-common following">${u.commonLabel || 'Điểm chung'}</span>`;
          }

          return `
            <div class="igt-v3-snap-item">
              <div class="igt-v3-snap-col-user">
                <img class="igt-v3-snap-item-img" src="${(u.avatarUrl && !u.avatarUrl.includes('<svg')) ? u.avatarUrl : DEFAULT_AVATAR}" alt="${u.username}" />
                <div class="igt-v3-snap-item-info">
                  <div class="igt-v3-snap-item-uname">
                    <a href="/${u.username}/" target="_blank" style="color: inherit; text-decoration: none;">@${u.username}</a>
                    ${u.isVerified ? '<span style="color: #38bdf8; font-size: 11px;"> ✓</span>' : ''}
                  </div>
                  <div class="igt-v3-snap-item-fname">${u.fullName || ''}</div>
                </div>
              </div>
              <div class="igt-v3-snap-col-status">
                ${badgeHtml}
                ${u.isPrivate ? `<span class="igt-v3-private-tag" style="margin-left: 4px;"><img class="igt-v3-private-shield-img" src="${privateShieldUrl}" alt="" /></span>` : ''}
              </div>
            </div>
          `;
        }, `Không có tài khoản nào thuộc mục "${commonLabel}".`, 'Thử chọn mục điểm chung khác hoặc kiểm tra lại sau.');
        return;
      }

      // SUB-TABS THƯỜNG: KHÔNG FOLLOW LẠI, FANS, FOLLOW CHÉO
      let targetList = [];
      let tagLabel = '';
      if (mutualFilter === 'not_following_back') {
        targetList = mutualResult.notFollowingBack;
        tagLabel = 'Không follow lại bạn';
      } else if (mutualFilter === 'fans') {
        targetList = mutualResult.fans;
        tagLabel = 'Người hâm mộ (Fan)';
      } else {
        targetList = mutualResult.mutual;
        tagLabel = 'Bạn bè (Follow chéo)';
      }

      exportCsvBtn.onclick = () => {
        exportCustomListToCSV(targetList, `InstaTweaks_Mutual_${targetUsername}_${mutualFilter}`, 'Quan Hệ Tương Hỗ');
      };

      renderUserList(targetList, (u) => `
        <div class="igt-v3-snap-item">
          <div class="igt-v3-snap-col-user">
            <img class="igt-v3-snap-item-img" src="${(u.avatarUrl && !u.avatarUrl.includes('<svg')) ? u.avatarUrl : DEFAULT_AVATAR}" alt="${u.username}" />
            <div class="igt-v3-snap-item-info">
              <div class="igt-v3-snap-item-uname">
                <a href="/${u.username}/" target="_blank" style="color: inherit; text-decoration: none;">@${u.username}</a>
                ${u.isVerified ? '<span style="color: #38bdf8; font-size: 11px;"> ✓</span>' : ''}
              </div>
              <div class="igt-v3-snap-item-fname">${u.fullName || ''}</div>
            </div>
          </div>
          <div class="igt-v3-snap-col-status">
            ${mutualFilter === 'not_following_back' ? '<span class="igt-v3-tag-removed">Không follow lại</span>' : (mutualFilter === 'fans' ? '<span class="igt-v3-tag-added">Fan hâm mộ</span>' : '<span style="font-size: 10px; color: #a855f7; font-weight: 700;">🤝 Follow chéo</span>')}
            ${u.isPrivate ? `<span class="igt-v3-private-tag" style="margin-left: 4px;"><img class="igt-v3-private-shield-img" src="${privateShieldUrl}" alt="" /></span>` : ''}
          </div>
        </div>
      `, `Không có tài khoản nào thuộc nhóm "${tagLabel}".`, 'Tất cả tài khoản trong danh sách đều có quan hệ tương hỗ khác.');
    }

    // --- HÀM RENDER USER CHUNG CHO TẤT CẢ CÁC VIEW ---
    function renderUserList(fullItems, itemRenderer, emptyTitle, emptySubtitle, onActionClick) {
      currentRenderedItems = fullItems;
      const f = (searchInput ? searchInput.value : '').toLowerCase().trim();

      if (!fullItems || fullItems.length === 0) {
        listWrap.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 240px; color: #71717a; gap: 8px; text-align: center; padding: 20px;">
            <div style="color: #e4e4e7; font-size: 13px; font-weight: 600;">${emptyTitle}</div>
            <div style="font-size: 11.5px; color: #71717a; max-width: 280px;">${emptySubtitle}</div>
            ${onActionClick ? `
              <button id="igt-snap-common-action-btn" class="igt-v3-action-btn primary" style="margin-top: 8px; padding: 7px 18px; font-size: 12px; cursor: pointer; border-radius: 8px;">
                <span>⚡ Bắt đầu quét ngay</span>
              </button>
            ` : ''}
          </div>
        `;
        const actBtn = document.getElementById('igt-snap-common-action-btn');
        if (actBtn && onActionClick) actBtn.onclick = onActionClick;
        return;
      }

      const filtered = f
        ? fullItems.filter(u => (u.username && u.username.toLowerCase().includes(f)) || (u.fullName && u.fullName.toLowerCase().includes(f)))
        : fullItems.slice(0, 150);

      if (filtered.length === 0) {
        listWrap.innerHTML = `<div style="text-align: center; color: #71717a; font-size: 12px; padding: 24px;">Không tìm thấy tài khoản nào khớp từ khóa "${f}".</div>`;
        return;
      }

      listWrap.innerHTML = filtered.map(itemRenderer).join('') + (fullItems.length > 150 && !f ? `<div style="text-align: center; color: #71717a; font-size: 11px; padding: 8px;">(Hiển thị trước 150 / ${fullItems.length.toLocaleString()} người. Xuất file CSV để xem toàn bộ 100%)</div>` : '');
    }

    if (searchInput) {
      searchInput.oninput = () => {
        if (currentTab === 'followers' || currentTab === 'following') {
          const activeSnap = currentTab === 'followers' ? followersSnap : followingSnap;
          renderUserList(activeSnap?.items || [], (u) => `
            <div class="igt-v3-snap-item">
              <div class="igt-v3-snap-col-user">
                <img class="igt-v3-snap-item-img" src="${(u.avatarUrl && !u.avatarUrl.includes('<svg')) ? u.avatarUrl : DEFAULT_AVATAR}" alt="${u.username}" />
                <div class="igt-v3-snap-item-info">
                  <div class="igt-v3-snap-item-uname">
                    <a href="/${u.username}/" target="_blank" style="color: inherit; text-decoration: none;">@${u.username}</a>
                    ${u.isVerified ? '<span style="color: #38bdf8; font-size: 11px;"> ✓</span>' : ''}
                  </div>
                  <div class="igt-v3-snap-item-fname">${u.fullName || ''}</div>
                </div>
              </div>
              <div class="igt-v3-snap-col-status">
                ${u.isPrivate ? `<span class="igt-v3-private-tag"><img class="igt-v3-private-shield-img" src="${privateShieldUrl}" alt="" /> Riêng tư</span>` : ''}
              </div>
            </div>
          `, 'Không có dữ liệu', 'Hãy thử lại');
        } else if (currentTab === 'diff') {
          renderDiffView();
        } else if (currentTab === 'mutual') {
          renderMutualView();
        }
      };
    }

    // Khởi chạy view ban đầu
    renderActiveView();
  }

  // --- HÀM XUẤT FILE DANH SÁCH TÙY BIẾN CHO DIFF VÀ MUTUAL SANG CSV ---
  function exportCustomListToCSV(items, filename, tagLabel = 'Trạng Thái') {
    if (!items || items.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const headers = ['STT', 'User ID', 'Username', 'Họ Tên', tagLabel, 'Tích Xanh', 'Riêng Tư', 'Link Profile'];
    const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
    const rows = items.map((item, idx) => [
      idx + 1,
      escapeCsv(item.id),
      escapeCsv(item.username),
      escapeCsv(item.fullName),
      escapeCsv(item.diffStatus || item.mutualStatus || (item.diffType === 'added' ? 'Mới Follow (+)' : (item.diffType === 'removed' ? 'Đã Unfollow (-)' : ''))),
      item.isVerified ? 'Có' : 'Không',
      item.isPrivate ? 'Riêng tư' : 'Công khai',
      `https://www.instagram.com/${item.username}/`
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${filename}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  // --- XUẤT FILE CSV (CHO EXCEL CÓ DẤU TIẾNG VIỆT) & JSON ---
  function exportSnapshotToCSV(snapshot) {
    if (!snapshot || !snapshot.items || snapshot.items.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const headers = ['STT', 'User ID', 'Username', 'Họ Tên', 'Tích Xanh', 'Riêng Tư', 'Link Profile'];
    const escapeCsv = (str) => `"${String(str || '').replace(/"/g, '""')}"`;
    const rows = snapshot.items.map((item, idx) => [
      idx + 1,
      escapeCsv(item.id),
      escapeCsv(item.username),
      escapeCsv(item.fullName),
      item.isVerified ? 'Có' : 'Không',
      item.isPrivate ? 'Riêng tư' : 'Công khai',
      `https://www.instagram.com/${item.username}/`
    ].join(','));

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date(snapshot.timestamp || Date.now()).toISOString().slice(0, 10);
    a.href = url;
    a.download = `InstaTweaks_${snapshot.targetUsername}_${snapshot.type}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function exportSnapshotToJSON(snapshot) {
    if (!snapshot || !snapshot.items || snapshot.items.length === 0) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const jsonStr = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date(snapshot.timestamp || Date.now()).toISOString().slice(0, 10);
    a.href = url;
    a.download = `InstaTweaks_${snapshot.targetUsername}_${snapshot.type}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function updateUIControls() {
    const tStory = document.getElementById('igt-toggle-ghost-story');
    if (tStory) tStory.checked = v3Settings.ghostStory;

    const tDM = document.getElementById('igt-toggle-ghost-dm');
    if (tDM) tDM.checked = v3Settings.ghostDM;

    const tAd = document.getElementById('igt-toggle-adblock');
    if (tAd) tAd.checked = v3Settings.adblock;

    const tSharp = document.getElementById('igt-toggle-sharpness');
    if (tSharp) tSharp.checked = v3Settings.videoSharpness;
  }

  function toggleV3Drawer() {
    if (!isExtensionValid()) {
      alert('Tiện ích InstaTweaks vừa được cập nhật lại trong Chrome.\nVui lòng nhấn F5 (Tải lại trang) để tiếp tục!');
      return;
    }
    createDrawerDOM();
    if (isDrawerOpen) {
      closeV3Drawer();
    } else {
      openV3Drawer();
    }
  }

  function openV3Drawer() {
    if (!isExtensionValid()) {
      alert('Tiện ích InstaTweaks vừa được cập nhật lại trong Chrome.\nVui lòng nhấn F5 (Tải lại trang) để tiếp tục!');
      return;
    }
    createDrawerDOM();
    updateScanMyselfButtonUI();
    const panel = document.getElementById('igt-v3-drawer-panel');
    const backdrop = document.getElementById('igt-v3-backdrop');
    if (panel && backdrop) {
      panel.classList.add('igt-open');
      backdrop.classList.add('igt-open');
      isDrawerOpen = true;
      // renderWatchlistInDrawer(); // Tạm ẩn theo yêu cầu để tối ưu tải trang
    }
  }

  function closeV3Drawer() {
    const panel = document.getElementById('igt-v3-drawer-panel');
    const backdrop = document.getElementById('igt-v3-backdrop');
    if (panel && backdrop) {
      panel.classList.remove('igt-open');
      backdrop.classList.remove('igt-open');
      isDrawerOpen = false;

      // Đóng luôn modal snapshot nếu đang mở
      const modal = document.getElementById('igt-v3-snap-modal');
      if (modal) {
        modal.classList.add('igt-hidden');
        modal.style.setProperty('display', 'none', 'important');
      }
      closeExpandedWatchlist();
    }
  }

  function applyActiveSettings() {
    applyVideoSharpness();
    cleanFeedAds();
    updateGhostStatusBadge();
    scanAndAttachViewOnceButtons();
  }

  // --- 8. KHỞI CHẠY VÀ MUTATION OBSERVER ---
  function init() {
    loadSettings();
    injectSVGFilters();
    initIndexedDB();

    // 1. Khởi tạo Drawer DOM ngay từ đầu để panel và backdrop luôn sẵn sàng, mở tức thì 0ms trễ
    createDrawerDOM();

    // 2. Thử inject nút navigation và status badge
    injectSidebarNavButton();
    updateGhostStatusBadge();
    // scanAndAttachWatchlistButton(); // Tạm ẩn theo yêu cầu để tối ưu tải trang

    // 3. Áp dụng tính năng ban đầu
    applyActiveSettings();

    // 4. Lắng nghe sự kiện click mở Tool ở tầng Capture cao nhất để không bao giờ bị React/Instagram nuốt
    document.addEventListener('click', (e) => {
      const navBtn = e.target && e.target.closest && e.target.closest('#igt-v3-sidebar-nav-btn');
      if (navBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleV3Drawer();
      }
    }, true);

    // 5. Quan sát DOM tối ưu:
    // - Lọc bỏ 100% mutation do chính InstaTweaks tạo ra (ngăn chặn triệt để vòng lặp Feedback Loop gây lag 100% CPU)
    // - Debounce 250ms trước khi kiểm tra lại để giảm thiểu tối đa số lần layout reflow
    let domChangeThrottle = null;
    let lastKnownPath = window.location.pathname;

    const observer = new MutationObserver((mutations) => {
      if (!isExtensionValid()) {
        try { observer.disconnect(); } catch (_) { }
        return;
      }

      let hasExternalChanges = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const targetId = m.target?.id || '';
        const targetClass = typeof m.target?.className === 'string' ? m.target.className : '';
        if (targetId.startsWith('igt-') || targetClass.includes('igt-')) continue;

        for (let j = 0; j < m.addedNodes.length; j++) {
          const n = m.addedNodes[j];
          if (n.nodeType === 1) {
            const nid = n.id || '';
            const ncls = typeof n.className === 'string' ? n.className : '';
            if (!nid.startsWith('igt-') && !ncls.includes('igt-')) {
              hasExternalChanges = true;
              break;
            }
          }
        }
        if (hasExternalChanges) break;
      }

      if (!hasExternalChanges) return;

      if (window.location.pathname !== lastKnownPath) {
        lastKnownPath = window.location.pathname;
        if (window.location.pathname.startsWith('/stories/')) {
          const openAvatarModal = document.getElementById('igt-hd-avatar-modal');
          if (openAvatarModal) openAvatarModal.remove();
          hideAvatarHoverPopover(0);
        }
        injectSidebarNavButton();
        updateGhostStatusBadge();
        scanAndAttachViewOnceButtons();
      }

      if (!domChangeThrottle) {
        domChangeThrottle = setTimeout(() => {
          domChangeThrottle = null;
          if (!isExtensionValid()) {
            try { observer.disconnect(); } catch (_) { }
            return;
          }
          applyVideoSharpness();
          cleanFeedAds();
          injectSidebarNavButton();
          updateGhostStatusBadge();
          scanAndAttachViewOnceButtons();
        }, 250);
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // Lắng nghe chuyển trang SPA
    window.addEventListener('__IG_NAVIGATED__', () => {
      if (!isExtensionValid()) return;
      if (window.location.pathname.startsWith('/stories/')) {
        const m = document.getElementById('igt-hd-avatar-modal');
        if (m) m.remove();
        hideAvatarHoverPopover(0);
      }
      setTimeout(() => {
        if (!isExtensionValid()) return;
        injectSidebarNavButton();
        updateGhostStatusBadge();
        applyActiveSettings();
        scanAndAttachViewOnceButtons();
      }, 300);
    });

    window.addEventListener('popstate', () => {
      if (!isExtensionValid()) return;
      if (window.location.pathname.startsWith('/stories/')) {
        const m = document.getElementById('igt-hd-avatar-modal');
        if (m) m.remove();
        hideAvatarHoverPopover(0);
      }
      setTimeout(() => {
        if (!isExtensionValid()) return;
        injectSidebarNavButton();
        updateGhostStatusBadge();
        scanAndAttachViewOnceButtons();
      }, 200);
    });

    let resizeThrottle = null;
    window.addEventListener('resize', () => {
      if (!resizeThrottle) {
        resizeThrottle = requestAnimationFrame(() => {
          resizeThrottle = null;
          alignNavButtonWithInstagram();
          updateFloatingChatBadge();
        });
      }
    });

    console.log('[InstaTweaks v3.2.0] Core Module Initialized Successfully.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
