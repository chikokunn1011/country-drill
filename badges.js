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
  const RPG_MAX = { lv: 99, owned: 195, bounty: 1e5 };
  const RPG_FLAGS = ['start', 'win', 'nodmg', 'under', 'friend', 'master'];
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
        rpg: { start: 0, win: 0, nodmg: 0, under: 0, friend: 0, master: 0, lv: 0, owned: 0, bounty: 0, boss: [] },
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
      case 'set': {                                  // デバッグ用。fresh().s にある数か文字のフィールドに、同じ種類の値のときだけ
        const [, k, val] = op, def = fresh().s;      // オブジェクトは入れない（op のものがそのまま入り、壊れた形だとあとの op が落ちる）
        if (own(def, k) && ['number', 'string'].includes(typeof def[k]) && typeof val === typeof def[k]) s[k] = val;
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
      // 英雄の塔（dungeon: 'tower'）の中ボスはボスとして数えない（ボス・無傷・格上の判定に使わない）
      case 'battle': return { boss: !!o.boss && o.dungeon !== 'tower', win: !!o.win, mistakes: o.mistakes | 0, maxCombo: o.maxCombo | 0, lv: o.lv | 0, recLv: o.recLv | 0 };
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

  // ---------- カタログ（設計書 §2、§3.1） ----------
  const CAT_LABEL = { quiz: 'クイズ', kind: 'あそび方', mode: 'モード', region: '地域', daily: '図鑑・毎日', dopa: 'ドパガキ', rpg: '冒険' };
  const TIER_LABEL = ['', '銅', '銀', '金', '虹'];
  const n0 = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;      // snapshot の数（数でなければ 0）
  const pop4 = m => (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1);  // 立っているモードのビットの数
  const nKeys = o => Object.keys(o).length;

  // snapshot の克服の数。overcome が数ならその値、オブジェクトならキーの数。st.overcome も同じに読み、大きいほう
  function snapOvercome(snap) {
    const one = v => v && typeof v === 'object' ? nKeys(v) : Math.max(0, n0(v));
    return Math.max(one(snap?.overcome), one(snap?.st?.overcome));
  }
  // 冒険をはじめたか。intro が無い古い rpg.js では Lv かバトルの記録で決める
  const snapStarted = snap => !!snap && (snap.intro !== undefined ? !!snap.intro
    : n0(snap.lv) > 1 || n0(snap.st?.win) + n0(snap.st?.lose) + n0(snap.st?.flee) > 0);
  // 倒したボスのダンジョン（s.rpg.boss と snapshot の floors[id] >= 5 の和）
  const bossesOf = (s, x) => new Set([...s.rpg.boss, ...DUNGEONS.filter(id => n0(x.snap?.floors?.[id]) >= 5)]);

  // 国の一覧（countries.js の COUNTRIES）からカタログを作る。並びは設計書 §2.1→§2.7 の表の順
  function makeCatalog(list) {
    const xt = makeX(list);
    const T = (goal, title, desc, more) => ({ goal, title, desc, ...more });
    // 3段のバッジ。titles は設計書の表の「銅 / 銀 / 金」をそのまま
    const T3 = (goals, titles, desc) => { const ts = titles.split(' / '); return goals.map((g, i) => T(g, ts[i], desc(g))); };
    const num = n => n.toLocaleString('ja-JP');
    const modeBadge = (mode, icon, name, sub, titles) => ({
      id: 'mode-' + mode, cat: 'mode', icon, name, sub, mode, unit: 'か国', skill: true,
      v: (s, x) => x.pools.world.filter(a => s.m[a] & MODE_BIT[mode]).length,
      tiers: T3([30, 100, 195], titles, g => `「${sub}」で ${g}か国にヒントなしで正解`),
    });
    const regionBadge = (rk, icon, name, titles) => {
      const ts = titles.split(' / '), label = xt.label(rk);
      return { id: 'reg-' + rk, cat: 'region', icon, name, rk, skill: true, tiers: [   // 地域は段ごとに v がちがう
        T(1, ts[0], `${label}で10問以上のゲームをクリア`, { v: s => s.rc[rk] & 1 ? 1 : 0 }),
        T(1, ts[1], `${label}の「全部」をヒントなしでクリア`, { v: s => s.rc[rk] & 2 ? 1 : 0 }),
        T(xt.pools[rk].length * 4, ts[2], `${label}の国すべてを4モードで正解`,
          { v: (s, x) => x.pools[rk].reduce((t, a) => t + pop4(s.m[a]), 0), color: rk === 'world' ? 4 : 3 }),
      ] };
    };
    const one = (title, desc, color = 1) => [T(1, title, desc, { color })];   // 1段だけのバッジ
    const badges = [
      // 2.1 クイズ
      { id: 'first-clear', cat: 'quiz', icon: '🌱', name: 'はじめの一歩', v: s => s.clears,
        tiers: one('ドリルの新人', 'ゲームを1回クリアする（ヒントありでもOK）') },
      { id: 'answers', cat: 'quiz', icon: '📚', name: 'こつこつ正解', unit: '問', v: s => s.right,
        tiers: T3([100, 1000, 5000], 'こつこつ派 / 努力の人 / ドリルの鬼', g => `正解の合計が ${num(g)}問`) },
      { id: 'streak', cat: 'quiz', icon: '🔗', name: 'れんぞく正解', unit: '問', skill: true, v: s => s.streak,
        tiers: T3([10, 30, 100], '波に乗る人 / 止まらない人 / 百連の達人', g => `1回のゲームかバトルで ${g}問続けて正解（ヒントなし）`) },
      { id: 'overcome', cat: 'quiz', icon: '💪', name: '苦手克服', unit: 'か国', skill: true,
        v: (s, x) => Math.max(nKeys(s.ov), snapOvercome(x.snap)),
        tiers: T3([1, 10, 50], 'リベンジャー / 苦手つぶし / にがて知らず', g => `苦手な国を ${g}か国克服（別のゲームでヒントなしの一発正解）`) },
      { id: 'micro', cat: 'quiz', icon: '🔬', name: 'ちっちゃい国探検隊', unit: 'か国', skill: true,
        v: (s, x) => x.micro.filter(a => s.m[a] > 0).length,
        tiers: [T(xt.micro.length, 'ミクロの探検家', `面積 1,000km² 未満の国（${xt.micro.length}か国）すべてに、どれかのモードでヒントなしで正解`, { color: 2 })] },
      // 2.2 あそび方
      { id: 'prac-perfect', cat: 'kind', icon: '✨', name: 'ノーミス練習', unit: '問', skill: true, v: s => s.perf,
        tiers: T3([10, 20, 40], 'ていねい派 / ノーミス職人 / 完璧主義者', g => `${g}問以上の練習を、まちがえ0でクリア（ヒントなし）`) },
      { id: 'chal-flawless', cat: 'kind', icon: '🎯', name: '一発クリア', unit: '問', skill: true, v: s => s.flaw,
        tiers: T3([10, 20, 40], '集中モード / 鉄の集中力 / ミスを知らない人', g => `${g}問以上の挑戦を、1回目でクリア（ヒントなし）`) },
      { id: 'chal-grit', cat: 'kind', icon: '🧗', name: '七転び八起き', skill: true, secret: true, hint: '挑戦でつまずいた条件に、もう一度いどむと…', v: s => s.grit,
        tiers: one('不屈の人', '挑戦（ヒントなし・10問以上）でまちがえたことのある条件（モード・地域・問題数が同じ）を、あとの別のゲームで1回目にクリア', 2) },
      { id: 'ta-clear', cat: 'kind', icon: '⏱️', name: 'タイムアタッカー', unit: '問', v: s => s.ta,
        tiers: T3([5, 20, 40], 'スピード見習い / タイムアタッカー / 秒速の旅人', g => `${g}問以上のタイムアタックをクリア`) },
      { id: 'ta-speed', cat: 'kind', icon: '⚡', name: 'スピードスター', lower: true, v: s => s.taAvg,   // 小さいほどよい（これだけ）
        tiers: T3([3000, 2000, 1400], 'せっかち名人 / スピードスター / 光速の目', g => `タイムアタック10問以上を1問 ${(g / 1000).toFixed(1)}秒以内でクリア`) },
      // 2.3 モード
      modeBadge('f2n', '🚩', '旗ソムリエ', '国旗→国名', '旗見習い / 旗ソムリエ / 国旗の達人'),
      modeBadge('n2f', '🔍', '旗さがし名人', '国名→国旗', '旗さがし屋 / 旗えらび名人 / 旗の目きき'),
      modeBadge('m2f', '🗺️', '地図よみ', '場所→国旗', '地図好き / 地図よみ名人 / 歩く地図帳'),
      modeBadge('f2m', '📍', 'ピンポイント', '国旗→場所', '方向音痴卒業 / ピンポイント職人 / 人間GPS'),
      // 2.4 地域
      regionBadge('samerica', '🦙', '南米アドベンチャー', '南米の旅人 / 南米通 / 南米博士'),
      regionBadge('oceania', '🐚', '南の島めぐり', '南の島の旅人 / オセアニア通 / オセアニア博士'),
      regionBadge('namerica', '🌵', '北中米ロードトリップ', '北中米の旅人 / 北中米通 / 北中米博士'),
      regionBadge('europe', '🏰', 'ヨーロッパ周遊', 'ヨーロッパの旅人 / ヨーロッパ通 / ヨーロッパ博士'),
      regionBadge('asia', '🐼', 'アジア大陸横断', 'アジアの旅人 / アジア通 / アジア博士'),
      regionBadge('africa', '🦁', 'アフリカ大冒険', 'アフリカの旅人 / アフリカ通 / アフリカ博士'),
      regionBadge('world', '🌏', '世界一周', '世界の旅人 / 世界通 / 世界博士'),
      // 2.5 図鑑・毎日
      { id: 'book', cat: 'daily', icon: '📖', name: '図鑑めくり', unit: 'か国', v: s => nKeys(s.bk),
        tiers: T3([10, 50, 195], '図鑑好き / 図鑑マニア / 歩く図鑑', g => `図鑑で ${g}か国を開く`) },
      { id: 'days', cat: 'daily', icon: '📅', name: '通いなれた道', unit: '日', v: s => s.days,
        tiers: T3([3, 10, 30], '常連さん / おなじみさん / ドリルが日課', g => `ゲームかバトルを終えた日が通算 ${g}日（連続でなくていい）`) },
      { id: 'comeback', cat: 'daily', icon: '👋', name: 'おかえり！', secret: true, hint: 'しばらく旅に出て、また戻ってくると…', v: s => s.back,
        tiers: one('帰ってきた旅人', '前に遊んだ日から14日以上あけて、また遊ぶ') },
      // 2.6 ドパガキ
      { id: 'dopa-on', cat: 'dopa', icon: '🎉', name: 'ドパミン解放', v: s => s.dopa,
        tiers: one('お祭り好き', '「ドパガキ向け」ONでゲームをクリア') },
      { id: 'dopa-fever', cat: 'dopa', icon: '🌈', name: 'フィーバータイム', skill: true, secret: true, hint: 'ドパガキ向けで、王冠が見えるまで…', v: s => s.fever,
        tiers: one('フィーバー王', 'ドパガキ ON のヒントなしのゲームで、20問続けて正解（👑 COMBO が出る数）', 2) },
      // 2.7 冒険（s.rpg と snapshot の大きいほう）
      { id: 'rpg-start', cat: 'rpg', icon: '🎒', name: '旅立ち', rpg: true, v: (s, x) => s.rpg.start || snapStarted(x.snap) ? 1 : 0,
        tiers: one('見習い旅人', '冒険をはじめる') },
      { id: 'rpg-first-win', cat: 'rpg', icon: '⚔️', name: '初勝利', rpg: true, v: (s, x) => s.rpg.win || n0(x.snap?.st?.win) > 0 ? 1 : 0,
        tiers: one('かけだし勇者', 'バトルにはじめて勝つ') },
      { id: 'rpg-lv', cat: 'rpg', icon: '🧙', name: '旅人のレベル', rpg: true, v: (s, x) => Math.max(s.rpg.lv, n0(x.snap?.lv)),
        tiers: T3([10, 30, 50], '一人前の旅人 / ベテラン旅人 / 伝説の旅人', g => `旅人のレベルが Lv ${g}`) },
      { id: 'rpg-boss', cat: 'rpg', icon: '👑', name: '旗を取りもどせ', unit: '地域', rpg: true,
        v: (s, x) => [...bossesOf(s, x)].filter(id => id !== 'world').length,
        tiers: T3([1, 3, 6], '旗の守り手 / 三地域の勇者 / 六地域の勇者', g => `地域ボスを倒した数が ${g}地域`) },
      { id: 'rpg-final', cat: 'rpg', icon: '👾', name: '世界を取りもどした', rpg: true, v: (s, x) => bossesOf(s, x).has('world') ? 1 : 0,
        tiers: one('世界を取りもどした者', '地図喰いを倒す', 4) },
      { id: 'rpg-nodmg', cat: 'rpg', icon: '🛡️', name: '無傷の勝利', rpg: true, v: s => s.rpg.nodmg,
        tiers: one('無傷の旅人', 'ボスをミス0で倒す', 2) },
      { id: 'rpg-underdog', cat: 'rpg', icon: '📜', name: '知識こそ力', rpg: true, v: s => s.rpg.under,
        tiers: one('知識の勇者', '推奨 Lv より5以上低い Lv でボスに勝つ', 3) },
      { id: 'rpg-friend', cat: 'rpg', icon: '🤝', name: '覚えて仲間に', rpg: true, v: s => s.rpg.friend,
        tiers: one('国の友だち', 'なかよし度で、はじめて仲間ができる') },
      { id: 'rpg-master', cat: 'rpg', icon: '🏅', name: 'マスター昇格', rpg: true, v: s => s.rpg.master,
        tiers: one('4モードの達人', '覚えてシルバーに上がる', 2) },
      { id: 'rpg-cards', cat: 'rpg', icon: '🗂️', name: '仲間あつめ', unit: 'か国', rpg: true, v: (s, x) => Math.max(s.rpg.owned, n0(x.snap?.owned)),
        tiers: T3([50, 100, 195], '50か国の友 / 100か国の友 / 世界の友', g => `仲間の数が ${g}か国`) },
      { id: 'rpg-bounty', cat: 'rpg', icon: '🔎', name: '手配書ハンター', unit: '日', rpg: true, v: (s, x) => Math.max(s.rpg.bounty, n0(x.snap?.bountyDays)),
        tiers: T3([1, 10, 30], '新米探偵 / 敏腕探偵 / 名探偵', g => `手配書を全部達成した日が通算 ${g}日`) },
    ];
    // 段の色はふつう段の順（1 銅・2 銀・3 金）。1段だけのバッジと reg-world の金は color で決めてある
    return badges.map(b => ({ ...b, tiers: b.tiers.map((t, i) => ({ ...t, color: t.color || i + 1 })) }));
  }

  // 判定に使う x。snapshot は例外・オブジェクトでないものを null にする
  function makeCtx(X, rpg) {
    let snap = null;
    try { snap = rpg?.snapshot?.() ?? null; } catch { snap = null; }
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) snap = null;
    return { pools: X.pools, micro: X.micro, snap, rpg: !!rpg };
  }

  // ---------- 判定（設計書 §3.2） ----------
  const stepKey = (b, i) => `${b.id}@${i + 1}`;
  const valOf = (b, t, s, x) => (t.v || b.v)(s, x);
  const reached = (b, t, v) => b.lower ? v > 0 && v <= t.goal : v >= t.goal;   // lower はバッジから読む
  const visible = (cat, x) => cat.filter(b => !b.rpg || x.rpg);
  // d.got にまだないステップのうち、条件に届いたもの（カタログの順・段の順。下の段が無くても上の段は取れる）
  function evaluate(cat, d, x) {
    const out = [];
    for (const b of visible(cat, x)) b.tiers.forEach((t, i) => {
      const key = stepKey(b, i);
      if (!own(d.got, key) && reached(b, t, valOf(b, t, d.s, x))) out.push(key);
    });
    return out;
  }

  // ステップのキー → { b, t, tier(1始まり), color }。カタログに無ければ null
  function stepInfo(cat, key) {
    if (!isKey(key)) return null;
    const at = key.lastIndexOf('@'), id = key.slice(0, at), tier = Number(key.slice(at + 1));
    const b = cat.find(e => e.id === id), t = b?.tiers[tier - 1];
    return t ? { b, t, tier, color: t.color } : null;
  }
  const tierLabel = color => TIER_LABEL[color] ?? '';
  // color がいちばん大きいキー。同じなら後ろのもの。keys が空なら null
  function bestKey(cat, keys) {
    let best = null, top = -1;
    for (const k of keys) { const c = stepInfo(cat, k)?.color ?? 0; if (c >= top) { best = k; top = c; } }
    return best;
  }

  // 段の goal への進み具合 0〜1。lower（小さいほどよい）は goal / v で、記録が無ければ 0
  const ratioOf = (b, v, goal) => b.lower ? (v > 0 ? Math.min(1, goal / v) : 0) : Math.min(1, v / goal);
  // 次の段への進み具合。next はまだ取っていない最初の段の添字（全部取ったら -1 で、値は最後の段）
  function progressOf(b, d, x) {
    const next = b.tiers.findIndex((_, i) => !own(d.got, stepKey(b, i)));
    const t = b.tiers[next < 0 ? b.tiers.length - 1 : next], v = valOf(b, t, d.s, x), goal = t.goal;
    return { next, v, goal, ratio: next < 0 ? 1 : ratioOf(b, v, goal) };
  }
  // 見えているバッジの数。1段でも取ったバッジを数え、色はそのバッジで取った一番上の段の色
  function summarize(cat, d, x) {
    const list = visible(cat, x), byColor = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let got = 0;
    for (const b of list) {
      let top = b.tiers.length - 1;
      while (top >= 0 && !own(d.got, stepKey(b, top))) top--;
      if (top >= 0) { got++; byColor[b.tiers[top].color]++; }
    }
    return { got, total: list.length, byColor };
  }
  // 表示用の一覧（window.BADGES.list()）。got は取った時刻か 0
  function listView(cat, d, x) {
    return visible(cat, x).map(b => ({
      id: b.id, name: b.name, icon: b.icon, cat: b.cat,
      tiers: b.tiers.map((t, i) => {
        const key = stepKey(b, i);
        return { key, got: own(d.got, key) ? d.got[key] : 0, title: t.title, goal: t.goal, val: valOf(b, t, d.s, x) };
      }),
    }));
  }

  // ---------- セーブ（設計書 §7.1）。base（最後に読めた・書けたもの）に ops（まだ書けていない op）を重ねたものが st ----------
  const clone = d => JSON.parse(JSON.stringify(d));
  // storage は getItem / setItem / removeItem を持つもの（どれも例外を投げてよい）。ctx() は判定に使う x を返す
  function createStore({ storage, X, cat, ctx, now = () => Date.now(), warn = () => {} }) {
    let base = fresh(), ops = [], st = clone(base);   // st と base はいつも別のオブジェクト（push が base を変えないように）
    let ro = false, inCommit = false, auto = null, warned = false;
    function readBase() {                             // { d, ro }。storage が使えなければ null
      let raw;
      try { raw = storage.getItem('badges'); } catch { return null; }
      if (raw == null) return { d: fresh(), ro: false };
      let obj;
      try { obj = JSON.parse(raw); } catch {
        try { storage.setItem('badges-broken', raw); } catch { /* 退避できなくても新しく始める */ }   // 1件だけ、上書き
        return { d: fresh(), ro: false };
      }
      return migrate(obj, X);                         // v > VERSION なら ro: true
    }
    function take(r) {
      base = r.d; ro = r.ro;
      if (ro && !warned) { warned = true; warn('[badges] 新しい版のセーブなので読むだけにする'); }
    }
    const layered = () => { const d = clone(base); for (const op of ops) apply(d, op, X); return d; };
    const write = d => { try { storage.setItem('badges', JSON.stringify(d)); return true; } catch { return false; } };
    return {
      get st() { return st; },
      get ro() { return ro; },
      get lastAuto() { return auto; },                // 直前の commit で自動でつけたキー。次の commit の前に読む
      push(op) { apply(st, op, X); ops.push(op); },    // 表示に当ててから積む（保存・判定はしない）。当てて落ちる op は積まない（次の commit でも落ちるので）
      // 読む → ops を重ねる → 判定 → 書く。取れたステップ（カタログの順）を返す。drill:answer からは呼ばない
      commit({ judge = true } = {}) {
        if (inCommit) return [];                      // 判定の中（ctx() など）から呼ばれたら何もしない
        inCommit = true; auto = null;
        try {
          const r = readBase();
          if (r) take(r);
          const d = layered();
          if (ro) { st = d; return []; }              // 新しい版のセーブ: 書かない・取らない・払わない
          let gotNow = [];
          if (judge) {
            gotNow = evaluate(cat, d, ctx());
            const t = now();
            for (const k of gotNow) { const op = ['got', k, t]; apply(d, op, X); ops.push(op); }   // 取ったことも op にする（書けなくても2回知らせない）
            if (gotNow.length && d.eq === null) { auto = bestKey(cat, gotNow); const op = ['eq', auto]; apply(d, op, X); ops.push(op); }
          }
          if (write(d) || !r) { base = clone(d); ops = []; }   // 書けた、または storage が使えない（メモリだけで続ける）
          st = d;                                     // 書けなかったとき（容量など）は ops を残し、次の commit でもう一度
          return gotNow;
        } finally { inCommit = false; }
      },
      reload() { const r = readBase(); if (r) take(r); st = layered(); },   // ほかのタブが書いたとき。判定も保存もしない
      pending: () => ops.length,
      reset() {                                       // デバッグ用。記録をすべて消す
        try { storage.removeItem('badges'); } catch { /* 消せなくてもメモリは新しくする */ }
        base = fresh(); ops = []; st = clone(base); ro = false;
      },
    };
  }

  // ---------- 冒険への支払い（設計書 §8.3） ----------
  // 見えているステップのうち、got にあって sent に無いキー（カタログの順）
  function pendingPay(bs, cat, x) {
    const { got, sent } = bs.st;
    return visible(cat, x).flatMap(b => b.tiers.map((_, i) => stepKey(b, i))).filter(k => own(got, k) && !sent.includes(k));
  }
  // badge:earned を出して払う。dispatch(detail) は rpg.js が書いた paid を返す。false（払えなかった）は sent に入れず次の起動で送り直す。
  // 数（0 = もう払ってある）と undefined（古い rpg.js）は払ったとみなす。戻り値は払ったキー → 数か undefined
  function payout(bs, cat, keys, { rpg, retro = false, dispatch }) {
    const out = {};
    if (!rpg || bs.ro) return out;
    let n = 0;
    for (const key of keys) {
      const si = stepInfo(cat, key);
      if (!si || bs.st.sent.includes(key)) continue;   // dispatch の中の commit で st が変わるので、毎回 bs.st を読む
      const paid = dispatch({ id: key, badge: si.b.id, tier: si.tier, title: si.t.title, color: si.color, retro });
      if (paid === false) continue;
      bs.push(['sent', key]); n++;
      out[key] = typeof paid === 'number' ? paid : undefined;
    }
    if (n) bs.commit({ judge: false });
    return out;
  }

  const CORE = { VERSION, KEY_RE, MODE_BIT, makeX, fresh, sanitize, migrate, today, dayNum, addDay, applyResult, apply, pickResult, pickRpg, sidGate,
    CAT_LABEL, makeCatalog, makeCtx, snapOvercome, reached, valOf, visible, evaluate, stepInfo, tierLabel, bestKey, progressOf, summarize, listView,
    createStore, pendingPay, payout };
  globalThis.BADGES_CORE = CORE;
  if (typeof document === 'undefined') return;   // node の vm ではここで終わる

  // ---------- ブラウザ ----------
  // index.html のグローバルを確かめる。足りなければ何も作らない（クイズはそのまま動く）。
  // 呼ぶときはいつもグローバルの名前で呼ぶ（参照を取っておかない）
  const kinds = { C: typeof C, byA: typeof byA, REGIONS: typeof REGIONS, flag: typeof flag, esc: typeof esc, fmt: typeof fmt, $: typeof $,
    store: typeof store, S: typeof S, P: typeof P, FX: typeof FX, show: typeof show, registerScreen: typeof registerScreen, emit: typeof emit, toast: typeof toast };
  const lacking = Object.keys(kinds).filter(k => kinds[k] === 'undefined');
  if (lacking.length) { console.error('[badges] 見つからない: ' + lacking.join(' ')); return; }

  const X = makeX(C), CAT = makeCatalog(C);
  const ctx = () => makeCtx(X, window.RPG);
  // バッジのセーブ（index.html の store とは別）。localStorage には呼ぶたびにさわる（使えなくなっても例外は Store が受ける）
  const bs = createStore({
    storage: { getItem: k => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: k => localStorage.removeItem(k) },
    X, cat: CAT, ctx, warn: m => console.warn(m),
  });
  // 時間（ms）
  const TOAST_MS = 4500;                               // バッジのトーストを出しておく時間（§5.3）
  const TOAST_GAP = 400;                               // 続けて出すトーストのずらし（§5.3）
  const GACHA_HOLD = 4000, GACHA_HOLD_REDUCED = 1000;  // 最後の rpg:pull から、ガチャの演出中（パックの演出＋めくる）としてお知らせを待つ時間。reduced motion なら短く（§5.1）
  const PANEL_FX_DELAY = 700;                          // 結果のファンファーレから、パネルの音と紙吹雪まで（§5.4）
  const COPIED_MS = 2000;                              // シェアの「コピー済み」を出しておく時間（§6.3）
  let run = null;           // クイズ中なら { sid }。drill:start で作り、drill:result で捨てる（保留の判定に使う）
  let battle = false;       // バトル画面にいる
  let screen = document.body.dataset.screen || 'home';   // 最初の drill:screen は badges.js を読む前に出るので、body から読む
  let lastPull = 0;         // 最後の rpg:pull の時刻（ガチャの演出中の保留）
  const gate = sidGate();   // 同じゲームの結果は1回だけ数える
  const pending = [];       // まだ出していないお知らせ
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lastSid = null;       // いちばん新しいクリアの sid（結果画面のパネルにあとから足すかを決める）
  let flushTimer = 0;       // ガチャの演出が終わったら flush する（タイマーは1つだけ）
  const toastTimers = [];   // 400ms ずらしてまだ出していないトースト { id, src }（src は元のお知らせ。出す前に止めたら pending に戻す）

  // 取れたステップを知らせる（§5.1〜§5.3）。auto（自動でつけた称号）は、ほかの commit が lastAuto を消す前に読む。
  // opts.result: drill:result の detail（clear なら結果画面のパネル）、opts.startup: 起動時の判定（まとめて1枚）
  function deliver(keys, opts = {}) {
    const auto = 'auto' in opts ? opts.auto : bs.lastAuto;
    if (auto) emitTitle(auto);
    const res = opts.result;
    if (opts.startup) {                        // 起動時の払いは deliver の前に済んでいる（ここでは払わない）
      if (keys.length) { pending.push({ summary: keys.length }); flush(); }
    } else {
      const paid = pay(keys), items = keys.map(key => ({ key, paid: paid[key], auto: key === auto }));
      items.sort((a, b) => b.auto - a.auto);   // 自動でつけた称号を先頭に（パネルの4行・トーストの上限で「ほか」に入らないように）
      if (res?.outcome === 'clear') { lastSid = res.sid; resultPanel(items, res); }   // パネルに出したものはトーストにしない
      else if (!$('scr-result').hidden && $('r-badges')?.dataset.sid === lastSid) panelAdd($('r-badges'), items);
      else { pending.push(...items); flush(); }
    }
    renderHome();
    if (screen === 'badges') renderBadges();
  }
  // 冒険への支払い（§8.3）。badge:earned を出して rpg.js が書いた paid を読み返す。window.RPG が無ければ何もしない
  function pay(keys, retro = false) {
    return payout(bs, CAT, keys, { rpg: !!window.RPG, retro, dispatch: detail => { const ev = new CustomEvent('badge:earned', { detail }); document.dispatchEvent(ev); return ev.detail.paid; } });
  }

  // お知らせを出せるまでの ms。Infinity はイベント（drill:result・drill:screen・rpg:battle・ダイアログの close）を待つ
  function blockedFor() {
    if (run || battle || $('detail').open) return Infinity;   // クイズ中・バトル中・#detail の下に隠れる
    const left = screen === 'gacha' ? lastPull + (reduced() ? GACHA_HOLD_REDUCED : GACHA_HOLD) - Date.now() : 0;
    return left > 0 ? left : 0;
  }
  // 保留していたお知らせを出す。同じタスクで続けて来た分（バトルの終わりの rpg:battle → rpg:clear → 仲間など）は
  // マイクロタスクを1つ待ってまとめて1回で出す（上限はそのまとめに効く）。判定と払いはイベントごとに同期のまま
  let flushQueued = false;
  function flush() {
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => { flushQueued = false; flushNow(); });
  }
  // 起動時のまとめは1枚ずつ、ステップは残りの枚数まで（超えたら残り−1枚と「ほか◯個」）。まとめも上限の枚数に数える。400ms ずつずらす
  function flushNow() {
    clearTimeout(flushTimer);
    if (!pending.length) return;
    const wait = blockedFor();
    if (wait === Infinity) return;
    if (wait > 0) { flushTimer = setTimeout(flush, wait); return; }
    const list = pending.splice(0), steps = list.filter(it => !('summary' in it)), sums = list.filter(it => 'summary' in it);
    const cap = Math.max(1, (innerWidth < 600 ? 2 : 3) - sums.length);   // ステップに使える枚数（まとめは起動時の1枚だけ）
    // { html, key, src }。key があるのは個別のトースト（ドパガキの演出をする）。src はそのトーストにしたお知らせ
    const out = sums.map(it => ({ html: lineToast(`これまでの記録から バッジを${it.summary}個もらったよ！`), src: [it] }));
    const single = it => ({ html: stepToast(it), key: it.key, src: [it] });
    if (steps.length > cap) out.push(...steps.slice(0, cap - 1).map(single), { html: lineToast(`ほか${steps.length - cap + 1}個のバッジもゲット！`), src: steps.slice(cap - 1) });
    else out.push(...steps.map(single));
    showToast(out[0]);
    out.slice(1).forEach((o, i) => {
      const tm = { src: o.src };
      tm.id = setTimeout(() => {               // 待つ間にクイズ・バトル・ダイアログなどが始まったら、これと残りは出さずに pending に戻す
        if (blockedFor()) { requeue(); flush(); return; }
        toastTimers.splice(toastTimers.indexOf(tm), 1);
        showToast(o);
      }, (i + 1) * TOAST_GAP);
      toastTimers.push(tm);
    });
  }
  // ずらして出す途中のトーストを止めて、元のお知らせを pending に戻す（順番はそのまま。出せるようになったら flush で出す）
  function requeue() {
    for (const tm of toastTimers.splice(0)) { clearTimeout(tm.id); pending.push(...tm.src); }
  }
  // クイズ・バトルが始まった: 出ているバッジのトーストは問題やタイマーに重なるので消し（ほかのトーストは残す）、まだの分は終わってから出す
  function hideToasts() {
    requeue();
    document.querySelectorAll('#toasts > .toast').forEach(el => el.querySelector(':scope > [data-bdg-toast]') && el.remove());
  }
  // トーストを1枚出す（toast はいつもグローバルの名前で呼ぶ）。個別のトーストは、ドパガキなら音と、金・虹なら紙吹雪（§5.4）
  function showToast({ html, key }) {
    toast(html, TOAST_MS);
    if (key && !S.dopa) SND.play('badge');
    if (!key || !S.dopa) return;
    FX.sfx('correct', 8);
    const el = $('toasts')?.lastElementChild;   // toast() は何も返さないので、いま足した1枚
    if (el && (stepInfo(CAT, key)?.color ?? 0) >= 3 && !reduced()) FX.confetti(el.getBoundingClientRect(), 60);
  }

  // つけている称号の印。［つける］を押して描き直したら、ここにフォーカスを移す（refocus）
  const ON_HTML = '<span class="bdg-on" tabindex="-1">つけてる中</span>';
  // 取ったステップ1つ分（トーストとパネルの行で同じ）。2行×3列: メダル｜名前と段・称号｜払われたコイン・［つける］（つけている称号なら「つけてる中」）
  // data-key・data-paid は、称号をつけかえたときにパネルの行を描き直すため（redrawPanel）
  function stepHTML({ key, paid, auto }) {
    const si = stepInfo(CAT, key);
    if (!si) return '';
    const coin = typeof paid === 'number' && Number.isFinite(paid) && paid > 0 ? paid : 0;   // 0 は「もう払ってある」（docs/events.md）
    const title = `称号〈${esc(si.t.title)}〉`;
    const l2 = auto ? `<p class="bdg-l2">${title}をつけたよ</p>`
      : `<p class="bdg-l2">${title}</p>${bs.st.eq === key ? ON_HTML : `<button class="btn ghost bdg-btn" data-bdg-equip="${key}">つける</button>`}`;
    return `<div class="bdg-row" data-key="${key}" data-paid="${coin}"><span class="bdg-medal t${si.color}">${esc(si.b.icon)}</span><p class="bdg-l1">${esc(`${si.b.name} ${tierLabel(si.color)}`)}</p>`
      + `<span class="bdg-paid">${coin ? `●+${coin}` : ''}</span>${l2}</div>`;
  }
  // トーストの中身。<div data-bdg-toast> の中を押したら消す（document の click）
  const stepToast = item => `<div data-bdg-toast class="bdg-toast"><p class="bdg-h">バッジゲット！</p>${stepHTML(item)}</div>`;
  const lineToast = msg => `<div data-bdg-toast class="bdg-toast bdg-line"><p class="bdg-msg">${msg}</p><button class="btn ghost bdg-btn" data-bdg-open>見る</button></div>`;

  // 結果画面のパネル（§5.2）。#r-side（無ければ #rcard）の中の #r-ext の直前（無ければボタンの行の直前）
  const PANEL_ROWS = 4;
  const TIP = '国名ヒントありのときは、ノーミス・モード・地域の銀と金などのバッジは進まないよ';
  function resultPanel(items, res) {
    const tip = !!res.hint && bs.st.tip < 3;
    const host = $('r-side') || $('rcard');
    if (!host || !items.length && !tip) return;
    $('r-badges')?.remove();
    const box = document.createElement('div');
    box.className = 'bdg-result'; box.id = 'r-badges'; box.dataset.sid = res.sid;
    if (tip) {
      box.innerHTML = `<p class="bdg-tip">${TIP}</p>`;
      bs.push(['tip']); bs.commit({ judge: false });
    }
    const ext = host.querySelector(':scope > #r-ext'), btns = host.querySelector(':scope > .row.center');
    if (ext) ext.before(box); else if (btns) btns.before(box); else host.append(box);
    panelAdd(box, items);
    if (S.dopa && items.length) setTimeout(() => panelFx(box), PANEL_FX_DELAY);
    else if (items.length) setTimeout(() => { if (box.isConnected && !$('scr-result').hidden) SND.play('badge'); }, PANEL_FX_DELAY);   // 結果のファンファーレのあと（ヒントの注意だけのパネルでは鳴らさない）
  }
  // 結果パネルのドパガキの演出（§5.4）。結果画面を離れた・次の結果に変わったら何もしない。
  // 紙吹雪はパネルの真ん中が画面内に見えていればそこから、見えていなければ画面の中央（null）から
  function panelFx(box) {
    if (!box.isConnected || $('scr-result').hidden) return;
    FX.sfx('correct', 10);
    if (reduced()) return;
    const r = box.getBoundingClientRect(), cy = r.top + r.height / 2;
    FX.confetti(r.width && cy >= 0 && cy <= innerHeight ? r : null, 80);
  }
  // パネルに行を足す。4行まで、それより多ければ「ほか◯個」の数を増やす（行は作り直さない）
  function panelAdd(box, items) {
    if (!items.length) return;
    if (!box.querySelector(':scope > .bdg-h')) box.insertAdjacentHTML('afterbegin', '<p class="bdg-h">🏅 バッジを手に入れたよ！</p>');
    let last = [...box.querySelectorAll(':scope > .bdg-h, :scope > .bdg-row')].pop(), rows = box.querySelectorAll(':scope > .bdg-row').length, extra = 0;
    for (const it of items) {
      if (rows >= PANEL_ROWS) { extra++; continue; }
      const html = stepHTML(it);
      if (html) { last.insertAdjacentHTML('afterend', html); last = last.nextElementSibling; rows++; }
    }
    if (!extra) return;
    let more = box.querySelector(':scope > .bdg-more');
    if (!more) {
      last.insertAdjacentHTML('afterend', '<div class="bdg-more"><span></span><button class="btn ghost bdg-btn" data-bdg-open>バッジを見る</button></div>');
      more = last.nextElementSibling;
    }
    more.dataset.n = (Number(more.dataset.n) || 0) + extra;
    more.firstElementChild.textContent = `ほか${more.dataset.n}個`;
  }
  // パネルの行を、いまつけている称号に合わせて描き直す（押した行は「つけてる中」、自動でつけた行も「をつけたよ」をやめて［つける］）
  function redrawPanel() {
    for (const row of $('r-badges')?.querySelectorAll(':scope > .bdg-row') ?? []) row.outerHTML = stepHTML({ key: row.dataset.key, paid: +row.dataset.paid, auto: false });
  }
  // つける称号が変わった（key が null なら外した）。badge:title を出すのはここだけ
  function emitTitle(key) {
    emit('badge:title', key ? { key, title: stepInfo(CAT, key)?.t.title ?? '' } : { key: null, title: '' });
  }

  // ---------- イベントの受け取り（設計書 §3.3） ----------
  const on = (type, fn) => document.addEventListener(type, e => fn(e.detail ?? {}));
  on('drill:start', d => { run = { sid: d.sid }; hideToasts(); });
  on('drill:answer', d => {                    // 軽く！ op を1つ積むだけ。保存・判定・DOM はしない
    try { bs.push(['ans', d.a, !!d.right, !!d.first, !!d.hint, d.mode, d.missesBefore | 0, d.missesAfter | 0]); }
    catch (e) { console.error('[badges]', e); }
  });
  on('drill:result', d => {
    try {
      if (!gate(d.sid)) return;
      run = null;
      bs.push(['res', pickResult(d), !!S.dopa, today()]);
      deliver(bs.commit(), { result: d });
    } catch (e) { console.error('[badges]', e); }
  });
  on('drill:book-open', d => {
    if (!X.codes.has(d.a) || bs.st.s.bk[d.a]) return;
    bs.push(['book', d.a]); deliver(bs.commit());
  });
  on('drill:misses-reset', () => { bs.push(['wk-reset']); deliver(bs.commit()); });   // 苦手の印だけ消す。克服・バッジは消さない
  on('drill:screen', d => {
    const was = screen; screen = d.name;
    if (d.name === 'battle') { battle = true; hideToasts(); } else if (was === 'battle') battle = false;
    if (d.name === 'home') renderHome();
    flush();                                   // 保留していたお知らせ（バトル・ガチャを離れた）
  });
  // 冒険（rpg.js / rpg-battle.js。§8.2）。バトルの1問ごと・クイズ中は積むだけ（drill:result でまとめて判定）
  for (const t of ['coins', 'levelup', 'join', 'promote', 'answer', 'battle', 'clear', 'overcome', 'bounty']) on('rpg:' + t, d => {
    if (t === 'coins' && d.reason !== 'start') return;   // バッジのごほうび（'badge'）などでは判定しない
    bs.push(['rpg', t, pickRpg(t, d, screen), today()]);   // promote の learn は via が無ければ「★2 で、いまの画面がガチャでない」
    if (t === 'battle') battle = false;                  // バトルが終わった（保留していたお知らせを出せる）
    if (t === 'answer' || run) return;
    deliver(bs.commit());
  });
  on('rpg:pull', () => { lastPull = Date.now(); flush(); });   // ガチャの演出中は保留（§5.1）。保留の時間を決め直す
  $('detail').addEventListener('close', flush);   // ダイアログの下に隠れるので、開いている間は保留していた
  // 閉じる・隠れるときは、残っている op を保存だけする（判定は次の起動か次の結果で）
  const save = () => { if (bs.pending()) bs.commit({ judge: false }); };
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
  // ほかのタブが書いた。読み直して描き直すだけ（判定も保存もしない）
  window.addEventListener('storage', e => {
    if (e.key !== 'badges') return;
    bs.reload(); renderHome();
    if (screen === 'badges') renderBadges();
  });

  // ---------- 画面（設計書 §6）。出す文字はいつも esc() を通す ----------
  const SITE = 'https://chikokunn1011.github.io/country-drill/';   // シェアの文の最後に付ける
  // いまつけている称号（かっこなし）。eq がカタログに無い・取っていないなら ''
  function titleText() { const { eq, got } = bs.st; return eq && own(got, eq) ? stepInfo(CAT, eq)?.t.title ?? '' : ''; }
  // 取った一番上の段の添字。1段も取っていなければ -1
  const topOf = (b, d) => { let i = b.tiers.length - 1; while (i >= 0 && !own(d.got, stepKey(b, i))) i--; return i; };
  const masked = (b, d) => !!b.secret && topOf(b, d) < 0;   // ひみつのバッジで、まだ取っていない（条件と称号を出さない）
  // NEW: 取った段の時刻のどれかが、詳細を最後に開いた時刻（sn）より新しい
  const isNew = (b, d) => b.tiers.some((_, i) => { const k = stepKey(b, i); return own(d.got, k) && d.got[k] > (d.sn[b.id] || 0); });
  // 進み具合の文。ta-speed（lower）は「2.43→2.0秒」（記録が無ければ「記録なし」）、goal が 1（地域の銅・銀、1段だけのバッジなど）は「まだ」か「達成」、ほかは「34 / 100」
  const progText = (b, v, goal) => b.lower ? (v > 0 ? `${(v / 1000).toFixed(2)}→${(goal / 1000).toFixed(1)}秒` : '記録なし')
    : goal === 1 ? (v >= 1 ? '達成' : 'まだ') : `${fmt(Math.min(v, goal))} / ${fmt(goal)}`;
  const barHTML = r => `<div class="bdg-bar"><i style="width:${Math.round(r * 100)}%"></i></div>`;
  const medalHTML = (b, d) => { const top = topOf(b, d); return `<span class="bdg-medal ${top < 0 ? 'off' : 't' + b.tiers[top].color}" aria-hidden="true"><i>${masked(b, d) ? '？' : esc(b.icon)}</i></span>`; };
  const monthDay = t => { const dt = new Date(t); return `${dt.getMonth() + 1}/${dt.getDate()}`; };
  const catsOf = x => ['all', ...Object.keys(CAT_LABEL).filter(c => c !== 'rpg' || x.rpg)];   // 分類のチップ（冒険は rpg.js があるときだけ）

  // ホーム（§6.1）: バッジのボタン（#home-settings の直前）と称号の札（.home .menu の1つ目）。何度呼んでも同じ要素を書きかえる
  function renderHome() {
    const menu = document.querySelector('.home .menu');
    if (!menu) return;
    let btn = $('home-badges');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'btn ghost'; btn.id = 'home-badges'; btn.dataset.bdgOpen = '';
      const next = $('home-settings');
      if (next?.parentElement === menu) next.before(btn); else menu.append(btn);
    }
    const d = bs.st, x = ctx(), { got, total } = summarize(CAT, d, x);
    btn.innerHTML = `バッジ <small class="mono">${got}/${total}</small>`
      + (visible(CAT, x).some(b => isNew(b, d)) ? '<span class="bdg-dot" role="img" aria-label="新しいバッジあり"></span>' : '');
    const title = titleText();
    let row = menu.querySelector(':scope > .bdg-titlerow');
    if (!title) { row?.remove(); return; }
    if (!row) {
      row = document.createElement('div'); row.className = 'bdg-titlerow';
      row.innerHTML = '<button class="bdg-titlechip" id="home-title" data-bdg-picker></button>';
      menu.prepend(row);
    }
    row.firstElementChild.innerHTML = `〈${esc(title)}〉`;   // ボタンは作り直さない（フォーカスを残す）
  }

  // バッジ画面のタイル（§6.2）
  function tileHTML(b, d, x) {
    const top = topOf(b, d), hide = masked(b, d), p = progressOf(b, d, x), next = p.next >= 0 ? b.tiers[p.next] : null;
    const prog = next ? progText(b, p.v, p.goal) : 'コンプリート！';
    const label = hide ? `ひみつのバッジ。${b.hint}` : !next ? `${b.name}。コンプリート`
      : `${b.name}。${top < 0 ? 'まだ取っていない' : tierLabel(b.tiers[top].color) + 'まで取った'}。次の${tierLabel(next.color)}は${next.desc}、${p.goal === 1 ? '' : 'いま '}${prog}`;
    const dots = b.tiers.map((t, i) => own(d.got, stepKey(b, i)) ? `<i class="t${t.color}">●</i>` : '<i>○</i>').join('');
    return `<button class="bdg-tile" data-bdg-detail="${b.id}" aria-label="${esc(label)}">${medalHTML(b, d)}`
      + `<b class="bdg-name">${hide ? '？？？' : esc(b.name)}</b>${b.sub && !hide ? `<small class="bdg-sub">${esc(b.sub)}</small>` : ''}`
      + `<span class="bdg-dots">${dots}</span>${hide ? '' : `${barHTML(p.ratio)}<span class="bdg-prog">${esc(prog)}</span>`}`
      + `${isNew(b, d) ? '<span class="bdg-new">NEW</span>' : ''}</button>`;
  }
  // もうすぐ取れそう: ひみつでないバッジの次の段で、進み具合が50%以上のものを、進んでいる順に3つ
  function soonHTML(list, d, x) {
    return list.filter(b => !b.secret).map(b => [b, progressOf(b, d, x)]).filter(([, p]) => p.next >= 0 && p.ratio >= .5 && p.ratio < 1)
      .sort((p, q) => q[1].ratio - p[1].ratio).slice(0, 3)
      .map(([b, p]) => {
        const left = b.lower ? `${((p.v - p.goal) / 1000).toFixed(2)}秒` : `${fmt(p.goal - p.v)}${b.unit ?? ''}`;
        return `<li>${esc(`${b.icon} ${b.name} ${tierLabel(b.tiers[p.next].color)} あと${left}`)}</li>`;
      }).join('');
  }
  // 最近とったバッジ: 見えているバッジのステップを、取った時刻の新しい順に3つ
  function recentHTML(list, d) {
    const ids = new Set(list.map(b => b.id));
    return Object.entries(d.got).map(([k, t]) => [stepInfo(CAT, k), t]).filter(([si]) => si && ids.has(si.b.id))
      .sort((p, q) => q[1] - p[1]).slice(0, 3)
      .map(([si, t]) => `<li>${esc(`${monthDay(t)} ${si.b.icon} ${si.b.name} ${tierLabel(si.color)}`)}</li>`).join('');
  }
  function renderBadges() {
    const d = bs.st, x = ctx(), list = visible(CAT, x), sum = summarize(CAT, d, x), title = titleText();
    $('bdg-total').textContent = `${sum.total}個中 ${sum.got}個`;
    $('bdg-title').innerHTML = title ? `〈${esc(title)}〉` : 'まだ称号がない';
    $('bdg-colors').textContent = [1, 2, 3, 4].map(c => `${tierLabel(c)} ${sum.byColor[c]}`).join(' · ');
    $('bdg-soon').innerHTML = soonHTML(list, d, x);
    $('bdg-recent').innerHTML = recentHTML(list, d);
    // 分類のチップは、並びが変わったときだけ作り直す（押したチップのフォーカスと、行の横スクロールの位置を残す）
    const cats = catsOf(x), saved = store.get('bdgcat', 'all'), cur = cats.includes(saved) ? saved : 'all', box = $('bdg-cats');
    if (box.dataset.cats !== cats.join()) {
      box.dataset.cats = cats.join();
      box.innerHTML = cats.map(c => `<button class="chip" data-cat="${c}">${c === 'all' ? 'すべて' : esc(CAT_LABEL[c])}</button>`).join('');
    }
    for (const chip of box.children) chip.setAttribute('aria-pressed', chip.dataset.cat === cur);
    $('bdg-list').innerHTML = cats.filter(c => c !== 'all' && (cur === 'all' || c === cur))
      .map(c => `<section class="bdg-cat" data-cat="${c}"><h2 class="bdg-cat-h">${esc(CAT_LABEL[c])}</h2>`
        + `<div class="bdg-tiles">${list.filter(b => b.cat === c).map(b => tileHTML(b, d, x)).join('')}</div></section>`).join('');
  }

  // 詳細ダイアログ（§6.3）。図鑑の #detail を使い回す（index.html の $('detail').onclick は上書きしない）
  function detailHTML(b) {
    const d = bs.st, x = ctx(), hide = masked(b, d);
    const head = `<div class="bdg-dhead">${medalHTML(b, d)}<div><h2 class="bdg-dname">${hide ? '？？？' : esc(b.name)}</h2>`
      + `<p class="bdg-dcat">${esc(CAT_LABEL[b.cat])}のバッジ</p></div></div>`;
    if (hide) return `<div class="bdg-detail" data-id="${b.id}">${head}<p class="bdg-hint">${esc(b.hint)}</p></div>`;   // ヒントだけ
    const tiers = b.tiers.map((t, i) => {
      const key = stepKey(b, i), got = own(d.got, key), v = valOf(b, t, d.s, x);
      const state = got ? `<p class="bdg-when">✓ ${monthDay(d.got[key])}</p>`
        : `<div class="bdg-tprog">${barHTML(ratioOf(b, v, t.goal))}<span class="bdg-prog">${esc(progText(b, v, t.goal))}</span></div>`;
      const act = got && d.eq === key ? ON_HTML
        : got ? `<button class="btn ghost bdg-btn" data-bdg-equip="${key}">つける</button>` : '<span class="bdg-lock">（取ると使える）</span>';
      return `<li class="bdg-tier" data-key="${key}"><span class="bdg-tl t${t.color}">${tierLabel(t.color)}</span><div class="bdg-tbody">`
        + `<p class="bdg-cond">${esc(t.desc)}</p>${state}<div class="bdg-trow"><p class="bdg-ttl">称号〈${esc(t.title)}〉</p>${act}</div></div></li>`;
    }).join('');
    // ［シェア］は「シェア」と「コピー済み」を重ねて置き、幅を初めから長いほうに合わせる（コピーしたときに幅が変わって行が折り返さない）
    const acts = (topOf(b, d) >= 0 ? `<button class="btn ghost bdg-btn bdg-share" data-bdg-share="${b.id}"><span>シェア</span><span>コピー済み</span></button>` : '')
      + (b.cat === 'region' || b.cat === 'mode' ? `<button class="btn ghost bdg-btn" data-bdg-practice="${b.id}">練習する →</button>` : '');
    return `<div class="bdg-detail" data-id="${b.id}">${head}<ol class="bdg-tiers">${tiers}</ol>`
      + `${b.skill ? '<p class="bdg-note">※ 国名ヒントありの正解は数えないよ</p>' : ''}${acts ? `<div class="row bdg-acts">${acts}</div>` : ''}</div>`;
  }
  // 称号えらび: 取った称号を段の色の大きい順（虹→銅）に。最後に「称号をつけない」
  function pickerHTML() {
    const d = bs.st, eq = d.eq || '';
    const pick = (key, inner) => `<button class="bdg-pick" data-bdg-pick="${key}" aria-pressed="${eq === key}">${inner}</button>`;
    const steps = visible(CAT, ctx()).flatMap(b => b.tiers.map((_, i) => stepKey(b, i))).filter(k => own(d.got, k))
      .map(k => [k, stepInfo(CAT, k)]).sort((p, q) => q[1].color - p[1].color);
    return `<div class="bdg-picker"><h2 class="bdg-ph">称号をえらぶ</h2><div class="bdg-picks">`
      + steps.map(([k, si]) => pick(k, `<span class="bdg-tl t${si.color}">${tierLabel(si.color)}</span>`
        + `<span class="bdg-pt"><b>〈${esc(si.t.title)}〉</b><small>${esc(`${si.b.icon} ${si.b.name}`)}</small></span>`)).join('')
      + `${pick('', '称号をつけない')}</div></div>`;
  }
  function drawDialog(html) {
    $('detail-inner').innerHTML = `<button class="close" data-bdg-close>閉じる</button>${html}`;
    if (!$('detail').open) $('detail').showModal();
  }
  function openDetail(id) {
    const b = visible(CAT, ctx()).find(e => e.id === id);
    if (!b) return;
    drawDialog(detailHTML(b));
    bs.push(['seen', id, Date.now()]); bs.commit({ judge: false });   // NEW の印を消す
    renderHome();
    if (screen === 'badges') renderBadges();
  }
  function openPicker() { drawDialog(pickerHTML()); }
  // ダイアログにバッジの詳細か称号えらびが出ていれば描き直す。図鑑の詳細には触らない
  function redrawDialog() {
    const box = $('detail').open && $('detail-inner').querySelector(':scope > .bdg-detail, :scope > .bdg-picker');
    if (!box) return;
    if (box.classList.contains('bdg-picker')) { drawDialog(pickerHTML()); return; }
    const b = CAT.find(e => e.id === box.dataset.id);
    if (b) drawDialog(detailHTML(b));
  }

  function open(id) { show('badges'); if (id) openDetail(id); }
  // 称号をつける（'' なら外す）。取っていないキーと、もうつけているキー（称号えらびで同じものを押した・古いトーストの［つける］）は何もしない
  function equip(key) {
    if (typeof key !== 'string' || key !== '' && !own(bs.st.got, key)) return;
    const was = bs.st.eq;
    if (key === was) return;      // badge:title を出し直さない
    bs.push(['eq', key]);
    deliver(bs.commit());          // ホームの札とバッジ画面も、ここで描き直す
    emitTitle(key || null);
    redrawDialog();
    redrawPanel();                 // 結果画面のパネル（ドパガキ OFF だと、ほかに押した手ごたえが出ない）
    refocus(key);
    if (key && S.dopa && !reduced()) {   // つけた称号が変わった（外したときは出さない）
      FX.pop('称号チェンジ！', 'small');
      // FX.pop は body に足すが、showModal の #detail は top layer で z-index に関係なく上に来る。開いたままなら中へ移す
      const popEl = $('detail').open && document.querySelector('body > .fx-pop');
      if (popEl) $('detail').append(popEl);
    }
  }
  // 描き直しで押したボタンが消えてフォーカスが body に落ちたら、つけた段・行の「つけてる中」へ（無ければダイアログの［閉じる］）
  function refocus(key) {
    if (document.activeElement && document.activeElement !== document.body) return;
    const dlg = $('detail').open, box = dlg ? $('detail-inner') : $('r-badges');
    (box?.querySelector(`[data-key="${key}"] .bdg-on`) ?? (dlg ? box.querySelector(':scope > .close') : null))?.focus();
  }
  // 地域・モードのバッジの条件でモード選択へ（P.name は変えない。詳細の注意書きで知らせる）。
  // 地域は、いまの問題数で次の段が取れなければ、取れるいちばん少ない数にする（銅は「10問以上」で10問、銀は「全部」）
  function practice(id) {
    const b = CAT.find(e => e.id === id);
    if (b?.cat === 'region') {
      S.region = X.regionOf(b.rk); store.set('settings', S);
      const next = progressOf(b, bs.st, ctx()).next;
      if (next === 1) P.count = 'all';
      else if (next === 0 && P.count !== 'all' && P.count < 10) P.count = 10;   // どの地域も10か国以上ある
    } else if (b?.cat === 'mode') P.mode = b.mode;
    else return;
    store.set('setup', P);
    $('detail').close();
    show('setup');
  }
  // 取った一番上の段で文を作る。navigator.share が無ければクリップボードにコピーする。btn は押した［シェア］
  function share(id, btn) {
    const b = CAT.find(e => e.id === id), top = b ? topOf(b, bs.st) : -1;
    if (top < 0) return;
    const t = b.tiers[top], text = `国旗マスターでバッジ『${b.name}（${tierLabel(t.color)}）』を取ったよ！ 称号〈${t.title}〉 ${SITE}`;
    try {
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else navigator.clipboard?.writeText(text).then(() => copied(btn), () => {});
    } catch { /* 共有もコピーもできなければ何もしない */ }
  }
  // コピーできた。トーストはモーダルの #detail の下に隠れるので、開いている間は押したボタンの文字をしばらく「コピー済み」にする（data-copied。badges.css）
  let copiedTimer = 0;
  function copied(btn) {
    if (!$('detail').open || !btn?.isConnected) { toast('コピーしたよ', COPIED_MS); return; }   // コピーが終わる前に閉じた
    clearTimeout(copiedTimer);
    btn.dataset.copied = '';
    copiedTimer = setTimeout(() => { delete btn.dataset.copied; }, COPIED_MS);
  }

  // バッジのボタンは document でまとめて受ける（ホーム・バッジ画面・ダイアログ・トースト・結果画面のパネル）
  document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest('[data-bdg-equip], [data-bdg-pick], [data-bdg-open], [data-bdg-detail], [data-bdg-practice], [data-bdg-share], [data-bdg-close], [data-bdg-picker]');
    const note = e.target.closest('[data-bdg-toast]')?.closest('.toast');
    if (el) {
      const v = el.dataset;
      if ('bdgEquip' in v) equip(v.bdgEquip);
      else if ('bdgPick' in v) { $('detail').close(); equip(v.bdgPick); }   // 先に閉じる（ポップを body に残して見えるように）
      else if ('bdgOpen' in v) open(v.bdgOpen || undefined);
      else if ('bdgDetail' in v) openDetail(v.bdgDetail);
      else if ('bdgPractice' in v) practice(v.bdgPractice);
      else if ('bdgShare' in v) share(v.bdgShare, el);
      else if ('bdgClose' in v) $('detail').close();
      else if ('bdgPicker' in v) openPicker();   // ホームの札と［称号をかえる］
    }
    note?.remove();                // トーストの中を押したら（ボタンでも）すぐ消す。上に重なって下の画面のボタンを押せないので
  });

  // ---------- window.BADGES（設計書 §9.3）。起動時の判定より先に置く（badge:title を受けた側が title() を読めるように） ----------
  window.BADGES = {
    title: titleText,              // かっこなし
    titleKey: () => bs.st.eq || null,
    count: () => summarize(CAT, bs.st, ctx()),
    list: () => listView(CAT, bs.st, ctx()),
    open,
  };
  if (new URLSearchParams(location.search).get('bdgdebug') === '1') window.BADGES.debug = {   // E2E 用
    grant(key) { bs.push(['got', key, Date.now()]); bs.commit({ judge: false }); renderHome(); },
    set(field, value) { bs.push(['set', field, value]); deliver(bs.commit()); },
    reset() { bs.reset(); renderHome(); },
    dump: () => clone(bs.st),
  };

  // ---------- 起動時の判定（§3.4）。bootAuto はほかの commit より先に読む ----------
  const boot = bs.commit(), bootAuto = bs.lastAuto;
  // いま取れたステップと前の払い残し（rpg.js があとから入った・前に払えなかった）を、まとめて retro: true で払う（§8.3）
  pay(pendingPay(bs, CAT, ctx()), true);
  deliver(boot, { startup: true, auto: bootAuto });

  // ---------- バッジ画面（§6.2）。<section> を #scr-book の後ろに作ってから登録する ----------
  const sec = document.createElement('section');
  sec.id = 'scr-badges'; sec.className = 'wrap'; sec.hidden = true;
  sec.innerHTML = `<div class="bdg-split">
    <div id="bdg-sum" class="bdg-sum panel">
      <div class="bdg-head"><h2>バッジ</h2><span id="bdg-total"></span></div>
      <div class="bdg-me"><span id="bdg-title" class="bdg-mytitle"></span><button class="btn ghost bdg-btn" id="bdg-change" data-bdg-picker>称号をかえる</button></div>
      <p id="bdg-colors" class="bdg-colors"></p>
      <div class="bdg-soon"><h3 class="bdg-sh">もうすぐ取れそう</h3><ul id="bdg-soon" class="bdg-lines"></ul></div>
      <div class="bdg-recent"><h3 class="bdg-sh">最近とったバッジ</h3><ul id="bdg-recent" class="bdg-lines"></ul></div>
    </div>
    <div class="bdg-main"><div id="bdg-cats" class="bdg-cats" role="group" aria-label="分類"></div><div id="bdg-list"></div></div>
  </div>
  <div class="row end"><button class="btn" id="bdg-home">ホームへ</button></div>`;
  $('scr-book').after(sec);
  $('bdg-home').onclick = () => show('home');
  $('bdg-cats').onclick = e => {
    const chip = e.target.closest('[data-cat]');
    if (chip) { store.set('bdgcat', chip.dataset.cat); renderBadges(); }
  };
  // 詳細を閉じたら、開いていたバッジのタイルにフォーカスを戻す（開いたときにタイルを描き直したので、元のタイルはもう無い）
  $('detail').addEventListener('close', () => {
    $('detail').querySelector(':scope > .fx-pop')?.remove();   // 中へ移したポップが次に開いたときに出直さないように
    const id = $('detail-inner').querySelector(':scope > .bdg-detail')?.dataset.id;
    if (id && document.activeElement === document.body) $('bdg-list').querySelector(`[data-bdg-detail="${id}"]`)?.focus();
  });
  registerScreen('badges', renderBadges);
  if (location.hash === '#badges') show('badges');
})();
