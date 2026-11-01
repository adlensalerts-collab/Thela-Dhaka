import * as THREE from 'three';
import { SidewalkGraph } from './pathfinding';

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
  state: 'walking' | 'idle' | 'browsing';
  idleTimer: number;
  walkCycle: number;
  isEngagedInSale: boolean;
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

  private createHumanMesh(archetype: PedestrianArchetype): {
    group: THREE.Group;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    body: THREE.Object3D;
  } {
    const g = new THREE.Group();
    const matte = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });
    const shirtMat = matte(archetype.shirtColor);
    const pantsMat = matte(archetype.pantsColor);
    const skinMat = matte('#b87954');
    const darkMat = matte('#24292c');

    // Torso / Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.44, 1.15, 8), shirtMat);
    body.position.set(0, 1.35, 0);
    body.castShadow = true;
    g.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.33, 0), skinMat);
    head.position.set(0, 2.15, 0);
    head.castShadow = true;
    g.add(head);

    // Hair or Cap
    if (archetype.hasCap) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.18, 8), matte('#f4f4f0'));
      cap.position.set(0, 2.38, 0);
      g.add(cap);
    } else {
      const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.38), darkMat);
      hair.position.set(0, 2.45, 0.02);
      g.add(hair);
    }

    // Shoulder Gamchha (towel scarf)
    if (archetype.hasGamchha) {
      const gamchha = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.36), matte('#d13b3b'));
      gamchha.position.set(0.36, 1.45, 0);
      g.add(gamchha);
    }

    // Backpack
    if (archetype.hasBag) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.65, 0.28), matte('#2d3845'));
      bag.position.set(0, 1.4, -0.32);
      g.add(bag);
    }

    // Left Arm Pivot
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.45, 1.8, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 6), shirtMat);
    leftArmMesh.position.set(0, -0.42, 0);
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);
    g.add(leftArmPivot);

    // Right Arm Pivot
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.45, 1.8, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 6), shirtMat);
    rightArmMesh.position.set(0, -0.42, 0);
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);
    g.add(rightArmPivot);

    // Left Leg Pivot
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.18, 0.85, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.85, 6), pantsMat);
    leftLegMesh.position.set(0, -0.42, 0);
    leftLegMesh.castShadow = true;
    leftLegPivot.add(leftLegMesh);
    g.add(leftLegPivot);

    // Right Leg Pivot
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.18, 0.85, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.85, 6), pantsMat);
    rightLegMesh.position.set(0, -0.42, 0);
    rightLegMesh.castShadow = true;
    rightLegPivot.add(rightLegMesh);
    g.add(rightLegPivot);

    // Scale variation (0.93 - 1.07)
    const scale = 0.93 + Math.random() * 0.14;
    g.scale.set(scale, scale, scale);

    return {
      group: g,
      leftLeg: leftLegPivot,
      rightLeg: rightLegPivot,
      leftArm: leftArmPivot,
      rightArm: rightArmPivot,
      body
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
        path,
        pathIndex: 0,
        speed: archetype.speed * (0.9 + Math.random() * 0.25),
        heading: Math.random() * Math.PI * 2,
        state: 'walking',
        idleTimer: 0,
        walkCycle: Math.random() * 10,
        isEngagedInSale: false
      });
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];

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
        p.body.position.y = 1.35 + Math.sin(p.walkCycle) * 0.015;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0;
        p.rightArm.rotation.x = 0;

        if (p.idleTimer <= 0) {
          // Select new distant destination node and run A* search
          const newTargetId = this.graph.getRandomDestination(p.currentNodeId, 35);
          p.targetNodeId = newTargetId;
          p.path = this.graph.findAStarPath(p.currentNodeId, newTargetId);
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
        const moveDist = Math.min(dist, p.speed * dt);

        p.mesh.position.x += dirX * moveDist;
        p.mesh.position.z += dirZ * moveDist;

        // Smoothly rotate towards heading
        const targetHeading = Math.atan2(dirX, -dirZ);
        let angleDiff = targetHeading - p.heading;
        // Normalize angle diff to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.heading += angleDiff * Math.min(1, dt * 6.5);
        p.mesh.rotation.y = p.heading;

        // Animate natural limb swings during walking
        p.walkCycle += p.speed * dt * 5.2;
        const swing = Math.sin(p.walkCycle) * 0.45;
        p.leftLeg.rotation.x = -swing;
        p.rightLeg.rotation.x = swing;
        p.leftArm.rotation.x = swing * 0.85;
        p.rightArm.rotation.x = -swing * 0.85;
        p.body.position.y = 1.35 + Math.abs(Math.sin(p.walkCycle * 2)) * 0.04; // Torso step bob
      }
    }
  }

  getNearestPedestrian(x: number, z: number): { pedestrian: PedestrianNPC | null; distance: number } {
    let nearest: PedestrianNPC | null = null;
    let minDist = Infinity;
    for (const p of this.pedestrians) {
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }
    return { pedestrian: nearest, distance: minDist };
  }
}
