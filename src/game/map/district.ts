/**
 * M1/M6 — district map data (produced offline by tools/osm2district.py from an OpenStreetMap export).
 * 1 unit = 1 m. x = east, z = south (north = -Z). Map data © OpenStreetMap contributors (ODbL).
 */
export type XZ = [number, number];

export interface DistrictRoad {
  id: string; name: string; nameBn: string; class: string;
  width: number;        // carriageway width (m)
  footpath: number;     // footpath width each side (m)
  oneway: boolean;
  traffic: boolean;     // false = not connected to the main network (visible, no vehicles)
  nodes: string[];      // OSM node id per point (shared ids = junctions)
  points: XZ[];
}
export interface SurfacePolygon { outer: XZ[]; holes: XZ[][] }
export interface DistrictBuilding {
  id: string; name: string; kind: string;
  levels: number | null; height: number | null;
  footprint: XZ[]; area: number;
}
export interface DistrictLandmark { name: string; nameBn: string; kind: string; x: number; z: number }
export interface ServiceSite {
  kind: 'garage' | 'aarot' | 'stall';
  x: number; z: number;
  front: XZ;            // unit vector the open front faces (toward the road)
  width: number; depth: number;
  entrance: XZ;         // ring position on the footpath
  road: string;
}
export interface District {
  id: string; name: string; version: number; attribution: string;
  origin: { lat: number; lon: number };
  bounds: { halfWidth: number; halfDepth: number };
  roads: DistrictRoad[];
  junctions: Array<{ id: string; x: number; z: number }>;
  footpaths: Array<{ id: string; points: XZ[] }>;
  buildings: DistrictBuilding[];
  landmarks: DistrictLandmark[];
  surfaces: { carriageway: SurfacePolygon[]; footpath: SurfacePolygon[] };
  markings: { dashes: Array<[number, number, number, number]>; zebras: Array<{ x: number; z: number; angle: number; width: number; depth: number }> };
  sites: {
    trees: XZ[];
    poles: Array<[number, number, number]>;   // x, z, rotationY (crossbar points over the road)
    stalls: ServiceSite[]; garages: ServiceSite[]; aarots: ServiceSite[];
    hotspots: Array<{ x: number; z: number; name: string; kind: string }>;
    spawn: XZ | null;
  };
  fixes?: Record<string, unknown>;
}

export type DistrictId = 'newmarket' | 'gulistan';

/** M6 — which district each level is played in (game-design §2). */
export const DISTRICTS: Record<DistrictId, { name: string; nameBn: string; levels: [number, number] }> = {
  newmarket: { name: 'New Market', nameBn: 'নিউ মার্কেট', levels: [1, 5] },
  gulistan: { name: 'Gulistan', nameBn: 'গুলিস্তান', levels: [6, 10] }
};

export function districtForLevel(level: number): DistrictId {
  return level >= DISTRICTS.gulistan.levels[0] ? 'gulistan' : 'newmarket';
}

const cache = new Map<DistrictId, Promise<District>>();

/** Loads public/maps/<id>.json once (works on GitHub Pages via BASE_URL). */
export function loadDistrict(id: DistrictId): Promise<District> {
  if (!cache.has(id)) {
    const base = (import.meta as any).env?.BASE_URL ?? '/';
    cache.set(id, fetch(`${base}maps/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`District map ${id} not found (${r.status})`);
      return r.json() as Promise<District>;
    }));
  }
  return cache.get(id)!;
}
