// v=1
// 英語版（PR5）: index.html のモード選択とクイズ（インラインの節 モード選択・クイズ）。
// キーは T('…') の日本語。タイムアタック・ランキングの文は en-rank.js
Object.assign(window.I18N_EN ??= {}, {
  // モード選択: 地域と問題数のボタン
  '全部（{n}）': 'All ({n})',
  '{n}問': { one: '{n} question', other: '{n} questions' },
  '細かく': 'Subregions',
  '{r}を細かく': 'Subregions of {r}',
  '世界地図。{r}（{n}か国）に色がついている': { one: 'World map with {r} ({n} country) highlighted', other: 'World map with {r} ({n} countries) highlighted' },
  'タイムアタックはランキングの区分に合わせて、大きい地域だけ。': 'Time Attack uses only the large regions, to match the leaderboard.',
  '大きい地域を選ぶと細かい地域も出る。地図の国をタップしても選べる。': 'Pick a large region to see its subregions. You can also tap a country on the map.',
  // タイムアタックで遊べないとき（英語版ではタイムアタックのカードを出さないので見えない）
  'テーマでは遊べない': 'Not available in a collection',
  '{m}では遊べない': 'Not available in {m}',
  // テーマ（まとめページの［このテーマでクイズ］）
  'テーマ: {t}（{n}か国）': { one: 'Collection: {t} ({n} country)', other: 'Collection: {t} ({n} countries)' },
  // 今日の難問をやめるとき（英語版では今日の難問は出ない）
  'やめると、今日の挑戦はここまでの正答数で終わりになるよ。やめる？': 'If you quit now, today’s Daily Puzzle ends with the answers you’ve gotten so far. Quit?',

  // クイズ: やめるボタン・じゅんび
  'やめてモード選択へ': 'Quit to mode select',
  'やめる（今日の挑戦はここまで）': 'Quit (end today’s puzzle here)',
  'やめて道場へ': 'Quit to the Dojo',
  'じゅんび中…': 'Getting ready…',

  // 問題文
  'この国旗はどこの国？': 'Which country has this flag?',
  'この国の国旗は？': 'Which flag belongs to this country?',
  '色がついている場所の国旗は？': 'Which flag belongs to the highlighted country?',
  'この国旗の国はどこ？': 'Where is the country with this flag?',
  'この国旗の国はどこ？ 地図をタップ': 'Where is the country with this flag? Tap the map.',
  '国旗': 'Flag',
  '出題中の国の位置': 'Location of the country in question',
  '選択肢{k}の国旗': 'Flag for choice {k}',
  '選択肢{k}の地図': 'Map for choice {k}',

  // 答えの欄（答える前の案内）
  'まちがえたら、ここに正解が出るよ': 'If you miss, the answer will show up here',
  '答えたら、ここで国旗をくらべるよ': 'Answer to compare the flags here',
  '答えたら、ここに国のプロフィールが出るよ': 'Once you answer, the country’s profile will show up here',
  '矢印キーで動かし {enter} で真ん中を答える・＋−で拡大': 'Move with the arrow keys, {enter} to pick the center, +/− to zoom',
  '{k1}〜{k4} キーでも答えられる': 'You can also answer with keys {k1}–{k4}',
  '{keys} ・ {enter} で次へ': '{keys} · {enter} for next',

  // 進み具合
  '覚えた {d} / {n}': 'Learned {d} / {n}',
  '残り {n}問': '{n} left',
  'むずかしさ {s}': 'Difficulty {s}',
  '{n}回目の挑戦': 'Attempt {n}',
  '{n}連続！': '{n} in a row!',

  // 答えたあと
  '正解！': 'Correct!',
  '失格…　正解は「{n}」': 'Disqualified… The answer is {n}.',
  'ここまで！　正解は「{n}」': 'Game over! The answer is {n}.',
  'ざんねん。正解は「{n}」。最初からやり直し！': 'Not quite. The answer is {n}. Back to the start!',
  'ざんねん。正解は「{n}」。あとでもう一度出るよ': 'Not quite. The answer is {n}. You’ll see it again later.',
  'タップした所から約{km} km': 'About {km} km from where you tapped',
  '{n}の位置': 'Location of {n}',
  '最初から →': 'Start over →',
  'もう一回': 'Play again',
  '結果を見る →': 'See results →',
  '次の問題 →': 'Next question →',
  '道場へ →': 'Back to the Dojo →',
  '結果を見る': 'See results',
  'モード選択へ': 'Mode select',

  // 国のプロフィール（factsHTML）
  '{n}の国旗': 'Flag of {n}',
  '首都': 'Capital',
  '地域': 'Region',
  '面積': 'Area',
  // 豆知識の種類（trivia.js。英語版ではまだ読まない）
  '🏳️ 国旗': '🏳️ Flag',
  '🗺️ 地理': '🗺️ Geography',
  '🍜 文化': '🍜 Culture',
  // 道場の「くらべる」パネル
  '正解': 'Correct',
  'にている': 'Look-alike',
  'えらんだ': 'You picked',

  // ドパガキ向け（Hype mode）: 連続正解が切れたときのポップ文字
  '{n} COMBO 終了…': '{n} COMBO broken…',

  // 結果画面
  '／': ' / ',
  'パーフェクト！': 'Perfect!',
  'いい感じ！': 'Nice work!',
  '次はもっといけるはず': 'You’ll do better next time',
  ' / {n} 一発正解': ' / {n} right on the first try',
  'やり直し {b}回': 'Retries {b}',
  '最高連続 {b}': 'Best streak {b}',
  'ノーミスでクリア！': 'Perfect clear!',
  'クリア！': 'Cleared!',
  '{n}<small>問連続正解</small>': '{n}<small> correct in a row</small>',
  '挑戦 {b}回目でクリア': 'Cleared on attempt {b}',
  'まちがえ {b}回': 'Mistakes {b}',
  'まちがえた国': 'Countries you missed',
});
