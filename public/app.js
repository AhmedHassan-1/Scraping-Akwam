const $ = (sel) => document.querySelector(sel);

const searchForm = $('#searchForm');
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');
const cancelBtn = $('#cancelBtn');
const resetBtn = $('#resetBtn');
const resetResultsBtn = $('#resetResultsBtn');
const clearInputBtn = $('#clearInputBtn');
const progressSection = $('#progressSection');
const selectionSection = $('#selectionSection');
const resultsSection = $('#resultsSection');
const statusBadge = $('#statusBadge');
const progressText = $('#progressText');
const progressBar = $('#progressBar');
const progressMessage = $('#progressMessage');
const candidatesList = $('#candidatesList');
const startProcessBtn = $('#startProcessBtn');
const selectAllBtn = $('#selectAllBtn');
const clearAllBtn = $('#clearAllBtn');
const resultsContainer = $('#resultsContainer');

let currentJobId = null;
let eventSource = null;
let queuePollTimer = null;
let candidates = [];
const META_KEYS = new Set([
  'Title',
  'Image',
  'Rating',
  'Lang',
  'Quality',
  'Year',
  'Country',
  'Time',
  'Information',
]);

const STATUS_LABELS = {
  queued: 'في الطابور',
  discovering: 'جاري الاكتشاف',
  awaiting_selection: 'في انتظار الاختيار',
  processing: 'جاري المعالجة',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  failed: 'فشل',
};

function formatQueueMessage(snap) {
  if (snap.progress?.message) return snap.progress.message;
  if (snap.queuePosition > 0) {
    const total = snap.queueTotal ? ` من ${snap.queueTotal}` : '';
    return `موقعك في الطابور: ${snap.queuePosition}${total}`;
  }
  return 'في انتظار الدور في الطابور...';
}

function applyQueueFromSnap(snap) {
  if (snap.status !== 'queued') {
    stopQueuePolling();
    return;
  }
  updateProgressUI({
    status: 'queued',
    message: formatQueueMessage(snap),
  });
  if (snap.queuePosition > 0 && snap.queueTotal) {
    progressText.textContent = `الطابور: ${snap.queuePosition} / ${snap.queueTotal}`;
  }
  startQueuePolling(snap.id);
}

function startQueuePolling(jobId) {
  if (queuePollTimer) return;
  queuePollTimer = setInterval(async () => {
    if (!jobId || jobId !== currentJobId) {
      stopQueuePolling();
      return;
    }
    try {
      const res = await fetch(`/akwam/jobs/${jobId}`);
      if (!res.ok) return;
      const snap = await res.json();
      if (snap.status !== 'queued') {
        stopQueuePolling();
        return;
      }
      applyQueueFromSnap(snap);
    } catch (_) {}
  }, 2000);
}

function stopQueuePolling() {
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
    queuePollTimer = null;
  }
}

async function parseErrorResponse(res) {
  try {
    const data = await res.json();
    return data.message || data.error || res.statusText;
  } catch {
    return (await res.text()) || res.statusText;
  }
}

const SWAL_BASE = {
  confirmButtonText: 'حسناً',
  customClass: { popup: 'swal-rtl' },
};

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  startSearch();
});

let isResetting = false;
let currentSearchSeq = 0;

cancelBtn.addEventListener('click', cancelSearch);

// Delegated click listener ensures clicks on button, reset icon, or child text always trigger reset exactly once
document.addEventListener('click', (e) => {
  const target = e.target.closest('#resetResultsBtn, #resetBtn, .btn-reset-results, .btn-reset');
  if (target) {
    e.preventDefault();
    handleResetRequest(e);
  }
});
if (clearInputBtn) {
  clearInputBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    updateResetButtonVisibility();
  });
}
searchInput.addEventListener('input', () => {
  updateResetButtonVisibility();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    updateResetButtonVisibility();
  }
});
startProcessBtn.addEventListener('click', startSelectedProcessing);
selectAllBtn.addEventListener('click', () => toggleAllCandidates(true));
clearAllBtn.addEventListener('click', () => toggleAllCandidates(false));

function proxyImageUrl(url) {
  if (!url?.trim()) return '';
  return `/akwam/proxy-image?url=${encodeURIComponent(url.trim())}`;
}

function showError(title, text) {
  if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
    return Swal.fire({
      ...SWAL_BASE,
      icon: 'error',
      title,
      text: text || undefined,
    });
  }
  console.error('[Error]', title, text);
  alert(`${title}\n${text || ''}`);
}

function showWarning(title, text) {
  if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
    return Swal.fire({
      ...SWAL_BASE,
      icon: 'warning',
      title,
      text: text || undefined,
    });
  }
  console.warn('[Warning]', title, text);
}

function showInfo(title, text) {
  if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
    return Swal.fire({
      ...SWAL_BASE,
      icon: 'info',
      title,
      text: text || undefined,
    });
  }
  console.info('[Info]', title, text);
}

function showSuccess(title, text) {
  if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
    return Swal.fire({
      ...SWAL_BASE,
      icon: 'success',
      title,
      text: text || undefined,
      timer: 2800,
      showConfirmButton: true,
    });
  }
  console.log('[Success]', title, text);
}

