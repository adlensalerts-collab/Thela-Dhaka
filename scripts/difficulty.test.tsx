import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { difficultyForDay, dayBriefing } from '../src/game/difficulty';
import { LevelBriefing } from '../src/components/LevelBriefing';
import { EventModal } from '../src/components/EventModal';
import { Campaign } from '../src/game/campaign';
import { StatsTracker } from '../src/game/stats';

test('design anchors have exact police, vision and customer patience settings', () => {
  const expected = [
    [1, 2, 35, 24, 1, 20], [3, 3, 42, 36, 1, 18],
    [5, 4, 49, 36, 1.25, 16], [6, 5, 49, 48, 1.25, 15],
    [8, 6, 56, 48, 1.5, 13], [10, 7, 63, 60, 1.5, 12],
  ];
  for (const [day, police, vision, traffic, rage, patience] of expected) {
    const profile = difficultyForDay(day);
    assert.deepEqual([profile.policeCount, profile.policeVision, profile.trafficCount,
      profile.rageMultiplier, profile.customerPatience], [police, vision, traffic, rage, patience]);
    assert.ok(Object.isFrozen(profile));
  }
});

test('intermediate days interpolate, with integer police/traffic populations', () => {
  assert.equal(difficultyForDay(2).policeVision, 38.5);
  assert.equal(difficultyForDay(2).customerPatience, 19);
  assert.equal(difficultyForDay(2).policeCount, 3);
  assert.equal(difficultyForDay(4).rageMultiplier, 1.125);
  assert.equal(difficultyForDay(7).policeVision, 52.5);
  assert.equal(difficultyForDay(9).customerPatience, 12.5);
  assert.equal(difficultyForDay(9).trafficCount, 54);
  for (let day = 2; day <= 10; day++) {
    const previous = difficultyForDay(day - 1), current = difficultyForDay(day);
    for (const key of ['policeCount','policeVision','trafficCount','rageMultiplier'] as const) {
      assert.ok(current[key] >= previous[key]);
    }
    assert.ok(current.customerPatience <= previous.customerPatience);
    assert.ok(Number.isInteger(current.policeCount));
    assert.ok(Number.isInteger(current.trafficCount));
  }
});

test('Endless targets rise while police/traffic stay within the desktop simulation budget', () => {
  const ten = difficultyForDay(10), eleven = difficultyForDay(11), twenty = difficultyForDay(20);
  assert.equal(eleven.dayNumber, 11);
  for (const key of ['policeCount','policeVision','trafficCount','rageMultiplier','customerPatience'] as const) {
    assert.equal(eleven[key],ten[key]); assert.equal(twenty[key],ten[key]);
  }
  assert.ok(dayBriefing(11).target > dayBriefing(10).target);
});

test('briefings use campaign days for districts and never cart upgrade levels', () => {
  assert.equal(dayBriefing(5).district,'newmarket');
  assert.equal(dayBriefing(6).district,'gulistan');
  assert.equal(dayBriefing(1).target,600);
  assert.equal(difficultyForDay(2).patrolRoutes,false);
  assert.equal(difficultyForDay(3).patrolRoutes,true);
  for (const day of [0,-1,1.5,NaN,Infinity,1000]) assert.throws(()=>difficultyForDay(day));
});

test('level briefing shows the next target/settings and has only Start day / Main menu actions', () => {
  const markup = renderToStaticMarkup(<LevelBriefing dayNumber={6} onStart={()=>{}} onMainMenu={()=>{}} />);
  for (const text of ['Day 6','Gulistan','2,690','5 officers','49 m','48','15 s','Start day','Main menu']) {
    assert.ok(markup.includes(text),text);
  }
  assert.equal((markup.match(/<button/g) ?? []).length,2);
  assert.doesNotMatch(markup,/rageMultiplier|VITE_|simulation/);
});

test('result-to-briefing routing preserves the day result and rejects non-advanceable endings', () => {
  const campaign = new Campaign(), tracker = new StatsTracker();
  const condition = {cash:1000,stock:10,otherSellableStock:0,restockCost:0,damage:0,repairCost:0,
    pendingSale:false,pendingRestock:false,pendingRepair:false};
  const callbacks = {onPayBribe:()=>{},onGoToJail:()=>{},onRecordArrest:()=>{},onTakeIllicit:()=>{},
    onResume:()=>{},onRestart:()=>{},onNextDay:()=>{},onRetryDay:()=>{},
    onStartEndless:()=>{},onNewCampaign:()=>{},onMainMenu:()=>{}};
  const stats = {...tracker.snapshot(),campaignResult:campaign.closeDay(condition,600)};
  const markup = renderToStaticMarkup(<EventModal type="level_up" state={null} stats={stats} {...callbacks} />);
  assert.match(markup,/Day 2/); assert.match(markup,/Start day/);
  assert.equal(campaign.snapshot().dayNumber,1);
  assert.equal(campaign.snapshot().result?.outcome,'day_passed');
  const failed = {...stats,campaignResult:new Campaign().closeDay(condition,0)};
  assert.equal(renderToStaticMarkup(<EventModal type="level_up" state={null} stats={failed} {...callbacks} />),'');
});
