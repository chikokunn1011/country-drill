// れんぞく日数（A5）: クイズ・今日の難問・冒険のバトルを終えた日を数え、ホームの #home-status に1行で出す。出題には一切かかわらない。
// 前半は DOM にさわらない計算（globalThis.STREAK_CORE。テストでは vm で読み込む）、後半はホームの行と数えるリスナー。
// index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
// 画面の文は T()（i18n.js）。英語の訳は i18n/en-daily.js。日付の区切りは英語版でも日本時間の0時のまま（英語の画面でだけ、その人の時間を I18N.localOf で添える）

// ---------- 前半: STREAK_CORE（どれも引数を書きかえない） ----------
// 形: { v:1, cur, best, last:'YYYY-MM-DD'|null, played:[…], rest:[…] }。played・rest は直近14日ぶん。
// 日付は日本時間の 'YYYY-MM-DD'（DAILY_CORE.jstDay）。週は月曜はじまりで、お休み券は週に1枚・自動で使う
(() => {
  'use strict';
  const D = globalThis.DAILY_CORE;
  if (!D || typeof D.addDays !== 'function' || typeof D.validDay !== 'function') { console.error('[streak] DAILY_CORE が無い'); return; }
  const MAX = 1e5, KEEP = 14;
  const dayNo = day => Math.round(Date.parse(day + 'T00:00:00Z') / 864e5);   // 1970-01-01 からの通算日（UTC）
  const fresh = () => ({ v: 1, cur: 0, best: 0, last: null, played: [], rest: [] });
  const count = n => Number.isInteger(n) && n >= 0 && n <= MAX;
  const days = a => Array.isArray(a) && a.every(D.validDay);
  // その週の月曜。1970-01-01 は木曜なので、通算日 +3 を7で割った余りが月曜からの日数
  const weekOf = day => D.addDays(day, -(((dayNo(day) + 3) % 7 + 7) % 7));

  // 正しければ同じ中身（best < cur なら best = cur）、どこか壊れていれば fresh()
  function sanitize(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.v !== 1) return fresh();
    if (!count(x.cur) || !count(x.best) || !(x.last === null || D.validDay(x.last)) || !days(x.played) || !days(x.rest)) return fresh();
    return { v: 1, cur: x.cur, best: Math.max(x.best, x.cur), last: x.last, played: x.played.slice(), rest: x.rest.slice() };
  }

  // day に遊んだ。同じ日・過去の日（端末の時計が戻った）は何もしない
  function record(st, day) {
    const out = { ...st, played: st.played.slice(), rest: st.rest.slice() };
    if (st.last !== null && day <= st.last) return out;
    if (st.last === null) out.cur = 1;
    else {
      const gap = dayNo(day) - dayNo(st.last) - 1;   // あいだの遊ばなかった日の数
      let ok = gap < 7;
      // 古い順に、その日の週の券がまだ残っていれば使う。1日でも使えなければ切れる。切れたときは、この空きのために足した券を戻す
      // （つながらない空きで券を使わない。8日以上あいたときと同じで、ホームの表示も遊ぶ前と後で同じになる）
      for (let i = 1; ok && i <= gap; i++) {
        const d = D.addDays(st.last, i), w = weekOf(d);
        if (out.rest.some(r => weekOf(r) === w)) ok = false;
        else out.rest.push(d);
      }
      if (!ok) out.rest = st.rest.slice();
      out.cur = ok ? Math.min(st.cur + 1, MAX) : 1;
    }
    out.best = Math.max(st.best, out.cur);
    out.last = day;
    out.played.push(day);
    const from = D.addDays(day, -(KEEP - 1));
    out.played = out.played.filter(d => d >= from);
    out.rest = out.rest.filter(d => d >= from);
    return out;
  }

  // ホームに出す形。state: today（今日もう遊んだ）／keep（今日遊べば続く）／rest（券でつながる）／start（はじめて・切れた）
  function view(st, today) {
    let state, cur = st.cur, next = null, rest = st.rest;
    if (st.last !== null && today <= st.last) state = 'today';
    else {
      const sim = record(st, today);
      if (st.cur > 0 && sim.cur > 1) {   // 続いた（切れたら record は cur=1 にする）
        state = dayNo(today) - dayNo(st.last) > 1 ? 'rest' : 'keep';
        next = sim.cur; rest = sim.rest;
      } else { state = 'start'; cur = 0; next = 1; }
    }
    const thisWeek = weekOf(today);
    const tickets = rest.some(r => weekOf(r) === thisWeek) ? 0 : 1;
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = D.addDays(thisWeek, i);
      const mark = st.played.includes(day) ? 'play' : day === today ? 'today' : day > today ? 'future' : rest.includes(day) ? 'rest' : 'miss';
      return { day, mark };
    });
    return { cur, best: st.best, tickets, state, next, week };
  }

  globalThis.STREAK_CORE = { fresh, sanitize, record, view, weekOf };
})();

