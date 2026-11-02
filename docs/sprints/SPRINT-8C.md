# Sprint 8C — marking and street finish

Built against `32aae00` on 2026-11-02. The remaining Sprint 8 implementation is complete and ready for manual upload. Close/archive Sprint 8 after this upload is verified against GitHub.

## Change

- Worn edges and sparse flakes on existing lane and crossing paint; solid stripe centres preserve readability. Paint is matte and keeps the original marking geometry and position.
- Up to 120 flush drain grates per district, aligned with roads and placed on the actual clipped OSM footpath polygons. Nine footprint samples per cover must be on paving and outside carriageways. Placement is deterministic, at least 16 m apart and at least 8 m from spawn/service entrances.
- Road-facing storefront fascia bands and shop division trim, plus one narrow rain-pipe strip per signed facade. Trim is merged into the existing concrete wall buffers and uses vertex colours. It introduces no collision bodies or individual detail meshes.
- Drain plates/bars reuse the existing instanced marking geometry/material, with per-instance colours. New batches are created only when a drain occupies a chunk that previously had no markings. Existing sign batching is retained.

Files: `src/game/render/streetDetails.ts` (`collectDrainGrates`, `createStreetPaint`) and the markings/building slices of `src/game/map/districtWorld.ts`. No map data, gameplay, multiplayer, package dependency or workflow changes.

## Checks

- `npm run lint`: PASS (`tsc --noEmit`).
- `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build`: PASS; existing large-bundle warning remains.
- `git diff --check`: PASS.
- Headless Chromium / SwiftShader: old/new real district scenes rendered with zero page/console or shader errors. Visual checks covered drain covers, facade trim and zebra paint on both maps.
- Collision obstacle lists match exactly. Original building/window/shutter/tank/marking/sign counts match. Drain placement repeated identically. Road audits returned zero warnings; facade trim vertices also produced zero carriageway hits with the existing 0.25 m audit margin.
- Vendor/police service-mode switching was exercised; each map retains 5 garages and 6 aarots.

| Measure | New Market | Gulistan |
| --- | ---: | ---: |
| Drain grates | 120 | 120 |
| Facade bands / pipe strips | 821 / 140 | 782 / 140 |
| Sign batches, unchanged | 72 | 60 |
| Whole-district mesh count, before / after | 1,450 / 1,482 | 1,392 / 1,412 |
| Whole-district triangles, before / after | 517,814 / 524,010 | 636,966 / 643,018 |
| Draw calls in sampled drain view, before / after | 219 / 223 | 168 / 170 |
| Road-audit warnings / trim road hits | 0 / 0 | 0 / 0 |

Render comparison used 960x540, one fixed drain view per district, 170 m chunk visibility, simple identical lighting and no shadow pass. Added geometry is about 1.2% / 1.0%. These are sampled draw-call/geometry measurements, not a 60 fps guarantee. Live-game checks on the user's GPU remain useful, especially at high visibility distances.

## Upload

Let AI Studio finish and push its concurrent multiplayer task first. Extract the archive and upload `src` and `docs` at the repository root, preserving:

- `src/game/render/streetDetails.ts` (new)
- `src/game/map/districtWorld.ts` (replace)
- `docs/map/PRODUCT.md` (replace)
- `docs/map/HOTSPOTS.md` (replace)
- `docs/sprints/ACTIVE.md` (replace)
- `docs/sprints/SPRINT-8B.md` (replace: records the verified upload)
- `docs/sprints/SPRINT-8C.md` (new)

No `server.ts`, `src/App.tsx`, or `src/game/simulation.ts` is included. If any destination file changes after `32aae00`, merge that change before uploading. Refresh AI Studio from GitHub after this upload and before its next edit/push. Do not upload the ZIP itself as a game asset.

## Sprint completion

8A covers shared shop-sign atlases and merged sign meshes. 8B covers matte road repairs/cracks, pavement wear and plaster streaks. 8C covers painted-marking refinements and authored footpath/facade detail. After 8C is uploaded and verified, move the Sprint 8 row verbatim to its archive and add one line in INDEX.md, following AGENTS.md. Sprint 9 (rigged CC0 characters) is the next graphics sprint; this package does not implement character replacement or certify Sprint 7.6 multiplayer completion.
