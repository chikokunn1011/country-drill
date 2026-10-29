// 国ごとのページ（country/*.html）と、それを作る tools/make_country_pages.mjs。
// 作ったページはコミットするので、作り直すと1文字もちがわないことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readInputs, check, render } from '../../tools/make_country_pages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://chikokunn1011.github.io/country-drill/';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const load = (file, name) => { const ctx = { window: {} }; vm.runInNewContext(read(file), ctx); return ctx.window[name]; };
const C = load('countries.js', 'COUNTRIES');
const TRIVIA = load('trivia.js', 'TRIVIA');
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
  for (const f of ['countries.js', 'trivia.js', 'daily-core.js', 'index.html', 'privacy.html', 'sitemap.xml']) cpSync(join(ROOT, f), join(dir, f));
  cpSync(join(ROOT, 'flags'), join(dir, 'flags'), { recursive: true });
};
const edit = (dir, f, fn) => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), 'utf8')));
const setTrivia = (dir, a, list) => edit(dir, 'trivia.js', () => `window.TRIVIA = ${JSON.stringify({ ...TRIVIA, [a]: list })};\n`);
const similarAdd = code => dir => edit(dir, 'daily-core.js', s => s.replace("'qa bh',", `'qa bh ${code}',`));
const triviaEmpty = a => dir => setTrivia(dir, a, []);
const rmFlag = a => dir => rmSync(join(dir, 'flags', `${a}.svg`));
const noFooterMarks = dir => edit(dir, 'index.html', s => s.replace('<!-- footer:start -->', ''));

test('regenerate_same', () => {            // 作り直すと同じ（コミット済みと1文字もちがわない）
  const out = render(readInputs(ROOT));
  assert.equal(Object.keys(out).filter(p => p.startsWith('country/')).length, 196);
  for (const [p, s] of Object.entries(out)) assert.equal(read(p), s, p);
  assert.deepEqual(readdirSync(join(ROOT, 'country')).filter(f => f.endsWith('.html')).sort(),
    Object.keys(out).filter(p => p.startsWith('country/')).map(p => p.slice(8)).sort());
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
    assert.ok(h.includes('<link rel="stylesheet" href="country.css?v=1">'), p);
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
  assert.deepEqual(locs(inside), [SITE + 'country/', ...C.map(c => c.a).sort().map(a => `${SITE}country/${a}.html`)]);
  assert.ok(!inside.includes('<lastmod>'));
  for (const p of ['', 'privacy.html', 'about.html', 'howto.html']) assert.ok(locs(outside(s)).includes(SITE + p), p);
  const i = readInputs(ROOT), once = render(i)['sitemap.xml'];
  assert.equal(render({ ...i, sitemap: once })['sitemap.xml'], once);   // 2回目も同じ
  assert.equal(outside(once), outside(s));                              // 目印の外は変えない
});

test('cli_stops_on_bad_input', () => {      // 一時の root に入力を写し、1つずつこわす。終了コード1・stderr・何も書かない
  for (const [break_, re] of [[similarAdd('zz'), /SIMILAR に知らないコード: zz/], [triviaEmpty('fr'), /豆知識が0件: fr/],
                              [rmFlag('fr'), /flags\/fr\.svg が無い/], [noFooterMarks, /フッターの目印が無い/]])
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
  for (const p of ['country/index.html', 'country/fr.html', 'sitemap.xml']) assert.equal(readFileSync(join(dir, p), 'utf8'), read(p), p);
}));

test('escapes_text', () => withTmp(dir => {   // 豆知識に `<b>&"` → ページには &lt;b&gt;&amp;&quot;、<b> タグは無い
  copyInputs(dir); setTrivia(dir, 'fr', [{ k: 'flag', t: '<b>&"テスト' }]);
  const h = render(readInputs(dir))['country/fr.html'];
  assert.ok(h.includes('&lt;b&gt;&amp;&quot;テスト')); assert.ok(!h.includes('<b>&'));
}));
