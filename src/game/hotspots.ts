import { crowdPeriod, hotspotWeight } from './crowd/crowdSchedule';

export interface HotspotSite { x: number; z: number; kind: string; name: string }
export interface ActiveHotspot extends HotspotSite { weight: number }
export type HotspotPeriod = ReturnType<typeof crowdPeriod> | 'closed' | 'legacy';
export interface HotspotSchedule {
  readonly period: HotspotPeriod;
  readonly label: string;
  readonly endsAt: string;
  readonly waveSize: number;
  readonly cooldownSeconds: number;
  readonly active: readonly ActiveHotspot[];
}

const MARKETS = new Set(['marketplace', 'mall', 'department_store', 'market']);
const SCHOOLS = new Set(['school', 'college', 'university']);
const COMMUTE = new Set(['junction', 'bus_stop', 'bus_station']);

export function hotspotPeriod(minutes: number): HotspotPeriod {
  if (!Number.isFinite(minutes)) return 'legacy';
  if (minutes < 360 || minutes >= 1320) return 'closed';
  return crowdPeriod(minutes);
}

/** One source for crowd destinations, vendor customer waves, HUD and radar. */
export function scheduleHotspots(sites: readonly HotspotSite[], minutes: number): HotspotSchedule {
  const period = hotspotPeriod(minutes);
  const settings: Record<HotspotPeriod, { label: string; endsAt: string; waveSize: number; cooldownSeconds: number }> = {
    early: { label: 'দিনের শুরু · Early morning', endsAt: '08:00', waveSize: 0, cooldownSeconds: 18 },
    office_rush: { label: 'অফিসের ব্যস্ততা · Office rush', endsAt: '10:00', waveSize: 3, cooldownSeconds: 18 },
    bazaar: { label: 'বাজারের সময় · Bazaar hour', endsAt: '13:00', waveSize: 4, cooldownSeconds: 14 },
    school_release: { label: 'ছুটির সময় · School release', endsAt: '14:00', waveSize: 3, cooldownSeconds: 16 },
    afternoon: { label: 'শান্ত বিকেল · Quiet hours', endsAt: minutes < 660 ? '11:00' : '17:00', waveSize: 0, cooldownSeconds: 18 },
    evening_market: { label: 'সন্ধ্যার বাজার · Evening market', endsAt: '20:00', waveSize: 4, cooldownSeconds: 14 },
    night: { label: 'রাতের বাজার · Night market', endsAt: '22:00', waveSize: 2, cooldownSeconds: 26 },
    closed: { label: 'দিন শেষ · Closed', endsAt: '22:00', waveSize: 0, cooldownSeconds: 18 },
    legacy: { label: 'ব্যস্ত এলাকা · Busy area', endsAt: '', waveSize: 3, cooldownSeconds: 18 },
  };
  const eligible = (kind: string) => {
    if (period === 'legacy') return true;
    if (period === 'office_rush') return COMMUTE.has(kind);
    if (period === 'bazaar' || period === 'night') return MARKETS.has(kind);
    if (period === 'school_release') return SCHOOLS.has(kind) || MARKETS.has(kind);
    if (period === 'evening_market') return MARKETS.has(kind) || COMMUTE.has(kind) || kind === 'stadium';
    return false;
  };
  const active = sites.filter((site) => eligible(site.kind)).map((site) => Object.freeze({
    ...site, weight: period === 'legacy' ? 1 : COMMUTE.has(site.kind) && period === 'office_rush'
      ? 2.6 : hotspotWeight(site.kind, minutes),
  }));
  return Object.freeze({ period, ...settings[period], active: Object.freeze(active) });
}

export function nearbyHotspot(sites: readonly ActiveHotspot[], x: number, z: number, radius = 30) {
  let best: ActiveHotspot | null = null, distance = Infinity;
  for (const site of sites) {
    const d = Math.hypot(site.x - x, site.z - z);
    if (d <= radius && (d < distance || (d === distance && site.weight > (best?.weight ?? 0)))) {
      best = site; distance = d;
    }
  }
  return best;
}
