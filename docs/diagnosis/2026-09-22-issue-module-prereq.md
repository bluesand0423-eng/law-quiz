# 爭點模組前置診斷報告｜2026-09-22

## 一、結論摘要

1. **【阻斷】Supabase 專案目前處於暫停狀態**（你於補充診斷中確認）。爭點模組若涉及新表或既有表寫入，在專案恢復前皆無法實測，且比對表第 6、7、8 項與 G 節之 SQL 查詢也無法在此狀態下取得。**不應在此狀態下進入前置施工**，須先恢復 Supabase 專案。
2. 撇開 Supabase 暫停不談，其餘核心假設（題庫結構、題數、部署平台、分支策略、科目代碼）均與規劃書相符，程式碼面準備度尚可。
3. 次嚴重的不符項：**Supabase 寫入錯誤處理全面缺失**——8 個寫入呼叫中，僅 1 個（`updateUserStats` 對 `user_stats` 的 upsert）在函式內部檢查了 `error`，其餘 7 個皆未檢查，且呼叫端（`App.jsx`）對所有寫入一律 fire-and-forget，不 await 也不檢查回傳值。此問題與「Supabase 暫停」直接相關：專案暫停期間，所有寫入呼叫會逐一失敗，但因無錯誤處理，使用者完全不會被告知，UI 表現與正常運作時幾乎無異（見四-1 詳述）。
4. `error_logs` 表確認尚不存在（規劃書假設相符）；`issues`／`statutes` 欄位確認尚未使用（規劃書假設相符），可安全新增不撞名。
5. 版號顯示與實際 commit 進度不同步：UI 頁首硬編 `v14.5`，但 git log 最新版號 commit 為 `v14.10`，其後仍有數個未標版號的 Phase 2 commit——顯示版號已過時，非規劃書所述現況本身的問題，但屬盤點發現。
6. Supabase 端（RLS、GRANT、schema、trigger）尚待你手動貼回 SQL Editor 查詢結果，且須待專案恢復後才能執行；本報告 G 節與比對表第 6、7 項暫標【待補・受阻】。

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

#### 補充：App 啟動並登入時，作答紀錄與日誌的同步方向

**答案：(c) 合併；衝突時原則上以「剛上傳後的 Supabase 內容」為準，但實際效果視上傳是否成功而定，且企鵝日誌／統計完全沒有本地備援。**分兩條資料線討論：

**① 作答進度（`user_progress` ↔ `lawquiz_prog_v1`）**——App.jsx:962-967：
```js
if(u){
  migrateFromLocalStorage(u.id).then(()=>
    fetchProgress(u.id).then(remote=>setProg(prev=>({...prev,...remote})))
  );
  loadPenguinData(u.id);
}
```
流程分三步，皆有明確行號：
1. **上傳**：`migrateFromLocalStorage(u.id)`（db.js:71-79）讀取 `lawquiz_prog_v1`，呼叫 `batchUpsertProgress`（db.js:30-42），以 `upsert(rows,{onConflict:"user_id,question_id"})`（db.js:41）將本地資料寫入 Supabase——**同一 question_id 的本地值會覆蓋 Supabase 既有值**（因 upsert 對衝突鍵是整列取代，非欄位級合併）。此步驟無 error 檢查（E 節已列）。
2. **下載**：接著 `fetchProgress(u.id)`（db.js:6-15）重新 `SELECT` 該使用者所有 `user_progress` 列；若 `error` 或 `!data`，**直接回傳 `{}`**（db.js:11）。
3. **合併寫回 React state**：`setProg(prev=>({...prev,...remote}))`（App.jsx:964）——`prev` 為目前 state（初始值來自 `useState(load)`，即 localStorage，App.jsx:784），`remote` 展開在後，**逐 key 覆蓋 prev**；`remote` 中沒有的 key 則保留 `prev`（本地）原值。

