# PR9 B5 埋めこみ「今日の国旗」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブログなどに iframe で貼れる、1日1問（国旗→国名か国名→国旗の4択）の `embed.html` を作り、貼り付けコードを howto.html に載せる。

**Architecture:** 出題は `DAILY_CORE.oneOfDay(day, countries)`（daily-core.js、DOM なし、vm で unit テスト）が日付だけから決める。`embed.html` は単独で動くページで、`countries.js`・`daily-core.js`・`embed.js` と `flags/<a>.svg`（最大4枚）だけを読む。色の変数は `<style>` に3か所写し、`?theme=light|dark|auto` で決める（localStorage は読まない）。

**Tech Stack:** HTML / クラシック script、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs` の `startServer`・`openApp`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「B5」の節・「実装の順番」・「チコに決めてほしいこと」19〜21・「テストの方針」）

前提: PR0〜PR8 はマージ済み（とくに PR1 の `howto.html`・`pages.css`・`tests/unit/pages.test.mjs`、PR2 の `flags/<a>.svg?v=${FLAG_V}`、#25 の daily.js の `#daily` 直リンク）。ファイル:行は **マージ後に再確認** する。決めてほしいこと19のとおり、いちばん最後に回す PR で、チコが「見送る」と言えばやらない。

## Global Constraints

- 出題は国旗・国名だけ（`f2n`・`n2f`）。地図の問題と首都の問題は出さない。埋めこみの画面に首都を出さない。
- 新しい色は作らない。embed.html の `<style>` に index.html の変数を3か所写す: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。値は index.html と同じ（unit で比べる）。
- `daily-core.js?v=` は index.html と embed.html で同じ数にし、main +1（PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。daily-core.js は PR8 の `tools/make_country_pages.mjs` の入力なので、変えたあとも `regenerate_same` が通ること（`SIMILAR` を変えないので国のページは変わらない）。`embed.js?v=1`。`build`・`RULES`・`SIMILAR`・`FAMOUS` は変えない（今日の難問とランキングがずれる）。
- 種は `kokki-embed:1:${day}`。候補は FAMOUS（57か国）から、その日の `build(day)` の20問の答えを外したもの。国はコード順に並べてから選ぶ。
- localStorage・sessionStorage・Supabase・広告・Google Fonts・CDN を使わない。`TRANSFER_KEYS`・`LOCAL_KEYS`・`drill:*` イベントにさわらない。
- 色の初期値はライト。`?theme=dark` でダーク、`?theme=auto` で端末に合わせる、それ以外の値はライト。
- head: `<meta name="robots" content="noindex">` と `<link rel="canonical" href="https://chikokunn1011.github.io/country-drill/">`。sitemap.xml には入れない。フッター（目印のリンク列）は付けず、いちばん下は「国旗: flag-icons（MIT）」だけ。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。

## Review Focus

1. 画像の alt で答えがバレる（f2n の問題の国旗に国名の alt、n2f の選択肢に国名の alt）→ どの `img` の alt にも国名が入らない（Task 2 `no_answer_in_alt`）。
2. embed.html の `daily-core.js?v=` だけ古いまま → 古いキャッシュで `oneOfDay` が無く真っ白。index.html と同じ数か（Task 2 `embed_head`）。
3. `?theme=` に知らない値（`?theme=blue`）→ ライト（Task 2 `embed_theme`）。
4. 国旗が404の n2f → 4つとも代わりの表示でも、押せて例外が出ない（Task 2 `flag_missing`）。
5. howto の貼り付けコード（高さ 440、最大幅 400）で、答えたあとのリンクまで iframe の中に収まる（Task 2 `fits_snippet_box`）。

---

### Task 1: `oneOfDay`（daily-core.js）

**Files:**
- Modify: `daily-core.js`（`compare` の後ろに足し、`globalThis.DAILY_CORE` に `EMBED_MODES`・`oneOfDay` を足す）、`index.html`（`daily-core.js?v=` を main +1）
- Test: `tests/unit/daily-core.test.mjs`

**Interfaces:**
- Consumes: 同じファイルの `validDay`・`hash`・`rng`・`pick`・`shuffle`・`build`・`FAMOUS`。
- Produces（Task 2 の embed.js が使う）:
  - `DAILY_CORE.EMBED_MODES = ['f2n', 'n2f']`
  - `DAILY_CORE.oneOfDay(day: string, countries: {a,n,r,...}[]) -> { day: string, mode: 'f2n'|'n2f', a: string, opts: string[4] }`。日付がおかしければ `build` と同じく throw。

- [ ] **Step 1: テストを書く**（`days`・`C`・`plain` は今のファイルのものを使う）

