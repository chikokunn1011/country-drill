(() => {
  'use strict';
  // 国旗クエスト（RPG）の計算部品。DOM・localStorage・Date.now() は使わない（日付と乱数は引数で受け取る）
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
  const C = globalThis.COUNTRIES || [];
  const REGION = new Map(C.map(c => [c.a, c.r]));

  // 数値はすべてここ。ほかのファイルに倍率・値段・確率・時間を直接書かない
  const TUNING = {
    hero: { hp0: 30, hpLv: 6, atk0: 8, atkLv: 2, maxLv: 99 },
    levelBase: 100, levelStep: 30,
    quiz: { base: 10, retry: 3, ta: 5, modeMul: { f2n: 1, n2f: 1, m2f: 1.2, f2m: 1.2 }, hintMul: 0.6, weakMul: 2,
            decay: [[3, 1], [6, 0.5], [Infinity, 0.2]], firstEver: 20, taMinMsPerQ: 400 },
    clear: { practiceHalf: 2, practicePerfect: 3, challenge: 5, challengeNoMiss: 5, ta: 3, dailyMinN: 5 },
    daily: 100, start: 1000, overcome: 30, bounty: 30, bountyAll: 100, badge: 50,
    battle: { winBase: 10, winPerStage: 2, firstMul: 3, bossFirst: 200, losePerRight: 2, comboStep: 0.1, comboMax: 5,
              critRate: 0.1, critMul: 1.5, enemyHits: 5, enemyHitPct: 0.3, bossHitPct: 0.25, recStep: 1.2, recStep2: 0.8, recStep3: 0.85,
              autoNextMs: 650, guardMs: 250, gaugeMax: 5, gaugeStep: 0.05, weakMax: 2, bossWeakPct: 0.7 },
    card: { base: [0, 1, 3, 6], stack: 0.2, fr: 0.03, regionMul: 1.5, hpMul: 3, frJoin: 5, frMax: 10, stackMax: 4 },
    gacha: { r3: 0.03, r2: 0.17, pity: 50, one: 100, ten: 1000, regionMul: 1.5, refund: [0, 10, 30, 100], showMs: 1700, turnMs: 300, holdMs: [0, 650, 950, 1600] },
    share: { url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', cards: [50, 100, 195] },
    // 編成: 枠は最大 slots 個。slotCost[i] は i+2 枠目の値段。bonus[n] は同じグループ n 枚のときのチームボーナス
    team: { slots: 5, slotCost: [2000, 3000, 4000, 5000], bonus: [0, 0, 0.10, 0.25], nameMax: 8 },
    // 宇宙のテーマ: 小さい国・大きい国の数（面積の順）、赤道の国の緯度（±度）
    space: { small: 40, big: 40, equator: 12 },
  };
  const BIG = 1e9;                                   // コイン・回数の上限（sanitize と、rpg.js / rpg-battle.js の足し算が使う）

  // 国の数が少ない地域から順に開く。r は S.region と同じ日本語名（全世界は 'all'）。英字 id と日本語名の変換はここだけ
  const DUNGEONS = [
    { id: 'samerica', ch: 1, r: '南アメリカ', name: 'アマゾンの密林', plate: 'PLATE 01 · SOUTH AMERICA', color: '#6fa86a', flags: 6, land: '南アメリカ' },
    { id: 'oceania', ch: 1, r: 'オセアニア', name: 'サンゴ礁の海', plate: 'PLATE 02 · OCEANIA', color: '#4fa3c7', flags: 7, land: 'オセアニア' },
    { id: 'namerica', ch: 1, r: '北・中央アメリカ', name: '大峡谷', plate: 'PLATE 03 · N.&C. AMERICA', color: '#d29a4a', flags: 8, land: '北・中央アメリカ' },
    { id: 'europe', ch: 1, r: 'ヨーロッパ', name: '古城の迷宮', plate: 'PLATE 04 · EUROPE', color: '#a77bab', flags: 9, land: 'ヨーロッパ' },
    { id: 'asia', ch: 1, r: 'アジア', name: '天空の山脈', plate: 'PLATE 05 · ASIA', color: '#d0705a', flags: 9, land: 'アジア' },
    { id: 'africa', ch: 1, r: 'アフリカ', name: 'サバンナの大地', plate: 'PLATE 06 · AFRICA', color: '#c4a02a', flags: 10, land: 'アフリカ' },
    { id: 'world', ch: 1, r: 'all', name: '地図喰いの巣', plate: 'PLATE 07 · WORLD', color: '#5b6b73', flags: 12, land: '世界' },
    // 第2章 鏡の地球: 今の7つと同じ地域・同じ順（base は元の id）。色は元の色を暗くしたもの
    { id: 'msamerica', base: 'samerica', ch: 2, r: '南アメリカ', name: '鏡のアマゾン', plate: 'PLATE 08 · MIRROR S. AMERICA', color: '#436540', flags: 6, land: '鏡の南アメリカ' },
    { id: 'moceania', base: 'oceania', ch: 2, r: 'オセアニア', name: '鏡のサンゴ礁', plate: 'PLATE 09 · MIRROR OCEANIA', color: '#2f6277', flags: 7, land: '鏡のオセアニア' },
    { id: 'mnamerica', base: 'namerica', ch: 2, r: '北・中央アメリカ', name: '鏡の大峡谷', plate: 'PLATE 10 · MIRROR N.&C. AMERICA', color: '#7e5c2c', flags: 8, land: '鏡の北・中央アメリカ' },
    { id: 'meurope', base: 'europe', ch: 2, r: 'ヨーロッパ', name: '鏡の古城', plate: 'PLATE 11 · MIRROR EUROPE', color: '#644a67', flags: 9, land: '鏡のヨーロッパ' },
    { id: 'masia', base: 'asia', ch: 2, r: 'アジア', name: '鏡の山脈', plate: 'PLATE 12 · MIRROR ASIA', color: '#7d4336', flags: 9, land: '鏡のアジア' },
    { id: 'mafrica', base: 'africa', ch: 2, r: 'アフリカ', name: '鏡のサバンナ', plate: 'PLATE 13 · MIRROR AFRICA', color: '#766019', flags: 10, land: '鏡のアフリカ' },
    { id: 'mworld', base: 'world', ch: 2, r: 'all', name: '鏡の地図喰いの巣', plate: 'PLATE 14 · MIRROR WORLD', color: '#374045', flags: 12, land: '鏡の世界' },
    // 第3章 宇宙: 地域ではなくテーマ（t は THEMES のキー）で国をしぼる。r は全部 'all'（ガチャ・セーブの地域と同じ値のまま）。e は太陽系の地図に出す星
    { id: 'moon', ch: 3, r: 'all', t: 'island', e: '🌕', name: '月', plate: 'PLATE 15 · MOON', color: '#9aa6bd', flags: 9, land: '月' },
    { id: 'mercury', ch: 3, r: 'all', t: 'small', e: '☿', name: '水星', plate: 'PLATE 16 · MERCURY', color: '#9a8c80', flags: 9, land: '水星' },
    { id: 'venus', ch: 3, r: 'all', t: 'equator', e: '♀', name: '金星', plate: 'PLATE 17 · VENUS', color: '#d6a144', flags: 10, land: '金星' },
    { id: 'mars', ch: 3, r: 'all', t: 'landlocked', e: '🔴', name: '火星', plate: 'PLATE 18 · MARS', color: '#c4553a', flags: 10, land: '火星' },
    { id: 'jupiter', ch: 3, r: 'all', t: 'big', e: '🪐', name: '木星', plate: 'PLATE 19 · JUPITER', color: '#b9774a', flags: 11, land: '木星' },
    { id: 'saturn', ch: 3, r: 'all', t: 'south', e: '🪐', name: '土星', plate: 'PLATE 20 · SATURN', color: '#b8a265', flags: 11, land: '土星' },
    { id: 'blackhole', ch: 3, r: 'all', e: '🕳️', name: '星喰いの巣', plate: 'PLATE 21 · BLACK HOLE', color: '#7a5bb5', flags: 12, land: '宇宙' },
  ];
  // 章。last はその章の最後のダンジョン（ここをクリアすると章クリア）
  const CHAPTERS = [{ ch: 1, name: '地球', e: '🌍', last: 'world' }, { ch: 2, name: '鏡の地球', e: '🪞', last: 'mworld' }, { ch: 3, name: '宇宙', e: '🪐', last: 'blackhole' }];
  const STORY_IDS = ['ch1', 'ch2', 'ch3start', 'ch3'];   // セーブの story に入るもの（読んだストーリー）
  const chapterOf = id => DUNGEONS.find(d => d.id === id)?.ch ?? null;
  const dungeonsOf = ch => DUNGEONS.filter(d => d.ch === ch);
  // F1〜F4 とボス（5件目）
  const MONSTERS = {
    samerica: [{ e: '🦜', n: 'おしゃべりオウム' }, { e: '🐸', n: 'ヤドクガエル' }, { e: '🦙', n: 'つばとばしアルパカ' }, { e: '🐍', n: '大アナコンダ' }, { e: '🐆', n: 'ジャガー王' }],
    oceania: [{ e: '🦀', n: 'ヤシガニ' }, { e: '🦘', n: 'ボクサーカンガルー' }, { e: '🐊', n: 'イリエワニ' }, { e: '🦈', n: 'ホホジロザメ' }, { e: '🌋', n: '怒れる火山' }],
    namerica: [{ e: '🦅', n: 'ハクトウワシ' }, { e: '🦝', n: 'いたずらアライグマ' }, { e: '🌵', n: 'サボテンナイト' }, { e: '🐻', n: 'グリズリー' }, { e: '🌪️', n: '大竜巻' }],
    europe: [{ e: '🦇', n: '古城のコウモリ' }, { e: '🐺', n: '森のオオカミ' }, { e: '🦉', n: '物知りフクロウ' }, { e: '🕷️', n: '古城の大グモ' }, { e: '🐉', n: '赤い竜' }],
    asia: [{ e: '🐒', n: '温泉ザル' }, { e: '🐼', n: 'ねぼすけパンダ' }, { e: '🐘', n: '森のゾウ' }, { e: '🐅', n: 'ベンガルトラ' }, { e: '🐲', n: '青い竜' }],
    africa: [{ e: '🦂', n: '砂漠のサソリ' }, { e: '🦒', n: 'のっぽキリン' }, { e: '🦛', n: '怒りんぼカバ' }, { e: '🦏', n: '突進サイ' }, { e: '🦁', n: '百獣の王' }],
    world: [{ e: '🌫️', n: '白紙の霧' }, { e: '🗺️', n: 'やぶれた地図' }, { e: '🧭', n: 'くるった方位磁針' }, { e: '👻', n: '地図喰いの影' }, { e: '👾', n: '地図喰い' }],
  };
  // 鏡の地球の手下 F1〜F4 は元の絵文字のまま、名前に「鏡の」「さかさ」を交互に付ける。ボスは別の名前
  const MIRROR_BOSS = { samerica: { e: '🐆', n: 'うつしジャガー' }, oceania: { e: '🌋', n: 'さかさ火山' }, namerica: { e: '🌪️', n: 'さかさ竜巻' }, europe: { e: '🐉', n: '白い竜' }, asia: { e: '🐲', n: '金の竜' }, africa: { e: '🦁', n: '影の百獣の王' }, world: { e: '🪞', n: '鏡の地図喰い' } };
  for (const g of dungeonsOf(2)) {
    MONSTERS[g.id] = [...MONSTERS[g.base].slice(0, 4).map((m, i) => ({ e: m.e, n: (i % 2 ? 'さかさ' : '鏡の') + m.n })), MIRROR_BOSS[g.base]];
  }
  // 宇宙の F1〜F4 とボス
  Object.assign(MONSTERS, {
    moon: [{ e: '🛸', n: 'ちびUFO' }, { e: '🪨', n: 'クレーター岩' }, { e: '🌠', n: 'まいご流れ星' }, { e: '🤖', n: '月面ロボ' }, { e: '🐇', n: '月のウサギ大王' }],
    mercury: [{ e: '☀️', n: 'じりじり太陽風' }, { e: '🪨', n: 'ちび小惑星' }, { e: '🛰️', n: 'まよい衛星' }, { e: '🌡️', n: '温度計おばけ' }, { e: '☄️', n: 'ほうき星' }],
    venus: [{ e: '☁️', n: '硫酸の雲' }, { e: '🌋', n: '金星火山' }, { e: '⚡', n: 'かみなり雲' }, { e: '🥵', n: 'あつがり星人' }, { e: '🔥', n: '金星の炎' }],
    mars: [{ e: '🤖', n: '探査ロボ' }, { e: '🌪️', n: '赤い砂あらし' }, { e: '🛸', n: '火星UFO' }, { e: '🐙', n: 'タコ型火星人' }, { e: '👽', n: '火星人の将軍' }],
    jupiter: [{ e: '🌕', n: 'ガリレオ衛星' }, { e: '🌩️', n: 'ガスのいなずま' }, { e: '🧲', n: '磁場のうず' }, { e: '🎈', n: 'ふわふわガス' }, { e: '🌀', n: '大赤斑' }],
    saturn: [{ e: '🧊', n: '氷のかけら' }, { e: '💍', n: '輪っかの石' }, { e: '🌫️', n: 'もやもや衛星' }, { e: '🚀', n: '迷子ロケット' }, { e: '💫', n: '輪っかの番人' }],
    blackhole: [{ e: '🌌', n: 'ゆがんだ銀河' }, { e: '⭐', n: '吸いこまれ星' }, { e: '🕳️', n: '小さな穴' }, { e: '👁️', n: '星喰いの目' }, { e: '🌑', n: '星喰い' }],
  });
  // 宇宙のテーマ。n は答えのあとに出す名前、a は国コード。島国・内陸国は手書き、ほかは countries.js の面積（ar）・緯度（ll[0]）から作る
  const SP = TUNING.space, byArea = [...C].sort((x, y) => x.ar - y.ar).map(c => c.a);   // 面積の小さい順
  const THEMES = {
    // 国土が島だけで、ほかの国と陸の国境がない国
    island: { n: '島国', a: 'ag bs bb bh cv km cu cy dm fj gd is jm jp ki lk mv mg mh mt mu fm nr nz pw ph lc vc ws st sc sg sb kn to tt tv vu'.split(' ') },
    small: { n: '小さい国', a: byArea.slice(0, SP.small) },
    equator: { n: '赤道の国', a: C.filter(c => Math.abs(c.ll[0]) <= SP.equator).map(c => c.a) },
    landlocked: { n: '内陸国', a: 'af am at az by bo bw bf bi cf td cz sz et hu kz xk kg la ls li lu mw ml md mn np ne mk py rw sm rs ss sk ch tj tm ug uz va zm zw ad'.split(' ') },
    big: { n: '大きい国', a: byArea.slice(-SP.big).reverse() },
    south: { n: '南半球の国', a: C.filter(c => c.ll[0] < 0).map(c => c.a) },
  };
  const AVATARS = ['🧙', '🧝', '🦸', '🤠', '🦊', '🐱', '🐶', '🐧'];
  // mb（ヒントなしで正解したモード）のビット
  const MODE_BIT = { f2n: 1, n2f: 2, m2f: 4, f2m: 8, cap: 16 };
  const dungeonOf = id => DUNGEONS.find(d => d.id === id);
  // 地域のダンジョン（第1章の、地図喰いの巣をのぞく6つ。DUNGEONS と同じもの・同じ順）
  const REGION_DUNGEONS = DUNGEONS.filter(g => g.ch === 1 && g.r !== 'all');
  // 仲間の数（セーブ d の cards の国の数）
  const owned = d => Object.keys(d.cards).length;

  // ---- 旅人とレベル（ステータスはセーブせず、Lv から毎回計算する） ----
  // Lv L → L+1 の費用。上限の Lv から先は Infinity
  const levelCost = L => L >= TUNING.hero.maxLv ? Infinity : TUNING.levelBase + TUNING.levelStep * (L - 1);
  // coins で上げられるところまで上げたときの Lv と、かかるコインの合計（coins が Infinity や数でなくても止まる）
  const maxLevelUp = (lv, coins) => {
    const c = Math.min(BIG, +coins || 0);
    let to = lv, cost = 0;
    while (to < TUNING.hero.maxLv && cost + levelCost(to) <= c) cost += levelCost(to++);
    return { to, cost };
  };
  const heroStats = lv => {
    const H = TUNING.hero;
    return { hp: H.hp0 + H.hpLv * lv, atk: H.atk0 + H.atkLv * lv };
  };

  // ---- 敵の強さ（式だけ。フロアごとの数字は手で書かない） ----
  // ステージ番号 1〜105（第1章 1〜35、第2章 36〜70、第3章 71〜105）。floor は 1〜4 が通常、5 がボス
  const stageOf = (id, floor) => 5 * DUNGEONS.findIndex(d => d.id === id) + floor;
  // 第1章の最後のステージまでは 1 + floor((s-1) × recStep)。そのさき（第2章）は、そこの推奨 Lv から recStep2 ずつ。
  // 第3章は第2章の最後の推奨 Lv から recStep3 ずつ
  const recLv1 = s => 1 + Math.floor((s - 1) * TUNING.battle.recStep);
  const recLv2 = s => {
    const last = 5 * dungeonsOf(1).length;
    return s <= last ? recLv1(s) : recLv1(last) + Math.round((s - last) * TUNING.battle.recStep2);
  };
  const recLv = s => {
    const last = 5 * (dungeonsOf(1).length + dungeonsOf(2).length);
    return s <= last ? recLv2(s) : recLv2(last) + Math.round((s - last) * TUNING.battle.recStep3);
  };
  // 推奨 Lv・仲間なしで、通常は正解約5回で勝ち・ミス3回まで OK。ボスは旗1枚が1発・ミス3回まで OK
  const enemy = (id, floor) => {
    const B = TUNING.battle, s = stageOf(id, floor), R = recLv(s), h = heroStats(R);
    return floor >= 5
      ? { boss: true, s, recLv: R, flags: dungeonOf(id).flags, flagHp: h.atk, atk: Math.ceil(h.hp * B.bossHitPct) }
      : { boss: false, s, recLv: R, hp: h.atk * B.enemyHits, atk: Math.ceil(h.hp * B.enemyHitPct) };
  };

  // ---- バトルのコイン・ダメージ ----
  // 勝ち: (10+2s)×(初クリア 3倍) ＋ ボス初撃破 200。負け: 正解1つ2コイン、勝ったときの 10+2s の半分まで
  const battleReward = (s, { win, first, boss, rights } = {}) => {
    const B = TUNING.battle, w = B.winBase + B.winPerStage * s;
    return win
      ? w * (first ? B.firstMul : 1) + (boss && first ? B.bossFirst : 0)
      : Math.min((rights || 0) * B.losePerRight, Math.floor(w / 2));
  };
  // ダンジョンを F1〜ボスまで全部はじめてクリアしたときのコインの合計
  const firstClearTotal = id => [1, 2, 3, 4, 5].reduce((sum, f) => sum + battleReward(stageOf(id, f), { win: true, first: true, boss: f === 5 }), 0);
  const damage = (atk, combo, crit) => {
    const B = TUNING.battle;
    return Math.round(atk * (1 + B.comboStep * Math.min(combo, B.comboMax)) * (crit ? B.critMul : 1));
  };

  // 国 a がダンジョン dg の国か（地域ボーナス）。テーマがあればテーマに入るか、無ければ全世界か同じ地域
  const inDungeon = (dg, a) => dg.t ? THEMES[dg.t].a.includes(a) : dg.r === 'all' || REGION.get(a) === dg.r;

  // ---- 仲間カードとバトルでの値 ----
  // card = [★, かさね]、fr = なかよし度。丸めない
  const cardAtk = ([star, stack], fr, bonus) => {
    const K = TUNING.card;
    return K.base[star] * (1 + K.stack * (stack || 0)) * (1 + K.fr * (fr || 0)) * (bonus ? K.regionMul : 1);
  };
  // パーティはおまかせ: そのダンジョンでのカードのこうげきが高い順 → ★が高い順 → 国コード順に3枚
  const party = (d, id) => {
    const dg = dungeonOf(id), fr = d.fr || {};
    return Object.entries(d.cards || {})
      .map(([a, card]) => ({ a, star: card[0], atk: cardAtk(card, fr[a], !!dg && inDungeon(dg, a)) }))
      .sort((x, y) => y.atk - x.atk || y.star - x.star || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
      .slice(0, 3).map(({ a, atk }) => ({ a, atk }));
  };
  // ---- 編成とチームボーナス（13グループ） ----
  // 最初の10個は index.html の SUBREGIONS の文字列をそのまま写す（同じことを単体テストで確かめる）。残り3つは6地域から作る
  const SUB = [
    ['東アジア', 'cn jp kp kr mn'],
    ['東南アジア', 'bn kh id la my mm ph sg th tl vn'],
    ['南アジア', 'af bd bt in mv np pk lk'],
    ['中央アジア', 'kz kg tj tm uz'],
    ['西アジア', 'am az bh ge ir iq il jo kw lb om qa sa sy tr ae ye'],
    ['東ヨーロッパ', 'al by ba bg hr cz ee hu xk lv lt md me mk pl ro ru rs sk si ua'],
    ['西ヨーロッパ', 'ad at be cy dk fi fr de gr va is ie it li lu mt mc nl no pt sm es se ch gb'],
    ['カリブ海', 'ag bs bb cu dm do gd ht jm kn lc vc tt'],
    ['アフリカ北側', 'dz bj bf cv cm cf td ci dj eg gq er et gm gh gn gw ke lr ly ml mr ma ne ng st sn sl so ss sd tg tn ug'],
    ['アフリカ南側', 'ao bw bi km cg cd sz ga ls mg mw mu mz na rw sc za tz zm zw'],
  ].map(([k, a]) => ({ k, a: a.split(' ') }));
  const CARIB = new Set(SUB.find(g => g.k === 'カリブ海').a);
  const GROUPS = [
    ...SUB,
    ...['南アメリカ', 'オセアニア', '北・中央アメリカ'].map(r => ({ k: r, a: C.filter(c => c.r === r && !CARIB.has(c.a)).map(c => c.a) })),
  ];
  const GROUP_OF = new Map(GROUPS.flatMap(g => g.a.map(a => [a, g.k])));
  const groupOf = a => GROUP_OF.get(a) ?? null;
  // いちばん多いグループの枚数 n（同数なら list で先に出たほう）。2枚 +10%、3枚 +25%
  const teamBonus = list => {
    const cnt = new Map();
    for (const a of list || []) { const g = groupOf(a); if (g) cnt.set(g, (cnt.get(g) || 0) + 1); }
    let group = null, n = 0;
    for (const [g, k] of cnt) if (k > n) { group = g; n = k; }
    return n < 2 ? { bonus: 0, group: null, n } : { bonus: TUNING.team.bonus[Math.min(n, 3)], group, n };
  };
  // 枠 t の仲間。枠が無いか c === null（おまかせ）なら party()。配列なら c の順で、持っている国だけ
  const teamParty = (d, id, t = d.tsel) => {
    const tm = (d.teams || [])[t];
    if (!tm || !Array.isArray(tm.c)) return party(d, id);
    const dg = dungeonOf(id), fr = d.fr || {}, cards = d.cards || {};
    return tm.c.filter(a => Object.prototype.hasOwnProperty.call(cards, a))
      .map(a => ({ a, atk: cardAtk(cards[a], fr[a], !!dg && inDungeon(dg, a)) }));
  };
  // (旅人 ＋ 仲間) ×（1 + 0.05 × がんばりゲージ）×（1 + チームボーナス）。ゲージはフロアごと（'samerica:1' の形）
  // おまかせの枠にはチームボーナスをかけない（一度も編成を組んでいないセーブは今と同じ強さ）
  const battleStats = (d, id, floor, t = d.tsel) => {
    const h = heroStats(d.lv), p = teamParty(d, id, t), sum = p.reduce((s, c) => s + c.atk, 0);
    const tm = (d.teams || [])[t], auto = !tm || !Array.isArray(tm.c);
    const tb = auto ? { bonus: 0, group: null, n: 0 } : teamBonus(p.map(c => c.a));
    const gauge = (d.gauge || {})[id + ':' + floor] || 0, mul = (1 + TUNING.battle.gaugeStep * gauge) * (1 + tb.bonus);
    return {
      atk: Math.round((h.atk + Math.round(sum)) * mul),
      hp: Math.round((h.hp + Math.round(TUNING.card.hpMul * sum)) * mul),
      party: p, gauge,
      team: { bonus: tb.bonus, group: tb.group, n: tb.n, slot: t ?? 0, auto },
    };
  };
  // 次の枠の値段（もう最大なら null）
  const slotCost = d => {
    const n = list(d.teams).length;
    return n >= 1 && n < TUNING.team.slots ? TUNING.team.slotCost[n - 1] : null;
  };
  // 枠を1つ買う。払った額を返す（買えなかったら 0）。新しい枠はおまかせで、それを選んだ状態にする
  const buySlot = d => {
    const cost = slotCost(d);
    if (cost == null || !(d.coins >= cost)) return 0;
    d.coins -= cost;
    d.teams.push({ n: '編成' + (d.teams.length + 1), c: null });
    d.tsel = d.teams.length - 1;
    return cost;
  };

  // ---- 勝てそうか（表示は 余裕／ちょうど／きびしい） ----
  // 通常はコンボ 0,1,2… のダメージを足して HP に届く回数。ボスは旗の枚数 × 1枚に要る回数（コンボは数えない）
  const hitsNeeded = (st, en) => {
    if (!(st.atk > 0)) return Infinity;
    if (en.boss) return en.flags * Math.ceil(en.flagHp / st.atk);
    let n = 0, dealt = 0;
    while (dealt < en.hp) dealt += damage(st.atk, n++, false);
    return n;
  };
  const missesAllowed = (st, en) => Math.floor((st.hp - 1) / en.atk);
  const judge = (st, en) => {
    const m = missesAllowed(st, en);
    if (en.boss) {
      const per = Math.ceil(en.flagHp / st.atk);
      return per === 1 && m >= 4 ? 'easy' : per === 1 ? 'ok' : 'hard';
    }
    const h = hitsNeeded(st, en);
    return h <= 4 && m >= 4 ? 'easy' : h <= 6 ? 'ok' : 'hard';
  };

  // ---- 出題 ----
  // 地域の国を面積の大きい順に並べて4等分した国コード（F1〜F4）。x は 'all' か地域名、またはダンジョン
  // テーマのダンジョンはテーマの国を同じように4等分。1階が FLOOR_MIN か国より少なければ前後の階と重ねて FLOOR_MIN か国にする
  const FLOOR_MIN = 5;
  const floorsOf = x => {
    if (typeof x !== 'string' && !x?.t) return floorsOf(x?.r ?? 'all');
    const list = (typeof x === 'string' ? C.filter(c => x === 'all' || c.r === x) : C.filter(c => THEMES[x.t].a.includes(c.a)))
      .sort((p, q) => q.ar - p.ar), n = list.length;
    return [0, 1, 2, 3].map(i => {
      let lo = Math.round(n * i / 4), hi = Math.round(n * (i + 1) / 4);
      if (typeof x !== 'string' && hi - lo < FLOOR_MIN) {
        lo = Math.max(0, lo - Math.floor((FLOOR_MIN - (hi - lo)) / 2)); hi = Math.min(n, lo + FLOOR_MIN); lo = Math.max(0, hi - FLOOR_MIN);
      }
      return list.slice(lo, hi).map(c => c.a);
    });
  };

  // ---- 日付とコインの表示 ----
  const pad = n => String(n).padStart(2, '0');
  // 端末の日付（'YYYY-MM-DD'）
  const today = now => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // 'YYYY-MM-DD' の通し日数（整数）。日の差を数えるのに使う
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  // 1万未満はそのまま（9,999）、1万から「1.2万」（小数1桁で切り捨て、.0 は付けない）
  const shortCoins = n => n < 10000 ? n.toLocaleString('ja-JP') : `${Math.floor(n / 1000) / 10}万`;

  // ---- セーブの形・移行・掃除（設計書 §9） ----
  const VERSION = 1;
  const MIGRATE = { /* 1: d => ({ ...d, v: 2, … }) */ };
  const CODES = new Set(C.map(c => c.a));            // index.html の byA と同じ国コード
  const isCode = a => CODES.has(a);
  const IDS = new Set(DUNGEONS.map(d => d.id));
  const GAUGE_KEYS = new Set(DUNGEONS.flatMap(d => [1, 2, 3, 4, 5].map(f => `${d.id}:${f}`)));
  const GR = new Set(['', ...DUNGEONS.map(d => d.r)]);   // 前回ガチャを引いた地域（'' か 'all' か地域名）

  const fresh = todayStr => ({
    v: VERSION, intro: false, show: true, coins: 0, earned: 0, lv: 1, av: 0,
    cards: {}, fr: {}, mb: {}, fe: {}, wk: {}, lc: {}, ov: {}, floors: {}, gauge: {},
    pity: 0, pulls: 0, story: [],
    day: { d: todayStr, n: {}, first: false, free: false },
    bounty: { d: '', a: [], done: [] },
    paid: [],
    st: { win: 0, lose: 0, flee: 0, combo: 0, nodmg: 0, bossWins: 0, overcome: 0, bountyDays: 0 },
    badgesPaid: [], gr: '',
    teams: [{ n: '編成1', c: null }], tsel: 0, deco: [],
  });
  const KNOWN = new Set(Object.keys(fresh('')));

  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const list = v => Array.isArray(v) ? v : [];
  const uniq = a => [...new Set(a)];
  // 数か数の文字列だけ Number() する。有限でなければ undefined、整数に丸めて lo..hi におさめる
  const int = (v, lo, hi) => {
    const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : undefined;
  };
  const num = (v, lo, hi) => int(v, lo, hi) ?? lo;
  // ok なキーだけ1つずつ写した新しいオブジェクト（"__proto__" などはここで消える）。f が undefined を返したキーは捨てる
  const keep = (o, ok, f) => {
    const out = {};
    if (isObj(o)) for (const k of Object.keys(o)) if (ok(k)) { const v = f(o[k]); if (v !== undefined) out[k] = v; }
    return out;
  };
  const isCard = c => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && c[0] >= 1 && c[0] < TUNING.card.base.length
    && Number.isInteger(c[1]) && c[1] >= 0 && c[1] <= TUNING.card.stackMax;
  const isPaid = p => Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && Number.isInteger(p[1]) && p[1] >= 0;

  // 編成の枠: 1..slots 個。名前は前後の空白を除いて nameMax 文字まで（空なら「編成N」）。c は null か国コード3つまで（重なり無し）
  // 持っていない国は消さない（使うときに teamParty がしぼる）
  const sanitizeTeams = v => {
    const a = list(v).slice(0, TUNING.team.slots).map((t, i) => {
      const def = '編成' + (i + 1);
      if (!isObj(t)) return { n: def, c: null };
      const n = typeof t.n === 'string' ? [...t.n.trim()].slice(0, TUNING.team.nameMax).join('') : '';   // 絵文字を半分に切らない
      return { n: n || def, c: Array.isArray(t.c) ? uniq(t.c.filter(isCode)).slice(0, 3) : null };
    });
    return a.length ? a : [{ n: '編成1', c: null }];
  };

  // 入力が何でも例外を出さずに fresh の形にそろえる。知らない最上位の項目は残す（新しい版から戻ったときに消さない）
  const sanitize = (x, todayStr) => {
    const s = isObj(x) ? x : {}, f = fresh(todayStr);
    const day = isObj(s.day) ? s.day : {}, b = isObj(s.bounty) ? s.bounty : {}, st = isObj(s.st) ? s.st : {};
    const d = {
      v: Number.isInteger(s.v) && s.v >= 1 ? s.v : VERSION,
      intro: s.intro === true,
      show: s.show !== false,
      coins: num(s.coins, 0, BIG),
      earned: num(s.earned, 0, BIG),
      lv: num(s.lv, 1, TUNING.hero.maxLv),
      av: num(s.av, 0, AVATARS.length - 1),
      cards: keep(s.cards, isCode, c => isCard(c) ? [c[0], c[1]] : undefined),
      fr: keep(s.fr, isCode, v => int(v, 0, TUNING.card.frMax)),
      mb: keep(s.mb, isCode, v => int(v, 0, 31)),   // MODE_BIT の5つ
      fe: keep(s.fe, isCode, v => int(v, 0, 15)),   // クイズの4モード（cap は無い）
      wk: keep(s.wk, isCode, v => v ? 1 : undefined),
      lc: keep(s.lc, isCode, v => int(v, 0, 1e6)),
      ov: keep(s.ov, isCode, v => v ? 1 : undefined),
      floors: keep(s.floors, id => IDS.has(id), v => int(v, 0, 5)),
      gauge: keep(s.gauge, k => GAUGE_KEYS.has(k), v => int(v, 0, TUNING.battle.gaugeMax)),
      pity: num(s.pity, 0, TUNING.gacha.pity - 1),
      pulls: num(s.pulls, 0, BIG),
      // 今日でなければ今日の空のもの（day.n が増え続けない）
      day: day.d === todayStr
        ? { d: todayStr, n: keep(day.n, isCode, v => int(v, 0, 1e6)), first: day.first === true, free: day.free === true }
        : f.day,
      bounty: {
        d: typeof b.d === 'string' ? b.d : '',
        a: uniq(list(b.a).filter(isCode)).slice(0, 3),
        done: uniq(list(b.done).filter(isCode)),
      },
      paid: list(s.paid).filter(isPaid).slice(-20).map(p => [p[0], p[1]]),
      st: Object.fromEntries(Object.keys(f.st).map(k => [k, num(st[k], 0, BIG)])),
      badgesPaid: uniq(list(s.badgesPaid).filter(id => typeof id === 'string')),
      gr: GR.has(s.gr) ? s.gr : '',
      teams: sanitizeTeams(s.teams),
      deco: uniq(list(s.deco).filter(isCode)).slice(0, 3),
      story: uniq(list(s.story).filter(id => STORY_IDS.includes(id))),
    };
    d.tsel = int(s.tsel, 0, d.teams.length - 1) ?? 0;
    for (const k of Object.keys(s)) if (!KNOWN.has(k) && k !== '__proto__') d[k] = s[k];
    return d;
  };

  // raw は JSON.parse した値。backup = 壊れたかもしれない元の文字列を写す。readOnly = 新しい版のデータなので上書きしない
  const migrate = (raw, todayStr, { version = VERSION, steps = MIGRATE } = {}) => {
    const broken = () => ({ d: fresh(todayStr), readOnly: false, backup: true });
    if (!isObj(raw)) return raw == null ? { d: fresh(todayStr), readOnly: false, backup: false } : broken();
    let d = raw, backup = false;
    // v だけ消えた → v1 とみなして救う（v1 からの移行も通す）
    if (d.v === undefined) { d = { ...d, v: 1 }; backup = true; }
    if (!Number.isInteger(d.v) || d.v < 1) return broken();
    if (d.v > version) return { d: sanitize(d, todayStr), readOnly: true, backup: false };
    while (d.v < version) {
      const v = d.v, step = steps[v];
      if (typeof step !== 'function') return broken();
      let next;
      try { next = step(d); } catch { break; }   // 移行が例外を出したら、その版で止めて sanitize に任せる（新しく始めない・写しも取らない。次に読むときにもう一度試す）
      if (!isObj(next) || !Number.isInteger(next.v) || next.v <= v) return broken();   // v を進めない移行は止まらないので壊れた扱い
      d = next;
    }
    return { d: sanitize(d, todayStr), readOnly: false, backup };
  };

  // ---- 引き継ぎコード: 'CQ1.' + base64url(UTF-8 の JSON { rpg, m }) ----
  const CODE_HEAD = 'CQ1.', CODE_MAX = 100 * 1024;
  const toB64url = str => {
    let bin = '';
    for (const byte of new TextEncoder().encode(str)) bin += String.fromCharCode(byte);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  // base64url でない・UTF-8 でないときは例外
  const fromB64url = s => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
  };
  // misses: 知っている国コードだけ、0..999 の整数、0 は捨てる
  const sanitizeMisses = x => keep(x, isCode, v => int(v, 0, 999) || undefined);
  const encodeCode = (d, m) => CODE_HEAD + toB64url(JSON.stringify({ rpg: d, m }));
  // 入れ子が 16 段より深いものは断る（JSON.stringify は再帰なので深すぎると落ちる。自前のセーブは 3 段まで）
  const shallow = (v, n = 0) => v === null || typeof v !== 'object' || (n < 16 && Object.values(v).every(x => shallow(x, n + 1)));
  // 空白と改行を全部消してから読む。壊れている（migrate が写しを取る）・新しい版のコードは受け付けない
  const decodeCode = (s, todayStr) => {
    if (typeof s !== 'string') return { ok: false };
    const t = s.replace(/\s+/g, ''), body = t.slice(CODE_HEAD.length);
    if (!t.startsWith(CODE_HEAD) || t.length > CODE_MAX || !/^[A-Za-z0-9_-]+$/.test(body)) return { ok: false };
    let o;
    try { o = JSON.parse(fromB64url(body)); } catch { return { ok: false }; }
    if (!isObj(o) || !isObj(o.rpg) || !shallow(o)) return { ok: false };
    const r = migrate(o.rpg, todayStr);
    if (r.readOnly || r.backup) return { ok: false };
    const hasM = isObj(o.m);
    return { ok: true, rpg: r.d, m: hasM ? sanitizeMisses(o.m) : {}, hasM };
  };

  // ---- クイズのコインと学習の記録（設計書 §5.1・§6.2・§8） ----
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const QUIZ_KINDS = new Set(['practice', 'challenge', 'ta']);
  const QUIZ_BITS = MODE_BIT.f2n | MODE_BIT.n2f | MODE_BIT.m2f | MODE_BIT.f2m;   // マスター昇格に要る4モード
  const BOUNTY_N = 3, REVIEW_DAYS = 7;   // 手配書の数、復習の手配書に選ぶまでの日数
  // 苦手: misses が1以上か、wk の印がある
  const isWeak = (d, m, a) => Math.max(0, +(m || {})[a] || 0) > 0 || !!(d.wk || {})[a];

  // 1問ぶんのコイン。nth は今日その国でコインをもらうのが何回目か（1から）。不正解・知らない kind / mode は全部0
  const answerCoins = ({ kind, mode, right, first, hint, weak, nth, retryUsed, feDone }) => {
    const Q = TUNING.quiz, decay = (Q.decay.find(([max]) => nth <= max) || Q.decay[Q.decay.length - 1])[1];
    if (!right || !QUIZ_KINDS.has(kind) || !has(Q.modeMul, mode)) return { coin: 0, base: 0, decay, firstEver: 0 };
    const base = kind === 'ta' ? Q.ta : first ? Q.base : kind === 'practice' && !retryUsed ? Q.retry : 0;
    const coin = base > 0
      ? Math.max(1, Math.round(base * Q.modeMul[mode] * (hint ? Q.hintMul : 1) * (weak && first && !hint ? Q.weakMul : 1) * decay))
      : 0;
    const firstEver = !hint && !feDone ? Q.firstEver : 0;   // 倍率も目減りもかけずに足す
    return { coin: coin + firstEver, base, decay, firstEver };
  };
  // クリアボーナス（クリアのときだけ呼ぶ）。decayAvg はその回の国の目減りの平均
  const clearBonus = ({ kind, mode, hint, n, firstTry, wrongs, attempts, decayAvg = 1 }) => {
    const K = TUNING.clear, Q = TUNING.quiz;
    if (!has(Q.modeMul, mode)) return 0;
    const x = kind === 'practice' ? (firstTry * 2 >= n ? K.practiceHalf * n + (wrongs === 0 ? K.practicePerfect * n : 0) : 0)
      : kind === 'challenge' ? K.challenge * n + (attempts === 1 ? K.challengeNoMiss * n : 0)
      : kind === 'ta' ? K.ta * n : 0;
    return Math.round(x * Q.modeMul[mode] * (hint ? Q.hintMul : 1) * decayAvg) || 0;
  };

  // 仲間カードを足す（設計書 §6.3「同じ国が出たとき」）。refund は引いた★の額を coins と earned に足す
  const addCard = (d, a, star) => {
    const c = d.cards[a];
    if (!c) { d.cards[a] = [star, 0]; return 'new'; }
    if (star > c[0]) { d.cards[a] = [star, c[1]]; return 'up'; }
    if (c[1] < TUNING.card.stackMax) { d.cards[a] = [c[0], c[1] + 1]; return 'stack'; }
    const r = TUNING.gacha.refund[star];
    d.coins = Math.min(BIG, d.coins + r);
    d.earned = Math.min(BIG, d.earned + r);
    return 'refund';
  };

  // 差額だけ払う。paid は [[sid, 払った額], …]。払った額は減らさない。新しい配列で、その sid を最後に移して最新20件（sanitize と同じ）
  const settleDelta = (paid, sid, total) => {
    const ps = list(paid), hit = ps.filter(p => p[0] === sid).pop(), so = hit ? hit[1] : 0;
    const next = ps.filter(p => p[0] !== sid).map(p => [p[0], p[1]]);
    next.push([sid, Math.max(so, total)]);
    return { delta: Math.max(0, total - so), paid: next.slice(-20) };
  };

  // ---- 1回のゲーム（run）。JSON にできる値だけ ----
  // base: 開始時の写し（以後変えない）／game: そのゲーム全体の数（消さない）／pend: まだ d に書いていない記録（受け取りのたびに空にする）
  const row0 = () => ({ n: 0, coins: 0 });
  const pend0 = () => ({ fr: {}, mb: {}, fe: {}, wk: {}, lc: {}, n: {}, ov: {}, bounty: {} });   // n は day.n の足し分
  const newRun = ({ sid, kind, mode, region, n, hint }, d) => ({
    sid: String(sid), kind, mode, region, n, hint: !!hint,   // paid の [sid, 額] は文字列の sid だけ残る（sanitize）ので、文字列にそろえる
    base: {
      day: { n: { ...d.day.n } }, fe: { ...d.fe }, ov: { ...d.ov }, wk: { ...d.wk },
      bounty: { d: d.bounty.d, a: [...d.bounty.a], done: [...d.bounty.done] }, earned: d.earned,
    },
    // fr re fe ov bounty: 1か国1回の印（re はやり直しの +3）、wk: このゲームで付けた(1)/外した(0)印、
    // cnt: 国ごとのコインをもらった回数、dec: 国ごとの最初の正解の decay、coins: クイズのコインの合計、rc: レシートの内訳
    game: {
      fr: {}, re: {}, fe: {}, ov: {}, bounty: {}, wk: {}, cnt: {}, dec: {}, coins: 0,
      rc: { first: row0(), retry: row0(), ta: row0(), fe: row0(), clear: 0, daily: 0, free: false, zeroed: false,
            overcome: [], bounty: [], bountyAll: false, joined: [], promoted: [] },
    },
    pend: pend0(),
  });

  // 1問ぶんの記録。run.game と run.pend だけを書きかえる。kind:'battle' はコイン0で記録だけ
  const runAnswer = (run, { a, right, first, hint, mode, missesBefore, missesAfter }) => {
    const { base: b, game: g, pend: p } = run, rc = g.rc, bit = has(MODE_BIT, mode) ? MODE_BIT[mode] : 0;
    // 答える前の苦手（開始時の印に、このゲームで付けた/外した印を重ねる）
    const mBefore = Math.max(0, +missesBefore || 0), weak = mBefore > 0 || !!(has(g.wk, a) ? g.wk[a] : b.wk[a]);
    // 答えたあとの misses。無い（undefined・null・数でない）ときは「ミスなし」ではなく「変化なし」
    const mAfter = missesAfter == null || Number.isNaN(+missesAfter) ? mBefore : Math.max(0, +missesAfter);
    const r = answerCoins({
      kind: run.kind, mode, right, first, hint, weak,
      nth: (b.day.n[a] || 0) + (g.cnt[a] || 0) + 1,
      retryUsed: !!g.re[a], feDone: !!((b.fe[a] | g.fe[a]) & bit),
    });
    if (r.base > 0) {
      g.cnt[a] = (g.cnt[a] || 0) + 1;
      p.n[a] = (p.n[a] || 0) + 1;
      const row = run.kind === 'ta' ? rc.ta : first ? rc.first : rc.retry;
      row.n++;
      row.coins += r.coin - r.firstEver;
      if (run.kind === 'practice' && !first) g.re[a] = 1;
    }
    if (r.firstEver > 0) {
      g.fe[a] = (g.fe[a] | 0) | bit;
      p.fe[a] = (p.fe[a] | 0) | bit;
      rc.fe.n++;
      rc.fe.coins += r.firstEver;
    }
    g.coins += r.coin;
    if (right) {
      p.lc[a] = 1;
      if (!has(g.dec, a)) g.dec[a] = r.decay;
      if (!hint) {
        if (!g.fr[a]) g.fr[a] = p.fr[a] = 1;
        if (bit) p.mb[a] = (p.mb[a] | 0) | bit;
      }
    } else g.wk[a] = p.wk[a] = 1;
    if (right && first && !hint) {
      g.wk[a] = p.wk[a] = 0;
      // 克服: 答える前は苦手で、misses が0になった。1か国一生に1回
      if (weak && mAfter === 0 && !b.ov[a] && !g.ov[a]) g.ov[a] = p.ov[a] = 1;
      if (b.bounty.a.includes(a) && !b.bounty.done.includes(a) && !g.bounty[a]) g.bounty[a] = p.bounty[a] = 1;
    }
    return { coin: r.coin, decay: r.decay, firstEver: r.firstEver };
  };

  // レシート。内訳と sum はそのゲーム全体（途中の受け取りの分もふくむ）、delta は今回 d.coins に足した額
  const receiptOf = (rc, delta) => {
    const T = TUNING, row = r => ({ n: r.n, coins: rc.zeroed ? 0 : r.coins });
    const rows = { first: row(rc.first), retry: row(rc.retry), ta: row(rc.ta), fe: row(rc.fe) };
    const sum = Object.values(rows).reduce((s, r) => s + r.coins, 0) + rc.clear + rc.daily
      + rc.overcome.length * T.overcome + rc.bounty.length * T.bounty + (rc.bountyAll ? T.bountyAll : 0);
    return {
      sum, delta, ...rows, clear: rc.clear, daily: rc.daily, free: rc.free, zeroed: rc.zeroed,
      overcome: [...rc.overcome], bounty: [...rc.bounty], bountyAll: rc.bountyAll, joined: [...rc.joined], promoted: [...rc.promoted],
    };
  };

  // run.pend を d に書いて空にし、レシートを返す。res は drill:result の detail か null（途中の受け取り・バトル）。
  // 何回呼んでも同じ記録・同じコインが二重にならない
  const settleRun = (d, run, res, todayStr) => {
    const T = TUNING, g = run.game, p = run.pend, rc = g.rc, quiz = run.kind !== 'battle';
    const clear = quiz && !!res && res.outcome === 'clear';
    // タイムアタックのクリアが速すぎたら、その回のコインは全部0（一度0になったら、あとの受け取りでも0）
    rc.zeroed = rc.zeroed || (clear && run.kind === 'ta' && !(+res.timeMs >= res.n * T.quiz.taMinMsPerQ));
    const zeroed = rc.zeroed;
    // 学習の記録（0になった回も書く）
    for (const a of Object.keys(p.fr)) d.fr[a] = Math.min(T.card.frMax, (d.fr[a] || 0) + 1);
    for (const [a, bits] of Object.entries(p.mb)) d.mb[a] = (d.mb[a] | 0) | bits;
    for (const [a, on] of Object.entries(p.wk)) if (on) d.wk[a] = 1; else delete d.wk[a];
    for (const a of Object.keys(p.lc)) d.lc[a] = dayNum(todayStr);
    // なかよし度が frJoin になった国は★1で仲間に。★1 でなかよし度 frMax・4モード全部で正解したら★2に
    const joined = [], promoted = [];
    for (const a of Object.keys(p.fr)) if (!d.cards[a] && d.fr[a] >= T.card.frJoin) { addCard(d, a, 1); joined.push(a); }
    for (const a of uniq([...Object.keys(p.fr), ...Object.keys(p.mb)])) {
      if (d.cards[a]?.[0] === 1 && d.fr[a] >= T.card.frMax && (d.mb[a] & QUIZ_BITS) === QUIZ_BITS) { addCard(d, a, 2); promoted.push(a); }
    }
    // 払った印とコイン（0になった回は書かない・払わない）
    let delta = 0, daily = 0, all = false;
    const ov = [], bo = [];
    if (!zeroed) {
      for (const [a, bits] of Object.entries(p.fe)) d.fe[a] = (d.fe[a] | 0) | bits;
      for (const [a, k] of Object.entries(p.n)) d.day.n[a] = (d.day.n[a] || 0) + k;
    }
    if (quiz) {
      const dec = Object.values(g.dec), decayAvg = dec.length ? dec.reduce((s, x) => s + x, 0) / dec.length : 1;
      if (clear && !zeroed) rc.clear = clearBonus({ ...res, kind: run.kind, mode: run.mode, hint: run.hint, decayAvg });
      const s = settleDelta(d.paid, run.sid, zeroed ? 0 : g.coins + (clear ? rc.clear : 0));
      d.paid = s.paid;
      delta += s.delta;
      if (clear && !zeroed && res.n >= T.clear.dailyMinN && !d.day.first) { daily = T.daily; d.day.first = true; }
    }
    if (!zeroed) {
      for (const a of Object.keys(p.ov)) if (!d.ov[a]) { d.ov[a] = 1; d.st.overcome = Math.min(BIG, d.st.overcome + 1); ov.push(a); }
      // 手配書は今の d.bounty にあってまだ達成していない国だけ（ゲームの途中で日付が変わって選び直されても二重にならない）
      const B = d.bounty;
      for (const a of Object.keys(p.bounty)) if (B.a.includes(a) && !B.done.includes(a)) { B.done.push(a); bo.push(a); }
      all = bo.length > 0 && B.a.length === BOUNTY_N && B.a.every(a => B.done.includes(a));
      if (all) d.st.bountyDays = Math.min(BIG, d.st.bountyDays + 1);
    }
    delta += daily + ov.length * T.overcome + bo.length * T.bounty + (all ? T.bountyAll : 0);
    d.coins = Math.min(BIG, d.coins + delta);
    d.earned = Math.min(BIG, d.earned + delta);
    run.pend = pend0();
    rc.daily += daily;
    rc.free = rc.free || daily > 0;
    rc.overcome.push(...ov);
    rc.bounty.push(...bo);
    rc.bountyAll = rc.bountyAll || all;
    rc.joined.push(...joined);
    rc.promoted.push(...promoted);
    return receiptOf(rc, delta);
  };

  // ---- 今日の分と手配書 ----
  // 今日の手配書: 1. 苦手で misses がいちばん多い国 2. なかよし1以上で、最後の正解から7日以上たった国のうちいちばん前の国
  // 3. まだ一度も正解していない国。足りなければなかよし度の低い国で埋める。同点はどれも rng で選ぶ。全部ちがう国
  const bountyFor = (d, m, todayStr, rng) => {
    const out = [], now = dayNum(todayStr), codes = C.map(c => c.a), miss = a => Math.max(0, +(m || {})[a] || 0);
    const pick = (ok, score) => {
      const xs = codes.filter(a => !out.includes(a) && ok(a));
      if (!xs.length) return;
      const best = Math.max(...xs.map(score)), ties = xs.filter(a => score(a) === best);
      out.push(ties[Math.floor(rng() * ties.length)]);
    };
    pick(a => isWeak(d, m, a), miss);
    pick(a => d.fr[a] >= 1 && now - d.lc[a] >= REVIEW_DAYS, a => -d.lc[a]);
    pick(a => !d.fr[a] && !d.mb[a] && !d.lc[a], () => 0);
    if (out.length < BOUNTY_N) {
      codes.filter(a => !out.includes(a)).map(a => [d.fr[a] || 0, rng(), a])
        .sort((x, y) => x[0] - y[0] || x[1] - y[1]).slice(0, BOUNTY_N - out.length).forEach(x => out.push(x[2]));
    }
    return out;
  };
  // 日付が変わったら day を空にし、手配書が今日のものでなければ選び直す。変えたら true
  const ensureDay = (d, m, todayStr, rng) => {
    let changed = false;
    if (d.day.d !== todayStr) { d.day = fresh(todayStr).day; changed = true; }
    if (d.bounty.d !== todayStr) { d.bounty = { d: todayStr, a: bountyFor(d, m, todayStr, rng), done: [] }; changed = true; }
    return changed;
  };
  // 設定の「記録を消す」（drill:misses-reset）で苦手の印も全部消す
  const resetWeak = d => { d.wk = {}; };

  // ---- 国旗ガチャ（設計書 §6.3） ----
  // region は 'all' か地域名、count は 1 か 10 だけ（それ以外と空の地域は []）。d.pity d.pulls を書きかえ、addCard を呼ぶ。
  // コインは引かない（呼ぶ側が引く）。Cs は国の一覧（index.html の C）
  const pull = (d, region, count, rng, Cs) => {
    const T = TUNING.gacha, pool = list(Cs).filter(c => region === 'all' || c.r === region), out = [];
    if (!pool.length || (count !== 1 && count !== 10)) return out;
    for (let i = 0; i < count; i++) {
      const r = rng();
      const star = d.pity >= T.pity - 1 ? 3
        : count === 10 && i === 9 ? (r < T.r3 ? 3 : 2)
        : r < T.r3 ? 3 : r < T.r3 + T.r2 ? 2 : 1;
      d.pity = star === 3 ? 0 : d.pity + 1;
      d.pulls = Math.min(BIG, d.pulls + 1);
      const c = pool[Math.floor(rng() * pool.length)];
      out.push({ a: c.a, star, out: addCard(d, c.a, star) });   // 'new' | 'up' | 'stack' | 'refund'
    }
    return out;
  };
  // ガチャの値段。地域をしぼると regionMul 倍（全世界はそのまま）。count は 1 か 10
  const gachaCost = (region, count) => {
    const T = TUNING.gacha, base = count === 10 ? T.ten : T.one;
    return region === 'all' ? base : Math.round(base * T.regionMul);
  };
  // 画面に出す確率（%の数）。eff3 は天井込みの★3の率 = 100 / ★3 1枚あたりの平均回数（Σ_{k<天井} (1−r3)^k）
  const pct = x => Math.round(x * 1e4) / 100;
  const gachaRates = () => {
    const T = TUNING.gacha;
    let per = 0;
    for (let k = 0; k < T.pity; k++) per += (1 - T.r3) ** k;
    return { r3: pct(T.r3), r2: pct(T.r2), r1: pct(1 - T.r3 - T.r2), tenR3: pct(T.r3), tenR2: pct(1 - T.r3), pity: T.pity, eff3: 100 / per };
  };

  // ---- バトルの出題（設計書 §7.3・§7.4） ----
  const codesOf = region => C.filter(c => region === 'all' || c.r === region).map(c => c.a);
  // そのダンジョンで出す国。テーマがあればテーマの国、無ければ地域の国
  const poolOf = dg => dg.t ? [...THEMES[dg.t].a] : codesOf(dg.r);
  const missOf = (m, a) => Math.max(0, +(m || {})[a] || 0);
  // rng でシャッフルした新しい配列
  const shuffled = (xs, rng) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // その階の形式の順。F1〜F2 は f2n と n2f の交互、F3〜F4 とボス（5）は f2n → n2f → m2f。
  // 宇宙（ch 3）は場所が多め: どの階も m2f → f2n → m2f → n2f
  const SPACE_CYCLE = ['m2f', 'f2n', 'm2f', 'n2f'];
  const modeCycle = (floor, ch) => ch === 3 ? [...SPACE_CYCLE] : floor <= 2 ? ['f2n', 'n2f'] : ['f2n', 'n2f', 'm2f'];
  // 通常フロアの番号（1〜4）。範囲外（ボスの 5・0・数でない）は最後のフロア（4）に丸める
  const normalFloor = floor => Number.isInteger(floor) && floor >= 1 && floor <= 4 ? floor : 4;
  // その階の順で次の、ちがう形式。その階に無い形式（cap など）の次は先頭の f2n。宇宙は m2f の次は f2n、ほかの次は m2f
  const nextMode = (mode, floor, ch) => {
    if (ch === 3) return mode === 'm2f' ? 'f2n' : 'm2f';
    const cy = modeCycle(floor); return cy[(cy.indexOf(mode) + 1) % cy.length];
  };

  // 通常フロアの国の袋: その階の国（シャッフル）→ 階の外の苦手な国を misses の多い順 → wk がある順に最大 weakMax 個
  // （苦手が無ければなかよし度の低い順。同点は乱数）→ 今日の手配書でまだ達成していない地域の国（袋に無ければ足す）。
  // 形式は袋の位置で modeCycle の順。手配書の国には tag:'wanted'
  const battleBag = (d, m, id, floor, rng) => {
    const dg = dungeonOf(id);
    if (!dg) return [];
    floor = normalFloor(floor);
    const here = floorsOf(dg)[floor - 1] || [], codes = poolOf(dg), fr = d.fr || {}, wk = d.wk || {};
    const bag = shuffled(here, rng), away = shuffled(codes.filter(a => !here.includes(a)), rng);
    const weak = away.filter(a => isWeak(d, m, a)).sort((x, y) => missOf(m, y) - missOf(m, x) || !!wk[y] - !!wk[x]);
    const pick = weak.length ? weak : [...away].sort((x, y) => (fr[x] || 0) - (fr[y] || 0));
    bag.push(...pick.slice(0, TUNING.battle.weakMax));
    const b = d.bounty || {}, done = list(b.done), wanted = list(b.a).filter(a => !done.includes(a) && codes.includes(a));
    for (const a of wanted) if (!bag.includes(a)) bag.push(a);
    const cy = modeCycle(floor, dg.ch);
    return bag.map((a, i) => ({ a, mode: cy[i % cy.length], tag: wanted.includes(a) ? 'wanted' : null }));
  };
  // 袋が空になったら、その階の国をもう一度（シャッフル）、前と別の形式で。lastMode は {国コード: 前に出した形式}
  const refillBag = (id, floor, lastMode, rng) => {
    const dg = dungeonOf(id), last = lastMode || {};
    if (!dg) return [];
    floor = normalFloor(floor);
    return shuffled(floorsOf(dg)[floor - 1] || [], rng).map(a => ({ a, mode: nextMode(last[a] ?? 'f2n', floor, dg.ch), tag: null }));
  };
  // ボスの旗（flags 枚）: 地域の国を misses の多い順 → wk あり → なかよし度の低い順 → 乱数で並べ、苦手な国を上から
  // floor(枚数 × bossWeakPct) 個まで。残りは苦手でない国から乱数で選び、足りなければ苦手な国の続きで埋める
  const bossFlags = (d, m, id, rng) => {
    const dg = dungeonOf(id);
    if (!dg) return [];
    const fr = d.fr || {}, wk = d.wk || {}, n = dg.flags, cap = Math.floor(n * TUNING.battle.bossWeakPct);
    const mixed = shuffled(poolOf(dg), rng);
    const weak = mixed.filter(a => isWeak(d, m, a))
      .sort((x, y) => missOf(m, y) - missOf(m, x) || !!wk[y] - !!wk[x] || (fr[x] || 0) - (fr[y] || 0));
    const out = weak.slice(0, cap);
    out.push(...mixed.filter(a => !isWeak(d, m, a)).slice(0, n - out.length));
    out.push(...weak.slice(cap, cap + n - out.length));
    return out;
  };
  // 鏡の地球の4択: 正解 a を含む4つ。入れる国の優先は ①似た旗の同じ組 ②同じ細かい地域（13グループ） ③同じ地域 ④全部（各段はシャッフル）
  // SIMILAR は daily-core.js のもの。呼ぶたびに読む（無くても②から動く）
  const similarChoices = (a, rng) => {
    const sim = globalThis.DAILY_CORE?.SIMILAR || [], g = groupOf(a), r = REGION.get(a);
    const tiers = [
      sim.filter(set => set.includes(a)).flat().filter(x => REGION.has(x)),   // 知らない国コードは落とす
      C.filter(c => g && groupOf(c.a) === g).map(c => c.a),
      C.filter(c => c.r === r).map(c => c.a),
      C.map(c => c.a),
    ];
    const out = [];
    for (const t of tiers) {
      for (const x of shuffled(t, rng)) if (out.length < 3 && x !== a && !out.includes(x)) out.push(x);
    }
    return shuffled([a, ...out], rng);
  };
  // 宇宙の4択: 正解 a を含む4つ。テーマの国から3つ、足りなければ全部の国から（各段はシャッフル）
  const themeChoices = (a, dg, rng) => {
    const out = [];
    for (const t of [poolOf(dg), C.map(c => c.a)]) {
      for (const x of shuffled(t, rng)) if (out.length < 3 && x !== a && !out.includes(x)) out.push(x);
    }
    return shuffled([a, ...out], rng);
  };
  // ボスの k 問目（0から。同じ旗のもう1問もふくむ）の形式。出題は国旗・国名・場所だけ（首都は問題に出さない）
  const bossMode = (k, ch) => { const cy = modeCycle(5, ch); return cy[k % cy.length]; };

  globalThis.RPG_CORE = {
    TUNING, BIG, DUNGEONS, CHAPTERS, STORY_IDS, THEMES, chapterOf, dungeonsOf, REGION_DUNGEONS, MONSTERS, AVATARS, MODE_BIT, dungeonOf, owned,
    levelCost, maxLevelUp, heroStats,
    stageOf, recLv, enemy, firstClearTotal,
    battleReward, damage,
    cardAtk, inDungeon, party, battleStats, GROUPS, groupOf, teamBonus, teamParty, slotCost, buySlot,
    hitsNeeded, missesAllowed, judge,
    floorsOf, poolOf,
    today, dayNum, shortCoins,
    VERSION, MIGRATE, fresh, sanitize, migrate,
    encodeCode, decodeCode, sanitizeMisses,
    isWeak, answerCoins, clearBonus, addCard, settleDelta,
    newRun, runAnswer, settleRun,
    ensureDay, bountyFor, resetWeak,
    pull, gachaRates, gachaCost,
    modeCycle, nextMode, battleBag, refillBag, bossFlags, bossMode, similarChoices, themeChoices,
  };
})();
