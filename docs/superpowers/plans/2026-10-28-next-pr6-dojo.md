# PR6 A6 似た国旗の道場 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** モード選択の上の帯から入る「似た国旗の道場」（`#scr-dojo`）で、SIMILAR の25グループごとに、同じグループの国だけを選択肢にした10問を練習でき、答えのあとに国旗を並べてくらべられる。

**Architecture:** 新しい `dojo.js` の前半は DOM にさわらない `globalThis.DOJO`（vm で unit テスト）、後半は即時関数で `#scr-dojo` と帯 `#to-dojo` を作る。クイズは `#scr-quiz` をそのまま使い、index.html に `G.kind === 'dojo'` の分かれ道と `startDojo({ seq, group, mode, sid })` を足す。道場は `drill:start/answer/result` を出さず、`drill:dojo` だけを出す（苦手・コイン・バッジに入れない）。

**Tech Stack:** HTML / クラシック script、node:test（unit、vm）、Playwright（e2e、`tests/e2e/helpers.mjs`）

**Spec:** `docs/superpowers/specs/2026-10-28-next-improvements-design.md`（「A6 似た国旗の道場（PR6）」・「実装の順番」・「チコに決めてほしいこと」6・7・「テストの方針」）

前提: PR0〜PR5 はマージ済み。PR2 の `flag(a)`（URL を返す）・`preloadFlags(codes)`・`MAP_SCREENS`（道場は入れない）・`mapReady`、PR4 の `streak.js`（`countToday()`、`TRANSFER_KEYS` に `'streak'`）、PR5 の `showResult` の変更がある。ファイル:行は PR5 マージ後の main（9918467）で確かめた値。

## Global Constraints

- 出題は国旗・国名だけ（道場の mode は `'f2n'` `'n2f'` のみ）。場所も首都も問わない。答えのあとに `mapSvg` を出さない。
- 新しい色は作らない（`--accent` `--ok` `--ng` `--muted` `--line` `--surface` を使う）。色の変数を書くなら3か所: `:root`／`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`／`:root[data-theme="dark"]`。
- ほかのモードの動きは変えない。index.html の変更は全部 `G.kind === 'dojo'` の分かれ道。`misses` を書かず、`drill:start` `drill:answer` `drill:result` を出さない（バッジ・冒険のコイン・苦手に入れない）。
- `DAILY_CORE.SIMILAR` を書きかえない。グループの id は最初の国コード。
- localStorage のキーは `dojo` の1つ（`const KEY = 'dojo'`）: `{ v:1, mode, mix:{'ro-td':3}, clear:{td:1} }`。変な値はその部分だけ捨てる。Supabase は変えない。
- `?v=`: `dojo.js?v=1` `dojo.css?v=1`（新規）。`profile.js?v=5→6`、`streak.js?v=1→2`（main の数 +1。PR0 の `same_version_same_content` が落ちたら、main の歴史で使った最大の数 +1）。
- 足りないもの（`DAILY_CORE` など）があれば `console.error('[dojo] …')` で帯も画面も作らない。
- コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` と `Claude-Session: https://claude.ai/code/session_0165YqqRbQ9cLHPBbRkUzhmj`。
- 毎タスクの終わりに全テスト: `node --test 'tests/unit/*.test.mjs'`、`node --test --test-concurrency=1 'tests/e2e/*.test.mjs'`（tests/e2e で `npm ci` 済み）、`bash tests/sql/run.sh`。とくに `transfer-keys` `cache_bust` `events-doc` `theme` `pc_layout`（1366×657 の setup）。

## Review Focus

