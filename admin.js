// 管理ページ（admin.html）の画面の動き。セーブの読み書きは admin-save.js（ADMIN_SAVE）に任せる。
// 変わる文字（キー名・セーブの中身・国名など）はいつも textContent / value / setAttribute で入れる。innerHTML は使わない。
// 本編の S（設定）はここでは作らない: sound.js は S が無いと「効果音オン・音量70」で鳴らすので、効果音のテスト（D10）が本編の設定に左右されない。
(() => {
  // ---- よそのページの iframe の中では何も出さない（meta の CSP では frame-ancestors が効かないので、ここで止める） ----
  if (window.top !== window.self) {
    document.documentElement.style.setProperty('display', 'none', 'important');
    try { window.top.location = location.href; } catch { /* 抜け出せなくても、隠したまま何も作らない */ }
    return;
  }
  // ---- 画面の色（本編の head の先読みと同じ）。DOM ができる前、head で読まれた時点で当てる ----
  try {
    const t = (JSON.parse(localStorage.getItem('settings')) || {}).theme ?? 'light';
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch { /* 読めなければ端末の設定のまま */ }
  const applyTheme = t => { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };

  // D12 のつながるか確かめるだけに使う。値は admin-api.js にだけ書いてある（admin.html で admin-api.js が先に読まれる）
  const SUPABASE = globalThis.ADMIN_API.URL, PUBLIC_KEY = globalThis.ADMIN_API.KEY;
  const MODE_LABEL = { f2n: '国旗→国名', n2f: '国名→国旗', m2f: '場所→国旗', f2m: '国旗→場所' };
  const REGIONS = ['アジア', 'ヨーロッパ', 'アフリカ', '北・中央アメリカ', '南アメリカ', 'オセアニア'];

  const $ = id => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('data-') || k.startsWith('aria-')) e.setAttribute(k, v);
      else e[k] = v;
    }
    e.append(...kids);
    return e;
  };
  const pad = n => String(n).padStart(2, '0');
  const hms = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const ymd = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const fmtBytes = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
  const fmtAt = iso => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${hms(d)}`; };

  let SAVE, toastTimer = 0, current = '';   // current: D2 で選んでいるキー
  // D2 の欄に出した文字（shown）と、そのときのセーブの中身（shownFp）。欄をさわっていなければ、セーブが変わったら出し直す
  let shown = null, shownFp = null;
  // 設定（D9）の欄を変えて、まだ「設定を保存」していない
  let setDirty = false;

  function toast(msg, bad = false) {
    const t = $('adm-toast');
    t.textContent = msg;
    t.classList.toggle('bad', bad);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.textContent = ''; }, 3500);
  }
  const REASON = { not_json: 'JSONが壊れてるよ。保存しなかった', bad_shape: '本編のセーブの形じゃないよ。保存しなかった', storage: 'この端末に書けなかった（容量か設定）', bad_file: '国旗マスターのセーブファイルじゃないよ。何も変えてない', missing: '見つからなかった',
    newer: '新しい版のセーブなので変えられないよ（ページを読み直してね）' };
  const fail = r => toast(REASON[r?.reason] ?? 'うまくいかなかった', true);
  // ok:false の返事なら知らせて false。rpgEdit などは書いた値そのものを返すので、ok が無ければ成功。
  // 断られたときも描き直す（さわった select・チェックが、書けなかった値のまま残らないように）
  const failed = r => !!r && r.ok === false;
  const done = (r, msg) => { if (failed(r)) { fail(r); renderAll(); return false; } if (msg) toast(msg); renderAll(); return true; };

  // 危ない操作: confirm で確かめて、OK なら自動でスナップショットを取ってからする（やめたときはスナップショットも取らない）
  function danger(label, fn) {
    if (!confirm(`「${label}」していい？\n（する前に今の状態をスナップショットに自動で取っておくよ）`)) return;
    const s = SAVE.snapSave(`自動 ${label} ${hms()}`, { auto: true });   // 自動は自動どうしで5個まで（手動のものは押し出さない）
    if (!s.ok) { toast('自動のスナップショットが取れなかったので、やめておいたよ', true); return; }
    safe('d-snaps', renderSnaps);
    fn();
  }

  // ---- タブ ----
  function showTab(name) {
    for (const b of $('adm-tabs').querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
    onTab(name);
  }

  // ---- D1・D2 セーブ一覧と中身 ----
  function renderKeys() {
    const r = SAVE.keys(), ul = $('d-keys');
    ul.replaceChildren();
    if (!Array.isArray(r)) { ul.append(el('li', { text: 'この端末のセーブが読めない' })); return; }
    if (!r.length) ul.append(el('li', { class: 'muted', text: 'セーブは何もないよ' }));
    for (const { key, bytes, at } of r) {
      // 最終更新はセーブの中に時刻（日付）が書いてあるものだけ出す（localStorage 自体は更新時刻を持たない）
      const when = typeof at === 'string' ? (/^\d{4}-\d{2}-\d{2}$/.test(at) ? at : fmtFull(at)) : '';
      ul.append(el('li', {},
        el('span', { class: 'grow' }, el('button', { class: 'keybtn', 'data-key': key, 'aria-pressed': String(key === current), text: key })),
        ...(when ? [el('span', { class: 'mono muted', 'data-at': '', text: `最終 ${when}` })] : []),
        el('span', { class: 'mono muted', text: fmtBytes(bytes) })));
    }
  }
  const fpOf = r => r.ok ? JSON.stringify(r.value) : r.raw ?? null;
  function fillEditor(key) {
    const r = SAVE.read(key);
    shown = $('d-json').value = r.ok ? JSON.stringify(r.value, null, 2) : (r.raw ?? '');
    shownFp = fpOf(r);
    return r;
  }
  function pick(key) {
    current = key;
    $('d-key').value = key;
    const r = fillEditor(key);
    if (!r.ok && r.reason === 'not_json') toast('JSON じゃない値だよ（そのままでは保存できない）', true);
    renderKeys();
  }
  // ほかの操作（コイン・バッジ・戻す など）でセーブが変わったら、欄を書きかえていなければ今の中身を出し直す
  function syncEditor() {
    if (!current || fpOf(SAVE.read(current)) === shownFp) return;
    if (document.activeElement !== $('d-json') && $('d-json').value === shown) fillEditor(current);
  }
  function saveJson() {
    const key = $('d-key').value.trim(), text = $('d-json').value;
    if (!key) { toast('キーを入れてね', true); return; }
    try { JSON.parse(text); } catch { toast('JSONが壊れてる。保存しなかったよ', true); return; }   // 壊れていたら確かめる前にやめる
    // 形が合わなければ確かめる前にやめる（自動のスナップショットを取らない）
    const c = SAVE.writeCheck(key, text);
    if (c.ok === false) { toast(REASON[c.reason] ?? 'うまくいかなかった', true); return; }
    // 欄に読みこんだあとで、ほかの操作がこのキーを変えていたら、古い中身で上書きしていいか先に聞く
    if (key === current && fpOf(SAVE.read(key)) !== shownFp
      && !confirm(`${key} は欄に読みこんだあとで変わってるよ。欄の中身で上書きしていい？`)) return;
    const go = () => {
      const r = SAVE.write(key, text);
      if (r.ok === false) { toast(r.reason === 'not_json' ? 'JSONが壊れてる。保存しなかったよ' : REASON[r.reason] ?? 'うまくいかなかった', true); return; }
      toast(`${key} を保存したよ`);
      renderAll();
      pick(key);
    };
    // 今あるキーを書きかえるときは危ない操作（確かめて、自動のスナップショットを取ってから）。新しいキーはそのまま
    if (SAVE.read(key).reason === 'missing') go(); else danger(`${key} を書きかえる`, go);
  }
  function deleteKey() {
    const key = $('d-key').value.trim();
    if (!key) { toast('キーを選んでね', true); return; }
    if (SAVE.read(key).reason === 'missing') { toast(REASON.missing, true); return; }   // 無いキーでは確かめもスナップショットもしない
    danger(`${key} を消す`, () => {
      if (!done(SAVE.remove(key), `${key} を消したよ`)) return;
      current = ''; $('d-key').value = ''; $('d-json').value = '';
      renderKeys();
    });
  }
  async function copyJson() {
    try { await navigator.clipboard.writeText($('d-json').value); toast('コピーしたよ'); }
    catch { $('d-json').select(); toast('コピーできなかった。選んだので手でコピーしてね', true); }
  }

  // ---- D3 バックアップ ----
  let dlUrl = '';
  function prepareDownload() {   // a[download] を押した瞬間に、今のセーブで中身を作る
    const a = $('d-dl');
    if (dlUrl) URL.revokeObjectURL(dlUrl);
    dlUrl = URL.createObjectURL(new Blob([JSON.stringify(SAVE.exportAll(), null, 2)], { type: 'application/json' }));
    a.href = dlUrl;
    a.download = `country-drill-save-${ymd()}.json`;
  }
  async function importFile(e) {
    const input = e.target, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('ファイルが JSON じゃないよ。何も変えてない', true); return; }
    // 中身まで全部確かめてから（だめなら自動のスナップショットも取らない）
    const c = SAVE.importCheck(obj);
    if (c.ok === false) { fail(c); return; }
    danger('ファイルから読み戻す', () => restored(SAVE.importAll(obj), 'ファイルから読み戻したよ'));
  }

  // 読み戻した: うまくいったときだけ、保存していない設定の欄を捨てる（失敗したら欄はそのまま）
  function restored(r, msg) {
    if (!failed(r)) setDirty = false;
    return done(r, msg);
  }

  // ---- D4 スナップショット ----
  function renderSnaps() {
    const ul = $('d-snap-list'), list = SAVE.snapList();
    ul.replaceChildren();
    if (!list.length) ul.append(el('li', { class: 'muted', text: 'まだないよ' }));
    for (const s of list.slice().reverse()) {
      ul.append(el('li', { 'data-snap': s.name },
        el('span', { class: 'grow' }, ...(s.auto ? [el('span', { class: 'tag', text: '自動' }), ' '] : []), el('b', { text: s.name }), ' ', el('span', { class: 'mono muted', text: fmtAt(s.at) })),
        el('button', { class: 'btn sm', 'data-act': 'load', text: '戻す' }),
        el('button', { class: 'btn danger sm', 'data-act': 'del', text: '消す' })));
    }
  }
  function snapAct(e) {
    const b = e.target.closest('[data-act]'), li = b?.closest('[data-snap]');
    if (!li) return;
    const name = li.dataset.snap;
    if (b.dataset.act === 'del') {
      if (confirm(`スナップショット「${name}」を消していい？`)) done(SAVE.snapDelete(name), '消したよ');
      return;
    }
    // 先に中身を取っておく（自動のスナップショットが5個を超えて、戻したい自動のものが押し出されても戻せるように）
    const all = SAVE.read('adminSnaps'), snap = all.ok && Array.isArray(all.value) ? all.value.find(s => s && s.name === name) : null;
    if (!snap) { fail({ reason: 'missing' }); return; }
    const file = { app: 'country-drill', kind: 'save', data: snap.data }, c = SAVE.importCheck(file);
    if (c.ok === false) { fail(c); return; }
    danger(`「${name}」に戻す`, () => restored(SAVE.importAll(file), `「${name}」に戻したよ`));
  }
  function snapSave() {
    const name = $('d-snap-name').value.trim() || `手動 ${hms()}`;
    // 同じ名前は置きかわるので、先に聞く
    if (SAVE.snapList().some(s => s.name === name) && !confirm(`「${name}」はもうあるよ。今の状態で上書きしていい？`)) return;
    if (done(SAVE.snapSave(name), `「${name}」を保存したよ`)) $('d-snap-name').value = '';
  }

  // ---- D5 冒険 ----
  // セーブの状態（admin-save.js の rpgStatus）ごとの見出し。壊れてる・新しい版は変えられない（rpgEdit が断る）
  const RPG_STATUS = { none: 'まだない（さわると新しく作る）', ok: 'あり', broken: '壊れてる（変えられない。D2・D3 で直すか「冒険データを消す」でやり直してね）',
    newer: '新しい版（この管理ページでは変えられない。本編を新しくしてね）' };
  // 変える操作の欄・ボタン（「冒険データを消す」は別。壊れたセーブはそれで直せる）
  const rpgEditCtl = () => [...$('d-rpg').querySelectorAll('[data-coins], #d-rpg-floors select'),
    ...['d-rpg-lv', 'd-rpg-lv-set', 'd-rpg-pity', 'd-rpg-pity-set', 'd-rpg-unlock', 'd-rpg-clear', 'd-rpg-story', 'd-rpg-card', 'd-rpg-card-give'].map($)];
  function renderRpg() {
    let x, st;
    const lock = on => { for (const c of rpgEditCtl()) c.disabled = on; $('d-rpg-wipe').disabled = st === 'newer'; };
    try { st = SAVE.rpgStatus(); x = SAVE.rpgGet(); } catch { st = 'broken'; }
    if (!x || st === 'broken') {   // 壊れているときの中身は新品のものなので出さない
      $('d-rpg-floors').replaceChildren();
      $('d-rpg-sum').replaceChildren(el('dt', { text: 'セーブ' }), el('dd', { class: 'ng', text: RPG_STATUS.broken }));
      lock(true);
      return;
    }
    const sum = [['セーブ', RPG_STATUS[st] ?? RPG_STATUS.ok], ['コイン', x.coins.toLocaleString('ja-JP')], ['Lv', x.lv],
      ['仲間', `${Object.keys(x.cards).length}か国`], ['天井カウンター', x.pity], ['ストーリー既読', `${x.story.length}話`]];
    $('d-rpg-sum').replaceChildren(...sum.flatMap(([k, v], i) => [el('dt', { text: k }), el('dd', { class: i === 0 && st === 'newer' ? 'ng' : 'mono', text: String(v) })]));
    $('d-rpg-lv').max = RPG_CORE.TUNING.hero.maxLv;
    if (document.activeElement !== $('d-rpg-lv')) $('d-rpg-lv').value = x.lv;
    if (document.activeElement !== $('d-rpg-pity')) $('d-rpg-pity').value = x.pity;
    const box = $('d-rpg-floors');
    box.replaceChildren(...RPG_CORE.DUNGEONS.map(g => {
      const sel = el('select', { 'data-floor': g.id, 'aria-label': `${g.name}のフロア` },
        ...[0, 1, 2, 3, 4, 5].map(n => el('option', { value: String(n), text: n === 5 ? '5 ★' : String(n) })));
      sel.value = String(x.floors[g.id] || 0);
      return el('label', { class: 'floor', title: g.name }, el('span', { text: g.name }), sel);
    }));
    lock(st === 'newer');
  }
  function rpgCard() {
    const code = $('d-rpg-card').value.trim().toLowerCase();
    const c = COUNTRIES.find(x => x.a === code);
    if (!c) { toast('その国コードは無いよ（jp・fr のような2文字）', true); return; }
    if (done(SAVE.rpgGiveCard(code), `${c.n} のカードをあげたよ`)) $('d-rpg-card').value = '';
  }

  // ---- D7 バッジ ----
  function renderBadges() {
    const r = SAVE.read('badges'), got = r.ok && r.value && r.value.got && typeof r.value.got === 'object' ? r.value.got : {};
    const cat = BADGES_CORE.makeCatalog(COUNTRIES), list = $('d-badges-list');
    let n = 0, total = 0;
    list.replaceChildren(...cat.flatMap(b => b.tiers.map((t, i) => {
      const key = `${b.id}@${i + 1}`, on = Object.hasOwn(got, key);
      total++; if (on) n++;
      const box = el('input', { type: 'checkbox', checked: on, 'data-step': key });
      return el('label', {}, box, el('span', { text: `${b.icon} ${b.name}${b.tiers.length > 1 ? ` ${i + 1}段目` : ''}「${t.title}」` }));
    })));
    $('d-badges-sum').textContent = `${n} / ${total} ステップ取ってる`;
    // 称号を選ぶ: 自動（本編が一番いいものを選ぶ＝eq が null）・つけない（''）・取っているステップ
    const eq = r.ok && r.value && (r.value.eq === '' || typeof r.value.eq === 'string') ? r.value.eq : null;
    const owned = cat.flatMap(b => b.tiers.map((t, i) => [`${b.id}@${i + 1}`, `${b.icon} ${t.title}`])).filter(([k]) => Object.hasOwn(got, k));
    const sel = $('d-badges-eq');
    sel.replaceChildren(el('option', { value: AUTO_EQ, text: '自動（本編が選ぶ）' }), el('option', { value: '', text: 'つけない' }),
      ...owned.map(([k, l]) => el('option', { value: k, text: l })));
    sel.value = eq === null ? AUTO_EQ : owned.some(([k]) => k === eq) || eq === '' ? eq : AUTO_EQ;
  }
  const AUTO_EQ = '\u0000auto';   // 「自動」の option の値（ステップのキーとぶつからない）

  // ---- D8 今日の難問 ----
  const DAILY_STATUS = { done: '終わった', playing: 'とちゅう' };   // daily.js の status
  function renderDaily() {
    const input = $('d-daily-day');
    if (!input.value) input.value = DAILY_CORE.jstDay();
    const day = input.value, body = $('d-daily-body');
    if (!DAILY_CORE.validDay(day)) { body.replaceChildren(el('tr', {}, el('td', { colSpan: 4, text: '日付がおかしいよ' }))); return; }
    const qs = SAVE.dailyQuestions(day);
    body.replaceChildren(...qs.map((q, i) => el('tr', {},
      el('td', { class: 'n', text: String(i + 1) }),
      el('td', {}, q.n, ' ', el('span', { class: 'mono muted', text: q.a })),
      el('td', { text: MODE_LABEL[q.mode] ?? q.mode }),
      el('td', {}, el('span', { class: 'mono', text: `${q.opts.indexOf(q.a) + 1}番目` }), ' ', q.n))));
    // 「この端末の今日の記録を消す」は今日の日付を選んでいるときだけ（ほかの日の記録はこの端末に無い）
    $('d-daily-reset').disabled = day !== DAILY_CORE.jstDay();
    const rec = SAVE.read('daily');
    $('d-daily-rec').textContent = rec.ok && rec.value
      ? `この端末の記録: ${rec.value.day ?? '?'}（${DAILY_STATUS[rec.value.status] ?? str(rec.value.status ?? '?')}${rec.value.correct != null ? `・${rec.value.correct}問正解` : ''}）`
      : 'この端末の記録: まだない';
  }

  // ---- D9 設定 ----
  // 欄を変えてまだ保存していないあいだは、ほかの操作で描き直しても欄を戻さない
  function renderSettings() {
    if (setDirty) return;
    const s = SAVE.settingsGet();
    $('d-set-theme').value = ['light', 'dark', 'auto'].includes(s.theme) ? s.theme : 'light';
    const reg = $('d-set-region'), cur = s.region ?? 'all';
    const opts = [['all', '全世界'], ...REGIONS.map(r => [r, r])];
    if (!opts.some(([v]) => v === cur)) opts.push([cur, cur]);
    reg.replaceChildren(...opts.map(([v, l]) => el('option', { value: v, text: l })));
    reg.value = cur;
    $('d-set-sound').checked = s.sound !== false;
    $('d-set-vol').value = Number.isFinite(+s.vol) ? s.vol : 70;
    $('d-set-vol-n').textContent = $('d-set-vol').value;
    $('d-set-dopa').checked = !!s.dopa;
    $('d-set-name').checked = !!SAVE.setupGet().name;
  }
  // 音量は本編の設定画面と同じ 10〜100 の10きざみ（本編の画面で出せない値を書かない）
  const volOf = v => Math.min(100, Math.max(10, Math.round((+v || 70) / 10) * 10));
  function saveSettings() {
    const patch = { theme: $('d-set-theme').value, region: $('d-set-region').value, sound: $('d-set-sound').checked, vol: volOf($('d-set-vol').value), dopa: $('d-set-dopa').checked };
    const r = SAVE.settingsSet(patch);
    if (r && r.ok === false) { fail(r); return; }
    const r2 = SAVE.setupSet({ name: $('d-set-name').checked });   // 国名表示は本編の setup.name
    if (r2 && r2.ok === false) { fail(r2); return; }
    setDirty = false;
    if (done(r2, '設定を保存したよ')) applyTheme(patch.theme);
  }

  // ---- D10 効果音 ----
  function renderSounds() {
    $('d-sound-list').replaceChildren(...SND.kinds.map(k => el('button', { class: 'btn ghost sm', 'data-snd': k, text: k })));
  }

  // ---- D12 端末の情報 ----
  function renderEnv(extra = {}) {
    const mm = q => matchMedia(q).matches;
    const keys = SAVE.keys(), used = Array.isArray(keys) ? keys.reduce((n, k) => n + k.bytes + k.key.length, 0) : null;
    const rows = [
      ['ブラウザ', navigator.userAgent],
      ['画面', `${screen.width}×${screen.height}（窓 ${innerWidth}×${innerHeight}・倍率 ${devicePixelRatio}）`],
      ['ダーク/ライト', `端末は${mm('(prefers-color-scheme: dark)') ? 'ダーク' : 'ライト'}・このページは${document.documentElement.dataset.theme ?? '端末に合わせる'}`],
      ['動きを減らす', mm('(prefers-reduced-motion: reduce)') ? 'オン' : 'オフ'],
      ['タッチ', mm('(hover: none) and (pointer: coarse)') ? 'タッチ中心' : 'マウス・トラックパッド'],
      ['localStorage', used == null ? '読めない' : `${fmtBytes(used)}（${keys.length}個のキー）`],
      ['オンライン', navigator.onLine ? 'オンライン' : 'オフライン'],
      ['Supabase', extra.ping ?? '下のボタンで確かめる'],
    ];
    $('d-env-list').replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  }
  let lastPing;
  async function ping() {
    renderEnv({ ping: 'しらべてる…' });
    const t0 = performance.now();
    try {
      const res = await fetch(`${SUPABASE}/auth/v1/health`, { headers: { apikey: PUBLIC_KEY }, signal: AbortSignal.timeout(8000) });
      lastPing = `つながる（HTTP ${res.status}・${Math.round(performance.now() - t0)}ms）`;
    } catch { lastPing = 'つながらない'; }
    renderEnv({ ping: lastPing });
  }

  // ---- D14 データ点検 ----
  function renderCheck() {
    const { problems, counts } = SAVE.checkData();
    const sum = $('d-check-sum');
    sum.replaceChildren(el('span', { class: problems.length ? 'ng' : 'ok', text: problems.length ? `${problems.length}件おかしい` : '問題なし' }),
      `（${counts.countries}か国・${counts.regions}地域）`);
    $('d-check-list').replaceChildren(...problems.map(p => el('li', { text: p })));
  }

  // 区画ごとに描く。1つが壊れたセーブで例外を出しても、その区画にだけ1行出して、ほかの区画は描く
  function safe(secId, fn) {
    const body = $(secId)?.querySelector('.body') ?? $(secId);
    let line = body?.querySelector(':scope > p[data-err]');
    try { fn(); line?.remove(); }
    catch (e) {
      if (!body) return;
      if (!line) { line = el('p', { class: 'ng', 'data-err': '' }); body.prepend(line); }
      line.textContent = `この区画を出せなかった（${String(e && e.message || e).slice(0, 200)}）`;
    }
  }
  function renderAll() {
    safe('d-saves', renderKeys); safe('d-saves', syncEditor); safe('d-snaps', renderSnaps); safe('d-rpg', renderRpg); safe('d-badges', renderBadges);
    safe('d-daily', renderDaily); safe('d-settings', renderSettings); safe('d-env', () => renderEnv({ ping: lastPing }));
  }

  // ======== ランキング（S1〜S4・S6・S7・S12〜S14）。サーバーから来た文字は textContent だけで入れる ========
  const PAGE = 100;
  const KIND_LABEL = { scores: 'タイムアタック', daily: '今日の難問', rpg: '冒険', trash: 'ゴミ箱' };
  const ACTION = { delete: '消す', restore: '戻す', rename: '名前を変える' };
  const LOGIN_MSG = { bad_login: 'メールかパスワードがちがうよ', not_admin: 'このアカウントは管理者じゃないよ', network: 'つながらなかった', rate_limited: 'ログインを試しすぎ。少し待ってね' };
  const RENAME_MSG = { bad_name: '名前は1〜12文字だよ', ng_name: '使えない言葉が入ってるよ', name_taken: 'その名前はもう使われてるよ', not_found: 'その記録はもう無いよ' };
  const fmtMs = ms => Number.isFinite(+ms) ? `${(ms / 1000).toFixed(2)}秒` : '';
  const fmtFull = iso => { const d = new Date(iso); return iso == null || Number.isNaN(+d) ? '' : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const str = v => v == null ? '' : String(v);
  // 表の列: [見出し, 値を文字にする関数, td の class]
  const COLS = {
    scores: [['id', r => str(r.id), 'n'], ['ボード', r => str(r.board), 'brk'], ['名前', r => str(r.nickname), 'name'], ['タイム', r => fmtMs(r.time_ms), 'n'],
      ['問題', r => str(r.questions), 'n'], ['いつ', r => fmtFull(r.created_at), 'n']],
    daily: [['id', r => str(r.id), 'n'], ['日付', r => str(r.day), 'n'], ['名前', r => str(r.nickname), 'name'], ['正解', r => `${str(r.correct)}/${str(r.total)}`, 'n'],
      ['タイム', r => fmtMs(r.time_ms), 'n'], ['いつ', r => fmtFull(r.created_at), 'n']],
    rpg: [['id', r => str(r.id), 'n'], ['名前', r => str(r.nickname), 'name'], ['Lv', r => str(r.lv), 'n'], ['ダンジョン', r => str(r.dungeons), 'n'],
      ['フロア', r => str(r.floors), 'n'], ['登録', r => fmtFull(r.created_at), 'n'], ['更新', r => fmtFull(r.updated_at ?? r.at), 'n']],
    trash: [['id', r => str(r.id), 'n'], ['種類', r => KIND_LABEL[r.kind] ?? str(r.kind), ''], ['名前', r => str(r.row_data?.nickname), 'name'],
      ['中身', r => trashSummary(r), 'brk'], ['消した', r => fmtFull(r.at), 'n']],
  };
  // CSV の列（行の生の値。ゴミ箱は row_data を JSON のまま）
  const CSV_COLS = {
    scores: ['id', 'board', 'nickname', 'time_ms', 'questions', 'created_at'],
    daily: ['id', 'day', 'nickname', 'correct', 'total', 'time_ms', 'created_at'],
    rpg: ['id', 'nickname', 'lv', 'dungeons', 'floors', 'created_at', 'updated_at'],
    trash: ['id', 'kind', 'at', 'row_data'],
  };
  function trashSummary(t) {
    const d = t.row_data || {};
    if (t.kind === 'scores') return `id ${str(d.id)}・${str(d.board)}・${fmtMs(d.time_ms)}`;
    if (t.kind === 'daily') return `id ${str(d.id)}・${str(d.day)}・${str(d.correct)}/${str(d.total)}・${fmtMs(d.time_ms)}`;
    if (t.kind === 'rpg') return `id ${str(d.id)}・Lv ${str(d.lv)}・ダンジョン ${str(d.dungeons)}・フロア ${str(d.floors)}`;
    return '';
  }
  function logDetail(l) {
    const d = l.detail || {};
    if (l.action === 'delete') { const ids = Array.isArray(d.ids) ? d.ids : []; return `${ids.length}件（id ${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ' …' : ''}）`; }
    if (l.action === 'restore') return `戻した ${str(d.restored)}件・戻せなかった ${str(d.failed)}件`;
    if (l.action === 'rename') return `id ${str(d.id)}: ${str(d.before)} → ${str(d.after)}`;
    try { return JSON.stringify(d).slice(0, 300); } catch { return ''; }
  }

  let API;
  // rowsKind: rows を読んだときの種類。種類を切りかえたら null にして、新しい種類の一覧が来るまで消す・戻す・名前・CSV をしない
  // rowsFilter: rows を読んだときの絞りこみ（CSV はこれを使う。欄に書いただけでまだ探していない値は使わない）
  // epoch: ログアウト・ログインし直しで進める。待っていた返事が、そのあとで画面に出ないように
  // busy: 消す・戻す・名前を変えるの途中（終わるまで、ほかの操作のボタンを押せなくする）
  const R = { kind: 'scores', offset: 0, rows: [], total: 0, seq: 0, epoch: 0, loaded: false, rowsKind: null, rowsFilter: null, busy: false };
  const listReady = () => R.rowsKind === R.kind;
  // 一覧の表をからにする（種類の切りかえ・ログアウトのとき）
  function clearTable() {
    R.seq++;   // 待っている一覧の返事は捨てる
    R.rows = []; R.total = 0; R.rowsKind = null; R.rowsFilter = null;
    const tbl = $('r-table');
    tbl.removeAttribute('data-ready');
    tbl.tHead.replaceChildren(); tbl.tBodies[0].replaceChildren();
    $('r-page').textContent = ''; $('r-picked').textContent = '';
    $('r-prev').disabled = $('r-next').disabled = true;
    $('r-daily-qs').hidden = true; $('r-daily-qs-list').replaceChildren();
    setActs();
  }
  // 一覧が読めるまでは操作のボタンを押せなくする
  function setActs() {
    const ok = listReady() && !R.busy;
    $('r-del').disabled = $('r-restore').disabled = $('r-csv').disabled = !ok;
    for (const b of $('r-table').tBodies[0].querySelectorAll('.acts button')) b.disabled = R.busy;
  }
  // 消す・戻す・名前を変えるを1つずつ（返事を待つあいだに2回押されても2回送らない）
  async function exclusive(fn) {
    if (R.busy) return;
    R.busy = true; setActs();
    try { await fn(); } finally { R.busy = false; setActs(); }
  }
  // ログアウト・30分・ログインし直し: サーバーから来た名前などを画面からもメモリからも消す
  function clearServerData() {
    R.epoch++;
    clearTable();
    for (const b of $('r-dash').querySelectorAll('[data-n]')) b.textContent = '–';
    for (const b of $('r-dash').querySelectorAll('[data-sub]')) b.textContent = '';
    $('r-last').textContent = ''; $('r-stale').textContent = ''; $('r-stale').classList.remove('warn');
    $('r-recent').replaceChildren();
    $('r-f-board').replaceChildren(el('option', { value: '', text: 'ボード: 全部' }));
    $('r-daily-qs').hidden = true; $('r-daily-qs-list').replaceChildren();
    $('l-ops-table').tBodies[0].replaceChildren(); $('l-ops-page').textContent = '';
    ops.offset = 0; ops.total = 0;
  }

  function setWho() {
    const on = API.loggedIn();
    $('adm-who').textContent = on ? (API.email() || 'ログイン中') : 'ログインしてない';
    $('adm-logout').hidden = !on;
  }
  function showLogin(msg = '') {
    R.loaded = false;
    clearServerData();
    $('r-login').hidden = false;
    $('r-dash').hidden = true;
    $('r-login-msg').textContent = msg;
    setWho();
    if (!$('tab-log').hidden) loadOps();
  }
  // 管理の関数を呼ぶ。だめなら知らせて null（relogin ならログイン画面へ）。
  // how.netMsg: つながらなかったときの知らせ（消すなど、サーバーでは済んでいるかもしれない操作で使う）。
  // つながらなかった（返事が来なかった）ときは how.lost を true にする。
  // ログアウト・ログインし直しの前に送ったものの失敗（epoch が進んだ・API の 'stale'）は何も知らせない（今のログインを追い出さない）
  async function rpc(name, args, how = {}) {
    const ep = R.epoch;
    try { return await API.call(name, args); }
    catch (e) {
      if (ep !== R.epoch || e.code === 'stale') return null;
      if (e.code === 'relogin') { if (!API.loggedIn()) showLogin('ログインし直してね'); }
      else if (e.code === 'denied') toast('このアカウントは管理者じゃないよ', true);
      else if (e.code === 'network') { how.lost = true; toast(how.netMsg ?? 'つながらなかった', true); }
      else toast(`うまくいかなかった${e.status ? `（HTTP ${e.status}）` : ''}`, true);
      return null;
    }
  }
  async function showDash() {
    R.loaded = true;
    $('r-login').hidden = true;
    $('r-dash').hidden = false;
    $('r-login-msg').textContent = '';
    setWho();
    setKind(R.kind, false);
    await Promise.all([loadStats(), loadBoards()]);
    if (API.loggedIn()) await loadList();
  }

  // ---- S1・S14 件数と最後の記録 ----
  async function loadStats() {
    const ep = R.epoch, s = await rpc('admin_stats', {});
    if (ep !== R.epoch || !R.loaded || !s || s.ok === false) return;
    for (const k of ['scores', 'daily', 'rpg']) {
      $('r-dash').querySelector(`[data-n="${k}"]`).textContent = str(s.counts?.[k] ?? 0);
      $('r-dash').querySelector(`[data-sub="${k}"]`).textContent = `今日 ${str(s.today?.[k] ?? 0)}・今週 ${str(s.week?.[k] ?? 0)}${k === 'rpg' ? '（登録）' : ''}`;
    }
    const last = s.last_at ? Date.parse(s.last_at) : NaN, stale = $('r-stale');
    $('r-last').textContent = Number.isNaN(last) ? 'まだ記録がないよ' : `最後の記録: ${fmtFull(s.last_at)}`;
    if (Number.isNaN(last)) { stale.textContent = ''; stale.classList.remove('warn'); }
    else {
      const days = Math.max(0, Math.floor((Date.now() - last) / 86400e3));
      // Supabase は「アクセス」が7日無いと止まる。ランキングを見るだけでもアクセスになるが、ここで分かるのは記録の時刻だけなので目安
      stale.textContent = `最後の記録から ${days}日（Supabase は7日アクセスが無いと止まる。見るだけでもアクセスなので、これは記録から数えた目安）`;
      stale.classList.toggle('warn', days >= 5);
    }
    const log = Array.isArray(s.recent_log) ? s.recent_log : [];
    $('r-recent').replaceChildren(...(log.length ? log.map(l => el('li', {},
      el('span', { class: 'mono muted', text: fmtAt(l.at) }), el('b', { text: ACTION[l.action] ?? str(l.action) }),
      el('span', { text: KIND_LABEL[l.kind] ?? '' }), el('span', { class: 'grow', text: logDetail(l) })))
      : [el('li', { class: 'muted', text: 'まだないよ' })]));
  }
  async function loadBoards() {
    const ep = R.epoch, r = await rpc('admin_boards', {});
    if (ep !== R.epoch || !R.loaded || !r || !Array.isArray(r.boards)) return;
    const sel = $('r-f-board'), cur = sel.value;
    sel.replaceChildren(el('option', { value: '', text: 'ボード: 全部' }),
      ...r.boards.map(b => el('option', { value: str(b.board), text: `${str(b.board)}（${str(b.n)}）` })));
    sel.value = r.boards.some(b => b.board === cur) ? cur : '';
  }

  // ---- S2〜S4 一覧 ----
  function setKind(k, load = true) {
    if (k !== R.kind || R.rowsKind !== k) clearTable();   // 前の種類の行を残さない（ちがう表の同じ id を消したり名前を変えたりしないように）
    R.kind = k; R.offset = 0;
    for (const b of $('r-kind').querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === k));
    $('r-f-board').hidden = $('r-f-period').hidden = k !== 'scores';
    $('r-f-day').hidden = k !== 'daily';
    $('r-f-sort').hidden = k === 'trash';
    $('r-del').hidden = k === 'trash';
    $('r-restore').hidden = k !== 'trash';
    $('r-table').dataset.kind = k;
    setActs();
    if (load) loadList(0);
  }
  function filter(offset = R.offset) {
    const f = { q: $('r-f-q').value.trim(), limit: PAGE, offset };
    if (R.kind !== 'trash') f.sort = $('r-f-sort').value;
    if (R.kind === 'scores') { if ($('r-f-board').value) f.board = $('r-f-board').value; f.period = $('r-f-period').value; }
    if (R.kind === 'daily' && $('r-f-day').value) f.day = $('r-f-day').value;
    return f;
  }
  // 絞りこみのページ以外の部分（同じ絞りこみか比べる用）
  const filterKey = f => { const { offset, limit, ...k } = f; return JSON.stringify(k); };
  // offset: 読みたいページの始まり。R.offset は読めたときだけ進める（失敗したら今のページのまま）
  // stale: 出ている行がもうサーバーに無いかもしれない（消した・戻したあと）。読めなかったら行を残さず消す
  // same: 今出ている一覧を作った絞りこみのまま読む（次・前・読み直す。欄に書いただけで探していない値は使わない）。
  // 一覧がまだ無い（種類を変えた・読めなかった）ときは欄の値で読む。given: この絞りこみで読む（前のページへ戻るとき）
  async function loadList(offset = R.offset, { stale = false, same = false, given = null } = {}) {
    const seq = ++R.seq, ep = R.epoch, tbl = $('r-table'), kind = R.kind;
    const base = given ?? (same && listReady() ? R.rowsFilter : null), f = base ? { ...base, offset } : filter(offset);
    tbl.removeAttribute('data-ready');
    const r = await rpc('admin_list', { p_kind: kind, p_filter: f });
    if (seq !== R.seq || ep !== R.epoch || kind !== R.kind) return;
    if (!r || r.ok === false || !Array.isArray(r.rows)) {
      if (r) toast('一覧が読めなかった', true);
      if (!R.loaded) return;   // ログインし直し（showLogin が表を消した）
      // ページを動かしただけ・読み直しなら、出ている行は今の絞りこみのままなので残す。
      // 絞りこみ（名前・ボード・日付など）を変えて読めなかったら、前の絞りこみの行を出したままにしない
      if (!stale && R.rowsKind === kind && filterKey(R.rowsFilter) === filterKey(f)) return;
      clearTable();
      R.offset = offset;
      tbl.tBodies[0].replaceChildren(el('tr', {}, el('td', { colSpan: COLS[kind].length + 2, class: 'muted', 'data-fail': '', text: '読みこめなかった。もう一回押してね' })));
      return;
    }
    if (!r.rows.length && offset > 0 && r.total > 0) { loadList(Math.max(0, offset - PAGE), { stale, given: f }); return; }
    R.rows = r.rows; R.total = +r.total || 0; R.offset = offset; R.rowsKind = kind; R.rowsFilter = f;
    renderTable();
    setActs();
    renderDayQs();
    tbl.dataset.kind = kind;
    tbl.dataset.ready = '';
  }
  // S3: 今日の難問で日付を選んでいたら、その日の問題（全員同じ。daily-core.js が日付から作る）も出す
  function renderDayQs() {
    const box = $('r-daily-qs'), day = $('r-f-day').value;
    if (R.kind !== 'daily' || !DAILY_CORE.validDay(day)) { box.hidden = true; $('r-daily-qs-list').replaceChildren(); return; }
    $('r-daily-qs-day').textContent = day;
    $('r-daily-qs-list').replaceChildren(...SAVE.dailyQuestions(day).map(q =>
      el('li', {}, el('span', { text: q.n }), ' ', el('span', { class: 'mono muted', text: `${q.a}・${MODE_LABEL[q.mode] ?? q.mode}` }))));
    box.hidden = false;
  }
  function renderTable() {
    const cols = COLS[R.kind], tbl = $('r-table'), canRename = R.kind !== 'trash';
    const all = el('input', { type: 'checkbox', id: 'r-pick-all', 'aria-label': 'このページを全部選ぶ' });
    tbl.tHead.replaceChildren(el('tr', {}, el('th', { class: 'pick' }, all), ...cols.map(([h]) => el('th', { text: h })), ...(canRename ? [el('th', { class: 'acts', text: '操作' })] : [])));
    const body = tbl.tBodies[0];
    // 操作の列は右はしに貼りつける（スマホで表を横に動かさなくても押せる）
    if (!R.rows.length) body.replaceChildren(el('tr', {}, el('td', { colSpan: cols.length + 2, class: 'muted', text: 'ないよ' })));
    else body.replaceChildren(...R.rows.map(row => el('tr', { 'data-id': str(row.id) },
      el('td', { class: 'pick' }, el('input', { type: 'checkbox', 'data-pick': '', 'aria-label': `id ${str(row.id)} を選ぶ` })),
      ...cols.map(([, f, c]) => el('td', { class: c, text: f(row) })),
      ...(canRename ? [el('td', { class: 'acts' }, el('div', { class: 'acts-in' },
        el('button', { type: 'button', class: 'btn ghost sm', 'data-rename': '', text: '名前を変える' }),
        el('button', { type: 'button', class: 'btn ghost sm', 'data-nameless': '', text: '名無しにする' }),
        el('button', { type: 'button', class: 'btn danger sm', 'data-byname': '', text: 'この名前の記録を全部消す' })))] : []))));
    const from = R.rows.length ? R.offset + 1 : 0;
    $('r-page').textContent = R.total ? `${from}〜${R.offset + R.rows.length} / ${R.total}` : '0件';
    $('r-prev').disabled = R.offset <= 0;
    $('r-next').disabled = R.offset + PAGE >= R.total;
    updatePicked();
  }
  const picked = () => [...$('r-table').tBodies[0].querySelectorAll('input[data-pick]:checked')].map(b => Number(b.closest('tr').dataset.id));
  // 「全部選ぶ」の箱も、全部選んでいれば ✓、いくつかだけなら途中（indeterminate）にそろえる
  const updatePicked = () => {
    const n = picked().length, all = $('r-pick-all'), m = $('r-table').tBodies[0].querySelectorAll('input[data-pick]').length;
    $('r-picked').textContent = n ? `${n}件選んでる` : '';
    if (all) { all.checked = m > 0 && n === m; all.indeterminate = n > 0 && n < m; }
  };

  // ---- S6 消す・戻す ----
  async function delPicked() {
    if (!listReady()) return;
    const ids = picked();
    if (!ids.length) { toast('消す記録を選んでね', true); return; }
    if (!confirm(`${KIND_LABEL[R.kind]}の記録を ${ids.length}件消していい？\n（ゴミ箱に30日のこるよ）`)) return;
    const how = { netMsg: UNSURE_DEL }, r = await rpc('admin_delete', { p_kind: R.kind, p_ids: ids }, how);
    // 返事が来なかったときは、サーバーでは消えているかもしれないので読み直す（読み直しの知らせで消えないよう、あとでもう一度出す）
    if (how.lost) { await reloadAfterChange(); toast(UNSURE_DEL, true); return; }
    if (!r) return;
    if (r.ok === false) { toast('消せなかった', true); return; }
    toast(`${str(r.deleted)}件消したよ（ゴミ箱から戻せる）`);
    await reloadAfterChange();
  }
  const UNSURE_DEL = '消えたか分からない。一覧を読み直して確かめてね', UNSURE_RESTORE = '戻ったか分からない。一覧を読み直して確かめてね';
  // 消す・戻すのあと: 出ている行はもう無いかもしれないので、読み直せなかったら行を消す
  const reloadAfterChange = () => Promise.all([loadList(R.offset, { stale: true, same: true }), loadStats(), loadBoards()]);
  async function restorePicked() {
    if (!listReady()) return;
    const ids = picked();
    if (!ids.length) { toast('戻す記録を選んでね', true); return; }
    // 冒険の記録は、その端末が登録をやめていたら（合札を捨てていたら）だれも使わない行になって、その名前をふさぐ
    const rpgN = R.rows.filter(t => ids.includes(Number(t.id)) && t.kind === 'rpg').length;
    if (rpgN && !confirm(`冒険の記録が ${rpgN}件あるよ。その端末が登録をやめていたら、戻した行はだれも更新できないまま名前だけふさぐよ（ほかの人がその名前を使えない）。\n戻していい？`)) return;
    const how = { netMsg: UNSURE_RESTORE }, r = await rpc('admin_restore', { p_trash_ids: ids }, how);
    // 返事が来なかったときは、サーバーでは戻っているかもしれないので読み直す（読み直しの知らせで消えないよう、あとでもう一度出す）
    if (how.lost) { await reloadAfterChange(); toast(UNSURE_RESTORE, true); return; }
    if (!r) return;
    if (r.ok === false) { toast('戻せなかった', true); return; }
    toast(`${str(r.restored)}件戻したよ${r.failed ? `・戻せなかった ${str(r.failed)}件（同じ id か同じ名前がもうある）` : ''}`, !!r.failed);
    await reloadAfterChange();
  }
  // ---- S7 名前を変える（空で OK なら「名無しの旅人」＋数字） ----
  async function rename(id, nameless = false) {
    if (!listReady()) return;
    const kind = R.rowsKind, row = R.rows.find(r => Number(r.id) === id);
    if (!row) return;
    let name;
    if (nameless) {   // S7 不適切な名前をワンタップで「名無しの旅人」＋数字に
      if (!confirm(`${KIND_LABEL[kind]}の id ${id}「${str(row.nickname)}」を「名無しの旅人」＋数字にしていい？`)) return;
      name = '';
    } else {
      name = prompt(`${KIND_LABEL[kind]}の id ${id} の新しい名前（1〜12文字。空にすると「名無しの旅人」＋数字になるよ）`, str(row.nickname));
      if (name == null) return;
    }
    const r = await rpc('admin_rename', { p_kind: kind, p_id: id, p_name: name.trim() === '' ? null : name });
    if (!r) return;
    if (r.ok === false) { toast(RENAME_MSG[r.reason] ?? '名前を変えられなかった', true); return; }
    toast(`「${str(r.nickname)}」にしたよ`);
    await Promise.all([loadList(R.offset, { same: true }), loadStats()]);
  }
  // admin_list を全部のページ読む（500件ずつ、max 件まで）。だめなら null。{ rows, total }
  async function listAll(kind, f, max = ALL_MAX) {
    const rows = [];
    let total = 0;
    for (let offset = 0; offset < max; offset += 500) {
      const r = await rpc('admin_list', { p_kind: kind, p_filter: { ...f, limit: Math.min(500, max - offset), offset } });
      if (!r || r.ok === false || !Array.isArray(r.rows)) return null;
      total = +r.total || 0;
      rows.push(...r.rows);
      if (!r.rows.length || rows.length >= total) break;
    }
    return { rows, total };
  }
  const ALL_MAX = 5000;
  const norm = v => String(v ?? '').normalize('NFKC').toLowerCase();
  // S6 「この名前の記録を全部」: タイムアタック・今日の難問・冒険の全部のページから、同じ名前（NFKC＋小文字で同じ）の記録を集めて消す
  async function delByName(id) {
    if (!listReady()) return;
    const row = R.rows.find(r => Number(r.id) === id);
    if (!row) return;
    // 見せる名前は改行・タブを空白にする（確かめる文の行がくずれないように）
    const name = str(row.nickname), want = norm(name), shown = name.replace(/[\r\n\t\v\f\u0085\u2028\u2029]/g, ' '), found = {};
    for (const k of ['scores', 'daily', 'rpg']) {
      const r = await listAll(k, { q: name });
      if (!r) { toast('記録を集められなかった。何も消してない', true); return; }
      // 候補（名前にこの文字を含む記録）が多すぎて全部は読めなかったら、一部だけ消さずにやめる
      if (r.total > r.rows.length) {
        toast(`${KIND_LABEL[k]}で名前に「${shown}」を含む記録が ${r.total}件あって、一度に集められる ${ALL_MAX}件をこえるので、やめておいた。何も消してない`, true);
        return;
      }
      found[k] = r.rows.filter(x => norm(x.nickname) === want).map(x => Number(x.id));
    }
    const n = Object.values(found).reduce((a, b) => a + b.length, 0);
    if (!n) { toast('その名前の記録はもう無いよ', true); return; }
    const parts = Object.entries(found).filter(([, ids]) => ids.length).map(([k, ids]) => `${KIND_LABEL[k]} ${ids.length}件`);
    if (!confirm(`「${shown}」の記録を全部（${parts.join('・')}、合わせて ${n}件）消していい？\n（全部のページから同じ名前のものを集めたよ。ゴミ箱に30日のこる）`)) return;
    let gone = 0, stopped = false, lost = false;
    for (const [k, ids] of Object.entries(found)) {
      if (!ids.length) continue;
      const how = { netMsg: UNSURE_DEL }, r = await rpc('admin_delete', { p_kind: k, p_ids: ids }, how);
      if (!r || r.ok === false) { stopped = true; lost = !!how.lost; break; }
      gone += +r.deleted || 0;
    }
    // 途中で止まったら、成功の知らせで上書きせず、1つの知らせにまとめる。
    // 返事が来なかったときは、サーバーでは消えているかもしれない（「消してない」とは言わない）
    if (lost) {   // 読み直しの知らせで消えないよう、読み直したあとで出す
      await reloadAfterChange();
      toast(gone ? `${gone}件消したよ。残りは${UNSURE_DEL}` : UNSURE_DEL, true);
      return;
    }
    if (stopped) toast(gone ? `${gone}件消したけど、途中で止まった（残りは消してない）` : '消せなかった（何も消してない）', true);
    else if (gone) toast(`「${shown}」の記録を ${gone}件消したよ（ゴミ箱から戻せる）`);
    else toast('その名前の記録はもう無いよ', true);
    await reloadAfterChange();
  }
  // ---- S13 CSV（今の絞り込みの全部のページ。BOM 付き UTF-8。= + - @ で始まる文字は表計算の式にならないよう ' を前に付ける） ----
  const csvCell = v => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let csvUrl = '';
  async function exportCsv() {
    if (!listReady()) return;
    const kind = R.rowsKind;
    // 今出ている一覧を作った絞りこみで（欄に書いただけで、まだ探していない値は使わない）
    const { offset, limit, ...f } = R.rowsFilter;
    const r = await listAll(kind, f);
    if (!r) return;
    const cols = CSV_COLS[kind];
    const lines = [cols.join(','), ...r.rows.map(x => cols.map(c => csvCell(c === 'updated_at' ? x.updated_at ?? x.at : x[c])).join(','))];
    if (csvUrl) URL.revokeObjectURL(csvUrl);
    csvUrl = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: csvUrl, download: `country-drill-${kind}-${ymd()}.csv` });
    document.body.append(a); a.click(); a.remove();
    toast(r.total > r.rows.length ? `最初の ${r.rows.length}件だけ CSV にしたよ（全部で ${r.total}件）` : `${r.rows.length}件を CSV にしたよ`, r.total > r.rows.length);
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('r-login-btn'), msg = $('r-login-msg');
    btn.disabled = true; msg.textContent = '';
    try {
      const r = await API.login($('r-email').value.trim(), $('r-pass').value);
      if (r.ok) { R.epoch++; $('r-pass').value = ''; toast('ログインしたよ'); await showDash(); }   // ログインする前に送ったものの返事は捨てる
      else msg.textContent = LOGIN_MSG[r.reason] ?? 'ログインできなかった';
    } finally { btn.disabled = false; }
  }
  // API.logout は保存をすぐ消す。サーバーの合札を無効にする返事は待たずに画面を戻す
  async function doLogout() {
    const out = API.logout();
    showLogin('');
    toast('ログアウトしたよ');
    await out;
  }

  // ======== ログ: 操作ログ（admin_log_list）と端末のエラー記録（D13） ========
  const ops = { offset: 0, total: 0 };
  // S12 だれが: 自分（今ログインしている人）ならメール、ほかの人は user_id の頭8文字
  const who = l => { const id = str(l.user_id); return !id ? '' : id === API.uid() ? (API.email() || '自分') : id.slice(0, 8); };
  // offset: 読みたいページの始まり。ops.offset は読めたときだけ進める
  async function loadOps(offset = ops.offset) {
    const tb = $('l-ops-table').tBodies[0], msg = $('l-ops-msg');
    if (!API.loggedIn()) {
      msg.textContent = 'ログインすると見られるよ（ランキングのタブから）';
      tb.replaceChildren(); $('l-ops-page').textContent = '';
      $('l-ops-prev').disabled = $('l-ops-next').disabled = true;
      return;
    }
    msg.textContent = '';
    const ep = R.epoch, r = await rpc('admin_log_list', { p_limit: PAGE, p_offset: offset });
    if (ep !== R.epoch || !r || !Array.isArray(r.rows)) return;
    ops.total = +r.total || 0; ops.offset = offset;
    tb.replaceChildren(...(r.rows.length ? r.rows.map(l => el('tr', {},
      el('td', { class: 'n', text: fmtFull(l.at) }), el('td', { class: 'who', text: who(l) }), el('td', { text: ACTION[l.action] ?? str(l.action) }),
      el('td', { text: KIND_LABEL[l.kind] ?? str(l.kind) }), el('td', { text: logDetail(l) })))
      : [el('tr', {}, el('td', { colSpan: 5, class: 'muted', text: 'まだないよ' }))]));
    $('l-ops-page').textContent = ops.total ? `${ops.offset + 1}〜${ops.offset + r.rows.length} / ${ops.total}` : '';
    $('l-ops-prev').disabled = ops.offset <= 0;
    $('l-ops-next').disabled = ops.offset + PAGE >= ops.total;
  }
  // 1件ずつ文字・数だけを取り出す（ほかのページが変な形の記録を書いても、ログのタブが止まらないように）
  const txt = v => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  const readErrs = () => {
    try {
      const a = JSON.parse(localStorage.getItem('adminErrors'));
      return Array.isArray(a) ? a.filter(x => x && typeof x === 'object').map(x => ({ at: txt(x.at), msg: txt(x.msg), src: txt(x.src), line: txt(x.line) })) : [];
    } catch { return []; }
  };
  function renderErrs() {
    const list = readErrs().slice().reverse();
    $('l-err-list').replaceChildren(...(list.length ? list.map(x => el('li', {},
      el('span', { class: 'mono muted', text: `${fmtFull(x.at || null)}${x.src ? `・${x.src}${x.line && x.line !== '0' ? `:${x.line}` : ''}` : ''}` }),
      el('span', { class: 'msg', text: x.msg })))
      : [el('li', { class: 'muted', text: 'まだないよ' })]));
  }
  async function copyErrs() {
    try { await navigator.clipboard.writeText(JSON.stringify(readErrs(), null, 2)); toast('コピーしたよ'); }
    catch { toast('コピーできなかった', true); }
  }
  function clearErrs() {
    if (!confirm('エラー記録を消していい？')) return;
    try { localStorage.removeItem('adminErrors'); toast('消したよ'); } catch { toast('消せなかった', true); }
    renderErrs();
  }

  function initRank() {
    API = ADMIN_API.create({});
    setWho();
    $('r-login').addEventListener('submit', doLogin);
    $('adm-logout').onclick = doLogout;
    $('r-reload').onclick = () => { loadStats(); loadBoards(); loadList(R.offset, { same: true }); };
    $('r-kind').addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) setKind(b.dataset.kind); });
    $('r-filter').addEventListener('submit', e => { e.preventDefault(); loadList(0); });
    for (const id of ['r-f-board', 'r-f-period', 'r-f-day', 'r-f-sort']) $(id).addEventListener('change', () => loadList(0));
    $('r-prev').onclick = () => loadList(Math.max(0, R.offset - PAGE), { same: true });
    $('r-next').onclick = () => loadList(R.offset + PAGE, { same: true });
    $('r-del').onclick = () => exclusive(delPicked);
    $('r-restore').onclick = () => exclusive(restorePicked);
    $('r-csv').onclick = () => exclusive(exportCsv);   // 作っているあいだは CSV・消す・戻す・名前を押せない
    $('r-table').addEventListener('change', e => {
      if (e.target.id === 'r-pick-all') for (const b of $('r-table').tBodies[0].querySelectorAll('input[data-pick]')) b.checked = e.target.checked;
      updatePicked();
    });
    $('r-table').addEventListener('click', e => {
      const b = e.target.closest('[data-rename], [data-nameless], [data-byname]');
      if (!b) return;
      const id = Number(b.closest('tr').dataset.id);
      exclusive(() => 'byname' in b.dataset ? delByName(id) : rename(id, 'nameless' in b.dataset));
    });
    $('l-ops-load').onclick = () => loadOps();
    $('l-ops-prev').onclick = () => loadOps(Math.max(0, ops.offset - PAGE));
    $('l-ops-next').onclick = () => loadOps(ops.offset + PAGE);
    $('l-err-copy').onclick = copyErrs;
    $('l-err-clear').onclick = clearErrs;
    // 30分さわらないと admin-api.js がログアウト扱いにする。開いたままでも気づけるように時々見る
    setInterval(() => { if (R.loaded && !API.loggedIn()) showLogin('ログインし直してね'); }, 30_000);
  }
  function onTab(name) {
    if (name === 'rank') { if (!API.loggedIn()) { if (R.loaded) showLogin('ログインし直してね'); else { $('r-login').hidden = false; $('r-dash').hidden = true; setWho(); } } else if (!R.loaded) showDash(); }
    if (name === 'log') { safe('l-err', renderErrs); loadOps(); }
  }

  function init() {
    SAVE = ADMIN_SAVE.create(localStorage);
    $('adm-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

    $('d-keys').addEventListener('click', e => { const b = e.target.closest('[data-key]'); if (b) pick(b.dataset.key); });
    $('d-json-save').onclick = saveJson;
    $('d-json-del').onclick = deleteKey;
    $('d-json-copy').onclick = copyJson;

    $('d-dl').addEventListener('click', prepareDownload);
    $('d-file').addEventListener('change', importFile);

    $('d-snap-save').onclick = snapSave;
    $('d-snap-list').addEventListener('click', snapAct);

    $('d-rpg').addEventListener('click', e => {
      const b = e.target.closest('[data-coins]');
      if (!b) return;
      // 知らせるのは本当に変わった数（0 より下・上限では止まる）と今のコイン
      let before = null;
      try { before = SAVE.rpgGet().coins; } catch { /* 読めなければ rpgCoins が断る */ }
      const r = SAVE.rpgCoins(+b.dataset.coins), n = v => v.toLocaleString('ja-JP');
      const d = !failed(r) && Number.isFinite(before) ? r.coins - before : null;
      done(r, d == null ? 'コインを変えたよ' : d ? `コイン ${d > 0 ? '+' : ''}${n(d)}（いま ${n(r.coins)}）` : `コインは変わらなかった（いま ${n(r.coins)}）`);
    });
    $('d-rpg-floors').addEventListener('change', e => {
      const s = e.target.closest('[data-floor]');
      if (s) done(SAVE.rpgSetFloor(s.dataset.floor, +s.value), 'フロアを変えたよ');
    });
    $('d-rpg-lv-set').onclick = () => done(SAVE.rpgSetLv(+$('d-rpg-lv').value), 'Lv を変えたよ');
    $('d-rpg-pity-set').onclick = () => done(SAVE.rpgSetPity(+$('d-rpg-pity').value), '天井カウンターを変えたよ');
    $('d-rpg-unlock').onclick = () => danger('全部開く', () => done(SAVE.rpgUnlockAll(), '全部のダンジョンを開いたよ'));
    $('d-rpg-clear').onclick = () => danger('全部クリア', () => done(SAVE.rpgClearAll(), '全部クリアにしたよ'));
    $('d-rpg-story').onclick = () => danger('ストーリー既読を消す', () => done(SAVE.rpgStoryReset(), 'ストーリー既読を消したよ'));
    $('d-rpg-card-give').onclick = rpgCard;
    $('d-rpg-wipe').onclick = () => danger('冒険データを消す', () => done(SAVE.rpgWipe(), '冒険データを消したよ'));

    $('d-badges-all').onclick = () => danger('バッジを全部取る', () => done(SAVE.badgesAll(), '全部のバッジを取ったよ'));
    $('d-badges-eq').addEventListener('change', e => {
      const v = e.target.value;
      done(SAVE.badgesEq(v === AUTO_EQ ? null : v), v === AUTO_EQ ? '称号は本編が自動で選ぶよ' : v === '' ? '称号をはずしたよ' : '称号をつけたよ');
    });
    $('d-badges-none').onclick = () => danger('バッジを全部消す', () => done(SAVE.badgesNone(), 'バッジを全部消したよ'));
    $('d-badges-list').addEventListener('change', e => {
      const box = e.target.closest('[data-step]');
      if (box) done(SAVE.badgeToggle(box.dataset.step), box.checked ? '取ったことにしたよ' : '取ってないことにしたよ');
    });

    $('d-daily-day').addEventListener('change', renderDaily);
    $('d-daily-reset').onclick = () => danger('この端末の今日の難問の記録を消す', () => done(SAVE.dailyReset(), '今日の難問をもう一回できるようにしたよ'));

    $('d-set-vol').addEventListener('input', () => { $('d-set-vol-n').textContent = $('d-set-vol').value; });
    for (const id of ['d-set-theme', 'd-set-region', 'd-set-sound', 'd-set-vol', 'd-set-dopa', 'd-set-name'])
      for (const ev of ['input', 'change']) $(id).addEventListener(ev, () => { setDirty = true; });
    $('d-set-save').onclick = saveSettings;
    $('d-first').onclick = () => danger('初回状態に戻す', () => { if (restored(SAVE.firstTime(), 'はじめての人にしたよ')) applyTheme('light'); });

    $('d-sound-list').addEventListener('click', e => {
      const b = e.target.closest('[data-snd]');
      if (!b) return;
      // play は40ms以内の連打で null を返す（鳴らさないだけ）ので、返り値ではなく音の名前があるかだけ見る
      if (!SND.kinds.includes(b.dataset.snd)) toast('鳴らせなかった（その音は無いよ）', true);
      else SND.play(b.dataset.snd);
    });

    $('d-env-refresh').onclick = () => renderEnv({ ping: lastPing });
    $('d-env-ping').onclick = ping;
    addEventListener('online', () => renderEnv({ ping: lastPing }));
    addEventListener('offline', () => renderEnv({ ping: lastPing }));

    // 本編の別タブがセーブを書いたら描き直す
    addEventListener('storage', () => { renderAll(); safe('l-err', renderErrs); });

    initRank();
    safe('d-sound', renderSounds); safe('d-check', renderCheck); renderAll(); safe('l-err', renderErrs);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
