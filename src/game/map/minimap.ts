import type { District } from './district';
import type { DistrictWorld } from './districtWorld';

/**
 * M4 — minimap background for a real district (whole district, north up), plus the world → map
 * transform. Sprint 12 replaces this with the rotating GTA-style radar.
 */
export function createDistrictMinimap(d: District, sizePx = 160) {
  const c = document.createElement('canvas');
  c.width = c.height = sizePx;
  const g = c.getContext('2d')!;
  const span = Math.max(d.bounds.halfWidth, d.bounds.halfDepth) * 2;
  const scale = sizePx / span;
  const toMap = (x: number, z: number): [number, number] => [sizePx / 2 + x * scale, sizePx / 2 + z * scale];
  g.fillStyle = '#d3c9a8'; g.fillRect(0, 0, sizePx, sizePx);
  const path = (pts: Array<[number, number]>) => { g.beginPath(); pts.forEach(([x, z], i) => { const [mx, my] = toMap(x, z); i ? g.lineTo(mx, my) : g.moveTo(mx, my); }); g.closePath(); };
  g.fillStyle = '#b9a28c';
  for (const p of d.surfaces.footpath) { path(p.outer); for (const h of p.holes) path(h); g.fill('evenodd'); }
  g.fillStyle = '#67695f';
  for (const p of d.surfaces.carriageway) { path(p.outer); g.fill(); g.fillStyle = '#d3c9a8'; for (const h of p.holes) { path(h); g.fill(); } g.fillStyle = '#67695f'; }
  g.fillStyle = '#8b8f86';
  for (const b of d.buildings) { path(b.footprint); g.fill(); }
  const marker = (x: number, z: number, col: string, letter: string) => {
    const [mx, my] = toMap(x, z); g.fillStyle = col; g.fillRect(mx - 5, my - 5, 10, 10);
    g.strokeStyle = '#111'; g.lineWidth = 1; g.strokeRect(mx - 5, my - 5, 10, 10);
    g.fillStyle = '#111'; g.font = 'bold 8px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, mx, my + 0.5);
  };
  for (const s of d.sites.garages) marker(s.x, s.z, '#f59e0b', 'G');
  for (const s of d.sites.aarots) marker(s.x, s.z, '#22c55e', 'A');
  return { canvas: c, toMap, metresPerPixel: 1 / scale };
}

/** Dev-mode check: nothing except vehicles may stand on a carriageway (real-map version of auditObstacles). */
export function auditDistrict(w: DistrictWorld): number {
  let bad = 0;
  for (const o of w.obstacles) {
    const pts: Array<[number, number]> = o.type === 'circle' ? [[o.x, o.z]] : o.type === 'poly' ? o.points : [[o.x, o.z]];
    for (const [x, z] of pts) {
      if (w.roads.isOnCarriageway(x, z, -0.25)) { bad++; console.warn(`[layout] ${o.tag ?? o.type} at (${x.toFixed(1)}, ${z.toFixed(1)}) is on a road`); break; }
    }
  }
  return bad;
}
