# 改善5案 PR7（英語版: バッジ・称号・豆知識779件・英語でもコインとバッジが増える）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 英語版 Flag Master で、バッジ（Badges）と称号（Title）を英語で使えるようにし、豆知識779件を英語にして答えのあと・図鑑の小窓・道場・英語の国のページに出し、英語で遊んでもコインとバッジが増えるようにする。ほかの人の称号も英語で出す。保存する値（バッジのセーブ・サーバーの称号）は日本語のまま。

**Architecture:** PR5・PR6 のしくみをそのまま使う。豆知識は `data/en/trivia_facts.json`（日本語の `data/trivia_facts.json` と同じ並び・同じ id）に英訳を置き、`tools/trivia_en.mjs build` が `trivia-en.js`（`window.TRIVIA` の英語版、形は trivia.js と同じ）を作る。make_en は英語のページで `trivia.js` の代わりに `trivia-en.js` を読ませるので、index.html の豆知識の表示コードは変えない。英訳は8つのかたまり（約100件ずつ）に分け、かたまりごとに「訳す → 別の AI が中身のずれを見る → 別の AI が英語の自然さを見る → 直した所だけもう一度ずれを見る」を通す。バッジは badges.js のカタログを日本語のデータ（`// i18n-data`）にしたまま、条件の文を「型の文＋数」（`dk`・`dv`）に分け、表示のときに `T()` で英語にする。辞書は `i18n/en-badges.js`（新しい）。ほかの人の称号はサーバーに日本語で入っているので、`BADGES.titleLabel(ja)` がカタログの称号と照らして英語にする（知らない称号は英語版では出さない）。コインは rpg.js を英語のページで「画面を作らないモード」（`I18N.hide.has('rpg')`）で読み、コインの受け取りとバッジのコインの支払いだけを動かす（冒険の画面・入口・コインの表示は PR8）。

**Tech Stack:** 素の JS・Node（node:test・node:vm）・Playwright（tests/e2e、`--test-concurrency=1`）。Python は今の `tools/make_trivia.py` を変えずに使う。

**Spec:** `docs/superpowers/specs/2026-10-29-next5-design.md`（「D3 英語版」。とくに「範囲」の豆知識779件・バッジと称号、「しくみ」の辞書と `T()`、「記録」、「英語の文の確かめ」、「分け方」の PR7 の行）。形と決まりは PR5 の計画 `docs/superpowers/plans/2026-10-30-next5-pr5-en-base.md`（ルーリング 1〜17）と PR6 の計画 `docs/superpowers/plans/2026-10-30-next5-pr6-en-play.md`（ルーリング 1〜12）を引きつぐ。バッジの設計は `docs/superpowers/specs/2026-10-26-badges-design.md`。

**土台のブランチ:** PR5（#45）・PR6（#46）がマージされた origin/main（b7b7a72）から `pr7-work` を切る。

**SQL:** **いらない**。表・関数・NG ワードは変えない。称号はこれまでどおり日本語の文字でサーバーに送り（`profile_set` の `p_title`）、英語にするのは画面に出すときだけ。

## Global Constraints

- PR5・PR6 の Global Constraints は全部そのまま有効（首都の問題を作らない・Flag Master／`#FlagMaster`・アメリカ式のつづり・データのキーは日本語のまま・`T()` の決まり・`JA_RE`・`lang="ja"` と `data-ugc` の中だけ日本語可・localStorage のキーを増やさない・生成物はコミット・CSS の色は今の変数だけ・英訳は事実を足さない・日本語版の今のテストは全部そのまま通る・英語の画面のリンクは `I18N.page()` か `location.pathname` から）。
- **作る順番**（Task 10 から）: `node tools/trivia_en.mjs build && node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs`。Task 9 までは `trivia_en.mjs build` を入れない（英訳がそろうまで build は止まる）。js・辞書・index.html・英訳を変えたタスクは毎回この順で作り直してからコミット。
- **`?v=`**: 変えた js/css と辞書は「そのとき origin/main にある数 +1」（`cache_bust` テストが見る）。今の main では `i18n.js` 2→3（index.html と embed.html の両方）・`badges.js` 13→14・`rpg.js` 15→16・`profile.js` 8→9。新しい辞書 `i18n/en-badges.js` は1行目 `// v=1`。`trivia-en.js` は trivia.js と同じく `?v=` を付けない。PR を出す前に main が進んでいたら合わせ直す。同じ PR の中で何度変えても +1 は1回だけ。
- **辞書の置き場所**: badges.js の文・バッジの名前・条件・称号・ひみつのヒント → `i18n/en-badges.js`。`EN_DICTS['index.html']` に `'en-badges'` を足す。`〈{title}〉`（`“{title}”`）は en-profile.js にあるものをそのまま使う（同じキーを2つの辞書に書かない）。
- **用語集**（PR5・PR6 のものに足す。辞書・ページで同じ語を使う）: バッジ `Badges`（1つは `badge`）／称号 `Title`（文の中は `title`）／豆知識 `Fun facts`（種類のラベルは今の `🏳️ Flag`・`🗺️ Geography`・`🍜 Culture`）／銅 `Bronze`・銀 `Silver`・金 `Gold`・虹 `Rainbow`／ひみつのバッジ `Secret badge`／つける `Equip`／つけてる中 `Equipped`／称号をえらぶ `Choose a title`／称号をかえる `Change title`／称号をつけない `No title`／まだ称号がない `No title yet`／コンプリート `Complete`／バッジゲット！ `Badge earned!`／分類 クイズ `Quiz`・あそび方 `Ways to play`・モード `Modes`・地域 `Regions`・図鑑・毎日 `Gallery & daily`・ドパガキ `Hype mode`・冒険 `Adventure`／コイン `coins`。
- **冒険の語**（バッジの条件に出るので PR7 で決める。PR8 もこれを使う）: 冒険 `Adventure`／英雄の塔 `Tower of Heroes`／ダンジョン `Dungeon`／旅人 `Traveler`／旅人のレベル `Traveler level`／バトル `battle`／ボス `boss`・地域ボス `region boss`／地図喰い `the Map Eater`／仲間 `ally`（`allies`）／なかよし度 `Friendship`／シルバー（仲間の段）`Silver`／手配書 `Wanted posters`／推奨 Lv `recommended Lv`。
- **バッジの名前と称号は Title Case**（`Drill Rookie`）、条件・ヒント・画面の文は sentence case。条件とヒントは文末の `.` を付けない（日本語も `。` が無い。読み上げの文 `aria-label` の中では呼ぶ側の型の文が区切る）。称号は英語で24字まで（390px の札とトーストに入れるため）。
- **保存する値は日本語のまま**: バッジのセーブ（localStorage `badges` の `eq`・`got`）はキー（`answers@2`）だけで文字を持たない。`BADGES.title()` は今までどおり**日本語の称号**を返し、プロフィールの同期は日本語の称号を送る。英語にするのは表示のときだけ（`BADGES.titleLabel()`）。admin.html・admin.js は日本語のカタログをそのまま使う（変えない）。
- **badges.js の前半（コア）は `T` を呼ばない**（vm と admin.html は i18n.js を読まない）。日本語の文字は `// i18n-data:start`〜`// i18n-data:end` の中のデータにし、後半（ブラウザ）で表示のときに `T()` を通す（PR5 ルーリング 13）。
- **豆知識の英訳の決まり**（訳す AI と確かめる AI の両方に渡す。`tools/trivia_en.mjs sheet` の頭にも出す）:
  1. 日本語の `t` に書いてあることだけを訳す。事実・数・名前・年・理由・形容（「世界で唯一」など）を足さない・落とさない・変えない。`note`（出どころのメモ）は固有名詞のつづりと、何を指すかの確かめにだけ使い、`note` にしか無い中身を英文に入れない。
  2. 弱め方を残す: 「〜とされる」「〜と言われる」「説がある」「と考えられる」→ `is said to`・`is considered`・`is believed to`・`reportedly`・`according to` など。日本語が言い切っている所を弱めない。
  3. 数はアラビア数字で、日本語と同じ数（`1万` → `10,000`、`約1900m` → `about 1,900 m`）。`約` → `about`／`around`／`roughly`／`nearly`。単位は `km`・`km²`・`m`・`°C`。日本語に無い換算（マイル・フィート）を足さない。
  4. 日本とくらべる文（「日本の岐阜県とほぼ同じ広さ」）はそのまま訳す（`about the same size as Gifu Prefecture in Japan`）。英語圏の物に置きかえない。
  5. 固有名詞は英語版 Wikipedia の記事名。国名は countries.js の `e`、首都は `ec`。日本語のかぎかっこ「」は `“ ”`、アポストロフィは `’`（まっすぐな `'` と `"` は使わない）。
  6. 1件は1〜2文の平叙文で、`.` で終わる。`?` を使わない（日本語の豆知識に問いは無い）。`quiz`・`guess` を使わない。日本語に「首都」が無いのに `capital` を足さない（首都を問う形を作らない・首都の話を足さない）。
  7. 長さは 200 字まで。
