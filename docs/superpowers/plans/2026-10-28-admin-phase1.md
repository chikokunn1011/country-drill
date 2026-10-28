# 管理用サイト 第1弾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** チコだけが使える `admin.html` を作る。端末のセーブを触るデバッグ機能（ログイン不要）と、Supabase Auth でログインしたチコだけが使えるランキング管理（今あるテーブル scores / daily_scores / rpg_players）。

**Architecture:** 素の JS の静的ページ（本編と同じオリジン）。端末のセーブ操作は DOM を触らない `admin-save.js` に集め、Supabase 通信は `admin-api.js`（fetch だけ。Auth の password grant と JWT 付き RPC）。サーバーは新ファイル `supabase/admin.sql` に `admin_` 関数を security definer で作り、anon からは実行不可、authenticated でも `admins` に居なければ例外。

**Tech Stack:** vanilla JS（ES2022、ビルド無し）、Supabase（PostgREST RPC・GoTrue Auth）、PostgreSQL 16（ローカルテスト）、node:test、Playwright（グローバル導入済み）。

**Spec:** `docs/superpowers/specs/2026-10-28-admin-design.md`

## Global Constraints

- 画面の文言はすべて日本語・タメ口寄り（本編と同じトーン）。ファイル名は半角英数字。
- 外部スクリプトは読まない。admin.html が読むのは同じフォルダの `countries.js`・`daily-core.js`・`rpg-core.js`・`badges.js`・`sound.js`・`admin-save.js`・`admin-api.js`・`admin.js` だけ（d3・flags.js・world.js も読まない）。
- `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://vgdkklvhtvcamtxwjpke.supabase.co; base-uri 'none'; form-action 'none'">`。インラインの `<script>` は書かない（CSP で動かない）。
- `<meta name="robots" content="noindex, nofollow">`。sitemap.xml・robots.txt には足さない。
- サーバー由来の文字列（名前・ボード名など）は必ず `textContent` / `setAttribute` で入れる。admin.js で `innerHTML` に変数を入れるのは禁止（固定の文字列のテンプレートだけ可）。
- ログインの合札（access_token・refresh_token・expires_at）は `sessionStorage` のキー `adminAuth` だけ。localStorage に置かない。最後の操作から 30分 で自動ログアウト。
- service_role キーはどこにも書かない。使うキーは ranking.js と同じ公開用キー `sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV`、URL `https://vgdkklvhtvcamtxwjpke.supabase.co`。
- SQL: すべての `admin_` 関数は `security definer set search_path = public, pg_temp`、作った直後に `revoke all on function ... from public, anon;` と `grant execute on function ... to authenticated;`。新しいテーブルは RLS ON・ポリシー無し・`revoke all on table ... from anon, authenticated`。drop は書かない。`supabase/schema.sql` は変えない（別スレッドが変更中）。
- 端末のセーブを書くときは、本編の形を守る: rpg は `RPG_CORE.sanitize(x, RPG_CORE.today())` を通してから書く、badges は `BADGES_CORE.sanitize` を通す。形が壊れた JSON は保存しない。
- テストコマンド: `node --test 'tests/unit/*.test.mjs'`、`cd tests/e2e && npm ci` 済みで `node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`、`bash tests/sql/run.sh`。

## Review Focus

1. **anon / ログインしただけの人が管理関数を呼ぶ** → 必ずエラー（42501）で、何も変わらない。Task 2 の SQL テストで3通り（anon・admins に居ない authenticated・admin）を全関数に当てる。
2. **名前に `<img src=x onerror=...>` などが入った記録を一覧で出す** → 文字のまま表示され、スクリプトは動かない。Task 5 の e2e で偽DBにその名前を入れて、ページのエラー0・`window.__xss` 未定義を確かめる。
3. **合札の期限切れ（1時間）や 401** → 自動で refresh して1回だけやり直し、だめならログイン画面へ戻る（「ログインし直してね」）。Task 3 の単体テスト。
4. **壊れた JSON / 別の形のファイルを読み戻す（D2・D3）** → 何も書かずに理由を出す。読み戻す前の自動バックアップは成功してから書く。Task 1 の単体テスト。
5. **消したあと元に戻す（S6）で、同じ id の行がもう別にある／一意制約（同じ日に同じ名前など）にぶつかる** → その行は戻さずに「戻せなかった n件」と返し、ほかは戻す。Task 2 の SQL テスト。

