// 豆知識の英訳（data/en/trivia_facts.json）と tools/trivia_en.mjs の単体テスト。
// 英訳は8つのかたまり（BATCHES）ごとに末尾へ足していくので、ここでは「いまある分」だけを確かめる
// （779件そろったことは trivia_en_complete が見る）。並び・id・ja の写しが日本語とずれていないか、
// 数・弱め方・「唯一／最大／初めて」が残っているか、首都の話や問いの形を足していないかを機械で見る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { BATCHES, triviaIds, sheet, buildTriviaEn, numbersOf, mergeBatch, patchEn } from '../../tools/trivia_en.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
const JA = JSON.parse(read('data/trivia_facts.json'));
const EN = JSON.parse(read('data/en/trivia_facts.json'));
const IDS = triviaIds(JA);
const plain = x => JSON.parse(JSON.stringify(x));
const load = (src, name) => { const ctx = { window: {} }; vm.runInNewContext(src, ctx); return ctx.window[name]; };

// 数の確かめ（trivia_en_numbers）の例外。id → 理由。
// 入れるときは「確かめた AI の名前: 理由」を書く（例: 'xx-1': 'B1 確かめ1（<AI>）: 1億2000万 → 120 million と書くため'）
const NUM_OK = {};

// tools と data だけを写した一時のルートで fn を動かす（CLI が本物の英訳を書きかえないように）
function withTmpRoot(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'trivia-en-'));
  try {
    for (const p of ['tools/trivia_en.mjs', 'data/trivia_facts.json']) cpSync(join(ROOT, p), join(dir, p));
    mkdirSync(join(dir, 'data/en'), { recursive: true });
    writeFileSync(join(dir, 'data/en/trivia_facts.json'), '[]\n');
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('batches_cover', () => {
  assert.equal(JA.length, 779);
  assert.equal(BATCHES.length, 8);
  let at = 0;
  for (const [s, e] of BATCHES) {
    assert.equal(s, at, `かたまり ${s} のはじめが前のおわりとつながらない`);
    assert.ok(e > s, `かたまり ${s}〜${e} が空`);
    if (e < JA.length) assert.notEqual(JA[e - 1].a, JA[e].a, `${e} の境目が国（${JA[e].a}）の途中`);
    at = e;
  }
  assert.equal(at, 779);
});

test('ids_unique', () => {
  assert.equal(IDS.length, 779);
  assert.equal(new Set(IDS).size, 779, 'id が重なる');
  for (const id of ['af-1', 'af-4', 'am-1']) assert.ok(IDS.includes(id), `${id} が無い`);
  assert.ok(!IDS.includes('af-5'), 'af は4件');
  assert.equal(IDS[0], 'af-1');
});

test('trivia_en_prefix_aligned', () => {
  assert.ok(Array.isArray(EN), '英訳は配列');
  assert.ok(EN.length === 0 || BATCHES.some(([, e]) => e === EN.length), `英訳の件数 ${EN.length} がかたまりのおわりでない`);
  EN.forEach((r, i) => {
    const j = JA[i];
    assert.deepEqual(Object.keys(r).sort(), ['a', 'id', 'ja', 'k', 't'], `${i} のキー`);
    assert.equal(r.id, IDS[i], `${i} の id`);
    assert.equal(r.a, j.a, `${r.id} の a`);
    assert.equal(r.k, j.k, `${r.id} の k`);
    assert.equal(r.ja, j.t, `${r.id} の ja が日本語の t とちがう（日本語が直った？）`);
  });
});

test('trivia_en_text_rules', () => {
  for (const { id, t } of EN) {
    assert.equal(typeof t, 'string', `${id} の t`);
    assert.ok(t.length >= 15 && t.length <= 200, `${id} の t は15〜200字（${t.length}字）`);
    assert.ok(!JA_RE.test(t), `${id} に日本語: ${t}`);
    assert.ok(t.endsWith('.'), `${id} が . で終わらない: ${t}`);
    assert.ok(!/[?{}'"]/.test(t), `${id} に ? { } ' " のどれか: ${t}`);
    assert.equal(t, t.trim(), `${id} の前後に空白`);
    assert.ok(!/\s\s/.test(t), `${id} に2つ続く空白`);
  }
});

test('trivia_en_numbers_fixture', () => {
  assert.deepEqual(numbersOf('約1900m'), ['1900']);
  assert.deepEqual(numbersOf('1万を超える'), ['10000']);
  assert.deepEqual(numbersOf('１,２００'), ['1200']);
  assert.deepEqual(numbersOf('about 1,900 m'), ['1900']);
  assert.deepEqual(numbersOf('more than 10,000'), ['10000']);
  assert.deepEqual(numbersOf('3億人'), ['300000000']);
  assert.deepEqual(numbersOf('2.5km'), ['2.5']);
  assert.deepEqual(numbersOf('数字なし'), []);
});

test('trivia_en_numbers', () => {
  EN.forEach((r, i) => {
    if (NUM_OK[r.id]) return;
    const have = new Set(numbersOf(r.t));
    for (const n of numbersOf(JA[i].t)) assert.ok(have.has(n), `${r.id}: 日本語の数 ${n} が英語に無い: ${r.t}`);
  });
});

test('trivia_en_hedges', () => {
  EN.forEach((r, i) => {
    const ja = JA[i].t;
    if (/とされ|と言われ|といわれ|説が|と考えられ/.test(ja)) {
      assert.match(r.t, /\b(said|reportedly|believed|considered|thought|according to|traditionally|legend|claimed|described)\b/i, `${r.id}: 弱め方が消えた: ${r.t}`);
    }
    if (ja.includes('約')) assert.match(r.t, /\b(about|around|roughly|nearly|approximately|some)\b/i, `${r.id}: 約 が消えた: ${r.t}`);
  });
});

test('trivia_en_superlatives', () => {
  EN.forEach((r, i) => {
    if (/唯一|世界で|世界一|最[大小高長古多深低]|いちばん|一番|初めて|最初/.test(JA[i].t)) {
      assert.match(r.t, /\b(only|first|largest|smallest|highest|longest|oldest|most|biggest|tallest|deepest|lowest|fewest|earliest)\b|world’s|in the world/i, `${r.id}: 唯一／最大／初めて が消えた: ${r.t}`);
    }
  });
});

test('trivia_en_no_quiz_wording', () => {
  EN.forEach((r, i) => {
    assert.doesNotMatch(r.t, /\b(quiz|guess)\b/i, `${r.id}: quiz／guess`);
    if (!JA[i].t.includes('首都')) assert.doesNotMatch(r.t, /\bcapital\b/i, `${r.id}: 日本語に無い capital`);
  });
});

test('sheet_modes', () => {
  const tr = sheet(JA, [], 1, 'translate');
  assert.ok(tr.includes('af-1'));
  assert.ok(tr.includes(JA[0].t), 'translate に日本語');
  assert.ok(tr.includes(JA[0].note), 'translate に note');
  assert.ok(tr.includes('事実・数・名前・年・理由'), 'translate の頭に決まり');
  assert.ok(!tr.includes(IDS[96]), 'B1 にほかのかたまりの行');
  assert.equal((tr.match(/^\| [a-z]{2}-\d+ \|/gm) || []).length, 96, 'B1 は96行');

  const fake = JA.slice(0, 96).map((j, i) => ({ id: IDS[i], a: j.a, k: j.k, ja: j.t, t: `English ${i}.` }));
  const fa = sheet(JA, fake, 1, 'faith');
  assert.ok(fa.includes('af-1') && fa.includes(JA[0].t) && fa.includes('English 0.'), 'faith に id・日本語・英語');
  assert.ok(!fa.includes(JA[0].note), 'faith に note を出さない');

  const en = sheet(JA, fake, 1, 'en');
  assert.ok(en.includes('af-1') && en.includes('English 95.'), 'en に id・英語');
  assert.ok(!JA_RE.test(en), 'en に日本語（決まりの文も英語）');
  assert.ok(!JA_RE.test(sheet(JA, [], 1, 'en')), 'en（英訳なし）に日本語');

  assert.throws(() => sheet(JA, [], 9, 'translate'));
  assert.throws(() => sheet(JA, [], 1, 'other'));
});

test('build_refuses_incomplete', () => {
  assert.throws(() => buildTriviaEn([]), /779/);
  const full = JA.map((j, i) => ({ id: IDS[i], a: j.a, k: j.k, ja: j.t, t: 'x' + i + '.' }));
  assert.throws(() => buildTriviaEn(full.slice(0, 778)), /779/);
  const badJa = full.map((r, i) => (i === 5 ? { ...r, ja: r.ja + '。' } : r));
  assert.throws(() => buildTriviaEn(badJa), /ja/);
  const swapped = [full[1], full[0], ...full.slice(2)];
  assert.throws(() => buildTriviaEn(swapped));

  const src = buildTriviaEn(full);
  assert.ok(src.startsWith('//'), '1行目はコメント');
  assert.ok(src.endsWith('};\n'));
  const got = plain(load(src, 'TRIVIA'));
  const ja = plain(load(read('trivia.js'), 'TRIVIA'));
  assert.deepEqual(Object.keys(got), Object.keys(ja), '国と並びが trivia.js と同じ');
  for (const a of Object.keys(ja)) {
    assert.equal(got[a].length, ja[a].length, `${a} の件数`);
    assert.deepEqual(got[a].map(x => x.k), ja[a].map(x => x.k), `${a} の k`);
  }
  assert.deepEqual(got.af[0], { k: 'flag', t: 'x0.' });
});

// かたまり N の {id: 英語} を作る（merge・patch のテスト用）
const mapOf = (n, f = id => `English for ${id}.`) => Object.fromEntries(IDS.slice(...BATCHES[n - 1]).map(id => [id, f(id)]));

test('merge_appends_batch', () => {
  const b1 = mergeBatch(JA, [], 1, mapOf(1));
  assert.equal(b1.length, 96);
  assert.deepEqual(b1[0], { id: 'af-1', a: 'af', k: JA[0].k, ja: JA[0].t, t: 'English for af-1.' });
  b1.forEach((r, i) => { assert.equal(r.id, IDS[i]); assert.equal(r.ja, JA[i].t); });
  // キーの並びが逆でも日本語の並びで足す
  const rev = Object.fromEntries(Object.entries(mapOf(2)).reverse());
  const b2 = mergeBatch(JA, b1, 2, rev);
  assert.equal(b2.length, 196);
  assert.deepEqual(b2.slice(96).map(r => r.id), IDS.slice(96, 196));
  assert.equal(b1.length, 96, 'もとの配列は変えない');
});

test('merge_refuses_bad_input', () => {
  const m = mapOf(1);
  const { 'af-1': _, ...missing } = m;
  assert.throws(() => mergeBatch(JA, [], 1, missing), /af-1/, '足りない id');
  assert.throws(() => mergeBatch(JA, [], 1, { ...m, 'my-1': 'Extra.' }), /my-1/, '余分な id');
  assert.throws(() => mergeBatch(JA, [], 1, { ...m, 'af-2': 3 }), /af-2/, '文字列でない');
  assert.throws(() => mergeBatch(JA, [], 2, mapOf(2)), /B1/, '前のかたまりがまだ');
  const b1 = mergeBatch(JA, [], 1, m);
  assert.throws(() => mergeBatch(JA, b1, 1, m), '同じかたまりを2度');
  assert.throws(() => mergeBatch(JA, [], 9, {}));
  assert.throws(() => mergeBatch(JA, [], 1, ['x']));
});

test('patch_replaces_text', () => {
  const b1 = mergeBatch(JA, [], 1, mapOf(1));
  const p = patchEn(b1, { 'af-2': 'Fixed text.', 'lb-4': 'Also fixed.' });
  assert.equal(p[1].t, 'Fixed text.');
  assert.equal(p[95].t, 'Also fixed.');
  assert.deepEqual({ ...p[1], t: b1[1].t }, b1[1], 't のほかは変えない');
  assert.equal(b1[1].t, 'English for af-2.', 'もとの配列は変えない');
  assert.throws(() => patchEn(b1, { 'my-1': 'Not yet.' }), /my-1/, 'まだ無い id');
  assert.throws(() => patchEn(b1, { 'zz-1': 'No.' }), /zz-1/);
  assert.throws(() => patchEn(b1, { 'af-1': '' }), /af-1/, '空の文');
  assert.throws(() => patchEn(b1, {}), '空の直し');
});

test('merge_patch_cli', () => withTmpRoot(dir => {
  const run = (...args) => execFileSync('node', [join(dir, 'tools/trivia_en.mjs'), ...args], { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  const f = join(dir, 'b1.json');
  writeFileSync(f, JSON.stringify(mapOf(1)));
  run('merge', '1', f);
  const en = JSON.parse(readFileSync(join(dir, 'data/en/trivia_facts.json'), 'utf8'));
  assert.equal(en.length, 96);
  writeFileSync(f, JSON.stringify({ 'af-3': 'Patched.' }));
  run('patch', f);
  assert.equal(JSON.parse(readFileSync(join(dir, 'data/en/trivia_facts.json'), 'utf8'))[2].t, 'Patched.');
  writeFileSync(f, JSON.stringify({ 'my-1': 'Too early.' }));
  const before = readFileSync(join(dir, 'data/en/trivia_facts.json'), 'utf8');
  assert.throws(() => run('patch', f));
  assert.throws(() => run('merge', '1', f));
  assert.equal(readFileSync(join(dir, 'data/en/trivia_facts.json'), 'utf8'), before, '止まったときは書かない');
}));