1. 2か国のグループ（`qa bh`）と5か国のグループ（`no is dk fi se` など）→ 2択／4択になり、同じ国が2問続かない・10問で終われる（Task 1 `build_small_and_big`、Task 3 `round_mix_and_clear`）。
2. 引き継ぎや手でいじった壊れた `dojo`（文字列の数・知らないグループ・`v:2`・`mode:'m2f'`）→ その部分だけ捨てて表示、例外0件（Task 1 `sanitize_broken`、Task 3 `broken_storage`）。
3. 地図がまだ読めていない（world.js が返ってこない）ときに道場で1回遊ぶ → 例外なく最後まで（Task 3 `before_map_loads`）。
4. 設定の「国名も表示する」が ON のまま n2f の道場 → 選択肢に国名を出さない（答えが分かってしまう）（Task 2 `no_name_hint`）。
5. 1366×657 の PC でモード選択に帯を足しても縦スクロールしない・360px で横スクロールが出ない（Task 3 既存 `pc_layout` と `phone_width_no_scroll`）。

---

### Task 1: DOJO（道場の計算）

**Files:**
- Create: `dojo.js`（前半のみ。`globalThis.DOJO` を作る即時関数。後半は Task 3）
- Test: `tests/unit/dojo.test.mjs`（vm で `countries.js` → `daily-core.js` → `trivia.js` → `dojo.js` の順に読む。daily-core.test.mjs と同じ形）

**Interfaces:**
- Consumes: `DAILY_CORE.SIMILAR: string[][]`（無ければ `DOJO` を作らず `console.error('[dojo] DAILY_CORE が無い')`）
- Produces（`globalThis.DOJO`。どれも引数を書きかえない。DOM が無くても使える）:
  - `ROUND = 10`、`MODES = ['f2n', 'n2f']`
  - `LABEL: { [groupId]: string }` — 25個。文は daily-core.js の SIMILAR の各行のコメントそのまま（`td: '青・黄・赤のたて3色'` … `qa: 'ギザギザの白'`）
  - `build(group: string[], rand = Math.random) -> string[]` — 長さ `ROUND`、全部 group の国、どの国も1回以上、隣どうしが同じにならない
  - `pairKey(a: string, b: string) -> string` — 2つをアルファベット順に `-` でつなぐ
  - `rival(a: string, group: string[], mix: unknown) -> string` — a 以外で `mix[pairKey(a,b)]` がいちばん多い b。数が無い・同じなら group の並びで a の次の国（末尾なら先頭）
  - `sanitize(raw: unknown) -> { v:1, mode, mix, clear }`
  - `topPairs(mix: object, n = 5) -> Array<{ a, b, k }>` — 多い順（同じなら鍵の順）に最大 n 組

- [ ] **Step 1: テストを書く**

