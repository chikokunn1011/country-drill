# イベントの約束（index.html ⇄ 機能ファイル）

index.html（クイズ本体）と機能ファイル（`rpg-core.js` `rpg.js` `rpg-battle.js` `badges.js`）は、主に `document` に出す CustomEvent と6章の共通の部品でつながる（ほかに、9章の起動時チェックに挙げる index.html のグローバルを読む）。機能ファイルどうしは CustomEvent と `window.RPG` `window.BADGES` でつながる。RPG とバッジの実装はこの文書に従う。

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
| `#r-ext` | 結果画面の差し込み口（`<div class="r-ext" id="r-ext">`）。中身は rpg.js のもの（表の下を見る）。結果カードの `#r-side` の中の最後（ランキングの欄・まちがえた国の下）。空なら見えない。PC は `#r-side` に何か入ったときだけ右の列が出る |
| `document.body.dataset.screen` | 今の画面の名前（`show()` が毎回入れる）。起動時に今の画面を知るのに使う |
| `window.TRIVIA` | 豆知識（`trivia.js`）。`{ [a]: [{k, t}] }`。`k` は `'flag'｜'geo'｜'culture'`、`t` は文。読めないこともあるので `window.TRIVIA?.[a]` で読み、`Array.isArray` で配列か確かめる。中の項目も壊れているかもしれない前提で読み、文字は `esc()` を通す |

`#r-ext` に書きこんでよいのは、`outcome === 'clear'` の `drill:result` のリスナーの中だけ。`#r-ext` が新しく作られているのはこのときだけ（`showResult()` が `#rcard` を作り直した直後）。`'fail'` と `'quit'` のときの `#rcard` には、前のゲームの `#r-ext` が残っているか、まだ1つも無いので、書きこまない。

`#r-ext` の中身は rpg.js のもの（`innerHTML` で書きかえる）。バッジなどほかの機能は `#r-ext` の中に入れず、`#r-side` の中で `#r-ext` の直前に自分の要素を差し込む（同じく `outcome === 'clear'` のときだけ）。

## 7. rpg.js / rpg-battle.js → ほかの機能（バッジなど）

| イベント | detail | メモ |
|---|---|---|
| `rpg:ready` | `{intro, lv, coins, owned}` | 読み込み時に1回。バッジのさかのぼり判定は `RPG.snapshot()` で |
| `rpg:coins` | `{delta, reason:'drill'｜'daily'｜'battle'｜'refund'｜'badge'｜'start'｜'overcome'｜'bounty'｜'levelup'｜'gacha'｜'debug', coins, earned}` | コインが変わったとき。`levelup`（レベルアップ）と `gacha`（ガチャを引いた）は使った分なので `delta` が負。`debug` は開発用（`RPG.debug.give`・`?rpgdebug=1` のパネル）。`coins` `earned` は出した時点の額 |
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
- `RPG.snapshot()`（`window.RPG.snapshot()`）は `{intro, lv, coins, owned, ownedByStar, ownedByRegion, floors, cleared, earned, st, overcome, bountyDays}` を返す（読んだときのセーブの写し。書きかえてもセーブは変わらない）。
  - `ownedByStar` は `{1, 2, 3}`（★ごとの仲間の数）、`ownedByRegion` は `{samerica, oceania, namerica, europe, asia, africa}`（地域ごとの仲間の数）、`floors` は `{ダンジョン id: クリアした最高フロア 0..5}`、`cleared` はボスを倒したダンジョンの id の配列（`floors[id] >= 5`）、`overcome` は `st.overcome`、`bountyDays` は `st.bountyDays`。
  - 読む側は try/catch の中で、どのキーも無いかもしれない前提で `?.` と `?? 0` で読む。ボスを倒したかは `floors[id] >= 5` で判定する（`cleared` の形に頼らない）。
- rpg.js は `drill:answer` の処理の中（クイズ中）に `rpg:overcome` などを出してよい。バッジはクイズ中は積むだけにし、`drill:result` でまとめて判定する。

## 8. badges.js → rpg.js

| イベント | detail | いつ |
|---|---|---|
| `badge:earned` | `{id, badge, tier, title, color, retro}`。rpg.js が同期で `paid` を書き足す | バッジのステップを取ったとき。`window.RPG` があるときだけ出す |
| `badge:title` | `{key, title}`（外したときは `{key: null, title: ''}`） | つける称号が変わったとき |

