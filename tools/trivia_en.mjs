// 豆知識の英訳（PR7）: data/en/trivia_facts.json の置き場所・id・8つのかたまり・訳と確かめのシート・trivia-en.js を作る。
//   ・英訳の行は { "id", "a", "k", "ja", "t" }。並びは data/trivia_facts.json と同じで、かたまりごとに末尾へ足す。
//     id は <a>-<n>（n はその国の項目を上から数えた番号、1から）。ja は日本語の t の写し（日本語を直すとテストが知らせる）
//   ・「豆知識の英訳の決まり」1〜7 の置き場所はこのファイルの RULES_JA（訳す AI・中身を確かめる AI に渡す）と
//     RULES_EN（英語だけを確かめる AI に渡す）。元は PR7 の計画の Global Constraints
//   ・確かめのテストは tests/unit/en-trivia.test.mjs
// 使い方:
//   node tools/trivia_en.mjs sheet <1-8>          かたまり N を訳すシート（id | k | 日本語 | note）を標準出力に
//   node tools/trivia_en.mjs sheet <1-8> faith    中身のずれを見るシート（id | 日本語 | English。note は出さない）
//   node tools/trivia_en.mjs sheet <1-8> en       英語の自然さを見るシート（id | k | English。日本語は出さない）
//   node tools/trivia_en.mjs merge <1-8> <file.json>
//                                                 訳した {id: 英語} を、id・a・k・ja を日本語から埋めて英訳の末尾に足す
//                                                 （かたまり N の id をちょうど全部。前のかたまりが入っていないと止まる）
//   node tools/trivia_en.mjs patch <file.json>    確かめの直し {id: 英語} で、もう入っている行の t だけを置きかえる
//   node tools/trivia_en.mjs build                trivia-en.js を書く（英訳が779件そろっていないと止まる）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOTAL = 779;

// data/trivia_facts.json の添字の範囲（はじめ含む・おわり含まない）。どの境目も国の途中で切れない
export const BATCHES = [[0, 96], [96, 196], [196, 292], [292, 388], [388, 487], [487, 583], [583, 683], [683, 779]];

export const RULES_JA = [
  '日本語の `t` に書いてあることだけを訳す。事実・数・名前・年・理由・形容（「世界で唯一」など）を足さない・落とさない・変えない。`note`（出どころのメモ）は固有名詞のつづりと、何を指すかの確かめにだけ使い、`note` にしか無い中身を英文に入れない。',
  '弱め方を残す: 「〜とされる」「〜と言われる」「説がある」「と考えられる」→ `is said to`・`is considered`・`is believed to`・`reportedly`・`according to` など。日本語が言い切っている所を弱めない。',
  '数はアラビア数字で、日本語と同じ数（`1万` → `10,000`、`約1900m` → `about 1,900 m`）。`約` → `about`／`around`／`roughly`／`nearly`。単位は `km`・`km²`・`m`・`°C`。日本語に無い換算（マイル・フィート）を足さない。',
  '日本とくらべる文（「日本の岐阜県とほぼ同じ広さ」）はそのまま訳す（`about the same size as Gifu Prefecture in Japan`）。英語圏の物に置きかえない。',
  '固有名詞は英語版 Wikipedia の記事名。国名は countries.js の `e`、首都は `ec`。日本語のかぎかっこ「」は `“ ”`、アポストロフィは `’`（まっすぐな `\'` と `"` は使わない）。',
  '1件は1〜2文の平叙文で、`.` で終わる。`?` を使わない（日本語の豆知識に問いは無い）。`quiz`・`guess` を使わない。日本語に「首都」が無いのに `capital` を足さない（首都を問う形を作らない・首都の話を足さない）。',
  '長さは 200 字まで。',
];

export const RULES_EN = [
  'Translate only what the Japanese text says. Do not add, drop, or change facts, numbers, names, years, reasons, or qualifiers (such as “the only one in the world”). The source note is only for checking the spelling of proper names and what the text refers to; nothing that appears only in the note goes into the English.',
  'Keep the hedges: “it is said,” “there is a theory,” and “it is thought” become is said to, is considered, is believed to, reportedly, according to, and so on. Do not hedge what the Japanese states as fact.',
  'Write numbers in Arabic numerals with the same values as the Japanese (10,000; about 1,900 m). “Approximately” becomes about, around, roughly, or nearly. Units are km, km², m, and °C. Do not add conversions (miles, feet) that the Japanese does not have.',
  'Translate comparisons with Japan as they are (about the same size as Gifu Prefecture in Japan). Do not replace them with things from English-speaking countries.',
  'Proper names follow the English Wikipedia article title. Country names follow `e` in countries.js and capitals follow `ec`. Japanese corner quotes become “ ” and apostrophes are ’ (never straight single or double quotes).',
  'Each fact is one or two declarative sentences ending with a period. No question marks (the Japanese facts never ask questions). Never use the words quiz or guess. Do not add the word capital when the Japanese does not mention a capital (no capital questions and no extra capital facts).',
  'At most 200 characters.',
];

