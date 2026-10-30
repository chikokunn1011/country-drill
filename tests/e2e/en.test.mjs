// 英語版（PR5）: en/ のページ（Flag Master）。見えている日本語が無いこと（jaLeft）と、日本語版と同じ設定を使うこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { startServer, openApp, jaLeft, warned, QUIET_BADGES, PC, pickSetup, settle, answerCorrect, answerWrong, answerTap, recordEvents, events } from './helpers.mjs';

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
  assert.equal((await page.innerText('#home-play .hb-title')).trim(), 'Play the quiz');
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
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistake history: 1 country');
  await page.evaluate(() => { misses = { jp: 1, fr: 2 }; renderSettings(); });
  assert.equal((await page.innerText('#set-record')).trim(), 'Mistake history: 2 countries');
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

// rpg_home.test.mjs の topbar_one_line_360 の英語版。コインのセーブがあっても 360px のトップバーは1行で、切りかえは「JA」と見えて名前は「日本語」
t('en_topbar_one_line_360', async page => {
  await page.evaluate(() => show('setup'));
  const r = await page.evaluate(() => {
    const els = [...['brand', 'to-book', 'to-settings'].map(id => document.getElementById(id)), document.querySelector('#topbar .langsw a')];
    const rects = els.map(e => e.getBoundingClientRect());
    return { tops: rects.map(x => x.top), bottoms: rects.map(x => x.bottom), rights: rects.map(x => x.right),
      h: document.getElementById('topbar').getBoundingClientRect().height, iw: innerWidth, sw: document.documentElement.scrollWidth,
      after: getComputedStyle(els[3], '::after').content };
  });
  const at = JSON.stringify(r);
  assert.ok(Math.max(...r.tops) < Math.min(...r.bottoms), `1行になっていない: ${at}`);
  assert.ok(r.rights.every(x => x <= r.iw), `はみ出している: ${at}`);
  assert.ok(r.h <= TOPBAR_390, `トップバーが高い: ${at}`);
  assert.ok(r.sw <= r.iw, `横にスクロールする: ${at}`);
  assert.match(r.after, /^"JA"/);
  assert.equal(await page.locator('#topbar').getByRole('link', { name: '日本語', exact: true }).count(), 1);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: { width: 360, height: 640 }, storage: { badges: QUIET_BADGES, rpg: { v: 1, intro: true, coins: 123456 } } });

// PR6: 端末の時間帯（timezoneId）で I18N.localOf が「その人の時間」を出す。ニックネーム（data-ugc）の日本語は jaLeft が数えない
t('en_local_time_and_ugc', async page => {
  const r = await page.evaluate(() => {
    const now = new Date('2026-10-30T00:00:00Z');
    return [I18N.localOf(0, 0, { now }), I18N.localOf(0, 0, { weekly: true, now }), I18N.dayLabel('2026-10-30')];
  });
  assert.deepEqual(r, ['11:00 AM', 'Sunday 10:00 AM', 'Oct 30']);
  await page.evaluate(() => document.querySelector('#scr-home').insertAdjacentHTML('beforeend', '<p id="ugc-test" data-ugc><b>たろう</b></p><p id="ja-test">じろう</p>'));
  assert.deepEqual(await jaLeft(page), ['じろう']);
}, { timezoneId: 'America/New_York' });

// ---- モード選択とクイズ（練習・挑戦）。Task 6 ----
const openSetup = async page => { await page.click('#home-play'); await page.waitForSelector('#scr-setup:not([hidden])'); };
const texts = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent.trim()));
const noCount = s => s.replace(/\s*\d+$/, '');   // 地域のチップの「 195」を外す

