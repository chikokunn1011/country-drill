# PR1 B2 静的ページとフッター Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プライバシーポリシー・運営者・遊び方の3ページと、全ページ共通のフッター（目印つき）・読み物用の pages.css を作る（AdSense 審査の前提）。

**Architecture:** 3ページは JS なしの静的 HTML。色は head の先読み script（index.html と同じ文）と pages.css の変数で、アプリの設定 `settings.theme` に合わせる。フッターのリンク列は `<!-- footer:start -->`〜`<!-- footer:end -->` の中に各ファイルで同じものを書き、unit テストで一致を確かめる（JS で差しこまない）。

**Tech Stack:** HTML / CSS、node:test（unit）、Playwright（e2e、`tests/e2e/helpers.mjs` の `startServer`・`openApp`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「B2」の節・「実装の順番」・「テストの方針」）

前提: PR0（#25・#26 のあとの整理）はマージ済み。ファイル:行は #25・#26 マージ前のもので、**マージ後に再確認**する。

## Global Constraints

- 出題は国旗・国名・場所だけ。首都を問う問題は作らない（about.html の文: 「出題は国旗・国名・場所だけ。首都は答えのあとの説明と図鑑で見られる（首都を当てる問題はない）」）。
- 新しい色は作らない。色の変数を書くときは3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。
- `?v=` は「そのとき main にある数 +1」。中身を変えた js/css だけ上げる（`cache_bust`）。PR0 の `same_version_same_content` が落ちたら、そのファイルが main の歴史で使った最大の数 +1 にする。`pc.css` は今 `?v=` が無いので、上げるときは `pc.css?v=1` を付ける（PR3・PR7 も同じ決まり）。
- localStorage のキーと Supabase は変えない。`TRANSFER_KEYS`・`LOCAL_KEYS` にさわらない。
- 文は小学生にも読めるやさしい言葉。運営者はハンドル名と「大学生の個人運営」だけ（本名を出さない）。
- admin.html にはフッターを付けない。画像は使わない（howto）。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`、`bash tests/sql/run.sh`。

## Review Focus

1. PC ホーム（1366×657 など、`pc.css` の `footer { margin-top: auto }`）でフッターが1行ふえ、縦スクロールが出る → `pc_layout` が通ること（Task 1 Step 5）。
2. 結果画面で profile.js の注意書きのリンクを押すと、まだ載せていない記録が消える → リンクは `target="_blank" rel="noopener"`（Task 5 のテスト）。
3. 360px 幅で privacy の長い URL（オプトアウト先）が横スクロールを生む → `overflow-wrap: anywhere`、e2e は 360×740 も測る（Task 1）。
4. 端末がダークでも、設定が無ければライト（アプリと同じ）。`auto` のときだけ端末に合わせる → `pages_follow_theme`（Task 1）。
5. フォームの URL が仮のまま公開される → `contact_form_url` が仮の URL で落ちる。URL が無い間は「準備中」の文だけ（Task 3）。

---

### Task 1: フッター・pages.css・3ページの骨組み

**Files:**
- Create: `pages.css`、`privacy.html`、`about.html`、`howto.html`（骨組みだけ）、`tests/unit/pages.test.mjs`、`tests/e2e/pages.test.mjs`
- Modify: `index.html:284`（footer の CSS）、`index.html:499`（`<footer>`）。必要なら `pc.css:25` と `?v=`

**Interfaces:**
- Produces（B1・B5 が使う）:
  - フッターの HTML（4ファイルで同じ。B1 の `country/*.html` は href に `../` を付ける）:
    ```html
    <!-- footer:start -->
    <nav class="foot-links" aria-label="サイトの案内"><a href="howto.html">遊び方</a><a href="about.html">運営者</a><a href="about.html#contact">お問い合わせ</a><a href="privacy.html">プライバシーポリシー</a></nav>
    <!-- footer:end -->
    ```
  - `pages.css?v=1`: クラス `.page`（本文の箱）・`.back`（［← 国旗マスターで遊ぶ］、href は `./`）・`footer`・`.foot-links`・`table`。
  - unit テストの `PAGES = ['index.html', 'privacy.html', 'about.html', 'howto.html']` と `footerHrefs(html) -> string[]`（目印の間の href、先頭の `../` を外す）。B1 は `PAGES` に `country/*.html` を足す。
  - 同じファイルの `BLOCKS`（3つのかたまりの名前の配列。順は `:root`・prefers-color-scheme の `:root:not([data-theme="light"])`・`:root[data-theme="dark"]`）、`PAGE_VARS`（下のテストの変数の列）、`varsOf(css, block) -> Record<string,string>`、`themeScript(html) -> string`。PR9 が `pages_css_vars_match_index` を embed.html にも広げるときに使う。

- [ ] **Step 1: unit テストを書く**（`tests/unit/pages.test.mjs`。ファイルは文字で読む）

```js
test('footer_links_same', () => {
  for (const p of PAGES) assert.deepEqual(footerHrefs(read(p)), ['howto.html', 'about.html', 'about.html#contact', 'privacy.html'], p);
});
test('footer_not_in_admin', () => assert.ok(!read('admin.html').includes('footer:start')));
test('pages_css_vars_match_index', () => {
  // 3つのかたまり（:root / prefers-color-scheme の :root:not([data-theme="light"]) / :root[data-theme="dark"]）ごとに
  // PAGE_VARS = ['--bg', '--surface', '--ink', '--muted', '--line', '--accent', '--accent-ink', '--font-display', '--font-body', '--font-mono']
  for (const block of BLOCKS) for (const v of PAGE_VARS)
    if (v in varsOf(read('index.html'), block)) assert.equal(varsOf(read('pages.css'), block)[v], varsOf(read('index.html'), block)[v], `${block} ${v}`);
});
test('pages_head', () => {
  for (const p of ['privacy.html', 'about.html', 'howto.html']) {
    const h = read(p);
    assert.match(h, /<html lang="ja">/); assert.match(h, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(h, /<title>[^<]+｜国旗マスター<\/title>/); assert.match(h, /<meta name="description" content="[^"]{20,}">/);
    assert.ok(h.includes(`<link rel="canonical" href="https://chikokunn1011.github.io/country-drill/${p}">`));
    assert.match(h, /<link rel="stylesheet" href="pages\.css\?v=\d+">/);
    assert.equal(themeScript(h), themeScript(read('index.html')));   // head の先読み script（dataset.theme を含む）が同じ文
    assert.match(h, /<a class="back" href="\.\/">← 国旗マスターで遊ぶ<\/a>/);
  }
});
test('footer_targets_exist', () => { /* 各 href のファイルがあり、#contact なら about.html に id="contact" がある */ });
```

`varsOf(css, block) -> Record<string,string>` と `themeScript(html) -> string` はテストの中の小さな関数（正規表現で取り出す）。

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/pages.test.mjs` → FAIL（ファイルが無い）

