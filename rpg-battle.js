(() => {
  'use strict';
  // 国旗クエストのバトル（#scr-battle）: 登場画面 → 4択（ボスは旗を1枚ずつ取りもどす）→ 思い出して復活 → 勝ち／負けをまとめて保存。にげる・キー操作も
  // index.html のインライン script と rpg.js の後に読むクラシック script なので、外側に const / let / function を書かない（名前がぶつかると SyntaxError）

  // ---- 起動時のチェック。足りなければ何もしない（画面を作らない。クイズはそのまま動く） ----
  const NEED = {
    C: typeof C, byA: typeof byA, REGIONS: typeof REGIONS, flag: typeof flag, esc: typeof esc, fmt: typeof fmt, $: typeof $,
    store: typeof store, S: typeof S, P: typeof P, FX: typeof FX, show: typeof show, registerScreen: typeof registerScreen,
    screenRender: typeof screenRender, emit: typeof emit, toast: typeof toast, makeQuestion: typeof makeQuestion,
    mapSvg: typeof mapSvg, zoomableMap: typeof zoomableMap, factsHTML: typeof factsHTML, shuffle: typeof shuffle,
    feats: typeof feats, featCountry: typeof featCountry, featOf: typeof featOf, boxProjection: typeof boxProjection,
    WORLD_BOX: typeof WORLD_BOX, W: typeof W, H: typeof H, d3: typeof d3, misses: typeof misses, SCREENS: typeof SCREENS,
    RPG_CORE: typeof RPG_CORE, RPG: typeof window.RPG,
  };
  const missing = Object.keys(NEED).filter(k => NEED[k] === 'undefined');
  if (missing.length) { console.error(`[rpg] 必要なものが読み込めなかったので、バトルはお休み: ${missing.join(' ')}`); return; }
  const wrap = document.querySelector('body > .wrap');
  if (!wrap) { console.error('[rpg] body > .wrap が無いので、バトルはお休み'); return; }

  const K = RPG_CORE, T = K.TUNING, TB = T.battle, DG = K.DUNGEONS, RPG = window.RPG;
  const BOSS = 5;             // フロアは F1〜F4 とボス（5）
  const CAP = 1e9;            // コイン・回数の上限（rpg-core.js の sanitize と同じ）
  const LOG_LINES = 3;        // ログは直近3行
  const COIN = '<i class="coin" aria-hidden="true"></i>';
  const LABEL = { f2n: 'この国旗はどこの国？', n2f: 'この国の国旗は？', m2f: '色がついている場所の国旗は？' };
  const MODES = new Set(['f2n', 'n2f', 'm2f', 'cap']);
  const ONGOING = new Set(['question', 'reveal', 'revive']);   // バトルが続いている（にげたら数える）
  const FLEE_ASK = 'にげる？（報酬はなし）';
  const todayStr = () => K.today(new Date());
  // misses は index.html の let（記録を消すと別のオブジェクトになる）。参照を取っておかず、毎回読む
  const missesNow = () => (misses && typeof misses === 'object') ? misses : {};
  const missOf = a => Math.max(0, +missesNow()[a] || 0);
  const nameOf = a => byA.get(a)?.n ?? a;
  const names = as => as.map(a => esc(nameOf(a))).join('・');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- いまのバトル（無ければ null） ---------- */
  // phase: 'intro' | 'question' | 'reveal' | 'revive' | 'end'。q: いまの問題 {a, mode}。waiting: 正解のあとの自動送りを待っている
  let B = null;
  const sec = document.createElement('section');
  sec.id = 'scr-battle'; sec.className = 'wrap'; sec.hidden = true;

  const setPhase = p => {
    B.phase = p;
    const st = sec.querySelector('.rpg-stage');
    if (st) st.dataset.phase = p;
  };
  // スマホでは上の列（.rpg-btop）が画面の上に固定される（rpg.css の sticky）。その下に隠れないように、
  // el に scroll-margin-top（上の列の高さ + 8px）を付けて true。PC のステージ（sticky でない）は何もしないで false
  const clearTop = el => {
    const top = sec.querySelector('.rpg-btop');
    if (!top || getComputedStyle(top).position !== 'sticky') return false;
    el.style.scrollMarginTop = `${top.offsetHeight + 8}px`;
    return true;
  };
  const stopTimer = () => { if (B) { clearTimeout(B.timer); B.waiting = false; } };

  // ---- 上の列（モンスター・HP・のこりミス・仲間・取りもどした旗・ログ） ----
  const barHTML = (id, label) => `<div class="rpg-hp" id="${id}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0"><i></i></div><span class="rpg-hpnum"></span>`;
  // 仲間3枚（国旗と★）。tags なら地域ボーナスの札も
  const partyHTML = tags => `<ul class="rpg-party">${B.stats.party.map(({ a }) => {
    const star = B.d.cards[a]?.[0] || 1, bonus = B.dg.r === 'all' || byA.get(a)?.r === B.dg.r;
    return `<li class="rpg-pc"><img src="${flag(a)}" alt="${esc(nameOf(a))}"><span class="rpg-stars" role="img" aria-label="★${star}">${'★'.repeat(star)}</span>`
      + `${tags && bonus ? `<span class="rpg-tag">地域ボーナス ×${T.card.regionMul}</span>` : ''}</li>`;
  }).join('')}</ul>`;
  // #scr-battle > .rpg-stage: 1つ目の子が上の列（.rpg-btop）、2つ目の子が問題の列（登場画面・問題・答え合わせ・終わりが入れかわる）
  const stageHTML = () => {
    const { dg, floor, mon, boss, d } = B;
    return `<div class="rpg-stage" data-phase="${B.phase}" style="--rpg-c: ${dg.color}"><div class="rpg-btop">`
      + `<div class="rpg-bhead"><button type="button" class="linkbtn" id="bt-flee">← にげる</button><span class="rpg-bwhere">${esc(dg.name)} ${boss ? 'ボス' : `F${floor}`}</span></div>`
      + `<div class="rpg-mon${boss ? ' rpg-boss' : ''}" id="bt-mon"><span class="rpg-mon-e" aria-hidden="true">${mon.e}</span>${boss ? '<span class="rpg-bosstag">BOSS</span>' : ''}</div>`
      + `<div class="rpg-hpl"><b class="rpg-hpname">${esc(mon.n)}</b>${barHTML('bt-ehp', `${mon.n}のHP`)}</div>`
      + `<div class="rpg-hpl"><span class="rpg-hpname" aria-hidden="true">${K.AVATARS[d.av] ?? K.AVATARS[0]}</span>${barHTML('bt-hhp', '旅人のHP')}<span class="rpg-left" id="bt-left"></span></div>`
      + (B.stats.party.length ? partyHTML(false) : '')
      + '<div class="rpg-flags" id="bt-flags" role="group" aria-label="取りもどした旗"></div>'
      + '<div class="rpg-log" id="bt-log" aria-live="polite"></div>'
      + '</div><div class="rpg-bcol" id="bt-col"></div></div>';
  };
  // HP バー: 50% 未満で .is-mid（黄）、25% 未満で .is-low（赤）。数字も出す
  const setBar = (el, now, max) => {
    const r = max > 0 ? Math.max(0, Math.min(1, now / max)) : 0;
    el.setAttribute('aria-valuenow', now);
    el.setAttribute('aria-valuemax', max);
    el.firstElementChild.style.width = `${r * 100}%`;
    el.classList.toggle('is-mid', r < .5 && r >= .25);
    el.classList.toggle('is-low', r < .25);
    el.nextElementSibling.textContent = `${fmt(now)}/${fmt(max)}`;
  };
  // 取りもどした旗: ボスは旗の枚数ぶん（取りもどしたら布が本物の国旗に）、通常は倒すのに必要な正解の数ぶん（正解した国の国旗が入る）
  const flagsHTML = () => {
    const slots = B.boss ? B.flags.map(f => f.got ? f.a : null) : [...B.got, ...Array(Math.max(0, B.need - B.got.length)).fill(null)];
    return slots.map(a => a ? `<img class="rpg-got" src="${flag(a)}" alt="${esc(nameOf(a))}">` : '<span class="rpg-cloth" aria-hidden="true">?</span>').join('')
      + `<span class="rpg-flagtext">旗 ${slots.filter(Boolean).length}/${slots.length}</span>`;
  };
  const drawTop = () => {
    const { en } = B;
    setBar($('bt-ehp'), B.boss ? B.flags.reduce((s, f) => s + f.hp, 0) : B.ehp, B.boss ? B.flags.length * en.flagHp : en.hp);
    setBar($('bt-hhp'), B.hp, B.stats.hp);
    $('bt-left').textContent = `のこりミス${Math.max(0, K.missesAllowed({ hp: B.hp }, en))}`;
    $('bt-flags').innerHTML = flagsHTML();
  };
  // ログは1行ずつ足す（aria-live が足した行だけ読む）。直近3行だけ残す
  const say = line => {
    const log = $('bt-log');
    if (!log) return;
    const p = document.createElement('p');
    p.textContent = line;
    log.append(p);
    while (log.children.length > LOG_LINES) log.firstElementChild.remove();
  };
  // 当たったらモンスターが揺れて、ダメージの数字が浮かぶ（動きは rpg.css の prefers-reduced-motion: no-preference の中。reduce なら数字は出さない）
  const hitFx = dmg => {
    const mon = $('bt-mon');
    if (!mon) return;
    mon.classList.remove('rpg-hit');
    void mon.offsetWidth;   // 続けて当たっても揺れ直す
    mon.classList.add('rpg-hit');
    if (reduced()) return;
    const n = document.createElement('span');
    n.className = 'rpg-dmg'; n.textContent = `-${dmg}`; n.setAttribute('aria-hidden', 'true');
    n.onanimationend = () => n.remove();
    setTimeout(() => n.remove(), 2000);   // CSS が読めなかったときも残さない
    mon.append(n);
  };

  // ---- 登場画面 ----
  const introHTML = () => {
    const { en, stats, mon, boss, d, id, floor } = B, g = stats.gauge;
    return '<div class="rpg-bintro" id="bt-intro">'
      + `<p class="rpg-bmeet"><span class="rpg-bmeet-e" aria-hidden="true">${mon.e}</span><b>${esc(mon.n)}</b>があらわれた！</p>`
      + `<p class="rpg-bline">倒すのに必要な正解: 約${K.hitsNeeded(stats, en)}回 ／ まちがえてOK: ${K.missesAllowed(stats, en)}回まで</p>`
      + (stats.party.length ? partyHTML(true) : `<p class="hint">仲間がいると強くなるよ（国旗ガチャ・${T.card.frJoin}回正解）</p>`)
      + (g ? `<p class="rpg-bline">がんばりゲージ +${Math.round(TB.gaugeStep * 100 * g)}%</p>` : '')
      + (boss ? '<p class="rpg-bline">旗1枚につき正解1回で取りもどせる（Lv が足りないと2回かかることも）。旗を全部取りもどしたら勝ち！</p>' : '')
      + (id === DG[0].id && floor === 1 && !(d.floors[id] > 0) ? '<p class="rpg-bline">正解すると攻撃！ まちがえると反撃されるよ</p>' : '')
      + '<button type="button" class="btn" id="bt-fight">たたかう</button></div>';
  };

  // ---- 始める（開いていないフロアと、新しい版のデータのあいだは何もしないで false） ----
  const start = (id, floor) => {
    const dg = K.dungeonOf(id);
    floor = +floor;
    if (!dg || !Number.isInteger(floor) || floor < 1 || floor > BOSS || RPG.status === 'readOnly') return false;
    const d0 = RPG.get();
    if (!RPG.unlocked(d0, id) || floor > (d0.floors[id] || 0) + 1) return false;
    const m = missesNow(), t = todayStr();
    let d = null;
    RPG.tx(x => { K.ensureDay(x, m, t, Math.random); d = x; });
    d = d || RPG.get();
    stopTimer();   // 終わりの画面から［つぎのフロアへ］［もう一回］で始め直すとき
    const en = K.enemy(id, floor), stats = K.battleStats(d, id, floor), boss = en.boss;
    const flags = boss ? K.bossFlags(d, m, id, Math.random).map(a => ({ a, hp: en.flagHp, got: false })) : [];
    B = {
      id, floor, dg, en, boss, stats, d, mon: K.MONSTERS[id][floor - 1],
      run: K.newRun({ sid: `bt-${Date.now().toString(36)}`, kind: 'battle', mode: 'f2n', region: dg.r, n: 0, hint: false }, d),
      hp: stats.hp, ehp: boss ? 0 : en.hp,
      // 通常: 国の袋と、国ごとに前に出した形式。ボス: 旗（order はまだ取りもどしていない旗の番号で、先頭がいまの旗）と出した問題の数 k
      queue: boss ? [] : K.battleBag(d, m, id, floor, Math.random), last: {},
      flags, order: flags.map((_, i) => i), k: 0, again: false,
      need: boss ? flags.length : K.hitsNeeded(stats, en), got: [],
      phase: 'intro', q: null, shownAt: 0, answered: false, waiting: false, timer: 0, win: null, next: null,
      combo: 0, maxCombo: 0, rights: 0, mistakes: [], missed: new Set(), revive: null, reviveUsed: false, revived: false,
    };
    sec.innerHTML = stageHTML();
    drawTop();
    $('bt-col').innerHTML = introHTML();
    if (sec.hidden) { RPG.opts = {}; show('battle'); }   // render からもう一度 start しない
    $('bt-fight')?.focus({ preventScroll: true });
    return true;
  };
  // 画面（screenRender.battle）。RPG.open('battle', {id, floor}) のときだけ始める
  const render = () => {
    const o = RPG.opts || {};
    if (o.id !== undefined && o.floor !== undefined) {
      RPG.opts = {};
      if (start(o.id, o.floor)) return;
    }
    if (!B) sec.innerHTML = '<div class="rpg-bend"><p class="hint">バトルは冒険ホームのダンジョンから始めてね</p>'
      + '<div class="row center"><button type="button" class="btn" id="bt-home">冒険ホームへ</button></div></div>';
  };

  // ---- 出題 ----
  const fight = () => {
    if (!B || B.phase !== 'intro') return;
    setPhase('question');
    nextQ();
  };
  const refill = () => K.refillBag(B.id, B.floor, B.last, Math.random);
  const nextQ = () => {
    if (B.boss) {
      // 新しい旗（後ろに回した旗がもう一度来たときも）は bossMode、旗が残ったときの同じ国のもう1問は前の形式の次
      const f = B.flags[B.order[0]];
      const mode = B.again ? K.nextMode(B.q.mode, BOSS) : K.bossMode(B.k, B.order.length, B.en.flags, f.a);
      B.k++;
      B.q = { a: f.a, mode };
    } else {
      if (!B.queue.length) B.queue = refill();
      const x = B.queue.shift();
      B.q = { a: x.a, mode: x.mode };
    }
    showQ();
  };
  // いまの問題（B.q）を描く。札はここで決める（苦手な国・今日の手配書でまだ達成していない国）
  const showQ = () => {
    const { a, mode } = B.q, c = byA.get(a), d = B.d, bo = d.bounty;
    B.answered = false; B.waiting = false;
    B.last[a] = mode;
    const tags = [
      K.isWeak(d, missesNow(), a) && '⚠ 前にまちがえた国',
      bo.a.includes(a) && !bo.done.includes(a) && !B.run.game.bounty[a] && '手配中',
    ].filter(Boolean);
    const box = document.createElement('div');
    box.className = 'bq'; box.id = 'bt-q';
    box.innerHTML = (B.revive ? `<h2 class="rpg-rvh">思い出して復活！ まちがえた国をもう一度 <small>${B.revive.i + 1}/${B.revive.list.length}</small></h2>` : '')
      + (tags.length ? `<p class="rpg-tags">${tags.map(s => `<span class="rpg-tag">${s}</span>`).join('')}</p>` : '')
      + `<p class="qlabel">${mode === 'cap' ? `首都が「${esc(c.c)}」の国は？` : LABEL[mode]}</p>`
      + (mode === 'f2n' ? `<img class="qflag" src="${flag(a)}" alt="国旗">` : '')
      + (mode === 'n2f' ? `<p class="qbig">${esc(c.n)}</p>` : '');
    if (mode === 'm2f') box.append(zoomableMap(c, '出題中の国の位置', { region: B.dg.r }));
    const byName = mode === 'f2n' || mode === 'cap', ch = document.createElement('div');
    ch.className = 'choices' + (byName ? ' textc' : '');
    makeQuestion(c).opts.forEach((o, k) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'choice' + (byName ? '' : ' flagc'); b.dataset.a = o.a;
      b.innerHTML = byName ? `<kbd>${k + 1}</kbd><span>${esc(o.n)}</span>` : `<kbd>${k + 1}</kbd><img src="${flag(o.a)}" alt="選択肢${k + 1}の国旗">`;
      ch.append(b);
    });
    box.append(ch);
    $('bt-col').replaceChildren(box);
    clearTop(box);   // 答え合わせのあとで下までスクロールしていても、問いの文が上の列の下に隠れない
    box.scrollIntoView({ block: 'nearest' });
    B.shownAt = performance.now();
  };

  // ---- 答える ----
  const answer = a => {
    if (!B || B.answered || (B.phase !== 'question' && B.phase !== 'revive')) return;
    B.answered = true;
    const { q } = B, right = a === q.a;
    for (const b of sec.querySelectorAll('.choice')) {
      b.disabled = true;
      if (b.dataset.a === q.a) b.classList.add('ok'); else if (b.dataset.a === a) b.classList.add('ng');
    }
    // 記録: misses はその場で書く（クイズと同じ ±1、0 未満にしない）。ほかは run に積んで、終わりにまとめて書く
    const before = missOf(q.a);
    if (!(misses && typeof misses === 'object')) misses = {};
    misses[q.a] = right ? Math.max(0, before - 1) : before + 1;
    store.set('misses', misses);
    K.runAnswer(B.run, { a: q.a, right, first: !B.missed.has(q.a), hint: false, mode: q.mode, missesBefore: before, missesAfter: misses[q.a] });
    emit('rpg:answer', { a: q.a, right, mode: q.mode, dungeon: B.id, boss: B.boss });
    if (right) hit(); else miss();
  };
  const wait = () => { B.waiting = true; B.timer = setTimeout(advance, TB.autoNextMs); };
  const hit = () => {
    const { q } = B;
    B.rights++;
    if (B.phase === 'revive') {   // 思い出して復活: 攻撃はしない。全部正解したら HP が半分もどる
      if (B.revive.i + 1 >= B.revive.list.length) {
        B.revived = true;
        B.hp = Math.round(B.stats.hp / 2);
        drawTop();
        say(`思い出して復活！ HP ${fmt(B.hp)}`);
      }
      return wait();
    }
    const crit = Math.random() < TB.critRate, dmg = K.damage(B.stats.atk, B.combo, crit);
    const head = `${crit ? '会心！ ' : ''}${nameOf(q.a)}！ `;
    B.combo++;
    B.maxCombo = Math.max(B.maxCombo, B.combo);
    if (B.boss) {   // ボスはいまの旗の残りだけ（余りは持ち越さない）
      const f = B.flags[B.order[0]];
      f.hp = Math.max(0, f.hp - dmg);
      B.again = f.hp > 0;
      if (!B.again) { f.got = true; B.order.shift(); }
      say(B.again ? `${head}${B.mon.n}に${dmg}ダメージ` : `${head}旗を取りもどした`);
    } else {
      B.ehp = Math.max(0, B.ehp - dmg);
      B.got.push(q.a);
      say(`${head}${B.mon.n}に${dmg}ダメージ`);
    }
    drawTop();
    hitFx(dmg);
    if (B.boss ? !B.order.length : B.ehp === 0) return finish(true);
    wait();
  };
  // 自動送り（待っているあいだのステージのタップと Enter も）
  const advance = () => {
    if (!B || !B.waiting) return;
    stopTimer();
    if (B.phase === 'revive') {
      const rv = B.revive;
      if (++rv.i < rv.list.length) { B.q = { ...rv.list[rv.i] }; return showQ(); }
      B.revive = null;
      setPhase('question');
    }
    nextQ();
  };
  const miss = () => {
    const { q } = B;
    B.mistakes.push({ a: q.a, mode: q.mode });
    B.missed.add(q.a);
    if (!B.revive) {
      B.combo = 0;
      B.hp = Math.max(0, B.hp - B.en.atk);
      if (B.boss) { B.order.push(B.order.shift()); B.again = false; }   // いまの旗は後ろに回す
      else {   // 2問あとに同じ国を別の形式で
        if (!B.queue.length) B.queue = refill();
        B.queue.splice(1, 0, { a: q.a, mode: K.nextMode(q.mode, B.floor) });
      }
      drawTop();
      say(`${B.mon.n}の反撃！ ${B.en.atk}ダメージ`);
    }
    setPhase('reveal');
    // 答え合わせは選択肢の場所と入れかえて出し、［つぎへ］を押すまで待つ。m2f は地図をもう1枚出さない
    const c = byA.get(q.a), rv = document.createElement('div');
    rv.className = 'reveal rpg-reveal'; rv.id = 'bt-reveal';
    rv.innerHTML = `<p class="verdict ng">ざんねん。正解は「${esc(c.n)}」</p>${factsHTML(c)}`;
    if (q.mode !== 'm2f') rv.append(mapSvg(c, `${c.n}の位置`, { region: B.dg.r }));
    const nx = document.createElement('button');
    nx.type = 'button'; nx.className = 'btn next'; nx.id = 'bt-next'; nx.textContent = 'つぎへ ⏎';
    rv.append(nx);
    sec.querySelector('#bt-q .choices').replaceWith(rv);
    nx.focus({ preventScroll: true });
    // スマホは上の列のすぐ下に答え合わせの頭を出す。PC はふつう選択肢の場所に収まるので動かない。
    // 収まらないとき（幅 900〜1050px・横向きのスマホなど）だけ、右の列の中を［つぎへ］が見えるまでスクロールする（PC のページはスクロールしない）
    if (clearTop(rv)) rv.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    else nx.scrollIntoView({ block: 'nearest' });
  };
  // ［つぎへ］: HP が 0 なら思い出して復活（1バトル1回。まちがえた国が無ければ無し）か負け。復活の問題をまちがえたら負け
  const next = () => {
    if (!B || B.phase !== 'reveal') return;
    if (B.revive) return finish(false);
    if (B.hp <= 0) {
      const list = K.reviveSet(B.mistakes);
      if (B.reviveUsed || !list.length) return finish(false);
      B.reviveUsed = true;
      B.revive = { list, i: 0 };
      setPhase('revive');
      B.q = { ...list[0] };
      return showQ();
    }
    setPhase('question');
    nextQ();
  };

  // ---- 終わり（1回の RPG.tx で全部書く。イベントは tx が返ってから） ----
  // 次のフロア。ボスのあとは次のダンジョンの F1（地図喰いのあとは無し）
  const nextOf = (id, floor) => {
    if (floor < BOSS) return { id, floor: floor + 1 };
    const g = DG[DG.findIndex(x => x.id === id) + 1];
    return g ? { id: g.id, floor: 1 } : null;
  };
  const finish = win => {
    stopTimer();
    setPhase('end');
    B.win = win;
    const b = B, t = todayStr(), key = `${b.id}:${b.floor}`, mistakes = b.mistakes.length;
    const res = RPG.tx(d => {
      const receipt = K.settleRun(d, b.run, null, t);
      const first = win && (d.floors[b.id] || 0) < b.floor;
      const coins = K.battleReward(b.en.s, { win, first, boss: b.boss, rights: b.rights });
      d.coins = Math.min(CAP, d.coins + coins);
      d.earned = Math.min(CAP, d.earned + coins);
      if (win) { d.floors[b.id] = Math.max(d.floors[b.id] || 0, b.floor); delete d.gauge[key]; }
      else d.gauge[key] = Math.min(TB.gaugeMax, (d.gauge[key] || 0) + 1);
      const st = d.st, add = k => { st[k] = Math.min(CAP, st[k] + 1); };
      add(win ? 'win' : 'lose');
      if (b.revived) add('revive');
      if (win && b.boss) add('bossWins');
      if (win && !mistakes) add('nodmg');
      st.combo = Math.max(st.combo, b.maxCombo);
      return { receipt, coins, first, gauge: d.gauge[key] || 0, d };
    });
    if (res) {
      const { receipt: rc, d } = res;
      emit('rpg:battle', { dungeon: b.id, floor: b.floor, boss: b.boss, win, first: res.first, mistakes, revived: b.revived,
        gauge: res.gauge, maxCombo: b.maxCombo, lv: d.lv, recLv: b.en.recLv });
      if (b.boss && res.first) emit('rpg:clear', { dungeon: b.id });
      RPG.emitCoins(d, res.coins, 'battle');
      RPG.emitCoins(d, rc.overcome.length * T.overcome, 'overcome');
      RPG.emitCoins(d, rc.bounty.length * T.bounty + (rc.bountyAll ? T.bountyAll : 0), 'bounty');
      RPG.announce(rc, d);
    }
    if (B !== b) return;   // イベントを受けた側が画面を変えた
    drawEnd(res || { receipt: null, coins: 0, first: false, gauge: 0 });
  };
  const drawEnd = ({ receipt: rc, coins, first, gauge }) => {
    const b = B, win = b.win;
    b.next = win ? nextOf(b.id, b.floor) : null;
    $('bt-flee').hidden = true;
    // 仲間・昇格・克服・手配書（クイズの結果のパネルと同じ文）
    const lines = rc ? [
      rc.joined.length && `🤝 ${names(rc.joined)}が仲間になった！`,
      rc.promoted.length && `🏅 ${names(rc.promoted)}がシルバーに！`,
      rc.overcome.length && `✨ 克服！ ${names(rc.overcome)}はもう苦手じゃない +${fmt(T.overcome * rc.overcome.length)}`,
      rc.bounty.length && `📜 手配書 ${names(rc.bounty)} +${fmt(T.bounty * rc.bounty.length)}${rc.bountyAll ? `（3件ぜんぶ +${fmt(T.bountyAll)}）` : ''}`,
    ].filter(Boolean) : [];
    let html = '<div class="rpg-bend" id="bt-end">';
    if (win) {
      html += `<p class="rpg-bend-h">勝利！ ${COIN}+${fmt(coins)}${first ? `<small>（はじめてのクリア ×${TB.firstMul}）</small>` : ''}</p>`;
      // シェアの中身は Task 12。それまでは隠しておく
      if (b.boss && first) html += `<p class="rpg-bend-x">${esc(b.dg.land)}を取りもどした！</p><button type="button" class="btn ghost" id="bt-share" hidden>シェア</button>`;
    } else {
      const missed = [...new Set(b.mistakes.map(x => x.a))].map(a => byA.get(a)).filter(Boolean);
      html += '<p class="rpg-bend-h">やられた…！ でも、まちがえた国はもう覚えたはず</p>'
        + `<p class="rpg-bline">がんばり賞 ${COIN}+${fmt(coins)}</p><p class="rpg-bline">がんばりゲージ ${gauge}/${TB.gaugeMax}</p>`
        + (missed.length ? '<p class="rpg-lbl">まちがえた国</p><ul class="misslist">'
          + missed.map(c => `<li><img src="${flag(c.a)}" alt=""><b>${esc(c.n)}</b><span>${esc(c.c)}</span></li>`).join('') + '</ul>' : '');
    }
    html += lines.map(l => `<p class="rpg-bline">${l}</p>`).join('')
      + '<div class="row center">'
      + (win ? '' : '<button type="button" class="btn ghost" id="bt-practice">この地域を練習する</button><button type="button" class="btn ghost" id="bt-again">もう一回</button>')
      + '<button type="button" class="btn ghost" id="bt-home">冒険ホームへ</button>'
      + (b.next ? '<button type="button" class="btn" id="bt-nextfloor">つぎのフロアへ</button>' : '')
      + '</div></div>';
    $('bt-col').innerHTML = html;
    clearTop($('bt-end'));
    $('bt-end').scrollIntoView({ block: 'nearest' });
    ($('bt-nextfloor') || $('bt-again') || $('bt-home')).focus({ preventScroll: true });
  };
  // この地域を練習する（S と P を書きかえるのはここだけ）
  const practice = () => {
    S.region = B.dg.r; store.set('settings', S);
    P.kind = 'practice'; store.set('setup', P);
    show('setup');
  };

  // ---- にげる（ペナルティなし・報酬なし・ゲージも増えない） ----
  // バトルが続いていれば st.flee を数える。それから片付ける（run は捨てる。misses はもう書いてある）
  const flee = () => {
    if (!B) return;
    if (ONGOING.has(B.phase)) RPG.tx(d => { d.st.flee = Math.min(CAP, d.st.flee + 1); });
    stopTimer();
    B = null;
    sec.replaceChildren();
  };
  // ［← にげる］と Esc。先に片付けてから冒険ホームへ（show が出す drill:screen では、もう数えない）
  const askFlee = () => {
    if (!B || B.phase === 'end' || !confirm(FLEE_ASK)) return;
    flee();
    show('rpg');
  };
  // バトル中にトップバーなどで別の画面へ行ったら、確認なしでにげたことにする（登場画面と終わりの画面では片付けるだけ）
  document.addEventListener('drill:screen', e => {
    try { if (e.detail?.name !== 'battle' && B) flee(); } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- 押す・キー ---------- */
  // ダブルクリックの2回目（e.detail > 1）は無視。選択肢は出題から guardMs のあいだ押せない（自動送りを待たずに進んだタップが次の問題に当たらない）
  sec.addEventListener('click', e => {
    try {
      if (e.detail > 1) return;
      const btn = e.target.closest?.('button');
      if (!B) { if (btn?.id === 'bt-home') show('rpg'); return; }
      if (btn?.classList.contains('choice')) {
        if (performance.now() - B.shownAt >= TB.guardMs) answer(btn.dataset.a);
        return;
      }
      if (btn) {
        const b = B;
        ({
          'bt-flee': askFlee, 'bt-fight': fight, 'bt-next': next, 'bt-practice': practice,
          'bt-nextfloor': () => b.next && start(b.next.id, b.next.floor),
          'bt-again': () => start(b.id, b.floor),
          'bt-home': () => show('rpg'),
        })[btn.id]?.();
        return;
      }
      if (B.waiting) advance();   // 自動送りを待っているあいだにステージをタップ → すぐ次へ
    } catch (err) { console.error('[rpg]', err); }
  });
  // #scr-battle が見えていて、#detail が開いておらず、入力欄にフォーカスがないときだけ。キーの押しっぱなし（e.repeat）は無視
  document.addEventListener('keydown', e => {
    try {
      if (!B || sec.hidden || $('detail')?.open || e.target?.matches?.('input, select, textarea') || e.repeat) return;
      if (/^[1-4]$/.test(e.key)) {
        const b = sec.querySelectorAll('.choice')[+e.key - 1];
        if (b && !b.disabled) b.click();
      } else if (e.key === 'Enter') {
        // フォーカスが押せるボタンにあるときは、ボタン自身の click に任せる（二重に進まない）
        const f = document.activeElement;
        if (f instanceof HTMLButtonElement && !f.disabled) return;
        if (B.phase === 'intro') $('bt-fight')?.click();
        else if (B.phase === 'reveal') $('bt-next')?.click();
        else if (B.waiting) advance();
      } else if (e.key === 'Escape') askFlee();
    } catch (err) { console.error('[rpg]', err); }
  });

  /* ---------- 起動: 画面は <section> を作ってから登録する ---------- */
  const foot = wrap.querySelector(':scope > footer');
  if (foot) foot.before(sec); else wrap.append(sec);
  registerScreen('battle', render);

  window.RPG_BATTLE = {
    start,
    // いまの問題の国コード（問題・答え合わせ・復活のあいだ。ほかは null）
    cur: () => B && B.q && B.phase !== 'intro' && B.phase !== 'end' ? B.q.a : null,
    state: () => ({ phase: B ? B.phase : null, shownAt: B ? B.shownAt : 0, win: B ? B.win : null }),
    // テストと開発用: いまの問題をその国・形式に置きかえる（ボスはいまの旗の国も入れかえる）。置きかえたら true
    force(a, mode) {
      if (!B || !byA.has(a) || !MODES.has(mode) || (B.phase !== 'question' && B.phase !== 'revive')) return false;
      stopTimer();
      if (B.revive) B.revive.list[B.revive.i] = { a, mode };
      else if (B.boss) {
        const i = B.order[0], j = B.flags.findIndex(f => f.a === a && !f.got);
        if (j >= 0 && j !== i) B.flags[j].a = B.flags[i].a;   // 同じ国の旗が2枚にならないように入れかえる
        B.flags[i].a = a;
        B.again = false;
      }
      B.q = { a, mode };
      showQ();
      return true;
    },
  };
})();