async function startSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  const thisSeq = ++currentSearchSeq;

  // Clear previous session storage for results
  try {
    sessionStorage.removeItem('akwam_last_results');
    sessionStorage.setItem('akwam_last_query', query);
  } catch (_) {}

  cleanupJob();
  setBusy(true);
  resultsSection.classList.add('hidden');
  selectionSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  resultsContainer.innerHTML = '';
  updateProgressUI({
    status: 'discovering',
    message: 'بدء البحث...',
    current: 0,
    total: 0,
  });

  try {
    const res = await fetch('/akwam/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ search: query }),
    });
    if (thisSeq !== currentSearchSeq) return;
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }
    const job = await res.json();
    if (thisSeq !== currentSearchSeq) return;
    currentJobId = job.id;
    try {
      sessionStorage.setItem('akwam_last_job_id', job.id);
    } catch (_) {}
    applyQueueFromSnap(job);
    connectEvents(job.id);
  } catch (err) {
    if (thisSeq !== currentSearchSeq) return;
    await showError('فشل البحث', err.message || 'تعذر بدء عملية البحث');
    setBusy(false);
  }
}

function connectEvents(jobId) {
  void hydrateJobSnapshot(jobId);

  eventSource = new EventSource(`/akwam/jobs/${jobId}/events`);

  eventSource.onmessage = (ev) => {
    let event;
    try {
      event = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleJobEvent(event);
  };

  eventSource.onerror = () => {
    if (eventSource?.readyState === EventSource.CLOSED) return;
  };
}

async function hydrateJobSnapshot(jobId) {
  try {
    const res = await fetch(`/akwam/jobs/${jobId}`);
    if (!res.ok) return;
    const snap = await res.json();
    applySnapshot(snap);
  } catch (_) {}
}

function applySnapshot(snap) {
  updateProgressUI({
    status: snap.status,
    message: snap.progress?.message,
    current: snap.progress?.current,
    total: snap.progress?.total,
    completedItems: snap.progress?.completedItems,
  });

  if (snap.candidates?.length) {
    candidates = snap.candidates;
  }

  if (snap.candidates?.length && snap.status === 'awaiting_selection') {
    showSelectionUI(snap.candidates);
  }

  applyQueueFromSnap(snap);

  if (snap.results?.length) {
    resultsSection.classList.remove('hidden');
    renderResults(snap.results);
  }

  if (snap.status === 'completed' && !snap.results?.length) {
    void showNoResultsAlert();
  }

  if (['completed', 'cancelled', 'failed'].includes(snap.status)) {
    setBusy(false);
    if (snap.status === 'failed' && snap.error) {
      void showError('فشلت العملية', snap.error);
    }
  }
}

function handleJobEvent(event) {
  const { type, data } = event;

  switch (type) {
    case 'queue': {
      const total = data.waitingTotal ? ` من ${data.waitingTotal}` : '';
      const msg = data.isActive
        ? 'جاري تنفيذ طلبك الآن...'
        : data.position > 0
          ? `موقعك في الطابور: ${data.position}${total}`
          : 'في انتظار الدور في الطابور...';
      updateProgressUI({ status: 'queued', message: msg });
      if (data.position > 0 && data.waitingTotal) {
        progressText.textContent = `الطابور: ${data.position} / ${data.waitingTotal}`;
      }
      break;
    }

    case 'status':
      updateProgressUI({ status: data.status });
      if (data.status === 'queued') startQueuePolling(currentJobId);
      else stopQueuePolling();
      if (data.status === 'awaiting_selection' && candidates.length) {
        showSelectionUI(candidates);
      }
      if (data.status === 'cancelled') {
        cleanupJob();
        resetSearchUI();
        setBusy(false);
      } else if (['completed', 'failed'].includes(data.status)) {
        setBusy(false);
        cleanupEvents();
      }
      break;

    case 'candidates':
      candidates = data.candidates || [];
      if (candidates.length === 0) {
        void showNoResultsAlert();
      } else {
        showSelectionUI(candidates);
        updateProgressUI({
          message:
            candidates.length === 1
              ? 'تم العثور على نتيجة واحدة — راجعها ثم اضغط «بدء المعالجة»'
              : `تم العثور على ${candidates.length} نتائج — اختر ثم اضغط «بدء المعالجة»`,
        });
      }
      break;

    case 'progress':
      updateProgressUI({
        status: undefined,
        ...data.progress,
      });
      break;

    case 'item':
      if (data.results?.length) {
        resultsSection.classList.remove('hidden');
        renderResults(data.results);
      }
      break;

    case 'complete': {
      const results = data.results || [];
      if (!results.length) {
        void showNoResultsAlert();
      } else {
        resultsSection.classList.remove('hidden');
        renderResults(results);
        void showSuccess('اكتمل البحث', 'تم جلب الروابط بنجاح');
      }
      updateProgressUI({
        status: 'completed',
        message: results.length ? 'اكتمل البحث بنجاح' : 'لا توجد نتائج',
        current: 1,
        total: 1,
      });
      setBusy(false);
      cleanupEvents();
      break;
    }

    case 'cancelled':
      cleanupJob();
      resetSearchUI();
      setBusy(false);
      break;

    case 'error':
      void showError('حدث خطأ', data.message || 'حدث خطأ غير متوقع');
      updateProgressUI({ status: 'failed', message: data.message });
      setBusy(false);
      cleanupEvents();
      break;
  }
}

function showNoResultsAlert() {
  return showWarning(
    'لا توجد نتائج',
    'لم يتم العثور على أي فيلم أو مسلسل يطابق بحثك. جرّب كلمات مختلفة.',
  );
}

function thumbPlaceholderHtml() {
  return '<div class="candidate-thumb-wrap"><div class="candidate-thumb placeholder" aria-hidden="true">🎬</div></div>';
}

function buildThumbHtml(imageUrl, altText) {
  const direct = imageUrl?.trim() || '';
  if (!direct) return thumbPlaceholderHtml();
  const proxied = proxyImageUrl(direct);
  return `<div class="candidate-thumb-wrap"><img class="candidate-thumb" src="${escapeAttr(proxied)}" data-direct="${escapeAttr(direct)}" data-proxied="${escapeAttr(proxied)}" alt="${escapeAttr(altText || '')}" loading="lazy" crossorigin="anonymous" referrerpolicy="no-referrer" /></div>`;
}

function attachThumbFallback(img) {
  img.addEventListener('error', () => {
    const direct = img.dataset.direct;
    const proxied = img.dataset.proxied;
    const step = img.dataset.fallbackStep || '0';

    if (step === '0' && direct && img.src !== direct) {
      img.dataset.fallbackStep = '1';
      img.src = direct;
      return;
    }
    if (step === '1' && proxied && img.src !== proxied) {
      img.dataset.fallbackStep = '2';
      img.src = proxied;
      return;
    }

    if (img.classList.contains('result-poster')) {
      img.replaceWith(
        Object.assign(document.createElement('div'), {
          className: 'result-poster placeholder',
          textContent: '🎬',
        }),
      );
      return;
    }

    const wrap = img.parentElement;
    if (wrap) wrap.outerHTML = thumbPlaceholderHtml();
  });
}

function showSelectionUI(items) {
  selectionSection.classList.remove('hidden');
  const hint = selectionSection.querySelector('.hint');
  if (hint) {
    hint.textContent =
      items.length === 1
        ? 'نتيجة واحدة — يمكنك المتابعة مباشرة أو تغيير الاختيار'
        : 'تم العثور على عدة نتائج — حدد ما تريد معالجته قبل البدء';
  }
  candidatesList.innerHTML = '';

  items.forEach((c) => {
    const el = document.createElement('label');
    el.className = 'candidate-item selected';
    el.innerHTML = `
      <input type="checkbox" checked data-id="${c.id}" />
      ${buildThumbHtml(c.image, c.title)}
      <div class="candidate-info"><h3>${escapeHtml(c.title)}</h3></div>
    `;
    const checkbox = el.querySelector('input');
    const img = el.querySelector('img');
    if (img) attachThumbFallback(img);
    checkbox.addEventListener('change', () => {
      el.classList.toggle('selected', checkbox.checked);
    });
    candidatesList.appendChild(el);
  });
}

function toggleAllCandidates(checked) {
  candidatesList.querySelectorAll('.candidate-item').forEach((el) => {
    const cb = el.querySelector('input');
    cb.checked = checked;
    el.classList.toggle('selected', checked);
  });
}

async function startSelectedProcessing() {
  const selectedIds = [...candidatesList.querySelectorAll('input:checked')].map(
    (cb) => Number(cb.dataset.id),
  );
  if (!selectedIds.length) {
    await showWarning('لم تختر شيئاً', 'اختر عنصراً واحداً على الأقل للمتابعة');
    return;
  }

  const thisSeq = ++currentSearchSeq;
  selectionSection.classList.add('hidden');
  startProcessBtn.disabled = true;

  try {
    const res = await fetch(`/akwam/jobs/${currentJobId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIds }),
    });
    if (thisSeq !== currentSearchSeq) return;
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }
  } catch (err) {
    if (thisSeq !== currentSearchSeq) return;
    await showError('فشل المعالجة', err.message || 'تعذر بدء المعالجة');
    selectionSection.classList.remove('hidden');
    startProcessBtn.disabled = false;
  }
}

function resetSearchUI() {
  try {
    sessionStorage.removeItem('akwam_last_results');
    sessionStorage.removeItem('akwam_last_query');
    sessionStorage.removeItem('akwam_last_job_id');
    sessionStorage.removeItem('akwam_scroll_pos');
  } catch (_) {}
  progressSection.classList.add('hidden');
  selectionSection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  resultsContainer.innerHTML = '';
  candidatesList.innerHTML = '';
  candidates = [];
  statusBadge.textContent = '';
  statusBadge.className = 'badge';
  progressMessage.textContent = '';
  progressText.textContent = '';
  progressBar.style.width = '0%';
  startProcessBtn.disabled = false;
  updateResetButtonVisibility();
}

function updateResetButtonVisibility() {
  const hasQuery = Boolean(searchInput.value.trim());
  const hasResults = !resultsSection.classList.contains('hidden') && resultsContainer.children.length > 0;
  const hasCandidates = !selectionSection.classList.contains('hidden') && candidatesList.children.length > 0;
  const hasSavedState = Boolean(sessionStorage.getItem('akwam_last_results') || sessionStorage.getItem('akwam_last_query'));
  const isBusy = searchBtn.disabled;

  if (clearInputBtn) {
    clearInputBtn.classList.toggle('hidden', !hasQuery || isBusy);
  }

  const shouldShowReset = (hasQuery || hasResults || hasCandidates || hasSavedState) && !isBusy;
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !shouldShowReset);
  }
}

function handleResetRequest(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }
  if (isResetting) return;
  isResetting = true;
  try {
    resetAll();
  } finally {
    setTimeout(() => {
      isResetting = false;
    }, 350);
  }
}

function resetAll() {
  currentSearchSeq++;
  const jobId = currentJobId || sessionStorage.getItem('akwam_last_job_id');

  // 1. Immediately wipe UI state synchronously
  resetSearchUI();
  if (searchInput) {
    searchInput.value = '';
  }
  setBusy(false);
  updateResetButtonVisibility();

  // 2. Clear all cached search states in sessionStorage
  try {
    sessionStorage.removeItem('akwam_last_results');
    sessionStorage.removeItem('akwam_last_query');
    sessionStorage.removeItem('akwam_last_job_id');
    sessionStorage.removeItem('akwam_scroll_pos');
  } catch (_) {}

  // 3. Immediately clean up events & polling
  cleanupJob();

  // 4. Smooth scroll back to top of the page
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 5. Focus search input so user can type immediately
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 80);

  // 6. Fire background cancellation if a job was running
  if (jobId) {
    fetch(`/akwam/jobs/${jobId}`, { method: 'DELETE' }).catch(() => {});
  }

  // 7. Show a clean Toast notification confirming the reset
  if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
    Swal.fire({
      icon: 'success',
      title: 'تم مسح النتائج',
      text: 'الصفحة جاهزة الآن لبحث جديد.',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true,
      customClass: { popup: 'swal-rtl' },
    });
  }
}

async function cancelSearch() {
  const jobId = currentJobId;
  cleanupJob();
  resetSearchUI();
  setBusy(false);

  if (!jobId) return;

  try {
    await fetch(`/akwam/jobs/${jobId}`, { method: 'DELETE' });
  } catch (_) {}
}

function updateProgressUI({ status, message, current, total, completedItems }) {
  if (status) {
    statusBadge.textContent = STATUS_LABELS[status] || status;
    statusBadge.className = 'badge';
    if (status === 'queued') statusBadge.classList.add('queued');
    if (status === 'awaiting_selection') statusBadge.classList.add('awaiting');
    if (status === 'completed') statusBadge.classList.add('done');
    if (status === 'cancelled' || status === 'failed')
      statusBadge.classList.add(status);
  }

  if (message) progressMessage.textContent = message;

  if (total > 0) {
    const pct = Math.round((current / total) * 100);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${current} / ${total}`;
  } else if (status === 'completed') {
    progressBar.style.width = '100%';
    progressText.textContent = '';
  }

  if (completedItems !== undefined && completedItems > 0) {
    progressText.textContent +=
      (progressText.textContent ? ' — ' : '') +
      `${completedItems} عنصر مكتمل`;
  }
}

let currentCapsuleFilter = 'all';

function renderResults(data) {
  if (!Array.isArray(data) || !data.length) {
    resultsContainer.innerHTML = '';
    return;
  }

  const hasContent = data.some(
    (g) => Array.isArray(g) && g.length >= 2 && g.slice(1).length > 0,
  );

  if (!hasContent) {
    resultsSection.classList.add('hidden');
    resultsContainer.innerHTML = '';
    void showNoResultsAlert();
    return;
  }

  resultsSection.classList.remove('hidden');

  // Preserve open states across real-time SSE stream updates
  const previouslyOpenKeys = new Set(
    [...document.querySelectorAll('.episode-accordion-item.is-open')]
      .map((el) => el.dataset.epKey)
      .filter(Boolean),
  );
  const previouslyClosedSeries = new Set(
    [...document.querySelectorAll('.series-capsule-card:not(.is-open)')]
      .map((el) => el.dataset.seriesKey || el.dataset.itemKey)
      .filter(Boolean),
  );
  const previouslyClosedMovies = new Set(
    [...document.querySelectorAll('.movie-capsule-card:not(.is-open)')]
      .map((el) => el.dataset.itemKey)
      .filter(Boolean),
  );
  const moviesGroupWasClosed = Boolean(document.querySelector('.capsule-movies:not(.is-open)'));
  const seriesGroupWasClosed = Boolean(document.querySelector('.capsule-series:not(.is-open)'));

  // Persist results and search query in sessionStorage for instant restoration on Back navigation
  try {
    sessionStorage.setItem('akwam_last_results', JSON.stringify(data));
    if (searchInput.value.trim()) {
      sessionStorage.setItem('akwam_last_query', searchInput.value.trim());
    }
    if (currentJobId) {
      sessionStorage.setItem('akwam_last_job_id', currentJobId);
    }
  } catch (_) {}

  // Segregate into movies and series
  const allMovies = [];
  const allSeries = [];

  for (const group of data) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const groupType = group[0];
    const items = group.slice(1);
    if (!items.length) continue;

    const isSeriesGroup = groupType === 'Series' || groupType === 'series';

    for (const item of items) {
      const hasEpisodes = Boolean(
        item.episodes ||
        item.Episodes ||
        (item.Title && Array.isArray(item[item.Title])) ||
        Object.keys(item).some(
          (k) => !META_KEYS.has(k) && Array.isArray(item[k]) && item[k].length > 0,
        ),
      );

      if (isSeriesGroup || hasEpisodes) {
        allSeries.push(item);
      } else {
        allMovies.push(item);
      }
    }
  }

  resultsContainer.innerHTML = '';

  // 1. Render Top Capsule Navigation Tabs if both movies and series exist
  if (allMovies.length > 0 && allSeries.length > 0) {
    const navBar = document.createElement('div');
    navBar.className = 'results-capsule-tabs';
    navBar.innerHTML = `
      <button type="button" class="capsule-tab-btn ${currentCapsuleFilter === 'all' ? 'active' : ''}" data-filter="all">
        <span class="tab-icon">⚡</span>
        <span class="tab-label">عرض الكل</span>
        <span class="tab-badge">${allMovies.length + allSeries.length}</span>
      </button>
      <button type="button" class="capsule-tab-btn ${currentCapsuleFilter === 'movies' ? 'active' : ''}" data-filter="movies">
        <span class="tab-icon">🎬</span>
        <span class="tab-label">الأفلام</span>
        <span class="tab-badge">${allMovies.length}</span>
      </button>
      <button type="button" class="capsule-tab-btn ${currentCapsuleFilter === 'series' ? 'active' : ''}" data-filter="series">
        <span class="tab-icon">📺</span>
        <span class="tab-label">المسلسلات</span>
        <span class="tab-badge">${allSeries.length}</span>
      </button>
    `;

    navBar.querySelectorAll('.capsule-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentCapsuleFilter = btn.dataset.filter;
        navBar.querySelectorAll('.capsule-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        applyCapsuleFilter(currentCapsuleFilter);
      });
    });

    resultsContainer.appendChild(navBar);
  }

  // 2. Movies Container (Collapsible)
  if (allMovies.length > 0) {
    const moviesSection = document.createElement('div');
    const isMoviesOpen = !moviesGroupWasClosed;
    moviesSection.className = `capsule-group capsule-movies ${isMoviesOpen ? 'is-open' : ''}`;
    moviesSection.innerHTML = `
      <div class="capsule-group-header" role="button" tabindex="0" aria-expanded="${isMoviesOpen}">
        <div class="capsule-title-pill">
          <span class="pill-icon">🎬</span>
          <h3>الأفلام</h3>
        </div>
        <div class="capsule-header-meta">
          <span class="capsule-count-tag">${allMovies.length} فيلم</span>
          <span class="capsule-group-toggle-arrow" aria-label="تبديل عرض الأفلام">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
      </div>
      <div class="movies-capsule-grid"></div>
    `;

    const mHeader = moviesSection.querySelector('.capsule-group-header');
    function toggleMovies() {
      const open = moviesSection.classList.toggle('is-open');
      mHeader.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    mHeader.addEventListener('click', toggleMovies);
    mHeader.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleMovies();
      }
    });

    const grid = moviesSection.querySelector('.movies-capsule-grid');
    for (const movie of allMovies) {
      grid.appendChild(
        renderItemCard(
          movie,
          false,
          previouslyOpenKeys,
          previouslyClosedSeries,
          previouslyClosedMovies,
        ),
      );
    }
    resultsContainer.appendChild(moviesSection);
  }

  // 3. Series Container (Collapsible)
  if (allSeries.length > 0) {
    const seriesSection = document.createElement('div');
    const isSeriesOpen = !seriesGroupWasClosed;
    seriesSection.className = `capsule-group capsule-series ${isSeriesOpen ? 'is-open' : ''}`;
    seriesSection.innerHTML = `
      <div class="capsule-group-header" role="button" tabindex="0" aria-expanded="${isSeriesOpen}">
        <div class="capsule-title-pill">
          <span class="pill-icon">📺</span>
          <h3>المسلسلات</h3>
        </div>
        <div class="capsule-header-meta">
          <span class="capsule-count-tag">${allSeries.length} مسلسل</span>
          <span class="capsule-group-toggle-arrow" aria-label="تبديل عرض المسلسلات">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
      </div>
      <div class="series-capsule-list"></div>
    `;

    const sHeader = seriesSection.querySelector('.capsule-group-header');
    function toggleSeriesGroup() {
      const open = seriesSection.classList.toggle('is-open');
      sHeader.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    sHeader.addEventListener('click', toggleSeriesGroup);
    sHeader.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSeriesGroup();
      }
    });

    const list = seriesSection.querySelector('.series-capsule-list');
    for (const s of allSeries) {
      list.appendChild(
        renderItemCard(
          s,
          true,
          previouslyOpenKeys,
          previouslyClosedSeries,
          previouslyClosedMovies,
        ),
      );
    }
    resultsContainer.appendChild(seriesSection);
  }

  applyCapsuleFilter(currentCapsuleFilter);
  updateResetButtonVisibility();
}

