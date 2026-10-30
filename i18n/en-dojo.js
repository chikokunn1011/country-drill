// v=1
// 英語版（PR5）: dojo.js の似た国旗の道場（画面・モード選択の帯・グループの説明 DOJO.LABEL）。
// キーは T('…') の日本語。'国旗 → 国名'・'国名 → 国旗' は en-core.js、'{n}の国旗' と答えの欄（正解・えらんだ・にている）は en-quiz.js
Object.assign(window.I18N_EN ??= {}, {
  // モード選択の帯と画面
  '🔍 似た国旗の道場 →': '🔍 Look-alike Flags Dojo →',
  '似た国旗の道場': 'Look-alike Flags Dojo',
  'にている国旗のグループを選ぶと、そのグループの国だけで{n}問。まちがえた問題はあとでもう一度出るよ。': {
    one: 'Pick a group of look-alike flags for {n} question on just those countries. Any you miss come back later.',
    other: 'Pick a group of look-alike flags for {n} questions on just those countries. Any you miss come back later.',
  },
  '出し方': 'Question type',
  'よく取りちがえるペア': 'Often mixed-up pairs',
  '{a}・{b}': '{a} & {b}',
  '{n}回': { one: '{n} time', other: '{n} times' },
  'ノーミスでクリアずみ': 'Cleared with no mistakes',
  // 終わったあとの1行（{g} はグループの説明）
  '{g}：一発正解 {f} / {n}': '{g}: {f} / {n} right on the first try',
  '{g}：一発正解 {f} / {n}・ノーミス！': '{g}: {f} / {n} right on the first try. No mistakes!',
  // グループの説明（DOJO.LABEL）
  '青・黄・赤のたて3色': 'Blue, yellow, red vertical tricolor',
  '赤と白': 'Red and white',
  '緑・白・オレンジ/赤のたて3色': 'Green, white, orange/red vertical tricolor',
  '白・青・赤のよこ3色': 'White, blue, red horizontal tricolor',
  '青地にユニオンジャック': 'Union Jack on blue',
  '緑・黄・赤のたて3色': 'Green, yellow, red vertical tricolor',
  '黄・青・赤': 'Yellow, blue, red',
  '青・白・青': 'Blue, white, blue',
  '赤・白・黒': 'Red, white, black',
  '赤・白・黒・緑': 'Red, white, black, green',
  '北欧の十字': 'Nordic cross',
  '赤・黄・緑': 'Red, yellow, green',
  '黒・黄・赤': 'Black, yellow, red',
  '赤・白・緑': 'Red, white, green',
  '赤・白・赤': 'Red, white, red',
  '赤白のしま＋青': 'Red and white stripes with blue',
  'まんなかに丸': 'Circle in the center',
  '赤地に三日月': 'Crescent on red',
  '赤地に黄色': 'Yellow on red',
  '赤・白・青': 'Red, white, blue',
  '左に三角': 'Triangle on the left',
  '緑・黄・赤と帯': 'Green, yellow, red with a band',
  '緑・黄/白・青': 'Green, yellow/white, blue',
  'ななめの帯': 'Diagonal band',
  'ギザギザの白': 'White zigzag',
});
