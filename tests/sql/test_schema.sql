-- supabase/schema.sql のテスト。tests/sql/run.sh から流す（1つでも ASSERT が落ちたらそこで止まる）
-- 各テストは superuser で truncate → 必要なら直接 insert → set role anon で関数を呼ぶ（権限の確認も兼ねる）

\echo '- accepts_valid'
reset role; truncate scores; set role anon;
do $$ declare r jsonb := submit_score('f2n:asia:10', 'チコ', 8000, 10); begin
  assert r = '{"ok":true,"rank_all":1,"rank_week":1}'::jsonb, format('accepts_valid: %s', r);
end $$;
reset role;
do $$ begin
  assert (select count(*) from scores) = 1, 'accepts_valid: 1行入る';
  assert (select row(board, nickname, time_ms, questions)::text from scores) = '(f2n:asia:10,チコ,8000,10)',
    format('accepts_valid: 保存値 %s', (select row(board, nickname, time_ms, questions)::text from scores));
  assert (select created_at from scores) > now() - interval '1 minute', 'accepts_valid: created_at はサーバー時刻';
end $$;

\echo '- bad_board'
reset role; truncate scores; set role anon;
do $$ begin
  assert submit_score('x:asia:10', 'チコ', 8000, 10)->>'reason' = 'bad_board', 'x:asia:10';
  assert submit_score('f2n:mars:10', 'チコ', 8000, 10)->>'reason' = 'bad_board', 'f2n:mars:10';
  assert submit_score('f2n:asia:7', 'チコ', 8000, 10)->>'reason' = 'bad_board', 'f2n:asia:7';
  assert submit_score('f2n:asia:10', 'チコ', 8000, 9)->>'reason' = 'bad_board', 'f2n:asia:10 で 9問';
  assert submit_score('f2n:asia:10:x', 'チコ', 8000, 10)->>'reason' = 'bad_board', '区切りが多い';
  assert submit_score('F2N:asia:10', 'チコ', 8000, 10)->>'reason' = 'bad_board', '大文字';
  assert submit_score('f2n:asia:abc', 'チコ', 8000, 10)->>'reason' = 'bad_board', '問題数が数字でない';
  assert submit_score('', 'チコ', 8000, 10)->>'reason' = 'bad_board', '空の board';
  assert submit_score(null, 'チコ', 8000, 10)->>'reason' = 'bad_board', 'board が null';
  assert submit_score('f2n:asia:10', 'チコ', 8000, null)->>'reason' = 'bad_board', 'questions が null';
  assert (submit_score('f2n:asia:10', 'チコ', 8000, 9)->>'ok')::boolean = false, 'ok=false';
end $$;
reset role;
do $$ begin assert (select count(*) from scores) = 0, 'bad_board: 何も入らない'; end $$;

\echo '- all_count_accepts_region_size'
reset role; truncate scores; set role anon;
do $$ declare r jsonb; begin
  r := submit_score('f2n:oceania:all', 'チコ', 8000, 14);
  assert (r->>'ok')::boolean, format('oceania 全部=14問: %s', r);
  assert submit_score('f2n:oceania:all', 'ミケ', 8000, 0)->>'reason' = 'bad_board', '0問';
  assert submit_score('f2n:oceania:all', 'ミケ', 80000, 196)->>'reason' = 'bad_board', '196問';
  r := submit_score('m2f:all:all', 'ミケ', 100000, 195);
  assert (r->>'ok')::boolean, format('全世界 全部=195問: %s', r);
end $$;

