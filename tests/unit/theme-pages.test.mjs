// まとめページ（themes/*.html）と themes.js、それを作る tools/make_theme_pages.mjs。
// 作ったファイルはコミットするので、作り直すと1文字もちがわないことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readThemeInputs, renderThemes, THEME_IDS, THEME_REP } from '../../tools/make_theme_pages.mjs';
import { KANA, yomi } from '../../tools/make_country_pages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://chikokunn1011.github.io/country-drill/';
const read = p => readFileSync(join(ROOT, p), 'utf8');
const load = (file, name) => { const ctx = { window: {} }; vm.runInNewContext(read(file), ctx); return JSON.parse(JSON.stringify(ctx.window[name])); };
const C = load('countries.js', 'COUNTRIES');
const byA = new Map(C.map(c => [c.a, c]));
const SIMILAR = (() => { const ctx = {}; vm.runInNewContext(read('daily-core.js'), ctx); return JSON.parse(JSON.stringify(ctx.DAILY_CORE.SIMILAR)); })();
const F = JSON.parse(read('data/flag_features.json'));
const TIPS = JSON.parse(read('data/similar_tips.json'));
const TITLES = {
  stars: '星がある国旗', cross: '十字がある国旗', crescent: '三日月がある国旗', sun: '太陽がある国旗', animal: '動物・鳥がいる国旗',
  unionjack: 'ユニオンジャックが入った国旗', vtricolor: 'たて3色の国旗', htricolor: 'よこ3色の国旗', redwhite: '赤と白だけの国旗',
  similar: '似ている国旗の見分け方', island: '島国の一覧', landlocked: '内陸国の一覧', bigarea: '面積が大きい国ランキング', smallarea: '面積が小さい国ランキング',
};
const fmt = n => n.toLocaleString('en-US');
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const pages = () => ['themes/index.html', ...THEME_IDS.map(id => `themes/${id}.html`)];
const themesData = () => load('themes.js', 'THEMES_DATA');
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); assert.ok(i >= 0 && j > i, `${a}〜${b} が無い`); return s.slice(i + a.length, j); };
const locs = s => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
// 国のリストの数（テーマに当たる国）
const themeCodes = id => {
  if (F.rules[id]) return C.filter(c => F.flags[c.a].includes(id)).map(c => c.a);
  return null;
};

test('theme_pages_current', () => {            // 作り直すと同じ
  const files = renderThemes(readThemeInputs(ROOT));
  assert.deepEqual(Object.keys(files).sort(), [...pages(), 'sitemap.xml', 'themes.js'].sort());
  for (const [p, s] of Object.entries(files)) assert.equal(s, read(p), p);
});

test('theme_pages_list', () => {               // 14枚＋入口、題と canonical
  assert.deepEqual(THEME_IDS, Object.keys(TITLES));
  for (const id of THEME_IDS) {
    const h = read(`themes/${id}.html`);
    assert.ok(h.includes(`<title>${TITLES[id]}｜国旗マスター</title>`), id);
    assert.ok(h.includes(`<h1>${TITLES[id]}</h1>`), id);
    assert.ok(h.includes(`<link rel="canonical" href="${SITE}themes/${id}.html">`), id);
  }
  const idx = read('themes/index.html');
  assert.ok(idx.includes(`<link rel="canonical" href="${SITE}themes/">`));
  for (const id of THEME_IDS) assert.ok(idx.includes(`href="${id}.html"`), `入口に ${id}`);
});

test('theme_page_head', () => {               // description は120字以内、相対リンクの先がある
  for (const p of pages()) {
    const h = read(p), d = unesc(/<meta name="description" content="([^"]*)">/.exec(h)?.[1] ?? '');
    assert.ok(d.length >= 20 && d.length <= 120, `${p} の description ${d.length}字`);
    assert.match(h, /<link rel="stylesheet" href="themes\.css\?v=1">/, p);
    for (const m of h.matchAll(/(?:href|src)="([^"]*)"/g)) {
      const u = m[1];
      if (/^(?:[a-z]+:|#|\/\/)/.test(u)) continue;
      const r = posix.normalize(posix.join(posix.dirname(p), u.split('#')[0].split('?')[0]));
      assert.ok(existsSync(join(ROOT, r.endsWith('/') ? r + 'index.html' : r)), `${p}: ${u}`);
    }
  }
});

