// まとめページの［このテーマでクイズ］（index.html#theme=<id>）。テーマの国だけを出題し、保存はしない
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, settle, answerCorrect, clearByAnswering, recordEvents, events } from './helpers.mjs';
import { RPG_FILES } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}) => test(name, { timeout: 60_000 }, async () => {
  const app = await openApp(browser, { path: 'index.html#theme=stars', ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
const themeA = (page, id = 'stars') => page.evaluate(id => THEMES_DATA[id].a, id);
const visible = (page, sel) => page.locator(sel).isVisible();

t('theme_hash_opens_setup', async page => {
  await page.locator('#scr-setup').waitFor();
  const n = (await themeA(page)).length;
  assert.ok(n >= 10);
  assert.equal(await visible(page, '#theme-field'), true);
  const text = await page.locator('#theme-field').innerText();
  assert.ok(text.includes(`テーマ: 星がある国旗（${n}か国）`), text);
  assert.equal(await page.locator('#theme-field button', { hasText: 'テーマをやめる' }).count(), 1);
  assert.equal(await visible(page, '#regions'), false);
  assert.equal(await visible(page, '#rmap'), false);
  assert.match(await page.locator('#counts .chip[data-c="all"]').innerText(), new RegExp(`全部（${n}）`));
});

t('theme_quiz_only_theme_countries', async page => {
  await recordEvents(page);
  await pickSetup(page, { mode: 'f2n', kind: 'practice', count: 'all' });
  await page.click('#start');
  await settle(page);
  const a = new Set(await themeA(page));
  const set = await page.evaluate(() => G.set.map(c => c.a));
  assert.equal(set.length, a.size);
  assert.ok(set.every(x => a.has(x)));
  const [st] = await events(page, 'drill:start');
  assert.equal(st.region, 'theme:stars');
  assert.equal(await page.evaluate(() => G.region), 'theme:stars');
  await answerCorrect(page);
  const [ans] = await events(page, 'drill:answer');
  assert.equal(ans.region, 'theme:stars');
});

t('theme_choices_prefer_theme', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', count: 10 });
  await page.click('#start');
  const a = new Set(await themeA(page));
  for (let i = 0; i < 5; i++) {
    await settle(page);
    const opts = await page.$$eval('#qcard .choice', bs => bs.map(b => b.dataset.a));
    assert.equal(opts.length, 4);
    assert.ok(opts.every(x => a.has(x)), opts.join(' '));
    await answerCorrect(page);
    await page.click('#next');
  }
});

t('theme_no_ta', async page => {
  await page.locator('#scr-setup').waitFor();
  const ta = page.locator('#kinds .modecard[data-k="ta"]');
  assert.equal(await ta.isDisabled(), true);
  assert.match(await ta.innerText(), /テーマでは遊べない/);
  assert.equal(await page.locator('#kinds .modecard[data-k="practice"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('setup')).kind), 'ta', '保存は変えない');
  await page.click('#start');
  assert.equal(await page.evaluate(() => G.kind), 'practice');
  await page.evaluate(() => show('setup'));
  await page.click('#theme-field button');
  assert.equal(await page.locator('#kinds .modecard[data-k="ta"]').getAttribute('aria-pressed'), 'true', 'やめたらタイムアタックに戻る');
}, { storage: { setup: { mode: 'f2n', kind: 'ta', count: 10, name: false } } });

t('theme_map_modes_world', async page => {
  await page.evaluate(() => {
    window.__regions = [];
    const orig = zoomableMap;
    window.zoomableMap = (c, label, opts = {}) => { window.__regions.push(opts.region); return orig(c, label, opts); };
  });
  await pickSetup(page, { mode: 'm2f', kind: 'practice', count: 5 });
  await page.click('#start');
  await settle(page);
  assert.deepEqual(await page.evaluate(() => window.__regions), ['all']);
});

t('theme_leave', async page => {
  await page.locator('#scr-setup').waitFor();
  await page.click('#theme-field button');
  assert.equal(await visible(page, '#theme-field'), false);
  assert.equal(await visible(page, '#regions'), true);
  assert.equal(await visible(page, '#rmap'), true);
  assert.equal(await page.evaluate(() => S.region), 'ヨーロッパ');
  assert.equal(await page.evaluate(() => location.hash), '');
  assert.equal(await page.evaluate(() => THEME), null);
}, { storage: { settings: { region: 'ヨーロッパ' } } });

t('theme_not_saved', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', count: 5 });
  await page.click('#start');
  await settle(page);
  await page.goto(server.url);
  await page.waitForFunction(() => typeof mapReady === 'undefined' || mapReady);
  await pickSetup(page, {});
  assert.equal(await visible(page, '#theme-field'), false);
  assert.equal(await visible(page, '#regions'), true);
  await page.click('#start');
  await settle(page);
  assert.equal(await page.evaluate(() => G.region), 'all');
}, { storage: { settings: { region: 'all' } } });

for (const hash of ['#theme=nope', '#theme=%E0']) {
  t(`theme_hash_unknown ${hash}`, async page => {
    await page.locator('#scr-home').waitFor();
    assert.equal(await page.isHidden('#scr-setup'), true);
    assert.equal(await page.evaluate(() => THEME), null);
  }, { path: 'index.html' + hash });
}

t('theme_badges_ignore', async page => {
  await recordEvents(page);
  await pickSetup(page, { mode: 'f2n', kind: 'practice', count: 10 });
  await page.click('#start');
  await clearByAnswering(page);
  const [r] = await events(page, 'drill:result');
  assert.equal(r.region, 'theme:stars');
  assert.equal(r.n, 10);
  await page.waitForFunction(() => BADGES.debug.dump().s.clears >= 1);
  assert.deepEqual(await page.evaluate(() => BADGES.debug.dump().s.rc), {});
}, { path: 'index.html?bdgdebug=1#theme=stars', blockScripts: RPG_FILES });
