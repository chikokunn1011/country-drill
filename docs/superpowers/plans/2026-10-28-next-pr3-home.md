# PR3 B6 ホームの作り直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホームを「大きなカード3枚（クイズで遊ぶ → 今日の難問 → 冒険）＋小さいアイコン5つ（ランキング・バッジ・図鑑・プロフィール・設定）＋ `#home-status`」に作り直し、機能ファイルがボタンを差しこむ形と `:has()` の並べ直しをやめる。

**Architecture:** 入口は全部 index.html の HTML に最初から置き、本体以外のファイルが使う入口は `hidden` で始める。機能ファイル（daily.js・rpg.js・badges.js）は共通の部品 `homeEntry(id, { open, note })` を呼んで入口を出し、押したときの動きと小さい文（`.hb-note`／`.hi-sub`）を書くだけにする。並べ方は index.html（スマホ）と pc.css（900〜1279・≥1280・高さ760以下）だけで決め、rpg.css・badges.css・daily.css・profile.css のホーム用ルールを消す。

**Tech Stack:** HTML / クラシック script / CSS、node:test（unit）、Playwright（e2e、`tests/e2e/helpers.mjs`・`layout.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「B6 ホームの作り直し（PR3）」・「実装の順番」・「チコに決めてほしいこと」22・23・「テストの方針」）

前提: PR0（整理）・PR1（B2 フッター `<!-- footer:start -->`〜、pages.css）はマージ済み。#25・#26 もマージ済み（`#home-profile` は index.html にあり、profile.js が `hidden = false` と `onclick` を付ける）。**PR2（B4 `flag()`・起動・`show`・`startGame`・helpers の settle・`#home-flags` の `loading="lazy"`）はまだ main に無く、別の作業ツリーで同時に作っている。** PR3 は PR2 の変更に頼らない形で作り、index.html では B4 が変える所（スクリプトの読み込み・`flag()`・`$('home-flags').innerHTML = …` の行・起動処理）をさわらない（あとで PR2 の上に載せ直す）。下のファイル:行は 2026-10-29 の main（0e95b82、PR1 マージ後）で確かめたもの。

## Global Constraints

- 出題は変えない（国旗・国名・場所だけ。首都を問わない）。ホームの説明文にも首都を書かない。
- 新しい色は作らない。今ある変数（`--accent` `--accent-ink` `--ink` `--muted` `--line` `--surface` など）だけ。もし色の変数を書くなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。
- id は全部今のまま: `home-play` `home-daily` `home-rpg` `home-rank` `home-badges` `home-book` `home-profile` `home-settings` `home-title` `home-flags`。
- 文言: 大カードの名前は「クイズで遊ぶ」「今日の難問」「冒険」、この順。アイコンは「ランキング」「バッジ」「図鑑」「プロフィール」「設定」、この順。
- localStorage のキー・Supabase・イベント（`drill:*`）は変えない。`TRANSFER_KEYS`・`LOCAL_KEYS` にさわらない。profile.js は変えない。
- `?v=` は「そのとき main にある数 +1」。中身を変えた js/css だけ上げる（`cache_bust`）。pc.css に `?v=` が無ければ `pc.css?v=1` を付ける（PR1 で付いていればその +1）。PR0 の `same_version_same_content` が落ちたら、そのファイルが main の歴史で使った最大の数 +1。
- 機能ファイルは `typeof homeEntry === 'function'` を確かめてから呼ぶ（無ければ入口を出さないだけ）。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。Task 1 の終わりは見た目のテスト（pc_layout・badges の PC 測定）が落ちてよい。Task 2 の終わりで全部通す。

## Review Focus

1. `#home-status` の中に空白や改行を書くと `:empty` が効かず、札もれんぞく日数も無いのに隙間が出る → HTML は `<div class="home-status" id="home-status"></div>` と1行で書く（Task 1 `status_empty_hidden`）。
2. rpg.js が古いまま `#home-rpg` を作ると id が2つになる → rpg.js は作らず `homeEntry` だけ（Task 1 `entry_order` で `#home-rpg` が1つ）。
3. 冒険 OFF（`body.rpg-off`）で `homeEntry('home-rpg')` が `hidden=false` にしても出てはいけない → rpg.css の `body.rpg-off :is(#home-rpg, …) { display: none !important }` は残す（Task 1 `rpg_off_hides_card`）。
4. 360px 幅・5つのアイコンで「プロフィール」がはみ出す・横スクロール（Task 2 `phone_360_fits`）。
5. 1280×577・1366×657 で、札＋3枚＋アイコンとフッター（PR1）でホームが縦にスクロールする（Task 2 `pc_fits`、`pc_layout` の NO_SCROLL_SCENES）。