- rpg.js の受け取り（RPG 計画 Task 8 で決めたこと）: `paid` は「新しく払った `50`／すでに払った `0`／払えなかった `false`」（`false` は保存できないとき: 新しい版のデータ `RPG.status === 'readOnly'`・メモリだけ `'memory'`・書きこみの失敗）。新しく払ったときだけ、そのあとに `rpg:coins {delta: 50, reason: 'badge'}` を出す。`retro: true` で新しく払った（`paid === 50`）分は、同じタスクの中のもの（`setTimeout(…, 0)` まで）をまとめてトースト1つ「バッジのごほうび ●+合計」（冒険の表示が OFF なら出さない）。`retro: false` ではトーストを出さない。`badge:title` を受けたら、その場で（同期で）旅人カードの称号を `window.BADGES.title()` から描き直す。
- `badge:earned` の `id` はステップのキー（`'reg-asia@2'`）。`badge`（`'reg-asia'`）・`tier`（`2`）・`color`（`1`〜`4`）・`title`（称号）は足したキー。rpg.js は `id` で二重払いを防ぐ。
- RPG 設計 §10.3 の `badge:earned {id, tier?, title?}` は、この detail の一部（キーを足しただけ）。ずれはバッジ設計 §8.4 で決めたとおり。
- `retro: true` は、起動時のさかのぼりと、rpg.js があとから入ったときの払い残しのとき。どちらも起動時にまとめて出す: 起動時の判定で取れたステップ（`RPG.snapshot()` からのさかのぼりなど）と、払い残し（`got` にあって `sent` に無い、見えているステップ全部。前に `false` だったものもふくむ）。冒険のイベントやクイズで取ったときの `retro` は `false`。
- badges.js は `emit()` ではなく `const ev = new CustomEvent('badge:earned', { detail }); document.dispatchEvent(ev);` で出し、そのあと `ev.detail.paid` を読む。rpg.js はリスナーの中で同期で `e.detail.paid` に `50`（払った額）・`0`（もう払ってある）・`false`（払えなかった）のどれかを書く。`undefined`（書いていない）は古い rpg.js で、badges.js は払ったとみなす（`sent` に入れる。●+ は出さない）。badges.js は `0` を「払った」とみなし（送り直さない）、●+ は出さない（●+ を出すのは `paid` が1以上の数のときだけ）。`false` のステップは `sent` に入れず、次の起動で `retro: true` で送り直す。
- rpg.js は `badge:earned` ではトーストを出さずに払う（コインのチップだけ更新する）。●+50 はバッジ側のパネルとトーストに出す。ただし `retro: true` で新しく払った分は、まとめて1回だけ「バッジのごほうび ●+合計」のトーストを出してよい（バッジ設計 §8.4 #1）。
- 称号は `window.BADGES?.title?.()`（かっこなしの文字列。なければ `''`）があれば、旅人カードに〈〉を付けて出す。`badge:title` が来たら描き直す。
  - `BADGES.title()` が返すのは、かっこ〈〉の無い称号の文字列。つけていない（またはいまのカタログに無いキーをつけている）ときは `''`。badges.js が無いこともあるので、呼ぶ側は `window.BADGES?.title?.()` と書く（badges.js が無ければ `undefined` になるので `''` と同じに扱う）。〈〉は表示する側が付ける。
  - `badge:title {key, title}` は、自分でつけかえたときも、はじめてバッジを取って自動でつけたときも出る。外したときは `{key: null, title: ''}`。

## 9. 読み込みの順番

- 本体のインライン script → `rpg-core.js` → `rpg.js` → `rpg-battle.js` → `badges.js`（RPG が無ければ `badges.js` は本体のインライン script のすぐ後）。どれも本体のあとなので、index.html のグローバルが使える。豆知識の `trivia.js` は本体より前（`ranking.js` の直後）に読む。
- CSS は head の `<style>` → `pc.css` → `rpg.css` → `badges.css` の順（`rpg.css` `badges.css` を `pc.css` より前に置かない。前に置くと、同じ強さのルールは `pc.css` が勝つ）。
- badges.js の起動時には、もう rpg.js がリスナーを付けている（`badge:earned` の `paid` が返る）。rpg.js は読み込み時に `BADGES` を使わない。
- 各ファイルは即時関数で包む（一番外側の `const` / `let` が index.html の名前とぶつかると、ファイル全体が SyntaxError で読み込まれないため）。
- 起動時に使うグローバルを `typeof` で確かめ、足りなければ `console.error('[rpg] …')` のように出して何もしない（ボタンも画面も作らない）。クイズはそのまま動く。
- 機能ファイルと、それを読みこむ index.html の行は同じコミットで公開し、`?v=` を上げる（キャッシュの食い違いを防ぐ）。

## 10. badges.js が読むもの・出すもの

badges.js（バッジ設計 §3.3・§8）が rpg.js / rpg-battle.js から読むもの。出すもの（`badge:earned` `badge:title`）の約束は8章。

| イベント | 使うキー | badges.js がすること |
|---|---|---|
| `rpg:coins` | `reason` | `reason === 'start'` のときだけ、冒険をはじめたとみなす（旅立ち）。`'badge'`（バッジのごほうび）などでは判定しない |
| `rpg:levelup` | `lv` | 旅人のレベル |
| `rpg:join` | `via` `owned` | `via === 'learn'` なら覚えて仲間に。`owned` は仲間あつめ |
| `rpg:promote` | `star` `via` | `via === 'learn'` ならマスター昇格。`via` が無ければ下の表の #2 |
| `rpg:answer` | `a` `right` `mode` | クイズの回答と同じに数える（バトルはヒントなし）。積むだけで判定しない |
| `rpg:battle` | `boss` `win` `mistakes` `revived` `maxCombo` `lv` `recLv` | 遊んだ日・れんぞく正解・初勝利・無傷の勝利・知識こそ力・不死鳥。バトル中の保留を終える |
| `rpg:clear` | `dungeon` | 倒したボス（旗を取りもどせ・世界を取りもどした） |
| `rpg:overcome` | `a` | 苦手克服 |
| `rpg:bounty` | `totalDays` | 手配書ハンター |
| `rpg:pull` | （時刻だけ） | ガチャの演出中の保留を決め直す |
| `rpg:ready` `rpg:share` | | 使わない |

