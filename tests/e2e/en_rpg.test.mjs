// 英語版の冒険（PR8）。このファイルの最初のテストは日本語の見張り: 日本語の冒険の全画面の見える文とトーストが origin/main と同じこと（ja_rpg_unchanged）。
// 英語のテストは Task 5 から足す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, QUIET_BADGES, PHONE, PC, jaLeft, warned, pickSetup, answerCorrect, clearByAnswering, settleResult } from './helpers.mjs';
import { openRpg, writeSave, saveWith, toastTexts, playPractice, winBattle, startTower, winTowerFloor, localToday, flipAll, startBattle, battleAnswer, battleGuard } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

// 冒険の画面を見るときの決まったセーブ。南アメリカはボスまでクリア・オセアニアは F2 まで・地図喰いの巣もクリア（英雄の塔が開く）。
// ch1 のストーリーは読んだことにする（読んでいないと冒険ホームの上に窓が出る。窓は 'story' の画面で見る）
const JA_SAVE = saveWith({
  lv: 12, coins: 4321, cards: { jp: [2, 1], fr: [1, 0], br: [3, 2], kn: [1, 0] }, fr: { de: 3 },
  floors: { samerica: 5, oceania: 2, world: 5 }, teams: [{ n: '編成1', c: ['jp', 'fr'] }, { n: 'あか', c: null }],
  tower: { best: 7 }, story: ['ch1'],
});

// 冒険ランキングの偽 DB に入れるほかの人（日本語の名前 チコ）。日付（jstDay）が2つのサーバーでずれないよう、時刻はここで1回だけ決める
const RANK_AT = new Date(Date.now() - 3600_000).toISOString();
const RANK_ROW = { token: 't-chiko', profile_id: 9, nickname: 'チコ', lv: 20, dungeons: 3, floors: 16, tower: 9, tower_at: RANK_AT, created_at: RANK_AT, at: RANK_AT };

// いまのページの見える文を行に切ったもの（空行を除く）。言語の切りかえ（.langsw）とトースト（#toasts。文は __toasts で別に比べる）は外す
const lines = page => page.evaluate(() => {
  const hide = [...document.querySelectorAll('.langsw, #toasts')], was = hide.map(e => e.style.display);
  for (const e of hide) e.style.display = 'none';
  try { return document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean); }
  finally { hide.forEach((e, i) => { e.style.display = was[i]; }); }
});
const shown = (page, sel) => page.locator(sel).first().waitFor({ state: 'visible' });
const openHome = async (page, save) => {
  await writeSave(page, save);
  await page.evaluate(() => RPG.open('rpg'));
  await shown(page, '#scr-rpg');
};

// 画面の名前 → そこまで進める手順（前の画面のあとにそのまま続くものは、読み込み直さない）
const SCREENS = [
  ['intro', page => openHome(page, { ...JA_SAVE, intro: false })],
  ['home', page => openHome(page, JA_SAVE)],
  ['story', async page => { await openHome(page, { ...JA_SAVE, story: [] }); await shown(page, '#rpg-story-dlg[open]'); }],
  ['gacha', async page => {
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => RPG.open('gacha'));
    await shown(page, '#ga-10');
  }],
  ['gacha-result', async page => {
    await page.click('#ga-10');
    await page.click('#ga-skip');   // 1枚ずつ見せる演出をとばす（とばすと一覧は全部表）
    await page.waitForFunction(() => document.querySelector('#ga-res .rpg-card') && !document.querySelector('#ga-res .rpg-card.is-back'));
  }],
  ['cards', async page => {
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => RPG.open('cards'));
    await shown(page, '#scr-cards');
  }],
  ['card-detail', async page => { await page.evaluate(() => RPG.openCard('jp')); await shown(page, '#detail[open]'); }],
  ['team', async page => {
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => RPG.openTeam());
    await shown(page, '#scr-team');
  }],
  ['battle-meet', async page => {
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => RPG_BATTLE.start('oceania', 3));
    await shown(page, '#bt-fight');
  }],
  ['battle-quiz', async page => {
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  }],
  ['battle-end', async page => { await winBattle(page); }],
  ['tower', async page => {
    await openHome(page, JA_SAVE);
    await startTower(page);
    await winTowerFloor(page);
  }],
  ['rank', async (page, app) => {
    app.db.rpgRows.length = 0;
    app.db.rpgRows.push({ ...RANK_ROW });
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => RPG.open('rpgrank'));
    await page.waitForFunction(() => document.querySelectorAll('#rr-list li').length === 1 && $('rr-rank').textContent !== '');
  }],
  ['data', async page => {
    await openHome(page, JA_SAVE);
    await page.click('#rpg-data summary');
    await page.waitForFunction(() => $('rpg-data').open);
  }],
  ['settings', async page => {
    await writeSave(page, JA_SAVE);
    await page.evaluate(() => show('settings'));
    await shown(page, '#set-rpg');
  }],
  ['result', async page => {
    await writeSave(page, JA_SAVE);
    await playPractice(page, { count: 5 });
    await shown(page, '#rpg-res');
  }],
];

// 冒険の全画面の見える文とトーストを url のサイトで集める。{ 画面: { text: 行の並び, toasts: そこまでに出たトースト } }
// （トーストは読み込み直してからの分。openRpg の RECORD が origin/main でも __toasts を積む）
async function rpgTexts(browser, url) {
  const app = await openRpg(browser, { url, blockScripts: [], seed: 1, reducedMotion: 'reduce', storage: { badges: QUIET_BADGES } });
  const out = {};
  try {
    for (const [name, go] of SCREENS) {
      try { await go(app.page, app); } catch (e) { throw new Error(`${name}: ${e.message}`); }
      out[name] = { text: await lines(app.page), toasts: await toastTexts(app.page) };
    }
    assert.deepEqual(app.errors.map(String), [], url);
  } finally { await app.close(); }
  return out;
}

// PR8 の見張り: origin/main が手元に無いとき・origin/main に i18n/en-rpg.js がある（PR8 が入った）ときは飛ばす
const gitOk = (...args) => { try { execFileSync('git', ['-C', REPO, ...args], { stdio: 'ignore' }); return true; } catch { return false; } };
const jaRpgSkip = () => !gitOk('rev-parse', '--verify', '--quiet', 'origin/main^{commit}') ? 'origin/main が手元に無い（git fetch origin main で取れる）'
  : gitOk('cat-file', '-e', 'origin/main:i18n/en-rpg.js') ? 'origin/main に i18n/en-rpg.js がある（PR8 が入ったので、比べる意味がない）'
  : null;

