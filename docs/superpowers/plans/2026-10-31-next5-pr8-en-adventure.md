# 改善5案 PR8（英語版: 冒険＝ストーリー・ダンジョン・バトル・カード・ガチャ・編成・英雄の塔・冒険ランキング・コインの表示）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 英語版 Flag Master で冒険（Adventure）を全部遊べるようにする。ストーリー・冒険ホーム・ダンジョン・バトル・仲間のカード・ガチャ・編成・英雄の塔・冒険ランキング・コインの表示（トップバーのチップ・クイズ中の `#pcoin`・結果のコインの欄・トースト）を英語にし、英語版の `I18N.hide` から `'rpg'` を外して入口を出す。セーブ（localStorage `rpg`）とサーバーの記録は今のまま（日本語の既定の編成名もそのまま）。日本語のページの見える文字は1文字も変えない。

**Architecture:** PR5〜PR7 のしくみをそのまま使う。rpg-core.js（vm で読む計算部品）は `T` を呼ばず、ダンジョン・モンスター・章・テーマ・塔の日本語を `// i18n-data` のデータにして、表示のときに rpg.js などが `T()` を通す。ほかの rpg-*.js は画面の文を全部 `T()` で包み、国名・首都は `cName`・`cCap`、国の並びは `I18N.byName`。辞書は4つ足す: `i18n/en-rpg.js`（rpg-core のデータ・rpg.js・ストーリー・ほかの rpg-*.js が共有する文）、`i18n/en-rpg-cards.js`（rpg-cards.js・rpg-team.js）、`i18n/en-rpg-battle.js`（rpg-battle.js）、`i18n/en-rpg-rank.js`（rpg-rank.js）。make_en は未訳の rpg-*.js を外すのをやめる（`EN_SKIP` は空）。PR7 の「画面なしのモード」（`HEADLESS`）は消し、英語でも日本語と同じ動き（壊れたセーブはトーストで知らせる）にする。文の量が多い所（モンスター・ダンジョンの名前、ストーリー）は PR7 の豆知識と同じく「訳す → 別の AI が中身のずれを見る → 別の AI が英語の自然さを見る → 直した所だけもう一度ずれを見る」を通す（`tools/dict_sheet.mjs` が確かめ用の表を出す）。

**Tech Stack:** 素の JS・Node（node:test・node:vm）・Playwright（tests/e2e、`--test-concurrency=1`、依存は tests/e2e の中）。

**Spec:** `docs/superpowers/specs/2026-10-29-next5-design.md`（「D3 英語版」。とくに「範囲」の冒険、「しくみ」の辞書と `T()`・「地域名・細かい地域名・モード名・ダンジョン名・カード名・称号も辞書に」・「記録」、「英語の文の確かめ」、「分け方」の PR8 の行、「テスト」の「冒険のバトルを1回最後まで遊べる」）。形と決まりは PR5 の計画 `docs/superpowers/plans/2026-10-30-next5-pr5-en-base.md`（ルーリング 1〜17）、PR6 の計画 `docs/superpowers/plans/2026-10-30-next5-pr6-en-play.md`（ルーリング 1〜12）、PR7 の計画 `docs/superpowers/plans/2026-10-31-next5-pr7-en-badges-trivia.md`（ルーリング 1〜10、「冒険の語」）を引きつぐ。冒険の設計は `docs/superpowers/specs/` の rpg の設計書（§3 ストーリー・§5.1 コインの例の表・§9 セーブ）。

**土台のブランチ:** PR5（#45）・PR6（#46）・PR7（#47）がマージされた origin/main（8cc2b87）から `pr8-work` を切る。

**SQL:** **いらない**。表・関数・NG ワードは変えない。冒険ランキング（`rpg_players`）に送るのは今までどおり名前・Lv・ダンジョン・フロア・塔の階・かざり（国コード）だけで、文は送らない。

## 文の量（origin/main 8cc2b87 で数えた）

`tools/i18n_scan.mjs` の `scanJs` で拾った日本語の文字列（`console.*`・`Error` の中を除く。テンプレート文字列は1つと数え、字数は中の HTML もふくむ）:

| ファイル | 文字列 | ファイル内で重なりを除く | 字数 | うちテンプレート | すでに辞書にある | 辞書 |
|---|---|---|---|---|---|---|
| rpg-core.js | 165 | 139 | 805 | 1 | 19（地域・細かい地域・`#国旗マスター`） | en-rpg |
| rpg.js | 149 | 147 | 5,932 | 54 | 2 | en-rpg |
| rpg-battle.js | 95 | 87 | 3,572 | 48 | 5（問いの文・`・` など） | en-rpg-battle |
| rpg-cards.js | 73 | 69 | 2,335 | 35 | 5（`閉じる`・`すべて`・`全世界`・`シェア`） | en-rpg-cards |
| rpg-team.js | 27 | 27 | 1,523 | 13 | 1 | en-rpg-cards |
| rpg-rank.js | 29 | 29 | 1,339 | 10 | 1 | en-rpg-rank |
| 合計 | **538** | **485**（ファイルをまたいだ重なりも除く） | **15,506** | 161 | 29 | |

- うちストーリー（rpg.js の `STORY`・`STORY_END`）は23文（見出し4・本文19）で約600字。PR7 の豆知識779件（8かたまり）よりずっと少ないので、かたまりに分けず1回の流れで確かめる（Task 4）。
- 名前: モンスター78（第1章35・鏡のボス7・宇宙35・塔の番人1）＋鏡の手下28（「鏡の〜」「さかさ〜」の型2つで作る）、ダンジョン21（名前と `land`）、章3、宇宙のテーマ6、塔1（Task 3）。
- テンプレートの161か所は、HTML を外に出して文だけを `T('…{x}…', { x })` にするので、辞書のキーは新しく **約450**（PR7 の en-badges.js 約270行の1.7倍ほど）。

## Global Constraints

