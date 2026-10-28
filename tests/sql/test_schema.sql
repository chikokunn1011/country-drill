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
-- week_boundary と同じ別計算の月曜0時（日本時間）と一致し、日本時間の区切りは週（jst_week_start）と今日の難問（daily_day_open）の2か所にだけ書いてある
do $$ declare ws timestamptz := ((now() at time zone 'Asia/Tokyo')::date
                                 - (extract(isodow from now() at time zone 'Asia/Tokyo')::int - 1))::timestamp at time zone 'Asia/Tokyo';
begin
  assert jst_week_start() = ws, format('jst_week_start: %s / 期待 %s', jst_week_start(), ws);
  assert (select string_agg(proname, ', ' order by proname) from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%Asia/Tokyo%') = 'daily_day_open, jst_week_start',
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
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 100, 0, 0)->>'reason' = 'bad_record', 'Lv100';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 22, 110)->>'reason' = 'bad_record', 'ダンジョン22';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 0, 106)->>'reason' = 'bad_record', 'フロア106';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', 5, 2, 9)->>'reason' = 'bad_record', 'ダンジョン2なのにフロア9';
  assert rpg_register('00000000-0000-4000-8000-000000000002', 'ミケ', null, 0, 0)->>'reason' = 'bad_record', 'null';
end $$;
reset role;
-- 鏡の地球（14ダンジョン・70フロア）を全部、第3章の分（21・105）まで受け付ける。1行だけのテストを崩さないよう関数を直接見る
do $$ begin
  assert rpg_record_ok(69, 14, 70), '鏡の地球を全部';
  assert rpg_record_ok(99, 21, 105), 'Lv99・第3章まで全部';
  assert not rpg_record_ok(100, 0, 0), 'Lv100';
  assert not rpg_record_ok(5, 22, 110), 'ダンジョン22';
  assert not rpg_record_ok(5, 0, 106), 'フロア106';
  assert not rpg_record_ok(5, 15, 70), 'ダンジョン15なのにフロア70';
end $$;
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

\echo '- rpg_unregister'
set role anon;
do $$ declare r jsonb; begin
  r := rpg_unregister('00000000-0000-4000-8000-000000000003');
  assert r = '{"ok":true}'::jsonb, format('unregister: %s', r);
  assert rpg_unregister('00000000-0000-4000-8000-000000000003')->>'reason' = 'not_found', '2回目はもう無い';
  assert rpg_unregister('00000000-0000-4000-8000-0000000000ff')->>'reason' = 'not_found', '登録していない';
  assert rpg_unregister('abc')->>'reason' = 'bad_token', '短い合言葉';
  assert rpg_unregister(null)->>'reason' = 'bad_token', 'null の合言葉';
  assert rpg_register('00000000-0000-4000-8000-000000000004', 'チコ', 1, 0, 0)->>'ok' = 'true', '消した人の名前はあく';
end $$;
reset role;
do $$ begin
  assert (select array_agg(nickname order by nickname) from rpg_players) = array['チコ', 'チコ2', 'ミケ'], format('ほかの人は残る: %s', (select array_agg(nickname) from rpg_players));
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
end $$;
set role anon;
do $$ begin
  begin perform * from rpg_players; raise exception 'anon が select できた';
  exception when insufficient_privilege then null; end;
  begin insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values ('\x09', 'x', 1, 0, 0); raise exception 'anon が insert できた';
  exception when insufficient_privilege then null; end;
  begin perform rpg_hash('00000000-0000-4000-8000-000000000001'); raise exception 'anon が rpg_hash を呼べた';
  exception when insufficient_privilege then null; end;
  begin delete from rpg_players; raise exception 'anon が delete できた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo '- rpg_set_deco'
-- かざり（プロフィールの国旗3つまで）。10秒の連投よけは deco_at で数え、rpg_update の updated_at とは別
reset role; truncate rpg_players; set role anon;
do $$ declare r jsonb; begin
  r := rpg_register('00000000-0000-4000-8000-000000000001', 'チコ', 12, 2, 13);
  assert r->>'ok' = 'true', format('register: %s', r);
  r := rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp', 'br', 'cl']);
  assert r = '{"ok":true}'::jsonb, format('set_deco: %s', r);
  assert (select deco from top_rpg2('lv') where nickname = 'チコ') = '{jp,br,cl}'::text[], format('top_rpg2 の deco: %s', (select deco from top_rpg2('lv')));
  assert (select deco from top_rpg2('dg') where nickname = 'チコ') = '{jp,br,cl}'::text[], 'dg でも deco';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp', 'br', 'cl', 'fr'])->>'reason' = 'bad_deco', '4つはだめ';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp', 'jp'])->>'reason' = 'bad_deco', '重なりはだめ';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['zz'])->>'reason' = 'bad_deco', '知らないコード';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['JP'])->>'reason' = 'bad_deco', '大文字は知らないコード';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array[null]::text[])->>'reason' = 'bad_deco', 'null を含む';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp', null])->>'reason' = 'bad_deco', 'null を含む（2つ目）';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array[['jp', 'br']])->>'reason' = 'bad_deco', '2次元の配列';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', null)->>'reason' = 'bad_deco', 'null';