---

### Task 1: homeEntry と新しいホームの HTML、機能ファイルの呼び出し

**Files:**
- Modify: `index.html:373-384`（`#scr-home` の中）、`index.html:822-827`（ボタンの onclick）、index.html の script に `homeEntry`（`registerScreen` の近く）
- Modify: `daily.js:245-257`、`rpg.js:396-403`（`drawEntrances`）・`rpg.js:999-1002`（`setupEntrances`）、`badges.js:781-803`（`renderHome`）
- Modify: `docs/events.md` §6
- Modify: `howto.html`（PR1 の `#start`。入口の名前と並びを新しいホームに合わせる。`#book` の「［国旗図鑑を見る］」も「［図鑑］」に）、`tests/unit/pages.test.mjs`（`howto_start_names`）
- Create: `tests/e2e/home.test.mjs`
- Modify tests: `tests/unit/events-doc.test.mjs`、`tests/e2e/ranking.test.mjs:38-52`、`tests/e2e/rpg_home.test.mjs:60-62`、`tests/e2e/badges.test.mjs:199-212`、`tests/e2e/pc_layout.test.mjs:195-205`

**Interfaces:**
- Produces（A5・ほかの機能ファイルが使う）:
  - `function homeEntry(id: string, { open?: () => void, note?: string } = {}) -> HTMLElement | null` — index.html のトップレベルの function 宣言（グローバル）。`#scr-home` の中に `id` が無ければ null。あれば `hidden = false`、`open` があれば `el.onclick = open`、`note` が `undefined` でなければ `el.querySelector('.hb-note, .hi-sub').innerHTML = note`（呼ぶ側が `esc()` 済みの HTML を渡す）。何度呼んでもよい。
  - `#home-status`（`<div class="home-status" id="home-status"></div>`）: 先頭に badges.js の `.bdg-titlerow`（prepend）、A5 は1行のかたまりを append。空なら見えない。
- HTML の形（`#scr-home` の中、この順）: `.eyebrow`・`h1`・`#home-flags`・`#home-status`・`<div class="home-big" id="home-big">` に `.hbig` 3枚・`<div class="home-icons" id="home-icons">` に `.hicon` 5つ。
  - `.hbig` = `<button class="hbig" id="…"><b class="hb-title">名前</b><span class="hb-desc">説明</span><span class="hb-note"></span></button>`。`#home-play` だけ `class="hbig main"`。`#home-daily` と `#home-rpg` は `hidden`。
  - 説明（`.hb-desc`）: クイズで遊ぶ「国旗・国名・場所を当てる」、今日の難問「毎日かわる問題で、みんなと競う」、冒険「コインで仲間を集めてダンジョンへ」。
  - `.hicon` = `<button class="hicon" id="…"><span class="hi-ico" aria-hidden="true">絵文字</span><span class="hi-label">名前</span><span class="hi-sub"></span></button>`。🏆 ランキング・🎖️ バッジ（`hidden`）・📖 図鑑・👤 プロフィール（`hidden`）・⚙️ 設定。
  - 旧 `.menu` と `<button class="linkbtn" id="home-book">` は無くなる。

- [ ] **Step 1: 失敗するテストを書く**（`tests/e2e/home.test.mjs`。`t` は badges.test と同じ形で `openApp` を包み、既定は `storage: { badges: QUIET_BADGES }`・`blockScripts: []`。`RPG_FILES`・`saveWith` は `rpg_helpers.mjs` から、`TITLED` は badges.test.mjs:194 の値を写す。見えている入口は `el.checkVisibility()` で絞る）

