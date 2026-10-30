// 国ごとのページ（country/*.html）と、それを作る tools/make_country_pages.mjs。
// 作ったページはコミットするので、作り直すと1文字もちがわないことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readInputs, check, render, neighborsOf, byJa, theName, THE_NAMES } from '../../tools/make_country_pages.mjs';
import { JA_RE } from '../../tools/i18n_scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://chikokunn1011.github.io/country-drill/';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const load = (file, name) => { const ctx = { window: {} }; vm.runInNewContext(read(file), ctx); return ctx.window[name]; };
const C = load('countries.js', 'COUNTRIES');
const TRIVIA = load('trivia.js', 'TRIVIA');
const TRIVIA_EN = load('trivia-en.js', 'TRIVIA');
const SIMILAR = (() => { const ctx = {}; vm.runInNewContext(read('daily-core.js'), ctx); return ctx.DAILY_CORE.SIMILAR; })();
const FLAG_V = +/const FLAG_V = (\d+);/.exec(read('index.html'))[1];

const countryPages = () => ['country/index.html', ...C.map(c => `country/${c.a}.html`)];
const attr = (h, re) => (re.exec(h) ?? [])[1];
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const desc = h => unesc(attr(h, /<meta name="description" content="([^"]*)">/) ?? '');
const URL_OF = p => SITE + (p === 'country/index.html' ? 'country/' : p);
const ldJson = h => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)[1]);
// head の先読み script のうち、テーマを当てる文（pages.test.mjs と同じ取り方）
const themeScript = html => {
  const head = html.split('</head>')[0];
  const lines = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].flatMap(m => m[1].split('\n'));
  return lines.filter(l => l.includes('dataset.theme')).join('\n').trim();
};
const count = (s, re) => (s.match(re) ?? []).length;
// <ul class="similar"> などの中の href
const hrefsIn = (h, sel) => {
  const [tag, cls] = sel.split('.');
  const m = new RegExp(`<${tag} class="${cls}">([\\s\\S]*?)</${tag}>`).exec(h);
  return m ? [...m[1].matchAll(/href="([^"]*)"/g)].map(x => x[1]) : [];
};
// href・src の相対リンク（http・#・mailto などは外す）。? と # を外す
const relLinks = h => [...h.matchAll(/(?:href|src)="([^"]*)"/g)].map(m => m[1])
  .filter(u => !/^(?:[a-z]+:|#|\/\/)/.test(u)).map(u => u.split('#')[0].split('?')[0]);
const resolveFrom = (p, u) => { const r = posix.normalize(posix.join(posix.dirname(p), u || posix.basename(p))); return join(ROOT, r.endsWith('/') || r === '.' ? join(r, 'index.html') : r); };
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); assert.ok(i >= 0 && j > i, `${a}〜${b} が無い`); return s.slice(i + a.length, j); };
const outside = s => s.split('<!-- country:start -->')[0] + (s.split('<!-- country:end -->')[1] ?? '');
const locs = s => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'country-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
// 生成スクリプトが読むものを一時の root に写す
const copyInputs = dir => {
  for (const f of ['countries.js', 'trivia.js', 'trivia-en.js', 'daily-core.js', 'index.html', 'privacy.html', 'sitemap.xml', 'world.js']) cpSync(join(ROOT, f), join(dir, f));
  for (const d of ['flags', 'themes', 'en/themes']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  for (const f of ['en/index.html', 'i18n/en-core.js', 'data/en/flag_meanings.json']) { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(ROOT, f), join(dir, f)); }
  for (const f of ['neighbors_fix.json', 'flag_meanings.json']) cpSync(join(ROOT, 'data', f), join(dir, 'data', f));
};
const edit = (dir, f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));
const setTrivia = (dir, a, list) => edit(dir, 'trivia.js', () => `window.TRIVIA = ${JSON.stringify({ ...TRIVIA, [a]: list })};\n`);
const setTriviaEn = (dir, a, list) => edit(dir, 'trivia-en.js', () => `window.TRIVIA = ${JSON.stringify({ ...TRIVIA_EN, [a]: list })};\n`);
const similarAdd = code => dir => edit(dir, 'daily-core.js', s => s.replace("'qa bh',", `'qa bh ${code}',`));
const triviaEmpty = a => dir => setTrivia(dir, a, []);
const rmFlag = a => dir => rmSync(join(dir, 'flags', `${a}.svg`));
const noFooterMarks = dir => edit(dir, 'index.html', s => s.replace('<!-- footer:start -->', ''));
const noThemes = dir => rmSync(join(dir, 'themes'), { recursive: true, force: true });
const noEnMeaning = a => dir => edit(dir, 'data/en/flag_meanings.json', s => JSON.stringify(JSON.parse(s).filter(m => m.a !== a)));
const noEnFooter = dir => edit(dir, 'en/index.html', s => s.replace('<!-- footer:start -->', ''));
const noEnThemes = dir => rmSync(join(dir, 'en/themes'), { recursive: true, force: true });

