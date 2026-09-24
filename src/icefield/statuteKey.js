// 條號的解析與中文格式化——canonical format 集中於此兩支函式，
// 禁止在其他地方自行拼字串或 split("-") 處理 statute_key。

// 15 科法規代碼對照表（依 CLAUDE.md 科目代碼常數）
const CODE_TO_LAW_NAME = {
  civ: "民法",
  cri: "刑法",
  con: "憲法",
  cvp: "民事訴訟法",
  csp: "刑事訴訟法",
  adm: "行政法",
  eth: "法律倫理",
  ipub: "國際公法",
  ipriv: "國際私法",
  com: "公司法",
  ins: "保險法",
  neg: "票據法",
  sec: "證券交易法",
  enf: "強制執行法",
  eng: "法學英文",
};

// statute_key 格式：<法規代碼>-<條號>[-<項>[-<前段|後段|款號>]]
// 無法解析的輸入一律回傳 null，不猜測、不拋例外；呼叫端負責處理 null。
export function parseStatuteKey(raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.split("-");
  if (parts.length < 2 || parts.some(p => p.length === 0)) return null;

  const [law, article, ...rest] = parts;
  if (!(law in CODE_TO_LAW_NAME)) return null;
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

  const lawName = CODE_TO_LAW_NAME[law];
  if (!lawName) return null;

  const locationText = formatLocation(location);
  if (locationText === null) return null;

  return `${lawName}第 ${article} 條${locationText}`;
}
