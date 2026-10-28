// 場所の問題の地図：縮小して地球全体まで引ける・海ばかりの島国は最初から広めに映す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn) => test(name, { timeout: 30_000 }, async () => {
  const app = await openApp(browser);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// 地図の今の表示（拡大率と、地球の外枠が画面のどこに映っているか）
const view = page => page.evaluate(() => {
  const s = document.querySelector('#qcard .mapbox svg.map'), tr = d3.zoomTransform(s);
  const b = s.querySelector('.sphere').getBBox();
  const [x0, y0] = tr.apply([b.x, b.y]), [x1, y1] = tr.apply([b.x + b.width, b.y + b.height]);
  return { k: tr.k, x0, y0, x1, y1, ring: getComputedStyle(s.querySelector('.ring')).display };
});
const W = 640, H = 360; // index.html の出題地図の大きさ
const fits = v => v.x0 >= -1 && v.y0 >= -1 && v.x1 <= W + 1 && v.y1 <= H + 1;
const askMap = async (page, a) => {
  await pickSetup(page, { mode: 'm2f', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  // 出題中の国を差し替えて描き直す
  await page.evaluate(a => { G.cur.c = C.find(c => c.a === a); const old = document.querySelector('#qcard .mapbox'); old.replaceWith(zoomableMap(G.cur.c, 'x', { region: 'all' })); }, a);
};

t('zoom_out_to_whole_world', async page => {
  await askMap(page, 'fr');
  let v = await view(page);
  assert.equal(v.k, 1); assert.equal(fits(v), false);
  assert.equal(v.ring, 'none', '大きい国は最初は丸印なし');
  // − を押し続けると地球全体が収まるところで止まる
  for (let i = 0; i < 12; i++) { await page.click('#qcard .zoomctl button[aria-label="縮小"]'); await page.waitForTimeout(260); }
  v = await view(page);
  assert.ok(v.k < 0.5, `k=${v.k}`); assert.equal(fits(v), true);
  assert.equal(v.ring, 'inline', '縮小したら大きい国にも丸印');
  // 戻す で最初の表示へ
  await page.click('#qcard .zoomctl button[data-z="back"]'); await page.waitForTimeout(400);
  assert.equal((await view(page)).k, 1);
  // 全体 で一気に地球全体
  await page.click('#qcard .zoomctl button[data-z="world"]'); await page.waitForTimeout(400);
  v = await view(page);
  assert.ok(fits(v)); assert.ok(Math.abs((v.x1 - v.x0) - W) < 2 || Math.abs((v.y1 - v.y0) - H) < 2, '全体はちょうど収まる大きさ');
});

t('wheel_zooms_out_below_start', async page => {
  await askMap(page, 'tv');
  const box = await page.locator('#qcard .mapbox svg.map').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 300);
  await page.waitForTimeout(200);
  const v = await view(page);
  assert.ok(v.k < 1, `k=${v.k}`);
  assert.equal(v.ring, 'inline');
});

// 太平洋の島国は最初の表示で近くの陸地が写るように広げる。ふつうの国はそのまま
t('ocean_islands_start_wider', async page => {
  const r = await page.evaluate(() => {
    const share = a => landShare(projectionFor(C.find(c => c.a === a), 'all', W, H), W, H);
    return { mh: share('mh'), tv: share('tv'), ws: share('ws'), jpK: (projectionFor(C.find(c => c.a === 'jp'), 'all', W, H), spanCache[`jp:${W}x${H}`]) };
  });
  for (const a of ['mh', 'tv', 'ws']) assert.ok(r[a] >= 0.05, `${a} ${r[a]}`);
  assert.equal(r.jpK, 1);
});