test('regenerate_same', () => {            // 作り直すと同じ（コミット済みと1文字もちがわない）
  const out = render(readInputs(ROOT));
  for (const d of ['country/', 'en/country/']) assert.equal(Object.keys(out).filter(p => p.startsWith(d)).length, 196, d);
  for (const [p, s] of Object.entries(out)) assert.equal(read(p), s, p);
  for (const d of ['country/', 'en/country/']) assert.deepEqual(readdirSync(join(ROOT, d)).filter(f => f.endsWith('.html')).sort(),
    Object.keys(out).filter(p => p.startsWith(d)).map(p => p.slice(d.length)).sort(), d);
});

test('inputs_ok', () => assert.deepEqual(check(readInputs(ROOT)), []));

test('subregions_extracted', () => {
  const { SUBREGIONS, REGIONS } = readInputs(ROOT);
  assert.equal(REGIONS.length, 6);
  assert.equal(Object.keys(SUBREGIONS).length, 10);
  assert.ok(SUBREGIONS['西ヨーロッパ'].a.split(' ').includes('fr'));
});

test('head_items', () => {                  // 196枚
  const indexTheme = themeScript(read('index.html'));
  assert.match(indexTheme, /dataset\.theme/);
  for (const p of countryPages()) {
    const h = read(p);
    assert.match(h, /<html lang="ja">/, p);
    assert.ok(h.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'), p);
    assert.match(h, /<title>[^<]+｜国旗マスター<\/title>/, p);
    assert.ok(desc(h).length > 0 && desc(h).length <= 120, `${p} ${desc(h).length}`);
    assert.ok(h.includes(`<link rel="canonical" href="${URL_OF(p)}">`), p);
    assert.ok(h.includes(`<meta property="og:url" content="${URL_OF(p)}">`), p);
    assert.ok(h.includes('<meta property="og:image" content="https://chikokunn1011.github.io/country-drill/icons/ogp.png">'), p);
    for (const s of ['<meta property="og:type" content="website">', '<meta property="og:site_name" content="国旗マスター">',
      '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
      '<meta property="og:locale" content="ja_JP">', '<meta name="twitter:card" content="summary_large_image">']) assert.ok(h.includes(s), `${p} ${s}`);
    const ld = ldJson(h);
    assert.equal(ld['@type'], 'BreadcrumbList', p);
    assert.equal(ld.itemListElement.length, p === 'country/index.html' ? 2 : 3, p);
    assert.equal(ld.itemListElement.at(-1).item, URL_OF(p), p);
    assert.equal(themeScript(h), indexTheme, p);
    assert.ok(!/<script[^>]* src=/.test(h), p);
    assert.ok(!h.includes('adminErrors'), p);
    assert.match(h, /<link rel="stylesheet" href="\.\.\/pages\.css\?v=\d+">/, p);
    assert.ok(h.includes('<link rel="stylesheet" href="country.css?v=2">'), p);
  }
  assert.equal(attr(read('country/fr.html'), /<title>([^<]*)<\/title>/), 'フランスの国旗と豆知識｜国旗マスター');
  assert.equal(attr(read('country/index.html'), /<title>([^<]*)<\/title>/), '国の一覧（195か国の国旗）｜国旗マスター');
});

test('country_page_content', () => {        // fr: 国旗・豆知識全件・似ている国旗・遊ぶリンク
  const h = read('country/fr.html');
  assert.ok(h.includes('<h1>フランス</h1>'));
  assert.ok(h.includes(`<img src="../flags/fr.svg?v=${FLAG_V}" alt="フランスの国旗" width="640" height="480">`));
  assert.ok(h.includes('<dt>首都</dt><dd>パリ</dd>'));
  assert.ok(h.includes('<dt>面積</dt><dd>551,695 km²</dd>'));   // 本編の fmt と同じ3桁区切り
  assert.ok(h.includes('<dt>ISO</dt><dd>FR</dd>'));
  assert.equal(count(h, /<li><span class="tv-k">/g), TRIVIA.fr.length);
  assert.deepEqual(hrefsIn(h, 'ul.similar'), ['nl.html', 'lu.html', 'py.html']);
  assert.ok(h.includes(`href="../index.html#play=${encodeURIComponent('西ヨーロッパ')}"`));
  assert.ok(h.includes('>この地域で遊ぶ（西ヨーロッパ）</a>'));
  assert.ok(h.includes('href="../index.html#book"'));
  assert.ok(h.includes('<a class="back" href="../">← 国旗マスターで遊ぶ</a>'));
  // 細かい地域に入っていない国は c.r（オセアニアの国）
  const au = read('country/au.html');
  assert.ok(au.includes(`href="../index.html#play=${encodeURIComponent('オセアニア')}"`));
  // 出題は無い（首都は表示するだけ）
  assert.ok(!/<(?:form|input|button)\b/.test(h));
});

test('country_footer', () => {              // index.html のフッターに ../ を付けたもの。「国の一覧」もある
  const foot = /<!-- footer:start -->([\s\S]*?)<!-- footer:end -->/;
  const want = foot.exec(read('index.html'))[1].trim().replace(/href="(?!https?:|#)([^"]*)"/g, 'href="../$1"');
  for (const p of countryPages()) assert.equal(foot.exec(read(p))?.[1].trim(), want, p);
  assert.ok(want.includes('<a href="../country/">国の一覧</a>'));
});

