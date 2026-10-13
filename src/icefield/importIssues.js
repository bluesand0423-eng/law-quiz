// 冰原批次匯入：講義 → 爭點卡 JSON → 預覽 → 寫入。
// validateImport 為純函式（不碰 Supabase），runImport 才寫入，一律重用既有、
// 已測試的 createIssue／setStatutes，連結另呼叫 createLinks。
//
// 匯入內容一律以 status: "draft" 寫入；JSON 帶其他值一律忽略並在 plan 中
// 標示 requestedStatus，不得以已覆核狀態進資料庫（CLAUDE.md 開發原則：
// AI 整理的內容不得以已覆核狀態進資料庫）。
import { SUBJECTS } from "./subjects";
import { LAW_CODES } from "./lawCodes";
import { parseStatuteKey, formatStatuteKey } from "./statuteKey";
import { LINK_TYPES } from "./db";

const VIEW_TYPES = ["通說", "有力說", "實務"];

function emptyViews() {
  return VIEW_TYPES.map(type => ({ type, holder: "", content: "" }));
}

function cardLabel(idx, ref) {
  return ref ? `issues[${idx}]（ref=${ref}）` : `issues[${idx}]`;
}

// 本批卡片在寫入前沒有 slug，[[ ]] 會連錯對象；連結一律放 links，
// 所以任何文字欄位含 [[ 都視為錯誤，不嘗試解析。
function collectTextFields(item) {
  const fields = [item.title, item.statement, item.sources];
  if (Array.isArray(item.views)) {
    item.views.forEach(v => fields.push(v?.holder, v?.content));
  }
  return fields.filter(f => typeof f === "string");
}

