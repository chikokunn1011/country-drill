// 共通フックのイベント（drill:start / drill:answer / drill:result / drill:screen / drill:book-open / drill:misses-reset）と画面の登録・トースト・差し込み口（#r-ext・#topbar-extra）。drill:result は1ゲームにつき必ず1回だけ。偽の Supabase・スマホ幅（差し込み口は PC 幅も）で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, settle, settleResult, clearTimeAttack, clearByAnswering, recordEvents, events, PHONE, PC } from './helpers.mjs';
import { RPG_FILES } from './rpg_helpers.mjs';

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

const lastScreen = async page => (await events(page, 'drill:screen')).at(-1)?.name;

t('screen_event', async page => {
  await page.click('#home-play');
  assert.equal(await lastScreen(page), 'setup');
  await page.click('#start');
  assert.equal(await lastScreen(page), 'quiz');
});

t('register_screen', async page => {
  await page.evaluate(() => {
    document.querySelector('.wrap').insertAdjacentHTML('beforeend', '<section id="scr-test" class="wrap" hidden><p>テスト</p></section>');
    registerScreen('test', () => window.__r = (window.__r || 0) + 1);
    show('test');
  });
  assert.equal(await page.isVisible('#scr-test'), true);
  assert.equal(await page.isHidden('#scr-home'), true);
  assert.equal(await page.evaluate(() => window.__r), 1);
  assert.equal(await lastScreen(page), 'test');
  // 2回登録しても SCREENS に1つだけ
  assert.equal(await page.evaluate(() => { registerScreen('test'); return SCREENS.filter(s => s === 'test').length; }), 1);
  await page.evaluate(() => show('home'));
  assert.equal(await page.isHidden('#scr-test'), true);
  assert.equal(await page.evaluate(() => { try { registerScreen('nope'); } catch (e) { return e.message; } }), 'no section scr-nope');
});

t('toast_basic', async page => {
  // 200ms で消えるので、出した直後に1回の evaluate でまとめて調べる
  const r = await page.evaluate(() => {
    toast('<b>hi</b>', 200); toast('<b>hi</b>', 200);
    return { boxes: document.querySelectorAll('#toasts').length, live: $('toasts').getAttribute('aria-live'),
      toasts: document.querySelectorAll('#toasts > .toast').length, bold: document.querySelectorAll('#toasts > .toast > b').length };
  });
  assert.deepEqual(r, { boxes: 1, live: 'polite', toasts: 2, bold: 2 });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#toasts .toast').count(), 0);
});

t('book_open_events', async page => {
  const opened = async () => (await events(page, 'drill:book-open')).map(e => e.a);
  await page.click('#home-book');
  await page.click('#grid .card[data-a="jp"]');
  await page.waitForSelector('#detail[open]');
  assert.deepEqual(await opened(), ['jp']);
  await page.evaluate(() => $('detail').close());
  await page.click('#bview [data-v="map"]');
  await page.waitForSelector('#bmapbox svg path');
  await page.locator('#bmapbox path[data-a="br"]').first().dispatchEvent('click');
  assert.deepEqual(await opened(), ['jp', 'br']);
  // 検索で1件にしぼったときの自動選択では出さない
  await page.fill('#q', 'ブラジル');
  await page.waitForFunction(() => $('bcount').textContent === '1か国');
  assert.equal(await page.evaluate(() => bsel), 'br');
  assert.deepEqual(await opened(), ['jp', 'br']);
});

t('misses_reset_event', async page => {
  await play(page, { kind: 'practice' });
  await answerWrong(page);
  await page.click('#to-settings');
  await page.click('#set-reset');
  assert.equal((await events(page, 'drill:misses-reset')).length, 1);
  assert.deepEqual(await page.evaluate(() => misses), {});
  assert.equal(await page.isHidden('#set-reset'), true);
});

