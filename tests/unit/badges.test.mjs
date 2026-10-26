// badges.js のコア（DOM を触らない前半）の単体テスト。countries.js と一緒に vm で読み込み、globalThis.BADGES_CORE を使う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
const plain = x => JSON.parse(JSON.stringify(x));

// countries.js と badges.js を新しい環境に読み込む。extra はグローバルに足すもの（Date の差し替えなど）
function core(extra = {}) {
  const ctx = { ...extra }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('countries.js'), ctx); vm.runInContext(read('badges.js'), ctx);
  const K = ctx.BADGES_CORE; return { K, C: ctx.COUNTRIES, X: K.makeX(ctx.COUNTRIES) };
}

const DAY = '2026-10-25';
const ans = (a, right, first, { hint = false, mode = 'f2n', mb = 0, ma = 0 } = {}) => ['ans', a, right, first, hint, mode, mb, ma];
const res = (over = {}, { dopa = false, day = DAY } = {}) => ['res', {
  outcome: 'clear', kind: 'practice', region: 'all', mode: 'f2n', n: 5, wrongs: 0, attempts: 1, best: 5, timeMs: null, hint: false, ...over,
}, dopa, day];
// op を順に apply した d を返す
const run = (K, X, ops, d = K.fresh()) => { for (const op of ops) K.apply(d, op, X); return d; };

