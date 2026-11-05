# AI Studio prompt — Sprint 15: Public Rage

Implement Sprint 15: Public Rage on a separate branch, `aistudio/15-public-rage`, from the latest `origin/main`. Codex is concurrently implementing Sprint 14: Smarter Police.

Read AGENTS.md → docs/map/PRODUCT.md → docs/map/HOTSPOTS.md and docs/game-design.md §5, then only relevant files. Before editing, verify districtWorld.ts exists and simulation.ts exports USE_REAL_MAP = true. Never edit .github/, map JSON, extracted_proto/, public/assets/aistudio/, or tools/.

## Avoid conflicts

- Use your own checkout/worktree and branch.
- Codex owns src/game/simulation.ts, src/game/campaignPolice.ts and police-specific modules/tests during Sprint 14.
- Build Sprint 15 in new modules: src/game/publicRage.ts, src/components/PublicRageHUD.tsx, and dedicated tests.
- Do not edit simulation.ts, pedestrians.ts, GameHUD.tsx, GameRadar.tsx, campaign.ts, stats.ts or shared documentation routers yet.
- Document precise integration points and required shared-file changes in docs/sprints/SPRINT-15-INTEGRATION.md. After Sprint 14 is merged, refresh from origin/main and apply integration in a separate commit. Do not overwrite shared files from an old copy.
- Push your feature branch; do not merge into main or update ACTIVE.md.

Implement a deterministic, testable controller with explicit incident inputs, update(dt), immutable snapshots and one-shot outcome events. Separate rendering from rules.

## Rules from game-design.md

- Pedestrian collision: +25 rage. Vehicle collision: +10.
- Sprinting into people on the footpath: +5/second.
- Abandoning a sale: +8.
- Blocking a junction beyond 10 seconds: +5. Define a bounded repeat policy so this cannot fire every frame.
- Apply the existing difficulty rage multiplier once. Clamp rage to 0–100. Decay by 4/second during incident-free calm periods.
- At 50–79: nearby civilians point/shout; customers within 30 m refuse sales.
- At 80–100: 3–8 nearby civilians pursue, slower than sprinting and without stamina depletion. Emit police-heat events; do not manipulate police AI.
- Escape after six continuous seconds without line of sight OR reaching 60 m separation. Reset rage to 60.
- Capture: lose 30% cash and half the stock, add 40 cart damage, surround/freeze the vendor for five seconds, then reset rage to 30. Define integer rounding explicitly.
- Three captures in one day cause an early failed day with reason "hospital". Preserve campaign retry and single settlement.
- Pause/menu time must not advance rage, pursuit, freeze or incident timers. New day/retry resets daily capture counts and pending outcomes.
- Scope this to solo vendor mode until multiplayer synchronization is designed.

Graphic by design (owner decision, Nov 2026): show injuries, blood and beatings (hit reactions, mob beating on capture, brawls). No NPC health bars; adult characters only (child/school-age models flee and never fight or get hurt); nobody dies; no dismemberment or gore piles. Blood is cheap: instanced decals (max 24, 8 on Low) plus short particles. The legacy hostile/injured pedestrian mechanic may be reworked for this, but only as reviewed, bounded code. Reuse compact rigs and existing crowd capacity; avoid per-person UI meshes or unbounded allocations. No borrowed Baper Rasta sounds, art or text.

The integration document must cover collisions, cancelled sales, junction blocking, sales refusal, police heat, crowd movement and graphic reactions, HUD, campaign/statistics outcomes and lifecycle cleanup. An isolated module must not be described as fully integrated.

Test incident amounts/multiplier, thresholds, decay, bounded repeat incidents, escape boundaries, capture rounding, five-second freeze, three-capture failure, pause, resets, repeated update/event idempotency and invalid inputs. Run npm run lint, relevant existing tests, and production/Pages builds. Report branch, commit, passed checks and pending integration explicitly.
