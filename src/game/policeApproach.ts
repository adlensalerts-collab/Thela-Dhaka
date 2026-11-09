export type ApproachPhase = 'idle' | 'noticing' | 'approach' | 'warn' | 'cooldown';
export type ApproachEvent = 'none' | 'spotted' | 'warning' | 'escalate' | 'stand_down' | 'lost';

export interface ApproachState {
  phase: ApproachPhase;
  timer: number;
  lostFor: number;
  warnedAt: number;
  lastGiveUpAt: number;
  encounters: number;
}

export interface ApproachInput {
  dt: number;
  clock: number;
  officerX: number;
  officerZ: number;
  vendorX: number;
  vendorZ: number;
  visible: boolean;
  alert: boolean;
  busy: boolean;
  vendorSelling: boolean;
  vendorSpeed: number;
}

export interface ApproachOutput {
  phase: ApproachPhase;
  targetX: number;
  targetZ: number;
  hasTarget: boolean;
  speed: number;
  event: ApproachEvent;
}

export interface ApproachCandidate {
  id: number;
  x: number;
  z: number;
  visible: boolean;
  busy: boolean;
  cooldown?: boolean;
}

const NOTICE_SECONDS = 0.8;
const NOTICE_LOST_SECONDS = 1.5;
const APPROACH_TIMEOUT_SECONDS = 14;
const APPROACH_LOST_SECONDS = 4.0;
const APPROACH_STOP_DISTANCE = 3.0;
const WARN_TRIGGER_DISTANCE = 3.2;
const WARN_SECONDS = 5.0;
const WARN_COMPLY_DISTANCE = 6.5;
const WARN_REFUSE_DISTANCE = 4.8;
const COOLDOWN_SECONDS = 25;
const APPROACH_SPEED = 1.95;

export function createApproach(): ApproachState {
  return {
    phase: 'idle',
    timer: 0,
    lostFor: 0,
    warnedAt: -Infinity,
    lastGiveUpAt: -Infinity,
    encounters: 0,
  };
}

function writeOut(
  out: ApproachOutput,
  phase: ApproachPhase,
  targetX: number,
  targetZ: number,
  hasTarget: boolean,
  speed: number,
  event: ApproachEvent
): void {
  out.phase = phase;
  out.targetX = targetX;
  out.targetZ = targetZ;
  out.hasTarget = hasTarget;
  out.speed = speed;
  out.event = event;
}

function enterCooldown(state: ApproachState, clock: number): void {
  state.phase = 'cooldown';
  state.timer = COOLDOWN_SECONDS;
  state.lostFor = 0;
  state.lastGiveUpAt = clock;
}

