// 国旗クエスト（RPG）の e2e の共通部品。開くときは openRpg（badges.js を止めて、RPG のイベントとトーストを積む）。バトルは startBattle・battleAnswer・winBattle
import assert from 'node:assert/strict';
import { openApp, pickSetup, answerCorrect, answerWrong, settleResult } from './helpers.mjs';

// RPG のファイル。既存のテストが「RPG がある」ことだけで落ちるときは、開くときに blockScripts: RPG_FILES を渡す
export const RPG_FILES = ['rpg-core.js', 'rpg.js', 'rpg-cards.js', 'rpg-battle.js', 'rpg-team.js', 'rpg-rank.js'];
// window.__ev に積むイベント（helpers の events(page, type?) で読める）
export const RPG_EVENTS = ['rpg:ready', 'rpg:coins', 'rpg:levelup', 'rpg:join', 'rpg:promote', 'rpg:pull', 'rpg:answer', 'rpg:battle', 'rpg:clear',
  'rpg:overcome', 'rpg:bounty', 'rpg:share', 'badge:earned', 'badge:title',
  'drill:start', 'drill:answer', 'drill:result', 'drill:screen', 'drill:book-open', 'drill:misses-reset'];

// 読み込むたびに（再読み込みのあとも）ページのスクリプトより前に走る。イベントを window.__ev に、出たトーストの文字を window.__toasts に積む
const RECORD = `(() => {
  window.__ev = window.__ev || [];
  window.__toasts = window.__toasts || [];
  for (const type of ${JSON.stringify(RPG_EVENTS)}) document.addEventListener(type, e => window.__ev.push({ type: e.type, ...e.detail }));
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent);
  }).observe(document, { childList: true, subtree: true });
})();`;

// RPG の e2e はこれで開く。既定で badges.js を止める（本物とつなぐときだけ blockScripts: [] を渡す）。opts.init があれば RECORD のあとに走らせる
export function openRpg(browser, opts = {}) {
  const extra = typeof opts.init === 'function' ? `(${opts.init})();` : opts.init ?? '';
  return openApp(browser, { blockScripts: ['badges.js'], ...opts, init: `${RECORD}\n${extra}` });
}

// このページ（再読み込みしてからの分）で出たトーストの文字
export const toastTexts = page => page.evaluate(() => window.__toasts);

// localStorage の 'rpg'（無ければ null）
export const readSave = page => page.evaluate(() => {
  const s = localStorage.getItem('rpg');
  return s === null ? null : JSON.parse(s);
});
// 'rpg' に v（文字列はそのまま、ほかは JSON）を入れて読み込み直す
export async function writeSave(page, v) {
  await page.evaluate(s => localStorage.setItem('rpg', s), typeof v === 'string' ? v : JSON.stringify(v));
  await page.reload();
  await page.waitForFunction(() => document.readyState === 'complete');
}

// node 側の端末の日付（'YYYY-MM-DD'）
export function localToday() {
  const d = new Date(), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// テスト用のセーブ。今日の手配書を空にしておくので、手配書の +30 がコインの額に混ざらない
export const saveWith = fields => ({ v: 1, intro: true, bounty: { d: localToday(), a: [], done: [] }, ...fields });

// 練習を始め、k 回目の回答（0から）が wrong にあればまちがえ、なければ正解して「次へ」をくり返す。結果画面が出たら settleResult まで
export async function playPractice(page, { mode = 'f2n', region = 'all', count = 5, wrong = [] } = {}) {
  await pickSetup(page, { mode, kind: 'practice', region, count });
  await page.click('#start');
  const max = await page.evaluate(() => G.set.length * 3);
  for (let k = 0; k < max && await page.isHidden('#scr-result'); k++) {
    await (wrong.includes(k) ? answerWrong : answerCorrect)(page);
    await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
  await settleResult(page);
}

// 今の問題を国 a に置きかえる
export const forceNext = (page, a) => page.evaluate(a => { G.queue.unshift(byA.get(a)); nextQuestion(); }, a);

// ガチャの結果を全部表にする。［ぜんぶめくる］は全部表になると隠れる（押すのが間に合わないことがある）ので、onclick を直接呼ぶ。
// めくる interval だけでも全部表になるので待たずに、押したその場で裏が0枚になったことを見る
export async function flipAll(page) {
  const n = await page.evaluate(() => { $('ga-flipall').click(); return document.querySelectorAll('#ga-res .rpg-card.is-back').length; });
  assert.equal(n, 0, '［ぜんぶめくる］を押しても裏のカードが残っている');
}

// ---- バトル（rpg-battle.js） ----
// 出題から TUNING.battle.guardMs たつまで待つ（その間の選択肢のクリックは無視される）
export const battleGuard = page => page.waitForFunction(() => performance.now() - RPG_BATTLE.state().shownAt >= RPG_CORE.TUNING.battle.guardMs);
// RPG_BATTLE.start → 登場画面の［たたかう］→ 最初の問題が出るまで
export async function startBattle(page, id, floor) {
  await page.evaluate(([id, floor]) => RPG_BATTLE.start(id, floor), [id, floor]);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
}
// いまの問題に正解／不正解で答える。不正解なら答え合わせの［つぎへ］まで押す。
// 正解なら次の問題が出る（shownAt が変わる）か、バトルが終わる・思い出して復活に入るまで待つ
export async function battleAnswer(page, right) {
  await battleGuard(page);
  const { a, shownAt, phase } = await page.evaluate(() => ({ a: RPG_BATTLE.cur(), ...RPG_BATTLE.state() }));
  await page.locator(right ? `#scr-battle .choice[data-a="${a}"]` : `#scr-battle .choice:not([data-a="${a}"])`).first().click();
  if (!right) { await page.click('#bt-next'); return; }
  await page.waitForFunction(([t0, p0]) => {
    const s = RPG_BATTLE.state();
    return s.shownAt !== t0 || s.phase === 'end' || (s.phase === 'revive' && p0 !== 'revive');
  }, [shownAt, phase]);
}
// 終わるまで正解し続ける。正解した数を返す
export async function winBattle(page) {
  let n = 0;
  while (await page.evaluate(() => RPG_BATTLE.state().phase) !== 'end') { await battleAnswer(page, true); n++; }
  return n;
}
