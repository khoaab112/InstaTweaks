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
});
