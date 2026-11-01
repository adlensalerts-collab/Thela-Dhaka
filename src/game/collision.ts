import * as THREE from 'three';

export interface BoxObstacle {
  type: 'box';
  id?: string;
  x: number;
  z: number;
  hw: number; // half width (along X)
  hd: number; // half depth (along Z)
  tag?: string;
}

export interface CircleObstacle {
  type: 'circle';
  id?: string;
  x: number;
  z: number;
  radius: number;
  tag?: string;
}

export type Obstacle = BoxObstacle | CircleObstacle;

export interface CollisionResult {
  collided: boolean;
  normalX: number;
  normalZ: number;
  penetration: number;
  obstacle?: Obstacle;
}

/**
 * Circle vs Obstacle (Box or Circle) collision check.
 */
export function checkCircleVsObstacle(
  cx: number,
  cz: number,
  radius: number,
  obs: Obstacle
): CollisionResult {
  if (obs.type === 'circle') {
    const dx = cx - obs.x;
    const dz = cz - obs.z;
    const dist = Math.hypot(dx, dz);
    const minDist = radius + obs.radius;
    if (dist < minDist && dist > 0.0001) {
      return {
        collided: true,
        normalX: dx / dist,
        normalZ: dz / dist,
        penetration: minDist - dist,
        obstacle: obs
      };
    }
    return { collided: false, normalX: 0, normalZ: 0, penetration: 0 };
  }

  // Box obstacle (AABB)
  const closestX = THREE.MathUtils.clamp(cx, obs.x - obs.hw, obs.x + obs.hw);
  const closestZ = THREE.MathUtils.clamp(cz, obs.z - obs.hd, obs.z + obs.hd);
  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    let normalX = 0;
    let normalZ = 0;
    let penetration = radius;

    if (dist > 0.0001) {
      normalX = dx / dist;
      normalZ = dz / dist;
      penetration = radius - dist;
    } else {
      // Circle center inside box: find closest edge
      const distLeft = cx - (obs.x - obs.hw);
      const distRight = (obs.x + obs.hw) - cx;
      const distTop = cz - (obs.z - obs.hd);
      const distBottom = (obs.z + obs.hd) - cz;
      const minEdge = Math.min(distLeft, distRight, distTop, distBottom);

      if (minEdge === distLeft) { normalX = -1; normalZ = 0; penetration = radius + distLeft; }
      else if (minEdge === distRight) { normalX = 1; normalZ = 0; penetration = radius + distRight; }
      else if (minEdge === distTop) { normalX = 0; normalZ = -1; penetration = radius + distTop; }
      else { normalX = 0; normalZ = 1; penetration = radius + distBottom; }
    }

    return {
      collided: true,
      normalX,
      normalZ,
      penetration,
      obstacle: obs
    };
  }

  return { collided: false, normalX: 0, normalZ: 0, penetration: 0 };
}

/**
 * Checks collision for Player Rig (Avatar + Optional Pushcart).
 * In Vendor mode, player has two colliders:
 * 1. Avatar circle at (px, pz), radius 0.45
 * 2. Pushcart circle at (px + sin(heading)*1.35, pz - cos(heading)*1.35), radius 0.95
 * In Police mode, single collider at (px, pz), radius 0.55
 */
export function checkRigCollision(
  px: number,
  pz: number,
  heading: number,
  isVendor: boolean,
  obs: Obstacle
): CollisionResult {
  // Check avatar
  const avatarRadius = isVendor ? 0.45 : 0.55;
  const avatarRes = checkCircleVsObstacle(px, pz, avatarRadius, obs);
  if (avatarRes.collided) {
    return avatarRes;
  }

  // Check thela cart in front if vendor
  if (isVendor) {
    const cartDist = 1.35;
    const cartX = px + Math.sin(heading) * cartDist;
    const cartZ = pz - Math.cos(heading) * cartDist;
    const cartRadius = 0.95;
    const cartRes = checkCircleVsObstacle(cartX, cartZ, cartRadius, obs);
    if (cartRes.collided) {
      return cartRes;
    }
  }

  return { collided: false, normalX: 0, normalZ: 0, penetration: 0 };
}

/**
 * Resolves movement with continuous obstacle checking and wall sliding.
 * Prevents getting stuck when walking diagonally against obstacles.
 */