test('similar_section', () => {             // SIMILAR に無い国は見出しごと出さない
  const inSim = new Set(SIMILAR.flat()); assert.equal(inSim.size, 93);
  for (const c of C) assert.equal(read(`country/${c.a}.html`).includes('似ている国旗</h2>'), inSim.has(c.a), c.a);
});

test('country_index_content', () => {       // 6地域の順に、国旗＋国名のカード（コード順）
  const h = read('country/index.html'), { REGIONS } = readInputs(ROOT);
  assert.deepEqual([...h.matchAll(/<section><h2>([^<]+)<\/h2>/g)].map(m => m[1]), REGIONS);
  assert.equal(count(h, /<a class="ccard" href="[a-z]{2}\.html">/g), 195);
  for (const r of REGIONS) {
    assert.ok(h.includes(`href="../index.html#play=${encodeURIComponent(r)}"`), r);
    const sec = h.split(`<section><h2>${r}</h2>`)[1].split('</section>')[0];
    const codes = [...sec.matchAll(/class="ccard" href="([a-z]{2})\.html"/g)].map(m => m[1]);
    assert.deepEqual(codes, [...C.filter(c => c.r === r).map(c => c.a).sort()], r);
  }
});

test('relative_links_exist', () => {        // href・src の相対リンクの先がある
  for (const p of countryPages()) for (const u of relLinks(read(p))) assert.ok(existsSync(resolveFrom(p, u)), `${p} → ${u}`);
});

test('no_color_vars_in_country_css', () => assert.ok(!/--[\w-]+\s*:/.test(read('country/country.css'))));

test('sitemap_markers', () => {
  const s = read('sitemap.xml'), inside = between(s, '<!-- country:start -->', '<!-- country:end -->');
  assert.deepEqual(locs(inside), ['country/', 'en/country/'].flatMap(d => [SITE + d, ...C.map(c => c.a).sort().map(a => `${SITE}${d}${a}.html`)]));
  assert.ok(!inside.includes('<lastmod>'));
  for (const p of ['', 'privacy.html', 'about.html', 'howto.html']) assert.ok(locs(outside(s)).includes(SITE + p), p);
  const i = readInputs(ROOT), once = render(i)['sitemap.xml'];
  assert.equal(render({ ...i, sitemap: once })['sitemap.xml'], once);   // 2回目も同じ
  assert.equal(outside(once), outside(s));                              // 目印の外は変えない
});

test('cli_stops_on_bad_input', () => {      // 一時の root に入力を写し、1つずつこわす。終了コード1・stderr・何も書かない
  for (const [break_, re] of [[similarAdd('zz'), /SIMILAR に知らないコード: zz/], [triviaEmpty('fr'), /豆知識が0件: fr/],
                              [rmFlag('fr'), /flags\/fr\.svg が無い/], [noFooterMarks, /フッターの目印が無い/],
                              [noThemes, /themes\/index\.html が無い/], [noEnMeaning('fr'), /英語の国旗の意味が無い: fr/],
                              [noEnFooter, /en\/index\.html のフッターの目印が無い/], [noEnThemes, /en\/themes\/index\.html が無い/]])
    withTmp(dir => {
      copyInputs(dir); break_(dir);
      const r = spawnSync('node', ['tools/make_country_pages.mjs', '--root', dir, '--out', dir], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, re);
      assert.ok(!existsSync(join(dir, 'country')));
      assert.equal(readFileSync(join(dir, 'sitemap.xml'), 'utf8'), read('sitemap.xml'));
    });
});

test('cli_writes', () => withTmp(dir => {   // こわれていなければ --out に書く（中身はコミット済みと同じ）
  copyInputs(dir);
  const r = spawnSync('node', ['tools/make_country_pages.mjs', '--root', dir, '--out', dir], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const p of ['country/index.html', 'country/fr.html', 'en/country/index.html', 'en/country/fr.html', 'sitemap.xml']) assert.equal(readFileSync(join(dir, p), 'utf8'), read(p), p);
}));

