# 爭點模組前置診斷報告｜2026-09-22

## 一、結論摘要

1. 現況大致可進入前置施工，核心假設（題庫結構、題數、部署平台、分支策略、科目代碼）均與規劃書相符。
2. 最嚴重的不符項：**Supabase 寫入錯誤處理全面缺失**——8 個寫入呼叫中，僅 1 個（`updateUserStats` 對 `user_stats` 的 upsert）在函式內部檢查了 `error`，其餘 7 個皆未檢查，且呼叫端（`App.jsx`）對所有寫入一律 fire-and-forget，不 await 也不檢查回傳值。
3. `error_logs` 表確認尚不存在（規劃書假設相符）；`issues`／`statutes` 欄位確認尚未使用（規劃書假設相符），可安全新增不撞名。
4. 版號顯示與實際 commit 進度不同步：UI 頁首硬編 `v14.5`，但 git log 最新版號 commit 為 `v14.10`，其後仍有數個未標版號的 Phase 2 commit——顯示版號已過時，非規劃書所述現況本身的問題，但屬盤點發現。
5. Supabase 端（RLS、GRANT、schema、trigger）尚待你手動貼回 SQL Editor 查詢結果，本報告 G 節與比對表第 6、7 項暫標【待補】。

## 二、盤點結果

### A. Git 與部署

- 分支：目前在 `claude-dev`，與 `origin/claude-dev` 同步。本地另有 `main`、`master`（皆存在，非僅 `master`）；遠端亦有 `origin/main`、`origin/master`。
- Remote：`https://github.com/bluesand0423-eng/law-quiz.git`（repo：`bluesand0423-eng/law-quiz`）。
- 最近 10 筆 commit（详见下）皆為 Phase 2 功能／修正，最新為 `17bfb30 chore: untrack .claude/settings.local.json`。
- 未提交變更：`CLAUDE.md`（已修改，未 commit）＋ 4 個未追蹤 `.md` 檔（皆為你既有工作，本次不動，詳見開場確認）。
- Netlify 殘留設定檔：**無**。`netlify.toml`、`vercel.json` 均不存在。git log 顯示 `06450ef v14: 直連官網模式，移除 Netlify Function 與設定檔`，證實為刻意移除，非遺漏。
- Vercel 專案設定：無 `.vercel/` 目錄（正常——Vercel CLI link 檔通常不進版控，且 Vite 專案不強制需要 `vercel.json`）。
- `package.json`：`name: "law-quiz"`，`version: "1.0.0"`（此版號欄位與 UI 顯示的 `v14.x` 無關，屬 npm 套件版號，未隨功能更新）。

### B. CLAUDE.md

**已提交版本**（`git show HEAD:CLAUDE.md`）與**工作區版本**（`cat CLAUDE.md`）差異（`git diff CLAUDE.md`）：
僅新增一段「考古題擷取規則」表格（4 條規則：查詢路徑禁用 `search_exam_questions`、空陣列判讀、科目分類提醒、批次原則），插入於「題庫結構」與「localStorage 現有結構」之間。其餘內容（部署平台、分支規則、Supabase schema 描述、Phase 2 設計決策）兩版本完全相同。

