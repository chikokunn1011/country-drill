-- supabase/admin.sql（管理用サイトの関数）のテスト。run.sh が schema.sql・admin.sql・test_schema.sql のあとに流す
\set ON_ERROR_STOP on
\echo 'admin.sql のテスト'

reset role;
truncate scores, daily_scores, rpg_players, admin_log, admin_trash;
delete from admins;
insert into admins values ('00000000-0000-0000-0000-00000000000a');

-- 呼ぶ人は request.jwt.claim.sub で切りかえる（空＝anon、…0b＝admins に居ない人、…0a＝チコ）

\echo '- functions_are_locked_down'
-- admin_ の関数はどれも security definer・search_path 固定・anon は呼べない・authenticated は呼べる
do $$ declare f record; begin
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admin\_%') = 9,
    format('admin_ の関数の数: %s', (select string_agg(proname, ', ') from pg_proc where pronamespace = 'public'::regnamespace and proname like 'admin\_%'));
  for f in select p.oid, p.oid::regprocedure::text as name, p.prosecdef, p.proconfig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' loop
    assert f.prosecdef, format('%s は security definer', f.name);
    assert f.proconfig = array['search_path=public, pg_temp'], format('%s: %s', f.name, f.proconfig);
    assert not has_function_privilege('anon', f.oid, 'execute'), format('anon が %s を呼べる', f.name);
    assert not has_function_privilege('public', f.oid, 'execute'), format('public が %s を呼べる', f.name);
    assert has_function_privilege('authenticated', f.oid, 'execute'), format('authenticated が %s を呼べない', f.name);
  end loop;
  assert (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.admins'::regclass, 'public.admin_log'::regclass, 'public.admin_trash'::regclass)), 'RLS が有効';
  assert (select count(*) from pg_policies where tablename in ('admins', 'admin_log', 'admin_trash')) = 0, 'ポリシーは作らない';
end $$;

-- 呼ばれたらこまる状態を作っておく（消せる行・戻せる行がある）
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'x', 8000, 10);
insert into admin_trash (kind, row_data) values ('scores', '{"id": 999, "board": "f2n:asia:10", "nickname": "y", "time_ms": 9000, "questions": 10, "created_at": "2026-01-01T00:00:00Z"}');

\echo '- anon_cannot_call_any'
set role anon; set request.jwt.claim.sub = '';
do $$ declare f record; v_args text; v_msg text; begin
  for f in select p.oid, p.proname, p.oid::regprocedure::text as name from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' loop
    select coalesce(string_agg('null::' || format_type(t, null), ', ' order by o), '') into v_args
      from unnest((select proargtypes::oid[] from pg_proc where oid = f.oid)) with ordinality a(t, o);
    begin
      execute format('select %I(%s)', f.proname, v_args);
      raise exception 'anon が % を呼べた', f.name;
    exception when insufficient_privilege then v_msg := sqlerrm;
    end;
    -- 中の admin_check() で止まったのではなく、そもそも execute 権限が無い
    assert v_msg like 'permission denied for function%', format('%s: %s', f.name, v_msg);
  end loop;
end $$;
reset role;

\echo '- stranger_cannot_call_any'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ declare f record; v_args text; v_msg text; begin
  for f in select p.oid, p.proname, p.oid::regprocedure::text as name from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' loop
    select coalesce(string_agg('null::' || format_type(t, null), ', ' order by o), '') into v_args
      from unnest((select proargtypes::oid[] from pg_proc where oid = f.oid)) with ordinality a(t, o);
    v_msg := null;
    begin
      execute format('select %I(%s)', f.proname, v_args);
      raise exception '知らない人が % を呼べた', f.name;
    exception when insufficient_privilege then v_msg := sqlerrm;
    end;
    assert v_msg = 'admin only', format('%s: %s', f.name, v_msg);
  end loop;
  -- 引数つきでも同じ
  begin perform admin_delete('scores', array[(select 1::bigint)]); raise exception 'delete できた';
  exception when insufficient_privilege then null; end;
  begin perform admin_restore(array[1::bigint]); raise exception 'restore できた';
  exception when insufficient_privilege then null; end;
  begin perform admin_rename('scores', 1, 'z'); raise exception 'rename できた';
  exception when insufficient_privilege then null; end;
