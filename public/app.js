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
  trends: null,
  strategy: null,
  guide: null,
  hk: null,
  cases: null,
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
    state.trends = data.trends || null;
    state.strategy = data.strategy || null;
    state.guide = data.guide || null;
    state.hk = data.hk || null;
    state.cases = data.cases || null;
    state.districts = Array.isArray(data.districts) ? data.districts : [];

    if (state.districts.length === 0) throw new Error('資料為空');

    initHeader();
    renderStats();
    render();          // 首次渲染卡片
    renderOverview();
    renderStrategy();
    renderHK();
    renderCases();
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
    </div>
    ${trendsBlock()}`;
}

// 六大投資趨勢（併入市場總論）
function trendsBlock() {
  if (!state.trends) return '';
  const t = state.trends;
  const cards = (t.items || []).map((x) => `
    <div class="trend">
      <span class="trend-no">趨勢 ${x.no}</span>
      <h4 class="trend-title">${esc(x.title)}</h4>
      <p class="trend-desc">${esc(x.desc)}</p>
    </div>`).join('');
  return `
    <div class="ov-trends">
      <h3 class="ov-h">${esc(t.title)}</h3>
      <div class="trend-grid">${cards}</div>
    </div>`;
}

/* ── 小工具：星級與排名徽章 ─────────────── */
const dots = (n) => `<span class="dots"><b style="width:${(n / 5) * 100}%"></b></span>`;
const rankBadge = (n) => `<span class="rk${n <= 3 ? ' top' : ''}">${n}</span>`;

/* ── 投資策略（Part 5 + Part 6）─────────── */

function renderStrategy() {
  if (!state.strategy) return;
  const s = state.strategy;

  const budgets = (s.byBudget || []).map((b) => `
    <div class="budget">
      <div class="budget-amt">${esc(b.budget)}</div>
      <div class="budget-areas">${b.areas.map((a) => `<span>${esc(a)}</span>`).join('')}</div>
      <p class="budget-tactic">${esc(b.tactic)}</p>
    </div>`).join('');

  const upRank = (s.upsideRank || []).map((r) => `
    <li>${rankBadge(r.rank)}<span class="rk-area">${esc(r.area)}</span><span class="rk-val">${esc(r.range)}</span></li>`).join('');
  const ylRank = (s.yieldRank || []).map((r) => `
    <li>${rankBadge(r.rank)}<span class="rk-area">${esc(r.area)}</span><span class="rk-val">${esc(r.rate)}</span></li>`).join('');

  const picks = (s.topPicks || []).map((p) => `
    <div class="pick">
      <span class="pick-type">${esc(p.type)}</span>
      <h4>${esc(p.name)}</h4>
      <p>${esc(p.reason)}</p>
    </div>`).join('');

  const aplus = (s.recommendedProjects?.aplus || []).map((p) => `
    <div class="rec-item">
      <div class="rec-head"><span class="rec-g ap">A+</span><h4>${esc(p.name)}</h4></div>
      <p class="rec-prod">建議產品：${esc(p.products)}</p>
      <div class="rec-tags">${(p.reasons || []).map((r) => `<span>✓ ${esc(r)}</span>`).join('')}</div>
      <p class="rec-price">${esc(p.priceHint)}</p>
      ${p.note ? `<p class="rec-note">${esc(p.note)}</p>` : ''}
    </div>`).join('');
  const aGrade = (s.recommendedProjects?.a || []).map((p) => `
    <div class="rec-item small">
      <div class="rec-head"><span class="rec-g a">A</span><h4>${esc(p.name)}</h4></div>
      <p class="rec-note">${esc(p.note)}</p>
      <p class="rec-price">${esc(p.priceHint)}</p>
    </div>`).join('');

  const avoid = (s.avoid || []).map((a) => `
    <div class="avoid-item"><h4>${esc(a.area)}</h4><p>${esc(a.reason)}</p></div>`).join('');

  const ov = s.overseasNotes || {};
  const prefer = (ov.prefer || []).map((x) => `<li>${esc(x)}</li>`).join('');
  const ovAvoid = (ov.avoid || []).map((x) => `<li>${esc(x)}</li>`).join('');

  $('#strategy').innerHTML = `
    <h2 class="sec-title">${esc(s.title)}</h2>

    <h3 class="ov-h">依預算置產策略</h3>
    <div class="budget-grid">${budgets}</div>

    <h3 class="ov-h">升值潛力 vs 租金投報 排行（2026–2031）</h3>
    <div class="rank-2col">
      <div class="rank-card"><div class="rank-cap">升值潛力排行</div><ol class="rank-list">${upRank}</ol></div>
      <div class="rank-card"><div class="rank-cap">租金投報排行</div><ol class="rank-list">${ylRank}</ol></div>
    </div>

    <h3 class="ov-h">三大最值得長期持有生活圈</h3>
    <div class="pick-grid">${picks}</div>

    <h3 class="ov-h">十大推薦建案（非業配）</h3>
    <div class="rec-grid">${aplus}</div>
    <div class="rec-grid small-grid">${aGrade}</div>

    <h3 class="ov-h">不建議追價區域</h3>
    <p class="sec-note">以下並非不能買，而是目前價格下風險與報酬的平衡較不具吸引力。</p>
    <div class="avoid-grid">${avoid}</div>

    <h3 class="ov-h">海外投資人選案原則</h3>
    <div class="ov-2col">
      <div class="ov-col prefer"><div class="col-cap">優先選擇</div><ul>${prefer}</ul></div>
      <div class="ov-col avoid"><div class="col-cap">建議避免</div><ul>${ovAvoid}</ul></div>
    </div>
    <p class="pd-note" style="margin-top:14px">${esc(ov.budgetPick || '')}</p>`;
}

/* ── 香港投資人（第七 + 八章）─────────────── */

function renderHK() {
  const hk = state.hk;
  const g = state.guide;
  if (!hk && !g) return;

  // 優勢
  const adv = (hk?.suitability?.advantages || []).map((a) => `
    <div class="adv">
      <span class="adv-ic">${esc(a.icon)}</span>
      <div><h4>${esc(a.title)}</h4><p>${esc(a.desc)}</p></div>
    </div>`).join('');

  // 成本（沿用 guide 的 sections）
  const costBlocks = (g?.sections || []).map((sec) => `
    <div class="guide-block">
      <h3>${esc(sec.heading)}</h3>
      <dl>${(sec.items || []).map((it) =>
        `<div class="guide-row"><dt>${esc(it.label)}</dt><dd>${esc(it.value)}</dd></div>`).join('')}</dl>
    </div>`).join('');

  // 稅率表
  const tr = hk?.taxRates || {};
  const taxTable = (rows, cols) => `<table class="pd-table"><tbody>${rows.map((r) =>
    `<tr><th>${esc(r[cols[0]])}</th><td>${esc(r[cols[1]])}</td></tr>`).join('')}</tbody></table>`;

  // 個人 vs 公司
  const pvc = hk?.personVsCompany;
  const pvcRows = (pvc?.rows || []).map((r) => `
    <tr><td class="pvc-item">${esc(r.item)}</td><td>${dots(r.person)}</td><td>${dots(r.company)}</td></tr>`).join('');
  const pvcAdvice = (pvc?.advice || []).map((a) => `
    <div class="advice-row"><b>${esc(a.scale)}</b><span>${esc(a.text)}</span></div>`).join('');

  // 公司持有
  const c = hk?.company || {};
  const pros = (c.pros || []).map((p) => `
    <div class="pc-row"><div><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div>${dots(p.s)}</div>`).join('');
  const cons = (c.cons || []).map((p) => `
    <div class="pc-row"><div><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div>${dots(p.s)}</div>`).join('');
  const sop = (c.sop || []).map((step, i) => `
    <li><span class="sop-n">${i + 1}</span>${esc(step)}</li>`).join('');
  const kycDocs = (c.kyc?.docs || []).map((x) => `<span>${esc(x)}</span>`).join('');
  const mines = (c.landmines || []).map((m, i) => `
    <li><span class="mine-n">${i + 1}</span>${esc(m)}</li>`).join('');
  const annual = (c.annualCost || []).map((x) => `<span>${esc(x)}</span>`).join('');

  $('#hk').innerHTML = `
    <h2 class="sec-title">${esc(hk?.suitability?.title || '香港投資人攻略')}</h2>
    <div class="adv-grid">${adv}</div>

    <h3 class="ov-h">置產成本與稅務</h3>
    ${costBlocks}

    <div class="tax-2col">
      <div class="guide-block"><h3>房屋稅</h3>${taxTable(tr.houseTax || [], ['use', 'rate'])}</div>
      <div class="guide-block"><h3>地價稅</h3>${taxTable(tr.landTax || [], ['use', 'rate'])}</div>
    </div>
    <div class="guide-block">
      <h3>房地合一稅（自然人）</h3>
      ${taxTable(tr.capitalGains || [], ['hold', 'rate'])}
      <p class="pd-note" style="margin-top:12px">${esc(tr.capitalGainsNote || '')}</p>
    </div>
    <div class="guide-block"><h3>出租所得</h3><p class="hk-p">${esc(tr.rentNote || '')}</p></div>

    <h3 class="ov-h">${esc(pvc?.title || '個人 vs 公司持有')}</h3>
    <table class="pvc-table">
      <thead><tr><th>比較項目</th><th>香港個人</th><th>香港公司</th></tr></thead>
      <tbody>${pvcRows}</tbody>
    </table>
    <div class="advice-box">${pvcAdvice}</div>

    <h3 class="ov-h">${esc(c.title || '香港公司持有完整手冊')}</h3>
    <p class="sec-note">${esc(c.intro || '')}</p>
    <div class="pc-2col">
      <div class="pc-card pros"><div class="col-cap">五大優點</div>${pros}</div>
      <div class="pc-card cons"><div class="col-cap">七大缺點</div>${cons}</div>
    </div>

    <div class="guide-block">
      <h3>購屋流程 SOP</h3>
      <ol class="sop">${sop}</ol>
    </div>

    <div class="guide-block">
      <h3>銀行 KYC 最在意的事</h3>
      <p class="hk-p">${esc(c.kyc?.intro || '')}</p>
      <div class="chip-list">${kycDocs}</div>
    </div>

    <div class="guide-block">
      <h3>股東曾破產，有影響嗎？</h3>
      <p class="hk-p">${esc(c.bankruptcy || '')}</p>
    </div>

    <div class="guide-block mines-block">
      <h3>香港公司十大地雷</h3>
      <ol class="mines">${mines}</ol>
    </div>

    <div class="guide-block">
      <h3>香港公司每年固定成本</h3>
      <div class="chip-list">${annual}</div>
    </div>

    <p class="guide-disc">${esc(g?.disclaimer || '')}</p>`;

  if (g?.disclaimer) $('#footerDisclaimer').textContent = g.disclaimer;
}

/* ── 五大實戰案例（第九章）──────────────── */

function renderCases() {
  if (!state.cases) return;
  const c = state.cases;

  const items = (c.items || []).map((x) => `
    <div class="case">
      <div class="case-head">
        <div>
          <div class="case-budget">${esc(x.budget)}</div>
          <div class="case-twd">${esc(x.twd)}</div>
        </div>
        <div class="case-meta">
          <span>適合 ${stars(x.fit)}</span>
          <span>風險 ${stars(x.risk)}</span>
        </div>
      </div>
      <p class="case-aud">${esc(x.audience)}</p>
      <div class="case-tags">
        <span class="case-area">${esc(x.area)}</span>
        <span class="case-prod">${esc(x.product)}</span>
      </div>
      <table class="case-table"><tbody>${(x.rows || []).map((r) =>
        `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table>
      <p class="case-verdict">${esc(x.verdict)}</p>
    </div>`).join('');

  const sumRows = (c.summaryTable || []).map((r) =>
    `<tr><td>${esc(r.budget)}</td><td>${esc(r.hold)}</td><td>${esc(r.way)}</td></tr>`).join('');

  const finalRows = (c.finalRanking || []).map((r) =>
    `<tr><td><span class="fg">${esc(r.grade)}</span></td><td class="fa">${esc(r.area)}</td><td>${esc(r.fit)}</td><td>${esc(r.risk)}</td><td>${esc(r.hold)}</td></tr>`).join('');

  $('#cases').innerHTML = `
    <h2 class="sec-title">${esc(c.title)}</h2>
    <p class="sec-note">${esc(c.note)}</p>
    <div class="case-grid">${items}</div>

    <h3 class="ov-h">五年投資配置比較</h3>
    <table class="std-table">
      <thead><tr><th>預算</th><th>建議持有</th><th>推薦方式</th></tr></thead>
      <tbody>${sumRows}</tbody>
    </table>

    <h3 class="ov-h">最終投資建議排序（2026–2031）</h3>
    <table class="std-table">
      <thead><tr><th>評級</th><th>區域</th><th>適合</th><th>風險</th><th>建議持有</th></tr></thead>
      <tbody>${finalRows}</tbody>
    </table>`;
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
  $('#view-strategy').hidden = view !== 'strategy';
  $('#view-hk').hidden = view !== 'hk';
  $('#view-cases').hidden = view !== 'cases';
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
