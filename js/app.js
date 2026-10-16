const el = id=>document.getElementById(id); // used throughout; must be defined before any top-level handler wiring
/* ============================================================
   Music theory data
   ============================================================ */
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_SV = {'C#':'Ciss','D#':'Diss','F#':'Fiss','G#':'Giss','A#':'Aiss'};
const CHORD_TYPES = {
  '':     {iv:[0,4,7],  label:'dur'},
  'm':    {iv:[0,3,7],  label:'moll'},
  'dim':  {iv:[0,3,6],  label:'förminskad'},
  'aug':  {iv:[0,4,8],  label:'överstigande'},
  '7':    {iv:[0,4,7,10],label:'dominantsjua'},
  'maj7': {iv:[0,4,7,11],label:'stor sjua'},
  'm7':   {iv:[0,3,7,10],label:'mollsjua'},
  'sus2': {iv:[0,2,7],  label:'sus2'},
  'sus4': {iv:[0,5,7],  label:'sus4'},
  'dim7': {iv:[0,3,6,9],label:'förminskad sjua'},
  'm7b5': {iv:[0,3,6,10],label:'halvförminskad'},
  'add9': {iv:[0,2,4,7],label:'add9'},
  'klu':  {iv:[0,2,4],  label:'kluster'},
};
const SYMMETRIC = new Set(['dim7','aug']);
const FLAT_NAMES=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_MAJOR_KEYS=new Set([5,10,3,8,1,6]); // F Bb Eb Ab Db Gb
function useFlats(key,minor){ return FLAT_MAJOR_KEYS.has(minor?(key+3)%12:key); }
// Display a chord name with the right enharmonic spelling for the key (internal names always use sharps)
function dn(name, flats){ return name.replace(/([A-G])#/g,(m,n)=>flats?FLAT_NAMES[(NOTE_NAMES.indexOf(n)+1)%12]:n+'♯').replace(/([A-G])b/g,'$1♭'); } // same pitch-class set from several roots
// Parse "Am/C" -> {root:9, type:'m', bass:0, name:'Am/C'}
function parseChord(name){
  const m = name.match(/^([A-G]#?)([a-z0-9]*)(?:\/([A-G]#?))?$/);
  if(!m) return null;
  const root = NOTE_NAMES.indexOf(m[1]);
  const type = m[2]||'';
  const bass = m[3] ? NOTE_NAMES.indexOf(m[3]) : null;
  return {root,type,bass,name,pcs:CHORD_TYPES[type].iv.map(i=>(root+i)%12)};
}
// Build concrete midi notes for a chord in a sensible register (C4 = 60)
function chordVoicing(c){
  const base = 60; // C4
  let notes = CHORD_TYPES[c.type].iv.map(i=>base+c.root+i);
  if(c.bass!==null && c.bass!==c.root){
    // rotate until the bass pitch class is lowest
    let guard=0;
    while((notes[0]%12)!==c.bass && guard++<4){ notes.push(notes.shift()+12); }
    // drop into register starting around C4
    while(notes[0]>=72) notes = notes.map(n=>n-12);
  } else {
    while(notes[0]>=67) notes = notes.map(n=>n-12); // keep root between C4 and F#4
  }
  return notes;
}
function fingeringText(c){
  const n = CHORD_TYPES[c.type].iv.length;
  const inv = c.bass===null||c.bass===c.root ? 0 : CHORD_TYPES[c.type].iv.findIndex(i=>(c.root+i)%12===c.bass);
  const names = chordVoicing(c).map(m=>NOTE_NAMES[m%12].replace('#','♯')).join(' – ');
  let f;
  if(n===3) f = inv===0?'1 – 3 – 5':inv===1?'1 – 2 – 5':'1 – 3 – 5';
  else f = inv===0?'1 – 2 – 3 – 5':'1 – 2 – 4 – 5';
  const invTxt = inv===0?'grundläge':inv===1?'första omvändningen':'andra omvändningen';
  return `Toner: <b>${names}</b> · Höger hand: ${f} (${invTxt}) · Vänster hand: ${NOTE_NAMES[c.bass??c.root].replace('#','♯')} som bas`;
}

/* ============================================================
   Curriculum
   ============================================================ */
const LEVELS = [
  {id:'notes', name:'Steg 1 · Hitta tangenterna', kind:'note', items:['C','D','E','F','G','A','B'],
   tip:'C ligger direkt till vänster om de två svarta tangenterna. Hitta alla C först, sedan de andra vita. Spela varje ton en gång med höger tumme.'},
  {id:'maj', name:'Steg 2 · Durackord', kind:'chord', items:['C','G','F','D','A','E'],
   tip:'Alla durackord har samma form: tumme, hoppa över en tangent, långfinger, hoppa över en, lillfinger. Tänk "1-3-5". Med C, G och F kan du redan spela hundratals låtar.'},
  {id:'min', name:'Steg 3 · Mollackord', kind:'chord', items:['Am','Em','Dm','Bm','F#m'],
   tip:'Moll = flytta mittfingret ett halvt steg ner. C-E-G blir C-Eb-G. Am, Em och Dm är de du behöver i 90 % av poplåtarna.'},
  {id:'inv', name:'Steg 4 · Omvändningar', kind:'chord', items:['C/E','C/G','G/B','G/D','F/A','F/C','Am/C','Am/E'],
   tip:'Ta nedersta tonen och flytta upp den en oktav – då har du första omvändningen. Gör om det: andra. Målet är att byta ackord utan att handen flyttar mer än en tangent.'},
  {id:'7', name:'Steg 5 · Sjuor', kind:'chord', items:['G7','C7','D7','Cmaj7','Am7','Dm7','Em7'],
   tip:'Dominantsjua = durackord + tonen två tangenter under grundtonen (G7 = G-B-D-F). Den vill alltid vidare till ackordet fem steg ner: G7 → C.'},
  {id:'dim', name:'Steg 6 · Förminskade', kind:'chord', items:['Bdim','Ddim','F#dim','G#dim','Bdim7','Ddim7','Bm7b5','Em7b5'],
   tip:'Förminskad = två små terser staplade (B-D-F). Den är spänd och vill alltid gå ett halvt steg uppåt: Bdim → C. Bdim7 (B-D-F-Ab) är symmetrisk, så B, D, F och Ab-dim7 är samma ackord.'},
  {id:'klu', name:'Steg 7 · Färg & kluster', kind:'chord', items:['Cadd9','Gadd9','Fadd9','Dadd9','Cklu','Fklu','Gklu','Dsus4','Asus2'],
   tip:'Add9 = treklang + tonen ett helt steg över grundtonen, spelad tätt (C-D-E-G). Kluster = tre toner i rad (C-D-E). Det är dissonans med flit – spela mjukt, låt det ringa, lös upp till det rena ackordet.'},
  {id:'prog', name:'Steg 8 · Progressioner', kind:'prog',
   items:['C G Am F','G D Em C','Am F C G','C Am F G','C F G Em','D A Bm G','Dm G7 C C','C F G C','E B C#m A','C Bdim Am G'],
   tip:'Spela till klicket. Byt på ettan i varje takt. När du klarar 80 bpm utan att missa: höj. Det är här det börjar låta som musik.'},
];
/* ---------- Scale degrees → chords (I, ii, iii, IV, V, vi, vii°) ---------- */
const MAJOR_SCALE=[0,2,4,5,7,9,11], MINOR_SCALE=[0,2,3,5,7,8,10];
const MAJOR_QUAL=['','m','m','','','m','dim'], MINOR_QUAL=['m','dim','','m','m','',''];
const ROMAN=['I','II','III','IV','V','VI','VII'];
// "I V vi IV", "1 4 5 3", "ii7 V7 Imaj7", "vii°" -> chord names in key
function degreesToChords(str, key, minor=false){
  const scale = minor?MINOR_SCALE:MAJOR_SCALE, qual = minor?MINOR_QUAL:MAJOR_QUAL;
  const out=[];
  for(const tok of str.trim().split(/[\s,–-]+/).filter(Boolean)){
    const m = tok.match(/^(b|#)?([ivIV]+|[1-7])(°|dim|o)?(maj7|m7b5|7|sus2|sus4|add9|klu)?$/);
    if(!m) return null;
    let deg, upper;
    if(/\d/.test(m[2])){ deg=+m[2]-1; upper=null; } else { deg=ROMAN.indexOf(m[2].toUpperCase()); upper=m[2]===m[2].toUpperCase(); }
    if(deg<0) return null;
    let root=(key+scale[deg]+(m[1]==='b'?-1:m[1]==='#'?1:0)+12)%12;
    let type = upper===null?qual[deg]:upper?'':'m';
    if(m[3]) type='dim';
    if(m[4]){
      if(m[4]==='7') type = type==='dim'?'m7b5':type==='m'?'m7':'7';
      else type=m[4];
    }
    out.push(NOTE_NAMES[root]+type);
  }
  return out.length?out:null;
}
const PROGRESSIONS = [
  {nums:'I V vi IV', name:'Popkadensen', desc:'Den vanligaste rundgången i modern pop. Allt låter bra ovanpå den.'},
  {nums:'I vi IV V', name:'50-talsrundan', desc:'Doo-wop, ballader, "Stand by me". Samma ackord som popkadensen i annan ordning.'},
  {nums:'vi IV I V', name:'Mollstart', desc:'Popkadensen som börjar på moll – låter mörkare och mer episk.'},
  {nums:'I IV V I', name:'1–4–5', desc:'Hela blues-, rock- och folkmusiken. Tre ackord räcker.'},
  {nums:'I IV V iii', name:'1–4–5–3', desc:'Som 1-4-5 men iii-ackordet i slutet ger en mjuk, oväntad landning. Vanlig i svensk vispop.'},
  {nums:'I iii IV V', name:'1–3–4–5', desc:'Stegvis stigande bas (C–E–F–G). Känns som att något byggs upp.'},
  {nums:'ii7 V7 Imaj7', name:'ii–V–I', desc:'Jazzens DNA. Varje jazzstandard är full av dessa.'},
  {nums:'I V vi iii IV I IV V', name:'Pachelbel', desc:'Canon i D. Åtta ackord som fallande bas: 1-5-6-3-4-1-4-5.'},
  {nums:'i VII VI V', name:'Andalusisk kadens', desc:'Moll med fallande bas. Flamenco, "Hit the road Jack", filmmusik.', minor:true},
  {nums:'i VI III VII', name:'Mollepos', desc:'"Popkadensen" i moll (Am–F–C–G). Episk, melankolisk.', minor:true},
  {nums:'I vii° vi V', name:'Med förminskat', desc:'vii° (Bdim i C) används som passage mellan I och vi. Känn hur det "glider".'},
  {nums:'I I7 IV iv', name:'Mollsubdominant', desc:'IV som byter till moll (F → Fm) är det klassiska "bitterljuva" ögonblicket.'},
];
const SONGS = [
  {title:'Fyra-ackords-låten', meta:'C–G–Am–F · 80 bpm · Samma rundgång som hundratals poplåtar använder', chords:'C G Am F', bpm:80, tip:'Vänster hand spelar bara grundtonen. Prova omvändningarna C · G/B · Am/C · F/C så handen knappt flyttar sig.'},
  {title:'50-talsrundan', meta:'C–Am–F–G · 90 bpm · "Stand by me"-känsla', chords:'C Am F G', bpm:90, tip:'Spela varje ackord som 4 jämna fjärdedelar med höger hand. Lägg till en basgång C–A–F–G i vänster.'},
  {title:'12-takters blues i C', meta:'C7 F7 G7 · 70 bpm · Shuffle', chords:'C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7', bpm:70, tip:'Svinga åttondelarna: lång–kort, lång–kort. Vänster hand: C–E–G–A–Bb–A–G–E ovanpå varje ackord är klassisk boogie.'},
  {title:'Pachelbels Canon', meta:'D–A–Bm–F#m–G–D–G–A · 60 bpm · Bröllopsklassikern', chords:'D A Bm F#m G D G A', bpm:60, tip:'Basgången D–A–B–F#–G–D–G–A är hela poängen – spela den med vänster hand först, utan ackord.'},
  {title:'Amazing Grace', meta:'G–C–G–D · 60 bpm · 3/4-takt', chords:'G C G D G C G D G', bpm:60, tip:'Tre slag per takt: bas på ettan, ackord på två och tre. Vals-känsla.'},
  {title:'Ja må du leva', meta:'C–G–C–F–C–G–C · 110 bpm', chords:'C G C F C G C', bpm:110, tip:'Första låten att spela för folk. Melodin ligger i höger hand, så öva ackorden i vänster hand här.'},
  {title:'ii–V–I i C (jazzgrunden)', meta:'Dm7–G7–Cmaj7 · 70 bpm', chords:'Dm7 G7 Cmaj7 Cmaj7', bpm:70, tip:'Spela Dm7 som F-A-C-D, G7 som F-G-B-D, Cmaj7 som E-G-B-C: då rör sig bara en eller två toner per byte.'},
  {title:'Andalusisk kadens', meta:'Am–G–F–E · 100 bpm · Flamenco/filmmusik', chords:'Am G F E', bpm:100, tip:'E-dur efter F är det som ger spänningen. Håll E lite längre innan du går tillbaka till Am.'},
  {title:'Doomsday (piano reprise) – vers', meta:'Architects · F♯-moll · 62 bpm · ackord enligt chordu.com och cifras.com.br', chords:'D F#m D F#m A D F#m D E F#m', bpm:62,
   tip:'Spela ackorden brutet: bas med vänster hand, sedan terts–kvint–oktav i höger som åttondelar. Melodin spelar du in själv från högtalaren under Spela in och sparar som fingerspel-stycke.'},
  {title:'Doomsday (piano reprise) – refräng', meta:'Architects · F♯-moll · 62 bpm · ackord enligt chordu.com och cifras.com.br', chords:'F#m D Bm F#m D Bm F#m F#m', bpm:62,
   tip:'F♯m–D–Bm är i–VI–iv: samma funktioner som popkadensen men i moll. Håll pedalen genom varje ackord och byt rent på ettan.'},
];

/* ============================================================
   Persistence
   ============================================================ */
const LS = 'pianosnabb-v1';
let store = {stats:{}, days:{}, level:'maj'};
try{ const s = localStorage.getItem(LS); if(s) store = Object.assign(store, JSON.parse(s)); }catch(e){}
function save(){ try{ localStorage.setItem(LS, JSON.stringify(store)); }catch(e){} }
function stat(key){ return store.stats[key] ||= {ok:0, tries:0, times:[], miss:0}; }
function mastery(key){ const s = store.stats[key]; if(!s||s.tries===0) return 0; const avg = s.times.length?s.times.reduce((a,b)=>a+b,0)/s.times.length:9; return (s.ok>=5 && avg<2) ? 2 : 1; }

/* ============================================================
   Audio input + chord detection
   ============================================================ */
let audioCtx=null, analyser=null, recAnalyser=null, recData=null, micStream=null, listening=false;
let freqData=null, timeData=null;
const FFT = 16384;
const chroma = new Float32Array(12);
const smooth = new Float32Array(12);
let liveNotes = [];       // midi numbers of detected peaks
let lastPeaks = [], lastFloor = -95; // raw spectral peaks from the last frame (for the piano recorder)
let detected = null;      // {name, root, type, bass, score}
let history = [];         // last N detections for majority vote
let rms = 0;

const micBtn = document.getElementById('micBtn');
micBtn.addEventListener('click', toggleMic);

async function toggleMic(){
  if(listening){ stopMic(); return; }
  try{
    audioCtx ||= PianoAudio.ctx;
    if(audioCtx.state==='suspended') await audioCtx.resume();
    micStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    const src = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    // fast analyser for note recording: 170 ms window, no smoothing, so short notes keep their onsets
    recAnalyser = audioCtx.createAnalyser(); recAnalyser.fftSize = 8192; recAnalyser.smoothingTimeConstant = 0.15;
    src.connect(recAnalyser); recData = new Float32Array(recAnalyser.frequencyBinCount);
    freqData = new Float32Array(analyser.frequencyBinCount);
    timeData = new Float32Array(analyser.fftSize);
    listening = true;
    micBtn.textContent = 'Stoppa';
    document.getElementById('micDot').classList.add('on');
    document.getElementById('micText').textContent = 'Lyssnar';
    requestAnimationFrame(loop);
  }catch(err){
    document.getElementById('micText').textContent = 'Ingen mikrofon: ' + (err.name==='NotAllowedError'?'nekad':location.protocol!=='https:'&&location.hostname!=='localhost'?'kräver https':err.name);
  }
}
function stopMic(){
  listening=false;
  if(micStream) micStream.getTracks().forEach(t=>t.stop());
  micBtn.textContent='Lyssna';
  if(midiOn){ updateMidiText(); requestAnimationFrame(midiLoop); return; }
  document.getElementById('micDot').classList.remove('on');
  document.getElementById('micText').textContent='Av';
  detected=null; liveNotes=[]; smooth.fill(0);
  renderLive(); renderDrillDetect();
}

// Precompute templates: 12 roots x types
const TEMPLATES = [];
for(let r=0;r<12;r++) for(const [t,def] of Object.entries(CHORD_TYPES)){
  const v = new Float32Array(12);
  def.iv.forEach((i,k)=>{ v[(r+i)%12] = k===0?1.0:0.9; });
  TEMPLATES.push({root:r,type:t,v,n:def.iv.length});
}

function analyse(){
  analyser.getFloatFrequencyData(freqData);
  analyser.getFloatTimeDomainData(timeData);
  let sum=0; for(let i=0;i<timeData.length;i+=4) sum+=timeData[i]*timeData[i];
  rms = Math.sqrt(sum/(timeData.length/4));
  const sr = audioCtx.sampleRate;
  const binHz = sr/FFT;
  const sens = +document.getElementById('sens').value;
  const floorDb = -95 + (10-sens)*3;       // noise floor
  chroma.fill(0);
  const peaks=[];
  const lo = Math.floor(60/binHz), hi = Math.ceil(2100/binHz);
  for(let i=lo;i<hi;i++){
    const db = freqData[i];
    if(db<floorDb) continue;
    if(db<freqData[i-1] || db<freqData[i+1]) continue; // local max only
    // parabolic interpolation for a better frequency estimate
    const a=freqData[i-1], b=db, c=freqData[i+1];
    const p = 0.5*(a-c)/(a-2*b+c);
    const f = (i+p)*binHz;
    const midi = 69+12*Math.log2(f/440);
    const pc = ((Math.round(midi)%12)+12)%12;
    const amp = Math.pow(10, db/20);
    const octWeight = 1/Math.pow(2,(Math.max(0,midi-48))/24); // de-emphasise overtones
    chroma[pc] += amp*octWeight;
    peaks.push({midi:Math.round(midi), amp, db});
  }
  // Normalise & smooth over time
  let mx=0; for(let i=0;i<12;i++) mx=Math.max(mx,chroma[i]);
  for(let i=0;i<12;i++){ const v = mx>0?chroma[i]/mx:0; smooth[i] = smooth[i]*0.6 + v*0.4; }

  // Live note list: strongest peaks, distinct pitch, limited to 6
  peaks.sort((a,b)=>b.amp-a.amp);
  lastPeaks=peaks; lastFloor=floorDb;
  const seen=new Set(); liveNotes=[];
  for(const p of peaks){ if(p.midi<36||p.midi>96) continue; if(seen.has(p.midi)) continue; seen.add(p.midi); liveNotes.push(p.midi); if(liveNotes.length>=6) break; }
  liveNotes.sort((a,b)=>a-b);

  const silent = rms < 0.004*(11-sens)/5 || peaks.length===0;
  if(silent){ pushHistory(null); return; }

  // Chord matching: cosine similarity + penalty on energy outside the chord
  let best=null;
  let total=0; for(let i=0;i<12;i++) total+=smooth[i];
  const active = Array.from(smooth).filter(v=>v>0.3).length;
  for(const t of TEMPLATES){
    if(active<=2 && t.n>3) continue;
    let dot=0,nt=0,inChord=0;
    for(let i=0;i<12;i++){ dot+=smooth[i]*t.v[i]; nt+=t.v[i]*t.v[i]; if(t.v[i]>0) inChord+=smooth[i]; }
    let ns=0; for(let i=0;i<12;i++) ns+=smooth[i]*smooth[i];
    const cos = dot/Math.sqrt(ns*nt+1e-9);
    const coverage = inChord/(total+1e-9);
    // every chord tone must be present reasonably strongly
    let minTone=1; for(let i=0;i<12;i++) if(t.v[i]>0) minTone=Math.min(minTone,smooth[i]);
    const score = cos*0.6 + coverage*0.4 + minTone*0.15 - (t.n>3?0.04:0);
    if(!best||score>best.score) best={...t,score,minTone};
  }
  if(!best || best.score<0.62 || best.minTone<0.12){ pushHistory(null); return; }
  // bass: lowest live note decides inversion display
  const bassPc = liveNotes.length?liveNotes[0]%12:best.root;
  const bass = (bassPc!==best.root && CHORD_TYPES[best.type].iv.some(i=>(best.root+i)%12===bassPc)) ? bassPc : best.root;
  pushHistory({root:best.root,type:best.type,bass,score:best.score});
}
function pushHistory(d){
  history.push(d); if(history.length>7) history.shift();
  // majority vote over window
  const counts={}; let top=null;
  for(const h of history){ const k = h?`${h.root}|${h.type}|${h.bass}`:'-'; counts[k]=(counts[k]||0)+1; if(!top||counts[k]>counts[top]) top=k; }
  if(top==='-' || counts[top]<3){ detected=null; return; }
  const [r,t,b] = top.split('|');
  const root=+r, bass=+b;
  const name = NOTE_NAMES[root]+t+(bass!==root?'/'+NOTE_NAMES[bass]:'');
  detected = {root,type:t,bass,name};
}

function loop(){
  if(!listening) return;
  if(!midiOn || (hum.rec&&hum.source!=='midi')) analyse(); // MIDI is exact and takes precedence, except while recording from the mic
  renderLive();
  drillTick();
  humTick();
  pieceTick();
  requestAnimationFrame(loop);
}

/* ============================================================
   MIDI input (Bluetooth / USB keyboard) — exact chord detection
   ============================================================ */
let midiAccess=null, midiOn=false;
const held = new Map(); // midi -> velocity
const midiBtn = document.getElementById('midiBtn');
midiBtn.addEventListener('click', toggleMidi);

async function toggleMidi(){
  if(midiOn){ stopMidi(); return; }
  if(!navigator.requestMIDIAccess){
    document.getElementById('micText').textContent='Web MIDI saknas i denna webbläsare';
    return;
  }
  try{
    midiAccess ||= await navigator.requestMIDIAccess({sysex:false});
    midiAccess.onstatechange = bindMidiInputs;
    bindMidiInputs();
    midiOn=true;
    midiBtn.classList.add('primary'); micBtn.classList.remove('primary');
    document.getElementById('micDot').classList.add('on');
    updateMidiText();
    if(!listening) requestAnimationFrame(midiLoop);
  }catch(err){
    document.getElementById('micText').textContent='MIDI nekad: '+err.name;
  }
}
function stopMidi(){
  midiOn=false; held.clear();
  if(midiAccess) for(const inp of midiAccess.inputs.values()) inp.onmidimessage=null;
  midiBtn.classList.remove('primary'); micBtn.classList.add('primary');
  if(!listening){ document.getElementById('micDot').classList.remove('on'); document.getElementById('micText').textContent='Av'; detected=null; liveNotes=[]; renderLive(); renderDrillDetect(); }
}
function bindMidiInputs(){
  if(!midiAccess) return;
  const box=document.getElementById('midiDevices'); box.innerHTML='';
  let n=0;
  for(const inp of midiAccess.inputs.values()){
    inp.onmidimessage = onMidi; n++;
    const c=document.createElement('span'); c.className='chip done'; c.textContent=inp.name||'MIDI-enhet'; box.appendChild(c);
  }
  if(!n) box.innerHTML='<span class="chip">Inga enheter anslutna</span>';
  updateMidiText();
}
function updateMidiText(){
  if(!midiOn) return;
  const n = midiAccess ? [...midiAccess.inputs.values()].length : 0;
  document.getElementById('micText').textContent = n?`MIDI: ${n} enhet${n>1?'er':''}`:'MIDI: väntar på enhet';
}
function onMidi(e){
  const [status,d1,d2]=e.data; const cmd=status&0xf0;
  if(hum.rec&&hum.source==='midi') humMidiEvent(cmd,d1,d2,performance.now());
  if(cmd===0x90 && d2>0) held.set(d1,d2);
  else if(cmd===0x80 || (cmd===0x90&&d2===0)) held.delete(d1);
  else if(cmd===0xB0 && d1===123) held.clear(); // all notes off
  else return;
  midiUpdate();
}
function midiUpdate(){
  liveNotes=[...held.keys()].sort((a,b)=>a-b);
  const pcs=new Set(liveNotes.map(m=>m%12));
  // exact chroma for the live view
  smooth.fill(0); pcs.forEach(p=>smooth[p]=1);
  detected=null;
  if(pcs.size>=3){
    // find a template whose pitch-class set equals the held set exactly; prefer fewer notes, then root = bass
    const bass=liveNotes[0]%12;
    let best=null;
    for(const t of TEMPLATES){
      if(t.n!==pcs.size) continue;
      let ok=true; for(let i=0;i<12;i++){ if((t.v[i]>0)!==pcs.has(i)){ok=false;break;} }
      if(!ok) continue;
      const score = (t.root===bass?2:0) + (t.type===''||t.type==='m'?1:0);
      if(!best||score>best.score) best={...t,score};
    }
    if(best){
      const b = best.root===bass?best.root:bass;
      detected={root:best.root,type:best.type,bass:b,name:NOTE_NAMES[best.root]+best.type+(b!==best.root?'/'+NOTE_NAMES[b]:'')};
    }
  }
}
function midiLoop(){
  if(!midiOn || listening) return; // when mic is also on, the mic loop drives rendering
  renderLive(); drillTick(); humTick(); pieceTick();
  requestAnimationFrame(midiLoop);
}

/* ============================================================
   Recording: voice (pitch tracking), piano via mic (polyphonic peak tracking), MIDI (exact)
   Raw events are stored in milliseconds; tempo is estimated from the player's own onsets
   afterwards, so free-time playing lands correctly on the roll. Quantization is optional.
   ============================================================ */
const hum = {rec:false, source:'voice', raw:[], notes:[], t0:0, practice:false, pIdx:0, pHold:0, buf:null, oct:0, bpm:100, playing:null, steps:[], grid:0,
             // voice tracker state
             v:{cur:null, pitchHist:[], rmsPeak:0, dipped:false, miss:0, cand:null, candN:0},
             // piano-mic tracker state: midi -> {on:frames, off:frames, db, startMs, peakDb}
             p:{active:new Map(), seen:new Map()}};
const humRoll = new PianoRoll(el('humRoll'), {
  editable:true, grid:0.25, ppb:56, rowH:16,
  onChange:()=>{ hum.notes=humRoll.notes; humAfterEdit(); },
  onSelect:n=>{ el('rtDel').disabled=!n; },
  onTap:n=>PianoAudio.play(n.m+hum.oct,{dur:Math.max(.3,n.d*60/hum.bpm),vel:n.vel??.8}),
  onEmptyTap:(t,m)=>{ humRoll.addNote(t,m,1); PianoAudio.play(m+hum.oct,{dur:.5}); },
  onKey:m=>PianoAudio.play(m+hum.oct,{dur:.6})
});
el('humBpm').addEventListener('input',e=>{ hum.bpm=+e.target.value; el('humBpmV').textContent=hum.bpm+' bpm'; });
el('srcSeg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  if(hum.rec) humStop();
  hum.source=b.dataset.src; el('srcSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  el('humCents').textContent = hum.source==='voice'?'nynna, vissla eller sjung "da-da-da"':hum.source==='piano'?'spela på pianot, mobilen lyssnar':'spela på MIDI-keyboardet';
}));
el('gridSeg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
  hum.grid=+b.dataset.grid; el('gridSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  humRoll.opts.grid = hum.grid||0.25;
  if(hum.raw.length) rawToNotes(); else if(hum.grid){ humRoll.quantize(hum.grid); }
  humRoll.draw();
}));
el('humRec').addEventListener('click', async()=>{
  if(hum.rec){ humStop(); return; }
  if(hum.source==='midi'){ if(!midiOn){ await toggleMidi(); if(!midiOn) return; } }
  else { if(!listening){ await toggleMic(); if(!listening) return; } }
  PianoAudio.init();
  hum.rec=true; hum.practice=false; hum.raw=[]; hum.t0=0;
  hum.v={cur:null,pitchHist:[],rmsPeak:0,dipped:false,miss:0,cand:null,candN:0}; hum.p={active:new Map(),seen:new Map()};
  hum.notes=[]; humRoll.setNotes([]); el('humChordsCard').hidden=true; el('humInfo').textContent='';
  el('humRec').textContent='■ Stopp'; el('humState').textContent='spelar in'; el('humState').className='chip now';
});
function humStop(){
  if(!hum.rec) return;
  const now=performance.now();
  hum.rec=false; voiceCommit(now); pianoFlush(now); midiFlush(now);
  el('humRec').textContent='● Spela in';
  if(hum.raw.length){
    const est=estimateTempo(hum.raw);
    hum.bpm=est.bpm; el('humBpm').value=hum.bpm; el('humBpmV').textContent=hum.bpm+' bpm';
    rawToNotes();
    el('humInfo').textContent=`${hum.raw.length} toner · puls ≈ ${est.bpm} bpm${est.confident?'':' (osäker, justera tempot)'} · ${hum.grid?'snäppt till rutnät':'fri tid'}`;
  }
  el('humState').textContent=hum.raw.length?hum.raw.length+' toner':'inget hördes'; el('humState').className='chip';
  humRoll.scrollToStart();
}
/* ---- tempo estimation from inter-onset intervals ---- */
function estimateTempo(raw){
  const on=[...new Set(raw.map(n=>Math.round(n.startMs)))].sort((a,b)=>a-b);
  const ioi=[]; for(let i=1;i<on.length;i++){ const d=on[i]-on[i-1]; if(d>=110&&d<=2400) ioi.push(d); }
  if(ioi.length<3) return {bpm:100,confident:false};
  // cluster IOIs on a log scale; the densest cluster is the base pulse unit
  const logs=ioi.map(d=>Math.log2(d)).sort((a,b)=>a-b);
  let best={c:0,v:0};
  for(const x of logs){ const c=logs.filter(y=>Math.abs(y-x)<0.18).length; if(c>best.c) best={c,v:x}; }
  const members=ioi.filter(d=>Math.abs(Math.log2(d)-best.v)<0.18).sort((a,b)=>a-b);
  const base=members[Math.floor(members.length/2)];
  // choose a beat = base × k so bpm falls in 60–150; pick the k that best explains all IOIs as small multiples
  let bestK=null;
  for(const k of [0.5,1,2,3,4]){
    const beat=base*k, bpm=60000/beat; if(bpm<56||bpm>160) continue;
    let err=0; ioi.forEach(d=>{ const r=d/beat; const q=Math.max(0.5,Math.round(r*2)/2); err+=Math.abs(r-q)/q; });
    err/=ioi.length; const score=err+(bpm<70||bpm>130?0.08:0);
    if(!bestK||score<bestK.score) bestK={k,bpm:Math.round(bpm),score};
  }
  if(!bestK) return {bpm:Math.round(Math.min(150,Math.max(60,60000/base))),confident:false};
  // refine: re-centre the beat on all intervals (each interval = q beats, q in halves), two passes
  let beat=base*bestK.k;
  for(let pass=0;pass<2;pass++){
    const est=ioi.map(d=>{ const q=Math.max(0.5,Math.round(d/beat*2)/2); return d/q; }).sort((a,b)=>a-b);
    const mid=est.slice(Math.floor(est.length*0.2),Math.ceil(est.length*0.8)); // trimmed mean
    beat=mid.reduce((a,b)=>a+b,0)/mid.length;
  }
  return {bpm:Math.round(60000/beat),confident:best.c>=Math.max(3,ioi.length*0.4)&&bestK.score<0.12};
}
/* ---- ms events -> roll notes in beats, optional snapping ---- */
function rawToNotes(){
  const bm=60000/hum.bpm; const t0=Math.min(...hum.raw.map(n=>n.startMs));
  const g=hum.grid;
  const snap=v=>g?Math.round(v/g)*g:Math.round(v*32)/32;
  hum.notes=hum.raw.map((n,i)=>{
    let t=(n.startMs-t0)/bm, d=Math.max(0.1,(n.endMs-n.startMs)/bm);
    if(g){ t=snap(t); d=Math.max(g,snap(d)); } else { t=snap(t); d=snap(d); }
    return {id:i+1,t,d,m:n.m,vel:n.vel??0.8};
  });
  humRoll.setNotes(hum.notes); humAfterEdit();
}
function humAfterEdit(){
  hum.notes=humRoll.notes;
  if(hum.notes.length>=2) humSuggestChords(); else el('humChordsCard').hidden=true;
  drawPiano(el('pianoHum'), hum.notes.map(n=>n.m+hum.oct), []);
}
el('humClear').addEventListener('click',()=>{ if(hum.rec) humStop(); hum.notes=[]; hum.raw=[]; hum.practice=false; humRoll.setNotes([]); el('humChordsCard').hidden=true; el('humInfo').textContent=''; el('humState').textContent='redo'; el('humState').className='chip'; el('humPractice').textContent='Öva melodin'; drawPiano(el('pianoHum')); });
el('humOctSeg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ hum.oct=+b.dataset.oct; el('humOctSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); humAfterEdit(); }));
el('rtUp').addEventListener('click',()=>{ humRoll.nudgeSelected(1); if(humRoll.selected) PianoAudio.play(humRoll.selected.m+hum.oct,{dur:.4}); });
el('rtDown').addEventListener('click',()=>{ humRoll.nudgeSelected(-1); if(humRoll.selected) PianoAudio.play(humRoll.selected.m+hum.oct,{dur:.4}); });
el('rtAdd').addEventListener('click',()=>{ const last=humRoll.notes.reduce((a,n)=>n.t+n.d>a.t+a.d?n:a,{t:0,d:0,m:64}); humRoll.addNote(humRoll.snap(last.t+last.d), last.m, 1); });
el('rtDel').addEventListener('click',()=>humRoll.deleteSelected());
el('rtQuant').addEventListener('click',()=>{ const g=hum.grid||0.5; humRoll.quantize(g); hum.raw=[]; el('humInfo').textContent=`snäppt till ${g===1?'fjärdedelar':g===0.5?'åttondelar':g===0.25?'sextondelar':'trioler'}`; });
el('rtZoomIn').addEventListener('click',()=>humRoll.zoom(1.3));
el('rtZoomOut').addEventListener('click',()=>humRoll.zoom(1/1.3));

/* ---- playback with moving playhead ---- */
function playRoll(roll, notes, bpm, oct, onDone){
  PianoAudio.init();
  const bm=60/bpm, start=PianoAudio.now+0.08;
  const sorted=[...notes].sort((a,b)=>a.t-b.t);
  sorted.forEach(n=>PianoAudio.play(n.m+oct,{dur:n.d*bm, when:0.08+n.t*bm, vel:n.vel??(n.hand==='L'?0.6:0.8)}));
  const end=Math.max(...sorted.map(n=>n.t+n.d),1);
  const job={stop:false};
  (function frame(){
    if(job.stop){ roll.setPlayhead(-1); return; }
    const b=(PianoAudio.now-start)/bm;
    roll.setPlayhead(b);
    if(b<end+0.5) requestAnimationFrame(frame); else { roll.setPlayhead(-1); onDone&&onDone(); }
  })();
  return job;
}
el('humPlay').addEventListener('click',()=>{
  if(hum.playing){ hum.playing.stop=true; PianoAudio.stopAll(); hum.playing=null; el('humPlay').textContent='▶ Spela upp'; return; }
  if(!hum.notes.length) return;
  if(hum.rec) humStop();
  hum.practice=false; el('humPractice').textContent='Öva melodin';
  el('humPlay').textContent='■ Stopp';
  hum.playing=playRoll(humRoll, hum.notes, hum.bpm, hum.oct, ()=>{ hum.playing=null; el('humPlay').textContent='▶ Spela upp'; });
});
/* ---- practice: step through in time order, timing-free ---- */
function humSteps(){
  const sorted=[...hum.notes].sort((a,b)=>a.t-b.t||a.m-b.m); const steps=[];
  sorted.forEach(n=>{ const last=steps[steps.length-1]; if(last&&Math.abs(last.t-n.t)<0.08) last.notes.push(n); else steps.push({t:n.t,notes:[n]}); });
  return steps;
}
el('humPractice').addEventListener('click',async()=>{
  if(!hum.notes.length) return;
  if(hum.practice){ hum.practice=false; el('humPractice').textContent='Öva melodin'; humRoll.setPlayhead(-1); el('humState').textContent=hum.notes.length+' toner'; el('humState').className='chip'; return; }
  if(hum.rec) humStop();
  if(!listening&&!midiOn){ await toggleMic(); if(!listening) return; }
  if(hum.playing){ hum.playing.stop=true; hum.playing=null; el('humPlay').textContent='▶ Spela upp'; }
  hum.practice=true; hum.pIdx=0; hum.pHold=0; hum.steps=humSteps();
  el('humPractice').textContent='Avbryt övning';
  practiceShow();
});
function practiceShow(){
  const st=hum.steps[hum.pIdx];
  humRoll.setPlayhead(st.t);
  drawPiano(el('pianoHum'), st.notes.map(n=>n.m+hum.oct), liveNotes);
  el('humState').textContent=`spela ton ${hum.pIdx+1}/${hum.steps.length}`; el('humState').className='chip now';
}
/* ---- voice: normalised autocorrelation pitch (McLeod), returns Hz or -1 ---- */
function detectPitch(buf, sr){
  const N=buf.length; let rms=0; for(let i=0;i<N;i++) rms+=buf[i]*buf[i]; rms=Math.sqrt(rms/N);
  if(rms<0.008) return -1;
  const minLag=Math.floor(sr/1100), maxLag=Math.floor(sr/65);
  const nsdf=new Float32Array(maxLag+2);
  for(let lag=minLag;lag<=maxLag;lag++){
    let ac=0,m=0; for(let i=0;i<N-lag;i++){ ac+=buf[i]*buf[i+lag]; m+=buf[i]*buf[i]+buf[i+lag]*buf[i+lag]; }
    nsdf[lag]=2*ac/(m+1e-9);
  }
  // collect all peaks after the first negative crossing; take the first peak that is within 80% of the global max (avoids octave-down errors)
  const peaks=[]; let started=false;
  for(let lag=minLag+1;lag<maxLag;lag++){
    if(!started){ if(nsdf[lag]<0) started=true; continue; }
    if(nsdf[lag]>nsdf[lag-1]&&nsdf[lag]>=nsdf[lag+1]&&nsdf[lag]>0.3) peaks.push(lag);
  }
  if(!peaks.length) return -1;
  const gmax=Math.max(...peaks.map(l=>nsdf[l]));
  if(gmax<0.62) return -1;
  const best=peaks.find(l=>nsdf[l]>=gmax*0.8);
  const a=nsdf[best-1],b=nsdf[best],c=nsdf[best+1]; const p=0.5*(a-c)/(a-2*b+c||1e-9);
  return sr/(best+p);
}
function humTick(){
  if(!el('view-hum').classList.contains('active')) return;
  const now=performance.now();
  if(hum.practice){
    const st=hum.steps[hum.pIdx]; const want=st.notes.map(n=>n.m+hum.oct);
    const ok = want.every(w=>liveNotes.some(m=>m===w || m%12===w%12)) && liveNotes.length<=want.length+1;
    drawPiano(el('pianoHum'), want, liveNotes);
    hum.pHold = ok?hum.pHold+16:0;
    if(hum.pHold>=220){ hum.pIdx++; hum.pHold=0; if(hum.pIdx>=hum.steps.length){ hum.practice=false; el('humPractice').textContent='Öva melodin'; el('humState').textContent='hela melodin klar!'; el('humState').className='chip done'; humRoll.setPlayhead(-1); const s=stat('hum:melody'); s.tries++; s.ok++; save(); return; } practiceShow(); }
    return;
  }
  if(!hum.rec) return;
  if(hum.source==='voice' && listening) voiceTick(now);
  else if(hum.source==='piano' && listening) pianoTick(now);
  else if(hum.source==='midi'){ el('humNote').innerHTML=(liveNotes.length?liveNotes.map(noteLabel).join(' '):'–')+`<small id="humCents">${hum.raw.length} toner inspelade</small>`; }
  drawPiano(el('pianoHum'), hum.raw.slice(-24).map(n=>n.m+hum.oct), hum.source==='voice'?(hum.v.cur?[hum.v.cur.m]:[]):hum.source==='piano'?[...hum.p.active.keys()]:liveNotes);
}
/* voice tracker */
function voiceTick(now){
  const v=hum.v;
  if(!hum.buf||hum.buf.length!==2048) hum.buf=new Float32Array(2048);
  hum.buf.set(timeData.subarray(timeData.length-2048));
  const f=detectPitch(hum.buf,audioCtx.sampleRate);
  // re-articulation on the same pitch: energy dips then recovers
  if(rms>v.rmsPeak) v.rmsPeak=rms; else v.rmsPeak*=0.985;
  if(rms<v.rmsPeak*0.35) v.dipped=true;
  if(f>0){
    const midiF=69+12*Math.log2(f/440);
    v.pitchHist.push(midiF); if(v.pitchHist.length>5) v.pitchHist.shift();
    const med=[...v.pitchHist].sort((a,b)=>a-b)[Math.floor(v.pitchHist.length/2)];
    const m=Math.round(med); const cents=Math.round((med-m)*100);
    el('humNote').innerHTML=`${noteLabel(m)}<small id="humCents">${cents>0?'+':''}${cents} cent · ${f.toFixed(0)} Hz</small>`;
    v.miss=0;
    if(v.cur&&v.cur.m===m){
      if(v.dipped&&rms>v.rmsPeak*0.7&&now-v.cur.startMs>160){ voiceCommit(now); v.cur={m,startMs:now,vel:Math.min(1,rms*6)}; v.dipped=false; }
      v.cur.vel=Math.max(v.cur.vel,Math.min(1,rms*6));
    } else {
      // candidate must hold for 3 frames; an octave jump needs 5 (common vocal/whistle detection error)
      if(v.cand===m) v.candN++; else { v.cand=m; v.candN=1; }
      const need=(v.cur&&Math.abs(m-v.cur.m)===12)?4:2;
      if(v.candN>=need){ voiceCommit(now-16*need); v.cur={m,startMs:now-16*need,vel:Math.min(1,rms*6)}; v.cand=null; v.candN=0; v.dipped=false; v.rmsPeak=rms; }
    }
  } else {
    el('humNote').innerHTML=`–<small id="humCents">lyssnar…</small>`;
    v.pitchHist=[]; v.cand=null; v.candN=0;
    if(++v.miss>=3) voiceCommit(now-16*3);
  }
}
function voiceCommit(now){
  const v=hum.v; if(!v.cur) return;
  const dur=now-v.cur.startMs;
  if(dur>=HUM_MIN_MS){
    const last=hum.raw[hum.raw.length-1];
    if(last&&last.m===v.cur.m&&v.cur.startMs-last.endMs<60&&!v.dipped){ last.endMs=now; }
    else hum.raw.push({m:v.cur.m,startMs:v.cur.startMs,endMs:now,vel:v.cur.vel});
    el('humState').textContent=hum.raw.length+' toner';
  }
  v.cur=null;
}
const HUM_MIN_MS=110;
/* piano-via-mic tracker. Own fast FFT, adaptive noise floor, onset by level jump,
   harmonic suppression that never swallows a tone that is itself attacking. */
function recPeaks(){
  recAnalyser.getFloatFrequencyData(recData);
  const sr=audioCtx.sampleRate, binHz=sr/recAnalyser.fftSize;
  const lo=Math.floor(60/binHz), hi=Math.min(recData.length-2, Math.ceil(2500/binHz));
  // adaptive floor: median of the band + margin, but never below the user's sensitivity floor
  const sample=[]; for(let i=lo;i<hi;i+=7) sample.push(recData[i]); sample.sort((a,b)=>a-b);
  const floor=Math.max(lastFloor, sample[Math.floor(sample.length/2)]+12);
  const peaks=[];
  for(let i=lo;i<hi;i++){
    const db=recData[i]; if(db<floor) continue;
    if(db<recData[i-1]||db<recData[i+1]) continue;
    const a=recData[i-1],b=db,c=recData[i+1]; const p=0.5*(a-c)/(a-2*b+c||1e-9);
    const f=(i+p)*binHz; const midi=Math.round(69+12*Math.log2(f/440));
    const prev=peaks[peaks.length-1];
    if(prev&&prev.midi===midi){ if(db>prev.db) prev.db=db; continue; }
    peaks.push({midi,db});
  }
  return {peaks,floor};
}
function pianoTick(now){
  const p=hum.p; p.hist ||= [];
  const {peaks,floor}=recPeaks();
  const histMin=m=>{ let v=Infinity; for(const h of p.hist){ const x=h.get(m); v=Math.min(v,x===undefined?-200:x); } return v===Infinity?-200:v; };
  const inRange=peaks.filter(pk=>pk.midi>=33&&pk.midi<=100).sort((a,b)=>a.midi-b.midi);
  const rising=pk=>pk.db-histMin(pk.midi)>=6; // jumped up vs. the quietest of the last 3 frames: an attack
  const fundamentals=[];
  for(const pk of inRange){
    // a peak is a harmonic of a lower, stronger peak (octave / twelfth / double octave) unless it is attacking on its own
    const margin={12:-3,19:0,24:3}; // the further the partial, the stronger the fundamental must be
    const harmonicOf=fundamentals.find(f=>margin[pk.midi-f.midi]!==undefined && f.db>=pk.db+margin[pk.midi-f.midi] && (!rising(pk)||rising(f)));
    if(!harmonicOf) fundamentals.push(pk);
  }
  const strongest=fundamentals.sort((a,b)=>b.db-a.db).slice(0,6);
  const present=new Map(strongest.map(pk=>[pk.midi,pk.db]));
  for(const [m,st] of p.active){
    const db=present.get(m);
    if(db!==undefined && db>st.peakDb-22){
      st.off=0;
      if(db<st.peakDb-6) st.dropped=true; // the note has started decaying; only after this can a new strike be recognised
      if(st.dropped && db-histMin(m)>=7 && db>=st.peakDb-6 && now-st.startMs>110){ // struck again while still ringing
        hum.raw.push({m,startMs:st.startMs,endMs:now,vel:st.vel}); st.startMs=now; st.peakDb=db; st.vel=Math.min(1,(db-floor)/45); st.dropped=false;
      }
      st.lastDb=db; st.peakDb=Math.max(st.peakDb,db);
    } else if(++st.off>=3){
      if(now-16*3-st.startMs>=95) hum.raw.push({m,startMs:st.startMs,endMs:now-16*3,vel:st.vel});
      p.active.delete(m); (p.ended ||= new Map()).set(m,now);
    }
  }
  for(const [m,db] of present){
    if(p.active.has(m)) continue;
    // a note that just ended may only come back as a real new attack (its tail keeps showing for a while)
    const recentlyEnded=p.ended&&p.ended.get(m)!==undefined&&now-p.ended.get(m)<500;
    const strong=(!recentlyEnded && db>floor+18) || db-histMin(m)>=6;
    if(recentlyEnded && db-histMin(m)<6) continue;
    const seen=(p.seen.get(m)||0)+1; p.seen.set(m,seen);
    if(strong||seen>=2){ p.active.set(m,{startMs:now-(strong?0:16),off:0,lastDb:db,peakDb:db,vel:Math.min(1,(db-floor)/45)}); p.seen.delete(m); }
  }
  for(const m of [...p.seen.keys()]) if(!present.has(m)) p.seen.delete(m);
  p.hist.push(new Map(inRange.map(pk=>[pk.midi,pk.db]))); if(p.hist.length>3) p.hist.shift();
  const names=[...p.active.keys()].sort((a,b)=>a-b).map(noteLabel).join(' ');
  el('humNote').innerHTML=`${names||'–'}<small id="humCents">${hum.raw.length} toner inspelade</small>`;
  el('humState').textContent=hum.raw.length+' toner';
}
function pianoFlush(now){ for(const [m,st] of hum.p.active){ if(now-st.startMs>=95) hum.raw.push({m,startMs:st.startMs,endMs:now,vel:st.vel}); } hum.p.active.clear(); }
/* MIDI recorder (called from onMidi) */
const midiOpen=new Map();
function humMidiEvent(cmd,d1,d2,now){
  if(cmd===0x90&&d2>0){ midiOpen.set(d1,{startMs:now,vel:d2/127}); }
  else if(cmd===0x80||(cmd===0x90&&d2===0)){ const o=midiOpen.get(d1); if(o){ hum.raw.push({m:d1,startMs:o.startMs,endMs:now,vel:o.vel}); midiOpen.delete(d1); el('humState').textContent=hum.raw.length+' toner'; } }
}
function midiFlush(now){ for(const [m,o] of midiOpen){ hum.raw.push({m,startMs:o.startMs,endMs:now,vel:o.vel}); } midiOpen.clear(); }
function noteLabel(m){ return NOTE_NAMES[m%12].replace('#','♯')+(Math.floor(m/12)-1); }

/* ---- key finding (Krumhansl-Schmuckler) + one diatonic chord per half bar ---- */
const KS_MAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88], KS_MIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function humSuggestChords(){
  const notes=[...hum.notes].sort((a,b)=>a.t-b.t);
  const prof=new Array(12).fill(0); notes.forEach(n=>prof[n.m%12]+=n.d);
  let best={r:-1};
  for(let k=0;k<12;k++) for(const [name,ks,minor] of [['dur',KS_MAJ,false],['moll',KS_MIN,true]]){
    let r=0, a=0,b=0; const ma=prof.reduce((x,y)=>x+y,0)/12, mb=ks.reduce((x,y)=>x+y,0)/12;
    for(let i=0;i<12;i++){ const x=prof[(i+k)%12]-ma, y=ks[i]-mb; r+=x*y; a+=x*x; b+=y*y; }
    r/=Math.sqrt(a*b)+1e-9; if(r>best.r) best={r,key:k,minor,name};
  }
  const {key,minor}=best;
  const scale=minor?MINOR_SCALE:MAJOR_SCALE, qual=minor?MINOR_QUAL:MAJOR_QUAL;
  const diatonic=scale.map((s,i)=>({name:NOTE_NAMES[(key+s)%12]+qual[i],pcs:new Set(CHORD_TYPES[qual[i]].iv.map(v=>(key+s+v)%12)),deg:i}));
  // one chord per 2 beats (half bar) of the roll
  const span=2; const end=Math.max(...notes.map(n=>n.t+n.d)); const groups=[];
  for(let t=0;t<end;t+=span){ const g=notes.filter(n=>n.t<t+span&&n.t+n.d>t); if(g.length) groups.push({t,notes:g}); }
  const total=notes.reduce((a,n)=>a+n.d,0);
  const prefer=minor?[0,3,4,5,6]:[0,3,4,5,1];
  const chords=groups.map((grp,gi)=>{
    let bestC=null;
    for(const c of diatonic){
      let s=0; grp.notes.forEach((n,i)=>{ if(c.pcs.has(n.m%12)) s+=n.d*(i===0?1.6:1); });
      s += prefer.includes(c.deg)?total*0.02:0;
      if(gi===0&&c.deg===0) s+=total*0.05; if(gi===groups.length-1&&c.deg===0) s+=total*0.05;
      if(!bestC||s>bestC.s) bestC={s,name:c.name};
    }
    return bestC.name;
  });
  const fl=useFlats(key,minor);
  el('humKey').innerHTML=`Melodin går i <b>${dn(NOTE_NAMES[key],fl)}-${best.name}</b>. Ett ackord per halvtakt:`;
  el('humChords').innerHTML=chords.map(c=>`<span class="play" data-chord="${c}">${dn(c,fl)}</span>`).join('');
  el('humChordsCard').hidden=false;
}