const MODES = {
  translate: { head: ['id', 'k', '日本語', 'note'], rules: RULES_JA, title: n => `豆知識の英訳 B${n}（訳す）`, out: '訳した行は `{ "id", "a", "k", "ja", "t" }`（`ja` は日本語の写し、`t` が英訳）にして、data/en/trivia_facts.json の末尾に同じ並びで足す。' },
  faith: { head: ['id', '日本語', 'English'], rules: RULES_JA, title: n => `豆知識の英訳 B${n}（中身のずれの確かめ）`, out: '1件ずつ「OK」か「直す（種類: 足した／落とした／変えた／弱め方／取りちがえ。理由）」を出す。' },
  en: { head: ['id', 'k', 'English'], rules: RULES_EN, title: n => `Fun facts B${n} (English review)`, out: 'For each row, reply OK or give a rewording. Only rephrase; never change the meaning.' },
};

// 数を読む: 全角の数字を半角に、数字のあいだの , を外し、<数>万・<数>億 を1万倍・1億倍した整数の文字に。小数はそのまま
export function numbersOf(s) {
  const z = String(s).replace(/[０-９．，]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/(\d),(?=\d)/g, '$1');
  const out = [];
  for (const m of z.matchAll(/(\d+(?:\.\d+)?)\s*([万億]?)/g)) {
    if (!m[2]) { out.push(m[1]); continue; }
    const [int, frac = ''] = m[1].split('.');
    const zeros = m[2] === '万' ? 4 : 8;
    const digits = (int + frac.padEnd(zeros, '0').slice(0, zeros) + '.' + frac.slice(zeros)).replace(/\.$/, '');
    out.push(digits.replace(/^0+(?=\d)/, ''));
  }
  return out;
}

// 日本語の項目の id（<a>-<n>、国ごとに1から）
export function triviaIds(items) {
  const n = {};
  return items.map(({ a }) => `${a}-${(n[a] = (n[a] || 0) + 1)}`);
}

const cell = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

// かたまり b（1〜8）のシート（Markdown）。頭に決まり1〜7、続けて表
export function sheet(ja, en, b, mode) {
  const m = MODES[mode];
  if (!m) throw new Error(`mode は translate / faith / en: ${mode}`);
  if (!Number.isInteger(b) || b < 1 || b > BATCHES.length) throw new Error(`かたまりは 1〜${BATCHES.length}: ${b}`);
  const [s, e] = BATCHES[b - 1];
  const ids = triviaIds(ja);
  const rows = [];
  for (let i = s; i < e; i++) {
    const j = ja[i], r = en[i];
    if (r && r.id !== ids[i]) throw new Error(`英訳の ${i} 行目の id ${r.id} が ${ids[i]} でない`);
    const t = r ? r.t : '';
    const vals = mode === 'translate' ? [ids[i], j.k, j.t, j.note] : mode === 'faith' ? [ids[i], j.t, t] : [ids[i], j.k, t];
    rows.push('| ' + vals.map(cell).join(' | ') + ' |');
  }
  const isEn = mode === 'en';
  return [
    `# ${m.title(b)}`,
    '',
    isEn ? `Rows ${ids[s]} to ${ids[e - 1]} (${e - s} facts).` : `${ids[s]}〜${ids[e - 1]}（${e - s}件）`,
    '',
    isEn ? '## Rules' : '## 豆知識の英訳の決まり',
    '',
    ...m.rules.map((r, i) => `${i + 1}. ${r}`),
    '',
    m.out,
    '',
    '| ' + m.head.join(' | ') + ' |',
    '|' + m.head.map(() => '---').join('|') + '|',
    ...rows,
    '',
  ].join('\n');
}

// {id: 英語} の形を確かめる
function textMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('{id: 英語} のオブジェクトでない');
  for (const [id, t] of Object.entries(map)) if (typeof t !== 'string' || !t.trim()) throw new Error(`${id} の英語が空か文字列でない`);
  return map;
}

