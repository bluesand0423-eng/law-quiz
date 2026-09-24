import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabaseClient", () => ({
  supabase: { from: vi.fn(), auth: {} },
}));

import { supabase } from "../supabaseClient";
import {
  extractWikiLinks,
  upsertLinks,
  createIssue,
  updateIssue,
  setStatutes,
  getIssue,
  getLinks,
} from "./db";

beforeEach(() => {
  supabase.from.mockReset();
});

describe("extractWikiLinks", () => {

  it("解析 [[slug]] 與 [[slug|別名]]，別名不影響目標、去除重複", () => {
    const text = "參照 [[cvp-014]] 與 [[cvp-014|別名]]，另見 [[cvp-020]]";
    expect(extractWikiLinks(text)).toEqual(["cvp-014", "cvp-020"]);
  });

  it("非字串輸入回傳空陣列", () => {
    expect(extractWikiLinks(null)).toEqual([]);
    expect(extractWikiLinks(undefined)).toEqual([]);
  });

});

describe("upsertLinks：[[ ]] 解析不得覆寫手動 link_type", () => {

  it("已存在的連結（含手動改過 link_type 的）完全不被觸碰，只新增正文中真正新出現的 slug", async () => {
    const existing = [
      { from_slug: "cvp-014", to_slug: "cvp-005", link_type: "prerequisite", auto: false },
      { from_slug: "cvp-014", to_slug: "cvp-006", link_type: "related", auto: true },
    ];
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    // 刻意不提供 update：若實作誤對既有連結呼叫 update，測試會直接因
    // 「update is not a function」失敗，等同斷言「絕不覆寫既有連結」。
    supabase.from.mockImplementation((table) => {
      if (table === "issue_links") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existing, error: null }) }),
          insert: insertSpy,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await upsertLinks("cvp-014", "參照 [[cvp-005]]、[[cvp-006]]，新增 [[cvp-007]]");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith([
      { from_slug: "cvp-014", to_slug: "cvp-007", link_type: "related", auto: true },
    ]);
    expect(result.error).toBeFalsy();
  });

  it("正文中消失的 slug：只移除 auto=true 的連結，手動建立的（auto=false）一律保留", async () => {
    const existing = [
      { from_slug: "cvp-014", to_slug: "cvp-005", link_type: "prerequisite", auto: false },
      { from_slug: "cvp-014", to_slug: "cvp-006", link_type: "related", auto: true },
    ];
    const inSpy = vi.fn().mockResolvedValue({ error: null });
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    supabase.from.mockImplementation((table) => {
      if (table === "issue_links") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: existing, error: null }) }),
          delete: () => ({ eq: () => ({ eq: () => ({ in: inSpy }) }) }),
          insert: insertSpy,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await upsertLinks("cvp-014", "正文已不再提到任何卡片");

    expect(inSpy).toHaveBeenCalledWith("to_slug", ["cvp-006"]);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(result.error).toBeFalsy();
  });

});

describe("createIssue：slug 自動產生", () => {

  it("流水號為既有最大值 +1，補零至三位；忽略呼叫端傳入的 slug", async () => {
    const insertSpy = vi.fn(() => ({
      select: () => ({
        maybeSingle: () => Promise.resolve({ data: { slug: "cvp-015" }, error: null }),
      }),
    }));

    supabase.from.mockImplementation((table) => {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ slug: "cvp-001" }, { slug: "cvp-014" }],
              error: null,
            }),
          }),
          insert: insertSpy,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await createIssue({ subject: "cvp", title: "X", slug: "cvp-999" });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const inserted = insertSpy.mock.calls[0][0];
    expect(inserted.slug).toBe("cvp-015");
    expect(inserted).not.toHaveProperty("slug", "cvp-999");
    expect(result.data.slug).toBe("cvp-015");
  });

  it("查詢既有 slug 失敗時中止建立，不得回退為 001", async () => {
    const insertSpy = vi.fn();

    supabase.from.mockImplementation((table) => {
      if (table === "issues") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: "network error" } }),
          }),
          insert: insertSpy,
        };
      }
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await createIssue({ subject: "cvp", title: "X" });

    expect(insertSpy).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });

});

describe("updateIssue：應用層擋下修改 slug", () => {

  it("patch 含 slug 時直接拒絕，不觸及 Supabase", async () => {
    supabase.from.mockImplementation((table) => {
      throw new Error(`patch 含 slug 時不應呼叫 supabase.from("${table}")`);
    });

    const result = await updateIssue("cvp-014", { slug: "cvp-999", title: "改標題" });
    expect(result.error).toBeTruthy();
  });

});

describe("setStatutes：條號正規化與整批中止", () => {

  it("任一條號無法解析時，整批中止，不寫入任何一筆", async () => {
    supabase.from.mockImplementation((table) => {
      throw new Error(`格式錯誤應中止，不應呼叫 supabase.from("${table}")`);
    });

    const result = await setStatutes("cvp-014", ["civ-242", "not-a-valid-key!!"]);
    expect(result.error).toBeTruthy();
  });

  it("成功時先刪除既有列，再寫入正規化後的新列", async () => {
    const deleteSpy = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
    const insertSpy = vi.fn(() => ({
      select: () => Promise.resolve({ data: [{ statute_key: "civ-184", location: "1-front" }], error: null }),
    }));

    supabase.from.mockImplementation((table) => {
      if (table === "issue_statutes") return { delete: deleteSpy, insert: insertSpy };
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    const result = await setStatutes("cvp-014", ["civ-184-1-front"]);

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith([
      { issue_slug: "cvp-014", statute_key: "civ-184", location: "1-front", note: null },
    ]);
    expect(result.error).toBeFalsy();
  });

});

describe("getIssue：查無資料與查詢失敗必須可區分", () => {

  it("查無資料（data:null, error:null）→ 回傳 { data: null }，非 error", async () => {
    supabase.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    }));

    const result = await getIssue("cvp-999");
    expect(result.data).toBeNull();
    expect(result.error).toBeUndefined();
  });

  it("查詢失敗（error 有值）→ 回傳 { error }", async () => {
    supabase.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: { message: "network error" } }),
        }),
      }),
    }));

    const result = await getIssue("cvp-014");
    expect(result.error).toBeTruthy();
    expect(result.data).toBeUndefined();
  });

});

describe("getLinks：cross_subject 對稱邊查詢", () => {

  it("以 from_slug OR to_slug 查詢，而非只查其中一邊", async () => {
    const orSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockImplementation((table) => {
      if (table === "issue_links") return { select: () => ({ or: orSpy }) };
      throw new Error(`測試未預期呼叫 supabase.from("${table}")`);
    });

    await getLinks("cvp-014");
    expect(orSpy).toHaveBeenCalledWith("from_slug.eq.cvp-014,to_slug.eq.cvp-014");
  });

});
