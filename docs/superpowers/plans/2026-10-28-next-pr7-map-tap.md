# PR7 A7 白地図タップ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** モード選択に5枚目のカード「白地図タップ」（`mode:'tap'`、練習と挑戦だけ）を足し、国旗（と、チェックがあれば国名）を見て、選択肢の無い白地図をタップして答える。

**Architecture:** index.html に `TAP`・`tapMap(c, region)`・`tapJudge(c, p, r)` を足し、`nextQuestion` は tap のとき `.choices` の代わりに `tapMap` を置く。地図の click で判定して `answer(a, isRight)` に結果を渡す。`MODES` の `noTa:true` で、タイムアタック・ランキングから外す。コインは rpg-core.js に2行。

**Tech Stack:** HTML / クラシック script、d3（`d3.zoom`・`d3.geoContains`・`d3.geoDistance`・`d3.pointer`）、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「A7 白地図タップ（PR7・プレイだけ）」・「実装の順番」・「チコに決めてほしいこと」6・8・9・10・11・「テストの方針」）

前提: PR0〜PR6 はマージ済み。PR2 の `loadMap()`・`mapReady`・`MAP_SCREENS`（setup に入るとき地図は読めている）、`async startGame()`、helpers の `settle`（「`G?.cur` と `#qcard .choices`」を待つ）。PR6 の `G.kind === 'dojo'` の分かれ道・`startDojo`・`#to-dojo`・`drill:dojo`。ファイル:行は PR0〜PR6・PR8 をマージしたあとの main（`79e80a7`）のもの。PR6 の道場の入口 `#to-dojo` は帯ではなく、「モードを選ぶ」見出し行の右（`.dj-head` の中の `.dj-band`、dojo.js が h2 を包んで作る）にあり、高さを使わない。

## Global Constraints

