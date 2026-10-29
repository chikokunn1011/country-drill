// 今日の難問（毎日1回のチャレンジ）の、画面を持たない部分: 日本時間の日付・日付から決まる乱数・出題の組み立て・ランキングの並べ方。
// 全員が同じ日に同じ問題になるように、Math.random は使わず日付から作った乱数だけで決める。
// ブラウザでは <script src="daily-core.js"> で window.DAILY_CORE になる（テストでは vm で読み込む）
(() => {
  // 規則を変えるとその日の問題が変わる（ランキングとずれる）。変えるときは version を上げ、since を翌日以降の日付にする。
  // countries.js の地域（r）・面積（ar）・国の増減も問題を変える（古いキャッシュの人とずれる）ので、直すなら日本時間の0時ごろに出す
  const RULES = [
    { since: '2000-01-01', version: 1 },
  ];
  const COUNT = 20;
  const MODES = ['f2n', 'n2f', 'm2f', 'f2m'];   // 国旗→国名・国名→国旗・場所→国旗・国旗→場所（首都は出さない）
  const SMALL_AR = 25000;                        // index.html の isSmall と同じ「小さい国」（km²）
  // 何問目からどの段階か（1: なじみの薄い国、2: 似た国旗、3: 似た国旗＋小さい国）
  const stageOf = i => i < 6 ? 1 : i < 14 ? 2 : 3;
  // よく知られた国。1〜6問目と15〜20問目には出さない（7〜14問目もなるべく出さない）
  const FAMOUS = new Set(('jp us cn kr kp gb fr de it es ru ca br au in mx ar eg za ng ke tr sa ir iq id th vn ph my sg ' +
    'nz nl be ch se no dk fi pl pt gr ie at ua il pk bd cu jm co pe cl mn af ma ve').split(' '));
  // 見まちがえやすい国旗のグループ。7問目からは、ここから出して選択肢もそろえる
  const SIMILAR = [
    'td ro ad md',      // 青・黄・赤のたて3色
    'id mc pl sg',      // 赤と白
    'ie ci it mx',      // 緑・白・オレンジ/赤のたて3色
    'ru si sk rs hr',   // 白・青・赤のよこ3色
    'au nz tv fj',      // 青地にユニオンジャック
    'ml gn sn cm',      // 緑・黄・赤のたて3色
    've ec co',         // 黄・青・赤
    'sv ni hn ar',      // 青・白・青
    'eg sy iq ye',      // 赤・白・黒
    'jo sd kw ae',      // 赤・白・黒・緑
    'no is dk fi se',   // 北欧の十字
    'bo lt gh et',      // 赤・黄・緑
    'de be ug',         // 黒・黄・赤
    'hu bg ir tj',      // 赤・白・緑
    'at lv lb pe',      // 赤・白・赤
    'us lr my',         // 赤白のしま＋青
    'jp bd pw la',      // まんなかに丸
    'tr tn mv',         // 赤地に三日月
    'cn vn kg',         // 赤地に黄色
    'nl lu py fr',      // 赤・白・青
    'cz ph bs',         // 左に三角
    'bj gw tg',         // 緑・黄・赤と帯
    'sl ga rw',         // 緑・黄/白・青
    'tt kn tz cg na',   // ななめの帯
    'qa bh',            // ギザギザの白
  ].map(s => s.split(' '));

  // 'YYYY-MM-DD'（日本時間）。0時で次の日になる
  const jstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
  // 日本時間の次の0時まであと何ミリ秒か
  const msToNextDay = (d = new Date()) => { const t = d.getTime() + 9 * 3600e3; return 86400e3 - (((t % 86400e3) + 86400e3) % 86400e3); };
  const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
  const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day + 'T00:00:00Z')) && addDays(day, 0) === day;

  // 文字列 → 32bit の種（FNV-1a）、種 → 0以上1未満の乱数（mulberry32）
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const shuffle = (r, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const ruleFor = day => RULES.filter(x => x.since <= day).at(-1);

  // その日の問題。countries は COUNTRIES（{ a, n, r, ar }）。
  // 返すのは [{ no, stage, mode, a, opts: [国コード4つ] }]。opts の中に a がちょうど1つ
  function build(day, countries) {
    if (!validDay(day)) throw new Error(`daily: 日付がおかしい ${day}`);
    const rule = ruleFor(day), r = rng(hash(`kokki-daily:${rule.version}:${day}`));
    // 同じ国コードの順番で並べてから使う（データの並びが変わっても同じ問題になるように）
    const all = countries.slice().sort((x, y) => x.a < y.a ? -1 : x.a > y.a ? 1 : 0);
    const by = new Map(all.map(c => [c.a, c]));
    const groups = SIMILAR.map(g => g.filter(a => by.has(a))).filter(g => g.length >= 2);
    const groupOf = new Map(groups.flatMap(g => g.map(a => [a, g])));
    const used = new Set(), usedGroups = new Set(), out = [];
    const free = list => list.filter(a => !used.has(a));
    // 選択肢: 先の候補から順に、正解以外の3つ。足りなければ同じ地域、それでも足りなければ全部から
    function options(a, ...prefs) {
      const c = by.get(a), opts = [a];
      const sameRegion = all.filter(x => x.r === c.r).map(x => x.a);
      for (const list of [...prefs, shuffle(r, sameRegion), shuffle(r, all.map(x => x.a))]) {
        for (const x of list) { if (opts.length >= 4) break; if (!opts.includes(x)) opts.push(x); }
      }
      return shuffle(r, opts);
    }
    let prevMode = null, run = 0;
    for (let i = 0; i < COUNT; i++) {
      const stage = stageOf(i);
      // 形式は4つから。同じ形式は3回続けない
      let mode = pick(r, MODES);
      if (mode === prevMode && run >= 2) mode = pick(r, MODES.filter(m => m !== mode));
      run = mode === prevMode ? run + 1 : 1; prevMode = mode;
      let a, opts;
      if (stage === 1) {
        a = pick(r, free(all.filter(c => !FAMOUS.has(c.a)).map(c => c.a)));
        opts = options(a);
      } else if (stage === 2) {
        // 同じグループは1日1回まで。よく知られた国はなるべく出さない
        const g = pick(r, groups.filter(g => !usedGroups.has(g) && free(g).length));
        const rare = free(g).filter(x => !FAMOUS.has(x));
        a = pick(r, rare.length ? rare : free(g));
        opts = options(a, shuffle(r, g));
      } else {
        // 小さい国（なじみの薄い国）から。似た国旗があればその仲間、無ければ同じ地域の小さい国を選択肢に
        a = pick(r, free(all.filter(c => c.ar < SMALL_AR && !FAMOUS.has(c.a)).map(c => c.a)));
        const c = by.get(a);
        opts = options(a, shuffle(r, groupOf.get(a) ?? []), shuffle(r, all.filter(x => x.r === c.r && x.ar < SMALL_AR).map(x => x.a)));
      }
      used.add(a); if (groupOf.has(a)) usedGroups.add(groupOf.get(a));
      out.push({ no: i + 1, stage, mode, a, opts });
    }
    return out;
  }

  // ランキングの並べ方: 正答数が多い順（全問正解がいちばん上）→ タイムが短い順 → 先に載せた順
  const compare = (x, y) => (y.correct - x.correct) || (x.timeMs - y.timeMs) || (x.at - y.at);

  // 埋めこみ（embed.html）の1日1問。形は国旗→国名か国名→国旗だけ（地図と首都は出さない）
  const EMBED_MODES = ['f2n', 'n2f'];
  // 返すのは { day, mode, a, opts: [国コード4つ] }。国はよく知られた国から、その日の build の答えを外して選ぶ。
  // 種は build と別（kokki-embed）なので、build の問題は変わらない。乱数を使う順番を変えると、その日の1問が変わる
  function oneOfDay(day, countries) {
    if (!validDay(day)) throw new Error(`daily: 日付がおかしい ${day}`);
    const r = rng(hash(`kokki-embed:1:${day}`));
    const all = countries.slice().sort((x, y) => x.a < y.a ? -1 : x.a > y.a ? 1 : 0);
    const answers = new Set(build(day, countries).map(q => q.a));
    const mode = pick(r, EMBED_MODES);
    const a = pick(r, all.filter(c => FAMOUS.has(c.a) && !answers.has(c.a)).map(c => c.a));
    const region = all.find(c => c.a === a).r, opts = [a];
    // 選択肢: 同じ地域から。足りなければ全部から
    for (const list of [shuffle(r, all.filter(c => c.r === region).map(c => c.a)), shuffle(r, all.map(c => c.a))]) {
      for (const x of list) { if (opts.length >= 4) break; if (!opts.includes(x)) opts.push(x); }
    }
    return { day, mode, a, opts: shuffle(r, opts) };
  }

  globalThis.DAILY_CORE = { COUNT, MODES, FAMOUS, SIMILAR, stageOf, jstDay, msToNextDay, addDays, validDay, hash, rng, build, compare, EMBED_MODES, oneOfDay };
})();
