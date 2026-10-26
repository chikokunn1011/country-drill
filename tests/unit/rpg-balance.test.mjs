// 国旗クエスト（RPG）の経済のペースのテスト（設計書 §5.4）。帯をはずれたら落ちる。
// 値は全部 TUNING と RPG_CORE の関数から読む。モデルの前提（設計書 §5.4 に書いてある数字）だけは決め打ち
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T0, loadAll, mulberry32 } from './rpg_load.mjs';

const { core: K, C } = loadAll();
const T = K.TUNING;
const CODES = C.map(c => c.a);

// ---- モデルの前提 ----
const PRACTICE_MIN = 1.3;              // 練習10問にかかる分
const FE_PER_MIN = 80;                 // はじめて正解ボーナスの上乗せ（1分あたり）
const FE_POOL = 390 * T.quiz.firstEver;  // 主に2モード（390枠）を遊ぶとして、使える合計
const BOUNTY_AVG = 120;                // 手配書の平均（1日）
const OVERCOME_AVG = 90, OVERCOME_DAYS = 14;  // 克服（はじめの2週間だけ、1日）
const LV_SHARE = 0.6;                  // コインの6割をレベルに（4割はガチャ）
const FLOOR_MIN = 1.5;                 // 1フロアにかかる分
const DAY_MIN = 15;                    // 毎日15分の人
const LAST = 35;                       // 地図喰い（地図喰いの巣のボス）のステージ
const MAX_DAYS = 60;

// ---- 練習10問（国旗→国名・ヒントなし） ----
const all15 = Object.fromEntries(CODES.map(a => [a, 15]));
// はじめて正解は全部払い済み（fe 全部15）、今日のクリアも済み（day.first）の新しいセーブ
const quietSave = () => { const f = K.fresh(T0); return K.sanitize({ ...f, fe: all15, day: { ...f.day, first: true } }, T0); };
// firsts[i] が false の国は1回目にまちがえて、10問のあとにもう一度答えて正解する。その回にもらったコインを返す
const practice10 = firsts => {
  const d = quietSave(), as = CODES.slice(0, 10), m = {};
  const run = K.newRun({ sid: 'bal', kind: 'practice', mode: 'f2n', region: 'all', n: 10, hint: false }, d);
  const answer = (a, right, first) => {
    const missesBefore = m[a] || 0, missesAfter = right ? Math.max(0, missesBefore - 1) : missesBefore + 1;
    m[a] = missesAfter;
    K.runAnswer(run, { a, right, first, hint: false, mode: 'f2n', missesBefore, missesAfter });
  };
  as.forEach((a, i) => answer(a, firsts[i], true));
  as.forEach((a, i) => { if (!firsts[i]) answer(a, true, false); });
  const k = firsts.filter(Boolean).length;
  const res = { outcome: 'clear', kind: 'practice', mode: 'f2n', n: 10, firstTry: k, wrongs: 10 - k, attempts: 1, timeMs: null };
  return K.settleRun(d, run, res, T0).delta;
};
// 一発8・やり直し2
const EXAMPLE = [...Array(8).fill(true), false, false];
const QUIZ_PER_MIN = practice10(EXAMPLE) / PRACTICE_MIN;

// 重い計算は1回だけして、report でも同じ値を使う
const once = f => { let v; return () => v ??= f(); };

// mulberry32(7) で4000回、1問ごとに 85% で一発正解
const practiceAvg = once(() => {
  const rng = mulberry32(7), N = 4000;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += practice10(Array.from({ length: 10 }, () => rng() < 0.85));
  return sum / N;
});

// ---- 冒険の進み方 ----
// 仲間3枚のこうげき（1日目 +5 → 28日目から +25）と、それを Lv に直した実質の Lv
const party = day => 5 + 20 * Math.min(day - 1, 27) / 27;
const effLv = (lv, day) => lv + party(day) / T.hero.atkLv;
const isBoss = s => s % 5 === 0;
// 通常は推奨 Lv より2、ボスは1低くても勝てる
const canWin = (lv, day, s) => effLv(lv, day) >= K.recLv(s) - (isBoss(s) ? 1 : 2);

