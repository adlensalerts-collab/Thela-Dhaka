export type StreetSound =
  | 'rickshaw_bell'
  | 'cng_horn'
  | 'bus_horn'
  | 'car_horn'
  | 'vendor_bell'
  | 'crowd_murmur';

const MAX_DISTANCE = 60;
const MAX_ONE_SHOTS = 12;

interface ActiveVoice {
  id: number;
  gain: number;
  endTime: number;
  stop: () => void;
}

export class StreetSounds {
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private readonly activeVoices: ActiveVoice[] = [];
  private nextVoiceId = 1;

  private listenerX = 0;
  private listenerZ = 0;
  private listenerHeading = 0;

  private murmurLevel = 0;
  private murmurSource: AudioBufferSourceNode | null = null;
  private murmurGain: GainNode | null = null;
  private murmurWobbleGain: GainNode | null = null;
  private murmurBandA: BiquadFilterNode | null = null;
  private murmurBandB: BiquadFilterNode | null = null;
  private murmurLowpass: BiquadFilterNode | null = null;
  private murmurLfoA: OscillatorNode | null = null;
  private murmurLfoB: OscillatorNode | null = null;
  private murmurLfoGainA: GainNode | null = null;
  private murmurLfoGainB: GainNode | null = null;
  private murmurFilterLfoGain: GainNode | null = null;

  private disposed = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(1, ctx.currentTime);
    this.masterGain.connect(destination);

