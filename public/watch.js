const $ = (sel) => document.querySelector(sel);

const watchTitle = $('#watchTitle');
const watchSubtitle = $('#watchSubtitle');
const watchPoster = $('#watchPoster');
const qualitySelect = $('#qualitySelect');
const qualitySection = $('#qualitySection');
const downloadBtn = $('#downloadBtn');
const playerHint = $('#playerHint');
const video = $('#player');

let player = null;
let sources = [];

const SWAL_BASE = {
  confirmButtonText: 'حسناً',
};

function guessMime(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8')) return 'application/x-mpegURL';
  if (lower.includes('.webm')) return 'video/webm';
  if (lower.includes('.mkv')) return 'video/x-matroska';
  if (lower.includes('.mp4') || lower.includes('.m4v')) return 'video/mp4';
  return 'video/mp4';
}

function isLikelyStreamable(url) {
  const lower = url.toLowerCase();
  return (
    lower.includes('.mp4') ||
    lower.includes('.m4v') ||
    lower.includes('.webm') ||
    lower.includes('.m3u8') ||
    lower.includes('video') ||
    !/\.(mkv|avi|rar|zip|torrent)(\?|$)/i.test(lower)
  );
}

function initPlyr() {
  if (typeof Plyr === 'undefined') return null;
  return new Plyr(video, {
    ratio: '16:9',
    fullscreen: { enabled: true },
    controls: [
      'play-large',
      'play',
      'progress',
      'current-time',
      'mute',
      'volume',
      'settings',
      'pip',
      'airplay',
      'fullscreen',
    ],
    settings: ['quality', 'speed'],
    i18n: {
      play: 'تشغيل',
      pause: 'إيقاف',
      mute: 'كتم',
      unmute: 'إلغاء الكتم',
      enterFullscreen: 'ملء الشاشة',
      exitFullscreen: 'خروج من ملء الشاشة',
      settings: 'الإعدادات',
      speed: 'السرعة',
      quality: 'الجودة',
    },
  });
}

function setSource(index) {
  const src = sources[index];
  if (!src) return;

  qualitySelect.value = String(index);
  downloadBtn.href = src.url;

  const streamable = isLikelyStreamable(src.url);

  if (player) {
    player.stop();
    player.destroy();
    player = null;
  }

  video.removeAttribute('src');
  video.innerHTML = '';

  if (streamable) {
    const sourceEl = document.createElement('source');
    sourceEl.src = src.url;
    sourceEl.type = guessMime(src.url);
    video.appendChild(sourceEl);
    playerHint.classList.add('hidden');
    video.load();
    player = initPlyr();
    if (player) void player.play().catch(() => {});
  } else {
    playerHint.textContent =
      'هذا الرابط قد لا يُشغَّل مباشرة في المتصفح (مثل MKV). استخدم زر التحميل أو جرّب جودة أخرى.';
    playerHint.classList.remove('hidden');
    player = initPlyr();
  }

  watchSubtitle.textContent = `${src.label}${src.size ? ` — ${src.size}` : ''}`;
}

function loadWatchData() {
  let raw;
  try {
    raw = sessionStorage.getItem('akwamWatch');
  } catch {
    raw = null;
  }

  if (!raw) {
    Swal.fire({
      ...SWAL_BASE,
      icon: 'warning',
      title: 'لا توجد بيانات',
      text: 'افتح صفحة المشاهدة من نتائج البحث.',
    }).then(() => {
      window.location.href = '/';
    });
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    window.location.href = '/';
    return;
  }

  sources = (data.sources || []).filter((s) => s?.url?.startsWith('http'));
  if (!sources.length) {
    Swal.fire({
      ...SWAL_BASE,
      icon: 'error',
      title: 'لا توجد روابط',
      text: 'لم يتم العثور على روابط قابلة للتشغيل.',
    }).then(() => {
      window.location.href = '/';
    });
    return;
  }

  watchTitle.textContent = data.title || 'مشاهدة';
  watchSubtitle.textContent = data.subtitle || '';

  if (data.poster) {
    watchPoster.src = `/akwam/proxy-image?url=${encodeURIComponent(data.poster)}`;
    watchPoster.alt = data.title || '';
    watchPoster.classList.remove('hidden');
    video.setAttribute('poster', watchPoster.src);
  }

  qualitySelect.innerHTML = '';
  sources.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = s.size ? `${s.label} (${s.size})` : s.label;
    qualitySelect.appendChild(opt);
  });

  if (sources.length <= 1) {
    qualitySection.classList.add('hidden');
  }

  let startIndex = 0;
  if (data.startQuality) {
    const idx = sources.findIndex((s) => s.label === data.startQuality);
    if (idx >= 0) startIndex = idx;
  }

  setSource(startIndex);
}

qualitySelect.addEventListener('change', () => {
  setSource(Number(qualitySelect.value));
});

document.addEventListener('DOMContentLoaded', loadWatchData);