- [ ] **Step 3: 作る**
  - `index.html` の `<footer>`: 今のクレジット文はそのまま、その下に上のフッター HTML。CSS に `.foot-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 14px; margin-top: 4px; } .foot-links a { color: var(--muted); padding: 4px 2px; }`。
  - `pages.css`: 3か所の変数（index.html から写す。`--grain` などは写さない）、body（背景 `var(--bg)`、左右 `max(16px, env(safe-area-inset-*))`、`overflow-x: clip`）、`.page { max-width: 720px; margin: 0 auto; }`、本文の `overflow-wrap: anywhere`、表は `display: block; overflow-x: auto`、フッターは index と同じ見た目。
  - 3ページ: Step 1 の head、`<main class="page">` に `.back`・`<h1>`・中身は Task 2〜4 で書く、`<footer>` にフッター HTML。about.html は空の `<h2 id="contact">お問い合わせ</h2>` まで置く。

- [ ] **Step 4: e2e を書いて流す**（`tests/e2e/pages.test.mjs`、`openApp(browser, { url: server.url + p, viewport, storage, colorScheme })`）

```js
// 3ページ × PHONE・{ width: 360, height: 740 }・PC
test('pages_render', ...) // errors 0件、scrollWidth <= innerWidth、body の背景 'rgb(238, 242, 241)'、'.foot-links a' が4つ
test('pages_follow_theme', ...) // settings.theme 'dark' → 'rgb(15, 23, 28)'／設定なし + colorScheme 'dark' → ライト／'auto' + colorScheme 'dark' → ダーク
test('footer_to_page_and_back', ...) // index のホームでフッターの a[href="howto.html"] → URL が howto.html、.back を押す → #scr-home が見える
```
Run: `node --test --test-concurrency=1 tests/e2e/pages.test.mjs` → PASS

- [ ] **Step 5: PC の収まりを確かめる** — `node --test --test-concurrency=1 tests/e2e/pc_layout.test.mjs` → PASS。落ちたら `pc.css` で ≥900px のときクレジット文と `.foot-links` を1行に並べ、`pc.css?v=` を上げる（今は `?v=` が無いので `pc.css?v=1` を付ける）。`GEOM_BASE=origin/main` で `phone_geometry_unchanged` を流し、差がフッターまわりだけか見る（README のとおり）。

- [ ] **Step 6: 全テスト → コミット** `git add pages.css privacy.html about.html howto.html index.html tests/unit/pages.test.mjs tests/e2e/pages.test.mjs`（変えたなら pc.css）、メッセージ「静的ページの骨組みとフッターを足す」

