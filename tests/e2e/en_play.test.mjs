// 英語版（PR6）: 英語のページで遊ぶ機能（ランキング・プロフィール・引き継ぎ・…）。見えている日本語が無いこと（jaLeft）と、
// 記録・プロフィールは日本語版と同じものを使うこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, jaLeft, warned, mapLoaded, pickSetup, clearTimeAttack, answerCorrect, answerWrong, QUIET_BADGES, PHONE, PC } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const EN = { path: 'en/', locale: 'en-US', storage: { badges: QUIET_BADGES } };
// 英語版を開いて fn(page, app) を呼び、最後にページの例外と [i18n] の warn（辞書に無いキー）が無いかも見る
const t = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openApp(browser, { ...EN, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
async function until(cond, what) {
  for (let i = 0; i < 200; i++) { if (cond()) return; await new Promise(ok => setTimeout(ok, 20)); }
  assert.fail(`待ったけど来なかった: ${what}`);
}
// confirm は受けて、文を dialogs に積む
const acceptDialogs = page => { const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); }); return dialogs; };
// 出た知らせ（.toast）の文を window.__toasts に覚える
const watchToasts = page => page.evaluate(() => {
  window.__toasts = [];
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.textContent); })
    .observe(document.body, { childList: true, subtree: true });
});
const JA = /[　-ヿ㐀-鿿！-ﾟ]/;
const openProfile = async page => { await page.click('#home-profile'); await page.locator('#scr-profile:not([hidden])').waitFor(); };
// 偽DB と localStorage にプロフィールを入れて、英語版を開き直す
const PID = 'enpid0000001';
async function openWithProfile(page, db, { name = 'Chiko', token = 'tok-en', sent = { isPublic: true }, extra = {} } = {}) {
  db.profiles.push({ token, nickname: name, pid: PID, ...extra });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), { token, pid: PID, name, auto: true, isPublic: true, sent });
  await page.goto(new URL('en/', server.url).href);
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

// ホームの入口: ランキングとプロフィールは出る。冒険・バッジ（PR7・PR8）と今日の難問（Task 7）はまだ
for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) t(`en_home_entries_${vname}`, async page => {
  await page.waitForFunction(() => window.PROFILE);
  for (const id of ['home-rank', 'home-profile']) assert.equal(await page.isVisible('#' + id), true, id);
  for (const id of ['home-rpg', 'home-badges']) assert.equal(await page.isVisible('#' + id), false, id);
  assert.equal((await text(page, '#home-rank .hi-label')).trim(), 'Leaderboard');
  assert.equal((await text(page, '#home-profile .hi-label')).trim(), 'Profile');
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await noHScroll(page), true);
}, { viewport });

t('en_profile_create', async (page, { db }) => {
  await watchToasts(page);
  await openProfile(page);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await page.locator('#scr-profile h2').innerText()).trim(), 'Profile');
  // 注意書きのリンクは英語版のプライバシーポリシー
  const href = await page.locator('#pf-main .pf-name-note a').evaluate(a => new URL(a.href).pathname);
  assert.equal(href, '/en/privacy.html');
  assert.match(await text(page, '#pf-main .pf-name-note'), /^Don’t use your real name or your school’s name \(Privacy policy\)\.$/);
  // NG ワード
  await page.fill('#pf-name', 'Moderator1');
  await page.click('#pf-create');
  await page.locator('#pf-msg', { hasText: 'That nickname can’t be used' }).waitFor();
  assert.equal(db.profiles.length, 0);
  await page.fill('#pf-name', 'Chiko');
  await page.click('#pf-create');
  await page.locator('#pf-me').waitFor();
  assert.equal(db.profiles[0].nickname, 'Chiko');
  assert.equal(await page.locator('#pf-me .pf-card-name b[data-ugc]').innerText(), 'Chiko');
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual(await page.evaluate(() => window.__toasts.filter(s => /[぀-ヿ一-鿿]/.test(s))), []);
  assert.equal(await noHScroll(page), true);
});

