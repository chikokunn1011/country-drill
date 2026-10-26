# 共通フック＋豆知識 実装計画（計画 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バッジ（計画 C）と RPG（計画 D）が共通で使う index.html のフック H1〜H9 とイベントの約束（`docs/events.md`）を1回だけ入れ、正解したときと図鑑に豆知識（779件）を出し、結果画面のボタンの連打対策を入れる。

**Architecture:** index.html のインライン script に `emit()`（`document` への CustomEvent）・`endGame(outcome)`（`drill:result` を1ゲーム1回だけ出す）・`registerScreen()`・`toast()` を足し、機能ファイルは CustomEvent でだけつながる（リスナーの例外はクイズに伝わらない）。豆知識は `tools/make_trivia.py` が `data/trivia_facts.json` から生成する `trivia.js`（`window.TRIVIA`）で、読めなくてもクイズは今までどおり動く。

**Tech Stack:** 素の HTML/CSS/JS（ビルドなし）、Python 3（生成スクリプトだけ。標準ライブラリのみ）、テストは `node --test`（Node 22）・Playwright（`createRequire` でグローバルのものを使う）。

**Spec:** `docs/superpowers/specs/2026-10-26-platform-hooks-trivia-design.md`（これが正）。フックの中身は `docs/superpowers/specs/2026-10-26-rpg-design.md` §10.2・§10.3、バッジ側の決まりは `docs/superpowers/specs/2026-10-26-badges-design.md` §5.3・§8・§9.2、PC レイアウトの名前は `docs/superpowers/specs/2026-10-26-pc-layout-design.md` §3.2・§5.4・§5.5・§6。

## Global Constraints

- 設計書（どれもリポジトリ直下からの相対パス）: この計画の正 `docs/superpowers/specs/2026-10-26-platform-hooks-trivia-design.md`、RPG 設計 `docs/superpowers/specs/2026-10-26-rpg-design.md`（§10.2 フック H1〜H9、§10.3 イベントの約束）、バッジ設計 `docs/superpowers/specs/2026-10-26-badges-design.md`（§5.3 トースト、§8 イベントの約束、§9.2 index.html の変更）、PC レイアウト設計 `docs/superpowers/specs/2026-10-26-pc-layout-design.md`（§3.2 トップバー、§5.4 クイズ、§5.5 結果、§6 index.html の変更点、§7 pc.css、§9 テストの大きさ）
- 前提: 計画 A（PC レイアウト）が入った HEAD から始める。作業前に次が全部あることを確かめ、1つでも無ければ作業を止めて報告する: `pc.css`（リポジトリ直下。index.html から `<link rel="stylesheet" href="pc.css" media="(min-width: 900px)">` で読む）、`show()` の中の `document.body.dataset.screen = name;`、`nextQuestion()` の `.rslot`、`answer()` の `slot.replaceWith(r)`、`showResult()` の `<div class="rside" id="r-side">`
- フックの位置は「どの行の直後／直前」というアンカーで決める（行番号は使わない）。アンカーの行が見つからないときは推測で入れず報告する
- フックのコードは RPG 設計 §10.2 のとおり（この計画の各タスクに写してある）。名前を変えない: `emit` `screenRender` `registerScreen` `toast` `endGame` `G.sid` `G.hint` `G.ended`
- イベント名と detail のキーはこの計画のとおり。キーは足すだけで、消したり名前を変えたりしない
- `startGame` に引数を足さない（`#r-again` などがクリックイベントを渡してくるため）
- index.html に冒険・バッジのボタン、`<section>`、`rpg.css` / `badges.css` / `rpg.js` / `badges.js` の読み込みは足さない（計画 C・D の仕事）
- スマホ（〜899px）の見た目を変えない（豆知識の欄が増えるのは除く）。PC も、空の差し込み口（`#r-ext` `#topbar-extra`）では見た目を変えない
- 新しい外部ライブラリ・CDN は増やさない。ファイル名は半角英数字だけ
- 豆知識の文字は必ず `esc()` を通す
- `/mnt/project-files` はネットワークのマウント。`/mnt/project-files/country-drill-features-20261026/trivia_facts_checked.json` は Task 6 で1回だけコピーし、以後はリポジトリの `data/trivia_facts.json` を使う
- コマンドはすべてリポジトリ直下（`/home/claude/country-drill`）で実行する
- テストの実行: `node --test 'tests/unit/*.test.mjs'`、`node --test 'tests/e2e/*.test.mjs'`（glob はクォートする。Node 22 はディレクトリを受け付けない）、`bash tests/sql/run.sh`。1ファイルだけなら `node --test tests/e2e/hooks.test.mjs`、1テストだけなら `--test-name-pattern '^名前$'` を足す
- スマホ幅の要素の位置の比較は計画 A の `GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs`（基準は計画 A の前のコミットを git から自動で取り出すので、作り直すものはない。計画 A の `pageGeometry` は幅も高さも 0 の要素を数えないので、空の `#topbar-extra` `#r-ext` は差にならない）
- CDN と supabase.co はつながらない（e2e は `tests/e2e/helpers.mjs` が差し替える）。Playwright は入っている。`playwright install` は実行しない
- 各タスクの最後に、そのタスクのテストに加えて既存のテスト（unit / e2e 全部）が通ること
- コミットメッセージは日本語。各タスクで1コミット
- 決めたこと（レビューへの答え）: 計画 A のテストが結果画面ですぐボタンを押していたら `settleResult` を足す（Task 1）。計画 A の `result_single_column_when_side_empty` の「`#r-side` の子が0個」は「子は空の `#r-ext` だけ」に直す（Task 4）。豆知識の欄はスマホの答え合わせと図鑑を下に伸ばすので、Task 7 のあとの `phone_geometry` の差は豆知識が出る場面だけを正しいとする（Task 7）

## Review Focus

1. **最後の問題での連打・Enter の押しっぱなし・結果のリスナーが遅い** — 2回目が結果画面の［もう一回］に当たって新しいゲームが始まり、`drill:result` の直後に `drill:start` が出てしまう。250ms は結果画面を出した**後**から数える（`drill:result` のリスナーの時間を含めない）。`e.repeat` も無視する（Task 1 の `held_enter_on_result`、Task 2 の `dblclick_last_next_once` と `result_guard_slow_listener`）
2. **リスナーが遅い・例外を投げる** — タイムアタックの最後の回答のリスナーの時間がタイムに入らないこと、6種類どのイベントの例外でもクイズと画面の切りかえが止まらないこと（Task 2 の `ta_time_excludes_listener`、Task 2・3 の `listener_throws_quiz_continues`）
3. **空の `#r-ext` で PC の結果画面が2列になる** — pc.css は `.rside:empty` で列を決めているので、空の `#r-ext` が入ると「まちがえた国」が無くても右の列ができてしまう（Task 4 の `r_ext_layout_pc`）
4. **豆知識のデータがおかしい・無い・`<` や `&` が入っている** — `trivia.js` が読めない、その国が無い、配列でない、項目が `null` や `t` 無し、のどれでも例外もレイアウト崩れも起きず、文字は HTML として解釈されない（Task 7 の `works_without_trivia_js` `missing_country_no_trivia` `malformed_trivia_ignored` `trivia_escaped`）
5. **豆知識が入って PC のクイズがはみ出す** — 長い国名・首都、ドパガキ向け、背の低い画面（1280×577 など）、下の帯（900〜1279）で、答えの欄が `#qcard` の上下からはみ出す・重なる（Task 7 の `fits_pc` `fits_strip` `book_map_fits_pc`）

---

### Task 1: 結果画面の連打対策（250ms と押しっぱなし）

