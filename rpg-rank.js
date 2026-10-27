(() => {
  'use strict';
  // 冒険（国旗クエスト）のランキング（#scr-rpgrank）: 旅人のレベル順と、クリアしたダンジョンの数の順。
  // 記録は Supabase の rpg_scores（supabase/schema.sql の submit_rpg / top_rpg / rpg_rank_of）。同じニックネームは自己ベストだけ出る。
  // rpg.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // rpg.js が起動していない・ランキングの接続先が無いときは何もしない（冒険ホームにランキングの入口が出ないだけ）
  const RPG = window.RPG;
  if (typeof RPG?.tx !== 'function' || !window.RANKING?.enabled || typeof RANKING.rpgTop !== 'function') return;

  const K = RPG_CORE, DG = K.DUNGEONS, BOSS = 5, MAX_FLOORS = DG.length * BOSS;
  // いまのセーブの記録: レベル・ボスを倒したダンジョンの数・クリアしたフロアの合計
  const recordOf = d => {
    const fl = DG.map(g => Math.max(0, Math.min(BOSS, (d.floors || {})[g.id] || 0)));
    return { lv: d.lv, dungeons: fl.filter(n => n >= BOSS).length, floors: fl.reduce((s, n) => s + n, 0) };
  };
  const SORTS = { lv: 'レベル', dg: 'ダンジョン' };
  // 自動更新: 1回載せたら、ニックネームと最後に送った記録を localStorage（キー rpgRank）に覚えておき、
  // レベルアップ・バトルの勝ち（新しいフロア・ボス）・起動時に記録が変わっていれば送り直す。
  // DB は同じ名前の10秒以内の連投を断る（too_soon）ので、前に送ってから GAP ミリ秒あける。通信の失敗は次のきっかけで送り直す
  const KEY = 'rpgRank', GAP = 11000, WAIT = 1500;
  const reg = () => { const r = store.get(KEY, null); return r && typeof r.name === 'string' && r.name ? r : null; };
  const same = (x, y) => x.lv === y.lv && x.dungeons === y.dungeons && x.floors === y.floors;
  const ranks = r => `レベル順 ${r.rankLv}位・ダンジョン順 ${r.rankDg}位`;
  let autoTimer = null, lastSent = 0, sending = false;
  // 登録していて、送った記録といまの記録がちがえば、少し待ってから送る（続けて上がったら1回にまとめる）
  const scheduleAuto = () => {
    const r = reg(), d = RPG.get();
    if (!r || !d.intro || (r.sent && same(r.sent, recordOf(d)))) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(sendAuto, Math.max(WAIT, lastSent + GAP - Date.now()));
  };
  const sendAuto = async () => {
    autoTimer = null;
    const r = reg(), d = RPG.get();
    if (!r || !d.intro || sending) return;
    const rec = recordOf(d);
    if (r.sent && same(r.sent, rec)) return;
    sending = true; lastSent = Date.now();
    const res = await RANKING.rpgSubmit({ nickname: r.name, ...rec });
    sending = false;
    if (res.ok) {
      if (reg()?.name === r.name) store.set(KEY, { name: r.name, sent: rec });
      if (document.body.dataset.screen === 'rpgrank') { drawMe(); load(); }
      scheduleAuto();   // 送っているあいだにまた上がっていたら
    } else if (res.reason === 'too_soon') scheduleAuto();
    else console.warn('ranking auto', res.reason);   // つながらない・断られたら、次のきっかけまで待つ
  };

  const HTML = '<div class="rpg-head"><button type="button" class="linkbtn rpg-back">← 冒険</button><h2 class="rpg-h2">冒険ランキング</h2></div>'
    + '<div class="rpg-rr-cols"><div class="rpg-rr-side">'
    + '<div class="rpg-rr-me" id="rr-me"></div><p class="tarank" id="rr-rank"></p>'
    + '<form class="taform" id="rr-form" novalidate><div class="row"><input id="rr-name" type="text" autocomplete="nickname" enterkeyhint="send" placeholder="ニックネーム（12文字まで）">'
    + '<button class="btn" id="rr-submit">載せる</button></div></form><p class="tamsg" id="rr-msg" role="status"></p>'
    + '<div class="rpg-rr-auto" id="rr-auto" hidden><p>✅ <b id="rr-auto-name"></b> で登録ずみ。レベルアップやダンジョンクリアのたびに自動で記録が新しくなるよ</p>'
    + '<button type="button" class="linkbtn" id="rr-stop">自動で更新するのをやめる</button></div>'
    + '<p class="hint">1回載せると、そのあとは自動で記録が新しくなる（同じニックネームは自己ベストだけ出る）</p></div>'
    + '<div class="rpg-rr-main"><div class="seg" id="rr-tabs" role="group" aria-label="並べ方">'
    + Object.entries(SORTS).map(([k, v]) => `<button type="button" data-s="${k}">${v}</button>`).join('') + '</div>'
    + '<p class="hint" id="rr-how"></p>'
    + '<ol class="rklist rpg-rr-list" id="rr-list" aria-busy="false"></ol>'
    + '<p class="rkempty" id="rr-empty" hidden>まだ誰もいない。1位のチャンス！</p>'
    + '<div class="rkerror" id="rr-error" hidden><p>ランキングに接続できなかった</p><button class="btn ghost" id="rr-retry">再読み込み</button></div></div></div>';
  const HOW = { lv: '上位50人まで。レベル → クリアしたダンジョン → フロアの順', dg: '上位50人まで。クリアしたダンジョン → フロア → レベルの順' };

  const R = { sort: 'lv', seq: 0 };
  // 日付は日本時間で（タイムアタックのランキングとそろえる）
  const jstDay = d => { const j = new Date(d.getTime() + 9 * 3600e3); return `${j.getUTCMonth() + 1}/${j.getUTCDate()}`; };
  const recText = r => `ダンジョン ${r.dungeons}/${DG.length}（フロア ${r.floors}/${MAX_FLOORS}）`;

  const drawMe = () => {
    const d = RPG.get(), r = recordOf(d), form = $('rr-form');
    $('rr-me').innerHTML = d.intro
      ? `<p class="rpg-rr-h">きみの記録</p><p class="rpg-rr-rec"><b>Lv ${r.lv}</b><span>${recText(r)}</span></p>`
      : '<p class="rpg-rr-h">まだ旅に出ていないよ</p><p class="hint">冒険を始めると、レベルとクリアしたダンジョンでランキングに載せられる</p>';
    form.hidden = !d.intro;
    const g = reg();
    $('rr-auto').hidden = !d.intro || !g;
    if (g) $('rr-auto-name').textContent = g.name;
    $('rr-submit').textContent = g ? '名前を変えて載せる' : '載せる';
    $('rr-rank').textContent = '';
    if (!d.intro) return;
    // 何位相当か（失敗したら何も出さない。原因はコンソール）
    const want = { ...r };
    RANKING.rpgRankOf(want).then(x => { if (same(recordOf(RPG.get()), want) && $('rr-rank')) $('rr-rank').textContent = `${ranks(x)} 相当`; },
      e => console.warn('ranking rpgRankOf', e));
  };
  // 読み込み中は表を薄くするだけ。返事が前後しても、最後に頼んだ並べ方の表だけを出す
  const load = async () => {
    const seq = ++R.seq, list = $('rr-list');
    list.setAttribute('aria-busy', 'true'); $('rr-retry').disabled = true;
    let rows = null;
    try { rows = await RANKING.rpgTop({ sort: R.sort }); } catch (e) { console.warn('ranking rpgTop', e); }
    if (seq !== R.seq) return;
    list.setAttribute('aria-busy', 'false'); $('rr-retry').disabled = false;
    $('rr-error').hidden = !!rows;
    $('rr-empty').hidden = !rows || rows.length > 0;
    // 同じ記録は同じ順位（rpg_rank_of の「自分より上の人数＋1」とそろえる）
    let no = 0;
    list.innerHTML = (rows ?? []).map((r, i) => {
      if (!i || !same(r, rows[i - 1])) no = i + 1;
      const lv = `<span class="mono rpg-rr-lv">Lv ${r.lv}</span>`, dg = `<span class="mono rpg-rr-dg">🏰${r.dungeons}<small>・F${r.floors}</small></span>`;
      return `<li${no <= 3 ? ' class="top"' : ''}><span class="no">${no}</span><span class="nick">${esc(r.nickname)}</span>`
        + `${R.sort === 'lv' ? lv + dg : dg + lv}<span class="mono at">${jstDay(r.at)}</span></li>`;
    }).join('');
  };
  const render = () => {
    const o = RPG.opts || {};
    if (o.sort in SORTS) R.sort = o.sort;
    for (const b of $('rr-tabs').children) b.setAttribute('aria-pressed', String(b.dataset.s === R.sort));
    $('rr-how').textContent = HOW[R.sort];
    $('rr-name').value = store.get('nickname', '') || '';
    $('rr-msg').textContent = ''; $('rr-msg').className = 'tamsg';
    drawMe();
    load();
  };

  const sec = document.createElement('section');
  sec.id = 'scr-rpgrank'; sec.className = 'wrap'; sec.hidden = true; sec.innerHTML = HTML;
  const wrap = document.querySelector('body > .wrap'), foot = wrap?.querySelector(':scope > footer');
  if (!wrap) return;
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('rpgrank', render);

  sec.querySelector('.rpg-back').onclick = () => show('rpg');
  $('rr-tabs').onclick = e => {
    const b = e.target.closest('button');
    if (!b || !(b.dataset.s in SORTS)) return;
    R.sort = b.dataset.s;
    RPG.opts = { sort: R.sort };
    for (const x of $('rr-tabs').children) x.setAttribute('aria-pressed', String(x.dataset.s === R.sort));
    $('rr-how').textContent = HOW[R.sort];
    load();
  };
  $('rr-retry').onclick = () => load();
  $('rr-stop').onclick = () => {
    try { localStorage.removeItem(KEY); } catch {}
    clearTimeout(autoTimer); autoTimer = null;
    drawMe();
    $('rr-msg').textContent = '自動で更新するのをやめたよ（載っている記録はそのまま）'; $('rr-msg').className = 'tamsg';
  };
  // きっかけ: レベルアップ・バトルに勝った（新しいフロアやボス）・別のタブがセーブを書いた・起動時
  document.addEventListener('rpg:levelup', () => { try { scheduleAuto(); } catch (e) { console.error('[rpg]', e); } });
  document.addEventListener('rpg:battle', e => { try { if (e.detail?.win) scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  window.addEventListener('storage', e => { if (e.key === 'rpg') try { scheduleAuto(); } catch (err) { console.error('[rpg]', err); } });
  scheduleAuto();
  $('rr-form').onsubmit = async e => {
    e.preventDefault();
    const btn = $('rr-submit'), msg = $('rr-msg');
    const say = (text, cls = '') => { msg.textContent = text; msg.className = `tamsg ${cls}`; };
    const fail = reason => { say(RANKING.message(reason), 'ng'); btn.textContent = 'もう一回送る'; };
    const chk = RANKING.checkName($('rr-name').value);
    if (!chk.ok) return fail(chk.reason);
    const d = RPG.get();
    if (!d.intro) return;
    btn.disabled = true; say('送信中…');   // 連打しても1回しか送らない
    const r = await RANKING.rpgSubmit({ nickname: chk.name, ...recordOf(d) });
    btn.disabled = false;
    if (!r.ok) return fail(r.reason);
    store.set('nickname', chk.name);
    store.set(KEY, { name: chk.name, sent: recordOf(d) });
    lastSent = Date.now();
    drawMe();
    say(`載せたよ！ ${ranks(r)}　これからは自動で更新するね`, 'ok');
    $('rr-rank').textContent = '';
    load();
  };

  // タイムアタックのランキング画面から冒険のランキングへ（冒険を隠している人には出さない: body.rpg-off）
  const panel = document.querySelector('#scr-ranking .panel > h2');
  if (panel) {
    const go = document.createElement('button');
    go.type = 'button'; go.className = 'linkbtn rpg-only'; go.id = 'rk-to-rpg'; go.textContent = '🏆 冒険のランキングはこちら';
    go.onclick = () => RPG.open('rpgrank');
    panel.after(go);
  }
  // 冒険ホームはもう描いてあるかもしれないので（直リンク #rpg）、入口を出すために描き直す
  if (document.body.dataset.screen === 'rpg') RPG.refresh();
})();