**衝突時以何者為準**：正常（Supabase 可連線）情況下，步驟 1 已把本地最新值寫回 Supabase，步驟 2 抓回的 `remote` 其實已內含步驟 1 剛寫入的值，因此步驟 3 的「remote 覆蓋 prev」在絕大多數 question_id 上等同「本地值原樣寫回」，只有*其他裝置*寫入、本地端沒有的 question_id 才會單純以 Supabase 為準補入。**但目前 Supabase 專案已暫停**，步驟 1 的上傳會靜默失敗、步驟 2 因連線錯誤觸發 `if (error || !data) return {}`，`remote` 變成空物件，`{...prev,...{}}` 等於沒有合併——此時退化為「完全保留本地」，效果類似 (b)，但這是 `fetchProgress` 錯誤時的防禦性回傳（`return {}`）造成的**副作用，並非刻意設計的離線合併策略**，一旦 Supabase 恢復，行為會立刻變回「遠端覆蓋本地」，需留意兩種狀態下實際合併結果不同。

**② 企鵝日誌／統計（`penguin_journal`、`user_stats`）**——App.jsx:972-992 `loadPenguinData`：**沒有 localStorage 備援**，純粹是 Supabase → UI 的單向讀取（無合併、無上傳步驟）：
```js
async function loadPenguinData(userId){
  ...
  await saveDailyJournal(userId);          // App.jsx:978，寫入失敗會被靜默吞掉
  const[{data:journal2},{data:stats2}]=await Promise.all([
    supabase.from("penguin_journal")...,   // App.jsx:980
    supabase.from("user_stats")...,        // App.jsx:981
  ]);
  setPenguinData({
    penguinNote: journal2?.penguin_note ?? "今天也一起努力了。",
    totalStudyDays: stats2?.total_study_days ?? 0,
    totalQuestions: stats2?.total_questions ?? 0,
    daysTogether: Math.max(1, stats2?.days_together ?? 1),
  });                                        // App.jsx:983-989
}
```
Supabase 暫停時，`journal2`／`stats2` 皆為 `undefined`，因此**每次登入都會顯示重置後的預設值**（累積題數 0、認識天數 1、日誌文案退回初始版本），即使資料庫裡實際仍保有累積紀錄——因為這條資料線完全無本地快取可退回，行為上與作答進度的「意外保留本地」不同，是**看起來像資料歸零、實際只是讀不到**的表現，屬於本次補充診斷「Supabase 暫停」發現的具體使用者可見症狀（詳見四-1）。

#### 追加分析：恢復 Supabase 後、開啟 App 前的五項確認（僅分析，未修改程式碼）

**1. `migrateFromLocalStorage` 是每次登入都執行，還是有一次性旗標？**

**沒有任何一次性旗標**——不論在 `localStorage`、`sessionStorage`、Supabase 資料表欄位（如 `migrated_at`）皆搜尋不到相關鍵值（`grep -rn "migrat" src/` 僅命中函式定義 db.js:71 與唯一呼叫點 App.jsx:963，無旗標邏輯）。`migrateFromLocalStorage`（db.js:71-79）本身的唯一門檻是「`localStorage.getItem(LS)` 是否存在且可解析」（db.js:72-76），而 `LS`＝`lawquiz_prog_v1` 是作答進度的**持續性**主存放區（每次作答都會 `save()` 寫回，App.jsx:1169 `save(np)`），不會被清空或標記已遷移，所以**這個門檻恆為真，等同沒有門檻**。

更關鍵的是呼叫時機：App.jsx 存在**兩個獨立的 useEffect**都在處理 Supabase Auth 狀態（953-970 行）：
- **useEffect A**（953-958）：`supabase.auth.getSession().then(...)`，僅在元件掛載時執行一次，若已有 session 則呼叫 `fetchProgress`＋`loadPenguinData`——**不含** `migrateFromLocalStorage`。
- **useEffect B**（959-968）：`supabase.auth.onAuthStateChange((_evt,session)=>{...})`，callback 對 `_evt`（事件類型）**完全未過濾**（959 行：`_evt` 有取值但從未使用），只要有 session 就無條件執行完整流程，**含** `migrateFromLocalStorage`（963 行）。

