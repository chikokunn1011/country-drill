# イベントの約束（index.html ⇄ 機能ファイル）

index.html（クイズ本体）と機能ファイル（`rpg-core.js` `rpg.js` `rpg-battle.js` `badges.js`）は、`document` に出す CustomEvent と、6章の共通の部品だけでつながる。機能ファイルどうしは CustomEvent と `window.RPG` `window.BADGES` でつながる。RPG とバッジの実装はこの文書に従う。

- 元にした設計書: RPG 設計（`docs/superpowers/specs/2026-10-26-rpg-design.md`）§10.2・§10.3、バッジ設計（`docs/superpowers/specs/2026-10-26-badges-design.md`）§5.3・§8・§9.2
- 2つが食い違う所は、共通フック＋豆知識の設計書（`docs/superpowers/specs/2026-10-26-platform-hooks-trivia-design.md`）§2 の決め方に合わせてある

## 1. しくみ

- `emit(type, detail)` は `document.dispatchEvent(new CustomEvent(type, { detail }))` をするだけ。受け取る側は `document.addEventListener('drill:answer', e => { … })` で `e.detail` を読む。
- `dispatchEvent` は同期。`emit()` が戻る前に、全部のリスナーが走り終わる。
- リスナーで例外が出ても、出した側（クイズの進行）には伝わらない（コンソールに出るだけで、ほかのリスナーも走る）。RPG やバッジにバグがあってもクイズは止まらない。
- detail のキーは**足すだけ**で、消したり名前を変えたりしない。受け取る側は知らないキーを無視する。
- detail は全部のリスナーで同じオブジェクト。書き足してよいのは `badge:earned` の `paid`（rpg.js が書く。8章）だけ。

## 2. index.html → 機能ファイル

| イベント | いつ | detail | 回数の保証 |
|---|---|---|---|
| `drill:start` | `startGame()` で新しいゲームを始めたとき（`G` を作った直後） | `{sid, mode, kind, region, n, hint}` | 1回のゲームにつき1回。挑戦のやり直しでは出ない |
| `drill:answer` | 正解かどうかが決まった直後（タイムアタックもふくむ） | `{sid, a, right, first, missesBefore, missesAfter, mode, kind, region, hint, streak}` | 1回答えるごとに1回（同じ問題には1回しか答えられない） |
| `drill:result` | ゲームが終わったとき（クリア・タイムアタックの失格・途中で離れた） | `{sid, outcome, mode, kind, region, n, done, firstTry, wrongs, attempts, best, timeMs, hint, missed}` | **1回のゲームにつき必ず1回だけ**（下を見る） |
| `drill:screen` | `show(name)` で画面を切りかえるたび | `{name}` | `show()` 1回につき1回 |
| `drill:book-open` | 図鑑で国の詳細を開いたとき: 一覧のカードで詳細を開いた／地図で国をタップした | `{a}` | 開くたびに1回（同じ国でも毎回）。地図の検索で1件にしぼったときの自動選択では出ない |
| `drill:misses-reset` | 設定の［まちがえた記録を消す］を押したとき（`misses` を空にして保存した直後） | `{}` | 押すたびに1回 |

`drill:result` の決まり:

- 次のどれか1つで出て、1回のゲームにつき必ず1回だけ（`endGame(outcome)` が `G.ended` を見て、2回目は出さない）。
  - クリア（`showResult()`）→ `outcome` は `'clear'`
  - タイムアタックの失格（まちがえた瞬間）→ `'fail'`
  - 途中で離れた → `'quit'`: ［やめてモード選択へ］、トップバー（ロゴ・［図鑑］・［設定］）、ほかの画面への `show()`、`startGame()` が前のゲームの途中で呼ばれた
- 挑戦の「最初からやり直し」（［最初から →］）は同じゲームのつづき。`drill:start` も `drill:result` も出ず、`sid` も変わらない。
- 失格のあとの［モード選択へ］［もう一回］、結果画面の［モード選択へ］［もう一回］では出ない（もう出たあと）。［もう一回］は新しいゲームの `drill:start` を出す。
- ページを閉じた・再読み込みしたときは出ない。だから `drill:start` と同じ `sid` の `drill:result` が来ないことがある。

## 3. 値の決まり

