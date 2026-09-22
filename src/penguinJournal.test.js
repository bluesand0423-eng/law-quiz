import { describe, it, expect, vi, beforeEach } from "vitest";

// supabaseClient 使用 import.meta.env，在 vitest 環境需要 mock 掉
// getPenguinNote 是純函式，不使用 supabase，但 module 頂層 import 會觸發
vi.mock("./supabaseClient", () => ({
  supabase: { from: vi.fn(), auth: {} },
}));

import { supabase } from "./supabaseClient";
import { getPenguinNote, updateUserStats } from "./penguinJournal";

describe("getPenguinNote 優先序", () => {

  it("isReturning → 歡迎回來（最高優先）", () => {
    expect(getPenguinNote({ isReturning: true }))
      .toBe("歡迎回來。不管隔了多久，這裡都還在。");
  });

  it("isReturning 優先於 daysToExam <= 7", () => {
    expect(getPenguinNote({ isReturning: true, daysToExam: 3 }))
      .toBe("歡迎回來。不管隔了多久，這裡都還在。");
  });

  it("daysToExam === 7 → 觸發倒數", () => {
    expect(getPenguinNote({ daysToExam: 7 }))
      .toBe("還有 7 天。這段路已經走很遠了。");
  });

  it("daysToExam === 1 → 觸發倒數", () => {
    expect(getPenguinNote({ daysToExam: 1 }))
      .toBe("還有 1 天。這段路已經走很遠了。");
  });

  it("daysToExam === 8 → 不觸發倒數", () => {
    // 8 天以上不觸發，落到 questionsToday 規則
    expect(getPenguinNote({ daysToExam: 8, questionsToday: 5 }))
      .toBe("今天來了，這樣就夠了。");
  });

  it("daysToExam 為 null / undefined → 不觸發倒數", () => {
    expect(getPenguinNote({ questionsToday: 10 }))
      .toBe("今天來了，這樣就夠了。");
  });

  it("totalStudyDays === 365 → 一年紀念", () => {
    expect(getPenguinNote({ totalStudyDays: 365 }))
      .toBe("我們認識整整一年了。");
  });

  it("totalStudyDays 365 優先於 questionsToday >= 50", () => {
    expect(getPenguinNote({ totalStudyDays: 365, questionsToday: 60 }))
      .toBe("我們認識整整一年了。");
  });

  it("totalStudyDays === 100 → 第 100 天", () => {
    expect(getPenguinNote({ totalStudyDays: 100 }))
      .toBe("第 100 天。");
  });

  it("totalStudyDays 100 優先於 questionsToday >= 20", () => {
    expect(getPenguinNote({ totalStudyDays: 100, questionsToday: 30 }))
      .toBe("第 100 天。");
  });

  it("questionsToday === 50 → 觸發 >= 50 規則", () => {
    expect(getPenguinNote({ questionsToday: 50 }))
      .toBe("今天完成了 50 題。我在旁邊看了很久。");
  });

  it("questionsToday === 99 → 觸發 >= 50 規則", () => {
    expect(getPenguinNote({ questionsToday: 99 }))
      .toBe("今天完成了 99 題。我在旁邊看了很久。");
  });

  it("questionsToday === 20 → 觸發 >= 20 規則", () => {
    expect(getPenguinNote({ questionsToday: 20 }))
      .toBe("20 題。穩穩的。");
  });

  it("questionsToday === 49 → 觸發 >= 20 規則（未達 50）", () => {
    expect(getPenguinNote({ questionsToday: 49 }))
      .toBe("49 題。穩穩的。");
  });

  it("questionsToday === 1 → 今天來了", () => {
    expect(getPenguinNote({ questionsToday: 1 }))
      .toBe("今天來了，這樣就夠了。");
  });

  it("questionsToday === 19 → 今天來了（未達 20）", () => {
    expect(getPenguinNote({ questionsToday: 19 }))
      .toBe("今天來了，這樣就夠了。");
  });

  it("questionsToday === 0 → 預設訊息", () => {
    expect(getPenguinNote({ questionsToday: 0 }))
      .toBe("今天也一起努力了。");
  });

  it("空參數 → 預設訊息", () => {
    expect(getPenguinNote({})).toBe("今天也一起努力了。");
  });

  it("無參數（undefined）→ 預設訊息", () => {
    expect(getPenguinNote()).toBe("今天也一起努力了。");
  });

});

describe("updateUserStats：查詢失敗時不得覆蓋既有統計（data-loss hotfix 迴歸測試）", () => {

  beforeEach(() => {
    supabase.from.mockReset();
  });

  it("既有統計存在，但 _fetchStats 查詢失敗 → 中止寫入，既有資料維持不變", async () => {
    const upsertUserStats = vi.fn().mockResolvedValue({ error: null });

    // user_stats 讀取模擬查詢失敗（非「查無資料」）：error 有值
    supabase.from.mockImplementation((table) => {
      if (table === "user_stats") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: null, error: { message: "network error" } }),
            }),
          }),
          upsert: upsertUserStats,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await updateUserStats("user-existing", 1);

    // 核心斷言：查詢失敗絕不可觸發 upsert（onConflict:"user_id" 為整列覆蓋，
    // 若誤寫入會用歸零附近的值蓋掉既有累積紀錄）
    expect(upsertUserStats).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

  it("查無資料（真正的新使用者，data:null 且 error:null）→ 允許建立新列", async () => {
    const upsertUserStats = vi.fn().mockResolvedValue({ error: null });
    const upsertPenguinJournal = vi.fn().mockResolvedValue({ error: null });

    supabase.from.mockImplementation((table) => {
      if (table === "user_stats") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
          upsert: upsertUserStats,
        };
      }
      if (table === "penguin_journal") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          upsert: upsertPenguinJournal,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await updateUserStats("user-brand-new", 1);

    // 與上一個測試對照：真正查無資料時，仍應正常建立第一筆列，
    // 證明修正沒有把所有情況都當成失敗一律擋下
    expect(upsertUserStats).toHaveBeenCalledTimes(1);
    expect(upsertUserStats.mock.calls[0][0]).toMatchObject({
      user_id: "user-brand-new",
      total_questions: 1,
      total_study_days: 1,
    });
    expect(result.error).toBeFalsy();
  });

});
