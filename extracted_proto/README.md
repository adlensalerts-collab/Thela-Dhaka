# ঠেলা ঢাকা / THELA DHAKA — 3D Web Starter v0.2

An original fictional Dhaka-inspired pushcart vendor versus police arcade game. The visual direction is **true Three.js/WebGL 3D with a third-person follow camera**, influenced by the *type* of streetscape and camera shown in the user-supplied Baper Rasta references — no code, art, textures, characters, name or sounds have been copied from that game.

## What is implemented in the starter source

- WebGL procedural Dhaka-inspired 3D street grid, shops, Bengali signs, pedestrians, trees, overhead structure, colourful rickshaws, and third-person camera.
- Two selectable solo roles, vendor pushcart and police, with keyboard input and basic touch controls.
- Vendor movement, nearby customers, randomized real-time 5–10 second selling, payout, stock, restocking, 12 upgrade levels, police chase, line-of-sight approximation, cooldown, bribe/jail satire, and level-10 stall.
- Police movement, AI vendor, close-range capture choice, arrest/rank progression, integrity cost for illicit payment, separate fictional Magistrate event unlock.
- Basic HUD, minimap, changing notifications and on-screen input controls.

This is **only an early developer starter**. Visuals are still primitive, collisions and AI are simplified, and balancing is unverified. It is NOT a completed Baper Rasta-quality scene, and is NOT a released game.

## Run locally (requires internet for one-time npm install)

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. AI Studio can import this source via GitHub or use the accompanying build prompt.

## Controls

Vendor: `WASD` / arrows move and turn; `Space` sprint, `E` sell to nearby customer, `R` restock, `U` upgrade, `B` place a level-10 stall; `C` camera zoom.

Police: `WASD` / arrows move and turn, `Space` sprint, `E` capture an AI vendor at close range, `X` special endgame operation after five arrests. Touch buttons support movement and E/run on small screens.

## Next production phases

1. Import starter into Google AI Studio Build, run it, test real WebGL rendering and interactions; repair bugs and tune city details/character animation.
2. Implement **server-authoritative** real online 1v1 with Node and Socket.IO; test two separate browsers, networking, reconnects, payouts and capture integrity.
3. Expand level-10 stall event, official operation, vehicle navigation, AI pathfinding, physics, mobile optimization, saved progression and balancing.
4. Deploy only after production test and verified URL. Avoid enabling paid services without express approval.

## Verification and limitations

- `node --check src/main.js`: passed syntactic parsing in the creation environment.
- Runtime not fully verified: this environment cannot reach public npm/CDN services, so Vite/Three.js dependencies were not installed, WebGL output and gameplay were not browser-tested here. An AI Studio browser run and fixes are still required.
- No real internet multiplayer, no Firebase persistence, no public deployment, no real money or official government endorsement. All bribery is portrayed as **fictional and unlawful**.
- A magistrate is not a Bangladesh Police rank; the game's Magistrate Operation is a separate fictional event.

## Reference

- Original third-party game: https://baperrasta.com/ (Baper Rasta, created by Omar Faruqe Riyad)
- User-supplied video: https://www.youtube.com/watch?v=VAyUobHfhyU (direct playback not accessible during review)
- Build environment: https://ai.google.dev/gemini-api/docs/aistudio-build-mode
- `GOOGLE_AI_STUDIO_MASTER_PROMPT.md` — detailed specification to paste into Google AI Studio.

## Game mechanics and optional multiplayer decision

See `GAMEPLAY_AND_1V1_RULES.md`: one game with two roles; solo is immediate with AI opponent; online 1v1 is an optional invite-room with a human opponent, using the **exact same** game rules. Online networking, authoritative game-state synchronization, and two-browser testing remain unimplemented.
