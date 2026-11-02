# Hotspots — files too big to read whole

Find the region with `grep -n "<anchor>" <file>`, then read a slice (`sed -n 'START,ENDp'`). Anchors, never line numbers: line numbers change on every push.

## `src/game/simulation.ts` (~85 KB, ~21k tokens)
| Region | Anchor |
|---|---|
| Real-map switch + tuning constants (NPC counts, hotspot timing) | `export const USE_REAL_MAP` |
| Game state shape | `export interface GameState` |
| Initial state values | `getInitialState(` |
| World build (real map branch, grid fallback, carts, pedestrians) | `  initWorld() {` |
| Quality → shadows, chunk view distance, pixel ratio | `  applyQuality(level` · `updatePixelRatio(` |
| Hotspot customers | `  updateHotspotCrowd(` |
| Helpers: obstacles near point, bounds, services, footpath placement | `  nearObstacles(` · `  mapBound(` · `  nearestGarageInfo(` · `  footpathPoint(` |
| Input listeners / key handling | `  initListeners() {` |
| Mode start + spawn positions + police service mode | `  setMode(mode` |
| Selling | `  beginSale() {` · `  completeSale() {` |
| Upgrades (garage-only) | `atGarageForUpgrade(` · `  upgradeCart() {` · `  upgradeStamina() {` |
| Restock / stall | `  restockCart() {` · `  placeStall() {` |
| Arrest, bribe, jail, run end | `  arrestVendor() {` · `  payBribe()` · `  goToJail()` · `  endRun(` |
| Action dispatch (incl. repair/treatment) | `  handleAction(action` |
| Per-frame simulation | `  simulate(dt` — regions inside by comment: `// Vehicle (tank-style) movement` · `// Dynamic Traffic collision` · `// AI Police pursuit` · `// Update A* Sidewalk Pedestrian crowd` · `// Sale timer check` · `// Traffic motion` · `// Timed garage repair check` · `// Timed aarot restock check` · `// Sync damage, garage & aarot proximity` |
| Skeletal gait hooks (vendor, officer, NPC vendor) | `// Update walk cycles & limb poses` |
| Near-crowd skeletal detail budget | `this.crowdCharacters.update(` |
| Character resource cleanup | `  stop() {` |
| Render loop, frame limiter, chunk update | `  renderLoop() {` |

## `src/components/GameHUD.tsx` (~31 KB)
| Region | Anchor |
|---|---|
| Minimap background + blips | `minimapRef = useRef` · `// Update blips on minimap` |
| Top stats bar (wallet, level, stock, life, damage, stamina, sales) | `{/* Top Header Bar */}` |
| Weather / sound / heat stars / settings / pause | `{/* Top Right:` |
| Notice popup | `{/* Top-Centre Notice Popup */}` |
| Hotspot badge | `{/* Hotspot indicator` |
| Bottom button bar (vendor, then police branch) | `{/* Bottom HUD Bar & Controls */}` · police: `Attempt Arrest` |

## `src/game/pedestrians.ts` (~26 KB)
| Region | Anchor |
|---|---|
| NPC fields (incl. `summonUntil`) | `export interface PedestrianNPC` |
| Pool size, hotspot destinations | `  constructor(` · `  setHotspots(` · `pickDestination(` |
| Per-frame update (knockback, rage, browsing, idle, walking) | `  update(` |
| Hotspot customers | `  summonCustomers(` · `  releaseSummoned()` |
| Nearest customer for a sale | `  getNearestPedestrian(` |

## `src/game/audio/ambient.ts` (~26 KB)
| Region | Anchor |
|---|---|
| Real-map zones + road distance | `  setDistrict(` |
| Old grid zones (fallback) | `HIGH_ACTIVITY_URBAN_ZONES` |
| Per-tick mixing | `computeZoneInfluence(` · `minRoadDist` |

## `src/game/map/districtWorld.ts` (~25 KB)
| Region | Anchor |
|---|---|
| Roads + raised footpaths | `// ---- Roads` |
| Markings (dashes, zebras) | `// ---- Markings` |
| Flush drain covers (reuse marking instances) | `// ---- Flush footpath drains` |
| Storefront bands, jambs, rain pipes (merged into walls) | `// ---- Storefront trim` · `// One narrow rain pipe` |
| Buildings from footprints (walls, windows, shutters, signs, roofs) | `// ---- Buildings from real footprints` |
| Shared shop-sign collection + flush | `const signboards = new SignboardBatch()` · `signboards.add(` · `const signStats = signboards.build()` |
| Trees, poles | `// ---- Trees, poles` |
| Garages / aarots placed to face their road | `// ---- Service lots` |
| Stalls | `// ---- Footpath stalls` |
| Police mode (hospitals, aarots closed) | `export function setServiceMode(` |

## Never read whole
`src/game/map/data/newmarket.json`, `gulistan.json` (~300 KB each). To inspect: `python3 -c "import json;d=json.load(open('src/game/map/data/newmarket.json'));print(d['sites'].keys())"`.

## Surface finish (Sprint 8B)
- `src/game/render/pbr.ts`: `export function pbrMaterial(` calls `applySurfaceWear` for asphalt, pavement and plaster.
- `src/game/render/surfaceWear.ts`: `export function applySurfaceWear(`; masks are `ROAD`, `PAVEMENT`, `PLASTER`.

## Skeletal characters (Sprint 9)
- `src/game/world/animatedCharacter.ts`: `export async function loadAnimatedCharacter(` loads/clones the local GLB; `setMotion`, `update`, `dispose` control each independent actor.
- `src/dev/characterPreview.ts`: `async function start()` owns the separate preview; clothed-role gallery and vendor cart-grip toggle.
- `src/game/world/humans.ts`: `export function createHumanRig(` and `export function animateHuman(` retain the legacy controls and now attach/drive the independent skeletal visual; compact crowd controls remain available.

- `src/game/world/characterAppearance.ts`: `export function buildCharacterAppearance(` builds one clothed skinned mesh using the pinned rig.
- `src/game/world/characterIK.ts`: `export function fitCharacterHands(` solves both cart grips in world space.
- `src/game/world/characterVisual.ts`: `export class CharacterVisual` owns asynchronous fallback/lifecycle; `export class CrowdCharacterLOD` limits detailed crowd instances by quality.