\echo '- name_rules'
reset role; truncate scores; set role anon;
do $$ declare r jsonb; begin
  assert submit_score('f2n:asia:10', '', 8000, 10)->>'reason' = 'bad_name', '空';
  assert submit_score('f2n:asia:10', '   ', 8000, 10)->>'reason' = 'bad_name', '空白だけ';
  assert submit_score('f2n:asia:10', '　　', 8000, 10)->>'reason' = 'bad_name', '全角空白だけ';
  assert submit_score('f2n:asia:10', null, 8000, 10)->>'reason' = 'bad_name', 'null';
  assert submit_score('f2n:asia:10', 'あいうえおかきくけこさしす', 8000, 10)->>'reason' = 'bad_name', '13文字';
  assert submit_score('f2n:asia:10', 'ＦＵＣＫ', 8000, 10)->>'reason' = 'ng_name', '全角 FUCK';
  assert submit_score('f2n:asia:10', 'Admin太郎', 8000, 10)->>'reason' = 'ng_name', '大文字まじり admin';
  assert submit_score('f2n:asia:10', 'ｼﾈ', 8000, 10)->>'reason' = 'ng_name', '半角カナ シネ';
  assert submit_score('f2n:asia:10', 'あいうえおかきくけこさしす', 3000, 10)->>'reason' = 'bad_name', '名前の判定はタイムより先';
  r := submit_score('f2n:asia:10', ' チコ ', 8000, 10);
  assert (r->>'ok')::boolean, format('前後空白つき: %s', r);
  r := submit_score('f2n:asia:10', '　ミケ　', 8000, 10);
  assert (r->>'ok')::boolean, format('前後全角空白つき: %s', r);
  r := submit_score('f2n:asia:10', repeat('🇯🇵', 6), 8000, 10);
  assert (r->>'ok')::boolean, format('12コードポイント: %s', r);
end $$;
reset role;
do $$ begin
  assert (select array_agg(nickname order by id) from scores) = array['チコ', 'ミケ', repeat('🇯🇵', 6)],
    format('name_rules: 保存値 %s', (select array_agg(nickname order by id) from scores));
end $$;

\echo '- too_fast_too_slow'
reset role; truncate scores; set role anon;
do $$ declare r jsonb; begin
  assert submit_score('f2n:asia:10', 'チコ', 3999, 10)->>'reason' = 'too_fast', '3999ms';
  r := submit_score('f2n:asia:10', 'チコ', 4000, 10);
  assert (r->>'ok')::boolean, format('4000ms: %s', r);
  assert submit_score('f2n:asia:10', 'ミケ', 10800001, 10)->>'reason' = 'too_slow', '10800001ms';
  r := submit_score('f2n:asia:10', 'ミケ', 10800000, 10);
  assert (r->>'ok')::boolean, format('10800000ms: %s', r);
  assert submit_score('f2n:asia:10', 'ハチ', null, 10)->>'reason' = 'too_fast', 'time_ms が null';
  assert submit_score('f2n:asia:all', 'ハチ', 18399, 46)->>'reason' = 'too_fast', '全部は実際の問題数で判定';
end $$;

\echo '- too_soon'
reset role; truncate scores; set role anon;
do $$ declare r jsonb; begin
  r := submit_score('f2n:asia:10', 'チコ', 8000, 10);
  assert (r->>'ok')::boolean, format('1回目: %s', r);
  r := submit_score('f2n:asia:10', 'チコ', 7000, 10);
  assert r->>'reason' = 'too_soon', format('2回目: %s', r);
  r := submit_score('f2n:asia:10', ' チコ ', 7000, 10);
  assert r->>'reason' = 'too_soon', format('前後空白を付けてもだめ: %s', r);
  r := submit_score('f2n:asia:10', 'ミケ', 7000, 10);
  assert (r->>'ok')::boolean, format('別の名前なら ok: %s', r);
  r := submit_score('f2n:asia:20', 'チコ', 9000, 20);
  assert (r->>'ok')::boolean, format('別の board なら ok: %s', r);
end $$;
reset role; update scores set created_at = created_at - interval '11 seconds'; set role anon;
do $$ declare r jsonb := submit_score('f2n:asia:10', 'チコ', 7000, 10); begin
  assert (r->>'ok')::boolean, format('11秒たったら ok: %s', r);
