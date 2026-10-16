/* PianoRoll: canvas piano roll with touch editing.
   notes: [{id, t (beats), d (beats), m (midi), f (finger), hand ('R'|'L')}]
   opts: {editable, grid (beats), onChange(notes), onSelect(note), onTap(note)} */
class PianoRoll {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = Object.assign({ editable: false, grid: 0.25, ppb: 48, rowH: 16, keyW: 40, beatsPerBar: 4, maxHeight: 320 }, opts);
    this.opts.baseRowH = this.opts.rowH;
    this.notes = [];
    this.playhead = -1;
    this.selected = null;
    this.lo = 55; this.hi = 79;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'roll-canvas';
    this.scroller = document.createElement('div');
    this.scroller.className = 'roll-scroll';
    this.scroller.appendChild(this.canvas);
    host.innerHTML = '';
    host.appendChild(this.scroller);
    this.drag = null;
    this.bindPointer();
    this.theme();
    this.draw();
    window.addEventListener('resize', () => this.draw());
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { this.theme(); this.draw(); });
  }
  theme() {
    const cs = getComputedStyle(document.documentElement);
    const v = n => cs.getPropertyValue(n).trim();
    this.c = { bg: v('--surface2'), bg2: v('--surface'), line: v('--line'), line2: v('--line2'), fg: v('--fg'), muted: v('--muted'),
      R: v('--key-target'), L: v('--key-lh') || v('--warn'), sel: v('--ok'), head: v('--bad'), keyW: v('--key-w'), keyB: v('--key-b') };
  }
  setNotes(notes, keepView = false) {
    this.notes = notes.map((n, i) => Object.assign({ id: n.id ?? i + 1, hand: 'R' }, n));
    if (!keepView) this.fitRange();
    this.fitRows();
    this.draw();
  }
  fitRows() { const rows = this.hi - this.lo + 1; this.opts.rowH = Math.max(9, Math.min(this.opts.baseRowH, Math.floor(this.opts.maxHeight / rows))); }
  fitRange() {
    if (!this.notes.length) { this.lo = 55; this.hi = 79; return; }
    const ms = this.notes.map(n => n.m);
    this.lo = Math.max(21, Math.min(...ms) - 3); this.hi = Math.min(108, Math.max(...ms) + 3);
    if (this.hi - this.lo < 14) { const c = Math.round((this.hi + this.lo) / 2); this.lo = c - 7; this.hi = c + 7; }
  }
  totalBeats() { return Math.max(8, Math.ceil(Math.max(0, ...this.notes.map(n => n.t + n.d)) / this.opts.beatsPerBar) * this.opts.beatsPerBar + this.opts.beatsPerBar); }
  xOf(t) { return this.opts.keyW + t * this.opts.ppb; }
  tOf(x) { return (x - this.opts.keyW) / this.opts.ppb; }
  yOf(m) { return (this.hi - m) * this.opts.rowH; }
  mOf(y) { return this.hi - Math.floor(y / this.opts.rowH); }
  setPlayhead(beat, follow = true) {
    this.playhead = beat; this.draw();
    if (follow && beat >= 0) {
      const x = this.xOf(beat), sw = this.scroller.clientWidth;
      if (x < this.scroller.scrollLeft + this.opts.keyW + 10 || x > this.scroller.scrollLeft + sw - 40) this.scroller.scrollLeft = Math.max(0, x - sw * 0.35);
    }
  }
  scrollToStart() { this.scroller.scrollLeft = 0; }
  draw() {
    const { ppb, rowH, keyW, beatsPerBar } = this.opts;
    const W = this.xOf(this.totalBeats()), H = (this.hi - this.lo + 1) * rowH;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
      this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    }
    const g = this.canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = this.c, isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
    g.fillStyle = c.bg; g.fillRect(0, 0, W, H);
    // rows
    for (let m = this.lo; m <= this.hi; m++) {
      const y = this.yOf(m);
      g.fillStyle = isBlack(m) ? c.bg : c.bg2; g.fillRect(keyW, y, W - keyW, rowH);
      if (m % 12 === 0) { g.fillStyle = c.line2; g.fillRect(keyW, y + rowH - 1, W - keyW, 1); }
    }
    // beat grid
    for (let b = 0; b <= this.totalBeats(); b += this.opts.grid) {
      const x = this.xOf(b); const bar = b % beatsPerBar === 0, beat = Number.isInteger(b);
      g.fillStyle = bar ? c.line2 : c.line; g.globalAlpha = bar ? 1 : beat ? 0.8 : 0.3;
      g.fillRect(x, 0, bar ? 1.5 : 1, H);
    }
    g.globalAlpha = 1;
    // notes
    this.notes.forEach(n => {
      const x = this.xOf(n.t), y = this.yOf(n.m), w = Math.max(4, n.d * ppb - 2);
      g.fillStyle = n.hand === 'L' ? c.L : c.R;
      if (this.selected && this.selected.id === n.id) { g.fillStyle = c.sel; }
      this.rr(g, x + 1, y + 2, w, rowH - 4, 3); g.fill();
      if (this.playhead >= n.t && this.playhead < n.t + n.d) { g.fillStyle = 'rgba(255,255,255,.35)'; this.rr(g, x + 1, y + 2, w, rowH - 4, 3); g.fill(); }
      if (n.f && w > 12) { g.fillStyle = '#fff'; g.font = `bold ${Math.min(11, rowH - 5)}px ${getComputedStyle(document.body).getPropertyValue('--font-mono')}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(n.f, x + 5, y + rowH / 2 + 0.5); }
      if (this.opts.editable && this.selected && this.selected.id === n.id) { g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(x + w - 5, y + 4, 4, rowH - 8); }
    });
    // playhead
    if (this.playhead >= 0) { g.fillStyle = c.head; g.fillRect(this.xOf(this.playhead) - 1, 0, 2, H); }
    // keyboard column (sticky look: redraw at scroll position)
    const sx = this.scroller.scrollLeft;
    g.save(); g.translate(sx, 0);
    g.fillStyle = c.bg2; g.fillRect(0, 0, keyW, H);
    for (let m = this.lo; m <= this.hi; m++) {
      const y = this.yOf(m);
      g.fillStyle = isBlack(m) ? c.keyB : c.keyW; g.fillRect(0, y + 1, keyW - 6, rowH - 2);
      if (m % 12 === 0) { g.fillStyle = c.muted; g.font = `${Math.min(10, rowH - 5)}px ${getComputedStyle(document.body).getPropertyValue('--font-mono')}`; g.textBaseline = 'middle'; g.textAlign = 'right'; g.fillText('C' + (Math.floor(m / 12) - 1), keyW - 9, y + rowH / 2 + 0.5); }
    }
    g.fillStyle = c.line2; g.fillRect(keyW - 6, 0, 1, H);
    g.restore();
  }
  rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  hit(x, y) {
    const t = this.tOf(x), m = this.mOf(y);
    for (let i = this.notes.length - 1; i >= 0; i--) { const n = this.notes[i]; if (n.m === m && t >= n.t && t <= n.t + n.d) return n; }
    return null;
  }
  snap(v) { return Math.round(v / this.opts.grid) * this.opts.grid; }
  bindPointer() {
    const cv = this.canvas;
    this.scroller.addEventListener('scroll', () => this.draw(), { passive: true });
    cv.addEventListener('pointerdown', e => {
      const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < this.opts.keyW) { const m = this.mOf(y); if (this.opts.onKey) this.opts.onKey(m); return; }
      const n = this.hit(x, y);
      cv.setPointerCapture(e.pointerId);
      if (n) {
        this.selected = n;
        const edge = this.opts.editable && x > this.xOf(n.t + n.d) - 12;
        this.drag = { mode: edge ? 'resize' : 'move', n, x0: x, y0: y, t0: n.t, d0: n.d, m0: n.m, moved: false };
        if (this.opts.onSelect) this.opts.onSelect(n);
        this.draw();
      } else {
        this.drag = { mode: 'pan', x0: x, sl: this.scroller.scrollLeft, moved: false, t: this.snap(this.tOf(x)), m: this.mOf(y) };
        if (this.selected) { this.selected = null; if (this.opts.onSelect) this.opts.onSelect(null); this.draw(); }
      }
    });
    cv.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      const dx = x - this.drag.x0, dy = y - this.drag.y0;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.mode === 'pan') { this.scroller.scrollLeft = this.drag.sl - dx; return; }
      if (!this.opts.editable) return;
      const n = this.drag.n;
      if (this.drag.mode === 'move') {
        n.t = Math.max(0, this.snap(this.drag.t0 + dx / this.opts.ppb));
        n.m = Math.min(this.hi, Math.max(this.lo, this.drag.m0 - Math.round(dy / this.opts.rowH)));
      } else {
        n.d = Math.max(this.opts.grid, this.snap(this.drag.d0 + dx / this.opts.ppb));
      }
      this.draw();
    });
    const up = e => {
      if (!this.drag) return;
      const d = this.drag; this.drag = null;
      if (d.mode === 'pan') { if (!d.moved && this.opts.editable && this.opts.onEmptyTap) this.opts.onEmptyTap(d.t, d.m); return; }
      if (d.moved) { if (this.opts.onChange) this.opts.onChange(this.notes); }
      else if (this.opts.onTap) this.opts.onTap(d.n);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  addNote(t, m, d = 1) {
    const id = Math.max(0, ...this.notes.map(n => n.id)) + 1;
    const n = { id, t, m, d, hand: 'R' }; this.notes.push(n); this.selected = n;
    if (m < this.lo + 1 || m > this.hi - 1) this.fitRange();
    this.draw(); if (this.opts.onChange) this.opts.onChange(this.notes); if (this.opts.onSelect) this.opts.onSelect(n);
    return n;
  }
  deleteSelected() {
    if (!this.selected) return;
    this.notes = this.notes.filter(n => n.id !== this.selected.id); this.selected = null;
    this.draw(); if (this.opts.onChange) this.opts.onChange(this.notes); if (this.opts.onSelect) this.opts.onSelect(null);
  }
  nudgeSelected(dm) { if (!this.selected) return; this.selected.m = Math.min(108, Math.max(21, this.selected.m + dm)); if (this.selected.m < this.lo + 1 || this.selected.m > this.hi - 1) this.fitRange(); this.draw(); if (this.opts.onChange) this.opts.onChange(this.notes); }
  quantize(grid = 0.5) {
    this.notes.forEach(n => { n.t = Math.round(n.t / grid) * grid; n.d = Math.max(grid, Math.round(n.d / grid) * grid); });
    this.draw(); if (this.opts.onChange) this.opts.onChange(this.notes);
  }
  zoom(f) { this.opts.ppb = Math.min(120, Math.max(20, this.opts.ppb * f)); this.draw(); }
}
