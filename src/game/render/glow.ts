import * as THREE from 'three';

/**
 * Perf: a soft additive pool of coloured light drawn on the ground instead of a real PointLight.
 * Every dynamic light is evaluated for every pixel of every lit material, so the eleven garage and aarot lights
 * made the whole game heavier even far away from them. One shared texture and one flat quad cost almost nothing.
 */
let gradient: THREE.CanvasTexture | null = null;
function radialGradient(): THREE.CanvasTexture {
  if (gradient) return gradient;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.38)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  gradient = new THREE.CanvasTexture(canvas);
  gradient.colorSpace = THREE.SRGBColorSpace;
  return gradient;
}

const materials = new Map<string, THREE.MeshBasicMaterial>();

export function createGlowPool(color: string, diameter: number, opacity = 0.5): THREE.Mesh {
  const key = `${color}|${opacity}`;
  let material = materials.get(key);
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      map: radialGradient(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    materials.set(key, material);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(diameter, diameter).rotateX(-Math.PI / 2), material);
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
