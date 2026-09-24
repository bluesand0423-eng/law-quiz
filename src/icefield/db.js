// 冰原資料存取層：issues / issue_links / issue_statutes 三張表的 CRUD。
// schema 見 supabase/migrations/20260924_p0a_icefield_tables.sql，本檔不建表、不改 schema。
//
// 通用規則（每個函式都遵守）：
// - 每個 Supabase 呼叫都 await，解構 { data, error }
// - error 有值即中止，回傳 { error }，絕不把「查詢失敗」當成「查無資料」繼續往下寫
// - 讀取函式的 data === null／[] 代表「查無資料」，與 { error } 明確分開，呼叫端可各自處理
import { supabase } from "../supabaseClient";
import { parseStatuteKey } from "./statuteKey";

const LINK_TYPES = ["prerequisite", "cross_subject", "related"];
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

// ============================================================
// 讀取
// ============================================================

export async function listIssues({ subject, status, archived = false } = {}) {
  let query = supabase.from("issues").select("*").eq("archived", archived);
  if (subject) query = query.eq("subject", subject);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("slug", { ascending: true });
  if (error) {
    console.error("[listIssues] issues select 失敗：", error);
    return { error };
  }
  return { data };
}

export async function getIssue(slug) {
  const { data, error } = await supabase
    .from("issues")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[getIssue] issues select 失敗：", error);
    return { error };
  }
  return { data }; // data === null：查無此卡（非查詢失敗）
}

// cross_subject 為語意對稱邊（資料庫存有向），須同時查 from_slug 與 to_slug
export async function getLinks(slug) {
  const { data, error } = await supabase
    .from("issue_links")
    .select("*")
    .or(`from_slug.eq.${slug},to_slug.eq.${slug}`);
  if (error) {
    console.error("[getLinks] issue_links select 失敗：", error);
    return { error };
  }
  return { data };
}

export async function getStatutes(slug) {
  const { data, error } = await supabase
    .from("issue_statutes")
    .select("*")
    .eq("issue_slug", slug);
  if (error) {
    console.error("[getStatutes] issue_statutes select 失敗：", error);
    return { error };
  }
  return { data };
}

// ============================================================
// slug 自動產生（新增卡片時使用，不讓使用者輸入）
// ============================================================

// 查詢失敗時中止（不得回退為 001，否則會造成 slug 衝突或覆蓋既有卡片）
async function nextSlug(subject) {
  const { data, error } = await supabase
    .from("issues")
    .select("slug")
    .eq("subject", subject);
  if (error) {
    console.error("[nextSlug] 查詢既有 slug 失敗，中止建立：", error);
    return { error };
  }

  const pattern = new RegExp(`^${subject}-(\\d{3})$`);
  let max = 0;
  for (const row of data ?? []) {
    const m = pattern.exec(row.slug);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return { slug: `${subject}-${String(max + 1).padStart(3, "0")}` };
}

// ============================================================
// 寫入
// ============================================================

export async function createIssue(payload) {
  if (!payload?.subject) {
    const error = { message: "createIssue 缺少 subject，無法產生 slug" };
    console.error("[createIssue]", error.message);
    return { error };
  }

  const { slug, error: slugError } = await nextSlug(payload.subject);
  if (slugError) return { error: slugError };

  // slug 一律自動產生，忽略呼叫端傳入的 slug（若有）
  const { slug: _ignored, ...rest } = payload;

  const { data, error } = await supabase
    .from("issues")
    .insert({ ...rest, slug })
    .select()
    .maybeSingle();
  if (error) {
    console.error("[createIssue] issues insert 失敗：", error);
    return { error };
  }
  return { data };
}

// slug 為永久識別碼：資料庫 trigger（issues_block_slug_update）會擋，
// 但應用層先擋一次，錯誤更早出現、更好除錯。
export async function updateIssue(slug, patch) {
  if (patch && Object.prototype.hasOwnProperty.call(patch, "slug")) {
    const error = { message: "updateIssue 的 patch 不得包含 slug（slug 為永久識別碼，不得修改）" };
    console.error("[updateIssue]", error.message);
    return { error };
  }

  const { data, error } = await supabase
    .from("issues")
    .update(patch)
    .eq("slug", slug)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[updateIssue] issues update 失敗：", error);
    return { error };
  }
  return { data };
}

// 禁止物理刪除，一律封存
export async function setArchived(slug, archived) {
  const { data, error } = await supabase
    .from("issues")
    .update({ archived: !!archived })
    .eq("slug", slug)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[setArchived] issues update 失敗：", error);
    return { error };
  }
  return { data };
}