```js
test('label_covers_similar', () => { assert.deepEqual(Object.keys(D.LABEL), K.SIMILAR.map(g => g[0])); assert.equal(Object.keys(D.LABEL).length, 25);
  for (const t of Object.values(D.LABEL)) assert.ok(t.length > 0 && !/首都/.test(t)); });
test('similar_known_and_flag_trivia', () => { const all = K.SIMILAR.flat(); assert.equal(all.length, 93);
  for (const a of all) { assert.ok(byA.has(a), a); assert.ok(ctx.window.TRIVIA[a].some(x => x.k === 'flag' && x.t), a); } });
test('build_rules', () => { for (const g of K.SIMILAR) for (let s = 1; s <= 50; s++) { const q = D.build(g, seeded(s));
  assert.equal(q.length, 10); assert.ok(q.every(a => g.includes(a))); assert.deepEqual(new Set(q).size, g.length);
  for (let i = 1; i < q.length; i++) assert.notEqual(q[i], q[i - 1]); } });
test('build_small_and_big', () => { assert.equal(D.build(['qa', 'bh'], seeded(1)).filter(a => a === 'qa').length, 5);
  assert.deepEqual(plain(D.build(K.SIMILAR[0], seeded(7))), plain(D.build(K.SIMILAR[0], seeded(7)))); });
test('pair_key', () => { assert.equal(D.pairKey('td', 'ro'), 'ro-td'); assert.equal(D.pairKey('ro', 'td'), 'ro-td'); });
test('rival', () => { const g = ['td', 'ro', 'ad', 'md'];
  assert.equal(D.rival('td', g, { 'md-td': 2, 'ro-td': 3 }), 'ro'); assert.equal(D.rival('td', g, {}), 'ro');
  assert.equal(D.rival('md', g, null), 'td'); assert.equal(D.rival('ad', g, { 'ad-ro': 'x' }), 'md'); });
test('sanitize_broken', () => {
  for (const raw of [null, 'x', 1, [], { v: 2, mode: 'n2f' }]) assert.deepEqual(plain(D.sanitize(raw)), { v: 1, mode: 'f2n', mix: {}, clear: {} });
  assert.deepEqual(plain(D.sanitize({ v: 1, mode: 'm2f', mix: { 'ro-td': 3, 'bh-qa': '2', 'zz': 1, 'ad-md': -1, 'ad-ro': 1.5 }, clear: { td: 1, foo: 1, qa: 2 } })),
    { v: 1, mode: 'f2n', mix: { 'ro-td': 3 }, clear: { td: 1 } });
  const raw = { v: 1, mode: 'n2f', mix: {}, clear: {} }; D.sanitize(raw); assert.deepEqual(raw, { v: 1, mode: 'n2f', mix: {}, clear: {} }); });
test('top_pairs', () => { const m = { 'ro-td': 3, 'bh-qa': 5, 'ad-md': 3, 'a1': 0 }; // 0 は数えない
  assert.deepEqual(plain(D.topPairs(m)), [{ a: 'bh', b: 'qa', k: 5 }, { a: 'ad', b: 'md', k: 3 }, { a: 'ro', b: 'td', k: 3 }]);
  assert.equal(D.topPairs(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}-b${i}`, i + 1]))).length, 5); });
```
（`seeded(s)` は mulberry32 を使う小さい乱数、`K = ctx.DAILY_CORE`、`D = ctx.DOJO`）

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/unit/dojo.test.mjs` → FAIL（`dojo.js` が無い）
- [ ] **Step 3: `dojo.js` の前半に `DOJO` を作る** — sanitize の決まり: `mode` は `MODES` のどれか、`mix` の鍵は `/^[a-z]{2}-[a-z]{2}$/`、値は1〜1e5の整数、`clear` は `LABEL` にある id で値が `1`。build のやり方: ROUND をグループの国にできるだけ均等に配り（あまりは rand で選んだ国に1つずつ）、毎回「直前と違う国のうち残りがいちばん多い国」を選ぶ（同じ数なら rand）。こうすると2か国でも行きづまらない。
- [ ] **Step 4: 通るのを確かめる** — Run: `node --test 'tests/unit/*.test.mjs'` → PASS（fail 0。dojo.js はまだ index.html から読まない）
- [ ] **Step 5: コミット** — `git add dojo.js tests/unit/dojo.test.mjs`、メッセージ「似た国旗の道場の計算（DOJO）を足す」＋末尾2行

### Task 2: index.html の `kind:'dojo'` と引き継ぎのキー

**Files:**
- Modify: `index.html`（main 9918467 の行: `$('quit').onclick` 1049、`startDaily` 1106 の後ろに `startDojo`、`nextQuestion` 1126、`updateProgress` 1176、`answer` 1190、`factsHTML` 1278／`triviaHTML` 1302 の後ろに `flagTrivia`・`compareHTML`、`endGame` 1311、`showResult` 1324、`<style>` に `.dj-compare`）
- Modify: `profile.js:157`（`TRANSFER_KEYS` の末尾に `'dojo'`）、`tests/unit/transfer-keys.test.mjs`（期待する一覧に `'dojo'`）、`index.html` の `profile.js?v=5` → `?v=6`。このタスクの `answer` が `store.get('dojo', …)` で読むので、`transfer_keys_cover_code` が同じタスクで `'dojo'` を求める（Task 3 に回すと Task 2 の全テストが落ちる）
- Test: `tests/e2e/dojo.test.mjs`（新規。daily.test.mjs と同じ `t` で、最後に `errors` 0件）、`tests/unit/transfer-keys.test.mjs`

