# 国旗マスター

国旗・国名・地図の位置を4択クイズで、首都は図鑑で覚える学習サイト。

（URL とリポジトリ名は `country-drill` のまま。旧名は「195か国ドリル」）

- 対象: 国連加盟193か国＋バチカン・コソボ（195か国）
- クイズ: 国旗→国名 / 国名→国旗 / 場所→国旗 / 国旗→場所。タイムアタック（1ミスで失格、クリアタイムでランキングに挑戦）もある
- 図鑑: 国旗一覧・検索・首都かくしモード
- 見やすさ: 設定で文字の大きさ（ふつう・大きめ・とても大きい）と色の見分けやすさ（正解は青・まちがいはオレンジ）を変えられる（`settings.fs`・`settings.cvd` → `<html data-fs>`・`<html data-cvd>`）。正解✓・まちがい✗の印はいつも出る

## ランキング（Supabase）

タイムアタックの記録は Supabase に保存する（接続先は `ranking.js` の先頭）。

- 準備: Supabase の SQL Editor に `supabase/schema.sql` を貼って実行する（何度流しても大丈夫）
- 記録の消し方: Table Editor で `scores` テーブルを開き、消したい行を削除する
- 冒険ランキング（レベル順・クリアしたダンジョン順）は `rpg_players` テーブル（1人1行）。はじめて載せるときに端末で合言葉を作り（DB にはハッシュだけ）、localStorage の `rpgRank` に覚える。登録は1回だけで、あとは名前だけ変えられる。レベルアップ・バトルの勝ち・起動時に自動で送り直す（11秒あける）。ほかの人と同じニックネームは使えない。消し方は Table Editor で `rpg_players` の行を削除（`rpg-rank.js`、冒険ホームの［🏆 冒険ランキング］）
- プロフィール（`profile.js`・`profile.css`、ホームの［プロフィール］）: タイムアタック・今日の難問・冒険のランキングは、サイト共通のプロフィール（`profiles` テーブル、1端末1人）の名前で載せる。名前はほかの人と同じにできない。合言葉は端末で作り（DB にはハッシュだけ、localStorage の `profile`）、ランキングの行に出すのは公開用の ID（pid）だけで、名前を押すとプロフィール窓（称号・かざり・バッジの数）が開く。自動で載せる・公開は、はじめ ON。機種変更は［引き継ぎコードを出す］（24時間・1回だけ）→ 新しい端末で［引き継ぎコードを入れる］で、プロフィールと端末のデータ（設定・冒険・バッジなど）を持っていく。前の版のページから名前を送る古い関数は `old_version` を返す。本番の SQL は全部まとめて流さず、区切りごとに流す（手順は `docs/superpowers/plans/2026-10-28-profile-deploy.md`）
- テスト: 初回だけ `cd tests/e2e && npm install`。そのあとリポジトリ直下で `node --test 'tests/unit/*.test.mjs' 'tests/e2e/*.test.mjs'`（Playwright と Chromium が必要）と `bash tests/sql/run.sh`（PostgreSQL 16 が必要）
- PC の見た目: `pc.css`（900px 以上でだけ読み込む）。スマホ幅の見た目は index.html のインライン CSS
- PC レイアウトのテスト: `node --test tests/e2e/pc_layout.test.mjs` で PC の大きさ（1024×768・1366×657・1366×768・1920×1080）の収まりを見る
- スマホの見た目が変わっていないかのテスト: `GEOM_BASE=<コミット>` を付けると、スマホ幅（390×844・899×900）の全要素の位置をそのコミットと比べる（`phone_geometry_unchanged`。付けないときは飛ばす）
  - `<コミット>` には、いまの作業を始める前のコミットを書く（例: ブランチの分かれ目。まだコミットしていない変更なら `HEAD`）
  - `GEOM_BASE=auto` は使わない。PC レイアウトを入れる前のコミットを選ぶので、そのあと冒険・バッジでわざと変えたスマホの見た目がみな差になり、いまは必ず落ちる
  - スマホの見た目をわざと変えたときは差が出る。出た場面がその変更のものだけかを確かめて、次からはそのコミットを `GEOM_BASE` にする
    （例: バッジ × 国旗クエストの統合の始まり `7304e2d` と比べると、クイズ中の場面（`#pcoin` を進み具合と同じ行に入れた）と、仲間の一覧・ガチャの結果（カードの国名の折り返し）だけに差が出る）
