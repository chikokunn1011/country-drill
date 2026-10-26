// rpg-core.js（国旗クエストの計算部品）の単体テスト。countries.js と一緒に vm で読み込み、globalThis.RPG_CORE を使う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, plain, loadCtx, loadCore, dWith } from './rpg_load.mjs';

const IDS = ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world'];
const REGIONS = ['南アメリカ', 'オセアニア', '北・中央アメリカ', 'ヨーロッパ', 'アジア', 'アフリカ'];
const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} ≈ ${y}`);

test('iife_wrapped', () => {
  const src = read('rpg-core.js').trim();
  assert.ok(src.startsWith('(() => {'), '先頭が (() => {');
  assert.ok(src.endsWith('})();'), '最後が })();');
  const { ctx, before } = loadCtx(), after = Object.keys(ctx);
  assert.deepEqual(after.filter(k => !before.includes(k)), ['RPG_CORE']);
  assert.deepEqual(before.filter(k => !after.includes(k)), []);
});

test('tuning_and_tables', () => {
  const K = loadCore();
  const { TUNING, DUNGEONS, MONSTERS, AVATARS } = K;
  assert.equal(TUNING.levelStep, 30);
  assert.deepEqual(plain(TUNING.gacha), { r3: 0.03, r2: 0.17, pity: 50, one: 100, ten: 1000, refund: [0, 10, 30, 100], flipMs: 120 });
  // 形と値をまるごと固定する（キーの名前は以後のタスクが使う）。JSON にすると Infinity は null になるので別に見る
  assert.deepEqual(plain(TUNING), plain({
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
  }));
  assert.equal(TUNING.quiz.decay[2][0], Infinity);

  assert.deepEqual(plain(DUNGEONS.map(d => d.id)), IDS);
  assert.deepEqual(plain(DUNGEONS.map(d => d.flags)), [6, 7, 8, 9, 9, 10, 12]);
  assert.deepEqual(plain(DUNGEONS), [
    { id: 'samerica', r: '南アメリカ', name: 'アマゾンの密林', plate: 'PLATE 01 · SOUTH AMERICA', color: '#6fa86a', flags: 6, land: '南アメリカ' },
    { id: 'oceania', r: 'オセアニア', name: 'サンゴ礁の海', plate: 'PLATE 02 · OCEANIA', color: '#4fa3c7', flags: 7, land: 'オセアニア' },
    { id: 'namerica', r: '北・中央アメリカ', name: '大峡谷', plate: 'PLATE 03 · N.&C. AMERICA', color: '#d29a4a', flags: 8, land: '北・中央アメリカ' },
    { id: 'europe', r: 'ヨーロッパ', name: '古城の迷宮', plate: 'PLATE 04 · EUROPE', color: '#a77bab', flags: 9, land: 'ヨーロッパ' },
    { id: 'asia', r: 'アジア', name: '天空の山脈', plate: 'PLATE 05 · ASIA', color: '#d0705a', flags: 9, land: 'アジア' },
    { id: 'africa', r: 'アフリカ', name: 'サバンナの大地', plate: 'PLATE 06 · AFRICA', color: '#c4a02a', flags: 10, land: 'アフリカ' },
    { id: 'world', r: 'all', name: '地図喰いの巣', plate: 'PLATE 07 · WORLD', color: '#5b6b73', flags: 12, land: '世界' },
  ]);
  assert.equal(K.dungeonOf('world').r, 'all');
  assert.equal(K.dungeonOf('europe').name, '古城の迷宮');
  assert.equal(K.dungeonOf('mars'), undefined);

  assert.deepEqual(plain(Object.keys(MONSTERS)), IDS);
  for (const id of IDS) assert.equal(MONSTERS[id].length, 5, id);
  assert.deepEqual(plain(MONSTERS.europe[3]), { e: '🕷️', n: '古城の大グモ' });
  assert.deepEqual(plain(MONSTERS.samerica[0]), { e: '🦜', n: 'おしゃべりオウム' });
  assert.equal(MONSTERS.samerica[4].n, 'ジャガー王');
  assert.equal(MONSTERS.world[4].e, '👾');
  assert.equal(AVATARS.length, 8);
  assert.deepEqual(plain(AVATARS), ['🧙', '🧝', '🦸', '🤠', '🦊', '🐱', '🐶', '🐧']);
  assert.deepEqual(plain(K.MODE_BIT), { f2n: 1, n2f: 2, m2f: 4, f2m: 8, cap: 16 });
});

test('level_cost', () => {
  const K = loadCore();
  assert.equal(K.levelCost(1), 100);
  assert.equal(K.levelCost(10), 370);
  assert.equal(K.levelCost(40), 1270);
  assert.equal(K.levelCost(49), 1540);
  assert.equal(K.levelCost(50), Infinity);
  // Lv1 から Lv L になるまでの累計
  const total = L => { let s = 0; for (let i = 1; i < L; i++) s += K.levelCost(i); return s; };
  for (const [L, sum] of [[5, 580], [11, 2350], [17, 5200], [23, 9130], [29, 14140], [35, 20230], [41, 27400], [50, 40180]]) {
    assert.equal(total(L), sum, `Lv${L}`);
  }
  assert.deepEqual(plain(K.maxLevelUp(1, 579)), { to: 4, cost: 390 });
  assert.deepEqual(plain(K.maxLevelUp(1, 580)), { to: 5, cost: 580 });
  assert.deepEqual(plain(K.maxLevelUp(1, 1000)), { to: 6, cost: 800 });
  assert.deepEqual(plain(K.maxLevelUp(1, 99)), { to: 1, cost: 0 });
  assert.deepEqual(plain(K.maxLevelUp(50, 1e9)), { to: 50, cost: 0 });
  assert.deepEqual(plain(K.maxLevelUp(1, 1e9)), { to: 50, cost: 40180 });
});

test('hero_stats', () => {
  const K = loadCore();
  assert.deepEqual(plain(K.heroStats(1)), { hp: 36, atk: 10 });
  assert.deepEqual(plain(K.heroStats(41)), { hp: 276, atk: 90 });
});

test('enemy_table', () => {
  const K = loadCore();
  // 設計書 §7.2 の表: [F1 推奨Lv/HP/攻撃, F4 推奨Lv/HP/攻撃, ボス 推奨Lv/旗/1枚のHP/攻撃]
  const T = {
    samerica: [[1, 50, 11], [4, 80, 17], [5, 6, 18, 15]],
    oceania: [[7, 110, 22], [10, 140, 27], [11, 7, 30, 24]],
    namerica: [[13, 170, 33], [16, 200, 38], [17, 8, 42, 33]],
    europe: [[19, 230, 44], [22, 260, 49], [23, 9, 54, 42]],
    asia: [[25, 290, 54], [28, 320, 60], [29, 9, 66, 51]],
    africa: [[31, 350, 65], [34, 380, 71], [35, 10, 78, 60]],
    world: [[37, 410, 76], [40, 440, 81], [41, 12, 90, 69]],
  };
  IDS.forEach((id, i) => {
    const [f1, f4, b] = T[id];
    assert.deepEqual(plain(K.enemy(id, 1)), { boss: false, s: 5 * i + 1, recLv: f1[0], hp: f1[1], atk: f1[2] }, `${id} F1`);
    assert.deepEqual(plain(K.enemy(id, 4)), { boss: false, s: 5 * i + 4, recLv: f4[0], hp: f4[1], atk: f4[2] }, `${id} F4`);
    assert.deepEqual(plain(K.enemy(id, 5)), { boss: true, s: 5 * i + 5, recLv: b[0], flags: b[1], flagHp: b[2], atk: b[3] }, `${id} ボス`);
  });
  assert.equal(K.stageOf('samerica', 1), 1);
  assert.equal(K.stageOf('world', 5), 35);
  assert.equal(K.recLv(1), 1);
  assert.equal(K.recLv(35), 41);
  const totals = IDS.map(id => K.firstClearTotal(id));
  assert.deepEqual(totals, [440, 590, 740, 890, 1040, 1190, 1340]);
  assert.equal(totals.reduce((s, x) => s + x, 0), 6230);
});

test('battle_reward_and_damage', () => {
  const K = loadCore();
  assert.equal(K.battleReward(1, { win: true, first: false }), 12);
  assert.equal(K.battleReward(1, { win: true, first: true }), 36);
  assert.equal(K.battleReward(5, { win: true, first: true, boss: true }), 260);
  assert.equal(K.battleReward(35, { win: true, first: false, boss: true }), 80);
  assert.equal(K.battleReward(1, { win: false, rights: 2 }), 4);
  assert.equal(K.battleReward(1, { win: false, rights: 10 }), 6); // 勝ったときの 10+2s の半分まで
  assert.equal(K.battleReward(2, { win: false, rights: 10 }), 7); // 14 の半分
  assert.equal(K.battleReward(1, { win: false, rights: 0 }), 0);
  assert.equal(K.damage(10, 0, false), 10);
  assert.equal(K.damage(10, 4, false), 14);
  assert.equal(K.damage(10, 9, false), 15); // コンボは5まで
  assert.equal(K.damage(10, 0, true), 15);
});

test('floors_split', () => {
  const { ctx } = loadCtx(), K = ctx.RPG_CORE, C = ctx.COUNTRIES;
  const sizes = {
    南アメリカ: [3, 3, 3, 3], オセアニア: [4, 3, 4, 3], '北・中央アメリカ': [6, 6, 5, 6],
    ヨーロッパ: [12, 11, 12, 11], アジア: [12, 11, 12, 11], アフリカ: [14, 13, 14, 13], all: [49, 49, 48, 49],
  };
  for (const r of [...REGIONS, 'all']) {
    const fl = plain(K.floorsOf(r));
    assert.equal(fl.length, 4, r);
    assert.deepEqual(fl.map(f => f.length), sizes[r], r);
    // 4つを合わせると重なりなくその地域の全部
    const flat = fl.flat(), want = plain(C.filter(c => r === 'all' || c.r === r).map(c => c.a)).sort();
    assert.equal(new Set(flat).size, flat.length, `${r} 重なり`);
    assert.deepEqual([...flat].sort(), want, r);
  }
  assert.deepEqual(plain(K.floorsOf('南アメリカ')[0]), ['br', 'ar', 'pe']);
  assert.deepEqual(plain(K.floorsOf('南アメリカ')[3]), ['gy', 'uy', 'sr']);
  assert.deepEqual(plain(K.floorsOf('オセアニア')[3]), ['mh', 'tv', 'nr']);
  assert.deepEqual(plain(K.floorsOf('ヨーロッパ')[3].slice(-5)), ['mt', 'li', 'sm', 'mc', 'va']);
});

test('cap_ok', () => {
  const { ctx } = loadCtx(), K = ctx.RPG_CORE, C = ctx.COUNTRIES;
  assert.deepEqual(plain(C.filter(c => !K.capOK(c)).map(c => c.a).sort()),
    ['ad', 'br', 'dj', 'dz', 'gt', 'gw', 'kw', 'lk', 'lu', 'mc', 'mx', 'pa', 'sg', 'sm', 'st', 'tn', 'va']);
});

test('card_and_party', () => {
  const K = loadCore();
  near(K.cardAtk([1, 0], 5, true), 1.725);
  near(K.cardAtk([2, 2], 10, true), 8.19);
  near(K.cardAtk([3, 4], 10, true), 21.06);
  near(K.cardAtk([1, 0], 0, false), 1);
  const d = dWith(K, { cards: { br: [1, 0], cl: [1, 0], jp: [3, 0], fr: [2, 0] }, fr: {} });
  // jp(6) fr(3) の次は br と cl（1.5 で同点・★同じ）→ 国コード順で br
  const sa = plain(K.party(d, 'samerica'));
  assert.deepEqual(sa.map(p => p.a), ['jp', 'fr', 'br']);
  sa.forEach((p, i) => near(p.atk, [6, 3, 1.5][i]));
  // 地図喰いの巣は全部のカードに地域ボーナス
  const wo = plain(K.party(d, 'world'));
  assert.deepEqual(wo.map(p => p.a), ['jp', 'fr', 'br']);
  wo.forEach((p, i) => near(p.atk, [9, 4.5, 1.5][i]));
  const eu = plain(K.party(d, 'europe'));
  assert.deepEqual(eu.map(p => p.a), ['jp', 'fr', 'br']);
  eu.forEach((p, i) => near(p.atk, [6, 4.5, 1][i]));
  assert.deepEqual(plain(K.party(dWith(K), 'samerica')), []);
});

test('battle_stats', () => {
  const K = loadCore();
  assert.deepEqual(plain(K.battleStats(dWith(K), 'samerica', 1)), { atk: 10, hp: 36, party: [], gauge: 0 });
  // round((10+round(Σ))×1.1)、round((36+round(3Σ))×1.1)
  const g = K.battleStats(dWith(K, { gauge: { 'samerica:1': 2 } }), 'samerica', 1);
  assert.deepEqual(plain({ atk: g.atk, hp: g.hp, gauge: g.gauge }), { atk: 11, hp: 40, gauge: 2 });
  // ゲージはフロアごと
  assert.equal(K.battleStats(dWith(K, { gauge: { 'samerica:1': 2 } }), 'samerica', 2).atk, 10);
  // ★1・なかよし5・地域ボーナスの3枚: Σ = 3×1.725 = 5.175 → こうげき 10+5、HP 36+round(15.525)
  const c = K.battleStats(dWith(K, { cards: { br: [1, 0], ar: [1, 0], pe: [1, 0] }, fr: { br: 5, ar: 5, pe: 5 } }), 'samerica', 1);
  assert.deepEqual(plain({ atk: c.atk, hp: c.hp }), { atk: 15, hp: 52 });
  assert.deepEqual(plain(c.party.map(p => p.a)), ['ar', 'br', 'pe']);
});

test('judge_rules', () => {
  const K = loadCore();
  const at = (lv, f) => { const st = K.battleStats(dWith(K, { lv }), 'samerica', f), en = K.enemy('samerica', f); return [K.hitsNeeded(st, en), K.missesAllowed(st, en), K.judge(st, en)]; };
  assert.deepEqual(at(1, 1), [5, 3, 'ok']);
  assert.deepEqual(at(5, 1), [3, 5, 'easy']);
  assert.deepEqual(at(5, 5), [6, 3, 'ok']);
  // ボスは flags × ceil(flagHp / atk)（コンボは数えない）。atk10 < 旗18 → 1枚2回
  const [hits, , j] = at(1, 5);
  assert.equal(hits, 12);
  assert.equal(j, 'hard');
});

test('dates_and_coins', () => {
  const K = loadCore();
  assert.equal(K.today(new Date(2026, 9, 26, 23, 59)), '2026-10-26');
  assert.equal(K.today(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
  const n = K.dayNum('2026-10-26');
  assert.ok(Number.isInteger(n));
  assert.equal(n - K.dayNum('2026-10-19'), 7);
  assert.equal(K.dayNum('2026-03-01') - K.dayNum('2026-02-28'), 1);
  assert.equal(K.shortCoins(0), '0');
  assert.equal(K.shortCoins(9999), '9,999');
  assert.equal(K.shortCoins(10000), '1万');
  assert.equal(K.shortCoins(12345), '1.2万');
  assert.equal(K.shortCoins(19999), '1.9万');
  assert.equal(K.shortCoins(123456), '12.3万');
});
