# PR5 A1 結果画像のシェア Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** タイムアタックのクリア画面と今日の難問の結果に［結果をシェア］を置き、押すと 1200×675 の結果画像と短い文を OS の共有シートに渡す（渡せないときは X の投稿画面）。

**Architecture:** 新しい `share-card.js`（`window.SHARECARD`）の前半は DOM にさわらない `SHARE`・`normalize`・`layout`（vm で unit テスト）、後半は `attach(btn, data)` で、結果画面を出したときに画像を先に作って File を持っておき、押されたら同期で `navigator.share` に渡す。index.html の `showResult()` と daily.js の `render()` が data を作って `attach` を呼ぶだけ。

**Tech Stack:** HTML / クラシック script、canvas、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「A1 結果画像のシェア（PR5）」・「実装の順番」・「チコに決めてほしいこと」1・2・3・「テストの方針」）

前提: PR0〜PR4 はマージ済み。PR2（B4）の `flag(a)` は `flags/${a}.svg?v=${FLAG_V}` を返し、`startGame`/`startDaily` は async（e2e は `settle` で待つ）。ファイル:行は #26 のブランチ（`origin/claude/project-thread-e4qf97`）のもので、**マージ後に再確認**する。

## Global Constraints

- 出題は国旗・国名・場所だけ、首都を問わない。この PR は出題にさわらない。画像にも data にも国名・首都を入れない（data は `{ kind, title, big, sub, rank, flags, grid, text }` だけ）。
- プロフィールの名前とかざりは画像に入れない。今日の難問の画像に国旗を出さない（20マスの帯だけ）。ボタンはタイムアタックと今日の難問だけ（練習・挑戦には付けない）。
- 定数は share-card.js の先頭に1か所: `SHARE = { url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', w: 1200, h: 675, maxFlags: 24 }`。国旗は横8×縦3。
- 色は JS に書かない。描くときに `getComputedStyle(document.body)` で `--bg` `--surface` `--ink` `--muted` `--accent` `--ok` `--ng` `--line` を読む。新しい色の変数は作らない（作るなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`）。
- フォントは `document.fonts.load('900 80px "Zen Maru Gothic"')` を最大 2000ms 待つ（`FONT_MS = 2000`）。待ちきれなければ予備のフォントで描く。
- X は `https://twitter.com/intent/tweet?text=…&url=…` を `window.open(…, '_blank', 'noopener')`（rpg-cards.js の `share` と同じ）。`AbortError` は何もしない。保存用の小窓は作らない。
- 失敗は `console.warn('sharecard', e)`。新しいイベント・localStorage のキー・Supabase の変更は無い（`TRANSFER_KEYS` にさわらない）。
- `?v=`: `share-card.js?v=1`（新規、daily.js の `<script>` の直前）、`daily.js?v=` は「そのとき main にある数 +1」（PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。index.html はインラインなので数は無い。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。とくに `cache_bust` `events-doc` `theme` `pc_layout` `result_guard`。

## Review Focus

1. 画像を作っているあいだに［もう一回］で次のゲーム → 古い処理が新しい結果画面のボタンに File を入れない・例外が出ない（Task 2 `stale_after_again`）。
2. 国旗が1枚読めない（404）→ そのマスを `--line` の四角にして画像はできる（Task 2 `flag_404_still_ready`）。
3. 1366×657 の PC でタイムアタックの結果画面に［結果をシェア］を足しても縦スクロールしない（Task 2 `pc_result_fits`）。
4. 25か国より多いタイムアタック（全部・195問なら23枚＋「+172」）→ 「+N」のマスが出て例外なし（Task 1 `layout_overflow`、Task 2 `many_flags_ready`）。
5. 今日の難問を昨日の記録（0時30分まで）で開いたとき → タイトルは記録の日付、帯は記録どおり（Task 3 `daily_yday_title`）。

---

### Task 1: share-card.js の前半（SHARE・normalize・layout）