    // Pre-generate one shared 3-second pink-weighted noise buffer (reused everywhere, 0 per-frame allocations)
    const sampleRate = ctx.sampleRate || 44100;
    const length = sampleRate * 3;
    this.noiseBuffer = ctx.createBuffer(1, length, sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 0.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      // Cross-fade the final 1024 samples with the start so loop boundaries are click-free
      data[i] = Math.max(-1, Math.min(1, pink));
    }
    const fadeSamples = Math.min(1024, Math.floor(length / 8));
    for (let i = 0; i < fadeSamples; i++) {
      const t = i / fadeSamples;
      const tailIdx = length - fadeSamples + i;
      data[tailIdx] = data[tailIdx] * (1 - t) + data[i] * t;
    }
  }

  setListener(x: number, z: number, headingRad: number): void {
    if (this.disposed) return;
    if (Number.isFinite(x)) this.listenerX = x;
    if (Number.isFinite(z)) this.listenerZ = z;
    if (Number.isFinite(headingRad)) this.listenerHeading = headingRad;
  }

  setMasterVolume(v: number): void {
    if (this.disposed) return;
    const clamped = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(clamped, now, 0.02);
  }

  /** Looping crowd murmur, level 0..1, smoothed over 0.5 s. */
  setMurmur(level: number): void {
    if (this.disposed) return;
    const clamped = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    this.murmurLevel = clamped;

    if (clamped > 0 && !this.murmurGain) {
      this.initMurmurGraph();
    }
    if (!this.murmurGain) return;

    const now = this.ctx.currentTime;
    const targetGain = clamped * 0.34;
    const g = this.murmurGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(targetGain, now + 0.5);
  }

  /** One-shot at a world position; volume falls off with distance from the listener (0 beyond 60 m) and pans left/right. Returns false if skipped. */
  play(kind: StreetSound, x: number, z: number, opts?: { gain?: number }): boolean {
    if (this.disposed) return false;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

    const dx = x - this.listenerX;
    const dz = z - this.listenerZ;
    const dist = Math.hypot(dx, dz);
    if (dist >= MAX_DISTANCE) return false;

    const falloff = 1 - dist / MAX_DISTANCE;
    const distGain = falloff * falloff;
    const optGain = opts?.gain !== undefined && Number.isFinite(opts.gain) ? Math.max(0, Math.min(2, opts.gain)) : 1;
    const effectiveGain = distGain * optGain;
    if (effectiveGain <= 0.001) return false;

    const now = this.ctx.currentTime;
    this.pruneFinishedVoices(now);

    if (this.activeVoices.length >= MAX_ONE_SHOTS) {
      let quietestIdx = 0;
      for (let i = 1; i < this.activeVoices.length; i++) {
        if (this.activeVoices[i].gain < this.activeVoices[quietestIdx].gain) {
          quietestIdx = i;
        }
      }
      if (this.activeVoices[quietestIdx].gain >= effectiveGain) {
        return false;
      }
      const dropped = this.activeVoices.splice(quietestIdx, 1)[0];
      dropped.stop();
    }

    // Compute stereo pan from listener heading
    const rightX = Math.cos(this.listenerHeading);
    const rightZ = Math.sin(this.listenerHeading);
    const lateral = dist > 0.001 ? (dx * rightX + dz * rightZ) / Math.max(dist, 6) : 0;
    const pan = Math.max(-1, Math.min(1, lateral));

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, now);

    const outGain = this.ctx.createGain();
    outGain.gain.setValueAtTime(effectiveGain, now);
    outGain.connect(panner);
    panner.connect(this.masterGain);

    const stopCallbacks: Array<() => void> = [];
    const duration = this.synthesizeOneShot(kind, now, outGain, stopCallbacks);

    const voiceId = this.nextVoiceId++;
    let cleaned = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (cleanupTimer !== null) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }
      for (let i = 0; i < stopCallbacks.length; i++) {
        try {
          stopCallbacks[i]();
        } catch {
          // Ignore already-stopped nodes
        }
      }
      try {
        outGain.disconnect();
      } catch {
        // Ignore
      }
      try {
        panner.disconnect();
      } catch {
        // Ignore
      }
      const idx = this.activeVoices.findIndex((v) => v.id === voiceId);
      if (idx !== -1) {
        this.activeVoices.splice(idx, 1);
      }
    };

    const endTime = now + duration + 0.05;
    cleanupTimer = setTimeout(cleanup, Math.ceil((duration + 0.08) * 1000));

    this.activeVoices.push({
      id: voiceId,
      gain: effectiveGain,
      endTime,
      stop: cleanup,
    });

    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    while (this.activeVoices.length > 0) {
      const voice = this.activeVoices.pop();
      voice?.stop();
    }

    this.teardownMurmurGraph();

    try {
      this.masterGain.disconnect();
    } catch {
      // Ignore
    }
  }

  private pruneFinishedVoices(now: number): void {
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      if (this.activeVoices[i].endTime <= now) {
        const finished = this.activeVoices.splice(i, 1)[0];
        finished.stop();
      }
    }
  }

  private synthesizeOneShot(
    kind: StreetSound,
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    switch (kind) {
      case 'rickshaw_bell':
        return this.synthRickshawBell(now, destination, stopCallbacks);
      case 'cng_horn':
        return this.synthCngHorn(now, destination, stopCallbacks);
      case 'bus_horn':
        return this.synthBusHorn(now, destination, stopCallbacks);
      case 'car_horn':
        return this.synthCarHorn(now, destination, stopCallbacks);
      case 'vendor_bell':
        return this.synthVendorBell(now, destination, stopCallbacks);
      case 'crowd_murmur':
        return this.synthMurmurBurst(now, destination, stopCallbacks);
    }
  }

  /**
   * Bright double/triple "tring-tring" metal bell (~2.4 kHz & ~3.6 kHz inharmonic partials, fast decay, 2–3 strikes).
   */
  private synthRickshawBell(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const strikes = Math.random() < 0.35 ? 3 : 2;
    const pitchFactor = 0.96 + Math.random() * 0.09;
    const baseA = 2420 * pitchFactor;
    const baseB = 3640 * pitchFactor;
    const baseC = 5810 * pitchFactor;
    const strikeSpacing = 0.115;
    const strikeDecay = 0.19;

    for (let s = 0; s < strikes; s++) {
      const t0 = now + s * strikeSpacing;
      const tEnd = t0 + strikeDecay;
      const detuneStrike = 1 + (s % 2 === 1 ? 0.018 : 0);

      const strikeGain = this.ctx.createGain();
      strikeGain.gain.setValueAtTime(0.0001, t0);
      strikeGain.gain.linearRampToValueAtTime(0.36, t0 + 0.003);
      strikeGain.gain.exponentialRampToValueAtTime(0.0008, tEnd);
      strikeGain.connect(destination);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(baseA * detuneStrike, t0);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(baseB * detuneStrike, t0);

      const osc3 = this.ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(baseC * detuneStrike, t0);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.65, t0);
      const g3 = this.ctx.createGain();
      g3.gain.setValueAtTime(0.25, t0);

      osc1.connect(strikeGain);
      osc2.connect(g2);
      g2.connect(strikeGain);
      osc3.connect(g3);
      g3.connect(strikeGain);

      osc1.start(t0);
      osc2.start(t0);
      osc3.start(t0);
      osc1.stop(tEnd);
      osc2.stop(tEnd);
      osc3.stop(tEnd);

      stopCallbacks.push(() => {
        osc1.stop();
        osc2.stop();
        osc3.stop();
        strikeGain.disconnect();
      });
    }

    return (strikes - 1) * strikeSpacing + strikeDecay;
  }

  /**
   * Short nasal two-tone toot (square-ish, ~420 Hz, band-passed), 0.25–0.4 s, sometimes double.
   */
  private synthCngHorn(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const isDouble = Math.random() < 0.42;
    const singleDur = isDouble ? 0.16 + Math.random() * 0.04 : 0.26 + Math.random() * 0.12;
    const gap = 0.055;
    const count = isDouble ? 2 : 1;
    const baseFreq = 410 + (Math.random() - 0.5) * 24;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(980, now);
    bandpass.Q.setValueAtTime(3.2, now);
    bandpass.connect(destination);

    stopCallbacks.push(() => bandpass.disconnect());

    for (let i = 0; i < count; i++) {
      const t0 = now + i * (singleDur + gap);
      const tMid = t0 + singleDur * 0.45;
      const tEnd = t0 + singleDur;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.45, t0 + 0.015);
      env.gain.setValueAtTime(0.42, Math.max(t0 + 0.02, tEnd - 0.035));
      env.gain.exponentialRampToValueAtTime(0.0008, tEnd);
      env.connect(bandpass);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(baseFreq, t0);
      osc1.frequency.setValueAtTime(baseFreq * 1.07, tMid);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(baseFreq * 1.015, t0);
      osc2.frequency.setValueAtTime(baseFreq * 1.085, tMid);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.45, t0);

      osc1.connect(env);
      osc2.connect(g2);
      g2.connect(env);

      osc1.start(t0);
      osc2.start(t0);
      osc1.stop(tEnd);
      osc2.stop(tEnd);

      stopCallbacks.push(() => {
        osc1.stop();
        osc2.stop();
        env.disconnect();
      });
    }

    return count * singleDur + (count - 1) * gap;
  }

  /**
   * Deep loud air horn (~180 Hz + ~240 Hz detuned saws, low-pass), 0.6–1.0 s.
   */
  private synthBusHorn(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const duration = 0.62 + Math.random() * 0.34;
    const tEnd = now + duration;
    const pitchShift = 0.97 + Math.random() * 0.06;
    const f1 = 180 * pitchShift;
    const f2 = 240 * pitchShift;
    const f3 = 358 * pitchShift;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(920, now);
    lowpass.Q.setValueAtTime(1.4, now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.52, now + 0.035);
    env.gain.setValueAtTime(0.48, Math.max(now + 0.05, tEnd - 0.09));
    env.gain.exponentialRampToValueAtTime(0.0008, tEnd);

    lowpass.connect(env);
    env.connect(destination);

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(f1, now);
    osc1.frequency.linearRampToValueAtTime(f1 * 0.985, tEnd);

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(f2, now);
    osc2.frequency.linearRampToValueAtTime(f2 * 0.985, tEnd);

    const osc3 = this.ctx.createOscillator();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(f3, now);

    const g3 = this.ctx.createGain();
    g3.gain.setValueAtTime(0.28, now);

    osc1.connect(lowpass);
    osc2.connect(lowpass);
    osc3.connect(g3);
    g3.connect(lowpass);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    osc1.stop(tEnd);
    osc2.stop(tEnd);
    osc3.stop(tEnd);

    stopCallbacks.push(() => {
      osc1.stop();
      osc2.stop();
      osc3.stop();
      lowpass.disconnect();
      env.disconnect();
    });

    return duration;
  }

  /**
   * Classic ~400/500 Hz dual-tone car horn, 0.3 s.
   */
  private synthCarHorn(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const duration = 0.3;
    const tEnd = now + duration;
    const detune = 0.98 + Math.random() * 0.04;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1650, now);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.38, now + 0.015);
    env.gain.setValueAtTime(0.36, tEnd - 0.035);
    env.gain.exponentialRampToValueAtTime(0.0008, tEnd);

    filter.connect(env);
    env.connect(destination);

    const oscA = this.ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.setValueAtTime(402 * detune, now);

    const oscB = this.ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.setValueAtTime(502 * detune, now);

    oscA.connect(filter);
    oscB.connect(filter);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(tEnd);
    oscB.stop(tEnd);

    stopCallbacks.push(() => {
      oscA.stop();
      oscB.stop();
      filter.disconnect();
      env.disconnect();
    });

    return duration;
  }

  /**
   * Small brass hand-bell shake, 4–6 quick strikes.
   */
  private synthVendorBell(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const strikes = 4 + Math.floor(Math.random() * 3); // 4..6 strikes
    const spacing = 0.072;
    const strikeDecay = 0.14;
    const basePitch = 1860 * (0.97 + Math.random() * 0.07);

    for (let i = 0; i < strikes; i++) {
      const t0 = now + i * spacing + (Math.random() * 0.008 - 0.004);
      const tEnd = t0 + strikeDecay;
      const strikePitch = basePitch * (1 + ((i % 2) * 0.025 - 0.01));

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.3, t0 + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0008, tEnd);
      env.connect(destination);

      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(strikePitch, t0);

      const osc2 = this.ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(strikePitch * 1.51, t0);

      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.5, t0);

      osc1.connect(env);
      osc2.connect(g2);
      g2.connect(env);

      osc1.start(t0);
      osc2.start(t0);
      osc1.stop(tEnd);
      osc2.stop(tEnd);

      stopCallbacks.push(() => {
        osc1.stop();
        osc2.stop();
        env.disconnect();
      });
    }

    return (strikes - 1) * spacing + strikeDecay + 0.01;
  }

  /**
   * One-shot filtered crowd murmur burst when 'crowd_murmur' is triggered via play().
   */
  private synthMurmurBurst(
    now: number,
    destination: AudioNode,
    stopCallbacks: Array<() => void>
  ): number {
    const duration = 1.2;
    const tEnd = now + duration;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(520, now);
    bandpass.Q.setValueAtTime(1.6, now);

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.4, now);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(160, now);
    lfo.connect(lfoGain);
    lfoGain.connect(bandpass.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.35, now + 0.2);
    env.gain.setValueAtTime(0.32, now + 0.85);
    env.gain.exponentialRampToValueAtTime(0.0008, tEnd);

    src.connect(bandpass);
    bandpass.connect(env);
    env.connect(destination);

    src.start(now, Math.random() * 1.5);
    lfo.start(now);
    src.stop(tEnd);
    lfo.stop(tEnd);

    stopCallbacks.push(() => {
      src.stop();
      lfo.stop();
      src.disconnect();
      lfo.disconnect();
      lfoGain.disconnect();
      bandpass.disconnect();
      env.disconnect();
    });

    return duration;
  }

  private initMurmurGraph(): void {
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    // Two formant-like bands + lowpass + slow dual-LFO amplitude/filter wobble
    const bandA = this.ctx.createBiquadFilter();
    bandA.type = 'bandpass';
    bandA.frequency.setValueAtTime(360, now);
    bandA.Q.setValueAtTime(1.8, now);

    const bandB = this.ctx.createBiquadFilter();
    bandB.type = 'bandpass';
    bandB.frequency.setValueAtTime(760, now);
    bandB.Q.setValueAtTime(2.1, now);

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1150, now);

    const wobbleGain = this.ctx.createGain();
    wobbleGain.gain.setValueAtTime(0.75, now);

    const murmurGain = this.ctx.createGain();
    murmurGain.gain.setValueAtTime(0, now);

    const lfoA = this.ctx.createOscillator();
    lfoA.type = 'sine';
    lfoA.frequency.setValueAtTime(0.73, now);
    const lfoGainA = this.ctx.createGain();
    lfoGainA.gain.setValueAtTime(0.14, now);

    const lfoB = this.ctx.createOscillator();
    lfoB.type = 'triangle';
    lfoB.frequency.setValueAtTime(1.87, now);
    const lfoGainB = this.ctx.createGain();
    lfoGainB.gain.setValueAtTime(0.09, now);

    const filterLfoGain = this.ctx.createGain();
    filterLfoGain.gain.setValueAtTime(140, now);

    src.connect(bandA);
    src.connect(bandB);
    bandA.connect(lowpass);
    bandB.connect(lowpass);
    lowpass.connect(wobbleGain);
    wobbleGain.connect(murmurGain);
    murmurGain.connect(this.masterGain);

    lfoA.connect(lfoGainA);
    lfoGainA.connect(wobbleGain.gain);
    lfoB.connect(lfoGainB);
    lfoGainB.connect(wobbleGain.gain);

    lfoA.connect(filterLfoGain);
    filterLfoGain.connect(bandB.frequency);

    src.start(now);
    lfoA.start(now);
    lfoB.start(now);

    this.murmurSource = src;
    this.murmurBandA = bandA;
    this.murmurBandB = bandB;
    this.murmurLowpass = lowpass;
    this.murmurWobbleGain = wobbleGain;
    this.murmurGain = murmurGain;
    this.murmurLfoA = lfoA;
    this.murmurLfoB = lfoB;
    this.murmurLfoGainA = lfoGainA;
    this.murmurLfoGainB = lfoGainB;
    this.murmurFilterLfoGain = filterLfoGain;
  }

  private teardownMurmurGraph(): void {
    const nodesToStop = [this.murmurSource, this.murmurLfoA, this.murmurLfoB];
    for (const node of nodesToStop) {
      if (!node) continue;
      try {
        node.stop();
      } catch {
        // Ignore
      }
    }

    const nodesToDisconnect: Array<AudioNode | null> = [
      this.murmurSource,
      this.murmurBandA,
      this.murmurBandB,
      this.murmurLowpass,
      this.murmurWobbleGain,
      this.murmurGain,
      this.murmurLfoA,
      this.murmurLfoB,
      this.murmurLfoGainA,
      this.murmurLfoGainB,
      this.murmurFilterLfoGain,
    ];
    for (const node of nodesToDisconnect) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // Ignore
      }
    }

    this.murmurSource = null;
    this.murmurBandA = null;
    this.murmurBandB = null;
    this.murmurLowpass = null;
    this.murmurWobbleGain = null;
    this.murmurGain = null;
    this.murmurLfoA = null;
    this.murmurLfoB = null;
    this.murmurLfoGainA = null;
    this.murmurLfoGainB = null;
    this.murmurFilterLfoGain = null;
  }
}