end $$;
-- ログインしていない authenticated（sub が空）も同じ
set request.jwt.claim.sub = '';
do $$ begin
  begin perform admin_check(); raise exception 'sub が空でも通った';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from scores) = 1, '知らない人が呼んでも scores は変わらない';
  assert (select count(*) from admin_log) = 0, 'admin_log も変わらない';
  assert (select count(*) from admin_trash where restored_at is null) = 1, 'admin_trash も変わらない';
end $$;

\echo '- tables_not_readable'
truncate scores, admin_trash;
set role anon;
do $$ begin
  begin perform * from admins; raise exception 'anon が admins を読めた'; exception when insufficient_privilege then null; end;
  begin perform * from admin_log; raise exception 'anon が admin_log を読めた'; exception when insufficient_privilege then null; end;
  begin perform * from admin_trash; raise exception 'anon が admin_trash を読めた'; exception when insufficient_privilege then null; end;
  begin insert into admins values ('00000000-0000-0000-0000-0000000000cc'); raise exception 'anon が admins に書けた'; exception when insufficient_privilege then null; end;
end $$;
reset role; set role authenticated;
do $$ begin
  begin perform * from admins; raise exception 'authenticated が admins を読めた'; exception when insufficient_privilege then null; end;
  begin perform * from admin_log; raise exception 'authenticated が admin_log を読めた'; exception when insufficient_privilege then null; end;
  begin perform * from admin_trash; raise exception 'authenticated が admin_trash を読めた'; exception when insufficient_privilege then null; end;
  begin insert into admins values ('00000000-0000-0000-0000-00000000000b'); raise exception 'authenticated が admins に書けた'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ここからはチコ（admins に居る人）
\echo '- admin_whoami'
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare r jsonb := admin_whoami(); begin
  perform admin_check();
  assert r = '{"ok":true,"user_id":"00000000-0000-0000-0000-00000000000a"}'::jsonb, format('whoami: %s', r);
end $$;
reset role;

\echo '- admin_stats_counts'
insert into scores (board, nickname, time_ms, questions, created_at) values
  ('f2n:asia:10', 'チコ', 8000, 10, now() - interval '30 days'),
  ('f2n:asia:10', 'ミケ', 9000, 10, now());
insert into daily_scores (day, nickname, correct, total, time_ms) values (current_date, 'チコ', 20, 20, 60000);
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, updated_at) values ('\x01', 'タマ', 5, 1, 5, now() + interval '1 minute');
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, created_at, updated_at) values ('\x02', 'ポチ', 5, 1, 5, now() - interval '30 days', now() - interval '30 days');
set role authenticated;
do $$ declare r jsonb := admin_stats(); begin
  assert r->'ok' = 'true'::jsonb, format('ok: %s', r);
  assert r->'counts' = '{"scores":2,"daily":1,"rpg":2}'::jsonb, format('counts: %s', r->'counts');
  assert r->'today' = '{"scores":1,"daily":1,"rpg":1}'::jsonb, format('today: %s', r->'today');
  assert r->'week' = '{"scores":1,"daily":1,"rpg":1}'::jsonb, format('week: %s', r->'week');
  assert (r->>'last_at')::timestamptz > now(), format('last_at は rpg の updated_at: %s', r->>'last_at');
  assert r->'recent_log' = '[]'::jsonb, format('recent_log: %s', r->'recent_log');
end $$;
reset role;