test('x_tables', () => {
  const { X } = core();
  const sizes = { asia: 46, samerica: 12, oceania: 14, namerica: 23, europe: 46, africa: 54, world: 195 };
  for (const [rk, n] of Object.entries(sizes)) assert.equal(X.poolSize(rk), n, rk);
  assert.equal(X.micro.length, 25);
  assert.equal(X.rkOf('北・中央アメリカ'), 'namerica');
  assert.equal(X.rkOf('all'), 'world');
  assert.equal(X.rkOf('火星'), null);
  assert.equal(X.rkOf('toString'), null);
  assert.equal(X.regionOf('world'), 'all');
  assert.equal(X.regionOf('asia'), 'アジア');
  assert.equal(X.label('world'), '全世界');
  assert.equal(X.label('oceania'), 'オセアニア');
  assert.deepEqual(plain(X.REGION_IDS), ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world']);
  assert.deepEqual(plain(X.DUNGEONS), ['asia', 'europe', 'africa', 'namerica', 'samerica', 'oceania', 'world']);
  assert.equal(X.codes.size, 195);
  assert.ok(X.codes.has('jp') && !X.codes.has('zz'));
  assert.ok(X.pools.asia.includes('jp') && !X.pools.asia.includes('fr'));
  assert.equal(X.pools.world.length, 195);
});

test('fresh_shape', () => {
  const { K } = core();
  const d = K.fresh();
  assert.equal(d.v, 1);
  assert.equal(K.VERSION, 1);
  assert.equal(d.eq, null);
  assert.equal(d.tip, 0);
  assert.deepEqual(plain(d.sent), []);
  assert.deepEqual(plain(d.got), {});
  assert.deepEqual(plain(d.sn), {});
  assert.deepEqual(Object.keys(d.s), ['right', 'streak', 'm', 'ov', 'wk', 'bk', 'rc', 'perf', 'flaw', 'cf', 'grit', 'ta', 'taAvg',
    'clears', 'days', 'last', 'back', 'dopa', 'fever', 'rpg']);
  assert.deepEqual(plain(d.s.rpg.boss), []);
  assert.deepEqual(plain(d.s.rpg), { start: 0, win: 0, nodmg: 0, under: 0, phoenix: 0, friend: 0, master: 0, lv: 0, owned: 0, bounty: 0, boss: [] });
  assert.notEqual(K.fresh().s, d.s);   // 毎回新しいオブジェクト
  assert.deepEqual(plain(K.MODE_BIT), { f2n: 1, n2f: 2, m2f: 4, f2m: 8 });
  assert.ok(K.KEY_RE.test('reg-asia@2') && !K.KEY_RE.test('reg-asia@0') && !K.KEY_RE.test('Reg@1'));
});

test('ans_counts', () => {
  const { K, X } = core();
  const d = run(K, X, [ans('jp', true, true)]);
  assert.equal(d.s.right, 1);
  assert.equal(d.s.m.jp, 1);
  run(K, X, [ans('jp', true, true, { mode: 'n2f' })], d);
  assert.equal(d.s.m.jp, 3);
  run(K, X, [ans('jp', true, true, { hint: true, mode: 'f2m' })], d);
  assert.equal(d.s.right, 3);
  assert.equal(d.s.m.jp, 3);
  run(K, X, [ans('jp', false, true)], d);
  assert.equal(d.s.wk.jp, 1);
  assert.equal(d.s.right, 3);
  const before = plain(d);
  run(K, X, [ans('zz', true, true), ans('zz', false, true)], d);
  assert.deepEqual(plain(d), before);
});

test('overcome_rules', () => {
  const { K, X } = core();
  // 同じゲームのやり直しでの正解は克服にしない
  const d = run(K, X, [ans('jp', false, true, { ma: 1 }), ans('jp', true, false, { mb: 1, ma: 0 })]);
  assert.deepEqual(plain(d.s.ov), {});
  assert.equal(d.s.wk.jp, 1);
  // 次のゲームの一発正解で克服
  run(K, X, [ans('jp', true, true)], d);
  assert.equal(d.s.ov.jp, 1);
  assert.equal(d.s.wk.jp, undefined);
  // misses が2から1に減っただけでは克服にしない
  run(K, X, [ans('fr', true, true, { mb: 2, ma: 1 })], d);
  assert.equal(d.s.ov.fr, undefined);
  run(K, X, [ans('fr', true, true, { mb: 1, ma: 0 })], d);
  assert.equal(d.s.ov.fr, 1);
  // ヒントありの一発正解では克服にせず、苦手の印も残す
  const h = run(K, X, [ans('de', false, true), ans('de', true, true, { hint: true })]);
  assert.equal(h.s.ov.de, undefined);
  assert.equal(h.s.wk.de, 1);
  // 冒険の克服と重なっても1か国1回
  const o = run(K, X, [ans('jp', false, true), ans('jp', true, true), ['rpg', 'overcome', { a: 'jp' }, DAY]]);
  assert.equal(Object.keys(o.s.ov).length, 1);
  // 苦手のリセットは印だけ消す
  run(K, X, [ans('it', false, true), ['wk-reset']], o);
  assert.deepEqual(plain(o.s.wk), {});
  assert.equal(o.s.ov.jp, 1);
});

test('result_rules', () => {
  const { K, X } = core();
  let d = run(K, X, [res({ n: 10, best: 7 })]);
  assert.equal(d.s.clears, 1);
  assert.equal(d.s.perf, 10);
  assert.equal(d.s.rc.world, 1);
  assert.equal(d.s.days, 1);
  assert.equal(d.s.last, DAY);
  assert.equal(d.s.streak, 7);

  d = run(K, X, [res({ n: 195, hint: true, best: 30 })]);
  assert.equal(d.s.clears, 1);
  assert.equal(d.s.rc.world, 1);
  assert.equal(d.s.perf, 0);
  assert.equal(d.s.streak, 0);

  d = run(K, X, [res({ kind: 'challenge', region: 'アジア', n: 46, attempts: 1 })]);
  assert.equal(d.s.flaw, 46);
  assert.equal(d.s.rc.asia, 3);

  d = run(K, X, [res({ kind: 'ta', n: 10, timeMs: 20000 })]);
  assert.equal(d.s.ta, 10);
  assert.equal(d.s.taAvg, 2000);
  run(K, X, [res({ kind: 'ta', n: 10, timeMs: 25000 })], d);
  assert.equal(d.s.taAvg, 2000);
  run(K, X, [res({ kind: 'ta', n: 5, timeMs: 1000 })], d);
  assert.equal(d.s.taAvg, 2000);
  assert.equal(d.s.ta, 10);

  d = run(K, X, [res({ region: '火星', n: 10 })]);
  assert.deepEqual(plain(d.s.rc), {});
  assert.equal(d.s.clears, 1);
});

test('quit_and_fail', () => {
  const { K, X } = core();
  let d = run(K, X, [res({ outcome: 'quit', best: 12 })]);
  assert.equal(d.s.streak, 12);
  assert.equal(d.s.clears, 0);
  assert.equal(d.s.days, 0);
  d = run(K, X, [res({ outcome: 'fail', kind: 'ta', best: 3 })]);
  assert.equal(d.s.days, 1);
  assert.equal(d.s.streak, 3);
  assert.equal(d.s.clears, 0);
  assert.equal(d.s.ta, 0);
});

test('dopa_and_fever', () => {
  const { K, X } = core();
  assert.equal(run(K, X, [res({}, { dopa: true })]).s.dopa, 1);
  assert.equal(run(K, X, [res({})]).s.dopa, 0);
  assert.equal(run(K, X, [res({ outcome: 'quit', best: 20 }, { dopa: true })]).s.fever, 1);
  assert.equal(run(K, X, [res({ outcome: 'quit', best: 20 }, { dopa: true })]).s.dopa, 0);   // dopa はクリアだけ
  assert.equal(run(K, X, [res({ hint: true, best: 25 }, { dopa: true })]).s.fever, 0);
  assert.equal(run(K, X, [res({ best: 25 })]).s.fever, 0);
  assert.equal(run(K, X, [res({ best: 19 }, { dopa: true })]).s.fever, 0);
});

test('grit_rules', () => {
  const { K, X } = core();
  const cond = { kind: 'challenge', region: 'アジア', n: 20 };
  // 判定してから覚えるので、1回目のつまずきだけでは取れない
  let d = run(K, X, [res({ ...cond, attempts: 1, wrongs: 1 })]);
  assert.equal(d.s.grit, 0);
  assert.deepEqual(plain(d.s.cf), ['f2n:asia:20']);
  // quit でもつまずいた条件は覚える
  d = run(K, X, [res({ ...cond, outcome: 'quit', wrongs: 2 })]);
  assert.deepEqual(plain(d.s.cf), ['f2n:asia:20']);
  run(K, X, [res({ ...cond, attempts: 1 })], d);
  assert.equal(d.s.grit, 1);
  // 条件がちがう
  d = run(K, X, [res({ ...cond, outcome: 'quit', wrongs: 2 }), res({ ...cond, n: 10, attempts: 1 })]);
  assert.equal(d.s.grit, 0);
  // ヒントあり・10問未満・練習は覚えない
  d = run(K, X, [res({ ...cond, hint: true, wrongs: 3 }), res({ ...cond, n: 5, wrongs: 3 }), res({ ...cond, kind: 'practice', wrongs: 3 })]);
  assert.deepEqual(plain(d.s.cf), []);
  // 最大30件。古いものから消える
  d = K.fresh();
  for (let n = 10; n <= 44; n++) run(K, X, [res({ ...cond, n, outcome: 'quit', wrongs: 1 })], d);
  assert.equal(d.s.cf.length, 30);
  assert.deepEqual(plain(d.s.cf), Array.from({ length: 30 }, (_, i) => `f2n:asia:${i + 15}`));
  // 同じ条件をもう一度覚えると、いちばん後ろに動く（重ならない）
  run(K, X, [res({ ...cond, n: 15, outcome: 'quit', wrongs: 1 })], d);
  assert.equal(d.s.cf.length, 30);
  assert.equal(d.s.cf.at(-1), 'f2n:asia:15');
  assert.equal(d.s.cf.filter(k => k === 'f2n:asia:15').length, 1);
});

test('days', () => {
  const { K, X } = core();
  const d = run(K, X, [res({}, { day: '2026-10-25' }), res({}, { day: '2026-10-25' })]);
  assert.equal(d.s.days, 1);
  run(K, X, [res({}, { day: '2026-10-26' })], d);
  assert.equal(d.s.days, 2);
  run(K, X, [res({}, { day: '2026-11-08' })], d);   // 13日後
  assert.equal(d.s.back, 0);
  assert.equal(d.s.days, 3);
  run(K, X, [res({}, { day: '2026-11-22' })], d);   // 14日後
  assert.equal(d.s.back, 1);
  assert.equal(d.s.days, 4);
  run(K, X, [res({}, { day: '2026-11-01' })], d);   // 日付が戻った
  assert.equal(d.s.days, 4);
  assert.equal(d.s.last, '2026-11-22');
  K.addDay(d.s, 'garbage');
  assert.equal(d.s.days, 4);
  assert.equal(d.s.last, '2026-11-22');
  // 夏時間の切りかわりでも1日は1
  assert.equal(K.dayNum('2026-03-09') - K.dayNum('2026-03-08'), 1);
  assert.equal(K.dayNum('2026-11-02') - K.dayNum('2026-11-01'), 1);
});

test('today_local', () => {
  const { K } = core();
  assert.equal(K.today(new Date(2026, 9, 5, 0, 30)), '2026-10-05');
  const { K: K2 } = core({ Date: class extends Date { constructor(...a) { super(...(a.length ? a : [2026, 0, 2, 9, 0])); } } });
  assert.equal(K2.today(), '2026-01-02');
});

test('rpg_ops', () => {
  const { K, X } = core();
  const rp = (t, detail, screen = 'home') => ['rpg', t, K.pickRpg(t, detail, screen), DAY];
  let d = run(K, X, [rp('coins', { delta: 100, reason: 'start', coins: 100, earned: 100 })]);
  assert.equal(d.s.rpg.start, 1);
  assert.deepEqual(plain(K.pickRpg('coins', { delta: 100, reason: 'start' }, 'home')), {});

  d = run(K, X, [rp('answer', { a: 'jp', right: true, mode: 'f2n', dungeon: 'asia', boss: false })]);
  assert.equal(d.s.right, 1);
  assert.ok(d.s.m.jp & 1);
  run(K, X, [rp('answer', { a: 'jp', right: true, mode: 'cap' })], d);
  assert.equal(d.s.right, 2);
  assert.equal(d.s.m.jp, 1);
  run(K, X, [rp('answer', { a: 'jp', right: false, mode: 'f2n' })], d);
  assert.equal(d.s.wk.jp, 1);
  assert.equal(d.s.right, 2);
  run(K, X, [rp('answer', { a: 'zz', right: true, mode: 'f2n' })], d);
  assert.equal(d.s.right, 2);

  const win = { dungeon: 'asia', floor: 5, boss: true, win: true, first: true, mistakes: 0, revived: true, gauge: 0, maxCombo: 12, lv: 3, recLv: 8 };
  d = run(K, X, [rp('battle', win)]);
  assert.equal(d.s.days, 1);
  assert.equal(d.s.streak, 12);
  for (const k of ['win', 'nodmg', 'under', 'phoenix']) assert.equal(d.s.rpg[k], 1, k);
  assert.equal(run(K, X, [rp('battle', { ...win, lv: 4 })]).s.rpg.under, 0);
  d = run(K, X, [rp('battle', { ...win, win: false })]);
  for (const k of ['win', 'nodmg', 'under', 'phoenix']) assert.equal(d.s.rpg[k], 0, k);
  assert.equal(d.s.days, 1);
  assert.equal(d.s.streak, 12);
  d = run(K, X, [rp('battle', { ...win, boss: false, mistakes: 2 })]);
  assert.deepEqual([d.s.rpg.win, d.s.rpg.nodmg, d.s.rpg.under, d.s.rpg.phoenix], [1, 0, 0, 1]);

  d = run(K, X, [rp('levelup', { lv: 12, from: 11 }), rp('levelup', { lv: 5, from: 4 })]);
  assert.equal(d.s.rpg.lv, 12);
  run(K, X, [rp('clear', { dungeon: 'samerica' }), rp('clear', { dungeon: 'samerica' }), rp('clear', { dungeon: 'mars' })], d);
  assert.deepEqual(plain(d.s.rpg.boss), ['samerica']);
  run(K, X, [rp('join', { a: 'jp', via: 'learn', owned: 60 })], d);
  assert.equal(d.s.rpg.friend, 1);
  assert.equal(d.s.rpg.owned, 60);
  run(K, X, [rp('join', { a: 'fr', via: 'gacha', owned: 40 })], d);
  assert.equal(d.s.rpg.owned, 60);
  run(K, X, [rp('bounty', { a: 'jp', doneAll: true, totalDays: 4 })], d);
  assert.equal(d.s.rpg.bounty, 4);

  assert.equal(run(K, X, [rp('promote', { a: 'jp', star: 2, via: 'learn' })]).s.rpg.master, 1);
  assert.equal(run(K, X, [rp('promote', { a: 'jp', star: 2, via: 'gacha' })]).s.rpg.master, 0);
  assert.equal(run(K, X, [rp('promote', { a: 'jp', star: 2 }, 'home')]).s.rpg.master, 1);
  assert.equal(run(K, X, [rp('promote', { a: 'jp', star: 2 }, 'gacha')]).s.rpg.master, 0);
  assert.equal(run(K, X, [rp('promote', { a: 'jp', star: 3 }, 'home')]).s.rpg.master, 0);
});

test('pick_shapes', () => {
  const { K } = core();
  // drill:result の detail から決まったキーだけ。数は |0、timeMs は数か null、hint は真偽
  const r = K.pickResult({ sid: 's1', outcome: 'clear', mode: 'f2n', kind: 'ta', region: 'アジア', n: '10', done: 10, firstTry: 9,
    wrongs: 1.7, attempts: 2, best: 9, timeMs: 12345.6, hint: 0, missed: ['jp'] });
  assert.deepEqual(plain(r), { outcome: 'clear', kind: 'ta', region: 'アジア', mode: 'f2n', n: 10, wrongs: 1, attempts: 2, best: 9, timeMs: 12345.6, hint: false });
  assert.equal(K.pickResult({ timeMs: '5' }).timeMs, null);
  assert.equal(K.pickResult({ timeMs: NaN }).timeMs, null);
  assert.equal(K.pickResult({ hint: 'yes' }).hint, true);
  // rpg:* の detail から決まったキーだけ
  assert.deepEqual(plain(K.pickRpg('battle', { dungeon: 'asia', floor: 5, boss: 1, win: 'y', first: true, mistakes: '2', revived: 0, gauge: 3,
    maxCombo: 7.9, lv: '4', recLv: 10 }, 'battle')), { boss: true, win: true, mistakes: 2, revived: false, maxCombo: 7, lv: 4, recLv: 10 });
  assert.deepEqual(plain(K.pickRpg('levelup', { lv: '9', from: 8 })), { lv: 9 });
  assert.deepEqual(plain(K.pickRpg('join', { a: 'jp', via: 'learn', owned: '3' })), { via: 'learn', owned: 3 });
  assert.deepEqual(plain(K.pickRpg('promote', { a: 'jp', star: 2 }, 'home')), { learn: true });
  assert.deepEqual(plain(K.pickRpg('answer', { a: 'jp', right: 1, mode: 'n2f', dungeon: 'asia', boss: true })), { a: 'jp', right: true, mode: 'n2f' });
  assert.deepEqual(plain(K.pickRpg('clear', { dungeon: 'asia', extra: 1 })), { dungeon: 'asia' });
  assert.deepEqual(plain(K.pickRpg('overcome', { a: 'jp', total: 3 })), { a: 'jp' });
  assert.deepEqual(plain(K.pickRpg('bounty', { a: 'jp', doneAll: true, totalDays: '6' })), { totalDays: 6 });
});

test('save_ops', () => {
  const { K, X } = core();
  const d = run(K, X, [['got', 'answers@1', 100], ['got', 'answers@1', 200], ['got', 'BAD', 1]]);
  assert.deepEqual(plain(d.got), { 'answers@1': 100 });   // まだ無いときだけ
  run(K, X, [['sent', 'answers@1'], ['sent', 'answers@1'], ['sent', 'nope']], d);
  assert.deepEqual(plain(d.sent), ['answers@1']);
  run(K, X, [['eq', 'answers@1']], d);
  assert.equal(d.eq, 'answers@1');
  run(K, X, [['eq', 'x']], d);
  assert.equal(d.eq, 'answers@1');
  run(K, X, [['eq', '']], d);
  assert.equal(d.eq, '');
  run(K, X, [['seen', 'book', 50], ['seen', 'book', 30], ['seen', 'BAD ID', 10], ['seen', 'constructor', 5]], d);
  assert.equal(d.sn.book, 50);
  assert.equal(d.sn['BAD ID'], undefined);
  assert.equal(d.sn.constructor, 5);
  run(K, X, [['tip'], ['tip'], ['tip'], ['tip']], d);
  assert.equal(d.tip, 3);
  run(K, X, [['book', 'jp'], ['book', 'zz']], d);
  assert.deepEqual(plain(d.s.bk), { jp: 1 });
  // デバッグ用の set は、あるフィールドに同じ種類の値のときだけ
  run(K, X, [['set', 'right', 50], ['set', 'streak', '9'], ['set', 'nope', 1], ['set', 'last', '2026-01-01'], ['set', 'm', null], ['set', 'cf', {}]], d);
  assert.equal(d.s.right, 50);
  assert.equal(d.s.streak, 0);
  assert.equal(d.s.nope, undefined);
  assert.equal(d.s.last, '2026-01-01');
  assert.deepEqual(plain(d.s.m), {});
  assert.deepEqual(plain(d.s.cf), []);
  // 知らない op は何もしない
  const before = plain(d);
  run(K, X, [['nope', 1], [], null, 'ans', ['rpg', 'nope', {}, DAY], ['rpg', 'levelup', null, DAY], ['res', null, false, DAY]], d);
  assert.deepEqual(plain(d), before);
});

test('sid_gate', () => {
  const { K } = core();
  const g = K.sidGate();
  assert.equal(g('a'), true);
  assert.equal(g('a'), false);
  for (let i = 0; i < 20; i++) assert.equal(g('s' + i), true);
  assert.equal(g('a'), true);
  const h = K.sidGate();
  h('a');
  for (let i = 0; i < 19; i++) h('s' + i);
  assert.equal(h('a'), false);   // 直近20件の中なら覚えている
  const one = K.sidGate(1);
  one('a'); one('b');
  assert.equal(one('a'), true);
});

test('sanitize_rules', () => {
  const { K, X } = core();
  const d = K.sanitize({
    v: 1, tip: 9, eq: 'x', last: 'garbage',
    got: { 'answers@1': 5, 'future-badge@2': 7, 'BAD KEY': 1 },
    sent: ['answers@1', 'nope'],
    sn: { book: 3, 'BAD ID': 4, answers: -1 },
    s: {
      right: -5, streak: '12', m: { jp: 31, zz: 1 }, ov: { zz: 1, jp: 1 }, wk: { fr: 1, xx: 1 }, bk: { de: 1 }, rc: { asia: 3, mars: 1 },
      cf: ['f2n:asia:20', 'bad', 'x2n:asia:5'], grit: 5, perf: 500, taAvg: 1e9, days: 'x',
      rpg: { boss: ['asia', 'asia', 'mars'], lv: 99, owned: 300, win: 7 },
    },
  }, X);
  assert.equal(d.v, 1);
  assert.equal(d.s.right, 0);
  assert.equal(d.s.streak, 12);
  assert.deepEqual(plain(d.s.m), { jp: 15 });
  assert.deepEqual(plain(d.s.ov), { jp: 1 });
  assert.deepEqual(plain(d.s.wk), { fr: 1 });
  assert.deepEqual(plain(d.s.bk), { de: 1 });
  assert.deepEqual(plain(d.s.rc), { asia: 3 });
  assert.deepEqual(plain(d.s.rpg.boss), ['asia']);
  assert.deepEqual(plain(d.s.cf), ['f2n:asia:20']);
  assert.deepEqual(plain(d.got), { 'answers@1': 5, 'future-badge@2': 7 });
  assert.deepEqual(plain(d.sent), ['answers@1']);
  assert.deepEqual(plain(d.sn), { book: 3, answers: 0 });
  assert.equal(d.eq, null);
  assert.equal(d.s.last, '');
  assert.equal(d.tip, 3);
  assert.equal(d.s.grit, 1);
  assert.equal(d.s.perf, 195);
  assert.equal(d.s.taAvg, 600000);
  assert.equal(d.s.days, 0);
  assert.equal(d.s.rpg.lv, 50);
  assert.equal(d.s.rpg.owned, 195);
  assert.equal(d.s.rpg.win, 1);
  assert.equal(K.sanitize({ s: { right: 2e7 } }, X).s.right, 1e7);
  assert.equal(K.sanitize({ eq: '' }, X).eq, '');
  assert.equal(K.sanitize({ eq: 'future-badge@1' }, X).eq, 'future-badge@1');
  assert.equal(K.sanitize({ eq: 5 }, X).eq, null);
  assert.equal(K.sanitize({ s: { last: '2026-10-25' } }, X).s.last, '2026-10-25');
  // 形がちがうものは fresh() の値になる
  assert.deepEqual(plain(K.sanitize({ s: { m: [1], cf: 'x', rpg: null } }, X)), plain(K.fresh()));
  // got は時刻の大きい500件、sent は後ろの500件
  const ks = Array.from({ length: 600 }, (_, i) => `k${i + 1}@1`);
  const big = K.sanitize({ got: Object.fromEntries(ks.map((k, i) => [k, i + 1])), sent: ks }, X);
  assert.deepEqual(Object.keys(big.got), ks.slice(100));
  assert.equal(big.got['k101@1'], 101);
  assert.deepEqual(plain(big.sent), ks.slice(100));
  // 同じ時刻なら元の並びで後ろのものを残す
  const tie = K.sanitize({ got: Object.fromEntries(ks.slice(0, 501).map(k => [k, 7])) }, X);
  assert.deepEqual(Object.keys(tie.got), ks.slice(1, 501));
});

test('migrate_rules', () => {
  const { K, X } = core();
  let r = K.migrate({ v: 2, s: { right: 5 } }, X);
  assert.equal(r.ro, true);
  assert.equal(r.d.s.right, 5);
  r = K.migrate({ v: 1, s: { right: 5 } }, X);
  assert.equal(r.ro, false);
  assert.equal(r.d.s.right, 5);
  assert.equal(K.migrate({ v: -1e9, s: { right: 5 } }, X).d.s.right, 5);
  for (const bad of [null, [], 7, 'x', undefined]) assert.deepEqual(plain(K.migrate(bad, X)), { d: plain(K.fresh()), ro: false });
});

// ---------- カタログと判定（Task 2） ----------
const MODES4 = ['f2n', 'n2f', 'm2f', 'f2m'];
const stepCount = list => list.reduce((n, b) => n + b.tiers.length, 0);
const keysOf = list => plain(list.flatMap(b => b.tiers.map((_, i) => `${b.id}@${i + 1}`)));
// DAY から n 日あとの 'YYYY-MM-DD'
const dayAfter = n => new Date(Date.UTC(2026, 9, 25 + n)).toISOString().slice(0, 10);
// カタログと、冒険なし（x0）・冒険あり記録なし（xr）の x
function cat0() {
  const { K, C, X } = core();
  return { K, X, cat: K.makeCatalog(C), x0: K.makeCtx(X, null), xr: K.makeCtx(X, { snapshot: () => null }) };
}
const badge = (cat, id) => cat.find(b => b.id === id);
const IDS = ['first-clear', 'answers', 'streak', 'overcome', 'micro', 'prac-perfect', 'chal-flawless', 'chal-grit', 'ta-clear', 'ta-speed',
  'mode-f2n', 'mode-n2f', 'mode-m2f', 'mode-f2m', 'reg-samerica', 'reg-oceania', 'reg-namerica', 'reg-europe', 'reg-asia', 'reg-africa', 'reg-world',
  'book', 'days', 'comeback', 'dopa-on', 'dopa-fever', 'rpg-start', 'rpg-first-win', 'rpg-lv', 'rpg-boss', 'rpg-final', 'rpg-nodmg', 'rpg-underdog',
  'rpg-phoenix', 'rpg-friend', 'rpg-master', 'rpg-cards', 'rpg-bounty'];

test('catalog_counts', () => {
  const { K, cat, x0, xr } = cat0();
  assert.equal(K.visible(cat, x0).length, 26);
  assert.equal(stepCount(K.visible(cat, x0)), 66);
  assert.equal(K.visible(cat, xr).length, 38);
  assert.equal(stepCount(K.visible(cat, xr)), 86);
  const byColor = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const b of K.visible(cat, xr)) for (const t of b.tiers) byColor[t.color]++;
  assert.deepEqual(byColor, { 1: 30, 2: 30, 3: 24, 4: 2 });
});

