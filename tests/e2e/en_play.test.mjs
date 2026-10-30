// 英語版（PR6）: 英語のページで遊ぶ機能（ランキング・プロフィール・引き継ぎ・…）。見えている日本語が無いこと（jaLeft）と、
// 記録・プロフィールは日本語版と同じものを使うこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { settleLayout, measureFit } from './layout.mjs';
import { startServer, openApp, jaLeft, warned, mapLoaded, pickSetup, clearTimeAttack, clearByAnswering, answerCorrect, answerWrong, QUIET_BADGES, PHONE, PC } from './helpers.mjs';

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

// ホームの入口: ランキング・プロフィール・今日の難問は出る。冒険・バッジ（PR7・PR8）はまだ
for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) t(`en_home_entries_${vname}`, async page => {
  await page.waitForFunction(() => window.PROFILE);
  for (const id of ['home-rank', 'home-profile', 'home-daily']) assert.equal(await page.isVisible('#' + id), true, id);
  assert.match(await text(page, '#home-daily'), /^Daily Puzzle\s+A new puzzle every day\. Compete with other players\.\s+\d{1,2}\/\d{1,2}\s*NEW$/);
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

// 冒険（PR8）が無いあいだ、英語版のプロフィール画面にかざりの欄は出さない。はじめの文も冒険のランキングを約束しない
t('en_profile_no_decorations', async (page, { db }) => {
  await openProfile(page);
  assert.equal(await text(page, '#pf-main .pf-lead'), 'With a profile, your name appears on the Time Attack and Daily Puzzle leaderboards.');
  assert.doesNotMatch(await text(page, '#pf-main'), /Adventure/);
  await openWithProfile(page, db);
  await openProfile(page);
  await page.locator('#pf-me').waitFor();
  assert.deepEqual(await page.locator('#pf-main .field > .lbl').allInnerTexts(), ['Change nickname', 'Settings']);
  assert.doesNotMatch(await text(page, '#pf-main'), /Decorations|Adventure/);
  assert.deepEqual(await jaLeft(page), []);
});

// 日本語のニックネームで載せた知らせ（結果の「載せる」箱）: 名前は data-ugc の中、ほかは英語
t('en_post_ja_name', async (page, { db }) => {
  await openWithProfile(page, db, { name: 'チコ' });
  await mapLoaded(page);
  await startDailyEn(page);
  await answerWrong(page);
  await page.click('#next');
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.equal(await text(page, '#dl-post .tamsg'), 'Posted as チコ! #1 today');
  assert.equal(await page.locator('#dl-post .tamsg [data-ugc]').innerText(), 'チコ');
  assert.deepEqual(await jaLeft(page), []);
  // 自動で載せないとき: ［Post as チコ］の名前も data-ugc
  await page.evaluate(() => PROFILE.setAuto(false));
  await page.evaluate(() => show('home'));
  await clearTimeAttack(page);
  await page.locator('#ta-post [data-pf="send"] [data-ugc]', { hasText: 'チコ' }).waitFor();
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#ta-post [data-pf="send"]');
  await page.locator('#ta-post .tamsg.ok').waitFor();
  assert.deepEqual(await jaLeft(page), []);
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

/* ---------- 今日の難問（Task 7） ---------- */
// 時計を決まった時刻にする（daily.test.mjs の at と同じ）
const at = iso => `{ const off = Date.parse('${iso}') - Date.now(), D = Date;
  globalThis.Date = class extends D { constructor(...a) { super(...(a.length ? a : [D.now() + off])); } static now() { return D.now() + off; } }; }`;
const dToday = page => page.evaluate(() => DAILY.today());
const dRec = page => stored(page, 'daily');
const dlRows = async (page, n) => {
  await page.waitForFunction(n => document.querySelectorAll('#dl-list li').length === n && $('dl-list').getAttribute('aria-busy') === 'false', n);
  return page.locator('#dl-list li').allInnerTexts();
};
const startDailyEn = async page => { await page.click('#home-daily'); await page.click('#dl-start'); await page.locator('#scr-quiz').waitFor(); await page.waitForFunction(() => G?.cur); };

// ホーム → 説明 → 3問正解・1問まちがい → 結果・答えの一覧（英語の国名）・自動で載る → ホームは Done
t('en_daily_play', async (page, { db }) => {
  await openWithProfile(page, db, { name: 'Chiko' });
  await mapLoaded(page);
  const day = await dToday(page);
  const md = day.split('-').slice(1).map(Number).join('/');
  assert.match(await text(page, '#home-daily .hb-note'), new RegExp(`^${md}\\s*NEW$`));
  await page.click('#home-daily');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  assert.equal((await text(page, '#scr-daily h2')).trim(), 'Daily Puzzle');
  assert.equal(await text(page, '#dl-date'), await page.evaluate(d => I18N.dayLabel(d), day));
  assert.match(await text(page, '#dl-date'), /^[A-Z][a-z]{2} \d{1,2}$/);
  assert.match(await text(page, '#dl-main .dl-lead'), /^A new set of 20 questions every day at midnight Japan time.*\. You can play only once a day\.$/);
  assert.equal(await text(page, '#dl-start'), 'Take the challenge');
  assert.deepEqual(await page.locator('#dl-tabs button').allInnerTexts(), ['Today', 'Yesterday']);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#dl-start');
  await page.locator('#scr-quiz').waitFor();
  await page.waitForFunction(() => G?.cur);
  for (let i = 0; i < 3; i++) await answerCorrect(page);
  await answerWrong(page);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#next');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  assert.equal(await text(page, '#dl-main .qlabel'), 'Game over!');
  assert.match(await text(page, '#dl-main .score'), /^3\s*\/ 20 correct$/);
  assert.match(await text(page, '#dl-main'), /Time \S+/);
  assert.match(await text(page, '#dl-next'), /^Next puzzle in \d+h \d+m$/);
  // 答えの一覧: とどいた4問、国名は英語
  const qs = await page.evaluate(d => DAILY.questions(d).slice(0, 4).map(q => byA.get(q.a).e), day);
  assert.deepEqual(await page.locator('#dl-main .dl-qs li b').allInnerTexts(), qs);
  assert.equal(await page.locator('#dl-main .dl-ans summary').innerText(), 'Today’s questions and answers');
  assert.match(await text(page, '#dl-main .dl-ans .hint'), /^You can see the rest tomorrow on the “Yesterday” tab\.$/);
  for (const m of await page.locator('#dl-main .dl-qs .dl-mode').allInnerTexts()) assert.match(m, /^(Flag|Name|Location) → (Flag|Name|Location) ★{1,3}$/);
  // 自動で載る
  await page.locator('#dl-post .tamsg.ok').waitFor();
  assert.equal(await text(page, '#dl-post .tamsg'), 'Posted as Chiko! #1 today');
  assert.equal(db.dailyRows.length, 1);
  assert.deepEqual([db.dailyRows[0].day, db.dailyRows[0].nickname, db.dailyRows[0].correct], [day, 'Chiko', 3]);
  assert.match((await dlRows(page, 1))[0], /^1\s+Chiko\s+3 correct\s+\S+$/);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await noHScroll(page), true);
  // 開き直すと「載せたとき」の順位と、載せた名前（data-ugc）
  await page.click('#brand');
  assert.match(await text(page, '#home-daily .hb-note'), new RegExp(`^${md}\\s*Done$`));
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-rank'), '#1 today (when posted)');
  assert.equal(await text(page, '#dl-main .tamsg.ok'), 'Posted as Chiko!');
  assert.equal(await page.locator('#dl-main .tamsg.ok [data-ugc]').innerText(), 'Chiko');
  assert.deepEqual(await jaLeft(page), []);
});

// その人の時間を添える: ニューヨークでは 0時（日本時間）= 11:00 AM（2026-10-30 は夏時間）、0時30分 = 11:30 AM
t('en_daily_local_time', async page => {
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-main .dl-lead'),
    'A new set of 20 questions every day at midnight Japan time (11:00 AM your time). You can play only once a day.');
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'America/New_York', init: at('2026-10-30T03:00:00Z') });

t('en_daily_local_time_yesterday', async page => {
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-main .dl-result > .hint:first-child'),
    'Yesterday’s (Oct 29) result. You can post it until 12:30 AM Japan time (11:30 AM your time).');
  assert.equal(await text(page, '#dl-main .dl-ans summary'), 'Yesterday’s questions and answers');
  assert.equal(await text(page, '#dl-start'), 'Play today’s puzzle');
  await page.locator('#dl-rank', { hasText: 'Would rank' }).waitFor();
  assert.equal(await text(page, '#dl-rank'), 'Would rank #1 yesterday');
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'America/New_York', init: at('2026-10-29T15:10:00Z'),
  storage: { badges: QUIET_BADGES, daily: { day: '2026-10-29', sid: 'x', status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null } } });

// 東京では添えない（ほかの文は同じ）
t('en_daily_local_time_tokyo', async page => {
  await page.click('#home-daily');
  const lead = await text(page, '#dl-main .dl-lead');
  assert.equal(lead, 'A new set of 20 questions every day at midnight Japan time. You can play only once a day.');
  assert.doesNotMatch(lead, /your time/);
}, { timezoneId: 'Asia/Tokyo', init: at('2026-10-30T03:00:00Z') });

t('en_daily_local_time_tokyo_yesterday', async page => {
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-main .dl-result > .hint:first-child'), 'Yesterday’s (Oct 29) result. You can post it until 12:30 AM Japan time.');
}, { timezoneId: 'Asia/Tokyo', init: at('2026-10-29T15:10:00Z'),
  storage: { badges: QUIET_BADGES, daily: { day: '2026-10-29', sid: 'x', status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null } } });

// ほかの人の日本語の名前はそのまま（data-ugc）。全問正解は Perfect、ほかは {n} correct。昨日のタブの問題と答えは英語
t('en_daily_board', async (page, { db }) => {
  await page.waitForFunction(() => window.PROFILE);
  const day = await dToday(page), yday = await page.evaluate(d => DAILY_CORE.addDays(d, -1), day);
  const at = new Date().toISOString();
  db.profiles.push({ id: 1, pid: 'otherpid0001', token: 'other', nickname: 'チコ', title: '旅人' });
  db.dailyRows.push({ day, profile_id: 1, nickname: 'チコ', correct: 20, total: 20, time_ms: 83400, created_at: at },
    { day, nickname: 'たろう', correct: 7, total: 20, time_ms: 30000, created_at: at },
    { day: yday, nickname: 'はなこ', correct: 1, total: 20, time_ms: 5000, created_at: at });
  await page.click('#home-daily');
  const r = await dlRows(page, 2);
  assert.match(r[0], /^1\s+チコ\s+Perfect\s+1:23\.40$/);
  assert.match(r[1], /^2\s+たろう\s+7 correct\s+30\.00s$/);
  for (const n of ['チコ', 'たろう']) assert.equal(await page.locator('#dl-list .nick [data-ugc]', { hasText: n }).count(), 1, n);
  assert.doesNotMatch(await text(page, '#dl-list'), /旅人/);
  assert.equal(await text(page, '#dl-tabs + .hint'),
    'Top 50 players. Perfect runs rank first by time, then everyone else by most correct answers (faster time breaks ties).');
  assert.deepEqual(await jaLeft(page), []);
  // 昨日
  await page.click('#dl-tabs [data-t="yday"]');
  assert.match((await dlRows(page, 1))[0], /^1\s+はなこ\s+1 correct\s+5\.00s$/);
  const want = await page.evaluate(d => I18N.dayLabel(d), yday);
  assert.equal(await text(page, '#dl-answers summary'), `Yesterday’s (${want}) questions and answers`);
  await page.click('#dl-answers summary');
  const names = await page.evaluate(d => DAILY.questions(d).map(q => byA.get(q.a).e), yday);
  assert.deepEqual(await page.locator('#dl-answers .dl-qs li b').allInnerTexts(), names);
  assert.deepEqual(await jaLeft(page), []);
  // 空の日
  db.dailyRows.length = 0;
  await page.click('#dl-tabs [data-t="today"]');
  await page.locator('#dl-empty:not([hidden])').waitFor();
  assert.equal(await text(page, '#dl-empty'), 'No one here yet. Grab the top spot!');
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'America/New_York' });

// profile.js が無いときの表の名前も data-ugc
t('en_daily_board_no_profile', async (page, { db }) => {
  const day = await dToday(page);
  db.dailyRows.push({ day, nickname: 'たろう', correct: 7, total: 20, time_ms: 30000, created_at: new Date().toISOString() });
  await page.click('#home-daily');
  await dlRows(page, 1);
  assert.equal(await page.locator('#dl-list .nick [data-ugc]', { hasText: 'たろう' }).count(), 1);
  assert.deepEqual(await jaLeft(page), []);
}, { blockScripts: ['profile.js'] });

// profile.js が無いときの「読み直して」の文
t('en_daily_reload_note', async page => {
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-main .tamsg.ng'), 'To post to the leaderboard, please reload the page.');
  assert.deepEqual(await jaLeft(page), []);
}, { init: at('2026-10-30T03:00:00Z'), blockScripts: ['profile.js'],
  storage: { badges: QUIET_BADGES, daily: { day: '2026-10-30', sid: 'x', status: 'done', outcome: 'fail', correct: 5, timeMs: 9000, sent: null } } });

// 英語で挑戦した結果が、同じ端末の日本語版の今日の難問に「挑戦ずみ」で出る。日本語版からは挑戦できない
t('en_daily_shared', async page => {
  await startDailyEn(page);
  await answerCorrect(page);
  await answerWrong(page);
  await page.click('#next');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  const r = await dRec(page);
  assert.deepEqual([r.status, r.correct, r.outcome], ['done', 1, 'fail']);
  await page.goto(new URL('./', server.url).href);
  await mapLoaded(page);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.match(await text(page, '#home-daily .hb-note'), /挑戦ずみ/);
  await page.click('#home-daily');
  assert.equal(await page.locator('#dl-start').count(), 0);
  assert.match(await text(page, '#dl-main'), /ここまで！/);
  assert.match(await text(page, '#dl-main'), /1\s*\/ 20 問正解/);
  assert.deepEqual(await dRec(page), r);
}, { timezoneId: 'America/New_York' });

// ［Share result］の文（share-card.js が読めないとき・画像を作り終わる前とも、文は同じ）
const stubShareEn = `{ Object.defineProperty(navigator, 'share', { configurable: true, value: o => { window.__shared = o; return Promise.resolve(); } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false }); window.open = () => null; }`;
// 画像を作り終わらないようにする（文と URL のシェアになる）
const holdBlobEn = `{ HTMLCanvasElement.prototype.toBlob = function () {}; }`;
const DONE10 = { day: '2026-10-30', sid: 'x', status: 'done', outcome: 'fail', correct: 12, timeMs: 83400, sent: null };
for (const [name, extra] of [['en_daily_share_text', { hold: holdBlobEn }], ['en_daily_share_text_no_card', { blockScripts: ['share-card.js'] }]]) t(name, async page => {
  await page.click('#home-daily');
  assert.equal(await text(page, '#dl-share'), 'Share result');
  await page.click('#dl-share');
  await page.waitForFunction(() => window.__shared);
  const s = await page.evaluate(() => __shared);
  assert.equal(s.text, 'Flag Master Daily Puzzle 10/30\n' + '🟩'.repeat(12) + '🟥' + '⬜'.repeat(7) + '\n12 / 20 correct\n#FlagMaster');
  assert.doesNotMatch(s.text, JA);
  const names = await page.evaluate(() => DAILY.questions('2026-10-30').flatMap(q => { const c = byA.get(q.a); return [c.n, c.e]; }));
  for (const n of names) assert.ok(!s.text.includes(n), n);
  assert.match(s.url, /\/en\/$/);
}, { init: at('2026-10-30T03:00:00Z') + stubShareEn + (extra.hold ?? ''), storage: { badges: QUIET_BADGES, daily: DONE10 }, blockScripts: extra.blockScripts });

// 全問正解の文
t('en_daily_share_text_clear', async page => {
  await page.click('#home-daily');
  await page.click('#dl-share');
  await page.waitForFunction(() => window.__shared);
  assert.equal(await page.evaluate(() => __shared.text), 'Flag Master Daily Puzzle 10/30\n' + '🟩'.repeat(20) + '\nPerfect! 1:23.40\n#FlagMaster');
}, { init: at('2026-10-30T03:00:00Z') + stubShareEn + holdBlobEn, storage: { badges: QUIET_BADGES, daily: { ...DONE10, correct: 20, outcome: 'clear' } } });

// 英語版の今日の難問で「日本語」→ 日本語版の今日の難問。日本語版の切りかえは en/#daily
t('langsw_keeps_daily', async page => {
  await page.click('#home-daily');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), './#daily');
  await page.click('#topbar .langsw a');
  await page.waitForURL(u => new URL(u).pathname === '/' && new URL(u).hash === '#daily');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.equal(await text(page, '#scr-daily h2'), '今日の難問');
  assert.equal(await page.locator('#topbar .langsw a').getAttribute('href'), 'en/#daily');
  await page.click('#topbar .langsw a');
  await page.waitForURL(u => new URL(u).pathname === '/en/' && new URL(u).hash === '#daily');
  await page.locator('#scr-daily:not([hidden])').waitFor();
  assert.equal(await text(page, '#scr-daily h2'), 'Daily Puzzle');
});