**Files:**
- Modify: `index.html`（`showResult()` と、その直後にリスナー2つ）
- Modify: `tests/e2e/helpers.mjs`（`settleResult` を足し、`clearTimeAttack` の最後で呼ぶ）
- Modify: 結果画面ですぐボタンを押している既存の e2e（Step 3 の grep で見つかったものだけ）
- Create: `tests/e2e/result_guard.test.mjs`

**Interfaces:**
- Consumes: 既存の `TA_GUARD_MS`（= 250）、`showResult()`、`#rcard`、helpers の `startServer` `openApp` `pickSetup` `answerCorrect` `settle` `clearTimeAttack`
- Produces:
  - index.html のトップレベル `let resultAt = 0;`（結果画面を出した時刻 `performance.now()`。e2e から名前で読める）
  - `helpers.mjs`: `export const settleResult = page => page.waitForFunction(() => performance.now() - resultAt >= TA_GUARD_MS);`。`clearTimeAttack(page, opts)` は結果画面が出たあと `settleResult(page)` まで待ってから返す（既存の submit / ranking テストがすぐ［載せる］を押すため）

- [ ] **Step 1: 失敗するテスト `tests/e2e/result_guard.test.mjs` を書く**（スマホ幅、偽 Supabase。ファイルの形は `tests/e2e/timeattack.test.mjs` と同じ: `t(name, fn)` で毎回新しいコンテキストを開き、最後に `errors` が空）

- `click_guard_after_last_answer`: タイムアタック 国旗→国名・全世界・5問。4問 `answerCorrect`、`settle(page)` のあと1回の `page.evaluate` の中で `const g = G;` →「最後の正解の `.choice`（`.choice[data-a="${G.cur.c.a}"]`）を `.click()` → すぐ `$('r-again').click()`」→ `{ same: G === g, result: !$('scr-result').hidden, timeMs: G.timeMs }` を返す。`same` と `result` が true・`timeMs !== null`。そのあと `settleResult(page)` → `page.click('#r-again')` で `#scr-quiz` が表示され `#pnum` が `1 / 5`
- `submit_guard`: 上と同じく最後の正解の直後の同じ evaluate で `$('ta-name').value = 'チコ'; $('ta-submit').click();` → 300ms 待って `db.calls` に `submit_score` が0件、`#ta-msg` が空。`settleResult` のあと `#ta-submit` をクリック → `#ta-msg` に `載せたよ！` が出て submit は1件
- `held_enter_on_result`: 練習 国旗→国名・全世界・5問。4問は `answerCorrect` → `page.click('#next')`。5問目を `answerCorrect` したら（`#next` が `結果を見る` でフォーカスされている）`page.keyboard.down('Enter')` → `#scr-result` 表示。`settleResult` のあともう一度 `page.keyboard.down('Enter')`（Playwright は2回目を `repeat: true` で送る）→ まだ `#scr-result` が表示中。`page.keyboard.up('Enter')` → `page.keyboard.press('Enter')` → `#scr-quiz` が表示（押しっぱなしでないEnterは効く）
- `typing_in_name_not_blocked`: `clearTimeAttack(page)` のあと `page.focus('#ta-name')` して `page.keyboard.down('a')` を2回（2回目は repeat）→ `#ta-name` の値が `aa`（入力欄の押しっぱなしは止めない）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/result_guard.test.mjs`
Expected: `settleResult` / `resultAt` が無くて FAIL

- [ ] **Step 3: 実装**

- `let resultAt = 0;` を `function showResult()` の直前に置き、1行コメント（結果画面を出した時刻。最後の問題の連打が結果のボタンに当たらないように使う）
- `showResult()` の中、`show('result');` の直後（`$('r-again').focus({ preventScroll: true });` の前）に `resultAt = performance.now();`。`show('result')` より前に置かない（Task 2 でその前に `drill:result` のリスナーが走るようになり、リスナーの時間が 250ms に食いこむため）
- `showResult()` の閉じ `}` の直後、コメント `// タイムアタックの結果画面：…` の行の前に2つ:
  - `$('rcard').addEventListener('click', e => { … }, true)`: `performance.now() - resultAt < TA_GUARD_MS` かつ `e.target.closest('button')` なら `e.preventDefault(); e.stopImmediatePropagation();`（キャプチャで止めるので、ボタンの `onclick` もフォームの送信も起きない）
  - `document.addEventListener('keydown', e => { … }, true)`: `e.repeat` かつ `!$('scr-result').hidden` かつ `e.target.closest?.('#rcard button')` なら `e.preventDefault()`（入力欄は対象外）
- `helpers.mjs` に `settleResult` を足し、`clearTimeAttack` の `await page.locator('#scr-result').waitFor();` の後に `await settleResult(page);`
- 既存の e2e（計画 A の `tests/e2e/pc_layout.test.mjs` `tests/e2e/layout.mjs` をふくむ）を `grep -n "r-again\|r-setup\|ta-submit\|ta-open" tests/e2e/*.mjs` で探し、結果画面が出た直後（`clearTimeAttack` を通らずに `#scr-result` を待った・`showResult()` を呼んだ・最後の `#next` を押した直後）にそれらを押しているところには、押す前に `await settleResult(page);` を足す（`import` も足す）。`clearTimeAttack` の後なら足さなくてよい

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/e2e/result_guard.test.mjs && node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs'`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/e2e/
git commit -m "結果画面を出してから250msとキーの押しっぱなしでは結果のボタンを押せないようにする"
```

---

### Task 2: ゲームのイベント（drill:start / drill:answer / drill:result）

**Files:**
- Modify: `index.html`（H1 `emit`、H3 の1行目、H4a・H4、H5、H6、H7 の `endGame('clear')`、H8 `endGame`）
- Modify: `tests/e2e/helpers.mjs`（`recordEvents` `events` `clearByAnswering` を足す）
- Create: `tests/e2e/hooks.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `settleResult(page)`（結果画面のボタンを押す前に必ず待つ）と index.html の `resultAt`（`showResult()` の `show('result');` の直後で決まる）。既存の `G` `S` `P` `store` `misses` `byA` `startGame` `nextQuestion` `answer` `showResult` `show`、helpers の `startServer` `openApp` `pickSetup` `answerCorrect` `answerWrong` `settle` `clearTimeAttack`
- Produces（index.html のグローバル。計画 C・D と Task 3〜5 が使う）:
  - `emit(type: string, detail: object) -> void`
  - `endGame(outcome: 'clear'|'fail'|'quit') -> void`（`G` が無いか `G.ended` なら何もしない）
  - `G.sid: string`、`G.hint: boolean`、`G.ended: true|undefined`
  - イベント（`document` に出る）:
    - `drill:start` `{sid, mode, kind, region, n, hint}`
    - `drill:answer` `{sid, a, right, first, missesBefore, missesAfter, mode, kind, region, hint, streak}`
    - `drill:result` `{sid, outcome, mode, kind, region, n, done, firstTry, wrongs, attempts, best, timeMs, hint, missed}`
  - `helpers.mjs`:
    - `recordEvents(page) -> Promise<void>`: ページに `window.__ev = []` を作り、`drill:start` `drill:answer` `drill:result` `drill:screen` `drill:book-open` `drill:misses-reset` の6つを `{ type: e.type, ...e.detail }` で積むリスナーを付ける（ページを開いた直後に1回呼ぶ）
    - `events(page, type?) -> Promise<object[]>`: `window.__ev` を返す（type を渡せばその種類だけ）
    - `clearByAnswering(page) -> Promise<void>`: 練習・挑戦を結果画面まで進める。`$('scr-result').hidden` が true の間 `answerCorrect(page)` → `page.click('#next')` をくり返す。`G.set.length * 3` 回まわっても結果画面にならなければ `Error('clearByAnswering: no result')` を投げる。`settleResult` は呼ばない（呼ぶ側が決める）