test('catalog_shape', () => {
  const { K, cat } = cat0();
  assert.deepEqual(plain(cat.map(b => b.id)), IDS);   // 設計書 §2.1→§2.7 の表の順
  assert.deepEqual([...new Set(cat.map(b => b.cat))], ['quiz', 'kind', 'mode', 'region', 'daily', 'dopa', 'rpg']);
  assert.deepEqual(plain(K.CAT_LABEL), { quiz: 'クイズ', kind: 'あそび方', mode: 'モード', region: '地域', daily: '図鑑・毎日', dopa: 'ドパガキ', rpg: '冒険' });
  for (const b of cat) assert.match(b.id, /^[a-z0-9-]{1,32}$/);
  assert.equal(new Set(cat.map(b => b.id)).size, cat.length);
  for (const k of keysOf(cat)) assert.ok(K.KEY_RE.test(k), k);
  const titles = cat.flatMap(b => b.tiers.map(t => t.title));
  assert.equal(titles.length, 86);
  assert.equal(new Set(titles).size, 86);
  for (const t of titles) assert.ok(typeof t === 'string' && t && [...t].length <= 10, t);
  for (const b of cat) for (const t of b.tiers) {
    assert.ok(typeof t.desc === 'string' && t.desc.length > 0, b.id);
    assert.ok(Number.isFinite(t.goal) && t.goal > 0, b.id);
    assert.equal(typeof (t.v || b.v), 'function', b.id);
  }
  assert.deepEqual(Object.fromEntries(cat.filter(b => b.secret).map(b => [b.id, b.hint])), {
    'chal-grit': '挑戦でつまずいた条件に、もう一度いどむと…',
    comeback: 'しばらく旅に出て、また戻ってくると…',
    'dopa-fever': 'ドパガキ向けで、王冠が見えるまで…',
  });
  assert.deepEqual(plain(cat.filter(b => b.rpg).map(b => b.id)), IDS.filter(id => id.startsWith('rpg-')));
  assert.equal(cat.filter(b => b.rpg).length, 12);
  // 印と単位
  assert.deepEqual(plain(cat.filter(b => b.lower).map(b => b.id)), ['ta-speed']);
  assert.deepEqual(plain(cat.filter(b => b.skill).map(b => b.id)), ['streak', 'overcome', 'micro', 'prac-perfect', 'chal-flawless', 'chal-grit',
    'mode-f2n', 'mode-n2f', 'mode-m2f', 'mode-f2m', 'reg-samerica', 'reg-oceania', 'reg-namerica', 'reg-europe', 'reg-asia', 'reg-africa', 'reg-world', 'dopa-fever']);
  assert.deepEqual(Object.fromEntries(cat.filter(b => b.unit).map(b => [b.id, b.unit])), {
    answers: '問', streak: '問', overcome: 'か国', micro: 'か国', 'prac-perfect': '問', 'chal-flawless': '問', 'ta-clear': '問',
    'mode-f2n': 'か国', 'mode-n2f': 'か国', 'mode-m2f': 'か国', 'mode-f2m': 'か国', book: 'か国', days: '日', 'rpg-boss': '地域', 'rpg-cards': 'か国', 'rpg-bounty': '日',
  });
  assert.deepEqual(plain(cat.filter(b => b.cat === 'mode').map(b => [b.mode, b.sub])),
    [['f2n', '国旗→国名'], ['n2f', '国名→国旗'], ['m2f', '場所→国旗'], ['f2m', '国旗→場所']]);
  assert.deepEqual(plain(cat.filter(b => b.cat === 'region').map(b => b.rk)), ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world']);
  // 1段だけのバッジの色
  assert.deepEqual(Object.fromEntries(cat.filter(b => b.tiers.length === 1).map(b => [b.id, b.tiers[0].color])), {
    'first-clear': 1, micro: 2, 'chal-grit': 2, comeback: 1, 'dopa-on': 1, 'dopa-fever': 2, 'rpg-start': 1, 'rpg-first-win': 1, 'rpg-final': 4,
    'rpg-nodmg': 2, 'rpg-underdog': 3, 'rpg-phoenix': 2, 'rpg-friend': 1, 'rpg-master': 2,
  });
});

test('catalog_from_countries', () => {
  const { K, cat } = cat0();
  assert.equal(K.stepInfo(cat, 'micro@1').t.goal, 25);
  assert.equal(K.stepInfo(cat, 'micro@1').color, 2);
  assert.equal(K.stepInfo(cat, 'reg-asia@3').t.goal, 184);
  assert.equal(K.stepInfo(cat, 'reg-world@3').t.goal, 780);
  assert.equal(K.stepInfo(cat, 'reg-world@3').color, 4);
  assert.equal(K.stepInfo(cat, 'rpg-final@1').color, 4);
  assert.equal(badge(cat, 'reg-asia').tiers[0].desc, 'アジアで10問以上のゲームをクリア');
  assert.equal(badge(cat, 'reg-asia').tiers[1].desc, 'アジアの「全部」をヒントなしでクリア');
  assert.equal(badge(cat, 'reg-asia').tiers[2].desc, 'アジアの国すべてを4モードで正解');
  assert.equal(badge(cat, 'reg-world').tiers[2].desc, '全世界の国すべてを4モードで正解');
  assert.equal(K.stepInfo(cat, 'ta-speed@2').t.desc, 'タイムアタック10問以上を1問 2.0秒以内でクリア');
  assert.equal(K.stepInfo(cat, 'answers@2').t.desc, '正解の合計が 1,000問');
});

test('step_info_and_labels', () => {
  const { K, cat } = cat0();
  const si = K.stepInfo(cat, 'reg-world@3');
  assert.equal(si.b.id, 'reg-world');
  assert.equal(si.t.title, '世界博士');
  assert.equal(si.tier, 3);
  assert.equal(K.stepInfo(cat, 'first-clear@1').t.title, 'ドリルの新人');
  for (const k of ['answers@4', 'nope@1', 'answers', '', null, 5, 'constructor@1']) assert.equal(K.stepInfo(cat, k), null, String(k));
  assert.deepEqual([1, 2, 3, 4].map(K.tierLabel), ['銅', '銀', '金', '虹']);
  assert.equal(K.bestKey(cat, ['answers@1', 'reg-world@3', 'micro@1']), 'reg-world@3');
  assert.equal(K.bestKey(cat, ['answers@2', 'micro@1']), 'micro@1');   // 同じ色なら後ろ
  assert.equal(K.bestKey(cat, ['rpg-final@1', 'reg-world@3']), 'reg-world@3');
});

test('thresholds', () => {
  const { K, cat, x0 } = cat0();
  const ev = stats => { const d = K.fresh(); Object.assign(d.s, stats); return plain(K.evaluate(cat, d, x0)); };
  assert.deepEqual(ev({ right: 99 }), []);
  assert.deepEqual(ev({ right: 100 }), ['answers@1']);
  assert.deepEqual(ev({ taAvg: 2001 }), ['ta-speed@1']);
  assert.deepEqual(ev({ taAvg: 2000 }), ['ta-speed@1', 'ta-speed@2']);
  assert.deepEqual(ev({ taAvg: 1401 }), ['ta-speed@1', 'ta-speed@2']);
  assert.deepEqual(ev({ taAvg: 1400 }), ['ta-speed@1', 'ta-speed@2', 'ta-speed@3']);
  assert.deepEqual(ev({ taAvg: 3500 }), []);
  assert.deepEqual(ev({ taAvg: 0 }), []);
  // 取ったステップは返さない（時刻が 0 でも）
  const d = K.fresh(); d.s.right = 1000; d.got['answers@1'] = 0;
  assert.deepEqual(plain(K.evaluate(cat, d, x0)), ['answers@2']);
});

test('reach_every_step', () => {
  const { K, X, cat, xr } = cat0();
  const rp = (t, detail) => ['rpg', t, K.pickRpg(t, detail, 'home'), DAY];
  const ops = [];
  for (const a of X.codes) for (const mode of MODES4) ops.push(ans(a, false, true, { mode }), ans(a, true, true, { mode }));
  for (let i = 0; i < 4300; i++) ops.push(ans('jp', true, false));
  ops.push(res({ outcome: 'quit', best: 100 }), res({ n: 40 }), res({ kind: 'challenge', n: 40 }),
    res({ kind: 'challenge', region: 'アジア', n: 20, outcome: 'quit', wrongs: 1 }), res({ kind: 'challenge', region: 'アジア', n: 20 }),
    res({ kind: 'ta', n: 40, timeMs: 40 * 1400 }));
  for (const rk of X.REGION_IDS) ops.push(res({ region: X.regionOf(rk), n: X.poolSize(rk) }));
  for (const a of X.codes) ops.push(['book', a]);
  for (let i = 0; i < 30; i++) ops.push(res({ outcome: 'fail' }, { day: dayAfter(14 + i) }));   // DAY のあと14日あけて30日
  ops.push(res({ best: 20 }, { dopa: true }));
  ops.push(rp('coins', { reason: 'start' }),
    rp('battle', { boss: true, win: true, mistakes: 0, revived: true, maxCombo: 3, lv: 1, recLv: 10 }), rp('levelup', { lv: 50 }));
  for (const dungeon of X.DUNGEONS) ops.push(rp('clear', { dungeon }));
  ops.push(rp('join', { via: 'learn', owned: 195 }), rp('promote', { via: 'learn', star: 2 }), rp('bounty', { totalDays: 30 }));
  const d = run(K, X, ops);
  const all = keysOf(cat);
  assert.equal(all.length, 86);
  assert.deepEqual(plain(K.evaluate(cat, d, xr)), all);
});

test('hint_does_not_count', () => {
  const { K, X, cat, x0 } = cat0();
  const ops = [];
  for (const a of X.codes) for (const mode of MODES4) ops.push(ans(a, false, true, { mode, hint: true }), ans(a, true, true, { mode, hint: true }));
  ops.push(res({ hint: true, kind: 'challenge', region: 'アジア', n: 46, best: 120 }), res({ hint: true, n: 46, region: 'アジア', best: 25 }, { dopa: true }),
    res({ hint: true, kind: 'challenge', region: 'アジア', n: 20, outcome: 'quit', wrongs: 1 }), res({ hint: true, kind: 'challenge', region: 'アジア', n: 20 }));
  const got = plain(K.evaluate(cat, run(K, X, ops), x0));
  const skill = /^(prac-perfect|chal-flawless|chal-grit|mode-[a-z0-9]+|streak|overcome|micro|dopa-fever)@|^reg-[a-z]+@[23]$/;
  assert.deepEqual(got.filter(k => skill.test(k)), []);
  for (const k of ['answers@1', 'first-clear@1', 'reg-asia@1', 'dopa-on@1']) assert.ok(got.includes(k), k);
});

test('snapshot_robust', () => {
  const { K, X, cat } = cat0();
  const d = run(K, X, [ans('jp', true, true), res({ n: 10 })]);
  const rpgs = [{ snapshot() { throw new Error('x'); } }, { snapshot: () => null }, { snapshot: () => ({}) }, { snapshot: () => ({ floors: null, st: 5 }) },
    {}, { snapshot: () => 5 }, { snapshot: () => [1] }, { snapshot: () => ({ lv: 'x', owned: NaN, floors: 'asia', overcome: null, intro: undefined }) }];
  for (const r of rpgs) {
    const x = K.makeCtx(X, r);
    assert.ok(x.snap === null || (typeof x.snap === 'object' && !Array.isArray(x.snap)));
    assert.equal(x.rpg, true);
    assert.doesNotThrow(() => K.evaluate(cat, d, x));
    assert.doesNotThrow(() => K.listView(cat, d, x));
    for (const b of K.visible(cat, x)) assert.ok(Number.isFinite(K.progressOf(b, d, x).ratio), b.id);
  }
  assert.equal(K.makeCtx(X, { snapshot() { throw new Error('x'); } }).snap, null);
  assert.equal(K.makeCtx(X, {}).snap, null);
  const x0 = K.makeCtx(X, null);
  assert.equal(x0.rpg, false);
  assert.equal(x0.snap, null);
  assert.equal(x0.pools, X.pools);
  assert.equal(x0.micro, X.micro);
  assert.equal(K.snapOvercome(null), 0);
  assert.equal(K.snapOvercome({ overcome: 5 }), 5);
  assert.equal(K.snapOvercome({ overcome: { a: 1, b: 1 } }), 2);
  assert.equal(K.snapOvercome({ st: { overcome: 7 } }), 7);
  assert.equal(K.snapOvercome({ overcome: 3, st: { overcome: 9 } }), 9);
  assert.equal(K.snapOvercome({ overcome: 'x', st: 5 }), 0);
  // overcome は s.ov と snapshot の大きいほう
  const ov = K.makeCtx(X, { snapshot: () => ({ overcome: { jp: 1, fr: 1, de: 1, it: 1, es: 1, pt: 1, gb: 1, us: 1, ca: 1, mx: 1 } }) });
  assert.deepEqual(plain(K.evaluate(cat, K.fresh(), ov)), ['overcome@1', 'overcome@2']);
});

test('rpg_from_snapshot', () => {
  const { K, X, cat } = cat0();
  const ev = (snap, d = K.fresh()) => plain(K.evaluate(cat, d, K.makeCtx(X, { snapshot: () => snap })));
  assert.deepEqual(ev({ lv: 30, owned: 100, floors: { asia: 5, europe: 5, africa: 5, world: 5, oceania: 4 }, st: { win: 1 }, bountyDays: 10 }),
    ['rpg-start@1', 'rpg-first-win@1', 'rpg-lv@1', 'rpg-lv@2', 'rpg-boss@1', 'rpg-boss@2', 'rpg-final@1', 'rpg-cards@1', 'rpg-cards@2',
      'rpg-bounty@1', 'rpg-bounty@2']);
  assert.deepEqual(ev({ intro: false, lv: 1, st: { win: 0, lose: 0, flee: 0 } }), []);
  assert.deepEqual(ev({ lv: 1, st: { lose: 1 } }), ['rpg-start@1']);
  assert.deepEqual(ev({ intro: true }), ['rpg-start@1']);
  assert.deepEqual(ev({ intro: false, lv: 5 }), []);   // intro があればそれだけで決める
  // s.rpg.boss と floors は和集合（同じダンジョンは1つ）
  const d = run(K, X, [['rpg', 'clear', { dungeon: 'asia' }, DAY], ['rpg', 'clear', { dungeon: 'samerica' }, DAY]]);
  assert.deepEqual(ev({ intro: false, floors: { asia: 5, europe: 5 } }, d), ['rpg-boss@1', 'rpg-boss@2']);
  // 冒険なしでは冒険のバッジを判定しない
  assert.deepEqual(plain(K.evaluate(cat, d, K.makeCtx(X, null))), []);
});

test('progress_and_summary', () => {
  const { K, cat, x0, xr } = cat0();
  const d = K.fresh();
  d.s.right = 150; d.got['answers@1'] = 1700000000000;
  assert.deepEqual(plain(K.progressOf(badge(cat, 'answers'), d, x0)), { next: 1, v: 150, goal: 1000, ratio: 0.15 });
  d.s.taAvg = 2430; d.got['ta-speed@1'] = 5;
  const sp = K.progressOf(badge(cat, 'ta-speed'), d, x0);
  assert.equal(sp.next, 1);
  assert.equal(sp.ratio, 2000 / 2430);
  assert.equal(K.progressOf(badge(cat, 'ta-speed'), K.fresh(), x0).ratio, 0);   // 記録なし
  const e = K.fresh();
  e.s.right = 6000; for (const k of ['answers@1', 'answers@2', 'answers@3']) e.got[k] = 1;
  const full = K.progressOf(badge(cat, 'answers'), e, x0);
  assert.equal(full.next, -1);
  assert.equal(full.ratio, 1);
  e.s.right = 100; e.got = { 'answers@1': 1 };
  assert.equal(K.progressOf(badge(cat, 'answers'), e, x0).ratio, 0.1);
  // 地域は段ごとの値
  e.got = { 'reg-asia@1': 1, 'reg-asia@2': 1 };
  assert.deepEqual(plain(K.progressOf(badge(cat, 'reg-asia'), e, x0)), { next: 2, v: 0, goal: 184, ratio: 0 });

  const s = K.fresh();
  s.s.right = 150;
  s.got = { 'answers@1': 1700000000000, 'rpg-lv@1': 2, 'future@1': 3 };
  assert.deepEqual(plain(K.summarize(cat, s, x0)), { got: 1, total: 26, byColor: { 1: 1, 2: 0, 3: 0, 4: 0 } });
  assert.deepEqual(plain(K.summarize(cat, s, xr)), { got: 2, total: 38, byColor: { 1: 2, 2: 0, 3: 0, 4: 0 } });
  // 色はそのバッジで取った一番上の段の色。バッジは1つと数える
  s.got = { 'reg-world@1': 1, 'reg-world@3': 2, 'answers@2': 3 };
  assert.deepEqual(plain(K.summarize(cat, s, x0)), { got: 2, total: 26, byColor: { 1: 0, 2: 1, 3: 0, 4: 1 } });

  s.got = { 'answers@1': 1700000000000 };
  const lv = K.listView(cat, s, x0);
  assert.equal(lv.length, 26);
  assert.equal(K.listView(cat, s, xr).length, 38);
  const a = lv.find(b => b.id === 'answers');
  assert.deepEqual(plain(a.tiers[0]), { key: 'answers@1', got: 1700000000000, title: 'こつこつ派', goal: 100, val: 150 });
  assert.deepEqual(plain(a.tiers[1]), { key: 'answers@2', got: 0, title: '努力の人', goal: 1000, val: 150 });
  assert.deepEqual(plain(Object.keys(a).sort()), ['cat', 'icon', 'id', 'name', 'tiers']);
  assert.equal(a.name, 'こつこつ正解');
  assert.equal(a.icon, '📚');
  assert.equal(a.cat, 'quiz');
});
