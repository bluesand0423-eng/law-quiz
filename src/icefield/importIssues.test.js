import { describe, it, expect, vi } from "vitest";
import { validateImport, runImport } from "./importIssues";

function baseIssue(overrides = {}) {
  return {
    ref: "a1",
    subject: "cvp",
    title: "爭點一句話？",
    statement: "正文",
    statutes: ["cvp-400-1"],
    sources: "出處",
    practice_divergent: false,
    ...overrides,
  };
}

describe("validateImport", () => {

  it("合法 JSON：無錯誤，plan 標為新建", () => {
    const result = validateImport({ issues: [baseIssue()] }, []);
    expect(result.errors).toEqual([]);
    expect(result.plan).toHaveLength(1);
    expect(result.plan[0]).toMatchObject({ ref: "a1", kind: "create", subject: "cvp", title: "爭點一句話？" });
    expect(result.plan[0].payload.status).toBe("draft");
  });

  it("views 長度不是 3 被拒", () => {
    const result = validateImport({
      issues: [baseIssue({ views: [{ type: "通說", holder: "", content: "" }, { type: "有力說", holder: "", content: "" }] })],
    }, []);
    expect(result.errors.some(e => e.includes("views"))).toBe(true);
  });

  it("views 順序錯被拒", () => {
    const result = validateImport({
      issues: [baseIssue({
        views: [
          { type: "有力說", holder: "", content: "" },
          { type: "通說", holder: "", content: "" },
          { type: "實務", holder: "", content: "" },
        ],
      })],
    }, []);
    expect(result.errors.some(e => e.includes("views"))).toBe(true);
  });

  it("未知法典代碼被拒，且錯誤訊息含代碼", () => {
    const result = validateImport({ issues: [baseIssue({ statutes: ["xyz-100"] })] }, []);
    expect(result.errors.some(e => e.includes("xyz"))).toBe(true);
  });

  it("文字欄位含 [[ 被拒", () => {
    const result = validateImport({ issues: [baseIssue({ statement: "參照 [[cvp-001]]" })] }, []);
    expect(result.errors.some(e => e.includes("[["))).toBe(true);
  });

  it("ref 重複被拒", () => {
    const result = validateImport({ issues: [baseIssue(), baseIssue({ title: "另一題？" })] }, []);
    expect(result.errors.some(e => e.includes("重複"))).toBe(true);
  });

  it("link 端點不存在被拒", () => {
    const result = validateImport({
      issues: [baseIssue()],
      links: [{ from: "a1", to: "no-such-ref", type: "related" }],
    }, []);
    expect(result.errors.some(e => e.includes("不存在"))).toBe(true);
  });

  it("self-link 被拒", () => {
    const result = validateImport({
      issues: [baseIssue()],
      links: [{ from: "a1", to: "a1", type: "related" }],
    }, []);
    expect(result.errors.some(e => e.includes("self-link"))).toBe(true);
  });

  it("link 端點可為資料庫已存在的 slug", () => {
    const result = validateImport({
      issues: [baseIssue()],
      links: [{ from: "a1", to: "cvp-005", type: "related" }],
    }, [{ slug: "cvp-005", subject: "cvp", title: "既有卡" }]);
    expect(result.errors).toEqual([]);
  });

  it("重複標題判為略過，不算錯誤，並記錄既有 slug", () => {
    const result = validateImport(
      { issues: [baseIssue({ title: "既有卡" })] },
      [{ slug: "cvp-005", subject: "cvp", title: "既有卡" }],
    );
    expect(result.errors).toEqual([]);
    expect(result.plan[0]).toMatchObject({ kind: "skip", existingSlug: "cvp-005" });
  });

  it("status 帶 verified 被改為 draft，且不算錯誤", () => {
    const result = validateImport({ issues: [baseIssue({ status: "verified" })] }, []);
    expect(result.errors).toEqual([]);
    expect(result.plan[0].payload.status).toBe("draft");
    expect(result.plan[0].requestedStatus).toBe("verified");
  });

});

