import { useEffect, useState } from "react";
import { getIssue, getStatutes, createIssue, updateIssue, setStatutes, upsertLinks } from "./db";
import { parseStatuteKey, formatStatuteKey, CODE_TO_LAW_NAME } from "./statuteKey";

const STATUS_LABEL = { draft: "草稿", active: "進行中", verified: "已覆核" };
const SUBJECT_OPTIONS = Object.entries(CODE_TO_LAW_NAME);
const VIEW_TYPES = ["通說", "有力說", "實務"];

function emptyViews() {
  return VIEW_TYPES.map(type => ({ type, holder: "", content: "" }));
}

// 既有 issue_statutes 列還原成使用者輸入時的原始字串（與 parseStatuteKey round-trip）
function statuteRowToRaw(row) {
  return row.location ? `${row.statute_key}-${row.location}` : row.statute_key;
}

export default function IssueForm({ T, slug, notifySyncFailure, onSaved, onCancel }) {
  const isEditing = !!slug;
  const [loading, setLoading] = useState(isEditing);
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0][0]);
  const [title, setTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [views, setViews] = useState(emptyViews());
  const [status, setStatus] = useState("draft");
  const [practiceDivergent, setPracticeDivergent] = useState(false);
  const [examRefs, setExamRefs] = useState([]);
  const [examRefInput, setExamRefInput] = useState("");
  const [statuteRaws, setStatuteRaws] = useState([]);
  const [statuteInput, setStatuteInput] = useState("");
  const [statuteInputError, setStatuteInputError] = useState("");
  const [sources, setSources] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      const [{ data: issue, error }, { data: statuteRows }] = await Promise.all([
        getIssue(slug),
        getStatutes(slug),
      ]);
      if (error || !issue) {
        console.error("[IssueForm] 讀取既有卡片失敗：", error);
        notifySyncFailure("這次沒能讀到這張卡的資料，請稍後再試。");
        setLoading(false);
        return;
      }
      setSubject(issue.subject);
      setTitle(issue.title || "");
      setStatement(issue.statement || "");
      setViews(Array.isArray(issue.views) && issue.views.length === VIEW_TYPES.length
        ? issue.views
        : emptyViews());
      setStatus(issue.status || "draft");
      setPracticeDivergent(!!issue.practice_divergent);
      setExamRefs(issue.external_exam_refs || []);
      setSources(issue.sources || "");
      setStatuteRaws((statuteRows || []).map(statuteRowToRaw));
      setLoading(false);
    })();
  }, [slug, isEditing, notifySyncFailure]);

  function updateView(index, field, value) {
    setViews(vs => vs.map((v, i) => i === index ? { ...v, [field]: value } : v));
  }

  function addExamRef() {
    const v = examRefInput.trim();
    if (!v) return;
    setExamRefs(refs => [...refs, v]);
    setExamRefInput("");
  }
  function removeExamRef(i) {
    setExamRefs(refs => refs.filter((_, idx) => idx !== i));
  }

  function addStatute() {
    const raw = statuteInput.trim();
    if (!raw) return;
    if (!parseStatuteKey(raw)) {
      setStatuteInputError("看不懂這個條號格式，未加入。");
      return;
    }
    setStatuteRaws(list => [...list, raw]);
    setStatuteInput("");
    setStatuteInputError("");
  }
  function removeStatute(i) {
    setStatuteRaws(list => list.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      subject,
      title,
      statement,
      views,
      status,
      practice_divergent: practiceDivergent,
      external_exam_refs: examRefs,
      sources,
    };

    let targetSlug = slug;
    if (isEditing) {
      const { error } = await updateIssue(slug, payload);
      if (error) {
        console.error("[IssueForm] updateIssue 失敗：", error);
        notifySyncFailure();
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await createIssue(payload);
      if (error) {
        console.error("[IssueForm] createIssue 失敗：", error);
        notifySyncFailure();
        setSaving(false);
        return;
      }
      targetSlug = data.slug;
    }

    const statutesResult = await setStatutes(targetSlug, statuteRaws);
    if (statutesResult.error) {
      console.error("[IssueForm] setStatutes 失敗：", statutesResult.error);
      notifySyncFailure();
      setSaving(false);
      return;
    }

    const combinedText = [statement, ...views.map(v => v.content)].filter(Boolean).join("\n");
    const linksResult = await upsertLinks(targetSlug, combinedText);
    if (linksResult.error) {
      console.error("[IssueForm] upsertLinks 失敗：", linksResult.error);
      notifySyncFailure();
      setSaving(false);
      return;
    }

    setSaving(false);
    onSaved(targetSlug);
  }

  const cardStyle = { background: T.surface, borderRadius: 16, padding: "1rem 1.15rem", border: `1px solid ${T.bdr}`, marginBottom: "0.75rem" };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "0.5rem 0.6rem", borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit", fontSize: "0.85rem" };
  const label = { fontSize: "0.72rem", color: T.muted, marginBottom: "0.25rem", display: "block" };
  const chip = { display: "inline-flex", alignItems: "center", gap: "0.3rem", background: T.bg, border: `1px solid ${T.bdr}`, borderRadius: 100, padding: "0.2rem 0.6rem", fontSize: "0.76rem", color: T.ink, marginRight: "0.35rem", marginBottom: "0.35rem" };

  if (loading) {
    return (
      <div style={{ marginTop: "0.75rem" }}>
        <p style={{ color: T.faint, fontSize: "0.85rem", textAlign: "center", padding: "2.5rem 0" }}>載入中…</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: T.muted, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", padding: "0.2rem 0.4rem", lineHeight: 1 }}>← 返回</button>
        <span style={{ fontSize: "1rem", fontWeight: 500, color: T.ink, fontFamily: "'Noto Serif TC',serif" }}>{isEditing ? "編輯爭點卡" : "建立爭點卡"}</span>
      </div>

      <div style={cardStyle}>
        <label style={label}>slug</label>
        <div style={{ fontSize: "0.8rem", color: T.faint, marginBottom: "0.6rem" }}>{isEditing ? slug : "（存檔後自動產生）"}</div>

        <label style={label}>科目</label>
        <select value={subject} disabled={isEditing} onChange={e => setSubject(e.target.value)} style={{ ...inputStyle, marginBottom: "0.6rem" }}>
          {SUBJECT_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>

        <label style={label}>爭點一句話（疑問句）</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="例：表見代理是否以本人有可歸責事由為要件？" style={{ ...inputStyle, marginBottom: "0.6rem" }} />

        <label style={label}>正文（可用 [[slug]] 或 [[slug|別名]] 連結其他爭點卡）</label>
        <textarea value={statement} onChange={e => setStatement(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.6rem" }}>對立見解</div>
        {views.map((v, i) => (
          <div key={v.type} style={{ marginBottom: i < views.length - 1 ? "0.7rem" : 0 }}>
            <label style={label}>{v.type}（持有者不確定時留空，顯示為「有學者主張」）</label>
            <input value={v.holder} onChange={e => updateView(i, "holder", e.target.value)} placeholder="持有者（可留空）" style={{ ...inputStyle, marginBottom: "0.3rem" }} />
            <textarea value={v.content} onChange={e => updateView(i, "content", e.target.value)} rows={2} placeholder="內容（此說不存在可留空，區塊仍保留）" style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>涉及條號</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
          <input value={statuteInput} onChange={e => { setStatuteInput(e.target.value); setStatuteInputError(""); }} placeholder="例：civ-184-1-front" style={inputStyle} />
          <button onClick={addStatute} style={{ padding: "0.5rem 0.8rem", background: T.cta, color: "#ECEAE5", border: "none", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>加入</button>
        </div>
        {statuteInputError && <p style={{ color: T.red, fontSize: "0.75rem", margin: "0 0 0.4rem" }}>{statuteInputError}</p>}
        <div>
          {statuteRaws.map((raw, i) => {
            const parsed = parseStatuteKey(raw);
            const text = parsed ? formatStatuteKey(parsed) : raw;
            return (
              <span key={`${raw}-${i}`} style={chip}>
                {text}
                <button onClick={() => removeStatute(i)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>×</button>
              </span>
            );
          })}
        </div>

        <label style={{ ...label, marginTop: "0.5rem" }}>出處與要件文字</label>
        <textarea value={sources} onChange={e => setSources(e.target.value)} rows={4} placeholder="要件文字、實務見解摘要。未經覆核請標【待查證】" style={{ ...inputStyle, resize: "vertical" }} />
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.4rem" }}>考古題出處（僅填題庫尚未收錄者）</div>
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
          <input value={examRefInput} onChange={e => setExamRefInput(e.target.value)} placeholder="例：114年司律一試 民法 第5題" style={inputStyle} />
          <button onClick={addExamRef} style={{ padding: "0.5rem 0.8rem", background: T.cta, color: "#ECEAE5", border: "none", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>加入</button>
        </div>
        <div>
          {examRefs.map((ref, i) => (
            <span key={`${ref}-${i}`} style={chip}>
              {ref}
              <button onClick={() => removeExamRef(i)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <label style={label}>狀態</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, marginBottom: "0.6rem" }}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: T.ink, fontFamily: "'Noto Sans TC',sans-serif" }}>
          <input type="checkbox" checked={practiceDivergent} onChange={e => setPracticeDivergent(e.target.checked)} />
          實務與本卡所載通說有差異（人工判定，非客觀事實）
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.6rem" }}>
        <button onClick={onCancel} disabled={saving} style={{ flex: 1, padding: "0.72rem", background: "transparent", color: T.ink, border: `1.5px solid ${T.bdr}`, borderRadius: 12, fontSize: "0.87rem", cursor: "pointer", fontFamily: "inherit" }}>取消</button>
        <button onClick={handleSave} disabled={saving || !title.trim()} style={{ flex: 1, padding: "0.72rem", background: title.trim() ? T.cta : "#C4BEB7", color: "#ECEAE5", border: "none", borderRadius: 12, fontSize: "0.87rem", fontWeight: 600, cursor: title.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
          {saving ? "存檔中…" : "存檔"}
        </button>
      </div>
    </div>
  );
}
