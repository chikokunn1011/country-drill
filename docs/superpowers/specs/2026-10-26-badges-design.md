
# バッジ・称号 設計書 v2（195か国ドリル / badges.js）

- 日付: 2026-10-26（v2: 別の AI がチェックした内容を入れた版）
- 依頼（チコ）: 「バッジ・称号の機能を追加して」
- 前提:
  - index.html のフック H1〜H9（`emit` `registerScreen` `toast` と `drill:*` イベント）は、RPG 設計書 §10.2 と**共通**。先に入ったほうの機能が足し、あとの機能はそれを使う。
  - RPG は **RPG 設計 v2**（`critic/rpg_design_v2.md`）に合わせる。特に次の3つ。
    - §8 の「苦手の印 `wk`」と「克服は別のゲームでの一発正解」
    - §10.3 の `rpg:promote {a, star, via}`
    - §10.3 の `rpg:levelup {lv, from}`
  - タイムアタック（`kind:'ta'`）とランキングは main に入っている前提（`G.timeMs`、`#home-rank`）。
  - PC 全画面レイアウト（`pc.css`、`body[data-screen]`、`#r-side`）があればそれに従う。なくても崩れずに動く（§6.1、§6.2）。
  - RPG（rpg.js）がなくてもバッジは動く。冒険のバッジが出ないだけ。
- 確認したコード（作業中の index.html）:
  - `answer()`。`store.set('misses')` のあとに、タイムアタックの「正解ならすぐ次へ」の早めの return がある
  - `restartChallenge()`。`G.seen` を残すので、やり直しの問題は `first=false` になる
  - `showResult()` とトースト関係: `#rcard` を書いてから `show('result')` を呼ぶ。900px 以上の `.home .menu` は横並びで、ボタンの最小幅は200px
  - `.wrap` は 900px 以上で max-width 1200px
  - `MODES`。`nameOpt`（国名ヒント）があるのは `m2f` と `f2m` だけ
  - 図鑑: `$('grid').onclick` → `#detail.showModal()`、`selectBook(a, tapped)`
  - `#detail` は `<dialog>` で、中身は `#detail-inner`

---

## v2 での変更点（チェックで直したところ）

1. **ta-speed の判定が逆になるバグを直した。** `reached` が段の `lower` を見ていて、バッジに書いた `lower` を読んでいなかった（§3.2）。
2. **七転び八起きは「わざとまちがえる」と取れたので条件を変えた。** 新しい条件は「挑戦でつまずいた条件を、あとの別のゲームで1回目にクリア」（§2.2）。
3. **克服を RPG v2 と同じ定義にした。** 別のゲームでのヒントなし一発正解（`first`）で数え、苦手の印 `wk` を使う。同じゲームの中では数えないので量産できない（§2.1、§3.3）。
4. 1問ごとの記録とゲーム単位の記録の数え方を書き直した（`quit` の扱い、§3.3）。同じ `sid` の結果が2回来たら丸ごと無視する。
5. 連続正解は `drill:result` の `best` を使う（`drill:answer` は op を積むだけ）。
6. 判定は「統計が変わるイベント」のあとだけ行い、クイズ中は判定しない。`badge:earned` は保存したあとでまとめて出し、入れ子を防ぐ（§3.2）。
7. **セーブを `tx` と op 方式にした。** タブ2つ、書けないとき、readOnly、ページを閉じるときに強くなる（§7）。
8. NEW の印は時刻 `sn` で決める。称号は「まだ選んでいない（`null`）」と「つけないを選んだ（`''`）」を分ける。
9. トーストはスマホでは上に出す（§5.3）。ホームの札とボタンを、PC の 900〜1,279px で崩れないようにした（§6.1）。バッジ画面は PC で画面いっぱいに広げる（§6.2）。
10. `count()` は表示中のバッジだけで数える。ガチャ画面ではお知らせを待つ。`micro` は金から銀にした。
11. ヒントありの注意を出す。［練習する →］で問題数も合わせる。
12. ●+50 はバッジ側が出し、rpg.js は黙って払う。払えなかったら送り直す（§8.3、§8.4）。

---

## 0. まとめ

- **バッジは38種類（冒険なしで26種類）。**
  - 24種類は 銅 → 銀 → 金 の3段階、14種類は1段階だけ
  - 取れる段（ステップ）は全部で **86**（冒険なしで66）
- **ステップごとに称号が1つもらえる。**
  - 全86個で、名前はすべてちがう
  - 好きな称号を1つつけられ、**ホーム**と**冒険の旅人カード**に出る
- 条件はすべて「イベント＋保存した統計」から計算できる数字で決める。どのバッジにも「いまの値 / 目標」があるので、**全部に進み具合のバーを出せる**。
- **ほめるのは学習とうまさだけ。**
  - ガチャの運・引いた回数・使ったコイン・連続ログインはほめない
  - **まちがえた回数ややり直した回数も条件にしない**
  - 毎日のバッジは「通算の日数」で数え、休んでも減らない
- 新しいファイルは2つ。
  - **`badges.js`**（約500行、即時関数）
  - **`badges.css`**（約190行）
  - index.html への追加は、RPG と共通のフックのほかに **`<link>` と `<script>` の2行だけ**
- お知らせの出し方:
  - **クイズ中・バトル中・ガチャの演出中・ダイアログ表示中は出さない**
  - クリアしたら結果画面にまとめて出す
  - ドパガキ OFF なら静かに、ON なら音と紙吹雪。reduced motion なら動かさない

---

## 1. 方針

1. **バッジは勉強の地図。** 「アジアの国を4モード全部で正解」「小さい国25か国」のように、条件を読めば次に覚えるものがわかるようにする。ひみつのバッジ（3つ）以外は、条件をそのまま見せる。
2. **ヒントありは、うまさのバッジに数えない。**
   - `hint`（国名表示 ON）があるのは `m2f` と `f2m` だけ。`f2n` `n2f` とタイムアタックは、いつも `hint:false`
   - ヒントありの正解が数えられるのは次の6つだけ:「正解の合計」「はじめの一歩」「地域の銅」「通算日数」「ドパミン解放」「旅のバッジ」
3. **まちがえることを狙わせない。**
   - 「◯回まちがえた」「◯回やり直した」は条件にしない
   - 克服と七転び八起きは「**別のゲームで取り返した**」ことをほめる。だから、同じゲームの中でわざとまちがえても取れない
4. **一度取ったバッジは消えない。** 設定の「まちがえた記録を消す」でも、冒険データを消しても残る。
5. **クイズを止めない。** `drill:answer` を受け取ったら、メモリに op を1つ積むだけにする。判定・保存・表示はゲームが終わってから行う（タイムアタックの計測中に重い処理をしない）。

---

## 2. バッジ一覧（カタログ）

- 段の色は4つ。色だけでなく「銅・銀・金・虹」の文字も必ず出す。
  - **銅**（ブロンズ）
  - **銀**（シルバー）
  - **金**（ゴールド）
  - **虹**（レインボー）: とても難しい2つだけ（`reg-world` の金と `rpg-final`）
- 3段のバッジは、1段目＝銅、2段目＝銀、3段目＝金。ただし `reg-world` の3段目だけ虹。
- 言葉の決まり:
  - 「ヒントなし」は `hint === false`
  - 「クリア」は `drill:result` の `outcome === 'clear'`
- ステップのキーは `"<バッジid>@<段>"`（例 `reg-asia@2`）。1段だけのバッジも `micro@1` のように書く。キーの形は `/^[a-z0-9-]{1,32}@[1-9]$/`。

### 2.1 クイズ（5）

| id | アイコン | バッジ | 段 | 条件（ちょうどこの値で取れる） | 称号 |
|---|---|---|---|---|---|
| `first-clear` | 🌱 | はじめの一歩 | 銅 | ゲームを1回クリアする（ヒントありでもOK） | ドリルの新人 |
| `answers` | 📚 | こつこつ正解 | 銅/銀/金 | 正解の合計（クイズ＋バトル、ヒントありもふくむ）が **100 / 1,000 / 5,000** | こつこつ派 / 努力の人 / ドリルの鬼 |
| `streak` | 🔗 | れんぞく正解 | 銅/銀/金 | 続けて正解した数の最高が **10 / 30 / 100**。数えるのは、ヒントなしの1回のゲーム（`drill:result` の `best`）か、1回のバトル（`maxCombo`） | 波に乗る人 / 止まらない人 / 百連の達人 |
| `overcome` | 💪 | 苦手克服 | 銅/銀/金 | 苦手な国を克服した数が **1 / 10 / 50**（1か国1回）。苦手な国とは `misses` が1以上か、苦手の印 `wk` が付いている国。克服とは、その国に**ヒントなしで一発正解（`first`）**して `misses` が0になること。同じゲームのやり直しでの正解は数えない。バトルの `rpg:overcome` もふくむ | リベンジャー / 苦手つぶし / にがて知らず |
| `micro` | 🔬 | ちっちゃい国探検隊 | **銀** | 面積 1,000km² 未満の国（いま **25か国**。起動時に `C.filter(c => c.ar < 1000)` で数える）すべてに、どれかのモードでヒントなしで正解 | ミクロの探検家 |

- 苦手の印 `wk` の付け方と外し方は RPG v2 §8 と同じ。
  - クイズでもバトルでも、まちがえたら付く
  - ヒントなしの一発正解で外れる
  - 設定の「まちがえた記録を消す」でも外れる（克服したかどうかの記録は残す）
- `micro` を金から銀にした理由: `mode-*` の銀（100か国）より易しいため。

### 2.2 あそび方（5）

| id | アイコン | バッジ | 段 | 条件 | 称号 |
|---|---|---|---|---|---|
| `prac-perfect` | ✨ | ノーミス練習 | 銅/銀/金 | 練習をまちがえ0（`wrongs === 0`）でクリア（ヒントなし）。問題数 `n` が **10以上 / 20以上 / 40以上** | ていねい派 / ノーミス職人 / 完璧主義者 |
| `chal-flawless` | 🎯 | 一発クリア | 銅/銀/金 | 挑戦を1回目（`attempts === 1`）でクリア（ヒントなし）。`n` が **10以上 / 20以上 / 40以上** | 集中モード / 鉄の集中力 / ミスを知らない人 |
| `chal-grit` | 🧗 | 七転び八起き（ひみつ） | 銀 | 挑戦（ヒントなし・10問以上）で**まちがえたことのある条件**（モード・地域・問題数が同じ）を、**あとの別のゲームで1回目にクリア**する | 不屈の人 |
| `ta-clear` | ⏱️ | タイムアタッカー | 銅/銀/金 | タイムアタックをクリア。`n` が **5以上 / 20以上 / 40以上** | スピード見習い / タイムアタッカー / 秒速の旅人 |
| `ta-speed` | ⚡ | スピードスター | 銅/銀/金 | タイムアタック（`n >= 10`）をクリアし、1問あたりの時間 `timeMs / n` が **3.0秒 / 2.0秒 / 1.4秒以内**（小さいほどよい） | せっかち名人 / スピードスター / 光速の目 |

