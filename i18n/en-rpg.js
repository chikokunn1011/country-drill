// v=1
// 英語版（PR8）: 冒険（国旗クエスト → Flag Quest）の文。rpg-core.js のデータ（// i18n-data の名前: ダンジョン・land・章・モンスター・
// 鏡の手下の型の文・宇宙のテーマ・塔の番人・既定の編成名の頭・コインの単位）。ストーリー（rpg-core の STORY・STORY_END）。あとのタスクで rpg.js・2つ以上の rpg-*.js が使う文を足す。
// 名前は Title Case・28字まで。鏡の手下は 'Mirror {name}'・'Upside-Down {name}' に元の名前を入れる（Upside-Down に入る名前は16字まで）。
// 月（天体）は曜日の '月'（en-daily.js の Mon）とぶつかるので、表示のキーは '天体の月'（DUNGEONS の key）。
// 冒険の語（PR7）: Adventure・Tower of Heroes・Dungeon（文の中は dungeon）・Traveler（Traveler level）・battle・boss / region boss・
// the Map Eater・ally（allies。companion は使わない）・Friendship・Silver・Wanted posters・recommended Lv。
// PR8 で足す語: Flag Quest・Adventure home・Adventure map・Adventure leaderboard・the Mirror Map Eater・the Star Eater・
// Earth・Mirror Earth・Space・Chapter {n}・Flag Draw（draw・Draw 1・Draw 10・Free draw・guaranteed ★3）・Flag Pack・card・
// Bronze・Silver・Gold・Stack・coins back・Rank up・Attack・HP・Region bonus・Team bonus・Team（team slot・Auto・Team {n}）・
// Traveler card・look・Level up・Floor（F1–F4）・floor（塔）・mini-boss・Easy / Just right / Tough・Today’s Wanted posters・Wanted・
// Overcome!・Effort gauge・Effort prize・Run・Fight・Critical hit・counterattack・win back a flag・coins（チップは {n}k）・
// Personal best・Transfer code・Restore from code・Decorations（一覧は tools/dict_sheet.mjs の GLOSSARY）。
// ほかの辞書のキーをそのまま使う（ここに書かない）: '英雄の塔'・'{n}階'（en-badges.js）、地域名・細かい地域名・'全世界'（en-core.js）、
// '#国旗マスター'（en-rank.js）、'・'（en-daily.js）、'〈{title}〉'（en-profile.js）、'すべて'・'シェア'・'まだ'（en-badges.js）
// rpg.js が使うほかの辞書のキー: '冒険'・'達成'（en-badges.js）、'閉じる'（en-book.js）、'コピー'・'コピーしたよ'（en-profile.js）、'挑戦'（en-core.js）
// rpg-cards.js の文は en-rpg-cards.js。rpg-cards.js も使うこの辞書のキー: '← 冒険'・'国旗ガチャ'・'あと{coins}'
Object.assign(window.I18N_EN ??= {}, {
  // ---- 既定の編成名の頭（'編成1' → 表示は Team 1）とコインの単位（データ。英語の画面は shortCoins(n, true) の k） ----
  '編成': 'Team',
  '万': 'ten thousand',

  // ---- 章 ----
  '地球': 'Earth',
  '鏡の地球': 'Mirror Earth',
  '宇宙': 'Space',

  // ---- ダンジョン（name）と land（地域名と同じ land は en-core.js） ----
  'アマゾンの密林': 'Amazon Jungle',
  'サンゴ礁の海': 'Coral Reef',
  '大峡谷': 'Great Canyon',
  '古城の迷宮': 'Old Castle Labyrinth',
  '天空の山脈': 'Mountains of the Sky',
  'サバンナの大地': 'Savanna Plains',
  '地図喰いの巣': 'Map Eater’s Lair',
  '世界': 'World',
  '鏡のアマゾン': 'Mirror Amazon',
  '鏡の南アメリカ': 'Mirror South America',
  '鏡のサンゴ礁': 'Mirror Coral Reef',
  '鏡のオセアニア': 'Mirror Oceania',
  '鏡の大峡谷': 'Mirror Great Canyon',
  '鏡の北・中央アメリカ': 'Mirror North/Central America',
  '鏡の古城': 'Mirror Old Castle',
  '鏡のヨーロッパ': 'Mirror Europe',
  '鏡の山脈': 'Mirror Mountains',
  '鏡のアジア': 'Mirror Asia',
  '鏡のサバンナ': 'Mirror Savanna',
  '鏡のアフリカ': 'Mirror Africa',
  '鏡の地図喰いの巣': 'Mirror Map Eater’s Lair',
  '鏡の世界': 'Mirror World',
  '天体の月': 'Moon',
  '水星': 'Mercury',
  '金星': 'Venus',
  '火星': 'Mars',
  '木星': 'Jupiter',
  '土星': 'Saturn',
  '星喰いの巣': 'Star Eater’s Lair',

  // ---- モンスター: 第1章 地球（F1〜F4 とボス） ----
  'おしゃべりオウム': 'Chatty Parrot',
  'ヤドクガエル': 'Poison Dart Frog',
  'つばとばしアルパカ': 'Spitting Alpaca',
  '大アナコンダ': 'Giant Anaconda',
  'ジャガー王': 'Jaguar King',
  'ヤシガニ': 'Coconut Crab',
  'ボクサーカンガルー': 'Boxing Kangaroo',
  'イリエワニ': 'Saltwater Crocodile',
  'ホホジロザメ': 'White Shark',
  '怒れる火山': 'Angry Volcano',
  'ハクトウワシ': 'Bald Eagle',
  'いたずらアライグマ': 'Naughty Raccoon',
  'サボテンナイト': 'Cactus Knight',
  'グリズリー': 'Grizzly Bear',
  '大竜巻': 'Great Tornado',
  '古城のコウモリ': 'Old Castle Bat',
  '森のオオカミ': 'Forest Wolf',
  '物知りフクロウ': 'Wise Owl',
  '古城の大グモ': 'Castle Spider',
  '赤い竜': 'Red Dragon',
  '温泉ザル': 'Hot Spring Monkey',
  'ねぼすけパンダ': 'Sleepyhead Panda',
  '森のゾウ': 'Forest Elephant',
  'ベンガルトラ': 'Bengal Tiger',
  '青い竜': 'Blue Dragon',
  '砂漠のサソリ': 'Desert Scorpion',
  'のっぽキリン': 'Lanky Giraffe',
  '怒りんぼカバ': 'Grumpy Hippo',
  '突進サイ': 'Charging Rhino',
  '百獣の王': 'King of Beasts',
  '白紙の霧': 'Blank Page Fog',
  'やぶれた地図': 'Torn Map',
  'くるった方位磁針': 'Haywire Compass',
  '地図喰いの影': 'Map Eater Shadow',
  '地図喰い': 'Map Eater',

  // ---- 第2章 鏡の地球: 手下（F1〜F4）は元の名前を入れる型の文、ボスは別の名前 ----
  '鏡の{name}': 'Mirror {name}',
  'さかさ{name}': 'Upside-Down {name}',
  'うつしジャガー': 'Copycat Jaguar',
  'さかさ火山': 'Upside-Down Volcano',
  'さかさ竜巻': 'Upside-Down Tornado',
  '白い竜': 'White Dragon',
  '金の竜': 'Golden Dragon',
  '影の百獣の王': 'Shadow King of Beasts',
  '鏡の地図喰い': 'Mirror Map Eater',

  // ---- 第3章 宇宙 ----
  'ちびUFO': 'Tiny UFO',
  'クレーター岩': 'Crater Rock',
  'まいご流れ星': 'Lost Shooting Star',
  '月面ロボ': 'Lunar Robot',
  '月のウサギ大王': 'Great Moon Rabbit King',
  'じりじり太陽風': 'Scorching Solar Wind',
  'ちび小惑星': 'Tiny Asteroid',
  'まよい衛星': 'Stray Satellite',
  '温度計おばけ': 'Thermometer Ghost',
  'ほうき星': 'Comet',
  '硫酸の雲': 'Sulfuric Acid Cloud',
  '金星火山': 'Venus Volcano',
  'かみなり雲': 'Thundercloud',
  'あつがり星人': 'Overheated Alien',
  '金星の炎': 'Flame of Venus',
  '探査ロボ': 'Explorer Robot',
  '赤い砂あらし': 'Red Sandstorm',
  '火星UFO': 'Mars UFO',
  'タコ型火星人': 'Octopus Martian',
  '火星人の将軍': 'Martian General',
  'ガリレオ衛星': 'Galilean Moon',
  'ガスのいなずま': 'Gas Lightning',
  '磁場のうず': 'Magnetic Vortex',
  'ふわふわガス': 'Floaty Gas',
  '大赤斑': 'Great Red Spot',
  '氷のかけら': 'Ice Shard',
  '輪っかの石': 'Ring Stone',
  'もやもや衛星': 'Hazy Moon',
  '迷子ロケット': 'Lost Rocket',
  '輪っかの番人': 'Ring Guardian',
  'ゆがんだ銀河': 'Warped Galaxy',
  '吸いこまれ星': 'Swallowed Star',
  '小さな穴': 'Little Hole',
  '星喰いの目': 'Eye of the Star Eater',
  '星喰い': 'Star Eater',

  // ---- 宇宙のテーマ（答えのあとに出す名前。Title Case） ----
  '島国': 'Island Countries',
  '小さい国': 'Small Countries',
  '赤道の国': 'Equatorial Countries',
  '内陸国': 'Landlocked Countries',
  '大きい国': 'Large Countries',
  '南半球の国': 'Southern Hemisphere',

  // ---- 英雄の塔（'英雄の塔' は en-badges.js） ----
  '塔の番人': 'Tower Guardian',

  // ---- rpg.js（Task 5: 冒険ホーム・はじめての画面・入口・コインの表示・データ・開発用パネル） ----
  // 既定の編成名の表示（RPG.teamLabel。セーブは '編成1' のまま）
  '編成{n}': 'Team {n}',
  // 保存の注意（トースト・冒険ホームの注意）
  'データを読めなかったので最初からになったよ': 'Couldn’t read your Adventure data, so it started over',
  '新しいバージョンのデータが見つかったよ。ページを再読み込みしてね': 'Found data from a newer version. Please reload the page.',
  '保存できなかった…': 'Couldn’t save…',
  'この端末では保存できないみたい。閉じると消えるよ': 'Looks like this device can’t save. Your data will be lost when you close the page.',
  // クイズのコイン（#pcoin・トースト・結果のコインの欄）
  'コイン': 'coins',
  'コイン（冒険で使える）': 'Coins (for the Adventure)',
  'はじめて！+{coins}': 'First time! +{coins}',
  'コインがたまったよ！ 冒険でレベルアップやガチャに使えるよ': 'You earned coins! Use them in the Adventure to level up and use the Flag Draw.',
  '+{coins} コイン': '+{coins} coins',
  'いま {coins}': 'You have {coins}',
  '一発正解 {n}問': { one: 'Right on the first try: {n} question', other: 'Right on the first try: {n} questions' },
  'やり直しで正解 {n}問': { one: 'Right after a retry: {n} question', other: 'Right after a retry: {n} questions' },
  '正解 {n}問': { one: 'Correct: {n} question', other: 'Correct: {n} questions' },
  'クリアボーナス': 'Clear bonus',
  'はじめて正解 {n}か国': { one: 'Right for the first time: {n} country', other: 'Right for the first time: {n} countries' },
  '🎁 今日はじめてのクリア +{coins} ／ 無料ガチャ1回ゲット': '🎁 First clear today +{coins} / Free draw earned',
  'タイムが速すぎたので、この回のコインはなし': 'Your time was too fast, so no coins this round',
  '冒険へ →': 'Go to the Adventure →',
  '冒険へ →（はじめてなら {coins} のお祝いつき）': 'Go to the Adventure → (first-time bonus: {coins})',
  'バッジのごほうび {coins}': 'Badge reward {coins}',
  // 仲間・シルバー・克服・手配書の行（RPG.gainLines。結果のコインの欄・トースト。あとのタスクでバトルも使う）
  '{names}ほか{n}か国': { one: '{names} and {n} more country', other: '{names} and {n} more countries' },
  '🤝 {names}が仲間になった！': '🤝 New allies: {names}',
  '🤝 {names}が仲間になった！（{n}回正解した国は仲間になるよ）': {
    one: '🤝 New allies: {names} (a country becomes your ally after {n} correct answer)',
    other: '🤝 New allies: {names} (a country becomes your ally after {n} correct answers)',
  },
  '🏅 {names}がシルバーに！': '🏅 Now Silver: {names}',
  '✨ 克服！ {names}はもう苦手じゃない +{coins}': '✨ Overcome! No more trouble with {names} +{coins}',
  '📜 手配書 {names} +{coins}': '📜 Wanted posters: {names} +{coins}',
  '📜 手配書 {names} +{coins}（3件ぜんぶ +{all}）': '📜 Wanted posters: {names} +{coins} (all 3: +{all})',
  // 入口（トップバーのチップ・設定のスイッチ）
  'コイン {coins}（冒険へ）': 'Coins {coins} (go to the Adventure)',
  'コイン（冒険へ）': 'Coins (go to the Adventure)',
  '冒険（コイン・RPG）を表示する': 'Show the Adventure (coins and RPG)',
  // はじめての画面
  '国旗クエスト': 'Flag Quest',
  '地図喰いから世界を取りもどせ': 'Win back the world from the Map Eater',
  '旅人のすがたをえらぶ': 'Choose your Traveler’s look',
  '旅に出る': 'Set off',
  // 旅人カード・レベルアップ
  '旅人': 'Traveler',
  '旅人のすがたを変える': 'Change your Traveler’s look',
  '仲間 {n}/{total}': 'Allies {n}/{total}',
  'レベルアップ {coins}': 'Level up {coins}',
  'あと{coins}': 'Need {coins} more',
  '上げられるだけ上げる': 'Level up as far as you can',
  'Lv{lv} まで ●{coins} 使う？': 'Spend ●{coins} to reach Lv {lv}?',
  // つぎにやること
  'まずは国旗ガチャ10連で仲間をさがそう（全世界なら●1,000）': 'Find allies first: try Draw 10 in the Flag Draw (●1,000 for World)',
  '今日の無料ガチャが引けるよ': 'Today’s free draw is ready',
  'レベルアップできるよ': 'You can level up',
  '{dungeon} F{f} に挑戦！（推奨Lv{lv}）': 'Take on {dungeon} F{f}! (recommended Lv {lv})',
  '{dungeon} ボス（{boss}）に挑戦！（推奨Lv{lv}）': 'Take on the {dungeon} boss ({boss})! (recommended Lv {lv})',
  'ちょっときびしいかも。クイズでコインを稼ごう': 'This might be a bit tough. Earn coins in quizzes.',
  '全クリア！ {total}か国を仲間にしよう（{owned}/{total}）': 'All cleared! Make all {total} countries your allies ({owned}/{total})',
  '全クリア！ クイズでコインを稼いで、レベルを上げよう': 'All cleared! Earn coins in quizzes and raise your level.',
  // ホームのボタン（ガチャ・仲間・編成・冒険ランキングの画面があるときだけ）
  '国旗ガチャ': 'Flag Draw',
  '無料1回！': 'Free draw!',
  '仲間': 'Allies',
  '冒険ランキング': 'Adventure leaderboard',
  // ダンジョンの札（図版）
  'ボス': 'Boss',
  '{floor}（クリア済み）': '{floor} (cleared)',
  'まだ開いていない': 'Not open yet',
  'テーマ: {name}（{n}か国）': { one: 'Theme: {name} ({n} country)', other: 'Theme: {name} ({n} countries)' },
  '{name}のボスをたおすと開く': 'Opens when you defeat the {name} boss',
  'ボス {name}': 'Boss: {name}',
  '推奨Lv{from}〜{to}': 'Recommended Lv {from}–{to}',
  '余裕': 'Easy',
  'ちょうど': 'Just right',
  'きびしい': 'Tough',
  'ぜんぶクリア': 'All cleared',
  'はじめてクリアでもらえる {coins}': 'First-clear reward {coins}',
  'ボスまで あと{n}フロア': { one: '{n} floor to the boss', other: '{n} floors to the boss' },
  // 冒険マップ・章のタブ
  '冒険マップ': 'Adventure map',
  'ダンジョン': 'Dungeons',
  'フロア': 'Floors',
  '冒険マップ（ダンジョンを押すと下にくわしく出る）': 'Adventure map (tap a dungeon to see more below)',
  '{name}（まだ開いていない）': '{name} (not open yet)',
  '{name}（{done}/{all}フロア）': '{name} ({done}/{all} floors)',
  '{name}（{done}/{all}フロア・クリア）': '{name} ({done}/{all} floors · cleared)',
  '章': 'Chapters',
  // 英雄の塔の札
  '自己ベスト {n}階': 'Personal best: floor {n}',
  '1階から、どこまで登れるかな': 'Start at floor 1. How high can you climb?',
  '地図喰いをたおすと開く': 'Opens when you defeat the Map Eater',
  // 今日の手配書・コインのかせぎ方（設計書 §5.1 の例の表）
  '今日の手配書': 'Today’s Wanted posters',
  'ゲームでヒントなしの一発正解！': 'Get it right on the first try in a game, with no hints!',
  'コインのかせぎ方': 'How to earn coins',
  'クイズ1回の例（はじめて正解した国は、さらに +{coins}）': 'Examples for one quiz (+{coins} more for each country you get right for the first time)',
  'ゲーム': 'Game',
  '練習・国旗→国名・10問（一発8・やり直し2）': 'Practice · Flag → Name · 10 questions (8 on the first try · 2 after a retry)',
  '練習・10問・パーフェクト': 'Practice · 10 questions · Perfect',
  '挑戦・10問・ノーミス': 'Challenge · 10 questions · No mistakes',
  '挑戦・10問・3回目でクリア': 'Challenge · 10 questions · Cleared on the 3rd try',
  'タイムアタック・10問・クリア': 'Time Attack · 10 questions · Cleared',
  'タイムアタック・10問・7問目で失格': 'Time Attack · 10 questions · Out at question 7',
  '練習・場所→国旗・全世界・全部（195問）・85%': 'Practice · Location → Flag · World · All (195 questions) · 85%',
  '約70+50 = 120': '~70+50 = 120',
  '約1,990+90+470 = 約2,550': '~1,990+90+470 = ~2,550',
  'クイズで稼ぐ': 'Earn coins in quizzes',
  // かざり（旅人カードの横・選ぶ窓）
  'かざりを変える': 'Change decorations',
  'かざりを選ぶ': 'Choose decorations',
  '旅人カードと冒険ランキングに出る仲間の国旗（{max}つまで）。もう一度押すと外れる': 'Pick up to {max} ally flags to show on your Traveler card and the Adventure leaderboard. Tap a flag again to remove it.',
  '決定': 'OK',
  '✓ かざり{n}': '✓ Decoration {n}',
  // 章の終わりのストーリーの窓
  '冒険をつづける': 'Continue the Adventure',
  // データ（引き継ぎコード・コードで復元・冒険データを消す）
  'データ（引き継ぎコード）': 'Data (transfer code)',
  '引き継ぎコード（ほかの端末の「コードで復元」に入れる）': 'Transfer code (enter it in “Restore from code” on your other device)',
  'コードで復元（前の端末でコピーしたコードをはりつける）': 'Restore from code (paste the code you copied on your old device)',
  'コードで復元': 'Restore from code',
  '冒険データを消す': 'Delete Adventure data',
  'コピーできなかったので、選んである文字をコピーしてね': 'Couldn’t copy. Please copy the selected text.',
  'コードが正しくないみたい': 'That code doesn’t look right',
  '今のデータを上書きする？（{from} → {to}）': 'Overwrite your current data? ({from} → {to})',
  'Lv{lv}・仲間{n}': { one: 'Lv {lv} · {n} ally', other: 'Lv {lv} · {n} allies' },
  'まちがえた記録も入れかえる？': 'Also replace your list of missed countries?',
  '引き継ぎコードで復元したよ': 'Restored from your transfer code',
  '冒険データを消す？（コイン・Lv・仲間が全部なくなる）': 'Delete your Adventure data? (You’ll lose all your coins, your level, and your allies)',
  'ほんとうに消す？ もとにもどせないよ': 'Are you sure? This can’t be undone.',
  // 開発用パネル（?rpgdebug=1）
  '開発用パネル（?rpgdebug=1）': 'Developer panel (?rpgdebug=1)',
  'Lv にする': 'Set Lv',
  '全部のフロアを開く': 'Unlock all floors',
  '塔': 'Tower',
  '階から': 'Start at floor',
  '英雄の塔は地図喰いをたおすと開くよ': 'The Tower of Heroes opens after you defeat the Map Eater',

  // ---- 2つ以上の rpg-*.js が使う文（Task 6〜: 最初に使うファイルが COVER に入るタスクで足す。preflight C4） ----
  // 画面の見出しの左の戻るボタン（rpg-cards.js。あとで rpg-team.js・rpg-rank.js も）
  '← 冒険': '← Adventure',

  // ---- ストーリー（rpg-core の STORY・STORY_END。子ども向けのやさしい英語・2人称 you, the Traveler・出来事を足さない） ----
  // 「地図喰い（ちずくい）」の（ちずくい）は読みがななので訳さない。「地球の国のなかまたち」は仲間（allies）ではなく friends
  '世界地図をかじる怪物「地図喰い（ちずくい）」と、その手下のモンスターたちが、世界中の国旗を持っていっちゃった。':
    'The Map Eater, a monster that chews on the world map, ran off with flags from all over the world, along with its monster minions.',
  '旅人のきみは、クイズで集めたコインで力をつけ、国のカードの仲間といっしょに6つの地域を旅する。':
    'You, the Traveler, grow stronger with the coins you collect in quizzes, and travel through six regions with your country card allies.',
  '国を思い出すたびに、国旗がひとつ戻ってくる。地図喰いの巣で親玉をたおして、195の旗を取りもどそう！':
    'Each time you remember a country, one flag comes back. Defeat the big boss in the Map Eater’s Lair and win back the 195 flags!',
  '🌍 地球クリア！': '🌍 Earth cleared!',
  '地図喰いをたおすと、195の旗が空に舞いもどった。':
    'When you defeated the Map Eater, the 195 flags came fluttering back into the sky.',
  'でも、地図喰いのいた場所に、鏡のような裂け目がひとつ残っている。':
    'But where the Map Eater had been, there was still a single crack that looked like a mirror.',
  'のぞきこむと、そこにはそっくりだけど少しちがう、もうひとつの地球があった…':
    'When you peeked inside, you saw another Earth that looked just the same, but a little different…',
  '🪞 第2章 鏡の地球': '🪞 Chapter 2: Mirror Earth',
  '鏡の地球では、国旗がみんな似たものに化けている。':
    'On Mirror Earth, all the flags are disguised as look-alikes.',
  '本物の旗を見分けられるのは、旅人のきみだけ。':
    'Only you, the Traveler, can tell which flags are real.',
  '鏡の地図喰いをたおして、ふたつの地球をつなぐ裂け目を閉じよう！':
    'Defeat the Mirror Map Eater and close the crack that connects the two Earths!',
  '🪞 第2章クリア！': '🪞 Chapter 2 cleared!',
  '裂け目が閉じる直前、鏡の地図喰いがさけんだ。「母さま、あとはたのむ…」':
    'Just before the crack closed, the Mirror Map Eater shouted, “Mother, it’s up to you now…”',
  '夜空を見上げると、星がひとつ、またひとつと消えていく。':
    'When you looked up at the night sky, the stars were vanishing, one after another.',
  '地図喰いを生んだ「星喰い」が、宇宙から地球をねらっていたんだ。':
    'The Star Eater, the mother of the Map Eater, had been targeting Earth from space.',
  '🪐 第3章 宇宙': '🪐 Chapter 3: Space',
  '星喰いは、星をひとつずつ飲みこみながら地球へ近づいている。':
    'The Star Eater is swallowing the stars one by one as it comes closer to Earth.',
  '星には、地球の国のなかまたちの記憶が眠っている。':
    'Memories of the friendly countries of Earth are sleeping inside the stars.',
  '宇宙から地球を見下ろして、国の場所を思い出し、星喰いを止めよう！':
    'Look down at Earth from space, remember where the countries are, and stop the Star Eater!',
  '🌟 エンディング': '🌟 Ending',
  '星喰いが消えると、飲みこまれた星たちがいっせいに光りはじめた。':
    'When the Star Eater disappeared, all the stars it had swallowed began to shine at once.',
  '地球も、鏡の地球も、宇宙も、もう安心だ。':
    'Earth, Mirror Earth, and Space are all safe now.',
  'でも旅は終わらない。英雄の塔のてっぺんは、まだだれも見たことがない――':
    'But the journey isn’t over. No one has seen the top of the Tower of Heroes yet—',
});