t('en_setup', async page => {
  await openSetup(page);
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual(await texts(page, '#modes .modecard b'), ['Flag → Name', 'Name → Flag', 'Location → Flag', 'Flag → Location', 'Tap the map']);
  // PR6: タイムアタックのカードも出す
  assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge', 'Time Attack']);
  assert.deepEqual((await texts(page, '#regions .chips > .chip')).map(noCount),
    ['World', 'Asia', 'Europe', 'Africa', 'North & Central America', 'South America', 'Oceania']);
  assert.equal((await page.textContent('#regions-hint')).trim(), 'Pick a large region to see its subregions. You can also tap a country on the map to choose its region.');
  const counts = await texts(page, '#counts .chip');
  assert.deepEqual(counts.slice(0, 3), ['5 questions', '10 questions', '20 questions']);
  assert.match(counts[3], /^All \(\d+\)$/);
  // 細かい地域と、地図の aria-label
  await page.click('#regions .chip[data-r="アジア"]');
  assert.deepEqual((await texts(page, '#regions .subs .chip')).map(noCount), ['East Asia', 'Southeast Asia', 'South Asia', 'Central Asia', 'West Asia']);
  assert.equal(await page.getAttribute('#regions .subs', 'aria-label'), 'Subregions of Asia');
  assert.equal((await page.textContent('#regions .subs .lbl2')).trim(), 'Subregions');
  assert.match(await page.getAttribute('#rmap svg', 'aria-label'), /^World map with Asia \(\d+ countries\) highlighted$/);
  assert.deepEqual(await jaLeft(page), []);
  // どのモードでも日本語が残らない（白地図タップはタイムアタックが無いモード）
  for (const k of ['n2f', 'm2f', 'f2m', 'tap', 'f2n']) {
    await page.click(`#modes .modecard[data-k="${k}"]`);
    assert.deepEqual(await jaLeft(page), [], k);
    assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge', 'Time Attack'], k);
    // 白地図タップはタイムアタックが無い（札は英語）
    assert.equal(await page.locator('#kinds [data-k="ta"][disabled]').count(), k === 'tap' ? 1 : 0, k);
  }
  await page.click('#modes .modecard[data-k="tap"]');
  assert.equal((await page.textContent('#kinds [data-k="ta"] span')).trim(), "Not available in Tap the map");
});

// 日本語版でタイムアタック・東アジア・全部を選んだまま英語版を開く: タイムアタックのまま（PR6 で英語版もタイムアタックを選べる）。
// タイムアタックは大きい地域だけなので、日本語版と同じく東アジアは親のアジアになる（細かい地域は settings.sub に残る）
const SAVED_TA = { badges: QUIET_BADGES, setup: { mode: 'f2n', kind: 'ta', count: 'all' }, settings: { region: '東アジア' } };
t('en_saved_ta_kept', async (page, app) => {
  await recordEvents(page);
  await openSetup(page);
  assert.equal(await page.locator('#kinds [data-k="ta"]').count(), 1);
  assert.equal(await page.getAttribute('#kinds [data-k="ta"]', 'aria-pressed'), 'true');
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'false');
  assert.equal((await page.textContent('#kinds [data-k="ta"] b')).trim(), 'Time Attack');
  assert.equal(noCount((await page.textContent('#regions .chip[aria-pressed="true"]')).trim()), 'Asia');
  assert.equal((await page.textContent('#regions-hint')).trim(), 'Time Attack uses only the large regions, to match the leaderboard.');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#start');
  await settle(page);
  const [ev] = await events(page, 'drill:start');
  assert.equal(ev.kind, 'ta');
  assert.equal(ev.region, 'アジア');
  const saved = await page.evaluate(() => { const s = JSON.parse(localStorage.settings); return [JSON.parse(localStorage.setup).kind, s.region, s.sub]; });
  assert.deepEqual(saved, ['ta', 'アジア', '東アジア']);
  // 日本語版に戻ってもタイムアタックのまま
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

// まとめページの［このテーマでクイズ］（en/#theme=stars）。テーマの題は themes.js の英語の題 e
t('en_theme_hash', async page => {
  await page.waitForSelector('#scr-setup:not([hidden])');
  assert.ok(await page.isVisible('#theme-field'));
  assert.equal(await page.getAttribute('#kinds [data-k="practice"]', 'aria-pressed'), 'true');
  // テーマ中はタイムアタックを選べない（PR6: カードは出して、札は英語）
  assert.deepEqual(await texts(page, '#kinds .modecard b'), ['Practice', 'Challenge', 'Time Attack']);
  assert.equal(await page.getAttribute('#kinds [data-k="ta"]', 'aria-disabled'), 'true');
  assert.equal((await page.textContent('#kinds [data-k="ta"] span')).trim(), 'Not available in a collection');
  assert.deepEqual(await jaLeft(page), []);
  const n = await page.evaluate(() => window.THEMES_DATA.stars.a.length);
  assert.equal(n, 70);
  assert.equal((await page.textContent('#theme-name')).trim(), `Collection: Flags with stars (${n} countries)`);
}, { path: 'en/#theme=stars', storage: { badges: QUIET_BADGES, setup: { mode: 'f2n', kind: 'ta', count: 10 } } });

// ---- 結果画面（Task 7） ----
// 練習・5問を、1問目だけまちがえて最後まで。まちがえた国を返す
const playPractice5 = async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await settle(page);
  const missed = await page.evaluate(() => ({ e: G.cur.c.e, ec: G.cur.c.ec }));
  await answerWrong(page);
  await page.click('#next');
  for (let i = 0; i < 10 && await page.isHidden('#scr-result'); i++) {
    await settle(page);
    await answerCorrect(page);
    await page.click('#next');
  }
  await page.waitForSelector('#scr-result:not([hidden])');
  return missed;
};