end $$;
reset role;
do $$ begin
  assert (select deco from rpg_players) = '{jp,br,cl}'::text[], 'だめな送信では変わらない';
end $$;
update rpg_players set updated_at = now() - interval '1 minute', deco_at = now() - interval '1 minute';
set role anon;
do $$ declare r jsonb; begin
  r := rpg_set_deco('00000000-0000-4000-8000-000000000001', '{}');
  assert r = '{"ok":true}'::jsonb, format('空にする: %s', r);
  assert (select deco from top_rpg2('lv')) = '{}'::text[], '空になった';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp'])->>'reason' = 'too_soon', '10秒以内はだめ';
  r := rpg_update('00000000-0000-4000-8000-000000000001', 13, 2, 13);
  assert r->>'ok' = 'true', format('かざりを変えても rpg_update は too_soon にならない: %s', r);
  assert rpg_set_deco('00000000-0000-4000-8000-0000000000ff', array['jp'])->>'reason' = 'not_found', '登録していない';
  assert rpg_set_deco('bad', array['jp'])->>'reason' = 'bad_token', '短い合言葉';
  assert rpg_set_deco(null, array['jp'])->>'reason' = 'bad_token', 'null の合言葉';
  assert rpg_unregister('00000000-0000-4000-8000-000000000001')->>'ok' = 'true', '消す';
  assert rpg_set_deco('00000000-0000-4000-8000-000000000001', array['jp'])->>'reason' = 'not_found', '消した行';
  assert (select count(*) from top_rpg2('x')) = 0, '知らない並べ方は空';
  assert (select count(*) from top_rpg2(null)) = 0, 'null は空';
  begin perform rpg_codes(); raise exception 'anon が rpg_codes() を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert cardinality(rpg_codes()) = 195, format('195か国: %s', cardinality(rpg_codes()));
end $$;

\echo '- top_rpg2'
reset role; truncate rpg_players;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, created_at, deco) values
  ('\x01', 'A', 20, 1, 7, now() - interval '5 min', '{fr}'),
  ('\x02', 'B', 25, 0, 4, now() - interval '3 min', '{}'),
  ('\x03', 'C', 20, 1, 7, now() - interval '2 min', '{jp,br}'),
  ('\x04', 'D', 10, 3, 16, now() - interval '1 min', '{cl}');
set role anon;
do $$ begin
  assert (select array_agg(nickname) from top_rpg2('lv')) = array['B', 'A', 'C', 'D'], format('lv: %s', (select array_agg(nickname) from top_rpg2('lv')));
  assert (select array_agg(nickname) from top_rpg2('dg')) = array['D', 'A', 'C', 'B'], format('dg: %s', (select array_agg(nickname) from top_rpg2('dg')));
  assert (select deco from top_rpg2('lv') where nickname = 'C') = '{jp,br}'::text[], 'C の deco';
end $$;
reset role; truncate rpg_players;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors) select int4send(i), 'p' || i, i % 50 + 1, 0, 0 from generate_series(1, 60) i;
set role anon;
do $$ begin assert (select count(*) from top_rpg2('lv')) = 50, '50件まで'; end $$;
reset role;

