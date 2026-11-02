import type { District, DistrictId } from './district';
import newmarket from './data/newmarket.json';
import gulistan from './data/gulistan.json';

/**
 * M-W — district maps bundled into the game (no network fetch, works offline and on GitHub Pages,
 * and the world can be built synchronously at startup). Map data © OpenStreetMap contributors (ODbL).
 */
const DATA: Record<DistrictId, District> = {
  newmarket: newmarket as unknown as District,
  gulistan: gulistan as unknown as District
};

export function getDistrict(id: DistrictId): District {
  return DATA[id];
}
