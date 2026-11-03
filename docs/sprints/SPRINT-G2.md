# G2 — campaign package

Built alongside AI Studio's G1 work. **Not yet wired into gameplay.** This checkout
does not contain G1. The package deliberately adds no changes to simulation.ts,
stats.ts, StatsScreen.tsx, App.tsx, multiplayer or map geometry. Do not mark G2 done
until the integration and gameplay checks below pass against the landed G1 code.

## Files

- `src/game/campaign.ts`: deterministic campaign state, terminal reasons, target
  calculation, next/retry day, Level 10 shop victory and Endless continuation.
- `src/components/CampaignEnding.tsx`: bilingual result shell, profit target,
  campaign totals, original CSS shop illustration and result-specific actions.
- `scripts/campaign.test.tsx`: rule boundaries, lifecycle and server-rendered UI checks.

The controller has no dependency on the game clock, React or three.js. The shell
accepts G1's statistics cards as children. It does not replace online or police UI.
No dependency or package.json change is required.

## Package verification (2026-11-03)

- 13 focused rule/lifecycle/rendering tests passed.
- `npm run lint` passed.
- Normal and GitHub Pages production builds passed. Existing Vite configuration
  and large-chunk warnings remain.
- Browser gameplay and G1 integration have not been verified. The current game
  builds do not import these new files yet; type checking and the rendering tests
  validate the package independently.
- Base checkout: `52ffdf7`. No existing gameplay file was replaced.
- The upload ZIP contains only new files and a small documentation patch. Apply
  `map-docs.patch` locally with `git apply map-docs.patch`, or merge its three table
  rows by hand after refreshing G1. Do not upload the patch as a game source file.

## Rules and explicit interpretations

- Existing `GameState.level` is cart level. `Campaign.snapshot().dayNumber` is
  working-day level; never substitute one for the other in upgrade/repair costs.
- Targets use `round(600 * 1.35 ** (dayNumber - 1))`, including Endless. Formula
  takes precedence over the approximate Level 10 amount in the design document.
- Immediate bankruptcy requires cash < 20, zero cart and other sellable stock,
  inability to afford the actual restock quote, and no pending transaction that
  could recover the player. A decorative stall mesh does not count as inventory.
- Damage 100 alone does not end a solo campaign. At closing, damage >= 100 and
  insufficient repair money ends it as destroyed. Exactly enough money is not an
  unaffordable-repair defeat. Actual `damage.repairCost(cartLevel)` is authoritative.
- At closing, wreck defeat takes priority over bankruptcy, then target result.
- Existing jail / unaffordable bribe events remain distinct terminal reasons.
- Pass day 10 to see the New Market shop; failing day 10 offers retry. Endless
  starts on day 11 with a higher target and does not repeat the shop victory.
- Failed target attempts retain their profit in campaign totals; retry adds no
  separate penalty. `daysSurvived` counts nonfatal completed attempts, including
  target failures. `daysPassed` counts passes. Best-day profit includes the final
  partial day on a terminal defeat. Negative best-day values are retained.
- G1 retains authority over wallet changes and rent/food settlement. Calling
  this controller NEVER deducts money. Pass its already-computed net profit;
  don't subtract opening cash or expenses again.
- Result and totals snapshots are frozen. Repeated closing/defeat callbacks
  return the same result without counting profit twice. Invalid transitions throw.

## Integration after G1 lands

1. Refresh from GitHub AFTER G1 is pushed, then add this package's new files.
   Merge the two router rows in PRODUCT.md and test-command row in OPERATIONS.md;
   do not replace those documents with an older copy.
2. Add one `Campaign` instance per **solo vendor campaign**, owned by the engine.
   Recreate it only for a new campaign, never for next/retry day. Do not instantiate
   it for solo police or online modes. Expose a campaign snapshot alongside the
   existing published state using an optional field or a separate typed callback.
3. Replace G1's target calculation with `campaign.snapshot().target` (or assert
   agreement). Take the day number from this snapshot. Keep G1's dt clock,
   pause behavior, sale accounting and cost settlement.
4. Build `VendorCondition` from engine state:

   ```ts
   const condition = {
     cash: state.cash,
     stock: state.stock,
     otherSellableStock: 0, // Current stall model holds no separate sellable stock.
     restockCost: Math.max(0, state.cap - state.stock) * 7,
     damage: damage.damage,
     repairCost: damage.repairCost(state.level), // CART level
     pendingSale: !!state.sale,
     pendingRestock: !!state.restocking,
     pendingRepair: !!state.repairing,
   };
   ```

   Keep this adapter beside existing transaction code so quotes cannot drift.
   Update `otherSellableStock` if real stall inventory is added later.
5. During active solo play, after committed transactions, call
   `campaign.checkFailure(condition, currentDayNetProfit)`. On a returned result,
   stop the tick immediately, cancel transactions/customer engagements, clear
   input and show the final statistics. Stop before later callbacks can alter money.
6. Replace solo vendor's immediate `endRun('destroyed')` collision paths with a
   broken-cart notice. Preserve damage slowdown and garage repair. Leave police
   and online behavior unchanged. At G1's closing boundary, freeze transactions,
   settle G1 costs once, and call `campaign.closeDay(conditionAfterSettlement,
   settledNetProfit)` **before** G1 emits its ordinary pass/fail result. This must
   be the single result decision, not a second competing day-end callback.
7. In solo vendor jail/bribe-unaffordable paths, call
   `campaign.arrested(reason, currentDayNetProfit)` and attach its result to the
   same final statistics flow. Preserve the existing successful bribe behavior.
   Do not trigger these campaign calls for online vendors.
8. Render `CampaignEnding` only for a solo campaign result. Pass the frozen G1
   statistics cards as children (extract cards from StatsScreen if necessary;
   do not nest two result headings or two action bars). Keep existing online and
   police StatsScreen branches and their rematch callbacks.
9. Wire actions to `nextDay()`, `retryDay()` or `startEndless()` before restarting
   the day clock. Use a reset that accepts the campaign day number and does NOT
   reset the Campaign instance. New campaign creates a fresh Campaign. Main menu
   discards it. Disable/guard repeat clicks before starting the asynchronous world
   reset. On reset failure, show an error/retry rather than silently advancing again.
10. G1 currently starts fresh opening resources on replay. Retain that reset
    policy for next/retry/Endless, including clearing pending transactions, summons,
    inputs and stale callbacks. Campaign totals persist across those resets.
    Cart upgrades must never advance campaign day number.
11. When the day changes, use the existing district loading/world teardown paths:
    New Market days 1–5; Gulistan 6 onward. The shop ending is a UI illustration,
    not geometry placed in a road. Do not duplicate a world or leak render loops.
    G3 owns difficulty interpolation and its level-up presentation, not G2.

## Verification

Run `npx tsx --test scripts/campaign.test.tsx`, `npm run lint`, `npm run build`,
and the Pages build. These package checks cannot establish G1 integration.

After wiring, play-check: recover a broken cart at a garage; unaffordable wreck
at closing; bankrupt condition with and without stock/recovery; jail and successful
and unsuccessful bribes; failed-day retry; next-day reset; day 5→6 district reload;
pass/fail day 10; shop→Endless; menu→new campaign; solo police and online regression.
Check keyboard buttons and narrow-screen scrolling. Road audit must stay empty.
Only then update ACTIVE.md and archive G2 as required by AGENTS.md.
