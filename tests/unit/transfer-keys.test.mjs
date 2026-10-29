// 引き継ぎで預けるキーの一覧（profile.js の TRANSFER_KEYS）と預けないキーの一覧（LOCAL_KEYS）が、
// コードの中で読み書きしている localStorage のキーを全部ふくんでいるかを確かめる（キーを足したのに一覧に入れ忘れるのを防ぐ）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');
// profile.js の `const NAME = [ ... ];` の中の文字列（profile.js はブラウザ用なので、import せず文字で読む）
const list = name => {
  const m = read('profile.js').match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  assert.ok(m, `profile.js に const ${name} = [...] がない`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
// コードの中のキー: store.get/set('x'・localStorage.getItem('x'・setItem('x'・removeItem('x'・const KEY = 'x'
// （badges.js は storage.getItem('badges') の形なので getItem も拾う）
const PATTERNS = [/store\.(?:get|set)\(\s*'([^']+)'/g, /\b(?:getItem|setItem|removeItem)\(\s*'([^']+)'/g, /\bconst KEY = '([^']+)'/g];
const usedKeys = () => {
  const files = [...readdirSync(ROOT).filter(f => f.endsWith('.js')), 'index.html'];
  const out = new Map();   // キー → 見つけたファイル
  for (const f of files) {
    const s = read(f);
    for (const re of PATTERNS) for (const m of s.matchAll(re)) if (!out.has(m[1])) out.set(m[1], f);
  }
  return out;
};

test('transfer_keys_lists', () => {
  // Global Constraints の2つの一覧
  assert.deepEqual([...list('TRANSFER_KEYS')].sort(), ['badges', 'bdgcat', 'bview', 'daily', 'misses', 'nickname', 'rpg', 'settings', 'setup', 'streak', 'dojo'].sort());
  for (const k of ['profile', 'profilePending', 'rpgRank', 'rpgRankPending', 'rpgRankDel', 'rpgSent', 'rpgUnreg', 'transferBackup', 'transferPending', 'badges-broken'])
    assert.ok(list('LOCAL_KEYS').includes(k), `LOCAL_KEYS に ${k} がない`);
  const both = list('TRANSFER_KEYS').filter(k => list('LOCAL_KEYS').includes(k));
  assert.deepEqual(both, [], '両方の一覧に入っているキー');
});

test('transfer_keys_cover_code', () => {
  const known = new Set([...list('TRANSFER_KEYS'), ...list('LOCAL_KEYS')]);
  const used = usedKeys();
  // 集め方がこわれて何も拾えていないのに通る、を防ぐ
  for (const k of ['settings', 'badges', 'rpg', 'daily', 'bdgcat', 'rpgRank']) assert.ok(used.has(k), `コードから ${k} を拾えていない`);
  const missing = [...used].filter(([k]) => !known.has(k)).map(([k, f]) => `${k}（${f}）`);
  assert.deepEqual(missing, [], 'TRANSFER_KEYS にも LOCAL_KEYS にも入っていないキー');
});