フックのコード（RPG 設計 §10.2 のまま。位置はアンカーで）:

```js
// H1: `const store = {…};` の直後
const emit = (type, detail) => document.dispatchEvent(new CustomEvent(type, { detail }));

// H3（このタスクは1行目だけ）: function show(name) { の直後の1行目
if (name !== 'quiz' && name !== 'result' && G && !G.ended) endGame('quit'); // クイズを途中で離れた（やめる・トップバー）

// H4a: function startGame() { の直後の1行目
if (G && !G.ended) endGame('quit');

// H4: startGame() の `G = { mode: modeOf(P.mode), … };` の直後
G.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
G.hint = !!(G.mode.nameOpt && P.name && G.kind !== 'ta');
emit('drill:start', { sid: G.sid, mode: G.mode.k, kind: G.kind, region: S.region, n: set.length, hint: G.hint });

// H5: answer() の `if (right) {` の直前に1行
const mb = misses[c.a] || 0;
// H5: answer() の `store.set('misses', misses);` の直後に1行（タイムアタックの「正解ならすぐ次へ」の return より前）
emit('drill:answer', { sid: G.sid, a: c.a, right, first, missesBefore: mb, missesAfter: misses[c.a] || 0,
  mode: G.mode.k, kind: G.kind, region: S.region, hint: G.hint, streak: G.streak });

// H6: answer() の `if (G.kind === 'ta') { G.failed = true; …; }` のブロックの中の最後
endGame('fail');

// H7（このタスクは endGame だけ）: showResult() の `show('result');` の直前の行
endGame('clear');

// H8: function showResult() の直前（Task 1 の `let resultAt` より前）
function endGame(outcome) {            // 1回のゲームにつき必ず1回だけ drill:result を出す
  if (!G || G.ended) return;
  G.ended = true;
  emit('drill:result', { sid: G.sid, outcome, mode: G.mode.k, kind: G.kind, region: S.region,
    n: G.set.length, done: G.done, firstTry: G.firstTry, wrongs: G.wrongs, attempts: G.attempts,
    best: G.best, timeMs: G.timeMs ?? null, hint: G.hint, missed: [...G.missed] });
}
```

- [ ] **Step 1: helpers を足し、失敗するテスト `tests/e2e/hooks.test.mjs` を書く**（偽 Supabase。`t(name, fn, opts = {})` は `tests/e2e/ranking.test.mjs` の `t` と同じ形で毎回 `openApp(browser, opts)` で新しいコンテキストを開き（`opts.viewport` を省けばスマホ幅）、`recordEvents(page)` を呼んでから `fn(page, app)` を実行し、最後に `errors` が空であることを見る。例外を投げるテストだけは別の書き方にする）

`results = await events(page, 'drill:result')` として:

- `practice_clear_once`: 練習 f2n・全世界・5問。1問目を `answerWrong` → `#next` → 残りを `clearByAnswering`。`results` が1件で `{outcome:'clear', mode:'f2n', kind:'practice', region:'all', n:5, done:5, wrongs:1, attempts:1, timeMs:null, hint:false}`、`missed` が1問目の国だけ、`sid` が `drill:start` の `sid` と同じ。`settleResult` → `#r-setup` → `#brand` のあとも1件のまま
- `challenge_restart_clear_once`: 挑戦 f2n・全世界・5問。1問正解 → `#next` → 2問目で `answerWrong` → `#next`（`最初から →`）→ `clearByAnswering`。`results` が1件で `outcome:'clear'`・`attempts:2`、`drill:start` も1件だけ（やり直しでは出ない）
- `ta_clear_once`: `clearTimeAttack(page)`。`results` が1件で `outcome:'clear'`・`kind:'ta'`・`timeMs` が `G.timeMs` と同じ数。`#brand` → `#home-play` のあとも1件
- `ta_fail_once`: タイムアタック5問、1問正解・2問目 `answerWrong`。`results` が1件で `outcome:'fail'`・`done:1`・`timeMs:null`。`drill:answer` が2件で2件目が `right:false`、`__ev` の中で2件目の `drill:answer` が `drill:result {fail}` より前。失格画面の［モード選択へ］（`.reveal .btn.ghost`）を押しても `results` は1件のまま
- `ta_fail_retry`: 失格のあと［もう一回］（`#next`）→ `drill:start` が2件・`results` は1件のまま。新しいゲームで `#quit` → `results` が2件で2件目は `outcome:'quit'`・新しい `sid`
- `quit_button_once`: 練習で1問正解して `#next` → `#quit`。`results` が1件で `outcome:'quit'`・`done:1`。もう一度モード選択 → ホームへ行っても1件
- `topbar_leaves_once`: `#to-book`、`#to-settings`、`#brand` のそれぞれについて、練習を始めて1問答え、そのボタンを押す → そのたびに `quit` が1件増え、合計3件で `sid` が全部ちがう
- `ranking_new_game`: タイムアタック5問を始めて1問正解 → `#brand` → `#home-rank` → `#rk-play` → `#start` → 5問正解して結果画面。`results` が `[quit(1つ目のsid), clear(2つ目のsid)]` の2件（ボタンの文言は「この条件で遊ぶ」。モード選択を通る）
- `start_game_while_playing`: 練習で1問答えたあと `page.evaluate(() => startGame())`（H4a）→ `results` が1件で `outcome:'quit'`・前の `sid`、`drill:start` が2件
- `r_again_after_clear`: `clearTimeAttack` → `#r-again` → `results` は1件のまま、`drill:start` は2件
- `dblclick_last_next_once`: 練習5問を最後の問題の正解まで進め、`page.dblclick('#next')` → `results` 1件・`drill:start` 1件・`#scr-result` が表示中
- `result_guard_slow_listener`: 始める前に `drill:result` のリスナーで 300ms busy-wait（`const t0 = performance.now(); while (performance.now() - t0 < 300);`）。タイムアタック 国旗→国名・全世界・5問で4問 `answerCorrect`、`settle(page)` のあと1回の `page.evaluate` で最後の正解の `.choice` を `.click()` → すぐ `$('r-again').click()`。`drill:start` が1件、`results` が1件、`#scr-result` が表示中（250ms は結果画面を出した後から数える）
- `answer_every_time`: 練習5問で 正解・不正解・（`#next`）… と答えた回数と `drill:answer` の件数が同じ。不正解の detail は `{right:false, first:true, missesBefore:0, missesAfter:1}`、あとで同じ国に正解したときは `{right:true, first:false, missesBefore:1, missesAfter:0}`。答える前に `page.evaluate(() => { misses[G.cur.c.a] = 2; })` した国に正解すると `missesBefore:2, missesAfter:1`。`streak` は答えたあとの `G.streak`
- `answer_in_ta`: `clearTimeAttack` → `drill:answer` が5件で全部 `right:true`・`kind:'ta'`・`hint:false`・`sid` は `drill:start` と同じ。`__ev` の中で最後の `drill:answer` が `drill:result` より前
- `start_detail`: 場所→国旗・練習・ヨーロッパ・5問・国名表示 ON で始める → `drill:start` が `{mode:'m2f', kind:'practice', region:'ヨーロッパ', n:5, hint:true}`、`sid` は文字列。同じ条件でタイムアタックにすると `hint:false`
- `listener_throws_quiz_continues`: （`t` を使わず自分で `openApp` する）先に `recordEvents(page)`、その後に `drill:start` `drill:answer` `drill:result` に `throw new Error('boom')` するリスナーを付ける → 練習5問を `clearByAnswering` で結果画面まで、続けて `clearTimeAttack` で結果画面まで進める。どちらも結果画面が出る。`events(page, 'drill:result')` がゲームごとに1件（`sid` がちがう2件）。`errors` は全部 `/boom/` に合い、その件数が `__ev` の3種類のイベントの数と同じ（1ゲーム5問で `start` 1 + `answer` 5 + `result` 1 = 7、2ゲームで14）
- `ta_time_excludes_listener`: `drill:answer` のリスナーで `window.__t = performance.now()` を記録してから 300ms busy-wait する。`clearTimeAttack` のあと `G.timeMs <= __t - G.t0`（最後の回答のリスナーの時間はタイムに入らない）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/hooks.test.mjs`
Expected: イベントが0件で FAIL

- [ ] **Step 3: index.html に上のフックを入れる**

`endGame` は関数宣言なので、`show()` や `startGame()` より後ろに書いても呼べる。`G` は `let G;` のまま（`G.ended` は `G = {…}` に足さない。`undefined` が「まだ終わっていない」）。

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/e2e/hooks.test.mjs && node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs'`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/e2e/helpers.mjs tests/e2e/hooks.test.mjs
git commit -m "クイズの開始・回答・終了のイベントを出す共通フックを追加"
```

---

### Task 3: 画面の登録・トースト・図鑑と記録のイベント（H2・H3 の最後・H9）

**Files:**
- Modify: `index.html`（H2、H3 の最後、H9、トーストの CSS）
- Modify: `tests/e2e/hooks.test.mjs`（テストを足し、`listener_throws_quiz_continues` を広げる）

**Interfaces:**
- Consumes: Task 2 の `emit`、helpers の `recordEvents` `events` `clearByAnswering` `settleResult`、`hooks.test.mjs` の `t(name, fn, opts)`（`opts` は `openApp` に渡す。新しいコンテキストを開いて `recordEvents` 済み、最後に `errors` が空）と `listener_throws_quiz_continues`。既存の `SCREENS` `show` `$('grid').onclick` `selectBook(a, tapped)` `$('set-reset')` `renderSettings`
- Produces（計画 C・D が使う）:
  - `screenRender: {[name]: () => void}`、`registerScreen(name: string, render?: () => void) -> void`（`#scr-<name>` が無ければ `Error('no section scr-' + name)`。`SCREENS` に無ければ足す）
  - `toast(html: string, ms = 2800) -> void`（`#toasts` を初回に作る。`aria-live="polite"`。`.toast` を足し、`ms` 後に消す）
  - `show(name)` の最後で `screenRender[name]?.()` と `drill:screen {name}`
  - イベント `drill:screen {name}`、`drill:book-open {a}`、`drill:misses-reset {}`

フックのコード（RPG 設計 §10.2 のまま）:

```js
// H2: `const SCREENS = [...];` の直後
const screenRender = {};
function registerScreen(name, render) {             // 機能ファイルが自分の画面を足す。<section> を先に作ってから呼ぶこと
  if (!$('scr-' + name)) throw new Error('no section scr-' + name);
  if (!SCREENS.includes(name)) SCREENS.push(name);
  if (render) screenRender[name] = render;
}
function toast(html, ms = 2800) {
  let box = $('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; box.append(el);
  setTimeout(() => el.remove(), ms);
}

// H3（最後）: show() の `window.scrollTo({ top: 0 });` の直前
screenRender[name]?.();
emit('drill:screen', { name });

// H9: 設定の「記録を消す」（今の行を置きかえる）
$('set-reset').onclick = () => { misses = {}; store.set('misses', misses); emit('drill:misses-reset', {}); renderSettings(); };
// H9: 図鑑の一覧（$('grid').onclick の `$('detail').showModal();` の直後）
emit('drill:book-open', { a: c.a });
// H9: 図鑑の地図（function selectBook の最後の行の後）。検索で1件にしぼったときの自動選択（tapped=false）では出さない
if (c && tapped) emit('drill:book-open', { a });
```

- [ ] **Step 1: 失敗するテストを `tests/e2e/hooks.test.mjs` に足す**

- `screen_event`: `#home-play` → `drill:screen` の最後が `{name:'setup'}`。`#start` で `{name:'quiz'}`
- `register_screen`: `page.evaluate` で `<section id="scr-test" class="wrap" hidden>` を `.wrap` に足し、`registerScreen('test', () => window.__r = (window.__r || 0) + 1)` → `show('test')` で `#scr-test` が表示・`#scr-home` が非表示・`__r` が 1・`drill:screen` が `{name:'test'}`。もう一度 `registerScreen('test')` しても `SCREENS.filter(s => s === 'test').length === 1`。`show('home')` で `#scr-test` が非表示。`registerScreen('nope')` は `no section scr-nope` を投げる
- `toast_basic`: `toast('<b>hi</b>', 200)` を2回 → `#toasts` が1つ、`aria-live` が `polite`、`.toast` が2つで中に `b`。400ms 後に `.toast` が0
- `book_open_events`: 図鑑の一覧でカード `#grid .card[data-a="jp"]` をクリック → `drill:book-open {a:'jp'}`。`$('detail').close()` してから地図表示（`#bview [data-v="map"]`）に切りかえ、`#bmapbox path[data-a="br"]` に `dispatchEvent('click')` → `{a:'br'}`。検索欄に `ブラジル` を入れて1件にしぼる（自動選択）→ 件数は増えない
- `misses_reset_event`: 1問まちがえてから設定 → `#set-reset` → `drill:misses-reset` が1件
- `listener_throws_quiz_continues` を広げる: 例外を投げるリスナーを6種類全部（`drill:screen` `drill:book-open` `drill:misses-reset` も）に付ける。2つのゲームのあと、`#to-book` → 一覧のカード `[data-a="jp"]` を開いて `#detail` が開く → 閉じて `#to-settings` → `#set-reset` で `#scr-settings` が表示のまま。`errors` は全部 `/boom/` で、その件数が `__ev` の全部の件数と同じ

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/hooks.test.mjs`
Expected: 足したテストが FAIL

- [ ] **Step 3: index.html を実装**

- 上のフックを入れる
- インラインの `<style>` の `footer { … }` の行の直後に、バッジ設計 §5.3 のトーストの CSS をそのまま:
  ```css
  #toasts { position: fixed; z-index: 50; left: 50%; top: calc(12px + env(safe-area-inset-top)); transform: translateX(-50%);
    display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); pointer-events: none; }
  .toast { pointer-events: auto; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 12px;
    padding: 10px 14px; box-shadow: 0 6px 20px rgb(0 0 0 / .15); }
  @media (min-width: 900px) { #toasts { left: auto; right: 16px; top: 72px; transform: none; } }
  ```

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/e2e/hooks.test.mjs && node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs'`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/e2e/hooks.test.mjs
git commit -m "画面の登録・トースト・画面の切りかえと図鑑と記録のイベントを足す"
```

---

### Task 4: 結果画面とトップバーの差し込み口（#r-ext・#topbar-extra）

**Files:**
- Modify: `index.html`（`showResult()` の `#r-ext`、`#topbar-extra`、共通 CSS）
- Modify: `pc.css`（結果画面の `:empty` の判定、`#topbar-extra`）
- Modify: `tests/e2e/pc_layout.test.mjs`（計画 A のテスト `result_single_column_when_side_empty` の1か所だけ）
- Modify: `tests/e2e/hooks.test.mjs`（テストを足す）

**Interfaces:**
- Consumes: Task 2 の `drill:result`（クリアのときは `showResult()` の中、結果カードを作った後・`show('result')` の前に出る）、helpers の `recordEvents` `events` `clearByAnswering` `settleResult` `clearTimeAttack` `answerWrong` `PHONE` `PC`、`hooks.test.mjs` の `t(name, fn, opts)`。計画 A の `#r-side`（`.rside`。`#rcard` の中、`.result` の後・`.row.center` の前。スマホでは `display: contents`）と pc.css の結果画面のルール、`#topbar`・`#brand`・`#to-book`・`#to-settings`
- Produces（計画 C・D が使う）:
  - `#r-ext`（`<div class="r-ext" id="r-ext"></div>`。`#r-side` の最後の子。`drill:result` の `clear` のリスナーが走る時点で DOM にある。空なら見えない）
  - `#topbar-extra`（`<div id="topbar-extra" class="row"></div>`。`#topbar` の中で `#brand` の次。空なら見えない）

- [ ] **Step 1: 失敗するテストを `tests/e2e/hooks.test.mjs` に足す**

- `r_ext_slot`: 練習5問をノーミスで `clearByAnswering` → `$('r-ext').parentElement.id === 'r-side'`、`#r-side` の最後の子、中身が空、`getComputedStyle` の `display` が `none`（スマホ幅）
- `r_ext_ready_on_clear`: `drill:result` のリスナーで `outcome === 'clear'` なら `$('r-ext').textContent = 'EXT'` → クリア後の結果画面で `#r-ext` が表示され `EXT`
- `r_ext_layout_pc`: 1280×800（helpers の `PC`）で、ノーミスのクリア → `#rcard` の computed `display` が `grid` でない、`#r-side` の `display` が `none`。1問まちがえたクリア → `#rcard` が `grid`。ノーミスでも上のリスナーで `#r-ext` に中身を入れたクリア → `#rcard` が `grid`
- `topbar_extra`: `#topbar-extra` があって `#topbar` の2番目の子、中身が空、スマホ幅で `display` が `none`。トップバーはホームでは隠れるので、先に `page.evaluate(() => show('setup'))` してから、`#brand` `#to-book` `#to-settings` の `getBoundingClientRect()` と `#topbar` の高さが、`#topbar-extra` を `remove()` する前と後で同じ（`PHONE` と `PC` の両方。どれも幅が 0 でないことも確かめる）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/hooks.test.mjs`
Expected: 足したテストが FAIL

- [ ] **Step 3: index.html を実装**

- `#r-ext`: `showResult()` の `id="r-side"` の div の閉じタグの直前に `<div class="r-ext" id="r-ext"></div>` を足す（`#r-side` の最後の子。スマホでは `.rside { display: contents }` なので、ボタン行の直前に並ぶ）
- `#topbar-extra`: `#topbar` の中に無ければ、`<button class="brand" id="brand">…</button>` の直後に `<div id="topbar-extra" class="row"></div>` を足す（計画 A が足していればそのまま）
- 共通 CSS（インラインの `<style>`。Task 3 で入ったトーストの CSS の最後の行 `@media (min-width: 900px) { #toasts { … } }` の直後）:
  - `#topbar-extra:empty { display: none; }`
  - `.r-ext { width: 100%; display: flex; flex-direction: column; gap: 12px; }` と `.r-ext:empty { display: none; }`

- [ ] **Step 4: pc.css と計画 A のテストを直す**

空の `#r-ext` があっても「中身なし」と同じに見えるよう、結果画面の判定を「空の `.r-ext` 以外の子があるか」に変える（`:has()` の中に `:has()` は書けないので、この形にする）。pc.css の中で `.rside:empty` / `.rside:not(:empty)` を使っている所は全部変える。計画 A が設計書 §7 のままなら次の5か所:
- `#rcard .rside:empty` → `#rcard .rside:not(:has(> :not(.r-ext:empty)))`
- `#rcard:has(> .rside:not(:empty))`（3か所）→ `#rcard:has(> .rside > :not(.r-ext:empty))`
- `#rcard > .rside:not(:empty)` → `#rcard > .rside:has(> :not(.r-ext:empty))`
- `#topbar-extra { margin-right: auto; }` が無ければ、`#topbar { … }` のルールの直後に足す

`tests/e2e/pc_layout.test.mjs` の `result_single_column_when_side_empty` にある「`$('r-side').childNodes.length === 0`」を「`$('r-side').children.length === 1 && $('r-ext').childNodes.length === 0`」に変える（`#r-ext` は必ず入るため。ほかの行は変えない）。そのテストが無ければ何もしない。

- [ ] **Step 5: 通るのを確認**

Run: `node --test tests/e2e/hooks.test.mjs && node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs' && GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs`
Expected: 全部 PASS（計画 A の PC レイアウトのテストと、スマホ幅の要素の位置の比較もふくむ。空の `#topbar-extra` `#r-ext` は大きさ 0 なので比較に出ない）

- [ ] **Step 6: Commit**

```bash
git add index.html pc.css tests/e2e/hooks.test.mjs tests/e2e/pc_layout.test.mjs
git commit -m "結果画面とトップバーに機能ファイル用の差し込み口を足す"
```

---

### Task 5: イベントの約束 docs/events.md

**Files:**
- Create: `docs/events.md`
- Create: `tests/unit/events-doc.test.mjs`

**Interfaces:**
- Consumes: Task 2〜4 で index.html に入ったもの（下にまとめる）。元にする設計書: RPG 設計 `docs/superpowers/specs/2026-10-26-rpg-design.md` の §10.2・§10.3、バッジ設計 `docs/superpowers/specs/2026-10-26-badges-design.md` の §5.3・§8（8.1〜8.4）・§9.2
  - `emit(type, detail)`、`endGame(outcome)`、`registerScreen(name, render)`、`screenRender`、`toast(html, ms = 2800)`、`#topbar-extra`、`#r-ext`、`window.TRIVIA`（Task 6 で入る。`{ [a]: [{k, t}] }`）
  - index.html が出すイベントと detail のキー:
    - `drill:start` `{sid, mode, kind, region, n, hint}`
    - `drill:answer` `{sid, a, right, first, missesBefore, missesAfter, mode, kind, region, hint, streak}`
    - `drill:result` `{sid, outcome, mode, kind, region, n, done, firstTry, wrongs, attempts, best, timeMs, hint, missed}`
    - `drill:screen` `{name}`、`drill:book-open` `{a}`、`drill:misses-reset` `{}`
- Produces: `docs/events.md`（計画 C・D の実装はこれに従う）

- [ ] **Step 1: 失敗するテスト `tests/unit/events-doc.test.mjs` を書く**（ファイルはリポジトリ直下からの相対で `fileURLToPath(new URL('../../', import.meta.url))` を基準に読む）

- `events_doc_covers_index`: `index.html` の中の `emit('名前'` を全部拾い（正規表現 `/emit\('([\w:-]+)'/g`）、それぞれが `docs/events.md` に `` `名前` `` の形で書かれている。拾えた名前に `drill:start` `drill:answer` `drill:result` `drill:screen` `drill:book-open` `drill:misses-reset` の6つがふくまれる
- `events_doc_covers_features`: `docs/events.md` に `` `rpg:ready` `` `` `rpg:coins` `` `` `rpg:levelup` `` `` `rpg:join` `` `` `rpg:promote` `` `` `rpg:pull` `` `` `rpg:answer` `` `` `rpg:battle` `` `` `rpg:clear` `` `` `rpg:overcome` `` `` `rpg:bounty` `` `` `rpg:share` `` `` `badge:earned` `` `` `badge:title` `` が全部ある
- `events_doc_covers_keys`: 上の Interfaces の drill:* の detail のキー（`sid` `mode` `kind` `region` `n` `hint` `a` `right` `first` `missesBefore` `missesAfter` `streak` `outcome` `done` `firstTry` `wrongs` `attempts` `best` `timeMs` `missed` `name`）のそれぞれが、doc のどこかのバッククォートの中に単語として出てくる（`` new RegExp('`[^`]*\\b' + key + '\\b[^`]*`') ``）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/unit/events-doc.test.mjs`
Expected: `docs/events.md` が無くて FAIL

- [ ] **Step 3: `docs/events.md` を書く**

RPG 設計 §10.3 とバッジ設計 §8・§9.2 をまとめたもの。見出しと中身:
1. **しくみ**: `emit(type, detail)` は `document` に CustomEvent を出す。リスナーの例外は出した側（クイズ）に伝わらない。detail のキーは足すだけで、消したり名前を変えたりしない
2. **index.html → 機能ファイル**: 6つのイベントの表（イベント／いつ／detail／回数の保証）。`drill:result` は「1回のゲームにつき必ず1回だけ」: クリア（`showResult`）・タイムアタックの失格・途中で離れた（［やめてモード選択へ］・トップバー・`startGame()` が前のゲームの途中で呼ばれた）。挑戦のやり直しは同じゲーム（`drill:start` も `drill:result` も出ない）。ページを閉じた・再読み込みしたときは出ない。`drill:book-open` は一覧のカードで詳細を開いたとき／地図で国をタップしたとき（検索で自動選択したときは出ない）
3. **値の決まり**: `mode` は `f2n｜n2f｜m2f｜f2m`、`kind` は `practice｜challenge｜ta`、`region` は `S.region` そのもの（`'all'` か日本語の地域名）、`outcome` は `clear｜fail｜quit`（「クリアだけ」は `outcome === 'clear'` で絞る）、`best` は挑戦のやり直しもまたいだ最高連続正解、`timeMs` はタイムアタックのクリアだけ数・ほかは `null`、`missed` はまちがえた国の `a` の配列、`hint` は国名表示ありで遊んだか、「全部」かどうかは `n === その地域の国の数`
4. **出る順番**: `startGame()`: （前のゲームの `drill:result` quit）→ `drill:start` → `drill:screen {quiz}`。回答: `drill:answer` は判定と `misses` の保存の直後、答えの表示や次の問題より前（タイムアタックも全部）。失格: `drill:answer` → `drill:result {fail}`。クリア: `drill:result {clear}` は結果カード（`#r-ext` をふくむ）を作ったあと・結果画面を出す前 → `drill:screen {result}`。途中で離れた: `drill:result {quit}` → 画面の切りかえ → `drill:screen`。起動時の最初の `drill:screen`（インライン script の `show(start)`）は rpg.js・badges.js を読む前に出るので、機能ファイルは起動時に `document.body.dataset.screen` を読んで今の画面を知る
5. **リスナーの決まり**: `drill:answer` はタイムアタックの計測中に同期で走るので、メモリの足し算だけにして画面の更新は `requestAnimationFrame` に回し、localStorage には書かない。`drill:answer` と `drill:result` のリスナーは try/catch で包む。`misses` は `let` なので参照を取っておかない。結果画面のボタンは画面を出してから 250ms 押せない（`drill:result` のリスナーの時間はこの 250ms に入らない）
6. **共通の部品**: `emit` `registerScreen(name, render)`（`<section id="scr-…">` を先に作ってから呼ぶ。無ければ例外）`screenRender` `toast(html, ms)`（`#toasts`、スマホは上・PC は右上）`endGame(outcome)` `#topbar-extra`（コイン・称号など。空なら見えない）`#r-ext`（結果画面の差し込み口。`#r-side` の中、空なら見えない）`window.TRIVIA`（豆知識。読めないこともあるので `window.TRIVIA?.[a]` で読み、配列か確かめる）
7. **rpg.js / rpg-battle.js → ほかの機能**: RPG 設計 §10.3 の「rpg.js / rpg-battle.js → ほかの機能」の表を detail ごとそのまま写す（`rpg:ready` `rpg:coins` `rpg:levelup` `rpg:join` `rpg:promote` `rpg:pull` `rpg:answer` `rpg:battle` `rpg:clear` `rpg:overcome` `rpg:bounty` `rpg:share`）。足すこと（バッジ設計 §8.2・§8.4 から）: `rpg:promote` の `via`、`rpg:battle` の `maxCombo` は「そのバトルで続けて正解した数の最大」、`RPG.snapshot()` は `{intro, lv, owned, ownedByStar, ownedByRegion, floors, cleared, earned, st, overcome, bountyDays}`（ボスを倒したかは `floors[id] >= 5`）、`rpg:ready` は1回だけなのであとから読むファイルは `RPG.snapshot()` を同期で読む
8. **badges.js → rpg.js**（バッジ設計 §8.3）: `badge:earned {id, badge, tier, title, color, retro}`（`id` はステップのキー `'reg-asia@2'`。rpg.js は同期で `e.detail.paid` に `50` か `false` を書く。`undefined` は古い rpg.js）、`badge:title {key, title}`（外したときは `{key: null, title: ''}`）
9. **読み込みの順番**: 本体のインライン script → `rpg-core.js` → `rpg.js` → `rpg-battle.js` → `badges.js`。各ファイルは即時関数で包み、起動時に使うグローバルを `typeof` で確かめる

設計書と食い違う所は、この計画の正（`docs/superpowers/specs/2026-10-26-platform-hooks-trivia-design.md` §2）の決め方に合わせる。

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/unit/events-doc.test.mjs && node --test 'tests/unit/*.test.mjs'`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add docs/events.md tests/unit/events-doc.test.mjs
git commit -m "イベントの約束を docs/events.md にまとめる"
```

---

### Task 6: 豆知識のデータ（data/trivia_facts.json → tools/make_trivia.py → trivia.js）

**Files:**
- Create: `data/trivia_facts.json`（元データのコピー）
- Create: `tools/make_trivia.py`
- Create: `trivia.js`（生成物。手で書かない）
- Create: `tests/unit/trivia.test.mjs`

**Interfaces:**
- Consumes: `countries.js`（`window.COUNTRIES`、各国の `a` は ISO 3166-1 alpha-2 の小文字。コソボは `xk`）
- Produces:
  - `trivia.js`: `window.TRIVIA = { "<a>": [{ "k": "flag"|"geo"|"culture", "t": string }, …], … }`（195か国、計779件、1か国3〜4件。国は `a` の昇順、国の中は元データの順。`note` は入れない）
  - `python3 tools/make_trivia.py [src] [out]`（省略時は `data/trivia_facts.json` と `trivia.js`。どちらもリポジトリ直下からの相対で、スクリプトの場所から求めるので、どのディレクトリから動かしても同じ）

- [ ] **Step 1: 元データを1回だけコピーする**

Run: `mkdir -p data && cp /mnt/project-files/country-drill-features-20261026/trivia_facts_checked.json data/trivia_facts.json && python3 -c "import json;print(len(json.load(open('data/trivia_facts.json'))))"`
Expected: `779`（中身は `{a, k, t, note}` の配列。元データは ISO 順ではない）

- [ ] **Step 2: 失敗するテスト `tests/unit/trivia.test.mjs` を書く**

- リポジトリ直下を `const ROOT = fileURLToPath(new URL('../../', import.meta.url))` とし、ファイルは `ROOT` からのパスで読む
- `vm.runInNewContext(src, { window: {} })` で `countries.js` と `trivia.js` を読む。別の realm で作られた配列・オブジェクトは `node:assert/strict` の `deepEqual` で prototype がちがって落ちるので、比べる前に両側を `const plain = x => JSON.parse(JSON.stringify(x));`（`tests/unit/ranking.test.mjs` と同じ）に通す
- `trivia_covers_countries`: `plain(Object.keys(TRIVIA))` が `COUNTRIES` の `a` を昇順に並べたもの（`plain` 済み）と同じ（195件、順番も）
- `trivia_items_shape`: 全部で779件。1か国3〜4件。各項目の `Object.keys` が `['k', 't']`、`k` は `flag` `geo` `culture` のどれか、`t` は空でない文字列
- `trivia_from_source`: `data/trivia_facts.json` を国ごとに元の順で `{k, t}` にしたものと `plain(TRIVIA)` が同じ
- `make_trivia_reproducible`: `execFileSync('python3', ['tools/make_trivia.py', 'data/trivia_facts.json', <一時ファイル>], { cwd: ROOT })` の出力が `trivia.js` とバイト単位で同じ
- `make_trivia_rejects_bad_kind`: `k: 'food'` の項目を1つ混ぜた一時 JSON で（`cwd: ROOT`）動かすと終了コードが0でなく、出力ファイルが作られない

- [ ] **Step 3: 失敗を確認**

Run: `node --test tests/unit/trivia.test.mjs`
Expected: `trivia.js` が無くて FAIL

- [ ] **Step 4: `tools/make_trivia.py` を書く**

標準ライブラリだけ。先頭に何をするスクリプトかのコメント。
- 読んだ配列を全部確かめてから書く: 各項目が dict で、`a` は小文字2文字、`k` は `flag` `geo` `culture` のどれか、`t` は空でない文字列。だめなら `sys.exit(f'bad item {i}: …')`（ファイルは書かない）
- `a` ごとに元の順でまとめ、`a` の昇順に並べる
- 出力（UTF-8、改行は `\n`、最後も改行で終わる）:
  ```
  // 豆知識（事実チェック済み）。tools/make_trivia.py が data/trivia_facts.json から作る。手で書きかえない
  window.TRIVIA = {
  "af":[{"k":"flag","t":"…"},{"k":"geo","t":"…"}],
  …
  };
  ```
  1か国1行。各行は `json.dumps(a) + ':' + json.dumps([{'k': k, 't': t}, …], ensure_ascii=False, separators=(',', ':')) + ','`
- 最後に `wrote trivia.js: 195 countries, 779 facts` の形で標準出力に出す

- [ ] **Step 5: 生成して通るのを確認**

Run: `python3 tools/make_trivia.py && node --test tests/unit/trivia.test.mjs && node --test 'tests/unit/*.test.mjs'`
Expected: `wrote trivia.js: 195 countries, 779 facts`、テストは全部 PASS

- [ ] **Step 6: Commit**

```bash
git add data/trivia_facts.json tools/make_trivia.py trivia.js tests/unit/trivia.test.mjs
git commit -m "豆知識779件のデータと trivia.js を作るスクリプトを追加"
```

---

### Task 7: 豆知識を出す（正解したとき・図鑑の詳細）と全体の確認

**Files:**
- Modify: `index.html`（`<script src="trivia.js">`、`TRIVIA_LABEL` `triviaLast` `pickTrivia` `triviaHTML`、`answer()`、`$('grid').onclick`、`selectBook()`、CSS）
- Modify: `pc.css`（答えの列と下の帯に豆知識が入ったときの大きさ、図鑑の詳細と地図の情報欄）
- Create: `tests/e2e/trivia.test.mjs`

**Interfaces:**
- Consumes: Task 6 の `trivia.js`（`window.TRIVIA`。`{ [a]: [{k, t}] }`）。既存の `esc` `factsHTML` `answer` `selectBook(a, tapped)` `nextQuestion` `byA` `S` `applyDopa`、`G.queue`、`$('grid').onclick`。計画 A の pc.css の答えの列（≥1280 の `#qcard > .reveal` は flex の縦並び・`justify-content: center`、`#qcard > .reveal > .map` の `width: min(100%, calc((100cqh - 340px) * 16 / 9))`）、下の帯（`@media (max-width: 1279.98px)` の `#qcard > .reveal` は高さ 150px の grid）、背の低い画面のルール（`@media (max-height: 760px)`）、地図表示の `.bmap` と `#bmap { container-type: size }`、図鑑の詳細の `#detail .inner`（≥1280 で2列の grid）。helpers の `startServer` `openApp` `pickSetup` `answerCorrect` `answerWrong` `clearTimeAttack` `PHONE` `PC`
- Produces（index.html のグローバル）:
  - `TRIVIA_LABEL = { flag: '🏳️ 国旗', geo: '🗺️ 地理', culture: '🍜 文化' }`
  - `pickTrivia(a: string) -> {k, t} | null`: `window.TRIVIA?.[a]` を**呼ぶたびに**読む（テストが差しかえるため）。配列でなければ `null`。配列なら `t` が空でない文字列の項目だけに絞り、空なら `null`。2件以上あれば、その国で前に出した文（`triviaLast[a]`）と同じものを除いてからランダムに1つ。除いた結果が空なら絞った配列から選ぶ。選んだ `t` を `triviaLast[a]` に覚える（メモリだけ。保存しない）
  - `triviaHTML(items) -> string`: `if (!Array.isArray(items) || !items.length) return ''`。`t` が空でない文字列の項目だけを使い（`null` や `t` 無しは飛ばす）、1件も残らなければ `''`。それ以外は `<ul class="trivia">` の中に1件ずつ `<li class="tv" data-k="${esc(k)}" title="${esc(t)}"><span class="tv-k">${ラベル}</span>${esc(t)}</li>`（`k` が文字列でなければ `''` として扱う。ラベルは `TRIVIA_LABEL[k]`、無い種類ならラベルの span を出さない）

- [ ] **Step 1: 失敗するテスト `tests/e2e/trivia.test.mjs` を書く**（`t(name, fn, opts = {})` は `tests/e2e/ranking.test.mjs` の `t` と同じ形で、`opts` をそのまま `openApp(browser, opts)` に渡す。最後に `errors` が空）

国を決めて出すときは `page.evaluate(a => { G.queue.unshift(byA.get(a)); nextQuestion(); }, a)`（以下「国を固定」）。

- `correct_shows_one`: 練習 f2n・全世界・5問で正解 → `.reveal .trivia .tv` が1つ、`.facts` の直後（`.reveal > .facts + .trivia`）。その `data-k` と、ラベルを除いた文が `TRIVIA[正解の国]` のどれかと同じ。ラベルは `data-k` に合う `🏳️ 国旗`／`🗺️ 地理`／`🍜 文化`
- `wrong_shows_none`: 練習で不正解 → `.trivia` が0。その国がもう一度出て正解したときは1つ
- `challenge_shows`: 挑戦で正解 → `.trivia` が1つ
- `ta_never_shows`: タイムアタックで1問正解 → `.trivia` 0、2問目で不正解（失格の表示）→ `.trivia` 0。`clearTimeAttack` の結果画面にも `.trivia` 0
- `pick_avoids_last`: `TRIVIA.zz = [{k:'geo',t:'A'},{k:'geo',t:'B'}]` にして `pickTrivia('zz')` を50回 → 続けて同じ `t` が一度も無い。1件だけの国ではいつもその1件。`pickTrivia('nope')` は `null`
- `book_list_all`: 図鑑の一覧で `[data-a="jp"]` → `#detail .trivia .tv` の数と文が `TRIVIA.jp` と同じ順で同じ、各 `.tv-k` がラベル
- `book_map_all`: 地図表示で `selectBook('br', true)` → `#binfo .trivia .tv` が `TRIVIA.br` の件数。検索で1件にしぼった自動選択でも出る
- `trivia_escaped`: 正解する前に `TRIVIA[G.cur.c.a] = [{k:'geo', t:'<b>x</b>&'}]` → `.trivia b` が0で、文に `<b>x</b>&` がそのまま見える
- `missing_country_no_trivia`: 正解する前に `delete TRIVIA[G.cur.c.a]` → `.trivia` が0、例外なし。図鑑の詳細でも同じ
- `malformed_trivia_ignored`: `TRIVIA.jp = 'oops'`、`TRIVIA.br = [null, {k:'geo'}, {k:'x', t:'ok'}]` にする。図鑑の一覧で `jp` → `#detail .trivia` 0、`br` → `.tv` が1つで文が `ok`、`.tv-k` が無い。練習で国を固定して `jp` に正解 → `.trivia` 0、`br` に正解 → `.tv` 1つで `.tv-k` 無し
- `works_without_trivia_js`: `page.route('**/trivia.js', r => r.abort())` → `page.reload()` → `window.TRIVIA === undefined`。練習で正解して `.reveal` は出るが `.trivia` 0、図鑑の詳細も `.trivia` 0、`errors` は空
- 大きさの確かめ（`fits_pc` と `fits_strip` で共通の関数 `checkFit(page)`）: 練習・全世界・5問で始め、国を固定（`vc` 国名がいちばん長い、`lk` 首都がいちばん長い の2つ）、`TRIVIA[その国]` を一番長い文1件（`Object.values(TRIVIA).flat()` の中で `t.length` が最大のもの）にして正解 → 次を全部確かめる（1px までの誤差は許す）:
  - `document.documentElement.scrollHeight <= innerHeight`、`#qcard` と `#next` の `getBoundingClientRect().bottom <= innerHeight`
  - `.reveal` の子のどれも、`top >= #qcard.top` かつ `bottom <= #qcard.bottom`
  - `.facts.bottom <= .trivia.top`、`.trivia.bottom <= .reveal.bottom`
- `fits_pc`: 1280×577、1366×657、1536×730、1920×1080 × 4モード（f2n・n2f・m2f・f2m）× ドパガキ向け OFF／ON（ON は始める前に `page.evaluate(() => { S.dopa = true; applyDopa(); })`）× 国2つで `checkFit`
- `fits_strip`: 900×700、1024×768 × 4モード × ドパガキ向け OFF／ON × 国2つで `checkFit`
- `book_map_fits_pc`: 1280×577 と 1366×657。地図表示で、`TRIVIA` に4件ある国のうち「国名＋4件の文」の文字数の合計がいちばん多い国（テストの中で計算）を `selectBook(a, true)` → `$('binfo').scrollTop = 0` のあと `#binfo .facts` の `top >= #binfo` の `top`、`document.documentElement.scrollHeight <= innerHeight`

（ブラウザを開き直す回数が多いので、`fits_pc` `fits_strip` は1つのコンテキストで `page.setViewportSize` を変えながら回し、`timeout` を `180_000` にしてよい）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/trivia.test.mjs`
Expected: `.trivia` が無くて FAIL

- [ ] **Step 3: index.html を実装**

- `<script src="ranking.js"></script>` の直後に `<script src="trivia.js"></script>`
- `function factsHTML(c)` の直後に `TRIVIA_LABEL` `triviaLast`（`const triviaLast = {};`）`pickTrivia` `triviaHTML`
- `answer()`: `` r.innerHTML = `<p class="verdict ${right ? 'ok' : 'ng'}">${verdict}</p>${factsHTML(c)}`; `` の `${factsHTML(c)}` の後ろに `${right ? triviaHTML([pickTrivia(c.a)].filter(Boolean)) : ''}`（タイムアタックの正解はこの行より前で return するので出ない。不正解・失格は `right` が false）
- `$('grid').onclick`: `` inner.innerHTML = `<button class="close" id="dclose">閉じる</button>${factsHTML(c)}`; `` の `${factsHTML(c)}` の後ろに `${triviaHTML(window.TRIVIA?.[c.a])}`（地図はその後に `append` されるので、並びは 閉じる・国の情報・豆知識・地図）
- `selectBook()`: `$('binfo').innerHTML = c ? factsHTML(c) : …` の `factsHTML(c)` を `factsHTML(c) + triviaHTML(window.TRIVIA?.[c.a])` にする
- インラインの `<style>` の `.next { align-self: flex-end; }` の直後:
  ```css
  .trivia { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .tv { font-size: .88rem; line-height: 1.5; padding: 6px 10px; border-radius: 8px; background: color-mix(in srgb, var(--hl) 12%, var(--surface)); }
  .tv-k { font-size: .76rem; font-weight: 700; color: var(--muted); margin-right: .6em; white-space: nowrap; }
  ```

- [ ] **Step 4: pc.css を直す**

- `@media (max-width: 1279.98px)`（下の帯 150px）の中に足す。帯の高さは変えない（答えると問題と選択肢が動いてしまうため）。帯の中の豆知識は**1行**で切る（2行だと国の情報の行が約 62px になり、80px の国旗の情報（約 74px）と重なるため）。全文は `title` と図鑑で読める:
  ```css
  #qcard > .reveal:has(> .trivia) { grid-template-rows: auto minmax(0, 1fr) auto; }
  #qcard > .reveal > .trivia { grid-column: 1; grid-row: 3; }
  #qcard > .reveal:has(> .trivia) > .map { grid-row: 2 / -1; }
  #qcard > .reveal > .trivia .tv { font-size: .8rem; line-height: 1.35; padding: 2px 8px; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; }
  ```
  `fits_strip` が落ちたら、`.tv` を `font-size: .76rem; padding: 0 8px` にする。それでも落ちたら帯の 150px は変えずに作業を止めて報告する
- `@media (min-width: 1280px)` の中、`#qcard > .reveal > .map { width: min(100%, calc((100cqh - 340px) * 16 / 9)); … }` の直後に `#qcard > .reveal:has(> .trivia) > .map { width: min(100%, calc((100cqh - 340px - 96px) * 16 / 9)); }`（96px は豆知識3行ぶん。340px は変えない）
- 背の低い PC（地図がすでに幅 0 になり、地図では高さをかせげない）: ファイルの最後の `@media (max-height: 760px)` の後に `@media (min-width: 1280px) and (max-height: 760px) { #qcard > .reveal > .trivia .tv { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; } }`。`fits_pc` が落ちたら `-webkit-line-clamp` を 2 にする。それでも落ちたら作業を止めて報告する
- `@media (min-width: 1280px)` の図鑑の詳細（`#detail .inner` が2列の grid）に `#detail .inner > .trivia { grid-column: 1; }` と `#detail .inner:has(> .trivia) > .map { grid-column: 2; grid-row: 2 / span 2; }`（豆知識が無い国では今の並びのまま）
- `.binfo` のルール（`.binfo { min-height: 240px; }`）に `max-height: 100cqh; overflow-y: auto; justify-content: flex-start;` を足し、すぐ後に `.binfo > :first-child { margin-top: auto; }` と `.binfo > :last-child { margin-bottom: auto; }`（`#bmap` は `container-type: size` なので、情報欄が地図の高さを超えたら中でスクロールする。中央そろえを margin でするので、はみ出しても上が切れずに先頭までスクロールできる）

- [ ] **Step 5: 全体を確かめる**

Run: `node --test tests/e2e/trivia.test.mjs && node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs' && bash tests/sql/run.sh`
Expected: 全部 PASS（計画 A の PC レイアウトのテストもふくむ）

Run: `GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs`
Expected: FAIL してよいが、`diffs` の `key` は豆知識が出る場面（正解の答え合わせ・`book_map`・`book_detail`）だけ。ほかの場面（ホーム・設定・モード選択・答える前・不正解・結果・ランキング・図鑑の一覧）に差があれば直す

- [ ] **Step 6: Commit**

```bash
git add index.html pc.css tests/e2e/trivia.test.mjs
git commit -m "正解したときと図鑑の詳細に豆知識を出す"
```
