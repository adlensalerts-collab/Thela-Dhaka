# G2 — Game over + victory

Moved verbatim from ACTIVE.md.

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| G2 | Game over + victory | 🔄 (rules package `campaign.ts`, `CampaignEnding.tsx`, `scripts/campaign.test.tsx` uploaded in `ba9d1db`; 13 tests + lint + builds pass; **not wired yet**. Wiring split into G2a engine hooks → G2b ending screen + next/retry/Endless → G2c day-6 district switch. Spec: `SPRINT-G2.md`) | Jailed / bankrupt / wrecked game-over rules; Level 10 victory (own a shop in New Market); Endless mode |

Verified by Claude 2026-11-03. G2a engine hooks by AI Studio (`5c51215`); G2b ending screen + next/retry/Endless and G2c staged day-6 district switch by Codex (`807ecce`). AI Studio's `36dfa82` (built on an old copy) replaced the staged switch with one that leaked GPU memory (603 → 1,327 geometries after one New Market → Gulistan → New Market trip) and dropped the double-`endRun` guard, the stall collision-grid rebuild and the next-day error toast; Codex's G3 merge (`c40190c`, `98f11a3`) restored all four. Re-checked on `98f11a3`: geometries 676 → 449 → 398 → 395 → 370 over four switches (no leak); lint, 28 tests, normal and Pages builds pass; headless run 0 page/console errors, 0 `[layout]` warnings.
