# G1 — Day clock + day end

Moved verbatim from ACTIVE.md.

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| G1 | Day clock + day end | 🔄 (implemented in `src/game/day.ts`, `stats.ts`, `simulation.ts`, `GameHUD.tsx`, `StatsScreen.tsx`, and `App.tsx`; `npm run lint`, `npm run build`, Pages build, and deterministic clock/target/accounting/reset/SSR checks pass; headless browser check remains) | 06:00–22:00 clock (~12 min), day targets, rent/food costs, day passed/failed → statistics screen |

Verified by Claude 2026-11-03 at `15f9f9b` (AI Studio): `day.ts` clock 06:00–22:00 over 720 s, target `round(600·1.35^(d−1))`, ৳90 rent+food settled once at closing, cart level kept separate from day number, transactions blocked after closing, pause stops the clock. `npm run lint`, normal and Pages builds pass. No next-day button yet (replay repeats the same day) — that is G2b.
