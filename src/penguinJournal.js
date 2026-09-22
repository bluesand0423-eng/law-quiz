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
// 回傳 {data, error}，讓呼叫端能區分「查得資料」「查無資料（data:null,error:null）」
// 「查詢失敗（error 有值）」三種狀態，避免把查詢失敗誤判為新使用者。
async function _fetchStats(userId) {
  const { data, error } = await supabase
    .from("user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return { data, error };
}

// ── saveDailyJournal ─────────────────────────────────────────────
export async function saveDailyJournal(
  userId,
  { questionsToday = 0, minutesSpent = 0, fishEarned = 0, userNote = null } = {}
) {
  const [statsResult, returning] = await Promise.all([
    _fetchStats(userId),
    checkIsReturning(userId),
  ]);
  if (statsResult.error) {
    console.error("[saveDailyJournal] 讀取 user_stats 失敗，今日文案將使用預設值：", statsResult.error);
  }
  const stats = statsResult.data;

  const penguinNote = getPenguinNote({
    questionsToday,
    totalStudyDays: stats?.total_study_days ?? 0,
    totalQuestions: stats?.total_questions ?? 0,
    isReturning: returning,
  });

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const payload = {
    user_id: userId,
    date: today,
    penguin_note: penguinNote,
  };
  if (questionsToday > 0) payload.questions_done = questionsToday;
  if (minutesSpent > 0) payload.minutes_spent = minutesSpent;
  if (fishEarned > 0) payload.fish_earned = fishEarned;
  if (userNote !== null && userNote !== undefined) payload.user_note = userNote;

  const { error } = await supabase.from("penguin_journal").upsert(
    payload,
    { onConflict: "user_id,date" }
  );
  if (error) console.error("[saveDailyJournal] penguin_journal upsert 失敗：", error);

  return { penguinNote, error };
}

// ── getMilestoneType ─────────────────────────────────────────────
function getMilestoneType(prevDays, newDays, prevQ, newQ) {
  if (prevDays < 1   && newDays >= 1)   return "FIRST_DAY";
  if (prevDays < 100 && newDays >= 100) return "DAY_100";
  if (prevDays < 365 && newDays >= 365) return "ONE_YEAR";
  if (prevDays < 730 && newDays >= 730) return "TWO_YEAR";
  if (prevQ < 1000   && newQ >= 1000)   return "QUESTIONS_1000";
  if (prevQ < 5000   && newQ >= 5000)   return "QUESTIONS_5000";
  return null;
}

// ── updateUserStats ──────────────────────────────────────────────
export async function updateUserStats(userId, questionsToday) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const { data: existing, error: fetchError } = await _fetchStats(userId);

  // 查詢失敗（非「查無資料」）時中止：絕不可把讀取失敗當成新使用者，
  // 用歸零附近的數值覆蓋既有的 user_stats 列（onConflict:"user_id" 為整列覆蓋）。
  if (fetchError) {
    console.error("[updateUserStats] 讀取 user_stats 失敗，中止寫入以避免覆蓋既有紀錄：", fetchError);
    return { error: fetchError };
  }

  const firstLoginAt = existing?.first_login_at ?? now.toISOString();

  const prevStudyDays = existing?.total_study_days ?? 0;
  const prevQuestions = existing?.total_questions ?? 0;

  // total_study_days: 同一天重複呼叫不重複計算
  const lastLoginDateStr = existing?.last_login_at
    ? new Date(existing.last_login_at).toISOString().slice(0, 10)
    : null;
  const isNewDay = lastLoginDateStr !== todayStr;
  const totalStudyDays = prevStudyDays + (isNewDay && questionsToday > 0 ? 1 : 0);

  const totalQuestions = prevQuestions + questionsToday;

  const daysTogether = Math.floor(
    (now.getTime() - new Date(firstLoginAt).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;

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
  if (error) {
    console.error("[updateUserStats] user_stats upsert 失敗：", error);
    return { error };
  }

  // 次要寫入（當日題數累加、里程碑標記）各自獨立檢查 error，
  // 任一失敗都彙整回傳，讓呼叫端能顯示一次使用者可見提示，而非各自彈出多則。
  let secondaryError = null;

  if (questionsToday > 0) {
    const { data: todayRow, error: todayRowError } = await supabase
      .from("penguin_journal")
      .select("questions_done")
      .eq("user_id", userId)
      .eq("date", todayStr)
      .maybeSingle();
    if (todayRowError) {
      console.error("[updateUserStats] 讀取今日 questions_done 失敗，略過本次題數累加：", todayRowError);
      secondaryError = todayRowError;
    } else {
      const currentCount = todayRow?.questions_done ?? 0;
      const { error: qErr } = await supabase.from("penguin_journal").upsert(
        { user_id: userId, date: todayStr, questions_done: currentCount + questionsToday },
        { onConflict: "user_id,date" }
      );
      if (qErr) {
        console.error("[updateUserStats] questions_done upsert 失敗：", qErr);
        secondaryError = qErr;
      }
    }
  }

  const milestone = getMilestoneType(prevStudyDays, totalStudyDays, prevQuestions, totalQuestions);
  if (milestone) {
    const { error: mErr } = await supabase.from("penguin_journal").upsert(
      { user_id: userId, date: todayStr, milestone_type: milestone },
      { onConflict: "user_id,date" }
    );
    if (mErr) {
      console.error("[updateUserStats] milestone upsert 失敗：", mErr);
      secondaryError = secondaryError ?? mErr;
    }
  }

  return { error: secondaryError };
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