\echo '- daily: submit_daily / top_daily / daily_rank_of'
reset role; truncate daily_scores;
do $$ begin
  assert daily_day('2026-10-28') = date '2026-10-28', 'daily_day';
  assert daily_day('2026-02-30') is null, 'ありえない日付';
  assert daily_day('20261028') is null, '形がちがう';
  assert daily_day(null) is null, 'null';
  -- 日本時間 10/28 0:10 → 10/28 と 10/27 はOK、10/26 と 10/29 はだめ。0:30 からは 10/27 もだめ
  assert daily_day_open(date '2026-10-28', timestamptz '2026-10-27 15:10:00+00'), '今日';
  assert daily_day_open(date '2026-10-27', timestamptz '2026-10-27 15:10:00+00'), '0:30 までは昨日も';
  assert not daily_day_open(date '2026-10-27', timestamptz '2026-10-27 15:30:00+00'), '0:30 から昨日はだめ';
  assert not daily_day_open(date '2026-10-26', timestamptz '2026-10-27 15:10:00+00'), 'おととい';
  assert not daily_day_open(date '2026-10-29', timestamptz '2026-10-27 15:10:00+00'), '明日';
  assert daily_day_open(date '2026-10-28', timestamptz '2026-10-28 14:59:59+00'), '23:59 は今日';
  assert not daily_day_open(date '2026-10-28', timestamptz '2026-10-29 15:00:00+00'), '翌日の0時からはだめ';
end $$;
set role anon;
do $$ declare
  d text := to_char((now() at time zone 'Asia/Tokyo')::date, 'YYYY-MM-DD');
  old text := to_char((now() at time zone 'Asia/Tokyo')::date - 2, 'YYYY-MM-DD');
  r jsonb;
begin
  r := submit_daily(d, ' チコ ', 20, 20, 30000);
  assert r = '{"ok":true,"rank":1}'::jsonb, format('全問正解: %s', r);
  r := submit_daily(d, 'B', 20, 20, 25000);
  assert r = '{"ok":true,"rank":1}'::jsonb, format('速い全問正解が1位: %s', r);
  r := submit_daily(d, 'C', 12, 20, 9000);
  assert r = '{"ok":true,"rank":3}'::jsonb, format('途中終了は全問正解の下: %s', r);
  r := submit_daily(d, 'D', 12, 20, 12000);
  assert r = '{"ok":true,"rank":4}'::jsonb, format('同じ正答数は速い順: %s', r);
  r := submit_daily(d, 'E', 0, 20, 3000);
  assert r = '{"ok":true,"rank":5}'::jsonb, format('0問も載る: %s', r);
  assert submit_daily(d, 'チコ', 5, 20, 9000)->>'reason' = 'name_taken', '同じ日に同じ名前';
  assert submit_daily(d, 'b', 5, 20, 9000)->>'reason' = 'name_taken', '大文字小文字だけちがう';
  assert submit_daily(d, 'Ｂ', 5, 20, 9000)->>'reason' = 'name_taken', '全角半角だけちがう';
  assert submit_daily(old, 'Z', 5, 20, 9000)->>'reason' = 'bad_day', 'おととい';
  assert submit_daily('x', 'Z', 5, 20, 9000)->>'reason' = 'bad_day', '形がちがう日付';
  assert submit_daily(null, 'Z', 5, 20, 9000)->>'reason' = 'bad_day', 'null の日付';
  assert submit_daily(d, 'Z', 21, 20, 90000)->>'reason' = 'bad_record', '正答数が多すぎ';
  assert submit_daily(d, 'Z', -1, 20, 9000)->>'reason' = 'bad_record', '正答数がマイナス';
  assert submit_daily(d, 'Z', 5, 10, 9000)->>'reason' = 'bad_record', '問題数がちがう';
  assert submit_daily(d, 'Z', null, 20, 9000)->>'reason' = 'bad_record', '正答数が null';
  assert submit_daily(d, '', 5, 20, 9000)->>'reason' = 'bad_name', '空の名前';
  assert submit_daily(d, '1234567890123', 5, 20, 9000)->>'reason' = 'bad_name', '13文字';
  assert submit_daily(d, 'ＡＤＭＩＮ', 5, 20, 9000)->>'reason' = 'ng_name', 'NGワード';
  assert submit_daily(d, 'Z', 20, 20, 7999)->>'reason' = 'too_fast', '20問で8秒未満';
  assert submit_daily(d, 'Z', 0, 20, 399)->>'reason' = 'too_fast', '0問でも0.4秒未満はだめ';
  assert submit_daily(d, 'Z', 5, 20, 10800001)->>'reason' = 'too_slow', '3時間より長い';
  assert submit_daily(d, 'Z', 5, 20, null)->>'reason' = 'too_fast', 'タイムが null';
  assert (select array_agg(nickname) from top_daily(d)) = array['B', 'チコ', 'C', 'D', 'E'], format('並び: %s', (select array_agg(nickname) from top_daily(d)));
  assert (select row(correct, total, time_ms)::text from top_daily(d) where nickname = 'C') = '(12,20,9000)', 'C の行';
  assert (select count(*) from top_daily(old)) = 0, 'ほかの日は空';
  assert (select count(*) from top_daily('x')) = 0, '日付がおかしいと空';
  assert daily_rank_of(d, 12, 9000) = '{"rank":3}'::jsonb, '同じ記録は同じ順位';
  assert daily_rank_of(d, 20, 1000) = '{"rank":1}'::jsonb, 'いちばん速い';
  begin perform * from daily_scores; raise exception 'anon が daily_scores を読めた';
  exception when insufficient_privilege then null; end;
  begin perform daily_day_open(current_date, now()); raise exception 'anon が daily_day_open を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role; truncate daily_scores;