test('ja_rpg_unchanged', { timeout: 300_000 }, async t => {
  const reason = jaRpgSkip();
  if (reason) return t.skip(reason);
  const root = mkdtempSync(join(tmpdir(), 'en-rpg-main-'));
  let base;
  try {
    execFileSync('sh', ['-c', 'git -C "$1" archive origin/main | tar -x -C "$2"', 'sh', REPO, root]);
    base = await startServer({ root });
    const main = await rpgTexts(browser, base.url), now = await rpgTexts(browser, server.url);
    for (const [name] of SCREENS) {
      assert.ok(main[name].text.length > 3, `${name}: ${main[name].text.join('\n')}`);
      assert.deepEqual(now[name].text, main[name].text, `${name} の見える文が origin/main とちがう`);
      assert.deepEqual(now[name].toasts, main[name].toasts, `${name} のトーストが origin/main とちがう`);
    }
  } finally {
    await base?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

/* ---------- 英語の冒険（Task 5: 冒険ホーム・入口・コインの表示。I18N.hide から 'rpg' を外す） ---------- */
// 冒険の rpg-*.js は全部英語のページでも読む（EN_SKIP は空。rpg-cards は Task 6、rpg-team は Task 7、rpg-battle は Task 8、rpg-rank は Task 9 から）。
// 塔の札（バトルの画面が要る）は Task 8 の en_tower で見る。かざりの窓（RPG.cardHTML が要る）は Task 6 から en_profile_decorations で見る（preflight C2）
const EN_OPTS = { path: 'en/', locale: 'en-US', seed: 1, storage: { badges: QUIET_BADGES } };
// 英語版を開いて fn(page, app) を呼び、最後にページの例外・[i18n] の warn（辞書に無いキー）・[rpg] の console.error が無いかも見る
const te = (name, fn, opts = {}) => test(name, { timeout: 120_000 }, async () => {
  const app = await openRpg(browser, { ...EN_OPTS, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
    assert.equal(await warned(app.warnings, /\[i18n\]/), false, app.warnings.join('\n'));
    assert.deepEqual(app.consoleErrors.filter(s => s.startsWith('[rpg]')), []);
  } finally { await app.close(); }
});
const txt = (page, sel) => page.locator(sel).first().innerText();
const JA_TEXT = /[぀-ヿ㐀-鿿]/;
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('rpg')));
const EARTH_CLEAR = { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 5, world: 5 };
const MIRROR_CLEAR = { ...EARTH_CLEAR, msamerica: 5, moceania: 5, mnamerica: 5, meurope: 5, masia: 5, mafrica: 5, mworld: 5 };
const STORY_EN = ['The Map Eater, a monster that chews on the world map', 'You, the Traveler, grow stronger', 'Each time you remember a country'];

te('en_rpg_intro', async page => {
  await openHome(page, { ...JA_SAVE, intro: false });
  assert.equal((await txt(page, '#rpg-intro .rpg-h1')).trim(), 'Flag Quest');
  const story = await page.locator('#rpg-intro .rpg-story p').allInnerTexts();
  assert.equal(story.length, 3);
  STORY_EN.forEach((s, i) => assert.ok(story[i].startsWith(s), story[i]));
  assert.equal((await txt(page, '#rpg-avlbl')).trim(), 'Choose your Traveler’s look');
  assert.equal((await txt(page, '#rpg-go')).trim(), 'Set off');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#rpg-go');
  await shown(page, '#rpg-hero');
  assert.deepEqual(await jaLeft(page), []);
});

te('en_rpg_home', async page => {
  // 今日の手配書を引き直す。pulls: 1 は「まずはガチャ10連」をすすめないため（つぎにやることをダンジョンにする）
  await openHome(page, { ...JA_SAVE, pulls: 1, bounty: { d: '2000-01-01', a: [], done: [] } });
  assert.deepEqual(await jaLeft(page), []);
  // ダンジョンの札（いま見せている1つ）: 英語の名前・推奨 Lv の目安
  const plate = page.locator('#rpg-dgs .rpg-plate:not([hidden])');
  assert.equal((await plate.locator('.rpg-plate-name b').innerText()).trim(), 'Coral Reef');
  assert.match(await plate.locator('.rpg-plate-name small').innerText(), /^Boss: [A-Z]/);
  assert.match(await plate.innerText(), /Recommended Lv \d+–\d+/);
  assert.match((await plate.locator('.rpg-judge').innerText()).trim(), /^(Easy|Just right|Tough)$/);
  assert.match(await plate.innerText(), /\d+ floors? to the boss/);
  // 今日の手配書（今日の分を引き直したセーブ）・コインのかせぎ方の表
  assert.match(await txt(page, '#rpg-bounty .rpg-bounty-h'), /^Today’s Wanted posters \d\/\d$/);
  assert.equal((await txt(page, '#rpg-earn summary')).trim(), 'How to earn coins');
  await page.click('#rpg-earn summary');
  assert.match(await txt(page, '#rpg-earn caption'), /^Examples for one quiz/);
  assert.deepEqual(await jaLeft(page), []);
  // 章のタブ・冒険マップの SVG のダンジョン名
  assert.deepEqual((await page.locator('#rpg-chtabs button').allInnerTexts()).map(s => s.replace(/^\S+\s+/, '').trim()), ['Earth', 'Mirror Earth', 'Space']);
  assert.match(await txt(page, '.rpg-amap-h'), /^Adventure map\s+Dungeons \d+\/7 · Floors \d+\/35$/);
  assert.deepEqual(await page.locator('text.rpg-am-name').allTextContents(),
    ['Amazon Jungle', 'Coral Reef', 'Great Canyon', 'Old Castle Labyrinth', 'Mountains of the Sky', 'Savanna Plains', 'Map Eater’s Lair']);
  assert.match(await page.getAttribute('.rpg-am-node[data-d="samerica"]', 'aria-label'), /^Amazon Jungle \(5\/5 floors · cleared\)$/);
  // 旅人カード
  assert.match(await txt(page, '#rpg-stats'), /Lv 12.*Allies 4\/195/s);
  assert.match(await txt(page, '#rpg-next > span:last-child'), /^Take on Coral Reef F3! \(recommended Lv \d+\)/);
  assert.deepEqual(await jaLeft(page), []);
  // まだ引いたことがなく ●1,000 以上: ガチャの画面がある（Task 6 から）ので、つぎにやることは Draw 10。押すと Flag Draw
  await openHome(page, JA_SAVE);
  assert.equal((await txt(page, '#rpg-next > span:last-child')).trim(), 'Find allies first: try Draw 10 in the Flag Draw (●1,000 for World)');
  await page.click('#rpg-next');
  await shown(page, '#scr-gacha');
  assert.deepEqual(await jaLeft(page), []);
});

// 月（天体）は曜日の 月（Mon）と同じキーにしない: 宇宙の章の冒険マップと札で Moon と出る（Mon は出さない）
te('en_rpg_moon', async page => {
  await openHome(page, saveWith({ lv: 30, floors: MIRROR_CLEAR, story: ['ch1', 'ch2', 'ch3start'] }));
  await page.waitForFunction(() => $('rpg-ch3')?.getAttribute('aria-pressed') === 'true');
  const names = await page.locator('text.rpg-am-name').allTextContents();
  assert.deepEqual(names, ['Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Star Eater’s Lair']);
  assert.ok(!names.includes('Mon'));
  const plate = page.locator('#rpg-dgs .rpg-plate[data-d="moon"]');
  assert.equal((await plate.locator('.rpg-plate-name b').innerText()).trim(), 'Moon');
  assert.match(await plate.locator('.rpg-plate-theme').innerText(), /^Theme: Island Countries \(\d+ countries\)$/);
  assert.match(await page.getAttribute('.rpg-am-node[data-d="moon"]', 'aria-label'), /^Moon \(/);
  assert.match(await txt(page, '#rpg-next > span:last-child'), /^Take on Moon F1! \(recommended Lv \d+\)/);
  // PC の幅では冒険マップの SVG に名前が見える（スマホは札だけ）
  assert.equal(await page.locator('.rpg-am-node[data-d="moon"] text.rpg-am-name').isVisible(), true);
  assert.doesNotMatch(await page.locator('#scr-rpg').innerText(), /\bMon\b/);
  assert.equal(await page.evaluate(() => RPG.dgName(RPG_CORE.dungeonOf('moon'))), 'Moon');
  assert.equal(await page.evaluate(() => RPG.dgLand(RPG_CORE.dungeonOf('moon'))), 'Moon');
  assert.deepEqual(await jaLeft(page), []);
}, { viewport: PC });

te('en_rpg_story', async page => {
  await openHome(page, { ...JA_SAVE, story: [] });
  await shown(page, '#rpg-story-dlg[open]');
  assert.deepEqual((await page.locator('#rpg-story-dlg .rpg-story-h').allInnerTexts()).map(s => s.trim()), ['🌍 Earth cleared!', '🪞 Chapter 2: Mirror Earth']);
  assert.equal((await page.locator('#rpg-story-dlg .rpg-story p').allInnerTexts()).length, 6);
  assert.equal((await txt(page, '#rpg-story-ok')).trim(), 'Continue the Adventure');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#rpg-story-ok');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpg')).story.includes('ch1'));
});

// 旅人カードの称号: 英語のカタログの称号は “…”、カタログに無い称号は出さない。badge:title でその場で描き直す
te('en_rpg_title', async page => {
  await openHome(page, JA_SAVE);
  await page.waitForFunction(() => window.BADGES?.title?.());
  const label = await page.evaluate(() => BADGES.titleLabel(BADGES.title()));
  assert.match(label, /^[A-Z]/);
  assert.equal((await txt(page, '#rpg-title')).trim(), `“${label}”`);
  assert.deepEqual(await jaLeft(page), []);
  // カタログに無い称号（作り物）→ 出さない（その場の描き直しでも、描き直した冒険ホームでも）
  await page.evaluate(() => { window.__title = BADGES.title; BADGES.title = () => 'つくりものの称号'; document.dispatchEvent(new CustomEvent('badge:title', { detail: { key: 'x', title: 'つくりものの称号' } })); });
  assert.equal(await page.locator('#rpg-title').textContent(), '');
  await page.evaluate(() => RPG.refresh());
  assert.equal(await page.locator('#rpg-title').textContent(), '');
  // カタログの称号にもどす → その場で英語
  await page.evaluate(() => { BADGES.title = window.__title; document.dispatchEvent(new CustomEvent('badge:title', { detail: {} })); });
  assert.equal((await page.locator('#rpg-title').textContent()), `“${label}”`);
  assert.deepEqual(await jaLeft(page), []);
}, { blockScripts: [], storage: { badges: { ...QUIET_BADGES, eq: 'ta-clear@1' } } });

te('en_rpg_name_ugc', async (page, { db }) => {
  await openHome(page, JA_SAVE);
  assert.equal((await txt(page, '#rpg-name')).trim(), 'Traveler');
  assert.equal(await page.getAttribute('#rpg-name', 'data-ugc'), null);
  db.profiles.push({ id: 1, pid: 'rpgpid000001', token: 'tok-rpg', nickname: 'チコ' });
  await page.evaluate(() => localStorage.setItem('profile', JSON.stringify({ token: 'tok-rpg', pid: 'rpgpid000001', name: 'チコ', auto: true, isPublic: true, sent: { isPublic: true } })));
  await openHome(page, JA_SAVE);
  assert.equal((await txt(page, '#rpg-name')).trim(), 'チコ');
  assert.equal(await page.getAttribute('#rpg-name', 'data-ugc'), '');
  assert.deepEqual(await jaLeft(page), []);
});

// PR7 の en_coins_headless の書きかえ: 英語でもコインの表示（#pcoin・はじめてのコインのトースト・結果のコインの欄）が出る
te('en_rpg_coins_ui', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await answerCorrect(page);
  await frames(page);
  assert.match(await txt(page, '#pcoin'), /^\+\d+/);
  await page.waitForFunction(() => window.__toasts.some(s => s.startsWith('You earned coins!')));
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#next');
  await clearByAnswering(page);
  await shown(page, '#rpg-res');
  assert.match((await txt(page, '#rpg-res .rpg-res-head')).trim(), /^\+[\d,]+ coins You have [\d,]+$/);
  assert.match(await txt(page, '#rpg-res-go'), /^Go to the Adventure →/);
  assert.match(await txt(page, '#rpg-res .rpg-res-rows'), /…… \d+/);
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual((await toastTexts(page)).filter(s => JA_TEXT.test(s)), []);
  await settleResult(page);
  await page.click('#rpg-res-go');
  await shown(page, '#rpg-intro');
  assert.deepEqual(await jaLeft(page), []);
});

te('en_rpg_settings', async page => {
  await writeSave(page, JA_SAVE);
  await page.evaluate(() => show('settings'));
  await shown(page, '#set-rpg');
  const field = page.locator('.field', { has: page.locator('#set-rpg') });
  assert.equal((await field.locator('.lbl').innerText()).trim(), 'Adventure');
  assert.equal((await field.locator('label.switch').innerText()).trim(), 'Show the Adventure (coins and RPG)');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#set-rpg');
  await page.evaluate(() => show('home'));
  assert.equal(await page.isVisible('#home-rpg'), false);
  assert.equal(await page.isVisible('#rpg-chip'), false);
  assert.equal((await saved(page)).show, false);
});

// PR7 の en_rpg_hash_home の書きかえ: en/#rpg で冒険ホームが開く
te('en_rpg_hash', async page => {
  await writeSave(page, JA_SAVE);
  await page.goto('about:blank');   // en/ → en/#rpg は読み込み直さないので、いったん離れる
  await page.goto(new URL('en/#rpg', server.url).href);
  await shown(page, '#rpg-hero');
  assert.equal(await page.evaluate(() => document.body.dataset.screen), 'rpg');
  assert.deepEqual(await jaLeft(page), []);
});

// PR7 の en_rpg_broken_save_quiet の書きかえ: 写しを取り、英語のトーストを1回
te('en_rpg_broken_save_toast', async page => {
  await writeSave(page, '{bad');
  await frames(page);
  const copies = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('rpg-broken-')).map(k => localStorage.getItem(k)));
  assert.deepEqual(copies, ['{bad']);
  assert.equal((await saved(page)).v, 1);
  assert.deepEqual(await toastTexts(page), ['Couldn’t read your Adventure data, so it started over']);
  assert.deepEqual(await jaLeft(page), []);
});