t('en_result_practice', async page => {
  const missed = await playPractice5(page);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await page.textContent('#rcard .result .qlabel')).trim(), 'Nice work!');
  assert.equal((await page.textContent('#rcard .score')).trim(), '4 / 5 right on the first try');
  const st = await texts(page, '#rcard .stats > span');
  assert.equal(st[0], 'Retries 1');
  assert.match(st[1], /^Best streak \d+$/);
  assert.equal((await page.textContent('#rcard .hint')).trim(), 'Flag → Name / Practice / World');
  // まちがえた国（英語の国名と首都）
  assert.equal((await page.textContent('#r-side .qlabel')).trim(), 'Countries you missed');
  assert.deepEqual(await texts(page, '.misslist li b'), [missed.e]);
  assert.deepEqual(await texts(page, '.misslist li span'), [missed.ec]);
  // シェア・タイムアタックの箱・ほかのファイルの欄は出ない
  assert.equal(await page.locator('#r-share').count(), 0);
  assert.equal(await page.locator('.tabox').count(), 0);
  assert.equal((await page.innerHTML('#r-ext')).trim(), '');
  assert.equal((await page.textContent('#r-setup')).trim(), 'Change mode');
  assert.equal((await page.textContent('#r-again')).trim(), 'Play again');
  await page.waitForTimeout(400);   // TA_GUARD_MS
  await page.click('#r-again');
  await settle(page);
  assert.ok(await page.isVisible('#scr-quiz'));
  await page.evaluate(() => { endGame('quit'); showResult(); });
  await page.waitForTimeout(400);
  await page.click('#r-setup');
  await page.waitForSelector('#scr-setup:not([hidden])');
});

t('en_result_challenge', async page => {
  await pickSetup(page, { mode: 'n2f', kind: 'challenge', region: 'アジア', count: 5 });
  await page.click('#start');
  for (let i = 0; i < 5; i++) { await settle(page); await answerCorrect(page); await page.click('#next'); }
  await page.waitForSelector('#scr-result:not([hidden])');
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await page.textContent('#rcard .result .qlabel')).trim(), 'Perfect clear!');
  assert.equal((await page.textContent('#rcard .score')).trim(), '5 correct in a row');
  assert.deepEqual(await texts(page, '#rcard .stats > span'), ['Cleared on attempt 1', 'Mistakes 0']);
  assert.equal((await page.textContent('#rcard .hint')).trim(), 'Name → Flag / Challenge / Asia');
  // 2回目以降のクリア
  await page.evaluate(() => { G.attempts = 2; G.wrongs = 1; G.ended = false; showResult(); });
  assert.equal((await page.textContent('#rcard .result .qlabel')).trim(), 'Cleared!');
  assert.deepEqual(await texts(page, '#rcard .stats > span'), ['Cleared on attempt 2', 'Mistakes 1']);
  assert.deepEqual(await jaLeft(page), []);
});

