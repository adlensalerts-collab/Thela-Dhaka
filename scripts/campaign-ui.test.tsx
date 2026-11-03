import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Campaign } from '../src/game/campaign';
import { StatsTracker } from '../src/game/stats';
import { EventModal } from '../src/components/EventModal';
import { StatsScreen } from '../src/components/StatsScreen';

const noop = () => {};
const callbacks = { onPayBribe: noop, onGoToJail: noop, onRecordArrest: noop, onTakeIllicit: noop,
  onResume: noop, onRestart: noop, onNextDay: noop, onRetryDay: noop,
  onStartEndless: noop, onNewCampaign: noop, onMainMenu: noop };
const healthy = { cash: 1000, stock: 10, otherSellableStock: 0, restockCost: 0, damage: 0,
  repairCost: 0, pendingSale: false, pendingRepair: false, pendingRestock: false };

test('old and current campaign-statistics aliases remain compatible after merge', () => {
  const tracker = new StatsTracker(); tracker.reset('vendor');
  const result = new Campaign().arrested('jailed', 0);
  const current = tracker.snapshot({ campaignResult: result, dayClockText: '10:00', result: 'jailed' });
  assert.strictEqual(current.campaign, result);
  assert.strictEqual(current.campaignResult, result);
  const legacy = { ...current, campaignResult: null, campaign: result };
  const markup = renderToStaticMarkup(<EventModal type="over" state={null} stats={legacy} {...callbacks} />);
  assert.match(markup, /Campaign result/);
  assert.match(markup, /10:00/);
  assert.equal((markup.match(/<h2/g) ?? []).length, 1);
  assert.equal((markup.match(/<button/g) ?? []).length, 2);
});

test('solo campaign uses its result shell with one heading, two actions and the actual jail time', () => {
  const tracker = new StatsTracker(); tracker.reset('vendor');
  const campaign = new Campaign();
  const stats = { ...tracker.snapshot({ result: 'jailed' }), dayClockText: '10:00', campaignResult: campaign.arrested('jailed', 0) };
  const markup = renderToStaticMarkup(<EventModal type="over" state={null} stats={stats} {...callbacks} />);
  assert.equal((markup.match(/<h2/g) ?? []).length, 1);
  assert.equal((markup.match(/<button/g) ?? []).length, 2);
  assert.match(markup, /10:00/);
  assert.doesNotMatch(markup, /22:00|২২:০০/);
  assert.match(markup, /New campaign/);
  assert.match(markup, /Days survived/);
  assert.match(markup, /Restock/);
});

test('legacy solo statistics also use the captured clock rather than assuming closing time', () => {
  const tracker = new StatsTracker();
  const stats = { ...tracker.snapshot({ result: 'jailed' }), dayClockText: '09:15' };
  const markup = renderToStaticMarkup(<StatsScreen stats={stats} onRestart={noop} onMainMenu={noop} />);
  assert.match(markup, /09:15/);
  assert.doesNotMatch(markup, /২২:০০/);
});

test('police and online endings retain their existing rematch/statistics branch', () => {
  for (const mode of ['police', 'online_vendor', 'online_police'] as const) {
    const tracker = new StatsTracker(); tracker.reset(mode);
    const markup = renderToStaticMarkup(<EventModal type="over" state={null} isOnline={mode !== 'police'}
      stats={tracker.snapshot({result:'jailed'})} {...callbacks} />);
    assert.doesNotMatch(markup, /Campaign result|Days survived/);
    assert.match(markup, mode === 'police' ? /Play Again/ : /Request rematch/);
  }
});

test('passed day routes to Next day and day ten routes to shop/Endless, without duplicate actions', () => {
  const campaign = new Campaign(), tracker = new StatsTracker();
  for (let day = 1; day <= 10; day++) {
    tracker.reset('vendor', day);
    tracker.earned = campaign.snapshot().target + 90; tracker.settleDayCosts();
    const result = campaign.closeDay(healthy, tracker.currentProfit());
    const stats = { ...tracker.snapshot({ result: result.outcome }), campaignResult: result, dayClockText: '22:00' };
    const markup = renderToStaticMarkup(<EventModal type="over" state={null} stats={stats} {...callbacks} />);
    assert.equal((markup.match(/<button/g) ?? []).length, 2);
    assert.match(markup, day === 10 ? /Endless mode/ : /Next day/);
    if (day < 10) campaign.nextDay();
  }
});
