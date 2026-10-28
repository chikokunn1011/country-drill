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
  // 地球を全部クリアすると、開いた直後は鏡の地球なので、地球のタブを押す
  await home(page, saveWith({ lv: 50, floors: { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 }, story: ['ch1'] }));
  await page.click('#rpg-chtabs button[data-ch="1"]');
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

// ---- 章タブ（🌍地球・🪞鏡の地球） ----
const EARTH = ['samerica', 'oceania', 'namerica', 'europe', 'asia', 'africa', 'world'];
const MIRROR = ['msamerica', 'moceania', 'mnamerica', 'meurope', 'masia', 'mafrica', 'mworld'];
const EARTH_CLEARED = Object.fromEntries(EARTH.map(id => [id, 5]));
const tabs = page => page.$$eval('#rpg-chtabs button[data-ch]', bs => bs.map(b => [b.dataset.ch, b.getAttribute('aria-pressed'), b.disabled, b.textContent.includes('🔒')]));
const ids = async page => (await nodes(page)).map(n => n[0]);
const mirror = page => page.$eval('#rpg-amap svg', s => s.classList.contains('is-mirror'));

t('chapter_tabs', async page => {
  // 新しいセーブ: 地球が押されていて、鏡の地球は開いていない
  await home(page, saveWith({}));
  assert.deepEqual(await tabs(page), [['1', 'true', false, false], ['2', 'false', true, true]]);
  assert.deepEqual(await ids(page), EARTH);
  assert.equal(await page.locator('#rpg-dgs .rpg-plate').count(), 7);
  assert.equal(await mirror(page), false);
  // 地図喰いを倒したセーブ: 開いた直後は次に挑むフロアの章（鏡のアマゾン F1）
  await home(page, saveWith({ lv: 30, floors: EARTH_CLEARED, story: ['ch1'] }));
  assert.deepEqual(await tabs(page), [['1', 'false', false, false], ['2', 'true', false, false]]);
  assert.equal(await mirror(page), true);
  assert.deepEqual(await ids(page), MIRROR);
  assert.deepEqual((await nodes(page))[0], ['msamerica', 'is-open', true, true]);
  assert.deepEqual(await page.$$eval('#rpg-dgs .rpg-plate', ps => ps.map(p => p.dataset.d)), MIRROR);
  assert.deepEqual(await shown(page), ['msamerica']);
  assert.match(await page.innerText('#rpg-amap .rpg-amap-h'), /ダンジョン 0\/7・フロア 0\/35/);
  assert.equal(await page.locator('#rpg-amap .rpg-am-road').count(), 6);
  // 地球のタブ: 地球の7つ（全部クリア）、図版は最後の地図喰いの巣
  await page.click('#rpg-chtabs button[data-ch="1"]');
  assert.deepEqual(await tabs(page), [['1', 'true', false, false], ['2', 'false', false, false]]);
  assert.equal(await mirror(page), false);
  assert.deepEqual(await ids(page), EARTH);
  assert.match(await page.innerText('#rpg-amap .rpg-amap-h'), /ダンジョン 7\/7・フロア 35\/35/);
  assert.deepEqual(await shown(page), ['world']);
  assert.equal(await page.locator('#rpg-amap .rpg-am-hero').count(), 0);   // 旅人は鏡の地球にいる
  // 鏡の地球のタブにもどす
  await page.click('#rpg-chtabs button[data-ch="2"]');
  assert.equal(await mirror(page), true);
  assert.deepEqual(await ids(page), MIRROR);
  // 冒険ホームを離れたら、次に挑むフロアの章にもどる
  await page.click('#rpg-chtabs button[data-ch="1"]');
  await page.evaluate(() => { show('home'); show('rpg'); });
  assert.equal(await mirror(page), true);
});
