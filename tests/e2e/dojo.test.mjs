// 似た国旗の道場（dojo.js と index.html の kind: 'dojo'）: 同じグループの国だけの選択肢・くらべるパネル・drill:dojo だけを出す・道場の画面
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, answerCorrect, answerWrong, recordEvents, events, pickSetup } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// startDojo を直接呼ぶ（drill:dojo を window.__dj に積む）
const go = (page, seq, group, mode = 'f2n') => page.evaluate(([seq, group, mode]) => {
  if (!window.__dj) { window.__dj = []; document.addEventListener('drill:dojo', e => __dj.push(e.detail)); }
  startDojo({ seq, group, mode, sid: 'dj-t' });
}, [seq, group, mode]);
// 道場の画面に戻るまで、正解して［次へ］をくり返す
const clearRound = async page => {
  for (let i = 0; i < 30 && await page.evaluate(() => document.body.dataset.screen === 'quiz'); i++) { await answerCorrect(page); await page.click('#next'); }
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'dojo');
};
const TD = ['td', 'ro', 'ad', 'md'];
const SEQ = ['td', 'ro', 'ad', 'md', 'td', 'ro', 'ad', 'md', 'td', 'ro'];

t('quiz_choices_in_group', async page => {
  await go(page, SEQ, TD);
  for (let i = 0; i < 10; i++) {
    const o = await page.$$eval('#qcard .choice', bs => bs.map(b => b.dataset.a));
    assert.equal(o.length, 4); assert.ok(o.every(a => TD.includes(a)));
    assert.doesNotMatch(await page.innerText('#qcard .qlabel'), /首都|場所/);
    await answerCorrect(page); await page.click('#next');
  }
  await go(page, ['qa', 'bh', 'qa', 'bh', 'qa', 'bh', 'qa', 'bh', 'qa', 'bh'], ['qa', 'bh']);
  assert.equal(await page.locator('#qcard .choice').count(), 2);
});

t('quiz_events_only_dojo', async page => {
  await recordEvents(page); await go(page, SEQ, TD);
  await answerWrong(page); await page.click('#next');
  await clearRound(page);
  for (const k of ['drill:start', 'drill:answer', 'drill:result']) assert.equal((await events(page, k)).length, 0, k);
  const dj = await page.evaluate(() => __dj);
  assert.equal(dj.filter(e => e.phase === 'answer').length, 11);
  assert.deepEqual(dj.at(-1), { sid: 'dj-t', phase: 'end', outcome: 'clear', n: 10, firstTry: 9, wrongs: 1 });
  assert.equal(dj.filter(e => e.phase === 'end').length, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('misses')), null);
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'dojo');
});

t('quiz_wrong_compare', async page => {
  await go(page, SEQ, TD); await answerWrong(page);
  const [a, pick] = await page.evaluate(() => [G.cur.c.a, __dj[0].pick]);
  assert.deepEqual(await page.evaluate(() => __dj[0]), { sid: 'dj-t', phase: 'answer', a, pick, right: false });
  assert.deepEqual(await page.$$eval('.reveal .dj-compare img', is => is.map(i => i.getAttribute('src'))), await page.evaluate(([a, p]) => [flag(a), flag(p)], [a, pick]));
  assert.match(await page.innerText('.reveal .dj-compare'), /えらんだ/);
  assert.equal(await page.locator('.reveal svg').count(), 0); assert.equal(await page.locator('.reveal .facts').count(), 0);
  assert.equal(await page.locator('.reveal .tv[data-k="flag"]').count(), 1);
  assert.equal(await page.innerText('#pnum'), '覚えた 0 / 10'); assert.equal(await page.evaluate(() => G.queue.at(-1).a), 'td');
});

t('quiz_right_compare_rival', async page => {
  await go(page, SEQ, TD); await answerCorrect(page);
  assert.equal(await page.getAttribute('.reveal .dj-compare figure:nth-child(2) img', 'src'), await page.evaluate(() => flag('ro')));
  assert.match(await page.innerText('.reveal .dj-compare'), /にている/);
  assert.equal(await page.locator('.reveal .tv[data-k="flag"]').count(), 1);
}, { storage: { dojo: { v: 1, mode: 'f2n', mix: { 'md-td': 1, 'ro-td': 3 }, clear: {} } } });

t('requeue_no_repeat', async page => {
  await go(page, ['td', 'td', 'ro'], TD); await answerCorrect(page); await page.click('#next');
  assert.equal(await page.evaluate(() => G.cur.c.a), 'ro');
});

t('quit_back', async page => {
  page.on('dialog', () => assert.fail('確認を出さない'));
  await go(page, SEQ, TD);
  assert.equal(await page.innerText('#quit'), 'やめて道場へ'); await page.click('#quit');
  assert.deepEqual((await page.evaluate(() => __dj)).at(-1), { sid: 'dj-t', phase: 'end', outcome: 'quit', n: 10, firstTry: 0, wrongs: 0 });
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'dojo');
});

t('no_name_hint', async page => {
  await go(page, SEQ, TD, 'n2f'); assert.equal(await page.locator('#qcard .cname').count(), 0);
  assert.equal(await page.locator('#qcard .choice.flagc').count(), 4);
}, { storage: { setup: { mode: 'n2f', name: true, kind: 'practice', count: 10 } } });