**Interfaces:**
- Consumes: `DOJO.rival`（Task 1。無ければ group の並びで次の国）、`preloadFlags(codes)`（PR2）、`store` `emit` `shuffle` `byA` `flag` `esc` `show` `modeOf` `pickTrivia` の作りかた、`hasTriviaText` `triviaHTML`
- Produces（index.html のグローバル。Task 3 と PR7 が使う）:
  - `startDojo({ seq: string[], group: string[], mode: 'f2n'|'n2f', sid: string }) -> void` — `G = { …startDaily と同じ形, kind: 'dojo', region: 'all', group, hint: false }`。`$('quit').textContent = 'やめて道場へ'`、`$('ptime').textContent = ''`、`preloadFlags(group)` は待たない、`show('quiz')`、`nextQuestion()`。
  - `flagTrivia(a: string) -> {k:'flag', t} | null` — `window.TRIVIA[a]` の `k === 'flag'` で文のあるものから1つ（無ければ null）。
  - `compareHTML(c, other) -> string` — `<div class="dj-compare">` に `<figure>` 2つ（`<img src="${flag(x.a)}" alt="${x.n}の国旗">` と `<figcaption>`：「正解 ○○」と、まちがえたとき「えらんだ ○○」／正解のとき「にている ○○」）。
  - イベント `drill:dojo`: 答えるたび `{ sid, phase: 'answer', a, pick, right }`、終わりに1回 `{ sid, phase: 'end', outcome: 'clear'|'quit', n, firstTry, wrongs }`。
- 分かれ道:
  - `nextQuestion`: 選択肢は `[c, ...shuffle(group から c を除く).slice(0, 3)]` を shuffle。出す前に `G.queue[0]` が直前の国と同じで、ちがう国が queue にあれば、いちばん前のちがう国と入れかえる。`showName` に `&& G.kind !== 'dojo'`。
  - 同じ国が1回に何度も出るので、「一発正解」は国ではなく問題の番号で見る: `startDojo` で `G.set = seq.map((a, i) => Object.assign(Object.create(byA.get(a)), { qi: i }))`、`answer` の `first` と `G.seen` は dojo のとき `c.qi` を鍵にする（`c.a` `c.n` はそのまま使える）。
  - `answer`: misses を読み書きせず、`drill:answer` を出さない。`drill:dojo` answer を出し、音は練習と同じ（`dopaAnswer` か `SND.play(right ? 'correct' : 'wrong')`）。まちがえたら `G.queue.push(c)`。`right && S.quick` ならすぐ `nextQuestion()`。答えの欄は verdict（練習と同じ文）＋ `compareHTML(c, right ? byA.get(DOJO.rival(c.a, G.group, store.get('dojo', {})?.mix)) : byA.get(a))` ＋ `triviaHTML([flagTrivia(c.a)].filter(Boolean))`。`factsHTML` と `mapSvg` は出さない。［次の問題 →］／最後は［道場へ →］（onclick `nextQuestion`）。
  - `updateProgress`: `practice` と同じ「覚えた x / n」「残り n問」。
  - `showResult`: 先頭で `if (G.kind === 'dojo') { endGame('clear'); return show('dojo'); }`。
  - `endGame`: dojo は `drill:result` の代わりに `drill:dojo` end を出して戻る。
  - `$('quit')`: 先頭で `if (G?.kind === 'dojo') return show('dojo');`（確認なし。`show` が `endGame('quit')` を呼ぶ）。
  - CSS: `.dj-compare { display:grid; grid-template-columns:1fr 1fr; gap:12px }`、`.dj-compare img { width:100%; aspect-ratio:3/2; object-fit:contain; border:1px solid var(--line) }`。

- [ ] **Step 1: テストを書く**（`transfer-keys.test.mjs` の期待は `[..., 'streak', 'dojo']`。e2e は `go(page, seq, group, mode = 'f2n')` = `page.evaluate` で `window.__dj = []` に `drill:dojo` を積むリスナーを付け、`startDojo({ seq, group, mode, sid: 'dj-t' })`。`TD = ['td','ro','ad','md']`、`SEQ = ['td','ro','ad','md','td','ro','ad','md','td','ro']`）

