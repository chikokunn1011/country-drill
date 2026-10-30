# 改善5案 PR6（英語版: タイムアタック・ランキング・今日の難問・プロフィール・れんぞく日数・シェア・OGP・英語の NG ワード）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 英語版 Flag Master で、タイムアタック・ランキング（Leaderboard）・今日の難問（Daily Puzzle）・プロフィール（引き継ぎコードも）・れんぞく日数・シェアの文と画像・英語の OGP を使えるようにし、ニックネームの NG ワードに英語の悪い言葉を足す（サーバーの `ng_words()` も同じ一覧にする。本番は SQL Editor で1回）。

**Architecture:** PR5 のしくみをそのまま使う。`ranking.js`・`profile.js`・`share-card.js`・`daily.js`・`streak.js` の画面の文を `T()` で包み、辞書 `i18n/en-rank.js`（足す）・`en-profile.js`・`en-daily.js`（新しい）に訳を書き、`tools/make_en.mjs` の `EN_SKIP` からこの5つを外す。`I18N.hide` から `'ta'` を外す（代わりに PR7 まで `'title'`＝他人の称号を隠す）。日本時間の区切り（今日の難問の0時・タイムアタックの月曜0時・れんぞく日数の0時）は、英語の画面でだけ `I18N.localOf()` で「その人の時間で何時か」を添える。データのキーと保存値、ランキングの表は日本語版と同じもの。NG ワードは `ranking.js` の `NG_WORDS`・`supabase/schema.sql` の `ng_words()`・本番用の `supabase/pr6_ng_words_en.sql` の3か所を同じ一覧にし、テストで一致を見る。

**Tech Stack:** 素の JS・Node（node:test・node:vm）・Playwright（tests/e2e、`--test-concurrency=1`）・PostgreSQL 16（`bash tests/sql/run.sh`）。

**Spec:** `docs/superpowers/specs/2026-10-29-next5-design.md`（「D3 英語版」。とくに「日付と時刻」「ランキング」「NG ワード」「記録」「分け方」の PR6 の行）。形と決まりは PR5 の計画 `docs/superpowers/plans/2026-10-30-next5-pr5-en-base.md`（Global Constraints とルーリング 1〜17）を引きつぐ。

**土台のブランチ:** PR5（#45）がマージされた origin/main（80f0083）から `pr6-work` を切る。

## Global Constraints

- PR5 の Global Constraints は全部そのまま有効（首都の問題を作らない・Flag Master／`#FlagMaster`・アメリカ式のつづり・データのキーは日本語のまま・`T()` の決まり・`JA_RE`・`lang="ja"` だけ日本語可・localStorage のキーを増やさない・生成物はコミット・CSS の色は今の変数だけ・英訳は事実を足さない・日本語版の今のテストは全部そのまま通る）。
- **作る順番**: `node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs`。js・辞書・index.html を変えたタスクは毎回この順で作り直してからコミット。
- **`?v=`**: 変えた js/css と辞書は「そのとき origin/main にある数 +1」（`cache_bust` テストが見る）。今の main では `i18n.js` 1→2・`ranking.js` 5→6・`profile.js` 7→8・`share-card.js` 1→2・`daily.js` 5→6・`streak.js` 2→3・`i18n/en-rank.js` 1→2。新しい辞書 `i18n/en-profile.js`・`i18n/en-daily.js` は1行目 `// v=1`。PR を出す前に main が進んでいたら、その数 +1 に合わせ直す。同じ PR の中で何度変えても +1 は1回だけ。
- **辞書の置き場所**: `ranking.js`・タイムアタック・ランキング・シェア → `i18n/en-rank.js`、`profile.js` → `i18n/en-profile.js`、`daily.js`・`streak.js` → `i18n/en-daily.js`、HTML の文 → `i18n/en-html.js`（make_en だけが読む）。i18n.js は文を持たない（`localOf` は時刻だけを返し、添え書きの文は呼ぶ側の辞書）。`EN_DICTS['index.html']` に `'en-profile'`・`'en-daily'` を足す。
- **数の入る文**は `T('…{n}…', { n })` で、英語の単数・複数は `{ one, other }`。日付・時刻の英語の形は `Intl`（`I18N.locale`）で作る。
- **用語集**（PR5 のものに足す。辞書・ページで同じ語を使う。文は sentence case、並べるときは serial comma、アポストロフィは辞書と同じ `’`）: ランキング `Leaderboard`／今日の難問 `Daily Puzzle`／タイムアタック `Time Attack`／練習 `Practice`／挑戦 `Challenge`／図鑑 `Gallery`／似た国旗 `Look-alike flags`／モード選択へ `Change mode`／プロフィール `Profile`／ニックネーム `Nickname`／歴代 `All time`／今週 `This week`／今日 `Today`／昨日 `Yesterday`／自己ベスト `Personal best`／ランキングに載せる `Post to the leaderboard`／結果をシェア `Share result`／引き継ぎ `Move to a new device`／引き継ぎコード `Transfer code`／公開 `Public`／非公開 `Private`／称号 `Title`／かざり `Decorations`／れんぞく日数 `Day streak`（`{n}-day streak`）／お休み券 `Rest pass`／全問正解 `Perfect`／日本時間 `Japan time`／冒険 `Adventure`／英雄の塔 `Tower of Heroes`／ダンジョン `Dungeon`／バッジ `Badges`（冒険・塔・バッジの語は PR7・PR8 もこれを使う）。
- **日本時間の区切りは変えない**: 今日の難問は世界中で日本時間0時に切りかわり、ランキングは日本語版と英語版で1つ。タイムアタックの「今週」は日本時間の月曜0時から。日付の表示（ランキングの `10/30`・今日の難問の日付・はじめた日）は日本時間の日付のまま、英語の形にする。**英語の画面でだけ**、区切りの時刻に「その人の時間で何時か」を添える（ルーリング 15）。その人の時刻が日本時間と同じ（UTC+9）なら添えない。
- **ほかの人が入れた文字（ニックネーム）は訳さない**。表に出すときは `data-ugc` を付けた要素に入れる（`jaLeft` が飛ばす）。他人の称号（日本語のバッジの称号）は PR7 まで英語版では出さない（`I18N.hide.has('title')`）。
- **NG ワード**は NFKC＋小文字にした名前への部分一致（今の決まりのまま）。英語の語は、ふつうの英単語・名前に部分一致で当たらないものだけ（短い語 `ass`・`cock`・`cum`・`anal`・`dick`・`jap`・`spic`・`coon`・`nazi`・`rape`・`rapist` は入れない）。一覧は `ranking.js`・`supabase/schema.sql`・`supabase/pr6_ng_words_en.sql` の3か所で文字まで同じ。
- **本番の DB の変更はこの PR で1回だけ**: `ng_words()` の中身を入れかえるだけ（表・列・ほかの関数は変えない）。チコが SQL Editor で `/mnt/project-files/country-drill-next5-20261029/pr6-ng-words-en.sql` を Run する。新しい js は今の DB のままでも全部動く（手元のチェックのほうが先に英語の語をはじくだけ）。
- **英語の画面に出す場所の URL** は `I18N.page()` か `location.pathname` から作る（`<base href="../">` のため、`'privacy.html'` のような相対の文字は日本語版を指す）。

