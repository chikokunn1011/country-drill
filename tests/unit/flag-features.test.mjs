// data/flag_features.json（国旗の特徴）と data/similar_tips.json（似ている国旗の見分け方）の単体テスト。
// 形がそろっているか、決まりどおりの例が入っているかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const load = (p, name) => { const ctx = { window: {} }; vm.runInNewContext(read(p), ctx); return ctx.window[name]; };
const KEYS = ['stars', 'cross', 'crescent', 'sun', 'animal', 'unionjack', 'vtricolor', 'htricolor', 'redwhite'];
const features = () => JSON.parse(read('data/flag_features.json'));

test('features_shape', () => {
  const F = features();
  assert.deepEqual(Object.keys(F.rules).sort(), [...KEYS].sort());
  for (const k of KEYS) assert.ok(typeof F.rules[k] === 'string' && F.rules[k].length > 0, `rules.${k}`);
  const codes = plain(load('countries.js', 'COUNTRIES').map(c => c.a)).sort();
  assert.equal(codes.length, 195);
  assert.deepEqual(Object.keys(F.flags).sort(), codes);
  for (const [a, list] of Object.entries(F.flags)) {
    assert.ok(Array.isArray(list), `${a} は配列`);
    for (const k of list) assert.ok(KEYS.includes(k), `${a} のキー ${k}`);
    assert.equal(new Set(list).size, list.length, `${a} に重複`);
  }
});

test('features_rules_examples', () => {
  const { flags } = features();
  const has = (a, ...ks) => { for (const k of ks) assert.ok(flags[a].includes(k), `${a} に ${k}`); };
  has('jp', 'sun', 'redwhite');
  has('dk', 'cross', 'redwhite');
  has('tr', 'crescent', 'stars', 'redwhite');
  has('fr', 'vtricolor');
  has('de', 'htricolor');
  has('au', 'unionjack', 'stars');
  has('gb', 'unionjack', 'cross');
  has('mx', 'vtricolor', 'animal');
  has('ar', 'sun');
  has('ca', 'redwhite');
  has('ch', 'cross', 'redwhite');
  assert.ok(!flags.pt.includes('cross'), 'pt に cross（紋章の中だけ）');
  // 確認で決めたこと（2026-10-30）: af は光の線だけで円が無い・jm と bi はななめの十字・il のダビデの星・lv は赤（公式）・qa はえんじ色
  assert.ok(!flags.af.includes('sun'), 'af に sun');
  has('jm', 'cross'); has('bi', 'cross'); has('il', 'stars'); has('lv', 'redwhite');
  assert.ok(!flags.qa.includes('redwhite'), 'qa に redwhite');
  has('np', 'sun', 'crescent');
});

test('features_theme_sizes', t => {
  const { flags } = features();
  const n = Object.fromEntries(KEYS.map(k => [k, Object.values(flags).filter(l => l.includes(k)).length]));
  t.diagnostic(KEYS.map(k => `${k}=${n[k]}`).join(' '));
  for (const k of ['stars', 'crescent', 'vtricolor', 'htricolor']) assert.ok(n[k] >= 10, `${k} が ${n[k]} か国`);
});

test('similar_tips_match', () => {
  const dctx = {}; vm.runInNewContext(read('daily-core.js'), dctx);
  const SIMILAR = plain(dctx.DAILY_CORE.SIMILAR);
  const tips = JSON.parse(read('data/similar_tips.json'));
  assert.equal(tips.length, SIMILAR.length);
  SIMILAR.forEach((g, i) => {
    const tip = tips[i];
    assert.deepEqual(tip.g, g, `${i} 番目のグループ`);
    assert.ok(typeof tip.t === 'string' && tip.t.trim() !== '' && tip.t.length <= 120, `${g.join(' ')} の t（${tip.t?.length} 字）`);
    assert.ok(typeof tip.note === 'string' && tip.note.trim() !== '', `${g.join(' ')} の note`);
  });
});