- 出題は国旗・国名・場所だけ、首都を問わない。tap の問題文は国旗（`G.hint` のときだけ国名も）。答えのあとの `factsHTML` の首都は今までどおり。
- `TAP = { nearPx: 12 }`（画面の上の px。拡大しても画面の上で12px＝地図の上では厳しくなる）。周りの点は8個、半径は `nearPx`。
- 地図は図鑑と同じ `d3.zoom().scaleExtent([1, 24])`、`.clickDistance(6)`（ドラッグは答えにしない）。投影は `G.cur.proj`。
- タイムアタック・今日の難問・冒険のバトル・ランキング・道場には出さない。`misses` はほかのモードと共有。
- コイン: `modeMul.tap = 1.3`、「はじめて正解した国」の +20 は付けない。
- 色は今ある変数だけ（`--hl` `--ng` `--land` `--ink` `--border-land`）。新しい色は作らない（作るなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`）。
- localStorage のキー・Supabase・`TRANSFER_KEYS` は変えない。イベントは今のまま（mode に `'tap'` が入るだけ）。
- `?v=`: `rpg-core.js` と `pc.css` を「そのとき main にある数 +1」（PR3 までに `pc.css?v=` が付いている。PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。index.html はインライン。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。とくに `cache_bust` `events-doc` `theme` `pc_layout` `transfer-keys`。

## Review Focus

1. 保存された setup が `{mode:'tap', kind:'ta'}`（引き継ぎ・古い端末）→ モード選択は練習に切りかわり、タイムアタックの tap は始まらない（Task 2 `stored_tap_ta`）。
2. 地球の外（`proj.invert` が null か範囲外）や海をタップ → 外れ・× 印・km は出さない・例外なし（Task 3 `tap_outside_globe`）。
3. 答えたあとの2回目のタップ・ダブルタップ → `drill:answer` は1件、印も増えない（Task 3 `tap_after_answer_ignored`）。
4. 設定「正解したらすぐ次へ」（`S.quick`）で、問題を出して `TA_GUARD_MS` 以内のタップ → 無視される（Task 3 `quick_guard`）。
5. 1366×657 の PC でモード選択（A6 の帯＋5枚のカード）と tap の問題・外れた画面 → 縦スクロールしない（Task 4 `pc_layout` の `setup`・`quiz_tap`・`wrong_tap`）。

---

### Task 1: 冒険のコイン（rpg-core.js）

**Files:**
- Modify: `rpg-core.js:12`（`modeMul`）、`rpg-core.js:525`（`runAnswer` の `feDone`）、`index.html:1659` の `rpg-core.js?v=13` → `14`
- Test: `tests/unit/rpg-core.test.mjs`

**Interfaces:**
- Produces: `TUNING.quiz.modeMul = { f2n: 1, n2f: 1, m2f: 1.2, f2m: 1.2, tap: 1.3 }`。`runAnswer` は `MODE_BIT` に無いモードで `feDone: true` を渡す（`feDone: !bit || !!((b.fe[a] | g.fe[a]) & bit)`）。`MODE_BIT`・`QUIZ_BITS` は変えない（tap はマスター昇格・モード別バッジに入らない）。

- [ ] **Step 1: 失敗するテストを書く** — `tuning_and_tables` の期待する `modeMul` に `tap: 1.3` を足す。新しいテスト:

```js
test('tap_coins', () => {
  const K = loadCore();
  assert.equal(K.answerCoins({ ...AC, mode: 'tap' }).coin, 13);                 // 10 × 1.3
  const d = dWith(K), game = sid => K.newRun({ sid, kind: 'practice', mode: 'tap', region: 'all', n: 3, hint: false }, d);
  const ans = { a: 'jp', right: true, first: true, hint: false, mode: 'tap', missesBefore: 0, missesAfter: 0 };
  const run = game('tp'), r1 = K.runAnswer(run, ans);
  assert.equal(r1.firstEver, 0); assert.equal(r1.coin, 13);
  assert.equal(plain(run.pend).fe.jp ?? 0, 0);
  K.settleRun(d, run, clearRes('practice', 1, { mode: 'tap' }), T0);
  assert.equal(K.runAnswer(game('tp2'), ans).firstEver, 0);   // 次のゲームでも +20 は出ない（ビットの無いモードで毎回もらえない）
  assert.equal(K.runAnswer(K.newRun({ sid: 'f', kind: 'practice', mode: 'f2n', region: 'all', n: 3, hint: false }, d), { ...ans, mode: 'f2n' }).firstEver, 20);   // f2n は今までどおり
});
```

- [ ] **Step 2: 落ちるのを確かめる** — `node --test tests/unit/rpg-core.test.mjs` → `tuning_and_tables` と `tap_coins` が FAIL（coin 0）。
- [ ] **Step 3: 2行を変え、`rpg-core.js?v=13` を `14` に。**
- [ ] **Step 4: 全テストが通る**（unit・e2e・sql）。
- [ ] **Step 5: コミット** — `git commit -m "冒険のコインに白地図タップ（倍率1.3、はじめての+20なし）を足す"`（末尾2行つき）。

### Task 2: MODES の tap と noTa（モード選択・ランキング）

**Files:**
- Modify: `index.html:621-626`（`MODES`）、`index.html:1024-1043`（`renderSetup`・`$('modes').onclick`・`$('kinds').onclick`）、`index.html:1095-1102`（`startGame` の kind）、`index.html:1488-1505`（`boardConds`・`openRanking`・`renderRanking`）、`index.html` の CSS（`.modegrid > .modecard[data-k="tap"] { grid-column: 1 / -1 }`、スマホの2列でも穴をあけない）、`pc.css`（Task 4 で高さを確かめて決める。`index.html:394` の `pc.css?v=2` → `3`）
- Test: `tests/e2e/tap_map.test.mjs`（新規。`map_zoom.test.mjs` と同じ `t(name, fn)` の形で、最後に `app.errors` が空）

**Interfaces:**
- Produces: `MODES` の5つ目 `{ k: 'tap', label: '白地図タップ', desc: '国旗を見て白地図をタップ', q: 'flag', a: 'tap', nameOpt: true, noTa: true }`。`q:'flag'` なので答えのあとの小さい地図は今の条件（`q !== 'map' && a !== 'map'`）に `a !== 'tap'` を足して出さない。
- `renderSetup()`: `modeOf(P.mode).noTa && P.kind === 'ta'` なら `P.kind = 'practice'` を保存してから描く。kinds の TA カードは noTa のとき `disabled`（`aria-disabled`、説明は「白地図タップでは遊べない」）。
- `startGame()`: kind は `modeOf(P.mode)?.noTa && P.kind === 'ta' ? 'practice' : P.kind`。
- noTa を外す所: `renderRanking` のチップ（`MODES.filter(m => !m.noTa)`）、`boardConds`（`modeOf(mode) && !modeOf(mode).noTa`）、`openRanking` の既定値（`P.mode` が noTa なら `'f2n'`）。

- [ ] **Step 1: 失敗するテストを書く**

```js
t('tap_card_and_ta_off', ...)   // #modes .modecard の数 5、[data-k="tap"] の文字に「白地図タップ」。kind ta を選んでから tap を押す
                                 // → P.kind === 'practice'、#kinds [data-k="ta"] が disabled。f2n に戻すと ta がまた押せる
