// 力導向佈局的純函式版本——移植自 docs/prototype/issue-graph-prototype-v07.html
// 的 seed()／tick()，數值參數原樣沿用，只是不碰 DOM、不用 requestAnimationFrame。
// 呼叫端（StatuteRoom.jsx）負責把模擬結果畫到畫面上，並自己跑動畫迴圈。
//
// node 形狀：{ id, kind, x, y, vx, vy, fx, fy, seedRadiusScale? }
// - kind === "center"：永遠被拉回畫面正中央、斥力加乘（原型的「stat」節點，
//   即法條節點）。其餘 kind 一律視為一般節點（原型的 core／ring 在物理運算上
//   其實完全相同，只有初始半徑不同，用 seedRadiusScale 表達，預設 1）。
// - fx／fy 非 null 時視為「釘選」（拖曳中）：位置鎖定在 fx／fy，不參與整合。
//
// link 形狀：{ source, target, length? }——source／target 須為 nodes 陣列中
// 的同一個物件參照（非字串 id），length 預設 84（原型的一般連線長度；法條
// →爭點的連線由呼叫端傳入 length:100）。

const REPULSION = 2200;
const CENTER_REPULSION_MULT = 2.2;
const CENTER_PULL = 0.007;
const CENTER_LERP = 0.2;
const DAMPING = 0.86;
const LINK_STRENGTH = 0.031;
const DEFAULT_LINK_LENGTH = 84;
const ALPHA_DECAY = 0.985;
const ALPHA_FLOOR = 0.004;

// 環狀初始位置：center 節點置於正中央，其餘節點依陣列索引角度均分，
// 半徑為 min(width,height)*0.32，乘上各節點的 seedRadiusScale（預設 1）。
// 回傳初始 alpha（1），供呼叫端往後逐步傳入 stepLayout。
export function seedLayout(nodes, width, height) {
  const R = Math.min(width, height) * 0.32;
  nodes.forEach((n, i) => {
    if (n.kind === "center") {
      n.x = width / 2;
      n.y = height / 2;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    const angle = (i / nodes.length) * Math.PI * 2;
    const radius = R * (n.seedRadiusScale ?? 1);
    n.x = width / 2 + Math.cos(angle) * radius;
    n.y = height / 2 + Math.sin(angle) * radius;
    n.vx = 0;
    n.vy = 0;
    n.fx = null;
    n.fy = null;
  });
  return 1;
}

// 推進一步，直接修改 nodes 內每個節點的 x／y／vx／vy，回傳新的 alpha。
export function stepLayout(nodes, links, { width, height, alpha }) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      let dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const d = Math.sqrt(d2);
      const mult = (a.kind === "center" || b.kind === "center") ? CENTER_REPULSION_MULT : 1;
      const f = (REPULSION * mult) / d2 * alpha;
      a.vx -= dx / d * f; a.vy -= dy / d * f;
      b.vx += dx / d * f; b.vy += dy / d * f;
    }
  }

  links.forEach(l => {
    const len = l.length ?? DEFAULT_LINK_LENGTH;
    const a = l.source, b = l.target;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - len) * LINK_STRENGTH * alpha;
    a.vx += dx / d * f; a.vy += dy / d * f;
    b.vx -= dx / d * f; b.vy -= dy / d * f;
  });

  nodes.forEach(n => {
    if (n.kind === "center") {
      n.x += (width / 2 - n.x) * CENTER_LERP;
      n.y += (height / 2 - n.y) * CENTER_LERP;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    n.vx += (width / 2 - n.x) * CENTER_PULL * alpha;
    n.vy += (height / 2 - n.y) * CENTER_PULL * alpha;
    if (n.fx != null) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    n.vx *= DAMPING;
    n.vy *= DAMPING;
    n.x += n.vx;
    n.y += n.vy;
  });

  let next = alpha * ALPHA_DECAY;
  if (next < ALPHA_FLOOR) next = ALPHA_FLOOR;
  return next;
}