- 40問以上になるのは、アジア・ヨーロッパ・アフリカの「全部」か、全世界の「全部」。
- `chal-grit` の「まちがえたことのある条件」:
  - ヒントなし・`n >= 10` の挑戦で `wrongs >= 1` だった `drill:result` の条件（`mode:地域キー:n`）を `s.cf` に覚える。クリアでも途中でやめても覚える。最大30件で、古いものから捨てる
  - 1回目でクリアしたゲームの条件が `s.cf` に入っていれば取れる。判定するのは、そのゲームの条件を覚える前なので、同じゲームでは取れない
  - わざと1回まちがえても、あとで同じ条件をノーミスでクリアする実力が要る。だからまちがえることを狙わせない
- ひみつのバッジのヒント: `chal-grit`「挑戦でつまずいた条件に、もう一度いどむと…」

### 2.3 モード（4）— そのモードでヒントなしで正解したことがある国の数

| id | アイコン | バッジ（タイルの下に小さくモード名） | 段 | 条件 | 称号 |
|---|---|---|---|---|---|
| `mode-f2n` | 🚩 | 旗ソムリエ（国旗→国名） | 銅/銀/金 | **30 / 100 / 195か国** | 旗見習い / 旗ソムリエ / 国旗の達人 |
| `mode-n2f` | 🔍 | 旗さがし名人（国名→国旗） | 銅/銀/金 | 同上 | 旗さがし屋 / 旗えらび名人 / 旗の目きき |
| `mode-m2f` | 🗺️ | 地図よみ（場所→国旗） | 銅/銀/金 | 同上 | 地図好き / 地図よみ名人 / 歩く地図帳 |
| `mode-f2m` | 📍 | ピンポイント（国旗→場所） | 銅/銀/金 | 同上 | 方向音痴卒業 / ピンポイント職人 / 人間GPS |

バトルでの正解（`rpg:answer` の `f2n` `n2f` `m2f`）も数える。`cap`（首都）は数えない。

### 2.4 地域（7）— 段ごとに条件の種類が変わる

| 段 | 条件 |
|---|---|
| 銅 | その地域で **10問以上** のゲームをクリア（あそび方は何でも。ヒントありでもOK） |
| 銀 | その地域の **「全部」** をヒントなしでクリア（`n === その地域の国の数`。あそび方は何でも） |
| 金 | その地域の国 **すべてを4モードすべて** でヒントなしで正解（バーは `x / 国の数×4`） |

| id | アイコン | バッジ | 国の数 | 称号（銅 / 銀 / 金） |
|---|---|---|---|---|
| `reg-samerica` | 🦙 | 南米アドベンチャー | 12 | 南米の旅人 / 南米通 / 南米博士 |
| `reg-oceania` | 🐚 | 南の島めぐり | 14 | 南の島の旅人 / オセアニア通 / オセアニア博士 |
| `reg-namerica` | 🌵 | 北中米ロードトリップ | 23 | 北中米の旅人 / 北中米通 / 北中米博士 |
| `reg-europe` | 🏰 | ヨーロッパ周遊 | 46 | ヨーロッパの旅人 / ヨーロッパ通 / ヨーロッパ博士 |
| `reg-asia` | 🐼 | アジア大陸横断 | 46 | アジアの旅人 / アジア通 / アジア博士 |
| `reg-africa` | 🦁 | アフリカ大冒険 | 54 | アフリカの旅人 / アフリカ通 / アフリカ博士 |
| `reg-world` | 🌏 | 世界一周 | 195 | 世界の旅人 / 世界通 / 世界博士（**虹**） |

- 地域のキーは ranking.js の `REGION_KEY`、RPG v2 のダンジョン id と同じ（`asia europe africa namerica samerica oceania`）。全世界は `world`。
  - badges.js は同じ対応表を自分で持つ（ranking.js に頼らない）
  - `S.region` が対応表にない値なら `rkOf()` は `null` を返し、その結果の地域の記録はとばす
- 国の数は countries.js から起動時に数える（上の表の数字はコードに書かない）。どの地域にも、国の数がちょうど5・10・20のところはない。だから `n === 国の数` なら「全部」と判断してよい。

### 2.5 図鑑・毎日（3）

| id | アイコン | バッジ | 段 | 条件 | 称号 |
|---|---|---|---|---|---|
| `book` | 📖 | 図鑑めくり | 銅/銀/金 | 図鑑で開いた国の数（`drill:book-open`）が **10 / 50 / 195** | 図鑑好き / 図鑑マニア / 歩く図鑑 |
| `days` | 📅 | 通いなれた道 | 銅/銀/金 | ゲームかバトルを終えた日の**通算**日数（連続でなくていい）が **3 / 10 / 30** | 常連さん / おなじみさん / ドリルが日課 |
| `comeback` | 👋 | おかえり！（ひみつ） | 銅 | 前に遊んだ日から **14日以上** あけて、また遊ぶ | 帰ってきた旅人 |

- 日付は端末のローカル時刻で `YYYY-MM-DD`。日数の差は `Date.UTC(y, m-1, d) / 864e5` の差で出す（夏時間の影響を受けない）。
- 「遊んだ日」は次のどちらかがあった日。
  - `drill:result` の `outcome` が `clear` か `fail`
  - `rpg:battle` が来た
- 端末の日付が前に戻ったときは、その日を数えない。
- ひみつのバッジのヒント: `comeback`「しばらく旅に出て、また戻ってくると…」
- `book` は195回タップすれば取れる。でも、開くたびに国旗・首都・地図を見ることになり、1段1回だけなので、そのままにする。

### 2.6 ドパガキ（2）

| id | アイコン | バッジ | 段 | 条件 | 称号 |
|---|---|---|---|---|---|
| `dopa-on` | 🎉 | ドパミン解放 | 銅 | 「ドパガキ向け」ON（`S.dopa`）でゲームをクリア | お祭り好き |
| `dopa-fever` | 🌈 | フィーバータイム（ひみつ） | 銀 | ドパガキ ON のヒントなしのゲームで、`best >= 20`（画面に 👑 COMBO が出る数） | フィーバー王 |

- ひみつのバッジのヒント: `dopa-fever`「ドパガキ向けで、王冠が見えるまで…」
- `S.dopa` はイベントに入っていないので、`drill:result` を受け取ったときにグローバルの `S.dopa` を読み、op に入れる。ゲームの途中で設定画面へ行くと、先に `drill:result`（quit）が出る。だから、その時点の `S.dopa` はゲーム中と同じ。

### 2.7 冒険（12）— rpg.js があるときだけ表示する

| id | アイコン | バッジ | 段 | 条件（使うイベント / さかのぼり） | 称号 |
|---|---|---|---|---|---|
| `rpg-start` | 🎒 | 旅立ち | 銅 | 冒険をはじめる（`rpg:coins` の reason `start` / `snap.intro`。`intro` がなければ `lv > 1 \|\| st.win + st.lose + st.flee > 0`） | 見習い旅人 |
| `rpg-first-win` | ⚔️ | 初勝利 | 銅 | バトルにはじめて勝つ（`rpg:battle` の `win` / `snap.st.win > 0`） | かけだし勇者 |
| `rpg-lv` | 🧙 | 旅人のレベル | 銅/銀/金 | **Lv 10 / 30 / 50**（`rpg:levelup` の `lv` / `snap.lv`） | 一人前の旅人 / ベテラン旅人 / 伝説の旅人 |
| `rpg-boss` | 👑 | 旗を取りもどせ | 銅/銀/金 | 地域ボス（`world` 以外）を倒した数が **1 / 3 / 6**（`rpg:clear` / `snap.floors[id] >= 5`） | 旗の守り手 / 三地域の勇者 / 六地域の勇者 |
| `rpg-final` | 👾 | 世界を取りもどした | 虹 | 地図喰いを倒す（`rpg:clear` の `dungeon === 'world'` / `snap.floors.world >= 5`） | 世界を取りもどした者 |
| `rpg-nodmg` | 🛡️ | 無傷の勝利 | 銀 | ボスをミス0で倒す（`rpg:battle` で `boss && win && mistakes === 0`。さかのぼりなし） | 無傷の旅人 |
| `rpg-underdog` | 📜 | 知識こそ力 | 金 | 推奨 Lv より5以上低い Lv でボスに勝つ（`boss && win && lv <= recLv - 5`。さかのぼりなし。ダンジョン1のボスは推奨 Lv5 なのでここでは取れない。ダンジョン2以降で取れる） | 知識の勇者 |
| `rpg-phoenix` | 💫 | 不死鳥 | 銀 | 思い出して復活し、そのバトルに勝つ（`revived && win`。さかのぼりなし） | 不死鳥 |
| `rpg-friend` | 🤝 | 覚えて仲間に | 銅 | なかよし度で、はじめて仲間ができる（`rpg:join` の `via === 'learn'`。さかのぼりなし） | 国の友だち |
| `rpg-master` | 🏅 | マスター昇格 | 銀 | 覚えてシルバーに上がる（`rpg:promote` の `via === 'learn'`。`via` がない古い rpg.js では「`star === 2` で、いまの画面が `gacha` ではない」とみなす） | 4モードの達人 |
| `rpg-cards` | 🗂️ | 仲間あつめ | 銅/銀/金 | 仲間の数が **50 / 100 / 195**（`rpg:join` の `owned` / `snap.owned`） | 50か国の友 / 100か国の友 / 世界の友 |
| `rpg-bounty` | 🔎 | 手配書ハンター | 銅/銀/金 | 手配書を全部達成した日が通算 **1 / 10 / 30**（`rpg:bounty` の `totalDays` / `snap.bountyDays`） | 新米探偵 / 敏腕探偵 / 名探偵 |

- RPG 設計 §12 にあったバッジのうち、次の3つはクイズのバッジに合流させた。
  - バトルの連続正解（`rpg-combo10`）→ `streak`
  - 克服（`rpg-overcome-10/-50`）→ `overcome`
- `rpg-cards` はガチャでも数が増える。でも、どの国も「同じ国に5回のゲームで正解」で必ず仲間になるので、ガチャなしでも195に届く。ガチャは早く届くだけなので、運をほめるバッジにはならず、残してよい。
- **入れないもの:**
  - `rpg-gold`（はじめての★3）: ガチャの運をほめることになる
  - 地域の仲間コンプ `rpg-region-{id}` の6つ: 数を抑えるため。`rpg-cards` と `reg-*` の金で足りる

### 2.8 数の確認

| | バッジ | ステップ | 称号 |
|---|---|---|---|
| 冒険なし | 26 | 66 | 66 |
| 冒険あり | 38 | 86 | 86 |

- 段の内訳（冒険あり）: **銅 30 / 銀 30 / 金 24 / 虹 2**（`micro` を銀にしたため）。
- 称号はすべて10文字以内で、重ならない（いまの一覧で確認済み。単体テストでも確かめる）。

---

## 3. 判定のしくみ

### 3.1 カタログの書き方（badges.js の中）

