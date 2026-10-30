/* ---------- ことば（英語版 Flag Master） ----------
   言語は URL で決まる: en/ の下のページは <html lang="en">（tools/make_en.mjs が作る）。保存はしない。
   画面の日本語は T('日本語', vars) で書く。日本語のページでは日本語をそのまま返すので、今までと1文字も変わらない。
   英語のページでは辞書 I18N_EN（i18n/en-*.js が Object.assign(window.I18N_EN ??= {}, { … }) で足す）を引く。
     値が { one, other } なら vars.n === 1 で one、ほかは other（英語の単数・複数）
     {name} は vars.name に置きかえる。HTML のエスケープはしない（呼ぶ側で esc()）
   データのキー（c.r の地域・S.region・保存値）は日本語のまま。表示するときだけ T() に通す。
   ほかのファイルで T・cName・cCap・LANG・I18N・I18N_EN を宣言しない（tests/unit/i18n.test.mjs が見る） */
(() => {
  const lang = typeof document !== 'undefined' && document.documentElement?.lang === 'en' ? 'en' : 'ja';
  const en = lang === 'en';
  window.LANG = lang;
  window.I18N_EN ??= {};

  const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s;
  const warned = new Set();   // 辞書に無いキーは1回だけ知らせる
  window.T = (ja, vars) => {
    if (!en) return fill(ja, vars);
    const v = window.I18N_EN[ja];
    if (v === undefined) {
      if (!warned.has(ja)) { warned.add(ja); console.warn('[i18n] 辞書に無い: ' + ja); }
      return fill(ja, vars);
    }
    return fill(typeof v === 'object' ? (vars?.n === 1 ? v.one : v.other) : v, vars);
  };
  // 国名・首都（countries.js の n・c と、英語の e・ec）
  // 英語の e・ec が無い（HTTP キャッシュに残った前の countries.js）ときは日本語の n・c で代わりにする
  window.cName = c => en ? c.e ?? c.n : c.n;
  window.cCap = c => en ? c.ec ?? c.c : c.c;

  window.I18N = {
    lang,
    locale: en ? 'en-US' : 'ja-JP',
    hide: new Set(en ? ['ta'] : []),   // 英語版で選べなくするモード（タイムアタックはランキングが未訳）
    // 同じ言語のページへのリンク（ルートからの道。'./' はトップ）
    page: p => en ? (p === './' ? 'en/' : 'en/' + p) : p,
    // 検索用: アクセントを外して小文字に（São Tomé → sao tome）。かなの濁点は消さない
    fold: s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    // 国の並び: 英語は e の ABC 順、日本語は n の五十音順
    byName: (x, y) => en ? (x.e ?? x.n).localeCompare(y.e ?? y.n, 'en') : x.n.localeCompare(y.n, 'ja'),
  };
})();
