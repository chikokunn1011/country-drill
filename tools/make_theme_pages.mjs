// テーマ別のまとめページ（themes/<id>.html ×14 と入口 themes/index.html）と themes.js を作り、sitemap.xml の目印のあいだを書きかえる。
// 使い方: node tools/make_theme_pages.mjs [--root DIR] [--out DIR]（どちらも既定はリポジトリの根）
// 読むもの: tools/make_country_pages.mjs の readInputs が読むもの・data/flag_features.json・data/similar_tips.json・
// rpg-core.js の THEMES の island と landlocked（文字で読む）。日付と乱数は使わない。作ったファイルはコミットする
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readInputs, head, footerHTML, flagImg, esc, fmt, byJa, SITE, DESC_MAX } from './make_country_pages.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARK_START = '<!-- theme:start -->', MARK_END = '<!-- theme:end -->';
const FEATURES = ['stars', 'cross', 'crescent', 'sun', 'animal', 'unionjack', 'vtricolor', 'htricolor', 'redwhite'];
export const THEME_IDS = [...FEATURES, 'similar', 'island', 'landlocked', 'bigarea', 'smallarea'];
const QUIZ_MIN = 10;   // これより少ないテーマはクイズのボタンを出さず、themes.js にも入れない
const RANK_N = 20;
const CSS = ['../country/country.css?v=1', 'themes.css?v=1'];

// 題・説明（1〜2文）
const THEMES = {
  stars: { n: '星がある国旗', lead: '国旗に星がある国の一覧です。五角形の星のほか、とがった形の星も数えています。' },
  cross: { n: '十字がある国旗', lead: '国旗のおもな模様に十字がある国の一覧です。北欧の国やユニオンジャックの入った国が多く入ります。' },
  crescent: { n: '三日月がある国旗', lead: '国旗に三日月がある国の一覧です。星といっしょに描かれていることが多い模様です。' },
  sun: { n: '太陽がある国旗', lead: '国旗に太陽がある国の一覧です。日本の日の丸もここに入ります。' },
  animal: { n: '動物・鳥がいる国旗', lead: '国旗に動物や鳥がいる国の一覧です。真ん中の紋章の中に小さく描かれているものも数えています。' },
  unionjack: { n: 'ユニオンジャックが入った国旗', lead: 'イギリスの国旗（ユニオンジャック）が入った国旗の一覧です。イギリス自身もふくみます。' },
  vtricolor: { n: 'たて3色の国旗', lead: '縦に3本の帯が並び、帯が3色の国旗の一覧です。' },
  htricolor: { n: 'よこ3色の国旗', lead: '横に3本の帯が並び、帯が3色の国旗の一覧です。' },
  redwhite: { n: '赤と白だけの国旗', lead: '赤と白の2色だけでできた国旗の一覧です。' },
  similar: { n: '似ている国旗の見分け方', lead: '色や形がよく似ていて、まちがえやすい国旗の組です。組ごとに、見分けるところを一言で書いています。' },
  island: { n: '島国の一覧', lead: 'ほかの国と陸で国境を接していない島国の一覧です。' },
  landlocked: { n: '内陸国の一覧', lead: '海に面していない内陸国の一覧です。' },
  bigarea: { n: '面積が大きい国ランキング', lead: `面積が大きい国の上位${RANK_N}か国です。面積は国旗マスターのデータ（km²）です。` },
  smallarea: { n: '面積が小さい国ランキング', lead: `面積が小さい国の${RANK_N}か国を、いちばん小さい国から並べました。面積は国旗マスターのデータ（km²）です。` },
};


// rpg-core.js の THEMES から `<key>: { n: '<name>', a: '…'.split(' ') }` を読む。無ければ投げる
function rpgList(src, key, name) {
  const m = new RegExp(`${key}: \\{ n: '${name}', a: '([^']*)'\\.split\\(' '\\) \\}`).exec(src);
  if (!m) throw new Error(`rpg-core.js に ${key}（${name}）の一覧が見つからない`);
  return m[1].split(' ');
}

