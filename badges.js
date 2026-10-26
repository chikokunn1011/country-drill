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
      { id: 'rpg-phoenix', cat: 'rpg', icon: '💫', name: '不死鳥', rpg: true, v: s => s.rpg.phoenix,
        tiers: one('不死鳥', '思い出して復活し、そのバトルに勝つ', 2) },
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

  // 次の段への進み具合。next はまだ取っていない最初の段の添字（全部取ったら -1 で、値は最後の段）
  function progressOf(b, d, x) {
    const next = b.tiers.findIndex((_, i) => !own(d.got, stepKey(b, i)));
    const t = b.tiers[next < 0 ? b.tiers.length - 1 : next], v = valOf(b, t, d.s, x), goal = t.goal;
    const ratio = next < 0 ? 1 : b.lower ? (v > 0 ? Math.min(1, goal / v) : 0) : Math.min(1, v / goal);
    return { next, v, goal, ratio };
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
      push(op) { ops.push(op); apply(st, op, X); },    // 積んで表示にだけ当てる（保存・判定はしない）
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
  let run = null;           // クイズ中なら { sid }。drill:start で作り、drill:result で捨てる（保留の判定に使う）
  let battle = false;       // バトル画面にいる
  let screen = document.body.dataset.screen || 'home';   // 最初の drill:screen は badges.js を読む前に出るので、body から読む
  let lastPull = 0;         // 最後の rpg:pull の時刻（ガチャの演出中の保留）
  const gate = sidGate();   // 同じゲームの結果は1回だけ数える
  const pending = [];       // まだ出していないお知らせ
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 取れたステップを知らせる。auto（自動でつけた称号）は、ほかの commit が lastAuto を消す前に読む
  function deliver(keys, opts = {}) {
    const auto = 'auto' in opts ? opts.auto : bs.lastAuto;
    if (auto) emitTitle(auto);
    pending.push(...keys.map(key => ({ key, auto: key === auto })));
    flush();
    renderHome();
    if (screen === 'badges') renderBadges();
  }
  function flush() {}           // 保留していたお知らせを出す（Task 6）
  function renderHome() {}      // ホームの札とボタン（Task 5）
  function renderBadges() {}    // バッジ画面（Task 5）
  function pay(keys, retro = false) { return {}; }   // 冒険への支払い（Task 7）
  // つける称号が変わった（key が null なら外した）。badge:title を出すのはここだけ
  function emitTitle(key) {
    emit('badge:title', key ? { key, title: stepInfo(CAT, key)?.t.title ?? '' } : { key: null, title: '' });
  }

  // ---------- イベントの受け取り（設計書 §3.3） ----------
  const on = (type, fn) => document.addEventListener(type, e => fn(e.detail ?? {}));
  on('drill:start', d => { run = { sid: d.sid }; });
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
    if (d.name === 'battle') battle = true; else if (was === 'battle') battle = false;
    if (d.name === 'home') renderHome();
    flush();                                   // 保留していたお知らせ（バトル・ガチャを離れた）
  });
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

  // ---------- window.BADGES（設計書 §9.3）。起動時の判定より先に置く（badge:title を受けた側が title() を読めるように） ----------
  window.BADGES = {
    title() { const { eq, got } = bs.st; return eq && own(got, eq) ? stepInfo(CAT, eq)?.t.title ?? '' : ''; },   // かっこなし
    titleKey: () => bs.st.eq || null,
    count: () => summarize(CAT, bs.st, ctx()),
    list: () => listView(CAT, bs.st, ctx()),
    open: id => show('badges'),                // Task 5 で詳細も開く
  };
  if (new URLSearchParams(location.search).get('bdgdebug') === '1') window.BADGES.debug = {   // E2E 用
    grant(key) { bs.push(['got', key, Date.now()]); bs.commit({ judge: false }); renderHome(); },
    set(field, value) { bs.push(['set', field, value]); deliver(bs.commit()); },
    reset() { bs.reset(); renderHome(); },
    dump: () => clone(bs.st),
  };

  // ---------- 起動時の判定（§3.4）。bootAuto はほかの commit より先に読む ----------
  const boot = bs.commit(), bootAuto = bs.lastAuto;
  deliver(boot, { startup: true, auto: bootAuto });
})();
