# サイト共通のプロフィール 設計書

- 日付: 2026-10-28
- 対象: 国旗マスター（https://chikokunn1011.github.io/country-drill/）
- 状態: チコのレビュー待ち

## 1. 目的

今は冒険（国旗クエスト）だけにある「1端末1登録のプロフィール」を、国旗マスター全体で共通のプロフィールにする。
タイムアタック・今日の難問・冒険のランキングは、すべてそのプロフィールの名前で載る。

チコの要望と決定（2026-10-28）:
- 冒険で作ったプロフィールを、サイト全体で共通のプロフィール（アカウント）にしたい。ランキングもすべてそのアカウントで登録される
- ログインはしない。**端末ごと＋引き継ぎコード**（07:12Z 決定）
- 引き継ぎでは **冒険・バッジなどのデータも全部移す**（07:28Z 決定）
- プロフィールがあるとき、タイムアタックと今日の難問の記録は **自動で載せる**（07:29Z 決定。オフにもできる）
- ランキングの名前を押すと、その人のプロフィールが見られる（07:34Z 追加）
- プロフィールの非公開設定（07:34Z 追加）

いま（変える前）:
- タイムアタック・今日の難問: 終わるたびに名前を入れて［載せる］。だれでも同じ名前で送れる（TA は同名なら自己ベストだけ、今日の難問は同じ日に同じ名前は1回）
- 冒険: `rpg_players` に1端末1行。合言葉（token）のハッシュで本人確認、名前はほかの人とかぶれない、かざり（仲間の国旗3つ）あり。登録後は自動更新
- 名前の下書きは localStorage の `nickname`（冒険の旅人カードの名前もここ）
- 本番の記録は scores 2件・rpg_players 3件・daily_scores 2件（2026-10-28 07:10Z）

## 2. 遊ぶ側の流れ

### 2.1 プロフィールを作る

- ホームのメニューに［プロフィール］ボタン（ランキングの下）。まだ無ければ画面は「プロフィールを作る」フォーム（名前だけ。前に使った `nickname` を自動で入れておく）。
- タイムアタック・今日の難問の結果画面で、プロフィールが無い人には今までの名前入力欄を出し、ボタンは［プロフィールを作って載せる］。押すとプロフィールを作ってから、その記録を載せる。
- 冒険ランキングの画面も同じ（作ると冒険の記録も載る）。
- 名前のルールは今と同じ（1〜12文字・NGワード）。**ほかのプロフィールと同じ名前は使えない**（全角半角・大文字小文字をそろえて比べる）。

### 2.2 プロフィール画面（`profile`）

上から:
1. プロフィールのカード（ランキングで他の人が見るのと同じ見た目、§2.4）。
2. 名前を変える（ランキングの表示は過去の記録もふくめて新しい名前になる）。
3. かざり: 冒険の仲間の国旗3つ。選ぶのは今までどおり冒険の画面（ここには［冒険でかざりを選ぶ］リンク。冒険を隠している・始めていない人には出さない）。
4. スイッチ2つ:
   - 「プロフィールを公開する」（はじめは ON）
   - 「記録をランキングに自動で載せる」（はじめは ON）
5. 引き継ぎ（§2.5）。

### 2.3 ランキングに載る流れ

- **タイムアタック**: クリアしたら、プロフィールがあって自動 ON なら勝手に送る。結果画面に「◯◯ で載せたよ！ 歴代◯位・今週◯位」。自動 OFF なら［載せる］ボタン（名前入力は無し）。同じ条件では自己ベストだけが表に出る（今と同じ）。
- **今日の難問**: 終わったら同じように自動で送る（1日1回）。自動 OFF なら［載せる］ボタン。
- **冒険**: プロフィールがあって冒険を始めていれば、レベルアップ・バトルの勝ち・かざりの変更のたびに自動更新（今の自動更新をそのまま使う）。自動 OFF なら冒険ランキングの画面に［載せる／更新する］ボタン。
- 送れなかった（つながらない）ときは結果画面に［もう一回送る］。

