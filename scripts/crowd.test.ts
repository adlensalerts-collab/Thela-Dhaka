/**
 * Sprint 10 — crowd behaviour checks on the real New Market footpath graph (Node, no WebGL).
 * Run: npx tsx --test scripts/crowd.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal canvas stub: humans.ts paints a few checked cloth textures with a 2D canvas.
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }), set: () => true });
(globalThis as any).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };

const THREE = await import('three');
const { getDistrict } = await import('../src/game/map/districtData');
const { RoadGraph } = await import('../src/game/map/roadGraph');
const { buildFootpathGraph } = await import('../src/game/map/footpathGraph');
const { GraphTraffic } = await import('../src/game/map/graphTraffic');
const { PedestrianManager } = await import('../src/game/pedestrians');
const sched = await import('../src/game/crowd/crowdSchedule');

test('schedule: density follows the working day', () => {
  assert.equal(sched.activeFraction(6 * 60), 0.45);
  assert.equal(sched.activeFraction(12 * 60), 1);
  assert.equal(sched.activeFraction(22 * 60), 0.55);
  assert.equal(sched.activeFraction(3 * 60), 0.45);            // clamped to 06:00
  assert.equal(sched.activeFraction(Number.NaN), 1);           // bad input → midday
  assert.ok(sched.activeFraction(7 * 60) > 0.45 && sched.activeFraction(7 * 60) < 0.85);
  assert.ok(sched.hotspotWeight('junction', 9 * 60) > sched.hotspotWeight('marketplace', 9 * 60));
  assert.ok(sched.hotspotWeight('marketplace', 12 * 60) > sched.hotspotWeight('junction', 12 * 60));
  assert.ok(sched.hotspotWeight('college', 13 * 60 + 30) > 2);
  assert.equal(sched.weightedIndex([0, 0], 0.5), -1);
  assert.equal(sched.weightedIndex([1, 0, 3], 0.9), 2);
});

const d = getDistrict('newmarket');
const roads = new RoadGraph(d);
const graph = buildFootpathGraph(d, roads);
const scene = new THREE.Scene();
const traffic = new GraphTraffic(scene, roads, 36);
const spawn = d.sites.spawn ?? [0, 0];
/** Busiest hotspot (the camera and the test accident go where people are). */
const busy = d.sites.hotspots.find((h) => h.kind === 'marketplace') ?? d.sites.hotspots[0];
const cam: [number, number] = [busy.x, busy.z];

function makeCrowd(count = 120) {
  const m = new PedestrianManager(scene, graph, count);
  m.bounds = { x: d.bounds.halfWidth, z: d.bounds.halfDepth };
  m.setHotspots(d.sites.hotspots);
  m.setBrowsePoints(d.sites.stalls.map((s) => ({
    x: s.entrance?.[0] ?? s.x, z: s.entrance?.[1] ?? s.z, fx: -(s.front?.[0] ?? 0), fz: -(s.front?.[1] ?? 1)
  })));
  m.setRoadProbes({
    isOnCarriageway: (x, z) => roads.isOnCarriageway(x, z),
    vehicleNear: (x, z, r) => traffic.vehicles.some((v) => Math.hypot(v.mesh.position.x - x, v.mesh.position.z - z) < r)
  });
  return m;
}

