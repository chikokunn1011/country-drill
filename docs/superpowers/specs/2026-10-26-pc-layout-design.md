# PC画面いっぱいレイアウト 設計書（195か国ドリル）

依頼: 「パソコンの画面だったら内容を画面いっぱい使って表示して」
対象: 900px 以上の画面だけ。**900px 未満（スマホ）は1ピクセルも変えない。**

試作で全部の数字を確かめてある（試作の場所と再現スクリプトは 11 章）。

---

> **ファイルの場所（リポジトリ内）:** 試作の `pc.css`・`proto_index.html`・`proto_index.diff`・`measure.js`・`geom.js` は `docs/superpowers/specs/assets/pc-proto/` に置いてある。本文中の `designs/…` `proto_pc/…` はこのフォルダのこと。試作は**タイムアタック・ランキングが入る前**のコード（359cc70）で作ったので、実装では今の index.html（タイムアタック・ランキング入り）に合わせること。

## 0. まとめ

- PC 用の CSS は全部 **`pc.css`（新規ファイル）** に移す。index.html からは `<link rel="stylesheet" href="pc.css" media="(min-width: 900px)">` で読む。`media` 属性があるので、スマホ幅ではこのファイルのルールが当たらない。だから「スマホは変えない」が仕組みとして守られる。今 index.html にある `@media (min-width: 900px) { … }` のかたまり（43行）は消して、書き直したものを pc.css に入れる。
- 幅: ページの最大幅 1200px をやめて、左右の余白 `clamp(24px, 3vw, 64px)` 以外は全部使う（上限 1840px。2560px 幅のモニターでだけ左右に余白が残る）。トップバーも同じ幅。
- 高さ: ホーム・クイズ・結果・図鑑の地図は **画面の高さいっぱい**。クイズは国旗・地図・選択肢を「残りの高さ」から計算した大きさにするので、**答えたあとも含めてスクロールしない**（1280×577 まで確認）。
- クイズは ≥1280px で **「問題｜選択肢｜答え」の3列**。答えの列は最初から場所を取っておく（答える前はキー操作のヒントを出す）。答えた瞬間に何も動かない。900〜1279px は2列で、答えは下の帯に出る。
- 文字は大きくしすぎない。基準の文字サイズは 1280px で 16px、1920px で 17.6px、上限 18px。見出しは `clamp()` で上限つき。文章は1行40字まで。
- index.html の変更は小さい6か所だけ（今の 900px 以上の CSS を消す、pc.css の読み込み、`data-screen` 属性、答え用の場所 `.rslot`、結果画面の右側 `#r-side`、`id="kinds-field"`）。どれもスマホの見た目は変えない（要素の位置を全画面で比べて確認済み）。

---

## 1. 方針

1. **幅は使い切る、文字は伸ばさない。** 広くなった分は「列を増やす」「画像・地図を大きくする」に使う。文字を巨大にして埋めない。
2. **大きさは高さで決める。** PC は横より縦が足りない（1366×768 のノートだとブラウザ内は 1366×657 前後）。国旗・地図・選択肢は「使える高さ」から計算する。仕組みは CSS のコンテナクエリの単位 `cqh`（4章）。
3. **画面の種類で縦の扱いを分ける。**
   - ゲーム画面（ホーム、クイズ、結果、図鑑の地図、今後の RPG の戦闘やガチャ演出）: 画面の高さいっぱい。スクロールなし。
   - メニュー画面（モード選択、設定）: 高さより短ければ上下中央に置く。開いたり閉じたりする欄は場所を取っておき、パネルが上下に動かないようにする。
   - 一覧画面（図鑑の一覧、ランキング、バッジ一覧）: 上から並べてスクロール。絞り込みの欄は画面上部に固定。
4. **答えた瞬間に何も動かない。** 答えの表示場所は最初から取っておく。
5. **文章は1行40字まで**（`--measure: 40em`）。
6. **既存の設定を守る。** 色はすべて既存の変数（`var(--surface)` など）で、ダークモードもそのまま。ドパガキ向けモードの演出はそのまま（大きい判定文字だけ、狭い列では少し小さくする）。PC 用に新しいアニメーションは足さない（reduced motion に関係しない）。

---

## 2. ブレークポイント

| 範囲 | 呼び名 | 変わること |
|---|---|---|
| 〜899px | スマホ | **変更なし**（pc.css は当たらない） |
| 900〜1279px | 小さいPC・タブレット横 | ページ全幅。クイズは2列＋下に答えの帯。モード選択は今と同じ2列。ホームは1列のまま中央 |
| 1280〜1599px | ノートPC | クイズ3列。ホームは2列（左にタイトルとメニュー、右に国旗）。結果は2列。モード選択は「モード4つ横並び」。図鑑の詳細は2列 |
| 1600px〜 | デスクトップ | 1280 と同じ並び。余白・文字・カードが `clamp()` でなめらかに大きくなる。基準の文字サイズは 2080px で上限 18px |
| 高さ 760px 以下（900px 以上のとき） | 背の低い画面 | 余白を詰める（上下の余白 12px、カードの内側 16〜24px、モードカードを低く） |

ブレークポイントを3つ以上に増やさない。1600px 以上の違いはほとんど `clamp()` と `vw` で連続的に変わる。

---

## 3. 共通の枠

### 3.1 ページ

| 項目 | 値 |
|---|---|
| 左右の余白 `--gutter` | `clamp(24px, 3vw, 64px)`（1366→41px、1920→58px、2560→64px） |
| ページの最大幅 `--page-max` | 1840px（1920px 幅では実質全幅の 1805px） |
| 上下の余白 `--pad-y` | `clamp(12px, 1.8vh, 28px)` |
| 縦のすき間 `--vgap` | `clamp(10px, 1.5vh, 20px)` |
| カードの内側 `--card-pad` | `clamp(18px, 1.7vw, 36px)` |
| 列のすき間 `--col-gap` | `clamp(24px, 2.6vw, 56px)` |
| 外側の `.wrap` | `min-height: calc(100dvh - 2 * var(--pad-y))`（古いブラウザ向けに `100vh` も先に書く）。中の画面（`section.wrap`）は幅100% |
| フッター | `margin-top: auto` で画面の一番下。クイズ中は出さない（`body[data-screen="quiz"] footer { display: none }`） |

### 3.2 トップバー

- 中身と同じ幅で、左端・右端がカードのふちとそろう（今は 1200px の箱の中にある）。
- 1行にする。ロゴの小さい英字（FLAGS · NAMES · MAP）は 2行目ではなく、ロゴの右に並べる（`.brand { display: flex; align-items: baseline }` と `.brand small { order: 2 }`）。高さは 44px から 36px になる。
- クイズ中は、進み具合のバーと「やめてモード選択へ」を同じ1行に並べる（`#scr-quiz` を grid にして、`.progress` を左、`.row.end` を右に置く）。CSS だけで、HTML はそのまま。縦が約 40px 浮く。
- **今後の機能用の差し込み口（提案）:** `#topbar` の中のロゴとリンクの間に `<div id="topbar-extra" class="row"></div>` を置く。空のときは見た目が変わらない（space-between なのでロゴとリンクの位置は同じ）。RPG のコイン、今つけている称号などはここに入れる。PC では `#topbar-extra { margin-right: auto; }`。スマホに出すかどうかは各機能が決める。