t('stored_tap_ta', ...)         // storage: { setup: { mode: 'tap', kind: 'ta', count: 5 } } で開く → #home-play → P.kind === 'practice'、
                                 // #start → G.kind === 'practice'、drill:start の mode === 'tap'
t('ranking_without_tap', ...)   // P.mode = 'tap' で openRanking() → RK.mode === 'f2n'、#rk-modes .chip の data-k に 'tap' が無い、
                                 // boardConds('tap:all:10') === null
```

- [ ] **Step 2: 落ちるのを確かめる** — `node --test tests/e2e/tap_map.test.mjs` → 3つ FAIL。
- [ ] **Step 3: Interfaces のとおりに作る。** この Task では tap の問題の中身はまだ作らない（`nextQuestion` は今のまま動き、選択肢は番号だけのボタンになる。Task 3 で置きかえる）。
- [ ] **Step 4: 全テストが通る。**
- [ ] **Step 5: コミット** — 「モード選択に白地図タップのカードを足し、タイムアタックとランキングから外す」。

### Task 3: tapMap と判定（出題・答え）

**Files:**
- Modify: `index.html`（`zoomableMap`（771-807）の下に `TAP`・`tapMap`・`tapJudge`・`tapMiss`。`nextQuestion:1151-1192`、`answer:1220-1295`、CSS）、`tests/e2e/helpers.mjs`（`settle` と `answerTap`）
- Test: `tests/e2e/tap_map.test.mjs`

**Interfaces:**
- Produces（index.html のグローバル）:
  - `const TAP = { nearPx: 12 }`
  - `tapMap(c, region) -> HTMLElement` — `<div class="mapbox tapbox">` に `svg.map.zoomable.tapmap`（viewBox `0 0 W H`）と `.zoomctl`（−・＋・戻す。図鑑と同じ）。投影は `boxProjection(REGION_BOX[region] || WORLD_BOX, W, H)` を `G.cur.proj` に入れる。`<g class="layer">` に graticule、`feats` 全部を `<path data-a>`（`featCountry` で国があるときだけ data-a）、`C.filter(isSmall)` で投影が枠内の国に `<circle class="dot" data-a r>`（図鑑の `sizeDots` と同じく画面の上で半径5px）。正解の国に印は付けない。`svg` の click を判定につなぐ。
  - `tapJudge(c, p: [x, y], r: number) -> boolean` — p と r は layer の座標（拡大前の地図の単位）。`ll = G.cur.proj.invert(p)` が null・NaN・`|lon| > 180`・`|lat| > 90` なら false。`featOf(c)` があって `d3.geoContains(f, ll)` なら true。`isSmall(c)` で丸印（`proj([c.ll[1], c.ll[0]])`）から `r` 以内なら true。p を中心に半径 r の8点（`i * π / 4`）のどれかが `geoContains(f, …)` なら true。
  - click の処理: `G.answered` か `G.cur.c !== c` なら何もしない。`quick() && performance.now() - G.shownAt < TA_GUARD_MS` なら何もしない。`p = d3.pointer(e, layer)`、`r = TAP.nearPx * W / svg.getBoundingClientRect().width / d3.zoomTransform(svg).k`、`at = e.target.closest('[data-a]')?.dataset.a ?? ''`、`right = at === c.a || tapJudge(c, p, r)`。外れなら `tapMiss(c, p, at)`（Task 4、この Task では空の関数）。`answer(at, right)`。
  - `answer(a, isRight)` — 先頭で `const right = isRight ?? a === c.a`。ほかは今のまま（`drill:answer` の `a` は `c.a`、`misses` も今のまま共有）。道場の分かれ道は `answer(a)` のまま動く。tap のときは `.choice` が無いので `ok/ng` の付けかえは何もしない。
  - `nextQuestion()`: `m.a === 'tap'` なら `.choices` を作らず `box.append(tapMap(c, G.region))`、`G.cur = { c, opts: [c] }`（`makeQuestion` は呼ばない）。問題文 `labels.tap = 'この国旗の国はどこ？ 地図をタップ'`。`G.hint` のとき国旗の下に `<p class="qsub">${esc(c.n)}</p>`。`.rslot-keys` は tap のとき「ピンチ・ホイールで拡大、ドラッグで移動」。
- Produces（helpers）: `settle` の待つ要素を `#qcard .choices, #qcard .tapbox` に。`answerTap(page, { right = true } = {}) -> Promise<void>` — settle のあと、right なら正解の国の中の点（`c.ll` を投影した点が `tapJudge(c, p, 0)` なら それ、ダメなら `d3.geoCentroid(featOf(c))`）、外れなら `poolFor(G.region)` のうち `c.ll` から一番遠い国の `ll` を、`layer.getScreenCTM()` で画面の座標にして `page.mouse.click`。

