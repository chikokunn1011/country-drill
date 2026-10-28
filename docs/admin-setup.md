# 管理ページ 本番の手順書

チコが Supabase の画面でやること。上から順にやればOK。所要時間はたぶん10分くらい。

管理ページの場所: https://chikokunn1011.github.io/country-drill/admin.html

> 先に確認: `supabase/schema.sql` はもう本番に流してある前提（`admin.sql` は中の関数を使う）。まだなら、それを先に SQL Editor で Run しといて。

## 1. 自分のユーザーを作る

1. Supabase のプロジェクトを開く。
2. 左メニュー **Authentication** → **Users**。
3. 右上の **Add user** → **Create new user**。
4. メールアドレスとパスワードを入れる。
5. **Auto Confirm User** を **ON** にする（OFFだと確認メールが飛んでログインできない）。
6. **Create user** を押す。

パスワードは長くして（16文字以上がおすすめ）、他のサービスと使い回さないこと。パスワード管理アプリで作るのが楽。

## 2. 新規登録をオフにする

1. 左メニュー **Authentication** → **Sign In / Providers**。
2. **User Signups** のあたりにある **Allow new users to sign up** を **OFF** にする。
3. **Save changes** を押す。

これで知らない人が勝手にユーザーを作れなくなる。（万一ONのままでも、次の手順の admins に入ってない人は何もできないけど、二重で守っとく。）

## 3. 管理用の SQL を流す

1. 左メニュー **SQL Editor** → **New query**。
2. リポジトリの `supabase/admin.sql` を**全部**コピーして貼る。
3. **Run**。エラーなしで終わればOK。何回流しても大丈夫。
   - 「destructive operation（壊す操作）が入ってる」みたいな警告が出ることがある。中の関数が行を消す（`delete`）からで、問題ないのでそのまま確認して Run してOK。

これで `admins`（管理者リスト）・`admin_log`（操作の記録）・`admin_trash`（ごみ箱）と、`admin_` で始まる関数ができる。

## 4. 自分を管理者に登録する

1. **Authentication** → **Users** で、手順1で作った自分の行を探す。
2. **User UID**（`xxxxxxxx-xxxx-...` の形の長い文字）をコピー。
3. **SQL Editor** → **New query** に次を貼って、`<UID>` をさっきのUIDに置きかえて **Run**。

```sql
insert into admins (user_id, note) values ('<UID>', 'チコ') on conflict (user_id) do nothing;
```

`<` `>` は消して、UID を `'` で囲んだまま残す。もう登録してあっても、エラーにならずそのまま（何回流しても大丈夫）。

## 5. ログインして確認

1. https://chikokunn1011.github.io/country-drill/admin.html を開く。
2. 手順1のメールとパスワードでログイン。
3. 件数などのダッシュボードが出ればOK。

## 6. 最終確認（anon から呼べないこと）

SQL Editor → New query で次を Run:

```sql
select has_function_privilege('anon','admin_list(text,jsonb)','execute');
```

結果が **false** なら正解（ログインしてない人は管理の関数を呼べない）。`true` だったら `admin.sql` をもう一度流して、それでも true なら教えて。

## 困ったとき

- **ログインできない**: メール・パスワードを見直す。Authentication → Users に自分がいるか、**Auto Confirm User** で作ったか（未確認のままだと入れない）を確認。
- **「管理者じゃない」と出る**: ログインはできてるけど `admins` に入ってない。Authentication → Users の **User UID** と、SQL Editor で `select * from admins;` の `user_id` が同じか見る。違う・空なら手順4をやり直す。
- **パスワードを忘れた**: Authentication → Users で自分の行のメニュー（右の「…」）から **Send password recovery** を押す。届いたメールのリンクから新しいパスワードを決める（画面からパスワードを直接書きかえる項目は無い）。
  - メールがいつまでも届かないときは、その行を **Delete user** で消して、手順1でユーザーを作り直し、手順4で新しい UID を admins に入れ直す（古い UID の行は `delete from admins where user_id = '<古いUID>';` で消しておく）。

## 注意

- Supabase の `service_role` キーなど、強い鍵は管理ページにもリポジトリにも絶対置かない・貼らない。
- 管理ページはログイン後30分何もしないと自動ログアウトする。
