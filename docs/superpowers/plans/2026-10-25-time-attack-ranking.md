# タイムアタック＋ランキング 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1ミス失格のタイムアタックと、Supabase に保存する共有ランキング（歴代／今週）を 195か国ドリルに追加する。

**Architecture:** Supabase 側は `scores` テーブル1つと `security definer` 関数3つ（submit_score / top_scores / rank_of）だけを anon に公開する。ブラウザ側は通信と入力チェックだけを持つ `ranking.js`（`window.RANKING`）を新設し、画面と遊びの流れは既存の `index.html` に追加する。

**Tech Stack:** 素の HTML/CSS/JS（ビルドなし）、Supabase（PostgREST の RPC を `fetch` で直接呼ぶ。supabase-js は使わない）、テストは PostgreSQL 16（psql）・`node --test`（Node 22）・Playwright。

**Spec:** `docs/superpowers/specs/2026-10-25-time-attack-ranking-design.md`

## Global Constraints

- 接続先: `https://vgdkklvhtvcamtxwjpke.supabase.co`、キー `sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV`。ヘッダーは `apikey` と `Content-Type: application/json` だけ（新形式キーは JWT ではないので `Authorization` は付けない）
- 新しい外部ライブラリ・CDN は増やさない
- board 文字列は `モード:地域:問題数`。モード `f2n|n2f|m2f|f2m`、地域 `all|asia|europe|africa|namerica|samerica|oceania`（REGIONS の順に対応）、問題数 `5|10|20|all`
- ニックネーム: 前後空白を除いて1〜12文字（`[...str].length` で数える）、NGワードを含まない（NFKC＋小文字化して部分一致）
- 速すぎ: `time_ms < questions * 400`、遅すぎ: `time_ms > 10800000`（3時間）、連投: 同じ board＋同じニックネームで10秒以内
- 「今週」は日本時間の月曜0時から
- ランキングは上位50件、同じニックネームは最速1件
- 通信は8秒でタイムアウト。失敗してもクイズは止めない
- ファイル名は半角英数字のみ
- 練習／挑戦モードの動きは変えない

## Review Focus

1. **タイムアタック中に Enter キー** — 正解で即次へ進むので `#next` が無い。既存の keydown ハンドラが失格画面の `#next` を押せること、クイズ中に Enter で何も壊れないこと（Task 3 のテスト `enter_key_on_fail_screen`）
2. **送信ボタンの連打** — 二重登録になり、2回目が「10秒以内」で拒否されてエラー表示になる。送信中はボタンを disabled にする（Task 4 のテスト `double_click_submits_once`）
3. **ニックネームに `<script>` や `"` などの記号** — ランキング表示で HTML として解釈されないこと。表示は必ず `esc()` を通す（Task 5 のテスト `nickname_is_escaped`）
4. **地域を変えたら問題数「全部」の実数が変わる** — `questions` には実際の出題数を送ること（Task 3 の `G.set.length`、Task 1 の SQL テスト `all_count_accepts_region_size`）
5. **結果画面の順位問い合わせが遅い／失敗** — 順位欄だけ消えて、送信フォームは使えること（Task 4 のテスト `rank_preview_failure_keeps_form`）

---

### Task 1: Supabase のテーブルと関数

**Files:**
- Create: `supabase/schema.sql`
- Create: `tests/sql/test_schema.sql`
- Create: `tests/sql/run.sh`

**Interfaces:**
- Produces（PostgREST の RPC。POST `/rest/v1/rpc/<名前>`、引数は JSON のキー名そのまま）:
  - `submit_score(p_board text, p_nickname text, p_time_ms int, p_questions int) returns jsonb` → `{"ok":true,"rank_all":int,"rank_week":int}` または `{"ok":false,"reason":"bad_board"|"bad_name"|"ng_name"|"too_fast"|"too_slow"|"too_soon"}`
  - `top_scores(p_board text, p_period text) returns table(nickname text, time_ms int, created_at timestamptz)`（p_period は `all`|`week`、それ以外は空）
  - `rank_of(p_board text, p_time_ms int) returns jsonb` → `{"rank_all":int,"rank_week":int}`（自分より速い自己ベストを持つ人数＋1）

- [ ] **Step 1: テスト用の実行スクリプト `tests/sql/run.sh` を書く**