/* ============================================================
   Playback (reference sound) — thin wrappers over PianoAudio
   ============================================================ */
function playNotes(midis, dur=1.4){ PianoAudio.chord(midis,{dur}); }
function click(accent){ PianoAudio.click(accent); }

/* ============================================================
   Piano SVG. targets: midi numbers or {m, f (finger), hand ('R'|'L')}
   ============================================================ */
function drawPiano(svg, targets=[], liveMidis=[]){
  const T = targets.map(t=>typeof t==='number'?{m:t,hand:'R'}:Object.assign({hand:'R'},t));
  const tm = T.map(t=>t.m);
  let from=48,to=83; // C3..B5 by default, widen to fit targets (whole octaves)
  if(tm.length){ from=Math.min(48,Math.floor(Math.min(...tm)/12)*12); to=Math.max(83,Math.ceil((Math.max(...tm)+1)/12)*12-1); }
  if(liveMidis.length){ const lm=Math.min(...liveMidis), hm=Math.max(...liveMidis); if(lm<from) from=Math.max(21,Math.floor(lm/12)*12); if(hm>to) to=Math.min(108,Math.ceil((hm+1)/12)*12-1); }
  const isBlack = m=>[1,3,6,8,10].includes(m%12);
  const whites=[]; for(let m=from;m<=to;m++) if(!isBlack(m)) whites.push(m);
  const W=700/whites.length; const tall=W>22;
  const byM=new Map(T.map(t=>[t.m,t])); const lv=new Set(liveMidis); const tpc=new Set(tm.map(m=>m%12));
  const col=t=>t.hand==='L'?'var(--key-lh)':'var(--key-target)';
  let out='';
  whites.forEach((m,i)=>{
    const x=i*W; const t=byM.get(m);
    const fill=t?col(t):lv.has(m)?'var(--key-live)':'var(--key-w)';
    out+=`<rect x="${x+1}" y="2" width="${W-2}" height="146" rx="${tall?3:2}" fill="${fill}" stroke="var(--line)"/>`;
    if(t&&lv.has(m)) out+=`<rect x="${x+1}" y="110" width="${W-2}" height="38" rx="2" fill="var(--key-live)"/>`;
    if(!t&&tpc.has(m%12)) out+=`<circle cx="${x+W/2}" cy="132" r="${tall?5:3.5}" fill="var(--key-target)" opacity=".5"/>`;
    if(t&&t.f) out+=`<text x="${x+W/2}" y="${tall?118:122}" text-anchor="middle" font-size="${tall?16:13}" font-weight="700" font-family="var(--font-display)" fill="#fff">${t.f}</text>`;
    if(m%12===0) out+=`<text x="${x+W/2}" y="142" text-anchor="middle" font-size="${tall?11:9}" font-family="var(--font-mono)" fill="${t?'#fff':'var(--muted)'}">C${Math.floor(m/12)-1}</text>`;
  });
  let wi=0;
  for(let m=from;m<=to;m++){
    if(isBlack(m)){
      const bx=(wi-1)*W+W*0.65; const t=byM.get(m);
      const fill=t?col(t):lv.has(m)?'var(--key-live)':'var(--key-b)';
      out+=`<rect x="${bx}" y="2" width="${W*0.7}" height="92" rx="2" fill="${fill}" stroke="var(--key-b)"/>`;
      if(t&&lv.has(m)) out+=`<rect x="${bx}" y="70" width="${W*0.7}" height="24" rx="2" fill="var(--key-live)"/>`;
      if(!t&&tpc.has(m%12)) out+=`<circle cx="${bx+W*0.35}" cy="80" r="${tall?4:3}" fill="var(--key-target)" opacity=".5"/>`;
      if(t&&t.f) out+=`<text x="${bx+W*0.35}" y="62" text-anchor="middle" font-size="${tall?14:11}" font-weight="700" font-family="var(--font-display)" fill="#fff">${t.f}</text>`;
    } else wi++;
  }
  svg.innerHTML=out;
}