\echo '- list_hides_token_hash'
delete from rpg_players where nickname = 'ポチ';
set role authenticated;
do $$ declare r jsonb := admin_list('rpg', '{}'); begin
  assert (r->>'total')::int = 1, format('rpg: %s', r);
  assert not (r->'rows'->0 ? 'token_hash'), format('token_hash が見える: %s', r->'rows'->0);
  assert r->'rows'->0->>'nickname' = 'タマ', format('nickname: %s', r->'rows'->0);
  assert r->'rows'->0 ? 'deco', '列を名前で並べない（あとから足した deco も出る）';
  assert admin_list('nope', '{}')->>'ok' = 'false', '知らない種類';
end $$;
reset role;

\echo '- admin_stats_today_vs_week'
-- 今日（日本時間0時、週とは別に計算）の1秒前と1秒後に1行ずつ。今日は1秒後だけ。今週は、1秒前も今週のとき（月曜でないとき）だけ1つ多い
truncate scores, daily_scores, rpg_players;
do $$ declare t0 timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'; begin
  insert into scores (board, nickname, time_ms, questions, created_at) values
    ('f2n:asia:10', 'まえ', 8000, 10, t0 - interval '1 s'), ('f2n:asia:10', 'あと', 8000, 10, t0 + interval '1 s');
  insert into daily_scores (day, nickname, correct, total, time_ms, created_at) values
    (current_date, 'まえ', 20, 20, 60000, t0 - interval '1 s'), (current_date, 'あと', 20, 20, 60000, t0 + interval '1 s');
  insert into rpg_players (token_hash, nickname, lv, dungeons, floors, created_at, updated_at) values
    ('\x11', 'まえ', 5, 1, 5, t0 - interval '1 s', t0 - interval '1 s'), ('\x12', 'あと', 5, 1, 5, t0 + interval '1 s', t0 + interval '1 s');
  perform set_config('test.prev_in_week', ((t0 - interval '1 s') >= jst_week_start())::int::text, false);
end $$;
set role authenticated;
do $$ declare r jsonb := admin_stats(); k text; w int := current_setting('test.prev_in_week')::int; begin
  assert r->'today' = '{"scores":1,"daily":1,"rpg":1}'::jsonb, format('today は0時の1秒後だけ: %s', r->'today');
  foreach k in array array['scores', 'daily', 'rpg'] loop
    assert (r->'week'->>k)::int - (r->'today'->>k)::int = w, format('%s: week %s - today %s / 期待 %s', k, r->'week'->>k, r->'today'->>k, w);
  end loop;
end $$;
reset role;

\echo '- admin_stats_today_ignores_session_timezone'
-- 接続のタイムゾーンに夏時間があっても、今日の0時は日本時間で決まる（Supabase は UTC だが、ずれない書き方にしておく）。
-- 今週の始まり（日曜 15:00 UTC）の1時間後に夏時間が始まる、POSIX 形式の作りもののタイムゾーンにする。
-- 月曜（今日の0時＝週の始まり）は、あいだに夏時間の切りかわりが入らないので、もとから同じ結果になる
do $$ declare ws timestamp := jst_week_start() at time zone 'UTC'; n int := extract(doy from ws)::int - 1; begin
  perform set_config('timezone', format('AAA0BBB,%s/%s,%s/0', n, extract(hour from ws)::int + 1, (n + 180) % 365), false);
end $$;
set role authenticated;
do $$ declare r jsonb := admin_stats(); begin
  assert r->'today' = '{"scores":1,"daily":1,"rpg":1}'::jsonb, format('夏時間のある接続（%s）で today: %s', current_setting('timezone'), r->'today');
end $$;
reset role;
reset timezone;

\echo '- list_filters'
truncate scores, daily_scores, rpg_players;
-- 時刻は今週の始まり（jst_week_start）から数える。月曜0時すぎに流しても「今週」の行が先週にこぼれない
insert into scores (board, nickname, time_ms, questions, created_at) values
  ('f2n:asia:10', 'ﾁｺ', 9000, 10, jst_week_start() + interval '1 s'),
  ('f2n:asia:10', 'ミケ', 7000, 10, jst_week_start() + interval '2 s'),
  ('f2n:asia:10', 'old', 6000, 10, jst_week_start() - interval '1 s'),
  ('n2f:all:5', 'チコ', 8000, 5, jst_week_start() + interval '3 s');