te('en_rpg_readonly_warn', async page => {
  await writeSave(page, { v: 99, intro: true, coins: 99999 });
  await frames(page);
  const msg = /^Found data from a newer version\. Please reload the page/;
  assert.ok((await toastTexts(page)).some(s => msg.test(s)), JSON.stringify(await toastTexts(page)));
  await page.evaluate(() => show('rpg'));
  await shown(page, '#rpg-warn');
  assert.match(await txt(page, '#rpg-warn'), msg);
  const before = await page.evaluate(() => localStorage.getItem('rpg'));
  if (await page.isEnabled('#rpg-lvup')) await page.click('#rpg-lvup');
  assert.equal(await page.evaluate(() => localStorage.getItem('rpg')), before);
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual((await toastTexts(page)).filter(s => JA_TEXT.test(s)), []);
});

te('en_rpg_data_transfer', async page => {
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await openHome(page, JA_SAVE);
  assert.equal((await txt(page, '#rpg-data summary')).trim(), 'Data (transfer code)');
  await page.click('#rpg-data summary');
  await page.waitForFunction(() => $('rpg-code-out').value.length > 10);
  assert.deepEqual(await jaLeft(page), []);
  const code = await page.evaluate(() => $('rpg-code-out').value);
  await openHome(page, saveWith({ lv: 3 }));
  await page.click('#rpg-data summary');
  await page.fill('#rpg-code-in', code);
  await page.click('#rpg-code-load');
  await page.waitForFunction(() => window.__toasts.includes('Restored from your transfer code'));
  assert.match(dialogs[0], /^Overwrite your current data\? \(Lv 3 · 0 allies → Lv 12 · 4 allies\)$/);
  assert.deepEqual(dialogs.filter(s => JA_TEXT.test(s)), []);
  assert.equal((await saved(page)).lv, 12);
  assert.deepEqual(await jaLeft(page), []);
  // 正しくないコード（データの欄は開いたまま描き直す）
  assert.equal(await page.evaluate(() => $('rpg-data').open), true);
  await page.fill('#rpg-code-in', 'CQ1.bad');
  await page.click('#rpg-code-load');
  assert.equal((await txt(page, '#rpg-code-msg')).trim(), 'That code doesn’t look right');
});

// 英語で遊んでもセーブは日本語版と同じ。何もしなければ英語↔日本語で開いても rpg の文字は変わらない
te('en_rpg_save_roundtrip', async page => {
  await writeSave(page, saveWith({ lv: 3, coins: 50 }));
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await clearByAnswering(page);
  await shown(page, '#rpg-res');
  const earned = await saved(page);
  assert.ok(earned.coins > 50);
  await page.evaluate(() => RPG.debug.give(5000));
  await page.evaluate(() => show('rpg'));
  await page.click('#rpg-lvup');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rpg')).lv === 4);
  const en = await saved(page);
  const raw = () => page.evaluate(() => localStorage.getItem('rpg'));
  await page.goto(server.url);
  await page.waitForFunction(() => window.RPG);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  assert.deepEqual(await page.evaluate(() => [RPG.get().lv, RPG.get().coins]), [en.lv, en.coins]);
  const r0 = await raw();
  await page.goto(new URL('en/', server.url).href);
  await page.waitForFunction(() => window.RPG);
  const r1 = await raw();
  await page.goto(server.url);
  await page.waitForFunction(() => window.RPG);
  assert.equal(r1, r0);
  assert.equal(await raw(), r0);
});

// PR7 の en_profile_no_decorations・en_deco_hidden_with_rpg の書きかえ: 英語でもかざりの欄は日本語と同じく出す。窓の中（仲間のカード）も英語（Task 6）
te('en_profile_decorations', async (page, { db }) => {
  // プロフィールがまだ無い: はじめの文（PR8 の Task 1 で冒険ランキングを足した文）
  await page.click('#home-profile');
  await page.locator('#scr-profile:not([hidden])').waitFor();
  assert.equal((await txt(page, '#pf-main .pf-lead')).trim(), 'With a profile, your name appears on the Time Attack, Daily Puzzle, and Adventure leaderboards.');
  assert.deepEqual(await jaLeft(page), []);
  db.profiles.push({ id: 1, pid: 'rpgpid000002', token: 'tok-rpg2', nickname: 'Chiko' });
  await page.evaluate(() => localStorage.setItem('profile', JSON.stringify({ token: 'tok-rpg2', pid: 'rpgpid000002', name: 'Chiko', auto: true, isPublic: true, sent: { isPublic: true } })));
  const openProfile = async () => {
    await page.evaluate(() => show('home'));
    await page.click('#home-profile');
    await page.locator('#pf-me').waitFor();
  };
  // 冒険をはじめていない: 欄の文だけ
  await writeSave(page, saveWith({ intro: false }));
  await openProfile();
  assert.deepEqual(await page.locator('#pf-main .field > .lbl').allInnerTexts(), ['Change nickname', 'Decorations', 'Settings']);
  assert.equal(await page.locator('#pf-deco').count(), 0);
  assert.deepEqual(await jaLeft(page), []);
  // はじめた: ［Choose decorations in Adventure］→ 冒険ホーム
  await writeSave(page, JA_SAVE);
  await openProfile();
  assert.equal((await txt(page, '#pf-deco')).trim(), 'Choose decorations in Adventure');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#pf-deco');
  await shown(page, '#rpg-hero');
  // かざりを選ぶ窓: 見出し・仲間のカード（英語の国名）・［OK］
  await page.click('#rpg-deco');
  await shown(page, '#rpg-deco-dlg[open]');
  assert.match(await txt(page, '#rpg-deco-h'), /^Choose decorations/);
  assert.deepEqual(await page.locator('#rpg-deco-grid .rpg-card-name').allInnerTexts(), ['Brazil', 'Japan', 'France', 'Saint Kitts and Nevis']);
  assert.equal((await txt(page, '#rpg-deco-ok')).trim(), 'OK');
  assert.deepEqual(await jaLeft(page), []);
  // 日本語版: 冒険をはじめたセーブでは［冒険でかざりを選ぶ］が出る（profile.js の canDeco を英語と同じにしたので、日本語も見ておく）
  await page.keyboard.press('Escape');
  await page.goto(new URL('./', server.url).href);
  await page.waitForFunction(() => window.PROFILE && window.RPG);
  await page.evaluate(() => PROFILE.ready);
  await openProfile();
  assert.deepEqual(await page.locator('#pf-main .field > .lbl').allInnerTexts(), ['名前を変える', 'かざり', '設定']);
  assert.equal(await page.locator('#pf-deco').count(), 1);
  assert.equal((await txt(page, '#pf-deco')).trim(), '冒険でかざりを選ぶ');
});

