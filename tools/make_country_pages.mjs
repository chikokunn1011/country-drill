// 国ごとのページ（country/<a>.html ×195）と一覧（country/index.html）を作り、sitemap.xml の目印のあいだを書きかえる。
// 使い方: node tools/make_country_pages.mjs [--root DIR] [--out DIR]（どちらも既定はリポジトリの根）
// 読むもの: countries.js・trivia.js・daily-core.js の SIMILAR・index.html（REGIONS・SUBREGIONS・フッター・FLAG_V・テーマの先読み・フォント）・
// privacy.html の pages.css?v=・flags/*.svg・sitemap.xml・world.js（となりの国）・data/neighbors_fix.json・
// data/flag_meanings.json（国旗の意味）・themes.js（まとめの題と国。tools/make_theme_pages.mjs が作る）。日付と乱数は使わない（同じ入力からはいつも同じ出力）。作ったファイルはコミットする
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// topojson-client はリポジトリの vendor/ のもの（本編が読むのと同じライブラリ）
const topojson = createRequire(import.meta.url)(join(REPO, 'vendor/topojson-client-3.1.0.min.js'));
export const SITE = 'https://chikokunn1011.github.io/country-drill/';
const OGP = SITE + 'icons/ogp.png';
const TRIVIA_LABEL = { flag: '国旗', geo: '地理', culture: '文化' };
export const DESC_MAX = 120;
const FOOTER_RE = /<!-- footer:start -->([\s\S]*?)<!-- footer:end -->/;
const MARK_START = '<!-- country:start -->', MARK_END = '<!-- country:end -->';

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const fmt = n => n.toLocaleString('en-US');   // 本編の fmt（ja-JP）と同じ3桁区切り
// 漢字をふくむ国名の読み（五十音順に並べるため）。漢字の国名はここに全部書く（tests/unit/theme-pages.test.mjs）
export const KANA = {
  ae: 'アラブシュチョウコクレンポウ', cd: 'コンゴミンシュキョウワコク', cf: 'チュウオウアフリカ', cg: 'コンゴキョウワコク', cn: 'チュウゴク',
  dm: 'ドミニカコク', do: 'ドミニカキョウワコク', fm: 'ミクロネシアレンポウ', gq: 'セキドウギニア', jp: 'ニホン', kp: 'キタチョウセン',
  kr: 'カンコク', mh: 'マーシャルショトウ', mk: 'キタマケドニア', sb: 'ソロモンショトウ', ss: 'ミナミスーダン', tl: 'ヒガシティモール',
  us: 'アメリカガッシュウコク', vc: 'セントビンセントオヨビグレナディーンショトウ', za: 'ミナミアフリカ',
};
export const yomi = c => KANA[c.a] ?? c.n;
// 国名の五十音順（読みで比べる。同じならコード順）
export const byJa = (x, y) => yomi(x).localeCompare(yomi(y), 'ja') || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0);
const byCode = (x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : 0);
const hasText = x => typeof x?.t === 'string' && x.t.trim() !== '';

