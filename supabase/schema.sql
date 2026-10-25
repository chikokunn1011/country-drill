-- 195か国ドリル タイムアタックのランキング用（Supabase）
-- 使い方: Supabase の SQL Editor にこのファイルを全部貼って Run。何度流しても大丈夫。
-- ブラウザ（anon）からはテーブルを直接さわれない。呼べるのは submit_score / top_scores / rank_of の3つだけ。
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

-- NGワード（ranking.js の NG_WORDS と同じ中身。NFKC＋小文字にした名前に部分一致したらだめ）
create or replace function ng_words() returns text[]
language sql immutable set search_path = public as $$
  select array['死ね', 'しね', 'シネ', '殺す', 'ころす', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ',
               'せっくす', 'セックス', 'fuck', 'shit', 'bitch', 'sex', 'admin', '運営', '管理人']
$$;
revoke all on function ng_words() from public, anon, authenticated;

-- 自分より速い自己ベストを持つ人数＋1（歴代と今週）。同タイムは数えない
create or replace function rank_of(p_board text, p_time_ms int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  week_start timestamptz := date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
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
language plpgsql volatile security definer set search_path = public as $$
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
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  week_start timestamptz := date_trunc('week', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
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

-- PostgREST に関数が増えたことを知らせる
notify pgrst, 'reload schema';
