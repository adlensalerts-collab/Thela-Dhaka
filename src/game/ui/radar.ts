export interface RadarPoint { x: number; z: number }
export interface RadarActor extends RadarPoint { heading?: number; vision?: number; visionHalfAngle?: number }
export interface RadarSnapshot {
  people: RadarPoint[];
  vehicles: RadarActor[];
  police: RadarActor[];
  opponent?: RadarPoint;
}
export interface RadarPoi extends RadarPoint { kind: 'G' | 'A' | 'H' | 'M' }
export const RADAR_RANGE = 90;
export const RADAR_SIZE = 200;
export const RADAR_RADIUS = 92;

/** Heading 0 faces north (-Z). The player's heading always points up on the radar. */
export function radarPosition(point: RadarPoint, player: RadarPoint, heading: number,
  range = RADAR_RANGE, radius = RADAR_RADIUS) {
  const dx = point.x - player.x, dz = point.z - player.z;
  const x = (dx * Math.cos(heading) + dz * Math.sin(heading)) * radius / range;
  const y = (-dx * Math.sin(heading) + dz * Math.cos(heading)) * radius / range;
  return { x, y, inside: Math.hypot(x, y) <= radius };
}

export function radarEdge(point: { x: number; y: number }, radius = RADAR_RADIUS - 10) {
  const distance = Math.hypot(point.x, point.y);
  const scale = distance > radius ? radius / distance : 1;
  return { x: point.x * scale, y: point.y * scale, edge: distance > radius };
}

/** Bound HUD payloads independently of the full crowd/traffic pool. */
export function nearbyRadarPoints<T extends RadarPoint>(points: readonly T[], player: RadarPoint,
  limit: number, range = RADAR_RANGE): T[] {
  return points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z) &&
    Math.hypot(point.x - player.x, point.z - player.z) <= range)
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))
    .slice(0, Math.max(0, limit));
}

/** Show nearby services, plus one bearing to the nearest off-screen service of each kind. */
export function radarPois(points: readonly RadarPoi[], player: RadarPoint, range = RADAR_RANGE) {
  const visible = points.filter((point) => Math.hypot(point.x - player.x, point.z - player.z) <= range);
  for (const kind of ['G', 'A', 'H', 'M'] as const) {
    if (visible.some((point) => point.kind === kind)) continue;
    const nearest = points.filter((point) => point.kind === kind).sort((a, b) =>
      Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
    if (nearest) visible.push(nearest);
  }
  return visible;
}