- PR5・PR6・PR7 の Global Constraints は全部そのまま有効（首都の問題を作らない・Flag Master／`#FlagMaster`・アメリカ式のつづり・データのキーは日本語のまま・`T()` の決まり・`JA_RE`・`lang="ja"` と `data-ugc` の中だけ日本語可・localStorage のキーを増やさない・生成物はコミット・CSS の色は今の変数だけ・英訳は事実を足さない・日本語版の今のテストは全部そのまま通る・英語の画面のリンクは `I18N.page()` か `location.pathname` から・保存する値は日本語のまま）。
- **日本語のページの見える文字は1文字も変えない**: `T()` は日本語のページでキーをそのまま返す。HTML の形を変えるのは `data-ugc` を足すときだけ（両方の言語で同じ。見える文字は変わらない）。Task 2 の `ja_rpg_unchanged` が origin/main と冒険の全画面の文を比べる。
- **作る順番**: `node tools/trivia_en.mjs build && node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs`。js・css・辞書・index.html を変えたタスクは毎回この順で作り直してからコミット（sw.js の `VERSION` は中身のハッシュなので、作り直し忘れは `sw.test.mjs` が落とす）。
- **`?v=`**: 変えた js/css と辞書は「そのとき origin/main にある数 +1」（`cache_bust` テストが見る）。同じ PR の中で何度変えても +1 は1回だけ。今の main では `i18n.js` 3→4（index.html と embed.html の両方）・`rpg-core.js` 15→16・`rpg.js` 16→17・`rpg-cards.js` 7→8・`rpg-battle.js` 18→19・`rpg-team.js` 5→6・`rpg-rank.js` 9→10・`profile.js` 9→10・`pc.css` 6→7・`rpg.css` 23→24（英語の長さで直すときだけ）・`i18n/en-profile.js` 1→2。新しい辞書 `i18n/en-rpg.js`・`en-rpg-cards.js`・`en-rpg-battle.js`・`en-rpg-rank.js` は1行目 `// v=1`。`i18n/en-html.js` は make_en だけが読むので `?v=` なし。PR を出す前に main が進んでいたら合わせ直す。
- **辞書の置き場所**: rpg-core.js のデータ（ストーリーをふくむ）・rpg.js・2つ以上の rpg-*.js が使う文（`← 冒険`・`冒険ホームへ`・仲間になった／シルバー／克服／手配書の行・`まちがえた国`・`編成{n}`）→ `en-rpg.js`。rpg-cards.js・rpg-team.js → `en-rpg-cards.js`。rpg-battle.js → `en-rpg-battle.js`。rpg-rank.js → `en-rpg-rank.js`。`EN_DICTS['index.html']` の最後に `'en-rpg', 'en-rpg-cards', 'en-rpg-battle', 'en-rpg-rank'` を足す。今の辞書にあるキー（`閉じる`・`すべて`・`全世界`・`シェア`・`コピー`・`コピーしたよ`・`再読み込み`・`プロフィール`・`{n}か国`・`#国旗マスター`・`・`（` · `）・`〈{title}〉`・地域名・問いの文・`この国旗はどこの国？` など）はそのまま使い、同じキーを2つの辞書に書かない（`dict_no_conflict`）。
- **冒険の語**（PR7 の en-badges.js の頭と PR7 の計画で決めたもの。全部の辞書でこのとおり。Task 1 のテスト `rpg_glossary` が見る）: 冒険 `Adventure`／英雄の塔 `Tower of Heroes`／ダンジョン `Dungeon`（文の中は `dungeon`）／旅人 `Traveler`／旅人のレベル `Traveler level`／バトル `battle`／ボス `boss`・地域ボス `region boss`／地図喰い `the Map Eater`／仲間 `ally`（`allies`。`companion` は使わない）／なかよし度 `Friendship`／シルバー（仲間の段）`Silver`／手配書 `Wanted posters`（1枚は `Wanted poster`）／推奨 Lv `recommended Lv`。
- **en-badges.js の今の言い方**（PR8 の画面の文もこの形に合わせる）: `Reach Traveler level {g}`・`Win your first battle`・`Region bosses defeated: {g}`・`Defeat the Map Eater`・`Defeat a boss with zero mistakes`・`Beat a boss while 5 or more levels below the recommended Lv`・`Make your first ally through Friendship`・`Raise an ally to Silver by learning`・`Have {g} countries as allies`・`Days you completed every Wanted poster: {g} in total`・`Clear floor {g} of the Tower of Heroes`・`{n} floor`／`{n} floors`・`Adventure badge`。en-profile.js: `Adventure: Lv {lv} · Dungeons {d}/{all}`・`Tower of Heroes: floor {n}`。
- **PR8 で足す冒険の語**（同じく `rpg_glossary` が見る）: 国旗クエスト `Flag Quest`／冒険ホーム `Adventure home`／冒険マップ `Adventure map`／冒険ランキング `Adventure leaderboard`／鏡の地図喰い `the Mirror Map Eater`／星喰い `the Star Eater`／地球 `Earth`・鏡の地球 `Mirror Earth`・宇宙 `Space`／第{n}章 `Chapter {n}`／国旗ガチャ `Flag Draw`（引く `draw`、1回 `Draw 1`、10回 `Draw 10`、無料1回 `Free draw`、★3確定 `guaranteed ★3`。チコの決めること 1）／国旗パック `Flag Pack`／カード `card`／ブロンズ・シルバー・ゴールド `Bronze`・`Silver`・`Gold`／かさね `Stack`／おかえし `coins back`／ランクアップ `Rank up`／こうげき `Attack`／HP `HP`／地域ボーナス `Region bonus`／チームボーナス `Team bonus`／編成 `Team`（編成の枠 `team slot`、おまかせ `Auto`、既定の名前 `Team {n}`）／旅人カード `Traveler card`／すがた `look`／レベルアップ `Level up`／フロア `Floor`（`F1`〜`F4`）／階（塔）`floor`／中ボス `mini-boss`／余裕・ちょうど・きびしい `Easy`・`Just right`・`Tough`／今日の手配書 `Today’s Wanted posters`／手配中 `Wanted`／克服 `Overcome!`／がんばりゲージ `Effort gauge`／がんばり賞 `Effort prize`／にげる `Run`／たたかう `Fight`／会心 `Critical hit`／反撃 `counterattack`／旗を取りもどす `win back a flag`／コイン `coins`（チップは `{n}k`、Task 3）／自己ベスト `Personal best`（PR6）／引き継ぎコード `Transfer code`（PR6）／コードで復元 `Restore from code`／かざり `Decorations`（PR6）。
- **英語の文の形**: 画面の文は sentence case、ボタンは動詞から（`Draw 10`・`Fight`・`Run`）。ダンジョン・モンスター・章・塔の名前は Title Case（`Amazon Jungle`）。アポストロフィとかぎかっこは `’`・`“ ”`（まっすぐな `'`・`"` を辞書の値に入れない。Task 1 の `rpg_dict_typography`）。単数・複数が数で分かれる文は `{ one, other }`（キーに `{n}` がある文だけ）。キーに `{n}` が無いのに国の数で分かれる文（`🤝 {names}が仲間になった！`）は、英語を数に依らない言い方にする（`🤝 New allies: {names}`）。
- **ほかの人・自分が入れた文字**（ニックネーム・自分で付けた編成の名前）は訳さず、`data-ugc` の要素に入れる。既定の編成の名前（セーブの `'編成1'` など）は表示のときだけ `Team 1`（Task 3・7）。
- **ストーリーと名前の英訳の決まり**（訳す AI と確かめる AI の両方に渡す。`tools/dict_sheet.mjs` の頭にも出す）:
  1. 日本語に書いてあることだけを訳す。出来事・だれが何をしたか・数（195の旗・6つの地域）・順番を足さない・落とさない・変えない。
  2. 子ども向けのやさしい英語。2人称（旅人のきみ → `you, the Traveler`）。1文は短く、ゲームの語り（`…`・`!`）は日本語と同じ所に残す。
  3. モンスター・ダンジョンの名前は、日本語の名前の意味（動物・場所・性格）を残した英語のゲームの名前（`おしゃべりオウム` → `Chatty Parrot`）。日本語に無い性格や種類を足さない。実在の動物・地名は英語版 Wikipedia の記事名（`Bengal tiger`・`Great Red Spot`）。
  4. 冒険の語（上の2つの一覧）を必ず使う。
  5. 名前は Title Case・28字まで（390px の札・ボタンに入れるため）。ストーリーの1文は160字まで。

## Review Focus

1. **日本語の冒険の画面が1文字でも変わる**: 包み忘れ・`T('…')` のキーの写しまちがい・`cName` の入れまちがい（日本語では `c.n` と同じだが、`esc` の位置がずれる）。origin/main を別のサーバーで出し、同じセーブ・同じ乱数で冒険の全画面（はじめての画面・冒険ホーム・ガチャ・仲間・カードの詳細・編成・バトルの前と中と終わり・塔・ランキング・ストーリーの窓・データの欄・設定のスイッチ・結果のコインの欄）の `innerText` を比べる。Task 2 の `ja_rpg_unchanged`。
2. **英語で遊んでもセーブは日本語のまま**: 英語で枠を買う・名前を変えずに保存すると、セーブの編成名は `'編成2'` のまま（`Team 2` を書かない）。英語→日本語→英語と開いても `rpg` が書きかわらない（`tx` が変わったときだけ書く）。英語で取った仲間・コイン・塔の記録が日本語版にそのまま出る。Task 7 の `en_team_default_name`・`en_team_rename_keeps_default`、Task 5 の `en_rpg_save_roundtrip`。
3. **英語の長い文と名前の入り方**（英語は日本語より横に長い）: 360px のトップバーにコインのチップ（`123.4k`）が出ても1行、390px のガチャ10枚の結果とカードの国名（`Saint Vincent and the Grenadines`）、バトルの4択（`Bosnia and Herzegovina`）、冒険マップの SVG のダンジョン名、ダンジョンの札、塔の札、ランキングの行が横にはみ出さない。Task 5 の `en_topbar_chip_360`・`en_rpg_home_fit`、Task 6 の `en_cards_fit`、Task 8 の `en_battle_fit`、Task 9 の `en_rpg_rank_fit`。
4. **英語のページで壊れたセーブ**: 読めないセーブ（`{bad`）の英語版は、写し（`rpg-broken-*`）を残して英語のトースト `Couldn’t read your Adventure data, so it started over` を出し、冒険ホームの注意も英語。新しい版のデータ（`readOnly`）・保存できない（`quota`）・この端末で保存できない（`memory`）も英語。Task 5 の `en_rpg_broken_save_toast`・`en_rpg_readonly_warn`。
5. **ほかの人の名前・自分の名前・称号**: 冒険ランキングの名前（profile.js が無いときの代わりの名前もふくむ）・自動で載せたときの自分の名前・冒険ホームの旅人カードの名前は `data-ugc` に入り、日本語の名前があっても `jaLeft` が空。旅人カードの称号は英語（`BADGES.titleLabel`）で、カタログに無い称号は出さない。Task 5 の `en_rpg_title`・`en_rpg_name_ugc`、Task 9 の `en_rpg_rank_ugc`。

---

### Task 1: 冒険の語をそろえるテスト・確かめのシート・PR6/PR7 の取り残しの文

**Files:**
- Create: `tools/dict_sheet.mjs`、`tests/unit/en-rpg.test.mjs`
- Modify: `i18n/en-profile.js`（`// v=2`）、`i18n/en-html.js`、`pc.css`（コメントだけ。`?v=` 6→7）、`index.html`（`pc.css?v=7`）、`en/index.html`・`sw.js`（生成）、`tests/e2e/en_play.test.mjs`（`en_profile_no_decorations` のはじめの文）