export function readThemeInputs(root = REPO) {
  const read = f => readFileSync(join(root, f), 'utf8');
  const inp = readInputs(root);
  const F = JSON.parse(read('data/flag_features.json'));
  const TIPS = JSON.parse(read('data/similar_tips.json'));
  const rpg = read('rpg-core.js');
  const ISLAND = rpgList(rpg, 'island', '島国'), LANDLOCKED = rpgList(rpg, 'landlocked', '内陸国');
  const codes = new Set(inp.C.map(c => c.a));
  for (const a of [...ISLAND, ...LANDLOCKED]) if (!codes.has(a)) throw new Error(`rpg-core.js の一覧に知らないコード: ${a}`);
  for (const c of inp.C) if (!Array.isArray(F.flags[c.a])) throw new Error(`flag_features.json に ${c.a} が無い`);
  if (TIPS.length !== inp.SIMILAR.length || inp.SIMILAR.some((g, i) => g.join(' ') !== TIPS[i]?.g?.join(' '))) throw new Error('similar_tips.json が SIMILAR と合わない');
  if (inp.footer == null) throw new Error('index.html にフッターの目印が無い');
  if (!inp.sitemap.includes(MARK_START) || !inp.sitemap.includes(MARK_END)) throw new Error('sitemap.xml に theme の目印が無い');
  return { ...inp, F, TIPS, ISLAND, LANDLOCKED };
}

// テーマ → 国（countries.js の並び）。ランキングは面積の順
function themeCountries(inp, id) {
  const { C } = inp;
  if (FEATURES.includes(id)) return C.filter(c => inp.F.flags[c.a].includes(id));
  if (id === 'similar') { const s = new Set(inp.SIMILAR.flat()); return C.filter(c => s.has(c.a)); }
  if (id === 'island') return C.filter(c => inp.ISLAND.includes(c.a));
  if (id === 'landlocked') return C.filter(c => inp.LANDLOCKED.includes(c.a));
  const top = new Set(rankOrder(C, id).slice(0, RANK_N).map(c => c.a));
  return C.filter(c => top.has(c.a));
}
// 面積の順（bigarea は大きい順、smallarea は小さい順。同じならコード順）
function rankOrder(list, id) {
  return [...list].sort((x, y) => (id === 'bigarea' ? y.ar - x.ar : x.ar - y.ar) || (x.a < y.a ? -1 : 1));
}

const card = (inp, c) => `      <a class="ccard" href="../country/${c.a}.html">${flagImg(inp, c.a, '', true)}<span>${esc(c.n)}</span></a>`;
const cards = (inp, list) => `  <div class="ccards">
${[...list].sort(byJa).map(c => card(inp, c)).join('\n')}
  </div>`;

function body(inp, byA, id, list) {
  if (FEATURES.includes(id)) return `  <p class="trule"><span class="tv-k">数え方</span>${esc(inp.F.rules[id])}</p>
  <h2>${list.length}か国</h2>
${cards(inp, list)}`;
  if (id === 'island' || id === 'landlocked') return `  <h2>${list.length}か国</h2>
${cards(inp, list)}`;
  if (id === 'similar') return inp.SIMILAR.map((g, i) => `  <section class="sgroup">
    <h2>${esc(g.map(a => byA.get(a).n).join('・'))}</h2>
    <div class="ccards">
${g.map(a => card(inp, byA.get(a))).join('\n')}
    </div>
    <p class="stip">${esc(inp.TIPS[i].t)}</p>
  </section>`).join('\n');
  // ランキング
  return `  <table class="trank">
    <thead><tr><th scope="col">順位</th><th scope="col">国旗</th><th scope="col">国名</th><th scope="col">面積</th></tr></thead>
    <tbody>
${rankOrder(list, id).map((c, i) => `      <tr><td>${i + 1}</td><td>${flagImg(inp, c.a, '', true)}</td><td><a href="../country/${c.a}.html">${esc(c.n)}</a></td><td>${fmt(c.ar)} km²</td></tr>`).join('\n')}
    </tbody>
  </table>`;
}

const countLabel = (inp, id, list) => (id === 'similar' ? `${inp.SIMILAR.length}組` : `${list.length}か国`);

function description(inp, id, list) {
  const t = THEMES[id];
  const d = `${t.n}（${countLabel(inp, id, list)}）を国旗の画像つきでまとめました。${t.lead}`;
  return d.length <= DESC_MAX ? d : `${t.n}（${countLabel(inp, id, list)}）を国旗の画像つきでまとめました。国旗マスターでクイズにも挑戦できます。`;
}

function others(id) {
  return `  <h2>ほかのまとめ</h2>
  <ul class="tothers">
${THEME_IDS.filter(x => x !== id).map(x => `    <li><a href="${x}.html">${esc(THEMES[x].n)}</a></li>`).join('\n')}
  </ul>`;
}

