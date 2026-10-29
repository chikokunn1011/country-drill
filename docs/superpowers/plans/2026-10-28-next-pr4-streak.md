# PR4 A5 れんぞく日数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームの `#home-status` に「🔥 N日れんぞく（さいこうM日）・お休み券K枚」と今週の7マスを出し、クイズ・今日の難問・冒険のバトルを終えた日を数える。

**Architecture:** 新しい `streak.js` の前半を DOM にさわらない `globalThis.STREAK_CORE`（vm で unit テスト）、後半を即時関数の DOM 部分（`drill:screen {name:'home'}` で描く・3つのイベントで数える）にする。保存は localStorage の `streak` 1つで、`TRANSFER_KEYS` に足して引き継ぎで移す。出題には一切かかわらない。

**Tech Stack:** HTML / クラシック script、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「A5 れんぞく日数（PR4）」・「実装の順番」・「チコに決めてほしいこと」1・4・5・「テストの方針」）

前提: PR0・PR1・PR3 はマージ済み。PR3（B6）の `#home-status`（空なら `:empty` で見えない。称号の札は prepend）と `homeEntry` がある。PR2（B4 国旗のファイル分け）はまだ main に無いので、PR2 の変更に頼らず、index.html のスクリプト読み込み・`flag()`・起動処理はなるべくさわらない（足すのは link 1行と script 1行と `profile.js?v=` だけ）。ファイル:行は PR3 マージ後の main（9a42d75）で確かめたもの。

## Global Constraints

- 出題は国旗・国名・場所だけ。首都を問わない。この PR は表示と記録だけで、出題・バッジ・冒険のコイン・苦手（misses）にさわらない。badges.js にさわらない。Supabase は変えない。
- 新しい色は作らない。使う変数は `--accent` `--ok` `--muted` `--line` `--surface` だけ。色の変数を書くなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。
- localStorage のキーは `streak` の1つ（`const KEY = 'streak'`）。形 `{ v:1, cur, best, last, played:[…], rest:[…] }`。`played` `rest` は直近14日ぶん。数は0〜1e5の整数。
- 日付は日本時間0時で切りかえ（`DAILY_CORE.jstDay()`）。週は月曜はじまり。日付の計算は UTC の通算日数（`DAILY_CORE.addDays`・`validDay` を使う）。
- お休み券は週に1枚・自動。同じ週に2日休む・8日以上あく → 連続が切れる。トーストは出さない。プロフィールの窓に日数を出さない。
- 新しいイベントは作らない。`storage` イベント・`visibilitychange` は使わない。
- `?v=`: `streak.js?v=1` `streak.css?v=1`（新規）、`profile.js?v=4` → `?v=5`（いまの main は `?v=4`。PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。
- 足りないもの（`store` `emit` `$` `DAILY_CORE` `#home-status`）があれば `console.error('[streak] …')` で行を出さない。リスナーは try/catch。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに: `node --test tests/unit/*.test.mjs` の全部と、変えた所に関係する e2e だけ（`cd tests/e2e && node --test --test-concurrency=1 a.test.mjs b.test.mjs`）。e2e の全体はこの計画の外で4本同時に流す。SQL は変えないので `bash tests/sql/run.sh` は要らない。とくに `transfer-keys` `cache_bust` `events-doc` `theme` `pc_layout`（1366×657 の home）`home`（`pc_fits` の 1280×577 など。れんぞく日数の行でホームが高くなる）。

## Review Focus

1. 端末の時計が戻った（today < last）→ 記録も表示も壊さず、「今日あそんだ」と同じ表示（Task 1 `view_clock_back`、`record_ignores_past`）。
2. 引き継ぎや手でいじった壊れた `streak`（文字列・`v:2`・負の数・1.5・ありえない日付・配列でない played）→ はじめての人と同じ表示、ページの例外0件（Task 1 `sanitize_broken`、Task 2 `home_row_broken_data`）。
3. 1日に何回遊んでも、`quit` を何回しても1日だけ（Task 3 `practice_counts_once`、`quit_not_counted`）。
4. 360px のスマホ幅（と、幅 340px の `#home-status`）で横スクロールが出ない・7マスは小窓で見られる（Task 2 `narrow_week_popup`）。
5. 大きな数（cur・best 99999）でも 1366×657 のホームが縦スクロールしない（Task 2 `pc_home_fits`）。

