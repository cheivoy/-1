# 2026 雙北房市分析 — 互動式查閱網頁

給投資人（特別是香港買家）一個比看文檔更快、更清楚的方式，瀏覽台北市、新北市各區域的升值潛力、租金投報與五年展望，並可逐區加入建案（含簡介與轉跳連結）。

## 檔案結構

```
realestate/
├─ server.js          後端（純 Node，零套件）：靜態檔案 + 建案管理 API
├─ package.json       專案設定
├─ README.md          本說明
└─ public/            前端（可獨立運作）
   ├─ index.html      頁面主架構
   ├─ styles.css      樣式設計（白灰淡雅、深玉綠重點色）
   ├─ app.js          核心邏輯：讀資料、篩選排序、詳情側欄
   └─ data.json       ★ 所有區域與建案資料（最常維護的檔案）
```

## 兩種啟動方式

### 方式 A：只看前端（最簡單）

因為 `app.js` 用 `fetch` 讀取 `data.json`，**不能**直接雙擊 `index.html` 開啟（瀏覽器會擋本機檔案讀取）。請用任一本機伺服器，例如：

```bash
cd realestate/public
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

### 方式 B：前後端一起（可用 API 管理建案）

需要 Node.js 18 以上，**不需 npm install**：

```bash
cd realestate
node server.js
# 開啟 http://localhost:3000
```

## 如何新增／管理資料

### 加區域或改數據

直接編輯 `public/data.json` 的 `districts` 陣列即可，欄位說明：

| 欄位 | 說明 |
| --- | --- |
| `name` / `fullName` | 區域簡稱 / 全名 |
| `city` | `台北市` 或 `新北市` |
| `score` / `grade` | 投資評分（0–10）/ 評級（A+、A、A-、B+） |
| `appreciation` / `rentalYield` | 升值潛力、租金收益（1–5 星） |
| `yieldRange` | 租金投報率區間，如 `[2.0, 2.4]` |
| `priceNew` / `priceOld` | 新屋 / 中古 成交價（萬／坪） |
| `hkdPerSqftNew` / `hkdPerSqftOld` | 每呎港幣 |
| `upside` | 五年預估漲幅 `[15, 25]`（卡片上的區間 bar） |
| `transit` / `development` | 交通建設 / 重大開發題材 |
| `detailUrl` | 詳細分析連結（可放完整報告或 PDF） |
| `projects` | 建案陣列（見下） |

### 加建案（含簡介與轉跳）

在該區域的 `projects` 陣列加物件：

```json
{
  "name": "某某建案",
  "intro": "步行 5 分鐘至捷運，兩房 26 坪，社區 180 戶…",
  "priceHint": "約 NT$110 萬／坪",
  "status": "熱銷中",
  "url": "https://建案官網或介紹頁"
}
```

`url` 會變成詳情側欄裡的「前往建案」按鈕，點擊在新分頁開啟。

### 用 API 新增建案（方式 B 啟動時）

```bash
curl -X POST http://localhost:3000/api/districts/tucheng/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"示範建案","intro":"捷運宅，兩房","priceHint":"NT$65 萬/坪","url":"https://example.com"}'
```

`tucheng` 為區域 `id`，各區 id 可在 `data.json` 查到。

## 設計說明

- 以純白／灰為底，深玉綠為唯一重點色，黃銅色僅用於 A+ 與細節。
- 每張卡片有「五年漲幅區間」視覺條，讓投資人一眼比較。
- 點卡片開啟右側詳情：市場行情、交通開發、升值動能、風險、建議產品、相關建案。
- 「投資須知」分頁整理契稅、房屋稅、地價稅、房地合一稅等重點。

## 提醒

資料為投資參考，非法律或稅務意見。若要對外發布，涉及跨境投資、公司持有與稅務的部分，建議先請台灣律師與會計師依最新法規審閱。
