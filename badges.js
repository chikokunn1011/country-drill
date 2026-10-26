// バッジと称号（設計書 docs/superpowers/specs/2026-10-26-badges-design.md）。前半は DOM を触らないコア（vm で単体テスト）、後半がブラウザ
(() => {
  'use strict';
  // ---------- コア ----------
  const VERSION = 1;
  const KEY_RE = /^[a-z0-9-]{1,32}@[1-9]$/;            // ステップのキー '<バッジid>@<段>'
  const ID_RE = /^[a-z0-9-]{1,32}$/;                   // バッジ id
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const CF_RE = /^(f2n|n2f|m2f|f2m):[a-z]+:\d{1,3}$/;  // つまずいた挑戦の条件 'モード:地域キー:問題数'
  const MODE_BIT = { f2n: 1, n2f: 2, m2f: 4, f2m: 8 };
  const RPG_MODES = ['f2n', 'n2f', 'm2f'];             // バトルの出題のうち、モードのビットを立てるもの
  // index.html の地域名（S.region の値）→ 地域キー。ダンジョン id も同じキー（ranking.js には頼らない）
  const REGION_KEY = new Map([['アジア', 'asia'], ['ヨーロッパ', 'europe'], ['アフリカ', 'africa'], ['北・中央アメリカ', 'namerica'],
    ['南アメリカ', 'samerica'], ['オセアニア', 'oceania'], ['all', 'world']]);
  const REGION_NAME = new Map([...REGION_KEY].map(([name, rk]) => [rk, name]));
  const REGION_IDS = ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world'];   // 地域のバッジの並び（設計書 §2.4）
  const DUNGEONS = ['asia', 'europe', 'africa', 'namerica', 'samerica', 'oceania', 'world'];
  // セーブを整えるときの範囲（設計書 §7.1）
  const S_MAX = { right: 1e7, streak: 999, perf: 195, flaw: 195, ta: 195, taAvg: 6e5, clears: 1e7, days: 1e5 };
  const S_FLAGS = ['grit', 'back', 'dopa', 'fever'];
  const RPG_MAX = { lv: 50, owned: 195, bounty: 1e5 };
  const RPG_FLAGS = ['start', 'win', 'nodmg', 'under', 'phoenix', 'friend', 'master'];
  const T_MAX = 1e13;      // 時刻(ms)の上限
  const MAX_KEYS = 500;    // got と sent に残す最大件数
  const CF_MAX = 30;       // つまずいた条件を覚える最大件数
  const MIGRATE = {};      // MIGRATE[v](obj) が v の形を v + 1 の形にする（いまは無い）

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const asObj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const asArr = v => Array.isArray(v) ? v : [];
  const isKey = k => typeof k === 'string' && KEY_RE.test(k);
  const isDay = v => typeof v === 'string' && DAY_RE.test(v);
  // 整数にして lo..hi におさめる。数にならないものは lo
  const clampInt = (v, lo, hi) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
  const pad2 = n => String(n).padStart(2, '0');

  // 国の一覧（countries.js の COUNTRIES）から、国コード・地域ごとの国・小さい国の表を作る
  function makeX(list) {
    const codes = new Set(list.map(c => c.a));
    const pools = Object.fromEntries(REGION_IDS.map(rk => [rk, []]));
    for (const c of list) {
      const rk = REGION_KEY.get(c.r);
      if (rk && rk !== 'world') pools[rk].push(c.a);
      pools.world.push(c.a);
    }
    return {
      codes,
      rkOf: region => REGION_KEY.get(region) ?? null,            // 'all' か日本語の地域名 → 地域キー。知らない名前は null
      regionOf: rk => REGION_NAME.get(rk),                        // 地域キー → S.region の値（'all' か日本語名）
      label: rk => rk === 'world' ? '全世界' : REGION_NAME.get(rk),
      REGION_IDS, DUNGEONS, pools,
      poolSize: rk => REGION_IDS.includes(rk) ? pools[rk].length : 0,
      micro: list.filter(c => c.ar < 1000).map(c => c.a),        // 面積 1,000km² 未満の国
    };
  }

  // セーブの形（設計書 §7）
  function fresh() {
    return {
      v: VERSION, got: {}, eq: null, sn: {}, sent: [], tip: 0,
      s: {
        right: 0, streak: 0, m: {}, ov: {}, wk: {}, bk: {}, rc: {}, perf: 0, flaw: 0, cf: [], grit: 0, ta: 0, taAvg: 0, clears: 0,
        days: 0, last: '', back: 0, dopa: 0, fever: 0,
        rpg: { start: 0, win: 0, nodmg: 0, under: 0, phoenix: 0, friend: 0, master: 0, lv: 0, owned: 0, bounty: 0, boss: [] },
      },
    };
  }

  // 読んだセーブを fresh() の形に整える。知らない国・地域・ダンジョンは捨て、知らないバッジのステップは形が合えば残す
  function sanitize(raw, X) {
    const o = asObj(raw), src = asObj(o.s), srpg = asObj(src.rpg), d = fresh(), s = d.s, g = s.rpg;
    for (const [k, hi] of Object.entries(S_MAX)) s[k] = clampInt(src[k], 0, hi);
    for (const k of S_FLAGS) s[k] = clampInt(src[k], 0, 1);
    // 国コード → 値 の表。知らない国と、0 になったものは捨てる
    const codeMap = (v, val) => Object.fromEntries(Object.entries(asObj(v)).filter(([a]) => X.codes.has(a)).map(([a, n]) => [a, val(n)]).filter(([, n]) => n));
    s.m = codeMap(src.m, n => clampInt(n, 0, 15));
    for (const k of ['ov', 'wk', 'bk']) s[k] = codeMap(src[k], n => n ? 1 : 0);
    s.rc = Object.fromEntries(Object.entries(asObj(src.rc)).filter(([rk]) => X.REGION_IDS.includes(rk)).map(([rk, n]) => [rk, clampInt(n, 0, 3)]).filter(([, n]) => n));
    s.cf = asArr(src.cf).filter(k => typeof k === 'string' && CF_RE.test(k)).slice(-CF_MAX);
    s.last = isDay(src.last) ? src.last : '';
    for (const [k, hi] of Object.entries(RPG_MAX)) g[k] = clampInt(srpg[k], 0, hi);
    for (const k of RPG_FLAGS) g[k] = clampInt(srpg[k], 0, 1);
    g.boss = [...new Set(asArr(srpg.boss).filter(id => X.DUNGEONS.includes(id)))];
    d.tip = clampInt(o.tip, 0, 3);
    d.eq = o.eq === '' || isKey(o.eq) ? o.eq : null;
    d.sn = Object.fromEntries(Object.entries(asObj(o.sn)).filter(([id]) => ID_RE.test(id)).map(([id, t]) => [id, clampInt(t, 0, T_MAX)]));
    // got は時刻の大きい500件（同じ時刻なら元の並びで後ろのもの）を、元の並びのまま残す
    const ent = Object.entries(asObj(o.got)).filter(([k]) => KEY_RE.test(k)).map(([k, t], i) => [k, clampInt(t, 0, T_MAX), i]);
    const keep = new Set([...ent].sort((p, q) => q[1] - p[1] || q[2] - p[2]).slice(0, MAX_KEYS).map(e => e[0]));
    d.got = Object.fromEntries(ent.filter(e => keep.has(e[0])).map(([k, t]) => [k, t]));
    d.sent = asArr(o.sent).filter(isKey).slice(-MAX_KEYS);
    return d;
  }

  // JSON.parse したセーブ → { d, ro }。新しい版のセーブ（v > VERSION）は読むだけ（ro）
  function migrate(raw, X) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { d: fresh(), ro: false };
    if (raw.v > VERSION) return { d: sanitize(raw, X), ro: true };
    let o = raw;
    for (let v = Math.max(0, raw.v | 0); v < VERSION; v++) if (MIGRATE[v]) o = MIGRATE[v](o);
    return { d: sanitize(o, X), ro: false };
  }

  // 端末のローカル時刻の日付 'YYYY-MM-DD'
  function today(date = new Date()) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
  // 'YYYY-MM-DD' → 通算の日数（UTC で数えるので夏時間でずれない）
  function dayNum(day) { const [y, mo, dd] = day.split('-').map(Number); return Date.UTC(y, mo - 1, dd) / 864e5; }

  function addDay(s, day) {                         // day は 'YYYY-MM-DD'（イベントの時点の日付を op に入れておく）
    if (!isDay(day)) return;
    if (!s.last) { s.days = 1; s.last = day; return; }
    const diff = dayNum(day) - dayNum(s.last);
    if (diff <= 0) return;                          // 同じ日、または日付が戻った
    if (diff >= 14) s.back = 1;
    s.days++; s.last = day;
  }

  function applyResult(s, r, dopa, day, X) {        // r = pickResult(drill:result の detail)
    const rk = X.rkOf(r.region);
    if (!r.hint) { s.streak = Math.max(s.streak, r.best | 0); if (dopa && r.best >= 20) s.fever = 1; }   // quit・fail もふくむ
    if (r.outcome === 'clear' || r.outcome === 'fail') addDay(s, day);
    if (r.kind === 'challenge' && !r.hint && r.n >= 10 && rk) {          // 七転び八起き
      const ck = `${r.mode}:${rk}:${r.n}`;
      if (r.outcome === 'clear' && r.attempts === 1 && s.cf.includes(ck)) s.grit = 1;   // 先に判定してから
      if (r.wrongs > 0) s.cf = [...s.cf.filter(k => k !== ck), ck].slice(-CF_MAX);     // つまずいた条件を覚える
    }
    if (r.outcome !== 'clear') return;               // ここから下はクリアだけ
    s.clears++;
    if (dopa) s.dopa = 1;
    if (rk) { if (r.n >= 10) s.rc[rk] |= 1; if (!r.hint && r.n === X.poolSize(rk)) s.rc[rk] |= 2; }
    if (r.hint) return;
    if (r.kind === 'practice' && r.wrongs === 0) s.perf = Math.max(s.perf, r.n);
    if (r.kind === 'challenge' && r.attempts === 1) s.flaw = Math.max(s.flaw, r.n);
    if (r.kind === 'ta') {
      s.ta = Math.max(s.ta, r.n);
      if (r.n >= 10 && r.timeMs > 0) { const avg = Math.round(r.timeMs / r.n); s.taAvg = s.taAvg ? Math.min(s.taAvg, avg) : avg; }
    }
  }

  // 冒険の op。p は pickRpg の戻り値
  function applyRpg(s, t, p, day, X) {
    const g = s.rpg;
    switch (t) {
      case 'coins': g.start = 1; break;
      case 'levelup': g.lv = Math.max(g.lv, p.lv | 0); break;
      case 'join': if (p.via === 'learn') g.friend = 1; g.owned = Math.max(g.owned, p.owned | 0); break;
      case 'promote': if (p.learn) g.master = 1; break;
      case 'answer':
        if (!X.codes.has(p.a)) break;
        if (!p.right) { s.wk[p.a] = 1; break; }      // 外すのは rpg:overcome か、クイズの一発正解
        s.right++;
        if (RPG_MODES.includes(p.mode)) s.m[p.a] |= MODE_BIT[p.mode];   // バトルはヒントなし。cap などは正解数だけ
        break;
      case 'battle':
        addDay(s, day);
        s.streak = Math.max(s.streak, p.maxCombo | 0);
        if (!p.win) break;
        g.win = 1;
        if (p.boss && p.mistakes === 0) g.nodmg = 1;
        if (p.boss && p.lv <= p.recLv - 5) g.under = 1;
        if (p.revived) g.phoenix = 1;
        break;
      case 'clear': if (X.DUNGEONS.includes(p.dungeon) && !g.boss.includes(p.dungeon)) g.boss.push(p.dungeon); break;
      case 'overcome': if (X.codes.has(p.a)) { s.ov[p.a] = 1; delete s.wk[p.a]; } break;   // クイズでの克服と重なっても1か国1回
      case 'bounty': g.bounty = Math.max(g.bounty, p.totalDays | 0); break;
    }
  }

  // op を1つ d に当てる（d をその場で書きかえる）。知らない op・国コード・地域は何もしない（設計書 §3.3）
  function apply(d, op, X) {
    if (!Array.isArray(op)) return d;
    const s = d.s;
    switch (op[0]) {
      case 'ans': {                                  // クイズの回答
        const [, a, right, first, hint, mode, mb, ma] = op;
        if (!X.codes.has(a)) break;
        if (!right) { s.wk[a] = 1; break; }
        s.right++;
        if (hint) break;
        if (own(MODE_BIT, mode)) s.m[a] |= MODE_BIT[mode];
        if (first) {
          if ((mb > 0 || s.wk[a]) && ma === 0) s.ov[a] = 1;   // 苦手だった国を、次のゲームで一発正解
          delete s.wk[a];
        }
        break;
      }
      case 'res': if (op[1] && typeof op[1] === 'object') applyResult(s, op[1], !!op[2], op[3], X); break;
      case 'book': if (X.codes.has(op[1])) s.bk[op[1]] = 1; break;
      case 'wk-reset': s.wk = {}; break;
      case 'rpg': if (op[2] && typeof op[2] === 'object') applyRpg(s, op[1], op[2], op[3], X); break;
      case 'got': if (isKey(op[1]) && !own(d.got, op[1])) d.got[op[1]] = clampInt(op[2], 0, T_MAX); break;
      case 'sent': if (isKey(op[1]) && !d.sent.includes(op[1])) d.sent.push(op[1]); break;
      case 'eq': if (op[1] === '' || isKey(op[1])) d.eq = op[1]; break;
      case 'seen': {                                 // 詳細を開いた時刻（NEW の印を消す）
        const id = op[1];
        if (typeof id === 'string' && ID_RE.test(id)) d.sn[id] = Math.max(own(d.sn, id) ? d.sn[id] : 0, clampInt(op[2], 0, T_MAX));
        break;
      }
      case 'tip': d.tip = Math.min(3, d.tip + 1); break;
      case 'set': {                                  // デバッグ用。fresh().s にあるフィールドに、同じ種類の値のときだけ
        const [, k, val] = op, def = fresh().s;
        if (own(def, k) && typeof val === typeof def[k] && val !== null && Array.isArray(val) === Array.isArray(def[k])) s[k] = val;
        break;
      }
    }
    return d;
  }

  // drill:result の detail から、op に入れるキーだけを取り出す
  function pickResult(detail) {
    const o = asObj(detail);
    return {
      outcome: o.outcome, kind: o.kind, region: o.region, mode: o.mode,
      n: o.n | 0, wrongs: o.wrongs | 0, attempts: o.attempts | 0, best: o.best | 0,
      timeMs: Number.isFinite(o.timeMs) ? o.timeMs : null, hint: !!o.hint,
    };
  }

  // rpg:* の detail から、op に入れるキーだけを取り出す。screen はいまの画面の名前（promote の古い rpg.js 向けの判定に使う）
  function pickRpg(t, detail, screen) {
    const o = asObj(detail);
    switch (t) {
      case 'levelup': return { lv: o.lv | 0 };
      case 'join': return { via: o.via, owned: o.owned | 0 };
      case 'promote': return { learn: !!(o.via ? o.via === 'learn' : o.star === 2 && screen !== 'gacha') };
      case 'answer': return { a: o.a, right: !!o.right, mode: o.mode };
      case 'battle': return { boss: !!o.boss, win: !!o.win, mistakes: o.mistakes | 0, revived: !!o.revived, maxCombo: o.maxCombo | 0, lv: o.lv | 0, recLv: o.recLv | 0 };
      case 'clear': return { dungeon: o.dungeon };
      case 'overcome': return { a: o.a };
      case 'bounty': return { totalDays: o.totalDays | 0 };
      default: return {};                            // coins は呼ぶ側が reason === 'start' のときだけ積む
    }
  }

  // 同じゲームの結果を2回数えないための門。初めての sid なら true を返して覚える（直近 limit 件だけ）
  function sidGate(limit = 20) {
    const done = [];
    return sid => {
      if (done.includes(sid)) return false;
      done.push(sid);
      if (done.length > limit) done.shift();
      return true;
    };
  }

  const CORE = { VERSION, KEY_RE, MODE_BIT, makeX, fresh, sanitize, migrate, today, dayNum, addDay, applyResult, apply, pickResult, pickRpg, sidGate };
  globalThis.BADGES_CORE = CORE;
  if (typeof document === 'undefined') return;   // node の vm ではここで終わる
  // ---------- ブラウザ（Task 4 から） ----------
})();