- **英訳の id**: `<a>-<n>`。`n` は `data/trivia_facts.json` の中で、その国の項目を上から数えた番号（1から）。英訳の行は `{ "id", "a", "k", "ja", "t" }` で、`ja` は日本語の `t` の写し（日本語を直したら英訳が古いことをテストが知らせる）。並びは日本語のファイルと同じ。
- **英語のページで読む script**: PR7 で `EN_SKIP` は `['rpg-cards.js', 'rpg-battle.js', 'rpg-team.js', 'rpg-rank.js']` になる（`badges.js`・`rpg-core.js`・`rpg.js` を読み、`trivia.js` は `trivia-en.js` に差しかえる）。`I18N.hide` は英語で `new Set(['rpg'])`（`'title'` を外し、`'rpg'` を足す。PR8 で `'rpg'` を外す）。

## Review Focus

1. **英訳が事実を足す・落とす・数を変える**（779件のどこか1件でも）: 数・弱め方・「唯一／最大／初めて」・首都の語は機械で見て（`trivia_en_numbers`・`trivia_en_hedges`・`trivia_en_superlatives`・`trivia_en_no_quiz_wording`）、残りは2つの確かめ（中身のずれ・英語の自然さ）と、直した行の見直しで止める。Task 1 のテストと Task 2〜9 の手順。
2. **英語で称号をつけても保存は日本語のまま・言語を行き来しても同期が揺れない**: 英語で［Equip］したあと `BADGES.title()` は日本語、`profile_set` の `p_title` は日本語、日本語版→英語版→日本語版と開いても `profile_set` が余分に飛ばない（バッジの数・全部の数が両方の言語で同じ）。Task 14 の `en_equip_keeps_ja`・Task 15 の `en_sync_sends_ja_title`・`en_no_sync_flap`。
3. **ほかの人の称号**: カタログにある日本語の称号は英語で出し、カタログに無い文字（古い称号・手で入れた文字・`<b>` 入り）は英語版では出さず、日本語版は今のまま全部出す。Task 15 の `en_card_title_known`・`en_card_title_unknown`。
4. **英語のページで rpg.js を画面なしで読む**: 英語で遊ぶとコインが増え、バッジのコインも払われるが、`#pcoin`・`#rpg-chip`・`#home-rpg`・結果の `#r-ext` の中身・コインのトースト（はじめてのコイン・バッジのごほうび・セーブが読めない）・設定の冒険のスイッチは出ない。`en/#rpg` はホームのまま。冒険をはじめた人でもプロフィールの「かざり」の欄は出ない。Task 13 の `en_coins_headless`・`en_rpg_hash_home`・`en_deco_hidden_with_rpg`。
5. **長い英語の文の入り方**: いちばん長い豆知識（英訳で200字近いもの）が 390px の答えの欄と PC の下の帯（1行で切って `title` に全文）で横にはみ出さない。いちばん長いバッジの名前・称号が 390px のタイル・トースト・結果のパネル・ホームの称号の札ではみ出さない。Task 10 の `en_trivia_fits`・Task 14 の `en_badges_fit`。

---

### Task 1: 英訳の置き場所・id・かたまり・確かめるテスト

**Files:**
- Create: `tools/trivia_en.mjs`、`data/en/trivia_facts.json`（中身 `[]`）、`tests/unit/en-trivia.test.mjs`

**Interfaces:**
- Produces（`tools/trivia_en.mjs`）:
  - `export const BATCHES: [number, number][]` — `data/trivia_facts.json` の添字の範囲（はじめ含む・おわり含まない）。`[[0, 96], [96, 196], [196, 292], [292, 388], [388, 487], [487, 583], [583, 683], [683, 779]]`（国の途中で切れない。下の表）。
  - `export function triviaIds(items: {a: string}[]) -> string[]` — `<a>-<n>`（国ごとに1から）。
  - `export function sheet(ja, en, b: 1..8, mode: 'translate' | 'faith' | 'en') -> string` — Markdown。頭に Global Constraints の「豆知識の英訳の決まり」1〜7、続けて表。`translate` は `id | k | 日本語 | note`、`faith` は `id | 日本語 | English`（note は出さない）、`en` は `id | k | English`（日本語も出さない）。
  - `export function buildTriviaEn(en) -> string` — `trivia-en.js` の全文（1行目のコメント、`window.TRIVIA = {` 、国コードの昇順に `"<a>":[{"k","t"}…],`、`};`。trivia.js と同じ書き方）。英訳が779件でない・並びや `ja` が日本語と合わないときは throw。
  - CLI: `node tools/trivia_en.mjs sheet <1-8> [faith|en]`（標準出力）、`node tools/trivia_en.mjs build`（`trivia-en.js` を書く）。
