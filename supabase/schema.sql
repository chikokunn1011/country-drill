-- 195か国ドリル タイムアタックのランキング用（Supabase）
-- 使い方: 何度流しても大丈夫。手元のテスト（tests/sql/run.sh）は全部流すが、本番は下の「本番に流すとき」のとおり区切りごとに流す（全部まとめて Run しない）。
-- ブラウザ（anon）からはテーブルを直接さわれない。呼べるのはタイムアタックの submit_score2 / top_scores2 / rank_of と、
-- 冒険の rpg_update2 / rpg_unregister2 / top_rpg3 / rpg_rank_of と、
-- 今日の難問の submit_daily2 / top_daily2 / daily_rank_of と、
-- サイト共通のプロフィールの profile_create / profile_me / profile_rename / profile_set / profile_card /
-- profile_transfer_start / profile_transfer_claim だけ。
-- 前の版のページのための古い関数（submit_score / top_scores / rpg_register / rpg_update / rpg_rename / rpg_unregister / rpg_set_deco /
-- top_rpg / top_rpg2 / submit_daily / top_daily）も残している。名前を送って書きこむものはこのファイルの最後で old_version を返す中身に入れかえる。
-- 本番に流すとき: ① 「>>> SQL Editor」〜「<<< SQL Editor」の間と「>>> old_version」〜「<<< old_version」の間を除いた部分を流す（MCP の apply_migration。中に delete は無い）。
-- ② 「>>> SQL Editor」〜「<<< SQL Editor」の間（中に delete がある関数）は SQL Editor で Run する。
-- ⑤ サイトを公開した後に「>>> old_version」〜「<<< old_version」の間を流す（古い関数を止めて、その間に残った冒険ランキングの行も引っ越す）。
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
-- 人の区別はプロフィールがあれば profile_id、プロフィールより前の古い記録は名前（profile_id の列は下の「サイト共通のプロフィール」で足す）
create or replace function rank_of(p_board text, p_time_ms int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  week_start timestamptz := jst_week_start();
begin
  return jsonb_build_object(
    'rank_all', (select count(*) + 1 from (
      select 1 from scores where board = p_board group by coalesce('p' || profile_id, 'n:' || nickname) having min(time_ms) < p_time_ms) b),
    'rank_week', (select count(*) + 1 from (
      select 1 from scores where board = p_board and created_at >= week_start group by coalesce('p' || profile_id, 'n:' || nickname) having min(time_ms) < p_time_ms) b));
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
  lv int not null,                       -- 旅人のレベル（1〜99）
  dungeons int not null,                 -- ボスを倒したダンジョンの数（0〜21）
  floors int not null,                   -- クリアしたフロアの合計（0〜105。ダンジョン1つは5フロア）
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
-- 上限は第3章（21ダンジョン・105フロア）まで先に広げてある
create or replace function rpg_record_ok(p_lv int, p_dungeons int, p_floors int) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_lv between 1 and 99 and p_dungeons between 0 and 21 and p_floors between 0 and 105 and p_dungeons * 5 <= p_floors, false)
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
  -- 同じ名前・同じ合言葉の同時送信が両方通らないように順番待ち（pfname: は profile_create と同じ鍵）
  perform pg_advisory_xact_lock(hashtext('rpgname:' || coalesce(lower(normalize(v_name, NFKC)), '')));
  perform pg_advisory_xact_lock(hashtext('pfname:' || coalesce(lower(normalize(v_name, NFKC)), '')));
  perform pg_advisory_xact_lock(hashtext('rpgtoken:' || p_token));
  if exists (select 1 from rpg_players where token_hash = v_hash) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  v_why := rpg_name_problem(v_name, v_hash);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  -- プロフィールができた後（old_version に入れかえるまで）は、ほかのプロフィールの名前も使えない
  if exists (select 1 from profiles where lower(normalize(nickname, NFKC)) = lower(normalize(v_name, NFKC)) and token_hash is distinct from v_hash) then
    return jsonb_build_object('ok', false, 'reason', 'name_taken');
  end if;
  if not rpg_record_ok(p_lv, p_dungeons, p_floors) then return jsonb_build_object('ok', false, 'reason', 'bad_record'); end if;
  insert into rpg_players (token_hash, nickname, lv, dungeons, floors) values (v_hash, v_name, p_lv, p_dungeons, p_floors);
  -- その場でプロフィールにする（新しい版を開いたとき、この合言葉で profile_me が通るように）
  perform profile_migrate_rpg();
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