export function readInputs(root) {
  const read = f => readFileSync(join(root, f), 'utf8');
  const win = f => { const ctx = { window: {} }; vm.runInNewContext(read(f), ctx); return ctx.window; };
  const C = win('countries.js').COUNTRIES;
  const TRIVIA = win('trivia.js').TRIVIA;
  const dctx = {}; vm.runInNewContext(read('daily-core.js'), dctx);
  const SIMILAR = dctx.DAILY_CORE.SIMILAR.map(g => [...g]);
  const index = read('index.html'), head = index.split('</head>')[0];
  // vm の中の配列・オブジェクトをこちらの形に写す（deepEqual で比べられるように）
  const evalOf = re => { const m = re.exec(index); return m ? JSON.parse(JSON.stringify(vm.runInNewContext(`(${m[1]})`))) : null; };
  const REGIONS = evalOf(/const REGIONS = (\[[^\]]*\]);/);
  const SUBREGIONS = evalOf(/const SUBREGIONS = (\{[\s\S]*?\n\});/);
  const footer = FOOTER_RE.exec(index)?.[1].trim() ?? null;
  const FLAG_V = +(/const FLAG_V = (\d+);/.exec(index)?.[1] ?? NaN);
  const PAGES_V = +(/<link rel="stylesheet" href="pages\.css\?v=(\d+)">/.exec(read('privacy.html'))?.[1] ?? NaN);
  // テーマを当てる文だけ（head の最初の script にある adminErrors を残す文は写さない）
  const themeScript = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].flatMap(m => m[1].split('\n')).filter(l => l.includes('dataset.theme')).join('\n').trim();
  const fontLink = head.split('\n').find(l => l.startsWith('<link') && l.includes('fonts.googleapis.com/css2')) ?? '';
  const sitemap = read('sitemap.xml');
  const flagDir = join(root, 'flags');
  const flagFiles = new Set(existsSync(flagDir) ? readdirSync(flagDir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)) : []);
  // 地図の国の形（world.js）: 形ごとの国（本編の cOfFeat と同じく id でとる）と、topojson.neighbors のとなりの形
  const geoms = win('world.js').WORLD.objects.countries.geometries;
  const featCodes = geoms.map(g => (String(g.id) === 'XK' ? C.find(c => c.a === 'xk') : C.find(c => c.id === String(g.id)))?.a ?? null);
  const featNb = topojson.neighbors(geoms);
  const NEIGHBORS_FIX = JSON.parse(read('data/neighbors_fix.json'));
  // 国旗の意味: コード → 文（note は出さない）
  const MEANINGS = Object.fromEntries(JSON.parse(read('data/flag_meanings.json')).map(m => [m.a, m.t]));
  // まとめ: themes.js のテーマ（10か国以上で、ページのあるもの）→ { n: 題, a: 国 }
  const THEMES_DATA = JSON.parse(JSON.stringify(win('themes.js').THEMES_DATA));
  return { C, TRIVIA, SIMILAR, REGIONS, SUBREGIONS, footer, FLAG_V, PAGES_V, themeScript, fontLink, sitemap, flagFiles, featCodes, featNb, NEIGHBORS_FIX, MEANINGS, THEMES_DATA };
}

// 地図の形がとなり合う国の組（a-b と b-a の両方）。国に当たらない形（西サハラ・パレスチナなど）は飛ばす
const mapPairs = inp => {
  const out = new Set();
  inp.featNb.forEach((js, i) => { const a = inp.featCodes[i]; if (a) for (const j of js) { const b = inp.featCodes[j]; if (b && b !== a) out.add(`${a}-${b}`); } });
  return out;
};

// となりの国: 国 → となりの国のコード（五十音順）。地図から計算し、neighbors_fix.json の add を足し remove を引く。対称
export function neighborsOf(inp) {
  const pairs = mapPairs(inp);
  for (const [a, b] of inp.NEIGHBORS_FIX.add) { pairs.add(`${a}-${b}`); pairs.add(`${b}-${a}`); }
  for (const [a, b] of inp.NEIGHBORS_FIX.remove) { pairs.delete(`${a}-${b}`); pairs.delete(`${b}-${a}`); }
  const byA = new Map(inp.C.map(c => [c.a, c])), out = new Map(inp.C.map(c => [c.a, []]));
  for (const p of pairs) { const [a, b] = p.split('-'); out.get(a)?.push(b); }
  for (const list of out.values()) list.sort((x, y) => byJa(byA.get(x), byA.get(y)));
  return out;
}