Supabase JS v2 的 `onAuthStateChange` 依規格會在**訂閱當下立即觸發一次**（通常帶 `INITIAL_SESSION` 事件），此後 `SIGNED_IN`、`SIGNED_OUT`、`TOKEN_REFRESHED`（預設存取權杖每小時左右自動刷新一次）、`USER_UPDATED` 等事件都會再次觸發。因此實際效果是：**`migrateFromLocalStorage` 不只「每次登入」執行一次，而是在同一次瀏覽器工作階段中，只要 token 靜默刷新就會再跑一次**，且與 useEffect A 幾乎同時觸發，導致 `fetchProgress`／`loadPenguinData` 在恢復連線後首次開啟 App 時很可能被呼叫兩次（一次來自 A，一次來自 B 的初始觸發）。

**2. `migrateFromLocalStorage` 的 upsert 是否 await 完成後才呼叫 `fetchProgress`？行號？**

**是，確實循序等待，非平行競速**：
- App.jsx:963-965：`migrateFromLocalStorage(u.id).then(()=>fetchProgress(u.id).then(remote=>setProg(prev=>({...prev,...remote}))))`——`.then()` 保證 `migrateFromLocalStorage` 的 Promise resolve 後才呼叫 `fetchProgress`。
- db.js:77：`await batchUpsertProgress(userId, progObj);`——`migrateFromLocalStorage` 內部確實 `await` 了 db.js:41 的 upsert，其 Promise 要等 upsert 呼叫回應（無論成功或失敗）才 resolve。

**但需留意**：supabase-js 的 upsert 呼叫**即使失敗也不會 reject**（回傳 `{data,error}` 物件，不 throw），所以「等待完成」只保證時序上的先後，**不保證上傳真的成功**——若 upsert 因 RLS 拒絕或連線問題而 `error`，`.then()` 仍會照常觸發，`fetchProgress` 一樣會接著執行，只是抓回的可能是尚未反映本地最新值的舊資料。

**3. db.js:41 的 upsert 粒度與 onConflict 鍵？**

**逐題一列，一次 API 呼叫批次寫入多列**（非「整包使用者資料存成一列 JSON」）。db.js:30-42：
```js
export async function batchUpsertProgress(userId, progObj) {
  const rows = Object.entries(progObj).map(([question_id, { stars, attempts }]) => ({
    user_id: userId, question_id, stars, attempts,
    last_seen_at: new Date().toISOString(),
  }));                                    // 每個 question_id 一個獨立物件
  if (!rows.length) return;
  await supabase.from("user_progress").upsert(rows, { onConflict: "user_id,question_id" });  // db.js:41
}
```
`rows` 是陣列，元素數＝本地 `lawquiz_prog_v1` 中已作答的題目數；一次呼叫把整個陣列傳給 `.upsert()`，由 PostgREST 在單次請求內對每一列各自比對 `onConflict`。**onConflict 鍵為複合鍵字串 `"user_id,question_id"`**（逐題級別去重／覆蓋，而非整個使用者一列）。

**4. 企鵝日誌與 user_stats：是否有寫入可能在 `loadPenguinData` 完成前、以預設值（歸零狀態）執行？`updateUserStats` 與 `checkIsReturning` 的呼叫時序檢查**

**結論：`updateUserStats`、`checkIsReturning`、以及 `saveDailyJournal` 內的統計讀取，三者皆各自獨立向 Supabase 發送 `SELECT`，完全不依賴 `loadPenguinData` 是否已完成、也不讀取 `penguinData`／`journeyData` 這類 React state（那些 state 只用於畫面顯示，不參與寫入計算）。**因此「因為 `loadPenguinData` 還沒跑完，導致 `updateUserStats` 誤讀了 UI 上顯示的歸零值」這種路徑**不存在**。

但存在另一條更嚴重、獨立於 `loadPenguinData` 的風險路徑，直接回答第 4 題「是否有寫入可能以預設值執行」：

