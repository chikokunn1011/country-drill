// 英語版（PR7）: バッジの名前・称号・条件の英語（i18n/en-badges.js ほか）。badges.js のコアを英語の i18n.js と辞書と一緒に vm で読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { JA_RE } from '../../tools/i18n_scan.mjs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// 英語のページと同じ: i18n.js（lang="en"）→ 辞書全部（en-html.js はブラウザが読まないので外す）→ countries.js → badges.js（コアだけ動く）
function enCtx() {
  const warns = [];
  const ctx = { console: { warn: m => warns.push(m), error: () => {} }, document: { documentElement: { lang: 'en' } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx);
  for (const f of readdirSync(new URL('../../i18n/', import.meta.url)).filter(f => /^en-[\w-]+\.js$/.test(f) && f !== 'en-html.js').sort())
    vm.runInContext(read('i18n/' + f), ctx, { filename: f });
  vm.runInContext(read('countries.js'), ctx);
  vm.runInContext(read('badges.js'), ctx);
  const K = ctx.BADGES_CORE;
  return { ctx, K, cat: K.makeCatalog(ctx.COUNTRIES), warns };
}

const has = (dict, k) => Object.hasOwn(dict, k);

test('badges_en_titles', () => {
  const { ctx, K, cat, warns } = enCtx();
  const T = ctx.T, dict = ctx.I18N_EN;
  // 称号: 全部に英語・24字まで・日本語なし・ちがう日本語に同じ英語を使わない
  const titles = [...new Set(K.titlesOf(cat))];
  const bad = [], byEn = new Map();
  for (const ja of titles) {
    if (!has(dict, ja) || typeof dict[ja] !== 'string') { bad.push(`辞書に無い: ${ja}`); continue; }
    const en = T(ja);
    if (JA_RE.test(en)) bad.push(`日本語: ${ja} → ${en}`);
    if ([...en].length > 24) bad.push(`24字より長い: ${ja} → ${en}（${[...en].length}）`);
    if (byEn.has(en) && byEn.get(en) !== ja) bad.push(`重なり: ${byEn.get(en)} と ${ja} → ${en}`);
    byEn.set(en, ja);
  }
  // 名前: 全部に英語・日本語なし。名前どうし・名前と称号で、ちがう日本語に同じ英語を使わない（同じ日本語なら同じ英語）
  for (const b of cat) {
    for (const k of ['name', 'sub', 'hint']) if (b[k] !== undefined) {
      if (!has(dict, b[k])) { bad.push(`辞書に無い: ${b[k]}`); continue; }
      if (JA_RE.test(T(b[k]))) bad.push(`日本語: ${b[k]}`);
    }
    const en = T(b.name);
    if (byEn.has(en) && byEn.get(en) !== b.name) bad.push(`重なり: ${byEn.get(en)} と ${b.name} → ${en}`);
    byEn.set(en, b.name);
  }
  // 条件: 全部の段の descOf が英語で、{ が残らない。地域・モードの名前も英語に
  for (const b of cat) for (const t of b.tiers) {
    const desc = T(t.dk, K.descVars(t.dv, T));
    if (!has(dict, t.dk)) bad.push(`辞書に無い: ${t.dk}`);
    if (JA_RE.test(desc) || /[{}]/.test(desc)) bad.push(`${b.id}: ${desc}`);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(warns, []);
  // 見本: 数・地域・モード・秒
  const desc = (id, i) => { const t = cat.find(b => b.id === id).tiers[i]; return T(t.dk, K.descVars(t.dv, T)); };
  assert.match(desc('answers', 1), /1,000/);
  assert.match(desc('reg-asia', 0), /Asia/);
  assert.match(desc('reg-world', 1), /World/);
  assert.match(desc('mode-m2f', 0), /Location → Flag/);
  assert.match(desc('ta-speed', 2), /1\.4s/);
  assert.equal(T('ドリルの新人'), 'Drill Rookie');
});

// descVars は地域とモードの名前だけを訳す（数はそのまま）。日本語のページでは今の desc と同じ文
test('desc_vars_ja_same', () => {
  const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('i18n.js'), ctx);
  vm.runInContext(read('countries.js'), ctx);
  vm.runInContext(read('badges.js'), ctx);
  const K = ctx.BADGES_CORE, cat = K.makeCatalog(ctx.COUNTRIES);
  for (const b of cat) for (const t of b.tiers) assert.equal(ctx.T(t.dk, K.descVars(t.dv, ctx.T)), t.desc, b.id);
  const tr = s => `<${s}>`;
  assert.deepEqual({ ...K.descVars({ g: '5' }, tr) }, { g: '5' });
  assert.deepEqual({ ...K.descVars({ region: 'アジア' }, tr) }, { region: '<アジア>' });
  assert.deepEqual({ ...K.descVars({ sub: '国旗→国名', g: '30' }, tr) }, { sub: '<国旗→国名>', g: '30' });
});

// 詳細の「◯◯のバッジ」（badges.js の後半の catBadgeOf）は、分類（CAT_LABEL）を全部持つ（無い分類は空の行になるので）
test('cat_badge_keys', () => {
  const { K } = enCtx();
  const src = read('badges.js'), m = src.match(/const catBadgeOf = c => \(\{([\s\S]*?)\}\)\[c\]/);
  assert.ok(m, 'catBadgeOf が見つからない');
  const keys = [...m[1].matchAll(/(\w+): T\(/g)].map(x => x[1]);
  assert.deepEqual(keys.sort(), Object.keys(K.CAT_LABEL).sort());
});