**Files:**
- Create: `share-card.js`（即時関数。前半だけ。DOM にさわらない）
- Test: `tests/unit/share-card.test.mjs`（新規。daily-core.test.mjs と同じく `vm` で `share-card.js` だけ読む。`ctx = { window: {} }`、`ctx.globalThis = ctx`）

**Interfaces:**
- Produces（`window.SHARECARD = { SHARE, normalize, layout, attach }`。アプリが使うのは `attach` だけ、`SHARE` `normalize` `layout` はテスト用に見せる。`window` が無いときは `globalThis`）:
  - `SHARE`（Global Constraints の値、`Object.freeze`）
  - `normalize(d: any) -> Data` — `kind` は `'ta'|'daily'`（それ以外は `'ta'`）。上の8つのキーだけを新しいオブジェクトに写す。`title` `big` `sub` `text` は文字列（無ければ `''`）、`rank` は文字列か `null`、`flags` は文字列の配列、`grid` は `'ok'|'ng'|'skip'` の配列（ほかの値は `'skip'`）。`kind === 'daily'` なら `flags = []`。
  - `layout(d: Data) -> { cells: string[], more: number, cols: number, rows: number }` — `flags.length ≤ 24` なら全部・`more 0`、それより多ければ先頭23枚と `more = length − 23`。`cols = min(8, マスの数)`、`rows = ceil(マスの数 / 8)`（マスの数 = `cells.length + (more ? 1 : 0)`）。daily は `{ cells: [], more: 0, cols: 0, rows: 0 }`。

- [ ] **Step 1: 失敗するテストを書く**