```js
t('quiz_choices_in_group', async page => { await go(page, SEQ, TD);
  for (let i = 0; i < 10; i++) { const o = await page.$$eval('#qcard .choice', bs => bs.map(b => b.dataset.a));
    assert.equal(o.length, 4); assert.ok(o.every(a => TD.includes(a)));
    assert.doesNotMatch(await page.innerText('#qcard .qlabel'), /首都|場所/); await answerCorrect(page); await page.click('#next'); }
  await go(page, ['qa','bh','qa','bh','qa','bh','qa','bh','qa','bh'], ['qa','bh']); assert.equal(await page.locator('#qcard .choice').count(), 2); });
t('quiz_events_only_dojo', async page => { await recordEvents(page); await go(page, SEQ, TD);
  await answerWrong(page); await page.click('#next'); /* 残り10問を正解 */
  for (const k of ['drill:start', 'drill:answer', 'drill:result']) assert.equal((await events(page, k)).length, 0);
  const dj = await page.evaluate(() => __dj); assert.equal(dj.filter(e => e.phase === 'answer').length, 11);
  assert.deepEqual(dj.at(-1), { sid: 'dj-t', phase: 'end', outcome: 'clear', n: 10, firstTry: 9, wrongs: 1 });
  assert.equal(await page.evaluate(() => localStorage.getItem('misses')), null);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'dojo'); });
t('quiz_wrong_compare', async page => { await go(page, SEQ, TD); await answerWrong(page);
  const [a, pick] = await page.evaluate(() => [G.cur.c.a, __dj[0].pick]);
  assert.deepEqual(await page.$$eval('.reveal .dj-compare img', is => is.map(i => i.getAttribute('src'))), await page.evaluate(([a, p]) => [flag(a), flag(p)], [a, pick]));
  assert.equal(await page.locator('.reveal svg').count(), 0); assert.equal(await page.locator('.reveal .facts').count(), 0);
  assert.equal(await page.locator('.reveal .tv[data-k="flag"]').count(), 1);
  assert.equal(await page.innerText('#pnum'), '覚えた 0 / 10'); assert.equal(await page.evaluate(() => G.queue.at(-1).a), 'td'); });
t('quiz_right_compare_rival', async page => { await go(page, SEQ, TD); await answerCorrect(page);
  assert.equal(await page.getAttribute('.reveal .dj-compare figure:nth-child(2) img', 'src'), await page.evaluate(() => flag('ro')));
}, { storage: { dojo: { v: 1, mode: 'f2n', mix: { 'md-td': 1, 'ro-td': 3 }, clear: {} } } });
t('requeue_no_repeat', async page => { await go(page, ['td', 'td', 'ro'], TD); await answerCorrect(page); await page.click('#next');
  assert.equal(await page.evaluate(() => G.cur.c.a), 'ro'); });
t('quit_back', async page => { page.on('dialog', () => assert.fail('確認を出さない')); await go(page, SEQ, TD);
  assert.equal(await page.innerText('#quit'), 'やめて道場へ'); await page.click('#quit');
  assert.deepEqual((await page.evaluate(() => __dj)).at(-1), { sid: 'dj-t', phase: 'end', outcome: 'quit', n: 10, firstTry: 0, wrongs: 0 }); });
t('no_name_hint', async page => { await go(page, SEQ, TD, 'n2f'); assert.equal(await page.locator('#qcard .cname').count(), 0);
  assert.equal(await page.locator('#qcard .choice.flagc').count(), 4); }, { storage: { setup: { mode: 'n2f', name: true, kind: 'practice', count: 10 } } });
```

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/e2e/dojo.test.mjs tests/unit/transfer-keys.test.mjs` → FAIL（`startDojo is not defined`・`dojo` が一覧に無い）
- [ ] **Step 3: 作る** — Interfaces のとおり。ほかの kind の行は変えない。
- [ ] **Step 4: 通るのを確かめる** — 全テスト → PASS（とくに `quick` `hooks` `daily` `timeattack` が今までどおり）。
- [ ] **Step 5: コミット** — `git add index.html profile.js tests/unit/transfer-keys.test.mjs tests/e2e/dojo.test.mjs`、メッセージ「クイズに道場（kind: dojo）の分かれ道を足し、dojo を引き継ぎのキーに入れる」＋末尾2行

### Task 3: 道場の画面・帯

**Files:**
- Modify: `dojo.js`（後半: DOM の即時関数。`typeof document === 'undefined'` なら何もしない）
- Create: `dojo.css`
- Modify: `index.html`（`<link rel="stylesheet" href="dojo.css?v=1">` を最後の機能 css（streak.css、392行）の後ろ、`<script src="dojo.js?v=1">` を最後の機能 script（streak.js、1593行）の後ろ。`profile.js?v=` と `TRANSFER_KEYS` は Task 2 で済んでいる）
- Test: `tests/e2e/dojo.test.mjs`

**Interfaces:**
- Consumes: Task 1 の `DOJO`、Task 2 の `startDojo` と `drill:dojo`、`C byA flag esc $ store show registerScreen`、`DAILY_CORE`
- Produces:
  - 帯: `#scr-setup .panel` の先頭に `<div class="dj-band"><button class="linkbtn" id="to-dojo">🔍 似た国旗の道場 →</button></div>`（押すと `show('dojo')`）
  - 画面: `<section id="scr-dojo" class="wrap" hidden>`（footer の前）、`registerScreen('dojo', render)`。中に `<h2>似た国旗の道場</h2>`、`<div class="seg" id="dj-mode">` の `button[data-m="f2n"]`「国旗 → 国名」・`[data-m="n2f"]`「国名 → 国旗」（`aria-pressed`）、`<p id="dj-last" role="status">`、`<div id="dj-pairs">`（記録が無ければ hidden。見出し「よく取りちがえるペア」と `li` に国旗2つ・国名2つ・`${k}回`）、`<div id="dj-groups">` に `button.dj-card[data-g=id]`×25（グループの国旗 `img`、`.dj-label` に `LABEL`、ノーミスなら `.dj-ok` ✓）
  - 保存: `load()` = `DOJO.sanitize(store.get('dojo', null))`、`save(st)` = `store.set('dojo', st)`。`drill:dojo` は自分の `sid` のときだけ: answer で `!right` なら `mix[pairKey(a, pick)]++`、end で `outcome === 'clear'` なら `#dj-last` に「${LABEL[id]}：一発正解 ${firstTry} / ${n}」（`wrongs === 0` なら「・ノーミス！」）と、`wrongs === 0` なら `clear[id] = 1`
  - カードを押す: `group = DAILY_CORE.SIMILAR` の該当行を `byA` にある国だけにしたもの、`startDojo({ seq: DOJO.build(group), group, mode: st.mode, sid: 'dojo-' + Date.now().toString(36) })`

