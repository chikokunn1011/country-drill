// 埋めこみ「今日の国旗」（embed.html）。DAILY_CORE.oneOfDay が日本時間の日付から決める1日1問を、何回でも答え直せる4択で出す。
// 答えたら「この地域の国旗をもっと解く」（本編の #play=<地域>）を大きく出し、正解したらその国のページと次の1問までの時間も出す。
// 文字は T()（i18n.js）、国名は cName。英語版 en/embed.html は tools/make_en.mjs が作る（<base href="../"> なので本編へのリンクは I18N.page）。
// 端末のデータ・ランキングのサーバー・広告は使わない。img の alt に国名を入れない（答えが分かってしまうので）
(() => {
  // 国旗は flags/<a>.svg。index.html の FLAG_V と同じ数にする（tests/unit/pages.test.mjs で比べる）
  const FLAG_V = 1;
  const $ = id => document.getElementById(id);
  const root = $('embed');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // データが読めないときは、ひとことと「もっと遊ぶ」だけにする
  function fail(e) {
    console.error('[embed] 読みこめませんでした', e);
    const more = $('e-more'), p = document.createElement('p');
    p.className = 'e-err'; p.textContent = T('読みこめませんでした');
    root.replaceChildren(p, more);
  }

  // 国旗の img。読めなければ文字の代わりの表示に入れかえる（ボタンは押せるまま）
  function flagImg(a) {
    const img = document.createElement('img');
    img.onerror = () => {
      const s = document.createElement('span');
      s.className = 'e-noflag'; s.textContent = T('国旗を表示できません');
      img.replaceWith(s);
    };
    img.decoding = 'async';
    img.src = `flags/${a}.svg?v=${FLAG_V}`;
    return img;
  }

  // 正解の紙ふぶき（カードの中だけ。動きを減らす設定ならしない）
  function burst(from) {
    if (still()) return;
    const r = root.getBoundingClientRect(), b = from.getBoundingClientRect();
    const COLORS = ['#1f5f8b', '#2e8b57', '#e39b2d', '#c43d3d'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span');
      s.className = 'e-bit';
      s.style.left = `${b.left - r.left + b.width * (0.15 + 0.7 * Math.random())}px`;
      s.style.top = `${b.top - r.top + b.height * 0.3 * Math.random()}px`;
      s.style.background = COLORS[i % 4];
      s.style.setProperty('--dx', `${Math.round((Math.random() - 0.5) * 120)}px`);
      s.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 720)}deg`);
      s.addEventListener('animationend', () => s.remove());
      root.append(s);
    }
  }

  function start() {
    const C = window.COUNTRIES, D = window.DAILY_CORE;
    if (!Array.isArray(C) || typeof D?.oneOfDay !== 'function') throw new Error('COUNTRIES か DAILY_CORE.oneOfDay が無い');
    const by = new Map(C.map(c => [c.a, c]));
    const q = D.oneOfDay(D.jstDay(), C), ans = by.get(q.a);
    const msg = $('e-msg'), links = $('e-links'), again = $('e-again'), next = $('e-next');

    try { $('e-day').textContent = I18N.dayLabel(q.day); } catch { /* 日付が出せなくても問題は出す */ }
    $('e-q').textContent = q.mode === 'f2n' ? T('この国旗はどこの国？') : T('この国の国旗は？');
    const prompt = $('e-prompt');
    if (q.mode === 'f2n') { const img = flagImg(q.a); img.alt = T('今日の国旗'); prompt.replaceChildren(img); }
    else prompt.textContent = cName(ans);

    // いちばん大きいボタン: 答えの国の地域だけで遊ぶ（#play=<地域>。地域のキーは日本語のまま）
    const more = $('e-more');
    more.href = I18N.page('./') + '#play=' + encodeURIComponent(ans.r);
    const label = document.createElement('span'), arrow = document.createElement('span');
    label.textContent = T('{r}の国旗をもっと解く', { r: T(ans.r) });
    arrow.className = 'e-arrow'; arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
    more.replaceChildren(label, arrow);

    const buttons = q.opts.map((a, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'e-opt'; b.dataset.a = a;
      if (q.mode === 'f2n') b.textContent = cName(by.get(a));
      else { const img = flagImg(a); img.alt = ''; b.setAttribute('aria-label', T('選択肢{k}', { k: i + 1 })); b.append(img); }
      b.addEventListener('click', () => answer(b));
      return b;
    });
    $('e-opts').replaceChildren(...buttons);

    // 正解のあとだけ出す: その国のページ（国旗の意味）
    let page = null;
    function countryLink() {
      if (page) return page;
      page = document.createElement('a');
      page.id = 'e-page'; page.target = '_blank'; page.rel = 'noopener';
      page.href = I18N.page(`country/${q.a}.html`);
      page.textContent = T('{name}の国旗の意味', { name: cName(ans) });
      return page;
    }

    // 次の1問まで（日本時間の0時）。1分ごとに書きかえる
    let timer = 0;
    function tick() {
      // 日本時間の0時をまたいだら、数えるのをやめて「新しい1問」を知らせる（この画面の問題は前の日のまま）
      if (D.jstDay() !== q.day) { next.textContent = T('新しい1問が出たよ'); return; }
      const ms = D.msToNextDay(new Date()), h = Math.floor(ms / 3600e3), m = Math.floor(ms % 3600e3 / 60e3);
      next.textContent = T('次の1問まで あと{h}時間{m}分', { h, m });
      timer = setTimeout(tick, Math.min(60e3, ms + 500));
    }

    function answer(b) {
      if (b.dataset.a === q.a) {
        b.classList.add('ok');
        for (const x of buttons) x.disabled = true;
        msg.textContent = T('せいかい！'); msg.className = 'ok';
        $('e-daily').after(countryLink());
        again.hidden = false; next.hidden = false;
        clearTimeout(timer); tick();
        burst(b);
        again.focus();   // キーボードで答えた人のフォーカスを body に落とさない
      } else {
        b.classList.add('ng'); b.disabled = true;
        msg.textContent = T('ちがうよ。もう一度えらんでね'); msg.className = 'ng';
        buttons.find(x => !x.disabled)?.focus();
      }
      links.hidden = false;
    }
    again.addEventListener('click', () => {
      for (const x of buttons) { x.disabled = false; x.classList.remove('ok', 'ng'); }
      msg.textContent = ''; msg.className = '';
      again.hidden = true; links.hidden = true; next.hidden = true;
      clearTimeout(timer);
      page?.remove();
      buttons[0].focus();
    });
  }

  try { start(); } catch (e) { fail(e); }
})();
