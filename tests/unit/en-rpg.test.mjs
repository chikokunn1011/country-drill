// 英語版（PR8）: 冒険の語（全部の辞書）・en-rpg*.js の文字の形・冒険の名前の Title Case・確かめのシート（tools/dict_sheet.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { JA_RE } from '../../tools/i18n_scan.mjs';
import { GLOSSARY, GLOSSARY_NO, GLOSSARY_OK, RULES_EN, dictSheet } from '../../tools/dict_sheet.mjs';
import { loadCore } from './rpg_load.mjs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const DICT_FILES = readdirSync(new URL('../../i18n/', import.meta.url)).filter(f => /^en-[\w-]+\.js$/.test(f)).sort();

// 辞書1つを vm で読む（ほかの辞書と混ぜない）
function loadDict(f) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('i18n/' + f), ctx, { filename: f });
  return ctx.window.I18N_EN ?? {};
}
const DICTS = DICT_FILES.map(f => [f, loadDict(f)]);
// 値の文字（{ one, other } は両方）
const valsOf = v => typeof v === 'string' ? [v] : [v.one, v.other];

test('rpg_glossary', () => {
  const rows = GLOSSARY.filter(g => g.en).sort((a, b) => b.ja.length - a.ja.length);
  const bad = [];
  for (const [f, dict] of DICTS) for (const [k, v] of Object.entries(dict)) {
    if (Object.hasOwn(GLOSSARY_OK, k)) continue;
    for (const g of rows) if (k.includes(g.ja)) for (const en of valsOf(v)) {
      if (!g.en.test(en)) bad.push(`${f}: ${k} → ${en}（${g.ja} は ${g.en}）`);
      if (g.not && g.not.test(en)) bad.push(`${f}: ${k} → ${en}（${g.ja} に ${g.not} は使わない）`);
    }
  }
  assert.deepEqual(bad, []);
});

test('rpg_glossary_no', () => {
  const bad = [];
  for (const [f, dict] of DICTS) for (const [k, v] of Object.entries(dict)) for (const en of valsOf(v))
    for (const re of GLOSSARY_NO) if (re.test(en)) bad.push(`${f}: ${k} → ${en}（${re}）`);
  assert.deepEqual(bad, []);
});

