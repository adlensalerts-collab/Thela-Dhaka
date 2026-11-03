import { useEffect, useMemo, useRef } from 'react';
import type { GameState } from '../game/simulation';
import { USE_REAL_MAP, REAL_MAP_ID } from '../game/simulation';
import { getDistrict } from '../game/map/districtData';
import { createDistrictMinimap } from '../game/map/minimap';
import { GARAGE_SITES } from '../game/world/garages';
import { AAROT_SITES } from '../game/world/aarots';
import { RADAR_RADIUS as R, RADAR_SIZE as SIZE, RADAR_RANGE, radarPosition, radarEdge,
  radarPois, type RadarPoi, type RadarPoint } from '../game/ui/radar';

export function GameRadar({ state }: { state: GameState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const districtId = state.districtId ?? state.campaign?.district ?? REAL_MAP_ID;
  const vendor = state.mode === 'vendor' || state.mode === 'online_vendor';
  const map = useMemo(() => {
    if (USE_REAL_MAP) {
      const district = getDistrict(districtId);
      return { ...createDistrictMinimap(district, 1024, vendor ? 'vendor' : 'police', false), district };
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d3c9a8'; context.fillRect(0, 0, 512, 512);
    context.strokeStyle = '#67695f'; context.lineWidth = 13 * 512 / 240;
    for (const value of [-80, -40, 0, 40, 80]) {
      const position = (value + 120) / 240 * 512;
      context.beginPath(); context.moveTo(position, 0); context.lineTo(position, 512);
      context.moveTo(0, position); context.lineTo(512, position); context.stroke();
    }
    return { canvas, metresPerPixel: 240 / 512, toMap: (x: number, z: number): [number, number] =>
      [(x + 120) / 240 * 512, (z + 120) / 240 * 512], district: null };
  }, [districtId, vendor]);

  const pois = useMemo(() => {
    const result: RadarPoi[] = [];
    for (const position of map.district?.sites.garages.map((site) => ({ x: site.entrance[0], z: site.entrance[1] })) ?? GARAGE_SITES) {
      result.push({ x: position.x, z: position.z, kind: vendor ? 'G' : 'H' });
    }
    if (vendor) for (const position of map.district?.sites.aarots.map((site) => ({ x: site.entrance[0], z: site.entrance[1] })) ?? AAROT_SITES) {
      result.push({ x: position.x, z: position.z, kind: 'A' });
    }
    for (const spot of map.district?.sites.hotspots ?? []) {
      if (['marketplace', 'mall', 'department_store'].includes(spot.kind)) result.push({ ...spot, kind: 'M' });
    }
    return result;
  }, [map, vendor]);

  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const player = { x: state.playerX ?? 0, z: state.playerZ ?? 0 }, heading = state.heading || 0;
    const project = (point: RadarPoint) => radarPosition(point, player, heading);
    const scale = R / RADAR_RANGE;
    const pulse = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 :
      (Math.sin((state.time ?? 0) * 3) + 1) / 2;
    context.setTransform(2, 0, 0, 2, 0, 0); context.clearRect(0, 0, SIZE, SIZE);
    context.save(); context.translate(SIZE / 2, SIZE / 2);
    context.beginPath(); context.arc(0, 0, R, 0, Math.PI * 2); context.clip();
    context.fillStyle = '#253c38'; context.fillRect(-R, -R, R * 2, R * 2);
    context.save(); context.rotate(-heading);
    const [px, py] = map.toMap(player.x, player.z), zoom = map.metresPerPixel * scale;
    context.drawImage(map.canvas, -px * zoom, -py * zoom, map.canvas.width * zoom, map.canvas.height * zoom);
    context.restore();
    // The same active schedule drives crowd destinations, customer waves and these pulses.
    for (const spot of state.hotspotSchedule?.active ?? map.district?.sites.hotspots ?? []) {
      const point = project(spot); if (!point.inside) continue;
      context.beginPath(); context.arc(point.x, point.y, 6 + pulse * 5, 0, Math.PI * 2);
      context.fillStyle = `rgba(16,185,129,${0.12 + pulse * 0.12})`; context.fill();
      context.strokeStyle = '#15803d'; context.lineWidth = 1; context.stroke();
    }
    for (const angry of state.angryPeds ?? []) {
      const point = project(angry); if (!point.inside) continue;
      context.beginPath(); context.arc(point.x, point.y, 12 * scale, 0, Math.PI * 2);
      context.fillStyle = '#ef444444'; context.fill();
    }
    const dot = (point: RadarPoint, color: string, radius: number) => {
      const position = project(point); if (!position.inside) return;
      context.beginPath(); context.arc(position.x, position.y, radius, 0, Math.PI * 2);
      context.fillStyle = color; context.fill();
      context.strokeStyle = '#1f3630'; context.lineWidth = 0.6; context.stroke();
    };
    for (const point of state.radar?.people ?? []) dot(point, '#eee9d9', 1.5);
    for (const vehicle of state.radar?.vehicles ?? []) {
      const point = project(vehicle); if (!point.inside) continue;
      context.save(); context.translate(point.x, point.y); context.rotate((vehicle.heading ?? 0) - heading);
      context.fillStyle = '#334155'; context.fillRect(-1.7, -3, 3.4, 6); context.restore();
    }
    for (const police of state.radar?.police ?? []) {
      const raw = project(police), point = radarEdge(raw);
      if (!raw.inside && !state.alert) continue;
      if (raw.inside && police.vision) {
        const direction = (police.heading ?? 0) - heading - Math.PI / 2;
        const halfAngle = police.visionHalfAngle ?? Math.PI / 5;
        context.beginPath(); context.moveTo(raw.x, raw.y);
        context.arc(raw.x, raw.y, police.vision * scale, direction - halfAngle, direction + halfAngle);
        context.closePath(); context.fillStyle = '#dc262626'; context.fill();
      }
      context.beginPath(); context.arc(point.x, point.y, 3.5 + (state.alert ? pulse : 0), 0, Math.PI * 2);
      context.fillStyle = '#dc2626'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 1; context.stroke();
    }
    if (state.radar?.opponent) dot(state.radar.opponent, '#f59e0b', 4);
    for (const poi of radarPois(pois, player)) {
      const point = radarEdge(project(poi));
      context.fillStyle = poi.kind === 'H' ? '#b91c1c' : poi.kind === 'A' ? '#166534' : poi.kind === 'M' ? '#1d4ed8' : '#854d0e';
      context.fillRect(point.x - 7, point.y - 7, 14, 14);
      context.strokeStyle = '#ffffff'; context.lineWidth = 1; context.strokeRect(point.x - 7, point.y - 7, 14, 14);
      context.fillStyle = '#fff'; context.font = 'bold 11px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(poi.kind, point.x, point.y + 0.5);
    }
    // Player stays centered and faces up while the street map turns beneath it.
    context.beginPath(); context.moveTo(0, -7); context.lineTo(-5, 5); context.lineTo(0, 3); context.lineTo(5, 5); context.closePath();
    context.fillStyle = '#fbbf24'; context.fill(); context.strokeStyle = '#fff'; context.lineWidth = 1.5; context.stroke();
    context.restore();
    context.beginPath(); context.arc(SIZE / 2, SIZE / 2, R, 0, Math.PI * 2);
    context.strokeStyle = '#77a79b'; context.lineWidth = 2; context.stroke();
    const north = radarEdge(radarPosition({ x: player.x, z: player.z - RADAR_RANGE }, player, heading), R + 4);
    context.fillStyle = '#fff'; context.font = 'bold 10px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.strokeStyle = '#0f2422'; context.lineWidth = 3;
    context.strokeText('N', SIZE / 2 + north.x, SIZE / 2 + north.y); context.fillText('N', SIZE / 2 + north.x, SIZE / 2 + north.y);
  }, [state, map, pois]);

  return <div className="shrink-0 rounded-2xl border border-teal-600/40 bg-black/70 p-1 shadow-xl pointer-events-auto">
    <canvas ref={canvasRef} width={SIZE * 2} height={SIZE * 2} role="img"
      aria-label={`${map.district?.name ?? 'City'} heading-up radar, ${RADAR_RANGE} metre radius`}
      className="h-28 w-28 sm:h-36 sm:w-36 md:h-40 md:w-40 [@media(max-height:500px)]:h-20 [@media(max-height:500px)]:w-20" />
    <div className="text-center text-[9px] font-semibold text-teal-100">{map.district?.name ?? 'City'} · {RADAR_RANGE}m</div>
    <details className="relative max-w-[100px] text-center text-[8px] text-teal-100 sm:max-w-[160px]">
      <summary className="cursor-pointer py-0.5">চিহ্ন · Map key</summary>
      <div className="absolute bottom-0 left-full z-30 ml-3 w-48 space-y-1 rounded-xl border border-teal-600 bg-[#0f2422] p-3 text-left text-[10px] shadow-xl">
      <p>● People · ▰ Cars · <span className="text-red-300">● Police / range</span></p>
      <p>{vendor ? 'G Garage · A Aarot' : 'H Hospital'} · M Market</p>
      <p>Green pulse: hotspot · Red area: angry crowd</p>
      <p>Police wedge: facing. Ring: detection radius.</p>
      <p>Edge letters show the nearest service bearing.</p>
      </div>
    </details>
    <div className="max-w-[100px] text-center text-[7px] leading-tight text-gray-300 sm:max-w-[160px]">© OpenStreetMap contributors</div>
  </div>;
}