- Produces（テストの部品。同じファイルで export）: `export function numbersOf(s: string) -> string[]`（全角の数字を半角に、`,` を外し、`<数>万`・`<数>億` を1万倍・1億倍した整数の文字。小数はそのまま）。

| かたまり | 添字 | 件数 | 国（a） | 地域 |
|---|---|---|---|---|
| B1 | 0–95 | 96 | af … lb | アジア |
| B2 | 96–195 | 100 | my … at | アジア・ヨーロッパ |
| B3 | 196–291 | 96 | by … mt | ヨーロッパ |
| B4 | 292–387 | 96 | md … bf | ヨーロッパ・アフリカ |
| B5 | 388–486 | 99 | bi … mg | アフリカ |
| B6 | 487–582 | 96 | mw … zw | アフリカ |
| B7 | 583–682 | 100 | ag … bo | 北・中央アメリカ・南アメリカ |
| B8 | 683–778 | 96 | br … vu | 南アメリカ・オセアニア |

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/en-trivia.test.mjs`。英訳はいま0件なので、「あるだけ」を見るテストにする。全部そろったことは Task 10 の `trivia_en_complete` が見る）
  - `batches_cover`: `BATCHES` がすき間なく 0〜779 を覆い、どの境目も国の途中でない（`ja[e-1].a !== ja[e].a`）。
  - `ids_unique`: `triviaIds(ja)` が779個で重複なし、`af-1`・`af-4`・`am-1` がある。
  - `trivia_en_prefix_aligned`: 英訳の件数が 0 か `BATCHES` のどれかのおわり。各行 `i` で `id === ids[i]`・`a`・`k` が日本語と同じ・`ja === ja[i].t`・キーは `id a k ja t` の5つだけ。
  - `trivia_en_text_rules`: 各行の `t` が文字列で 15〜200 字、`JA_RE` が無い、`.` で終わる、`?`・`{`・`}`・`'`・`"` が無い、前後に空白が無い、2つ続く空白が無い。
  - `trivia_en_numbers`: `numbersOf(ja)` の数が全部 `numbersOf(t)` にある（例外は `NUM_OK = {}`、id → 理由。入れるときは確かめた AI の名前と理由を書く）。fixture: `numbersOf('約1900m') = ['1900']`、`numbersOf('1万を超える') = ['10000']`、`numbersOf('１,２００') = ['1200']`。
  - `trivia_en_hedges`: 日本語に `/とされ|と言われ|といわれ|説が|と考えられ/` があれば、英語に `/\b(said|reportedly|believed|considered|thought|according to|traditionally|legend|claimed|described)\b/i` のどれか。日本語に `約` があれば英語に `/\b(about|around|roughly|nearly|approximately|some)\b/i` のどれか。
  - `trivia_en_superlatives`: 日本語に `/唯一|世界で|世界一|最[大小高長古多深低]|いちばん|一番|初めて|最初/` があれば、英語に `/\b(only|first|largest|smallest|highest|longest|oldest|most|biggest|tallest|deepest|lowest|fewest|earliest)\b|world’s|in the world/i` のどれか。
  - `trivia_en_no_quiz_wording`: 英語に `/\b(quiz|guess)\b/i` が無い。日本語に `首都` が無い行の英語に `/\bcapital\b/i` が無い。
  - `sheet_modes`: `sheet(ja, [], 1, 'translate')` に `af-1` と日本語と note がある。`'faith'` は note を出さない。`'en'` は日本語を出さない（`JA_RE` が無い。決まりの文も英語で書く）。
  - `build_refuses_incomplete`: 英訳が779件でないと `buildTriviaEn` が throw。779件の作り物（`t: 'x' + i + '.'`）なら trivia.js と同じ国・同じ件数の `window.TRIVIA` を作る（vm で読む）。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/en-trivia.test.mjs`
- [ ] **Step 3: 実装** — `tools/trivia_en.mjs`（頭のコメントに使い方と「決まり」の置き場所）、`data/en/trivia_facts.json` は `[]`。
- [ ] **Step 4: 通るのを見る** — `node --test tests/unit/`（全部）。
- [ ] **Step 5: コミット** — `英語版: 豆知識の英訳の置き場所と、ずれを見つけるテスト（tools/trivia_en.mjs）`

### Task 2〜9: 豆知識の英訳 B1〜B8（1かたまりで1タスク）

8つとも同じ手順。かたまり N は上の表の範囲。前のかたまりが終わってから次へ（同じファイルに足していくので並べて走らせない）。

**Files:**
- Modify: `data/en/trivia_facts.json`（かたまり N の行を末尾に足す）
- Create: `.superpowers/sdd/2026-10-31-next5-pr7-en-badges-trivia/trivia-bN.md`（確かめの記録）

**Interfaces:**
- Consumes: Task 1 の `sheet`・テスト。
- 確かめの記録 `trivia-bN.md` の形: 訳した AI・確かめた AI 2つ（それぞれ別の新しい AI。訳した AI と同じものを使わない）、中身のずれの確かめで見つかった id と種類（足した／落とした／変えた／弱め方／取りちがえ）と直し方、英語の確かめの直し、直した行の見直しの結果、`NUM_OK` に入れたもの。

- [ ] **Step 1: 訳す** — 訳す AI に `node tools/trivia_en.mjs sheet N`（translate）を渡し、決まり1〜7どおりに訳した行を `data/en/trivia_facts.json` の末尾に足す。
- [ ] **Step 2: テストを通す** — `node --test tests/unit/en-trivia.test.mjs`。落ちた行は訳を直す（テストをゆるめない。数の例外は `NUM_OK` に理由つきで、確かめ1で認められたものだけ）。
- [ ] **Step 3: 確かめ1（中身のずれ）** — 新しい AI に `sheet N faith`（日本語と英語だけ。note は渡さない）を渡し、1件ずつ「OK」か「直す（種類と理由）」を出させる。見る点: 日本語に無いことを足していないか・落としていないか・数／名前／場所／年／くらべる相手が同じか・弱め方が残っているか（足してもいないか）・何を指すかの取りちがえ。直すものは訳す AI が直す。
- [ ] **Step 4: 確かめ2（英語の自然さ）** — 別の新しい AI に `sheet N en`（英語だけ）と用語集を渡し、自然か・短くわかりやすいか・つづり（アメリカ式・Wikipedia の固有名詞）・決まり5〜7を見させる。意味を変える直しは入れない（言いかえだけ）。
- [ ] **Step 5: 直した行の見直し** — Step 4 で変えた行だけを、Step 3 の AI（または新しい AI）にもう一度 `faith` で見させる。全部 OK になるまで Step 3〜5 をくり返す。
- [ ] **Step 6: 通るのを見てコミット** — `node --test tests/unit/en-trivia.test.mjs`。`trivia-bN.md` も入れて `英語版: 豆知識の英訳 BN（<はじめの id>〜<おわりの id>、<件数>件）`

### Task 10: 英語の本編で豆知識を出す（trivia-en.js）

**Files:**
- Create: `trivia-en.js`（生成）
- Modify: `tools/make_en.mjs`（`EN_SKIP` から `trivia.js`、`EN_SWAP = { 'trivia.js': 'trivia-en.js' }` で差しかえ）、`en/index.html`（生成）、`sw.js`（生成）、`tests/unit/en-trivia.test.mjs`、`tests/unit/i18n.test.mjs`（`trivia.js` を `NOT_YET` から `SKIP` へ、`trivia-en.js` も `SKIP`）、`tests/unit/make-en.test.mjs`、`tests/unit/sw.test.mjs`、`tests/e2e/en.test.mjs`、`tests/e2e/trivia.test.mjs`

**Interfaces:**
- Consumes: `buildTriviaEn`（Task 1）、779件の英訳（Task 2〜9）。
- Produces: `export const EN_SWAP: Record<string, string>`（make_en）。`window.TRIVIA` は英語のページでは英語（形は同じ）。index.html の `pickTrivia`・`triviaHTML`・`flagTrivia` は変えない。

- [ ] **Step 1: テスト**
  - unit `trivia_en_complete`（en-trivia）: 英訳が779件で、`triviaIds(ja)` の id が全部ある。`trivia-en.js` が `buildTriviaEn(en)` と同じ（作り直し忘れで落ちる）。vm で読んだ英語の `TRIVIA` の国と件数・`k` が trivia.js と同じ。どの `t` にも `JA_RE` が無い。
  - unit `en_scripts`（make-en）を直す: en/index.html に `trivia-en.js` があり `trivia.js` が無い（日本語の index.html は `trivia.js` のまま）。「EN_SKIP に無い script は同じ ?v= で残る」は `EN_SWAP` の分を読みかえて見る。
  - unit `sw.test.mjs`: precache に `trivia-en.js` がある。
  - e2e（`en.test.mjs`）: PR5 の「図鑑の小窓・地図の欄に `.trivia` が無い」2つを `en_book_trivia`・`en_map_trivia` に書きかえる: `#detail .trivia`・`#binfo .trivia` があり、文が英語（`jaLeft` が空）、ラベルが `🏳️ Flag` など。
  - e2e `en_answer_trivia`（`trivia.test.mjs`）: 英語で練習を1問正解すると答えの欄に英語の豆知識が1つ、道場で正解すると `🏳️ Flag` の豆知識。日本語版は今のテストのまま。
  - e2e `en_trivia_fits`: 英訳でいちばん長い `t` の国を `window.TRIVIA` の差しかえで出題し、390px で答えの欄が横にはみ出さない・PC（1280×800）で下の帯が1行で切れて `title` に全文がある。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** — make_en の差しかえ、作る順番どおりに作り直し（ここから `trivia_en.mjs build` を入れる）。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `trivia`・`en`・`dojo`・`pwa`・`lang`。