// PR7 の en_no_persist_headless の書きかえ: 英語でもコインを書けたら消されにくい保存を1回頼む（日本語と同じ）
te('en_persist_like_ja', async page => {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await clearByAnswering(page);
  await shown(page, '#rpg-res');
  assert.ok((await saved(page)).earned > 0);
  assert.equal(await page.evaluate(() => window.__persist || 0), 1);
}, { init: () => { StorageManager.prototype.persist = function () { window.__persist = (window.__persist || 0) + 1; return Promise.resolve(false); }; } });

// 390px と 1280×800 で、冒険ホーム（いちばん長い英語のダンジョン名の札・冒険マップ・旅人カード）が横にはみ出さない
for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) te(`en_rpg_home_fit_${vname}`, async page => {
  // いちばん長い英語の称号をつけたことにする（本物の badges.js のカタログから選ぶ）
  const stubTitle = () => page.evaluate(() => {
    const K = BADGES_CORE, ja = K.titlesOf(K.makeCatalog(C)).reduce((a, b) => T(b).length > T(a).length ? b : a);
    BADGES.title = () => ja;
    return T(ja);
  });
  // 長い名前: Mirror North/Central America の章（鏡の地球）の札と、いちばん長いダンジョン名
  for (const [save, ids] of [[saveWith({ lv: 30, floors: { ...EARTH_CLEAR, msamerica: 5, moceania: 5, mnamerica: 2 }, story: ['ch1'] }), ['mnamerica', 'mworld']],
    [JA_SAVE, ['namerica', 'europe', 'world']]]) {
    await writeSave(page, save);
    const title = await stubTitle();
    await page.evaluate(() => RPG.open('rpg'));
    await shown(page, '#scr-rpg');
    assert.equal((await page.locator('#rpg-title').textContent()), `“${title}”`);
    for (const id of ids) {
      await page.evaluate(id => { const n = document.querySelector(`.rpg-am-node[data-d="${id}"]`); n?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }, id);
      const over = await page.evaluate(() => {
        const iw = document.documentElement.clientWidth, out = [];
        for (const el of document.querySelectorAll('#scr-rpg *')) {
          if (!el.checkVisibility() || el.closest('svg')) continue;
          const r = el.getBoundingClientRect();
          if (r.right > iw + 0.5 || r.left < -0.5) out.push(`${el.tagName}.${el.className} ${r.left}-${r.right}`);
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.clientWidth && !['SVG', 'svg'].includes(el.tagName)) {
            const s = getComputedStyle(el);
            if (s.whiteSpace === 'nowrap') out.push(`nowrap ${el.tagName}.${el.className}`);
          }
        }
        return { out, sw: document.documentElement.scrollWidth, iw };
      });
      assert.deepEqual(over.out, [], id);
      assert.ok(over.sw <= over.iw, `${id}: 横にスクロールする ${over.sw} > ${over.iw}`);
      // 冒険マップの SVG の名前は SVG の枠の中
      const svgOver = await page.evaluate(() => {
        const svg = document.querySelector('.rpg-amap-svg'), b = svg.getBoundingClientRect(), out = [];
        for (const t of svg.querySelectorAll('text.rpg-am-name')) { const r = t.getBoundingClientRect(); if (!r.width) continue; if (r.left < b.left - 1 || r.right > b.right + 1) out.push(`${t.textContent} ${r.left}-${r.right} / ${b.left}-${b.right}`); }
        return out;
      });
      assert.deepEqual(svgOver, [], id);
    }
  }
  assert.deepEqual(await jaLeft(page), []);
}, { viewport, blockScripts: [] });

/* ---------- Task 6: 仲間のカード・国旗ガチャ（rpg-cards.js）を英語に ---------- */
const openGacha = async (page, save, opts = {}) => {
  await writeSave(page, save);
  await page.evaluate(o => RPG.open('gacha', o), opts);
  await shown(page, '#ga-10');
};
const FREE_TODAY = { d: localToday(), n: {}, first: true, free: false };
// 10回引いて［Skip］で演出をとばし、結果が全部表になるまで
const drawTen = async page => {
  await page.click('#ga-10');
  await shown(page, '#ga-skip');
  assert.equal((await txt(page, '#ga-skip')).trim(), 'Skip');
  await page.click('#ga-skip');
  await page.waitForFunction(() => document.querySelectorAll('#ga-res .rpg-card').length === 10 && !document.querySelector('#ga-res .rpg-card.is-back'));
};
// 引く国を codes だけにする（RPG_CORE.pull に渡す国の並びをしぼる。コイン・天井・カードは本物の処理）
const onlyDraw = (page, codes) => page.evaluate(codes => {
  const pull = RPG_CORE.pull;
  RPG_CORE.pull = (x, r, n, rnd, cs) => pull(x, r, n, rnd, cs.filter(c => codes.includes(c.a)));
}, codes);
const LONG = ['vc', 'cd', 'fm', 'cf', 'ba', 'li', 'gw'];

