import { StreetSound, StreetSounds } from '../game/audio/streetSounds';

const WORLD_RANGE_METRES = 65; // Pad covers ±65 m so user can test inside and beyond the 60 m cutoff

let audioCtx: AudioContext | null = null;
let streetSounds: StreetSounds | null = null;
let lastSelectedKind: StreetSound = 'rickshaw_bell';

// Default sound position: 12 m in front of listener
let sourceX = 0;
let sourceZ = -12;

const statusEl = document.getElementById('status');
const coordsEl = document.getElementById('coords-readout');
const murmurSlider = document.getElementById('murmur-slider') as HTMLInputElement | null;
const murmurValue = document.getElementById('murmur-value');
const masterSlider = document.getElementById('master-slider') as HTMLInputElement | null;
const masterValue = document.getElementById('master-value');
const padCanvas = document.getElementById('spatial-pad') as HTMLCanvasElement | null;

function ensureAudio(): StreetSounds | null {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      if (statusEl) statusEl.textContent = 'Web Audio API is not supported in this browser.';
      return null;
    }
    audioCtx = new Ctx();
    streetSounds = new StreetSounds(audioCtx, audioCtx.destination);
    streetSounds.setListener(0, 0, 0);
    streetSounds.setMasterVolume(Number(masterSlider?.value ?? 0.85));
    streetSounds.setMurmur(Number(murmurSlider?.value ?? 0));
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return streetSounds;
}

function drawPad(): void {
  if (!padCanvas) return;
  const ctx = padCanvas.getContext('2d');
  if (!ctx) return;

  const w = padCanvas.width;
  const h = padCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const pixelsPerMetre = (w / 2) / WORLD_RANGE_METRES;

  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.fillStyle = '#0b1918';
  ctx.fillRect(0, 0, w, h);

  // 20 m, 40 m, and 60 m cutoff rings
  const rings = [20, 40, 60];
  for (const r of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * pixelsPerMetre, 0, Math.PI * 2);
    ctx.strokeStyle = r === 60 ? '#f59e0b88' : '#1f4440';
    ctx.lineWidth = r === 60 ? 1.5 : 1;
    ctx.stroke();
  }

  // Crosshairs
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.strokeStyle = '#1b3b38';
  ctx.lineWidth = 1;
  ctx.stroke();

  // 60m label
  ctx.fillStyle = '#fbbf24';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('60m cutoff', cx + 6, cy - 60 * pixelsPerMetre + 13);

  // Listener dot at centre
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Sound source marker
  const sx = cx + sourceX * pixelsPerMetre;
  const sz = cy + sourceZ * pixelsPerMetre;
  const dist = Math.hypot(sourceX, sourceZ);
  const inRange = dist < 60;

  ctx.beginPath();
  ctx.arc(sx, sz, 7, 0, Math.PI * 2);
  ctx.fillStyle = inRange ? '#fbbf24' : '#ef4444';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (coordsEl) {
    coordsEl.textContent = `Source: (${sourceX.toFixed(1)} m, ${sourceZ.toFixed(1)} m) · Dist: ${dist.toFixed(1)} m`;
  }
}

function triggerSound(kind: StreetSound): void {
  lastSelectedKind = kind;
  const sounds = ensureAudio();
  if (!sounds) return;

  const played = sounds.play(kind, sourceX, sourceZ);
  const dist = Math.hypot(sourceX, sourceZ).toFixed(1);
  if (statusEl) {
    statusEl.textContent = played
      ? `বাজছে · Playing "${kind}" at (${sourceX.toFixed(1)}m, ${sourceZ.toFixed(1)}m) — ${dist}m`
      : `স্কিপ করা হয়েছে · Skipped "${kind}" (${dist}m — beyond 60m range or voice cap)`;
  }
}

document.querySelectorAll<HTMLButtonElement>('button[data-sound]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.sound as StreetSound | undefined;
    if (kind) {
      triggerSound(kind);
    }
  });
});

murmurSlider?.addEventListener('input', () => {
  const val = Number(murmurSlider.value);
  if (murmurValue) {
    murmurValue.textContent = `${Math.round(val * 100)}%`;
  }
  const sounds = ensureAudio();
  sounds?.setMurmur(val);
});

masterSlider?.addEventListener('input', () => {
  const val = Number(masterSlider.value);
  if (masterValue) {
    masterValue.textContent = `${Math.round(val * 100)}%`;
  }
  const sounds = ensureAudio();
  sounds?.setMasterVolume(val);
});

if (padCanvas) {
  const updateFromPointer = (clientX: number, clientY: number) => {
    const rect = padCanvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const nz = ((clientY - rect.top) / rect.height) * 2 - 1;
    sourceX = Math.max(-WORLD_RANGE_METRES, Math.min(WORLD_RANGE_METRES, nx * WORLD_RANGE_METRES));
    sourceZ = Math.max(-WORLD_RANGE_METRES, Math.min(WORLD_RANGE_METRES, nz * WORLD_RANGE_METRES));
    drawPad();
    triggerSound(lastSelectedKind);
  };

  padCanvas.addEventListener('pointerdown', (e) => {
    updateFromPointer(e.clientX, e.clientY);
  });
}

window.addEventListener('beforeunload', () => {
  streetSounds?.dispose();
});

drawPad();
