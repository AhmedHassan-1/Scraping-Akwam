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
const toast = $('#toast');

let currentJobId = null;
let eventSource = null;
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
  discovering: 'جاري الاكتشاف',
  awaiting_selection: 'في انتظار الاختيار',
  processing: 'جاري المعالجة',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  failed: 'فشل',
};

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  startSearch();
});

cancelBtn.addEventListener('click', cancelSearch);
startProcessBtn.addEventListener('click', startSelectedProcessing);
selectAllBtn.addEventListener('click', () => toggleAllCandidates(true));
clearAllBtn.addEventListener('click', () => toggleAllCandidates(false));

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
    if (!res.ok) throw new Error(await res.text());
    const job = await res.json();
    currentJobId = job.id;
    connectEvents(job.id);
  } catch (err) {
    showToast(err.message || 'فشل بدء البحث');
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

  if (snap.status === 'awaiting_selection' && snap.candidates?.length) {
    showSelectionUI(snap.candidates);
  }

  if (snap.results?.length) {
    resultsSection.classList.remove('hidden');
    renderResults(snap.results);
  }

  if (['completed', 'cancelled', 'failed'].includes(snap.status)) {
    setBusy(false);
  }
}

function handleJobEvent(event) {
  const { type, data } = event;

  switch (type) {
    case 'status':
      updateProgressUI({ status: data.status });
      if (['completed', 'cancelled', 'failed'].includes(data.status)) {
        setBusy(false);
        cleanupEvents();
      }
      break;

    case 'candidates':
      candidates = data.candidates || [];
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

    case 'complete':
      resultsSection.classList.remove('hidden');
      renderResults(data.results || []);
      updateProgressUI({
        status: 'completed',
        message: 'اكتمل البحث بنجاح',
        current: 1,
        total: 1,
      });
      setBusy(false);
      cleanupEvents();
      break;

    case 'cancelled':
      updateProgressUI({
        status: 'cancelled',
        message: 'تم إلغاء البحث',
      });
      setBusy(false);
      cleanupEvents();
      break;

    case 'error':
      showToast(data.message || 'حدث خطأ');
      updateProgressUI({ status: 'failed', message: data.message });
      setBusy(false);
      cleanupEvents();
      break;
  }

  if (type === 'status' && data.status === 'awaiting_selection') {
    showSelectionUI(candidates);
  }
}

function showSelectionUI(items) {
  selectionSection.classList.remove('hidden');
  candidatesList.innerHTML = '';

  items.forEach((c) => {
    const el = document.createElement('label');
    el.className = 'candidate-item selected';
    el.innerHTML = `
      <input type="checkbox" checked data-id="${c.id}" />
      ${
        c.image
          ? `<img class="candidate-thumb" src="${escapeAttr(c.image)}" alt="" onerror="this.style.display='none'" />`
          : '<div class="candidate-thumb"></div>'
      }
      <div class="candidate-info"><h3>${escapeHtml(c.title)}</h3></div>
    `;
    const checkbox = el.querySelector('input');
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
    showToast('اختر عنصراً واحداً على الأقل');
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
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || (await res.text()));
    }
  } catch (err) {
    showToast(err.message || 'فشل بدء المعالجة');
    selectionSection.classList.remove('hidden');
    startProcessBtn.disabled = false;
  }
}

async function cancelSearch() {
  if (!currentJobId) return;
  try {
    await fetch(`/akwam/jobs/${currentJobId}`, { method: 'DELETE' });
  } catch (_) {}
  setBusy(false);
  cleanupEvents();
}

function updateProgressUI({ status, message, current, total, completedItems }) {
  if (status) {
    statusBadge.textContent = STATUS_LABELS[status] || status;
    statusBadge.className = 'badge';
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
    resultsContainer.innerHTML =
      '<p class="hint">لا توجد نتائج لعرضها.</p>';
    return;
  }

  resultsContainer.innerHTML = '';

  for (const group of data) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const groupType = group[0];
    const items = group.slice(1);

    const section = document.createElement('div');
    section.className = 'result-group';
    section.innerHTML = `<h3>${groupType === 'Movies' ? 'أفلام' : 'مسلسلات'}</h3>`;

    for (const item of items) {
      section.appendChild(renderItemCard(item, groupType === 'Series'));
    }

    resultsContainer.appendChild(section);
  }
}

function renderItemCard(item, isSeries) {
  const card = document.createElement('div');
  card.className = 'result-card';

  const metaRows = [
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
        `<dt>${k}:</dt><dd>${escapeHtml(String(v))}</dd>`,
    )
    .join('');

  card.innerHTML = `
    <div class="result-header">
      ${
        item.Image
          ? `<img class="result-poster" src="${escapeAttr(item.Image)}" alt="" onerror="this.style.display='none'" />`
          : ''
      }
      <div>
        <h3>${escapeHtml(item.Title || '')}</h3>
        <dl class="result-meta">${metaRows}</dl>
      </div>
    </div>
  `;

  if (isSeries) {
    const epKey = item.Title;
    const episodes = item[epKey];
    if (Array.isArray(episodes)) {
      const epSection = document.createElement('div');
      epSection.className = 'episodes';
      epSection.innerHTML = '<h4>الحلقات</h4>';
      for (const ep of episodes) {
        epSection.appendChild(renderEpisode(ep));
      }
      card.appendChild(epSection);
    }
  } else {
    card.appendChild(renderQualities(item));
  }

  return card;
}

function renderEpisode(ep) {
  const block = document.createElement('div');
  block.className = 'episode-block';
  block.innerHTML = `<h5>${escapeHtml(ep.Title || '')}</h5>`;
  block.appendChild(renderQualities(ep));
  return block;
}

function renderQualities(obj) {
  const wrap = document.createElement('div');
  wrap.className = 'qualities';
  wrap.innerHTML = '<h4>روابط التحميل</h4>';

  const keys = Object.keys(obj).filter(
    (k) => !META_KEYS.has(k) && !k.endsWith('_') && typeof obj[k] === 'string',
  );

  if (!keys.length) {
    wrap.innerHTML += '<p class="hint">لا توجد روابط بعد</p>';
    return wrap;
  }

  for (const q of keys) {
    const url = obj[q];
    const size = obj[`${q}_`] || '';
    const a = document.createElement('a');
    a.className = 'quality-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `<span>${escapeHtml(q)}</span><span class="size">${escapeHtml(size)}</span>`;
    wrap.appendChild(a);
  }

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
  currentJobId = null;
  candidates = [];
}

function showToast(msg, type = 'error') {
  toast.textContent = msg;
  toast.className = `toast ${type === 'info' ? 'info' : ''}`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