```js
// makeCatalog(C) がカタログを作る（vm のテストでも countries.js だけで作れるように、C を引数でもらう）
// v(s, x) はいまの値を返す。x = { pools: {asia: [...a], …, world: [...]}, micro: [...a], snap: RPG.snapshot() か null, rpg: !!window.RPG }
const T = (goal, title, extra) => ({ goal, title, ...extra });
const CATALOG = [
  { id: 'answers', cat: 'quiz', icon: '📚', name: 'こつこつ正解', unit: '問',
    desc: n => `正解の合計が ${n.toLocaleString('ja-JP')}問`,
    v: s => s.right, tiers: [T(100, 'こつこつ派'), T(1000, '努力の人'), T(5000, 'ドリルの鬼')] },
  { id: 'ta-speed', cat: 'kind', icon: '⚡', name: 'スピードスター', lower: true,   // lower は「バッジ」に書く（小さいほどよい。これだけ）
    desc: ms => `タイムアタック10問以上を1問 ${(ms / 1000).toFixed(1)}秒以内でクリア`,
    v: s => s.taAvg, tiers: [T(3000, 'せっかち名人'), T(2000, 'スピードスター'), T(1400, '光速の目')] },
  { id: 'overcome', cat: 'quiz', icon: '💪', name: '苦手克服', unit: 'か国',
    v: (s, x) => Math.max(Object.keys(s.ov).length, snapOvercome(x.snap)), tiers: [/* 1 / 10 / 50 */] },
  // 地域は段ごとに v がちがうので、段のほうに v を書く
  ...REGION_IDS.map(rk => ({ id: 'reg-' + rk, cat: 'region', …, tiers: [
    T(1, …, { v: s => (s.rc[rk] & 1) ? 1 : 0, desc: () => `${label}で10問以上のゲームをクリア` }),
    T(1, …, { v: s => (s.rc[rk] & 2) ? 1 : 0, desc: () => `${label}の「全部」をヒントなしでクリア` }),
    T(pools[rk].length * 4, …, { v: (s, x) => x.pools[rk].reduce((t, a) => t + pop4(s.m[a]), 0),
      desc: () => `${label}の国すべてを4モードで正解`, color: rk === 'world' ? 4 : 3 }),
  ] })),
  …
];
// snapOvercome: snap.overcome が数ならその値、オブジェクトならキーの数、snap.st.overcome、の最大。どれもなければ 0
```

- 段の色は、ふつう `[1, 2, 3]`（銅・銀・金）。1段だけのバッジと `reg-world` の金は `color` で上書きする（4 = 虹）。
- 冒険のバッジには `rpg: true` を付ける。`window.RPG` がないときは、一覧にも数にも判定にも入れない（`visible(x)`）。
- ひみつのバッジには `secret: true` と `hint` を付ける。

### 3.2 取れたかどうか

```js
const valOf = (b, t, s, x) => (t.v || b.v)(s, x);
const reached = (b, t, v) => b.lower ? (v > 0 && v <= t.goal) : v >= t.goal;   // lower は b（バッジ）から読む
const visible = x => CATALOG.filter(b => !b.rpg || x.rpg);
function evaluate(d, x) {                  // 純粋な関数。d.got にまだないステップのうち、条件に届いたものを返す
  const out = [];
  for (const b of visible(x)) b.tiers.forEach((t, i) => {
    const key = `${b.id}@${i + 1}`;
    if (!d.got[key] && reached(b, t, valOf(b, t, d.s, x))) out.push(key);
  });
  return out;                              // 下の段が取れていなくても上の段は取れる（銅 → 金の順に並ぶ）
}
```

- `evaluate` は `commit()`（§7）の中だけで呼ぶ。呼ぶのは次のときだけ。
  - **`drill:result` のあと**
  - **統計が変わる `rpg:*` のあと**（クイズ中でないとき。§3.3）
  - **`drill:book-open` で新しい国を開いたあと**
  - **起動時**
- `drill:answer`・`rpg:answer`・`pagehide`・`storage` では判定しない。
- 1回の判定は、約30個 × 3段の小さい関数なので 1ms 未満。
- **入れ子を防ぐ:**
  - `commit()` は判定中フラグを持ち、入れ子で呼ばれたら何もしない
  - `badge:earned` は、`got` を保存したあとで `commit()` の外からまとめて出す
  - rpg.js が支払いのあとに出す `rpg:coins {reason:'badge'}` では判定しない

### 3.3 記録の更新（イベント → op → `apply`）

イベントを受け取ったら、メモリの `ops` に操作（op）を1つ積む。`commit()` が「localStorage から読んだデータ」に `ops` を順番に重ねてから書く（§7）。`apply(d, op, X)` は純粋な関数なので、単体テストでは op の列をそのまま流せる。

```js
let run = null;          // クイズ中なら { sid }。drill:start で作り、drill:result で捨てる（保留の判定に使う）
let battle = false;      // バトル画面にいる
let screen = 'home', lastPull = 0;
const doneSids = [];     // 処理した drill:result の sid（直近20件）

on('drill:start', d => { run = { sid: d.sid }; });
on('drill:answer', d => {                          // 軽く！ op を1つ積むだけ。保存・判定・DOM はしない
  ops.push(['ans', d.a, !!d.right, !!d.first, !!d.hint, d.mode, d.missesBefore | 0, d.missesAfter | 0]);
});
on('drill:result', d => {
  if (doneSids.includes(d.sid)) return;             // 同じゲームの結果は1回だけ数える
  doneSids.push(d.sid); if (doneSids.length > 20) doneSids.shift();
  run = null;
  ops.push(['res', pick(d, 'outcome kind region mode n wrongs attempts best timeMs hint'), !!S.dopa, today()]);
  deliver(commit(), { result: d });
});
on('drill:book-open', d => {
  if (!byA.has(d.a) || st.s.bk[d.a]) return;
  ops.push(['book', d.a]); deliver(commit());
});
on('drill:misses-reset', () => { ops.push(['wk-reset']); commit(); });   // 苦手の印だけ消す。克服・バッジは消さない
on('drill:screen', d => {
  const was = screen; screen = d.name;
  if (d.name === 'battle') battle = true; else if (was === 'battle') battle = false;
  if (d.name === 'home') renderHome();
  flush();                                          // 保留していたお知らせ（バトル・ガチャを離れた）
});
// 冒険
for (const t of ['coins', 'levelup', 'join', 'promote', 'answer', 'battle', 'clear', 'overcome', 'bounty']) on('rpg:' + t, d => {
  if (t === 'coins' && d.reason !== 'start') return;            // バッジのごほうびなどでは判定しない
  ops.push(['rpg', t, pickRpg(t, d, screen), today()]);          // promote は learn: d.via ? d.via === 'learn' : (d.star === 2 && screen !== 'gacha')
  if (t === 'battle') battle = false;
  if (t === 'answer' || run) return;                             // バトルの1問ごと・クイズ中は積むだけ（drill:result でまとめて判定）
  deliver(commit());
});
on('rpg:pull', () => { lastPull = Date.now(); });                // ガチャの演出中は保留（§5.1）
```

**`apply(d, op, X)` がすること**（`s = d.s`。国コードと地域キーは `X` の表で確かめ、知らないものは捨てる）

| op | すること |
|---|---|
| `ans`（クイズの回答） | 正解なら `s.right++`。不正解なら `s.wk[a] = 1` で終わり。ヒントありなら、ここで終わり。ヒントなしの正解なら `s.m[a] \|= MODE_BIT[mode]`（`f2n` 1、`n2f` 2、`m2f` 4、`f2m` 8）。さらに **一発正解**（`first`）なら、`(mb > 0 \|\| s.wk[a]) && ma === 0` のとき `s.ov[a] = 1`。そのあと `delete s.wk[a]` |
| `res`（ゲームの結果） | 下のコード |
| `book` | `s.bk[a] = 1` |
| `wk-reset` | `s.wk = {}` |
| `rpg coins`（start） | `s.rpg.start = 1` |
| `rpg answer` | 正解なら `s.right++`。モードが `f2n` `n2f` `m2f` ならビットを立てる（バトルはヒントなし）。不正解なら `s.wk[a] = 1`（外すのは `rpg:overcome` か、クイズの一発正解） |
| `rpg battle` | `addDay(s, day)`。`s.streak = max(s.streak, maxCombo)`。`win` なら `s.rpg.win = 1`。`boss && win && mistakes === 0` なら `nodmg = 1`。`boss && win && lv <= recLv - 5` なら `under = 1`。`revived && win` なら `phoenix = 1` |
| `rpg levelup` | `s.rpg.lv = max(…, lv)` |
| `rpg clear` | `dungeon` が7つの id のどれかなら `s.rpg.boss` に足す（重ねない） |
| `rpg join` | `via === 'learn'` なら `friend = 1`。`s.rpg.owned = max(…, owned)` |
| `rpg promote` | `learn` なら `master = 1` |
| `rpg overcome` | `s.ov[a] = 1`、`delete s.wk[a]`（クイズでの克服と重なっても、1か国1回） |
| `rpg bounty` | `s.rpg.bounty = max(…, totalDays)` |
| `got` / `sent` / `eq` / `seen` / `tip` | §7（取ったステップ・払い済み・称号・NEW・ヒントの注意） |

```js
function applyResult(s, r, dopa, day, X) {    // r = drill:result の detail（必要なキーだけ）
  const rk = X.rkOf(r.region);
  if (!r.hint) { s.streak = Math.max(s.streak, r.best | 0); if (dopa && r.best >= 20) s.fever = 1; }  // quit・fail もふくむ
  if (r.outcome === 'clear' || r.outcome === 'fail') addDay(s, day);
  if (r.kind === 'challenge' && !r.hint && r.n >= 10 && rk) {          // 七転び八起き
    const ck = `${r.mode}:${rk}:${r.n}`;
    if (r.outcome === 'clear' && r.attempts === 1 && s.cf.includes(ck)) s.grit = 1;   // 先に判定してから
    if (r.wrongs > 0) s.cf = [...s.cf.filter(k => k !== ck), ck].slice(-30);          // つまずいた条件を覚える
  }
  if (r.outcome !== 'clear') return;               // ここから下はクリアだけ
  s.clears++;
  if (dopa) s.dopa = 1;
  if (rk) { if (r.n >= 10) s.rc[rk] |= 1; if (!r.hint && r.n === X.poolSize(rk)) s.rc[rk] |= 2; }
  if (r.hint) return;
  if (r.kind === 'practice' && r.wrongs === 0) s.perf = Math.max(s.perf, r.n);
  if (r.kind === 'challenge' && r.attempts === 1) s.flaw = Math.max(s.flaw, r.n);
  if (r.kind === 'ta') {
    s.ta = Math.max(s.ta, r.n);
    if (r.n >= 10 && r.timeMs > 0) { const avg = Math.round(r.timeMs / r.n); s.taAvg = s.taAvg ? Math.min(s.taAvg, avg) : avg; }
  }
}
function addDay(s, day) {                         // day は 'YYYY-MM-DD'（イベントの時点の日付を op に入れておく）
  if (!s.last) { s.days = 1; s.last = day; return; }
  const diff = dayNum(day) - dayNum(s.last);
  if (diff <= 0) return;                          // 同じ日、または日付が戻った
  if (diff >= 14) s.back = 1;
  s.days++; s.last = day;
}
```

**数え方の決まり**（v1 の「quit は何も数えない」は取り消す）