```js
test('oneOfDay: 同じ日に同じ結果、並びが変わっても同じ', () => {
  const q = plain(D.oneOfDay('2026-10-28', C));
  assert.deepEqual(Object.keys(q), ['day', 'mode', 'a', 'opts']);   // 首都の項目は無い
  assert.equal(q.day, '2026-10-28');
  assert.deepEqual(plain(D.oneOfDay('2026-10-28', C.slice().reverse())), q);
  assert.throws(() => D.oneOfDay('2026-02-30', C));
});
test('oneOfDay: 366日ぶん、答えバレなし・選択肢4つ・FAMOUS・国旗と国名だけ', () => {
  for (const d of days) {
    const q = D.oneOfDay(d, C), answers = new Set(D.build(d, C).map(x => x.a));
    assert.ok(['f2n', 'n2f'].includes(q.mode), d);
    assert.ok(D.FAMOUS.has(q.a) && !answers.has(q.a), d);
    assert.equal(q.opts.length, 4, d); assert.equal(new Set(q.opts).size, 4, d);
    assert.equal(q.opts.filter(a => a === q.a).length, 1, d);
    assert.ok(q.opts.every(a => codes.has(a)), d);
  }
});
test('oneOfDay: 選択肢は同じ地域から（足りる地域なら）', () => {
  for (const d of days) { const q = D.oneOfDay(d, C), r = byA.get(q.a).r;
    if (C.filter(c => c.r === r).length >= 4) assert.ok(q.opts.every(a => byA.get(a).r === r), d); }
});
test('oneOfDay: 出る国と形のかたより', () => {
  const qs = days.map(d => D.oneOfDay(d, C)), n = new Map();
  for (const q of qs) n.set(q.a, (n.get(q.a) ?? 0) + 1);
  assert.ok(n.size >= 45, `${n.size}か国`); assert.ok(Math.max(...n.values()) <= 20);
  for (const m of ['f2n', 'n2f']) assert.ok(qs.filter(q => q.mode === m).length >= 140, m);
});
test('oneOfDay は build を変えない', () => {   // 実装の前に node -e で取った2026-10-28の答えの列をそのまま書く
  assert.equal(D.build('2026-10-28', C).map(q => q.a).join(), '<実装前に取った列>');
});
```
`'<実装前に取った列>'` は Step 1 で `node -e` を流して、変える前の daily-core.js の結果を写す。

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/daily-core.test.mjs` → FAIL（`oneOfDay is not a function`）
- [ ] **Step 3: 作る** — `r = rng(hash(\`kokki-embed:1:${day}\`))`。`all` は `build` と同じくコード順に並べる。候補 = `all` のうち `FAMOUS` にあり、`build(day, countries)` の答えに無いもの。`mode = pick(r, EMBED_MODES)` → `a = pick(r, 候補)` → 選択肢は `[a]` に `shuffle(r, 同じ r の国)`、足りなければ `shuffle(r, 全部)` から、重ならないように4つまで → `shuffle(r, opts)`。この順番で乱数を使う。`index.html` の `daily-core.js?v=` を +1。
- [ ] **Step 4: 通るのを見る** — `node --test tests/unit/daily-core.test.mjs tests/unit/country-pages.test.mjs` → PASS（`regenerate_same` も）。e2e `cache_bust`・`daily.test.mjs` → PASS。
- [ ] **Step 5: 全テスト → コミット** `git add daily-core.js index.html tests/unit/daily-core.test.mjs`、メッセージ「埋めこみ用に1日1問を決める oneOfDay を足す」

### Task 2: embed.html と embed.js

**Files:**
- Create: `embed.html`、`embed.js`、`tests/e2e/embed.test.mjs`
- Modify: `tests/unit/pages.test.mjs`（`pages_css_vars_match_index` に embed.html を足す・`embed_head`・`no_answer_in_alt` の静的な部分）

**Interfaces:**
- Consumes: Task 1 の `DAILY_CORE.oneOfDay`・`DAILY_CORE.jstDay`。PR1 の `tests/unit/pages.test.mjs` の `BLOCKS`・`PAGE_VARS`・`varsOf(css, block)`。`window.COUNTRIES`（`a`・`n`・`r`）。PR2 の国旗の URL の形 `flags/${a}.svg?v=${FLAG_V}`。
- Produces（e2e と Task 3 が使う）:
  - embed.html の script: `countries.js`（index と同じ書き方）、`daily-core.js?v=<index と同じ>`、`embed.js?v=1`。head の先読み: `?theme` が `'auto'` なら `data-theme` を付けず、`'dark'` なら dark、それ以外は light。
  - embed.js（IIFE。グローバルは作らない）: `const FLAG_V = 1;`（index.html と同じ数）。DOM:
    - `#embed`（`<main>`）の中に `h1`「今日の国旗」、`#e-q`（f2n: `この国旗はどこの国？`、n2f: `この国の国旗は？`）、`#e-prompt`（f2n は国旗の img、n2f は国名）、`#e-opts` の `button.e-opt[data-a]`×4（f2n は国名、n2f は国旗の img）、`#e-msg`（`role="status"`）、`#e-links`（はじめは hidden）に `a#e-daily[href="./#daily"]`「今日の難問（20問）に挑戦」と `a#e-more[href="./"]`「もっと遊ぶ」（どちらも `target="_blank" rel="noopener"`）、`button#e-again`（はじめは hidden）。
    - `footer` は「国旗: flag-icons（MIT）」だけ。
    - img の alt は国名を入れない: 問題は `alt="今日の国旗"`、選択肢は `alt=""` でボタンに `aria-label="選択肢1"`〜`4`。
    - 押したとき: まちがい → そのボタンに `.ng` と disabled、`#e-msg`「ちがうよ。もう一度えらんでね」、ほかは押せるまま。正解 → `.ok`、4つとも disabled、`#e-msg`「せいかい！」、`#e-again` を出す（押すと最初の状態に戻る）。どちらでも `#e-links` を出す。
    - 国旗の img の onerror: その img を `<span class="e-noflag">国旗を表示できません</span>` に入れかえる（問題も選択肢も同じ表示。ボタンは押せるまま）。
    - `window.COUNTRIES` か `window.DAILY_CORE?.oneOfDay` が無い、または例外 → `#embed` の中を `<p class="e-err">読みこめませんでした</p>` と `a#e-more` だけにする（`console.error('[embed] …')`）。
  - CSS: 色は `var(--bg --surface --ink --muted --line --accent --accent-ink --ok --ok-soft --ng --ng-soft)` とフォントの変数だけ。選択肢は2列のグリッド、国旗は `aspect-ratio: 4/3`、`body { margin: 0; padding: 12px; overflow-x: clip; }`、文字は `overflow-wrap: anywhere`。

- [ ] **Step 1: unit を足す**（`tests/unit/pages.test.mjs`）

```js
// pages_css_vars_match_index の中を、ファイルごとにくり返す1行に（embed.html は書いてある変数を全部比べる）
for (const [f, names] of [['pages.css', PAGE_VARS /* PR1 の変数の列 */], ['embed.html', Object.keys(varsOf(read('embed.html'), BLOCKS[0]))]]) /* 今の比べ方 */;
test('embed_head', () => {
  const h = read('embed.html'), v = s => s.match(/daily-core\.js\?v=(\d+)/)[1];
  assert.equal(v(h), v(read('index.html')));
  assert.match(h, /<meta name="robots" content="noindex">/);
  assert.ok(h.includes('<link rel="canonical" href="https://chikokunn1011.github.io/country-drill/">'));
  for (const b of BLOCKS) assert.ok(Object.keys(varsOf(h, b)).length > 0, b);   // 3か所ある
  assert.deepEqual([...h.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]), ['countries.js', 'daily-core.js', 'embed.js']);
  assert.ok(!/fonts\.googleapis|<link rel="stylesheet"/.test(h));
  assert.ok(!read('sitemap.xml').includes('embed'));
  assert.match(read('embed.js'), new RegExp(`const FLAG_V = ${read('index.html').match(/const FLAG_V = (\d+);/)[1]};`));
  for (const s of [h, read('embed.js')]) assert.ok(!/localStorage|sessionStorage|supabase|adsbygoogle/i.test(s));
});
```
- [ ] **Step 2: e2e を書く**（`tests/e2e/embed.test.mjs`。日付は daily.test.mjs の `at(iso)` と同じ Date の差しかえを `init` に。f2n の日・n2f の日は、テストの頭で vm に countries.js と daily-core.js を読み、`2026-10-28` から1日ずつ見て最初に見つかった日を使う。開くのは `openApp(browser, { url: server.url + 'embed.html' + qs, init: at(day + 'T03:00:00Z'), … })`。各テストの最後に `app.errors` が0件）

```js
test('answer_wrong_then_right', ...)  // f2n の日と n2f の日の両方: まちがいを押す → .e-opt.ng が1つ、#e-msg /ちがう/、#e-links が見え、
  // #e-daily の href は './#daily'・#e-more は './'、どちらも target="_blank" rel="noopener"。正解を押す → .ok、4つとも disabled、/せいかい/、
  // #e-again → .ok・.ng が0、4つとも押せる。#e-q の文が mode どおり
test('files_read', ...)               // load のあと resource の名前（クエリを外したパス）が countries.js・daily-core.js・embed.js と flags/*.svg だけ。
  // flags は f2n の日に1種類、n2f の日に4種類で、opts の国と同じ。サーバーの外への request は0件（context.on('request') で数える）
test('embed_theme', ...)              // body の背景: 引数なし＋colorScheme dark → rgb(238, 242, 241)、?theme=dark → rgb(15, 23, 28)、
  // ?theme=auto＋colorScheme dark → rgb(15, 23, 28)、?theme=auto＋light → rgb(238, 242, 241)、?theme=blue＋dark → rgb(238, 242, 241)
test('narrow_280', ...)               // 280×600 で f2n・n2f とも documentElement.scrollWidth <= 280、.e-opt が4つとも見える
test('fits_snippet_box', ...)         // 400×440 で n2f の日にまちがいを押したあと scrollHeight <= 440、#e-more が viewport の中
test('countries_blocked', ...)        // blockScripts: ['countries.js'] → .e-err「読みこめませんでした」と #e-more が見える、.e-opt は0、errors 0件
test('flag_missing', ...)             // page.route('**/flags/*.svg*', r => r.abort()) を入れて reload。f2n: #e-prompt に .e-noflag、
  // n2f: .e-noflag が4つ。どちらも正解を押すと /せいかい/、errors 0件
test('no_answer_in_alt', ...)         // f2n・n2f とも、どの img の alt にも COUNTRIES のどの国名も入っていない。#embed の文に答えの国の首都（c）が無い
```
- [ ] **Step 3: 落ちるのを見る** — `node --test tests/unit/pages.test.mjs` と `node --test --test-concurrency=1 tests/e2e/embed.test.mjs` → FAIL（embed.html が無い）
- [ ] **Step 4: embed.html・embed.js を Interfaces のとおりに書く**
- [ ] **Step 5: 通るのを見る** — Step 3 のコマンド → PASS。e2e 全部 → PASS（`theme`・`cache_bust` も）
- [ ] **Step 6: 全テスト → コミット** `git add embed.html embed.js tests/unit/pages.test.mjs tests/e2e/embed.test.mjs`、メッセージ「ブログに貼れる今日の国旗（embed.html）を足す」

### Task 3: howto.html に貼り付けコード

**Files:**
- Modify: `howto.html`（`#faq` の前に1項目）、`tests/unit/pages.test.mjs`（`howto_sections` の id に `'embed'`）

**Interfaces:**
- Consumes: Task 2 の `embed.html` と `?theme=`。PR1 の `howto_sections`。
- Produces: 貼り付けコード（この文字どおり。高さと幅は Task 2 `fits_snippet_box` と同じ）
  `<iframe src="https://chikokunn1011.github.io/country-drill/embed.html" title="今日の国旗（国旗マスター）" width="100%" height="440" style="max-width:400px;border:0" loading="lazy"></iframe>`

- [ ] **Step 1: テストを書く**

```js
test('howto_embed', () => {
  const h = read('howto.html'), snip = '<iframe src="https://chikokunn1011.github.io/country-drill/embed.html" title="今日の国旗（国旗マスター）" width="100%" height="440" style="max-width:400px;border:0" loading="lazy"></iframe>';
  assert.match(h, /<h2 id="embed"/);
  assert.ok(h.includes(snip.replace(/</g, '&lt;').replace(/>/g, '&gt;')));   // < と > だけエスケープ（" はそのまま）
  assert.ok(h.includes('?theme=dark') && h.includes('?theme=auto'));
  assert.ok(!/<iframe\b/.test(h));   // ページの中で実際に埋めこまない（コードとして見せるだけ）
});
```
`howto_sections` の id の列に `'embed'` を足す。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/pages.test.mjs` → FAIL
- [ ] **Step 3: 書く** — `<h2 id="embed">ブログやサイトにはる</h2>`、やさしい文で「1日1問の国旗クイズを、自分のブログにのせられる。下のコードをコピーしてはる」、`<pre><code>` に上のコード（エスケープ）、色は `embed.html?theme=dark`（ダーク）・`?theme=auto`（見る人の端末に合わせる）、出るのは国旗と国名の問題だけ（首都は出ない）。フッターには足さない。
- [ ] **Step 4: 通るのを見る** → PASS。e2e の `pages.test.mjs`（360px で横スクロールなし。`pre` は `overflow-x: auto` で中だけ動く）→ PASS
- [ ] **Step 5: 全テスト → コミット** `git add howto.html tests/unit/pages.test.mjs`、メッセージ「遊び方ページに埋めこみの貼り付けコードを載せる」