## Review Focus

1. **日本時間ではない人の時刻**（ニューヨーク・コルカタ・東京・ソウル、夏時間の切りかわりの週）: 今日の難問の0時・0時30分、タイムアタックの月曜0時、れんぞく日数の0時が、その人の時刻で正しく出る（ニューヨークで 2026-10-30 なら今日の難問は `11:00 AM`、今週の区切りは夏時間が終わったあとの `Sunday 10:00 AM`）。東京・ソウルでは添えない。Task 1 の `local_of_*` と Task 5・7 の e2e（`timezoneId`）。
2. **ほかの人の日本語の名前・称号が英語のランキングとプロフィールの窓に出る**: 名前はそのまま（`data-ugc`）、称号は出さない、ほかに日本語が出ない。Task 4 の `en_card_other_ja`・Task 5 の `en_leaderboard_ja_names`・Task 7 の `en_daily_board`。
3. **英語版でプロフィールの同期が走っても、日本語版でつけた称号・バッジの数を消さない**（英語版は badges.js を読まないので `BADGES` が無い）: サーバーへ送る `profile_set` に `p_title`・`p_badges` が null のまま。Task 4 の `en_sync_keeps_title`。
4. **NG ワードの取りちがえ**: `Therapist`・`Peacock`・`Hancock`・`Cocktail`・`Analyst`・`Document`・`Japan`・`Grape`・`Class`・`Spice`・`Raccoon`・`Dickens` は手元でもサーバーでも通り、英語の悪い言葉は全角・大文字でもはじかれる。3か所の一覧がずれない。Task 3。
5. **英語で遊んだ記録が日本語版に出る**（同じ端末）: 英語で載せたタイムアタックが日本語版のランキングに、英語の今日の難問の結果が日本語版の今日の難問に、英語で遊んだ日が日本語版のれんぞく日数に出る。逆に、日本語版でタイムアタックを選んだまま英語版を開くとタイムアタックのまま。Task 5・7・8 の `*_shared`。

---

### Task 1: 時刻の添え書き・ニックネームの目印・字句の読み方の追加

**Files:**
- Modify: `i18n.js`（`?v=` +1。`I18N.localOf`・`I18N.dayLabel`・`I18N.hide`）、`tests/e2e/en_walk.test.mjs`（`UNTRANSLATED` から `#kinds [data-k="ta"]`）、`tools/i18n_scan.mjs`（`// i18n-ignore:start`〜`// i18n-ignore:end`）、`tests/e2e/helpers.mjs`（`openApp` に `timezoneId`、`jaLeft` が `[data-ugc]` の中を飛ばす）、`index.html`（`i18n.js?v=`）、`embed.html`（`i18n.js?v=`）
- Create: `tests/unit/i18n-load.mjs`（vm に i18n.js を先に読む小さな部品）
- Test: `tests/unit/i18n.test.mjs`、`tests/e2e/en.test.mjs`

**Interfaces:**
- Produces（`i18n.js`）:
  - `I18N.localOf(h: number, m: number, { weekly?: boolean, now?: Date, tz?: string } = {}) -> string`: 次に来る日本時間の `h:m`（`weekly` なら次の月曜の `h:m`）を、その人の時間帯（`tz` を渡せばそれ。テスト用）で `Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', weekday: weekly ? 'long' : undefined })` にした文字列（`'11:00 AM'`・`'Sunday 10:00 AM'`）。日本語のページと、その時刻の時間帯のずれが +9:00 のときは `''`。
  - `I18N.dayLabel(day: 'YYYY-MM-DD') -> string`: 英語は `'Oct 30'`（`month: 'short', day: 'numeric', timeZone: 'UTC'`）、日本語は今の `'10月30日'`（今の daily.js の `md` と同じ文字）。
  - `I18N.hide`: 英語は `new Set(['title'])`（PR7 で外す）、日本語は空。
- Produces（`tools/i18n_scan.mjs`）: `scanJs` の結果に `ignore: boolean`（`// i18n-ignore:start`〜`// i18n-ignore:end` の中。画面に出さない日本語＝NG ワードの一覧だけに使う）。`no_ja_outside_T` は `wrapped || exempt || data || ignore` を通す。`dict_has_all_keys` は ignore の文字を辞書に求めない。
- Produces（`tests/unit/i18n-load.mjs`）: `export function ctxWithI18n(extra = {}) -> vm.Context`（`window` を globalThis にし、i18n.js を読んだ vm の文脈。日本語なので T はそのまま返す）。ranking・share-card・streak の unit テストはこれで文脈を作る。
- Produces（helpers）: `openApp(browser, { timezoneId })`（`newContext({ timezoneId })` に渡す。省略時は今のまま）。`jaLeft` は `el.closest('[lang="ja"], [data-ugc]')` の中を数えない。

