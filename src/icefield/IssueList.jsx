import { useCallback, useEffect, useState } from "react";
import { listIssues, getLinks } from "./db";
import { computeDisplayStatus } from "./issueDisplay";
import { CODE_TO_LAW_NAME } from "./statuteKey";

const STATUS_LABEL = { draft: "草稿", active: "進行中", verified: "已覆核" };
const SUBJECT_OPTIONS = Object.entries(CODE_TO_LAW_NAME);

export default function IssueList({ T, onOpen, onCreate, onBack }) {
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [issues, setIssues] = useState(null); // null = 載入中
  const [linkCounts, setLinkCounts] = useState({});
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(async () => {
    setIssues(null);
    setLoadError(false);

    const { data, error } = await listIssues({
      subject: subject || undefined,
      status: status || undefined,
      archived: showArchived,
    });
    if (error) {
      console.error("[IssueList] listIssues 失敗：", error);
      setLoadError(true);
      setIssues([]);
      return;
    }
    setIssues(data ?? []);

    const counts = {};
    await Promise.all((data ?? []).map(async (issue) => {
      const { data: links, error: linksError } = await getLinks(issue.slug);
      if (linksError) return;
      counts[issue.slug] = {
        out: (links ?? []).filter(l => l.from_slug === issue.slug).length,
        in: (links ?? []).filter(l => l.to_slug === issue.slug).length,
      };
    }));
    setLinkCounts(counts);
  }, [subject, status, showArchived]);

  useEffect(() => { reload(); }, [reload]);

  const selectStyle = { padding: "0.4rem 0.5rem", borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit", fontSize: "0.8rem" };
  const card = { background: T.surface, borderRadius: 14, padding: "0.85rem 1rem", border: `1px solid ${T.bdr}`, marginBottom: "0.65rem", cursor: "pointer" };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: T.muted, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", padding: "0.2rem 0.4rem", lineHeight: 1 }}>← 回首頁</button>
        <span style={{ fontSize: "1rem", fontWeight: 500, color: T.ink, fontFamily: "'Noto Serif TC',serif" }}>爭點卡</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <select value={subject} onChange={e => setSubject(e.target.value)} style={selectStyle}>
          <option value="">全部科目</option>
          {SUBJECT_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
          <option value="">全部狀態</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", color: T.muted, fontFamily: "'Noto Sans TC',sans-serif" }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          含已封存
        </label>
        <button onClick={onCreate} style={{ marginLeft: "auto", padding: "0.4rem 0.75rem", background: T.cta, color: "#ECEAE5", border: "none", borderRadius: 10, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}>+ 建立新卡</button>
      </div>

      {loadError && (
        <p style={{ color: T.muted, fontSize: "0.8rem", fontFamily: "'Noto Sans TC',sans-serif" }}>這次沒能讀到雲端資料，稍後再試一次。</p>
      )}

      {issues === null ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0", fontFamily: "'Noto Sans TC',sans-serif" }}>載入中…</p>
      ) : issues.length === 0 && !loadError ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0", fontFamily: "'Noto Sans TC',sans-serif" }}>還沒有爭點卡。</p>
      ) : (
        issues.map(issue => {
          const disp = computeDisplayStatus(issue);
          const counts = linkCounts[issue.slug];
          return (
            <div key={issue.slug} style={card} onClick={() => onOpen(issue.slug)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.92rem", fontWeight: 500, color: T.ink, fontFamily: "'Noto Serif TC',serif" }}>{issue.title || "（未命名）"}</span>
                <span style={{ fontSize: "0.7rem", color: T.muted, whiteSpace: "nowrap" }}>{CODE_TO_LAW_NAME[issue.subject] ?? issue.subject}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.35rem" }}>
                <span style={{ fontSize: "0.72rem", color: disp?.note ? T.gold : T.muted, fontFamily: "'Noto Sans TC',sans-serif" }}>
                  {STATUS_LABEL[disp?.label] ?? disp?.label}
                  {disp?.note ? `・${disp.note}` : ""}
                </span>
                <span style={{ fontSize: "0.7rem", color: T.faint }}>
                  {counts ? `出邊 ${counts.out}・入邊 ${counts.in}` : "…"}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
