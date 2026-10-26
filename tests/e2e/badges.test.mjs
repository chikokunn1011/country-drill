// バッジと称号（badges.js のブラウザの部分）。クイズのイベントから記録を取り、ゲームが終わってから判定して保存する。偽の Supabase・スマホ幅で確認する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, clearTimeAttack, clearByAnswering } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 毎回まっさらなブラウザで ?bdgdebug=1 を付けて開き、最後にページで例外が出ていないかも見る。opts は openApp にそのまま渡す
const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// メモリの記録（表示用）と、localStorage に書いてある記録
const dump = page => page.evaluate(() => BADGES.debug.dump());
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('badges')));
// 練習（国旗→国名・全世界・5問）を結果画面まで解く。opts は pickSetup と同じ
async function playPractice(page, opts = {}) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5, ...opts });
  await page.click('#start');
  await clearByAnswering(page);
}
// 横スクロールが出ていない（以後のタスクで使う）
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
// ページで document にイベントを出す（detail は JSON にできる値）
const emitIn = (page, type, detail) => page.evaluate(([type, detail]) => { document.dispatchEvent(new CustomEvent(type, { detail })); }, [type, detail]);
// 練習（国旗→国名・全世界・5問）を始めて、問題が出るまで待つ
async function startPractice(page) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
}

t('loads_and_counts', async page => {
  assert.deepEqual(await page.evaluate(() => ({
    title: typeof BADGES.title, count: BADGES.count(), text: BADGES.title(), key: BADGES.titleKey(),
    css: !!document.querySelector('link[href="badges.css?v=1"]'), js: !!document.querySelector('script[src="badges.js?v=1"]'),
  })), { title: 'function', count: { got: 0, total: 26, byColor: { 1: 0, 2: 0, 3: 0, 4: 0 } }, text: '', key: null, css: true, js: true });
});

// 新しい版で増えたバッジのセーブ: 称号の文字は出さず、キーは残す。自動でつけかえない
t('title_unknown_key', async page => {
  assert.deepEqual(await page.evaluate(() => [BADGES.title(), BADGES.titleKey(), BADGES.count().got]), ['', 'future-badge@1', 0]);
  await playPractice(page);
  const d = await saved(page);
  assert.equal(d.eq, 'future-badge@1');
  assert.equal(d.got['future-badge@1'], 1);
}, { storage: { badges: { v: 1, eq: 'future-badge@1', got: { 'future-badge@1': 1 } } } });

t('practice_clear_recorded', async page => {
  await playPractice(page);
  const d = await dump(page), set = await page.evaluate(() => G.set.map(c => c.a));
  assert.deepEqual([d.s.right, d.s.clears, d.s.days], [5, 1, 1]);
  assert.equal(set.length, 5);
  assert.deepEqual(set.filter(a => !(d.s.m[a] & 1)), []);
  assert.equal(typeof d.got['first-clear@1'], 'number');
  assert.equal(d.eq, 'first-clear@1');
  assert.equal((await saved(page)).s.right, 5);
});

// はじめてのバッジの称号を自動でつけたら badge:title を1回出す（ゲームの結果のときも、起動時の判定のときも）
t('auto_equip_emits_title', async (page, app) => {
  await page.evaluate(() => document.addEventListener('badge:title', e => (window.__bt ||= []).push(e.detail)));
  await playPractice(page);
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'first-clear@1', title: 'ドリルの新人' }]);
  await app.context.addInitScript(() => document.addEventListener('badge:title', e => (window.__bt ||= []).push(e.detail)));
  await page.evaluate(() => localStorage.setItem('badges', JSON.stringify({ v: 1, s: { right: 150 } })));
  await page.reload();
  assert.deepEqual(await page.evaluate(() => window.__bt), [{ key: 'answers@1', title: 'こつこつ派' }]);
});

// クイズの途中は localStorage に書かない。やめたら、そこまでの1問ごとの記録だけ書く
t('no_write_during_quiz', async page => {
  const before = await page.evaluate(() => localStorage.getItem('badges'));
  assert.ok(before, '起動時の判定で書いてあるはず');
  await startPractice(page);
  for (let i = 0; i < 2; i++) { await answerCorrect(page); await page.click('#next'); }
  assert.equal(await page.evaluate(() => localStorage.getItem('badges')), before);
  await page.click('#quit');
  const { s } = await saved(page);
  assert.deepEqual([s.right, s.clears, s.days], [2, 0, 0]);
});

