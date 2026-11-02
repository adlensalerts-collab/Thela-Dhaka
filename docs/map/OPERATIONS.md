# Operations

Names only — never copy values from `.env*` files or tokens into docs or prompts.

## Commands
| Task | Command | Notes |
|---|---|---|
| Dev server (game + multiplayer) | `npm run dev` | `tsx server.ts`: Express + Vite middleware + Socket.io on `PORT` (default `3000`) |
| Type check ("lint") | `npm run lint` | `tsc --noEmit`. **The only real error check** — `vite build` does not type-check |
| Production build (full service, base `/`) | `npm run build` | `vite build` → `dist/` (`index.html` + `character-preview.html`) |
| Production build (GitHub Pages, base `/Thela-Dhaka/`) | `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build` | Loads `.env.pages` for `VITE_SERVER_URL` unless overridden in shell env |
| Production server | `npm start` | `tsx server.ts --production`: serves `dist/`, `GET /healthz`, and `/socket.io/` without loading Vite/HMR; exits non-zero if `dist/index.html` is missing |

## Environment variables (names only)
| Name | Where | Effect |
|---|---|---|
| `PORT` | runtime (`server.ts`) | HTTP + Socket.io listen port (binds `0.0.0.0`, falls back to `3000` locally) |
| `NODE_ENV` | runtime (`server.ts`) | `production` (also set by `npm start` / `--production`) → serve `dist/` instead of Vite middleware |
| `ALLOWED_ORIGINS` | runtime (`server.ts`) | Comma-separated list of allowed browser `Origin` values for Socket.io CORS (`https://adlensalerts-collab.github.io` is always allowed) |
| `PUBLIC_ORIGIN` | runtime (`server.ts`) | Optional canonical origin of the hosted Node service itself (supplementing `RENDER_EXTERNAL_URL` / `APP_URL` and same-host checks) |
| `GITHUB_PAGES` | build (`vite.config.ts`) | `'true'` → base path `/Thela-Dhaka/` and loads `.env.pages` |
| `VITE_STATIC_HOST` | build (`src/App.tsx`) | `'true'` → static host mode; online play disabled unless `VITE_SERVER_URL` is non-empty |
| `VITE_SERVER_URL` | build (`src/App.tsx`, `.env.pages`) | Trimmed build-time URL of the hosted multiplayer backend; enables online play on GitHub Pages |
| `DISABLE_HMR` | dev (`vite.config.ts`, `server.ts`) | AI Studio dev-server setting |

## Production multiplayer hosting (Render — Sprint 7.7)
- **Provider & Blueprint:** `render.yaml` defines a single Render Node Web Service (`thela-dhaka-multiplayer`) on the `free` plan for multiplayer testing.
- **Node version & commands:** Node `>=20.0.0` (`NODE_VERSION=22` in `render.yaml`), install + build command `npm install --include=dev && npm run build` (base `/`, no GitHub Pages flags; `npm install --include=dev` is used because the repository has no `package-lock.json`), start command `npm start` (`tsx server.ts --production`; `tsx` is in `dependencies`).
- **Health check & lifecycle:** `GET /healthz` returns HTTP 200 JSON (`{ "status": "ok", "mode": "production" }`) before the SPA fallback. `server.ts` handles `SIGTERM` and `SIGINT` to close Socket.io and the HTTP server cleanly.
- **Single-instance & free-tier testing behaviour:** Rooms are stored in process memory (`rooms` Map in `server.ts`). Keep `numInstances: 1` — server restarts clear active rooms, and running multiple replicas would require shared-state infrastructure (such as a Redis adapter). On Render's `free` plan, the service sleeps after ~15 minutes of idle time, incurs a cold-start delay on the next request, and clears all active rooms on sleep or restart; upgrading to a paid plan (`starter`) remains a later option for always-on hosting.
- **Socket.io CORS allowlist:** `server.ts` validates browser `Origin` headers during Socket.io polling and WebSocket handshakes. It always allows `https://adlensalerts-collab.github.io`, same-host requests, loopback `http://localhost:<PORT>`, and any comma-separated origins in `ALLOWED_ORIGINS` (plus `PUBLIC_ORIGIN`, `RENDER_EXTERNAL_URL`, and `APP_URL`). Disallowed browser `Origin` headers receive HTTP 403. To allow an additional preview origin (such as an AI Studio preview URL), append it to `ALLOWED_ORIGINS`.

