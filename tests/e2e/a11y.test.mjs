// 見やすさの設定（B8）。文字の大きさ settings.fs（'m' 既定 / 'l' / 'xl'）は <html data-fs>、
// 色の見分けやすさ settings.cvd は <html data-cvd>。どちらも head の先読みで最初から付く
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerWrong, answerTap } from './helpers.mjs';

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
const attrs = page => page.evaluate(() => ({ fs: document.documentElement.dataset.fs ?? null, cvd: document.documentElement.hasAttribute('data-cvd') }));
const rootPx = page => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
// 先読み（head のスクリプト）の直後、body ができる前の属性
const atHead = () => { window.__headAttrs = null; new MutationObserver((_, o) => { if (document.body && !window.__headAttrs) { window.__headAttrs = { fs: document.documentElement.dataset.fs ?? null, cvd: document.documentElement.hasAttribute('data-cvd') }; o.disconnect(); } }).observe(document, { childList: true, subtree: true }); };

/* ---------- Task 1: 設定の保存と html の属性 ---------- */
t('default_has_no_attrs', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
  assert.equal(await rootPx(page), '16px');
});

t('saved_fs_and_cvd_apply_from_head', async page => {
  assert.deepEqual(await page.evaluate(() => window.__headAttrs), { fs: 'l', cvd: true });
  assert.deepEqual(await attrs(page), { fs: 'l', cvd: true });
}, { storage: { settings: { fs: 'l', cvd: true } }, init: atHead });

t('saved_xl_applies', async page => {
  assert.deepEqual(await attrs(page), { fs: 'xl', cvd: false });
}, { storage: { settings: { fs: 'xl' } } });

t('bad_values_are_ignored', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
  assert.equal(await rootPx(page), '16px');
}, { storage: { settings: { fs: 'huge', cvd: 'yes' } } });

t('m_has_no_attr', async page => {
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
}, { storage: { settings: { fs: 'm', cvd: false } } });

/* ---------- Task 2: 設定画面の UI ---------- */
const fsPressed = page => page.$$eval('#set-fs .chip', bs => bs.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent));
const bodyPx = page => page.evaluate(() => getComputedStyle(document.body).fontSize);

t('settings_fs_chips_change_size_and_persist', async page => {
  await page.click('#home-settings');
  assert.deepEqual(await page.$$eval('#set-fs .chip', bs => bs.map(b => b.textContent)), ['ふつう', '大きめ', 'とても大きい']);
  assert.deepEqual(await fsPressed(page), ['ふつう']);
  assert.equal(await bodyPx(page), '15px');
  await page.click('#set-fs [data-fs="l"]');
  assert.equal(await rootPx(page), '18px');
  assert.equal(await bodyPx(page), '16.875px');   // 本文（ふつうは 15px）も同じ割合で大きくなる
  assert.deepEqual(await fsPressed(page), ['大きめ']);
  await page.click('#set-fs [data-fs="xl"]');
  assert.equal(await rootPx(page), '20px');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).fs), 'xl');
  await page.reload();
  assert.equal(await rootPx(page), '20px');
  await page.click('#home-settings');
  assert.deepEqual(await fsPressed(page), ['とても大きい']);
  await page.click('#set-fs [data-fs="m"]');
  assert.equal(await rootPx(page), '16px');
  assert.deepEqual(await attrs(page), { fs: null, cvd: false });
});

t('settings_cvd_checkbox_toggles_and_persists', async page => {
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-cvd'), false);
  assert.match(await page.textContent('#scr-settings'), /正解は青、まちがいはオレンジになります/);
  await page.check('#set-cvd');
  assert.deepEqual(await attrs(page), { fs: null, cvd: true });
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).cvd), true);
  await page.reload();
  assert.equal((await attrs(page)).cvd, true);
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-cvd'), true);
  await page.uncheck('#set-cvd');
  assert.equal((await attrs(page)).cvd, false);
});

// 見やすさの欄は「画面の色」のすぐ下
t('a11y_field_after_theme', async page => {
  await page.click('#home-settings');
  const order = await page.$$eval('#scr-settings .field > .lbl', ls => ls.map(l => l.textContent));
  assert.equal(order[order.indexOf('画面の色') + 1], '見やすさ');
});

// PC（pc.css が html の文字を画面の幅で少し大きくする）でも、大きめ・とても大きいはその 1.125 倍・1.25 倍
for (const [fs, k] of [['l', 1.125], ['xl', 1.25]]) t(`pc_fs_${fs}_scales_pc_root`, async page => {
  const base = Math.min(Math.max(16, 16 * 0.8 + 1366 * 0.0025), 18);   // pc.css の clamp(100%, 80% + .25vw, 112.5%)
  const px = parseFloat(await rootPx(page));
  assert.ok(Math.abs(px - base * k) < 0.1, `${px} != ${base * k}`);
}, { viewport: { width: 1366, height: 657 }, storage: { settings: { fs } } });