// 作る前の検査。問題の文の配列（空なら OK）
export function check(inp) {
  const codes = new Set(inp.C.map(c => c.a)), out = [];
  for (const a of new Set(inp.SIMILAR.flat())) if (!codes.has(a)) out.push(`SIMILAR に知らないコード: ${a}`);
  for (const c of inp.C) {
    const list = inp.TRIVIA?.[c.a];
    if (!Array.isArray(list) || !list.some(hasText)) out.push(`豆知識が0件: ${c.a}`);
  }
  for (const c of inp.C) if (!inp.flagFiles.has(c.a)) out.push(`flags/${c.a}.svg が無い`);
  for (const c of inp.C) {
    if (typeof inp.MEANINGS[c.a] !== 'string' || !inp.MEANINGS[c.a].trim()) out.push(`国旗の意味が無い: ${c.a}`);
    else if (descHead(c, inp.MEANINGS[c.a]).length > DESC_MAX) out.push(`国旗の意味の最初の文が長すぎる: ${c.a}`);
  }
  if (inp.footer == null) out.push('フッターの目印が無い');
  if (!inp.sitemap.includes(MARK_START) || !inp.sitemap.includes(MARK_END)) out.push('sitemap.xml の目印が無い');
  // となりの国の直し: 知らないコード・地図と同じになる直し（add が地図にある、remove が地図に無い）
  const pairs = mapPairs(inp);
  for (const [kind, list] of [['add', inp.NEIGHBORS_FIX.add], ['remove', inp.NEIGHBORS_FIX.remove]]) for (const [a, b] of list) {
    if (!codes.has(a) || !codes.has(b) || a === b) out.push(`neighbors_fix の ${kind} に知らないコード: ${a}-${b}`);
    else if (pairs.has(`${a}-${b}`) === (kind === 'add')) out.push(`neighbors_fix の ${kind} が地図と同じ: ${a}-${b}`);
  }
  return out;
}

// 国の「この地域で遊ぶ」の地域: 細かい地域に入っていればそれ、なければ6地域
const playRegion = (inp, c) => Object.entries(inp.SUBREGIONS).find(([, o]) => o.a.split(' ').includes(c.a))?.[0] ?? c.r;
const playHref = r => `../index.html#play=${encodeURIComponent(r)}`;
// 似ている国（SIMILAR のグループの順、自分を除く。2つのグループに入っていても1回だけ）
const similarOf = (inp, byA, a) => [...new Set(inp.SIMILAR.filter(g => g.includes(a)).flat())].filter(b => b !== a).map(b => byA.get(b));
const flagSrc = (inp, a) => `../flags/${a}.svg?v=${inp.FLAG_V}`;
export const flagImg = (inp, a, alt, lazy) => `<img src="${flagSrc(inp, a)}" alt="${esc(alt)}" width="640" height="480"${lazy ? ' loading="lazy"' : ''}>`;
// フッター: 相対 href の頭に ../ を付ける（http・# で始まるものはそのまま）
export const footerHTML = inp => `<footer>
  <!-- footer:start -->
  ${inp.footer.replace(/href="(?!https?:|#)([^"]*)"/g, 'href="../$1"')}
  <!-- footer:end -->
</footer>`;

