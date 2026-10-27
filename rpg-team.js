(() => {
  'use strict';
  // 国旗クエストの編成画面（#scr-team）と RPG.openTeam。枠のタブ（買い足し）・名前・3枠・［おまかせ］・強さとチームボーナス・仲間の一覧
  // rpg-battle.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）。
  // セーブ・コイン・画面の切りかえなど rpg.js の部品と、仲間のカード（rpg-cards.js の RPG.cardHTML）は window.RPG を通して使う

  // rpg.js と rpg-cards.js が起動していなければ何もしない（知らせるのは rpg.js と rpg-battle.js）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function' || typeof RPG.cardHTML !== 'function') return;

  const K = RPG_CORE, T = K.TUNING, TM = T.team, DG = K.DUNGEONS, COIN = RPG.COIN, TOTAL = C.length, BOSS = 5;
  const AREAS = ['all', ...K.REGION_DUNGEONS.map(g => g.r)];
  const inArea = (a, r) => r === 'all' || byA.get(a)?.r === r;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const pct = b => `＋${Math.round(b * 100)}%`;

  const HTML = '<div class="rpg-head"><button type="button" class="linkbtn rpg-back" id="tm-back">← 冒険</button><h2 class="rpg-h2">編成</h2><span class="rpg-hcoin" id="tm-coins"></span></div>'
    + '<div class="tm-side" id="tm-side"><p class="rpg-warn" id="tm-warn" role="status" hidden></p>'
    + '<div class="tm-tabs" id="tm-tabs" role="group" aria-label="編成の枠"></div>'
    + '<div class="tm-namerow"><b class="tm-title" id="tm-title"></b>'
    + `<input type="text" class="tm-name" id="tm-name" maxlength="${TM.nameMax}" autocomplete="off" aria-label="編成の名前" hidden>`
    + '<button type="button" class="linkbtn tm-rename" id="tm-rename" aria-label="名前を変える">✏️</button><span class="tm-note" id="tm-note" hidden>まだ組んでないよ（強い順の3枚で戦う）</span></div>'
    + '<div class="tm-slots" id="tm-slots"></div>'
    + '<p class="tm-dgrow"><label for="tm-dg">ダンジョン:</label> <select id="tm-dg"></select></p>'
    + '<p class="tm-stats" id="tm-stats" aria-live="polite"></p>'
    + '<div class="tm-btns"><button type="button" class="btn ghost" id="tm-auto">おまかせ</button></div>'
    + '<p class="hint">同じグループの仲間が2枚で＋10%、3枚で＋25%（こうげき・HP）</p></div>'
    + '<div class="tm-main" id="tm-main"><p class="rpg-lbl" id="tm-count"></p>'
    + `<div class="chips" id="tm-regions" role="group" aria-label="地域でしぼりこむ">${AREAS.map(r => `<button type="button" class="chip" aria-pressed="false" data-r="${r}">${r === 'all' ? 'すべて' : r}</button>`).join('')}</div>`
    + `<div class="tm-none" id="tm-none" hidden><p class="hint">仲間がいると強くなるよ（国旗ガチャ・${T.card.frJoin}回正解）</p><button type="button" class="btn" id="tm-gacha">国旗ガチャへ</button></div>`
    + '<div class="rpg-cd-grid tm-grid" id="tm-grid"></div></div>';

  // dg: 強さを見るダンジョン（保存しない。開くたびに次に挑むダンジョン）。region: 一覧のしぼりこみ。back: バトルの登場画面から来たとき { id, floor }
  let dg = '', region = 'all', back = null, renaming = false, gridKey = '';
  const firstDg = () => {
    const nf = RPG.nextFloor(RPG.get());
    return nf?.id ?? DG[DG.length - 1].id;
  };
  const floorOf = (d, id) => Math.min(BOSS, ((d.floors || {})[id] || 0) + 1);
  const stop = () => RPG.status === 'readOnly';
  const slotOf = d => { const ts = Array.isArray(d.teams) && d.teams.length ? d.teams : [{ n: '編成1', c: null }]; const t = Math.min(Math.max(0, d.tsel | 0), ts.length - 1); return { ts, t, tm: ts[t] }; };
  // 枠の中身（持っている国だけ）。まだ組んでいない枠（c === null）なら、いまのダンジョンで強い順の3枚
  const members = (d, t) => K.teamParty(d, dg, t).map(p => p.a);

  const tabsHTML = (d, ts, t) => {
    const ro = stop(), cost = K.slotCost(d);
    let s = '';
    for (let i = 0; i < TM.slots; i++) {
      if (i < ts.length) { s += `<button type="button" data-t="${i}" aria-pressed="${i === t}"${ro ? ' disabled' : ''}>${esc(ts[i].n)}</button>`; continue; }
      if (i === ts.length && cost != null) {
        const short = cost - d.coins;
        s += `<button type="button" data-t="${i}" data-buy aria-label="枠を買う ${fmt(cost)}コイン${short > 0 ? `（あと${fmt(short)}）` : ''}"${ro || short > 0 ? ' disabled' : ''}>🔒${COIN}${fmt(cost)}`
          + `${short > 0 ? `<small class="rpg-short">あと${COIN}${fmt(short)}</small>` : ''}</button>`;
      } else s += `<button type="button" data-t="${i}" data-buy disabled aria-label="まだ買えない枠">🔒</button>`;
    }
    return s;
  };
  const slotsHTML = (d, as) => {
    const ro = stop(), out = [];
    for (const a of as.filter(a => byA.has(a))) {
      const star = d.cards[a]?.[0] || 1, nm = esc(byA.get(a).n);
      out.push(`<button type="button" class="rpg-pc" data-a="${a}" aria-label="${nm}（外す）"${ro ? ' disabled' : ''}><img src="${flag(a)}" alt="">`
        + `<span class="rpg-stars" aria-hidden="true">${'★'.repeat(star)}</span><span class="tm-pn">${nm}</span></button>`);
    }
    while (out.length < 3) out.push('<span class="tm-empty">空き</span>');
    return out.join('');
  };
  const statsHTML = (d, t) => {
    const st = K.battleStats(d, dg, back && back.id === dg ? back.floor : floorOf(d, dg), t), tb = st.team;
    return `<span>⚔️ ${fmt(st.atk)}</span> <span>❤️ ${fmt(st.hp)}</span> `
      + (tb.bonus > 0 ? `<span class="tm-bonus">チーム ${esc(tb.group)}×${tb.n} ${pct(tb.bonus)}</span>` : '<span class="tm-nobonus">チームボーナスなし</span>');
  };
  // 一覧: 持っている仲間だけ。選んだダンジョンでのこうげき（地域ボーナスこみ）が高い順 → ★ → 国コード
  const gridHTML = (d, inSet) => {
    const g = K.dungeonOf(dg), fr = d.fr || {}, ro = stop();
    const atk = a => K.cardAtk(d.cards[a], fr[a], !!g && (g.r === 'all' || byA.get(a)?.r === g.r));
    return Object.keys(d.cards).filter(a => byA.has(a) && inArea(a, region))
      .map(a => ({ a, atk: atk(a), star: d.cards[a][0] }))
      .sort((x, y) => y.atk - x.atk || y.star - x.star || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
      .map(({ a }) => {
        const inn = inSet.has(a);
        let h = RPG.cardHTML(a, d, { lazy: true, label: inn ? '✓ 編成中' : '' });
        if (inn) h = h.replace('class="rpg-card ', 'class="rpg-card is-in ');
        if (ro) h = h.replace('<button type="button"', '<button type="button" disabled');
        return `<div class="tm-cell">${h}<span class="tm-grp">${esc(K.groupOf(a) ?? '')}</span></div>`;
      }).join('');
  };

  // 描く（開いたとき・書いたあと・RPG.refresh）。名前を入れているあいだは名前の欄はさわらない。一覧は中身が変わったときだけ作り直す
  const draw = (d = RPG.get()) => {
    const sec = $('scr-team');
    if (!sec) return;
    const { ts, t, tm } = slotOf(d), ro = stop(), untouched = !Array.isArray(tm.c), as = members(d, t), n = K.owned(d);
    const focus = sec.contains(document.activeElement) ? document.activeElement : null;
    const fsel = focus?.dataset.a ? `${focus.closest('#tm-grid') ? '#tm-grid .rpg-card' : '#tm-slots .rpg-pc'}[data-a="${focus.dataset.a}"]`
      : focus?.dataset.t ? `#tm-tabs [data-t="${focus.dataset.t}"]` : '';
    $('tm-back').textContent = back ? '← バトルにもどる' : '← 冒険';
    $('tm-coins').innerHTML = RPG.coinHTML(d.coins);
    $('tm-warn').textContent = RPG.warn;
    $('tm-warn').hidden = !RPG.warn;
    $('tm-tabs').innerHTML = tabsHTML(d, ts, t);
    if (!renaming) { $('tm-title').textContent = tm.n; $('tm-title').hidden = false; $('tm-name').hidden = true; $('tm-rename').hidden = false; }
    $('tm-rename').disabled = ro;
    $('tm-note').hidden = !untouched;
    $('tm-slots').innerHTML = slotsHTML(d, as);
    const sel = $('tm-dg');
    if (!sel.options.length) sel.innerHTML = DG.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
    sel.value = dg;
    $('tm-stats').innerHTML = statsHTML(d, t);
    $('tm-auto').disabled = ro || !n;
    $('tm-count').textContent = `仲間 ${n}/${TOTAL}`;
    for (const b of $('tm-regions').children) b.setAttribute('aria-pressed', String(b.dataset.r === region));
    $('tm-none').hidden = n > 0;
    $('tm-regions').hidden = !n;
    const inSet = new Set(as), key = JSON.stringify([d.cards, d.fr, dg, region, [...inSet], ro]);
    if (key !== gridKey) { gridKey = key; $('tm-grid').innerHTML = gridHTML(d, inSet); }
    if (fsel && !sec.contains(document.activeElement)) sec.querySelector(fsel)?.focus({ preventScroll: true });
  };

  // ---- 書く（どれも RPG.tx の中で。新しい版のデータのあいだは何もしない） ----
  // 枠 t の中身を f(いまの中身) で書きかえる。まだ組んでいない枠なら、強い順の3枚を入れたことにしてから。持っていない国はここで外す
  const edit = f => {
    if (stop()) return;
    let full = false;
    RPG.tx(x => {
      const { t, tm } = slotOf(x);
      if (!Array.isArray(x.teams) || !x.teams[t]) return;
      const cur = Array.isArray(tm.c) ? tm.c.filter(a => has(x.cards, a)) : K.party(x, dg).map(p => p.a);
      const next = f(cur, x);
      if (next === null) { full = true; return; }
      x.teams[t].c = next;
    });
    if (full) toast('入れ替えたいカードを先に外してね');
    draw();
  };
  const toggle = a => edit(cur => cur.includes(a) ? cur.filter(x => x !== a) : cur.length >= 3 ? null : [...cur, a]);
  const remove = a => edit(cur => cur.filter(x => x !== a));
  // ［おまかせ］: 選んでいるダンジョンで強い順の3枚（K.party と同じ並び。チームは考えない）を、ふつうの編成として入れる。null には戻さない
  const autoFill = () => edit((_, x) => K.party(x, dg).map(p => p.a));
  const pick = i => {
    if (stop()) return;
    RPG.tx(x => { if (Array.isArray(x.teams) && i >= 0 && i < x.teams.length) x.tsel = i; });
    draw();
  };
  const buy = () => {
    const cost = K.slotCost(RPG.get());
    if (stop() || cost == null || RPG.get().coins < cost) return;
    if (!confirm(`●${fmt(cost)} で編成の枠を1つ増やす？`)) return;
    const paid = RPG.tx(x => K.buySlot(x));
    if (paid > 0 && RPG.wrote) RPG.emitCoins(RPG.get(), -paid, 'slot');
    draw();
  };
  // 名前: ✏️ で入力欄に。Enter／欄の外で確定、Esc で取り消し
  const startRename = () => {
    if (stop()) return;
    const inp = $('tm-name');
    renaming = true;
    inp.value = slotOf(RPG.get()).tm.n;
    $('tm-title').hidden = true; $('tm-rename').hidden = true; inp.hidden = false;
    inp.focus();
    inp.select();
  };
  const endRename = (save, refocus) => {
    if (!renaming) return;
    renaming = false;
    const v = $('tm-name').value;
    if (save && !stop()) RPG.tx(x => {
      const { t } = slotOf(x);
      if (!x.teams?.[t]) return;
      x.teams[t].n = [...String(v).trim()].slice(0, TM.nameMax).join('') || `編成${t + 1}`;
    });
    draw();
    if (refocus) $('tm-rename').focus({ preventScroll: true });
  };

  const bind = () => {
    $('tm-back').onclick = () => { if (back) RPG.open('battle', { ...back }); else show('rpg'); };
    $('tm-tabs').onclick = e => {
      const b = e.target.closest('button[data-t]');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-buy')) buy(); else pick(+b.dataset.t);
    };
    $('tm-slots').onclick = e => { const b = e.target.closest('.rpg-pc[data-a]'); if (b && !b.disabled) remove(b.dataset.a); };
    $('tm-grid').onclick = e => { const b = e.target.closest('.rpg-card[data-a]'); if (b && !b.disabled) toggle(b.dataset.a); };
    $('tm-dg').onchange = e => { if (K.dungeonOf(e.target.value)) { dg = e.target.value; draw(); } };
    $('tm-auto').onclick = autoFill;
    $('tm-rename').onclick = startRename;
    $('tm-name').onkeydown = e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); endRename(true, true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endRename(false, true); }
    };
    $('tm-name').onblur = () => endRename(true, false);
    $('tm-regions').onclick = e => {
      const b = e.target.closest('.chip');
      if (!b || !AREAS.includes(b.dataset.r)) return;
      region = b.dataset.r;
      draw();
    };
    $('tm-gacha').onclick = () => RPG.open('gacha');
  };

  // screenRender.team: RPG.open('team', { back: { id, floor } }) ならバトルにもどる。ダンジョンは back のもの、無ければ次に挑むダンジョン
  const render = () => {
    const o = RPG.opts || {}, b = o.back;
    RPG.opts = {};
    back = b && K.dungeonOf(b.id) && Number.isInteger(+b.floor) && +b.floor >= 1 && +b.floor <= BOSS ? { id: b.id, floor: +b.floor } : null;
    dg = back?.id ?? firstDg();
    renaming = false;
    gridKey = '';
    draw();
  };

  /* ---------- window.RPG に足す・画面を登録する ---------- */
  // redraw は rpg.js の refresh が呼ぶ。編成画面なら自分で描き、ほかは rpg-cards.js の redraw に渡す
  const redraw0 = RPG.redraw;
  Object.assign(RPG, {
    openTeam: bk => RPG.open('team', bk ? { back: bk } : {}),
    redraw: (screen, d) => { if (screen === 'team') draw(d); else redraw0(screen, d); },
  });
  const wrap = document.querySelector('body > .wrap'), foot = wrap?.querySelector(':scope > footer');
  if (!wrap) return;
  const sec = document.createElement('section');
  sec.id = 'scr-team'; sec.className = 'wrap'; sec.hidden = true; sec.innerHTML = HTML;
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('team', render);
  bind();
})();
