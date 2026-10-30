#!/usr/bin/env bash
# supabase/schema.sql と supabase/admin.sql を使い捨ての PostgreSQL 16 に流して、tests/sql/test_schema.sql・test_admin.sql を実行する
# 使い方: bash tests/sql/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
# postgres ユーザーが入れる場所に作る（root で動くときはクラスタを postgres ユーザーで起動する）
TMP=$(mktemp -d /tmp/country-drill-sql.XXXXXX)
if [ "$(id -u)" = 0 ]; then
  chown postgres "$TMP"
  as_pg() { runuser -u postgres -- "$@"; }
else
  as_pg() { "$@"; }
fi

cleanup() {
  as_pg "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

as_pg "$PGBIN/initdb" -D "$TMP/data" -U postgres -E UTF8 --locale=C.UTF-8 -A trust >/dev/null
# TCP は開けずにソケットだけ。タイムゾーンは Supabase と同じ UTC
as_pg "$PGBIN/pg_ctl" -D "$TMP/data" -l "$TMP/log" -w -o "-c listen_addresses='' -k $TMP -c TimeZone=UTC" start >/dev/null

export PGOPTIONS='-c client_min_messages=warning'
sql() { "$PGBIN/psql" -X -q -h "$TMP" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# Supabase と同じく anon / authenticated ロールがあり、public に作った物には既定で全権限が付く状態にしておく
sql <<'SQL'
create role anon nologin;
create role authenticated nologin;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
SQL

# 2回流しても壊れないことも確認する
sql -f supabase/schema.sql
sql -f supabase/schema.sql
# 本番用の PR6 の SQL（ng_words() の入れかえだけ）も2回流す。最後の読むだけの表（空）は捨てる
sql -f supabase/pr6_ng_words_en.sql >/dev/null
sql -f supabase/pr6_ng_words_en.sql >/dev/null
# Supabase の auth.uid() の代わり（ログインした人の id。admin.sql には書かない）
sql <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
sql -f supabase/admin.sql
sql -f supabase/admin.sql
sql -f tests/sql/test_schema.sql
sql -f tests/sql/test_admin.sql

# 2つの接続を使うテスト（psql 1本ではできない）
echo '- admin_rename_rpg_takes_name_lock_before_row_lock'
# 本編の rpg_rename は「名前の鍵 → 行の鍵」の順。admin_rename も同じ順でないと、同時に同じ名前にしたとき deadlock になる。
# P が名前の鍵を持っているあいだに admin_rename を呼び、admin_rename が待っているあいだに P が行の鍵を（待たずに）取れることを確かめる
sql <<'SQL'
truncate rpg_players;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x71', 'locktest', 5, 1, 5);
SQL
sql >"$TMP/p.out" 2>&1 <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtext('rpgname:neko'));
do $$ begin
  for i in 1..200 loop
    exit when exists (select 1 from pg_locks where locktype = 'advisory' and not granted);
    perform pg_sleep(0.05);
  end loop;
end $$;
select 'row-lock:' || id from rpg_players where nickname = 'locktest' for update nowait;
commit;
SQL
P=$!
sql -t -A >"$TMP/a.out" 2>&1 <<'SQL'
select id as rid from rpg_players where nickname = 'locktest' \gset
do $$ begin
  for i in 1..200 loop
    exit when exists (select 1 from pg_locks where locktype = 'advisory' and granted and pid <> pg_backend_pid());
    perform pg_sleep(0.05);
  end loop;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select admin_rename('rpg', :rid, 'Neko');
SQL
if ! wait "$P" || ! grep -q 'row-lock:' "$TMP/p.out"; then
  echo "FAIL: admin_rename('rpg') が名前の鍵より先に行の鍵を取っている"; cat "$TMP/p.out"; exit 1
fi
grep -q '"ok": true' "$TMP/a.out" || { echo "FAIL: admin_rename の結果"; cat "$TMP/a.out"; exit 1; }
echo 'ok'

echo '- admin_rename_profile_takes_name_lock_before_row_lock'
# プロフィールにつながった行は、本編の profile_rename と同じ「名前の鍵（pfname:）→ プロフィールの行の鍵 → 表の行」の順で取る。
# P が名前の鍵を持っているあいだに admin_rename を呼び、admin_rename が待っているあいだに P がプロフィールの行と表の行の鍵を（待たずに）取れることを確かめる
sql <<'SQL'
truncate scores, daily_scores, rpg_players, profile_transfers, profiles;
insert into profiles (pid, token_hash, nickname) values ('pidlocktest1', '\x72', 'locktest');
insert into scores (board, nickname, time_ms, questions, profile_id) values ('f2n:asia:10', 'locktest', 8000, 10, (select id from profiles));
SQL
sql >"$TMP/p2.out" 2>&1 <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtext('pfname:neko'));
do $$ begin
  for i in 1..200 loop
    exit when exists (select 1 from pg_locks where locktype = 'advisory' and not granted);
    perform pg_sleep(0.05);
  end loop;