---

### Task 1: STREAK_CORE（数える計算）

**Files:**
- Create: `streak.js`（前半のみ。`globalThis.STREAK_CORE` を作る即時関数）
- Test: `tests/unit/streak.test.mjs`（新規。daily-core.test.mjs と同じく `vm` で `daily-core.js` → `streak.js` の順に読む）

**Interfaces:**
- Consumes: `DAILY_CORE.validDay(day): boolean`、`DAILY_CORE.addDays(day, n): string`（`globalThis.DAILY_CORE`。無ければ `STREAK_CORE` を作らずに `console.error('[streak] DAILY_CORE が無い')`）
- Produces（`globalThis.STREAK_CORE = { fresh, sanitize, record, view, weekOf }`。どれも引数を書きかえない）:
  - `fresh(): State` → `{ v:1, cur:0, best:0, last:null, played:[], rest:[] }`
  - `sanitize(x: any): State` — 正しければ同じ中身（`best < cur` なら `best = cur`）、どこか壊れていれば `fresh()`
  - `record(st: State, day: string): State`
  - `view(st: State, today: string): { cur, best, tickets, state: 'today'|'keep'|'rest'|'start', next: number|null, week: { day, mark: 'play'|'rest'|'miss'|'today'|'future' }[7] }`
  - `weekOf(day: string): string` — その週の月曜の `'YYYY-MM-DD'`

- [ ] **Step 1: 失敗するテストを書く**（日付は 2026-10-28 が水曜。週は 10/26〜11/1）

