// D2 アプリ化: service worker（sw.js）の登録と、「アプリとして追加」の帯（#home-pwa）・設定の欄（#set-pwa-field）。
// 帯は2日目から（初めての日は出さない）。× で30日出さない。アプリとして開いているときは帯も欄も出さない。
// 保存: localStorage 'pwa' = { v:1, first:'YYYY-MM-DD'（日本時間）, hideUntil:ms|0 }。外側に const / let / function を書かない（streak.js と同じ）
(() => {
  'use strict';
  // sw.js はページからの相対（<base> があっても同じ場所を指す）
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  const NEED = { store: typeof store, $: typeof $, DAILY_CORE: typeof DAILY_CORE };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[pwa] 必要なものが読み込めなかったので、追加の案内はお休み: ${missing.join(' ')}`); return; }
  const band = $('home-pwa'), field = $('set-pwa-field'), ios = $('pwa-ios');
  if (!band || !field || !ios) { console.error('[pwa] #home-pwa・#set-pwa-field・#pwa-ios が無いので、追加の案内はお休み'); return; }

  const KEY = 'pwa', HIDE_MS = 30 * 864e5, D = DAILY_CORE;
  // 無い・壊れていたら作り直す（今日を最初の日にする。前から遊んでいる人（settings か misses がある）は昨日にして、出した日から帯が出るように）。
  // 先の日付の first は今日に、30日より先の hideUntil は 0 にそろえる（時計が狂っていた端末で出なくならないように）
  const load = () => {
    const s = store.get(KEY, null), today = D.jstDay();
    if (s && s.v === 1 && D.validDay(s.first) && Number.isFinite(s.hideUntil) && s.hideUntil >= 0) {
      const fixed = { ...s, first: s.first > today ? today : s.first, hideUntil: s.hideUntil > Date.now() + HIDE_MS ? 0 : s.hideUntil };
      if (fixed.first !== s.first || fixed.hideUntil !== s.hideUntil) store.set(KEY, fixed);
      return fixed;
    }
    const played = store.get('settings', null) != null || store.get('misses', null) != null;
    const fresh = { v: 1, first: played ? D.addDays(today, -1) : today, hideUntil: 0 };
    store.set(KEY, fresh);
    return fresh;
  };
  let st = load();

  const ua = navigator.userAgent;
  // iPhone・iPad（iPadOS はパソコンの UA なので、さわれるかで見る）。自動では追加できないので、手順の小窓を出す
  const isIos = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // LINE・Facebook・Instagram の中のブラウザでは追加できないので、帯も欄も出さない
  const inApp = / Line\/|FBAN|FBAV|Instagram/.test(ua);
  let deferred = null, installed = false;
  const canAdd = () => !standalone && !inApp && !installed && (!!deferred || isIos);
  const render = () => {
    field.hidden = !canAdd();
    band.hidden = !(canAdd() && st.first < D.jstDay() && Date.now() >= st.hideUntil);
  };
  const add = () => {
    if (deferred) {   // prompt は1回しか使えないので手ばなす
      const e = deferred; deferred = null;
      Promise.resolve().then(() => e.prompt()).catch(() => {}).finally(render);
    } else if (isIos) ios.showModal();
  };

  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; render(); });
  addEventListener('appinstalled', () => { installed = true; deferred = null; render(); });
  $('home-pwa-add').onclick = add;
  $('set-pwa').onclick = add;
  $('home-pwa-x').onclick = () => { st = { ...st, hideUntil: Date.now() + HIDE_MS }; store.set(KEY, st); render(); };
  $('pwa-ios-ok').onclick = () => ios.close();
  ios.onclick = e => { if (e.target === ios) ios.close(); };
  render();
})();