ローカルの PostgreSQL 16 で使い捨てクラスタを作り（`pg_ctl`、`/usr/lib/postgresql/16/bin`、データは `mktemp -d`）、`anon` ロールを作ってから `supabase/schema.sql` → `tests/sql/test_schema.sql` を `psql -v ON_ERROR_STOP=1` で流し、最後にクラスタを止めて消す。root で動く場合は `su postgres` 相当で起動すること。

- [ ] **Step 2: 失敗するテスト `tests/sql/test_schema.sql` を書く**

`DO $$ ... ASSERT ... $$` で1項目ずつ。各テストの前に `truncate scores`。`set role anon` で呼ぶ（権限の確認も兼ねる）。項目:
- `accepts_valid`: `submit_score('f2n:asia:10','チコ',8000,10)` → ok=true, rank_all=1, rank_week=1
- `bad_board`: `'x:asia:10'`, `'f2n:mars:10'`, `'f2n:asia:7'` → reason=bad_board。`'f2n:asia:10'` で p_questions=9 も bad_board
- `all_count_accepts_region_size`: `'f2n:oceania:all'` で questions=14 → ok。questions=0 と 196 → bad_board
- `name_rules`: `''`・`'   '`・13文字 → bad_name。`' チコ '` は ok で保存値は `'チコ'`。`'ＦＵＣＫ'`（全角）→ ng_name
- `too_fast_too_slow`: 10問で 3999ms → too_fast、4000ms → ok、10800001ms → too_slow
- `too_soon`: 同じ board・名前で続けて送る → 2回目 too_soon。`created_at` を11秒前に update してから送ると ok
- `best_per_name`: 同名で 9000→8000（created_at をずらして too_soon 回避）、別名 8500 → `top_scores(...,'all')` は2行で 1位 8000
- `week_boundary`: 先週日曜23:59 JST の記録は `week` に出ず `all` には出る。今週月曜00:00 JST の記録は `week` に出る
- `rank_of_counts_faster_bests`: 自己ベスト 7000, 8000, 9000 の3人がいるとき `rank_of(board, 8500)` → rank_all=3
- `limit_50`: 60人分 insert（superuser で直接）→ `top_scores` は50行
- `anon_cannot_touch_table`: anon で `select * from scores` / `insert` / `delete` がそれぞれ権限エラーになる

- [ ] **Step 3: 失敗を確認**

Run: `bash tests/sql/run.sh`
Expected: `function submit_score(...) does not exist` 系のエラーで止まる

- [ ] **Step 4: `supabase/schema.sql` を実装**

- 何度流しても壊れないように `create table if not exists` / `create or replace function`
- テーブル列は spec の通り（id bigint generated always as identity, board, nickname, time_ms int, questions int, created_at timestamptz default now()）。index は `(board, time_ms)`
- `alter table scores enable row level security;` ポリシーは作らない。`revoke all on scores from anon, authenticated;`
- 関数3つは `language plpgsql security definer set search_path = public`、`grant execute ... to anon`
- NGワードは関数 `ng_words()` 内の配列で持つ（Task 2 の `NG_WORDS` と同じ中身）: `死ね, しね, シネ, 殺す, ころす, ちんこ, ちんぽ, まんこ, うんこ, せっくす, セックス, fuck, shit, bitch, sex, admin, 運営, 管理人`
- 判定は `lower(normalize(name, NFKC))` に対する部分一致
- 今週の始まり: `date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'`
- 同名まとめ: `distinct on (nickname) ... order by nickname, time_ms, created_at` を外側で `order by time_ms, created_at limit 50`
- ファイル先頭に「Supabase の SQL Editor に全部貼って Run」のコメント

- [ ] **Step 5: テストが通るのを確認**

Run: `bash tests/sql/run.sh`
Expected: エラーなしで終了、最後に `ALL SQL TESTS PASSED`（テストファイル末尾で `\echo`）

- [ ] **Step 6: Commit**

```bash
git add supabase tests/sql
git commit -m "ランキング用の Supabase テーブルと受付関数を追加"
```

---

### Task 2: `ranking.js`（通信と入力チェック）

**Files:**
- Create: `ranking.js`
- Create: `tests/unit/ranking.test.mjs`