test('120 people: behaviours appear, nobody loiters on the road, detail tiers hold', () => {
  const m = makeCrowd(120);
  assert.equal(m.pedestrians.length, 120);
  m.setTimeOfDay(12 * 60);
  const dt = 1 / 30;
  const seen = { chat: 0, phone: 0, stall: 0, look: 0, wait: 0 };
  let roadSamples = 0, samples = 0, nanCount = 0, maxNear = 0;
  for (let f = 0; f < 30 * 240; f++) {                              // 4 game minutes
    traffic.update(dt, cam[0], cam[1]);
    m.update(dt);
    m.updateDetail(cam[0], cam[1], 16);
    const st = m.crowdStats;
    maxNear = Math.max(maxNear, st.near);
    if (f % 15 === 0) {
      seen.chat = Math.max(seen.chat, st.chatting); seen.phone = Math.max(seen.phone, st.phones);
      seen.stall = Math.max(seen.stall, st.browsing); seen.wait += st.waitingToCross;
      for (const p of m.pedestrians) {
        if (!p.active) continue;
        const { x, z } = p.mesh.position;
        if (!Number.isFinite(x) || !Number.isFinite(z)) nanCount++;
        samples++;
        // standing (not walking) on a carriageway would mean loitering in traffic
        if (p.state !== 'walking' && roads.isOnCarriageway(x, z)) roadSamples++;
      }
    }
  }
  // accident beside the busiest walker cluster near the camera
  const near = m.pedestrians.filter((p) => p.active && Math.hypot(p.mesh.position.x - cam[0], p.mesh.position.z - cam[1]) < 60);
  const crowdAround = (q: (typeof near)[number]) => near.filter((o) => Math.hypot(o.mesh.position.x - q.mesh.position.x, o.mesh.position.z - q.mesh.position.z) < 30).length;
  const busiest = near.sort((a, b) => crowdAround(b) - crowdAround(a))[0];
  const at = busiest?.mesh.position ?? { x: cam[0], z: cam[1] };
  m.notifyEvent('accident', at.x, at.z);
  for (let f = 0; f < 30 * 12; f++) {
    m.update(dt); m.updateDetail(cam[0], cam[1], 16);
    seen.look = Math.max(seen.look, m.crowdStats.watching);
  }
  const st = m.crowdStats;
  console.log('behaviours seen', seen, 'stand-on-road %', (100 * roadSamples / samples).toFixed(3), 'maxNear', maxNear, st);
  assert.equal(nanCount, 0);
  assert.ok(seen.chat >= 2, 'chat groups form');
  assert.ok(seen.phone >= 3, 'phone use');
  assert.ok(seen.stall >= 1, 'stall browsing');
  assert.ok(seen.wait >= 1, 'people wait at kerbs for traffic');
  assert.ok(seen.look >= 2, 'people react to an accident');
  assert.ok(roadSamples / samples < 0.01, 'almost nobody stands on a carriageway');
  assert.ok(maxNear > 0 && maxNear <= 16 + 6, 'near tier used and within the budget');
  assert.equal(st.impostors, st.far, 'every far person is drawn by an impostor');
});

test('density: early morning parks people out of sight, then refills', () => {
  const m = makeCrowd(100);
  const dt = 1 / 30;
  m.setTimeOfDay(6 * 60);                                      // 45%
  for (let f = 0; f < 30 * 30; f++) { m.update(dt); m.updateDetail(spawn[0], spawn[1], 16); }
  const early = m.crowdStats.active;
  m.setTimeOfDay(12 * 60);                                     // 100%
  for (let f = 0; f < 30 * 30; f++) { m.update(dt); m.updateDetail(spawn[0], spawn[1], 16); }
  const noon = m.crowdStats.active;
  console.log('active early', early, 'noon', noon);
  assert.ok(early <= 50 && early >= 40, `early ≈ 45 (got ${early})`);
  assert.ok(noon >= 95, `noon ≈ 100 (got ${noon})`);
  // nobody popped in or out within 95 m of the camera
  for (const p of m.pedestrians) if (!p.active) assert.ok(!p.mesh.visible);
});

test('hotspot customers still come and wait', () => {
  const m = makeCrowd(60);
  const n = m.summonCustomers(spawn[0], spawn[1], 3, 55);
  assert.equal(n, 3);
  let waiting = 0;
  for (let f = 0; f < 30 * 40 && waiting < 3; f++) {
    m.update(1 / 30);
    waiting = m.pedestrians.filter((p) => p.state === 'browsing').length;
  }
  assert.ok(waiting >= 2, `customers arrive and wait (got ${waiting})`);
  const { pedestrian } = m.getNearestPedestrian(spawn[0], spawn[1]);
  assert.ok(pedestrian && pedestrian.active);
});

// ------------------------------------------------------------------ Sprint 15g: street fights
function fightCrowd() {
  const m = makeCrowd(80);
  m.setTimeOfDay(12 * 60);
  const dt = 1 / 30;
  for (let f = 0; f < 30 * 20; f++) { traffic.update(dt, cam[0], cam[1]); m.update(dt); m.updateDetail(cam[0], cam[1], 16); }
  const isFree = (p: any) => (m as any).isFree(p, true);
  const free = m.pedestrians.filter((p: any) => p.active && isFree(p));
  assert.ok(free.length >= 6, 'enough free people to stage a fight');
  const [a, b, ...rest] = free as any[];
  b.mesh.position.set(a.mesh.position.x + 4, 0, a.mesh.position.z);
  return { m, a, b, rest, dt };
}
const bloodCount = (m: any) => Array.from((m.bloodDecals as any).active as ArrayLike<unknown>).filter(Boolean).length;
const run = (m: any, dt: number, seconds: number) => { for (let f = 0; f < seconds / dt; f++) { m.update(dt); m.updateDetail(cam[0], cam[1], 16); } };

