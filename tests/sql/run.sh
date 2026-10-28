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
# Supabase の auth.uid() の代わり（ログインした人の id。admin.sql には書かない）
sql <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
sql -f supabase/admin.sql
sql -f supabase/admin.sql
sql -f tests/sql/test_schema.sql
sql -f tests/sql/test_admin.sql
