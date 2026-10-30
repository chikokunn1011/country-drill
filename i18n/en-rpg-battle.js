// v=1
// 英語版（PR8）: 冒険のバトルと英雄の塔（#scr-battle、rpg-battle.js）。
// 冒険の語は en-rpg.js の頭と tools/dict_sheet.mjs の GLOSSARY のとおり（にげる Run・たたかう Fight・会心 Critical hit・反撃 counterattack・
// 旗を取りもどす win back a flag・がんばりゲージ Effort gauge・がんばり賞 Effort prize・中ボス mini-boss・階 floor・フロア F1–F4・
// 地域ボーナス Region bonus・チームボーナス Team bonus・編成 Team・手配中 Wanted・自己ベスト Personal best）。
// ダメージの文は形ごとに1つのキー（会心・援護・旗を取りもどした。preflight C18）。1文の行は終わりのピリオドなし、2文以上は文ごとにピリオド。
// ほかの辞書のキーをそのまま使う（ここに書かない）: '冒険ホームへ'・'編成'・'＋{p}%'（en-rpg.js）、'まちがえた国'・'もう一回'・'国旗'・
// '出題中の国の位置'・'選択肢{k}の国旗'・'{n}の国旗'・'{n}の位置'・問いの文（en-quiz.js）、'仲間がいると強くなるよ（国旗ガチャ・{n}回正解）'
// （en-rpg-cards.js）、'英雄の塔'（en-badges.js）、'#国旗マスター'（en-rank.js）、'・'（en-daily.js）、地域名・グループ名（en-core.js・en-rpg.js）、
// 宇宙のテーマの名前（en-rpg.js）
Object.assign(window.I18N_EN ??= {}, {
  // ---- にげる ----
  '← にげる': '← Run',
  'にげる？（報酬はなし）': 'Run? (You won’t get a reward.)',
  'にげる？（この階の報酬はなし。塔はここで終わり）': 'Run? (No reward for this floor. Your Tower of Heroes climb ends here.)',

  // ---- 上の列（どこ・HP・旗・のこりミス・仲間） ----
  'F{f} {dungeon}': '{dungeon} · F{f}',
  'ボス {dungeon}': '{dungeon} · Boss',
  '{name} {n}階': '{name} · Floor {n}',
  '{name} {n}階 中ボス': '{name} · Floor {n} · Mini-boss',
  '{name}のHP': '{name}’s HP',
  '旅人のHP': 'Traveler’s HP',
  '取りもどした旗': 'Flags won back',
  '旗 {got}/{all}': 'Flags {got}/{all}',
  'のこりミス{n}': 'Misses left {n}',
  '地域ボーナス ×{mul}': 'Region bonus ×{mul}',
  'チームボーナス ＋{p}%': 'Team bonus +{p}%',

  // ---- 会う画面 ----
  '{name}があらわれた！': '{name} appeared!',
  // 編成の行（「チーム 」の空白は T() の外。編成の画面の Team bonus: に合わせる）
  'チーム': 'Team bonus:',
  '前の編成': 'Previous team',
  '次の編成': 'Next team',
  'へんせい': 'Edit team',
  'この編成には仲間がいないよ': 'This team has no allies',
  '倒すのに必要な正解: 約{hits}回 ／ まちがえてOK: {miss}回まで': 'Correct answers to win: about {hits} · Mistakes allowed: up to {miss}',
  'HP はつぎの階に持ちこし（階を上がると{pct}%回復、{every}階ごとの中ボスをたおすと全回復）':
    'Your HP carries over to the next floor (+{pct}% HP on each new floor, full HP when you defeat the mini-boss every {every} floors)',
  'がんばりゲージ +{p}%': 'Effort gauge +{p}%',
  '旗1枚につき正解1回で取りもどせる（Lv が足りないと2回かかることも）。旗を全部取りもどしたら勝ち！':
    'Each correct answer wins back one flag (if your level is too low, it may take 2 answers). Win back all the flags to win!',
  '正解すると攻撃！ まちがえると反撃されるよ': 'Answer correctly to attack! A wrong answer brings a counterattack.',
  'たたかう': 'Fight',
  // 始めていない画面
  'バトルは冒険ホームのダンジョンから始めてね': 'Start a battle from a dungeon on Adventure home',

  // ---- 問題・答え合わせ ----
  '⚠ 前にまちがえた国': '⚠ Missed before',
  '手配中': 'Wanted',
  '{country}！ {mon}に{dmg}ダメージ': '{country}! {dmg} damage to {mon}',
  '{country}！ {mon}に{dmg}ダメージ（{mates}の援護）': '{country}! {dmg} damage to {mon} (with help from {mates})',
  '会心！ {country}！ {mon}に{dmg}ダメージ': 'Critical hit! {country}! {dmg} damage to {mon}',
  '会心！ {country}！ {mon}に{dmg}ダメージ（{mates}の援護）': 'Critical hit! {country}! {dmg} damage to {mon} (with help from {mates})',
  '{country}！ 旗を取りもどした': '{country}! You won back a flag',
  '{country}！ 旗を取りもどした（{mates}の援護）': '{country}! You won back a flag (with help from {mates})',
  '会心！ {country}！ 旗を取りもどした': 'Critical hit! {country}! You won back a flag',
  '会心！ {country}！ 旗を取りもどした（{mates}の援護）': 'Critical hit! {country}! You won back a flag (with help from {mates})',
  '{mon}の反撃！ {dmg}ダメージ': '{mon} counterattacks! {dmg} damage',
  'ざんねん。正解は「{n}」': 'Not quite. The answer is {n}.',
  // 宇宙: テーマの一言（テーマの名前は Title Case。Southern Hemisphere もあるので “is one of the …” にしない）
  '{name}は{theme}だよ': '{name} fits the theme: {theme}',
  'えらんだのは「{n}」': 'You chose “{n}”',
  'つぎへ ⏎': 'Next ⏎',

  // ---- 終わり（勝ち・負け） ----
  '勝利！ {coins}': 'Victory! {coins}',
  '勝利！ {coins}<small>（はじめてのクリア ×{mul}）</small>': 'Victory! {coins} <small>(first clear ×{mul})</small>',
  '{land}を取りもどした！': 'Welcome back, {land}!',
  'やられた…！ でも、まちがえた国はもう覚えたはず': 'Defeated…! But now you should know the countries you missed.',
  'がんばり賞 {coins}': 'Effort prize {coins}',
  'がんばりゲージ {g}/{max}': 'Effort gauge {g}/{max}',
  'この地域を練習する': 'Practice this region',
  'つぎのフロアへ': 'Next floor',
  // ボスを初めて倒したときのシェアの文（タグは '#国旗マスター' → #FlagMaster）
  '仲間 {n}/{total}か国 {tag}': 'Allies: {n}/{total} countries {tag}',
  '国旗クエストで星喰いをたおして、宇宙を取りもどした！ {mates}': 'I defeated the Star Eater and won back Space in Flag Quest! {mates}',
  '国旗クエストで{boss}をたおした！ {mates}': 'I defeated the {boss} in Flag Quest! {mates}',
  '国旗クエストで鏡の地図喰いをたおして、ふたつの地球を守った！ {mates}': 'I defeated the Mirror Map Eater and saved both Earths in Flag Quest! {mates}',
  '国旗クエストで地図喰いをたおして、世界を取りもどした！ {mates}': 'I defeated the Map Eater and won back the world in Flag Quest! {mates}',
  '国旗クエストで{land}を取りもどした！ {mates}': 'I won back {land} in Flag Quest! {mates}',

  // ---- 英雄の塔（'英雄の塔' は en-badges.js） ----
  '{n}階クリア！ {coins}': 'Floor {n} cleared! {coins}',
  'はじめて勝った階 {coins}': 'First win on this floor {coins}',
  'HP {hp}/{max}（中ボスをたおして全回復！）': 'HP {hp}/{max} (full HP for defeating the mini-boss!)',
  'HP {hp}/{max}（{pct}%回復）': 'HP {hp}/{max} ({pct}% recovered)',
  'やめる': 'Quit',
  'つぎの階へ（{n}階）': 'Go to floor {n}',
  'やられた…！': 'Defeated…!',
  'おつかれさま！': 'Nice work!',
  '英雄の塔 {n}階まで': 'Tower of Heroes: up to floor {n}',
  '英雄の塔 1階でたおれた': 'Tower of Heroes: defeated on floor 1',
  '英雄の塔 クリアした階なし': 'Tower of Heroes: no floors cleared',
  '<small>（自己ベスト {n}階）</small>': '<small> (Personal best: floor {n})</small>',
  '冒険へ': 'Go to the Adventure',
  'もう一度（1階から）': 'Try again (from floor 1)',
});