```js
const S = ctx.SHARECARD, codes = n => Array.from({ length: n }, (_, i) => `x${i}`);
test('share_const', () => assert.deepEqual(plain(S.SHARE), { url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', w: 1200, h: 675, maxFlags: 24 }));
test('layout_counts', () => {
  assert.deepEqual(plain(S.layout(S.normalize({ kind: 'ta', flags: codes(5) }))), { cells: codes(5), more: 0, cols: 5, rows: 1 });
  const l10 = S.layout(S.normalize({ kind: 'ta', flags: codes(10) })); assert.equal(l10.cols, 8); assert.equal(l10.rows, 2);
  const l24 = S.layout(S.normalize({ kind: 'ta', flags: codes(24) })); assert.equal(l24.cells.length, 24); assert.equal(l24.more, 0); assert.equal(l24.rows, 3);
});
test('layout_overflow', () => {
  const l = S.layout(S.normalize({ kind: 'ta', flags: codes(25) })); assert.equal(l.cells.length, 23); assert.equal(l.more, 2); assert.equal(l.rows, 3);
  assert.equal(S.layout(S.normalize({ kind: 'ta', flags: codes(195) })).more, 172);
});
test('layout_empty', () => assert.deepEqual(plain(S.layout(S.normalize({ kind: 'ta', flags: [] }))), { cells: [], more: 0, cols: 0, rows: 0 }));
test('daily_has_no_flags', () => {
  const d = S.normalize({ kind: 'daily', flags: ['jp', 'fr'], grid: ['ok', 'ng', 'skip', 'x'] });
  assert.deepEqual(plain(d.flags), []); assert.deepEqual(plain(d.grid), ['ok', 'ng', 'skip', 'skip']);
  assert.deepEqual(plain(S.layout(d)), { cells: [], more: 0, cols: 0, rows: 0 });
});
test('data_has_no_name_or_capital', () => {   // 国名・首都などの余計なキーは落とす
  const d = S.normalize({ kind: 'ta', title: 't', big: '1:00.0', n: '日本', c: '東京', capital: '東京', name: 'チコ', flags: ['jp'] });
  assert.deepEqual(Object.keys(d).sort(), ['big', 'flags', 'grid', 'kind', 'rank', 'sub', 'text', 'title']);
  assert.equal(d.rank, null); assert.equal(S.normalize({ kind: 'zzz' }).kind, 'ta');
});
test('normalize_does_not_mutate', () => { const x = { kind: 'daily', flags: ['jp'] }; S.normalize(x); assert.deepEqual(x.flags, ['jp']); });
```

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/unit/share-card.test.mjs` → FAIL（share-card.js が無い）
- [ ] **Step 3: 作る** — Interfaces のとおり。`attach` はこのタスクでは `() => {}` の仮。
- [ ] **Step 4: 通るのを見る** — unit → PASS。全テスト → PASS（まだ index.html から読まない）。
- [ ] **Step 5: コミット** — `git add share-card.js tests/unit/share-card.test.mjs`、`git commit -m "結果画像のシェア: マスの数と+Nを決める layout を足す"`（末尾2行）

---

### Task 2: attach（描く・File にする・共有）とタイムアタックのボタン

**Files:**
- Modify: `share-card.js`（後半）、`index.html:1203-1215`（`showResult`）、`index.html:1420` 付近（`<script src="share-card.js?v=1">` を `daily.js` の直前に）
- Test: `tests/e2e/share_card.test.mjs`（新規）

**Interfaces:**
- Consumes: Task 1 の `normalize` `layout` `SHARE`。グローバルの `flag(a) -> string`（PR2）。
- Produces:
  - `SHARECARD.attach(btn: HTMLButtonElement, data: Data) -> void` — 同期で `btn.onclick` を入れ、`btn.dataset.card = 'busy'`。うしろで フォント → `draw` → `toFile` をして、そのときも `btn.isConnected` で、同じ btn に新しい `attach` が来ていなければ File を持ち `dataset.card = 'ready'`。失敗は `console.warn('sharecard', e)` と `dataset.card = 'fail'`（押せば文だけ）。
  - 中の関数（外に出さない）: `colors() -> {bg,surface,ink,muted,accent,ok,ng,line}`、`async draw(d, L, col) -> HTMLCanvasElement`（1200×675）、`toFile(canvas) -> Promise<File>`（`image/png`、名前 `kokki-master.png`）、`share(d, file|null) -> void`。
  - 押したとき（`share`）: File があり `navigator.canShare?.({ files: [file] })` が true → `navigator.share({ files: [file], text: d.text + '\n' + SHARE.url })`。File があって canShare が false → X。File が無い（作り中・失敗）→ `navigator.share` があれば `{ text: d.text, url: SHARE.url }`、無ければ X。どれも reject が `AbortError` なら何もしない、ほかは X。
  - 画像: 背景 `--bg`、カード `--surface`。上に「国旗マスター」と `title`（`--muted`）、まん中に `big`（`--ink`、900）と `sub`・`rank`（`rank` が null なら描かない）、国旗は `layout` のマス（「+N」のマスは `--accent` の文字）、daily は `grid` を20マス（`ok` → `--ok`、`ng` → `--ng`、`skip` → `--line`）、下に `SHARE.url` から `https://` と最後の `/` を除いた文字と `SHARE.tag`。国旗は `fetch(flag(a))` → `text.replace('<svg ', '<svg width="640" height="480" ')` → Blob URL → `Image` で描き、失敗したマスは `--line` の四角。
  - index.html: タイムアタックで `window.SHARECARD` があるときだけ、`<p class="hint">${cond}</p>` の下に `<div class="row center"><button type="button" class="btn ghost" id="r-share">結果をシェア</button></div>`。`show('result')` のあとで `SHARECARD.attach($('r-share'), { kind: 'ta', title: cond, big: RANKING.formatTime(G.timeMs), sub: 'クリア！', rank: null, flags: G.set.map(c => c.a), grid: [], text: \`国旗マスター タイムアタック ${cond}\n${RANKING.formatTime(G.timeMs)} でクリア！\n${SHARECARD.SHARE.tag}\` })`（`rank` は `rankOf` の返事を待たないので null。描き直さない）。