export function validateImport(json, existingIssues = []) {
  const errors = [];
  const plan = [];

  if (!json || typeof json !== "object") {
    return { errors: ["JSON 格式錯誤：頂層必須是物件"], plan: [], links: [] };
  }

  const issuesInput = Array.isArray(json.issues) ? json.issues : null;
  if (issuesInput === null) {
    errors.push("issues 必須是陣列");
  }
  const linksInput = json.links === undefined ? [] : Array.isArray(json.links) ? json.links : null;
  if (linksInput === null) {
    errors.push("links 必須是陣列");
  }

  const existingBySlug = new Map(existingIssues.map(i => [i.slug, i]));
  const existingByKey = new Map(existingIssues.map(i => [`${i.subject}::${(i.title || "").trim()}`, i]));
  const seenRefs = new Set();
  const refKnown = new Set();

  (issuesInput ?? []).forEach((item, idx) => {
    const label = cardLabel(idx, item?.ref);

    if (!item || typeof item !== "object") {
      errors.push(`${label}：格式錯誤`);
      return;
    }

    const ref = item.ref;
    if (!ref || typeof ref !== "string") {
      errors.push(`${label}：缺少 ref`);
      return;
    }
    if (seenRefs.has(ref)) {
      errors.push(`ref "${ref}" 在本批內重複`);
      return;
    }
    seenRefs.add(ref);
    refKnown.add(ref);

    const subject = item.subject;
    if (!subject || !(subject in SUBJECTS)) {
      errors.push(`${label}：subject "${subject}" 不在 SUBJECTS 內`);
    }

    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) {
      errors.push(`${label}：title 不得為空`);
    }

    // views：可省略（視為三格空白）；若提供必須恰為三格，type 依序為通說／有力說／實務。
    // 理由：IssueForm 讀到長度不是 3 的 views 會整個重設為空，之後存檔就會把資料洗掉。
    let views = null;
    if (item.views !== undefined) {
      if (!Array.isArray(item.views) || item.views.length !== VIEW_TYPES.length) {
        errors.push(`${label}：views 必須省略或恰為 ${VIEW_TYPES.length} 格（通說／有力說／實務）`);
      } else {
        const typeMismatch = item.views.some((v, i) => !v || v.type !== VIEW_TYPES[i]);
        if (typeMismatch) {
          errors.push(`${label}：views 的 type 必須依序為「${VIEW_TYPES.join("、")}」`);
        } else {
          views = item.views.map(v => ({ type: v.type, holder: v.holder ?? "", content: v.content ?? "" }));
        }
      }
    }

    // statutes：每一筆 parseStatuteKey 非 null 且 formatStatuteKey 非 null；
    // 法典代碼不在 LAW_CODES 的，錯誤訊息要寫出代碼。
    const statutes = Array.isArray(item.statutes) ? item.statutes : [];
    statutes.forEach(raw => {
      const parsed = parseStatuteKey(raw);
      if (!parsed) {
        const law = typeof raw === "string" ? raw.split("-")[0] : undefined;
        if (law && !(law in LAW_CODES)) {
          errors.push(`${label}：條號 "${raw}" 的法典代碼 "${law}" 不在 LAW_CODES 內`);
        } else {
          errors.push(`${label}：無法解析的條號 "${raw}"`);
        }
        return;
      }
      if (!formatStatuteKey(parsed)) {
        errors.push(`${label}：條號 "${raw}" 無法格式化為中文顯示`);
      }
    });

    if (collectTextFields(item).some(t => t.includes("[["))) {
      errors.push(`${label}：文字欄位不得含 [[ ]]，連結請放 links`);
    }

    const dupKey = `${subject}::${title}`;
    const existing = existingByKey.get(dupKey);
    const kind = existing ? "skip" : "create";
    const requestedStatus = item.status;
    const statusOverridden = requestedStatus !== undefined && requestedStatus !== "draft";

    plan.push({
      ref,
      subject,
      title,
      kind,
      existingSlug: existing?.slug ?? null,
      statutes,
      requestedStatus: statusOverridden ? requestedStatus : null,
      payload: kind === "create" ? {
        subject,
        title,
        statement: item.statement ?? "",
        views: views ?? emptyViews(),
        status: "draft",
        practice_divergent: !!item.practice_divergent,
        external_exam_refs: [],
        sources: item.sources ?? "",
      } : null,
    });
  });

  const validEndpoint = (s) => refKnown.has(s) || existingBySlug.has(s);
  (linksInput ?? []).forEach((link, idx) => {
    const label = `links[${idx}]`;
    if (!link || typeof link !== "object") {
      errors.push(`${label}：格式錯誤`);
      return;
    }
    const { from, to, type } = link;
    if (!LINK_TYPES.includes(type)) {
      errors.push(`${label}：type "${type}" 不合法`);
    }
    if (from === to) {
      errors.push(`${label}：from 與 to 不得相同（self-link）`);
    }
    if (!validEndpoint(from)) {
      errors.push(`${label}：端點 "${from}" 不存在（非本批 ref 亦非既有 slug）`);
    }
    if (!validEndpoint(to)) {
      errors.push(`${label}：端點 "${to}" 不存在（非本批 ref 亦非既有 slug）`);
    }
  });

  return {
    errors,
    plan,
    links: linksInput ?? [],
    source: typeof json.source === "string" ? json.source : "",
  };
}

// plan／links 取自 validateImport 的回傳值；呼叫端須先確認 errors.length === 0。
// 任何一步失敗立即停止、不回滾，回傳已完成的 ref→slug 對照與停在哪一步。
export async function runImport({ plan, links }, { createIssue, setStatutes, createLinks, notifySyncFailure }) {
  const refToSlug = {};

  for (const entry of plan) {
    if (entry.kind === "skip") {
      refToSlug[entry.ref] = entry.existingSlug;
      continue;
    }

    const { data, error: createError } = await createIssue(entry.payload);
    if (createError) {
      notifySyncFailure?.();
      return { error: createError, refToSlug, stoppedAt: { ref: entry.ref, step: "createIssue" } };
    }
    refToSlug[entry.ref] = data.slug;

    const { error: statutesError } = await setStatutes(data.slug, entry.statutes);
    if (statutesError) {
      notifySyncFailure?.();
      return { error: statutesError, refToSlug, stoppedAt: { ref: entry.ref, step: "setStatutes" } };
    }
  }

  const resolvedLinks = (links ?? []).map(l => ({
    from_slug: refToSlug[l.from] ?? l.from,
    to_slug: refToSlug[l.to] ?? l.to,
    link_type: l.type,
  }));

  if (resolvedLinks.length > 0) {
    const { error: linksError } = await createLinks(resolvedLinks);
    if (linksError) {
      notifySyncFailure?.();
      return { error: linksError, refToSlug, stoppedAt: { step: "createLinks" } };
    }
  }

  return { refToSlug };
}

export { VIEW_TYPES };