### 2.4 ランキングの名前を押すとプロフィール

- タイムアタック・今日の難問・冒険のすべてのランキングで、名前の横にかざり（国旗3つまで）を出す。称号はランキングには出さない（名前の列が細くならないように）。
- 名前を押すと小さい窓（ダイアログ）でプロフィールのカード:
  - 名前・称号・かざり
  - バッジ ◯個（全◯個中）
  - 冒険 Lv◯・ダンジョン◯/21（冒険に載っていなければ出さない）
  - 英雄の塔 ◯階（最高記録の階。塔に登っていなければ出さない）
  - タイムアタックのいちばん良い記録3つ（順位が良い順。「国旗→国名・アジア・10問 12.34秒（3位）」の形）
  - 今日の難問 参加◯回（うち全問正解◯回）
  - はじめた日
- 非公開の人: 窓には名前とかざりと「このプロフィールは非公開だよ」だけ。
- プロフィールにひもづかない古い記録（§5.4）の名前は押せない（見た目もリンクにしない）。
- 自分の行は今までどおり色を変える（`me`）。

### 2.5 引き継ぎ

- 前の端末: プロフィール画面の［引き継ぎコードを出す］→ 確認「この端末のデータ（冒険・バッジ・設定など）を預けて、コードを出すよ。新しい端末でコードを入れると、この端末のプロフィールは使えなくなる」→ コード `ABCD-EFGH-JKLM`（12文字、まぎらわしい 0/O/1/I は使わない）と「24時間有効・1回だけ使える」。［コピー］ボタン。コードを出したあとも、新しい端末で使われるまではこの端末で普通に遊べる（その間の進み具合は移らないので、出し直せばよい。出し直すと前のコードは使えなくなる）。
- 新しい端末: プロフィール画面（プロフィールが無いときのフォームの下）か、ある場合も画面の一番下の［引き継ぎコードを入れる］→ コード入力 → 「◯◯ のプロフィールとデータをこの端末に移すよ。この端末の今のデータは上書きされる」→ OK でデータを書き戻してページを読み直す。
  - この端末にすでに別のプロフィールがあれば、確認文に「この端末のプロフィール『△△』は使えなくなる」も足す。
- 前の端末で次にサーバーとやりとりしたとき「not_found」になったら、プロフィールを消して「このプロフィールは別の端末に引き継がれたよ」と1回だけ出す（端末に残っているゲームのデータはそのまま。ランキングには載らない）。

## 3. データ（Supabase）

すべて今までと同じ方針: テーブルは RLS ON・ポリシー無し、ブラウザ（anon）は security definer の関数だけ呼べる。search_path は `public, pg_temp` に固定。合言葉はハッシュ（`rpg_hash` = sha256）だけ保存。

### 3.1 新しいテーブル

