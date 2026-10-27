// 効果音（sound.js の SND）。ドパガキ向けとは別に、ふだんから鳴る。設定の「効果音を鳴らす」（はじめは ON）と「音量」で決まる。
// 鳴ったかどうかは SND.play の戻り値（鳴らした kind か null）で見る
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startServer, openApp, pickSetup, answerCorrect, answerWrong, clearByAnswering } from './helpers.mjs';
import { openRpg, writeSave, saveWith, battleAnswer } from './rpg_helpers.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let browser, server;
before(async () => { server = await startServer(); browser = await chromium.launch(); });
after(async () => { await browser?.close(); await server?.close(); });

const t = (name, fn, opts = {}, timeout = 60_000) => test(name, { timeout }, async () => {
  const app = await openApp(browser, opts);
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
// SND.play を [kind, 戻り値] で window.__snd に積むものにかえる
const spy = page => page.evaluate(() => {
  window.__snd = [];
  const orig = SND.play;
  SND.play = (k, o) => { const r = orig(k, o); window.__snd.push([k, r]); return r; };
});
const played = page => page.evaluate(() => window.__snd.filter(([, r]) => r).map(([k]) => k));
const reset = page => page.evaluate(() => { window.__snd = []; });
async function startPractice(page) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
}

t('settings_default_on', async page => {
  await page.click('#home-settings');
  assert.equal(await page.isChecked('#set-sound'), true);
  assert.equal(await page.isVisible('#set-sound'), true);   // ドパガキ OFF でも出ている
  assert.equal(await page.isChecked('#set-dopa'), false);
  assert.equal(await page.inputValue('#set-vol'), '70');
  assert.equal(await page.isDisabled('#set-vol'), false);
  // OFF にすると保存され、音量はさわれなくなる
  await page.uncheck('#set-sound');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('settings')).sound), false);
  assert.equal(await page.isDisabled('#set-vol'), true);
  assert.equal(await page.textContent('#set-vol-n'), 'オフ');
  await page.check('#set-sound');
  await page.fill('#set-vol', '30');
  assert.equal(await page.evaluate(() => S.vol), 30);
  await page.reload();
  assert.equal(await page.evaluate(() => [S.sound, S.vol].join()), 'true,30');
});

t('quiz_sounds_without_dopa', async page => {
  await spy(page);
  await startPractice(page);
  await reset(page);
  await answerCorrect(page);
  await page.waitForSelector('#next');
  assert.deepEqual(await played(page), ['correct']);   // 答えのボタンは「ポチ」を鳴らさない
  await reset(page);
  await page.click('#next');
  assert.deepEqual(await played(page), ['tap']);
  await reset(page);
  await answerWrong(page);
  assert.deepEqual(await played(page), ['wrong']);
  await page.click('#next');
  await reset(page);
  await clearByAnswering(page);
  const p = await played(page);
  assert.ok(p.includes('clear') || p.includes('perfect'), p.join());
});

t('sound_off_is_silent', async page => {
  await spy(page);
  await startPractice(page);
  await reset(page);
  await answerCorrect(page);
  await page.click('#next');
  assert.deepEqual(await played(page), []);
  assert.ok((await page.evaluate(() => window.__snd.map(([k]) => k))).includes('correct'));   // 呼ばれるが鳴らない
  assert.equal(await page.evaluate(() => FX.audio()), null);   // ドパガキの音も止まる
}, { storage: { settings: { region: 'all', dopa: false, sound: false } } });

t('dopa_uses_its_own_answer_sound', async page => {
  await spy(page);
  await startPractice(page);
  await reset(page);
  await answerCorrect(page);
  await page.waitForSelector('#next');
  assert.deepEqual(await played(page), []);   // 正解の音はドパガキの FX.sfx（二重に鳴らさない）
  assert.ok(await page.evaluate(() => FX.audio() === SND.ctx()));
}, { storage: { settings: { region: 'all', dopa: true, sound: true } } });

t('all_sounds_play', async page => {
  await page.click('#home-settings');   // 操作したことにする（それまでは鳴らさない）
  await page.waitForTimeout(100);       // いまの「ポチ」と重ならないように
  const r = await page.evaluate(async () => {
    const out = {};
    for (const k of SND.kinds) { out[k] = SND.play(k, { combo: 5 }); await new Promise(f => setTimeout(f, 60)); }
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert.equal(v, k, `${k} が鳴らない`);
  assert.ok(Object.keys(r).length >= 15);
});

/* ---------- 冒険（バトル・レベルアップ・ガチャ） ---------- */
const rt = (name, fn, opts = {}) => test(name, { timeout: 90_000 }, async () => {
  const app = await openRpg(browser, { seed: 1, ...opts });
  try {
    await fn(app.page, app);
    assert.deepEqual(app.errors.map(String), []);
  } finally { await app.close(); }
});
rt('rpg_sounds_without_dopa', async page => {
  await page.click('#home-settings');   // 操作したことにする
  await writeSave(page, saveWith({ floors: { samerica: 4 }, coins: 99999, pity: 49 }));
  await spy(page);
  await page.evaluate(() => RPG_BATTLE.start('samerica', 5));
  await page.click('#bt-fight');
  await reset(page);
  await battleAnswer(page, true);
  assert.ok((await played(page)).includes('hit'), (await played(page)).join());
  await reset(page);
  await battleAnswer(page, false);
  assert.ok((await played(page)).includes('damage'), (await played(page)).join());
  // レベルアップ
  await page.evaluate(() => RPG.open('rpg'));
  await reset(page);
  await page.click('#rpg-lvup');
  assert.deepEqual(await played(page), ['levelup']);
  // ガチャ（天井の1回前なので★3）: 光る・めくる・金
  await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
  await reset(page);
  await page.click('#ga-1');
  await page.waitForFunction(() => !document.querySelector('#ga-res .rpg-card.is-back'), null, { timeout: 15_000 });
  const p = await played(page);
  for (const k of ['promo', 'flip', 'gold']) assert.ok(p.includes(k), `${k} が無い: ${p}`);
}, { reducedMotion: 'no-preference' });