t('duplicate_result_ignored', async page => {
  await page.evaluate(() => document.addEventListener('drill:result', e => { window.__last = e.detail; }));
  await playPractice(page);
  const last = await page.evaluate(() => window.__last);
  await emitIn(page, 'drill:result', last);
  await emitIn(page, 'drill:result', last);
  assert.equal((await dump(page)).s.clears, 1);
});

// 閉じるときは保存だけして判定しない。判定は次の起動で
t('pagehide_saves_without_judging', async page => {
  await page.evaluate(() => BADGES.debug.set('right', 99));
  await startPractice(page);
  await answerCorrect(page);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  const d = await saved(page);
  assert.equal(d.s.right, 100);
  assert.equal(d.got['answers@1'], undefined);
  await page.reload();
  assert.equal(typeof (await dump(page)).got['answers@1'], 'number');
});

// タイムアタックの計測中に重い処理をしない: drill:answer の badges.js のリスナーは1回 0.2ms 未満
t('ta_listener_fast', async page => {
  // window の capture は document のリスナーより先、あとから document に付けたリスナーは badges.js のリスナーの後ろ
  await page.evaluate(() => {
    window.addEventListener('drill:answer', () => { window.__t0 = performance.now(); }, true);
    document.addEventListener('drill:answer', e => { (window.__dt ||= []).push(performance.now() - window.__t0); window.__ad = e.detail; });
  });
  await clearTimeAttack(page, { count: 10 });
  const dt = await page.evaluate(() => window.__dt);
  assert.equal(dt.length, 10);
  const sorted = [...dt].sort((p, q) => p - q), median = (sorted[4] + sorted[5]) / 2;
  assert.ok(median < 0.2, `中央値 ${median}ms: ${dt.join(' ')}`);
  const each = await page.evaluate(() => {
    const detail = window.__ad, t0 = performance.now();
    for (let i = 0; i < 1000; i++) document.dispatchEvent(new CustomEvent('drill:answer', { detail }));
    return (performance.now() - t0) / 1000;
  });
  assert.ok(each < 0.2, `1回 ${each}ms`);
});

// localStorage が例外を投げても、クイズは動き、バッジはメモリの中で数える
test('storage_unavailable', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url + '?bdgdebug=1' });
  try {
    await app.context.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('blocked'); };
      Storage.prototype.setItem = () => { throw new Error('blocked'); };
    });
    await app.page.reload();
    await playPractice(app.page);
    assert.equal(await app.page.isVisible('#scr-result'), true);
    assert.equal(await app.page.evaluate(() => BADGES.count().got), 1);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

// 2つのタブで遊んでも、片方の記録を消さずに足していく
t('two_tabs', async (page, app) => {
  const page2 = await app.context.newPage(), errors2 = [];
  page2.on('pageerror', e => errors2.push(e));
  await page2.goto(server.url + '?bdgdebug=1');
  await playPractice(page);
  await playPractice(page2);
  const d = await saved(page);
  assert.deepEqual([d.s.right, d.s.clears], [10, 2]);
  assert.equal(typeof d.got['first-clear@1'], 'number');
  assert.deepEqual(errors2.map(String), []);
});

// index.html のグローバルが足りなければ、console.error を1回出して何も作らない。クイズはそのまま動く
test('missing_global_is_safe', { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { url: server.url });
  const { page } = app, logs = [];
  try {
    page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await page.route(u => new URL(u).pathname === '/', async r => {
      const res = await r.fetch();
      await r.fulfill({ response: res, body: (await res.text()).replace('function toast(', 'function toastX(') });
    });
    await page.reload();
    const ours = () => logs.filter(m => m.includes('[badges]'));
    for (let i = 0; i < 100 && !ours().length; i++) await new Promise(ok => setTimeout(ok, 20));   // console はページから少し遅れて届く
    assert.equal(ours().length, 1, logs.join('\n'));
    assert.match(ours()[0], /toast/);
    assert.deepEqual(await page.evaluate(() => [typeof window.BADGES, typeof BADGES_CORE]), ['undefined', 'object']);
    await playPractice(page);
    assert.equal(await page.isVisible('#scr-result'), true);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
