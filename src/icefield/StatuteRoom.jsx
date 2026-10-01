import { useCallback, useEffect, useRef, useState } from "react";
import { getLinks, getIssue, listStatuteRefs, LINK_TYPES } from "./db";
import { formatStatuteKey } from "./statuteKey";
import { LAW_CODES } from "./lawCodes";
import { computeDisplayStatus } from "./issueDisplay";
import { buildGraphTheme } from "./graphTheme";
import { seedLayout, stepLayout } from "./graphLayout";
import IssueDetail from "./IssueDetail";
import IssueForm from "./IssueForm";

// 與 IssueDetail.jsx 的 LINK_TYPE_LABEL 用同一套中文（前提／跨科／相關），
// 不在房間畫面另造一套詞彙。
const LINK_TYPE_LABEL = { prerequisite: "前提", cross_subject: "跨科", related: "相關" };
const ALPHA_RUNNING_FLOOR = 0.006;

// 從完整格式化文字中扣掉「法典第 N 條」前綴，只留「第 X 項…」部分；
// 沿用 formatStatuteKey，不在這裡另外解析 location 字串本身。
function extractLocationLabel(key, location) {
  if (!location) return "";
  const prefix = formatStatuteKey({ key, location: "" });
  const full = formatStatuteKey({ key, location });
  if (!prefix || !full) return "";
  return full.slice(prefix.length);
}