// ドパガキ向け: ポップ文字（ほめ言葉・COMBO 終了）と結果の RANK 欄
t('en_dopa', async page => {
  await page.evaluate(() => { window.__pops = []; const pop = FX.pop; FX.pop = (t, c) => { window.__pops.push(t); return pop(t, c); }; });
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await settle(page);
  for (let i = 0; i < 3; i++) { await answerCorrect(page); assert.deepEqual(await jaLeft(page), []); await page.click('#next'); await settle(page); }
  await answerWrong(page);   // 3連続のあとでまちがえる → COMBO 終了
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#next');
  for (let i = 0; i < 10 && await page.isHidden('#scr-result'); i++) { await settle(page); await answerCorrect(page); await page.click('#next'); }
  await page.waitForSelector('#scr-result:not([hidden])');
  assert.deepEqual(await jaLeft(page), []);
  assert.match((await page.textContent('#rcard .rank')).trim(), /^RANK [SABC]$/);
  const pops = await page.evaluate(() => window.__pops);
  assert.ok(pops.includes('3 COMBO broken…'), pops.join(' | '));
  // 日本語の判定は tools/i18n_scan.mjs の JA_RE（ページの中で作り直す）
  assert.deepEqual(await page.evaluate(([src, flags]) => window.__pops.filter(p => new RegExp(src, flags).test(p)), [JA_RE.source, JA_RE.flags]), []);
}, { storage: { badges: QUIET_BADGES, settings: { dopa: true } } });

// ランキングは英語版では開かない（ranking.js を読まない）
t('en_no_ranking', async page => {
  await page.waitForSelector('#scr-home:not([hidden])');
  assert.equal(await page.isHidden('#scr-ranking'), true);
  assert.deepEqual(await jaLeft(page), []);
}, { path: 'en/#ranking' });

// ---- 図鑑（Task 8） ----
const openBook = async (page, view = 'list') => {
  await page.click('#home-book');
  await page.waitForSelector('#scr-book:not([hidden])');
  await page.click(`#bview button[data-v="${view}"]`);
};
const cardNames = page => page.$$eval('#grid .card b', bs => bs.map(b => b.textContent));

t('en_book_list', async page => {
  await openBook(page);
  assert.deepEqual(await jaLeft(page), []);
  const names = await cardNames(page);
  assert.equal(names.length, 195);
  assert.equal(names[0], 'Afghanistan');
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')));
  const i = names.indexOf('Ivory Coast');
  assert.deepEqual([names[i - 1], names[i + 1]], ['Italy', 'Jamaica']);
  assert.equal((await page.textContent('#bcount')).trim(), '195 countries');
  assert.equal((await page.textContent('#grid .card[data-a="jp"] span')).trim(), 'Capital: Tokyo');
  assert.equal((await page.innerText('#hidecap-row')).trim(), 'Hide capitals');
  assert.equal(await page.isVisible('#grid .card[data-a="jp"] span'), true);
  await page.click('#hidecap');
  assert.equal(await page.isVisible('#grid .card[data-a="jp"] span'), false);
  // 地域の選択: 表示は英語、value は日本語のまま
  const opts = await page.$$eval('#bregion option', os => os.map(o => [o.value, o.textContent]));
  assert.deepEqual(opts[0], ['all', 'All regions']);
  assert.deepEqual(opts[1], ['アジア', 'Asia']);
  await page.selectOption('#bregion', 'オセアニア');
  assert.equal((await page.textContent('#bcount')).trim(), '14 countries');
  assert.deepEqual(await jaLeft(page), []);
});

