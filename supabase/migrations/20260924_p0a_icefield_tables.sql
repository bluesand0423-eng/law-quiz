-- =====================================================================
-- P0-A 冰原建表｜2026-09-24｜依流程規劃書 v1.2 §3、§8.1
-- 本檔為紀錄用，非自動執行；實際執行於 Supabase SQL Editor。
--
-- 重要：Supabase 專案設有 ALTER DEFAULT PRIVILEGES，新建表會自動授予
-- anon 基礎權限（REFERENCES, TRIGGER, TRUNCATE）。其中 TRUNCATE 不受
-- RLS 保護，故第 9 節的 REVOKE 為必要步驟，不可省略。
-- =====================================================================

begin;

-- ===== 1. issues =====
create table public.issues (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid()
                        references auth.users(id) on delete cascade,
  slug                text not null,
  title               text not null,
  subject             text not null,
  statement           text,
  views               jsonb not null default '[]'::jsonb,
  practice_divergent  boolean not null default false,
  sources             text,
  external_exam_refs  text[] not null default '{}',
  status              text not null default 'draft'
                        check (status in ('draft','active','verified')),
  archived            boolean not null default false,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint issues_user_slug_key unique (user_id, slug)
);

-- ===== 2. issue_links =====
create table public.issue_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users(id) on delete cascade,
  from_slug   text not null,
  to_slug     text not null,
  link_type   text not null
                check (link_type in ('prerequisite','cross_subject','related')),
  note        text,
  auto        boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint issue_links_no_self check (from_slug <> to_slug),
  constraint issue_links_unique unique (user_id, from_slug, to_slug, link_type),
  constraint issue_links_from_fk foreign key (user_id, from_slug)
    references public.issues (user_id, slug) on update cascade on delete cascade,
  constraint issue_links_to_fk foreign key (user_id, to_slug)
    references public.issues (user_id, slug) on update cascade on delete cascade
);

-- ===== 3. issue_statutes =====
-- location 設 NOT NULL DEFAULT ''：PostgreSQL 的 UNIQUE 視每個 NULL 為相異值，
-- 若允許 NULL，同一爭點的同一條文可重複插入，唯一約束形同虛設。
create table public.issue_statutes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  issue_slug   text not null,
  statute_key  text not null,
  location     text not null default '',
  note         text,
  created_at   timestamptz not null default now(),
  constraint issue_statutes_unique unique (user_id, issue_slug, statute_key, location),
  constraint issue_statutes_issue_fk foreign key (user_id, issue_slug)
    references public.issues (user_id, slug) on update cascade on delete cascade
);

-- ===== 4. 索引 =====
create index issues_subject_idx        on public.issues (user_id, subject);
create index issues_status_idx         on public.issues (user_id, status) where archived = false;
create index issue_links_to_idx        on public.issue_links (user_id, to_slug);
create index issue_links_from_idx      on public.issue_links (user_id, from_slug);
create index issue_statutes_key_idx    on public.issue_statutes (user_id, statute_key);
create index issue_statutes_issue_idx  on public.issue_statutes (user_id, issue_slug);

-- ===== 5. trigger：slug 永不改名（規劃書 v1.2 §6.1）=====
create or replace function public.tg_issues_block_slug_update()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug 為永久識別碼，不得修改（id=%，原值=%）', old.id, old.slug;
  end if;
  return new;
end;
$$;

create trigger issues_block_slug_update
  before update on public.issues
  for each row execute function public.tg_issues_block_slug_update();

-- ===== 6. trigger：updated_at 自動更新 =====
-- 覆核腐化防制（§3.1：updated_at > verified_at 即降級顯示）依賴此欄位
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function public.tg_set_updated_at();

-- ===== 7. RLS =====
alter table public.issues          enable row level security;
alter table public.issue_links     enable row level security;
alter table public.issue_statutes  enable row level security;

create policy "own rows" on public.issues
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows" on public.issue_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own rows" on public.issue_statutes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===== 8. table-level GRANT =====
grant select, insert, update, delete on public.issues         to authenticated;
grant select, insert, update, delete on public.issue_links    to authenticated;
grant select, insert, update, delete on public.issue_statutes to authenticated;

commit;

-- =====================================================================
-- ===== 9. REVOKE anon（必要步驟，於上述建表後另行執行）=====
-- 不寫這段，anon 會因 ALTER DEFAULT PRIVILEGES 保有 TRUNCATE，
-- 而 TRUNCATE 不受 RLS 保護。
-- =====================================================================

begin;

revoke all on public.issues         from anon;
revoke all on public.issue_links    from anon;
revoke all on public.issue_statutes from anon;

commit;

-- ---------------------------------------------------------------------
-- 未執行（可選）：authenticated 亦因預設權限持有 TRUNCATE、REFERENCES、
-- TRIGGER。應用程式不需要這些，依最小權限原則可一併收緊，但風險對象為
-- 苳本人，急迫性低。若日後執行，請另開一個 migration 紀錄。
--
-- revoke truncate on public.issues, public.issue_links, public.issue_statutes
--   from authenticated;
-- ---------------------------------------------------------------------

-- =====================================================================
-- 驗證查詢（分開執行，SQL Editor 一次只顯示最後一段結果）
-- =====================================================================

-- 驗證 1：RLS 是否啟用（預期三列皆 true）
-- select c.relname as table_name, c.relrowsecurity as rls_enabled
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
--   and c.relname in ('issues','issue_links','issue_statutes')
-- order by 1;

-- 驗證 2：GRANT（REVOKE 後預期只剩 authenticated 三列）
-- select table_name, grantee,
--        string_agg(privilege_type, ', ' order by privilege_type) as privileges
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and table_name in ('issues','issue_links','issue_statutes')
--   and grantee in ('anon','authenticated')
-- group by table_name, grantee
-- order by table_name, grantee;

-- 驗證 3：trigger（預期 issues 有兩個，皆 BEFORE UPDATE）
-- select event_object_table, trigger_name, action_timing, event_manipulation
-- from information_schema.triggers
-- where trigger_schema = 'public'
-- order by 1, 2;

-- =====================================================================
-- 執行紀錄
-- 2026-09-24  第 1–8 節於 Supabase SQL Editor 執行成功
-- 2026-09-24  驗證：RLS 三表皆 true；trigger 兩個皆存在
-- 2026-09-24  發現 anon 持有 REFERENCES, TRIGGER, TRUNCATE（預設權限）
-- 2026-09-24  第 9 節 REVOKE 執行成功
-- =====================================================================