- `updateUserStats(userId, questionsToday)`（penguinJournal.js:87-146）由 `handleAns()`（App.jsx:1159-1174，使用者答題點擊的 callback）在第 1170 行直接呼叫：`updateUserStats(userRef.current.id,1)`，**沒有任何 loading gate**——`handleAns` 只要 `userRef.current` 存在就會呼叫，不檢查 `loadPenguinData`／`penguinData` 是否已就緒，使用者可以在 App 剛掛載、甚至 Supabase 剛從暫停恢復、任何背景讀取都還沒完成時就直接作答。
- `updateUserStats` 第一步是 `const existing = await _fetchStats(userId);`（91 行），`_fetchStats`（penguinJournal.js:29-36）自己執行 `supabase.from("user_stats").select("*")...maybeSingle()`，**只解構 `data`、未解構 `error`**（30-34 行：`const {data} = await supabase...; return data;`）——若此次 SELECT 因任何原因失敗（連線錯誤、專案剛恢復尚在冷啟動、逾時），`data` 會是 `null`／`undefined`，函式一律回傳該值，呼叫端無從分辨「使用者本來就沒有紀錄（真的是新使用者）」與「查詢失敗（其實有紀錄，只是讀不到）」。
- 後續計算（95-109 行）對這兩種情況一視同仁：`prevStudyDays = existing?.total_study_days ?? 0`、`prevQuestions = existing?.total_questions ?? 0`、`firstLoginAt = existing?.first_login_at ?? now.toISOString()`——查詢失敗會被當成「這是全新使用者」處理。
- 緊接著 111-121 行**直接以這組（可能是誤判的）新使用者數值執行 `upsert`**，`onConflict:"user_id"`：
  ```js
  const { error } = await supabase.from("user_stats").upsert(
    { user_id: userId, total_questions: totalQuestions, total_study_days: totalStudyDays,
      days_together: daysTogether, first_login_at: firstLoginAt, last_login_at: now.toISOString() },
    { onConflict: "user_id" }
  );
  ```
  由於 `onConflict` 鍵是單一 `user_id`（每位使用者僅一列），此 upsert 對已存在的列是**整列覆蓋**，並非只累加差異——若前一步的讀取因暫停剛恢復、連線尚未穩定而誤判為「新使用者」，這次寫入會**直接用歸零附近的數值（`total_study_days`≈1、`total_questions`＝本次答題數、`first_login_at`＝現在時間）覆蓋掉資料庫裡原本真實的累積紀錄**，且全程無重試、無二次確認，`error` 雖有解構（123 行 `if(!error && ...)`）但僅用於決定是否接著寫 `penguin_journal`，並未用於阻止或回滾這次已經送出的覆蓋寫入。

- `checkIsReturning(userId)`（penguinJournal.js:149-161）同樣獨立查詢 `user_stats.select("last_login_at")`（150-154 行），若查詢失敗，`data` 為 `null`，則 `if (!data?.last_login_at) return false;`（156 行）——**失敗時安全地回傳 `false`（不觸發「歡迎回來」），屬於保守失效（fail-safe），不會造成資料覆寫**，風險遠低於 `updateUserStats`。
- `saveDailyJournal` 內的 `_fetchStats` 讀取（penguinJournal.js:43-44）若失敗，只影響當日 `penguin_note` 文案選字（用於 `getPenguinNote`），**不寫入任何統計數字**，屬於顯示層級風險，非資料覆寫風險。

**5. 依以上結果，判斷恢復後首次登入的風險**

- **本機新紀錄（作答進度）是否可能被舊雲端資料覆蓋？** 風險**低但非零**。第 2 題已確認上傳（db.js:41 upsert）必定先於下載（`fetchProgress`）完成才觸發，正常情況下下載回來的 remote 資料已內含剛上傳的本地值，`setProg` 合併（App.jsx:964）不會用「舊」雲端資料覆蓋「新」本地資料。唯一例外：若上傳本身因故失敗（error 但不 reject，見第 2 題），且**恢復後 Supabase 短暫可連線但該次寫入仍失敗**、隨後的下載卻成功抓到舊資料，此時 `remote` 會是舊值並覆蓋 `prog` state 中對應 question_id 的新本地值——但**不會覆蓋雲端沒有記錄、只存在本地的 question_id**（因為 `{...prev,...remote}` 對 remote 沒有的 key 保留 prev）。整體而言，這是「部分題目的星級／作答次數退回舊值」的中低風險，而非整批本地資料被清空。
- **統計（`user_stats`）是否可能被歸零值覆寫？** **是，這是本次分析找到的最高風險項**，機制已在第 4 題詳述：`updateUserStats` 對讀取失敗與「真的是新使用者」一視同仁，且其 upsert 是整列覆蓋（`onConflict:"user_id"`），一旦在 Supabase 剛恢復、冷啟動延遲或短暫連線不穩的視窗期內使用者剛好作答（`handleAns` 無 loading gate，隨時可能觸發），`total_study_days`、`total_questions`、`first_login_at` 這些**不會自動重算、只靠這次 upsert 寫入**的欄位就可能被永久覆寫成接近歸零的值，且沒有任何 UI 提示或錯誤記錄（`error` 未被用於阻擋或告警）。
- **建議**（僅供你參考，本次未修改程式碼）：恢復 Supabase 後，建議**先手動確認 `user_stats` 能穩定查詢成功**（例如在 Supabase Dashboard 對該表跑一次 SELECT）再開啟 App 作答；若要根本解決，`updateUserStats` 需要區分「查無資料列」與「查詢本身出錯」兩種情況（例如檢查 `_fetchStats` 的 `error`，出錯時中止 upsert 而非以預設值繼續），這屬於 Phase 2.5 錯誤防護網的範圍，與四-2 所述「全面缺失 error 檢查」為同一根因。

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

