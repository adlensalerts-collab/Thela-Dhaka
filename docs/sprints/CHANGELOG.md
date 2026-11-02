# Sprint change log

Moved verbatim from sprint.md.

## Change log

- 2026-11-01 — Tracker created. Sprints 1–5 recorded; Sprint 6 in progress.
- 2026-11-01 — Sprint 5 and 6 verified ✅ (`d0c8256`). Sprint 7 started.
- 2026-11-01 — Sprint 7 ⚠️ (`d67685e`, limiter bug), Hotfix 7.1 ✅ (`ad76aae`). Hotfix 7.2 started.
- 2026-11-01 — Added Sprint 7.3 (sprint stamina + money upgrade) to the fixes phase.
- 2026-11-01 — Hotfix 7.2 verified ✅ (`4a4d5ff`); Sprint 7 now ✅. Sprint 7.3 started.
- 2026-11-01 — Added Hotfix 7.4 (road clearance). Proposed layout audited: 0 issues.
- 2026-11-01 — Hotfix 7.4 verified ✅ (`2d12810`). Sprint 7.3 still pending.
- 2026-11-01 — Re-planned: added statistics end screen (7.5), multiplayer fix (7.6–7.7), real map phase (M1–M6), game loop phase (G1–G3), more NPCs (10), public rage (15), multiplayer on real map (16). Created `game-design.md`.
- 2026-11-01 — Sprint 7.3 verified ✅ (`c3c7a25`). Found bribe bug (buttons edit a state copy). Sprint 7.5 started.
- 2026-11-01 — Real-map modules (M1–M6) built and tested on a synthetic district while 7.5 runs.
- 2026-11-01 — Real exports converted: New Market ✅, Gulistan provisional (crossing on the edge; re-export requested). All real-map checks pass on both.
- 2026-11-01 — Sprint 7.5 verified ✅ (`fd69e88`). Real-map wiring done by Claude and play-tested in headless Chromium; ground darkened; texture lookups limited to real files.
- 2026-11-02 — Real map confirmed live ✅. AI Studio's copy was outdated (pushed `b281707` against old code). Hotfix 8.0 prepared: lint fix + root cause of blue roads (ambient sky light).
- 2026-11-02 — Hotfix 8.0 verified ✅ (`e439532`). Sprint 7.6 (multiplayer sync) started; the real map already gives both players an identical city.
- 2026-11-02 — Hotfix 8.1 built and tested by Claude (services, garage-only upgrades, police hospitals, 20–50 NPCs, hotspot customers, button bar fix). 7.6 paused until 8.1 is uploaded.