### Task 2: privacy.html の文

**Files:** Modify `privacy.html`、`tests/unit/pages.test.mjs`

**Interfaces:** Consumes Task 1 の骨組み。Produces: `<h2 id="external">`（外のサービス。PR2 で cdnjs・jsDelivr を vendor/ に書きかえる）と `<h2 id="ads">`（広告。広告を入れるときに見直す）。

- [ ] **Step 1: テストを書く**

```js
test('privacy_text', () => {
  const h = read('privacy.html');
  for (const id of ['collect', 'device', 'ranking', 'names', 'delete', 'external', 'ads', 'analytics', 'changes']) assert.match(h, new RegExp(`<h2 id="${id}"`));
  assert.ok(h.includes('コードは24時間で使えなくなります。預けたデータは、そのあとの整理で消えます'));
  for (const s of ['Supabase', 'IP アドレス', 'GitHub Pages', 'Google Fonts', 'cdnjs', 'jsDelivr', 'Cookie', 'https://adssettings.google.com', 'https://policies.google.com/technologies/ads', '利用する場合があります', 'アクセス解析']) assert.ok(h.includes(s), s);
  assert.match(h, /最終更新日: \d{4}年\d{1,2}月\d{1,2}日/);
  // キーの名前は並べない: TRANSFER_KEYS・LOCAL_KEYS のうち大文字をふくむ名前（rpgRank・adminErrors など）が出てこない
  for (const k of keysWithUpper(read('profile.js'))) assert.ok(!h.includes(k), k);
});
```

- [ ] **Step 2: 落ちるのを見る** → FAIL
- [ ] **Step 3: 書く** — 設計書 B2「privacy.html」の1〜9をこの順で、h2 の id は上のとおり。#26 のあとの姿で書く（プロフィール: 名前・公開するかどうか・称号・かざり・バッジの数／合言葉はハッシュだけ／記録の種類＝タイムアタック・今日の難問・冒険／非公開のときは名前・かざり・ひとことだけ見える）。端末の保存は種類で（設定・成績・冒険・バッジ・エラーの記録。エラーの記録も外には送らない）。#25 の名前・記録の削除や変更、消した記録が控えにしばらく残ること、消してほしいときは `about.html#contact`。
- [ ] **Step 4: 通るのを見る** → PASS。全テスト → コミット「プライバシーポリシーを書く」

### Task 3: about.html（運営者・出題のきまり・国名・素材・お問い合わせ）

**Files:** Modify `about.html`、`tests/unit/pages.test.mjs`

**Interfaces:** Consumes Task 1 の骨組み（空の `<h2 id="contact">`）。Produces: `<h2 id="contact">`・`<a id="contact-form">`・`<table id="names">`（フッターの `about.html#contact` の先）。

- [ ] **Step 1: テストを書く**

```js
test('about_text', () => {
  const h = read('about.html');
  assert.ok(h.includes('出題は国旗・国名・場所だけ。首都は答えのあとの説明と図鑑で見られる（首都を当てる問題はない）'));
  for (const s of ['大学生の個人運営', '外務省', 'Natural Earth', '日本政府の立場を表すものではありません', 'flag-icons', 'world-atlas', 'world-countries', 'ODbL', 'd3', 'topojson-client']) assert.ok(h.includes(s), s);
});
test('about_name_table', () => {   // 例外の表（<table id="names">）の「このサイト」の列は、どれも countries.js の n にある
  for (const n of namesTableSiteColumn(read('about.html'))) assert.ok(COUNTRY_NAMES.has(n), n);
});
test('contact_form_url', () => {   // URL が入っていれば本物の Google フォーム。まだ無いときはリンクを出さず「準備中」の文だけ
  const h = read('about.html');
  const m = h.match(/<a id="contact-form" href="([^"]+)"/);
  if (m) assert.match(m[1], /^https:\/\/(docs\.google\.com\/forms\/d\/e\/[\w-]{20,}\/viewform|forms\.gle\/\w{10,})$/);
  else assert.ok(h.includes('id="contact-pending"'), 'フォームが無いときは #contact-pending');
});
```
`COUNTRY_NAMES` は `vm` で countries.js を読んだ `window.COUNTRIES` の `n`。