insert into daily_scores (day, nickname, correct, total, time_ms) select current_date, 'p' || i, i % 21, 20, 10000 + i from generate_series(1, 60) i;
set role anon;
do $$ begin assert (select count(*) from top_daily(to_char(current_date, 'YYYY-MM-DD'))) = 50, '50件まで'; end $$;
reset role;

-- ---- サイト共通のプロフィール ----
-- 合言葉: a1=チコ、a2=2人目、a9=引き継ぎ先の端末
\echo '- profile_create_ok'
reset role; truncate profile_transfers, profiles, scores, daily_scores, rpg_players cascade; set role anon;
do $$ declare r jsonb := profile_create('00000000-0000-4000-8000-0000000000a1', ' チコ '); begin
  assert (r->>'ok')::boolean, format('create: %s', r);
  assert r->>'nickname' = 'チコ', format('前後空白を除く: %s', r);
  assert r->>'pid' ~ '^[0-9a-f]{12}$', format('pid: %s', r);
  assert profile_create('00000000-0000-4000-8000-0000000000a1', 'ミケ')->>'reason' = 'already', '同じ合言葉で2つめはだめ';
  assert profile_create('00000000-0000-4000-8000-0000000000a1', 'チコ')->>'reason' = 'already', '同じ合言葉・同じ名前も already';
end $$;
reset role;
do $$ begin
  assert (select count(*) from profiles) = 1, '1行だけ';
  assert (select token_hash from profiles) = sha256(convert_to('00000000-0000-4000-8000-0000000000a1', 'UTF8')), '合言葉はハッシュで残す';
  assert (select row(is_public, title, deco, badges, badges_total)::text from profiles) = '(t,"",{},0,0)', 'はじめの値';
end $$;

\echo '- profile_name_taken'
set role anon;
do $$ begin
  assert profile_create('00000000-0000-4000-8000-0000000000a2', 'ﾁｺ')->>'reason' = 'name_taken', '全角半角をそろえると同じ';
  assert profile_create('00000000-0000-4000-8000-0000000000a2', 'チコ ')->>'reason' = 'name_taken', '前後空白を除くと同じ';
  assert (profile_create('00000000-0000-4000-8000-0000000000a2', 'ＣＨＩＫＯ')->>'ok')::boolean, 'ＣＨＩＫＯ は作れる';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', 'chiko')->>'reason' = 'name_taken', 'ＣＨＩＫＯ と chiko は同じ';
end $$;

\echo '- profile_bad'
do $$ begin
  assert profile_create(null, 'ミケ')->>'reason' = 'bad_token', 'null の合言葉';
  assert profile_create('', 'ミケ')->>'reason' = 'bad_token', '空の合言葉';
  assert profile_create('abc', 'ミケ')->>'reason' = 'bad_token', '短い合言葉';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', '')->>'reason' = 'bad_name', '空の名前';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', '　')->>'reason' = 'bad_name', '全角空白だけ';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', null)->>'reason' = 'bad_name', 'null の名前';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', 'あいうえおかきくけこさしす')->>'reason' = 'bad_name', '13文字';
  assert profile_create('00000000-0000-4000-8000-0000000000a3', 'うんこ')->>'reason' = 'ng_name', 'NG';
  assert profile_me('00000000-0000-4000-8000-0000000000a3')->>'reason' = 'not_found', 'どれも作られていない';
  assert profile_me(null)->>'reason' = 'bad_token', 'profile_me も null は bad_token';
end $$;

\echo '- profile_me'
do $$ declare r jsonb := profile_me('00000000-0000-4000-8000-0000000000a1'); begin
  assert r - 'pid' = '{"ok":true,"nickname":"チコ","is_public":true,"title":"","deco":[]}'::jsonb, format('me: %s', r);
  assert r->>'pid' ~ '^[0-9a-f]{12}$', 'pid も返す';
end $$;

