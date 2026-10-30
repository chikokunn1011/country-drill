// v=1
// 英語版（PR5）: タイムアタックの結果とランキングの文（index.html のインラインの節 クイズ の taResult など）。
// 英語版では ranking.js・share-card.js・profile.js を読まず（RANKING.enabled が false）、タイムアタックも選べないので画面には出ない。PR6 で使う
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
});