- [ ] **Step 1: 失敗するテストを書く**（`tests/unit/i18n.test.mjs`）
  - `local_of_new_york`: 英語の vm で `I18N.localOf(0, 0, { now: new Date('2026-10-30T00:00:00Z'), tz: 'America/New_York' })` が `'11:00 AM'`、`{ weekly: true, … }` が `'Sunday 10:00 AM'`（11/1 に夏時間が終わる）、`localOf(0, 30, …)` が `'11:30 AM'`。
  - `local_of_other_zones`: `tz: 'Asia/Kolkata'` で `'8:30 PM'`、`'Asia/Tokyo'`・`'Asia/Seoul'` で `''`。日本語の vm では `tz` に関係なく `''`。
  - `day_label`: 英語 `I18N.dayLabel('2026-10-30') === 'Oct 30'`、日本語 `'10月30日'`。
  - `hide_title_only`: 英語で `I18N.hide.has('ta') === false`・`has('title') === true`（PR5 の `hide` のテストを書きかえる）。
  - `scan_fixtures` に足す: `// i18n-ignore:start` の中の `'死ね'` は `ignore: true`、外は false。
  - e2e `en.test.mjs` の `en_saved_ta_shows_practice` を `en_saved_ta_kept` に書きかえる: `setup.kind = 'ta'` で英語版を開くと Time Attack のカードがあって選ばれ、スタートした `drill:start` の `kind` が `ta`。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/i18n.test.mjs`
- [ ] **Step 3: 実装** — i18n.js・i18n_scan.mjs・i18n-load.mjs・helpers.mjs。`localOf` の「次に来る」は `now` から日本時間の日付を出し、その日の `h:m` JST（`Date.UTC(y, mo, d, h - 9, m)`）が `now` 以前なら1日（weekly は月曜まで）進める。
- [ ] **Step 4: 通るのを見る** — `node --test tests/unit/`、`cd tests/e2e && node --test --test-concurrency=1 en.test.mjs lang.test.mjs en_walk.test.mjs`（en_walk の `UNTRANSLATED` からタイムアタックのカードを外す）。
- [ ] **Step 5: 作り直してコミット** — 作る順番どおり。`英語版: その人の時間で何時かを出す I18N.localOf、ニックネームの目印 data-ugc`

### Task 2: ranking.js の文を英語に（辞書 en-rank）

**Files:**
- Modify: `ranking.js`（`?v=` +1）、`i18n/en-rank.js`（`?v=` +1）、`index.html`（`ranking.js?v=`）、`tests/unit/ranking.test.mjs`（`ctxWithI18n` で読む）、`tests/unit/i18n.test.mjs`（`ranking.js` を `NOT_YET` から `COVER` へ）

**Interfaces:**
- `MESSAGES` は `// i18n-data` で囲み、`message(reason)` が `T(MESSAGES[reason] ?? MESSAGES.network)` を返す。`REGION_KEY` も data（キーの地域名は辞書に既にある）。`NG_WORDS` は Task 3 で `// i18n-ignore` に入れる（この Task では `// i18n-ignore` で囲むだけ）。
- `formatTime(ms)` は index.html の代わりの `RANKING` と同じキー `T('{m}分{s}.{c}秒', …)`・`T('{s}.{c}秒', …)`（英語 `1:01.23`・`12.34s`）。
- `message` の英語（辞書に書く文。そのまま使う）: `bad_name` `Nicknames must be 1–12 characters`／`ng_name` `That nickname can’t be used`／`too_fast` `That time is too fast to accept`／`too_slow` `That time is too long to accept`／`too_soon` `Please wait a moment and send it again`／`bad_board` `These settings can’t go on the leaderboard`／`bad_record` `This record can’t go on the leaderboard`／`name_taken` `That nickname is already taken`／`already` `Already posted`／`not_found` `Profile not found`／`bad_deco` `Those decoration flags aren’t valid`／`bad_token` `This device’s profile key isn’t valid`／`bad_day` `The day has changed, so this record can’t be posted`／`bad_code` `That code is wrong or has expired`／`too_big` `Your data is too large to transfer`／`old_version` `A new version is out. Please reload the page`／`network` `Couldn’t connect to the leaderboard`。

- [ ] **Step 1: テスト**（`ranking.test.mjs`）: 今ある `message`・`formatTime` のテストは日本語のまま通る。足す `message_en`・`format_time_en`: 英語の vm（`document.documentElement.lang = 'en'` と en-rank.js・en-core.js を読む）で `message('ng_name') === 'That nickname can’t be used'`、`message('???')` が network の文、`formatTime(12345) === '12.34s'`、`formatTime(61234) === '1:01.23'`。i18n.test の `no_ja_outside_T`・`dict_*` が ranking.js をふくめて通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作り直し。
- [ ] **Step 4: 通るのを見る** — `node --test tests/unit/`、e2e `ranking.test.mjs`・`timeattack.test.mjs`・`submit.test.mjs`（日本語版はそのまま）。
- [ ] **Step 5: コミット** — `英語版: ランキングの返事の文と時間の表示を英語に（ranking.js）`

### Task 3: 英語の NG ワード（手元・schema.sql・本番用 SQL）

**Files:**
- Modify: `ranking.js`（`NG_WORDS`）、`supabase/schema.sql`（`ng_words()` の中身と、上の「本番に流すとき」の説明に1行）、`tests/sql/run.sh`（schema.sql の後に `supabase/pr6_ng_words_en.sql` を2回流す）、`tests/sql/test_schema.sql`、`tests/unit/ranking.test.mjs`
- Create: `supabase/pr6_ng_words_en.sql`、`/mnt/project-files/country-drill-next5-20261029/pr6-ng-words-en.sql`（中身は `supabase/pr6_ng_words_en.sql` と同じ。コミットしない）

**Interfaces:**
- 一覧（今の18語のあとに、この順で29語。どれも NFKC＋小文字の形）: `'nigger', 'nigga', 'faggot', 'cunt', 'whore', 'slut', 'bastard', 'asshole', 'wanker', 'twat', 'bollocks', 'retard', 'porn', 'penis', 'vagina', 'pussy', 'dildo', 'blowjob', 'jizz', 'hentai', 'milf', 'boobs', 'piss', 'hitler', 'tranny', 'chink', 'kike', 'gook', 'moderator'`（合わせて47語）。
- `supabase/pr6_ng_words_en.sql` の形（SQL Editor に貼って1回 Run。何度流しても同じ）:
  1. 頭のコメント（日本語、チコ向け）: 何をするか（英語の NG ワードを足すだけ。表は変えない・消さない）・流し方（SQL Editor に全部貼って Run）・流したあと最後の表に出た名前はそのまま残る（気になれば管理ページで名前を変える）。
  2. `create or replace function ng_words() …`（schema.sql と1文字も同じブロック）と `revoke all on function ng_words() from public, anon, authenticated;`
  3. `do $$ begin assert array_length(ng_words(), 1) = 47, 'ng_words の数がちがう'; end $$;`
  4. 読むだけの確かめ: `profiles`（nickname・title）・`scores`・`daily_scores`・`rpg_players` の nickname のうち新しい一覧に当たるものを `union all` で1つの表にして出す（`表の名前, nickname, title`）。行が無ければ何も出ない。
