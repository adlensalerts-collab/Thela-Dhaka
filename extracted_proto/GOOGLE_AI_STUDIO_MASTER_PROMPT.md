# GOOGLE AI STUDIO — MASTER BUILD PROMPT (READY v1.1)
## THELA DHAKA — ঢাকার ঠেলা | ORIGINAL 3D WEB GAME

You are the lead game engineer, gameplay designer, 3D technical artist, multiplayer engineer, and QA owner for an ORIGINAL web game based on Dhaka's street vending culture. Implement the game, not just describe it. The attached `src/main.js`, `index.html`, and `package.json` are a new original TRUE Three.js/WebGL playable solo prototype. Preserve its source and behavior, refine its real 3D world, animations, game engine, and UI. Do not regress to a flat 2D or isometric Canvas renderer. The existing code is an early prototype, not a production-ready game. If this reference is not imported, implement from the specification. If the user supplies screenshots of Baper Rasta, use them as visual references, NOT code or assets to copy.

## CREATIVE GOAL
A chaotic, funny, warm, distinctly Bangladeshi street-life survival/rivalry game: **Thela Gari Wala vs Police**. Think readable low-poly, atmospheric 3D streets, a third-person follow camera, lively crowds, rickshaw art, street noises, Bengali signboards, handcarts, tropical sunlight and recognizable Dhaka urban textures. The visual quality target is **at least the technical polish of Baper Rasta (বাপের রাস্তা)**, with superior character readability, moving pushcarts, selling interactions, upgraded lighting, active NPCs, polished HUD, responsive controls and fair multiplayer. DO NOT reproduce the original game's assets, layout, code, characters or branding. Create all-original artistic assets.

References supplied by the user:
- https://baperrasta.online/ (embeds the official game; the original is https://baperrasta.com/)
- https://www.youtube.com/watch?v=VAyUobHfhyU (user-supplied gameplay reference; do not claim to have watched it if inaccessible)
- Accompanying user images of the Baper Rasta third-person camera, buildings, flyover and street detail, if available in the AI Studio project

## MANDATORY TECH STACK
1. Google AI Studio BUILD MODE, web app, TypeScript, React (menus and HUD only), Vite, **Three.js or React Three Fiber** for true 3D graphics/WebGL. Game scene is driven with an efficient `requestAnimationFrame` loop, not full React rerenders every frame.
2. Real player avatar rig, parented cart model / push animation, third-person camera with spring follow and optional elevated camera angle, fog and warm ambient/directional lighting, soft shadows, roads, sidewalks, mesh buildings, animated NPCs, props and low-cost particle effects.
3. Start with original procedural meshes and primitive geometry plus original custom textures. No copied commercial 3D models or imagery. All decorative signs must use original fictional Bengali shop names. Support Noto Sans Bengali alongside Poppins for UI.
4. Physics and collision: simple capsule/AABB or reliable lightweight physics library, preventing walking through buildings/traffic/stalls. The cart cannot pass through impossible gaps. Support at least 30 frames/s on average modern mobile, 60 frames/s target desktop. Use instancing and scene culling/LOD as needed.
5. Node.js server with Socket.IO or equivalent authoritative WebSocket game rooms. The server MUST authoritatively determine cash, inventory, sale durations, timestamps, arrest proximity, capture outcomes, heat, cooldown, upgrades, rank, large stall demolition and match scores. Never trust client prices, positions, wallets or awards.
6. Use AI Studio server-side capabilities for matchmaking and rooms. For the first multiplayer release, use one room per two users with short invite code/link and in-memory session state; do not add paid cloud infrastructure without approval. Persist optional saved progression via Firebase only when needed. No real-time Gemini inference per game frame.
7. Build source modularly: `game/simulation`, `game/systems/{movement,sales,heat,arrest,upgrade,AI}`, `game/world`, `game/render`, `network/client`, `server`, `ui`, `shared/types`. Include lint, typecheck, deterministic gameplay tests and a real two-browser multiplayer smoke test.