- [ ] **Step 1: テストを書く**（`tests/e2e/dojo.test.mjs` に足す）

```js
t('band_opens_dojo', async page => { await pickSetup(page, {}); assert.match(await page.innerText('#to-dojo'), /似た国旗の道場/);
  await page.click('#to-dojo'); assert.equal(await page.isVisible('#scr-dojo'), true);
  assert.equal(await page.locator('.dj-card').count(), 25); assert.equal(await page.locator('.dj-card img').count(), 93);
  assert.equal(await page.locator('#dj-pairs').isHidden(), true); });
t('mode_switch_saved', async page => { await page.evaluate(() => show('dojo')); await page.click('#dj-mode [data-m="n2f"]');
  assert.equal(await page.getAttribute('#dj-mode [data-m="n2f"]', 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dojo')).mode), 'n2f');
  await page.click('.dj-card[data-g="no"]'); assert.equal(await page.evaluate(() => G.mode.k), 'n2f'); });
t('round_mix_and_clear', async page => { await page.evaluate(() => show('dojo')); await page.click('.dj-card[data-g="qa"]');
  /* 1問目をまちがえ、あとは全部正解して #next */ await page.locator('#scr-dojo').waitFor();
  assert.match(await page.innerText('#dj-last'), /ギザギザの白：一発正解 9 \/ 10/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dojo')).mix), { 'bh-qa': 1 });
  assert.equal(await page.locator('#dj-pairs li').count(), 1); assert.equal(await page.locator('.dj-card[data-g="qa"] .dj-ok').count(), 0);
  /* もう1回ノーミスで */ assert.equal(await page.locator('.dj-card[data-g="qa"] .dj-ok').count(), 1); });
t('broken_storage', async page => { await page.evaluate(() => show('dojo'));
  assert.equal(await page.getAttribute('#dj-mode [data-m="f2n"]', 'aria-pressed'), 'true');
  assert.equal(await page.locator('#dj-pairs li').count(), 1); assert.equal(await page.locator('.dj-ok').count(), 1);
}, { storage: { dojo: { v: 1, mode: 'x', mix: { 'ro-td': 'a', 'bh-qa': 2, zz: 3 }, clear: { td: 1, foo: 1, qa: 2 } } } });
t('dark_theme', async page => { await page.evaluate(() => show('dojo'));
  const [bg, surface] = await page.evaluate(() => [getComputedStyle(document.querySelector('.dj-card')).backgroundColor,
    (d => (d.style.background = 'var(--surface)', document.body.append(d), getComputedStyle(d).backgroundColor))(document.createElement('div'))]);
  assert.equal(bg, surface); assert.notEqual(bg, 'rgb(255, 255, 255)'); }, { storage: { settings: { theme: 'dark' } } });
t('phone_width_no_scroll', async page => { for (const s of ['setup', 'dojo']) { await page.evaluate(s => show(s), s);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), s); }
  await page.click('#dj-mode [data-m="n2f"]'); await page.click('.dj-card[data-g="no"]'); await answerWrong(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }, { viewport: { width: 360, height: 740 } });
t('before_map_loads', async page => { /* world.js は返さない（init 前に context.route で止める） */
  assert.equal(await page.evaluate(() => mapReady), false); await page.evaluate(() => show('dojo'));
  await page.click('.dj-card[data-g="td"]'); /* 10問を正解して #next */ await page.locator('#scr-dojo').waitFor(); });
t('missing_daily_core', async (page, app) => { assert.equal(await page.locator('#to-dojo').count(), 0);
  assert.equal(await page.locator('#scr-dojo').count(), 0); assert.ok(app.consoleErrors.some(m => /\[dojo\]/.test(m))); }, { blockScripts: ['daily-core.js'] });
```
（`before_map_loads` は `openApp` の前に `world.js` を止める必要があるので、`t` を使わず `openApp(browser, { init, waitMap: false })`（PR2）のあと `page.context().route('**/world.js*', () => {})` → `page.reload()` で書く。`daily-core.js` を止めると daily.js も `console.error` を出すが、`errors`（pageerror）は0件のまま）

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/e2e/dojo.test.mjs` → FAIL（`#to-dojo` が無い）
- [ ] **Step 3: 作る** — Interfaces のとおり。dojo.js 後半は daily.js と同じ NEED（`C byA flag esc $ store show registerScreen startDojo DAILY_CORE DOJO`）。`render()` は毎回 `load()` から描き直す。ペアの国名は `byA.get(x).n`、知らない国の鍵は飛ばす。dojo.css: `.dj-band` は1行（`margin: 0 0 6px`、PC でも同じ高さ）、`.dj-groups { display:grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px }`、`.dj-card` は `background: var(--surface); border: 1px solid var(--line)`、国旗は `height: 22px; object-fit: contain`、`.dj-ok { color: var(--ok) }`。
- [ ] **Step 4: 通るのを確かめる** — 全テスト → PASS。`pc_layout` の `setup`（1366×657・1024）が縦スクロールしないこと。落ちたら `.dj-band` を `#scr-setup h2` と同じ行に右寄せで置いて高さを足さない（設計書の「帯をモードカードの下の1行リンクに変える」は PR7 の判断なので、ここではしない）。
- [ ] **Step 5: コミット** — `git add dojo.js dojo.css index.html tests/e2e/dojo.test.mjs`、メッセージ「似た国旗の道場の画面とモード選択の帯を足す」＋末尾2行

