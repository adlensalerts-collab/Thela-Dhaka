import * as THREE from 'three';
import type { GameEngine } from '../simulation';

/**
 * Performance probe + one-click benchmark. Open it with F3, or load the game with `?perf` in the address.
 *
 * It shows live numbers (frame time, CPU time spent submitting the frame, GPU time when the browser exposes
 * timestamp queries, draw calls, render size, backend) and a "Run benchmark" button. The benchmark switches
 * one feature off at a time for ~3 s each (shadows, clouds, sky fog, city, traffic, crowd, half resolution)
 * and prints a table of how much each one costs. Copy the table and send it: it tells us exactly what is slow
 * on this device instead of guessing.
 */

interface Sample { frame: number[]; cpu: number[]; gpu: number[]; calls: number[] }
interface Row { name: string; frame: number; cpu: number; gpu: number | null; calls: number }

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

export class PerfProbe {
  private box: HTMLDivElement | null = null;
  private text: HTMLPreElement | null = null;
  private sample: Sample = { frame: [], cpu: [], gpu: [], calls: [] };
  private lastFrameAt = 0;
  private gpuTick = 0;
  benchRunning = false;
  private rows: Row[] = [];
  private shown = false;
  private lastPaint = 0;

  constructor(private engine: GameEngine) {
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.toggle(); } });
    if (new URLSearchParams(location.search).has('perf')) this.toggle();
  }

  /** Call once per frame with the milliseconds spent inside the render call. */
  frame(cpuMs: number) {
    const now = performance.now();
    if (this.lastFrameAt > 0) {
      const dt = now - this.lastFrameAt;
      if (dt < 1000) {
        this.sample.frame.push(dt);
        this.sample.cpu.push(cpuMs);
        this.sample.calls.push(this.engine.renderer.info.render.calls);
      }
    }
    this.lastFrameAt = now;
    if (!this.shown && !this.benchRunning) { this.trim(); return; }
    // GPU time: only when the browser supports timestamp queries (WebGPU + the feature).
    if ((this.gpuTick++ % 20) === 0 && this.backend() === 'WebGPU') {
      const r = this.engine.renderer as unknown as { resolveTimestampsAsync?: (t: string) => Promise<unknown>; info: { render: { timestamp: number } } };
      if (r.resolveTimestampsAsync) {
        void r.resolveTimestampsAsync('render').then(() => {
          const t = r.info.render.timestamp;
          if (t > 0) this.sample.gpu.push(t);
        }).catch(() => undefined);
      }
    }
    this.trim();
    if (this.shown && now - this.lastPaint > 500) { this.lastPaint = now; this.paint(); }
  }

  private trim() {
    for (const k of Object.keys(this.sample) as Array<keyof Sample>) if (this.sample[k].length > 240) this.sample[k].splice(0, this.sample[k].length - 240);
  }

  private backend(): string {
    const be = this.engine.renderer.backend as { isWebGPUBackend?: boolean };
    return be.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  }

  private header(): string {
    const e = this.engine;
    const f = median(this.sample.frame), c = median(this.sample.cpu), g = median(this.sample.gpu), calls = median(this.sample.calls);
    const sz = e.renderer.getDrawingBufferSize(new THREE.Vector2());
    return [
      `backend ${this.backend()}  quality ${e.qualityLevel}  render ${Math.round(sz.x)}×${Math.round(sz.y)}  pixel ratio ${e.currentPixelRatio.toFixed(2)}`,
      `frame ${f.toFixed(1)} ms (${f ? Math.round(1000 / f) : 0} fps)   CPU submit ${c.toFixed(1)} ms   GPU ${g ? g.toFixed(1) + ' ms' : 'n/a'}   draw calls ${Math.round(calls)}`,
      f > 0 ? (c > f * 0.6 ? 'verdict: CPU-bound (too many draw calls / objects)' : g > f * 0.6 ? 'verdict: GPU-bound (pixels / shaders)' : 'verdict: mixed or vsync-limited') : '',
    ].join('\n');
  }

  private paint() {
    if (!this.text) return;
    const lines = [this.header()];
    if (this.benchRunning) lines.push('', 'benchmark running… keep the tab visible and do not touch the keyboard');
    if (this.rows.length) lines.push('', this.table());
    this.text.textContent = lines.join('\n');
  }

  private table(): string {
    const base = this.rows[0];
    const out = ['test                    frame ms   CPU ms   GPU ms   calls   frame vs baseline'];
    for (const r of this.rows) {
      const d = r === base ? '' : `${(r.frame - base.frame >= 0 ? '+' : '') + (r.frame - base.frame).toFixed(1)} ms`;
      out.push(`${r.name.padEnd(22)}  ${r.frame.toFixed(1).padStart(8)}  ${r.cpu.toFixed(1).padStart(7)}  ${(r.gpu === null ? 'n/a' : r.gpu.toFixed(1)).padStart(7)}  ${String(Math.round(r.calls)).padStart(6)}   ${d}`);
    }
    return out.join('\n');
  }

  toggle() {
    this.shown = !this.shown;
    if (this.shown && !this.box) this.build();
    if (this.box) this.box.style.display = this.shown ? 'block' : 'none';
  }

  private build() {
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:min(96vw,640px);background:rgba(8,10,14,.88);color:#d7e3d0;font:11px/1.45 ui-monospace,Menlo,monospace;padding:8px 10px;border-radius:8px;border:1px solid #3d4b3a;pointer-events:auto';
    const text = document.createElement('pre');
    text.style.cssText = 'margin:0;white-space:pre-wrap;overflow-x:auto';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    const mk = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:#2b3a29;color:#e8f0e2;border:1px solid #4b6148;border-radius:5px;padding:4px 8px;font:inherit;cursor:pointer';
      b.onclick = fn;
      bar.appendChild(b);
    };
    mk('Run benchmark', () => { void this.bench(); });
    mk('Copy result', () => { void navigator.clipboard?.writeText(this.header() + '\n\n' + this.table()).catch(() => undefined); });
    mk('Hide', () => this.toggle());
    box.append(text, bar);
    document.body.appendChild(box);
    this.box = box; this.text = text;
  }

  private async measure(name: string, ms = 3200): Promise<Row> {
    await new Promise((r) => setTimeout(r, 900));            // let the change settle (shader builds etc.)
    this.sample = { frame: [], cpu: [], gpu: [], calls: [] };
    await new Promise((r) => setTimeout(r, ms));
    return { name, frame: median(this.sample.frame), cpu: median(this.sample.cpu), gpu: this.sample.gpu.length ? median(this.sample.gpu) : null, calls: median(this.sample.calls) };
  }

  /** Switch one thing off at a time and measure; everything is restored afterwards. */
  async bench() {
    if (this.benchRunning) return;
    this.benchRunning = true; this.rows = [];
    const e = this.engine;
    const savedLimit = e.fpsLimit;
    e.fpsLimit = 0;                                          // measure without the 60 FPS cap
    e.perfBench = true;                                      // pauses the quality guard and adaptive scaling
    const preset = e.qualityPreset;
    const tests: Array<[string, () => void, () => void]> = [
      ['all on (baseline)', () => undefined, () => undefined],
      ['shadow pass skipped', () => { e.perfSkipShadowPass = true; }, () => { e.perfSkipShadowPass = false; e.lighting!.sun.shadow.needsUpdate = true; }],
      ['clouds off', () => e.lighting!.setFeatures({ clouds: false, aerialFog: preset.aerialFog }), () => e.lighting!.setFeatures({ clouds: preset.clouds, aerialFog: preset.aerialFog })],
      ['sky fog off', () => e.lighting!.setFeatures({ clouds: preset.clouds, aerialFog: false }), () => e.lighting!.setFeatures({ clouds: preset.clouds, aerialFog: preset.aerialFog })],
      ['city hidden', () => { e.world!.chunks.root.visible = false; }, () => { e.world!.chunks.root.visible = true; }],
      ['traffic hidden', () => { for (const v of e.graphTraffic?.vehicles ?? []) v.mesh.visible = false; }, () => { for (const v of e.graphTraffic?.vehicles ?? []) v.mesh.visible = true; }],
      ['crowd hidden', () => { e.crowdVisible(false); }, () => { e.crowdVisible(true); }],
      ['half resolution', () => { e.renderer.setPixelRatio(Math.max(0.25, e.currentPixelRatio * 0.5)); }, () => { e.updatePixelRatio(true); }],
    ];
    for (const [name, on, off] of tests) {
      try { on(); this.rows.push(await this.measure(name)); } catch (err) { console.warn('[perf] test failed', name, err); }
      off();
      this.paint();
    }
    e.fpsLimit = savedLimit; e.perfBench = false;
    this.benchRunning = false;
    this.paint();
    console.info('[perf] benchmark\n' + this.header() + '\n' + this.table());
  }
}
