// v=1
// 英語版（PR8）: 冒険（国旗クエスト → Flag Quest）の文。rpg-core.js のデータ（// i18n-data の名前: ダンジョン・land・章・モンスター・
// 鏡の手下の型の文・宇宙のテーマ・塔の番人・既定の編成名の頭・コインの単位）。あとのタスクで rpg.js・ストーリー・2つ以上の rpg-*.js が使う文を足す。
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
  'サンゴ礁の海': 'Coral Reef Sea',
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
  '鏡の北・中央アメリカ': 'Mirror North & Central America',
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
  'ボクサーカンガルー': 'Boxer Kangaroo',
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

  // ---- 宇宙のテーマ（答えのあとに出す名前） ----
  '島国': 'Island countries',
  '小さい国': 'Small countries',
  '赤道の国': 'Equator countries',
  '内陸国': 'Landlocked countries',
  '大きい国': 'Large countries',
  '南半球の国': 'Southern Hemisphere countries',

  // ---- 英雄の塔（'英雄の塔' は en-badges.js） ----
  '塔の番人': 'Tower Guardian',
});
