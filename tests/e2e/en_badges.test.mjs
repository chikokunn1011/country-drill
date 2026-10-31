// 英語版（PR7）: バッジと称号の画面（badges.js の後半を T() に。辞書 i18n/en-badges.js）。
// 見えている日本語が無いこと（jaLeft）と、保存（localStorage の badges）は日本語版と同じものを使うこと（称号は日本語のまま）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, jaLeft, warned, pickSetup, clearByAnswering, PHONE } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 英語版を ?bdgdebug=1 で開いて fn(page, app) を呼び、最後にページの例外と [i18n] の warn（辞書に無いキー）が無いかも見る。
// rpg.js は英語版でも読む（PR7 は画面なし・PR8 から冒険の画面も英語）ので、冒険のバッジも出て、バッジのコインも払われる
const t = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const { hash = '', ...rest } = opts;
  const app = await openApp(browser, { path: 'en/?bdgdebug=1' + hash, locale: 'en-US', ...rest });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
  } finally { await app.close(); }
});
const text = (page, sel) => page.locator(sel).innerText();
const count = (page, sel) => page.locator(sel).count();
const stored = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const tile = id => `#bdg-list [data-bdg-detail="${id}"]`;
// 練習（国旗→国名・全世界）を結果画面まで解く
async function playPractice(page, count = 5) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count });
  await page.click('#start');
  await clearByAnswering(page);
}
// 取ったものだけのセーブ（お知らせ・払い残しが出ないように sent・sn も入れる）
// 開くたびに入れ直す openApp の storage と違い、タブで1回だけ入れる（日本語版・英語版を行き来するテスト用）
const seedOnce = badges => `if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('badges', ${JSON.stringify(JSON.stringify(badges))}); }`;
const saveOf = (keys, eq = '') => ({ v: 1, got: Object.fromEntries(keys.map(k => [k, 1])), eq, sent: keys, tip: 3,
  sn: Object.fromEntries(keys.map(k => [k.split('@')[0], 2])) });

