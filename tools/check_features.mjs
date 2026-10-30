// data/flag_features.json（国旗の特徴）を目で確かめるためのページを書く。
// 使い方: node tools/check_features.mjs [--out FILE]（既定は /mnt/project-files/country-drill-next5-20261029/features-check.html）
// キーごとに「付けた国」と「付けなかった国のうち、似た国（付けた国と同じ SIMILAR グループ・同じ色の組み）」を国旗の画像つきで並べる。
// 国旗は data: URI でページの中に入れるので、このファイルだけで見られる。出力はリポジトリに入れない
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = '/mnt/project-files/country-drill-next5-20261029/features-check.html';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 色を大まかな名前に分ける（同じ色の組みかどうかを見るため）
function colorName(hex) {
  let h = hex.slice(1).toLowerCase();
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (l > 0.88 && d < 0.15) return 'white';
  if (l < 0.15) return 'black';
  if (d < 0.12) return l > 0.6 ? 'white' : 'gray';
  let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 18 || hue >= 335) return 'red';
  if (hue < 40) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 260) return 'blue';
  return 'red';
}

// 国旗で広く使われている色（面積は量れないので、出てくる回数の多い色）の組み
function palette(svg) {
  const count = new Map();
  for (const m of svg.matchAll(/(?:fill|stop-color)\s*[:=]\s*"?\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g)) {
    const n = colorName(m[1]); count.set(n, (count.get(n) || 0) + 1);
  }
  if (/fill="?(white|#fff\b)/i.test(svg)) count.set('white', (count.get('white') || 0) + 1);
  return [...count.keys()].sort().join('+');
}

export function build(root = REPO) {
  const read = f => readFileSync(join(root, f), 'utf8');
  const ctx = { window: {} }; vm.runInNewContext(read('countries.js'), ctx);
  const C = ctx.window.COUNTRIES.map(c => ({ a: c.a, n: c.n })).sort((x, y) => (x.a < y.a ? -1 : 1));
  const name = Object.fromEntries(C.map(c => [c.a, c.n]));
  const dctx = {}; vm.runInNewContext(read('daily-core.js'), dctx);
  const SIMILAR = dctx.DAILY_CORE.SIMILAR.map(g => [...g]);
  const F = JSON.parse(read('data/flag_features.json'));
  const svg = Object.fromEntries(C.map(c => [c.a, read(`flags/${c.a}.svg`)]));
  const pal = Object.fromEntries(C.map(c => [c.a, palette(svg[c.a])]));

  const card = (a, extra = '') => `<figure class="f"><div class="img i-${a}"></div><figcaption><b>${a}</b> ${esc(name[a])}${extra ? `<br><small>${esc(extra)}</small>` : ''}<br><small class="k">${esc(F.flags[a].join(' ') || '（なし）')}</small></figcaption></figure>`;
  const sections = Object.entries(F.rules).map(([k, rule]) => {
    const yes = C.map(c => c.a).filter(a => F.flags[a].includes(k));
    const yesSet = new Set(yes), yesPal = new Set(yes.map(a => pal[a]));
    const near = C.map(c => c.a).filter(a => !yesSet.has(a)).map(a => {
      const why = [];
      const g = SIMILAR.find(g => g.includes(a) && g.some(b => yesSet.has(b)));
      if (g) why.push(`同じグループ: ${g.filter(b => yesSet.has(b)).join(' ')}`);
      if (yesPal.has(pal[a])) why.push(`同じ色の組み: ${pal[a]}`);
      return { a, why: why.join(' / ') };
    }).filter(x => x.why);
    return `<section id="${k}"><h2>${k}（${yes.length}か国）</h2><p class="rule">${esc(rule)}</p>
<h3>付けた国</h3><div class="grid">${yes.map(a => card(a)).join('')}</div>
<h3>付けなかった国のうち、似た国（${near.length}）</h3><div class="grid">${near.map(x => card(x.a, x.why)).join('')}</div></section>`;
  }).join('\n');
  const css = C.map(c => `.i-${c.a}{background-image:url("data:image/svg+xml;base64,${Buffer.from(svg[c.a]).toString('base64')}")}`).join('\n');
  const nav = Object.keys(F.rules).map(k => `<a href="#${k}">${k}</a>`).join(' ');
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>国旗の特徴の確認</title>
<style>
body{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;background:#f4f4f4;color:#222}
nav{position:sticky;top:0;background:#f4f4f4;padding:6px 0;z-index:1}nav a{margin-right:10px}
h2{margin:28px 0 4px;border-bottom:2px solid #888}.rule{margin:0 0 8px;color:#444}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.f{margin:0;background:#fff;padding:6px;border:1px solid #ccc}
.img{aspect-ratio:4/3;background-size:contain;background-repeat:no-repeat;background-position:center;outline:1px solid #ddd}
figcaption{font-size:13px}small{color:#666}.k{color:#06c}
${css}
</style></head><body>
<h1>国旗の特徴の確認（data/flag_features.json）</h1>
<nav>${nav}</nav>
${sections}
</body></html>
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : DEFAULT_OUT;
  writeFileSync(out, build());
  console.log('wrote', out);
}
