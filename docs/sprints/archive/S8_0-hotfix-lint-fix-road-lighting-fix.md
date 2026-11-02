# 8.0 — Hotfix: lint fix + road/lighting fix

Moved verbatim from sprint.md.

| # | Sprint | Status | Deliverable |
|---|---|---|---|
| 8.0 | Hotfix: lint fix + road/lighting fix | ✅ `e439532` | (1) AI Studio's `b281707` used the old minimap function and state fields its lost `simulation.ts` half should have added → lint failed; fixed and fields declared (feature dormant until Sprint 15). (2) Water-like roads: real cause was the sky ambient light at 0.9 turning every surface light blue (plain grey road rendered 184,202,220); now 0.3 + matte warm asphalt + softer bumps (road renders 70,80,92). verified: all 5 files match, lint + Pages build pass |