```js
const S = (o = {}) => ({ v: 1, cur: 5, best: 12, last: '2026-10-27', played: ['2026-10-27'], rest: [], ...o });
test('weekOf', () => {
  assert.equal(K.weekOf('2026-10-28'), '2026-10-26'); assert.equal(K.weekOf('2026-11-01'), '2026-10-26');
  assert.equal(K.weekOf('2026-10-26'), '2026-10-26'); assert.equal(K.weekOf('2027-01-01'), '2026-12-28');
});
test('record_first', () => assert.deepEqual(plain(K.record(K.fresh(), '2026-10-28')), { v: 1, cur: 1, best: 1, last: '2026-10-28', played: ['2026-10-28'], rest: [] }));
test('record_same_day_and_past', () => { const s = S({ last: '2026-10-28' });
  assert.deepEqual(plain(K.record(s, '2026-10-28')), plain(s)); assert.deepEqual(plain(K.record(s, '2026-10-20')), plain(s)); });   // record_ignores_past
test('record_next_day', () => { const r = K.record(S(), '2026-10-28'); assert.equal(r.cur, 6); assert.equal(r.best, 12); assert.equal(r.last, '2026-10-28'); });
test('record_best_grows', () => assert.equal(K.record(S({ cur: 12 }), '2026-10-28').best, 13));
test('record_ticket_bridges', () => { const r = K.record(S({ last: '2026-10-26' }), '2026-10-28'); assert.equal(r.cur, 6); assert.deepEqual(plain(r.rest), ['2026-10-27']); });
test('record_two_rests_same_week_breaks', () => {
  assert.equal(K.record(S({ last: '2026-10-26' }), '2026-10-29').cur, 1);                                  // 10/27・10/28 が同じ週
  assert.equal(K.record(S({ last: '2026-10-28', rest: ['2026-10-27'] }), '2026-10-30').cur, 1);           // 券はもう使った
});
test('record_sun_and_mon_two_tickets', () => { const r = K.record(S({ last: '2026-10-24', cur: 3 }), '2026-10-27');   // 土→火
  assert.equal(r.cur, 4); assert.deepEqual(plain(r.rest), ['2026-10-25', '2026-10-26']); });
test('record_gap_8_breaks', () => { const r = K.record(S({ last: '2026-10-20' }), '2026-10-28'); assert.equal(r.cur, 1); assert.deepEqual(plain(r.rest), []); });
test('record_keeps_14_days', () => { let s = K.fresh(); for (let i = 0; i < 20; i++) s = K.record(s, D.addDays('2026-10-01', i));
  assert.equal(s.played.length, 14); assert.equal(s.played[0], D.addDays('2026-10-20', -13)); assert.equal(s.cur, 20); });
test('record_does_not_mutate', () => { const s = S({ last: '2026-10-26' }), c = plain(s); K.record(s, '2026-10-28'); assert.deepEqual(plain(s), c); });
test('sanitize_broken', () => {
  for (const x of [null, 'x', 1, [], { v: 2 }, S({ cur: -1 }), S({ cur: 1.5 }), S({ best: 1e5 + 1 }), S({ last: '2026-13-01' }), S({ played: 'a' }), S({ rest: ['x'] })])
    assert.deepEqual(plain(K.sanitize(x)), plain(K.fresh()), JSON.stringify(x));
  assert.deepEqual(plain(K.sanitize(S())), plain(S())); assert.equal(K.sanitize(S({ cur: 20 })).best, 20);
});
test('view_states', () => {
  assert.deepEqual(pick(K.view(S(), '2026-10-28')), { cur: 5, best: 12, tickets: 1, state: 'keep', next: 6 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-26' }), '2026-10-28')), { cur: 5, best: 12, tickets: 0, state: 'rest', next: 6 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-20' }), '2026-10-28')), { cur: 0, best: 12, tickets: 1, state: 'start', next: 1 });
  assert.deepEqual(pick(K.view(K.fresh(), '2026-10-28')), { cur: 0, best: 0, tickets: 1, state: 'start', next: 1 });
  assert.deepEqual(pick(K.view(S({ last: '2026-10-28' }), '2026-10-28')), { cur: 5, best: 12, tickets: 1, state: 'today', next: null });
});
test('view_clock_back', () => assert.equal(K.view(S({ last: '2026-10-28' }), '2026-10-27').state, 'today'));
test('view_week', () => assert.deepEqual(K.view(S({ last: '2026-10-26', played: ['2026-10-26'] }), '2026-10-28').week.map(w => w.mark),
  ['play', 'rest', 'today', 'future', 'future', 'future', 'future']));   // 券でつながる予定の日は 'rest'
```
（`plain = x => JSON.parse(JSON.stringify(x))`、`pick = v => ({ cur, best, tickets, state, next })` だけ取り出す）

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/unit/streak.test.mjs` → FAIL（`streak.js` が無い）

- [ ] **Step 3: `streak.js` の前半に `STREAK_CORE` を作る**
  - `record`: 空いた日（last の翌日〜day の前日）が7日以上（day − last ≥ 8）なら `cur=1`・`rest` は増やさない。そうでなければ古い順に見て、その日の `weekOf` の週に `rest` がまだ無ければ `rest` に足し、無い日が1日でもあれば `cur=1`（この空きのために足した `rest` は戻す。修正ラウンド1で変更）、全部埋まれば `cur+1`。last が null なら `cur=1`。最後に `best=max`・`last=day`・`played` に day を足し、`played` `rest` を `addDays(day,-13)` 以上だけに切る。
  - `view`: `today <= last` は `'today'`（`cur` はそのまま・`next:null`）。そうでなければ `sim = record(st, today)` を作り、`st.cur > 0 && sim.cur === st.cur + 1` なら空いた日があれば `'rest'`、無ければ `'keep'`（`cur: st.cur`, `next: sim.cur`）。それ以外は `'start'`（`cur: 0`, `next: 1`、`sim` は使わない）。`tickets` と `week` の `'rest'` は、keep/rest のときは `sim.rest`、ほかは `st.rest` で、今日の週に `rest` があれば `tickets:0`。`week` の `'play'` は `st.played`。
  - `weekOf`: `Date.parse(day+'T00:00:00Z')/864e5` の通算日（1970-01-01 は木曜）から月曜まで戻す。

- [ ] **Step 4: 通るのを確かめる** — Run: `node --test 'tests/unit/*.test.mjs'` → PASS（fail 0。streak.js はまだ index.html から読まないので `cache_bust` などに影響なし）

- [ ] **Step 5: コミット** — `git add streak.js tests/unit/streak.test.mjs`、メッセージ「れんぞく日数の計算（STREAK_CORE）を足す」＋末尾2行

### Task 2: ホームの行・CSS・引き継ぎ

**Files:**
- Modify: `streak.js`（後半: DOM の即時関数）
- Create: `streak.css`
- Modify: `index.html`（`<link rel="stylesheet" href="streak.css?v=1">` を最後の機能 css の link（index.html:388 の `profile.css?v=3`）の後ろ、`<script src="streak.js?v=1">` を最後の機能 script（index.html:1493 の `daily.js?v=4`）の後ろ、`profile.js?v=4` → `?v=5`（index.html:1485））
- Modify: `profile.js:157`（`TRANSFER_KEYS` の末尾に `'streak'`）
- Test: `tests/unit/transfer-keys.test.mjs`、`tests/e2e/streak.test.mjs`（新規）
- Modify test: `tests/e2e/home.test.mjs`（PR3 の `status_empty_hidden`。れんぞく日数の行は0日でも消さないので、このテストだけ `blockScripts: ['streak.js']` を足して「札も行も無ければ見えない」を確かめる形にする）

**Interfaces:**
- Consumes: Task 1 の `STREAK_CORE`、index.html の `store.get(k, d)` `store.set(k, v)` `$` `emit`、`DAILY_CORE.jstDay()`、B6 の `#home-status`
- Produces: `#home-status` の最後の子 `<div id="streak" class="home-streak" role="group" aria-label="れんぞく日数">`（`.streak` はクイズの連続正解 `#pstreak` が使っているので、クラスは `home-streak`）。中に `.sk-text`（本文）・`.sk-hint`（今日あそぶと…）・`<button class="sk-open" aria-expanded aria-controls="sk-week">`・`<span id="sk-week" class="sk-week">` と `.sk-day[data-mark][data-day]` ×7。内部関数 `load(): State`（`STREAK_CORE.sanitize(store.get(KEY, null))`）と `render()`