end $$;
select 'profile-lock:' || id from profiles where pid = 'pidlocktest1' for update nowait;
select 'score-lock:' || id from scores where nickname = 'locktest' for update nowait;
commit;
SQL
P=$!
sql -t -A >"$TMP/a2.out" 2>&1 <<'SQL'
select id as sid from scores where nickname = 'locktest' \gset
do $$ begin
  for i in 1..200 loop
    exit when exists (select 1 from pg_locks where locktype = 'advisory' and granted and pid <> pg_backend_pid());
    perform pg_sleep(0.05);
  end loop;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select admin_rename('scores', :sid, 'Neko');
SQL
if ! wait "$P" || ! grep -q 'profile-lock:' "$TMP/p2.out" || ! grep -q 'score-lock:' "$TMP/p2.out"; then
  echo "FAIL: admin_rename（プロフィールの行）が名前の鍵より先に行の鍵を取っている"; cat "$TMP/p2.out"; exit 1
fi
grep -q '"pid": "pidlocktest1"' "$TMP/a2.out" || { echo "FAIL: admin_rename（プロフィールの行）の結果"; cat "$TMP/a2.out"; exit 1; }
echo 'ok'

echo '- pr6_ng_words_en_lists_existing_names'
# PR6 の SQL の最後の表に、もう使われている名前・称号のうち新しい一覧に当たるものが出る（ほかの名前は出ない・何も変えない）
sql <<'SQL'
truncate profile_transfers, profiles, scores, daily_scores, rpg_players cascade;
insert into profiles (pid, token_hash, nickname, title) values ('pidng0000001', '\x81', 'Moderator', ''), ('pidng0000002', '\x82', 'チコ', 'ＨＩＴＬＥＲ'),
  ('pidng0000003', '\x83', 'Therapist', '');
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'xPornx', 8000, 10), ('f2n:asia:10', 'xPornx', 9000, 10),
  ('f2n:asia:10', 'Peacock', 8000, 10);
insert into daily_scores (day, nickname, correct, total, time_ms) values ('2026-10-30', 'Hentai', 20, 20, 30000);
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x84', 'Raccoon', 5, 1, 5);
SQL
sql -t -A -F '|' -f supabase/pr6_ng_words_en.sql >"$TMP/ng.out"
expected=$'daily_scores|Hentai|\nprofiles|Moderator|\nprofiles|チコ|ＨＩＴＬＥＲ\nscores|xPornx|'
if [ "$(grep '|' "$TMP/ng.out")" != "$expected" ]; then
  echo "FAIL: pr6_ng_words_en.sql の最後の表"; cat "$TMP/ng.out"; exit 1
fi
[ "$(sql -t -A -c 'select count(*) from profiles')" = 3 ] || { echo "FAIL: pr6_ng_words_en.sql が行を変えた"; exit 1; }
echo 'ok'