### 3.3 文字の大きさ

基準の文字サイズ（rem）は `html { font-size: clamp(100%, calc(80% + .25vw), 112.5%) }`。% で書くので、利用者がブラウザで文字サイズを大きくしていても、それが効く。1280px 以下では 16px のまま。

| 要素 | 指定 | 1280px | 1920px | 2560px |
|---|---|---|---|---|
| rem | 上の式 | 16px | 17.6px | 18px |
| ホームの h1 | `clamp(4.4rem, calc(2rem + 3.4vw), 6rem)` | 75px | 100px | 108px |
| 問題文 `.qlabel` | `clamp(1.2rem, calc(.9rem + .45vw), 1.55rem)` | 20px | 24.5px | 27px |
| 国名の問題 `.qbig` | `clamp(2.2rem, calc(1.1rem + 1.6vw), 3.6rem)` | 38px | 50px | 61px |
| 文字の選択肢 | `clamp(1.05rem, calc(.8rem + .3vw), 1.3rem)` | 17px | 20px | 22px |
| 判定文 `.verdict`（3列のとき） | `1.25rem`（ドパガキ向けの正解 1.6rem、不正解 1.3rem） | 20px | 22px | 22.5px |
| 結果の点数 `.score` | `clamp(4rem, calc(1.6rem + 3vw), 6.4rem)` | 64px | 86px | 106px |
| パネルの見出し | `clamp(1.25rem, calc(1rem + .35vw), 1.6rem)` | 20px | 24px | 27px |

- 6rem を超えてよいのはホームのタイトルだけ（それも上限 108px）。
- 長い国名で変なところで改行しないように、`.verdict` `.qlabel` `.qbig` に `text-wrap: balance; word-break: auto-phrase; overflow-wrap: anywhere` をつける。auto-phrase は Chrome 119 以降で日本語を文節で折り返す（対応していないブラウザは無視する）。例: 「ざんねん。正解は／「バルバドス」。／あとでもう一度出るよ」。`overflow-wrap: anywhere` は、1つの文節が列より長いとき（1280px 幅の国名→国旗で「セントクリストファー」）に列からはみ出さないための保険。これがないと 51px はみ出すのを試作で確認した。
- 残る小さな問題: 狭い列に長い国名を出すと「セントクリストフ／ァー・ネービス」のように小さい「ァ」が行頭に来ることがある。直すなら、`nextQuestion()` で国名が12字以上のとき `.qbig` に `long` クラスをつけ、PC では `#qcard .qbig.long { font-size: .8em }` にする（任意）。

### 3.4 1行の長さ

- 文章（`.hint`、`.panel p`、今後の説明文）は `max-inline-size: var(--measure)`（40em ＝ 全角40字）。
- 文章が中心の画面は、パネルの幅を最大 720〜1080px にする（設定画面）。
- 一覧の1行（ランキングの行など）は最大 920px。広い画面では横にサイドバーを置き、行を横に伸ばさない。

---

## 4. 高さに合わせるしくみ（クイズがスクロールしない理由）

### 4.1 高さの受け渡し

```
body (padding-block: --pad-y)
└ .wrap 外側   flex 縦並び, min-height: 100dvh - 上下の余白
  ├ #topbar                     36px
  ├ #scr-quiz  flex: 1 0 auto   ← 残りの高さを全部もらう
  │  ├ .progress | .row.end（やめる）   1行
  │  └ #qcard   container-type: size   ← 残りの高さ。中身はこの高さを cqh で知る
  └ footer（クイズ中は非表示）
```

- `#qcard` に `container-type: size` をつけると、`#qcard` の高さは中身ではなく外側（残りの高さ）で決まる。中の要素は `100cqh`（＝カードの中身の高さ）を使って自分の大きさを計算できる。
- `#qcard { min-height: 440px }`: 縦がそれより狭い窓（ブラウザを 200% に拡大したときなど）では、つぶれずにページがスクロールする。
- 使える高さ `--mh`: ≥1280px は `100cqh`。900〜1279px は下の答えの帯（150px）とすき間を引いた `calc(100cqh - 150px - 14px)`。

### 4.2 それぞれの大きさの式

| 要素 | 式 | 意味 |
|---|---|---|
| 問題の国旗 `.qflag` | `width: min(100%, 640px, calc((var(--mh) - 76px) * 4 / 3))` | 列の幅、640px、（高さ − 問題文の76px）×4/3 のうち一番小さいもの |
| 問題の地図 `.qmain > .mapbox` | `width: min(100%, calc((var(--mh) - 76px) * 16 / 9))` | 16:9 で高さに収める |
| 国旗・地図の選択肢（2×2） | `width: min(100%, calc(((var(--mh) - 10px) / 2 - var(--cell-extra)) * 8 / 3 + 56px))` | 1マス＝枠3＋内側20＋番号21＋すき間6＋画像。`--cell-extra` は 52px、国名表示ONのときは 80px。2段が必ず高さに入る幅に選択肢全体の幅を絞って、列の中央に置く |
| 文字の選択肢 | `min-height: clamp(56px, calc((var(--mh) - 48px) * .14), 96px)` | 高い画面ではボタンも高く（最大 96px） |
| 答えの地図（3列のとき） | `width: min(100%, calc((100cqh - 340px) * 16 / 9))` | 判定文・国の情報・次へボタンの約 340px を引いた残り |
| 答えの地図（2列のとき） | `height: 100%; width: auto; aspect-ratio: 16/9` | 帯の高さに合わせる |

### 4.3 実際の大きさ（試作で測った値）

| 画面（ブラウザの中の大きさ） | カード | 国旗→国名の国旗 | 国名→国旗の選択肢1枚 | 場所→国旗の地図 | 国旗→場所の地図1枚 | 答えの地図 |
|---|---|---|---|---|---|---|
| 1024×768 | 963×651 | 470×353 | 225×168 | 539×303 | 225×168 | 189×106 |
| 1366×657（1366×768 のノート） | 1284×547 | 445×334 | 214×160 | 595×334 | 241×181 | 297×167 |
| 1366×768 | 1284×651 | 442×331 | 212×159 | — | 239×180 | 317×178 |
| 1920×1080 | 1805×941 | 621×466 | 309×232 | 830×467 | 348×261 | 429×241 |

今（1200px の箱）の 1920×1080 では国旗が 380×285、答えを出すとページが 1119〜1235px になってスクロールしていた。

---

## 5. 画面ごとのレイアウト

### 5.1 ホーム