- **1問ごとの記録**（正解数・モードのビット・克服・苦手の印）は、ゲームの結果に関係なく数える。途中でやめても、学んだことは学んだこととして数える。
- **最高連続（`best`）とフィーバー**は、`clear` `fail` `quit` のどれでも数える（ヒントなしのときだけ）。
- **ゲーム単位の記録**（クリア数・地域・ノーミス・一発クリア・TA・ドパガキ）は `clear` のときだけ数える。`chal-grit` の「つまずいた条件」は `quit` でも覚える。
- **日数**は `clear` と `fail` のとき。`quit` では数えない。
- タイムアタックは、いつもヒントなし。失格（`fail`）で数えるのは、日数と最高連続だけ。
- 冒険の値は、`s.rpg` に覚えた値と `RPG.snapshot()` の値の**大きいほう**で判定する（`lv` `owned` `bountyDays`、`floors` から数えたボスの数、`overcome`）。

### 3.4 さかのぼり（すでに遊んでいる人）

- badges.js が入る前の記録は、`misses` と冒険のデータしかない。クイズの正解の記録はないので、**クイズのバッジはさかのぼらない**（ここから数える）。ただし `misses` が残っている国は「苦手な国」なので、克服は前の記録からでも数えられる。
- 冒険は `RPG.snapshot()` からさかのぼる。対象は `rpg-start` `rpg-first-win` `rpg-lv` `rpg-boss` `rpg-final` `rpg-cards` `rpg-bounty`、それと `overcome`（snapshot の克服の数）。
- 起動時の判定（`commit()` の初回）で取れたものは、1つずつトーストにしない。かわりに **1回だけ**「これまでの記録から バッジを3個もらったよ！ ［見る］」と出す。称号は `eq === null`（まだ選んでいない）のときだけ、取ったなかでいちばん上の段の称号をつける。
- 起動時の判定は、アップデートでバッジが増えたときにも働く。前回、閉じる前に保存だけした記録（§7 の `pagehide`）もここで判定する。どちらも同じまとめトーストになる。

---

## 4. 称号

- **つけられるのは1つだけ。** 取ったステップの称号ならどれでもつけられる（低い段の称号に戻してもいい）。
- `eq` は3通り。
  - `null` = まだ一度も選んでいない
  - `''` = 「称号をつけない」を選んだ
  - ステップのキー = その称号をつけている
- **自動でつける:** `eq === null` のときに初めてバッジを取ると、その称号を自動でつけて「称号〈ドリルの新人〉をつけたよ」と知らせる。
  - 一度でも自分で選んだ（`''` もふくむ）あとは、自動では変えない
  - 2個目からは、トーストの［つける］かバッジ画面で変える
- **表示する場所:**
  - **ホーム:** メニューの一番上の行に小さい札 `〈アジア博士〉`（§6.1）。押すと称号えらびを開く。
  - **冒険の旅人カード:** rpg.js が `window.BADGES?.title?.()` を読む。返すのは**かっこなしの文字列**（`'アジア博士'`）。つけていなければ `''`。かっこ 〈〉 は表示する側が付ける。
  - **バッジ画面:** 上のまとめ欄。
- 称号を変えたら `badge:title {key, title}` を出す。rpg.js はこれで旅人カードを描き直す。外したときは `{key: null, title: ''}`。
  - いまつけている称号をもう一度選んだとき（称号えらびで同じものを押した・古いトーストの［つける］）は何もしない。op も積まず、`badge:title` も出し直さない。
- `eq` がいまのカタログにないキー（新しい版で増えたバッジなど）のときは、`title()` は `''` を返す。`eq` 自体は消さない。
- トップバーやランキングのニックネームには出さない（§11）。

---

## 5. お知らせと演出

### 5.1 いつ出すか（保留のルール）

取ったステップは `deliver()` でいったん `pending` に入れ、次の表に従って外に出す。

| いまの状態 | どうする |
|---|---|
| クイズ中（`run` がある。`drill:start` から `drill:result` まで） | 出さない。`drill:result` で出す |
| バトル中（`drill:screen {name:'battle'}` から `rpg:battle` まで） | 出さない。`rpg:battle` が来たとき、またはバトル画面を離れたときに出す |
| ガチャの演出中（`screen === 'gacha'` で、最後の `rpg:pull` から3秒以内。reduced motion なら1秒） | 出さない。3秒後か、ガチャ画面を離れたときに出す |
| `#detail` ダイアログが開いている（図鑑の詳細など） | 出さない（モーダルの下に隠れるため）。ダイアログの `close` イベントで出す |
| それ以外 | すぐ出す |

- 実際には、クイズやバトルの中で取れるバッジは終わったときにしか判定しない。だから保留が効くのは、おもに次のとき。
  - `rpg:levelup`（冒険ホーム）
  - `drill:book-open`（ダイアログ）
  - ガチャ
  - rpg.js が結果のあとに少し遅れて出すイベント

### 5.2 結果画面のパネル（`drill:result` が `clear` のとき）

- `showResult()` は、`#rcard` を書いてから `endGame('clear')` → `show('result')` の順に呼ぶ（RPG §10.2 H7）。だから `drill:result` を受け取った時点で、結果画面の DOM はもうある。
- 置く場所:
  - `$('r-side')` があればその中、なければ `$('rcard')` の中に置く
  - その中に `#r-ext` があれば **その直前**、なければボタンの行（`.row.center`）の直前に、`<div class="bdg-result" id="r-badges" data-sid="…">` を差し込む
  - `#r-ext` は rpg.js が `innerHTML` で書きかえるので、その中には入れない
- **あとから足す:** 結果画面を表示中で、`#r-badges` の `data-sid` がいまの結果と同じなら、あとから取れたステップ（rpg.js が少し遅れて出すイベントの分）は、トーストにせずこのパネルに足す。

```
┌─────────────────────────────────┐
│ 🏅 バッジを手に入れたよ！           │
│ (🐼) アジア大陸横断  銀      ●+50  │
│      称号〈アジア通〉   [つける]     │
│ (✨) ノーミス練習  銅        ●+50  │
│ ほか2個                [バッジを見る]│
└─────────────────────────────────┘
```

- 4個まで並べ、それより多ければ「ほか◯個」とまとめる。
- `●+50` は、rpg.js が `e.detail.paid` に書いた数（§8.3）があるときだけ出す。
- パネルに出したものは、トーストにしない。
- **ヒントの注意:** ヒントありでクリアしたときは、パネルの下に1行出す。
  - 文:「国名ヒントありのときは、ノーミス・モード・地域の銀と金などのバッジは進まないよ」
  - 出すのは `tip < 3` のときだけ。出したら `tip` を増やす op を積む
  - バッジが取れていなくても、この1行だけのパネルを出す
- `fail`（タイムアタック失格）と `quit` には結果画面がないので、トーストで出す（§5.3）。
- **［つける］を押したら:** パネルの行を描き直す（押した行は「つけてる中」、自動でつけた行も「をつけたよ」をやめて［つける］）。押したボタンが消えてフォーカスが `<body>` に落ちるので、つけた行の「つけてる中」（`tabindex="-1"`）にフォーカスを移す。
- **PC で［もう一回］を画面の外に出さない**（はみ出したら pc.css ではなく badges.css で詰める。スマホ〜899px は変えない）:
  - 背の低い PC（`(min-width: 900px) and (max-height: 760px)`）: パネルを詰める。
    - 1行を［つける］の高さ（44px）に収める。メダルは 32px で2行ぶん、名前と称号は左に2段、コインと［つける］・「つけてる中」は右で2段ぶんを使う。
    - パネルは4列の grid、行は `grid-template-columns: subgrid`（コインの位置が行でずれない）。見出し・「ほか◯個」・ヒントの注意は全幅。すきまは 6px。
  - ≥1280 の背の低い PC: pc.css は結果の grid を上下まん中にし、`#r-side` は2行ぶんを使う。だから `#r-side` が高いほど、左の点数と［もう一回］も下がる。
    - まちがえた国が **5か国以上**（`.misslist > li:nth-child(5)` がある）でパネルもあるときだけ、左の列も `#r-side` も上にそろえる（`grid-template-rows: auto 1fr; align-content: start`）。1280×577 では、上下まん中のままだと8か国から［もう一回］が外に出る。
    - 4か国までは上下まん中のまま（1280×577 の4か国で［もう一回］は y 430〜480 ほど）。
  - 900〜1279 の PC（高さは問わない）: pc.css の `#rcard` は縦1列（点数 → まちがえた国 → ボタンの行）で、パネルが入ると［もう一回］が外に出る（1024×600 では1か国でも、1024×768 でも）。
    - パネルがあるときだけ、`#r-side` に `order: 1` を付けて、ボタンの行を点数のすぐ下（まちがえた国とパネルの上）に出す。
    - Tab の順も見た目の順にする（`#rcard` に `reading-flow: flex-visual`。効かないブラウザは HTML の順のまま）。［もう一回］の次はまちがえた国とパネル、前は［モード選択へ］。

### 5.3 トースト

- index.html の共通の `toast(html, ms)` を使う（RPG §10.2 H2）。中身は badges.js が作り、表示時間は 4.5秒。
- 一度に出す枚数:
  - PC は3枚まで（400ms ずつずらして出す）
  - スマホ（〜599px）は2枚まで
  - それより多いときは「ほか◯個のバッジもゲット！ ［見る］」の1枚にまとめる
  - 起動時のまとめ（§3.4）の1枚も、この枚数に数える。ステップに使えるのは残りの枚数（最低1枚）で、それより多ければ残り−1枚と「ほか◯個」。たとえば起動時にまとめとステップ3個が同じ回に出るときは、PC はまとめ・1枚・「ほか2個」、スマホはまとめ・「ほか3個」

```
┌───────────────────────────────┐
│ (📖)  バッジゲット！  図鑑めくり 銅    │
│       称号〈図鑑好き〉  ●+50  [つける] │
└───────────────────────────────┘
```

- トーストの中身は innerHTML なので、クリックは `document` でまとめて受ける。
  - ［つける］には `data-bdg-equip="book@1"`、［見る］には `data-bdg-open` を付ける。キーは `got` にあるかを確かめてから使う
  - トーストの中身を `<div data-bdg-toast>` で包む。ボタン以外の場所をタップしたら、そのトーストをすぐ消す（上に出るので、下のボタンを押せるようにするため）
  - ボタンは高さ 44px 以上
- **トーストの位置**（`toast()` を足すときの共通 CSS。index.html の H2 といっしょに入れる。RPG のトーストも同じ場所に出る）:

```css
/* スマホは上（下には［次へ］・選択肢・失格のときの［もう一回］があるため）。PC は右上で、トップバーの［図鑑］［設定］の下 */
#toasts { position: fixed; z-index: 50; left: 50%; top: calc(12px + env(safe-area-inset-top)); transform: translateX(-50%);
  display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); pointer-events: none; }
.toast { pointer-events: auto; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 12px;
  padding: 10px 14px; box-shadow: 0 6px 20px rgb(0 0 0 / .15); }
@media (min-width: 900px) { #toasts { left: auto; right: 16px; top: 72px; transform: none; } }
```

### 5.4 ドパガキと reduced motion

| | ドパガキ OFF（初期設定） | ドパガキ ON |
|---|---|---|
| トースト | すっと出る（200ms） | 上に加えて、メダルが1回転してきらっと光り、`FX.sfx('correct', 8)` を鳴らす。金・虹なら `FX.confetti(トーストの位置, 60)` |
| 結果パネル | ふわっと出る（200ms） | 上に加えて、メダルがきらっと光る。結果のファンファーレの 700ms あとに `FX.sfx('correct', 10)` と `FX.confetti(rect, 80)`。`rect` は、パネルが画面内に見えていればパネルの位置、見えていなければ `null`（画面の中央） |
| バッジ画面の金・虹のメダル | 止まっている | 枠の上をゆっくり光が流れる |
| 称号をつけた | 札の文字が変わるだけ | 上に加えて `FX.pop('称号チェンジ！', 'small')` |

