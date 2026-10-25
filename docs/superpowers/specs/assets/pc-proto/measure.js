#!/usr/bin/env node
// measure.js — fit checks + viewport screenshots for the PC layout prototype.
// node measure.js --root DIR --out DIR --viewport 1366x657,1920x1080 [--screens a,b] [--full] [--dopa] [--long]
'use strict';
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const VENDOR = path.resolve(__dirname, '../snap359/vendor');
const CDN = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js': 'd3.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js': 'topojson-client.min.js',
};
function findFile(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    if (e.isDirectory()) { const r = findFile(p, name); if (r) return r; }
  }
  return null;
}
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = path.resolve(opt('--root', path.join(__dirname, 'proto_pc')));
const out = path.resolve(opt('--out', path.join(__dirname, 'proto_shots')));
const viewports = opt('--viewport', '1366x657').split(',').map(v => v.split('x').map(Number));
const full = args.includes('--full');
const dopa = args.includes('--dopa');
const long = args.includes('--long'); // force a long country name into the first question
const noShot = args.includes('--no-shot');

function freePort() { return new Promise((res, rej) => { const s = net.createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); }); }
async function startServer(dir) {
  const port = await freePort();
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise(r => http.get(url, res => { res.resume(); r(res.statusCode === 200); }).on('error', () => r(false)));
    if (ok) return { url, stop: () => proc.kill() };
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server');
}
async function settle(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    const t = ms => new Promise(r => setTimeout(r, ms));
    await Promise.race([document.fonts.ready, t(8000)]);
    await Promise.race([Promise.all([...document.images].filter(i => !i.complete && i.loading !== 'lazy').map(i => new Promise(r => { i.onload = i.onerror = r; }))), t(8000)]);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(250);
}
const correct = page => page.evaluate(() => G.cur.c.a);
async function startQuiz(page, mode, { kind = 'practice', count = 5, name = false } = {}) {
  await page.click('#home-play');
  await page.click(`#modes .modecard[data-k="${mode}"]`);
  await page.click(`#kinds .modecard[data-k="${kind}"]`);
  await page.click(`#counts .chip[data-c="${count}"]`);
  if (name && await page.locator('#nameopt').isVisible()) await page.check('#nameopt');
  await page.click('#start');
  await page.waitForSelector('#qcard .choice');
  if (long) await page.evaluate(() => { G.queue.unshift(byA.get('vc')); G.queue.unshift(byA.get('kn')); nextQuestion(); });
}
async function answer(page, right) {
  const a = await correct(page);
  await page.locator(right ? `#qcard .choice[data-a="${a}"]` : `#qcard .choice:not([data-a="${a}"])`).first().click();
  await page.waitForSelector('#next');
}
async function playThrough(page, wrongFirst) {
  let first = true;
  for (let g = 0; g < 50; g++) {
    await answer(page, !(wrongFirst && first)); first = false;
    await page.click('#next');
    if (await page.locator('#scr-result:not([hidden])').count()) return;
    await page.waitForSelector('#qcard .choice:not([disabled])');
  }
}
const MODES = ['f2n', 'n2f', 'm2f', 'f2m'];
const SCREENS = {
  home: async () => {},
  settings: async p => { await p.click('#home-settings'); },
  setup: async p => { await p.click('#home-play'); },
  ...Object.fromEntries(MODES.map(m => [`quiz_${m}`, async p => { await startQuiz(p, m); }])),
  ...Object.fromEntries(MODES.map(m => [`reveal_${m}`, async p => { await startQuiz(p, m); await answer(p, true); }])),
  ...Object.fromEntries(['m2f', 'f2m'].map(m => [`named_${m}`, async p => { await startQuiz(p, m, { name: true }); await answer(p, false); }])),
  reveal_wrong: async p => { await startQuiz(p, 'f2n'); await answer(p, false); },
  reveal_wrong_n2f: async p => { await startQuiz(p, 'n2f'); await answer(p, false); },
  result: async p => { await startQuiz(p, 'f2n'); await playThrough(p, false); },
  result_miss: async p => { await startQuiz(p, 'f2n'); await playThrough(p, true); },
  book_grid: async p => { await p.click('#home-book'); await p.click('#bview button[data-v="list"]'); await p.waitForSelector('#grid .card'); },
  book_map: async p => { await p.click('#home-book'); await p.click('#bview button[data-v="map"]'); await p.waitForSelector('#bmapbox svg path'); },
  book_map_sel: async p => { await SCREENS.book_map(p); await p.locator('#bmapbox path[data-a="jp"]').first().dispatchEvent('click'); },
  book_detail: async p => { await SCREENS.book_grid(p); await p.locator('#grid .card[data-a="jp"]').click(); await p.waitForSelector('#detail[open]'); },
};
const screens = (opt('--screens', 'all') === 'all' ? Object.keys(SCREENS) : opt('--screens').split(','));