- **900〜1279:** 今と同じ1列・中央そろえ。画面の高さいっぱいにして上下中央（`body[data-screen="home"] #scr-home { flex: 1 0 auto; justify-content: center }`）。国旗は30枚全部出す（44px）。ボタンは横並び。
- **≥1280:** 2列のヒーロー。
  ```
  ┌──────────────────────────────────────────────────────────┐
  │  FLAGS · NAMES · MAP        ┌──┬──┬──┬──┬──┬──┐          │
  │  195か国                    │旗│旗│旗│旗│旗│旗│  6列×5段 │
  │  ドリル                     ├──┼──┼──┼──┼──┼──┤  =30枚    │
  │  [ プレイ          ]        │  …                │          │
  │  [ 設定            ]        └──┴──┴──┴──┴──┴──┘          │
  │  国旗図鑑を見る                                           │
  │                      フッター                              │
  └──────────────────────────────────────────────────────────┘
  ```
  - `grid-template-columns: .8fr 1.2fr`。左の列は上下に `1fr` の空き行をはさんで中央。右の国旗は `grid-template-columns: repeat(6, 1fr)` で列いっぱい。ただし高さに入るように最大幅を `(100dvh - 上下の余白) × 1.5` にする。
  - メニューは縦に積む（幅 340px）。**ランキング・RPG・バッジのボタンが増えても縦に並ぶだけ**で、レイアウトは崩れない（5つまでは 1366×657 で入る見込み。6つ以上なら2列の `grid-template-columns: 1fr 1fr` にする）。
  - HTML は変えない（grid-template-areas で並べる）。

### 5.2 設定

- **900〜1279:** 今と同じ縦1列、最大 720px。
- **≥1280:** 最大 1080px。項目（`.field`）を `repeat(auto-fit, minmax(340px, 1fr))` で横に並べる（今は「演出｜記録」の2列）。見出しと「ホームへ」は全幅。画面の上下中央に置く。
- 「効果音を鳴らす」の行は隠れているときも場所を取っておく（`#set-sound-row[hidden] { display: inline-flex !important; visibility: hidden }`）。ドパガキ向けを ON にしても、パネルが動かない。
- 項目が増えたら（ニックネーム、RPGのデータ消去、称号の表示など）、そのまま2〜3列に流れる。

### 5.3 モード選択

- **900〜1279:** 今と同じ2列（左: モード4つ＋国名表示＋あそび方、右: 地域＋問題数）。
- **≥1280:** 決める順に上から並べる。
  ```
  ┌ モードを選ぶ ─────────────────────────────────────────────┐
  │ [国旗→国名] [国名→国旗] [場所→国旗] [国旗→場所]   ← 4つ横並び │
  │ □ 国名も表示する（隠れていても場所は取る）                   │
  │ あそび方                       ┆ 出題する地域                  │
  │ [練習] [挑戦] [タイムアタック]   ┆ (全世界)(アジア)…             │
  │                                 ┆ 問題数 (5)(10)(20)(全部)       │
  │                                              [ スタート ]      │
  └──────────────────────────────────────────────────────────┘
  ```
  - `.cols` を `grid-template-areas: "modes modes" "nameopt nameopt" "kinds opts"` にする。左の `.col` は `display: contents` にして、中の3つを直接並べる。あそび方の欄には `id="kinds-field"` をつける（HTML の変更はこれだけ）。
  - あそび方のカードは `repeat(auto-fit, minmax(180px, 1fr))`。タイムアタックが入って3つになっても1行に並ぶ。
  - モードカードは高さ `clamp(84px, 12vh, 150px)`、名前 `clamp(1.1rem, …, 1.45rem)`。
  - パネルは画面の上下中央。「国名も表示する」は隠れていても場所を取るので（`#nameopt-field[hidden] { display: flex !important; visibility: hidden }`）、モードを切り替えてもパネルが動かない。ただし背の低い画面（高さ 760px 以下）では場所を取らない。
  - 背の低い画面ではモードカードを低くする。1280×577 だけ 8px スクロールする（メニュー画面なので許す）。

### 5.4 クイズ

#### 列の割合

| モード | 900〜1279（2列＋下の帯） | ≥1280（3列: 問題｜選択肢｜答え） |
|---|---|---|
| f2n 国旗→国名 | 1.1fr / 1fr | 1.1fr / .95fr / minmax(320px, .85fr) |
| n2f 国名→国旗 | .85fr / 1.2fr | .8fr / 1.15fr / minmax(320px, .85fr) |
| m2f 場所→国旗 | 1.5fr / 1fr | 1.8fr / .9fr / minmax(320px, .85fr) |
| f2m 国旗→場所 | .8fr / 1.4fr | .75fr / 1.35fr / minmax(320px, .85fr) |

答えの列を `minmax(320px, …)` にするのは、国の情報（首都「ブリッジタウン」、地域「北・中央アメリカ」）が単語の途中で折り返さないようにするため。

#### ≥1280

```
覚えた 1 / 5 ━━━━━━━━━━━━━━━━━━━━━━━━━ 残り4問      やめてモード選択へ
┌────────────────────────────────────────────────────────────────┐
│  この国旗はどこの国？     │ [1 エルサルバドル ] ┆  正解！              │
│ ┌──────────────┐        │ [2 バルバドス     ] ┆  [旗] バルバドス      │
│ │    国 旗     │        │ [3 カナダ         ] ┆       首都 …          │
│ └──────────────┘        │ [4 ジャマイカ     ] ┆  [ 位置の地図 16:9 ]  │
│                          │                      ┆  [ 次の問題 →     ]  │
└────────────────────────────────────────────────────────────────┘
```

- 3列目（`.rslot`）は最初からある。答える前は「答えたら、ここに国のプロフィールが出るよ」と「1〜4 キーでも答えられる ・ Enter で次へ」を薄い色で出す（PC はキーボードの人が多いので、案内として役に立つ）。
- 答えると `answer()` が `.rslot` を `.reveal` に**置きかえる**（`slot.replaceWith(r)`）。同じ場所なので、問題と選択肢は1ピクセルも動かない。
- `.reveal` は縦に並べる: 判定文 → 国の情報（国旗 84〜128px＋表）→ 地図（f2n / n2f だけ）→ 「次の問題 →」（列の幅いっぱい）。上下中央。
- 列の区切りは点線（`border-left: 1px dashed var(--line)`。今の答えの上の点線と同じ見た目）。

#### 900〜1279

```
┌──────────────────────────────────────────────┐
│  問題（国旗・国名・地図）     │  選択肢          │
├┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┤ 高さ150pxの帯
│ ざんねん。正解は「バルバドス」…   [地図]  [次の問題→]│
│ [旗] バルバドス 首都… 地域…                       │
└──────────────────────────────────────────────┘
```

- 下の帯（150px）は最初から取っておく。答える前は同じヒントを出す。
- 国の情報の表は2列（首都・地域／面積・ISO）にして高さを抑える。地図は帯の高さに合わせた 16:9（1024px 幅で 189×106）。

#### 各モードの注意

- **m2f（場所→国旗）:** 問題の地図が主役なので一番広い列（1.8fr）。答えの列には地図を出さない（今と同じ）。
- **f2m（国旗→場所）:** 選択肢の地図4枚が主役なので広い列（1.35fr）。
- **国名表示 ON（m2f / f2m）:** 選択肢に国名が1行増えるので `--cell-extra` を 80px にして、画像を少し小さくする（`#qcard:has(.cname)`）。
- **ドパガキ向け:** カードの太い枠と光は今のまま。判定文 1.8rem は3列だと長くなるので、3列の中では正解 1.6rem・不正解 1.3rem、2列の帯では 1.3rem にする。紙吹雪などは `position: fixed` なので関係ない。
- **地図のズーム:** d3.zoom は viewBox の単位で動くので、大きさが変わっても今のまま使える。