```js
const ids = (page, sel) => page.$$eval(sel, es => es.filter(e => e.checkVisibility()).map(e => e.id));
t('entry_order', async page => {
  assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily', 'home-rpg']);
  assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
  assert.equal(await page.locator('#home-rpg').count(), 1);
  assert.match(await text(page, '#home-play .hb-title'), /^クイズで遊ぶ$/);
  assert.match(await text(page, '#home-daily .hb-note'), /\d+\/\d+[\s\S]*(NEW|挑戦ずみ)/);
  assert.match(await text(page, '#home-badges .hi-sub'), /^\d+\/\d+$/);
});
// 止めたファイルの入口は hidden のまま、残りは詰めて並ぶ
for (const [files, gone] of [[['daily.js'], 'home-daily'], [RPG_FILES, 'home-rpg'], [['badges.js'], 'home-badges'], [['profile.js'], 'home-profile']])
  t(`blocked_${gone}`, async page => { assert.equal(await page.isHidden('#' + gone), true); assert.ok(!(await ids(page, '.hbig, .hicon')).includes(gone)); }, { blockScripts: files });
t('rpg_off_hides_card', async page => { assert.deepEqual(await ids(page, '#home-big > .hbig'), ['home-play', 'home-daily']); }, { storage: { badges: QUIET_BADGES, rpg: saveWith({ show: false }) } });
t('ranking_disabled', async page => { /* ranking.test の route で enabled=false → reload */ assert.deepEqual(await ids(page, '#home-icons > .hicon'), ['home-badges', 'home-book', 'home-profile', 'home-settings']); });
t('tab_order', async page => { /* Tab を押して activeElement.id を home-settings まで集める */
  assert.deepEqual(seen.filter(id => id.startsWith('home-')), ['home-title', 'home-play', 'home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-book', 'home-profile', 'home-settings']);
}, { storage: { badges: TITLED } });
t('status_empty_hidden', async page => {
  assert.equal(await page.isVisible('#home-status'), false);           // QUIET_BADGES: 札なし
  await page.evaluate(() => { BADGES.debug.grant('first-clear@1'); /* 装備して show('home') */ });
  assert.equal(await page.$eval('#home-status', e => e.firstElementChild.className), 'bdg-titlerow');
});
t('entries_open', async page => { /* 各入口を押す → #scr-setup・#scr-daily・#scr-rpg・#scr-ranking・#scr-badges・#scr-book・#scr-profile・#scr-settings が見える（1つずつ show('home') に戻す） */ });
```

`tests/unit/pages.test.mjs` に（PR1 の Task 4 で約束した `#start` の直し）: `test('howto_start_names', () => { const s = read('howto.html').split('<h2 id="start"')[1].split('<h2 ')[0]; for (const w of ['クイズで遊ぶ', '今日の難問', '冒険']) assert.ok(s.includes(w), w); assert.ok(!/［プレイ］|「プレイ」/.test(s)); });`

`tests/unit/events-doc.test.mjs` に: `test('events_doc_home_entry', () => { for (const s of ['homeEntry', '#home-status']) assert.ok(doc().includes('`' + s), s); });`

- [ ] **Step 2: 落ちることを確かめる** — `node --test --test-concurrency=1 tests/e2e/home.test.mjs` と `node --test tests/unit/events-doc.test.mjs tests/unit/pages.test.mjs` → FAIL（`#home-big` が無い、`homeEntry` が doc に無い、`#start` に「クイズで遊ぶ」が無い）

- [ ] **Step 3: index.html を変える** — 上の HTML の形にし、`homeEntry` を足す。`home-play` → `show('setup')`、`home-rank` → `openRanking()`（`hidden = !RANKING.enabled` はそのまま）、`home-book` → `show('book')`、`home-settings` → `show('settings')` の onclick は今の場所で付ける。

- [ ] **Step 4: 機能ファイルを変える**
  - daily.js: `row`・`hb` を作るのをやめ、`markHome()` は `homeEntry('home-daily', { open: () => { V.tab = 'today'; show('daily'); }, note: \`<span class="mono dl-homeday">${mdShort(today())}</span>${done ? '<span class="dl-homedone">挑戦ずみ</span>' : '<span class="dl-new">NEW</span>'}\` })`（open は初回だけでもよい）。`drill:screen` の home で呼び直すのは今のまま。
  - rpg.js: ボタンを作るのをやめ、起動で `homeEntry('home-rpg', { open: () => show('rpg') })`。`drawEntrances` は `homeEntry('home-rpg', { note: \`<small class="rpg-homecoin">${coinHTML(d.coins)}</small>${d.intro ? '' : '<span class="rpg-new">NEW</span>'}\` })`。
  - badges.js `renderHome()`: `#home-status` が無ければ return。`homeEntry('home-badges', { open: () => open(), note: \`${got}/${total}\` + (NEW があれば '<span class="bdg-dot" role="img" aria-label="新しいバッジあり"></span>') })`。札の行は `$('home-status')` の `:scope > .bdg-titlerow` を探し、無ければ作って `prepend`（ボタンは作り直さない）。
  - 3ファイルの `?v=` を main +1（main は rpg.js?v=12・badges.js?v=9・daily.js?v=3 → 13・10・4）。