---

### Task 1: 端末のセーブ部品 `admin-save.js`

**Files:**
- Create: `admin-save.js`
- Test: `tests/unit/admin-save.test.mjs`

**Interfaces:**
- Consumes: `globalThis.RPG_CORE`（`fresh`, `sanitize`, `today`, `DUNGEONS`, `TUNING.hero.maxLv`, `BIG`）、`globalThis.BADGES_CORE`（`fresh`, `sanitize`, `makeX`, `makeCatalog`）、`globalThis.DAILY_CORE`（`jstDay`, `build`, `validDay`）、`globalThis.COUNTRIES`。
- Produces: `globalThis.ADMIN_SAVE = { create }`。`ADMIN_SAVE.create(storage, now = () => Date.now())` が返すオブジェクト:
  - `keys(): {key, bytes}[]`（キー名で並べる。`adminSnaps` と `adminErrors` も一覧には出す）
  - `read(key): {ok:true, value} | {ok:false, reason:'missing'|'not_json', raw}`
  - `write(key, text): {ok:true} | {ok:false, reason:'not_json'|'bad_shape'}`（`rpg` と `badges` は sanitize を通した結果を書く。`rpg` で sanitize 後に `v` が無い・`badges` で `got` が無い、を bad_shape）
  - `remove(key)`
  - `exportAll(): {app:'country-drill', kind:'save', at:<ISO>, data:{[key]: string}}`（値は localStorage の生の文字列。`adminSnaps` は入れない）
  - `importAll(obj): {ok:true, backup} | {ok:false, reason:'bad_file'}`（`app`/`kind`/`data` が違えば bad_file。成功時は先に今の `exportAll()` を返り値 backup に入れてから、data のキーを全部入れかえ、data に無いキーは消す。`adminSnaps`・`adminErrors` は触らない）
  - `snapList(): {name, at}[]`、`snapSave(name)`（最大5個、6個目で一番古いのを消す。localStorage `adminSnaps` = `[{name, at, data}]`）、`snapLoad(name)`（importAll と同じ入れかえ）、`snapDelete(name)`
  - 冒険: `rpgGet()`、`rpgEdit(fn)`（今の rpg を読み、無ければ `RPG_CORE.fresh()`、fn(x) で変え、sanitize して書く。返り値は書いた値）、`rpgCoins(delta)`、`rpgSetLv(n)`、`rpgSetFloor(id, floor)`（0..5）、`rpgUnlockAll()`（全ダンジョンを `max(今, 4)`）、`rpgClearAll()`（全ダンジョン 5）、`rpgStoryReset()`、`rpgSetPity(n)`、`rpgGiveCard(code, n=1)`、`rpgWipe()`（`rpg`・`rpgRank`・`rpgRankPending` を消す。`rpgRankDel` は残す＝本編がランキングの行を消しに行く）
  - バッジ: `badgesAll()`（全ステップを取ったことにする。`sent` にも入れて払い出しを起こさない）、`badgesNone()`（`badges` を消す）、`badgeToggle(key)`
  - 今日の難問: `dailyQuestions(day)`（`DAILY_CORE.build(day, COUNTRIES)` の 20問、`{a, n, mode, opts}`）、`dailyReset()`（`daily` を消す）
  - 設定: `settingsGet()`、`settingsSet(patch)`（`settings` に浅くマージ）、`firstTime()`（`settings`・`setup`・`misses`・`nickname`・`rpg`・`badges`・`daily`・`rpgRank`・`rpgRankPending`・`bview`・`bdgcat` を消す。バックアップは呼ぶ側が先に snapSave する）
  - データ点検: `checkData(): {problems: string[], counts:{countries, regions}}`（195か国か、`a` の重複、`n`/`r`/`ll` の抜け、地域が6つのどれか）