### Task 4: れんぞく日数・events.md・README

**Files:**
- Modify: `streak.js`（`drill:dojo` のリスナー1つ）、`index.html`（`streak.js?v=1` → `?v=2`）
- Modify: `docs/events.md`（§2 に `drill:dojo` の行、§9 に `dojo.js` `dojo.css`、§11 の表に `drill:dojo` の行）、`tests/unit/events-doc.test.mjs`、`README.md`（今日の難問の節の後ろに「似た国旗の道場」の節）
- Test: `tests/unit/events-doc.test.mjs`、`tests/e2e/dojo.test.mjs`

**Interfaces:**
- Consumes: PR4 の `countToday()`（streak.js の内部関数）、Task 2 の `drill:dojo`
- Produces: streak.js は `drill:dojo` の `phase === 'end' && outcome === 'clear'` で `countToday()`（try/catch。quit は数えない）

- [ ] **Step 1: テストを書く**

```js
// tests/unit/events-doc.test.mjs
test('events_doc_dojo', () => { const d = doc();
  const s2 = d.split('## 2.')[1].split('## 3.')[0]; assert.ok(s2.includes('`drill:dojo`'));
  for (const k of ['phase', 'pick', 'firstTry', 'wrongs']) assert.ok(spans(s2).some(x => new RegExp('\\b' + k + '\\b').test(x)), k);
  assert.ok(d.split('## 9.')[1].split('## 10.')[0].includes('`dojo.js`'));
  assert.match(d.split('## 11.')[1], /`drill:dojo`/); });
// tests/e2e/dojo.test.mjs
t('dojo_counts_streak', async page => { await page.evaluate(() => show('dojo')); await page.click('.dj-card[data-g="td"]');
  await page.click('#quit'); assert.equal(await page.evaluate(() => localStorage.getItem('streak')), null);
  await page.click('.dj-card[data-g="td"]'); /* 10問を正解して #next */ await page.locator('#scr-dojo').waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('streak')).last), await page.evaluate(() => DAILY_CORE.jstDay())); });
```

