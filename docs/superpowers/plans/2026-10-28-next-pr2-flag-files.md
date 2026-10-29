# PR2 B4 国旗をファイルに分け、地図をあとから読む Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 起動時に flags.js（約1.4MB）・world.js・d3・topojson を読まないようにし、国旗は `flags/<a>.svg` を1枚ずつ、地図の3ファイルはホームが出たあとにうしろで読む。

**Architecture:** `flag(a)` を URL を返す関数に変え、195個の svg を `tools/split_flags.mjs` で作る。地図は `loadMap()` が `vendor/` の d3・topojson と `world.js?v=1` を足し、`buildMap()` が空の入れ物（`feats` `featById` `featCountry` `graticule`）を埋める。`show()` は `MAP_SCREENS` に入るとき地図を待ち、0.3秒こえたら帯 `#mapwait` を出す。タイムアタックと今日の難問は `preloadFlags()` で国旗を読み終えてから1問目を出す（そのあとで時間を計る）。

**Tech Stack:** HTML / クラシック script、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「B4」の節・「実装の順番」・「チコに決めてほしいこと」17・18・「テストの方針」）

前提: PR0（#25・#26 のあとの整理）はマージ済み。PR1（B2 静的ページ）はこの作業ツリーに入っていて、まもなく main にマージされる。ファイル:行は PR1 を含む pr2-work の始まり（752d01b）のもの（2026-10-29 に見直した）。

## Global Constraints

- 出題の中身は変えない。出題は国旗・国名・場所だけ、首都を問う問題は作らない。
- 新しい色は作らない（帯 `#mapwait` も今ある変数だけ）。色の変数を書くなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。
- `?v=` は「そのとき main にある数 +1」。中身を変えた js/css だけ上げる（`cache_bust`）。PR0 の `same_version_same_content` が落ちたら、そのファイルが main の歴史で使った最大の数 +1。`world.js` は `loadMap()` の中で `world.js?v=1`。国旗は `flags/${a}.svg?v=${FLAG_V}`、`FLAG_V = 1`。
- localStorage のキーと Supabase は変えない。イベント（`drill:*`）も増やさない。`TRANSFER_KEYS`・`LOCAL_KEYS` にさわらない。
- 数: 地図の帯は 300ms（`MAP_WAIT_MS`）、地図の失敗は 15000ms（`MAP_TIMEOUT_MS`）、国旗の先読みは最大 10000ms（`PRELOAD_MS`）。
- 地図の失敗は `console.error('[map] …')`。CDN は使わない（vendor/ に LICENSE ごと置く）。
- やらない: svgo、110m の地図、d3 の一部抜き出し、Service Worker。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。

## Review Focus

1. `#play`・`#book`・`#rpg`・`#daily` で直接開いたとき、地図を待つあいだ画面が真っ白 → まずホームを出してから待つ（Task 2 `deep_link_waits`）。
2. タイムアタックの「じゅんび中」に［やめる］→ あとで国旗が読み終わっても1問目が出ない・タイマーが動かない（`quit` は G を入れかえないので `G !== g || g.ended` で見る。Task 3 `quit_during_prep`）。
3. 「じゅんび中」に数字キー・Enter → 例外が出ない（`if (!G?.cur) return`。Task 3 `keys_during_prep`）。
4. 地図が読めない（world.js が 404）ときに［もう一度］で直る。d3 だけ読めていて world.js だけ足りない場合も二重に読まない（Task 2 `world_blocked_retry`）。
5. `startGame()` の直後に同期で `G.cur` を読む既存テスト（`timeattack.test.mjs:182`、`hooks.test.mjs:161` など）→ `await startGame()` か settle に直す（Task 3 Step 4）。

---

### Task 1: 国旗を flags/*.svg に分ける

**Files:**
- Create: `tools/split_flags.mjs`、`flags/*.svg`（195個）、`tests/unit/flag-files.test.mjs`
- Modify: `index.html:524`（`<script src="flags.js">` を消す）、`index.html:553-554`（`flagCache`・`flag`）、`index.html:830`（`#home-flags` に `loading="lazy"`）、`README.md:68`
- Delete: `flags.js`

