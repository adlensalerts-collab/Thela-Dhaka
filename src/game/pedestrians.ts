import * as THREE from 'three';
import { SidewalkGraph } from './pathfinding';
import { createHumanRig, outfitForArchetype } from './world/humans';

export interface PedestrianArchetype {
  name: string;
  bnName: string;
  shirtColor: string;
  pantsColor: string;
  hasCap?: boolean;
  hasBag?: boolean;
  hasGamchha?: boolean;
  speed: number;
}

export interface PedestrianNPC {
  id: number;
  mesh: THREE.Group;
  archetype: PedestrianArchetype;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  body: THREE.Object3D;
  currentNodeId: number;
  targetNodeId: number;
  path: Array<{ x: number; z: number }>;
  pathIndex: number;
  speed: number;
  heading: number;
  state: 'walking' | 'idle' | 'browsing' | 'injured' | 'hostile';
  idleTimer: number;
  walkCycle: number;
  isEngagedInSale: boolean;
  isInjured: boolean;
  injuredTimer: number;
  hostileTimer: number;
  hitCooldown: number;
  attackCooldown: number;
  knockbackVx: number;
  knockbackVz: number;
  rage: number;
  damageTaken: number;
  rageSprite: THREE.Sprite;
  rageCanvas: HTMLCanvasElement;
  rageCtx: CanvasRenderingContext2D;
  rageTexture: THREE.CanvasTexture;
  lastRageKey: string;
}

const ARCHETYPES: PedestrianArchetype[] = [
  { name: 'Office Commuter', bnName: 'চাকুরিজীবী', shirtColor: '#8ca8c4', pantsColor: '#1d2736', speed: 1.6 },
  { name: 'Dhaka Uncle', bnName: 'চাচা', shirtColor: '#e8dec3', pantsColor: '#f0ece1', hasCap: true, speed: 1.3 },
  { name: 'College Student', bnName: 'কলেজ শিক্ষার্থী', shirtColor: '#4f7d5c', pantsColor: '#2b2a33', hasBag: true, speed: 1.8 },
  { name: 'Local Worker', bnName: 'শ্রমিক', shirtColor: '#c27d44', pantsColor: '#22555c', hasGamchha: true, speed: 1.5 },
  { name: 'Market Shopper', bnName: 'ক্রেতা', shirtColor: '#bf4343', pantsColor: '#26292b', speed: 1.4 },
  { name: 'Youth in Kurta', bnName: 'তরুণ', shirtColor: '#d6a036', pantsColor: '#2f343b', speed: 1.7 },
  { name: 'Passerby with Scarf', bnName: 'পথচারী', shirtColor: '#568b87', pantsColor: '#d4cfb8', hasGamchha: true, speed: 1.45 },
  { name: 'Senior Citizen', bnName: 'মুরুব্বি', shirtColor: '#ffffff', pantsColor: '#e3dfd3', hasCap: true, speed: 1.2 },
  { name: 'Tea Stall Regular', bnName: 'চা প্রেমিক', shirtColor: '#966046', pantsColor: '#1f2b38', speed: 1.55 }
];

export class PedestrianManager {
  scene: THREE.Scene;
  graph: SidewalkGraph;
  pedestrians: PedestrianNPC[] = [];
  poolSize: number;

  constructor(scene: THREE.Scene, graph: SidewalkGraph, count = 14) {
    this.scene = scene;
    this.graph = graph;
    this.poolSize = Math.max(10, Math.min(15, count));
    this.initPool();
  }

