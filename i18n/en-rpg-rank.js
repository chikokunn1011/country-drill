// v=1
// 英語版（PR8）: 冒険ランキング（#scr-rpgrank、rpg-rank.js）。冒険ランキング Adventure leaderboard・英雄の塔 Tower of Heroes・
// 自己ベスト Personal best・階 floor・旅人のレベル Traveler level（en-rpg.js の頭と tools/dict_sheet.mjs の GLOSSARY のとおり）。
// 1文の行は終わりのピリオドなし、2文以上は文ごとにピリオド。ほかの人と自分の名前は訳さず data-ugc。
// ほかの辞書のキーをそのまま使う（ここに書かない）: '← 冒険'・'冒険ランキング'・'ダンジョン'・'自己ベスト {n}階'（en-rpg.js）、
// '英雄の塔'・'{n}階'（en-badges.js）、'プロフィール'・'再読み込み'（en-profile.js）、'{r} 相当'・'載せたよ！ {r}'・
// 'ランキングに接続できなかった'（en-rank.js）、'まだ誰もいない。1位のチャンス！'・'・'（en-daily.js）
Object.assign(window.I18N_EN ??= {}, {
  // 並べ方のタブ（'ダンジョン'・'英雄の塔' はほかの辞書）
  '並べ方': 'Sort by',
  'レベル': 'Level',
  '上位50人まで。レベル → クリアしたダンジョン → フロアの順': 'Top 50 players, ranked by level → dungeons cleared → floors',
  '上位50人まで。クリアしたダンジョン → フロア → レベルの順': 'Top 50 players, ranked by dungeons cleared → floors → level',
  '上位50人まで。最高記録の階 → レベルの順': 'Top 50 players, ranked by highest floor → level',
  // きみの記録（Lv の後ろ）と英雄の塔のタブの自己ベスト
  'きみの記録': 'Your record',
  'ダンジョン {d}/{all}（フロア {f}/{fall}）': 'Dungeons {d}/{all} (floors {f}/{fall})',
  '英雄の塔 {rec}': 'Tower of Heroes · {rec}',
  'まだ記録がないよ': 'No record yet',
  'まだ旅に出ていないよ': 'You haven’t started the Adventure yet',
  '冒険を始めると、レベルとクリアしたダンジョンでランキングに載せられる': 'Once you start the Adventure, you can post your level and cleared dungeons to the leaderboard',
  // 何位相当（'{r} 相当' = Would rank {r}）と、載せたあと（'載せたよ！ {r}' = Posted! {r}）の {r}
  'レベル順 {lv}位・ダンジョン順 {dg}位': '#{lv} by level · #{dg} by dungeons',
  '英雄の塔 {n}位': '#{n} in the Tower of Heroes',
  // 載せる欄（{name} はプロフィールの名前の <b data-ugc>）
  '{name} で載ってるよ。レベルアップやダンジョンクリアのたびに自動で記録が新しくなる':
    'You’re listed as {name}. Your record updates automatically whenever you level up or clear a dungeon.',
  'ランキングにはプロフィールの名前とかざりで載るよ。名前を押すと、その人のプロフィールが見られる':
    'You appear on the leaderboard with your profile nickname and decorations. Tap a nickname to see that player’s profile.',
  '冒険ランキングに載せる': 'Post to the Adventure leaderboard',
  'プロフィールが読みこめなかった。ページを読み直してね': 'Couldn’t load your profile. Please reload the page.',
  // 表が出せないとき
  '英雄の塔のランキングは準備中だよ。もう少し待ってね': 'The Tower of Heroes leaderboard isn’t ready yet. Please check back soon.',
  // タイムアタックのランキング画面からの入口（頭に 🏆）
  '冒険のランキングはこちら': 'View the Adventure leaderboard',
});