end $$;

\echo '- best_per_name'
reset role; truncate scores; set role anon;
do $$ begin assert (submit_score('f2n:asia:10', 'チコ', 9000, 10)->>'ok')::boolean, 'チコ 9000'; end $$;
reset role; update scores set created_at = created_at - interval '11 seconds'; set role anon;
do $$ declare r jsonb; begin
  r := submit_score('f2n:asia:10', 'チコ', 8000, 10);
  assert r = '{"ok":true,"rank_all":1,"rank_week":1}'::jsonb, format('チコ 8000: %s', r);
  r := submit_score('f2n:asia:10', 'ミケ', 8500, 10);
  assert r = '{"ok":true,"rank_all":2,"rank_week":2}'::jsonb, format('ミケ 8500: %s', r);
  assert (select count(*) from top_scores('f2n:asia:10', 'all')) = 2, '同名は1件にまとまる';
  assert (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'all')) = array['(チコ,8000)', '(ミケ,8500)'],
    format('速い順: %s', (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'all')));
  assert (select count(*) from top_scores('f2n:asia:10', 'all') where created_at is null) = 0, 'created_at が返る';
  assert (select count(*) from top_scores('f2n:asia:10', 'week')) = 2, 'week も同じ';
  assert (select count(*) from top_scores('f2n:asia:10', 'month')) = 0, 'all/week 以外は空';
  assert (select count(*) from top_scores('f2n:asia:10', null)) = 0, 'null は空';
  assert (select count(*) from top_scores('f2n:asia:20', 'all')) = 0, '別の board は空';
end $$;

\echo '- week_boundary'
reset role; truncate scores;
-- 今週の月曜0時（日本時間）を、実装とは別の計算で出して、その前後に記録を置く
do $$ declare ws timestamptz := ((now() at time zone 'Asia/Tokyo')::date
                                 - (extract(isodow from now() at time zone 'Asia/Tokyo')::int - 1))::timestamp at time zone 'Asia/Tokyo';
begin
  assert extract(isodow from ws at time zone 'Asia/Tokyo') = 1 and (ws at time zone 'Asia/Tokyo')::time = '00:00', 'ws は月曜0時';
  insert into scores (board, nickname, time_ms, questions, created_at) values
    ('f2n:asia:10', 'sun', 8000, 10, ws - interval '1 minute'),  -- 先週日曜 23:59 JST
    ('f2n:asia:10', 'sun', 9500, 10, ws + interval '1 minute'),  -- 同じ人の今週の記録（遅い）
    ('f2n:asia:10', 'mon', 9000, 10, ws);                        -- 今週月曜 00:00 JST
end $$;
set role anon;
do $$ begin
  assert (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'week')) = array['(mon,9000)', '(sun,9500)'],
    format('week: %s', (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'week')));
  assert (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'all')) = array['(sun,8000)', '(mon,9000)'],
    format('all: %s', (select array_agg(row(nickname, time_ms)::text) from top_scores('f2n:asia:10', 'all')));
  assert rank_of('f2n:asia:10', 9200) = '{"rank_all":3,"rank_week":2}'::jsonb, format('rank_of 9200: %s', rank_of('f2n:asia:10', 9200));
end $$;

\echo '- jst_week_start'
reset role;
-- week_boundary と同じ別計算の月曜0時（日本時間）と一致し、日本時間の区切りはこの関数1か所にだけ書いてある
do $$ declare ws timestamptz := ((now() at time zone 'Asia/Tokyo')::date
                                 - (extract(isodow from now() at time zone 'Asia/Tokyo')::int - 1))::timestamp at time zone 'Asia/Tokyo';
