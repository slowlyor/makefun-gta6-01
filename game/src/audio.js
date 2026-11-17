// Solara Bay — all sound is synthesized with WebAudio: no audio files.
// Engine hum, police sirens, gunshots, crashes, pickups and a lo-fi
// bassline that plays while you cruise. Starts on first user gesture.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.musicTimer = null;
    this.musicStep = 0;
    this.noiseBuffer = null;
  }

  // Call from the first click / keypress: browsers require a gesture.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    // Shared white-noise buffer for gunshots, crashes and hi-hats.
    const len = this.ctx.sampleRate * 1;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startEngine();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // --- Engine: a low sawtooth whose pitch follows speed. ---------------
  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.10 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
  }

  // --- Siren: two-tone wail while any wanted level is active. ----------
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
    } else if (!on && this.sirenOsc) {
      this.sirenOsc.stop();
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  updateSiren(dt) {
    if (!this.sirenOsc) return;
    this.sirenTimer += dt;
    // Classic two-tone: alternate 660 Hz / 880 Hz every 0.45 s.
    const hi = Math.floor(this.sirenTimer / 0.45) % 2 === 0;
    this.sirenOsc.frequency.setTargetAtTime(hi ? 880 : 660, this.ctx.currentTime, 0.05);
  }

  // --- One-shots ---------------------------------------------------------
  blip(freq, dur, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  noiseBurst(dur, vol, filterFreq = 1800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur);
  }

  gunshot() { this.noiseBurst(0.14, 0.5, 2600); this.blip(120, 0.09, 'square', 0.18); }
  horn() {
    // A two-tone car horn: low + high together, short.
    this.blip(370, 0.28, 'square', 0.1);
    this.blip(466, 0.28, 'square', 0.08);
  }
  crash() { this.noiseBurst(0.3, 0.45, 700); this.blip(70, 0.25, 'sine', 0.3); }
  pickup() { this.blip(660, 0.09, 'sine', 0.16); setTimeout(() => this.blip(990, 0.14, 'sine', 0.16), 70); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.18), i * 110));
  }
  wantedUp() { this.blip(220, 0.2, 'sawtooth', 0.16); setTimeout(() => this.blip(180, 0.25, 'sawtooth', 0.16), 140); }
  busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.2), i * 180)); }
  click() { this.blip(440, 0.05, 'square', 0.08); }

  // --- Music: a slow sun-soaked bassline with hats, scheduled ahead. ---
  startMusic() {
    if (this.musicTimer) return;
    // A-minor groove: A1 C2 E2 G1, one bar per chord.
    const bassNotes = [55, 65.41, 49, 55, 55, 65.41, 82.41, 49];
    const stepDur = 0.21;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const step = this.musicStep++;
      const bar = Math.floor(step / 8) % bassNotes.length;
      const note = bassNotes[bar];
      const t = this.ctx.currentTime + 0.02;
      // Bass note on the beat.
      if (step % 2 === 0) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = note;
        g.gain.setValueAtTime(0.11, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + stepDur * 2);
      }
      // Hat tick on the off-beat.
      if (step % 2 === 1) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.045, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t); src.stop(t + 0.06);
      }
    }, stepDur * 1000);
  }
}