t('en_badges_screen', async page => {
  assert.equal(await page.isVisible('#scr-badges'), true);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await text(page, '#scr-badges .bdg-head h2')).trim(), 'Badges');
  assert.match(await text(page, '#bdg-total'), /^1 of 38$/);
  assert.equal(await text(page, '#bdg-title'), 'No title yet');
  assert.equal(await text(page, '#bdg-change'), 'Change title');
  assert.equal(await text(page, '#bdg-colors'), 'Bronze 1 · Silver 0 · Gold 0 · Rainbow 0');
  assert.deepEqual(await page.locator('#bdg-cats .chip').allInnerTexts(),
    ['All', 'Quiz', 'Ways to play', 'Modes', 'Regions', 'Gallery & daily', 'Hype mode', 'Adventure']);
  assert.deepEqual(await page.locator('#bdg-list .bdg-cat-h').allInnerTexts(),
    ['Quiz', 'Ways to play', 'Modes', 'Regions', 'Gallery & daily', 'Hype mode', 'Adventure']);
  assert.equal(await count(page, '#bdg-list .bdg-tile'), 38);
  assert.equal(await text(page, `${tile('first-clear')} .bdg-name`), 'First Step');
  assert.equal(await text(page, `${tile('answers')} .bdg-name`), 'Bit by Bit');
  assert.equal(await text(page, `${tile('mode-f2m')} .bdg-sub`), 'Flag → Location');
  assert.equal(await text(page, `${tile('answers')} .bdg-prog`), '150 / 1,000');
  assert.equal(await text(page, `${tile('reg-asia')} .bdg-prog`), 'Not yet');
  // 読み上げの文（型の文）
  assert.equal(await page.getAttribute(tile('answers'), 'aria-label'),
    'Bit by Bit. Earned up to Bronze. Next, Silver: Reach 1,000 correct answers in total. Progress: 150 / 1,000');
  assert.equal(await page.getAttribute(tile('reg-asia'), 'aria-label'),
    'Across Asia. Not earned yet. Next, Bronze: Clear a game of 10 or more questions (region: Asia). Not yet');
  // 分類のチップ
  await page.click('#bdg-cats [data-cat="region"]');
  assert.equal(await count(page, '.bdg-tile'), 7);
  assert.equal(await text(page, '#bdg-cats [aria-pressed="true"]'), 'Regions');
  await page.click('#bdg-cats [data-cat="all"]');
  // 詳細: 3段の条件と称号
  await page.click(tile('answers'));
  await page.waitForSelector('#detail[open] .bdg-detail');
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await text(page, '#detail-inner .bdg-dcat'), 'Quiz badge');
  assert.deepEqual(await page.locator('#detail-inner .bdg-tl').allInnerTexts(), ['Bronze', 'Silver', 'Gold']);
  const conds = await page.locator('#detail-inner .bdg-cond').allInnerTexts();
  assert.deepEqual(conds, ['Reach 100 correct answers in total', 'Reach 1,000 correct answers in total', 'Reach 5,000 correct answers in total']);
  const ttl = await page.locator('#detail-inner .bdg-ttl').allInnerTexts();
  assert.deepEqual(ttl, ['Title: “Steady Learner”', 'Title: “Hard Worker”', 'Title: “Drill Machine”']);
  assert.equal(await text(page, '#detail-inner .bdg-when'), `✓ ${await page.evaluate(() => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(1))}`);
  assert.equal(await count(page, '#detail-inner [data-bdg-equip="answers@1"]'), 1);
  assert.equal(await text(page, '#detail-inner [data-bdg-equip="answers@1"]'), 'Equip');
  assert.deepEqual(await page.locator('#detail-inner .bdg-lock').allInnerTexts(), ['(Unlocks when earned)', '(Unlocks when earned)']);
  await page.click('#detail-inner [data-bdg-close]');
  // 地域のバッジ: ［Practice →］と、ヒントの注意書き
  await page.click(tile('reg-world'));
  assert.equal(await text(page, '#detail-inner .bdg-dname'), 'Around the World');
  assert.equal(await text(page, '#detail-inner .bdg-dcat'), 'Region badge');
  assert.match(await text(page, '#detail-inner .bdg-cond >> nth=1'), /“All”.*\(region: World\)$/);
  assert.equal(await text(page, '#detail-inner [data-bdg-practice]'), 'Practice →');
  assert.equal(await text(page, '#detail-inner .bdg-note'), 'Note: Answers given with the name hint on don’t count.');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail-inner [data-bdg-close]');
  // ひみつのバッジ: ??? と英語のヒントだけ
  assert.equal(await text(page, `${tile('chal-grit')} .bdg-name`), '???');
  assert.match(await page.getAttribute(tile('chal-grit'), 'aria-label'), /^Secret badge\. [^　-鿿]+$/);
  await page.click(tile('chal-grit'));
  assert.equal(await text(page, '#detail-inner .bdg-dname'), '???');
  assert.equal(await text(page, '#detail-inner .bdg-hint'), 'Take another shot at a Challenge that tripped you up, and…');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail-inner [data-bdg-close]');
  // もうすぐ取れそう・最近とったバッジ
  await page.evaluate(() => BADGES.debug.set('right', 600));
  assert.deepEqual(await page.locator('#bdg-soon li').allInnerTexts(), ['📚 Bit by Bit Silver: 400 questions to go']);
  await page.evaluate(() => BADGES.debug.set('taAvg', 2430));
  assert.equal(await text(page, `${tile('ta-speed')} .bdg-prog`), '2.43s → 2.0s');
  assert.deepEqual(await page.locator('#bdg-soon li').allInnerTexts(), ['⚡ Speedster Silver: 0.43s to go', '📚 Bit by Bit Silver: 400 questions to go']);
  const recent = await page.locator('#bdg-recent li').allInnerTexts();
  assert.match(recent[0], /^[A-Z][a-z]{2} \d{1,2} ⚡ Speedster Bronze$/);
  assert.match(recent[1], /^[A-Z][a-z]{2} \d{1,2} 📚 Bit by Bit Bronze$/);
  assert.deepEqual(await jaLeft(page), []);
  assert.equal(await noHScroll(page), true);
}, { hash: '#badges', storage: { badges: { ...saveOf(['answers@1']), s: { right: 150 } } } });