test('escapes_text', () => withTmp(dir => {   // 豆知識に `<b>&"` → ページには &lt;b&gt;&amp;&quot;、<b> タグは無い
  copyInputs(dir); setTrivia(dir, 'fr', [{ k: 'flag', t: '<b>&"テスト' }]);
  const h = render(readInputs(dir))['country/fr.html'];
  assert.ok(h.includes('&lt;b&gt;&amp;&quot;テスト')); assert.ok(!h.includes('<b>&'));
}));

// となりの国（world.js の地図から計算し、data/neighbors_fix.json で直す）
const INP = readInputs(ROOT), NB = neighborsOf(INP);
const FIX = JSON.parse(read('data/neighbors_fix.json'));
const byA = new Map(C.map(c => [c.a, c]));

test('neighbors_list', t => {             // 一覧を出す（確かめるため）。全部の国があり、自分はふくまず、五十音順
  assert.deepEqual([...NB.keys()].sort(), [...C.map(c => c.a)].sort());
  for (const c of [...C].sort(byJa)) {
    const list = NB.get(c.a);
    t.diagnostic(`${c.a} ${c.n}: ${list.map(b => byA.get(b).n).join('・') || '（なし）'}`);
    assert.ok(!list.includes(c.a), c.a);
    assert.equal(new Set(list).size, list.length, c.a);
    assert.deepEqual(list, [...list].sort((x, y) => byJa(byA.get(x), byA.get(y))), c.a);
  }
});

test('neighbors_known', () => {
  const has = (a, list) => { for (const b of list) assert.ok(NB.get(a).includes(b), `${a} のとなりに ${b}`); };
  has('fr', ['de', 'es', 'be', 'ch', 'it', 'lu', 'ad', 'mc']);
  has('es', ['pt', 'fr', 'ad']);
  has('cn', ['in', 'np', 'ru', 'kp', 'mn']);
  assert.equal(NB.get('cn').length, 14);
  assert.deepEqual(NB.get('kr'), ['kp']);
  assert.deepEqual(NB.get('sm'), ['it']);
  assert.deepEqual(NB.get('va'), ['it']);
  // 小さい国
  const eq = (a, list) => assert.deepEqual([...NB.get(a)].sort(), [...list].sort(), a);
  eq('ad', ['es', 'fr']); eq('mc', ['fr']); eq('li', ['at', 'ch']); eq('lu', ['be', 'de', 'fr']);
  eq('bn', ['my']); eq('tl', ['id']); eq('gm', ['sn']); eq('ls', ['za']); eq('sz', ['mz', 'za']);
});

test('neighbors_island', () => {           // 島国（rpg-core.js の THEMES.island）はとなりの国なし
  const isl = /island: \{ n: '島国', a: '([^']*)'\.split\(' '\) \}/.exec(read('rpg-core.js'))[1].split(' ');
  assert.ok(isl.length > 30);
  for (const a of isl) assert.deepEqual(NB.get(a), [], a);
});

test('neighbors_symmetric', () => {
  for (const [a, list] of NB) for (const b of list) assert.ok(NB.get(b).includes(a), `${a}-${b}`);
});

test('neighbors_fix_applied', () => {
  assert.deepEqual(Object.keys(FIX).sort(), ['add', 'note', 'remove']);
  const pairs = [...FIX.add, ...FIX.remove];
  assert.ok(FIX.add.length > 0);
  for (const [a, b] of FIX.add) { assert.ok(NB.get(a).includes(b) && NB.get(b).includes(a), `add ${a}-${b}`); }
  for (const [a, b] of FIX.remove) { assert.ok(!NB.get(a).includes(b) && !NB.get(b).includes(a), `remove ${a}-${b}`); }
  for (const [a, b] of pairs) assert.ok(typeof FIX.note[`${a}-${b}`] === 'string' && FIX.note[`${a}-${b}`].trim(), `note ${a}-${b}`);
  assert.deepEqual(Object.keys(FIX.note).sort(), pairs.map(([a, b]) => `${a}-${b}`).sort());
  // 直しが無いと地図だけの結果になる（add は地図に無い、remove は地図にある）
  const raw = neighborsOf({ ...INP, NEIGHBORS_FIX: { add: [], remove: [], note: {} } });
  for (const [a, b] of FIX.add) assert.ok(!raw.get(a).includes(b), `add ${a}-${b} は地図に無いはず`);
  for (const [a, b] of FIX.remove) assert.ok(raw.get(a).includes(b), `remove ${a}-${b} は地図にあるはず`);
});

test('neighbors_fix_checked', () => {      // 直しに知らないコード・地図とかさなる直しがあれば check が言う
  const bad = { add: [['fr', 'zz'], ['fr', 'de']], remove: [['jp', 'kr']], note: {} };
  const p = check({ ...INP, NEIGHBORS_FIX: bad });
  assert.ok(p.some(x => x.includes('zz')), p.join('\n'));
  assert.ok(p.some(x => x.includes('fr-de')), p.join('\n'));
  assert.ok(p.some(x => x.includes('jp-kr')), p.join('\n'));
});

