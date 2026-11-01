import * as THREE from 'three';
import type { Obstacle } from '../collision';
import { pbrMaterial, applyWorldUV } from '../render/pbr';

export interface GarageSite {
  x: number;
  z: number;
}

export const GARAGE_SITES: ReadonlyArray<GarageSite> = [
  { x: 20, z: 20 },
  { x: -60, z: 60 }
];

export interface BuiltGarage {
  group: THREE.Group;
  obstacles: Obstacle[];
  entrance: { x: number; z: number };
}

export function entranceForSite(site: GarageSite): { x: number; z: number } {
  // Open front faces the nearest -Z street (z - 20); entrance sits on the pavement/apron in front
  return { x: site.x, z: site.z - 9.5 };
}

export function nearestGarage(
  x: number,
  z: number
): { site: GarageSite; entrance: { x: number; z: number }; distance: number } {
  let bestSite = GARAGE_SITES[0];
  let bestEntrance = entranceForSite(bestSite);
  let bestDist = Math.hypot(x - bestEntrance.x, z - bestEntrance.z);

  for (let i = 1; i < GARAGE_SITES.length; i++) {
    const site = GARAGE_SITES[i];
    const entrance = entranceForSite(site);
    const dist = Math.hypot(x - entrance.x, z - entrance.z);
    if (dist < bestDist) {
      bestDist = dist;
      bestSite = site;
      bestEntrance = entrance;
    }
  }

  return { site: bestSite, entrance: bestEntrance, distance: bestDist };
}

function makeGarageSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const cx = canvas.getContext('2d')!;

  const grad = cx.createLinearGradient(0, 0, 512, 128);
  grad.addColorStop(0, '#183832');
  grad.addColorStop(0.5, '#1f4b43');
  grad.addColorStop(1, '#142e29');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, 512, 128);

  cx.strokeStyle = '#f59e0b';
  cx.lineWidth = 8;
  cx.strokeRect(6, 6, 500, 116);

  cx.fillStyle = '#fde68a';
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.font = "bold 48px 'Hind Siliguri', 'Poppins', sans-serif";
  cx.fillText(text, 256, 68, 470);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildGarage(scene: THREE.Scene, site: GarageSite): BuiltGarage {
  const group = new THREE.Group();
  const obstacles: Obstacle[] = [];
  const entrance = entranceForSite(site);

  const brickMat = pbrMaterial('brick');
  const metalMat = pbrMaterial('metal');
  const concreteMat = pbrMaterial('concrete');
  const woodMat = pbrMaterial('wood');
  const tyreMat = new THREE.MeshStandardMaterial({ color: '#1e2226', roughness: 0.88, metalness: 0.08 });
  const drumMat = new THREE.MeshStandardMaterial({ color: '#b83b2a', roughness: 0.52, metalness: 0.45 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.45, metalness: 0.3 });

  // 1. Concrete workshop floor + driveway apron to entrance
  const floor = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.18, 12.4), concreteMat);
  floor.position.set(site.x, 0.09, site.z);
  floor.receiveShadow = true;
  applyWorldUV(floor);
  group.add(floor);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 7.2), concreteMat);
  apron.position.set(entrance.x, 0.06, entrance.z + 1.2);
  apron.receiveShadow = true;
  applyWorldUV(apron);
  group.add(apron);

  // 2. Three brick walls (Back +Z, Left -X, Right +X) — Front -Z is open so cart can drive in
  const wallH = 4.6;
  const wallT = 0.65;

  // Back wall (+Z)
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(14.4, wallH, wallT), brickMat);
  backWall.position.set(site.x, wallH / 2, site.z + 5.85);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  applyWorldUV(backWall);
  group.add(backWall);
  obstacles.push({
    type: 'box',
    x: site.x,
    z: site.z + 5.85,
    hw: 7.2,
    hd: wallT / 2,
    tag: 'garage_wall'
  });

  // Left wall (-X)
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 12.0), brickMat);
  leftWall.position.set(site.x - 6.85, wallH / 2, site.z + 0.15);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  applyWorldUV(leftWall);
  group.add(leftWall);
  obstacles.push({
    type: 'box',
    x: site.x - 6.85,
    z: site.z + 0.15,
    hw: wallT / 2,
    hd: 6.0,
    tag: 'garage_wall'
  });

  // Right wall (+X)
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 12.0), brickMat);
  rightWall.position.set(site.x + 6.85, wallH / 2, site.z + 0.15);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  applyWorldUV(rightWall);
  group.add(rightWall);
  obstacles.push({
    type: 'box',
    x: site.x + 6.85,
    z: site.z + 0.15,
    hw: wallT / 2,
    hd: 6.0,
    tag: 'garage_wall'
  });

  // Front corner steel support posts
  for (const sx of [-6.6, 6.6]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 4.9, 10), metalMat);
    post.position.set(site.x + sx, 2.45, site.z - 5.6);
    post.castShadow = true;
    applyWorldUV(post);
    group.add(post);
  }

  // 3. Slanted corrugated metal roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.24, 13.6), metalMat);
  roof.position.set(site.x, 4.85, site.z);
  roof.rotation.x = 0.065; // Slanted front-to-back
  roof.castShadow = true;
  roof.receiveShadow = true;
  applyWorldUV(roof);
  group.add(roof);

  // Amber fascia beam across the open front
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.32, 0.32), trimMat);
  fascia.position.set(site.x, 4.55, site.z - 5.75);
  group.add(fascia);

  // 4. Interior workshop props: Workbench, Stacked Tyres, Oil Drum
  // Workbench along the back wall
  const benchTop = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 1.3), woodMat);
  benchTop.position.set(site.x, 1.05, site.z + 4.6);
  benchTop.castShadow = true;
  applyWorldUV(benchTop);
  group.add(benchTop);

  for (const lx of [-2.3, 2.3]) {
    for (const lz of [-0.48, 0.48]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), metalMat);
      leg.position.set(site.x + lx, 0.5, site.z + 4.6 + lz);
      group.add(leg);
    }
  }

  // Red toolbox on the workbench
  const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.45), drumMat);
  toolbox.position.set(site.x - 1.1, 1.32, site.z + 4.6);
  toolbox.castShadow = true;
  group.add(toolbox);

  // Stacked tyres near left wall
  const tyreGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.32, 16);
  for (let t = 0; t < 4; t++) {
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.position.set(
      site.x - 5.2 + (t % 2) * 0.06,
      0.34 + t * 0.33,
      site.z + 2.8
    );
    tyre.castShadow = true;
    group.add(tyre);
  }
  for (let t = 0; t < 3; t++) {
    const tyre = new THREE.Mesh(tyreGeo, tyreMat);
    tyre.position.set(site.x - 5.1, 0.34 + t * 0.33, site.z + 1.45);
    tyre.castShadow = true;
    group.add(tyre);
  }

  // Oil drum near right wall
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.35, 16), drumMat);
  drum.position.set(site.x + 5.1, 0.76, site.z + 2.6);
  drum.castShadow = true;
  group.add(drum);

  const drumRim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 16), metalMat);
  drumRim.position.set(site.x + 5.1, 1.42, site.z + 2.6);
  group.add(drumRim);

  // 5. Lit Bangla Signboard "গ্যারেজ · মেরামত"
  const signTex = makeGarageSignTexture('গ্যারেজ · মেরামত');
  const signBacking = new THREE.Mesh(
    new THREE.BoxGeometry(7.6, 1.75, 0.22),
    new THREE.MeshStandardMaterial({ color: '#162925', roughness: 0.6 })
  );
  signBacking.position.set(site.x, 5.65, site.z - 5.75);
  group.add(signBacking);

  const signFaceMat = new THREE.MeshBasicMaterial({
    map: signTex,
    side: THREE.DoubleSide
  });
  const signFront = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 1.55), signFaceMat);
  signFront.position.set(site.x, 5.65, site.z - 5.88);
  signFront.rotation.y = Math.PI;
  group.add(signFront);

  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 1.55), signFaceMat);
  signBack.position.set(site.x, 5.65, site.z - 5.62);
  group.add(signBack);

  // Warm workshop light illuminating the sign and bay
  const bayLight = new THREE.PointLight('#fbbf24', 2.2, 18, 1.6);
  bayLight.position.set(site.x, 4.3, site.z - 2.5);
  group.add(bayLight);

  // 6. Flat glowing amber ring (radius 4) on the ground at the entrance as the repair zone
  const ringGeo = new THREE.RingGeometry(3.45, 4.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const repairRing = new THREE.Mesh(ringGeo, ringMat);
  repairRing.position.set(entrance.x, 0.14, entrance.z);
  group.add(repairRing);

  const innerFillGeo = new THREE.CircleGeometry(3.45, 48);
  innerFillGeo.rotateX(-Math.PI / 2);
  const innerFillMat = new THREE.MeshBasicMaterial({
    color: '#fbbf24',
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const repairDisc = new THREE.Mesh(innerFillGeo, innerFillMat);
  repairDisc.position.set(entrance.x, 0.13, entrance.z);
  group.add(repairDisc);

  scene.add(group);
  return { group, obstacles, entrance };
}
