const $ = (sel) => document.querySelector(sel);

const searchForm = $('#searchForm');
const searchInput = $('#searchInput');
const searchBtn = $('#searchBtn');
const cancelBtn = $('#cancelBtn');
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

cancelBtn.addEventListener('click', cancelSearch);
startProcessBtn.addEventListener('click', startSelectedProcessing);
selectAllBtn.addEventListener('click', () => toggleAllCandidates(true));
clearAllBtn.addEventListener('click', () => toggleAllCandidates(false));

function proxyImageUrl(url) {
  if (!url?.trim()) return '';
  return `/akwam/proxy-image?url=${encodeURIComponent(url.trim())}`;
}

function showError(title, text) {
  return Swal.fire({
    ...SWAL_BASE,
    icon: 'error',
    title,
    text: text || undefined,
  });
}

function showWarning(title, text) {
  return Swal.fire({
    ...SWAL_BASE,
    icon: 'warning',
    title,
    text: text || undefined,
  });
}

function showInfo(title, text) {
  return Swal.fire({
    ...SWAL_BASE,
    icon: 'info',
    title,
    text: text || undefined,
  });
}

function showSuccess(title, text) {
  return Swal.fire({
    ...SWAL_BASE,
    icon: 'success',
    title,
    text: text || undefined,
    timer: 2800,
    showConfirmButton: true,
  });
}

async function startSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

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
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }
    const job = await res.json();
    currentJobId = job.id;
    applyQueueFromSnap(job);
    connectEvents(job.id);
  } catch (err) {
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

  selectionSection.classList.add('hidden');
  startProcessBtn.disabled = true;

  try {
    const res = await fetch(`/akwam/jobs/${currentJobId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedIds }),
    });
    if (!res.ok) {
      throw new Error(await parseErrorResponse(res));
    }
  } catch (err) {
    await showError('فشل المعالجة', err.message || 'تعذر بدء المعالجة');
    selectionSection.classList.remove('hidden');
    startProcessBtn.disabled = false;
  }
}

function resetSearchUI() {
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

function renderResults(data) {
  if (!Array.isArray(data) || !data.length) {
    resultsContainer.innerHTML = '';
    return;
  }

  const hasContent = data.some(
    (g) => Array.isArray(g) && g.length >= 2 && g.slice(1).length > 0,
  );

  if (!hasContent) {
    resultsContainer.innerHTML = '';
    void showNoResultsAlert();
    return;
  }

  resultsContainer.innerHTML = '';

  for (const group of data) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const groupType = group[0];
    const items = group.slice(1);
    if (!items.length) continue;

    const section = document.createElement('div');
    section.className = 'result-group';
    section.innerHTML = `<h3>${groupType === 'Movies' ? '🎬 أفلام' : '📺 مسلسلات'}</h3>`;

    for (const item of items) {
      section.appendChild(renderItemCard(item, groupType === 'Series'));
    }

    resultsContainer.appendChild(section);
  }
}

function extractQualities(obj) {
  return Object.keys(obj)
    .filter(
      (k) =>
        !META_KEYS.has(k) && !k.endsWith('_') && typeof obj[k] === 'string',
    )
    .map((label) => ({
      label,
      url: obj[label],
      size: obj[`${label}_`] || '',
    }))
    .filter((q) => q.url?.startsWith('http'));
}

function openWatchPage(payload) {
  try {
    sessionStorage.setItem('akwamWatch', JSON.stringify(payload));
    window.location.href = '/watch.html';
  } catch {
    void showError('تعذر الفتح', 'لا يمكن فتح صفحة المشاهدة');
  }
}

function renderItemCard(item, isSeries) {
  const card = document.createElement('article');
  card.className = 'result-card';

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

  card.innerHTML = `
    <div class="result-hero">
      <div class="result-poster-wrap">${posterHtml}</div>
      <div class="result-body">
        <h3>${escapeHtml(item.Title || '')}</h3>
        <div class="result-meta">${chips}</div>
        ${
          allQualities.length
            ? `<div class="result-actions-top">
            <button type="button" class="btn-watch watch-all-btn">▶ مشاهدة (أعلى جودة)</button>
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

  const watchAllBtn = card.querySelector('.watch-all-btn');
  if (watchAllBtn && allQualities.length) {
    watchAllBtn.addEventListener('click', () => {
      openWatchPage({
        title: item.Title,
        subtitle: item.Quality || '',
        poster: item.Image,
        sources: allQualities,
      });
    });
  }

  if (isSeries) {
    const epKey = item.Title;
    const episodes = item[epKey];
    if (Array.isArray(episodes)) {
      const epSection = document.createElement('div');
      epSection.className = 'episodes';
      epSection.innerHTML = '<h4>الحلقات</h4>';
      for (const ep of episodes) {
        epSection.appendChild(renderEpisode(ep, item.Image, item.Title));
      }
      content.appendChild(epSection);
    }
  } else {
    content.appendChild(
      renderQualitiesList(allQualities, item.Title, item.Image),
    );
  }

  return card;
}

function renderEpisode(ep, seriesPoster, seriesTitle) {
  const block = document.createElement('div');
  block.className = 'episode-block';
  const qualities = extractQualities(ep);
  block.innerHTML = `<h5>${escapeHtml(ep.Title || '')}</h5>`;
  block.appendChild(
    renderQualitiesList(qualities, `${seriesTitle} — ${ep.Title}`, seriesPoster),
  );
  return block;
}

function renderQualitiesList(qualities, title, poster) {
  const wrap = document.createElement('div');
  wrap.className = 'qualities';
  wrap.innerHTML = '<h4>الجودات المتاحة</h4>';

  if (!qualities.length) {
    wrap.innerHTML += '<p class="hint">لا توجد روابط بعد</p>';
    return wrap;
  }

  const list = document.createElement('div');
  list.className = 'quality-list';

  for (const q of qualities) {
    const row = document.createElement('div');
    row.className = 'quality-row';
    row.innerHTML = `
      <div>
        <div class="quality-label">${escapeHtml(q.label)}</div>
        ${q.size ? `<div class="quality-size">${escapeHtml(q.size)}</div>` : ''}
      </div>
      <div class="quality-actions">
        <button type="button" class="btn-watch" data-action="watch">▶ مشاهدة</button>
        <a class="quality-download" href="${escapeAttr(q.url)}" target="_blank" rel="noopener noreferrer">تحميل</a>
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