- [ ] **Step 5: コミット** — `英語版: 豆知識を英語で出す（trivia-en.js。答えのあと・図鑑・道場）`

### Task 11: 英語の国のページに豆知識（Fun facts）

**Files:**
- Modify: `tools/make_country_pages.mjs`（入力に `trivia-en.js`、英語のページに節、表 `EN` に `funFacts: 'Fun facts'` と `TRIVIA_LABEL_EN = { flag: 'Flag', geo: 'Geography', culture: 'Culture' }`、`英語の豆知識が0件: <a>` で止まるチェック、頭のコメントの「豆知識の節は出さない」を消す）、`en/country/*.html`（生成）、`tests/unit/country-pages.test.mjs`、`tests/e2e/country.test.mjs`

**Interfaces:**
- 英語のページの並びは日本語と同じ: What the flag means → **Fun facts**（`<h2>Fun facts</h2><ul class="trivia">`、各行 `<li><span class="tv-k">Flag</span>…</li>`）→ Neighboring countries → …。title・description は変えない。

- [ ] **Step 1: テスト**
  - `en_country_trivia`（PR5 の「英語のページに豆知識の節が無い」を書きかえ）: `en/country/fr.html` に `<h2>Fun facts</h2>` と英訳の4件が英訳のファイルの順で、`What the flag means` のあと・`Neighboring countries` の前。`en/country/*.html` 全部で `JA_RE` が無い（今の `en_country_no_japanese`）。
  - `en_country_trivia_escape`: `setTrivia` と同じ作り方で英語の `t` に `<b>&"x` を入れると、エスケープされて出る。
  - `en_country_trivia_missing`: ある国の英語の豆知識を空にすると `英語の豆知識が0件: fr` で止まる。
  - `regenerate_same`（今のテスト）が英語もふくめ通る。
  - e2e `en_country_phone` に足す: 390px で `en/country/vc.html` の豆知識の欄がはみ出さない。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る。**
- [ ] **Step 5: コミット** — `英語版: 国のページに豆知識（Fun facts）`

### Task 12: バッジのカタログを「型の文＋数」に（日本語の見た目は変えない）

**Files:**
- Modify: `badges.js`（`?v=` +1。コアのカタログ）、`tests/unit/badges.test.mjs`

**Interfaces:**
- カタログの日本語は全部 `// i18n-data:start`〜`// i18n-data:end` の中の、シングルクォートの文字列（テンプレート文字列と `' / '` でつないだ称号をやめる）:
  - `REGION_KEY` の地域名・`makeX` の `label` の `'全世界'`・`CAT_LABEL`・`TIER_LABEL`。
  - バッジの `name`・`sub`・`hint`、称号は配列（`T3(goals, ['こつこつ派', '努力の人', 'ドリルの鬼'], dk, dv)`）。
  - 条件は型の文 `dk` と数 `dv`。今の文と1文字も同じになるように: `'「{sub}」で {g}か国にヒントなしで正解'`・`'{region}で10問以上のゲームをクリア'`・`'{region}の「全部」をヒントなしでクリア'`・`'{region}の国すべてを4モードで正解'`・`'正解の合計が {g}問'`（`g` は今の `num()` の文字）・`'面積 1,000km² 未満の国（{g}か国）すべてに、どれかのモードでヒントなしで正解'`・`'タイムアタック10問以上を1問 {s}秒以内でクリア'`（`s` は今の `toFixed(1)`）など。数の無い条件は `dv: {}`。
