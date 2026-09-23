# Supabase Migrations

本目錄為 schema 變更的**紀錄**，非自動執行機制。實際變更於 Supabase SQL Editor 手動執行。

## 規則

- 每次 schema 變更都要在此留一份，檔名格式 `YYYYMMDD_描述.sql`
- 檔案內容必須與**實際執行過的 SQL 一致**。若執行後發現需要補做（如 REVOKE），補做的部分也要寫進同一份檔案並註明
- 檔案末尾維護「執行紀錄」區塊，記下執行日期與驗證結果
- 驗證查詢以註解形式附在檔案內，方便日後重跑

## 建表 SOP（五步）

1. `CREATE TABLE`
2. RLS policy（指定 `TO authenticated`，不用 `{public}`）
3. table-level `GRANT` 給 `authenticated`
4. **`REVOKE ALL FROM anon`** — Supabase 預設權限會自動授予 anon，其中 TRUNCATE 不受 RLS 保護
5. 以非 service-role 金鑰實測讀寫
