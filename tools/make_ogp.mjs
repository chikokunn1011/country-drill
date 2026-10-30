// tools/ogp.html を撮って icons/ogp.png（1200x630）を作る。引数 en なら tools/ogp-en.html → icons/ogp-en.png
// 使い方: node tools/make_ogp.mjs [en]（Google Fonts が読める所で撮る）
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const sfx = process.argv[2] === 'en' ? '-en' : '';
const html = new URL(`./ogp${sfx}.html`, import.meta.url);
const out = fileURLToPath(new URL(`../icons/ogp${sfx}.png`, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(html.href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
