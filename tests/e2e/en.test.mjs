// 英語版（PR5）: en/ のページ（Flag Master）。見えている日本語が無いこと（jaLeft）と、日本語版と同じ設定を使うこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, jaLeft, warned, QUIET_BADGES, pickSetup, settle, answerCorrect, answerWrong, answerTap, recordEvents, events } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 英語版を開いて fn(page, app) を呼び、最後にページの例外と [i18n] の warn（辞書に無いキー）が無いかも見る
const t = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openApp(browser, { path: 'en/', locale: 'en-US', storage: { badges: QUIET_BADGES }, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
  } finally { await app.close(); }
});

t('en_home', async page => {
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.deepEqual(await jaLeft(page), []);
  // 未訳の機能の入口は出さない
  for (const id of ['home-daily', 'home-rpg', 'home-rank', 'home-badges', 'home-profile'])
    assert.equal(await page.isVisible('#' + id), false, id);
  assert.match(await page.title(), /Flag Master/);
  assert.equal((await page.innerText('#home-play .hb-title')).trim(), 'Play quiz');
});

t('en_settings', async page => {
  await page.click('#home-settings');
  await page.waitForSelector('#scr-settings:not([hidden])');
  assert.deepEqual(await jaLeft(page), []);
  const chips = sel => page.$$eval(sel + ' .chip', bs => bs.map(b => b.textContent.trim()));
  assert.deepEqual(await chips('#set-theme'), ['Light', 'Dark', 'Match device']);
  assert.deepEqual(await chips('#set-fs'), ['Normal', 'Large', 'Extra large']);
  // まちがえた記録が無いとき・あるとき（1か国は単数）
  assert.equal((await page.innerText('#set-record')).trim(), 'No mistakes recorded yet');
  await page.evaluate(() => { misses = { jp: 1 }; renderSettings(); });
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistakes recorded: 1 country');
  await page.evaluate(() => { misses = { jp: 1, fr: 2 }; renderSettings(); });
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistakes recorded: 2 countries');
  // 音を切ると音量は Off
  await page.click('#set-sound');
  assert.equal((await page.innerText('#set-vol-n')).trim(), 'Off');
  assert.deepEqual(await jaLeft(page), []);
});

// 設定（localStorage の settings）は日本語版と同じものを使う
t('en_settings_shared', async (page, app) => {
  await page.click('#home-settings');
  await page.click('#set-theme [data-th="dark"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const ja = await app.context.newPage();
  await ja.goto(server.url);
  assert.equal(await ja.evaluate(() => document.documentElement.lang), 'ja');
  assert.equal(await ja.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await ja.click('#home-settings');
  assert.deepEqual(await ja.$$eval('#set-theme .chip[aria-pressed="true"]', bs => bs.map(b => b.textContent)), ['ダーク']);
});

// 地図を読めないときの帯
t('en_map_wait', async page => {
  await page.click('#home-play');
  await page.locator('#mapwait-retry').waitFor();
  assert.equal((await page.textContent('#mapwait-msg')).trim(), 'Couldn’t load the map');
  assert.deepEqual(await jaLeft(page), []);
}, { blockScripts: ['world.js'], waitMap: false });

// 390px のトップバーは1行（言語の切りかえを足す前の origin/main と同じ 35px）。スマホでは切りかえはもう一方の言語のリンクだけ。
// 日本語版は rpg.js のチップ（#topbar-extra）も並ぶ
const TOPBAR_390 = 35;
const topbar = page => page.evaluate(() => ({
  h: document.getElementById('topbar').getBoundingClientRect().height,
  sub: document.querySelector('#brand small').getClientRects().length && document.querySelector('#brand small').getBoundingClientRect().height,
  sw: [...document.querySelectorAll('#topbar .langsw > *')].filter(e => e.checkVisibility()).map(e => e.textContent),
}));
test('topbar_height_390', { timeout: 120_000 }, async () => {
  for (const [path, other] of [['', 'English'], ['en/', '日本語']]) {
    const app = await openApp(browser, { path: path + '#settings', storage: { badges: QUIET_BADGES } });
    try {
      await app.page.waitForSelector('#scr-settings:not([hidden])');
      const tb = await topbar(app.page);
      assert.ok(Math.abs(tb.h - TOPBAR_390) < 0.5 || (path && tb.h <= TOPBAR_390), `${path || 'ja'}: ${tb.h}px`);
      assert.ok(tb.sub < 14, `「FLAGS · NAMES · MAP」が折れている（${tb.sub}px）`);
      assert.deepEqual(tb.sw, [other]);
      assert.deepEqual(app.errors.map(String), []);
    } finally { await app.close(); }
  }
});

// ---- モード選択とクイズ（練習・挑戦）。Task 6 ----
const openSetup = async page => { await page.click('#home-play'); await page.waitForSelector('#scr-setup:not([hidden])'); };
const texts = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent.trim()));
const noCount = s => s.replace(/\s*\d+$/, '');   // 地域のチップの「 195」を外す
// モード選択の道場への帯（dojo.js）は Task 9 で訳す。それまではこの1つだけ除いて見る（Task 9 でこの関数を消して jaLeft に）
const DOJO_BAND = '🔍 似た国旗の道場 →';
const jaLeftSetup = async page => (await jaLeft(page)).filter(x => x !== DOJO_BAND);

