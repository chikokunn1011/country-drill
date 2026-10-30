// D2 アプリ化: service worker（sw.js）。どれも serviceWorkers: 'allow' で本物の SW を動かす
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openApp, pickSetup, answerCorrect } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 90_000 }, async () => {
  const app = await openApp(browser, { serviceWorkers: 'allow', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// SW が入って（precache が済んで）、このページを受けもつまで待つ
const swReady = page => page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  .then(() => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 }));

// オフラインで再読み込みしても、ホーム → 全世界・国旗→国名・5問を最後まで遊べる
t('offline_play', async (page, { context }) => {
  await swReady(page);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 5; i++) {
    await answerCorrect(page);
    // 国旗もキャッシュから出ている
    assert.ok(await page.evaluate(() => (l => l.length > 0 && l.every(i => i.complete && i.naturalWidth > 0))([...document.querySelectorAll('#qcard img')])));
    if (await page.isVisible('#next')) await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
  assert.equal(await page.evaluate(() => G.set.length), 5);
}, { seed: 1 });

// ?v= の無いファイル（countries.js）はネット優先: 書きかえたら次に開いたとき新しい中身
test('sw_update_unversioned', { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pwa-'));
  cpSync(ROOT, dir, { recursive: true, filter: s => !/[\\/](\.git|node_modules)$/.test(s) });
  const srv = await startServer({ root: dir });
  const app = await openApp(browser, { serviceWorkers: 'allow', url: srv.url });
  try {
    await swReady(app.page);
    assert.equal(await app.page.evaluate(() => window.COUNTRIES.__mark), undefined);
    const p = join(dir, 'countries.js');
    writeFileSync(p, `${readFileSync(p, 'utf8')}\nwindow.COUNTRIES.__mark = 'new';\n`);
    await app.page.reload();
    assert.equal(await app.page.evaluate(() => window.COUNTRIES.__mark), 'new');
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); await srv.close(); rmSync(dir, { recursive: true, force: true }); }
});

// SW が動いていても、外のサイト（偽 Supabase）への問い合わせはそのまま届く
t('sw_ignores_other_origins', async (page, { db }) => {
  await swReady(page);
  await page.reload();
  await page.locator('#scr-home').waitFor();
  const n = db.calls.filter(c => c.name === 'top_scores2').length;
  await page.click('#home-rank');
  await page.waitForFunction(() => !document.getElementById('scr-ranking').hidden);
  for (let i = 0; i < 100 && db.calls.filter(c => c.name === 'top_scores2').length <= n; i++) await new Promise(ok => setTimeout(ok, 20));
  assert.ok(db.calls.filter(c => c.name === 'top_scores2').length > n);
});
