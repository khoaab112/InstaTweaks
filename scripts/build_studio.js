const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ensureCoreComplete } = require('./restore_tail');
const { patchWatermark } = require('./patch_watermark');
const { patchFilterReset } = require('./patch_filter_reset');
const { patchTabStickers } = require('./patch_tab_stickers');
const { patchExportVideo } = require('./patch_export_video');
const { patchAudioPlaybackSync } = require('./patch_audio_playback_sync');
const { patchSlideReorderCleanup } = require('./patch_slide_reorder_cleanup');
const { patchRecommendedRatio } = require('./patch_recommended_ratio');
const { patchLiveTimelineSync } = require('./patch_live_timeline_sync');
const { patchTextDrag } = require('./patch_text_drag');
const { patchPostAndStoryMechanisms } = require('./patch_post_and_story_mechanisms');
const { patchFitModeReset } = require('./patch_fit_mode_reset');

ensureCoreComplete();
let fullCode = fs.readFileSync('scripts/studio_core.js', 'utf8');
fullCode = patchWatermark(fullCode);
fullCode = patchFilterReset(fullCode);
fullCode = patchTabStickers(fullCode);
fullCode = patchExportVideo(fullCode);
fullCode = patchAudioPlaybackSync(fullCode);
fullCode = patchSlideReorderCleanup(fullCode);
fullCode = patchLiveTimelineSync(fullCode);
fullCode = patchTextDrag(fullCode);
fullCode = patchPostAndStoryMechanisms(fullCode);
fullCode = patchFitModeReset(fullCode);

// 1. Cập nhật loadAudioFile để khởi tạo và render ngay trên khay Timeline không bị trễ/nghẽn CSP
const loadAudioTarget = '  function loadAudioFile(file, customName) {';
const playPresetTarget = '  function playAudioPreset(presetKey) {';
const laIdx = fullCode.indexOf(loadAudioTarget);
const ppIdx = fullCode.indexOf(playPresetTarget);

if (laIdx !== -1 && ppIdx !== -1) {
  const completeLoadAudioFn = `  function loadAudioFile(file, customName) {
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
  }\n\n`;

  fullCode = fullCode.slice(0, laIdx) + completeLoadAudioFn + fullCode.slice(ppIdx);
  console.log('1. Updated loadAudioFile with instant timeline render and error resilience!');
}

// 2. Kiểm tra và áp dụng ẩn Thời lượng ảnh khi ở chế độ Post
const oldDurBlock = `        <!-- 1. Thời lượng ảnh trên Story Timeline -->
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div class="igt-studio-setting-title" style="margin: 0;">⏱️ THỜI LƯỢNG ẢNH TRÊN STORY</div>
            <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">\${studioState.imageDuration || 15} giây</span>
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px; line-height: 1.35;">
            Thời gian ảnh chạy trên dòng thời gian Story để ghép nhạc nền:
          </div>
          <div class="igt-photo-dur-grid">
            <button type="button" class="igt-photo-dur-pill \${(studioState.imageDuration === 5) ? 'active' : ''}" data-dur="5">⚡ 5s (Nhanh)</button>
            <button type="button" class="igt-photo-dur-pill \${(studioState.imageDuration === 10) ? 'active' : ''}" data-dur="10">⏱️ 10s</button>
            <button type="button" class="igt-photo-dur-pill \${(studioState.imageDuration === 15 || !studioState.imageDuration) ? 'active' : ''}" data-dur="15">📸 15s (Story IG)</button>
            <button type="button" class="igt-photo-dur-pill \${(studioState.imageDuration === 30) ? 'active' : ''}" data-dur="30">🎬 30s (Reel)</button>
          </div>
        </div>`;

const newDurBlock = `        <!-- 1. Thời lượng ảnh trên Story Timeline (Ẩn khi ở chế độ Post) -->
        \${studioState.mode === 'post' ? '' : \`
        <div class="igt-studio-setting-group">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div class="igt-studio-setting-title" style="margin: 0;">⏱️ THỜI LƯỢNG ẢNH TRÊN STORY</div>
            <span style="font-size: 11px; color: #38bdf8; font-weight: 700;">\\\${studioState.imageDuration || 15} giây</span>
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-bottom: 6px; line-height: 1.35;">
            Thời gian ảnh chạy trên dòng thời gian Story để ghép nhạc nền:
          </div>
          <div class="igt-photo-dur-grid">
            <button type="button" class="igt-photo-dur-pill \\\${(studioState.imageDuration === 5) ? 'active' : ''}" data-dur="5">⚡ 5s (Nhanh)</button>
            <button type="button" class="igt-photo-dur-pill \\\${(studioState.imageDuration === 10) ? 'active' : ''}" data-dur="10">⏱️ 10s</button>
            <button type="button" class="igt-photo-dur-pill \\\${(studioState.imageDuration === 15 || !studioState.imageDuration) ? 'active' : ''}" data-dur="15">📸 15s (Story IG)</button>
            <button type="button" class="igt-photo-dur-pill \\\${(studioState.imageDuration === 30) ? 'active' : ''}" data-dur="30">🎬 30s (Reel)</button>
          </div>
        </div>
        \`}`;

