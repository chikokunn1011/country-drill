// タイムアタックと冒険のランキング（Supabase）とのやりとりと、送る前の入力チェックだけを持つ小さいモジュール。
// ブラウザでは <script src="ranking.js"> で window.RANKING になる（テストでは vm で読み込む）
(() => {
  // 接続先。publishable キーはブラウザに載せる前提の鍵なので公開してOK（書き込みは DB 側の関数でしか通らない）
  const SUPABASE_URL = 'https://vgdkklvhtvcamtxwjpke.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_eFVPaD9rNRdqi_1LtXxmGg_yJACIRqV';
  const TIMEOUT = 8000;
  // supabase/schema.sql の ng_words() と同じ中身にしておくこと
  const NG_WORDS = ['死ね', 'しね', 'シネ', '殺す', 'ころす', 'ちんこ', 'ちんぽ', 'まんこ', 'うんこ',
    'せっくす', 'セックス', 'fuck', 'shit', 'bitch', 'sex', 'admin', '運営', '管理人'];
  // index.html の REGIONS → board に入れる英字キー
  const REGION_KEY = { 'アジア': 'asia', 'ヨーロッパ': 'europe', 'アフリカ': 'africa', '北・中央アメリカ': 'namerica', '南アメリカ': 'samerica', 'オセアニア': 'oceania' };
  const MESSAGES = {
    bad_name: 'ニックネームは1〜12文字で入れてね',
    ng_name: 'そのニックネームは使えないみたい',
    too_fast: 'タイムが速すぎて受け付けられなかった',
    too_slow: 'タイムが長すぎて受け付けられなかった',
    too_soon: '少し待ってからもう一回送ってね',
    bad_board: 'この条件はランキングに載せられない',
    bad_record: 'この記録はランキングに載せられない',
    name_taken: 'そのニックネームはもうほかの人が使っているみたい',
    already: 'この端末はもう登録ずみだよ',
    not_found: '登録が見つからなかった。もう一回載せてね',
    bad_token: '登録の合言葉がおかしいみたい',
    network: 'ランキングに接続できなかった',
  };

  // RPC を1回呼ぶ。8秒で打ち切り。通信失敗・HTTP エラー・壊れた応答はぜんぶ例外になる
  // HTTP エラーのときは状態と応答本文（PostgREST が原因を書いてくる）をエラーに入れる
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
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 300)}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }
  // 冒険のランキングの書きこみ（rpg_register / rpg_update / rpg_rename / rpg_unregister）。返事の rank_lv などは rankLv などにする
  async function rpgCall(name, args) {
    try {
      const r = await rpc(name, args);
      return r.ok ? { ok: true, rankLv: r.rank_lv, rankDg: r.rank_dg, nickname: r.nickname } : { ok: false, reason: r.reason };
    } catch (e) {
      console.warn(`ranking ${name}`, e);
      return { ok: false, reason: 'network' };
    }
  }
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
    // 記録を送る。失敗しても例外は投げず { ok:false, reason } で返す（原因はコンソールに残す）
    async submit({ board, nickname, timeMs, questions }) {
      try {
        const r = await rpc('submit_score', { p_board: board, p_nickname: nickname, p_time_ms: wholeMs(timeMs), p_questions: questions });
        return r.ok ? { ok: true, rankAll: r.rank_all, rankWeek: r.rank_week } : { ok: false, reason: r.reason };
      } catch (e) {
        console.warn('ranking submit', e);
        return { ok: false, reason: 'network' };
      }
    },
    // 上位50件。period は 'all'（歴代）か 'week'（今週）。失敗したら reject
    async top({ board, period }) {
      const rows = await rpc('top_scores', { p_board: board, p_period: period });
      return rows.map(r => ({ nickname: r.nickname, timeMs: r.time_ms, at: new Date(r.created_at) }));
    },
    // このタイムなら何位相当か（歴代・今週）。失敗したら reject
    async rankOf({ board, timeMs }) {
      const r = await rpc('rank_of', { p_board: board, p_time_ms: wholeMs(timeMs) });
      return { rankAll: r.rank_all, rankWeek: r.rank_week };
    },
    // 冒険（国旗クエスト）: はじめて載せる（token は端末が作った合言葉）・記録を新しくする・名前だけ変える。
    // lv・dungeons（ボスを倒したダンジョンの数）・floors（クリアしたフロアの合計）。失敗しても例外は投げず { ok:false, reason }
    async rpgRegister({ token, nickname, lv, dungeons, floors }) {
      return rpgCall('rpg_register', { p_token: token, p_nickname: nickname, p_lv: lv, p_dungeons: dungeons, p_floors: floors });
    },
    async rpgUpdate({ token, lv, dungeons, floors }) {
      return rpgCall('rpg_update', { p_token: token, p_lv: lv, p_dungeons: dungeons, p_floors: floors });
    },
    async rpgRename({ token, nickname }) {
      return rpgCall('rpg_rename', { p_token: token, p_nickname: nickname });
    },
    // 冒険のランキングからこの端末の記録を消す（冒険データを消したとき）。もう無いときは reason 'not_found'
    async rpgUnregister({ token }) {
      return rpgCall('rpg_unregister', { p_token: token });
    },
    // 冒険の上位50件。sort は 'lv'（レベル順）か 'dg'（ダンジョン順）。失敗したら reject
    async rpgTop({ sort }) {
      const rows = await rpc('top_rpg', { p_sort: sort });
      return rows.map(r => ({ nickname: r.nickname, lv: r.lv, dungeons: r.dungeons, floors: r.floors, at: new Date(r.created_at) }));
    },
    // この記録なら何位相当か（レベル順・ダンジョン順）。失敗したら reject
    async rpgRankOf({ lv, dungeons, floors }) {
      const r = await rpc('rpg_rank_of', { p_lv: lv, p_dungeons: dungeons, p_floors: floors });
      return { rankLv: r.rank_lv, rankDg: r.rank_dg };
    },
    message: reason => MESSAGES[reason] ?? MESSAGES.network,
    // 0.01秒単位で切り捨て。12345 → '12.34秒'、61234 → '1分01.23秒'
    formatTime(ms) {
      const cs = Math.floor(ms / 10), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = pad2(cs % 100);
      return m ? `${m}分${pad2(s)}.${c}秒` : `${s}.${c}秒`;
    },
  };
})();