export default function StatuteRoom({ T, statuteKey, notifySyncFailure, onBack, onOpenStatute }) {
  const theme = buildGraphTheme(T);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coreMap, setCoreMap] = useState(new Map());
  const [ringMap, setRingMap] = useState(new Map());
  const [linkRows, setLinkRows] = useState([]);
  const [showRing, setShowRing] = useState(false);
  const [activeTypes, setActiveTypes] = useState(() => new Set(LINK_TYPES));
  const [panelMode, setPanelMode] = useState("statute"); // statute | issue | form
  const [panelTarget, setPanelTarget] = useState(null);
  const [formSlug, setFormSlug] = useState(null); // null = 新增模式
  const [dimensions, setDimensions] = useState({ width: 600, height: 300 });
  const [, setRenderTick] = useState(0);

  const stageRef = useRef(null);
  const svgRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const byIdRef = useRef({});
  const alphaRef = useRef(1);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dragNodeRef = useRef(null);
  const panStartRef = useRef(null);
  const pinchRef = useRef(null);
  const pointersRef = useRef(new Map());

  const loadRoom = useCallback(async (key) => {
    setLoading(true);
    setLoadError(false);

    const refsResult = await listStatuteRefs();
    if (refsResult.error) {
      console.error("[StatuteRoom] listStatuteRefs 失敗：", refsResult.error);
      setLoadError(true);
      setLoading(false);
      return;
    }
    const nextCore = new Map();
    (refsResult.data ?? []).filter(r => r.statute_key === key).forEach(r => {
      nextCore.set(r.issue_slug, { ...r.issue, location: r.location });
    });
    const coreSlugs = [...nextCore.keys()];

    const linkResults = await Promise.all(coreSlugs.map(s => getLinks(s)));
    const linkErr = linkResults.find(r => r.error);
    if (linkErr) {
      console.error("[StatuteRoom] getLinks 失敗：", linkErr.error);
      setLoadError(true);
      setLoading(false);
      return;
    }
    const seen = new Set();
    const allLinks = [];
    linkResults.forEach(r => (r.data ?? []).forEach(row => {
      const k = `${row.from_slug}>${row.to_slug}>${row.link_type}`;
      if (!seen.has(k)) { seen.add(k); allLinks.push(row); }
    }));

    const ringSlugs = [...new Set(
      allLinks.flatMap(row => [row.from_slug, row.to_slug]).filter(s => !nextCore.has(s))
    )];
    const ringResults = await Promise.all(ringSlugs.map(s => getIssue(s)));
    const ringErr = ringResults.find(r => r.error);
    if (ringErr) {
      console.error("[StatuteRoom] getIssue 失敗：", ringErr.error);
      setLoadError(true);
      setLoading(false);
      return;
    }
    const nextRing = new Map();
    ringResults.forEach((r, i) => {
      if (r.data && !r.data.archived) nextRing.set(ringSlugs[i], r.data);
    });

    setCoreMap(nextCore);
    setRingMap(nextRing);
    setLinkRows(allLinks.filter(row =>
      (nextCore.has(row.from_slug) || nextRing.has(row.from_slug)) &&
      (nextCore.has(row.to_slug) || nextRing.has(row.to_slug))
    ));
    setLoading(false);
  }, []);

  // 切換到不同法條時，面板與視角都重置，重新讀取該房間資料
  useEffect(() => {
    setPanelMode("statute");
    setPanelTarget(null);
    setFormSlug(null);
    setShowRing(false);
    viewRef.current = { x: 0, y: 0, k: 1 };
    loadRoom(statuteKey);
  }, [statuteKey, loadRoom]);

  // 量測畫布尺寸
  useEffect(() => {
    function measure() {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDimensions({ width: r.width || 600, height: r.height || 300 });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 資料或外圈開關變動時，重建節點／連線並重新佈局（種子＋300 步，與原型一致）
  useEffect(() => {
    if (loading) return;
    const nodes = [];
    const byId = {};
    const add = (o) => { nodes.push(o); byId[o.id] = o; };

    add({ id: statuteKey, kind: "center", role: "center", x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null });
    coreMap.forEach((issue, slug) => add({
      id: slug, kind: "normal", role: "core",
      title: issue.title, status: issue.status, verified_at: issue.verified_at, updated_at: issue.updated_at,
      location: issue.location,
      x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, seedRadiusScale: 1,
    }));
    if (showRing) ringMap.forEach((issue, slug) => add({
      id: slug, kind: "normal", role: "ring",
      title: issue.title, status: issue.status, verified_at: issue.verified_at, updated_at: issue.updated_at,
      x: 0, y: 0, vx: 0, vy: 0, fx: null, fy: null, seedRadiusScale: 1.5,
    }));

    const linkObjs = [];
    coreMap.forEach((issue, slug) => {
      if (byId[slug]) {
        linkObjs.push({ source: byId[statuteKey], target: byId[slug], length: 100, kind: "statute", location: issue.location });
      }
    });
    linkRows.forEach(row => {
      if (byId[row.from_slug] && byId[row.to_slug]) {
        linkObjs.push({ source: byId[row.from_slug], target: byId[row.to_slug], length: 84, kind: "issue", type: row.link_type });
      }
    });

    nodesRef.current = nodes;
    byIdRef.current = byId;
    linksRef.current = linkObjs;
    alphaRef.current = seedLayout(nodes, dimensions.width, dimensions.height);
    for (let i = 0; i < 300; i++) {
      alphaRef.current = stepLayout(nodes, linkObjs, { width: dimensions.width, height: dimensions.height, alpha: alphaRef.current });
    }
    setRenderTick(t => t + 1);
  }, [coreMap, ringMap, showRing, loading, statuteKey, linkRows, dimensions]);

  // 動畫迴圈：元件卸載或 dimensions 變動時取消
  useEffect(() => {
    let raf;
    function frame() {
      const dragging = dragNodeRef.current != null;
      if (alphaRef.current > ALPHA_RUNNING_FLOOR || dragging) {
        alphaRef.current = stepLayout(nodesRef.current, linksRef.current, { width: dimensions.width, height: dimensions.height, alpha: alphaRef.current });
        setRenderTick(t => t + 1);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [dimensions]);

  function toSimCoords(e, svgEl) {
    const r = svgEl.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
  }

  function handleNodePointerDown(e, node) {
    e.stopPropagation();
    if (node.kind === "center") {
      setPanelMode("statute");
      return;
    }
    dragNodeRef.current = node;
    node.fx = node.x;
    node.fy = node.y;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPanelMode("issue");
    setPanelTarget(node.id);
  }

  function handleSvgPointerDown(e) {
    pointersRef.current.set(e.pointerId, e);
    if (dragNodeRef.current || pointersRef.current.size > 1) return;
    panStartRef.current = { px: e.clientX, py: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handleSvgPointerMove(e) {
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, e);
    if (pointersRef.current.size === 2) {
      panStartRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinchRef.current) {
        const k2 = Math.min(2.8, Math.max(0.4, pinchRef.current.k * d / pinchRef.current.d));
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = (a.clientX + b.clientX) / 2 - rect.left;
        const my = (a.clientY + b.clientY) / 2 - rect.top;
        viewRef.current = {
          x: mx - (mx - pinchRef.current.x) * (k2 / pinchRef.current.k),
          y: my - (my - pinchRef.current.y) * (k2 / pinchRef.current.k),
          k: k2,
        };
      } else {
        pinchRef.current = { d, k: viewRef.current.k, x: viewRef.current.x, y: viewRef.current.y };
      }
      setRenderTick(t => t + 1);
      return;
    }
    if (dragNodeRef.current) {
      const p = toSimCoords(e, e.currentTarget);
      dragNodeRef.current.fx = p.x;
      dragNodeRef.current.fy = p.y;
      alphaRef.current = Math.max(alphaRef.current, 0.25);
      setRenderTick(t => t + 1);
      return;
    }
    if (panStartRef.current) {
      const ps = panStartRef.current;
      viewRef.current = { ...viewRef.current, x: ps.vx + (e.clientX - ps.px), y: ps.vy + (e.clientY - ps.py) };
      setRenderTick(t => t + 1);
    }
  }

  function handleSvgPointerUp(e) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      dragNodeRef.current = null;
    }
    panStartRef.current = null;
  }

  // 滾輪縮放需要 preventDefault 才能擋掉頁面捲動，但 React 的 onWheel 是
  // 被動（passive）監聽，呼叫 preventDefault 不會真的生效；改用 ref 掛原生
  // 事件（passive:false）。effect 依賴 dimensions 重掛一次即可，handler 內
  // 讀取的都是 ref，不需要把它也放進依賴。
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const v = viewRef.current;
      const k2 = Math.min(2.8, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
      viewRef.current = { x: mx - (mx - v.x) * (k2 / v.k), y: my - (my - v.y) * (k2 / v.k), k: k2 };
      setRenderTick(t => t + 1);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [dimensions]);

  function toggleType(t) {
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  const cardStyle = { background: T.surface, borderRadius: 16, padding: "1rem 1.15rem", border: `1px solid ${T.bdr}`, marginBottom: "0.75rem" };
  const chip = (on) => ({ font: "inherit", fontSize: "0.72rem", padding: "0.3rem 0.65rem", borderRadius: 999, border: `1px solid ${T.bdr}`, background: on ? T.surfaceDeep : "transparent", color: on ? T.ink : T.faint, cursor: "pointer" });

  const backBar = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.muted, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", padding: "0.2rem 0.4rem", lineHeight: 1 }}>← 回法條大廳</button>
    </div>
  );

  if (loadError) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        {backBar}
        <p style={{ color: T.muted, fontSize: "0.85rem" }}>這次沒能讀到雲端資料，稍後再試一次。</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        {backBar}
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>載入中…</p>
      </div>
    );
  }

  const roomName = formatStatuteKey({ key: statuteKey, location: "" }) ?? statuteKey;
  const [lawCode, articleNo] = statuteKey.split("-");
  const lawName = LAW_CODES[lawCode]?.name ?? lawCode;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {backBar}
      <div style={{ fontSize: "1rem", fontWeight: 500, color: T.ink, fontFamily: "'Noto Serif TC',serif", marginBottom: "0.6rem" }}>{roomName}</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
        {LINK_TYPES.map(t => (
          <button key={t} onClick={() => toggleType(t)} aria-pressed={activeTypes.has(t)} style={chip(activeTypes.has(t))}>
            {LINK_TYPE_LABEL[t]}
          </button>
        ))}
        <button onClick={() => setShowRing(v => !v)} aria-pressed={showRing} style={chip(showRing)}>外圈鄰居</button>
      </div>

      {coreMap.size === 0 ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "1.5rem 0" }}>這條目前還沒有爭點卡引用。</p>
      ) : (
        <div
          ref={stageRef}
          style={{ position: "relative", border: `1px solid ${T.bdr}`, borderRadius: 12, background: theme.card, overflow: "hidden", touchAction: "none", height: "44vh", minHeight: 250 }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            style={{ display: "block", width: "100%", height: "100%" }}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
          >
            <defs>
              <marker id="icefield-arrow" viewBox="0 0 10 10" refX="13" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,1.5 L10,5 L0,8.5 Z" fill={theme.mist} />
              </marker>
            </defs>
            <g transform={`translate(${viewRef.current.x},${viewRef.current.y}) scale(${viewRef.current.k})`}>
              <g>
                {linksRef.current.map((l, i) => {
                  if (l.kind === "statute") {
                    const label = extractLocationLabel(statuteKey, l.location);
                    const mx = (l.source.x + l.target.x) / 2, my = (l.source.y + l.target.y) / 2;
                    return (
                      <g key={`s-${i}`}>
                        <line x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y} stroke={theme.inkFaint} strokeDasharray="2 5" strokeWidth={1} />
                        {label && <text x={mx} y={my - 4} fontSize="7.5" fill={theme.inkFaint} textAnchor="middle">{label}</text>}
                      </g>
                    );
                  }
                  if (!activeTypes.has(l.type)) return null;
                  const color = l.type === "prerequisite" ? theme.mist : l.type === "cross_subject" ? theme.moss : theme.line;
                  const dash = l.type === "cross_subject" ? "1.5 4" : "";
                  return (
                    <line
                      key={`l-${i}`}
                      x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
                      stroke={color}
                      strokeWidth={l.type === "related" ? 1 : 1.5}
                      strokeDasharray={dash || undefined}
                      markerEnd={l.type === "prerequisite" ? "url(#icefield-arrow)" : undefined}
                    />
                  );
                })}
              </g>
              <g>
                {nodesRef.current.map(n => {
                  const isCenter = n.kind === "center";
                  const r = isCenter ? 26 : n.role === "core" ? 9 : 6.5;
                  const verified = !isCenter && computeDisplayStatus(n)?.label === "verified";
                  return (
                    <g
                      key={n.id}
                      transform={`translate(${n.x},${n.y})`}
                      opacity={n.role === "ring" ? 0.55 : 1}
                      style={{ cursor: "pointer" }}
                      onPointerDown={e => handleNodePointerDown(e, n)}
                    >
                      {isCenter && <circle r={r + 6} fill="none" stroke={theme.gold} strokeDasharray="1 4" opacity={0.65} />}
                      <circle
                        r={r}
                        fill={isCenter ? theme.card : verified ? theme.mist : theme.card}
                        stroke={isCenter ? theme.gold : theme.mist}
                        strokeWidth={isCenter ? 1.4 : verified ? 2 : 1.4}
                      />
                      {isCenter ? (
                        <>
                          <text y={-5} textAnchor="middle" fontSize="7.5" fill={theme.gold}>{lawName}</text>
                          <text y={9} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={theme.ink}>{articleNo} 條</text>
                        </>
                      ) : (
                        <text y={r + 14} textAnchor="middle" fontSize="9" fill={theme.ink}>
                          {n.title && n.title.length > 10 ? `${n.title.slice(0, 10)}…` : n.title}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        </div>
      )}

      <div style={cardStyle}>
        {panelMode === "statute" && (
          <>
            <div style={{ fontSize: "0.92rem", fontWeight: 500, color: T.ink, marginBottom: "0.5rem" }}>{roomName}</div>
            <div style={{ fontSize: "0.78rem", color: T.faint, marginBottom: "0.6rem" }}>引用本條的爭點 {coreMap.size}</div>
            {[...coreMap.entries()].map(([slug, issue]) => (
              <button
                key={slug}
                onClick={() => { setPanelTarget(slug); setPanelMode("issue"); }}
                style={{ display: "block", textAlign: "left", width: "100%", background: "none", border: "none", color: T.accent, fontSize: "0.85rem", padding: "0.25rem 0", cursor: "pointer", fontFamily: "inherit" }}
              >
                {issue.title || slug}
              </button>
            ))}
            <button
              onClick={() => { setFormSlug(null); setPanelMode("form"); }}
              style={{ marginTop: "0.6rem", padding: "0.45rem 0.8rem", background: T.cta, color: "#ECEAE5", border: "none", borderRadius: 8, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}
            >
              + 新增引用本條的爭點
            </button>
          </>
        )}

        {panelMode === "issue" && panelTarget && (
          <IssueDetail
            T={T}
            slug={panelTarget}
            onBack={() => setPanelMode("statute")}
            onEdit={(slug) => { setFormSlug(slug); setPanelMode("form"); }}
            onOpenStatute={(key) => onOpenStatute(key)}
            onArchivedChange={() => loadRoom(statuteKey)}
          />
        )}

        {panelMode === "form" && (
          <IssueForm
            T={T}
            slug={formSlug}
            initialStatute={formSlug ? undefined : statuteKey}
            notifySyncFailure={notifySyncFailure}
            onSaved={async (savedSlug) => {
              await loadRoom(statuteKey);
              setPanelTarget(savedSlug);
              setPanelMode("issue");
            }}
            onCancel={() => {
              if (formSlug) { setPanelMode("issue"); } else { setPanelMode("statute"); }
            }}
          />
        )}
      </div>
    </div>
  );
}
