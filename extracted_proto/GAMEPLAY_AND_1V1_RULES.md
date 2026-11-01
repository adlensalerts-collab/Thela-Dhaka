# THELA DHAKA — Core Gameplay + Optional 1v1 Contract (v1)

**Product decision — locked for this project:** This is ONE 3D Dhaka game with two role choices (Thela Gari Wala, Police), not separate solo and multiplayer games. Anyone can press **Play Solo** without an account. **Play with Friend (1v1)** is optional, uses exactly the same city, economy, movement, selling, pursuit, arrests, inventory, heat, upgrades, cooldowns and progression rules. Only the *opponent controller* changes: AI in solo, human in 1v1. Do not design a second gameplay ruleset, second map, or pay-to-win system for multiplayer.

## Entry and role selection

- Primary button: **Play Game** -> choose **Thela Gari Wala** or **Police** -> enter single-player immediately. No registration, matchmaking or network dependency to start.
- Secondary button: **Play with Friend** -> **Create Private Room** -> copy invite link/code -> friend joins on a different device -> each chooses an opposing role -> both Ready -> one shared live 3D world starts.
- Optional **Invite Friend** from the pause menu may create a *new, fair online session* while retaining the game aesthetic; never upload unverifiable local cash or rank and pretend it is authoritative. Future account-backed, server-verified saves can permit continuity.
- If the friend disconnects: allow a configurable rejoin grace period; then swap the absent role to AI or finish the session by explicit choice. Never instantly destroy the remaining person's progress.
- No sign-in required for guest solo or private guest 1v1 (temporary names, links and codes). Account is optional for cloud saves/leaderboards later.

## Gameplay engine invariant

A single authoritative rules package owns: `move`, `customerOffer`, `beginSale`, `completeSale`, `cancelSale`, `restock`, `upgrade`, `heatTick`, `startChase`, `escape`, `cooldownTick`, `attemptCapture`, `resolveCapture`, `jail`, `rankProgress`, `openStall`, and `resolveOperation`.

- **Solo:** these rules run locally; AI behavior outputs exactly the same player input commands as humans. No rule branches that award AI cheaper goods or easier arrests.
- **Online 1v1:** the exact same deterministic rules run on the server; the browser sends intent (direction, sell, chase, capture, upgrade) and draws validated events/state. Server owns money, stock, sale deadlines, distance, wallets, wanted level, rank, capture outcome, respawns and scores. Ignore forged client balances, timers and positions.
- Art, controls, physics, map, HUD and sound assets stay shared. Use role-specific panels only when relevant; do not replace the game with a separate 1v1 battle arena.

## Thela Gari Wala core loop

1. Roam a Dhaka-inspired area with a moving cart. NPC customers approach, request products and purchase from the cart.
2. Each sale takes a random 5–10 actual seconds. Longer orders have higher expected payouts; display the product, sale duration, price and progress. A completed sale pays exactly once and decrements inventory exactly once.
3. Allow wandering to find customers, restocking supplies with cash, and upgrading cart capacity/profit. Higher upgrade levels increase risk by attracting more wanted-star attention.
4. At sufficient heat the police (AI or real friend) may detect and pursue the player. The vendor cannot attack. Escape by distance + broken line of sight; the cooldown lets wanted heat decay before the next safe selling period.
5. On capture, run a unified, time-bounded, two-party encounter. The officer chooses `record arrest` or `demand illicit payment` (fictional satire); if payment is demanded, vendor can pay from virtual cash or refuse. If no money and enforcement proceeds, jail ends the vendor run. Resolution rules must be consistent between AI-officer and human-officer paths.
6. Each upgrade shows the exact cost, extra slots, expected earnings bonus and risk increase. Level 10 unlocks a large illegal fixed food stall with profitable but vulnerable earnings. Bulldozer event targets a structure only; no people are injured.

### Initial calibration (tunable values, not production-balanced)

- Initial wallet: ৳250. Initial inventory: 10 units. Sale duration: uniform random 5–10 sec. Longer time generally means higher price.
- Upgrade levels: 1–12. Current starter uses upgrade cost `130 + 85 × current level`, capacity +3 units per upgrade, and higher average sale price.
- Heat: 0–100 displayed as 0–5 stars. Heat increases on sales and upgrades; successful pursuit escape reduces heat. Cooldown starts after losing pursuit.
- Sales interrupted by customer moving away or police chase grant no income and must clear state.
- Level 10 opens fixed-stall ability (operation is not yet developed in prototype).

