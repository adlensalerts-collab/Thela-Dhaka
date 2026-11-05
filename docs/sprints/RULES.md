# Rules that apply to every sprint

Moved verbatim from sprint.md (summarised in `AGENTS.md`).

- Prompts tell AI Studio to skip `extracted_proto/` and `public/assets/aistudio/` and to open only the listed files.
- Never delete or modify `.github/` (the Pages deploy workflow lives there).
- Files uploaded to GitHub by hand must also be in the AI Studio workspace before its next push. Every prompt starts with a check that AI Studio's copy has `src/game/map/districtWorld.ts` and `USE_REAL_MAP` in `simulation.ts`; if not, it must stop.
- Baper Rasta (baperrasta.com) is a style reference only: no copying its sounds, art or text. No newspaper-style game over.
- Map data comes from OpenStreetMap (credit "© OpenStreetMap contributors"), never Google Maps.
- Public rage is graphic (owner decision, Nov 2026): injuries, blood and beatings are shown. No NPC health bars, adults only, nobody dies, blood is capped instanced decals (see `docs/game-design.md` §5).
- Performance target is honest: 120 fps only where the screen refreshes at 120 Hz.
