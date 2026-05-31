import { supabase } from "./supabaseClient";

// ── 純函式：優先序由高到低 ──────────────────────────────────────
export function getPenguinNote({
  questionsToday = 0,
  totalStudyDays = 0,
  totalQuestions = 0,
  isReturning = false,
  daysToExam,
} = {}) {
  if (isReturning)
    return "歡迎回來。不管隔了多久，這裡都還在。";
  if (daysToExam != null && daysToExam <= 7)
    return `還有 ${daysToExam} 天。這段路已經走很遠了。`;
  if (totalStudyDays === 365)
    return "我們認識整整一年了。";
  if (totalStudyDays === 100)
    return "第 100 天。";
  if (questionsToday >= 50)
    return `今天完成了 ${questionsToday} 題。我在旁邊看了很久。`;
  if (questionsToday >= 20)
    return `${questionsToday} 題。穩穩的。`;
  if (questionsToday >= 1)
    return "今天來了，這樣就夠了。";
  return "今天也一起努力了。";
}

// ── 讀取現有 user_stats（內部輔助）──────────────────────────────
async function _fetchStats(userId) {
  const { data } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// ── saveDailyJournal ─────────────────────────────────────────────
export async function saveDailyJournal(
  userId,
  { questionsToday = 0, minutesSpent = 0, fishEarned = 0, userNote = null } = {}
) {
  const [stats, returning] = await Promise.all([
    _fetchStats(userId),
    checkIsReturning(userId),
  ]);

  const penguinNote = getPenguinNote({
    questionsToday,
    totalStudyDays: stats?.total_study_days ?? 0,
    totalQuestions: stats?.total_questions ?? 0,
    isReturning: returning,
  });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { error } = await supabase.from("penguin_journal").upsert(
    {
      user_id: userId,
      date: today,
      questions_done: questionsToday,
      minutes_spent: minutesSpent,
      fish_earned: fishEarned,
      penguin_note: penguinNote,
      user_note: userNote,
    },
    { onConflict: "user_id,date" }
  );

  return { penguinNote, error };
}

// ── updateUserStats ──────────────────────────────────────────────
export async function updateUserStats(userId, questionsToday) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const existing = await _fetchStats(userId);

  const firstLoginAt = existing?.first_login_at ?? now.toISOString();

  // total_study_days: 同一天重複呼叫不重複計算
  const lastLoginDateStr = existing?.last_login_at
    ? new Date(existing.last_login_at).toISOString().slice(0, 10)
    : null;
  const isNewDay = lastLoginDateStr !== todayStr;
  const totalStudyDays = (existing?.total_study_days ?? 0) +
    (isNewDay && questionsToday > 0 ? 1 : 0);

  const totalQuestions = (existing?.total_questions ?? 0) + questionsToday;

  const daysTogether = Math.floor(
    (now.getTime() - new Date(firstLoginAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  const { error } = await supabase.from("user_stats").upsert(
    {
      user_id: userId,
      total_questions: totalQuestions,
      total_study_days: totalStudyDays,
      days_together: daysTogether,
      first_login_at: firstLoginAt,
      last_login_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );

  return { error };
}

// ── checkIsReturning ─────────────────────────────────────────────
export async function checkIsReturning(userId) {
  const { data } = await supabase
    .from("user_stats")
    .select("last_login_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.last_login_at) return false;

  const daysSince =
    (Date.now() - new Date(data.last_login_at).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 3;
}
