(() => {
  'use strict';
  // 国旗クエスト（RPG）の計算部品。DOM・localStorage・Date.now() は使わない（日付と乱数は引数で受け取る）
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
  const C = globalThis.COUNTRIES || [];
  const REGION = new Map(C.map(c => [c.a, c.r]));

  // 数値はすべてここ。ほかのファイルに倍率・値段・確率・時間を直接書かない
  const TUNING = {
    hero: { hp0: 30, hpLv: 6, atk0: 8, atkLv: 2, maxLv: 50 },
    levelBase: 100, levelStep: 30,
    quiz: { base: 10, retry: 3, ta: 5, modeMul: { f2n: 1, n2f: 1, m2f: 1.2, f2m: 1.2 }, hintMul: 0.6, weakMul: 2,
            decay: [[3, 1], [6, 0.5], [Infinity, 0.2]], firstEver: 20, taMinMsPerQ: 400 },
    clear: { practiceHalf: 2, practicePerfect: 3, challenge: 5, challengeNoMiss: 5, ta: 3, dailyMinN: 5 },
    daily: 100, start: 1000, overcome: 30, bounty: 30, bountyAll: 100, badge: 50,
    battle: { winBase: 10, winPerStage: 2, firstMul: 3, bossFirst: 200, losePerRight: 2, comboStep: 0.1, comboMax: 5,
              critRate: 0.1, critMul: 1.5, enemyHits: 5, enemyHitPct: 0.3, bossHitPct: 0.25, recStep: 1.2,
              autoNextMs: 650, guardMs: 250, gaugeMax: 5, gaugeStep: 0.05, weakMax: 2, bossWeakPct: 0.7, reviveMax: 3 },
    card: { base: [0, 1, 3, 6], stack: 0.2, fr: 0.03, regionMul: 1.5, hpMul: 3, frJoin: 5, frMax: 10, stackMax: 4 },
    gacha: { r3: 0.03, r2: 0.17, pity: 50, one: 100, ten: 1000, refund: [0, 10, 30, 100], flipMs: 120 },
    share: { url: 'https://chikokunn1011.github.io/country-drill/', tag: '#195か国ドリル', cards: [50, 100, 195] },
  };

  // 国の数が少ない地域から順に開く。r は S.region と同じ日本語名（全世界は 'all'）。英字 id と日本語名の変換はここだけ
  const DUNGEONS = [
    { id: 'samerica', r: '南アメリカ', name: 'アマゾンの密林', plate: 'PLATE 01 · SOUTH AMERICA', color: '#6fa86a', flags: 6, land: '南アメリカ' },
    { id: 'oceania', r: 'オセアニア', name: 'サンゴ礁の海', plate: 'PLATE 02 · OCEANIA', color: '#4fa3c7', flags: 7, land: 'オセアニア' },
    { id: 'namerica', r: '北・中央アメリカ', name: '大峡谷', plate: 'PLATE 03 · N.&C. AMERICA', color: '#d29a4a', flags: 8, land: '北・中央アメリカ' },
    { id: 'europe', r: 'ヨーロッパ', name: '古城の迷宮', plate: 'PLATE 04 · EUROPE', color: '#a77bab', flags: 9, land: 'ヨーロッパ' },
    { id: 'asia', r: 'アジア', name: '天空の山脈', plate: 'PLATE 05 · ASIA', color: '#d0705a', flags: 9, land: 'アジア' },
    { id: 'africa', r: 'アフリカ', name: 'サバンナの大地', plate: 'PLATE 06 · AFRICA', color: '#c4a02a', flags: 10, land: 'アフリカ' },
    { id: 'world', r: 'all', name: '地図喰いの巣', plate: 'PLATE 07 · WORLD', color: '#5b6b73', flags: 12, land: '世界' },
  ];
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
  const AVATARS = ['🧙', '🧝', '🦸', '🤠', '🦊', '🐱', '🐶', '🐧'];
  // mb（ヒントなしで正解したモード）のビット
  const MODE_BIT = { f2n: 1, n2f: 2, m2f: 4, f2m: 8, cap: 16 };
  const dungeonOf = id => DUNGEONS.find(d => d.id === id);

  // ---- 旅人とレベル（ステータスはセーブせず、Lv から毎回計算する） ----
  // Lv L → L+1 の費用。上限の Lv から先は Infinity
  const levelCost = L => L >= TUNING.hero.maxLv ? Infinity : TUNING.levelBase + TUNING.levelStep * (L - 1);
  // coins で上げられるところまで上げたときの Lv と、かかるコインの合計
  const maxLevelUp = (lv, coins) => {
    let to = lv, cost = 0;
    while (cost + levelCost(to) <= coins) cost += levelCost(to++);
    return { to, cost };
  };
  const heroStats = lv => {
    const H = TUNING.hero;
    return { hp: H.hp0 + H.hpLv * lv, atk: H.atk0 + H.atkLv * lv };
  };

  // ---- 敵の強さ（式だけ。フロアごとの数字は手で書かない） ----
  // ステージ番号 1〜35。floor は 1〜4 が通常、5 がボス
  const stageOf = (id, floor) => 5 * DUNGEONS.findIndex(d => d.id === id) + floor;
  const recLv = s => 1 + Math.floor((s - 1) * TUNING.battle.recStep);
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
      .map(([a, card]) => ({ a, star: card[0], atk: cardAtk(card, fr[a], !!dg && (dg.r === 'all' || REGION.get(a) === dg.r)) }))
      .sort((x, y) => y.atk - x.atk || y.star - x.star || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
      .slice(0, 3).map(({ a, atk }) => ({ a, atk }));
  };
  // 旅人 ＋ 仲間3枚 ×（1 + 0.05 × がんばりゲージ）。ゲージはフロアごと（'samerica:1' の形）
  const battleStats = (d, id, floor) => {
    const h = heroStats(d.lv), p = party(d, id), sum = p.reduce((s, c) => s + c.atk, 0);
    const gauge = (d.gauge || {})[id + ':' + floor] || 0, mul = 1 + TUNING.battle.gaugeStep * gauge;
    return {
      atk: Math.round((h.atk + Math.round(sum)) * mul),
      hp: Math.round((h.hp + Math.round(TUNING.card.hpMul * sum)) * mul),
      party: p, gauge,
    };
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
  // 地域の国を面積の大きい順に並べて4等分した国コード（F1〜F4）。region は 'all' か地域名
  const floorsOf = region => {
    const list = C.filter(c => region === 'all' || c.r === region).sort((x, y) => y.ar - x.ar), n = list.length;
    return [0, 1, 2, 3].map(i => list.slice(Math.round(n * i / 4), Math.round(n * (i + 1) / 4)).map(c => c.a));
  };
  // 首都→国名（cap）を出してよい国。国名と首都が「同じ」「片方がもう片方をふくむ」「先頭2文字が同じ」なら答えのヒントになるので出さない
  const capOK = c => !(c.n === c.c || c.n.includes(c.c) || c.c.includes(c.n) || c.n.slice(0, 2) === c.c.slice(0, 2));

  // ---- 日付とコインの表示 ----
  const pad = n => String(n).padStart(2, '0');
  // 端末の日付（'YYYY-MM-DD'）
  const today = now => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // 'YYYY-MM-DD' の通し日数（整数）。日の差を数えるのに使う
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  // 1万未満はそのまま（9,999）、1万から「1.2万」（小数1桁で切り捨て、.0 は付けない）
  const shortCoins = n => n < 10000 ? n.toLocaleString('ja-JP') : `${Math.floor(n / 1000) / 10}万`;

  globalThis.RPG_CORE = {
    TUNING, DUNGEONS, MONSTERS, AVATARS, MODE_BIT, dungeonOf,
    levelCost, maxLevelUp, heroStats,
    stageOf, recLv, enemy, firstClearTotal,
    battleReward, damage,
    cardAtk, party, battleStats,
    hitsNeeded, missesAllowed, judge,
    floorsOf, capOK,
    today, dayNum, shortCoins,
  };
})();
