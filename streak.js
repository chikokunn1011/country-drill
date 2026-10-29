// れんぞく日数（A5）: クイズ・今日の難問・冒険のバトルを終えた日を数え、ホームの #home-status に1行で出す。出題には一切かかわらない。
// 前半は DOM にさわらない計算（globalThis.STREAK_CORE。テストでは vm で読み込む）、後半はホームの行と数えるリスナー。
// index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

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
      // 古い順に、その日の週の券がまだ残っていれば使う。1日でも使えなければ切れる（それまでに使った券は残す）
      for (let i = 1; ok && i <= gap; i++) {
        const d = D.addDays(st.last, i), w = weekOf(d);
        if (out.rest.some(r => weekOf(r) === w)) ok = false;
        else out.rest.push(d);
      }
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
