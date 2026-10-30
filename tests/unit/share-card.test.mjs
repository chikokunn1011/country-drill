// share-card.js（結果画像のシェア）の前半: 定数・data を整える normalize・マスの数を決める layout。
// DOM にさわらない部分だけを、ブラウザの代わりに vm で読み込んで確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { ctxWithI18n } from './i18n-load.mjs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
// 日本語の画面（i18n.js を先に読む。document が無いので日本語）
const ctx = ctxWithI18n();
vm.runInContext(read('share-card.js'), ctx);
// 英語の画面の vm（lang="en"、i18n.js → en-core.js・en-rank.js → share-card.js の順に読む）
function loadEn() {
  const c = vm.createContext({ console, document: { documentElement: { lang: 'en' } } });
  c.window = c;
  for (const f of ['i18n.js', 'i18n/en-core.js', 'i18n/en-rank.js', 'share-card.js']) vm.runInContext(read(f), c, { filename: f });
  return c.SHARECARD;
}
const plain = x => JSON.parse(JSON.stringify(x));
const S = ctx.SHARECARD, codes = n => Array.from({ length: n }, (_, i) => `x${i}`);

test('share_const', () => {
  assert.deepEqual(plain(S.SHARE), { url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', w: 1200, h: 675, maxFlags: 24 });
  assert.equal(Object.isFrozen(S.SHARE), true);
  // 日本語の画面: タグと URL は今のまま
  assert.equal(S.tag(), '#国旗マスター');
  assert.equal(S.url(), 'https://chikokunn1011.github.io/country-drill/');
});

// 英語の画面: タグは #FlagMaster、URL は英語版（SHARE そのものは日本語のまま）
test('share_en', () => {
  const E = loadEn();
  assert.equal(E.tag(), '#FlagMaster');
  assert.equal(E.url(), 'https://chikokunn1011.github.io/country-drill/en/');
  assert.equal(E.SHARE.tag, '#国旗マスター');
  assert.equal(E.SHARE.url, 'https://chikokunn1011.github.io/country-drill/');
});

test('layout_counts', () => {
  assert.deepEqual(plain(S.layout(S.normalize({ kind: 'ta', flags: codes(5) }))), { cells: codes(5), more: 0, cols: 5, rows: 1 });
  const l10 = S.layout(S.normalize({ kind: 'ta', flags: codes(10) })); assert.equal(l10.cols, 8); assert.equal(l10.rows, 2);
  const l24 = S.layout(S.normalize({ kind: 'ta', flags: codes(24) })); assert.equal(l24.cells.length, 24); assert.equal(l24.more, 0); assert.equal(l24.rows, 3);
});

test('layout_overflow', () => {
  const l = S.layout(S.normalize({ kind: 'ta', flags: codes(25) }));
  assert.equal(l.cells.length, 23); assert.equal(l.more, 2); assert.equal(l.rows, 3); assert.equal(l.cols, 8);
  assert.deepEqual(plain(l.cells), codes(23));
  const all = S.layout(S.normalize({ kind: 'ta', flags: codes(195) }));
  assert.equal(all.more, 172); assert.equal(all.cells.length, 23); assert.equal(all.rows, 3);
});

test('layout_empty', () => assert.deepEqual(plain(S.layout(S.normalize({ kind: 'ta', flags: [] }))), { cells: [], more: 0, cols: 0, rows: 0 }));

test('daily_has_no_flags', () => {
  const d = S.normalize({ kind: 'daily', flags: ['jp', 'fr'], grid: ['ok', 'ng', 'skip', 'x'] });
  assert.deepEqual(plain(d.flags), []); assert.deepEqual(plain(d.grid), ['ok', 'ng', 'skip', 'skip']);
  assert.deepEqual(plain(S.layout(d)), { cells: [], more: 0, cols: 0, rows: 0 });
});

test('data_has_no_name_or_capital', () => {   // 国名・首都などの余計なキーは落とす
  const d = S.normalize({ kind: 'ta', title: 't', big: '1:00.0', n: '日本', c: '東京', capital: '東京', name: 'チコ', flags: ['jp'] });
  assert.deepEqual(Object.keys(d).sort(), ['big', 'flags', 'grid', 'kind', 'rank', 'sub', 'text', 'title']);
  assert.equal(d.rank, null); assert.equal(d.sub, ''); assert.equal(d.text, '');
  assert.equal(S.normalize({ kind: 'zzz' }).kind, 'ta');
  assert.equal(S.normalize(null).kind, 'ta');
  // 文字列でないものは文字列に寄せる・配列でない flags は空にする
  const e = S.normalize({ kind: 'ta', title: 5, rank: 3, flags: 'jp', grid: 'ok' });
  assert.equal(e.title, ''); assert.equal(e.rank, null); assert.deepEqual(plain(e.flags), []); assert.deepEqual(plain(e.grid), []);
  assert.equal(S.normalize({ rank: '今日3位' }).rank, '今日3位');
  assert.deepEqual(plain(S.normalize({ flags: ['jp', 3, null, 'fr'] }).flags), ['jp', 'fr']);
});

test('normalize_does_not_mutate', () => {
  const x = { kind: 'daily', flags: ['jp'], grid: ['ok'] };
  const d = S.normalize(x);
  assert.deepEqual(x.flags, ['jp']);
  assert.notEqual(d.grid, x.grid);
});