- PC の確認用スクショ: `node tests/e2e/pc_shots.mjs --out <フォルダ>` でスクショと測定の表を出す（`--viewport 1280x577,2560x1300` `--scenes home,result` `--dopa` `--dark` `--no-shot` も使える）
- 結果画像のシェア（`share-card.js`、`window.SHARECARD`）: タイムアタックのクリア画面と今日の難問の［結果をシェア］で、1200×675 の結果画像と短い文を OS の共有シートに渡す（渡せない端末では X の投稿画面）。画像は端末の中で作るだけで、国名・首都・プロフィールの名前は入れない。今日の難問の画像は国旗を出さず20マスの帯だけ。URL とタグは `share-card.js` の先頭の `SHARE`

## 似た国旗の道場

モード選択のいちばん上の［🔍 似た国旗の道場 →］から入る練習（`dojo.js`・`dojo.css`、画面は `#scr-dojo`）。

- `daily-core.js` の `SIMILAR`（見まちがえやすい国旗の25グループ）から1つ選ぶと、そのグループの国だけを選択肢にした10問（国旗→国名か国名→国旗。場所と首都は出さない）。同じ国は2問続けて出さず、まちがえた問題は後半にもう一度出る
- 答えたあとは、正解の国旗と「えらんだ国」（まちがえたとき）か「にている国」（正解したとき）の国旗を縦横比のまま並べ、国旗の豆知識を出す。地図は出さない
- 記録は localStorage の `dojo`（`{ v:1, mode, mix:{'ro-td':3}, clear:{td:1} }`。引き継ぎコードで持っていく）だけ。苦手（`misses`）・バッジ・冒険のコインには入れず、`drill:start` `drill:answer` `drill:result` も出さない（`drill:dojo` だけ。docs/events.md）。最後まで終えた日（やめたときはのぞく）はれんぞく日数に数える
- テスト: 計算（`window.DOJO` の `build` `rival` `sanitize` `topPairs`）は `tests/unit/dojo.test.mjs`、画面は `tests/e2e/dojo.test.mjs`

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

## 静的ページ

- 読み物のページは `privacy.html`（プライバシーポリシー）・`about.html`（運営者・お問い合わせ）・`howto.html`（遊び方）の3つ。見た目は `pages.css` を共通で使う
- フッターは `<!-- footer:start -->`〜`<!-- footer:end -->` の目印の間に書き、`index.html` と3ページの4ファイルで同じリンクにする（`tests/unit/pages.test.mjs` の `footer_links_same` で確かめる）。リンクを変えるときは4ファイルとも直す
- `pages.css` の色と文字の変数（`--bg`・`--ink`・`--accent` など）は `index.html` と同じ値にする。`:root`・端末がダークのとき（`:root:not([data-theme="light"])`）・設定がダークのとき（`[data-theme="dark"]`）の3か所とも合わせる（同じテストで比べる）
- お問い合わせフォームの URL は `about.html` の `<h2 id="contact">` の下に `<a id="contact-form" href="…">` として置く。まだ無いあいだは `<p id="contact-pending">`（準備中）の文だけにしておく（`contact_form_url` のテストが、Google フォームの URL か準備中の文かを確かめる）。URL を置くときは `privacy.html` も見直す（`#collect` のお問い合わせの文・`#external` の Google フォーム・最終更新日が、実際のフォームと合っているか）
- 広告を入れるときは、`privacy.html` の広告の項目（`#ads`）を見直す
- `admin.html` にはフッターを付けない（`footer_not_in_admin`）
- 新しいページを足したら `sitemap.xml` にも書く（`<!-- country:start -->`〜`<!-- country:end -->` の目印の外に、手で書く）

