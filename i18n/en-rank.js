// v=2
// 英語版: タイムアタックの結果とランキングの文（index.html のインラインの節 クイズ の taResult など）と、ranking.js の返事の文（PR6）。
// タイムアタックは英語版でも選べる（PR6）。ranking.js・share-card.js・profile.js を英語版で読むのは PR6 のあとのタスクから
Object.assign(window.I18N_EN ??= {}, {
  // タイムアタックの条件の行
  '全部（{n}問）': 'All ({n} questions)',
  // 結果をシェア（share-card.js）
  '結果をシェア': 'Share result',
  '国旗マスター タイムアタック {cond}\n{time} でクリア！\n{tag}': 'Flag Master Time Attack {cond}\nCleared in {time}!\n{tag}',
  // 順位相当とランキングへの登録（profile.js の「載せる」箱）
  'ランキングを見る': 'View leaderboard',
  '歴代{all}位・今週{week}位': '#{all} all time · #{week} this week',
  '{r} 相当': 'Would rank {r}',
  'ページを読み直してね': 'Please reload the page',
  'ランキングに載せる': 'Post to the leaderboard',
  '載せたよ！ {r}': 'Posted! {r}',
  // ranking.js の返事の理由（MESSAGES）
  'ニックネームは1〜12文字で入れてね': 'Nicknames must be 1–12 characters',
  'そのニックネームは使えないみたい': 'That nickname can’t be used',
  'タイムが速すぎて受け付けられなかった': 'That time is too fast to accept',
  'タイムが長すぎて受け付けられなかった': 'That time is too long to accept',
  '少し待ってからもう一回送ってね': 'Please wait a moment and send it again',
  'この条件はランキングに載せられない': 'These settings can’t go on the leaderboard',
  'この記録はランキングに載せられない': 'This record can’t go on the leaderboard',
  'そのニックネームはもうほかの人が使っているみたい': 'That nickname is already taken',
  'もう載せてあるよ': 'Already posted',
  'プロフィールが見つからなかった': 'Profile not found',
  'かざりの国が正しくないみたい': 'Those decoration flags aren’t valid',
  '登録の合言葉がおかしいみたい': 'This device’s profile key isn’t valid',
  '日付が変わったので、この記録は載せられない': 'The day has changed, so this record can’t be posted',
  'コードがちがうか、期限が切れているみたい': 'That code is wrong or has expired',
  'データが大きすぎて預けられなかった': 'Your data is too large to transfer',
  '新しい版が出たよ。ページを読み直してね': 'A new version is out. Please reload the page',
  'ランキングに接続できなかった': 'Couldn’t connect to the leaderboard',
});