describe("runImport", () => {

  function makeDeps({ secondFails = false } = {}) {
    const createIssue = vi.fn()
      .mockResolvedValueOnce({ data: { slug: "cvp-101" } })
      .mockImplementationOnce(async () => secondFails
        ? { error: { message: "network error" } }
        : { data: { slug: "cvp-102" } });
    const setStatutes = vi.fn().mockResolvedValue({ data: [] });
    const createLinks = vi.fn().mockResolvedValue({ data: [] });
    return { createIssue, setStatutes, createLinks };
  }

  it("建卡依序呼叫：第二張的 createIssue 在第一張完成後才被呼叫", async () => {
    const order = [];
    const createIssue = vi.fn().mockImplementation(async (payload) => {
      order.push(`start:${payload.title}`);
      await Promise.resolve();
      order.push(`end:${payload.title}`);
      return { data: { slug: `s-${order.length}` } };
    });
    const setStatutes = vi.fn().mockResolvedValue({ data: [] });
    const createLinks = vi.fn().mockResolvedValue({ data: [] });

    const plan = [
      { ref: "a1", kind: "create", statutes: [], payload: { title: "第一張" } },
      { ref: "a2", kind: "create", statutes: [], payload: { title: "第二張" } },
    ];

    await runImport({ plan, links: [] }, { createIssue, setStatutes, createLinks });

    expect(order).toEqual(["start:第一張", "end:第一張", "start:第二張", "end:第二張"]);
  });

  it("第二張 createIssue 失敗時停止，不呼叫 createLinks", async () => {
    const { createIssue, setStatutes, createLinks } = makeDeps({ secondFails: true });
    const plan = [
      { ref: "a1", kind: "create", statutes: [], payload: { title: "第一張" } },
      { ref: "a2", kind: "create", statutes: [], payload: { title: "第二張" } },
    ];

    const result = await runImport(
      { plan, links: [{ from: "a1", to: "a2", type: "related" }] },
      { createIssue, setStatutes, createLinks },
    );

    expect(createIssue).toHaveBeenCalledTimes(2);
    expect(createLinks).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
    expect(result.stoppedAt).toMatchObject({ ref: "a2", step: "createIssue" });
    expect(result.refToSlug.a1).toBe("cvp-101");
  });

  it("略過的卡 ref 解析為既有 slug，不呼叫 createIssue", async () => {
    const createIssue = vi.fn();
    const setStatutes = vi.fn();
    const createLinks = vi.fn().mockResolvedValue({ data: [] });

    const plan = [
      { ref: "a1", kind: "skip", existingSlug: "cvp-005" },
    ];

    const result = await runImport(
      { plan, links: [{ from: "a1", to: "cvp-999", type: "related" }] },
      { createIssue, setStatutes, createLinks },
    );

    expect(createIssue).not.toHaveBeenCalled();
    expect(result.refToSlug.a1).toBe("cvp-005");
  });

  it("createLinks 收到的皆為 slug，不含 ref", async () => {
    const createIssue = vi.fn().mockResolvedValue({ data: { slug: "cvp-101" } });
    const setStatutes = vi.fn().mockResolvedValue({ data: [] });
    const createLinks = vi.fn().mockResolvedValue({ data: [] });

    const plan = [
      { ref: "a1", kind: "create", statutes: [], payload: { title: "第一張" } },
      { ref: "a2", kind: "skip", existingSlug: "cvp-005" },
    ];

    await runImport(
      { plan, links: [{ from: "a1", to: "a2", type: "prerequisite" }] },
      { createIssue, setStatutes, createLinks },
    );

    expect(createLinks).toHaveBeenCalledWith([
      { from_slug: "cvp-101", to_slug: "cvp-005", link_type: "prerequisite" },
    ]);
  });

});