-- 冒険データを消すとき（rpg_unregister）は中に delete があるので、ファイルの下の「>>> SQL Editor」の間に置いている

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

-- ---- サイト共通のプロフィール ----
-- 1つの端末に1つ。タイムアタック・今日の難問・冒険のランキングはこのプロフィールで載せる（2026-10-28）
-- はじめて作るとき（profile_create）に端末が作った合言葉（p_token）を送り、DB にはそのハッシュ（rpg_hash）だけ残す。
-- ランキングに出すのは公開用の pid（12文字の英数字、合言葉とは別）だけで、名前を押すと profile_card で窓の中身を返す。
-- 名前は全角半角・大文字小文字をそろえて、ほかのプロフィールと同じものは使えない。
-- 引き継ぎ: 前の端末が profile_transfer_start でデータを預けてコードをもらい、新しい端末が profile_transfer_claim でコードを入れると
-- 合言葉が新しい端末のものに入れかわる（前の端末は not_found になる）。コードは24時間・1回だけ
-- （返事が届かなかった端末がやり直せるように、使ったあとも期限までは、同じ新しい合言葉でなら同じ返事を返す）
create table if not exists profiles (
  id bigint generated always as identity primary key,
  pid text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),  -- 公開用のID
  token_hash bytea not null unique,      -- sha256(合言葉)
  nickname text not null,                -- 前後空白を除いた1〜12文字
  is_public boolean not null default true,
  title text not null default '',        -- いまつけている称号（40文字まで）
  deco text[] not null default '{}',     -- かざり（rpg_codes() の国コード、3つまで、重なり無し）
  badges int not null default 0,         -- 取ったバッジの数
  badges_total int not null default 0,   -- バッジの全部の数（表示用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- ほかのプロフィールと同じ名前は使えない。全角半角・大文字小文字のちがいも同じ名前とみなす
create unique index if not exists profiles_name on profiles (lower(normalize(nickname, NFKC)));
alter table profiles enable row level security;
revoke all on profiles from anon, authenticated;