| キー | 出るイベント | 中身 |
|---|---|---|
| `sid` | start・answer・result | 1回のゲームの id（文字列）。`drill:start` で作り、同じゲームの `drill:answer` `drill:result` に同じ値が入る |
| `mode` | start・answer・result | `'f2n'｜'n2f'｜'m2f'｜'f2m'`（国旗→国名／国名→国旗／場所→国旗／国旗→場所） |
| `kind` | start・answer・result | `'practice'｜'challenge'｜'ta'`（練習／挑戦／タイムアタック） |
| `region` | start・answer・result | `S.region` の値そのもの。`'all'` か日本語の地域名（`'アジア'` `'ヨーロッパ'` `'アフリカ'` `'北・中央アメリカ'` `'南アメリカ'` `'オセアニア'`）。`asia` などのキーに直すのは受け取る側 |
| `n` | start・result | そのゲームの問題数（`G.set.length`）。「全部」で遊んだかは `n === その地域の国の数` で判断する（`P.count` はイベントに入っていない） |
| `hint` | start・answer・result | 国名表示ありで遊んだか（`true`／`false`）。場所のモード（`m2f` `f2m`）で「国名も表示する」がオン、かつタイムアタックでないとき `true` |
| `a` | answer・book-open | 国の ISO コード（小文字2文字。`'jp'` など。`countries.js` の `a`） |
| `right` | answer | 正解したか |
| `first` | answer | このゲームでその国が初めて出たか。挑戦のやり直しをまたいで数えるので、やり直しのあとや練習で後ろに回った2回目以降は `false` |
| `missesBefore` `missesAfter` | answer | この回答の前と後の `misses[a]`（苦手の記録。正解で1へる（0より下にはならない）、まちがえで1ふえる） |
| `streak` | answer | この回答のあとの連続正解の数（まちがえたら `0`） |
| `outcome` | result | `'clear'｜'fail'｜'quit'`（クリア／タイムアタックの失格／途中で離れた）。「クリアだけ」を見たいときは `outcome === 'clear'` で絞る |
| `done` | result | 正解した数。挑戦はいまの挑戦の分（やり直しで0に戻る） |
| `firstTry` | result | 初めて出た問題で正解した数（`first && right` の数。やり直しをまたいで数える） |
| `wrongs` | result | まちがえた回数の合計（やり直しをまたいで数える） |
| `attempts` | result | 挑戦した回数（練習とタイムアタックは `1`） |
| `best` | result | `G.best`。1回のゲームで、挑戦のやり直しもまたいだ最高連続正解 |
| `timeMs` | result | タイムアタックのクリアタイム（ミリ秒）。数が入るのはタイムアタックのクリアだけで、ほか（失格・途中で離れた・練習・挑戦）は `null` |
| `missed` | result | まちがえた国の `a` の配列（同じ国は1回だけ。まちがえた順） |
| `name` | screen | 画面の名前。`'home'` `'settings'` `'setup'` `'quiz'` `'result'` `'book'` `'ranking'` と、`registerScreen` で足した名前 |

## 4. 出る順番

- `startGame()`: （前のゲームが終わっていなければ `drill:result` の `'quit'`）→ `drill:start` → `drill:screen {name: 'quiz'}`
- 回答: `drill:answer` は、判定と `misses` の保存（`store.set('misses', misses)`）の直後に出る。答えの表示（`.reveal`）・演出・次の問題より前。タイムアタックの「正解ならすぐ次へ」もふくめ、全部の回答で出る。
- タイムアタックの失格: `drill:answer` → `drill:result` の `'fail'`（画面はクイズのまま。失格の表示はこのあとに作る）
- クリア: 結果カード `#rcard`（`#r-ext` をふくむ）を作る → `drill:result` の `'clear'` → 結果画面を出す → `drill:screen {name: 'result'}`
  - 練習・挑戦は［結果を見る］を押したとき。タイムアタックは最後の正解の `drill:answer` のすぐあと
- 途中で離れた: `drill:result` の `'quit'` → 画面の切りかえ → `drill:screen {name}`（移った先の画面）
- 起動時: 最初の `drill:screen`（インライン script の最後の `show(start)`）は、rpg.js・badges.js を読む前に出るので届かない。機能ファイルは起動時に `document.body.dataset.screen` を読んで今の画面を知る。

## 5. リスナーの決まり

- `drill:answer` はタイムアタックの計測中に同期で走る（リスナーが終わるまでクイズは進まない）。メモリ上の足し算だけにして、画面の更新は `requestAnimationFrame` に回す。localStorage には書かない（保存は `drill:result` などでまとめて）。
- `drill:answer` と `drill:result` のリスナーは try/catch で包む。例外はクイズに伝わらないが、自分の集計（途中の記録など）が半端に壊れるのを防ぐため。
- `misses` は index.html の `let`（［まちがえた記録を消す］で別のオブジェクトに置きかわる）なので、参照を取っておかない。使うときに毎回 `misses` と名前で読む。苦手の数の変化は `missesBefore` `missesAfter` で分かる。
- 結果画面の `#rcard` の中のボタン（［もう一回］［モード選択へ］［載せる］、`#r-ext` に入れたボタンも）は、結果画面を出してから 250ms は押せない（最後の問題の連打よけ）。キーの押しっぱなし（自動リピート）でも押されない。250ms は `show('result')` のあとから数えるので、`drill:result` のリスナーにかかった時間はこの 250ms に入らない。