#### タイムアタック（作業中の機能）

- 正解では答えを出さずに次へ進むので、3列目はヒントのまま。追加でやるなら、`nextQuestion()` で `#qcard` に `k-${G.kind}` クラスをつけ、タイムアタックのときはヒントを「タイムアタック中！ 1〜4 キーが速いよ」に変える（任意）。
- 失格の表示（正解の国＋国の情報）は `.reveal` として `.rslot` と置きかえる。普通のまちがいと同じ場所なので、高さに収まる。
- 経過タイム `#ptime` は進み具合の行の中なので、高さは変わらない。

### 5.5 結果

- 画面の高さいっぱいのカードで、中身は上下中央。
- 「まちがえた国」は新しい入れ物 `<div class="rside" id="r-side">` に入れる。**スマホでは `.rside { display: contents }`** なので、入れ物がないのと同じ並びになる（今と同じ）。
- **900〜1279:** 1列・中央（今と同じ並び）。まちがえた国の一覧は `repeat(auto-fill, minmax(300px, 1fr))`。
- **≥1280:** `#r-side` に中身があれば2列。左に点数・統計・ボタン（最大 560px）、右にまちがえた国（最大 760px）。2つのかたまりはカードの中央に寄せる（`justify-content: center`）。中身がなければ1列・中央。
  ```
  ┌──────────────────────────────────────────────┐
  │          いい感じ！          ┆ まちがえた国              │
  │          4 / 5 一発正解      ┆ [旗] バルバドス ブリッジタウン │
  │   やり直し1回 最高連続5      ┆ [旗] …                       │
  │  [モード選択へ] [もう一回]   ┆                              │
  └──────────────────────────────────────────────┘
  ```
- **今後の機能（バッジ・RPG・タイムアタック）は、結果画面に足すものを `#r-side` に入れる。** 例: 「ランキングに載せる？」の欄（`#ta-form`）、「バッジを手に入れた！」、「+120 コイン」。PC では自動で右の列に並び、スマホでは今までどおり縦に続く。

### 5.6 図鑑（一覧）

- 列の幅 `repeat(auto-fill, minmax(clamp(160px, 10.5vw, 230px), 1fr))`、すき間 `clamp(12px, 1vw, 18px)`。列の数: 900px→4、1024px→5、1280〜1440px→7、1536〜1920px→8、2560px→7（最大幅 1840px のため）。1920px でカード1枚が約 211px になり、国旗が今（170px）より大きくなる。
- 検索・地域・首都をかくす の行は **一覧のときだけ画面上部に固定**（`position: sticky; top: 8px`）。固定中に下のカードと区別できるように、半透明の白いカード（`color-mix(in srgb, var(--surface) 92%, transparent)`、枠線、ぼかし、薄い影）にする。195枚をスクロールしても検索できる。
- 検索欄の幅 `clamp(200px, 18vw, 320px)`。

### 5.7 図鑑（地図）

- 画面の高さいっぱい。`#bmap` を `flex: 1 1 0; container-type: size` にして、地図の幅を `min(100%, 100cqh × 16/9)` にする（高さに収まる一番大きい 16:9）。
- 右の情報欄の幅は `clamp(280px, 24vw, 420px)`。国旗は最大 320px。
- 1920×1080 で地図は約 1365×768（今は 811×456）。1366×657 では高さに合わせて約 900×506。

### 5.8 図鑑の詳細（ダイアログ）

- 900〜1279: 今と同じ（幅 640px、縦並び）。
- ≥1280: 幅 `min(980px, 100vw - 64px)`。左に国の情報（国旗が上、表が下）、右に地図。閉じるボタンは右上。

### 5.9 ランキング画面（作業中。作る人へのルール）

計画書（Task 5）にある要素（`#rk-modes` `#rk-regions` `#rk-counts` `#rk-tabs` `#rk-list` `#rk-empty` `#rk-error` `#rk-play`）を、次の2つの入れ物に分けて入れることをすすめる。

```html
<section id="scr-ranking" class="wrap" hidden>
  <div class="rk-body">
    <div class="rk-side panel"> 条件（モード・地域・問題数のチップ）＋「この条件で遊ぶ」 </div>
    <div class="rk-main"> 歴代/今週のタブ＋リスト（または空・エラー表示） </div>
  </div>
</section>
```

```css
/* pc.css に追加 */
#scr-ranking .rk-main { width: 100%; max-width: 920px; margin-inline: auto; }
#rk-list li { display: grid; grid-template-columns: 3.5em minmax(0, 1fr) auto auto; gap: 16px; align-items: center; }
@media (min-width: 1280px) {
  #scr-ranking .rk-body { display: grid; grid-template-columns: clamp(300px, 26vw, 420px) minmax(0, 1fr); gap: var(--col-gap); align-items: start; }
  #scr-ranking .rk-side { position: sticky; top: 16px; }
  #scr-ranking .rk-main { margin-inline: 0; }
}
```

- 一覧画面なので上からならべてスクロールする（上下中央にしない。読み込みで高さが変わるため）。
- 900〜1279: 条件のチップが上、リストが下（最大 920px、中央）。
- 1位〜3位を大きく見せる場合は、`.rk-main` の上に3枚のカードを横並びにする（≥1280 だけ）。
- 計画書のテスト `pc_layout`（1280×800 で横スクロールなし）に加えて、9章のチェックも通す。

### 5.10 今後の画面（RPG・ガチャ・バッジ・称号）の共通ルール

1. 画面は `<section id="scr-xxx" class="wrap">` にして、`SCREENS` と `show()` に登録する。PC では自動でページ全幅になり、`body[data-screen="xxx"]` で画面ごとの CSS を書ける。
2. 型を3つから選ぶ（PC だけのルール。最初に使う機能のときに pc.css に足す）:
   ```css
   /* ステージ: 残りの高さを全部使う画面（ダンジョンの戦闘、ガチャの演出）。中は cqh で大きさを決める */
   body[data-screen="dungeon"] #scr-dungeon { flex: 1 0 auto; }
   .pc-stage { flex: 1 1 0; min-height: 440px; container-type: size; }
   /* サイドバー＋本体: キャラ強化（左にキャラ、右に強化リスト）、ガチャ（左にボタンと確率表、右に結果）、ランキング */
   @media (min-width: 1280px) {
     .pc-split { display: grid; grid-template-columns: clamp(280px, 24vw, 400px) minmax(0, 1fr); gap: var(--col-gap); align-items: start; }
     .pc-split > :first-child { position: sticky; top: 16px; }
   }
   /* タイル: バッジ一覧、手に入れたキャラ・アイテム一覧 */
   .pc-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(140px, 10vw, 200px), 1fr)); gap: clamp(12px, 1vw, 18px); }
   ```
