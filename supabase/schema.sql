-- 195か国ドリル タイムアタックのランキング用（Supabase）
-- 使い方: Supabase の SQL Editor にこのファイルを全部貼って Run。何度流しても大丈夫。
-- ブラウザ（anon）からはテーブルを直接さわれない。呼べるのはタイムアタックの submit_score / top_scores / rank_of と、
-- 冒険の submit_rpg / top_rpg / rpg_rank_of だけ。
-- 変な記録は Table Editor の scores から行を消せばランキングからも消える。

create table if not exists scores (
  id bigint generated always as identity primary key,
  board text not null,             -- 'モード:地域:問題数' 例 f2n:asia:10
  nickname text not null,          -- 前後空白を除いた1〜12文字
  time_ms int not null,            -- クリアタイム（ミリ秒）
  questions int not null,          -- 実際の問題数（「全部」のときは地域の国の数）
  created_at timestamptz not null default now()
);
create index if not exists scores_board_time_ms on scores (board, time_ms);

-- RLS を有効にしてポリシーは作らない＝関数を通さないと誰も読めない・書けない
alter table scores enable row level security;
revoke all on scores from anon, authenticated;

-- 関数はどれも search_path を public, pg_temp に固定する（security definer の関数が別のスキーマの同名の物を拾わないように）

-- NGワード（ranking.js の NG_WORDS と同じ中身。NFKC＋小文字にした名前に部分一致したらだめ）
create or replace function ng_words() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['死ね', 'しね', 'シネ', '殺す', 'ころす', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ',
               'せっくす', 'セックス', 'fuck', 'shit', 'bitch', 'sex', 'admin', '運営', '管理人']
$$;
revoke all on function ng_words() from public, anon, authenticated;

-- 「今週」の始まり＝日本時間の月曜0時（rank_of と top_scores の区切りをここ1か所にまとめる）
create or replace function jst_week_start() returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'
$$;
revoke all on function jst_week_start() from public, anon, authenticated;