## Police core loop

1. Patrol the SAME streets and locate the active vendor using legitimate visual/search clues. Do not reveal live exact player location across the entire map. Wanted-star levels can increase map hints or reports, not guarantee omniscience.
2. Chase and capture only when within verified reach and appropriate movement state. No wall-through arrests, teleportation or impossible attack ranges.
3. Capture decision: record arrest earns service score/rank progress; demand illicit payment earns satirical virtual cash with a strong integrity loss, no arrest credit, and practical gameplay consequences. Both use the shared encounter resolution.
4. The police ladder is gameplay progression (Constable -> ASI -> SI -> Inspector). Magistrate is NOT a police rank. It can appear as an externally authorized special operation/event triggered at late-game milestones. Police may assist; they do not become a magistrate via arrests.
5. Higher rank means patrol tools, investigative clues and coverage, not unlimited running speed or guaranteed arrests. Maintain escape routes for the vendor.

## Optional 1v1: same mechanics, human rival

- Room has exactly two human slots: 1 Vendor + 1 Police. AI still controls customers, traffic and ambient pedestrians; there is no second AI policeman competing with the police player.
- Same street map, stock, sale RNG distribution, upgrades, pursuit and cooldown; the human officer simply replaces AI police or the human vendor replaces AI vendor.
- **The officer's choice must be visible to the vendor**, and each resolution affects both clients atomically (payment, arrest, jail, release, rank and vendor cash). Capture cannot be resolved twice.
- If the vendor goes to jail, show a shared end-of-run screen and offer rematch/swap roles. If an illicit payment resolves, vendor returns to the same running career with cash deducted; police integrity falls; police gets no lawful-arrest promotion.
- There is no forced arcade deathmatch timer in the default experience. Optional private-room challenges may add a timer and result summary later without changing sale/pursuit/capture rules.
- Start fair: each new online room uses the same default starting state. Never mix unverified solo localStorage balances into the online authoritative state.

## Suggested gamification to finish (NOT yet implemented)

- Structured vendor goals: first sale, 5 sales in a day, survive 3 chases, level milestones, successful level-10 stall, district mastery.
- Police goals: first verified capture, multiple lawful arrests, maintain high integrity, track and catch without unfair revealing, operation event.
- Session rewards: XP, badges, Bengali street-life achievements, cosmetic cart/police appearance unlocks. No purchases using real money required.
- Progression loops: short-term (sale and chase), medium-term (upgrade and rank), long-term (district and cosmetic mastery).
- Fairness controls: spawn protection, stamina balance, patrol visibility, sale interruption rules, AFK guard, lobby abuse prevention, capture distance, cooldown and reconnect tests.
- Metrics: vendor sales/min, survival time, chase escapes, earnings/hour, upgrade progression; police lawful arrests/hour, capture time and integrity; 1v1 rematches and disconnect rates.

## Implementation gates and current reality

**In prototype:** Role select, local solo movement, basic randomized sales and cash, stock/restock, levels 1–12, wanted heat and chase, cooldown, capture decisions, police rank HUD, primitive level-10 stall and magistrate-event notification.

**Partial or missing:** Real customer queue and business economy, fully balanced progression, robust animations/collision/AI, complete bulldozer event, rewards/goals/badges and persistent saves, unified server-authoritative simulation, private room/invite, real-time state replication, two-browser 1v1 test, reconnect handling, production deployment and live URL verification.

**Acceptance gates:**
1. Solo vendor survives a full sell -> chase -> escape -> cooldown -> sell cycle, every payout/stock change occurs once.
2. Solo police can pursue, make capture decisions and progress rank with shared rules.
3. Two real browsers can join one room, see each other's movement, and reproduce solo's sale/escape/capture rules with shared server-trusted state.
4. A bribe, arrest, disconnection or simultaneous action cannot create contradictory client states or duplicate currency.
5. Mobile and desktop gameplay retain proper 3D frame performance; controls don't obscure gameplay.
6. Only call the game **LIVE** after verified deployment on an actual public URL, with solo and 1v1 production smoke tests.
