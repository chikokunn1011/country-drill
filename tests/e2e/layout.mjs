// PC レイアウトの計測の道具（試作の measure.js・geom.js をテスト用にしたもの）。
// 場面（SCENES）を開いて、はみ出し（measureFit）や全要素の位置（pageGeometry）を測る
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, pickSetup, answerCorrect, answerWrong, clearTimeAttack, QUIET_BADGES } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sh = s => `'${String(s).replaceAll("'", `'\\''`)}'`; // シェルに渡す文字をくくる

// '1366x657,1920x1080' → [{ width: 1366, height: 657 }, { width: 1920, height: 1080 }]
export function parseViewports(s) {
  return s.split(',').map(v => {
    const [width, height] = v.trim().split('x').map(Number);
    if (!(width > 0 && height > 0)) throw new Error(`画面の大きさが読めない: ${v}`);
    return { width, height };
  });
}

/* ---------- 場面 ---------- */
// どれもホームが開いた直後から始めて、その画面の状態まで進める
const MODES = ['f2n', 'n2f', 'm2f', 'f2m'];
const waitChoices = page => page.waitForSelector('#qcard .choice');
const waitNext = page => page.waitForSelector('#next');
// 練習・全世界・5問でそのモードを始める
async function startPractice(page, mode) {
  await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  await waitChoices(page);
}
// 国名表示 ON で始めて、1問目をまちがえる
async function named(page, mode) {
  await pickSetup(page, { mode, kind: 'practice', region: 'all', count: 5 });
  await page.check('#nameopt');
  await page.click('#start');
  await waitChoices(page);
  await answerWrong(page);
  await waitNext(page);
}
// 名前の長い国（a）を今の問題にして、まちがえる
async function longName(page, a) {
  await page.evaluate(a => { G.queue.unshift(byA.get(a)); nextQuestion(); }, a);
  await answerWrong(page);
  await waitNext(page);
}
// 練習・国旗→国名・全世界・5問を結果画面まで解く。missFirst なら1問目だけまちがえる（最後にもう一度出るので6問になる）
async function playThrough(page, missFirst) {
  await pickSetup(page, { mode: 'f2n', kind: 'practice', region: 'all', count: 5 });
  await page.click('#start');
  for (let first = true; await page.isHidden('#scr-result'); first = false) {
    await (missFirst && first ? answerWrong : answerCorrect)(page);
    await page.click('#next');
  }
  await page.locator('#scr-result').waitFor();
}
// タイムアタックの失格後は、その時点の時間で止まるので決まった値に置きかえる
const fixFailTime = page => page.evaluate(() => { $('ptime').textContent = RANKING.formatTime(1000); });
async function taStart(page, mode) {
  await pickSetup(page, { mode, kind: 'ta', region: 'all', count: 5 });
  await page.click('#start');
  await waitChoices(page);
}
// 国旗クエスト（RPG）の場面のセーブ: Lv12・仲間4枚・南アメリカは F4 まで・オセアニアは F1 まで
const RPG_SAVE = { v: 1, intro: true, lv: 12, coins: 12345, cards: { br: [2, 1], cl: [1, 0], jp: [3, 4], fr: [1, 2] }, fr: { pe: 3 }, floors: { samerica: 4, oceania: 1 } };
// セーブを入れて読み込み直し、window.RPG ができるまで待つ
async function rpgLoad(page, save) {
  await page.evaluate(s => localStorage.setItem('rpg', s), JSON.stringify(save));
  await page.reload();
  await page.waitForFunction(() => window.RPG);
}
// 最後に #toasts を空にする（バッジのさかのぼりのトーストが写らないように）
const noToasts = page => page.evaluate(() => document.getElementById('toasts')?.replaceChildren());
// 南アメリカの floor で［たたかう］まで。mode があれば、いまの問題をチリ（cl）のその形式にする
async function rpgBattle(page, floor, mode) {
  await rpgLoad(page, RPG_SAVE);
  await page.evaluate(f => RPG_BATTLE.start('samerica', f), floor);
  await page.click('#bt-fight');
  if (mode) await page.evaluate(m => RPG_BATTLE.force('cl', m), mode);
}
const RPG_SCENES = {
  rpg_intro: async page => { await rpgLoad(page, { v: 1, intro: false }); await page.evaluate(() => show('rpg')); },
  rpg_home: async page => { await rpgLoad(page, RPG_SAVE); await page.evaluate(() => show('rpg')); },
  ...Object.fromEntries(['f2n', 'n2f', 'm2f'].map(m => [`battle_${m}`, page => rpgBattle(page, 3, m)])),
  // 出題から guardMs たってから、まちがいの選択肢を押す
  battle_reveal: async page => {
    await rpgBattle(page, 3, 'f2n');
    await page.waitForFunction(() => performance.now() - RPG_BATTLE.state().shownAt >= RPG_CORE.TUNING.battle.guardMs);
    await page.locator('#scr-battle .choice:not([data-a="cl"])').first().click();
    await page.locator('#bt-reveal').waitFor();
  },
  battle_boss: page => rpgBattle(page, 5),
  gacha_result: async page => {
    await rpgLoad(page, { ...RPG_SAVE, coins: 1000 });
    await page.evaluate(() => RPG.open('gacha', { region: '南アメリカ' }));
    await page.click('#ga-10');
    await page.click('#ga-flipall');
  },
  cards: async page => { await rpgLoad(page, RPG_SAVE); await page.evaluate(() => RPG.open('cards')); },
};

export const SCENES = {
  home: async () => {},
  settings: async page => { await page.click('#home-settings'); },
  setup: async page => { await page.click('#home-play'); },
  setup_ta: async page => { await pickSetup(page, { kind: 'ta' }); },
  ...Object.fromEntries(MODES.map(m => [`quiz_${m}`, page => startPractice(page, m)])),
  ...Object.fromEntries(MODES.map(m => [`reveal_${m}`, async page => { await startPractice(page, m); await answerCorrect(page); await waitNext(page); }])),
  ...Object.fromEntries(['f2n', 'n2f'].map(m => [`wrong_${m}`, async page => { await startPractice(page, m); await answerWrong(page); await waitNext(page); }])),
  ...Object.fromEntries(['m2f', 'f2m'].map(m => [`named_${m}`, page => named(page, m)])),
  long_f2n: async page => { await SCENES.quiz_f2n(page); await longName(page, 'kn'); }, // セントクリストファー・ネービス
  long_n2f: async page => { await SCENES.quiz_n2f(page); await longName(page, 'vc'); }, // セントビンセント及びグレナディーン諸島
  // タイマーを止めて表示を固定する（timeMs が null でないと tick() が止まる。止めないと比べるたびに時間の文字が変わる）
  ta_quiz: async page => {
    await taStart(page, 'f2n');
    await page.evaluate(() => { G.timeMs = 0; $('ptime').textContent = RANKING.formatTime(1000); });
  },
  ta_fail: async page => { await SCENES.ta_quiz(page); await answerWrong(page); await waitNext(page); await fixFailTime(page); },
  ta_fail_f2m: async page => { await taStart(page, 'f2m'); await answerWrong(page); await waitNext(page); await fixFailTime(page); },
  result: page => playThrough(page, false),
  result_miss: page => playThrough(page, true),
  ta_result: async page => {
    await clearTimeAttack(page);
    // タイムの桁でフォント幅が変わり、比較がぶれるのを防ぐ
    await page.evaluate(() => { G.timeMs = 12345; showResult(); });
    // 順位相当は後から非同期で入る（待たないと #ta-rank の幅が測るたびに変わる）
    await page.waitForFunction(() => document.getElementById('ta-rank').textContent !== '');
  },
  ranking: async page => {
    await page.evaluate(async () => {
      for (const [nickname, timeMs] of [['チコ', 8000], ['たろう', 9100], ['ながいなまえのひとですよ', 12000]])
        await RANKING.submit({ board: 'f2n:all:10', nickname, timeMs, questions: 10 });
    });
    await page.click('#home-rank');
    await page.waitForFunction(() => document.querySelectorAll('#rk-list li').length === 3);
  },
  book_grid: async page => {
    await page.click('#home-book');
    await page.click('#bview button[data-v="list"]');
    await page.waitForSelector('#grid .card');
  },
  // ホームでは #bview が隠れているので、必ず #home-book から入る
  book_map: async page => {
    await page.click('#home-book');
    await page.click('#bview button[data-v="map"]');
    await page.waitForSelector('#bmapbox svg path');
    await page.locator('#bmapbox path[data-a="jp"]').first().dispatchEvent('click');
  },
  book_detail: async page => {
    await SCENES.book_grid(page);
    await page.click('#grid .card[data-a="jp"]');
    await page.waitForSelector('#detail[open]');
  },
  ...Object.fromEntries(Object.entries(RPG_SCENES).map(([name, go]) => [name, async page => { await go(page); await noToasts(page); }])),
};

// 場面を開いて落ち着くまで待つ。戻り値は openApp と同じ（閉じるのは呼んだ側）。blockScripts は openApp にそのまま渡す
// badges はバッジのセーブ（既定はバッジが出ない QUIET_BADGES。null なら入れない）
export async function openScene(browser, { scene, viewport, url, dopa, colorScheme, badges = QUIET_BADGES, blockScripts = [] } = {}) {
  if (!SCENES[scene]) throw new Error(`そんな場面はない: ${scene}`);
  const storage = dopa ? { settings: { region: 'all', dopa: true, sound: false } } : {};
  if (badges) storage.badges = badges;
  const app = await openApp(browser, { viewport, url, seed: 1, reducedMotion: 'reduce', colorScheme, blockScripts, storage });
  try {
    await SCENES[scene](app.page);
    await settleLayout(app.page);
  } catch (e) { await app.close(); throw e; }
  return app;
}

/* ---------- 計測 ---------- */
// フォント・画像・回数が有限のアニメーションが終わるまで待つ（ドパガキ向けのボタンの虹色は無限なので待たない）
export async function settleLayout(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    const t = ms => new Promise(ok => setTimeout(ok, ms));
    await Promise.race([document.fonts.ready, t(3000)]);
    const loading = [...document.images].filter(i => !i.complete && i.loading !== 'lazy')
      .map(i => new Promise(ok => { i.addEventListener('load', ok, { once: true }); i.addEventListener('error', ok, { once: true }); }));
    await Promise.race([Promise.all(loading), t(3000)]);
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
    await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)));
  });
}

// 全要素の「タグ.class x,y,幅,高さ」（y はページの先頭から）。id は入れない（あとで既存の要素に id を足しても比較が変わらないように）
export const pageGeometry = page => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.tagName === 'SCRIPT') continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.push(`${el.tagName}.${el.getAttribute('class') ?? ''} ${[r.x, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10).join(',')}`);
  }
  return out;
});

// 横スクロール、ページの高さ、図鑑の列数、クイズのカードが収まるか（上下左右のはみ出し・文字のはみ出し）
export const measureFit = page => page.evaluate(() => {
  const de = document.documentElement, r = el => el.getBoundingClientRect();
  const grid = document.querySelector('#grid:not([hidden])');
  const gridCols = grid && grid.offsetParent ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null;
  const q = document.querySelector('#scr-quiz:not([hidden]) #qcard');
  let card = null;
  if (q) {
    const cb = r(q), cs = getComputedStyle(q);
    const inner = { top: cb.top + parseFloat(cs.paddingTop), bottom: cb.bottom - parseFloat(cs.paddingBottom),
                    left: cb.left + parseFloat(cs.paddingLeft), right: cb.right - parseFloat(cs.paddingRight) };
    let overflow = 0;
    for (const el of q.querySelectorAll('*')) { const b = r(el); if (!b.width || !b.height) continue;
      overflow = Math.max(overflow, b.bottom - inner.bottom, inner.top - b.top, inner.left - b.left, b.right - inner.right); }
    for (const el of q.querySelectorAll('p, b, span, dd, button'))
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow === 'visible') overflow = Math.max(overflow, el.scrollWidth - el.clientWidth);
    const nx = document.getElementById('next');
    card = { bottom: Math.round(cb.bottom), nextBottom: nx ? Math.round(r(nx).bottom) : null, overflow: Math.round(overflow) };
  }
  return { hscroll: de.scrollWidth > innerWidth, docH: de.scrollHeight, ih: innerHeight, gridCols, card };
});

// 要素の位置と大きさ（画面の左上から。0.1px に丸める）。無ければ null
export const rectOf = (page, selector) => page.evaluate(selector => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect(), k = v => Math.round(v * 10) / 10;
  return { left: k(r.left), top: k(r.top), right: k(r.right), bottom: k(r.bottom), width: k(r.width), height: k(r.height) };
}, selector);

/* ---------- 比較の基準 ---------- */
// 'auto' なら index.html に初めて rslot が入ったコミットの親（まだ無ければ HEAD）。それ以外はそのまま（コミット ID や HEAD~3）
export function resolveGeomBase(value) {
  if (value !== 'auto') return value;
  const revs = execSync(`git -C ${sh(ROOT)} log -S rslot --format=%H -- index.html`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  return revs.length ? `${revs.at(-1)}^` : 'HEAD';
}

// そのコミットのファイルを一時フォルダに取り出して、そのパスを返す（消すのは呼んだ側）
export async function extractTree(rev) {
  const dir = await mkdtemp(join(tmpdir(), 'drill-geom-'));
  // rev が読めないと git が何も出さず、tar が失敗して例外になる
  try { execSync(`git -C ${sh(ROOT)} archive ${sh(rev)} | tar -x -C ${sh(dir)}`); }
  catch (e) { await rm(dir, { recursive: true, force: true }); throw e; }
  return dir;
}