**【已解除】** Supabase 專案已恢復連線，苳已於 SQL Editor 執行第 3 節六段唯讀查詢（2026-09-22 補充）。

**查詢 1｜現有資料表**（3 rows）：`penguin_journal`、`user_progress`、`user_stats`。`error_logs` 確認不存在。

**查詢 2｜RLS 是否啟用**（3 rows）：`penguin_journal`、`user_progress`、`user_stats` 皆為 `true`。

**查詢 3｜RLS policy 明細**（3 rows）：

| tablename | policyname | cmd | roles | qual | with_check |
|---|---|---|---|---|---|
| penguin_journal | own rows | ALL | {public} | (auth.uid() = user_id) | (auth.uid() = user_id) |
| user_progress | own rows | ALL | {public} | (auth.uid() = user_id) | (auth.uid() = user_id) |
| user_stats | own row | ALL | {public} | (auth.uid() = user_id) | (auth.uid() = user_id) |

**查詢 4｜table-level GRANT**（6 rows）：三張表對 `anon` 與 `authenticated` 皆為 `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`。

**查詢 5｜各表欄位**（22 rows）：
- `penguin_journal`：`id uuid NOT NULL`、`user_id uuid NOT NULL`、`date date NOT NULL`、`questions_done int`、`minutes_spent int`、`fish_earned int`、`penguin_note text`、`user_note text`、`milestone_type text`
- `user_progress`：`id uuid NOT NULL`、`user_id uuid NOT NULL`、`question_id text NOT NULL`、`stars ARRAY`、`attempts int`、`last_seen_at timestamptz`
- `user_stats`：`user_id uuid NOT NULL`、`total_questions int`、`streak_days int`、`total_study_days int`、`days_together int`、`first_login_at timestamptz`、`last_login_at timestamptz`

`user_stats` 無 `updated_at` 欄位。

**查詢 6｜既有 trigger**：0 rows（Success. No rows returned）——三張表皆無任何 trigger。

**結論（資料層 vs. 應用層）**：資料層沒有問題，病灶全部在應用層。先前存在「寫入失敗是否因 GRANT 又缺」的可能性，本次查詢排除——權限、RLS、policy 全部正常。六月的教訓只學到一半：GRANT 補對了，但「應用程式把失敗當成功」這一半當時沒修，直到 2026-09-22 的 hotfix（`6d4a028`）才處理。

**尚待補查（查詢 7｜主鍵與唯一約束）**：本次六段查詢未涵蓋主鍵與唯一約束。三表所有 upsert 皆依賴 `onConflict`（`user_progress`: `user_id,question_id`；`user_stats`: `user_id`；`penguin_journal`: `user_id,date`），`onConflict` 指定欄位若無對應唯一約束，upsert 會直接報錯，此點目前**未驗證**，維持【待補・受阻】。待苳補跑下列查詢並貼回結果後，需逐一核對上述三組 `onConflict` 鍵是否都有對應的唯一約束：