- [ ] **Step 1: 失敗するテストを書く** — `tests/unit/admin-save.test.mjs`。vm に countries.js → daily-core.js → rpg-core.js → badges.js → admin-save.js を読み、メモリの storage（`{getItem,setItem,removeItem,key,length}`）を渡す。テスト:
  - `keys_lists_sorted_with_bytes`: `a`='1', `rpg`='{}' を入れて keys が `[{key:'a',bytes:1},{key:'rpg',bytes:2}]`
  - `write_rejects_broken_json`: `write('settings','{')` → `{ok:false, reason:'not_json'}`、storage は変わらない
  - `write_rpg_is_sanitized`: `write('rpg', JSON.stringify({...fresh, coins:-5}))` のあと read の coins が 0
  - `import_rejects_other_file`: `importAll({app:'x'})` → bad_file、storage 変わらない
  - `import_replaces_and_returns_backup`: 前 {a:'1'}、data {b:'2'} → a 消え b 入る、backup.data が {a:'1'}、`adminSnaps` は残る
  - `snap_keeps_five`: 6回 snapSave → snapList の長さ 5、最初の名前が消えている
  - `rpg_unlock_all_sets_floor4_keeps_cleared`: 1つを 5 にしてから rpgUnlockAll → それは 5、ほかは 4、`DUNGEONS.length` 個
  - `rpg_setlv_clamps`: rpgSetLv(500) → `TUNING.hero.maxLv`、rpgSetLv(0) → 1
  - `rpg_wipe_keeps_rankdel`: `rpgRankDel` が残り `rpg`/`rpgRank` が消える
  - `badges_all_marks_sent`: badgesAll のあと `badges` の got と sent の件数が同じで 0 より多い
  - `daily_questions_match_core`: dailyQuestions('2026-10-28') が 20件で、`DAILY_CORE.build` と同じ a の並び
  - `check_data_clean`: 今の countries.js で problems が `[]`、counts.countries 195、regions 6

- [ ] **Step 2: 走らせて失敗を確かめる** — Run: `node --test tests/unit/admin-save.test.mjs` / Expected: FAIL（admin-save.js が無い）

- [ ] **Step 3: `admin-save.js` を作る** — 即時関数で `globalThis.ADMIN_SAVE = { create }`。DOM には触らない。storage の例外は全部 try で受けて `{ok:false, reason:'storage'}`。

- [ ] **Step 4: 走らせて通るのを確かめる** — Run: `node --test 'tests/unit/*.test.mjs'` / Expected: 全部 PASS

- [ ] **Step 5: コミット** — `git add admin-save.js tests/unit/admin-save.test.mjs && git commit -m "管理: 端末のセーブ部品 admin-save.js"`

### Task 2: サーバーの管理関数 `supabase/admin.sql`

**Files:**
- Create: `supabase/admin.sql`、`tests/sql/test_admin.sql`
- Modify: `tests/sql/run.sh`（schema.sql の後に、auth の代わり → admin.sql を2回 → test_schema.sql → test_admin.sql）

