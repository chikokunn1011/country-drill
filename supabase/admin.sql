-- 管理用サイト（admin.html）の関数（Supabase）
-- 使い方: schema.sql のあとに、Supabase の SQL Editor にこのファイルを全部貼って Run。何度流しても大丈夫。
-- 中で行を消す（admin_delete）ので、SQL Editor から流す。
-- 呼べるのは「ログインしていて admins に居る人」だけ。anon は execute 権限が無い。ログインしただけの人は 'admin only'（42501）で断る。
-- 管理する人を足すとき（user_id は Authentication → Users の UID）:
--   insert into admins (user_id, note) values ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'チコ');

-- 管理する人。RLS ON・ポリシー無し＝関数を通さないと誰も読めない・書けない
create table if not exists admins (
  user_id uuid primary key,                    -- auth.users の id
  note text not null default '',               -- だれか（メモ）
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
revoke all on table admins from anon, authenticated;

-- 管理の操作の記録（消す・戻す・名前を変える）
create table if not exists admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,                                -- やった人
  action text,                                 -- 'delete' | 'restore' | 'rename'
  kind text,                                   -- 'scores' | 'daily' | 'rpg'
  detail jsonb                                 -- ids や before / after
);
alter table admin_log enable row level security;
revoke all on table admin_log from anon, authenticated;
revoke all on sequence admin_log_id_seq from anon, authenticated;

-- ごみ箱。消した行をまるごと jsonb で取っておき、30日のあいだは戻せる
create table if not exists admin_trash (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),       -- 消した時刻
  kind text not null,                          -- 'scores' | 'daily' | 'rpg'
  row_data jsonb not null,                     -- to_jsonb(消した行)
  restored_at timestamptz                      -- 戻した時刻（戻していなければ null）
);
create index if not exists admin_trash_at on admin_trash (at desc);
alter table admin_trash enable row level security;
revoke all on table admin_trash from anon, authenticated;
revoke all on sequence admin_trash_id_seq from anon, authenticated;

-- 関数はどれも security definer・search_path は public, pg_temp に固定。最初に admin_check() を呼ぶ

-- 呼んだ人が admins に居なければ例外（ログインしていない・ログインしただけの人）
create or replace function admin_check() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from admins where user_id = auth.uid()) then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke all on function admin_check() from public, anon;
grant execute on function admin_check() to authenticated;

-- ログインしたあとの確認用
create or replace function admin_whoami() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform admin_check();
  return jsonb_build_object('ok', true, 'user_id', auth.uid());
end $$;
revoke all on function admin_whoami() from public, anon;
grant execute on function admin_whoami() to authenticated;

-- 件数（全部・今日・今週。日本時間）と、最後に記録が入った時刻と、最近の操作5件
create or replace function admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_week timestamptz;
  v_today timestamptz;
begin
  perform admin_check();
  v_week := jst_week_start();
  -- 日本時間の今日0時。日本に夏時間は無いので、週の始まり（月曜0時）から丸1日ずつ足せばよい
  v_today := v_week + floor(extract(epoch from now() - v_week) / 86400) * interval '1 day';
  return jsonb_build_object(
    'ok', true,
    'counts', jsonb_build_object(
      'scores', (select count(*) from scores),
      'daily', (select count(*) from daily_scores),
      'rpg', (select count(*) from rpg_players)),
    'today', jsonb_build_object(
      'scores', (select count(*) from scores where created_at >= v_today),
      'daily', (select count(*) from daily_scores where created_at >= v_today)),
    'week', jsonb_build_object(
      'scores', (select count(*) from scores where created_at >= v_week),
      'daily', (select count(*) from daily_scores where created_at >= v_week)),
    'last_at', greatest(
      (select max(created_at) from scores),
      (select max(created_at) from daily_scores),
      (select max(greatest(created_at, updated_at)) from rpg_players)),
    'recent_log', coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc)
                            from (select * from admin_log order by id desc limit 5) l), '[]'::jsonb));
end $$;
revoke all on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;

