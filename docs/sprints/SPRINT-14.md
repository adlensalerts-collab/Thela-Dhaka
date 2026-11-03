# Sprint 14 — Smarter police

Solo-vendor officers use a 72° forward vision cone with the existing day/weather vision distance. Within 2.1 m they also notice the vendor behind them. Buildings, service walls, stalls and other solid obstacles block sight; trees and thin poles do not. Geometry tests include thin and concave footprints. Sight queries use the district obstacle grid at 10 Hz, with at most five officers. Radar cones use the same half-angle; they show potential range, not a polygon clipped against every building.

Wanted heat alone does not reveal a hidden vendor. A visible vendor with heat >= 18 and no cooldown starts one chase. During pursuit only actual sightings update the shared last-known position and bounded observed velocity. Officers route to sightings, not hidden player coordinates. Arrest contact also requires an unobstructed line, preventing capture through walls. Five continuous seconds unseen (or beyond the existing escape distance) clears the chase once and grants the existing cooldown. Pause/menu time advances neither police nor escape timers.

| Day | Behavior |
|---|---|
| 1–2 | Look around at posts; chase a visible vendor, investigate the last sighting, then return to the original post after escape |
| 3+ | Patrol connected footpaths, favoring safe footpath stops nearest junctions from the real road graph; search around the last sighting |
| 5+ | Nearby existing officers receive delayed backup instructions (1.5 s + 0.6 s per officer); no new officers spawn |
| 8+ | One unseen backup officer heads to an accessible junction ahead of the observed travel direction, falling back to the last sighting when no suitable junction exists |

Police chase at 5.35 m/s before weather modifiers: faster than the normal vendor push (4.85), slower than a full sprint (8.0025). Patrol/search speeds remain slower. Early search is limited to the last sighting; the day-3 unlock adds nearby search routes. Backup range is 80 m, rising to 120 m with interception. Sightings and pursuit memory reset after escape, bribes, retries, district changes and new days.

All route goals stay in the officer's connected footpath component so A* cannot use its disconnected straight-line fallback. Chase replans retain progress toward an unchanged goal and skip a previous node when already moving along its outgoing segment. Existing collision resolution, corner sliding, compact extra-officer rigs, animation and cleanup remain in use. No map assets, economy, audio, multiplayer rules or public-rage behavior change.

Verification: lint, ten police tests, the existing 40 campaign/UI/difficulty/radar/hotspot/crowd tests, and production/Pages builds. Browser checks exercise detection behind an officer, occlusion by an existing building, one-shot chase/escape statistics, hidden sighting memory, pause, radar cone metadata, days 1–10 including the Gulistan transition, safe spawns and bounded moving patrols. No page errors or road-layout warnings. Browser automation uses software rendering; hardware FPS and subjective difficulty tuning remain play-test work.

Sprint 15 should use its dedicated branch and modules first; see `SPRINT-15-PROMPT.md`. Integrate its engine hooks after this sprint lands, using the latest engine source. Tracker closure is left for landing review.