/* ---------- Task 3: 色と印 ---------- */
// 色の移り変わり（.choice の transition）で途中の色を測らないよう、このあとのテストは reducedMotion: 'reduce' で開く
// 練習・全世界・5問で始めて、1問まちがえる（正解の選択肢が .ok、押したのが .ng になる）
const wrongOnce = async (page, mode = 'f2n') => {
  await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
  await answerWrong(page);
  await page.waitForSelector('#next');
};
const looks = page => page.evaluate(() => {
  const one = sel => { const el = document.querySelector(sel), a = getComputedStyle(el, '::after');
    return { border: getComputedStyle(el).borderTopColor, mark: a.content, markBg: a.backgroundColor }; };
  return { ok: one('#qcard .choice.ok'), ng: one('#qcard .choice.ng'), verdict: getComputedStyle(document.querySelector('.verdict')).color };
});
const BLUE = 'rgb(0, 114, 178)', ORANGE = 'rgb(213, 94, 0)', SKY = 'rgb(86, 180, 233)', AMBER = 'rgb(230, 159, 0)';
const GREEN = 'rgb(46, 139, 87)', RED = 'rgb(196, 61, 61)';
const hasMark = (m, ch) => m.includes(ch);

// 設定に関係なく、正解に ✓・まちがいに ✗ の印。色はいまのまま
t('marks_always_and_default_colors', async page => {
  await wrongOnce(page);
  const l = await looks(page);
  assert.equal(l.ok.border, GREEN); assert.equal(l.ng.border, RED);
  assert.ok(hasMark(l.ok.mark, '✓'), l.ok.mark); assert.ok(hasMark(l.ng.mark, '✗'), l.ng.mark);
}, { reducedMotion: 'reduce' });

t('cvd_light_blue_orange', async page => {
  await wrongOnce(page);
  const l = await looks(page);
  assert.deepEqual([l.ok.border, l.ng.border, l.ok.markBg, l.ng.markBg], [BLUE, ORANGE, BLUE, ORANGE]);
  assert.equal(l.verdict, ORANGE);   // まちがえたので「ざんねん」の文字もオレンジ
}, { storage: { settings: { cvd: true } }, reducedMotion: 'reduce' });

// ドパガキ ON でも色の見分けやすさが勝つ（ライト・ダーク・端末に合わせるのダーク）
t('cvd_beats_dopa_light', async page => {
  await wrongOnce(page);
  const l = await looks(page);
  assert.deepEqual([l.ok.border, l.ng.border], [BLUE, ORANGE]);
}, { storage: { settings: { cvd: true, dopa: true, sound: false } }, reducedMotion: 'reduce' });

t('cvd_dark_theme', async page => {
  await wrongOnce(page);
  const l = await looks(page);
  assert.deepEqual([l.ok.border, l.ng.border], [SKY, AMBER]);
}, { storage: { settings: { cvd: true, dopa: true, sound: false, theme: 'dark' } }, reducedMotion: 'reduce' });

t('cvd_auto_on_dark_device', async page => {
  await wrongOnce(page);
  const l = await looks(page);
  assert.deepEqual([l.ok.border, l.ng.border], [SKY, AMBER]);
}, { colorScheme: 'dark', storage: { settings: { cvd: true, dopa: true, sound: false, theme: 'auto' } }, reducedMotion: 'reduce' });

// 国旗の選択肢でも印は国旗の絵に重ならない
t('flag_choice_mark_does_not_cover_flag', async page => {
  await wrongOnce(page, 'n2f');
  const r = await page.evaluate(() => [...document.querySelectorAll('#qcard .choice.ok, #qcard .choice.ng')].map(el => {
    const img = el.querySelector('img').getBoundingClientRect(), b = el.getBoundingClientRect(), a = getComputedStyle(el, '::after');
    const h = parseFloat(a.height), top = b.top + parseFloat(a.top);
    return { markBottom: top + h, imgTop: img.top };
  }));
  assert.equal(r.length, 2);
  for (const x of r) assert.ok(x.markBottom <= x.imgTop + 0.5, JSON.stringify(x));
}, { reducedMotion: 'reduce' });

// 白地図タップの外れの線（.tapline）も変数経由でオレンジになる
t('cvd_tapmap_line_is_orange', async page => {
  await pickSetup(page, { mode: 'tap', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .tapmap');
  await answerTap(page, { right: false });
  await page.locator('#qcard .verdict.ng').waitFor();
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#qcard .tapmap .tapline')).stroke), ORANGE);
}, { storage: { settings: { cvd: true } }, reducedMotion: 'reduce' });