-- 一覧。p_kind: 'scores' | 'daily' | 'rpg' | 'trash'
-- p_filter: q（名前の部分一致。NFKC＋小文字）・board・period（'all'|'week'）・day（'YYYY-MM-DD'）・sort（'new'|'best'）・limit（1〜500、既定100）・offset
-- rows は行をまるごと jsonb にして token_hash だけ抜く（列が増えてもそのまま出る）
create or replace function admin_list(p_kind text, p_filter jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_f jsonb;
  v_q text;
  v_best boolean;
  v_limit int;
  v_offset bigint;
  v_day date;
  v_total bigint;
  v_rows jsonb;
begin
  perform admin_check();
  v_f := coalesce(p_filter, '{}'::jsonb);
  v_q := lower(normalize(coalesce(v_f->>'q', ''), NFKC));
  v_best := coalesce(v_f->>'sort' = 'best', false);
  v_limit := least(greatest(coalesce(case when jsonb_typeof(v_f->'limit') = 'number' then floor((v_f->>'limit')::numeric) end, 100), 1), 500);
  v_offset := least(greatest(coalesce(case when jsonb_typeof(v_f->'offset') = 'number' then floor((v_f->>'offset')::numeric) end, 0), 0), 1000000000);

  if p_kind = 'scores' then
    with f as (
      select to_jsonb(s) - 'token_hash' as j,
             row_number() over (order by case when v_best then s.time_ms end, case when v_best then s.created_at end,
                                         case when v_best then s.id end, s.created_at desc, s.id desc) as rn
      from scores s
      where strpos(lower(normalize(s.nickname, NFKC)), v_q) > 0
        and (v_f->>'board' is null or s.board = v_f->>'board')
        and (v_f->>'period' is distinct from 'week' or s.created_at >= jst_week_start()))
    select (select count(*) from f),
           (select jsonb_agg(j order by rn) from f where rn > v_offset and rn <= v_offset + v_limit)
      into v_total, v_rows;
  elsif p_kind = 'daily' then
    v_day := daily_day(v_f->>'day');
    with f as (
      select to_jsonb(d) - 'token_hash' as j,
             row_number() over (order by case when v_best then d.correct end desc, case when v_best then d.time_ms end,
                                         case when v_best then d.created_at end, case when v_best then d.id end,
                                         d.created_at desc, d.id desc) as rn
      from daily_scores d
      where strpos(lower(normalize(d.nickname, NFKC)), v_q) > 0
        and (v_day is null or d.day = v_day))
    select (select count(*) from f),
           (select jsonb_agg(j order by rn) from f where rn > v_offset and rn <= v_offset + v_limit)
      into v_total, v_rows;
  elsif p_kind = 'rpg' then
    with f as (
      select to_jsonb(p) - 'token_hash' as j,
             row_number() over (order by case when v_best then p.lv end desc, case when v_best then p.dungeons end desc,
                                         case when v_best then p.floors end desc, case when v_best then p.created_at end,
                                         case when v_best then p.id end, p.created_at desc, p.id desc) as rn
      from rpg_players p
      where strpos(lower(normalize(p.nickname, NFKC)), v_q) > 0)
    select (select count(*) from f),
           (select jsonb_agg(j order by rn) from f where rn > v_offset and rn <= v_offset + v_limit)
      into v_total, v_rows;
  elsif p_kind = 'trash' then
    -- 30日より古いもの・戻したものは出さない。row_data の token_hash も抜く
    with f as (
      select to_jsonb(t) || jsonb_build_object('row_data', t.row_data - 'token_hash') as j,
             row_number() over (order by t.at desc, t.id desc) as rn
      from admin_trash t
      where t.restored_at is null and t.at > now() - interval '30 days'
        and strpos(lower(normalize(coalesce(t.row_data->>'nickname', ''), NFKC)), v_q) > 0)
    select (select count(*) from f),
           (select jsonb_agg(j order by rn) from f where rn > v_offset and rn <= v_offset + v_limit)
      into v_total, v_rows;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  return jsonb_build_object('ok', true, 'total', v_total, 'rows', coalesce(v_rows, '[]'::jsonb));
end $$;
revoke all on function admin_list(text, jsonb) from public, anon;
grant execute on function admin_list(text, jsonb) to authenticated;

-- scores にある board と件数
create or replace function admin_boards() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform admin_check();
  return jsonb_build_object('ok', true, 'boards', coalesce(
    (select jsonb_agg(jsonb_build_object('board', b.board, 'n', b.n) order by b.board)
     from (select board, count(*) as n from scores group by board) b), '[]'::jsonb));
end $$;
revoke all on function admin_boards() from public, anon;
grant execute on function admin_boards() to authenticated;

-- 消す。行を admin_trash に入れてから消し、admin_log に1件残す
create or replace function admin_delete(p_kind text, p_ids bigint[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_n bigint;
  v_ids bigint[];
begin
  perform admin_check();
  if p_kind = 'scores' then
    with d as (delete from scores where id = any(p_ids) returning *),
         t as (insert into admin_trash (kind, row_data) select 'scores', to_jsonb(d) from d returning (row_data->>'id')::bigint as id)
    select count(*), array_agg(id order by id) into v_n, v_ids from t;
  elsif p_kind = 'daily' then
    with d as (delete from daily_scores where id = any(p_ids) returning *),
         t as (insert into admin_trash (kind, row_data) select 'daily', to_jsonb(d) from d returning (row_data->>'id')::bigint as id)
    select count(*), array_agg(id order by id) into v_n, v_ids from t;
  elsif p_kind = 'rpg' then
    with d as (delete from rpg_players where id = any(p_ids) returning *),
         t as (insert into admin_trash (kind, row_data) select 'rpg', to_jsonb(d) from d returning (row_data->>'id')::bigint as id)
    select count(*), array_agg(id order by id) into v_n, v_ids from t;
  else
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  insert into admin_log (user_id, action, kind, detail)
    values (auth.uid(), 'delete', p_kind, jsonb_build_object('ids', coalesce(to_jsonb(v_ids), '[]'::jsonb)));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end $$;
revoke all on function admin_delete(text, bigint[]) from public, anon;
grant execute on function admin_delete(text, bigint[]) to authenticated;

-- ごみ箱から戻す（同じ id で）。1件ずつ試して、同じ id の行がもうある・同じ日に同じ名前がある などでぶつかったら戻さずに failed に数える
-- 無い・もう戻した trash の id も failed に数える
create or replace function admin_restore(p_trash_ids bigint[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  t admin_trash;
  v_want int;
  v_ok int := 0;
begin
  perform admin_check();
  v_want := (select count(distinct x) from unnest(p_trash_ids) x where x is not null);
  for t in select * from admin_trash where id = any(p_trash_ids) and restored_at is null order by id for update loop
    begin
      if t.kind = 'scores' then
        insert into scores overriding system value select * from jsonb_populate_record(null::scores, t.row_data);
      elsif t.kind = 'daily' then
        insert into daily_scores overriding system value select * from jsonb_populate_record(null::daily_scores, t.row_data);
      elsif t.kind = 'rpg' then
        insert into rpg_players overriding system value select * from jsonb_populate_record(null::rpg_players, t.row_data);
      else
        continue;
      end if;
      update admin_trash set restored_at = now() where id = t.id;
      v_ok := v_ok + 1;
    exception when integrity_constraint_violation or data_exception then
      null;  -- この1件だけ戻さない（ほかは続ける）
    end;
  end loop;
  insert into admin_log (user_id, action, kind, detail)
    values (auth.uid(), 'restore', null, jsonb_build_object('trash_ids', coalesce(to_jsonb(p_trash_ids), '[]'::jsonb),
                                                            'restored', v_ok, 'failed', v_want - v_ok));
  return jsonb_build_object('ok', true, 'restored', v_ok, 'failed', v_want - v_ok);
end $$;
revoke all on function admin_restore(bigint[]) from public, anon;
grant execute on function admin_restore(bigint[]) to authenticated;

-- 名前を変える。ルールは本編と同じ（前後の空白を取って1〜12文字・NGワード無し・rpg はほかの人と同じ名前はだめ）
-- p_name が null なら「名無しの旅人」＋3桁の数（ぶつかったら振り直す）
create or replace function admin_rename(p_kind text, p_id bigint, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_name text;
  v_norm text;
  v_before text;
  v_try int := 0;
begin
  perform admin_check();
  if p_kind is null or p_kind not in ('scores', 'daily', 'rpg') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;
  if p_name is not null then
    v_name := btrim(p_name, E' \t\n\r\f\u000b                 　﻿');
    if char_length(v_name) not between 1 and 12 then
      return jsonb_build_object('ok', false, 'reason', 'bad_name');
    end if;
    v_norm := lower(normalize(v_name, NFKC));
    if exists (select 1 from unnest(ng_words()) w where strpos(v_norm, w) > 0) then
      return jsonb_build_object('ok', false, 'reason', 'ng_name');
    end if;
  end if;
  if p_kind = 'scores' then select nickname into v_before from scores where id = p_id for update;
  elsif p_kind = 'daily' then select nickname into v_before from daily_scores where id = p_id for update;
  else select nickname into v_before from rpg_players where id = p_id for update;
  end if;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  loop
    if p_name is null then v_name := '名無しの旅人' || lpad(floor(random() * 1000)::int::text, 3, '0'); end if;
    v_norm := lower(normalize(v_name, NFKC));
    begin
      if p_kind = 'rpg' then
        perform pg_advisory_xact_lock(hashtext('rpgname:' || v_norm));  -- rpg_register と同じ鍵
        if exists (select 1 from rpg_players where lower(normalize(nickname, NFKC)) = v_norm and id <> p_id) then
          raise unique_violation;
        end if;
        update rpg_players set nickname = v_name where id = p_id;
      elsif p_kind = 'daily' then
        update daily_scores set nickname = v_name where id = p_id;  -- 同じ日に同じ名前なら一意制約でぶつかる
      else
        update scores set nickname = v_name where id = p_id;
      end if;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if p_name is not null or v_try >= 20 then
        return jsonb_build_object('ok', false, 'reason', 'name_taken');
      end if;
    end;
  end loop;
  insert into admin_log (user_id, action, kind, detail)
    values (auth.uid(), 'rename', p_kind, jsonb_build_object('id', p_id, 'before', v_before, 'after', v_name));
  return jsonb_build_object('ok', true, 'nickname', v_name);
end $$;
revoke all on function admin_rename(text, bigint, text) from public, anon;
grant execute on function admin_rename(text, bigint, text) to authenticated;

-- 操作の記録（新しい順）。p_limit は1〜500（既定100）
create or replace function admin_log_list(p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit int;
  v_offset int;
begin
  perform admin_check();
  v_limit := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset := greatest(coalesce(p_offset, 0), 0);
  return jsonb_build_object('ok', true,
    'total', (select count(*) from admin_log),
    'rows', coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc)
                      from (select * from admin_log order by id desc limit v_limit offset v_offset) l), '[]'::jsonb));
end $$;
revoke all on function admin_log_list(int, int) from public, anon;
grant execute on function admin_log_list(int, int) to authenticated;

-- PostgREST に関数が増えたことを知らせる
notify pgrst, 'reload schema';