insert into daily_scores (day, nickname, correct, total, time_ms, created_at) values
  ('2026-10-01', 'A', 18, 20, 50000, now() - interval '3 min'),
  ('2026-10-01', 'B', 20, 20, 70000, now() - interval '2 min'),
  ('2026-10-01', 'C', 20, 20, 60000, now() - interval '1 min'),
  ('2026-10-02', 'D', 20, 20, 10000, now());
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, created_at) values
  ('\x01', 'P', 10, 1, 5, now() - interval '3 min'),
  ('\x02', 'Q', 10, 2, 10, now() - interval '2 min'),
  ('\x03', 'R', 10, 2, 12, now() - interval '1 min'),
  ('\x04', 'S', 30, 0, 0, now());
set role authenticated;
do $$ declare r jsonb;
  names jsonb;
begin
  r := admin_list('scores', '{}');
  assert (r->>'total')::int = 4, format('全部: %s', r->>'total');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["チコ","ミケ","ﾁｺ","old"]'::jsonb,
    format('new は新しい順: %s', r->'rows');
  r := admin_list('scores', '{"q": "ちこ"}');
  assert (r->>'total')::int = 0, 'ひらがなとカタカナは別';
  r := admin_list('scores', '{"q": "チコ"}');
  assert (r->>'total')::int = 2, format('q は NFKC で半角カナも当たる: %s', r);
  r := admin_list('scores', '{"q": "OL"}');
  assert (r->>'total')::int = 1, format('q は大文字小文字を見ない: %s', r);
  r := admin_list('scores', '{"board": "f2n:asia:10"}');
  assert (r->>'total')::int = 3, format('board: %s', r->>'total');
  r := admin_list('scores', '{"board": "f2n:asia:10", "period": "week", "sort": "best"}');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["ミケ","ﾁｺ"]'::jsonb,
    format('week・best: %s', r->'rows');
  r := admin_list('scores', '{"sort": "best", "limit": 2}');
  assert (r->>'total')::int = 4, 'total は limit の前の数';
  assert (select jsonb_agg(x->'time_ms') from jsonb_array_elements(r->'rows') x) = '[6000,7000]'::jsonb, format('best・limit: %s', r->'rows');
  r := admin_list('scores', '{"sort": "best", "limit": 2, "offset": 2}');
  assert (select jsonb_agg(x->'time_ms') from jsonb_array_elements(r->'rows') x) = '[8000,9000]'::jsonb, format('offset: %s', r->'rows');
  r := admin_list('scores', '{"limit": 0}');
  assert jsonb_array_length(r->'rows') = 1, 'limit は1より小さくならない';
  r := admin_list('scores', '{"limit": 9999, "offset": -5}');
  assert jsonb_array_length(r->'rows') = 4, 'limit は500まで・offset はマイナスにならない';
  r := admin_list('scores', '{"limit": "abc", "offset": "x"}');
  assert jsonb_array_length(r->'rows') = 4, '数でない limit は既定';
  r := admin_list('scores', null);
  assert (r->>'total')::int = 4, 'filter が null でも動く';

  r := admin_list('daily', '{"day": "2026-10-01", "sort": "best"}');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["C","B","A"]'::jsonb,
    format('daily best は正答数→タイム: %s', r->'rows');
  r := admin_list('daily', '{}');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["D","C","B","A"]'::jsonb,
    format('daily new: %s', r->'rows');
  r := admin_list('daily', '{"day": "bad"}');
  assert (r->>'total')::int = 4, format('day がおかしいときは絞らない: %s', r->>'total');

  r := admin_list('rpg', '{"sort": "best"}');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["S","R","Q","P"]'::jsonb,
    format('rpg best は lv→ダンジョン→フロア: %s', r->'rows');
  r := admin_list('rpg', '{"q": "q"}');
  assert (select jsonb_agg(x->'nickname') from jsonb_array_elements(r->'rows') x) = '["Q"]'::jsonb, format('rpg q: %s', r->'rows');