## EXACT GAME MODES
- **Solo Vendor:** human vendor vs AI police. Full selling / earning / heat / chase / escape / jail / upgrades loop.
- **Solo Police:** human police vs AI vendor. Full patrol / pursuit / close-range arrest / choices / promotion loop. The AI vendor MUST actually move, sell and flee.
- **Online 1v1 with Friend:** create room -> copy code/link -> friend joins from another real browser -> assign opposing roles -> ready -> synchronized round start. Show both moving avatars on the SAME map with authoritative state and acceptable latency. Handle disconnect, reconnect grace, room capacity, stale inputs, duplicate event rejection. The police player must never be AI in this mode.
- **Optional Local 1v1:** shared keyboard for test only; never misrepresent this as online multiplayer.

## VENDOR CORE LOOP
1. Spawn in a playable Dhaka neighborhood with an actual wooden/metal THELA pushcart, 10 inventory units and ৳250 virtual cash. Camera follows behind the moving avatar/cart.
2. Customers wander, approach the cart and request products. Available items: seasonal fruit, vegetables, snacks, tea and eventually prepared street food. Each transaction has random **5–10 seconds REAL-TIME** waiting and an on-world countdown/progress indicator. Price is randomized and higher-duration orders have a greater EXPECTED reward. Ensure fair fluctuations; no money before valid completion.
3. Player can reposition the cart on actual roads/footpaths, park and serve shoppers, restock from wholesale nodes, and upgrade with earnings. Sale cancels cleanly if player moves too far, is caught or loses the customer. Each completed sale deducts exactly 1 stock unit and pays once.
4. Escalation: higher cart level increases stock capacity, average price, size, footprint, visibility and police attention. Explicit risk/benefit stats before purchase. Wanted stars 0–5 show growing enforcement heat.
5. Police AI (or multiplayer friend) can approach and pursue. Vendor CANNOT fight or harm officers; dodge through streets, alleys and traffic to escape. Line-of-sight loss and distance trigger a visible COOLING countdown. The loop is **SELL -> POLICE ALERT -> RUN -> COOLDOWN -> SELL AGAIN**.
6. On capture, the fictional officer can demand an unlawful in-game bribe. Paying subtracts virtual cash (never real money). If insufficient cash, jail ends vendor's current run. This is satire: bribery is unlawful, not a legal 'fee'. Avoid text that falsely suggests all real officers behave this way.
7. Level 10 unlocks a large unauthorized fixed food cart, street kitchen or similar structure. It increases revenue but becomes an obvious target for a **fictional court-authorized enforcement operation**. Show a warning, preparation period and bulldozer arrival. The equipment damages only a stationary structure, not human characters. Player can retreat and recover, but loses stall investment.
8. Run-end newspaper-style funny Bangla summary: money earned, items sold, chases escaped, upgrade reached, police encounters. Original design, not a copy of the Baper Rasta ending screen.

## POLICE STORY
1. Spawn as a patrol Constable on the SAME street map; a full 3D character with uniform inspired by Bangladeshi policing but no official emblem misuse. Patrol, search, chase; press `E` only at verified close range and low relative speed to capture.
2. Capture choices:
   A. **Record arrest**: progress toward rank, improve public-duty score and end/reset vendor run as applicable.
   B. **Illicit payment**: gain only fictional in-game cash, reduce integrity, **no arrest credit**. Include meaningful gameplay penalty so bribery is not the optimal guaranteed strategy.
3. Role levels/ranks may use a fictional gameplay ladder loosely inspired by Constable -> ASI -> SI -> Inspector. **Magistrate is NOT a police rank in Bangladesh.** Implement Magistrate as an independent *special endgame event / administrative authority* unlocked by score, not a police promotion. Real mobile courts are led by executive magistrates and may involve police support.
4. Unlock patrol mobility, better communications, wider patrol coverage, AI backup (in solo), stronger street knowledge and eventually a Magistrate Operations mode. Balance vendor escape chances. Do not give police instant teleportation or capture at impossible distances.
5. Victory metrics: lawful arrests, pursuit success, integrity and time to capture; no glorification of physical violence.

