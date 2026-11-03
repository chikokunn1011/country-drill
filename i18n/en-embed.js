// v=2
// 英語版（PR5）: 埋めこみ（embed.js と embed.html の文）。en/embed.html だけが読む。
// 'この国旗はどこの国？'・'この国の国旗は？' は en-quiz.js、'もう一度' は en-html.js と同じ訳（同じキーは同じ値）
Object.assign(window.I18N_EN ??= {}, {
  // embed.js
  '読みこめませんでした': 'Couldn’t load',
  '国旗を表示できません': 'Can’t show the flag',
  'この国旗はどこの国？': 'Which country has this flag?',
  'この国の国旗は？': 'Which flag belongs to this country?',
  '今日の国旗': 'Today’s flag',
  '選択肢{k}': 'Choice {k}',
  'せいかい！': 'Correct!',
  'ちがうよ。もう一度えらんでね': 'Not quite. Pick again.',
  '{r}の国旗をもっと解く': 'More flags from {r}',
  '{name}の国旗の意味': 'What the flag of {name} means',
  '次の1問まで あと{h}時間{m}分': 'Next flag in {h}h {m}m',
  // 地域の名前（en-core.js と同じ訳）
  'アジア': 'Asia',
  'ヨーロッパ': 'Europe',
  'アフリカ': 'Africa',
  '北・中央アメリカ': 'North & Central America',
  '南アメリカ': 'South America',
  'オセアニア': 'Oceania',
  // embed.html（tools/make_en.mjs が置きかえる）
  '今日の国旗｜国旗マスター': 'Today’s flag | Flag Master',
  'ブログやサイトに貼れる、国旗マスターの1日1問の国旗クイズ（国旗と国名の4択）。':
    'A one-question-a-day flag quiz from Flag Master that you can embed on your blog or website (4 choices: flags and country names).',
  '国旗マスター': 'Flag Master',
  'もっと遊ぶ': 'Play more',
  'もう一度': 'Try again',
  '国旗: flag-icons（MIT）': 'Flags: flag-icons (MIT)',
});
