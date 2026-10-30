// v=1
// 英語版（PR5）: index.html の図鑑（インラインの節 図鑑）。
// キーは T('…') の日本語。地域名・地図の拡大縮小（縮小・拡大・＋・戻す）は en-core.js、'{n}の位置' は en-quiz.js
Object.assign(window.I18N_EN ??= {}, {
  // 一覧
  'すべての地域': 'All regions',
  '{n}か国': { one: '{n} country', other: '{n} countries' },
  '首都 {c}': 'Capital: {c}',
  // 地図と情報欄
  '{r}の地図。国をタップすると情報が出る': 'Map: {r}. Tap a country to see its details.',
  '地図の国をタップすると、国旗・首都などが出るよ。': 'Tap a country on the map to see its flag, capital and more.',
  '小さい国は丸印をタップ。ピンチやホイールで拡大できる。': 'For small countries, tap the circle. Pinch or use the mouse wheel to zoom.',
  'この国のページ ›': 'Country page ›',
  // 国の小窓（en-html.js の '閉じる' と同じ訳。en-html.js はブラウザが読まない）
  '閉じる': 'Close',
});
