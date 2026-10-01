import { useCallback, useEffect, useMemo, useState } from "react";
import { listStatuteRefs } from "./db";
import { formatStatuteKey, parseStatuteKey } from "./statuteKey";
import { LAW_CODES } from "./lawCodes";
import { computeDisplayStatus } from "./issueDisplay";

const LAW_OPTIONS = Object.entries(LAW_CODES);
const LAW_ORDER = Object.keys(LAW_CODES);

export default function StatuteLobby({ T, onEnterRoom }) {
  const [refs, setRefs] = useState(null); // null = 載入中
  const [loadError, setLoadError] = useState(false);
  const [lawFilter, setLawFilter] = useState("");
  const [query, setQuery] = useState("");

  const reload = useCallback(async () => {
    setRefs(null);
    setLoadError(false);
    const { data, error } = await listStatuteRefs();
    if (error) {
      console.error("[StatuteLobby] listStatuteRefs 失敗：", error);
      setLoadError(true);
      setRefs([]);
      return;
    }
    setRefs(data ?? []);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const groups = useMemo(() => {
    if (!refs) return [];
    const byKey = new Map();
    for (const row of refs) {
      const parsed = parseStatuteKey(row.statute_key);
      if (!parsed) continue; // 已寫入的資料理論上都已驗證過，防禦性跳過不可解析的列
      if (!byKey.has(row.statute_key)) {
        byKey.set(row.statute_key, { key: row.statute_key, law: parsed.law, article: parsed.article, issues: new Map() });
      }
      byKey.get(row.statute_key).issues.set(row.issue_slug, row.issue);
    }

    const query_ = query.trim();
    const numericQuery = /^\d+$/.test(query_) ? query_ : null;

    const filtered = [...byKey.values()].filter(s => {
      if (lawFilter && s.law !== lawFilter) return false;
      if (numericQuery && !s.article.startsWith(numericQuery)) return false;
      return true;
    });

    const byLaw = new Map();
    filtered.forEach(s => {
      if (!byLaw.has(s.law)) byLaw.set(s.law, []);
      byLaw.get(s.law).push(s);
    });

    return LAW_ORDER
      .filter(law => byLaw.has(law))
      .map(law => ({
        law,
        name: LAW_CODES[law]?.name ?? law,
        rows: byLaw.get(law).sort((a, b) => Number(a.article) - Number(b.article)),
      }));
  }, [refs, lawFilter, query]);

  const selectStyle = { padding: "0.4rem 0.5rem", borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit", fontSize: "0.8rem" };
  const inputStyle = { ...selectStyle, flex: 1, minWidth: 0 };
  const rowStyle = { display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.2rem", borderBottom: `1px solid ${T.bdr}`, cursor: "pointer" };

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <select value={lawFilter} onChange={e => setLawFilter(e.target.value)} style={selectStyle}>
          <option value="">全部法典</option>
          {LAW_OPTIONS.map(([code, info]) => <option key={code} value={code}>{info.name}</option>)}
        </select>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="條號，例如 400"
          style={inputStyle}
        />
      </div>

      {loadError && (
        <p style={{ color: T.muted, fontSize: "0.8rem" }}>這次沒能讀到雲端資料，稍後再試一次。</p>
      )}

      {refs === null ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>載入中…</p>
      ) : refs.length === 0 && !loadError ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>還沒有爭點卡標註條號。</p>
      ) : totalRows === 0 && !loadError ? (
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>沒有符合目前篩選的條文。</p>
      ) : (
        groups.map(g => (
          <div key={g.law} style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.7rem", color: T.faint, letterSpacing: "0.08em", marginBottom: "0.3rem" }}>{g.name}</div>
            {g.rows.map(s => {
              const name = formatStatuteKey({ key: s.key, location: "" });
              const pending = [...s.issues.values()].some(i => computeDisplayStatus(i)?.label !== "verified");
              return (
                <div key={s.key} style={rowStyle} onClick={() => onEnterRoom(s.key)}>
                  <span style={{ fontSize: "0.88rem", color: T.ink, flex: 1 }}>{name ?? s.key}</span>
                  <span style={{ fontSize: "0.72rem", color: T.faint }}>爭點 {s.issues.size}</span>
                  {pending && (
                    <span title="尚有未覆核的爭點" style={{ width: 7, height: 7, borderRadius: "50%", background: T.gold, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
