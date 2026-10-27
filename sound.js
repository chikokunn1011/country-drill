/* ---------- 効果音（ドパガキ向けとは別。設定の「効果音」と「音量」で決まる） ----------
   音は Web Audio で合成するので音声ファイルは無い。S（index.html の設定）は鳴らすときに読む。
   ブラウザは最初にタップ・キー入力があるまで音を出せないので、それまでは鳴らさない（AudioContext も作らない）。
   SND.play(kind, { combo }) の kind:
     tap      ボタンを押した（document の click で自動。.choice などの答えのボタンは答えの音が鳴るので除く）
     correct  正解（combo が多いほど少し高くなる）   wrong  不正解   fail  タイムアタック失格
     clear    クリア   perfect  ノーミスでクリア
     hit      バトルで攻撃が当たった   damage  バトルでダメージを受けた   win  バトル勝利   lose  バトル敗北
     levelup  レベルアップ   pull  ガチャを引く   flip  カードをめくる   promo  ★3 確定の光   gold  ★3 が出た
     badge    バッジゲット */
const SND = (() => {
  let ac = null, master = null, noiseBuf = null;
  const on = () => typeof S === 'undefined' || S.sound !== false;
  const vol = () => {
    const v = typeof S === 'undefined' ? 70 : Number(S.vol ?? 70);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : .7;
  };
  const ctx = () => {
    if (!ac) {
      if (!navigator.userActivation?.hasBeenActive) return null;   // まだ一度も操作していない
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.connect(ac.destination);
      } catch { ac = null; return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    master.gain.value = vol() ** 2 * .9;   // 耳の感じ方に合わせて2乗
    return ac;
  };
  // 最初の操作で鳴らせるようにしておく（iOS はタップの中で resume しないと鳴らない）
  const unlock = () => { if (on()) ctx(); };
  addEventListener('pointerdown', unlock, { capture: true, passive: true });
  addEventListener('keydown', unlock, { capture: true });

  // 音1つ: 周波数 f、開始 t（秒、いまから）、長さ dur。slide なら終わりにその周波数へ
  const tone = (f, t, dur, { type = 'sine', v = .3, slide = 0, attack = .005, out = master } = {}) => {
    const o = ac.createOscillator(), g = ac.createGain(), at = ac.currentTime + t;
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + attack);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at); o.stop(at + dur + .03);
  };
  // ベルのような音（基音＋倍音が早く消える）
  const bell = (f, t, dur = .5, v = .25) => {
    tone(f, t, dur, { v });
    tone(f * 2, t, dur * .5, { v: v * .35 });
    tone(f * 3, t, dur * .25, { v: v * .15 });
  };
  // ノイズ（打撃・シュッ）。lo..hi の帯域だけ通す
  const noise = (t, dur, { v = .3, freq = 1200, q = 1, sweep = 0 } = {}) => {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * .5, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), at = ac.currentTime + t;
    s.buffer = noiseBuf;
    bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(freq, at);
    if (sweep) bp.frequency.exponentialRampToValueAtTime(sweep, at + dur);
    g.gain.setValueAtTime(v, at);
    g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    s.connect(bp).connect(g).connect(master);
    s.start(at); s.stop(at + dur + .03);
  };
  const N = { C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, E6: 1318.51, G6: 1567.98, C7: 2093 };
  const semi = (f, n) => f * 2 ** (n / 12);

  const SOUNDS = {
    tap() { tone(1400, 0, .05, { v: .12, slide: 900 }); },
    correct({ combo = 0 } = {}) {   // ピンポーン
      const up = Math.min(Math.max(combo - 1, 0), 7);
      bell(semi(N.E6, up), 0, .35, .22);
      bell(semi(N.C6, up), .12, .6, .22);
    },
    wrong() {   // ブッブー（やわらかめ）
      tone(196, 0, .16, { type: 'triangle', v: .35 });
      tone(185, .2, .32, { type: 'triangle', v: .35, slide: 150 });
    },
    fail() {
      tone(392, 0, .18, { type: 'triangle', v: .3 });
      tone(330, .18, .18, { type: 'triangle', v: .3 });
      tone(262, .36, .6, { type: 'triangle', v: .32, slide: 196 });
    },
    clear() {
      [N.C5, N.E5, N.G5].forEach((f, i) => bell(f, i * .1, .35, .2));
      bell(N.C6, .3, .9, .24);
    },
    perfect() {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => bell(f, i * .09, .3, .2));
      [N.E6, N.G6].forEach((f, i) => bell(f, .4 + i * .09, .3, .16));
      bell(N.C7, .6, 1.1, .16);
      [N.C5, N.E5, N.G5].forEach(f => tone(f, .6, 1.1, { type: 'triangle', v: .1, attack: .02 }));
    },
    hit({ combo = 0 } = {}) {   // バシッ
      noise(0, .12, { v: .5, freq: 2200, q: .8, sweep: 600 });
      tone(160, 0, .14, { type: 'sine', v: .4, slide: 60 });
      if (combo >= 3) bell(semi(N.G6, Math.min(combo - 3, 7)), .05, .2, .08);
    },
    damage() {   // ドスッ
      tone(110, 0, .25, { type: 'sine', v: .5, slide: 45 });
      noise(0, .18, { v: .35, freq: 400, q: .7 });
      tone(220, .05, .2, { type: 'square', v: .05, slide: 110 });
    },
    win() {
      [[N.G5, 0], [N.G5, .12], [N.G5, .24], [N.C6, .4]].forEach(([f, t], i) => tone(f, t, i === 3 ? .7 : .1, { type: 'square', v: .08 }));
      bell(N.E6, .4, .9, .14);
      tone(N.C5, .4, .8, { type: 'triangle', v: .14, attack: .02 });
    },
    lose() {
      [N.G5, N.F5, N.E5].forEach((f, i) => tone(f / 2, i * .22, .25, { type: 'triangle', v: .25 }));
      tone(N.D5 / 2, .66, .9, { type: 'triangle', v: .25, slide: N.C5 / 2.2 });
    },
    levelup() {   // キラキラ上がっていく
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(semi(N.C5, s), i * .055, .2, { type: 'triangle', v: .16 }));
      bell(N.C7, .4, .7, .12);
    },
    pull() {   // シュワーッ
      noise(0, .7, { v: .18, freq: 500, q: 2, sweep: 5000 });
      tone(300, 0, .7, { type: 'sine', v: .08, slide: 1200 });
    },
    flip() { noise(0, .06, { v: .25, freq: 3000, q: 1.5 }); tone(900, 0, .06, { v: .06, slide: 1300 }); },
    promo() {   // 金色に光った
      noise(0, 1, { v: .12, freq: 2000, q: 3, sweep: 8000 });
      [0, 4, 7, 11, 14].forEach((s, i) => bell(semi(N.C6, s), .1 + i * .07, .6, .1));
    },
    gold() {
      [0, 7, 12, 16, 19, 24].forEach((s, i) => bell(semi(N.C6, s), i * .045, .7, .09));
    },
    badge() {   // ぴろりん
      bell(N.G6, 0, .2, .14);
      bell(N.C7, .08, .5, .14);
    },
  };

  const last = {};
  return {
    kinds: Object.keys(SOUNDS),
    // 鳴らした kind を返す（鳴らさなかったら null）。同じ音を 40ms 以内に重ねない（連打・10連めくり）
    play(kind, opt) {
      try {
        if (!on() || !SOUNDS[kind] || vol() === 0) return null;
        const now = performance.now();
        if (now - (last[kind] || 0) < 40) return null;
        if (!ctx()) return null;
        last[kind] = now;
        SOUNDS[kind](opt);
        return kind;
      } catch (e) { console.warn('[sound]', e); return null; }
    },
    ctx,   // ドパガキの FX.sfx も同じ音量で鳴らすため
    out: () => (ctx() ? master : null),
  };
})();

// ボタンを押したら「ポチ」。答えや自分の音があるボタンは除く
const SND_NO_TAP = '.choice, .rpg-choice, #ga-free, #ga-1, #ga-10, #rpg-lvup, #rpg-lvmax, [data-snd-off]';
document.addEventListener('click', e => {
  const b = e.target.closest?.('button');
  if (!b || b.disabled || b.closest(SND_NO_TAP)) return;
  SND.play('tap');
}, true);