// 英語で練習をクリアして first-clear を取る。結果のパネルが英語で、［Equip］でホームの札が英語の称号になる
t('en_badge_earn', async page => {
  await playPractice(page);
  await page.locator('#r-badges .bdg-row').waitFor();
  assert.equal(await text(page, '#r-badges .bdg-h'), '🏅 Badge earned!');
  assert.equal(await text(page, '#r-badges .bdg-l1'), 'First Step Bronze');
  assert.equal(await text(page, '#r-badges .bdg-l2'), 'Title: “Drill Rookie”');
  assert.equal(await text(page, '#r-badges [data-bdg-equip]'), 'Equip');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#r-badges [data-bdg-equip]');
  assert.equal(await text(page, '#r-badges .bdg-on'), 'Equipped');
  await page.click('#brand');
  assert.equal(await text(page, '#home-title'), '“Drill Rookie”');
  assert.match(await text(page, '#home-badges'), /Badges\s*1\/38/);
  assert.equal(await page.getAttribute('#home-badges .bdg-dot', 'aria-label'), 'New badges');
  assert.deepEqual(await jaLeft(page), []);
}, { storage: { badges: { v: 1, eq: '' } } });

// 自動でつけた称号（はじめてのバッジ）は「Equipped “…”」。トーストも英語
t('en_badge_auto_and_toast', async page => {
  await page.evaluate(() => { window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('toast')) window.__toasts.push(n.innerText); }).observe(document.body, { childList: true, subtree: true }); });
  await playPractice(page);
  await page.locator('#r-badges .bdg-row').waitFor();
  assert.equal(await text(page, '#r-badges .bdg-l2'), 'Equipped “Drill Rookie”');
  await page.click('#brand');
  // ホームで取れたバッジはトースト
  await page.evaluate(() => BADGES.debug.set('right', 100));
  await page.locator('#toasts .toast').first().waitFor();
  const toasts = await page.evaluate(() => window.__toasts);
  assert.ok(toasts.some(s => s.includes('Badge earned!') && s.includes('Bit by Bit Bronze') && s.includes('Title: “Steady Learner”') && s.includes('Equip')), toasts.join('\n'));
  assert.deepEqual(await jaLeft(page), []);
}, { storage: { badges: { v: 1 } } });

// 英語で［Equip］しても、保存と BADGES.title() は日本語のまま。日本語版を開くとホームの札は日本語の称号
t('en_equip_keeps_ja', async page => {
  await playPractice(page);
  await page.click('#r-badges [data-bdg-equip]');
  assert.equal(await page.evaluate(() => BADGES.title()), 'ドリルの新人');
  assert.equal((await stored(page, 'badges')).eq, 'first-clear@1');
  await page.goto(server.url);
  await page.waitForSelector('#home-title');
  assert.equal(await text(page, '#home-title'), '〈ドリルの新人〉');
}, { init: seedOnce({ v: 1, eq: '' }) });

t('en_title_picker', async page => {
  await page.click('#home-title');
  await page.waitForSelector('#detail[open] .bdg-picker');
  assert.equal(await text(page, '#detail-inner .bdg-ph'), 'Choose a title');
  const picks = await page.locator('#detail-inner .bdg-pick').allInnerTexts();
  assert.equal(picks.at(-1), 'No title');
  assert.ok(picks.some(s => s.includes('Silver') && s.includes('“Hard Worker”') && s.includes('📚 Bit by Bit')), picks.join('\n'));
  assert.equal(await text(page, '#detail-inner [data-bdg-close]'), 'Close');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail-inner [data-bdg-pick=""]');
  assert.equal(await count(page, '.bdg-titlerow'), 0);
  assert.equal((await stored(page, 'badges')).eq, '');
}, { storage: { badges: saveOf(['first-clear@1', 'answers@1', 'answers@2'], 'first-clear@1') } });

