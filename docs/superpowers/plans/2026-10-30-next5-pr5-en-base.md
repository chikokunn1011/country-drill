# 改善5案 PR5（英語版の土台）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/country-drill/en/` に英語版 **Flag Master** を出す。土台（`tools/make_en.mjs`・`i18n.js`・辞書・言語の切りかえ・hreflang・英語の manifest・sitemap）と、クイズ5モード・練習／挑戦・結果・図鑑・道場・設定、英語の国のページ195枚・まとめ14枚＋入口・遊び方・運営者・プライバシー・埋めこみまで。まだ訳さない所（タイムアタック・ランキング・今日の難問・プロフィール・れんぞく日数・シェア・バッジ・豆知識・冒険）は英語版では出さない。

**Architecture:** 画面の文字は js では `T('<日本語>', vars)` で包み、英語のページだけが読む辞書 `i18n/en-*.js` から引く（日本語のページでは T はそのまま返す）。`en/index.html` と `en/embed.html` は `tools/make_en.mjs` が index.html・embed.html から作る（`<html lang="en">`・`<base href="../">`・HTML の文字を辞書 `i18n/en-html.js` で置きかえ・未訳の機能の script を外す）。国のページ・まとめページは今の生成スクリプトが日本語と英語の両方を書く。データのキー（地域名など）は日本語のまま、表示のときだけ訳す。

**Tech Stack:** 素の JS・Node（node:test・node:vm）・Playwright（tests/e2e、`--test-concurrency=1`）。

**Spec:** `docs/superpowers/specs/2026-10-29-next5-design.md`（「D3 英語版」161〜225行と「チコに決めてほしいこと」。おすすめは全部 OK 済み）

**土台のブランチ:** PR4 がマージされた main（PR2 の `sw.js`・`tools/make_sw.mjs`・`pwa.js`、PR3 のまとめ、PR4 の国のページが全部入った状態）から `pr5-work` を切る。B8 がまだなら取りこんでから。

## Global Constraints

- 問題に出すのは国旗・国名・場所だけ。首都を問う問題は作らない（図鑑・答えの欄・国のページで首都を「表示」するのは今のまま）。
- 英語版の名前は **Flag Master**、タグは `#FlagMaster`（シェアは PR6 だが、`<title>`・og・manifest・ld+json はこの名前）。
- 英語はアメリカ式のつづり（color・favorite・center・tricolor）。
- 英語の国名 `e`・首都 `ec` は **英語版 Wikipedia の記事名**。括弧の曖昧さ回避（`Georgia (country)`）と「, 国名」の後ろ（`Nassau, Bahamas`・`Victoria, Seychelles`）は外す。例外: `Washington, D.C.` はそのまま、アイルランドは記事名 `Republic of Ireland` ではなく `Ireland`（記事名の「Republic of」は島との区別のためなので）。
- 英語版の国の並びは `e` の ABC 順（`localeCompare(…, 'en')`）。
- **データのキーは日本語のまま**: `c.r`（6地域）・SUBREGIONS のキー・`S.region`・`#play=<地域>`・`G.region`・イベントの `region`・保存値。表示するときだけ `T()` で訳す。
- 地域の英語: アジア `Asia`／ヨーロッパ `Europe`／アフリカ `Africa`／北・中央アメリカ `North & Central America`／南アメリカ `South America`／オセアニア `Oceania`／東アジア `East Asia`／東南アジア `Southeast Asia`／南アジア `South Asia`／中央アジア `Central Asia`／西アジア `West Asia`／東ヨーロッパ `Eastern Europe`／西ヨーロッパ `Western Europe`／カリブ海 `Caribbean`／アフリカ北側 `Africa (north half)`／アフリカ南側 `Africa (south half)`／全世界 `Whole world`。
- 用語集（辞書・ページで同じ語を使う）: クイズで遊ぶ `Play quiz`／練習 `Practice`／挑戦 `Challenge`／タイムアタック `Time Attack`／図鑑 `Gallery`／似た国旗の道場 `Look-alike Flags Dojo`（短く `Dojo`）／設定 `Settings`／一発正解 `right on the first try`／覚えた `Learned`／国旗のまとめ `Flag collections`／国の一覧 `All countries`／国旗の意味 `What the flag means`／となりの国 `Neighboring countries`／似ている国旗 `Similar flags`／首都 `Capital`／面積 `Area`／地域 `Region`／ドパガキ向け `Hype mode`／白地図タップ `Tap the map`。
- **T() の決まり**: 第1引数は日本語の文字列をシングルクォートで直接書く（変数・テンプレート文字列にしない）。数の入る所は `{name}` で、`vars` に渡す。英語の単数・複数は辞書の値を `{ one, other }` にし、`vars.n` で選ぶ（`n === 1` なら one）。T は HTML エスケープしない（今までどおり呼ぶ側で `esc()`）。
- **日本語の文字**の判定はどこでも同じ正規表現 `JA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}　-〿・ー！-｠]/u`（かな・漢字・和文の記号・全角の記号）。`tools/i18n_scan.mjs` が export し、テストはそれを使う。
- 英語のページで日本語の文字が見えてよいのは、言語の切りかえの `日本語`（`lang="ja"` の要素）だけ。
- 未訳の機能は **英語のページで script を読まない**（make_en が外す）: `ranking.js`・`trivia.js`・`profile.js`・`rpg-core.js`・`rpg.js`・`rpg-cards.js`・`rpg-battle.js`・`rpg-team.js`・`rpg-rank.js`・`badges.js`・`share-card.js`・`daily.js`・`streak.js`。タイムアタックは `I18N.hide` に `'ta'` を入れて選べなくする。
- localStorage のキーは増やさない（言語は URL で決まる。英語端末の案内も保存しない）。
- 生成物はコミット。同じ入力ならいつも同じ出力。作る順番は `node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs`（あとのものが前のものの出力を読む）。
- 変えた js/css は `?v=` を「そのとき main にある数 +1」。新しいファイル（`i18n.js`・`i18n/en-*.js`）は `?v=1`。
- CSS の色は今ある変数だけ。新しい色は作らない（作るなら3か所）。
- 英訳は事実を足さない・変えない。日本語の「〜とされる」「公式には決まっていない」の弱め方はそのまま残す（`is said to`・`has no official meaning`）。訳は AI が書き、**別の AI** が「英語として自然か・意味が日本語とずれていないか・事実を足していないか」を確かめる。
- 日本語版の今のテストは全部そのまま通る（T は日本語のページで1文字も変えない）。

## Review Focus

1. **日本語版で保存した設定のまま英語版を開く**（`P.kind = 'ta'`・`S.region = '東アジア'`・`P.count = 'all'`）: タイムアタックは出ず練習になり、保存は書きかえない（日本語版に戻るとタイムアタックのまま）。地域は `East Asia` と出る。Task 6 の `en_saved_ta_shows_practice`。
2. **長い英語の国名**（`Saint Vincent and the Grenadines`・`Democratic Republic of the Congo`・`Federated States of Micronesia`）: 390px で選択肢・図鑑のカード・結果の「まちがえた国」が横にはみ出さない。Task 6 の `en_long_names_fit` と Task 8 の `en_book_long_names_fit`。
3. **図鑑の英語の検索**: 大文字小文字・アクセント（`sao tome` → São Tomé and Príncipe、`IVORY` → Ivory Coast）、首都でも当たる。Task 8 の `en_book_search_fold`。
4. **`<base href="../">` でリンクが日本語版へずれる**: 英語のページのリンク（フッター・図鑑の「この国のページ」・まとめのクイズ・国のページの「この地域で遊ぶ」）が全部 `/en/` の下を指す（外のサイトと切りかえの `日本語` を除く）。Task 16 の `en_links_stay_english`。
5. **オフラインで英語版を開く**（一度開いたあと）: 日本語の本編ではなく英語の本編が出る。Task 15 の `sw_en_shell`。