## 6. 共通の部品（index.html のグローバル）

`const` と `let` で作ったもの（`emit` `screenRender` `misses` `G` など）は `window` に載らない。`window.emit` ではなく `emit` と名前で書き、起動時に `typeof emit === 'function'` のように確かめる。

| 名前 | 使い方 |
|---|---|
| `emit(type, detail)` | イベントを出す（1章）。機能ファイルが自分のイベントを出すのに使ってもよい |
| `registerScreen(name, render)` | 機能ファイルが自分の画面を足す。**先に `<section id="scr-…">` を作ってから**呼ぶ（無ければ例外 `no section scr-…`。`show()` は登録した画面を null チェックなしでさわるため）。`render` があれば、`show(name)` のたびに画面を出したあと・`drill:screen` の前に呼ばれる |
| `screenRender` | `{ [name]: render }`。`registerScreen` が書く。直接さわらない |
| `show(name)` | 画面を切りかえる。クイズの途中なら先に `drill:result` の `'quit'` を出す |
| `toast(html, ms)` | お知らせを出す（`ms` の既定は 2800）。`html` は innerHTML になるので、文字は `esc()` を通す。`#toasts`（初めて呼ばれたときに `body` の最後に作る。`aria-live="polite"`）に足し、`ms` ミリ秒で消える。位置はスマホは画面の上のまん中、PC（900px〜）は右上（トップバーの［図鑑］［設定］の下）。CSS はバッジ設計 §5.3 |
| `endGame(outcome)` | `drill:result` を出してゲームを閉じる（`G.ended = true`）。2回目からは何もしない。index.html の中で使う。機能ファイルが別の画面に移れば `show()` が `'quit'` で閉じるので、ふつうは呼ばない |
| `#topbar-extra` | トップバーの差し込み口（`<div id="topbar-extra" class="row">`。ロゴと［図鑑］［設定］の間）。コイン・称号などのチップを入れる。空なら見えない（`:empty`）。トップバーはホームでは隠れる |
| `#r-ext` | 結果画面の差し込み口（`<div class="r-ext" id="r-ext">`）。結果カードの `#r-side` の中の最後（ランキングの欄・まちがえた国の下）。空なら見えない。PC は `#r-side` に何か入ったときだけ右の列が出る |
| `document.body.dataset.screen` | 今の画面の名前（`show()` が毎回入れる）。起動時に今の画面を知るのに使う |
| `window.TRIVIA` | 豆知識（`trivia.js`）。`{ [a]: [{k, t}] }`。`k` は `'flag'｜'geo'｜'culture'`、`t` は文。読めないこともあるので `window.TRIVIA?.[a]` で読み、`Array.isArray` で配列か確かめる。中の項目も壊れているかもしれない前提で読み、文字は `esc()` を通す |

`#r-ext` に書きこんでよいのは、`outcome === 'clear'` の `drill:result` のリスナーの中だけ。`#r-ext` が新しく作られているのはこのときだけ（`showResult()` が `#rcard` を作り直した直後）。`'fail'` と `'quit'` のときの `#rcard` には、前のゲームの `#r-ext` が残っているか、まだ1つも無いので、書きこまない。

## 7. rpg.js / rpg-battle.js → ほかの機能（バッジなど）

| イベント | detail | メモ |
|---|---|---|
| `rpg:ready` | `{intro, lv, coins, owned}` | 読み込み時に1回。バッジのさかのぼり判定は `RPG.snapshot()` で |
| `rpg:coins` | `{delta, reason:'drill'｜'daily'｜'battle'｜'refund'｜'badge'｜'start'｜'overcome'｜'bounty', coins, earned}` | |
| `rpg:levelup` | `{lv, from}` | 「上げられるだけ上げる」でも1回。バッジは `from < 10 <= lv` のように、またいだかで判定する |
| `rpg:join` | `{a, via:'learn'｜'gacha', owned}` | 新しく仲間になった |
| `rpg:promote` | `{a, star, via:'learn'｜'gacha'}` | マスター昇格・ガチャでのランクアップ |
| `rpg:pull` | `{region, count, free, results:[{a, star, out}], pity, pulls}` | |
| `rpg:answer` | `{a, right, mode, dungeon, boss}` | バトル中の回答。コインの計算には使わない |
| `rpg:battle` | `{dungeon, floor, boss, win, first, mistakes, revived, gauge, maxCombo, lv, recLv}` | |
| `rpg:clear` | `{dungeon}` | ボスを初めて倒した |
| `rpg:overcome` | `{a, total}` | |
| `rpg:bounty` | `{a, doneAll, totalDays}` | |
| `rpg:share` | `{kind}` | シェアボタンを押した |