- schema.sql・pr6 の SQL・ranking.js の一覧は、`select array[ … ]` の中身と `[ … ]` の中身を引用符の文字列の並びとして読んだとき同じ。

- [ ] **Step 1: 失敗するテストを書く**
  - unit（`ranking.test.mjs`）`ng_lists_identical`: ranking.js の `NG_WORDS`・schema.sql の `ng_words()`・`supabase/pr6_ng_words_en.sql` の `ng_words()` が同じ並び・47語。pr6 の SQL の `create or replace function ng_words()` から `$$;` までが schema.sql の同じ部分と文字まで同じ。
  - unit `check_name_en_words`: `checkName('Moderator1')`・`checkName('ＰＯＲＮ')`・`checkName('xHentaix')` が `ng_name`。
  - unit `check_name_no_false_positive`: `Therapist Peacock Hancock Cocktail Analyst Document Japan Grape Class Glass Spice Raccoon Dickens Assassin Penguin Cucumber Arsenal Titan` が全部 ok。
  - unit `badge_titles_pass`: badges.js の全部の称号（`tests/unit/badges.test.mjs` と同じ読み方で定義を読む）が `checkName` の NG に当たらない（称号も `profile_set` で ng_words を通るため）。
  - SQL（`test_schema.sql` に足す）`ng_words_en`: `profile_create(…, 'Moderator1')`・`profile_rename(…, 'ＰＯＲＮ')`・`submit_score2` の名前 `hentai` が `ng_name`、`profile_set(t, null, 'Hitler', …)` が `ng_name`、`profile_create(…, 'Therapist')`・`'Peacock'` が ok、`array_length(ng_words(), 1) = 47`。
- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/ranking.test.mjs`、`bash tests/sql/run.sh`
- [ ] **Step 3: 実装** — 3か所の一覧、run.sh の2回流し、pr6 の SQL。`NG_WORDS` は `// i18n-ignore:start`〜`end` の中。
- [ ] **Step 4: 通るのを見る** — `node --test tests/unit/`、`bash tests/sql/run.sh`（全部 ok）。pr6 の SQL を `/mnt/project-files/country-drill-next5-20261029/pr6-ng-words-en.sql` に写し、`cmp` で同じことを見る。
- [ ] **Step 5: コミット** — `NG ワードに英語の悪い言葉を足す（手元と schema.sql、本番用の supabase/pr6_ng_words_en.sql）`

### Task 4: プロフィールを英語に（辞書 en-profile）と、ranking.js・profile.js を英語のページで読む

**Files:**
- Modify: `profile.js`（`?v=` +1）、`tools/make_en.mjs`（`EN_SKIP` から `ranking.js`・`profile.js` を外す、`EN_DICTS['index.html']` に `'en-profile'`）、`index.html`（`profile.js?v=`、ランキングの表の名前の代わり `esc(r.nickname)` を `<span data-ugc>` に）、`en/index.html`（生成）、`tests/unit/i18n.test.mjs`（`profile.js` を COVER へ）
- Create: `i18n/en-profile.js`、`tests/e2e/en_play.test.mjs`
- Test: `tests/e2e/en.test.mjs`（`en_home` の入口の一覧、`en_no_ranking`→`en_ranking_hash`）、`tests/e2e/en_walk.test.mjs`（`UNTRANSLATED` から `#home-rank`・`#home-profile`）

**Interfaces:**
- 名前は `nameHTML(r)` が作る要素と、カードの `.pf-card-name b`、プロフィール画面の自分の名前に `data-ugc`。
- `NAME_NOTE` のリンクは `I18N.page('privacy.html')`。英語の文: `Don’t use your real name or your school’s name (<a …>Privacy policy</a>).`
- 国名（かざりの alt・title）は `cName`。TA の条件の行 `boardLabel(board)` は `MODES` の label（T 済み）・`T(地域)`・`T('{n}問', { n })` を `' · '` でつなぐ（`Flag → Name · Asia · 10 questions`）。`REGION_NAME` の表は data。
- カード（`cardHTML`）: 称号の行は `!I18N.hide.has('title')` のときだけ。英語の行: `Badges: {n} of {t}`／`Adventure: Lv {lv} · Dungeons {d}/{all}`／`Tower of Heroes: floor {n}`（`{ one, other }` は要らない）／`Time Attack`／`{time} (#{rank})`／`Daily Puzzle: played {p} {times}, {q} perfect`（`{p}` に `{ one: 'time', other: 'times' }` が要るので `T('今日の難問 参加{p}回（うち全問正解{q}回）', { n: p, p, q })` を `{ one: 'Daily Puzzle: played once, {q} perfect', other: 'Daily Puzzle: played {p} times, {q} perfect' }`）／`Started {date}`（`date` は日本時間の日付を `Intl` の `{ year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Tokyo' }`。日本語は今の `2026/10/28` のまま）／非公開 `This profile is private`。
- 引き継ぎコードの期限（今は日本時間の `10/29 16:05`）: 英語は**その人の時間**で `Intl` の `{ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }`（`Oct 29, 4:05 PM`）。日本語は今のまま。
- 英語版では `window.BADGES` が無いので、同期は `title`・`badges`・`badgesTotal` を送らない（今のコードのまま。変えない）。

