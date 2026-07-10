/* =========================================================
   2026 雙北房市分析 — 後端伺服器 (server.js)
   零套件、純 Node.js。功能：
     1) 提供 public/ 靜態檔案（網頁本體）
     2) 讀取資料：      GET    /api/data
     3) 新增建案：      POST   /api/districts/:id/projects
     4) 刪除建案：      DELETE /api/districts/:id/projects/:index
   啟動方式：  node server.js   （不需 npm install）
   ========================================================= */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = path.join(PUBLIC_DIR, 'data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/* ── 資料存取 ─────────────────────────── */
const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
const writeData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

const sendJSON = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};

/* ── 讀取 request body ────────────────── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(); // 防止過大 payload
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('JSON 格式錯誤')); }
    });
    req.on('error', reject);
  });
}

/* ── API 路由 ─────────────────────────── */
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ["api", ...]

  // GET /api/data
  if (req.method === 'GET' && parts[1] === 'data') {
    return sendJSON(res, 200, readData());
  }

  // /api/districts/:id/projects[/:index]
  if (parts[1] === 'districts' && parts[3] === 'projects') {
    const data = readData();
    const district = data.districts.find((d) => d.id === parts[2]);
    if (!district) return sendJSON(res, 404, { error: '找不到該區域' });
    district.projects = district.projects || [];

    // 新增建案
    if (req.method === 'POST') {
      let body;
      try { body = await readBody(req); }
      catch (e) { return sendJSON(res, 400, { error: e.message }); }

      if (!body.name || !body.intro) {
        return sendJSON(res, 400, { error: '建案至少需要 name 與 intro 欄位' });
      }
      const project = {
        name: String(body.name),
        intro: String(body.intro),
        priceHint: body.priceHint ? String(body.priceHint) : '',
        status: body.status ? String(body.status) : '',
        url: body.url ? String(body.url) : '',
      };
      district.projects.push(project);
      writeData(data);
      return sendJSON(res, 201, { ok: true, project, count: district.projects.length });
    }

    // 刪除建案
    if (req.method === 'DELETE') {
      const idx = Number(parts[4]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= district.projects.length) {
        return sendJSON(res, 400, { error: '建案索引不正確' });
      }
      const removed = district.projects.splice(idx, 1);
      writeData(data);
      return sendJSON(res, 200, { ok: true, removed: removed[0] });
    }
  }

  return sendJSON(res, 404, { error: '未知的 API 路徑' });
}

/* ── 靜態檔案 ─────────────────────────── */
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(PUBLIC_DIR, pathname);
  // 防止路徑穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 找不到檔案');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

/* ── 伺服器 ───────────────────────────── */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => sendJSON(res, 500, { error: e.message }));
  } else {
    serveStatic(req, res, url);
  }
});

server.listen(PORT, () => {
  console.log(`\n  ✔ 2026 雙北房市分析 已啟動`);
  console.log(`  ➜ 請用瀏覽器開啟： http://localhost:${PORT}\n`);
});