// ［Share］の文は英語で、英語版の URL で終わる。コピーできたら「Copied」
t('en_badge_share', async (page, app) => {
  await app.context.addInitScript(() => {
    delete Navigator.prototype.share;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: s => { window.__clip = s; return Promise.resolve(); } } });
  });
  await page.reload();
  await page.evaluate(() => BADGES.open('reg-asia'));
  const btn = page.locator('#detail-inner [data-bdg-share]');
  assert.equal(await btn.innerText(), 'Share');
  await btn.click();
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor();
  const clip = await page.evaluate(() => window.__clip);
  assert.ok(clip.startsWith('I earned the “'), clip);
  assert.ok(clip.endsWith('/country-drill/en/'), clip);
  assert.equal(clip, 'I earned the “Across Asia” badge (Silver) in Flag Master! Title: “Asia Buff” https://chikokunn1011.github.io/country-drill/en/');
}, { storage: { badges: saveOf(['reg-asia@1', 'reg-asia@2']) } });

// 英語でバッジを取ると、冒険のコインも払われる（rpg.js は英語版でも読む）。パネルの行に ●+50
t('en_badge_coin_paid', async page => {
  const before = (await stored(page, 'rpg'))?.coins ?? 0;
  await playPractice(page);
  await page.locator('#r-badges .bdg-row').waitFor();
  assert.equal(await text(page, '#r-badges .bdg-paid'), '●+50');
  const rpg = await stored(page, 'rpg');
  assert.ok(rpg.badgesPaid.includes('first-clear@1'), JSON.stringify(rpg.badgesPaid));
  assert.ok(rpg.coins >= before + 50, `${before} → ${rpg.coins}`);
  assert.ok((await stored(page, 'badges')).sent.includes('first-clear@1'));
}, { storage: { badges: { v: 1, eq: '' } } });

// 日本語版で取ったバッジが英語版に、英語版で取ったバッジが日本語版に出る（同じ localStorage の badges）
t('en_badges_shared', async page => {
  await page.goto(server.url + '?bdgdebug=1');
  await page.evaluate(() => BADGES.debug.grant('reg-asia@1'));
  await page.goto(new URL('en/?bdgdebug=1#badges', server.url).href);
  await page.waitForSelector('#scr-badges:not([hidden])');
  assert.equal(await count(page, `${tile('reg-asia')} .bdg-dots i.t1`), 1);
  await page.evaluate(() => show('home'));
  await playPractice(page);
  await page.goto(server.url);
  await page.waitForFunction(() => window.BADGES);
  const got = await page.evaluate(() => BADGES.list().filter(b => b.tiers.some(t => t.got)).map(b => b.id).sort());
  assert.deepEqual(got, ['first-clear', 'reg-asia']);
}, { init: seedOnce({ v: 1, eq: '' }) });

