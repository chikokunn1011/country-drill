// 見やすさ（B8）: 文字を「とても大きい」（settings.fs = 'xl'）にしても、スマホ・PC で横スクロールが出ず、ボタンが画面の外に出ない。
// 縦スクロールは出てよい（ふつうの大きさの「縦スクロールなし」は pc_layout.test.mjs が見る）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, QUIET_BADGES } from './helpers.mjs';
import { SCENES, settleLayout, measureFit } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const VIEWPORTS = [{ width: 360, height: 640 }, { width: 390, height: 844 }, { width: 1366, height: 657 }];
const SCENE_NAMES = ['home', 'setup', 'quiz_f2n', 'quiz_n2f', 'reveal_f2n', 'result', 'settings', 'book_grid', 'rpg_home'];

// 見えているボタン・リンク・入力で、横が画面からはみ出すもの（横にスクロールする入れものの中は、その入れものの中で見るので除く）
const offscreen = page => page.evaluate(() => {
  const out = [];
  const scrollsX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  for (const el of document.querySelectorAll('button, a, input, select')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden], dialog:not([open])') || scrollsX(el)) continue;
    if (r.left < -1 || r.right > innerWidth + 1) out.push(`${el.tagName}#${el.id}.${el.getAttribute('class') ?? ''} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return out;
});

for (const viewport of VIEWPORTS) test(`xl_fits_${viewport.width}x${viewport.height}`, { timeout: 300_000 }, async () => {
  const problems = [];
  for (const scene of SCENE_NAMES) {
    const app = await openApp(browser, { viewport, seed: 1, reducedMotion: 'reduce', storage: { settings: { fs: 'xl' }, badges: QUIET_BADGES } });
    try {
      const { page } = app;
      await SCENES[scene](page);
      await settleLayout(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.fs), 'xl');
      const m = await measureFit(page), key = `${scene}`;
      if (m.hscroll) problems.push(`${key}: 横スクロール`);
      if (m.card && m.card.overflow > 1) problems.push(`${key}: #qcard から ${m.card.overflow}px はみ出し`);
      for (const o of await offscreen(page)) problems.push(`${key}: ${o}`);
      if (app.errors.length) problems.push(`${key}: ${app.errors.map(String).join(' / ')}`);
    } finally { await app.close(); }
  }
  assert.deepEqual(problems, []);
});