if (fullCode.includes(oldDurBlock)) {
  fullCode = fullCode.replace(oldDurBlock, newDurBlock);
  console.log('2. Replaced oldDurBlock with conditional block!');
}

// 3. Cập nhật IG_MUSIC_CATALOG với audioUrl thật
const matchedSongs = JSON.parse(fs.readFileSync(path.join(__dirname, 'studio_parts', 'matched_songs.json'), 'utf8'));

const updatedCatalogStr = `  const IG_MUSIC_CATALOG = ` + JSON.stringify(matchedSongs.map(s => ({
  id: s.id,
  title: s.title,
  artist: s.artist,
  cover: s.cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80',
  audioUrl: s.audioUrl || '',
  audioAssetId: s.audioAssetId || s.id.replace('ig_mus_', '10928374'),
  duration: 30,
  preset: s.preset || 'trending',
  categories: ['for_you', 'trending', (s.id === 'ig_mus_3' || s.id === 'ig_mus_5' || s.id === 'ig_mus_8' || s.id === 'ig_mus_10') ? 'ambient' : 'trending']
})), null, 4) + `;\n`;

const catStartMarker = '  const IG_MUSIC_CATALOG = [';
const catStartIdx = fullCode.indexOf(catStartMarker);
const catEndIdx = fullCode.indexOf('];', catStartIdx);

if (catStartIdx !== -1 && catEndIdx !== -1) {
  fullCode = fullCode.slice(0, catStartIdx) + updatedCatalogStr + fullCode.slice(catEndIdx + 2);
  console.log('3. Successfully replaced IG_MUSIC_CATALOG with real audio URLs!');
}

// 4. Thêm hàm fetchLiveMusic và live music manager
const liveMusicHelper = `
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
      const itunesRes = await fetch(\`https://itunes.apple.com/search?term=\${encodeURIComponent(term)}&entity=song&limit=\${limit}&country=VN\`);
      if (itunesRes.ok) {
        const iData = await itunesRes.json();
        if (Array.isArray(iData.results) && iData.results.length > 0) {
          return iData.results;
        }
      }
    } catch (_) {}

    // 3. Fallback direct fetch toàn cầu nếu kho VN ít
    try {
      const itunesRes2 = await fetch(\`https://itunes.apple.com/search?term=\${encodeURIComponent(term)}&entity=song&limit=\${limit}\`);
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
    const cacheKey = \`\${category}__\${(query || '').trim().toLowerCase()}\`;

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
      const key = \`\${t.title.toLowerCase().trim()}__\${t.artist.toLowerCase().trim()}\`;
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
      const todayStr = \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}-\${String(now.getDate()).padStart(2, '0')}\`;
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
`;

const rtcMarker = "  function renderTabContent(tab) {";
const rtcIdx = fullCode.indexOf(rtcMarker);

const oldHelperMarker = "  let musicSearchDebounce = null;";
const oldHelperIdx = fullCode.indexOf(oldHelperMarker);

if (oldHelperIdx !== -1 && rtcIdx !== -1 && oldHelperIdx < rtcIdx) {
  fullCode = fullCode.slice(0, oldHelperIdx).trimEnd() + '\n\n' + liveMusicHelper + '\n\n' + fullCode.slice(rtcIdx);
  console.log('4. Replaced existing fetchLiveMusic helper before renderTabContent!');
} else if (rtcIdx !== -1) {
  fullCode = fullCode.slice(0, rtcIdx).trimEnd() + '\n\n' + liveMusicHelper + '\n\n' + fullCode.slice(rtcIdx);
  console.log('4. Inserted fetchLiveMusic helper before renderTabContent!');
}