**Interfaces:**
- Consumes: schema.sql の `scores`・`daily_scores`・`rpg_players`・`ng_words()`。Supabase の `auth.uid()`（`current_setting('request.jwt.claim.sub', true)::uuid` と同じ。ローカルでは run.sh が `create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;` を作る。admin.sql には書かない）
- Produces（すべて `jsonb` を返す。権限が無ければ例外 `insufficient_privilege` / SQLSTATE 42501、メッセージ `admin only`）:
  - テーブル `admins(user_id uuid primary key, note text not null default '', created_at timestamptz not null default now())`
  - テーブル `admin_log(id bigint identity pk, at timestamptz default now(), user_id uuid, action text, kind text, detail jsonb)`
  - テーブル `admin_trash(id bigint identity pk, at timestamptz default now(), kind text not null, row_data jsonb not null, restored_at timestamptz)`
  - `admin_check() returns void`
  - `admin_whoami() → {ok:true, user_id}`（ログイン後の確認用）
  - `admin_stats() → {ok, counts:{scores, daily, rpg}, today:{scores, daily}, week:{scores, daily}, last_at, recent_log:[最新5件]}`（today/week は日本時間、week は `jst_week_start()`。last_at は3テーブルの created_at / updated_at の最大）
  - `admin_list(p_kind text, p_filter jsonb) → {ok, total, rows:[...]}`: p_kind は `scores`|`daily`|`rpg`|`trash`。filter: `q`（名前の部分一致、NFKC＋小文字）、`board`（scores）、`period`（`all`|`week`、scores）、`day`（daily、'YYYY-MM-DD'）、`sort`（`new`|`best`。best は scores=time_ms 昇順、daily=correct 降順→time_ms 昇順、rpg=lv 降順→dungeons 降順→floors 降順）、`limit`（1..500、既定100）、`offset`（既定0）。rows は `to_jsonb(行)` から `token_hash` を抜いたもの（列を名前で並べない。あとで列が増えても動く）。trash は30日より古いものと restored のものを出さない
  - `admin_boards() → {ok, boards:[{board, n}]}`（scores にある board と件数）
  - `admin_delete(p_kind text, p_ids bigint[]) → {ok, deleted}`: 行を `admin_trash` に入れてから消す。admin_log に1件（detail に ids）
  - `admin_restore(p_trash_ids bigint[]) → {ok, restored, failed}`: `jsonb_populate_record` で元のテーブルに `overriding system value` で入れる。1件ずつ begin/exception で、ぶつかったら failed に数える。成功したら restored_at
  - `admin_rename(p_kind text, p_id bigint, p_name text) → {ok, nickname} | {ok:false, reason:'bad_name'|'ng_name'|'name_taken'|'not_found'}`: 名前のルールは本編と同じ（前後の空白を取って 1〜12文字、`ng_words()` を NFKC＋小文字で含むと ng_name）。rpg は他の行と同じ名前（NFKC＋小文字）なら name_taken。p_name が null なら `名無しの旅人` ＋ 3桁の乱数（rpg で重複したら振り直し）
  - `admin_log_list(p_limit int, p_offset int) → {ok, total, rows}`
