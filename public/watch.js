const $ = (sel) => document.querySelector(sel);

const watchTitle = $("#watchTitle");
const watchSubtitle = $("#watchSubtitle");
const watchPoster = $("#watchPoster");
const qualitySection = $("#qualitySection");
const downloadBtn = $("#downloadBtn");
const playerHint = $("#playerHint");
const video = $("#player");

let player = null;
let sources = [];
let currentIndex = 0;
let errorCount = 0;
let retryTimer = null;
let blobUrlCache = {};
let data = null;

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function qualitySize(label = "") {
  const n = (label || "").match(/(\d{3,4})/);
  if (n) return parseInt(n[1], 10);
  if (/4k|2160/i.test(label)) return 2160;
  if (/fhd/i.test(label)) return 1080;
  if (/hd/i.test(label)) return 720;
  return 0;
}

function isNonStreamable(url) {
  return /\.(mkv|avi|rar|zip|torrent)(\?|$)/i.test(url.toLowerCase());
}

function showHint(msg) {
  playerHint.textContent = msg;
  playerHint.classList.remove("hidden");
}
function hideHint() {
  playerHint.classList.add("hidden");
}

/* ─────────────────────────────────────────────
   POSTER HELPER
   
   We ONLY use the native <video poster="..."> attribute.
   Plyr's own .plyr__poster overlay is hidden via CSS
   (display:none) to avoid the fullscreen escape bug.
   
   The browser always renders the native poster correctly
   inside the video rect — it never escapes in FS.
───────────────────────────────────────────── */

function applyPoster(posterUrl) {
  if (!posterUrl || !player?.media) return;
  player.media.setAttribute("poster", posterUrl);
}

/* ─────────────────────────────────────────────
   BLOB FALLBACK
───────────────────────────────────────────── */

async function tryBlob(url) {
  if (blobUrlCache[url]) return blobUrlCache[url];
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobUrlCache[url] = objectUrl;
    return objectUrl;
  } catch {
    return null;
  }
}

function revokeAllBlobs() {
  Object.values(blobUrlCache).forEach(URL.revokeObjectURL.bind(URL));
  blobUrlCache = {};
}

/* ─────────────────────────────────────────────
   CORE SOURCE HANDLER
───────────────────────────────────────────── */

async function applySource(index, preserveTime) {
  const src = sources[index];
  if (!src) return;

  currentIndex = index;
  downloadBtn.href = src.url;
  downloadBtn.download = "";
  watchSubtitle.textContent = src.label + (src.size ? ` — ${src.size}` : "");

  if (isNonStreamable(src.url)) {
    showHint("هذا الرابط لا يُشغَّل مباشرةً في المتصفح. استخدم زر التحميل.");
    return;
  }

  hideHint();

  const media = player.media;
  const savedTime = preserveTime ? media.currentTime : 0;
  const wasPlaying = preserveTime ? !media.paused : true;

  media.pause();
  media.removeAttribute("src");

  // Re-set poster before load() so it shows during buffering
  if (data._poster) media.setAttribute("poster", data._poster);

  media.load();

  function onCanPlay() {
    if (savedTime > 1) media.currentTime = savedTime;
    if (wasPlaying) player.play().catch(() => {});
  }

  media.addEventListener("canplay", onCanPlay, { once: true });

  async function onMediaError() {
    media.removeEventListener("canplay", onCanPlay);
    showHint(`جارٍ محاولة طريقة بديلة لـ "${src.label}"…`);
    const blobUrl = await tryBlob(src.url);
    if (blobUrl) {
      hideHint();
      if (data._poster) media.setAttribute("poster", data._poster);
      media.src = blobUrl;
      media.load();
      media.addEventListener("canplay", onCanPlay, { once: true });
      media.addEventListener("error", handleError, { once: true });
    } else {
      handleError();
    }
  }

  media.addEventListener("error", onMediaError, { once: true });

  media.src = src.url;
  media.load();

  const sz = qualitySize(src.label);
  if (sz) {
    try {
      player.quality = sz;
    } catch {}
  }
}

/* ─────────────────────────────────────────────
   ERROR HANDLER
───────────────────────────────────────────── */

function handleError() {
  clearTimeout(retryTimer);
  errorCount++;

  if (errorCount >= sources.length) {
    showHint("تعذّر تشغيل جميع الروابط المتاحة.");
    errorCount = 0;
    return;
  }

  const next = (currentIndex + 1) % sources.length;
  showHint(
    `فشل تحميل "${sources[currentIndex].label}" — جارٍ تجربة "${sources[next].label}"…`,
  );

  retryTimer = setTimeout(() => {
    hideHint();
    applySource(next, false);
  }, 1200);
}

/* ─────────────────────────────────────────────
   PLYR INIT
───────────────────────────────────────────── */

function buildPlyr(startIndex) {
  const sizes = sources.map((s) => qualitySize(s.label));
  const unique = [...new Set(sizes)].filter(Boolean).sort((a, b) => b - a);
  const multi = sources.length > 1 && unique.length > 1;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const nativeFS =
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled;

  const opts = {
    ratio: "16:9",
    fullscreen: {
      enabled: true,
      fallback: !nativeFS,
      iosNative: isIOS,
    },
    keyboard: { focused: true, global: false },
    tooltips: { controls: false, seek: true },
    controls: [
      "play-large",
      "play",
      "progress",
      "current-time",
      "mute",
      "volume",
      "settings",
      "pip",
      "airplay",
      "fullscreen",
    ],
    settings: multi ? ["quality", "speed"] : ["speed"],
  };

  if (multi) {
    opts.quality = {
      default: sizes[startIndex] || unique[0],
      options: unique,
      forced: true,
      onChange(q) {
        const idx = sizes.indexOf(q);
        if (idx >= 0 && idx !== currentIndex) {
          errorCount = 0;
          clearTimeout(retryTimer);
          applySource(idx, true);
        }
      },
    };
  }

  player = new Plyr(video, opts);
  player.on("error", handleError);

  applySource(startIndex, false);
}

/* ─────────────────────────────────────────────
   LOAD DATA
───────────────────────────────────────────── */

function loadWatchData() {
  let raw;
  try {
    raw = sessionStorage.getItem("akwamWatch");
  } catch {
    raw = null;
  }

  if (!raw) return (location.href = "/");

  try {
    data = JSON.parse(raw);
  } catch {
    return (location.href = "/");
  }

  sources = (data.sources || []).filter((s) => s?.url?.startsWith("http"));
  if (!sources.length) return (location.href = "/");

  watchTitle.textContent = data.title || "مشاهدة";
  watchSubtitle.textContent = data.subtitle || "";

  if (data.poster) {
    const proxyUrl = `/akwam/proxy-image?url=${encodeURIComponent(data.poster)}`;
    data._poster = proxyUrl;
    watchPoster.src = proxyUrl;
    watchPoster.classList.remove("hidden");
    // Pre-set BEFORE Plyr wraps the element
    video.setAttribute("poster", proxyUrl);
  }

  qualitySection.classList.add("hidden");

  let startIndex = 0;
  if (data.startQuality) {
    const idx = sources.findIndex((s) => s.label === data.startQuality);
    if (idx >= 0) startIndex = idx;
  }

  buildPlyr(startIndex);
}

window.addEventListener("beforeunload", revokeAllBlobs);
document.addEventListener("DOMContentLoaded", loadWatchData);