- [ ] **Step 1: テスト**（`en_play.test.mjs`、`path: 'en/'`、偽 Supabase）
  - `en_home_entries`: ホームに `#home-rank`・`#home-profile` が見え、`#home-rpg`・`#home-badges` は見えない（`#home-daily` は Task 7 でこのテストに足す）。`jaLeft` が空。390px と PC でホームが横にはみ出さない。
  - `en_profile_create`: プロフィール画面で名前 `Chiko` を入れて作る → 画面・トースト・`jaLeft` が空。`Moderator1` は `That nickname can’t be used`。注意書きのリンクが `/en/privacy.html`。
  - `en_profile_transfer`: 引き継ぎで「預ける」→ コードと期限が英語（期限に `AM` か `PM`）。別の文脈で英語版から受け取る → 名前が移る。
  - `en_card_other_ja`: 偽 DB に名前 `チコ`・称号 `旅人` の公開プロフィールと TA の記録・冒険の記録を入れ、ランキングの行を押して窓を開く → 名前 `チコ` は見え（`data-ugc` の中）、`旅人` は出ず、`jaLeft` が空、`Adventure: Lv` と `Time Attack` の行がある。
  - `en_sync_keeps_title`: 日本語版で称号を送ったあとのプロフィールで英語版を開き、同期が走る（`scheduleSync` の後）→ 偽 DB の `profile_set` に届いた `p_title`・`p_badges` が null、DB の称号は `旅人` のまま。
  - `en.test.mjs` の `en_ranking_hash`（PR5 の `en_no_ranking` を書きかえ）: `en/#ranking` でランキングが開き、`jaLeft` が空。
  - `en.test.mjs` の `en_home` を直す: 見えない入口は `#home-rpg`・`#home-badges` と、まだ読まない `#home-daily`（Task 7 で出る）。
- [ ] **Step 2: 落ちるのを見る** — `cd tests/e2e && node --test --test-concurrency=1 en_play.test.mjs en.test.mjs`
- [ ] **Step 3: 実装**（profile.js は約70か所）→ 作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `profile.test.mjs`・`ranking.test.mjs`・`en.test.mjs`・`en_play.test.mjs`・`lang.test.mjs`・`en_walk.test.mjs`。
- [ ] **Step 5: コミット** — `英語版: プロフィールと引き継ぎを英語に（profile.js・ranking.js を英語のページでも読む）`

### Task 5: タイムアタックとランキング（Leaderboard）

**Files:**
- Modify: `index.html`（ランキングの節: `#rk-local` の行・`jstDay` の英語の形・`langHref` に `ranking`→`#ranking`、`daily`→`#daily`）、`i18n/en-rank.js`、`i18n/en-html.js`、`en/index.html`（生成）
- Test: `tests/e2e/en_play.test.mjs`

**Interfaces:**
- タイムアタックが英語でも選べるのは Task 1 の `I18N.hide` から。ここでは画面と流れを仕上げる。
- ランキングの画面: 今のヒントの `<p>` のすぐ下に `<p class="hint" id="rk-local" hidden></p>` を置き、`renderRanking` で `I18N.localOf(0, 0, { weekly: true })` が空でなければ `T('「今週」の始まりは、あなたの時間で{t}', { t })`（英語 `That’s {t} your time.`）を入れて出す。日本語は隠れたまま。
- 表の日付 `jstDay(d)` は日本時間の日付のまま、英語は `Oct 30`（`I18N.dayLabel` に日本時間の `YYYY-MM-DD` を渡す）。日本語は今の `10/30`。
- 英語の結果画面のタイムアタック: 何位相当・載せる箱・［View leaderboard］は PR5 で訳した文のまま。

- [ ] **Step 1: テスト**（e2e）
  - `en_time_attack`: Time Attack・国旗→国名・アジア・5問をクリア（`clearTimeAttack`）→ 結果の `jaLeft` が空、`Would rank #… all time · #… this week`、プロフィール `Chiko` で自動で載り `Posted!`、［View leaderboard］で同じ条件の表に `Chiko`。
  - `en_ta_fail`: 1問まちがえて終わり → 文が英語。
  - `en_leaderboard`: `en/#ranking` で表が開き、`jaLeft` が空（名前を除く）。モード・地域・問題数・All time／This week の切りかえ。`timezoneId: 'America/New_York'` で `#rk-local` に `your time`、`timezoneId: 'Asia/Tokyo'` で `#rk-local` が隠れている。［Play with these settings］でモード選択が Time Attack・その条件。
  - `en_leaderboard_ja_names`: 偽 DB に `チコ`・`たろう` の記録 → 名前はそのまま見え、`jaLeft` は空、日付が `Oct 30` の形。
  - `en_ta_shared`: 英語で載せた記録が、同じ文脈で日本語版（`../`）のランキングにも出る。
  - `langsw_keeps_ranking`: 英語版のランキングで `日本語` を押すと日本語版のランキング。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作り直し。
- [ ] **Step 4: 通るのを見る** — e2e `timeattack`・`ranking`・`submit`・`result_guard`・`lang`・`en`・`en_play`。
- [ ] **Step 5: コミット** — `英語版: タイムアタックとランキング（今週の区切りをその人の時間でも出す）`

### Task 6: シェアの文と画像（share-card.js）

**Files:**
- Modify: `share-card.js`（`?v=` +1）、`tools/make_en.mjs`（`EN_SKIP` から `share-card.js`）、`index.html`（`share-card.js?v=`）、`i18n/en-rank.js`、`en/index.html`（生成）、`tests/unit/share-card.test.mjs`（`ctxWithI18n`）、`tests/unit/i18n.test.mjs`（COVER へ）
- Test: `tests/e2e/share_card.test.mjs`（英語の場合を足す）、`tests/e2e/en_walk.test.mjs`（`UNTRANSLATED` から `#r-share`）

**Interfaces:**
- `SHARE` の `tag: '#国旗マスター'` は data のまま。足す: `SHARECARD.tag() -> string`（`T(SHARE.tag)`。英語 `#FlagMaster`）と `SHARECARD.url() -> string`（英語は `SHARE.url + 'en/'`、日本語は `SHARE.url`）。画像の下の URL・X の投稿の `url`・`navigator.share` の URL・`index.html` と `daily.js` のシェアの文の `{tag}` は、この2つを使う。
- 画像の左上は `T('国旗マスター')`（`Flag Master`）。ファイル名は英語 `flag-master.png`、日本語は今の `kokki-master.png`。`waitFont` に渡す文字も `T()` 後のもの。

- [ ] **Step 1: テスト**
  - unit: 今の `share-card.test.mjs` は日本語のまま通る。足す `share_en`: 英語の vm で `tag() === '#FlagMaster'`、`url()` が `…/country-drill/en/`。
  - e2e `share_card_en`: 英語でタイムアタックをクリア → ［Share result］の `data-card` が `ready`、`navigator.share` を差しかえて押すと、文が `Flag Master Time Attack …\nCleared in …!\n#FlagMaster` で URL が `/en/`、ファイル名 `flag-master.png`。画像（canvas）を `toDataURL` で取り出し、日本語のページで同じ条件の画像と同じ大きさ（1200×675）。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** → 作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部、e2e `share_card`・`en_play`。