兩版本共同記載的相關敘述（逐條列出原文所在段落）：
- 「台灣司律國考備考 React SPA，**部署於 Vercel**」（專案定位）
- 「Vercel（部署）：https://law-quiz-three.vercel.app」（技術棧）
- 「共 530 題，涵蓋 114年（300題）與 113年（230題）司律一試，15 科」（題庫結構）
- localStorage 結構：`lawquiz_prog_v1`、`lawquiz_session_v1`（未提及 `lawquiz_bookmarks_v1`，見下方發現問題）
- Supabase Schema：`user_progress`、`penguin_journal`、`user_stats` 三表及其欄位描述
- 「在 dev 或 feature/* 分支作業，不直接 push 至 main」（開發分支規則——注意：實際開發分支為 `claude-dev`，非 `dev`，見比對表第 5 項）
- 「當前狀態」區塊記載至 2026-05-31，Phase 0／Phase 1 完成紀錄，**未反映 Phase 2 後續 commit（`df020e6`、`be18009`、`2f6c33b` 等）**

全域 `C:\Users\User\CLAUDE.md`（學習系統設定）與本專案無直接關聯條目；其內容為法律筆記／Notion 工作流規範，未提及 lawquiz 專案、Supabase、或部署平台。兩份 CLAUDE.md 屬不同層級（全域身份設定 vs. 專案技術上下文），無衝突。

### C. 題庫結構

`App.jsx` 位於 `src/App.jsx`，共 **2111 行**。

**題庫陣列**：`const QB = [ ... ]`，位於**第 33 行至第 664 行**。

**題目物件完整欄位清單**：`id, examCategory, year, examGroup, subject, text, options, answer, explanation, ref`
（注意：`ref` 欄位存在但非所有題目均使用，規劃書比對表未列此欄位，屬額外發現，見下方問題清單）

**完整題目物件範例**（`id:"civ-01"`）：
```js
{id:"civ-01",examCategory:"司律一試",year:"114年",examGroup:"綜合法學(二)",subject:"民法",
 text:"甲受輔助宣告，下列何項行為，無須經其輔助人同意？",
 options:["為獨資之負責人","向銀行借款新臺幣10萬元","受贈一台筆記型電腦","對車禍肇事者提起侵權訴訟"],
 answer:2,
 explanation:"輔助宣告人為「純獲法律上利益」之行為（如受贈），無須輔助人同意（民法§15-2）。"}
```

**依科目代碼 × 年度統計題數**（總計 530 題）：

| 年度 | 分類 | 科目 | 代碼 | 題數 |
|------|------|------|------|------|
| 114年 | 綜合法學(一) | 憲法 | con | 20 |
| 114年 | 綜合法學(一) | 行政法 | adm | 35 |
| 114年 | 綜合法學(一) | 法律倫理 | eth | 15 |
| 114年 | 綜合法學(一) | 刑法 | cri | 35 |
| 114年 | 綜合法學(一) | 刑事訴訟法 | csp | 25 |
| 114年 | 綜合法學(一) | 國際公法 | ipub | 10 |
| 114年 | 綜合法學(一) | 國際私法 | ipriv | 10 |
| 114年 | 綜合法學(二) | 民法 | civ | 50 |
| 114年 | 綜合法學(二) | 民事訴訟法 | cvp | 30 |
| 114年 | 綜合法學(二) | 公司法 | com | 15 |
| 114年 | 綜合法學(二) | 保險法 | ins | 10 |
| 114年 | 綜合法學(二) | 票據法 | neg | 10 |
| 114年 | 綜合法學(二) | 證券交易法 | sec | 10 |
| 114年 | 綜合法學(二) | 強制執行法 | enf | 10 |
| 114年 | 綜合法學(二) | 法學英文 | eng | 15 |
| **114年小計** | | | | **300** |
| 113年 | 綜合法學(一) | 憲法 | con | 20 |
| 113年 | 綜合法學(一) | 行政法 | adm | 35 |
| 113年 | 綜合法學(一) | 法律倫理 | eth | 15 |
| 113年 | 綜合法學(一) | 刑法 | cri | 35 |
| 113年 | 綜合法學(一) | 刑事訴訟法 | csp | 25 |
| 113年 | 綜合法學(一) | 國際公法 | ipub | 10 |
| 113年 | 綜合法學(一) | 國際私法 | ipriv | 10 |
| 113年 | 綜合法學(二) | 民法 | civ | 50 |
| 113年 | 綜合法學(二) | 民事訴訟法 | cvp | 30 |
| **113年小計** | | | | **230** |

113年缺科目：`com／sec／ins／neg／enf／eng`（公司法、證券交易法、保險法、票據法、強制執行法、法學英文）——與規劃書假設完全相符。

**`issues`、`statutes` 欄位撞名檢查**：全檔 `grep -n "issues\|statutes"` **無任何匹配**，兩欄位均未被既有程式使用，新增不會撞名。

### D. 作答歷史與 Supabase

**localStorage keys**：
| Key | 定義位置 | 讀寫位置 |
|-----|---------|---------|
| `lawquiz_prog_v1`（`LS`） | App.jsx:670 | App.jsx:674-683,827-828,849,1530；db.js:3,72 |
| `lawquiz_bookmarks_v1`（`BOOKMARK_LS`） | App.jsx:685 | App.jsx:686-687,828,850 |
| `lawquiz_session_v1`（`SESSION_LS`） | App.jsx:688 | App.jsx:689-691 |

注意：`lawquiz_bookmarks_v1` 存在於程式碼中，但**兩份 CLAUDE.md 皆未記載**此 key（見「發現的問題」）。

**Supabase 資料表呼叫**（表名、操作類型、行號）：
| 檔案:行號 | 表名 | 操作 |
|-----------|------|------|
| db.js:8 | user_progress | select |
| db.js:18 | user_progress | upsert |
| db.js:40 | user_progress | select |
| db.js:45 | user_progress | delete |
| db.js:59 | penguin_journal | select |
| penguinJournal.js:31 | user_stats | select |
| penguinJournal.js:67 | penguin_journal | upsert |
| penguinJournal.js:111 | user_stats | upsert |
| penguinJournal.js:125 | penguin_journal | select |
| penguinJournal.js:131 | penguin_journal | upsert |
| penguinJournal.js:139 | penguin_journal | upsert |
| penguinJournal.js:150 | user_stats | select |
| App.jsx:975 | penguin_journal | select |
| App.jsx:976 | user_stats | select |
| App.jsx:980 | penguin_journal | select |
| App.jsx:981 | user_stats | select |
| App.jsx:997 | penguin_journal | upsert |
| App.jsx:1008 | penguin_journal | select |
| App.jsx:1023 | user_stats | select |
| App.jsx:1024 | penguin_journal | select |

**作答歷史正本**：兩者並存。登入時流程為 `migrateFromLocalStorage(u.id)` → `fetchProgress(u.id)` 後以 `{...prev, ...remote}` 合併（App.jsx:963-964），**遠端（Supabase `user_progress`）覆蓋本地**，故已登入狀態下以 **Supabase 為準**；登出時 `handleSignOut()` 執行 `setProg(load())`（App.jsx:1047）退回 localStorage 快取，此時以 **localStorage 為準**。未登入使用者僅有 localStorage，無雲端同步。

**Supabase 專案 ref**：`qfkethioqskdclkzczmp`（自 `https://qfkethioqskdclkzczmp.supabase.co` 擷取，僅記錄網址子網域，未讀取 `.env` 內容或任何金鑰）。

### E. 錯誤處理現況

僅列**寫入**呼叫（upsert／insert／delete／update），逐一檢查：

| 行號 | 表名 | 操作 | 函式內是否 await | 函式內是否檢查 error | 呼叫端是否 await | 失敗時行為 |
|------|------|------|:---:|:---:|:---:|------|
| db.js:18 | user_progress | upsert | 是 | **否** | 否（App.jsx:1170 fire-and-forget） | 靜默失敗，UI 不知情，`prog` state 已本地更新但雲端可能未同步 |
| db.js:41 | user_progress | upsert（batch） | 是 | **否** | 否（App.jsx:853 fire-and-forget） | 同上，遷移或匯入資料可能靜默遺失 |
| db.js:45 | user_progress | delete | 是 | **否** | 否（App.jsx:1530 fire-and-forget） | 使用者按「清除進度」後，本地已清空但雲端可能未清除，兩端不一致 |
| penguinJournal.js:67 | penguin_journal | upsert | 是 | 是（解構 `{error}`，但僅回傳，未拋出） | 是（App.jsx:978 `await saveDailyJournal(userId)`），**但回傳值被捨棄** | 呼叫端未讀取 `error`，UI 顯示的 `penguinNote` 可能與資料庫實際內容不一致 |
| penguinJournal.js:111 | user_stats | upsert | 是 | 是（`{error}`，且**內部**用於決定是否繼續執行後續寫入，見第 123 行 `if(!error && ...)`） | 否（App.jsx:1170 `updateUserStats(...)` fire-and-forget，最終 `{error}` 回傳值無人接收） | 若失敗，`total_study_days`／`days_together` 未更新，但因未 await，UI 無從得知 |
| penguinJournal.js:131 | penguin_journal | upsert（questions_done） | 是 | **否** | 隨上層 updateUserStats 一併 fire-and-forget | 靜默失敗，當日題數計數可能漏計 |
| penguinJournal.js:139 | penguin_journal | upsert（milestone_type） | 是 | **否** | 隨上層 updateUserStats 一併 fire-and-forget | 靜默失敗，里程碑標記可能遺失，`/journey` 時間軸缺一筆 |
| App.jsx:997 | penguin_journal | upsert（user_note） | 是 | **否** | 是（`saveUserNote()` 內 await，但無 `{error}` 解構） | 使用者的「時光膠囊」留言可能未實際寫入，但 UI 已樂觀更新 `journalInput`，使用者不會發現 |

**結論**：8 個寫入呼叫中，僅 `penguinJournal.js:67`、`penguinJournal.js:111` 兩處在函式內部捕捉了 `error`，但這兩處的 `error` 在傳回呼叫端後**均未被讀取或處理**。所有 4 個呼叫端（App.jsx:853, 978, 1170, 1530）對寫入結果一律不 await 或不檢查——與規劃書假設「所有 Supabase 寫入皆已 await 並檢查 error」明顯不符（比對表第 10 項）。

`error_logs` 相關程式碼：`grep -rn "error_logs" src/` **無任何匹配**，確認尚未實作錯誤紀錄機制。

### F. 配色常數

配色常數定義於 `App.jsx:713-732`（`const T={...}`），非以中文命名，而是英文語意鍵名：

| 鍵名 | 色碼 | 推測對應語意 |
|------|------|------|
| `bg` | `#ECEAE5` | 背景（米灰） |
| `surface` | `#DDD9D2` | 卡片表面 |
| `surfaceDeep` | `#D0CBC2` | 深色表面 |
| `bdr` | `#C4BEB7` | 邊框 |
| `ink` | `#383B4E` | 主要文字（深藍灰） |
| `muted` / `accent` | `#798E9D` | 次要文字／強調色（霧藍調） |
| `faint` | `#A9A29A` | 淡化文字（砂紙調） |
| `accentHover` | `#5F7A8A` | 強調色 hover |
| `cta` | `#4C3D3E` | 主要按鈕（塵可可調） |
| `ctaHover` | `#3A2D2E` | 主要按鈕 hover |
| `green` / `greenBg` | `#6A9E72` / `#C8DBC8` | 成功色（苔綠調） |
| `red` / `redBg` | `#B07060` / `#E8CEC8` | 錯誤色（塵玫調） |
| `gold` / `goldBg` | `#D4A84B` / `#E8DEC8` | 強調金色 |

**重要限制**：程式碼中**完全沒有**「塵可可、霧藍、砂紙、塵玫、苔綠」這幾個中文色名的字面定義（`grep` 無匹配）。上表「推測對應語意」欄為依色碼色相與既有鍵名語意（`cta`/`muted`/`faint`/`red`/`green`）的**合理猜測，非程式碼內確認的對應關係**，此項標【？無法確認】。若這五個中文色名來自另一份設計規格文件（規劃書或 Notion），需請你提供該文件以便精確比對色碼，尤其規劃書提及「後兩色目前原型使用暫定值」——若指的是「塵玫」「苔綠」對應 `red`（`#B07060`）與 `green`（`#6A9E72`），這兩色確實看起來與其餘水彩色階（皆為低飽和灰調）風格略有差異、較鮮明，可能即為暫定值，但無法從程式碼本身確認。

另外，App.jsx:1841、1768 等處的 `#ECEAE5` 為重複硬編（未透過 `T.bg` 引用），屬程式碼一致性問題，非本次比對重點，僅記錄。

### G. Supabase 查詢結果

**【待苳提供】** 尚未取得 SQL Editor 查詢結果，比對表第 6、7 項與本節內容暫掛。請將 6 段 SELECT 查詢結果貼回，我會補入本節與比對表。

## 三、假設比對表

| # | 規劃書假設 | 判定 | 實際值／備註 |
|---|-----------|:---:|------|
| 1 | 題庫硬編在 App.jsx，不在資料庫 | ✓ | `QB` 陣列位於 App.jsx:33-664，無題庫相關資料庫呼叫 |
| 2 | 題數 530（114年300題／15科；113年230題，缺 com/sec/ins/neg/enf/eng） | ✓ | 完全相符，見 C 節統計表 |
| 3 | 版號 v14.10 | ✗ | git log 最新版號 commit 為 `f1a709a v14.10`，但 UI 頁首（App.jsx:1271）硬編顯示 `v14.5`，且其後仍有多筆未標版號的 Phase 2 commit（`df020e6`、`be18009`、`2f6c33b`、`17bfb30`），實際功能進度已超前 UI 顯示版號 |
| 4 | 部署平台為 Vercel；Netlify 已停用 | ✓ | 已提交版 CLAUDE.md 明確記載；`netlify.toml`/`vercel.json` 均不存在；git log 有 `v14: 直連官網模式，移除 Netlify Function 與設定檔` 佐證 |
| 5 | 本地 master、遠端 main、開發分支 claude-dev | ✗（部分） | 目前分支為 `claude-dev`（相符），但本地同時存在 `main` 與 `master` 兩支（非僅 master），遠端也同時有 `origin/main`、`origin/master`、`origin/claude-dev` 三支。已提交版 CLAUDE.md 記載「在 dev 或 feature/\* 分支作業，不直接 push 至 main」，用詞是 `dev` 而非 `claude-dev`，與實際分支名不完全一致 |
| 6 | Supabase 有 user_progress、user_stats、penguin_journal 三表，RLS 條件 auth.uid() = user_id | ？ | 待你提供 SQL Editor 查詢結果（G 節） |
| 7 | 上述三表已補 table-level GRANT | ？ | 待你提供 SQL Editor 查詢結果（G 節） |
| 8 | error_logs 表尚不存在 | ✓（程式碼面） | 程式碼無任何 `error_logs` 引用；資料庫是否已建表待 G 節查詢確認 |
| 9 | 題目物件尚無 issues、statutes 欄位 | ✓ | 全檔搜尋無匹配，欄位清單為 `id, examCategory, year, examGroup, subject, text, options, answer, explanation, ref`（含規劃書未提及的 `ref` 欄位） |
| 10 | 所有 Supabase 寫入皆已 await 並檢查 error | ✗ | 8 個寫入呼叫中，7 個未在任何層級檢查 error；2 個函式內部捕捉 error，但呼叫端皆未讀取回傳的 error，詳見 E 節表格 |
| 11 | 科目代碼為 civ/cvp/cri/csp/eth/con/adm/ipub/ipriv/com/ins/neg/sec/enf/eng | ✓ | 完全相符，15 碼皆與題目 id 前綴一致 |

## 四、發現的問題

1. **【阻斷／需處理】Supabase 寫入錯誤處理全面缺失**（比對表第 10 項）。所有寫入皆 fire-and-forget，使用者資料（作答進度、企鵝日誌、里程碑）在網路異常或 RLS 拒絕時會靜默遺失且 UI 無感知。爭點模組若比照現有模式寫入，會延續此風險——建議 Phase 2.5 錯誤防護網優先處理此項，而非僅新增 `error_logs` 表卻不接上既有呼叫點。
2. **【需處理】UI 版號與 git 進度不同步**（比對表第 3 項）。App.jsx:1271 硬編 `v14.5`，落後於最新 `v14.10` commit 及其後數筆未標版號的 Phase 2 commit，可能誤導除錯或使用者回報問題時的版本判斷。
3. **【提示】CLAUDE.md 分支敘述與實際分支名不一致**（比對表第 5 項）。已提交版寫「在 dev 或 feature/\* 分支作業」，但實際開發分支為 `claude-dev`；本地並存 `main`／`master` 兩支容易混淆推送目標。
4. **【提示】`lawquiz_bookmarks_v1`（書籤功能）localStorage key 未記載於任一份 CLAUDE.md**。此 key 確實存在並在 App.jsx 中讀寫（686-687, 828, 850 行），屬文件缺漏而非程式問題。
5. **【提示】題目物件多出 `ref` 欄位**，未列於規劃書原假設的欄位清單中，非所有題目使用。新增 `issues`／`statutes` 前建議一併確認 `ref` 欄位的既有用途，避免三者定義風格不一致。
6. **【提示】配色常數命名與規劃書所述中文色名（塵可可、霧藍、砂紙、塵玫、苔綠）無法直接對應**，程式碼內僅有英文語意鍵名。F 節已提供推測對應表，但需你確認或提供設計規格來源以精確核對，尤其規劃書提及「後兩色目前為暫定值」需要修正的具體對象。
7. **【提示】App.jsx 內存在重複硬編色碼**（如多處 `#ECEAE5` 未透過 `T.bg` 引用），與配色常數集中管理的假設精神不完全一致，但不影響本次比對結論。
8. **【提示】`npm run build` 成功**，但有 chunk size 警告（`dist/assets/index-*.js` 634 KB，超過 500 KB 建議值），單檔 JSX 架構下屬預期現象，暫不影響爭點模組施工可行性。

## 五、CLAUDE.md 待補值

- Vercel production URL：`https://law-quiz-three.vercel.app`（已於已提交版 CLAUDE.md 記載，本次盤點確認一致，無需變更）
- GitHub repo 完整名稱：`bluesand0423-eng/law-quiz`
- Supabase 專案 ref：`qfkethioqskdclkzczmp`