3. スマホ用の見た目は各機能のファイル（例: `rpg.css` / `badges.css`、または JS が入れる `<style>`）に書く。PC だけ変えたいところは、そのファイルの中で `@media (min-width: 900px)` の中に書く。`--col-gap` などの変数は pc.css（900px 以上）にしかないので、900px 未満でも使うなら `var(--col-gap, 16px)` のように予備の値を書く。
4. ゲーム画面はスクロールしない。ボタンや HP などは `cqh` で大きさを決める。メニュー・フォームは上下中央に置き、出たり消えたりする欄の場所を取っておく。一覧は上から並べる。
5. **ガチャの確率表は PC では常に見える場所に置く**（サイドバーの「引く」ボタンのすぐ下）。リンクの先に隠さない。スマホではボタンの下。
6. バッジを手に入れたときのお知らせは、PC では右上に出す（幅 最大360px）。クイズの問題や選択肢にかぶせない。reduced motion なら動かさない。派手な演出はドパガキ向けが ON のときだけ。
7. 文章は1行40字まで。見出しは `clamp()` で上限をつける。6rem を超える文字は使わない。
8. 称号やコインをトップバーに出すなら `#topbar-extra`（3.2）に入れる。

---

## 6. index.html の変更点

差分は `pc_layout_index.diff`（11章）。全部で次の6つ。

1. `<style>` の中の `@media (min-width: 900px) { … }`（`body { padding-block: 28px 48px; …` から `.binfo .facts …}` まで）を消す。代わりに、スマホ用に次の2行を足す（`.rslot` をスマホで出さない／`.rside` をスマホでは入れ物がないのと同じにする）:
   ```css
   .rslot { display: none; }
   .rside { display: contents; }
   ```
2. `</style>` の直後に `<link rel="stylesheet" href="pc.css" media="(min-width: 900px)">`（インラインの style より後に読むこと。同じ強さのルールは後のものが勝つため）。
3. あそび方の欄に id: `<div class="field" id="kinds-field">`。
4. `show(name)` の中に `document.body.dataset.screen = name;`。
5. `nextQuestion()` の `box.append(ch);` の後に答え用の場所を足す:
   ```js
   box.insertAdjacentHTML('beforeend', '<div class="rslot" aria-hidden="true"><p class="rslot-hint">答えたら、ここに国のプロフィールが出るよ</p><p class="rslot-keys"><kbd>1</kbd>〜<kbd>4</kbd> キーでも答えられる ・ <kbd>Enter</kbd> で次へ</p></div>');
   ```
   `answer()` の `$('qcard').append(r);` は次のように変える:
   ```js
   const slot = $('qcard').querySelector('.rslot');
   if (slot) slot.replaceWith(r); else $('qcard').append(r);
   ```
   `.rslot` はカードの最後の子なので、置きかえた後の並びは今の `append` と同じ。スマホでは `.rslot` が `display: none` なので見た目は変わらない。
6. `showResult()` の「まちがえた国」を `<div class="rside" id="r-side">…</div>` で包む（中身がなければ空のまま。PC の CSS は `:empty` で判定する）。

ほかの JS（d3 の地図、ズーム、キー操作、`scrollIntoView`）は変えない。答えを出すときの `scrollIntoView({ block: 'nearest' })` は、PC では全部画面に入っているので何もしない。

---

## 7. pc.css（試作で確かめた全文）

`designs/proto_pc/pc.css` と同じもの。リポジトリの直下に `pc.css` として置く（ファイル名は半角英数字）。

