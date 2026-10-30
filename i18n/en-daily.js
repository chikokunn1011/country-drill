// v=1
// 英語版（PR6）: daily.js の文（今日の難問の画面・ホームの入口・結果のシェアの文）と streak.js の文（ホームのれんぞく日数）。
// 日付の区切りは英語版でも日本時間の0時。英語の画面でだけ、その人の時間を I18N.localOf で添える（'（あなたの時間で{t}）'）。
// en-html.js と同じキー（今日の難問・まだ誰もいない…）は同じ訳（en-html.js はブラウザが読まない）
Object.assign(window.I18N_EN ??= {}, {
  // 画面の見出し・タブ・表
  '今日の難問': 'Daily Puzzle',
  '日付': 'Date',
  '今日': 'Today',
  '昨日': 'Yesterday',
  '上位50人まで。全問正解の人がタイム順で上、その下は正解した数が多い順（同じ数なら速い順）。':
    'Top 50 players. Perfect runs rank first by time, then everyone else by most correct answers (faster time breaks ties).',
  'まだ誰もいない。1位のチャンス！': 'No one here yet. Grab the top spot!',
  '全問正解': 'Perfect',
  // 表の正解の数（'{n}問' の '{n} questions' とは別）
  '{c}問': '{c} correct',

  // 挑戦する前の説明（{t} は '（あなたの時間で{t}）' か ''、{b} は太字の「1日1回だけ」）
  '毎日0時（日本時間）に新しい{n}問{t}。{b}。': 'A new set of {n} questions every day at midnight Japan time{t}. {b}.',
  '（あなたの時間で{t}）': ' ({t} your time)',
  '挑戦できるのは1日1回だけ': 'You can play only once a day',
  '国旗・国名・場所の問題がまざって出る': 'A mix of flag, name, and location questions',
  '後半ほどむずかしい（似た国旗・小さい国）': 'Later questions get harder (look-alike flags and small countries)',
  '1問でもまちがえたら、そこまでの正解数が記録': 'One mistake ends the run, and your correct answers so far are recorded',
  '全問正解ならタイムで勝負': 'Get them all right to compete on time',
  '「挑戦する」を押したら、とちゅうでやめても今日の挑戦は終わり。準備ができたらどうぞ。':
    'Once you press “Take the challenge,” today’s try is used up, even if you quit partway. Start when you’re ready.',
  '挑戦する': 'Take the challenge',
  'いま別のタブで挑戦中だよ。終わったら、ここに結果が出るよ。': 'You’re playing in another tab. Your result will show here when you finish.',

  // 結果
  '全問正解！': 'Perfect!',
  'とちゅうでやめた': 'You quit partway',
  'ここまで！': 'Game over!',
  ' / {n} 問正解': ' / {n} correct',
  'タイム {t}': 'Time {t}',
  '昨日（{d}）の挑戦の記録。0時30分（日本時間）までなら載せられるよ': 'Yesterday’s ({d}) result. You can post it until 12:30 AM Japan time',
  'ランキングに載せるには、ページを読み直してね': 'To post to the leaderboard, please reload the page',
  '「{name}」で載せたよ！': 'Posted as {name}!',
  '「{name}」で載せたよ！ {r}': 'Posted as {name}! {r}',
  '今日{n}位': '#{n} today',
  '昨日{n}位': '#{n} yesterday',
  '{r}（載せたとき）': '{r} (when posted)',
  '今日の難問に挑戦する': 'Play today’s puzzle',
  '次の問題まで あと{h}時間{m}分': 'Next puzzle in {h}h {m}m',

  // 問題と答えの一覧
  '今日の問題と答え': 'Today’s questions and answers',
  '昨日の問題と答え': 'Yesterday’s questions and answers',
  '昨日（{d}）の問題と答え': 'Yesterday’s ({d}) questions and answers',
  'まちがえ': 'Wrong',
  'とどかず': 'Not reached',
  'ここから先は、明日「昨日」のタブで見られるよ。': 'You can see the rest tomorrow on the “Yesterday” tab.',
  '問題と答えは、明日「昨日」のタブで見られるよ。': 'You can see the questions and answers tomorrow on the “Yesterday” tab.',

  // シェアの文と画像（タグは en-rank.js の '#国旗マスター'）
  '国旗マスター 今日の難問 {d}\n{bar}\n{line}\n{tag}': 'Flag Master Daily Puzzle {d}\n{bar}\n{line}\n{tag}',
  '全問正解！ {time}': 'Perfect! {time}',
  '{c} / {n} 問正解': '{c} / {n} correct',
  '今日の難問 {d}': 'Daily Puzzle {d}',

  // ホームの入口
  '挑戦ずみ': 'Done',

  // れんぞく日数（streak.js）。数は太字にするので、数のほかに数字を入れない
  'れんぞく日数': 'Day streak',
  '{n}日れんぞく': { one: '{n}-day streak', other: '{n}-day streak' },
  '（さいこう{b}日）': ' (best {b})',
  '・': ' · ',
  'お休み券{n}枚': { one: '{n} rest pass', other: '{n} rest passes' },
  '今日あそぶと{n}日に！': 'Play today to reach {n} days!',
  'きのうはお休み券でつながるよ': 'Yesterday was covered by a rest pass',
  '今日あそぶと1日目': 'Play today to start a streak',
  '今週': 'This week',
  '今週（月〜日）': 'This week (Mon–Sun)',
  // 7マスの1つ（'{d}' は 'Oct 28'）。曜日と印は data
  '{d}（{w}）': '{w}, {d}',
  '{d}（{w}） {m}': '{w}, {d}: {m}',
  '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat', '日': 'Sun',
  'あそんだ': 'Played',
  'お休み券': 'Rest pass',
  'お休み': 'Missed',
  // 小窓の下（英語の画面でだけ。{t} は I18N.localOf(0, 0)）
  '日付は日本時間の0時で変わるよ（あなたの時間で{t}）': 'Days change at midnight Japan time ({t} your time).',
});