/* ---------- れんぞく日数（Task 8）: 日付は日本時間の0時で変わる（英語の画面でだけ、その人の時間を添える） ---------- */
// 時計は日本時間 2026-10-28（水）12:00（streak.test.mjs と同じ）。週は 10/26 月〜11/1 日。ニューヨークでは 10/27 23:00
const SK_NOON = at('2026-10-28T03:00:00Z');
const SK = (o = {}) => ({ v: 1, cur: 5, best: 12, last: '2026-10-27', played: ['2026-10-27'], rest: [], ...o });
const skText = page => text(page, '#streak .sk-text');
const skHint = async page => ((await page.locator('#streak .sk-hint').textContent()) ?? '').trim();
const skLabels = page => page.$$eval('#streak .sk-day', es => es.map(e => e.getAttribute('aria-label')));
const skPractice = async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await clearByAnswering(page);
  await page.evaluate(() => show('home'));
};
// 小窓（.narrow のとき）を開く。広い幅では7マスがはじめから見えている
const skOpen = async page => {
  if (await page.isVisible('#streak .sk-open')) await page.click('#streak .sk-open');
  await page.locator('#streak .sk-week').waitFor();
};

// 練習5問 → ホーム: 1-day streak・1 rest pass。7マスは行に見えていて（英語の曜日）、その下の1行に
// ニューヨークの時間で何時に日付が変わるか（押さなくても見える）
const TZ_NOTE = 'Days change at midnight Japan time (11:00 AM your time).';
t('en_streak_ny', async page => {
  assert.equal(await page.getAttribute('#streak', 'aria-label'), 'Day streak');
  assert.equal(await skText(page), '🔥 0-day streak · 1 rest pass');
  assert.equal(await skHint(page), 'Play today to start a streak');
  await skPractice(page);
  assert.equal((await stored(page, 'streak')).last, '2026-10-28');   // 日本時間の日付（ニューヨークではまだ 10/27）
  assert.equal(await skText(page), '🔥 1-day streak · 1 rest pass');
  assert.equal(await skHint(page), '');
  assert.equal(await page.$eval('#streak', e => e.classList.contains('narrow')), false);
  assert.equal(await page.isVisible('#streak .sk-open'), false);
  assert.equal(await page.isVisible('#streak .sk-week'), true);
  assert.equal(await page.getAttribute('#streak .sk-week', 'aria-label'), 'This week (Mon–Sun)');
  assert.deepEqual(await skLabels(page), ['Mon, Oct 26: Missed', 'Tue, Oct 27: Missed', 'Wed, Oct 28: Played', 'Thu, Oct 29', 'Fri, Oct 30', 'Sat, Oct 31', 'Sun, Nov 1']);
  assert.equal(await page.isVisible('#streak .sk-tz'), true);
  assert.equal(await text(page, '#streak .sk-tz'), TZ_NOTE);
  // 行（7マス）の下の1行
  const [sub, tz] = await page.evaluate(() => ['.sk-sub', '.sk-tz'].map(s => document.querySelector('#streak ' + s).getBoundingClientRect().toJSON()));
  assert.ok(tz.top >= sub.bottom - 1, `添え書きが行の下に無い ${JSON.stringify({ sub, tz })}`);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await noHScroll(page), true);
}, { timezoneId: 'America/New_York', init: SK_NOON });

