// 原型（docs/prototype/issue-graph-prototype-v07.html）用 --mist／--rose／
// --moss／--gold 等語意色名。這裡集中把它們對應回既有的 T 色彩常數，
// 不新增任何色碼——對應依語意選定，未與原型色碼逐一比對；實際色碼是否
// 一致【待確認】：
//   mist（霧藍） → T.muted
//   rose（塵玫） → T.red
//   moss（苔綠） → T.green
//   gold         → T.gold（已存在，名稱相同）
// line／card 兩個原型變數也都有對應：line→T.bdr、card→T.surface。
// 僅「ink-soft」（介於 ink 與 faint 之間的柔和語氣）在 T 裡沒有對應的既有值，
// 以 T.muted 代用，不新增色碼。
export function buildGraphTheme(T) {
  return {
    mist: T.muted,
    rose: T.red,
    moss: T.green,
    gold: T.gold,
    line: T.bdr,
    card: T.surface,
    ink: T.ink,
    inkSoft: T.muted,
    inkFaint: T.faint,
  };
}
