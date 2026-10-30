// D2 アプリ化: service worker（sw.js）を登録する。sw.js はページからの相対（<base> があっても同じ場所を指す）
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