end $$;
do $$ declare r jsonb := admin_boards(); begin
  assert r = '{"ok":true,"boards":[{"board":"f2n:asia:10","n":3},{"board":"n2f:all:5","n":1}]}'::jsonb, format('boards: %s', r);
end $$;
reset role;

\echo '- delete_moves_to_trash_and_logs'
truncate scores, daily_scores, rpg_players, admin_log, admin_trash;
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'チコ', 8000, 10);
set role authenticated;
do $$ declare r jsonb; v_id bigint := (admin_list('scores', '{}')->'rows'->0->>'id')::bigint; begin
  r := admin_delete('scores', array[v_id, 123456]);
  assert r = '{"ok":true,"deleted":1}'::jsonb, format('delete: %s', r);
  assert (admin_list('scores', '{}')->>'total')::int = 0, 'scores は0件';
  r := admin_list('trash', '{}');
  assert (r->>'total')::int = 1, format('trash: %s', r);
  assert r->'rows'->0->>'kind' = 'scores', 'kind';
  assert r->'rows'->0->'row_data'->>'nickname' = 'チコ', 'row_data';
  r := admin_log_list(10, 0);
  assert (r->>'total')::int = 1, format('log: %s', r);
  assert r->'rows'->0->>'action' = 'delete', 'action';
  assert r->'rows'->0->>'kind' = 'scores', 'kind';
  assert r->'rows'->0->>'user_id' = '00000000-0000-0000-0000-00000000000a', 'user_id';
  assert r->'rows'->0->'detail'->'ids' @> to_jsonb(array[v_id]), format('detail: %s', r->'rows'->0->'detail');
  assert jsonb_array_length(admin_stats()->'recent_log') = 1, 'stats の recent_log';
  assert admin_delete('nope', array[1::bigint])->>'ok' = 'false', '知らない種類';
end $$;
reset role;
do $$ begin
  assert (select count(*) from scores) = 0, 'scores 0件';
  assert (select count(*) from admin_trash) = 1, 'trash 1件';
  assert (select count(*) from admin_log where action = 'delete') = 1, 'admin_log 1件';
end $$;

\echo '- delete_rpg_keeps_token_hidden'
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\xabcd', 'タマ', 5, 1, 5);
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_delete('rpg', array[(admin_list('rpg', '{}')->'rows'->0->>'id')::bigint]);
  assert r->>'deleted' = '1', format('rpg delete: %s', r);
  r := admin_list('trash', '{}');
  assert (r->>'total')::int = 2, format('trash 2件: %s', r->>'total');
  assert r->'rows'->0->>'kind' = 'rpg', 'rpg が新しい順で先';
  assert not (r->'rows'->0->'row_data' ? 'token_hash'), format('trash の row_data に token_hash が見える: %s', r->'rows'->0);
end $$;
reset role;

\echo '- restore_brings_back_same_id'
-- 30日より古い・戻したものは trash の一覧に出ない
insert into admin_trash (kind, row_data, at) values ('scores', '{"id": 777, "board": "f2n:asia:10", "nickname": "古い", "time_ms": 9000, "questions": 10, "created_at": "2026-01-01T00:00:00Z"}', now() - interval '31 days');
set role authenticated;
do $$ declare r jsonb; t jsonb; v_before jsonb; begin
  r := admin_list('trash', '{}');
  assert (r->>'total')::int = 2, format('31日前のものは出ない: %s', r->>'total');
  t := r->'rows'->1;  -- scores の行
  assert t->>'kind' = 'scores', format('2つ目は scores: %s', t);
  v_before := t->'row_data';
  r := admin_restore(array[(t->>'id')::bigint, (r->'rows'->0->>'id')::bigint]);
  assert r = '{"ok":true,"restored":2,"failed":0}'::jsonb, format('restore: %s', r);
  r := admin_list('scores', '{}');
  assert (r->>'total')::int = 1, 'scores が戻った';
  assert r->'rows'->0 = v_before, format('同じ id・同じ値: %s / %s', r->'rows'->0, v_before);
  assert (admin_list('trash', '{}')->>'total')::int = 0, '戻したものは trash に出ない';
  r := admin_restore(array[(t->>'id')::bigint]);
  assert r = '{"ok":true,"restored":0,"failed":1}'::jsonb, format('2回目は戻せない: %s', r);
  assert (admin_log_list(10, 0)->'rows'->0->>'action') = 'restore', 'restore も log に残す';
