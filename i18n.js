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
    // 英語版で出さないもの（未訳の機能の名前を入れる）。いまは両方の言語で空（PR8 で冒険も英語に）。しくみは残す
    hide: new Set(),
    // 同じ言語のページへのリンク（ルートからの道。'./' はトップ）
    page: p => en ? (p === './' ? 'en/' : 'en/' + p) : p,
    // 検索用: アクセントを外して小文字に（São Tomé → sao tome）。かなの濁点は消さない
    fold: s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    // 国の並び: 英語は e の ABC 順、日本語は n の五十音順
    byName: (x, y) => en ? (x.e ?? x.n).localeCompare(y.e ?? y.n, 'en') : x.n.localeCompare(y.n, 'ja'),
    // 次に来る日本時間の h:m（weekly なら次の月曜の h:m）が、その人の時間帯（tz。ふだんは端末の時間帯）で何時か。
    // 英語は '11:00 AM'・'Sunday 10:00 AM'。日本語のページと、その時刻に日本時間と同じずれ（+9:00）の時間帯では ''（添えない）。
    // 文は返さない（添え書きの文は呼ぶ側の辞書）
    localOf: (h, m, { weekly = false, now = new Date(), tz } = {}) => {
      if (!en) return '';
      const DAY = 864e5, n = +now, j = new Date(n + 9 * 3600e3);   // j の UTC の年月日・曜日が日本時間のもの
      let at = Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate(), h - 9, m);
      if (weekly) at += (8 - j.getUTCDay()) % 7 * DAY;   // 日本時間の次の月曜（今日が月曜なら今日）
      if (at <= n) at += weekly ? 7 * DAY : DAY;
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(at).map(x => [x.type, +x.value]));
      if (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at === 9 * 3600e3) return '';
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: weekly ? 'long' : undefined })
        .format(at).replace(/[\u202f\u00a0]/g, ' ');   // ICU によっては AM の前が狭い空白
    },
    // 日本時間の日付 'YYYY-MM-DD' の表示: 英語は 'Oct 30'、日本語は '10月30日'
    // （日本語の形も Intl で作る。i18n.js は日本語の文字を持たない）
    dayLabel: day => {
      const [y, mo, d] = day.split('-').map(Number);
      return new Intl.DateTimeFormat(en ? 'en-US' : 'ja-JP', { month: en ? 'short' : 'long', day: 'numeric', timeZone: 'UTC' }).format(Date.UTC(y, mo - 1, d));
    },
  };
})();
