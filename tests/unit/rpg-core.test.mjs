// rpg-core.js（国旗クエストの計算部品）の単体テスト。countries.js と一緒に vm で読み込み、globalThis.RPG_CORE を使う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T0, read, plain, loadCtx, loadCore, dWith, mulberry32 } from './rpg_load.mjs';

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

// ---- セーブの形・移行・掃除・引き継ぎコード ----
const FRESH = {
  v: 1, intro: false, show: true, coins: 0, earned: 0, lv: 1, av: 0,
  cards: {}, fr: {}, mb: {}, fe: {}, wk: {}, lc: {}, ov: {}, floors: {}, gauge: {},
  pity: 0, pulls: 0,
  day: { d: T0, n: {}, first: false, free: false },
  bounty: { d: '', a: [], done: [] },
  paid: [],
  st: { win: 0, lose: 0, flee: 0, revive: 0, combo: 0, nodmg: 0, bossWins: 0, overcome: 0, bountyDays: 0 },
  badgesPaid: [], gr: '',
};
// テスト側で作る引き継ぎコード（実装の base64url とは別に Node の Buffer で作る）
const enc = obj => 'CQ1.' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

test('fresh_shape', () => {
  const K = loadCore(), f = plain(K.fresh(T0));
  for (const k of 'v intro show coins earned lv av cards fr mb fe wk lc ov floors gauge pity pulls day bounty paid st badgesPaid gr'.split(' ')) {
    assert.ok(k in f, k);
  }
  assert.equal(f.v, 1);
  assert.equal(f.show, true);
  assert.equal(f.lv, 1);
  assert.deepEqual(Object.keys(f.st).sort(), ['bossWins', 'bountyDays', 'combo', 'flee', 'lose', 'nodmg', 'overcome', 'revive', 'win']);
  assert.ok(Object.values(f.st).every(x => x === 0));
  assert.deepEqual(f, FRESH);
  assert.equal(K.VERSION, 1);
  assert.deepEqual(plain(K.MIGRATE), {});
  // 呼ぶたびに別のオブジェクト（片方を書きかえても、もう片方は変わらない）
  const a = K.fresh(T0), b = K.fresh(T0);
  a.cards.cl = [1, 0]; a.st.win = 3; a.day.n.cl = 1; a.paid.push(['x', 1]);
  assert.deepEqual(plain(b), FRESH);
});

test('migrate_cases', () => {
  const K = loadCore();
  const m = (raw, opts) => { const r = opts ? K.migrate(raw, T0, opts) : K.migrate(raw, T0); return { d: plain(r.d), readOnly: r.readOnly, backup: r.backup }; };
  assert.deepEqual(m(null), { d: FRESH, readOnly: false, backup: false });
  for (const raw of [[], 'x', 5]) assert.deepEqual(m(raw), { d: FRESH, readOnly: false, backup: true }, JSON.stringify(raw));
  // v だけ消えた → v1 とみなして救う
  let r = m({ coins: 500 });
  assert.equal(r.d.coins, 500);
  assert.equal(r.d.v, 1);
  assert.equal(r.readOnly, false);
  assert.equal(r.backup, true);
  for (const raw of [{ v: 0 }, { v: 1.5 }, { v: '1' }]) assert.deepEqual(m(raw), { d: FRESH, readOnly: false, backup: true }, JSON.stringify(raw));
  // 新しい版のデータ → 読むだけ
  r = m({ v: 99, coins: 7 });
  assert.equal(r.readOnly, true);
  assert.equal(r.backup, false);
  assert.equal(r.d.coins, 7);
  assert.equal(r.d.v, 99);
  r = m({ v: 1, coins: 50 });
  assert.deepEqual([r.readOnly, r.backup, r.d.coins, r.d.v], [false, false, 50, 1]);
  // 移行の抜け
  const s1 = { 1: d => ({ ...d, v: 2, x: 1 }) };
  assert.deepEqual(m({ v: 1 }, { version: 3, steps: s1 }), { d: FRESH, readOnly: false, backup: true });
  r = m({ v: 1, coins: 9 }, { version: 3, steps: { ...s1, 2: d => ({ ...d, v: 3 }) } });
  assert.equal(r.d.x, 1);
  assert.equal(r.d.v, 3);
  assert.equal(r.d.coins, 9);
  assert.deepEqual([r.readOnly, r.backup], [false, false]);
  // v が消えたデータも v1 から移行を通す
  r = m({ coins: 5 }, { version: 2, steps: { 1: d => ({ ...d, v: 2, y: 1 }) } });
  assert.deepEqual([r.d.v, r.d.y, r.d.coins, r.backup], [2, 1, 5, true]);
  // v を進めない移行は止まらないので壊れた扱い
  assert.deepEqual(m({ v: 1 }, { version: 2, steps: { 1: d => d } }), { d: FRESH, readOnly: false, backup: true });
});

test('sanitize_garbage', () => {
  const K = loadCore();
  for (const x of [null, [], 'str', 42, {}, undefined, true]) {
    let d;
    assert.doesNotThrow(() => { d = K.sanitize(x, T0); }, String(x));
    assert.deepEqual(plain(d), plain(K.fresh(T0)), String(x));
  }
  // 項目の型がちがっても例外を出さない
  const junk = { cards: 'x', fr: 5, mb: null, day: [], bounty: 'x', paid: {}, st: [], badgesPaid: 'x', floors: [1], gauge: true };
  assert.deepEqual(plain(K.sanitize(junk, T0)), FRESH);
});

