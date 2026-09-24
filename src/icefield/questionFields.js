// 題目物件的冰原欄位存取器
// 欄位不存在時一律視為空陣列，因此題庫不需批次加空欄位
export const getIssues   = q => q?.issues   ?? [];
export const getStatutes = q => q?.statutes ?? [];
export const hasIssues   = q => getIssues(q).length > 0;
