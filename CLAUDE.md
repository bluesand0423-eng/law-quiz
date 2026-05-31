# 司律練功房 ── Claude Code 專案上下文

## 專案定位
台灣司律國考備考 React SPA，部署於 Vercel。
灰麻糬企鵝是陪伴考生備考的「見證者」，不是寵物養成遊戲。
核心價值主張：這個世界記得你曾經努力過。

## 技術棧
- React（單檔 JSX，無 TypeScript）
- Supabase（Auth + Database）——尚未接入，Phase 0 目標
- Vercel（部署）
- 無 UI framework，純 inline styles

## 題庫結構
共 530 題，涵蓋 114年（300題）與 113年（230題）司律一試，15 科。

## localStorage 現有結構
- key: lawquiz_prog_v1（作答進度）
  格式：{ "題目ID": { "stars": ["r"/"g"/"e","r"/"g"/"e",...], "attempts": 次數 } }
  r = 答錯, g = 答對, e = 未答
- key: lawquiz_session_v1（當前 session）
  格式：{ "queue": [題目ID陣列], "qi": 當前題號, "answers": {}, "elapsed": 秒數 }

遷移時 lawquiz_prog_v1 轉入 user_progress，lawquiz_session_v1 不需要保留。

## 資料庫目標表格（Phase 0 建立）
- user_progress：題目作答紀錄，star_level 對應 5 星機制
- penguin_journal：每日企鵝日誌，含 penguin_note 與 user_note（時光膠囊）
- user_stats：total_study_days 為主指標（不歸零），streak_days 為次要

## 企鵝文案永久禁止事項
- 不得指責、製造罪惡感、表現失望、因未登入抱怨
- 三天以上未登入回來 → 必須是「歡迎回來」，無例外

## 開發分支規則
在 dev 或 feature/* 分支作業，不直接 push 至 main
