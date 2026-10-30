(() => {
  'use strict';
  // 国旗クエストの編成画面（#scr-team）と RPG.openTeam。枠のタブ（買い足し）・名前・3枠・［おまかせ］・強さとチームボーナス・仲間の一覧
  // rpg-battle.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）。
  // セーブ・コイン・画面の切りかえなど rpg.js の部品と、仲間のカード（rpg-cards.js の RPG.cardHTML）は window.RPG を通して使う
  // 画面の文は全部 T()（英語のページは i18n/en-rpg-cards.js。'← 冒険'・'編成'・'編成{n}'・'仲間 {n}/{total}'・'あと{coins}' は en-rpg.js）。
  // 国名は cName、地域・グループ名は T(r)、ダンジョン名は RPG.dgName。編成の名前は RPG.teamLabel（既定の '編成1' は英語で Team 1、
  // 自分で付けた名前は data-ugc）、保存は RPG.teamSaveName（英語の Team 2 のままならセーブは '編成2'）

  // rpg.js と rpg-cards.js が起動していなければ何もしない（知らせるのは rpg.js と rpg-battle.js）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function' || typeof RPG.cardHTML !== 'function') return;

  const K = RPG_CORE, U = K.TUNING, TM = U.team, DG = K.DUNGEONS, COIN = RPG.COIN, TOTAL = C.length, BOSS = 5;
  const AREAS = ['all', ...K.REGION_DUNGEONS.map(g => g.r)];
  const inArea = (a, r) => r === 'all' || byA.get(a)?.r === r;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const EN = LANG === 'en';
  const pct = b => T('＋{p}%', { p: Math.round(b * 100) });
  // 編成の名前の表示（既定の名前は T、自分で付けた名前は data-ugc）
  const teamName = (n, i) => { const l = RPG.teamLabel(n, i); return l.ugc ? `<span data-ugc>${esc(l.text)}</span>` : esc(l.text); };

  // ✏️ の aria-label: 日本語は今のまま '名前を変える'。英語は en-profile.js の '名前を変える'（Change nickname）とは別の意味なので、別のキー
  const renameLabel = EN ? T('編成の名前を変える') : T('名前を変える');
  const HTML = `<div class="rpg-head"><button type="button" class="linkbtn rpg-back" id="tm-back">${T('← 冒険')}</button><h2 class="rpg-h2">${T('編成')}</h2><span class="rpg-hcoin" id="tm-coins"></span></div>`
    + '<div class="tm-side" id="tm-side"><p class="rpg-warn" id="tm-warn" role="status" hidden></p>'
    + `<div class="tm-tabs" id="tm-tabs" role="group" aria-label="${T('編成の枠')}"></div>`
    + '<div class="tm-namerow"><b class="tm-title" id="tm-title"></b>'
    + `<input type="text" class="tm-name" id="tm-name" maxlength="${TM.nameMax}" autocomplete="off" aria-label="${T('編成の名前')}" hidden>`
    + `<button type="button" class="linkbtn tm-rename" id="tm-rename" aria-label="${renameLabel}">✏️</button><span class="tm-note" id="tm-note" hidden>${T('まだ組んでないよ（強い順の3枚で戦う）')}</span></div>`
    + '<div class="tm-slots" id="tm-slots"></div>'
    + `<p class="tm-dgrow"><label for="tm-dg">${T('ダンジョン:')}</label> <select id="tm-dg"></select></p>`
    + '<p class="tm-stats" id="tm-stats" aria-live="polite"></p>'
    + `<div class="tm-btns"><button type="button" class="btn ghost" id="tm-auto">${T('おまかせ')}</button></div>`
    + `<p class="hint">${T('同じグループの仲間が2枚で＋10%、3枚で＋25%（こうげき・HP）')}</p></div>`
    + '<div class="tm-main" id="tm-main"><p class="rpg-lbl" id="tm-count"></p>'
    + `<div class="chips" id="tm-regions" role="group" aria-label="${T('地域でしぼりこむ')}">${AREAS.map(r => `<button type="button" class="chip" aria-pressed="false" data-r="${r}">${r === 'all' ? T('すべて') : esc(T(r))}</button>`).join('')}</div>`
    + `<div class="tm-none" id="tm-none" hidden><p class="hint">${T('仲間がいると強くなるよ（国旗ガチャ・{n}回正解）', { n: U.card.frJoin })}</p><button type="button" class="btn" id="tm-gacha">${T('国旗ガチャへ')}</button></div>`
    + '<div class="rpg-cd-grid tm-grid" id="tm-grid"></div></div>';

  // dg: 強さを見るダンジョン（保存しない。開くたびに次に挑むダンジョン）。region: 一覧のしぼりこみ。back: バトルの登場画面から来たとき { id, floor }
  let dg = '', region = 'all', back = null, renaming = false, gridKey = '';
  const firstDg = () => {
    const nf = RPG.nextFloor(RPG.get());
    return nf?.id ?? DG[DG.length - 1].id;
  };
  const floorOf = (d, id) => Math.min(BOSS, ((d.floors || {})[id] || 0) + 1);
  const stop = () => RPG.status === 'readOnly';
  const slotOf = d => { const ts = Array.isArray(d.teams) && d.teams.length ? d.teams : [{ n: K.defaultTeamName(0), c: null }]; const t = Math.min(Math.max(0, d.tsel | 0), ts.length - 1); return { ts, t, tm: ts[t] }; };
  // 枠の中身（持っている国だけ）。まだ組んでいない枠（c === null）なら、いまのダンジョンで強い順の3枚
  const members = (d, t) => K.teamParty(d, dg, t).map(p => p.a);

  const tabsHTML = (d, ts, t) => {
    const ro = stop(), cost = K.slotCost(d);
    let s = '';
    for (let i = 0; i < TM.slots; i++) {
      if (i < ts.length) { s += `<button type="button" data-t="${i}" aria-pressed="${i === t}"${ro ? ' disabled' : ''}>${teamName(ts[i].n, i)}</button>`; continue; }
      if (i === ts.length && cost != null) {
        const short = cost - d.coins;
        const label = short > 0 ? T('枠を買う {cost}コイン（あと{short}）', { cost: fmt(cost), short: fmt(short) }) : T('枠を買う {cost}コイン', { cost: fmt(cost) });
        s += `<button type="button" data-t="${i}" data-buy aria-label="${label}"${ro || short > 0 ? ' disabled' : ''}>🔒${COIN}${fmt(cost)}`
          + `${short > 0 ? `<small class="rpg-short">${T('あと{coins}', { coins: COIN + fmt(short) })}</small>` : ''}</button>`;
      } else s += `<button type="button" data-t="${i}" data-buy disabled aria-label="${T('まだ買えない枠')}">🔒</button>`;
    }
    return s;
  };
  const slotsHTML = (d, as) => {
    const ro = stop(), out = [];
    for (const a of as.filter(a => byA.has(a))) {
      const star = d.cards[a]?.[0] || 1, nm = esc(cName(byA.get(a)));
      out.push(`<button type="button" class="rpg-pc" data-a="${a}" aria-label="${T('{name}（外す）', { name: nm })}"${ro ? ' disabled' : ''}><img src="${flag(a)}" alt="">`
        + `<span class="rpg-stars" aria-hidden="true">${'★'.repeat(star)}</span><span class="tm-pn">${nm}</span></button>`);
    }
    while (out.length < 3) out.push(`<span class="tm-empty">${T('空き')}</span>`);
    return out.join('');
  };
  const statsHTML = (d, t) => {
    const st = K.battleStats(d, dg, back && back.id === dg ? back.floor : floorOf(d, dg), t), tb = st.team;
    return `<span>⚔️ ${fmt(st.atk)}</span> <span>❤️ ${fmt(st.hp)}</span> `
      + (tb.bonus > 0 ? `<span class="tm-bonus">${T('チーム {group}×{n} {pct}', { group: esc(T(tb.group)), n: tb.n, pct: pct(tb.bonus) })}</span>`
        : `<span class="tm-nobonus">${T('チームボーナスなし')}</span>`);
  };
  // 一覧: 持っている仲間だけ。選んだダンジョンでのこうげき（地域ボーナスこみ）が高い順 → ★ → 国コード
  const gridHTML = (d, inSet) => {
    const g = K.dungeonOf(dg), fr = d.fr || {}, ro = stop();
    const atk = a => K.cardAtk(d.cards[a], fr[a], !!g && K.inDungeon(g, a));
    return Object.keys(d.cards).filter(a => byA.has(a) && inArea(a, region))
      .map(a => ({ a, atk: atk(a), star: d.cards[a][0] }))
      .sort((x, y) => y.atk - x.atk || y.star - x.star || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0))
      .map(({ a }) => {
        const inn = inSet.has(a);
        let h = RPG.cardHTML(a, d, { lazy: true, label: inn ? T('✓ 編成中') : '' });
        if (inn) h = h.replace('class="rpg-card ', 'class="rpg-card is-in ');
        if (ro) h = h.replace('<button type="button"', '<button type="button" disabled');
        return `<div class="tm-cell">${h}<span class="tm-grp">${esc(K.groupOf(a) ? T(K.groupOf(a)) : '')}</span></div>`;
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
    $('tm-back').textContent = back ? T('← バトルにもどる') : T('← 冒険');
    $('tm-coins').innerHTML = RPG.coinHTML(d.coins);
    $('tm-warn').textContent = RPG.warn;
    $('tm-warn').hidden = !RPG.warn;
    $('tm-tabs').innerHTML = tabsHTML(d, ts, t);
    if (!renaming) { $('tm-title').innerHTML = teamName(tm.n, t); $('tm-title').hidden = false; $('tm-name').hidden = true; $('tm-rename').hidden = false; }
    $('tm-rename').disabled = ro;
    $('tm-note').hidden = !untouched;
    $('tm-slots').innerHTML = slotsHTML(d, as);
    const sel = $('tm-dg');
    if (!sel.options.length) sel.innerHTML = DG.map(g => `<option value="${g.id}">${esc(RPG.dgName(g))}</option>`).join('');
    sel.value = dg;
    $('tm-stats').innerHTML = statsHTML(d, t);
    $('tm-auto').disabled = ro || !n;
    $('tm-count').textContent = T('仲間 {n}/{total}', { n, total: TOTAL });
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
    if (full) toast(T('入れ替えたいカードを先に外してね'));
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
    if (!confirm(T('●{cost} で編成の枠を1つ増やす？', { cost: fmt(cost) }))) return;
    const paid = RPG.tx(x => K.buySlot(x));
    if (paid > 0 && RPG.wrote) RPG.emitCoins(RPG.get(), -paid, 'slot');
    draw();
  };
  // 名前: ✏️ で入力欄に。Enter／欄の外で確定、Esc で取り消し
  const startRename = () => {
    if (stop()) return;
    const inp = $('tm-name');
    renaming = true;
    const { t, tm } = slotOf(RPG.get());
    inp.value = RPG.teamLabel(tm.n, t).text;
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
      // 表示の既定の名前（英語の Team 2）のまま・空なら、セーブは日本語の既定の名前（'編成2'）
      x.teams[t].n = RPG.teamSaveName([...String(v).trim()].slice(0, TM.nameMax).join('') || K.defaultTeamName(t), t);
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