// ---------- 後半: ホームの行（#home-status の最後）と、遊んだ日を数えるリスナー。描き直すのは drill:screen {name:'home'} のときと読み込み時だけ ----------
(() => {
  'use strict';
  const NEED = { store: typeof store, emit: typeof emit, $: typeof $, T: typeof T, I18N: typeof I18N, DAILY_CORE: typeof DAILY_CORE, STREAK_CORE: typeof globalThis.STREAK_CORE };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[streak] 必要なものが読み込めなかったので、れんぞく日数はお休み: ${missing.join(' ')}`); return; }
  const status = $('home-status');
  if (!status) { console.error('[streak] #home-status が無いので、れんぞく日数はお休み'); return; }

  const K = globalThis.STREAK_CORE, KEY = 'streak';
  // 表示は T() を通す（英語は Mon〜Sun、Played・Rest pass・Missed・Today）
  // i18n-data:start
  const WD = ['月', '火', '水', '木', '金', '土', '日'];
  const MARK = { play: 'あそんだ', rest: 'お休み券', miss: 'お休み', today: '今日', future: '' };
  // i18n-data:end
  const load = () => K.sanitize(store.get(KEY, null));
  const today = () => DAILY_CORE.jstDay();
  // 日本時間の日付の表示: 日本語 '10/28'・英語 'Oct 28'（I18N.dayLabel）
  const md = day => I18N.lang === 'en' ? I18N.dayLabel(day) : `${+day.slice(5, 7)}/${+day.slice(8, 10)}`;
  // 数の入る文の数だけ太字に（数は T の { one, other } を選ぶので、そのまま渡してから包む。文には数がほかに無い）
  const boldNum = s => s.replace(/\d+/, '<b>$&</b>');

  let el = null;
  function build() {
    el = document.createElement('div');
    el.id = 'streak'; el.className = 'home-streak';   // .streak はクイズの連続正解（#pstreak）が使っている
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', T('れんぞく日数'));
    // .sk-pop は7マスと、英語の画面でだけ出す「日付は日本時間の0時で変わる（あなたの時間で…）」（.sk-tz。小窓を開いたときだけ）
    el.innerHTML = '<p class="sk-text"></p><div class="sk-sub">' +
      `<button type="button" class="sk-open" aria-expanded="false" aria-controls="sk-week">${T('今週')}</button>` +
      `<span class="sk-pop"><span id="sk-week" class="sk-week" role="list" aria-label="${T('今週（月〜日）')}"></span><span class="sk-tz" hidden></span></span>` +
      '<span class="sk-hint"></span></div>';
    el.querySelector('.sk-open').addEventListener('click', () => setOpen(!el.classList.contains('open')));
  }
  function setOpen(on) {
    el.classList.toggle('open', on);
    el.querySelector('.sk-open').setAttribute('aria-expanded', String(on));
    const tz = el.querySelector('.sk-tz');
    tz.hidden = !(on && tz.textContent);
  }
  // 幅は CSS で決めうちせず、実際にはみ出すかで決める: 横1行に収まれば .oneline、2行（本文／7マスと今日あそぶと…）なら何も付けず、
  // それでも収まらなければ .narrow（7マスを隠して［今週］で小窓を開く）。
  // 英語の画面で日付の変わる時刻を添えるとき（.sk-tz に文がある）は、幅にかかわらず .narrow（添え書きは小窓の7マスの下に出す）
  function fit() {
    if (!el) return;
    const over = () => el.scrollWidth > el.clientWidth;
    if (el.querySelector('.sk-tz').textContent) { el.classList.remove('oneline'); el.classList.add('narrow'); return; }
    el.classList.remove('narrow');
    el.classList.add('oneline');
    if (!over()) return;
    el.classList.remove('oneline');
    if (over()) el.classList.add('narrow');
  }
  function render() {
    const v = K.view(load(), today());
    if (!el) build();
    if (status.lastElementChild !== el) status.append(el);   // 称号の札（prepend）より後ろ
    el.querySelector('.sk-text').innerHTML = '🔥 ' + boldNum(T('{n}日れんぞく', { n: v.cur })) + (v.best > v.cur ? T('（さいこう{b}日）', { b: `<b>${v.best}</b>` }) : '') +
      T('・') + boldNum(T('お休み券{n}枚', { n: v.tickets }));
    el.querySelector('.sk-hint').textContent = { keep: T('今日あそぶと{n}日に！', { n: v.next }), rest: T('きのうはお休み券でつながるよ'), start: T('今日あそぶと1日目'), today: '' }[v.state];
    el.querySelector('.sk-week').innerHTML = v.week.map((w, i) => {
      const vars = { d: md(w.day), w: T(WD[i]), m: MARK[w.mark] ? T(MARK[w.mark]) : '' };
      const label = vars.m ? T('{d}（{w}） {m}', vars) : T('{d}（{w}）', vars);
      return `<i class="sk-day" role="listitem" data-mark="${w.mark}" data-day="${w.day}" title="${label}" aria-label="${label}"></i>`;
    }).join('');
    const t = I18N.localOf(0, 0);   // 日本語のページ・日本時間と同じずれの時間帯では ''（添えない）
    el.querySelector('.sk-tz').textContent = t ? T('日付は日本時間の0時で変わるよ（あなたの時間で{t}）', { t }) : '';
    setOpen(false);
    fit();
  }
  const safe = fn => (...a) => { try { fn(...a); } catch (e) { console.error('[streak]', e); } };

  // 遊び終わった日を数える（1日に何回でも1日。画面は描き直さず、次の drill:screen {name:'home'} で描く。トーストは出さない）
  const countToday = () => store.set(KEY, K.record(load(), today()));
  const finished = outcome => outcome === 'clear' || outcome === 'fail';   // 'quit'（途中で離れた）は数えない
  document.addEventListener('drill:result', safe(e => { if (finished(e.detail?.outcome)) countToday(); }));
  document.addEventListener('drill:daily', safe(e => { if (e.detail?.phase === 'end' && finished(e.detail.outcome)) countToday(); }));
  document.addEventListener('drill:dojo', safe(e => { if (e.detail?.phase === 'end' && e.detail.outcome === 'clear') countToday(); }));   // 似た国旗の道場（やめたは数えない）
  document.addEventListener('rpg:battle', safe(() => countToday()));

  document.addEventListener('drill:screen', safe(e => { if (e.detail?.name === 'home') render(); }));
  addEventListener('resize', safe(() => { if (document.body.dataset.screen === 'home') fit(); }));
  // 最初の drill:screen（インライン script の show(start)）はこのファイルより前に出るので、今の画面を見て描く
  if (document.body.dataset.screen === 'home') safe(render)();
})();