test('sanitize_numbers', () => {
  const K = loadCore(), s = x => plain(K.sanitize(x, T0));
  for (const [v, want] of [[1e12, 1e9], [-5, 0], [NaN, 0], ['12', 12], [3.7, 4], [Infinity, 0], ['x', 0]]) {
    assert.equal(s({ coins: v }).coins, want, `coins ${v}`);
  }
  assert.equal(s({ earned: 1e12 }).earned, 1e9);
  assert.equal(s({ pulls: -1 }).pulls, 0);
  assert.equal(s({ lv: 0 }).lv, 1);
  assert.equal(s({ lv: 99 }).lv, 50);
  assert.equal(s({ lv: NaN }).lv, 1);
  assert.equal(s({ av: 9 }).av, 7);
  assert.equal(s({ pity: 60 }).pity, 49);
  assert.deepEqual(s({ fr: { cl: 12 } }).fr, { cl: 10 });
  assert.deepEqual(s({ floors: { samerica: 9, mars: 2 } }).floors, { samerica: 5 });
  assert.deepEqual(s({ gauge: { 'oceania:3': 2, 'oceania:9': 1, 'x:1': 1, 'asia:2': 8 } }).gauge, { 'oceania:3': 2, 'asia:2': 5 });
  assert.deepEqual(s({ mb: { cl: 40 } }).mb, { cl: 31 });
  assert.deepEqual(s({ fe: { cl: 20 } }).fe, { cl: 15 });
  assert.deepEqual(s({ lc: { cl: 20387.4, br: 2e6, jp: 'x' } }).lc, { cl: 20387, br: 1e6 });
  assert.deepEqual(s({ wk: { ki: 1, cl: 'yes', br: 0, zz: 1 } }).wk, { ki: 1, cl: 1 });
  assert.deepEqual(s({ ov: { ki: true, jp: false } }).ov, { ki: 1 });
  const st = s({ st: { win: -3, combo: '7', nodmg: 2e9, zz: 5 } }).st;
  assert.deepEqual(st, { ...FRESH.st, win: 0, combo: 7, nodmg: 1e9 });
});

test('sanitize_keys', () => {
  const K = loadCore(), s = x => plain(K.sanitize(x, T0));
  const d = K.sanitize(JSON.parse('{"fr":{"__proto__":{"x":1},"cl":2,"zz":3}}'), T0);
  assert.deepEqual(plain(Object.keys(d.fr)), ['cl']);
  assert.equal(d.fr.x, undefined);
  assert.equal(d.fr.cl, 2);
  // 最上位の "__proto__" も写さない（プロトタイプが変わらない）
  const top = K.sanitize(JSON.parse('{"__proto__":{"coins":5,"y":1},"lv":3}'), T0);
  assert.equal(top.lv, 3);
  assert.equal(top.coins, 0);
  assert.equal(top.y, undefined);
  assert.ok(!Object.keys(top).includes('__proto__'));
  assert.deepEqual(s({ cards: { cl: [2, 1], br: [4, 0], ar: [1], pe: 'x', jp: [3, 4], uy: [1, 5], zz: [1, 0], de: [0, 0], fr: [1.5, 0], it: [1, 0, 0], es: ['1', '0'] } }).cards,
    { cl: [2, 1], jp: [3, 4] });
  assert.deepEqual(s({ cards: [[2, 1]] }).cards, {});
  assert.deepEqual(s({ fr: [] }).fr, {});
  assert.deepEqual(s({ fr: 'x' }).fr, {});
  assert.deepEqual(s({ paid: 'x' }).paid, []);
});

test('sanitize_lists', () => {
  const K = loadCore(), s = x => plain(K.sanitize(x, T0));
  const valid = Array.from({ length: 22 }, (_, i) => ['s' + i, i * 10]);
  const paid = [['a', 5], ['b', -1], ...valid.slice(0, 10), [3, 4], 'x', ['c', 1.5], ['d', '5'], ['e', 1, 2], ...valid.slice(10)];
  assert.deepEqual(s({ paid }).paid, valid.slice(2));
  assert.deepEqual(s({ paid: [['a', 5], ['b', -1], [3, 4], 'x', ['z', 0]] }).paid, [['a', 5], ['z', 0]]);
  assert.deepEqual(s({ badgesPaid: ['a', 3, null, 'b'] }).badgesPaid, ['a', 'b']);
  assert.deepEqual(s({ bounty: { d: T0, a: ['cl', 'zz', 'br', 'jp', 'fr'], done: ['cl', 'qq'] } }).bounty, { d: T0, a: ['cl', 'br', 'jp'], done: ['cl'] });
  assert.deepEqual(s({ bounty: { d: 5, a: 'cl', done: null } }).bounty, { d: '', a: [], done: [] });
});

test('sanitize_day', () => {
  const K = loadCore(), s = x => plain(K.sanitize(x, T0));
  assert.deepEqual(s({ day: { d: '2020-01-01', n: { cl: 3 }, first: true, free: true } }).day, { d: T0, n: {}, first: false, free: false });
  assert.deepEqual(s({ day: { d: T0, n: { cl: 3 }, first: true, free: true } }).day, { d: T0, n: { cl: 3 }, first: true, free: true });
  // n は国コードと 0..1e6 の整数だけ
  assert.deepEqual(s({ day: { d: T0, n: { cl: 3, zz: 1, br: 2e6, jp: -2, de: 1.4, it: 'x' }, first: 'yes', free: 1 } }).day,
    { d: T0, n: { cl: 3, br: 1e6, jp: 0, de: 1 }, first: false, free: false });
  assert.deepEqual(s({ day: 'x' }).day, FRESH.day);
});

test('sanitize_flags', () => {
  const K = loadCore(), s = x => plain(K.sanitize(x, T0));
  assert.equal(s({ intro: 'yes' }).intro, false);
  assert.equal(s({ intro: true }).intro, true);
  assert.equal(s({ show: false }).show, false);
  assert.equal(s({ show: 'no' }).show, true);
  assert.equal(s({ gr: '火星' }).gr, '');
  assert.equal(s({ gr: 5 }).gr, '');
  assert.equal(s({ gr: 'アジア' }).gr, 'アジア');
  assert.equal(s({ gr: 'all' }).gr, 'all');
  // 知らない最上位の項目は残す（新しい版から戻ったときに消さない）
  const d = s({ future: { x: 1 }, 日本: '語', coins: 3 });
  assert.deepEqual(d.future, { x: 1 });
  assert.equal(d.日本, '語');
  assert.deepEqual(d, { ...FRESH, coins: 3, future: { x: 1 }, 日本: '語' });
  // v は1以上の整数ならそのまま
  assert.equal(s({ v: 99 }).v, 99);
  assert.equal(s({ v: 0 }).v, 1);
  assert.equal(s({ v: '2' }).v, 1);
});

