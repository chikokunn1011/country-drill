-- 195か国ドリル タイムアタックのランキング用（Supabase）
-- 使い方: Supabase の SQL Editor にこのファイルを全部貼って Run。何度流しても大丈夫。
-- ブラウザ（anon）からはテーブルを直接さわれない。呼べるのはタイムアタックの submit_score / top_scores / rank_of と、
-- 冒険の rpg_register / rpg_update / rpg_rename / rpg_unregister / rpg_set_deco / top_rpg / top_rpg2 / rpg_rank_of と、
-- 今日の難問の submit_daily / top_daily / daily_rank_of だけ。
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
-- 1人（1つの端末）1行。はじめて載せるとき（rpg_register）に端末が作った秘密の合言葉（p_token）を送り、DB にはそのハッシュだけ残す。
-- そのあとは合言葉で、記録の更新（rpg_update）と名前の変更（rpg_rename）だけができる（別の名前でもう1回は登録できない）。
-- 冒険データを消すと、合言葉で行ごと消す（rpg_unregister）。
-- ニックネームは全角半角・大文字小文字をそろえて、ほかの人と同じものは使えない。記録はそれぞれ今までの最高を残す。
-- 並べ方は 'lv'（レベル → ダンジョン → フロア → 先に載せた順）と 'dg'（ダンジョン → フロア → レベル → 先に載せた順）
-- 変な記録は Table Editor の rpg_players から行を消せばランキングからも消える
-- 前の形（同じ名前を何行も入れる rpg_scores と submit_rpg）はもう使わないが、本番では記録を残すため消していない（2026-10-27）
create table if not exists rpg_players (
  id bigint generated always as identity primary key,
  token_hash bytea not null unique,      -- sha256(合言葉)
  nickname text not null unique,         -- 前後空白を除いた1〜12文字
  lv int not null,                       -- 旅人のレベル（1〜50）
  dungeons int not null,                 -- ボスを倒したダンジョンの数（0〜7）
  floors int not null,                   -- クリアしたフロアの合計（0〜35。ダンジョン1つは5フロア）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rpg_players_lv on rpg_players (lv desc, dungeons desc, floors desc);
create index if not exists rpg_players_dg on rpg_players (dungeons desc, floors desc, lv desc);
alter table rpg_players enable row level security;
revoke all on rpg_players from anon, authenticated;

-- 合言葉は端末が作る UUID（英小文字・数字・ハイフンの 32〜64 文字）
create or replace function rpg_hash(p_token text) returns bytea
language sql immutable set search_path = public, pg_temp as $$
  select case when p_token ~ '^[0-9a-f-]{32,64}$' then sha256(convert_to(p_token, 'UTF8')) end
$$;
revoke all on function rpg_hash(text) from public, anon, authenticated;

-- 名前の確認。だめなら理由、よければ null（p_hash の人が今使っている名前はよい）
create or replace function rpg_name_problem(p_name text, p_hash bytea) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_norm text := lower(normalize(p_name, NFKC));
begin
  if p_name is null or char_length(p_name) not between 1 and 12 then return 'bad_name'; end if;
  if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then return 'ng_name'; end if;
  if exists (select 1 from rpg_players where lower(normalize(nickname, NFKC)) = v_norm and token_hash is distinct from p_hash) then return 'name_taken'; end if;
  return null;
end $$;
revoke all on function rpg_name_problem(text, bytea) from public, anon, authenticated;

-- ダンジョンはボスまで5フロア。クリアしたダンジョンの数はフロアの合計の 1/5 以下
create or replace function rpg_record_ok(p_lv int, p_dungeons int, p_floors int) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_lv between 1 and 50 and p_dungeons between 0 and 7 and p_floors between 0 and 35 and p_dungeons * 5 <= p_floors, false)
$$;
revoke all on function rpg_record_ok(int, int, int) from public, anon, authenticated;

-- 自分より上の人数＋1（レベル順とダンジョン順）。同じ記録は数えない
create or replace function rpg_rank_of(p_lv int, p_dungeons int, p_floors int) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'rank_lv', (select count(*) + 1 from rpg_players where (lv, dungeons, floors) > (p_lv, p_dungeons, p_floors)),
    'rank_dg', (select count(*) + 1 from rpg_players where (dungeons, floors, lv) > (p_dungeons, p_floors, p_lv)))
$$;
revoke all on function rpg_rank_of(int, int, int) from public;
grant execute on function rpg_rank_of(int, int, int) to anon;

