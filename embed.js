// 埋めこみ「今日の国旗」（embed.html）。DAILY_CORE.oneOfDay が日本時間の日付から決める1日1問を、何回でも答え直せる4択で出す。
// 端末のデータ・ランキングのサーバー・広告は使わない。img の alt に国名を入れない（答えが分かってしまうので）
(() => {
  // 国旗は flags/<a>.svg。index.html の FLAG_V と同じ数にする（tests/unit/pages.test.mjs で比べる）
  const FLAG_V = 1;
  const $ = id => document.getElementById(id);
  const root = $('embed');

  // データが読めないときは、ひとことと「もっと遊ぶ」だけにする
  function fail(e) {
    console.error('[embed] 読みこめませんでした', e);
    const more = $('e-more'), p = document.createElement('p');
    p.className = 'e-err'; p.textContent = '読みこめませんでした';
    root.replaceChildren(p, more);
  }

  // 国旗の img。読めなければ文字の代わりの表示に入れかえる（ボタンは押せるまま）
  function flagImg(a) {
    const img = document.createElement('img');
    img.onerror = () => {
      const s = document.createElement('span');
      s.className = 'e-noflag'; s.textContent = '国旗を表示できません';
      img.replaceWith(s);
    };
    img.decoding = 'async';
    img.src = `flags/${a}.svg?v=${FLAG_V}`;
    return img;
  }

  function start() {
    const C = window.COUNTRIES, D = window.DAILY_CORE;
    if (!Array.isArray(C) || typeof D?.oneOfDay !== 'function') throw new Error('COUNTRIES か DAILY_CORE.oneOfDay が無い');
    const by = new Map(C.map(c => [c.a, c]));
    const q = D.oneOfDay(D.jstDay(), C);
    const msg = $('e-msg'), links = $('e-links'), again = $('e-again');

    $('e-q').textContent = q.mode === 'f2n' ? 'この国旗はどこの国？' : 'この国の国旗は？';
    const prompt = $('e-prompt');
    if (q.mode === 'f2n') { const img = flagImg(q.a); img.alt = '今日の国旗'; prompt.replaceChildren(img); }
    else prompt.textContent = by.get(q.a).n;

    const buttons = q.opts.map((a, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'e-opt'; b.dataset.a = a;
      if (q.mode === 'f2n') b.textContent = by.get(a).n;
      else { const img = flagImg(a); img.alt = ''; b.setAttribute('aria-label', `選択肢${i + 1}`); b.append(img); }
      b.addEventListener('click', () => answer(b));
      return b;
    });
    $('e-opts').replaceChildren(...buttons);

    function answer(b) {
      if (b.dataset.a === q.a) {
        b.classList.add('ok');
        for (const x of buttons) x.disabled = true;
        msg.textContent = 'せいかい！'; msg.className = 'ok';
        again.hidden = false;
      } else {
        b.classList.add('ng'); b.disabled = true;
        msg.textContent = 'ちがうよ。もう一度えらんでね'; msg.className = 'ng';
      }
      links.hidden = false;
    }
    again.addEventListener('click', () => {
      for (const x of buttons) { x.disabled = false; x.classList.remove('ok', 'ng'); }
      msg.textContent = ''; msg.className = '';
      again.hidden = true; links.hidden = true;
      buttons[0].focus();
    });
  }

  try { start(); } catch (e) { fail(e); }
})();
