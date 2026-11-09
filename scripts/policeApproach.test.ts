import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseApproacher,
  createApproach,
  stepApproach,
  type ApproachInput,
  type ApproachOutput,
} from '../src/game/policeApproach';

function makeOut(): ApproachOutput {
  return {
    phase: 'idle',
    targetX: 0,
    targetZ: 0,
    hasTarget: false,
    speed: 0,
    event: 'none',
  };
}

function baseInput(overrides: Partial<ApproachInput> = {}): ApproachInput {
  return {
    dt: 0.2,
    clock: 0,
    officerX: 0,
    officerZ: 15,
    vendorX: 0,
    vendorZ: 0,
    visible: true,
    alert: false,
    busy: false,
    vendorSelling: false,
    vendorSpeed: 0,
    ...overrides,
  };
}

test('spotting vendor enters noticing, then approach targeting ~3 m from vendor, then warn at <= 3.2 m', () => {
  const state = createApproach();
  const out = makeOut();
  let clock = 0;

  stepApproach(state, baseInput({ dt: 0.1, clock }), out);
  assert.equal(out.phase, 'noticing');
  assert.equal(out.event, 'spotted');
  assert.equal(out.hasTarget, false);
  assert.equal(state.encounters, 1);

  for (let i = 0; i < 8; i++) {
    clock += 0.1;
    stepApproach(state, baseInput({ dt: 0.1, clock }), out);
  }
  assert.equal(out.phase, 'approach');
  assert.equal(out.hasTarget, true);
  assert.ok(out.speed > 1.35 && out.speed < 3.55);
  assert.ok(Math.abs(Math.hypot(out.targetX, out.targetZ) - 3.0) < 1e-6);

  clock += 0.2;
  stepApproach(state, baseInput({ dt: 0.2, clock, officerZ: 2.9 }), out);
  assert.equal(out.phase, 'warn');
  assert.equal(out.event, 'warning');
  assert.equal(out.hasTarget, false);
});

test('vendor moving away during warn triggers stand_down and enters cooldown', () => {
  const state = createApproach();
  const out = makeOut();
  let clock = 0;

  stepApproach(state, baseInput({ dt: 0.1, clock, officerZ: 2.8 }), out);
  clock += 0.9;
  stepApproach(state, baseInput({ dt: 0.9, clock, officerZ: 2.8 }), out);
  assert.equal(out.phase, 'warn');
  assert.equal(out.event, 'warning');

  clock += 0.5;
  stepApproach(state, baseInput({ dt: 0.5, clock, officerZ: 2.8, vendorZ: -5, vendorSpeed: 2.2 }), out);
  assert.equal(out.phase, 'cooldown');
  assert.equal(out.event, 'stand_down');
});

test('vendor selling or refusing to leave during warn triggers escalate', () => {
  const state = createApproach();
  const out = makeOut();
  let clock = 0;

  stepApproach(state, baseInput({ dt: 0.1, clock, officerZ: 2.8 }), out);
  clock += 0.9;
  stepApproach(state, baseInput({ dt: 0.9, clock, officerZ: 2.8 }), out);
  assert.equal(out.phase, 'warn');

  clock += 0.2;
  stepApproach(state, baseInput({ dt: 0.2, clock, officerZ: 2.8, vendorSelling: true }), out);
  assert.equal(out.phase, 'cooldown');
  assert.equal(out.event, 'escalate');

  // Refusing to leave after 5 s warning window also escalates
  const state2 = createApproach();
  stepApproach(state2, baseInput({ dt: 0.1, clock: 0, officerZ: 2.8 }), out);
  stepApproach(state2, baseInput({ dt: 0.9, clock: 0.9, officerZ: 2.8 }), out);
  assert.equal(out.phase, 'warn');
  for (let i = 0; i < 10; i++) {
    stepApproach(state2, baseInput({ dt: 0.5, clock: 1.4 + i * 0.5, officerZ: 2.8 }), out);
  }
  assert.equal(out.phase, 'cooldown');
  assert.equal(out.event, 'escalate');
});

test('losing sight during approach transitions to cooldown with lost event, and alert/busy resets to idle', () => {
  const state = createApproach();
  const out = makeOut();
  stepApproach(state, baseInput({ dt: 0.1, clock: 0 }), out);
  stepApproach(state, baseInput({ dt: 0.9, clock: 0.9 }), out);
  assert.equal(out.phase, 'approach');

  for (let i = 0; i < 8; i++) {
    stepApproach(state, baseInput({ dt: 0.5, clock: 1.4 + i * 0.5, visible: false }), out);
  }
  assert.equal(out.phase, 'cooldown');
  assert.equal(out.event, 'lost');

  // Alert immediately resets any active state to idle
  const state2 = createApproach();
  stepApproach(state2, baseInput({ dt: 0.1, clock: 0 }), out);
  assert.equal(out.phase, 'noticing');
  stepApproach(state2, baseInput({ dt: 0.1, clock: 0.1, alert: true }), out);
  assert.equal(out.phase, 'idle');
  assert.equal(out.event, 'none');
});

test('chooseApproacher selects nearest eligible visible officer and keeps currentId while eligible', () => {
  const candidates = [
    { id: 0, x: 0, z: 22, visible: true, busy: false },
    { id: 1, x: 0, z: 9, visible: true, busy: false },
    { id: 2, x: 0, z: 5, visible: true, busy: true },
    { id: 3, x: 0, z: 4, visible: false, busy: false },
  ];
  assert.equal(chooseApproacher(candidates, 0, 0, -1), 1);
  assert.equal(chooseApproacher(candidates, 0, 0, 0), 0);
  assert.equal(chooseApproacher(candidates, 0, 0, 2), 1);
});
