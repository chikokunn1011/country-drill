// 冒険ホームの冒険マップ（#rpg-amap）: ダンジョン7つの点・道・旅人の位置・進み具合、押したダンジョンの図版だけを下に出す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, PC } from './helpers.mjs';
import { openRpg, writeSave, saveWith } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const home = async (page, save) => {
  await writeSave(page, save);
  await page.evaluate(() => show('rpg'));
};
const nodes = page => page.$$eval('#rpg-amap .rpg-am-node', ns => ns.map(n => [n.dataset.d, ['is-done', 'is-open', 'is-locked'].find(c => n.classList.contains(c)), n.classList.contains('is-sel'), n.classList.contains('is-here')]));
const shown = page => page.$$eval('#rpg-dgs .rpg-plate', ps => ps.filter(p => !p.hidden).map(p => p.dataset.d));

t('amap_states_and_progress', async page => {
  await home(page, saveWith({ lv: 8, floors: { samerica: 5, oceania: 2 } }));
  assert.deepEqual(await nodes(page), [
    ['samerica', 'is-done', false, false], ['oceania', 'is-open', true, true], ['namerica', 'is-locked', false, false],
    ['europe', 'is-locked', false, false], ['asia', 'is-locked', false, false], ['africa', 'is-locked', false, false], ['world', 'is-locked', false, false],
  ]);
  assert.equal(await page.locator('#rpg-amap .rpg-am-road').count(), 6);
  assert.equal(await page.locator('#rpg-amap .rpg-am-road.is-open').count(), 1);   // アマゾン → サンゴ礁の海
  assert.equal(await page.locator('#rpg-amap .rpg-am-hero').count(), 1);
  assert.match(await page.innerText('#rpg-amap .rpg-amap-h'), /ダンジョン 1\/7・フロア 7\/35/);
  // 下の図版は次に挑むダンジョンだけ。まだはじめてクリアしていないフロアのコインとボスまでのフロア数
  assert.deepEqual(await shown(page), ['oceania']);
  const gain = await page.innerText('.rpg-plate[data-d="oceania"] .rpg-plate-gain');
  assert.match(gain, /ボスまで あと3フロア/);
  const want = await page.evaluate(() => [3, 4, 5].reduce((s, f) => s + RPG_CORE.battleReward(RPG_CORE.stageOf('oceania', f), { win: true, first: true, boss: f === 5 }), 0));
  assert.ok(gain.replace(/,/g, '').includes(String(want)), gain);
});

t('amap_pick_shows_plate', async page => {
  await home(page, saveWith({ lv: 8, floors: { samerica: 5, oceania: 2 } }));
  await page.click('#rpg-amap .rpg-am-node[data-d="samerica"]');
  assert.deepEqual(await shown(page), ['samerica']);
  assert.equal(await page.getAttribute('#rpg-amap .rpg-am-node[data-d="samerica"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#rpg-amap .rpg-am-node[data-d="oceania"]', 'aria-pressed'), 'false');
  assert.equal(await page.locator('.rpg-plate[data-d="samerica"] .rpg-plate-gain').count(), 0);   // 全部クリアならもらえるものは無い
  // まだ開いていないダンジョンは、どうすれば開くかを出す
  await page.focus('#rpg-amap .rpg-am-node[data-d="namerica"]');
  await page.keyboard.press('Enter');
  assert.deepEqual(await shown(page), ['namerica']);
  assert.match(await page.innerText('.rpg-plate[data-d="namerica"]'), /サンゴ礁の海のボスをたおすと開く/);
  // 選んだフロアのボタンでバトルへ。冒険ホームにもどると次に挑むダンジョンにもどる
  await page.click('#rpg-amap .rpg-am-node[data-d="samerica"]');
  await page.click('.rpg-fl[data-d="samerica"][data-f="2"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'battle');
  await page.evaluate(() => show('rpg'));
  assert.deepEqual(await shown(page), ['oceania']);
});

t('amap_all_clear', async page => {
  await home(page, saveWith({ lv: 50, floors: { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 } }));
  assert.ok((await nodes(page)).every(([, st, , here]) => st === 'is-done' && !here));
  assert.equal(await page.locator('#rpg-amap .rpg-am-hero').count(), 0);
  assert.match(await page.innerText('#rpg-amap .rpg-amap-h'), /ダンジョン 7\/7・フロア 35\/35/);
  assert.deepEqual(await shown(page), ['world']);
});

t('amap_names_only_on_pc', async page => {
  await home(page, saveWith({ lv: 8, floors: { samerica: 1 } }));
  assert.equal(await page.isVisible('#rpg-amap .rpg-am-name >> nth=0'), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.isVisible('#rpg-amap .rpg-am-name >> nth=0'), false);
}, { viewport: PC });