// 全部のバッジを取った状態で、390px のバッジ画面・称号えらび・いちばん長い英語の称号の札・結果のパネル（4行）が横にはみ出さない。
// タイルの名前は2行で切れない（いちばん長い名前も全部見える）
t('en_badges_fit', async page => {
  await page.evaluate(() => { for (const b of BADGES.list()) for (const t of b.tiers) BADGES.debug.grant(t.key); });
  const inside = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 0.5)
    .map(el => `${el.className}: ${el.textContent}`), sel);
  await page.evaluate(() => show('badges'));
  assert.equal(await noHScroll(page), true);
  assert.deepEqual(await inside('.bdg-tile, .bdg-tile *'), []);
  const clipped = await page.evaluate(() => [...document.querySelectorAll('.bdg-name')].filter(el => el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
  assert.deepEqual(clipped, []);
  assert.deepEqual(await jaLeft(page), []);
  // 称号えらび（全部の称号）
  await page.click('#bdg-change');
  await page.waitForSelector('#detail[open] .bdg-picker');
  assert.deepEqual(await inside('#detail-inner, #detail-inner *'), []);
  assert.deepEqual(await jaLeft(page), []);
  // いちばん長い英語の称号をつけたホームの札
  const key = await page.evaluate(() => {
    const all = BADGES.list().flatMap(b => b.tiers.map(t => [t.key, T(t.title)]));
    return all.sort((p, q) => q[1].length - p[1].length)[0][0];
  });
  await page.click(`#detail-inner [data-bdg-pick="${key}"]`);
  await page.evaluate(() => show('home'));
  assert.equal(await noHScroll(page), true);
  assert.deepEqual(await inside('#home-title'), []);
  assert.ok((await page.evaluate(() => $('home-title').getBoundingClientRect().right)) <= 390);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: PHONE });

// 結果のパネルに4行と「3 more」（10問の練習で、はじめの一歩・こつこつ正解の金・れんぞく正解・ノーミス練習・世界一周の銅・通いなれた道・おかえり！の7つ）
t('en_result_panel_fit', async page => {
  await playPractice(page, 10);
  await page.locator('#r-badges .bdg-more').waitFor();
  assert.equal(await count(page, '#r-badges .bdg-row'), 4);
  assert.equal(await text(page, '#r-badges .bdg-more span'), '3 more');
  assert.equal(await text(page, '#r-badges .bdg-more button'), 'View badges');
  assert.equal(await noHScroll(page), true);
  const over = await page.evaluate(() => [...document.querySelectorAll('#r-badges, #r-badges *')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 0.5).map(el => el.className));
  assert.deepEqual(over, []);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: PHONE, storage: { badges: { ...saveOf(['answers@1', 'answers@2']), eq: null, s: { right: 4990, days: 2, last: '2020-01-01' } } } });

// バッジのトースト（ホームで取った）も 390px からはみ出さない。長めの名前と称号（旅人のレベル: Traveler Level・Full-Fledged Traveler）
t('en_toast_fit', async page => {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('rpg:levelup', { detail: { lv: 10 } })));
  const el = page.locator('#toasts .toast', { hasText: 'Traveler Level Bronze' });
  await el.waitFor();
  assert.match(await el.innerText(), /^Badge earned!\n.*Traveler Level Bronze\n.*Title: “Full-Fledged Traveler”\s*Equip$/s);
  const over = await page.evaluate(() => [...document.querySelectorAll('#toasts .toast, #toasts .toast *')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 0.5).map(el => el.className));
  assert.deepEqual(over, []);
  assert.equal(await noHScroll(page), true);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: PHONE, storage: { badges: { v: 1, eq: '' } } });

// いちばん長い名前と称号（南米アドベンチャーの銅: South America Adventure・South America Traveler）の結果のパネルの行も 390px からはみ出さない
t('en_longest_row_fit', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: '南アメリカ', count: 10 });
  await page.click('#start');
  await clearByAnswering(page);
  const row = page.locator('#r-badges .bdg-row[data-key="reg-samerica@1"]');
  await row.waitFor();
  assert.equal(await row.locator('.bdg-l1').innerText(), 'South America Adventure Bronze');
  assert.equal(await row.locator('.bdg-l2').innerText(), 'Title: “South America Traveler”');
  assert.equal(await row.locator('[data-bdg-equip]').innerText(), 'Equip');
  assert.equal(await noHScroll(page), true);
  const over = await page.evaluate(() => [...document.querySelectorAll('#r-badges, #r-badges *')].filter(el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 0.5).map(el => el.className));
  assert.deepEqual(over, []);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: PHONE, storage: { badges: { v: 1, eq: '' } } });
