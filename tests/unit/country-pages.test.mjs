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
import { readInputs, check, render, neighborsOf, byJa } from '../../tools/make_country_pages.mjs';

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
  for (const f of ['countries.js', 'trivia.js', 'daily-core.js', 'index.html', 'privacy.html', 'sitemap.xml', 'world.js']) cpSync(join(ROOT, f), join(dir, f));
  for (const d of ['flags', 'themes']) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });
  for (const f of ['neighbors_fix.json', 'flag_meanings.json']) cpSync(join(ROOT, 'data', f), join(dir, 'data', f));
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
  assert.ok(!fr.includes('note'));
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