**Interfaces:**
- Produces（`tools/dict_sheet.mjs`）:
  - `export const GLOSSARY: { ja: string, en: RegExp, not?: RegExp }[]` — Global Constraints の「冒険の語」と「PR8 で足す冒険の語」。例: `{ ja: '仲間', en: /\b(all(y|ies)|Allies)\b/i }`、`{ ja: '地図喰い', en: /Map Eater/ }`、`{ ja: '鏡の地図喰い', en: /Mirror Map Eater/ }`、`{ ja: '星喰い', en: /Star Eater/ }`、`{ ja: '英雄の塔', en: /Tower of Heroes/ }`、`{ ja: 'ダンジョン', en: /dungeon/i }`、`{ ja: '旅人', en: /Traveler/ }`、`{ ja: '手配書', en: /Wanted poster/i }`、`{ ja: 'なかよし度', en: /Friendship/ }`、`{ ja: '推奨', en: /recommended/ }`、`{ ja: 'ボス', en: /boss/i }`、`{ ja: 'バトル', en: /battle/i }`、`{ ja: 'ガチャ', en: /\bDraw|\bdraw/ }`、`{ ja: '国旗クエスト', en: /Flag Quest/ }`、`{ ja: '冒険', en: /Adventure/ }`、`{ ja: 'コイン', en: /coin/i }`。
  - `export const GLOSSARY_NO: RegExp[]` — どの辞書の値にも出ない語: `/companion/i`、`/\bgacha\b/i`、`/Map-?eater|Mapeater/`（`Map Eater` 以外のつづり）、`/\bpartner/i`。
  - `export const GLOSSARY_OK: Record<string, string>` — キー → 理由。言い方の都合で語を使わない値だけ。はじめは PR7 のバッジの名前2つ: `'アフリカ大冒険'`（`African Expedition`。名前の言葉遊び）・`'覚えて仲間に'`（`Learn and Recruit`。名前の言葉遊び）。足すときは確かめた AI の名前と理由。
  - `export function dictSheet(name: string, mode: 'translate' | 'faith' | 'en', { grep?: RegExp } = {}) -> string` — Markdown。頭に「ストーリーと名前の英訳の決まり」1〜5と2つの語の一覧、続けて表。`translate` は `# | 日本語 | いまの英語`、`faith` は `# | 日本語 | English`、`en` は `# | English`（日本語を出さない）。`name` は `i18n/<name>.js`（辞書のファイル）。`grep` はキーをしぼる。
  - CLI: `node tools/dict_sheet.mjs <en-rpg|en-rpg-cards|…> [translate|faith|en] [--grep <正規表現>]`（標準出力）。

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/en-rpg.test.mjs`。i18n/en-*.js を全部 vm で読む。PR8 の辞書がまだ無くても動く）
  - `rpg_glossary`: どの辞書でも、キーが `GLOSSARY` の `ja` をふくむ値（`{ one, other }` は両方）が `en` に合う（`GLOSSARY_OK` のキーは除く）。長い `ja` を先に見る（`鏡の地図喰い` のキーは `地図喰い` の行でも見る。どちらも合う）。いまは `i18n/en-profile.js` の `'プロフィールを作ると、タイムアタック・今日の難問・冒険のランキングにこの名前で載るよ。'`・`i18n/en-html.js` の head の説明2つと音の文が落ちる。
  - `rpg_glossary_no`: どの値にも `GLOSSARY_NO` が無い。いまは en-profile.js:40 の `companions` で落ちる。
  - `rpg_dict_typography`: `en-rpg*.js` の値（`{ one, other }` は両方）に `'`・`"`・`...`（3つの点。`…` を使う）・前後の空白・2つ続く空白が無い。いまは辞書が無いので空で通る。
  - `rpg_names_title_case`（辞書に英語があるものだけ見る。Task 1 では0件、Task 3 から中身が入る）: `RPG_CORE` のダンジョン・モンスター・章・塔の名前の英語が Title Case（語の頭が大文字。`of`・`the`・`and`・`in`・`on` は小文字でよい）で28字まで、英語どうしで重ならない。
  - `dict_sheet_modes`: `dictSheet('en-badges', 'faith')` に `旅人のレベルが Lv {g}` と `Reach Traveler level {g}` がある。`'en'` は `JA_RE` が無い（決まりの文も英語で書く）。`{ grep: /旅人/ }` で旅人をふくむ行だけ。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/en-rpg.test.mjs`
- [ ] **Step 3: 実装**
  - `tools/dict_sheet.mjs`（頭のコメントに使い方）。
  - `i18n/en-profile.js`（`// v=2`）: `'冒険の仲間の国旗を3つまで、名前の横にかざれるよ'` → `'Show up to 3 flags of your Adventure allies next to your nickname.'`、`'プロフィールを作ると、…'` → `'With a profile, your name appears on the Time Attack, Daily Puzzle, and Adventure leaderboards.'`。
  - `i18n/en-html.js`: head の説明を日本語と同じ中身に戻す（160字まで）: `'A free 4-choice quiz to learn the flags, names, and locations of all 195 countries. Filter by region, take on Time Attack and the leaderboard, browse the Gallery, or play the Adventure RPG. No sign-up needed.'` の形、短いほうは `'Learn the flags, names, and locations of all 195 countries with a 4-choice quiz. Plus Time Attack, a flag gallery, and an Adventure RPG.'`。音の文は `'Sounds play for right and wrong answers, finishing a quiz, Adventure battles, draws, and level-ups, earning badges, and more.'`。
  - `pc.css:294` のコメントを今の形に: 「豆知識が無いとき（英語版）」→「豆知識が無い国のとき」（英語版も PR7 から豆知識が出る）。`index.html` の `pc.css?v=7`。
  - `tests/e2e/en_play.test.mjs` の `en_profile_no_decorations`: はじめの文の期待を新しい英語に、`doesNotMatch(/Adventure/)` を消す（かざりの欄は Task 5 で出す）。
  - 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_play`・`en`・`pc_layout`・`cache_bust`（`cd tests/e2e && node --test --test-concurrency=1 en_play.test.mjs en.test.mjs pc_layout.test.mjs cache_bust.test.mjs`）。
- [ ] **Step 5: コミット** — `英語版: 冒険の語をそろえるテストと確かめのシート（仲間は allies、説明と音の文に冒険を戻す）`

### Task 2: 日本語の冒険の画面の文の見張り（ja_rpg_unchanged）

**Files:**
- Create: `tests/e2e/en_rpg.test.mjs`（このタスクでは日本語の見張りだけ。英語のテストは Task 5 から足す）

**Interfaces:**
- Produces: `async function rpgTexts(browser, url) -> Record<string, string[]>` — 同じファイルの中の部品。`openRpg`（`blockScripts: []`、`seed: 1`、`reducedMotion: 'reduce'`、固定のセーブ `JA_SAVE`）で開き、下の画面ごとに `document.body.innerText` を行に切って空行を除いたもの（`.langsw` は外す）。
- `JA_SAVE`: `saveWith({ lv: 12, coins: 4321, cards: { jp: [2, 1], fr: [1, 0], br: [3, 2], kn: [1, 0] }, fr: { de: 3 }, clear: { samerica: 5, oceania: 2 }, teams: [{ n: '編成1', c: ['jp', 'fr'] }, { n: 'あか', c: null }], tower: { best: 7 }, story: [] })`（`clear` などの形は今の `sanitize` に合わせる）。
- 画面: `intro`（`intro: false` のセーブ）・`home`・`story`（`clear.world = 5` で ch1 の窓）・`gacha`・`gacha-result`（ガチャの画面で10回を押して演出を飛ばした結果。乱数は seed）・`cards`・`card-detail`（`jp`）・`team`・`battle-meet`・`battle-quiz`・`battle-end`（`winBattle`）・`tower`（`startTower` → 1階クリア）・`rank`（偽 DB に `チコ` の行）・`data`（データの欄を開く）・`settings`（冒険のスイッチ）・`result`（練習5問の結果のコインの欄）。

- [ ] **Step 1: テストを書く** — `ja_rpg_unchanged`: origin/main を `git archive` で一時フォルダに出して `startServer({ root })` で配り（`en_walk.test.mjs` の `ja_unchanged` と同じやり方）、`rpgTexts(今)` と `rpgTexts(origin/main)` が画面ごとに `deepEqual`。飛ばす条件: origin/main が手元に無い、または origin/main に `i18n/en-rpg.js` がある（PR8 が入ったあとは比べる相手がない）。トーストの文（`toastTexts`）も画面ごとに比べる。
- [ ] **Step 2: 通るのを見る**（まだ何も変えていないので通る。これからのタスクの見張り）— `cd tests/e2e && node --test --test-concurrency=1 en_rpg.test.mjs`
- [ ] **Step 3: コミット** — `冒険の日本語の画面の文が変わらないことの見張り（origin/main と比べる）`

### Task 3: rpg-core のデータを i18n-data に・名前の英訳（en-rpg.js）

**Files:**
- Modify: `rpg-core.js`（`?v=` 15→16）、`tools/make_en.mjs`（`EN_DICTS` に4つの辞書。まだ無いファイルは入らない）、`tests/unit/i18n.test.mjs`（`rpg-core.js` を `NOT_YET` から `COVER` の `'all'` へ）、`tests/unit/rpg-core.test.mjs`、`tests/unit/en-rpg.test.mjs`、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）
- Create: `i18n/en-rpg.js`（このタスクでは rpg-core のデータの分）

**Interfaces:**
- rpg-core.js は `T` を呼ばない。日本語は全部 `// i18n-data:start`〜`// i18n-data:end` の中: `DUNGEONS` の `name`・`land`（`r` は地域のキー。辞書は en-core のもの）、`CHAPTERS` の `name`、`MONSTERS`・`MIRROR_BOSS`・宇宙の名前、`THEMES` の `n`、`SUB` のキー、`TOWER`、`TOWER_MONSTERS.boss`、`TUNING.share.tag`、既定の編成名の頭 `'編成'`、`shortCoins` の単位 `'万'`。
- 鏡の手下 F1〜F4: `{ e, n, nk, nb }`。`n` は今と同じ日本語（`'鏡のおしゃべりオウム'`。セーブ・テスト・管理には `n` を使う）、`nk` は `'鏡の{name}'` か `'さかさ{name}'`、`nb` は元の名前（`'おしゃべりオウム'`）。`n === fillJa(nk, { name: nb })`。
- Produces: `RPG_CORE.fillJa(s: string, v: object) -> string`（`{name}` を置きかえるだけ。badges.js の `fillJa` と同じ動き）。
- Produces: `RPG_CORE.shortCoins(n: number, en = false) -> string` — 日本語は今と同じ（`9,999`・`1万`・`1.2万`・`12.3万`）。英語は1万未満が `n.toLocaleString('en-US')`、1万から `Math.floor(n / 100) / 10 + 'k'`（`10000` → `10k`、`12345` → `12.3k`、`123456` → `123.4k`）。
- Produces: `RPG_CORE.isDefaultTeamName(n: string, i: number) -> boolean` — `n === '編成' + (i + 1)`。
- 辞書 `i18n/en-rpg.js`（`// v=1`。頭のコメントに「冒険の語」と「足した語」を書く）: ダンジョンの `name`（21）・`land`（地域のキーと同じものは en-core にあるので書かない）・章3・モンスター78・`'鏡の{name}'`（`'Mirror {name}'`）・`'さかさ{name}'`（`'Upside-Down {name}'`）・テーマ6（`島国` `Island countries`／`小さい国` `Small countries`／`赤道の国` `Equator countries`／`内陸国` `Landlocked countries`／`大きい国` `Large countries`／`南半球の国` `Southern Hemisphere countries`）・`英雄の塔`・`塔の番人`・`編成`（`Team`）・`万`（`ten thousand`。データの単位。英語の画面は `shortCoins(n, true)` の `k` を使う）。

