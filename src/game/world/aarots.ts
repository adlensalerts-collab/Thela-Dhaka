import * as THREE from 'three';
import type { Obstacle } from '../collision';
import { pbrMaterial, applyWorldUV } from '../render/pbr';

export interface AarotSite {
  x: number;
  z: number;
}

export const AAROT_SITES: ReadonlyArray<AarotSite> = [
  { x: 60, z: -20 },
  { x: 20, z: -60 },
  { x: -60, z: -20 }
];

export interface BuiltAarot {
  group: THREE.Group;
  obstacles: Obstacle[];
  entrance: { x: number; z: number };
}

export function entranceForAarot(site: AarotSite): { x: number; z: number } {
  // Open front faces the nearest -Z street (z - 20); entrance sits on the pavement/apron in front
  return { x: site.x, z: site.z - 9.5 };
}

export function nearestAarot(
  x: number,
  z: number
): { site: AarotSite; entrance: { x: number; z: number }; distance: number } {
  let bestSite = AAROT_SITES[0];
  let bestEntrance = entranceForAarot(bestSite);
  let bestDist = Math.hypot(x - bestEntrance.x, z - bestEntrance.z);

  for (let i = 1; i < AAROT_SITES.length; i++) {
    const site = AAROT_SITES[i];
    const entrance = entranceForAarot(site);
    const dist = Math.hypot(x - entrance.x, z - entrance.z);
    if (dist < bestDist) {
      bestDist = dist;
      bestSite = site;
      bestEntrance = entrance;
    }
  }

  return { site: bestSite, entrance: bestEntrance, distance: bestDist };
}

function makeAarotSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const cx = canvas.getContext('2d')!;

  const grad = cx.createLinearGradient(0, 0, 512, 128);
  grad.addColorStop(0, '#0f3926');
  grad.addColorStop(0.5, '#165238');
  grad.addColorStop(1, '#0b2c1d');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 512, 128);

  cx.strokeStyle = '#22c55e';
  cx.lineWidth = 8;
  cx.strokeRect(6, 6, 500, 116);

  cx.fillStyle = '#dcfce7';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.font = "bold 50px 'Hind Siliguri', 'Poppins', sans-serif";
  cx.fillText(text, 256, 68, 470);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildAarot(scene: THREE.Scene, site: AarotSite): BuiltAarot {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const entrance = entranceForAarot(site);

  const brickMat = pbrMaterial('brick');
  const metalMat = pbrMaterial('metal');
  const concreteMat = pbrMaterial('concrete');
  const woodMat = pbrMaterial('wood');

  const juteMat = new THREE.MeshStandardMaterial({ color: '#b5925d', roughness: 0.92, metalness: 0.04 });
  const onionMat = new THREE.MeshStandardMaterial({ color: '#8f3958', roughness: 0.8, metalness: 0.05 });
  const potatoMat = new THREE.MeshStandardMaterial({ color: '#c49b5a', roughness: 0.85, metalness: 0.04 });
  const chilliMat = new THREE.MeshStandardMaterial({ color: '#3b8c36', roughness: 0.72, metalness: 0.06 });
  const redChilliMat = new THREE.MeshStandardMaterial({ color: '#c73728', roughness: 0.72, metalness: 0.06 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#16a34a', roughness: 0.45, metalness: 0.25 });
  const brassMat = new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.35, metalness: 0.75 });

  // 1. Concrete floor + loading apron to entrance
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.18, 12.6), concreteMat);
  floor.position.set(site.x, 0.09, site.z);
  floor.receiveShadow = true;
  applyWorldUV(floor);
  group.add(floor);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.12, 7.2), concreteMat);
  apron.position.set(entrance.x, 0.06, entrance.z + 1.2);
  apron.receiveShadow = true;
  applyWorldUV(apron);
  group.add(apron);

  // 2. Three brick walls (Back +Z, Left -X, Right +X) — Front -Z is open
  const wallH = 4.6;
  const wallT = 0.65;

  // Back wall (+Z)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(14.8, wallH, wallT), brickMat);
  backWall.position.set(site.x, wallH / 2, site.z + 5.95);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  applyWorldUV(backWall);
  group.add(backWall);
  obstacles.push({
    type: 'box',
    x: site.x,
    z: site.z + 5.95,
    hw: 7.4,
    hd: wallT / 2,
    tag: 'aarot_wall'
  });

  // Left wall (-X)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 12.2), brickMat);
  leftWall.position.set(site.x - 7.05, wallH / 2, site.z + 0.15);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  applyWorldUV(leftWall);
  group.add(leftWall);
  obstacles.push({
    type: 'box',
    x: site.x - 7.05,
    z: site.z + 0.15,
    hw: wallT / 2,
    hd: 6.1,
    tag: 'aarot_wall'
  });

  // Right wall (+X)
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 12.2), brickMat);
  rightWall.position.set(site.x + 7.05, wallH / 2, site.z + 0.15);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  applyWorldUV(rightWall);
  group.add(rightWall);
  obstacles.push({
    type: 'box',
    x: site.x + 7.05,
    z: site.z + 0.15,
    hw: wallT / 2,
    hd: 6.1,
    tag: 'aarot_wall'
  });

  // Front corner steel support posts
  for (const sx of [-6.8, 6.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4.9, 10), metalMat);
    post.position.set(site.x + sx, 2.45, site.z - 5.7);
    post.castShadow = true;
    applyWorldUV(post);
    group.add(post);
  }

  // 3. Corrugated metal roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(16.0, 0.24, 13.8), metalMat);
  roof.position.set(site.x, 4.85, site.z);
  roof.rotation.x = 0.065;
  roof.castShadow = true;
  roof.receiveShadow = true;
  applyWorldUV(roof);
  group.add(roof);

  // Green fascia beam across the open front
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.32, 0.32), trimMat);
  fascia.position.set(site.x, 4.55, site.z - 5.85);
  group.add(fascia);

  // 4. Wholesale counter + weighing scales (dandi-palla)
  const counter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.0, 1.4), woodMat);
  counter.position.set(site.x, 0.65, site.z + 4.4);
  counter.castShadow = true;
  applyWorldUV(counter);
  group.add(counter);

  // Weighing scale on counter
  for (const sx of [-1.2, 1.2]) {
    const scaleBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.42), metalMat);
    scaleBase.position.set(site.x + sx, 1.22, site.z + 4.35);
    group.add(scaleBase);

    const scalePost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.62, 8), brassMat);
    scalePost.position.set(site.x + sx, 1.56, site.z + 4.35);
    group.add(scalePost);

    const scaleBeam = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.04), brassMat);
    scaleBeam.position.set(site.x + sx, 1.85, site.z + 4.35);
    group.add(scaleBeam);

    for (const px of [-0.32, 0.32]) {
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.05, 12), brassMat);
      pan.position.set(site.x + sx + px, 1.48, site.z + 4.35);
      group.add(pan);
    }
  }

  // 5. Stacked produce crates (onion, potato, chilli colours) along left & back
  const crateMaterials = [onionMat, potatoMat, chilliMat, redChilliMat];
  const crateGeo = new THREE.BoxGeometry(1.15, 0.52, 0.85);
  const produceTopGeo = new THREE.BoxGeometry(1.02, 0.18, 0.72);

  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3 - (col % 2); row++) {
      const cx = site.x - 5.3 + col * 1.3;
      const cy = 0.44 + row * 0.54;
      const cz = site.z + 2.6;

      const crate = new THREE.Mesh(crateGeo, woodMat);
      crate.position.set(cx, cy, cz);
      crate.castShadow = true;
      group.add(crate);

      const produceMat = crateMaterials[(col + row) % crateMaterials.length];
      const produce = new THREE.Mesh(produceTopGeo, produceMat);
      produce.position.set(cx, cy + 0.24, cz);
      group.add(produce);
    }
  }

  // 6. Jute sacks (bori) on the floor and stacked along the right wall
  const sackGeo = new THREE.CylinderGeometry(0.46, 0.52, 0.95, 12);
  const sackSpots: Array<{ dx: number; dy: number; dz: number; rotZ?: number; topMat: THREE.Material }> = [
    { dx: 5.1, dy: 0.65, dz: 3.1, topMat: onionMat },
    { dx: 4.1, dy: 0.65, dz: 3.2, topMat: potatoMat },
    { dx: 5.2, dy: 0.65, dz: 1.9, topMat: chilliMat },
    { dx: 4.2, dy: 0.65, dz: 2.0, topMat: redChilliMat },
    { dx: 4.7, dy: 1.45, dz: 2.6, rotZ: 0.12, topMat: potatoMat },
    { dx: -4.8, dy: 0.65, dz: -1.2, topMat: onionMat },
    { dx: -3.8, dy: 0.65, dz: -1.4, topMat: potatoMat },
    { dx: 4.9, dy: 0.65, dz: -1.1, topMat: chilliMat }
  ];

  const moundGeo = new THREE.SphereGeometry(0.42, 10, 8);
  for (const s of sackSpots) {
    const sack = new THREE.Mesh(sackGeo, juteMat);
    sack.position.set(site.x + s.dx, s.dy, site.z + s.dz);
    if (s.rotZ) sack.rotation.z = s.rotZ;
    sack.castShadow = true;
    group.add(sack);

    const mound = new THREE.Mesh(moundGeo, s.topMat);
    mound.scale.set(1, 0.45, 1);
    mound.position.set(site.x + s.dx, s.dy + 0.46, site.z + s.dz);
    group.add(mound);
  }

  // 7. Lit Bangla Signboard "পাইকারি আড়ত"
  const signTex = makeAarotSignTexture('পাইকারি আড়ত');
  const signBacking = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 1.75, 0.22),
    new THREE.MeshStandardMaterial({ color: '#0f291c', roughness: 0.6 })
  );
  signBacking.position.set(site.x, 5.65, site.z - 5.85);
  group.add(signBacking);

  const signFaceMat = new THREE.MeshBasicMaterial({
    map: signTex,
    side: THREE.DoubleSide
  });
  const signFront = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.55), signFaceMat);
  signFront.position.set(site.x, 5.65, site.z - 5.98);
  signFront.rotation.y = Math.PI;
  group.add(signFront);

  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 1.55), signFaceMat);
  signBack.position.set(site.x, 5.65, site.z - 5.72);
  group.add(signBack);

  // Market shed light illuminating the sign and produce bay
  const shedLight = new THREE.PointLight('#4ade80', 2.1, 18, 1.6);
  shedLight.position.set(site.x, 4.3, site.z - 2.5);
  group.add(shedLight);

  // 8. Flat glowing GREEN ring (radius 4) on the ground at the entrance as the restock zone
  const ringGeo = new THREE.RingGeometry(3.45, 4.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#22c55e',
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const restockRing = new THREE.Mesh(ringGeo, ringMat);
  restockRing.position.set(entrance.x, 0.14, entrance.z);
  group.add(restockRing);

  const innerFillGeo = new THREE.CircleGeometry(3.45, 48);
  innerFillGeo.rotateX(-Math.PI / 2);
  const innerFillMat = new THREE.MeshBasicMaterial({
    color: '#4ade80',
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const restockDisc = new THREE.Mesh(innerFillGeo, innerFillMat);
  restockDisc.position.set(entrance.x, 0.13, entrance.z);
  group.add(restockDisc);

  scene.add(group);
  return { group, obstacles, entrance };
}