test('15g: two people square up, trade blows, the loser falls bleeding and the winner walks off', () => {
  const { m, a, b, dt } = fightCrowd();
  const bloodBefore = bloodCount(m);
  assert.equal(m.startFight(a, b), true);
  assert.equal(a.state, 'brawl'); assert.equal(b.state, 'brawl');
  assert.equal(m.fights.length, 1); assert.ok(m.activeFightPoint());
  const phases = new Set<string>();
  let afterBlood = bloodBefore, loserInjured = false, winnerBrawling = false;
  for (let f = 0; f < 30 * 30 && m.fights.length; f++) {
    m.update(dt); m.updateDetail(cam[0], cam[1], 16);
    const rec = m.fights[0];
    if (rec) {
      phases.add(rec.phase);
      if (rec.phase === 'aftermath') {
        loserInjured = [a, b].some((p: any) => p.state === 'injured' && p.isInjured);
        winnerBrawling = !!rec.winner && rec.winner.state === 'brawl';
        afterBlood = bloodCount(m);
      }
    }
    for (const p of [a, b] as any[]) { assert.ok(Number.isFinite(p.mesh.position.x) && Number.isFinite(p.mesh.position.z)); }
  }
  assert.deepEqual([...phases].sort(), ['aftermath', 'approach', 'brawl', 'faceoff']);
  assert.equal(loserInjured, true, 'the loser is knocked down');
  assert.equal(winnerBrawling, true, 'the winner stands over them');
  assert.ok(afterBlood > bloodBefore, 'blood on the ground');
  assert.equal(m.fights.length, 0, 'the fight ends');
  run(m, dt, 12);
  for (const p of [a, b] as any[]) { assert.notEqual(p.state, 'brawl'); assert.equal(p.fight, null); }
  assert.equal(m.fightsStarted, 1);
});

test('15g: onlookers stop and watch, and an officer nearby breaks the fight up with no injury', () => {
  const { m, a, b, rest, dt } = fightCrowd();
  const watcher = rest.find((p: any) => Math.hypot(p.mesh.position.x - a.mesh.position.x, p.mesh.position.z - a.mesh.position.z) < 14);
  if (watcher) { watcher.mesh.position.set(a.mesh.position.x + 5, 0, a.mesh.position.z + 3); }
  const bloodBefore = bloodCount(m);
  assert.equal(m.startFight(a, b), true);
  if (watcher) assert.equal(watcher.activity, 'look', 'a bystander turns to watch');
  run(m, dt, 2);
  assert.equal(m.fights.length, 1);
  const point = m.activeFightPoint()!;
  m.officers = [{ x: point.x + 6, z: point.z }];
  run(m, dt, 0.2);
  assert.equal(m.fights.length, 0, 'officer within 14 m: fight over');
  for (const p of [a, b] as any[]) { assert.notEqual(p.state, 'brawl'); assert.equal(p.isInjured, false); assert.ok(p.hurryTimer > 0, 'they hurry away'); }
  assert.equal(bloodCount(m), bloodBefore, 'no blood when police stop it early');
});

test('15g: adults only, free people only, and a vendor knock-down interrupts the fight', () => {
  const { m, a, b, rest, dt } = fightCrowd();
  const c = rest[0] as any;
  const real = c.archetype;
  c.archetype = { ...real, name: 'Schoolchild' };
  assert.equal(m.startFight(a, c), false, 'children never fight');
  c.archetype = real;
  b.isEngagedInSale = true;
  assert.equal(m.startFight(a, b), false, 'someone in a sale cannot be pulled into a fight');
  b.isEngagedInSale = false;
  assert.equal(m.startFight(a, b), true);
  assert.equal(m.startFight(a, c), false, 'already fighting');
  run(m, dt, 3);
  a.state = 'injured'; a.injuredTimer = 4.2;                 // what a hard thela hit does
  run(m, dt, 0.1);
  assert.equal(m.fights.length, 0);
  assert.notEqual(b.state, 'brawl');
});

test('15g: the auto-trigger picks the nearest free pair near the camera and fight rate follows rage', () => {
  const { m, a, b, rest, dt } = fightCrowd();
  const others = rest as any[];
  for (const p of others) { p.mesh.position.set(cam[0] + 300, 0, cam[1] + 300); }   // everyone else far away
  a.mesh.position.set(cam[0] + 12, 0, cam[1]); b.mesh.position.set(cam[0] + 14, 0, cam[1]);
  a.lod = 'near'; b.lod = 'near';
  (m as any).tryStartFight();
  assert.equal(m.fights.length, 1, 'the pair 2 m apart and 12 m from the camera fights');
  assert.ok(m.fights[0].a === a || m.fights[0].b === a);
  run(m, dt, 0.1);
  m.setFightRate(2);
  assert.equal((m as any).fightEvery, 30);
  m.setFightRate(Number.NaN);
  assert.equal((m as any).fightEvery, 60);
});
