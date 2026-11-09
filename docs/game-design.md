# Thela Dhaka — Game Design

The rules every sprint builds toward. Numbers are starting values to tune in playtests.
Sprint prompts reference sections here by heading, so AI Studio reads only what it needs.

---

## 1. Core loop

Push the thela through a real Dhaka district → find customers (hotspots, footpaths, crowds) → sell (timed sale ring) → restock at an aarot → repair at a garage → avoid the police and the public's anger → make the day's target → next day.

**Fantasy:** a street vendor working up from a rented thela to owning a shop in New Market.

## 2. Days and levels

- **One level = one working day.** Game clock runs 06:00 → 22:00 in about **12 real minutes** (~1 game hour every 45 s).
- **Districts:** Levels 1–5 in **New Market** (busy, fewer police, more customers). Levels 6–10 in **Gulistan** (denser traffic, more police, bigger crowds).
- **Time of day changes the street** (drives hotspots and police):

| Time | Event | Effect |
|---|---|---|
| 08:00–10:00 | Office rush | Crowds at bus stops, high traffic |
| 11:00–13:00 | Bazaar hour | Most customers near markets |
| 13:00–14:00 | School/college release | Students near schools, cheap items sell fast |
| 17:00–20:00 | Evening market | Peak customers and peak police patrols |
| 20:00–22:00 | Night | Fewer customers, better prices, lighting matters |

## 3. Winning and losing

**Day end (22:00):** profit = money earned − day costs (thela rent ৳50 + food ৳40).
- Profit ≥ day target → **day passed**, go to the next level.
- Profit < target → **day failed**: repeat the same level with a fresh day (no other penalty).

**Run ends (game over) when any of these happen:**
1. **Jailed:** arrested and the player chooses jail, or can't pay the bribe.
2. **Bankrupt:** cash < ৳20, stock 0, and nothing left to sell (restock impossible).
3. **Thela wrecked:** damage reaches 100 and the player can't afford the repair before the day ends.

**Victory:** pass Level 10 → **buy your own shop in New Market** (ending scene). Afterwards an **Endless mode** keeps going with rising targets.

**Day targets (profit):** L1 ৳600 → each level ×1.35 (L10 ≈ ৳8,900).

## 4. Difficulty per level

| Level | Police on map | Police vision | Traffic | Rage sensitivity | Customer patience |
|---|---|---|---|---|---|
| 1 | 2 | 35 m | Light | Low | 20 s |
| 3 | 3 | 42 m | Medium | Low | 18 s |
| 5 | 4 | 49 m | Medium | Medium | 16 s |
| 6 (Gulistan) | 5 | 49 m | Heavy | Medium | 15 s |
| 8 | 6 | 56 m | Heavy | High | 13 s |
| 10 | 7 | 63 m | Very heavy | High | 12 s |

Between listed levels, interpolate (Nov 2026: more officers and +40 % sight than the first design). Smarter police behaviour (patrols, search, backup) unlocks gradually from Level 3.

**Officer memory (Sprint 15a):** each officer counts how often they have *re*-spotted the vendor (a new sighting needs him to leave and re-enter view, at least 10 s apart). At 2 sightings they "know" him (sight ×1.25, at most +10 m, and 30 % faster backup reaction); at 4, ×1.4 (same cap). One sighting is forgotten per 90 s unseen. Officers near each other share what they know. An officer who knows the vendor and saw him less than 120 s ago patrols near that spot, once every 40 s.

**Officer approach (Sprint 15d):** an officer who spots the vendor (and is not chasing) walks up to about 3 m, then warns him for 5 s. If the vendor walks away (6.5 m+) or the officer loses sight, they stand down and cool off for 25 s. If he is still within 4.8 m when the warning ends, or his heat is 6+, the officer starts a chase.

## 5. Public rage (জনতার রাগ)

A crowd-anger meter that turns the street against the player. **Graphic (owner decision, Nov 2026):** injuries, blood and beatings are shown: hit reactions and knock-downs, brawls, and a mob beating when the vendor is caught. Guardrails: no health bars for NPCs (the vendor keeps his Life bar); adult characters only (any child/school-age model flees and never fights or gets hurt); nobody dies and there is no dismemberment or gore pile (injured people limp off); blood is cheap, as pooled instanced decals plus short particles with a hard cap (24, or 8 on Low quality). Being caught means losing money, stock and time.