test('code_roundtrip', () => {
  const K = loadCore();
  const d = K.sanitize({ coins: 1234, lv: 12, cards: { cl: [2, 1] }, 日本: '語' }, T0), m = { cl: 2, br: 1 };
  const code = K.encodeCode(d, m);
  assert.match(code, /^CQ1\.[A-Za-z0-9_-]+$/);
  // 中身は標準の base64url（Node の Buffer でも読める）
  assert.deepEqual(JSON.parse(Buffer.from(code.slice(4), 'base64url').toString('utf8')), { rpg: plain(d), m });
  const check = r => {
    assert.equal(r.ok, true);
    assert.deepEqual(plain(r.rpg), plain(d));
    assert.equal(r.rpg.日本, '語');
    assert.deepEqual(plain(r.m), m);
    assert.equal(r.hasM, true);
  };
  check(K.decodeCode(code, T0));
  check(K.decodeCode(`  \n${code.slice(0, 10)} \n\t ${code.slice(10, 30)}\r\n${code.slice(30)}\n　`, T0));
});

test('code_rejects', () => {
  const K = loadCore(), F = plain(K.fresh(T0));
  const no = (s, why) => assert.deepEqual(plain(K.decodeCode(s, T0)), { ok: false }, why);
  const body = K.encodeCode(K.fresh(T0), {}).slice(4);
  no('abc', 'abc');
  no('CQ1.', '中身なし');
  no('CQ1.!!!', 'base64url でない');
  no('CQ2.' + body, 'CQ2');
  no('CQ1.' + 'A'.repeat(100 * 1024), '100KB を超える');
  no(enc({ rpg: { ...F, pad: 'x'.repeat(80000) } }), '正しい中身でも 100KB を超える');
  no(enc([1, 2]), '配列');
  no(enc({ rpg: { ...F, v: 99 }, m: {} }), 'v 99');
  no(enc({ rpg: { ...F, v: 0 } }), 'v 0');
  no(enc({ rpg: null, m: {} }), 'rpg が null');
  no(enc({ m: {} }), 'rpg が無い');
  no(enc({ rpg: [] }), 'rpg が配列');
  no('CQ1.' + Buffer.from('not json').toString('base64url'), 'JSON でない');
  // JSON としては読めるが、文字列の中に UTF-8 でないバイトがある（読みかえずに断る）
  const badUtf8 = Buffer.concat([Buffer.from('{"rpg":{"v":1,"x":"'), Buffer.from([0xff, 0xfe]), Buffer.from('"}}')]);
  no('CQ1.' + badUtf8.toString('base64url'), 'UTF-8 でない');
  no('CQ1.A', 'base64 の長さがおかしい');
  no('CQ1.' + Buffer.from('{"rpg":{"v":1,"zz":' + '['.repeat(30000) + ']'.repeat(30000) + '}}').toString('base64url'), '入れ子が深すぎる');
  no(null, 'null');
  no(5, '数');
  // 100KB 以下の大きなコードは読める
  assert.equal(K.decodeCode(enc({ rpg: { ...F, pad: 'x'.repeat(60000) } }), T0).ok, true);
  // m が無いコード
  let r = K.decodeCode(enc({ rpg: { ...F, coins: 5 } }), T0);
  assert.deepEqual(plain(r), { ok: true, rpg: { ...F, coins: 5 }, m: {}, hasM: false });
  // m の掃除
  r = K.decodeCode(enc({ rpg: F, m: { zz: 3, cl: -1, br: '2', jp: 2.6 } }), T0);
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.m), { br: 2, jp: 3 });
  assert.equal(r.hasM, true);
  // コードの中のセーブも掃除する
  r = K.decodeCode(enc({ rpg: { ...F, coins: 1e12, fr: { cl: 99, zz: 1 } } }), T0);
  assert.deepEqual([r.ok, r.rpg.coins, plain(r.rpg.fr)], [true, 1e9, { cl: 10 }]);
});

test('sanitize_misses', () => {
  const K = loadCore();
  assert.deepEqual(plain(K.sanitizeMisses({ zz: 3, cl: -1, br: '2', jp: 2.6 })), { br: 2, jp: 3 });
  assert.deepEqual(plain(K.sanitizeMisses({ fr: 5000, de: 0, us: NaN, it: 'x', es: 1 })), { fr: 999, es: 1 });
  assert.deepEqual(plain(K.sanitizeMisses(JSON.parse('{"__proto__":{"cl":1},"br":1}'))), { br: 1 });
  for (const x of [null, [], 'x', 5, undefined]) assert.deepEqual(plain(K.sanitizeMisses(x)), {}, String(x));
});

// ---- クイズのコインと学習の記録（run と受け取り） ----
// countries.js の国コード全部と RPG_CORE
const setup = () => { const { ctx } = loadCtx(); return { K: ctx.RPG_CORE, codes: plain(ctx.COUNTRIES.map(c => c.a)) }; };
const all15 = codes => Object.fromEntries(codes.map(a => [a, 15]));
let SID = 0;
// 1回のゲームを流す。first はそのゲームで初めて出た国か（練習はまちがえた国を後でもう一度答える）。
// misses は m をクイズと同じく ±1 して書きかえる。最後に settleRun のレシートを返す
const play = (K, d, m, { kind = 'practice', mode = 'f2n', hint = false, n = 10 } = {}, answers = [], res = null) => {
  const run = K.newRun({ sid: `g${++SID}`, kind, mode, region: 'all', n, hint }, d), seen = new Set();
  for (const [a, right] of answers) {
    const missesBefore = Math.max(0, +m[a] || 0), missesAfter = right ? Math.max(0, missesBefore - 1) : missesBefore + 1;
    if (missesAfter) m[a] = missesAfter; else delete m[a];
    K.runAnswer(run, { a, right, first: !seen.has(a), hint, mode, missesBefore, missesAfter });
    seen.add(a);
  }
  return K.settleRun(d, run, res, T0);
};
// drill:result のクリアの detail（既定はパーフェクト・1回目でクリア）
const clearRes = (kind, n, o = {}) => ({ outcome: 'clear', kind, mode: 'f2n', n, firstTry: n, wrongs: 0, attempts: 1, timeMs: kind === 'ta' ? n * 1000 : null, ...o });
const right = as => as.map(a => [a, true]);
const pendEmpty = run => Object.values(plain(run.pend)).every(v => Object.keys(v).length === 0);

// 練習・f2n・一発正解・ヒントなし・苦手なし・今日1回目・はじめて正解は払い済み
const AC = { kind: 'practice', mode: 'f2n', right: true, first: true, hint: false, weak: false, nth: 1, retryUsed: false, feDone: true };

