// 英語版（PR5）: 英語の全画面を順にまわり、見えている日本語・ページの例外・[i18n] の warn・未訳の機能の入口が無いこと。
// 英語のページのリンクが /en/ の外へ出ないこと。日本語版のホームの見える文が origin/main と同じこと
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, openApp, jaLeft, warned, QUIET_BADGES, PHONE, PC, pickSetup, settle, settleResult, answerCorrect, answerWrong, answerTap } from './helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 未訳の機能の入口（英語版では見えてはいけない）: 今日の難問・冒険・ランキング・バッジ・プロフィール・タイムアタックのカード・
// クイズのコイン・結果のシェア・豆知識の欄
const UNTRANSLATED = ['#home-daily', '#home-rpg', '#home-rank', '#home-badges', '#home-profile', '#kinds [data-k="ta"]', '#pcoin', '#r-share', '.trivia'];
const shownEntries = page => page.evaluate(sels => sels.filter(s => [...document.querySelectorAll(s)].some(e => e.checkVisibility({ visibilityProperty: true }))), UNTRANSLATED);

// 英語の静的なページ（本編 en/ のあとにまわる順）
const STATIC = ['en/embed.html', 'en/country/', 'en/country/fr.html', 'en/country/jp.html', 'en/themes/', 'en/themes/stars.html',
  'en/themes/similar.html', 'en/themes/bigarea.html', 'en/howto.html', 'en/about.html', 'en/privacy.html'];

const openEn = (viewport, path = 'en/') => openApp(browser, { viewport, path, locale: 'en-US', seed: 1, storage: { badges: QUIET_BADGES } });

for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) test(`en_walk_${vname}`, { timeout: 300_000 }, async () => {
  const app = await openEn(viewport);
  const { page, errors } = app;
  const problems = [];
  // いまの画面を見る: 見えている日本語・未訳の入口・ここまでのページの例外
  let seenErrors = 0;
  const check = async label => {
    for (const s of await jaLeft(page)) problems.push(`${label}: 日本語「${s}」`);
    for (const s of await shownEntries(page)) problems.push(`${label}: 未訳の入口 ${s} が見える`);
    for (const e of errors.slice(seenErrors)) problems.push(`${label}: ページの例外 ${e}`);
    seenErrors = errors.length;
  };
  const screen = name => page.waitForSelector(`#scr-${name}:not([hidden])`);
  const home = async () => { await page.evaluate(() => show('home')); await screen('home'); };
  try {
    // ホーム
    await screen('home');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    await check('home');
    // 設定
    await page.click('#home-settings');
    await screen('settings');
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
    await check('result');
    // 図鑑: 一覧・小窓・地図
    await home();
    await page.click('#home-book');
    await screen('book');
    await page.click('#bview button[data-v="list"]');
    await check('book list');
    await page.click('#grid .card[data-a="fr"]');
    await page.waitForSelector('#detail[open]');
    await check('book detail');
    await page.click('#dclose');
    await page.click('#bview button[data-v="map"]');
    await page.waitForSelector('#bmapbox svg path[data-a]');
    await check('book map');
    await page.click('#bmapbox path[data-a="br"]');
    await page.waitForSelector('#binfo .facts');
    await check('book map br');
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
    // 静的なページ
    for (const path of STATIC) {
      await page.goto(new URL(path, server.url).href);
      await page.waitForLoadState('load');
      assert.equal(await page.evaluate(() => document.documentElement.lang), 'en', path);
      await check(path);
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
    for (const path of STATIC) {
      await page.goto(new URL(path, server.url).href);
      await links(path);
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