- 段（tier）は `{ goal, title, desc, dk, dv, … }`。`desc` は今までどおり日本語の文（`fillJa(dk, dv)`。admin.js と `listView` が使う）。
- Produces: `BADGES_CORE.fillJa(s: string, v: object) -> string`（`{name}` を置きかえるだけ。T と同じ1回の置きかえ）、`BADGES_CORE.titlesOf(cat) -> string[]`（全部の段の日本語の称号、カタログの順）。
- `dv` の中で英語にするのは `region`・`sub` だけ（日本語のデータ。表示のときに `T()`）。ほかの値は数の文字。

- [ ] **Step 1: 失敗するテストを書く**（`badges.test.mjs`）
  - `catalog_desc_same`: どの段も `t.desc === K.fillJa(t.dk, t.dv)`。今の文と同じことを代表で見る: `mode-f2n@1` が `「国旗→国名」で 30か国にヒントなしで正解`、`answers@2` が `正解の合計が 1,000問`、`reg-samerica@1` が `南アメリカで10問以上のゲームをクリア`、`reg-world@3` が `全世界の国すべてを4モードで正解`、`ta-speed@3` が `タイムアタック10問以上を1問 1.4秒以内でクリア`、`micro@1` が `面積 1,000km² 未満の国（25か国）すべてに、どれかのモードでヒントなしで正解`。
  - `catalog_titles_same`: `K.titlesOf(cat)` の数と中身が今のもの（`ドリルの新人`・`こつこつ派`・`努力の人`・`ドリルの鬼` … `英雄`）と同じ並び（テストに今の一覧を書く）。
  - `dv_keys`: `dv` のキーは `g`・`s`・`sub`・`region` だけで、`dk` の `{…}` とそろっている。
  - 今の badges のテスト（unit・e2e `badges.test.mjs`・`admin_*`）はそのまま通る。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/badges.test.mjs`
- [ ] **Step 3: 実装**（コアだけ。ブラウザの後半は Task 14）。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `badges`・`admin_rank`・`admin_device`・`profile`。
- [ ] **Step 5: コミット** — `バッジのカタログの文をデータに（条件は型の文と数。見た目は同じ）`

### Task 13: 英語のページで rpg.js を画面なしで読む（英語でもコインが増える）

**Files:**
- Modify: `rpg.js`（`?v=` +1）、`i18n.js`（`?v=` +1。英語の `hide` を `['title', 'rpg']` に。`'title'` は Task 15 で外す）、`profile.js`（`?v=` +1。`canDeco` に `&& !I18N.hide.has('rpg')`）、`tools/make_en.mjs`（`EN_SKIP` から `rpg-core.js`・`rpg.js`）、`index.html`・`embed.html`（`?v=`）、`en/index.html`・`en/embed.html`・`sw.js`（生成）、`tests/unit/i18n.test.mjs`（`hide_title_only` → `hide_rpg`）
- Test: `tests/e2e/en_play.test.mjs`、`tests/e2e/rpg.test.mjs`（日本語版はそのまま）

**Interfaces:**
- rpg.js: `const HEADLESS = !!window.I18N?.hide?.has('rpg');`（起動時のチェックの直後）。HEADLESS のとき:
  - 動かす: セーブ（`tx`）、`drill:start`／`drill:answer`／`drill:result`／`pagehide` のコインの受け取り、`rpg:coins` などのイベント、`badge:earned` の支払い、`storage` の同期、`window.RPG`（`snapshot`・`get`・`tx`。`open` は何もしない関数）。
  - 出さない: `#pcoin`（`drawPcoin` は消すだけ）、はじめてのコインのトースト、結果の `drawResult` と失格のトースト（`drill:result` は `announce` のあとで終わる）、バッジのごほうびのトースト、`MSG.broken`・`MSG.readOnly`・`MSG.quota` のトースト（コンソールに `console.warn('[rpg]', …)`）、`setupEntrances`（画面の登録・ホームの入口・チップ・設定のスイッチ）、`drawEntrances`、`#rpg` の直リンク。
  - 日本語のページでは何も変わらない（`HEADLESS` は false）。
- `I18N.hide.has('rpg')` は「冒険の画面・入口・コインの表示が無い」の意味。PR8 で外す。

- [ ] **Step 1: テスト**（e2e、英語版）
  - `en_coins_headless`: 英語で練習5問をクリア → localStorage `rpg` の `coins`・`earned` が増える。`#pcoin`・`#rpg-chip`・`#home-rpg`・`#set-rpg` が無いか見えない、`#r-ext` が空、トーストに日本語が無い（`jaLeft` が空）、ページエラーなし。
  - `en_coins_shared`: 続けて日本語版（`../`）を開くと、ホームの冒険のコインが増えた数。
  - `en_rpg_hash_home`: `en/#rpg` を開くとホーム（`#scr-rpg` が無い）。
  - `en_rpg_broken_save_quiet`: localStorage `rpg` に壊れた文字を入れて英語版を開く → トーストが出ない・`rpg-broken-*` の写しができる。
  - `en_deco_hidden_with_rpg`: 冒険をはじめたセーブ（`intro: true`）とプロフィールで英語版のプロフィール画面 → 「かざり」（`Decorations`）の欄が無い。日本語版では今までどおり出る。
  - unit `hide_rpg`: 英語の `I18N.hide.has('rpg') === true`、日本語は空。
  - 日本語版の rpg の e2e（`rpg*.test.mjs`）はそのまま通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_play`・`en`・`rpg`・`rpg_home`・`rpg_battle`・`profile`・`cache_bust`。
- [ ] **Step 5: コミット** — `英語版: 英語で遊んでもコインがたまる（rpg.js を画面なしで読む。冒険の画面は PR8）`

### Task 14: バッジの画面を英語に（辞書 en-badges）

**Files:**
- Modify: `badges.js`（後半のブラウザの文を `T()`、共有の文、日付）、`tools/make_en.mjs`（`EN_SKIP` から `badges.js`、`EN_DICTS['index.html']` に `'en-badges'`）、`en/index.html`・`sw.js`（生成）、`tests/unit/i18n.test.mjs`（`badges.js` を `NOT_YET` から `COVER` の `'all'` へ）
- Create: `i18n/en-badges.js`、`tests/e2e/en_badges.test.mjs`
- Test: `tests/e2e/en.test.mjs`・`tests/e2e/en_play.test.mjs`（見えない入口から `#home-badges` を外す）