- 中に delete がある（admin_delete）ので本番は SQL Editor で流す（§5）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/sql/test_admin.sql`。冒頭で `insert into admins values ('00000000-0000-0000-0000-00000000000a')`。呼ぶときの3通り:
  - `set role anon; select set_config('request.jwt.claim.sub','',false);`
  - `set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);`（admins に居ない）
  - `set role authenticated; select set_config(...,'...0a',false);`（チコ）
  テスト:
  - `anon_cannot_call_any`: 全 admin_ 関数で anon は例外（42501。anon は execute 権限が無いので permission denied も 42501）
  - `stranger_cannot_call_any`: 全 admin_ 関数で b は例外 `admin only`、scores の件数が変わらない
  - `admin_stats_counts`: scores 2件・daily 1件・rpg 1件を入れて counts が {2,1,1}
  - `list_hides_token_hash`: rpg の rows[0] に `token_hash` キーが無い、`nickname` はある
  - `list_filters`: q・board・period・day・sort・limit が効く（best の並びを確認）
  - `delete_moves_to_trash_and_logs`: 消すと scores 0件、trash 1件、admin_log 1件（action='delete'）
  - `restore_brings_back_same_id`: 戻すと同じ id・同じ値、trash の restored_at が入る、list trash に出ない
  - `restore_conflict_counts_failed`: daily を消す→同じ日・同じ名前の行を新しく入れる→戻すと `{restored:0, failed:1}`
  - `rename_rules`: '' → bad_name、13文字 → bad_name、'ＦＵＣＫ' → ng_name、rpg で他人の名前 → name_taken、null → `^名無しの旅人[0-9]{3}$`、成功で admin_log action='rename'（detail に before/after）
  - `tables_not_readable`: anon と authenticated で `select * from admins` / `admin_log` / `admin_trash` が permission denied

- [ ] **Step 2: 走らせて失敗を確かめる** — Run: `bash tests/sql/run.sh` / Expected: admin.sql が無くて止まる

- [ ] **Step 3: `supabase/admin.sql` を書き、run.sh を直す** — 2回流しても壊れない形（`create table if not exists`、`create or replace function`）。

- [ ] **Step 4: 走らせて通るのを確かめる** — Run: `bash tests/sql/run.sh` / Expected: 最後まで流れて終了コード 0

- [ ] **Step 5: コミット** — `git commit -m "管理: Supabase の管理関数 admin.sql"`

### Task 3: Supabase 通信 `admin-api.js`

**Files:**
- Create: `admin-api.js`
- Test: `tests/unit/admin-api.test.mjs`

**Interfaces:**
- Consumes: なし（fetch・sessionStorage・Date.now は引数で差しかえられる）
- Produces: `globalThis.ADMIN_API.create({ fetch, storage = sessionStorage, now = () => Date.now(), url, key })` が返す:
  - `login(email, password) → {ok:true} | {ok:false, reason:'bad_login'|'network'|'not_admin'}`: `POST {url}/auth/v1/token?grant_type=password`（headers `apikey`、body `{email,password}`）。成功したら `adminAuth` に `{access_token, refresh_token, expires_at(ms), last(ms)}`。続けて `admin_whoami` を呼び、42501（HTTP 401/403 で code '42501'）なら保存を消して not_admin
  - `logout()`: `POST {url}/auth/v1/logout`（失敗しても無視）→ `adminAuth` を消す
  - `loggedIn() → boolean`: 保存があり、`now - last < 30分`（1800000）。30分を過ぎていたら保存を消して false
  - `call(name, args) → 返事の JSON`: `POST {url}/rest/v1/rpc/{name}`、headers `apikey` と `Authorization: Bearer <access_token>`。期限の60秒前を過ぎていたら先に refresh（`grant_type=refresh_token`）。401 なら1回だけ refresh してやり直し。refresh も失敗なら保存を消して `Error('relogin')`（e.code='relogin'）。成功するたび `last = now`。8秒で打ち切り
- 例外の形: `Object.assign(new Error(msg), { code })`、code は `relogin`|`denied`（42501）|`network`|`http`

- [ ] **Step 1: 失敗するテストを書く** — 偽の fetch（呼ばれた URL・headers を記録し、決めた応答を返す）。テスト:
  - `login_saves_session_in_given_storage`: 成功で storage の `adminAuth` に access_token、localStorage 相当には何も書かない（storage 以外を渡さない）
  - `login_bad_password`: 400 → `bad_login`、保存なし
  - `login_not_admin_clears`: token は取れたが whoami が 403 `{"code":"42501"}` → `not_admin`、保存なし
  - `call_sends_bearer_and_apikey`
  - `call_refreshes_when_near_expiry`: expires_at が now+30秒 → 先に refresh が呼ばれ、新しい token で rpc
  - `call_retries_once_on_401`: rpc 401 → refresh → rpc 200 で結果を返す。2回目も 401 なら `relogin`
  - `idle_30min_logs_out`: last が 31分前 → loggedIn false・保存が消える
  - `denied_maps_to_code`: rpc 403 `{"code":"42501"}` → e.code 'denied'

- [ ] **Step 2: 走らせて失敗を確かめる** — Run: `node --test tests/unit/admin-api.test.mjs` / Expected: FAIL

- [ ] **Step 3: `admin-api.js` を作る**

- [ ] **Step 4: 走らせて通るのを確かめる** — Run: `node --test 'tests/unit/*.test.mjs'` / Expected: PASS

- [ ] **Step 5: コミット** — `git commit -m "管理: Supabase 通信 admin-api.js"`

### Task 4: 管理ページと「端末」タブ（D1〜D5・D7〜D12・D14）

**Files:**
- Create: `admin.html`、`admin.js`
- Test: `tests/e2e/admin_device.test.mjs`
- Modify: `tests/e2e/helpers.mjs`（`openApp` に `path` 引数を足して `admin.html` を開けるようにする。既定は今のまま）

**Interfaces:**
- Consumes: Task 1 の `ADMIN_SAVE.create(localStorage)`、`SOUND`（sound.js のグローバル。名前は sound.js を見て合わせる）
- Produces: `admin.html` の構造（Task 5 が足す）:
  - 上のタブ `<nav id="adm-tabs">` に `button[data-tab]`：`device`（端末）・`rank`（ランキング）・`log`（ログ）。中身は `section#tab-device` などで、表示中以外は `hidden`
  - 画面上部に `#adm-who`（ログイン中のメール、未ログインなら「ログインしてない」）と `#adm-logout`
  - トースト `#adm-toast`（role=status）
  - 端末タブの区画（`<details>` で畳める）: `#d-saves`（D1 一覧＋選んだキーの `<textarea id="d-json">`＋保存/消す/コピー）、`#d-backup`（D3 ダウンロード＝`a[download=country-drill-save-YYYYMMDD.json]`／ファイル読み戻し）、`#d-snaps`（D4）、`#d-rpg`（D5: コイン±1000/±10000、Lv 入力、ダンジョンごとの select 0..5、全部開く、全部クリア、ストーリー既読を消す、天井カウンター、カードをあげる＝国コード入力、冒険データを消す）、`#d-badges`（D7: 全部取る・全部消す・一覧のチェックで1個ずつ）、`#d-daily`（D8: 日付入力（既定は今日）→20問の表＝番号・国旗の国名・形式・答え、今日をやり直す）、`#d-settings`（D9: settings の各項目をフォームで、初回状態に戻す）、`#d-sound`（D10: `SOUND.kinds` のボタンを並べて鳴らす）、`#d-jump`（D11: 本編へのリンク `./`・`./#rpg`・`./#badges`・`./?rpgdebug=1#rpg` など、`target=_blank`）、`#d-env`（D12）、`#d-check`（D14 の結果）
  - 危ない操作（消す・読み戻す・初回状態・全部クリア）は `confirm()` で確かめる。確かめる前に自動で `snapSave('自動 <操作名> <時刻>')`