- [ ] **Step 1: 失敗するテストを書く**
  - unit `core_names_same`（rpg-core.test）: 全部のダンジョンの `name`・`land`、章の `name`、全部の `MONSTERS` の `n`、`THEMES` の `n`、`TOWER`、`TOWER_MONSTERS.boss.n` の一覧が今のもの（テストに今の一覧を書く。鏡の手下は `'鏡のおしゃべりオウム'`・`'さかさヤドクガエル'` など28）と同じ並び。鏡の手下は `n === K.fillJa(nk, { name: nb })`。
  - unit `short_coins_en`: 上の英語の例と、日本語が今のまま（今のテストの数）。
  - unit `default_team_name`: `isDefaultTeamName('編成2', 1) === true`、`('編成2', 0)`・`('Team 2', 1)`・`('あか', 0)` は false。
  - unit（i18n.test の今のテストが rpg-core.js をふくめて通る）: `no_ja_outside_T`・`dict_has_all_keys`（データの文字も）・`dict_values_english`・`dict_placeholders_match`・`dict_no_unused`・`dict_no_conflict`。
  - unit `rpg_names_title_case`（Task 1）に中身が入る。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/rpg-core.test.mjs tests/unit/i18n.test.mjs tests/unit/en-rpg.test.mjs`
- [ ] **Step 3: 実装**（コアだけ。表示の `T()` は Task 5〜9）
- [ ] **Step 4: 名前を訳して確かめる**（PR7 の豆知識と同じ流れ。記録は `.superpowers/sdd/2026-10-31-next5-pr8-en-adventure/names.md`。`.superpowers/` は `.git/info/exclude` にあるのでコミットしない）
  1. 訳す AI に `node tools/dict_sheet.mjs en-rpg translate` と「ストーリーと名前の英訳の決まり」を渡して値を書かせる。
  2. 確かめ1（中身のずれ）: 新しい AI に `faith` を渡し、1件ずつ「OK」か「直す（足した／落とした／取りちがえ・理由）」。見る点: 日本語の名前の動物・場所・性格が残っているか、足していないか（`ねぼすけパンダ` が `Sleepyhead Panda` で、`Lazy Giant Panda` にしない）。
  3. 確かめ2（英語の自然さ）: 別の新しい AI に `en`（英語だけ）を渡し、ゲームの名前として自然か・短いか・Title Case・つづり（アメリカ式・Wikipedia の固有名詞）を見させる。意味を変える直しは入れない。
  4. 直した行の見直し: 3で変えた行だけを `faith` でもう一度。全部 OK になるまで2〜4をくり返す。
- [ ] **Step 5: 通るのを見る** — unit 全部、e2e `rpg`・`rpg_home`・`rpg_battle`・`rpg_tower`・`en_rpg`（`ja_rpg_unchanged`）・`cache_bust`。
- [ ] **Step 6: コミット** — `冒険: ダンジョン・モンスターの名前をデータに（日本語は同じ）と英訳（i18n/en-rpg.js）`

### Task 4: ストーリーの英訳（ストーリーを rpg-core のデータへ）

**Files:**
- Modify: `rpg-core.js`（`STORY`・`STORY_END` を rpg.js から移す。`?v=` は Task 3 で上げた 16 のまま）、`rpg.js`（`K.STORY`・`K.STORY_END` を読む。`?v=` 16→17）、`i18n/en-rpg.js`、`tests/unit/rpg-core.test.mjs`、`tests/unit/en-rpg.test.mjs`、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）

**Interfaces:**
- Produces: `RPG_CORE.STORY: string[]`（3文）と `RPG_CORE.STORY_END: Record<'ch1'|'ch2'|'ch3start'|'ch3', { h: string, p: string[] }[]>`。形と日本語は今の rpg.js のものと1文字も同じ。`STORY_IDS` のとなりの `// i18n-data` の中に置く（rpg-core は Task 3 から `COVER` なので、ストーリーの文は辞書に必須になり、`dict_no_unused` も通る。rpg.js は Task 5 まで `NOT_YET`）。
- rpg.js は `const STORY = K.STORY, STORY_END = K.STORY_END` にして、表示（`introHTML` と章の終わりの窓）で `T(s)`・`T(x.h)` を通す。

- [ ] **Step 1: 失敗するテストを書く**
  - unit `story_same`（rpg-core.test）: `K.STORY` と `K.STORY_END` が今の rpg.js の文（テストに今の23文を書く）と同じ並び。`Object.keys(K.STORY_END)` が `K.STORY_IDS` と同じ。
  - unit `story_en_complete`（en-rpg.test）: 23文が全部 `en-rpg.js` にあり、値が `JA_RE` なし・160字まで・`'`・`"` なし。本文は `.`・`!`・`…`・`—` のどれかで終わる。見出し4つは日本語と同じ絵文字（`🌍`・`🪞`・`🪐`・`🌟`）で始まる。
  - unit `story_en_numbers`: 日本語に `195`・`6つ`・`第2章`・`第3章` があれば英語に `195`・`six`（か `6`）・`Chapter 2`・`Chapter 3`。
  - unit `rpg_glossary`（Task 1）がストーリーの行もふくめて通る（地図喰い・鏡の地図喰い・星喰い・英雄の塔・旅人）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 移す**（rpg-core へ。rpg.js の表示で `T()`）→ 作る順番どおりに作り直し。