## 国ごとのページ

- `country/<コード>.html`（195枚）と一覧の `country/index.html` は、`node tools/make_country_pages.mjs` で作る。作ったファイルはコミットする（JS を使わない静的なページ。地図はまだ入れない）
- 読むもの: `countries.js`・`trivia.js`・`daily-core.js` の `SIMILAR`・`index.html` の `REGIONS`・`SUBREGIONS`・フッター・`FLAG_V`・テーマの先読み・`privacy.html` の `pages.css?v=`・`world.js` と `data/neighbors_fix.json`（となりの国）・`data/flag_meanings.json`（国旗の意味）・`themes/*.html`（この国旗が出てくるまとめ）。どれかを変えたら流し直す（流し忘れると unit の `regenerate_same` が落ちて知らせる）
- `sitemap.xml` は目印のあいだだけを書きかえる。国のページに `lastmod` は付けない
- まとめページも作り直すときは、先に `node tools/make_theme_pages.mjs`、そのあと `node tools/make_country_pages.mjs`（国のページは作ってあるまとめページを読んで、その国が出てくるまとめにリンクする）
- SIMILAR に知らないコード・豆知識が0件の国・`flags/<コード>.svg` が無い国・フッターの目印が無い・国旗の意味（`data/flag_meanings.json`）が無い国や最初の文が長すぎる国がある・`themes/index.html` が無い・`data/neighbors_fix.json` に知らないコードや地図と同じになる直しがあるときは、何も書かずに終了コード1で止まる
- 国のページの［この地域で遊ぶ］は `index.html#play=<地域>`（細かい地域があればそれ）を開き、その地域を選んだモード選択の画面になる。知らない値は無視してホームを出す
- 本編の図鑑（一覧のくわしい窓と地図の情報欄）に「この国のページ ›」を出す。クイズの答えの欄には出さない
- `country/country.css` は国のページだけの決まり。色の変数は書かず、`pages.css` の変数だけを使う

## クレジット

- 国旗: [flag-icons](https://github.com/lipis/flag-icons)（MIT）。`flags/*.svg` は flag-icons の svg を `tools/split_flags.mjs` で1枚ずつのファイルに分けたもの（中身は変えていない）。作り直すときは消す前の flags.js を取り出して渡す: `git show $(git log -1 --format=%h --diff-filter=D -- flags.js)^:flags.js > /tmp/flags.js && node tools/split_flags.mjs /tmp/flags.js flags`。svg の中身を変えたら `index.html` の `FLAG_V` を上げる
- 地図: [world-atlas](https://github.com/topojson/world-atlas)（Natural Earth, ISC）。`world.js` は起動時には読まず、ホームが出たあとに `index.html` の `loadMap()` が `world.js?v=1` として読む（中身を変えたら `loadMap()` の `?v=` を上げる）
- 地図を描く部品: [d3](https://github.com/d3/d3) 7.9.0（ISC）と [topojson-client](https://github.com/topojson/topojson-client) 3.1.0（ISC）。CDN は使わず、npm の配布物をそのまま `vendor/` に LICENSE といっしょに置いている（`vendor/d3-7.9.0.min.js`・`vendor/topojson-client-3.1.0.min.js`）
- 国データ: [world-countries](https://github.com/mledoze/countries)（ODbL）

## テクスチャ

`textures/` に地図帳風のテクスチャ（SVG）を置いている。

- `paper.svg` … 紙の繊維。画面全体に薄く敷く（CSS マスクで色をテーマに合わせる）
- `contour.svg` … 等高線。ホームの背景
- `ocean-light.svg` / `ocean-dark.svg` … 銅版画風の海の波線。地図の海