test('theme_page_content', () => {
  const s = read('themes/stars.html');
  const stars = themeCodes('stars');
  assert.ok(stars.length >= 10);
  for (const a of stars) {
    assert.ok(s.includes(`href="../country/${a}.html"`), `stars に ${a} のリンク`);
    assert.ok(s.includes(byA.get(a).n), `stars に ${byA.get(a).n}`);
  }
  assert.equal((s.match(/href="\.\.\/country\/[a-z]{2}\.html"/g) ?? []).length, stars.length, 'stars の国の数');
  assert.ok(s.includes(F.rules.stars), '決まりの文');
  assert.ok(s.includes('href="../index.html#theme=stars"'));

  const big = read('themes/bigarea.html');
  const rows = [...between(big, '<tbody>', '</tbody>').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  assert.equal(rows.length, 20);
  assert.ok(rows[0].includes('href="../country/ru.html"'), '1位はロシア');
  assert.ok(rows[0].includes(`${fmt(byA.get('ru').ar)} km²`), '面積の形');
  assert.ok(rows[0].includes('17,098,242 km²'));
  const small = read('themes/smallarea.html');
  const srows = [...between(small, '<tbody>', '</tbody>').matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  assert.equal(srows.length, 20);
  const smallest = [...C].sort((x, y) => x.ar - y.ar)[0];
  assert.ok(srows[0].includes(`href="../country/${smallest.a}.html"`), `小さい1位は ${smallest.a}`);

  const sim = read('themes/similar.html');
  assert.equal(TIPS.length, SIMILAR.length);
  assert.equal((sim.match(/<section class="sgroup">/g) ?? []).length, SIMILAR.length, '25グループ');
  for (const tip of TIPS) assert.ok(sim.includes(tip.t.replace(/&/g, '&amp;')), `見分け方: ${tip.g.join(' ')}`);
  for (const a of new Set(SIMILAR.flat())) assert.ok(sim.includes(`href="../country/${a}.html"`), `similar に ${a}`);
});

test('theme_quiz_min10', () => {               // 10か国未満のテーマはボタンも themes.js も無し
  const data = themesData();
  for (const id of THEME_IDS) {
    const h = read(`themes/${id}.html`), codes = data[id]?.a;
    const n = themeCodes(id)?.length;
    if (n != null && n < 10) {
      assert.ok(!h.includes('#theme='), `${id} にクイズ`);
      assert.ok(!(id in data), `themes.js に ${id}`);
    } else {
      assert.ok(id in data, `themes.js に ${id} が無い`);
      assert.equal(data[id].n, TITLES[id]);
      assert.ok(codes.length >= 10, id);
      assert.deepEqual(codes, C.map(c => c.a).filter(a => codes.includes(a)), `${id} は countries.js の並び`);
      assert.ok(h.includes(`href="../index.html#theme=${id}"`), id);
    }
  }
  assert.ok(!('unionjack' in data), 'unionjack は5か国');
  for (const k of Object.keys(F.rules)) if (k in data) assert.deepEqual(data[k].a, themeCodes(k), k);
  assert.equal(data.bigarea.a.length, 20);
});

test('theme_no_capital', () => {
  for (const p of [...pages(), 'themes.js']) assert.ok(!read(p).includes('首都'), p);
});

test('themes_css_no_color_vars', () => assert.ok(!/--[\w-]+\s*:/.test(read('themes/themes.css'))));

test('sitemap_has_themes', () => {
  const s = read('sitemap.xml'), inside = locs(between(s, '<!-- theme:start -->', '<!-- theme:end -->'));
  assert.equal(inside.length, 15);
  assert.deepEqual(inside, [`${SITE}themes/`, ...THEME_IDS.map(id => `${SITE}themes/${id}.html`)]);
  const i = readThemeInputs(ROOT), once = renderThemes(i)['sitemap.xml'];
  assert.equal(renderThemes({ ...i, sitemap: once })['sitemap.xml'], once);   // 2回目も同じ
});

test('island_landlocked_from_rpg_core', () => {   // rpg-core.js の一覧を文字で読む。見つからなければ止まる
  const i = readThemeInputs(ROOT);
  const src = read('rpg-core.js');
  const isl = /island: \{ n: '島国', a: '([^']*)'\.split\(' '\) \}/.exec(src)[1].split(' ');
  assert.deepEqual([...i.ISLAND].sort(), [...isl].sort());
  assert.ok(i.LANDLOCKED.includes('ch') && i.LANDLOCKED.includes('mn'));
  assert.equal(themesData().island.a.length, isl.length);
});

test('stops_without_rpg_lists', async () => {   // rpg-core.js に島国・内陸国の一覧が無ければ投げる
  const { mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'themes-'));
  try {
    for (const f of ['countries.js', 'trivia.js', 'daily-core.js', 'index.html', 'privacy.html', 'sitemap.xml', 'rpg-core.js', 'world.js']) cpSync(join(ROOT, f), join(dir, f));
    mkdirSync(join(dir, 'data'));
    for (const f of ['flag_features.json', 'similar_tips.json', 'neighbors_fix.json', 'flag_meanings.json']) cpSync(join(ROOT, 'data', f), join(dir, 'data', f));
    assert.doesNotThrow(() => readThemeInputs(dir));
    writeFileSync(join(dir, 'rpg-core.js'), read('rpg-core.js').replace("island: { n: '島国'", "island: { n: 'しま'"));
    assert.throws(() => readThemeInputs(dir), /島国/);
    writeFileSync(join(dir, 'rpg-core.js'), read('rpg-core.js').replace("landlocked: { n: '内陸国'", "landlocked: { n: 'x'"));
    assert.throws(() => readThemeInputs(dir), /内陸国/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('kanji_names_by_reading', () => {        // 漢字の国名も読みの五十音順に並ぶ（カタカナの国名のあとにまとめて出ない）
  const kanji = C.filter(c => /[一-鿿]/.test(c.n)).map(c => c.a).sort();
  assert.deepEqual(Object.keys(KANA).sort(), kanji, 'KANA は漢字の国名の全部');
  for (const r of Object.values(KANA)) assert.match(r, /^[ァ-ヶー]+$/, r);
  const order = h => [...h.matchAll(/<a class="ccard" href="\.\.\/country\/([a-z]{2})\.html">/g)].map(m => m[1]);
  const sun = order(read('themes/sun.html'));
  const at = a => { const i = sun.indexOf(a); assert.ok(i >= 0, a); return i; };
  assert.ok(at('na') < at('ne') && at('ne') < at('jp') && at('jp') < at('np'), 'ナミビア < ニジェール < 日本（ニホン） < ネパール');
  for (const id of THEME_IDS.filter(id => !/area$|^similar$/.test(id))) {
    const list = order(read(`themes/${id}.html`)).map(a => byA.get(a));
    const lastKatakana = list.findLastIndex(c => !/[一-鿿]/.test(c.n));
    const firstKanji = list.findIndex(c => /[一-鿿]/.test(c.n) && yomi(c) < (list[lastKatakana]?.n ?? ''));
    for (let i = 1; i < list.length; i++) assert.ok(yomi(list[i - 1]).localeCompare(yomi(list[i]), 'ja') <= 0, `${id}: ${list[i - 1].n} → ${list[i].n}`);
    if (firstKanji >= 0) assert.ok(firstKanji < lastKatakana, `${id}: 漢字の国名がカタカナのあとにまとまっている`);
  }
});

test('theme_index_rep_flags', () => {        // 入口のカードの国旗は、手で選んだ代表の国（そのテーマの国）
  const data = themesData(), idx = read('themes/index.html');
  assert.deepEqual(Object.keys(THEME_REP), THEME_IDS);
  for (const id of THEME_IDS) {
    const rep = THEME_REP[id];
    const members = data[id]?.a ?? themeCodes(id);
    assert.ok(members.includes(rep), `${id} の代表 ${rep}`);
    assert.match(idx, new RegExp(`<a class="ccard" href="${id}\\.html"><img src="\\.\\./flags/${rep}\\.svg\\?`), id);
  }
  assert.ok(read('themes/similar.html').includes('<h2>インドネシア、モナコ、ポーランド、シンガポール</h2>'), '見出しは「、」でつなぐ');
  assert.ok(read('themes/landlocked.html').includes('カスピ海は湖として数えています。'));
});