```sql
select tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE')
group by tc.table_name, tc.constraint_type, tc.constraint_name
order by tc.table_name, tc.constraint_type;
```

## 三、假設比對表

| # | 規劃書假設 | 判定 | 實際值／備註 |
|---|-----------|:---:|------|
| 1 | 題庫硬編在 App.jsx，不在資料庫 | ✓ | `QB` 陣列位於 App.jsx:33-664，無題庫相關資料庫呼叫 |
| 2 | 題數 530（114年300題／15科；113年230題，缺 com/sec/ins/neg/enf/eng） | ✓ | 完全相符，見 C 節統計表 |
| 3 | 版號 v14.10 | ✗ | git log 最新版號 commit 為 `f1a709a v14.10`，但 UI 頁首（App.jsx:1271）硬編顯示 `v14.5`，且其後仍有多筆未標版號的 Phase 2 commit（`df020e6`、`be18009`、`2f6c33b`、`17bfb30`），實際功能進度已超前 UI 顯示版號 |
| 4 | 部署平台為 Vercel；Netlify 已停用 | ✓ | 已提交版 CLAUDE.md 明確記載；`netlify.toml`/`vercel.json` 均不存在；git log 有 `v14: 直連官網模式，移除 Netlify Function 與設定檔` 佐證 |
| 5 | 本地 master、遠端 main、開發分支 claude-dev | ✗（部分） | 目前分支為 `claude-dev`（相符），但本地同時存在 `main` 與 `master` 兩支（非僅 master），遠端也同時有 `origin/main`、`origin/master`、`origin/claude-dev` 三支。已提交版 CLAUDE.md 記載「在 dev 或 feature/\* 分支作業，不直接 push 至 main」，用詞是 `dev` 而非 `claude-dev`，與實際分支名不完全一致 |
| 6 | Supabase 有 user_progress、user_stats、penguin_journal 三表，RLS 條件 auth.uid() = user_id | ✓ | 已由 G 節查詢 2、3 證實：三表皆存在，RLS 皆啟用（`true`），policy 條件皆為 `auth.uid() = user_id` |
| 7 | 上述三表已補 table-level GRANT | ✓ | 已由 G 節查詢 4 證實：三表對 `anon` 與 `authenticated` 皆已授予完整權限（六月修復確實生效） |
| 8 | error_logs 表尚不存在 | ✓ | 程式碼面與資料庫面皆確認：G 節查詢 1 證實資料庫中亦無此表 |
| 9 | 題目物件尚無 issues、statutes 欄位 | ✓ | 全檔搜尋無匹配，欄位清單為 `id, examCategory, year, examGroup, subject, text, options, answer, explanation, ref`（含規劃書未提及的 `ref` 欄位） |
| 10 | 所有 Supabase 寫入皆已 await 並檢查 error | ✗ | 8 個寫入呼叫中，7 個未在任何層級檢查 error；2 個函式內部捕捉 error，但呼叫端皆未讀取回傳的 error，詳見 E 節表格 |
| 11 | 科目代碼為 civ/cvp/cri/csp/eth/con/adm/ipub/ipriv/com/ins/neg/sec/enf/eng | ✓ | 完全相符，15 碼皆與題目 id 前綴一致 |

## 四、發現的問題

1. **【阻斷】Supabase 專案目前處於暫停狀態**（你於補充診斷中確認）。具體使用者可見症狀：
   - 作答進度（`user_progress`）：因 `fetchProgress` 對錯誤採防禦性回傳 `{}`（db.js:11），登入時的合併步驟（App.jsx:964）等於無效，UI 上**意外地**保留 localStorage 資料，暫時看不出異常。
   - 企鵝日誌／統計（`penguin_journal`、`user_stats`）：`loadPenguinData`（App.jsx:972-992）無本地備援，每次登入會顯示重置後的預設值（累積題數 0、認識天數 1），**看起來像資料歸零，實際上只是讀不到**——這與企鵝文案「不得表現失望、不得因未登入抱怨」的既有原則無直接牴觸（因為文案邏輯本身仍會執行，只是輸入值全為預設），但呈現的數字本身具有誤導性。
   - 在專案恢復前，比對表第 6、7、8 項無法查證，Phase 2.5 錯誤防護網與爭點模組的寫入路徑也無法實測。
   - **建議**：先恢復 Supabase 專案為施工前置條件之一，且應優先於／同步於「補齊 error 檢查」一併處理，否則問題 2 所述缺失會持續讓此類中斷對使用者不可見。
