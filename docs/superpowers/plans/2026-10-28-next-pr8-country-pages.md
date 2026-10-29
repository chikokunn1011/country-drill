# PR8 B1 国ごとのページ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「フランス 国旗」などの検索から来る人のために、JS なしの静的ページ `country/<a>.html`（195枚）と一覧 `country/index.html` を作り、本編（図鑑・フッター・`#play=<地域>`）とつなぐ。

**Architecture:** `tools/make_country_pages.mjs` が countries.js・trivia.js・daily-core.js の `SIMILAR`・index.html（`REGIONS`・`SUBREGIONS`・フッター・`FLAG_V`・テーマの先読み script）を読み、196枚の HTML と sitemap.xml の目印のあいだを書く。出力はコミットし、unit テストで「作り直すと同じ」を確かめる。本編は起動時に `#play=<地域>` を受け取り、図鑑の情報欄に「この国のページ ›」を出す。

**Tech Stack:** Node（ESM、`node:vm`）、静的 HTML / CSS（PR1 の `pages.css`）、node:test（unit）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「B1」の節・「実装の順番」・「チコに決めてほしいこと」12・13・「テストの方針」）

前提: PR0〜PR4 はマージ済み（PR5 A1・PR6 A6・PR7 A7 はまだ main に無く、別の作業ツリーで並行して作る。このPRはそれらに頼らない）。とくに PR1（フッターの目印 `<!-- footer:start -->`〜`<!-- footer:end -->`、`pages.css`、`tests/unit/pages.test.mjs` の `PAGES`・`footerHrefs`、sitemap の3ページ）と PR2（`const FLAG_V = 1`、`flags/<a>.svg`、`MAP_SCREENS`・`show()` の地図待ち、`openApp` の `waitMap`）。#25 の起動の分かれ道 `if (location.hash === '#ranking' && RANKING.enabled) openRanking(); else show(start);` もある。#25・#26 もマージ済み。ファイル:行は PR4 マージ後の main（ca18e5b）で確かめた。

## Global Constraints

- 出題は国旗・国名・場所だけ。国のページに出題は無い。首都は「表示するだけ」（`<dt>首都</dt>`）。
- 新しい色は作らない。`country/country.css` には色の変数（`--名前:` の定義）を書かない。色は `pages.css` の3か所（`:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`）だけ。
- 国のページは JS を読まない（`<script src` が無い）。head の script はテーマの先読み（index.html と同じ文）と JSON-LD だけ。
- 国旗は `../flags/<a>.svg?v=<FLAG_V>`（`FLAG_V` は index.html から読む）。`country/flags/` は作らない。OGP 画像は全ページ `https://chikokunn1011.github.io/country-drill/icons/ogp.png`（決めてほしいこと13）。
- 地図は入れない。d3・world.js は読まない。
- 生成は決まった出力: 日付・乱数を使わない。国はコード順（`a` の昇順）。作ったファイルはコミット（決めてほしいこと12）。
- sitemap は `<!-- country:start -->`〜`<!-- country:end -->` のあいだだけ書く。国のページに `<lastmod>` を付けない。
- localStorage のキー・Supabase・イベント（`drill:*`）は変えない。`TRANSFER_KEYS`・`LOCAL_KEYS` にさわらない。
- `?v=` は「そのとき main にある数 +1」、中身を変えた js/css だけ（PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。新しい `country/country.css` は `?v=1`。このPRは index.html の中の script とフッターだけを変え、外の js/css（`pages.css` も）は変えないので、上げる `?v=` は無い。
- サイトの URL の頭: `https://chikokunn1011.github.io/country-drill/`。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに: unit は全部（`node --test tests/unit/*.test.mjs`）。e2e は変えた所に関係するファイルだけ（`cd tests/e2e && node --test --test-concurrency=1 a.test.mjs b.test.mjs`）。e2e の全体は最後に別の手順で流す。SQL は変えないので `bash tests/sql/run.sh` は不要。

## Review Focus

