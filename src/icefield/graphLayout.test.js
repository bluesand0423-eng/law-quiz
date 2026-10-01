import { describe, it, expect } from "vitest";
import { seedLayout, stepLayout } from "./graphLayout";

function makeNode(id, kind = "normal", extra = {}) {
  return { id, kind, x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, ...extra };
}

function runSteps(nodes, links, n, dims = { width: 600, height: 340 }) {
  let alpha = seedLayout(nodes, dims.width, dims.height);
  for (let i = 0; i < n; i++) {
    alpha = stepLayout(nodes, links, { ...dims, alpha });
  }
  return alpha;
}

describe("graphLayout：跑 300 步後座標皆為有限數", () => {

  it("中央節點＋多個一般節點＋連線，300 步後沒有 NaN／Infinity", () => {
    const center = makeNode("statute", "center");
    const a = makeNode("a");
    const b = makeNode("b");
    const c = makeNode("c");
    const nodes = [center, a, b, c];
    const links = [
      { source: center, target: a, length: 100 },
      { source: center, target: b, length: 100 },
      { source: a, target: c, length: 84 },
    ];

    runSteps(nodes, links, 300);

    nodes.forEach(n => {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isFinite(n.vx)).toBe(true);
      expect(Number.isFinite(n.vy)).toBe(true);
    });
  });

});

describe("graphLayout：釘選節點", () => {

  it("fx／fy 非 null 的節點位置在整個模擬過程中不變", () => {
    const center = makeNode("statute", "center");
    const pinned = makeNode("pinned");
    const other = makeNode("other");
    const nodes = [center, pinned, other];
    const links = [{ source: center, target: pinned, length: 100 }, { source: center, target: other, length: 100 }];

    let alpha = seedLayout(nodes, 600, 340);
    pinned.fx = pinned.x;
    pinned.fy = pinned.y;
    const pinnedX = pinned.x, pinnedY = pinned.y;

    for (let i = 0; i < 100; i++) {
      alpha = stepLayout(nodes, links, { width: 600, height: 340, alpha });
    }

    expect(pinned.x).toBe(pinnedX);
    expect(pinned.y).toBe(pinnedY);
  });

});

describe("graphLayout：重疊節點被推開", () => {

  it("兩個初始位置重疊的一般節點，幾步之後距離會增加", () => {
    const a = makeNode("a");
    const b = makeNode("b");
    a.x = 100; a.y = 100;
    b.x = 100; b.y = 100;
    const nodes = [a, b];
    const links = [];

    const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
    const before = dist(a, b);

    let alpha = 1;
    for (let i = 0; i < 20; i++) {
      alpha = stepLayout(nodes, links, { width: 600, height: 340, alpha });
    }
    const after = dist(a, b);

    expect(after).toBeGreaterThan(before);
  });

});

describe("graphLayout：邊界情況", () => {

  it("單一節點、零連線不拋錯", () => {
    const only = makeNode("solo", "center");
    const nodes = [only];
    const links = [];

    expect(() => {
      let alpha = seedLayout(nodes, 600, 340);
      for (let i = 0; i < 300; i++) {
        alpha = stepLayout(nodes, links, { width: 600, height: 340, alpha });
      }
    }).not.toThrow();

    expect(Number.isFinite(only.x)).toBe(true);
    expect(Number.isFinite(only.y)).toBe(true);
  });

  it("零節點、零連線不拋錯", () => {
    expect(() => {
      let alpha = seedLayout([], 600, 340);
      for (let i = 0; i < 10; i++) {
        alpha = stepLayout([], [], { width: 600, height: 340, alpha });
      }
    }).not.toThrow();
  });

});
