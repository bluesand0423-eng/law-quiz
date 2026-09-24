import { describe, it, expect } from "vitest";
import { computeDisplayStatus } from "./issueDisplay";

describe("computeDisplayStatus：覆核後已修改", () => {

  it("updated_at > verified_at → 一律顯示 active 並加註，不論 status 為何", () => {
    const issue = { status: "verified", verified_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" };
    expect(computeDisplayStatus(issue)).toEqual({ label: "active", note: "覆核後已修改" });
  });

  it("updated_at <= verified_at → 顯示原本 status，不加註", () => {
    const issue = { status: "verified", verified_at: "2026-02-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
    expect(computeDisplayStatus(issue)).toEqual({ label: "verified", note: null });
  });

  it("尚未 verified（verified_at 為 null）→ 顯示原本 status，不加註", () => {
    const issue = { status: "draft", verified_at: null, updated_at: "2026-01-01T00:00:00Z" };
    expect(computeDisplayStatus(issue)).toEqual({ label: "draft", note: null });
  });

  it("issue 為 null → 回傳 null", () => {
    expect(computeDisplayStatus(null)).toBeNull();
  });

});
