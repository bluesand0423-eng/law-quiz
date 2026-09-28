// 法典代碼表——與 issues.subject 的 15 科考科代碼完全無關，不要交叉引用。
// 一科可能橫跨多部法典（如行政法），一部法典也可能被多科引用（如民法），
// 所以 subject 與這裡的法典代碼刻意不建立對照表，也不做任何跨科驗證。
//
// 代碼為內部主鍵：可讀、永不改名、不依賴外部系統。
// pcode 為全國法規資料庫的識別碼，僅供跳轉，查無時留空字串（""），
// 呼叫端以 getPcode() 取得，查無或為空一律回傳 null，不得用來猜測跳轉網址。
//
// 以下 pcode 已逐一核對 App.jsx 既有的 LAW_PCODE_MAP：
// - civ / cvp / cri / csp / ins / con：兩表數值一致
// - enf / com / neg：與 LAW_PCODE_MAP 的既有值不同，已以 LAW_PCODE_MAP 為準覆蓋
// - sec：LAW_PCODE_MAP 沒有「證券交易法」這個鍵，留空字串，待苳自行查證後補
//
// 代碼表是長出來的，不是一次列完的：標到哪一部法典才加哪一部。
export const LAW_CODES = {
  civ: { name: "民法",         pcode: "B0000001" },
  cvp: { name: "民事訴訟法",   pcode: "B0010001" },
  cri: { name: "刑法",         pcode: "C0000001" },
  csp: { name: "刑事訴訟法",   pcode: "C0010001" },
  enf: { name: "強制執行法",   pcode: "B0010003" },
  com: { name: "公司法",       pcode: "D0050001" },
  sec: { name: "證券交易法",   pcode: "" },
  ins: { name: "保險法",       pcode: "G0390002" },
  neg: { name: "票據法",       pcode: "G0380028" },
  con: { name: "中華民國憲法", pcode: "A0000001" },
};
