// D2 アプリ化: オフラインでも遊べるように、サイトのファイルを端末に保存する service worker。
// 一覧（PRECACHE）と版（VERSION）は tools/make_sw.mjs が書く。手で書かない（node tools/make_sw.mjs）
// precache:start
const VERSION = '7a18d76d07ca';
const PRECACHE = [
  "./",
  "index.html",
  "en/",
  "en/index.html",
  "favicon.ico",
  "icons/icon.svg",
  "icons/apple-touch-icon.png",
  "manifest.webmanifest",
  "pc.css?v=6",
  "rpg.css?v=23",
  "badges.css?v=2",
  "daily.css?v=2",
  "profile.css?v=3",
  "streak.css?v=1",
  "dojo.css?v=1",
  "i18n.js?v=1",
  "countries.js?v=2",
  "themes.js?v=2",
  "ranking.js?v=5",
  "daily-core.js?v=2",
  "trivia.js",
  "sound.js?v=1",
  "profile.js?v=7",
  "rpg-core.js?v=15",
  "rpg.js?v=15",
  "rpg-cards.js?v=7",
  "rpg-battle.js?v=18",
  "rpg-team.js?v=5",
  "rpg-rank.js?v=9",
  "badges.js?v=13",
  "share-card.js?v=1",
  "daily.js?v=5",
  "streak.js?v=2",
  "dojo.js?v=2",
  "pwa.js?v=2",
  "en/manifest.webmanifest",
  "i18n/en-core.js?v=1",
  "i18n/en-quiz.js?v=1",
  "i18n/en-rank.js?v=1",
  "i18n/en-book.js?v=1",
  "i18n/en-dojo.js?v=1",
  "vendor/d3-7.9.0.min.js",
  "vendor/topojson-client-3.1.0.min.js",
  "world.js?v=1",
  "flags/af.svg?v=1",
  "flags/al.svg?v=1",
  "flags/dz.svg?v=1",
  "flags/ad.svg?v=1",
  "flags/ao.svg?v=1",
  "flags/ag.svg?v=1",
  "flags/ar.svg?v=1",
  "flags/am.svg?v=1",
  "flags/au.svg?v=1",
  "flags/at.svg?v=1",
  "flags/az.svg?v=1",
  "flags/bs.svg?v=1",
  "flags/bh.svg?v=1",
  "flags/bd.svg?v=1",
  "flags/bb.svg?v=1",
  "flags/by.svg?v=1",
  "flags/be.svg?v=1",
  "flags/bz.svg?v=1",
  "flags/bj.svg?v=1",
  "flags/bt.svg?v=1",
  "flags/bo.svg?v=1",
  "flags/ba.svg?v=1",
  "flags/bw.svg?v=1",
  "flags/br.svg?v=1",
  "flags/bn.svg?v=1",
  "flags/bg.svg?v=1",
  "flags/bf.svg?v=1",
  "flags/bi.svg?v=1",
  "flags/cv.svg?v=1",
  "flags/kh.svg?v=1",
  "flags/cm.svg?v=1",
  "flags/ca.svg?v=1",
  "flags/cf.svg?v=1",
  "flags/td.svg?v=1",
  "flags/cl.svg?v=1",
  "flags/cn.svg?v=1",
  "flags/co.svg?v=1",
  "flags/km.svg?v=1",
  "flags/cg.svg?v=1",
  "flags/cd.svg?v=1",
  "flags/cr.svg?v=1",
  "flags/ci.svg?v=1",
  "flags/hr.svg?v=1",
  "flags/cu.svg?v=1",
  "flags/cy.svg?v=1",
  "flags/cz.svg?v=1",
  "flags/dk.svg?v=1",
  "flags/dj.svg?v=1",
  "flags/dm.svg?v=1",
  "flags/do.svg?v=1",
  "flags/ec.svg?v=1",
  "flags/eg.svg?v=1",
  "flags/sv.svg?v=1",
  "flags/gq.svg?v=1",
  "flags/er.svg?v=1",
  "flags/ee.svg?v=1",
  "flags/sz.svg?v=1",
  "flags/et.svg?v=1",
  "flags/fj.svg?v=1",
  "flags/fi.svg?v=1",
  "flags/fr.svg?v=1",
  "flags/ga.svg?v=1",
  "flags/gm.svg?v=1",
  "flags/ge.svg?v=1",
  "flags/de.svg?v=1",
  "flags/gh.svg?v=1",
  "flags/gr.svg?v=1",
  "flags/gd.svg?v=1",
  "flags/gt.svg?v=1",
  "flags/gn.svg?v=1",
  "flags/gw.svg?v=1",
  "flags/gy.svg?v=1",
  "flags/ht.svg?v=1",
  "flags/va.svg?v=1",
  "flags/hn.svg?v=1",
  "flags/hu.svg?v=1",
  "flags/is.svg?v=1",
  "flags/in.svg?v=1",
  "flags/id.svg?v=1",
  "flags/ir.svg?v=1",
  "flags/iq.svg?v=1",
  "flags/ie.svg?v=1",
  "flags/il.svg?v=1",
  "flags/it.svg?v=1",
  "flags/jm.svg?v=1",
  "flags/jp.svg?v=1",
  "flags/jo.svg?v=1",
  "flags/kz.svg?v=1",
  "flags/ke.svg?v=1",
  "flags/ki.svg?v=1",
  "flags/kp.svg?v=1",
  "flags/kr.svg?v=1",
  "flags/xk.svg?v=1",
  "flags/kw.svg?v=1",
  "flags/kg.svg?v=1",
  "flags/la.svg?v=1",
  "flags/lv.svg?v=1",
  "flags/lb.svg?v=1",
  "flags/ls.svg?v=1",
  "flags/lr.svg?v=1",
  "flags/ly.svg?v=1",
  "flags/li.svg?v=1",
  "flags/lt.svg?v=1",
  "flags/lu.svg?v=1",
  "flags/mg.svg?v=1",
  "flags/mw.svg?v=1",
  "flags/my.svg?v=1",
  "flags/mv.svg?v=1",
  "flags/ml.svg?v=1",
  "flags/mt.svg?v=1",
  "flags/mh.svg?v=1",
  "flags/mr.svg?v=1",
  "flags/mu.svg?v=1",
  "flags/mx.svg?v=1",
  "flags/fm.svg?v=1",
  "flags/md.svg?v=1",
  "flags/mc.svg?v=1",
  "flags/mn.svg?v=1",
  "flags/me.svg?v=1",
  "flags/ma.svg?v=1",
  "flags/mz.svg?v=1",
  "flags/mm.svg?v=1",
  "flags/na.svg?v=1",
  "flags/nr.svg?v=1",
  "flags/np.svg?v=1",
  "flags/nl.svg?v=1",
  "flags/nz.svg?v=1",
  "flags/ni.svg?v=1",
  "flags/ne.svg?v=1",
  "flags/ng.svg?v=1",
  "flags/mk.svg?v=1",
  "flags/no.svg?v=1",
  "flags/om.svg?v=1",
  "flags/pk.svg?v=1",
  "flags/pw.svg?v=1",
  "flags/pa.svg?v=1",
  "flags/pg.svg?v=1",
  "flags/py.svg?v=1",
  "flags/pe.svg?v=1",
  "flags/ph.svg?v=1",
  "flags/pl.svg?v=1",
  "flags/pt.svg?v=1",
  "flags/qa.svg?v=1",
  "flags/ro.svg?v=1",
  "flags/ru.svg?v=1",
  "flags/rw.svg?v=1",
  "flags/kn.svg?v=1",
  "flags/lc.svg?v=1",
  "flags/vc.svg?v=1",
  "flags/ws.svg?v=1",
  "flags/sm.svg?v=1",
  "flags/st.svg?v=1",
  "flags/sa.svg?v=1",
  "flags/sn.svg?v=1",
  "flags/rs.svg?v=1",
  "flags/sc.svg?v=1",
  "flags/sl.svg?v=1",
  "flags/sg.svg?v=1",
  "flags/sk.svg?v=1",
  "flags/si.svg?v=1",
  "flags/sb.svg?v=1",
  "flags/so.svg?v=1",
  "flags/za.svg?v=1",
  "flags/ss.svg?v=1",
  "flags/es.svg?v=1",
  "flags/lk.svg?v=1",
  "flags/sd.svg?v=1",
  "flags/sr.svg?v=1",
  "flags/se.svg?v=1",
  "flags/ch.svg?v=1",
  "flags/sy.svg?v=1",
  "flags/tj.svg?v=1",
  "flags/tz.svg?v=1",
  "flags/th.svg?v=1",
  "flags/tl.svg?v=1",
  "flags/tg.svg?v=1",
  "flags/to.svg?v=1",
  "flags/tt.svg?v=1",
  "flags/tn.svg?v=1",
  "flags/tr.svg?v=1",
  "flags/tm.svg?v=1",
  "flags/tv.svg?v=1",
  "flags/ug.svg?v=1",
  "flags/ua.svg?v=1",
  "flags/ae.svg?v=1",
  "flags/gb.svg?v=1",
  "flags/us.svg?v=1",
  "flags/uy.svg?v=1",
  "flags/uz.svg?v=1",
  "flags/vu.svg?v=1",
  "flags/ve.svg?v=1",
  "flags/vn.svg?v=1",
  "flags/ye.svg?v=1",
  "flags/zm.svg?v=1",
  "flags/zw.svg?v=1",
  "textures/ocean-light.svg",
  "textures/ocean-dark.svg",
  "textures/paper.svg",
  "textures/contour.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];
// precache:end
const CACHE = `drill-${VERSION}`;
const WAIT_MS = 3000;
const SCOPE = new URL('./', location.href).pathname;
const abs = u => new URL(u, location.href);
// ?v= 付き・vendor/ は中身が変わらない（変えるときは URL が変わる）
const isFixed = url => url.searchParams.has('v') || url.pathname.startsWith(`${SCOPE}vendor/`);
// 管理ページ（admin.html・admin*.js）は取っておかない
const isAdmin = url => url.pathname.slice(SCOPE.length).startsWith('admin');
// 本編の代わりを出してよいのは、根（./・index.html。? 付きも）→ index.html と、英語版の en/・en/index.html → en/index.html だけ
const shellFor = url => {
  const p = url.pathname.slice(SCOPE.length);
  return url.pathname.startsWith(SCOPE) && (p === '' || p === 'index.html') ? 'index.html'
    : url.pathname.startsWith(SCOPE) && (p === 'en/' || p === 'en/index.html') ? 'en/index.html' : null;
};

// precache に1つ入れる。中身が変わらないものは前の版のキャッシュにあれば写す。
// それ以外はブラウザの HTTP キャッシュを確かめてから取る（no-cache。古い index.html と新しい ?v= が混ざらないように）
const fill = (c, u) => {
  const url = abs(u);
  return (isFixed(url) ? caches.match(url.href) : Promise.resolve())
    .then(old => old ? c.put(url.href, old) : c.add(isFixed(url) ? url.href : new Request(url.href, { cache: 'no-cache' })))
    .catch(() => {});
};
// まだ入っていないものだけ入れる（落ちたものはとばす）
const fillMissing = c => Promise.all(PRECACHE.map(u => c.match(abs(u).href).then(r => r || fill(c, u)).catch(() => {})));

// install は失敗させない。skipWaiting はしない（遊んでいる途中で入れかえない）
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(fillMissing));
});

