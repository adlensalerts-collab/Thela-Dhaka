# Sprint 12 — rotating radar

Feature branch `codex/12-radar`, based on main through `9d66daf`. Audio is untouched.
The renderer replaces the HUD's old whole-district map with a circular, player-
centered, heading-up radar of the bundled OpenStreetMap district.

## Behavior

- 90 m radius; the player arrow stays centered and points up while roads/buildings
  rotate underneath. A north marker preserves orientation. The background raster
  is cached at 1024 px and recreated only on district/role changes.
- Nearby active pedestrians, vehicles, all solo campaign officers, and the police
  player's vendor opponent get distinct blips. Online opponents appear only after
  a valid remote update. No extra opponent or AI information is fabricated.
- Officer facing wedges accompany the actual weather-adjusted detection-radius
  rings: current AI sees radially, so a facing wedge alone would imply false safety.
  Online player-police markers have no invented AI detection radius.
- Garages, aarots, hospitals and markets have upright letter markers. When a
  service type has no visible marker, its nearest location gets an edge bearing.
  Police see hospitals instead of garages and no aarots. Service markers use the
  actual footpath entrances. A collapsible map key explains colors/letters.
- Static district hotspots pulse during active simulation, respecting reduced
  motion. Time-of-day hotspot activation remains Sprint 13. Existing angry-crowd
  positions draw translucent red areas; this does not activate Sprint 15 rage.
- OpenStreetMap attribution stays visible on mobile and desktop. No map APIs,
  new image assets or asset downloads are used. The old grid fallback has a
  circular grid-road background and legacy service positions.
- Radar snapshots are gathered only with the existing throttled HUD publication
  (~10 Hz), capped at 64 nearby people and 32 nearby cars. Patrols are bounded
  by G3. Snapshot updates never change game or networking behavior.
- Touch controls measure the bottom HUD's height to stay clear of the radar and
  expanded map key. Short screens use a smaller radar. Buttons keep their existing
  fixed-label layout; hotspot notices stay above the touch controls.

## Files

- `GameRadar.tsx`: canvas drawing, cached background, role-aware POIs and legend.
- `ui/radar.ts`: pure rotation/circular-edge math, actor caps and POI selection.
- `GameHUD.tsx`: replaces old map effects and keeps touch-control clearance.
- `simulation.ts`: one additive throttled snapshot hook; no audio/input changes.
- `campaignPolice.ts`: publishes existing patrol headings along with positions.
- `map/minimap.ts`: optional service-marker flag for a clean radar background;
  existing callers keep their default behavior.

## Verification

- Six new radar tests plus 24 campaign/difficulty/UI tests pass.
- Four real-map crowd regression tests also pass after syncing Claude's `9d66daf` fixes.
- `npm run lint`, normal and Pages production builds pass.
- Headless Chrome checked actual canvas transparency outside the circular mask,
  centered player pixels, rotation when heading changes, bounded actor payloads,
  all three police ranges after day 6/Gulistan, police-mode hospital/no-aarot map
  key and no phantom online opponents before remote updates.
- Desktop/mobile screenshots inspected. Portrait 390×844 and landscape 844×390
  have no horizontal overflow; the touch pad stays above the radar with the map
  key closed or open, and attribution remains visible.
- No uncaught page errors or road-audit warnings in that run. These are controlled
  engine/browser checks; live two-player play and real-GPU frame rates are not
  benchmarked. Existing Vite native-config/chunk-size warnings remain.
- Source review/merging should use this feature branch, not whole-file uploads.
  Sprint status/archive updates are left to landing review.