// css: 国のページは country.css。まとめページ（tools/make_theme_pages.mjs）はほかの css も渡す
export function head(inp, { title, description, url, crumbs, css = ['country.css?v=2'] }) {
  const ld = { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) };
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="国旗マスター">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OGP}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">
${JSON.stringify(ld).replace(/</g, '\\u003c')}
</script>
<link rel="icon" href="../favicon.ico" sizes="32x32">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
<meta name="theme-color" content="#1f5f8b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${inp.fontLink}
<script>
// 画面の色はアプリ（index.html）と同じ文で当てる（設定の theme、未設定はライト。'auto' なら端末に合わせる）
${inp.themeScript}
</script>
<link rel="stylesheet" href="../pages.css?v=${inp.PAGES_V}">
${css.map(h => `<link rel="stylesheet" href="${h}">`).join('\n')}
</head>
`;
}

// description の頭: 「<国名>の国旗の意味: <国旗の意味の最初の文>」
const descHead = (c, meaning) => `${c.n}の国旗の意味: ${meaning.split('。')[0]}。`;
// 頭のあとに、地域・似ている国旗・さそいの文を、120字に収まるところまで文ごとに付ける（文の途中では切らない）
function countryDescription(inp, c, sims) {
  const rest = [`${c.n}（${c.r}）の国旗と、首都・面積・豆知識。`, ...(sims.length ? [`似ている国旗: ${sims.map(s => s.n).join('・')}。`] : []),
    '国旗マスターで国旗・国名・場所をクイズで覚えよう。'];
  let d = descHead(c, inp.MEANINGS[c.a]);
  for (const s of rest) { if ((d + s).length > DESC_MAX) break; d += s; }
  return d;
}

// 同じ6地域の中の、五十音順で前と次の国（端なら null）
function prevNextOf(inp, c) {
  const list = inp.C.filter(x => x.r === c.r).sort(byJa), i = list.indexOf(c);
  return [list[i - 1] ?? null, list[i + 1] ?? null];
}

function countryPage(inp, byA, nbs, c) {
  const sims = similarOf(inp, byA, c.a), region = playRegion(inp, c), url = `${SITE}country/${c.a}.html`;
  const trivia = inp.TRIVIA[c.a].filter(hasText)
    .map(x => `    <li><span class="tv-k">${esc(TRIVIA_LABEL[x.k] ?? x.k)}</span>${esc(x.t)}</li>`).join('\n');
  const similar = sims.length ? `
  <h2>似ている国旗</h2>
  <ul class="similar">
${sims.map(s => `    <li><a href="${s.a}.html">${flagImg(inp, s.a, '', true)}<span>${esc(s.n)}</span></a></li>`).join('\n')}
  </ul>
` : '';
  // となりの国（同じフォルダのページへ）。無ければ一文。島国は themes.js の island で見る（オーストラリアは島国にしない）
  const nb = nbs.get(c.a).map(b => byA.get(b));
  const neighbors = nb.length ? `  <ul class="neighbors">
${nb.map(b => `    <li><a href="${b.a}.html">${flagImg(inp, b.a, '', true)}<span>${esc(b.n)}</span></a></li>`).join('\n')}
  </ul>` : `  <p class="noneighbor">陸で接している国はない${inp.THEMES_DATA.island?.a.includes(c.a) ? '（島国）' : ''}</p>`;
  // この国旗が出てくるまとめ（themes.js の並び）。無ければ節ごと出さない
  const themes = Object.entries(inp.THEMES_DATA).filter(([, t]) => t.a.includes(c.a));
  const themeList = themes.length ? `
  <h2>この国旗が出てくるまとめ</h2>
  <ul class="cthemes">
${themes.map(([id, t]) => `    <li><a href="../themes/${id}.html">${esc(t.n)}</a></li>`).join('\n')}
  </ul>
` : '';
  const [prev, next] = prevNextOf(inp, c);
  return head(inp, { title: `${c.n}の国旗と豆知識｜国旗マスター`, description: countryDescription(inp, c, sims), url,
    crumbs: [['国旗マスター', SITE], ['国の一覧', `${SITE}country/`], [c.n, url]] }) + `<body>
<main class="page">
  <a class="back" href="../">← 国旗マスターで遊ぶ</a>
  <nav class="crumbs" aria-label="現在地"><a href="../">国旗マスター</a> › <a href="./">国の一覧</a> › ${esc(c.n)}</nav>
  <h1>${esc(c.n)}</h1>
  <div class="cflag">${flagImg(inp, c.a, `${c.n}の国旗`, false)}</div>
  <dl class="cfacts">
    <dt>地域</dt><dd>${esc(c.r)}</dd>
    <dt>面積</dt><dd>${fmt(c.ar)} km²</dd>
    <dt>首都</dt><dd>${esc(c.c)}</dd>
    <dt>ISO</dt><dd>${c.a.toUpperCase()}</dd>
  </dl>

  <h2>国旗の意味</h2>
  <p class="meaning">${esc(inp.MEANINGS[c.a])}</p>

  <h2>豆知識</h2>
  <ul class="trivia">