- [ ] **Step 1: 失敗するテストを書く**（`t(name, fn, opts)` は result_guard.test.mjs と同じ形で、最後に `errors` 0件を見る。`stubShare` は init で `navigator.share = o => { window.__shared = o; return Promise.resolve(); }`・`navigator.canShare = () => true`・`window.open = u => { (window.__opened ||= []).push(u); }`。`ready = page => page.waitForSelector('#r-share[data-card="ready"]')`）

```js
t('ta_png_1200x675', async page => {      // clearTimeAttack（5問）→ ready → #r-share を押す
  const s = await page.evaluate(async () => { const f = __shared.files[0], b = await createImageBitmap(f); return { type: f.type, w: b.width, h: b.height, text: __shared.text }; });
  assert.deepEqual([s.type, s.w, s.h], ['image/png', 1200, 675]);
  assert.match(s.text, /^国旗マスター タイムアタック /); assert.match(s.text, /#国旗マスター\nhttps:\/\/chikokunn1011\.github\.io\/country-drill\/$/);
});
t('abort_does_nothing', ...)       // share が AbortError で reject → __opened が無い、errors 0件
t('other_error_opens_x', ...)      // NotAllowedError → __opened[0] が 'https://twitter.com/intent/tweet?text=' で始まり url= に SHARE.url
t('cannot_share_files_opens_x', ...) // canShare = () => false → __shared が無い、__opened が1件
t('dark_colors', ...)              // colorScheme: 'dark' → png の (4,4) の画素が rgb(15,23,28)（--bg）。ライトでは rgb(238,242,241)
t('guard_250ms', ...)              // result_guard の toLastQuestion → 最後の正解と同じタスクで #r-share を押す → __shared も __opened も無い
t('click_before_ready_text_only', ...) // init で HTMLCanvasElement.prototype.toBlob を止める → 押す → __shared は { text, url: SHARE.url }、files が無い
t('stale_after_again', ...)        // toBlob を止めたまま［もう一回］→ 2回目をクリア → 止めていた toBlob を流す → 新しい #r-share は自分の File で ready、errors 0件
t('flag_404_still_ready', ...)     // context.route('**/flags/*.svg', r => r.fulfill({ status: 404 })) のあと結果まで → ready
t('many_flags_ready', ...)         // 25か国より多い地域（アフリカなど）の count: 'all' を clearTimeAttack → ready、png の大きさは同じ（timeout 60s）
t('no_button_in_practice', ...)    // 練習・挑戦の結果に #r-share が無い
t('blocked_no_button', ..., { blockScripts: ['share-card.js'] }) // タイムアタックの結果に #r-share が無い、errors 0件
t('pc_result_fits', ..., { viewport: { width: 1366, height: 657 } }) // 結果画面で documentElement.scrollHeight <= innerHeight
```

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/e2e/share_card.test.mjs` → FAIL（`#r-share` が無い）
- [ ] **Step 3: 作る** — Interfaces のとおり。`attach` の「前の処理を捨てる」は btn ごとの番号（`WeakMap<btn, number>`）で見る。フォントは `Promise.race([document.fonts.load(…), 2000ms])`、`fonts` が無い環境でも止まらない。
- [ ] **Step 4: 通るのを見る** — `share_card` → PASS。全テスト → PASS（`result_guard`・`pc_layout`・`theme`・`timeattack` を特に見る）。
- [ ] **Step 5: コミット** — `git add share-card.js index.html tests/e2e/share_card.test.mjs`、`git commit -m "結果画像のシェア: タイムアタックのクリア画面に［結果をシェア］を足す"`（末尾2行）

---

### Task 3: 今日の難問を画像つきに

**Files:**
- Modify: `daily.js:101`（`bar`）、`daily.js:139`（`#dl-share` の onclick）、`daily.js:206-213`（`share`）、`index.html`（`daily.js?v=` を +1）、`docs/events.md` の「9. 読み込みの順番」（share-card.js を1行）、`README.md`（ファイルの説明に share-card.js を1行）
- Test: `tests/e2e/share_card.test.mjs`（足す）