**Interfaces:**
- Consumes: Task 1 の RPC 3つ
- Produces（`window.RANKING`。ブラウザでは `<script src="ranking.js">`、テストでは `vm.runInNewContext` で読み込むので、IIFE で `globalThis.RANKING = {...}` とする）:
  - `enabled: boolean`（URL とキーが空でなければ true）
  - `boardKey(modeK: string, region: string, count: number|'all') -> string`（region は `'all'` か日本語の地域名）
  - `checkName(name: string) -> {ok:true, name:string} | {ok:false, reason:'bad_name'|'ng_name'}`
  - `submit({board, nickname, timeMs, questions}) -> Promise<{ok:true, rankAll:number, rankWeek:number} | {ok:false, reason:string}>`（通信失敗・タイムアウト・HTTP エラーは `reason:'network'`。例外は投げない）
  - `top({board, period}) -> Promise<Array<{nickname:string, timeMs:number, at:Date}>>`（失敗時は reject）
  - `rankOf({board, timeMs}) -> Promise<{rankAll:number, rankWeek:number}>`（失敗時は reject）
  - `message(reason: string) -> string`（下の文言）
  - `formatTime(ms: number) -> string`（`12345 → '12.34秒'`、`61234 → '1分01.23秒'`、切り捨て）

文言（`message`）:
- `bad_name`: `ニックネームは1〜12文字で入れてね`
- `ng_name`: `そのニックネームは使えないみたい`
- `too_fast`: `タイムが速すぎて受け付けられなかった`
- `too_slow`: `タイムが長すぎて受け付けられなかった`
- `too_soon`: `少し待ってからもう一回送ってね`
- `bad_board`: `この条件はランキングに載せられない`
- `network`: `ランキングに接続できなかった`

- [ ] **Step 1: 失敗するテストを書く**（`node:test` + `assert/strict`。`fetch` はテストごとに差し替えたスタブを context に渡す）