create table if not exists profile_transfers (
  id bigint generated always as identity primary key,
  code_hash bytea not null unique,       -- sha256(コード。ハイフン抜き・大文字)
  profile_id bigint not null references profiles(id),
  data jsonb,                            -- 預けたデータ。出し直したら・期限が過ぎたら（次の start で）null にする。使っても期限までは残す
  expires_at timestamptz not null,       -- 出してから24時間
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profile_transfers_profile on profile_transfers (profile_id, created_at);
alter table profile_transfers enable row level security;
revoke all on profile_transfers from anon, authenticated;

-- 今の表にプロフィールの列を足す（null = プロフィールより前の古い記録）
alter table scores add column if not exists profile_id bigint references profiles(id);
create index if not exists scores_board_profile on scores (board, profile_id);
alter table daily_scores add column if not exists profile_id bigint references profiles(id);
create unique index if not exists daily_scores_day_profile on daily_scores (day, profile_id) where profile_id is not null;
alter table rpg_players add column if not exists profile_id bigint unique references profiles(id);

-- 名前の前後の空白を落とす（JS の trim() と同じ文字。submit_score と同じ並び）
create or replace function profile_clean_name(p_name text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select btrim(p_name, E' \t\n\r\f\u000b                 　﻿')
$$;
revoke all on function profile_clean_name(text) from public, anon, authenticated;

-- 名前の確認。だめなら理由、よければ null（p_id のプロフィールが今使っている名前はよい）
create or replace function profile_name_problem(p_name text, p_id bigint) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_norm text := lower(normalize(p_name, NFKC));
begin
  if p_name is null or char_length(p_name) not between 1 and 12 then return 'bad_name'; end if;
  if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then return 'ng_name'; end if;
  if exists (select 1 from profiles where lower(normalize(nickname, NFKC)) = v_norm and id is distinct from p_id) then return 'name_taken'; end if;
  return null;
end $$;
revoke all on function profile_name_problem(text, bigint) from public, anon, authenticated;

-- 合言葉のプロフィール。無ければ全部の列が null の行
create or replace function profile_by_token(p_token text) returns profiles
language sql stable set search_path = public, pg_temp as $$
  select * from profiles where token_hash = rpg_hash(p_token)
$$;
revoke all on function profile_by_token(text) from public, anon, authenticated;

-- プロフィールを作る。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"pid":...,"nickname":...}
create or replace function profile_create(p_token text, p_nickname text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_name text := profile_clean_name(p_nickname);
  v_why text;
  v_pid text;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  -- 同じ名前・同じ合言葉の同時送信が両方通らないように順番待ち
  perform pg_advisory_xact_lock(hashtext('pfname:' || coalesce(lower(normalize(v_name, NFKC)), '')));
  perform pg_advisory_xact_lock(hashtext('pftoken:' || p_token));
  if exists (select 1 from profiles where token_hash = v_hash) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  v_why := profile_name_problem(v_name, null);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  insert into profiles (token_hash, nickname) values (v_hash, v_name) returning pid into v_pid;
  return jsonb_build_object('ok', true, 'pid', v_pid, 'nickname', v_name);
end $$;
revoke all on function profile_create(text, text) from public;
grant execute on function profile_create(text, text) to anon;

-- 自分のプロフィール。無ければ not_found（別の端末に引き継がれた・消された）
create or replace function profile_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_p profiles;
begin
  if rpg_hash(p_token) is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  v_p := profile_by_token(p_token);
  if v_p.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'pid', v_p.pid, 'nickname', v_p.nickname, 'is_public', v_p.is_public,
                            'title', v_p.title, 'deco', to_jsonb(v_p.deco));
end $$;
revoke all on function profile_me(text) from public;
grant execute on function profile_me(text) to anon;

-- 名前を変える。表示は profiles から取るが、Table Editor で見やすいように今の表のこの人の行の nickname もそろえる
-- （daily_scores と rpg_players は名前に unique があるので、古い記録とぶつかる行はそのままにする）
create or replace function profile_rename(p_token text, p_nickname text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_name text := profile_clean_name(p_nickname);
  v_norm text := lower(normalize(v_name, NFKC));
  v_id bigint;
  v_why text;
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  perform pg_advisory_xact_lock(hashtext('pfname:' || coalesce(v_norm, '')));
  select id into v_id from profiles where token_hash = v_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  v_why := profile_name_problem(v_name, v_id);
  if v_why is not null then return jsonb_build_object('ok', false, 'reason', v_why); end if;
  update profiles set nickname = v_name, updated_at = now() where id = v_id;
  update scores set nickname = v_name where profile_id = v_id;
  update daily_scores d set nickname = v_name where d.profile_id = v_id
    and not exists (select 1 from daily_scores o where o.day = d.day and o.id <> d.id and lower(normalize(o.nickname, NFKC)) = v_norm);
  update rpg_players r set nickname = v_name where r.profile_id = v_id
    and not exists (select 1 from rpg_players o where o.id <> r.id and o.nickname = v_name);
  return jsonb_build_object('ok', true, 'nickname', v_name);
end $$;
revoke all on function profile_rename(text, text) from public;
grant execute on function profile_rename(text, text) to anon;

-- 公開・称号・かざり・バッジの数を一度に変える。null の引数は変えない
create or replace function profile_set(p_token text, p_is_public boolean, p_title text, p_deco text[], p_badges int, p_badges_total int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  -- かざりの確かめ方は rpg_set_deco と同じ（3つまで・重なり無し・rpg_codes() のどれか）
  if p_deco is not null and (cardinality(p_deco) > 3 or coalesce(array_ndims(p_deco), 1) <> 1
     or array_position(p_deco, null) is not null
     or not (p_deco <@ rpg_codes())
     or (select count(distinct x) from unnest(p_deco) x) <> cardinality(p_deco)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_deco');
  end if;
  if char_length(p_title) > 40 or p_badges not between 0 and 500 or p_badges_total not between 0 and 500 then
    return jsonb_build_object('ok', false, 'reason', 'bad_record');
  end if;
  -- 称号も窓の名前の横に出るので、名前と同じ NG ワード（NFKC＋小文字にして部分一致）で止める
  if exists (select 1 from unnest(ng_words()) w where strpos(lower(normalize(p_title, NFKC)), w) > 0) then
    return jsonb_build_object('ok', false, 'reason', 'ng_name');
  end if;
  update profiles set is_public = coalesce(p_is_public, is_public), title = coalesce(p_title, title), deco = coalesce(p_deco, deco),
                      badges = coalesce(p_badges, badges), badges_total = coalesce(p_badges_total, badges_total), updated_at = now()
    where token_hash = v_hash;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function profile_set(text, boolean, text, text[], int, int) from public;
grant execute on function profile_set(text, boolean, text, text[], int, int) to anon;

-- ランキングの名前を押したときの窓の中身。非公開なら名前とかざりだけ。無ければ not_found
-- ta はタイムアタックの board ごとの自己ベストのうち順位（歴代）が良い3つ（同じ順位は速い順）
-- since は作った時刻（日本時間の日付にするのはブラウザ側。日本時間の区切りは jst_week_start と daily_day_open にだけ書く）
create or replace function profile_card(p_pid text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_p profiles;
begin
  select * into v_p from profiles where pid = p_pid;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not v_p.is_public then
    return jsonb_build_object('ok', true, 'private', true, 'pid', v_p.pid, 'nickname', v_p.nickname, 'deco', to_jsonb(v_p.deco));
  end if;
  return jsonb_build_object('ok', true, 'private', false, 'pid', v_p.pid, 'nickname', v_p.nickname, 'title', v_p.title,
    'deco', to_jsonb(v_p.deco), 'badges', v_p.badges, 'badges_total', v_p.badges_total,
    'rpg', (select jsonb_build_object('lv', r.lv, 'dungeons', r.dungeons) from rpg_players r where r.profile_id = v_p.id),
    'ta', coalesce((select jsonb_agg(jsonb_build_object('board', t.board, 'time_ms', t.time_ms, 'rank', t.rank) order by t.rank, t.time_ms, t.board)
      from (select b.board, b.time_ms, (rank_of(b.board, b.time_ms)->>'rank_all')::int as rank
            from (select s.board, min(s.time_ms) as time_ms from scores s where s.profile_id = v_p.id group by s.board) b
            order by 3, 2, 1 limit 3) t), '[]'::jsonb),
    'daily', (select jsonb_build_object('plays', count(*), 'perfect', count(*) filter (where d.correct = d.total))
      from daily_scores d where d.profile_id = v_p.id),
    'since', v_p.created_at);
end $$;
revoke all on function profile_card(text) from public;
grant execute on function profile_card(text) to anon;

-- 引き継ぎコードを出す。前のコードは使えなくしてから、新しいコード（ハイフン無し12文字）を作って返す
-- 文字は 0/O/1/I を除いた32文字。gen_random_uuid() のバイトの下5ビットを使う（拡張なしで動くように。
-- 7バイトめは下5ビットにバージョンの決まったビットが入るので飛ばす）
create or replace function profile_transfer_start(p_token text, p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_hash bytea := rpg_hash(p_token);
  v_id bigint;
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  v_expires timestamptz := now() + interval '24 hours';
begin
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  select id into v_id from profiles where token_hash = v_hash for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then return jsonb_build_object('ok', false, 'reason', 'bad_record'); end if;
  if octet_length(p_data::text) > 524288 then return jsonb_build_object('ok', false, 'reason', 'too_big'); end if;
  if exists (select 1 from profile_transfers where profile_id = v_id and created_at > now() - interval '1 minute') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  for i in 0..12 loop
    continue when i = 6;
    v_code := v_code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(v_bytes, i) % 32 + 1, 1);
  end loop;
  -- この人の前のコードは使えなくする（使ったあとのやり直し用に残していた data も消す）
  update profile_transfers set data = null, expires_at = least(expires_at, now())
    where profile_id = v_id and data is not null;
  -- 期限の過ぎた物の data は、誰かが次に start したときに消す
  update profile_transfers set data = null where data is not null and expires_at <= now();
  insert into profile_transfers (code_hash, profile_id, data, expires_at)
    values (sha256(convert_to(v_code, 'UTF8')), v_id, p_data, v_expires);
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_expires);
end $$;
revoke all on function profile_transfer_start(text, jsonb) from public;
grant execute on function profile_transfer_start(text, jsonb) to anon;

-- 引き継ぎコードを使う。ハイフン・空白・小文字は許す。使えるコード（期限内・未使用）なら合言葉を新しい端末のものに入れかえて、預けたデータを返す
-- 使ったあとも期限内なら、同じ新しい合言葉（＝もうこのプロフィールの合言葉）でのやり直しには同じ返事を返す（返事が届かなかった端末のため）。
-- ちがう合言葉なら bad_code
create or replace function profile_transfer_claim(p_code text, p_new_token text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  v_hash bytea := rpg_hash(p_new_token);
  v_t profile_transfers;
  v_p profiles;
begin
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$' then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if v_hash is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  select * into v_t from profile_transfers
    where code_hash = sha256(convert_to(v_code, 'UTF8')) and expires_at > now() and data is not null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  if v_t.used_at is not null then
    select * into v_p from profiles where id = v_t.profile_id;
    if v_p.token_hash is distinct from v_hash then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
    return jsonb_build_object('ok', true, 'pid', v_p.pid, 'nickname', v_p.nickname, 'data', v_t.data);
  end if;
  -- 新しい合言葉がもうほかのプロフィール（か冒険ランキングの行）のものなら入れかえられない（端末は合言葉を作り直して送る）
  if exists (select 1 from profiles where token_hash = v_hash) or exists (select 1 from rpg_players where token_hash = v_hash) then
    return jsonb_build_object('ok', false, 'reason', 'bad_token');
  end if;
  update profiles set token_hash = v_hash, updated_at = now() where id = v_t.profile_id returning * into v_p;
  -- 冒険ランキングの行の合言葉もそろえる（古い rpg_unregister も新しい端末の合言葉で動くように）
  update rpg_players set token_hash = v_hash where profile_id = v_t.profile_id;
  update profile_transfers set used_at = now() where id = v_t.id;
  return jsonb_build_object('ok', true, 'pid', v_p.pid, 'nickname', v_p.nickname, 'data', v_t.data);
end $$;
revoke all on function profile_transfer_claim(text, text) from public;
grant execute on function profile_transfer_claim(text, text) to anon;

-- 引っ越し: プロフィールより前に冒険ランキングに載っていた人を、同じ合言葉・名前・かざりのプロフィールにする（何度呼んでも増えない）
-- 名前がほかのプロフィールとぶつかる行も宙に浮かせない。「名前の前7文字#pid の前4文字」（12文字まで）のプロフィールにする。
-- 同じ合言葉なので本人の端末はそのプロフィールを使え、名前はあとで変えられる（ぶつかった相手のプロフィールにはつながない。同じ人とは限らないので）
create or replace function profile_migrate_rpg() returns void
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_r rpg_players;
  v_pid text;
begin
  for v_r in select * from rpg_players x
           where x.profile_id is null and not exists (select 1 from profiles p where p.token_hash = x.token_hash)
           order by x.created_at loop
    insert into profiles (token_hash, nickname, deco, created_at) values (v_r.token_hash, v_r.nickname, v_r.deco, v_r.created_at)
      on conflict do nothing;
    -- 名前がぶつかって入らなかったら、pid を先に決めて名前につける（pid までぶつかったら作り直す）
    while not exists (select 1 from profiles p where p.token_hash = v_r.token_hash) loop
      v_pid := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
      insert into profiles (pid, token_hash, nickname, deco, created_at)
        values (v_pid, v_r.token_hash, left(v_r.nickname, 7) || '#' || left(v_pid, 4), v_r.deco, v_r.created_at)
        on conflict do nothing;
    end loop;
  end loop;
  update rpg_players r set profile_id = p.id from profiles p
    where r.profile_id is null and p.token_hash = r.token_hash;
end $$;
revoke all on function profile_migrate_rpg() from public, anon, authenticated;
do $$ begin perform profile_migrate_rpg(); end $$;

-- ---- ランキングをプロフィールで載せる ----
-- タイムアタック・今日の難問・冒険の記録は、名前の代わりにプロフィールの合言葉で送る（2026-10-28）
-- 表の nickname にはプロフィールのいまの名前を入れる（Table Editor で見やすいように）。ランキングに出す名前・かざりは profiles から取る
-- 人の区別はプロフィールがあれば profile_id、プロフィールより前の古い記録は名前（coalesce('p' || profile_id, 'n:' || nickname)）

-- 記録を受け付ける。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank_all":n,"rank_week":n}（順位は自己ベストの。チェックの値は submit_score と同じ）
create or replace function submit_score2(p_token text, p_board text, p_time_ms int, p_questions int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cnt text := split_part(p_board, ':', 3);
  v_p profiles;
  v_best int;
  v_best_week int;
begin
  if rpg_hash(p_token) is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if not coalesce(p_board ~ '^(f2n|n2f|m2f|f2m):(all|asia|europe|africa|namerica|samerica|oceania):(5|10|20|all)$', false)
     or p_questions is null
     or (v_cnt = 'all' and p_questions not between 1 and 195)
     or (v_cnt <> 'all' and p_questions::text <> v_cnt) then
    return jsonb_build_object('ok', false, 'reason', 'bad_board');
  end if;
  if p_time_ms is null or p_time_ms < p_questions * 400 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  if p_time_ms > 10800000 then
    return jsonb_build_object('ok', false, 'reason', 'too_slow');
  end if;
  v_p := profile_by_token(p_token);
  if v_p.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- 同じ board・同じ人の同時送信が両方通らないように、確認から登録までを順番待ちにする
  perform pg_advisory_xact_lock(hashtext('pfscore:' || p_board || ':' || v_p.id));
  if exists (select 1 from scores where board = p_board and profile_id = v_p.id and created_at > now() - interval '10 seconds') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  insert into scores (board, nickname, time_ms, questions, profile_id) values (p_board, v_p.nickname, p_time_ms, p_questions, v_p.id);
  -- 返す順位は今回のタイムではなく自己ベスト（歴代は歴代の、今週は今週の）の順位。自己ベストより遅いと自分の自己ベストを数えて1つ下がるので
  -- （rank_of は同じタイムを数えないので、自分の自己ベストは入らない）
  select min(time_ms), min(time_ms) filter (where created_at >= jst_week_start()) into v_best, v_best_week
    from scores where board = p_board and profile_id = v_p.id;
  return jsonb_build_object('ok', true, 'rank_all', rank_of(p_board, v_best)->'rank_all', 'rank_week', rank_of(p_board, v_best_week)->'rank_week');
end $$;
revoke all on function submit_score2(text, text, int, int) from public;
grant execute on function submit_score2(text, text, int, int) to anon;

-- 上位50件（同じ人は最速1件）。p_period は 'all' か 'week'。それ以外は空。古い記録は pid が null・deco が空
create or replace function top_scores2(p_board text, p_period text)
returns table(nickname text, pid text, deco text[], time_ms int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  week_start timestamptz := jst_week_start();
begin
  if p_period is null or p_period not in ('all', 'week') then return; end if;
  return query
    select coalesce(p.nickname, b.nickname), p.pid, coalesce(p.deco, '{}'), b.time_ms, b.created_at from (
      select distinct on (coalesce('p' || s.profile_id, 'n:' || s.nickname)) s.nickname, s.profile_id, s.time_ms, s.created_at from scores s
      where s.board = p_board and (p_period = 'all' or s.created_at >= week_start)
      order by coalesce('p' || s.profile_id, 'n:' || s.nickname), s.time_ms, s.created_at
    ) b
    left join profiles p on p.id = b.profile_id
    order by b.time_ms, b.created_at
    limit 50;
end $$;
revoke all on function top_scores2(text, text) from public;
grant execute on function top_scores2(text, text) to anon;

-- 今日の難問の記録を受け付ける。1日1回は profile_id で（2回目は already）。だめなら {"ok":false,"reason":...}、通れば {"ok":true,"rank":n}
-- 表の名前の unique（同じ日に同じ名前は1回）は古い記録のためのもの。同じ日に同じ名前の古い記録があれば、表の nickname は「名前#pid」にする
create or replace function submit_daily2(p_token text, p_day text, p_correct int, p_total int, p_time_ms int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_day date := daily_day(p_day);
  v_p profiles;
  v_name text;
  v_id bigint;
begin
  if rpg_hash(p_token) is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if v_day is null or not daily_day_open(v_day, now()) then
    return jsonb_build_object('ok', false, 'reason', 'bad_day');
  end if;
  if p_total is distinct from daily_count() or p_correct is null or p_correct not between 0 and p_total then
    return jsonb_build_object('ok', false, 'reason', 'bad_record');
  end if;
  if p_time_ms is null or p_time_ms < greatest(p_correct, 1) * 400 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;
  if p_time_ms > 10800000 then
    return jsonb_build_object('ok', false, 'reason', 'too_slow');
  end if;
  v_p := profile_by_token(p_token);
  if v_p.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from daily_scores where day = v_day and profile_id = v_p.id) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  v_name := case when exists (select 1 from daily_scores where day = v_day and lower(normalize(nickname, NFKC)) = lower(normalize(v_p.nickname, NFKC)))
                 then v_p.nickname || '#' || v_p.pid else v_p.nickname end;
  insert into daily_scores (day, nickname, correct, total, time_ms, profile_id) values (v_day, v_name, p_correct, p_total, p_time_ms, v_p.id)
    on conflict do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  return jsonb_build_object('ok', true) || daily_rank_of(p_day, p_correct, p_time_ms);
end $$;
revoke all on function submit_daily2(text, text, int, int, int) from public;
grant execute on function submit_daily2(text, text, int, int, int) to anon;

-- その日の上位50件（pid・かざりつき）。日付がおかしければ空
create or replace function top_daily2(p_day text)
returns table(nickname text, pid text, deco text[], correct int, total int, time_ms int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_day date := daily_day(p_day);
begin
  if v_day is null then return; end if;
  return query
    select coalesce(p.nickname, d.nickname), p.pid, coalesce(p.deco, '{}'), d.correct, d.total, d.time_ms, d.created_at from daily_scores d
    left join profiles p on p.id = d.profile_id
    where d.day = v_day
    order by d.correct desc, d.time_ms, d.created_at
    limit 50;
end $$;
revoke all on function top_daily2(text) from public;
grant execute on function top_daily2(text) to anon;

-- 冒険の記録を入れる／新しくする（行が無ければ作る。それぞれ今までの最高を残す）。10秒以内の連投は断る
-- 行の token_hash はプロフィールと同じ。同じ合言葉でプロフィールにつながっていない行（引っ越しで名前がぶつかった人）があれば、その行をつなぐ
-- 行の nickname はプロフィールの名前。ほかの行とぶつかるときは「名前#pid」にする（ランキングに出す名前は profiles から取る）
create or replace function rpg_update2(p_token text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_p profiles;
  v_row rpg_players;
begin
  if rpg_hash(p_token) is null then return jsonb_build_object('ok', false, 'reason', 'bad_token'); end if;
  if not rpg_record_ok(p_lv, p_dungeons, p_floors) then return jsonb_build_object('ok', false, 'reason', 'bad_record'); end if;
  v_p := profile_by_token(p_token);
  if v_p.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  -- 同じ人の同時送信で行が2つできないように順番待ち
  perform pg_advisory_xact_lock(hashtext('pfrpg:' || v_p.id));
  update rpg_players set profile_id = v_p.id where token_hash = v_p.token_hash and profile_id is null;
  select * into v_row from rpg_players where profile_id = v_p.id for update;
  if not found then
    insert into rpg_players (token_hash, nickname, lv, dungeons, floors, profile_id)
      values (v_p.token_hash,
              case when exists (select 1 from rpg_players where nickname = v_p.nickname) then v_p.nickname || '#' || v_p.pid else v_p.nickname end,
              p_lv, p_dungeons, p_floors, v_p.id)
      returning * into v_row;
    return jsonb_build_object('ok', true) || rpg_rank_of(v_row.lv, v_row.dungeons, v_row.floors);
  end if;
  if v_row.updated_at > now() - interval '10 seconds' then return jsonb_build_object('ok', false, 'reason', 'too_soon'); end if;
  update rpg_players set lv = greatest(lv, p_lv), dungeons = greatest(dungeons, p_dungeons), floors = greatest(floors, p_floors), updated_at = now()
    where id = v_row.id returning * into v_row;
  return jsonb_build_object('ok', true) || rpg_rank_of(v_row.lv, v_row.dungeons, v_row.floors);
end $$;
revoke all on function rpg_update2(text, int, int, int) from public;
grant execute on function rpg_update2(text, int, int, int) to anon;

-- 上位50人（pid・かざりつき）。並びは top_rpg2 と同じ。名前・かざりは profiles から（プロフィールにつながっていない行は rpg_players のもの）
create or replace function top_rpg3(p_sort text)
returns table(nickname text, pid text, deco text[], lv int, dungeons int, floors int, created_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if p_sort is null or p_sort not in ('lv', 'dg') then return; end if;
  if p_sort = 'lv' then
    return query select coalesce(f.nickname, r.nickname), f.pid, coalesce(f.deco, r.deco), r.lv, r.dungeons, r.floors, r.updated_at
      from rpg_players r left join profiles f on f.id = r.profile_id
      order by r.lv desc, r.dungeons desc, r.floors desc, r.created_at limit 50;
  else
    return query select coalesce(f.nickname, r.nickname), f.pid, coalesce(f.deco, r.deco), r.lv, r.dungeons, r.floors, r.updated_at
      from rpg_players r left join profiles f on f.id = r.profile_id
      order by r.dungeons desc, r.floors desc, r.lv desc, r.created_at limit 50;
  end if;
end $$;
revoke all on function top_rpg3(text) from public;
grant execute on function top_rpg3(text) to anon;

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

-- >>> old_version（本番ではサイトを公開した後にこの間を流す）
-- 前の版のページがキャッシュに残っている人のために、名前を送って書きこむ古い関数は残して、中身だけ「ページを読み直してね」にする。
-- 名前をプロフィールと別に送れる道を残さないため（drop はしない）。戻すときはこの間より上の元の中身を流し直す
create or replace function submit_score(p_board text, p_nickname text, p_time_ms int, p_questions int) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
create or replace function submit_daily(p_day text, p_nickname text, p_correct int, p_total int, p_time_ms int) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
create or replace function rpg_register(p_token text, p_nickname text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
create or replace function rpg_rename(p_token text, p_nickname text) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
create or replace function rpg_update(p_token text, p_lv int, p_dungeons int, p_floors int) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
create or replace function rpg_set_deco(p_token text, p_deco text[]) returns jsonb
language sql volatile security definer set search_path = public, pg_temp as $$
  select '{"ok":false,"reason":"old_version"}'::jsonb
$$;
-- ①〜ここまでの間に古いページの登録などで残った、プロフィールにつながっていない冒険ランキングの行を引っ越す
-- （古い関数を止めた後なので、ここから後に増えることは無い）
do $$ begin perform profile_migrate_rpg(); end $$;
notify pgrst, 'reload schema';
-- <<< old_version