- [ ] **Step 1: 失敗するテストを書く**

```js
// transfer-keys.test.mjs: 期待する一覧に 'streak' を足す
assert.deepEqual([...list('TRANSFER_KEYS')].sort(), ['badges', 'bdgcat', 'bview', 'daily', 'misses', 'nickname', 'rpg', 'settings', 'setup', 'streak'].sort());
```
e2e（`tests/e2e/streak.test.mjs`。時計は daily.test.mjs の `at(iso)` と同じ init で `'2026-10-28T03:00:00Z'`＝日本時間 10/28 水 12:00。`row = page.locator('#home-status > #streak')`）:
- `home_row_first_time`（storage なし）: `row` の role `group`・aria-label `れんぞく日数`、文字が `/0日れんぞく・お休み券1枚/` と `/今日あそぶと1日目/`、`さいこう` を含まない（best ≤ cur のときは出さない）。`#home-status` が見える。`#home-status` の最後の子が `#streak`。
- `home_row_keep`（`S()`）: `/5日れんぞく（さいこう12日）・お休み券1枚/`・`/今日あそぶと6日に！/`、`.sk-day` 7個、`data-mark` が `miss play today future future future future`。
- `home_row_rest`（`S({ last: '2026-10-26', played: ['2026-10-26'] })`）: `/きのうはお休み券でつながるよ/`・`/お休み券0枚/`。
- `home_row_broken`（`S({ last: '2026-10-20', cur: 9, best: 9 })`）: `/0日れんぞく（さいこう9日）/`・`/今日あそぶと1日目/`。
- `home_row_broken_data`（`streak: 'garbage'`）: first_time と同じ文字、`errors` 0件。
- `home_row_today`（`S({ last: '2026-10-28' })`）: `.sk-hint` が無いか空。
- `redraw_on_home`: `page.evaluate(() => { localStorage.setItem('streak', JSON.stringify(S2)); show('setup'); show('home'); })` で文字が変わる。`#streak` は1個のまま。
- `narrow_week_popup`（360×740、`S()`）: `#streak` に `.narrow` が付き、`.sk-week` 見えない・`.sk-open` 見える → 押すと `.sk-week` 見える・`aria-expanded="true"`、もう一度で閉じる。`measureFit(page).hscroll === false`。どの幅（360・390・1280・1366）でも「`.narrow` なし かつ `#streak` の `scrollWidth <= clientWidth`」か「`.narrow` あり かつ `.sk-open` が見える」のどちらか。
- `pc_home_fits`（1366×657、`S({ cur: 99999, best: 99999, last: '2026-10-27' })`）: `measureFit` で `docH <= ih`・`hscroll === false`。
- PR3 の `status_empty_hidden`（home.test.mjs）: opts に `blockScripts: ['streak.js']` を足す（中のアサーションは変えない）。streak.js を読むふつうの状態では `#home-status` が見えることは `home_row_first_time` で確かめる。
- `missing_parts`: `blockScripts: ['streak.js']` → `#streak` 0個・`errors` 0件。`init` で `#home-status` を消す（`DOMContentLoaded` で remove）→ `consoleErrors` に `/\[streak\]/`、`#streak` 0個。

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/unit/transfer-keys.test.mjs` と `node --test tests/e2e/streak.test.mjs` → FAIL

- [ ] **Step 3: 作る**
  - `streak.js` 後半: 即時関数。`NEED` を typeof で確かめ、`STREAK_CORE`・`$('home-status')` も確かめる（無ければ `console.error('[streak] …')` して return）。`const KEY = 'streak'`。`render()` は毎回 `load()` → `view(st, DAILY_CORE.jstDay())` → `#streak` を作るか中身を書きかえて `#home-status` に append（prepend しない）。本文は `🔥 ${cur}日れんぞく` ＋（`best > cur` のとき）`（さいこう${best}日）` ＋ `・お休み券${tickets}枚`。hint は keep `今日あそぶと${next}日に！`／rest `きのうはお休み券でつながるよ`／start `今日あそぶと1日目`／today なし。`drill:screen` で `name === 'home'` のときと、読み込み時に `document.body.dataset.screen === 'home'` のときに `render()`（try/catch）。`.sk-open` の click で `#streak` の `.open` と `aria-expanded` を切りかえる。
  - 「収まらない幅」は CSS の幅の決めうちにしない（PR3 の `.home-status` は幅 `min(340px, 100%)` の縦の flex なので、画面の幅では決まらない）。`render()` の最後と `resize` で、`.narrow` を外してから `#streak.scrollWidth > #streak.clientWidth` なら `.narrow` を付ける。（実装で決めたこと: かたまりは「本文」の行と「7マス＋今日あそぶと…」の行の2行。横1列に収まる広い PC では `.oneline` で1行にし、2行でも収まらなければ `.narrow`。≥1280 では `#home-status` を左の列の幅まで広げる。背の低い PC（≥900 かつ高さ ≤760、≥1280 かつ高さ ≤820）は行間を詰め、≥1280 かつ高さ ≤600（1280×577）は飾りの `.eyebrow` を隠して、home.test の `pc_fits`・pc_layout の `laptop_150pct_fits` を縦スクロールさせない）
  - `streak.css`: `.home-streak` は1行の flex（`flex-wrap: nowrap`、文字は `--muted`、数は `--accent`、`position: relative`）。`.sk-day` は小さい四角（`--line` の枠・`--surface` の地）、`[data-mark=play]` は `--ok`、`[data-mark=rest]` は `--accent` の枠、`[data-mark=today]` は太い枠。`.sk-open` はふだん隠す。`.home-streak.narrow` では `.sk-week` を隠して `.sk-open` を出し、`.home-streak.narrow.open .sk-week` を `#streak` の下に絶対配置の小窓（`--surface` の地・`--line` の枠）で出す。色の変数は作らない。
  - `profile.js` の `TRANSFER_KEYS` に `'streak'`、index.html の2行と `profile.js?v=` +1。

