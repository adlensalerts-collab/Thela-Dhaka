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