begin
  assert jst_week_start() = ws, format('jst_week_start: %s / 期待 %s', jst_week_start(), ws);
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%Asia/Tokyo%') = 1,
    format('Asia/Tokyo を書いている関数: %s',
      (select string_agg(proname, ', ') from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%Asia/Tokyo%'));
end $$;

\echo '- functions_pin_search_path'
reset role;
-- security definer の関数（と、そこから呼ぶ関数）は search_path を public, pg_temp に固定する
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as name, p.proconfig from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and p.proname in ('ng_words', 'jst_week_start', 'rank_of', 'submit_score', 'top_scores') loop
    assert f.proconfig = array['search_path=public, pg_temp'], format('%s: %s', f.name, f.proconfig);
  end loop;
  assert (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('ng_words', 'jst_week_start', 'rank_of', 'submit_score', 'top_scores')) = 5, '5つともある';
  assert (select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
          and proname in ('rank_of', 'submit_score', 'top_scores')), 'anon が呼ぶ3つは security definer';
end $$;

\echo '- rank_of_counts_faster_bests'
reset role; truncate scores;
insert into scores (board, nickname, time_ms, questions) values
  ('f2n:asia:10', 'a', 7000, 10), ('f2n:asia:10', 'a', 7600, 10),
  ('f2n:asia:10', 'b', 8000, 10), ('f2n:asia:10', 'b', 8100, 10),
  ('f2n:asia:10', 'c', 9000, 10),
  ('f2n:asia:20', 'd', 5000, 20);
set role anon;
do $$ begin
  assert rank_of('f2n:asia:10', 8500) = '{"rank_all":3,"rank_week":3}'::jsonb, format('8500: %s', rank_of('f2n:asia:10', 8500));
  assert rank_of('f2n:asia:10', 8000) = '{"rank_all":2,"rank_week":2}'::jsonb, format('同タイムは数えない: %s', rank_of('f2n:asia:10', 8000));
  assert rank_of('f2n:asia:10', 6000) = '{"rank_all":1,"rank_week":1}'::jsonb, format('6000: %s', rank_of('f2n:asia:10', 6000));
  assert rank_of('f2n:asia:10', 99999) = '{"rank_all":4,"rank_week":4}'::jsonb, format('99999: %s', rank_of('f2n:asia:10', 99999));
  assert rank_of('f2n:europe:10', 8500) = '{"rank_all":1,"rank_week":1}'::jsonb, '記録のない board は1位';
end $$;

\echo '- limit_50'
reset role; truncate scores;
insert into scores (board, nickname, time_ms, questions)
  select 'f2n:asia:10', 'p' || i, 10000 + i * 10, 10 from generate_series(60, 1, -1) i;
set role anon;
do $$ begin
  assert (select count(*) from top_scores('f2n:asia:10', 'all')) = 50, '歴代は50件';
  assert (select count(*) from top_scores('f2n:asia:10', 'week')) = 50, '今週も50件';
  assert (select array_agg(time_ms) from top_scores('f2n:asia:10', 'all')) =
         (select array_agg(10000 + i * 10 order by i) from generate_series(1, 50) i), '速い順の上位50件';
end $$;

\echo '- anon_cannot_touch_table'
reset role;
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.scores'::regclass), 'RLS が有効';
  assert (select count(*) from pg_policies where tablename = 'scores') = 0, 'ポリシーは作らない';
end $$;
set role anon;
do $$ begin
  begin perform * from scores; raise exception 'anon が select できた';
  exception when insufficient_privilege then null; end;
  begin insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'x', 8000, 10); raise exception 'anon が insert できた';
  exception when insufficient_privilege then null; end;
  begin delete from scores; raise exception 'anon が delete できた';
  exception when insufficient_privilege then null; end;
  begin update scores set time_ms = 1; raise exception 'anon が update できた';
  exception when insufficient_privilege then null; end;
end $$;

\echo '- anon_cannot_call_helpers'
set role anon;
do $$ begin
  begin perform ng_words(); raise exception 'anon が ng_words() を呼べた';
  exception when insufficient_privilege then null; end;
  begin perform jst_week_start(); raise exception 'anon が jst_week_start() を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- 冒険のランキング（1人1行・合言葉で更新と名前の変更） ----
-- 10秒の連投よけを飛ばすため、テストでは superuser で updated_at を昔にする
\echo '- rpg_register'
reset role; truncate rpg_players; set role anon;
do $$ declare r jsonb := rpg_register('00000000-0000-4000-8000-000000000001', 'チコ', 12, 2, 13); begin
  assert r = '{"ok":true,"rank_lv":1,"rank_dg":1}'::jsonb, format('register: %s', r);
  assert rpg_register('00000000-0000-4000-8000-000000000001', 'ミケ', 12, 2, 13)->>'reason' = 'already', '同じ合言葉で別の名前はだめ';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'チコ', 1, 0, 0)->>'reason' = 'name_taken', 'ほかの人と同じ名前はだめ';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ﾁｺ', 1, 0, 0)->>'reason' = 'name_taken', '全角半角をそろえても同じ';
  assert rpg_register('00000000-0000-4000-8000-000000000002', ' チコ ', 1, 0, 0)->>'reason' = 'name_taken', '前後空白を除くと同じ';
  assert rpg_register('abc', 'ミケ', 1, 0, 0)->>'reason' = 'bad_token', '短い合言葉';
  assert rpg_register(null, 'ミケ', 1, 0, 0)->>'reason' = 'bad_token', 'null の合言葉';
  assert rpg_register('00000000-0000-4000-8000-000000000002', '', 1, 0, 0)->>'reason' = 'bad_name', '空の名前';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'あいうえおかきくけこさしす', 1, 0, 0)->>'reason' = 'bad_name', '13文字';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ＦＵＣＫ', 1, 0, 0)->>'reason' = 'ng_name', 'NG';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 0, 0, 0)->>'reason' = 'bad_record', 'Lv0';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 51, 0, 0)->>'reason' = 'bad_record', 'Lv51';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 8, 35)->>'reason' = 'bad_record', 'ダンジョン8';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 0, 36)->>'reason' = 'bad_record', 'フロア36';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 2, 9)->>'reason' = 'bad_record', 'ダンジョン2なのにフロア9';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', null, 0, 0)->>'reason' = 'bad_record', 'null';