\echo '- profile_rename_syncs'
reset role;
insert into scores (board, nickname, time_ms, questions, profile_id) select 'f2n:asia:10', 'チコ', 9000, 10, id from profiles where nickname = 'チコ';
insert into daily_scores (day, nickname, correct, total, time_ms, profile_id) select current_date, 'チコ', 20, 20, 30000, id from profiles where nickname = 'チコ';
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, profile_id) select token_hash, 'チコ', 5, 1, 5, id from profiles where nickname = 'チコ';
-- ほかの人の古い記録は変えない
insert into scores (board, nickname, time_ms, questions) values ('f2n:asia:10', 'チコ', 9500, 10);
set role anon;
do $$ declare r jsonb; begin
  assert profile_rename('00000000-0000-4000-8000-0000000000a1', 'chiko')->>'reason' = 'name_taken', 'ほかの人の名前にはできない';
  assert profile_rename('00000000-0000-4000-8000-0000000000a1', 'ＦＵＣＫ')->>'reason' = 'ng_name', 'NG';
  assert profile_rename('00000000-0000-4000-8000-0000000000a1', '')->>'reason' = 'bad_name', '空';
  assert profile_rename('00000000-0000-4000-8000-0000000000a3', 'タマ')->>'reason' = 'not_found', '作っていない';
  assert profile_rename(null, 'タマ')->>'reason' = 'bad_token', 'null の合言葉';
  r := profile_rename('00000000-0000-4000-8000-0000000000a1', 'ﾁｺ');
  assert r = '{"ok":true,"nickname":"ﾁｺ"}'::jsonb, format('自分の名前の書き方を変えるのはよい: %s', r);
  r := profile_rename('00000000-0000-4000-8000-0000000000a1', ' タマ ');
  assert r = '{"ok":true,"nickname":"タマ"}'::jsonb, format('rename: %s', r);
  assert (profile_create('00000000-0000-4000-8000-0000000000a3', 'チコ')->>'ok')::boolean, '前の名前はあく';
end $$;
reset role;
do $$ begin
  assert (select nickname from profiles where token_hash = sha256(convert_to('00000000-0000-4000-8000-0000000000a1', 'UTF8'))) = 'タマ', 'profiles';
  assert (select nickname from scores where profile_id is not null) = 'タマ', 'scores';
  assert (select nickname from scores where profile_id is null) = 'チコ', '古い記録はそのまま';
  assert (select nickname from daily_scores) = 'タマ', 'daily_scores';
  assert (select nickname from rpg_players) = 'タマ', 'rpg_players';
end $$;

\echo '- profile_set_ranges'
set role anon;
do $$ declare t text := '00000000-0000-4000-8000-0000000000a1'; r jsonb; begin
  assert profile_set(t, null, null, '{jp,jp}', null, null)->>'reason' = 'bad_deco', '重複';
  assert profile_set(t, null, null, '{zz}', null, null)->>'reason' = 'bad_deco', '無い国';
  assert profile_set(t, null, null, '{jp,fr,br,cl}', null, null)->>'reason' = 'bad_deco', '4つ';
  assert profile_set(t, null, null, array['jp', null], null, null)->>'reason' = 'bad_deco', 'null 入り';
  assert profile_set(t, null, repeat('あ', 41), null, null, null)->>'reason' = 'bad_record', '称号41文字';
  assert profile_set(t, null, null, null, 501, null)->>'reason' = 'bad_record', 'バッジ501';
  assert profile_set(t, null, null, null, -1, null)->>'reason' = 'bad_record', 'バッジ-1';
  assert profile_set(t, null, null, null, null, 501)->>'reason' = 'bad_record', '全部の数501';
  assert profile_set('00000000-0000-4000-8000-0000000000a5', true, null, null, null, null)->>'reason' = 'not_found', '作っていない';
  assert profile_set(null, true, null, null, null, null)->>'reason' = 'bad_token', 'null の合言葉';
  r := profile_set(t, false, repeat('あ', 40), '{jp,fr,br}', 12, 80);
  assert r = '{"ok":true}'::jsonb, format('set: %s', r);
  r := profile_set(t, null, null, null, null, null);
  assert r = '{"ok":true}'::jsonb, format('全部 null: %s', r);
  r := profile_me(t);
  assert r->'is_public' = 'false' and r->>'title' = repeat('あ', 40) and r->'deco' = '["jp","fr","br"]', format('前の値のまま: %s', r);
  assert (profile_set(t, null, '', '{}', 0, null)->>'ok')::boolean, '空にもできる';
