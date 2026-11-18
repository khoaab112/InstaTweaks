/**
 * IG Web Music Player - Injected Script (v1.6.5)
 * Chạy trong MAIN world tại document_start.
 * - Trích xuất chính xác 100% dữ liệu nhạc từ GraphQL, XHR/Fetch, SSR script
 * - Truy vấn chủ động đa tầng (GraphQL Persisted Query doc_id + REST API media info)
 * - Tối ưu băng thông: Bỏ qua các file tĩnh và request tracking/logging không cần thiết
 * - Ghi nhớ kết quả vào cache để không query dư thừa
 */

(function () {
  'use strict';

  // --- INSTATWEAKS v3.5: NOTIFICATION BLACKBOX RECORDER (BẮT TRỌN TIN NHẮN TỪ THÔNG BÁO) ---
  try {
    if (typeof window.Notification === 'function') {
      const OriginalNotification = window.Notification;
      window.Notification = function (title, options = {}) {
        try {
          const body = options.body || '';
          const icon = options.icon || '';
          const image = options.image || '';
          const tag = options.tag || '';
          
          if (body || title) {
            console.log('[InstaTweaks Notification Hook] Bắt được thông báo:', title, body);
            window.dispatchEvent(new CustomEvent('__IGT_INCOMING_NOTIFICATION__', {
              detail: {
                title: String(title || ''),
                body: String(body || ''),
                icon: String(icon || ''),
                image: String(image || ''),
                tag: String(tag || ''),
                timestamp: Date.now()
              }
            }));
          }
        } catch (_) {}
        return new OriginalNotification(title, options);
      };
      // Sao chép các thuộc tính tĩnh của Notification (permission, requestPermission...)
      Object.setPrototypeOf(window.Notification, OriginalNotification);
      window.Notification.prototype = OriginalNotification.prototype;
      if (OriginalNotification.permission) {
        Object.defineProperty(window.Notification, 'permission', {
          get: () => OriginalNotification.permission
        });
      }
      if (typeof OriginalNotification.requestPermission === 'function') {
        window.Notification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification);
      }
    }

    if (typeof ServiceWorkerRegistration !== 'undefined' && ServiceWorkerRegistration.prototype.showNotification) {
      const origShowNotification = ServiceWorkerRegistration.prototype.showNotification;
      ServiceWorkerRegistration.prototype.showNotification = function (title, options = {}) {
        try {
          const body = options.body || '';
          const icon = options.icon || '';
          const image = options.image || '';
          const tag = options.tag || '';
          
          if (body || title) {
            console.log('[InstaTweaks ServiceWorker Hook] Bắt được thông báo ServiceWorker:', title, body);
            window.dispatchEvent(new CustomEvent('__IGT_INCOMING_NOTIFICATION__', {
              detail: {
                title: String(title || ''),
                body: String(body || ''),
                icon: String(icon || ''),
                image: String(image || ''),
                tag: String(tag || ''),
                timestamp: Date.now()
              }
            }));
          }
        } catch (_) {}
        return origShowNotification.apply(this, arguments);
      };
    }
  } catch (_) {}



  const MAX_TRACKS_CACHE = 80;
  const MAX_NO_AUDIO_CACHE = 100;

  const discoveredTracks = new Map();
  const noAudioSet = new Set();
  const inFlightFetches = new Set();
  const postMediaMap = new Map();
  const storyMediaMap = new Map();
  const reelMediaMap = new Map();
  const cachedHighlights = new Map();
  const capturedVideoUrls = [];
  const activeStoryVideos = [];
  let lastKnownPostDocId = localStorage.getItem('__ig_post_doc_id__') || '8845758582119845';
  let lastKnownProfileDocId = localStorage.getItem('__ig_profile_doc_id__') || '6936306999797079';
  let lastKnownStoryDocId = localStorage.getItem('__ig_story_doc_id__') || '8845758582119845';

  // =========================================================================
  // INSTATWEAKS v3.0 - SETTINGS & GHOST MODE INTERCEPTOR (HOÀN THIỆN 100%)
  // =========================================================================
  const igtV3Settings = {
    ghostStory: localStorage.getItem('__igt_ghost_story__') !== 'false',
    ghostDM: localStorage.getItem('__igt_ghost_dm__') !== 'false',
    adblock: localStorage.getItem('__igt_adblock__') !== 'false',
    videoSharpness: localStorage.getItem('__igt_video_sharpness__') !== 'false',
        ghostViewOnce: localStorage.getItem('__igt_ghost_view_once__') !== 'false'
  };

  window.addEventListener('__IGT_SYNC_SETTINGS__', (e) => {
    if (e.detail) {
      Object.assign(igtV3Settings, e.detail);
      if (e.detail.ghostStory !== undefined) localStorage.setItem('__igt_ghost_story__', String(e.detail.ghostStory));
      if (e.detail.ghostDM !== undefined) localStorage.setItem('__igt_ghost_dm__', String(e.detail.ghostDM));
      if (e.detail.adblock !== undefined) localStorage.setItem('__igt_adblock__', String(e.detail.adblock));
      if (e.detail.videoSharpness !== undefined) localStorage.setItem('__igt_video_sharpness__', String(e.detail.videoSharpness));
            if (e.detail.ghostViewOnce !== undefined) localStorage.setItem('__igt_ghost_view_once__', String(e.detail.ghostViewOnce));
    }
  });

  // Lắng nghe sự kiện người dùng vừa gửi tin nhắn để mở đường cho tín hiệu đã xem hợp lệ
  window.addEventListener('__IGT_USER_SENT_DM__', () => {
    lastSentMessageTime = Date.now();
    console.log('[InstaTweaks 3.0] Ghost DM: Nhận tín hiệu người dùng gửi tin nhắn -> Kích hoạt chế độ gửi đã xem hợp lệ!');
  });

  // HÀM TRÍCH XUẤT BODY AN TOÀN CHO CẢ FORMDATA, URLSEARCHPARAMS, STRING
  function safeExtractBodyString(body) {
    if (!body) return '';
    if (typeof body === 'string') return body;
    try {
      if (body instanceof URLSearchParams) {
        return body.toString();
      }
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        const parts = [];
        body.forEach((val, key) => {
          if (typeof val === 'string') parts.push(`${key}=${val}`);
        });
        return parts.join('&');
      }
    } catch (_) {}
    return '';
  }

  function isGhostStoryRequest(url, bodyStr = '', friendlyName = '') {
    if (!igtV3Settings.ghostStory) return false;
    const fullCheck = (typeof url === 'string' ? url : '') + ' ' + (typeof bodyStr === 'string' ? bodyStr : '') + ' ' + (typeof friendlyName === 'string' ? friendlyName : '');
    
    // 1. REST API endpoints
    if (
      fullCheck.includes('/api/v1/stories/reel/seen') ||
      fullCheck.includes('/stories/reel/seen') ||
      fullCheck.includes('stories/reel/seen')
    ) {
      return true;
    }

    // 2. GraphQL Mutations báo seen Story (CHÍNH XÁC POLARIS WEB APP)
    if (
      fullCheck.includes('PolarisStoriesV3SeenMutation') ||
      fullCheck.includes('StoriesV3SeenMutation') ||
      fullCheck.includes('StoriesSeenMutation') ||
      fullCheck.includes('useStoriesSeenMutation') ||
      fullCheck.includes('stories_reel_seen')
    ) {
      // Đảm bảo không phải là query nạp timeline/profile/stories
      if (!fullCheck.includes('PolarisProfile') && !fullCheck.includes('PolarisStoriesV3Query') && !fullCheck.includes('PolarisStoriesQuery')) {
        return true;
      }
    }
    return false;
  }

  let lastSentMessageTime = 0; // Ghi nhận thời điểm người dùng vừa trả lời tin nhắn

  function isGhostDMRequest(url, bodyStr = '', friendlyName = '') {
    if (!igtV3Settings.ghostDM) return false;
    // NẾU NGƯỜI DÙNG VỪA TRẢ LỜI TIN NHẮN (TRONG VÒNG 10S) -> KHÔNG CHẶN SEEN ĐỂ GỬI BÁO ĐÃ XEM HỢP LỆ LÊN SERVER!
    if (Date.now() - lastSentMessageTime < 10000) {
      console.log('[InstaTweaks 3.0] Ghost DM: Người dùng vừa gửi tin nhắn -> Cho phép gửi tín hiệu Đã xem tự nhiên.');
      return false;
    }

    const fullCheck = (typeof url === 'string' ? url : '') + ' ' + (typeof bodyStr === 'string' ? bodyStr : '') + ' ' + (typeof friendlyName === 'string' ? friendlyName : '');

    // 1. REST API endpoints báo seen trong DM
    if (
      (fullCheck.includes('/direct_v2/threads/') && fullCheck.includes('/seen')) ||
      (fullCheck.includes('/api/v1/direct_v2/threads/') && fullCheck.includes('/seen'))
    ) {
      return true;
    }

    // 2. GraphQL Mutations báo seen DM (CHÍNH XÁC POLARIS WEB APP: useIGDMarkThreadAsReadMutation)
    if (
      fullCheck.includes('useIGDMarkThreadAsReadMutation') ||
      fullCheck.includes('IGDMarkThreadAsReadMutation') ||
      fullCheck.includes('MarkThreadAsReadMutation') ||
      fullCheck.includes('MarkThreadAsRead') ||
      fullCheck.includes('mark_thread_as_read') ||
      fullCheck.includes('DirectThreadSeenMutation') ||
      fullCheck.includes('useDirectThreadSeenMutation') ||
      fullCheck.includes('PolarisDirectThreadSeenMutation') ||
      fullCheck.includes('mark_direct_thread_seen') ||
      fullCheck.includes('direct_thread_seen')
    ) {
      if (!fullCheck.includes('DirectInboxQuery') && !fullCheck.includes('DirectThreadQuery')) {
        return true;
      }
    }
    return false;
  }

  function isGhostViewOnceRequest(url, bodyStr = '', friendlyName = '') {
    if (!igtV3Settings.ghostViewOnce) return false;
    const fullCheck = (typeof url === 'string' ? url : '') + ' ' + (typeof bodyStr === 'string' ? bodyStr : '') + ' ' + (typeof friendlyName === 'string' ? friendlyName : '');
    
    if (
      fullCheck.includes('/visual_threads/') ||
      fullCheck.includes('/visual_item_seen') ||
      fullCheck.includes('/item_seen') ||
      fullCheck.includes('VisualItemSeen') ||
      fullCheck.includes('visual_thread_seen') ||
      fullCheck.includes('PolarisDirectVisualItemSeen') ||
      fullCheck.includes('useIGDVisualItemSeenMutation') ||
      fullCheck.includes('mark_visual_item_seen') ||
      (fullCheck.includes('/direct_v2/') && fullCheck.includes('seen') && fullCheck.includes('visual'))
    ) {
      return true;
    }
    return false;
  }

  // --- HOOK NAVIGATOR.SENDBEACON (CHẶN STORY & DM SEEN BEACONS) ---
  if (navigator && typeof navigator.sendBeacon === 'function') {
    const originalSendBeacon = navigator.sendBeacon;
    navigator.sendBeacon = function (url, data) {
      const urlStr = typeof url === 'string' ? url : (url?.url || '');
      const bodyStr = safeExtractBodyString(data);

      if (isGhostStoryRequest(urlStr, bodyStr)) {
        console.log('[InstaTweaks 3.0] Ghost Story: Blocked sendBeacon ->', urlStr);
        return true;
      }
      if (isGhostDMRequest(urlStr, bodyStr)) {
        console.log('[InstaTweaks 3.0] Ghost DM: Blocked sendBeacon ->', urlStr);
        return true;
      }
      if (isGhostViewOnceRequest(urlStr, bodyStr)) {
        console.log('[InstaTweaks 3.5] Ghost View Once: Blocked sendBeacon ->', urlStr);
        return true;
      }
      return originalSendBeacon.apply(navigator, [url, data]);
    };
  }

  // --- HOOK WEBSOCKET (CHẶN REALTIME DM SEEN & BẮT TIN NHẮN TỰ ĐỘNG) ---
  if (typeof WebSocket !== 'undefined') {
    const originalWsSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if ((igtV3Settings.ghostDM || igtV3Settings.ghostViewOnce) && typeof data === 'string') {
        if (
          data.includes('"mark_seen"') ||
          data.includes('"action":"seen"') ||
          data.includes('"item_type":"seen"') ||
          data.includes('/seen') ||
          data.includes('visual_item_seen') ||
          data.includes('item_seen')
        ) {
          console.log('[InstaTweaks 3.5] Ghost DM / View Once: Blocked WebSocket seen event!');
          return;
        }
      }
      return originalWsSend.apply(this, arguments);
    };

    function isInstagramAvatarUrl(src) {
      if (!src || typeof src !== 'string') return false;
      const lower = src.toLowerCase();
      if (lower.includes('/t51.2885-19/') || lower.includes('-19/') || lower.includes('s150x150') || lower.includes('s320x320') || lower.includes('s50x50') || lower.includes('/profile_pic')) return true;
      return false;
    }

    // Lắng nghe và trích xuất tin nhắn thời gian thực qua WebSocket (kể cả khi đang lướt Bảng tin / Feed)
    function extractDmDirectlyFromWs(rawStr) {
      if (!rawStr || typeof rawStr !== 'string') return;
      try {
        // 1. Quét các JSON Block hợp lệ bên trong chuỗi nhị phân MQTT
        let depth = 0;
        let start = -1;
        let inStr = false;
        let esc = false;
        const jsonCandidates = [];

        for (let i = 0; i < rawStr.length; i++) {
          const c = rawStr[i];
          if (esc) { esc = false; continue; }
          if (c === '\\' && inStr) { esc = true; continue; }
          if (c === '"') { inStr = !inStr; continue; }
          if (!inStr) {
            if (c === '{') {
              if (depth === 0) start = i;
              depth++;
            } else if (c === '}') {
              depth--;
              if (depth === 0 && start !== -1) {
                const sub = rawStr.substring(start, i + 1);
                if (sub.includes('item_id') || sub.includes('deleted_item_id') || sub.includes('thread_id') || sub.includes('item_delete')) {
                  try {
                    const parsed = JSON.parse(sub);
                    jsonCandidates.push(parsed);
                  } catch (_) {}
                }
                start = -1;
              } else if (depth < 0) {
                depth = 0;
                start = -1;
              }
            }
          }
        }

        for (const cand of jsonCandidates) {
          extractDirectMessagesFromPayload(cand);
        }

        // 2. BỘ TRÍCH XUẤT REGEX ĐỘC LẬP (Bảo vệ 100% khi MQTT bị nén/lồng ký tự nhị phân)
        // A. Nhận diện sự kiện Thu hồi (Unsend Event)
        const unsendRegex = /(?:"deleted_item_id"|"deleted_message_id"|"item_id"|"id")\s*:\s*"?([0-9a-zA-Z_$.-]{10,80})"?[^}]*?(?:"action"|"type"|"event")\s*:\s*"(?:item_delete|delete|item_deleted|unsend)"/i;
        const unsendRegex2 = /(?:"action"|"type"|"event")\s*:\s*"(?:item_delete|delete|item_deleted|unsend)"[^}]*?(?:"deleted_item_id"|"deleted_message_id"|"item_id"|"id")\s*:\s*"?([0-9a-zA-Z_$.-]{10,80})"?/i;
        const unsendMatch = rawStr.match(unsendRegex) || rawStr.match(unsendRegex2);
        if (unsendMatch) {
          const delId = unsendMatch[1];
          console.log('[InstaTweaks WS] Bắt được tín hiệu thu hồi realtime qua WebSocket (Feed):', delId);
          window.dispatchEvent(new CustomEvent('__IGT_DM_UNSEND_EVENT__', {
            detail: { id: delId, threadId: '', timestamp: Date.now() }
          }));
        }

        // B. Bắt tin nhắn văn bản / media mới đến realtime qua WebSocket khi đang lướt Feed
        const itemIdMatch = rawStr.match(/(?:"item_id"|"id"|"mid"|"message_id")\s*:\s*"?([0-9a-zA-Z_$.-]{10,80})"?/);
        const textMatch = rawStr.match(/(?:"text"|"text_body"|"igd_snippet")\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
        if (itemIdMatch && (textMatch || rawStr.includes('cdninstagram') || rawStr.includes('fbcdn'))) {
          const id = itemIdMatch[1];
          let text = '';
          if (textMatch) {
            try { text = JSON.parse('"' + textMatch[1] + '"'); } catch (_) { text = textMatch[1]; }
          }

          const threadMatch = rawStr.match(/(?:"thread_id"|"thread_fbid")\s*:\s*"?([0-9]{10,25})"?/);
          const userMatch = rawStr.match(/(?:"user_id"|"sender_fbid"|"sender_id")\s*:\s*"?([0-9]{10,25})"?/);
          const tid = threadMatch ? threadMatch[1] : '';

          let mediaUrl = '';
          let mediaType = '';
          const cdnMatch = rawStr.match(/"(?:url|uri|src)"\s*:\s*"(https?:[^"]+(?:cdninstagram|fbcdn)[^"]+)"/);
          if (cdnMatch) {
            mediaUrl = cdnMatch[1].replace(/\\\//g, '/');
            if (isInstagramAvatarUrl(mediaUrl)) {
              mediaUrl = '';
            } else {
              mediaType = (mediaUrl.includes('.mp4') || rawStr.includes('"video_versions"')) ? 'video' : 'image';
            }
          }

          const isVisual = rawStr.includes('"visual_media"') || rawStr.includes('"view_mode":"once"');

          console.log('[InstaTweaks WS] Ghi nhận tin nhắn Direct mới qua WebSocket (Feed):', id, text || mediaType);
          window.dispatchEvent(new CustomEvent('__IGT_DM_ITEMS_STORE__', {
            detail: {
              items: [{
                id: id,
                threadId: tid,
                userId: userMatch ? userMatch[1] : '',
                timestamp: Date.now(),
                itemType: isVisual ? 'visual_media' : (mediaUrl ? 'media' : 'text'),
                text: text,
                mediaUrl: mediaUrl,
                mediaType: mediaType,
                isVisual: isVisual,
                viewMode: isVisual ? 'once' : '',
                isUnsent: false
              }],
              threadId: tid,
              activeIds: [id]
            }
          }));
        }
      } catch (_) {}
    }

    // Lắng nghe các gói tin nhắn realtime nhận về từ WebSocket (hỗ trợ cả chuỗi String và Binary ArrayBuffer/Blob của MQTT)
    function inspectWsEventData(data) {
      if (!data) return;
      try {
        if (typeof data === 'string') {
          extractDmDirectlyFromWs(data);
          if (data.includes('"item_id"') || data.includes('"thread_id"') || data.includes('"item_unsend"') || data.includes('"item_delete"') || data.includes('"deleted_item_id"') || data.includes('"placeholder"')) {
            parseMetaResponseText(data);
          }
        } else if (data instanceof ArrayBuffer) {
          const str = new TextDecoder('utf-8', { fatal: false }).decode(data);
          if (str) {
            extractDmDirectlyFromWs(str);
            if (str.includes('"item_id"') || str.includes('"thread_id"') || str.includes('"item_unsend"') || str.includes('"item_delete"') || str.includes('"deleted_item_id"') || str.includes('"placeholder"')) {
              parseMetaResponseText(str);
            }
          }
        } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
          data.text().then(str => {
            if (str) {
              extractDmDirectlyFromWs(str);
              if (str.includes('"item_id"') || str.includes('"thread_id"') || str.includes('"item_unsend"') || str.includes('"item_delete"') || str.includes('"deleted_item_id"') || str.includes('"placeholder"')) {
                parseMetaResponseText(str);
              }
            }
          }).catch(() => {});
        }
      } catch (_) {}
    }

    const originalWsAddEventListener = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function (type, listener, ...rest) {
      if (type === 'message' && typeof listener === 'function') {
        const wrapped = function (event) {
          inspectWsEventData(event?.data);
          return listener.apply(this, arguments);
        };
        return originalWsAddEventListener.apply(this, [type, wrapped, ...rest]);
      }
      return originalWsAddEventListener.apply(this, [type, listener, ...rest]);
    };


    // Lắng nghe ServiceWorker messages trên Home Feed
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        try {
          const data = event.data;
          if (data) {
            if (typeof data === 'string') {
              parseMetaResponseText(data);
            } else if (typeof data === 'object') {
              processPayload(data);
            }
          }
        } catch (_) {}
      });
    }

    // Hook Web Notification constructor để bắt thông báo tin nhắn trên Windows/Chrome khi ở Feed
    if (typeof window.Notification !== 'undefined') {
      const RealNotification = window.Notification;
      window.Notification = function (title, options) {
        try {
          const text = options?.body || '';
          const sender = (title && title !== 'Instagram') ? title : '';
          const icon = options?.icon || '';
          const tag = options?.tag || '';
          if (text) {
            console.log('[InstaTweaks Notification Hook] Bắt được tin nhắn từ Web Notification:', sender, text);
            window.dispatchEvent(new CustomEvent('__IGT_DM_ITEMS_STORE__', {
              detail: {
                items: [{
                  id: tag || ('notif_' + Date.now().toString(36)),
                  threadId: '',
                  sender: sender,
                  senderAvatar: icon,
                  timestamp: Date.now(),
                  itemType: 'text',
                  text: text,
                  mediaUrl: '',
                  mediaType: '',
                  isUnsent: false
                }]
              }
            }));
          }
        } catch (_) {}
        return new RealNotification(title, options);
      };
      try {
        Object.setPrototypeOf(window.Notification, RealNotification);
        Object.assign(window.Notification, RealNotification);
      } catch (_) {}
    }

    // Hook thêm thuộc tính onmessage của WebSocket
    let originalOnMessageDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', {
      set(fn) {
        if (typeof fn === 'function') {
          const wrapped = function (event) {
            inspectWsEventData(event?.data);
            return fn.apply(this, arguments);
          };
          this._igt_wrapped_onmessage = wrapped;
          if (originalOnMessageDesc && originalOnMessageDesc.set) {
            originalOnMessageDesc.set.call(this, wrapped);
          } else {
            this.addEventListener('message', wrapped);
          }
        } else {
          this._igt_wrapped_onmessage = null;
          if (originalOnMessageDesc && originalOnMessageDesc.set) {
            originalOnMessageDesc.set.call(this, fn);
          }
        }
      },
      get() {
        return this._igt_wrapped_onmessage || (originalOnMessageDesc && originalOnMessageDesc.get ? originalOnMessageDesc.get.call(this) : null);
      },
      configurable: true
    });
  }

  // HÀM QUẢN LÝ BỘ NHỚ AN TOÀN (CHỐNG TRÀN RAM - GIỚI HẠN KÍCH THƯỚC MAP & SET)
  function safeMapSet(map, key, value, maxSize = 60) {
    if (!map || key === undefined || key === null) return;
    if (map.has(key)) {
      map.set(key, value);
      return;
    }
    if (map.size >= maxSize) {
      const firstKey = map.keys().next().value;
      if (firstKey !== undefined) map.delete(firstKey);
    }
    map.set(key, value);
  }

  function safeSetAdd(set, val, maxSize = 80) {
    if (!set || val === undefined || val === null) return;
    if (set.has(val)) return;
    if (set.size >= maxSize) {
      const firstVal = set.values().next().value;
      if (firstVal !== undefined) set.delete(firstVal);
    }
    set.add(val);
  }

  function isValidVideoMp4Url(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
    if (isDashAudioUrl(url)) return false;
    if (url.includes('bytestart=') || url.includes('byteend=')) return false;
    if (/\.(jpg|jpeg|png|webp|gif|mp3|m4a|aac|wav|ogg)(\?|$)/i.test(url)) return false;
    if (url.includes('.mp4') || url.includes('/v/t50.') || url.includes('/o1/v/')) return true;
    return false;
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
      } catch (_) {}
    }
    return false;
  }

  function recordVideoUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return;
    // BỎ QUA HOÀN TOÀN CÁC LUỒNG ÂM THANH DASH (tránh lỗi tải video màn hình đen chỉ có tiếng)
    if (isDashAudioUrl(url)) {
      return;
    }

    if (
      url.includes('.mp4') || 
      (url.includes('/o1/v/') && (url.includes('cdninstagram') || url.includes('fbcdn'))) ||
      (url.includes('/v/t') && url.includes('cdninstagram'))
    ) {
      if (url.includes('bytestart=') || url.includes('byteend=')) return;
      let cleanUrl = url;

      // Ghi nhận video stream chuẩn xác để dự phòng khi tải Story
      const existing = activeStoryVideos.find(it => it.url === cleanUrl);
      if (existing) {
        existing.time = Date.now();
        existing.pathname = window.location.pathname;
      } else {
        activeStoryVideos.push({
          url: cleanUrl,
          time: Date.now(),
          pathname: window.location.pathname
        });
        if (activeStoryVideos.length > 50) activeStoryVideos.shift();
      }

      if (!capturedVideoUrls.includes(cleanUrl)) {
        // Ưu tiên đưa luồng xpv_progressive có cả hình lẫn tiếng lên đầu
        if (cleanUrl.includes('xpv_progressive') || cleanUrl.includes('progressive')) {
          capturedVideoUrls.unshift(cleanUrl);
        } else {
          capturedVideoUrls.push(cleanUrl);
        }
        if (capturedVideoUrls.length > 30) capturedVideoUrls.pop();
      }
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function shortcodeToMediaId(shortcode) {
    if (!shortcode || typeof shortcode !== 'string') return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    try {
      let id = BigInt(0);
      for (let i = 0; i < shortcode.length; i++) {
        const char = shortcode[i];
        const val = BigInt(alphabet.indexOf(char));
        if (val === BigInt(-1)) return null;
        id = id * BigInt(64) + val;
      }
      return id.toString();
    } catch (_) {
      return null;
    }
  }

  let lastSyncTrackCount = 0;
  function syncCacheToDOM() {
    try {
      if (discoveredTracks.size === lastSyncTrackCount) return;
      lastSyncTrackCount = discoveredTracks.size;
      let cacheEl = document.getElementById('__ig_music_cache__');
      if (!cacheEl) {
        cacheEl = document.createElement('script');
        cacheEl.id = '__ig_music_cache__';
        cacheEl.type = 'application/json';
        (document.head || document.documentElement).appendChild(cacheEl);
      }
      cacheEl.textContent = JSON.stringify(Array.from(discoveredTracks.values()));
    } catch (_) {}
  }

  function parseAudioNode(asset, consumption, currentCode, currentId) {
    if (!asset || typeof asset !== 'object') return null;

    const audioUrl = asset.progressive_download_url || 
                     asset.fast_start_progressive_download_url || 
                     asset.audio_src ||
                     asset.download_url ||
                     asset.playback_url ||
                     asset.audio_url ||
                     asset.uri;

    if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.startsWith('http')) {
      return null;
    }

    let startTimeMs = 0;
    if (consumption?.audio_asset_start_time_in_ms !== undefined) {
      startTimeMs = Number(consumption.audio_asset_start_time_in_ms) || 0;
    } else if (asset.audio_asset_start_time_in_ms !== undefined) {
      startTimeMs = Number(asset.audio_asset_start_time_in_ms) || 0;
    }

    let clipDurationMs = 30000;
    if (consumption?.overlap_duration_in_ms !== undefined) {
      clipDurationMs = Number(consumption.overlap_duration_in_ms) || 30000;
    } else if (asset.duration_in_ms !== undefined) {
      clipDurationMs = Number(asset.duration_in_ms) || 30000;
    }

    const title = asset.title || 
                  asset.song_name || 
                  asset.original_audio_title || 
                  asset.audio_title || 
                  'Instagram Audio';

    let artist = asset.display_artist || 
                 asset.artist_name || 
                 asset.ig_artist?.username || 
                 asset.ig_username || 
                 'Âm thanh bài viết';

    if (asset.ig_artist?.full_name) {
      artist = asset.ig_artist.full_name;
    }

    let code = currentCode;
    if (!code) {
      if (window.location.pathname.includes('/reels') || window.location.pathname.includes('/reel')) {
        return null;
      }
      const urlMatch = window.location.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
      if (urlMatch && !['audio', 'videos', 'reels', 'comments', 'explore', 'stories'].includes(urlMatch[1].toLowerCase())) {
        code = urlMatch[1];
      }
    }

    return {
      code: code || null,
      id: String(currentId || asset.id || asset.audio_asset_id || ''),
      title: title.trim(),
      artist: artist.trim(),
      audioUrl: audioUrl,
      startTimeMs: Math.max(0, startTimeMs),
      clipDurationMs: Math.max(3000, clipDurationMs),
      coverUrl: asset.cover_artwork_uri || asset.cover_artwork_thumbnail_uri || '',
      assetId: String(asset.id || asset.audio_cluster_id || asset.audio_asset_id || '')
    };
  }

  function extractAudioTracks(obj, found = new Map(), inheritedCode = null, inheritedId = null) {
    if (!obj || typeof obj !== 'object') return found;

    // Bỏ qua trích xuất khi đang ở trang Reels (/reels/ hoặc /reel/) để tiết kiệm băng thông
    if (window.location.pathname.includes('/reels') || window.location.pathname.includes('/reel')) {
      return found;
    }

    const currentCode = obj.code || obj.shortcode || inheritedCode;
    const currentId = obj.id || obj.pk || inheritedId;

    if (obj.music_metadata) {
      const mm = obj.music_metadata;
      if (mm.music_info) {
        const track = parseAudioNode(mm.music_info.music_asset_info || mm.music_info, mm.music_info.music_consumption_info, currentCode, currentId);
        if (track) saveTrack(found, track);
      }
      if (mm.original_sound_info) {
        const track = parseAudioNode(mm.original_sound_info, mm.original_sound_info, currentCode, currentId);
        if (track) saveTrack(found, track);
      }
    }

    if (obj.clips_metadata) {
      const cm = obj.clips_metadata;
      if (cm.music_info) {
        const track = parseAudioNode(cm.music_info.music_asset_info || cm.music_info, cm.music_info.music_consumption_info, currentCode, currentId);
        if (track) saveTrack(found, track);
      }
      if (cm.original_sound_info) {
        const track = parseAudioNode(cm.original_sound_info, cm.original_sound_info, currentCode, currentId);
        if (track) saveTrack(found, track);
      }
    }

    if (obj.original_sound_info) {
      const track = parseAudioNode(obj.original_sound_info, obj.original_sound_info, currentCode, currentId);
      if (track) saveTrack(found, track);
    }

    if (obj.music_info) {
      const track = parseAudioNode(obj.music_info.music_asset_info || obj.music_info, obj.music_info.music_consumption_info, currentCode, currentId);
      if (track) saveTrack(found, track);
    }

    if (obj.music_asset_info) {
      const track = parseAudioNode(obj.music_asset_info, obj.music_consumption_info, currentCode, currentId);
      if (track) saveTrack(found, track);
    }

    if (obj.progressive_download_url && typeof obj.progressive_download_url === 'string') {
      const track = parseAudioNode(obj, obj, currentCode, currentId);
      if (track) saveTrack(found, track);
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        extractAudioTracks(obj[i], found, currentCode, currentId);
      }
    } else {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (typeof val === 'object' && val !== null) {
          extractAudioTracks(val, found, currentCode, currentId);
        }
      }
    }

    return found;
  }

  function saveTrack(map, track) {
    const key = track.code ? `code_${track.code}` : (track.id ? `id_${track.id}` : `url_${track.audioUrl.slice(-40)}`);
    if (!map.has(key)) {
      map.set(key, track);
    }
  }

  function dispatchTrack(track) {
    const match = window.location.pathname.match(/\/(?:p|reel|reels)\/([A-Za-z0-9_-]+)/);
    const activePageShortcode = (match && !['audio', 'videos', 'reels', 'comments', 'explore', 'stories'].includes(match[1].toLowerCase())) ? match[1] : null;
    if (!track.code && activePageShortcode) {
      track.code = activePageShortcode;
    }

    const key = `${track.code || ''}_${track.id || ''}_${track.audioUrl}`;
    if (discoveredTracks.has(key)) return;

    if (discoveredTracks.size >= MAX_TRACKS_CACHE) {
      const firstKey = discoveredTracks.keys().next().value;
      discoveredTracks.delete(firstKey);
    }

    discoveredTracks.set(key, track);

    if (track.code) {
      discoveredTracks.set(`code_${track.code}`, track);
    }
    if (activePageShortcode) {
      discoveredTracks.set(`code_${activePageShortcode}`, track);
    }

    syncCacheToDOM();

    window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', {
      detail: track
    }));
  }

  function dispatchNoAudio(shortcode) {
    if (!shortcode) return;
    if (noAudioSet.size >= MAX_NO_AUDIO_CACHE) {
      const first = noAudioSet.values().next().value;
      noAudioSet.delete(first);
    }
    noAudioSet.add(shortcode);
    window.dispatchEvent(new CustomEvent('__IG_AUDIO_NOT_FOUND__', {
      detail: { shortcode }
    }));
  }

  function extractMediaFromPostNode(post) {
    if (!post || typeof post !== 'object') return [];
    const items = [];

    const getBestImgUrl = (candidates) => {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      const sorted = [...candidates].sort((a, b) => (((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0))));
      return sorted[0]?.url || sorted[0]?.src || null;
    };

    const getBestVidUrl = (versions) => {
      if (!Array.isArray(versions) || versions.length === 0) return null;
      const valid = versions.filter(v => {
        const u = v?.url || v?.src;
        if (!u || typeof u !== 'string') return false;
        if (isDashAudioUrl(u)) return false;
        if (u.includes('bytestart=') || u.includes('byteend=')) return false;
        return true;
      });
      if (valid.length === 0) return null;

      const prog = valid.find(v => (v.url || v.src || '').includes('progressive') || v.type === 101);
      if (prog) return prog.url || prog.src;

      const sorted = [...valid].sort((a, b) => (((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0))));
      return sorted[0]?.url || sorted[0]?.src || null;
    };

    // 1. Carousel media (REST items / v1 API)
    if (Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
      for (const item of post.carousel_media) {
        const isVid = item.media_type === 2 || item.is_video === true || Boolean(item.video_versions?.length || item.video_url || item.video_resources?.length);
        if (isVid) {
          const vidUrl = getBestVidUrl(item.video_versions) || getBestVidUrl(item.video_resources) || item.video_url;
          if (vidUrl) {
            items.push({ type: 'video', url: vidUrl });
            continue;
          }
        }
        const imgUrl = getBestImgUrl(item.image_versions2?.candidates) || getBestImgUrl(item.display_resources) || item.display_url;
        if (imgUrl) items.push({ type: 'image', url: imgUrl });
      }
    }
    // 2. Carousel media (GraphQL edge_sidecar_to_children)
    else if (Array.isArray(post.edge_sidecar_to_children?.edges) && post.edge_sidecar_to_children.edges.length > 0) {
      for (const edge of post.edge_sidecar_to_children.edges) {
        const node = edge?.node;
        if (!node) continue;
        const isVid = node.is_video || Boolean(node.video_url || node.video_resources?.length || node.video_versions?.length);
        if (isVid) {
          const vidUrl = getBestVidUrl(node.video_versions) || getBestVidUrl(node.video_resources) || node.video_url;
          if (vidUrl) {
            items.push({ type: 'video', url: vidUrl });
            continue;
          }
        }
        const imgUrl = getBestImgUrl(node.display_resources) || getBestImgUrl(node.image_versions2?.candidates) || node.display_url;
        if (imgUrl) items.push({ type: 'image', url: imgUrl });
      }
    }
    // 3. Bài viết đơn lẻ (Single Post / Reel):
    else {
      const hasVid = post.media_type === 2 || post.is_video === true || post.__typename === 'GraphVideo' || Boolean(post.video_versions?.length || post.video_url || post.video_resources?.length);
      const vidUrl = getBestVidUrl(post.video_versions) || getBestVidUrl(post.video_resources) || post.video_url;
      const isExplicitImageOnly = (post.media_type === 1 || post.is_video === false || post.__typename === 'GraphImage') && !post.product_type?.includes('clips') && !post.product_type?.includes('reel');

      if (hasVid && vidUrl && !isExplicitImageOnly) {
        items.push({ type: 'video', url: vidUrl });
      } else {
        const imgUrl = getBestImgUrl(post.image_versions2?.candidates) || getBestImgUrl(post.display_resources) || post.display_url;
        if (imgUrl) {
          items.push({ type: 'image', url: imgUrl });
        } else if (vidUrl) {
          items.push({ type: 'video', url: vidUrl });
        }
      }
    }

    return items;
  }

  function extractMediaCollections(obj, inheritedCode = null) {
    if (!obj || typeof obj !== 'object') return;
    const code = obj.code || obj.shortcode || inheritedCode;

    if (code && (obj.carousel_media || obj.edge_sidecar_to_children || obj.video_versions || obj.image_versions2 || obj.display_url)) {
      const mediaList = extractMediaFromPostNode(obj);
      if (mediaList.length > 0) {
        const existing = postMediaMap.get(code);
        if (!existing || mediaList.length > existing.length) {
          safeMapSet(postMediaMap, code, mediaList, 60);
        }
      }
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        extractMediaCollections(obj[i], code);
      }
    } else {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (typeof val === 'object' && val !== null) {
          extractMediaCollections(val, code);
        }
      }
    }
  }

  function isValidStoryCandidate(cand) {
    if (!cand || typeof cand !== 'object') return false;
    // Bỏ qua đối tượng user profile (avatar không phải story media)
    if (cand.profile_pic_url && !cand.video_url && !cand.video_versions && !cand.display_url && !cand.image_versions2 && !cand.media_type) {
      return false;
    }
    // Bỏ qua props thẻ DOM không chứa story item
    if (cand.children && !cand.video_url && !cand.video_versions && !cand.display_url && !cand.image_versions2 && !cand.media_type) {
      return false;
    }

    const hasVideo = Boolean(
      cand.media_type === 2 ||
      cand.is_video === true ||
      cand.video_url ||
      (Array.isArray(cand.video_versions) && cand.video_versions.length > 0) ||
      (Array.isArray(cand.video_resources) && cand.video_resources.length > 0) ||
      cand.__typename?.includes('Video')
    );

    const hasImage = Boolean(
      cand.media_type === 1 ||
      cand.is_video === false ||
      cand.display_url ||
      (Array.isArray(cand.image_versions2?.candidates) && cand.image_versions2.candidates.length > 0) ||
      (Array.isArray(cand.display_resources) && cand.display_resources.length > 0) ||
      cand.__typename?.includes('Image')
    );

    return hasVideo || hasImage;
  }

  function extractMediaFromCandidateObj(cand) {
    if (!isValidStoryCandidate(cand)) return null;

    // A. Lấy URL Video (không lọc bỏ phiên bản hợp lệ nếu thiếu width/height)
    let videoUrl = null;
    if (Array.isArray(cand.video_versions) && cand.video_versions.length > 0) {
      const valid = cand.video_versions.filter(v => {
        const u = v && (v.url || v.src);
        return u && typeof u === 'string' && !isDashAudioUrl(u) && !u.includes('bytestart=') && !u.includes('byteend=');
      });
      if (valid.length > 0) {
        const prog = valid.find(v => (v.url || v.src || '').includes('progressive') || v.type === 101);
        const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
        videoUrl = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src) || null;
      }
    } else if (typeof cand.video_url === 'string' && cand.video_url.startsWith('http') && !isDashAudioUrl(cand.video_url) && !cand.video_url.includes('bytestart=')) {
      videoUrl = cand.video_url;
    } else if (Array.isArray(cand.video_resources) && cand.video_resources.length > 0) {
      const valid = cand.video_resources.filter(v => {
        const u = v && (v.src || v.url);
        return u && typeof u === 'string' && !isDashAudioUrl(u) && !u.includes('bytestart=') && !u.includes('byteend=');
      });
      if (valid.length > 0) {
        const sorted = [...valid].sort((a, b) => ((b.config_width || b.width || 0) * (b.config_height || b.height || 0)) - ((a.config_width || a.width || 0) * (a.config_height || a.height || 0)));
        videoUrl = sorted[0]?.src || sorted[0]?.url || null;
      }
    } else if (typeof cand.playbackUrl === 'string' && cand.playbackUrl.startsWith('http') && !isDashAudioUrl(cand.playbackUrl) && !cand.playbackUrl.includes('bytestart=')) {
      videoUrl = cand.playbackUrl;
    }

    // B. Lấy URL Ảnh (lấy ảnh gốc chất lượng cao nhất)
    let imgUrl = null;
    if (Array.isArray(cand.image_versions2?.candidates) && cand.image_versions2.candidates.length > 0) {
      const sorted = [...cand.image_versions2.candidates].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      imgUrl = sorted[0]?.url || sorted[0]?.src || null;
    } else if (Array.isArray(cand.display_resources) && cand.display_resources.length > 0) {
      const sorted = [...cand.display_resources].sort((a, b) => ((b.config_width || 0) * (b.config_height || 0)) - ((a.config_width || 0) * (a.config_height || 0)));
      imgUrl = sorted[0]?.src || sorted[0]?.url || null;
    } else if (typeof cand.display_url === 'string' && cand.display_url.startsWith('http')) {
      imgUrl = cand.display_url;
    }

    if (!videoUrl && !imgUrl) return null;

    // C. Nhận diện chuẩn xác Video hay Ảnh:
    // 1. Phân loại Photo with Music (Ảnh kèm nhạc):
    //    Instagram chỉ gán original_media_type === 1 khi người dùng đăng ẢNH rồi gắn sticker nhạc (Instagram tạo video wrapper 1-fps).
    //    Nếu là Video thật (kể cả có nhạc nền), original_media_type là 2 hoặc undefined, tuyệt đối KHÔNG PHẢI là 1!
    const isPhotoWithMusic = Boolean(cand.original_media_type === 1 && imgUrl && videoUrl);

    // 2. Phân loại Video:
    //    Có videoUrl hợp lệ và không phải là photo with music
    const isVideo = Boolean(videoUrl) && !isPhotoWithMusic && (
      cand.media_type === 2 ||
      cand.is_video === true ||
      cand.original_media_type === 2 ||
      Boolean(cand.__typename?.includes('Video')) ||
      (Array.isArray(cand.video_versions) && cand.video_versions.length > 0)
    );

    const hasMusicSticker = Boolean(
      (Array.isArray(cand.story_music_stickers) && cand.story_music_stickers.length > 0) ||
      (Array.isArray(cand.story_bloks_stickers) && cand.story_bloks_stickers.length > 0) ||
      cand.music_metadata ||
      cand.music_info ||
      cand.clips_metadata
    );

    const rawId = String(cand.id || cand.pk || '');
    const id = rawId.split('_')[0];
    const code = String(cand.code || cand.shortcode || '');
    const user = (cand.user?.username || cand.owner?.username || '').toLowerCase();

    const mediaType = isVideo ? 'video' : (isPhotoWithMusic ? 'photo_music' : 'image');
    const mainUrl = (isVideo || isPhotoWithMusic) ? videoUrl : imgUrl;

    return {
      type: mediaType,
      url: mainUrl,
      id,
      rawId,
      code,
      user,
      videoUrl,
      imageUrl: imgUrl,
      isPhotoWithMusic,
      hasMusic: hasMusicSticker || Boolean(cand.has_audio)
    };
  }

  function findVideoUrlInObject(obj, depth = 0, visited = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 20 || visited.has(obj)) return null;
    visited.add(obj);

    if (typeof obj === 'string') {
      if (isValidVideoMp4Url(obj)) {
        return obj;
      }
      return null;
    }
    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      const valid = obj.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && isValidVideoMp4Url(v.url || v.src));
      if (valid.length > 0) {
        const prog = valid.find(v => (v.url || v.src || '').includes('progressive') || v.type === 101);
        const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
        const best = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src);
        if (best && isValidVideoMp4Url(best)) return best;
      }
    }
    const directProps = [obj.video_url, obj.playbackUrl, obj.videoUrl, obj.src, obj.url];
    for (const p of directProps) {
      if (typeof p === 'string' && isValidVideoMp4Url(p)) {
        return p;
      }
    }
    if (Array.isArray(obj.sources)) {
      for (const s of obj.sources) {
        const u = s?.src || s?.url;
        if (typeof u === 'string' && isValidVideoMp4Url(u)) {
          return u;
        }
      }
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const found = findVideoUrlInObject(obj[i], depth + 1, visited);
        if (found) return found;
      }
    } else {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === 'user' || k === 'owner' || k === 'profile_pic_url' || k === 'header' || k === 'avatar') continue;
        if (/audio|music|sound|track/i.test(k)) continue;
        if (typeof obj[k] === 'object' && obj[k] !== null) {
          const found = findVideoUrlInObject(obj[k], depth + 1, visited);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function extractStoryItems(obj, visited = new Set(), depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 15 || visited.has(obj)) return;
    visited.add(obj);

    // 1. NHẬN DIỆN REEL CONTAINER (Highlights Album hoặc Story 24h của 1 User chứa mảng các slide items)
    let itemsArr = null;
    if (Array.isArray(obj.items) && obj.items.length > 0) {
      itemsArr = obj.items;
    } else if (Array.isArray(obj.nodes) && obj.nodes.length > 0) {
      itemsArr = obj.nodes;
    } else if (Array.isArray(obj.edges) && obj.edges.length > 0) {
      itemsArr = obj.edges.map(e => e?.node || e).filter(Boolean);
    }

    if (itemsArr && itemsArr.length > 0 && (obj.id || obj.pk)) {
      const rawReelId = String(obj.id || obj.pk || '');
      const cleanReelId = rawReelId.replace(/^highlight:/, '');

      // Phân biệt nghiêm ngặt: Phải là Reel (Highlight hoặc Story), TUYỆT ĐỐI KHÔNG phải là Feed / Post container
      const isFeedOrPostContainer = Boolean(
        obj.edge_owner_to_timeline_media ||
        obj.edge_web_feed_timeline ||
        obj.feed_items ||
        obj.product_type === 'feed' ||
        obj.product_type === 'clips' ||
        obj.product_type === 'carousel_container'
      );

      const isHighlight = rawReelId.startsWith('highlight:') ||
        obj.__typename === 'GraphHighlightReel' ||
        obj.reel_type === 'highlight_reel';

      const isUserStory = obj.__typename === 'GraphReel' ||
        obj.reel_type === 'user_reel' ||
        (obj.latest_reel_media !== undefined && obj.expiring_at !== undefined) ||
        obj.is_reel_media === true;

      if (!isFeedOrPostContainer && (isHighlight || isUserStory)) {
        let user = (obj.user?.username || obj.owner?.username || obj.username || '').toLowerCase();
        if (!user && itemsArr.length > 0) {
          for (const it of itemsArr) {
            const u = it.user?.username || it.owner?.username;
            if (u) {
              user = String(u).toLowerCase();
              break;
            }
          }
        }

        const parsedItems = [];
        for (let idx = 0; idx < itemsArr.length; idx++) {
          const it = itemsArr[idx];
          if (!it || typeof it !== 'object') continue;
          if (it.is_ad || it.is_sponsored || it.sponsored_info) continue;

          const entry = extractMediaFromCandidateObj(it);
          if (entry) {
            entry.index = idx;
            if (!entry.user) entry.user = user;
            parsedItems.push(entry);
            if (entry.id) safeMapSet(storyMediaMap, entry.id, entry, 60);
            if (entry.rawId) safeMapSet(storyMediaMap, entry.rawId, entry, 60);
            if (entry.code) safeMapSet(storyMediaMap, entry.code, entry, 60);
          }
        }

        if (parsedItems.length > 0) {
          if (isHighlight) {
            if (cleanReelId) safeMapSet(reelMediaMap, cleanReelId, parsedItems, 60);
            if (rawReelId) safeMapSet(reelMediaMap, rawReelId, parsedItems, 60);
          } else if (isUserStory) {
            if (user) safeMapSet(reelMediaMap, user, parsedItems, 60);
            if (cleanReelId) safeMapSet(reelMediaMap, cleanReelId, parsedItems, 60);
          }
        }
      }
    }

    // 2. NHẬN DIỆN STORY ITEM ĐƠN LẺ
    const single = extractMediaFromCandidateObj(obj);
    if (single && single.id) {
      if (single.id) safeMapSet(storyMediaMap, single.id, single, 60);
      if (single.rawId) safeMapSet(storyMediaMap, single.rawId, single, 60);
      if (single.code) safeMapSet(storyMediaMap, single.code, single, 60);
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) extractStoryItems(obj[i], visited, depth + 1);
    } else {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        if (typeof obj[keys[i]] === 'object' && obj[keys[i]] !== null) {
          extractStoryItems(obj[keys[i]], visited, depth + 1);
        }
      }
    }
  }

  function extractHighlightsFromPayload(obj, targetUser = null, visited = new WeakSet(), depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 12) return;
    if (visited.has(obj)) return;
    visited.add(obj);

    const ownerUser = (
      targetUser ||
      obj.data?.user?.username ||
      obj.user?.username ||
      obj.owner?.username ||
      obj.username ||
      ''
    ).toLowerCase().trim();

    function recordHighlight(id, title) {
      if (!id) return;
      const clean = String(id).replace(/^highlight:/, '').trim();
      if (!clean) return;
      safeMapSet(cachedHighlights, clean, {
        id: clean,
        title: sanitizePathTitle(title || 'Highlight'),
        user: ownerUser
      }, 60);
    }

    if (obj.edge_highlight_reels && Array.isArray(obj.edge_highlight_reels.edges)) {
      for (const edge of obj.edge_highlight_reels.edges) {
        const node = edge?.node;
        if (node && (node.id || node.pk)) {
          recordHighlight(node.id || node.pk, node.title);
        }
      }
    }

    const tray = obj.highlight_reels || obj.highlights || obj.highlight_tray || obj.reels_tray;
    if (Array.isArray(tray)) {
      for (const t of tray) {
        if (t && (t.id || t.pk)) {
          recordHighlight(t.id || t.pk, t.title);
        }
      }
    }

    if ((obj.__typename === 'GraphHighlightReel' || String(obj.id || '').startsWith('highlight:')) && (obj.id || obj.pk)) {
      recordHighlight(obj.id || obj.pk, obj.title);
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) extractHighlightsFromPayload(obj[i], ownerUser, visited, depth + 1);
    } else {
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        const val = obj[keys[i]];
        if (val && typeof val === 'object') {
          extractHighlightsFromPayload(val, ownerUser, visited, depth + 1);
        }
      }
    }
  }

  function extractUserProfileInfo(json) {
    if (!json || typeof json !== 'object') return;
    try {
      let user = null;
      if (json.data && json.data.user) {
        user = json.data.user;
      } else if (json.graphql && json.graphql.user) {
        user = json.graphql.user;
      } else if (json.user && (json.user.pk || json.user.id)) {
        user = json.user;
      }

      if (user && (user.id || user.pk) && user.username) {
        const profileData = {
          id: String(user.id || user.pk),
          username: user.username,
          fullName: user.full_name || '',
          biography: user.biography || '',
          externalUrl: user.external_url || '',
          bioLinks: user.bio_links || [],
          isPrivate: Boolean(user.is_private),
          isVerified: Boolean(user.is_verified),
          profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || '',
          followersCount: user.edge_followed_by?.count ?? user.follower_count ?? 0,
          followingCount: user.edge_follow?.count ?? user.following_count ?? 0,
          postsCount: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
          followedByViewer: Boolean(user.followed_by_viewer),
          followsViewer: Boolean(user.follows_viewer)
        };
        window.__igt_last_profile_info__ = profileData;
        window.dispatchEvent(new CustomEvent('__IGT_PROFILE_INFO__', { detail: profileData }));
      }
    } catch (_) {}
  }

  // ÉP TẢI LUỒNG PHÂN GIẢI CAO NHẤT (1080p) TRỰC TIẾP TỪ MÁY CHỦ META
  function forceHighestResolutionVideoVersions(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 10) return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) forceHighestResolutionVideoVersions(obj[i], depth + 1);
      return;
    }
    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 1) {
      let best = obj.video_versions[0];
      let bestArea = (best.width || 0) * (best.height || 0);
      for (let i = 1; i < obj.video_versions.length; i++) {
        const v = obj.video_versions[i];
        const area = (v.width || 0) * (v.height || 0);
        if (area > bestArea) {
          bestArea = area;
          best = v;
        }
      }
      // Giữ lại duy nhất bản phân giải cao nhất để Instagram không thể hạ xuống bản mờ
      obj.video_versions = [best];
    }
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const val = obj[keys[i]];
      if (val && typeof val === 'object') {
        forceHighestResolutionVideoVersions(val, depth + 1);
      }
    }
  }

  function processPayload(json, fallbackCode = null) {
    if (!json) return;
    try {
      if (!window.location.pathname.includes('/reels') && !window.location.pathname.includes('/reel')) {
        const found = extractAudioTracks(json, new Map(), fallbackCode);
        for (const track of found.values()) {
          dispatchTrack(track);
        }
      }
      extractMediaCollections(json, fallbackCode);
      extractStoryItems(json);
      extractHighlightsFromPayload(json);
      extractUserProfileInfo(json);
      extractDirectMessagesFromPayload(json);
      if (igtV3Settings.videoSharpness) {
        forceHighestResolutionVideoVersions(json);
      }
    } catch (_) {}
  }

  // --- INSTATWEAKS v3.5: PHÂN TÍCH & BẮT TRỌN TIN NHẮN DIRECT (ANTI-UNSEND & VIEW ONCE) ---
  const IGT_SESSION_START_TIME = Date.now();
  const fiberInitialThreadScanned = new Set();
  function extractDirectMessagesFromPayload(json) {
    if (!json || typeof json !== 'object') return;
    try {
      const parsedItems = [];
      const visited = new WeakSet();

      function parseSingleDmItem(item, threadId = '') {
        const id = String(item.item_id || item.id || item.message_id || item.mid || '');
        if (!id) return null;
        const userId = String(item.user_id || item.sender_id || item.sender_fbid || item.author_id || '');
        const timestamp = item.timestamp ? Number(String(item.timestamp).substring(0, 13)) : (item.timestamp_ms ? Number(item.timestamp_ms) : Date.now());
        const itemType = item.item_type || item.content_type || (item.text || item.text_body ? 'text' : (item.visual_media ? 'visual_media' : 'media'));

        let text = item.text || item.text_body || item.igd_snippet || item.snippet || item.message || '';
        let mediaUrl = '';
        let mediaType = '';
        let isVisual = false;
        let viewMode = '';

        // 1. Visual Media (Xem 1 lần / tự hủy)
        if (item.visual_media || item.raven_media || itemType === 'visual_media' || itemType === 'raven_media') {
          isVisual = true;
          const vm = item.visual_media || item.raven_media || {};
          viewMode = vm.view_mode || 'once';
          const media = vm.media || {};
          if (media.video_versions && media.video_versions.length > 0) {
            mediaUrl = media.video_versions[0].url || '';
            mediaType = 'video';
          } else if (media.image_versions2?.candidates?.length > 0) {
            mediaUrl = media.image_versions2.candidates[0].url || '';
            mediaType = 'image';
          } else if (vm.url) {
            mediaUrl = vm.url;
            mediaType = 'image';
          }
        }
        // 2. Regular Media (Ảnh / Video thường)
        else if (item.media || itemType === 'media') {
          const m = item.media || {};
          if (m.video_versions && m.video_versions.length > 0) {
            mediaUrl = m.video_versions[0].url || '';
            mediaType = 'video';
          } else if (m.image_versions2?.candidates?.length > 0) {
            mediaUrl = m.image_versions2.candidates[0].url || '';
            mediaType = 'image';
          }
        }
        // 3. Voice Media (Ghi âm giọng nói)
        else if (item.voice_media) {
          mediaUrl = item.voice_media?.media?.audio?.audio_src || '';
          mediaType = 'audio';
        }
        // 4. Animated Media (GIF)
        else if (item.animated_media) {
          mediaUrl = item.animated_media?.images?.fixed_height?.url || '';
          mediaType = 'gif';
        }
        // 5. Clip / Shared Reel
        else if (item.clip) {
          mediaUrl = item.clip?.clip?.video_versions?.[0]?.url || '';
          mediaType = 'video';
        }

        // LỌC TRIỆT ĐỂ: Nếu mediaUrl là ảnh đại diện (avatar) thì HỦY BỎ mediaUrl ngay lập tức!
        if (typeof isInstagramAvatarUrl === 'function' && isInstagramAvatarUrl(mediaUrl)) {
          mediaUrl = '';
          mediaType = '';
        }

        const isUnsent = item.item_type === 'placeholder' ||
                         item.content_type === 'PLACEHOLDER' ||
                         item.__typename === 'SlideMessagePlaceholder' ||
                         item.is_placeholder ||
                         item.tombstone ||
                         item.is_unsent ||
                         Boolean(item.placeholder && item.placeholder.is_placeholder) ||
                         false;

        // CHỈ PHÁT SỰ KIỆN THU HỒI NẾU XẢY RA TRONG PHIÊN LÀM VIỆC HIỆN TẠI (BỎ QUA CÁC PLACEHOLDER CŨ TỪ LỊCH SỬ)
        if (isUnsent && id && timestamp >= (IGT_SESSION_START_TIME - 30000)) {
          window.dispatchEvent(new CustomEvent('__IGT_DM_UNSEND_EVENT__', {
            detail: { id, threadId: String(threadId || item.thread_id || item.thread_fbid || ''), timestamp }
          }));
        }

        return {
          id,
          threadId: String(threadId || item.thread_id || item.thread_fbid || ''),
          userId,
          timestamp,
          itemType,
          text,
          mediaUrl,
          mediaType,
          isVisual,
          viewMode,
          isUnsent
        };
      }

      function walkForMessages(obj, depth = 0, currentThreadId = '') {
        if (!obj || typeof obj !== 'object' || depth > 10) return;
        if (visited.has(obj)) return;
        visited.add(obj);

        let tid = currentThreadId;
        if (obj.thread_id || obj.thread_v2_id || obj.threadId || obj.thread_fbid) {
          tid = String(obj.thread_id || obj.thread_v2_id || obj.threadId || obj.thread_fbid);
        }

        // Bắt sự kiện thu hồi (unsend / delete event)
        if (obj.deleted_item_id || obj.deleted_message_ids || obj.deleted_item_ids || (obj.action === 'delete' && obj.item_id) || (obj.action === 'item_delete' && obj.item_id) || (obj.type === 'item_deleted' && obj.item_id) || obj.__typename === 'SlideMessagePlaceholder' || obj.tombstone) {
          const delId = String(obj.deleted_item_id || obj.deleted_message_ids || obj.deleted_item_ids || obj.item_id || obj.id || '');
          if (delId) {
            window.dispatchEvent(new CustomEvent('__IGT_DM_UNSEND_EVENT__', {
              detail: { id: delId, threadId: tid, timestamp: Date.now() }
            }));
          }
        }

        if (obj.item_id || obj.id || obj.mid || obj.message_id) {
          if (obj.text !== undefined || obj.text_body || obj.igd_snippet || obj.item_type || obj.content_type || obj.visual_media || obj.media) {
            const item = parseSingleDmItem(obj, tid);
            if (item) parsedItems.push(item);
          }
        }

        if (Array.isArray(obj)) {
          for (let i = 0; i < obj.length; i++) {
            walkForMessages(obj[i], depth + 1, tid);
          }
        } else {
          const keys = Object.keys(obj);
          for (let i = 0; i < keys.length; i++) {
            const val = obj[keys[i]];
            if (val && typeof val === 'object') {
              walkForMessages(val, depth + 1, tid);
            }
          }
        }
      }

      walkForMessages(json);

      if (parsedItems.length > 0) {
        const primaryThreadId = parsedItems.find(p => p.threadId)?.threadId || '';
        window.dispatchEvent(new CustomEvent('__IGT_DM_ITEMS_STORE__', {
          detail: {
            items: parsedItems,
            threadId: primaryThreadId,
            activeIds: parsedItems.map(p => p.id)
          }
        }));
      }
    } catch (_) {}
  }

  
  // --- INSTATWEAKS v3.5 (CÁCH B): REACT FIBER DIRECT MESSAGE GUARDIAN ---
  // Trích xuất tin nhắn trực tiếp từ RAM nội bộ của React (memoizedProps)
  const trackedFiberMessageIdsByThread = new Map(); // threadId -> Set(itemId)
  const fiberMessageCache = new Map(); // itemId -> msgObj

  function inspectReactFiberDirectMessages() {
    try {
      const messageNodes = document.querySelectorAll('[aria-roledescription="message"], [roledescription="message"]');
      if (messageNodes.length === 0) return;

      const pathMatch = window.location.pathname.match(/\/direct\/t\/([^\/]+)/);
      const currentThreadId = pathMatch ? pathMatch[1] : 'current_chat';

      if (!trackedFiberMessageIdsByThread.has(currentThreadId)) {
        trackedFiberMessageIdsByThread.set(currentThreadId, new Set());
      }
      const knownIds = trackedFiberMessageIdsByThread.get(currentThreadId);
      const currentSeenIds = new Set();
      const parsedItems = [];

      messageNodes.forEach(node => {
        const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) return;

        let fiber = node[fiberKey];
        let depth = 0;
        let foundCandidate = null;

        while (fiber && depth < 12) {
          const p = fiber.memoizedProps;
          if (p) {
            // Các thuộc tính component chứa dữ liệu tin nhắn trong React của Instagram
            const cand = p.message || p.item || p.entry || (p.item_id ? p : null);
            if (cand && (cand.item_id || cand.id)) {
              foundCandidate = cand;
              break;
            }
          }
          fiber = fiber.return;
          depth++;
        }

        if (foundCandidate) {
          const parsed = parseSingleDmItem(foundCandidate, foundCandidate.thread_id || currentThreadId);
          if (parsed && parsed.id) {
            currentSeenIds.add(parsed.id);
            knownIds.add(parsed.id);
            fiberMessageCache.set(parsed.id, parsed);

            // Đóng dấu ID thật của Meta lên thẻ DOM để v3_core.js nhận diện 100% chuẩn xác
            node.setAttribute('data-igt-real-id', parsed.id);
            const group = node.closest('div[role="group"]');
            if (group) group.setAttribute('data-igt-real-id', parsed.id);

            parsedItems.push(parsed);
          }
        }
      });

      if (parsedItems.length > 0) {
        window.dispatchEvent(new CustomEvent('__IGT_DM_ITEMS_STORE__', {
          detail: {
            items: parsedItems,
            threadId: currentThreadId,
            activeIds: Array.from(currentSeenIds)
          }
        }));
      }

      // PHÁT HIỆN THU HỒI TỪ REACT FIBER:
      // Tuyệt đối không kiểm tra !currentSeenIds.has(id) vì React ảo hóa (virtualization) khi cuộn sẽ unmount phần tử
      // Chỉ phát hiện thu hồi khi Fiber node chuyển trạng thái thành placeholder
    } catch (_) {}
  }

  // Chạy quét Fiber định kỳ mỗi 400ms khi đang ở trong Direct Chat
  setInterval(() => {
    if (igtV3Settings.ghostViewOnce) {
      inspectReactFiberDirectMessages();
    }
  }, 400);

  function parseMetaResponseText(text, fallbackCode = null) {
    if (!text || typeof text !== 'string' || text.length > 2500000) return;
    let cleaned = text.trim();

    if (cleaned.startsWith('for (;;);')) {
      cleaned = cleaned.substring(9).trim();
    }
    if (cleaned.startsWith('/*')) {
      cleaned = cleaned.replace(/^\/\*[\s\S]*?\*\//, '').trim();
    }

    try {
      processPayload(JSON.parse(cleaned), fallbackCode);
      return;
    } catch (_) {}

    try {
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace && (lastBrace - firstBrace) < 1500000) {
        processPayload(JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)), fallbackCode);
        return;
      }
    } catch (_) {}

    // Chỉ tách dòng khi chuỗi nhỏ < 200KB và duyệt tối đa 30 dòng để bảo vệ RAM và CPU tuyệt đối
    if (cleaned.length < 200000 && cleaned.includes('\n')) {
      const lines = cleaned.split('\n');
      const maxLines = Math.min(lines.length, 30);
      for (let i = 0; i < maxLines; i++) {
        const line = lines[i].trim();
        if ((line.startsWith('{') && line.endsWith('}')) || (line.startsWith('[') && line.endsWith(']'))) {
          try {
            processPayload(JSON.parse(line), fallbackCode);
          } catch (_) {}
        }
      }
    }
  }

  function isRelevantApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // BỎ QUA NGAY LẬP TỨC: tất cả domain CDN đa phương tiện (ảnh, video stream, audio stream)
    // TUYỆT ĐỐI KHÔNG clone hay decode binary stream vào RAM, giải phóng triệt để RAM trình duyệt!
    if (url.includes('cdninstagram') || url.includes('fbcdn') || url.includes('.cdn.') || url.includes('fna.')) return false;
    if (url.includes('/ajax/bz') || url.includes('/logging/') || url.includes('metrics') || url.includes('/browser_push/') || url.includes('/realtime') || url.includes('/live/') || url.includes('/stream')) return false;
    if (/\.(mp4|m4v|m4a|webm|mp3|ogg|wav|jpg|jpeg|png|webp|gif|svg|woff2?|css|ico)(\?|$)/i.test(url)) return false;

    // CHỈ CHẤP NHẬN các API endpoint thực sự trả về dữ liệu bài viết / media JSON:
    if (url.includes('/graphql') || url.includes('/api/v1/') || url.includes('/api/v2/') || url.includes('/api/') || url.includes('/sync/')) return true;
    return false;
  }

  // --- 1. Hook window.fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      let url = '';
      let bodyData = null;

      if (typeof args[0] === 'string') {
        url = args[0];
        bodyData = args[1]?.body;
      } else if (args[0] && typeof args[0] === 'object') {
        url = args[0].url || '';
        bodyData = args[1]?.body || args[0].body;
      }

      const bodyStr = safeExtractBodyString(bodyData);
      
      // Trích xuất Friendly Name từ Headers nếu có
      let friendlyName = '';
      try {
        const hdrs = args[1]?.headers;
        if (hdrs) {
          if (typeof hdrs.get === 'function') {
            friendlyName = hdrs.get('x-fb-friendly-name') || hdrs.get('X-FB-Friendly-Name') || '';
          } else if (typeof hdrs === 'object') {
            friendlyName = hdrs['x-fb-friendly-name'] || hdrs['X-FB-Friendly-Name'] || '';
          }
        }
      } catch (_) {}

      // PHÁT HIỆN HÀNH ĐỘNG GỬI TIN NHẮN (TRẢ LỜI DM) -> TỰ ĐỘNG BẬT GỬI BÁO ĐÃ XEM CHO SERVER
      if (
        friendlyName.includes('SendMessage') ||
        friendlyName.includes('DirectSendMessage') ||
        url.includes('/broadcast/') ||
        (bodyStr && (bodyStr.includes('SendMessage') || bodyStr.includes('send_item')))
      ) {
        lastSentMessageTime = Date.now();
        console.log('[InstaTweaks 3.0] Ghost DM: Phát hiện bạn vừa gửi tin nhắn -> Kích hoạt chế độ gửi đã xem hợp lệ!');
      }

      // INSTATWEAKS v3.0: CHẶN GHOST STORY (XEM STORY ẨN DANH)
      if (isGhostStoryRequest(url, bodyStr, friendlyName)) {
        console.log('[InstaTweaks 3.0] Ghost Story: Blocked fetch seen beacon ->', url, friendlyName);
        return new Response(JSON.stringify({
          data: { stories_reel_seen: { status: 'ok' } },
          status: 'ok',
          live_views_disabled: false
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // INSTATWEAKS v3.0: CHẶN GHOST DM (ĐỌC TIN NHẮN ẨN DANH)
      if (isGhostDMRequest(url, bodyStr, friendlyName)) {
        console.log('[InstaTweaks 3.0] Ghost DM: Blocked fetch seen beacon ->', url, friendlyName);
        return new Response(JSON.stringify({
          data: { direct_thread_seen: { status: 'ok' } },
          status: 'ok'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      // INSTATWEAKS v3.5: CHẶN GHOST VIEW ONCE (MỞ ẢNH/VIDEO TỰ HỦY KHÔNG BÁO SEEN)
      if (isGhostViewOnceRequest(url, bodyStr, friendlyName)) {
        console.log('[InstaTweaks 3.5] Ghost View Once: Blocked visual media seen beacon ->', url, friendlyName);
        return new Response(JSON.stringify({
          data: { visual_item_seen: { status: 'ok' } },
          status: 'ok'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      recordVideoUrl(url);
      if (url.includes('/graphql/query') || url.includes('/api/graphql')) {
        if (bodyStr.includes('doc_id=')) {
          const match = bodyStr.match(/doc_id=([0-9]+)/);
          if (match) {
            if (bodyStr.includes('shortcode') || bodyStr.includes('PolarisPost')) {
              lastKnownPostDocId = match[1];
              localStorage.setItem('__ig_post_doc_id__', lastKnownPostDocId);
            }
            if (bodyStr.includes('PolarisProfile') || bodyStr.includes('edge_owner_to_timeline_media')) {
              lastKnownProfileDocId = match[1];
              localStorage.setItem('__ig_profile_doc_id__', lastKnownProfileDocId);
            }
            if (bodyStr.includes('PolarisStories') || bodyStr.includes('reel_ids') || bodyStr.includes('highlight_reel_ids')) {
              lastKnownStoryDocId = match[1];
              localStorage.setItem('__ig_story_doc_id__', lastKnownStoryDocId);
            }
          }
        }
      }
    } catch (_) {}

    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (isRelevantApiUrl(url)) {
        const ct = (response.headers?.get('content-type') || '').toLowerCase();
        if (ct.includes('event-stream')) {
          return response; // KHÔNG clone SSE/persistent streams
        }
        if (ct.includes('json') || ct.includes('javascript') || ct.includes('text/plain')) {
          response.clone().text().then(text => {
            if (text && text.length > 0 && text.length < 3000000) {
              parseMetaResponseText(text);
            }
          }).catch(() => {});
        }
      }
    } catch (_) {}
    return response;
  };

  // --- 2. Hook XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    if (typeof header === 'string' && header.toLowerCase() === 'x-fb-friendly-name') {
      this._friendlyName = String(value);
    }
    return originalSetRequestHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._ig_url = typeof url === 'string' ? url : '';
    recordVideoUrl(this._ig_url);
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const bodyStr = safeExtractBodyString(args[0]);

    // PHÁT HIỆN HÀNH ĐỘNG GỬI TIN NHẮN (TRẢ LỜI DM) QUA XHR
    if (
      (this._friendlyName && (this._friendlyName.includes('SendMessage') || this._friendlyName.includes('DirectSendMessage'))) ||
      this._ig_url.includes('/broadcast/') ||
      (bodyStr && (bodyStr.includes('SendMessage') || bodyStr.includes('send_item')))
    ) {
      lastSentMessageTime = Date.now();
      console.log('[InstaTweaks 3.0] Ghost DM: Phát hiện bạn vừa gửi tin nhắn qua XHR -> Kích hoạt chế độ gửi đã xem hợp lệ!');
    }

    // INSTATWEAKS v3.0: CHẶN GHOST STORY VỚI XHR
    if (isGhostStoryRequest(this._ig_url, bodyStr, this._friendlyName)) {
      console.log('[InstaTweaks 3.0] Ghost Story: Blocked XHR seen ->', this._ig_url, this._friendlyName);
      try {
        Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(this, 'status', { value: 200, configurable: true });
        Object.defineProperty(this, 'statusText', { value: 'OK', configurable: true });
        Object.defineProperty(this, 'responseText', {
          value: '{"data":{"stories_reel_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        Object.defineProperty(this, 'response', {
          value: '{"data":{"stories_reel_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
          if (typeof this.onload === 'function') this.onload();
        }, 10);
      } catch (_) {}
      return;
    }

    // INSTATWEAKS v3.0: CHẶN GHOST DM VỚI XHR
    if (isGhostDMRequest(this._ig_url, bodyStr, this._friendlyName)) {
      console.log('[InstaTweaks 3.0] Ghost DM: Blocked XHR seen ->', this._ig_url, this._friendlyName);
      try {
        Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(this, 'status', { value: 200, configurable: true });
        Object.defineProperty(this, 'statusText', { value: 'OK', configurable: true });
        Object.defineProperty(this, 'responseText', {
          value: '{"data":{"direct_thread_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        Object.defineProperty(this, 'response', {
          value: '{"data":{"direct_thread_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
          if (typeof this.onload === 'function') this.onload();
        }, 10);
      } catch (_) {}
      return;
    }

    // INSTATWEAKS v3.5: CHẶN GHOST VIEW ONCE VỚI XHR
    if (isGhostViewOnceRequest(this._ig_url, bodyStr, this._friendlyName)) {
      console.log('[InstaTweaks 3.5] Ghost View Once: Blocked XHR seen ->', this._ig_url);
      try {
        Object.defineProperty(this, 'readyState', { value: 4, configurable: true });
        Object.defineProperty(this, 'status', { value: 200, configurable: true });
        Object.defineProperty(this, 'statusText', { value: 'OK', configurable: true });
        Object.defineProperty(this, 'responseText', {
          value: '{"data":{"visual_item_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        Object.defineProperty(this, 'response', {
          value: '{"data":{"visual_item_seen":{"status":"ok"}},"status":"ok"}',
          configurable: true
        });
        setTimeout(() => {
          if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
          if (typeof this.onload === 'function') this.onload();
        }, 10);
      } catch (_) {}
      return;
    }

    try {
      if (bodyStr.includes('doc_id=')) {
        const match = bodyStr.match(/doc_id=([0-9]+)/);
        if (match) {
          if (bodyStr.includes('shortcode') || bodyStr.includes('PolarisPost')) {
            lastKnownPostDocId = match[1];
            localStorage.setItem('__ig_post_doc_id__', lastKnownPostDocId);
          }
          if (bodyStr.includes('PolarisProfile') || bodyStr.includes('edge_owner_to_timeline_media')) {
            lastKnownProfileDocId = match[1];
            localStorage.setItem('__ig_profile_doc_id__', lastKnownProfileDocId);
          }
          if (bodyStr.includes('PolarisStories') || bodyStr.includes('reel_ids') || bodyStr.includes('highlight_reel_ids')) {
            lastKnownStoryDocId = match[1];
            localStorage.setItem('__ig_story_doc_id__', lastKnownStoryDocId);
          }
        }
      }
    } catch (_) {}

    if (isRelevantApiUrl(this._ig_url)) {
      this.addEventListener('load', function () {
        try {
          if (this.responseText && this.responseText.length < 2000000) {
            parseMetaResponseText(this.responseText);
          }
        } catch (_) {}
      });
    }
    return originalSend.apply(this, args);
  };

  // --- 3. Hook SPA Navigation (Chỉ kích hoạt khi THỰC SỰ đổi trang, bỏ qua khi lướt ảnh carousel ?img_index) ---
  let lastDispatchedPathname = window.location.pathname;

  function notifyNavigationIfPathChanged() {
    const currentPath = window.location.pathname;
    // Nếu pathname không đổi (chỉ đổi query param như ?img_index=2 khi bấm next/prev ảnh)
    // -> BỎ QUA HOÀN TOÀN, để hiệu ứng chuyển ảnh của Instagram mượt mà 60 FPS tuyệt đối!
    if (currentPath === lastDispatchedPathname) return;
    lastDispatchedPathname = currentPath;

    // Dọn dẹp cache stream video nếu rời khỏi Stories
    if (!currentPath.includes('/stories/')) {
      activeStoryVideos.length = 0;
    }

    window.dispatchEvent(new CustomEvent('__IG_NAVIGATED__'));
    setTimeout(checkCurrentUrlPost, 80);
    setTimeout(checkCurrentStoryUrl, 100);
  }

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const res = originalPushState.apply(this, args);
    notifyNavigationIfPathChanged();
    return res;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = originalReplaceState.apply(this, args);
    notifyNavigationIfPathChanged();
    return res;
  };

  window.addEventListener('popstate', () => {
    notifyNavigationIfPathChanged();
  });

  // --- 4. Quét thẻ Script SSR (Cache WeakSet tránh quét trùng lặp gây khựng CPU) ---
  const scannedScriptTags = new WeakSet();
  function scanScriptTags() {
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs]');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        if (scannedScriptTags.has(script)) continue;
        scannedScriptTags.add(script);

        const text = script.textContent || '';
        if (
          text.includes('music') ||
          text.includes('audio') ||
          text.includes('sound') ||
          text.includes('progressive_download_url') ||
          text.includes('PolarisStoriesV3') ||
          text.includes('reels_media') ||
          text.includes('video_versions') ||
          text.includes('image_versions2') ||
          text.includes('xdt_api__v1__feed__reels_media')
        ) {
          parseMetaResponseText(text);
        }
      }
    } catch (_) {}
  }

  // --- 5. Quét React Fiber Cực Nhanh (Chỉ quét đúng bài viết mục tiêu, không duyệt toàn bộ trang) ---
  function scanReactFibers(targetShortcode = null) {
    try {
      let targets = [];

      // 1. Nếu có shortcode cụ thể, chỉ định vị đúng phần tử bài viết đó
      if (targetShortcode) {
        const link = document.querySelector(`a[href*="/${targetShortcode}/"], a[href*="/p/${targetShortcode}/"], a[href*="/reel/${targetShortcode}/"]`);
        const el = link ? link.closest('article, div[role="dialog"]') : null;
        if (el) targets = [el];
      }

      // 2. Nếu không tìm thấy, chỉ lấy tối đa 2 bài viết đang hiển thị trong khung nhìn (Viewport)
      if (targets.length === 0) {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
          targets = [dialog];
        } else {
          const vh = window.innerHeight || 800;
          const articles = document.querySelectorAll('article');
          for (let i = 0; i < articles.length; i++) {
            const art = articles[i];
            const rect = art.getBoundingClientRect();
            if (rect.bottom >= -150 && rect.top <= vh + 150) {
              targets.push(art);
              if (targets.length >= 2) break;
            }
          }
        }
      }

      for (let t = 0; t < targets.length; t++) {
        const el = targets[t];
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) continue;

        let cur = el[fiberKey];
        let depth = 0;
        while (cur && depth < 12) {
          depth++;
          if (cur.memoizedProps) {
            const found = extractAudioTracks(cur.memoizedProps, new Map(), targetShortcode);
            for (const track of found.values()) {
              dispatchTrack(track);
            }
          }
          cur = cur.return;
        }
      }
    } catch (_) {}
  }

  // --- 6. CHỦ ĐỘNG TRUY VẤN MEDIA KHI MỞ TRỰC TIẾP QUA URL HOẶC VIEWPORT ---
  async function fetchDirectPostMusic(shortcode) {
    if (!shortcode) return;
    if (window.location.pathname.includes('/reels') || window.location.pathname.includes('/reel')) return;

    if (discoveredTracks.has(shortcode) || discoveredTracks.has(`code_${shortcode}`)) {
      const track = discoveredTracks.get(shortcode) || discoveredTracks.get(`code_${shortcode}`);
      if (track) {
        window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', { detail: track }));
      }
      return;
    }

    if (noAudioSet.has(shortcode)) {
      dispatchNoAudio(shortcode);
      return;
    }

    if (inFlightFetches.has(shortcode)) return;
    inFlightFetches.add(shortcode);

    const csrfToken = getCsrfToken();
    const mediaId = shortcodeToMediaId(shortcode);

    const docIds = [
      lastKnownPostDocId,
      localStorage.getItem('__ig_post_doc_id__'),
      '8845758582119845',
      '26130443479876713'
    ].filter(Boolean);

    const uniqueDocIds = Array.from(new Set(docIds));

    // Bước 1: Thử GraphQL Persisted Query
    for (const docId of uniqueDocIds) {
      try {
        const bodyParams = new URLSearchParams();
        bodyParams.set('doc_id', docId);
        bodyParams.set('variables', JSON.stringify({
          shortcode: shortcode,
          fetch_tagged_user_count: null,
          hoisted_comment_id: null,
          hoisted_reply_id: null
        }));

        const res = await originalFetch('/graphql/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery',
            'X-IG-App-ID': '936619743392459',
            'X-ASBD-ID': '129477',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*'
          },
          credentials: 'include',
          body: bodyParams.toString()
        });

        if (res.ok) {
          const text = await res.text();
          parseMetaResponseText(text, shortcode);
          if (discoveredTracks.has(shortcode) || discoveredTracks.has(`code_${shortcode}`)) {
            inFlightFetches.delete(shortcode);
            return;
          }
        }
      } catch (_) {}
    }

    // Bước 2: REST Endpoint /api/v1/media/{mediaId}/info/
    if (mediaId && !discoveredTracks.has(shortcode) && !discoveredTracks.has(`code_${shortcode}`)) {
      try {
        const res = await originalFetch(`/api/v1/media/${mediaId}/info/`, {
          headers: {
            'X-IG-App-ID': '936619743392459',
            'X-ASBD-ID': '129477',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': '*/*'
          },
          credentials: 'include'
        });

        if (res.ok) {
          const text = await res.text();
          parseMetaResponseText(text, shortcode);
          if (discoveredTracks.has(shortcode) || discoveredTracks.has(`code_${shortcode}`)) {
            inFlightFetches.delete(shortcode);
            return;
          }
        }
      } catch (_) {}
    }

    inFlightFetches.delete(shortcode);

    if (!discoveredTracks.has(shortcode) && !discoveredTracks.has(`code_${shortcode}`)) {
      dispatchNoAudio(shortcode);
    }
  }

  // Lắng nghe yêu cầu kiểm tra bài viết từ Content Script
  window.addEventListener('__IG_REQUEST_INSPECT_POST__', (e) => {
    const { shortcode } = e.detail || {};
    if (!shortcode) return;
    if (window.location.pathname.includes('/reels') || window.location.pathname.includes('/reel')) return;

    if (noAudioSet.has(shortcode)) {
      dispatchNoAudio(shortcode);
      return;
    }

    const existing = discoveredTracks.get(shortcode) || 
                     discoveredTracks.get(`code_${shortcode}`) ||
                     Array.from(discoveredTracks.values()).find(t => t.code === shortcode);

    if (existing) {
      window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', { detail: existing }));
      return;
    }

    scanReactFibers(shortcode);

    const nowFound = discoveredTracks.get(shortcode) || discoveredTracks.get(`code_${shortcode}`);
    if (nowFound) {
      window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', { detail: nowFound }));
      return;
    }

    fetchDirectPostMusic(shortcode);
  });

  // Lắng nghe yêu cầu lấy toàn bộ media bài viết để download
  window.addEventListener('__IG_REQUEST_POST_MEDIA__', async (e) => {
    const { shortcode } = e.detail || {};
    if (!shortcode) return;

    if (postMediaMap.has(shortcode)) {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_FOUND__', {
        detail: { shortcode, items: postMediaMap.get(shortcode) }
      }));
      return;
    }

    scanReactFibers(shortcode);
    scanScriptTags();

    if (postMediaMap.has(shortcode)) {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_FOUND__', {
        detail: { shortcode, items: postMediaMap.get(shortcode) }
      }));
      return;
    }

    const fullItems = await fetchPostFullMedia(shortcode);
    if (Array.isArray(fullItems) && fullItems.length > 0) {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_FOUND__', {
        detail: { shortcode, items: fullItems }
      }));
      return;
    }

    if (postMediaMap.has(shortcode)) {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_FOUND__', {
        detail: { shortcode, items: postMediaMap.get(shortcode) }
      }));
    } else {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_NOT_FOUND__', {
        detail: { shortcode }
      }));
    }
  });

  // Lấy media trực tiếp từ React Fiber của video đang xem (Hoạt động trên Reels / Feed / Explore / Dialog)
  function findActiveVideoMedia(targetIdx = -1) {
    const targetVid = document.querySelector('video[data-ig-target-video="true"]') ||
      Array.from(document.querySelectorAll('video')).find(v => {
        const r = v.getBoundingClientRect();
        return r.width > 120 && r.height > 120 && r.top < window.innerHeight && r.bottom > 0;
      });

    if (!targetVid) return null;

    let cur = targetVid;
    let depth = 0;
    while (cur && depth < 25) {
      const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (fiberKey) {
        let fiber = cur[fiberKey];
        let fDepth = 0;
        while (fiber && fDepth < 60) {
          fDepth++;
          const props = fiber.memoizedProps;
          if (props && typeof props === 'object') {
            const rawCandidates = [
              props.item,
              props.clip,
              props.clip?.media,
              props.media,
              props.post,
              props.videoData,
              props.playbackSource,
              props.feedItem,
              props.feedItem?.media,
              props.reelItem,
              props.video
            ];

            for (const raw of rawCandidates) {
              const c = raw?.media || raw?.node || raw;
              if (c && typeof c === 'object') {
                // 1. ƯU TIÊN 1: Lấy URL Video trực tiếp từ video_versions (CHUẨN 100% VIDEO MP4, TUYỆT ĐỐI KHÔNG LẤY AUDIO & CHUNK)
                if (Array.isArray(c.video_versions) && c.video_versions.length > 0) {
                  const valid = c.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && isValidVideoMp4Url(v.url || v.src));
                  if (valid.length > 0) {
                    const prog = valid.find(v => (v.url || v.src || '').includes('progressive') || v.type === 101);
                    const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
                    const best = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src);
                    if (best && isValidVideoMp4Url(best)) {
                      const sc = (c.code && !['audio', 'reels', 'videos', 'comments'].includes(c.code.toLowerCase())) ? c.code : null;
                      return {
                        url: best,
                        shortcode: sc
                      };
                    }
                  }
                }

                // 2. ƯU TIÊN 2: Dùng extractMediaFromPostNode (chọn đúng slideIndex nếu có)
                const items = extractMediaFromPostNode(c);
                if (items && items.length > 0) {
                  let vidUrl = null;
                  if (targetIdx >= 0 && targetIdx < items.length && items[targetIdx]?.type === 'video' && isValidVideoMp4Url(items[targetIdx].url)) {
                    vidUrl = items[targetIdx].url;
                  } else {
                    const vidItem = items.find(it => it.type === 'video' && isValidVideoMp4Url(it.url));
                    if (vidItem?.url) vidUrl = vidItem.url;
                  }
                  if (vidUrl) {
                    const sc = (c.code && !['audio', 'reels', 'videos', 'comments'].includes(c.code.toLowerCase())) ? c.code : null;
                    if (sc) safeMapSet(postMediaMap, sc, items, 60);
                    return {
                      url: vidUrl,
                      shortcode: sc,
                      items
                    };
                  }
                }

                // 3. ƯU TIÊN 3: Quét sâu trong object (đã lọc bỏ audio keys)
                const url = findVideoUrlInObject(c);
                if (url && isValidVideoMp4Url(url)) {
                  const sc = (c.code && !['audio', 'reels', 'videos', 'comments'].includes(c.code.toLowerCase())) ? c.code : null;
                  return {
                    url,
                    shortcode: sc
                  };
                }
              }
            }

            // Fallback: Quét props tổng thể
            const fallbackUrl = findVideoUrlInObject(props);
            if (fallbackUrl && isValidVideoMp4Url(fallbackUrl)) {
              return { url: fallbackUrl, shortcode: null };
            }
          }
          fiber = fiber.return;
        }
      }
      cur = cur.parentElement;
      depth++;
    }

    return null;
  }

  function findVideoUrlFromDomScripts(targetShortcode) {
    if (!targetShortcode) return null;
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs]');
      for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || '';
        if (!text.includes(targetShortcode)) continue;
        if (!text.includes('video_versions') && !text.includes('video_url')) continue;

        try {
          const json = JSON.parse(text);
          let foundUrl = null;
          function walk(obj, depth = 0) {
            if (!obj || typeof obj !== 'object' || depth > 20 || foundUrl) return;
            if (obj.code === targetShortcode || obj.shortcode === targetShortcode) {
              if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
                const valid = obj.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && isValidVideoMp4Url(v.url || v.src));
                if (valid.length > 0) {
                  const prog = valid.find(v => (v.url || v.src || '').includes('progressive') || v.type === 101);
                  const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
                  foundUrl = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src);
                  return;
                }
              }
              if (obj.video_url && isValidVideoMp4Url(obj.video_url)) {
                foundUrl = obj.video_url;
                return;
              }
            }
            if (Array.isArray(obj)) {
              for (let j = 0; j < obj.length; j++) walk(obj[j], depth + 1);
            } else {
              const keys = Object.keys(obj);
              for (let j = 0; j < keys.length; j++) walk(obj[keys[j]], depth + 1);
            }
          }
          walk(json);
          if (foundUrl) return foundUrl;
        } catch (_) {}
      }
    } catch (_) {}
    return null;
  }

  window.addEventListener('__IG_REQUEST_ACTIVE_VIDEO_URL__', async (e) => {
    const { shortcode, slideIndex } = e.detail || {};
    const targetIdx = (typeof slideIndex === 'number' && slideIndex >= 0) ? slideIndex : -1;

    // Helper: Chọn video chính xác theo slideIndex (img_index)
    const pickVideoFromItems = (items) => {
      if (!Array.isArray(items) || items.length === 0) return null;

      // 1. Nếu có slideIndex chính xác và vị trí đó là video: Lấy đúng video này!
      if (targetIdx >= 0 && targetIdx < items.length) {
        const itemAtIdx = items[targetIdx];
        if (itemAtIdx?.type === 'video' && isValidVideoMp4Url(itemAtIdx.url)) {
          return itemAtIdx.url;
        }
      }

      // 2. Nếu tại targetIdx không phải video (hoặc không có slideIndex), tìm video gần targetIdx nhất
      const allVideos = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'video' && isValidVideoMp4Url(items[i].url)) {
          allVideos.push({ index: i, item: items[i] });
        }
      }
      if (allVideos.length === 0) return null;

      if (targetIdx >= 0) {
        allVideos.sort((a, b) => Math.abs(a.index - targetIdx) - Math.abs(b.index - targetIdx));
        return allVideos[0].item.url;
      }

      return allVideos[0].item.url;
    };

    // 1. NẾU CÓ SHORTCODE: ƯU TIÊN TRA TRONG postMediaMap ĐÃ CÓ
    if (shortcode && postMediaMap.has(shortcode)) {
      const items = postMediaMap.get(shortcode);
      const url = pickVideoFromItems(items);
      if (url) {
        window.dispatchEvent(new CustomEvent('__IG_ACTIVE_VIDEO_URL_RESULT__', {
          detail: { url, shortcode, items }
        }));
        return;
      }
    }

    // 2. NẾU CÓ SHORTCODE: GỌI fetchPostFullMedia(shortcode) ĐỂ LẤY URL VIDEO ĐẦY ĐỦ TRỰC TIẾP TỪ REST/GRAPHQL
    if (shortcode) {
      const fetched = await fetchPostFullMedia(shortcode);
      const url = pickVideoFromItems(fetched);
      if (url) {
        window.dispatchEvent(new CustomEvent('__IG_ACTIVE_VIDEO_URL_RESULT__', {
          detail: { url, shortcode, items: fetched }
        }));
        return;
      }
    }

    // 3. THỬ TRÍCH XUẤT TỪ REACT FIBER (CHỈ CHẤP NHẬN VIDEO HOÀN CHỈNH, KHÔNG LẤY CHUNK)
    let result = findActiveVideoMedia(targetIdx);
    if (result && result.url && isValidVideoMp4Url(result.url)) {
      window.dispatchEvent(new CustomEvent('__IG_ACTIVE_VIDEO_URL_RESULT__', { detail: result }));
      return;
    }

    // 4. QUÉT CÁC THẺ SCRIPT SSR TRONG DOM
    if (shortcode) {
      const domUrl = findVideoUrlFromDomScripts(shortcode);
      if (domUrl) {
        window.dispatchEvent(new CustomEvent('__IG_ACTIVE_VIDEO_URL_RESULT__', {
          detail: { url: domUrl, shortcode }
        }));
        return;
      }
    }

    window.dispatchEvent(new CustomEvent('__IG_ACTIVE_VIDEO_URL_RESULT__', { detail: null }));
  });

  function findStoryMediaFromFiber(targetEl = null, preferredSlideIndex = -1) {
    // CHỈ QUÉT TỪ CÁC PHẦN TỬ THUỘC STORY VIEWER (TUYỆT ĐỐI KHÔNG QUÉT HEADER ĐỂ TRÁNH LẤY AVATAR)
    const activeVid = Array.from(document.querySelectorAll('video')).find(v => {
      const r = v.getBoundingClientRect();
      return r.width > 120 && r.height > 180 && r.top < window.innerHeight && r.bottom > 0;
    });

    const activeImg = Array.from(document.querySelectorAll('img')).find(img => {
      if (img.closest('header') || img.closest('nav') || img.closest('aside')) return false;
      const r = img.getBoundingClientRect();
      return r.width > 150 && r.height > 200 && r.top < window.innerHeight && r.bottom > 0;
    });

    const centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.5);
    const storyContainer = document.querySelector('div[role="dialog"], section, main');

    const startElements = [
      targetEl,
      activeImg,
      activeVid,
      centerEl,
      storyContainer
    ].filter(Boolean);

    for (const el of startElements) {
      let cur = el;
      let depth = 0;
      while (cur && depth < 25) {
        // Tránh quét lên header
        if (cur.tagName === 'HEADER' || cur.closest('header')) {
          cur = cur.parentElement;
          depth++;
          continue;
        }

        const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (fiberKey) {
          let fiber = cur[fiberKey];
          let fDepth = 0;
          while (fiber && fDepth < 60) {
            fDepth++;
            const props = fiber.memoizedProps;
            if (props && typeof props === 'object') {
              // 1. ƯU TIÊN 1: Kiểm tra item đơn lẻ đang được component này trực tiếp render
              const directCandidates = [
                props.item,
                props.media,
                props.story,
                props.storyItem,
                props.activeItem,
                props.currentStory,
                props.reelItem
              ];
              for (const c of directCandidates) {
                if (isValidStoryCandidate(c)) {
                  const res = extractMediaFromCandidateObj(c);
                  if (res) return res;
                }
              }

              // 2. ƯU TIÊN 2: Kiểm tra props.items (danh sách stories) theo preferredSlideIndex
              if (Array.isArray(props.items) && props.items.length > 0) {
                const idx = (preferredSlideIndex >= 0 && preferredSlideIndex < props.items.length)
                  ? preferredSlideIndex
                  : (props.currentIndex ?? props.itemIndex ?? props.index ?? props.activeItemIndex ?? 0);
                const safeIdx = (idx >= 0 && idx < props.items.length) ? idx : 0;
                const active = props.items[safeIdx];
                if (isValidStoryCandidate(active)) {
                  const res = extractMediaFromCandidateObj(active);
                  if (res) return res;
                }
              }

              // 3. ƯU TIÊN 3: Kiểm tra props.reel?.items
              if (props.reel && Array.isArray(props.reel.items) && props.reel.items.length > 0) {
                const idx = (preferredSlideIndex >= 0 && preferredSlideIndex < props.reel.items.length)
                  ? preferredSlideIndex
                  : (props.currentIndex ?? props.itemIndex ?? props.index ?? 0);
                const safeIdx = (idx >= 0 && idx < props.reel.items.length) ? idx : 0;
                const active = props.reel.items[safeIdx];
                if (isValidStoryCandidate(active)) {
                  const res = extractMediaFromCandidateObj(active);
                  if (res) return res;
                }
              }
            }

            // Kiểm tra state của Fiber
            if (fiber.memoizedState && typeof fiber.memoizedState === 'object') {
              const s = fiber.memoizedState;
              const directStateCandidates = [s.item, s.media, s.currentStory, s.story, s.storyItem];
              for (const c of directStateCandidates) {
                if (isValidStoryCandidate(c)) {
                  const res = extractMediaFromCandidateObj(c);
                  if (res) return res;
                }
              }
            }

            fiber = fiber.return;
          }
        }
        cur = cur.parentElement;
        depth++;
      }
    }
    return null;
  }

  // Tìm URL video gốc từ React Fiber của phần tử Video hoặc Story Container
  function findVideoUrlFromFiber(el) {
    const media = findStoryMediaFromFiber(el);
    if (media?.type === 'video' && media.url) {
      return media.url;
    }
    return null;
  }

  // Lắng nghe yêu cầu lấy URL MP4 của Video Story đang hiển thị
  window.addEventListener('__IG_GET_ACTIVE_STORY_VIDEO__', (e) => {
    try {
      const storyId = e.detail?.storyId;
      const username = (e.detail?.username || '').toLowerCase();
      const slideIndex = e.detail?.slideIndex || 0;
      const cleanId = String(storyId || '').split('_')[0];
      const cleanUser = username.replace(/^@/, '');

      // 1. Kiểm tra trực tiếp theo storyId trong storyMediaMap
      if (cleanId && storyMediaMap.has(cleanId)) {
        const entry = storyMediaMap.get(cleanId);
        if (entry?.type === 'video' && entry.url) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url: entry.url } }));
          return;
        }
      }

      // 2. Kiểm tra trong reelMediaMap theo username/cleanId/storyId và slideIndex
      const reelKeys = [cleanUser, username, cleanId, String(storyId || '')].filter(Boolean);
      for (const k of reelKeys) {
        if (reelMediaMap.has(k)) {
          const items = reelMediaMap.get(k);
          if (Array.isArray(items) && items.length > 0) {
            const safeIdx = (slideIndex >= 0 && slideIndex < items.length) ? slideIndex : 0;
            const matched = items[safeIdx] || items.find(it => it.type === 'video');
            if (matched?.url && matched.type === 'video') {
              window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url: matched.url } }));
              return;
            }
          }
        }
      }

      // 3. Tìm thẻ video đang phát trong Story container và đọc React Fiber
      const targetVid = document.querySelector('video[data-ig-target-story-video="true"]') ||
        Array.from(document.querySelectorAll('video')).find(v => {
          const r = v.getBoundingClientRect();
          return r.width > 120 && r.height > 180 && r.top < window.innerHeight && r.bottom > 0;
        });

      if (targetVid) {
        // A. Thử findStoryMediaFromFiber
        const fiberMedia = findStoryMediaFromFiber(targetVid, slideIndex);
        if ((fiberMedia?.type === 'video' || fiberMedia?.type === 'photo_music') && (fiberMedia.url || fiberMedia.videoUrl)) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url: fiberMedia.videoUrl || fiberMedia.url } }));
          return;
        }

        // B. Quét tìm MP4 trong React Fiber của targetVid
        let cur = targetVid;
        let depth = 0;
        while (cur && depth < 25) {
          const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (fiberKey) {
            let fiber = cur[fiberKey];
            let fDepth = 0;
            while (fiber && fDepth < 80) {
              fDepth++;
              if (fiber.memoizedProps) {
                const url = findVideoUrlInObject(fiber.memoizedProps);
                if (url) {
                  window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url } }));
                  return;
                }
              }
              if (fiber.memoizedState) {
                const url = findVideoUrlInObject(fiber.memoizedState);
                if (url) {
                  window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url } }));
                  return;
                }
              }
              fiber = fiber.return;
            }
          }
          cur = cur.parentElement;
          depth++;
        }

        // C. Kiểm tra direct src nếu không phải blob
        if (targetVid.currentSrc && !targetVid.currentSrc.startsWith('blob:') && !isDashAudioUrl(targetVid.currentSrc)) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url: targetVid.currentSrc } }));
          return;
        }
      }

      // 4. Quét fiber từ element trung tâm màn hình nếu targetVid chưa ra URL
      const centerEl = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.5);
      if (centerEl) {
        let cur = centerEl;
        let depth = 0;
        while (cur && depth < 20) {
          const fiberKey = Object.keys(cur).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
          if (fiberKey) {
            let fiber = cur[fiberKey];
            let fDepth = 0;
            while (fiber && fDepth < 60) {
              fDepth++;
              if (fiber.memoizedProps) {
                const url = findVideoUrlInObject(fiber.memoizedProps);
                if (url) {
                  window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url } }));
                  return;
                }
              }
              fiber = fiber.return;
            }
          }
          cur = cur.parentElement;
          depth++;
        }
      }

      // 5. Kiểm tra danh sách video stream được ghi nhận
      if (activeStoryVideos.length > 0) {
        const currentPath = window.location.pathname;
        const matchingVideos = activeStoryVideos.filter(it => it.pathname === currentPath || (cleanUser && it.pathname.includes(cleanUser)));
        const candidateList = matchingVideos.length > 0 ? matchingVideos : activeStoryVideos;
        if (candidateList.length > 0) {
          const now = Date.now();
          // Lấy video được stream gần nhất trong 120 giây qua
          const recent = [...candidateList].reverse().find(it => (now - it.time) < 120000);
          if (recent?.url) {
            window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: { url: recent.url } }));
            return;
          }
        }
      }

      window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: null }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_VIDEO_RESULT__', { detail: null }));
    }
  });

  // --- 7. CHỦ ĐỘNG TRUY VẤN REEL MEDIA (Stories / Highlights) TỪ INSTAGRAM API ---
  const inFlightReelFetches = new Set();

  async function fetchDirectReelsMedia(reelId, username) {
    const cleanReel = String(reelId || '').replace(/^highlight:/, '');
    let targetReelId = '';

    if (cleanReel && cleanReel !== 'story' && cleanReel !== 'highlight') {
      if (reelId.startsWith('highlight:') || cleanReel.match(/^\d+$/)) {
        targetReelId = reelId.startsWith('highlight:') ? reelId : `highlight:${cleanReel}`;
      }
    }

    const fetchKey = `${targetReelId}_${username || ''}`;
    if (inFlightReelFetches.has(fetchKey)) return null;
    inFlightReelFetches.add(fetchKey);

    const csrfToken = getCsrfToken();
    const headers = {
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*'
    };

    try {
      // 1. Nếu có Reel ID cụ thể (Highlights album)
      if (targetReelId) {
        try {
          const res = await originalFetch(`/stories/highlights/${encodeURIComponent(cleanReel)}/`, {
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'include'
          });
          if (res.ok) {
            const html = await res.text();
            const items = extractTargetReelItems(html, cleanReel);
            if (items && items.length > 0) {
              safeMapSet(reelMediaMap, cleanReel, items, 60);
              safeMapSet(reelMediaMap, `highlight:${cleanReel}`, items, 60);
              inFlightReelFetches.delete(fetchKey);
              return items;
            }
          }
        } catch (_) {}
      }

      // 2. Nếu là Story của người dùng theo username
      if (username && username !== 'story' && username !== 'highlight') {
        const cleanUser = String(username).toLowerCase().replace(/^@/, '');
        const profileRes = await originalFetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUser)}`, {
          headers,
          credentials: 'include'
        });
        if (profileRes.ok) {
          const profileJson = await profileRes.json();
          const userId = profileJson?.data?.user?.id;
          if (userId) {
            const userStoryRes = await originalFetch(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`, {
              headers,
              credentials: 'include'
            });
            if (userStoryRes.ok) {
              const storyJson = await userStoryRes.json();
              processPayload(storyJson);
              const items = reelMediaMap.get(userId) || reelMediaMap.get(cleanUser);
              if (items && items.length > 0) {
                inFlightReelFetches.delete(fetchKey);
                return items;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[IG Web Music Player] fetchDirectReelsMedia failed:', err);
    } finally {
      inFlightReelFetches.delete(fetchKey);
    }

    return null;
  }

  // Lắng nghe yêu cầu lấy Media chuẩn xác của Story/Highlights từ Content Script
  window.addEventListener('__IG_GET_ACTIVE_STORY_MEDIA__', async (e) => {
    try {
      scanScriptTags();
      const { reelId = '', username = '', storyId = '', slideIndex = 0 } = e.detail || {};
      const cleanReel = String(reelId).replace(/^highlight:/, '');
      const cleanUser = String(username).toLowerCase().replace(/^@/, '');
      const cleanStoryId = String(storyId || '').split('_')[0];

      // 1. ƯU TIÊN 1: NẾU CÓ STORY ID CỤ THỂ TỪ URL -> TRA TRỰC TIẾP TRONG STORYMEDIAMAP (100% chính xác)
      if (cleanStoryId && storyMediaMap.has(cleanStoryId)) {
        const item = storyMediaMap.get(cleanStoryId);
        if (item && item.url) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: item }));
          return;
        }
      }

      // 2. ƯU TIÊN 2: TRA CỨU TRONG REELMEDIAMAP THEO REEL ID / USERNAME VÀ SLIDE INDEX
      let reelItems = null;
      if (cleanReel && reelMediaMap.has(cleanReel)) {
        reelItems = reelMediaMap.get(cleanReel);
      } else if (cleanUser && reelMediaMap.has(cleanUser)) {
        reelItems = reelMediaMap.get(cleanUser);
      } else if (cleanReel && cleanReel !== 'story' && cleanReel !== 'highlight') {
        reelItems = reelMediaMap.get(`highlight:${cleanReel}`);
      }

      // Quét thêm trong tất cả các reel đã lưu theo username của item
      if (!reelItems && cleanUser && cleanUser !== 'story' && cleanUser !== 'highlight') {
        for (const [k, items] of reelMediaMap.entries()) {
          if (Array.isArray(items) && items.length > 0) {
            const firstUser = items[0]?.user;
            if (firstUser && (firstUser === cleanUser || k.toLowerCase().includes(cleanUser))) {
              reelItems = items;
              break;
            }
          }
        }
      }

      // NẾU CHƯA CÓ TRONG BỘ NHỚ -> CHỦ ĐỘNG GỌI API INSTAGRAM NGAY LẬP TỨC!
      if ((!reelItems || reelItems.length === 0) && (cleanReel || cleanUser)) {
        reelItems = await fetchDirectReelsMedia(cleanReel || reelId, cleanUser);
      }

      if (Array.isArray(reelItems) && reelItems.length > 0) {
        let matched = null;
        if (cleanStoryId) {
          matched = reelItems.find(it => it.id === cleanStoryId || it.cleanId === cleanStoryId || it.rawId === cleanStoryId || it.code === cleanStoryId);
        }
        if (!matched) {
          const safeIndex = (slideIndex >= 0 && slideIndex < reelItems.length) ? slideIndex : 0;
          matched = reelItems[safeIndex];
        }
        if (matched?.url) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: matched }));
          return;
        }
      }

      // 3. ƯU TIÊN 3: ĐỌC TỪ REACT FIBER CỦA STORY ĐANG HIỂN THỊ (VỚI SLIDE INDEX CHÍNH XÁC)
      const fiberMedia = findStoryMediaFromFiber(null, slideIndex);
      if (fiberMedia && fiberMedia.url) {
        // Nếu trong storyMediaMap có item đầy đủ hơn -> dùng item từ map
        if (fiberMedia.id && storyMediaMap.has(fiberMedia.id)) {
          const mapItem = storyMediaMap.get(fiberMedia.id);
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: mapItem }));
          return;
        }
        window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: fiberMedia }));
        return;
      }

      // 4. Tra cứu theo storyId cụ thể trong storyMediaMap
      if (cleanStoryId && storyMediaMap.has(cleanStoryId)) {
        window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: storyMediaMap.get(cleanStoryId) }));
        return;
      }

      // 5. Dự phòng nếu có video stream vừa phát của story này
      if (activeStoryVideos.length > 0) {
        const recent = [...activeStoryVideos].reverse().find(it => (Date.now() - it.time) < 120000);
        if (recent?.url) {
          window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', {
            detail: {
              type: 'video',
              url: recent.url,
              user: cleanUser || 'story'
            }
          }));
          return;
        }
      }

      window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: null }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent('__IG_ACTIVE_STORY_MEDIA_RESULT__', { detail: null }));
    }
  });

  // --- 8. PROFILE MEDIA EXTRACTOR (POSTS, STORIES, HIGHLIGHTS) ---
  function sanitizePathTitle(name) {
    if (!name) return 'Highlight';
    return String(name).replace(/[\/\\?%*:|"<>]/g, '_').trim() || 'Highlight';
  }

  const userNumericIdCache = new Map();

  // Lấy User ID dạng số (numeric) chính xác của tài khoản username
  function findNumericUserId(username) {
    const clean = String(username || '').toLowerCase().replace(/^@/, '').trim();
    if (!clean) return null;
    if (userNumericIdCache.has(clean)) return userNumericIdCache.get(clean);

    const dsId = document.cookie.match(/(?:^|;\s*)ds_user_id=([^;]+)/)?.[1];
    const pathUser = window.location.pathname.replace(/^\/|\/$/g, '').split('/')[0]?.toLowerCase();
    const pageUser = document.querySelector('header h2, header h1')?.textContent?.trim().toLowerCase();

    // 1. Kiểm tra chính xác nếu đang xem profile của chính mình
    const isOwn = (
      (clean === pageUser || clean === pathUser) && Boolean(
        document.querySelector('header a[href*="/accounts/edit/"], header a[href*="/archive/"]') ||
        document.body.textContent.includes('Edit profile') ||
        document.body.textContent.includes('Chỉnh sửa trang cá nhân') ||
        document.body.textContent.includes('View archive') ||
        document.body.textContent.includes('Xem kho lưu trữ')
      )
    );
    if (isOwn && dsId && dsId.match(/^\d+$/)) {
      safeMapSet(userNumericIdCache, clean, dsId, 60);
      return dsId;
    }

    // TUYỆT ĐỐI KHÔNG DÙNG meta[property="instapp:owner_user_id"] vì khi người dùng chuyển trang (SPA), thẻ meta này vẫn lưu ID của trang đầu tiên!

    // 2. Tìm trong các thẻ <script> gắn liền với đúng username này
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs]');
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!txt.includes(`"${clean}"`)) continue;

        const reg1 = new RegExp(`"username"\\s*:\\s*"${clean}"[\\s\\S]{1,500}?"(?:id|pk)"\\s*:\\s*"(\\d{5,})"`, 'i');
        const m1 = txt.match(reg1);
        if (m1) {
          safeMapSet(userNumericIdCache, clean, m1[1], 60);
          return m1[1];
        }

        const reg2 = new RegExp(`"(?:id|pk)"\\s*:\\s*"(\\d{5,})"[\\s\\S]{1,500}?"username"\\s*:\\s*"${clean}"`, 'i');
        const m2 = txt.match(reg2);
        if (m2) {
          safeMapSet(userNumericIdCache, clean, m2[1], 60);
          return m2[1];
        }
      }
    } catch (_) {}

    return null;
  }

  // Hàm quét Highlights an toàn 100%, bảo vệ tuyệt đối không bị lỗi Proxy hay Getter của React/Relay
  function searchObjForHighlights(obj, addHighlight, targetUser = null, visited = new Set(), depth = 0) {
    if (!obj || depth > 8) return;
    try {
      if (typeof obj !== 'object') return;
      if (obj instanceof Node || obj instanceof Window || obj instanceof Document) return;
      // Bỏ qua các đối tượng nội bộ Fiber hoặc Relay tránh kích hoạt Proxy trap
      if (obj.stateNode || obj._dispatcher || obj.return || obj.environment) return;
      if (visited.has(obj)) return;
      visited.add(obj);

      // Nếu chỉ định targetUser thì kiểm tra nếu node có user/owner khác thì bỏ qua
      const nodeUser = (obj.user?.username || obj.owner?.username || obj.username || '').toLowerCase().trim();
      if (targetUser && nodeUser && nodeUser !== targetUser) return;
    } catch (_) {
      return;
    }

    try {
      if (obj.edge_highlight_reels && Array.isArray(obj.edge_highlight_reels.edges)) {
        for (const edge of obj.edge_highlight_reels.edges) {
          const node = edge?.node;
          if (node && (node.id || node.pk)) {
            addHighlight(node.id || node.pk, node.title);
          }
        }
      }

      const tray = obj.highlight_reels || obj.highlights || obj.highlight_tray || obj.reels_tray || (Array.isArray(obj.tray) ? obj.tray : null);
      if (Array.isArray(tray)) {
        for (const t of tray) {
          if (t && (t.id || t.pk)) {
            addHighlight(t.id || t.pk, t.title);
          }
        }
      }

      if ((obj.__typename === 'GraphHighlightReel' || String(obj.id || '').startsWith('highlight:')) && (obj.id || obj.pk)) {
        addHighlight(obj.id || obj.pk, obj.title);
      }
    } catch (_) {}

    try {
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          try {
            searchObjForHighlights(obj[i], addHighlight, targetUser, visited, depth + 1);
          } catch (_) {}
        }
      } else {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
          try {
            const k = keys[i];
            if (k.startsWith('__') || k === 'child' || k === 'sibling' || k === 'stateNode' || k === 'return') continue;
            const val = obj[k];
            if (val && typeof val === 'object') {
              searchObjForHighlights(val, addHighlight, targetUser, visited, depth + 1);
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  function findAllHighlights(username) {
    const cleanUser = String(username || '').toLowerCase().replace(/^@/, '').trim();
    const highlights = [];
    const seenIds = new Set();

    function addHighlight(id, title) {
      if (!id) return;
      const cleanId = String(id).replace(/^highlight:/, '').trim();
      if (!cleanId || seenIds.has(cleanId)) return;
      seenIds.add(cleanId);
      highlights.push({
        id: cleanId,
        title: sanitizePathTitle(title || 'Highlight')
      });
    }

    // 1. Kiểm tra cache đã có CHỈ KHI khớp chính xác username của profile hiện tại
    if (cleanUser) {
      for (const [id, hl] of cachedHighlights.entries()) {
        if (hl.user === cleanUser) {
          addHighlight(id, hl.title);
        }
      }
    }

    // 2. Quét các liên kết thẻ a trên DOM CHỈ KHI trang hiện tại đúng là trang profile của cleanUser
    const currentPathUser = window.location.pathname.replace(/^\/|\/$/g, '').split('/')[0]?.toLowerCase();
    if (!cleanUser || currentPathUser === cleanUser) {
      try {
        const links = document.querySelectorAll('a[href*="/highlights/"], a[href*="/stories/highlights/"]');
        for (const a of links) {
          const href = a.getAttribute('href') || '';
          const m = href.match(/\/highlights\/([A-Za-z0-9_-]+)/);
          if (m) {
            const title = a.querySelector('span, div')?.textContent || a.textContent || 'Highlight';
            addHighlight(m[1], title);
          }
        }
      } catch (_) {}
    }

    // 3. Quét thẻ Script JSON CHỈ KHI chứa rõ ràng tên cleanUser
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs]');
      for (const s of scripts) {
        const txt = s.textContent || '';
        if (!txt.includes('highlight') && !txt.includes('edge_highlight_reels')) continue;
        if (cleanUser && !txt.toLowerCase().includes(`"${cleanUser}"`)) continue;
        try {
          const json = JSON.parse(txt);
          searchObjForHighlights(json, addHighlight, cleanUser);
        } catch (_) {}
      }
    } catch (_) {}

    return highlights;
  }

  // Lấy chi tiết toàn bộ media của một bài viết (trích xuất đầy đủ tất cả ảnh carousel và video .mp4)
  async function fetchPostFullMedia(shortcode) {
    if (!shortcode) return [];

    if (postMediaMap.has(shortcode)) {
      const cached = postMediaMap.get(shortcode);
      if (Array.isArray(cached) && cached.length > 0) return cached;
    }

    const csrfToken = getCsrfToken();
    const mediaId = shortcodeToMediaId(shortcode);
    const headers = {
      'X-IG-App-ID': '936619743392459',
      'X-ASBD-ID': '129477',
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*'
    };

    // Cách 1: REST Endpoint /api/v1/media/{mediaId}/info/
    if (mediaId) {
      try {
        const res = await originalFetch(`/api/v1/media/${mediaId}/info/`, {
          headers,
          credentials: 'include'
        });
        if (res.ok) {
          const json = await res.json();
          processPayload(json);
          if (postMediaMap.has(shortcode)) {
            return postMediaMap.get(shortcode);
          }
          if (Array.isArray(json.items) && json.items.length > 0) {
            const items = extractMediaFromPostNode(json.items[0]);
            if (items.length > 0) {
              safeMapSet(postMediaMap, shortcode, items, 60);
              return items;
            }
          }
        }
      } catch (_) {}
    }

    // Cách 2: GraphQL Persisted Query (chỉ dùng doc_id thực tế bắt được từ mạng)
    const docIds = [
      lastKnownPostDocId,
      localStorage.getItem('__ig_post_doc_id__')
    ].filter(Boolean);

    for (const docId of Array.from(new Set(docIds))) {
      try {
        const bodyParams = new URLSearchParams();
        bodyParams.set('doc_id', docId);
        bodyParams.set('variables', JSON.stringify({
          shortcode: shortcode,
          fetch_tagged_user_count: null,
          hoisted_comment_id: null,
          hoisted_reply_id: null
        }));

        const res = await originalFetch('/graphql/query', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-FB-Friendly-Name': 'PolarisPostActionLoadPostQueryQuery'
          },
          credentials: 'include',
          body: bodyParams.toString()
        });

        if (res.ok) {
          const text = await res.text();
          parseMetaResponseText(text, shortcode);
          if (postMediaMap.has(shortcode)) {
            return postMediaMap.get(shortcode);
          }
        }
      } catch (_) {}
    }

    // Cách 3: Fetch trang bài viết trực tiếp (/p/{shortcode}/)
    try {
      const pRes = await originalFetch(`/p/${encodeURIComponent(shortcode)}/`, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });
      if (pRes.ok) {
        const html = await pRes.text();
        parseMetaResponseText(html, shortcode);
        if (postMediaMap.has(shortcode)) {
          return postMediaMap.get(shortcode);
        }
      }
    } catch (_) {}

    return [];
  }

  // Trích xuất CHUẨN XÁC các slide items thuộc về Reel cụ thể (Highlight ID hoặc Story của Username)
  // Tuyệt đối không dùng regex quét toàn trang HTML (tránh dính ads, explore clip, avatar, v.v.)
  function extractTargetReelItems(source, targetReelId = null, targetUsername = null) {
    if (!source) return [];
    const cleanTargetId = targetReelId ? String(targetReelId).replace(/^highlight:/, '').trim() : null;
    const cleanTargetUser = targetUsername ? String(targetUsername).toLowerCase().replace(/^@/, '').trim() : null;

    const results = [];
    const seenUrls = new Set();

    function addSlide(cand, reelOwner) {
      if (!cand || typeof cand !== 'object') return;
      const targetObj = cand.media || cand.node || cand;

      // 1. Lọc bỏ quảng cáo, nội dung tài trợ
      if (targetObj.is_ad || targetObj.is_sponsored || targetObj.sponsored_info || targetObj.invalidation_rules) {
        return;
      }

      // 2. Xác thực chủ sở hữu: nếu chỉ định targetUsername (và không phải Highlight ID) thì phải khớp
      const itemUser = (targetObj.user?.username || targetObj.owner?.username || reelOwner || '').toLowerCase().trim();
      if (!cleanTargetId && cleanTargetUser && itemUser && itemUser !== cleanTargetUser) {
        return; // Bỏ qua story/quảng cáo gợi ý của user khác
      }

      // Đã có sẵn dữ liệu chuẩn từ extractMediaFromCandidateObj
      if (cand.type && cand.url && (cand.videoUrl || cand.imageUrl)) {
        const isVid = (cand.type === 'video' || cand.isVideo || Boolean(cand.videoUrl));
        const finalUrl = isVid ? (cand.videoUrl || cand.url) : (cand.imageUrl || cand.url);
        if (finalUrl && !seenUrls.has(finalUrl)) {
          seenUrls.add(finalUrl);
          results.push({
            type: isVid ? 'video' : 'image',
            url: finalUrl,
            isVideo: isVid,
            id: String(cand.id || `slide_${results.length + 1}`).split('_')[0],
            taken_at: cand.taken_at || Math.floor(Date.now() / 1000),
            user: cand.user || itemUser || cleanTargetUser
          });
          return;
        }
      }

      // 3. Trích xuất video URL tốt nhất nếu có
      let videoUrl = null;
      if (Array.isArray(targetObj.video_versions) && targetObj.video_versions.length > 0) {
        const valid = targetObj.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && !isDashAudioUrl(v.url || v.src));
        if (valid.length > 0) {
          const sorted = [...valid].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
          videoUrl = sorted[0]?.url || sorted[0]?.src || null;
        }
      } else if (typeof targetObj.video_url === 'string' && targetObj.video_url.startsWith('http') && !isDashAudioUrl(targetObj.video_url)) {
        videoUrl = targetObj.video_url;
      } else if (typeof targetObj.playbackUrl === 'string' && targetObj.playbackUrl.startsWith('http') && !isDashAudioUrl(targetObj.playbackUrl)) {
        videoUrl = targetObj.playbackUrl;
      } else if (typeof targetObj.videoUrl === 'string' && targetObj.videoUrl.startsWith('http') && !isDashAudioUrl(targetObj.videoUrl)) {
        videoUrl = targetObj.videoUrl;
      } else if (Array.isArray(targetObj.video_resources) && targetObj.video_resources.length > 0) {
        const valid = targetObj.video_resources.filter(v => v && typeof (v.src || v.url) === 'string' && !isDashAudioUrl(v.src || v.url));
        if (valid.length > 0) {
          const sorted = [...valid].sort((a, b) => ((b.config_width || 0) * (b.config_height || 0)) - ((a.config_width || 0) * (a.config_height || 0)));
          videoUrl = sorted[0]?.src || sorted[0]?.url || null;
        }
      } else if (cand.videoUrl && typeof cand.videoUrl === 'string' && !isDashAudioUrl(cand.videoUrl)) {
        videoUrl = cand.videoUrl;
      }

      // 4. Trích xuất ảnh chất lượng cao nhất
      let imgUrl = null;
      if (Array.isArray(targetObj.image_versions2?.candidates) && targetObj.image_versions2.candidates.length > 0) {
        const sorted = [...targetObj.image_versions2.candidates].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
        imgUrl = sorted[0]?.url || sorted[0]?.src || null;
      } else if (Array.isArray(targetObj.display_resources) && targetObj.display_resources.length > 0) {
        const sorted = [...targetObj.display_resources].sort((a, b) => ((b.config_width || 0) * (b.config_height || 0)) - ((a.config_width || 0) * (a.config_height || 0)));
        imgUrl = sorted[0]?.src || sorted[0]?.url || null;
      } else if (typeof targetObj.display_url === 'string' && targetObj.display_url.startsWith('http')) {
        imgUrl = targetObj.display_url;
      }

      // Nhận diện video thật vs Ảnh kèm nhạc (Story photo with music)
      const isPhotoWithMusic = Boolean(
        imgUrl && (
          targetObj.original_media_type === 1 ||
          targetObj.is_photo_with_music === true ||
          (Array.isArray(targetObj.story_music_stickers) && targetObj.story_music_stickers.length > 0)
        )
      );

      const isRealVideo = Boolean(videoUrl) && !isPhotoWithMusic && (
        targetObj.original_media_type === 2 ||
        targetObj.media_type === 2 ||
        targetObj.is_video === true ||
        Boolean(targetObj.__typename?.includes('Video'))
      );

      const chosenUrl = isRealVideo ? videoUrl : (imgUrl || videoUrl);
      if (!chosenUrl || seenUrls.has(chosenUrl)) return;
      seenUrls.add(chosenUrl);

      results.push({
        type: isRealVideo ? 'video' : 'image',
        url: chosenUrl,
        videoUrl: videoUrl,
        imageUrl: imgUrl,
        isVideo: isRealVideo,
        isPhotoWithMusic: isPhotoWithMusic,
        id: String(targetObj.id || targetObj.pk || `slide_${results.length + 1}`).split('_')[0],
        taken_at: targetObj.taken_at || Math.floor(Date.now() / 1000),
        user: itemUser || cleanTargetUser
      });
    }

    function searchTargetReel(node, depth = 0, visited = new WeakSet()) {
      if (!node || typeof node !== 'object' || depth > 20) return;
      if (visited.has(node)) return;
      visited.add(node);

      const rawId = String(node.id || node.pk || '');
      const cleanId = rawId.replace(/^highlight:/, '');
      const nodeUser = (node.user?.username || node.owner?.username || node.username || '').toLowerCase().trim();

      let isMatch = false;
      if (cleanTargetId) {
        if (cleanId === cleanTargetId || rawId === `highlight:${cleanTargetId}`) {
          isMatch = true;
        }
      } else if (cleanTargetUser) {
        if (nodeUser === cleanTargetUser) {
          if (node.latest_reel_media !== undefined || node.expiring_at !== undefined || node.reel_type || node.__typename === 'GraphReel') {
            isMatch = true;
          }
        }
      } else {
        if (node.items || node.nodes || node.edges) {
          isMatch = true;
        }
      }

      if (isMatch) {
        const items = Array.isArray(node.items) ? node.items :
                      (Array.isArray(node.nodes) ? node.nodes :
                      (Array.isArray(node.edges) ? node.edges.map(e => e?.node || e).filter(Boolean) : null));
        if (Array.isArray(items) && items.length > 0) {
          for (const it of items) {
            addSlide(it, nodeUser || cleanTargetUser);
          }
          return;
        }
      }

      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) searchTargetReel(node[i], depth + 1, visited);
      } else {
        const keys = Object.keys(node);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          if (k === 'edge_owner_to_timeline_media' || k === 'edge_web_feed_timeline' || k === 'feed' || k === 'explore' || k === 'suggested_users' || k === 'ad_media') continue;
          if (typeof node[k] === 'object' && node[k] !== null) {
            searchTargetReel(node[k], depth + 1, visited);
          }
        }
      }
    }

    if (Array.isArray(source)) {
      for (const it of source) {
        addSlide(it, cleanTargetUser);
      }
      if (results.length > 0) return results;
    }

    if (typeof source === 'string') {
      if (source.includes('<script')) {
        const scriptMatches = source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        for (const m of scriptMatches) {
          const sc = m[1].trim();
          if (sc.startsWith('{') || sc.startsWith('[')) {
            try {
              searchTargetReel(JSON.parse(sc));
            } catch (_) {}
          }
        }
      } else {
        let cleaned = source.trim();
        if (cleaned.startsWith('for (;;);')) cleaned = cleaned.substring(9).trim();
        try {
          searchTargetReel(JSON.parse(cleaned));
        } catch (_) {
          const fb = cleaned.indexOf('{');
          const lb = cleaned.lastIndexOf('}');
          if (fb !== -1 && lb > fb) {
            try {
              searchTargetReel(JSON.parse(cleaned.substring(fb, lb + 1)));
            } catch (_) {}
          }
        }
      }
    } else if (typeof source === 'object') {
      searchTargetReel(source);
    }

    return results;
  }

  async function fetchUserProfileMedia(requestId, username, options = {}) {
    const {
      type = 'all', // 'all', 'stories', 'videos', 'photos'
      postLimit = 0,
      exportStruct = 'folders', // 'folders' (theo thư mục) hoặc 'bulk' (hàng loạt)
      includePosts = (options.type !== 'stories' && options.type !== 'story' && options.type !== 'highlight' && options.type !== 'highlights'),
      includeStories = (options.type === 'all' || options.type === 'stories' || options.type === 'story'),
      includeHighlights = (options.type === 'all' || options.type === 'stories' || options.type === 'highlight' || options.type === 'highlights')
    } = options;

    const cleanUser = String(username || '').toLowerCase().replace(/^@/, '').trim();
    if (!cleanUser) {
      window.dispatchEvent(new CustomEvent('__IG_PROFILE_MEDIA_RESULT__', {
        detail: { requestId, error: 'Tên người dùng không hợp lệ' }
      }));
      return;
    }

    function sendProgress(stage, message, extra = {}) {
      window.dispatchEvent(new CustomEvent('__IG_PROFILE_SCAN_PROGRESS__', {
        detail: { requestId, stage, message, ...extra }
      }));
    }

    try {
      sendProgress('init', `Đang kết nối và phân tích tài khoản @${cleanUser}...`);

      const csrfToken = getCsrfToken();
      const headers = {
        'X-IG-App-ID': '936619743392459',
        'X-ASBD-ID': '129477',
        'X-CSRFToken': csrfToken,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': '*/*'
      };

      let numericUserId = findNumericUserId(cleanUser);
      if (!numericUserId) {
        try {
          const uRes = await originalFetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUser)}`, {
            headers,
            credentials: 'include'
          });
          if (uRes.ok) {
            const uJson = await uRes.json();
            const uData = uJson?.data?.user;
            if (uData && uData.id && String(uData.username || '').toLowerCase() === cleanUser) {
              numericUserId = String(uData.id);
              safeMapSet(userNumericIdCache, cleanUser, numericUserId, 60);
              extractHighlightsFromPayload(uData, cleanUser);
            }
          }
        } catch (_) {}
      }

      const collectedMedia = [];
      const seenMediaUrls = new Set();

      function addMediaItem(item) {
        if (!item || !item.url || seenMediaUrls.has(item.url)) return;
        seenMediaUrls.add(item.url);
        collectedMedia.push(item);
      }

      // =========================================================================
      // PHẦN A: BÀI VIẾT (POSTS) - Áp dụng cho mode: 'all', 'photos', 'videos'
      // =========================================================================
      if (includePosts) {
        sendProgress('scanning_posts', 'Đang quét danh sách bài viết trên trang...');

        // 1. Xác định tổng số bài viết hiển thị trên Header trang cá nhân (Ví dụ: "50 posts" hoặc "50 bài viết")
        let totalPostsInHeader = 0;
        try {
          const headerEls = Array.from(document.querySelectorAll('header span, header li, header div, header ul, header h2, header h1, header'));
          for (const el of headerEls) {
            const txt = (el.textContent || '').trim();
            const m = txt.match(/^([\d,.]+)\s*(?:posts|bài viết)$/i) || txt.match(/\b([\d,.]+)\s*(?:posts|bài viết)\b/i);
            if (m) {
              totalPostsInHeader = parseInt(m[1].replace(/[,.]/g, ''), 10);
              if (totalPostsInHeader > 0) break;
            }
          }
        } catch (_) {}

        // Xác định số lượng bài viết mục tiêu cần lấy
        const targetCount = (postLimit > 0)
          ? (totalPostsInHeader > 0 ? Math.min(postLimit, totalPostsInHeader) : postLimit)
          : (totalPostsInHeader > 0 ? totalPostsInHeader : 9999);

        // 2. Thu thập danh sách bài viết ban đầu từ DOM
        const postLinkElements = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
        const shortcodeList = [];
        const seenSc = new Set();

        for (const el of postLinkElements) {
          const href = el.getAttribute('href') || '';
          const m = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
          if (m && !seenSc.has(m[1])) {
            seenSc.add(m[1]);
            shortcodeList.push({ shortcode: m[1], el });
          }
        }

        // 3. Nếu số lượng bài trên DOM chưa đủ targetCount, tự động cuộn trang để nạp toàn bộ
        if (shortcodeList.length < targetCount) {
          const initialScrollY = window.scrollY;
          let noProgressCount = 0;
          let lastScannedCount = shortcodeList.length;

          sendProgress('scanning_posts', `Đang cuộn nạp danh sách bài viết (${shortcodeList.length}/${targetCount === 9999 ? (totalPostsInHeader || 'toàn bộ') : targetCount})...`);

          while (shortcodeList.length < targetCount && noProgressCount < 8) {
            window.scrollBy({ top: 1200, behavior: 'instant' });
            window.scrollTo(0, document.body.scrollHeight);

            await new Promise(r => setTimeout(r, 450));

            const curLinks = document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]');
            let newlyFound = 0;
            for (const el of curLinks) {
              const href = el.getAttribute('href') || '';
              const m = href.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
              if (m && !seenSc.has(m[1])) {
                seenSc.add(m[1]);
                shortcodeList.push({ shortcode: m[1], el });
                newlyFound++;
              }
            }

            if (shortcodeList.length > lastScannedCount) {
              lastScannedCount = shortcodeList.length;
              noProgressCount = 0;
              sendProgress('scanning_posts', `Đã tìm thấy ${shortcodeList.length}/${targetCount === 9999 ? (totalPostsInHeader || 'toàn bộ') : targetCount} bài viết...`);
            } else {
              noProgressCount++;
              window.scrollBy({ top: -350, behavior: 'instant' });
              await new Promise(r => setTimeout(r, 200));
              window.scrollTo(0, document.body.scrollHeight);
              await new Promise(r => setTimeout(r, 350));
            }
          }

          window.scrollTo({ top: initialScrollY, behavior: 'smooth' });
        }

        // Áp dụng giới hạn số lượng bài viết nếu có (thứ tự tự nhiên: mới nhất -> cũ nhất)
        const targetPosts = (postLimit > 0) ? shortcodeList.slice(0, postLimit) : shortcodeList;
        const totalToScan = targetPosts.length;

        sendProgress('scanning_posts', `Tìm thấy ${totalToScan} bài viết. Đang trích xuất toàn bộ ảnh carousel & video...`, {
          currentCount: 0
        });

        // 2. Trích xuất đầy đủ chi tiết của từng bài viết (concurrency 3)
        let scannedCount = 0;
        const postWorkers = [];
        const concurrency = 3;
        let postIdx = 0;

        async function postWorker() {
          while (postIdx < targetPosts.length) {
            const curIdx = postIdx++;
            const item = targetPosts[curIdx];
            const sc = item.shortcode;
            // Đánh số bài viết từ Date MỚI -> CŨ: 01, 02, 03...
            const pIdxStr = String(curIdx + 1).padStart(2, '0');

            try {
              const fullItems = await fetchPostFullMedia(sc);
              scannedCount++;

              sendProgress('scanning_posts', `Đang phân tích bài ${scannedCount}/${totalToScan}: @${sc} (${fullItems.length} media)...`, {
                currentCount: collectedMedia.length
              });

              if (Array.isArray(fullItems) && fullItems.length > 0) {
                // Kiểm tra xem bài viết có phải là 1 video đơn lẻ không
                const isSingleVideo = (fullItems.length === 1 && fullItems[0].type === 'video');

                for (let mIdx = 0; mIdx < fullItems.length; mIdx++) {
                  const m = fullItems[mIdx];

                  if (type === 'photos' && m.type !== 'image') continue;
                  if (type === 'videos' && m.type !== 'video') continue;

                  const isVideo = (m.type === 'video');
                  const ext = isVideo ? 'mp4' : 'jpg';
                  let filename = '';

                  if (isSingleVideo || (type === 'videos' && isVideo)) {
                    // Video đơn lẻ / Reels: đưa vào folder Reels với format {index}_reels.mp4
                    filename = `Reels/${pIdxStr}_reels.mp4`;
                  } else {
                    // Bài viết ảnh / carousel: đưa vào folder Post với format {index}_post
                    const suffix = fullItems.length > 1 ? `_${mIdx + 1}` : '';
                    if (exportStruct === 'folders') {
                      filename = `Post/${pIdxStr}_post/${pIdxStr}_post${suffix}.${ext}`;
                    } else {
                      filename = `Post/${pIdxStr}_post${suffix}.${ext}`;
                    }
                  }

                  addMediaItem({
                    type: m.type,
                    url: m.url,
                    category: isVideo ? 'videos' : 'photos',
                    shortcode: sc,
                    id: `${sc}_${mIdx + 1}`,
                    filename: filename,
                    timestamp: Math.floor(Date.now() / 1000)
                  });
                }
              } else {
                // Fallback nếu bài viết không fetch được API
                const isReel = item.el.getAttribute('href')?.includes('/reel/');
                const img = item.el.querySelector('img');
                let imgUrl = img?.currentSrc || img?.src;
                if (img?.srcset) {
                  const parts = img.srcset.split(',').map(s => s.trim().split(' '));
                  const best = parts.sort((x, y) => parseInt(y[1] || '0') - parseInt(x[1] || '0'))[0];
                  if (best && best[0]) imgUrl = best[0];
                }

                if (isReel && type !== 'photos') {
                  if (imgUrl) {
                    const filename = `Reels/${pIdxStr}_reels.mp4`;
                    addMediaItem({
                      type: 'video',
                      url: imgUrl,
                      category: 'videos',
                      shortcode: sc,
                      id: sc,
                      filename: filename,
                      timestamp: Math.floor(Date.now() / 1000)
                    });
                  }
                } else if (type !== 'videos') {
                  if (imgUrl) {
                    const filename = (exportStruct === 'folders')
                      ? `Post/${pIdxStr}_post/${pIdxStr}_post.jpg`
                      : `Post/${pIdxStr}_post.jpg`;
                    addMediaItem({
                      type: 'image',
                      url: imgUrl,
                      category: 'photos',
                      shortcode: sc,
                      id: sc,
                      filename: filename,
                      timestamp: Math.floor(Date.now() / 1000)
                    });
                  }
                }
              }
            } catch (err) {
              console.warn('[Profile Downloader] scan post error:', sc, err);
            }
          }
        }

        const numWorkers = Math.min(concurrency, targetPosts.length);
        for (let w = 0; w < numWorkers; w++) {
          postWorkers.push(postWorker());
        }
        await Promise.all(postWorkers);
      }

      // =========================================================================
      // PHẦN B: TIN NỔI BẬT (HIGHLIGHTS) - Áp dụng cho mode: 'all', 'stories'
      // =========================================================================
      if (includeHighlights) {
        sendProgress('scanning_highlights', 'Đang quét danh sách Tin nổi bật (Highlights)...', {
          currentCount: collectedMedia.length
        });

        const highlightList = findAllHighlights(cleanUser);
        const seenReelIds = new Set(highlightList.map(h => h.id));

        // Thử thêm API REST highlights_tray nếu có numericUserId
        if (numericUserId) {
          try {
            const trayRes = await originalFetch(`/api/v1/highlights/${encodeURIComponent(numericUserId)}/highlights_tray/`, {
              headers,
              credentials: 'include'
            });
            if (trayRes.ok) {
              const trayJson = await trayRes.json();
              extractHighlightsFromPayload(trayJson, cleanUser);
              if (Array.isArray(trayJson.tray)) {
                for (const t of trayJson.tray) {
                  const clean = String(t.id).replace(/^highlight:/, '');
                  if (!seenReelIds.has(clean)) {
                    seenReelIds.add(clean);
                    highlightList.push({
                      id: clean,
                      title: sanitizePathTitle(t.title || 'Highlight')
                    });
                  }
                  if (Array.isArray(t.items) && t.items.length > 0) {
                    const parsed = extractTargetReelItems(t.items);
                    if (parsed.length > 0) {
                      safeMapSet(reelMediaMap, clean, parsed, 60);
                      safeMapSet(reelMediaMap, `highlight:${clean}`, parsed, 60);
                    }
                  }
                }
              }
            }
          } catch (_) {}
        }

        if (highlightList.length > 0) {
          sendProgress('scanning_highlights', `Tìm thấy ${highlightList.length} album Tin nổi bật. Đang trích xuất toàn bộ slide...`, {
            currentCount: collectedMedia.length
          });

          for (let hIdx = 0; hIdx < highlightList.length; hIdx++) {
            const hl = highlightList[hIdx];
            const cleanId = hl.id;
            const albumTitle = hl.title;
            // Yêu cầu: "Còn higline thì lấy theo đầu danh sách -> cuối danh sách hightline ( index_higline )"
            const hlIdxStr = String(hIdx + 1).padStart(2, '0');
            const hlFolder = `${hlIdxStr}_${albumTitle}`;

            sendProgress('scanning_highlights', `Đang tải album Tin nổi bật (${hIdx + 1}/${highlightList.length}): "${albumTitle}"...`, {
              currentCount: collectedMedia.length
            });

            // 1. Kiểm tra cache đã có trong reelMediaMap
            let cachedReel = reelMediaMap.get(cleanId) || reelMediaMap.get(`highlight:${cleanId}`);

            // 2. Fetch trang web chính thức của Highlight (/stories/highlights/{cleanId}/) - Trả về 200 OK
            if (!cachedReel || cachedReel.length === 0) {
              try {
                const hRes = await originalFetch(`/stories/highlights/${encodeURIComponent(cleanId)}/`, {
                  headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'X-Requested-With': 'XMLHttpRequest'
                  },
                  credentials: 'include'
                });
                if (hRes.ok) {
                  const htmlText = await hRes.text();
                  const parsed = extractTargetReelItems(htmlText, cleanId, cleanUser);
                  if (parsed.length > 0) {
                    cachedReel = parsed;
                    safeMapSet(reelMediaMap, cleanId, parsed, 60);
                  }
                }
              } catch (_) {}
            }

            // 3. Fallback qua Query Hash chính thức của GraphQL dành cho Highlights
            if (!cachedReel || cachedReel.length === 0) {
              try {
                const qVars = JSON.stringify({ highlight_reel_ids: [cleanId], precomposed_overlay: false });
                const qRes = await originalFetch(`/graphql/query/?query_hash=45246d3fe16ccc6577e0bd297a5db1ab&variables=${encodeURIComponent(qVars)}`, {
                  headers: {
                    'X-IG-App-ID': '936619743392459',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': '*/*'
                  },
                  credentials: 'include'
                });
                if (qRes.ok) {
                  const qJson = await qRes.json();
                  const parsed = extractTargetReelItems(qJson, cleanId, cleanUser);
                  if (parsed.length > 0) {
                    cachedReel = parsed;
                    safeMapSet(reelMediaMap, cleanId, parsed, 60);
                  }
                }
              } catch (_) {}
            }

            // 4. Nếu có items từ cache/web -> Trích xuất trực tiếp
            if (Array.isArray(cachedReel) && cachedReel.length > 0) {
              for (let i = 0; i < cachedReel.length; i++) {
                let it = cachedReel[i];
                if (!it.url) {
                  const extracted = extractMediaFromCandidateObj(it) || extractTargetReelItems([it])[0];
                  if (extracted) it = extracted;
                }
                if (!it || !it.url) continue;

                const isVid = it.type === 'video' || it.isVideo;
                const ext = isVid ? 'mp4' : 'jpg';
                const slideNumStr = String(i + 1).padStart(2, '0');
                const filename = (exportStruct === 'folders')
                  ? `Highlight/${hlFolder}/${slideNumStr}_highlight.${ext}`
                  : `Highlight/${hlFolder}_${slideNumStr}_highlight.${ext}`;

                addMediaItem({
                  type: isVid ? 'video' : 'image',
                  url: it.url,
                  category: 'highlight',
                  albumTitle: albumTitle,
                  id: it.id || `highlight_${cleanId}_${i + 1}`,
                  filename: filename,
                  timestamp: it.taken_at || Math.floor(Date.now() / 1000)
                });
              }
            }
          }
        }
      }

      // =========================================================================
      // PHẦN C: STORY 24H - Áp dụng cho mode: 'all', 'stories'
      // =========================================================================
      if (includeStories) {
        sendProgress('scanning_stories', 'Đang quét Story 24h hiện tại...', {
          currentCount: collectedMedia.length
        });

        const storyItemsFound = [];

        // 1. Kiểm tra cache từ reelMediaMap (đã được lọc nghiêm ngặt chỉ lưu story/user_reel của cleanUser)
        if (cleanUser && reelMediaMap.has(cleanUser)) {
          const r = reelMediaMap.get(cleanUser);
          if (Array.isArray(r)) {
            for (const it of r) {
              if (!it.user || it.user.toLowerCase() === cleanUser) {
                storyItemsFound.push(it);
              }
            }
          }
        }

        // 2. Fetch trang web chính thức của Story (/stories/{username}/)
        if (storyItemsFound.length === 0 && cleanUser) {
          try {
            const sRes = await originalFetch(`/stories/${encodeURIComponent(cleanUser)}/`, {
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'X-Requested-With': 'XMLHttpRequest'
              },
              credentials: 'include'
            });
            if (sRes.ok) {
              const sHtml = await sRes.text();
              const parsed = extractTargetReelItems(sHtml, null, cleanUser);
              if (parsed.length > 0) {
                for (const it of parsed) storyItemsFound.push(it);
                safeMapSet(reelMediaMap, cleanUser, parsed, 60);
              }
            }
          } catch (_) {}
        }

        // 3. Fallback: Nếu có numericUserId, thử endpoint feed user story
        if (storyItemsFound.length === 0 && numericUserId) {
          try {
            const userStoryRes = await originalFetch(`/api/v1/feed/user/${encodeURIComponent(numericUserId)}/story/`, {
              headers,
              credentials: 'include'
            });
            if (userStoryRes.ok) {
              const sJson = await userStoryRes.json();
              const parsed = extractTargetReelItems(sJson, null, cleanUser);
              if (parsed.length > 0) {
                for (const it of parsed) storyItemsFound.push(it);
                safeMapSet(reelMediaMap, cleanUser, parsed, 60);
              }
            }
          } catch (_) {}
        }

        // TUYỆT ĐỐI KHÔNG FALLBACK activeStoryVideos (vì đó là các video lướt web ngẫu nhiên và quảng cáo)!
        // Nếu người dùng không có story đang phát sóng trong 24h, danh sách này sẽ là rỗng (0 story).

        // 4. Trích xuất toàn bộ file Story tìm được
        if (storyItemsFound.length > 0) {
          for (let sIdx = 0; sIdx < storyItemsFound.length; sIdx++) {
            const sit = storyItemsFound[sIdx];
            if (cleanUser && sit.user && sit.user.toLowerCase() !== cleanUser) continue;

            // Phân biệt chính xác Video thật vs Ảnh kèm nhạc (Story photo with music)
            const isPhotoWithMusic = Boolean(
              sit.isPhotoWithMusic ||
              sit.original_media_type === 1 ||
              (sit.imageUrl && (sit.story_music_stickers || sit.has_audio))
            );

            const isVid = !isPhotoWithMusic && (sit.type === 'video' || sit.isVideo || sit.media_type === 2 || sit.is_video === true);
            let bestUrl = null;

            if (isPhotoWithMusic && sit.imageUrl) {
              bestUrl = sit.imageUrl;
            } else if (isVid) {
              bestUrl = sit.videoUrl || sit.url;
            } else {
              bestUrl = sit.imageUrl || sit.url;
            }

            if (!bestUrl && isVid && Array.isArray(sit.video_versions) && sit.video_versions.length > 0) {
              bestUrl = sit.video_versions.sort((a, b) => (((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))))[0]?.url;
            }
            if (!bestUrl && Array.isArray(sit.image_versions2?.candidates) && sit.image_versions2.candidates.length > 0) {
              bestUrl = sit.image_versions2.candidates.sort((a, b) => (((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))))[0]?.url;
            }

            if (bestUrl) {
              const finalType = isVid ? 'video' : 'image';
              const ext = finalType === 'video' ? 'mp4' : 'jpg';
              const sNum = String(sIdx + 1).padStart(2, '0');

              // Story chứa trong folder Story với format {index}_story
              const filename = `Story/${sNum}_story.${ext}`;

              addMediaItem({
                type: finalType,
                url: bestUrl,
                videoUrl: sit.videoUrl,
                imageUrl: sit.imageUrl || (finalType === 'image' ? bestUrl : null),
                category: 'story',
                id: sit.id || `story_${sIdx + 1}`,
                filename: filename,
                timestamp: sit.taken_at || Math.floor(Date.now() / 1000)
              });
            }
          }
        }
      }

      sendProgress('done', `Quét hoàn tất! Sẵn sàng tải ${collectedMedia.length} file.`, {
        currentCount: collectedMedia.length
      });

      const headerImg = document.querySelector('header img');
      window.dispatchEvent(new CustomEvent('__IG_PROFILE_MEDIA_RESULT__', {
        detail: {
          requestId,
          user: {
            id: numericUserId || 'user_' + cleanUser,
            username: cleanUser,
            fullName: document.querySelector('header span, header h1')?.textContent || cleanUser,
            avatarUrl: headerImg?.currentSrc || headerImg?.src || '',
            postCount: collectedMedia.length
          },
          items: collectedMedia
        }
      }));

    } catch (err) {
      console.error('[Profile Downloader] Error in fetchUserProfileMedia:', err);
      window.dispatchEvent(new CustomEvent('__IG_PROFILE_MEDIA_RESULT__', {
        detail: {
          requestId,
          error: 'Đã xảy ra lỗi khi quét dữ liệu: ' + (err.message || err)
        }
      }));
    }
  }

  window.addEventListener('__IG_REQUEST_PROFILE_MEDIA__', (e) => {
    const { requestId, username, options } = e.detail || {};
    fetchUserProfileMedia(requestId, username, options);
  });

  function checkCurrentStoryUrl() {
    const path = window.location.pathname;
    const highlightMatch = path.match(/\/stories\/highlights\/([^\/]+)/);
    if (highlightMatch) {
      const reelId = highlightMatch[1];
      if (!reelMediaMap.has(reelId)) {
        fetchDirectReelsMedia(reelId, '');
      }
      return;
    }

    const storyMatch = path.match(/\/stories\/([^\/]+)/);
    if (storyMatch) {
      const username = storyMatch[1];
      if (username !== 'highlights' && !reelMediaMap.has(username.toLowerCase())) {
        fetchDirectReelsMedia('', username);
      }
    }
  }

  function checkCurrentUrlPost() {
    if (window.location.pathname.includes('/reels') || window.location.pathname.includes('/reel')) return;
    const match = window.location.pathname.match(/\/p\/([A-Za-z0-9_-]+)/);
    const sc = (match && !['audio', 'videos', 'reels', 'comments', 'explore', 'stories'].includes(match[1].toLowerCase())) ? match[1] : null;
    if (!sc) return;

    const existing = discoveredTracks.get(sc) || discoveredTracks.get(`code_${sc}`);
    if (existing) {
      window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', { detail: existing }));
    } else if (noAudioSet.has(sc)) {
      dispatchNoAudio(sc);
    } else {
      fetchDirectPostMusic(sc);
    }
  }

  setTimeout(checkCurrentUrlPost, 100);
  setTimeout(checkCurrentUrlPost, 600);
  setTimeout(checkCurrentUrlPost, 1500);
  setTimeout(checkCurrentStoryUrl, 200);
  setTimeout(checkCurrentStoryUrl, 800);

  window.addEventListener('__IG_CONTENT_READY__', () => {
    for (const track of discoveredTracks.values()) {
      window.dispatchEvent(new CustomEvent('__IG_AUDIO_FOUND__', { detail: track }));
    }
    scanScriptTags();
    scanReactFibers();
    checkCurrentUrlPost();
    checkCurrentStoryUrl();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanScriptTags();
      setTimeout(scanReactFibers, 300);
      checkCurrentUrlPost();
      checkCurrentStoryUrl();
    }, { once: true });
  } else {
    scanScriptTags();
    setTimeout(scanReactFibers, 300);
    checkCurrentUrlPost();
    checkCurrentStoryUrl();
  }
})();