## FIRST PLAYABLE NEIGHBORHOOD
Begin with a compact **Gulistan / New Market / Farmgate-inspired fictional Dhaka district**, not the whole real city. 4–8 navigable junctions, real 3D intersections, footpaths, overhead wires, urban storefronts, tea stalls, produce markets, rickshaws, CNGs, buses, trees, crowds, traffic noise, colorful Bengali signs, police patrols and small alley escape routes. Increase density without blocking paths. Plan later map districts: Mirpur, Motijheel, Old Dhaka, Shahbag. Do NOT claim real geospatial accuracy.

## CAMERA AND ART DIRECTION
- Camera: third-person elevated chase (default, matching browser 3D driving games). It follows vendor AND attached pushcart, slightly offset to see traffic ahead. Optional elevated/isometric view `C`, scroll/pinch zoom, sensible occlusion handling. Add automatic transparency on buildings that block the avatar.
- Low-poly/procedural 3D, not flat 2D, pixel-art, generic fantasy medieval textures or isometric CSS drawing. Materials: dusty roads, warm ochre and teal buildings, painted sheet-metal roofs, aged concrete, colorful carts and awnings, green trees, bright produce, believable day-night tint. Stylized and optimized, NOT photorealistic.
- UI: premium arcade HUD over game, minimal glass panels (cash, stock, level/rank, stars, timer, stamina, location, mini-map). Mobile controls overlay; big central controls don't obscure playing area. Clear action hints that change with proximity.
- Bengali-first personality with accessible English translations, consistent type size. Support Bangla glyph rendering and correct Taka signs. Fun fictional chatter and ambient sound, with one-click mute. UI should never look like a SaaS dashboard.
- Main menu: "THELA DHAKA" with clickable role cards "Start as Thela Gari Wala" and "Start as Police", followed by "Solo vs AI" and "1v1 Online". Press START immediately loads real game, not a mockup.

## BALANCING AND INPUT
- Vendor: WASD/arrows move; Shift sprint; E serve; R restock at relevant node; U upgrade; B deploy stall after level 10; C camera. Police: WASD/arrows move; Shift sprint; E attempt arrest; C camera. Mobile uses responsive thumbstick + context button.
- Start economy: ৳250, inventory 10, random sale 5–10 sec, base payouts varying around ৳35–110, level 1; costs and payout increase gradually. The exact economy must be data-driven (JSON config) and testable.
- Make risk meaningful. Vendor upgrade does not automatically equal instant arrest. Officer acceleration fair and line-of-sight / cover respected. Keep controls responsive. Add cooldown/time-out so neither player can spam the same arrest or sale event.
- Default online 1v1 mirrors the open-ended solo game WITHOUT a forced match timer or cash target. Police wins a round after a recorded arrest that sends the vendor to jail; bribery/release continues the round. Display shared results and offer rematch or swap roles. An OPTIONAL seven-minute challenge may be added later, but only as a selected scoring overlay that never changes core rules.

## SAFETY, PERSISTENCE, COPYRIGHT, HONESTY
- This is a fictional satire, not an accurate real-world depiction of Bangladesh law, all police or actual individual vendors. All virtual currency only. No explicit violence toward pedestrians or characters; crashes are purely cartoon physics if added later.
- Original 3D art, sounds and game text. Do not copy or extract resources from the reference website or YouTube video. No unauthorized logo or creator branding.
- Show the official game credit in project reference documentation only, not as implied sponsorship.
- Do not introduce paid cloud services without permission. AI Studio and Cloud Run can have quotas or billing. Server WebSocket support requires real network tests.
- Do NOT claim a public release is live until actual domain URL, deployed commit and two-browser behavior are verified. A shared AI Studio preview is not a production release.

