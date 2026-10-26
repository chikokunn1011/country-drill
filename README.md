# 195か国ドリル

国旗・国名・地図の位置を4択クイズで、首都は図鑑で覚える学習サイト。

- 対象: 国連加盟193か国＋バチカン・コソボ（195か国）
- クイズ: 国旗→国名 / 国名→国旗 / 場所→国旗 / 国旗→場所。タイムアタック（1ミスで失格、クリアタイムでランキングに挑戦）もある
- 図鑑: 国旗一覧・検索・首都かくしモード

## ランキング（Supabase）

タイムアタックの記録は Supabase に保存する（接続先は `ranking.js` の先頭）。

- 準備: Supabase の SQL Editor に `supabase/schema.sql` を貼って実行する（何度流しても大丈夫）
- 記録の消し方: Table Editor で `scores` テーブルを開き、消したい行を削除する
- テスト: 初回だけ `cd tests/e2e && npm install`。そのあとリポジトリ直下で `node --test 'tests/unit/*.test.mjs' 'tests/e2e/*.test.mjs'`（Playwright と Chromium が必要）と `bash tests/sql/run.sh`（PostgreSQL 16 が必要）
- PC の見た目: `pc.css`（900px 以上でだけ読み込む）。スマホ幅の見た目は index.html のインライン CSS
- PC レイアウトのテスト: `node --test tests/e2e/pc_layout.test.mjs` で PC の大きさ（1024×768・1366×657・1366×768・1920×1080）の収まりを見る。`GEOM_BASE=auto` を付けると、スマホ幅の全要素の位置を PC レイアウトを入れる前のコミットと比べる（スマホの見た目をわざと変えたあとは使わない）
- PC の確認用スクショ: `node tests/e2e/pc_shots.mjs --out <フォルダ>` でスクショと測定の表を出す（`--viewport 1280x577,2560x1300` `--scenes home,result` `--dopa` `--dark` `--no-shot` も使える）

## 冒険（国旗クエスト）

クイズでコインを稼いで、旅人のレベルアップ・国旗ガチャ（仲間のカード）・ダンジョンのバトルに使う RPG（`rpg-core.js` `rpg.js` `rpg-battle.js` `rpg.css`。設定の「冒険（コイン・RPG）を表示する」で隠せる）。

- データはこの端末の localStorage（キー `rpg`）にだけ保存する。別の端末へは冒険ホームの「データ（引き継ぎコード）」のコードで移す
- 開発用パネル（コインを足す・Lv を変える・フロアを開く）は URL に `?rpgdebug=1` を付けると冒険ホームに出る
- 値段・確率・強さなどの数値は全部 `rpg-core.js` の `TUNING` にある（ペースは `tests/unit/rpg-balance.test.mjs` で確かめる）

## バッジ・称号

クイズと冒険の記録でバッジを取り、称号をつけられる（`badges.js` `badges.css`。ホームの［バッジ］と称号の札、結果画面のパネル、トースト）。

- 記録はこの端末の localStorage（キー `badges`）にだけ保存する。バッジを取ると冒険のコイン（●+50）を rpg.js がはらう
- 冒険（rpg.js）が無くても動く（冒険のバッジは出ない）。読み込みの順番とイベントの約束は `docs/events.md`
- 開発用（`BADGES.debug` で記録を書きかえる）は URL に `?bdgdebug=1` を付けると使える

## クレジット

- 国旗: [flag-icons](https://github.com/lipis/flag-icons)（MIT）
- 地図: [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth, ISC）
- 国データ: [world-countries](https://github.com/mledoze/countries)（ODbL）

## テクスチャ

`textures/` に地図帳風のテクスチャ（SVG）を置いている。

- `paper.svg` … 紙の繊維。画面全体に薄く敷く（CSS マスクで色をテーマに合わせる）
- `contour.svg` … 等高線。ホームの背景
- `ocean-light.svg` / `ocean-dark.svg` … 銅版画風の海の波線。地図の海
