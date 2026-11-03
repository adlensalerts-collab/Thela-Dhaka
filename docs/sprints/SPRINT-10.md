# Sprint 10 — NPC behaviour (built by Claude, 2026-11-03)

Built against `46f3ff2`. Touches only crowd files; `simulation.ts` belongs to Codex during G3, so the
engine hooks below are applied in Codex's G3 push (or by Claude right after it).

## Files
| File | What |
|---|---|
| `src/game/pedestrians.ts` | Crowd AI: activities (chat groups, phone calls/texting, stall browsing, watching), kerb crossings, haggling, time-of-day density, streaming around the camera, near/far detail. Rage meter now created on demand; the people health strip was removed (non-graphic rule) |
| `src/game/crowd/crowdSchedule.ts` | Pure time-of-day rules: active share of the pool, hotspot pull by kind, hotspot trip chance |
| `src/game/crowd/crowdImpostors.ts` | Far crowd as 3 instanced meshes (legs, clothed upper body, head) |
| `src/game/map/footpathGraph.ts` | **Fix:** footpath network was falling apart (run ends before gaps never recorded, corners never joined) and only the largest piece was kept. Now: both run ends recorded, corners within 4 m joined, stray pieces joined by ≤ 30 m crossings, and no node or link may enter a building footprint (0.3 m sampling) |
| `scripts/crowd.test.ts` | Crowd checks on the real New Market graph |

## New PedestrianManager API (engine hooks)
- `updateDetail(camX, camZ, nearBudget, viewDistance)` — call every frame after `update()`; **replaces** the engine's "hide beyond 90 m" loop. Also feeds crowd streaming.
- `setTimeOfDay(minutes)` — solo vendor: day-clock minutes; other modes: `NaN` (density stays 100%).
- `setRoadProbes({ isOnCarriageway, vehicleNear })` — kerb waiting at crossings.
- `setBrowsePoints(points)` — stall fronts to browse.
- `notifyEvent('horn' | 'accident', x, z)` — glance / onlookers. Horn waits for Sprint 11a sounds.
- `crowdStats`, `dispose()`. `setHotspots` now also accepts `kind`.

## Engine hooks for `src/game/simulation.ts` (tested locally by Claude)
1. `PEDESTRIANS_BY_QUALITY = { low: 60, medium: 80, high: 100, ultra: 120 }` and add
   `NEAR_PEDESTRIANS_BY_QUALITY = { low: 10, medium: 16, high: 22, ultra: 28 }`.
2. Import `getDayClockMinutes` from `./day`.
3. Add method:
   ```ts
   private wireCrowd(crowd: PedestrianManager, world: DistrictWorld, traffic: GraphTraffic | null | undefined) {
     crowd.setBrowsePoints(world.district.sites.stalls.map((s) => ({
       x: s.entrance?.[0] ?? s.x, z: s.entrance?.[1] ?? s.z,
       fx: -(s.front?.[0] ?? 0), fz: -(s.front?.[1] ?? 1)
     })));
     crowd.setRoadProbes({
       isOnCarriageway: (x, z) => world.roads.isOnCarriageway(x, z),
       vehicleNear: (x, z, r) => !!traffic && traffic.vehicles.some((v) =>
         Math.abs(v.mesh.position.x - x) < r && Math.abs(v.mesh.position.z - z) < r &&
         Math.hypot(v.mesh.position.x - x, v.mesh.position.z - z) < r)
     });
   }
   ```
   Call it after `setHotspots` in `initWorld()` (`this.wireCrowd(this.pedestrianManager, this.world, this.graphTraffic)`)
   and in `switchDistrict()` (`this.wireCrowd(pedestrians, world, traffic)`).
4. In `// Update A* Sidewalk Pedestrian crowd`, replace the `ped.mesh.visible = … < PEDESTRIAN_VIEW_DISTANCE` loop with:
   ```ts
   this.pedestrianManager.setTimeOfDay(this.state.mode === 'vendor' ? getDayClockMinutes(this.state.dayElapsedSeconds) : Number.NaN);
   const cam = this.camera.position;
   this.pedestrianManager.updateDetail(cam.x, cam.z, NEAR_PEDESTRIANS_BY_QUALITY[this.qualityLevel] ?? 16, PEDESTRIAN_VIEW_DISTANCE);
   ```
5. In `// Dynamic Traffic collision`, inside `if (added > 0) {` add
   `this.pedestrianManager?.notifyEvent('accident', p.position.x, p.position.z);`

## Verification (Claude, 2026-11-03)
- `npm run lint`, normal and Pages builds pass. Tests: `npx -y vite-node@3 scripts/crowd.test.ts` (4 pass). Plain `tsx --test` can't load it: character files use Vite's `import.meta.env`.
- Footpath network: New Market 143 → 2,279 nodes, Gulistan 296 → 2,604; hotspots with a footpath within 40 m: 2/12 → 10/12 and 0/11 → 8/11; nodes inside buildings 0; links clipping a building at 0.3 m sampling: 1 (New Market, same as before) / 0. Build 0.2–0.3 s once per district; A* ~0.5 ms.
- 120 people, 4 game minutes: chat groups, phone use, stall browsing, kerb waiting (134 samples), accident onlookers; 0% of people standing on a carriageway; near tier ≤ budget; every far person drawn. Density 45 active at 06:00 → 100 at noon, all changes out of sight.
- Headless Chromium with the hooks (Low): ~50 people in view at 14:00 (10 rigs + 39 instanced), 220–300 draw calls, one impostor group after New Market → Gulistan → New Market, 0 `[layout]` warnings, 0 page/console errors.
- Not covered: real-GPU frame rate, a full 12-minute manual play, women's outfits (none exist in `humans.ts` yet — follow-up).