te('en_gacha', async page => {
  await openGacha(page, saveWith({ coins: 1200, day: FREE_TODAY }));
  assert.deepEqual(await jaLeft(page), []);
  assert.equal((await txt(page, '#scr-gacha .rpg-h2')).trim(), 'Flag Draw');
  assert.equal((await txt(page, '#scr-gacha .rpg-back')).trim(), '← Adventure');
  assert.equal((await txt(page, '#ga-q')).trim(), 'Which countries will you meet?');
  assert.equal((await txt(page, '#ga-1')).trim(), 'Draw 1 100');
  assert.equal((await txt(page, '#ga-10')).trim(), 'Draw 10 1,000');
  assert.equal((await txt(page, '#ga-free')).trim(), 'Free draw');
  assert.equal((await txt(page, '#ga-pity')).trim(), 'Guaranteed ★3 in 50 draws');
  const rates = await txt(page, '#ga-rates');
  for (const x of ['Odds', '★3 Gold 3% / ★2 Silver 17%', '★1 Bronze 80%', 'If no ★3 comes, draw 50 is a guaranteed ★3', 'World: 1/195 = 0.5% each'])
    assert.ok(rates.includes(x), `${x}: ${rates}`);
  assert.match(await txt(page, '#ga-pack .rpg-pack-sub'), /^Not met yet 195\/195$/);
  assert.equal(await page.getAttribute('#ga-pack .rpg-pack', 'aria-label'), 'World Flag Pack');
  assert.equal((await txt(page, '#ga-empty')).trim(), 'Cards you draw will appear here');
  // 地域のチップは英語の地域名（値は日本語のまま）
  const chips = (await page.locator('#ga-regions .chip').allInnerTexts()).map(s => s.replace(/\s*\d+\/\d+$/, '').trim());
  assert.equal(chips[0], 'World');
  for (const c of chips) assert.doesNotMatch(c, JA_TEXT);
  await page.click('#ga-regions .chip[data-r="南アメリカ"]');
  assert.match(await txt(page, '#ga-rates'), /South America: 1\/12 = 8\.3% each/);
  assert.match(await txt(page, '#ga-pack .rpg-pack-tag.is-mul'), /×1\.5/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#ga-regions .chip[data-r="all"]');
  // 10回引く → 国名は英語・ラベルは英語
  await drawTen(page);
  const shownNames = await page.locator('#ga-res .rpg-card-name').allInnerTexts();
  const want = await page.evaluate(() => [...document.querySelectorAll('#ga-res .rpg-card')].map(b => cName(byA.get(b.dataset.a))));
  assert.deepEqual(shownNames.map(s => s.replace(/\s+/g, ' ').trim()), want);
  for (const l of await page.locator('#ga-res .rpg-lab').allInnerTexts()) assert.match(l.trim(), /^(NEW|Rank up|Stack \+1|Coins back \d+)$/);
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual((await toastTexts(page)).filter(s => JA_TEXT.test(s)), []);
  // 地域の国を全部仲間にしたパック
  const oc = await page.evaluate(() => C.filter(c => c.r === 'オセアニア').map(c => c.a));
  await openGacha(page, saveWith({ coins: 0, cards: Object.fromEntries(oc.map(a => [a, [1, 0]])) }), { region: 'オセアニア' });
  assert.equal((await txt(page, '#ga-pack .rpg-pack-sub')).trim(), `All ${oc.length} countries met!`);
  assert.equal(await page.getAttribute('#ga-pack .rpg-pack', 'aria-label'), 'Oceania Flag Pack');
  assert.match(await txt(page, '#ga-need'), /^Need \d[\d,]* more$/);
  assert.deepEqual(await jaLeft(page), []);
});

// 1回の演出（パック → カード1枚）も英語
te('en_gacha_stage', async page => {
  await openGacha(page, saveWith({ coins: 100 }));
  await onlyDraw(page, ['vc']);
  await page.click('#ga-1');
  await shown(page, '#ga-stage-in .rpg-gstage-say');
  assert.match((await txt(page, '#ga-stage-in .rpg-gstage-say')).trim(), /^(…It glowed gold!|Sparkle!|Which country will it be\?)$/);
  assert.deepEqual(await jaLeft(page), []);
  await shown(page, '#ga-stage-in .rpg-gst-say');
  assert.match((await txt(page, '#ga-stage-in .rpg-gst-say')).trim(), /^Saint Vincent and the Grenadines ★+$/);
  assert.deepEqual(await jaLeft(page), []);
}, { reducedMotion: 'reduce' });

te('en_gacha_errors', async page => {
  // ほかのタブでコインを使った
  await openGacha(page, saveWith({ coins: 100 }));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rpg')); d.coins = 0; localStorage.setItem('rpg', JSON.stringify(d)); });
  await page.click('#ga-1');
  assert.equal((await txt(page, '#ga-msg')).trim(), 'Not enough coins, so nothing was drawn (maybe you used them in another tab)');
  assert.deepEqual(await jaLeft(page), []);
  // 今日の無料1回がない（まだクイズをクリアしていない・もう使った）
  await openGacha(page, saveWith({ coins: 0, day: { ...FREE_TODAY, first: false } }));
  assert.equal((await txt(page, '#ga-free')).trim(), 'Clear a quiz today for a free draw');
  await page.evaluate(() => { $('ga-free').disabled = false; $('ga-free').click(); });
  assert.equal((await txt(page, '#ga-msg')).trim(), 'You’ve already used today’s free draw, or you haven’t cleared a quiz today yet');
  await openGacha(page, saveWith({ coins: 0, day: FREE_TODAY }));
  await page.click('#ga-free');
  await page.evaluate(() => $('ga-flipall').click());
  assert.equal((await txt(page, '#ga-free')).trim(), 'Come back tomorrow');
  assert.deepEqual(await jaLeft(page), []);
  // 保存できない
  await openGacha(page, saveWith({ coins: 100 }));
  await page.evaluate(() => { window.__fail = true; });
  await page.click('#ga-1');
  assert.equal((await txt(page, '#ga-msg')).trim(), 'Couldn’t save, so nothing was drawn');
  await page.evaluate(() => { window.__fail = false; });
  assert.deepEqual(await jaLeft(page), []);
  // 新しい版のデータ（引けない）
  await openGacha(page, { v: 99, intro: true, coins: 5000 });
  assert.match(await txt(page, '#ga-warn'), /^Found data from a newer version/);
  assert.deepEqual(await jaLeft(page), []);
  assert.deepEqual((await toastTexts(page)).filter(s => JA_TEXT.test(s)), []);
}, { init: () => {
  const { setItem } = Storage.prototype;
  Storage.prototype.setItem = function (k, v) { if (k === 'rpg' && window.__fail) throw new DOMException('full', 'QuotaExceededError'); return setItem.call(this, k, v); };
} });

te('en_cards', async page => {
  await writeSave(page, JA_SAVE);
  await page.evaluate(() => RPG.open('cards'));
  await shown(page, '#scr-cards');
  assert.equal((await txt(page, '#cd-count')).trim(), 'Allies 4 / 195');
  assert.equal((await txt(page, '#scr-cards .rpg-back')).trim(), '← Adventure');
  const chips = (await page.locator('#cd-regions .chip').allInnerTexts()).map(s => s.replace(/\s*\d+\/\d+$/, '').trim());
  assert.equal(chips[0], 'All');
  assert.ok(chips.includes('South America') && chips.includes('Oceania'), chips.join());
  assert.equal(await page.getAttribute('#cd-regions', 'aria-label'), 'Filter by region');
  // 並び: ★の多い順、同じ★の中は英語の ABC 順
  const order = await page.evaluate(() => [...document.querySelectorAll('#cd-grid .rpg-card')].map(b => [+b.dataset.star, cName(byA.get(b.dataset.a))]));
  assert.deepEqual(order.slice(0, 4).map(x => x[1]), ['Brazil', 'Japan', 'France', 'Saint Kitts and Nevis']);
  const none = order.filter(x => x[0] === 0).map(x => x[1]);
  assert.deepEqual(none, [...none].sort((x, y) => x.localeCompare(y, 'en')));
  assert.equal(none[0], 'Afghanistan');
  // まだ仲間でない国のカード
  assert.match(await txt(page, '#cd-grid .rpg-card[data-a="de"] .rpg-card-hint'), /^2 more correct answers to make it your ally \(counts once per game\)$/);
  assert.equal(await page.getAttribute('#cd-grid .rpg-card[data-a="jp"] .rpg-card-fr', 'title'), 'Friendship');
  assert.equal(await page.getAttribute('#cd-grid .rpg-card[data-a="jp"] .rpg-card-stack', 'title'), 'Stack 1/4');
  // 仲間の世界地図
  assert.equal(await page.getAttribute('#cd-map svg', 'aria-label'), 'World map of your allies (Allies 4/195)');
  assert.deepEqual((await page.locator('#cd-map .rpg-legend li').allInnerTexts()).map(s => s.trim()), ['★1 Bronze', '★2 Silver', '★3 Gold', 'Not yet']);
  assert.deepEqual(await jaLeft(page), []);
  // カードの詳細
  await page.click('#cd-grid .rpg-card[data-a="jp"]');
  await shown(page, '#detail[open]');
  const info = (await txt(page, '#detail .rpg-cd-info')).replace(/\s+/g, ' ');
  assert.match(info, /^★2 Silver · Stack ●○○○ · Friendship ♥0\/10 Attack \d+\.\d \(no Region bonus\) · HP \d+\.\d Region bonus ×1\.5 in Asia dungeons and the Map Eater’s Lair$/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail .close');
  // まだ仲間でない国の詳細
  await page.click('#cd-grid .rpg-card[data-a="de"]');
  await shown(page, '#detail[open]');
  assert.match((await txt(page, '#detail .rpg-cd-info')).replace(/\s+/g, ' '), /^Not an ally yet \(Friendship ♥3\/10\) 2 more correct answers to make it your ally/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail .close');
  // 地域でしぼる
  await page.click('#cd-regions .chip[data-r="南アメリカ"]');
  assert.equal(await page.locator('#cd-grid .rpg-card').count(), 12);
  assert.deepEqual(await jaLeft(page), []);
});

// 50か国目の仲間 → ［Share］の文は Flag Quest をふくみ #FlagMaster で終わる。URL は英語版
te('en_cards_share', async page => {
  // 49か国を持ち、持っていない10か国だけから引く（1枚目はかならず NEW なので、乱数に依らず50か国をこえる。同じ国が2回出ると かさね）
  const codes = await page.evaluate(() => C.slice(0, 49).map(c => c.a)), fresh = await page.evaluate(() => C.slice(49, 59).map(c => c.a));
  await openGacha(page, saveWith({ coins: 1000, cards: Object.fromEntries(codes.map(a => [a, [1, 0]])) }));
  await onlyDraw(page, fresh);
  await drawTen(page);
  assert.ok(Object.keys((await saved(page)).cards).length >= 50);
  await shown(page, '#ga-share .rpg-share-row');
  assert.equal((await txt(page, '#ga-share .rpg-share-row span')).trim(), '🎉 You now have 50 allies!');
  assert.equal((await txt(page, '#ga-share .rpg-share')).trim(), 'Share');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#ga-share .rpg-share');
  const s = await page.evaluate(() => window.__shared);
  assert.match(s.text, /Flag Quest/);
  assert.match(s.text, /50 allies/);
  assert.match(s.text, /#FlagMaster$/);
  assert.doesNotMatch(s.text, JA_TEXT);
  assert.match(s.url, /\/country-drill\/en\/$/);
  // 地域の国を全部仲間にした
  const m = await page.evaluate(() => RPG.milestones([], C.filter(c => c.r === 'オセアニア').map(c => c.a)).find(x => x.kind.startsWith('region-')));
  assert.equal(m.msg, 'Every country in Oceania is now your ally!');
  assert.match(m.text, /^Every country in Oceania is now my ally in Flag Quest! Allies: \d+\/195 countries #FlagMaster$/);
}, { init: () => { navigator.share = o => { window.__shared = o; return Promise.resolve(); }; } });

// 390px: いちばん長い英語の国名のカードが、ガチャの10枚の結果・1枚の演出・仲間の一覧で枠からはみ出さない
const nameOver = (page, sel) => page.evaluate(sel => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!el.checkVisibility({ visibilityProperty: true })) continue;
    const card = el.closest('.rpg-card').getBoundingClientRect(), r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 0.5 || r.left < card.left - 0.5 || r.right > card.right + 0.5) out.push(`${el.textContent} ${el.scrollWidth}/${el.clientWidth}`);
    // overflow-wrap: break-word なので、入らない語ははみ出さずに語の途中で折れる。語ごとに1行に入っていること
    const t = el.firstChild;
    if (t?.nodeType !== 3) continue;
    for (const m of t.data.matchAll(/\S+/g)) {
      const rg = document.createRange();
      rg.setStart(t, m.index);
      rg.setEnd(t, m.index + m[0].length);
      if (new Set([...rg.getClientRects()].map(x => Math.round(x.top))).size > 1) out.push(`${el.textContent}: ${m[0]} が途中で折れる`);
    }
  }
  return { out, n: document.querySelectorAll(sel).length, sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth };
}, sel);
// 1280px（PC）の結果は5列（900px から）、1440px は10列（rpg.css の 1400px から。いちばん細いカード）
for (const [vname, viewport] of [['phone', PHONE], ['pc', PC], ['wide', { width: 1440, height: 900 }]]) te(`en_cards_fit_${vname}`, async page => {
  await openGacha(page, saveWith({ coins: 1100 }));
  await onlyDraw(page, LONG);
  await drawTen(page);
  let r = await nameOver(page, '#ga-res .rpg-card-name');
  assert.equal(r.n, 10);
  assert.deepEqual(r.out, []);
  assert.ok(r.sw <= r.iw, `${r.sw} > ${r.iw}`);
  // 1枚の演出（めくれるまで待つ）
  await page.click('#ga-1');
  await page.waitForFunction(() => document.querySelector('#ga-stage-in .rpg-gst-card .rpg-card:not(.is-back)'));
  r = await nameOver(page, '#ga-stage-in .rpg-card-name');
  assert.equal(r.n, 1);
  assert.deepEqual(r.out, []);
  assert.ok(r.sw <= r.iw, `${r.sw} > ${r.iw}`);
  await page.click('#ga-skip');
  // 仲間の一覧（長い名前の国だけ）
  await writeSave(page, saveWith({ cards: Object.fromEntries(LONG.map(a => [a, [3, 4]])) }));
  await page.evaluate(() => RPG.open('cards'));
  await shown(page, '#scr-cards');
  r = await nameOver(page, '#cd-grid .rpg-card-name');
  assert.ok(r.n >= 195);
  assert.deepEqual(r.out, []);
  assert.ok(r.sw <= r.iw, `${r.sw} > ${r.iw}`);
  assert.deepEqual(await jaLeft(page), []);
}, { viewport });

// 日本語の見張り（preflight C7）: RPG.gainLines が今までの日本語の行と1文字も同じ（結果のパネルの {joinMax: 5, joinHint: true} と、バトルが使う {}）。
// RPG.names は知らない国コードをそのまま出してエスケープする（C8）。ja_rpg_unchanged の結果の画面ではこの行が出ないので、ここで決まった rc を渡して見る
test('ja_gain_lines', { timeout: 60_000 }, async () => {
  const app = await openRpg(browser, { seed: 1 });
  try {
    const r = await app.page.evaluate(() => {
      const rc = { joined: ['jp', 'fr', 'br', 'de', 'it', 'es', 'kn', 'zz'], promoted: ['jp', 'fr'], overcome: ['br'], bounty: ['de', 'it', 'es'], bountyAll: true };
      return {
        res: RPG.gainLines(rc, { joinMax: 5, joinHint: true }),
        battle: RPG.gainLines(rc),
        noAll: RPG.gainLines({ ...rc, joined: ['jp'], bountyAll: false }, { joinMax: 5, joinHint: true }),
        empty: RPG.gainLines({ joined: [], promoted: [], overcome: [], bounty: [], bountyAll: false }),
        names: RPG.names(['zz', 'jp', '<x>']),
      };
    });
    assert.deepEqual(r.res, [
      '🤝 日本・フランス・ブラジル・ドイツ・イタリアほか3か国が仲間になった！（5回正解した国は仲間になるよ）',
      '🏅 日本・フランスがシルバーに！',
      '✨ 克服！ ブラジルはもう苦手じゃない +30',
      '📜 手配書 ドイツ・イタリア・スペイン +90（3件ぜんぶ +100）',
    ]);
    assert.deepEqual(r.battle, [
      '🤝 日本・フランス・ブラジル・ドイツ・イタリア・スペイン・セントクリストファー・ネービス・zzが仲間になった！',
      '🏅 日本・フランスがシルバーに！',
      '✨ 克服！ ブラジルはもう苦手じゃない +30',
      '📜 手配書 ドイツ・イタリア・スペイン +90（3件ぜんぶ +100）',
    ]);
    assert.deepEqual(r.noAll, [
      '🤝 日本が仲間になった！（5回正解した国は仲間になるよ）',
      '🏅 日本・フランスがシルバーに！',
      '✨ 克服！ ブラジルはもう苦手じゃない +30',
      '📜 手配書 ドイツ・イタリア・スペイン +90',
    ]);
    assert.deepEqual(r.empty, []);
    assert.equal(r.names, 'zz・日本・&lt;x&gt;');
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});

/* ---------- 英語のバトル・英雄の塔（Task 8: rpg-battle.js） ---------- */
const bstate = page => page.evaluate(() => RPG_BATTLE.state());
const logLast = page => page.evaluate(() => $('bt-log').lastElementChild?.textContent ?? '');
// いまの問題にまちがえて、答え合わせが出るまで（［つぎへ］は押さない）。答えだった国コードを返す
const missOnce = async page => {
  await battleGuard(page);
  const a = await page.evaluate(() => RPG_BATTLE.cur());
  await page.locator(`#scr-battle .choice:not([data-a="${a}"])`).first().click();
  await page.locator('#bt-reveal').waitFor();
  return a;
};
const BR_AR = { lv: 5, cards: { br: [1, 0], ar: [1, 0] }, teams: [{ n: '編成1', c: ['br', 'ar'] }] };
const enOf = (page, as) => page.evaluate(as => as.map(a => [cName(byA.get(a)), cCap(byA.get(a))]), as);

// spec の「冒険のバトルを1回最後まで遊べる」: 会う画面 → まちがえ1回・正解 → 勝つ
te('en_battle_win', async page => {
  await writeSave(page, saveWith(BR_AR));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await shown(page, '#bt-fight');
  assert.match((await txt(page, '#bt-intro .rpg-bmeet')).trim(), /^\S+ [A-Z][\w’ -]+ appeared!$/);
  assert.equal((await txt(page, '#bt-fight')).trim(), 'Fight');
  assert.equal((await txt(page, '#bt-flee')).trim(), '← Run');
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Amazon Jungle · F1');
  assert.match(await txt(page, '#bt-intro'), /Correct answers to win: about \d+ · Mistakes allowed: up to \d+/);
  assert.match(await txt(page, '#bt-intro'), /Answer correctly to attack! A wrong answer brings a counterattack\./);
  // 編成の行: 既定の名前は Team 1（data-ugc にしない）・チームボーナス
  assert.equal((await txt(page, '#bt-tname')).trim(), 'Team 1');
  assert.equal(await page.locator('#bt-tname [data-ugc]').count(), 0);
  assert.equal((await page.locator('.rpg-bteam-b').textContent()).trim(), 'Team bonus: South America×2 +10%');
  assert.equal((await txt(page, '#bt-team')).trim(), 'Edit team');
  const mon = await page.evaluate(() => RPG.monName(RPG_CORE.MONSTERS.samerica[0]));
  assert.equal(await page.getAttribute('#bt-ehp', 'aria-label'), `${mon}’s HP`);
  assert.equal((await txt(page, '#scr-battle .rpg-hpname')).trim(), mon);
  assert.equal(await page.getAttribute('#bt-hhp', 'aria-label'), 'Traveler’s HP');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  assert.ok(['Which country has this flag?', 'Which flag belongs to this country?', 'Which flag belongs to the highlighted country?']
    .includes((await txt(page, '#bt-q .qlabel')).trim()));
  assert.match(await txt(page, '#bt-left'), /^Misses left \d+$/);
  assert.deepEqual(await jaLeft(page), []);
  // まちがえる: 答え合わせと反撃のログ
  const a = await missOnce(page);
  const [[name]] = await enOf(page, [a]);
  assert.equal((await txt(page, '#bt-reveal .verdict')).trim(), `Not quite. The answer is ${name}.`);
  assert.match(await logLast(page), /^.+ counterattacks! \d+ damage$/);
  assert.equal((await txt(page, '#bt-next')).trim(), 'Next ⏎');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-next');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  // 正解: ダメージのログ（会心・援護つき）
  const b = await page.evaluate(() => RPG_BATTLE.cur());
  const [[bn]] = await enOf(page, [b]);
  await battleAnswer(page, true);
  const log = await logLast(page);
  assert.ok(log.startsWith(`${bn}! `) || log.startsWith(`Critical hit! ${bn}! `), log);
  assert.match(log, /! \d+ damage to .+ \(with help from Brazil · Argentina\)$/);
  await winBattle(page);
  assert.match((await txt(page, '#bt-end .rpg-bend-h')).trim(), /^Victory! \+[\d,]+ ?\(first clear ×3\)$/);
  assert.equal((await txt(page, '#bt-nextfloor')).trim(), 'Next floor');
  assert.equal((await txt(page, '#bt-home')).trim(), 'Go to Adventure home');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-nextfloor');
  await shown(page, '#bt-fight');
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Amazon Jungle · F2');
});

te('en_battle_lose', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  const missed = [];
  while ((await bstate(page)).phase !== 'end') {
    missed.push(await missOnce(page));
    await page.click('#bt-next');
    await page.waitForFunction(() => ['question', 'end'].includes(RPG_BATTLE.state().phase));
  }
  assert.equal((await txt(page, '#bt-end .rpg-bend-h')).trim(), 'Defeated…! But now you should know the countries you missed.');
  const end = await txt(page, '#bt-end');
  assert.match(end, /Effort prize \+\d+/);
  assert.match(end, /Effort gauge 1\/\d+/);
  assert.equal((await txt(page, '#bt-end .rpg-lbl')).trim(), 'Countries you missed');
  const want = await enOf(page, [...new Set(missed)]);
  const got = await page.$$eval('#bt-end .misslist li', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent]));
  assert.deepEqual(got, want);
  assert.equal((await txt(page, '#bt-practice')).trim(), 'Practice this region');
  assert.equal((await txt(page, '#bt-again')).trim(), 'Play again');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-practice');
  await shown(page, '#scr-setup');
  assert.match(await page.evaluate(() => location.pathname), /\/en\/$/);
  assert.deepEqual(await jaLeft(page), []);
});

