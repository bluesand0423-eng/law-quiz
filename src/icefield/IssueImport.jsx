import { useState } from "react";
import { listIssues, createIssue, setStatutes, createLinks } from "./db";
import { validateImport, runImport } from "./importIssues";
import { formatStatuteKey, parseStatuteKey } from "./statuteKey";
import { SUBJECTS } from "./subjects";

const KIND_LABEL = { create: "新建", skip: "略過，沿用既有 slug" };

function formatStatuteRaw(raw) {
  const parsed = parseStatuteKey(raw);
  return parsed ? (formatStatuteKey(parsed) ?? raw) : raw;
}

export default function IssueImport({ T, notifySyncFailure, onOpenIssue }) {
  const [rawText, setRawText] = useState("");
  const [parseError, setParseError] = useState("");
  const [checking, setChecking] = useState(false);
  const [validation, setValidation] = useState(null); // { errors, plan, links, source }
  const [writing, setWriting] = useState(false);
  const [result, setResult] = useState(null); // { refToSlug, error, stoppedAt }

  async function handlePreview() {
    setParseError("");
    setValidation(null);
    setResult(null);

    let json;
    try {
      json = JSON.parse(rawText);
    } catch (e) {
      setParseError(`JSON 解析失敗：${e.message}`);
      return;
    }

    setChecking(true);
    // 重複偵測與 link 端點檢查須涵蓋已封存的卡片，分兩次查詢後合併。
    const [activeResult, archivedResult] = await Promise.all([
      listIssues({ archived: false }),
      listIssues({ archived: true }),
    ]);
    if (activeResult.error || archivedResult.error) {
      console.error("[IssueImport] 讀取既有爭點卡失敗：", activeResult.error || archivedResult.error);
      notifySyncFailure?.();
      setChecking(false);
      return;
    }
    const existingIssues = [...(activeResult.data ?? []), ...(archivedResult.data ?? [])];
    setValidation(validateImport(json, existingIssues));
    setChecking(false);
  }

  async function handleWrite() {
    if (!validation || validation.errors.length > 0 || writing || result) return;
    setWriting(true);
    const outcome = await runImport(
      { plan: validation.plan, links: validation.links },
      { createIssue, setStatutes, createLinks, notifySyncFailure }
    );
    setResult(outcome);
    setWriting(false);
  }

  const cardStyle = { background: T.surface, borderRadius: 16, padding: "1rem 1.15rem", border: `1px solid ${T.bdr}`, marginBottom: "0.75rem" };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "0.5rem 0.6rem", borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.bg, color: T.ink, fontFamily: "inherit", fontSize: "0.85rem" };

  const hasErrors = (validation?.errors?.length ?? 0) > 0;
  const canWrite = !!validation && !hasErrors && !writing && !result;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>批次匯入（講義 → 爭點卡）</div>
        <p style={{ fontSize: "0.75rem", color: T.faint, margin: "0 0 0.5rem" }}>
          貼上 JSON 後按「預覽」。寫入一律為草稿狀態，之後再逐張覆核。
        </p>
        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setParseError(""); setValidation(null); setResult(null); }}
          rows={10}
          placeholder='{"issues": [...], "links": [...]}'
          style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: "0.78rem" }}
        />
        {parseError && <p style={{ color: T.red, fontSize: "0.78rem", margin: "0.5rem 0 0" }}>{parseError}</p>}
        <button
          onClick={handlePreview}
          disabled={checking || !rawText.trim()}
          style={{ marginTop: "0.6rem", padding: "0.45rem 0.8rem", background: T.cta, color: "#ECEAE5", border: "none", borderRadius: 8, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit" }}
        >
          {checking ? "檢查中…" : "預覽"}
        </button>
      </div>

      {validation && (
        <div style={cardStyle}>
          {validation.source && <div style={{ fontSize: "0.75rem", color: T.faint, marginBottom: "0.5rem" }}>來源：{validation.source}</div>}
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>
            預覽（{validation.plan.length} 張卡・{validation.links.length} 條連結）
          </div>

          {validation.plan.map((entry, i) => (
            <div key={`${entry.ref}-${i}`} style={{ padding: "0.4rem 0", borderBottom: i < validation.plan.length - 1 ? `1px solid ${T.bdr}` : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", color: T.ink }}>{entry.ref}・{entry.title || "（無標題）"}</span>
                <span style={{ fontSize: "0.72rem", color: entry.kind === "skip" ? T.gold : T.green, whiteSpace: "nowrap" }}>{KIND_LABEL[entry.kind]}</span>
              </div>
              <div style={{ fontSize: "0.72rem", color: T.muted, marginTop: "0.2rem" }}>
                {SUBJECTS[entry.subject] ?? entry.subject}
                {entry.statutes.length > 0 && `・${entry.statutes.map(formatStatuteRaw).join("、")}`}
                {entry.requestedStatus && `・status "${entry.requestedStatus}" 已改為草稿`}
              </div>
            </div>
          ))}

          {hasErrors && (
            <div style={{ marginTop: "0.6rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: T.red, marginBottom: "0.3rem" }}>錯誤（{validation.errors.length}）</div>
              {validation.errors.map((err, i) => (
                <div key={i} style={{ fontSize: "0.76rem", color: T.red, padding: "0.1rem 0" }}>{err}</div>
              ))}
            </div>
          )}

          {!result && (
            <button
              onClick={handleWrite}
              disabled={!canWrite}
              style={{ marginTop: "0.7rem", padding: "0.5rem 0.9rem", background: canWrite ? T.cta : "#C4BEB7", color: "#ECEAE5", border: "none", borderRadius: 8, fontSize: "0.82rem", cursor: canWrite ? "pointer" : "not-allowed", fontFamily: "inherit" }}
            >
              {writing ? "寫入中…" : "寫入"}
            </button>
          )}
        </div>
      )}

      {result && (
        <div style={cardStyle}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: T.ink, marginBottom: "0.5rem" }}>
            {result.error ? "寫入中途失敗" : "寫入完成"}
          </div>
          {result.error && (
            <p style={{ fontSize: "0.78rem", color: T.red, margin: "0 0 0.5rem" }}>
              停在{result.stoppedAt?.ref ? `${result.stoppedAt.ref} 的 ` : ""}{result.stoppedAt?.step}。已完成的卡片保留，未回滾；可直接重貼同一份 JSON 繼續。
            </p>
          )}
          {Object.entries(result.refToSlug).map(([ref, slug]) => (
            <button
              key={ref}
              onClick={() => onOpenIssue?.(slug)}
              style={{ display: "block", textAlign: "left", width: "100%", background: "none", border: "none", color: T.accent, fontSize: "0.82rem", padding: "0.2rem 0", cursor: "pointer", fontFamily: "inherit" }}
            >
              {ref} → {slug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