test('answer_coins_table', () => {
  const K = loadCore(), c = o => K.answerCoins({ ...AC, ...o }).coin;
  assert.equal(c({}), 10);
  assert.equal(c({ mode: 'n2f' }), 10);
  assert.equal(c({ mode: 'm2f' }), 12);
  assert.equal(c({ hint: true }), 6);
  assert.equal(c({ mode: 'f2m', hint: true }), 7);
  assert.equal(c({ weak: true }), 20);
  assert.equal(c({ weak: true, hint: true }), 6);
  assert.equal(c({ weak: true, first: false }), 3);           // 苦手の ×2 は一発正解だけ
  assert.equal(c({ first: false }), 3);                       // 練習のやり直し
  assert.equal(c({ first: false, retryUsed: true }), 0);
  assert.equal(c({ kind: 'challenge' }), 10);
  assert.equal(c({ kind: 'challenge', first: false }), 0);
  assert.equal(c({ kind: 'ta' }), 5);
  assert.equal(c({ kind: 'ta', mode: 'm2f' }), 6);
  assert.equal(c({ nth: 3 }), 10);
  assert.equal(c({ nth: 4 }), 5);
  assert.equal(c({ nth: 6 }), 5);
  assert.equal(c({ nth: 7 }), 2);
  assert.equal(c({ nth: 40 }), 2);
  assert.equal(c({ first: false, nth: 7 }), 1);               // base が1以上なら最低1
  assert.equal(c({ right: false }), 0);
  for (const kind of ['zzz', 'battle', 'constructor']) assert.equal(c({ kind }), 0, kind);
  for (const mode of ['cap', 'zzz', 'toString']) assert.equal(c({ mode }), 0, mode);
  assert.deepEqual(plain(K.answerCoins({ ...AC, nth: 4 })), { coin: 5, base: 10, decay: 0.5, firstEver: 0 });
  assert.deepEqual(plain(K.answerCoins({ ...AC, first: false, retryUsed: true })), { coin: 0, base: 0, decay: 1, firstEver: 0 });
  // はじめて正解: 倍率も目減りもかけずに足す。ヒントありでは無し
  assert.deepEqual(plain(K.answerCoins({ ...AC, feDone: false })), { coin: 30, base: 10, decay: 1, firstEver: 20 });
  assert.equal(c({ feDone: false, nth: 7 }), 22);
  assert.equal(c({ feDone: false, mode: 'm2f', weak: true }), 44);
  assert.equal(c({ feDone: false, hint: true }), 6);
  assert.equal(c({ feDone: false, right: false }), 0);
  assert.equal(c({ feDone: false, kind: 'battle' }), 0);
  assert.equal(c({ feDone: false, mode: 'cap' }), 0);
  // 挑戦のやり直しの正解は base 0 でも、そのモードで生まれてはじめての正解なら +20
  assert.equal(c({ feDone: false, kind: 'challenge', first: false }), 20);
});

const CB = { kind: 'practice', mode: 'f2n', hint: false, n: 10, firstTry: 10, wrongs: 0, attempts: 1, decayAvg: 1 };

test('clear_bonus_table', () => {
  const K = loadCore(), b = o => K.clearBonus({ ...CB, ...o });
  assert.equal(b({ firstTry: 8, wrongs: 2 }), 20);
  assert.equal(b({ firstTry: 5, wrongs: 5 }), 20);           // ちょうど半分
  assert.equal(b({ firstTry: 4, wrongs: 6 }), 0);
  assert.equal(b({}), 50);                                    // パーフェクト
  assert.equal(b({ kind: 'challenge' }), 100);
  assert.equal(b({ kind: 'challenge', attempts: 3, firstTry: 6, wrongs: 4 }), 50);
  assert.equal(b({ kind: 'ta' }), 30);
  assert.equal(b({ mode: 'm2f' }), 60);
  assert.equal(b({ hint: true }), 30);
  assert.equal(b({ firstTry: 8, wrongs: 2, hint: true }), 12);
  assert.equal(b({ decayAvg: .5 }), 25);
  assert.equal(b({ kind: 'zzz' }), 0);
  assert.equal(b({ kind: 'battle' }), 0);
  assert.equal(b({ mode: 'cap' }), 0);
});

test('example_table', () => {
  const { K, codes } = setup(), T = codes.slice(0, 10), save = () => dWith(K, { fe: all15(codes) });
  const net = r => r.sum - r.daily;
  // 設計書 §5.1 の例（はじめて正解ボーナスを除く）
  assert.equal(net(play(K, save(), {}, { n: 10 }, [[T[0], false], [T[1], false], ...right(T.slice(2)), [T[0], true], [T[1], true]],
    clearRes('practice', 10, { firstTry: 8, wrongs: 2 }))), 106);
  assert.equal(net(play(K, save(), {}, { n: 10 }, right(T), clearRes('practice', 10))), 150);
  assert.equal(net(play(K, save(), {}, { kind: 'challenge', n: 10 }, right(T), clearRes('challenge', 10))), 200);
  assert.equal(net(play(K, save(), {}, { kind: 'ta', n: 10 }, right(T), clearRes('ta', 10, { timeMs: 20000 }))), 80);
  const fail = clearRes('ta', 10, { outcome: 'fail', timeMs: 9000 });
  let r = play(K, save(), {}, { kind: 'ta', n: 10 }, [...right(T.slice(0, 6)), [T[6], false]], fail);
  assert.deepEqual([r.sum, r.daily, r.clear], [30, 0, 0]);
  r = play(K, save(), {}, { kind: 'ta', n: 10 }, [...right(T.slice(0, 5)), [T[5], false]], fail);
  assert.deepEqual([r.sum, r.daily, r.clear], [25, 0, 0]);
  assert.deepEqual(plain(r.ta), { n: 5, coins: 25 });
});

test('practice_8_2_receipt', () => {
  const { K, codes } = setup(), T = codes.slice(0, 10), [A, B] = T, d = dWith(K), m = {};
  const r = plain(play(K, d, m, { n: 10 }, [[A, false], [B, false], ...right(T.slice(2)), [A, true], [B, true]],
    { outcome: 'clear', kind: 'practice', mode: 'f2n', n: 10, firstTry: 8, wrongs: 2, attempts: 1, timeMs: null, sid: 'x' }));
  assert.deepEqual(r, {
    sum: 406, delta: 406,
    first: { n: 8, coins: 80 }, retry: { n: 2, coins: 6 }, ta: { n: 0, coins: 0 }, fe: { n: 10, coins: 200 },
    clear: 20, daily: 100, free: true, zeroed: false,
    overcome: [], bounty: [], bountyAll: false, joined: [], promoted: [],
  });
  assert.equal(d.coins, 406);
  assert.equal(d.earned, 406);
  assert.equal(d.day.first, true);
  assert.equal(d.day.free, false);   // 無料ガチャはまだ使っていない
  assert.equal(d.fr[A], 1);
  assert.equal(d.wk[A], 1);          // やり直しの正解では外れない
  assert.equal(d.wk[T[2]], undefined);
  assert.equal(d.fe[A], 1);
  assert.equal(d.mb[A], 1);
  assert.equal(d.lc[A], K.dayNum(T0));
  assert.equal(d.day.n[A], 1);       // まちがえた答えはコインの回数に数えない
  assert.equal(d.day.n[T[2]], 1);
  assert.deepEqual(m, {});
  assert.equal(plain(d.paid).length, 1);
  assert.equal(plain(d.paid)[0][1], 306);   // クイズの合計（今日はじめてのクリアは別）
});