te('en_battle_flee', async page => {
  await writeSave(page, saveWith({}));
  await startBattle(page, 'samerica', 1);
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await page.click('#bt-flee');
  assert.equal(msg, 'Run? (You won’t get a reward.)');
  assert.equal((await bstate(page)).phase, 'question');
});

// 宇宙（テーマ）の答え合わせのテーマの一言・鏡の地球の「えらんだのは」。月は Moon（曜日の Mon にしない）
te('en_battle_reveal', async page => {
  await writeSave(page, saveWith({ lv: 50, floors: MIRROR_CLEAR }));
  await startBattle(page, 'moon', 1);
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Moon · F1');
  assert.equal(await page.evaluate(() => RPG_BATTLE.force('jp', 'f2n')), true);
  await battleGuard(page);
  await page.locator('#bt-q .choice:not([data-a="jp"])').first().click();
  await page.locator('#bt-reveal').waitFor();
  assert.equal((await txt(page, '#bt-reveal .rpg-rv-theme')).trim(), 'Japan fits the theme: Island Countries');
  assert.doesNotMatch(await page.locator('#scr-battle').innerText(), /\bMon\b/);
  assert.deepEqual(await jaLeft(page), []);
  // 鏡の地球: 押した国と正解を並べる
  await writeSave(page, saveWith({ lv: 50, floors: EARTH_CLEAR }));
  await startBattle(page, 'msamerica', 1);
  assert.equal(await page.evaluate(() => RPG_BATTLE.force('jp', 'f2n')), true);
  await battleGuard(page);
  const picked = await page.locator('#bt-q .choice:not([data-a="jp"])').first().getAttribute('data-a');
  await page.locator('#bt-q .choice:not([data-a="jp"])').first().click();
  await page.locator('#bt-reveal').waitFor();
  const [[pn]] = await enOf(page, [picked]);
  assert.equal((await txt(page, '#bt-reveal .rpg-rv-pick')).trim(), `You chose “${pn}”`);
  assert.deepEqual(await page.$$eval('#bt-reveal .rpg-rv-pair figcaption', els => els.map(e => e.textContent)), [pn, 'Japan']);
  assert.equal(await page.getAttribute('#bt-reveal .rpg-rv-pair img >> nth=1', 'alt'), 'Flag of Japan');
  assert.deepEqual(await jaLeft(page), []);
});