// 5. Thay thế toàn bộ khối xử lý tab === 'music' với engine âm thanh thật và live trending
const musicTabBlockStart = "} else if (tab === 'music') {";
const musicTabBlockEnd = "  function setRatio(ratioKey, pushHistory = true) {";

const mStart = fullCode.indexOf(musicTabBlockStart);
const mEnd = fullCode.indexOf(musicTabBlockEnd, mStart);

const newMusicTabCode = `} else if (tab === 'music') {
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
          const clean = studioState.audioName.replace(/\.(mp3|wav|m4a|aac)$/i, '');
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

      container.innerHTML = \`
        <div class="igt-inssist-music-container">
          <!-- 1. Thanh tìm kiếm phong cách INSSIST -->
          <div class="igt-inssist-search-box">
            <span class="igt-inssist-search-icon">🔍</span>
            <input type="text" id="igt-inssist-music-search-input" class="igt-inssist-search-input" placeholder="Tìm kiếm bài hát trên Instagram..." value="\${escapeHtml(studioState.musicSearchQuery || '')}" />
            <span class="igt-inssist-help-icon" title="Kho nhạc thịnh hành trực tiếp từ Instagram Reels & Story">❔</span>
          </div>

          <!-- 2. Hàng phân loại Tabs ngang: For you, Trending, Ambient, Upload, Saved -->
          <div class="igt-inssist-tabs-nav">
            <button type="button" class="igt-inssist-tab-btn \${activeCat === 'for_you' ? 'active' : ''}" data-cat="for_you">For you</button>
            <button type="button" class="igt-inssist-tab-btn \${activeCat === 'trending' ? 'active' : ''}" data-cat="trending">Trending</button>
            <button type="button" class="igt-inssist-tab-btn \${activeCat === 'ambient' ? 'active' : ''}" data-cat="ambient">Ambient</button>
            <button type="button" class="igt-inssist-tab-btn \${activeCat === 'upload' ? 'active' : ''}" data-cat="upload">Upload</button>
            <button type="button" class="igt-inssist-tab-btn \${activeCat === 'saved' ? 'active' : ''}" data-cat="saved">Saved (\${savedIds.length})</button>
          </div>

          <!-- 3. Khu vực bài hát đang nạp vào Timeline (Thiết kế thanh lịch chuẩn Instagram - Ảnh 1 & Ảnh 2) -->
          \${studioState.audioUrl ? \`
            <div class="igt-active-music-bar" style="flex-direction: column !important; align-items: stretch !important; gap: 8px !important;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;">
                <div class="igt-active-music-left">
                  <!-- Ảnh bìa tích hợp nút Play đè lên giữa -->
                  <div class="igt-active-music-cover-wrap \${studioState.isVideoPlaying ? 'is-playing' : ''}" id="igt-btn-toggle-timeline-audio" title="\${studioState.isVideoPlaying ? 'Tạm dừng nghe' : 'Phát nghe thử bài hát'}">
                    <img class="igt-active-music-cover" src="\${escapeHtml(activeCoverUrl)}" alt="Cover" />
                    <div class="igt-active-music-play-badge">
                      \${studioState.isVideoPlaying ? '⏸' : '▶'}
                    </div>
                  </div>
                  <!-- Thông tin: Tên bài & Nghệ sĩ -->
                  <div class="igt-active-music-info">
                    <div class="igt-active-music-title" title="\${escapeHtml(activeTitle)}">\${escapeHtml(activeTitle)}</div>
                    <div class="igt-active-music-artist" title="\${escapeHtml(activeArtist)}">\${escapeHtml(activeArtist)}</div>
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
                <button type="button" class="igt-music-part-pill \${activePart === 'part1' ? 'active' : ''}" data-part="part1" title="Điệp khúc 1 (\${formatTime(audioPartTimes.part1)})">PART 1</button>
                <button type="button" class="igt-music-part-pill \${activePart === 'part2' ? 'active' : ''}" data-part="part2" title="Điệp khúc 2 (\${formatTime(audioPartTimes.part2)})">PART 2</button>
                <button type="button" class="igt-music-part-pill \${activePart === 'part3' ? 'active' : ''}" data-part="part3" title="Cao trào (\${formatTime(audioPartTimes.part3)})">PART 3</button>
                <button type="button" class="igt-music-part-pill \${activePart === 'custom' ? 'active' : ''}" data-part="custom" title="Tùy chỉnh điểm phát bắt đầu">CUSTOM</button>
                <span style="font-size: 10px; color: #38bdf8; font-weight: 700; margin-left: auto;">Bắt đầu: \${formatTime(studioState.audioStart || 0)}</span>
              </div>

              <!-- Thanh trượt tùy chỉnh Custom Scrubber khi chọn CUSTOM -->
              \${(activePart === 'custom') ? \`
                <div class="igt-music-custom-scrubber" style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px; margin-top: 2px;">
                  <span style="white-space: nowrap; font-size: 10.5px;">Điểm phát:</span>
                  <input type="range" id="igt-music-custom-slider" min="0" max="\${maxScrub}" step="0.5" value="\${studioState.audioStart || 0}" style="flex: 1; accent-color: #0095f6; cursor: pointer; height: 4px;" />
                  <span id="igt-music-custom-val" style="color: #38bdf8; font-weight: 700; font-size: 10.5px; min-width: 36px; text-align: right;">\${formatTime(studioState.audioStart || 0)}</span>
                </div>
              \` : ''}
            </div>
          \` : ''}

          <!-- Trạng thái đang tải live tracks -->
          \${studioState.isFetchingMusic ? \`
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.05); border-radius: 8px;">
              <span>⏳</span>
              <span>Đang cập nhật bài hát thịnh hành từ Instagram...</span>
            </div>
          \` : ''}

          <!-- 4. Nội dung theo từng Tab -->
          \${activeCat === 'upload' ? \`
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
          \` : (activeCat === 'saved' && filteredSongs.length === 0) ? \`
            <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
              <div style="margin-bottom: 8px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style="font-size: 12.5px; font-weight: 600; color: #cbd5e1;">Chưa có bài hát nào được lưu</div>
              <div style="font-size: 11px; margin-top: 4px; color: #64748b;">Bấm biểu tượng dấu lưu bên cạnh bài hát bất kỳ để lưu vào đây.</div>
            </div>
          \` : (filteredSongs.length === 0) ? \`
            <div style="text-align: center; padding: 32px 16px; color: #94a3b8;">
              <div style="font-size: 24px; margin-bottom: 6px;">🔍</div>
              <div style="font-size: 12px; color: #cbd5e1;">Không tìm thấy bài hát phù hợp với "\${escapeHtml(searchQ)}"</div>
            </div>
          \` : \`
            <!-- Danh sách bài hát chuẩn Instagram INSSIST với nút Play tích hợp thẳng trên bìa (Ảnh 1) -->
            <div class="igt-inssist-song-list">
              \${filteredSongs.map(song => {
        const isPlaying = (studioState.previewPlayingId === song.id);
        const isSaved = savedIds.includes(song.id);
        const isCurrentlyUsed = (studioState.audioName && studioState.audioName.includes(song.title));
        return \`
                  <div class="igt-inssist-song-item \${isPlaying ? 'is-playing' : ''}" data-song-id="\${song.id}">
                    <!-- TÍCH HỢP NÚT PLAY VÀO PHẦN ẢNH BÌA LUÔN (Ảnh 1) -->
                    <div class="igt-inssist-cover-wrap btn-play-song" data-song-id="\${song.id}" title="\${isPlaying ? 'Tạm dừng' : 'Nghe thử âm thanh thật'}">
                      <img class="igt-inssist-song-cover" src="\${escapeHtml(song.cover || 'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'42\\\' height=\\\'42\\\' viewBox=\\\'0 0 42 42\\\'><rect width=\\\'42\\\' height=\\\'42\\\' fill=\\\'%231e293b\\\'/><text x=\\\'50%\\\' y=\\\'55%\\\' dominant-baseline=\\\'middle\\\' text-anchor=\\\'middle\\\' fill=\\\'%2338bdf8\\\' font-size=\\\'18\\\'>🎵</text></svg>')}" alt="\${escapeHtml(song.title)}" />
                      <div class="igt-inssist-cover-play-badge">
                        \${isPlaying ? '⏸' : '▶'}
                      </div>
                    </div>

                    <div class="igt-inssist-song-meta">
                      <div class="igt-inssist-song-title" title="\${escapeHtml(song.title)}">\${escapeHtml(song.title)}</div>
                      <div class="igt-inssist-song-artist" title="\${escapeHtml(song.artist)}">\${escapeHtml(song.artist)}</div>
                    </div>

                    <div class="igt-inssist-song-actions">
                      <!-- Nút Lưu (Bookmark chuẩn Instagram - Ảnh 2) -->
                      <button type="button" class="btn-toggle-save-song" data-song-id="\${song.id}" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="\${isSaved ? 'Bỏ lưu' : 'Lưu bài hát'}">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="\${isSaved ? '#38bdf8' : 'none'}" stroke="\${isSaved ? '#38bdf8' : '#94a3b8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.15s ease, stroke 0.15s ease, fill 0.15s ease;">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                        </svg>
                      </button>
                      <!-- Nút Sử dụng bài hát -->
                      <button type="button" class="igt-inssist-btn-use btn-use-song" data-song-id="\${song.id}" style="\${isCurrentlyUsed ? 'background: #0284c7; color: #fff;' : ''}">
                        \${isCurrentlyUsed ? '✓ Đang dùng' : 'Dùng'}
                      </button>
                    </div>
                  </div>
                \`;
      }).join('')}
            </div>
          \`}
        </div>
      \`;

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

          const title = \`\${song.title} - \${song.artist}.mp3\`;
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
`;