t('en_profile_transfer', async (page, app) => {
  const { db } = app;
  const dialogs = acceptDialogs(page);
  await openWithProfile(page, db, { name: 'Chiko' });
  await page.evaluate(() => localStorage.setItem('rpg', '{"v":1,"coins":5}'));
  await openProfile(page);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#pf-tr-start');
  await page.locator('#pf-tr-code').waitFor();
  assert.equal(dialogs.length, 1);
  assert.doesNotMatch(dialogs[0], JA, dialogs[0]);
  const code = db.transfers[0].code;
  assert.equal(await text(page, '#pf-tr-code'), code.match(/.{4}/g).join('-'));
  // 期限はその人の時間で（ニューヨーク）、AM か PM
  const exp = await text(page, '#pf-tr-exp');
  assert.match(exp, /\b(AM|PM)\b/);
  const want = await page.evaluate(iso => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    .format(new Date(iso)).replace(/[  ]/g, ' '), db.transfers[0].expires_at);
  assert.ok(exp.includes(want), `${exp} / ${want}`);
  assert.deepEqual(await jaLeft(page), []);
  // 別の端末の英語版で受け取る
  const b = await openApp(browser, { ...EN });
  Object.assign(b.db.rpc, db.rpc);
  try {
    const bd = acceptDialogs(b.page);
    await b.page.waitForFunction(() => window.PROFILE);
    await watchToasts(b.page);
    await openProfile(b.page);
    // 全角のままの入力の案内
    await b.page.fill('#pf-tr-in', 'ＡＢＣあ');
    await b.page.click('#pf-tr-claim');
    await b.page.locator('#pf-tr-msg', { hasText: /\S/ }).waitFor();
    assert.deepEqual(await jaLeft(b.page), []);
    await b.page.fill('#pf-tr-in', code);
    await Promise.all([b.page.waitForEvent('load'), b.page.click('#pf-tr-claim')]);
    assert.doesNotMatch(bd[0], JA, bd[0]);
    await b.page.waitForFunction(() => window.PROFILE);
    await b.page.evaluate(() => PROFILE.ready);
    assert.equal((await stored(b.page, 'profile')).name, 'Chiko');
    assert.equal(await b.page.evaluate(() => localStorage.getItem('rpg')), '{"v":1,"coins":5}');
    await b.page.locator('.toast', { hasText: 'Chiko' }).waitFor();
    assert.deepEqual(await jaLeft(b.page), []);
    assert.deepEqual(b.errors.map(String), []);
  } finally { await b.close(); }
}, { timezoneId: 'America/New_York' });