t('en_book_search_fold', async page => {
  await openBook(page);
  const search = async q => { await page.fill('#q', q); return cardNames(page); };
  assert.deepEqual(await search('sao tome'), ['São Tomé and Príncipe']);
  assert.equal((await page.textContent('#bcount')).trim(), '1 country');
  assert.deepEqual(await search('IVORY'), ['Ivory Coast']);
  assert.deepEqual(await search('tokyo'), ['Japan']);
  assert.deepEqual(await jaLeft(page), []);
});

t('en_book_detail', async page => {
  await openBook(page);
  await page.click('#grid .card[data-a="fr"]');
  await page.waitForSelector('#detail[open]');
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await page.locator('#detail .trivia').count(), 0);
  assert.equal(await page.getAttribute('#detail .cpage a', 'href'), 'en/country/fr.html');
  assert.equal(await page.evaluate(() => new URL(document.querySelector('#detail .cpage a').href).pathname), '/en/country/fr.html');
  assert.equal((await page.textContent('#detail .cpage a')).trim(), 'Country page ›');
  assert.equal(await page.getAttribute('#detail svg.map', 'aria-label'), 'Location of France');
  assert.equal((await page.textContent('#dclose')).trim(), 'Close');
});

// PC（≥900px）の詳細: 豆知識が無くても右の列が空かない（国の情報と［Country page］は左の列、地図は右の列）
t('en_book_detail_pc', async page => {
  await openBook(page);
  await page.click('#grid .card[data-a="fr"]');
  await page.waitForSelector('#detail[open]');
  const box = sel => page.locator(sel).boundingBox();
  const [facts, link, map] = [await box('#detail .facts'), await box('#detail .cpage a'), await box('#detail svg.map')];
  // リンクは国の情報の列の中で、国の情報のすぐ下
  assert.ok(link.x >= facts.x - 1 && link.x + link.width <= facts.x + facts.width + 1, JSON.stringify({ facts, link }));
  assert.ok(link.y >= facts.y + facts.height - 1 && link.y - (facts.y + facts.height) < 80, JSON.stringify({ facts, link }));
  // 地図は右の列で、国の情報と同じ高さのあたり（右の列が空いていない）
  assert.ok(map.x > facts.x + facts.width, JSON.stringify({ facts, map }));
  assert.ok(map.y < facts.y + facts.height && map.y + map.height > facts.y, JSON.stringify({ facts, map }));
  assert.ok(map.width > 400, JSON.stringify(map));
}, { viewport: PC });

t('en_book_map', async page => {
  await openBook(page, 'map');
  await page.waitForSelector('#bmapbox svg path[data-a]');
  assert.deepEqual(await jaLeft(page), []);
  assert.match(await page.getAttribute('#bmapbox svg', 'aria-label'), /^Map: World\./);
  await page.click('#bmapbox path[data-a="br"]');
  await page.waitForSelector('#binfo .facts');
  assert.equal((await page.textContent('#binfo .facts .name')).trim(), 'Brazil');
  assert.equal(await page.locator('#binfo .trivia').count(), 0);
  assert.equal(await page.getAttribute('#binfo .cpage a', 'href'), 'en/country/br.html');
  assert.deepEqual(await jaLeft(page), []);
  // 検索で1件なら選ばれる
  await page.fill('#q', 'ivory');
  assert.equal((await page.textContent('#binfo .facts .name')).trim(), 'Ivory Coast');
  assert.deepEqual(await jaLeft(page), []);
});

t('en_book_long_names_fit', async page => {
  await openBook(page);
  const r = await page.$eval('#grid .card[data-a="vc"]', el => {
    const b = el.getBoundingClientRect(), g = el.parentElement.getBoundingClientRect();
    return { sw: el.scrollWidth, cw: el.clientWidth, right: b.right, gright: g.right, doc: document.documentElement.scrollWidth, vw: innerWidth,
      name: [...el.children].map(c => c.scrollWidth <= c.clientWidth + 1) };
  });
  assert.ok(r.sw <= r.cw, JSON.stringify(r));
  assert.ok(r.right <= r.gright + 0.5, JSON.stringify(r));
  assert.ok(r.name.every(Boolean), JSON.stringify(r));
  assert.ok(r.doc <= r.vw, JSON.stringify(r));
});

