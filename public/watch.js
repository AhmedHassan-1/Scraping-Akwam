const $ = (sel) => document.querySelector(sel);

const watchTitle = $("#watchTitle");
const watchSubtitle = $("#watchSubtitle");
const watchPoster = $("#watchPoster");
const qualitySection = $("#qualitySection");
const qualitySelect = $("#qualitySelect");
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
  if (/fhd|1080/i.test(label)) return 1080;
  if (/hd|720/i.test(label)) return 720;
  if (/480/i.test(label)) return 480;
  return 0;
}

function isNonStreamable(url) {
  return /\.(mkv|avi|rar|zip|torrent)(\?|$)/i.test(url.toLowerCase());
}

function showHint(msg) {
  if (!playerHint) return;
  playerHint.textContent = msg;
  playerHint.classList.remove("hidden");
}
function hideHint() {
  if (!playerHint) return;
  playerHint.classList.add("hidden");
}

/* ─────────────────────────────────────────────
   BLOB FALLBACK
───────────────────────────────────────────── */

async function tryBlob(url) {
  if (blobUrlCache[url]) return blobUrlCache[url];
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
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
   Plays the direct download MP4 URL in Plyr / HTML5
   and assigns the exact same link to downloadBtn
───────────────────────────────────────────── */

async function applySource(index, preserveTime) {
  const src = sources[index];
  if (!src) return;

  currentIndex = index;
  if (downloadBtn) {
    downloadBtn.href = src.url;
    downloadBtn.download = "";
  }
  if (watchSubtitle) {
    watchSubtitle.textContent = src.label + (src.size ? ` — ${src.size}` : "");
  }

  if (qualitySelect && qualitySelect.value != index) {
    qualitySelect.value = index;
  }

  if (isNonStreamable(src.url)) {
    showHint("هذا الملف بصيغة لا تدعم البث المباشر (مثل MKV). يرجى استخدام زر التحميل.");
    return;
  }

  hideHint();

  const media = player?.media || video;
  if (!media) return;

  const savedTime = preserveTime ? (media.currentTime || 0) : 0;
  const wasPlaying = preserveTime ? !media.paused : true;

  // ── reset ────────────────────────────────────────
  try { media.pause(); } catch (_) {}
  media.removeAttribute("src");
  if (data?._poster) media.setAttribute("poster", data._poster);

  // ── canplay ──────────────────────────────────────
  function onCanPlay() {
    errorCount = 0;
    if (savedTime > 1) {
      try { media.currentTime = savedTime; } catch (_) {}
    }
    if (wasPlaying) {
      if (player && typeof player.play === "function") {
        player.play().catch(() => media.play?.().catch(() => {}));
      } else if (typeof media.play === "function") {
        media.play().catch(() => {});
      }
    }
  }

  media.addEventListener("canplay", onCanPlay, { once: true });

  // ── error: جرب blob أو انتقل للمصدر التالي ───────
  async function onMediaError() {
    media.removeEventListener("canplay", onCanPlay);
    showHint(`جارٍ محاولة تشغيل بديلة لـ "${src.label}"…`);

    const blobUrl = await tryBlob(src.url);
    if (blobUrl) {
      hideHint();
      media.src = blobUrl;
      media.load();
      media.addEventListener("canplay", onCanPlay, { once: true });
      media.addEventListener("error", handleError, { once: true });
    } else {
      handleError();
    }
  }

  media.addEventListener("error", onMediaError, { once: true });

  // ── set source (Same direct download link) ────────
  media.src = src.url;
  media.load();

  // ── sync Plyr quality badge if supported ──────────
  const sz = qualitySize(src.label);
  if (sz && player) {
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
    showHint("تعذّر تشغيل الفيديو مباشرةً في المتصفح. يمكنك تحميله بالضغط على زر التحميل بالأسفل.");
    errorCount = 0;
    return;
  }

  const next = (currentIndex + 1) % sources.length;
  showHint(
    `فشل تشغيل "${sources[currentIndex]?.label}" — جارٍ تجربة "${sources[next]?.label}"…`,
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
  const sizes = sources.map((s) => qualitySize(s.label)).filter(Boolean);
  const unique = [...new Set(sizes)].sort((a, b) => b - a);
  const multi = sources.length > 1 && unique.length > 1;

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const nativeFS = !!(
    document.fullscreenEnabled ||
    document.webkitFullscreenEnabled ||
    document.mozFullScreenEnabled ||
    document.msFullscreenEnabled
  );

  const opts = {
    ratio: "16:9",
    loadSprite: true,
    iconUrl: "/vendor/plyr/plyr.svg",
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

  if (multi && unique.length > 0) {
    opts.quality = {
      default: unique.includes(sizes[startIndex]) ? sizes[startIndex] : unique[0],
      options: unique,
      forced: true,
      onChange(q) {
        const idx = sources.findIndex((s) => qualitySize(s.label) === q);
        if (idx >= 0 && idx !== currentIndex) {
          errorCount = 0;
          clearTimeout(retryTimer);
          applySource(idx, true);
        }
      },
    };
  }

  try {
    if (typeof Plyr !== "undefined") {
      player = new Plyr(video, opts);
      player.on("error", handleError);

      if (data?._poster) {
        player.on("ready", () => {
          player.media?.setAttribute("poster", data._poster);
        });
      }
    } else {
      player = { media: video, play: () => video.play() };
    }
  } catch (err) {
    console.warn("Plyr initialization fallback to HTML5 video element:", err);
    player = { media: video, play: () => video.play() };
  }

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

  if (!raw) {
    location.href = "/";
    return;
  }

  try {
    data = JSON.parse(raw);
  } catch {
    location.href = "/";
    return;
  }

  sources = (data.sources || []).filter((s) => s?.url?.startsWith("http"));
  if (!sources.length) {
    location.href = "/";
    return;
  }

  if (watchTitle) watchTitle.textContent = data.title || "مشاهدة الحلقة";
  if (watchSubtitle) watchSubtitle.textContent = data.subtitle || "";

  if (data.poster) {
    const proxyUrl = `/akwam/proxy-image?url=${encodeURIComponent(data.poster)}`;
    data._poster = proxyUrl;
    if (watchPoster) {
      watchPoster.src = proxyUrl;
      watchPoster.classList.remove("hidden");
    }
    if (video) video.setAttribute("poster", proxyUrl);
  }

  let startIndex = 0;
  if (data.startQuality) {
    const idx = sources.findIndex((s) => s.label === data.startQuality);
    if (idx >= 0) startIndex = idx;
  }

  // Populate Quality Select dropdown if multiple qualities exist
  if (sources.length > 1 && qualitySelect) {
    qualitySelect.innerHTML = "";
    sources.forEach((s, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = s.label + (s.size ? ` — (${s.size})` : "");
      qualitySelect.appendChild(opt);
    });
    qualitySelect.value = startIndex;
    if (qualitySection) qualitySection.classList.remove("hidden");

    qualitySelect.addEventListener("change", () => {
      const idx = parseInt(qualitySelect.value, 10);
      if (!isNaN(idx) && idx >= 0 && idx < sources.length && idx !== currentIndex) {
        errorCount = 0;
        clearTimeout(retryTimer);
        applySource(idx, true);
      }
    });
  } else if (qualitySection) {
    qualitySection.classList.add("hidden");
  }

  buildPlyr(startIndex);
}

window.addEventListener("beforeunload", revokeAllBlobs);
document.addEventListener("DOMContentLoaded", loadWatchData);

document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("backToSearchBtn");
  if (backBtn) {
    backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    });
  }
});