// ほかの人の日本語の名前・称号: 名前はそのまま（data-ugc）、称号は出さない
t('en_card_other_ja', async (page, { db }) => {
  await page.waitForFunction(() => window.PROFILE);
  const board = await page.evaluate(() => RANKING.boardKey('f2n', 'all', 10));
  db.profiles.push({ id: 1, pid: 'otherpid0001', token: 'other', nickname: 'チコ', title: '旅人', deco: ['jp'], badges: 12, badges_total: 80, created_at: '2026-10-01T00:00:00Z' });
  const at = new Date().toISOString();
  db.rows.push({ board, profile_id: 1, nickname: 'チコ', time_ms: 12340, questions: 10, created_at: at },
    { board: 'n2f:asia:10', profile_id: 1, nickname: 'チコ', time_ms: 61230, questions: 10, created_at: at });
  db.rpgRows.push({ token: 'other', profile_id: 1, nickname: 'チコ', lv: 17, dungeons: 4, floors: 22, tower: 3, created_at: at, at });
  db.dailyRows.push({ day: '2026-10-26', profile_id: 1, nickname: 'チコ', correct: 5, total: 5, time_ms: 30000, created_at: at });
  await page.evaluate(b => openRanking(b), board);
  await page.locator('#rk-list .pf-name', { hasText: 'チコ' }).waitFor();
  assert.equal(await page.locator('#rk-list .pf-name').evaluate(e => !!e.closest('[data-ugc]')), true);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#rk-list .pf-name');
  const dlg = page.locator('#pf-card');
  await dlg.locator('.pf-card-line').first().waitFor();
  const s = await dlg.innerText();
  assert.match(s, /チコ/);
  assert.equal(await dlg.locator('.pf-card-name b[data-ugc]').innerText(), 'チコ');
  assert.doesNotMatch(s, /旅人/);
  assert.match(s, /Badges: 12 of 80/);
  assert.match(s, /Adventure: Lv 17 · Dungeons 4\/\d+/);
  assert.match(s, /Tower of Heroes: floor 3/);
  assert.match(s, /Time Attack/);
  assert.match(s, /Flag → Name · World · 10 questions\s+12\.34s \(#1\)/);
  assert.match(s, /Name → Flag · Asia · 10 questions\s+1:01\.23 \(#1\)/);
  assert.match(s, /Daily Puzzle: played once, 1 perfect/);
  assert.match(s, /Started Oct 1, 2026/);
  assert.equal(await dlg.locator('.rr-deco img').getAttribute('alt'), 'Japan');
  assert.deepEqual(await jaLeft(page), []);
  // 2回以上と、非公開
  db.dailyRows.push({ day: '2026-10-27', profile_id: 1, nickname: 'チコ', correct: 3, total: 5, time_ms: 40000, created_at: at });
  await page.evaluate(() => PROFILE.openCard('otherpid0001'));
  await dlg.locator('.pf-card-line', { hasText: 'played 2 times' }).waitFor();
  assert.match(await dlg.innerText(), /Daily Puzzle: played 2 times, 1 perfect/);
  db.profiles[0].is_public = false;
  await page.evaluate(() => PROFILE.openCard('otherpid0001'));
  await dlg.locator('.pf-card', { hasText: 'This profile is private' }).waitFor();
  assert.deepEqual(await jaLeft(page), []);
  await dlg.locator('button', { hasText: 'Close' }).click();
});

// 日本語版でつけた称号・バッジの数を、英語版の同期が消さない（英語版は badges.js を読まない）
t('en_sync_keeps_title', async (page, { db }) => {
  // 日本語版で称号とバッジの数を送ったあとの状態
  await openWithProfile(page, db, { sent: { isPublic: true, title: '旅人', badges: 12, badgesTotal: 80 }, extra: { title: '旅人', badges: 12, badges_total: 80 } });
  await openProfile(page);
  assert.deepEqual(await jaLeft(page), []);
  // 公開を切りかえて同期を走らせる
  await page.click('#pf-public');
  await until(() => db.profiles[0].is_public === false, 'is_public false');
  await page.evaluate(() => new Promise(ok => setTimeout(ok, 1800)));   // scheduleSync の後
  const sets = db.calls.filter(c => c.name === 'profile_set');
  assert.ok(sets.length >= 1);
  for (const c of sets) {
    assert.equal(c.args.p_title, null);
    assert.equal(c.args.p_badges, null);
    assert.equal(c.args.p_badges_total, null);
  }
  assert.equal(db.profiles[0].title, '旅人');
  assert.equal(db.profiles[0].badges, 12);
  assert.equal(db.profiles[0].badges_total, 80);
  // 自分のカードにも称号は出さない（英語版）
  assert.doesNotMatch(await text(page, '#pf-me'), /旅人/);
});

/* ---------- タイムアタックとランキング（Task 5） ---------- */
const picked = (page, id) => page.$$eval(`#${id} [aria-pressed="true"]`, bs => bs.map(b => Object.values(b.dataset)[0]));
const conds = async page => [await picked(page, 'rk-modes'), await picked(page, 'rk-regions'), await picked(page, 'rk-counts')];
const rkRows = async (page, n) => {
  await page.waitForFunction(n => document.querySelectorAll('#rk-list li').length === n && document.querySelector('#rk-list').getAttribute('aria-busy') === 'false', n);
  return page.locator('#rk-list li').allInnerTexts();
};
const record = (board, nickname, time_ms, created_at = new Date()) => ({ board, nickname, time_ms, questions: 5, created_at: created_at.toISOString() });

// 英語でタイムアタックをクリア → 順位相当・自動で載る・［View leaderboard］で同じ条件の表に自分
t('en_time_attack', async (page, { db }) => {
  await openWithProfile(page, db, { name: 'Chiko' });
  await mapLoaded(page);
  await clearTimeAttack(page, { mode: 'f2n', region: 'アジア', count: 5 });
  assert.match(await text(page, '#ta-time'), /^\d/);
  assert.equal(await text(page, '#ta-time'), await page.evaluate(() => RANKING.formatTime(G.timeMs)));
  await page.locator('#ta-post .tamsg', { hasText: 'Posted!' }).waitFor();
  assert.equal(await text(page, '#ta-post .tamsg'), 'Posted! #1 all time · #1 this week');
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].board, 'f2n:asia:5');
  assert.equal(db.rows[0].nickname, 'Chiko');
  assert.deepEqual(await jaLeft(page), []);
  await page.locator('#ta-open').waitFor();
  assert.equal(await text(page, '#ta-open'), 'View leaderboard');
  await page.click('#ta-open');
  assert.equal(await page.isVisible('#scr-ranking'), true);
  assert.deepEqual(await conds(page), [['f2n'], ['アジア'], ['5']]);
  const [r] = await rkRows(page, 1);
  assert.match(r, /^1\s+Chiko\s+\S+s\s+[A-Z][a-z]{2} \d{1,2}$/);
  assert.equal(await page.locator('#rk-list li.me').count(), 1);
  assert.deepEqual(await jaLeft(page), []);
});

// プロフィールが無いときの順位相当の文
t('en_ta_rank_text', async (page, { db }) => {
  db.rows.push(record('f2n:all:5', 'はやい', 1));
  await clearTimeAttack(page);
  await page.locator('#ta-rank', { hasText: 'Would rank' }).waitFor();
  assert.equal(await text(page, '#ta-rank'), 'Would rank #2 all time · #2 this week');
  assert.deepEqual(await jaLeft(page), []);
});

// 1問まちがえて終わり → 文は英語
t('en_ta_fail', async page => {
  await pickSetup(page, { mode: 'f2n', region: 'all', count: 5, kind: 'ta' });
  await page.click('#start');
  await answerCorrect(page);
  await answerWrong(page);
  assert.match(await text(page, '.reveal'), /^Disqualified… The answer is .+\./);
  assert.equal(await text(page, '#next'), 'Play again');
  assert.equal(await page.locator('.reveal .btn.ghost', { hasText: 'Change mode' }).count(), 1);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('.reveal .btn.ghost');
  assert.equal(await page.isVisible('#scr-setup'), true);
});

// en/#ranking で表が開く。条件の切りかえ・今週の区切り（ニューヨークの時間で添える）・［Play with these settings］
t('en_leaderboard', async (page, { db }) => {
  const B = 'f2n:all:10';
  db.rows.push({ ...record(B, 'Old', 5000, new Date(Date.now() - 8 * 864e5)), questions: 10 }, { ...record(B, 'New', 6000), questions: 10 });
  await page.goto(new URL('en/#ranking', server.url).href);
  await page.reload();   // hash だけの移動では読み直さない
  await page.locator('#scr-ranking:not([hidden])').waitFor();
  assert.equal((await text(page, '#scr-ranking h2')).trim(), 'Leaderboard');
  assert.deepEqual(await page.locator('#rk-tabs button').allInnerTexts(), ['All time', 'This week']);
  assert.match((await rkRows(page, 2))[0], /^1\s+Old\s+5\.00s\s+[A-Z][a-z]{2} \d{1,2}$/);
  // 今週の区切りを、その人の時間で
  const want = await page.evaluate(() => I18N.localOf(0, 0, { weekly: true }));
  assert.match(want, /^(Sunday|Monday) \d{1,2}:00 (AM|PM)$/);
  assert.equal(await page.isVisible('#rk-local'), true);
  assert.equal(await text(page, '#rk-local'), `That’s ${want} your time.`);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#rk-tabs [data-p="week"]');
  assert.match((await rkRows(page, 1))[0], /^1\s+New\s/);
  await page.click('#rk-modes [data-k="m2f"]');
  await page.click('#rk-regions [data-r="ヨーロッパ"]');
  await page.click('#rk-counts [data-c="5"]');
  assert.deepEqual(await conds(page), [['m2f'], ['ヨーロッパ'], ['5']]);
  await page.locator('#rk-empty:not([hidden])').waitFor();
  assert.equal(await text(page, '#rk-empty'), 'No one here yet. Grab the top spot!');
  assert.deepEqual(await page.locator('#rk-modes .chip').allInnerTexts().then(a => a.filter(s => JA.test(s))), []);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await noHScroll(page), true);
  await page.click('#rk-play');
  assert.equal(await page.isVisible('#scr-setup'), true);
  assert.deepEqual(await picked(page, 'kinds'), ['ta']);
  assert.deepEqual(await picked(page, 'modes'), ['m2f']);
  assert.deepEqual(await picked(page, 'regions'), ['ヨーロッパ']);
  assert.deepEqual(await picked(page, 'counts'), ['5']);
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'America/New_York' });

// 東京では添えない
t('en_leaderboard_tokyo', async page => {
  await page.locator('#scr-ranking:not([hidden])').waitFor();
  await page.waitForFunction(() => $('rk-list').getAttribute('aria-busy') === 'false');
  assert.equal(await page.evaluate(() => I18N.localOf(0, 0, { weekly: true })), '');
  assert.equal(await page.isHidden('#rk-local'), true);
  assert.equal(await text(page, '#scr-ranking .hint:not(#rk-local)'), 'Top 50 players, personal bests only. “This week” starts at midnight Monday, Japan time.');
}, { timezoneId: 'Asia/Tokyo', path: 'en/#ranking' });

// ほかの人の日本語の名前はそのまま。日付は日本時間の日付を英語の形で
t('en_leaderboard_ja_names', async (page, { db }) => {
  const B = 'f2n:all:10';
  db.rows.push(
    { ...record(B, 'チコ', 7000, new Date('2026-10-30T03:00:00Z')), questions: 10 },
    { ...record(B, 'たろう', 61234, new Date('2026-01-02T15:30:00Z')), questions: 10 },   // 日本時間では 1/3
  );
  await page.evaluate(() => openRanking('f2n:all:10'));
  const r = await rkRows(page, 2);
  assert.match(r[0], /^1\s+チコ\s+7\.00s\s+Oct 30$/);
  assert.match(r[1], /^2\s+たろう\s+1:01\.23\s+Jan 3$/);
  for (const n of ['チコ', 'たろう']) assert.equal(await page.locator('#rk-list .nick [data-ugc]', { hasText: n }).count(), 1, n);
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'America/New_York' });

// 英語で載せた記録が、同じ端末の日本語版のランキングにも出る
t('en_ta_shared', async (page, { db }) => {
  await openWithProfile(page, db, { name: 'Chiko' });
  await mapLoaded(page);
  await clearTimeAttack(page, { mode: 'f2n', region: 'アジア', count: 5 });
  await page.locator('#ta-post .tamsg', { hasText: 'Posted!' }).waitFor();
  await page.goto(new URL('#ranking', server.url).href);
  await page.locator('#scr-ranking:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.deepEqual(await conds(page), [['f2n'], ['アジア'], ['5']]);
  const [r] = await rkRows(page, 1);
  assert.match(r, /^1\s+Chiko\s+\S+秒\s+\d+\/\d+$/);
  assert.equal(await page.locator('#rk-list li.me').count(), 1);
  // 日本語版には、その人の時間の添え書きを出さない（ニューヨークでも）
  assert.equal(await page.isHidden('#rk-local'), true);
}, { timezoneId: 'America/New_York' });

// 英語版のランキングで「日本語」→ 日本語版のランキング
t('langsw_keeps_ranking', async page => {
  await page.click('#home-rank');
  await page.locator('#scr-ranking:not([hidden])').waitFor();
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), './#ranking');
  await page.click('#topbar .langsw a');
  await page.waitForURL(u => new URL(u).pathname === '/' && new URL(u).hash === '#ranking');
  await page.locator('#scr-ranking:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.equal(await text(page, '#scr-ranking h2'), 'ランキング');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), 'en/#ranking');
});