/* ============================================================
   Drill engine
   ============================================================ */
let level = LEVELS.find(l=>l.id===store.level)||LEVELS[1];
let target = null;        // {key, midis, chord?, note?}
let targetStart = 0;
let holdMs = 0, lastTick = 0;
let streak=0, sessionOk=0, sessionTimes=[];
let prog = null;          // progression state {chords:[], idx, bpm, timer}
let justHit = false;

function levelProgress(l){
  const items = l.kind==='prog' ? l.items : l.items;
  const done = items.filter(i=>mastery(l.id+':'+i)===2).length;
  return done/items.length;
}
function pickItem(){
  // weighted: untrained & missed items first
  const items = level.items.map(i=>{
    const s = stat(level.id+':'+i);
    const m = mastery(level.id+':'+i);
    const w = (m===2?1:m===1?3:5) + s.miss*2;
    return {i,w};
  }).filter(x=>!target||x.i!==target.item||level.items.length===1);
  const tot = items.reduce((a,b)=>a+b.w,0);
  let r=Math.random()*tot;
  for(const it of items){ r-=it.w; if(r<=0) return it.i; }
  return items[0].i;
}
function setTarget(item){
  stopProg();
  const key = level.id+':'+item;
  if(level.kind==='note'){
    const pc = NOTE_NAMES.indexOf(item);
    target = {key, item, note:pc, midis:[60+pc]};
    el('targetName').innerHTML = item + (NOTE_SV[item]?` <small>${NOTE_SV[item]}</small>`:'');
    el('fingering').innerHTML = `Spela <b>${item}</b> var som helst på klaviaturen. Högra tummen är bra att börja med.`;
    drawPiano(el('piano'), [60+pc], []);
  } else if(level.kind==='chord'){
    const c = parseChord(item);
    target = {key, item, chord:c, midis:chordVoicing(c)};
    el('targetName').innerHTML = item.replace('#','♯') + ` <small>${CHORD_TYPES[c.type].label}</small>`;
    el('fingering').innerHTML = fingeringText(c);
    drawPiano(el('piano'), target.midis, []);
  } else {
    startProg(item.split(' '), 70, key);
    return;
  }
  targetStart = performance.now(); holdMs=0; justHit=false;
  el('holdBar').style.width='0';
  renderChips(); renderDrillDetect();
}
function matches(){
  if(!target) return false;
  if(target.note!==undefined){
    return liveNotes.some(m=>m%12===target.note) && liveNotes.length<=2;
  }
  if(!detected) return false;
  const c = target.chord;
  if(SYMMETRIC.has(c.type) && detected.type===c.type){
    // Bdim7 = Ddim7 = Fdim7 = G#dim7: compare pitch-class sets
    const a=new Set(c.pcs), b=CHORD_TYPES[detected.type].iv.map(i=>(detected.root+i)%12);
    return b.every(p=>a.has(p));
  }
  if(detected.root!==c.root || detected.type!==c.type) return false;
  if(level.id==='inv' || level.strictBass || (prog&&prog.strictBass)) return detected.bass===(c.bass??c.root);
  return true;
}
function drillTick(){
  const now = performance.now(); const dt = lastTick?now-lastTick:16; lastTick=now;
  if(!target || justHit) return;
  if(matches()) holdMs+=dt; else holdMs=Math.max(0,holdMs-dt*2);
  el('holdBar').style.width = Math.min(100,holdMs/350*100)+'%';
  renderDrillDetect();
  if(holdMs>=350) hit();
}
function hit(manual=false){
  justHit=true;
  const t = (performance.now()-targetStart)/1000;
  const s = stat(target.key); s.tries++; s.ok++; s.times.push(Math.min(t,10)); if(s.times.length>10) s.times.shift();
  if(!manual){ s.miss=Math.max(0,s.miss-1); }
  store.days[new Date().toISOString().slice(0,10)]=1; save();
  streak++; sessionOk++; sessionTimes.push(t);
  el('stStreak').textContent=streak; el('stSession').textContent=sessionOk;
  el('stAvg').textContent=(sessionTimes.reduce((a,b)=>a+b,0)/sessionTimes.length).toFixed(1);
  el('drillCard').classList.remove('flash'); void el('drillCard').offsetWidth; el('drillCard').classList.add('flash');
  el('detectedLine').className='detected ok'; el('detectedLine').innerHTML=`<b>Rätt!</b> ${t.toFixed(1)} s`;
  if(prog){ progAdvance(true); return; }
  goalProgress();
  setTimeout(()=>setTarget(pickItem()), 650);
}
function skip(){
  if(target&&!prog){ const s=stat(target.key); s.tries++; s.miss++; save(); streak=0; el('stStreak').textContent=0; }
  if(prog){ progAdvance(false); return; }
  setTarget(pickItem());
}
function renderDrillDetect(){
  if(justHit) return;
  const line = el('detectedLine');
  line.className='detected'+(matches()?' ok':'');
  if(!listening&&!midiOn){ line.innerHTML = 'Tryck <b>Lyssna</b> (mikrofon) eller <b>MIDI</b> (keyboard) och spela'; return; }
  if(target&&target.note!==undefined){
    line.innerHTML = liveNotes.length?`Hör: <b>${liveNotes.map(m=>NOTE_NAMES[m%12]+(Math.floor(m/12)-1)).join(' ')}</b>`:'Lyssnar…';
  } else {
    line.innerHTML = detected?`Hör: <b>${detected.name.replace('#','♯')}</b>`:(liveNotes.length?`Toner: ${liveNotes.map(m=>NOTE_NAMES[m%12]).join(' ')}`:'Lyssnar…');
  }
  if(target) drawPiano(el('piano'), target.midis, liveNotes);
}
function renderChips(){
  const box=el('levelChips'); box.innerHTML='';
  level.items.forEach(i=>{
    const d=document.createElement('span'); d.className='chip';
    const m=mastery(level.id+':'+i); if(m===2) d.classList.add('done');
    if(target&&target.item===i) d.classList.add('now');
    d.textContent=i.replace(/#/g,'♯'); d.addEventListener('click',()=>setTarget(i)); box.appendChild(d);
  });
}

/* ---------- progression / song mode with metronome ---------- */
function startProg(chords, bpm, key, strictBass=false){
  stopProg();
  PianoAudio.init();
  prog = {chords, idx:0, bpm, key, beat:0, hits:0, strictBass, timer:null};
  el('fingering').innerHTML = `<div class="seq" id="seq"></div><div class="row" style="margin-top:.5rem"><label class="inline">Tempo <input type="range" id="bpm" min="40" max="140" value="${bpm}"> <span id="bpmV" class="chip">${bpm} bpm</span></label></div>`;
  el('bpm').addEventListener('input',e=>{prog.bpm=+e.target.value; el('bpmV').textContent=prog.bpm+' bpm'; schedule();});
  progShow();
  schedule();
}
function schedule(){
  if(!prog) return;
  clearInterval(prog.timer);
  prog.timer = setInterval(()=>{
    if(!prog) return;
    click(prog.beat%4===0);
    if(prog.beat%4===0 && prog.beat>0){ // new bar: advance regardless (keeps tempo honest)
      progAdvance(justHit);
    }
    prog.beat++;
  }, 60000/prog.bpm);
}
function progShow(){
  const name = prog.chords[prog.idx];
  const c = parseChord(name);
  target = {key:prog.key, item:name, chord:c, midis:chordVoicing(c)};
  targetStart=performance.now(); holdMs=0; justHit=false; el('holdBar').style.width='0';
  el('targetName').innerHTML = name.replace('#','♯') + ` <small>${prog.idx+1}/${prog.chords.length}</small>`;
  drawPiano(el('piano'), target.midis, []);
  const seq=el('seq'); if(seq){ seq.innerHTML=''; prog.chords.forEach((ch,i)=>{ const s=document.createElement('span'); s.textContent=ch.replace('#','♯'); if(i===prog.idx) s.className='now'; else if(i<prog.idx&&prog.hitMap?.[i]) s.className='hit'; seq.appendChild(s); }); }
  renderDrillDetect();
}
function progAdvance(wasHit){
  prog.hitMap ||= {}; prog.hitMap[prog.idx]=wasHit; if(wasHit) prog.hits++;
  prog.idx++;
  if(prog.idx>=prog.chords.length){
    // one full round done: score it
    const s=stat(prog.key); s.tries++;
    const ratio = prog.hits/prog.chords.length;
    if(ratio>=0.8){ s.ok++; s.times.push(1.5); if(s.times.length>10) s.times.shift(); sessionOk++; streak++; goalProgress(); }
    else { s.miss++; streak=0; }
    store.days[new Date().toISOString().slice(0,10)]=1; save();
    el('stStreak').textContent=streak; el('stSession').textContent=sessionOk;
    el('detectedLine').innerHTML = `Runda klar: <b>${prog.hits}/${prog.chords.length}</b> ackord i tid${ratio>=0.8?' – snyggt, höj tempot':' – sänk tempot 10 bpm'}`;
    prog.idx=0; prog.hits=0; prog.hitMap={};
    renderChips();
  }
  justHit=false;
  progShow();
}
function stopProg(){ if(prog){ clearInterval(prog.timer); prog=null; } }

/* ============================================================
   Fingerspel: note-by-note pieces with fingering for both hands
   notes: {t (beats), d (beats), m (midi), f (finger 1-5), hand 'R'|'L'}
   ============================================================ */
function N(hand,bar,bpb,list){ // list of [pos,d,midi,finger]
  return list.map(([pos,d,m,f])=>({t:bar*bpb+pos,d,m,f,hand}));
}
function furElise(){
  const B=3, R=(bar,l)=>N('R',bar,B,l), L=(bar,l)=>N('L',bar,B,l);
  const run=bar=>R(bar,[[0,.5,76,4],[.5,.5,75,3],[1,.5,76,4],[1.5,.5,71,1],[2,.5,74,3],[2.5,.5,72,2]]);
  const barA=bar=>[...R(bar,[[0,1,69,1],[1.5,.5,60,1],[2,.5,64,2],[2.5,.5,69,3]]),...L(bar,[[0,.5,45,5],[.5,.5,52,2],[1,.5,57,1]])];
  const barB=bar=>[...R(bar,[[0,1,71,4],[1.5,.5,64,1],[2,.5,68,2],[2.5,.5,71,3]]),...L(bar,[[0,.5,40,5],[.5,.5,52,2],[1,.5,56,1]])];
  const barB2=bar=>[...R(bar,[[0,1,71,4],[1.5,.5,64,1],[2,.5,72,3],[2.5,.5,71,2]]),...L(bar,[[0,.5,40,5],[.5,.5,52,2],[1,.5,56,1]])];
  const barC=bar=>[...R(bar,[[0,1,72,4],[1.5,.5,64,1],[2,.5,76,5],[2.5,.5,75,4]]),...L(bar,[[0,.5,45,5],[.5,.5,52,2],[1,.5,57,1]])];
  return [
    ...R(0,[[2,.5,76,4],[2.5,.5,75,3]]),
    ...run(1),...barA(2),...barB(3),...barC(4),...run(5),...barA(6),...barB2(7),
    ...R(8,[[0,1,69,1],[1.5,.5,71,2],[2,.5,72,3],[2.5,.5,74,4]]),...L(8,[[0,.5,45,5],[.5,.5,52,2],[1,.5,57,1]]),
    ...R(9,[[0,1,76,5],[1.5,.5,67,1],[2,.5,77,4],[2.5,.5,76,3]]),...L(9,[[0,.5,48,5],[.5,.5,55,2],[1,.5,60,1]]),
    ...R(10,[[0,1,74,4],[1.5,.5,65,1],[2,.5,76,3],[2.5,.5,74,2]]),...L(10,[[0,.5,43,5],[.5,.5,55,2],[1,.5,59,1]]),
    ...R(11,[[0,1,72,3],[1.5,.5,64,1],[2,.5,74,3],[2.5,.5,72,2]]),...L(11,[[0,.5,45,5],[.5,.5,52,2],[1,.5,57,1]]),
    ...R(12,[[0,1,71,1],[1.5,.5,64,1],[2,.5,76,5],[2.5,.5,75,4]]),...L(12,[[0,.5,40,5],[.5,.5,52,2],[1,.5,64,1]]),
    ...run(13),...barA(14),...barB2(15),
    ...R(16,[[0,2,69,1]]),...L(16,[[0,.5,45,5],[.5,.5,52,2],[1,1,57,1]]),
  ];
}
function odeToJoy(){
  const B=4, R=(bar,l)=>N('R',bar,B,l), L=(bar,l)=>N('L',bar,B,l);
  const q=(bar,seq)=>R(bar,seq.map(([m,f],i)=>[i,1,m,f]));
  return [
    ...q(0,[[64,3],[64,3],[65,4],[67,5]]),...L(0,[[0,4,48,5]]),
    ...q(1,[[67,5],[65,4],[64,3],[62,2]]),...L(1,[[0,4,43,5]]),
    ...q(2,[[60,1],[60,1],[62,2],[64,3]]),...L(2,[[0,4,48,5]]),
    ...R(3,[[0,1.5,64,3],[1.5,.5,62,2],[2,2,62,2]]),...L(3,[[0,4,43,5]]),
    ...q(4,[[64,3],[64,3],[65,4],[67,5]]),...L(4,[[0,4,48,5]]),
    ...q(5,[[67,5],[65,4],[64,3],[62,2]]),...L(5,[[0,4,43,5]]),
    ...q(6,[[60,1],[60,1],[62,2],[64,3]]),...L(6,[[0,4,48,5]]),
    ...R(7,[[0,1.5,62,2],[1.5,.5,60,1],[2,2,60,1]]),...L(7,[[0,2,43,5],[2,2,48,5]]),
  ];
}
function twinkle(){
  const B=4, R=(bar,l)=>N('R',bar,B,l), L=(bar,l)=>N('L',bar,B,l);
  const A=b=>[...R(b,[[0,1,60,1],[1,1,60,1],[2,1,67,4],[3,1,67,4]]),...L(b,[[0,4,48,5]]),
              ...R(b+1,[[0,1,69,5],[1,1,69,5],[2,2,67,4]]),...L(b+1,[[0,2,53,3],[2,2,48,5]]),
              ...R(b+2,[[0,1,65,3],[1,1,65,3],[2,1,64,2],[3,1,64,2]]),...L(b+2,[[0,2,53,3],[2,2,48,5]]),
              ...R(b+3,[[0,1,62,1],[1,1,62,1],[2,2,60,1]]),...L(b+3,[[0,2,55,1],[2,2,48,5]])];
  const Bp=b=>[...R(b,[[0,1,67,4],[1,1,67,4],[2,1,65,3],[3,1,65,3]]),...L(b,[[0,2,48,5],[2,2,53,3]]),
               ...R(b+1,[[0,1,64,2],[1,1,64,2],[2,2,62,1]]),...L(b+1,[[0,2,48,5],[2,2,55,1]])];
  return [...A(0),...Bp(4),...Bp(6),...A(8)];
}
function happyBirthday(){
  const B=3, R=(bar,l)=>N('R',bar,B,l), L=(bar,l)=>N('L',bar,B,l);
  return [
    ...R(0,[[2,.75,67,1],[2.75,.25,67,1]]),
    ...R(1,[[0,1,69,2],[1,1,67,1],[2,1,72,5]]),...L(1,[[0,3,48,5]]),
    ...R(2,[[0,2,71,4],[2,.75,67,1],[2.75,.25,67,1]]),...L(2,[[0,3,43,5]]),
    ...R(3,[[0,1,69,2],[1,1,67,1],[2,1,74,5]]),...L(3,[[0,3,43,5]]),
    ...R(4,[[0,2,72,4],[2,.75,67,1],[2.75,.25,67,1]]),...L(4,[[0,3,48,5]]),
    ...R(5,[[0,1,79,5],[1,1,76,3],[2,1,72,1]]),...L(5,[[0,3,48,5]]),
    ...R(6,[[0,1,71,3],[1,1,69,2],[2,.75,77,5],[2.75,.25,77,5]]),...L(6,[[0,3,53,3]]),
    ...R(7,[[0,1,76,3],[1,1,72,1],[2,1,74,2]]),...L(7,[[0,1.5,48,5],[1.5,1.5,43,5]]),
    ...R(8,[[0,2,72,1]]),...L(8,[[0,3,48,5]]),
  ];
}
/* auto-fingering for a single-hand line: neighbours get neighbouring fingers, bigger leaps re-anchor the hand */
function autoFinger(notes, hand){
  const sorted=[...notes].sort((a,b)=>a.t-b.t||a.m-b.m); let f=hand==='R'?3:3, prevM=null;
  sorted.forEach(n=>{
    if(prevM===null){ f=hand==='R'?(n.m%12===0?1:2):(hand==='L'?5:3); }
    else {
      const d=n.m-prevM, dir=Math.sign(d), a=Math.abs(d);
      let step=a<=2?1:a<=4?2:a<=7?3:4;
      let nf=f+dir*step*(hand==='L'?-1:1);
      if(nf<1||nf>5){ nf = (dir>0) === (hand==='R') ? 1 : 5; } // hand shift: thumb under or 5 over
      f=nf;
    }
    n.f=f; prevM=n.m;
  });
}
function recordingToPiece(name){
  const ns=hum.notes.map(n=>({t:n.t,d:n.d,m:n.m+hum.oct,vel:n.vel}));
  const ms=ns.map(n=>n.m).sort((a,b)=>a-b);
  // split point: below C4 is left hand unless everything is low/high
  const split = ms[0]>=60 ? 0 : ms[ms.length-1]<60 ? 200 : 60;
  ns.forEach(n=>n.hand=n.m<split?'L':'R');
  autoFinger(ns.filter(n=>n.hand==='R'),'R'); autoFinger(ns.filter(n=>n.hand==='L'),'L');
  const end=Math.max(...ns.map(n=>n.t+n.d)); const bpb=4; const bars=Math.ceil(end/bpb);
  const sections=[]; for(let b=0;b<bars;b+=4) sections.push([`Takt ${b+1}–${Math.min(bars,b+4)}`,b*bpb,Math.min(end,(b+4)*bpb)]);
  return {id:'user-'+Date.now(), title:name, composer:'Egen inspelning', level:'Egen', meter:'4/4', bpb, bpm:hum.bpm, user:true, notesData:ns, sections,
          tip:'Fingersättningen är automatisk och bara ett förslag: byt gärna om något känns fel. Händerna delas vid C4.'};
}
function allPieces(){ return [...PIECES, ...(store.pieces||[]).map(p=>Object.assign({},p,{notes:()=>p.notesData.map(n=>Object.assign({},n))}))]; }
el('humSave').addEventListener('click',()=>{
  if(!hum.notes.length) return;
  const name=(el('humName').value||'').trim()||('Inspelning '+new Date().toLocaleDateString('sv-SE'));
  store.pieces ||= []; store.pieces.push(recordingToPiece(name)); save();
  el('humName').value=''; el('humState').textContent='sparad som stycke'; el('humState').className='chip done';
  renderPieces(); showView('songs'); openPiece(allPieces().find(p=>p.id===store.pieces[store.pieces.length-1].id));
});
const PIECES=[
  {id:'fur-elise', title:'Für Elise', composer:'L. van Beethoven', level:'Medel', meter:'3/8', bpb:3, bpm:72, notes:furElise,
   sections:[['Tema A',2,27],['Fras B',25.5,39],['Tema A igen',39,51]],
   tip:'Höger hand: fingrarna 4–3 på E–D♯ hela vägen, det är det som gör att det flyter. Vänster hand spelar tre toner och vilar – lägg in den först när höger sitter i tempo 60.'},
  {id:'ode', title:'Ode till glädjen', composer:'L. van Beethoven', level:'Lätt', meter:'4/4', bpb:4, bpm:84, notes:odeToJoy,
   sections:[['Fras 1',0,16],['Fras 2',16,32]],
   tip:'Hela melodin ligger inom fem toner: tummen på C och ett finger per tangent. Spela utan att flytta handen. Vänster hand håller bara C och G.'},
  {id:'twinkle', title:'Blinka lilla stjärna', composer:'Trad.', level:'Lätt', meter:'4/4', bpb:4, bpm:92, notes:twinkle,
   sections:[['A-delen',0,16],['B-delen',16,24],['A igen',32,48]],
   tip:'Hoppet C→G görs med tummen till fingret 4. Tummen flyttar en gång, på D i slutet av frasen. Vänster hand byter mellan C, F och G.'},
  {id:'hbd', title:'Ja må du leva (Happy Birthday)', composer:'Trad.', level:'Lätt', meter:'3/4', bpb:3, bpm:96, notes:happyBirthday,
   sections:[['Rad 1–2',2,12],['Rad 3–4',12,27]],
   tip:'Tredje raden hoppar upp en oktav till G5 – lillfingret. Förbered genom att lyfta handen under det långa C:t innan.'},
];
const piece={cur:null, all:[], notes:[], steps:[], idx:0, hand:'B', mode:'idle', hold:0, bpm:60, playing:null, range:[0,Infinity], done:0};
const pieceRoll=new PianoRoll(el('pieceRoll'),{editable:false, ppb:44, rowH:13, maxHeight:280, onTap:n=>PianoAudio.play(n.m,{dur:.6}), onKey:m=>PianoAudio.play(m,{dur:.6})});

function renderPieces(){
  const box=el('pieceList'); box.innerHTML='';
  allPieces().forEach(p=>{
    const s=store.stats['piece:'+p.id];
    const d=document.createElement('div'); d.className='piece'; d.setAttribute('role','button'); d.tabIndex=0;
    d.innerHTML=`<div class="t"><b>${p.title}</b><small>${p.composer} · ${p.meter} · ${s?s.ok+' sektioner klarade':'inte påbörjad'}</small></div><span class="lvl">${p.level}</span>${p.user?'<button class="small ghost del" aria-label="Ta bort">✕</button>':''}`;
    const go=()=>openPiece(p); d.addEventListener('click',e=>{ if(e.target.closest('.del')) return; go(); }); d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();go();} });
    const del=d.querySelector('.del'); if(del) del.addEventListener('click',()=>{ store.pieces=(store.pieces||[]).filter(x=>x.id!==p.id); save(); renderPieces(); });
    box.appendChild(d);
  });
}
function openPiece(p){
  stopPiece();
  piece.cur=p; piece.all=p.notes().map((n,i)=>Object.assign({id:i+1},n)); piece.bpm=p.bpm; piece.range=[0,Infinity]; piece.hand='B';
  el('handSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.hand==='B'));
  el('pieceBpm').value=p.bpm; el('pieceBpmV').textContent=p.bpm+' bpm';
  el('pieceTitle').textContent=p.title; el('pieceSub').textContent=`${p.composer} · ${p.meter} · ${p.level}`; el('pieceTip').textContent=p.tip;
  pieceRoll.opts.beatsPerBar=p.bpb; pieceRoll.setNotes(piece.all); pieceRoll.scrollToStart();
  const sec=el('pieceSections'); sec.innerHTML='';
  const all=document.createElement('span'); all.className='chip now'; all.textContent='Hela stycket'; all.addEventListener('click',()=>setRange(0,Infinity,all)); sec.appendChild(all);
  p.sections.forEach(([name,from,to])=>{ const c=document.createElement('span'); c.className='chip'; c.textContent=name; c.addEventListener('click',()=>setRange(from,to,c)); sec.appendChild(c); });
  el('pieceCard').hidden=false; el('piecesIntro').hidden=true; el('pieceList').hidden=true;
  buildSteps(); piece.idx=0; piece.mode='idle'; showStep();
  el('pieceCard').scrollIntoView({block:'start',behavior:'smooth'});
}
function setRange(from,to,chip){
  piece.range=[from,to]; el('pieceSections').querySelectorAll('.chip').forEach(c=>c.classList.toggle('now',c===chip));
  stopPiece(); buildSteps(); piece.idx=0; showStep();
}
function pieceNotes(){ return piece.all.filter(n=>(piece.hand==='B'||n.hand===piece.hand) && n.t>=piece.range[0]-0.01 && n.t<piece.range[1]-0.01); }
function buildSteps(){
  const ns=[...pieceNotes()].sort((a,b)=>a.t-b.t||a.m-b.m); const steps=[];
  ns.forEach(n=>{ const last=steps[steps.length-1]; if(last&&Math.abs(last.t-n.t)<0.01) last.notes.push(n); else steps.push({t:n.t,notes:[n]}); });
  piece.steps=steps; piece.notes=ns;
}
function showStep(){
  const st=piece.steps[piece.idx]; if(!st){ el('pieceStep').textContent='–'; return; }
  pieceRoll.setPlayhead(st.t);
  drawPiano(el('pianoPiece'), st.notes, liveNotes);
  const rh=st.notes.filter(n=>n.hand==='R'), lh=st.notes.filter(n=>n.hand==='L');
  const fmt=ns=>ns.map(n=>`${noteLabel(n.m)}<sup>${n.f}</sup>`).join(' ');
  el('pieceStep').innerHTML=`${fmt(rh)}${rh.length&&lh.length?' <small style="display:inline;font-size:.4em">·</small> ':''}${lh.length?`<span style="color:var(--key-lh)">${fmt(lh)}</span>`:''}<small>steg ${piece.idx+1}/${piece.steps.length} · takt ${Math.floor(st.t/piece.cur.bpb)+1}</small>`;
  el('pieceHold').style.width='0';
  el('pieceDetect').innerHTML = piece.mode==='wait' ? (listening||midiOn ? 'Spela tangenterna…' : 'Starta <b>Lyssna</b> eller <b>MIDI</b> uppe till höger') : piece.mode==='play' ? 'Spelar upp' : 'Tryck <b>Vänta på mig</b> för att öva, eller <b>Spela upp</b> för att höra';
}
function stepMatches(st){
  if(midiOn) return st.notes.every(n=>held.has(n.m)) && held.size<=st.notes.length+1;
  return st.notes.every(n=>liveNotes.some(m=>m%12===n.m%12)) && liveNotes.length>0;
}
function pieceTick(){
  if(!el('view-songs').classList.contains('active')||piece.mode!=='wait') return;
  const st=piece.steps[piece.idx]; if(!st) return;
  drawPiano(el('pianoPiece'), st.notes, liveNotes);
  const ok=stepMatches(st);
  piece.hold = ok?piece.hold+16:Math.max(0,piece.hold-32);
  el('pieceHold').style.width=Math.min(100,piece.hold/200*100)+'%';
  if(piece.hold>=200){
    piece.hold=0; piece.idx++;
    if(piece.idx>=piece.steps.length){
      piece.idx=0; piece.done++;
      const s=stat('piece:'+piece.cur.id); s.tries++; s.ok++; store.days[new Date().toISOString().slice(0,10)]=1; save();
      el('pieceCard').classList.remove('flash'); void el('pieceCard').offsetWidth; el('pieceCard').classList.add('flash');
    }
    showStep();
  }
}
async function startWait(){
  if(!listening&&!midiOn){ await toggleMic(); if(!listening) return; }
  stopPiece(); piece.mode='wait'; piece.hold=0; el('pieceWait').textContent='■ Avbryt'; showStep();
}
function startPlay(){
  stopPiece(); piece.mode='play'; el('pieceStop').hidden=false; el('piecePlay').hidden=true;
  const ns=pieceNotes(); const from=piece.range[0]===0?0:piece.range[0];
  const shifted=ns.map(n=>Object.assign({},n,{t:n.t-from}));
  const bm=60/piece.bpm, start=PianoAudio.now+0.1;
  PianoAudio.init();
  shifted.forEach(n=>PianoAudio.play(n.m,{dur:n.d*bm*0.95, when:0.1+n.t*bm, vel:n.hand==='L'?0.55:0.8}));
  const end=Math.max(...shifted.map(n=>n.t+n.d));
  const job={stop:false}; piece.playing=job;
  (function frame(){
    if(job.stop) return;
    const b=(PianoAudio.now-start)/bm;
    pieceRoll.setPlayhead(b+from);
    const active=shifted.filter(n=>b>=n.t&&b<n.t+n.d);
    drawPiano(el('pianoPiece'), active, []);
    const i=piece.steps.findIndex(s=>s.t>b+from); piece.idx=Math.max(0,(i<0?piece.steps.length:i)-1);
    if(b<end+0.3) requestAnimationFrame(frame); else { piece.playing=null; piece.mode='idle'; piece.idx=0; el('pieceStop').hidden=true; el('piecePlay').hidden=false; showStep(); }
  })();
}
function stopPiece(){
  if(piece.playing){ piece.playing.stop=true; piece.playing=null; PianoAudio.stopAll(); }
  piece.mode='idle'; el('pieceStop').hidden=true; el('piecePlay').hidden=false; el('pieceWait').textContent='Vänta på mig';
  pieceRoll.setPlayhead(-1,false);
}
el('pieceWait').addEventListener('click',()=>{ if(piece.mode==='wait'){ stopPiece(); showStep(); } else startWait(); });
el('piecePlay').addEventListener('click',startPlay);
el('pieceStop').addEventListener('click',()=>{ stopPiece(); showStep(); });
el('pieceNext').addEventListener('click',()=>{ if(piece.mode==='play') return; const st=piece.steps[piece.idx]; if(st) PianoAudio.chord(st.notes.map(n=>n.m),{dur:.7,strum:0}); piece.idx=(piece.idx+1)%piece.steps.length; piece.hold=0; showStep(); });
el('pieceClose').addEventListener('click',()=>{ stopPiece(); el('pieceCard').hidden=true; el('piecesIntro').hidden=false; el('pieceList').hidden=false; renderPieces(); });
el('pieceBpm').addEventListener('input',e=>{ piece.bpm=+e.target.value; el('pieceBpmV').textContent=piece.bpm+' bpm'; });
el('handSeg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ piece.hand=b.dataset.hand; el('handSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); const wasWait=piece.mode==='wait'; stopPiece(); buildSteps(); piece.idx=0; if(wasWait) startWait(); else showStep(); }));
el('songMode').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ el('songMode').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); const m=b.dataset.mode; el('piecesPane').hidden=m!=='pieces'; el('chordsPane').hidden=m!=='chords'; el('coursesPane').hidden=m!=='courses'; if(m!=='pieces') stopPiece(); if(m==='courses') renderCourses(); }));