// 古い版のキャッシュを消す。install で入れそこねたものは、待たずにもう一度だけ入れてみる
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('drill-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => { caches.open(CACHE).then(fillMissing).catch(() => {}); return self.clients.claim(); }));
});

// 取れたものはキャッシュに入れる
const keep = (req, res) => {
  if (res.ok && !isAdmin(new URL(req.url))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
  return res;
};
const fromCache = req => caches.open(CACHE).then(c => c.match(req));
// HTTP キャッシュを確かめてから取る。ページ（navigate）の Request はそのまま作り直せないので URL で取る（転送は manual でブラウザにまかせる）
const fresh = req => fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'include', redirect: 'manual' })
  : new Request(req, { cache: 'no-cache' })).then(res => keep(req, res));

// ネット優先。3秒で返らない・落ちた・500番台ならキャッシュ（alt: キャッシュに無いときの代わり）。
// それも無ければネットを待ち（遅れて届いたものもキャッシュに入る）、だめならネットの失敗にする
const race = (req, alt) => new Promise(ok => {
  let done = false;
  const net = fresh(req);
  const fallback = () => {
    if (done) return;
    done = true;
    fromCache(req).then(r => r || (alt && alt()))
      .catch(() => undefined)
      .then(r => r || net)
      .then(ok, () => ok(Response.error()));
  };
  const timer = setTimeout(fallback, WAIT_MS);
  const fail = () => { clearTimeout(timer); fallback(); };
  net.then(res => {
    if (res.status >= 500) return fail();
    if (!done) { done = true; clearTimeout(timer); ok(res); }
  }, fail);
});
const shell = name => () => caches.open(CACHE).then(c => c.match(abs(name).href));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;   // 外のサイト（Supabase など）はさわらない
  // ページ: 根・en/ だけは無ければ本編（index.html・en/index.html）。ほかのページ（国のページなど）に本編は出さない
  if (req.mode === 'navigate') { const s = shellFor(url); return e.respondWith(race(req, s ? shell(s) : null)); }
  // ?v= 付き・vendor/ はキャッシュ優先
  if (isFixed(url)) return e.respondWith(fromCache(req).then(r => r || fetch(req).then(res => keep(req, res))));
  // それ以外（trivia.js・textures など）はページと同じ
  e.respondWith(race(req));
});
