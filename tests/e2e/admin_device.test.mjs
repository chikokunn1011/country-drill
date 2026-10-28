// 管理ページ（admin.html）の「端末」タブ: この端末のセーブ（localStorage）を見る・書きかえる・バックアップ・スナップショット・冒険・今日の難問
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { path: 'admin.html', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// 端末タブの区画（<details>）を開く
const open = (page, id) => page.evaluate(id => { document.getElementById(id).open = true; }, id);
const ls = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const coins = async page => JSON.parse(await ls(page, 'rpg')).coins;
const acceptDialogs = page => page.on('dialog', d => d.accept());
const RPG = { v: 1, coins: 500, lv: 3 };

t('device_tab_lists_saves', async page => {
  assert.equal(await page.isVisible('#tab-device'), true);
  assert.equal(await page.isHidden('#tab-rank'), true);
  assert.equal(await page.isHidden('#tab-log'), true);
  assert.equal((await page.textContent('#adm-who')).trim(), 'ログインしてない');
  await open(page, 'd-saves');
  const list = await page.textContent('#d-saves');
  assert.match(list, /settings/);
  assert.match(list, /rpg/);
  // タブを切りかえる
  await page.click('#adm-tabs [data-tab="log"]');
  assert.equal(await page.isVisible('#tab-log'), true);
  assert.equal(await page.isHidden('#tab-device'), true);
}, { storage: { settings: { theme: 'light', sound: true }, rpg: RPG } });

t('edit_json_saves_and_rejects_broken', async page => {
  await open(page, 'd-saves');
  await page.click('#d-saves [data-key="settings"]');
  assert.match(await page.inputValue('#d-json'), /"vol": 30/);
  const before = await ls(page, 'settings');
  await page.fill('#d-json', '{');
  await page.click('#d-json-save');
  await page.locator('#adm-toast', { hasText: 'JSONが壊れてる' }).waitFor();
  assert.equal(await ls(page, 'settings'), before);
  // ちゃんとした JSON は保存できる
  await page.fill('#d-json', '{"vol": 10}');
  await page.click('#d-json-save');
  assert.deepEqual(JSON.parse(await ls(page, 'settings')), { vol: 10 });
}, { storage: { settings: { vol: 30 } } });

t('rpg_coins_and_unlock', async page => {
  acceptDialogs(page);
  await open(page, 'd-rpg');
  await page.click('#d-rpg [data-coins="10000"]');
  assert.equal(await coins(page), 10500);
  await page.click('#d-rpg-unlock');
  const { floors } = JSON.parse(await ls(page, 'rpg'));
  const ids = await page.evaluate(() => RPG_CORE.DUNGEONS.map(g => g.id));
  for (const id of ids) assert.ok(floors[id] >= 4, `${id}: ${floors[id]}`);
  // ダンジョンの select も書きかわっている
  assert.equal(await page.inputValue(`#d-rpg select[data-floor="${ids[0]}"]`), '4');
}, { storage: { rpg: RPG } });

t('backup_download_name', async page => {
  await open(page, 'd-backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#d-dl')]);
  assert.match(dl.suggestedFilename(), /^country-drill-save-\d{8}\.json$/);
  const body = JSON.parse(await new Promise((ok, ng) => { const cs = []; dl.createReadStream().then(s => s.on('data', c => cs.push(c)).on('end', () => ok(Buffer.concat(cs).toString())).on('error', ng)); }));
  assert.equal(body.app, 'country-drill');
  assert.equal(JSON.parse(body.data.rpg).coins, 500);
}, { storage: { rpg: RPG } });

t('daily_answers_table', async page => {
  await open(page, 'd-daily');
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  // 日付を変えると問題が変わる（同じ日なら daily-core と同じ）
  await page.fill('#d-daily-day', '2026-01-01');
  await page.dispatchEvent('#d-daily-day', 'change');
  const first = await page.evaluate(() => COUNTRIES.find(c => c.a === DAILY_CORE.build('2026-01-01', COUNTRIES)[0].a).n);
  assert.ok((await page.textContent('#d-daily tbody tr:first-child')).includes(first), first);
});

t('snap_restore', async page => {
  acceptDialogs(page);
  await open(page, 'd-snaps');
  await open(page, 'd-rpg');
  await page.fill('#d-snap-name', 'テスト前');
  await page.click('#d-snap-save');
  await page.click('#d-rpg [data-coins="1000"]');
  assert.equal(await coins(page), 1500);
  await page.click('#d-snaps [data-snap="テスト前"] [data-act="load"]');
  assert.equal(await coins(page), 500);
}, { storage: { rpg: RPG } });