end $$;
reset role;
do $$ begin
  assert (select row(is_public, title, deco, badges, badges_total)::text from profiles where nickname = 'タマ') = '(f,"",{},0,80)', '保存値';
end $$;

\echo '- profile_card_private'
reset role; update profiles set title = '旅人', deco = '{jp,br}' where nickname = 'タマ'; set role anon;
do $$ declare
  v_pid text := profile_me('00000000-0000-4000-8000-0000000000a1')->>'pid';
  r jsonb := profile_card(v_pid);
begin
  assert r = jsonb_build_object('ok', true, 'private', true, 'pid', v_pid, 'nickname', 'タマ', 'deco', '["jp","br"]'::jsonb), format('private: %s', r);
  assert profile_card('nothing12345')->>'reason' = 'not_found', '無い pid';
  assert profile_card(null)->>'reason' = 'not_found', 'null の pid';
end $$;

\echo '- profile_card_public'
reset role; truncate profile_transfers, profiles, scores, daily_scores, rpg_players cascade; set role anon;
do $$ begin
  assert (profile_create('00000000-0000-4000-8000-0000000000a1', 'チコ')->>'ok')::boolean, 'チコ';
  assert (profile_create('00000000-0000-4000-8000-0000000000a2', 'ミケ')->>'ok')::boolean, 'ミケ';
  assert (profile_set('00000000-0000-4000-8000-0000000000a1', null, '旅人', '{jp}', 12, 80)->>'ok')::boolean, 'set';
end $$;
reset role;
-- チコ: asia:10 は 8000（ミケが 7000 なので2位）、europe:5 は 5000（1位）、africa:5 は 6000（ミケが 3000・4000 の2行なので2位）、oceania:5 は 9000（3位）
insert into scores (board, nickname, time_ms, questions, profile_id)
  select b, 'チコ', t, q, (select id from profiles where nickname = 'チコ') from (values
    ('f2n:asia:10', 8000, 10), ('f2n:asia:10', 9000, 10), ('f2n:europe:5', 5000, 5), ('f2n:africa:5', 6000, 5), ('f2n:oceania:5', 9000, 5)) v(b, t, q);
insert into scores (board, nickname, time_ms, questions, profile_id)
  select b, 'ミケ', t, q, (select id from profiles where nickname = 'ミケ') from (values
    ('f2n:asia:10', 7000, 10), ('f2n:africa:5', 3000, 5), ('f2n:africa:5', 4000, 5), ('f2n:oceania:5', 2000, 5)) v(b, t, q);
insert into scores (board, nickname, time_ms, questions) values ('f2n:oceania:5', 'ポチ', 2500, 5);
insert into daily_scores (day, nickname, correct, total, time_ms, profile_id)
  select d, 'チコ', c, 20, 30000, (select id from profiles where nickname = 'チコ') from (values
    (current_date, 20), (current_date - 1, 12)) v(d, c);
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, profile_id)
  select token_hash, nickname, 14, 3, 17, id from profiles where nickname = 'チコ';
update profiles set created_at = '2026-10-01 00:00:00+00' where nickname = 'チコ';
set role anon;
do $$ declare
  v_pid text := profile_me('00000000-0000-4000-8000-0000000000a1')->>'pid';
  r jsonb := profile_card(v_pid);
begin
  assert r->'ok' = 'true' and r->'private' = 'false' and r->>'pid' = v_pid, format('ok: %s', r);
  assert r->>'nickname' = 'チコ' and r->>'title' = '旅人' and r->'deco' = '["jp"]', format('名前・称号・かざり: %s', r);
  assert r->'badges' = '12' and r->'badges_total' = '80', format('バッジ: %s', r);
  assert r->'rpg' = '{"lv":14,"dungeons":3}', format('冒険: %s', r);
  assert r->'ta' = '[{"board":"f2n:europe:5","time_ms":5000,"rank":1},{"board":"f2n:africa:5","time_ms":6000,"rank":2},{"board":"f2n:asia:10","time_ms":8000,"rank":2}]',
    format('TA は順位の良い順（同じ順位は速い順）で3件: %s', r->'ta');
  assert r->'daily' = '{"plays":2,"perfect":1}', format('今日の難問: %s', r->'daily');
  assert (r->>'since')::timestamptz = '2026-10-01 00:00:00+00', format('はじめた時刻: %s', r->>'since');
  r := profile_card(profile_me('00000000-0000-4000-8000-0000000000a2')->>'pid');
  assert r->'rpg' = 'null' and r->'daily' = '{"plays":0,"perfect":0}' and jsonb_array_length(r->'ta') = 3, format('冒険なし・難問なし: %s', r);
