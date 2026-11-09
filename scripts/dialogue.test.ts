import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  POLICE_LINES,
  POLICE_SITUATIONS,
  PoliceLinePicker,
  type PoliceSituation,
} from '../src/game/dialogue/policeLines';
import {
  BUBBLE_FADE_SECONDS,
  BUBBLE_HEIGHT_OFFSET,
  BUBBLE_LOW_CAPACITY,
  BUBBLE_MAX_DISTANCE,
  SpeechBubbles,
  type BubbleTone,
} from '../src/game/dialogue/speechBubble';

const BENGALI_CHAR_RE = /[\u0980-\u09FF]/;

function makeSeededRng(seed = 123456789): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function fakeTextureFactory() {
  const created: Array<{ text: string; tone: BubbleTone; disposed: boolean; tex: THREE.Texture }> = [];
  const makeTexture = (text: string, tone: BubbleTone): THREE.Texture => {
    const tex = new THREE.Texture();
    const record = { text, tone, disposed: false, tex };
    const origDispose = tex.dispose.bind(tex);
    tex.dispose = () => {
      record.disposed = true;
      origDispose();
    };
    created.push(record);
    return tex;
  };
  return { created, makeTexture };
}

function spriteChildren(scene: THREE.Scene): THREE.Sprite[] {
  return scene.children.filter((c): c is THREE.Sprite => c instanceof THREE.Sprite);
}

test('every PoliceSituation has 4+ unique non-empty Bangla lines at most 40 chars', () => {
  assert.equal(POLICE_SITUATIONS.length, 11);
  for (const situation of POLICE_SITUATIONS) {
    const lines = POLICE_LINES[situation];
    assert.ok(Array.isArray(lines), `missing array for ${situation}`);
    assert.ok(lines.length >= 4, `${situation} must have at least 4 lines`);
    const seen = new Set<string>();
    for (const line of lines) {
      assert.ok(line.trim().length > 0, `${situation} has an empty line`);
      assert.ok(line.length <= 40, `${situation} line exceeds 40 chars: "${line}" (${line.length})`);
      assert.ok(BENGALI_CHAR_RE.test(line), `${situation} line lacks Bengali script: "${line}"`);
      assert.ok(!seen.has(line), `${situation} has duplicate line: "${line}"`);
      seen.add(line);
    }
  }
});

test('PoliceLinePicker never repeats back-to-back over 200 picks and covers every line', () => {
  const picker = new PoliceLinePicker(makeSeededRng(42));
  for (const situation of POLICE_SITUATIONS as readonly PoliceSituation[]) {
    const seen = new Set<string>();
    let prev = '';
    for (let i = 0; i < 200; i++) {
      const line = picker.pick(situation);
      assert.notEqual(line, prev, `${situation} repeated "${line}" at pick ${i}`);
      prev = line;
      seen.add(line);
    }
    for (const expected of POLICE_LINES[situation]) {
      assert.ok(seen.has(expected), `${situation} never picked "${expected}" in 200 picks`);
    }
  }
});

test('SpeechBubbles enforces one bubble per owner and replaces oldest when full', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.Vector3(0, 0, 0);
  const { created, makeTexture } = fakeTextureFactory();
  const bubbles = new SpeechBubbles(scene, 3, makeTexture);

  const o1 = new THREE.Object3D();
  const o2 = new THREE.Object3D();
  const o3 = new THREE.Object3D();
  const o4 = new THREE.Object3D();
  o1.position.set(1, 0, 0);
  o2.position.set(2, 0, 0);
  o3.position.set(3, 0, 0);
  o4.position.set(4, 0, 0);
  scene.add(o1, o2, o3, o4);

  // Same owner replaces existing bubble rather than using a second slot
  bubbles.say(o1, 'প্রথম কথা', 3.0, 'normal');
  bubbles.say(o1, 'দ্বিতীয় কথা', 3.0, 'angry');
  bubbles.update(0, camera);
  assert.equal(spriteChildren(scene).length, 1);
  assert.equal(created.length, 2);

  // Fill remaining slots (capacity = 3: o1, o2, o3), where o2 becomes oldest after o1 was refreshed,
  // or let's advance sequence: o1 (seq 2), o2 (seq 3), o3 (seq 4) -> o1 is oldest!
  bubbles.say(o2, 'দুই', 3.0);
  bubbles.say(o3, 'তিন', 3.0);
  bubbles.update(0, camera);
  assert.equal(spriteChildren(scene).length, 3);

  // Adding o4 replaces oldest (o1 at x = 1)
  bubbles.say(o4, 'চার', 3.0, 'shout');
  bubbles.update(0, camera);
  const activeSprites = spriteChildren(scene);
  assert.equal(activeSprites.length, 3);
  const xs = activeSprites.map((s) => s.position.x).sort((a, b) => a - b);
  assert.deepEqual(xs, [2, 3, 4]);
});