- `S.dopa` は覚えておかず、毎回読む。音は ON のときだけ鳴らす（音の ON/OFF は `FX` が守る）。
- **reduced motion:**
  - badges.css のアニメは、全部 `@media (prefers-reduced-motion: no-preference)` の中に書く。
  - JS は `matchMedia('(prefers-reduced-motion: reduce)').matches` が真なら、`FX.confetti` `FX.flash` `FX.pop` を呼ばない（FX は自分では確かめないため）。音はそのまま鳴らす。
  - トーストとパネルは、動かずにその場に出す。

---

## 6. 画面

### 6.1 ホーム（badges.js が差し込む。index.html の HTML は変えない）

- **称号の札:** `.home .menu` の1つ目の子として、次の要素を差し込む。何もつけていなければ差し込まない。
  - `<div class="bdg-titlerow"><button class="bdg-titlechip" id="home-title">〈アジア博士〉</button></div>`
  - `.bdg-titlerow { width: 100%; display: flex; justify-content: center; }` にする。
    - 縦並びのメニュー（スマホ、pc.css の ≥1280）では、ただの1行目になる。
    - 横並びのメニュー（いまの main の ≥900）では、幅100%なので自分だけの行になる。ボタンの列にはまざらない。
  - pc.css の2列ヒーロー（≥1280。`body[data-screen]` があるとき）では左寄せにする: `@media (min-width: 1280px) { body[data-screen] .bdg-titlerow { justify-content: flex-start; } }`。
- **バッジのボタン:** `#home-settings` の **直前** に `<button class="btn ghost" id="home-badges">バッジ <small class="mono">12/38</small></button>` を入れる。
  - 新しいバッジがあれば、右上に小さい点を付ける（`aria-label="新しいバッジあり"`）。
  - 並び: プレイ / 冒険 / ランキング / **バッジ** / 設定（5つ）。
- **横並びのときにはみ出さない:** いまの main は ≥900 で `.home .menu { flex-direction: row }`、`.btn { min-width: 200px }` なので、5つで 1,040px になる。そこで badges.css に `@media (min-width: 900px) { .home .menu { flex-wrap: wrap; justify-content: center; max-width: 100%; } }` を入れる。
  - 900px の幅では4つと1つの2行になり、横スクロールは出ない。
  - 縦並び（スマホ、pc.css の ≥1280）には影響しない。
- 描き直すとき:
  - 起動時（最初の `show('home')` は badges.js を読む前に終わっているため）
  - `drill:screen {name:'home'}` のたび
  - `storage` イベントのあと

```
スマホ（〜899px）        PC 900〜1279（pc.css なし）               PC ≥1280（pc.css あり）
┌──────────────────┐   ┌─────────────────────────────────┐   ┌───────────────────────────────────┐
│  FLAGS·NAMES·MAP │   │        FLAGS · NAMES · MAP       │   │ FLAGS · NAMES · MAP  ┌旗┬旗┬旗┬旗┐ │
│   195か国         │   │          195か国ドリル            │   │ 195か国              │          │ │
│   ドリル          │   │   [旗][旗][旗][旗][旗][旗][旗]…    │   │ ドリル               │ 国旗 6×5  │ │
│  [旗][旗][旗]…    │   │          〈アジア博士〉           │   │ 〈アジア博士〉        │          │ │
│   〈アジア博士〉   │   │ [プレイ][冒険][ランキング][バッジ•] │   │ [ プレイ        ]     │          │ │
│ [   プレイ    ]   │   │             [設定]               │   │ [ 冒険          ]     │          │ │
│ [   冒険      ]   │   │          国旗図鑑を見る           │   │ [ ランキング    ]     │          │ │
│ [  ランキング  ]  │   └─────────────────────────────────┘   │ [ バッジ 12/38 •]     │          │ │
│ [ バッジ 12/38•]  │                                          │ [ 設定          ]     └──────────┘ │
│ [   設定      ]   │                                          │ 国旗図鑑を見る                      │
└──────────────────┘                                          └───────────────────────────────────┘
```

### 6.2 バッジ画面（`scr-badges`、一覧画面）

- badges.js が `<section id="scr-badges" class="wrap" hidden>` を `#scr-book` の後ろに作り、**そのあとで** `registerScreen('badges', renderBadges)` を呼ぶ（順番を逆にしない）。
- 直リンク `#badges`: 登録のあとで `location.hash === '#badges'` なら `show('badges')`。
- 中身:
  1. **まとめ欄:**
     - つけている称号（大きめの札）と［称号をかえる］
     - 「38個中 12個」
     - 段ごとの数（銅 8・銀 3・金 1・虹 0）
     - **もうすぐ取れそう**: ひみつ以外で、まだ取っていない次の段のうち、進み具合が50%以上のものを上位3つ（例「📖 図鑑めくり 銀 あと8か国」）。`ta-speed` の進み具合は `goal / いまの値`。
  2. **分類のチップ:** すべて / クイズ / あそび方 / モード / 地域 / 図鑑・毎日 / ドパガキ / 冒険（冒険は rpg.js があるときだけ）。
     - 選んだものは `store.set('bdgcat', …)` で覚える。
     - スマホでは横スクロールにする（`overflow-x: auto; overscroll-behavior-x: contain; min-width: 0`）。はみ出しても、ページ全体は横スクロールしない。
  3. **タイル:** 分類の見出しごとに並べる。「すべて」のときは見出しつきで全部、1つを選んだらその分類だけ。
  4. 下に［ホームへ］。
- **タイル（`<button>`）:**
  - **メダル:** 丸、56px。中に絵文字。
    - 縁の色は、取った一番上の段の色。
    - まだ取っていなければグレーにし、絵文字も `grayscale(1)` で薄くする。
  - **名前**（2行まで）と**段の点** `●●○`（色と形の両方で見せる。取った段は塗りつぶす）。モードのバッジは、名前の下に小さく「国旗→国名」と出す。
  - **進み具合:** 次の段へのバーと数字（`34 / 100`）。
    - `ta-speed` は「2.43→2.0秒」。まだ記録がなければ「記録なし」。
    - `goal === 1` の段（地域の銅・銀など、できたかどうかだけの段）は `0 / 1` にせず、「まだ」（届いていれば「達成」）。
    - 全部取ったら「コンプリート！」。
  - **ひみつのバッジ:** 取るまでは名前が「？？？」、メダルに「？」で、バーは出さない。
  - **NEW:** 新しく取った段があれば `NEW` を付ける。詳細を開くと消える（`sn` を更新）。
  - `aria-label` の例:「アジア大陸横断。銀まで取った。次の金はアジアの国すべてを4モードで正解、いま 98 / 184」。`goal === 1` の段は「いま」を付けず「…クリア、まだ」
- **タイルを押すと** 既存の `<dialog id="detail">` に詳細を出す（§6.3）。
- **ホームへの数**: `count()` は、いま見えているカタログ（`visible(x)`）のバッジだけで数える。知らないステップや、rpg.js がないときの冒険のステップは数に入れない。

**スマホ（〜899px）**
```
┌──────────────────────────────┐
│ 195か国ドリル          図鑑 設定 │
├──────────────────────────────┤
│ バッジ            38個中 12個   │
│ 〈アジア博士〉   [称号をかえる]  │
│ 銅 8 · 銀 3 · 金 1 · 虹 0       │
│ もうすぐ: 📖 図鑑めくり 銀 あと8 │
├──────────────────────────────┤
│ (すべて)(クイズ)(あそび方)(モード)→│  ← チップの行だけが横スクロール
├──────────────────────────────┤
│ クイズ                          │
│ ┌────┐ ┌────┐ ┌────┐            │
│ │(🌱)│ │(📚)│ │(🔗)│            │  repeat(auto-fill, minmax(104px, 1fr))
│ │はじめ│ │こつこ│ │れんぞ│            │  → 360〜390px で3列、320px で2列
│ │ ●   │ │●●○ │ │●○○ │            │
│ │コンプ│ │▓▓░ │ │▓░░ │            │
│ └────┘ └────┘ └────┘            │
│ …                              │
│            [ホームへ]            │
└──────────────────────────────┘
```

**PC（画面いっぱいに使う）**
- 900px 以上: `#scr-badges.wrap { max-width: none; width: 100%; padding-inline: clamp(16px, 3vw, 48px); }`。いまの `.wrap` の 1200px の上限を外し、pc.css がなくても画面いっぱいに使う。
- 900〜1279:
  - まとめ欄を上に横長で置く
  - タイルは `repeat(auto-fill, minmax(150px, 1fr))`
  - 分類のチップの行は `position: sticky; top: 8px`（図鑑の検索行と同じ半透明のカード）
- ≥1280: 2列。
  - 左にまとめ欄（幅 `clamp(280px, 24vw, 380px)`、`position: sticky; top: 16px`）
  - 右にチップとタイル（`repeat(auto-fill, minmax(clamp(150px, 11vw, 200px), 1fr))`）
  - 1行の幅には上限を付けず、画面の幅いっぱいに並べる
```
┌──────────────────────────────────────────────────────────────────────┐
│ 195か国ドリル                                               図鑑 設定 │
├───────────────────┬──────────────────────────────────────────────────┤
│ バッジ  38個中 12個 │ (すべて)(クイズ)(あそび方)(モード)(地域)(図鑑・毎日)(冒険) │
│ 〈アジア博士〉      │ クイズ                                              │
│ [称号をかえる]      │ (🌱)(📚)(🔗)(💪)(🔬)                                │
│ 銅8 銀3 金1 虹0     │ あそび方                                            │
│ ─────────────    │ (✨)(🎯)(？)(⏱️)(⚡)                                 │
│ もうすぐ取れそう     │ モード                                              │
│ 📖 図鑑めくり 銀 8   │ (🚩)(🔍)(🗺️)(📍)                                   │
│ 🚩 旗ソムリエ 銀 12  │ 地域                                                │
│ 最近とったバッジ     │ (🦙)(🐚)(🌵)(🏰)(🐼)(🦁)(🌏)                      │
│ 10/25 🐼 アジア 銀   │ …                                                  │
│ [ホームへ]          │                                                    │
└───────────────────┴──────────────────────────────────────────────────┘
```
- pc.css の `.pc-split` `.pc-tiles` には頼らない。badges.css に自分のクラス（`.bdg-split` `.bdg-tiles`）で書く。pc.css の変数を使うときは `var(--col-gap, 16px)` のように予備の値を付ける。

### 6.3 詳細ダイアログ（`#detail` を使い回す）

```
┌───────────────────────────────┐
│                         [閉じる] │
│        (🐼)  アジア大陸横断       │
│        地域のバッジ               │
│ 銅  アジアで10問以上クリア   ✓ 10/12 │
│     称号〈アジアの旅人〉  [つける]  │
│ 銀  アジアの「全部」をヒントなしで  │
│     クリア                ✓ 10/20 │
│     称号〈アジア通〉     つけてる中 │
│ 金  アジアの国すべてを4モードで正解  │
│     ▓▓▓▓▓░░░ 98 / 184           │
│     称号〈アジア博士〉 （取ると使える）│
│ ※ 国名ヒントありの正解は数えないよ  │
│ [シェア]                [練習する →] │
└───────────────────────────────┘
```