/* ============================================================
   Courses: step-by-step tutorials whose exercises run in the drill engine
   and are verified by the chord/note detector. A step is done when its goal is met.
   exercise: {kind:'note'|'chord'|'prog', items, goal (hits or rounds), strictBass, bpm}
   ============================================================ */
const COURSES=[
 {id:'rosen-10', title:'10 minuter som sparar 30 år', source:'Efter Steve Rosens metod (Pro Piano Series)', level:'Nybörjare',
  intro:'Idén: spela från ackord, inte från noter. Lär dig formerna i handen, siffrorna i huvudet och de närmaste omvändningarna – då kan du spela nästan vilken poplåt som helst utan notblad. Varje steg har en övning som appen kontrollerar via mikrofon eller MIDI.',
  steps:[
   {title:'Tangentkartan', text:'Allt bygger på att du hittar rätt tangent utan att titta för länge. C ligger till vänster om två svarta, F till vänster om tre svarta. Säg tonnamnet högt när du trycker.',
    bullets:['Hitta alla C på pianot, sedan alla F.','Fyll i de vita mellan: C D E F G A B.','Gör samma sak med stängda ögon tills du träffar rätt.'],
    goal:'Spela 14 toner i rad rätt (appen slumpar).', ex:{kind:'note',items:['C','D','E','F','G','A','B'],goal:14}},
   {title:'Ackordformerna i dur', text:'Ett durackord är alltid: grundton, hoppa en, ters, hoppa en, kvint. Men handen känner tre former beroende på vilka tangenter som är svarta. Lär dig formerna, inte tonnamnen.',
    bullets:['Form 1 – alla vita: C, F, G.','Form 2 – svart i mitten: D, E, A.','Form 3 – vit, svart, svart: B. (Svarta grundtoner: Db Eb Ab har vit i mitten, F#/Gb har svart–svart–svart.)','Spela varje form tre gånger och känn hur den sitter i handen.'],
    goal:'14 rätt ackord, fördelade på alla sju.', ex:{kind:'chord',items:['C','F','G','D','E','A','B'],goal:14}},
   {title:'Ackordformerna i moll', text:'Moll = sänk mittentonen ett halvt steg. Formerna skiftar: Dm Em Am blir helt vita, Cm Fm Gm får svart i mitten.',
    bullets:['Alla vita: Dm, Em, Am.','Svart i mitten: Cm, Fm, Gm.','Vit–vit–svart: Bm.','Växla dur → moll på samma grundton: C → Cm, E → Em. Bara ett finger rör sig.'],
    goal:'14 rätt mollackord.', ex:{kind:'chord',items:['Dm','Em','Am','Cm','Fm','Gm','Bm'],goal:14}},
   {title:'Sus-ackord: spänning och släpp', text:'Byt ut tersen mot kvarten (sus4) eller sekunden (sus2). Ackordet "håller andan" tills du släpper tillbaka tersen. Det här är det enklaste sättet att låta proffsig.',
    bullets:['Spela Csus4 → C. Lyssna på släppet.','Gsus4 → G, Dsus4 → D.','Asus2 → A: luftigare, modernare.','Använd sus på det sista ackordet i varje fras.'],
    goal:'12 rätt, både sus och upplösning.', ex:{kind:'chord',items:['Csus4','C','Gsus4','G','Dsus4','D','Asus2','A','Fsus2','F'],goal:12}},
   {title:'Siffersystemet', text:'I varje durtonart är ackorden på stegen 1, 4, 5 dur och 2, 3, 6 moll. Tänk siffror i stället för namn så kan du spela samma låt i vilken tonart som helst.',
    bullets:['I C-dur: 1=C 2=Dm 3=Em 4=F 5=G 6=Am.','I G-dur: 1=G 2=Am 3=Bm 4=C 5=D 6=Em.','Säg siffran högt när du spelar ackordet.','Öppna Teori → Siffror för att se alla tonarter.'],
    goal:'Spela 1–4–5–1 i C och i G till metronom, en runda vardera.', ex:{kind:'prog',items:['C F G C','G C D G'],goal:2,bpm:60}},
   {title:'"Big Four" – rundan bakom hundratals låtar', text:'1–5–6–4. I C: C G Am F. Det här är låten du redan kan: en stor del av all pop, rock och lovsång går på exakt den här rundan eller en rotation av den.',
    bullets:['Spela C G Am F i grundläge, fyra slag per ackord.','Flytta till G-dur: G D Em C. Samma siffror.','Starta på 6:an: Am F C G – samma ackord, mörkare känsla.'],
    goal:'Tre rundor i tid, valfria tonarter.', ex:{kind:'prog',items:['C G Am F','G D Em C','Am F C G'],goal:3,bpm:66}},
   {title:'Basomvändningar: slash-ackord', text:'Vänster hand bestämmer vad ackordet "är". C med E i basen (C/E) är samma tre toner men låter som ett steg på väg någonstans. Så får du en basgång utan att byta ackord.',
    bullets:['C → C/E → F: basen går C E F stegvis.','G/B mellan C och Am: basen går C B A.','Spela högerhanden stilla och flytta bara basen.'],
    goal:'10 rätt – appen kräver rätt baston.', ex:{kind:'chord',items:['C/E','G/B','F/A','Am/C','D/F#','C/G'],goal:10,strictBass:true}},
   {title:'Omvändningar i höger hand', text:'Ta nedersta tonen och lägg den en oktav upp: första omvändningen. Gör om det: andra. Samma ackord, tre lägen på klaviaturen.',
    bullets:['C: C-E-G → E-G-C → G-C-E.','F: F-A-C → A-C-F → C-F-A.','G: G-B-D → B-D-G → D-G-B.','Spela alla tre lägena av varje ackord uppåt och nedåt.'],
    goal:'12 rätt omvändningar.', ex:{kind:'chord',items:['C/E','C/G','F/A','F/C','G/B','G/D','Am/C','Am/E'],goal:12,strictBass:true}},
   {title:'Närmaste omvändning', text:'Det stora tricket: byt alltid till det läge av nästa ackord som ligger närmast. Då rör sig handen knappt, och allt låter sammanhängande. C → G/B → Am/C → F/C: ingen ton flyttar mer än ett steg.',
    bullets:['Spela C (C-E-G). Nästa är G: närmaste läge är B-D-G (G/B).','Sedan Am: C-E-A (Am/C). Sedan F: C-F-A (F/C).','Jämför med grundlägena – hör skillnaden.'],
    goal:'Två rundor med rätt omvändningar, till metronom.', ex:{kind:'prog',items:['C G/B Am/C F/C','G D/F# Em/G C/G'],goal:2,bpm:56,strictBass:true}},
   {title:'Vänsterhandsmönster', text:'Högerhanden håller ackordet, vänsterhanden ger rörelse. Tre mönster räcker länge: grundton–kvint–oktav, grundton–oktav växelvis, och en jämn puls i åttondelar på grundtonen.',
    bullets:['Mönster A: ton 1, 5, 8 (C G C) som fjärdedelar.','Mönster B: 1 – 8 – 5 – 8 (C C G C).','Mönster C: åttondelar på grundtonen, byt på ettan.','Högerhanden byter ackord med närmaste omvändning samtidigt.'],
    goal:'Tre rundor Big Four till metronom med valfritt mönster i vänster.', ex:{kind:'prog',items:['C G/B Am/C F/C'],goal:3,bpm:60,strictBass:false}},
   {title:'Block, brutet, fram och tillbaka', text:'Samma treklang, tre sätt att spela den: alla toner samtidigt (block), en i taget uppåt (brutet), eller upp och ner (fram och tillbaka). Det är skillnaden mellan ackompanjemang och "spela piano".',
    bullets:['Block: tre toner på ettan, håll.','Brutet: ton 1 2 3 som åttondelar, vila.','Fram och tillbaka: 1 2 3 2 1 2 3 2 över hela takten.','Blanda: block på ettan, brutet på tre.'],
    goal:'Tre rundor Big Four i valfritt mönster.', ex:{kind:'prog',items:['C G Am F'],goal:3,bpm:60}},
   {title:'Spela en riktig låt från schema', text:'Nu har du allt: former, siffror, närmaste omvändning och ett vänsterhandsmönster. Ta ett ackordschema och spela. Doomsday-reprisen i F♯-moll är ett bra test: fyra ackord, lågt tempo, mycket känsla.',
    bullets:['Hitta formerna för F♯m, D, Bm, E, A.','Välj närmaste omvändningar så handen stannar kvar.','Bas i vänster, sus4 på sista ackordet i varje fras.'],
    goal:'Två rundor av refrängen till metronom.', ex:{kind:'prog',items:['F#m D Bm F#m D Bm F#m F#m'],goal:2,bpm:62}},
  ]},
];
const course={cur:null, step:null, goal:null};
function courseState(id){ return (store.courses ||= {})[id] ||= {done:{}}; }
function renderCourses(){
  const box=el('courseList'); box.innerHTML='';
  COURSES.forEach(c=>{
    const st=courseState(c.id); const done=Object.keys(st.done).length;
    const d=document.createElement('div'); d.className='course'; d.setAttribute('role','button'); d.tabIndex=0;
    d.innerHTML=`<div class="t"><b>${c.title}</b><small>${c.source} · ${c.steps.length} steg · ${done}/${c.steps.length} klara</small><div class="bar"><i style="width:${done/c.steps.length*100}%"></i></div></div><span class="lvl">${c.level}</span>`;
    const go=()=>openCourse(c); d.addEventListener('click',go); d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();go();} });
    box.appendChild(d);
  });
}
function openCourse(c){
  course.cur=c; el('courseTitle').textContent=c.title; el('courseSub').textContent=c.intro;
  el('courseCard').hidden=false; el('courseList').hidden=true;
  renderCourseSteps();
}
function renderCourseSteps(){
  const c=course.cur, st=courseState(c.id); const box=el('courseSteps'); box.innerHTML='';
  const done=Object.keys(st.done).length; el('courseBar').style.width=(done/c.steps.length*100)+'%';
  const next=c.steps.findIndex((s,i)=>!st.done[i]);
  c.steps.forEach((s,i)=>{
    const d=document.createElement('details'); d.className='step'+(st.done[i]?' done':'')+(i===next?' next':''); if(i===next) d.open=true;
    d.innerHTML=`<summary><span class="n">${st.done[i]?'✓':i+1}</span><span>${s.title}</span></summary>
      <div class="body"><p>${s.text}</p><ul>${s.bullets.map(b=>`<li>${b}</li>`).join('')}</ul><p class="goal"><b>Mål:</b> ${s.goal}</p>
      <div class="row"><button class="primary small ex">Öva nu</button><button class="small ghost mark">${st.done[i]?'Markera ej klar':'Markera klar'}</button></div></div>`;
    d.querySelector('.ex').addEventListener('click',()=>startExercise(i));
    d.querySelector('.mark').addEventListener('click',()=>{ if(st.done[i]) delete st.done[i]; else st.done[i]=Date.now(); save(); renderCourseSteps(); });
    box.appendChild(d);
  });
}
function startExercise(i){
  const c=course.cur, s=c.steps[i], ex=s.ex;
  course.step=i; course.goal={n:ex.goal,count:0};
  stopProg();
  const lvl={id:'course:'+c.id+':'+i, name:`${c.title} · steg ${i+1}`, kind:ex.kind, items:ex.items, tip:s.text, strictBass:!!ex.strictBass};
  level=lvl; sel.value='__course__'; el('drillLevelName').textContent=lvl.name; el('levelTip').textContent=s.goal;
  target=null; sessionOk=0; el('stSession').textContent=0;
  el('goalBanner').hidden=true;
  showView('train');
  if(ex.kind==='prog') startProg(ex.items[0].split(' '), ex.bpm||70, lvl.id, !!ex.strictBass); else setTarget(pickItem());
  if(ex.kind==='prog'&&ex.items.length>1){ // show the other progressions as chips to switch between
    const box=el('levelChips'); box.innerHTML=''; ex.items.forEach(it=>{ const d=document.createElement('span'); d.className='chip'+(it===ex.items[0]?' now':''); d.textContent=it.replace(/#/g,'♯'); d.addEventListener('click',()=>{ box.querySelectorAll('.chip').forEach(x=>x.classList.toggle('now',x===d)); startProg(it.split(' '),ex.bpm||70,lvl.id,!!ex.strictBass); }); box.appendChild(d); });
  }
  el('drillCard').scrollIntoView({block:'start',behavior:'smooth'});
}
function goalProgress(){
  if(!course.goal) return;
  course.goal.count++;
  const g=course.goal, left=g.n-g.count;
  el('levelTip').textContent = left>0 ? `${g.count}/${g.n} – ${left} kvar` : 'Klart!';
  if(g.count>=g.n){
    const st=courseState(course.cur.id); st.done[course.step]=Date.now(); save();
    el('goalText').textContent=`${course.cur.steps[course.step].title} är avklarat.`;
    el('goalBanner').hidden=false; course.goal=null;
  }
}
el('goalBack').addEventListener('click',()=>{ stopProg(); el('goalBanner').hidden=true; showView('songs'); el('songMode').querySelector('[data-mode=courses]').click(); openCourse(course.cur); });
el('courseClose').addEventListener('click',()=>{ el('courseCard').hidden=true; el('courseList').hidden=false; renderCourses(); });

/* ============================================================
   UI wiring
   ============================================================ */
el('playBtn').addEventListener('click',()=>{ if(target) playNotes(target.midis); });
el('skipBtn').addEventListener('click',skip);
el('manualBtn').addEventListener('click',()=>{ if(target&&!justHit) hit(true); });

const strip=el('levelStrip');
LEVELS.forEach((l,i)=>{ const b=document.createElement('button'); b.className='pill'; b.dataset.id=l.id; b.setAttribute('role','tab'); b.textContent=(i+1)+' · '+l.name.replace(/^Steg \d · /,''); b.addEventListener('click',()=>setLevel(l.id)); strip.appendChild(b); });
const sel={ set value(v){ strip.querySelectorAll('.pill').forEach(b=>b.classList.toggle('on',b.dataset.id===v)); const on=strip.querySelector('.pill.on'); if(on) on.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'}); }, get value(){ return level.id; } };
function setLevel(id){
  course.goal=null; el('goalBanner').hidden=true;
  level=LEVELS.find(l=>l.id===id); store.level=id; save();
  sel.value=id; el('drillLevelName').textContent=level.name; el('levelTip').textContent=level.tip;
  target=null; setTarget(pickItem());
}

function renderLevels(){
  const box=el('levels'); box.innerHTML='';
  LEVELS.forEach((l,i)=>{
    const p=levelProgress(l);
    const d=document.createElement('div'); d.className='level'; d.setAttribute('tabindex','0'); d.setAttribute('role','button');
    d.innerHTML=`<span class="n">${i+1}</span><div class="t"><b>${l.name.replace(/^Steg \d · /,'')}</b><small>${l.items.length} ${l.kind==='prog'?'progressioner':l.kind==='note'?'toner':'ackord'} · ${Math.round(p*100)} % bemästrat</small><div class="bar"><i style="width:${p*100}%"></i></div></div><span class="arrow">›</span>`;
    const go=()=>{ setLevel(l.id); el('planDetails').open=false; el('drillCard').scrollIntoView({block:'start',behavior:'smooth'}); };
    d.addEventListener('click',go); d.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();go();} });
    box.appendChild(d);
  });
}
function renderSongs(){
  const box=el('songList'); box.innerHTML='';
  SONGS.forEach((s,i)=>{
    const d=document.createElement('div'); d.className='song';
    d.innerHTML=`<h3>${s.title}</h3><div class="meta">${s.meta}</div><div class="seq">${s.chords.split(' ').map(c=>`<span>${c.replace('#','♯')}</span>`).join('')}</div><p style="margin:0;font-size:.9rem">${s.tip}</p><div class="row"><button class="primary">Träna med metronom</button><button class="ghost">▶ Lyssna</button></div>`;
    const [train,listen]=d.querySelectorAll('button');
    train.addEventListener('click',()=>{ level=LEVELS.find(l=>l.id==='prog'); sel.value='prog'; el('drillLevelName').textContent=s.title; el('levelTip').textContent=s.tip; el('levelChips').innerHTML=''; startProg(s.chords.split(' '), s.bpm, 'song:'+s.title); showView('train'); });
    listen.addEventListener('click',()=>playSequence(s.chords.split(' '),s.bpm));
    box.appendChild(d);
  });
}
/* ---------- Theory view ---------- */
const theory={key:0,minor:false};
const keyStrip=el('keyStrip');
NOTE_NAMES.forEach((n,i)=>{ const b=document.createElement('button'); b.className='pill'+(i===0?' on':''); b.setAttribute('role','tab'); b.textContent=i===0?'C':`${n.replace('#','♯')}${FLAT_MAJOR_KEYS.has(i)&&n.includes('#')?'/'+FLAT_NAMES[i].replace('b','♭'):''}`; b.addEventListener('click',()=>{ theory.key=i; keyStrip.querySelectorAll('.pill').forEach((x,k)=>x.classList.toggle('on',k===i)); renderTheory(); }); keyStrip.appendChild(b); });
el('modeSeg').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ theory.minor=b.dataset.minor==='1'; el('modeSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); renderTheory(); }));
function theoryKey(){ return {key:theory.key, minor:theory.minor}; }
function renderTheory(){
  const {key,minor}=theoryKey();
  const scale=minor?MINOR_SCALE:MAJOR_SCALE, qual=minor?MINOR_QUAL:MAJOR_QUAL;
  const func=minor?['tonika','subdom.','tonika','subdom.','dominant','subdom.','dominant']:['tonika','subdom.','tonika','subdom.','dominant','tonika','dominant'];
  const tbl=el('degtable'); tbl.innerHTML='';
  scale.forEach((s,i)=>{
    const name=NOTE_NAMES[(key+s)%12]+qual[i]; const fl=useFlats(key,minor);
    const rn = qual[i]==='dim'?ROMAN[i].toLowerCase()+'°':qual[i]==='m'?ROMAN[i].toLowerCase():ROMAN[i];
    const d=document.createElement('button'); d.className='deg'; d.dataset.chord=name;
    d.innerHTML=`<span class="rn">${rn}</span><span class="num">${i+1}</span><b>${dn(name,fl)}</b><small>${func[i]}</small>`;
    tbl.appendChild(d);
  });
  const list=el('progList'); list.innerHTML='';
  PROGRESSIONS.forEach(p=>{
    // progressions are written with explicit roman-numeral case, so each one carries its own mode
    const useMinor = !!p.minor; const fl=useFlats(key,useMinor);
    const chords=degreesToChords(p.nums,key,useMinor);
    const keyName=dn(NOTE_NAMES[key],fl)+(useMinor?'-moll':'-dur');
    const d=document.createElement('div'); d.className='prog';
    d.innerHTML=`<div class="prog-head"><b>${p.name}</b><span class="mono">${p.nums} · ${keyName}</span></div><div class="seq">${chords.map(c=>`<span class="play" data-chord="${c}">${dn(c,fl)}</span>`).join('')}</div><p>${p.desc}</p><div class="row"><button class="primary small">Träna</button><button class="ghost small">▶ Lyssna</button></div>`;
    const [train,listen]=d.querySelectorAll('button');
    train.addEventListener('click',()=>trainProgression(chords,p.name+' i '+keyName,p.desc));
    listen.addEventListener('click',()=>playSequence(chords,80));
    list.appendChild(d);
  });
  renderCustom();
}
function renderCustom(){
  const {key,minor}=theoryKey();
  const chords=degreesToChords(el('customProg').value,key,minor); const fl=useFlats(key,minor);
  el('customPreview').innerHTML = chords?chords.map(c=>`<span class="play" data-chord="${c}">${dn(c,fl)}</span>`).join(''):'<span style="color:var(--bad);border:0">Kunde inte tolka – använd 1–7 eller I–VII</span>';
  el('customBtn').disabled=!chords;
}
function trainProgression(chords,title,tip){
  level=LEVELS.find(l=>l.id==='prog'); sel.value='prog';
  el('drillLevelName').textContent=title; el('levelTip').textContent=tip; el('levelChips').innerHTML='';
  startProg(chords,70,'prog:'+chords.join(' '));
  showView('train');
}
async function playSequence(chords,bpm){
  await PianoAudio.init();
  const bar=60/bpm*4;
  chords.forEach((c,i)=>{ const v=chordVoicing(parseChord(c)); PianoAudio.play(v[0]-12,{dur:bar*0.9,when:i*bar,vel:.6}); PianoAudio.chord(v,{dur:bar*0.9,when:i*bar}); });
}
el('customProg').addEventListener('input',renderCustom);
el('customBtn').addEventListener('click',()=>{ const {key,minor}=theoryKey(); const ch=degreesToChords(el('customProg').value,key,minor); if(ch) trainProgression(ch,'Egen: '+el('customProg').value,'Din egen progression i '+dn(NOTE_NAMES[key],useFlats(key,minor))+(minor?'-moll':'-dur')); });
// any element with data-chord: play it and show it on the drill piano
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-chord]'); if(!t) return;
  const c=parseChord(t.dataset.chord); if(!c) return;
  playNotes(chordVoicing(c));
  let pv=el('theoryPiano');
  if(!pv){ pv=document.createElementNS('http://www.w3.org/2000/svg','svg'); pv.id='theoryPiano'; pv.setAttribute('viewBox','0 0 700 150'); pv.setAttribute('class','piano'); }
  const host=t.closest('.dtext')||t.closest('.prog')||t.closest('.card'); host.appendChild(pv);
  drawPiano(pv,chordVoicing(c),[]);
  pv.insertAdjacentHTML('afterend','');
  let cap=host.querySelector('.pcap'); if(!cap){ cap=document.createElement('p'); cap.className='pcap'; host.appendChild(cap); }
  cap.innerHTML=`<b>${c.name.replace('#','♯')}</b> · ${fingeringText(c)}`;
});