test('SpeechBubbles positions 2.3 m above owner, fades over last 0.4 s, and recycles on expiry', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.Vector3(0, 0, 0);
  const { makeTexture } = fakeTextureFactory();
  const bubbles = new SpeechBubbles(scene, 4, makeTexture);

  const owner = new THREE.Object3D();
  owner.position.set(3, 1.5, -4);
  scene.add(owner);

  bubbles.say(owner, 'থামো বলছি!', 1.0, 'shout');
  bubbles.update(0, camera);

  const sprites = spriteChildren(scene);
  assert.equal(sprites.length, 1);
  const sprite = sprites[0];
  assert.ok(Math.abs(sprite.position.x - 3) < 1e-6);
  assert.ok(Math.abs(sprite.position.y - (1.5 + BUBBLE_HEIGHT_OFFSET)) < 1e-6);
  assert.ok(Math.abs(sprite.position.z - -4) < 1e-6);
  assert.equal(sprite.material.opacity, 1);

  // Advance to 0.2 s remaining (halfway through 0.4 s fade window)
  bubbles.update(0.8, camera);
  assert.equal(sprite.visible, true);
  assert.ok(Math.abs(sprite.material.opacity - 0.2 / BUBBLE_FADE_SECONDS) < 1e-5);

  // Advance past expiry
  bubbles.update(0.25, camera);
  assert.equal(spriteChildren(scene).length, 0);
});

test('SpeechBubbles hides beyond 28 m or when owner is invisible, supports low quality (4), and clear/dispose remove all sprites', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.Vector3(0, 0, 0);
  const { created, makeTexture } = fakeTextureFactory();
  const bubbles = new SpeechBubbles(scene, 8, makeTexture);

  const owner = new THREE.Object3D();
  owner.position.set(0, 0, BUBBLE_MAX_DISTANCE);
  scene.add(owner);

  bubbles.say(owner, 'দাঁড়াও!', 5.0);
  bubbles.update(0, camera);
  const sprite = spriteChildren(scene)[0];
  assert.equal(sprite.visible, true, 'visible at 28 m');

  owner.position.set(0, 0, BUBBLE_MAX_DISTANCE + 0.5);
  bubbles.update(0, camera);
  assert.equal(sprite.visible, false, 'hidden beyond 28 m');

  owner.position.set(0, 0, 10);
  owner.visible = false;
  bubbles.update(0, camera);
  assert.equal(sprite.visible, false, 'hidden when owner is invisible');

  owner.visible = true;
  bubbles.update(0, camera);
  assert.equal(sprite.visible, true, 'visible again when owner is visible and in range');

  // Fill 6 bubbles then switch to low quality (capacity 4)
  for (let i = 0; i < 5; i++) {
    const extra = new THREE.Object3D();
    extra.position.set(i + 1, 0, 5);
    scene.add(extra);
    bubbles.say(extra, `লাইন ${i}`, 5.0);
  }
  assert.equal(spriteChildren(scene).length, 6);

  bubbles.setLowQuality(true);
  assert.equal(bubbles.capacity, BUBBLE_LOW_CAPACITY);
  assert.equal(spriteChildren(scene).length, BUBBLE_LOW_CAPACITY);

  bubbles.clear();
  assert.equal(spriteChildren(scene).length, 0, 'clear leaves no sprites in the scene');

  bubbles.say(owner, 'আবার', 5.0);
  assert.equal(spriteChildren(scene).length, 1);
  bubbles.dispose();
  assert.equal(spriteChildren(scene).length, 0, 'dispose leaves no sprites in the scene');
  assert.ok(created.every((c) => c.disposed), 'dispose cleans up cached textures');
});
