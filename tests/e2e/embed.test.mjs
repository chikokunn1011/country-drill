// 埋めこみ「今日の国旗」（embed.html）。1日1問（国旗→国名か国名→国旗）、答え直せる、リンクは新しいタブ、色は ?theme=、
// 読むのは3つの script と国旗だけ、狭い枠・貼り付けコードの枠に収まる、読めないときの表示、alt で答えがバレない
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { startServer, openApp } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 出題はブラウザと同じファイルを vm で読んで決める。f2n の日と n2f の日を 2026-10-28 から探す
const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(read('countries.js'), ctx);
vm.runInContext(read('daily-core.js'), ctx);
const D = ctx.DAILY_CORE, C = ctx.window.COUNTRIES, byA = new Map(C.map(c => [c.a, c]));
const dayOf = mode => { for (let i = 0; ; i++) { const d = D.addDays('2026-10-28', i); if (D.oneOfDay(d, C).mode === mode) return d; } };
const DAYS = { f2n: dayOf('f2n'), n2f: dayOf('n2f') };
const Q = mode => JSON.parse(JSON.stringify(D.oneOfDay(DAYS[mode], C)));   // vm の配列をこちらの配列に

// Date を差しかえて、その日の日本時間の昼にする（daily.test.mjs の at と同じ）
const at = iso => `{ const off = Date.parse('${iso}') - Date.now(), D = Date;
  globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }`;
const LIGHT = 'rgb(238, 242, 241)', DARK = 'rgb(15, 23, 28)';

const open = async ({ mode = 'f2n', qs = '', ...opts }, fn) => {
  const app = await openApp(browser, { url: server.url, path: 'embed.html' + qs, init: at(DAYS[mode] + 'T03:00:00Z'), ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
};
const t = (name, fn) => test(name, { timeout: 60_000 }, fn);
const text = (page, sel) => page.locator(sel).innerText();
const wrongOf = mode => Q(mode).opts.find(a => a !== Q(mode).a);

t('answer_wrong_then_right', async () => {
  for (const mode of ['f2n', 'n2f']) await open({ mode }, async page => {
    const q = Q(mode);
    assert.equal(await text(page, '#e-q'), mode === 'f2n' ? 'この国旗はどこの国？' : 'この国の国旗は？', mode);
    assert.deepEqual(await page.$$eval('.e-opt', bs => bs.map(b => b.dataset.a)), q.opts, mode);
    if (mode === 'f2n') assert.deepEqual(await page.$$eval('.e-opt', bs => bs.map(b => b.textContent)), q.opts.map(a => byA.get(a).n));
    else assert.equal(await text(page, '#e-prompt'), byA.get(q.a).n);
    assert.ok(await page.isHidden('#e-links') && await page.isHidden('#e-again'), mode);
    await page.click(`.e-opt[data-a="${wrongOf(mode)}"]`);
    assert.equal(await page.locator('.e-opt.ng').count(), 1, mode);
    assert.ok(await page.locator(`.e-opt[data-a="${wrongOf(mode)}"]`).isDisabled(), mode);
    assert.equal(await page.locator('.e-opt:enabled').count(), 3, mode);
    assert.match(await text(page, '#e-msg'), /ちがう/);
    assert.ok(await page.isVisible('#e-links'), mode);
    for (const [sel, href] of [['#e-daily', './#daily'], ['#e-more', './']]) {
      assert.equal(await page.getAttribute(sel, 'href'), href);
      assert.equal(await page.getAttribute(sel, 'target'), '_blank');
      assert.equal(await page.getAttribute(sel, 'rel'), 'noopener');
    }
    assert.match(await text(page, '#e-daily'), /今日の難問（20問）に挑戦/);
    await page.click(`.e-opt[data-a="${q.a}"]`);
    assert.equal(await page.locator(`.e-opt.ok[data-a="${q.a}"]`).count(), 1, mode);
    assert.equal(await page.locator('.e-opt:disabled').count(), 4, mode);
    assert.match(await text(page, '#e-msg'), /せいかい/);
    await page.click('#e-again');
    assert.equal(await page.locator('.e-opt.ok, .e-opt.ng').count(), 0, mode);
    assert.equal(await page.locator('.e-opt:enabled').count(), 4, mode);
    assert.ok(await page.isHidden('#e-again'), mode);
  });
});

t('files_read', async () => {
  for (const mode of ['f2n', 'n2f']) await open({ mode }, async (page, app) => {
    const reqs = [];
    app.context.on('request', r => reqs.push(r.url()));
    await page.reload();
    await page.waitForLoadState('load');
    await page.waitForFunction(() => [...document.querySelectorAll('#embed img')].every(i => i.complete));
    const outside = reqs.filter(u => !u.startsWith(server.url));
    assert.deepEqual(outside, [], mode);
    const paths = reqs.map(u => new URL(u).pathname.slice(1)).filter(p => p !== 'embed.html');
    const flags = [...new Set(paths.filter(p => /^flags\/[a-z]{2}\.svg$/.test(p)))].map(p => p.slice(6, 8)).sort();
    assert.deepEqual(paths.filter(p => !p.startsWith('flags/')).sort(), ['countries.js', 'daily-core.js', 'embed.js'], mode);
    assert.deepEqual(flags, mode === 'f2n' ? [Q(mode).a] : Q(mode).opts.slice().sort(), mode);
  });
});

t('embed_theme', async () => {
  const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  for (const [qs, colorScheme, want] of [['', 'dark', LIGHT], ['?theme=dark', 'light', DARK], ['?theme=auto', 'dark', DARK],
    ['?theme=auto', 'light', LIGHT], ['?theme=blue', 'dark', LIGHT], ['?theme=light', 'dark', LIGHT]]) {
    await open({ qs, colorScheme }, async page => assert.equal(await bg(page), want, `${qs} ${colorScheme}`));
  }
});

t('narrow_280', async () => {
  for (const mode of ['f2n', 'n2f']) await open({ mode, viewport: { width: 280, height: 600 } }, async page => {
    await page.click(`.e-opt[data-a="${wrongOf(mode)}"]`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 280), mode);
    for (const b of await page.locator('.e-opt').all()) assert.ok(await b.isVisible(), mode);
  });
});

t('fits_snippet_box', async () => {
  for (const mode of ['n2f', 'f2n']) await open({ mode, viewport: { width: 400, height: 460 } }, async page => {
    await page.click(`.e-opt[data-a="${wrongOf(mode)}"]`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= 460), `${mode} 縦に収まらない`);
    const box = await page.locator('#e-more').boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 460, mode);
    // 正解して「もう一度」が出ても収まる
    await page.click(`.e-opt[data-a="${Q(mode).a}"]`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= 460), `${mode} 正解のあと縦に収まらない`);
  });
});