// ボスを初めて倒した［Share］: 地図喰い（final）と第3章の月のボス。文は英語、URL は英語版
te('en_boss_share', async page => {
  const shareText = async () => {
    await page.evaluate(() => { window.__shared = null; navigator.share = o => { window.__shared = o; return Promise.resolve(); }; });
    await page.click('#bt-share');
    return page.evaluate(() => window.__shared);
  };
  await writeSave(page, saveWith({ lv: 99, floors: { ...EARTH_CLEAR, world: 4 } }));
  await startBattle(page, 'world', 5);
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Map Eater’s Lair · Boss');
  await winBattle(page);
  assert.equal((await txt(page, '#bt-end .rpg-bend-x')).trim(), 'Welcome back, World!');
  assert.equal((await txt(page, '#bt-share')).trim(), 'Share');
  assert.deepEqual(await jaLeft(page), []);
  let s = await shareText();
  assert.match(s.text, /^I defeated the Map Eater and won back the world in Flag Quest! Allies: \d+\/195 countries #FlagMaster$/);
  assert.match(s.url, /\/country-drill\/en\/$/);
  await writeSave(page, saveWith({ lv: 99, floors: { ...MIRROR_CLEAR, moon: 4 } }));
  await startBattle(page, 'moon', 5);
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Moon · Boss');
  await winBattle(page);
  assert.equal((await txt(page, '#bt-end .rpg-bend-x')).trim(), 'Welcome back, Moon!');
  s = await shareText();
  assert.match(s.text, /^I defeated the Great Moon Rabbit King in Flag Quest! Allies: \d+\/195 countries #FlagMaster$/);
  assert.doesNotMatch(s.text, JA_TEXT);
  assert.deepEqual(await jaLeft(page), []);
});

const TOWER_OPEN = saveWith({ lv: 30, floors: { world: 5 }, story: ['ch1'] });
te('en_tower', async page => {
  // 冒険ホームの塔の札（preflight C2 で Task 5 から移した確かめ）
  await openHome(page, JA_SAVE);
  let card = await txt(page, '#rpg-tower');
  assert.ok(card.includes('Tower of Heroes') && card.includes('Personal best: floor 7'), card);
  assert.equal((await txt(page, '#rpg-tower-go')).trim(), 'Challenge');
  assert.deepEqual(await jaLeft(page), []);
  await openHome(page, saveWith({ lv: 30, floors: { world: 4 } }));
  card = await txt(page, '#rpg-tower');
  assert.ok(card.includes('Opens when you defeat the Map Eater'), card);
  // 1階: 会う画面 → クリア → やめる → 終わり
  await openHome(page, TOWER_OPEN);
  await page.click('#rpg-tower-go');
  await shown(page, '#bt-fight');
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Tower of Heroes · Floor 1');
  assert.match(await txt(page, '#bt-intro'), /Your HP carries over to the next floor \(\+\d+% HP on each new floor, full HP when you defeat the mini-boss every \d+ floors\)/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  await winTowerFloor(page);
  assert.match((await txt(page, '#bt-tclear .rpg-bend-h')).trim(), /^Floor 1 cleared! \+\d+$/);
  assert.match((await txt(page, '#bt-tclear .rpg-bend-x')).trim(), /^First win on this floor \+\d+$/);
  assert.match(await txt(page, '#bt-tclear'), /HP [\d,]+\/[\d,]+ \(\d+% recovered\)/);
  assert.equal((await txt(page, '#bt-tquit')).trim(), 'Quit');
  assert.equal((await txt(page, '#bt-tnext')).trim(), 'Go to floor 2');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-tquit');
  await shown(page, '#bt-end');
  assert.equal((await txt(page, '#bt-end .rpg-bend-h')).trim(), 'Nice work!');
  assert.equal((await txt(page, '#bt-end .rpg-bend-x')).trim(), 'Tower of Heroes: up to floor 1 (Personal best: floor 1)');
  assert.equal((await txt(page, '#bt-home')).trim(), 'Go to the Adventure');
  assert.equal((await txt(page, '#bt-tretry')).trim(), 'Try again (from floor 1)');
  assert.deepEqual(await jaLeft(page), []);
  // 10階の中ボス
  assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(10)), true);
  assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'Tower of Heroes · Floor 10 · Mini-boss');
  assert.match(await txt(page, '#bt-intro'), /Each correct answer wins back one flag/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  let msg = '';
  page.once('dialog', d => { msg = d.message(); d.dismiss(); });
  await page.click('#bt-flee');
  assert.equal(msg, 'Run? (No reward for this floor. Your Tower of Heroes climb ends here.)');
  // HP 1 で1階 → まちがえて負け
  assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(1, 1)), true);
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  const a = await missOnce(page);
  await page.click('#bt-next');
  await shown(page, '#bt-end');
  assert.equal((await txt(page, '#bt-end .rpg-bend-h')).trim(), 'Defeated…!');
  assert.match((await txt(page, '#bt-end .rpg-bend-x')).trim(), /^Tower of Heroes: defeated on floor 1 \(Personal best: floor 1\)$/);
  const [[an, ac]] = await enOf(page, [a]);
  assert.deepEqual(await page.$$eval('#bt-end .misslist li', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent])), [[an, ac]]);
  assert.deepEqual(await jaLeft(page), []);
});