- [ ] **Step 2: 落ちるのを見る** → FAIL
- [ ] **Step 3: 書く** — サイトの目的／運営者（ハンドル名・大学生の個人運営）／出題のきまり（上の文そのまま）／国名表記（外務省の表記が元。ちがうものは `<table id="names">` に「このサイト｜外務省」の2列で。countries.js の 195 の `n` を外務省の一覧と照らして作る。例: イギリス｜英国）／地図の国境の注意／素材とライセンス（README「クレジット」とフォント（SIL OFL）・d3・topojson-client・テクスチャは自作）／`<h2 id="contact">` にフォームへのリンク `<a id="contact-form" href="…">` と「返事がほしい人だけメールアドレスを書いてね」。
- **フォームの URL はまだ無い（チコが用意する）。** 今は `<a id="contact-form">` を置かず、`<p id="contact-pending">お問い合わせフォームは準備中です。</p>` にする。URL をもらったらその1行をリンクに差しかえるだけ（README の「フォーム URL の置き場所」に書く）。仮の URL は入れない。
- [ ] **Step 4: 通るのを見る** → PASS。全テスト → コミット「運営者ページを書く」

### Task 4: howto.html

**Files:** Modify `howto.html`、`tests/unit/pages.test.mjs`

**Interfaces:** Produces: 見出しの id。PR3（B6）で入口の名前が「クイズで遊ぶ」になったら、PR3 が `#start` の文を直す（PR3 Task 1 の `howto_start_names`）。PR7（A7）で出し方が5つになったら、PR7 が `#modes` に白地図タップを足す（PR7 Task 4 の `howto_tap`）。

- [ ] **Step 1: テストを書く**

```js
test('howto_sections', () => {
  const h = read('howto.html');
  for (const id of ['start', 'modes', 'kinds', 'daily', 'rpg', 'book', 'badges', 'profile', 'faq']) assert.match(h, new RegExp(`<h2 id="${id}"`));
  assert.ok(!/<img\b/.test(h));
  assert.ok(!/首都を(当てる|答える)/.test(h.replace('首都を当てる問題はない', '')));   // 首都を問うと読める文がない
});
```
- [ ] **Step 2: 落ちるのを見る** → FAIL
- [ ] **Step 3: 書く** — はじめかた（今の画面の名前どおり）、4つの出し方（国旗→国名・国名→国旗・場所→国旗・国旗→場所）、練習・挑戦・タイムアタック、今日の難問、冒険、図鑑（首都は図鑑で見られる）、バッジ、プロフィールと引き継ぎ（コードは24時間）、よくある質問（`<details>` でよい）。画像なし。
- [ ] **Step 4: 通るのを見る** → PASS。全テスト → コミット「遊び方ページを書く」

### Task 5: profile.js の1行・sitemap・README

**Files:** Modify `profile.js`（名前の入力欄の3か所。マージ後に再確認: postBox の作る欄 約 l.248、`#pf-form` 約 l.453、`#pf-rename-form` 約 l.469）、`index.html`（`profile.js?v=`）、`sitemap.xml`、`README.md`、`tests/unit/pages.test.mjs`、`tests/e2e/profile.test.mjs`

**Interfaces:** Produces: sitemap の3つの `<url>` は先頭（`/`）のすぐ後ろ。B1 の目印はこの後ろに置く。

- [ ] **Step 1: テストを書く**

```js
// unit
test('sitemap_lists_pages', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  for (const p of ['privacy.html', 'about.html', 'howto.html']) assert.ok(locs.includes(`https://chikokunn1011.github.io/country-drill/${p}`), p);
});
test('profile_name_note', () => assert.equal(read('profile.js').match(/本名や学校名は使わないでね/g)?.length, 1));   // 1つの定数を3か所で使う
// e2e（profile.test.mjs）: プロフィールの画面で
//   '.pf-name-note a' の href が 'privacy.html'、target '_blank'、rel に 'noopener'。作る欄と名前を変える欄の両方に見える
//   TA の結果画面（プロフィールなし）の「載せる」箱にも見える
```
- [ ] **Step 2: 落ちるのを見る** → FAIL
- [ ] **Step 3: 作る** — profile.js に `const NAME_NOTE = '<p class="hint pf-name-note">本名や学校名は使わないでね（<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>）</p>';`（IIFE の中。外側に const を書かない）を足し、3つの名前の入力欄の下に入れる。`profile.js?v=` を main +1。sitemap に3ページ（`<lastmod>` はその日）。README に「静的ページ」の節: 3ページとフッターの目印（4ファイルで同じ、テストで確かめる）、pages.css の変数は index.html と同じにする、フォーム URL の置き場所、「広告を入れるときは privacy.html の広告の項目（`#ads`）を見直す」、admin.html にはフッターを付けない。
- [ ] **Step 4: 流す** — 全テスト（とくに `cache_bust`・`transfer-keys`・`pc_layout`・`result_guard`）→ PASS。結果画面が PC で収まらなくなったら、postBox だけ NAME_NOTE を既存の hint の文につなげる。
- [ ] **Step 5: コミット** — 「プロフィールの名前の欄に注意書きを足し、sitemap と README に静的ページを書く」