```css
/* pc.css — PC layout. index.html loads it with media="(min-width: 900px)", so phones (<900px) never apply it.
   Tiers: 900–1279 (2 columns), >=1280 (3-column quiz, 2-column hero/result), >=1600 (roomier spacing).
   "Fill the screen": sections span the page width (up to --page-max); game screens (home, quiz, result,
   図鑑 map) also fill the viewport height; short menus/forms are centered; lists stay top-aligned. */

:root {
  --gutter: clamp(24px, 3vw, 64px);
  --page-max: 1840px;
  --pad-y: clamp(12px, 1.8vh, 28px);
  --vgap: clamp(10px, 1.5vh, 20px);
  --card-pad: clamp(18px, 1.7vw, 36px);
  --col-gap: clamp(24px, 2.6vw, 56px);
  --measure: 40em;              /* Japanese prose: at most ~40 full-width characters per line */
}
/* rem grows 16px -> 18px between 1280px and 2080px wide (with the default 16px browser font). Below 1280 nothing changes. */
html { font-size: clamp(100%, calc(80% + .25vw), 112.5%); }  /* % keeps the user's browser font setting */
body {
  padding-block: var(--pad-y);
  padding-left: max(var(--gutter), env(safe-area-inset-left, 0px));
  padding-right: max(var(--gutter), env(safe-area-inset-right, 0px));
}
body > .wrap { max-width: var(--page-max); gap: var(--vgap); min-height: calc(100vh - 2 * var(--pad-y)); min-height: calc(100dvh - 2 * var(--pad-y)); }
.wrap .wrap { width: 100%; max-width: none; }
.hint, .panel p { max-inline-size: var(--measure); }
footer { margin-top: auto; }
body[data-screen="quiz"] footer { display: none; }

/* topbar: same edges as the content, one line */
#topbar { width: 100%; min-height: 36px; }
.brand { display: flex; align-items: baseline; gap: 12px; font-size: 1.15rem; }
.brand small { order: 2; }
.linkbtn { font-size: .95rem; }

/* ---------- home ---------- */
body[data-screen="home"] #scr-home { flex: 1 0 auto; justify-content: center; }
.home { padding-block: clamp(16px, 5vh, 64px); gap: clamp(18px, 3vh, 30px); }
.home h1 { font-size: clamp(4.4rem, calc(2rem + 3.4vw), 6rem); }
.home .flags { max-width: 820px; gap: 8px; }
.home .flags img { width: 44px; }
.home .flags img:nth-child(n+15) { display: block; }
.home .menu { flex-direction: row; width: auto; }
.home .menu .btn { min-width: 200px; }

/* ---------- panels / setup / settings ---------- */
.panel { padding: var(--card-pad); gap: 18px; }
.panel h2 { font-size: clamp(1.25rem, calc(1rem + .35vw), 1.6rem); }
.cols { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: var(--col-gap); align-items: start; }
.cols > .col + .col { border-left: 1px dashed var(--line); padding-left: var(--col-gap); }
.modecard { padding: 16px 18px; }
.modecard b { font-size: 1.08rem; }
#start { min-width: 200px; padding-block: 14px; }
#scr-settings.narrow { max-width: 720px; }

/* ---------- quiz: a stage that fills the rest of the viewport ---------- */
body[data-screen="quiz"] #scr-quiz { flex: 1 0 auto; }
#scr-quiz { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto minmax(0, 1fr); column-gap: 20px; row-gap: var(--vgap); }
#scr-quiz > .progress { grid-column: 1; grid-row: 1; }
#scr-quiz > .row.end { grid-column: 2; grid-row: 1; }
#scr-quiz > #qcard { grid-column: 1 / -1; grid-row: 2; }
#qcard {
  container-type: size;           /* children size themselves with cqh = the card's free height */
  min-height: 440px;              /* very short windows scroll instead of squashing */
  padding: var(--card-pad);
  display: grid; align-items: center;
  grid-template-columns: var(--qcols);
  grid-template-rows: minmax(0, 1fr) auto;
  column-gap: var(--col-gap); row-gap: 14px;
  --strip-h: 0px;
  --mh: calc(100cqh - var(--strip-h));   /* height available to the question + choices row */
}
#qcard.q-flag.a-name { --qcols: minmax(0, 1.1fr) minmax(0, 1fr); }
#qcard.q-name.a-flag { --qcols: minmax(0, .85fr) minmax(0, 1.2fr); }
#qcard.q-map.a-flag  { --qcols: minmax(0, 1.5fr) minmax(0, 1fr); }
#qcard.q-flag.a-map  { --qcols: minmax(0, .8fr) minmax(0, 1.4fr); }
#qcard > .qmain { grid-column: 1; grid-row: 1; gap: clamp(10px, 2.2cqh, 22px); }
#qcard > .choices { grid-column: 2; grid-row: 1; justify-self: center; }
#qcard .qlabel { font-size: clamp(1.2rem, calc(.9rem + .45vw), 1.55rem); }
#qcard .qflag { width: min(100%, 640px, calc((var(--mh) - 76px) * 4 / 3)); }
#qcard .qmain > .mapbox { width: min(100%, calc((var(--mh) - 76px) * 16 / 9)); }
#qcard .qbig { font-size: clamp(2.2rem, calc(1.1rem + 1.6vw), 3.6rem); text-wrap: balance; }
#qcard .qsub { font-size: .95rem; }
/* text choices: one column, buttons grow with the height */
#qcard .choices.textc { grid-template-columns: 1fr; width: 100%; max-width: 620px; gap: clamp(8px, 1.6cqh, 16px); }
#qcard .choices.textc .choice { min-height: clamp(56px, calc((var(--mh) - 48px) * .14), 96px); font-size: clamp(1.05rem, calc(.8rem + .3vw), 1.3rem); padding-inline: 18px; }
/* flag / map choices: 2x2. Width follows the height so both rows always fit:
   cell = 3 border + 20 padding + ~21 kbd + 6 gap + image (+27 with the country name) */
#qcard.a-flag > .choices, #qcard.a-map > .choices { --cell-extra: 52px; width: min(100%, calc(((var(--mh) - 10px) / 2 - var(--cell-extra)) * 8 / 3 + 56px)); }
#qcard:has(.cname) > .choices { --cell-extra: 80px; }

/* answer area. Before answering .rslot holds the place, so nothing moves when .reveal replaces it */
#qcard > .rslot, #qcard > .reveal { min-width: 0; }
.rslot { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted); text-align: center; }
.rslot p { margin: 0; }
.rslot-hint { font-family: var(--font-display); font-weight: 700; font-size: 1rem; }
.rslot-keys { font-size: .85rem; }
.rslot kbd { font-family: var(--font-mono); font-size: .75rem; border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; background: var(--surface); }
#qcard .reveal .verdict, #qcard .qlabel, #qcard .qbig { text-wrap: balance; word-break: auto-phrase; overflow-wrap: anywhere; } /* auto-phrase: Chrome 119+ breaks Japanese at phrase boundaries; others ignore it */

/* 900–1279: question | choices, answer strip below */
@media (max-width: 1279.98px) {
  #qcard { --strip-h: 150px; --mh: calc(100cqh - var(--strip-h) - 14px); }
  #qcard > .rslot, #qcard > .reveal {
    grid-column: 1 / -1; grid-row: 2; height: var(--strip-h); align-self: stretch;
    border-top: 1px dashed var(--line); padding-top: 12px;
  }
  #qcard > .reveal { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; grid-template-rows: auto minmax(0, 1fr); column-gap: 20px; row-gap: 6px; align-items: center; }
  #qcard > .reveal > .verdict { grid-column: 1 / 3; grid-row: 1; font-size: 1.1rem; line-height: 1.4; }
  #qcard > .reveal > .facts { grid-column: 1; grid-row: 2; grid-template-columns: 80px minmax(0, 1fr); gap: 12px; }
  #qcard > .reveal > .facts img { width: 80px; }
  #qcard > .reveal > .facts dl { grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); line-height: 1.45; }
  #qcard > .reveal > .facts .name { font-size: 1.15rem; }
  #qcard > .reveal > .map { grid-column: 2; grid-row: 2; height: 100%; max-height: 100%; width: auto; aspect-ratio: 16 / 9; }
  #qcard > .reveal > .next { grid-column: 3; grid-row: 1 / -1; align-self: end; }
  body.dopa #qcard > .reveal > .verdict { font-size: 1.3rem; }
}

/* ---------- result ---------- */
body[data-screen="result"] #scr-result { flex: 1 0 auto; }
#rcard { flex: 1 0 auto; padding: var(--card-pad); justify-content: center; }
#rcard .score { font-size: clamp(3.4rem, calc(1.6rem + 2.4vw), 5.2rem); }
#rcard .rside { display: flex; flex-direction: column; align-items: center; gap: 18px; width: 100%; }
#rcard .rside:empty { display: none; }
.misslist { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); }

/* ---------- 図鑑 ---------- */
/* list view: the toolbar becomes a small sticky card so search/filter stay reachable while scrolling 195 cards */
#scr-book:has(> #grid:not([hidden])) > .row:first-child {
  position: sticky; top: 8px; z-index: 5; padding: 8px 12px; border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid var(--line);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgb(0 0 0 / .06);
}
#scr-book input[type="search"] { width: clamp(200px, 18vw, 320px); }
.grid { grid-template-columns: repeat(auto-fill, minmax(clamp(160px, 10.5vw, 230px), 1fr)); gap: clamp(12px, 1vw, 18px); }
.card b { font-size: clamp(.95rem, calc(.8rem + .2vw), 1.1rem); }
body[data-screen="book"] #scr-book:has(> #bmap:not([hidden])) { flex: 1 0 auto; }
.bmap { display: grid; grid-template-columns: minmax(0, 1fr) clamp(280px, 24vw, 420px); gap: 20px; align-items: center; }
#scr-book > #bmap { flex: 1 1 0; min-height: 360px; container-type: size; }
.bmap > .mapbox { width: min(100%, calc(100cqh * 16 / 9)); justify-self: center; }
.binfo { min-height: 240px; }
.binfo .facts { grid-template-columns: 1fr; } .binfo .facts img { width: 100%; max-width: 320px; }

/* ---------- dialog (図鑑の詳細) ---------- */
#detail { width: min(640px, calc(100vw - 64px)); }

/* ================= >= 1280 ================= */
@media (min-width: 1280px) {
  /* home: two-column hero, flag mosaic on the right */
  body[data-screen="home"] #scr-home {
    display: grid; justify-content: stretch; text-align: left;
    grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
    grid-template-rows: 1fr auto auto auto auto 1fr;
    grid-template-areas: ". flags" "eyebrow flags" "title flags" "menu flags" "book flags" ". flags";
    column-gap: clamp(40px, 5vw, 120px); row-gap: clamp(14px, 2.4vh, 26px);
    padding-inline: clamp(0px, 3vw, 64px);
  }
  .home .eyebrow { grid-area: eyebrow; }
  .home h1 { grid-area: title; }
  .home .menu { grid-area: menu; flex-direction: column; width: min(340px, 100%); }
  .home .menu .btn { min-width: 0; }
  #home-book { grid-area: book; justify-self: start; padding-inline: 0; }
  .home .flags {
    grid-area: flags; align-self: center; justify-self: center;
    display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: clamp(8px, .8vw, 14px);
    width: 100%; max-width: min(100%, calc((100dvh - 2 * var(--pad-y) - 2 * clamp(16px, 5vh, 64px)) * 1.5));
  }
  .home .flags img { width: 100%; border-radius: 4px; }

  /* setup: modes in one row of 4, then あそび方 | 地域・問題数 */
  #scr-setup .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "modes modes" "nameopt nameopt" "kinds opts"; row-gap: 18px; }
  #scr-setup .col:first-child { display: contents; }
  #modes { grid-area: modes; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  #nameopt-field { grid-area: nameopt; }
  #kinds-field { grid-area: kinds; }
  #scr-setup .col + .col { grid-area: opts; }
  #kinds { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  body[data-screen="setup"] #scr-setup { flex: 1 0 auto; justify-content: center; }
  #modes .modecard { min-height: clamp(84px, 12vh, 150px); justify-content: center; padding: 18px 22px; }
  #modes .modecard b { font-size: clamp(1.1rem, calc(.9rem + .4vw), 1.45rem); }
  #modes .modecard span { font-size: .85rem; }
  /* keep the row's height when the option is hidden, so the centered panel never jumps */
  #nameopt-field[hidden] { display: flex !important; visibility: hidden; }

  /* settings: fields side by side once there are several */
  #scr-settings.narrow { max-width: 1080px; }
  #scr-settings .panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); column-gap: var(--col-gap); align-items: start; }
  #scr-settings .panel > h2, #scr-settings .panel > .row { grid-column: 1 / -1; }
  body[data-screen="settings"] #scr-settings { flex: 1 0 auto; justify-content: center; }
  #set-sound-row[hidden] { display: inline-flex !important; visibility: hidden; }

  /* quiz: question | choices | answer column (3rd column is always reserved) */
  #qcard { grid-template-columns: var(--qcols) minmax(320px, .85fr); grid-template-rows: minmax(0, 1fr); }
  #qcard.q-flag.a-name { --qcols: minmax(0, 1.1fr) minmax(0, .95fr); }
  #qcard.q-name.a-flag { --qcols: minmax(0, .8fr) minmax(0, 1.15fr); }
  #qcard.q-map.a-flag  { --qcols: minmax(0, 1.8fr) minmax(0, .9fr); }
  #qcard.q-flag.a-map  { --qcols: minmax(0, .75fr) minmax(0, 1.35fr); }
  #qcard > .rslot, #qcard > .reveal {
    grid-column: 3; grid-row: 1; align-self: stretch;
    border-left: 1px dashed var(--line); padding-left: var(--col-gap); margin-left: calc(var(--col-gap) * -.5);
  }
  #qcard > .reveal { display: flex; flex-direction: column; justify-content: center; gap: clamp(10px, 1.8cqh, 18px); border-top: 0; padding-top: 0; }
  #qcard > .reveal > .verdict { font-size: 1.25rem; line-height: 1.4; }
  body.dopa #qcard > .reveal > .verdict { font-size: 1.6rem; }
  body.dopa #qcard > .reveal > .verdict.ng { font-size: 1.3rem; }
  #qcard > .reveal > .facts { grid-template-columns: clamp(84px, 6.5vw, 128px) minmax(0, 1fr); }
  #qcard > .reveal > .facts img { width: 100%; }
  #qcard > .reveal > .map { width: min(100%, calc((100cqh - 340px) * 16 / 9)); align-self: center; }
  #qcard > .reveal > .next { align-self: stretch; }

  /* result: score on the left, まちがえた国 (and future badge/reward blocks) on the right */
  #rcard .result > .qlabel { font-size: clamp(1.3rem, calc(.9rem + .6vw), 1.8rem); }
  #rcard .score { font-size: clamp(4rem, calc(1.6rem + 3vw), 6.4rem); }
  #rcard .stats { font-size: 1.02rem; gap: 24px; }
  #rcard .row.center .btn { min-width: 200px; padding-block: 14px; }
  #rcard:has(> .rside:not(:empty)) {
    display: grid; grid-template-columns: minmax(320px, 560px) minmax(0, 760px); justify-content: center; align-content: center;
    column-gap: calc(var(--col-gap) * 1.5); row-gap: 28px;
  }
  #rcard:has(> .rside:not(:empty)) > .result { grid-column: 1; grid-row: 1; align-self: end; }
  #rcard:has(> .rside:not(:empty)) > .row.center { grid-column: 1; grid-row: 2; align-self: start; }
  #rcard > .rside:not(:empty) { grid-column: 2; grid-row: 1 / span 2; align-self: center; align-items: stretch; border-left: 1px dashed var(--line); padding-left: calc(var(--col-gap) * 1.5); max-height: 100%; }
  #rcard > .rside > .qlabel { text-align: left; }

  /* 図鑑の詳細: facts left, map right */
  #detail { width: min(980px, calc(100vw - 64px)); }
  #detail .inner { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 16px 28px; align-items: center; }
  #detail .inner > .close { grid-column: 1 / -1; justify-self: end; }
  #detail .inner > .facts { grid-template-columns: 1fr; }
  #detail .inner > .facts img { width: 100%; }
}

/* ================= >= 1600 ================= */
@media (min-width: 1600px) {
  .modecard { padding: 20px 22px; }
  .choice kbd, .rslot kbd { font-size: .8rem; }
}

/* short windows (laptops at 125–150% zoom, 1366x768 with browser chrome) */
@media (max-height: 760px) {
  :root { --vgap: 10px; --pad-y: 12px; --card-pad: clamp(16px, 1.4vw, 24px); }
  #qcard .qlabel { font-size: 1.15rem; }
  #modes .modecard { min-height: 0; padding: 14px 18px; }
  #nameopt-field[hidden] { display: none !important; }
  .panel { gap: 14px; }
}
```

