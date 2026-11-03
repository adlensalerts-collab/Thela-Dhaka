# G2 — campaign integration

G2 is wired into G1's solo-vendor clock and accounting, built on 5c51215's partial
engine hooks. G3 difficulty scaling remains separate.

## Ownership and behavior

- campaign.ts owns day number, targets, results, totals and Endless transitions.
- simulation.ts owns one Campaign per solo run. G1 still owns the clock, wallet,
  transactions and once-only closing costs. Frozen endings capture their clock.
- continueCampaign() advances/retries only valid results and guards duplicate
  clicks. District construction happens before advancing; a failed build can be
  retried. A pending reset remembers an already-advanced day if reset needs retry.
- EventModal selects CampaignEnding for solo results, with StatsScreen's existing
  cards as children: one heading and action bar. Other modes keep their UI.
- App routes Next day, Retry day, Endless and New campaign. Menu discards the run;
  a new solo game starts at day 1. GameHUD uses the active district's minimap.
- Working-day number remains separate from GameState.level (cart upgrade level).
- Targets use round(600 * 1.35 ** (dayNumber - 1)). Passing day 10 unlocks the
  original CSS New Market shop ending. Endless begins at day 11 with rising targets.
- Next/retry/Endless retain G1's fresh daily wallet, stock and upgrade settings.
  Campaign totals persist. Failed days add no separate penalty.
- Bankruptcy requires cash < 20, no sellable stock, inability to afford the actual
  refill quote, and no pending recovery transaction.
- Broken solo carts remain repairable before closing. At closing, damage 100
  with an unaffordable repair takes precedence over the profit target.
- Jail and unaffordable bribe remain distinct reasons. Successful bribes continue
  the day unless they exhaust all remaining resources.
- Completed attempts contribute profit once, including failed targets. Survived
  days count nonfatal closings; passed days count target passes. Best day includes
  the final partial day at defeat. Negative profits remain visible.
- Rent/food settle at G1's ordinary closing. Early terminal defeats retain expenses
  incurred so far. Campaign decisions never deduct money a second time.
- Every ending shows its captured game time; early jail no longer claims 22:00.

## District lifecycle

New Market is used on days 1–5, Gulistan from day 6. The next district, traffic
and compact pedestrian pool are built in a staging scene before replacement.
Old roots, crowd detail actors and unshared GPU resources are retired; heroes,
lighting, renderer and input listeners stay alive. Collision grids and service
locations follow the world. Removing a placed stall also rebuilds the collision
grid, avoiding invisible stall obstacles after reset.

## Verification — 2026-11-03

- 17 committed tests pass: npx tsx --test scripts/campaign.test.tsx scripts/campaign-ui.test.tsx.
- npm run lint, normal production build and GitHub Pages build pass.
- Headless Chrome exercised actual engine boundaries and UI actions: days 1–10,
  day 5→6 district swap, one district root throughout, shop→Endless, failed-day
  retry, new campaign/menu resets, bankruptcy, broken-cart repair, wreck defeat
  at closing, successful/failed bribe, a captured 10:00 jail ending and duplicate
  ending callbacks. Solo police and both online modes retain no campaign/clock.
- Desktop shop and 390px mobile jail endings inspected. No horizontal overflow,
  uncaught page errors or road-audit warnings appeared in that run.
- Browser checks use accelerated boundaries and controlled state, not a complete
  12-minute manual playthrough. Online checks cover mode isolation; live two-player
  matches and performance benchmarking were not run here.
- Existing Vite native-config/large-chunk warnings remain. Hosting/workflows are
  unchanged. ACTIVE.md is left for the sprint's normal landing review.