- クイズ中（`drill:start` から `drill:result` まで）に来たものと `rpg:answer` は積むだけで、判定も保存もしない（クイズ中のものは `drill:result` でまとめて判定する）。クイズの外の `rpg:answer`（バトルの1問ごと）は、次に判定するイベント（ふつうはバトルの終わりの `rpg:battle`。ほかの `rpg:*` や `drill:result` などでもよい）でまとめて判定する。その前にページを閉じた・隠れた（`pagehide`・`visibilitychange`）ときは保存だけして、そのあとの判定（次に判定するイベントか、次の起動時）で判定する（隠れただけならページは残るので、戻ってきたあとの次のイベントで判定することもある）。ほかはすぐ判定して保存し、取れたステップは `badge:earned` で払う。
- お知らせ（トースト）は、バトル中（`drill:screen {name: 'battle'}` から `rpg:battle` か、バトル画面を離れるまで）と、ガチャの演出中（いまの画面が `'gacha'` で、最後の `rpg:pull` から3秒。reduced motion なら1秒）は出さずに待つ。お知らせは、同じタスクで続けて来た分（バトルの終わりの `rpg:battle` → `rpg:clear` → 仲間・克服・手配書など）をまとめて1回で出し、枚数の上限はそのまとめに効く。クイズ（`drill:start`）やバトル（`drill:screen {name: 'battle'}`）が始まったら、出ているバッジのトーストは消し、400ms ずつずらしてまだ出していない分は終わってから出す（rpg.js などほかのトーストは消さない）。
- 起動時と判定のたびに `RPG.snapshot()` を同期で読む（7章）。使うキーは `intro` `lv` `owned` `floors` `st`（`st.win` `st.lose` `st.flee`）`overcome` `bountyDays`。ボスを倒したかは `floors` を見て、`floors[id] >= 5` なら倒したとみなす（`cleared` の形には頼らない）。冒険の値は、badges.js が覚えた値と snapshot の値の大きいほうで判定する。

rpg.js へのお願い（バッジ設計 §8.4）と、rpg.js がやらなかったときのバッジ側の代わりの判定:

| # | お願い | やらなかったとき |
|---|---|---|
| 1 | `badge:earned` は、`retro` でもそうでなくてもトーストを出さずに払い（コインのチップだけ更新する）、`e.detail.paid` に払った額（`50`）か、払えなかったら `false` を同期で書く（8章）。`retro` のときは、まとめて1回だけ「バッジのごほうび ●+150」のように出してよい | 結果画面でコインのトーストがパネルと重なる。`paid` を書かないと払ったとみなすので、払えなかった分が取りこぼされる |
| 2 | `rpg:promote` に `via`（`'learn'`／`'gacha'`）を入れる | `star === 2` で、いまの画面が `'gacha'` でなければ、覚えて昇格したとみなす |
| 3 | `RPG.snapshot()` に `intro`（冒険をはじめたか）を足す | `lv > 1` か、`st.win + st.lose + st.flee > 0` なら、はじめたとみなす |
| 4 | `rpg:battle` の `maxCombo` は「そのバトルで続けて正解した数の最大」（ダメージの式で使う「この問題の前の数」ではない） | 1つずれる（害は小さい） |
| 5 | RPG 設計 §12 のバッジの表を変える: `rpg-boss-{地域}`×6 → `rpg-boss`（1/3/6）。`rpg-lv10/30/50` → `rpg-lv` の3段。`rpg-cards-50/100/195` → `rpg-cards` の3段。`rpg-overcome-*` → `overcome`。`rpg-combo10` → `streak`。`rpg-silver` → `rpg-master`。`rpg-learn-join` → `rpg-friend`。`rpg-bounty-30` → `rpg-bounty` の3段。`rpg-gold` と `rpg-region-{id}` は作らない。地域ごとの「◯◯の勇者」の称号はなくなる（`rpg-boss` の3段の称号になる。冒険ホームの見本の〈南米の勇者〉も直す） | — |
| 6 | 旅人カードの称号は `window.BADGES?.title?.()`（かっこなし）に〈〉を付けて出し、`badge:title` が来たら描き直す（8章） | — |
| 7 | rpg.js はクイズ中（`drill:answer` の処理の中）に `rpg:overcome` などを出してもよい。バッジはクイズ中は積むだけにし、`drill:result` でまとめて判定する（取り決め） | — |
