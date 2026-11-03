# Thela Dhaka — agent guide

3D browser game: push a street vendor's thela (cart) through real Dhaka streets (New Market, Gulistan), sell, restock, repair, escape police. React + TypeScript + three.js, built with Vite. Solo vendor / solo police / 1v1 online (Socket.io, `server.ts`).

**Workflow:** Claude writes sprint prompts and verifies every push against the real code; Google AI Studio writes most code; Zunaid uploads Claude-built files to GitHub by hand.

## Hard rules
- **Read only what the task needs.** Start here → `docs/map/PRODUCT.md` → only the files a prompt lists. Big files: use the anchors in `docs/map/HOTSPOTS.md`, never read them whole.
- **Never read** `extracted_proto/`, `public/assets/aistudio/`, `src/game/map/data/*.json` (300 KB map data) or `tools/` unless the task is about them.
- **Never modify** `.github/` (GitHub Pages deploy workflow).
- **Stale-copy check first:** before editing, confirm `src/game/map/districtWorld.ts` exists and `simulation.ts` has `export const USE_REAL_MAP = true`. If not, stop: the workspace is out of date with GitHub.
- **Map data comes from OpenStreetMap only** (never Google Maps). Keep the credit "© OpenStreetMap contributors" on the title screen and minimap.
- **Nothing may stand on a road.** Real map: `auditDistrict()` logs `[layout] … is on a road` in dev; that log must stay empty.
- **Public rage is non-graphic:** no injuries, blood, beatings or health bars for people (`docs/game-design.md` §5).
- **Baper Rasta** (baperrasta.com) is a style reference only: copy none of its sounds, art or text. No newspaper-style game over.
- **Performance:** 1080p render cap; 60 fps target, up to 120 on 120 Hz screens. Crowd pedestrians use the compact rig (`compact: true`). Don't add per-object meshes where instancing works.
- **Renderer is WebGPURenderer** (WebGL 2 fallback; `three` is aliased to `three/webgpu`). Never add `WebGLRenderer`, `ShaderMaterial`, `RawShaderMaterial` or `onBeforeCompile` — they don't run. Custom shading goes in TSL (`three/tsl`) node properties (`colorNode`, `emissiveNode`, …); see `src/game/render/surfaceWear.ts`. Render through `engine.pipeline`, not `renderer.render()`.
- **Done means:** `npm run lint` passes (it's `tsc --noEmit`; the Vite build does NOT type-check).
- After a sprint lands, mark it in `docs/sprints/ACTIVE.md` (only if the prompt says so).

## Where to look
| Need | File |
|---|---|
| Which file owns a feature | `docs/map/PRODUCT.md` |
| Anchors inside files over ~20 KB | `docs/map/HOTSPOTS.md` |
| Build, deploy, env vars, map pipeline, testing | `docs/map/OPERATIONS.md` |
| Open and planned sprints | `docs/sprints/ACTIVE.md` |
| Closed sprints (verbatim history) | `docs/sprints/INDEX.md` → `docs/sprints/archive/` |
| Game rules: days, end conditions, economy, levels, public rage | `docs/game-design.md` |

## Keep the map true
- A push that adds/moves/removes a file the routers name → update that router row in the same change.
- A sprint closes → move its row verbatim into `docs/sprints/archive/`, one line in `INDEX.md`.
- New env var or build step → `docs/map/OPERATIONS.md`.