- [ ] **Step 5: コミット** — `英語版: 結果のシェア（文・画像・#FlagMaster・英語版の URL）`

（コントローラーが別の AI に、ここまでの `i18n/en-rank.js`・`en-profile.js` を日本語のキーと並べて見させる: 英語として自然か・意味がずれていないか・用語集どおりか。直しは辞書だけ。）

### Task 7: 今日の難問（Daily Puzzle）（辞書 en-daily）

**Files:**
- Modify: `daily.js`（`?v=` +1）、`tools/make_en.mjs`（`EN_SKIP` から `daily.js`、`EN_DICTS['index.html']` に `'en-daily'`、`#e-daily` を外す処理を消す）、`index.html`（`daily.js?v=`）、`i18n/en-html.js`（`#e-daily` の文 `Try the Daily Puzzle (20 questions)`）、`en/index.html`・`en/embed.html`（生成）、`tests/unit/make-en.test.mjs`（`en_embed` の「`#e-daily` が無い」を「あって `en/#daily` を指す」に）、`tests/unit/i18n.test.mjs`（COVER へ）
- Create: `i18n/en-daily.js`
- Test: `tests/e2e/en_play.test.mjs`（`en_home_entries` に `#home-daily` が見えることを足す）、`tests/e2e/en.test.mjs`（`en_home` の見えない入口から `#home-daily`）、`tests/e2e/en_walk.test.mjs`（`UNTRANSLATED` から `#home-daily`）

**Interfaces:**
- 日付 `md(day)` は `I18N.dayLabel(day)`。短い日付 `mdShort` は今の `10/30` のまま（英語でも同じ）。答えの一覧の国名は `cName(c)`、`MODE_LABEL` は data で表示のとき `T()`（キーは PR5 の辞書にある `国旗 → 国名` など）、`STAGE` の★はそのまま。
- 日本時間の区切りを添える所（英語でだけ、`I18N.localOf` が空でないとき）:
  - 挑戦前の説明: `T('毎日0時（日本時間）に新しい{n}問。', { n: N })` に `T('（あなたの時間で{t}）', { t: I18N.localOf(0, 0) })` を足す。英語の文: `A new set of {n} questions every day at midnight Japan time` ＋ ` ({t} your time)` ＋ `.`。
  - 昨日の記録の行: `T('昨日（{d}）の挑戦の記録。0時30分（日本時間）までなら載せられるよ', { d })` に同じ添え書き（`localOf(0, 30)`）。英語 `Yesterday’s ({d}) result. You can post it until 12:30 AM Japan time`。
- 次の問題までの残り: `T('次の問題まで あと{h}時間{m}分', { h, m })` → `Next puzzle in {h}h {m}m`。
- シェアの文: `T('国旗マスター 今日の難問 {d}\n{bar}\n{line}\n{tag}', …)` → `Flag Master Daily Puzzle {d}\n{bar}\n{line}\n{tag}`。`resultLine` は `T('全問正解！ {time}', …)`→`Perfect! {time}`、`T('{c} / {n} 問正解', …)`→`{c} / {n} correct`。
- 表の名前は `nameHTML`（`data-ugc`）か、無ければ `<span data-ugc>`。

- [ ] **Step 1: テスト**（e2e、偽 Supabase・プロフィール `Chiko`）
  - `en_daily_play`: ホームの `#home-daily`（`Daily Puzzle`・日付・`NEW`）→ 説明の `jaLeft` が空 → 挑戦して3問正解・1問まちがい → 結果・答えの一覧（英語の国名）・載せる・`jaLeft` が空。ホームに戻ると日付の横が `Done`（`挑戦ずみ` の訳）。
  - `en_daily_local_time`: `timezoneId: 'America/New_York'` で説明に `your time)` と `AM`／`PM`、`timezoneId: 'Asia/Tokyo'` では `your time` が無い。
  - `en_daily_board`: 偽 DB に `チコ` の今日の記録 → 表に名前、`Perfect` か `{n} correct`、`jaLeft` が空。Yesterday のタブで昨日の問題と答えが英語。
  - `en_daily_shared`: 英語で挑戦したあと日本語版の今日の難問を開くと「挑戦ずみ」の結果（同じ `daily`）、日本語版から挑戦はできない。
  - `en_daily_share_text`: ［Share result］の文が `Flag Master Daily Puzzle 10/30` で始まり `#FlagMaster` で終わる（国名を含まない）。
  - `embed_en_daily`（`embed.test.mjs`）: `en/embed.html` の `#e-daily` が英語で、`/en/#daily` を指す。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約50か所）→ 作り直し。
- [ ] **Step 4: 通るのを見る** — e2e `daily`・`embed`・`en_play`・`en`、unit 全部。
- [ ] **Step 5: コミット** — `英語版: 今日の難問（日本時間0時の切りかわりを、その人の時間でも出す）`

### Task 8: れんぞく日数（streak.js）

**Files:**
- Modify: `streak.js`（`?v=` +1）、`tools/make_en.mjs`（`EN_SKIP` から `streak.js`）、`index.html`（`streak.js?v=`）、`i18n/en-daily.js`、`en/index.html`（生成）、`tests/unit/streak.test.mjs`（`ctxWithI18n`）、`tests/unit/i18n.test.mjs`（COVER へ）
- Test: `tests/e2e/en_play.test.mjs`

**Interfaces:**
- `WD`（月〜日）と `MARK` は data、表示で `T()`。英語の曜日は `Mon`〜`Sun`、印は `Played`／`Rest pass`／`Missed`／`Today`。
- 1行: `T('{n}日れんぞく', { n })` → `{ one: '{n}-day streak', other: '{n}-day streak' }`、`T('（さいこう{b}日）', …)` → ` (best {b})`、`T('お休み券{t}枚', { n: t, t })` → `{ one: '{t} rest pass', other: '{t} rest passes' }`。ヒント: `Play today to reach {n} days!`／`Yesterday was covered by a rest pass`／`Play today to start a streak`。
- 週の欄（開いたとき）の下に、英語でだけ `T('日付は日本時間の0時で変わるよ（あなたの時間で{t}）', { t: I18N.localOf(0, 0) })` → `Days change at midnight Japan time ({t} your time).`（`localOf` が空なら出さない）。