```sql
create table if not exists profiles (
  id bigint generated always as identity primary key,
  pid text not null unique,              -- 公開用のID（12文字の英数字、ランキングから窓を開くときに使う。合言葉とは別）
  token_hash bytea not null unique,      -- sha256(合言葉)
  nickname text not null,                -- 1〜12文字
  is_public boolean not null default true,
  title text not null default '',        -- いまつけている称号（40文字まで）
  deco text[] not null default '{}',     -- かざり（rpg_codes() の国コード、3つまで、重複なし）
  badges int not null default 0,         -- 取ったバッジの数
  badges_total int not null default 0,   -- バッジの全部の数（表示用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_name on profiles (lower(normalize(nickname, NFKC)));

create table if not exists profile_transfers (
  id bigint generated always as identity primary key,
  code_hash bytea not null unique,       -- sha256(コード。ハイフン抜き・大文字)
  profile_id bigint not null references profiles(id),
  data jsonb,                            -- 預けたデータ。使ったら・出し直したら null にする
  expires_at timestamptz not null,       -- 出してから24時間
  used_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 3.2 今のテーブルに足す列

- `scores.profile_id bigint references profiles(id)`（null = 古い記録）＋ index (board, profile_id)
- `daily_scores.profile_id bigint references profiles(id)` ＋ unique index (day, profile_id) where profile_id is not null
- `rpg_players.profile_id bigint unique references profiles(id)`

列を足すだけで消す・名前を変えるものは無い（MCP の apply_migration で通る形）。

### 3.3 関数（新しく作る）

| 関数 | 中身 |
|---|---|
| `profile_create(p_token, p_nickname)` | 名前チェック（bad_name / ng_name / name_taken）→ 作る。同じ合言葉がもうあれば `already`。返事 `{ok, pid, nickname}` |
| `profile_me(p_token)` | 自分のプロフィール `{ok, pid, nickname, is_public, title, deco}`。無ければ `not_found`（引き継がれた・消された） |
| `profile_rename(p_token, p_nickname)` | 名前を変える。`rpg_players.nickname` と、`scores`・`daily_scores` のこの人の行の `nickname` もそろえる（表示は profiles から取るが、Table Editor で見やすいように） |
| `profile_set(p_token, p_is_public, p_title, p_deco, p_badges, p_badges_total)` | 公開・称号・かざり・バッジの数を一度に。値の範囲チェック（deco は rpg_codes() の中・3つまで・重複なし、title 40文字まで、badges 0〜500）。null の引数は変えない |
| `profile_card(p_pid)` | §2.4 の窓の中身。非公開なら `{ok, private: true, nickname, deco}`。無ければ `not_found`。`rpg` に英雄の塔の最高記録 `tower`（0 なら入れない） |
| `submit_score2(p_token, p_board, p_time_ms, p_questions)` | 今の submit_score と同じチェック（名前の代わりにプロフィール）。10秒の連投よけは profile_id で |
| `top_scores2(p_board, p_period)` | 同じ人は最速1件（profile_id ごと、古い記録は nickname ごと）。返す列に `pid`（古い記録は null）と `deco` を足す。名前は profiles のいまの名前 |
| `submit_daily2(p_token, p_day, p_correct, p_total, p_time_ms)` | 今の submit_daily と同じチェック。1日1回は profile_id で（2回目は `already`） |
| `top_daily2(p_day)` | `pid`・`deco` 付き |
| `rpg_update2(p_token, p_lv, p_dungeons, p_floors)` | プロフィールの冒険の記録を入れる／新しくする（行が無ければ作る）。記録は今までの最高を残す。10秒の連投よけ |
| `rpg_unregister2(p_token)` | 冒険データを消したとき、この人の rpg_players の行を消す（プロフィールは残す） |
| `top_rpg3(p_sort)` | top_rpg2 に `pid` を足し、名前・かざりは profiles から |
| `rpg_set_tower2(p_token, p_tower)` | 英雄の塔の最高記録の階をプロフィールで送る（行が無ければ rpg_update2 と同じく作る。レベル1・ダンジョン0から）。最高を残す。10秒の連投よけは rpg_set_tower と同じく tower_at で（記録とは別） |
| `top_tower2()` | top_tower に `pid` を足し、名前・かざりは profiles から |
| `profile_transfer_start(p_token, p_data)` | 前のコードの data を null にしてから、新しいコード（12文字）を作って返す。data は 512KB まで。1分に1回まで（too_soon） |
| `profile_transfer_claim(p_code, p_new_token)` | 使える（期限内・未使用）コードなら、profiles.token_hash を新しい合言葉に入れかえ、used_at を入れて data を null に。返事 `{ok, pid, nickname, data}`。だめなら `bad_code` |

- rank_of / daily_rank_of / rpg_rank_of はそのまま使う。
- `rpg_unregister2` は中に delete があるので、MCP では確認待ちで時間切れになる。**この関数を含む SQL はチコに SQL Editor で Run してもらう**（ほかは MCP の apply_migration）。
- コードを総当たりされても 32^12 通りあるので現実的に当たらない。1回のミスごとの待ちは入れない。

### 3.4 古い関数

前の版のページがキャッシュに残っている人のために、今の関数は残すが中身を入れかえる（create or replace。drop しない）:
- `submit_score` / `submit_daily` / `rpg_register` / `rpg_rename` / `rpg_update` / `rpg_set_deco` / `rpg_set_tower` は `{ok:false, reason:'old_version'}` を返す（「ページを読み直してね」）。名前をプロフィールと別に送れる道を残さないため。
- `rpg_unregister`・`top_scores` / `top_daily` / `top_rpg` / `top_rpg2` / `top_tower` / `rank_of` などの読むだけ・消すだけの関数はそのまま。
- 使わなくなった関数とテーブル（rpg_scores、submit_rpg など）は消さない（今までの方針）。

## 4. ブラウザ側

### 4.1 新しいファイル `profile.js`（＋ `profile.css`）

- localStorage `profile`: `{ token, pid, name, auto: true, sent: { is_public, title, deco, badges, badges_total } }`
- `window.PROFILE`:
  - `get()` … いまのプロフィール（無ければ null）
  - `create(name)` … 作る（合言葉は端末で作る。送る前に `profilePending` に覚え、返事が届かなかったら同じ合言葉でやり直す。冒険ランキングの今のやり方と同じ）
  - `ensureFrom(name)` … 結果画面用。無ければ作る、あればそのまま返す
  - `auto()` … 自動で載せるか
  - `openCard(pid)` … §2.4 の窓を開く
  - `nameHTML(row)` … ランキングの名前のセル（かざり付き、pid があれば押せるボタン）。3つのランキングで共通に使う
  - `lost()` … サーバーが `not_found` を返したときに呼ぶ（プロフィールを消して §2.5 の知らせ）
- 画面 `profile` を `registerScreen` で足す。ホームの［プロフィール］ボタンもここで差しこむ（index.html はボタン1つ分だけ）。
- 称号・バッジの数・かざり・公開の同期: `badge:title`・`badge:earned`・`rpg:deco`・起動時に、`sent` とちがえば少し待って `profile_set`（冒険ランキングの自動更新と同じ「まとめて1回・つながらなければ次のきっかけ」）。
- 名前（`nickname`）: プロフィールがあればそちらが本物。作る・名前を変えたときに `nickname` にも書く（冒険の旅人カードはそのまま `nickname` を読めばよい）。

### 4.2 ランキング・結果画面の変更

- `ranking.js`: §3.3 の関数を呼ぶメソッドを足す（`profileCreate`・`profileMe`・`profileRename`・`profileSet`・`profileCard`・`submit2`・`top2`・`dailySubmit2`・`dailyTop2`・`rpgUpdate2`・`rpgUnregister2`・`rpgTop3`・`rpgSetTower2`・`topTower2`・`transferStart`・`transferClaim`）。古いメソッドは消す。メッセージに `old_version`・`bad_code`・`not_found`（引き継ぎ）を足す。
- `index.html`（タイムアタック）: 結果画面の名前入力を §2.3 に。ランキングの表は `PROFILE.nameHTML`。
- `daily.js`: 同じ。
- `rpg-rank.js`: 登録フォーム・合言葉・`rpgRank` まわりを消して、プロフィールの合言葉で `rpg_update2`（英雄の塔は `rpg_set_tower2`）。表は `top_rpg3`（塔のタブは `top_tower2`）と `PROFILE.nameHTML`。冒険データを消したら `rpg_unregister2`（今の「つながらなかったら次の起動で」はそのまま）。
- `rpg.js`: かざりは今までどおり冒険のセーブ（`deco`）に持ち、変わったら `rpg:deco`（もう出している）。
- profile.js が読めなかったとき（配信漏れ）は、ランキングは見るだけ・載せられない（「ページを読み直してね」）。

### 4.3 今の端末からの引っ越し（はじめて新しい版を開いたとき）

- localStorage `rpgRank`（冒険に登録ずみ）があれば、その合言葉で `profile_me` → 通れば `profile` に入れて `rpgRank` を消す（サーバー側で §5.2 のとおり同じ合言葉のプロフィールになっている）。`not_found` なら `rpgRank` を消すだけ。
- `rpgRankPending`・`rpgRankDel` は今の処理を続けて片づける。

### 4.4 引き継ぎで預けるデータ

- localStorage の決まったキーだけ: `settings`・`setup`・`misses`・`nickname`・`rpg`・`badges`・`daily`・`bdgcat`・`bview`（同じ github.io のほかのサイトのデータを持っていかないように、全部ではなくこの一覧）。
- `{ v: 1, keys: { キー: 中身の文字列 } }` の形で送る。受け取った側はこの一覧のキーだけ書き戻す（一覧に無いキーは無視）。書き戻す前に今の値を `transferBackup` に1つだけ退避する。
- 単体テストで「コードの中の `store.get/set`・`localStorage` のキーが、この一覧か『預けないキーの一覧』（`profile`・`profilePending`・`rpgRank*`・`transferBackup`・`badges-broken`）のどちらかに入っている」を確かめる（キーを足したのに一覧に入れ忘れるのを防ぐ）。

## 5. 公開の手順と今ある記録

### 5.1 順番

1. チコの OK → Supabase に §3 の SQL（テーブル・列・関数。rpg_unregister2 だけ SQL Editor でチコに Run してもらう）。この時点では古い関数はまだ入れかえない（今の本番のページが動き続ける）。
2. §5.2 の引っ越し SQL。
3. PR をマージしてサイトを公開。
4. §3.4 の古い関数の入れかえ（公開の直後）。

### 5.2 冒険の3人をプロフィールに

`rpg_players` の各行について、同じ `token_hash`・`nickname`・`deco` で `profiles` を作り、`rpg_players.profile_id` を入れる（insert … select と update だけ、delete なし）。冒険のランキングはそのまま続く。

### 5.3 戻すとき

main を戻すだけでよいように、新しいテーブル・列・関数はそのまま置いておいてよい。ただし §3.4 の入れかえをした後に main を戻すなら、古い関数を元の中身に戻す SQL（supabase/schema.sql の今の版）も流す。

### 5.4 古い記録

タイムアタック・今日の難問の古い4件は profile_id が null のまま、名前だけで表に残る（押せない）。

## 6. テスト

- SQL（`tests/sql`）: プロフィールを作る・同じ名前は name_taken・名前変更が3つの表に出る・非公開の card・submit_score2 の自己ベスト・submit_daily2 の1日1回・rpg_update2 の最高を残す・引き継ぎ（期限切れ・2回目・出し直しで前のコードが使えない・前の合言葉が not_found になる）・古い関数が old_version。
- 単体（`tests/unit`）: 預けるキーの一覧のチェック（§4.4）、ranking.js の新メソッドの引数と返事の形。
- e2e（`tests/e2e`、Supabase は今までどおり route で偽物）: プロフィールを作る→TA クリアで自動で載る／自動 OFF でボタン、今日の難問で自動で載る、冒険の自動更新、ランキングの名前を押して窓（公開・非公開）、引き継ぎ（コードを出す→別のブラウザで入れる→データが移る→前のほうは not_found の知らせ）、`rpgRank` からの引っ越し、スマホ幅とPC幅で窓がはみ出さない。今のランキング・冒険ランキングの e2e は新しい形に直す。

## 7. やらないこと

- ログイン、メールアドレスなどの個人情報
- プロフィールを消す機能（必要になったら Table Editor で profiles の行を消す。記録の profile_id が残るので、消すときは先に記録の profile_id を null にする）
- 自分のアイコン画像・自己紹介文
- 引き継ぎで使われなかったプロフィールの名前の開放（2台目で別のプロフィールを作っていて、そこに引き継いだ場合、2台目の前のプロフィールの名前はそのまま使われたままになる）

## 8. 第3章「宇宙」との関係

別スレッドで冒険の第3章を作業中。こちらで触る冒険のファイルは `rpg-rank.js`（大きく変わる）と `rpg.js`（ほぼ触らない）。第3章で `rpg_record_ok` の上限が変わる場合は `rpg_update2` も同じ関数を使うので、そのままそろう。マージは後に出したほうが前のを取りこんでから。