---

### Task 1: i18n.js と、日本語の取り残しを見つけるテスト

**Files:**
- Create: `i18n.js`、`tools/i18n_scan.mjs`、`tests/unit/i18n.test.mjs`
- Modify: `index.html`（`<script src="i18n.js?v=1"></script>` を `<script src="countries.js">` の直前に）

**Interfaces:**
- Produces（`i18n.js`。クラシック script、外側に const/let/function を書かない IIFE。`window` に置く）:
  - `window.LANG`: `document.documentElement.lang === 'en' ? 'en' : 'ja'`（DOM が無い vm では `'ja'`）。
  - `window.I18N_EN`: 辞書。辞書ファイルは `Object.assign(window.I18N_EN ??= {}, { '<日本語>': '<英語>' | { one, other }, ... })` の形。
  - `T(ja: string, vars?: object) -> string`: 日本語なら `ja` の `{k}` を `vars[k]` で置きかえて返す。英語なら辞書の値（`{one, other}` なら `vars.n === 1 ? one : other`）に同じ置きかえ。辞書に無ければ日本語を返し、`console.warn('[i18n] 辞書に無い: ' + ja)` をキーごとに1回。
  - `cName(c) -> string`（英語なら `c.e`、日本語なら `c.n`）、`cCap(c) -> string`（`c.ec` / `c.c`）。
  - `window.I18N = { lang, locale /* 'en-US'|'ja-JP' */, hide: Set<string> /* en は new Set(['ta'])、ja は空 */, page(p) /* en: './'→'en/'、ほかは 'en/' + p。ja: p */, fold(s) /* NFD・結合文字を消す・小文字 */, byName(x, y) /* en: e の localeCompare('en')、ja: n の localeCompare('ja') */ }`。
  - グローバルの名前 `T`・`cName`・`cCap`・`LANG`・`I18N`・`I18N_EN` はほかのファイルで宣言しない（`i18n_globals_unique` で見る）。
