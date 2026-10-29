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
  'rpg:battle', 'rpg:clear', 'rpg:overcome', 'rpg:bounty', 'rpg:share', 'rpg:tower', 'rpg:tower-end', 'badge:earned', 'badge:title'];
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

test('events_doc_covers_badges', () => {
  // badges.js の節: 払いのキー・称号の読み方・rpg.js へのお願い。どれもバッククォートで囲んだ形で書いてあること
  const d = doc();
  for (const s of ['paid', 'retro', 'badge:earned', 'badge:title', 'BADGES.title()', 'maxCombo', 'via', 'intro', 'floors'])
    assert.ok(d.includes('`' + s + '`'), `docs/events.md に \`${s}\` がない`);
});

test('events_doc_rpg_answer_timing', () => {
  // 10章: クイズの外で積んだ rpg:answer をいつ判定するか（次に判定するイベント＝ふつうは rpg:battle）。
  // ページを閉じた・隠れたときは保存だけして、そのあとの判定で判定する。visibilitychange ではページが残るので、次の起動とは限らない
  const sec = doc().split(/^## /m).find(s => s.startsWith('10.')) ?? '';
  const line = sec.split('\n').find(l => l.startsWith('- ') && l.includes('`rpg:answer`')) ?? '';
  for (const s of ['`rpg:battle`', '`pagehide`', '`visibilitychange`', '次の起動', 'そのあとの判定（次に判定するイベントか、次の起動時）'])
    assert.ok(line.includes(s), `10章の rpg:answer の行に ${s} がない: ${line}`);
  assert.ok(!line.includes('次の起動時の判定で判定する'), `visibilitychange のあとも次の起動で判定すると書いてある: ${line}`);
});

test('events_doc_badges_rpg_tower', () => {
  // 10章の badges.js の表: badges.js は rpg:tower で英雄の塔のバッジを判定し直す（RPG.snapshot().tower）。
  // 「使わない」の行には rpg:tower-end だけを残し、rpg:tower は入れない
  const sec = doc().split(/^## /m).find(s => s.startsWith('10.')) ?? '';
  const rows = sec.split('\n').filter(l => l.startsWith('| '));
  const unused = rows.find(l => l.endsWith('| 使わない |')) ?? '';
  assert.ok(unused.includes('`rpg:tower-end`'), `使わないの行に rpg:tower-end がない: ${unused}`);
  assert.ok(!unused.includes('`rpg:tower`'), `使わないの行に rpg:tower がある: ${unused}`);
  const row = rows.find(l => l.startsWith('| `rpg:tower` |')) ?? '';
  assert.ok(row.includes('英雄の塔') && row.includes('RPG.snapshot().tower'), `rpg:tower の行がない: ${row}`);
});

// ホームの入口を出す共通の部品と、ホームの差し込み口（B6）
test('events_doc_home_entry', () => {
  for (const s of ['homeEntry', '#home-status']) assert.ok(doc().includes('`' + s), s);
});

test('events_doc_streak', () => {
  // 11章: streak.js（れんぞく日数）が受け取るイベントと、使う localStorage のキー。9章の読み込みの順番にも streak.js
  const d = doc();
  const sec = d.split(/^## /m).find(s => s.startsWith('11.')) ?? '';
  for (const s of ['`drill:result`', '`drill:daily`', '`rpg:battle`', '`streak`', "`'quit'`"])
    assert.ok(sec.includes(s), `11章に ${s} がない`);
  const nine = d.split(/^## /m).find(s => s.startsWith('9.')) ?? '';
  assert.ok(nine.includes('`streak.js`'), '9章に `streak.js` がない');
});

test('events_doc_dojo', () => {
  const d = doc();
  const s2 = d.split('## 2.')[1].split('## 3.')[0]; assert.ok(s2.includes('`drill:dojo`'));
  for (const k of ['phase', 'pick', 'firstTry', 'wrongs']) assert.ok(spans(s2).some(x => new RegExp('\\b' + k + '\\b').test(x)), k);
  assert.ok(d.split('## 9.')[1].split('## 10.')[0].includes('`dojo.js`'));
  assert.match(d.split('## 11.')[1], /\| `drill:dojo` \|/);
});
