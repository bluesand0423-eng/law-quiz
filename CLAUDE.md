# 司律練功房 ── Claude Code 專案上下文

## 專案定位
台灣司律國考備考 React SPA，部署於 Vercel。
灰麻糬企鵝是陪伴考生備考的「見證者」，不是寵物養成遊戲。
核心價值主張：這個世界記得你曾經努力過。

## 技術棧
- React（單檔 JSX，無 TypeScript）
- Supabase（Auth + Database）——已接入
- Vercel（部署）：https://law-quiz-three.vercel.app
- 無 UI framework，純 inline styles

## 題庫結構
共 530 題，涵蓋 114年（300題）與 113年（230題）司律一試，15 科。

## 考古題擷取規則

| 規則 | 說明 |
|------|------|
| 查詢路徑 | 一律走 `opendata-list_domains` → `opendata-search_datasets` → `opendata-get_exam_paper`；禁用 `search_exam_questions`（依賴 embedding，服務降級時靜默回空陣列） |
| 空陣列判讀 | `questions` 陣列為空 ＝「沒查成」而非「沒有題目」，須改路徑重試，不可逕自改為自編 |
| 科目分類 | 行政法在「綜合法學（一）」；民法在「綜合法學（二）」；兩者不同分類，勿掃錯 |
| 批次原則 | 出題一律小批：一次 1–2 年度，邊做邊 append，context 接近滿載前先收尾，嚴禁一次處理全部 |

### 題目物件的冰原欄位

- `issues: string[]` — 對應的爭點卡 slug（苳的整理）
- `statutes: string[]` — 對應的條號 canonical key（出題事實）

兩者各自獨立：出題頻率只看 `statutes`，不受爭點卡進度影響。
**不預先為所有題目加空陣列**；程式一律透過 `src/icefield/questionFields.js`
的存取器讀取，欄位不存在即視為空。新匯入的題目有標註才帶欄位。

## localStorage 現有結構
- key: lawquiz_prog_v1（作答進度）
  格式：{ "題目ID": { "stars": ["r"/"g"/"e","r"/"g"/"e",...], "attempts": 次數 } }
  r = 答錯, g = 答對, e = 未答
- key: lawquiz_session_v1（當前 session）
  格式：{ "queue": [題目ID陣列], "qi": 當前題號, "answers": {}, "elapsed": 秒數 }

遷移時 lawquiz_prog_v1 轉入 user_progress，lawquiz_session_v1 不需要保留。

## Supabase Schema（已建立）
- user_progress：題目作答紀錄，stars text[] 對應 5 星機制
- penguin_journal：每日企鵝日誌，含 penguin_note、user_note（時光膠囊）、milestone_type TEXT
- user_stats：total_study_days 為主指標（不歸零），streak_days 為次要，days_together 從 first_login_at 起算
- issues／issue_links／issue_statutes：冰原爭點卡三表，見 `supabase/migrations/20260924_p0a_icefield_tables.sql`

## 企鵝文案永久禁止事項
- 不得指責、製造罪惡感、表現失望、因未登入抱怨
- 三天以上未登入回來 → 必須是「歡迎回來」，無例外

