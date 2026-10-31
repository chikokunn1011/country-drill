// 英語版（PR5・PR6）: 英語の全画面を順にまわり、見えている日本語・ページの例外・[i18n] の warn・未訳の機能の入口が無いこと。
// PR6: プロフィール Chiko で、タイムアタック・結果のシェア・ランキング・プロフィールの窓・プロフィール画面と引き継ぎ・今日の難問・れんぞく日数も。
// 偽DB にはほかの人（日本語の名前 チコ）の記録を入れておき、表と窓に日本語の名前が出ても名前のほかに日本語が無いこと
// PR7: バッジ1つ取れるセーブで、答えの豆知識・結果のバッジのパネル・ホームの称号の札・バッジ画面（分類・詳細・ひみつ・称号えらび）・図鑑の豆知識・チコの英語の称号・英語の国のページの Fun facts も。
// PR8: 冒険も（ホームのコインのチップと入口 → はじめての画面 → 冒険ホーム → ガチャ10回 → 仲間・カードの詳細 → 編成 → バトル1回 → 章の終わりの窓 →
// 英雄の塔の1階 → 冒険ランキング → データの欄・コインのかせぎ方・かざりの窓 → 設定の冒険のスイッチ・練習の結果のコインの欄）。トーストの文にも日本語が無いこと。
// 英語のページのリンクが /en/ の外へ出ないこと。日本語版のホームの見える文が origin/main と同じこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openApp, jaLeft, warned, QUIET_BADGES, PHONE, PC, pickSetup, settle, settleResult, answerCorrect, answerWrong, answerTap, clearTimeAttack } from './helpers.mjs';
import { winBattle, winTowerFloor, saveWith, writeSave, startBattle, battleGuard } from './rpg_helpers.mjs';
import { JA_RE } from '../../tools/i18n_scan.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 英語の静的なページ（本編 en/ のあとにまわる順）
const STATIC = ['en/embed.html', 'en/country/', 'en/country/fr.html', 'en/country/jp.html', 'en/themes/', 'en/themes/stars.html',
  'en/themes/similar.html', 'en/themes/bigarea.html', 'en/howto.html', 'en/about.html', 'en/privacy.html'];

// navigator.share は渡したものを __shared に入れるだけ（端末のシェアの窓を出さない）。画像も渡せることにする
const STUB_SHARE = `{ Object.defineProperty(navigator, 'share', { configurable: true, value: o => { window.__shared = o; return Promise.resolve(); } });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true }); window.open = () => null; }
{ window.__toasts = []; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('toast')) window.__toasts.push(n.textContent); })
  .observe(document, { childList: true, subtree: true }); }`;
// バッジのセーブ: 練習のクリアで first-clear が1つ取れる（QUIET_BADGES から first-clear を抜いた形）。称号は取り済みのタイムアタッカー
const ONE_TO_GET = { v: 1, got: { 'ta-clear@1': 1, 'dopa-on@1': 1 }, eq: 'ta-clear@1', sn: { 'ta-clear': 2, 'dopa-on': 2 }, sent: ['ta-clear@1', 'dopa-on@1'], tip: 3 };
const openEn = (viewport, path = 'en/', badges = ONE_TO_GET) => openApp(browser, { viewport, path, locale: 'en-US', seed: 1, init: STUB_SHARE, storage: { badges } });

// 偽DB に自分（Chiko）とほかの人（チコ: タイムアタック・今日の難問の記録）を入れ、localStorage に Chiko のプロフィールを入れて英語版を開き直す
const ME = { token: 'tok-walk', pid: 'walkpid00001', name: 'Chiko' };
async function withProfile(app) {
  const { page, db } = app;
  const day = await page.evaluate(() => DAILY.today()), at = new Date().toISOString();
  db.profiles.push({ id: 1, pid: 'otherpid0001', token: 'other', nickname: 'チコ', title: 'ドリルの鬼', deco: ['jp'], badges: 12, badges_total: 80, created_at: '2026-10-01T00:00:00Z' },
    { id: 2, pid: ME.pid, token: ME.token, nickname: ME.name });
  db.rows.push({ board: 'f2n:all:5', profile_id: 1, nickname: 'チコ', time_ms: 999_000, questions: 5, created_at: at });
  db.dailyRows.push({ day, profile_id: 1, nickname: 'チコ', correct: 20, total: 20, time_ms: 83400, created_at: at });
  await page.evaluate(p => localStorage.setItem('profile', JSON.stringify(p)), { token: ME.token, pid: ME.pid, name: ME.name, auto: true, isPublic: true, sent: { isPublic: true } });
  await page.goto(new URL('en/', server.url).href);
  await page.waitForFunction(() => window.PROFILE);
  await page.evaluate(() => PROFILE.ready);
}