t('no_horizontal_scroll_phone', async page => {
  assert.equal(await page.locator('#tab-device details').count(), 11);
  await page.evaluate(() => document.querySelectorAll('#tab-device details').forEach(d => { d.open = true; }));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
}, { viewport: PHONE, storage: { rpg: RPG, settings: { theme: 'dark' } } });

t('csp_present_and_noindex', async page => {
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.equal(csp, "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src https://vgdkklvhtvcamtxwjpke.supabase.co; base-uri 'none'; form-action 'none'");
  assert.equal(await page.getAttribute('meta[name="robots"]', 'content'), 'noindex, nofollow');
  assert.equal(await page.locator('script:not([src])').count(), 0, 'インラインの script は無い');
  const srcs = await page.$$eval('script[src]', ss => ss.map(s => s.getAttribute('src')));
  assert.deepEqual(srcs, ['countries.js', 'daily-core.js', 'rpg-core.js', 'badges.js', 'sound.js', 'admin-save.js', 'admin-api.js', 'admin.js']);
});

t('theme_from_settings', async page => {
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 23, 28)');
}, { viewport: PC, storage: { settings: { theme: 'dark' } } });

// 壊れたセーブ（badges の got が null）でも、ほかの区画はふつうに出る
t('corrupt_badges_does_not_blank_sections', async (page, app) => {
  await open(page, 'd-badges');
  assert.match(await page.textContent('#d-badges-sum'), /^0 \/ \d+ ステップ取ってる$/);
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  assert.equal(await page.inputValue('#d-set-theme'), 'light');
  assert.deepEqual(app.consoleErrors, []);
}, { storage: { badges: { v: 1, got: null } } });

// 1つの区画で例外が出ても、その区画にだけ1行出して、ほかは描く
t('section_error_shows_only_in_that_section', async page => {
  await open(page, 'd-badges');
  assert.match(await page.textContent('#d-badges p[data-err]'), /この区画を出せなかった（boom-badges）/);
  assert.equal(await page.locator('p[data-err]').count(), 1);
  assert.equal(await page.locator('#d-daily tbody tr').count(), 20);
  assert.ok(await page.locator('#d-keys li').count() > 0);
}, { init: () => {
  let core;
  Object.defineProperty(globalThis, 'BADGES_CORE', { configurable: true, get: () => core,
    set: v => { core = v; v.makeCatalog = () => { throw new Error('boom-badges'); }; } });
} });

// 危ない操作で confirm をやめたら、何も変えず、自動のスナップショットも取らない
t('danger_cancel_keeps_storage_and_no_snapshot', async page => {
  page.on('dialog', d => d.dismiss());
  for (const id of ['d-rpg', 'd-badges', 'd-settings', 'd-snaps']) await open(page, id);
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  await page.click('#d-rpg-wipe');
  await page.click('#d-badges-none');
  await page.click('#d-first');
  const after = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  assert.equal(after, before);
  assert.equal(await ls(page, 'adminSnaps'), null);
  assert.doesNotMatch(await page.textContent('#d-snap-list'), /自動/);
}, { storage: { rpg: RPG } });

// 効果音を続けて押しても（40ms のまとめで play が null を返しても）「鳴らせなかった」は出ない
t('sound_double_press_no_error_toast', async page => {
  await open(page, 'd-sound');
  const b = page.locator('#d-sound-list [data-snd]').first();
  await page.evaluate(() => { const x = document.querySelector('#d-sound-list [data-snd]'); x.click(); x.click(); });
  await b.click();
  assert.doesNotMatch(await page.textContent('#adm-toast'), /鳴らせなかった/);
});

// D8 の「答え」の列に国名も出る
t('daily_answer_column_has_country_name', async page => {
  await open(page, 'd-daily');
  await page.fill('#d-daily-day', '2026-01-01');
  await page.dispatchEvent('#d-daily-day', 'change');
  const name = await page.evaluate(() => COUNTRIES.find(c => c.a === DAILY_CORE.build('2026-01-01', COUNTRIES)[0].a).n);
  const cell = await page.textContent('#d-daily tbody tr:first-child td:last-child');
  assert.ok(cell.includes('番目') && cell.includes(name), cell);
});

t('no_console_errors_on_load', async (page, app) => {
  await page.waitForTimeout(200);
  assert.deepEqual(app.consoleErrors, []);
});
