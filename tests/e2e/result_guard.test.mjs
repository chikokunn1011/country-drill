// 結果画面の連打対策：結果画面を出してから TA_GUARD_MS の間と、キーの押しっぱなしでは結果のボタンを押せない。スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, settle, settleResult, clearTimeAttack } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、最後にページで例外が出ていないかも見る
const t = (name, fn) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const submits = db => db.calls.filter(c => c.name === 'submit_score2');
// 偽DB と localStorage にプロフィール（自動 OFF）を入れて開き直す。結果画面に［チコ で載せる］が出る
async function withManualProfile(page, db) {
  db.profiles.push({ token: 'tok-1', nickname: 'チコ', pid: 'abcdefghjk12' });
  await page.evaluate(() => localStorage.setItem('profile', JSON.stringify({ token: 'tok-1', pid: 'abcdefghjk12', name: 'チコ', auto: false, isPublic: true, sent: { isPublic: true } })));
  await page.reload();
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}

// タイムアタック 国旗→国名・全世界・5問を4問解き、最後の問題を押せるようになるまで待つ
async function toLastQuestion(page) {
  await pickSetup(page, { mode: 'f2n', kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 4; i++) await answerCorrect(page);
  await settle(page);
}

// 最後の正解を押した直後（同じタスクの中）に結果画面の「もう一回」を押す＝ダブルタップの2回目が結果のボタンに当たる
t('click_guard_after_last_answer', async page => {
  await toLastQuestion(page);
  const r = await page.evaluate(() => {
    const g = G;
    document.querySelector(`.choice[data-a="${G.cur.c.a}"]`).click();
    $('r-again').click();
    return { same: G === g, result: !$('scr-result').hidden, timeMs: G.timeMs };
  });
  assert.equal(r.same, true);
  assert.equal(r.result, true);
  assert.notEqual(r.timeMs, null);
  // 待てば押せる
  await settleResult(page);
  await page.click('#r-again');
  assert.equal(await page.isVisible('#scr-quiz'), true);
  assert.equal(await text(page, '#pnum'), '1 / 5');
});

t('submit_guard', async (page, { db }) => {
  await withManualProfile(page, db);
  await toLastQuestion(page);
  await page.evaluate(() => {
    document.querySelector(`.choice[data-a="${G.cur.c.a}"]`).click();
    document.querySelector('#ta-post [data-pf="send"]').click();
  });
  await page.waitForTimeout(300);
  assert.equal(submits(db).length, 0);
  assert.equal(await page.locator('#ta-post .tamsg').textContent(), '');
  await settleResult(page);
  await page.click('#ta-post [data-pf="send"]');
  await page.locator('#ta-post .tamsg', { hasText: '載せたよ！' }).waitFor();
  assert.equal(submits(db).length, 1);
});

// 練習の最後で「結果を見る」を Enter で押し、そのまま押しっぱなしにしても「もう一回」は押されない
t('held_enter_on_result', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 4; i++) { await answerCorrect(page); await page.click('#next'); }
  await answerCorrect(page);
  assert.equal(await text(page, '#next'), '結果を見る');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'next');
  await page.keyboard.down('Enter');
  assert.equal(await page.isVisible('#scr-result'), true);
  await settleResult(page);
  await page.keyboard.down('Enter'); // Playwright は2回目を repeat: true で送る
  assert.equal(await page.isVisible('#scr-result'), true);
  await page.keyboard.up('Enter');
  await page.keyboard.press('Enter'); // 押しっぱなしでない Enter は効く
  assert.equal(await page.isVisible('#scr-quiz'), true);
});

// 入力欄の押しっぱなしは止めない
t('typing_in_name_not_blocked', async page => {
  await clearTimeAttack(page);
  await page.focus('#ta-post input');
  await page.keyboard.down('a');
  await page.keyboard.down('a'); // 2回目は repeat
  await page.keyboard.up('a');
  assert.equal(await page.inputValue('#ta-post input'), 'aa');
});
