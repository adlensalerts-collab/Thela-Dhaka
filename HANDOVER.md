# Thela Dhaka — Session Handover

Repo: `adlensalerts-collab/Thela-Dhaka` (branch `main`) · Live: https://adlensalerts-collab.github.io/Thela-Dhaka/
Start every session by reading this file, then `AGENTS.md` in the repo, then only what the task needs (`docs/map/*`, `docs/sprints/ACTIVE.md`).

## Role (binds every session)
- Claude plans sprints, writes AI Studio prompts, builds and tests modules when faster/safer, and **verifies every push against the real files** (clone, `git diff`, `npm run lint`, Pages build, targeted checks; never trust AI Studio's summary).
- AI Studio writes most code. Zunaid uploads Claude-built files to GitHub by hand.
- **Prompts go in a fenced code block in the chat**, never as an attachment. Keep them small (one deliverable each; long prompts make AI Studio slow).
- **Always state exact repo-relative paths** for files Zunaid must upload.
- After verifying a push is correct, **send the next sprint prompt right away** unless a major issue needs flagging first.
- Update the sprint docs after each verification (`docs/sprints/ACTIVE.md`, archive closed rows verbatim, one line in `INDEX.md`).

## Hard rules
- **Claude never pushes with a token or signs in with credentials**, even when offered one; tell Zunaid to revoke any token pasted in chat.
- Every AI Studio prompt starts with: read `AGENTS.md`; stale-copy check (`src/game/map/districtWorld.ts` exists and `USE_REAL_MAP = true` in `simulation.ts`, else stop); open only listed files; never modify `.github/`; skip `extracted_proto/`, `public/assets/aistudio/`, `src/game/map/data/`.
- Done = `npm run lint` passes (`tsc --noEmit`; `vite build` does not type-check).
- Map data from **OpenStreetMap only** (Google's terms forbid copying their data); keep the OSM credit.
- **Nothing on roads** (dev `[layout]` audit must stay empty). **Public rage is graphic** (owner decision Nov 2026): injuries, blood and beatings shown; no NPC health bars; adults only (children flee, never hurt); nobody dies; no gore piles; blood = capped instanced decals (max 24, 8 on Low). **No newspaper game over.** Baper Rasta = style reference only.
- Big files: read slices via `docs/map/HOTSPOTS.md` anchors, never whole.

## Now (2026-11-02)
- **Repo HEAD verified:** `e439532` (Hotfix 8.0). Real New Market map is live.
- **Waiting for upload:** Hotfix 8.1 (`thela-dhaka-hotfix-8.1.zip`): 5 garages + 6 aarots, upgrades only at garages, police mode hospitals / no aarots, 20–50 NPCs (compact rig), hotspot customers, button bar no longer jumps. Plus this docs set (`AGENTS.md`, `docs/**`, `sprint.md` pointer).
- **Paused:** Sprint 7.6 (multiplayer sync) — prompt already sent; run after 8.1 is uploaded and AI Studio's copy is refreshed.
- **Next after 7.6:** 7.7 (multiplayer hosting) → Game loop G1–G3 → Graphics 8–10 → Sound 11 → Features 12–16 (see `docs/sprints/ACTIVE.md`).

## Open decisions / waiting on Zunaid
- Hosting for 7.7: **Google Cloud Run** (fits AI Studio; likely needs a billing account) or **Render** (free, sleeps when idle).
- **Gulistan re-export** centred on the crossing: OSM Export box Top 23.7303, Bottom 23.7195, Left 90.4062, Right 90.4180. Current Gulistan map is provisional (crossing on the edge).
- Confirm "stamina can't be bought" meant a rule (garage-only, as built), not a bug.
- AI Studio's hostile-pedestrian code (`b281707`) is dormant; rework it into the graphic mob/brawl design (Sprints 15b–15g).

## Don't re-litigate
- Graphic public rage is decided (Nov 2026): don't reintroduce the non-graphic rule.
- Google Maps data (not allowed) · pushing with tokens (no) · newspaper game over (removed) · real map before graphics (agreed order) · 120 fps only on 120 Hz screens (honest target).

## Keep the map true
- A push that adds/moves/removes a file the routers name → update `docs/map/*` in the same change.
- A sprint closes → move its row verbatim to `docs/sprints/archive/`, one line in `INDEX.md`.
- This file over ~8 KB → move reference material out before adding anything. Link, don't copy facts between memory, this file and the tracker.