for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) test(`en_walk_${vname}`, { timeout: 300_000 }, async () => {
  const app = await openEn(viewport);
  const { page, errors } = app;
  const problems = [];
  // いまの画面を見る: 見えている日本語・ここまでに出たトーストの日本語・ここまでのページの例外
  let seenErrors = 0;
  const check = async label => {
    for (const s of await jaLeft(page)) problems.push(`${label}: 日本語「${s}」`);
    for (const s of await page.evaluate(() => window.__toasts?.splice(0) ?? [])) if (JA_RE.test(s)) problems.push(`${label}: トーストに日本語「${s}」`);
    for (const e of errors.slice(seenErrors)) problems.push(`${label}: ページの例外 ${e}`);
    seenErrors = errors.length;
  };
  let triviaSeen = 0;
  const screen = name => page.waitForSelector(`#scr-${name}:not([hidden])`);
  const home = async () => { await page.evaluate(() => show('home')); await screen('home'); };
  // confirm・alert の文（英語のはず）
  page.on('dialog', d => { if (JA_RE.test(d.message())) problems.push(`dialog: 日本語「${d.message()}」`); d.accept(); });
  try {
    await withProfile(app);
    // ホーム
    await screen('home');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    await check('home');
    // 設定
    await page.click('#home-settings');
    await screen('settings');
    assert.equal(await page.isVisible('#set-rpg'), true, '設定の冒険のスイッチ');
    await check('settings');
    // モード選択
    await home();
    await page.click('#home-play');
    await screen('setup');
    await check('setup');
    // 5つのモードを1問ずつ（国旗→国名はまちがえる）。答えの前と後を見て、やめてモード選択へ
    for (const mode of ['f2n', 'n2f', 'm2f', 'f2m', 'tap']) {
      await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
      await check(`setup ${mode}`);
      await page.click('#start');
      await settle(page);
      await check(`quiz ${mode}`);
      if (mode === 'tap') await answerTap(page);
      else if (mode === 'f2n') await answerWrong(page);
      else await answerCorrect(page);
      await page.waitForSelector('#qcard .reveal');
      triviaSeen += await page.locator('#qcard .reveal .trivia .tv').count();
      await check(`answer ${mode}`);
      await page.click('#quit');
      await screen('setup');
    }
    // 結果（練習・5問。1問目をまちがえる）
    await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
    await page.click('#start');
    await answerWrong(page);
    await page.click('#next');
    for (let i = 0; i < 10 && await page.isHidden('#scr-result'); i++) { await answerCorrect(page); await page.click('#next'); }
    await screen('result');
    await settleResult(page);
    await page.waitForSelector('#rpg-res', { state: 'visible' });   // 練習の結果のコインの欄
    await check('result');
    // 結果のバッジのパネル（first-clear が1つ取れる）。ボタンの［Practice →］は無い（詳細にだけある）
    await page.waitForSelector('#r-badges .bdg-row');
    assert.match(await page.locator('#r-badges .bdg-h').innerText(), /^🏅 Badge earned!$/);
    assert.equal(await page.locator('#r-badges .bdg-row').count(), 1);
    await check('result badges');
    // タイムアタック1回（国旗→国名・全世界・5問）: クリアして自動で載る → 結果のシェア
    await home();
    await page.click('#home-play');
    await screen('setup');
    await pickSetup(page, { kind: 'ta' });
    await check('setup ta');
    await clearTimeAttack(page, { mode: 'f2n', region: 'all', count: 5 });
    await page.waitForSelector('#ta-post .tamsg.ok');
    await check('ta result');
    await page.waitForSelector('#r-share[data-card="ready"]');
    await page.click('#r-share');
    await page.waitForFunction(() => window.__shared);
    const shared = await page.evaluate(() => __shared.text);
    if (JA_RE.test(shared)) problems.push(`ta share: 日本語「${shared}」`);
    await check('ta share');
    // ランキング（同じ条件の表）: 歴代・今週。自分（Chiko）とチコの窓
    await page.click('#ta-open');
    await screen('ranking');
    const rkReady = n => page.waitForFunction(n => document.querySelectorAll('#rk-list li').length === n && $('rk-list').getAttribute('aria-busy') === 'false', n);
    await rkReady(2);
    await check('ranking all time');
    await page.click('#rk-tabs [data-p="week"]');
    await rkReady(2);
    await check('ranking this week');
    for (const [who, sel] of [['me', '#rk-list li.me .pf-name'], ['チコ', '#rk-list li:not(.me) .pf-name']]) {
      await page.click(sel);
      await page.waitForSelector('#pf-card[open] .pf-card-line');
      if (who !== 'me') assert.equal(await page.locator('#pf-card .pf-card-title').innerText(), '“Drill Machine”');   // サーバーの日本語の称号を英語で
      await check(`profile card ${who}`);
      await page.click('#pf-card [data-pfc="close"]');
      await page.waitForSelector('#pf-card:not([open])', { state: 'attached' });
    }
    // ホームの称号の札 → バッジ画面（分類・詳細・ひみつのバッジ・称号えらび）
    await home();
    await page.waitForSelector('#home-title', { state: 'visible' });
    assert.equal(await page.locator('#home-title').innerText(), '“Speed Apprentice”');
    await check('home title');
    await page.click('#home-badges');
    await screen('badges');
    await check('badges');
    for (const cat of await page.$$eval('#bdg-cats [data-cat]', bs => bs.map(b => b.dataset.cat))) {
      await page.click(`#bdg-cats [data-cat="${cat}"]`);
      await check(`badges ${cat}`);
    }
    for (const id of ['answers', 'reg-asia', 'comeback']) {   // 3段のバッジ・地域（［Practice →］あり）・ひみつ
      await page.click('#bdg-cats [data-cat="all"]');
      await page.click(`#bdg-list [data-bdg-detail="${id}"]`);
      await page.waitForSelector('#detail[open] .bdg-detail');
      await check(`badge detail ${id}`);
      await page.click('#detail [data-bdg-close]');
      await page.waitForSelector('#detail:not([open])', { state: 'attached' });
    }
    await page.click('#bdg-change');
    await page.waitForSelector('#detail[open] .bdg-picker');
    await check('badge picker');
    await page.click('#detail [data-bdg-close]');
    await page.waitForSelector('#detail:not([open])', { state: 'attached' });
    // プロフィール画面 → 引き継ぎ（データを預けてコードを出すまで）
    await home();
    await page.click('#home-profile');
    await screen('profile');
    await page.waitForSelector('#pf-me .pf-card-line');
    await check('profile');
    await page.click('#pf-tr-start');
    await page.waitForSelector('#pf-tr-code');
    await check('profile transfer');
    // 図鑑: 一覧・小窓・地図
    await home();
    await page.click('#home-book');
    await screen('book');
    await page.click('#bview button[data-v="list"]');
    await check('book list');
    await page.click('#grid .card[data-a="fr"]');
    await page.waitForSelector('#detail[open]');
    assert.ok(await page.locator('#detail .trivia .tv').count() > 0, 'book detail: 豆知識');
    await check('book detail');
    await page.click('#dclose');
    await page.click('#bview button[data-v="map"]');
    await page.waitForSelector('#bmapbox svg path[data-a]');
    await check('book map');
    await page.click('#bmapbox path[data-a="br"]');
    await page.waitForSelector('#binfo .facts');
    await check('book map br');
    // 練習の答えに英語の豆知識が出ていた
    assert.ok(triviaSeen > 0, '練習の答えに豆知識が出ない');
    // 道場（1回: 1問まちがえて最後まで）
    await home();
    await page.click('#home-play');
    await screen('setup');
    await page.click('#to-dojo');
    await screen('dojo');
    await check('dojo');
    await page.click('.dj-card[data-g="qa"]');
    await settle(page);
    await check('dojo quiz');
    await answerWrong(page);
    await check('dojo wrong');
    await page.click('#next');
    for (let i = 0; i < 30 && await page.evaluate(() => document.body.dataset.screen === 'quiz'); i++) {
      await answerCorrect(page);
      await page.click('#next');
    }
    await screen('dojo');
    await check('dojo done');
    // 今日の難問（説明 → 1問目をまちがえて結果・昨日のタブ）
    await home();
    await page.click('#home-daily');
    await screen('daily');
    await check('daily intro');
    await page.click('#dl-start');
    await settle(page);
    await check('daily quiz');
    await answerWrong(page);
    await page.waitForSelector('#qcard .reveal');
    await check('daily wrong');
    await page.click('#next');
    await screen('daily');
    await check('daily result');
    await page.click('#dl-tabs [data-t="yday"]');
    await page.click('#dl-answers summary');
    await check('daily yesterday');
    // ホームのれんぞく日数（7マス。収まらない幅では小窓を開く）
    await home();
    if (await page.isVisible('#streak .sk-open')) await page.click('#streak .sk-open');
    await page.waitForSelector('#streak .sk-week', { state: 'visible' });
    await check('home streak');
    // 冒険: トップバーのコインのチップ・ホームの入口 → はじめての画面（ストーリー）→ 旅に出る → 冒険ホーム
    // トップバーのコインのチップ（トップバーはホームでは出ない。モード選択で見る）
    await page.evaluate(() => show('setup'));
    await screen('setup');
    await page.waitForSelector('#rpg-chip', { state: 'visible' });
    await check('topbar coin chip');
    await home();
    await page.waitForSelector('#home-rpg', { state: 'visible' });
    await check('home adventure entry');
    await page.click('#home-rpg');
    await page.waitForSelector('#rpg-intro .rpg-story');
    await check('adventure intro');
    await page.click('#rpg-go');
    await page.waitForSelector('#rpg-hero');
    await check('adventure home');
    // ガチャ10回（●1,000 が要るのでコインを足す）
    await page.evaluate(() => RPG.debug.give(5000));
    await page.click('#rpg-to-gacha');
    await screen('gacha');
    await check('gacha');
    await page.click('#ga-10');
    await page.click('#ga-skip');
    await page.waitForFunction(() => document.querySelector('#ga-res .rpg-card') && !document.querySelector('#ga-res .rpg-card.is-back'));
    await check('gacha draw 10');
    // 仲間の一覧・カードの詳細
    await page.evaluate(() => RPG.open('rpg'));
    await page.click('#rpg-to-cards');
    await screen('cards');
    await page.waitForSelector('#cd-grid .rpg-card');
    await check('cards');
    await page.click('#cd-grid .rpg-card');
    await page.waitForSelector('#detail[open]');
    await check('card detail');
    await page.click('#detail .close');
    await page.waitForSelector('#detail:not([open])', { state: 'attached' });
    // 編成
    await page.evaluate(() => RPG.open('rpg'));
    await page.click('#rpg-to-team');
    await screen('team');
    await check('team');
    // バトル1回（冒険ホームの札のつぎのフロア → 会う画面 → 問題 → 勝つ）
    await page.evaluate(() => RPG.open('rpg'));
    await page.click('#rpg-dgs .rpg-plate:not([hidden]) .rpg-fl.is-next');
    await page.waitForSelector('#bt-fight');
    await check('battle meet');
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    await check('battle question');
    await winBattle(page);
    await page.waitForSelector('#bt-end');
    assert.match(await page.locator('#bt-end .rpg-bend-h').innerText(), /^Victory!/);
    await check('battle end');
    // 章の終わりの窓（地図喰いの巣をクリアしたセーブ。ch1 のストーリーをまだ読んでいない）
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rpg'));
      s.floors = { ...s.floors, world: 5 };
      s.story = [];
      localStorage.setItem('rpg', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForFunction(() => window.RPG && document.readyState === 'complete' && (typeof mapReady === 'undefined' || mapReady));
    await page.evaluate(() => RPG.open('rpg'));
    await page.waitForSelector('#rpg-story-dlg[open]');
    await check('chapter end story');
    await page.click('#rpg-story-ok');
    await page.waitForSelector('#rpg-story-dlg:not([open])', { state: 'attached' });
    // 英雄の塔の1階（クリア → やめる → 終わり）
    await page.click('#rpg-tower-go');
    await page.waitForSelector('#bt-fight');
    await check('tower meet');
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    await winTowerFloor(page);
    await check('tower floor 1 cleared');
    await page.click('#bt-tquit');
    await page.waitForSelector('#bt-end');
    await check('tower end');
    // 冒険ランキング（ほかの人 チコ）
    app.db.rpgRows.push({ token: 'other', profile_id: 1, nickname: 'チコ', lv: 20, dungeons: 3, floors: 16, tower: 9, tower_at: new Date().toISOString(),
      created_at: new Date().toISOString(), at: new Date().toISOString() });
    await page.evaluate(() => RPG.open('rpg'));
    await page.click('#rpg-to-rank');
    await screen('rpgrank');
    await page.waitForFunction(() => [...document.querySelectorAll('#rr-list li')].some(l => l.textContent.includes('チコ')) && $('rr-rank').textContent !== '');
    await check('adventure leaderboard');
    for (const s of ['dg', 'tower']) {
      await page.click(`#rr-tabs button[data-s="${s}"]`);
      await page.waitForFunction(() => [...document.querySelectorAll('#rr-list li')].some(l => l.textContent.includes('チコ')));
      await check(`adventure leaderboard ${s}`);
    }
    // 冒険ホームのデータの欄・コインのかせぎ方・かざりの窓
    await page.evaluate(() => RPG.open('rpg'));
    await page.waitForSelector('#rpg-hero');
    await page.click('#rpg-data summary');
    await page.waitForFunction(() => $('rpg-code-out').value.length > 10);
    await check('adventure data');
    await page.click('#rpg-earn summary');
    await page.waitForFunction(() => $('rpg-earn').open);
    await check('adventure earn coins');
    await page.click('#rpg-deco');
    await page.waitForSelector('#rpg-deco-dlg[open]');
    await check('decorations picker');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#rpg-deco-dlg:not([open])', { state: 'attached' });
    // 静的なページ
    for (const path of STATIC) {
      await page.goto(new URL(path, server.url).href);
      await page.waitForLoadState('load');
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en', path);
      await check(path);
      if (path === 'en/country/fr.html') {
        assert.equal(await page.locator('h2:has-text("Fun facts") + ul.trivia li .tv-k').count() > 0, true, `${path}: Fun facts`);
      }
    }
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
    assert.deepEqual(problems, []);
  } finally { await app.close(); }
});

// 英語のページのリンク（.langsw と http で始まる外のサイトを除く）は全部 /en/ の下へ。本編は図鑑の小窓と結果の画面のリンクも見る
test('en_links_stay_english', { timeout: 120_000 }, async () => {
  const app = await openEn(PHONE);
  const { page } = app;
  const out = [];
  const links = async label => {
    const hrefs = await page.$$eval('a[href]', as => as.filter(a => !a.closest('.langsw') && !/^http/i.test(a.getAttribute('href')))
      .map(a => [a.getAttribute('href'), new URL(a.href).pathname]));
    if (!hrefs.length) out.push(`${label}: リンクが無い`);
    for (const [href, path] of hrefs) if (!path.startsWith('/en/')) out.push(`${label}: ${href} → ${path}`);
  };
  try {
    await links('en/');
    await page.evaluate(() => show('book'));
    await page.click('#bview button[data-v="list"]');
    await page.click('#grid .card[data-a="fr"]');
    await page.waitForSelector('#detail[open] .cpage a');
    await links('en/ book detail');
    await page.click('#dclose');
    // プロフィール画面（プロフィールが無いとき・あるとき）の注意書きのプライバシーポリシー
    const privacy = async label => {
      const ps = await page.$$eval('#pf-main .pf-name-note a', as => as.map(a => new URL(a.href).pathname));
      if (!ps.length || ps.some(p => p !== '/en/privacy.html')) out.push(`${label}: プライバシーポリシー ${JSON.stringify(ps)}`);
    };
    await page.evaluate(() => show('profile'));
    await page.waitForSelector('#pf-name');
    await privacy('en/ profile (none)');
    await links('en/ profile (none)');
    await withProfile(app);
    await page.evaluate(() => show('profile'));
    await page.waitForSelector('#pf-rename-in');
    await privacy('en/ profile');
    await links('en/ profile');
    // バッジの詳細の［Practice →］: モード選択へ行っても /en/ のまま
    await page.evaluate(() => { show('badges'); BADGES.open('reg-asia'); });
    await page.waitForSelector('#detail[open] [data-bdg-practice]');
    assert.equal(await page.locator('#detail [data-bdg-practice]').innerText(), 'Practice →');
    await page.click('#detail [data-bdg-practice]');
    await page.waitForSelector('#scr-setup:not([hidden])');
    if (new URL(page.url()).pathname !== '/en/') out.push(`badge practice: ${page.url()}`);
    await links('en/ setup (badge practice)');
    // 今日の難問
    await page.evaluate(() => show('daily'));
    await page.waitForSelector('#dl-start');
    await links('en/ daily');
    // 冒険: バトルに負けて［Practice this region］・冒険ホームの［Earn coins in quizzes］→ モード選択へ行っても /en/ のまま
    await writeSave(page, saveWith({}));
    await startBattle(page, 'samerica', 1);
    while (await page.evaluate(() => RPG_BATTLE.state().phase) !== 'end') {
      await battleGuard(page);
      const a = await page.evaluate(() => RPG_BATTLE.cur());
      await page.locator(`#scr-battle .choice:not([data-a="${a}"])`).first().click();
      await page.click('#bt-next');
      await page.waitForFunction(() => ['question', 'end'].includes(RPG_BATTLE.state().phase));
    }
    await links('en/ battle lost');
    assert.equal((await page.locator('#bt-practice').innerText()).trim(), 'Practice this region');
    await page.click('#bt-practice');
    await page.waitForSelector('#scr-setup:not([hidden])');
    if (new URL(page.url()).pathname !== '/en/') out.push(`battle practice: ${page.url()}`);
    await links('en/ setup (battle practice)');
    await page.evaluate(() => RPG.open('rpg'));
    await page.waitForSelector('#rpg-hero');
    await links('en/ adventure home');
    await page.click('#rpg-earn summary');
    assert.equal((await page.locator('#rpg-earn-go').innerText()).trim(), 'Earn coins in quizzes');
    await page.click('#rpg-earn-go');
    await page.waitForSelector('#scr-setup:not([hidden])');
    if (new URL(page.url()).pathname !== '/en/') out.push(`adventure earn: ${page.url()}`);
    for (const path of STATIC) {
      await page.goto(new URL(path, server.url).href);
      await links(path);
      // 埋めこみの［今日の難問に挑戦］は英語版の今日の難問へ
      if (path === 'en/embed.html') {
        const d = await page.$eval('#e-daily', a => { const u = new URL(a.href); return u.pathname + u.hash; });
        if (d !== '/en/#daily') out.push(`${path}: #e-daily → ${d}`);
      }
    }
    assert.deepEqual(out, []);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

// 日本語版のホームの見える文は origin/main と同じ（言語の切りかえ「日本語 / English」の分は除く）。
// origin/main を git archive で一時フォルダに出して別のサーバーで配り、同じ条件で開いて比べる
// PR5 だけの一度きりの見張り: origin/main が手元に無いとき・origin/main に en/index.html がある（PR5 が入った）ときは飛ばす（そのあとの PR がホームの文を変えても落ちないように）
const gitOk = (...args) => { try { execFileSync('git', ['-C', REPO, ...args], { stdio: 'ignore' }); return true; } catch { return false; } };
const jaUnchangedSkip = () => !gitOk('rev-parse', '--verify', '--quiet', 'origin/main^{commit}') ? 'origin/main が手元に無い（git fetch origin main で取れる）'
  : gitOk('cat-file', '-e', 'origin/main:en/index.html') ? 'origin/main に en/index.html がある（PR5 が入ったので、比べる意味がない）'
  : null;
test('ja_unchanged', { timeout: 120_000 }, async t => {
  const reason = jaUnchangedSkip();
  if (reason) return t.skip(reason);
  const root = mkdtempSync(join(tmpdir(), 'en-walk-main-'));
  let base;
  try {
    execFileSync('sh', ['-c', 'git -C "$1" archive origin/main | tar -x -C "$2"', 'sh', REPO, root]);
    base = await startServer({ root });
    const homeText = async url => {
      const app = await openApp(browser, { url, viewport: PHONE, seed: 1, reducedMotion: 'reduce', storage: { badges: QUIET_BADGES } });
      try {
        await app.page.waitForSelector('#scr-home:not([hidden])');
        await app.page.waitForLoadState('networkidle');
        const text = await app.page.evaluate(() => {
          for (const sw of document.querySelectorAll('.langsw')) sw.remove();
          return document.body.innerText;
        });
        assert.deepEqual(app.errors.map(String), []);
        return text.split('\n').map(s => s.trim()).filter(Boolean);
      } finally { await app.close(); }
    };
    const now = await homeText(server.url), main = await homeText(base.url);
    assert.ok(main.length > 5, main.join('\n'));
    assert.deepEqual(now, main);
  } finally {
    await base?.close();
    rmSync(root, { recursive: true, force: true });
  }
});
