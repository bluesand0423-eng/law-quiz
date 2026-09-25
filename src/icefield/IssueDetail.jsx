import { useCallback, useEffect, useState } from "react";
import { getIssue, getLinks, getStatutes, updateIssue, setArchived, updateLinkType, LINK_TYPES } from "./db";
import { computeDisplayStatus } from "./issueDisplay";
import { CODE_TO_LAW_NAME, formatStatuteKey } from "./statuteKey";

const STATUS_LABEL = { draft: "草稿", active: "進行中", verified: "已覆核" };
const LINK_TYPE_LABEL = { prerequisite: "前提", cross_subject: "跨科", related: "相關" };

export default function IssueDetail({ T, slug, onBack, onEdit }) {
  const [issue, setIssue] = useState(null); // undefined 用不到，null=載入中/查無
  const [links, setLinks] = useState([]);
  const [statutes, setStatutes] = useState([]);
  const [titleMap, setTitleMap] = useState({});
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoadError(false);
    const [issueResult, linksResult, statutesResult] = await Promise.all([
      getIssue(slug),
      getLinks(slug),
      getStatutes(slug),
    ]);
    if (issueResult.error || linksResult.error || statutesResult.error) {
      console.error("[IssueDetail] 讀取失敗：", issueResult.error || linksResult.error || statutesResult.error);
      setLoadError(true);
    }
    setIssue(issueResult.data ?? null);
    const linkRows = linksResult.data ?? [];
    setLinks(linkRows);
    setStatutes(statutesResult.data ?? []);

    const relatedSlugs = [...new Set(linkRows.flatMap(l => [l.from_slug, l.to_slug]).filter(s => s !== slug))];
    const map = {};
    await Promise.all(relatedSlugs.map(async s => {
      const { data } = await getIssue(s);
      if (data) map[s] = data.title;
    }));
    setTitleMap(map);
  }, [slug]);

  useEffect(() => { reload(); }, [reload]);

  async function handleStatusChange(newStatus) {
    setBusy(true);
    const { error } = await updateIssue(slug, { status: newStatus });
    if (error) console.error("[IssueDetail] 更新 status 失敗：", error);
    await reload();
    setBusy(false);
  }

  async function handleToggleArchived() {
    setBusy(true);
    const { error } = await setArchived(slug, !issue.archived);
    if (error) console.error("[IssueDetail] 更新 archived 失敗：", error);
    await reload();
    setBusy(false);
  }

  async function handleLinkTypeChange(toSlug, newType) {
    setBusy(true);
    const { error } = await updateLinkType(slug, toSlug, newType);
    if (error) console.error("[IssueDetail] 更新 link_type 失敗：", error);
    await reload();
    setBusy(false);
  }

  const cardStyle = { background: T.surface, borderRadius: 16, padding: "1rem 1.15rem", border: `1px solid ${T.bdr}`, marginBottom: "0.75rem" };
  const backBar = (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.muted, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", padding: "0.2rem 0.4rem", lineHeight: 1 }}>← 返回</button>
      <span style={{ fontSize: "1rem", fontWeight: 500, color: T.ink, fontFamily: "'Noto Serif TC',serif" }}>爭點詳情</span>
    </div>
  );

  if (loadError && !issue) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        {backBar}
        <p style={{ color: T.muted, fontSize: "0.85rem" }}>這次沒能讀到雲端資料，稍後再試一次。</p>
      </div>
    );
  }
  if (issue === null) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        {backBar}
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>載入中…</p>
      </div>
    );
  }

  const disp = computeDisplayStatus(issue);
  const incoming = links.filter(l => l.to_slug === slug);
  const outgoing = links.filter(l => l.from_slug === slug);
  const incomingByType = LINK_TYPES.reduce((acc, t) => ({ ...acc, [t]: incoming.filter(l => l.link_type === t) }), {});

  return (
    <div style={{ marginTop: "0.75rem" }}>
      {backBar}

      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem", color: T.ink, fontFamily: "'Noto Serif TC',serif" }}>{issue.title}</h2>
          <button onClick={() => onEdit(slug)} style={{ background: "none", border: `1px solid ${T.bdr}`, borderRadius: 8, color: T.ink, fontSize: "0.75rem", cursor: "pointer", padding: "0.2rem 0.6rem", height: "fit-content" }}>編輯</button>
        </div>
        <div style={{ fontSize: "0.75rem", color: T.muted, marginTop: "0.25rem" }}>
          {CODE_TO_LAW_NAME[issue.subject] ?? issue.subject}・{issue.slug}
        </div>
        {issue.statement && <p style={{ fontSize: "0.88rem", color: T.ink, marginTop: "0.6rem", whiteSpace: "pre-wrap" }}>{issue.statement}</p>}

        {Array.isArray(issue.views) && issue.views.length > 0 && (
          <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
            {issue.views.map((v, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${T.bdr}`, paddingLeft: "0.6rem" }}>
                <div style={{ fontSize: "0.72rem", color: T.accent, fontWeight: 600 }}>
                  {v.type}
                  {v.content ? `・${v.holder || "有學者主張"}` : ""}
                </div>
                <div style={{ fontSize: "0.82rem", color: T.ink, whiteSpace: "pre-wrap" }}>{v.content || "（尚無內容）"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>反向連結（誰引用了這張卡）</div>
        {incoming.length === 0 ? (
          <p style={{ fontSize: "0.78rem", color: T.faint, margin: 0 }}>還沒有其他卡連向這裡。</p>
        ) : LINK_TYPES.map(t => incomingByType[t].length > 0 && (
          <div key={t} style={{ marginBottom: "0.4rem" }}>
            <div style={{ fontSize: "0.7rem", color: T.muted }}>{LINK_TYPE_LABEL[t]}</div>
            {incomingByType[t].map(l => (
              <div key={l.from_slug} style={{ fontSize: "0.82rem", color: T.ink, padding: "0.15rem 0" }}>
                {titleMap[l.from_slug] ?? l.from_slug}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>出邊（這張卡連向誰）</div>
        {outgoing.length === 0 ? (
          <p style={{ fontSize: "0.78rem", color: T.faint, margin: 0 }}>這張卡目前沒有連向其他卡片。</p>
        ) : outgoing.map(l => (
          <div key={l.to_slug} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.25rem 0" }}>
            <span style={{ fontSize: "0.82rem", color: T.ink }}>{titleMap[l.to_slug] ?? l.to_slug}</span>
            <select
              disabled={busy}
              value={l.link_type}
              onChange={e => handleLinkTypeChange(l.to_slug, e.target.value)}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.35rem", borderRadius: 6, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit" }}
            >
              {LINK_TYPES.map(t => <option key={t} value={t}>{LINK_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>條號</div>
        {statutes.length === 0 ? (
          <p style={{ fontSize: "0.78rem", color: T.faint, margin: 0 }}>還沒有標註條號。</p>
        ) : statutes.map(s => {
          const text = formatStatuteKey({ key: s.statute_key, location: s.location });
          return (
            <div key={`${s.statute_key}-${s.location}`} style={{ fontSize: "0.82rem", color: T.ink, padding: "0.15rem 0" }}>
              {text ?? `${s.statute_key}（無法辨識）`}
            </div>
          );
        })}
        {issue.sources && (
          <p style={{ fontSize: "0.82rem", color: T.ink, marginTop: "0.6rem", paddingTop: "0.6rem", borderTop: `1px solid ${T.bdr}`, whiteSpace: "pre-wrap" }}>{issue.sources}</p>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>狀態</div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <select disabled={busy} value={issue.status} onChange={e => handleStatusChange(e.target.value)} style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem", borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit" }}>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {disp?.note && <span style={{ fontSize: "0.75rem", color: T.gold }}>{disp.note}</span>}
          <button disabled={busy} onClick={handleToggleArchived} style={{ marginLeft: "auto", padding: "0.35rem 0.7rem", background: "transparent", color: issue.archived ? T.green : T.red, border: `1px solid ${T.bdr}`, borderRadius: 8, fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit" }}>
            {issue.archived ? "取消封存" : "封存"}
          </button>
        </div>
      </div>
    </div>
  );
}
