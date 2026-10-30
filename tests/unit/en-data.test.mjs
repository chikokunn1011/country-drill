// data/en/*.json（英語版の国旗の意味・似た国旗の見分け方・特徴の数え方）の単体テスト。
// 日本語のデータと件数・並びがそろっているか、日本語が残っていないか、弱め方が残っているかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JA_RE } from '../../tools/i18n_scan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

test('meanings_en_shape', () => {
  const JA = json('data/flag_meanings.json');
  const EN = json('data/en/flag_meanings.json');
  assert.equal(EN.length, 195);
  assert.deepEqual(EN.map(m => m.a), JA.map(m => m.a), 'a の並びが日本語と同じ');
  for (const m of EN) {
    assert.deepEqual(Object.keys(m).sort(), ['a', 't'], `${m.a} のキー`);
    assert.ok(typeof m.t === 'string' && m.t.length >= 60 && m.t.length <= 480, `${m.a} の t は60〜480字（${m.t.length}字）`);
    assert.ok(!JA_RE.test(m.t), `${m.a} の t に日本語`);
    assert.ok(!/capital/i.test(m.t), `${m.a} の t に capital`);
  }
});

test('meanings_en_hedges', () => {
  const JA = json('data/flag_meanings.json');
  const EN = new Map(json('data/en/flag_meanings.json').map(m => [m.a, m.t]));
  for (const j of JA) {
    const e = EN.get(j.a);
    if (j.t.includes('公式には決まっていない')) assert.match(e, /no official/i, `${j.a}: 公式には決まっていない → no official`);
    if (j.t.includes('とされる')) assert.match(e, /said to|considered|believed|traditionally|often/i, `${j.a}: とされる の弱め方`);
  }
});

test('meanings_en_first_sentence', () => {
  for (const m of json('data/en/flag_meanings.json')) {
    const i = m.t.indexOf('. ');
    const first = i < 0 ? m.t : m.t.slice(0, i + 1);
    assert.ok(first.length <= 160, `${m.a} の最初の文が160字を超える（${first.length}字）`);
  }
});

test('tips_en_shape', () => {
  const JA = json('data/similar_tips.json');
  const EN = json('data/en/similar_tips.json');
  assert.equal(EN.length, 25);
  assert.deepEqual(EN.map(x => x.g), JA.map(x => x.g), 'g が日本語と同じ並び・中身');
  for (const x of EN) {
    assert.deepEqual(Object.keys(x).sort(), ['g', 't'], `${x.g} のキー`);
    assert.ok(typeof x.t === 'string' && x.t.length > 0 && x.t.length <= 200, `${x.g} の t は200字以内（${x.t.length}字）`);
    assert.ok(!JA_RE.test(x.t), `${x.g} の t に日本語`);
  }
});

test('rules_en_shape', () => {
  const JA = json('data/flag_features.json').rules;
  const EN = json('data/en/feature_rules.json');
  assert.deepEqual(Object.keys(EN), Object.keys(JA), 'キーが flag_features.json の rules と同じ9つ');
  assert.equal(Object.keys(EN).length, 9);
  for (const [k, v] of Object.entries(EN)) {
    assert.ok(typeof v === 'string' && v.length > 0, `${k} が空`);
    assert.ok(!JA_RE.test(v), `${k} に日本語`);
  }
});