- 中身は `#detail-inner` に書き、`$('detail').showModal()` で開く。
  - ［閉じる］は図鑑と同じ `.close` のボタン。
  - 外側をタップして閉じる処理は index.html の `$('detail').onclick` にすでにある。上書きしないよう、badges.js は `addEventListener` だけを使う。
- 各段に出すもの: 条件、取った日（`10/12` のような月/日）、称号、［つける］。まだ取っていない段は進み具合（§6.2 と同じ文。`goal === 1` なら「まだ」「達成」）。
- ［つける］を押したらダイアログを描き直し、フォーカスはつけた段の「つけてる中」（`tabindex="-1"`）に移す（見つからなければ［閉じる］）。
- うまさのバッジ（ヒントなしが条件のもの）には「※ 国名ヒントありの正解は数えないよ」を出す。
- ひみつのバッジは、取るまでヒントだけを出す。
- 開いたら `['seen', id, Date.now()]` を積み、NEW を消す。
- **［練習する →］**（地域とモードのバッジだけ）:
  - `S.region` や `P.mode` をそのバッジに合わせて `store.set` し、`show('setup')` する。
  - 地域のバッジで、次の段が銀（「全部」）なら `P.count = 'all'` にもする。
  - 次の段が銅（「10問以上」）で、`P.count` が10より少ない数なら `P.count = 10` にする（取れるいちばん少ない数。どの地域も10か国以上ある）。20 や `'all'` はそのまま。
  - モードのバッジは問題数を変えない。
  - `P.name`（国名ヒント）は勝手に変えない（上の注意書きで知らせる）。
- **［シェア］**（1段以上取ったものだけ）:
  - `navigator.share` があればそれを使う。なければクリップボードにコピーする。
  - コピーできたとき、`#detail` が開いていれば、押した［シェア］の文字を2秒だけ「コピー済み」にする（トーストはモーダルの `#detail` の下に隠れるため）。もう一度押したら2秒を数え直す。
    - ボタンの中に「シェア」と「コピー済み」を同じマスに重ねて置き、見せるのはどちらか1つ（`visibility: hidden`。読み上げの名前も見えている文字になる）。幅は初めから長いほうに合わせてあるので、文字が変わってもボタンの幅は変わらない。
    - ［シェア］と［練習する →］の左右の余白は 14px。320px でも2つが1行に入り、「コピー済み」の間も［練習する →］は次の行に落ちない。
  - コピーが終わる前にダイアログを閉じていたら、「コピーしたよ」のトーストを2秒出す。
  - 文:「195か国ドリルでバッジ『アジア大陸横断（銀）』を取ったよ！ 称号〈アジア通〉 https://chikokunn1011.github.io/country-drill/」
- **称号えらび**（［称号をかえる］やホームの札から）:
  - 同じダイアログに、取った称号を段の色ごとに並べたボタンの一覧と、「称号をつけない」を出す。
  - 選んだら `['eq', key か '']` を積んで `commit()` し、`badge:title` を出す。
  - 一覧は86個まで増えるので、ダイアログの中でスクロールさせる。

---

## 7. セーブデータ

- localStorage のキーは **`badges`**。
- `store.get` は壊れた JSON を黙って既定値にするので使わない。RPG と同じく、文字列を直接読む（try/catch で包む）。

```js
// localStorage['badges']
{
  v: 1,
  got: { 'answers@1': 1798200000000 },   // 取ったステップ → 取った時刻(ms)。知らないステップも消さない
  eq: null,                // null = まだ選んでいない（自動でつけてよい） / '' = 「つけない」を選んだ / 'reg-asia@3'
  sn: { book: 1798200000000 },   // バッジごとに、最後に詳細を開いた時刻。got の時刻がこれより新しい段があれば NEW
  sent: ['answers@1'],     // rpg.js に badge:earned を出して受け取ってもらったステップ
  tip: 0,                  // 「ヒントありは数えない」の注意を出した回数（0..3）
  s: {
    right: 0,              // 正解の合計（クイズ＋バトル、ヒントありもふくむ）
    streak: 0,             // 最高連続（ヒントなしの1ゲームの best / 1バトルの maxCombo）
    m: {},                 // { cl: 0..15 } ヒントなしで正解したモードのビット: 1 f2n, 2 n2f, 4 m2f, 8 f2m
    ov: {},                // { ki: 1 } 克服した国
    wk: {},                // { ki: 1 } 苦手の印（まちがえたら付き、ヒントなしの一発正解で外れる）
    bk: {},                // { cl: 1 } 図鑑で開いた国
    rc: {},                // { asia: 0..3 } 1 = 10問以上クリア, 2 = 全部をヒントなしでクリア（world もふくむ）
    perf: 0, flaw: 0,      // ノーミス練習 / 一発クリア の最大問題数
    cf: [],                // つまずいた挑戦の条件 'f2n:asia:20'（最大30件）
    grit: 0,               // 七転び八起き 達成
    ta: 0, taAvg: 0,       // タイムアタッククリアの最大問題数 / 10問以上での1問あたり最速 ms（0 = 記録なし）
    clears: 0,             // クリアしたゲームの数
    days: 0, last: '', back: 0,   // 遊んだ日の通算・最後に遊んだ日 'YYYY-MM-DD'・おかえり達成
    dopa: 0, fever: 0,     // ドパガキ ON でクリア / ドパガキ ON で best 20
    rpg: { start: 0, win: 0, nodmg: 0, under: 0, phoenix: 0, friend: 0, master: 0, lv: 0, owned: 0, bounty: 0, boss: [] }
  }
}
```

- 全部そろっても大きさは約8KB。

### 7.1 読み書き（`tx` と op）

```js
let base = fresh();      // 最後に読めた（または書けた）データ
let ops = [];            // まだ書けていない操作（イベントの順）
let st = base;           // 表示用 = base に ops を重ねたもの
let ro = false, inCommit = false;

function readBase() {    // { d, ro }。localStorage が使えなければ null
  let raw;
  try { raw = localStorage.getItem('badges'); } catch { return null; }
  if (raw == null) return { d: fresh(), ro: false };
  let obj;
  try { obj = JSON.parse(raw); } catch { backup(raw); return { d: fresh(), ro: false }; }   // 'badges-broken' に1件だけ上書きで退避
  return migrate(obj);                                                                   // v > VERSION なら ro: true
}
function commit({ judge = true } = {}) {   // 読む → ops を重ねる → 判定 → 書く。drill:answer からは呼ばない
  if (inCommit) return [];
  inCommit = true;
  try {
    const r = readBase();
    if (r) { base = r.d; ro = r.ro; }
    const d = clone(base);
    for (const op of ops) apply(d, op, X);
    if (ro) { st = d; return []; }                     // 新しい版のセーブ: 書かない・取らない・払わない
    let fresh = [];
    if (judge) {
      fresh = evaluate(d, ctx());
      const now = Date.now();
      for (const k of fresh) { const op = ['got', k, now]; apply(d, op, X); ops.push(op); }   // 取ったことも op にする
      if (fresh.length && d.eq === null) { const op = ['eq', best(fresh)]; apply(d, op, X); ops.push(op); }
    }
    if (write(d) || !r) { base = d; ops = []; }        // 書けた、または localStorage が使えない（メモリだけで続ける）
    st = d;                                            // 書けなかったとき（容量など）は ops を残し、次の commit でもう一度
    return fresh;
  } finally { inCommit = false; }
}
```

- **取ったステップも op（`got`）として積む。** 書けなかったときに次の `commit` で同じバッジをもう一度判定して、2回お知らせしないため。
- **`push(op)` は、表示用の `st` に当ててから `ops` に積む。** 当てて例外になる op は積まない（積むと次の `commit` でも同じ op で落ち続け、保存できなくなるため）。
- **タブを2つ開いたとき:** `commit` は毎回 localStorage をその場で読み、自分の `ops` を重ねて書く。だから、もう片方のタブの正解数や取ったバッジを消さない。`addDay` は op に入れた日付と保存されている `last` を比べるので、同じ日を2回数えない。
- `storage` イベントで `badges` が変わったとき: `base` を読み直し、`st = base + ops` にして、バッジ画面とホームを描き直す。判定はしない。
- **書くタイミング:**
  - `drill:result`、統計が変わる `rpg:*`（クイズ中でないとき）、`drill:book-open`（新しい国）、称号の変更、詳細を開いた（`seen`）、`sent` が増えたとき
  - `pagehide` と `visibilitychange`（hidden）で `ops` が残っているとき。このときは `commit({ judge: false })` で保存だけする。判定はそのあとの判定（次に判定するイベントか、次の起動時）で行い、そこで知らせる。`visibilitychange` ではページが残るので、戻ってきたあとの次のイベントで判定することもある
  - **`drill:answer` では書かない**
- **移行:** RPG と同じ形にする。
  - `VERSION = 1`、`MIGRATE[v]`
  - `v > VERSION` なら **readOnly**: 書き込まず、判定も払い出しもしない。表示だけ。`console.warn` を1回出す
  - `fresh()` の上に重ねる `sanitize`:
    - 数値は整数にし、範囲内におさめる（`right` 0..1e7、`streak` 0..999、`perf` `flaw` `ta` 0..195、`taAvg` 0..600000、`days` 0..1e5、`rpg.lv` 0..50、`rpg.owned` 0..195、`rpg.bounty` 0..1e5、時刻は 0..1e13）
    - `m` `ov` `wk` `bk` は、知らない国コードを捨てる。`m` の値は 0..15
    - `rc` は、知らない地域を捨てる。`rpg.boss` は、知らないダンジョン id を捨てる
    - `cf` は `/^(f2n|n2f|m2f|f2m):[a-z]+:\d{1,3}$/` に合うものだけを、最大30件残す
    - `got` `sent` `sn` `eq` は、**知らないステップやバッジも残す**（新しい版で増えたバッジを、古い版が消さないため）。ただし形（キーの正規表現）に合わないものは捨て、`got` と `sent` は最大500件にする
    - `eq` は `null`、`''`、キーの形の文字列のどれか。それ以外なら `null` にする
    - 壊れた JSON は `badges-broken` に写してから新しく始める（1件だけで、上書き）。トーストは出さない（バッジは取り直せるため）
- **localStorage が使えないとき**（例外を投げる、プライベートモードなど）: メモリの中だけでバッジを数え、表示する。クイズはそのまま動く。
- 記録を消すボタンは作らない。消せるのはデバッグ用の `BADGES.debug.reset()` だけ。

---

## 8. イベントの約束

### 8.1 受け取るイベント（index.html → badges.js）

| イベント | detail（RPG §10.3 と同じ） | 使うキー |
|---|---|---|
| `drill:start` | `{sid, mode, kind, region, n, hint}` | `sid` |
| `drill:answer` | `{sid, a, right, first, missesBefore, missesAfter, mode, kind, region, hint, streak}` | `a right first missesBefore missesAfter mode hint` |
| `drill:result` | `{sid, outcome, mode, kind, region, n, done, firstTry, wrongs, attempts, best, timeMs, hint, missed}` | `sid outcome mode kind region n wrongs attempts best timeMs hint` |
| `drill:screen` | `{name}` | `name` |
| `drill:book-open` | `{a}` | `a` |
| `drill:misses-reset` | `{}` | 苦手の印 `wk` だけを消す |

