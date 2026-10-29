// flags.js（window.FLAGS = { 国コード: svg の文字 }）を、国ごとの flags/<a>.svg に分ける。中身はそのまま書く
// 使い方: node tools/split_flags.mjs [src=flags.js] [out=flags]
// flags.js はもうリポジトリに無いので、作り直すときは git show <消す前のコミット>:flags.js > /tmp/flags.js を src に渡す
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const [src = 'flags.js', out = 'flags'] = process.argv.slice(2);
const ctx = { window: {} };
vm.runInNewContext(readFileSync(src, 'utf8'), ctx);
const flags = ctx.window.FLAGS;
if (!flags || typeof flags !== 'object') throw new Error(`${src} に window.FLAGS が無い`);
mkdirSync(out, { recursive: true });
for (const [a, svg] of Object.entries(flags)) writeFileSync(join(out, `${a}.svg`), svg);
console.log(`${Object.keys(flags).length} 枚を ${out}/ に書いた`);