-- 自分より速い自己ベストを持つ人数＋1（歴代と今週）。同タイムは数えない
create or replace function rank_of(p_board text, p_time_ms int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  week_start timestamptz := jst_week_start();
begin
  return jsonb_build_object(
    'rank_all', (select count(*) + 1 from (
      select 1 from scores where board = p_board group by nickname having min(time_ms) < p_time_ms) b),
    'rank_week', (select count(*) + 1 from (
      select 1 from scores where board = p_board and created_at >= week_start group by nickname having min(time_ms) < p_time_ms) b));
end $$;
revoke all on function rank_of(text, int) from public;
grant execute on function rank_of(text, int) to anon;

-- 記録を受け付ける。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank_all":n,"rank_week":n}
create or replace function submit_score(p_board text, p_nickname text, p_time_ms int, p_questions int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cnt text := split_part(p_board, ':', 3);
  -- 前後の空白は JS の trim() と同じ文字（全角空白なども）を落とす
  v_name text := btrim(p_nickname, E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
  v_norm text := lower(normalize(v_name, NFKC));
begin
  if not coalesce(p_board ~ '^(f2n|n2f|m2f|f2m):(all|asia|europe|africa|namerica|samerica|oceania):(5|10|20|all)$', false)
     or p_questions is null
     or (v_cnt = 'all' and p_questions not between 1 and 195)
     or (v_cnt <> 'all' and p_questions::text <> v_cnt) then
    return jsonb_build_object('ok', false, 'reason', 'bad_board');
  end if;
  if v_name is null or char_length(v_name) not between 1 and 12 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then
    return jsonb_build_object('ok', false, 'reason', 'ng_name');
  end if;
  if p_time_ms is null or p_time_ms < p_questions * 400 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  if p_time_ms > 10800000 then
    return jsonb_build_object('ok', false, 'reason', 'too_slow');
  end if;
  -- 同じ board・同じ名前の同時送信が両方通らないように、確認から登録までを順番待ちにする
  perform pg_advisory_xact_lock(hashtext(p_board || ':' || v_name));
  if exists (select 1 from scores where board = p_board and nickname = v_name and created_at > now() - interval '10 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  insert into scores (board, nickname, time_ms, questions) values (p_board, v_name, p_time_ms, p_questions);
  return jsonb_build_object('ok', true) || rank_of(p_board, p_time_ms);
end $$;
revoke all on function submit_score(text, text, int, int) from public;
grant execute on function submit_score(text, text, int, int) to anon;

-- 上位50件（同じ名前は最速1件）。p_period は 'all'（歴代）か 'week'（日本時間の月曜0時から）。それ以外は空
create or replace function top_scores(p_board text, p_period text)
returns table(nickname text, time_ms int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  week_start timestamptz := jst_week_start();
begin
  if p_period is null or p_period not in ('all', 'week') then return; end if;
  return query
    select b.nickname, b.time_ms, b.created_at from (
      select distinct on (s.nickname) s.nickname, s.time_ms, s.created_at from scores s
      where s.board = p_board and (p_period = 'all' or s.created_at >= week_start)
      order by s.nickname, s.time_ms, s.created_at
    ) b
    order by b.time_ms, b.created_at
    limit 50;
end $$;
revoke all on function top_scores(text, text) from public;
grant execute on function top_scores(text, text) to anon;

-- ---- 冒険（国旗クエスト）のランキング ----
-- 1回送るごとに1行。表示は同じ名前なら自己ベストの1件だけ。並べ方は2つ:
--   'lv'（レベル → クリアしたダンジョン → フロア → 先に載せた順）と 'dg'（クリアしたダンジョン → フロア → レベル → 先に載せた順）
-- 変な記録は Table Editor の rpg_scores から行を消せばランキングからも消える
create table if not exists rpg_scores (
  id bigint generated always as identity primary key,
  nickname text not null,          -- 前後空白を除いた1〜12文字
  lv int not null,                 -- 旅人のレベル（1〜50）
  dungeons int not null,           -- ボスを倒したダンジョンの数（0〜7）
  floors int not null,             -- クリアしたフロアの合計（0〜35。ダンジョン1つは5フロア）
  created_at timestamptz not null default now()
);
create index if not exists rpg_scores_lv on rpg_scores (lv desc, dungeons desc, floors desc);
create index if not exists rpg_scores_dg on rpg_scores (dungeons desc, floors desc, lv desc);
alter table rpg_scores enable row level security;
revoke all on rpg_scores from anon, authenticated;

-- 自分より上の自己ベストを持つ人数＋1（レベル順とダンジョン順）。同じ記録は数えない
create or replace function rpg_rank_of(p_lv int, p_dungeons int, p_floors int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'rank_lv', (select count(*) + 1 from (
      select distinct on (nickname) lv, dungeons, floors from rpg_scores order by nickname, lv desc, dungeons desc, floors desc) b
      where (b.lv, b.dungeons, b.floors) > (p_lv, p_dungeons, p_floors)),
    'rank_dg', (select count(*) + 1 from (
      select distinct on (nickname) lv, dungeons, floors from rpg_scores order by nickname, dungeons desc, floors desc, lv desc) b
      where (b.dungeons, b.floors, b.lv) > (p_dungeons, p_floors, p_lv)))
$$;
revoke all on function rpg_rank_of(int, int, int) from public;
grant execute on function rpg_rank_of(int, int, int) to anon;

-- 記録を受け付ける。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank_lv":n,"rank_dg":n}
create or replace function submit_rpg(p_nickname text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_name text := btrim(p_nickname, E' \t\n\r\f\u000b                 　﻿');
  v_norm text := lower(normalize(v_name, NFKC));
begin
  if v_name is null or char_length(v_name) not between 1 and 12 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then
    return jsonb_build_object('ok', false, 'reason', 'ng_name');
  end if;
  -- ダンジョンはボスまで5フロア。クリアしたダンジョンの数はフロアの合計の 1/5 以下
  if p_lv is null or p_dungeons is null or p_floors is null
     or p_lv not between 1 and 50 or p_dungeons not between 0 and 7 or p_floors not between 0 and 35
     or p_dungeons * 5 > p_floors then
    return jsonb_build_object('ok', false, 'reason', 'bad_record');
  end if;
  perform pg_advisory_xact_lock(hashtext('rpg:' || v_name));
  if exists (select 1 from rpg_scores where nickname = v_name and created_at > now() - interval '10 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  insert into rpg_scores (nickname, lv, dungeons, floors) values (v_name, p_lv, p_dungeons, p_floors);
  return jsonb_build_object('ok', true) || rpg_rank_of(p_lv, p_dungeons, p_floors);
end $$;
revoke all on function submit_rpg(text, int, int, int) from public;
grant execute on function submit_rpg(text, int, int, int) to anon;

-- 上位50件（同じ名前は自己ベスト1件）。p_sort は 'lv' か 'dg'。それ以外は空
create or replace function top_rpg(p_sort text)
returns table(nickname text, lv int, dungeons int, floors int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_sort is null or p_sort not in ('lv', 'dg') then return; end if;
  if p_sort = 'lv' then
    return query
      select b.nickname, b.lv, b.dungeons, b.floors, b.created_at from (
        select distinct on (s.nickname) s.nickname, s.lv, s.dungeons, s.floors, s.created_at from rpg_scores s
        order by s.nickname, s.lv desc, s.dungeons desc, s.floors desc, s.created_at
      ) b
      order by b.lv desc, b.dungeons desc, b.floors desc, b.created_at
      limit 50;
  else
    return query
      select b.nickname, b.lv, b.dungeons, b.floors, b.created_at from (
        select distinct on (s.nickname) s.nickname, s.lv, s.dungeons, s.floors, s.created_at from rpg_scores s
        order by s.nickname, s.dungeons desc, s.floors desc, s.lv desc, s.created_at
      ) b
      order by b.dungeons desc, b.floors desc, b.lv desc, b.created_at
      limit 50;
  end if;
end $$;
revoke all on function top_rpg(text) from public;
grant execute on function top_rpg(text) to anon;

-- PostgREST に関数が増えたことを知らせる
notify pgrst, 'reload schema';
