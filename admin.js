// 管理ページ（admin.html）の画面の動き。セーブの読み書きは admin-save.js（ADMIN_SAVE）に任せる。
// 変わる文字（キー名・セーブの中身・国名など）はいつも textContent / value / setAttribute で入れる。innerHTML は使わない。
// 本編の S（設定）はここでは作らない: sound.js は S が無いと「効果音オン・音量70」で鳴らすので、効果音のテスト（D10）が本編の設定に左右されない。
(() => {
  // ---- 画面の色（本編の head の先読みと同じ）。DOM ができる前、head で読まれた時点で当てる ----
  try {
    const t = (JSON.parse(localStorage.getItem('settings')) || {}).theme ?? 'light';
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch { /* 読めなければ端末の設定のまま */ }
  const applyTheme = t => { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };

  const SUPABASE = 'https://vgdkklvhtvcamtxwjpke.supabase.co';   // admin-api.js と同じ（D12 のつながるか確かめるだけ）
  const PUBLIC_KEY = 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';
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

  function toast(msg, bad = false) {
    const t = $('adm-toast');
    t.textContent = msg;
    t.classList.toggle('bad', bad);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.textContent = ''; }, 3500);
  }
  const REASON = { not_json: 'JSONが壊れてるよ。保存しなかった', bad_shape: '本編のセーブの形じゃないよ。保存しなかった', storage: 'この端末に書けなかった（容量か設定）', bad_file: '国旗マスターのセーブファイルじゃないよ。何も変えてない', missing: '見つからなかった' };
  const fail = r => toast(REASON[r?.reason] ?? 'うまくいかなかった', true);
  // ok:false の返事なら知らせて false。rpgEdit などは書いた値そのものを返すので、ok が無ければ成功
  const done = (r, msg) => { if (r && r.ok === false) { fail(r); return false; } if (msg) toast(msg); renderAll(); return true; };

  // 危ない操作: 先に自動でスナップショットを取ってから confirm で確かめる
  function danger(label, fn) {
    const s = SAVE.snapSave(`自動 ${label} ${hms()}`);
    if (!s.ok) { toast('自動のスナップショットが取れなかったので、やめておいたよ', true); return; }
    renderSnaps();
    if (!confirm(`「${label}」していい？\n（今の状態はスナップショットに自動で取っておいたよ）`)) return;
    fn();
  }

  // ---- タブ ----
  function showTab(name) {
    for (const b of $('adm-tabs').querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${name}`;
  }

  // ---- D1・D2 セーブ一覧と中身 ----
  function renderKeys() {
    const r = SAVE.keys(), ul = $('d-keys');
    ul.replaceChildren();
    if (!Array.isArray(r)) { ul.append(el('li', { text: 'この端末のセーブが読めない' })); return; }
    if (!r.length) ul.append(el('li', { class: 'muted', text: 'セーブは何もないよ' }));
    for (const { key, bytes } of r) {
      ul.append(el('li', {},
        el('span', { class: 'grow' }, el('button', { class: 'keybtn', 'data-key': key, 'aria-pressed': String(key === current), text: key })),
        el('span', { class: 'mono muted', text: fmtBytes(bytes) })));
    }
  }
  function pick(key) {
    current = key;
    $('d-key').value = key;
    const r = SAVE.read(key);
    $('d-json').value = r.ok ? JSON.stringify(r.value, null, 2) : (r.raw ?? '');
    if (!r.ok && r.reason === 'not_json') toast('JSON じゃない値だよ（そのままでは保存できない）', true);
    renderKeys();
  }
  function saveJson() {
    const key = $('d-key').value.trim();
    if (!key) { toast('キーを入れてね', true); return; }
    const r = SAVE.write(key, $('d-json').value);
    if (r.ok === false) { toast(r.reason === 'not_json' ? 'JSONが壊れてる。保存しなかったよ' : REASON[r.reason] ?? 'うまくいかなかった', true); return; }
    toast(`${key} を保存したよ`);
    renderAll();
    pick(key);
  }
  function deleteKey() {
    const key = $('d-key').value.trim();
    if (!key) { toast('キーを選んでね', true); return; }
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
    if (!obj || obj.app !== 'country-drill' || obj.kind !== 'save') { fail({ reason: 'bad_file' }); return; }
    danger('ファイルから読み戻す', () => done(SAVE.importAll(obj), 'ファイルから読み戻したよ'));
  }

  // ---- D4 スナップショット ----
  function renderSnaps() {
    const ul = $('d-snap-list'), list = SAVE.snapList();
    ul.replaceChildren();
    if (!list.length) ul.append(el('li', { class: 'muted', text: 'まだないよ' }));
    for (const s of list.slice().reverse()) {
      ul.append(el('li', { 'data-snap': s.name },
        el('span', { class: 'grow' }, el('b', { text: s.name }), ' ', el('span', { class: 'mono muted', text: fmtAt(s.at) })),
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
    // 先に中身を取っておく（自動のスナップショットで5個を超えて、戻したいものが押し出されても戻せるように）
    const all = SAVE.read('adminSnaps'), snap = all.ok && Array.isArray(all.value) ? all.value.find(s => s && s.name === name) : null;
    if (!snap) { fail({ reason: 'missing' }); return; }
    danger(`「${name}」に戻す`, () => done(SAVE.importAll({ app: 'country-drill', kind: 'save', data: snap.data }), `「${name}」に戻したよ`));
  }
  function snapSave() {
    const name = $('d-snap-name').value.trim() || `手動 ${hms()}`;
    if (done(SAVE.snapSave(name), `「${name}」を保存したよ`)) $('d-snap-name').value = '';
  }

  // ---- D5 冒険 ----
  function renderRpg() {
    let x;
    try { x = SAVE.rpgGet(); } catch { $('d-rpg-sum').replaceChildren(el('dt', { text: '冒険' }), el('dd', { text: '読めない' })); return; }
    const has = SAVE.read('rpg').ok;
    const sum = [['セーブ', has ? 'あり' : 'まだない（さわると新しく作る）'], ['コイン', x.coins.toLocaleString('ja-JP')], ['Lv', x.lv],
      ['仲間', `${Object.keys(x.cards).length}か国`], ['天井カウンター', x.pity], ['ストーリー既読', `${x.story.length}話`]];
    $('d-rpg-sum').replaceChildren(...sum.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { class: 'mono', text: String(v) })]));
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
  }
  function rpgCard() {
    const code = $('d-rpg-card').value.trim().toLowerCase();
    const c = COUNTRIES.find(x => x.a === code);
    if (!c) { toast('その国コードは無いよ（jp・fr のような2文字）', true); return; }
    if (done(SAVE.rpgGiveCard(code), `${c.n} のカードをあげたよ`)) $('d-rpg-card').value = '';
  }

  // ---- D7 バッジ ----
  function renderBadges() {
    const r = SAVE.read('badges'), got = r.ok && r.value && typeof r.value.got === 'object' ? r.value.got : {};
    const cat = BADGES_CORE.makeCatalog(COUNTRIES), list = $('d-badges-list');
    let n = 0, total = 0;
    list.replaceChildren(...cat.flatMap(b => b.tiers.map((t, i) => {
      const key = `${b.id}@${i + 1}`, on = Object.hasOwn(got, key);
      total++; if (on) n++;
      const box = el('input', { type: 'checkbox', checked: on, 'data-step': key });
      return el('label', {}, box, el('span', { text: `${b.icon} ${b.name}${b.tiers.length > 1 ? ` ${i + 1}段目` : ''}「${t.title}」` }));
    })));
    $('d-badges-sum').textContent = `${n} / ${total} ステップ取ってる`;
  }

  // ---- D8 今日の難問 ----
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
      el('td', { class: 'n', text: `${q.opts.indexOf(q.a) + 1}番目` }))));
    const rec = SAVE.read('daily');
    $('d-daily-rec').textContent = rec.ok && rec.value
      ? `この端末の記録: ${rec.value.day ?? '?'}（${rec.value.status ?? '?'}${rec.value.correct != null ? `・${rec.value.correct}問正解` : ''}）`
      : 'この端末の記録: まだない';
  }

  // ---- D9 設定 ----
  function renderSettings() {
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
  }
  function saveSettings() {
    const patch = { theme: $('d-set-theme').value, region: $('d-set-region').value, sound: $('d-set-sound').checked, vol: +$('d-set-vol').value, dopa: $('d-set-dopa').checked };
    if (done(SAVE.settingsSet(patch), '設定を保存したよ')) applyTheme(patch.theme);
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

  function renderAll() {
    renderKeys(); renderSnaps(); renderRpg(); renderBadges(); renderDaily(); renderSettings(); renderEnv({ ping: lastPing });
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
      if (b) done(SAVE.rpgCoins(+b.dataset.coins), `コイン ${+b.dataset.coins > 0 ? '+' : ''}${b.dataset.coins}`);
    });
    $('d-rpg-floors').addEventListener('change', e => {
      const s = e.target.closest('[data-floor]');
      if (s) done(SAVE.rpgSetFloor(s.dataset.floor, +s.value), 'フロアを変えたよ');
    });
    $('d-rpg-lv-set').onclick = () => done(SAVE.rpgSetLv(+$('d-rpg-lv').value), 'Lv を変えたよ');
    $('d-rpg-pity-set').onclick = () => done(SAVE.rpgSetPity(+$('d-rpg-pity').value), '天井カウンターを変えたよ');
    $('d-rpg-unlock').onclick = () => done(SAVE.rpgUnlockAll(), '全部のダンジョンを開いたよ');
    $('d-rpg-clear').onclick = () => danger('全部クリア', () => done(SAVE.rpgClearAll(), '全部クリアにしたよ'));
    $('d-rpg-story').onclick = () => done(SAVE.rpgStoryReset(), 'ストーリー既読を消したよ');
    $('d-rpg-card-give').onclick = rpgCard;
    $('d-rpg-wipe').onclick = () => danger('冒険データを消す', () => done(SAVE.rpgWipe(), '冒険データを消したよ'));

    $('d-badges-all').onclick = () => done(SAVE.badgesAll(), '全部のバッジを取ったよ');
    $('d-badges-none').onclick = () => danger('バッジを全部消す', () => done(SAVE.badgesNone(), 'バッジを全部消したよ'));
    $('d-badges-list').addEventListener('change', e => {
      const box = e.target.closest('[data-step]');
      if (box) done(SAVE.badgeToggle(box.dataset.step), box.checked ? '取ったことにしたよ' : '取ってないことにしたよ');
    });

    $('d-daily-day').addEventListener('change', renderDaily);
    $('d-daily-reset').onclick = () => danger('今日の難問をやり直す', () => done(SAVE.dailyReset(), '今日の難問をもう一回できるようにしたよ'));

    $('d-set-vol').addEventListener('input', () => { $('d-set-vol-n').textContent = $('d-set-vol').value; });
    $('d-set-save').onclick = saveSettings;
    $('d-first').onclick = () => danger('初回状態に戻す', () => {
      if (done(SAVE.firstTime(), 'はじめての人にしたよ')) applyTheme('light');
    });

    $('d-sound-list').addEventListener('click', e => {
      const b = e.target.closest('[data-snd]');
      if (b && !SND.play(b.dataset.snd)) toast('鳴らせなかった（もう一回押してみて）', true);
    });

    $('d-env-refresh').onclick = () => renderEnv({ ping: lastPing });
    $('d-env-ping').onclick = ping;
    addEventListener('online', () => renderEnv({ ping: lastPing }));
    addEventListener('offline', () => renderEnv({ ping: lastPing }));

    // 本編の別タブがセーブを書いたら描き直す
    addEventListener('storage', () => { renderAll(); if (current && document.activeElement !== $('d-json')) pick(current); });

    renderSounds(); renderCheck(); renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
