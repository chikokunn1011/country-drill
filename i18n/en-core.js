// v=1
// 英語版（PR5）: index.html の共通の文・ホーム・設定（インラインの節 データ・地図・ドパガキ向けの演出・画面切り替え・設定）。
// キーは T('…') の日本語と、// i18n-data:start 〜 end の地域名
Object.assign(window.I18N_EN ??= {}, {
  // タイム（ranking.js が無いときの formatTime）
  '{m}分{s}.{c}秒': '{m}:{s}.{c}',
  '{s}.{c}秒': '{s}.{c}s',

  // 地域（データのキーは日本語のまま。表示だけ）
  '全世界': 'Whole world',
  'アジア': 'Asia',
  'ヨーロッパ': 'Europe',
  'アフリカ': 'Africa',
  '北・中央アメリカ': 'North & Central America',
  '南アメリカ': 'South America',
  'オセアニア': 'Oceania',
  '東アジア': 'East Asia',
  '東南アジア': 'Southeast Asia',
  '南アジア': 'South Asia',
  '中央アジア': 'Central Asia',
  '西アジア': 'West Asia',
  '東ヨーロッパ': 'Eastern Europe',
  '西ヨーロッパ': 'Western Europe',
  'カリブ海': 'Caribbean',
  'アフリカ北側': 'Africa (north half)',
  'アフリカ南側': 'Africa (south half)',
  'テーマ: {n}': 'Collection: {n}',

  // 出題のしかた（MODES）
  '国旗 → 国名': 'Flag → Name',
  '国旗を見て国名を選ぶ': 'See the flag, pick the country name',
  '国名 → 国旗': 'Name → Flag',
  '国名を見て国旗を選ぶ': 'See the country name, pick the flag',
  '場所 → 国旗': 'Location → Flag',
  '地図の場所から国旗を選ぶ': 'See a spot on the map, pick the flag',
  '国旗 → 場所': 'Flag → Location',
  '国旗を見て地図の場所を選ぶ': 'See the flag, pick its spot on the map',
  '白地図タップ': 'Tap the map',
  '国旗を見て白地図をタップ': 'See the flag, tap the country on a blank map',

  // 遊び方（KINDS）
  '練習': 'Practice',
  'まちがえた問題は後半にもう一度出る。全部正解したら終了': 'Questions you miss come back later. Finish when you get them all right.',
  '挑戦': 'Challenge',
  'まちがえたら最初からやり直し。ノーミスでクリアを目指す': 'One mistake sends you back to the start. Aim for a perfect run.',
  'タイムアタック': 'Time Attack',
  '1ミスで失格。クリアタイムでランキングに挑戦': 'One mistake and you’re out. Race the clock for the leaderboard.',

  // 地図の拡大・縮小
  '縮小': 'Zoom out',
  '拡大': 'Zoom in',
  '＋': '+',
  '全体': 'World',
  '戻す': 'Reset',
  '{r}の白地図。国旗の国をタップ。矢印キーで動かし、Enter で真ん中の場所を答える':
    'Blank map: {r}. Tap the flag’s country. Use the arrow keys to move the map and press Enter to answer with the center point.',

  // ドパガキ向け（Hype mode）のほめ言葉
  '正解！！': 'Correct!!',
  'ナイス！': 'Nice!',
  '天才！？': 'Genius!?',
  'すごすぎ！': 'Amazing!',
  'さすが！': 'Well done!',
  '神！': 'Legendary!',
  'つよい！': 'Unstoppable!',
  '完璧！': 'Perfect!',
  'ドパミン全開！': 'Full hype!',

  // 地図の読みこみの帯
  '地図を読みこみ中…': 'Loading map…',
  '地図を読みこめなかった': 'Couldn’t load the map',

  // 設定
  'ライト': 'Light',
  'ダーク': 'Dark',
  '端末に合わせる': 'Match device',
  'ふつう': 'Normal',
  '大きめ': 'Large',
  'とても大きい': 'Extra large',
  'オフ': 'Off',
  'まちがえた記録: {n}か国': { one: 'Mistakes recorded: {n} country', other: 'Mistakes recorded: {n} countries' },
  'まちがえた記録はまだない': 'No mistakes recorded yet',
});
