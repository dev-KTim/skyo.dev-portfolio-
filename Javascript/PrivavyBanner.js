document.addEventListener('DOMContentLoaded', function () {
  const banner = document.getElementById('privacy-banner');
  const okBtn = document.getElementById('privacy-banner-ok');

  if (!sessionStorage.getItem('privacyBannerAck') && banner) {
    banner.style.display = 'block';
  }

  okBtn.addEventListener('click', function () {
    sessionStorage.setItem('privacyBannerAck', '1');
    banner.style.display = 'none';
  });
});