end $$;
reset role;
do $$ begin
  assert (select count(*) from admin_trash where restored_at is not null) = 2, 'restored_at が入る';
  assert (select token_hash from rpg_players where nickname = 'タマ') = '\xabcd'::bytea, 'rpg の合言葉も戻る';
end $$;
-- 戻したあとも新しい行はふつうに入る（id がぶつからない）
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'next', 8000, 10);

\echo '- restore_conflict_counts_failed'
truncate scores, daily_scores, rpg_players, admin_log, admin_trash;
insert into daily_scores (day, nickname, correct, total, time_ms) values ('2026-10-01', 'チコ', 20, 20, 60000), ('2026-10-01', 'ミケ', 19, 20, 60000);
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_delete('daily', (select array_agg((x->>'id')::bigint) from jsonb_array_elements(admin_list('daily', '{}')->'rows') x));
  assert r->>'deleted' = '2', format('daily delete: %s', r);
end $$;
reset role;
insert into daily_scores (day, nickname, correct, total, time_ms) values ('2026-10-01', 'ﾁｺ', 5, 20, 90000);  -- 同じ日・同じ名前（NFKC）
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_restore((select array_agg((x->>'id')::bigint) from jsonb_array_elements(admin_list('trash', '{}')->'rows') x));
  assert r = '{"ok":true,"restored":1,"failed":1}'::jsonb, format('ぶつかった1件は戻さず、ほかは戻す: %s', r);
  assert (admin_list('trash', '{}')->'rows'->0->'row_data'->>'nickname') = 'チコ', '戻せなかったものは trash に残る';
end $$;
reset role;
do $$ begin
  assert (select array_agg(nickname order by nickname) from daily_scores) = array['ミケ', 'ﾁｺ'], format('daily: %s', (select array_agg(nickname) from daily_scores));
end $$;
-- 同じ id の行がもうある
truncate admin_trash;
insert into admin_trash (kind, row_data) select 'daily', to_jsonb(d) || '{"nickname": "別"}' from daily_scores d where nickname = 'ミケ';
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_restore((select array_agg((x->>'id')::bigint) from jsonb_array_elements(admin_list('trash', '{}')->'rows') x));
  assert r = '{"ok":true,"restored":0,"failed":1}'::jsonb, format('同じ id: %s', r);
end $$;
reset role;

\echo '- restore_rpg_refuses_same_normalized_name'
truncate scores, daily_scores, rpg_players, admin_log, admin_trash;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x11', 'Taro', 5, 1, 5), ('\x12', 'Hana', 5, 1, 5);
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_delete('rpg', (select array_agg((x->>'id')::bigint) from jsonb_array_elements(admin_list('rpg', '{}')->'rows') x));
  assert r->>'deleted' = '2', format('rpg delete: %s', r);
end $$;
reset role;
-- 消したあいだに、NFKC＋小文字で同じ名前（ＴＡＲＯ → taro）で別の人が登録した
do $$ declare r jsonb := rpg_register('00000000-0000-4000-8000-0000000000aa', 'ＴＡＲＯ', 1, 0, 0); begin
  assert r->>'ok' = 'true', format('Taro が消えたので ＴＡＲＯ は登録できる: %s', r);
end $$;
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_restore((select array_agg((x->>'id')::bigint) from jsonb_array_elements(admin_list('trash', '{}')->'rows') x));
  assert r = '{"ok":true,"restored":1,"failed":1}'::jsonb, format('同じ名前（NFKC＋小文字）は戻さない: %s', r);
  assert (admin_list('trash', '{}')->'rows'->0->'row_data'->>'nickname') = 'Taro', '戻せなかった Taro は trash に残る';
