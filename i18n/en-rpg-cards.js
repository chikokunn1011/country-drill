// v=1
// 英語版（PR8）: 冒険の仲間のカード・国旗ガチャ（Flag Draw）・仲間の一覧・仲間の世界地図・シェア（rpg-cards.js）。あとのタスクで rpg-team.js の文を足す。
// 冒険の語は en-rpg.js の頭と tools/dict_sheet.mjs の GLOSSARY のとおり（仲間 ally／allies・なかよし度 Friendship・かさね Stack・
// おかえし coins back・ランクアップ Rank up・こうげき Attack・地域ボーナス Region bonus・国旗パック Flag Pack・
// ガチャ Flag Draw（Draw 1・Draw 10・Free draw・guaranteed ★3）・ブロンズ／シルバー／ゴールド Bronze／Silver／Gold）。
// ガチャの '1回'・'10回' は en-dojo.js の '{n}回'（{n} time／times）を使わず、別のキーで Draw 1・Draw 10（preflight C12）。
// ほかの辞書のキーをそのまま使う（ここに書かない）: '← 冒険'・'国旗ガチャ'・'あと{coins}'（en-rpg.js）、'閉じる'（en-book.js）、
// '全世界'・地域名（en-core.js）、'すべて'・'まだ'・'シェア'（en-badges.js）、'・'（en-daily.js）、'#国旗マスター'（en-rank.js）
Object.assign(window.I18N_EN ??= {}, {
  // ---- 仲間のカード ----
  'あと{n}回正解で仲間に（1回のゲームで1回ぶん）': {
    one: '{n} more right answer to make it an ally (one per game)',
    other: '{n} more right answers to make it an ally (one per game)',
  },
  'ブロンズ': 'Bronze',
  'シルバー': 'Silver',
  'ゴールド': 'Gold',
  'かさね {n}/{max}': 'Stack {n}/{max}',
  '裏向きのカード': 'Face-down card',
  'なかよし度': 'Friendship',
  // カードの詳細（#detail）
  'かさね {dots}': 'Stack {dots}',
  'なかよし度 ♥{fr}/{max}': 'Friendship ♥{fr}/{max}',
  'こうげき {atk}': 'Attack {atk}',
  '（地域ボーナス あり）': '(Region bonus: yes)',
  '（地域ボーナス なし）': '(Region bonus: no)',
  '{region}のダンジョンと地図喰いの巣では、地域ボーナスで ×{mul}': 'Region bonus ×{mul} in {region} dungeons and the Map Eater’s Lair',
  'まだ仲間じゃない（なかよし度 ♥{fr}/{max}）': 'Not an ally yet (Friendship ♥{fr}/{max})',

  // ---- 国旗ガチャ（#scr-gacha） ----
  '※コインはクイズで集めるゲームの中のコインだけ。お金はかからないし、買うこともできないよ。':
    'Coins are only in-game coins you collect in quizzes. They don’t cost money, and you can’t buy them.',
  'ランクアップ': 'Rank up',
  'かさね+1': 'Stack +1',
  'おかえし {coins}': 'Coins back {coins}',
  'どこの国と出会う？': 'Which countries will you meet?',
  '地域をしぼると値段が ×{price}。そのかわり、その地域のダンジョンでは仲間が ×{power} で強い':
    'Choosing a region makes the price ×{price}. In return, those allies are ×{power} stronger in that region’s dungeons.',
  '結果': 'Results',
  '引いたカードがここに並ぶよ': 'Cards you draw will appear here',
  'ぜんぶめくる': 'Flip all',
  'スキップ': 'Skip',
  // 出る確率（数は TUNING.gacha から）
  '出る確率': 'Odds',
  '★3 ゴールド {p3}% / ★2 シルバー {p2}%': '★3 Gold {p3}% / ★2 Silver {p2}%',
  '★1 ブロンズ {p1}%': '★1 Bronze {p1}%',
  '10回引くと10枚目は★2以上（★3 {p3}% / ★2 {p2}%）': 'In Draw 10, the 10th card is ★2 or better (★3 {p3}% / ★2 {p2}%)',
  '★3が出ないまま{n}回目 → ★3確定': 'No ★3 by draw {n} → guaranteed ★3',
  '国は選んだ地域から同じ確率（{area}なら 各 1/{n} = {p}%）': 'Every country in the chosen region has the same chance ({area}: 1/{n} = {p}% each)',
  '天井込みの★3の目安: 約{p}%': 'Overall ★3 chance with the guarantee: about {p}%',
  // 国旗パック
  '{name}の国旗パック': '{name} Flag Pack',
  'FLAG QUEST · 国旗パック': 'FLAG QUEST · FLAG PACK',
  'まだ会っていない国 {rest}/{n}': 'Not met yet {rest}/{n}',
  '{n}か国コンプリート！': { one: '{n} country complete!', other: '{n} countries complete!' },
  '地域しぼり ×{mul}': 'One region ×{mul}',
  // ボタン・天井
  'また明日': 'Come back tomorrow',
  '無料1回': 'Free draw',
  '今日クイズを1回クリアすると無料1回': 'Clear a quiz today for a free draw',
  '1回': 'Draw 1',
  '10回': 'Draw 10',
  '★3確定まで あと{n}回': { one: 'guaranteed ★3 in {n} draw', other: 'guaranteed ★3 in {n} draws' },
  // 引く演出
  '…金色に光った！': '…It glowed gold!',
  'きらっ！': 'Sparkle!',
  'どの国かな？': 'Which country will it be?',
  // 引けなかったときの1行（#ga-msg）
  'コインが足りないので引けなかったよ（ほかのタブで使ったかも）': 'Not enough coins, so nothing was drawn (maybe you used them in another tab)',
  '今日の無料1回はもう使っているか、まだ今日クイズをクリアしていないよ': 'Today’s free draw is already used, or you haven’t cleared a quiz today yet',
  '保存できなかったので、引いていないよ': 'Couldn’t save, so nothing was drawn',

  // ---- 仲間の一覧（#scr-cards）・仲間の世界地図 ----
  '地域でしぼりこむ': 'Filter by region',
  '仲間 {n} / {total}': 'Allies {n} / {total}',
  '★1 ブロンズ': '★1 Bronze',
  '★2 シルバー': '★2 Silver',
  '★3 ゴールド': '★3 Gold',
  '仲間にした国の世界地図（仲間 {n}/{total}）': 'World map of your allies (Allies {n}/{total})',

  // ---- シェア（RPG.milestones。msg は画面の行、text はシェアの文。タグは '#国旗マスター'） ----
  '仲間が{n}か国になった！': { one: 'You now have {n} ally!', other: 'You now have {n} allies!' },
  '国旗クエストで仲間が{n}か国になった！ {tag}': { one: 'I now have {n} ally in Flag Quest! {tag}', other: 'I now have {n} allies in Flag Quest! {tag}' },
  '{land}の国を全部仲間にした！': 'Every country in {land} is now your ally!',
  '国旗クエストで{land}の国を全部仲間にした！ 仲間 {n}/{total}か国 {tag}': 'Every country in {land} is now my ally in Flag Quest! Allies: {n}/{total} countries {tag}',
});
