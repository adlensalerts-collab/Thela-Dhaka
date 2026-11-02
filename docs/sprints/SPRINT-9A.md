# Sprint 9A — skeletal animation foundation

Built against `f38c133` on 2026-11-02. Ready for manual upload. Sprint 8 was verified at that commit and is archived in this package; Sprint 9 remains in progress.

## Delivered

- A single local GLB containing the CC0 Quaternius standard mannequin and five locomotion-only clips: idle, walk, jog, sprint and push. File size 868,632 bytes; 53 bones, 13,743 triangles and two material draws per actor. Original root translation channels are removed to keep actor position controlled by the game when integrated later.
- `loadAnimatedCharacter()` caches the source request, clones independent skeletons/materials, shares immutable geometry, normalizes height to 1.98 m by default, crossfades actions and releases each actor's mixer/material/bone-texture resources independently. Failed network loads are removed from the cache for a later retry.
- A separate responsive `character-preview.html` entry with two independent mannequins, five motion buttons, speed control and orbit camera. The renderer is capped at 1920x1080 and 60 fps. This is a technical prototype; it does not represent the final vendor/police art.
- Vite's two-entry build preserves the existing game and publishes the preview under the same Pages base path. The ordinary game has no import of the new loader and makes no GLB request.
- Asset provenance, upstream revision, input/output SHA-256 values, full CC0 licence and a reproducible standard-library Python converter are included.

## Validation

- `npm run lint`: PASS (`tsc --noEmit`).
- `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build`: PASS; both HTML entries and the bundled GLB exist. Existing large-chunk/config-loader warnings remain.
- `git diff --check`: PASS.
- The converter regenerated a byte-identical GLB from the pinned glTF/bin sources.
- Headless Chromium / SwiftShader: five motion controls work, each clip changes bone poses, actor clones own distinct bones/materials and share geometry, and advancing actor A leaves B's pose untouched. The model is requested once across all clones.
- Thirty seconds of simulated animation preserves the actor group's X/Z position. No root-bone position animation tracks remain.
- Actor height normalizes to 1.98 m. Invalid height and invalid asset data reject correctly. Disposing one actor twice leaves the other animating/rendering: two actors use 4 material draws, the surviving actor uses 2 (no floor/shadow pass in this isolated count).
- Production preview returns HTTP 200 at `/Thela-Dhaka/character-preview.html`, works at 390 px mobile width without horizontal overflow, and the regular production game reaches its title menu with zero model requests. Zero page/console errors in both test runs.

These are loader/lifecycle/preview tests, not final character-art approval or a game FPS benchmark. Existing gameplay, collision, maps, crowd rig, camera, controls and multiplayer files are not changed by this package.

## Upload

Let AI Studio finish and push its separate `server.ts` stale-leave fix first. Then extract this archive and upload its paths from the repository root:

- `character-preview.html`
- `vite.config.ts`
- `scripts/prepare-character.py`
- `src/dev/characterPreview.ts`
- `src/game/world/animatedCharacter.ts`
- `public/assets/characters/locomotion-prototype.glb`
- `public/assets/characters/CC0-LICENSE.txt`
- `public/assets/characters/CREDITS.md`
- `docs/map/PRODUCT.md`
- `docs/map/HOTSPOTS.md`
- `docs/map/OPERATIONS.md`
- `docs/sprints/ACTIVE.md`
- `docs/sprints/INDEX.md`
- `docs/sprints/archive/S8-roads-textures.md`
- `docs/sprints/SPRINT-9A.md`

Do not upload `node_modules` or the ZIP itself. If a destination file changes after `f38c133`, merge that change before replacing it. The concurrent AI Studio task should touch only `server.ts`.

Refresh AI Studio from GitHub after uploading. After Pages finishes deploying, open:
https://adlensalerts-collab.github.io/Thela-Dhaka/character-preview.html

## Remaining Sprint 9 work

9B: produce or acquire suitable clothed Bangladeshi character art; match scale/forward axis and align vendor hands with the existing cart handles. Integrate the first hero model behind a procedural fallback and verify solo/online roles. The current mannequin is not a final skin or outfit.

9C: assess crowd LOD/rig reuse and update pedestrian animation integration without losing the compact 20–50 NPC performance budget. Complete multi-role, camera, collision, animation-transition and low-quality gameplay checks before closing Sprint 9. Do not replace every crowd NPC with the 13.7k-triangle prototype.