- [ ] **Step 1: テスト**
  - unit: 今の streak のテストがそのまま通る。
  - e2e `en_streak`: 英語で練習5問を終えてホーム → `1-day streak`・`rest pass` の行、週の欄を開いて英語の曜日、`jaLeft` が空。`timezoneId: 'America/New_York'` で `your time`。
  - `en_streak_shared`: 英語で遊んだ日が日本語版のホームの「1日れんぞく」に出る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装**（約20か所）→ 作り直し。
- [ ] **Step 4: 通るのを見る** — e2e `streak`・`en_play`・`home`。
- [ ] **Step 5: コミット** — `英語版: れんぞく日数`

（コントローラーが別の AI に `i18n/en-daily.js` と en-html.js の足した分を見させる。）

### Task 9: 英語の OGP 画像

**Files:**
- Create: `tools/ogp-en.html`、`icons/ogp-en.png`（1200×630）
- Modify: `tools/make_ogp.mjs`（引数 `en` で `tools/ogp-en.html` → `icons/ogp-en.png`、引数なしは今のまま日本語）、`tools/make_en.mjs`（en/index.html の `og:image` を `icons/ogp-en.png` に）、`tools/make_country_pages.mjs`（`head()` の `lang === 'en'` のとき `OGP_EN`）、`tools/make_theme_pages.mjs`（同じ `head()` を使うので変わらなければ不要）、`en/**/*.html`（生成）、`tests/unit/make-en.test.mjs`、`tests/unit/country-pages.test.mjs`、`tests/unit/theme-pages.test.mjs`

**Interfaces:**
- `tools/ogp-en.html` は `tools/ogp.html` と同じ見た目で、`<html lang="en">`、`<h1>Flag Master</h1>`、`<p>Learn the flags, names, and locations of <span class="n">195</span> countries with a 4-choice quiz</p>`（2行に収める。改行位置は撮って決める）。
- `export const OGP_EN = SITE + 'icons/ogp-en.png'`（make_country_pages.mjs）。

- [ ] **Step 1: テスト**
  - `en_head`（make-en）: en/index.html の `og:image` が `…/icons/ogp-en.png`、index.html は `…/icons/ogp.png` のまま。
  - `en_country_head`・`en_theme_pages_list`: 英語のページの `og:image` が `ogp-en.png`、日本語のページは `ogp.png`。
  - `ogp_en_png`（make-en）: `icons/ogp-en.png` があり、PNG の IHDR が 1200×630。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 実装** — `node tools/make_ogp.mjs en`（Google Fonts が読める所で撮る。撮った画像を目で見て、文字が切れていないか・丸ゴシックで描けているか確かめる）→ 作り直し。
- [ ] **Step 4: 通るのを見る** — unit 全部。
- [ ] **Step 5: コミット** — `英語版: OGP 画像（icons/ogp-en.png）`

### Task 10: 英語の遊び方に足す（en/howto.html）

**Files:**
- Modify: `en/howto.html`、`tests/unit/pages.test.mjs`（`en_howto_only_available`）

**Interfaces:**
- 足す節（日本語の howto.html の該当の節を訳す。事実を足さない）: `kinds` を `Practice, Challenge, and Time Attack` に広げ、`<h2 id="daily">Daily Puzzle</h2>`（日本時間0時に切りかわること、世界で同じ問題・同じランキング）、`<h2 id="profile">Profile and moving to a new device</h2>`、ランキングと載せ方、れんぞく日数とお休み券（日本語の howto にある分だけ）。順番は日本語の howto と同じ。
- まだ出さない語: `Adventure`・`Badges`（PR7・PR8）。

- [ ] **Step 1: テスト** — `en_howto_only_available` を直す: `Adventure`・`Badges` が無い。`Time Attack`・`Leaderboard`・`Daily Puzzle`・`Profile`・`Transfer code` がある。`<h2 id>` に `daily`・`profile` を足す。`midnight Japan time` がある。`en_pages_no_japanese` もそのまま通る。
- [ ] **Step 2: 落ちるのを見る。**
- [ ] **Step 3: 書く。**
- [ ] **Step 4: 通るのを見る。コミット** — `英語版: 遊び方にタイムアタック・今日の難問・プロフィールを足す`

（コントローラーが別の AI に、日本語の howto と並べて自然さ・ずれを見させる。）

### Task 11: 英語版を全部まわるテストを広げる

**Files:**
- Modify: `tests/e2e/en_walk.test.mjs`

- [ ] **Step 1: テストを直す**（PHONE と PC、`seed` 固定、プロフィール `Chiko`、偽 DB に `チコ` の記録）
  - `UNTRANSLATED` を `['#home-rpg', '#home-badges', '#pcoin', '.trivia']` に（タイムアタックのカード・`#r-share`・`#home-daily`・`#home-rank`・`#home-profile` を外す）。
  - `en_walk` に足す: タイムアタック1回（クリアして載せる）→ 結果のシェアのボタン → ランキング（All time・This week）→ プロフィールの窓（自分・`チコ`）→ プロフィール画面・引き継ぎ（預けるまで）→ 今日の難問（説明・挑戦・結果・Yesterday）→ ホームのれんぞく日数（週の欄を開く）。各画面で `jaLeft` が空、ページエラーなし、`[i18n]` の warn なし。
  - `en_links_stay_english`: 足した画面のリンク（プロフィールの注意書きのプライバシー・今日の難問・埋めこみの `#e-daily`）も `/en/` の下。
  - `ja_unchanged` はそのまま通る。
- [ ] **Step 2: 走らせる** — `cd tests/e2e && node --test --test-concurrency=1 en_walk.test.mjs`（落ちたら持ち主のタスクの直しとして入れる）
- [ ] **Step 3: コミット** — `英語版: 全画面のテストにタイムアタック・ランキング・今日の難問・プロフィール・れんぞく日数を足す`

### Task 12: PR6 を出す