- `boardKey`: `('f2n','all',10)→'f2n:all:10'`、`('m2f','北・中央アメリカ','all')→'m2f:namerica:all'`、`('f2m','オセアニア',5)→'f2m:oceania:5'`
- `checkName`: `' チコ '→{ok:true,name:'チコ'}`、`''`/`'あいうえおかきくけこさしす'`(13)→bad_name、`'🇯🇵'.repeat(6)`（12コードポイント）→ok、`'ＦＵＣＫ'`→ng_name
- `formatTime`: 上の2例と `0→'0.00秒'`
- `submit_sends_rpc`: スタブが受けた URL が `https://vgdkklvhtvcamtxwjpke.supabase.co/rest/v1/rpc/submit_score`、body が `{"p_board":"f2n:all:10","p_nickname":"チコ","p_time_ms":8000,"p_questions":10}`、ヘッダーに `apikey` があり `Authorization` が無い。応答 `{"ok":true,"rank_all":3,"rank_week":1}` → `{ok:true,rankAll:3,rankWeek:1}`
- `submit_passes_reason`: 応答 `{"ok":false,"reason":"too_soon"}` → `{ok:false,reason:'too_soon'}`
- `submit_network`: fetch が reject → `{ok:false,reason:'network'}`。HTTP 500 → 同じ
- `submit_timeout`: 永遠に解決しない fetch（signal の abort で reject する実装のスタブ）→ 8秒で `network`（`mock.timers` で時間を進める）
- `top_maps_rows`: 応答 `[{"nickname":"a","time_ms":8000,"created_at":"2026-10-25T00:00:00Z"}]` → `[{nickname:'a',timeMs:8000,at:Date}]`。HTTP 500 → reject
- `rank_of_maps`: `{"rank_all":2,"rank_week":1}` → `{rankAll:2,rankWeek:1}`

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/unit/`
Expected: `ranking.js` が無くて FAIL

- [ ] **Step 3: `ranking.js` を実装**

NG_WORDS は Task 1 と同じ配列。`checkName` は `name.trim()` → 長さ判定 → `normalize('NFKC').toLowerCase()` で部分一致。通信は共通の `rpc(name, args)` で `AbortController` + `setTimeout(8000)`。

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/unit/`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ranking.js tests/unit
git commit -m "ランキング通信用の ranking.js を追加"
```

---

### Task 3: タイムアタックの遊びの流れ（E2E の土台つき）

**Files:**
- Modify: `index.html`（`KINDS`、`renderSetup`、`startGame`、`nextQuestion`、`updateProgress`、`answer`、quiz の progress 行、`<script src="ranking.js">` を `world.js` の後に追加）
- Create: `tests/e2e/helpers.mjs`
- Create: `tests/e2e/timeattack.test.mjs`
- Create: `tests/e2e/package.json`（`"type":"module"`、devDependencies に `d3@7.9.0`・`topojson-client@3.1.0`。Playwright はグローバルのものを使う）
- Modify: `.gitignore`（`tests/e2e/node_modules/`）

**Interfaces:**
- Consumes: `RANKING.formatTime`
- Produces:
  - `KINDS` に `{ k: 'ta', label: 'タイムアタック', desc: '1ミスで失格。クリアタイムでランキングに挑戦' }`
  - `G.t0: number`（1問目表示時の `performance.now()`）、`G.timeMs: number|null`（クリア時に確定）、`G.failed: boolean`
  - 進行表示に `<span id="ptime" class="mono"></span>` を追加（タイムアタック以外では空）
  - `helpers.mjs`: `startServer() -> {url, close}`（リポジトリ直下を配信する静的サーバー）、`openApp(browser, {viewport, supabase})`（d3/topojson の CDN を `tests/e2e/node_modules` に route、supabase.co を `supabase` ハンドラ（`'fake'`＝メモリ上の偽実装／`'down'`＝`route.abort()`）に route）、`answerCorrect(page)` / `answerWrong(page)`（`page.evaluate(() => G.cur.c.a)` で正解を知り、該当 `.choice[data-a]` をクリック）、`pickSetup(page, {mode, kind, region, count})`
  - 偽 Supabase は Task 1 と同じ JSON を返す最小実装（名前チェックは `bad_name` の文字数だけ、同名ベスト、順位計算）

- [ ] **Step 1: E2E の土台を用意**

Run: `cd tests/e2e && npm install`
Expected: `node_modules/d3/dist/d3.min.js` と `node_modules/topojson-client/dist/topojson-client.min.js` がある

- [ ] **Step 2: 失敗するテスト `tests/e2e/timeattack.test.mjs` を書く**（`node:test`、スマホ幅 390×844）

- `ta_kind_exists`: モード選択に「タイムアタック」ボタンがある
- `name_option_hidden`: 場所→国旗＋タイムアタックで `#nameopt-field` が hidden。練習に戻すと表示され、チェック状態は元のまま
- `ta_no_names_in_choices`: `P.name=true` の状態でタイムアタックを始めても `.cname` が0個
- `ta_clear_flow`: 国旗→国名・全世界・5問。5問 `answerCorrect` → 各正解後に `.reveal` が出ず次の問題に進む、最後は結果画面。`G.timeMs` が数値で `> 0`
- `timer_ticks`: 1問目表示から 300ms 待つと `#ptime` の文字列が `秒` を含み 0.00 より大きい
- `ta_fail_flow`: 2問目で `answerWrong` → `.reveal` に `失格` を含む文言、`#next` のテキストが `もう一回`、`#ptime` が止まる（500ms 空けて同じ文字列）。`もう一回` で 1/5 から再開、`G.t0` が新しい
- `enter_key_on_fail_screen`: 失格画面で Enter → 新しいゲームが始まる
- `practice_unchanged`: 練習で正解すると従来どおり `.reveal` と `次の問題 →` が出る

- [ ] **Step 3: 失敗を確認**

Run: `node --test tests/e2e/timeattack.test.mjs`
Expected: `ta_kind_exists` などが FAIL

- [ ] **Step 4: `index.html` を実装**

- `renderSetup`: `$('nameopt-field').hidden = !modeOf(P.mode).nameOpt || P.kind === 'ta'`
- `nextQuestion`: `showName` に `&& G.kind !== 'ta'`。タイムアタックで1問目のときに `G.t0 = performance.now()` とタイマー開始（`requestAnimationFrame` ループで `#ptime` を `RANKING.formatTime` 表示、`G.timeMs !== null || G.failed` か quiz 画面が hidden で止める）
- `updateProgress`: `ta` は挑戦と同じ `n / N` 表示、`#pscore` は空
- `answer`: `ta` で正解 → misses 更新・ドパ演出は従来どおり、最後の問題なら `G.timeMs = performance.now() - G.t0` を確定して `showResult()`、それ以外は `nextQuestion()`（reveal は作らない）。不正解 → `G.failed = true`、verdict `失格…　正解は「◯◯」`、`factsHTML` と地図は従来どおり、`#next` は `もう一回`（onclick `startGame`）、その横に `モード選択へ` の `.btn.ghost`（`show('setup')`）
- 結果画面の `ta` 分岐はこのタスクでは仮表示でよい（`head='クリア！'`、`big` に `formatTime`）。本実装は Task 4

