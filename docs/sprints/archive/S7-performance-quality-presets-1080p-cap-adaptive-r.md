# 7 — Performance: quality presets, 1080p cap, adaptive resolution, FPS limit + counter

Moved verbatim from sprint.md.

| # | Sprint | Status | Commit(s) | Verification notes |
|---|---|---|---|---|
| 7 | Performance: quality presets, 1080p cap, adaptive resolution, FPS limit + counter | ✅ | `d67685e` | Presets, 1080p cap, shadow-map rebuild, leaf-shadow toggle, Settings + FPS badge all pass. Bug (from Claude's spec): a 60/120 FPS limit above the screen's refresh rate, or one that doesn't divide it, makes adaptive resolution drop to 60% — 7 of 15 screen/limit combos affected; default "Max" unaffected. Also shadows on/off needs material recompile. → resolved by 7.2 |
