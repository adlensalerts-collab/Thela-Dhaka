import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Campaign, campaignTarget, vendorFailure, type VendorCondition } from '../src/game/campaign';
import { CampaignEnding } from '../src/components/CampaignEnding';

const healthy: VendorCondition = {
  cash: 250, stock: 10, otherSellableStock: 0, restockCost: 70,
  damage: 0, repairCost: 0, pendingSale: false, pendingRestock: false, pendingRepair: false,
};
const empty = { ...healthy, cash: 19, stock: 0 };

test('bankruptcy requires all resources and recovery paths to be exhausted', () => {
  assert.equal(vendorFailure(empty), 'bankrupt');
  for (const change of [
    { cash: 20 }, { stock: 1 }, { otherSellableStock: 1 }, { restockCost: 19 },
    { pendingSale: true }, { pendingRestock: true }, { pendingRepair: true },
  ]) assert.equal(vendorFailure({ ...empty, ...change }), null);
  assert.equal(vendorFailure({ ...empty, cash: -90 }), 'bankrupt');
});

test('broken cart is recoverable before closing; affordability uses the actual repair quote', () => {
  const broken = { ...healthy, damage: 100, cash: 239, repairCost: 240 };
  assert.equal(vendorFailure(broken), null);
  assert.equal(vendorFailure(broken, true), 'destroyed');
  assert.equal(vendorFailure({ ...broken, cash: 240 }, true), null);
  assert.equal(vendorFailure({ ...broken, damage: 99 }, true), null);
});

test('closing wreck takes priority over an empty wallet and even a reached target', () => {
  const result = new Campaign().closeDay({ ...empty, damage: 100, repairCost: 240 }, 900);
  assert.equal(result.outcome, 'destroyed');
  assert.equal(result.totals.daysSurvived, 0);
});

test('exact target passes; a negative or just-below profit fails', () => {
  assert.equal(new Campaign().closeDay(healthy, 600).outcome, 'day_passed');
  assert.equal(new Campaign().closeDay(healthy, 599).outcome, 'day_failed');
  assert.equal(new Campaign().closeDay(healthy, -90).outcome, 'day_failed');
});

test('closing and arrest events cannot settle or count a result twice', () => {
  const campaign = new Campaign();
  const result = campaign.closeDay(healthy, 600);
  assert.strictEqual(campaign.closeDay(empty, -900), result);
  assert.strictEqual(campaign.arrested('jailed', 0), result);
  assert.strictEqual(campaign.checkFailure(empty, 0), result);
  assert.equal(campaign.snapshot().totals.totalProfit, 600);
});

test('failure can be checked repeatedly during normal play without changing totals', () => {
  const campaign = new Campaign();
  assert.equal(campaign.checkFailure(healthy, 400), null);
  assert.equal(campaign.checkFailure(healthy, 500), null);
  assert.equal(campaign.snapshot().totals.totalProfit, 0);
  const result = campaign.checkFailure(empty, -45)!;
  assert.equal(result.outcome, 'bankrupt');
  assert.equal(result.totals.totalProfit, -45);
});

test('jail and unaffordable bribe remain distinct terminal outcomes', () => {
  for (const reason of ['jailed', 'bribe_unaffordable'] as const) {
    const campaign = new Campaign();
    assert.equal(campaign.arrested(reason, 50).outcome, reason);
    assert.throws(() => campaign.nextDay());
    assert.throws(() => campaign.retryDay());
    assert.throws(() => campaign.startEndless());
  }
});

test('retry keeps the same day and preserves history without an added penalty', () => {
  const campaign = new Campaign();
  const first = campaign.closeDay(healthy, -10);
  const retry = campaign.retryDay();
  assert.equal(retry.dayNumber, 1);
  assert.equal(retry.result, null);
  assert.equal(retry.totals.totalProfit, -10);
  const second = campaign.closeDay(healthy, 600);
  assert.equal(second.totals.totalProfit, 590);
  assert.equal(second.totals.daysSurvived, 2);
  assert.equal(second.totals.daysPassed, 1);
  assert.equal(first.totals.totalProfit, -10);
  assert.equal(first.totals.bestDayProfit, -10);
});

