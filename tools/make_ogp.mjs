// tools/ogp.html を撮って icons/ogp.png（1200x630）を作る
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const html = new URL('./ogp.html', import.meta.url);
const out = fileURLToPath(new URL('../icons/ogp.png', import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(html.href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