end $$;
reset role;
do $$ begin
  assert (select array_agg(nickname order by nickname) from rpg_players) = array['Hana', 'ＴＡＲＯ'], format('rpg: %s', (select array_agg(nickname) from rpg_players));
end $$;

\echo '- restore_ignores_trash_older_than_30_days'
truncate scores, admin_trash restart identity;  -- trash の id は 1（40日前）と 2（29日前）
insert into admin_trash (kind, row_data, at) values
  ('scores', '{"id": 801, "board": "f2n:asia:10", "nickname": "古い", "time_ms": 9000, "questions": 10, "created_at": "2026-01-01T00:00:00Z"}', now() - interval '40 days'),
  ('scores', '{"id": 802, "board": "f2n:asia:10", "nickname": "新しい", "time_ms": 9000, "questions": 10, "created_at": "2026-01-01T00:00:00Z"}', now() - interval '29 days');
set role authenticated;
do $$ declare r jsonb; begin
  assert (admin_list('trash', '{}')->>'total')::int = 1, '40日前のものは一覧に出ない';
  r := admin_restore(array[1, 2]::bigint[]);
  assert r = '{"ok":true,"restored":1,"failed":1}'::jsonb, format('40日前のものは戻さない: %s', r);
end $$;
reset role;
do $$ begin
  assert (select array_agg(nickname) from scores) = array['新しい'], format('scores: %s', (select array_agg(nickname) from scores));
  assert (select restored_at from admin_trash where (row_data->>'id') = '801') is null, '古いものは restored_at も入らない';
end $$;

\echo '- delete_nothing_writes_no_log'
truncate admin_log;
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_delete('scores', array[987654::bigint]);
  assert r = '{"ok":true,"deleted":0}'::jsonb, format('0件: %s', r);
  r := admin_delete('rpg', array[]::bigint[]);
  assert r = '{"ok":true,"deleted":0}'::jsonb, format('空の配列: %s', r);
end $$;
reset role;
do $$ begin
  assert (select count(*) from admin_log) = 0, format('0件のときは log に残さない: %s', (select count(*) from admin_log));
end $$;

\echo '- rename_trims_same_chars_as_schema'
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'trim', 8000, 10);
set role authenticated;
do $$ declare r jsonb; begin
  -- NBSP・全角空白・BOM・ゼロ幅でない空白（U+2009）を前後に付ける
  r := admin_rename('scores', (admin_list('scores', '{"q": "trim"}')->'rows'->0->>'id')::bigint,
                    chr(160) || chr(12288) || ' ハチ' || chr(8201) || chr(65279));
  assert r = '{"ok":true,"nickname":"ハチ"}'::jsonb, format('trim: %s', r);
end $$;
reset role;
do $$ begin
  -- 文字の並びが schema.sql の submit_score と同じ（\u で書いてある）
  assert position(
    (select substring(prosrc from 'btrim\(p_nickname, E''([^'']*)''') from pg_proc where proname = 'submit_score')
    in (select prosrc from pg_proc where proname = 'admin_rename')) > 0, 'admin_rename の trim 文字は submit_score と同じ';
end $$;