// 国のページの読み物: 国旗の意味・となりの国・この国旗が出てくるまとめ・前の国・次の国
const MEANING = new Map(JSON.parse(read('data/flag_meanings.json')).map(m => [m.a, m.t]));
// まとめページ（入口の順）と、そこにリンクがある国
const THEME_IDS_IN_INDEX = [...read('themes/index.html').matchAll(/<a class="ccard" href="([\w-]+)\.html">/g)].map(m => m[1]);
const themeHas = (id, a) => read(`themes/${id}.html`).includes(`href="../country/${a}.html"`);
const prevnext = h => { const m = /<nav class="prevnext"[^>]*>([\s\S]*?)<\/nav>/.exec(h); return m ? m[1] : null; };

test('country_page_meaning', () => {
  const h = read('country/jp.html');
  assert.ok(h.includes('<h2>国旗の意味</h2>'));
  assert.ok(h.includes(MEANING.get('jp').replace(/&/g, '&amp;')));
  for (const c of C) assert.ok(read(`country/${c.a}.html`).includes('<h2>国旗の意味</h2>'), c.a);
  // 並び: 国旗 → 地域など → 国旗の意味 → 豆知識 → となりの国 → 似ている国旗 → まとめ → 遊ぶ → 前後の国
  const fr = read('country/fr.html'), at = s => { const i = fr.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['class="cflag"', 'class="cfacts"', '<h2>国旗の意味</h2>', '<h2>豆知識</h2>', '<h2>となりの国</h2>', '<h2>似ている国旗</h2>',
    '<h2>この国旗が出てくるまとめ</h2>', 'class="cplay"', 'class="prevnext"', '<footer>'].map(at);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  // note（出典のメモ）は出さない
  const frNote = JSON.parse(read('data/flag_meanings.json')).find(m => m.a === 'fr').note;
  assert.ok(frNote.length > 0 && !fr.includes(frNote) && !fr.includes(frNote.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
});

test('country_page_neighbors', () => {
  const fr = read('country/fr.html');
  assert.ok(fr.includes('<h2>となりの国</h2>'));
  const hrefs = hrefsIn(fr, 'ul.neighbors');
  assert.ok(hrefs.includes('de.html'));
  assert.ok(!fr.includes('../country/de.html'));
  assert.ok(fr.includes('<span>ドイツ</span>'));
  assert.deepEqual(hrefs, NB.get('fr').map(b => `${b}.html`));
  assert.ok(fr.includes(`<img src="../flags/de.svg?v=${FLAG_V}" alt=""`));
  const jp = read('country/jp.html');
  assert.ok(jp.includes('陸で接している国はない（島国）'));
  assert.deepEqual(hrefsIn(jp, 'ul.neighbors'), []);
  // 島国でない国で、陸でとなる国が無い（オーストラリア）は「島国」と書かない
  const au = read('country/au.html');
  assert.ok(au.includes('陸で接している国はない') && !au.includes('（島国）'));
});

test('prevnext_edges', () => {           // 同じ6地域の中で五十音順。最初の国に「前」、最後に「次」は無い
  const { REGIONS } = readInputs(ROOT);
  for (const r of REGIONS) {
    const list = C.filter(c => c.r === r).sort(byJa);
    list.forEach((c, i) => {
      const nav = prevnext(read(`country/${c.a}.html`));
      assert.ok(nav != null, c.a);
      const prev = /<a class="prev" href="([a-z]{2})\.html">← ([^<]+)<\/a>/.exec(nav), next = /<a class="next" href="([a-z]{2})\.html">([^<]+) →<\/a>/.exec(nav);
      if (i === 0) assert.equal(prev, null, `${c.a} は ${r} の最初`);
      else assert.deepEqual([prev?.[1], prev?.[2]], [list[i - 1].a, list[i - 1].n], c.a);
      if (i === list.length - 1) assert.equal(next, null, `${c.a} は ${r} の最後`);
      else assert.deepEqual([next?.[1], next?.[2]], [list[i + 1].a, list[i + 1].n], c.a);
    });
  }
});

test('country_page_themes', () => {
  const tr = read('country/tr.html');
  assert.ok(tr.includes('<h2>この国旗が出てくるまとめ</h2>'));
  assert.ok(tr.includes('href="../themes/crescent.html"'));
  assert.ok(tr.includes('href="../themes/stars.html"'));
  // 10か国未満でクイズの無いまとめ（ユニオンジャック）にもリンクする
  for (const a of ['gb', 'au', 'nz', 'fj', 'tv']) assert.ok(hrefsIn(read(`country/${a}.html`), 'ul.cthemes').includes('../themes/unionjack.html'), a);
  assert.ok(read('country/gb.html').includes('<a href="../themes/unionjack.html">ユニオンジャックが入った国旗</a>'));
  assert.equal(THEME_IDS_IN_INDEX.length, 14);
  for (const c of C) {
    const h = read(`country/${c.a}.html`), want = THEME_IDS_IN_INDEX.filter(id => themeHas(id, c.a)).map(id => `../themes/${id}.html`);
    assert.deepEqual(hrefsIn(h, 'ul.cthemes'), want, c.a);
    assert.equal(h.includes('この国旗が出てくるまとめ'), want.length > 0, c.a);
  }
});

test('country_desc_starts_with_meaning', () => {
  for (const c of C) {
    const d = desc(read(`country/${c.a}.html`)), first = MEANING.get(c.a).split('。')[0] + '。';
    assert.ok(d.startsWith(`${c.n}の国旗の意味: ${first}`), c.a);
    assert.ok(d.length <= 120, `${c.a} ${d.length}`);
  }
});

// ---- 英語のページ（en/country/） ----
const enPages = () => ['en/country/index.html', ...C.map(c => `en/country/${c.a}.html`)];
const EN_URL = p => SITE + (p === 'en/country/index.html' ? 'en/country/' : p);
const JA_OF = p => p.slice(3);
const MEANING_EN = new Map(JSON.parse(read('data/en/flag_meanings.json')).map(m => [m.a, m.t]));
const byEn = (x, y) => x.e.localeCompare(y.e, 'en') || (x.a < y.a ? -1 : 1);
// 見える文字（script・style・コメントと、lang="ja" の要素を除く）
const visible = html => html
  .replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(\w+)\b[^>]*\slang="ja"[^>]*>[\s\S]*?<\/\1>/g, '');

test('en_country_head', () => {            // 196枚。lang・title・canonical・description・hreflang（日本語のページと互いに）
  for (const p of enPages()) {
    const h = read(p), url = EN_URL(p), ja = URL_OF(JA_OF(p));
    assert.match(h, /<html lang="en">/, p);
    assert.ok(h.includes(`<link rel="canonical" href="${url}">`), p);
    assert.ok(h.includes(`<meta property="og:url" content="${url}">`), p);
    assert.ok(h.includes('<meta property="og:site_name" content="Flag Master">'), p);
    assert.ok(h.includes('<meta property="og:locale" content="en_US">'), p);
    assert.ok(h.includes(`<meta property="og:image" content="${SITE}icons/ogp-en.png">`), p);
    assert.ok(!h.includes('icons/ogp.png'), p);
    const d = desc(h);
    assert.ok(d.length >= 20 && d.length <= 160, `${p} ${d.length}`);
    const lines = [`<link rel="alternate" hreflang="ja" href="${ja}">`, `<link rel="alternate" hreflang="en" href="${url}">`,
      `<link rel="alternate" hreflang="x-default" href="${ja}">`].join('\n');
    for (const q of [p, JA_OF(p)]) { const x = read(q); assert.ok(x.slice(0, x.indexOf('</head>')).includes(lines), q); }
    const tail = p === 'en/country/index.html' ? '' : p.slice(11);
    assert.ok(h.includes(`<span class="langsw"><a href="../../country/${tail}" hreflang="ja" lang="ja">日本語</a> / <b lang="en">English</b></span>`), p);
    assert.ok(read(JA_OF(p)).includes(`<span class="langsw"><b>日本語</b> / <a href="../en/country/${tail}" hreflang="en" lang="en">English</a></span>`), JA_OF(p));
    assert.equal(ldJson(h).itemListElement.at(-1).item, url, p);
    assert.match(h, /<link rel="stylesheet" href="\.\.\/\.\.\/pages\.css\?v=\d+">/, p);
    assert.ok(!/<script[^>]* src=/.test(h), p);
    for (const u of relLinks(h)) {
      const r = posix.normalize(posix.join(posix.dirname(p), u));
      if (/^en\/(?:howto|about|privacy)/.test(r)) continue;   // これから作る英語のページ
      assert.ok(existsSync(resolveFrom(p, u)), `${p} → ${u}`);
    }
  }
  for (const c of C) {
    const h = read(`en/country/${c.a}.html`);
    assert.equal(unesc(attr(h, /<title>([^<]*)<\/title>/)), `Flag of ${theName(c.e)}: meaning and neighbors | Flag Master`, c.a);
    const first = /^[\s\S]*?[.!?]["”)]?(?=\s+[A-Z"“(]|$)/.exec(MEANING_EN.get(c.a))[0];
    const d = desc(h), head = `Flag of ${theName(c.e)}: ${first}`;
    assert.ok(head.length <= 160 ? d.startsWith(head) : d.endsWith('…') && head.startsWith(d.slice(0, -1)), c.a);
  }
  assert.equal(desc(read('en/country/fr.html')), `Flag of France: ${MEANING_EN.get('fr').split('. ')[0]}. France (Europe): flag, capital, area, and neighbors. Look-alike flags: Netherlands, Luxembourg, Paraguay.`);
});

test('en_country_content', () => {
  const h = read('en/country/fr.html');
  assert.ok(h.includes('<h1>France</h1>'));
  assert.ok(h.includes(`<img src="../../flags/fr.svg?v=${FLAG_V}" alt="Flag of France" width="640" height="480">`));
  assert.ok(h.includes('<dt>Region</dt><dd>Europe</dd>'));
  assert.ok(h.includes('<dt>Capital</dt><dd>Paris</dd>'));
  assert.ok(h.includes('<dt>Area</dt><dd>551,695 km²</dd>'));
  assert.ok(h.includes('<h2>What the flag means</h2>'));
  assert.ok(h.includes(`<p class="meaning">${MEANING_EN.get('fr').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}</p>`));
  assert.ok(h.includes('<h2>Neighboring countries</h2>'));
  const nb = hrefsIn(h, 'ul.neighbors');
  assert.ok(nb.includes('de.html') && h.includes('<span>Germany</span>'));
  assert.deepEqual(nb, NB.get('fr').map(b => byA.get(b)).sort(byEn).map(b => `${b.a}.html`));
  assert.deepEqual(hrefsIn(h, 'ul.similar'), ['nl.html', 'lu.html', 'py.html']);
  assert.ok(h.includes(`<a class="play-region" href="../#play=${encodeURIComponent('西ヨーロッパ')}">Play this region: Western Europe</a>`));
  assert.ok(h.includes('<a href="../">Play Flag Master</a>') && h.includes('<a href="../#book">See it in the Gallery</a>'));
  assert.ok(!h.includes('index.html#'));
  // 並び: 国旗 → 地域など → 意味 → 豆知識 → となり → 似ている → まとめ → 遊ぶ → 前後 → フッター（日本語のページと同じ）
  const at = s => { const i = h.indexOf(s); assert.ok(i >= 0, s); return i; };
  const order = ['class="cflag"', 'class="cfacts"', '<h2>What the flag means</h2>', '<h2>Fun facts</h2>', '<h2>Neighboring countries</h2>', '<h2>Look-alike flags</h2>',
    '<h2>Flag collections with this flag</h2>', 'class="cplay"', 'class="prevnext"', '<footer>'].map(at);
  assert.deepEqual(order, [...order].sort((x, y) => x - y));
  assert.ok(hrefsIn(h, 'ul.cthemes').includes('../themes/vtricolor.html'));
  assert.ok(h.includes('<a href="../themes/vtricolor.html">Vertical tricolor flags</a>'));
  assert.ok(read('en/country/jp.html').includes('<p class="noneighbor">No land borders (island country)</p>'));
  const au = read('en/country/au.html');
  assert.ok(au.includes('<p class="noneighbor">No land borders</p>'));
  assert.ok(au.includes(`href="../#play=${encodeURIComponent('オセアニア')}">Play this region: Oceania</a>`));
  // フッターは en/index.html のもの（../../ を付ける）
  const foot = /<!-- footer:start -->([\s\S]*?)<!-- footer:end -->/;
  const want = foot.exec(read('en/index.html'))[1].trim().replace(/href="(?!https?:|#)([^"]*)"/g, 'href="../../$1"');
  for (const p of enPages()) assert.equal(foot.exec(read(p))?.[1].trim(), want, p);
  // 一覧: 6地域、e の ABC 順
  const idx = read('en/country/index.html');
  assert.deepEqual([...idx.matchAll(/<section><h2>([^<]+)<\/h2>/g)].map(m => unesc(m[1])),
    ['Asia', 'Europe', 'Africa', 'North & Central America', 'South America', 'Oceania']);
  const { REGIONS } = readInputs(ROOT);
  for (const r of REGIONS) {
    const sec = idx.split('<section>')[REGIONS.indexOf(r) + 1];
    assert.deepEqual([...sec.matchAll(/class="ccard" href="([a-z]{2})\.html"/g)].map(m => m[1]), [...C.filter(c => c.r === r).sort(byEn).map(c => c.a)], r);
    assert.ok(sec.includes(`href="../#play=${encodeURIComponent(r)}"`), r);
  }
});

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const TRIVIA_LABEL_EN = { flag: 'Flag', geo: 'Geography', culture: 'Culture' };

test('en_country_trivia', () => {          // 英語のページに Fun facts。英訳のファイルの順で全件、意味のあと・となりの前。日本語の豆知識は出さない
  const h = read('en/country/fr.html');
  const facts = JSON.parse(read('data/en/trivia_facts.json')).filter(x => x.a === 'fr');
  assert.equal(facts.length, 4);
  const want = facts.map(x => `    <li><span class="tv-k">${TRIVIA_LABEL_EN[x.k]}</span>${escHtml(x.t)}</li>`).join('\n');
  assert.ok(h.includes(`  <h2>Fun facts</h2>\n  <ul class="trivia">\n${want}\n  </ul>\n`));
  const i = h.indexOf('<h2>Fun facts</h2>');
  assert.ok(h.indexOf('<h2>What the flag means</h2>') < i && i < h.indexOf('<h2>Neighboring countries</h2>'));
  for (const x of TRIVIA.fr) assert.ok(!h.includes(escHtml(x.t)), x.t);
  for (const c of C) {
    const p = read(`en/country/${c.a}.html`);
    assert.equal(count(p, /<h2>Fun facts<\/h2>/g), 1, c.a);
    assert.equal(count(between(p, '<ul class="trivia">', '</ul>'), /<li>/g), TRIVIA_EN[c.a].length, c.a);
  }
  // title・description は変えない（豆知識の語を足さない）
  assert.equal(attr(h, /<title>([^<]*)<\/title>/), 'Flag of France: meaning and neighbors | Flag Master');
  assert.ok(!/fun facts|trivia/i.test(desc(h)));
});

test('en_country_trivia_escape', () => withTmp(dir => {   // 英語の豆知識に `<b>&"x` → &lt;b&gt;&amp;&quot;x、<b> タグは無い
  copyInputs(dir); setTriviaEn(dir, 'fr', [{ k: 'flag', t: '<b>&"x' }]);
  const h = render(readInputs(dir))['en/country/fr.html'];
  assert.ok(h.includes('<li><span class="tv-k">Flag</span>&lt;b&gt;&amp;&quot;x</li>')); assert.ok(!h.includes('<b>&'));
}));

test('en_country_trivia_missing', () => withTmp(dir => {   // ある国の英語の豆知識が空 → 止まる。何も書かない
  copyInputs(dir); setTriviaEn(dir, 'fr', []);
  const r = spawnSync('node', ['tools/make_country_pages.mjs', '--root', dir, '--out', dir], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, /英語の豆知識が0件: fr/);
  assert.ok(!existsSync(join(dir, 'en/country')));
}));

test('en_prevnext_edges', () => {          // 同じ6地域の中で e の ABC 順。端に前・次は無い
  const { REGIONS } = readInputs(ROOT);
  for (const r of REGIONS) {
    const list = C.filter(c => c.r === r).sort(byEn);
    list.forEach((c, i) => {
      const nav = prevnext(read(`en/country/${c.a}.html`));
      assert.ok(nav != null, c.a);
      const prev = /<a class="prev" href="([a-z]{2})\.html">← ([^<]+)<\/a>/.exec(nav), next = /<a class="next" href="([a-z]{2})\.html">([^<]+) →<\/a>/.exec(nav);
      if (i === 0) assert.equal(prev, null, `${c.a} は ${r} の最初`);
      else assert.deepEqual([prev?.[1], unesc(prev?.[2] ?? '')], [list[i - 1].a, list[i - 1].e], c.a);
      if (i === list.length - 1) assert.equal(next, null, `${c.a} は ${r} の最後`);
      else assert.deepEqual([next?.[1], unesc(next?.[2] ?? '')], [list[i + 1].a, list[i + 1].e], c.a);
    });
  }
});

test('en_country_no_japanese', () => {     // 見える文字に日本語が無い（lang="ja" の切りかえだけ）。head の文字・ld+json も
  for (const p of enPages()) {
    const h = read(p), left = visible(h).match(new RegExp(JA_RE.source, 'gu'));
    assert.equal(left, null, `${p} に日本語: ${left?.join('')}`);
    assert.doesNotMatch(desc(h), JA_RE, p);
    assert.doesNotMatch(JSON.stringify(ldJson(h)), JA_RE, p);
  }
});

test('en_the_name', () => {                // 「Flag of」のあとは the を付ける国がある。h1・一覧は e のまま
  const us = read('en/country/us.html');
  assert.ok(us.includes('<title>Flag of the United States: meaning and neighbors | Flag Master</title>'));
  assert.ok(us.includes('alt="Flag of the United States"') && us.includes('<h1>United States</h1>'));
  assert.ok(desc(us).startsWith('Flag of the United States: '));
  const bs = read('en/country/bs.html');
  assert.ok(bs.includes('<title>Flag of the Bahamas: meaning and neighbors | Flag Master</title>') && bs.includes('<h1>The Bahamas</h1>'));
  assert.equal(theName('The Gambia'), 'the Gambia');
  assert.equal(theName('France'), 'France');
  // 名前に Republic・Islands・United・States のある国は、みな THE_NAMES に入っている。THE_NAMES は e にある名前だけ
  const es = new Set(C.map(c => c.e));
  for (const e of es) if (/Republic|Islands|United|States/.test(e)) assert.ok(THE_NAMES.has(e), e);
  for (const e of THE_NAMES) assert.ok(es.has(e), e);
});