  private createRageMeterSprite(): {
    sprite: THREE.Sprite;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.65, 0.66, 1);
    sprite.position.set(0, 2.42, 0);
    sprite.renderOrder = 995;
    sprite.visible = false;
    return { sprite, canvas, ctx, texture };
  }

  private updateRageSprite(p: PedestrianNPC) {
    const isChasing = p.state === 'hostile' || p.state === 'injured';
    const displayRage = isChasing ? 100 : Math.min(100, Math.round(p.rage));

    if (displayRage <= 1 && !isChasing && p.damageTaken <= 0) {
      p.rageSprite.visible = false;
      return;
    }

    p.rageSprite.visible = true;
    const bob = isChasing || displayRage >= 70 ? Math.abs(Math.sin(p.walkCycle * 0.8)) * 0.1 : 0;
    p.rageSprite.position.y = 2.42 + bob;

    const pulse = isChasing || displayRage >= 70 ? Math.floor(p.walkCycle * 2.5) % 2 : 0;
    const dmgStep = Math.round(p.damageTaken / 5);
    const key = `${p.state}:${displayRage}:${pulse}:${dmgStep}`;
    if (key === p.lastRageKey) return;
    p.lastRageKey = key;

    const ctx = p.rageCtx;
    const w = p.rageCanvas.width;
    const h = p.rageCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Determine color tier based on rage buildup
    let accentColor = '#facc15'; // Yellow-Amber (annoyed)
    let statusText = 'রাগ · RAGE';
    if (isChasing) {
      accentColor = pulse ? '#ef4444' : '#fb7185';
      statusText = '! তাড়া করছে · CHASING';
    } else if (displayRage >= 70) {
      accentColor = pulse ? '#f97316' : '#ef4444';
      statusText = '! তেড়ে আসছে · READY TO CHASE';
    } else if (displayRage >= 40) {
      accentColor = '#f97316';
      statusText = 'ক্ষুব্ধ · AGITATED';
    }

    // Outer rounded HUD card
    const padX = 10;
    const padY = 8;
    const cardW = w - padX * 2;
    const cardH = h - padY * 2 - 10;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isChasing || displayRage >= 70 ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.roundRect(padX, padY, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();

    // Pointer triangle at bottom center pointing to NPC head
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 8, padY + cardH);
    ctx.lineTo(w / 2 + 8, padY + cardH);
    ctx.lineTo(w / 2, padY + cardH + 9);
    ctx.closePath();
    ctx.fill();

    // Header label + Rage percentage
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.fillText(statusText, padX + 12, padY + 18);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`${displayRage}%`, padX + cardW - 12, padY + 18);

    // Main Rage progress bar track
    const barX = padX + 12;
    const barY = padY + 33;
    const barW = cardW - 24;
    const barH = 16;

    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    // Rage progress fill with gradient
    const fillW = Math.max(0, Math.min(barW, (displayRage / 100) * barW));
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(0.55, '#f97316');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = isChasing && pulse ? '#f43f5e' : grad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 6);
      ctx.fill();
    }

    // Chasing threshold tick mark at 75% (warning zone)
    const warnX = barX + barW * 0.75;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(warnX, barY + 1);
    ctx.lineTo(warnX, barY + barH - 1);
    ctx.stroke();

    // Optional NPC Health / Injury strip at the bottom of the card when damaged
    if (p.damageTaken > 0) {
      const hpRatio = Math.max(0, (100 - p.damageTaken) / 100);
      const hpY = barY + barH + 7;
      ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
      ctx.fillRect(barX, hpY, barW, 5);
      ctx.fillStyle = hpRatio > 0.45 ? '#34d399' : '#f43f5e';
      ctx.fillRect(barX, hpY, barW * hpRatio, 5);
    }

    p.rageTexture.needsUpdate = true;
  }

  private createHumanMesh(archetype: PedestrianArchetype): {
    group: THREE.Group;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    body: THREE.Object3D;
    rageMeter: {
      sprite: THREE.Sprite;
      canvas: HTMLCanvasElement;
      ctx: CanvasRenderingContext2D;
      texture: THREE.CanvasTexture;
    };
  } {
    const rig = createHumanRig(outfitForArchetype(archetype));
    const rageMeter = this.createRageMeterSprite();
    rig.group.add(rageMeter.sprite);
    return {
      group: rig.group,
      leftLeg: rig.leftLeg,
      rightLeg: rig.rightLeg,
      leftArm: rig.leftArm,
      rightArm: rig.rightArm,
      body: rig.body,
      rageMeter
    };
  }

  private initPool() {
    for (let i = 0; i < this.poolSize; i++) {
      const archetype = ARCHETYPES[i % ARCHETYPES.length];
      const rig = this.createHumanMesh(archetype);

      // Start at a random node on the sidewalk graph
      const startNodeId = (Math.random() * this.graph.nodes.length) | 0;
      const startNode = this.graph.nodes[startNodeId];
      rig.group.position.set(startNode.x, 0, startNode.z);
      this.scene.add(rig.group);

      const targetNodeId = this.graph.getRandomDestination(startNodeId, 30);
      const path = this.graph.findAStarPath(startNodeId, targetNodeId);
      const firstStep = path.length > 1 ? path[1] : path[0] ?? startNode;
      const initDx = firstStep.x - startNode.x;
      const initDz = firstStep.z - startNode.z;
      const initialHeading =
        Math.hypot(initDx, initDz) > 0.01
          ? Math.atan2(initDx, -initDz)
          : Math.random() * Math.PI * 2;
      rig.group.rotation.y = -initialHeading;

      this.pedestrians.push({
        id: i,
        mesh: rig.group,
        archetype,
        leftLeg: rig.leftLeg,
        rightLeg: rig.rightLeg,
        leftArm: rig.leftArm,
        rightArm: rig.rightArm,
        body: rig.body,
        currentNodeId: startNodeId,
        targetNodeId,
        path: path.length > 1 ? path.slice(1) : path,
        pathIndex: 0,
        speed: archetype.speed * (0.9 + Math.random() * 0.25),
        heading: initialHeading,
        state: 'walking',
        idleTimer: 0,
        walkCycle: Math.random() * 10,
        isEngagedInSale: false,
        isInjured: false,
        injuredTimer: 0,
        hostileTimer: 0,
        hitCooldown: 0,
        attackCooldown: 0,
        knockbackVx: 0,
        knockbackVz: 0,
        rage: 0,
        damageTaken: 0,
        rageSprite: rig.rageMeter.sprite,
        rageCanvas: rig.rageMeter.canvas,
        rageCtx: rig.rageMeter.ctx,
        rageTexture: rig.rageMeter.texture,
        lastRageKey: ''
      });
    }
  }

  reset() {
    for (const p of this.pedestrians) {
      const startNodeId = (Math.random() * this.graph.nodes.length) | 0;
      const startNode = this.graph.nodes[startNodeId];
      p.mesh.position.set(startNode.x, 0, startNode.z);
      const targetNodeId = this.graph.getRandomDestination(startNodeId, 30);
      const path = this.graph.findAStarPath(startNodeId, targetNodeId);
      p.currentNodeId = startNodeId;
      p.targetNodeId = targetNodeId;
      p.path = path.length > 1 ? path.slice(1) : path;
      p.pathIndex = 0;
      p.state = 'walking';
      p.idleTimer = 0;
      p.isEngagedInSale = false;
      p.isInjured = false;
      p.injuredTimer = 0;
      p.hostileTimer = 0;
      p.hitCooldown = 0;
      p.attackCooldown = 0;
      p.knockbackVx = 0;
      p.knockbackVz = 0;
      p.rage = 0;
      p.damageTaken = 0;
      p.lastRageKey = '';
      p.body.rotation.set(0, 0, 0);
      p.leftArm.rotation.set(0, 0, -0.06);
      p.rightArm.rotation.set(0, 0, 0.06);
      p.leftLeg.rotation.set(0, 0, 0);
      p.rightLeg.rotation.set(0, 0, 0);
      p.rageSprite.visible = false;
    }
  }

  update(
    dt: number,
    vendorPos?: { x: number; z: number },
    stepHostileFn?: (mesh: THREE.Group, dirX: number, dirZ: number, speed: number) => number
  ) {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];

      if (p.hitCooldown > 0) p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

      // Apply physical knockback velocity if recently struck by the vendor's vehicle
      if (Math.abs(p.knockbackVx) > 0.02 || Math.abs(p.knockbackVz) > 0.02) {
        p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x + p.knockbackVx * dt, -108, 108);
        p.mesh.position.z = THREE.MathUtils.clamp(p.mesh.position.z + p.knockbackVz * dt, -108, 108);
        p.knockbackVx = THREE.MathUtils.damp(p.knockbackVx, 0, 7, dt);
        p.knockbackVz = THREE.MathUtils.damp(p.knockbackVz, 0, 7, dt);
      }

      // Injured state: pedestrian stumbles in pain after collision, then turns hostile to chase vendor
      if (p.state === 'injured') {
        p.rage = 100;
        p.walkCycle += dt * 10;
        p.injuredTimer -= dt;
        p.body.rotation.x = -0.55;
        p.body.rotation.z = Math.sin(p.walkCycle) * 0.25;
        p.leftArm.rotation.x = 0.65;
        p.rightArm.rotation.x = 0.65;
        p.leftLeg.rotation.x = -0.25;
        p.rightLeg.rotation.x = 0.25;

        if (p.injuredTimer <= 0) {
          p.state = 'hostile';
          p.body.rotation.x = 0;
          p.body.rotation.z = 0;
        }
        this.updateRageSprite(p);
        continue;
      }

      // Hostile state (GTA-style): chase after the vendor to beat him up
      if (p.state === 'hostile' && vendorPos) {
        p.rage = 100;
        p.hostileTimer -= dt;
        if (p.hostileTimer <= 0) {
          p.state = 'walking';
          p.rage = 30;
          p.body.rotation.x = 0;
          p.body.rotation.z = 0;
          this.updateRageSprite(p);
          continue;
        }

        const dx = vendorPos.x - p.mesh.position.x;
        const dz = vendorPos.z - p.mesh.position.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const dirX = dx / dist;
        const dirZ = dz / dist;

        const targetHeading = Math.atan2(dirX, -dirZ);
        let angleDiff = targetHeading - p.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.heading += angleDiff * Math.min(1, dt * 12);
        while (p.heading > Math.PI) p.heading -= Math.PI * 2;
        while (p.heading < -Math.PI) p.heading += Math.PI * 2;
        p.mesh.rotation.y = -p.heading;

        // Injured pedestrians chase with a limping fury; uninjured mob members sprint faster
        const chaseSpeed = p.isInjured ? 3.85 : 4.25;

        if (dist > 1.25) {
          if (stepHostileFn) {
            stepHostileFn(p.mesh, dirX, dirZ, chaseSpeed);
          } else {
            p.mesh.position.x += dirX * chaseSpeed * dt;
            p.mesh.position.z += dirZ * chaseSpeed * dt;
          }
        }

        p.walkCycle += dt * (dist < 1.85 ? 15 : chaseSpeed * 5.8);

        if (dist < 1.85) {
          // Melee beating / punching animation when close to vendor
          const punch = Math.sin(p.walkCycle);
          p.body.rotation.x = -0.18;
          p.body.rotation.z = punch * 0.12;
          p.leftArm.rotation.x = -1.35 + punch * 0.7;
          p.rightArm.rotation.x = -1.35 - punch * 0.7;
          p.leftLeg.rotation.x = -0.2;
          p.rightLeg.rotation.x = 0.2;
        } else {
          // Aggressive sprint animation (with injured limp if struck)
          const swing = Math.sin(p.walkCycle) * 0.65;
          p.leftLeg.rotation.x = -swing;
          p.rightLeg.rotation.x = swing;
          p.leftArm.rotation.x = -0.5 + swing * 0.9;
          p.rightArm.rotation.x = -0.5 - swing * 0.9;
          p.body.rotation.x = -0.14;
          p.body.rotation.z = p.isInjured ? Math.sin(p.walkCycle) * 0.16 : 0;
          p.body.position.y = p.body.userData.baseY + Math.abs(Math.sin(p.walkCycle * 2)) * 0.05;
        }
        this.updateRageSprite(p);
        continue;
      }

      // Non-hostile pedestrians with building rage: check if rage boiled over to 100%
      if (p.rage >= 100) {
        p.isEngagedInSale = false;
        p.state = 'hostile';
        p.hostileTimer = Math.max(p.hostileTimer, 22);
        this.updateRageSprite(p);
        continue;
      }

      if (p.rage > 0) {
        p.rage = Math.max(0, p.rage - dt * 2.8);
      }
      this.updateRageSprite(p);

      // When rage is >= 65% ("READY TO CHASE") and vendor is close, NPC glares and shakes fist in warning
      if (p.rage >= 65 && vendorPos && !p.isEngagedInSale) {
        const vdx = vendorPos.x - p.mesh.position.x;
        const vdz = vendorPos.z - p.mesh.position.z;
        const vdist = Math.hypot(vdx, vdz);
        if (vdist < 9.5) {
          p.walkCycle += dt * 9;
          const targetH = Math.atan2(vdx, -vdz);
          let diff = targetH - p.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.heading += diff * Math.min(1, dt * 10);
          p.mesh.rotation.y = -p.heading;
          p.leftLeg.rotation.x = 0;
          p.rightLeg.rotation.x = 0;
          p.leftArm.rotation.x = -0.35;
          p.rightArm.rotation.x = -2.1 + Math.sin(p.walkCycle) * 0.45;
          continue;
        }
      }

      p.body.rotation.z = p.isInjured ? Math.sin(p.walkCycle) * 0.08 : 0;

      // If engaged in buying from vendor, freeze walk animation and face cart
      if (p.isEngagedInSale) {
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0;
        p.rightArm.rotation.x = 0;
        continue;
      }

      if (p.state === 'idle') {
        p.idleTimer -= dt;
        // Subtle breathing animation during idle
        p.walkCycle += dt * 1.5;
        p.body.position.y = p.body.userData.baseY + Math.sin(p.walkCycle) * 0.015;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0;
        p.rightArm.rotation.x = 0;

        if (p.idleTimer <= 0) {
          // Select new distant destination node and run A* search
          const newTargetId = this.graph.getRandomDestination(p.currentNodeId, 35);
          p.targetNodeId = newTargetId;
          const fullPath = this.graph.findAStarPath(p.currentNodeId, newTargetId);
          p.path = fullPath.length > 1 ? fullPath.slice(1) : fullPath;
          p.pathIndex = 0;
          p.state = 'walking';
        }
        continue;
      }

      // Walking state: follow path waypoints
      if (p.path.length === 0 || p.pathIndex >= p.path.length) {
        p.state = 'idle';
        p.idleTimer = 2.0 + Math.random() * 4.0; // Rest at shop/sidewalk corner
        continue;
      }

      const targetWaypoint = p.path[p.pathIndex];
      const dx = targetWaypoint.x - p.mesh.position.x;
      const dz = targetWaypoint.z - p.mesh.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.45) {
        // Waypoint reached, advance to next
        p.pathIndex++;
        if (p.pathIndex >= p.path.length) {
          p.currentNodeId = p.targetNodeId;
          p.state = 'idle';
          p.idleTimer = 1.8 + Math.random() * 3.5;
          continue;
        }
      } else {
        // Move towards target waypoint
        const dirX = dx / dist;
        const dirZ = dz / dist;

        // Smoothly rotate towards heading (human model faces local -Z, so rotation.y = -heading)
        const targetHeading = Math.atan2(dirX, -dirZ);
        let angleDiff = targetHeading - p.heading;
        // Normalize angle diff to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.heading += angleDiff * Math.min(1, dt * 8.5);
        while (p.heading > Math.PI) p.heading -= Math.PI * 2;
        while (p.heading < -Math.PI) p.heading += Math.PI * 2;
        p.mesh.rotation.y = -p.heading;

        // Scale forward step by alignment so NPCs pivot before walking after a 180° turn
        const alignment = Math.max(0, Math.cos(angleDiff));
        const walkSpeed = p.isInjured ? p.speed * 0.8 : p.speed;
        const moveDist = Math.min(dist, walkSpeed * alignment * dt);

        p.mesh.position.x += dirX * moveDist;
        p.mesh.position.z += dirZ * moveDist;

        // Animate natural limb swings during walking
        p.walkCycle += walkSpeed * Math.max(0.35, alignment) * dt * 5.2;
        const swing = Math.sin(p.walkCycle) * 0.45;
        p.leftLeg.rotation.x = -swing;
        p.rightLeg.rotation.x = swing;
        p.leftArm.rotation.x = swing * 0.85;
        p.rightArm.rotation.x = -swing * 0.85;
        p.body.position.y = p.body.userData.baseY + Math.abs(Math.sin(p.walkCycle * 2)) * 0.04; // Torso step bob
      }
    }
  }

  getNearestPedestrian(x: number, z: number): { pedestrian: PedestrianNPC | null; distance: number } {
    let nearest: PedestrianNPC | null = null;
    let minDist = Infinity;
    for (const p of this.pedestrians) {
      if (p.state === 'injured' || p.state === 'hostile') continue;
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }
    return { pedestrian: nearest, distance: minDist };
  }
}
