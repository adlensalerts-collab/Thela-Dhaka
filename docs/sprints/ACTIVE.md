# Active sprints

Open and planned work only. Closed sprints: `docs/sprints/INDEX.md` → `docs/sprints/archive/`. Game rules: `docs/game-design.md`.

**Status key:** ✅ verified & done · 🔄 in progress · ⏸ paused · ⏳ planned · ⚠️ done with known issue

## In progress

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 8.1 | Hotfix: services, upgrades, police hospitals, more NPCs, hotspot customers, jumping button bar | 🔄 | Uploaded; source present and lint/Pages build pass at `a3235b5`. Full interactive regression remains to be rechecked. See details below |

**Hotfix 8.1 details (all play-tested in headless Chromium, 0 page errors):**
- **5 garages + 6 aarots per district** (was 2 + 3), at least 122 m apart; all 11 rings on footpath entrances, nothing blocking, road audit 0.
- **Upgrades only at a garage:** U (cart) and T (stamina) away from a garage → "আপগ্রেড শুধু গ্যারেজে — Xm দূরে"; buttons look muted until you're in a garage ring.
- **Police mode:** garages become hospitals (white sign with red cross "হাসপাতাল · চিকিৎসা", red ring, "চিকিৎসা" wording, H on minimap); aarots closed (rings/signs hidden, not on minimap).
- **More NPCs:** 20 / 30 / 40 / 50 pedestrians by quality (was capped at 15). Crowd people use a merged model: 5–7 draw calls each instead of 34–38 (outline identical within 3 cm); hidden beyond 90 m. Half of all trips head to hotspots.
- **Hotspot customers:** stand still 4 s in a hotspot (markets, busy junctions) → 3 customers walk over (hurrying), wait at the thela and buy; repeats every 18 s; walking away sends them off. Test: 3 summoned at 4 s, 2 waiting by 31 s, sale ৳87 completed.
- **Button bar no longer jumps:** labels were wrapping to two lines as distances changed; buttons now never wrap, numbers fixed-width, bar pinned. Test: 0 px movement over 14 samples while driving.
- Note: "stamina can't be bought" read as a rule (only at a garage); in testing, buying stamina itself worked (৳150 for level 2).

Order: **Fixes → Real map → Game loop → Graphics → Sound → Features.** The real map comes before graphics, because polishing the old grid streets would be thrown away when the map is replaced. Rules for game end, economy, levels and public rage are in `game-design.md`.

**Fixes**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 7.6 | Multiplayer A: shared world + sync | 🔄 (engine integration landed in `6faa95c`; room lifecycle and two-tab verification remain) | Seeded world (both players see the same city); send/receive position ~12×/s with smooth interpolation; remote opponent replaces the AI in online modes; joiner gets the opposite role; server-checked arrests; disconnect + rematch |
| 7.7 | Multiplayer B: hosting | ⏳ | `server.ts` production mode (serves the built game, no Vite); deploy as an always-on web service; GitHub Pages connects via `VITE_SERVER_URL`; online buttons re-enabled on the live site |

**Real map (OpenStreetMap: New Market + Gulistan)**

Built and tested by Claude. Wiring (M-W) done by Claude: maps are bundled into the game (`src/game/map/data/`), `USE_REAL_MAP` switch in `simulation.ts` keeps the grid city as a fallback.

| # | Sprint | Status | Deliverable / verification |
|---|---|---|---|
| M1 | Map data | ⚠️ | **New Market ✅**: 900 × 900 m crop (Mirpur Rd, New Market, Chandni Chowk, Gausia, Nilkhet, Dhaka College, Azimpur): 154 roads, 839 buildings. **Gulistan provisional**: the export was mostly Motijheel, and the Gulistan crossing sits on the crop's south edge (has Baitul Mokarram, National Stadium, Zero Point, Dainik Bangla Mor): 139 roads, 673 buildings. Converter auto-fixes: buildings trimmed off roads/footpaths, overlapping outlines resolved, sliver spikes removed, disconnected roads no-traffic. **Needs a re-export centred on the Gulistan crossing** |
| M2 | Road network | ✅ built | `map/roadGraph.ts`: square road ends (match drawn roads), dead-end U-turns before the end, left-hand lanes, A* |
| M3 | Real buildings | ✅ built | `map/districtWorld.ts`: real footprints, walls verified outward on both maps (31k triangles, 0 wrong), polygon collision |
| M4 | Systems on the real map | ✅ built | Traffic 2 min on both maps: 0 bumpers in buildings, 0.01% off-road, 99.7% left lane; pedestrian routes 0 bad nodes; garages/aarots 0 issues; road audit 0; 200 walks from spawn never end inside a building |
| M5 | Big-map performance | ⚠️ | 120 m chunks + merged roofs: visible draw calls avg 430–475 on Medium, 330–370 on Low. Remaining: combine the 140 shop signs into shared images (→ Sprint 8) |
| M6 | Two districts | ✅ built | `map/district.ts` loader + `districtForLevel` (L1–5 New Market, L6–10 Gulistan) |

**Game loop (game-design §2–§6)**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| G1 | Day clock + day end | ⏳ | 06:00–22:00 clock (~12 min), day targets, rent/food costs, day passed/failed → statistics screen |
| G2 | Game over + victory | ⏳ | Jailed / bankrupt / wrecked game-over rules; Level 10 victory (own a shop in New Market); Endless mode |
| G3 | Levels & difficulty | ⏳ | Level table (police count, vision, traffic, rage sensitivity, customer patience); districts by level; level-up screen |

**Graphics**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 9 | Realistic characters | 🔄 | 9A verified at `10f27ca`. Remaining implementation now built against `52ffdf7`: clothed skeletal heroes, cart-grip IK, bounded near-crowd LOD, fallback/lifecycle and expanded preview. Local checks pass; see `SPRINT-9.md`. Ready for upload; close/archive after verifying the uploaded files. |
| 10 | More NPCs + behaviour | ⏳ | Remove the 10–15 pedestrian cap; 60–120 people with distance-based detail; groups chatting, phones, browsing stalls, crossing at junctions, reacting to horns/accidents, haggling; density by time and hotspots |

**Sound**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 11 | Bengali sound pack | ⏳ | Bangla voice lines (vendor calls, customer haggling, police, angry crowd), rickshaw bells, horns, crowd chatter. Voice lines recorded by Zunaid (script + file names provided) |

**Features**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 12 | GTA-style minimap | ⏳ | Round, rotating radar drawn from the real road map: people, police (vision cones), markets, garages, aarots, cars, pulsing hotspots, angry-crowd zones |
| 13 | Hotspots | ⏳ | Crowd gatherings driven by the day clock (office rush, bazaar hour, school release, evening market) |
| 14 | Smarter police | ⏳ | Patrol routes on the road graph, line of sight, search last known position, backup, cutting off at junctions; fix chase speed (police 3.55 vs vendor 4.85 m/s) |
| 15 | Public rage | ⏳ | Rage meter, angry crowd, mob chase and capture (non-graphic), escape rules, police interplay (game-design §5) |
| 16 | Multiplayer on the real map | ⏳ | Online 1v1 on New Market/Gulistan with day clock, rage and hotspots in sync |

---
