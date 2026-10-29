# PR0 #25・#26 のあとの整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** #25（管理用サイト）と #26（共通プロフィール）をマージした main で、`?v=` が「同じ数なら同じ中身」であることをテストで止め、PR1〜PR9 が落ちない土台にする。

**Architecture:** アプリの動きは変えない。`tests/e2e/cache_bust.test.mjs` に「main の歴史で同じ `ファイル?v=数` が別の中身で出たことがない」を確かめるテストを1つ足すだけ（ずれていれば `index.html` の `?v=` も上げる）。

**Tech Stack:** 素の JS（ブラウザ）、node:test、Playwright（tests/e2e）、PostgreSQL 16（tests/sql/run.sh）、git。

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「実装の順番」の PR0 の行と「テストの方針」）

## 今の main（5c42bee、#25・#26 マージ後）で済んでいること

この計画は両 PR のマージ前に書いた。マージ後の main を読んで、次はもう済んでいたので計画から外した（もとの Task 1〜3）。

- `LOCAL_KEYS` に `adminSnaps`・`adminErrors`・`adminAuth` が入っている（`profile.js:156〜157`、707326c）。`tests/unit/transfer-keys.test.mjs` の `transfer_keys_cover_code` がコードから拾うキー（`admin-api.js` の `const KEY = 'adminAuth'`・`admin-save.js`・`index.html` の `adminErrors`）を一覧と比べるので、抜けたら落ちる。
- `tests/e2e/helpers.mjs` の `fakeDb()` は最後が `const db = { profiles, transfers, rows, rpgRows, dailyRows, calls: [], down: false, rpc }; addAdmin(db, { byId, nameProblem }); return db;`（288〜290 行目）で、プロフィールと管理の両方の形。プロフィールの行（`profile_id` つき）が管理の一覧に名前と pid で出て、消せて、ゴミ箱にも pid で出ることは `admin_rank.test.mjs` の `profile_rows_show_profile_name_and_pid`・`delete_all_of_profile_by_pid` など（1005 行目〜）が確かめている。
- `tests/sql/test_admin.sql` は `rpg_register` を使わず直接 insert（360 行目）。`admin_rename` は `profile_clean_name(p_name)` で trim するようになり、テストもそれを確かめる（414〜418 行目）。
- `daily.js` は `?v=3`、`badges.js` は `?v=9`（1e924d5）。`ranking.js?v=5`・`rpg-rank.js?v=9`。今の `index.html` の `ファイル?v=数` は、`origin/main` の first-parent の歴史で別の中身に使われたものが無い（手で確かめた）。
- 末尾にあった「この PR ではやらないこと」の2件（管理の「名前を変える」がプロフィールの名前を変えない・「冒険データを消す」がプロフィールの合言葉を入れない）は、707326c・1e924d5 で直っている（`admin_rename` が `profile_id` の行ならプロフィールの名前を変える。`admin-save.js` の `queueRankDel` が `profile.token` を `rpgUnreg` に積む）。

## Global Constraints

- main（#25・#26 マージ後）の上で作る。行番号は 5c42bee で数えたもの。
- 出題は国旗・国名・場所だけ。首都を問わない（この PR は出題にさわらない）。
- 新しい色は作らない。作るなら `:root`・`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`・`:root[data-theme="dark"]` の3か所（この PR では CSS にさわらない）。
- `?v=` は「そのとき main にある数 +1」。設計書には数を書かない。ただし「+1」が main の歴史で別の中身に使った数とぶつかるとき（Task 1 の `same_version_same_content` が落ちるとき）は、そのファイルが main の歴史で使った最大の数 +1 にする（PR1〜PR9 も同じ決まり）。
- 中身を変えた js/css は `index.html` の `?v=` を上げる（`tests/e2e/cache_bust.test.mjs` の `changed_files_bump_version`）。
- コミットメッセージは日本語。末尾に次の2行:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`
- テスト: `node --test 'tests/unit/*.test.mjs'`、`cd tests/e2e && node --test --test-concurrency=1 '*.test.mjs'`（`npm ci` 済み。CDN はブロックされるので helpers が差しかえる）、`bash tests/sql/run.sh`。

## Review Focus

1. マージで `?v=` を低いほうに解くと、同じ数で別の中身が配られる（#26 と #25 がどちらも `daily.js` を `?v=1→2` にしていた件は 1e924d5 で `?v=3` にして直した）。次に同じことが起きたら Task 1 の `same_version_same_content` が止める。
2. テストが何も比べずに通る（`origin/main` の歴史を読めていない・正規表現が何も拾わない）のを防ぐ。Task 1 Step 2 で、わざと `daily.js?v=2` に戻して落ちることを確かめる。

---

### Task 1: `?v=` を「同じ数なら同じ中身」にそろえる

**Files:**
- Modify: `tests/e2e/cache_bust.test.mjs`（テストを1つ足す。ブラウザは使わない）
- Modify: `index.html`（テストが名前を出したファイルの `?v=`）

**Interfaces:**
- Consumes: `cache_bust.test.mjs` の `git(...)`・`versions(html)`（#26）
- Produces: テスト `same_version_same_content`。PR1〜PR9 はこれと `changed_files_bump_version` の両方を通す

- [ ] **Step 1: テストを書く** — `same_version_same_content`
作業中の `index.html` の各 `ファイル?v=数` について、`git rev-list --first-parent origin/main` の各コミットの `index.html` で同じ数が出ていたら、そのコミットのファイル（`git rev-parse <c>:<file>`）と作業中のファイル（`git hash-object <file>`）が同じであること。`origin/main` が無ければ `changed_files_bump_version` と同じく diagnostic を出して return。過去どうしの重なり（rpg-core.js?v=2 など）は見ない。

```js
assert.deepEqual(problems, []);   // 例: 'daily.js?v=2（<コミット7桁> で別の中身）'
```

- [ ] **Step 2: テストが本当に比べているのを確かめる**
今の main は 1e924d5 でそろえてあるので、そのままでは PASS する。`index.html` の `daily.js?v=3` を一時的に `daily.js?v=2` にして実行する（`daily.js?v=2` は main の歴史で中身 93f1f30 として出ていて、今の daily.js とちがう）。
Run: `cd tests/e2e && node --test cache_bust.test.mjs`
Expected: FAIL（`daily.js?v=2（<コミット7桁> で別の中身）`）。確かめたら `daily.js?v=3` に戻し、PASS を確かめる。

- [ ] **Step 3: テストが名前を出したファイルがあれば、その `?v=` を「そのファイルが main の歴史で使った最大の数 +1」にする**（今の main では無いはず）
`git log -p --first-parent origin/main -- index.html | grep -o '<file>?v=[0-9]*' | sort -t= -k2 -n | tail -1` で最大を見る。

- [ ] **Step 4: 通るのを確かめる**
Run: `cd tests/e2e && node --test --test-concurrency=1 '*.test.mjs'`、`node --test 'tests/unit/*.test.mjs'`、`bash tests/sql/run.sh`
Expected: 3つとも fail 0。とくに `transfer-keys`・`cache_bust`（2つとも）・`events-doc`・`theme`・`pc_layout`

- [ ] **Step 5: コミット** — `git add tests/e2e/cache_bust.test.mjs index.html`、メッセージ「同じ ?v= で別の中身を配らないテストを足す」（Step 3 で ?v= を上げたら「…テストを足し、ずれた ?v= を上げる」）＋末尾2行
