# 7.2 — Hotfix: frame limiter + adaptive target, shadow toggle recompile, screen Hz in Settings

Moved verbatim from sprint.md.

| # | Sprint | Status | Commit(s) | Verification notes |
|---|---|---|---|---|
| 7.2 | Hotfix: frame limiter + adaptive target, shadow toggle recompile, screen Hz in Settings | ✅ | `4a4d5ff` | Limiter matches the logic tested on 42 cases (60–240 Hz × 3 limits, with jitter); `shadowsChanged` computed before the flag is overwritten; refresh rate re-measured on resize |
