# PR0 #25・#26 のあとの整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #25（管理用サイト）と #26（共通プロフィール）をマージした main で、unit・e2e・sql のテストを全部通し、`?v=` を「同じ数なら同じ中身」にそろえて、PR1〜PR9 が落ちない土台にする。

**Architecture:** アプリの動きは変えない。変えるのは `profile.js` の `LOCAL_KEYS`（一覧の文字だけ）、テストの土台（`tests/e2e/helpers.mjs` の `fakeDb`、`tests/sql/test_admin.sql`）、`index.html` の `?v=` だけ。`?v=` は「main の歴史で同じ `ファイル?v=数` が別の中身で出たことがない」を確かめるテストを足して、それに従って上げる。

**Tech Stack:** 素の JS（ブラウザ）、node:test、Playwright（tests/e2e）、PostgreSQL 16（tests/sql/run.sh）、git。

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「実装の順番」の PR0 の行と「テストの方針」）

## Global Constraints

- 実装を始めるのは #25 と #26 が main にマージされたあと。main の上で作る。ファイルの行番号はマージ前のブランチで数えたもの（すべて「マージ後に再確認」）。
- 出題は国旗・国名・場所だけ。首都を問わない（この PR は出題にさわらない）。
- 新しい色は作らない。作るなら `:root`・`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`・`:root[data-theme="dark"]` の3か所（この PR では CSS にさわらない）。
- `?v=` は「そのとき main にある数 +1」。設計書には数を書かない。ただし「+1」が main の歴史で別の中身に使った数とぶつかるとき（Task 4 の `same_version_same_content` が落ちるとき）は、そのファイルが main の歴史で使った最大の数 +1 にする（PR1〜PR9 も同じ決まり）。
- 中身を変えた js/css は `index.html` の `?v=` を上げる（`tests/e2e/cache_bust.test.mjs` の `changed_files_bump_version`）。
- コミットメッセージは日本語。末尾に次の2行:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`
- テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（先に `cd tests/e2e && npm ci`。CDN はブロックされるので helpers が差しかえる）、`bash tests/sql/run.sh`。

## Review Focus

1. マージで `?v=` を低いほうに解いた（例: #26 の `rpg-rank.js?v=6` と #27 の `?v=7`、どちらも `ranking.js?v=4`）→ 同じ数で別の中身が配られる。Task 4 の `same_version_same_content` が止める。
2. #25 と #26 がどちらも `daily.js` を `?v=1→2` にしている → 2回目のマージのあと、`?v=2` を先に読んだ人に古い daily.js が残る。Task 4 で同じテストが止める。
3. `admin-api.js` の `const KEY = 'adminAuth'`（sessionStorage）を transfer-keys の走査が localStorage のキーとして拾う → 一覧に無いと落ちる。Task 1 のアサーションで固定。
4. プロフィールで送った行（`profile_id` つき）が管理ページの一覧に出て消せること → Task 2 の `admin_lists_profile_rows`。
5. trim 文字を比べる SQL テストが、正規表現が何も拾わず null どうしで「同じ」になって素通りする → Task 3 で `length(a) > 10` も確かめる。

---

### Task 1: LOCAL_KEYS に管理ページのキーを足す

**Files:**
- Modify: `profile.js:155`（`const LOCAL_KEYS = [...]`。マージ後に再確認）
- Modify: `index.html`（`profile.js?v=` を main の数 +1）
- Test: `tests/unit/transfer-keys.test.mjs`

**Interfaces:**
- Consumes: #26 の `TRANSFER_KEYS`・`LOCAL_KEYS`（profile.js）、#25 の localStorage キー `adminErrors`（index.html・admin.js）・`adminSnaps`（admin-save.js の `const SNAPS`）、sessionStorage キー `adminAuth`（admin-api.js の `const KEY`）
- Produces: `LOCAL_KEYS` に `'adminErrors', 'adminSnaps', 'adminAuth'` が入った状態。`TRANSFER_KEYS` は変えない（PR4・PR6 がここに足す）

- [ ] **Step 1: 失敗するテストを書く** — `transfer_keys_lists` の LOCAL_KEYS のループに3つ足す

```js
for (const k of [/* 今の10個 */, 'adminErrors', 'adminSnaps', 'adminAuth'])
  assert.ok(list('LOCAL_KEYS').includes(k), `LOCAL_KEYS に ${k} がない`);