- [ ] **Step 4: 訳して確かめる**（Task 3 の Step 4 と同じ4段。`dict_sheet.mjs en-rpg <mode> --grep` でストーリーの行だけ。記録は `story.md`）。確かめ1で見る点: 出来事の順番・だれがさけんだか（鏡の地図喰いが「母さま」＝星喰いに）・「〜だけ」「まだだれも」の強さ・「地球の国のなかまたち」を冒険の仲間（`allies`）と取りちがえていないか（ここは `ally` の語の例外になるなら `GLOSSARY_OK` に理由つきで入れる）。
- [ ] **Step 5: 通るのを見る** — unit 全部、e2e `rpg_home`・`rpg_polish`・`en_rpg`（`ja_rpg_unchanged`）・`cache_bust`。
- [ ] **Step 6: コミット** — `英語版: 冒険のストーリーの英訳（文は rpg-core のデータへ。日本語は同じ）`

### Task 5: 冒険ホーム・入口・コインの表示を英語に（`I18N.hide` から `'rpg'` を外す）

**Files:**
- Modify: `rpg.js`（画面の文を全部 `T()`。`HEADLESS` を消す）、`i18n.js`（`?v=` 3→4。英語の `hide` を空に）、`profile.js`（`?v=` 9→10。`canDeco` の `!I18N.hide.has('rpg')` と、英語でかざりの欄を出さない分岐を消す）、`i18n/en-rpg.js`、`index.html`・`embed.html`（`?v=`）、`en/index.html`・`en/embed.html`・`sw.js`（生成）、`tests/unit/i18n.test.mjs`（`rpg.js` を `COVER` へ、`hide_rpg` → `hide_empty`）、`tests/e2e/en_play.test.mjs`（PR7 の画面なしのテストを書きかえ）、`tests/e2e/en.test.mjs`（`en_home`・`en_topbar_one_line_360`）、`tests/e2e/en_rpg.test.mjs`
- Modify（長さで必要なら）: `rpg.css`（`?v=` 23→24）

**Interfaces:**
- `I18N.hide` は両方の言語で `new Set()`（しくみは残す。これから未訳の機能を足すときに使う）。
- rpg.js の `HEADLESS` と、それで分けていた所を全部消す（英語でも日本語と同じ: `#pcoin`・はじめてのコインのトースト・結果のコインの欄・バッジのごほうびのトースト・保存の注意のトースト・`persist`・入口・チップ・設定のスイッチ・`#rpg` の直リンク・`RPG.open`）。`notice` は `toast(T(s))`。
- Produces（`window.RPG` に足す。ほかの rpg-*.js が使う）:
  - `RPG.names(as: string[]) -> string` — `as.map(a => esc(cName(byA.get(a)) ?? a)).join(T('・'))`（日本語は今と同じ `・`、英語は ` · `）。rpg-battle.js の `names` もこれを使う。
  - `RPG.monName(m: { n: string, nk?: string, nb?: string }) -> string` — `m.nk ? T(m.nk, { name: T(m.nb) }) : T(m.n)`（エスケープしない）。
  - `RPG.teamLabel(n: string, i: number) -> { text: string, ugc: boolean }` — 既定の名前（`K.isDefaultTeamName`）なら `{ text: T('編成{n}', { n: i + 1 }), ugc: false }`、ほかは `{ text: n, ugc: true }`。
  - `RPG.teamSaveName(v: string, i: number) -> string` — `v.trim() === T('編成{n}', { n: i + 1 })` なら `'編成' + (i + 1)`、ほかは `v`。辞書 en-rpg に `'編成{n}': 'Team {n}'` を足す（rpg-team.js・rpg-battle.js もこれを使う）。
  - `RPG.shortCoins(n) = K.shortCoins(n, LANG === 'en')`（rpg.js の `coinHTML` とチップもこれ）。
  - `RPG.gainLines(rc) -> string[]`（仲間になった・シルバー・克服・手配書の行。rpg.js の結果のコインの欄と rpg-battle.js の2か所が同じものを使う。日本語は今と同じ文）。
- 自分の称号（rpg.js:397 の `badge:title` と :846 の旅人カード）: `const tl = window.BADGES?.titleLabel?.(titleOf()) ?? titleOf()`、空でなければ `T('〈{title}〉', { title: esc(tl) })`（日本語は今と同じ `〈…〉`、英語は `“…”`、カタログに無い称号は英語版では出さない）。
- 旅人カードの名前（rpg.js:840）: `<b id="rpg-name" data-ugc>` に自分のニックネーム。無ければ `T('旅人')`（`Traveler`。このときは `data-ugc` を付けない）。
- 国名は `cName`、首都は `cCap`、かざりのえらびの並び（rpg.js:760）は `star(y) - star(x) || I18N.byName(byA.get(x), byA.get(y))`。
- 確かめの表（`EARN`）・データの欄（引き継ぎコード・コードで復元・冒険データを消す）・`confirm` の文・開発用パネル（`?rpgdebug=1`）も `T()`。
- profile.js: かざりの欄は日本語と同じく英語でも出す（`canDeco()` のときだけ［Choose decorations in Adventure］）。

- [ ] **Step 1: 失敗するテストを書く**（e2e は `en_rpg.test.mjs`。英語は `openRpg(browser, { path: 'en/', locale: 'en-US', seed: 1 })`）
  - `en_rpg_intro`: 英語の `#rpg` → はじめての画面が `Flag Quest`・ストーリー3文（`en-rpg.js` の値）・`Choose your Traveler’s look` の形・［Set off］の形。`jaLeft` が空。［Set off］で冒険ホーム。
  - `en_rpg_home`: `JA_SAVE` で冒険ホーム → `jaLeft` が空、ダンジョンの札が英語の名前・`recommended Lv` の目安が `Easy`・`Just right`・`Tough` のどれか・`Today’s Wanted posters`・`How to earn coins` の表・塔の札 `Tower of Heroes`・`Personal best: floor 7` の形。章のタブが `Earth`・`Mirror Earth`・`Space`。冒険マップの SVG のダンジョン名（`text.rpg-am-name`）が英語。
  - `en_rpg_story`: `clear.world = 5` のセーブ → 章の終わりの窓が英語（`🌍 Earth cleared!` の形・本文3文・［Continue the Adventure］）、閉じるとセーブの `story` に `ch1`。
  - `en_rpg_title`: 英語で称号をつけたあと旅人カードの称号が英語の `“…”`。カタログに無い称号（`badges` の `eq` を作り物にして `BADGES.title()` を差しかえ）は出ない。`badge:title` でその場で英語に描き直す。
  - `en_rpg_name_ugc`: プロフィール `チコ` で旅人カードの名前が `[data-ugc]` の中、`jaLeft` が空。プロフィールが無ければ `Traveler`。
  - `en_rpg_coins_ui`（PR7 の `en_coins_headless` を書きかえ）: 英語で練習5問 → `#pcoin` が出て `+…` の形、はじめてのコインのトーストが英語（`You earned coins! Use them in the Adventure to level up and draw flags` の形）、結果の `#r-ext` にコインの欄が英語（`+… coins`・`Now …`・［To the Adventure →］）。`jaLeft`・トーストに日本語なし。
  - `en_topbar_chip_360`（`en.test.mjs` の `en_topbar_one_line_360` を書きかえ）: コイン 123456 のセーブで 360px のトップバーにチップ `123.4k` が見え、1行・はみ出さない・高さ `TOPBAR_390` まで。チップの `aria-label` が `Coins 123,456 (go to Adventure)` の形。
  - `en_rpg_settings`: 設定に `Adventure` の欄と `Show the Adventure (coins and RPG)` のスイッチ。オフにするとチップと入口が消える（日本語と同じ動き）。
  - `en_rpg_hash`（PR7 の `en_rpg_hash_home` を書きかえ）: `en/#rpg` で冒険ホームが開く。
  - `en_rpg_broken_save_toast`（PR7 の `en_rpg_broken_save_quiet` を書きかえ）: 英語版に `{bad` → `rpg-broken-*` の写しができ、英語のトースト（`Couldn’t read your Adventure data, so it started over` の形）が1回出る。
  - `en_rpg_readonly_warn`: 新しい版のセーブ（`{ v: 99 }`）で、トーストと冒険ホームの注意が英語（`Found data from a newer version. Please reload the page` の形）、レベルアップが押せない（日本語と同じ動き）。
  - `en_rpg_data_transfer`: データの欄（`Data (transfer code)`）を開き、コードをコピー → 別のセーブに入れる → `confirm` の文が英語（`Overwrite your current data? (Lv 12 · 4 allies → …)` の形）→ `Restored from the transfer code` の形のトースト。`dialog` の文に日本語なし。
  - `en_rpg_save_roundtrip`: 英語で練習してコインを稼ぎ、レベルアップ → 日本語版で同じ Lv・コイン。日本語版→英語版→日本語版と開いて、何もしなければ localStorage `rpg` の文字が1文字も変わらない。
  - `en_profile_decorations`（PR7 の `en_profile_no_decorations`・`en_deco_hidden_with_rpg` を書きかえ）: 冒険をはじめたセーブで英語のプロフィール画面に `Decorations` の欄と［Choose decorations in Adventure］→ かざりのえらびの窓が英語（`Choose decorations`・`Up to 3 flags of your allies…`）。冒険をはじめていなければ欄の文だけ（日本語版と同じ）。
  - `en_persist_like_ja`（PR7 の `en_no_persist_headless` を書きかえ）: 英語でもコインを書けたら `navigator.storage.persist` を1回頼む（日本語と同じ）。
  - `en_rpg_home_fit`: 390px と 1280×800 で冒険ホーム（いちばん長い英語のダンジョン名の札・冒険マップ・旅人カード・いちばん長い英語の称号）が横にはみ出さない。
  - `en.test.mjs` の `en_home`: `#home-rpg` が見える（`Adventure`）。
  - unit `hide_empty`: 英語も日本語も `I18N.hide.size === 0`。
  - unit（i18n.test）が rpg.js をふくめて通る。
  - 日本語の rpg の e2e（`rpg*.test.mjs`）と `ja_rpg_unchanged` はそのまま通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（rpg.js は約125か所）→ 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_rpg`・`en_play`・`en`・`en_badges`・`rpg`・`rpg_home`・`rpg_polish`・`rpg_layout`・`profile`・`lang`・`cache_bust`。
- [ ] **Step 5: コミット** — `英語版: 冒険ホーム・入口・コインの表示（I18N.hide から rpg を外す）`

（コントローラーが別の新しい AI に、`dict_sheet.mjs en-rpg faith --grep` で rpg.js の分を見させる: 英語として自然か・数（コイン・Lv・回数）と条件がずれていないか・冒険の語のとおりか。もう1つ別の AI に `en` で英語だけを見させる。直しは辞書だけ。記録は `dict-en-rpg.md`。）

### Task 6: 仲間・カード・国旗ガチャを英語に（rpg-cards.js）

**Files:**
- Modify: `rpg-cards.js`（`?v=` 7→8）、`tools/make_en.mjs`（`EN_SKIP` から `rpg-cards.js`）、`tests/unit/i18n.test.mjs`（`COVER` へ）、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）、`tests/e2e/en_rpg.test.mjs`
- Create: `i18n/en-rpg-cards.js`（`// v=1`）
- Modify（長さで必要なら）: `rpg.css`