**Interfaces:**
- Consumes: Task 2 の `SHARECARD.attach(btn, data)`。
- Produces（daily.js の中だけ）:
  - `grid(r) -> ('ok'|'ng'|'skip')[]`（長さ `N`。`i < r.correct` → ok、`i === r.correct && r.outcome === 'fail'` → ng、ほか skip）。`bar(r) = grid(r).map(g => ({ ok: '🟩', ng: '🟥', skip: '⬜' })[g]).join('')`。
  - `shareText(r)` は今の文と同じ（`国旗マスター 今日の難問 ${mdShort(r.day)}\n${bar(r)}\n…\n#国旗マスター`）。
  - `window.SHARECARD` があれば `SHARECARD.attach($('dl-share'), { kind: 'daily', title: \`今日の難問 ${mdShort(r.day)}\`, big: clear ? \`全問正解！ ${time}\` : \`${r.correct} / ${N} 問正解\`, sub: '', rank: r.sent?.rank ? \`${dayWord}${r.sent.rank}位\` : null, flags: [], grid: grid(r), text: shareText(r) })`。無ければ今の `share(r)`（文だけ・クリップボード）をそのまま onclick に。
  - URL は `attach` の中で `SHARE.url` を使う（設計書「今日の難問は今 `location.origin + location.pathname` を使っていますが、この定数に変えます」）。`location.origin + location.pathname` が残るのは、share-card.js が読めないときの `share(r)` だけ。

- [ ] **Step 1: 失敗するテストを書く**（daily.test.mjs の `at()` と同じ時計の固定。storage に `daily: { day: '2026-10-28', sid: 'x', status: 'done', outcome: 'fail', correct: 12, timeMs: 83400, sent: null }`、`#daily` を開いて `#dl-share[data-card="ready"]` を待つ）

```js
t('daily_png_and_text', async page => {   // 押す → png 1200×675
  assert.equal(__shared.text, '国旗マスター 今日の難問 10/28\n' + '🟩'.repeat(12) + '🟥' + '⬜'.repeat(7) + '\n12 / 20 問正解\n#国旗マスター\nhttps://chikokunn1011.github.io/country-drill/');
});
t('daily_data_no_flags', ...)    // init で SHARECARD.attach をラップして data を __data に → kind 'daily'、flags.length 0、grid.length 20、
                                 // Object.keys が8つだけ、JSON に国名（byA の n）も首都（c）も含まない。fetch された flags/*.svg が0件
t('daily_clear_big', ...)        // correct: 20, outcome: 'clear' → __data.big === '全問正解！ 1:23.4'
t('daily_yday_title', ...)       // 2026-10-28T15:10:00Z（10/29 0:10）に 10/28 の記録 → __data.title === '今日の難問 10/28'
t('daily_blocked_text_only', ..., { blockScripts: ['share-card.js'] }) // #dl-share はある → 押す → __shared.text に帯の絵文字20個、files なし（今の share(r) のまま）、errors 0件
t('daily_fallback_url', ...)     // init で toBlob を止める（作り中に押す）→ __shared.url === 'https://chikokunn1011.github.io/country-drill/'（テストのサーバーの URL ではない）
```

- [ ] **Step 2: 落ちるのを見る** — `node --test tests/e2e/share_card.test.mjs` → 新しい6つが FAIL
- [ ] **Step 3: 作る** — Interfaces のとおり。`daily.js?v=` を「main の数 +1」、events.md と README を1行ずつ。
- [ ] **Step 4: 通るのを見る** — 全テスト → PASS（`daily` `cache_bust` `events-doc` を特に見る）。
- [ ] **Step 5: コミット** — `git add daily.js index.html docs/events.md README.md tests/e2e/share_card.test.mjs`、`git commit -m "結果画像のシェア: 今日の難問のシェアを画像つきにする"`（末尾2行）
