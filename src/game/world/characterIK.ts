import * as THREE from 'three';

function rotateWorld(bone: THREE.Bone, delta: THREE.Quaternion) {
  const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(delta);
  const parent = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

/** Two-bone arm IK. Pole points keep the elbows outside the torso. */
function solveArm(upper: THREE.Bone, forearm: THREE.Bone, hand: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3) {
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const elbow = forearm.getWorldPosition(new THREE.Vector3());
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  const a = shoulder.distanceTo(elbow), b = elbow.distanceTo(wrist);
  const direction = target.clone().sub(shoulder);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + 0.0001, a + b - 0.0001);
  direction.normalize();
  const bend = pole.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.0001) bend.set(0, -1, 0).addScaledVector(direction, direction.y);
  bend.normalize();
  const along = (a * a + distance * distance - b * b) / (2 * distance);
  const desiredElbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  rotateWorld(upper, new THREE.Quaternion().setFromUnitVectors(elbow.sub(shoulder).normalize(), desiredElbow.sub(shoulder).normalize()));
  const nextElbow = forearm.getWorldPosition(new THREE.Vector3());
  const nextWrist = hand.getWorldPosition(new THREE.Vector3());
  rotateWorld(forearm, new THREE.Quaternion().setFromUnitVectors(nextWrist.sub(nextElbow).normalize(), target.clone().sub(nextElbow).normalize()));
}

export function fitCharacterHands(root: THREE.Object3D, skeleton: THREE.Skeleton, gripOffsets: THREE.Vector3[], targets: readonly THREE.Vector3[], poles: readonly THREE.Vector3[]) {
  root.updateWorldMatrix(true, true);
  let error = 0;
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 'L' : 'R';
    const upper = skeleton.getBoneByName(`DEF-upper_arm${side}`)!;
    const forearm = skeleton.getBoneByName(`DEF-forearm${side}`)!;
    const hand = skeleton.getBoneByName(`DEF-hand${side}`)!;
    for (let pass = 0; pass < 5; pass++) {
      const wrist = hand.getWorldPosition(new THREE.Vector3());
      const grip = hand.localToWorld(gripOffsets[i].clone());
      const wristTarget = targets[i].clone().sub(grip.sub(wrist));
      solveArm(upper, forearm, hand, wristTarget, poles[i]);
    }
    error = Math.max(error, hand.localToWorld(gripOffsets[i].clone()).distanceTo(targets[i]));
  }
  return error;
}
