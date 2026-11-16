/**
 * Popup Script - Quản lý cài đặt người dùng (v1.2.0)
 */

document.addEventListener('DOMContentLoaded', () => {
  const autoplayToggle = document.getElementById('autoplay-toggle');
  const loopToggle = document.getElementById('loop-toggle');
  const badgeToggle = document.getElementById('badge-toggle');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeVal = document.getElementById('volume-val');

  // Đọc cài đặt đã lưu (Mặc định autoplay là TRUE)
  chrome.storage.sync.get({
    autoplay: true,
    loop: true,
    showBadge: true,
    volume: 0.8
  }, (items) => {
    autoplayToggle.checked = items.autoplay;
    loopToggle.checked = items.loop;
    badgeToggle.checked = items.showBadge;
    
    const volPercent = Math.round(items.volume * 100);
    volumeSlider.value = volPercent;
    volumeVal.textContent = `${volPercent}%`;
  });

  // Lưu cài đặt khi thay đổi
  autoplayToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoplay: autoplayToggle.checked });
  });

  loopToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ loop: loopToggle.checked });
  });

  badgeToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ showBadge: badgeToggle.checked });
  });

  volumeSlider.addEventListener('input', () => {
    const val = parseInt(volumeSlider.value, 10);
    volumeVal.textContent = `${val}%`;
    chrome.storage.sync.set({ volume: val / 100 });
  });
});