**Interfaces:**
- Produces（A1・B1・B5 が使う）: `const FLAG_V = 1`、`flag(a: string) -> string`（`flags/${a}.svg?v=${FLAG_V}`、ページからの相対 URL）。`window.FLAGS` は無くなる。A1 は `fetch(flag(a))` で svg の文字を取る。B1 の `country/*.html` は `../flags/<a>.svg?v=1`。
- `node tools/split_flags.mjs [src=flags.js] [out=flags]`: `window.FLAGS` を vm で読み、キーごとに `out/<a>.svg` へ値をそのまま書く。

- [ ] **Step 1: unit テストを書く**（`tests/unit/flag-files.test.mjs`。countries.js は vm で読む）

```js
test('flag_files_match_countries', () => {   // 使っていない svg も、足りない svg も無い
  assert.deepEqual(readdirSync('flags').filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort(), C.map(c => c.a).sort());
  assert.equal(C.length, 195);
});
test('flag_files_are_svg', () => {
  for (const c of C) { const s = read(`flags/${c.a}.svg`); assert.match(s, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, c.a); assert.match(s, /viewBox="0 0 640 480"/, c.a); }
});
test('flags_js_gone', () => {
  assert.ok(!existsSync('flags.js'));
  const h = read('index.html');
  assert.ok(!h.includes('flags.js') && !h.includes('FLAGS['));
  assert.match(h, /const FLAG_V = 1;/);
  assert.match(h, /flags\/\$\{a\}\.svg\?v=\$\{FLAG_V\}/);
});
test('home_flags_lazy', () => assert.match(read('index.html'), /\$\('home-flags'\)\.innerHTML = [^\n]*loading="lazy"/));
```

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/flag-files.test.mjs` → FAIL（flags/ が無い）
- [ ] **Step 3: `tools/split_flags.mjs` を書いて流す** — `node tools/split_flags.mjs` → `flags/` に195個。そのあと `git rm flags.js`。
- [ ] **Step 4: index.html を変える** — `flagCache` を消し `const FLAG_V = 1; const flag = a => \`flags/${a}.svg?v=${FLAG_V}\`;`。`<script src="flags.js">` を消す。ホームの img に `loading="lazy"`（4:3 の枠は既存 CSS `.home .flags img { aspect-ratio: 4/3 }` で先にとれている。ほかの国旗の img も `aspect-ratio: 4/3` があるかだけ見る）。README の素材に「国旗は `flags/*.svg`（flag-icons を `tools/split_flags.mjs` で1枚ずつに分けたもの。作り直すときは `git show <消す前のコミット>:flags.js > /tmp/flags.js` を src に渡す）」。
- [ ] **Step 5: 通るのを見る** — unit → PASS。e2e 全部 → PASS（国旗は同じオリジンから読むので helpers は変えない）。profile.js（#26）の `flag(a)` はそのまま動く。
- [ ] **Step 6: 全テスト → コミット** `git add tools/split_flags.mjs flags index.html README.md tests/unit/flag-files.test.mjs && git rm flags.js`、メッセージ「国旗を1枚ずつの svg ファイルに分ける」

### Task 2: 地図をあとから読む（vendor・loadMap・show の待ち）

**Files:**
- Create: `vendor/d3-7.9.0.min.js`、`vendor/d3-LICENSE`、`vendor/topojson-client-3.1.0.min.js`、`vendor/topojson-client-LICENSE`（`tests/e2e/node_modules/{d3,topojson-client}` から写す）、`tests/e2e/load.test.mjs`
- Modify: `index.html:521-525`（d3・topojson・world.js の script を消す）、`index.html:546-551`（`feats` など）、`index.html:606`（`graticule`）、`index.html:809-822`（`show`）、`index.html:366` の `#topbar` の直後と CSS（`#mapwait`）、`index.html:1435-1440`（起動）、`rpg.js:15`・`rpg-battle.js:13`（NEED から `d3`）と両方の `?v=`（rpg.js 12→13、rpg-battle.js 15→16。どちらも main の歴史で使っていない数）、`tests/e2e/helpers.mjs:447-479`（`openApp` の `waitMap`）、`privacy.html:75` の `#external` と `tests/unit/pages.test.mjs:106` の `privacy_text`（cdnjs・jsDelivr を外す）、`tests/unit/flag-files.test.mjs`、`README.md:69`