- Produces（`tools/i18n_scan.mjs`）: `export const JA_RE`、`export function scanJs(src) -> [{ text, line, wrapped, exempt, data }]`（日本語をふくむ文字列・テンプレート文字列ごと。`wrapped` は `T(` の第1引数、`exempt` はいちばん内側の呼び出しが `console.<x>(` か `Error(`、`data` は `// i18n-data:start` 〜 `// i18n-data:end` の中）、`export function inlineSections(indexHtml) -> { [section]: src }`（本文の `<script>`（src なし・ld+json 以外）を `/* ---------- <名前> ---------- */` で切る。名前は最初の `（` か ` ----------` まで。head の script は `'先読み'`）、`export function tKeys(src) -> string[]`（`T('…'` の第1引数）。
  - 字句の読み方: `//`・`/* */` のコメントは飛ばす。`/` は直前の意味のある文字が `( , = : [ ! & | ? { } ; +` か行頭なら正規表現として読み飛ばす。テンプレートの `${…}` は入れ子で読む。

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/i18n.test.mjs`）
  - `t_ja_identity`: vm（`document` なし）で i18n.js を読み、`T('{n}問', { n: 5 })` が `'5問'`、`T('全世界')` が `'全世界'`。
  - `t_en_lookup`: vm に `document.documentElement.lang = 'en'` を置き、`I18N_EN = { '全世界': 'Whole world', '{n}問': { one: '{n} question', other: '{n} questions' } }` で `T('全世界')` が `'Whole world'`、`T('{n}問', { n: 1 })` が `'1 question'`、`{ n: 3 }` が `'3 questions'`。
  - `t_missing_warns_once`: 英語で辞書に無い `'あ'` を2回呼ぶと2回とも `'あ'`、warn は1回。
  - `t_page_and_fold`: 英語で `I18N.page('./') === 'en/'`・`I18N.page('country/fr.html') === 'en/country/fr.html'`、`I18N.fold('São Tomé') === 'sao tome'`。日本語で `I18N.page('country/') === 'country/'`、`I18N.hide.size === 0`。
  - `scan_fixtures`: `scanJs` に小さな文字列を渡して、`T('あ')` は wrapped、`'あ'` だけは not wrapped、`` `あ${x}` `` は not wrapped、`console.error('あ', e)`・`new Error(`あ${x}`)` は exempt、`// 'あ'` と `/* 'あ' */` は拾わない、`s.replace(/[&<>"]/g, …)` のあとの `'い'` を正しく1つ拾う、data ブロックの中は data。
  - `no_ja_outside_T`: 下の `COVER` のファイル（と index.html の節）で、日本語をふくむ文字列が `wrapped || exempt || data` でないものがあれば、`ファイル:行: 文字列` の一覧で落ちる。最初は `COVER = { 'i18n.js': 'all' }`（index.html の節はあとのタスクで足す）。
  - `every_root_js_listed`: リポジトリ直下の `*.js` が、`COVER`・`NOT_YET`（`ranking.js daily.js profile.js streak.js share-card.js`: PR6、`badges.js trivia.js`: PR7、`rpg-*.js`: PR8）・`SKIP`（`countries.js themes.js world.js admin.js admin-api.js admin-save.js`）のどれか1つだけに入っている。
  - `i18n_globals_unique`: 直下の `*.js` と index.html で `(const|let|var|function) (T|cName|cCap|LANG|I18N|I18N_EN)\b` の宣言が i18n.js 以外に無い。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/i18n.test.mjs`
- [ ] **Step 3: `i18n.js` と `tools/i18n_scan.mjs` を書き、index.html に読みこみを足す。**
- [ ] **Step 4: 通るのを見る**。`node --test tests/unit/` 全部と、e2e の `load.test.mjs`・`home.test.mjs` も通る（日本語版は何も変わらない）。
- [ ] **Step 5: コミット** — `英語版: T() と辞書のしくみ（i18n.js）、日本語の取り残しを見つけるテスト`

### Task 2: 英語の国名と首都（countries.js の `e`・`ec`）

**Files:**
- Modify: `countries.js`（195か国に `"e"` と `"ec"` を足す。並び・ほかの項目は変えない。1行のまま）
- Create: `tests/unit/country-names-en.test.mjs`

**Interfaces:**
- Produces: `window.COUNTRIES[i].e`（英語の国名）・`.ec`（英語の首都）。

- [ ] **Step 1: テスト**
  - `names_en_shape`: 195か国全部に `e`・`ec` があり、空でなく、前後に空白なし、`JA_RE` に当たらない、`(` を含まない。`e` は重複なし。
  - `names_en_examples`: `ci` Ivory Coast／`cz` Czech Republic／`sz` Eswatini／`tl` East Timor／`va` Vatican City／`mk` North Macedonia／`cv` Cape Verde／`gm` The Gambia／`bs` The Bahamas／`ge` Georgia／`ie` Ireland／`cg` Republic of the Congo／`cd` Democratic Republic of the Congo／`fm` Federated States of Micronesia／`mm` Myanmar／`tr` Turkey／`kr` South Korea／`kp` North Korea／`us` United States／`gb` United Kingdom／`xk` Kosovo／`st` São Tomé and Príncipe／`la` Laos／`ru` Russia／`sy` Syria／`bn` Brunei／`md` Moldova／`vn` Vietnam。
  - `capitals_en_examples`: `jp` Tokyo／`us` Washington, D.C.／`bs` Nassau／`sc` Victoria／`lk` Sri Jayawardenepura Kotte／`xk` Pristina／`md` Chișinău／`ch` Bern／`va` Vatican City／`mm` Naypyidaw／`bn` Bandar Seri Begawan／`bj` Porto-Novo。日本語の `c` と同じ都市を訳す（どこを首都とするかは日本語版のまま変えない）。
  - `countries_same_otherwise`: `e`・`ec` を消すと origin/main の countries.js と同じ（origin/main が無ければ飛ばす）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 足す** — 1回きりのスクリプト（コミットしない）で countries.js を書きかえる。
- [ ] **Step 4: 通るのを見る**。`node --test tests/unit/` 全部（admin・daily-core・flag-files など countries.js を読むテストも）。
- [ ] **Step 5: コミット** — `英語版: 国名と首都の英語（英語版 Wikipedia の記事名）`

（コントローラーが別の AI に、195か国の `e`・`ec` を英語版 Wikipedia の記事名と照らさせる。食い違いはこのタスクの直しで入れる。）

### Task 3: make_en.mjs と en/index.html・hreflang・英語の manifest

**Files:**
- Create: `tools/make_en.mjs`、`i18n/en-html.js`（HTML だけの辞書。make_en だけが読み、ブラウザは読まない）、`en/index.html`（生成）、`en/manifest.webmanifest`、`tests/unit/make-en.test.mjs`
- Modify: `index.html`（head に hreflang 3行、`<!-- langsw:start -->`〜`<!-- langsw:end -->` の目印は Task 4）、`tests/e2e/cache_bust.test.mjs`（`index.html`・`en/index.html`・`embed.html` を見る。パスに `/` を許す: `/(?:src|href)="([\w./-]+\.(?:js|css))\?v=(\d+)"/g`）

**Interfaces:**
- Consumes: `JA_RE`（Task 1）、`i18n/en-*.js` の辞書。
- Produces（`tools/make_en.mjs`）:
  - `export const EN_SKIP = ['ranking.js', 'trivia.js', 'profile.js', 'rpg-core.js', 'rpg.js', 'rpg-cards.js', 'rpg-battle.js', 'rpg-team.js', 'rpg-rank.js', 'badges.js', 'share-card.js', 'daily.js', 'streak.js']`
  - `export const EN_DICTS = { 'index.html': ['en-core', 'en-quiz', 'en-rank', 'en-book', 'en-dojo'], 'embed.html': ['en-embed'] }`（`i18n/<名前>.js?v=<数>` を `i18n.js` の script の直後に入れる。数はファイルの1行目 `// v=<数>` から読む。ファイルがまだ無い名前は入れない）
  - `export const EN_PAGES = ['./', 'index.html', 'howto.html', 'about.html', 'privacy.html', 'country/', 'themes/', 'embed.html']`（`<a href>` がこれ（# の前）なら頭に `en/`。`./` は `en/`）
  - `export function readEnInputs(root) -> { index, embed, dict /* en-*.js と en-html.js を全部合わせたもの */ }`
  - `export function translateHtml(html, dict, used = new Set()) -> string`（引いたキーを `used` に足す）: script・style・コメントの外の文字（前後の空白は残し、trim した文で辞書を引く）と、属性 `aria-label title alt placeholder content label` の値を置きかえる。ld+json は JSON として読み `name`・`description` を訳し `inLanguage: 'en'`・`url` を英語にする。置きかえたあと、script・style・コメント・`lang="ja"` の要素の外に `JA_RE` が残れば、残った文の一覧で throw。
  - `export function renderEn(inp) -> { 'en/index.html': string, 'en/embed.html'?: string }`（embed は Task 10 で足す）
  - en/index.html の head: `<html lang="en">`、`<meta charset>` の直後に `<base href="../">`、canonical と `og:url` は `${SITE}en/`、`og:locale` は `en_US`、`<link rel="manifest" href="en/manifest.webmanifest">`、`apple-mobile-web-app-title` は `Flag Master`、hreflang 3行（下）、`<title>Flag Master | Flag, Country & Map Quiz (195 countries)</title>`。
  - hreflang 3行（日本語版・英語版の両方に同じもの）: `<link rel="alternate" hreflang="ja" href="${SITE}">`・`<link rel="alternate" hreflang="en" href="${SITE}en/">`・`<link rel="alternate" hreflang="x-default" href="${SITE}">`。
- `en/manifest.webmanifest`: 日本語のものと同じ形で `name`・`short_name` が `Flag Master`、`description` が `Learn the flags, names and locations of 195 countries with a 4-choice quiz.`、`lang: "en"`、`start_url: "./"`・`scope: "./"`、アイコンは `../icons/…`。

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/make-en.test.mjs`）
  - `en_current`: `renderEn(readEnInputs(ROOT))` の全部が今のファイルと同じ。
  - `en_head`: en/index.html の `<html lang="en">`、`<base href="../">` が head の中で最初の相対 URL（`href=`・`src=`）より前、canonical・og:url・og:locale・manifest・title・hreflang 3行。ld+json の `name` が `Flag Master`、`inLanguage` が `en`。
  - `ja_hreflang`: index.html にも同じ hreflang 3行。
  - `en_scripts`: en/index.html に `EN_SKIP` のどれの script も無い。`i18n.js?v=` の script が本文の `<script>`（インライン）より前にあり、その直後に `EN_DICTS['index.html']` のうちあるファイルが並ぶ。`EN_SKIP` に無い index.html の script はみな残る（同じ `?v=`）。
  - `en_no_japanese_html`: en/index.html の script・style・コメント・`lang="ja"` の要素を除いた所に `JA_RE` が無い。
  - `en_footer_links`: フッターの href が `en/howto.html en/about.html en/about.html#contact en/privacy.html en/country/ en/themes/`。
  - `translate_throws_on_missing`: `translateHtml('<p>未知の文</p>', {})` が `未知の文` をふくむ Error。
  - `en_manifest`: 上の値。アイコンのファイルがある（manifest の場所から解決）。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/make-en.test.mjs`
- [ ] **Step 3: 実装** — `i18n/en-html.js` に index.html の HTML の文を全部（ホーム・トップバー・設定・モード選択・クイズ・結果・**ランキングの節も**・図鑑・フッター・`#pwa-ios`・`#home-pwa`・`#mapwait`・head の文）。今ある数は本文の文が約70・属性が約12・head が約8。`node tools/make_en.mjs` で en/index.html を書く。
- [ ] **Step 4: 通るのを見る**。`cd tests/e2e && node --test --test-concurrency=1 cache_bust.test.mjs`。
- [ ] **Step 5: コミット** — `英語版: tools/make_en.mjs で en/index.html を作る（head・hreflang・manifest）`

### Task 4: 言語の切りかえと、英語の端末への案内

**Files:**
- Modify: `index.html`（切りかえ2か所・`#home-en`・`show()` で切りかえのリンクを直す・CSS）、`tools/make_en.mjs`（切りかえの中身を英語用に差しかえ、`#home-en` を外す）、`en/index.html`（生成）、`tests/e2e/helpers.mjs`（`openApp` に `locale` を足して `newContext({ locale })` に渡す）
- Create: `tests/e2e/lang.test.mjs`

**Interfaces:**
- Produces:
  - 切りかえは2か所: ホーム（`#scr-home` の右上。`position: absolute` で高さを足さない）と、トップバーの右の `.row` の最後。どちらも `<!-- langsw:start --><span class="langsw"><b>日本語</b> / <a href="en/" hreflang="en" lang="en">English</a></span><!-- langsw:end -->`。make_en は目印のあいだを `<span class="langsw"><a href="./" hreflang="ja" lang="ja">日本語</a> / <b lang="en">English</b></span>` にする（翻訳と残りのチェックのあと）。
  - `langHref(name) -> string`（index.html の「画面切り替え」の節）: 移る先の画面の hash。`settings` → `#settings`、`book` → `#book`、`setup` → `#play`（テーマ中は `#theme=<id>`）、ほか（クイズ・結果・道場・ホームなど）は `''`。`show()` の最後で `.langsw a` の href を `I18N.lang === 'en' ? './' : 'en/'` ＋ hash にする。
  - `#home-en`: 日本語版のホームのアイコンの列の下に `<p class="home-en" id="home-en" hidden><a href="en/" hreflang="en" lang="en">English version →</a></p>`。`navigator.languages[0]`（無ければ `navigator.language`）が `ja` で始まらないときだけ出す。保存しない。make_en は `#home-en` の行を外す。

- [ ] **Step 1: テスト**（`lang.test.mjs`）
  - `langsw_home_ja`: 日本語のホームに切りかえが見え、`English` のリンクが `en/`。日本語の端末（`locale: 'ja-JP'`）では `#home-en` は隠れている。
  - `langsw_keeps_screen`: 日本語版で図鑑を開いてトップバーの `English` を押すと `en/#book` の図鑑が開く。英語版の設定で `日本語` を押すと日本語版の設定。
  - `home_en_for_english_device`: `locale: 'en-US'` で日本語版のホームに `English version →` が見え、押すと英語版のホーム。
  - `langsw_layout`: 390px と 1366×657 で、ホームの切りかえがほかの要素と重ならない・縦スクロールが増えない（今の `pc_layout`・`a11y_layout` の測り方をまねる）。
- [ ] **Step 2: 落ちるのを見る** — `cd tests/e2e && node --test --test-concurrency=1 lang.test.mjs`
- [ ] **Step 3: 実装** → `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。e2e の `home`・`pc_layout`・`a11y_layout`・`layout` 関係も通る。
- [ ] **Step 5: コミット** — `英語版: ヘッダーの「日本語 / English」と、英語の端末への案内`

### Task 5: 共通の文・ホーム・設定（辞書 en-core）

**Files:**
- Modify: `index.html`（インラインの節 `データ`・`地図`・`ドパガキ向けの演出`・`画面切り替え`・`設定`・`起動` と head の `先読み`）、`tools/make_en.mjs`（`EN_DICTS` は既に en-core を含む）、`en/index.html`（生成）
- Create: `i18n/en-core.js`（1行目 `// v=1`）、`tests/e2e/en.test.mjs`
- Test: `tests/unit/i18n.test.mjs`（`COVER['index.html']` に上の7節を足す。辞書のテストを足す）

**Interfaces:**
- Consumes: `T`・`cName`・`cCap`・`I18N`（Task 1）、`c.e`・`c.ec`（Task 2）。
- Produces:
  - `REGIONS`・`REGION_BOX`・`SUBREGIONS` の定義は `// i18n-data:start`〜`// i18n-data:end` で囲む（日本語のキーはデータ。辞書には全部の地域名を入れる）。表示は `T(r)`。`regionLabel(r)` は `'all'` → `T('全世界')`、テーマ → `T('テーマ: {n}', { n: <題> })`（題は英語なら `THEMES_DATA[id].e`、Task 12 までは無ければ `n`）、ほか → `T(r)`。
  - `MODES` の `label`・`desc`、`KINDS` の `label`・`desc`、設定の `THEMES`・`FONT_SIZES` は定義のところで `T('…')` で包む（i18n.js と辞書はインライン script より先に読まれる）。
  - `fmt = n => n.toLocaleString(I18N.locale)`。`window.RANKING` の代わり（`formatTime`）の文も T（`'{m}分{s}.{c}秒'` → `'{m}:{s}.{c}'`、`'{s}.{c}秒'` → `'{s}.{c}s'`）。
  - 辞書のテスト（`i18n.test.mjs` に足す。以後のタスクも同じテストに乗る）:
    - `dict_has_all_keys`: COVER の中の `tKeys` と data ブロックの日本語の文字列が、全部 `I18N_EN`（`i18n/en-*.js` を vm で合わせたもの）にある。
    - `dict_values_english`: 値（one/other とも）に `JA_RE` が無い。
    - `dict_placeholders_match`: キーの `{x}` の集まりと値の `{x}` の集まりが同じ（one/other とも）。`{ one, other }` はキーに `{n}` があるときだけ、one と other の2つだけ。
    - `dict_no_unused`: 辞書のキーは、COVER のコードのキー・data ブロックの文字列・make_en が HTML で使ったキー（`translateHtml` の `used`）のどれかに使われている。
    - `dict_no_conflict`: 同じキーが2つの辞書ファイルにあるなら値が同じ。
- e2e の共通部品（`helpers.mjs` に足す）: `export const jaLeft = page => page.evaluate(...)` — 見えている要素（`checkVisibility()`）の文字と、見えている要素の `aria-label`・`title`・`alt`・`placeholder`・`value`（ボタン）と `document.title` のうち `JA_RE` に当たるものの一覧。`[lang="ja"]` の中は除く。正規表現は `JA_RE` の source を渡して使う。

- [ ] **Step 1: テスト**
  - unit: COVER に7節を足すと `no_ja_outside_T` が落ちる。辞書のテスト5つ。
  - e2e `en.test.mjs`（`path: 'en/'`）:
    - `en_home`: `jaLeft` が空。`#home-daily`・`#home-rpg`・`#home-rank`・`#home-badges`・`#home-profile` は見えない。タイトルに `Flag Master`。ページエラーなし、`[i18n]` の warn なし。
    - `en_settings`: 設定を開いて `jaLeft` が空。色・文字の大きさのボタンが英語。まちがえた記録が無いときの文が英語。
    - `en_settings_shared`: 英語版で「画面の色」をダークにすると、日本語版を開いてもダーク（同じ `settings`）。
    - `en_map_wait`: 地図を読めないとき（`blockScripts: ['world.js']` 相当で `world.js?v=1` を落とす）の帯の文が英語。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** — 文を T で包み、`i18n/en-core.js` に訳を書く（この7節で約45か所）。`node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。unit 全部、e2e の `home`・`theme`・`sound`・`map_zoom`・`a11y`。
- [ ] **Step 5: コミット** — `英語版: 共通の文・ホーム・設定を英語に`

### Task 6: モード選択とクイズ5モード（練習・挑戦）（辞書 en-quiz）

**Files:**
- Modify: `index.html`（節 `モード選択`・`クイズ` のうち出題と答えの欄まで。国名・首都・地域の表示を `cName(c)`・`cCap(c)`・`T(c.r)` に）、`en/index.html`（生成）
- Create: `i18n/en-quiz.js`
- Test: `tests/e2e/en.test.mjs`、`tests/unit/i18n.test.mjs`（COVER に `モード選択`）

**Interfaces:**
- Produces:
  - `kindNow()` は `(THEME || I18N.hide.has('ta')) && P.kind === 'ta' ? 'practice' : P.kind`。`renderSetup` の `noTa` も `I18N.hide.has('ta')` のとき true。ただし **英語で隠れているときはタイムアタックのカードそのものを出さない**（「〜では遊べない」の札も出さない）。`P.kind` は書きかえない。`startGame` の `kind` も `kindNow()` に従う。
  - 選択肢・問題文・答えの欄（`factsHTML`）・地図の aria-label・`compareHTML`・`tapkm` の国名は `cName(c)`、首都は `cCap(c)`、地域は `T(c.r)`。
  - 細かい地域の `aria-label`: `T('{r}を細かく', { r: T(p) })`。問題数のチップ: `T('全部（{n}）', { n })`・`T('{n}問', { n: c })`（`{ one, other }`）。

- [ ] **Step 1: テスト**（e2e、`seed` を固定）
  - `en_setup`: モード選択で `jaLeft` が空。モード5枚が英語、あそび方は `Practice`・`Challenge` の2枚だけ（タイムアタックのカードが無い）。地域のチップ・細かい地域・地図の aria-label が英語。
  - `en_saved_ta_shows_practice`: `storage: { setup: { mode: 'f2n', kind: 'ta', count: 'all' }, settings: { region: '東アジア' } }` で英語版のモード選択 → Practice が選ばれ、地域は `East Asia`。スタートして `drill:start` の `kind` は `practice`。localStorage の `setup.kind` は `'ta'` のまま。
  - `en_five_modes`: f2n・n2f・m2f・f2m・tap をそれぞれ練習・5問で、1問目をまちがえ（答えの欄が出る）、残りを正解して最後まで。各問題と答えの欄で `jaLeft` が空。選択肢の国名が `COUNTRIES` の `e`。
  - `en_challenge`: 挑戦・5問でまちがえて「最初から」→ 全部正解。文が英語。
  - `en_long_names_fit`: `vc`（Saint Vincent and the Grenadines）と `cd` が選択肢に出る問題（`f2n`・国名表示ありの `m2f`）を 390px で出し、`document.documentElement.scrollWidth <= 390`、選択肢のボタンの文字が箱からはみ出さない（`scrollWidth <= clientWidth`）。
  - `en_misses_shared`: 英語版でまちがえた国が、日本語版の設定の「まちがえた記録: 1か国」に出る。
  - `en_theme_hash`: `en/#theme=stars` でモード選択が開き、テーマの欄が `Theme: …`（Task 12 までは日本語の題のままなので、このテストは Task 12 で `Theme: Flags with stars (N countries)` を確かめる形に足す。ここでは `#theme-field` が見え、Practice が選ばれることだけ）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約60か所）→ `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。日本語の e2e `quick`・`tap_map`・`subregion`・`theme_quiz`・`timeattack`・`result_guard`・`submit` も通る。
- [ ] **Step 5: コミット** — `英語版: モード選択とクイズ5モード（練習・挑戦）を英語に`

### Task 7: 結果画面と、隠したままのタイムアタック・ランキングの文（辞書 en-quiz・en-rank）

**Files:**
- Modify: `index.html`（節 `クイズ` の残り: `showResult`・`taResult`・ドパの文、節 `ランキング`）、`en/index.html`（生成）
- Create: `i18n/en-rank.js`
- Test: `tests/e2e/en.test.mjs`、`tests/unit/i18n.test.mjs`（COVER に `クイズ`・`ランキング`）

**Interfaces:**
- 結果の条件の行 `cond` は `T('{mode}／{kind}／{region}', …)` ではなく、3つを英語の区切り `' / '` でつなぐ（`T('／')` を辞書で `' / '`）。
- ランキング・タイムアタックの文は訳すが、英語版では `ranking.js` を読まない（`RANKING.enabled` が false）ので画面には出ない。PR6 で使う。

- [ ] **Step 1: テスト**
  - `en_result_practice`: 練習5問（1問まちがえ）→ 結果画面の `jaLeft` が空。「まちがえた国」に英語の国名と英語の首都。`#r-share`・`.tabox`・`#r-ext` の中身が無い。［Play again］・［Mode select］が動く。
  - `en_result_challenge`: 挑戦のクリアの文が英語。
  - `en_dopa`: `settings: { dopa: true }` で1問正解・1問まちがえ → `.fx-pop` の文と結果の RANK 欄に日本語が無い（`PRAISE` も T）。
  - `en_no_ranking`: `en/#ranking` を開いてもホームのまま。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約45か所）→ `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。日本語の e2e `ranking`・`timeattack`・`share_card`・`submit`・`result_guard`。
- [ ] **Step 5: コミット** — `英語版: 結果画面を英語に（タイムアタック・ランキングの文も訳して隠しておく）`

### Task 8: 図鑑（辞書 en-book）

**Files:**
- Modify: `index.html`（節 `図鑑`）、`en/index.html`（生成）
- Create: `i18n/en-book.js`
- Test: `tests/e2e/en.test.mjs`、`tests/unit/i18n.test.mjs`（COVER に `図鑑`。ここで index.html の節が全部そろうので `index_all_sections_covered`: `inlineSections` の名前が全部 COVER にある、を足す）

**Interfaces:**
- 一覧の並びは `I18N.byName`。検索は `I18N.fold(q)` が `I18N.fold(cName(c))` か `I18N.fold(cCap(c))` にふくまれる（日本語は今までどおり `includes`。fold は日本語の文字を変えない）。
- `countryLink` は `` `${I18N.page('country/')}${c.a}.html` ``。
- 図鑑の地域の選択（`#bregion`）の表示は `T(r)`、value は日本語のまま。

- [ ] **Step 1: テスト**
  - `en_book_list`: 一覧の `jaLeft` が空、最初のカードが `Afghanistan`、`Ivory Coast` が `I` のところ。`首都をかくす` の英語のスイッチで首都が消える。
  - `en_book_search_fold`: `sao tome` で1件（São Tomé and Príncipe）、`IVORY` で Ivory Coast、`tokyo` で Japan。
  - `en_book_detail`: カードを押すと小窓の `jaLeft` が空。豆知識の欄が無い。「この国のページ」のリンクが `/en/country/<a>.html`。
  - `en_book_map`: 地図の表示に切りかえ、国を押すと情報欄の `jaLeft` が空。
  - `en_book_long_names_fit`: 390px で `vc` のカードがはみ出さない。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約20か所）→ `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。日本語の e2e の図鑑のテスト（`home`・`country`・`a11y`）も。
- [ ] **Step 5: コミット** — `英語版: 図鑑を英語に（ABC順・英語で検索）`

### Task 9: 似た国旗の道場（辞書 en-dojo）

**Files:**
- Modify: `dojo.js`（`?v=` を上げる）、`index.html`（dojo.js の `?v=`）、`en/index.html`（生成）
- Create: `i18n/en-dojo.js`
- Test: `tests/e2e/en.test.mjs`、`tests/unit/i18n.test.mjs`（COVER に `'dojo.js': 'all'`）、`tests/unit/dojo.test.mjs`（変わらず通る）

**Interfaces:**
- `DOJO.LABEL` は data ブロックで囲み（unit の vm には T が無いので、定義では包まない）、表示のときに `T(D.LABEL[id])`。国名は `cName`。

- [ ] **Step 1: テスト**
  - `en_dojo`: モード選択の帯 → 道場の画面の `jaLeft` が空。1グループを10問（1問まちがえ）遊び、答えの欄（くらべる国旗の `Correct`・`You picked`・`Look-alike`）と、終わったあとの1行が英語。よく取りちがえるペアの欄も英語。
  - `en_dojo_shared`: 英語で遊んだ取りちがえが日本語版の道場のペアに出る（同じ `dojo`）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約30か所）→ `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。`node --test tests/unit/dojo.test.mjs`、e2e `dojo.test.mjs`。
- [ ] **Step 5: コミット** — `英語版: 似た国旗の道場を英語に`

（コントローラーが別の AI に、ここまでの辞書 `i18n/en-html.js`・`en-core.js`・`en-quiz.js`・`en-rank.js`・`en-book.js`・`en-dojo.js` を、日本語のキーと並べて「英語として自然か・ゲームの文として通じるか・意味がずれていないか・用語集どおりか」を見させる。直しは辞書だけ。）

### Task 10: 埋めこみ（en/embed.html、辞書 en-embed）

**Files:**
- Modify: `embed.js`（T で包む・国名は `cName`・`?v=` を上げる）、`embed.html`（`<script src="i18n.js?v=1">` を countries.js の前に、`embed.js` の `?v=`）、`tools/make_en.mjs`（`renderEn` に `en/embed.html`。`#e-daily` のリンクを外す＝今日の難問は PR6）、`tests/unit/pages.test.mjs`（`embed_head` の「読む script」を4つに）
- Create: `i18n/en-embed.js`、`en/embed.html`（生成）
- Test: `tests/unit/make-en.test.mjs`、`tests/e2e/embed.test.mjs`（英語の場合を足す）、`tests/unit/i18n.test.mjs`（COVER に `'embed.js': 'all'`）

- [ ] **Step 1: テスト**
  - unit `en_embed`: en/embed.html が `<html lang="en">`・`<base href="../">`・`noindex` のまま・`#e-daily` が無い・`e-more` が `en/`・日本語が残らない・`en_current` にふくまれる。
  - e2e `embed_en`: `en/embed.html` で問題・選択肢・正解／不正解の文が英語、`jaLeft` が空。国旗の alt に国名が入らない（今のテストと同じ決まり）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約15か所）→ `node tools/make_en.mjs`。
- [ ] **Step 4: 通るのを見る**。`node --test tests/unit/pages.test.mjs`、e2e `embed.test.mjs`。
- [ ] **Step 5: コミット** — `英語版: 埋めこみ（en/embed.html）`

### Task 11: 国のページ・まとめページの英語のデータ（国旗の意味195件など）

**決めたこと:** 国旗の意味の英訳は PR5 に入れる（英語の国のページに出るので）。豆知識は PR7 なので、英語の国のページには豆知識の節を出さない。

**Files:**
- Create: `data/en/flag_meanings.json`（`[{ "a", "t" }]`、195件、`a` の並びは `data/flag_meanings.json` と同じ）、`data/en/similar_tips.json`（`[{ "g", "t" }]`、`g` は `data/similar_tips.json` と同じ並び・中身）、`data/en/feature_rules.json`（`{ "<9つのキー>": "<決まりの文>" }`）、`tests/unit/en-data.test.mjs`

**Interfaces:**
- Produces: 上の3ファイル。`t` は日本語の `t` の訳だけ（`note` は持たない。出どころは日本語の行の `note` が持つ）。

- [ ] **Step 1: テスト**（`en-data.test.mjs`）
  - `meanings_en_shape`: 195件、`a` の並びが日本語と同じ、`t` は 60〜480 字、`JA_RE` が無い、`capital` という語が無い（首都の話を足さない）。
  - `meanings_en_hedges`: 日本語の `t` に「公式には決まっていない」があれば英語に `no official` がある。「とされる」があれば英語に `said to`・`considered`・`believed`・`traditionally`・`often` のどれかがある。
  - `meanings_en_first_sentence`: 最初の文（最初の `. ` まで）が 160 字以内。
  - `tips_en_shape`: 25件、`g` が日本語と同じ、`t` は 200 字以内・日本語なし。
  - `rules_en_shape`: キーが `flag_features.json` の `rules` と同じ9つ、日本語なし。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 訳す** — 日本語の文だけを見て訳す（事実を足さない、弱め方を残す、固有名詞は英語版 Wikipedia の表記）。地域ごと6回に分けて書く。
- [ ] **Step 4: 通るのを見る。コミット** — `英語版: 国旗の意味・見分け方・数え方の英訳`

（コントローラーが別の AI 2体に、地域を分けて日本語と英語を並べて見させる: 英語として自然か・日本語とずれていないか・事実を足していないか・弱め方が残っているか。食い違いだけ直す。）

### Task 12: 英語のまとめページ（en/themes/）

**Files:**
- Modify: `tools/make_theme_pages.mjs`、`themes/*.html`（生成。hreflang と切りかえが入る）、`themes.js`（生成。`e` が入る。index.html の `themes.js?v=` を上げる）、`sitemap.xml`（theme の目印のあいだに英語の15個も）、`pages.css`（`.langsw` の見た目。`?v=` を上げ、すべての読み物ページの `pages.css?v=` をそろえる）、`index.html`（`regionLabel` のテーマの題を `I18N.lang === 'en' ? d.e : d.n` に）、`en/index.html`（生成）
- Create: `en/themes/index.html`・`en/themes/<id>.html` ×14（生成）
- Test: `tests/unit/theme-pages.test.mjs`、`tests/e2e/en.test.mjs`

**Interfaces:**
- Consumes: Task 11 の `data/en/similar_tips.json`・`data/en/feature_rules.json`、`c.e`。
- Produces:
  - `THEMES[id]` に `e`（英語の題）と `leadE`（英語の説明）を足す。題: stars `Flags with stars`／cross `Flags with a cross`／crescent `Flags with a crescent moon`／sun `Flags with a sun`／animal `Flags with animals or birds`／unionjack `Flags with the Union Jack`／vtricolor `Vertical tricolor flags`／htricolor `Horizontal tricolor flags`／redwhite `Red and white flags`／similar `How to tell similar flags apart`／island `Island countries`／landlocked `Landlocked countries`／bigarea `Largest countries by area`／smallarea `Smallest countries by area`。
  - `renderThemes(inp)` は今の出力に `en/themes/…` を足して返す。英語のページは `head` に `lang: 'en'` を渡す（`<html lang="en">`・og:locale `en_US`・og:site_name `Flag Master`・title `<題> | Flag Master`）。並びは `e` の ABC 順。数は `{n} countries`／`{n} pairs`。クイズのボタンは `../index.html#theme=<id>` ではなく `../#theme=<id>`（`en/index.html`）。フッターは en/index.html のフッター（root からの相対）に `../../` を付けたもの。
  - `head()`（make_country_pages.mjs）に `lang`（既定 `'ja'`）と `alt`（相手の言語のページの URL）を足し、両方の言語のページに hreflang 3行（`ja`・`en`・`x-default`=日本語）を書く。本文の最初（`<a class="back">` の行）に切りかえ `<span class="langsw">…</span>` を置く（日本語ページは `English` が相手へのリンク、英語ページは `日本語` が `lang="ja"` のリンク）。
  - 英語のページの文は `make_theme_pages.mjs` の中の表 `EN`（パンくず `Flag Master › Flag collections`、`← Play Flag Master`、`How we count`、`Other collections`、`Rank`・`Flag`・`Country`・`Area` など）に書く。ブラウザの辞書は使わない。
  - `themes.js` の各テーマは `{ "n", "e", "a" }`。

- [ ] **Step 1: テスト**
  - `theme_pages_current`（今あるテスト）: 英語のページもふくめ作り直すと同じ。
  - `en_theme_pages_list`: 15枚、`<html lang="en">`、title `<題> | Flag Master`、canonical `${SITE}en/themes/<id>.html`、description 160字以内、日本語なし（`lang="ja"` の切りかえを除く）。
  - `en_theme_content`: `en/themes/stars.html` に `feature_rules.json` の stars の文、国名は `e` で ABC 順、リンクは `../country/<a>.html`（＝`en/country/`）、`../#theme=stars`。`bigarea.html` の1位が Russia・`17,098,242 km²`。`similar.html` に25組と英語の見分け方。
  - `hreflang_both_ways`: `themes/stars.html` と `en/themes/stars.html` が互いを hreflang で指す。
  - `sitemap_has_en_themes`: theme の目印のあいだに30個の URL。
  - `themes_js_en`: `themes.js` の全部のテーマに `e` があり上の題と同じ。
  - e2e `en_theme_hash`（Task 6 のものを強める）: `en/#theme=stars` で `Theme: Flags with stars (N countries)`。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → `node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs`（日本語の国のページにも hreflang は Task 13 で入るので、ここでは `head` の既定で変わらないことを確かめる）。
- [ ] **Step 4: 通るのを見る**。`node --test tests/unit/theme-pages.test.mjs tests/unit/country-pages.test.mjs tests/unit/pages.test.mjs`、e2e `theme_quiz`。
- [ ] **Step 5: コミット** — `英語版: まとめページ15枚（en/themes/）と hreflang`

### Task 13: 英語の国のページ（en/country/）

**Files:**
- Modify: `tools/make_country_pages.mjs`、`country/*.html`（生成。hreflang と切りかえ）、`sitemap.xml`（country の目印のあいだに英語の196個も）
- Create: `en/country/index.html`・`en/country/<a>.html` ×195（生成）
- Test: `tests/unit/country-pages.test.mjs`、`tests/e2e/country.test.mjs`

**Interfaces:**
- Consumes: `c.e`・`c.ec`、`data/en/flag_meanings.json`、まとめの英語の題（`en/themes/*.html` の h1 を読む。`THEME_PAGES` と同じ読み方で `en/` から）、en/index.html のフッター。
- Produces（英語の国のページの並び）: 国旗 → Region・Area・Capital・ISO → **What the flag means** → **Neighboring countries**（島国は `No land borders (island country)`、そうでない国は `No land borders`）→ Similar flags → **Flag collections with this flag** → 遊ぶ（`Play this region (<地域の英語>)` は `../#play=<日本語の地域を encodeURIComponent>`、`Play Flag Master` は `../`、`See it in the Gallery` は `../#book`）→ 前の国・次の国（同じ6地域の中で `e` の ABC 順）→ フッター。**豆知識の節は出さない**（PR7）。
  - title: `Flag of <e> – Meaning & Neighbors | Flag Master`。description: `Flag of <e>: <英語の意味の最初の文>` に、`<e> (<地域>): flag, capital, area and neighbors.`・`Similar flags: A, B.`・`Learn flags, names and locations with the Flag Master quiz.` を160字に収まるかぎり文ごとに足す。
  - 英語の一覧 `en/country/index.html`: 6地域ごと、`e` の ABC 順。
  - 文は `make_country_pages.mjs` の中の表 `EN` に書く。

- [ ] **Step 1: テスト**
  - `regenerate_same`（今あるテスト）: 英語もふくめ同じ。
  - `en_country_head`: 196枚、`<html lang="en">`、title・canonical `${SITE}en/country/<a>.html`・description 160字以内・hreflang で日本語のページと互いに指す。
  - `en_country_content`: `en/country/fr.html` に `What the flag means` と英語の意味、`Neighboring countries` に Germany など `e` の ABC 順で `de.html` のリンク、首都 `Paris`、地域 `Europe`、`豆知識`・`Trivia` の節が無い、`../#play=` のリンク。`en/country/jp.html` に `No land borders (island country)`。
  - `en_prevnext_edges`: 地域ごとの ABC 順の端で前／次が無い。
  - `en_country_no_japanese`: 全部の英語のページで、`lang="ja"` の切りかえを除いて `JA_RE` が無い。
  - `sitemap_markers`（今あるテスト）を英語の分まで。
  - e2e `country.test.mjs` に `en_country_phone`: 390px で `en/country/vc.html` が横にはみ出さない。切りかえの `日本語` で `country/vc.html` へ。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → `node tools/make_country_pages.mjs`。
- [ ] **Step 4: 通るのを見る。**
- [ ] **Step 5: コミット** — `英語版: 国のページ196枚（en/country/）`

### Task 14: 遊び方・運営者・プライバシーの英語ページ

**決めたこと:** この3枚は手で書く（生成しない。文章なので）。遊び方は **英語版で遊べるものだけ** 書く（5モード・練習・挑戦・図鑑・道場・設定・アプリとして追加・埋めこみ）。PR6〜8 で足す。プライバシーはサイト全体のデータの扱いなので全文を訳す。お問い合わせは今の Google フォーム（日本語）へのリンクのまま、「英語で書いてもよい」と一文。運営者の「国名の決まり」の節は、英語版は英語版 Wikipedia の記事名に従うと書く（日本語の例外の表は訳さない）。

**Files:**
- Create: `en/howto.html`・`en/about.html`・`en/privacy.html`
- Modify: `howto.html`・`about.html`・`privacy.html`（hreflang 3行と切りかえ）、`sitemap.xml`（目印の外に `en/`・`en/howto.html`・`en/about.html`・`en/privacy.html`）
- Test: `tests/unit/pages.test.mjs`

- [ ] **Step 1: テスト**
  - `en_pages_head`: 3枚が `<html lang="en">`、title `How to play | Flag Master`・`About | Flag Master`・`Privacy policy | Flag Master`、canonical、hreflang で互いに、`../pages.css?v=` が日本語のページと同じ数、テーマの先読みの文が index.html と同じ。
  - `en_footer_links_same`: 3枚と en/index.html と英語の国のページのフッターの href を、そのページの URL から絶対 URL にしたものが同じ。
  - `en_pages_no_japanese`: `lang="ja"` を除いて日本語なし。
  - `en_howto_only_available`: en/howto.html に `Time Attack`・`Ranking`・`Daily`・`Adventure`・`Badges` が出ない。`en/embed.html` の iframe の例がある。
  - `en_privacy_sections`: 日本語の privacy.html の `<h2>` と同じ数の `<h2>`（全文を訳した目安）。端末に保存する話（PWA の1行）をふくむ。
  - `sitemap_lists_pages`（今あるテスト）に英語の4つ。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 書く。**
- [ ] **Step 4: 通るのを見る。コミット** — `英語版: 遊び方・運営者・プライバシーの英語ページ`

（コントローラーが別の AI に、3枚を日本語と並べて自然さ・ずれを見させる。）

### Task 15: アプリ化（precache と、オフラインの英語の本編）

**Files:**
- Modify: `tools/make_sw.mjs`、`sw.js`（手で書く部分: 本編の代わりを出す所）、`tests/unit/sw.test.mjs`、`tests/e2e/pwa.test.mjs`（なければ PR2 の SW の e2e）

**Interfaces:**
- `swList(root)` は index.html に加えて **en/index.html** も読む（`<base href="../">` なので URL は根からの相対のまま）。足すもの: `'en/'`・`'en/index.html'`・`i18n/en-*.js?v=…`・`en/manifest.webmanifest`。manifest のアイコンは **manifest のある場所から** 解決する（`posix.normalize(posix.join(posix.dirname(m), i.src))`。`en/` の `../icons/…` → `icons/…`）。`skip` に `en/country/`・`en/themes/` も。`file('en/')` は `'en/index.html'`。
- `sw.js`: `isShell(url)` の代わりに `shellFor(url) -> 'index.html' | 'en/index.html' | null`（根と `index.html` → `index.html`、`en/` と `en/index.html` → `en/index.html`）。

- [ ] **Step 1: テスト**
  - unit `sw_list_en`: `swList(ROOT)` に `en/`・`en/index.html`・`i18n/en-core.js?v=…`（en/index.html にある全部の辞書）・`en/manifest.webmanifest` があり、`en/country/`・`en/themes/` で始まるものが無く、`../` で始まるものが無い。
  - unit `sw_current`（今あるテスト）: 作り直した sw.js が同じ。
  - e2e `sw_en_shell`: service worker を許して `en/` を開き、入り終わるのを待ち、オフラインにして `en/` と `en/#book` を開き直す → 英語のホーム・図鑑（`<html lang="en">`）。オフラインの `en/` で国旗→国名を5問遊べる。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → `node tools/make_sw.mjs`。
- [ ] **Step 4: 通るのを見る**。PR2 の e2e（オフラインで日本語の10問）も。
- [ ] **Step 5: コミット** — `英語版: アプリ化の precache に英語の本編を入れる`

### Task 16: 英語版を全部まわるテスト

**Files:**
- Create: `tests/e2e/en_walk.test.mjs`

- [ ] **Step 1: テストを書く**（PHONE と PC の2回ずつ、`seed` 固定）
  - `en_walk`: ホーム → 設定 → モード選択 → 5モードを1問ずつ（まちがえ1回をふくむ）→ 結果 → 図鑑（一覧・小窓・地図）→ 道場（1回）→ `en/embed.html` → `en/country/`・`en/country/fr.html`・`en/country/jp.html` → `en/themes/`・`en/themes/stars.html`・`similar.html`・`bigarea.html` → `en/howto.html`・`en/about.html`・`en/privacy.html`。各画面で `jaLeft` が空、ページエラーなし、`[i18n]` の warn なし、未訳の入口（`#home-daily`・`#home-rpg`・`#home-rank`・`#home-badges`・`#home-profile`・タイムアタックのカード・`#pcoin`・`#r-share`・豆知識の欄）が見えない。
  - `en_links_stay_english`: 上のページの `<a href>`（`.langsw` と `http` で始まる外のサイトを除く）の行き先が全部 `/en/` の下。
  - `ja_unchanged`: 日本語版のホームの見える文が origin/main の index.html のホームと同じ（切りかえ `日本語 / English` の分を除く。origin/main を別の root で配って比べる。`startServer({ root })`）。
- [ ] **Step 2: 走らせる**（ここまでで通るはず。落ちたら持ち主のタスクの直しとして入れる）— `cd tests/e2e && node --test --test-concurrency=1 en_walk.test.mjs`
- [ ] **Step 3: コミット** — `英語版: 英語の全画面に日本語が出ないことを見るテスト`

### Task 17: PR5 を出す

- [ ] 作る順番どおりに全部作り直し、差分が出ないこと: `node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs && git status --short`（何も出ない）。
- [ ] `node --test tests/unit/` 全部、`cd tests/e2e && node --test --test-concurrency=1 *.test.mjs` 全部（日本語版の今のテストも全部）。
- [ ] 英語の全画面のスクリーンショット（幅390px と PC 1280×800、ホーム・設定・モード選択・5モードの問題と答え・結果・図鑑3つ・道場・埋めこみ・国のページ3枚・まとめ3枚・遊び方）を `/mnt/project-files/country-drill-next5-20261029/en/` に。文字のあふれを目で見る。
- [ ] 辞書全部の最後の見直し（コントローラーが別の AI に、用語集とのずれ・同じ日本語に別の訳がないかを見させる）。
- [ ] push・PR。本文に「英語で遊んでも、コイン・バッジ・れんぞく日数は PR6〜8 で増えるようになる」を書く。チコの OK でマージ。マージ後、Search Console で sitemap を送り直すようチコに頼む（英語のページ約215枚）。

---

## 決めたこと（ルーリング）

1. **未訳の機能は英語のページで script ごと読まない**（make_en が外す）。ボタンは各ファイルが出すものなので自然に出ない。そのかわり英語で遊んでもコイン・バッジ・れんぞく日数は PR6〜8 まで増えない。苦手の記録・道場・設定は同じ localStorage なので共有される。
2. **index.html は HTML もインライン script も PR5 で全部訳す**（タイムアタック・ランキングの文も）。index.html を節ごとに分けて取り残しのテストをかけ、最後に全部の節がそろうことも見る。画面に出さないのは `I18N.hide`（`'ta'`）と script を読まないことで。
3. **データのキーは日本語のまま**（地域名・細かい地域・`#play=`・保存値・イベントの region）。訳すのは表示だけ。英語の国のページの「この地域で遊ぶ」も `#play=<日本語の地域>` を使う。
4. 国名・首都は英語版 Wikipedia の記事名から、括弧と「, 国名」を外す。例外は `Washington, D.C.` と `Ireland`。首都をどこにするかは日本語版のまま（訳すだけ）。
5. アフリカの細かい地域は `Africa (north half)`・`Africa (south half)`（日本語版の分け方が UN の North Africa・Southern Africa と合わないので）。
6. 国旗の意味・見分け方・数え方の英訳は PR5 に入れる（英語の国のページ・まとめに出るので）。豆知識は PR7 なので、英語の国のページに豆知識の節を出さない。
7. 英語の description は160字まで（日本語は120字）。
8. 静的ページ（国・まとめ）の英語の文は生成スクリプトの中の表に書く。`i18n/` の辞書は本編・埋めこみ用。HTML だけの文は `i18n/en-html.js`（make_en だけが読む。ブラウザは読まない）。
9. 遊び方・運営者・プライバシーの英語ページは手で書く。遊び方は英語版で遊べるものだけ、プライバシーは全文。
10. 言語の切りかえはホーム右上とトップバー右の2か所。今の言語は太字、もう一方がリンク。`日本語` は `lang="ja"` を付け、日本語の取り残しのチェックから外す。
11. 英語の端末への案内（日本語版のホームの1行）は消すボタンを付けず、保存もしない（新しい localStorage のキーを作らない）。
12. 単数・複数は `{ one, other }` を `vars.n` で選ぶだけ（英語しかないので Intl.PluralRules は使わない）。
13. 取り残しのテストの例外は、`console.*(` と `Error(` の引数、`// i18n-data` のブロック（中の文字は辞書に必須）だけ。vm で読むファイル（dojo.js の前半など）は定義で T を呼ばず、data ブロックにして表示で T。
14. 日本語のページも `i18n.js` を読む（T はそのまま返すだけ）。英語のページだけが辞書を読む。
15. 「その人の時間で何時か」を添える表示は、今日の難問・タイムアタックの今週といっしょに PR6。
16. 英語の manifest の `scope` は `en/`。アプリとして追加すると英語版が開く。
17. 英語の図鑑は ABC 順、検索は英語の国名と首都で、大文字小文字とアクセントを見ない。

## リスク

- **T() で包む量が多い**（index.html の HTML 約90・インライン約160、dojo.js 約30、embed 約15、合わせて約300か所）。日本語版の見た目を変えないことは今ある e2e 全部で守るが、包み忘れは取り残しのテスト、訳し忘れは辞書のテストと `[i18n]` の warn で見る。
- **長い英語の国名**で 390px の選択肢・カード・結果がくずれる。テストは代表の国だけなので、スクリーンショットを目で見る。
- **make_en は HTML を正規表現で読む**ので、index.html の書き方しだいで置きかえ損ねる。残った日本語で throw し、生成物の最新チェックで止める。
- **`<base href="../">`** で、js が作るリンクや `history.replaceState` が日本語版や `en/en/` を指すおそれ。`en_links_stay_english` で見る。
- **作る順番**（make_en → まとめ → 国 → sw）をまちがえると最新チェックが落ちる。順番は Global Constraints と各スクリプトの頭のコメントに書く。
- **英語で遊んでも PR6〜8 までバッジ・コインが増えない**ことを、チコに PR の本文で伝える。
- 取り残しのテストの字句の読み方は簡単なものなので、正規表現の中の引用符などで読みちがえるおそれ。`scan_fixtures` で押さえ、読みちがえたら字句の読み方を直す（例外を足して逃げない）。
