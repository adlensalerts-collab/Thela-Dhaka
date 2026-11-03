# G3 — levels and difficulty

Implemented on branch `codex/g3-difficulty`, based on `46f3ff2`. Kept separate from
main so the integrator can merge it before wiring Sprint 10. No pedestrian,
character-model, map-data, hosting or workflow files were changed.

## Behavior

`difficultyForDay(dayNumber)` is the single immutable profile used by simulation
and the level briefing. It follows game-design §4's anchors and interpolates
between them; police and traffic counts are rounded to the nearest integer.

| Day | Police | Vision | Vehicles | Rage multiplier | Customer patience |
|---|---|---|---|---|---|
| 1 | 1 | 25 m | 24 | 1.00 | 20 s |
| 3 | 2 | 30 m | 36 | 1.00 | 18 s |
| 5 | 2 | 35 m | 36 | 1.25 | 16 s |
| 6 | 3 | 35 m | 48 | 1.25 | 15 s |
| 8 | 4 | 40 m | 48 | 1.50 | 13 s |
| 10 | 5 | 45 m | 60 | 1.50 | 12 s |

Vehicle counts (24/36/48/60) and rage multipliers (1/1.25/1.5) are explicit initial
tuning values for the design's qualitative tiers. Endless targets continue to
rise, while populations/vision/patience are bounded at day-10 settings. Working-day
number never comes from cart upgrade level or display-quality selection.

- Solo vendors use the daily police population and weather-adjusted vision.
  Any officer can spot/catch the vendor; escape considers the nearest officer.
  Patrol speed retains 3.55 m/s pursuit. Early-day officers wait on safe footpaths;
  simple footpath routes unlock on day 3. Tactical search/backup/line of sight and
  chase-speed balancing remain Sprint 14.
- Extra officers use compact rigs, with at most four extras. Their physics stays
  active outside the 90 m drawing distance. Spawns are collision-checked footpath
  nodes outside the player's vision radius, with separation between officers.
- A bribe relocates all solo officers and clears patrol routes; one officer cannot
  immediately recapture the player after another officer accepts the bribe.
- Traffic changes only at day/mode reset. Replaced vehicle roots are removed from
  district ownership and shared-resource-aware cleanup retires their GPU resources.
  Leaving campaign mode restores the legacy 36-vehicle population and no extras.
- Existing hotspot summon calls pass profile.customerPatience as their fifth
  argument. The pedestrian manager already includes route travel allowance before
  that waiting period. Ordinary passers-by retain their current behavior.
- Rage sensitivity is a published hook for Sprint 15; G3 does not activate the
  dormant legacy rage implementation or introduce injuries/health bars.
- A passed day's Next day action opens a paused briefing: upcoming district,
  profit target, police count/vision, traffic and customer patience. Start day then
  advances/reset the campaign. Retry stays on the same day without the briefing.
  Shop→Endless gets the same preview for day 11. Menu discards the campaign.
- Existing minimap police markers now include all solo officers. Online/police
  modes keep their existing count, AI, UI and match rules.

## Sprint 10 handoff (Claude)

Keep the existing `PedestrianManager.summonCustomers(x, z, max, radius, waitSeconds)`
signature and honor its waiting-period parameter. G3 does not edit pedestrians.ts.
Read `GameState.difficulty?.customerPatience` for future queue behaviors and
`rageMultiplier` for Sprint 15 incident scaling. Undefined difficulty means an
existing non-campaign mode; preserve that mode's behavior.

Merge G3's simulation.ts/App.tsx/EventModal.tsx/GameHUD.tsx changes first, then wire
Sprint 10's engine calls against that merged version. Apply a commit/patch or PR,
not whole-file ZIP replacement from an older checkout. Product/Hotspots/Operations
router edits should be merged with any concurrent documentation additions.

## Verification

- 23 rule/lifecycle/UI tests pass, including six new difficulty/briefing tests:
  `npx tsx --test scripts/campaign.test.tsx scripts/campaign-ui.test.tsx scripts/difficulty.test.tsx`.
- TypeScript and normal/Pages production builds pass.
- Headless Chrome checked all days 1–10: exact officer/vehicle counts, patience
  dispatch, no on-road spawns, basic route movement from day 3, paused briefing
  before advancing, day-6 district switch, one district root, and shop→Endless.
- An extra officer (with the primary officer far away) triggered the bribe UI;
  payment moved all officers outside vision. Vision boundaries and non-campaign
  cleanup/restored traffic were checked. No uncaught page errors or road-audit
  warnings occurred in that run.
- The day-6 briefing was checked at 390 px for overflow and visually inspected.
- Checks use controlled engine state/accelerated closing, not full 12-minute
  manual runs. Real-time performance and live two-player matches are not benchmarked.
- Existing Vite configuration/chunk-size warnings remain. Sprint status/archive
  updates are left to landing review; this document records the feature branch.