// ニューヨークの時間で、スマホ・PC のどの幅でも、添え書きの行ははみ出さず、ホームを横にも（PC では縦にも）スクロールさせない
t('en_streak_note_fits', async page => {
  for (const [width, height] of [[320, 640], [390, 844], [1024, 768], [1280, 800], [1366, 657], [1280, 577]]) {
    await page.setViewportSize({ width, height });
    await settleLayout(page);
    const f = await page.$eval('#streak', e => ({ narrow: e.classList.contains('narrow'), over: e.scrollWidth > e.clientWidth,
      tz: e.querySelector('.sk-tz').checkVisibility(), right: e.querySelector('.sk-tz').getBoundingClientRect().right }));
    const at = `${width}x${height}: ${JSON.stringify(f)}`;
    assert.equal(f.narrow, false, at);
    assert.equal(f.over, false, at);
    assert.equal(f.tz, true, at);
    assert.ok(f.right <= width, at);
    const fit = await measureFit(page);
    assert.equal(fit.hscroll, false, at);
    if (width >= 1024) assert.ok(fit.docH <= fit.ih, `${at}: 縦にスクロールする ${fit.docH}/${fit.ih}`);
  }
}, { timezoneId: 'America/New_York', init: SK_NOON, storage: { badges: QUIET_BADGES, streak: SK() } });