- `best` は `G.best`。1回のゲームで、挑戦のやり直しもまたいだ最高連続正解。
- `region` は `S.region` の値そのもの（`'all'` か日本語の地域名）。badges.js が `asia` などのキーに直す。
- `drill:result` が「全部」だったかは `n === その地域の国の数` で判断する（`P.count` はイベントに入っていないため）。

### 8.2 受け取るイベント（rpg.js / rpg-battle.js → badges.js）

| イベント | detail | 使うキー |
|---|---|---|
| `rpg:coins` | `{delta, reason, coins, earned}` | `reason === 'start'` のときだけ |
| `rpg:levelup` | `{lv, from}`（v2） | `lv` |
| `rpg:join` | `{a, via, owned}` | `via owned` |
| `rpg:promote` | `{a, star, via}`（v2） | `star via`（`via` がなければ §2.7 の代わりの判定） |
| `rpg:answer` | `{a, right, mode, dungeon, boss}` | `a right mode` |
| `rpg:battle` | `{dungeon, floor, boss, win, first, mistakes, revived, gauge, maxCombo, lv, recLv}` | `boss win mistakes revived maxCombo lv recLv` |
| `rpg:clear` | `{dungeon}` | `dungeon` |
| `rpg:overcome` | `{a, total}` | `a` |
| `rpg:bounty` | `{a, doneAll, totalDays}` | `totalDays` |
| `rpg:pull` | | 時刻だけを使う（ガチャの演出中の保留） |
| `rpg:ready` `rpg:share` | | 使わない |

- `rpg:ready` は rpg.js を読み込んだときに1回だけ出る。あとから読み込む badges.js には届かないので、起動時は `RPG.snapshot()` を同期で読む。
- 同期で読むもの: `window.RPG.snapshot()` → `{lv, owned, ownedByStar, ownedByRegion, floors, cleared, earned, st, overcome, bountyDays}`（お願いした `intro` も）。
  - try/catch の中で読む。どのキーもないかもしれないので、`?.` と `?? 0` で読む。例外・`null`・キー欠けでも落ちないようにする。
  - ボスを倒したかは **`floors[id] >= 5`** で判定する（`cleared` の形に頼らない）。

### 8.3 出すイベント（badges.js → rpg.js ほか）

| イベント | detail | いつ |
|---|---|---|
| `badge:earned` | `{id, badge, tier, title, color, retro}`。rpg.js が同期で `paid` を書き足す | ステップを取ったとき。**`window.RPG` があるときだけ** 出す |
| `badge:title` | `{key, title}` | つける称号が変わったとき（外したときは `{key: null, title: ''}`） |

- **`id` はステップのキー（`'reg-asia@2'`）。** rpg.js は `id` で `badgesPaid` を見て、二重払いを防ぐ。
  - 段ごとに ●+50 が払われる（最大 86 × 50 = ●4,300。地図喰いまでのダンジョン初クリアの合計 ●6,230 と比べて、経済を壊さない量）。
  - `badge`（`'reg-asia'`）、`tier`（2）、`color`（1〜4）は足したキー（RPG §10.1「detail のキーは足すだけ」に沿う）。
- **払った確認:** `const ev = new CustomEvent('badge:earned', {detail}); document.dispatchEvent(ev);` のあと、`ev.detail.paid` を見る。
  - 数（例 `50`）なら、パネルやトーストに `●+50` を出し、`['sent', id]` を積む。
  - `false`（rpg.js が readOnly などで払えなかった）なら `sent` に入れない。次の起動で送り直す。
  - `undefined`（古い rpg.js）なら、払ったものとみなして `sent` に入れ、`●+50` は出さない。
- **`retro: true`** を付けるのは2つのとき。
  - 起動時のさかのぼり
  - rpg.js があとから入ったときの払い残し: 起動時に、`got` にあって `sent` にない、見えているステップを全部 `retro: true` で出す（`window.RPG` があるときだけ）
  - 冒険データを消しても `sent` は残るので、二度払いにはならない。
- 読み込みの順番は **rpg.js → rpg-battle.js → badges.js**。だから badges.js の起動時には、もう rpg.js がリスナーを付けている。

### 8.4 RPG 設計とのずれと、rpg.js へのお願い

| # | 内容 | rpg.js がやらなかったとき |
|---|---|---|
| 1 | `badge:earned` は、`retro` でもそうでなくても**トーストを出さずに払う**（コインのチップだけ更新する）。そして `e.detail.paid` に、払った額（`50`）か、払えなかったら `false` を同期で書く。●+50 はバッジ側のパネルとトーストに出す。`retro` のときは、まとめて1回だけ「バッジのごほうび ●+150」と出してよい | 結果画面でコインのトーストがパネルと重なる。払えなかった分が取りこぼされる |
| 2 | `rpg:promote` の `via`（v2 で入った） | `star === 2` で、いまの画面が `gacha` でなければ、覚えて昇格したとみなす |
| 3 | `RPG.snapshot()` に `intro` を足す | `lv > 1 \|\| st.win + st.lose + st.flee > 0` で代わりに判定 |
| 4 | `rpg:battle` の `maxCombo` は「そのバトルで続けて正解した数の最大」（ダメージの式の「この問題の前の数」ではない）と `docs/events.md` に書く | 1つずれる（害は小さい） |
| 5 | §12 の表を次のように変える。`rpg-boss-{地域}`×6 → `rpg-boss`（1/3/6）。`rpg-lv10/30/50` → `rpg-lv` の3段。`rpg-cards-50/100/195` → `rpg-cards` の3段。`rpg-overcome-*` → `overcome`。`rpg-combo10` → `streak`。`rpg-silver` → `rpg-master`。`rpg-learn-join` → `rpg-friend`。`rpg-bounty-30` → `rpg-bounty` の3段。`rpg-gold` と `rpg-region-{id}` は作らない。地域ごとの「◯◯の勇者」の称号はなくなる（`rpg-boss` の3段の称号になる。冒険ホームの見本の〈南米の勇者〉も直す） | — |
| 6 | 旅人カードの称号は `window.BADGES?.title?.()`（かっこなし）に〈〉を付けて出し、`badge:title` が来たら描き直す | — |
| 7 | rpg.js はクイズ中（`drill:answer` の処理の中）に `rpg:overcome` などを出してもよい。バッジ側はクイズ中は積むだけにし、`drill:result` でまとめて判定する（取り決め） | — |

---

## 9. ファイルと index.html のフック

### 9.1 ファイル（名前はすべて半角英数字）

| ファイル | 中身 | 目安 |
|---|---|---|
| `badges.js` | 即時関数で包む。中身: `makeCatalog`、`apply`（op）、`evaluate`、セーブ（`readBase` `commit` `migrate` `sanitize`）、イベントの受け取り、保留とお知らせ（トースト・結果パネル）、ホームの差し込み、バッジ画面、詳細・称号えらび、`window.BADGES` | 約500行（うちカタログ約130行） |
| `badges.css` | `.bdg-` で始まるクラス。段の色のトークンを `:root`、`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`、`:root[data-theme="dark"]` の3か所に書く（`--bdg-t1` #b0793f、`--bdg-t2` #9aa5ad、`--bdg-t3` #d9a520、`--bdg-t4` は虹で `conic-gradient`）。PC 用は `@media (min-width: 900px)` と `(min-width: 1280px)` の中に書く（§6.1 の `.home .menu` の折り返し、§6.2 の全幅をふくむ）。アニメは `prefers-reduced-motion: no-preference` の中だけ | 約190行 |
| `tests/unit/badges.test.mjs`、`tests/e2e/badges.test.mjs` | §10 | |
| `docs/events.md` | RPG と共有する。書き足すのは、`badge:earned` の足したキー・`retro`・`paid`、`badge:title` の detail、`maxCombo` の意味 | |

**必ず守ること**
- **即時関数で包む。** 一番外側で `const` を書くと、index.html の名前（`S` `P` `G` `C` `$` `store` `emit` …）とぶつかり、ファイルごと読み込まれない。
- **起動時のチェック:** 使うグローバル（`C byA REGIONS flag esc fmt $ store S P FX show registerScreen emit toast`）を `typeof` で確かめる。足りなければ `console.error('[badges] …')` を出し、ホームのボタンも画面も作らない。クイズはそのまま動く。
- **`<section>` を作ってから `registerScreen` を呼ぶ。**
- **リスナーの中の例外は外に出ない**（CustomEvent なので）。それでも `drill:answer` と `drill:result` は try/catch で包み、例外が出ても `run` と `doneSids` が壊れないようにする。
- `misses` は index.html の `let` なので、参照を取っておかない（バッジは `missesBefore/After` だけを使い、`misses` そのものは読まない）。
- **テストのため:** `document` がない環境（node の vm）では、純粋な部分（`makeCatalog` `apply` `evaluate` `migrate` `sanitize` `reached` `addDay`）だけを `window.BADGES_CORE` に置いて終わる。国のデータは countries.js の `window.COUNTRIES` を引数で渡す。

### 9.2 index.html の変更

- **RPG と共通のフック H1〜H9**（RPG 設計 §10.2）。バッジが先に入るなら、バッジの担当がそのまま足す。そのとき H9 の図鑑は次のとおりにする。
  ```js
  // 一覧のカード（$('grid').onclick の showModal の直後）
  emit('drill:book-open', { a: c.a });
  // 地図（selectBook の最後）。検索で1件にしぼったときの自動選択（tapped=false）では出さない
  if (c && tapped) emit('drill:book-open', { a });
  ```
- H2 の `toast()` を足すときは、§5.3 の CSS（上に出す版）もいっしょに足す。
- **バッジのための行はこの2行だけ:**
  ```html
  <!-- head の style の後（rpg.css の後） -->
  <link rel="stylesheet" href="badges.css?v=1">
  <!-- rpg-battle.js の後（RPG がなければ本体のインライン script の後） -->
  <script src="badges.js?v=1"></script>
  ```
- index.html に**足さないもの:** バッジのボタン、称号の札、`<section id="scr-badges">`、結果パネル。どれも badges.js が差し込む（badges.js を読み込めなくても、ボタンが出ないだけですむ）。
- フックとファイルは同じコミットで公開し、`?v=` を上げる。

### 9.3 `window.BADGES`

| 関数 | 返すもの |
|---|---|
| `title()` | つけている称号の文字列（かっこなし）。なければ `''` |
| `titleKey()` | `'reg-asia@3'` か `null` |
| `count()` | `{got, total, byColor: {1, 2, 3, 4}}`。数えるのはステップではなくバッジ（1段でも取ったバッジ）で、**見えているカタログだけ**を数える |
| `list()` | 表示用の一覧 `[{id, name, icon, cat, tiers:[{key, got, title, goal, val}] }]` |
| `open(id?)` | バッジ画面を開く（id があれば、その詳細も開く） |
| `debug` | `?bdgdebug=1` のときだけ使える。`grant(key)`、`set(field, value)`（`st.s` の数か文字の値を、同じ種類の値のときだけ op で書きかえる。オブジェクトや配列の欄は書きかえない。E2E 用）、`reset()`、`dump()` |

