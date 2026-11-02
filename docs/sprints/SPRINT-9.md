# Sprint 9 — remaining character implementation

Built against `52ffdf7` on 2026-11-02, on top of the verified 9A upload. Ready for manual upload. Keep Sprint 9 open until these uploaded files are verified; then archive its ACTIVE.md row verbatim and add an INDEX.md entry.

## Delivered

- Clothed, stylized human-proportioned vendor, police and civilian appearances: lungi with checked gamchha, shirt/trousers, panjabi, cap, beard and backpack options. Skin/hair/clothes are resolved from the existing rig appearance options. Face, black hair, clothes and accessories are original runtime geometry; no extra art download or dependency was added.
- The existing CC0 rig and five skeletal clips are reused. The mannequin's visible geometry is replaced by one vertex-coloured skinned mesh per detailed actor. The existing `locomotion-prototype.glb`, CC0 licence and rig provenance remain intact; the binary checksum is unchanged.
- Hero integration covers the player vendor, police officer, NPC vendor and online opponents through `createHumanRig`/`animateHuman`. Motion follows simulation dt and movement intensity, with idle/walk/jog/sprint transitions and a push loop. Actor transforms and physics remain engine-controlled.
- Vendor palm grips are solved after the push animation at the existing handle targets: X -0.55/+0.55, Y 1.05, Z -0.48 in cart-root space. A new actor's push pose is initialized before hiding its procedural fallback.
- Existing procedural/compact rigs remain usable while the asset loads and on failure. Detailed crowd instances are limited to Low 0, Medium 2, High 4, Ultra 6, with distance and selection hysteresis. Distant NPCs keep compact models. Crowd population, paths, service behaviour and collision are unchanged. Temporary LOD visuals are disposed when released; hero and crowd resources are disposed on engine stop.
- The separate preview now displays the clothed roles and has a cart-grip checkbox, with local lighting/shadows, orbit control and speed/motion controls. The existing render limits remain in place.

## Validation

- `npm run lint`: PASS (`tsc --noEmit`).
- `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build`: PASS, including both HTML entries. Existing large-bundle and Vite config-loader warnings remain.
- `git diff --check`: PASS.
- Headless Chromium/SwiftShader: all five preview motions and skinning render with zero shader/page errors. All vertex skin weights sum to 1 within 0.0001.
- Over 480 manually advanced samples at idle/walk/jog/sprint intensities with a translated/rotated cart parent, maximum palm grip error was 0.000070 m (under 0.1 mm). This is measured pose alignment, not a finger-contact physics simulation.
- Isolated vendor render: 34 material draws for the procedural fallback, 1 for the new skinned visual (cart/shadows excluded). The dressed vendor has 7,348 triangles.
- A 50-person test pool retained detail counts 6/4/2/0 for Ultra/High/Medium/Low. Releasing detail restored fallback body/leg visibility and preserved independent NPC overlay visibility.
- GameEngine checks exercised solo vendor, solo police, online vendor and online police; remote snapshots did not move the locally controlled player. Garage cart upgrade and timed aarot restock passed; real-map road audit returned 0. Low quality retained the existing 20 pedestrians. Hero resources disposed on stop.
- Blocked GLB requests retained the visible procedural model (40 meshes in the police fallback sample), with no uncaught page errors. Disposing during a delayed load prevented a late character from being attached.
- Two real browser tabs created/joined a room through the latest menu and started as online vendor/police. Each tab requested the shared GLB once; no page errors. The test scheduler was limited to 2 fps for software rendering; this was a functional check, not a multiplayer latency/FPS benchmark.
- The production build's preview returned HTTP 200 under `/Thela-Dhaka/character-preview.html`; mobile width 390 px had no horizontal overflow. The production game title menu loaded with one shared GLB request and no page errors.

These tests do not certify 60 fps on every user's GPU, final art approval, or every multiplayer rematch/menu edge case from `52ffdf7`. The new characters are stylized clothed adults, not photorealistic scans. Existing dormant public-rage behaviour is not enabled or expanded.

## Upload

The ZIP contains these exact repository-relative paths:

- `character-preview.html`
- `src/dev/characterPreview.ts`
- `src/game/simulation.ts`
- `src/game/world/humans.ts`
- `src/game/world/animatedCharacter.ts`
- `src/game/world/characterAppearance.ts`
- `src/game/world/characterIK.ts`
- `src/game/world/characterVisual.ts`
- `public/assets/characters/CREDITS.md`
- `docs/map/PRODUCT.md`
- `docs/map/HOTSPOTS.md`
- `docs/map/OPERATIONS.md`
- `docs/sprints/ACTIVE.md`
- `docs/sprints/SPRINT-9.md`

Extract and upload `src`, `public`, `docs` and `character-preview.html` at the repository root, preserving the archive paths. The already-uploaded 9A GLB is required and is not duplicated in this ZIP. Do not upload the ZIP itself or node_modules.

No `server.ts`, `src/App.tsx`, `TitleScreen.tsx`, `EventModal.tsx`, `StatsScreen.tsx`, workflow or map JSON is included. The character work was combined locally with `52ffdf7`; if a listed destination file changes after that commit, merge the newer change before replacing it. Let any current AI Studio task finish and push first. Refresh AI Studio from GitHub after this upload and before its next edit/push.

After Pages deploys, inspect the clothed-role gallery and cart-grip check at:
https://adlensalerts-collab.github.io/Thela-Dhaka/character-preview.html

After upload verification, close Sprint 9 and proceed to Sprint 10's expanded crowd behaviour/population work. Reuse the bounded skeletal visual system rather than giving all distant NPCs detailed skeletons.
