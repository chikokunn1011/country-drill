// PR6: i18n.js を先に読んだ vm の文脈（ranking・share-card・streak などの unit テスト用）。
// document が無いので日本語（T はキーをそのまま返す）。extra は文脈に足す値（localStorage・fetch など）
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../i18n.js', import.meta.url), 'utf8');

export function ctxWithI18n(extra = {}) {
  const ctx = vm.createContext({ console, ...extra });
  ctx.window = ctx;
  vm.runInContext(SRC, ctx, { filename: 'i18n.js' });
  return ctx;
}