// かたまり n の訳 {id: 英語} を、日本語の並びで en の末尾に足した新しい配列。id の過不足・順番ちがいは止まる
export function mergeBatch(ja, en, n, map) {
  if (!Number.isInteger(n) || n < 1 || n > BATCHES.length) throw new Error(`かたまりは 1〜${BATCHES.length}: ${n}`);
  textMap(map);
  const [s, e] = BATCHES[n - 1];
  if (en.length !== s) throw new Error(`英訳は ${en.length} 件。B${n} を足せるのは ${s} 件（B${n - 1} まで）のとき`);
  const ids = triviaIds(ja);
  const want = ids.slice(s, e), wantSet = new Set(want);
  const missing = want.filter(id => !(id in map)), extra = Object.keys(map).filter(id => !wantSet.has(id));
  if (missing.length || extra.length) throw new Error(`B${n} の id が合わない。足りない: ${missing.join(' ') || 'なし'}／余分: ${extra.join(' ') || 'なし'}`);
  return [...en, ...want.map((id, x) => { const j = ja[s + x]; return { id, a: j.a, k: j.k, ja: j.t, t: map[id] }; })];
}

// 確かめの直し {id: 英語} で、もう入っている行の t だけを置きかえた新しい配列。無い id は止まる
export function patchEn(en, map) {
  textMap(map);
  if (!Object.keys(map).length) throw new Error('直しが空');
  const at = new Map(en.map((r, i) => [r.id, i]));
  const unknown = Object.keys(map).filter(id => !at.has(id));
  if (unknown.length) throw new Error(`英訳にまだ無い id: ${unknown.join(' ')}`);
  return en.map(r => (r.id in map ? { ...r, t: map[r.id] } : r));
}

const readJson = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const HEAD = '// 豆知識の英訳。tools/trivia_en.mjs build が data/en/trivia_facts.json から作る。手で書きかえない';

// trivia-en.js の全文（trivia.js と同じ書き方）。英訳が779件でない・並び・id・a・k・ja が日本語と合わないときは止まる
export function buildTriviaEn(en) {
  const ja = readJson('data/trivia_facts.json');
  if (!Array.isArray(en) || en.length !== TOTAL || ja.length !== TOTAL) throw new Error(`英訳は${TOTAL}件そろっていない（${Array.isArray(en) ? en.length : '配列でない'}件）`);
  const ids = triviaIds(ja);
  const groups = {};
  en.forEach((r, i) => {
    const j = ja[i];
    if (!r || r.id !== ids[i] || r.a !== j.a || r.k !== j.k) throw new Error(`${i} 行目の id・a・k が日本語（${ids[i]}）と合わない`);
    if (r.ja !== j.t) throw new Error(`${r.id} の ja が日本語の t と合わない`);
    if (typeof r.t !== 'string' || !r.t.trim()) throw new Error(`${r.id} の t が空`);
    (groups[r.a] ??= []).push({ k: r.k, t: r.t });
  });
  const lines = [HEAD, 'window.TRIVIA = {'];
  for (const a of Object.keys(groups).sort()) lines.push(JSON.stringify(a) + ':' + JSON.stringify(groups[a]) + ',');
  lines.push('};');
  return lines.join('\n') + '\n';
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [cmd, n, mode = 'translate'] = process.argv.slice(2);
  try {
    if (cmd === 'sheet') {
      process.stdout.write(sheet(readJson('data/trivia_facts.json'), readJson('data/en/trivia_facts.json'), Number(n), mode));
    } else if (cmd === 'merge' || cmd === 'patch') {
      const file = process.argv[cmd === 'merge' ? 4 : 3];
      if (!file) throw new Error(`usage: node tools/trivia_en.mjs ${cmd === 'merge' ? 'merge <1-8>' : 'patch'} <file.json>`);
      const map = JSON.parse(readFileSync(resolve(file), 'utf8'));
      const en = readJson('data/en/trivia_facts.json');
      const out = cmd === 'merge' ? mergeBatch(readJson('data/trivia_facts.json'), en, Number(n), map) : patchEn(en, map);
      writeFileSync(join(ROOT, 'data/en/trivia_facts.json'), JSON.stringify(out, null, 2) + '\n');
      console.log(`${cmd}: ${cmd === 'merge' ? out.length - en.length + ' rows added' : Object.keys(map).length + ' rows patched'}, ${out.length} in total`);
    } else if (cmd === 'build') {
      const en = readJson('data/en/trivia_facts.json');
      writeFileSync(join(ROOT, 'trivia-en.js'), buildTriviaEn(en));
      console.log(`wrote trivia-en.js: ${new Set(en.map(r => r.a)).size} countries, ${en.length} facts`);
    } else {
      console.error('usage: node tools/trivia_en.mjs sheet <1-8> [faith|en] | merge <1-8> <file.json> | patch <file.json> | build');
      process.exit(2);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