**Interfaces:**
- Produces（index.html のグローバル。A6・A7・B1 が前提にする）:
  - `const MAP_SCREENS = ['setup', 'book', 'daily', 'rpg', 'cards']`（道場は入れない）
  - `let mapReady = false`（`buildMap()` が終わったら true）
  - `loadMap() -> Promise<void>`: 一度だけ読む（読んでいる最中・読んだあとは同じ Promise）。足りないものだけ足す（`window.d3` が無ければ `vendor/d3-7.9.0.min.js`、`window.topojson` が無ければ `vendor/topojson-client-3.1.0.min.js`、`window.WORLD` が無ければ `world.js?v=1`。`async = false` で head に）。どれかの onerror か `MAP_TIMEOUT_MS` で reject し、`console.error('[map] 地図を読みこめなかった', …)`、次の呼び出しで読み直せるように覚えた Promise を捨てる。成功したら `buildMap()`。
  - `buildMap() -> void`: `feats`（`const feats = []` に push）、`featById`、`featCountry`（どちらも `new Map()` に set）、`graticule`（`let graticule = null` → `d3.geoGraticule10()`）を今と同じ計算で埋める。
  - `show(name)`: 先頭で待ちを取り消して `#mapwait` を隠す。`MAP_SCREENS.includes(name) && !mapReady` なら `waitMap(name)` して戻る（今の画面のまま）。
  - `waitMap(name) -> void`: `MAP_WAIT_MS` たってまだなら帯「地図を読みこみ中…」。読めたら、待っている画面がまだ `name` のときだけ `show(name)`。失敗したら帯の文を「地図を読みこめなかった」にして［もう一度］（`#mapwait-retry`、押すと `show(name)`）。
  - HTML: `<div class="mapwait" id="mapwait" role="status" hidden><span id="mapwait-msg"></span><button class="btn ghost" id="mapwait-retry" hidden>もう一度</button></div>`（`#topbar` の直後）。
  - 起動: `addEventListener('load', () => loadMap().catch(() => {}))`。`start` が MAP_SCREENS で地図がまだなら、先に `show('home')` してから `show(start)`。
- Produces（テスト）: `openApp(browser, { …, waitMap = true })` — true なら `goto` のあと `typeof mapReady === 'undefined' || mapReady` まで待つ（古いコミットでも通る）。`LIBS` は GEOM_BASE の古いコミット用に残す。

- [ ] **Step 1: テストを書く**

unit（`flag-files.test.mjs` に足す）:
```js
test('vendor_files', () => {
  assert.match(read('vendor/d3-7.9.0.min.js'), /^\/\/ https:\/\/d3js\.org v7\.9\.0 /);
  assert.match(read('vendor/topojson-client-3.1.0.min.js'), /v3\.1\.0/);
  for (const f of ['vendor/d3-LICENSE', 'vendor/topojson-client-LICENSE']) assert.ok(read(f).length > 100, f);
});
test('no_cdn_or_map_at_boot', () => {
  const h = read('index.html');
  for (const s of ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', '<script src="world.js', '<script src="vendor/']) assert.ok(!h.includes(s), s);
  assert.match(h, /const MAP_SCREENS = \['setup', 'book', 'daily', 'rpg', 'cards'\];/);
  for (const f of ['rpg.js', 'rpg-battle.js']) assert.ok(!/\bd3: typeof d3\b/.test(read(f)), f);
});
```
`privacy_text` の期待から `'cdnjs'`・`'jsDelivr'` を外し、`'vendor'` を足さない（ページには「地図の部品はこのサイトの中に置いている」と書く。足すなら文字列そのものをテストに）。