---

## 10. テスト

**単体（`tests/unit/badges.test.mjs`。node:test と vm で、ranking.test.mjs と同じやり方）**
- **カタログ:**
  - id とステップのキーが半角英数字
  - 称号が全部ちがい、10文字以内
  - バッジの数（冒険なし26 / あり38）とステップの数（66 / 86）
  - 段の内訳（銅30 / 銀30 / 金24 / 虹2）
- **届くこと:** すべてのステップに、そこまで届く op の列がある（op を流して `evaluate` すると取れる）。
- **しきい値:** ちょうどで取れて、1つ手前では取れない。
  - `answers` 99/100
  - `ta-speed` は 2001ms で銀が取れず、2000ms で取れる。1401ms では金が取れず、1400ms で取れる。3500ms と 0（記録なし）では何も取れない
- **ヒント:** `hint: true` のゲームでは、`prac-perfect` `chal-flawless` `chal-grit` `mode-*` `reg-*@2` `streak` `overcome` `dopa-fever` が増えない。
- **同じゲームの結果が2回来ても、** クリア数・`rc`・`perf` を2回数えない。
- **`quit` と `fail`:**
  - `quit` は、1問ごとの記録と最高連続だけを数える（クリア・日数は数えない）
  - `fail` は、日数と最高連続だけを数える
- **克服:**
  - 練習で「まちがえる → 同じゲームでやり直して正解」では数えない
  - 次のゲームでのヒントなし一発正解で数える
  - `misses` が2のときは、1回目の一発正解では数えない
  - 同じ国は1回だけ。`rpg:overcome` と重なっても1回
  - `wk-reset` のあとも `ov` は残る
- **七転び八起き:**
  - 同じゲームでは取れない
  - つまずいた条件と同じ条件の、あとのゲームで `attempts === 1` なら取れる
  - 条件がちがう（問題数がちがう）と取れない
  - `cf` は30件まで
- **日付:** 同じ日は1回。14日あけると `comeback`、13日では取れない。日付が前に戻ったら数えない（`Date` を差し替えて確かめる）。
- **セーブ:**
  - 壊れた JSON → 退避先は `badges-broken` の1件
  - `v: 2` → readOnly（書かない・取らない）
  - 知らない国コードは捨て、知らないステップは残す
  - `setItem` が例外を投げたあとに次の `commit` をしても、同じバッジを2回返さない
  - タブ2つ: base を途中で書きかえても、両方の正解数が足される
  - `eq` が `''` なら自動でつけない
- **`badge:earned`:**
  - `window.RPG` がないときは出さず、`sent` も増えない
  - あとで RPG が来たら、`retro: true` で1回だけ出す
  - `paid === false` なら `sent` に入らず、次の起動で送り直す
- **入れ子:** `badge:earned` のリスナーの中で `rpg:coins` や `rpg:levelup` を出しても、同じステップを2回取らない。
- **冒険:** `snapshot()` が例外・`null`・キー欠けでも落ちない。`snapshot().overcome` が数でもオブジェクトでも読める。

**E2E（`tests/e2e/badges.test.mjs`。既存の Playwright の helpers を使う）**
- 390×844: 練習10問をクリアすると、結果画面に「はじめの一歩」のパネルが出る。クイズ中はトーストが出ていない。
- 称号を自動でつけると、ホームの札が〈ドリルの新人〉になる。冒険の旅人カードにも出る（RPG があるとき）。
- 図鑑で10か国を開くと、ダイアログを閉じてからトーストが出る。
- タイムアタックで失格すると、結果画面がないのでトーストで出る。
  - 準備: `BADGES.debug` で `right` を99にしておき、失格の前の1問の正解で `answers` の銅が取れるようにする
  - 390×844 で、トーストの箱が `#next` や `.row.end` のボタンに重ならない
- **タイムアタックの計測:** `drill:answer` のリスナーの時間を `performance.now()` で計り、1回 0.2ms 未満。
- **バッジ画面:** 390×844（3列）、1024×768、1440×900（2列でまとめ欄が sticky）、1920×1080（タイルが画面の幅いっぱいに並ぶ）。どれも横スクロールなし。
- **ホーム:** 900×700 と 1024×768 で、5つのボタン（冒険・ランキングをふくむ）と称号の札があっても横スクロールなし。札は自分の行にある。
- ダーク、ドパガキ ON/OFF、`reducedMotion: 'reduce'` でアニメが動かない（`getAnimations().length === 0`）。
- `localStorage` が使えない（例外を投げる）ときも、クイズが動き、バッジも画面に出る。
- タブを2つ開いても、両方で取ったバッジと正解数が残る。
- **結果画面のパネルと［もう一回］:**
  - 1366×657・1280×577 で、パネル（4行と「ほか」）とまちがえた国（4か国・10か国）が並んでも、［もう一回］がスクロールなしで押せる。4か国と 1536×730 の1か国は上下まん中のまま、10か国は上にそろえる。［つける］は 44px 以上
  - 1024×600・1279×700・1024×768 で、まちがえた国が1か国でも10か国でも、ボタンの行が点数のすぐ下にあり、［もう一回］がスクロールなしで押せる。Tab の順も見た目の順
- **シェア:** 320×640 で、［シェア］が「コピー済み」になっている間も［練習する →］が次の行に落ちない（ボタンの位置と大きさ、ダイアログの高さが変わらない）。
- **練習ボタン:** 次のステップが「10問以上」なのに問題数が5のときは、［練習する →］で問題数が10になる（`practice_button_count`）。
- **ゴールが1のタイル:** 地域の銅・銀は `0 / 1` ではなく「まだ」「達成」と出る（`goal_one_progress` `goal_one_reached`）。
- **起動時のまとめトースト:** 枚数の上限に数える（1280 と 390 で、起動直後のトーストが上限を超えない。`startup_summary_counts_toward_cap_*`）。
- **［つける］のあと:** フォーカスが `<body>` に落ちず、同じ称号をつけなおしても `badge:title` を2回出さない（`equip_focus_no_reemit`）。

---

## 11. やらないこと

**ずっとやらない**
- ガチャの運・引いた回数・使ったコイン・課金をほめるバッジ。期間限定や季節のバッジ、なくなるバッジ
- 連続ログインのバッジ（来なかった日に罰が出るもの）。日数は通算だけで数える
- バッジや称号を Supabase に送ること、バッジのランキング
- **まちがえることを狙わせるバッジ**（「100回まちがえた」「◯回やり直した」など）

**今回は作らない（あとで足す候補）**
1. 称号をランキングのニックネームの横に出す（Supabase の列が増えるため）
2. トップバー（`#topbar-extra`）に称号を出す（スマホで混むため。いまはホームと旅人カードだけ）
3. 国ごとのバッジ（195個）、バッジのメダルの画像・音声ファイル
4. 自分で称号を作る・組み合わせる（「アジア」＋「博士」）
5. 設定の「バッジのお知らせを出さない」スイッチ、バッジの記録を消すボタン
6. 引き継ぎコード（RPG の `CQ1.`）にバッジを入れる。入れるなら `badges` キーをそのまま足す形にする
7. 時間帯のバッジ（夜ふかし・早起き。子どもの夜ふかしをすすめないため）

---

## 12. 危ないところと対策

| 危ないところ | なにが起きる | 対策 |
|---|---|---|
| タイムアタックの計測 | リスナーが重いとタイムがのびる | `drill:answer` は op を積むだけ。クイズ中は `rpg:*` も積むだけ。判定・保存・DOM は `drill:result` のあと |
| お知らせがボタンにかぶる | 誤タップ、TA の妨げ | クイズ中・バトル中・ガチャの演出中・ダイアログ中は保留する（§5.1）。スマホは上、PC は右上に出す。タップで消える |
| ドパガキの演出が重なる | 結果画面で紙吹雪が2回 | 結果のファンファーレの 700ms あとにずらし、数を少なめにする |
| 二重払い・二重取得 | ●が増えすぎる | 3つで防ぐ: バッジ側の `got`（op で書く）と `sent`（`paid` の確認つき）、RPG 側の `badgesPaid`。ほかに、`doneSids` で同じゲームを2回数えない、判定中フラグで入れ子にしない |
| タブ2つ・書けない | 記録が消える、同じお知らせが2回 | `commit` で毎回読んで op を重ねる。取ったことも op にする |
| ヒントで簡単に取れる | バッジの価値が下がる | うまさのバッジは `hint: false` だけ。注意書きで知らせる |
| わざとまちがえる | まちがえることを狙う遊び方になる | 克服と七転び八起きは「別のゲームで取り返す」ことが条件。同じゲームでは取れない |
| GitHub Pages のキャッシュ | 古い badges.js が新しいセーブを読む | `?v=` を付ける。`v > VERSION` は readOnly にし、取らない・払わない |
| RPG とのずれ | `via` `intro` がない、`cleared` の形がちがう | §8.4 の代わりの判定を使う。ボスは `floors` で見る。`docs/events.md` を先に合わせる |
| PC のホーム | ボタンが5つで横にはみ出す | 札は自分の行にする。≥900 の `.home .menu` は折り返す |
| iOS Safari の7日ルール | localStorage が消える | 取り直せるので、さかのぼりはしない。引き継ぎコードは §11-6 |

---

## 13. 作る順番（段階ごとに別の AI が作り、別の AI がチェックする）

| 段階 | 作るもの | チェックすること |
|---|---|---|
| 1 | badges.js のコア: `makeCatalog`、`apply`（op）、`evaluate`、`readBase` / `commit` / `migrate` / `sanitize`、`BADGES_CORE`。単体テスト | 単体テストが全部通る。カタログの数と、称号の重なり。ta-speed の向き。同じゲームでの克服・七転び八起きが取れない |
| 2 | フック H1〜H9（まだなければ）、`<script>` と `<link>`、トースト（上に出す CSS）、結果パネル、保留のルール | TA のタイムが変わらない（リスナーの時間を計る）。クイズ中にトーストが出ない。失格のトーストがボタンにかぶらない |
| 3 | バッジ画面、詳細、称号えらび、ホームの札とボタン（スマホと PC） | 390 / 900 / 1024 / 1440 / 1920 の幅でスクショ。横スクロールなし。ダーク |
| 4 | 冒険との連携（`rpg:*`、`snapshot`、`badge:earned` の払いと `paid`、`retro`） | RPG なし・あり・あとから入る、の3通り。払えなかったら送り直す |
| 5 | 仕上げ: ドパガキと reduced motion の演出、シェア、［練習する →］、ヒントの注意、E2E | §10 の E2E が全部通る |

## 14. チコに決めてほしいこと（決まるまではこの値で進める）

1. **スピードスターの秒数**（3.0 / 2.0 / 1.4 秒/問）でいい？ 実際のタイムアタックの記録を見て調整したい。
2. **バッジのコイン**は段ごとに ●50（最大 ●4,300）でいい？ 1バッジ1回だけにするなら、rpg.js が `badge` のキーで重なりを見る。
3. **ひみつのバッジ**は3つ（七転び八起き・おかえり・フィーバータイム）でいい？ もっと増やす？
4. 「おかえり」は **14日** あけたら、でいい？
5. 「七転び八起き」の新しい条件（挑戦でつまずいた条件を、あとで1回目にクリア）でいい？
