// data/flag_meanings.json（国旗の色と模様の意味）の単体テスト。
// 国のページに出す文なので、195か国そろっているか、長さと決まりを守っているかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const load = (p, name) => { const ctx = { window: {} }; vm.runInNewContext(read(p), ctx); return ctx.window[name]; };

test('meanings_shape', () => {
  const M = JSON.parse(read('data/flag_meanings.json'));
  assert.ok(Array.isArray(M));
  const codes = load('countries.js', 'COUNTRIES').map(c => c.a);
  assert.equal(codes.length, 195);
  assert.deepEqual(M.map(m => m.a).sort(), [...codes].sort(), '195か国が1件ずつ');
  for (const m of M) {
    assert.deepEqual(Object.keys(m).sort(), ['a', 'note', 't'], `${m.a} のキー`);
    assert.ok(typeof m.t === 'string' && m.t.length >= 40 && m.t.length <= 160, `${m.a} の t は40〜160字（${m.t.length}字）`);
    assert.ok(typeof m.note === 'string' && m.note.trim().length > 0, `${m.a} の note が空`);
    assert.ok(!m.t.includes('首都'), `${m.a} の t に「首都」`);
  }
});

test('meanings_not_trivia', () => {
  // 豆知識（trivia_facts.json）と同じ文をくり返さない
  const M = JSON.parse(read('data/flag_meanings.json'));
  const trivia = new Set(JSON.parse(read('data/trivia_facts.json')).map(x => x.t));
  for (const m of M) {
    for (const s of m.t.split('。').filter(Boolean)) assert.ok(!trivia.has(s), `${m.a} が豆知識と同じ文: ${s}`);
  }
});