- [ ] 作る順番どおりに全部作り直し、差分が出ないこと: `node tools/make_en.mjs && node tools/make_theme_pages.mjs && node tools/make_country_pages.mjs && node tools/make_sw.mjs && git status --short`（何も出ない）。
- [ ] `node --test tests/unit/` 全部、`bash tests/sql/run.sh`、`cd tests/e2e && node --test --test-concurrency=1 *.test.mjs` 全部（日本語版の今のテストも全部）。
- [ ] `?v=` を origin/main と比べて、変えたファイルが全部 +1 になっていること（`cache_bust`）。main が進んでいたら取りこんで数を合わせ直す。
- [ ] 英語の画面のスクリーンショット（390px と 1280×800、`timezoneId: 'America/New_York'`）: ホーム・タイムアタックの結果・ランキング・プロフィール画面・プロフィールの窓・引き継ぎ・今日の難問（説明・結果・Yesterday）・れんぞく日数の週の欄・シェアの画像（canvas を PNG に）・`icons/ogp-en.png` を `/mnt/project-files/country-drill-next5-20261029/en-pr6/` に。文字のあふれを目で見る。
- [ ] 辞書全部の最後の見直し（コントローラーが別の AI に、用語集とのずれ・同じ日本語に別の訳がないかを見させる）。
- [ ] `/mnt/project-files/country-drill-next5-20261029/pr6-ng-words-en.sql` が `supabase/pr6_ng_words_en.sql` と同じこと（`cmp`）。
- [ ] push・PR。本文の頭に「**SQL Editor で1回**: `pr6-ng-words-en.sql` を貼って Run（英語の NG ワードを足すだけ。表は変えない。何度流しても同じ。マージの前でも後でもよいが、マージの前がおすすめ）。最後の表に出た名前は、気になれば管理ページで変える」と書く。英語で遊んでもバッジ・コインは PR7・PR8 で増えるようになる、とも書く。チコの OK でマージ。

---

## 決めたこと（ルーリング）

1. **SQL Editor は1回、`ng_words()` の入れかえだけ**。本番の DB を MCP で変えられないので、チコに `pr6-ng-words-en.sql` を流してもらう。新しい js は今の DB でも動く（サーバーのほうがゆるいだけで、ふつうに使えば手元のチェックで止まる）ので、**マージは SQL を待たなくてよい**。ただ、ずれている間は手元のチェックを通さずに送られた英語の悪い名前をサーバーが通すので、マージの前に流してもらうのがおすすめ。
2. **NG ワードは今の決まり（NFKC＋小文字への部分一致）のまま、語の選び方で取りちがえを防ぐ**。単語の区切りで見る形にはしない（手元・サーバー・管理ページの5つの関数を全部書きかえることになる）。そのため短い語（`ass` など）は入れない。空白や記号をはさんだ書き方（`f u c k`）は今と同じく通る。
3. **すでに載っている名前は消さない**。SQL の最後に、新しい一覧に当たる今の名前を表に出すだけ（読むだけ）。直すかどうかはチコが管理ページで決める。
4. **画面に出さない日本語の一覧（NG ワード）は `// i18n-ignore` で囲む**（PR5 ルーリング 13 に足す）。ほかには使わない。
5. **vm で読むファイル（ranking・share-card・streak）のテストは、先に i18n.js を読む**（`ctxWithI18n`）。そのため、これらのファイルは表示のときに `T()` を呼んでよい。定義のところの日本語は data のまま（PR5 ルーリング 13 と同じ）。
6. **「その人の時間で何時か」は英語の画面だけ**（日本語の画面は今のまま）。今日の難問の0時と0時30分・タイムアタックの今週（月曜0時）・れんぞく日数の0時の4か所。その人の時間帯が UTC+9 なら出さない。日付の表示は日本時間の日付のまま英語の形にする。引き継ぎコードの期限（日付ではなく時刻）は、英語ではその人の時間で出す。
7. **他人の称号は英語版では PR7 まで出さない**（称号はバッジの日本語の名前なので）。`I18N.hide` に `'title'`。英語版の同期は称号・バッジの数を送らない（今のコードのまま。日本語版でつけたものを消さない）。
8. **ニックネームは訳さず、`data-ugc` の要素に入れる**。英語の画面に日本語の名前が並ぶのは spec のとおり（「名前はそのまま並ぶ」）。
9. **英語のシェアは `#FlagMaster` と英語版の URL（`…/country-drill/en/`）**。画像のファイル名は `flag-master.png`。今日の難問のシェアには国名を入れない（今と同じ）。
10. **埋めこみの［今日の難問に挑戦］は英語版でも出す**（PR5 で外したものを戻す）。
11. **プロフィールの窓の冒険・英雄の塔の行は PR6 で訳す**（ほかの人の記録として出るので）。語は用語集の `Adventure`・`Tower of Heroes`・`Dungeon` で、PR8 もこれを使う。
12. 英語の OGP は `icons/ogp-en.png`（日本語の `ogp.png` は作り直さない）。英語のページ（本編・国・まとめ）の `og:image` だけが指す。

## チコに決めてほしいこと

1. **英語の NG ワードの一覧**（Task 3 の29語）
   - おすすめ: この29語。部分一致で取りちがえやすい短い語（ass・dick・cock・nazi・rape など）は入れない。
   - 理由: 今のしくみは部分一致なので、短い語を入れると `Class`・`Peacock`・`Therapist` のような普通の名前まではじいてしまう。足りない語は、あとから同じ SQL の形で足せる。
2. **SQL を流すタイミング**
   - おすすめ: PR6 をマージする前に流す（マージの後でも動く）。
   - 理由: 新しいページは今の DB でも動くが、流すまではサーバーが英語の悪い名前を通す。流しても日本語版には何も変わらない。

## リスク

- **`I18N.localOf` の「次に来る」計算**を誤ると、夏時間の週や日本時間の0時ちょうどで1日ずれる。unit で固定の日時と時間帯を見る。
- **英語のホームに今日の難問の大きいカードが出る**ので、390px と PC の高さが変わる。`en_home_entries` とスクリーンショットで見る。
- **NG ワードの3か所のずれ**は `ng_lists_identical` で止める。本番に流したものが同じかは、SQL の中の `assert`（47語）で見る。
- **英語版から日本語版のプロフィールの称号を消す**おそれ（`BADGES` が無いときの同期）。`en_sync_keeps_title` で見る。
- **シェアの画像の英語のフォント**: 丸ゴシックの英字で描くので、日本語版と字の幅が変わる。題が長いとき `max` で縮む。スクリーンショットで見る。
- **`?v=` の数**: PR を出すまでに main が進むと合わなくなる。Task 12 で合わせ直す。