**Interfaces:**
- 表示のときの部品（badges.js の後半）: `nameOf(b) = T(b.name)`、`subOf(b) = T(b.sub)`、`titleOf(t) = T(t.title)`、`descOf(t) = T(t.dk, { ...t.dv, ...('region' in t.dv && { region: T(t.dv.region) }), ...('sub' in t.dv && { sub: T(t.dv.sub) }) })`、`hintOf(b) = T(b.hint)`、`tierLabel` と `CAT_LABEL` は表示で `T()`。
- 称号のかっこ `〈…〉` は全部 `T('〈{title}〉', { title })`（英語 `“…”`）。`称号〈{title}〉` は `Title: “{title}”`、`{title}をつけたよ` は `Equipped “{title}”`。
- 読み上げの文（タイルの `aria-label`）は型の文にする: `T('{name}。コンプリート', …)`、`T('{name}。まだ取っていない。次の{tier}は{desc}、{prog}', …)`、`T('{name}。{got}まで取った。次の{tier}は{desc}、いま {prog}', …)`（今の日本語と同じ文になるように。`goal === 1` の「いま」なしの形も型を分ける）。
- 数の入る文は `{ one, other }`: `ほか{n}個`（`{ one: '{n} more', other: '{n} more' }`）、`これまでの記録から バッジを{n}個もらったよ！`（`{ one: 'You earned {n} badge from your past records!', other: 'You earned {n} badges from your past records!' }`）、`ほか{n}個のバッジもゲット！`、`{t}個中 {n}個`（`{n} of {t}`）。
- 日付 `monthDay`: 英語は `Intl.DateTimeFormat(I18N.locale, { month: 'short', day: 'numeric' })`（`Oct 30`、端末の時間）、日本語は今の `10/30`。秒は `{s}秒` → `{s}s`。
- 共有の文: `T('国旗マスターでバッジ『{badge}（{tier}）』を取ったよ！ 称号〈{title}〉 {url}', …)` → `I earned the “{badge}” badge ({tier}) in Flag Master! Title: “{title}” {url}`。`url` は `window.SHARECARD?.url?.() ?? SITE`（英語は `…/country-drill/en/`）。
- 辞書 `en-badges.js` の値の決まり: 名前と称号は Title Case・称号は24字まで・同じ英語の称号を2つの日本語に使わない。名前と称号は日本語の遊び心を残した英語でよいが、意味を足さない（`七転び八起き` → `Fall Seven Times, Stand Up Eight` のような定まった言い方があればそれ）。条件は事実（数・モード・地域・ヒントなし）を落とさない。

- [ ] **Step 1: テスト**
  - unit（`i18n.test.mjs` の今のテストが badges.js をふくめて通る）: `no_ja_outside_T`・`dict_has_all_keys`（カタログのデータ文字も）・`dict_values_english`・`dict_placeholders_match`・`dict_no_unused`・`dict_no_conflict`。
  - unit `badges_en_titles`（新しい `tests/unit/en-badges.test.mjs`）: vm で badges.js と en-badges.js を読み、`titlesOf` の全部の称号に英語の文字列があり、24字まで、日本語なし、英語どうしで重ならない。全部のバッジの `name` も同じ（重なりは名前と称号で同じ日本語のとき同じ英語になるだけ）。全部の段の `descOf` が英語（`JA_RE` なし）で、`{` が残らない。
  - e2e `en_badges_screen`: `en/#badges` → `jaLeft` が空、分類のチップが `All`・`Quiz`・`Ways to play`・`Modes`・`Regions`・`Gallery & daily`・`Hype mode`・`Adventure`、タイルの名前が英語。`answers` の詳細に `Bronze`・`Silver`・`Gold` と `100`・`1,000`・`5,000` の入った条件と `Title: “…”`。ひみつのバッジは `???` と英語のヒント。
  - e2e `en_badge_earn`: 英語で練習をクリアして `first-clear` を取る → 結果のパネルが英語（`🏅` の見出し・`Title: “…”`・［Equip］）、トーストを出す場合も英語。［Equip］→ ホームの称号の札が英語の称号。
  - e2e `en_equip_keeps_ja`: 英語で［Equip］したあと `BADGES.title()` が `ドリルの新人`、localStorage `badges` の `eq` が `first-clear@1`。日本語版を開くとホームの札が `〈ドリルの新人〉`。
  - e2e `en_title_picker`: 称号えらびが英語（`Choose a title`・`No title`）、`No title` で札が消える。
  - e2e `en_badge_share`: ［Share］の文が `I earned the “` で始まり `/country-drill/en/` で終わる。
  - e2e `en_badge_coin_paid`: 英語でバッジを取ると localStorage `rpg` の `badgesPaid` にそのキーが入り `coins` が増える（Task 13 のおかげ）。パネルの行に `●+50`。
  - e2e `en_badges_shared`: 日本語版で取ったバッジが英語のバッジ画面に、英語で取ったものが日本語版に出る。
  - e2e `en_badges_fit`: 全部のバッジを `BADGES.debug.grant` で取った状態（`?bdgdebug=1`）で、390px のバッジ画面・称号えらび・いちばん長い英語の称号をつけたホームの札・結果のパネル（4行）が横にはみ出さない。
  - `en.test.mjs` の `en_home` と `en_play.test.mjs` の `en_home_entries`: `#home-badges` が見え、`#home-rpg` は見えない。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（badges.js の後半は約60か所）→ 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `badges`・`en_badges`・`en`・`en_play`・`lang`・`profile`。
- [ ] **Step 5: コミット** — `英語版: バッジと称号の画面（i18n/en-badges.js）`

（コントローラーが別の新しい AI に、`i18n/en-badges.js` を日本語のキーと並べて見させる: 英語として自然か・条件の事実（数・モード・地域・ヒントなし・連続でなくていい など）がずれていないか・用語集と冒険の語のとおりか・称号が称号らしい短さか。直しは辞書だけ。もう1つ別の AI に、英語だけを見せて称号とバッジの名前がゲームの名前として自然かを見させる。）

### Task 15: ほかの人の称号を英語で出す（`I18N.hide` から `'title'` を外す）

**Files:**
- Modify: `badges.js`（`BADGES.titleLabel`）、`profile.js`（カードの称号）、`i18n.js`（英語の `hide` を `['rpg']`）、`tests/unit/i18n.test.mjs`、`tests/e2e/en_play.test.mjs`（`en_sync_keeps_title` を書きかえ）、`en/index.html`・`sw.js`（生成）