1. `#play=` の値は日本語なので URL では `%E8%A5%BF…` になる。こわれた `%E8` だけの値でも例外を出さず、ホームを出す → `play_hash_bad`（Task 2）。
2. 豆知識・国名に `&` `<` `"` があっても HTML と `content="…"` がこわれない → `escapes_text`（Task 1、`--root` の一時ディレクトリで差しかえ）。
3. description が120字をこえる長い国（セントビンセント及びグレナディーン諸島など） → 195枚すべて ≤120 字（Task 1 `head_items`）。
4. SIMILAR に入っていない国（195−93か国）で「似ている国旗」の見出しだけが空で残る → 見出しごと出さない（Task 1 `similar_section`）。
5. 生成を2回流しても sitemap の目印の外（`/` と PR1 の3ページ）が変わらず、同じ中身になる → `sitemap_markers`（Task 1）。

---

### Task 1: 生成スクリプト・国のページ・フッターの「国の一覧」

**Files:**
- Create: `tools/make_country_pages.mjs`、`country/index.html`・`country/<a>.html`×195（生成）、`country/country.css`、`tests/unit/country-pages.test.mjs`
- Modify: `index.html`・`privacy.html`・`about.html`・`howto.html` のフッター（目印のあいだ）、`sitemap.xml`（目印を足す）、`tests/unit/pages.test.mjs`（`PAGES`・`footer_links_same`・`footer_targets_exist`）、`tests/e2e/pages.test.mjs`（PR1 の `pages_render` の「`'.foot-links a'` が4つ」を5つに）

**Interfaces:**
- Consumes: PR1 のフッター HTML と `pages.css?v=N`（N は privacy.html の `<link rel="stylesheet" href="pages.css?v=(\d+)">` から読む）。PR2 の `const FLAG_V = (\d+);`。daily-core.js の `DAILY_CORE.SIMILAR: string[][]`。
- Produces:
  - フッター（4ページで同じ）の最後に `<a href="country/">国の一覧</a>`。国のページでは相対 href の頭に `../`（`http`・`#` で始まるものは変えない）。
  - `tools/make_country_pages.mjs`（ESM。CLI は `node tools/make_country_pages.mjs [--root DIR] [--out DIR]`、どちらも既定はリポジトリの根）。テストのために export:
    - `readInputs(root: string) -> { C, TRIVIA, SIMILAR, REGIONS, SUBREGIONS, footer, FLAG_V, PAGES_V, themeScript, fontLink, sitemap, flagFiles: Set<string> }` — `REGIONS`・`SUBREGIONS` は index.html から `/const REGIONS = (\[[^\]]*\]);/`・`/const SUBREGIONS = (\{[\s\S]*?\n\});/` で抜き、`vm` で評価。`themeScript` は index.html の head の script のうち `dataset.theme` を含む行（pages.test の `themeScript` と同じ取り方。head の最初の `<script>` には adminErrors を残す文も入っているので、それは写さない）。国のページでは privacy.html と同じく1行のコメントと合わせて `<script>…</script>` に入れる。`fontLink` は `fonts.googleapis.com/css2` の `<link>` の行。
    - `check(inp) -> string[]`（空なら OK）: `SIMILAR に知らないコード: xx`／`豆知識が0件: xx`／`flags/xx.svg が無い`／`フッターの目印が無い`。
    - `render(inp) -> Record<string, string>`（出力の相対パス → 中身。`country/index.html`・`country/<a>.html`×195・`sitemap.xml`）。
    - CLI: `check` が1件でもあれば stderr に全部出して `process.exit(1)`、何も書かない。なければ `render` を `--out` に書く。
  - `country/<a>.html` の中身（クラス名は e2e が使う）: `<a class="back" href="../">← 国旗マスターで遊ぶ</a>`、`<nav class="crumbs">`、`<h1>国名</h1>`、`<div class="cflag"><img src="../flags/<a>.svg?v=<FLAG_V>" alt="<国名>の国旗" width="640" height="480"></div>`、`<dl class="cfacts">`（地域・面積 `fmt` と同じ3桁区切り km²・首都・ISO 大文字）、`<h2>豆知識</h2><ul class="trivia">`（全件、`<li><span class="tv-k">国旗|地理|文化</span>文</li>`）、似ている国があれば `<h2>似ている国旗</h2><ul class="similar">` に `<a href="<b>.html">` ＋国旗＋国名（グループの順、自分を除く）、`<nav class="cplay">` に `<a class="play-region" href="../index.html#play=<encodeURIComponent(地域)>">この地域で遊ぶ（<地域>）</a>`（地域は SUBREGIONS にあればその細かい地域、なければ `c.r`）・`<a href="../">国旗マスターで遊ぶ</a>`・`<a href="../index.html#book">図鑑で見る</a>`、`<footer>`。
  - `country/index.html`: `<h1>国の一覧</h1>`、`REGIONS` の順に `<section><h2>地域</h2>` と `<a class="ccard" href="<a>.html">`（国旗＋国名、コード順）、各見出しの横に `href="../index.html#play=<地域>"`。
  - head（196枚）: `<html lang="ja">`、viewport、`<title>`（国: `<国名>の国旗と豆知識｜国旗マスター`、一覧: `国の一覧（195か国の国旗）｜国旗マスター`）、description（120字まで。国: `<国名>（<c.r>）の国旗と、首都・面積・豆知識。` ＋似ている国があれば `似ている国旗: <国名>・…。` ＋ `国旗マスターで国旗・国名・場所をクイズで覚えよう。`、こえたら似ている国の部分を落とす）、canonical（`…/country/<a>.html`、一覧は `…/country/`）、og:type `website`・og:site_name・og:title・og:description・og:url（canonical と同じ）・og:image（共通）・`og:image:width` 1200・`og:image:height` 630・og:locale `ja_JP`・`twitter:card summary_large_image`、JSON-LD `BreadcrumbList`（国旗マスター `…/` → 国の一覧 `…/country/` → 国名。一覧は2段）、`themeScript`、`fontLink`、`../favicon.ico`、`<link rel="stylesheet" href="../pages.css?v=<PAGES_V>">`、`<link rel="stylesheet" href="country.css?v=1">`。
  - sitemap: `<!-- country:start -->` と `<!-- country:end -->` を PR1 の3ページの後ろに置き、あいだは `…/country/` と195の `…/country/<a>.html`（コード順、`<url><loc>…</loc></url>` だけ）。

