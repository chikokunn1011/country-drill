// 共通フックのイベント（drill:start / drill:answer / drill:result）。drill:result は1ゲームにつき必ず1回だけ。偽の Supabase・スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, settle, settleResult, clearTimeAttack, clearByAnswering, recordEvents, events } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで開き、イベントを積み始めてから fn を実行する。最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await recordEvents(app.page);
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const results = page => events(page, 'drill:result');
const starts = page => events(page, 'drill:start');
const cur = page => page.evaluate(() => G.cur.c.a);
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
// detail に約束のキーが全部ある（キーは増えてもよい）
const hasKeys = (o, keys) => assert.deepEqual(keys.filter(k => !(k in o)), []);
const START_KEYS = ['sid', 'mode', 'kind', 'region', 'n', 'hint'];
const ANSWER_KEYS = ['sid', 'a', 'right', 'first', 'missesBefore', 'missesAfter', 'mode', 'kind', 'region', 'hint', 'streak'];
const RESULT_KEYS = ['sid', 'outcome', 'mode', 'kind', 'region', 'n', 'done', 'firstTry', 'wrongs', 'attempts', 'best', 'timeMs', 'hint', 'missed'];
// 国旗→国名・全世界・5問で始める（opts は pickSetup と同じ）
async function play(page, opts) {
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5, ...opts });
  await page.click('#start');
}

t('practice_clear_once', async page => {
  await play(page, { kind: 'practice' });
  const a = await cur(page);
  await answerWrong(page);
  await page.click('#next');
  await clearByAnswering(page);
  const rs = await results(page), st = await starts(page);
  assert.equal(rs.length, 1);
  hasKeys(rs[0], RESULT_KEYS);
  assert.deepEqual(pick(rs[0], ['outcome', 'mode', 'kind', 'region', 'n', 'done', 'wrongs', 'attempts', 'timeMs', 'hint']),
    { outcome: 'clear', mode: 'f2n', kind: 'practice', region: 'all', n: 5, done: 5, wrongs: 1, attempts: 1, timeMs: null, hint: false });
  assert.deepEqual(rs[0].missed, [a]);
  assert.equal(st.length, 1);
  assert.equal(rs[0].sid, st[0].sid);
  await settleResult(page);
  await page.click('#r-setup');
  await page.click('#brand');
  assert.equal((await results(page)).length, 1);
});

t('challenge_restart_clear_once', async page => {
  await play(page, { kind: 'challenge' });
  await answerCorrect(page);
  await page.click('#next');
  await answerWrong(page);
  assert.equal(await page.innerText('#next'), '最初から →');
  await page.click('#next');
  await clearByAnswering(page);
  const rs = await results(page);
  assert.equal(rs.length, 1);
  assert.deepEqual(pick(rs[0], ['outcome', 'kind', 'attempts']), { outcome: 'clear', kind: 'challenge', attempts: 2 });
  assert.equal((await starts(page)).length, 1); // やり直しでは出ない
});

t('ta_clear_once', async page => {
  await clearTimeAttack(page);
  const rs = await results(page);
  assert.equal(rs.length, 1);
  assert.deepEqual(pick(rs[0], ['outcome', 'kind']), { outcome: 'clear', kind: 'ta' });
  assert.equal(typeof rs[0].timeMs, 'number');
  assert.equal(rs[0].timeMs, await page.evaluate(() => G.timeMs));
  await page.click('#brand');
  await page.click('#home-play');
  assert.equal((await results(page)).length, 1);
});

t('ta_fail_once', async page => {
  await play(page, { kind: 'ta' });
  await answerCorrect(page);
  await answerWrong(page);
  const rs = await results(page), ans = await events(page, 'drill:answer');
  assert.equal(rs.length, 1);
  assert.deepEqual(pick(rs[0], ['outcome', 'done', 'timeMs']), { outcome: 'fail', done: 1, timeMs: null });
  assert.equal(ans.length, 2);
  assert.equal(ans[1].right, false);
  const ev = await events(page), answers = ev.filter(e => e.type === 'drill:answer');
  assert.ok(ev.indexOf(answers[1]) < ev.findIndex(e => e.type === 'drill:result' && e.outcome === 'fail'));
  await page.click('.reveal .btn.ghost'); // 失格画面の［モード選択へ］
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.equal((await results(page)).length, 1);
});

t('ta_fail_retry', async page => {
  await play(page, { kind: 'ta' });
  await answerCorrect(page);
  await answerWrong(page);
  await page.click('#next'); // もう一回
  assert.equal((await starts(page)).length, 2);
  assert.equal((await results(page)).length, 1);
  await page.click('#quit');
  const rs = await results(page), st = await starts(page);
  assert.equal(rs.length, 2);
  assert.equal(rs[1].outcome, 'quit');
  assert.equal(rs[1].sid, st[1].sid);
  assert.notEqual(rs[1].sid, rs[0].sid);
});

