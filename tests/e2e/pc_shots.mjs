// PC レイアウトの確認用（テストではなく手で動かす）。場面ごとにスクショを撮り、収まりを1行ずつ出す（試作の measure.js をリポジトリ用にしたもの）
// node tests/e2e/pc_shots.mjs --out <フォルダ> [--viewport 1024x768,1366x768,1920x1080] [--scenes all|a,b] [--dopa] [--dark] [--no-shot]
// スクショは見えている範囲だけ。ERR（ページの例外・場面まで進めなかった）が出たら終了コード 1
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startServer } from './helpers.mjs';
import { SCENES, openScene, measureFit, parseViewports } from './layout.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const viewports = parseViewports(opt('--viewport', '1024x768,1366x768,1920x1080'));
const scenes = opt('--scenes', 'all') === 'all' ? Object.keys(SCENES) : opt('--scenes').split(',');
const dopa = args.includes('--dopa'), dark = args.includes('--dark'), noShot = args.includes('--no-shot');
const out = opt('--out') && resolve(opt('--out'));
const unknown = scenes.filter(s => !SCENES[s]);
if (unknown.length) throw new Error(`そんな場面はない: ${unknown.join(',')}（使えるのは ${Object.keys(SCENES).join(',')}）`);
if (!noShot && !out) throw new Error('--out <フォルダ> を付けてね（スクショがいらないなら --no-shot）');

// 1組み合わせ1行。fit は カードの下・「次へ」の下が画面の中で、はみ出しが 1px 以内
function row(label, { hscroll, docH, ih, gridCols, card }, errors) {
  let s = `${label}  ${hscroll ? 'HSCROLL' : 'ok'}  doc ${docH}/${ih}${docH > ih ? ' VSCROLL' : ''}`;
  if (card) {
    const { bottom, nextBottom, overflow } = card;
    const fit = bottom <= ih && (nextBottom === null || nextBottom <= ih) && overflow <= 1;
    s += `  card ${bottom} next ${nextBottom} over ${overflow} ${fit ? 'FIT' : 'NOFIT'}`;
  }
  if (gridCols != null) s += `  cols ${gridCols}`;
  if (errors.length) s += `  ERR ${errors.map(e => e.message.split('\n')[0]).join(' | ')}`;
  return s;
}

if (!noShot) await mkdir(out, { recursive: true });
const server = await startServer(), browser = await chromium.launch();
try {
  for (const viewport of viewports) for (const scene of scenes) {
    const { width: w, height: h } = viewport, label = `${w}x${h}  ${scene}`;
    let app;
    try {
      app = await openScene(browser, { scene, viewport, dopa, colorScheme: dark ? 'dark' : undefined });
      const fit = await measureFit(app.page);
      if (!noShot) await app.page.screenshot({ path: join(out, `${scene}_${w}x${h}${dopa ? '_dopa' : ''}${dark ? '_dark' : ''}.png`) });
      console.log(row(label, fit, app.errors));
      if (app.errors.length) process.exitCode = 1;
    } catch (e) {
      // 場面まで進めなかったときも ERR の行にして、残りの場面は続ける
      console.log(`${label}  ERR ${e.message.split('\n')[0]}`);
      process.exitCode = 1;
    } finally { await app?.close(); }
  }
} finally { await browser.close(); await server.close(); }