- [ ] **Step 5: 通るのを確認**

Run: `node --test tests/e2e/timeattack.test.mjs`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add index.html tests/e2e .gitignore
git commit -m "タイムアタック（1ミス失格・タイマー）を追加"
```

---

### Task 4: クリア後の順位表示とランキング登録

**Files:**
- Modify: `index.html`（`showResult` の `ta` 分岐、関連 CSS）
- Create: `tests/e2e/submit.test.mjs`

**Interfaces:**
- Consumes: `RANKING.enabled / boardKey / checkName / submit / rankOf / message / formatTime`、Task 3 の `G.timeMs`
- Produces:
  - 結果画面の要素 id: `#ta-time`（タイム）、`#ta-rank`（順位相当。取得前と失敗時は空）、`#ta-form`、`#ta-name`（input, maxlength なし、placeholder `ニックネーム（12文字まで）`）、`#ta-submit`（`載せる`）、`#ta-msg`（結果・エラー文言）、`#ta-open`（送信成功後に出る `ランキングを見る`）
  - `openRanking(board: string)`（Task 5 で実装。このタスクでは `#ta-open` から呼ぶだけ。未定義の間はボタンを出さない）
  - localStorage キー `nickname`（`store.get/set` を使う）

- [ ] **Step 1: 失敗するテスト `tests/e2e/submit.test.mjs` を書く**（偽 Supabase、5問クリア状態から始めるヘルパーを使う）

- `shows_time_and_rank`: `#ta-time` が `秒` を含む。偽DBが空なら `#ta-rank` に `歴代1位・今週1位 相当`
- `submit_ok`: 名前 `チコ` → `#ta-submit` → `#ta-msg` が `載せたよ！ 歴代1位` を含み、フォームが消え、偽DBに1件。localStorage の `nickname` が `"チコ"`
- `name_prefilled`: もう一回クリアすると `#ta-name` の値が `チコ`
- `name_checked_locally`: 13文字で送ると偽DBへのリクエストが0件で `#ta-msg` が `ニックネームは1〜12文字で入れてね`
- `server_reason_shown`: 偽DBが `too_soon` を返す設定 → `#ta-msg` が `少し待ってからもう一回送ってね`、ボタンは再度押せる
- `double_click_submits_once`: `#ta-submit` を素早く2回クリック → 偽DBへの submit は1回
- `network_down`: supabase=`'down'` → `#ta-rank` は空、送信すると `ランキングに接続できなかった` と `もう一回送る` ボタン
- `rank_preview_failure_keeps_form`: rank_of だけ失敗させても `#ta-form` は使える
- `disabled_when_not_configured`: `RANKING.enabled=false` を注入（`addInitScript` で ranking.js の後に上書き）→ `#ta-form` が無い

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/submit.test.mjs`
Expected: FAIL

- [ ] **Step 3: 実装**

結果カードの見出し `クリア！`、大きい数字は `formatTime`、その下に `#ta-rank`、条件表示（モード／地域／問題数）。`RANKING.enabled` のときだけフォーム。`rankOf` は表示後に非同期で呼び、`#ta-rank` を `歴代◯位・今週◯位 相当` に。送信中は `#ta-submit.disabled=true`。成功で `#ta-msg` に `載せたよ！ 歴代◯位・今週◯位`。`r-again` / `r-setup` の2ボタンは従来どおり残す。

- [ ] **Step 4: 通るのを確認**

Run: `node --test tests/e2e/`
Expected: 全部 PASS（Task 3 のテストも）

- [ ] **Step 5: Commit**

```bash
git add index.html tests/e2e/submit.test.mjs
git commit -m "タイムアタック結果画面に順位表示とランキング登録を追加"
```

---

### Task 5: ランキング画面とホームのボタン

**Files:**
- Modify: `index.html`（ホームの `.menu`、`SCREENS`、`show()`、新セクション `#scr-ranking`、CSS、`#ta-open` の接続）
- Create: `tests/e2e/ranking.test.mjs`