function renderProgress(){
  const keys=Object.keys(store.stats);
  el('pTotal').textContent=keys.reduce((a,k)=>a+store.stats[k].ok,0);
  el('pMastered').textContent=keys.filter(k=>mastery(k)===2).length;
  el('pDays').textContent=Object.keys(store.days).length;
  const box=el('mastery'); box.innerHTML='';
  LEVELS.forEach(l=>l.items.forEach(i=>{
    const k=l.id+':'+i, m=mastery(k), s=store.stats[k];
    const d=document.createElement('div'); d.className='m'+m;
    const avg = s&&s.times.length?(s.times.reduce((a,b)=>a+b,0)/s.times.length).toFixed(1)+' s':'–';
    d.innerHTML=`${i.replace(/#/g,'♯')}<b>${s?s.ok+' rätt · '+avg:'ej tränat'}</b>`;
    box.appendChild(d);
  }));
}
el('resetBtn').addEventListener('click',()=>{ store={stats:{},days:{},level:level.id}; save(); renderProgress(); renderLevels(); renderChips(); });

// Live view
const chromaBox=el('chroma');
NOTE_NAMES.forEach(n=>{ const d=document.createElement('div'); d.dataset.n=n.replace('#','♯'); chromaBox.appendChild(d); });
function renderLive(){
  if(!el('view-listen').classList.contains('active')) return;
  const bars=chromaBox.children;
  for(let i=0;i<12;i++) bars[i].style.height=(smooth[i]*100)+'%';
  el('liveChord').textContent = detected?detected.name.replace('#','♯'):(listening?'–':'–');
  el('liveNotes').textContent = liveNotes.length?liveNotes.map(m=>NOTE_NAMES[m%12]+(Math.floor(m/12)-1)).join('  '):'';
  drawPiano(el('pianoLive'), [], liveNotes);
}

