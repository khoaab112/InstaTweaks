// scripts/background.js - Background Service Worker for Native Chrome Downloads
chrome.runtime.onInstalled.addListener(() => {
  console.log('[InstaTweaks] Background Service Worker đã khởi chạy.');
});

// Lắng nghe các yêu cầu tải file trực tiếp qua chrome.downloads API
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download_file') {
    const { url, filename } = message;
    if (!url) {
      sendResponse({ success: false, error: 'URL không hợp lệ' });
      return false;
    }

    try {
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.warn('[InstaTweaks] Download error:', chrome.runtime.lastError.message, filename);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      });
    } catch (err) {
      console.warn('[InstaTweaks] Download exception:', err, filename);
      sendResponse({ success: false, error: err.message });
    }

    return true; // Giữ channel mở để sendResponse async
  }

  if (message.action === 'open_downloads_folder') {
    try {
      chrome.downloads.showDefaultFolder();
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (message.action === 'reload_extension') {
    console.log('[InstaTweaks] Reloading extension via chrome.runtime.reload()...');
    chrome.runtime.reload();
    sendResponse({ success: true });
    return true;
  }

  // Thông báo Desktop Notification chuẩn của Windows / Chrome (Ảnh 1)
  if (message.action === 'show_desktop_notification') {
    const { title, text, sender } = message;
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: title || '⚠️ [InstaTweaks] Tin nhắn vừa bị thu hồi!',
        message: text ? `${sender || 'Đối phương'}: "${text}"` : `${sender || 'Đối phương'} vừa thu hồi một tin nhắn!`,
        priority: 2,
        requireInteraction: true
      });
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  // Tải ảnh hoặc âm thanh ngoài dạng Data URL (vượt qua kiểm tra Content Security Policy của Instagram)
  if (message.action === 'fetch_image_as_data_url' || message.action === 'fetch_audio_as_data_url') {
    const { url } = message;
    if (!url) {
      sendResponse({ success: false, error: 'Empty URL' });
      return false;
    }
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cType = res.headers.get('content-type') || '';
        return res.arrayBuffer().then(buf => ({ buf, cType }));
      })
      .then(({ buf, cType }) => {
        let mime = 'audio/mp4';
        if (message.action === 'fetch_image_as_data_url') {
          mime = cType.includes('png') ? 'image/png' : (cType.includes('webp') ? 'image/webp' : 'image/jpeg');
        } else {
          // Chuẩn hóa mọi âm thanh Apple/iTunes (audio/x-m4p, audio/aac, audio/m4a) về audio/mp4 chuẩn để Chrome giải mã
          if (cType.includes('mpeg') || cType.includes('mp3')) mime = 'audio/mpeg';
          else if (cType.includes('wav')) mime = 'audio/wav';
          else mime = 'audio/mp4';
        }
        const blob = new Blob([buf], { type: mime });
        const reader = new FileReader();
        reader.onloadend = () => {
          let dataUrl = reader.result;
          if (typeof dataUrl === 'string' && dataUrl.startsWith('data:audio/x-m4p')) {
            dataUrl = dataUrl.replace('data:audio/x-m4p', 'data:audio/mp4');
          }
          sendResponse({ success: true, dataUrl, mime });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'FileReader error' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(err => {
        console.warn('[InstaTweaks Background] Fetch media error:', err.message, url);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  // Proxy tìm kiếm bài hát Apple Music / iTunes API (hoàn toàn miễn nhiễm với CSP connect-src của Instagram)
  if (message.action === 'proxy_itunes_search') {
    const { term, limit = 50, entity = 'song', country = 'VN' } = message;
    const apiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term || '')}&entity=${entity}&limit=${limit}&country=${country}`;
    
    fetch(apiUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.results) && data.results.length > 0) {
          sendResponse({ success: true, results: data.results });
        } else {
          // Retry tìm kiếm toàn cầu nếu kho VN ít bài
          return fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term || '')}&entity=${entity}&limit=${limit}`)
            .then(r2 => r2.json())
            .then(d2 => sendResponse({ success: true, results: (d2 && d2.results) || [] }));
        }
      })
      .catch(err => {
        // Fallback retry không kèm country code
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term || '')}&entity=${entity}&limit=${limit}`)
          .then(r => r.json())
          .then(d => sendResponse({ success: true, results: (d && d.results) || [] }))
          .catch(e => sendResponse({ success: false, error: e.message, results: [] }));
      });
    return true;
  }
});
