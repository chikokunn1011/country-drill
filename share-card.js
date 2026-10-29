(() => {
  'use strict';
  // 結果画像のシェア（タイムアタックのクリア画面・今日の難問の結果）。外から使うのは SHARECARD.attach(btn, data) だけ。
  // 前半（SHARE・normalize・layout）は DOM にさわらない（tests/unit/share-card.test.mjs が vm で読む）。
  // index.html のインライン script の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）
  // 画像にも data にも国名・首都・プロフィールの名前を入れない。今日の難問は国旗を出さない（答えは明日まで隠す）

  const SHARE = Object.freeze({ url: 'https://chikokunn1011.github.io/country-drill/', tag: '#国旗マスター', w: 1200, h: 675, maxFlags: 24 });
  const COLS = 8;
  const GRID = ['ok', 'ng', 'skip'];
  const str = v => typeof v === 'string' ? v : '';

  // data を決まった8つのキーだけの新しいオブジェクトにする（ほかのキーは落とす）
  function normalize(d) {
    const x = d && typeof d === 'object' ? d : {};
    const kind = x.kind === 'daily' ? 'daily' : 'ta';
    return {
      kind,
      title: str(x.title), big: str(x.big), sub: str(x.sub),
      rank: typeof x.rank === 'string' ? x.rank : null,
      flags: kind === 'daily' || !Array.isArray(x.flags) ? [] : x.flags.filter(a => typeof a === 'string'),
      grid: Array.isArray(x.grid) ? x.grid.map(g => GRID.includes(g) ? g : 'skip') : [],
      text: str(x.text),
    };
  }

  // 国旗のマス: 24枚までは全部。それより多ければ先頭23枚と、最後のマスに「+N」
  function layout(d) {
    const f = d.kind === 'daily' ? [] : d.flags;
    const over = f.length > SHARE.maxFlags;
    const cells = over ? f.slice(0, SHARE.maxFlags - 1) : f.slice();
    const more = over ? f.length - cells.length : 0;
    const n = cells.length + (more ? 1 : 0);
    return { cells, more, cols: Math.min(COLS, n), rows: Math.ceil(n / COLS) };
  }

  // ---- ここから下はブラウザだけ（DOM・canvas） ----
  const FONT_MS = 2000;
  const VARS = ['bg', 'surface', 'ink', 'muted', 'accent', 'ok', 'ng', 'line'];
  const FLAG_W = 88, FLAG_H = 66, FLAG_GAP = 10;   // 国旗のマス（4:3）
  const BAR = 44, BAR_GAP = 8;                      // 今日の難問の帯のマス

  // 色は CSS の変数から読む（ライト・ダーク・ドパガキに合う。JS に色を書かない）
  function colors() {
    const cs = getComputedStyle(document.body);
    return Object.fromEntries(VARS.map(k => [k, cs.getPropertyValue(`--${k}`).trim()]));
  }
  const family = () => getComputedStyle(document.body).getPropertyValue('--font-display').trim() || 'sans-serif';
  // 丸ゴシックを読み終えるのを最大 FONT_MS 待つ。読めなければ予備のフォントで描く
  function waitFont() {
    try {
      const p = document.fonts?.load?.('900 80px "Zen Maru Gothic"');
      if (!p) return Promise.resolve();
      return Promise.race([Promise.resolve(p).catch(() => {}), new Promise(ok => setTimeout(ok, FONT_MS))]);
    } catch { return Promise.resolve(); }
  }
  // 国旗の svg を文字で読み、大きさを書き足して画像にする（Firefox は大きさの無い svg を canvas に描けない）。
  // 同じサイトのファイルなので canvas は汚れない。読めなければ null（そのマスは四角）
  async function flagImage(a, urls) {
    try {
      const res = await fetch(flag(a));
      if (!res.ok) throw new Error(`flag ${a} ${res.status}`);
      const svg = (await res.text()).replace('<svg ', '<svg width="640" height="480" ');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      urls.push(url);
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch { return null; }
  }
  // 角の丸い四角（roundRect が無い古いブラウザでは角の丸くない四角）
  const rrect = (c, l, t, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(l, t, w, h, r); else c.rect(l, t, w, h); };
  const box = (x, c, l, t, w, h, r) => { c.fillStyle = x; rrect(c, l, t, w, h, r); c.fill(); };

  // 1200×675 の結果画像。上に題名、まん中に結果、その下に国旗（タイムアタック）か20マスの帯（今日の難問）、下にサイトとタグ
  async function draw(d, L, col) {
    const { w: W, h: H } = SHARE, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), F = family();
    const text = (s, x, y, size, color, { weight = 700, align = 'left', max } = {}) => {
      c.font = `${weight} ${size}px ${F}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic';
      c.fillText(s, x, y, max);
    };
    c.fillStyle = col.bg; c.fillRect(0, 0, W, H);
    box(col.surface, c, 24, 24, W - 48, H - 48, 28);
    // 上: 国旗マスター と 条件
    text('国旗マスター', 80, 100, 40, col.accent, { weight: 900 });
    text(d.title, W - 80, 98, 28, col.muted, { align: 'right', max: W - 480 });
    // まん中: 結果
    const cx = W / 2;
    text(d.big, cx, 236, d.kind === 'daily' ? 96 : 128, col.ink, { weight: 900, align: 'center', max: W - 160 });
    const line = [d.sub, d.rank].filter(Boolean).join('　');
    if (line) text(line, cx, 292, 34, col.muted, { align: 'center', max: W - 160 });
    // 国旗（タイムアタック）
    const urls = [];
    try {
      if (L.cells.length || L.more) {
        const imgs = await Promise.all(L.cells.map(a => typeof flag === 'function' ? flagImage(a, urls) : null));
        const left = cx - (L.cols * FLAG_W + (L.cols - 1) * FLAG_GAP) / 2, top = 328;
        const at = i => [left + (i % 8) * (FLAG_W + FLAG_GAP), top + Math.floor(i / 8) * (FLAG_H + FLAG_GAP)];
        imgs.forEach((img, i) => {
          const [x, y] = at(i);
          if (img) c.drawImage(img, x, y, FLAG_W, FLAG_H); else box(col.line, c, x, y, FLAG_W, FLAG_H, 6);
        });
        if (L.more) {
          const [x, y] = at(L.cells.length);
          c.strokeStyle = col.line; c.lineWidth = 2; rrect(c, x + 1, y + 1, FLAG_W - 2, FLAG_H - 2, 6); c.stroke();
          text(`+${L.more}`, x + FLAG_W / 2, y + FLAG_H / 2 + 11, 30, col.accent, { weight: 900, align: 'center', max: FLAG_W - 8 });
        }
      }
    } finally { urls.forEach(u => URL.revokeObjectURL(u)); }
    // 今日の難問の帯（国旗は出さない）
    if (d.kind === 'daily' && d.grid.length) {
      const n = d.grid.length, left = cx - (n * BAR + (n - 1) * BAR_GAP) / 2;
      d.grid.forEach((g, i) => box(col[g === 'ok' ? 'ok' : g === 'ng' ? 'ng' : 'line'], c, left + i * (BAR + BAR_GAP), 360, BAR, BAR, 8));
    }
    // 下: サイトとタグ
    text(SHARE.url.replace(/^https:\/\//, '').replace(/\/$/, ''), 80, H - 64, 26, col.muted);
    text(SHARE.tag, W - 80, H - 64, 28, col.accent, { weight: 900, align: 'right' });
    return cv;
  }

  const toFile = cv => new Promise((ok, ng) => cv.toBlob(b => b ? ok(new File([b], 'kokki-master.png', { type: 'image/png' })) : ng(new Error('toBlob')), 'image/png'));

  // 押したとき。File があって渡せるなら画像と文、作り中・失敗なら文と URL。渡せない・失敗（AbortError 以外）は X の投稿画面（rpg-cards.js の share と同じ）
  function share(d, file) {
    const tweet = () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(d.text)}&url=${encodeURIComponent(SHARE.url)}`, '_blank', 'noopener');
    const failed = e => { if (e?.name !== 'AbortError') tweet(); };
    const send = o => { try { Promise.resolve(navigator.share(o)).catch(failed); } catch (e) { failed(e); } };
    const canShare = typeof navigator.share === 'function';
    if (file) {
      let files = false;
      try { files = canShare && !!navigator.canShare?.({ files: [file] }); } catch {}
      return files ? send({ files: [file], text: `${d.text}\n${SHARE.url}` }) : tweet();
    }
    if (canShare) send({ text: d.text, url: SHARE.url }); else tweet();
  }

  // ボタンに付ける。画像は今のうちに作って File を持っておき、押されたら同期で navigator.share に渡す（Safari は押した処理の中で呼ぶ必要がある）。
  // 同じボタンに新しく attach された・ボタンが画面から外れたら、前の処理は捨てる
  const gen = new WeakMap();
  function attach(btn, data) {
    const d = normalize(data), L = layout(d), id = (gen.get(btn) ?? 0) + 1;
    gen.set(btn, id);
    let file = null;
    btn.dataset.card = 'busy';
    btn.onclick = () => share(d, file);
    const live = () => btn.isConnected && gen.get(btn) === id;
    (async () => {
      await waitFont();
      if (!live()) return;
      const cv = await draw(d, L, colors());
      if (!live()) return;
      const f = await toFile(cv);
      if (!live()) return;
      file = f;
      btn.dataset.card = 'ready';
    })().catch(e => {
      if (!live()) return;
      console.warn('sharecard', e);
      btn.dataset.card = 'fail';
    });
  }

  globalThis.SHARECARD = { SHARE, normalize, layout, attach };
})();