- 見た目: 本編の色の決まり（`:root` ライト、`prefers-color-scheme: dark` は `:root:not([data-theme=light])`、`[data-theme=dark]`）に合わせ、`settings.theme` を読んで `data-theme` を付ける（admin.js の最初で。インライン script は使えない）。スマホ幅 390px で横スクロールが出ない。

- [ ] **Step 1: 失敗する e2e を書く** — `openApp(browser, { path: 'admin.html', storage: {...} })`。テスト（各テストでページのエラー0）:
  - `device_tab_lists_saves`: storage に settings・rpg → `#d-saves` に両方のキー名
  - `edit_json_saves_and_rejects_broken`: `{` を保存 → トーストに「JSONが壊れてる」、localStorage 変わらず
  - `rpg_coins_and_unlock`: ＋10000 → localStorage rpg の coins が +10000、全部開く → 全ダンジョン 4 以上
  - `backup_download_name`: ダウンロードのファイル名が `country-drill-save-` ＋ 8桁の数字 ＋ `.json`
  - `daily_answers_table`: `#d-daily` の表が 20行
  - `snap_restore`: 保存 → コイン変更 → 戻す → コインが元に
  - `no_horizontal_scroll_phone`: 390px で `document.documentElement.scrollWidth <= 390`
  - `csp_present_and_noindex`: meta の CSP と robots を確認

- [ ] **Step 2: 走らせて失敗を確かめる** — Run: `node --test --test-concurrency=1 tests/e2e/admin_device.test.mjs` / Expected: FAIL

- [ ] **Step 3: `admin.html` と `admin.js` を作り、helpers.mjs に path を足す**

- [ ] **Step 4: 走らせて通るのを確かめる** — Run: `node --test --test-concurrency=1 'tests/e2e/*.test.mjs'` / Expected: 新しいテストは PASS、既存も今までどおり（開発用パネルの不安定な1件は以前から）

- [ ] **Step 5: コミット** — `git commit -m "管理: admin.html と端末タブ"`

### Task 5: ログインとランキング管理タブ（S1〜S4・S6・S7・S12〜S14）＋エラー記録（D13）

**Files:**
- Modify: `admin.html`、`admin.js`、`index.html`（D13: `window.addEventListener('error')` と `unhandledrejection` で localStorage `adminErrors` に `{at, msg, src, line}` を最新50件。既存の head の先読みスクリプトの近くに数行、本編のふるまいは変えない）
- Modify: `tests/e2e/helpers.mjs`（偽 Supabase に `/auth/v1/token` と `admin_` 関数を足す: `db.admin = { password, isAdmin }`、admin_list などは偽DBの rows から返す）
- Test: `tests/e2e/admin_rank.test.mjs`

