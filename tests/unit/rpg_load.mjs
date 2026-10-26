// 国旗クエスト（RPG）の単体テストの共通部品。*.test.mjs ではないので単独では走らない
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const T0 = '2026-10-26';
export const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
// vm 側で作られたオブジェクトは prototype が別物なので、比べる前にこちら側の素のオブジェクトにする
export const plain = x => JSON.parse(JSON.stringify(x));

// 新しい vm に countries.js → rpg-core.js を読み込む。before は countries.js を走らせた直後のグローバルの名前
export function loadCtx() {
  const ctx = vm.createContext({ TextEncoder, TextDecoder, btoa, atob }); ctx.window = ctx;
  vm.runInContext(read('countries.js'), ctx);
  const before = Object.keys(ctx);
  vm.runInContext(read('rpg-core.js'), ctx);
  return { ctx, before };
}
export const loadCore = () => loadCtx().ctx.RPG_CORE;
// RPG_CORE と、同じ vm の国の一覧（globalThis.COUNTRIES。pull に渡す C）
export const loadAll = () => { const { ctx } = loadCtx(); return { core: ctx.RPG_CORE, C: ctx.COUNTRIES }; };

// 計画 A の helpers（openApp の seed）と同じ式の乱数
export function mulberry32(seed) {
  let t = seed;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

// テスト用のセーブ。fresh/sanitize ができたらそれを通し、まだ無いうちは強さの計算に要る項目だけの形にする
export const dWith = (core, fields = {}) => core.sanitize
  ? core.sanitize({ ...core.fresh(T0), ...fields }, T0)
  : { lv: 1, cards: {}, fr: {}, mb: {}, gauge: {}, floors: {}, ...fields };