t('quit_button_once', async page => {
  await play(page, { kind: 'practice' });
  await answerCorrect(page);
  await page.click('#next');
  await page.click('#quit');
  const rs = await results(page);
  assert.equal(rs.length, 1);
  assert.deepEqual(pick(rs[0], ['outcome', 'done']), { outcome: 'quit', done: 1 });
  await page.click('#brand');
  await page.click('#home-play');
  await page.click('#brand');
  assert.equal((await results(page)).length, 1);
});

t('topbar_leaves_once', async page => {
  for (const [i, btn] of ['#to-book', '#to-settings', '#brand'].entries()) {
    await play(page, { kind: 'practice' });
    await answerCorrect(page);
    await page.click(btn);
    const rs = await results(page), st = await starts(page);
    assert.equal(rs.length, i + 1, btn);
    assert.equal(rs[i].outcome, 'quit', btn);
    assert.equal(rs[i].sid, st[i].sid, btn);
  }
  assert.equal(new Set((await results(page)).map(r => r.sid)).size, 3);
});

t('ranking_new_game', async page => {
  await play(page, { kind: 'ta' });
  await answerCorrect(page);
  await page.click('#brand');
  await page.click('#home-rank');
  assert.equal(await page.innerText('#rk-play'), 'この条件で遊ぶ');
  await page.click('#rk-play');
  assert.equal(await page.isVisible('#scr-setup'), true); // モード選択を通る
  await page.click('#start');
  for (let i = 0; i < 5; i++) await answerCorrect(page);
  await page.locator('#scr-result').waitFor();
  const rs = await results(page), st = await starts(page);
  assert.equal(st.length, 2);
  assert.deepEqual(rs.map(r => [r.outcome, r.sid]), [['quit', st[0].sid], ['clear', st[1].sid]]);
  assert.deepEqual(pick(rs[1], ['kind', 'n']), { kind: 'ta', n: 5 });
});

t('start_game_while_playing', async page => {
  await play(page, { kind: 'practice' });
  await answerCorrect(page);
  await page.evaluate(() => startGame());
  const rs = await results(page), st = await starts(page);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].outcome, 'quit');
  assert.equal(rs[0].sid, st[0].sid);
  assert.equal(st.length, 2);
});

t('r_again_after_clear', async page => {
  await clearTimeAttack(page);
  await page.click('#r-again');
  assert.equal((await results(page)).length, 1);
  assert.equal((await starts(page)).length, 2);
});

t('dblclick_last_next_once', async page => {
  await play(page, { kind: 'practice' });
  for (let i = 0; i < 4; i++) { await answerCorrect(page); await page.click('#next'); }
  await answerCorrect(page);
  assert.equal(await page.innerText('#next'), '結果を見る');
  await page.dblclick('#next');
  assert.equal((await results(page)).length, 1);
  assert.equal((await starts(page)).length, 1);
  assert.equal(await page.isVisible('#scr-result'), true);
});

// drill:result のリスナーが遅くても、結果のボタンを押せない時間（TA_GUARD_MS）は結果画面を出した後から数える
t('result_guard_slow_listener', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', () => { const t0 = performance.now(); while (performance.now() - t0 < 300); }));
  await play(page, { kind: 'ta' });
  for (let i = 0; i < 4; i++) await answerCorrect(page);
  await settle(page);
  await page.evaluate(() => {
    document.querySelector(`.choice[data-a="${G.cur.c.a}"]`).click();
    $('r-again').click();
  });
  assert.equal((await starts(page)).length, 1);
  assert.equal((await results(page)).length, 1);
  assert.equal(await page.isVisible('#scr-result'), true);
});

