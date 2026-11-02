# Sprint 8B — matte surface wear

Built against `a3235b5` on 2026-11-02. Ready for manual upload. Sprint 8 remains in progress.

## Change

`src/game/render/surfaceWear.ts` adds sparse repair patches with tar seams and hairline cracks to asphalt, stains and occasional cracks to pavement, and rain streaks to plaster walls. `pbrMaterial` attaches the effect to these three surfaces. Masks use world coordinates so road-polygon and chunk boundaries do not interrupt them. Normal and roughness maps, real photo textures, existing colours and lighting are retained. Asphalt roughness has a 0.88 minimum to preserve the matte-road fix.

These are material effects, with no new scene objects, collision bodies, textures, downloads or runtime dependencies. World and instance matrices are included in the shader position calculation. The effect also applies to these materials in the grid fallback. No gameplay, multiplayer, map data or workflow file changes are included.

## Checks

- `npm run lint`: PASS.
- `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build`: PASS; existing large-bundle warning remains.
- `git diff --check`: PASS.
- Headless Chromium / SwiftShader at 960x540: before/after material panels rendered with zero shader errors and zero page/console errors. Tested asphalt, pavement and plaster on ordinary meshes and instanced boxes, including actual pavement photo textures.
- Panel draw calls: 6 before / 6 after. Material texture count: 9 before / 9 after. 19,518 pixels visibly changed in the sampled view. This confirms the material effect runs; it is not an FPS benchmark.
- Both districts constructed: zero road-audit warnings, 5 garages / 6 aarots, and 140 signboards each. Sprint 8A sign batches remain 72 in New Market and 60 in Gulistan.
- Visual comparison checked for dark matte repairs, subtle pavement cracks and wall streaks. Full live-game, low-end GPU and all-weather performance checks still need the user's browser. Shader work increases even though geometry, draw calls and texture allocations do not.

## Upload

Run the concurrent multiplayer room-lifecycle task and let AI Studio push first. Then extract the ZIP and upload `src` and `docs` at the repository root, preserving these paths:

- `src/game/render/surfaceWear.ts` (new)
- `src/game/render/pbr.ts` (replace)
- `docs/map/PRODUCT.md` (replace)
- `docs/map/HOTSPOTS.md` (replace)
- `docs/sprints/ACTIVE.md` (replace)
- `docs/sprints/SPRINT-8A.md` (replace: records the verified upload)
- `docs/sprints/SPRINT-8B.md` (new)

If any destination file has changed since `a3235b5`, merge those changes rather than blindly replacing it. The concurrent AI Studio task should touch only `server.ts` and `src/App.tsx`. Refresh AI Studio from GitHub after this upload and before its next edit or push. Do not upload the ZIP itself.

## Remaining work

Painted-marking refinements and further authored footpath/building detail are still open. This package does not close Sprint 8 or verify the remaining Sprint 7.6 room lifecycle/rematch behaviour.
