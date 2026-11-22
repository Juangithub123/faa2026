// Parser MIDI mínimo (SMF tipo 0 y 1) + detección de partes + generación de niveles.
// Sin dependencias. Funciona en navegador y en node.
(function (root) {
  'use strict';

  // ---------- PARSER ----------
  function parseMidi(buf) {
    const d = new Uint8Array(buf);
    let p = 0;
    const u32 = () => (d[p++] << 24 | d[p++] << 16 | d[p++] << 8 | d[p++]) >>> 0;
    const u16 = () => (d[p++] << 8 | d[p++]);
    const str = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(d[p++]); return s; };
    const vlq = () => { let v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < d.length); return v; };

    // buscar MThd (algunos archivos traen basura delante, p.ej. RIFF)
    let start = -1;
    for (let i = 0; i < d.length - 4; i++) if (d[i] === 0x4d && d[i + 1] === 0x54 && d[i + 2] === 0x68 && d[i + 3] === 0x64) { start = i; break; }
    if (start < 0) throw new Error('No es un archivo MIDI');
    p = start + 4;
    const hlen = u32();
    const format = u16(), ntrk = u16(), division = u16();
    p = start + 8 + hlen;
    if (division & 0x8000) throw new Error('MIDI con timecode SMPTE no soportado');

    const tracks = [];
    const tempos = [];
    for (let t = 0; t < ntrk && p < d.length - 8; t++) {
      const id = str(4), len = u32();
      const end = Math.min(p + len, d.length);
      if (id !== 'MTrk') { p = end; t--; continue; }
      const tr = { name: '', events: [] };
      let tick = 0, running = 0;
      while (p < end) {
        tick += vlq();
        let st = d[p];
        if (st & 0x80) p++; else st = running;
        if (st === 0xff) {
          const type = d[p++], l = vlq();
          if (type === 0x03 && !tr.name) tr.name = str(l).replace(/\0/g, '').trim();
          else if (type === 0x51 && l === 3) { tempos.push({ tick, uspq: d[p] << 16 | d[p + 1] << 8 | d[p + 2] }); p += 3; }
          else p += l;
          if (type === 0x2f) break;
        } else if (st === 0xf0 || st === 0xf7) {
          // sysex: algunos archivos traen la longitud mal; si no termina en F7, buscar el F7 real
          const l = vlq();
          let e = p + l;
          if (st === 0xf0 && d[e - 1] !== 0xf7) {
            for (let k = p; k < Math.min(end, p + l + 16); k++) if (d[k] === 0xf7) { e = k + 1; break; }
          }
          p = e;
        } else {
          running = st;
          const hi = st & 0xf0, ch = st & 0x0f;
          if (hi === 0xc0 || hi === 0xd0) { tr.events.push({ tick, hi, ch, a: d[p++] }); }
          else { tr.events.push({ tick, hi, ch, a: d[p++], b: d[p++] }); }
        }
      }
      p = end;
      tracks.push(tr);
    }

    // mapa de tempo: tick -> segundos
    tempos.sort((a, b) => a.tick - b.tick);
    const tmap = [{ tick: 0, sec: 0, uspq: 500000 }];
    for (const tp of tempos) {
      const last = tmap[tmap.length - 1];
      const sec = last.sec + (tp.tick - last.tick) * last.uspq / 1e6 / division;
      if (tp.tick === last.tick) { last.uspq = tp.uspq; } else tmap.push({ tick: tp.tick, sec, uspq: tp.uspq });
    }
    const toSec = (tick) => {
      let lo = 0, hi = tmap.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tmap[m].tick <= tick) lo = m; else hi = m - 1; }
      const s = tmap[lo];
      return s.sec + (tick - s.tick) * s.uspq / 1e6 / division;
    };

    // notas, separadas por (pista, canal) => "voces"
    const voices = [];
    tracks.forEach((tr, ti) => {
      const byCh = {};
      const program = {};
      const open = {};
      for (const e of tr.events) {
        if (e.hi === 0xc0) { program[e.ch] = program[e.ch] ?? e.a; continue; }
        if (e.hi !== 0x90 && e.hi !== 0x80) continue;
        const key = e.ch * 128 + e.a;
        if (e.hi === 0x90 && e.b > 0) {
          (open[key] = open[key] || []).push({ tick: e.tick, vel: e.b });
        } else {
          const st = open[key] && open[key].shift();
          if (!st) continue;
          const v = byCh[e.ch] = byCh[e.ch] || [];
          v.push({ t: toSec(st.tick), d: Math.max(0.02, toSec(e.tick) - toSec(st.tick)), p: e.a, v: st.vel / 127 });
        }
      }
      for (const ch in byCh) {
        const notes = byCh[ch].sort((a, b) => a.t - b.t || a.p - b.p);
        if (!notes.length) continue;
        voices.push({ track: ti, ch: +ch, name: tr.name, program: program[ch] ?? 0, notes });
      }
    });
    let duration = 0;
    for (const v of voices) for (const n of v.notes) duration = Math.max(duration, n.t + n.d);
    const beats = [];
    for (let tick = 0; beats.length < 5000; tick += division) { const s = toSec(tick); if (s > duration + 2) break; beats.push(s); }
    return { format, division, voices, duration, beats, bpm: 60e6 / tmap[0].uspq };
  }

  // ---------- ANÁLISIS DE VOCES ----------
  const GM_FAMILY = ['Piano', 'Percusión cromática', 'Órgano', 'Guitarra', 'Bajo', 'Cuerdas', 'Ensamble', 'Bronces', 'Lengüetas', 'Vientos', 'Synth lead', 'Synth pad', 'Synth FX', 'Étnico', 'Percusivo', 'FX'];

  function stats(notes) {
    const n = notes.length;
    let sumP = 0, overl = 0, endMax = -1;
    for (const x of notes) {
      sumP += x.p;
      if (x.t < endMax - 0.03) overl++;
      endMax = Math.max(endMax, x.t + x.d);
    }
    const span = n ? (notes[n - 1].t - notes[0].t) || 1 : 1;
    return { n, mean: n ? sumP / n : 0, poly: n ? overl / n : 0, density: n / span };
  }

  function analyze(midi, hints) {
    hints = hints || {};
    // eliminar notas de batería duplicadas entre pistas (hay MIDIs con el kit entero + el kit separado por pieza)
    const seen = new Set();
    for (const v of midi.voices) {
      if (v.ch !== 9) continue;
      v.notes = v.notes.filter(n => { const k = n.p + ':' + Math.round(n.t * 50); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    // pistas con instrumento duplicadas (mismas notas en el mismo momento): se deja una sola
    const keyOf = n => n.p + ':' + Math.round(n.t * 50);
    const kept = [];
    for (const v of midi.voices) {
      if (v.ch === 9 || !v.notes.length) { kept.push(v); continue; }
      const ks = new Set(v.notes.map(keyOf));
      const dup = kept.find(o => o.ch !== 9 && Math.abs(o.notes.length - v.notes.length) <= v.notes.length * 0.1 && v.notes.filter(n => o._keys.has(keyOf(n))).length >= v.notes.length * 0.9);
      if (dup) continue;
      v._keys = ks; kept.push(v);
    }
    midi.voices = kept.filter(v => v.notes.length);
    const maxN = Math.max(1, ...midi.voices.map(v => v.notes.length));
    midi.voices.forEach((v, i) => {
      v.id = i;
      v.drums = v.ch === 9;
      v.st = stats(v.notes);
      v.family = v.drums ? 'Batería' : GM_FAMILY[v.program >> 3];
      const nm = (v.name || '').replace(/[^\w\s.#()áéíóúñÁÉÍÓÚÑ-]/g, '').trim();
      v.label = (nm && !/^(track|pista)?\s*\d*$/i.test(nm) ? nm : v.family);
    });
    // si varias pistas comparten nombre, se las distingue por instrumento
    const cnt = {};
    midi.voices.forEach(v => { cnt[v.label] = (cnt[v.label] || 0) + 1; });
    midi.voices.forEach(v => { if (cnt[v.label] > 1 && !v.drums) v.label = v.family; });
    const seenL = {};
    midi.voices.forEach(v => { const l = v.label; seenL[l] = (seenL[l] || 0) + 1; if (seenL[l] > 1) v.label = l + ' ' + seenL[l]; });
    const byHint = (h) => { if (!h) return null; const q = String(h).toLowerCase(); return midi.voices.find(v => !v.drums && (v.label.toLowerCase().includes(q) || (v.name || '').toLowerCase().includes(q))) || null; };
    const pitched = midi.voices.filter(v => !v.drums && v.st.n >= Math.max(12, maxN * 0.03));
    const famOf = v => v.program >> 3;
    // bajo: familia "Bajo"; si no, la voz más grave, poco polifónica, que no sea pad/FX
    let bass = byHint(hints.bass) || pitched.filter(v => famOf(v) === 4).sort((a, b) => b.st.n - a.st.n)[0];
    if (!bass) bass = pitched.filter(v => v.st.mean < 52 && v.st.poly < 0.3 && ![11, 12, 15].includes(famOf(v)))
      .sort((a, b) => (a.st.mean - Math.log(a.st.n) * 3) - (b.st.mean - Math.log(b.st.n) * 3))[0];
    // melodía: puntaje por agudo, monofonía, cantidad de notas y nombre
    let melody = null, best = -1e9;
    for (const v of pitched) {
      if (v === bass) continue;
      const fam = famOf(v);
      const win = new Set(v.notes.map(n => Math.floor(n.t / 4)));
      const cov = win.size / Math.max(1, Math.ceil(midi.duration / 4));
      let s = (v.st.mean - 60) * 0.5 - v.st.poly * 25 + Math.log(v.st.n + 1) * 8 + cov * 30;
      if (fam === 11 || fam === 12 || fam === 15) s -= 15;
      if (fam === 10 || fam === 8 || fam === 9) s += 6;
      if (/voc|voz|melod|lead|sing|vox|canto/i.test(v.name)) s += 25;
      if (/chord|acorde|pad|string|comp|harm/i.test(v.name)) s -= 10;
      v.melodyScore = s;
      if (s > best) { best = s; melody = v; }
    }
    // sin bajo propio (p.ej. piano solo): derivar el bajo de las notas más graves del acompañamiento
    if (!bass) {
      const pool = [];
      midi.voices.forEach(v => { if (!v.drums) v.notes.forEach(n => { if (n.p < 55) pool.push({ n, v }); }); });
      pool.sort((a, b) => a.n.t - b.n.t || a.n.p - b.n.p);
      const picked = [];
      let lastT = -9;
      for (const x of pool) { if (x.n.t - lastT < 0.03) continue; picked.push(x); lastT = x.n.t; }
      if (picked.length >= 30) {
        const take = new Set(picked.map(x => x.n));
        midi.voices.forEach(v => { if (!v.drums) v.notes = v.notes.filter(n => !take.has(n)); });
        bass = { id: midi.voices.length, track: -1, ch: -1, name: 'Bajo (derivado)', label: 'Bajo (derivado)', program: 32, family: 'Bajo', drums: false, notes: picked.map(x => ({ ...x.n })) };
        bass.st = stats(bass.notes);
        midi.voices.forEach(v => { v.st = stats(v.notes); });
        midi.voices.push(bass);
      }
    }
    const forced = byHint(hints.melody);
    if (forced && forced !== bass) melody = forced;
    const drums = midi.voices.filter(v => v.drums);
    const harmony = pitched.filter(v => v !== bass && v !== melody && v.notes.length);
    // voces chiquitas (pocas notas) también van a la armonía para que suenen de base
    midi.voices.forEach(v => { if (!v.drums && v !== bass && v !== melody && v.notes.length && !harmony.includes(v)) harmony.push(v); });
    midi.parts = {};
    if (melody) midi.parts.melody = { key: 'melody', name: 'Melodía', voices: [melody], kind: 'lead' };
    if (bass) midi.parts.bass = { key: 'bass', name: 'Bajo', voices: [bass], kind: 'bass' };
    if (drums.length) midi.parts.drums = { key: 'drums', name: 'Batería', voices: drums, kind: 'drums' };
    if (harmony.length) midi.parts.harmony = { key: 'harmony', name: 'Armonía', voices: harmony, kind: 'harmony' };
    // además, cada pista por separado
    midi.voices.forEach(v => {
      if (v.notes.length < 8) return;
      midi.parts['v' + v.id] = { key: 'v' + v.id, name: v.label, voices: [v], kind: v.drums ? 'drums' : (v === bass || v.st.mean < 48 ? 'bass' : 'lead'), single: true };
    });
    // rol de cada voz para la base 8bit
    midi.voices.forEach(v => { v.role = v.drums ? 'drums' : v === melody ? 'lead' : v === bass ? 'bass' : 'harmony'; });
    return midi;
  }

  // ---------- GENERACIÓN DE NIVEL ----------
  const DIFF = {
    facil:   { gap: 0.36, drumGap: 0.55, anyGap: 0.42, hold: 0.9, sim: 1 },
    normal:  { gap: 0.20, drumGap: 0.28, anyGap: 0.19, hold: 0.6, sim: 1 },
    dificil: { gap: 0.11, drumGap: 0.18, anyGap: 0.11, hold: 0.45, sim: 2 },
  };

  // carriles de batería (GM)
  function drumLane(p) {
    if (p === 35 || p === 36) return 0;                          // bombo
    if (p === 38 || p === 40 || p === 37 || p === 39) return 1;  // redoblante / aplauso
    if (p === 42 || p === 44 || p === 46) return 2;              // hi-hat
    if ([41, 43, 45, 47, 48, 50, 49, 51, 52, 53, 55, 57, 59].includes(p)) return 3; // toms y platos
    return -1;                                                   // percusión latina, shaker, etc. -> no se toca
  }
  function drumPriority(lane) { return [3, 4, 1, 2][lane]; }

  // Une voces y saca una línea monofónica (más aguda para melodía, más grave para bajo)
  function monophonic(notes, pickHigh) {
    const out = [];
    const sorted = notes.slice().sort((a, b) => a.t - b.t || (pickHigh ? b.p - a.p : a.p - b.p));
    for (const n of sorted) {
      const prev = out[out.length - 1];
      if (prev && n.t - prev.t < 0.03) continue; // simultánea: ya elegimos la de arriba/abajo
      if (prev && prev.t + prev.d > n.t) prev.d = Math.max(0.03, n.t - prev.t);
      n.main = true;
      out.push({ ...n });
    }
    return out;
  }

  function buildChart(midi, partKey, diffKey) {
    const part = midi.parts[partKey];
    const cfg = DIFF[diffKey];
    const all = [];
    part.voices.forEach(v => v.notes.forEach(n => all.push({ ...n })));
    all.sort((a, b) => a.t - b.t || a.p - b.p);
    let gems = [];

    if (part.kind === 'drums') {
      const allowed = [0, 1, 2, 3];
      // agrupar por instante
      const groups = [];
      for (const n of all) {
        n.lane = drumLane(n.p);
        const g = groups[groups.length - 1];
        if (g && n.t - g.t < 0.025) g.notes.push(n); else groups.push({ t: n.t, notes: [n] });
      }
      const lastLane = [-9, -9, -9, -9];
      let lastAny = -9;
      for (const g of groups) {
        const lanes = [...new Set(g.notes.map(n => n.lane))].filter(l => allowed.includes(l));
        lanes.sort((a, b) => drumPriority(b) - drumPriority(a));
        let used = 0;
        for (const l of lanes) {
          if (used >= cfg.sim) break;
          if (g.t - lastLane[l] < cfg.drumGap) continue;
          if (used === 0 && g.t - lastAny < cfg.anyGap) continue;
          gems.push({ t: g.t, lane: l, d: 0, notes: [] });
          lastLane[l] = g.t; lastAny = g.t; used++;
        }
      }
    } else {
      const pickHigh = part.kind !== 'bass';
      const line = monophonic(all, pickHigh);
      // filtrar por separación mínima, priorizando notas acentuadas y largas
      const kept = [];
      for (let i = 0; i < line.length; i++) {
        const n = line[i];
        const prev = kept[kept.length - 1];
        if (!prev || n.t - prev.t >= cfg.gap) { kept.push(n); continue; }
        // si la nueva es claramente más importante (más larga) reemplaza a la anterior
        if (n.d > prev.d * 2.2 && n.t - (kept[kept.length - 2]?.t ?? -9) >= cfg.gap) kept[kept.length - 1] = n;
      }
      // carril según contorno de altura en una ventana local
      const W = 3.0;
      let prevLane = 1, prevP = null;
      for (const n of kept) {
        let lo = 127, hi = 0;
        for (const m of kept) { if (Math.abs(m.t - n.t) <= W) { lo = Math.min(lo, m.p); hi = Math.max(hi, m.p); } }
        let lane = hi - lo < 1 ? 1 : Math.min(3, Math.floor((n.p - lo) / (hi - lo + 1) * 4));
        if (prevP !== null) {
          if (n.p > prevP && lane <= prevLane) lane = Math.min(3, prevLane + 1);
          else if (n.p < prevP && lane >= prevLane) lane = Math.max(0, prevLane - 1);
          else if (n.p === prevP) lane = prevLane;
        }
        const g = { t: n.t, lane, d: 0, notes: [] };
        gems.push(g);
        prevLane = lane; prevP = n.p;
      }
      // notas largas -> mantener
      gems.forEach((g, i) => {
        const src = kept[i];
        const next = gems[i + 1];
        const room = next ? next.t - g.t - 0.12 : 9;
        if (src.d >= cfg.hold && room > cfg.hold * 0.8) g.d = Math.min(src.d, room);
      });
      // acordes en difícil: si la nota original era parte de un acorde grande, a veces doble gema
    }

    gems.sort((a, b) => a.t - b.t || a.lane - b.lane);
    // asignar TODAS las notas de la parte a la gema anterior más cercana (así suenan completas al acertar)
    const auto = []; // notas de la parte que no dependen del jugador (suenan solas)
    if (part.kind === 'drums') {
      // cada golpe se cuelga de la última gema de SU carril; percusión sin carril suena sola
      const byLane = [[], [], [], []];
      gems.forEach(g => byLane[g.lane].push(g));
      const idx = [0, 0, 0, 0];
      for (const n of all) {
        const l = drumLane(n.p);
        const arr = l >= 0 ? byLane[l] : null;
        if (!arr || !arr.length) { auto.push(n); continue; }
        while (idx[l] + 1 < arr.length && arr[idx[l] + 1].t <= n.t + 0.03) idx[l]++;
        const g = arr[idx[l]];
        if (n.t < g.t - 0.03 || n.t - g.t > 2.5) auto.push(n); else g.notes.push(n);
      }
    } else if (gems.length) {
      let gi = 0;
      for (const n of all) {
        while (gi + 1 < gems.length && gems[gi + 1].t <= n.t + 0.03) gi++;
        const g = gems[gi];
        if (n.t < g.t - 0.03 || n.t - g.t > 4) auto.push(n); else g.notes.push(n);
      }
    }
    gems.auto = auto;
    return gems;
  }

  const api = { parseMidi, analyze, buildChart, monophonic, DIFF, drumLane };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MidiKit = api;
})(this);
