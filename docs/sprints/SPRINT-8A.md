# Sprint 8A — shared shop signs

Built against main `6faa95c91326734005fbfe461e423a659f5e32ab` on 2026-11-02. Uploaded as `a3235b5`; all six package files matched the repository exactly, and lint/Pages build were rerun successfully. Sprint 8 remains in progress.

## What changed

Shop boards share atlas textures, deduplicated by text and colour. Box geometry is merged per chunk and atlas page so the existing distance culling still works. Sign text, board dimensions, placement, colours, roughness and emissive strength follow the original implementation. Four-pixel gutters and inset UVs protect tile boundaries. No external assets or runtime dependencies were added.

`SignboardBatch` is in `src/game/render/signboards.ts`; `buildDistrictWorld` collects boards and flushes the batches. World stats now include `signBatches`, `signAtlasPages`, and `signTexturePixels`.

## Verification

Checks ran locally with the multiplayer repair at `6faa95c` included:

- `npm run lint`: PASS (`tsc --noEmit`).
- `GITHUB_PAGES=true VITE_STATIC_HOST=true npm run build`: PASS; existing large-bundle warning remains.
- `git diff --check`: PASS.
- Headless Chromium / SwiftShader: built old and new worlds for both bundled districts, compared geometry and collision, rendered both, and exercised vendor/police service-mode switches. Zero page errors.

| Check | New Market | Gulistan |
| --- | ---: | ---: |
| Original / resulting board count | 140 / 140 | 140 / 140 |
| Whole-district sign draw batches, before / after | 140 / 72 | 140 / 60 |
| Shared atlas textures | 2 | 2 |
| Sign texture pixels, before / after | 9,175,040 / 8,388,608 | 9,175,040 / 6,291,456 |
| Whole-scene draw calls in sampled spawn view, before / after | 259 / 248 | 186 / 170 |
| Sign-only draw calls in the same sampled view, before / after | 20 / 9 | 26 / 10 |
| Road-audit warnings | 0 | 0 |
| Garages / aarots | 5 / 6 | 5 / 6 |

Collision obstacle lists match the baseline exactly. Sign vertices match within 0.000016 m (the rounding from baking transforms into Float32 geometry). Rendering tests use one fixed view per district, medium chunk visibility, 960x540, and simple shared lighting. These are draw-call comparisons, not an FPS benchmark or full gameplay test. The local browser had no Bengali system font: both versions showed the same fallback glyphs, so Bengali glyph appearance on the deployed site still needs a visual check. Original text and font declarations are retained.

## Upload

Extract the archive and upload its `src` and `docs` folders from the repository root, preserving these exact paths:

- `src/game/render/signboards.ts` (new)
- `src/game/map/districtWorld.ts` (replace)
- `docs/map/PRODUCT.md` (replace)
- `docs/map/HOTSPOTS.md` (replace)
- `docs/sprints/ACTIVE.md` (replace)
- `docs/sprints/SPRINT-8A.md` (new)

No multiplayer file, map JSON, package manifest or workflow is included. This package was checked against `6faa95c`; if any of these six destination files change before upload, merge those changes rather than replacing them blindly. After the upload, refresh AI Studio from GitHub before its next edit or push. Do not upload the ZIP itself as a game file.

## Remaining Sprint 8 work

Road wear (cracks and repair patches), painted-marking refinements, and richer footpath/building details remain a separate deliverable. This package does not close Sprint 8 or certify Sprint 7.6 multiplayer gameplay.
