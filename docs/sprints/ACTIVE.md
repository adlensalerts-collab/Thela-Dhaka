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
| 7.7 | Multiplayer B: hosting | 🔄 (production `server.ts`, `/healthz`, Socket.io CORS allowlist, `render.yaml`, and `.env.pages` wired and verified locally; live Render deployment, setting `VITE_SERVER_URL` in `.env.pages`, and live two-tab gameplay verification remain) | `server.ts` production mode (serves the built game, no Vite); deploy as an always-on web service; GitHub Pages connects via `VITE_SERVER_URL`; online buttons re-enabled on the live site |

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

G1–G3 done (see `INDEX.md`). Next game-loop work comes from Sprints 13–15.


**Graphics**

Sprints 8–10 done (see `INDEX.md`). Candidate follow-up: women's outfits for the crowd (none exist in `humans.ts`).

Sprints 8D–8G: Slop New York look (mrdoob.github.io/slop-newyork, MIT — see `THIRD_PARTY_NOTICES.md`), built by Claude.

| # | Sprint | Status | Deliverable / verification |
|---|---|---|---|
| 8D | WebGPU renderer, sky, sun, grade | 🔄 uploaded, awaiting live check | `WebGPURenderer` (WebGL 2 fallback) via `three` → `three/webgpu` alias; SkyMesh clouds; 2-cascade SunLight; aerial fog; day-clock lighting 06:00–22:00; grade + bloom (`postfx.ts`, bloom off on Low). Headless WebGL 2 screenshots at 07:30, 13:00 rain, 15:30, 18:36, 20:30; lint passes |
| 8E | Facades and night | 🔄 same upload | Interior-mapped windows (rooms, curtains, lit share 12 % day / 55 % night); slab bands + monsoon damp on plaster/brick; lamp heads + light pools on every pole |
| 8F | Wet roads | 🔄 same upload | Rain soaks roads in ~20 s, dries in ~2 min: darker, glossier asphalt/paving and puddles reflecting the sky |
| 8G | Vehicles | 🔄 same upload | Road grime on bodies, painted rickshaw hoods, head/tail lamps on at dusk, contact shadow under every vehicle, headlight pools at night |

| 8H | Performance pass (8D–8G were unplayable) | 🔄 uploaded, awaiting phone check | Low (phone default): direct render, no MSAA/bloom/clouds/shadows, flat fog, 540p. Medium (computer default): shadows + clouds, flat fog, no grade pass, 720p. High/Ultra: full look. Saved quality reset once (`QUALITY_EPOCH`). Sky env re-bake every 30 game min (was 10). Vehicles share materials and merge static parts per material |

| 8I | 60 FPS lock + guard | 🔄 awaiting phone check | FPS limit defaults to 60 (saved settings reset once, `QUALITY_EPOCH = 3`). If play stays under ~55 FPS for 3 s at the smallest adaptive resolution, quality steps down one level, is saved, and a toast says so (`GameEngine.guardFrameRate`, event `quality_auto`) |
| 8J | Find and cut the lag | 🔄 awaiting phone check | `src/game/render/perfProbe.ts`: F3 (or `?perf`) overlay with frame / CPU-submit / GPU ms and a one-click benchmark that switches shadows, clouds, sky fog, city, traffic, crowd and resolution off one at a time (Copy result → paste to Claude). **Shadows redrawn every 2nd/3rd frame** (`QualityPreset.shadowEvery`, `GameEngine.throttleShadows`). **Chunks behind the camera (> 90 m) are hidden** and view distances tightened to 130/180/270/360 m (`ChunkManager.update`). Only the nearest 6 NPC rigs cast shadows. Garage/aarot PointLights replaced by ground glow (`glow.ts`). MSAA only on High/Ultra. **Bug fixed:** quality changes no longer dispose the sun shadow map or flag every material for rebuild (that froze the game and broke shadows under WebGPURenderer). Sun shadow-map size is fixed at start (1024 Low/Medium start, 2048 High/Ultra) |
| 8K | One purchase per customer | 🔄 awaiting upload | `PedestrianNPC.hasBought` set in `completeSale` via `PedestrianManager.markBought`; bought people are skipped by `getNearestPedestrian` and hotspot summoning; cleared at day reset or when everyone has bought (new wave) |
Known limits: frame rate not measured on a real GPU (headless uses software GL); if Low is still slow, next step is the old `WebGLRenderer` for Low/Medium. No screen-space reflections yet (wet roads reflect the sky only).