**Interfaces:**
- 国名は `cName`、地域のチップは `T(r)`（`'all'` は `T('すべて')`・`T('全世界')` の今の使い分けのまま）、仲間の一覧の名前順は `I18N.byName`。
- カードの国名の折り方 `foldName(n)`: 日本語は今のまま。英語は `{ html: esc(n), n: Math.ceil([...n].length * 0.6), l: Math.ceil(longestWord * 0.6) }`（英語は空白で折れる。`--n`・`--l` は日本語の字数の目安なので、英字の幅に合わせて 0.6 倍。`en_cards_fit` が通る値に合わせてよい）。
- シェア: 文は `T('国旗クエストで仲間が{n}か国になった！ {tag}', { n, tag: T(U.share.tag) })` の形、URL は `window.SHARECARD?.url?.() ?? U.share.url`（英語は `…/country-drill/en/`）。
- ガチャの確率の文は数を `{p}` で渡す（`★3 Gold {p3}% / ★2 Silver {p2}%`）。`{n}回` は `{ one, other }`。
- `STAR_NAME` は表示で `T()`（`Bronze`・`Silver`・`Gold`）。

- [ ] **Step 1: テスト**
  - e2e `en_gacha`: 英語のガチャの画面 → `jaLeft` が空、見出し `Flag Draw`、`Draw 1`・`Draw 10` に値段、`Odds` の欄（`★3 Gold 3% / ★2 Silver 17%` の形）、`Free draw` の札。10回引く → 結果のカード10枚の国名が英語、［Skip］、`Not met yet …`／`… countries complete!` の形。トーストに日本語なし。
  - e2e `en_gacha_errors`: コインが足りないとき・今日の無料1回がないとき・保存できないときの文が英語。
  - e2e `en_cards`: 仲間の一覧 → 地域のチップが英語、並びが英語の ABC 順（`I18N.byName`）、カードの詳細の窓が英語（`Stack`・`Friendship ♥…`・`Attack`・`Region bonus` の形）、まだ仲間でない国は `{n} more right answers to make it an ally` の形。仲間の世界地図の `aria-label` が英語。
  - e2e `en_cards_share`: 50か国目の仲間で［Share］→ 文が `Flag Quest` をふくみ `#FlagMaster` で終わり、URL が `/country-drill/en/`。
  - e2e `en_cards_fit`: 390px で、いちばん長い英語の国名（`Saint Vincent and the Grenadines`・`Central African Republic`・`Bosnia and Herzegovina`）のカードがガチャの10枚の結果・1枚の演出・仲間の一覧で枠からはみ出さない（カードの名前の要素の `scrollWidth <= clientWidth`）、画面が横にスクロールしない。
  - unit（i18n.test）が rpg-cards.js をふくめて通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_rpg`・`rpg_gacha`・`rpg`・`rpg_layout`・`en_rpg`（`ja_rpg_unchanged`）。
- [ ] **Step 5: コミット** — `英語版: 仲間のカードと国旗ガチャ（i18n/en-rpg-cards.js）`

（Task 5 と同じく、別の AI 2つで `en-rpg-cards` の faith と en を見る。記録は `dict-en-rpg-cards.md`。）

### Task 7: 編成を英語に（rpg-team.js）

**Files:**
- Modify: `rpg-team.js`（`?v=` 5→6）、`tools/make_en.mjs`（`EN_SKIP` から `rpg-team.js`）、`i18n/en-rpg-cards.js`、`tests/unit/i18n.test.mjs`、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）、`tests/e2e/en_rpg.test.mjs`

**Interfaces:**
- 編成のタブ・名前の欄・バトルの編成名は `RPG.teamLabel`（Task 5）。`ugc` のときは `<span data-ugc>` に入れる。名前の入力欄の値も `teamLabel(...).text`、保存は `RPG.teamSaveName(v, i)`。
- 枠を買う `confirm` は `T('●{cost} で編成の枠を1つ増やす？', { cost })`（英語 `Spend ●{cost} to add a team slot?`）。

- [ ] **Step 1: テスト**
  - e2e `en_team`: 英語の編成の画面 → `jaLeft` が空、タブが `Team 1`、［Auto］、`Team bonus` の文、地域のチップ、`✓ In team` の形。
  - e2e `en_team_default_name`: 英語で枠を買う → タブが `Team 2`、セーブの `teams[1].n` が `'編成2'`。日本語版を開くと `編成2`。
  - e2e `en_team_rename_keeps_default`: 英語で名前の欄を開いて何も変えずに保存 → セーブは `'編成1'` のまま。`Red` に変えると `'Red'` で保存され、日本語版でも `Red`。
  - e2e `en_team_custom_name_ugc`: セーブの編成名が `あか` → 英語の編成のタブとバトルの編成名で `[data-ugc]` の中、`jaLeft` が空。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_rpg`・`rpg_team`・`rpg_battle`。
- [ ] **Step 5: コミット** — `英語版: 編成（既定の名前は表示だけ Team 1、セーブは日本語のまま）`

### Task 8: バトル・英雄の塔を英語に（rpg-battle.js）

**Files:**
- Modify: `rpg-battle.js`（`?v=` 18→19）、`tools/make_en.mjs`（`EN_SKIP` から `rpg-battle.js`）、`tests/unit/i18n.test.mjs`、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）、`tests/e2e/en_rpg.test.mjs`
- Create: `i18n/en-rpg-battle.js`（`// v=1`）
- Modify（長さで必要なら）: `rpg.css`

**Interfaces:**
- 国名は `cName`・首都は `cCap`（問題・4択・答えの欄・まちがえた国の一覧・地図の `aria-label`）。モンスターの名前は `RPG.monName`、仲間の行は `RPG.gainLines`（rpg-battle.js の2か所の写しを消す）、国の一覧は `RPG.names`。
- 問いの文は今の辞書のキー（`この国旗はどこの国？`・`この国の国旗は？`・`色がついている場所の国旗は？`）。
- ダメージの文は `T('{who}に{dmg}ダメージ', …)` のように、文の形ごとにキーを分ける（会心・援護・旗を取りもどした、を英語の語順で組めるように: `head`・`tail` を文字で足さず、`T('{crit}{name}に{dmg}ダメージ{assist}', …)` の形）。
- シェアの文: 第3章のボスは日本語の今の作り方（`n.startsWith(dg.land)`）のまま、英語は `T('国旗クエストで{boss}をたおした！ {mates}', { boss: RPG.monName(boss) })`（星の名前は英語の名前にまかせる）。URL は `window.SHARECARD?.url?.()`、タグは `T(U.share.tag)`。
- 塔: `{n}階` は en-badges の `{ one: '{n} floor', other: '{n} floors' }`、`{n}階クリア！` は `Floor {n} cleared!`。