export function stepApproach(
  state: ApproachState,
  input: ApproachInput,
  out: ApproachOutput
): void {
  const { dt, clock, officerX, officerZ, vendorX, vendorZ, visible, alert, busy, vendorSelling } = input;
  if (!(dt > 0) || !Number.isFinite(dt)) {
    writeOut(out, state.phase, 0, 0, false, 0, 'none');
    return;
  }

  if (alert || busy) {
    state.phase = 'idle';
    state.timer = 0;
    state.lostFor = 0;
    writeOut(out, 'idle', 0, 0, false, 0, 'none');
    return;
  }

  const dx = officerX - vendorX;
  const dz = officerZ - vendorZ;
  const dist = Math.hypot(dx, dz);

  if (state.phase === 'cooldown') {
    state.timer -= dt;
    if (state.timer <= 1e-6) {
      state.phase = 'idle';
      state.timer = 0;
      state.lostFor = 0;
    }
    writeOut(out, state.phase, 0, 0, false, 0, 'none');
    return;
  }

  if (state.phase === 'idle') {
    if (visible) {
      state.phase = 'noticing';
      state.timer = NOTICE_SECONDS;
      state.lostFor = 0;
      state.encounters += 1;
      writeOut(out, 'noticing', vendorX, vendorZ, false, 0, 'spotted');
      return;
    }
    writeOut(out, 'idle', 0, 0, false, 0, 'none');
    return;
  }

  if (state.phase === 'noticing') {
    if (!visible) {
      state.lostFor += dt;
      if (state.lostFor >= NOTICE_LOST_SECONDS - 1e-6) {
        state.phase = 'idle';
        state.timer = 0;
        state.lostFor = 0;
        writeOut(out, 'idle', 0, 0, false, 0, 'lost');
        return;
      }
      writeOut(out, 'noticing', vendorX, vendorZ, false, 0, 'none');
      return;
    }

    state.lostFor = 0;
    state.timer -= dt;
    if (state.timer <= 1e-6) {
      if (dist <= WARN_TRIGGER_DISTANCE) {
        state.phase = 'warn';
        state.timer = WARN_SECONDS;
        state.warnedAt = clock;
        writeOut(out, 'warn', vendorX, vendorZ, false, 0, 'warning');
        return;
      }
      state.phase = 'approach';
      state.timer = APPROACH_TIMEOUT_SECONDS;
      const ux = dist > 1e-5 ? dx / dist : 0;
      const uz = dist > 1e-5 ? dz / dist : 1;
      writeOut(
        out,
        'approach',
        vendorX + ux * APPROACH_STOP_DISTANCE,
        vendorZ + uz * APPROACH_STOP_DISTANCE,
        true,
        APPROACH_SPEED,
        'none'
      );
      return;
    }
    writeOut(out, 'noticing', vendorX, vendorZ, false, 0, 'none');
    return;
  }

  if (state.phase === 'approach') {
    if (!visible) {
      state.lostFor += dt;
      if (state.lostFor >= APPROACH_LOST_SECONDS - 1e-6) {
        enterCooldown(state, clock);
        writeOut(out, 'cooldown', 0, 0, false, 0, 'lost');
        return;
      }
    } else {
      state.lostFor = 0;
    }

    if (visible && dist <= WARN_TRIGGER_DISTANCE) {
      state.phase = 'warn';
      state.timer = WARN_SECONDS;
      state.warnedAt = clock;
      state.lostFor = 0;
      writeOut(out, 'warn', vendorX, vendorZ, false, 0, 'warning');
      return;
    }

    state.timer -= dt;
    if (state.timer <= 1e-6) {
      enterCooldown(state, clock);
      writeOut(out, 'cooldown', 0, 0, false, 0, 'stand_down');
      return;
    }

    const ux = dist > 1e-5 ? dx / dist : 0;
    const uz = dist > 1e-5 ? dz / dist : 1;
    writeOut(
      out,
      'approach',
      vendorX + ux * APPROACH_STOP_DISTANCE,
      vendorZ + uz * APPROACH_STOP_DISTANCE,
      true,
      APPROACH_SPEED,
      'none'
    );
    return;
  }

  if (state.phase === 'warn') {
    if (vendorSelling) {
      enterCooldown(state, clock);
      writeOut(out, 'cooldown', 0, 0, false, 0, 'escalate');
      return;
    }

    if (!visible) {
      state.lostFor += dt;
      if (state.lostFor >= 3.0 - 1e-6) {
        enterCooldown(state, clock);
        writeOut(out, 'cooldown', 0, 0, false, 0, 'stand_down');
        return;
      }
    } else {
      state.lostFor = 0;
    }

    if (dist >= WARN_COMPLY_DISTANCE) {
      enterCooldown(state, clock);
      writeOut(out, 'cooldown', 0, 0, false, 0, 'stand_down');
      return;
    }

    state.timer -= dt;
    if (state.timer <= 1e-6) {
      const event: ApproachEvent = dist <= WARN_REFUSE_DISTANCE ? 'escalate' : 'stand_down';
      enterCooldown(state, clock);
      writeOut(out, 'cooldown', 0, 0, false, 0, event);
      return;
    }

    writeOut(out, 'warn', vendorX, vendorZ, false, 0, 'none');
  }
}

export function chooseApproacher(
  candidates: ReadonlyArray<ApproachCandidate>,
  vendorX: number,
  vendorZ: number,
  currentId = -1
): number {
  if (currentId >= 0) {
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.id === currentId && !c.busy && !c.cooldown && c.visible) {
        return currentId;
      }
    }
  }

  let bestId = -1;
  let bestDist = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.visible || c.busy || c.cooldown) continue;
    const d = Math.hypot(c.x - vendorX, c.z - vendorZ);
    if (d < bestDist) {
      bestDist = d;
      bestId = c.id;
    }
  }
  return bestId;
}