- [ ] **Step 1: 失敗するテストを書く**

```js
t('tap_right_and_wrong', ...)      // 練習・tap・全世界・5問 → answerTap → .verdict.ok、drill:answer の { mode: 'tap', right: true }、
                                    // 次へ → answerTap({ right: false }) → .verdict.ng、misses[G.cur.c.a] === 1
t('small_country_near_px', ...)    // G.queue を [byA.get('sg')] にして次へ（または Math.random を固定）→ 丸印から画面で10px右 → 正解。
                                    // 次の問題で丸印から16px → 外れ。＋を2回（×2.56）押してから10px → 正解、16px → 外れ
t('drag_does_not_answer', ...)     // 地図の上で mouse.down → 40px move → up → G.answered === false、d3.zoomTransform の x が変わった
t('tap_outside_globe', ...)        // page.evaluate で G.cur.proj.invert が null を返す点（[-5000, -5000]）に tapJudge → false。
                                    // 全世界の地図の左上の角（海か地球の外）を click → .verdict.ng、.tapkm が無い
t('tap_after_answer_ignored', ...) // 外れのあと同じ所をもう2回 click → drill:answer は1件、.tapx と .ngc の数は増えない
t('quick_guard', ...)              // S.quick = true → 出してすぐ（settle なし）正解の点を click → G.answered === false。settle のあと → 進む
t('no_unreachable_country', ...)   // ['all', ...REGIONS, ...Object.keys(SUBREGIONS)] のそれぞれで tapMap(C[0], r) を作り、poolFor(r) の全部の国に
                                    // [data-a] の要素があり、getBBox() の幅か高さ > 0 で、viewBox と重なる
t('quiz_only_flag_name_place', ...) // tap の問題の #qcard .qmain に img.qflag があり、文字に「首都」が無い。G.hint のとき国名が出る
```

- [ ] **Step 2: 落ちるのを確かめる。**
- [ ] **Step 3: Interfaces のとおりに作る。** CSS（index.html、`.map` の近く）: `.tapmap .dot { fill: var(--land); stroke: var(--ink); stroke-width: 1; vector-effect: non-scaling-stroke }`、`.tapmap { cursor: crosshair }`。
- [ ] **Step 4: 全テストが通る**（既存の `settle` を使う全 e2e も）。
- [ ] **Step 5: コミット** — 「白地図をタップして答える出題と判定を足す」。

### Task 4: 外れたときの表示・PC の列・つながり

**Files:**
- Modify: `index.html`（`tapMiss` と `answer` の km の1行、CSS）、`pc.css`（tap の列）、`docs/events.md:44`（mode の一覧に `'tap'`＝白地図タップ。50行目の `hint` の説明にも `tap` を足す）、`howto.html` の `#modes`（PR1 の「4つの出し方」に5つ目の白地図タップを足す。練習と挑戦だけで遊べる、と書く。44行目の「場所を使う2つの出し方」も白地図タップを入れた言い方に）と `tests/unit/pages.test.mjs`（`howto_tap`）、`tests/e2e/layout.mjs`（場面 `quiz_tap`・`wrong_tap`・`named_tap`。今の `startPractice`・`named` は `#qcard .choice` を待つので、tap の場面は `#qcard .tapbox` を待ち、外すのは `answerTap`）、高さがあふれたときだけ `dojo.js`・`dojo.css`（帯の置き場所、`?v=` +1）
- Test: `tests/e2e/tap_map.test.mjs`、`tests/e2e/pc_layout.test.mjs`（場面名が `QUIZ_SCENES` の正規表現に入るので NO_SCROLL に自動で入る）