function applyCapsuleFilter(filter) {
  const moviesGroup = resultsContainer.querySelector('.capsule-movies');
  const seriesGroup = resultsContainer.querySelector('.capsule-series');

  if (moviesGroup) {
    moviesGroup.style.display = (filter === 'all' || filter === 'movies') ? 'block' : 'none';
  }
  if (seriesGroup) {
    seriesGroup.style.display = (filter === 'all' || filter === 'series') ? 'block' : 'none';
  }
}

function extractQualities(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj)
    .filter(
      (k) =>
        !META_KEYS.has(k) &&
        !k.endsWith('_') &&
        !k.endsWith('_watch') &&
        !k.endsWith('_url') &&
        typeof obj[k] === 'string',
    )
    .map((label) => ({
      label,
      url: obj[label],
      size: obj[`${label}_`] || '',
    }))
    .filter((q) => q.url?.startsWith('http'));
}

function extractEpisodeNumber(ep, defaultIdx = 0) {
  const t = String(ep?.Title || '');
  const m = t.match(/الحلقة\s*(\d+)/i) || t.match(/E(\d+)/i) || t.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return defaultIdx + 1;
}

function cleanEpisodeTitle(rawTitle, index) {
  if (!rawTitle) return `الحلقة ${index + 1}`;
  let clean = String(rawTitle).trim();
  clean = clean.replace(/الحلقة\s*(\d+)\s+\1\b/gi, 'الحلقة $1');
  return clean;
}

