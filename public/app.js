/* =========================================================
   2026 雙北房市分析 — app.js
   職責：讀取 data.json → 動態渲染卡片、統計、詳情側欄、投資須知。
   資料來源可切換：預設讀取靜態 data.json；若後端啟動，改讀 /api/data。
   ========================================================= */

'use strict';

// 若之後接上後端 API，把這行改成 '/api/data' 即可，其餘不用動。
const DATA_URL = 'data.json';

// 全域狀態
const state = {
  meta: null,
  overview: null,
  guide: null,
  districts: [],   // 原始資料
  city: 'all',
  grade: 'all',
  keyword: '',
  sort: 'score',
};

/* ── 工具函式 ───────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// 安全處理 HTML，避免資料中的特殊字元造成問題
const esc = (str) =>
  String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

// 數字區間顯示，如 [15, 25] → "15–25"
const range = (arr, unit = '') =>
  Array.isArray(arr) ? `${arr[0]}–${arr[1]}${unit}` : '—';

// 五星顯示
const stars = (n) => {
  const full = Math.max(0, Math.min(5, Math.round(n)));
  return '★★★★★☆☆☆☆☆'.slice(5 - full, 10 - full);
};

/* ── 載入資料 ───────────────────────────── */

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.meta = data.meta || {};
    state.overview = data.overview || null;
    state.guide = data.guide || null;
    state.districts = Array.isArray(data.districts) ? data.districts : [];

    if (state.districts.length === 0) throw new Error('資料為空');

    initHeader();
    renderStats();
    render();          // 首次渲染卡片
    renderOverview();
    renderGuide();
    bindEvents();
  } catch (err) {
    showError(err);
  }
}

