// サイト共通のプロフィールと、タイムアタック・今日の難問・冒険のランキング（Supabase）とのやりとりと、送る前の入力チェックだけを持つ小さいモジュール。
// ブラウザでは <script src="ranking.js"> で window.RANKING になる（テストでは vm で読み込む）
(() => {
  // 接続先。publishable キーはブラウザに載せる前提の鍵なので公開してOK（書き込みは DB 側の関数でしか通らない）
  const SUPABASE_URL = 'https://vgdkklvhtvcamtxwjpke.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';
  const TIMEOUT = 8000;
  // supabase/schema.sql の ng_words() と同じ中身にしておくこと（画面には出さない語なので訳さない）
  // i18n-ignore:start
  const NG_WORDS = ['死ね', 'しね', 'シネ', '殺す', 'ころす', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ',
    'せっくす', 'セックス', 'fuck', 'shit', 'bitch', 'sex', 'admin', '運営', '管理人'];
  // i18n-ignore:end
  // index.html の REGIONS → board に入れる英字キー（キーは保存値の日本語のまま。英語は i18n/en-core.js）
  // i18n-data:start
  const REGION_KEY = { 'アジア': 'asia', 'ヨーロッパ': 'europe', 'アフリカ': 'africa', '北・中央アメリカ': 'namerica', '南アメリカ': 'samerica', 'オセアニア': 'oceania' };
  // 返事の理由 → 文。message() で T() を通す（英語は i18n/en-rank.js）
  const MESSAGES = {
    bad_name: 'ニックネームは1〜12文字で入れてね',
    ng_name: 'そのニックネームは使えないみたい',
    too_fast: 'タイムが速すぎて受け付けられなかった',
    too_slow: 'タイムが長すぎて受け付けられなかった',
    too_soon: '少し待ってからもう一回送ってね',
    bad_board: 'この条件はランキングに載せられない',
    bad_record: 'この記録はランキングに載せられない',
    name_taken: 'そのニックネームはもうほかの人が使っているみたい',
    already: 'もう載せてあるよ',
    not_found: 'プロフィールが見つからなかった',
    bad_deco: 'かざりの国が正しくないみたい',
    bad_token: '登録の合言葉がおかしいみたい',
    bad_day: '日付が変わったので、この記録は載せられない',
    bad_code: 'コードがちがうか、期限が切れているみたい',
    too_big: 'データが大きすぎて預けられなかった',
    old_version: '新しい版が出たよ。ページを読み直してね',
    network: 'ランキングに接続できなかった',
  };
  // i18n-data:end

  // RPC を1回呼ぶ。8秒で打ち切り。通信失敗・HTTP エラー・壊れた応答はぜんぶ例外になる
  // HTTP エラーのときは状態と応答本文（PostgREST が原因を書いてくる）をエラーに入れる。状態の数字は e.status にも入れる（404 = 関数がまだ無い）
  async function rpc(name, args) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), TIMEOUT);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST',
        // 新形式のキーは JWT ではないので Authorization は付けない
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: ac.signal,
      });
      if (!res.ok) throw Object.assign(new Error(`${name}: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`), { status: res.status });
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  // 書きこみ系（プロフィール・記録・引き継ぎ）を1回呼ぶ。失敗しても例外は投げず { ok:false, reason } で返す（原因はコンソールに残す）。
  // ok なら map で返事を JS の名前（rank_all → rankAll など）にして ok:true に足す
  async function write(name, args, map = () => ({})) {
    try {
      const r = await rpc(name, args);
      return r.ok ? { ok: true, ...map(r) } : { ok: false, reason: r.reason };
    } catch (e) {
      console.warn(`ranking ${name}`, e);
      return { ok: false, reason: 'network' };
    }
  }
  // ランキングの行の共通部分。pid は古い記録（プロフィールにひもづかない）なら null、deco は配列でなければ空
  const who = r => ({ nickname: r.nickname, pid: r.pid ?? null, deco: Array.isArray(r.deco) ? r.deco : [] });
  // undefined は「変えない」の null で送る（JSON.stringify は undefined の項目を落としてしまうため）
  const orNull = v => v === undefined ? null : v;
  // DB 側は int。performance.now() の端数があると受け付けてもらえないので切り捨てる（formatTime の表示ともそろう）
  const wholeMs = ms => Math.floor(ms);
  const pad2 = n => String(n).padStart(2, '0');

  globalThis.RANKING = {
    enabled: !!(SUPABASE_URL && SUPABASE_KEY),
    // 'モード:地域:問題数'。region は 'all' か日本語の地域名、count は数か 'all'
    boardKey: (modeK, region, count) => `${modeK}:${region === 'all' ? 'all' : REGION_KEY[region]}:${count}`,
    // 前後の空白を除いて1〜12文字（絵文字も1文字）、NGワードは全角半角・大文字小文字をそろえて部分一致
    checkName(name) {
      name = String(name ?? '').trim();
      const len = [...name].length;
      if (len < 1 || len > 12) return { ok: false, reason: 'bad_name' };
      const norm = name.normalize('NFKC').toLowerCase();
      if (NG_WORDS.some(w => norm.includes(w))) return { ok: false, reason: 'ng_name' };
      return { ok: true, name };
    },
    // プロフィール。token は端末が作った合言葉。作る（同じ合言葉がもうあれば reason 'already'）・自分のを読む・名前を変える
    profileCreate: ({ token, nickname }) => write('profile_create', { p_token: token, p_nickname: nickname }, r => ({ pid: r.pid, nickname: r.nickname })),
    profileMe: ({ token }) => write('profile_me', { p_token: token },
      r => ({ pid: r.pid, nickname: r.nickname, isPublic: r.is_public, title: r.title, deco: Array.isArray(r.deco) ? r.deco : [] })),
    profileRename: ({ token, nickname }) => write('profile_rename', { p_token: token, p_nickname: nickname }, r => ({ nickname: r.nickname })),
    // 公開・称号・かざり・バッジの数を一度に送る。渡さなかった項目はサーバー側で前の値のまま
    profileSet: ({ token, isPublic, title, deco, badges, badgesTotal }) => write('profile_set', { p_token: token, p_is_public: orNull(isPublic),
      p_title: orNull(title), p_deco: orNull(deco), p_badges: orNull(badges), p_badges_total: orNull(badgesTotal) }),
    // ランキングから開くプロフィールの窓の中身（rpg.tower は英雄の塔の最高記録の階。無ければ 0）。非公開なら { ok, private:true, pid, nickname, deco } だけ。無ければ { ok:false, reason }。つながらなければ reject
    async profileCard({ pid }) {
      const r = await rpc('profile_card', { p_pid: pid });
      if (!r.ok) return { ok: false, reason: r.reason };
      const base = { ok: true, private: !!r.private, pid: r.pid, nickname: r.nickname, deco: Array.isArray(r.deco) ? r.deco : [] };
      if (r.private) return base;
      return { ...base, title: r.title ?? '', badges: r.badges, badgesTotal: r.badges_total, rpg: r.rpg ? { lv: r.rpg.lv, dungeons: r.rpg.dungeons, tower: r.rpg.tower ?? 0 } : null,
        ta: (r.ta ?? []).map(t => ({ board: t.board, timeMs: t.time_ms, rank: t.rank })),
        daily: { plays: r.daily?.plays ?? 0, perfect: r.daily?.perfect ?? 0 }, since: new Date(r.since) };
    },
    // 引き継ぎ: 前の端末でデータを預けてコード（ハイフン無し12文字）をもらう・新しい端末でコードと新しい合言葉を送って受け取る。
    // コードは全角・小文字・ハイフン・空白まじりでも、大文字だけにして送る
    transferStart: ({ token, data }) => write('profile_transfer_start', { p_token: token, p_data: data }, r => ({ code: r.code, expiresAt: new Date(r.expires_at) })),
    transferClaim: ({ code, newToken }) => write('profile_transfer_claim',
      { p_code: String(code ?? '').normalize('NFKC').replace(/[\s\-\u2010-\u2015\u2212\u30fc]/g, '').toUpperCase(), p_new_token: newToken },
      r => ({ pid: r.pid, nickname: r.nickname, data: r.data })),
    // タイムアタックの記録をプロフィールで送る
    submit2: ({ token, board, timeMs, questions }) => write('submit_score2', { p_token: token, p_board: board, p_time_ms: wholeMs(timeMs), p_questions: questions },
      r => ({ rankAll: r.rank_all, rankWeek: r.rank_week })),
    // 上位50件（同じ人は自己ベストだけ）。period は 'all'（歴代）か 'week'（今週）。失敗したら reject
    async top2({ board, period }) {
      const rows = await rpc('top_scores2', { p_board: board, p_period: period });
      return rows.map(r => ({ ...who(r), timeMs: r.time_ms, at: new Date(r.created_at) }));
    },
    // このタイムなら何位相当か（歴代・今週）。失敗したら reject
    async rankOf({ board, timeMs }) {
      const r = await rpc('rank_of', { p_board: board, p_time_ms: wholeMs(timeMs) });
      return { rankAll: r.rank_all, rankWeek: r.rank_week };
    },
    // 冒険（国旗クエスト）: 記録を入れる／新しくする（行が無ければサーバーが作る。名前・かざりはプロフィールのもの）。
    // lv・dungeons（ボスを倒したダンジョンの数）・floors（クリアしたフロアの合計）
    rpgUpdate2: ({ token, lv, dungeons, floors }) => write('rpg_update2', { p_token: token, p_lv: lv, p_dungeons: dungeons, p_floors: floors },
      r => ({ rankLv: r.rank_lv, rankDg: r.rank_dg })),
    // 冒険のランキングからこの人の記録を消す（冒険データを消したとき。プロフィールは残る）。もう無いときは reason 'not_found'
    rpgUnregister2: ({ token }) => write('rpg_unregister2', { p_token: token }),
    // 冒険の上位50件（かざりつき）。sort は 'lv'（レベル順）か 'dg'（ダンジョン順）。失敗したら reject
    async rpgTop3({ sort }) {
      const rows = await rpc('top_rpg3', { p_sort: sort });
      return rows.map(r => ({ ...who(r), lv: r.lv, dungeons: r.dungeons, floors: r.floors, at: new Date(r.created_at) }));
    },
    // この記録なら何位相当か（レベル順・ダンジョン順）。失敗したら reject
    async rpgRankOf({ lv, dungeons, floors }) {
      const r = await rpc('rpg_rank_of', { p_lv: lv, p_dungeons: dungeons, p_floors: floors });
      return { rankLv: r.rank_lv, rankDg: r.rank_dg };
    },
    // 英雄の塔: 最高記録の階をプロフィールで送る（行が無ければサーバーが作る。記録・かざりとは別。10秒の連投よけも別）。返事の rank_tower は rankTower に
    rpgSetTower2: ({ token, tower }) => write('rpg_set_tower2', { p_token: token, p_tower: tower }, r => ({ rankTower: r.rank_tower })),
    // 塔の上位50件（塔 → レベルの順、かざりつき）。失敗したら reject（DB にまだ top_tower2 が無いときは e.status が 404）
    async topTower2() {
      const rows = await rpc('top_tower2', {});
      return rows.map(r => ({ ...who(r), tower: r.tower, lv: r.lv, at: new Date(r.created_at) }));
    },
    // この塔の記録なら何位相当か（数を返す）。失敗したら reject
    async rpgTowerRankOf({ tower, lv }) {
      return (await rpc('rpg_tower_rank_of', { p_tower: tower, p_lv: lv })).rank;
    },
    // 今日の難問: 記録をプロフィールで送る（day は日本時間の 'YYYY-MM-DD'、total は問題数。1日1回で2回目は reason 'already'）
    dailySubmit2: ({ token, day, correct, total, timeMs }) => write('submit_daily2',
      { p_token: token, p_day: day, p_correct: correct, p_total: total, p_time_ms: wholeMs(timeMs) }, r => ({ rank: r.rank })),
    // その日の上位50件（正答数が多い順 → 速い順）。失敗したら reject
    async dailyTop2({ day }) {
      const rows = await rpc('top_daily2', { p_day: day });
      return rows.map(r => ({ ...who(r), correct: r.correct, total: r.total, timeMs: r.time_ms, at: new Date(r.created_at) }));
    },
    // この記録なら何位相当か。失敗したら reject
    async dailyRankOf({ day, correct, timeMs }) {
      return (await rpc('daily_rank_of', { p_day: day, p_correct: correct, p_time_ms: wholeMs(timeMs) })).rank;
    },
    message: reason => T(MESSAGES[reason] ?? MESSAGES.network),
    // 0.01秒単位で切り捨て。12345 → '12.34秒'（英語 '12.34s'）、61234 → '1分01.23秒'（英語 '1:01.23'）。index.html の代わりの RANKING と同じキー
    formatTime(ms) {
      const cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = pad2(cs % 100);
      return m ? T('{m}分{s}.{c}秒', { m, s: pad2(s), c }) : T('{s}.{c}秒', { s, c });
    },
  };
})();
