import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabaseClient", () => ({
  supabase: { from: vi.fn(), auth: {} },
}));

import { supabase } from "./supabaseClient";
import { migrateFromLocalStorage } from "./db";

function createLocalStorageMock() {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
}

describe("migrateFromLocalStorage：一次性旗標（data-loss hotfix）", () => {

  beforeEach(() => {
    supabase.from.mockReset();
    global.localStorage = createLocalStorageMock();
    global.localStorage.setItem("lawquiz_prog_v1", JSON.stringify({
      "civ-01": { stars: ["g", "e", "e", "e", "e"], attempts: 1 },
    }));
  });

  it("同一使用者第二次呼叫時，不再重跑上傳（模擬 token 刷新重複觸發）", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    supabase.from.mockImplementation((table) => {
      if (table === "user_progress") return { upsert };
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const first = await migrateFromLocalStorage("user-1");
    const second = await migrateFromLocalStorage("user-1");

    expect(first).toBe(1); // 第一次：實際遷移了 1 筆
    expect(second).toBe(0); // 第二次：旗標已設，直接跳過
    expect(upsert).toHaveBeenCalledTimes(1); // upsert 只送出一次，不因重複觸發而重跑
  });

  it("上傳失敗時不標記旗標，下次仍會重試", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: "network error" } });
    supabase.from.mockImplementation((table) => {
      if (table === "user_progress") return { upsert };
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const first = await migrateFromLocalStorage("user-2");
    const second = await migrateFromLocalStorage("user-2");

    expect(first).toBe(0); // 失敗回傳 0，不視為完成
    expect(upsert).toHaveBeenCalledTimes(2); // 兩次都真的嘗試上傳，未被旗標誤擋
  });

});