- [ ] **Step 5: howto.html の `#start`** — 「［プレイ］」などの古い名前を、新しいホームの「クイズで遊ぶ」「今日の難問」「冒険」と、下のアイコンの列（ランキング・バッジ・図鑑・プロフィール・設定）に書きかえる。フッターの目印のあいだはさわらない。

- [ ] **Step 5b: docs/events.md §6 の表に2行** — `homeEntry(id, { open, note })`（上の Produces の説明。入口は index.html に hidden で置いてある、`typeof homeEntry === 'function'` を確かめて呼ぶ）と `#home-status`（ホームの差し込み口。先頭は称号の札（prepend）、ほかは append。空なら見えない（`:empty`））。

- [ ] **Step 6: 今あるテストを新しい形に直す**
  - ranking.test: `home_button_order(_with_rpg)` を `#home-big > .hbig, #home-icons > .hicon` の見えている id の並びに（RPG_FILES を止めたときは `home-rpg` なし）。`text('#home-rank')` は `/ランキング/`、class は `'hicon'`。
  - rpg_home `home_button`: `{ parent: $('home-rpg').parentElement.id, prev: …previousElementSibling.id }` が `{ parent: 'home-big', prev: 'home-daily' }`、class に `hbig`。
  - badges.test `home_button_and_count`: `$('home-badges').previousElementSibling.id === 'home-rank'`。`home_title_chip`: `#home-status` の firstElementChild が `bdg-titlerow`。
  - pc_layout `open_scene_options`: `count` を `isVisible` に（入口は HTML にあるので count は 1 のまま）。

- [ ] **Step 7: 通ることを確かめる** — home・ranking・rpg_home・badges（`home_*` の PC 測定以外）・daily・profile の e2e と unit 全部 → PASS

- [ ] **Step 8: コミット** — `git add index.html daily.js rpg.js badges.js docs/events.md howto.html tests/`、メッセージ「ホームの入口を HTML に置き、機能ファイルは homeEntry で出す」

### Task 2: ホームの CSS（スマホ・PC）と古いルールの片づけ

**Files:**
- Modify: `index.html:145-148`（`.home .flags`・`.home .menu`）、`index.html:315`（モザイクの枚数）
- Modify: `pc.css:36-44`・`pc.css:170-190`・`pc.css:277-285`
- Delete rules: `rpg.css:117-134`（`:has(> #home-rpg)` の4つ。135行目の `body.rpg-off …` は残す）、`badges.css:9-31` のうち `.home .menu` と `#home-badges` のルール（`.bdg-titlerow`・`.bdg-titlechip`・`.bdg-dot` の見た目は残す）、`daily.css:22-31`（`.dl-new` は 32 行目で残す）、`profile.css:50-64`
- Modify tests: `tests/e2e/home.test.mjs`、`tests/e2e/badges.test.mjs:476-545`（`home_menu_pc`・`home_short_pc_fits`・`home_six_buttons_pc` を消して home.test に移す。#26 で［プロフィール］が入って「five」は「six」になった）

**Interfaces:**
- Consumes: Task 1 の HTML の形とクラス（`.home-status` `.home-big` `.hbig` `.hbig.main` `.hb-title` `.hb-desc` `.hb-note` `.home-icons` `.hicon` `.hi-ico` `.hi-label` `.hi-sub`）。
- Produces: A5 が `#home-status` に足す行は、`.home-status`（縦の flex、`align-items: center`、幅 `min(340px, 100%)`、≥1280 は左寄せ）の子になる。

- [ ] **Step 1: 失敗するテストを書く**（home.test に足す）