t('countries_blocked', async () => {
  await open({ blockScripts: ['countries.js'] }, async page => {
    assert.equal(await text(page, '.e-err'), '読みこめませんでした');
    assert.ok(await page.isVisible('#e-more'));
    assert.equal(await page.locator('.e-opt').count(), 0);
  });
});

t('flag_missing', async () => {
  const routes = [['**/flags/*.svg*', r => r.abort()]];
  for (const mode of ['f2n', 'n2f']) await open({ mode, routes }, async page => {
    if (mode === 'f2n') await page.locator('#e-prompt .e-noflag').waitFor();
    else await page.waitForFunction(() => document.querySelectorAll('#e-opts .e-noflag').length === 4);
    assert.equal(await page.locator('#embed img').count(), 0, mode);
    assert.match(await text(page, '.e-noflag >> nth=0'), /国旗を表示できません/);
    await page.click(`.e-opt[data-a="${Q(mode).a}"]`);
    assert.match(await text(page, '#e-msg'), /せいかい/);
  });
});

t('no_answer_in_alt', async () => {
  const names = C.map(c => c.n);
  for (const mode of ['f2n', 'n2f']) await open({ mode }, async page => {
    const alts = await page.$$eval('#embed img', is => is.map(i => i.alt));
    assert.equal(alts.length, mode === 'f2n' ? 1 : 4, mode);
    for (const alt of alts) assert.ok(!names.some(n => alt.includes(n)), `${mode} alt: ${alt}`);
    for (const b of await page.$$eval('.e-opt', bs => bs.map(b => b.getAttribute('aria-label') ?? ''))) assert.ok(!names.some(n => b.includes(n)), `${mode} aria-label: ${b}`);
    const cap = byA.get(Q(mode).a).c, body = await text(page, '#embed');
    if (cap && !names.includes(cap)) assert.ok(!body.includes(cap), `${mode} 首都 ${cap} が出ている`);
  });
});