function themePage(inp, byA, id) {
  const t = THEMES[id], list = themeCountries(inp, id), url = `${SITE}themes/${id}.html`;
  const quiz = list.length >= QUIZ_MIN ? `\n    <a class="play-region" href="../index.html#theme=${id}">このテーマでクイズ（${list.length}か国）</a>` : '';
  return head(inp, { title: `${t.n}｜国旗マスター`, description: description(inp, id, list), url, css: CSS,
    crumbs: [['国旗マスター', SITE], ['国旗のまとめ', `${SITE}themes/`], [t.n, url]] }) + `<body>
<main class="page">
  <a class="back" href="../">← 国旗マスターで遊ぶ</a>
  <nav class="crumbs" aria-label="現在地"><a href="../">国旗マスター</a> › <a href="./">国旗のまとめ</a> › ${esc(t.n)}</nav>
  <h1>${esc(t.n)}</h1>
  <p>${esc(t.lead)}</p>
${body(inp, byA, id, list)}
  <nav class="cplay" aria-label="遊ぶ">${quiz}
    <a href="../">国旗マスターで遊ぶ</a>
    <a href="../country/">国の一覧</a>
  </nav>
${others(id)}
</main>
${footerHTML(inp)}
</body>
</html>
`;
}

function indexPage(inp, byA) {
  const url = `${SITE}themes/`;
  const items = THEME_IDS.map(id => {
    const list = themeCountries(inp, id), first = id === 'bigarea' || id === 'smallarea' ? rankOrder(list, id)[0] : [...list].sort(byJa)[0];
    return `      <a class="ccard" href="${id}.html">${flagImg(inp, first.a, '', true)}<span>${esc(THEMES[id].n)}<br><small>${countLabel(inp, id, list)}</small></span></a>`;
  }).join('\n');
  return head(inp, { title: '国旗のまとめ（テーマ別）｜国旗マスター',
    description: '星・十字・三日月がある国旗、よく似た国旗の見分け方、島国・内陸国、面積のランキングなど、テーマ別に国旗をまとめたページの一覧です。',
    url, css: CSS, crumbs: [['国旗マスター', SITE], ['国旗のまとめ', url]] }) + `<body>
<main class="page">
  <a class="back" href="../">← 国旗マスターで遊ぶ</a>
  <nav class="crumbs" aria-label="現在地"><a href="../">国旗マスター</a> › 国旗のまとめ</nav>
  <h1>国旗のまとめ</h1>
  <p>国旗を模様や色、国の形でまとめたページです。テーマをえらぶと、当てはまる国旗の一覧が見られます。</p>
  <div class="ccards tindex">
${items}
  </div>
</main>
${footerHTML(inp)}
</body>
</html>
`;
}

// themes.js: 10か国以上のテーマだけ。国は countries.js の並び
function themesJs(inp) {
  const lines = THEME_IDS.map(id => [id, themeCountries(inp, id)]).filter(([, l]) => l.length >= QUIZ_MIN)
    .map(([id, l]) => `  ${JSON.stringify(id)}: ${JSON.stringify({ n: THEMES[id].n, a: l.map(c => c.a) })}`);
  return `// テーマ別のまとめ（themes/*.html）の「このテーマでクイズ」で出す国。tools/make_theme_pages.mjs が作る（手で直さない）
window.THEMES_DATA = {
${lines.join(',\n')}
};
`;
}

function sitemapOf(inp) {
  const urls = [`${SITE}themes/`, ...THEME_IDS.map(id => `${SITE}themes/${id}.html`)];
  const i = inp.sitemap.indexOf(MARK_START) + MARK_START.length, j = inp.sitemap.indexOf(MARK_END);
  return inp.sitemap.slice(0, i) + '\n' + urls.map(u => `  <url><loc>${u}</loc></url>\n`).join('') + '  ' + inp.sitemap.slice(j);
}

// 出力の相対パス → 中身
export function renderThemes(inp) {
  const byA = new Map(inp.C.map(c => [c.a, c])), out = { 'themes/index.html': indexPage(inp, byA) };
  for (const id of THEME_IDS) out[`themes/${id}.html`] = themePage(inp, byA, id);
  out['themes.js'] = themesJs(inp);
  out['sitemap.xml'] = sitemapOf(inp);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? resolve(process.argv[i + 1]) : REPO; };
  const root = arg('--root'), outDir = arg('--out');
  let inp;
  try { inp = readThemeInputs(root); } catch (e) { console.error(e.message); process.exit(1); }
  const files = renderThemes(inp);
  mkdirSync(join(outDir, 'themes'), { recursive: true });
  for (const [p, s] of Object.entries(files)) writeFileSync(join(outDir, p), s);
  console.log(`${Object.keys(files).length} ファイルを書いた`);
}
