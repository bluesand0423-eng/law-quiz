import { describe, it, expect } from "vitest";
import { parseStatuteKey, formatStatuteKey } from "./statuteKey";

describe("parseStatuteKey", () => {

  it("無 location：civ-242", () => {
    expect(parseStatuteKey("civ-242"))
      .toEqual({ key: "civ-242", location: "", law: "civ", article: "242" });
  });

  it("有 location（項+前段）：civ-184-1-front", () => {
    expect(parseStatuteKey("civ-184-1-front"))
      .toEqual({ key: "civ-184", location: "1-front", law: "civ", article: "184" });
  });

  it("有 location（僅項）：cvp-400-1", () => {
    expect(parseStatuteKey("cvp-400-1"))
      .toEqual({ key: "cvp-400", location: "1", law: "cvp", article: "400" });
  });

  it("有 location（項+款）：civ-244-1-2", () => {
    expect(parseStatuteKey("civ-244-1-2"))
      .toEqual({ key: "civ-244", location: "1-2", law: "civ", article: "244" });
  });

  it("未知法規代碼 → null", () => {
    expect(parseStatuteKey("xyz-100")).toBeNull();
  });

  it("條號非數字 → null", () => {
    expect(parseStatuteKey("civ-abc")).toBeNull();
  });

  it("缺少條號 → null", () => {
    expect(parseStatuteKey("civ")).toBeNull();
  });

  it("空字串 → null", () => {
    expect(parseStatuteKey("")).toBeNull();
  });

  it("尾端多餘連字號 → null", () => {
    expect(parseStatuteKey("civ-242-")).toBeNull();
  });

  it("非字串輸入 → null", () => {
    expect(parseStatuteKey(null)).toBeNull();
    expect(parseStatuteKey(undefined)).toBeNull();
    expect(parseStatuteKey(184)).toBeNull();
  });

  it("round-trip：解析結果組回字串應與原輸入一致", () => {
    const cases = ["civ-242", "civ-184-1-front", "cvp-400-1", "civ-244-1-2", "adm-92-1-back"];
    for (const raw of cases) {
      const parsed = parseStatuteKey(raw);
      const rebuilt = parsed.location ? `${parsed.key}-${parsed.location}` : parsed.key;
      expect(rebuilt).toBe(raw);
    }
  });
});

describe("formatStatuteKey", () => {

  it("無 location：civ-242 → 民法第 242 條", () => {
    expect(formatStatuteKey({ key: "civ-242", location: "" }))
      .toBe("民法第 242 條");
  });

  it("項：cvp-400-1 → 民事訴訟法第 400 條第 1 項", () => {
    expect(formatStatuteKey({ key: "cvp-400", location: "1" }))
      .toBe("民事訴訟法第 400 條第 1 項");
  });

  it("項+前段：civ-184-1-front → 民法第 184 條第 1 項前段", () => {
    expect(formatStatuteKey({ key: "civ-184", location: "1-front" }))
      .toBe("民法第 184 條第 1 項前段");
  });

  it("項+後段：civ-184-1-back → 民法第 184 條第 1 項後段", () => {
    expect(formatStatuteKey({ key: "civ-184", location: "1-back" }))
      .toBe("民法第 184 條第 1 項後段");
  });

  it("項+款：civ-244-1-2 → 民法第 244 條第 1 項第 2 款", () => {
    expect(formatStatuteKey({ key: "civ-244", location: "1-2" }))
      .toBe("民法第 244 條第 1 項第 2 款");
  });

  it("未知法規代碼 → null", () => {
    expect(formatStatuteKey({ key: "xyz-100", location: "" })).toBeNull();
  });

  it("location 格式錯誤 → null", () => {
    expect(formatStatuteKey({ key: "civ-242", location: "front" })).toBeNull();
  });

  it("key 格式錯誤 → null", () => {
    expect(formatStatuteKey({ key: "civ", location: "" })).toBeNull();
    expect(formatStatuteKey({})).toBeNull();
  });
});