end $$;

\echo '- transfer_flow'
do $$ declare
  r jsonb := profile_transfer_start('00000000-0000-4000-8000-0000000000a1', '{"v":1,"keys":{"rpg":"{\"lv\":14}"}}');
  c jsonb;
begin
  assert (r->>'ok')::boolean, format('start: %s', r);
  assert r->>'code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$', format('code: %s', r);
  assert (r->>'expires_at')::timestamptz between now() + interval '23 hours 59 min' and now() + interval '24 hours 1 min', format('24時間: %s', r);
  c := profile_transfer_claim(r->>'code', '00000000-0000-4000-8000-0000000000a9');
  assert c->'ok' = 'true' and c->>'nickname' = 'チコ' and c->>'pid' ~ '^[0-9a-f]{12}$', format('claim: %s', c);
  assert c->'data' = '{"v":1,"keys":{"rpg":"{\"lv\":14}"}}', format('data が同じ: %s', c);
  assert profile_me('00000000-0000-4000-8000-0000000000a1')->>'reason' = 'not_found', '前の端末は not_found';
  assert profile_me('00000000-0000-4000-8000-0000000000a9')->>'nickname' = 'チコ', '新しい端末で使える';
  assert profile_transfer_claim(r->>'code', '00000000-0000-4000-8000-0000000000b9')->>'reason' = 'bad_code', '2回目はだめ';
  assert profile_transfer_start('00000000-0000-4000-8000-0000000000a1', '{}')->>'reason' = 'not_found', '前の端末はもう出せない';
end $$;
reset role;
do $$ begin
  assert (select data from profile_transfers) is null and (select used_at from profile_transfers) is not null, '使ったら data は null';
  assert (select code_hash from profile_transfers) <> '\x'::bytea and octet_length((select code_hash from profile_transfers)) = 32, 'コードはハッシュで残す';
end $$;

\echo '- transfer_reissue'
set role anon;
do $$ declare r1 jsonb; r2 jsonb; begin
  r1 := profile_transfer_start('00000000-0000-4000-8000-0000000000a2', '{"v":1,"keys":{}}');
  assert (r1->>'ok')::boolean, format('1つめ: %s', r1);
  reset role;
  update profile_transfers set created_at = now() - interval '2 min';
  set role anon;
  r2 := profile_transfer_start('00000000-0000-4000-8000-0000000000a2', '{"v":1,"keys":{"a":"2"}}');
  assert (r2->>'ok')::boolean and r2->>'code' <> r1->>'code', format('2つめ: %s', r2);
  assert profile_transfer_claim(r1->>'code', '00000000-0000-4000-8000-0000000000a8')->>'reason' = 'bad_code', '1つめは使えない';
  assert profile_transfer_claim(r2->>'code', '00000000-0000-4000-8000-0000000000a8')->'data' = '{"v":1,"keys":{"a":"2"}}', '2つめは使える';
end $$;
reset role;
do $$ begin
  assert (select count(*) from profile_transfers where data is not null) = 0, '出し直した前のコードの data も null';
end $$;

\echo '- transfer_expired'
set role anon;
do $$ declare r jsonb := profile_transfer_start('00000000-0000-4000-8000-0000000000a9', '{"v":1,"keys":{}}'); begin
  assert (r->>'ok')::boolean, format('start: %s', r);
  reset role;
  update profile_transfers set expires_at = now() - interval '1 second' where used_at is null;
  set role anon;
  assert profile_transfer_claim(r->>'code', '00000000-0000-4000-8000-0000000000b1')->>'reason' = 'bad_code', '期限切れ';
  assert profile_me('00000000-0000-4000-8000-0000000000a9')->>'nickname' = 'チコ', '期限切れなら前の端末のまま';
end $$;

\echo '- transfer_limits'
reset role; update profile_transfers set created_at = now() - interval '2 min'; set role anon;
do $$ declare
  t text := '00000000-0000-4000-8000-0000000000a9';
  r jsonb;
  c jsonb;
