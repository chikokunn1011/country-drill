# 統合計画: バッジ・称号（計画 C）× 国旗クエスト（計画 D）を1本にする

> 2026-10-26。ブランチ `claude/project-thread-ikxajq` に `rpg-wip` を合流したコミット（275dd5f）から始める。合流そのもの（index.html の読み込み順、tests/e2e の helpers / hooks / layout / pc_layout / ranking の両取り）は済んでいる。ここでは、計画 D の各タスクのレポートが「合流時にやること（DEFERRED-TO-MERGE）」として残した項目を当て、両方の機能が本物のまま全テストを通し、計画 D の最終レビューの残りを直し、rpg.js を分割する。

設計書: `docs/superpowers/specs/2026-10-26-badges-design.md`、`docs/superpowers/specs/2026-10-26-rpg-design.md`、`docs/superpowers/specs/2026-10-26-platform-hooks-trivia-design.md`、`docs/superpowers/specs/2026-10-26-pc-layout-design.md`。
計画 D の最終レビュー（DEFERRED-TO-MERGE の一覧と残りの minor）: `/home/claude/country-drill-rpg/.superpowers/sdd/2026-10-26-rpg/final-review.md`（読み取り専用。別の作業ツリーにあるが、ファイルを読むだけ）。

## Global Constraints

- 両方の機能（badges.js と rpg*.js）が本物のまま、`node --test 'tests/unit/*.test.mjs'`・`node --test 'tests/e2e/*.test.mjs'`・`bash tests/sql/run.sh` が全部通ること。テストを skip にしたり消したりして通さない
- スマホ幅（900px 未満）の見た目は、機能が意図して足した部分（ホームの 冒険・バッジ のボタン、結果画面のバッジのパネルと冒険のパネル、豆知識の行、トップバーの差し込み）以外は変えない。`GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs` で差が出た場面は、その理由を報告に書く（理由が「機能が足した UI」以外なら直す）
- index.html の読み込み順は固定: `pc.css` → `rpg.css` → `badges.css`、インラインの `</script>` のあとに `rpg-core.js` → `rpg.js` →（Task 3 のあとは `rpg-cards.js` →）`rpg-battle.js` → `badges.js`。badges.js は `window.RPG` があってから起動する（events.md §9）
- 計画 C・D の Global Constraints（`docs/superpowers/plans/2026-10-26-badges.md`、`docs/superpowers/plans/2026-10-26-rpg.md`）はそのまま効く。とくに: 即時関数で包む、index.html の名前を上書きしない、画面の文字は `esc()`、時間の数字は TUNING などの定数に置く、新しい外部ライブラリ・CDN を増やさない、ファイル名は半角英数字、コミットメッセージは日本語
- `docs/events.md` がイベントの正。実装を変えたら同じコミットで直す
- 各タスク1〜数コミット。タスクの最後に全スイートを通す

## Review Focus

- 両方の機能が同時に動くときの相互作用（`badge:earned` の支払い、`rpg:*` のリスナーの中で同期に走るバッジの判定、ホームのボタンの数とトップバーの差し込み、結果画面の右列の高さ）
- テストの素通り（skip・空のアサーション・`blockScripts` で本物を止めただけのテスト）が増えていないか

---

### Task 1: 合流時にやることを当てて、両方本物で全テストを通す

**Files:**
- Modify: `tests/e2e/badges.test.mjs`、`tests/e2e/ranking.test.mjs`、`tests/e2e/rpg_home.test.mjs`、`tests/e2e/pc_layout.test.mjs`、`tests/e2e/layout.mjs`、`rpg.css`（または `badges.css`）、`docs/events.md`、必要なら `README.md`
- Consumes: `tests/e2e/rpg_helpers.mjs` の `RPG_FILES`、`tests/e2e/helpers.mjs` の `openApp({ blockScripts, init, storage })`・`QUIET_BADGES`、`tests/e2e/layout.mjs` の `openScene({ badges, blockScripts })`

**Steps:**