// 収まらない（大きな数・320）ときは小窓: 添え書きは閉じているあいだは出さず、開くと7マスの下
t('en_streak_popup_320', async page => {
  assert.equal(await page.$eval('#streak', e => e.classList.contains('narrow')), true);
  assert.equal(await page.isVisible('#streak .sk-tz'), false);
  assert.equal(await text(page, '#streak .sk-open'), 'This week');
  await skOpen(page);
  assert.equal(await page.isVisible('#streak .sk-tz'), true);
  assert.equal(await text(page, '#streak .sk-tz'), TZ_NOTE);
  assert.equal(await page.$eval('#streak .sk-tz', e => e.parentElement.classList.contains('sk-pop')), true);
  const [w, vw] = await page.evaluate(() => [document.querySelector('#streak .sk-pop').getBoundingClientRect().toJSON(), innerWidth]);
  assert.ok(w.left >= 0 && w.right <= vw, `小窓が画面の外 ${JSON.stringify(w)}`);
  assert.equal(await noHScroll(page), true);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#streak .sk-open');
  assert.equal(await page.isVisible('#streak .sk-tz'), false);
}, { timezoneId: 'America/New_York', init: SK_NOON, viewport: { width: 320, height: 640 }, storage: { badges: QUIET_BADGES, streak: SK({ cur: 9999, best: 99999 }) } });