t('en_setup', async page => {
  await openSetup(page);
  assert.deepEqual(await jaLeftSetup(page), []);
  assert.deepEqual(await texts(page, '#modes .modecard b'), ['Flag → Name', 'Name → Flag', 'Location → Flag', 'Flag → Location', 'Tap the map']);
  // タイムアタックのカードは出さない（「〜では遊べない」の札も出さない）
  assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge']);
  assert.equal(await page.locator('#kinds [data-k="ta"]').count(), 0);
  assert.deepEqual((await texts(page, '#regions .chips > .chip')).map(noCount),
    ['Whole world', 'Asia', 'Europe', 'Africa', 'North & Central America', 'South America', 'Oceania']);
  assert.equal((await page.textContent('#regions-hint')).trim(), 'Pick a large region to see its subregions. You can also tap a country on the map.');
  const counts = await texts(page, '#counts .chip');
  assert.deepEqual(counts.slice(0, 3), ['5 questions', '10 questions', '20 questions']);
  assert.match(counts[3], /^All \(\d+\)$/);
  // 細かい地域と、地図の aria-label
  await page.click('#regions .chip[data-r="アジア"]');
  assert.deepEqual((await texts(page, '#regions .subs .chip')).map(noCount), ['East Asia', 'Southeast Asia', 'South Asia', 'Central Asia', 'West Asia']);
  assert.equal(await page.getAttribute('#regions .subs', 'aria-label'), 'Subregions of Asia');
  assert.equal((await page.textContent('#regions .subs .lbl2')).trim(), 'Subregions');
  assert.match(await page.getAttribute('#rmap svg', 'aria-label'), /^World map with Asia \(\d+ countries\) highlighted$/);
  assert.deepEqual(await jaLeftSetup(page), []);
  // どのモードでも日本語が残らない（白地図タップはタイムアタックが無いモード）
  for (const k of ['n2f', 'm2f', 'f2m', 'tap', 'f2n']) {
    await page.click(`#modes .modecard[data-k="${k}"]`);
    assert.deepEqual(await jaLeftSetup(page), [], k);
    assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge'], k);
  }
});

// 日本語版でタイムアタック・東アジア・全部を選んだまま英語版を開く: 練習になり、保存は書きかえない
const SAVED_TA = { badges: QUIET_BADGES, setup: { mode: 'f2n', kind: 'ta', count: 'all' }, settings: { region: '東アジア' } };
t('en_saved_ta_shows_practice', async (page, app) => {
  await recordEvents(page);
  await openSetup(page);
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  assert.equal(noCount((await page.textContent('#regions .chip[aria-pressed="true"]')).trim()), 'East Asia');
  assert.match((await page.textContent('#counts .chip[aria-pressed="true"]')).trim(), /^All \(\d+\)$/);
  assert.deepEqual(await jaLeftSetup(page), []);
  await page.click('#start');
  await settle(page);
  const [ev] = await events(page, 'drill:start');
  assert.equal(ev.kind, 'practice');
  assert.equal(ev.region, '東アジア');
  const saved = await page.evaluate(() => [JSON.parse(localStorage.setup).kind, JSON.parse(localStorage.settings).region]);
  assert.deepEqual(saved, ['ta', '東アジア']);
  // 日本語版に戻るとタイムアタックのまま
  const ja = await app.context.newPage();
  await ja.goto(server.url);
  await ja.click('#home-play');
  assert.equal(await ja.getAttribute('#kinds [data-k="ta"]', 'aria-pressed'), 'true');
}, { storage: SAVED_TA });