// 390px: 長い英語の国名の4択・HP の欄・塔の見出しが横にはみ出さない
te('en_battle_fit', async page => {
  const over = () => page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('#scr-battle .choice, #scr-battle .rpg-bwhere, #scr-battle .rpg-hpl, #scr-battle .rpg-hpname, #scr-battle .rpg-bteam, #scr-battle .rpg-bline, #scr-battle .rpg-bend-h, #scr-battle .rpg-bend-x, #scr-battle .btn')) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 0.5 || r.right > innerWidth + 0.5 || r.left < -0.5) out.push(`${el.className}: ${el.textContent.trim()} ${el.scrollWidth}/${el.clientWidth}`);
    }
    return { out, sw: document.documentElement.scrollWidth, iw: document.documentElement.clientWidth };
  });
  const check = async () => { const r = await over(); assert.deepEqual(r.out, []); assert.ok(r.sw <= r.iw, `${r.sw} > ${r.iw}`); };
  await writeSave(page, saveWith({ ...BR_AR, floors: { samerica: 5, oceania: 5, namerica: 5, europe: 5, asia: 5, africa: 4 } }));
  await page.evaluate(() => RPG_BATTLE.start('africa', 5));
  await shown(page, '#bt-fight');
  await check();
  await page.click('#bt-fight');
  await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
  for (const a of ['vc', 'ba', 'cf']) {
    assert.equal(await page.evaluate(a => RPG_BATTLE.force(a, 'f2n'), a), true);
    assert.ok((await page.locator('#bt-q .choice').allInnerTexts()).some(s => s.length > 15));
    await check();
  }
  await writeSave(page, TOWER_OPEN);
  assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(10)), true);
  await shown(page, '#bt-fight');
  await check();
}, { viewport: PHONE });

// en_team_custom_name_ugc のバトルの半分（preflight C6）: 自分で付けた編成名は data-ugc、既定の名前は Team 1
te('en_battle_team_name_ugc', async page => {
  await writeSave(page, saveWith({ cards: { jp: [1, 0] }, teams: [{ n: '編成1', c: null }, { n: 'あか', c: ['jp'] }], tsel: 1 }));
  await page.evaluate(() => RPG_BATTLE.start('samerica', 1));
  await shown(page, '#bt-fight');
  assert.equal((await txt(page, '#bt-tname [data-ugc]')).trim(), 'あか');
  assert.equal(await page.getAttribute('#bt-tprev', 'aria-label'), 'Previous team');
  assert.equal(await page.getAttribute('#bt-tnext', 'aria-label'), 'Next team');
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#bt-tprev');
  assert.equal((await txt(page, '#bt-tname')).trim(), 'Team 1');
  assert.equal(await page.locator('#bt-tname [data-ugc]').count(), 0);
  assert.deepEqual(await jaLeft(page), []);
});

// 日本語の見張り（preflight C18）: バトルのログの文（会心・援護・旗を取りもどした・反撃）と、負け・塔の終わりの文が今までの日本語と同じ。
// ja_rpg_unchanged の画面では会心・ボス・負け・塔の終わりが出ないので、ここで決まった形を見る
test('ja_battle_lines', { timeout: 120_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, storage: { badges: QUIET_BADGES } });
  const { page } = app;
  try {
    const rightWith = async rnd => {
      await battleGuard(page);
      const a = await page.evaluate(() => RPG_BATTLE.cur());
      await page.evaluate(r => { window.__rnd = Math.random; if (r !== null) Math.random = () => r; }, rnd);
      await page.locator(`#scr-battle .choice[data-a="${a}"]`).click();
      await page.evaluate(() => { Math.random = window.__rnd; });
      const out = [await page.evaluate(a => byA.get(a).n, a), await logLast(page)];
      await page.waitForFunction(a => RPG_BATTLE.state().phase === 'end' || (RPG_BATTLE.cur() !== null && !document.querySelector(`#scr-battle .choice[data-a="${a}"][disabled]`)), a);
      return out;
    };
    await writeSave(page, saveWith({ lv: 99, cards: { br: [1, 0], ar: [1, 0] }, teams: [{ n: '編成1', c: ['br', 'ar'] }], floors: { samerica: 4 } }));
    await page.evaluate(() => RPG_BATTLE.start('samerica', 5));
    assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'ボス アマゾンの密林');
    assert.equal((await page.locator('.rpg-bteam-b').textContent()).trim(), 'チーム 南アメリカ×2 ＋10%');
    assert.equal(await page.locator('#bt-tname').textContent(), '編成1');
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    let [n, log] = await rightWith(0);   // 会心（Lv 99 なので1回で旗を取りもどす）
    assert.equal(log, `会心！ ${n}！ 旗を取りもどした（ブラジル・アルゼンチンの援護）`);
    [n, log] = await rightWith(0.99);
    assert.equal(log, `${n}！ 旗を取りもどした（ブラジル・アルゼンチンの援護）`);
    // 仲間なし・通常のフロア
    await writeSave(page, saveWith({ lv: 1 }));
    await startBattle(page, 'samerica', 1);
    assert.equal((await txt(page, '.rpg-bwhere')).trim(), 'F1 アマゾンの密林');
    [n, log] = await rightWith(0);
    assert.match(log, new RegExp(`^会心！ ${n}！ おしゃべりオウムに\\d+ダメージ$`));
    [n, log] = await rightWith(0.99);
    assert.match(log, new RegExp(`^${n}！ おしゃべりオウムに\\d+ダメージ$`));
    const missed = [];
    while ((await bstate(page)).phase !== 'end') {
      missed.push(await missOnce(page));
      assert.match(await logLast(page), /^おしゃべりオウムの反撃！ \d+ダメージ$/);
      assert.match(await txt(page, '#bt-reveal .verdict'), /^ざんねん。正解は「.+」$/);
      await page.click('#bt-next');
      await page.waitForFunction(() => ['question', 'end'].includes(RPG_BATTLE.state().phase));
    }
    assert.equal((await txt(page, '#bt-end .rpg-bend-h')).trim(), 'やられた…！ でも、まちがえた国はもう覚えたはず');
    assert.match(await txt(page, '#bt-end'), /がんばり賞 \+\d+\n+がんばりゲージ 1\/\d+\n+まちがえた国/);
    const want = await page.evaluate(as => [...new Set(as)].map(a => [byA.get(a).n, byA.get(a).c]), missed);
    assert.deepEqual(await page.$$eval('#bt-end .misslist li', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent])), want);
    // 塔: 中ボスの見出し・HP 1 で負けた終わり
    await writeSave(page, TOWER_OPEN);
    assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(10)), true);
    assert.equal((await txt(page, '.rpg-bwhere')).trim(), '英雄の塔 10階 中ボス');
    assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(1, 1)), true);
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    await missOnce(page);
    await page.click('#bt-next');
    await shown(page, '#bt-end');
    assert.equal((await txt(page, '#bt-end .rpg-bend-x')).trim(), '英雄の塔 1階でたおれた');
    // 塔の会う画面の HP の文・中ボスをたおした HP の文・やめた終わり（おつかれさま）
    await writeSave(page, saveWith({ lv: 99, floors: { world: 5 }, story: ['ch1'], tower: { best: 12 } }));
    assert.equal(await page.evaluate(() => RPG_BATTLE.debugTower(10)), true);
    assert.match(await txt(page, '#bt-intro'), /HP はつぎの階に持ちこし（階を上がると\d+%回復、\d+階ごとの中ボスをたおすと全回復）/);
    await page.click('#bt-fight');
    await page.waitForFunction(() => RPG_BATTLE.state().phase === 'question');
    await winTowerFloor(page);
    assert.match(await txt(page, '#bt-tclear'), /HP [\d,]+\/[\d,]+（中ボスをたおして全回復！）/);
    assert.equal((await txt(page, '#bt-tnext')).trim(), 'つぎの階へ（11階）');
    await page.click('#bt-tquit');
    await shown(page, '#bt-end');
    assert.equal((await txt(page, '#bt-end .rpg-bend-h')).trim(), 'おつかれさま！');
    assert.equal((await txt(page, '#bt-end .rpg-bend-x')).trim(), '英雄の塔 10階まで（自己ベスト 12階）');
    // 仲間ありの通常のフロアのダメージの文（援護つき。会心と、会心でないもの）
    await writeSave(page, saveWith({ lv: 1, cards: { br: [1, 0], ar: [1, 0] }, teams: [{ n: '編成1', c: ['br', 'ar'] }] }));
    await startBattle(page, 'samerica', 1);
    [n, log] = await rightWith(0);
    assert.match(log, new RegExp(`^会心！ ${n}！ おしゃべりオウムに\\d+ダメージ（ブラジル・アルゼンチンの援護）$`));
    [n, log] = await rightWith(0.99);
    assert.match(log, new RegExp(`^${n}！ おしゃべりオウムに\\d+ダメージ（ブラジル・アルゼンチンの援護）$`));
    // 始めていない画面
    await page.evaluate(() => { RPG.opts = {}; show('rpg'); show('battle'); });
    assert.equal((await txt(page, '#scr-battle .hint')).trim(), 'バトルは冒険ホームのダンジョンから始めてね');
    assert.equal((await txt(page, '#bt-home')).trim(), '冒険ホームへ');
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
