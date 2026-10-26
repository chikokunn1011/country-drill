// docs/events.md（index.html と機能ファイルのイベントの約束）が、index.html の出すイベントと
// RPG・バッジのイベント、drill:* の detail のキーを全部書いているかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
// doc はテストごとに読む（無いときに全部のテストが FAIL になるように）
const doc = () => read('docs/events.md');
// バッククォートで囲んだ部分（コードスパン）の中身。1行の中だけを見る
const spans = s => [...s.matchAll(/`([^`\n]+)`/g)].map(m => m[1]);

const DRILL = ['drill:start', 'drill:answer', 'drill:result', 'drill:screen', 'drill:book-open', 'drill:misses-reset'];
const FEATURES = ['rpg:ready', 'rpg:coins', 'rpg:levelup', 'rpg:join', 'rpg:promote', 'rpg:pull', 'rpg:answer',
  'rpg:battle', 'rpg:clear', 'rpg:overcome', 'rpg:bounty', 'rpg:share', 'badge:earned', 'badge:title'];
// drill:* の detail のキー
const KEYS = ['sid', 'mode', 'kind', 'region', 'n', 'hint', 'a', 'right', 'first', 'missesBefore', 'missesAfter', 'streak',
  'outcome', 'done', 'firstTry', 'wrongs', 'attempts', 'best', 'timeMs', 'missed', 'name'];

test('events_doc_covers_index', () => {
  const names = [...new Set([...read('index.html').matchAll(/emit\('([\w:-]+)'/g)].map(m => m[1]))];
  for (const e of DRILL) assert.ok(names.includes(e), `index.html に emit('${e}' がない`);
  const d = doc();
  for (const e of names) assert.ok(d.includes('`' + e + '`'), `docs/events.md に \`${e}\` がない`);
});

test('events_doc_covers_features', () => {
  const d = doc();
  for (const e of FEATURES) assert.ok(d.includes('`' + e + '`'), `docs/events.md に \`${e}\` がない`);
});

test('events_doc_covers_keys', () => {
  // キーは1つのコードスパンの中に単語として出てくること（地の文やスパンをまたいだ一致は数えない）
  const s = spans(doc());
  for (const k of KEYS) {
    const re = new RegExp('\\b' + k + '\\b');
    assert.ok(s.some(x => re.test(x)), `docs/events.md のコードスパンに ${k} がない`);
  }
});
