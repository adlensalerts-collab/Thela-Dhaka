export interface RemoteSnapshot {
  x: number;
  z: number;
  heading: number;
  speed: number;
  t: number;
}

export interface RemotePose {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

function lerpShortestAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let result = a + diff * t;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

export class RemoteActor {
  private snapshots: RemoteSnapshot[] = [];
  private readonly maxSnapshots = 10;
  private readonly interpDelayMs = 100;

  push(snapshot: RemoteSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.splice(0, this.snapshots.length - this.maxSnapshots);
    }
  }

  sample(now: number): RemotePose | null {
    const n = this.snapshots.length;
    if (n === 0) return null;
    if (n === 1) {
      const s = this.snapshots[0];
      const stale = now - s.t > 250;
      return {
        x: s.x,
        z: s.z,
        heading: s.heading,
        speed: stale ? 0 : s.speed
      };
    }

    const renderTime = now - this.interpDelayMs;
    const first = this.snapshots[0];
    const last = this.snapshots[n - 1];

    if (renderTime <= first.t) {
      return {
        x: first.x,
        z: first.z,
        heading: first.heading,
        speed: first.speed
      };
    }

    if (renderTime >= last.t) {
      // Hold the last pose (no extrapolation beyond 250 ms)
      const stale = now - last.t > 250;
      return {
        x: last.x,
        z: last.z,
        heading: last.heading,
        speed: stale ? 0 : last.speed
      };
    }

    for (let i = 0; i < n - 1; i++) {
      const a = this.snapshots[i];
      const b = this.snapshots[i + 1];
      if (renderTime >= a.t && renderTime <= b.t) {
        const span = b.t - a.t;
        const alpha = span > 0.0001 ? (renderTime - a.t) / span : 1;
        return {
          x: a.x + (b.x - a.x) * alpha,
          z: a.z + (b.z - a.z) * alpha,
          heading: lerpShortestAngle(a.heading, b.heading, alpha),
          speed: a.speed + (b.speed - a.speed) * alpha
        };
      }
    }

    return {
      x: last.x,
      z: last.z,
      heading: last.heading,
      speed: last.speed
    };
  }

  reset(): void {
    this.snapshots = [];
  }
}
