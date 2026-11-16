// SUNFALL YARD — procedural audio. Every sound is synthesized with WebAudio:
// no audio assets, no network. Positional gain by distance, simple stereo pan.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
  }
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) { return false; }
  }
  // Distance-attenuated gain + pan for a sound at world position `pos`
  // heard by a listener at `ear` facing `yaw`.
  bus(pos, ear, yaw) {
    if (!this.ctx) return null;
    const dx = pos.x - ear.x, dz = pos.z - ear.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const g = this.ctx.createGain();
    g.gain.value = Math.max(0.04, 1 / (1 + dist * 0.09));
    let out = g;
    if (this.ctx.createStereoPanner) {
      const pan = this.ctx.createStereoPanner();
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const right = dx * cos - dz * sin;
      pan.pan.value = Math.max(-0.8, Math.min(0.8, right * 0.05));
      g.connect(pan);
      out = pan;
    }
    out.connect(this.master);
    return g;
  }
  tone(dest, freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dest, dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  shot(kind, pos, ear, yaw) {
    if (!this.ensure()) return;
    const b = this.bus(pos, ear, yaw);
    if (kind === 'sniper') { this.noise(b, 0.28, 0.9, 900); this.tone(b, 90, 0.22, 'sine', 0.7, 40); }
    else if (kind === 'shotgun') { this.noise(b, 0.22, 0.85, 700); this.tone(b, 110, 0.16, 'sine', 0.6, 45); }
    else if (kind === 'smg') { this.noise(b, 0.09, 0.55, 2400); this.tone(b, 160, 0.07, 'square', 0.18, 70); }
    else { this.noise(b, 0.13, 0.7, 1800); this.tone(b, 140, 0.1, 'sine', 0.45, 55); }
  }
  dryFire() { if (this.ensure()) this.tone(null, 900, 0.05, 'square', 0.12); }
  reload() { if (!this.ensure()) return; this.tone(null, 500, 0.06, 'square', 0.14); setTimeout(() => this.tone(null, 700, 0.06, 'square', 0.14), 180); }
  step(pos, ear, yaw, sneak) {
    if (!this.ensure()) return;
    const b = this.bus(pos, ear, yaw);
    this.noise(b, 0.07, sneak ? 0.05 : 0.12, 500);
  }
  hit() { if (this.ensure()) this.tone(null, 1400, 0.05, 'sine', 0.25); }
  hurt() { if (this.ensure()) this.tone(null, 220, 0.12, 'sawtooth', 0.2, 110); }
  beep() { if (this.ensure()) this.tone(null, 1180, 0.09, 'sine', 0.3); }
  plant() { if (!this.ensure()) return; this.tone(null, 660, 0.12, 'sine', 0.3); setTimeout(() => this.tone(null, 880, 0.16, 'sine', 0.3), 140); }
  explosion(pos, ear, yaw) {
    if (!this.ensure()) return;
    const b = this.bus(pos, ear, yaw);
    this.noise(b, 1.1, 1.0, 320);
    this.tone(b, 70, 0.9, 'sine', 0.9, 28);
  }
  flashRing() { if (this.ensure()) this.tone(null, 3200, 0.7, 'sine', 0.16); }
  roundWin(attWon) {
    if (!this.ensure()) return;
    const notes = attWon ? [392, 523, 659] : [330, 415, 494];
    notes.forEach((n, i) => setTimeout(() => this.tone(null, n, 0.22, 'triangle', 0.3), i * 130));
  }
  buy() { if (this.ensure()) this.tone(null, 780, 0.08, 'triangle', 0.22); }
  click() { if (this.ensure()) this.tone(null, 600, 0.04, 'square', 0.1); }
  pickup() { if (this.ensure()) this.tone(null, 520, 0.09, 'triangle', 0.25, 760); }
}