begin
  assert profile_transfer_start(t, jsonb_build_object('v', 1, 'keys', jsonb_build_object('rpg', repeat('x', 600000))))->>'reason' = 'too_big', '600KB';
  assert profile_transfer_start(t, null)->>'reason' = 'bad_record', 'data が null';
  assert profile_transfer_start(t, '[1]')->>'reason' = 'bad_record', 'data が配列';
  assert profile_transfer_start(null, '{}')->>'reason' = 'bad_token', 'null の合言葉';
  r := profile_transfer_start(t, jsonb_build_object('v', 1, 'keys', jsonb_build_object('rpg', repeat('x', 500000))));
  assert (r->>'ok')::boolean, format('500KB は通る: %s', r->>'reason');
  assert profile_transfer_start(t, '{"v":1,"keys":{}}')->>'reason' = 'too_soon', '1分以内はだめ';
  assert profile_transfer_claim('ABCD-EFGH-JKMN', '00000000-0000-4000-8000-0000000000b1')->>'reason' = 'bad_code', '無いコード';
  assert profile_transfer_claim(null, '00000000-0000-4000-8000-0000000000b1')->>'reason' = 'bad_code', 'null のコード';
  assert profile_transfer_claim('0O1I0O1I0O1I', '00000000-0000-4000-8000-0000000000b1')->>'reason' = 'bad_code', '使わない文字';
  assert profile_transfer_claim(r->>'code', null)->>'reason' = 'bad_token', 'null の新しい合言葉';
  assert profile_transfer_claim(r->>'code', '00000000-0000-4000-8000-0000000000a8')->>'reason' = 'bad_token', 'ほかのプロフィール（ミケ）の合言葉';
  -- 小文字・ハイフン・空白入り
  c := profile_transfer_claim(lower(substr(r->>'code', 1, 4) || '-' || substr(r->>'code', 5, 4) || ' ' || substr(r->>'code', 9, 4)), '00000000-0000-4000-8000-0000000000b1');
  assert (c->>'ok')::boolean and c->>'nickname' = 'チコ', format('小文字・ハイフン入り: %s', c - 'data');
end $$;

\echo '- migrate_rpg'
reset role; truncate profile_transfers, profiles, scores, daily_scores, rpg_players cascade;
insert into rpg_players (token_hash, nickname, lv, dungeons, floors, deco) values
  (sha256(convert_to('00000000-0000-4000-8000-0000000000c1', 'UTF8')), 'ポチ', 10, 1, 6, '{fr}'),
  (sha256(convert_to('00000000-0000-4000-8000-0000000000c2', 'UTF8')), 'タマ', 3, 0, 1, '{}');
set role anon;
do $$ begin
  begin perform profile_migrate_rpg(); raise exception 'anon が profile_migrate_rpg を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- schema.sql を2回流したときと同じく2回呼ぶ
do $$ begin perform profile_migrate_rpg(); perform profile_migrate_rpg(); end $$;
do $$ begin
  assert (select count(*) from profiles) = 2, format('2行: %s', (select count(*) from profiles));
  assert (select count(*) from rpg_players r join profiles p on p.id = r.profile_id
          where p.token_hash = r.token_hash and p.nickname = r.nickname and p.deco = r.deco) = 2, '同じ合言葉・名前・かざりでつながる';
end $$;
set role anon;
do $$ declare r jsonb := profile_me('00000000-0000-4000-8000-0000000000c1'); begin
  assert r->>'nickname' = 'ポチ' and r->'deco' = '["fr"]', format('引っ越した人の me: %s', r);
end $$;

\echo '- profile_permissions'
reset role;
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as name, p.proconfig, p.prosecdef from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'profile\_%' loop
    assert f.proconfig = array['search_path=public, pg_temp'], format('%s: %s', f.name, f.proconfig);
  end loop;
  assert (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles の RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.profile_transfers'::regclass), 'profile_transfers の RLS';
  assert (select count(*) from pg_policies where tablename in ('profiles', 'profile_transfers')) = 0, 'ポリシーは作らない';
end $$;
set role anon;
do $$ begin
  begin perform * from profiles; raise exception 'anon が profiles を読めた';
  exception when insufficient_privilege then null; end;
  begin perform * from profile_transfers; raise exception 'anon が profile_transfers を読めた';
  exception when insufficient_privilege then null; end;
  begin update profiles set nickname = 'x'; raise exception 'anon が profiles を書けた';
  exception when insufficient_privilege then null; end;
  begin perform profile_name_problem('x', null); raise exception 'anon が profile_name_problem を呼べた';
  exception when insufficient_privilege then null; end;
  begin perform profile_by_token('00000000-0000-4000-8000-0000000000c1'); raise exception 'anon が profile_by_token を呼べた';
  exception when insufficient_privilege then null; end;
  begin perform profile_clean_name('x'); raise exception 'anon が profile_clean_name を呼べた';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

\echo 'ALL SQL TESTS PASSED'