test('daily_rules', () => {
  const { K, codes } = setup(), T = codes.slice(0, 5);
  const d = dWith(K);
  let r = play(K, d, {}, { n: 5 }, right(T), clearRes('practice', 5));
  assert.deepEqual([r.daily, r.free], [100, true]);
  r = play(K, d, {}, { n: 5 }, right(T), clearRes('practice', 5));   // 同じ日の2回目
  assert.deepEqual([r.daily, r.free], [0, false]);
  // 失格・やめた・4問では今日のクリアにならない
  for (const [o, n] of [[{ outcome: 'fail' }, 5], [{ outcome: 'quit' }, 5], [{}, 4]]) {
    const d2 = dWith(K);
    r = play(K, d2, {}, { n }, right(T.slice(0, n)), clearRes('practice', n, o));
    assert.deepEqual([r.daily, r.free, d2.day.first], [0, false, false], JSON.stringify([o, n]));
  }
  // タイムアタックが速すぎる（5問 × 400ms = 2000 未満）→ その回のコインは全部0。でも学習の記録は残る
  const dt = dWith(K);
  r = plain(play(K, dt, {}, { kind: 'ta', n: 5 }, right(T), clearRes('ta', 5, { timeMs: 1000 })));
  assert.equal(r.zeroed, true);
  assert.deepEqual([r.delta, r.daily, r.free, r.sum, r.clear], [0, 0, false, 0, 0]);
  assert.deepEqual([r.ta, r.fe], [{ n: 5, coins: 0 }, { n: 5, coins: 0 }]);
  assert.deepEqual([dt.coins, dt.earned, dt.day.first], [0, 0, false]);
  assert.deepEqual(plain(dt.fr), Object.fromEntries(T.map(a => [a, 1])));
  // ちょうど n × 400ms なら払う
  const dk = dWith(K);
  r = play(K, dk, {}, { kind: 'ta', n: 5 }, right(T), clearRes('ta', 5, { timeMs: 2000 }));
  assert.deepEqual([r.zeroed, r.ta.coins, r.clear, r.daily], [false, 25, 15, 100]);
});