- [ ] **Step 1: テスト**
  - e2e `en_battle_win`（spec の「冒険のバトルを1回最後まで」）: 英語で `samerica` F1 のバトル → 会う画面（`… appeared!`・`Fight`・`Run`・必要な正解の数の文）→ 正解と不正解を1回ずつ → 勝つ。どの段でも `jaLeft` が空・ページエラーなし・`[i18n]` の warn なし。勝ちの欄が英語（`Victory! +…`・［Next floor］）。まちがえた国の一覧が英語の国名と首都。
  - e2e `en_battle_lose`: 負けの欄（`Defeated…! But you’ve learned the countries you missed` の形・`Effort prize`・`Effort gauge`・［Practice this region］）。［Practice this region］で `/en/` のモード選択へ。
  - e2e `en_battle_flee`: ［Run］の `confirm` が英語。
  - e2e `en_battle_reveal`: 宇宙のダンジョン（テーマ）で不正解 → 答えの欄に `… is one of the Island countries` の形と `You chose “…”`。
  - e2e `en_boss_share`: 地図喰いを倒した結果の［Share］→ `Flag Quest`・`the Map Eater`・`#FlagMaster`・`/country-drill/en/`。第3章のボス（`moon`）でも英語の名前。
  - e2e `en_tower`: 英語で塔の1階 → 会う画面の `Tower of Heroes · Floor 1` の形・クリア（`Floor 1 cleared!`・`First win on this floor +…`）→ ［Quit］→ 終わりの欄（`Tower of Heroes: up to floor 1`・`(Personal best: floor 1)`）。10階の中ボスの表示が `mini-boss`。
  - e2e `en_battle_fit`: 390px で4択にいちばん長い英語の国名が入ったバトル・HP の欄・塔の見出しが横にはみ出さない。
  - unit（i18n.test）が rpg-battle.js をふくめて通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_rpg`・`rpg_battle`・`rpg_tower`・`rpg_amap`・`rpg`・`en_badges`（冒険のバッジが英語で取れる）。
- [ ] **Step 5: コミット** — `英語版: バトルと英雄の塔（i18n/en-rpg-battle.js）`

（別の AI 2つで `en-rpg-battle` の faith と en を見る。記録は `dict-en-rpg-battle.md`。）

### Task 9: 冒険ランキングを英語に（rpg-rank.js）

**Files:**
- Modify: `rpg-rank.js`（`?v=` 9→10）、`tools/make_en.mjs`（`EN_SKIP` を `[]` に。export は残す）、`tests/unit/i18n.test.mjs`（`NOT_YET` が空）、`tests/unit/make-en.test.mjs`（`en_scripts_all`）、`index.html`（`?v=`）、`en/index.html`・`sw.js`（生成）、`tests/e2e/en_rpg.test.mjs`
- Create: `i18n/en-rpg-rank.js`（`// v=1`）

**Interfaces:**
- rpg-rank.js:92 の日付 `jstDay`: 英語は `I18N.dayLabel('YYYY-MM-DD')`（日本時間の日付。`Oct 30`）、日本語は今の `10/30`。
- rpg-rank.js:93 の `recText`: `T('ダンジョン {d}/{all}（フロア {f}/{fall}）', …)`（英語 `Dungeons {d}/{all} (floors {f}/{fall})`）。
- rpg-rank.js:98-99 の代わりの名前（profile.js が無いとき）: かざりの `alt`・`title` は `cName`、名前は `<span data-ugc>${esc(r.nickname)}</span>`。
- 自動で載っているときの自分の名前 `#rr-auto-name` に `data-ugc`。並べ方のタブ・`HOW` の文・`相当` の文・空・準備中・つながらないとき・載せる箱のラベルは `T()`。

- [ ] **Step 1: テスト**
  - e2e `en_rpg_rank`: 偽 DB に `チコ`（かざり `jp`）と `Chiko` の行 → 英語の冒険ランキング → タブ `Level`・`Dungeons`・`Tower of Heroes`、`Top 50. Level → dungeons cleared → floors` の形、行の記録が `🏰…・F…` と `🗼… floors` の形。`jaLeft` が空。
  - e2e `en_rpg_rank_ugc`: profile.js を止めた（`blockScripts: ['profile.js']`）英語版でも、`チコ` の名前が `[data-ugc]` の中で、かざりの `alt` が `Japan`。自動で載っているときの自分の名前も `[data-ugc]`。
  - e2e `en_rpg_rank_post`: プロフィールが無い・自動で載る・箱で載せる（`Post to the Adventure leaderboard`）・つながらない（`Couldn’t connect to the leaderboard` と［Reload］）・塔の準備中 の文が英語。
  - e2e `en_rpg_rank_fit`: 390px で長い名前と長い記録の行がはみ出さない。
  - unit `en_scripts_all`（make-en）: `EN_SKIP` が `[]`、en/index.html の script は日本語の index.html と同じ並び（`EN_SWAP` の分を読みかえ、辞書を足したもの）。
  - unit（i18n.test）: `NOT_YET` が空で `every_root_js_listed` が通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_rpg`・`rpg_rank`・`ranking`・`profile`。
- [ ] **Step 5: コミット** — `英語版: 冒険ランキング（i18n/en-rpg-rank.js。名前は data-ugc）`

### Task 10: 英語の遊び方に冒険を足す（en/howto.html）

**Files:**
- Modify: `en/howto.html`、`tests/unit/pages.test.mjs`（`en_howto_only_available` → `en_howto_all`）

**Interfaces:**
- 足す節: `<h2 id="rpg">Adventure</h2>`（日本語の howto の「冒険」の節を訳す。位置は日本語と同じ `daily` のあと）: `Get answers right in the quiz to earn coins, which you can use in the Adventure. Draw flags with the Flag Draw to recruit country allies, build a team, and make your way through the dungeons.` と `Play the Adventure from the <b>Adventure</b> card on the home screen. If you don’t want to see it, you can turn it off in <b>Settings</b>.` の形。
- 今の節を日本語の howto と同じ中身に: `start` の文に［Adventure］の大きなカード、`badges` の文に `and the Adventure`、`profile` の文に `Adventure leaderboards`。description も日本語と同じ並びで冒険を足す（160字まで）。

- [ ] **Step 1: テスト** — `en_howto_all`: `Adventure`・`coins`・`Flag Draw`・`Adventure leaderboard`（か `Adventure leaderboards`）がある。`<h2 id>` が `['start', 'modes', 'kinds', 'daily', 'rpg', 'dojo', 'book', 'badges', 'profile', 'app', 'embed', 'faq']`。日本語の howto と同じ順。用語は辞書と同じ（今の一覧に `Flag Draw`・`Adventure` を足す）。`en_pages_no_japanese` もそのまま通る。`rpg_glossary` の考え方で、`companion`・`gacha` が無い。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 書く。**
- [ ] **Step 4: 通るのを見る。コミット** — `英語版: 遊び方に冒険を足す`

（コントローラーが別の AI に、日本語の howto と並べて自然さ・ずれを見させる。）

### Task 11: 英語版を全部まわるテストを広げる

**Files:**
- Modify: `tests/e2e/en_walk.test.mjs`

- [ ] **Step 1: テストを直す**（PHONE と PC、`seed` 固定、プロフィール `Chiko`、偽 DB に `チコ` の冒険の記録）
  - `UNTRANSLATED` と `shownEntries` を消す（未訳の入口はもう無い）。頭のコメントに PR8 を足す。
  - `en_walk` に足す: ホームのコインのチップと［Adventure］→ はじめての画面（ストーリー）→ 旅に出る → 冒険ホーム → ガチャ10回 → 仲間の一覧・カードの詳細 → 編成 → バトル1回（勝つ）→ 章の終わりの窓（セーブで出す）→ 塔の1階 → 冒険ランキング → データの欄 → かざりのえらび → 設定の冒険のスイッチ → 練習の結果のコインの欄。各画面で `jaLeft` が空、ページエラーなし、`[i18n]` の warn なし、`dialog` に日本語なし。トースト（`#toast` の文）にも日本語なし。
  - `en_links_stay_english` に足す: バトルの負けの［Practice this region］・冒険ホームの［Earn coins in the quiz］でモード選択へ行っても `/en/` のまま。
  - `ja_unchanged` はそのまま。
