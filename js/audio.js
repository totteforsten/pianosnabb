/* PianoSnabb audio engine
   Sampled acoustic grand (FluidR3 soundfont via jsDelivr, cached by the service worker)
   with a physically-inspired synth fallback when samples are unavailable (offline first run). */
const PianoAudio = (() => {
  const BASE = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@gh-pages/FluidR3_GM/acoustic_grand_piano-mp3/';
  const NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
  let ctx = null, master = null, wet = null, ready = false;
  const buffers = {};   // midi -> AudioBuffer
  const loading = {};   // midi -> Promise
  const voices = new Set();
  let sustain = false;
  let samplesOk = true;

  function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    return ctx;
  }
  async function init() {
    context();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    if (ready) return;
    ready = true;
    master = ctx.createGain(); master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    // small hall: synthetic stereo impulse response
    const conv = ctx.createConvolver();
    conv.buffer = impulse(1.9, 2.6);
    wet = ctx.createGain(); wet.gain.value = 0.22;
    wet.connect(conv); conv.connect(comp);
    // warm the sampler: anchors every 3 semitones from C2 to C7
    for (let m = 36; m <= 96; m += 3) load(m);
  }
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
    }
    return buf;
  }
  function load(m) {
    if (buffers[m] || loading[m] || !samplesOk) return loading[m] || Promise.resolve(buffers[m] || null);
    loading[m] = fetch(BASE + noteName(m) + '.mp3')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(ab => ctx.decodeAudioData(ab))
      .then(b => (buffers[m] = b))
      .catch(() => { delete loading[m]; return null; });
    return loading[m];
  }
  function nearest(m) {
    for (let d = 0; d <= 2; d++) { if (buffers[m + d]) return m + d; if (buffers[m - d]) return m - d; }
    return null;
  }

  /* Play a note. Returns a voice handle with stop(). `when` is seconds from now. */
  function play(m, { dur = 1.6, vel = 0.8, when = 0 } = {}) {
    context(); if (!ready) init();
    const t0 = ctx.currentTime + when;
    const src = nearest(m);
    if (src === null) load(m);
    const v = src !== null ? sampleVoice(m, src, t0, vel) : synthVoice(m, t0, vel);
    voices.add(v);
    v.release(t0 + dur);
    return v;
  }
  function sampleVoice(m, src, t0, vel) {
    const node = ctx.createBufferSource();
    node.buffer = buffers[src];
    node.playbackRate.value = Math.pow(2, (m - src) / 12);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 1800 + vel * 9000; // softer touch = darker tone
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25 + vel * 0.75, t0 + 0.004);
    node.connect(lp); lp.connect(g); g.connect(master); g.connect(wet);
    node.start(t0);
    let released = false;
    const v = {
      release(at) {
        if (released) return; released = true;
        const r = Math.max(at, ctx.currentTime);
        if (sustain) { v.pending = r; return; }
        g.gain.setTargetAtTime(0.0001, r, 0.12);
        node.stop(r + 0.8);
        setTimeout(() => voices.delete(v), (r - ctx.currentTime + 0.9) * 1000);
      },
      stop() { const r = ctx.currentTime; g.gain.setTargetAtTime(0.0001, r, 0.03); node.stop(r + 0.2); voices.delete(v); },
      pending: null
    };
    return v;
  }
  function synthVoice(m, t0, vel) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const out = ctx.createGain(); out.gain.value = 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200 + vel * 6000, t0);
    lp.frequency.exponentialRampToValueAtTime(600 + vel * 1500, t0 + 1.2);
    out.connect(lp); lp.connect(master); lp.connect(wet);
    const B = 0.00035; // inharmonicity
    const amps = [1, 0.55, 0.3, 0.18, 0.1, 0.06, 0.035];
    const parts = [];
    amps.forEach((a, i) => {
      const n = i + 1;
      const fr = f * n * Math.sqrt(1 + B * n * n);
      if (fr > ctx.sampleRate / 2) return;
      const detunes = n === 1 ? [-1.5, 1.5] : [0];
      detunes.forEach(dt => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.detune.value = dt;
        const g = ctx.createGain();
        const peak = a * (0.18 + vel * 0.5) / detunes.length;
        const tau = (2.8 / Math.pow(n, 0.9)) * (0.6 + (108 - m) / 108);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(peak, t0 + 0.003 + i * 0.001);
        g.gain.setTargetAtTime(0.0001, t0 + 0.01, tau);
        o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + 8);
        parts.push({ o, g });
      });
    });
    // hammer thump
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const ns = ctx.createBufferSource(); ns.buffer = nb; const ng = ctx.createGain(); ng.gain.value = 0.08 * vel;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = Math.min(4000, f * 2); nf.Q.value = 0.7;
    ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start(t0);
    let released = false;
    const v = {
      release(at) {
        if (released) return; released = true;
        const r = Math.max(at, ctx.currentTime);
        if (sustain) { v.pending = r; return; }
        out.gain.setTargetAtTime(0.0001, r, 0.1);
        parts.forEach(p => p.o.stop(r + 0.6));
        setTimeout(() => voices.delete(v), (r - ctx.currentTime + 0.7) * 1000);
      },
      stop() { const r = ctx.currentTime; out.gain.setTargetAtTime(0.0001, r, 0.03); parts.forEach(p => p.o.stop(r + 0.2)); voices.delete(v); },
      pending: null
    };
    return v;
  }
  function chord(midis, { dur = 1.8, vel = 0.75, when = 0, strum = 0.012 } = {}) {
    return midis.map((m, i) => play(m, { dur, vel: vel - i * 0.03, when: when + i * strum }));
  }
  function setSustain(on) {
    sustain = on;
    if (!on) voices.forEach(v => { if (v.pending !== null) { const r = v.pending; v.pending = null; v.release(r); } });
  }
  function stopAll() { [...voices].forEach(v => v.stop()); }
  function click(accent) {
    context(); if (!ready) init();
    const t0 = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.06);
  }
  function usingSamples() { return Object.keys(buffers).length > 0; }
  return { init, play, chord, click, stopAll, setSustain, usingSamples, get ctx() { return context(); }, get now() { return context().currentTime; } };
})();