- [ ] **Step 1: 計画 D の最終レビューの「DEFERRED-TO-MERGE」（21項目）を読む。** 1・2（index.html の順）は済み。20 は該当なし。3〜19・21 をこのタスクで当てる。項目ごとに「当てた／当てなくてよかった（理由）」を報告に書く
- [ ] **Step 2: いまの状態で全 e2e を1回流し、落ちるテストを一覧にする**（ほかの `node --test` が動いていたら終わるまで待つ: `pgrep -fl 'node --test'`）
- [ ] **Step 3: tests/e2e/badges.test.mjs（項目 3〜7）。** `RPG_FILES` を import し、`t` の `openApp` に `blockScripts: RPG_FILES` と `url: server.url + '?bdgdebug=1'` を渡す（すでに `?bdgdebug=1` ならそのまま）。`missing_global_is_safe`・`storage_unavailable`・ホームのボタンの順や空の `#topbar-extra` を見るテストにも `blockScripts: RPG_FILES`。ただし **バッジ × RPG の本物の組み合わせを見るテストは止めない**: `rpg_gacha_holds` などすでに RPG を前提にしたテストと、`badges_real_integration`（rpg_home.test.mjs、項目 13）は本物のまま通す
- [ ] **Step 4: ranking.test.mjs の `home_button_order`（項目 8）**: 期待する並びは `['home-play','home-rank','home-badges','home-settings']`（`blockScripts: RPG_FILES` のとき）。加えて、何も止めないときの並び `['home-play','home-rpg','home-rank','home-badges','home-settings']`（設計書 D §3.1 の「プレイの次に冒険」。違えば設計書 D の並びに従う）を確かめるケースを1つ足す
- [ ] **Step 5: ホームのボタン5つ（項目 9・10）**: 900〜1279px で `#home-rpg` と `#home-badges` がそろうと pc.css の `min-width: 200px` ではみ出す。`rpg.css` か `badges.css` の片方（どちらが持つかを報告に書く）に、5つあるときだけ効く規則（例 `.home .menu:has(> #home-rpg):has(> #home-badges) .btn { min-width: 0; flex: 1 1 0; }` か折り返し）を足す。`min-width: 1280px and max-height: 760px` の `laptop_150pct_fits` もまた見る。e2e で 900×700・1024×768・1280×577・1366×657・1920×1080 の5サイズで、5つのボタンと称号の札が横スクロールなし・重なりなし・ボタンの文字が1行であることを確かめる（既存の `home_*` テストに足すか新しく）
- [ ] **Step 6: docs/events.md（項目 11・12）**: §8 の `paid` の重複する2つの箇条書きを1つにまとめる。`rpg:share` の種類（`boss-{id}` `final` `cards-{n}`（50・100・195） `region-{id}` `test`）を書く
- [ ] **Step 7: rpg_home.test.mjs（項目 13・14）**: `badges_real_integration` が skip されずに通ること。`next_action_rules` を見直す
- [ ] **Step 8: layout.mjs / pc_layout.test.mjs（項目 15〜17）**: `RPG_SCENES` とバッジの場面の両方が `SCENES` にあり、`SCREEN_OF` に `badges` の行があること。`openScene` の `badges` と `blockScripts` の両方が効くこと
- [ ] **Step 9: 全スイート**（unit・e2e・sql）＋ `GEOM_BASE=auto … phone_geometry`。差が出た場面と理由を報告に書く。e2e は2回流して、2回とも同じ結果であること（片方だけ落ちたテストは、そのテスト名と落ち方を報告に書く）
- [ ] **Step 10: コミット**

Run: `node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs' && bash tests/sql/run.sh && GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs`

---

### Task 2: 国旗クエストの最終レビューの残りを直す

**Files:**
- Modify: `rpg.js`、`rpg-battle.js`、`rpg-core.js`、`rpg.css`、`docs/events.md`、`docs/superpowers/specs/2026-10-26-rpg-design.md`、`docs/superpowers/plans/2026-10-26-rpg.md`、`tests/unit/rpg-core.test.mjs`、`tests/e2e/rpg*.test.mjs`

計画 D の最終レビュー（上のパス）の「Minor: fine to merge, fix later or at integration」と、ワークフローの結果の minor 一覧を直す。1つずつ、まず落ちるテスト（あるいはアサーション）を書いてから直す。設計書からのずれで判断がいるものは次のとおり決める（コントローラの決定）:

- **直す（動作）:**
  1. rpg.js の失格／にげたトーストの仲間の一覧は、結果パネルと同じ「5か国＋ほか n か国」の上限にする
  2. rpg-battle.js の自動で進む `setTimeout` のコールバックを try/catch で包み、`console.error('[rpg]', e)` にする（render も同じ）
  3. rpg.css: 短いスマホの［にげる］は `min-height: 24px`（帯は約 56px のまま）。短いスマホの BOSS の札は `.55rem` 程度に上げる
  4. rpg.css: `.rpg-code-msg:empty { display: none }` をやめ、空のときも描いたまま（余白 0）にする（role=status）
  5. rpg.js: 設定の「冒険を表示」のスイッチは、`tx` が書けたとき（`wrote`）だけ `body.rpg-off` を切り替える
  6. ガチャ: 保存に失敗したときや、ほかのタブでコインが使われていたときは、黙らずに1行（`#ga-msg` のような status の行）かトーストで知らせる
  7. 仲間の一覧の国旗 `<img>` に `loading="lazy"`
  8. `.rpg-card-name` の `overflow-wrap: anywhere` をやめ、`word-break: auto-phrase`（対応していないブラウザは普通の折り返し）か、文字を少し小さくして、カタカナの国名が途中で切れないようにする（アルゼンチン・アゼルバイジャンで確かめる）
  9. 裏向きのガチャのカードは、タップしても詳細を開かず、めくるだけにする（表になってから詳細）。`#ga-flipall` は全部表になったら隠す（または disabled）
  10. モンスターの待機の揺れと、倒したときの縮む動き（設計書 D §11）を CSS で足す（`prefers-reduced-motion: reduce` では動かさない。ドパガキ向け設定に関係なく出す軽い動き）
  11. バトルで仲間の節目（50・100・195 か国、地域コンプ）に届いたときも、`#bt-end` に［シェア］を出す（設計書 D §3.7「その場の結果ダイアログの中に」）。クイズの失格／にげたときの節目は、そのトーストに出すのが難しければ、次に冒険ホームを開いたときの［シェア］で足りる（その場合は報告に書く）