## 開發分支規則
在 dev 或 feature/* 分支作業，不直接 push 至 main

## 當前狀態

最後更新：2026-10-13

### 已完成
- **Phase 0**：Supabase 地基（Auth + 三張資料表 + RLS）
- **Phase 1**：企鵝見證者 MVP（水彩設計系統 + 企鵝日誌卡片）
- 正式部署至 Vercel，commit 72fe039，15 files changed

### 冰原現況（依 git log，各 commit 原始訊息）
- **P0-A 建表**
  - `4a0d4f4` 新增 P0-A 冰原建表 migration 紀錄
  - `6a7c0ef` 建表 SOP 補上 REVOKE anon 步驟
- **P0-B 資料層與基礎 CRUD 畫面**
  - `7a01e2d` 新增題目物件的冰原欄位約定與存取器
  - `cc95fc0` 新增條號正規化工具與單元測試
  - `26305d3` 新增冰原資料存取層
  - `8df52e7` 新增冰原爭點卡列表、詳情與編輯畫面
  - `c0fcf27` 補上爭點卡的出處與要件文字欄位
- **法典代碼與科目代碼分離**
  - `62a3481` 法典代碼與科目代碼分離
- **P1 法條大廳／房間**
  - `1fa626c` 冰原力導向佈局抽出為純函式
  - `2873249` 新增冰原法條大廳與法條房間

### 新增檔案（src/）
| 檔案 | 說明 |
|------|------|
| supabaseClient.js | Supabase client 初始化（VITE_ 環境變數） |
| auth.js | Email 登入 / 登出 / 監聽 |
| db.js | user_progress / penguin_journal / user_stats CRUD + migrateFromLocalStorage |
| penguinJournal.js | getPenguinNote / saveDailyJournal / updateUserStats / checkIsReturning |
| penguinJournal.test.js | 19 個 unit tests，全通過（vitest） |

### 待修正（Phase 2 開發前先做）
1. **days_together 計算**：`Math.floor(...) + 1`（第一天顯示「認識 1 天」而非 0）
2. **Supabase SQL**：
   ```sql
   CREATE INDEX idx_penguin_journal_user_date ON penguin_journal(user_id, date DESC);
   ```
3. **penguin_journal 新增欄位**：
   ```sql
   ALTER TABLE penguin_journal ADD COLUMN milestone_type TEXT;
   -- 可能值：FIRST_DAY / DAY_100 / ONE_YEAR / QUESTIONS_1000
   ```

### Phase 2 設計決策

#### 今日回憶（cascade 設計）
`db.js` 新增 `getTodayMemory(userId)`，依序尋找以下日期的 penguin_journal 記錄：
365 天前 → 100 天前 → 30 天前 → 7 天前
取第一筆有記錄者顯示，全部找不到則不顯示回憶區塊。

#### 周年文案觸發條件
`totalStudyDays === 365`（嚴格相等），**不使用 `>= 365`**。
周年是一次性事件，不是永久狀態；隔天應顯示一般文案。

#### 新增頁面：/journey（我們的旅程）
一頁式總覽，顯示：
- 第一次登入日期
- 累積天數、累積題數、留言則數
- 里程碑時間軸（從 `penguin_journal.milestone_type` 欄位讀取）

#### 里程碑標籤轉換
不新增 `milestone_title` 資料庫欄位。前端以常數 object 轉換：
```js
const MILESTONE_LABELS = {
  FIRST_DAY:      "第一天",
  DAY_100:        "第 100 天",
  ONE_YEAR:       "一週年",
  QUESTIONS_1000: "累積 1000 題",
};
```

## 冰原批次匯入 JSON 格式

供 `src/icefield/IssueImport.jsx` 貼上使用；寫入一律以 `status: "draft"`（JSON 帶其他值會被改寫並在預覽中標示），一律透過既有的 `createIssue`／`setStatutes`／`createLinks`，不直接操作資料表。

```json
{
  "source": "講義名稱 第X章 p.12–18",
  "issues": [
    {
      "ref": "a1",
      "subject": "cvp",
      "title": "爭點一句話（疑問句）",
      "statement": "正文",
      "views": [
        { "type": "通說",   "holder": "", "content": "" },
        { "type": "有力說", "holder": "", "content": "" },
        { "type": "實務",   "holder": "", "content": "" }
      ],
      "statutes": ["cvp-400-1"],
      "sources": "出處與要件文字",
      "practice_divergent": false
    }
  ],
  "links": [
    { "from": "a1", "to": "a2", "type": "prerequisite" }
  ]
}
```

`links` 的 `from`／`to` 可以是本批的 `ref`，也可以是資料庫已存在的 slug。

### validateImport 規則（任一錯誤即不得寫入）
- `subject` 必須在 SUBJECTS 內；`title` 非空；`ref` 本批內唯一
- `views` 可省略（視為三格空白）；若提供，必須恰為三格，`type` 依序為通說、有力說、實務（IssueForm 讀到長度不是 3 的 views 會整個重設為空，之後存檔就會把資料洗掉）
- `statutes` 每一筆：`parseStatuteKey` 非 null，且 `formatStatuteKey` 非 null；法典代碼不在 LAW_CODES 的，錯誤訊息要寫出代碼
- 任何文字欄位含 `[[`：錯誤（本批卡片在寫入前沒有 slug，連結一律放 `links`）
- `links`：`type` 在 LINK_TYPES 內；`from ≠ to`；端點須為本批 ref 或既有 slug
- 重複偵測：同 subject 下已存在相同 title（去除前後空白後完全相同）的卡 → 標為「略過，沿用既有 slug」，不算錯誤，讓中途失敗後可直接重貼同一份 JSON

### runImport 寫入順序（不可並行）
1. 依序 `createIssue`（`status: "draft"`）
2. 每張新卡建完立即 `setStatutes`
3. 全部卡完成後，以 ref→slug 對照表解析 `links`，呼叫 `createLinks`
4. 任何一步失敗：立即停止、`notifySyncFailure()`，回傳已完成的 ref→slug 對照與停在哪一步；不回滾

`createLinks(rows)`：寫入 `auto: false` 的手動連結，以 `(user_id, from_slug, to_slug, link_type)` 為衝突鍵 upsert 並忽略重複，使重貼不會失敗。

## 開發原則

北境書房可以接受功能暫時沒有，但不能接受
「看起來成功、實際上資料沒有寫進去」。

- 不要把「資料正確性問題」與「功能開發問題」混成同一個 phase
- 空白資料 ＜ 錯誤資料。不確定就留空或標【待查證】，絕不猜
- 延後的是圖的複雜度，不是可見成果
- 所有 Supabase 寫入必須 await、檢查 error、失敗可見；禁止 fire-and-forget
- 建表 SOP 五步：CREATE TABLE → RLS policy（指定 TO authenticated）
  → table-level GRANT 給 authenticated → REVOKE ALL FROM anon
  → 以非 service-role 金鑰實測讀寫
  （Supabase 預設權限會自動授予 anon，其中 TRUNCATE 不受 RLS 保護，
   故 REVOKE 為必要步驟，不可省略）