test('zeroed_pays_nothing', () => {
  const { K, codes } = setup(), T = codes.slice(0, 5), [A, B] = T;
  const d = dWith(K, { wk: { [A]: 1 }, bounty: { d: T0, a: [B, 'jp', 'cl'], done: [] } });
  const run = K.newRun({ sid: 'z', kind: 'ta', mode: 'f2n', region: 'all', n: 5, hint: false }, d);
  for (const a of T) K.runAnswer(run, { a, right: true, first: true, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
  const r = plain(K.settleRun(d, run, clearRes('ta', 5, { timeMs: 100 }), T0));
  // 克服も手配書も払わず、払った印（fe・day.n・ov・bounty.done）も書かない
  assert.deepEqual([r.zeroed, r.delta, r.sum, r.overcome, r.bounty, r.bountyAll], [true, 0, 0, [], [], false]);
  assert.deepEqual([d.coins, d.earned, d.st.overcome], [0, 0, 0]);
  assert.deepEqual([plain(d.fe), plain(d.day.n), plain(d.ov), plain(d.bounty.done)], [{}, {}, {}, []]);
  // 学習の記録は書く（fr・mb・lc・wk）
  assert.deepEqual(plain(d.fr), Object.fromEntries(T.map(a => [a, 1])));
  assert.deepEqual(plain(d.mb), Object.fromEntries(T.map(a => [a, 1])));
  assert.equal(d.lc[A], K.dayNum(T0));
  assert.equal(d.wk[A], undefined);
  assert.ok(pendEmpty(run));
  // 0 になった回は、あとで結果なしの受け取りが来ても払わない
  const again = plain(K.settleRun(d, run, null, T0));
  assert.deepEqual([again.zeroed, again.delta, d.coins], [true, 0, 0]);
});

test('diff_pay', () => {
  const { K, codes } = setup(), T = codes.slice(0, 5), d = dWith(K);
  const run = K.newRun({ sid: 'dp', kind: 'practice', mode: 'f2n', region: 'all', n: 5, hint: false }, d);
  const ans = a => K.runAnswer(run, { a, right: true, first: true, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
  assert.deepEqual(plain(ans(T[0])), { coin: 30, decay: 1, firstEver: 20 });
  T.slice(1, 3).forEach(ans);
  let r = K.settleRun(d, run, null, T0);                       // 途中の受け取り（pagehide）
  assert.deepEqual([r.delta, r.sum, d.coins], [90, 90, 90]);   // 10×3 + はじめて 20×3
  assert.deepEqual(plain(d.paid), [['dp', 90]]);
  assert.ok(pendEmpty(run));
  T.slice(3).forEach(ans);
  const res = clearRes('practice', 5);
  r = K.settleRun(d, run, res, T0);
  assert.deepEqual([r.delta, r.sum, r.clear, r.daily, d.coins, d.earned], [185, 275, 25, 100, 275, 275]);   // 60 + クリア 25 + 今日 100
  r = K.settleRun(d, run, res, T0);                            // 同じ結果をもう一度
  assert.deepEqual([r.delta, r.sum, r.daily, d.coins], [0, 275, 100, 275]);
  r = K.settleRun(d, run, null, T0);                           // 結果のあとの pagehide（クリアボーナスの無い合計 150 < 払った 175）
  assert.deepEqual([r.delta, r.sum, d.coins], [0, 275, 275]);
  assert.deepEqual(plain(d.paid).at(-1), ['dp', 175]);
  // settleDelta
  assert.deepEqual(plain(K.settleDelta([['s', 175]], 's', 150)), { delta: 0, paid: [['s', 175]] });
  assert.deepEqual(plain(K.settleDelta([['s', 100], ['t', 5]], 's', 150)), { delta: 50, paid: [['t', 5], ['s', 150]] });
  assert.deepEqual(plain(K.settleDelta([], 'n', 7)), { delta: 7, paid: [['n', 7]] });
  const p0 = [['s', 1]];
  assert.notEqual(K.settleDelta(p0, 's', 5).paid, p0);         // 新しい配列
  assert.deepEqual(p0, [['s', 1]]);
  let paid = [];
  for (let i = 0; i < 21; i++) paid = K.settleDelta(paid, `x${i}`, 10).paid;
  assert.equal(paid.length, 20);
  assert.deepEqual(plain(paid[0]), ['x1', 10]);
});

test('mid_settle_no_double_count', () => {
  const K = loadCore(), d1 = dWith(K), d2 = dWith(K);
  const res = clearRes('practice', 3, { firstTry: 3 });
  const evs = [['cl', true], ['cl', false], ['br', true], ['jp', true]];   // [国, first]
  const go = (d, mid) => {
    const run = K.newRun({ sid: 'mid', kind: 'practice', mode: 'f2n', region: 'all', n: 3, hint: false }, d);
    const base = plain(run.base);
    evs.forEach(([a, first], i) => {
      K.runAnswer(run, { a, right: true, first, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
      if (mid && i === 0) {
        K.settleRun(d, run, null, T0);
        assert.ok(pendEmpty(run), '受け取りのあと pend は空');
        assert.equal(d.fr.cl, 1);
      }
      if (mid && i === 1) assert.equal(d.fr.cl, 1, '途中の受け取りのあとの2回目で増えない');
    });
    const r = plain(K.settleRun(d, run, res, T0));
    assert.deepEqual(plain(run.base), base, 'run.base は変えない');
    return r;
  };
  const r1 = go(d1, true), r2 = go(d2, false);
  for (const d of [d1, d2]) assert.deepEqual(plain(d.fr), { cl: 1, br: 1, jp: 1 });
  assert.deepEqual(plain(d1.day.n), plain(d2.day.n));
  assert.equal(d1.day.n.cl, 2);
  assert.equal(d1.coins, d2.coins);
  assert.equal(d1.coins, 30 + 3 + 30 + 30 + 15);   // 3問なので今日のクリアにはならない
  const { delta: x1, ...rest1 } = r1, { delta: x2, ...rest2 } = r2;
  assert.deepEqual(rest1, rest2);
  assert.notEqual(x1, x2);
  assert.equal(x1 + 30, x2);
});

test('run_is_plain_data', () => {
  const K = loadCore(), d = dWith(K, { wk: { cl: 1 }, fe: { cl: 1 }, day: { d: T0, n: { cl: 2 }, first: false, free: false } });
  const run = K.newRun({ sid: 'p', kind: 'practice', mode: 'f2n', region: 'アジア', n: 5, hint: false }, d);
  assert.deepEqual(plain(Object.keys(run)).sort(), ['base', 'game', 'hint', 'kind', 'mode', 'n', 'pend', 'region', 'sid']);
  assert.deepEqual(plain(run.base), { day: { n: { cl: 2 } }, fe: { cl: 1 }, ov: {}, wk: { cl: 1 }, bounty: { d: '', a: [], done: [] }, earned: 0 });
  // 開始時の写し: あとで d を書きかえても変わらない
  d.wk.br = 1; d.day.n.cl = 9; d.fe.br = 3;
  assert.deepEqual(plain(run.base.wk), { cl: 1 });
  assert.equal(run.base.day.n.cl, 2);
  // JSON にして戻しても同じように動く
  K.runAnswer(run, { a: 'br', right: true, first: true, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
  const copy = JSON.parse(JSON.stringify(run));
  assert.deepEqual(copy, plain(run));
  K.runAnswer(copy, { a: 'cl', right: true, first: true, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
  // cl: 苦手で一発正解 → ×2、今日3回目 → ×1、はじめて正解は払い済み
  assert.equal(K.settleRun(dWith(K), copy, null, T0).first.coins, 10 + 20);
});

test('decay_across_games', () => {
  const { K, codes } = setup(), d = dWith(K, { fe: all15(codes) });
  const one = () => play(K, d, {}, { n: 1 }, [['cl', true]]).first.coins;
  assert.deepEqual([one(), one(), one(), one()], [10, 10, 10, 5]);
  assert.equal(d.day.n.cl, 4);
  assert.equal(K.ensureDay(d, {}, '2026-10-27', mulberry32(1)), true);
  assert.deepEqual(plain(d.day.n), {});
  assert.equal(one(), 10);
  // 同じゲームの中でもらった回数も数える（今日2回 + このゲームの一発正解で3回目 → やり直しの正解は4回目で ×0.5）
  const d1 = dWith(K, { fe: all15(codes), day: { d: T0, n: { cl: 2 }, first: true, free: false } });
  const r1 = play(K, d1, {}, { n: 1 }, [['cl', true], ['cl', true]]);
  assert.deepEqual([r1.first.coins, r1.retry.coins, d1.day.n.cl], [10, 2, 4]);
  // クリアボーナスにはその回の国の目減りの平均をかける（4回目の国 ×0.5 と新しい国 ×1 → ×0.75）
  const d2 = dWith(K, { fe: all15(codes), day: { d: T0, n: { cl: 3 }, first: true, free: false } });
  const r = play(K, d2, {}, { n: 2 }, right(['cl', 'br']), clearRes('practice', 2));
  assert.deepEqual([r.first.coins, r.clear], [15, Math.round(10 * 0.75)]);
});

test('fr_once_per_game', () => {
  const K = loadCore(), d = dWith(K), m = {};
  play(K, d, m, {}, [['cl', false], ['cl', true], ['cl', true]]);   // 同じ国にやり直しで2回正解
  assert.equal(d.fr.cl, 1);
  play(K, d, m, { mode: 'm2f', hint: true }, [['cl', true]]);         // ヒントありは数えない
  assert.equal(d.fr.cl, 1);
  assert.equal(d.mb.cl, 1);                                           // ヒントありの正解は mb にも入れない
  play(K, d, m, { kind: 'battle', mode: 'cap', n: 0 }, [['cl', true], ['cl', true]]);
  assert.equal(d.fr.cl, 2);
  assert.equal(d.mb.cl, 1 | 16);
  // バトル: なかよし度は1回、コインは0、paid は使わない
  const db = dWith(K);
  const r = plain(play(K, db, {}, { kind: 'battle', mode: 'cap', n: 0 }, [['cl', true], ['cl', true]]));
  assert.deepEqual([db.fr.cl, db.mb.cl, r.sum, r.delta, db.coins, db.earned], [1, 16, 0, 0, 0, 0]);
  assert.deepEqual([plain(db.paid), plain(db.fe), plain(db.day.n)], [[], {}, {}]);
  // fr は 10 まで
  const d10 = dWith(K, { fr: { cl: 10 }, cards: { cl: [3, 0] } });
  play(K, d10, {}, {}, [['cl', true]]);
  assert.equal(d10.fr.cl, 10);
});

test('join_and_promote', () => {
  const K = loadCore();
  let d = dWith(K, { fr: { cl: 4 } }), r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual([r.joined, r.promoted], [['cl'], []]);
  assert.deepEqual(plain(d.cards.cl), [1, 0]);
  d = dWith(K, { fr: { cl: 3 } });
  r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual([r.joined, d.cards.cl], [[], undefined]);
  d = dWith(K, { cards: { cl: [1, 2] }, fr: { cl: 9 }, mb: { cl: 15 } });
  r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual([r.joined, r.promoted], [[], ['cl']]);
  assert.deepEqual(plain(d.cards.cl), [2, 2]);                         // かさねはそのまま
  d = dWith(K, { cards: { cl: [1, 0] }, fr: { cl: 9 }, mb: { cl: 7 } });
  r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual([r.promoted, plain(d.cards.cl), d.fr.cl], [[], [1, 0], 10]);
  // 最後のモード（f2m）で 15 がそろったら上がる
  d = dWith(K, { cards: { cl: [1, 0] }, fr: { cl: 9 }, mb: { cl: 7 } });
  r = plain(play(K, d, {}, { mode: 'f2m' }, [['cl', true]]));
  assert.deepEqual([r.promoted, plain(d.cards.cl)], [['cl'], [2, 0]]);
  // ★2 以上は上がらない
  d = dWith(K, { cards: { cl: [3, 0] }, fr: { cl: 9 }, mb: { cl: 15 } });
  r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual([r.promoted, plain(d.cards.cl)], [[], [3, 0]]);
});

test('overcome_rules', () => {
  const K = loadCore(), d = dWith(K), m = {};
  let r = plain(play(K, d, m, {}, [['cl', false], ['cl', true]]));   // 1ゲーム目: まちがえ → やり直しで正解
  assert.deepEqual(r.overcome, []);
  assert.deepEqual([d.wk.cl, m.cl], [1, undefined]);
  r = plain(play(K, d, m, {}, [['cl', true]]));                       // 2ゲーム目: 一発正解（misses 0・wk あり）
  assert.deepEqual(r.overcome, ['cl']);
  assert.equal(r.first.coins, 20);                                    // 苦手の ×2
  assert.equal(r.delta, 20 + 30);
  assert.deepEqual([d.ov.cl, d.wk.cl, d.st.overcome], [1, undefined, 1]);
  play(K, d, m, {}, [['cl', false]]);                                 // 3ゲーム目でまちがえ
  r = plain(play(K, d, m, {}, [['cl', true]]));                       // 次のゲームで一発正解 → もう払わない
  assert.deepEqual([r.overcome, d.st.overcome, d.wk.cl], [[], 1, undefined]);
  // misses 2 → 1 では克服しない（wk は外れる）。次のゲームで 1 → 0 → 克服
  m.br = 2;
  r = plain(play(K, d, m, {}, [['br', true]]));
  assert.deepEqual([r.overcome, m.br, d.wk.br, d.ov.br], [[], 1, undefined, undefined]);
  r = plain(play(K, d, m, {}, [['br', true]]));
  assert.deepEqual([r.overcome, m.br, d.ov.br, d.st.overcome], [['br'], undefined, 1, 2]);
  // ヒントありの一発正解では克服しない（wk も外れない）
  m.jp = 1; d.wk.jp = 1;
  r = plain(play(K, d, m, { mode: 'm2f', hint: true }, [['jp', true]]));
  assert.deepEqual([r.overcome, d.ov.jp, d.wk.jp], [[], undefined, 1]);
  // バトルでも克服する（コインは克服の分だけ）
  const db = dWith(K, { wk: { pe: 1 } });
  r = plain(play(K, db, {}, { kind: 'battle', mode: 'n2f', n: 0 }, [['pe', true], ['pe', true]]));
  assert.deepEqual([r.overcome, r.delta, db.coins, db.ov.pe], [['pe'], 30, 30, 1]);
});

test('fe_independent_of_battle', () => {
  const K = loadCore();
  const d = dWith(K, { mb: { cl: 1 }, fe: {} });
  const r = plain(play(K, d, {}, {}, [['cl', true]]));
  assert.deepEqual(r.fe, { n: 1, coins: 20 });
  assert.equal(d.fe.cl, 1);
  // バトルの正解は fe を立てない
  const db = dWith(K);
  play(K, db, {}, { kind: 'battle', mode: 'f2n', n: 0 }, [['cl', true]]);
  assert.deepEqual([plain(db.fe), db.mb.cl], [{}, 1]);
  // 同じゲームで同じ国・同じモードは1回だけ
  const d2 = dWith(K);
  const r2 = plain(play(K, d2, {}, {}, [['cl', true], ['cl', true]]));
  assert.deepEqual(r2.fe, { n: 1, coins: 20 });
});

test('bounty_progress', () => {
  const { K, codes } = setup(), m = {};
  const d = dWith(K, { fe: all15(codes), bounty: { d: T0, a: ['cl', 'br', 'jp'], done: [] } });
  let r = plain(play(K, d, m, {}, [['cl', true]]));
  assert.deepEqual([r.bounty, r.bountyAll, r.delta], [['cl'], false, 10 + 30]);
  assert.deepEqual(plain(d.bounty.done), ['cl']);
  r = plain(play(K, d, m, { mode: 'm2f', hint: true }, [['br', true]]));   // ヒントありは数えない
  assert.deepEqual([r.bounty, plain(d.bounty.done)], [[], ['cl']]);
  r = plain(play(K, d, m, {}, [['cl', true]]));                             // 達成済みはもう数えない
  assert.deepEqual([r.bounty, r.delta], [[], 10]);
  r = plain(play(K, d, m, {}, right(['br', 'jp'])));
  assert.deepEqual([r.bounty, r.bountyAll, r.delta], [['br', 'jp'], true, 20 + 60 + 100]);
  assert.equal(d.st.bountyDays, 1);
  r = plain(play(K, d, m, {}, right(['br', 'jp'])));                        // 全部そろったあとはもう払わない
  assert.deepEqual([r.bounty, r.bountyAll, d.st.bountyDays], [[], false, 1]);
  // やり直しの正解（first でない）では数えない
  const d2 = dWith(K, { fe: all15(codes), bounty: { d: T0, a: ['cl', 'br', 'jp'], done: [] } });
  r = plain(play(K, d2, {}, {}, [['cl', false], ['cl', true]]));
  assert.deepEqual([r.bounty, plain(d2.bounty.done)], [[], []]);
  // ゲームの途中で日付が変わり手配書が選び直された → 今の手配書に無い国は払わない
  const d3 = dWith(K, { fe: all15(codes), bounty: { d: T0, a: ['cl', 'br', 'jp'], done: [] } });
  const run = K.newRun({ sid: 'b3', kind: 'practice', mode: 'f2n', region: 'all', n: 5, hint: false }, d3);
  K.runAnswer(run, { a: 'cl', right: true, first: true, hint: false, mode: 'f2n', missesBefore: 0, missesAfter: 0 });
  d3.bounty = { d: '2026-10-27', a: ['us', 'ca', 'mx'], done: [] };
  r = plain(K.settleRun(d3, run, null, T0));
  assert.deepEqual([r.bounty, r.delta, plain(d3.bounty.done)], [[], 10, []]);
  // 3件そろっていない手配書では全部の +100 は出ない
  const d4 = dWith(K, { fe: all15(codes), bounty: { d: T0, a: ['cl'], done: [] } });
  r = plain(play(K, d4, {}, {}, [['cl', true]]));
  assert.deepEqual([r.bounty, r.bountyAll, d4.st.bountyDays], [['cl'], false, 0]);
});

test('ensure_day_and_bounty', () => {
  const { K, codes } = setup(), T1 = '2026-10-27';
  const mk = () => dWith(K, { day: { d: T0, n: { cl: 3 }, first: true, free: true }, fr: { cl: 2 }, lc: { cl: K.dayNum(T0) - 10 }, bounty: { d: T0, a: ['us'], done: ['us'] } });
  const m = { br: 3, jp: 1 };
  const d = mk();
  assert.equal(K.ensureDay(d, m, T0, mulberry32(1)), false);          // 同じ日は何もしない
  assert.deepEqual(plain(d.bounty), { d: T0, a: ['us'], done: ['us'] });
  assert.equal(K.ensureDay(d, m, T1, mulberry32(1)), true);
  assert.deepEqual(plain(d.day), { d: T1, n: {}, first: false, free: false });
  const a = plain(d.bounty.a);
  assert.equal(d.bounty.d, T1);
  assert.deepEqual(plain(d.bounty.done), []);
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.ok(a.every(x => codes.includes(x)));
  assert.equal(a[0], 'br');                                           // 苦手のうち misses がいちばん多い
  assert.equal(a[1], 'cl');                                           // なかよし1以上で7日以上前
  assert.ok(!d.fr[a[2]] && !d.mb[a[2]] && !d.lc[a[2]]);              // まだ一度も正解していない
  const snap = plain(d);
  assert.equal(K.ensureDay(d, m, T1, mulberry32(9)), false);
  assert.deepEqual(plain(d), snap);
  // 同じ乱数なら同じ結果
  const e = mk();
  K.ensureDay(e, m, T1, mulberry32(1));
  assert.deepEqual(plain(e.bounty), plain(d.bounty));
  // 日付は同じでも手配書がまだなら選ぶ
  const f = dWith(K);
  assert.equal(K.ensureDay(f, {}, T0, mulberry32(2)), true);
  assert.equal(f.bounty.d, T0);
  assert.equal(plain(f.bounty.a).length, 3);
});

test('bounty_fill', () => {
  const { K, codes } = setup(), now = K.dayNum(T0);
  // 苦手なし・最近正解した国ばかり・全部の国を正解済み → なかよし度の低い3か国で埋める
  const low = ['cl', 'br', 'jp'];
  const d = dWith(K, {
    fr: Object.fromEntries(codes.map(a => [a, low.includes(a) ? 1 : 5])),
    lc: Object.fromEntries(codes.map(a => [a, now])),
  });
  assert.deepEqual(plain(K.bountyFor(d, {}, T0, mulberry32(3))).sort(), [...low].sort());
  // 苦手な国が7日以上前の国でもある → 2つ目は別の国。足りない分は埋める
  const d2 = dWith(K, {
    fr: Object.fromEntries(codes.map(a => [a, 5])), lc: Object.fromEntries(codes.map(a => [a, now])), wk: { cl: 1 },
  });
  d2.lc.cl = now - 30;
  const b = plain(K.bountyFor(d2, {}, T0, mulberry32(4)));
  assert.equal(b[0], 'cl');
  assert.equal(new Set(b).size, 3);
  // 苦手の同点は乱数で決まる（乱数が同じなら同じ）
  const d3 = dWith(K, { wk: { cl: 1, br: 1, jp: 1 } });
  assert.deepEqual(plain(K.bountyFor(d3, {}, T0, mulberry32(5))), plain(K.bountyFor(d3, {}, T0, mulberry32(5))));
  assert.ok(['cl', 'br', 'jp'].includes(K.bountyFor(d3, {}, T0, mulberry32(5))[0]));
});

test('is_weak_and_reset_weak', () => {
  const K = loadCore(), d = dWith(K, { wk: { cl: 1, br: 1 } });
  assert.equal(K.isWeak(d, {}, 'cl'), true);
  assert.equal(K.isWeak(d, { jp: 1 }, 'jp'), true);
  assert.equal(K.isWeak(d, { jp: '2' }, 'jp'), true);
  for (const v of [0, -3, 'x', null, NaN]) assert.equal(K.isWeak(d, { jp: v }, 'jp'), false, String(v));
  K.resetWeak(d);
  assert.deepEqual(plain(d.wk), {});
  assert.equal(K.isWeak(d, {}, 'cl'), false);
});