end $$;
reset role;
do $$ begin
  assert (select count(*) from rpg_players) = 1, '1行だけ';
  assert (select row(nickname, lv, dungeons, floors)::text from rpg_players) = '(チコ,12,2,13)', '保存値';
  assert (select token_hash from rpg_players) = sha256(convert_to('00000000-0000-4000-8000-000000000001', 'UTF8')), '合言葉はハッシュで残す';
end $$;

\echo '- rpg_update'
reset role; update rpg_players set updated_at = now() - interval '1 minute'; set role anon;
do $$ declare r jsonb; begin
  assert rpg_update('00000000-0000-4000-8000-000000000002', 13, 2, 13)->>'reason' = 'not_found', '登録していない合言葉';
  assert rpg_update('00000000-0000-4000-8000-000000000001', 13, 8, 13)->>'reason' = 'bad_record', 'おかしい記録';
  r := rpg_update('00000000-0000-4000-8000-000000000001', 13, 1, 9);   -- レベルは上がって、ダンジョン・フロアは下がった（引き継ぎなど）→ それぞれ最高を残す
  assert r = '{"ok":true,"rank_lv":1,"rank_dg":1}'::jsonb, format('update: %s', r);
  assert rpg_update('00000000-0000-4000-8000-000000000001', 14, 2, 13)->>'reason' = 'too_soon', '10秒以内はだめ';
end $$;
reset role;
do $$ begin
  assert (select row(nickname, lv, dungeons, floors)::text from rpg_players) = '(チコ,13,2,13)', format('最高を残す: %s', (select row(nickname, lv, dungeons, floors)::text from rpg_players));
end $$;