-- はじめて載せる。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank_lv":n,"rank_dg":n}
create or replace function rpg_register(p_token text, p_nickname text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_name text := btrim(p_nickname, E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
  v_why text;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  -- 同じ名前・同じ合言葉の同時送信が両方通らないように順番待ち
  perform pg_advisory_xact_lock(hashtext('rpgname:' || coalesce(lower(normalize(v_name, NFKC)), '')));
  perform pg_advisory_xact_lock(hashtext('rpgtoken:' || p_token));
  if exists (select 1 from rpg_players where token_hash = v_hash) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  v_why := rpg_name_problem(v_name, v_hash);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  if not rpg_record_ok(p_lv, p_dungeons, p_floors) then return jsonb_build_object('ok', false, 'reason', 'bad_record'); end if;
  insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values (v_hash, v_name, p_lv, p_dungeons, p_floors);
  return jsonb_build_object('ok', true) || rpg_rank_of(p_lv, p_dungeons, p_floors);
end $$;
revoke all on function rpg_register(text, text, int, int, int) from public;
grant execute on function rpg_register(text, text, int, int, int) to anon;

-- 記録を新しくする（それぞれ今までの最高を残す）。10秒以内の連投は断る
create or replace function rpg_update(p_token text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_row rpg_players;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if not rpg_record_ok(p_lv, p_dungeons, p_floors) then return jsonb_build_object('ok', false, 'reason', 'bad_record'); end if;
  select * into v_row from rpg_players where token_hash = v_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_row.updated_at > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  update rpg_players set lv = greatest(lv, p_lv), dungeons = greatest(dungeons, p_dungeons), floors = greatest(floors, p_floors), updated_at = now()
    where id = v_row.id returning * into v_row;
  return jsonb_build_object('ok', true) || rpg_rank_of(v_row.lv, v_row.dungeons, v_row.floors);
end $$;
revoke all on function rpg_update(text, int, int, int) from public;
grant execute on function rpg_update(text, int, int, int) to anon;

-- 名前だけ変える（記録はそのまま）。10秒以内の連投は断る
create or replace function rpg_rename(p_token text, p_nickname text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_name text := btrim(p_nickname, E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
  v_row rpg_players;
  v_why text;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  perform pg_advisory_xact_lock(hashtext('rpgname:' || coalesce(lower(normalize(v_name, NFKC)), '')));
  select * into v_row from rpg_players where token_hash = v_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_why := rpg_name_problem(v_name, v_hash);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  if v_row.updated_at > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  update rpg_players set nickname = v_name, updated_at = now() where id = v_row.id;
  return jsonb_build_object('ok', true, 'nickname', v_name);
end $$;
revoke all on function rpg_rename(text, text) from public;
grant execute on function rpg_rename(text, text) to anon;

-- 冒険データを消したときに、その端末の行を消す（ランキングからも消える）。もう無ければ not_found
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

-- 上位50人。p_sort は 'lv' か 'dg'。それ以外は空。created_at は最後に記録が変わった時刻（前の形と列をそろえて関数を作り直さずに済むようにしている）
create or replace function top_rpg(p_sort text)
returns table(nickname text, lv int, dungeons int, floors int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_sort is null or p_sort not in ('lv', 'dg') then return; end if;
  if p_sort = 'lv' then
    return query select p.nickname, p.lv, p.dungeons, p.floors, p.updated_at from rpg_players p
      order by p.lv desc, p.dungeons desc, p.floors desc, p.created_at limit 50;
  else
    return query select p.nickname, p.lv, p.dungeons, p.floors, p.updated_at from rpg_players p
      order by p.dungeons desc, p.floors desc, p.lv desc, p.created_at limit 50;
  end if;
end $$;
revoke all on function top_rpg(text) from public;
grant execute on function top_rpg(text) to anon;

-- ---- 冒険ランキングのかざり（プロフィールに飾る国旗を3つまで） ----
-- サーバーは冒険のデータを持たないので「本当に持っている仲間か」は確かめない。見た目だけのもの（2026-10-27）
alter table rpg_players add column if not exists deco text[] not null default '{}';   -- 国コード 0〜3個
alter table rpg_players add column if not exists deco_at timestamptz;                  -- 最後にかざりを変えた時刻（連投よけ）

-- 195か国の国コード（countries.js と同じ並び。tests/unit/ranking.test.mjs で一致を確かめる）
create or replace function rpg_codes() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['af', 'al', 'dz', 'ad', 'ao', 'ag', 'ar', 'am', 'au', 'at', 'az', 'bs', 'bh', 'bd', 'bb', 'by', 'be', 'bz', 'bj', 'bt',
               'bo', 'ba', 'bw', 'br', 'bn', 'bg', 'bf', 'bi', 'cv', 'kh', 'cm', 'ca', 'cf', 'td', 'cl', 'cn', 'co', 'km', 'cg', 'cd',
               'cr', 'ci', 'hr', 'cu', 'cy', 'cz', 'dk', 'dj', 'dm', 'do', 'ec', 'eg', 'sv', 'gq', 'er', 'ee', 'sz', 'et', 'fj', 'fi',
               'fr', 'ga', 'gm', 'ge', 'de', 'gh', 'gr', 'gd', 'gt', 'gn', 'gw', 'gy', 'ht', 'va', 'hn', 'hu', 'is', 'in', 'id', 'ir',
               'iq', 'ie', 'il', 'it', 'jm', 'jp', 'jo', 'kz', 'ke', 'ki', 'kp', 'kr', 'xk', 'kw', 'kg', 'la', 'lv', 'lb', 'ls', 'lr',
               'ly', 'li', 'lt', 'lu', 'mg', 'mw', 'my', 'mv', 'ml', 'mt', 'mh', 'mr', 'mu', 'mx', 'fm', 'md', 'mc', 'mn', 'me', 'ma',
               'mz', 'mm', 'na', 'nr', 'np', 'nl', 'nz', 'ni', 'ne', 'ng', 'mk', 'no', 'om', 'pk', 'pw', 'pa', 'pg', 'py', 'pe', 'ph',
               'pl', 'pt', 'qa', 'ro', 'ru', 'rw', 'kn', 'lc', 'vc', 'ws', 'sm', 'st', 'sa', 'sn', 'rs', 'sc', 'sl', 'sg', 'sk', 'si',
               'sb', 'so', 'za', 'ss', 'es', 'lk', 'sd', 'sr', 'se', 'ch', 'sy', 'tj', 'tz', 'th', 'tl', 'tg', 'to', 'tt', 'tn', 'tr',
               'tm', 'tv', 'ug', 'ua', 'ae', 'gb', 'us', 'uy', 'uz', 'vu', 've', 'vn', 'ye', 'zm', 'zw']
$$;
revoke all on function rpg_codes() from public, anon, authenticated;

-- かざりを変える（3つまで・重なり無し・rpg_codes() のどれか）。10秒以内の連投は断る（deco_at で数える。rpg_update の updated_at とは別）
create or replace function rpg_set_deco(p_token text, p_deco text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_row rpg_players;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if p_deco is null or cardinality(p_deco) > 3 or coalesce(array_ndims(p_deco), 1) <> 1
     or array_position(p_deco, null) is not null
     or not (p_deco <@ rpg_codes())
     or (select count(distinct x) from unnest(p_deco) x) <> cardinality(p_deco) then
    return jsonb_build_object('ok', false, 'reason', 'bad_deco');
  end if;
  select * into v_row from rpg_players where token_hash = v_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_row.deco_at > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  update rpg_players set deco = p_deco, deco_at = now() where id = v_row.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function rpg_set_deco(text, text[]) from public;
grant execute on function rpg_set_deco(text, text[]) to anon;

-- 上位50人（かざりつき）。並びは top_rpg と同じ。top_rpg は返す列の形を変えると drop が要るので新しい名前で作り、
-- 古い top_rpg はキャッシュに残った古い rpg-rank.js のために残す
create or replace function top_rpg2(p_sort text)
returns table(nickname text, lv int, dungeons int, floors int, deco text[], created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_sort is null or p_sort not in ('lv', 'dg') then return; end if;
  if p_sort = 'lv' then
    return query select p.nickname, p.lv, p.dungeons, p.floors, p.deco, p.updated_at from rpg_players p
      order by p.lv desc, p.dungeons desc, p.floors desc, p.created_at limit 50;
  else
    return query select p.nickname, p.lv, p.dungeons, p.floors, p.deco, p.updated_at from rpg_players p
      order by p.dungeons desc, p.floors desc, p.lv desc, p.created_at limit 50;
  end if;
end $$;
revoke all on function top_rpg2(text) from public;
grant execute on function top_rpg2(text) to anon;

-- PostgREST に関数が増えたことを知らせる
notify pgrst, 'reload schema';

-- ---- 今日の難問（毎日1回のチャレンジ） ----
-- 日本時間の1日ごとのランキング。全問正解ならクリアタイム、途中でまちがえたらそこまでの正答数とタイムを載せる。
-- 同じ日に同じニックネームは1回だけ（2回目は name_taken。全角半角・大文字小文字のちがいは同じ名前）。端末ごとの1日1回はブラウザ側で守る。
-- 並べ方: 正答数が多い順（全問正解がいちばん上）→ タイムが短い順 → 先に載せた順
-- 変な記録は Table Editor の daily_scores から行を消せばランキングからも消える
create table if not exists daily_scores (
  id bigint generated always as identity primary key,
  day date not null,               -- 日本時間の日付
  nickname text not null,          -- 前後空白を除いた1〜12文字
  correct int not null,            -- 正答数（0〜total）
  total int not null,              -- 問題数
  time_ms int not null,            -- 全問正解ならクリアタイム、途中で終わったらそこまでのタイム（ミリ秒）
  created_at timestamptz not null default now()
);
-- 同じ日に同じ名前は1回だけ。全角半角・大文字小文字のちがいも同じ名前とみなす（なりすまし防止）
create unique index if not exists daily_scores_day_name on daily_scores (day, lower(normalize(nickname, NFKC)));
create index if not exists daily_scores_day_rank on daily_scores (day, correct desc, time_ms, created_at);
alter table daily_scores enable row level security;
revoke all on daily_scores from anon, authenticated;

-- 問題数（daily-core.js の COUNT と同じにしておくこと）
create or replace function daily_count() returns int
language sql immutable set search_path = public, pg_temp as $$ select 20 $$;
revoke all on function daily_count() from public, anon, authenticated;

-- 'YYYY-MM-DD' を日付に。形がおかしい・ありえない日付は null
create or replace function daily_day(p_day text) returns date
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p_day::date;
exception when others then return null;
end $$;
revoke all on function daily_day(text) from public, anon, authenticated;

-- その日に、この記録より上の人数＋1。同じ記録は同じ順位
create or replace function daily_rank_of(p_day text, p_correct int, p_time_ms int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_day date := daily_day(p_day);
begin
  if v_day is null or p_correct is null or p_time_ms is null then return jsonb_build_object('rank', null); end if;
  return jsonb_build_object('rank', (select count(*) + 1 from daily_scores
    where day = v_day and (correct > p_correct or (correct = p_correct and time_ms < p_time_ms))));
end $$;
revoke all on function daily_rank_of(text, int, int) from public;
grant execute on function daily_rank_of(text, int, int) to anon;

-- p_at の時点で、その日の記録を受け付けるか。日本時間の今日だけ。0時をまたいで遊んだ人のために、0時30分までは昨日も受け付ける
create or replace function daily_day_open(p_day date, p_at timestamptz) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_day = (p_at at time zone 'Asia/Tokyo')::date
      or (p_day = (p_at at time zone 'Asia/Tokyo')::date - 1
          and (p_at at time zone 'Asia/Tokyo') - (p_at at time zone 'Asia/Tokyo')::date < interval '30 min')
$$;
revoke all on function daily_day_open(date, timestamptz) from public, anon, authenticated;

-- 記録を受け付ける。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank":n}
create or replace function submit_daily(p_day text, p_nickname text, p_correct int, p_total int, p_time_ms int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_day date := daily_day(p_day);
  v_name text := btrim(p_nickname, E' \t\n\r\f\u000b\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff');
  v_norm text := lower(normalize(v_name, NFKC));
  v_id bigint;
begin
  if v_day is null or not daily_day_open(v_day, now()) then
    return jsonb_build_object('ok', false, 'reason', 'bad_day');
  end if;
  if p_total is distinct from daily_count() or p_correct is null or p_correct not between 0 and p_total then
    return jsonb_build_object('ok', false, 'reason', 'bad_record');
  end if;
  if v_name is null or char_length(v_name) not between 1 and 12 then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then
    return jsonb_build_object('ok', false, 'reason', 'ng_name');
  end if;
  if p_time_ms is null or p_time_ms < greatest(p_correct, 1) * 400 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  if p_time_ms > 10800000 then
    return jsonb_build_object('ok', false, 'reason', 'too_slow');
  end if;
  insert into daily_scores (day, nickname, correct, total, time_ms) values (v_day, v_name, p_correct, p_total, p_time_ms)
    on conflict (day, lower(normalize(nickname, NFKC))) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'name_taken'); end if;
  return jsonb_build_object('ok', true) || daily_rank_of(p_day, p_correct, p_time_ms);
end $$;
revoke all on function submit_daily(text, text, int, int, int) from public;
grant execute on function submit_daily(text, text, int, int, int) to anon;

-- その日の上位50件。日付がおかしければ空
create or replace function top_daily(p_day text)
returns table(nickname text, correct int, total int, time_ms int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_day date := daily_day(p_day);
begin
  if v_day is null then return; end if;
  return query
    select d.nickname, d.correct, d.total, d.time_ms, d.created_at from daily_scores d
    where d.day = v_day
    order by d.correct desc, d.time_ms, d.created_at
    limit 50;
end $$;
revoke all on function top_daily(text) from public;
grant execute on function top_daily(text) to anon;
