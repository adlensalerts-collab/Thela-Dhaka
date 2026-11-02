# Operations

Names only — never copy values from `.env*` files or tokens into docs or prompts.

## Commands
| Task | Command | Notes |
|---|---|---|
| Dev server (game + multiplayer) | `npm run dev` | `tsx server.ts`: Express + Vite middleware + Socket.io on port 3000 |
| Type check ("lint") | `npm run lint` | `tsc --noEmit`. **The only real error check** — `vite build` does not type-check |
| Production build | `npm run build` | `vite build` → `dist/` |
| Production server | `NODE_ENV=production tsx server.ts` | Serves `dist/` + Socket.io (for Sprint 7.7 hosting) |

## Environment variables (names only)
| Name | Where | Effect |
|---|---|---|
| `GITHUB_PAGES` | build (`vite.config.ts`) | `'true'` → base path `/Thela-Dhaka/` |
| `VITE_STATIC_HOST` | build (`src/App.tsx`) | `'true'` → no game server: online buttons show the "play Solo" message |
| `VITE_SERVER_URL` | build (`src/App.tsx`) | Address of a hosted multiplayer server; enables online play on static hosting |
| `NODE_ENV` | `server.ts` | `production` → serve `dist/` instead of Vite middleware |
| `DISABLE_HMR` | `vite.config.ts` | AI Studio dev-server setting |

## Deploy (GitHub Pages)
- Workflow: `.github/workflows/deploy-pages.yml` (never edited by AI Studio). Every push to `main` builds with `GITHUB_PAGES=true` + `VITE_STATIC_HOST=true` and deploys `dist/`.
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