// 條號以階段二的 parseStatuteKey() 正規化；任何一筆無法解析就整批中止，
// 不部分寫入——寫入猜測值比不寫更糟（開發原則：空白資料 ＜ 錯誤資料）。
export async function setStatutes(slug, statutes = []) {
  const rows = [];
  for (const item of statutes) {
    const raw = typeof item === "string" ? item : item?.raw;
    const parsed = parseStatuteKey(raw);
    if (!parsed) {
      const error = { message: `無法解析的 statute_key，中止整批寫入：${raw}` };
      console.error("[setStatutes]", error.message);
      return { error };
    }
    rows.push({
      issue_slug: slug,
      statute_key: parsed.key,
      location: parsed.location,
      note: typeof item === "string" ? null : (item?.note ?? null),
    });
  }

  const { error: delError } = await supabase
    .from("issue_statutes")
    .delete()
    .eq("issue_slug", slug);
  if (delError) {
    console.error("[setStatutes] issue_statutes delete 失敗，中止：", delError);
    return { error: delError };
  }

  if (rows.length === 0) return { data: [] };

  const { data, error } = await supabase
    .from("issue_statutes")
    .insert(rows)
    .select();
  if (error) {
    console.error("[setStatutes] issue_statutes insert 失敗：", error);
    return { error };
  }
  return { data };
}

// 從正文擷取 [[slug]] 或 [[slug|別名]] 中的 slug，別名不影響連結目標
export function extractWikiLinks(text) {
  if (typeof text !== "string") return [];
  const slugs = new Set();
  WIKI_LINK_RE.lastIndex = 0;
  let m;
  while ((m = WIKI_LINK_RE.exec(text))) {
    const s = m[1].trim();
    if (s) slugs.add(s);
  }
  return [...slugs];
}

// 依正文中的 [[ ]] 標記同步 issue_links（僅管理 from_slug = slug 的出邊）：
// - 正文新出現的 slug → 建立 { auto: true, link_type: 'related' }
// - 正文消失的 slug → 只移除 auto = true 的連結；手動建立（auto = false）一律保留
// - 任何已存在的連結（無論 auto 或手動、無論 link_type 為何）完全不觸碰——
//   這是「不覆寫手動 link_type」的關鍵：已存在的邊本函式從不對其下 update，
//   避免使用者手動改成 prerequisite 後，再次存檔被悄悄改回 related。
export async function upsertLinks(slug, statementText) {
  const referenced = extractWikiLinks(statementText).filter(s => s && s !== slug);

  const { data: existing, error: fetchError } = await supabase
    .from("issue_links")
    .select("*")
    .eq("from_slug", slug);
  if (fetchError) {
    console.error("[upsertLinks] issue_links select 失敗，中止：", fetchError);
    return { error: fetchError };
  }

  const existingList = existing ?? [];
  const existingToSlugs = new Set(existingList.map(r => r.to_slug));
  const referencedSet = new Set(referenced);

  const toInsert = referenced
    .filter(s => !existingToSlugs.has(s))
    .map(to_slug => ({ from_slug: slug, to_slug, link_type: "related", auto: true }));

  const toRemove = existingList
    .filter(r => r.auto && !referencedSet.has(r.to_slug))
    .map(r => r.to_slug);

  if (toRemove.length > 0) {
    const { error: delError } = await supabase
      .from("issue_links")
      .delete()
      .eq("from_slug", slug)
      .eq("auto", true)
      .in("to_slug", toRemove);
    if (delError) {
      console.error("[upsertLinks] issue_links delete 失敗，中止：", delError);
      return { error: delError };
    }
  }

  if (toInsert.length > 0) {
    const { error: insError } = await supabase.from("issue_links").insert(toInsert);
    if (insError) {
      console.error("[upsertLinks] issue_links insert 失敗：", insError);
      return { error: insError };
    }
  }

  return { data: { inserted: toInsert.length, removed: toRemove.length } };
}

// 手動重新分類一條既有連結的 link_type（例如 related → prerequisite）。
// 階段三未定義此函式；階段四畫面需要讓使用者手動調整分類才補上，
// upsertLinks 本身仍然完全不覆寫既有連結，兩者職責分開。
export async function updateLinkType(fromSlug, toSlug, linkType) {
  if (!LINK_TYPES.includes(linkType)) {
    const error = { message: `不合法的 link_type：${linkType}` };
    console.error("[updateLinkType]", error.message);
    return { error };
  }

  const { data, error } = await supabase
    .from("issue_links")
    .update({ link_type: linkType })
    .eq("from_slug", fromSlug)
    .eq("to_slug", toSlug)
    .select()
    .maybeSingle();
  if (error) {
    console.error("[updateLinkType] issue_links update 失敗：", error);
    return { error };
  }
  return { data };
}

export { LINK_TYPES };