- **直す（文書）:** 設計書 D の保存のタイミング（spec ~724）と計画 D（plan ~429・~845 の `RPG.fx(kind, el?, n?, combo?)`）を実装に合わせる。`docs/events.md` に `rpg:share` の種類（Task 1 で入っていなければ）
- **直す（重複）:** `CAP=1e9` は `RPG_CORE.BIG`（なければ rpg-core.js に export して）を使う。`SMALL_AR` は index.html の `isSmall` を `typeof` で確かめて使う（なければ自前の値）。地域の色は `DUNGEONS[].color` から `document.documentElement.style.setProperty('--rpg-r-{id}', …)` で入れるか、unit テストで rpg.css の値と一致することを確かめる（どちらでもよい。報告に書く）。「あと…回正解で仲間に」の文は1か所の関数に。使っていない `.rpg-wmapbox` は消す
- **直す（コアの端）:** `maxLevelUp` は `Infinity` でも止まる（上限を `BIG` で切る）。`migrate` の各 `step()` を try/catch で包み、失敗したらその版で止めて `sanitize` に任せる。`newRun` の `sid` は `String()` で文字列にする。`battleBag` は範囲外の floor を最後の floor に丸める。`runAnswer` の `missesAfter` が無いときは「ミスなし」ではなく「変化なし」にする
- **直す（テスト）:** `two_tabs_sync` は2枚目のページでも `[rpg]` の console.error が無いことを見る。`reset_weak` の名前を直す。`rpg-core.test.mjs` の死んだアサーション（~679）を直す。`rpg_layout.test.mjs` の使っていない `rpgErrorOk` を消す。`rpg:ready` が1回だけ出ること、`rpg:coins` の分割（R7）、通知の payload をそれぞれ1つのテストで確かめる
- **やらない:** rpg.js の分割（Task 3）

Run: `node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs'`

---

### Task 3: rpg.js を rpg.js と rpg-cards.js に分ける

**Files:**
- Create: `rpg-cards.js`
- Modify: `rpg.js`、`index.html`（`<script src="rpg-cards.js?v=1">` を rpg.js と rpg-battle.js の間に）、`tests/e2e/rpg_helpers.mjs`（`RPG_FILES` に足す）、`README.md`、`docs/superpowers/specs/2026-10-26-rpg-design.md` §12（ファイル構成）、`docs/events.md`（ファイル名が出ていれば）

**Steps:**

- [ ] **Step 1:** rpg.js の「ガチャ・仲間」のブロックと「世界地図・シェア・演出」のブロック（`STAR_NAME` から `fx` まで、約 400 行）を `rpg-cards.js` に移す。移す側が使う rpg.js の閉じた関数（`tx` `get` `open` `nextFloor` `milestones` `drawShares` `coinHTML` `emitCoins` `refresh` など）は `window.RPG` を通して読む（rpg.js が `RPG` に出す。出すものを増やしたら設計書 D §12 の `window.RPG` の一覧に足す）。rpg.js は `rpg-cards.js` が無くても落ちない（ガチャ・仲間の入口を隠す）。rpg-battle.js は変えない（変えるなら理由を報告に）
- [ ] **Step 2:** index.html の script の順: `rpg-core.js` → `rpg.js` → `rpg-cards.js` → `rpg-battle.js` → `badges.js`。`?v=1` を付ける
- [ ] **Step 3:** テストは1つも変えずに通すのが目標。変える必要があったら（`RPG_FILES`・`blockScripts` の一覧など）、その理由を報告に書く。行数（`wc -l rpg.js rpg-cards.js`）を報告に書く
- [ ] **Step 4:** 全スイート・`GEOM_BASE=auto`・コミット

Run: `node --test 'tests/unit/*.test.mjs' && node --test 'tests/e2e/*.test.mjs' && GEOM_BASE=auto node --test --test-name-pattern=phone_geometry tests/e2e/pc_layout.test.mjs`
