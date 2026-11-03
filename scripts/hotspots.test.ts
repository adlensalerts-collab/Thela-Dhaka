import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleHotspots, nearbyHotspot, hotspotPeriod, type HotspotSite } from '../src/game/hotspots';

const sites: HotspotSite[] = [
  {x:0,z:0,name:'Crossing',kind:'junction'},
  {x:10,z:0,name:'Market',kind:'marketplace'},
  {x:20,z:0,name:'College',kind:'college'},
  {x:30,z:0,name:'Bus stop',kind:'bus_stop'},
  {x:40,z:0,name:'Stadium',kind:'stadium'},
];
const names = (minutes: number) => scheduleHotspots(sites,minutes).active.map(site=>site.name);

test('office, bazaar, school and evening windows have exact opening/closing boundaries', () => {
  assert.deepEqual(names(8*60-1),[]);
  assert.deepEqual(names(8*60),['Crossing','Bus stop']);
  assert.deepEqual(names(10*60),[]);
  assert.deepEqual(names(11*60),['Market']);
  assert.deepEqual(names(13*60),['Market','College']);
  assert.deepEqual(names(14*60),[]);
  assert.deepEqual(names(17*60),['Crossing','Market','Bus stop','Stadium']);
  assert.deepEqual(names(20*60),['Market']);
  assert.deepEqual(names(22*60),[]);
});

test('quiet periods and closed days do not create customer waves', () => {
  for (const minute of [0,359,360,420,600,870,960,1320,1500]) {
    const schedule=scheduleHotspots(sites,minute);
    assert.equal(schedule.waveSize,0);assert.equal(schedule.active.length,0);
  }
  assert.equal(scheduleHotspots(sites,630).endsAt,'11:00');
  assert.equal(scheduleHotspots(sites,900).endsAt,'17:00');
});

test('peak market waves increase demand and night waves are smaller and less frequent', () => {
  const office=scheduleHotspots(sites,540), bazaar=scheduleHotspots(sites,720), night=scheduleHotspots(sites,1260);
  assert.ok(bazaar.waveSize>office.waveSize);
  assert.ok(night.waveSize<bazaar.waveSize);
  assert.ok(night.cooldownSeconds>bazaar.cooldownSeconds);
  assert.equal(bazaar.endsAt,'13:00');
  assert.equal(night.endsAt,'22:00');
});

test('non-campaign clocks retain legacy hotspots and wave cadence', () => {
  const schedule=scheduleHotspots(sites,NaN);
  assert.equal(schedule.period,'legacy');assert.equal(schedule.waveSize,3);assert.equal(schedule.cooldownSeconds,18);
  assert.deepEqual(schedule.active.map(site=>site.name),sites.map(site=>site.name));
});

test('schedules are immutable and sparse districts do not fabricate school/bus-stop locations', () => {
  const marketOnly=[sites[1]],before=structuredClone(marketOnly);
  assert.equal(scheduleHotspots(marketOnly,540).active.length,0);
  assert.deepEqual(scheduleHotspots(marketOnly,810).active.map(site=>site.kind),['marketplace']);
  const schedule=scheduleHotspots(marketOnly,720);
  assert.ok(Object.isFrozen(schedule));assert.ok(Object.isFrozen(schedule.active));assert.ok(Object.isFrozen(schedule.active[0]));
  assert.deepEqual(marketOnly,before);
  assert.equal(scheduleHotspots([],720).active.length,0);
});

test('hotspot detection uses the nearest active site, respects radius and resolves equal distances by demand', () => {
  const active=scheduleHotspots(sites,810).active;
  assert.equal(nearbyHotspot(active,19,0)?.name,'College');
  assert.equal(nearbyHotspot(active,15,0)?.name,'College');
  assert.equal(nearbyHotspot(active,200,200),null);
  assert.equal(nearbyHotspot([active[0]],40,0)?.name,'Market');
  assert.equal(nearbyHotspot([active[0]],40.01,0),null);
  assert.equal(nearbyHotspot([],0,0),null);
  assert.equal(hotspotPeriod(1320),'closed');
});