if (mStart !== -1 && mEnd !== -1) {
  fullCode = fullCode.slice(0, mStart) + newMusicTabCode + '\n\n' + fullCode.slice(mEnd);
  console.log('5. Replaced tab === music with complete real audio engine!');
}

fullCode = patchRecommendedRatio(fullCode);

// 6. Cắt tại dòng cutMarker trong drawStickersOnExportCanvas và ghép đuôi hoàn chỉnh
const cutMarker = "ctx.fillText(s.question || 'Mức độ thích?', 0, -cardH / 2 + Math.round(18 * scale));";
const cutIdx = fullCode.indexOf(cutMarker);
if (cutIdx === -1) {
  console.error('cutMarker not found!');
  process.exit(1);
}

const head = fullCode.slice(0, cutIdx + cutMarker.length);

// Đuôi của drawStickersOnExportCanvas
const stickersTail = `

        // Track
        const trkW = Math.round(150 * scale);
        const trkH = Math.round(8 * scale);
        const grad = ctx.createLinearGradient(-trkW / 2, 0, trkW / 2, 0);
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(1, '#ec4899');
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, -trkW / 2, Math.round(12 * scale), trkW, trkH, Math.round(4 * scale));
        ctx.fill();

        ctx.font = \`\${Math.round(20 * scale)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif\`;
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
        ctx.font = \`bold \${Math.round(10 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📷 LƯỢT TIẾP THEO', 0, -cardH / 2 + Math.round(16 * scale));

        ctx.fillStyle = '#0f172a';
        ctx.font = \`bold \${Math.round(11 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif\`;
        ctx.fillText(s.prompt || 'Chia sẻ ảnh đẹp của bạn', 0, Math.round(10 * scale));
      }

      ctx.restore();
    });
  }
`;