// レベルに回すコインと Lv。旅立ちの TUNING.start は10連に使うので入れない
const economy = () => {
  const e = { lv: 1, bank: 0, fe: FE_POOL };
  e.earn = coins => { e.bank += coins * LV_SHARE; };
  // クイズの1分（はじめて正解ボーナスは使い切ったら0）
  e.quiz = () => { const fe = Math.min(FE_PER_MIN, e.fe); e.fe -= fe; e.earn(QUIZ_PER_MIN + fe); };
  // 1分ごとに、上げられるだけ上げる
  e.levelUp = () => { while (e.bank >= K.levelCost(e.lv)) { e.bank -= K.levelCost(e.lv); e.lv++; } };
  return e;
};

// 1日目、素の Lv（仲間なし）が南アメリカのボスの推奨 Lv になるまでクイズ → 5フロア。合計の分
const southAmericaMinutes = () => {
  const e = economy();
  let min = 0;
  while (e.lv < K.recLv(5) && min < 60) {   // 帯の外（60分）まで来たら止める
    if (min === 0) e.earn(T.daily);
    e.quiz();
    e.levelUp();
    min++;
  }
  return min + 5 * FLOOR_MIN;
};

// 毎日15分。m % 4 === 3 の分がバトル、ほかはクイズ。ステージ35をクリアした日（60日で届かなければ Infinity）
const mapEaterDay = once(() => {
  const e = economy();
  let cleared = 0, spent = 0;   // spent = 次のステージに使った分
  for (let day = 1; day <= MAX_DAYS; day++) {
    for (let m = 0; m < DAY_MIN; m++) {
      if (m === 0) e.earn(T.daily + BOUNTY_AVG + (day <= OVERCOME_DAYS ? OVERCOME_AVG : 0));
      if (m % 4 !== 3) e.quiz();
      // 勝てるときだけ 1/1.5 フロア進む（勝てないときはその分はなにもしない）。進みの余りは次のステージに持ちこす
      else if (canWin(e.lv, day, cleared + 1)) {
        spent++;
        if (spent >= FLOOR_MIN) {
          spent -= FLOOR_MIN;
          const s = ++cleared;
          e.earn(K.battleReward(s, { win: true, first: true, boss: isBoss(s) }));
          if (s === LAST) return day;
        }
      }
      e.levelUp();
    }
  }
  return Infinity;
});

// mulberry32(3) で2万回、新しいセーブから1回ずつ引いて最初の★3までの回数の平均
const goldAvg = once(() => {
  const rng = mulberry32(3), N = 20000;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const d = K.fresh(T0);
    let n = 0, star = 0;
    // 天井が効かなくても止まるように、帯の外（1000回）で打ち切る
    while (star !== 3 && n < 1000) { star = K.pull(d, 'all', 1, rng, C)[0].star; n++; }
    sum += n;
  }
  return sum / N;
});

const band = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${x}（帯 ${lo}〜${hi}）`);

test('practice_10_band', () => {
  // run の計算が1問ずつの式とクリアボーナスの式と同じか（モデルの前提を確かめる）
  const ac = o => K.answerCoins({ kind: 'practice', mode: 'f2n', right: true, hint: false, weak: false, nth: 1, feDone: true, ...o }).coin;
  assert.equal(practice10(EXAMPLE), 8 * ac({ first: true, retryUsed: false }) + 2 * ac({ first: false, retryUsed: false })
    + K.clearBonus({ kind: 'practice', mode: 'f2n', hint: false, n: 10, firstTry: 8, wrongs: 2, attempts: 1 }));
  band(practiceAvg(), 90, 130, '練習10問の平均コイン');
});

test('south_america_boss_band', () => {
  band(southAmericaMinutes(), 10, 30, '南アメリカのボスまでの分');
});

test('map_eater_band', () => {
  band(mapEaterDay(), 14, 35, '地図喰いをたおした日');
});

test('gold_band', () => {
  band(goldAvg(), 20, 35, '最初の★3までの平均回数');
});

test('report', () => {
  console.log(`[balance] 練習10問 ${practiceAvg().toFixed(1)}●（1分 ${QUIZ_PER_MIN.toFixed(1)}●）`
    + ` / 南アメリカのボス ${southAmericaMinutes()}分 / 地図喰い ${mapEaterDay()}日目 / ★3 ${goldAvg().toFixed(1)}回`);
});