**Interfaces:**
- Consumes: Task 3 の `ADMIN_API.create(...)`（login/logout/loggedIn/call）、Task 2 の関数名と返事の形
- Produces（画面）:
  - 未ログインのランキングタブ: `#r-login`（email・password・［ログイン］）。失敗理由を `#r-login-msg` に（bad_login=「メールかパスワードがちがうよ」、not_admin=「このアカウントは管理者じゃないよ」、network=「つながらなかった」）
  - ログイン後: `#r-dash`（S1 件数・今日/今週・最後の記録・最近の操作5件・S14「最後の記録から n日（7日で Supabase が止まる）」を5日以上で警告色）、`#r-kind`（scores/daily/rpg/ゴミ箱 の切りかえ）、絞りこみ（q・board の select（admin_boards から）・period・day・sort）、表 `#r-table`（チェック・各列・［名前を変える］）、［選んだのを消す］［このページを CSV］（S13、`country-drill-<kind>-YYYYMMDD.csv`、BOM 付き UTF-8）、ゴミ箱では［選んだのを戻す］、ページ送り（100件ずつ）
  - S7 名前変更は `prompt()` に今の名前、空で OK なら名無し（p_name=null）
  - `#tab-log`: 操作ログ（admin_log_list）と端末のエラー記録（D13: 一覧・コピー・消す）。エラー記録はログイン不要
  - `relogin` の例外ではログイン画面に戻し「ログインし直してね」

- [ ] **Step 1: 失敗する e2e を書く**:
  - `login_wrong_password_message`
  - `login_not_admin_message`
  - `login_shows_dashboard_counts`
  - `list_delete_restore`: scores 2件 → 1件選んで消す（confirm を受ける）→ 表が1件 → ゴミ箱で戻す → 2件
  - `rename_to_anonymous`: prompt に空 → 偽DBの名前が `名無しの旅人` で始まる
  - `xss_name_is_text`: 名前 `<img src=x onerror="window.__xss=1">` の行が文字のまま出て、`window.__xss` が undefined、エラー0
  - `session_not_in_localstorage`: ログイン後の localStorage に access_token を含む値が無い、sessionStorage `adminAuth` はある
  - `csv_download_name`
  - `error_log_records_main_page_errors`: 本編（index.html）で `setTimeout(() => { throw new Error('test-boom') })` を起こす → admin.html のログタブに `test-boom`

- [ ] **Step 2: 走らせて失敗を確かめる** — Run: `node --test --test-concurrency=1 tests/e2e/admin_rank.test.mjs` / Expected: FAIL

- [ ] **Step 3: 実装する**

- [ ] **Step 4: 全テストを走らせる** — Run: `node --test 'tests/unit/*.test.mjs' && bash tests/sql/run.sh && node --test --test-concurrency=1 'tests/e2e/*.test.mjs'` / Expected: PASS（既知の不安定な1件を除く）

- [ ] **Step 5: コミット** — `git commit -m "管理: ログインとランキング管理、エラー記録"`

### Task 6: 本番の手順書

**Files:**
- Create: `docs/admin-setup.md`

- [ ] **Step 1: 書く** — チコ向け、画面の名前つきで: ① Supabase → Authentication → Users → Add user（メール・パスワード、Auto Confirm User を ON）② Authentication → Sign In / Providers → Allow new users to sign up を OFF ③ SQL Editor に `supabase/admin.sql` を貼って Run ④ Users で自分の User UID をコピーし `insert into admins (user_id, note) values ('<UID>', 'チコ');` を Run ⑤ `https://chikokunn1011.github.io/country-drill/admin.html` でログインして確認。パスワードは長くする・他で使わない、を一言。
- [ ] **Step 2: コミット** — `git commit -m "管理: 本番の手順書"`

## 第2弾（この計画の外）

共通プロフィールが本番に入ったら別の計画で: S5 プロフィール、S9 怪しい記録、S10 NGワードのテーブル化、S11 引き継ぎコード、D6 英雄の塔、`admin_list` のプロフィール名対応、S8 2段階認証。