使っている新しめの CSS とブラウザの対応: `container-type` / `cqh`（Chrome 105、Safari 16、Firefox 110）、`:has()`（Chrome 105、Safari 15.4、Firefox 121）、`100dvh`（`100vh` の行を先に書いてある）、`word-break: auto-phrase`（Chrome 119。他は無視）、`color-mix()`（index.html ですでに使っている）。`:has()` が使えない古いブラウザでは、図鑑の検索の固定、結果の2列、国名表示 ON のときの大きさ調整が効かないだけで、画面は崩れない。

---

## 8. 他の作業との関係と、実装の手順

- 今、別の AI が同じ index.html にタイムアタックとランキングを入れている（`show()`、`SCREENS`、`nextQuestion()`、`answer()`、`showResult()`、CSS）。**PC レイアウトは、そのブランチが入った後に入れる。** 同時に触ると衝突する。
- 手順:
  1. タイムアタック・ランキングが入った index.html を読む。900px 以上向けの CSS が足されていたら、pc.css に移す（ランキングは 5.9 のルールに合わせる）。
  2. 6章の変更を入れる。`showResult()` のタイムアタック分岐でも、「ランキングに載せる？」の欄と順位の表示は `#r-side` の中に入れる。
  3. 7章の pc.css を置く。
  4. 9章のチェックを全部通す（スクリプトは 11 章）。スマホ幅の比べ方は「変更前の index.html」対「変更後」。