- [ ] **Step 4: 通るのを確かめる** — unit 全部と、e2e の `streak`・`home`・`cache_bust`・`theme`・`pc_layout`・`badges`（称号の札が先頭のまま）・`profile`（引き継ぎ）→ PASS。`phone_geometry_unchanged` は `#home-status` に行が増えるのでホームに差が出る（README のとおり扱う）。

- [ ] **Step 5: コミット** — `git add streak.js streak.css index.html profile.js tests/unit/transfer-keys.test.mjs tests/e2e/streak.test.mjs tests/e2e/home.test.mjs`、メッセージ「ホームにれんぞく日数の行を出し、引き継ぎで移す」＋末尾2行

### Task 3: 遊んだ日を数える・docs/events.md

**Files:**
- Modify: `streak.js`（リスナー3つと `countToday()`。index.html はさわらない。`streak.js?v=1` は新規なので同じ PR の中では上げない）
- Modify: `docs/events.md`（§9 読み込みの順番に `streak.js` を最後に足す。新しい節「## 11. streak.js が受け取るもの」）
- Test: `tests/e2e/streak.test.mjs`、`tests/unit/events-doc.test.mjs`

**Interfaces:**
- Consumes: `drill:result {outcome}`、`drill:daily {phase, outcome}`、`rpg:battle`（docs/events.md §2・§7）
- Produces: 内部関数 `countToday()`（`store.set(KEY, STREAK_CORE.record(load(), DAILY_CORE.jstDay()))`）。PR6 はここに `drill:dojo` の `phase === 'end' && outcome === 'clear'` で `countToday()` を呼ぶ1行と、events.md §11 の1行を足す。

