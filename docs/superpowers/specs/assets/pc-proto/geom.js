// geom.js — dump element boxes for phone-width regression (old vs new). Usage: node geom.js ROOT OUTJSON WxH,...
const path = require('path'); const fs = require('fs');
const m = require('module');
const src = fs.readFileSync(path.join(__dirname, 'measure.js'), 'utf8')
  .replace(/const m = await page\.evaluate\([\s\S]*?\n        \}\);\n/, `const m = await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll('body *')) { if (el.closest('.rslot') || el.classList.contains('rslot') || el.classList.contains('rside') || el.closest('script')) continue; const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue; out.push(el.tagName + '.' + el.className.baseVal + el.className + ' ' + [r.x, r.y + scrollY, r.width, r.height].map(v => Math.round(v * 10) / 10).join(',')); } return { hscroll: false, docH: 0, ih: 0, cardBottom: null, list: out }; });\n        GEOM[\`\${w}x\${h} \${name}\`] = m.list;\n`)
  .replace("console.log(rows.join('\\n'));", "fs.writeFileSync(process.env.GEOM_OUT, JSON.stringify(GEOM)); console.log('written', Object.keys(GEOM).length);")
  .replace("'use strict';", "'use strict'; const GEOM = {};");
fs.writeFileSync(path.join(__dirname, '_geom_run.js'), src);