\echo '- rename_rules'
truncate scores, daily_scores, rpg_players, admin_log, admin_trash;
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'チコ', 8000, 10);
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x01', 'タマ', 5, 1, 5), ('\x02', 'ミケ', 5, 1, 5);
set role authenticated;
do $$ declare r jsonb; v_s bigint; v_r bigint; begin
  v_s := (admin_list('scores', '{}')->'rows'->0->>'id')::bigint;
  v_r := (admin_list('rpg', '{"q": "タマ"}')->'rows'->0->>'id')::bigint;
  assert admin_rename('scores', v_s, '') = '{"ok":false,"reason":"bad_name"}'::jsonb, '空';
  assert admin_rename('scores', v_s, '　 ')->>'reason' = 'bad_name', '空白だけ';
  assert admin_rename('scores', v_s, 'あいうえおかきくけこさしす')->>'reason' = 'bad_name', '13文字';
  assert admin_rename('scores', v_s, 'ＦＵＣＫ')->>'reason' = 'ng_name', 'NG';
  assert admin_rename('rpg', v_r, 'ﾐｹ')->>'reason' = 'name_taken', 'rpg で他人の名前（NFKC）';
  assert admin_rename('rpg', v_r, 'たま')->>'ok' = 'true', 'ひらがなは別の名前';
  assert admin_rename('rpg', v_r, 'タマ')->>'ok' = 'true', '自分の名前に戻すのは ok';
  assert admin_rename('scores', 999999, 'ハチ')->>'reason' = 'not_found', 'ない行';
  assert admin_rename('nope', v_s, 'ハチ')->>'ok' = 'false', '知らない種類';
  r := admin_rename('scores', v_s, ' ハチ ');
  assert r = '{"ok":true,"nickname":"ハチ"}'::jsonb, format('rename: %s', r);
  r := admin_rename('rpg', v_r, null);
  assert r->>'nickname' ~ '^名無しの旅人[0-9]{3}$', format('null は名無し: %s', r);
  assert admin_list('rpg', '{"sort": "best", "q": "名無し"}')->'rows'->0->>'nickname' = r->>'nickname', '保存された';
  r := admin_log_list(1, 0);
  assert r->'rows'->0->>'action' = 'rename', format('log: %s', r);
  assert r->'rows'->0->'detail'->>'before' = 'タマ' and r->'rows'->0->'detail'->>'after' ~ '^名無しの旅人', format('detail: %s', r->'rows'->0->'detail');
  r := admin_log_list(10, 0);
  assert (r->>'total')::int = 4, format('成功した rename だけ log（たま・タマ・ハチ・名無し）: %s', r->>'total');
  assert jsonb_array_length(admin_log_list(2, 1)->'rows') = 2, 'limit・offset';
end $$;
reset role;
do $$ begin
  assert (select nickname from scores) = 'ハチ', 'scores の名前が変わった';
  assert (select count(*) from admin_log where action = 'rename' and detail ? 'before' and detail ? 'after') = 4, 'before / after';
end $$;
-- rpg で名無しが全部うまっていても止まらない（何回か振り直してから name_taken）
insert into rpg_players (token_hash, nickname, lv, dungeons, floors)
  select int4send(i + 100), '名無しの旅人' || lpad(i::text, 3, '0'), 1, 0, 0 from generate_series(0, 999) i
  on conflict (nickname) do nothing;  -- さっき付いた名無しの1つはもうある
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_rename('rpg', (admin_list('rpg', '{"q": "ミケ"}')->'rows'->0->>'id')::bigint, null);
  assert r = '{"ok":false,"reason":"name_taken"}'::jsonb, format('全部うまっている: %s', r);
end $$;
reset role;

\echo '- delete_purges_trash_older_than_30_days'
truncate scores, admin_log, admin_trash;
insert into admin_trash (kind, row_data, at) values
  ('scores', '{"id": 901, "nickname": "とても古い"}', now() - interval '31 days'),
  ('scores', '{"id": 902, "nickname": "まだ戻せる"}', now() - interval '29 days');
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'けす', 8000, 10);
set role authenticated;
do $$ declare r jsonb; begin
  r := admin_delete('scores', array[(admin_list('scores', '{}')->'rows'->0->>'id')::bigint]);
  assert r->>'deleted' = '1', format('delete: %s', r);
end $$;
reset role;
do $$ begin
  assert (select array_agg(row_data->>'nickname' order by id) from admin_trash) = array['まだ戻せる', 'けす'],
    format('31日前のごみだけ消える: %s', (select array_agg(row_data->>'nickname') from admin_trash));
end $$;

\echo 'ALL ADMIN SQL TESTS PASSED'