test('progression reaches Gulistan on day 6 and shop victory only on passing day 10', () => {
  const campaign = new Campaign();
  let expectedProfit = 0;
  for (let day = 1; day <= 10; day++) {
    const before = campaign.snapshot();
    assert.equal(before.dayNumber, day);
    assert.equal(before.district, day < 6 ? 'newmarket' : 'gulistan');
    const result = campaign.closeDay(healthy, before.target);
    expectedProfit += before.target;
    assert.equal(result.outcome, day === 10 ? 'victory' : 'day_passed');
    assert.equal(result.totals.totalProfit, expectedProfit);
    if (day < 10) campaign.nextDay();
  }
  const victory = campaign.snapshot().result!;
  assert.equal(victory.totals.daysPassed, 10);
  assert.throws(() => campaign.nextDay());
  const endless = campaign.startEndless();
  assert.equal(endless.dayNumber, 11);
  assert.equal(endless.endless, true);
  assert.ok(endless.target > victory.target);
  assert.equal(campaign.closeDay(healthy, endless.target).outcome, 'day_passed');
  campaign.nextDay();
  assert.equal(campaign.snapshot().dayNumber, 12);
  assert.equal(victory.totals.levelReached, 10);
});

test('day 10 failure cannot unlock the shop or Endless', () => {
  const campaign = new Campaign();
  for (let day = 1; day < 10; day++) {
    campaign.closeDay(healthy, campaign.snapshot().target);
    campaign.nextDay();
  }
  assert.equal(campaign.closeDay(healthy, 0).outcome, 'day_failed');
  assert.throws(() => campaign.startEndless());
  assert.equal(campaign.retryDay().dayNumber, 10);
});

test('results and totals are immutable and transitions require the matching outcome', () => {
  const campaign = new Campaign();
  assert.throws(() => campaign.nextDay());
  assert.throws(() => campaign.retryDay());
  assert.throws(() => campaign.startEndless());
  const result = campaign.closeDay(healthy, 600);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.totals));
  assert.ok(Object.isFrozen(campaign.snapshot()));
  assert.throws(() => campaign.retryDay());
});

test('invalid currency or day inputs fail before changing the campaign', () => {
  for (const day of [0, -1, 1.5, NaN, Infinity, 1000]) assert.throws(() => campaignTarget(day));
  assert.equal(campaignTarget(10), Math.round(600 * 1.35 ** 9));
  const campaign = new Campaign();
  assert.throws(() => campaign.closeDay(healthy, NaN));
  assert.throws(() => campaign.closeDay({ ...healthy, repairCost: Infinity }, 600));
  assert.equal(campaign.snapshot().result, null);
});

test('ending shell renders day/failure/shop states, statistics slot and clamped progress accessibly', () => {
  const callback = () => {};
  const render = (result: ReturnType<Campaign['closeDay']>) => renderToStaticMarkup(
    <CampaignEnding result={result} onNextDay={callback} onRetryDay={callback}
      onStartEndless={callback} onNewCampaign={callback} onMainMenu={callback}>
      <p>Day statistics slot</p>
    </CampaignEnding>,
  );
  const negative = render(new Campaign().closeDay(healthy, -10));
  assert.match(negative, /Day failed/);
  assert.match(negative, /aria-valuenow="0"/);
  assert.match(negative, /Retry day/);
  assert.match(negative, /Day statistics slot/);
  const passed = render(new Campaign().closeDay(healthy, 900));
  assert.match(passed, /aria-valuenow="100"/);
  assert.match(passed, /Next day/);
  const bankrupt = render(new Campaign().closeDay(empty, -90));
  assert.match(bankrupt, /Bankrupt/);
  assert.match(bankrupt, /New campaign/);
  const campaign = new Campaign();
  for (let day = 1; day < 10; day++) {
    campaign.closeDay(healthy, campaign.snapshot().target);
    campaign.nextDay();
  }
  const victory = render(campaign.closeDay(healthy, campaign.snapshot().target));
  assert.match(victory, /Your own shop/);
  assert.match(victory, /New Market/);
  assert.match(victory, /Endless mode/);
});