t('answer_every_time', async page => {
  await play(page, { kind: 'practice' });
  const streaks = []; // 答えた直後の G.streak
  const ans = async fn => { await fn(page); streaks.push(await page.evaluate(() => G.streak)); };
  await ans(answerCorrect); await page.click('#next');
  const a2 = await cur(page);
  await ans(answerWrong); await page.click('#next');
  const a3 = await cur(page);
  await page.evaluate(() => { misses[G.cur.c.a] = 2; });
  await ans(answerCorrect); await page.click('#next');
  await ans(answerCorrect); await page.click('#next');
  await ans(answerCorrect); await page.click('#next');
  assert.equal(await cur(page), a2); // まちがえた国が後半にもう一度
  await ans(answerCorrect); await page.click('#next');
  assert.equal(await page.isVisible('#scr-result'), true);
  const ev = await events(page, 'drill:answer'), [st] = await starts(page);
  const K = ['a', 'right', 'first', 'missesBefore', 'missesAfter'];
  assert.equal(ev.length, streaks.length);
  assert.deepEqual(ev.map(e => e.streak), streaks);
  for (const e of ev) {
    hasKeys(e, ANSWER_KEYS);
    assert.deepEqual(pick(e, ['sid', 'mode', 'kind', 'region', 'hint']), { sid: st.sid, mode: 'f2n', kind: 'practice', region: 'all', hint: false });
  }
  assert.deepEqual(pick(ev[0], K.slice(1)), { right: true, first: true, missesBefore: 0, missesAfter: 0 });
  assert.deepEqual(pick(ev[1], K), { a: a2, right: false, first: true, missesBefore: 0, missesAfter: 1 });
  assert.deepEqual(pick(ev[2], K), { a: a3, right: true, first: true, missesBefore: 2, missesAfter: 1 });
  assert.deepEqual(pick(ev[5], K), { a: a2, right: true, first: false, missesBefore: 1, missesAfter: 0 });
});

t('answer_in_ta', async page => {
  await clearTimeAttack(page);
  const ans = await events(page, 'drill:answer'), [st] = await starts(page), ev = await events(page);
  assert.equal(ans.length, 5);
  for (const e of ans) assert.deepEqual(pick(e, ['right', 'kind', 'hint', 'sid']), { right: true, kind: 'ta', hint: false, sid: st.sid });
  const last = ev.findLastIndex(e => e.type === 'drill:answer');
  assert.ok(last >= 0 && last < ev.findIndex(e => e.type === 'drill:result'));
});

t('start_detail', async page => {
  await pickSetup(page, { mode: 'm2f', kind: 'practice', region: 'ヨーロッパ', count: 5 });
  await page.check('#nameopt');
  await page.click('#start');
  const [st] = await starts(page);
  hasKeys(st, START_KEYS);
  assert.deepEqual(pick(st, START_KEYS.slice(1)), { mode: 'm2f', kind: 'practice', region: 'ヨーロッパ', n: 5, hint: true });
  assert.equal(typeof st.sid, 'string');
  assert.ok(st.sid.length > 0);
  await page.click('#quit');
  await pickSetup(page, { kind: 'ta' });
  await page.click('#start');
  const st2 = (await starts(page))[1];
  assert.deepEqual(pick(st2, START_KEYS.slice(1)), { mode: 'm2f', kind: 'ta', region: 'ヨーロッパ', n: 5, hint: false });
});

// イベントのリスナーが例外を投げても、クイズは止まらない（dispatchEvent を呼んだ側には伝わらない）
test('listener_throws_quiz_continues', { timeout: 30_000 }, async () => {
  const app = await openApp(browser), { page, errors } = app;
  const TYPES = ['drill:start', 'drill:answer', 'drill:result'];
  try {
    await recordEvents(page);
    await page.evaluate(types => { for (const type of types) document.addEventListener(type, () => { throw new Error('boom'); }); }, TYPES);
    await play(page, { kind: 'practice' });
    await clearByAnswering(page);
    assert.equal(await page.isVisible('#scr-result'), true);
    await clearTimeAttack(page);
    assert.equal(await page.isVisible('#scr-result'), true);
    const rs = await results(page);
    assert.deepEqual(rs.map(r => [r.outcome, r.kind]), [['clear', 'practice'], ['clear', 'ta']]);
    assert.notEqual(rs[0].sid, rs[1].sid);
    const n = (await events(page)).filter(e => TYPES.includes(e.type)).length;
    assert.equal(n, 14); // 1ゲーム5問で start 1 + answer 5 + result 1、それが2ゲーム
    // ページの例外は少し遅れて届くことがあるので、そろうまで（最大2秒）待つ
    for (let i = 0; i < 100 && errors.length < n; i++) await new Promise(ok => setTimeout(ok, 20));
    assert.equal(errors.length, n);
    assert.ok(errors.every(e => /boom/.test(String(e))), errors.map(String).join('\n'));
  } finally { await app.close(); }
});

// タイムアタックのタイムは押した瞬間で決まる。drill:answer のリスナーにかかった時間は入らない
t('ta_time_excludes_listener', async page => {
  await page.evaluate(() => document.addEventListener('drill:answer', () => {
    window.__t = performance.now(); // リスナーが呼ばれた時刻。ここから 300ms 止まる
    const t0 = performance.now(); while (performance.now() - t0 < 300);
  }));
  await clearTimeAttack(page);
  const r = await page.evaluate(() => ({ timeMs: G.timeMs, limit: window.__t - G.t0 }));
  assert.ok(r.timeMs <= r.limit, JSON.stringify(r));
});
