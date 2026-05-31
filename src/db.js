import { supabase } from "./supabaseClient";

const LS = "lawquiz_prog_v1";

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
  await supabase.from("user_progress").upsert(
    {
      user_id: userId,
      question_id: questionId,
      stars,
      attempts,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,question_id" }
  );
}

export async function batchUpsertProgress(userId, progObj) {
  const rows = Object.entries(progObj).map(([question_id, { stars, attempts }]) => ({
    user_id: userId,
    question_id,
    stars,
    attempts,
    last_seen_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  await supabase
    .from("user_progress")
    .upsert(rows, { onConflict: "user_id,question_id" });
}

export async function clearProgress(userId) {
  await supabase.from("user_progress").delete().eq("user_id", userId);
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

// 將 lawquiz_prog_v1 遷移至 Supabase，回傳筆數
export async function migrateFromLocalStorage(userId) {
  const raw = localStorage.getItem(LS);
  if (!raw) return 0;
  let progObj;
  try { progObj = JSON.parse(raw); } catch { return 0; }
  if (!progObj || typeof progObj !== "object") return 0;
  await batchUpsertProgress(userId, progObj);
  return Object.keys(progObj).length;
}
