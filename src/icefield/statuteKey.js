// 條號的解析與中文格式化——canonical format 集中於此兩支函式，
// 禁止在其他地方自行拼字串或 split("-") 處理 statute_key。
//
// 法典代碼表已分離至 lawCodes.js：statute_key 用的是「法典代碼」（一對一，
// 如 civ=民法），不是 issues.subject 用的「考科代碼」（一科可能橫跨多部法典，
// 如 adm 行政法）。兩者刻意不建立對照表，見 lawCodes.js 開頭說明。
import { LAW_CODES } from "./lawCodes";

// statute_key 格式：<法典代碼>-<條號>[-<項>[-<前段|後段|款號>]]
// 無法解析的輸入一律回傳 null，不猜測、不拋例外；呼叫端負責處理 null。
export function parseStatuteKey(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.split("-");
  if (parts.length < 2 || parts.some(p => p.length === 0)) return null;

  const [law, article, ...rest] = parts;
  if (!(law in LAW_CODES)) return null;
  if (!/^\d+$/.test(article)) return null;

  return { key: `${law}-${article}`, location: rest.join("-"), law, article };
}

function formatLocation(location) {
  if (!location) return "";
  const [item, ...rest] = location.split("-");
  if (!/^\d+$/.test(item)) return null;

  const base = `第 ${item} 項`;
  if (rest.length === 0) return base;
  if (rest.length === 1) {
    if (rest[0] === "front") return `${base}前段`;
    if (rest[0] === "back") return `${base}後段`;
    if (/^\d+$/.test(rest[0])) return `${base}第 ${rest[0]} 款`;
  }
  return null;
}

export function formatStatuteKey({ key, location } = {}) {
  if (typeof key !== "string") return null;
  const [law, article] = key.split("-");
  if (!law || !article || !/^\d+$/.test(article)) return null;

  const lawName = LAW_CODES[law]?.name;
  if (!lawName) return null;

  const locationText = formatLocation(location);
  if (locationText === null) return null;

  return `${lawName}第 ${article} 條${locationText}`;
}

// 取得該法典的全國法規資料庫 pcode，供跳轉使用。
// 代碼不存在、或該代碼的 pcode 尚未查證（空字串）皆回傳 null，
// 不得用 null 以外的猜測值拼跳轉網址。
export function getPcode(key) {
  if (typeof key !== "string") return null;
  const [law] = key.split("-");
  const pcode = LAW_CODES[law]?.pcode;
  return pcode ? pcode : null;
}
