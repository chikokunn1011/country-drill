// 英語版（PR5）: index.html の HTML だけの文（tools/make_en.mjs だけが読む。ブラウザは読まない）。
// キーは index.html の文（前後の空白を取ったもの）か属性の値か、<style> の content の代わりの文。js の T() の文は i18n/en-*.js に書く
Object.assign(window.I18N_EN ??= {}, {
  // <style> の content の読み上げの文（content: "✓" / "正解"。選択肢の正解・まちがいの印）
  '正解': 'Correct',
  'まちがい': 'Incorrect',

  // head
  '世界195か国の国旗・国名・場所を4択クイズで覚える無料サイト。地域しぼり、タイムアタックとランキング、国旗図鑑、冒険RPGも。登録なしでスマホ・PCからすぐ遊べる。':
    'A free 4-choice quiz on the flags, names, and locations of all 195 countries. Region filters, Time Attack, leaderboards, Gallery, and Adventure RPG. No sign-up.',
  '国旗マスター｜国旗・国名・場所を覚える4択クイズ（195か国）': 'Flag Master | Flag, country, and map quiz (195 countries)',
  '国旗マスター': 'Flag Master',
  '国旗マスター｜国旗・国名・場所を覚える4択クイズ': 'Flag Master | Flag, country, and map quiz',
  '世界195か国の国旗・国名・場所を4択クイズで覚えよう。タイムアタック、国旗図鑑、冒険RPGも。':
    'Learn the flags, names, and locations of all 195 countries with a 4-choice quiz. Plus Time Attack, a flag gallery, and an Adventure RPG.',
  '世界195か国の国旗・国名・場所を4択クイズで覚える無料サイト。': 'A free 4-choice quiz to learn the flags, names, and locations of all 195 countries.',

  // トップバー・地図の読みこみ
  '図鑑': 'Gallery',
  '設定': 'Settings',
  'もう一度': 'Try again',

  // ホーム（タイトルは <br> で2行）
  '国旗': 'Flag',
  'マスター': 'Master',
  'クイズで遊ぶ': 'Play the quiz',
  '国旗・国名・場所を当てる': 'Guess the flag, name, or location',
  '今日の難問': 'Daily Puzzle',
  '毎日かわる問題で、みんなと競う': 'A new puzzle every day. Compete with other players.',
  // 埋めこみ（embed.html）の今日の難問へのリンク
  '今日の難問（20問）に挑戦': 'Try the Daily Puzzle (20 questions)',
  '冒険': 'Adventure',
  'コインで仲間を集めてダンジョンへ': 'Recruit allies with coins and head into dungeons',
  'ランキング': 'Leaderboard',
  'バッジ': 'Badges',
  'プロフィール': 'Profile',
  'ホーム画面に追加すると、電波がなくても遊べる': 'Add it to your home screen to play even when offline',
  '追加する': 'Add',
  '閉じる': 'Close',

  // 設定
  '画面の色': 'Color theme',
  '「端末に合わせる」は、スマホやPCのライト／ダークの設定と同じ色になるよ。': '“Match device” follows the light/dark setting on your phone or computer.',
  '見やすさ': 'Accessibility',
  '文字の大きさ': 'Text size',
  '色の見分けやすさ': 'Colorblind-friendly colors',
  '正解は青、まちがいはオレンジになります。': 'Right answers turn blue and wrong answers turn orange.',
  '音': 'Sound',
  '効果音を鳴らす': 'Play sound effects',
  '音量': 'Volume',
  '正解・不正解・クリア、冒険のバトル・ガチャ・レベルアップ、バッジゲットなどで音が鳴るよ。': 'Sounds play for right and wrong answers, finishing a quiz, Adventure battles, draws, and level-ups, earning badges, and more.',
  '進み方': 'Pacing',
  '正解したらすぐ次の問題へ': 'Go straight to the next question after a right answer',
  'プレイのクイズで、正解なら答えを出さずに次へ（まちがえたら正解を見せる）。': 'In quizzes, a right answer skips the answer card and moves on (a wrong answer still shows the right one).',
  '演出': 'Effects',
  'ドパガキ向け': 'Hype mode',
  '正解すると紙吹雪・コンボ・スコア倍率でド派手に盛り上がる、刺激つよめのモード（効果音もド派手になる）。': 'An intense mode where right answers set off confetti, combos, and score multipliers (with flashier sound effects too).',
  'アプリ': 'App',
  'ホーム画面に追加する': 'Add to home screen',
  '追加すると、アプリのようにすぐ開けて、電波がなくても遊べるよ。': 'Once added, it opens instantly like an app and works even offline.',
  '記録': 'Records',
  'まちがえた記録を消す': 'Clear mistake history',
  'ホームへ': 'Back to home',

  // モード選択
  'モードを選ぶ': 'Choose a mode',
  '国名も表示する（ヒントあり）': 'Also show the country name (hint)',
  'あそび方': 'Answer style',
  'テーマ': 'Collection',
  'テーマをやめる': 'Exit collection',
  '出題する地域': 'Regions',
  '問題数': 'Questions',
  'スタート': 'Start',

  // クイズ
  'やめてモード選択へ': 'Quit and change mode',

  // ランキング（英語版ではまだ出さない。PR6 で使う）
  'モード': 'Mode',
  '地域': 'Region',
  '期間': 'Period',
  '歴代': 'All time',
  '今週': 'This week',
  '上位50人まで。同じ人は自己ベストだけ。「今週」は月曜0時（日本時間）から。': 'Top 50 players, personal bests only. “This week” starts at midnight Monday, Japan time.',
  'まだ誰もいない。1位のチャンス！': 'No one here yet. Grab the top spot!',
  'ランキングに接続できなかった': 'Couldn’t connect to the leaderboard',
  '再読み込み': 'Reload',
  'この条件で遊ぶ': 'Play with these settings',

  // 図鑑
  '表示': 'View',
  '一覧': 'List',
  '地図': 'Map',
  '国名・首都で検索': 'Country or capital',   // 390px の検索の欄に収まる長さ
  '検索': 'Search',
  '首都をかくす': 'Hide capitals',

  // フッター
  '国連加盟193か国＋バチカン・コソボ（日本が承認している国）。国旗: flag-icons（MIT）／地図: Natural Earth・world-atlas':
    'The 193 UN member states plus Vatican City and Kosovo (the countries Japan recognizes). Flags: flag-icons (MIT) / Maps: Natural Earth, world-atlas',
  'サイトの案内': 'Site links',
  '遊び方': 'How to play',
  '運営者': 'About',
  'お問い合わせ': 'Contact',
  'プライバシーポリシー': 'Privacy policy',
  '国の一覧': 'All countries',
  '国旗のまとめ': 'Flag collections',

  // iPhone の「ホーム画面に追加」の案内（Safari のメニューの名前を引くときだけ Add to Home Screen と大文字）
  'ホーム画面に追加': 'Add to home screen',
  'Safari の共有ボタン（□に↑）を押して、「ホーム画面に追加」を選んでね。': 'Tap the Share button in Safari (the square with an up arrow), then choose “Add to Home Screen.”',
});