**Interfaces:**
- Consumes: Task 3 の `tapMap`・`G.cur.proj`・click の処理。
- Produces: `tapMiss(c, p, at) -> void` — 正解の国の path（無ければ丸印）に `.on`（今の `.map path.on`＝`--hl`）、`at` があればその path に `.ngc`（`fill: var(--ng)`）、海なら p に × 印 `<path class="tapx">`（`stroke: var(--ng)`）。`ll = proj.invert(p)` が有効なときだけ、p から `proj([c.ll[1], c.ll[0]])` へ点線 `<line class="tapline">`（`stroke: var(--ng); stroke-dasharray: 5 4; vector-effect: non-scaling-stroke`）と `G.cur.km = Math.round(d3.geoDistance(ll, [c.ll[1], c.ll[0]]) * 6371 / 10) * 10`。正解の国の画面の上の範囲が今の表示（0〜W×0〜H）と重ならないときだけ `zoom.transform` を `d3.zoomIdentity` に（300ms）。`answer` は tap の外れで `G.cur.km != null` なら verdict の下に `<p class="tapkm">タップした所から約${fmt(km)} km</p>`。
- pc.css: `#qcard.q-flag.a-tap { --qcols: minmax(0, .75fr) minmax(0, 1.5fr); }`、`#qcard > .tapbox { grid-column: 2; grid-row: 1; width: min(100%, calc((var(--mh) - 48px) * 16 / 9)); }`。モードのカード: 5枚目を横いっぱいの3行目にすると 1366×657・1024×768 で縦にスクロールしたので、PC は行を増やさない並べ方にする（900〜1279 は3列×2行で5枚目は2列ぶん、≥1280 は5列×1行）。≥1280 の5列で説明が2行になると 1366×768 であふれるので、説明は「国旗を見て白地図をタップ」と短くする。スマホ（2列・1列）は Task 2 の横いっぱいのまま。
- 場面: `quiz_tap`（練習・全世界・5問）、`wrong_tap`（`answerTap({ right: false })` → `#next`）、`named_tap`（`#nameopt` を入れて開始）。

- [ ] **Step 1: 失敗するテストを書く**

```js
t('wrong_shows_km', ...)          // 全世界で外す → .tapkm の文字が /^タップした所から約[\d,]+ km$/、.tapline が1本、path.on が1つ、
                                   // 国を押したなら path.ngc が1つ（海なら .tapx）
t('reset_when_out_of_view', ...)  // ＋を4回押して正解の国が画面の外に出る所へ → 外す → 400ms 後 d3.zoomTransform(svg).k === 1。
                                   // 正解の国が見えたままの外れでは k は変わらない
t('dark_colors', ...)             // colorScheme: 'dark' で外す → .ngc の fill === getComputedStyle(body).getPropertyValue('--ng') の色
t('rpg_practice_to_tap', ...)     // setup.mode = 'tap' を保存し、rpg_battle.test と同じ入り方でバトルに負けて #bt-practice →
                                   // #scr-setup、P.kind === 'practice'、#start → .tapbox が出て errors 0件
// tests/unit/pages.test.mjs
test('howto_tap', () => { const s = read('howto.html').split('<h2 id="modes"')[1].split('<h2 ')[0];
  assert.ok(s.includes('白地図タップ')); assert.match(s, /練習と挑戦/); assert.ok(!/4つの出し方/.test(read('howto.html'))); });
t('dojo_round_still_works', ...)  // dojo.test と同じく drill:dojo を window.__dj に積み、startDojo({ seq: ['td','ro','ad','md','td','ro','ad','md','td','ro'], group: ['td','ro','ad','md'], mode: 'f2n', sid: 'dj-t' })
                                   // → 10問を answerCorrect で答えて #next → __dj の end が { outcome: 'clear', n: 10, wrongs: 0 }、
                                   // 'answer' の right がどれも true、#scr-dojo が見える（answer(a) の1引数の形で道場が通る）
```

- [ ] **Step 2: 落ちるのを確かめる。**
- [ ] **Step 3: Interfaces のとおりに作る。** `pc.css?v=` は Task 2 で上げていれば同じ PR の中なのでそのまま。
- [ ] **Step 4: 1366×657 を確かめる** — `node --test --test-concurrency=1 tests/e2e/pc_layout.test.mjs`。道場の入口はもう見出し行の右（`.dj-head`）にあって高さを使わないので、`setup` が縦スクロールしても入口は動かさない（モードカードの下へ移すと1行ぶん高くなる）。そのときは pc.css で `#modes` を5列1行にして（5枚目を横いっぱいにする行を作らない）、収まることを確かめる。`phone_geometry_unchanged` は setup・quiz の場面でわざと差が出る（README のとおり、差がその場面だけかを確かめる）。
- [ ] **Step 5: 全テストが通る**（`events-doc` も）。
- [ ] **Step 6: コミット** — 「白地図タップで外れたときの距離と色、PC の列、場面と events.md・遊び方ページを足す」。
