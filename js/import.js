/* PianoSnabb import: Standard MIDI files (.mid/.midi) and MusicXML (.musicxml/.xml, uncompressed)
   -> {notes:[{t,d,m,f?,hand}], bpm, bpb, title}. Beat = quarter note. */
const PianoImport = (() => {
  /* ---------- MIDI ---------- */
  function parseMidi(buf) {
    const dv = new DataView(buf); let p = 0;
    const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
    const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
    const u8 = () => dv.getUint8(p++);
    const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    if (u32() !== 0x4d546864) throw new Error('Inte en MIDI-fil');
    const hlen = u32(); const format = u16(), ntracks = u16(), division = u16(); p += hlen - 6;
    if (division & 0x8000) throw new Error('SMPTE-tidbas stöds inte');
    const tracks = [];
    for (let t = 0; t < ntracks; t++) {
      if (u32() !== 0x4d54726b) throw new Error('Trasig MIDI-fil');
      const len = u32(), end = p + len; let tick = 0, status = 0; const ev = []; let name = '';
      while (p < end) {
        tick += vlq(); let b = u8();
        if (b === 0xff) { const type = u8(), l = vlq(); const data = new Uint8Array(buf, p, l); p += l;
          if (type === 0x51) ev.push({ tick, tempo: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (type === 0x58) ev.push({ tick, ts: [data[0], Math.pow(2, data[1])] });
          else if (type === 0x03 && !name) name = new TextDecoder().decode(data);
        } else if (b === 0xf0 || b === 0xf7) { const l = vlq(); p += l; }
        else {
          if (b & 0x80) { status = b; b = u8(); }
          const type = status & 0xf0, ch = status & 0x0f;
          if (type === 0x90 || type === 0x80) { const vel = u8(); ev.push({ tick, ch, note: b, on: type === 0x90 && vel > 0, vel }); }
          else if (type === 0xa0 || type === 0xb0 || type === 0xe0) u8();
        }
      }
      p = end; tracks.push({ name, ev });
    }
    // tempo map (first tempo wins for display; note times in beats = ticks/division regardless of tempo)
    const all = tracks.flatMap(t => t.ev);
    const tempoEv = all.filter(e => e.tempo).sort((a, b) => a.tick - b.tick)[0];
    const tsEv = all.filter(e => e.ts).sort((a, b) => a.tick - b.tick)[0];
    const bpm = tempoEv ? Math.round(60000000 / tempoEv.tempo) : 100;
    const bpb = tsEv ? tsEv.ts[0] * (4 / tsEv.ts[1]) : 4;
    const meter = tsEv ? `${tsEv.ts[0]}/${tsEv.ts[1]}` : '4/4';
    // notes per track
    const noteTracks = tracks.map((t, i) => {
      const open = new Map(); const notes = [];
      t.ev.filter(e => e.note !== undefined).sort((a, b) => a.tick - b.tick).forEach(e => {
        const key = e.ch * 128 + e.note;
        if (e.on) { if (!open.has(key)) open.set(key, e); }
        else { const o = open.get(key); if (o) { notes.push({ t: o.tick / division, d: Math.max(0.05, (e.tick - o.tick) / division), m: e.note, vel: o.vel / 127 }); open.delete(key); } }
      });
      return { name: t.name, idx: i, notes };
    }).filter(t => t.notes.length);
    return { bpm, bpb, meter, tracks: noteTracks, title: '' }; // MIDI track names are usually instrument names, so the file name is used
  }
  /* ---------- MusicXML ---------- */
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseMusicXML(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Ogiltig MusicXML');
    const title = (doc.querySelector('work-title') || doc.querySelector('movement-title') || {}).textContent || '';
    let bpm = 0, bpb = 4, meter = '4/4';
    const tracks = []; // one per staff: {name, notes}
    doc.querySelectorAll('part').forEach((part, pi) => {
      let divisions = 1, cursor = 0; const staves = {};
      part.querySelectorAll('measure').forEach(meas => {
        const mStart = cursor; let maxEnd = cursor;
        const dv = meas.querySelector('attributes > divisions'); if (dv) divisions = +dv.textContent;
        const ts = meas.querySelector('attributes > time'); if (ts) { const b = +ts.querySelector('beats').textContent, bt = +ts.querySelector('beat-type').textContent; bpb = b * (4 / bt); meter = `${b}/${bt}`; }
        const snd = meas.querySelector('sound[tempo]'); if (snd && !bpm) bpm = Math.round(+snd.getAttribute('tempo'));
        const pm = meas.querySelector('per-minute'); if (pm && !bpm) bpm = Math.round(+pm.textContent);
        let last = null;
        for (const node of meas.children) {
          if (node.tagName === 'backup') { cursor -= +node.querySelector('duration').textContent / divisions; }
          else if (node.tagName === 'forward') { cursor += +node.querySelector('duration').textContent / divisions; }
          else if (node.tagName === 'note') {
            const durEl = node.querySelector('duration'); const dur = durEl ? +durEl.textContent / divisions : 0;
            const isChord = !!node.querySelector('chord'); const start = isChord && last ? last.t : cursor;
            const staff = (node.querySelector('staff') || {}).textContent || '1';
            if (!node.querySelector('rest') && !node.querySelector('grace')) {
              const pitch = node.querySelector('pitch');
              if (pitch) {
                const m = 12 * (+pitch.querySelector('octave').textContent + 1) + STEP[pitch.querySelector('step').textContent] + (+((pitch.querySelector('alter') || {}).textContent || 0));
                const fEl = node.querySelector('technical > fingering'); const f = fEl ? +fEl.textContent : undefined;
                const tieStop = node.querySelector('tie[type="stop"]');
                const tr = (staves[staff] ||= { name: 'staff ' + staff, notes: [] });
                if (tieStop) { const prev = [...tr.notes].reverse().find(n => n.m === m && Math.abs(n.t + n.d - start) < 0.01); if (prev) prev.d += dur; }
                else tr.notes.push({ t: start, d: dur, m, f, fromScore: f !== undefined, vel: 0.8 });
                last = { t: start };
              }
            }
            if (!isChord) cursor += dur;
            maxEnd = Math.max(maxEnd, cursor);
          }
        }
        cursor = Math.max(cursor, maxEnd);
      });
      Object.keys(staves).sort().forEach(k => tracks.push({ name: `${(part.querySelector('part-name') || {}).textContent || 'Stämma ' + (pi + 1)} ${k !== '1' || Object.keys(staves).length > 1 ? '(' + (k === '1' ? 'övre' : 'nedre') + ')' : ''}`.trim(), notes: staves[k].notes, staff: +k }));
    });
    return { bpm: bpm || 100, bpb, meter, tracks, title };
  }
  /* Assign hands: 2+ tracks -> higher average pitch = R; one track -> split at C4 unless everything is on one side */
  function toPiece(parsed, fileName) {
    let notes = [];
    const tr = parsed.tracks.filter(t => t.notes.length);
    if (tr.length >= 2) {
      const avg = t => t.notes.reduce((a, n) => a + n.m, 0) / t.notes.length;
      const sorted = [...tr].sort((a, b) => avg(b) - avg(a));
      sorted.forEach((t, i) => t.notes.forEach(n => notes.push(Object.assign({}, n, { hand: i === 0 ? 'R' : 'L' }))));
    } else {
      const ns = tr[0].notes.map(n => Object.assign({}, n)); const ms = ns.map(n => n.m).sort((a, b) => a - b);
      const split = ms[0] >= 60 ? 0 : ms[ms.length - 1] < 60 ? 200 : 60;
      ns.forEach(n => n.hand = n.m < split ? 'L' : 'R'); notes = ns;
    }
    // normalise start to 0, quantise lightly (1/32)
    const t0 = Math.min(...notes.map(n => n.t));
    notes.forEach(n => { n.t = Math.round((n.t - t0) * 32) / 32; n.d = Math.max(1 / 8, Math.round(n.d * 32) / 32); });
    notes.sort((a, b) => a.t - b.t || a.m - b.m).forEach((n, i) => n.id = i + 1);
    const title = parsed.title || fileName.replace(/\.(mid|midi|musicxml|xml)$/i, '');
    return { title, bpm: Math.min(200, Math.max(30, parsed.bpm)), bpb: parsed.bpb || 4, meter: parsed.meter || '4/4', notes };
  }
  async function fromFile(file) {
    const name = file.name;
    if (/\.(mid|midi)$/i.test(name)) return toPiece(parseMidi(await file.arrayBuffer()), name);
    if (/\.(musicxml|xml)$/i.test(name)) return toPiece(parseMusicXML(await file.text()), name);
    if (/\.mxl$/i.test(name)) throw new Error('.mxl är komprimerad – exportera som okomprimerad MusicXML (.musicxml) eller MIDI.');
    throw new Error('Stöder .mid, .midi, .musicxml och .xml');
  }
  return { fromFile, parseMidi, parseMusicXML, toPiece };
})();
