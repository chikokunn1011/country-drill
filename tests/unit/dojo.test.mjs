// dojo.js の前半（似た国旗の道場の計算 DOJO）の単体テスト。ブラウザの代わりに vm で読み込む（daily-core.test.mjs と同じ形）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['countries.js', 'daily-core.js', 'trivia.js', 'dojo.js']) vm.runInContext(read(f), ctx);
const K = ctx.DAILY_CORE, D = ctx.DOJO;
const byA = new Map(ctx.window.COUNTRIES.map(c => [c.a, c]));
const plain = x => JSON.parse(JSON.stringify(x));
// 決まった列の乱数（mulberry32）
const seeded = seed => { let t = seed; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

test('constants', () => { assert.equal(D.ROUND, 10); assert.deepEqual(plain(D.MODES), ['f2n', 'n2f']); });
test('label_covers_similar', () => {
  assert.deepEqual(Object.keys(D.LABEL), plain(K.SIMILAR.map(g => g[0]))); assert.equal(Object.keys(D.LABEL).length, 25);
  for (const t of Object.values(D.LABEL)) assert.ok(t.length > 0 && !/首都/.test(t));
  assert.equal(D.LABEL.td, '青・黄・赤のたて3色'); assert.equal(D.LABEL.qa, 'ギザギザの白');
});
test('similar_known_and_flag_trivia', () => {
  const all = K.SIMILAR.flat(); assert.equal(all.length, 93);
  for (const a of all) { assert.ok(byA.has(a), a); assert.ok(ctx.window.TRIVIA[a].some(x => x.k === 'flag' && x.t), a); }
});
test('build_rules', () => {
  for (const g of K.SIMILAR) for (let s = 1; s <= 50; s++) {
    const q = D.build(g, seeded(s));
    assert.equal(q.length, 10); assert.ok(q.every(a => g.includes(a))); assert.deepEqual(new Set(q).size, g.length);
    for (let i = 1; i < q.length; i++) assert.notEqual(q[i], q[i - 1]);
  }
});
test('build_small_and_big', () => {
  assert.equal(D.build(['qa', 'bh'], seeded(1)).filter(a => a === 'qa').length, 5);
  assert.deepEqual(plain(D.build(K.SIMILAR[0], seeded(7))), plain(D.build(K.SIMILAR[0], seeded(7))));
  const g = ['no', 'is', 'dk', 'fi', 'se'], copy = g.slice(); D.build(g, seeded(3)); assert.deepEqual(g, copy);   // 引数を書きかえない
  assert.equal(D.build(g).length, 10);   // rand を省くと Math.random
});
test('pair_key', () => { assert.equal(D.pairKey('td', 'ro'), 'ro-td'); assert.equal(D.pairKey('ro', 'td'), 'ro-td'); });
test('rival', () => {
  const g = ['td', 'ro', 'ad', 'md'];
  assert.equal(D.rival('td', g, { 'md-td': 2, 'ro-td': 3 }), 'ro'); assert.equal(D.rival('td', g, {}), 'ro');
  assert.equal(D.rival('md', g, null), 'td'); assert.equal(D.rival('ad', g, { 'ad-ro': 'x' }), 'md');
  assert.equal(D.rival('td', g, { 'md-td': 2, 'ad-td': 2 }), 'ad');   // 同じ数なら group の並びで a の次から数えて先の国
});
test('sanitize_broken', () => {
  for (const raw of [null, 'x', 1, [], { v: 2, mode: 'n2f' }]) assert.deepEqual(plain(D.sanitize(raw)), { v: 1, mode: 'f2n', mix: {}, clear: {} });
  assert.deepEqual(plain(D.sanitize({ v: 1, mode: 'm2f', mix: { 'ro-td': 3, 'bh-qa': '2', 'zz': 1, 'ad-md': -1, 'ad-ro': 1.5 }, clear: { td: 1, foo: 1, qa: 2 } })),
    { v: 1, mode: 'f2n', mix: { 'ro-td': 3 }, clear: { td: 1 } });
  assert.deepEqual(plain(D.sanitize({ v: 1, mode: 'n2f', mix: [], clear: 'x' })), { v: 1, mode: 'n2f', mix: {}, clear: {} });
  const raw = { v: 1, mode: 'n2f', mix: {}, clear: {} }; D.sanitize(raw); assert.deepEqual(raw, { v: 1, mode: 'n2f', mix: {}, clear: {} });
});
test('top_pairs', () => {
  const m = { 'ro-td': 3, 'bh-qa': 5, 'ad-md': 3, 'a1': 0 }; // 0 は数えない
  assert.deepEqual(plain(D.topPairs(m)), [{ a: 'bh', b: 'qa', k: 5 }, { a: 'ad', b: 'md', k: 3 }, { a: 'ro', b: 'td', k: 3 }]);
  assert.equal(D.topPairs(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}-b${i}`, i + 1]))).length, 5);
  assert.deepEqual(plain(D.topPairs(null)), []);
});
test('no_daily_core', () => {
  const errs = [], c = { window: {}, console: { error: m => errs.push(String(m)) } };
  c.globalThis = c; vm.createContext(c); vm.runInContext(read('dojo.js'), c);
  assert.equal(c.DOJO, undefined); assert.ok(errs.some(m => /\[dojo\]/.test(m)));
});