e2e（`tests/e2e/load.test.mjs`、`openApp(browser, { waitMap: false, … })`）:
```js
test('boot_is_light', ...)   // load までの resource（startTime < navigation.loadEventStart）の encodedBodySize 合計 < 1_000_000、
                             // その名前に world.js・vendor/・flags.js が無い
test('map_loads_in_background', ...) // waitForFunction(() => mapReady)。resource に 'world.js?v=1'・'vendor/d3-7.9.0.min.js'・
                             // 'vendor/topojson-client-3.1.0.min.js'。feats.length > 0、featCountry.size === feats.length、consoleErrors 0件
test('deep_link_waits', ...) // world.js を 1000ms 遅らせて url + '#play' → 400ms 後 #scr-home が見えて #mapwait が見え「地図を読みこみ中…」、
                             // 読み終わると #scr-setup が見えて #mapwait は hidden
test('world_blocked_retry', ...) // page.route('**/world.js*', r => r.abort()) → #home-play → #mapwait-retry が見える、
                             // consoleErrors に /^\[map\]/、#scr-home は見えたまま、openRanking() でランキングが出る。
                             // unroute → ［もう一度］→ #scr-setup。vendor/d3 の request は1回だけ
test('navigate_while_waiting', ...) // world.js を 1000ms 遅らせる → #home-play → 400ms 後 #home-settings（帯の下でも押せる）→
                             // 地図が読み終わったあとも #scr-settings、#mapwait は hidden
```
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/flag-files.test.mjs` と `node --test --test-concurrency=1 tests/e2e/load.test.mjs` → FAIL
- [ ] **Step 3: vendor/ を置く** — `cp tests/e2e/node_modules/d3/dist/d3.min.js vendor/d3-7.9.0.min.js` と LICENSE（topojson-client も同じ）。中身は書きかえない。
- [ ] **Step 4: index.html を Interfaces のとおりに変える** — `#mapwait` の CSS は `.mapwait { display: flex; gap: 10px; align-items: center; justify-content: center; padding: 8px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--muted); font-weight: 700; } .mapwait[hidden] { display: none; }`。`graticule`・`feats` を使う関数は呼ばれるときに中身が入っている（どれも MAP_SCREENS の描画・出題の中）。`isSmall`・`featOf` は変えない。
- [ ] **Step 5: rpg.js・rpg-battle.js** — NEED から `d3: typeof d3` を消す（`feats` などは空の入れ物があるので残す）。両方の `?v=` を +1。
- [ ] **Step 6: helpers・privacy・README** — `openApp` に `waitMap`。privacy.html `#external` の cdnjs・jsDelivr の文を「地図の部品（d3・topojson-client）はこのサイトの中に置いて配っている」に。README の素材に d3（ISC）・topojson-client（ISC）を `vendor/` に置いていること。
- [ ] **Step 7: 通るのを見る** — Step 2 のコマンド → PASS。e2e 全部 → PASS（`pc_layout` も。地図を描くテストは `waitMap` で待っている）。
- [ ] **Step 8: 全テスト → コミット** `git add vendor index.html rpg.js rpg-battle.js privacy.html README.md tests/e2e/helpers.mjs tests/e2e/load.test.mjs tests/unit/flag-files.test.mjs tests/unit/pages.test.mjs`、メッセージ「地図の部品を vendor に置き、ホームが出たあとに読む」

### Task 3: 国旗の先読みと「じゅんび中」

**Files:**
- Modify: `index.html:961-989`（`startGame`・`startDaily`）、`index.html:999-1040`（`nextQuestion`）、`index.html:1281`（クイズの keydown）、`rpg-battle.js`（`showQ` の最後と `RPG_BATTLE.state()`。`?v=` は Task 2 で上げたので同じ PR の中では上げない）、`tests/e2e/helpers.mjs:501`（`settle`）、`tests/e2e/load.test.mjs`、`startGame()` を同期で使う既存 e2e
- Test: `tests/e2e/load.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `flag(a)`。
- Produces（A1・A6・A7 が使う）:
  - `preloadFlags(codes: string[], ms = PRELOAD_MS) -> Promise<void>`: 重なりを除いて `new Image()` に `flag(a)` を入れ、全部が load か error になるか、`ms` たったら resolve（reject しない）。
  - `async startGame() -> Promise<void>`: `G.kind === 'ta'` のとき、`show('quiz')` のあと `#qcard` に `<p class="qlabel prep" role="status">じゅんび中…</p>` を出し、`await preloadFlags(codes)`。codes は `G.mode.a === 'flag'`（n2f・m2f）なら `C` の195か国、それ以外は `G.set` の国。戻ったら `if (G !== g || g.ended) return`、`nextQuestion()`。練習・挑戦は今までどおりすぐ `nextQuestion()`。
  - `async startDaily(qs, sid) -> Promise<void>`: 同じ「じゅんび中」→ `preloadFlags(qs.flatMap(q => [q.a, ...q.opts]))` → 同じ確かめ → `nextQuestion()`。
  - `nextQuestion()`: 時間を計らないとき（`!timed()`）、出したあとで `G.queue[0]` の国旗を `preloadFlags([G.queue[0].a])` で先読み（待たない。選択肢はまだ決まっていないので読まない。出題の乱数の順は変えない）。
  - rpg-battle.js（冒険のバトル。設計書「練習・挑戦・冒険では、次の国旗だけを、うしろで先に読んでおきます」）: `showQ()` の最後で、ボスでなく `B.queue[0]` があれば `typeof preloadFlags === 'function' && preloadFlags([B.queue[0].a])`（待たない。出題の乱数の順は変えない）。テストのため `RPG_BATTLE.state()` に `next: B && !B.boss && B.queue?.[0] ? B.queue[0].a : null` を足す。
  - 「じゅんび中」のあいだ `G.cur` は null、タイマーは1問目を出した `nextQuestion()` で始まる（今のまま）。
  - helpers: `settle(page)` は「`G?.cur` があり `#qcard .choices` がある」まで待ってから今の条件（設計書の `#choices` は実際には `#qcard .choices`）。