2. **【阻斷／需處理】Supabase 寫入錯誤處理全面缺失**（比對表第 10 項）。所有寫入皆 fire-and-forget，使用者資料（作答進度、企鵝日誌、里程碑）在網路異常或 RLS 拒絕時會靜默遺失且 UI 無感知。爭點模組若比照現有模式寫入，會延續此風險——建議 Phase 2.5 錯誤防護網優先處理此項，而非僅新增 `error_logs` 表卻不接上既有呼叫點。
3. **【需處理】UI 版號與 git 進度不同步**（比對表第 3 項）。App.jsx:1271 硬編 `v14.5`，落後於最新 `v14.10` commit 及其後數筆未標版號的 Phase 2 commit，可能誤導除錯或使用者回報問題時的版本判斷。
4. **【提示】CLAUDE.md 分支敘述與實際分支名不一致**（比對表第 5 項）。已提交版寫「在 dev 或 feature/\* 分支作業」，但實際開發分支為 `claude-dev`；本地並存 `main`／`master` 兩支容易混淆推送目標。
5. **【提示】`lawquiz_bookmarks_v1`（書籤功能）localStorage key 未記載於任一份 CLAUDE.md**。此 key 確實存在並在 App.jsx 中讀寫（686-687, 828, 850 行），屬文件缺漏而非程式問題。
6. **【提示】題目物件多出 `ref` 欄位**，未列於規劃書原假設的欄位清單中，非所有題目使用。新增 `issues`／`statutes` 前建議一併確認 `ref` 欄位的既有用途，避免三者定義風格不一致。
7. **【提示】配色常數命名與規劃書所述中文色名（塵可可、霧藍、砂紙、塵玫、苔綠）無法直接對應**，程式碼內僅有英文語意鍵名。F 節已提供推測對應表，但需你確認或提供設計規格來源以精確核對，尤其規劃書提及「後兩色目前為暫定值」需要修正的具體對象。
8. **【提示】App.jsx 內存在重複硬編色碼**（如多處 `#ECEAE5` 未透過 `T.bg` 引用），與配色常數集中管理的假設精神不完全一致，但不影響本次比對結論。
9. **【提示】`npm run build` 成功**，但有 chunk size 警告（`dist/assets/index-*.js` 634 KB，超過 500 KB 建議值），單檔 JSX 架構下屬預期現象，暫不影響爭點模組施工可行性。
10. **【需處理】`anon` 角色具備三表完整權限（含 DELETE、TRUNCATE），policy 的 `roles` 為 `{public}`（涵蓋 anon）而非 `{authenticated}`**（G 節查詢 3、4）。目前不會出事，因 RLS 的 `auth.uid() = user_id` 對匿名使用者不成立；但違反最小權限原則——若某張表的 RLS 被關閉或 policy 寫錯，匿名使用者即可清空整張表。處置：收緊需執行 `REVOKE`，屬寫入操作，排入 Phase 2.5，本次不動。
11. **【需處理】六段唯讀查詢未涵蓋主鍵與唯一約束**，而三表所有 upsert 均依賴 `onConflict`（`user_progress`: `user_id,question_id`；`user_stats`: `user_id`；`penguin_journal`: `user_id,date`，見 db.js:27,44、penguinJournal.js:75,134,159,172、App.jsx:1021），`onConflict` 指定欄位若無對應唯一約束會直接報錯，目前未驗證。已於 G 節附上查詢 7 的 SQL，待苳補跑並貼回結果後，需逐一核對上述三組 `onConflict` 鍵是否都有對應的唯一約束。

## 五、CLAUDE.md 待補值

- Vercel production URL：`https://law-quiz-three.vercel.app`（已於已提交版 CLAUDE.md 記載，本次盤點確認一致，無需變更）
- GitHub repo 完整名稱：`bluesand0423-eng/law-quiz`
- Supabase 專案 ref：`qfkethioqskdclkzczmp`
