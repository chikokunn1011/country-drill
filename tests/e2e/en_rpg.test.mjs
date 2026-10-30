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
import { openRpg, writeSave, saveWith, toastTexts, playPractice, winBattle, startTower, winTowerFloor, localToday, flipAll } from './rpg_helpers.mjs';

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
// rpg-battle・rpg-team・rpg-rank は Task 7〜9 まで英語のページで読まない（EN_SKIP）。
// なので塔の札（バトルの画面が要る）は Task 8 で見る。かざりの窓（RPG.cardHTML が要る）は Task 6 から en_profile_decorations で見る（preflight C2）
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
  assert.equal((await txt(page, '#rpg-next > span:last-child')).trim(), 'Start by finding allies with Draw 10 in the Flag Draw (●1,000 for World)');
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
  assert.match((await txt(page, '#rpg-res .rpg-res-head')).trim(), /^\+[\d,]+ coins Now [\d,]+$/);
  assert.match(await txt(page, '#rpg-res-go'), /^To the Adventure →/);
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
  await page.waitForFunction(() => window.__toasts.includes('Restore from code complete. Your transfer code worked'));
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
  // 長い名前: Mirror North/Central America の章（鏡の地球）の札と、いちばん長いダンジョン名
  for (const [save, ids] of [[saveWith({ lv: 30, floors: { ...EARTH_CLEAR, msamerica: 5, moceania: 5, mnamerica: 2 }, story: ['ch1'] }), ['mnamerica', 'mworld']],
    [JA_SAVE, ['namerica', 'europe', 'world']]]) {
    await openHome(page, save);
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
}, { viewport });

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
  assert.equal((await txt(page, '#ga-pity')).trim(), 'guaranteed ★3 in 50 draws');
  const rates = await txt(page, '#ga-rates');
  for (const x of ['Odds', '★3 Gold 3% / ★2 Silver 17%', '★1 Bronze 80%', 'No ★3 by draw 50 → guaranteed ★3', 'World: 1/195 = 0.5% each'])
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
  assert.equal((await txt(page, '#ga-pack .rpg-pack-sub')).trim(), `${oc.length} countries complete!`);
  assert.equal(await page.getAttribute('#ga-pack .rpg-pack', 'aria-label'), 'Oceania Flag Pack');
  assert.match(await txt(page, '#ga-need'), /^need \d[\d,]* more$/);
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
  assert.equal((await txt(page, '#ga-msg')).trim(), 'Today’s free draw is already used, or you haven’t cleared a quiz today yet');
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
  assert.match(await txt(page, '#cd-grid .rpg-card[data-a="de"] .rpg-card-hint'), /^2 more right answers to make it an ally/);
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
  assert.match(info, /^★2 Silver · Stack ●○○○ · Friendship ♥0\/10 Attack \d+\.\d \(Region bonus: no\) · HP \d+\.\d Region bonus ×1\.5 in Asia dungeons and the Map Eater’s Lair$/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail .close');
  // まだ仲間でない国の詳細
  await page.click('#cd-grid .rpg-card[data-a="de"]');
  await shown(page, '#detail[open]');
  assert.match((await txt(page, '#detail .rpg-cd-info')).replace(/\s+/g, ' '), /^Not an ally yet \(Friendship ♥3\/10\) 2 more right answers to make it an ally/);
  assert.deepEqual(await jaLeft(page), []);
  await page.click('#detail .close');
  // 地域でしぼる
  await page.click('#cd-regions .chip[data-r="南アメリカ"]');
  assert.equal(await page.locator('#cd-grid .rpg-card').count(), 12);
  assert.deepEqual(await jaLeft(page), []);
});

// 50か国目の仲間 → ［Share］の文は Flag Quest をふくみ #FlagMaster で終わる。URL は英語版
te('en_cards_share', async page => {
  const codes = await page.evaluate(() => C.slice(0, 49).map(c => c.a));
  await openGacha(page, saveWith({ coins: 1000, cards: Object.fromEntries(codes.map(a => [a, [1, 0]])) }));
  await drawTen(page);
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
for (const [vname, viewport] of [['phone', PHONE], ['pc', PC]]) te(`en_cards_fit_${vname}`, async page => {
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
