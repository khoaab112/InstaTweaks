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

  const MAX_TRACKS_CACHE = 100;
  const MAX_NO_AUDIO_CACHE = 150;

  const discoveredTracks = new Map();
  const noAudioSet = new Set();
  const inFlightFetches = new Set();
  const postMediaMap = new Map();
  const storyMediaMap = new Map();
  const reelMediaMap = new Map();
  const capturedVideoUrls = [];
  const activeStoryVideos = [];
  let lastKnownPostDocId = localStorage.getItem('__ig_post_doc_id__') || '8845758582119845';

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
      let cleanUrl = url.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');

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

  function syncCacheToDOM() {
    try {
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
      const urlMatch = window.location.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
      if (urlMatch) code = urlMatch[1];
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
    const activePageShortcode = window.location.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
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
      const sorted = [...candidates].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      return sorted[0]?.url || sorted[0]?.src || null;
    };

    const getBestVidUrl = (versions) => {
      if (!Array.isArray(versions) || versions.length === 0) return null;
      const valid = versions.filter(v => (v.width || 0) > 0 && (v.height || 0) > 0);
      const list = valid.length > 0 ? valid : versions;
      const sorted = [...list].sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      return sorted[0]?.url || sorted[0]?.src || null;
    };

    // 1. Carousel media (REST items / v1 API)
    if (Array.isArray(post.carousel_media) && post.carousel_media.length > 0) {
      for (const item of post.carousel_media) {
        const isVid = item.media_type === 2 || item.is_video === true;
        if (isVid) {
          const vidUrl = getBestVidUrl(item.video_versions) || item.video_url;
          if (vidUrl) items.push({ type: 'video', url: vidUrl });
        } else {
          const imgUrl = getBestImgUrl(item.image_versions2?.candidates) || item.display_url;
          if (imgUrl) items.push({ type: 'image', url: imgUrl });
        }
      }
    }
    // 2. Carousel media (GraphQL edge_sidecar_to_children)
    else if (Array.isArray(post.edge_sidecar_to_children?.edges) && post.edge_sidecar_to_children.edges.length > 0) {
      for (const edge of post.edge_sidecar_to_children.edges) {
        const node = edge.node;
        if (!node) continue;
        if (node.is_video && node.video_url) {
          items.push({ type: 'video', url: node.video_url });
        } else {
          const imgUrl = getBestImgUrl(node.display_resources) || node.display_url;
          if (imgUrl) items.push({ type: 'image', url: imgUrl });
        }
      }
    }
    // 3. Bài viết đơn lẻ (Single Post):
    else {
      // Phân biệt chính xác giữa Ảnh và Video bằng media_type và is_video:
      // Lưu ý: Bài viết dạng Ảnh có gắn nhạc sticker thường có video_versions để phát nhạc ngầm,
      // nhưng media_type === 1 hoặc is_video === false -> 100% PHẢI LÀ ẢNH!
      const isExplicitImage = post.media_type === 1 || post.is_video === false || post.__typename === 'GraphImage';
      const isExplicitVideo = (post.media_type === 2 || post.is_video === true || post.__typename === 'GraphVideo') && !isExplicitImage;

      if (isExplicitImage) {
        const imgUrl = getBestImgUrl(post.image_versions2?.candidates) || getBestImgUrl(post.display_resources) || post.display_url;
        if (imgUrl) items.push({ type: 'image', url: imgUrl });
      } else if (isExplicitVideo) {
        const vidUrl = getBestVidUrl(post.video_versions) || post.video_url;
        if (vidUrl) items.push({ type: 'video', url: vidUrl });
      } else {
        // Dự phòng: Nếu có ảnh
        const imgUrl = getBestImgUrl(post.image_versions2?.candidates) || post.display_url;
        const vidUrl = getBestVidUrl(post.video_versions) || post.video_url;
        if (imgUrl && !post.is_video) {
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
          postMediaMap.set(code, mediaList);
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
      const valid = cand.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && !isDashAudioUrl(v.url || v.src));
      if (valid.length > 0) {
        const prog = valid.find(v => (v.url || v.src || '').includes('progressive'));
        const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
        const best = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src);
        if (best) videoUrl = best.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
      }
    } else if (typeof cand.video_url === 'string' && cand.video_url.startsWith('http') && !isDashAudioUrl(cand.video_url)) {
      videoUrl = cand.video_url.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
    } else if (Array.isArray(cand.video_resources) && cand.video_resources.length > 0) {
      const valid = cand.video_resources.filter(v => v && typeof (v.src || v.url) === 'string' && !isDashAudioUrl(v.src || v.url));
      if (valid.length > 0) {
        const sorted = [...valid].sort((a, b) => ((b.config_width || b.width || 0) * (b.config_height || b.height || 0)) - ((a.config_width || a.width || 0) * (a.config_height || a.height || 0)));
        const best = sorted[0]?.src || sorted[0]?.url;
        if (best) videoUrl = best.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
      }
    } else if (typeof cand.playbackUrl === 'string' && cand.playbackUrl.startsWith('http') && !isDashAudioUrl(cand.playbackUrl)) {
      videoUrl = cand.playbackUrl.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
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
      if (obj.startsWith('http') && (obj.includes('.mp4') || obj.includes('cdninstagram') || obj.includes('fbcdn')) && !isDashAudioUrl(obj)) {
        return obj.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
      }
      return null;
    }
    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      const valid = obj.video_versions.filter(v => v && typeof (v.url || v.src) === 'string' && !isDashAudioUrl(v.url || v.src));
      if (valid.length > 0) {
        const prog = valid.find(v => (v.url || v.src || '').includes('progressive'));
        const sorted = [...valid].sort((a, b) => ((b.width || b.config_width || 0) * (b.height || b.config_height || 0)) - ((a.width || a.config_width || 0) * (a.height || a.config_height || 0)));
        const best = (prog?.url || prog?.src) || (sorted[0]?.url || sorted[0]?.src);
        if (best) return best.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
      }
    }
    const directProps = [obj.video_url, obj.playbackUrl, obj.videoUrl, obj.src, obj.url];
    for (const p of directProps) {
      if (typeof p === 'string' && p.startsWith('http') && !p.startsWith('blob:') && !isDashAudioUrl(p)) {
        if (p.includes('.mp4') || p.includes('cdninstagram') || p.includes('fbcdn')) {
          return p.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
        }
      }
    }
    if (Array.isArray(obj.sources)) {
      for (const s of obj.sources) {
        const u = s?.src || s?.url;
        if (typeof u === 'string' && u.startsWith('http') && !isDashAudioUrl(u)) {
          return u.replace(/[?&]bytestart=\d+&byteend=\d+/g, '');
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

    // 1. NHẬN DIỆN REEL CONTAINER (Highlights Album hoặc Story của 1 User chứa mảng các slide items)
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

        const entry = extractMediaFromCandidateObj(it);
        if (entry) {
          entry.index = idx;
          if (!entry.user) entry.user = user;
          parsedItems.push(entry);
          if (entry.id) storyMediaMap.set(entry.id, entry);
          if (entry.rawId) storyMediaMap.set(entry.rawId, entry);
          if (entry.code) storyMediaMap.set(entry.code, entry);
        }
      }

      if (parsedItems.length > 0) {
        if (cleanReelId) reelMediaMap.set(cleanReelId, parsedItems);
        if (rawReelId) reelMediaMap.set(rawReelId, parsedItems);
        if (user) reelMediaMap.set(user, parsedItems);
      }
    }

    // 2. NHẬN DIỆN STORY ITEM ĐƠN LẺ
    const single = extractMediaFromCandidateObj(obj);
    if (single && single.id) {
      if (single.id) storyMediaMap.set(single.id, single);
      if (single.rawId) storyMediaMap.set(single.rawId, single);
      if (single.code) storyMediaMap.set(single.code, single);
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

  function processPayload(json, fallbackCode = null) {
    if (!json) return;
    try {
      const found = extractAudioTracks(json, new Map(), fallbackCode);
      for (const track of found.values()) {
        dispatchTrack(track);
      }
      extractMediaCollections(json, fallbackCode);
      extractStoryItems(json);
    } catch (_) {}
  }

  function parseMetaResponseText(text, fallbackCode = null) {
    if (!text || typeof text !== 'string') return;
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
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        processPayload(JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)), fallbackCode);
        return;
      }
    } catch (_) {}

    if (cleaned.includes('\n')) {
      const lines = cleaned.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if ((line.startsWith('{') && line.endsWith('}')) || (line.startsWith('[') && line.endsWith(']'))) {
          try {
            processPayload(JSON.parse(line), fallbackCode);
          } catch (_) {}
        }
      }
    }
  }

  function isIgnoredUrl(url) {
    if (!url || typeof url !== 'string') return true;
    if (url.includes('.jpg') || url.includes('.png') || url.includes('.webp') || url.includes('.mp4') || url.includes('.woff') || url.includes('.css') || url.includes('.js')) return true;
    if (url.includes('/ajax/bz') || url.includes('/logging/') || url.includes('metrics')) return true;
    return false;
  }

  // --- 1. Hook window.fetch ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      recordVideoUrl(url);
      if (url.includes('/graphql/query') || url.includes('/api/graphql')) {
        const bodyStr = typeof args[1]?.body === 'string' ? args[1].body : '';
        if (bodyStr.includes('doc_id=')) {
          const match = bodyStr.match(/doc_id=([0-9]+)/);
          if (match && (bodyStr.includes('shortcode') || bodyStr.includes('PolarisPost'))) {
            lastKnownPostDocId = match[1];
            localStorage.setItem('__ig_post_doc_id__', lastKnownPostDocId);
          }
        }
      }
    } catch (_) {}

    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (!isIgnoredUrl(url)) {
        response.clone().text().then(text => parseMetaResponseText(text)).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // --- 2. Hook XMLHttpRequest ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._ig_url = typeof url === 'string' ? url : '';
    recordVideoUrl(this._ig_url);
    return originalOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      const bodyStr = typeof args[0] === 'string' ? args[0] : '';
      if (bodyStr.includes('doc_id=') && (bodyStr.includes('shortcode') || bodyStr.includes('PolarisPost'))) {
        const match = bodyStr.match(/doc_id=([0-9]+)/);
        if (match) {
          lastKnownPostDocId = match[1];
          localStorage.setItem('__ig_post_doc_id__', lastKnownPostDocId);
        }
      }
    } catch (_) {}

    if (!isIgnoredUrl(this._ig_url)) {
      this.addEventListener('load', function () {
        try {
          if (this.responseText) {
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

  // --- 4. Quét thẻ Script SSR ---
  function scanScriptTags() {
    try {
      const scripts = document.querySelectorAll('script[type="application/json"], script[data-sjs], script:not([src])');
      scripts.forEach(script => {
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
      });
    } catch (_) {}
  }

  // --- 5. Quét React Fiber ---
  function scanReactFibers() {
    try {
      const targets = document.querySelectorAll('article, main, section, div[role="dialog"]');
      targets.forEach(el => {
        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!fiberKey) return;

        let cur = el[fiberKey];
        let depth = 0;
        while (cur && depth < 30) {
          depth++;
          if (cur.memoizedProps) processPayload(cur.memoizedProps);
          if (cur.memoizedState) processPayload(cur.memoizedState);
          cur = cur.return;
        }
      });
    } catch (_) {}
  }

  // --- 6. CHỦ ĐỘNG TRUY VẤN MEDIA KHI MỞ TRỰC TIẾP QUA URL HOẶC VIEWPORT ---
  async function fetchDirectPostMusic(shortcode) {
    if (!shortcode) return;

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

    scanReactFibers();
    scanScriptTags();

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

    scanReactFibers();
    scanScriptTags();

    if (postMediaMap.has(shortcode)) {
      window.dispatchEvent(new CustomEvent('__IG_POST_MEDIA_FOUND__', {
        detail: { shortcode, items: postMediaMap.get(shortcode) }
      }));
      return;
    }

    await fetchDirectPostMusic(shortcode);

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
        const res = await originalFetch(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(targetReelId)}`, {
          headers,
          credentials: 'include'
        });
        if (res.ok) {
          const json = await res.json();
          processPayload(json);
          const items = reelMediaMap.get(cleanReel) || reelMediaMap.get(targetReelId);
          if (items && items.length > 0) {
            inFlightReelFetches.delete(fetchKey);
            return items;
          }
        }
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
    const sc = window.location.pathname.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
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
