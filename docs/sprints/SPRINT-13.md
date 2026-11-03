# Sprint 13 — Hotspots

Crowd destinations, vendor customer waves, radar pulses and the hotspot badge now use one active schedule based on the solo-vendor day clock. Locations come from the current OpenStreetMap district; no new map sites or standing objects are added. Existing Sprint 10 crowd density, weighted destinations, footpath routing and instancing remain in use.

| Time | Active locations | Customers per wave | Cooldown after a wave attempt |
|---|---|---|---|
| 06:00–08:00 | Quiet; no active hotspots | 0 | — |
| 08:00–10:00 | Junctions and mapped bus stops/stations | 3 | 18 s |
| 10:00–11:00 | Quiet | 0 | — |
| 11:00–13:00 | Markets, malls and department stores | 4 | 14 s |
| 13:00–14:00 | Schools, colleges, universities and market spillover | 3 | 16 s |
| 14:00–17:00 | Quiet | 0 | — |
| 17:00–20:00 | Markets, junctions, mapped bus stops/stations and stadiums | 4 | 14 s |
| 20:00–22:00 | Markets, malls and department stores | 2 | 26 s |
| 22:00 onward | Closed | 0 | — |

The vendor must stand within 30 m of an active location for four continuous seconds, with stock available and no sale, repair, restock or police alert in progress. The nearest active site wins; demand breaks equal-distance ties. Movement, interruptions and switching sites reset dwell. Waves respect the existing difficulty patience and direct-footpath route checks, with a maximum of eight summoned customers at once.

At a window change, inactive summons are released, dwell/cooldown and the stationary-camera destination cache reset, and an engaged sale finishes normally. Pausing freezes the day clock. Each campaign day/district reset builds a fresh schedule. Quiet periods retain normal pedestrians, services and spontaneous sales. Police and online modes keep the prior all-day hotspot behavior; shared multiplayer scheduling belongs to Sprint 16.

The nearby hotspot badge shows the period and its ending time. Radar pulses show only active locations; permanent market/service markers remain available throughout the day. Audio wiring, campaign police routing, day targets, prices and map assets are unchanged.

Verification: lint, six hotspot policy tests, 30 campaign/UI/difficulty/radar tests, four crowd tests, production and GitHub Pages builds. Browser checks cover real-map phases, crowd destination refresh, wave sizes/cadence, queue cap, interrupted dwell, pause, badge, mobile layout and other-mode fallback. No page errors or on-road layout warnings. Software rendering does not establish a hardware frame-rate benchmark.

Tracker closure is left for the landing review.