\echo '- rpg_rename'
reset role; update rpg_players set updated_at = now() - interval '1 minute'; set role anon;
do $$ declare r jsonb; begin
  r := rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 3, 0, 0);
  assert (r->>'ok')::boolean, format('2人目: %s', r);
  assert rpg_rename('00000000-0000-4000-8000-000000000001', 'ミケ')->>'reason' = 'name_taken', 'ほかの人の名前にはできない';
  assert rpg_rename('00000000-0000-4000-8000-000000000003', 'タマ')->>'reason' = 'not_found', '登録していない';
  assert rpg_rename('00000000-0000-4000-8000-000000000001', 'ＦＵＣＫ')->>'reason' = 'ng_name', 'NG';
  assert rpg_rename('00000000-0000-4000-8000-000000000001', '') ->>'reason' = 'bad_name', '空';
  r := rpg_rename('00000000-0000-4000-8000-000000000001', 'チコ2');
  assert r = '{"ok":true,"nickname":"チコ2"}'::jsonb, format('rename: %s', r);
  assert rpg_rename('00000000-0000-4000-8000-000000000001', 'チコ3')->>'reason' = 'too_soon', '10秒以内はだめ';
  assert rpg_register('00000000-0000-4000-8000-000000000003', 'チコ', 1, 0, 0)->>'ok' = 'true', '前の名前はあく';
end $$;
reset role;
do $$ begin
  assert (select row(lv, dungeons, floors)::text from rpg_players where nickname = 'チコ2') = '(13,2,13)', '名前を変えても記録はそのまま';
  assert (select count(*) from rpg_players) = 3, '3人';
end $$;

\echo '- rpg_top_and_rank'
reset role; truncate rpg_players;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, created_at) values
  ('\x01', 'A', 20, 1, 7, now() - interval '5 min'),
  ('\x02', 'B', 25, 0, 4, now() - interval '3 min'),
  ('\x03', 'C', 20, 1, 7, now() - interval '2 min'),   -- A と同じ記録なら先に載せた A が上
  ('\x04', 'D', 10, 3, 16, now() - interval '1 min');
set role anon;
do $$ begin
  assert (select array_agg(nickname) from top_rpg('lv')) = array['B', 'A', 'C', 'D'], format('lv: %s', (select array_agg(nickname) from top_rpg('lv')));
  assert (select array_agg(nickname) from top_rpg('dg')) = array['D', 'A', 'C', 'B'], format('dg: %s', (select array_agg(nickname) from top_rpg('dg')));
  assert (select count(*) from top_rpg('x')) = 0, '知らない並べ方は空';
  assert (select count(*) from top_rpg(null)) = 0, 'null は空';
  assert rpg_rank_of(21, 0, 0) = '{"rank_lv":2,"rank_dg":5}'::jsonb, format('rank: %s', rpg_rank_of(21, 0, 0));
  assert rpg_rank_of(20, 1, 7)->>'rank_lv' = '2', '同じ記録は数えない';
end $$;
reset role; truncate rpg_players;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) select int4send(i), 'p' || i, i % 50 + 1, 0, 0 from generate_series(1, 60) i;
set role anon;
do $$ begin assert (select count(*) from top_rpg('lv')) = 50, '50件まで'; end $$;

\echo '- rpg_anon_cannot_touch_table'
reset role;
do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.rpg_players'::regclass), 'RLS が有効';
  assert to_regprocedure('public.submit_rpg(text, int, int, int)') is null, '前の submit_rpg は無い';
end $$;
set role anon;
do $$ begin
  begin perform * from rpg_players; raise exception 'anon が select できた';
  exception when insufficient_privilege then null; end;
  begin insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x09', 'x', 1, 0, 0); raise exception 'anon が insert できた';
  exception when insufficient_privilege then null; end;
  begin perform rpg_hash('00000000-0000-4000-8000-000000000001'); raise exception 'anon が rpg_hash を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo 'ALL SQL TESTS PASSED'