**Interfaces:**
- Produces: `BADGES.titleLabel(ja: string) -> string` — 日本語のページでは `ja` をそのまま返す。英語のページでは、`ja` がカタログの称号（`titlesOf`）のどれかと同じならその英語（`T(ja)`）、ちがえば `''`。
- profile.js の `cardHTML`: 称号の行は `const tl = EN ? window.BADGES?.titleLabel?.(card.title) ?? '' : card.title;` が空でないときだけ `T('〈{title}〉', { title: esc(tl) })`。日本語版は今と1文字も同じ。`I18N.hide.has('title')` の分岐は消す。
- 同期（`want`）は今のまま `B.title()`（日本語）を送る。英語版も badges.js と rpg.js を読むので、`badges`・`badgesTotal` は日本語版と同じ数になる。

- [ ] **Step 1: テスト**
  - e2e `en_card_title_known`: 偽 DB の `チコ` の称号を `ドリルの鬼` にしてランキングから窓を開く → 英語の称号（en-badges の値）が `“…”` で出る、`jaLeft` が空。
  - e2e `en_card_title_unknown`: 称号が `旅人`（カタログに無い）・`<b>x</b>` のとき、英語版は称号の行が無い。日本語版は今のまま `〈旅人〉`・エスケープされた `〈<b>x</b>〉` が出る。
  - e2e `en_own_card_title`: 英語で称号をつけたあと自分のプロフィールのカードに英語の称号。
  - e2e `en_sync_sends_ja_title`（PR6 の `en_sync_keeps_title` を書きかえ）: 英語で称号をつけると、偽 DB に届く `profile_set` の `p_title` が日本語（`ドリルの新人`）、`p_badges`・`p_badges_total` が数。DB の称号も日本語。
  - e2e `en_no_sync_flap`: 日本語版で同期が終わった状態（`sent` が今の値）で英語版を開き、少し待っても `profile_set` が呼ばれない。続けて日本語版に戻っても呼ばれない。
  - unit `hide_rpg` を直す: 英語の `hide` は `rpg` だけ（`title` が無い）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作る順番どおりに作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `en_play`・`profile`・`ranking`・`daily`・`en_badges`。
- [ ] **Step 5: コミット** — `英語版: ほかの人の称号を英語で出す（保存とサーバーは日本語のまま）`

### Task 16: 英語の遊び方にバッジと豆知識を足す（en/howto.html）

**Files:**
- Modify: `en/howto.html`、`tests/unit/pages.test.mjs`（`en_howto_only_available`）

**Interfaces:**
- 足す節: `<h2 id="badges">Badges</h2>`（日本語の howto の「バッジ」の節を訳す。ただし冒険の話は PR8 まで書かない: `Do certain things in the quiz and the Daily Puzzle to earn badges. Each badge also gives you a title. Some are “secret badges” that don’t tell you how to get them.` の形）。位置は日本語と同じ（`book` と `profile` のあいだ）。
- `book` の節の文に、国を選ぶと出るものとして `fun facts` を足す（日本語の「その国のちょっとした話」の訳）。ホームのアイコンの列の文に `Badges` を足す（日本語の howto と同じ並び）。description も同じ並びで `badges` を足す。

- [ ] **Step 1: テスト** — `en_howto_only_available` を直す: `Adventure` と `coins` が無い（PR8）。`Badges`・`Title`（か `title`）・`fun facts` がある。`<h2 id>` が `['start', 'modes', 'kinds', 'daily', 'dojo', 'book', 'badges', 'profile', 'app', 'embed', 'faq']`。`en_pages_no_japanese` もそのまま通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 書く。**
- [ ] **Step 4: 通るのを見る。コミット** — `英語版: 遊び方にバッジと豆知識を足す`

（コントローラーが別の AI に、日本語の howto と並べて自然さ・ずれを見させる。）

### Task 17: 英語版を全部まわるテストを広げる

**Files:**
- Modify: `tests/e2e/en_walk.test.mjs`

- [ ] **Step 1: テストを直す**（PHONE と PC、`seed` 固定、プロフィール `Chiko`、偽 DB に `チコ`（称号 `ドリルの鬼`）の記録）
  - `UNTRANSLATED` を `['#home-rpg', '#rpg-chip', '#pcoin', '#set-rpg']` に（`#home-badges`・`.trivia` を外す）。
  - `en_walk` に足す: 練習の答えの豆知識 → 結果のバッジのパネル（`QUIET_BADGES` をやめて、1つ取れるセーブで）→ ホームの称号の札 → バッジ画面（すべての分類・詳細・ひみつのバッジ・称号えらび）→ 図鑑の小窓の豆知識 → `チコ` のプロフィールの窓（英語の称号）→ 英語の国のページ `en/country/fr.html` の Fun facts。各画面で `jaLeft` が空、ページエラーなし、`[i18n]` の warn なし。
  - `en_links_stay_english`: バッジの［Practice →］（`Practice` の訳）でモード選択へ行っても `/en/` のまま。
  - `ja_unchanged` はそのまま通る。
- [ ] **Step 2: 走らせる** — `cd tests/e2e && node --test --test-concurrency=1 en_walk.test.mjs`（落ちたら持ち主のタスクの直しとして入れる）
- [ ] **Step 3: コミット** — `英語版: 全画面のテストにバッジ・称号・豆知識を足す`

### Task 18: PR7 を出す

- [ ] 作る順番どおりに全部作り直し、差分が出ないこと: `node tools/trivia_en.mjs build && node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs && git status --short`（何も出ない）。`python3 tools/make_trivia.py` でも trivia.js が変わらない。
- [ ] `node --test tests/unit/` 全部、`cd tests/e2e && node --test --test-concurrency=1 *.test.mjs` 全部（日本語版の今のテストも全部）。`bash tests/sql/run.sh` も通る（SQL は変えていないことの確かめ）。
- [ ] `?v=` を origin/main と比べて、変えたファイルが全部 +1（`cache_bust`）。main が進んでいたら取りこんで合わせ直す。
- [ ] 英語の画面のスクリーンショット（390px と 1280×800）: 答えの豆知識（いちばん長いもの）・図鑑の小窓・バッジ画面（全部の分類）・詳細・称号えらび・結果のバッジのパネル・ホームの称号の札・ほかの人のプロフィールの窓・`en/country/fr.html` を `/mnt/project-files/country-drill-next5-20261029/en-pr7/` に。文字のあふれを目で見る。
- [ ] 豆知識の最後の見直し: コントローラーが別の新しい AI に、779件から各かたまり10件ずつ（80件）を無作為に選んで `faith` の形で見させる。1件でも「足した／変えた」が出たら、そのかたまりを Task 2〜9 の Step 3 からやり直す。
- [ ] 辞書全部の最後の見直し（用語集とのずれ・同じ日本語に別の訳が無いか・冒険の語）。
- [ ] push・PR。本文の頭に「**SQL はいらない**（称号は今までどおり日本語で保存。英語にするのは画面だけ）」と、「英語で遊んでもコインとバッジが増える。コインは冒険の画面といっしょに PR8 で英語の画面に出る」と書く。豆知識の確かめの記録（`trivia-b1.md`〜`trivia-b8.md`）の件数のまとめ（直した数・種類）も書く。チコの OK でマージ。