// Các hàm Direct API từ step 11080
const directApiFns = fs.readFileSync(path.join(__dirname, 'studio_parts', 'step_11080_replacement.js'), 'utf8');

// Modal xuất bản
let openPublishModalCode = fs.readFileSync(path.join(__dirname, 'studio_parts', 'full_open_publish_modal.js'), 'utf8').trim();
if (openPublishModalCode.endsWith('// Phím tắt ESC đóng Studio')) {
  openPublishModalCode = openPublishModalCode.substring(0, openPublishModalCode.lastIndexOf('// Phím tắt ESC đóng Studio')).trim();
}

// Export API và đóng IIFE
const exportAndCloseCode = `
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
`;

const completeCode = head + stickersTail + '\n\n' + directApiFns + '\n\n' + openPublishModalCode + '\n\n' + exportAndCloseCode;

try {
  new vm.Script(completeCode, { filename: 'scripts/studio_core.js' });
  console.log('7. VM SYNTAX CHECK: 100% SUCCESS!');
  fs.writeFileSync('scripts/studio_core.js', completeCode, 'utf8');
  console.log('8. Successfully written complete studio_core.js to disk! Length:', completeCode.length);
} catch (e) {
  const cLines = completeCode.split('\n');
  const lineNo = e.stack.match(/studio_core\.js:(\d+)/)?.[1];
  if (lineNo) {
    const ln = parseInt(lineNo, 10);
    console.error('Lines around error:\n', cLines.slice(Math.max(0, ln - 10), ln + 10).map((l, i) => (ln - 9 + i) + ': ' + l).join('\n'));
  }
  console.error('7. VM Syntax Check failed:', e.stack);
  process.exit(1);
}