- [ ] **Step 2: 走らせる** — `cd tests/e2e && node --test --test-concurrency=1 en_walk.test.mjs`（落ちたら持ち主のタスクの直しとして入れる）
- [ ] **Step 3: コミット** — `英語版: 全画面のテストに冒険を足す`

### Task 12: PR8 を出す

- [ ] 作る順番どおりに全部作り直し、差分が出ないこと: `node tools/trivia_en.mjs build && node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs && git status --short`（何も出ない）。
- [ ] `node --test tests/unit/` 全部、`cd tests/e2e && node --test --test-concurrency=1 *.test.mjs` 全部（日本語版の今のテスト、`ja_rpg_unchanged` も）。`bash tests/sql/run.sh` も通る（SQL を変えていないことの確かめ）。
- [ ] `?v=` を origin/main と比べて、変えたファイルが全部 +1（`cache_bust`）。main が進んでいたら取りこんで合わせ直す。
- [ ] 英語の冒険の画面のスクリーンショット（390px と 1280×800）: はじめての画面・冒険ホーム（冒険マップ・札・手配書・コインの表）・章の終わりの窓4つ・ガチャ（10枚の結果）・仲間の一覧・カードの詳細・編成・バトル（会う・問題・勝ち・負け）・塔・冒険ランキング・トップバーのチップ（360px も）・結果のコインの欄を `/mnt/project-files/country-drill-next5-20261029/en-pr8/` に。文字のあふれを目で見る。
- [ ] 辞書全部の最後の見直し: コントローラーが別の新しい AI に、`en-rpg*.js` と `en-badges.js`・`en-profile.js`・`en-html.js` の冒険の行を並べて見させる（用語集とのずれ・同じ日本語に別の訳が無いか・冒険のバッジの条件とバトルの画面の語が同じか）。名前とストーリーは各かたまりから10件ずつ無作為に `faith` でもう一度見る。1件でも「足した／変えた」が出たら、その辞書を Task 3〜4 の確かめからやり直す。
- [ ] push・PR。本文の頭に「**SQL はいらない**（冒険ランキングに送るものは変えていない）」と、「英語版に冒険とコインの表示が出る。セーブは日本語版と同じ（既定の編成名は表示だけ Team 1）」と書く。名前とストーリーの確かめの記録（`names.md`・`story.md`・`dict-*.md`）の件数のまとめ（直した数・種類）も書く。これで英語版の4本（PR5〜PR8）がそろい、spec の D3 の範囲が全部英語になったことも書く。チコの OK でマージ。

---

## 決めたこと（ルーリング）

1. **SQL は要らない**。セーブ・冒険ランキングに送るものは今のまま。英語にするのは表示だけ。
2. **rpg-core.js は T を呼ばず、日本語はデータ、英語は表示で**（PR5 ルーリング 13、PR7 ルーリング 5 と同じ）。ストーリーの文も rpg-core のデータに移す（名前と同じく画面の外の「データ」で、取り残しのテストが Task 4 から効く）。鏡の手下の名前は日本語の `n` をそのまま残し、英語のための型 `nk` と元の名前 `nb` を足す（セーブ・管理・テストは `n` のまま）。
3. **辞書は4つに分ける**（en-rpg・en-rpg-cards・en-rpg-battle・en-rpg-rank）。ファイルごとに確かめを分けられ、1つの辞書が大きくなりすぎない（en-rpg だけで約250行）。2つ以上のファイルが使う文は en-rpg に1回だけ書く。
4. **画面なしのモード（`HEADLESS`）は消し、`I18N.hide` は空にする**（しくみは残す）。英語でも日本語と同じ動き。壊れたセーブ・新しい版・保存できないときは英語のトーストと冒険ホームの注意で知らせる（コンソールだけにしない）。
5. **既定の編成名はセーブでは日本語（`'編成1'`）のまま、表示だけ `Team 1`**。英語で何も変えずに保存しても日本語の名前を書く。自分で付けた名前は訳さず `data-ugc`。
6. **名前とストーリーは「訳す → 中身のずれ → 英語の自然さ → 直した行の見直し」を通す**（PR7 の豆知識と同じ。量が少ないので、かたまりに分けない）。画面の文は PR7 のバッジと同じく、タスクごとに別の AI 2つで見る。
7. **冒険の語は PR7 の一覧のまま、足した語も同じテスト（`rpg_glossary`）で全部の辞書に効かせる**。`companion` は使わない（en-profile.js も直す）。
8. **自分の称号は `BADGES.titleLabel` で英語にし、カタログに無い称号は英語版では出さない**（PR7 ルーリング 8 と同じ）。
9. **コインのチップは英語で `{n}k`**（`12.3k`）。日本語は今の `1.2万`。
10. **シェアの文は `#FlagMaster` と英語版の URL**（日本語の冒険のシェアにタグ `#国旗マスター` があるので、PR6 の決まりどおり英語のタグを付ける）。
11. **PR5〜PR7 で英語から外していた冒険の文を戻す**: head の説明・設定の音の文・プロフィールのはじめの文・遊び方。
12. **`pc.css` のコメントだけの直しでも `?v=` を上げて作り直す**（`cache_bust` と sw の `VERSION` のため）。

## チコに決めてほしいこと

それぞれ、おすすめと理由つき。全部おすすめでよければ「OK」だけで進める。

1. **「国旗ガチャ」の英語**
   - おすすめ: `Flag Draw`（引く `Draw 1`・`Draw 10`、無料1回 `Free draw`）。
   - 理由: 英語で gacha が通じるのはゲーム好きの人だけで、お金を払うくじ（loot box）の印象もある。このガチャはクイズのコインだけで引くので、カードを「引く」意味の draw のほうがそのまま伝わる。カードのパックの絵（`FLAG QUEST · 国旗パック`）とも合う。
2. **冒険の名前「国旗クエスト」**
   - おすすめ: `Flag Quest`。
   - 理由: ガチャのパックの絵にもう `FLAG QUEST` と書いてあり、Flag Master とも並びがよい。入口のカードの名前は今までどおり `Adventure`。
3. **モンスター・ダンジョンの名前の訳し方**
   - おすすめ: 日本語の意味（動物・場所・性格）を残した、英語のゲームらしい名前（`おしゃべりオウム` → `Chatty Parrot`、`アマゾンの密林` → `Amazon Jungle`）。
   - 理由: 直訳だと英語として不自然な名前が多く、ローマ字（`Oshaberi Oumu`）だと意味が伝わらない。意味を残せば、日本語版と英語版で同じモンスターの話ができる。
4. **ストーリーの英語の語り**
   - おすすめ: 子ども向けのやさしい英語で、「旅人のきみ」は `you, the Traveler`（2人称）。
   - 理由: 日本語も子どもに語りかける形なので、英語も同じ距離で読める。出来事は1つも足さない・変えない。
5. **英語で既定の編成名（編成1）を出すとき**
   - おすすめ: 画面だけ `Team 1`。セーブは `編成1` のまま。
   - 理由: セーブを英語に書きかえると、日本語版に `Team 1` が出てしまう。自分で付けた名前はどちらの言語でもそのまま出す。
6. **英語のコインのチップの短い形**
   - おすすめ: `12.3k`（1万から）。
   - 理由: 360px のトップバーに1行で入る長さで、英語のゲームでよく見る形。`12,345` のままだと1万から先でトップバーが2行になりやすい。

## リスク

- **包み忘れで日本語の画面が変わる**: `T()` は日本語でキーを返すだけだが、テンプレートから HTML を外へ出すときに空白や `esc` の位置がずれうる。`ja_rpg_unchanged`（origin/main と全画面の文を比べる）と今の rpg の e2e 全部で止める。
- **量が多い**（新しいキー約450、rpg.js は約125か所）: 取り残しは `no_ja_outside_T`、訳し忘れは `dict_has_all_keys` と `[i18n]` の warn、画面の取り残しは en_walk の `jaLeft` で見る。
- **英語の名前が長く、カード・4択・冒険マップの SVG がくずれる**: fit のテスト（`en_cards_fit`・`en_battle_fit`・`en_rpg_home_fit`・`en_topbar_chip_360`）とスクリーンショット。SVG の `text` は折れないので、長い名前は rpg.css で字を小さくするか、名前を短く訳す（28字の上限）。
- **英語のセーブの書きかえ**: 既定の編成名・称号・ストーリーの既読は日本語のキーのまま。`en_team_default_name`・`en_rpg_save_roundtrip` で見る。
- **名前・ストーリーの訳のまちがい**: 確かめの記録と最後の無作為の見直し。辞書のキーで引けるので、チコが気づいたら1行ずつ直せる。
- **`?v=` の数**: PR を出すまでに main が進むと合わなくなる。Task 12 で合わせ直す。