**Rage rises from:**

| Cause | Rage |
|---|---|
| Hitting a pedestrian with the thela | +25 |
| Hitting a rickshaw / CNG / car | +10 |
| Driving on the footpath into people at sprint | +5 per second |
| Running off in the middle of a sale | +8 |
| Blocking a junction for more than 10 s | +5 |

**Rage levels:**
- **0–49:** calm. Rage falls by 4 per second when no new incidents happen.
- **50–79 (angry):** nearby people stop, point and shout Bangla lines. Customers refuse to buy within 30 m.
- **80–100 (mob):** 3–8 nearby pedestrians chase the player. They're slower than a sprint but don't tire, so stamina decides the escape. A chase also raises police heat.

**Caught by the mob:** lose 30% of cash and half the stock, +40 damage, frozen for 5 s while the crowd surrounds the thela, then rage resets to 30. Being caught 3 times in one day ends the day early ("hospital", the day counts as failed).

**Escape:** break line of sight for 6 s or get 60 m away. The crowd gives up, and rage falls to 60.

## 6. Economy

- Restock: ৳7 per item (aarot). Cart upgrades: +3 capacity, ৳130 + 85 × level.
- Stamina upgrades: ৳150 / 260 / 400 / 600 (levels 2–5).
- Repair: ৳2.4 per damage point (garage).
- Bribe: ৳90 + 45 × cart level.
- Prices vary by product, district and time (night +15%, hotspot +10%).

## 7. End screen (statistics only)

The newspaper-style game-over is **removed**. Day end and game over both show a **statistics screen**:

- **Result:** day passed / failed / game over (and the reason) / victory.
- **Money:** earned, spent (restock, repairs, bribes, rent, food), profit vs. target (progress bar).
- **Selling:** items sold, sales per product, best sale, customers served, customers lost (patience ran out).
- **Trouble:** police chases (escaped / caught), bribes paid, mob chases (escaped / caught), collisions, damage taken.
- **Movement:** distance pushed (km), time sprinting.
- **Run totals** (game over / victory): days survived, level reached, total profit, best day.
- **Buttons:** Next day / Retry day / Main menu.

## 8. The map (real Dhaka)

- **Source: OpenStreetMap, not Google Maps.** Google's terms don't allow copying their map data into another product. OpenStreetMap is free to use with credit ("© OpenStreetMap contributors" in the credits/title screen).
- **Two districts** of roughly **800 m × 800 m** each, at 1 game unit = 1 m: **New Market** (New Market, Nilkhet, Chandni Chowk area) and **Gulistan** (Gulistan crossing and surrounding roads).
- Roads keep their real shapes, names and widths. Buildings keep their real footprints and heights where OpenStreetMap has them.
- The data is converted offline into compact JSON (`public/maps/<district>.json`). The game never calls a map service at runtime.
- **Garages, aarots, stalls and hotspots** are placed at real-feeling spots (market edges, junction corners), defined in each district file.
- Large-map performance: the world is split into chunks, distant chunks are simplified or hidden, and collision uses a spatial grid.

## 9. People (NPCs)

- Target **60–120 pedestrians** in view on desktop High, about half on Medium/mobile.
  - Near (< 40 m): full animated characters.
  - Mid-range: cheaper animated versions.
  - Far: hidden or very simple.
- Density follows the time of day and hotspots (Section 2).

## 10. Multiplayer (1v1: vendor vs. police)

- **One shared world:** the city is generated from a seed (or the district JSON), so both players see identical buildings and walls.
- **Sync:** each client sends position, heading, speed and state about 12 times a second. The opponent is drawn smoothly between updates. The server checks arrests (police within 2.1 m of the vendor) so neither player can cheat it.
- **Roles:** the joining player takes the role the host didn't pick.
- **Hosting:** the Socket.io server (`server.ts`) runs as a small always-on web service; GitHub Pages connects to it through `VITE_SERVER_URL`. GitHub Pages alone can't host it.
- **Match end:** vendor wins by reaching the day target before 22:00; police win by arresting the vendor (bribe or jail rules as in solo). Both see the statistics screen. Rematch button.