function openWatchPage(payload) {
  try {
    sessionStorage.setItem('akwam_scroll_pos', window.scrollY.toString());
    sessionStorage.setItem('akwamWatch', JSON.stringify(payload));
    if (currentJobId) {
      sessionStorage.setItem('akwam_last_job_id', currentJobId);
    }
    window.location.href = '/watch.html';
  } catch {
    void showError('تعذر الفتح', 'لا يمكن فتح صفحة المشاهدة');
  }
}

function renderItemCard(
  item,
  isSeriesHint,
  previouslyOpenKeys,
  previouslyClosedSeries,
  previouslyClosedMovies,
) {
  const card = document.createElement('article');

  // Comprehensive episode discovery
  let episodes = null;
  if (item.Title && Array.isArray(item[item.Title])) {
    episodes = item[item.Title];
  }
  if (!episodes && item.Title) {
    const cleanKey = item.Title.trim();
    const foundKey = Object.keys(item).find(
      (k) => k.trim() === cleanKey && Array.isArray(item[k]),
    );
    if (foundKey) episodes = item[foundKey];
  }
  if (!episodes) {
    episodes = item.episodes || item.Episodes;
  }
  if (!episodes) {
    for (const k of Object.keys(item)) {
      if (
        !META_KEYS.has(k) &&
        Array.isArray(item[k]) &&
        item[k].length > 0 &&
        typeof item[k][0] === 'object'
      ) {
        episodes = item[k];
        break;
      }
    }
  }

  const isSeries = Boolean(isSeriesHint || (episodes && episodes.length > 0));
  const itemKey = String(item.Title || '').trim();
  card.dataset.itemKey = itemKey;
  card.dataset.seriesKey = itemKey;

  // By default, card is open unless explicitly closed previously
  const isCardOpen = isSeries
    ? !previouslyClosedSeries || !previouslyClosedSeries.has(itemKey)
    : !previouslyClosedMovies || !previouslyClosedMovies.has(itemKey);

  card.className = isSeries
    ? `result-card series-capsule-card ${isCardOpen ? 'is-open' : ''}`
    : `result-card movie-card movie-capsule-card ${isCardOpen ? 'is-open' : ''}`;

  const posterDirect = item.Image?.trim() || '';
  const posterProxied = posterDirect ? proxyImageUrl(posterDirect) : '';
  const posterHtml = posterDirect
    ? `<img class="result-poster" src="${escapeAttr(posterProxied)}" data-direct="${escapeAttr(posterDirect)}" data-proxied="${escapeAttr(posterProxied)}" alt="" loading="lazy" crossorigin="anonymous" referrerpolicy="no-referrer" />`
    : '<div class="result-poster placeholder">🎬</div>';

  const chips = [
    ['التقييم', item.Rating],
    ['اللغة', item.Lang],
    ['الجودة', item.Quality],
    ['السنة', item.Year],
    ['البلد', item.Country],
    ['النوع', item.Time],
  ]
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<span class="meta-chip"><strong>${k}:</strong> ${escapeHtml(String(v))}</span>`,
    )
    .join('');

  const allQualities = isSeries ? [] : extractQualities(item);
  const epCount = Array.isArray(episodes) ? episodes.length : 0;

  card.innerHTML = `
    <div class="result-hero ${isSeries ? 'series-capsule-hero' : 'movie-capsule-hero'}" role="button" tabindex="0" aria-expanded="${isCardOpen}">
      <div class="result-poster-wrap">${posterHtml}</div>
      <div class="result-body">
        ${
          isSeries
            ? `<div class="series-capsule-top-bar">
                 <div class="series-pill-badge">📺 مسلسل</div>
                 <div class="series-capsule-controls">
                   <span class="series-ep-badge">${epCount} حلقة متوفرة</span>
                   <span class="series-toggle-arrow" aria-label="عرض/إخفاء الحلقات">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="6 9 12 15 18 9"></polyline>
                     </svg>
                   </span>
                 </div>
               </div>`
            : `<div class="movie-capsule-top-bar">
                 <div class="movie-pill-badge">🎬 فيلم</div>
                 <div class="movie-capsule-controls">
                   ${allQualities.length ? `<span class="movie-q-badge">${allQualities.length} ${allQualities.length === 1 ? 'جودة متوفرة' : 'جودات متوفرة'}</span>` : ''}
                   <span class="movie-toggle-arrow" aria-label="عرض/إخفاء روابط الفيلم">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                       <polyline points="6 9 12 15 18 9"></polyline>
                     </svg>
                   </span>
                 </div>
               </div>`
        }
        <h3>${escapeHtml(item.Title || '')}</h3>
        <div class="result-meta">${chips}</div>
        ${
          allQualities.length
            ? `<div class="result-actions-top">
            <button type="button" class="btn-watch watch-all-btn">▶ مشاهدة الفيلم (أعلى جودة)</button>
          </div>`
            : ''
        }
      </div>
    </div>
    <div class="result-content"></div>
  `;

  const content = card.querySelector('.result-content');
  const posterImg = card.querySelector('.result-poster');
  if (posterImg?.tagName === 'IMG') attachThumbFallback(posterImg);

  // Clicking the hero header toggles the card open/close for both series and movies!
  const hero = card.querySelector('.result-hero');
  function toggleCard() {
    const open = card.classList.toggle('is-open');
    hero?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  hero?.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('button')) return;
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 0) return;
    toggleCard();
  });
  hero?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.closest('a') || e.target.closest('button')) return;
      e.preventDefault();
      toggleCard();
    }
  });

  const watchAllBtn = card.querySelector('.watch-all-btn');
  if (watchAllBtn && allQualities.length) {
    watchAllBtn.addEventListener('click', () => {
      openWatchPage({
        title: item.Title,
        subtitle: item.Quality || '',
        poster: item.Image,
        sources: allQualities,
        startQuality: allQualities[0].label,
      });
    });
  }

  if (isSeries && Array.isArray(episodes) && episodes.length > 0) {
    const epContainer = document.createElement('div');
    epContainer.className = 'episodes-container';

    // Sort episodes in natural ascending order (Episode 1, 2, ...)
    const sortedEpisodes = [...episodes].sort((a, b) => {
      const numA = extractEpisodeNumber(a);
      const numB = extractEpisodeNumber(b);
      return numA - numB;
    });

    // Header row with count and Expand/Collapse All buttons
    const headerRow = document.createElement('div');
    headerRow.className = 'episodes-header-row';
    headerRow.innerHTML = `
      <h4>📺 حلقات المسلسل (${sortedEpisodes.length} حلقة متوفرة)</h4>
      <div class="episodes-actions">
        <button type="button" class="btn-toggle-all" data-action="expand-all">توسيع الكل</button>
        <button type="button" class="btn-toggle-all" data-action="collapse-all">طي الكل</button>
      </div>
    `;
    epContainer.appendChild(headerRow);

    const accordionList = document.createElement('div');
    accordionList.className = 'episodes-accordion-list';

    sortedEpisodes.forEach((ep, idx) => {
      accordionList.appendChild(
        renderEpisodeAccordion(ep, item.Image, item.Title, idx, previouslyOpenKeys),
      );
    });

    epContainer.appendChild(accordionList);

    // Expand / Collapse listeners
    headerRow
      .querySelector('[data-action="expand-all"]')
      .addEventListener('click', () => {
        accordionList
          .querySelectorAll('.episode-accordion-item')
          .forEach((el) => {
            el.classList.add('is-open');
            el.querySelector('.episode-header-btn')?.setAttribute(
              'aria-expanded',
              'true',
            );
          });
      });

    headerRow
      .querySelector('[data-action="collapse-all"]')
      .addEventListener('click', () => {
        accordionList
          .querySelectorAll('.episode-accordion-item')
          .forEach((el) => {
            el.classList.remove('is-open');
            el.querySelector('.episode-header-btn')?.setAttribute(
              'aria-expanded',
              'false',
            );
          });
      });

    content.appendChild(epContainer);
  } else if (!isSeries) {
    content.appendChild(
      renderQualitiesList(allQualities, item.Title, item.Image),
    );
  }

  return card;
}

/**
 * Renders each episode as a closed rectangle with arrow.
 * Clicking the rectangle or arrow toggles it open/closed.
 * Each quality row enables direct streaming in Plyr.io or direct downloading.
 */
function renderEpisodeAccordion(ep, seriesPoster, seriesTitle, index, previouslyOpenKeys) {
  const item = document.createElement('div');
  item.className = 'episode-accordion-item';
  const qualities = extractQualities(ep);
  const qCount = qualities.length;
  const qBadgeText = qCount > 0 ? `${qCount} جودات متاحة` : 'لا توجد روابط';

  const epNum = extractEpisodeNumber(ep, index);
  const epTitle = cleanEpisodeTitle(ep.Title, index);
  const epKey = `${seriesTitle}_${epNum}`;
  item.dataset.epKey = epKey;

  // Restore open state if previously open during live SSE stream updates!
  if (previouslyOpenKeys && previouslyOpenKeys.has(epKey)) {
    item.classList.add('is-open');
  }

  item.innerHTML = `
    <div class="episode-header-btn" role="button" tabindex="0" aria-expanded="${item.classList.contains('is-open') ? 'true' : 'false'}">
      <div class="episode-header-right">
        <span class="episode-badge-pill">الحلقة ${epNum}</span>
        <span class="episode-title-text">${escapeHtml(epTitle)}</span>
      </div>
      <div class="episode-header-left">
        <span class="episode-badge-qualities">${escapeHtml(qBadgeText)}</span>
        <button type="button" class="btn-episode-quick-watch" title="مشاهدة سريعة في Plyr">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>مشاهدة</span>
        </button>
        <span class="episode-chevron-btn" aria-label="عرض الجودات">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </span>
      </div>
    </div>
    <div class="episode-body"></div>
  `;

  const headerBtn = item.querySelector('.episode-header-btn');
  const body = item.querySelector('.episode-body');
  const quickWatchBtn = item.querySelector('.btn-episode-quick-watch');

  body.appendChild(
    renderQualitiesList(qualities, `${seriesTitle} — ${epTitle}`, seriesPoster),
  );

  function toggle() {
    const isOpen = item.classList.toggle('is-open');
    headerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  headerBtn.addEventListener('click', (e) => {
    if (e.target.closest('.btn-episode-quick-watch')) return;
    toggle();
  });

  headerBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  if (quickWatchBtn) {
    if (!qualities.length) {
      quickWatchBtn.style.display = 'none';
    } else {
      quickWatchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openWatchPage({
          title: `${seriesTitle} — ${epTitle}`,
          subtitle: qualities[0].label + (qualities[0].size ? ` — ${qualities[0].size}` : ''),
          poster: seriesPoster,
          sources: qualities,
          startQuality: qualities[0].label,
        });
      });
    }
  }

  return item;
}

function renderQualitiesList(qualities, title, poster) {
  const wrap = document.createElement('div');
  wrap.className = 'qualities';
  wrap.innerHTML = '<div class="qualities-title">اختر جودة المشاهدة أو التحميل:</div>';

  if (!qualities.length) {
    wrap.innerHTML += '<p class="hint">لا توجد روابط تحميل أو مشاهدة متاحة حالياً.</p>';
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'quality-list';

  for (const q of qualities) {
    const row = document.createElement('div');
    row.className = 'quality-row';
    row.innerHTML = `
      <div class="quality-info-col">
        <span class="quality-name-badge">${escapeHtml(q.label)}</span>
        ${q.size ? `<span class="quality-size-badge">${escapeHtml(q.size)}</span>` : ''}
      </div>
      <div class="quality-actions-col">
        <button type="button" class="btn-watch-stream" data-action="watch" title="مشاهدة مباشرة بجودة ${escapeAttr(q.label)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>مشاهدة</span>
        </button>
        <a class="btn-download-direct" href="${escapeAttr(q.url)}" target="_blank" rel="noopener noreferrer" download title="تحميل مباشر بجودة ${escapeAttr(q.label)}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>تحميل</span>
        </a>
      </div>
    `;

    row.querySelector('[data-action="watch"]').addEventListener('click', () => {
      openWatchPage({
        title,
        subtitle: q.label + (q.size ? ` — ${q.size}` : ''),
        poster,
        sources: qualities,
        startQuality: q.label,
      });
    });

    list.appendChild(row);
  }

  wrap.appendChild(list);
  return wrap;
}

function setBusy(busy) {
  searchBtn.disabled = busy;
  searchInput.disabled = busy;
  cancelBtn.classList.toggle('hidden', !busy);
  updateResetButtonVisibility();
}

function cleanupEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

function cleanupJob() {
  cleanupEvents();
  stopQueuePolling();
  currentJobId = null;
  candidates = [];
  startProcessBtn.disabled = false;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

/**
 * Checks if a saved job is still running in background and resumes live streaming
 */
async function resumeActiveJob(jobId) {
  if (!jobId) return;
  try {
    const res = await fetch(`/akwam/jobs/${jobId}`);
    if (!res.ok) return;
    const snap = await res.json();
    if (['queued', 'discovering', 'processing', 'awaiting_selection'].includes(snap.status)) {
      setBusy(true);
      progressSection.classList.remove('hidden');
      applySnapshot(snap);
      connectEvents(jobId);
    } else if (snap.status === 'completed' && snap.results?.length) {
      renderResults(snap.results);
    }
  } catch (_) {}
}

/**
 * Restores previous search state and results on page reload or back navigation.
 */
function restoreSearchState() {
  try {
    const savedResults = sessionStorage.getItem('akwam_last_results');
    const savedQuery = sessionStorage.getItem('akwam_last_query');
    const savedJobId = sessionStorage.getItem('akwam_last_job_id');
    const scrollPos = sessionStorage.getItem('akwam_scroll_pos');

    if (savedQuery) {
      searchInput.value = savedQuery;
    }

    if (savedResults) {
      const parsed = JSON.parse(savedResults);
      if (Array.isArray(parsed) && parsed.length > 0) {
        resultsSection.classList.remove('hidden');
        renderResults(parsed);
      }
    }

    if (savedJobId) {
      currentJobId = savedJobId;
      // Reconnect and resume streaming if the job is still active!
      void resumeActiveJob(savedJobId);
    }

    if (scrollPos) {
      setTimeout(() => {
        window.scrollTo({ top: Number(scrollPos), behavior: 'smooth' });
        sessionStorage.removeItem('akwam_scroll_pos');
      }, 150);
    }

    updateResetButtonVisibility();
  } catch (err) {
    console.error('Failed to restore search state:', err);
  }
}

// Restore state when page loads (e.g. returning from watch.html)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreSearchState);
} else {
  restoreSearchState();
}