// ---- 道場の画面・帯（dojo.js の後半） ----
const dojoRec = page => page.evaluate(() => JSON.parse(localStorage.getItem('dojo')));

t('band_opens_dojo', async page => {
  await pickSetup(page, {}); assert.match(await page.innerText('#to-dojo'), /似た国旗の道場/);
  await page.click('#to-dojo'); assert.equal(await page.isVisible('#scr-dojo'), true);
  assert.equal(await page.locator('.dj-card').count(), 25); assert.equal(await page.locator('.dj-card img').count(), 93);
  assert.equal(await page.locator('#dj-pairs').isHidden(), true);
  assert.doesNotMatch(await page.innerText('#scr-dojo'), /首都|場所/);
});

t('mode_switch_saved', async page => {
  await page.evaluate(() => show('dojo')); await page.click('#dj-mode [data-m="n2f"]');
  assert.equal(await page.getAttribute('#dj-mode [data-m="n2f"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#dj-mode [data-m="f2n"]', 'aria-pressed'), 'false');
  assert.equal((await dojoRec(page)).mode, 'n2f');
  await page.click('.dj-card[data-g="no"]'); assert.equal(await page.evaluate(() => G.mode.k), 'n2f');
  assert.deepEqual(await page.evaluate(() => [...new Set(G.set.map(c => c.a))].sort()), ['dk', 'fi', 'is', 'no', 'se']);
});

t('round_mix_and_clear', async page => {
  await page.evaluate(() => show('dojo')); await page.click('.dj-card[data-g="qa"]');
  await answerWrong(page); await page.click('#next');
  await clearRound(page);
  assert.match(await page.innerText('#dj-last'), /ギザギザの白：一発正解 9 \/ 10/);
  assert.doesNotMatch(await page.innerText('#dj-last'), /ノーミス/);
  assert.deepEqual((await dojoRec(page)).mix, { 'bh-qa': 1 });
  assert.equal(await page.locator('#dj-pairs li').count(), 1); assert.match(await page.innerText('#dj-pairs li'), /1回/);
  assert.equal(await page.locator('.dj-card[data-g="qa"] .dj-ok').count(), 0);
  await page.click('.dj-card[data-g="qa"]'); await clearRound(page);   // もう1回ノーミスで
  assert.match(await page.innerText('#dj-last'), /一発正解 10 \/ 10・ノーミス！/);
  assert.equal(await page.locator('.dj-card[data-g="qa"] .dj-ok').count(), 1);
  assert.deepEqual((await dojoRec(page)).clear, { qa: 1 });
});

t('broken_storage', async page => {
  await page.evaluate(() => show('dojo'));
  assert.equal(await page.getAttribute('#dj-mode [data-m="f2n"]', 'aria-pressed'), 'true');
  assert.equal(await page.locator('#dj-pairs li').count(), 1); assert.equal(await page.locator('.dj-ok').count(), 1);
  await page.click('.dj-card[data-g="td"]'); await answerCorrect(page);   // 壊れた値があっても遊べる
}, { storage: { dojo: { v: 1, mode: 'x', mix: { 'ro-td': 'a', 'bh-qa': 2, zz: 3 }, clear: { td: 1, foo: 1, qa: 2 } } } });

t('broken_storage_string', async page => {
  await page.evaluate(() => show('dojo'));
  assert.equal(await page.locator('.dj-card').count(), 25); assert.equal(await page.locator('#dj-pairs').isHidden(), true);
}, { storage: { dojo: 'こわれた' } });

t('dark_theme', async page => {
  await page.evaluate(() => show('dojo'));
  const [bg, surface] = await page.evaluate(() => [getComputedStyle(document.querySelector('.dj-card')).backgroundColor,
    (d => (d.style.background = 'var(--surface)', document.body.append(d), getComputedStyle(d).backgroundColor))(document.createElement('div'))]);
  assert.equal(bg, surface); assert.notEqual(bg, 'rgb(255, 255, 255)');
}, { storage: { settings: { theme: 'dark' } } });

t('phone_width_no_scroll', async page => {
  for (const s of ['setup', 'dojo']) {
    await page.evaluate(s => show(s), s);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), s);
  }
  await page.click('#dj-mode [data-m="n2f"]'); await page.click('.dj-card[data-g="no"]'); await answerWrong(page);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
}, { viewport: { width: 360, height: 740 } });

t('before_map_loads', async page => {
  assert.equal(await page.evaluate(() => mapReady), false);
  await page.evaluate(() => show('dojo'));
  await page.click('.dj-card[data-g="td"]');
  await clearRound(page);
  assert.equal(await page.evaluate(() => mapReady), false);
}, { waitMap: false, routes: [['**/world.js*', () => {}]] });

t('missing_daily_core', async (page, app) => {
  assert.equal(await page.locator('#to-dojo').count(), 0);
  assert.equal(await page.locator('#scr-dojo').count(), 0);
  assert.ok(app.consoleErrors.some(m => /\[dojo\]/.test(m)));
}, { blockScripts: ['daily-core.js'] });