## Deploy (GitHub Pages) & connecting to the backend
- Workflow: `.github/workflows/deploy-pages.yml` (never edited by AI Studio). Every push to `main` runs `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build` and deploys `dist/`.
- Because `deploy-pages.yml` does not pass `VITE_SERVER_URL` from GitHub Actions variables, `vite.config.ts` loads `.env.pages` whenever `GITHUB_PAGES === 'true'` (while still letting an explicit shell `VITE_SERVER_URL` override it). Normal `npm run dev` and `npm run build` ignore `.env.pages`.
- **Connecting GitHub Pages after deploying the Node service:**
  1. Deploy the Node service using `render.yaml` (or the Render dashboard with the settings above) and verify `https://<your-service>.onrender.com/healthz` returns HTTP 200.
  2. Set `VITE_SERVER_URL=https://<your-service>.onrender.com` in `.env.pages` (no trailing slash) and push to `main`.
  3. Wait for `.github/workflows/deploy-pages.yml` to finish, then hard-refresh https://adlensalerts-collab.github.io/Thela-Dhaka/ and test Create Room / Join Room across two browser tabs.
  4. Until `.env.pages` has a non-empty `VITE_SERVER_URL`, GitHub Pages builds keep Solo playable and show the bilingual offline notice in Online mode.
- Settings → Pages → Source must be **GitHub Actions**.
- Live: https://adlensalerts-collab.github.io/Thela-Dhaka/ (hard refresh after a deploy).
- The deploy job still has a one-off "Cancel stuck Pages deployment" step (from the 2026-11-01 stuck deployment). Harmless; safe to delete.

## Getting code into the repo
- AI Studio pushes its workspace. Claude-built files are uploaded by Zunaid via GitHub → Add file → Upload files (drag folders to keep paths).
- **Stale-copy hazard:** after a manual upload, AI Studio's workspace must be refreshed from GitHub before its next push, or it overwrites the upload. Every sprint prompt starts with the stale-copy check in `AGENTS.md`.

## Real map pipeline (OpenStreetMap → game)
| Step | How |
|---|---|
| Export | openstreetmap.org → Export → box (≈1.2 km) → `.osm` file |
| Convert + crop | `python3 tools/osm2district.py export.osm <id> "<Name>" --crop LAT,LON,900 > out.json` (needs `shapely`) |
| Preview + validate | `python3 tools/preview_district.py out.json preview.png` → must print `ISSUES: none` |
| Install | Copy to `src/game/map/data/<id>.json` (bundled; ids: `newmarket`, `gulistan`) |
| Crops in use | New Market `23.73372,90.38452,900`; Gulistan (provisional, re-export pending) `23.72878,90.41246,900` |

The converter auto-fixes: trims buildings off roads/footpaths, resolves overlapping outlines, removes sliver spikes, marks disconnected roads no-traffic, and places 5 garages, 6 aarots, 10 stalls, trees, poles, hotspots and the spawn point deterministically (so multiplayer worlds match).

## Verifying a push (Claude)
```bash
git fetch -q origin && git log --oneline -5 && git diff --stat OLD origin/main   # scope first
git diff OLD origin/main -- path/to/file.ts                                       # the diff, not the file
npm run lint                                                                       # real type check
GITHUB_PAGES=true VITE_STATIC_HOST=true npx vite build                             # Pages build
```
Headless browser checks run at low quality (software rendering is ~1 fps); to test timing-based features, expose the engine in a test-only build and call `engine.simulate(1/60)` in a loop rather than waiting in real time.

## Skeletal characters, preview and asset preparation (Sprint 9)

- Vite builds two HTML entries: the existing `index.html` and the separate `character-preview.html`. The Pages base path is applied to both.
- Preview after deployment: `https://adlensalerts-collab.github.io/Thela-Dhaka/character-preview.html`. Local dev: `http://localhost:3000/character-preview.html`.
- The shared CC0 rig/clip GLB is bundled under `public/assets/characters/`; gameplay requests it once per page and clones independent actors. Procedural models remain visible while loading and on failure. No CDN or runtime asset credentials are needed.
- Rebuild the GLB from the pinned standard animation-library files in `public/assets/characters/CREDITS.md`: `python3 scripts/prepare-character.py /path/to/AnimationLibrary_Godot_Standard.gltf public/assets/characters/locomotion-prototype.glb`. The adjacent source `.bin` is required. The converter uses Python's standard library only.
- Source/model licence and checksums are recorded in `public/assets/characters/CREDITS.md`; retain `CC0-LICENSE.txt` with the derived asset.

- Runtime clothing/face/hair geometry is authored in `characterAppearance.ts`; the original asset and its checksum are unchanged. Vendor, police and civilian styles render as one skinned mesh each.
- Cart grip targets are local to the existing cart root: left/right X = -0.55/+0.55, Y = 1.05, Z = -0.48. `characterIK.ts` solves arms after each push-clip update; map positions/collision remain controlled by the engine.
- Detailed crowd budgets: Low 0, Medium 2 within 12 m, High 4 within 18 m, Ultra 6 within 22 m, measured from the camera. Hysteresis reduces switches; distant NPCs use the existing compact rig. These budgets do not change the existing 20–50 crowd population.
- `GameEngine.stop()` disposes hero and crowd skeletal visuals, including pending asynchronous loads. Cloth colours/accessories are resolved from the same appearance options used by the procedural fallback.