function showError(err) {
  console.error('資料載入失敗：', err);
  const grid = $('#grid');
  if (grid) {
    grid.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <p>資料載入失敗。</p>
        <p style="font-size:13px">請確認 <code>data.json</code> 存在且格式正確，
        並透過本機伺服器（非直接開檔）開啟頁面。</p>
        <button class="link-btn" onclick="location.reload()">重新載入</button>
      </div>`;
  }
}

/* ── 頁首與統計 ─────────────────────────── */

function initHeader() {
  if (state.meta.audience) $('#brandSub').textContent = state.meta.audience;
  if (state.meta.conversion?.note) $('#footerNote').textContent = '換算基準：' + state.meta.conversion.note;
}

function renderStats() {
  const d = state.districts;
  const avgYield = (d.reduce((s, x) => s + (x.yieldRange?.[0] + x.yieldRange?.[1]) / 2, 0) / d.length).toFixed(1);
  const topUpside = Math.max(...d.map((x) => x.upside?.[1] || 0));
  const aplus = d.filter((x) => x.grade === 'A+').length;

  const stats = [
    { num: d.length, label: '涵蓋區域' },
    { num: aplus, label: 'A+ 最高評級' },
    { num: `${avgYield}<small>%</small>`, label: '平均租金投報率' },
    { num: `${topUpside}<small>%</small>`, label: '最高五年漲幅' },
  ];

  $('#statStrip').innerHTML = stats.map((s) => `
    <div class="stat">
      <div class="stat-num">${s.num}</div>
      <div class="stat-label">${esc(s.label)}</div>
    </div>`).join('');
}

/* ── 篩選 + 排序 ────────────────────────── */

function getFiltered() {
  let list = state.districts.filter((x) => {
    const okCity = state.city === 'all' || x.city === state.city;
    const okGrade = state.grade === 'all' || x.grade === state.grade;
    const kw = state.keyword.trim();
    const okKw = !kw || (x.name + x.fullName + x.audience).includes(kw);
    return okCity && okGrade && okKw;
  });

  const mid = (r) => (r ? (r[0] + r[1]) / 2 : 0);
  const sorters = {
    score: (a, b) => b.score - a.score,
    upside: (a, b) => (b.upside?.[1] || 0) - (a.upside?.[1] || 0),
    yield: (a, b) => mid(b.yieldRange) - mid(a.yieldRange),
    priceLow: (a, b) => (a.priceNew?.[0] || a.priceOld?.[0] || 999) - (b.priceNew?.[0] || b.priceOld?.[0] || 999),
  };
  return list.sort(sorters[state.sort] || sorters.score);
}

/* ── 渲染卡片 ───────────────────────────── */

// 五年漲幅在所有區域中的最大值，用來換算 bar 寬度
function maxUpside() {
  return Math.max(...state.districts.map((x) => x.upside?.[1] || 0), 1);
}

function cardHTML(x) {
  const priceRange = x.priceNew || x.priceOld;
  const hkRange = x.hkdPerSqftNew || x.hkdPerSqftOld;
  const max = maxUpside();
  const up = x.upside || [0, 0];
  const left = (up[0] / max) * 100;
  const width = ((up[1] - up[0]) / max) * 100;
  const cityClass = x.city === '新北市' ? 'np' : '';
  const projN = (x.projects || []).length;
  const riskTag = x.highRisk ? '<span class="tag-risk">高風險高潛力</span>' : '';

  return `
  <article class="card" tabindex="0" role="button" data-id="${esc(x.id)}"
           aria-label="${esc(x.name)} 詳情">
    <div class="card-top">
      <span class="card-rank">${esc(x.city)} · <b>No.${x.rank}</b></span>
      <span class="grade" data-g="${esc(x.grade)}">${esc(x.grade)}</span>
    </div>

    <h3 class="card-name">${esc(x.name)}${riskTag}</h3>
    <p class="card-full">${esc(x.fullName)}</p>
    <span class="card-city ${cityClass}">${esc(x.city)}</span>

    <div class="metrics">
      <div>
        <div class="metric-label">投資評分</div>
        <div class="metric-val">${x.score}<span class="u"> / 10</span></div>
      </div>
      <div>
        <div class="metric-label">租金投報率</div>
        <div class="metric-val">${range(x.yieldRange, '%')}</div>
      </div>
      <div>
        <div class="metric-label">每呎（港幣）</div>
        <div class="metric-val">${hkRange ? '$' + hkRange[0].toLocaleString() : '—'}<span class="u"> 起</span></div>
      </div>
    </div>

    <div class="upside">
      <div class="upside-head">
        <span class="t">五年預估漲幅</span>
        <span class="v">${range(up, '%')}</span>
      </div>
      <div class="upside-track">
        <div class="upside-fill" style="left:${left}%; width:${Math.max(width, 3)}%"></div>
      </div>
      <div class="upside-scale"><span>0%</span><span>${max}%</span></div>
    </div>

    <div class="card-foot">
      <span class="proj-count">建案 <b>${projN}</b> 筆</span>
      <span class="card-cta">查看詳情
        <svg viewBox="0 0 24 24"><path d="M8.6 5.4 15.2 12l-6.6 6.6L10 20l8-8-8-8z"/></svg>
      </span>
    </div>
  </article>`;
}

function render() {
  const list = getFiltered();
  const grid = $('#grid');
  const empty = $('#empty');

  $('#resultCount').textContent = `共 ${list.length} 個區域`;

  if (list.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  grid.innerHTML = list.map(cardHTML).join('');

  // 綁定每張卡片的開啟事件
  $$('.card', grid).forEach((el) => {
    const open = () => openPanel(el.dataset.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

/* ── 詳情側欄 ───────────────────────────── */

function marketRows(x) {
  const rows = [];
  if (x.priceNew) rows.push(['新屋成交價', `NT$${range(x.priceNew)} 萬／坪`, false]);
  if (x.priceOld) rows.push(['中古成交價', `NT$${range(x.priceOld)} 萬／坪`, false]);
  if (x.hkdPerSqftNew) rows.push(['每呎（港幣·新屋）', `HK$${range(x.hkdPerSqftNew)}／呎`, true]);
  if (x.hkdPerSqftOld) rows.push(['每呎（港幣·中古）', `HK$${range(x.hkdPerSqftOld)}／呎`, true]);
  if (x.rentMonthly) rows.push(['平均月租', `NT$${x.rentMonthly[0].toLocaleString()}–${x.rentMonthly[1].toLocaleString()}`, false]);
  if (x.yieldRange) rows.push(['租金投報率', range(x.yieldRange, '%'), false]);
  return rows.map(([k, v, hk]) =>
    `<tr><th>${esc(k)}</th><td class="${hk ? 'pd-hk' : ''}">${esc(v)}</td></tr>`).join('');
}

function projectsHTML(x) {
  const list = x.projects || [];
  if (list.length === 0) {
    return `<div class="proj-empty">此區域尚未加入建案。<br>可於 <code>data.json</code> 的 <code>projects</code> 陣列新增。</div>`;
  }
  return list.map((p) => `
    <div class="proj-item">
      <h4>${esc(p.name)}${p.status ? `<span class="proj-status">${esc(p.status)}</span>` : ''}</h4>
      <p class="proj-intro">${esc(p.intro)}</p>
      <div class="proj-meta">
        <span class="proj-price">${esc(p.priceHint || '')}</span>
        ${p.url ? `<a class="proj-link" href="${esc(p.url)}" target="_blank" rel="noopener">
          前往建案 <svg viewBox="0 0 24 24"><path d="M14 3v2h3.6l-9.3 9.3 1.4 1.4L19 6.4V10h2V3h-7zM5 5h5V3H3v18h18v-7h-2v5H5V5z"/></svg>
        </a>` : ''}
      </div>
    </div>`).join('');
}

function openPanel(id) {
  const x = state.districts.find((d) => d.id === id);
  if (!x) return;

  const badges = [
    `評分 <b>${x.score}</b>`,
    `評級 <b>${esc(x.grade)}</b>`,
    `升值 <b>${stars(x.appreciation)}</b>`,
    `租金 <b>${stars(x.rentalYield)}</b>`,
    `風險 <b>${esc(x.riskLevel || '—')}</b>`,
    `建議持有 <b>${esc(x.holdYears || '—')}</b>`,
  ].map((b) => `<span class="pd-badge">${b}</span>`).join('');

  $('#panelBody').innerHTML = `
    <div class="pd-eyebrow">${esc(x.city)} · No.${x.rank} · 適合${esc(x.audience)}</div>
    <h2 class="pd-title">${esc(x.name)}</h2>
    <p class="pd-full">${esc(x.fullName)}</p>
    <div class="pd-badges">${badges}</div>

    <p class="pd-summary">${esc(x.summary)}</p>

    <div class="pd-section">
      <h3 class="pd-h">市場行情（2026）</h3>
      <table class="pd-table"><tbody>${marketRows(x)}</tbody></table>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">交通與重大開發</h3>
      <p class="pd-note"><b>交通：</b>${esc(x.transit)}<br><br><b>開發題材：</b>${esc(x.development)}</p>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">升值動能</h3>
      <ul class="pd-list drivers">${(x.drivers || []).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">投資風險</h3>
      <ul class="pd-list risks">${(x.risks || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">建議產品</h3>
      <p class="pd-note">${esc(x.recommend)}</p>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">五年展望（2026–2031）</h3>
      <p class="pd-note">${esc(x.outlook)}</p>
    </div>

    <div class="pd-section">
      <h3 class="pd-h">相關建案</h3>
      <div class="proj">${projectsHTML(x)}</div>
      ${x.detailUrl ? `<a class="detail-cta" href="${esc(x.detailUrl)}" target="_blank" rel="noopener">
        閱讀完整分析 →</a>` : ''}
    </div>
  `;

  const panel = $('#panel');
  const overlay = $('#panelOverlay');
  overlay.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => { overlay.classList.add('show'); panel.classList.add('show'); });
  panel.scrollTop = 0;
  panel.focus();
  document.body.style.overflow = 'hidden';
}

function closePanel() {
  const panel = $('#panel');
  const overlay = $('#panelOverlay');
  panel.classList.remove('show');
  overlay.classList.remove('show');
  panel.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 280);
}

/* ── 市場總論 ───────────────────────────── */

function renderOverview() {
  if (!state.overview) return;
  const o = state.overview;

  const prefaceP = (o.preface?.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('');
  const statusPoints = (o.status?.points || [])
    .map((p) => `<li>${esc(p)}</li>`).join('');
  const factorCards = (o.factors?.items || []).map((f) => `
    <div class="factor">
      <span class="factor-no">${String(f.no).padStart(2, '0')}</span>
      <h4 class="factor-name">${esc(f.name)}</h4>
      <p class="factor-desc">${esc(f.desc)}</p>
      <div class="factor-tags">${(f.tags || []).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    </div>`).join('');

  $('#overview').innerHTML = `
    <div class="ov-preface">
      <span class="ov-eyebrow">${esc(o.title)}</span>
      <h2 class="ov-lead">${esc(o.preface?.lead || o.preface?.title || '')}</h2>
      <div class="ov-body">${prefaceP}</div>
    </div>

    <div class="ov-status">
      <h3 class="ov-h">${esc(o.status?.title || '市場現況')}</h3>
      <ul class="ov-points">${statusPoints}</ul>
      <p class="ov-summary">${esc(o.status?.summary || '')}</p>
    </div>

    <div class="ov-factors">
      <h3 class="ov-h">${esc(o.factors?.title || '核心因素')}</h3>
      <div class="factor-grid">${factorCards}</div>
    </div>`;
}

/* ── 投資須知 ───────────────────────────── */

function renderGuide() {
  if (!state.guide) return;
  const g = state.guide;
  const blocks = (g.sections || []).map((sec) => `
    <div class="guide-block">
      <h3>${esc(sec.heading)}</h3>
      <dl>${(sec.items || []).map((it) =>
        `<div class="guide-row"><dt>${esc(it.label)}</dt><dd>${esc(it.value)}</dd></div>`).join('')}
      </dl>
    </div>`).join('');

  $('#guide').innerHTML = `
    <p class="guide-intro">${esc(g.intro)}</p>
    ${blocks}
    <p class="guide-disc">${esc(g.disclaimer)}</p>`;

  if (g.disclaimer) $('#footerDisclaimer').textContent = g.disclaimer;
}

/* ── 檢視切換 ───────────────────────────── */

function switchView(view) {
  $$('.tab').forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', active);
  });
  $('#view-overview').hidden = view !== 'overview';
  $('#view-districts').hidden = view !== 'districts';
  $('#view-guide').hidden = view !== 'guide';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── 事件綁定 ───────────────────────────── */

function bindEvents() {
  // 分頁切換
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));

  // 搜尋
  $('#search').addEventListener('input', (e) => { state.keyword = e.target.value; render(); });

  // 城市 / 評級 chip
  $('#cityFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    $$('.chip', e.currentTarget).forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active'); state.city = btn.dataset.city; render();
  });
  $('#gradeFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip'); if (!btn) return;
    $$('.chip', e.currentTarget).forEach((c) => c.classList.remove('is-active'));
    btn.classList.add('is-active'); state.grade = btn.dataset.grade; render();
  });

  // 排序
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  // 清除篩選
  $('#resetFilters').addEventListener('click', () => {
    state.city = 'all'; state.grade = 'all'; state.keyword = '';
    $('#search').value = '';
    $$('#cityFilter .chip, #gradeFilter .chip').forEach((c) =>
      c.classList.toggle('is-active', c.dataset.city === 'all' || c.dataset.grade === 'all'));
    render();
  });

  // 側欄關閉
  $('#panelClose').addEventListener('click', closePanel);
  $('#panelOverlay').addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
}

/* ── 啟動 ───────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadData);
