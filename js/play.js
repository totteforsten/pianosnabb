/* PianoSnabb play mode: fullscreen landscape "falling notes" game over a keyboard.
   Depends on globals from app.js: PianoAudio, NOTE_NAMES, liveNotes, held, midiOn, listening, toggleMic, toggleMidi, el, stat, store, save.
   notes: [{t (beats), d (beats), m (midi), f (finger), hand ('R'|'L')}] */
const PlayMode = (() => {
  const S = { piece: null, notes: [], bpm: 60, hand: 'B', wait: true, lead: 3.5, running: false, beat: -4, lastTs: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, misses: 0, idx: 0, judged: new Map(), range: [0, Infinity], keys: { lo: 36, hi: 96 }, labels: true, raf: 0, flashes: [], ended: false };
  const BLACK = m => [1, 3, 6, 8, 10].includes(m % 12);
  let cv, g, wrap, hud, dpr = 1, W = 0, H = 0, keyH = 0, hitY = 0;

  function build() {
    if (wrap) return;
    wrap = document.createElement('div'); wrap.id = 'playWrap'; wrap.hidden = true;
    wrap.innerHTML = `
      <div class="play-rotate" id="playRotate"><div><div class="big">↻</div>Vrid telefonen till liggande läge</div></div>
      <canvas id="playCv"></canvas>
      <div class="play-hud" id="playHud">
        <button class="ph-btn" id="phClose" aria-label="Stäng">✕</button>
        <div class="ph-stat"><b id="phScore">0</b><span>poäng</span></div>
        <div class="ph-stat"><b id="phCombo">0</b><span>combo</span></div>
        <div class="ph-stat"><b id="phAcc">100%</b><span>träff</span></div>
        <div class="ph-stat"><b id="phBar">1</b><span>takt</span></div>
        <div class="ph-spacer"></div>
        <button class="ph-btn" id="phHand">Båda</button>
        <button class="ph-btn" id="phWait">Vänta: på</button>
        <button class="ph-btn" id="phSlow">−</button><b class="ph-bpm" id="phBpm">60</b><button class="ph-btn" id="phFast">+</button>
        <button class="ph-btn primary" id="phPlay">▶</button>
      </div>
      <div class="play-end" id="playEnd" hidden><div class="pe-card"><div class="eyebrow">Klart</div><b id="peScore">0</b><p id="peText"></p><div class="row"><button class="primary" id="peAgain">Spela igen</button><button class="ghost" id="peClose">Stäng</button></div></div></div>`;
    document.body.appendChild(wrap);
    cv = wrap.querySelector('#playCv'); g = cv.getContext('2d'); hud = wrap.querySelector('#playHud');
    wrap.querySelector('#phClose').addEventListener('click', close);
    wrap.querySelector('#peClose').addEventListener('click', close);
    wrap.querySelector('#peAgain').addEventListener('click', () => { wrap.querySelector('#playEnd').hidden = true; restart(); });
    wrap.querySelector('#phPlay').addEventListener('click', toggle);
    wrap.querySelector('#phSlow').addEventListener('click', () => setBpm(S.bpm - 5));
    wrap.querySelector('#phFast').addEventListener('click', () => setBpm(S.bpm + 5));
    wrap.querySelector('#phWait').addEventListener('click', () => { S.wait = !S.wait; wrap.querySelector('#phWait').textContent = 'Vänta: ' + (S.wait ? 'på' : 'av'); });
    wrap.querySelector('#phHand').addEventListener('click', () => { S.hand = S.hand === 'B' ? 'R' : S.hand === 'R' ? 'L' : 'B'; wrap.querySelector('#phHand').textContent = S.hand === 'B' ? 'Båda' : S.hand === 'R' ? 'Höger' : 'Vänster'; restart(); });
    window.addEventListener('resize', resize);
    cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); const y = e.clientY - r.top; if (y > hitY) { const m = keyAt(e.clientX - r.left, y); if (m !== null) PianoAudio.play(m, { dur: .5 }); } else toggle(); });
  }
  function keyAt(x, y) {
    const n = whiteCount(); const kw = W / n;
    // black first
    let wi = 0;
    for (let m = S.keys.lo; m <= S.keys.hi; m++) { if (BLACK(m)) { const bx = (wi - 1) * kw + kw * 0.65; if (y < hitY + keyH * 0.62 && x >= bx && x <= bx + kw * 0.7) return m; } else wi++; }
    const idx = Math.floor(x / kw); let c = 0;
    for (let m = S.keys.lo; m <= S.keys.hi; m++) { if (!BLACK(m)) { if (c === idx) return m; c++; } }
    return null;
  }
  function whiteCount() { let c = 0; for (let m = S.keys.lo; m <= S.keys.hi; m++) if (!BLACK(m)) c++; return c; }
  function resize() {
    if (!wrap || wrap.hidden) return;
    dpr = window.devicePixelRatio || 1; W = wrap.clientWidth; H = wrap.clientHeight - hud.offsetHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    keyH = Math.max(70, Math.min(130, H * 0.22)); hitY = H - keyH;
    wrap.querySelector('#playRotate').hidden = W > H * 1.1;
  }
  function setBpm(v) { S.bpm = Math.max(20, Math.min(200, v)); wrap.querySelector('#phBpm').textContent = S.bpm; }
  function open(piece, opts = {}) {
    build();
    S.piece = piece; S.range = opts.range || [0, Infinity]; S.hand = opts.hand || 'B'; S.wait = opts.wait ?? true;
    setBpm(opts.bpm || piece.bpm || 60);
    wrap.querySelector('#phWait').textContent = 'Vänta: ' + (S.wait ? 'på' : 'av');
    wrap.querySelector('#phHand').textContent = S.hand === 'B' ? 'Båda' : S.hand === 'R' ? 'Höger' : 'Vänster';
    wrap.hidden = false; document.body.classList.add('playing');
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
    resize(); restart();
  }
  function close() {
    S.running = false; cancelAnimationFrame(S.raf); PianoAudio.stopAll();
    wrap.hidden = true; document.body.classList.remove('playing');
    try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (e) {}
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  function restart() {
    const all = S.piece.notes().map((n, i) => Object.assign({ id: i + 1 }, n));
    const from = S.range[0], to = S.range[1];
    S.notes = all.filter(n => (S.hand === 'B' || n.hand === S.hand) && n.t >= from - 0.01 && n.t < to - 0.01).map(n => Object.assign({}, n, { t: n.t - from })).sort((a, b) => a.t - b.t || a.m - b.m);
    const ms = S.notes.map(n => n.m); const lo = Math.min(...ms), hi = Math.max(...ms);
    S.keys.lo = Math.max(21, Math.floor((lo - 2) / 12) * 12); S.keys.hi = Math.min(108, Math.ceil((hi + 2) / 12) * 12 - 1);
    if (S.keys.hi - S.keys.lo < 28) S.keys.hi = Math.min(108, S.keys.lo + 28);
    S.end = Math.max(...S.notes.map(n => n.t + n.d));
    S.beat = -3; S.score = 0; S.combo = 0; S.maxCombo = 0; S.hits = 0; S.misses = 0; S.judged = new Map(); S.flashes = []; S.ended = false; S.running = false; S.lastTs = 0;
    S.steps = []; S.notes.forEach(n => { const l = S.steps[S.steps.length - 1]; if (l && Math.abs(l.t - n.t) < 0.05) l.notes.push(n); else S.steps.push({ t: n.t, notes: [n], done: false }); });
    S.stepIdx = 0;
    wrap.querySelector('#playEnd').hidden = true; wrap.querySelector('#phPlay').textContent = '▶';
    hudUpdate(); draw();
  }
  async function toggle() {
    if (S.ended) { restart(); return; }
    if (S.running) { S.running = false; cancelAnimationFrame(S.raf); wrap.querySelector('#phPlay').textContent = '▶'; return; }
    if (!midiOn && !listening) { if (navigator.requestMIDIAccess) await toggleMidi(); if (!midiOn) await toggleMic(); }
    PianoAudio.init(); S.running = true; S.lastTs = 0; wrap.querySelector('#phPlay').textContent = '❚❚';
    S.raf = requestAnimationFrame(frame);
  }
  const live = () => midiOn ? [...held.keys()] : liveNotes;
  function frame(ts) {
    if (!S.running) return;
    const dt = S.lastTs ? (ts - S.lastTs) / 1000 : 0; S.lastTs = ts;
    const bps = S.bpm / 60;
    // waiting: freeze time at the next unplayed step once its notes reach the hit line
    const step = S.steps[S.stepIdx];
    let frozen = false;
    if (S.wait && step && !step.done && S.beat >= step.t - 0.02) {
      frozen = true; S.beat = step.t;
      const cur = live(); const want = step.notes.map(n => n.m);
      const ok = want.every(w => cur.some(m => m === w || (!midiOn && m % 12 === w % 12)));
      if (ok) { step.notes.forEach(n => judge(n, 'perfect')); step.done = true; S.stepIdx++; }
    }
    if (!frozen) {
      S.beat += dt * bps;
      // free play: judge notes as they pass the window
      const cur = live();
      for (let i = S.stepIdx; i < S.steps.length; i++) {
        const st = S.steps[i]; if (st.t > S.beat + 0.35) break;
        if (st.done) continue;
        const want = st.notes.map(n => n.m);
        const okNow = want.every(w => cur.some(m => m === w || (!midiOn && m % 12 === w % 12)));
        if (okNow) { const err = Math.abs(S.beat - st.t); st.notes.forEach(n => judge(n, err < 0.12 ? 'perfect' : err < 0.25 ? 'good' : 'ok')); st.done = true; if (i === S.stepIdx) S.stepIdx++; }
        else if (S.beat > st.t + 0.35) { st.notes.forEach(n => judge(n, 'miss')); st.done = true; if (i === S.stepIdx) S.stepIdx++; }
      }
      while (S.steps[S.stepIdx] && S.steps[S.stepIdx].done) S.stepIdx++;
    }
    draw();
    if (S.beat > S.end + 1.5) { finish(); return; }
    S.raf = requestAnimationFrame(frame);
  }
  function judge(n, q) {
    if (S.judged.has(n.id)) return; S.judged.set(n.id, q);
    if (q === 'miss') { S.misses++; S.combo = 0; }
    else { S.hits++; S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo); S.score += (q === 'perfect' ? 100 : q === 'good' ? 70 : 40) * (1 + Math.min(S.combo, 50) / 25); PianoAudio.play(n.m, { dur: Math.max(.3, n.d * 60 / S.bpm), vel: n.hand === 'L' ? .6 : .8 }); }
    S.flashes.push({ m: n.m, q, t: performance.now() });
    hudUpdate();
  }
  function hudUpdate() {
    wrap.querySelector('#phScore').textContent = Math.round(S.score);
    wrap.querySelector('#phCombo').textContent = S.combo;
    const tot = S.hits + S.misses; wrap.querySelector('#phAcc').textContent = (tot ? Math.round(S.hits / tot * 100) : 100) + '%';
    wrap.querySelector('#phBar').textContent = Math.max(1, Math.floor(S.beat / (S.piece.bpb || 4)) + 1);
  }
  function finish() {
    S.running = false; S.ended = true; cancelAnimationFrame(S.raf);
    const tot = S.hits + S.misses, acc = tot ? S.hits / tot : 0;
    const s = stat('play:' + S.piece.id); s.tries++; if (acc >= 0.8) s.ok++; store.days[new Date().toISOString().slice(0, 10)] = 1; save();
    wrap.querySelector('#peScore').textContent = Math.round(S.score);
    wrap.querySelector('#peText').textContent = `${Math.round(acc * 100)} % träff · bästa combo ${S.maxCombo} · ${S.bpm} bpm${acc >= 0.9 ? ' – höj tempot 5–10 bpm' : acc < 0.6 ? ' – sänk tempot eller öva en hand i taget' : ''}`;
    wrap.querySelector('#playEnd').hidden = false; wrap.querySelector('#phPlay').textContent = '↻';
  }
  /* ---- drawing ---- */
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function draw() {
    if (!W) resize();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const C = { bg: css('--bg'), bg2: css('--surface'), line: css('--line'), fg: css('--fg'), muted: css('--muted'), R: css('--key-target'), L: css('--key-lh'), live: css('--key-live'), kw: css('--key-w'), kb: css('--key-b'), bad: css('--bad'), ok: css('--ok') };
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const n = whiteCount(), kw = W / n; const pxPerBeat = hitY / S.lead;
    // lanes
    let wi = 0;
    for (let m = S.keys.lo; m <= S.keys.hi; m++) { if (!BLACK(m)) { if (m % 12 === 0 || m % 12 === 5) { g.fillStyle = C.line; g.globalAlpha = .35; g.fillRect(wi * kw, 0, 1, hitY); g.globalAlpha = 1; } wi++; } }
    // bar lines
    const bpb = S.piece.bpb || 4;
    for (let b = Math.floor(S.beat); b < S.beat + S.lead + 1; b++) { const y = hitY - (b - S.beat) * pxPerBeat; if (y < 0 || y > hitY) continue; g.fillStyle = C.line; g.globalAlpha = b % bpb === 0 ? .9 : .35; g.fillRect(0, y, W, b % bpb === 0 ? 2 : 1); g.globalAlpha = 1; if (b % bpb === 0) { g.fillStyle = C.muted; g.font = '11px ' + css('--font-mono'); g.textAlign = 'left'; g.fillText('takt ' + (b / bpb + 1), 6, y - 4); } }
    // notes
    const xOf = m => { let c = 0; for (let k = S.keys.lo; k < m; k++) if (!BLACK(k)) c++; return BLACK(m) ? (c - 1) * kw + kw * 0.65 : c * kw; };
    const wOf = m => BLACK(m) ? kw * 0.7 : kw;
    g.font = `bold ${Math.min(14, kw * 0.55)}px ${css('--font-display')}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const nt of S.notes) {
      const yTop = hitY - (nt.t + nt.d - S.beat) * pxPerBeat, yBot = hitY - (nt.t - S.beat) * pxPerBeat;
      if (yBot < -10 || yTop > hitY + 40) continue;
      const q = S.judged.get(nt.id);
      const x = xOf(nt.m) + 1.5, w = wOf(nt.m) - 3, h = Math.max(6, yBot - yTop - 2);
      g.globalAlpha = q === 'miss' ? .25 : q ? .45 : 1;
      g.fillStyle = q === 'miss' ? C.bad : nt.hand === 'L' ? C.L : C.R;
      rr(x, Math.min(yTop, yBot - 6), w, h, 4); g.fill();
      if (!q && h > 14) { g.fillStyle = '#fff'; const lbl = S.labels ? (nt.f ? nt.f + ' ' : '') + NOTE_NAMES[nt.m % 12].replace('#', '♯') : (nt.f || ''); g.fillText(lbl, x + w / 2, Math.min(yBot - 9, Math.max(yTop + 9, yBot - 9))); }
      g.globalAlpha = 1;
    }
    // hit line
    g.fillStyle = C.fg; g.globalAlpha = .9; g.fillRect(0, hitY - 2, W, 3); g.globalAlpha = 1;
    // keyboard
    const cur = new Set(live()); const want = new Set((S.steps[S.stepIdx] && !S.steps[S.stepIdx].done ? S.steps[S.stepIdx].notes : []).map(x => x.m));
    const now = performance.now(); S.flashes = S.flashes.filter(f => now - f.t < 350);
    wi = 0;
    for (let m = S.keys.lo; m <= S.keys.hi; m++) { if (BLACK(m)) continue; const x = wi * kw; const fl = S.flashes.find(f => f.m === m);
      g.fillStyle = cur.has(m) ? C.live : fl ? (fl.q === 'miss' ? C.bad : C.ok) : C.kw; rr(x + 1, hitY + 1, kw - 2, keyH - 2, 4); g.fill();
      if (want.has(m) && S.wait) { g.fillStyle = C.R; g.globalAlpha = .5; rr(x + 1, hitY + 1, kw - 2, keyH - 2, 4); g.fill(); g.globalAlpha = 1; }
      if (m % 12 === 0) { g.fillStyle = C.muted; g.font = '10px ' + css('--font-mono'); g.fillText('C' + (Math.floor(m / 12) - 1), x + kw / 2, hitY + keyH - 10); }
      wi++; }
    wi = 0;
    for (let m = S.keys.lo; m <= S.keys.hi; m++) { if (BLACK(m)) { const bx = (wi - 1) * kw + kw * 0.65; const fl = S.flashes.find(f => f.m === m);
      g.fillStyle = cur.has(m) ? C.live : fl ? (fl.q === 'miss' ? C.bad : C.ok) : C.kb; rr(bx, hitY + 1, kw * 0.7, keyH * 0.62, 3); g.fill();
      if (want.has(m) && S.wait) { g.fillStyle = C.R; g.globalAlpha = .6; rr(bx, hitY + 1, kw * 0.7, keyH * 0.62, 3); g.fill(); g.globalAlpha = 1; } } else wi++; }
    // waiting hint
    if (S.wait && S.running && S.steps[S.stepIdx] && Math.abs(S.beat - S.steps[S.stepIdx].t) < 0.03 && !S.steps[S.stepIdx].done) { g.fillStyle = C.fg; g.font = `bold 14px ${css('--font-body')}`; g.textAlign = 'center'; g.fillText('Spela de markerade tangenterna', W / 2, hitY - 18); }
    if (!S.running && !S.ended) { g.fillStyle = C.fg; g.font = `bold 16px ${css('--font-body')}`; g.textAlign = 'center'; g.fillText('Tryck ▶ eller på skärmen för att starta', W / 2, hitY / 2); }
  }
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  return { open, close, state: S };
})();