- [ ] **Step 1: 失敗するテストを書く**
  - e2e `practice_counts_once`: 練習を `pickSetup(page, { kind: 'practice', count: 5 })`→`#start`→`clearByAnswering` → `JSON.parse(localStorage.streak)` が `{ cur: 1, last: '2026-10-28', played: ['2026-10-28'] }` を含む。もう1回遊んでも `cur` 1。ホームに戻ると `/1日れんぞく/`。トーストに `れんぞく` が出ない（`#toasts` の文字）。
  - `ta_fail_counts`: タイムアタックで `answerWrong` → `last === '2026-10-28'`。
  - `quit_not_counted`: 練習の1問目で `show('home')` → `localStorage.streak` が null のまま、行は `/今日あそぶと1日目/`。
  - `daily_counts`: `S()` を入れて `#home-daily`→`#dl-start`→`answerWrong` → `cur === 6`。
  - `battle_counts`: `openRpg(browser, { init: at(...) })`、`startBattle(page, 'samerica', 1)`→`winBattle` → `last === '2026-10-28'`。
  - unit `events_doc_streak`: §11 に `` `drill:result` `` `` `drill:daily` `` `` `rpg:battle` `` `` `streak` ``、§9 に `` `streak.js` ``。

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/e2e/streak.test.mjs tests/unit/events-doc.test.mjs` → FAIL（streak が null のまま・§11 が無い）

- [ ] **Step 3: 作る** — `drill:result` は `outcome` が `'clear'|'fail'`、`drill:daily` は `phase === 'end'` かつ `outcome` が `'clear'|'fail'`、`rpg:battle` は毎回、で `countToday()`。どれも try/catch で包み、画面は描き直さない（次の `drill:screen {name:'home'}` で描く）。events.md §11 は表（イベント・使うキー・すること）と「quit は数えない・1日1回・トーストなし・`drill:dojo` は A6 で足す」。

- [ ] **Step 4: 通るのを確かめる** — unit 全部と、e2e の `streak`・`daily`・`rpg_battle`・`result_guard` → PASS

- [ ] **Step 5: コミット** — `git add streak.js docs/events.md tests/e2e/streak.test.mjs tests/unit/events-doc.test.mjs`、メッセージ「クイズ・今日の難問・バトルを終えた日をれんぞく日数に数える」＋末尾2行
