-- PR6: ニックネームの NG ワードに英語の悪い言葉を足す（本番用。チコが Supabase の SQL Editor で流す）
--
-- 何をするか: NG ワードの一覧を返す関数 ng_words() の中身を入れかえて、今の18語のあとに英語の29語を足す（合わせて47語）。
--   するのはそれだけ。表・列・ほかの関数は変えない・消さない。関数の持ち主と権限も今のまま（ブラウザからは呼べないまま）。
--   一覧は supabase/schema.sql の ng_words() と ranking.js の NG_WORDS と1文字も同じ（テストで見ている）。
-- 流し方: このファイルの中身を全部 SQL Editor に貼って、Run を1回押す。何度流しても同じ結果になる。
--   途中の確かめ（47語あるか）が合わないと赤いエラーで止まり、何も変わらない（そのときはこのファイルを作った人に知らせる）。
-- 流したあと: 最後に、もう使われている名前・称号のうち新しい一覧に当たるものの表が出る（表の名前・nickname・title）。
--   行が無ければ何も出ない。出た名前・称号はそのまま残る（消えない・変わらない）。気になれば管理ページで名前を変える。
--   新しい一覧が効くのは、これから名前・称号をつけるとき・変えるときから。

begin;

-- NGワード（ranking.js の NG_WORDS・supabase/schema.sql と同じ中身。NFKC＋小文字にした名前に部分一致したらだめ）
create or replace function ng_words() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['死ね', 'しね', 'シネ', '殺す', 'ころす', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ',
               'せっくす', 'セックス', 'fuck', 'shit', 'bitch', 'sex', 'admin', '運営', '管理人',
               'nigger', 'nigga', 'faggot', 'cunt', 'whore', 'slut', 'bastard', 'asshole', 'wanker', 'twat', 'bollocks', 'retard', 'porn',
               'penis', 'vagina', 'pussy', 'dildo', 'blowjob', 'jizz', 'hentai', 'milf', 'boobs', 'piss', 'hitler', 'tranny', 'chink', 'kike', 'gook', 'moderator']
$$;
revoke all on function ng_words() from public, anon, authenticated;

-- 47語あるかの確かめ（ちがえばエラーで止まり、上の入れかえも取り消される）
do $$ begin assert array_length(ng_words(), 1) = 47, 'ng_words の数がちがう'; end $$;

commit;

-- 読むだけの確かめ: もう使われている名前・称号のうち、新しい一覧に当たるもの（何も書きかえない）
with ng as (select unnest(ng_words()) as w)
select 'profiles' as "表の名前", nickname, title from profiles p
  where exists (select 1 from ng where strpos(lower(normalize(p.nickname, NFKC)), w) > 0 or strpos(lower(normalize(p.title, NFKC)), w) > 0)
union all
select distinct 'scores', nickname, null::text from scores s
  where exists (select 1 from ng where strpos(lower(normalize(s.nickname, NFKC)), w) > 0)
union all
select distinct 'daily_scores', nickname, null::text from daily_scores d
  where exists (select 1 from ng where strpos(lower(normalize(d.nickname, NFKC)), w) > 0)
union all
select 'rpg_players', nickname, null::text from rpg_players r
  where exists (select 1 from ng where strpos(lower(normalize(r.nickname, NFKC)), w) > 0)
order by 1, 2;