```

- [ ] **Step 2: 落ちるのを確かめる**
Run: `node --test tests/unit/transfer-keys.test.mjs`
Expected: FAIL（`transfer_keys_lists` が `LOCAL_KEYS に adminErrors がない`、`transfer_keys_cover_code` が `adminAuth（admin-api.js）`・`adminErrors（admin.js）`）

- [ ] **Step 3: `LOCAL_KEYS` の末尾に `'adminErrors', 'adminSnaps', 'adminAuth'` を足す**
上のコメントに1行:「admin で始まるものは管理ページ（admin.html）だけが使う。adminAuth は sessionStorage だが、走査が `const KEY =` で拾うのでここに入れる」。`index.html` の `profile.js?v=` を +1。

- [ ] **Step 4: 通るのを確かめる**
Run: `node --test 'tests/unit/*.test.mjs'`
Expected: PASS（fail 0）

- [ ] **Step 5: コミット** — `git add profile.js index.html tests/unit/transfer-keys.test.mjs`、メッセージ「引き継がないキーの一覧に管理ページのキー（adminErrors・adminSnaps・adminAuth）を足す」＋末尾2行

### Task 2: helpers の fakeDb をプロフィールと管理の両方の形にする

マージで `fakeDb()` の最後が衝突する（#26: `return { profiles, transfers, rows, ... }`、#25: `const db = { rows, ... }; addAdmin(db); return db;`）。マージのときに片方を取っていたら、ここで正しい形にする。

**Files:**
- Modify: `tests/e2e/helpers.mjs`（`fakeDb()` の最後。#26 では 268 行目、#25 では 154〜156 行目。マージ後に再確認）
- Test: `tests/e2e/admin_rank.test.mjs`

**Interfaces:**
- Consumes: #26 の偽 RPC `db.rpc.profile_create({ p_token, p_nickname })`・`db.rpc.submit_score2({ p_token, p_board, p_time_ms, p_questions })`、#25 の `addAdmin(db)` と admin_rank.test の `t()`・`login(page)`・`rows(page)`
- Produces: `fakeDb()` が返す `db` に `profiles`・`transfers`（#26）と `admin`・`auth`・`tokens`・`trash`・`adminLog`・`expireTokens`（#25）が両方ある。PR1〜PR9 の e2e はこの形を使う

- [ ] **Step 1: 失敗するテストを書く** — `admin_lists_profile_rows`（いつもの seed の2行に、プロフィールの1行を足す。`t()` に `seed: false` を渡すと openApp の乱数の seed になるので渡さない）

```js
t('admin_lists_profile_rows', async (page, { db }) => {
  db.rpc.profile_create({ p_token: 'pt-1', p_nickname: 'ぷろふ' });
  db.rpc.submit_score2({ p_token: 'pt-1', p_board: 'f2n:all:10', p_time_ms: 11111, p_questions: 10 });
  assert.equal(db.profiles.length, 1);
  page.on('dialog', d => d.accept());
  await login(page);
  await kind(page, 'scores');
  const mine = rows(page).filter({ hasText: 'ぷろふ' });
  await mine.locator('input[data-pick]').check();
  await page.click('#r-del');
  await mine.waitFor({ state: 'detached' });
  assert.equal(db.rows.length, 2);
  assert.equal(db.trash.length, 1);
  assert.equal(db.trash[0].row_data.profile_id, db.profiles[0].id);   // 戻すときに profile_id を失わない
});
```

- [ ] **Step 2: 落ちるのを確かめる**（マージで #25 側を取っていれば `db.rpc.profile_create` か `db.profiles` が無くて落ちる。#26 側を取っていれば `login` が `db.admin` 無しで落ちる。すでに両方入っていれば PASS になるので、Step 3 は確かめだけ）
Run: `cd tests/e2e && npm ci && cd ../.. && node --test --test-concurrency=1 tests/e2e/admin_rank.test.mjs`

- [ ] **Step 3: `fakeDb()` の最後を次の形にする**

```js
  const db = { profiles, transfers, rows, rpgRows, dailyRows, calls: [], down: false, rpc };
  addAdmin(db);
  return db;
```

- [ ] **Step 4: 通るのを確かめる**
Run: `node --test --test-concurrency=1 tests/e2e/admin_rank.test.mjs tests/e2e/admin_device.test.mjs tests/e2e/profile.test.mjs tests/e2e/submit.test.mjs`
Expected: PASS（fail 0）

- [ ] **Step 5: コミット** — `git add tests/e2e/helpers.mjs tests/e2e/admin_rank.test.mjs`、メッセージ「偽DBをプロフィールと管理ページの両方の形にし、プロフィールで送った行が管理の一覧に出るテストを足す」＋末尾2行

### Task 3: admin の SQL テストを #26 の古い関数止めに合わせる

#26 は `rpg_register`・`submit_score` などを old_version を返す中身に入れかえる。#25 の `tests/sql/test_admin.sql` はそれを2か所で使っていて、#26+#25 をマージした木で `bash tests/sql/run.sh` が落ちることを確かめてある（`Taro が消えたので ＴＡＲＯ は登録できる: {"ok": false, "reason": "old_version"}`、そのあと trim 文字の比較）。`supabase/admin.sql` は変えない。

**Files:**
- Modify: `tests/sql/test_admin.sql`（`restore_rpg_refuses_same_normalized_name` の `rpg_register(...)` の do ブロック = #25 の 359〜361 行目、trim 文字の do ブロック = 415〜419 行目。マージ後に再確認）

**Interfaces:**
- Consumes: #26 の `profile_clean_name(p_name text)`（`btrim(p_name, E'...')`）、#25 の `admin_rename`（`btrim(p_name, E'...')`、`\u` で書いてある）
- Produces: なし（テストだけ）

- [ ] **Step 1: 落ちるのを確かめる**
Run: `bash tests/sql/run.sh`
Expected: FAIL（上の old_version のメッセージ）

- [ ] **Step 2: `rpg_register(...)` の do ブロックを直接の insert にする**
`insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x13', 'ＴＡＲＯ', 1, 0, 0);`（コメント「消したあいだに、NFKC＋小文字で同じ名前の行ができた」は残す）。続くアサーション `{"ok":true,"restored":1,"failed":1}` と `array['Hana', 'ＴＡＲＯ']` は変えない。