- [ ] **Step 1: unit テストを書く**（`tests/unit/country-pages.test.mjs`。`import { readInputs, check, render } from '../../tools/make_country_pages.mjs'`。CLI は `execFileSync('node', [...])`、一時ディレクトリは trivia.test.mjs の `withTmp` と同じ形）

```js
test('regenerate_same', () => {            // 作り直すと同じ（コミット済みと1文字もちがわない）
  const out = render(readInputs(ROOT));
  assert.equal(Object.keys(out).filter(p => p.startsWith('country/')).length, 196);
  for (const [p, s] of Object.entries(out)) assert.equal(read(p), s, p);
  assert.deepEqual(readdirSync(join(ROOT, 'country')).filter(f => f.endsWith('.html')).sort(), Object.keys(out).filter(p => p.startsWith('country/')).map(p => p.slice(8)).sort());
});
test('subregions_extracted', () => {
  const { SUBREGIONS, REGIONS } = readInputs(ROOT);
  assert.equal(REGIONS.length, 6);
  assert.equal(Object.keys(SUBREGIONS).length, 10);
  assert.ok(SUBREGIONS['西ヨーロッパ'].a.split(' ').includes('fr'));
});
test('head_items', () => {                  // 196枚
  for (const p of countryPages()) { const h = read(p);
    assert.match(h, /<title>[^<]+｜国旗マスター<\/title>/, p);
    assert.ok(desc(h).length > 0 && desc(h).length <= 120, p);
    assert.ok(h.includes(`<link rel="canonical" href="${URL_OF(p)}">`), p);   // country/index.html → …/country/
    assert.ok(h.includes('<meta property="og:image" content="https://chikokunn1011.github.io/country-drill/icons/ogp.png">'), p);
    assert.equal(ldJson(h)['@type'], 'BreadcrumbList', p);
    assert.equal(themeScript(h), themeScript(read('index.html')), p);
    assert.ok(!/<script[^>]* src=/.test(h), p);
    assert.match(h, /<link rel="stylesheet" href="\.\.\/pages\.css\?v=\d+">/);
  }
});
test('country_page_content', () => {        // fr: 国旗・豆知識全件・似ている国旗・遊ぶリンク
  const h = read('country/fr.html');
  assert.ok(h.includes(`src="../flags/fr.svg?v=${FLAG_V}"`));
  assert.equal(count(h, /<li><span class="tv-k">/g), TRIVIA.fr.length);
  assert.deepEqual(hrefsIn(h, 'ul.similar'), ['nl.html', 'lu.html', 'py.html']);
  assert.ok(h.includes(`href="../index.html#play=${encodeURIComponent('西ヨーロッパ')}"`));
  assert.ok(h.includes('href="../index.html#book"'));
});
test('similar_section', () => {             // SIMILAR に無い国は見出しごと出さない
  const inSim = new Set(SIMILAR.flat()); assert.equal(inSim.size, 93);
  for (const c of C) assert.equal(read(`country/${c.a}.html`).includes('似ている国旗</h2>'), inSim.has(c.a), c.a);
});
test('relative_links_exist', () => {        // href・src の相対リンク（? と # を外す。/ で終われば index.html）の先がある
  for (const p of countryPages()) for (const u of relLinks(read(p))) assert.ok(existsSync(resolveFrom(p, u)), `${p} → ${u}`);
});
test('no_color_vars_in_country_css', () => assert.ok(!/--[\w-]+\s*:/.test(read('country/country.css'))));
test('sitemap_markers', () => {
  const s = read('sitemap.xml'), inside = between(s, '<!-- country:start -->', '<!-- country:end -->');
  assert.deepEqual(locs(inside), [SITE + 'country/', ...C.map(c => c.a).sort().map(a => `${SITE}country/${a}.html`)]);
  assert.ok(!inside.includes('<lastmod>'));
  for (const p of ['', 'privacy.html', 'about.html', 'howto.html']) assert.ok(locs(outside(s)).includes(SITE + p), p);
  const i = readInputs(ROOT); assert.equal(render({ ...i, sitemap: render(i)['sitemap.xml'] })['sitemap.xml'], render(i)['sitemap.xml']);   // 2回目も同じ
});
test('cli_stops_on_bad_input', () => {      // 一時の root に入力を写し、1つずつこわす。終了コード1・stderr・何も書かない
  for (const [break_, re] of [[similarAdd('zz'), /SIMILAR に知らないコード: zz/], [triviaEmpty('fr'), /豆知識が0件: fr/],
                              [rmFlag('fr'), /flags\/fr\.svg が無い/], [noFooterMarks, /フッターの目印が無い/]])
    withTmp(dir => { copyInputs(dir); break_(dir);
      const r = spawnSync('node', ['tools/make_country_pages.mjs', '--root', dir, '--out', dir], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 1); assert.match(r.stderr, re);
      assert.ok(!existsSync(join(dir, 'country'))); assert.equal(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), read('sitemap.xml')); });
});
test('escapes_text', () => withTmp(dir => {   // 豆知識に `<b>&"` → ページには &lt;b&gt;&amp;&quot;、<b> タグは無い
  copyInputs(dir); setTrivia(dir, 'fr', [{ k: 'flag', t: '<b>&"テスト' }]);
  const h = render(readInputs(dir))['country/fr.html'];
  assert.ok(h.includes('&lt;b&gt;&amp;&quot;テスト')); assert.ok(!h.includes('<b>&'));
}));
```
`pages.test.mjs`: `PAGES` に `country/*.html` を足す（`readdirSync('country')`）。`footer_links_same` の期待の最後に `'country/'`。`footer_targets_exist` は `/` で終わる href を `index.html` に読みかえる。`tests/e2e/pages.test.mjs` の `pages_render` は `'.foot-links a'` の数を 4 → 5 に。

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/country-pages.test.mjs tests/unit/pages.test.mjs` → FAIL（スクリプトが無い）
- [ ] **Step 3: フッターと sitemap の目印** — 4ページの目印のあいだに `<a href="country/">国の一覧</a>`。sitemap.xml の3ページの後ろに目印2行（中は空）。
- [ ] **Step 4: `tools/make_country_pages.mjs` を Interfaces のとおりに書く** — エスケープは `& < > " '` の5つ。面積は `toLocaleString('en-US')`。豆知識のラベルは `{ flag: '国旗', geo: '地理', culture: '文化' }`（絵文字は付けない）。daily-core.js は `vm.runInNewContext(src, ctx)` のあと `ctx.DAILY_CORE`。
- [ ] **Step 5: `country/country.css` を書く** — `var(--…)` だけを使う。`.cflag img { width: min(100%, 360px); height: auto; aspect-ratio: 4/3; border: 1px solid var(--line); }`、`.cfacts` は2列の grid、`.similar`・`.ccards` は `display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px`、カードの国旗は `aspect-ratio: 4/3; width: 100%`、`.cplay a` は 44px 以上の押せる高さ。
- [ ] **Step 6: 流して作る** — `node tools/make_country_pages.mjs` → `country/` に196枚、sitemap の目印のあいだが埋まる。
- [ ] **Step 7: 通るのを見る** — Step 2 のコマンド → PASS。全テスト → PASS。
- [ ] **Step 8: コミット** — `git add tools/make_country_pages.mjs country sitemap.xml index.html privacy.html about.html howto.html tests/unit/country-pages.test.mjs tests/unit/pages.test.mjs tests/e2e/pages.test.mjs`、メッセージ「国ごとのページを作るスクリプトと196枚のページを足す」

### Task 2: 起動の `#play=<地域>`

**Files:**
- Modify: `index.html` の起動（今の `index.html:1568` の `const start = …` と `1571` の `#ranking` の行）
- Test: `tests/e2e/country.test.mjs`（新規）

**Interfaces:**
- Produces（B5 も使える）: `playRegionOf(hash: string) -> string | null` — `hash` が `#play=` で始まるとき、残りを `decodeURIComponent`（例外なら null）し、`'all'`・`REGIONS`・`Object.keys(SUBREGIONS)` のどれかならそれを返す。それ以外は null。
- 起動の形（#25 の分かれ道より前）:
  ```js
  const playR = playRegionOf(location.hash);
  if (playR) { S.region = playR; store.set('settings', S); }
  const start = playR ? 'setup' : { '#play': 'setup', '#settings': 'settings', '#book': 'book' }[location.hash] || 'home';
  ```
  そのあとは今のまま（PR2 の「地図待ちならホームを先に出す」と #25 の `#ranking`）。

- [ ] **Step 1: e2e を書く**（`openApp(browser, { url: server.url + 'index.html#play=' + encodeURIComponent(r) })`）

```js
test('play_hash_region', ...)   // r = '西ヨーロッパ' → #scr-setup が見える、S.region === '西ヨーロッパ'、
                                // JSON.parse(localStorage.settings).region === '西ヨーロッパ'、'#regions .chip[aria-pressed="true"]' の data-r が r
test('play_hash_all_and_region', ...) // 'all' と 'アフリカ' でも同じ
test('play_hash_unknown', ...)  // '#play=xx' → #scr-home、`JSON.parse(localStorage.settings ?? '{}').region` が undefined（書かない）、errors 0件
test('play_hash_bad', ...)      // url + 'index.html#play=%E8' → #scr-home、errors 0件
test('play_plain_unchanged', ...) // '#play'（値なし）は今までどおり #scr-setup、S.region は保存された値のまま
```
- [ ] **Step 2: 落ちるのを見る** — `node --test --test-concurrency=1 tests/e2e/country.test.mjs` → FAIL
- [ ] **Step 3: `playRegionOf` と起動を Interfaces のとおりに変える**
- [ ] **Step 4: 通るのを見る** — 同じコマンド → PASS。全テスト → PASS（`ranking` の `#ranking`、`daily` の `#daily` も）。
- [ ] **Step 5: コミット** — `git add index.html tests/e2e/country.test.mjs`、メッセージ「#play=地域 で地域を選んだモード選択を開く」

### Task 3: 図鑑からのリンク・国のページの e2e・README

**Files:**
- Modify: `index.html`（`selectBook` の `$('binfo').innerHTML`、`$('grid').onclick` の `inner.innerHTML`。今の `index.html:1548`・`1557`。CSS に `.cpage` を1行）、`README.md`
- Test: `tests/e2e/country.test.mjs`

**Interfaces:**
- Produces: `countryLink(c) -> string` = `<p class="cpage"><a href="country/${c.a}.html">この国のページ ›</a></p>`。図鑑の2か所だけで、`factsHTML` の後ろ・豆知識の前に入れる。クイズの答えの欄（`factsHTML` を使うほかの所）には入れない。
- Consumes: Task 1 のクラス名（`.cflag` `.trivia` `.similar` `.play-region` `.ccard`）、Task 2 の `#play=`。

- [ ] **Step 1: e2e を足す**

```js
test('country_page_renders', ...) // PHONE・{ width: 360, height: 740 }・PC で url + 'country/fr.html'：errors 0件、h1 'フランス'、
                                  // '.cflag img' complete && naturalWidth > 0、'.trivia li' の数 === TRIVIA.fr.length（unit と同じ読み方で渡す）、
                                  // scrollWidth <= innerWidth、request に world.js・vendor/ が無い
test('country_page_dark', ...)    // storage { settings: { theme: 'dark' } } → body の背景 'rgb(15, 23, 28)'／設定なし + colorScheme 'dark' → 'rgb(238, 242, 241)'
test('country_play_region', ...)  // fr のページで '.play-region' を押す → #scr-setup が見え、'#regions .chip[aria-pressed="true"]' の data-r が '西ヨーロッパ'
test('country_index', ...)        // url + 'country/' → 'section h2' の文が REGIONS の順、'a.ccard' が195、どれかを押すとその国の h1
test('book_links_country_page', ...) // show('book') → 一覧で '.card[data-a="fr"]' → '#detail .cpage a' の href 'country/fr.html'。
                                  // 地図にして selectBook('fr', true) → '#binfo .cpage a'。押すと h1 'フランス'
test('no_link_in_quiz_answer', ...) // 練習で1問答える → '#qcard .cpage' が0件
```
- [ ] **Step 2: 落ちるのを見る** — `node --test --test-concurrency=1 tests/e2e/country.test.mjs` → `book_links_country_page` が FAIL（ほかは Task 1・2 で通る）
- [ ] **Step 3: `countryLink` を足して2か所で使う** — `.cpage { margin: 10px 0 0; } .cpage a { color: var(--accent); font-weight: 700; }`。
- [ ] **Step 4: README** — 「国ごとのページ」の節: `node tools/make_country_pages.mjs` で作り、出力をコミットする。countries.js・trivia.js・daily-core.js の SIMILAR・index.html の REGIONS/SUBREGIONS/フッター/FLAG_V/テーマの先読み・`pages.css?v=` を変えたら流し直す（`regenerate_same` が落ちて知らせる）。sitemap は目印の外に手で URL を足す。地図はまだ入れない。
- [ ] **Step 5: 通るのを見る** — e2e 全部（`pc_layout` の図鑑の場面も）→ PASS。`GEOM_BASE=<前の main>` で `phone_geometry_unchanged` を流し、差が図鑑の `.cpage` とフッターの1リンクだけか見る（README のとおり）。
- [ ] **Step 6: 全テスト → コミット** — `git add index.html README.md tests/e2e/country.test.mjs`、メッセージ「図鑑から国のページへのリンクを足し、README に作り方を書く」
