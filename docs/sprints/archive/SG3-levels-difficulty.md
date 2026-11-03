# G3 — Levels & difficulty

Moved verbatim from ACTIVE.md.

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| G3 | Levels & difficulty | ⏳ | Level table (police count, vision, traffic, rage sensitivity, customer patience); districts by level; level-up screen |

Built by Codex on `codex/g3-difficulty` (`bb45aa0`), merged with main in `c40190c` / `98f11a3`. Verified by Claude 2026-11-03: `difficulty.ts` follows game-design §4 anchors with interpolation (vehicles 24/36/48/60, rage multiplier 1/1.25/1.5 as initial tuning); `campaignPolice.ts` adds up to 4 extra compact-rig officers with simple footpath patrols from day 3; police vision, traffic count and customer patience applied per day; next-day briefing (`LevelBriefing.tsx`) covers the planned level-up screen. Solo police and online keep legacy values. 6 difficulty tests pass. Headless day 1: 1 officer, 25 m vision, 24 vehicles. Details: `docs/sprints/SPRINT-G3.md`.
