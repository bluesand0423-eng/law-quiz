import { supabase } from "./supabaseClient";

const LS = "lawquiz_prog_v1";
const MIGRATED_LS = "lawquiz_migrated_v1"; // { [userId]: true }，記錄已成功上傳過本地進度的使用者

// { questionId: { stars, attempts } }
export async function fetchProgress(userId) {
  const { data, error } = await supabase
    .from("user_progress")
    .select("question_id, stars, attempts")
    .eq("user_id", userId);
  if (error || !data) return {};
  return Object.fromEntries(
    data.map(r => [r.question_id, { stars: r.stars, attempts: r.attempts }])
  );
}

export async function upsertProgress(userId, questionId, stars, attempts) {
  const { error } = await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      question_id: questionId,
      stars,
      attempts,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_id" }
  );
  if (error) console.error("[upsertProgress] user_progress upsert 失敗：", error);
  return { error };
}

export async function batchUpsertProgress(userId, progObj) {
  const rows = Object.entries(progObj).map(([question_id, { stars, attempts }]) => ({
    user_id: userId,
    question_id,
    stars,
    attempts,
    last_seen_at: new Date().toISOString(),
  }));
  if (!rows.length) return { error: null };
  const { error } = await supabase
    .from("user_progress")
    .upsert(rows, { onConflict: "user_id,question_id" });
  if (error) console.error("[batchUpsertProgress] user_progress 批次 upsert 失敗：", error);
  return { error };
}

export async function clearProgress(userId) {
  const { error } = await supabase.from("user_progress").delete().eq("user_id", userId);
  if (error) console.error("[clearProgress] user_progress delete 失敗：", error);
  return { error };
}

// 今日回憶：cascade 查 365→100→30→7 天前，回傳第一筆有記錄的，否則 null
export async function getTodayMemory(userId) {
  const OFFSETS = [365, 100, 30, 7];
  const now = new Date();

  for (const daysAgo of OFFSETS) {
    const target = new Date(now);
    target.setDate(target.getDate() - daysAgo);
    const dateStr = target.toISOString().slice(0, 10);

    const { data } = await supabase
      .from("penguin_journal")
      .select("penguin_note, user_note, questions_done, date")
      .eq("user_id", userId)
      .eq("date", dateStr)
      .maybeSingle();

    if (data) return { ...data, daysAgo };
  }
  return null;
}

function loadMigratedMap() {
  try { return JSON.parse(localStorage.getItem(MIGRATED_LS) || "{}"); } catch { return {}; }
}

// 將 lawquiz_prog_v1 遷移至 Supabase，回傳筆數
// 每位使用者僅需成功遷移一次：成功後標記旗標，之後登入/token 刷新不再重跑；
// 若上傳失敗則不標記，保留下次重試的機會（避免因暫時性錯誤永久放棄遷移）。
export async function migrateFromLocalStorage(userId) {
  const migratedMap = loadMigratedMap();
  if (migratedMap[userId]) return 0;

  const raw = localStorage.getItem(LS);
  if (!raw) return 0;
  let progObj;
  try { progObj = JSON.parse(raw); } catch { return 0; }
  if (!progObj || typeof progObj !== "object") return 0;

  const { error } = await batchUpsertProgress(userId, progObj);
  if (error) {
    console.error("[migrateFromLocalStorage] 上傳本地作答進度失敗，暫不標記為已遷移，下次仍會重試：", error);
    return 0;
  }

  try {
    migratedMap[userId] = true;
    localStorage.setItem(MIGRATED_LS, JSON.stringify(migratedMap));
  } catch {}

  return Object.keys(progObj).length;
}
