/* Staff renderer: draws a grand staff (treble + bass) for a window of notes on a canvas.
   Teaches reading: note heads at the right line/space, ledger lines, accidentals, note names optionally.
   notes: [{t,d,m,hand,f}], opts: {from (beat), beats (window), bpb, cursor (beat), names:boolean} */
const Staff = (() => {
  const NAMES = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const SHARP = [false, true, false, true, false, false, true, false, true, false, true, false];
  // diatonic step index (C=0 D=1 ... B=6) for a midi, using sharps
  const stepOf = m => ({ 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 6 })[m % 12] + (Math.floor(m / 12) - 1) * 7;
  function draw(canvas, notes, opts) {
    const o = Object.assign({ from: 0, beats: 8, bpb: 4, cursor: -1, names: true, keySharps: 0 }, opts);
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    g.fillStyle = v('--surface'); g.fillRect(0, 0, W, H);
    const sp = Math.min(9, H / 22); // line spacing
    const left = 44, right = W - 10, x0 = left + 12 + o.keySharps * sp * 0.9;
    const trebleTop = H / 2 - sp * 6, bassTop = H / 2 + sp * 2.5;
    g.strokeStyle = v('--fg'); g.lineWidth = 1; g.globalAlpha = .8;
    for (let i = 0; i < 5; i++) { line(g, left, trebleTop + i * sp, right, trebleTop + i * sp); line(g, left, bassTop + i * sp, right, bassTop + i * sp); }
    g.globalAlpha = 1;
    g.fillStyle = v('--fg'); g.font = `${sp * 3.6}px serif`; g.textBaseline = 'alphabetic';
    g.fillText('𝄞', left - 36, trebleTop + sp * 3.9); g.fillText('𝄢', left - 36, bassTop + sp * 3);
    // key signature sharps (F C G D A E B)
    const shTreble = [0, 1.5, -0.5, 1, 2.5, 0.5, 2], shBass = [1, 2.5, 0.5, 2, 3.5, 1.5, 3];
    g.font = `${sp * 1.8}px serif`;
    for (let i = 0; i < o.keySharps; i++) { g.fillText('♯', left + 4 + i * sp * 0.9, trebleTop + shTreble[i] * sp + sp * 0.6); g.fillText('♯', left + 4 + i * sp * 0.9, bassTop + shBass[i] * sp + sp * 0.6); }
    const keyAcc = new Set([6, 1, 8, 3, 10, 5, 0].slice(0, o.keySharps)); // sharpened pitch classes in key order F♯ C♯ G♯ D♯ A♯ E♯ B♯
    // y of a diatonic step on treble: E4 (step 30) is bottom line
    const yT = s => trebleTop + 4 * sp - (s - stepOf(64)) * sp / 2;
    const yB = s => bassTop + 4 * sp - (s - stepOf(43)) * sp / 2;
    const pxPerBeat = (right - x0 - 10) / o.beats;
    // bar lines
    for (let b = Math.ceil(o.from); b <= o.from + o.beats; b++) if (b % o.bpb === 0) { const x = x0 + (b - o.from) * pxPerBeat; g.globalAlpha = .6; line(g, x, trebleTop, x, bassTop + 4 * sp); g.globalAlpha = 1; }
    // cursor
    if (o.cursor >= o.from && o.cursor <= o.from + o.beats) { g.fillStyle = v('--bad'); g.globalAlpha = .6; g.fillRect(x0 + (o.cursor - o.from) * pxPerBeat - 1, trebleTop - sp * 2, 2, bassTop + 6 * sp - trebleTop); g.globalAlpha = 1; }
    const vis = notes.filter(n => n.t >= o.from - 0.01 && n.t < o.from + o.beats);
    g.lineWidth = 1.2;
    for (const n of vis) {
      const x = x0 + (n.t - o.from) * pxPerBeat + sp * 0.8;
      const treble = n.hand === 'R' || (n.hand === undefined && n.m >= 60);
      const s = stepOf(n.m); const y = treble ? yT(s) : yB(s);
      const col = n.hand === 'L' ? v('--key-lh') : v('--key-target');
      const active = o.cursor >= n.t - 0.02 && o.cursor < n.t + n.d;
      // ledger lines
      g.strokeStyle = v('--fg'); g.globalAlpha = .8;
      if (treble) { for (let ls = stepOf(60); ls >= s; ls -= 2) line(g, x - sp * 0.9, yT(ls), x + sp * 0.9, yT(ls)); for (let ls = stepOf(81); ls <= s; ls += 2) line(g, x - sp * 0.9, yT(ls), x + sp * 0.9, yT(ls)); }
      else { for (let ls = stepOf(60); ls <= s; ls += 2) line(g, x - sp * 0.9, yB(ls), x + sp * 0.9, yB(ls)); for (let ls = stepOf(40); ls >= s; ls -= 2) line(g, x - sp * 0.9, yB(ls), x + sp * 0.9, yB(ls)); }
      g.globalAlpha = 1;
      // accidental
      const sharp = SHARP[n.m % 12];
      if (sharp && !keyAcc.has(n.m % 12)) { g.fillStyle = v('--fg'); g.font = `${sp * 1.7}px serif`; g.fillText('♯', x - sp * 1.6, y + sp * 0.55); }
      else if (!sharp && keyAcc.has((n.m + 1) % 12)) { g.fillStyle = v('--fg'); g.font = `${sp * 1.7}px serif`; g.fillText('♮', x - sp * 1.5, y + sp * 0.55); }
      // head
      g.fillStyle = active ? v('--ok') : col;
      g.beginPath(); g.ellipse(x, y, sp * 0.62, sp * 0.45, -0.35, 0, Math.PI * 2);
      if (n.d >= 2) { g.lineWidth = 1.8; g.strokeStyle = g.fillStyle; g.stroke(); } else g.fill();
      // stem
      if (n.d < 4) { const up = treble ? s < stepOf(71) : s < stepOf(50); g.strokeStyle = g.fillStyle; g.lineWidth = 1.2; line(g, x + (up ? sp * 0.58 : -sp * 0.58), y, x + (up ? sp * 0.58 : -sp * 0.58), y + (up ? -sp * 3.2 : sp * 3.2));
        const flags = n.d <= 0.25 ? 2 : n.d <= 0.5 ? 1 : 0; for (let f = 0; f < flags; f++) { const sy = y + (up ? -sp * 3.2 : sp * 3.2) + f * (up ? sp * 0.8 : -sp * 0.8); g.beginPath(); g.moveTo(x + (up ? sp * 0.58 : -sp * 0.58), sy); g.quadraticCurveTo(x + (up ? sp * 1.6 : -sp * 1.6), sy + (up ? sp * 0.8 : -sp * 0.8), x + (up ? sp * 1.1 : -sp * 1.1), sy + (up ? sp * 2 : -sp * 2)); g.stroke(); } }
    }
    // names + fingers for the notes under the cursor, stacked above (treble) / below (bass)
    if (o.names) {
      const act = vis.filter(n => o.cursor >= n.t - 0.02 && o.cursor < n.t + n.d);
      const tr = act.filter(n => n.hand === 'R' || (n.hand === undefined && n.m >= 60)).sort((a, b) => b.m - a.m), ba = act.filter(n => !(n.hand === 'R' || (n.hand === undefined && n.m >= 60))).sort((a, b) => b.m - a.m);
      g.font = `bold ${sp * 1.15}px ${v('--font-mono')}`; g.textAlign = 'center';
      const lbl = n => NAMES[n.m % 12] + (SHARP[n.m % 12] ? '♯' : '') + (Math.floor(n.m / 12) - 1) + (n.f ? ' · ' + n.f : '');
      tr.forEach((n, i) => { const x = x0 + (n.t - o.from) * pxPerBeat + sp * 0.8; g.fillStyle = v('--key-target'); g.fillText(lbl(n), x, trebleTop - sp * 1.6 - (tr.length - 1 - i) * sp * 1.3); });
      ba.forEach((n, i) => { const x = x0 + (n.t - o.from) * pxPerBeat + sp * 0.8; g.fillStyle = v('--key-lh'); g.fillText(lbl(n), x, bassTop + 6.2 * sp + i * sp * 1.3); });
      g.textAlign = 'left';
    }
  }
  function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
  return { draw };
})();
