// trivia.js（豆知識）の単体テスト。中身が data/trivia_facts.json と countries.js に合っているか、
// tools/make_trivia.py で作り直すと同じものになるか、おかしなデータを書かずに止まるかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
const plain = x => JSON.parse(JSON.stringify(x));
// ブラウザの代わりに vm で読み、window に置かれたものを返す
const load = (p, name) => { const ctx = { window: {} }; vm.runInNewContext(read(p), ctx); return ctx.window[name]; };
const KINDS = ['flag', 'geo', 'culture'];

// 一時ディレクトリを作って fn に渡し、終わったら消す
function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'trivia-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('trivia_covers_countries', () => {
  const TRIVIA = load('trivia.js', 'TRIVIA');
  const codes = plain(load('countries.js', 'COUNTRIES').map(c => c.a).sort());
  assert.equal(codes.length, 195);
  assert.deepEqual(plain(Object.keys(TRIVIA)), codes);
});

test('trivia_items_shape', () => {
  const TRIVIA = load('trivia.js', 'TRIVIA');
  let total = 0;
  for (const [a, list] of Object.entries(TRIVIA)) {
    assert.ok(list.length >= 3 && list.length <= 4, `${a} は ${list.length} 件`);
    for (const it of list) {
      assert.deepEqual(plain(Object.keys(it)), ['k', 't'], `${a} の項目のキー`);
      assert.ok(KINDS.includes(it.k), `${a} の種類 ${it.k}`);
      assert.ok(typeof it.t === 'string' && it.t.length > 0, `${a} の文が空`);
    }
    total += list.length;
  }
  assert.equal(total, 779);
});

test('trivia_from_source', () => {
  const want = {};
  for (const { a, k, t } of JSON.parse(read('data/trivia_facts.json'))) (want[a] ??= []).push({ k, t });
  assert.deepEqual(plain(load('trivia.js', 'TRIVIA')), want);
});

test('make_trivia_reproducible', () => withTmp(dir => {
  const out = join(dir, 'trivia.js');
  execFileSync('python3', ['tools/make_trivia.py', 'data/trivia_facts.json', out], { cwd: ROOT, stdio: 'pipe' });
  assert.ok(readFileSync(out).equals(readFileSync(join(ROOT, 'trivia.js'))), '作り直した trivia.js がちがう');
}));

test('make_trivia_rejects_bad_kind', () => withTmp(dir => {
  const items = JSON.parse(read('data/trivia_facts.json'));
  items.splice(5, 0, { a: 'jp', k: 'food', t: 'すしがある', note: 'テスト用' });
  const src = join(dir, 'bad.json'), out = join(dir, 'trivia.js');
  writeFileSync(src, JSON.stringify(items));
  assert.throws(() => execFileSync('python3', ['tools/make_trivia.py', src, out], { cwd: ROOT, stdio: 'pipe' }),
    e => e.status !== 0 && e.status != null && String(e.stderr).includes('bad item 5:'));
  assert.equal(existsSync(out), false, 'だめなデータでも出力ファイルが作られた');
}));