${trivia}
  </ul>

  <h2>となりの国</h2>
${neighbors}
${similar}${themeList}
  <nav class="cplay" aria-label="遊ぶ">
    <a class="play-region" href="${playHref(region)}">この地域で遊ぶ（${esc(region)}）</a>
    <a href="../">国旗マスターで遊ぶ</a>
    <a href="../index.html#book">図鑑で見る</a>
  </nav>
  <nav class="prevnext" aria-label="${esc(c.r)}の前の国・次の国">${prev ? `
    <a class="prev" href="${prev.a}.html">← ${esc(prev.n)}</a>` : ''}${next ? `
    <a class="next" href="${next.a}.html">${esc(next.n)} →</a>` : ''}
  </nav>
</main>
${footerHTML(inp)}
</body>
</html>
`;
}

function indexPage(inp) {
  const url = `${SITE}country/`;
  const sections = inp.REGIONS.map(r => `  <section><h2>${esc(r)}</h2>
    <p class="rplay"><a href="${playHref(r)}">この地域で遊ぶ ›</a></p>
    <div class="ccards">
${inp.C.filter(c => c.r === r).sort(byCode).map(c => `      <a class="ccard" href="${c.a}.html">${flagImg(inp, c.a, '', true)}<span>${esc(c.n)}</span></a>`).join('\n')}
    </div>
  </section>`).join('\n');
  return head(inp, { title: '国の一覧（195か国の国旗）｜国旗マスター',
    description: '世界195か国の国旗と国名を、6つの地域ごとに並べた一覧です。国をえらぶと、首都・面積・豆知識・似ている国旗が見られます。',
    url, crumbs: [['国旗マスター', SITE], ['国の一覧', url]] }) + `<body>
<main class="page">
  <a class="back" href="../">← 国旗マスターで遊ぶ</a>
  <nav class="crumbs" aria-label="現在地"><a href="../">国旗マスター</a> › 国の一覧</nav>
  <h1>国の一覧</h1>
  <p>世界${inp.C.length}か国の国旗と国名です。国をえらぶと、その国の首都・面積・豆知識が見られます。</p>
${sections}
</main>
${footerHTML(inp)}
</body>
</html>
`;
}

// sitemap.xml の目印のあいだだけを書きかえる（目印の外はそのまま。国のページに lastmod は付けない）
function sitemapOf(inp) {
  const urls = [`${SITE}country/`, ...[...inp.C].sort(byCode).map(c => `${SITE}country/${c.a}.html`)];
  const i = inp.sitemap.indexOf(MARK_START) + MARK_START.length, j = inp.sitemap.indexOf(MARK_END);
  return inp.sitemap.slice(0, i) + '\n' + urls.map(u => `  <url><loc>${u}</loc></url>\n`).join('') + '  ' + inp.sitemap.slice(j);
}

// 出力の相対パス → 中身
export function render(inp) {
  const byA = new Map(inp.C.map(c => [c.a, c])), out = { 'country/index.html': indexPage(inp) };
  const nbs = neighborsOf(inp);
  for (const c of [...inp.C].sort(byCode)) out[`country/${c.a}.html`] = countryPage(inp, byA, nbs, c);
  out['sitemap.xml'] = sitemapOf(inp);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? resolve(process.argv[i + 1]) : REPO; };
  const root = arg('--root'), outDir = arg('--out');
  const inp = readInputs(root), problems = check(inp);
  if (problems.length) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  const files = render(inp);
  mkdirSync(join(outDir, 'country'), { recursive: true });
  for (const [p, s] of Object.entries(files)) writeFileSync(join(outDir, p), s);
  console.log(`${Object.keys(files).length} ファイルを書いた`);
}