test('rpg_dict_typography', () => {
  const bad = [];
  for (const [f, dict] of DICTS.filter(([f]) => /^en-rpg[\w-]*\.js$/.test(f))) for (const [k, v] of Object.entries(dict)) for (const en of valsOf(v)) {
    if (/['"]/.test(en)) bad.push(`${f}: ${k} → ${en}（まっすぐな ' " は ’ “ ” に）`);
    if (en.includes('...')) bad.push(`${f}: ${k} → ${en}（... は …）`);
    if (en !== en.trim()) bad.push(`${f}: ${k} → ${en}（前後の空白）`);
    if (/ {2}/.test(en)) bad.push(`${f}: ${k} → ${en}（2つ続く空白）`);
  }
  assert.deepEqual(bad, []);
});

// 英語のページと同じ辞書（en-html.js はブラウザが読まないので外す）
function enDict() {
  const ctx = { console, document: { documentElement: { lang: 'en' } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx);
  for (const f of DICT_FILES.filter(f => f !== 'en-html.js')) vm.runInContext(read('i18n/' + f), ctx, { filename: f });
  return { dict: ctx.I18N_EN, T: ctx.T };
}
const SMALL = new Set(['of', 'the', 'and', 'in', 'on']);
const titleCase = s => s.split(/\s+/).every((w, i) => !/^\p{L}/u.test(w) || (i > 0 && SMALL.has(w)) || /^\p{Lu}/u.test(w));

test('rpg_names_title_case', () => {
  const K = loadCore();
  const { dict, T } = enDict();
  // 日本語の名前 → 英語（まだ英語が無ければ null）。ダンジョンは表示のキー（key。月 → 天体の月）があればそれ。
  // 鏡の手下（{ nk: '鏡の{name}', nb: 元の名前 }）は英語どうしを組み立てたもの（T(nk, { name: T(nb) })）を見る
  const names = new Map();
  const plainName = ja => Object.hasOwn(dict, ja) ? T(ja) : null;
  for (const d of K.DUNGEONS) names.set(d.key ?? d.name, plainName(d.key ?? d.name));
  for (const m of Object.values(K.MONSTERS).flat()) names.set(m.n,
    m.nk ? (Object.hasOwn(dict, m.nk) && Object.hasOwn(dict, m.nb) ? T(m.nk, { name: T(m.nb) }) : null) : plainName(m.n));
  for (const c of K.CHAPTERS) names.set(c.name, plainName(c.name));
  for (const ja of [K.TOWER.name, K.TOWER_MONSTERS.boss.n]) names.set(ja, plainName(ja));
  const bad = [], byEn = new Map();
  // 重なりは、ちがう日本語の名前どうしだけ見る（同じ日本語は Map で1つ）
  for (const [ja, en] of names) {
    if (en === null) continue;   // 英語がまだ無い名前は見ない（Task 3 から入る）
    if (Object.hasOwn(dict, ja) && typeof dict[ja] !== 'string') bad.push(`${ja}: 名前に { one, other } は使わない`);
    if (!titleCase(en)) bad.push(`Title Case でない: ${ja} → ${en}`);
    if ([...en].length > 28) bad.push(`28字より長い: ${ja} → ${en}（${[...en].length}）`);
    if (byEn.has(en)) bad.push(`重なり: ${byEn.get(en)} と ${ja} → ${en}`);
    byEn.set(en, ja);
  }
  assert.deepEqual(bad, []);
});

test('dict_sheet_modes', () => {
  const faith = dictSheet('en-badges', 'faith');
  assert.match(faith, /\| 旅人のレベルが Lv \{g\} \| Reach Traveler level \{g\} \|/);
  assert.match(faith, /# \| 日本語 \| English/);
  const tr = dictSheet('en-badges', 'translate');
  assert.match(tr, /# \| 日本語 \| いまの英語/);
  assert.match(tr, /旅人のレベルが Lv \{g\}/);
  const en = dictSheet('en-badges', 'en');
  assert.doesNotMatch(en, JA_RE);
  assert.match(en, /\| Reach Traveler level \{g\} \|/);
  assert.match(en, /# \| English/);
  // grep: 旅人をふくむキーの行だけ
  const g = dictSheet('en-badges', 'faith', { grep: /旅人/ });
  const rows = g.split('\n').filter(l => /^\| \d+ \|/.test(l));
  assert.ok(rows.length > 0);
  for (const r of rows) assert.match(r.split(' | ')[1], /旅人/);
  assert.ok(rows.length < faith.split('\n').filter(l => /^\| \d+ \|/.test(l)).length);
  // 決まりと語の一覧が頭にある
  assert.match(faith, /Tower of Heroes/);
  for (const r of RULES_EN) assert.ok(en.includes(r), r);
  for (const g of GLOSSARY) assert.ok(en.includes(`- ${g.term}`), g.term);
});

// 月（天体）は曜日の「月」（en-daily の Mon）と同じキーなので、表示は key（天体の月）を通す。どの名前・land も曜日にならない
test('rpg_names_not_weekday', () => {
  const K = loadCore();
  const { dict, T } = enDict();
  const WEEK = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  const bad = [];
  for (const d of [...K.DUNGEONS, K.TOWER]) for (const ja of [d.key ?? d.name, d.key ?? d.land]) {
    if (!Object.hasOwn(dict, ja)) bad.push(`辞書に無い: ${ja}`);
    else if (WEEK.has(T(ja))) bad.push(`${ja} → ${T(ja)}`);
  }
  assert.deepEqual(bad, []);
  assert.equal(T(K.dungeonOf('moon').key), 'Moon');
});