(async () => {
  const local = Object.fromEntries(Object.entries(CDN).map(([u, f]) => [u, findFile(VENDOR, f)]));
  fs.mkdirSync(out, { recursive: true });
  const server = await startServer(root);
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const [w, h] of viewports) for (const name of screens) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'ja-JP', reducedMotion: 'reduce' });
      for (const [u, p] of Object.entries(local)) await ctx.route(u, r => r.fulfill({ path: p, contentType: 'application/javascript' }));
      await ctx.addInitScript(({ dopa }) => {
        let t = 1;
        Math.random = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
        if (dopa) try { localStorage.setItem('settings', JSON.stringify({ region: 'all', dopa: true, sound: false })); } catch {}
      }, { dopa });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      try {
        await page.goto(server.url + 'index.html', { waitUntil: 'load' });
        await page.waitForSelector('#home-play');
        await SCREENS[name](page);
        await settle(page);
        const m = await page.evaluate(() => {
          const de = document.documentElement, ih = innerHeight;
          const r = el => el && el.getBoundingClientRect();
          const q = document.querySelector('#scr-quiz:not([hidden]) #qcard');
          let overflow = 0, cardBottom = null, nextBottom = null;
          if (q) {
            const cb = r(q); cardBottom = Math.round(cb.bottom);
            for (const el of q.querySelectorAll('*')) { const b = r(el); if (b.width && b.height) overflow = Math.max(overflow, b.bottom - (cb.bottom - parseFloat(getComputedStyle(q).paddingBottom)) , b.right - cb.right); }
            const nx = document.getElementById('next'); if (nx) nextBottom = Math.round(r(nx).bottom);
            const pad = parseFloat(getComputedStyle(q).paddingLeft);
            for (const el of q.querySelectorAll('*')) { const b = r(el); if (!b.width) continue; overflow = Math.max(overflow, (cb.left + pad) - b.left, b.right - (cb.right - pad)); }
            for (const el of q.querySelectorAll('p, b, span, dd, button')) { if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow === 'visible' && el.clientWidth) overflow = Math.max(overflow, el.scrollWidth - el.clientWidth); }
          }
          const grid = document.querySelector('#grid:not([hidden])');
          const cols = grid && grid.offsetParent ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null;
          return { hscroll: de.scrollWidth > innerWidth, docH: de.scrollHeight, ih, cardBottom, nextBottom, overflow: Math.round(overflow), cols, root: getComputedStyle(de).fontSize };
        });
        const fits = m.cardBottom == null ? '' : (m.cardBottom <= m.ih && m.overflow <= 1 ? 'FIT' : 'NOFIT');
        rows.push([`${w}x${h}`, name, m.hscroll ? 'HSCROLL' : 'ok', `doc ${m.docH}/${m.ih}`, m.cardBottom != null ? `card ${m.cardBottom} next ${m.nextBottom} over ${m.overflow} ${fits}` : '', m.cols ? `cols ${m.cols}` : '', m.root, errs.join('|')].join('  '));
        if (!noShot) await page.screenshot({ path: path.join(out, `${name}_${w}x${h}${dopa ? '_dopa' : ''}${long ? '_long' : ''}.png`), fullPage: full });
      } catch (e) { rows.push(`${w}x${h}  ${name}  FAIL ${e.message.split('\n')[0]}`); }
      await ctx.close();
    }
  } finally { await browser.close(); server.stop(); }
  console.log(rows.join('\n'));
})();