// ---- 似た国旗の道場（dojo.js）。Task 9 ----
// 道場の画面に戻るまで、正解して［次へ］をくり返す（正解のたびに jaLeft を見る）
const clearDojo = async page => {
  for (let i = 0; i < 30 && await page.evaluate(() => document.body.dataset.screen === 'quiz'); i++) {
    await answerCorrect(page);
    assert.match(await page.innerText('.reveal .dj-compare'), /Correct[\s\S]*Look-alike/);
    assert.deepEqual(await jaLeft(page), [], 'right ' + i);
    await page.click('#next');
  }
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'dojo');
};

t('en_dojo', async page => {
  await openSetup(page);
  assert.equal((await page.innerText('#to-dojo')).trim(), '🔍 Look-alike Flags Dojo →');
  await page.click('#to-dojo');
  await page.waitForSelector('#scr-dojo:not([hidden])');
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await page.innerText('#scr-dojo h2')).trim(), 'Look-alike Flags Dojo');
  assert.deepEqual(await texts(page, '#dj-mode button'), ['Flag → Name', 'Name → Flag']);
  assert.equal(await page.getAttribute('.dj-card[data-g="qa"] img', 'alt'), 'Flag of Qatar');
  assert.equal((await page.innerText('.dj-card[data-g="qa"] .dj-label')).trim(), 'White zigzag');
  // 1問まちがえて、10問を遊ぶ
  await page.click('.dj-card[data-g="qa"]');
  await settle(page);
  assert.deepEqual(await jaLeft(page), []);
  await answerWrong(page);
  assert.match(await page.innerText('.reveal .dj-compare'), /Correct[\s\S]*You picked/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#next');
  await clearDojo(page);
  assert.equal((await page.innerText('#dj-last')).trim(), 'White zigzag: 9 / 10 right on the first try');
  assert.equal(await page.isVisible('#dj-pairs'), true);
  assert.equal((await page.innerText('#dj-pairs h3')).trim(), 'Often mixed-up pairs');
  assert.equal((await page.innerText('#dj-pairs .dj-pn')).trim(), 'Bahrain & Qatar');
  assert.equal((await page.innerText('#dj-pairs li b')).trim(), '1 time');
  assert.deepEqual(await jaLeft(page), []);
  // ノーミスでもう1回
  await page.click('.dj-card[data-g="qa"]');
  await clearDojo(page);
  assert.equal((await page.innerText('#dj-last')).trim(), 'White zigzag: 10 / 10 right on the first try. No mistakes!');
  assert.equal(await page.getAttribute('.dj-card[data-g="qa"] .dj-ok', 'aria-label'), 'Cleared with no mistakes');
  assert.deepEqual(await jaLeft(page), []);
  // 国名 → 国旗 でも日本語が残らない
  await page.click('#dj-mode [data-m="n2f"]');
  await page.click('.dj-card[data-g="no"]');
  await settle(page);
  assert.deepEqual(await jaLeft(page), []);
  await answerWrong(page);
  assert.deepEqual(await jaLeft(page), []);
});

// 英語版で遊んだ取りちがえは、日本語版の道場のペアに出る（同じ localStorage の dojo）
t('en_dojo_shared', async page => {
  await page.evaluate(() => show('dojo'));
  await page.click('.dj-card[data-g="qa"]');
  await answerWrong(page);
  await page.click('#quit');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.dojo).mix), { 'bh-qa': 1 });
  await page.goto(new URL('../', page.url()).href);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  await page.evaluate(() => show('dojo'));
  assert.equal((await page.innerText('#dj-pairs .dj-pn')).trim(), 'バーレーン・カタール');
  assert.equal((await page.innerText('#dj-pairs li b')).trim(), '1回');
  assert.equal((await page.innerText('#scr-dojo h2')).trim(), '似た国旗の道場');
});
