// Sincronización entre teléfonos por sonido (sin internet).
//
// El anfitrión emite un "chirp" (barrido corto de 1,2 a 5 kHz) y arranca su tema K segundos después
// de haberlo emitido. El invitado escucha con el micrófono, encuentra el instante exacto en que llegó
// el chirp (correlación con la señal conocida) y arranca K segundos después de ese instante, restando
// su propia demora de parlante + micrófono, que mide antes haciéndose escuchar a sí mismo.
// Cuenta: inicio_invitado = llegada_del_chirp + K − demora_propia. La demora del anfitrión no hace falta.
(function (root) {
  'use strict';
  const CHIRP = { dur: 0.3, f0: 1200, f1: 5000 };

  function makeChirp(sr) {
    const n = Math.round(sr * CHIRP.dur), a = new Float32Array(n), k = (CHIRP.f1 - CHIRP.f0) / CHIRP.dur;
    for (let i = 0; i < n; i++) {
      const t = i / sr, w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      a[i] = Math.sin(2 * Math.PI * (CHIRP.f0 * t + k * t * t / 2)) * w;
    }
    return a;
  }

  // FFT iterativa in-place (re, im de largo potencia de 2)
  function fft(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = 2 * Math.PI / len * (inv ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let j = 0; j < len / 2; j++) {
          const a = i + j, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
    if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }

  // Busca la señal ref dentro de x. Devuelve { idx (muestra donde empieza), score } o null.
  function detect(x, ref) {
    const m = ref.length;
    if (x.length < m + 16) return null;
    let n = 1; while (n < x.length + m) n <<= 1;
    const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
    for (let i = 0; i < x.length; i++) ar[i] = x[i];
    for (let i = 0; i < m; i++) br[i] = ref[i];
    fft(ar, ai, false); fft(br, bi, false);
    for (let i = 0; i < n; i++) { const r = ar[i] * br[i] + ai[i] * bi[i], im = ai[i] * br[i] - ar[i] * bi[i]; ar[i] = r; ai[i] = im; }
    fft(ar, ai, true); // ar[lag] = sum x[lag+k] ref[k]
    // normalizar por la energía de x en cada ventana (correlación normalizada, 0..1)
    let refE = 0; for (let i = 0; i < m; i++) refE += ref[i] * ref[i];
    const cs = new Float64Array(x.length + 1);
    for (let i = 0; i < x.length; i++) cs[i + 1] = cs[i] + x[i] * x[i];
    const L = x.length - m;
    const rho = new Float32Array(L + 1);
    let best = -1, bestV = 0;
    for (let lag = 0; lag <= L; lag++) {
      const e = cs[lag + m] - cs[lag];
      const v = e > 1e-9 ? Math.abs(ar[lag]) / Math.sqrt(refE * e) : 0;
      rho[lag] = v;
      if (v > bestV) { bestV = v; best = lag; }
    }
    if (best < 0) return null;
    // camino directo: el primer pico fuerte dentro de los 25 ms anteriores al máximo (los ecos llegan después)
    const sr = ref.sr || 48000, back = Math.round(0.025 * sr);
    let idx = best;
    for (let lag = Math.max(0, best - back); lag < best; lag++) if (rho[lag] >= 0.7 * bestV) { idx = lag; break; }
    // qué tanto se destaca sobre el resto (ruido)
    let sum = 0, cnt = 0;
    for (let lag = 0; lag <= L; lag += 7) { if (Math.abs(lag - best) > m) { sum += rho[lag]; cnt++; } }
    const floor = cnt ? sum / cnt : 0.01;
    return { idx, score: bestV, ratio: bestV / Math.max(1e-4, floor) };
  }

  const api = { makeChirp, detect, fft, CHIRP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SyncKit = api;
})(this);