- [ ] **Step 1: テストを書く**（`tests/e2e/load.test.mjs` に足す。国旗の応答を遅らせるときは `page.route('**/flags/*.svg*', …)`）

```js
test('ta_flags_ready_before_first', ...) // n2f・全世界・10問のタイムアタック → settle → '#qcard img' がどれも complete && naturalWidth > 0、
                             // resource の flags/*.svg が195種類。f2n なら 10種類（同じ条件で）
test('prep_holds_timer', ...) // 国旗を 300ms 遅らせて開始 → 'じゅんび中…' が見え、G.cur === null、G.t0 === 0、#ptime は formatTime(0)。
                             // settle のあと G.t0 > 0
test('daily_flags_ready_before_first', ...) // daily.test.mjs と同じ入り方で今日の難問を開始 → settle → '#qcard img' がどれも complete、G.t0 > 0
test('quit_during_prep', ...) // 国旗を 1000ms 遅らせてタイムアタック開始 → #quit → 1500ms 待つ → #scr-setup が見え、#scr-quiz は hidden、G.cur === null
test('keys_during_prep', ...) // 国旗を 500ms 遅らせて開始 → '1' と 'Enter' を押す → errors 0件、settle のあと G.done === 0
test('practice_preloads_next', ...) // 練習 f2n → 1問目のあと resource に flag(G.queue[0].a) の URL がある
test('battle_preloads_next', ...) // rpg_helpers の openRpg → startBattle(page, 'samerica', 1) → 1問目が出たあと RPG_BATTLE.state().next が null でなく、
                             // resource に flags/<next>.svg がある、errors 0件
```
- [ ] **Step 2: 落ちるのを見る** — `node --test --test-concurrency=1 tests/e2e/load.test.mjs` → 新しいテストが FAIL
- [ ] **Step 3: 作る** — Interfaces のとおり。`const PRELOAD_MS = 10000`。keydown（1–4・Enter）の先頭に `if (!G?.cur) return`。`$('start').onclick`・`r-again`・daily.js の `startDaily(...)` は Promise を待たなくてよい。settle を直す。
- [ ] **Step 4: 既存 e2e を直す** — `grep -n "startGame()\|G\.t0\|G\.cur" tests/e2e/*.mjs` で、タイムアタック・今日の難問を始めた直後に同期で `G.cur`/`G.t0` を読むところを `await page.evaluate(async () => { await startGame(); … })` か `await settle(page)` にする（少なくとも `timeattack.test.mjs:182`、`hooks.test.mjs:161`・`hooks.test.mjs:365` の `ta_time_excludes_listener`、`daily.test.mjs:22` の `startDailyFromHome` を見る）。テストの意味は変えない。
- [ ] **Step 5: 通るのを見る** — e2e 全部 → PASS。`GEOM_BASE=origin/main node --test --test-concurrency=1 tests/e2e/pc_layout.test.mjs` で `phone_geometry_unchanged` を流し、差が `#mapwait`・ホームの国旗まわり・「じゅんび中」だけか見る（README のとおり、わざとの差はコミットの説明に書く）。
- [ ] **Step 6: 全テスト → コミット** `git add index.html rpg-battle.js tests/e2e`、メッセージ「タイムアタックと今日の難問は国旗を読み終えてから始め、練習・冒険は次の国旗を先に読む」
