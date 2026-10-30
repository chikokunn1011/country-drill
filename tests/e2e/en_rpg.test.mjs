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
import { startServer, QUIET_BADGES } from './helpers.mjs';
import { openRpg, writeSave, saveWith, toastTexts, playPractice, winBattle, startTower, winTowerFloor } from './rpg_helpers.mjs';

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
