# 195か国ドリル

国旗・国名・地図の位置を4択クイズで、首都は図鑑で覚える学習サイト。

- 対象: 国連加盟193か国＋バチカン・コソボ（195か国）
- クイズ: 国旗→国名 / 国名→国旗 / 場所→国旗 / 国旗→場所。タイムアタック（1ミスで失格、クリアタイムでランキングに挑戦）もある
- 図鑑: 国旗一覧・検索・首都かくしモード

## ランキング（Supabase）

タイムアタックの記録は Supabase に保存する（接続先は `ranking.js` の先頭）。

- 準備: Supabase の SQL Editor に `supabase/schema.sql` を貼って実行する（何度流しても大丈夫）
- 記録の消し方: Table Editor で `scores` テーブルを開き、消したい行を削除する
- 冒険ランキング（レベル順・クリアしたダンジョン順）は `rpg_players` テーブル（1人1行）。はじめて載せるときに端末で合言葉を作り（DB にはハッシュだけ）、localStorage の `rpgRank` に覚える。登録は1回だけで、あとは名前だけ変えられる。レベルアップ・バトルの勝ち・起動時に自動で送り直す（11秒あける）。ほかの人と同じニックネームは使えない。消し方は Table Editor で `rpg_players` の行を削除（`rpg-rank.js`、冒険ホームの［🏆 冒険ランキング］）
- テスト: 初回だけ `cd tests/e2e && npm install`。そのあとリポジトリ直下で `node --test 'tests/unit/*.test.mjs' 'tests/e2e/*.test.mjs'`（Playwright と Chromium が必要）と `bash tests/sql/run.sh`（PostgreSQL 16 が必要）
- PC の見た目: `pc.css`（900px 以上でだけ読み込む）。スマホ幅の見た目は index.html のインライン CSS
- PC レイアウトのテスト: `node --test tests/e2e/pc_layout.test.mjs` で PC の大きさ（1024×768・1366×657・1366×768・1920×1080）の収まりを見る
- スマホの見た目が変わっていないかのテスト: `GEOM_BASE=<コミット>` を付けると、スマホ幅（390×844・899×900）の全要素の位置をそのコミットと比べる（`phone_geometry_unchanged`。付けないときは飛ばす）
  - `<コミット>` には、いまの作業を始める前のコミットを書く（例: ブランチの分かれ目。まだコミットしていない変更なら `HEAD`）
  - `GEOM_BASE=auto` は使わない。PC レイアウトを入れる前のコミットを選ぶので、そのあと冒険・バッジでわざと変えたスマホの見た目がみな差になり、いまは必ず落ちる
  - スマホの見た目をわざと変えたときは差が出る。出た場面がその変更のものだけかを確かめて、次からはそのコミットを `GEOM_BASE` にする
    （例: バッジ × 国旗クエストの統合の始まり `7304e2d` と比べると、クイズ中の場面（`#pcoin` を進み具合と同じ行に入れた）と、仲間の一覧・ガチャの結果（カードの国名の折り返し）だけに差が出る）
- PC の確認用スクショ: `node tests/e2e/pc_shots.mjs --out <フォルダ>` でスクショと測定の表を出す（`--viewport 1280x577,2560x1300` `--scenes home,result` `--dopa` `--dark` `--no-shot` も使える）

## 冒険（国旗クエスト）

クイズでコインを稼いで、旅人のレベルアップ・国旗ガチャ（仲間のカード）・ダンジョンのバトルに使う RPG（`rpg-core.js` `rpg.js` `rpg-cards.js` `rpg-battle.js` `rpg-rank.js` `rpg.css`。設定の「冒険（コイン・RPG）を表示する」で隠せる）。

- ファイルの分け方: `rpg-core.js` は計算だけ（DOM を触らない）、`rpg.js` はセーブ・クイズのコイン・冒険ホーム、`rpg-cards.js` は国旗ガチャ（国旗パックのサムネイルと引く演出をふくむ）・仲間の一覧・仲間の世界地図・シェア・演出、`rpg-battle.js` はバトル、`rpg-rank.js` は冒険ランキング。この順に読み込み、ファイルどうしは `window.RPG` でつながる
- データはこの端末の localStorage（キー `rpg`）にだけ保存する。別の端末へは冒険ホームの「データ（引き継ぎコード）」のコードで移す
- 開発用パネル（コインを足す・Lv を変える・フロアを開く）は URL に `?rpgdebug=1` を付けると冒険ホームに出る
- ガチャは全世界が 1回 ●100・10回 ●1,000。地域をしぼると `TUNING.gacha.regionMul`（1.5倍）。引く演出の長さは `TUNING.gacha.showMs`
- 値段・確率・強さなどの数値は全部 `rpg-core.js` の `TUNING` にある（ペースは `tests/unit/rpg-balance.test.mjs` で確かめる）

## バッジ・称号

クイズと冒険の記録でバッジを取り、称号をつけられる（`badges.js` `badges.css`。ホームの［バッジ］と称号の札、結果画面のパネル、トースト）。

- 記録はこの端末の localStorage（キー `badges`）にだけ保存する。バッジを取ると冒険のコイン（●+50）を rpg.js がはらう
- 冒険（rpg.js）が無くても動く（冒険のバッジは出ない）。読み込みの順番とイベントの約束は `docs/events.md`
- 開発用（`BADGES.debug` で記録を書きかえる）は URL に `?bdgdebug=1` を付けると使える

## 豆知識

クイズで正解したときに1つ（その国で前に出した文はなるべく避ける）、図鑑の国の説明に全部出す、国ごとの豆知識（国旗・地理・文化。195か国・779件）。

- 元データは `data/trivia_facts.json`（`{a: 国コード, k: flag / geo / culture, t: 文, note: 確かめた出典のメモ}` の配列）。`trivia.js`（`window.TRIVIA`）はここから作るので、手で書きかえない
- 直したら `python3 tools/make_trivia.py` で `trivia.js` を作り直す（だめな項目が1つでもあれば書かずに止まる。`note` は入れない）
- `node --test tests/unit/trivia.test.mjs` で、全部の国にあるか・作り直すと同じになるかを確かめる
- `trivia.js` が読めないときや形がおかしいときは、豆知識を出さないだけでクイズと図鑑はそのまま動く

## クレジット

- 国旗: [flag-icons](https://github.com/lipis/flag-icons)（MIT）
- 地図: [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth, ISC）
- 国データ: [world-countries](https://github.com/mledoze/countries)（ODbL）

## テクスチャ

`textures/` に地図帳風のテクスチャ（SVG）を置いている。

- `paper.svg` … 紙の繊維。画面全体に薄く敷く（CSS マスクで色をテーマに合わせる）
- `contour.svg` … 等高線。ホームの背景
- `ocean-light.svg` / `ocean-dark.svg` … 銅版画風の海の波線。地図の海