// 5つのモードを練習・5問で: 1問目をまちがえ、残りは正解して最後まで。問題と答えの欄に日本語が無い
t('en_five_modes', async page => {
  for (const mode of ['f2n', 'n2f', 'm2f', 'f2m', 'tap']) {
    await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
    await page.click('#start');
    await settle(page);
    assert.deepEqual(await jaLeft(page), [], mode);
    const c = await page.evaluate(() => ({ e: G.cur.c.e, ec: G.cur.c.ec, opts: G.cur.opts.map(o => o.e) }));
    if (mode === 'f2n') assert.deepEqual(await texts(page, '.choice > span:not(.cname)'), c.opts);
    if (mode === 'n2f') assert.equal((await page.textContent('#qcard .qbig')).trim(), c.e);
    assert.match((await page.textContent('#pnum')).trim(), /^Learned 0 \/ 5$/);
    assert.equal((await page.textContent('#pscore')).trim(), '5 left');
    // 1問目はまちがえる
    if (mode === 'tap') await answerTap(page, { right: false }); else await answerWrong(page);
    await page.waitForSelector('#qcard .reveal');
    assert.deepEqual(await jaLeft(page), [], mode + ' wrong');
    assert.equal((await page.textContent('.verdict')).trim(), `Not quite. The answer is ${c.e}. You’ll see it again later.`);
    assert.equal((await page.textContent('.facts .name')).trim(), c.e);
    assert.deepEqual(await texts(page, '.facts dt'), ['Capital', 'Region', 'Area', 'ISO']);
    assert.equal((await page.textContent('.facts dt + dd')).trim(), c.ec);
    if (mode === 'tap') assert.match((await page.textContent('.tapkm')).trim(), /^About [\d,]+ km from where you tapped$/);
    assert.equal((await page.textContent('#next')).trim(), 'Next question →');
    await page.click('#next');
    // 残りは正解
    for (let i = 0; i < 10 && await page.isHidden('#scr-result'); i++) {
      await settle(page);
      assert.deepEqual(await jaLeft(page), [], `${mode} q${i + 2}`);
      if (mode === 'tap') await answerTap(page); else await answerCorrect(page);
      await page.waitForSelector('#qcard .reveal');
      assert.equal((await page.textContent('.verdict')).trim(), 'Correct!');
      assert.deepEqual(await jaLeft(page), [], `${mode} a${i + 2}`);
      await page.click('#next');
    }
    await page.waitForSelector('#scr-result:not([hidden])');
  }
});

t('en_challenge', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'challenge', region: 'all', count: 5 });
  await page.click('#start');
  await settle(page);
  assert.equal((await page.textContent('#pnum')).trim(), '1 / 5');
  await answerWrong(page);
  const e = await page.evaluate(() => G.cur.c.e);
  assert.equal((await page.textContent('.verdict')).trim(), `Not quite. The answer is ${e}. Back to the start!`);
  assert.equal((await page.textContent('#next')).trim(), 'Start over →');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#next');
  await settle(page);
  assert.equal((await page.textContent('#pscore')).trim(), 'Attempt 2');
  assert.deepEqual(await jaLeft(page), []);
  for (let i = 0; i < 5; i++) {
    await answerCorrect(page);
    assert.deepEqual(await jaLeft(page), []);
    assert.equal((await page.textContent('#next')).trim(), i < 4 ? 'Next question →' : 'See results');
    await page.click('#next');
  }
  await page.waitForSelector('#scr-result:not([hidden])');
});

// 長い英語の国名が 390px で選択肢からはみ出さない（国旗→国名と、国名表示ありの場所→国旗）
const LONG = ['vc', 'cd', 'fm', 'cf'];
const fits = page => page.evaluate(() => ({
  page: document.documentElement.scrollWidth,
  over: [...document.querySelectorAll('.choice, .choice > span')].filter(b => b.scrollWidth > b.clientWidth).map(b => b.textContent),
}));
t('en_long_names_fit', async page => {
  for (const mode of ['f2n', 'm2f']) {
    await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
    if (mode === 'm2f') await page.check('#nameopt');
    await page.click('#start');
    await settle(page);
    await page.evaluate(long => { makeQuestion = c => ({ c, opts: long.map(a => byA.get(a)) }); G.queue.unshift(byA.get(long[0])); nextQuestion(); }, LONG);
    await settle(page);
    const names = await texts(page, mode === 'f2n' ? '.choice > span' : '.choice .cname');
    assert.deepEqual(names, ['Saint Vincent and the Grenadines', 'Democratic Republic of the Congo', 'Federated States of Micronesia', 'Central African Republic']);
    const f = await fits(page);
    assert.ok(f.page <= 390, `${mode}: ${f.page}px`);
    assert.deepEqual(f.over, [], mode);
    await answerWrong(page);
    assert.ok((await fits(page)).page <= 390, mode + ' reveal');
    await page.evaluate(() => show('setup'));
  }
});

// 英語版でまちがえた国は、日本語版の設定の「まちがえた記録」に出る
t('en_misses_shared', async (page, app) => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await answerWrong(page);
  const ja = await app.context.newPage();
  await ja.goto(server.url);
  await ja.click('#home-settings');
  assert.equal((await ja.innerText('#set-record')).trim(), 'まちがえた記録: 1か国');
});

// まとめページの［このテーマでクイズ］（en/#theme=stars）。テーマの題は Task 12 で英語に（ここでは欄が出て、練習になることだけ）
t('en_theme_hash', async page => {
  await page.waitForSelector('#scr-setup:not([hidden])');
  assert.ok(await page.isVisible('#theme-field'));
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge']);
  assert.match((await page.textContent('#theme-name')).trim(), /^Collection: .+ \(\d+ countries\)$/);
}, { path: 'en/#theme=stars', storage: { badges: QUIET_BADGES, setup: { mode: 'f2n', kind: 'ta', count: 10 } } });
