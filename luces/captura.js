/* AudioWorklet: corre en el hilo de audio.
   1) Junta el micrófono en bloques de 1024 muestras y los manda al decodificador (Web Worker), cada uno con la hora
      del audio de su última muestra.
   2) Busca el «tic» de sincronía que suena después de cada comando: un pulso corto en una frecuencia fija.
      Lo mide con filtros de Goertzel cada 64 muestras (~1,3 ms), así que sabe cuándo llegó con precisión de 1-2 ms,
      mucho mejor que la del decodificador (que avisa en bloques de 21 ms). La hora va a la página por su puerto. */
const TICS = [17500, 9000];       /* ultrasonido y audible; tienen que coincidir con el emisor */
const N = 128, HOP = 64;          /* ventana y paso del análisis */

class Captura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024); this.n = 0; this.out = null;
    this.ring = new Float32Array(N); this.r = 0; this.hop = 0;
    this.coef = TICS.map((f) => 2 * Math.cos(2 * Math.PI * f / sampleRate));
    this.bg = TICS.map(() => 0); this.warm = 0; this.quiet = 0;
    this.port.onmessage = (e) => { if (e.data.port) { this.out = e.data.port; } };
  }
  goertzel(k) {
    let s1 = 0, s2 = 0; const c = this.coef[k];
    for (let j = 0; j < N; j++) { const s = this.ring[(this.r + j) % N] + c * s1 - s2; s2 = s1; s1 = s; }
    return (s1 * s1 + s2 * s2 - c * s1 * s2) / (N * N);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) { return true; }
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      /* bloques para el decodificador */
      if (this.out) {
        this.buf[this.n++] = v;
        if (this.n === 1024) {
          this.out.postMessage({ f: this.buf, t: currentTime + (i + 1) / sampleRate }, [this.buf.buffer]);
          this.buf = new Float32Array(1024); this.n = 0;
        }
      }
      /* detector del tic */
      this.ring[this.r] = v; this.r = (this.r + 1) % N;
      if (++this.hop === HOP) {
        this.hop = 0; this.warm++;
        if (this.quiet > 0) { this.quiet--; }
        for (let k = 0; k < TICS.length; k++) {
          const p = this.goertzel(k);
          /* aparece de golpe muy por encima del fondo de esa frecuencia → llegó el tic */
          if (this.warm > 400 && this.quiet === 0 && p > this.bg[k] * 40 && p > 1e-9) {
            /* la ventana termina en esta muestra: el frente del pulso entró hace ~media ventana */
            this.port.postMessage({ tic: k, t: currentTime + (i + 1 - N / 2) / sampleRate, p: p / (this.bg[k] + 1e-12) });
            this.quiet = Math.round(0.05 * sampleRate / HOP); /* 50 ms sin volver a avisar */
          }
          this.bg[k] = this.bg[k] * 0.97 + p * 0.03; /* fondo que se renueva en ~40 ms: a los 200 ms del comando ya bajó */
        }
      }
    }
    return true;
  }
}
registerProcessor('captura', Captura);