// イベントのリスナーが例外を投げても、クイズも画面の切りかえも止まらない（dispatchEvent を呼んだ側には伝わらない）
test('listener_throws_quiz_continues', { timeout: 30_000 }, async () => {
  const app = await openApp(browser), { page, errors } = app;
  const TYPES = ['drill:start', 'drill:answer', 'drill:result', 'drill:screen', 'drill:book-open', 'drill:misses-reset'];
  const QUIZ = TYPES.slice(0, 3);
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
    assert.equal((await events(page)).filter(e => QUIZ.includes(e.type)).length, 14); // 1ゲーム5問で start 1 + answer 5 + result 1、それが2ゲーム
    // 図鑑で詳細を開く
    await page.click('#to-book');
    await page.click('#grid .card[data-a="jp"]');
    await page.waitForSelector('#detail[open]');
    await page.click('#dclose');
    // まちがえた記録が無いと「記録を消す」が出ないので、イベントを出さずに1つ入れておく
    await page.evaluate(() => { misses.jp = 1; store.set('misses', misses); });
    await page.click('#to-settings');
    await page.click('#set-reset');
    assert.equal(await page.isVisible('#scr-settings'), true);
    assert.equal(await page.isHidden('#set-reset'), true); // リスナーの後の renderSettings も動いた
    const ev = await events(page), n = ev.length;
    assert.deepEqual(TYPES.filter(type => !ev.some(e => e.type === type)), []); // 6種類とも出た
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

// 結果画面の差し込み口 #r-ext は #r-side の最後の子。空なら見えない
t('r_ext_slot', async page => {
  await play(page, { kind: 'practice' });
  await clearByAnswering(page);
  assert.deepEqual(await page.evaluate(() => {
    const x = $('r-ext');
    return { parent: x.parentElement.id, last: x === $('r-side').lastChild, nodes: x.childNodes.length, display: getComputedStyle(x).display };
  }), { parent: 'r-side', last: true, nodes: 0, display: 'none' });
}, { blockScripts: RPG_FILES });

// drill:result（clear）のリスナーが走るときには #r-ext がもうあり、入れた中身が結果画面に出る
t('r_ext_ready_on_clear', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', e => { if (e.detail.outcome === 'clear') $('r-ext').textContent = 'EXT'; }));
  await play(page, { kind: 'practice' });
  await clearByAnswering(page);
  assert.equal(await page.isVisible('#r-ext'), true);
  assert.equal(await page.innerText('#r-ext'), 'EXT');
});

// PC の結果画面: 右列が空の #r-ext だけなら1列のまま。まちがえた国や #r-ext の中身があれば2列
t('r_ext_layout_pc', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', e => { if (window.__ext && e.detail.outcome === 'clear') $('r-ext').textContent = 'EXT'; }));
  const layout = () => page.evaluate(() => ({ card: getComputedStyle($('rcard')).display, side: getComputedStyle($('r-side')).display }));
  await play(page, { kind: 'practice' });
  await clearByAnswering(page);
  const one = await layout();
  assert.notEqual(one.card, 'grid');
  assert.equal(one.side, 'none');
  await play(page, { kind: 'practice' });
  await answerWrong(page);
  await page.click('#next');
  await clearByAnswering(page);
  assert.equal((await layout()).card, 'grid');
  await page.evaluate(() => { window.__ext = true; });
  await play(page, { kind: 'practice' });
  await clearByAnswering(page);
  assert.equal(await page.innerText('#r-ext'), 'EXT');
  assert.equal(await page.evaluate(() => G.wrongs), 0); // ノーミスでも
  assert.equal((await layout()).card, 'grid');
}, { viewport: PC, blockScripts: RPG_FILES });

// トップバーの差し込み口 #topbar-extra は #brand の次。空なら見えず、ほかのボタンの位置もトップバーの高さも変えない
t('topbar_extra', async page => {
  assert.deepEqual(await page.evaluate(() => {
    const x = $('topbar-extra');
    return { second: x === $('topbar').children[1], nodes: x.childNodes.length, display: getComputedStyle(x).display };
  }), { second: true, nodes: 0, display: 'none' });
  await page.evaluate(() => show('setup')); // ホームではトップバーが隠れている
  for (const vp of [PHONE, PC]) {
    await page.setViewportSize(vp);
    const r = await page.evaluate(() => {
      const ids = ['brand', 'to-book', 'to-settings'], x = $('topbar-extra');
      const measure = () => ({ topbar: $('topbar').getBoundingClientRect().height,
        ...Object.fromEntries(ids.map(id => { const { x, y, width, height } = $(id).getBoundingClientRect(); return [id, { x, y, width, height }]; })) });
      const display = getComputedStyle(x).display, before = measure();
      x.remove();
      const after = measure();
      $('brand').after(x); // 元に戻す
      return { display, before, after, zero: ids.filter(id => !before[id].width) };
    });
    const at = `${vp.width}×${vp.height}`;
    assert.equal(r.display, 'none', at);
    assert.deepEqual(r.zero, [], at);
    assert.deepEqual(r.after, r.before, at);
  }
}, { blockScripts: RPG_FILES });