```js
t('flags_seven_phone', async page => {   // PHONE: 見えるモザイクは7枚で1行
  const tops = await page.$$eval('#home-flags img', es => es.filter(e => e.checkVisibility()).map(e => Math.round(e.getBoundingClientRect().top)));
  assert.equal(tops.length, 7); assert.equal(new Set(tops).size, 1);
});
t('phone_360_fits', async page => {
  assert.ok(await noHScroll(page));
  assert.deepEqual(await page.$$eval('.hbig, .hicon', es => es.filter(e => e.checkVisibility() && (e.scrollWidth > e.clientWidth || e.getBoundingClientRect().right > innerWidth)).map(e => e.id)), []);
  const big = await page.$$eval('#home-big > .hbig', es => es.map(e => Math.round(e.getBoundingClientRect().left)));
  assert.equal(new Set(big).size, 1);                                      // スマホは縦に並ぶ
}, { viewport: { width: 360, height: 640 }, blockScripts: [] });
// 旧 home_six_buttons_pc を移す: 入口は '.hbig, .hicon'（見えているもの8つ）と #home-title。サイズも同じ5つ
t('pc_fits', ...)   // [[900,700],[1024,768],[1280,577],[1366,657],[1920,1080]]: hscroll なし、docH <= ih、画面の中、たがいに重ならない、.hb-title と .hi-label は1行
t('pc_rows', async page => {
  // 1024×768: .hbig 3枚の top が同じ（横3列）。1366×768: .hbig の right < #home-flags の left（左の列）
  // 1366×657: .hb-desc が見えない。1366×900: 見える
}, { blockScripts: [], storage: { badges: TITLED, rpg: saveWith({ coins: 9999, intro: false }) } });
```

- [ ] **Step 2: 落ちることを確かめる** — `node --test --test-concurrency=1 tests/e2e/home.test.mjs` → 新しい4つが FAIL

- [ ] **Step 3: スマホの CSS（index.html）** — `.home .menu` の2行を消し、次の値で書く: `.home-status`（上の Produces、`gap: 6px`、`:empty { display: none }`）、`.home-big`（縦の flex、`gap: 10px`、幅 `min(340px, 100%)`）、`.hbig`（`--surface` の地・`1.5px solid var(--line)`・角丸 14px・左寄せ、`.hb-title` は `--font-display` 700 1.2rem、`.hb-desc` は .8rem `--muted`、`.hb-note` は右上）、`.hbig.main`（`.btn` と同じ `--accent` の地・`--accent-ink` の字）、`.home-icons`（flex、`justify-content: center`、`gap: 6px`、幅 `min(440px, 100%)`）、`.hicon`（`flex: 1 1 0; max-width: 84px; min-width: 0`、縦の flex、`position: relative`（`.bdg-dot` のため）、`.hi-label` は .72rem `overflow-wrap: anywhere`、`.hi-sub` は .68rem mono `--muted`）。モザイクは `nth-child(n+15)` を `nth-child(n+8)` にし、7枚が1行に入る幅にする。

- [ ] **Step 4: pc.css** — 43-44・182-184・284 を消し、次にする: ≥900 は `.home .flags img:nth-child(n+8) { display: block }`（42行目の n+15 を直す）、900〜1279 は `.home-big { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: min(100%, 960px) }`。≥1280 は grid-template-areas を `". flags" "eyebrow flags" "title flags" "status flags" "big flags" "icons flags" ". flags"`（rows は `1fr auto auto auto auto auto 1fr`）、`#home-status`・`#home-big`・`#home-icons` に grid-area、左寄せ（`justify-content: flex-start`）、`.home-big` は縦1列で幅 `min(440px, 100%)`。`@media (max-height: 760px)` に `.hb-desc { display: none }`。

- [ ] **Step 5: 古いルールを消す** — 上の Files の Delete rules。消したあと `grep -n ':has(> #home-\|\.home \.menu\|dl-homerow\|dl-homebtn' *.css index.html` が0件。

- [ ] **Step 6: badges.test の3つを消し、`?v=` を上げる** — rpg.css・badges.css・daily.css・profile.css を main +1、pc.css も（main は rpg.css?v=21・badges.css?v=1・daily.css?v=1・profile.css?v=2・pc.css?v=1 → 22・2・2・3・2。どれも main の歴史の最大と同じなので same_version_same_content も通る）。

- [ ] **Step 7: 全テスト** — unit・sql と、ホームにさわる e2e（home・ranking・rpg_home・badges・pc_layout・theme・profile・daily・pages）→ PASS（e2e の全体はこの計画の外で4本同時に流す）。とくに `pc_layout`（1366×657 の NO_SCROLL_SCENES の home）、`theme`、`layout.mjs` の場面。落ちたら `.hbig` の padding と `.home` の gap だけで詰める。`GEOM_BASE=origin/main` で `phone_geometry_unchanged` を流し、差がホームだけか見る（README のとおり。わざと変えた差）。

- [ ] **Step 8: コミット** — `git add index.html pc.css rpg.css badges.css daily.css profile.css tests/e2e/home.test.mjs tests/e2e/badges.test.mjs`、メッセージ「ホームをカード3枚とアイコンの列に並べ、:has() の並べ直しを消す」