---

## 決めたこと（ルーリング）

1. **SQL は要らない**。称号の保存（localStorage のキー・サーバーの `profiles.title`）は日本語のまま。`rpg_players` には称号の列が無い。英語にするのは表示だけ。
2. **豆知識の英訳は `data/en/trivia_facts.json` に、日本語と同じ並び・id `<a>-<n>`・日本語の写し `ja` つきで置く**（PR5 の `data/en/flag_meanings.json` と同じ並べ方に、ずれ止めの id と `ja` を足した形）。英語のページは `trivia-en.js` を `window.TRIVIA` として読むので、本編の表示コードと辞書（`T()`）は通さない（779件を辞書に入れない）。
3. **英訳は8つのかたまり（約100件、国の途中で切らない）で、訳す AI と確かめる AI 2つを全部別にする**。確かめ1（中身のずれ）は日本語と英語だけを見る（note を見せない。note にしか無い事実を「正しい」と通さないため）。確かめ2（英語の自然さ）は英語だけを見る。確かめ2の直しは、もう一度確かめ1を通す。
4. **機械で見られるずれ（数・弱め方・最上級・首都の語・問いの形）はテストで止め、テストをゆるめて逃げない**。数の例外は理由つきで `NUM_OK` に書く。
5. **badges.js のコアは T を呼ばず、日本語はデータ、英語は表示で**。条件の文は「型の文＋数」にして、日本語の文は今と1文字も変えない（admin.html も変えない）。
6. **英語のページでも rpg.js を読み、画面は作らない**（`I18N.hide` の `'rpg'`）。これで英語で遊んでもコインとバッジのコインがたまり、冒険のバッジもふくめてバッジの数が日本語版と同じになる（数がちがうと、言語を行き来するたびにプロフィールの同期が数を書きかえ合う）。冒険の画面・入口・コインの表示は PR8。
7. **冒険の分類のバッジも英語版に出す**（数をそろえるため。条件の冒険の語は Global Constraints の「冒険の語」で決め、PR8 もそれを使う）。遊び方のページは PR8 まで冒険を書かない。
8. **ほかの人の称号は、カタログにある日本語の称号だけ英語で出す**。無い文字は英語版では出さない（訳の無い日本語を出さないため）。日本語版は今のまま全部出す。
9. **豆知識の英語の見出しは `Fun facts`**。国のページの title・description は変えない（PR5 のまま）。
10. **バッジの共有の文に `#FlagMaster` は付けない**（日本語の共有の文にもタグが無いので、そのまま訳す）。URL は英語版。

## チコに決めてほしいこと

それぞれ、おすすめと理由つき。全部おすすめでよければ「OK」だけで進める。

1. **英語で遊んだときのコイン**
   - おすすめ: PR7 から英語でもコインがたまる（画面には出さない）。コインの数・結果のコインの欄・冒険の入口は PR8 で英語にして出す。
   - 理由: 英語で遊んだ分を取りこぼさない。冒険の画面はまだ英語が無いので、コインだけ見せても使い道が出せない。PR7 で数の表示まで訳すと、冒険の文（rpg.js 約1,000行）の一部を先に訳すことになり PR8 と分かれてしまう。
2. **英語版のバッジ画面に「Adventure」の分類（冒険のバッジ12個）を出すか**
   - おすすめ: 出す（英語では取れないが、日本語版で取ったものは見える）。
   - 理由: 出さないと英語版と日本語版でバッジの全部の数がちがい、プロフィールの「バッジ ○個（全○個中）」が言語を行き来するたびに書きかわる。PR8 で冒険も英語になれば英語でも取れる。
3. **ほかの人の称号が、今のバッジの一覧に無い文字のとき**
   - おすすめ: 英語版では称号の行を出さない（日本語版は今のまま出す）。
   - 理由: 英語の画面に訳の無い日本語を出さない決まりを守れる。ふつうに遊んだ人の称号は全部一覧にあるので、困る人はほとんどいない。
4. **豆知識の英語の呼び名**
   - おすすめ: `Fun facts`。
   - 理由: 英語のゲームや子ども向けのサイトで「ちょっとした話」の意味でいちばんよく使われ、やわらかい。`Trivia` はクイズの問題の意味にも取られやすい（このサイトはクイズなので、豆知識が問題に見えてしまう）。
5. **豆知識の「日本とくらべる文」（例: 日本の岐阜県と同じくらいの広さ）**
   - おすすめ: そのまま訳す（`about the same size as Gifu Prefecture in Japan`）。
   - 理由: 確かめ済みの事実を変えずに訳す決まり（設計書）どおり。英語圏の物に置きかえると、新しい事実を作って確かめ直すことになる。
6. **バッジの条件に出る冒険の語**（Global Constraints の一覧: Traveler・battle・boss・the Map Eater・ally・Friendship・Wanted posters など）
   - おすすめ: この一覧で決めて、PR8 も同じ語を使う。
   - 理由: バッジの条件が先に英語になるので、ここで決めないと PR8 で語がずれる。

## リスク

- **英訳のまちがいが見落とされる**: 機械のテストは数・弱め方・最上級・首都の語しか見ない。かたまりごとに別々の AI 2つで見て、最後に80件を無作為に見直す。それでも残りうるので、PR の本文に確かめ方を書き、チコが気づいたら1件ずつ直せる形（id で引ける）にしてある。
- **日本語の豆知識をあとで直すと、英訳が古いままになる**: `ja` の写しと `trivia_en_prefix_aligned`／`trivia_en_complete` が落ちて知らせる（直すときは英訳もいっしょに）。
- **rpg.js を英語で読むことで、日本語のトーストや冒険の入口が英語の画面に出る**: 画面を作る所を全部 `HEADLESS` で止め、`en_coins_headless` と en_walk の `jaLeft` で見る。rpg.js の取り残しのテストは PR8 まで見ない（`NOT_YET`）ので、ここが一番の見張り所。
- **カタログの書きかえで日本語の条件の文が変わる**: `catalog_desc_same` と今の e2e・admin のテストで止める。
- **英語の称号が長く、ホームの札・トーストがくずれる**: 24字の上限のテストと `en_badges_fit`、スクリーンショットで見る。
- **`?v=` の数**: PR を出すまでに main が進むと合わなくなる。Task 18 で合わせ直す。
