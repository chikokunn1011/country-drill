# プロフィール 本番の手順

設計書: `docs/superpowers/specs/2026-10-28-profile-design.md` §5 ／ 計画: `docs/superpowers/plans/2026-10-28-profile.md` Task 10

`supabase/schema.sql` は区切りごとに流す（全部まとめて Run しない）。

| 区切り | 中身 | 流し方 | いつ |
|---|---|---|---|
| ① 区切りの外 | テーブル・列・新しい関数・冒険の行の引っ越し（delete なし） | MCP `apply_migration`（name `profiles`） | PR マージの前 |
| ② `-- >>> SQL Editor` 〜 `-- <<< SQL Editor` | `rpg_unregister`・`rpg_unregister2`（中に delete がある） | チコが SQL Editor で Run | ①のすぐ後 |
| ⑤ `-- >>> old_version` 〜 `-- <<< old_version` | 古い関数を `old_version` を返す中身に入れかえ＋もう一度引っ越し | MCP `apply_migration`（name `profiles_old_version`） | PR マージ（サイト公開）の後 |

- 戻すときの main: `origin/main` の今のコミット `bb44880d70a5cdcb4fb0a6ed6a4e227ee2047648`（国旗クエスト「英雄の塔」 (#27)）
- Supabase: `https://vgdkklvhtvcamtxwjpke.supabase.co`（`ranking.js` の先頭と同じプロジェクト）

## 0. 区切りの切り出し方

リポジトリ直下で（ブランチは PR のもの）:

```bash
# ① 区切りの外（SQL Editor と old_version の間を、目印の行ごと除く）
awk '/^-- >>> (SQL Editor|old_version)/{skip=1} !skip{print} /^-- <<< (SQL Editor|old_version)/{skip=0}' supabase/schema.sql > /tmp/step1.sql
# ② SQL Editor の間
awk '/^-- >>> SQL Editor/{on=1} on{print} /^-- <<< SQL Editor/{on=0}' supabase/schema.sql > /tmp/step2.sql
# ⑤ old_version の間
awk '/^-- >>> old_version/{on=1} on{print} /^-- <<< old_version/{on=0}' supabase/schema.sql > /tmp/step5.sql

# 確かめる: ① と ⑤ に delete が無い（コメントの行を除いて 0 件）・② にだけある
for f in /tmp/step1.sql /tmp/step2.sql /tmp/step5.sql; do printf '%s ' $f; grep -v '^ *--' $f | grep -ci delete; done
```

2026-10-28 に実際に切り出した結果（main #27 を取りこんだ後の schema.sql、1077 行）:

- ①: 1010 行・関数 44 個。delete はコメントの3行（11・12・253 行目の説明）にだけ出てきて、SQL の中には 0 件（`delete from` は 0 件）。最後は `notify pgrst, 'reload schema';`
- ②: 31 行・関数 2 個（`rpg_unregister`・`rpg_unregister2`）。`delete from` 2 件
- ⑤: 36 行・関数 7 個（`rpg_set_tower` を含む）。delete 0 件
- MCP がコメントの「delete」の字でも確認を出すときは、①をコメントの行を除いて渡す: `grep -v '^ *--' /tmp/step1.sql > /tmp/step1-nocomment.sql`
- 使い捨ての PostgreSQL 16 で「origin/main の schema.sql → ① → ② → ③ → ⑤ → ⑥の古い関数を流し直す」を通して確かめた（①のあと②の前に古いページで登録した人も、③で profile_id が埋まっていた）。手元のテスト `bash tests/sql/run.sh` の `deploy_steps` も同じ切り方で ① に delete が無いことを確かめている

## ① テーブル・列・関数（MCP apply_migration）

- MCP の `apply_migration` に、name `profiles`、query に `/tmp/step1.sql` の中身をそのまま渡す
- 何度流しても大丈夫（`if not exists`・`create or replace`・引っ越しは `where not exists`）。途中で切れたらもう一度流してよい
- この時点では古い関数（`submit_score`・`rpg_register` など）は元の中身のまま。今の本番のページはそのまま動く
- 中の `profile_migrate_rpg()` で、今の `rpg_players` の行（3人）がプロフィールになる

## ② delete のある関数（チコに SQL Editor で Run してもらう）

Supabase のダッシュボード → SQL Editor → New query に、下をそのまま貼って Run。`Success. No rows returned` が出れば OK。
（最後の `notify` は schema.sql では区切りの外（①の側）にあるので、②の後にも1回足している）

```sql
-- >>> SQL Editor（中に delete があるので、本番では Supabase の SQL Editor でこの間を Run する）
-- 前の版のページ用: 冒険データを消したときに、その端末の行を消す（ランキングからも消える）。もう無ければ not_found
create or replace function rpg_unregister(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  delete from rpg_players where token_hash = v_hash;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function rpg_unregister(text) from public;
grant execute on function rpg_unregister(text) to anon;

-- 冒険データを消したときに、この人の冒険ランキングの行を消す（プロフィールは残す）。もう無ければ not_found
create or replace function rpg_unregister2(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_p profiles;
begin
  if rpg_hash(p_token) is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  v_p := profile_by_token(p_token);
  if v_p.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  delete from rpg_players where profile_id = v_p.id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function rpg_unregister2(text) from public;
grant execute on function rpg_unregister2(text) to anon;
-- <<< SQL Editor

notify pgrst, 'reload schema';
```

## ③ 確認クエリ（MCP execute_sql）

```sql
-- プロフィールの数＝冒険ランキングの行の数、プロフィールにつながっていない行は 0
select (select count(*) from profiles) as profiles,
       (select count(*) from rpg_players) as rpg_players,
       (select count(*) from rpg_players where profile_id is null) as rpg_no_profile;

-- 関数の一覧と anon が呼べるか
select p.proname as name, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_run
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by anon_can_run desc, p.proname;
```

見るところ:

- `profiles` = `rpg_players`（設計書の時点では 3）、`rpg_no_profile` = 0。ずれていたら①をもう一度流す（引っ越しは何度でも大丈夫）
  - サイト公開の後はプロフィールだけ作る人が増えるので `profiles` の方が多くなる。そのときは `rpg_no_profile` = 0 だけ見る
- `anon_can_run` が t の関数（33 個）: `profile_create`・`profile_me`・`profile_rename`・`profile_set`・`profile_card`・`profile_transfer_start`・`profile_transfer_claim`・`submit_score2`・`top_scores2`・`rank_of`・`rpg_update2`・`rpg_unregister2`・`top_rpg3`・`rpg_rank_of`・`rpg_set_tower2`・`top_tower2`・`rpg_tower_rank_of`・`submit_daily2`・`top_daily2`・`daily_rank_of`、古いページ用の `submit_score`・`top_scores`・`rpg_register`・`rpg_update`・`rpg_rename`・`rpg_unregister`・`rpg_set_deco`・`top_rpg`・`top_rpg2`・`rpg_set_tower`・`top_tower`・`submit_daily`・`top_daily`
- f の関数（中で使うだけ）: `profile_by_token`・`profile_clean_name`・`profile_migrate_rpg`・`profile_name_problem`・`rpg_hash`・`rpg_name_problem`・`rpg_record_ok`・`rpg_codes`・`ng_words`・`jst_week_start`・`daily_count`・`daily_day`・`daily_day_open`。ここが t なら①を流し直す（中に revoke がある）
- `rpg_unregister2` が一覧に無ければ②がまだ

## ④ PR をマージ

- ③が通ってから PR をマージ（GitHub Pages に出る）。公開されたら、スマホでプロフィールを作る・タイムアタックを1回クリアして自動で載るのを見る
- 古いページがキャッシュに残っている人は、⑤までは古い関数で今までどおり送れる

## ⑤ 古い関数の入れかえ（MCP apply_migration）

- 公開を確かめたら、MCP の `apply_migration` に name `profiles_old_version`、query に `/tmp/step5.sql` の中身を渡す
- 古いページから送ると `{"ok":false,"reason":"old_version"}` が返る（関数は drop しない）
- 最後の `profile_migrate_rpg()` で、①〜⑤の間に古いページで登録された冒険の行もプロフィールに引っ越す
- 流した後に③をもう一度（`rpg_no_profile` = 0）。`select rpg_register('00000000-0000-4000-8000-000000000000','テスト',1,0,0);` と `select rpg_set_tower('00000000-0000-4000-8000-000000000000',1);` が `old_version` を返すことも見る（行は増えない）

## ⑥ 戻し方

1. main を `origin/main` の今のコミットへ戻す（新しいテーブル・列・関数はそのまま置いておいてよい。古いページは古い関数だけを使う）

   ```bash
   git revert -m 1 <マージコミット>   # PR の変更を打ち消すコミットを作って push（squash マージなら -m 1 は付けない）
   ```

   戻った後の main の中身が `bb44880` と同じこと: `git diff bb44880d70a5cdcb4fb0a6ed6a4e227ee2047648 HEAD --stat` が空

2. ⑤の後に戻すときは、古い関数の元の中身も流し直す（⑤の前なら要らない）。`origin/main` 版の schema.sql から7つの関数（revoke・grant まで）を切り出して、MCP の `apply_migration`（name `profiles_rollback_old`）で流す。中に delete は無い

   ```bash
   git show bb44880d70a5cdcb4fb0a6ed6a4e227ee2047648:supabase/schema.sql \
     | awk '/^create or replace function (submit_score|submit_daily|rpg_register|rpg_rename|rpg_update|rpg_set_deco|rpg_set_tower)\(/{on=1} on{print} on && /^grant execute on function/{on=0; print ""}' \
     > /tmp/rollback_old.sql
   echo "notify pgrst, 'reload schema';" >> /tmp/rollback_old.sql
   grep -c '^create or replace function' /tmp/rollback_old.sql   # 7
   grep -ci delete /tmp/rollback_old.sql                          # 0
   ```

   流した後: `select submit_score('f2n:asia:10', 'テスト', 999999, 10);` が `ok: true` になれば戻っている（試しに入った行は Table Editor の `scores` から消す）

3. 戻した後も `profiles`・`profile_transfers`・`scores.profile_id` などはそのまま残る。古いページは使わないので害は無い。次に出し直すときは①から（何度流しても大丈夫）