足すこと（バッジ設計 §8.2・§8.4）:

- `rpg:promote` の `via` は、覚えて昇格した（`'learn'`）か、ガチャでランクアップした（`'gacha'`）か。バッジの判定に使うので必ず入れる。
- `rpg:battle` の `maxCombo` は「そのバトルで続けて正解した数の最大」。ダメージの式で使う「この問題の前の数」ではない。
- `rpg:ready` は rpg.js を読み込んだときに1回だけ出る。あとから読むファイル（badges.js）には届かないので、起動時は `RPG.snapshot()` を同期で読む。
- `RPG.snapshot()`（`window.RPG.snapshot()`）は `{intro, lv, owned, ownedByStar, ownedByRegion, floors, cleared, earned, st, overcome, bountyDays}` を返す。読む側は try/catch の中で、どのキーも無いかもしれない前提で `?.` と `?? 0` で読む。ボスを倒したかは `floors[id] >= 5` で判定する（`cleared` の形に頼らない）。
- rpg.js は `drill:answer` の処理の中（クイズ中）に `rpg:overcome` などを出してよい。バッジはクイズ中は積むだけにし、`drill:result` でまとめて判定する。

## 8. badges.js → rpg.js

| イベント | detail | いつ |
|---|---|---|
| `badge:earned` | `{id, badge, tier, title, color, retro}`。rpg.js が同期で `paid` を書き足す | バッジのステップを取ったとき。`window.RPG` があるときだけ出す |
| `badge:title` | `{key, title}`（外したときは `{key: null, title: ''}`） | つける称号が変わったとき |

- `badge:earned` の `id` はステップのキー（`'reg-asia@2'`）。`badge`（`'reg-asia'`）・`tier`（`2`）・`color`（`1`〜`4`）・`title`（称号）は足したキー。rpg.js は `id` で二重払いを防ぐ。
- RPG 設計 §10.3 の `badge:earned {id, tier?, title?}` は、この detail の一部（キーを足しただけ）。ずれはバッジ設計 §8.4 で決めたとおり。
- `retro: true` は、起動時のさかのぼりと、rpg.js があとから入ったときの払い残しのとき。
- badges.js は `emit()` ではなく `const ev = new CustomEvent('badge:earned', { detail }); document.dispatchEvent(ev);` で出し、そのあと `ev.detail.paid` を読む。rpg.js はリスナーの中で同期で `e.detail.paid` に `50`（払った額）か `false`（払えなかった）を書く。`undefined`（書いていない）は古い rpg.js。
- rpg.js は `badge:earned` ではトーストを出さずに払う（コインのチップだけ更新する）。●+50 はバッジ側のパネルとトーストに出す。
- 称号は `window.BADGES?.title?.()`（かっこなしの文字列。なければ `''`）があれば、旅人カードに〈〉を付けて出す。`badge:title` が来たら描き直す。

## 9. 読み込みの順番

- 本体のインライン script → `rpg-core.js` → `rpg.js` → `rpg-battle.js` → `badges.js`（RPG が無ければ `badges.js` は本体のインライン script のすぐ後）。どれも本体のあとなので、index.html のグローバルが使える。豆知識の `trivia.js` は本体より前（`ranking.js` の直後）に読む。
- CSS は head の style のあとに `rpg.css` → `badges.css`。
- badges.js の起動時には、もう rpg.js がリスナーを付けている（`badge:earned` の `paid` が返る）。rpg.js は読み込み時に `BADGES` を使わない。
- 各ファイルは即時関数で包む（一番外側の `const` / `let` が index.html の名前とぶつかると、ファイル全体が SyntaxError で読み込まれないため）。
- 起動時に使うグローバルを `typeof` で確かめ、足りなければ `console.error('[rpg] …')` のように出して何もしない（ボタンも画面も作らない）。クイズはそのまま動く。
- index.html のフックと機能ファイルは同じコミットで公開し、`?v=` を付けて（上げて）キャッシュの食い違いを防ぐ。
