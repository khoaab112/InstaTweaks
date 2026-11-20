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