// 東京では添えない（7マスは日本語版と同じく、収まればはじめから見える）
t('en_streak_tokyo', async page => {
  assert.equal(await page.$eval('#streak', e => e.classList.contains('narrow')), false);
  assert.equal(await page.isVisible('#streak .sk-week'), true);
  assert.equal(await page.isVisible('#streak .sk-open'), false);
  assert.equal(await page.isVisible('#streak .sk-tz'), false);
  assert.equal(((await page.locator('#streak').textContent()) ?? '').includes('your time'), false);
  assert.deepEqual(await skLabels(page), ['Mon, Oct 26: Missed', 'Tue, Oct 27: Played', 'Wed, Oct 28: Today', 'Thu, Oct 29', 'Fri, Oct 30', 'Sat, Oct 31', 'Sun, Nov 1']);
  assert.deepEqual(await jaLeft(page), []);
}, { timezoneId: 'Asia/Tokyo', init: SK_NOON, storage: { badges: QUIET_BADGES, streak: SK() } });

// 今日あそぶと続く・最高・券の印
t('en_streak_keep', async page => {
  assert.equal(await skText(page), '🔥 5-day streak (best 12) · 1 rest pass');
  assert.equal(await skHint(page), 'Play today to reach 6 days!');
  assert.deepEqual(await page.$$eval('#streak .sk-text b', es => es.map(e => e.textContent)), ['5', '12', '1']);
  assert.deepEqual(await jaLeft(page), []);
}, { init: SK_NOON, storage: { badges: QUIET_BADGES, streak: SK() } });