**Interfaces:**
- Consumes: `RANKING.top / boardKey / formatTime / enabled`
- Produces:
  - `#home-rank`（`.btn.ghost`、テキスト `ランキング`、`#home-play` と `#home-settings` の間）。`RANKING.enabled` が false なら hidden
  - `SCREENS` に `'ranking'`
  - `openRanking(board?: string)`: board を渡せばその条件、無ければ `P.mode`・`S.region`・`P.count` で開く
  - 画面要素: `#rk-modes`（`.chip` ×4、`data-k`）、`#rk-regions`（`.chip` ×7、`data-r`）、`#rk-counts`（`.chip` ×4、`data-c`）、`#rk-tabs`（`歴代`=`data-p="all"`、`今週`=`data-p="week"`、`aria-pressed`）、`#rk-list`（`<ol>`、各 `<li>` に順位・名前・タイム・`M/D`）、`#rk-empty`、`#rk-error`＋`#rk-retry`、`#rk-play`（その条件をモード選択に反映して `show('setup')`。kind は `ta` にする）
  - ランキング画面での選択は `P`/`S` を書き換えない（`#rk-play` を押したときだけ反映）

- [ ] **Step 1: 失敗するテスト `tests/e2e/ranking.test.mjs` を書く**

- `home_button_order`: `.menu` の中のボタン id 順が `home-play, home-rank, home-settings`
- `opens_with_last_setup`: モード選択で 国名→国旗・アジア・20問 にしてからホーム → ランキング → それぞれの chip が `aria-pressed="true"`
- `lists_top`: 偽DBに3件（同名2件含む）→ `#rk-list li` が2行、1位が最速、タイムは `formatTime` 形式
- `tabs_switch`: 偽DBの先週分の記録が `今週` タブでは出ない
- `empty_state`: 記録0件 → `#rk-empty` に `まだ誰もいない。1位のチャンス！`、`#rk-play` でモード選択に行き、あそび方がタイムアタック・条件が反映されている
- `error_and_retry`: supabase=`'down'` → `#rk-error` 表示。route を `'fake'` に戻して `#rk-retry` → 表に切り替わる
- `nickname_is_escaped`: 偽DBに名前 `<b>x</b>` → `#rk-list` 内に `b` 要素が無く、テキストとして `<b>x</b>` が見える
- `ta_open_links_board`: Task 4 の送信成功後の `#ta-open` → 同じ条件でランキングが開き、自分の名前がある
- `pc_layout`: 1280×800 でも横スクロールが出ない（`document.documentElement.scrollWidth <= innerWidth`）

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/e2e/ranking.test.mjs`
Expected: FAIL

- [ ] **Step 3: 実装**

既存の `.chip` / `.modecard` / `.panel` のスタイルを流用。リストの名前は必ず `esc()`。読み込み中は `#rk-list` を薄くするだけ（スピナーは不要）。

- [ ] **Step 4: 全テストが通るのを確認**

Run: `node --test tests/unit/ && node --test tests/e2e/ && bash tests/sql/run.sh`
Expected: 全部 PASS

- [ ] **Step 5: スクショで見た目確認**

スマホ幅とPC幅で ホーム・モード選択（タイムアタック選択中）・クイズ中・失格・結果（登録後）・ランキング を撮って `/mnt/project-files/country-drill-timeattack-20261025/preview/` に保存（ファイル名は半角英数字）

- [ ] **Step 6: README に追記して Commit**

README の「クイズ」行にタイムアタックを足し、「ランキング（Supabase）」節に `supabase/schema.sql` を SQL Editor で流すこと・記録の消し方（Table Editor で `scores` の行を削除）・テストの動かし方を3〜5行で。

```bash
git add index.html README.md tests/e2e/ranking.test.mjs
git commit -m "ランキング画面とホームのランキングボタンを追加"
```

---

### Task 6: 本番前の受け渡し（チコの作業）

コードは書かない。実装後にチャットで以下を案内する。

- [ ] Supabase の SQL Editor に `supabase/schema.sql` を貼って Run → `Success` を確認してもらう
- [ ] 変更一式をパッチにして `/mnt/project-files/country-drill-timeattack-20261025/` に置き、PC 経由で **ブランチに** push（main への反映はチコの明示OKの後）
- [ ] PC のブラウザでブランチ版（またはローカルで `index.html` を開く）を使い、5問クリア → 登録 → ランキング表示 を本物の Supabase で1回試してもらう
- [ ] OK が出たら main に反映して公開