## EXECUTION PHASES (DO NOW; DO NOT RETURN A PLAN INSTEAD OF WORK)
**Phase 1 — refine existing TRUE 3D vertical slice:** Import the attached Vite/Three.js project, run `npm install` and `npm run dev`, and confirm actual camera follow, 3D meshes, movement/collisions, customers, 5–10s real sales, money/stock HUD, AI police pursuit and capture. Fix defects and expand the Dhaka details. Move menu/HUD into React as appropriate while keeping simulation outside React. Do not overwrite these features with a landing page or a flat prototype.
**Phase 2 — both solo careers:** Add Police mode, AI vendor, capture, payment-vs-arrest, jail/retry, upgrade, alert and cooldown. Fix defects before proceeding.
**Phase 3 — online 1v1:** Add Node.js authoritative rooms; test TWO real clients simultaneously, movement, timed sales, choices, upgrades, outcomes, reconnect/disconnect. Default 1v1 uses the identical open-ended solo mechanics; timed challenge matches, if offered, are OPTIONAL and may only layer a clock/score over the unchanged simulation.
**Phase 4 — level 10 endgame:** Add big food stall, risk, timed court-authorized removal event with bulldozer and meaningful vendor recovery. Add Magistrate event separate from rank.
**Phase 5 — polish:** Populate streets, mobile HUD, audio, mini-map, readable Bengali text, FPS controls, instancing, original animated props, balance and game-over summary.
**Phase 6 — QA:** Include typecheck, lint, movement/collision tests, economy tests, sale duration and once-only payout, score/rank tests, capture integrity tests, two-client synchronization tests and browser desktop/mobile verification. Provide concise PASS/FAIL results with real evidence.

## MUST-PASS ACCEPTANCE
- A REAL Three.js/WebGL scene: camera moves, meshes exist in 3D, parallax/occlusion and perspective work.
- Vendor starts pushing an original cart, walks freely around a consistent Dhaka-inspired map; cannot walk through buildings.
- Customer approaches and a sale truly takes 5–10 seconds; cancelling does not pay; stock and cash sync exactly once.
- Police begins a pursuit when warranted; flee/cooldown loop is visible and functional. Capture succeeds only in legal game range.
- Police solo role performs real actions; bribe/arrest affects distinct metrics, rank increments only after arrest.
- Vendor upgrade increases revenue/inventory and risk, clearly displayed. At level 10, a stationary big food-cart and official-operation event exist.
- Two physical browsers can play opposite roles online; no client-side money or capture cheats.
- Mobile controls work; no crashes after 10 minutes gameplay on a mid-range device.
- The output has actual working code and a live local preview. If any phase is incomplete, explicitly name it and provide the next exact files rather than pretending completion.

START WITH PHASE 1. WRITE THE PROJECT FILES AND SHOW THE RUNNING GAME PREVIEW. BUILD ON THE ATTACHED TRUE 3D THREE.JS PROTOTYPE AND IMPROVE ITS RENDERING/ANIMATIONS AND KEEP ALL ORIGINAL GAME CODE AND ASSETS YOUR OWN.

## LOCKED GAMEPLAY / MULTIPLAYER DECISION (FOLLOW THIS ABOVE ALL OPTIONAL IDEAS)

The game has **one** shared simulation and **two** character roles. Players always can **Play Solo** instantly with AI opponent, while **Play with Friend** is an optional private-room 1v1 experience that substitutes a human opponent without changing gameplay, game map, progression logic, sale prices, inventory, cooldowns, capture/bribe rules or upgrade mechanics. Online must be server-authoritative. Do not create a separate multiplayer fighting game. See `GAMEPLAY_AND_1V1_RULES.md` for complete invariants, balancing defaults, status audit and production acceptance tests. Build a real two-browser synchronized private room before marking 1v1 complete. No account required to try solo or a guest 1v1 room. The current code does NOT yet contain online multiplayer: do not label it done unless implemented and tested.