function showView(v){
  document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='view-'+v));
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  if(v==='progress') renderProgress(); if(v==='train') renderLevels(); if(v==='listen') renderLive(); if(v==='theory') renderTheory(); if(v==='songs'){ renderPieces(); renderCourses(); }
  if(v!=='songs') stopPiece();
  if(v!=='hum'&&hum.playing){ hum.playing.stop=true; hum.playing=null; el('humPlay').textContent='▶ Spela upp'; }
  if(v!=='train') stopProg();
  if(v==='train'&&!target) setTarget(pickItem());
}
document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));

// Keep screen awake while listening
let wakeLock=null;
document.addEventListener('visibilitychange',async()=>{ if(document.visibilityState==='visible'&&listening&&navigator.wakeLock){ try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){} } });
micBtn.addEventListener('click',async()=>{ if(listening&&navigator.wakeLock){ try{wakeLock=await navigator.wakeLock.request('screen');}catch(e){} } });

// PWA: service worker + install prompt
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{})); }
let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); installEvt=e; el('installCard').hidden=false; });
el('installBtn').addEventListener('click',async()=>{ if(!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt=null; el('installCard').hidden=true; });
window.addEventListener('appinstalled',()=>{ el('installCard').hidden=true; });
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent), standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(isIOS&&!standalone) el('iosHint').hidden=false;

// Boot
drawPiano(el('pianoLive')); drawPiano(el('pianoHum')); drawPiano(el('pianoPiece'));
renderSongs(); renderLevels(); renderPieces();
// warm up the sampler on the first touch anywhere (audio must start from a gesture)
document.addEventListener('pointerdown',()=>PianoAudio.init(),{once:true});
setLevel(level.id);