- [ ] **Step 2: 落ちるのを確かめる** — Run: `node --test tests/unit/events-doc.test.mjs tests/e2e/dojo.test.mjs` → FAIL（`events_doc_dojo`・`dojo_counts_streak`）
- [ ] **Step 3: 作る** — events.md §2 の行: いつ「道場（`startDojo()`、`kind: 'dojo'`）で答えたとき・終わったとき（全問覚えた・やめた・ほかの画面へ）」、detail `{sid, phase: 'answer', a, pick, right}` か `{sid, phase: 'end', outcome, n, firstTry, wrongs}`、受け取るのは `dojo.js` と `streak.js`、「道場では `drill:start` `drill:answer` `drill:result` は出ない」。§11 の「`drill:dojo` は A6 で足す」を表の行に置きかえる。README: ファイル・localStorage の `dojo`・苦手やコインに入れないこと・`DOJO` の unit テスト。
- [ ] **Step 4: 通るのを確かめる** — 全テスト → PASS（`cache_bust` は streak.js と profile.js の `?v=` が上がっていること）。
- [ ] **Step 5: コミット** — `git add streak.js index.html docs/events.md README.md tests/unit/events-doc.test.mjs tests/e2e/dojo.test.mjs`、メッセージ「道場を終えた日をれんぞく日数に数え、イベントの約束に drill:dojo を書く」＋末尾2行
