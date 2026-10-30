// v=2
// 英語版（PR6）: profile.js の文（プロフィール画面・結果画面の「載せる」箱・プロフィールの窓・引き継ぎ）。
// en-html.js と同じキー（プロフィール・ホームへ・設定・再読み込み・プライバシーポリシー）は同じ訳（en-html.js はブラウザが読まない）
Object.assign(window.I18N_EN ??= {}, {
  // 画面・窓
  'プロフィール': 'Profile',
  'ホームへ': 'Back to home',
  '読みこみ中…': 'Loading…',
  '読みこめなかった': 'Couldn’t load',
  '再読み込み': 'Reload',
  '送信中…': 'Sending…',
  'このプロフィールは別の端末に引き継がれたよ': 'This profile was moved to another device',
  '{name} のプロフィールを引き継いだよ': 'Moved {name}’s profile to this device',

  // 名前の入力欄の注意書き（{link} はプライバシーポリシーへのリンク）
  '本名や学校名は使わないでね（{link}）': 'Don’t use your real name or your school’s name ({link}).',
  'プライバシーポリシー': 'Privacy policy',

  // 結果画面の「載せる」箱
  'ランキングに載せる？': 'Post to the leaderboard?',
  'もう一回送る': 'Send again',
  'ニックネーム（12文字まで）': 'Nickname (up to 12 characters)',
  'ニックネーム': 'Nickname',
  'プロフィールを作って載せる': 'Create a profile and post',
  '{name} で載せる': 'Post as {name}',
  '名前でプロフィールを作ると、これからの記録は自動でランキングに載るよ': 'Once you create a profile, your records will be posted to the leaderboard automatically.',
  '載せたよ！': 'Posted!',

  // プロフィール画面
  'プロフィールを作ると、タイムアタック・今日の難問・冒険のランキングにこの名前で載るよ。':
    'With a profile, your name appears on the Time Attack, Daily Puzzle, and Adventure leaderboards.',
  'プロフィールを作る': 'Create a profile',
  '作る': 'Create',
  'ほかの人と同じニックネームは使えないよ。名前はあとから変えられる': 'You can’t use a nickname someone else has. You can change it later.',
  '名前を変える': 'Change nickname',
  '変える': 'Change',
  'ランキングの名前は、前の記録もふくめて新しい名前になるよ': 'Your new nickname will also show on your past records on the leaderboard.',
  '名前を変えたよ': 'Nickname changed',
  'かざり': 'Decorations',
  '冒険の仲間の国旗を3つまで、名前の横にかざれるよ': 'Show up to 3 flags of your Adventure allies next to your nickname.',
  '冒険でかざりを選ぶ': 'Choose decorations in Adventure',
  '設定': 'Settings',
  'プロフィールを公開する': 'Make my profile public',
  'オフにすると、ランキングで名前を押した人には名前とかざりだけ見えるよ': 'When off, people who tap your nickname on the leaderboard see only your nickname and decorations.',
  '記録をランキングに自動で載せる': 'Post records to the leaderboard automatically',
  'オフにすると、結果画面の［載せる］を押したときだけ載るよ': 'When off, records are posted only when you tap Post on the results screen.',

  // プロフィールの窓（カード）
  'このプロフィールは非公開だよ': 'This profile is private',
  '〈{title}〉': '“{title}”',
  'バッジ {n}個（全{t}個中）': 'Badges: {n} of {t}',
  '冒険 Lv{lv}・ダンジョン{d}/{all}': 'Adventure: Lv {lv} · Dungeons {d}/{all}',
  '英雄の塔 {n}階': 'Tower of Heroes: floor {n}',
  '{mode}・{region}・{count}': '{mode} · {region} · {count}',
  '全部': 'All',
  '{time}（{rank}位）': '{time} (#{rank})',
  '今日の難問 参加{n}回（うち全問正解{q}回）': { one: 'Daily Puzzle: played once, {q} perfect', other: 'Daily Puzzle: played {n} times, {q} perfect' },
  'はじめた日 {date}': 'Started {date}',

  // 引き継ぎ（Move to a new device・Transfer code）
  '引き継ぎ': 'Move to a new device',
  '新しい端末に、プロフィールとこの端末のデータ（冒険・バッジ・設定など）を移せるよ': 'Move your profile and this device’s data (Adventure, badges, settings, and more) to a new device.',
  '引き継ぎコードを出す': 'Get a transfer code',
  'この端末のデータ（冒険・バッジ・設定など）を預けて、コードを出すよ。新しい端末でコードを入れると、この端末のプロフィールは使えなくなる':
    'This will upload this device’s data (Adventure, badges, settings, and more) and give you a code. Once the code is entered on a new device, the profile on this device will stop working.',
  '{time} まで・1回だけ使えるよ。出し直すと前のコードは使えなくなる': 'Valid until {time}, and works only once. Getting a new code cancels the old one.',
  'コピー': 'Copy',
  'コピーしたよ': 'Copied',
  'コピーできなかった。コードを長押ししてコピーしてね': 'Couldn’t copy. Press and hold the code to copy it.',
  '引き継ぎコードを入れる': 'Enter a transfer code',
  '入れる': 'Enter',
  '前の端末で出したコードを入れると、この端末にプロフィールとデータが移るよ': 'Enter the code from your old device to move your profile and data to this device.',
  '英字と数字で入れてね（0・O・1・I は使わない）': 'Use English letters and numbers (no 0, O, 1, or I)',
  'コードのプロフィールとデータをこの端末に移すよ。この端末の今のデータ（冒険・バッジ・設定など）は上書きされる':
    'This will move the code’s profile and data to this device. This device’s current data (Adventure, badges, settings, and more) will be replaced.',
  'コードのプロフィールとデータをこの端末に移すよ。この端末の今のデータ（冒険・バッジ・設定など）は上書きされる。この端末のプロフィール「{name}」は使えなくなる':
    'This will move the code’s profile and data to this device. This device’s current data (Adventure, badges, settings, and more) will be replaced. The profile “{name}” on this device will stop working.',
});