t('en_streak_rest', async page => {
  assert.equal(await skText(page), '🔥 5-day streak (best 12) · 0 rest passes');
  assert.equal(await skHint(page), 'Yesterday was covered by a rest pass');
  await skOpen(page);
  assert.deepEqual((await skLabels(page)).slice(0, 3), ['Mon, Oct 26: Played', 'Tue, Oct 27: Rest pass', 'Wed, Oct 28: Today']);
  assert.deepEqual(await jaLeft(page), []);
}, { init: SK_NOON, storage: { badges: QUIET_BADGES, streak: SK({ last: '2026-10-26', played: ['2026-10-26'] }) } });

// 英語で遊んだ日は、日本語版のれんぞく日数にも出る（同じ localStorage の streak）
t('en_streak_shared', async page => {
  await skPractice(page);
  await page.goto(new URL('./', server.url).href);
  await mapLoaded(page);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.match(await text(page, '#streak .sk-text'), /^🔥 1日れんぞく・お休み券1枚$/);
  assert.equal(await page.getAttribute('#streak', 'aria-label'), 'れんぞく日数');
  assert.equal(await page.locator('#streak .sk-tz').count() === 0 || !(await page.isVisible('#streak .sk-tz')), true);
}, { timezoneId: 'America/New_York', init: SK_NOON });