- [ ] **Step 3: trim 文字の比べ方を「評価した文字の集まりが profile_clean_name と同じ」にする**
両方の prosrc から `btrim\(p_name, E''([^'']*)''` で中身を取り、`execute format('select E''%s''', lit) into a`（b も同じ）で文字にしてから比べる（schema.sql は文字そのまま、admin.sql は `\u` なので、書いたままでは比べられない）。

```sql
assert a is not null and length(a) > 10 and a = b,
  format('admin_rename の trim 文字は profile_clean_name と同じ: %s / %s', a, b);
```

- [ ] **Step 4: 通るのを確かめる**
Run: `bash tests/sql/run.sh`
Expected: `ALL SQL TESTS PASSED`・`ALL ADMIN SQL TESTS PASSED`・最後に `ok`

- [ ] **Step 5: コミット** — `git add tests/sql/test_admin.sql`、メッセージ「管理の SQL テストを古い関数の停止に合わせる（直接 insert・trim 文字は profile_clean_name と比べる）」＋末尾2行

### Task 4: `?v=` を「同じ数なら同じ中身」にそろえる

**Files:**
- Modify: `tests/e2e/cache_bust.test.mjs`（テストを1つ足す。ブラウザは使わない）
- Modify: `index.html`（テストが名前を出したファイルの `?v=`）

**Interfaces:**
- Consumes: `cache_bust.test.mjs` の `git(...)`・`versions(html)`（#26）
- Produces: テスト `same_version_same_content`。PR1〜PR9 はこれと `changed_files_bump_version` の両方を通す

- [ ] **Step 1: 失敗するテストを書く** — `same_version_same_content`
作業中の `index.html` の各 `ファイル?v=数` について、`git rev-list --first-parent origin/main` の各コミットの `index.html` で同じ数が出ていたら、そのコミットのファイル（`git rev-parse <c>:<file>`）と作業中のファイル（`git hash-object <file>`）が同じであること。`origin/main` が無ければ `changed_files_bump_version` と同じく diagnostic を出して return。過去どうしの重なり（rpg-core.js?v=2 など）は見ない。

```js
assert.deepEqual(problems, []);   // 例: 'daily.js?v=2（<コミット7桁> で別の中身）'
```

- [ ] **Step 2: 落ちるのを確かめる**
Run: `node --test tests/e2e/cache_bust.test.mjs`
Expected: FAIL。#26 → #25 の順でマージしていれば少なくとも `daily.js?v=2`。マージの解き方しだいで `badges.js`（#25 が上げずに変えた）・`ranking.js`・`rpg-rank.js` も出る。#26+#25 だけをマージした木で、`ranking.js?v=4` と `badges.js?v=5` が出ることは確かめてある。

- [ ] **Step 3: テストが出したファイルの `?v=` を「そのファイルが main の歴史で使った最大の数 +1」にする**
`git log -p --first-parent origin/main -- index.html | grep -o '<file>?v=[0-9]*' | sort -t= -k2 -n | tail -1` で最大を見る。

- [ ] **Step 4: 通るのを確かめる**
Run: `node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`、`node --test 'tests/unit/*.test.mjs'`、`bash tests/sql/run.sh`
Expected: 3つとも fail 0。とくに `transfer-keys`・`cache_bust`（2つとも）・`events-doc`・`theme`・`pc_layout`

- [ ] **Step 5: コミット** — `git add tests/e2e/cache_bust.test.mjs index.html`、メッセージ「同じ ?v= で別の中身を配らないテストを足し、マージでずれた ?v= を上げる」＋末尾2行

## この PR ではやらないこと（チコに確認）

マージした木を読んで見つけたが、設計書の PR0 に無く、アプリの動きを変えるもの。
- #26 のあと、ランキングに出す名前は `profiles` から取る。管理ページの「名前を変える」「名無しにする」（`admin_rename`）は `scores`・`daily_scores`・`rpg_players` の `nickname` を書くので、プロフィールで送った行では表示が変わらない。
- 管理ページの「冒険データを消す」（admin-save.js の `queueRankDel`）は `rpgRank` の合言葉だけを `rpgRankDel` に入れる。#26 のあとはプロフィールの合言葉（`rpgUnreg` に入れる側）を入れないので、冒険ランキングの行が残るかもしれない（未確認）。