- イベント（`drill:answer` / `drill:result` など）の仕組みには関係しない。今後の機能は `#r-side` と `#topbar-extra` と `body[data-screen]` を使えばよい。

---

## 9. テストチェックリスト

### 画面の大きさ

| 種類 | 大きさ（ブラウザの中） | 意味 |
|---|---|---|
| スマホ | 360×740、390×844、430×932 | 変わっていないこと |
| 境目 | 899×900 / 900×700 | 899 は変わっていない、900 から PC |
| タブレット横・小さい窓 | 1024×768 | 2列＋下の帯 |
| ノート | 1280×577（1920×1080 を 150% 表示）、1280×720、1366×657（1366×768 のノート）、1366×768、1440×900、1536×730（1920×1080 を 125% 表示） | 3列。背の低い画面 |
| デスクトップ | 1920×945（1080p のブラウザの中）、1920×1080、2560×1300、3440×1340（ウルトラワイド） | 余白・文字の上限 |

### 確かめること

1. **横スクロールが出ない**: すべての画面・大きさで `document.documentElement.scrollWidth <= innerWidth`。
2. **クイズが画面に収まる**（900px 以上の全部の大きさ）: 4モード ×（答える前／正解／不正解／国名表示 ON（m2f・f2m））×（通常／ドパガキ向け）で、
   - `#qcard` の下の端 ≤ `innerHeight`、かつ `#next` が画面の中、
   - `#qcard` の中の要素がカードの内側から上下左右にはみ出していない。文字の要素（`p` `b` `span` `dd` `button`）で `scrollWidth > clientWidth` になっていない、
   - `document.documentElement.scrollHeight === innerHeight`。
   長い国名でも確かめる（セントクリストファー・ネービス、セントビンセント・グレナディーンを問題にして不正解にする）。
3. **答えても動かない**: 答える前と後で `.qmain` と `.choices` の位置・大きさが同じ（900px 以上）。
4. **ホーム・結果・図鑑の地図がスクロールしない**（高さ 577px 以上の PC の大きさ全部）。
5. **モード選択・設定**: 高さ 650px 以上でスクロールしない。1280×577 のモード選択は 16px までのスクロールなら許す。モードを切り替えても、ドパガキ向けを ON/OFF してもパネルが上下に動かない（高さ 760px より大きいとき）。
6. **図鑑の一覧**: 列の数が 2章・5.6 のとおり。下までスクロールしても検索の行が見えている。
7. **文字が大きすぎない**: ホームのタイトル以外で 6rem を超える文字がない。問題の国旗の幅 ≤ 640px。文字の選択肢 ≤ 1.3rem。
8. **スマホは変わっていない**: 390×844 と 899×900 で、全画面（ホーム、設定、モード選択、クイズ4モード、答え4モード＋不正解＋国名表示、結果2種、図鑑の一覧・地図・詳細）の**全要素の位置と大きさ**を、変更前と変更後で比べて同じ（`geom.js`）。画像の比較だと、背景の紙の模様（`position: fixed`）がスクロール位置でずれて少し違って見えるので、要素の位置で比べる。
9. **ダークモード・ドパガキ向け・reduced motion** で見た目を確かめる（色はすべて変数なので、崩れていないかだけ見る）。
10. **キー操作**: 1〜4 と Enter が今までどおり動く。答えたら「次の問題 →」にフォーカスがある。フォーカスの枠が見える。
11. **ブラウザ**: Chrome、Safari（16 以上）、Firefox（121 以上）。ブラウザの拡大 125%・150%・200% も見る（200% だとカードは高さ 440px のまま、ページがスクロールするのが正しい）。
12. **タイムアタック・ランキング**: タイムの行が収まる、失格の表示が収まる、結果の登録欄が右の列に出る、ランキングが 1280×800 と 1920×1080 で横スクロールしない。

---

## 10. 試作での結果

試作（`designs/proto_pc/`。作業前のスナップショットに 6章の変更と 7章の pc.css を入れたもの）を Playwright（Chromium）で測った。

- PC 10通りの大きさ（900×700、1024×768、1280×577、1366×657、1366×768、1440×900、1536×730、1920×945、1920×1080、2560×1300）× 20画面、ドパガキ向け ON の 12通り、長い国名（セントクリストファー・ネービス、セントビンセント・グレナディーン）の 25通り、長い国名＋ドパガキ向けの 4通り、合計 241 回:
  - 横スクロール: **0 回**。
  - クイズ（答える前・正解・不正解・国名表示 ON・長い国名、4モード）の 158 の状態: **全部が画面に収まった**。上下左右のはみ出し 0px。
  - ホーム・結果・図鑑の地図・設定: スクロールなし。
  - 例外は 1280×577 のモード選択だけ（8px スクロール。メニュー画面なので許す）。
- スマホ: 390×844 と 899×900 の 17画面（合計 34通り）で、全要素の位置と大きさが変更前と**完全に同じ**。
- 見た目の確認用のスクショ: `designs/pc_shots/`（1024×768、1366×768、1920×1080）。

---

## 11. ファイル

すべて `/tmp/claude-0/-home-claude-country-drill/a88bb5ec-f4be-5aa6-9d22-52a082a42612/scratchpad/designs/` の中。

| ファイル | 中身 |
|---|---|
| `pc_layout_design.md` | この設計書 |
| `proto_pc/pc.css` | 7章の pc.css（試作で確かめたもの） |
| `proto_pc/index.html` | 試作の index.html（作業前のスナップショット＋6章の変更） |
| `pc_layout_index.diff` | index.html の差分（スナップショット → 試作） |
| `pc_layout_removed_block.css` | index.html から消す今の 900px 以上の CSS |
| `measure.js` | 横スクロール、クイズが収まるか（上下左右のはみ出し、文字のはみ出し）を測り、スクショも撮る。`node measure.js --root <アプリのフォルダ> --out <出力> --viewport 1366x657,1920x1080 [--screens a,b] [--dopa] [--long] [--no-shot] [--full]` |
| `geom.js` | スマホ幅の比較用。`node geom.js` で `_geom_run.js` を作り、`GEOM_OUT=old.json node _geom_run.js --root <変更前> --no-shot --viewport 390x844,899x900` と変更後の分を出して、JSON を比べる |
| `pc_shots/` | 試作のスクショ |
| `final_measure.txt` | 10章の測定結果 |

`measure.js` は d3 / topojson を `../snap359/vendor` から読む（CDN を手元のファイルに差し替える）。リポジトリで使うときは、このパスを変える。