**Sound**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 11 | Bengali sound pack | 🔄 (11a ✅ `36dfa82`: procedural street sounds `src/game/audio/streetSounds.ts` — rickshaw bell, CNG/bus/car horns, vendor bell, crowd murmur; 12-voice cap, 60 m falloff; preview `sound-preview.html`. Not wired into the game yet. Next: 11b wire into traffic/crowd/vendor events + `pedestrianManager.notifyEvent('horn')`; 11c Bangla voice lines recorded by Zunaid) | Bangla voice lines (vendor calls, customer haggling, police, angry crowd), rickshaw bells, horns, crowd chatter. Voice lines recorded by Zunaid (script + file names provided) |

**Features**

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 12 | GTA-style minimap | ⏳ | Round, rotating radar drawn from the real road map: people, police (vision cones), markets, garages, aarots, cars, pulsing hotspots, angry-crowd zones |
| 13 | Hotspots | ⏳ (partly covered by Sprint 10: hotspot pull by time of day) | Crowd gatherings driven by the day clock (office rush, bazaar hour, school release, evening market) |
| 14 | Smarter police | ⏳ (G3 added 1–5 officers and simple footpath patrols from day 3) | Patrol routes on the road graph, line of sight, search last known position, backup, cutting off at junctions; fix chase speed (police 3.55 vs vendor 4.85 m/s) |
| 15 | Public rage | ⏳ | Rage meter, angry crowd, mob chase and capture (graphic: blood, injuries, beatings; no NPC health bars), escape rules, police interplay (game-design §5) |
| 15a | More police + officer memory | ✅ AI Studio (`30f538f`), reviewed + sight raised by Claude | Police 2/3/4/5/6/7 on days 1/3/5/6/8/10; sight +40 % (35/42/49/49/56/63 m); per-officer memory (re-sightings, decay 90 s, radio, memory patrol, `memorySummary`); tests added |
| 15b | NPC contact, injuries, blood decals | ✅ AI Studio (`30f538f`), reviewed (not yet seen running) | `PedestrianManager.resolvePlayerContact` bump / stumble / knock-down, limp, `BloodDecals` (max 24, 8 on Low), adults-only exemption, knockback capped at 1.5 m off carriageways |
| 15c | Police hit → aggression | ✅ verified on `main` (`1879dbf`), officer blood wired | Officer hurt by the vendor: stumble / knock-down, 90 s aggression, arrest from 2.6 m without sight/alert/heat; bloody knock-down decal |
| 15d | Police approach | ✅ module by AI Studio (`30f538f`), wired by Claude | `policeApproach.ts` (notice 0.8 s → walk up at 1.95 m/s to ~3 m → warn 5 s → stand down or escalate; 25 s cooldown; one officer at a time) integrated in `CampaignPolice.update`; `takeEscalation()` starts a chase; Bangla toasts until 15e bubbles |
| 15e | Speech bubbles + Bangla police lines | ⏳ | `src/game/dialogue/*` |
| 15f | NPC Bangla conversations | ⏳ | Alternating bubbles in chat groups |
| 15g | NPC street fights | 🔄 built by Claude (fight part), awaiting upload | `PedestrianManager.startFight` / `updateFights`: two free adults walk up, argue (pointing), trade 3–5 blows, the loser is knocked down bleeding (same fall + blood decal as a hard thela hit), the winner catches their breath and walks off; up to 6 bystanders stop and watch; an officer within 14 m scatters everyone; a vendor hit that knocks a fighter down ends it; `setFightRate` (~60 s / rage multiplier), `activeFightPoint()` for officers (15h). Mob beating of the vendor is still the dormant legacy code. 4 new crowd tests |
| 15h | Witness reactions | ⏳ | Panic, cower, call the police |
| 16 | Multiplayer on the real map | ⏳ | Online 1v1 on New Market/Gulistan with day clock, rage and hotspots in sync |

---