export function resolveMovement(
  currentX: number,
  currentZ: number,
  vx: number,
  vz: number,
  heading: number,
  isVendor: boolean,
  obstacles: Obstacle[],
  mapBound = 110
): { newX: number; newZ: number; collided: boolean; hitObstacle?: Obstacle; normalX: number; normalZ: number } {
  const targetX = currentX + vx;
  const targetZ = currentZ + vz;

  // Check map boundary first
  const clampedX = THREE.MathUtils.clamp(targetX, -mapBound, mapBound);
  const clampedZ = THREE.MathUtils.clamp(targetZ, -mapBound, mapBound);

  // 1. Try full movement (both X and Z)
  let fullCollision: CollisionResult | null = null;
  for (const obs of obstacles) {
    const res = checkRigCollision(clampedX, clampedZ, heading, isVendor, obs);
    if (res.collided) {
      fullCollision = res;
      break;
    }
  }

  if (!fullCollision) {
    return {
      newX: clampedX,
      newZ: clampedZ,
      collided: false,
      normalX: 0,
      normalZ: 0
    };
  }

  // 2. Collision detected on combined step: Try sliding along X axis only
  let xCollision = false;
  for (const obs of obstacles) {
    const res = checkRigCollision(clampedX, currentZ, heading, isVendor, obs);
    if (res.collided) {
      xCollision = true;
      break;
    }
  }

  if (!xCollision && Math.abs(vx) > 0.0001) {
    return {
      newX: clampedX,
      newZ: currentZ,
      collided: true,
      hitObstacle: fullCollision.obstacle,
      normalX: fullCollision.normalX,
      normalZ: fullCollision.normalZ
    };
  }

  // 3. Try sliding along Z axis only
  let zCollision = false;
  for (const obs of obstacles) {
    const res = checkRigCollision(currentX, clampedZ, heading, isVendor, obs);
    if (res.collided) {
      zCollision = true;
      break;
    }
  }

  if (!zCollision && Math.abs(vz) > 0.0001) {
    return {
      newX: currentX,
      newZ: clampedZ,
      collided: true,
      hitObstacle: fullCollision.obstacle,
      normalX: fullCollision.normalX,
      normalZ: fullCollision.normalZ
    };
  }

  // 4. Cornered / cannot slide: push out along normal slightly to prevent tunneling
  const pushOut = Math.min(fullCollision.penetration, 0.06);
  const pushedX = THREE.MathUtils.clamp(currentX + fullCollision.normalX * pushOut, -mapBound, mapBound);
  const pushedZ = THREE.MathUtils.clamp(currentZ + fullCollision.normalZ * pushOut, -mapBound, mapBound);

  return {
    newX: pushedX,
    newZ: pushedZ,
    collided: true,
    hitObstacle: fullCollision.obstacle,
    normalX: fullCollision.normalX,
    normalZ: fullCollision.normalZ
  };
}

/**
 * Dynamic collision with moving traffic (Rickshaws).
 */
export function checkTrafficImpact(
  px: number,
  pz: number,
  heading: number,
  isVendor: boolean,
  traffic: Array<{ mesh: THREE.Group; vertical: boolean; v: number }>
): { hit: boolean; rickshaw?: any; impactX: number; impactZ: number; impulseX: number; impulseZ: number } {
  const avatarRadius = isVendor ? 0.5 : 0.6;
  const cartX = isVendor ? px + Math.sin(heading) * 1.35 : px;
  const cartZ = isVendor ? pz - Math.cos(heading) * 1.35 : pz;
  const cartRadius = isVendor ? 0.95 : avatarRadius;

  for (const t of traffic) {
    const rx = t.mesh.position.x;
    const rz = t.mesh.position.z;

    // Rickshaw bounding box: roughly 1.7 width x 2.8 length
    // If vertical road, width is along X (0.95), depth along Z (1.5)
    // If horizontal road, width is along Z (0.95), depth along X (1.5)
    const hw = t.vertical ? 0.95 : 1.5;
    const hd = t.vertical ? 1.5 : 0.95;

    const boxObs: BoxObstacle = {
      type: 'box',
      x: rx,
      z: rz,
      hw,
      hd,
      tag: 'rickshaw'
    };

    // Check avatar and cart
    const hitAvatar = checkCircleVsObstacle(px, pz, avatarRadius, boxObs);
    const hitCart = isVendor ? checkCircleVsObstacle(cartX, cartZ, cartRadius, boxObs) : { collided: false, normalX: 0, normalZ: 0, penetration: 0 };

    if (hitAvatar.collided || hitCart.collided) {
      const best = hitAvatar.collided ? hitAvatar : hitCart;
      // Direction away from rickshaw
      let dirX = px - rx;
      let dirZ = pz - rz;
      const d = Math.hypot(dirX, dirZ) || 1;
      dirX /= d;
      dirZ /= d;

      // Add vehicle momentum
      const vehVx = t.vertical ? 0 : t.v;
      const vehVz = t.vertical ? t.v : 0;

      return {
        hit: true,
        rickshaw: t,
        impactX: (px + rx) / 2,
        impactZ: (pz + rz) / 2,
        impulseX: dirX * 3.5 + vehVx * 1.2,
        impulseZ: dirZ * 3.5 + vehVz * 1.2
      };
    }
  }

  return { hit: false, impactX: 0, impactZ: 0, impulseX: 0, impulseZ: 0 };
}
