// 「覆核後已修改」規則（規劃書 §3.1）：updated_at > verified_at 時一律以
// active 顯示並加註，不論 status 欄位實際值為何，避免引用一張標著 verified
// 但內容早已改過的卡。抽成純函式方便測試，也讓列表與詳情頁共用同一套判斷。
export function computeDisplayStatus(issue) {
  if (!issue) return null;
  const { status, verified_at, updated_at } = issue;
  if (verified_at && updated_at && new Date(updated_at) > new Date(verified_at)) {
    return { label: "active", note: "覆核後已修改" };
  }
  return { label: status, note: null };
}
