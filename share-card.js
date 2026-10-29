(() => {
  'use strict';
  // 結果画像のシェア（タイムアタックのクリア画面・今日の難問の結果）。外から使うのは SHARECARD.attach(btn, data) だけ。
  // 前半（SHARE・normalize・layout）は DOM にさわらない（tests/unit/share-card.test.mjs が vm で読む）。
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
  // 画像にも data にも国名・首都・プロフィールの名前を入れない。今日の難問は国旗を出さない（答えは明日まで隠す）

  const SHARE = Object.freeze({ url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', w: 1200, h: 675, maxFlags: 24 });
  const COLS = 8;
  const GRID = ['ok', 'ng', 'skip'];
  const str = v => typeof v === 'string' ? v : '';

  // data を決まった8つのキーだけの新しいオブジェクトにする（ほかのキーは落とす）
  function normalize(d) {
    const x = d && typeof d === 'object' ? d : {};
    const kind = x.kind === 'daily' ? 'daily' : 'ta';
    return {
      kind,
      title: str(x.title), big: str(x.big), sub: str(x.sub),
      rank: typeof x.rank === 'string' ? x.rank : null,
      flags: kind === 'daily' || !Array.isArray(x.flags) ? [] : x.flags.filter(a => typeof a === 'string'),
      grid: Array.isArray(x.grid) ? x.grid.map(g => GRID.includes(g) ? g : 'skip') : [],
      text: str(x.text),
    };
  }

  // 国旗のマス: 24枚までは全部。それより多ければ先頭23枚と、最後のマスに「+N」
  function layout(d) {
    const f = d.kind === 'daily' ? [] : d.flags;
    const over = f.length > SHARE.maxFlags;
    const cells = over ? f.slice(0, SHARE.maxFlags - 1) : f.slice();
    const more = over ? f.length - cells.length : 0;
    const n = cells.length + (more ? 1 : 0);
    return { cells, more, cols: Math.min(COLS, n), rows: Math.ceil(n / COLS) };
  }

  function attach() {}

  globalThis.SHARECARD = { SHARE, normalize, layout, attach };
})();
