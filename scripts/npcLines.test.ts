import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARGUE_LINES,
  BLOW_LINES,
  BYSTANDER_LINES,
  CHAT_TOPICS,
  CONVERSATIONS,
  ConversationPlanner,
  CUSTOMER_LINES,
  LOSER_LINES,
  PHONE_LINES,
  pickLine,
  pickTopic,
  WINNER_LINES,
  type ChatContext,
  type ChatTopic,
} from '../src/game/dialogue/npcLines';

const BENGALI_RE = /[\u0980-\u09FF]/;

function makeRng(seed = 987654321): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function assertValidPool(name: string, pool: readonly string[], minCount: number) {
  assert.ok(Array.isArray(pool), `${name} must be an array`);
  assert.ok(pool.length >= minCount, `${name} must have at least ${minCount} lines`);
  const seen = new Set<string>();
  for (const line of pool) {
    assert.ok(line.trim().length > 0, `${name} contains an empty line`);
    assert.ok(line.length <= 36, `${name} line exceeds 36 chars: "${line}" (${line.length})`);
    assert.ok(BENGALI_RE.test(line), `${name} line lacks Bengali script: "${line}"`);
    assert.ok(!seen.has(line), `${name} contains duplicate line: "${line}"`);
    seen.add(line);
  }
}

test('all one-liner pools and topic conversations satisfy length, Bengali script, and uniqueness constraints', () => {
  assertValidPool('PHONE_LINES', PHONE_LINES, 8);
  assertValidPool('ARGUE_LINES', ARGUE_LINES, 8);
  assertValidPool('BLOW_LINES', BLOW_LINES, 6);
  assertValidPool('WINNER_LINES', WINNER_LINES, 4);
  assertValidPool('LOSER_LINES', LOSER_LINES, 4);
  assertValidPool('BYSTANDER_LINES', BYSTANDER_LINES, 6);
  assertValidPool('CUSTOMER_LINES', CUSTOMER_LINES, 6);

  assert.equal(CHAT_TOPICS.length, 10);
  for (const topic of CHAT_TOPICS) {
    const convs = CONVERSATIONS[topic];
    assert.ok(Array.isArray(convs), `missing conversations for ${topic}`);
    assert.ok(convs.length >= 3, `${topic} must have at least 3 conversations`);
    const topicLines = new Set<string>();
    for (let i = 0; i < convs.length; i++) {
      const conv = convs[i];
      assert.ok(
        conv.length >= 4 && conv.length <= 6,
        `${topic}[${i}] must have 4-6 lines (got ${conv.length})`
      );
      for (const line of conv) {
        assert.ok(line.trim().length > 0, `${topic}[${i}] has empty line`);
        assert.ok(line.length <= 36, `${topic}[${i}] exceeds 36 chars: "${line}" (${line.length})`);
        assert.ok(BENGALI_RE.test(line), `${topic}[${i}] lacks Bengali script: "${line}"`);
        assert.ok(!topicLines.has(line), `${topic} has duplicate line: "${line}"`);
        topicLines.add(line);
      }
    }
  }
});

test('pickTopic responds to context weights and keeps every topic possible', () => {
  const rng = makeRng(101);
  const sampleCounts = (ctx: ChatContext, n = 4000): Record<ChatTopic, number> => {
    const counts = Object.fromEntries(CHAT_TOPICS.map((t) => [t, 0])) as Record<ChatTopic, number>;
    for (let i = 0; i < n; i++) {
      counts[pickTopic(ctx, rng)]++;
    }
    return counts;
  };

  const neutral = sampleCounts({ hour: 13, nearStall: false, raining: false, nearRoad: false });
  for (const topic of CHAT_TOPICS) {
    assert.ok(neutral[topic] > 0, `topic ${topic} should appear in neutral sampling`);
  }

  const rainy = sampleCounts({ hour: 13, nearStall: false, raining: true, nearRoad: false });
  assert.ok(rainy.weather > neutral.weather * 2.5, 'rain strongly increases weather topic');
  for (const topic of CHAT_TOPICS) {
    assert.ok(rainy[topic] > 0, `topic ${topic} stays possible during rain`);
  }

  const morning = sampleCounts({ hour: 8.5, nearStall: false, raining: false, nearRoad: false });
  assert.ok(morning.traffic > neutral.traffic * 2, 'morning rush increases traffic');
  assert.ok(morning.work > neutral.work * 2, 'morning rush increases work');

  const afternoon = sampleCounts({ hour: 17, nearStall: false, raining: false, nearRoad: false });
  assert.ok(afternoon.tea_stall > neutral.tea_stall * 2, 'afternoon increases tea_stall');
  assert.ok(afternoon.cricket > neutral.cricket * 2, 'afternoon increases cricket');

  const stall = sampleCounts({ hour: 13, nearStall: true, raining: false, nearRoad: false });
  assert.ok(stall.market > neutral.market * 2.5, 'nearStall increases market');

  const road = sampleCounts({ hour: 13, nearStall: false, raining: false, nearRoad: true });
  assert.ok(road.rickshaw_fare > neutral.rickshaw_fare * 2, 'nearRoad increases rickshaw_fare');
  assert.ok(road.traffic > neutral.traffic * 2, 'nearRoad increases traffic');
});

test('pickTopic handles invalid context without throwing and falls back to uniform pick', () => {
  const rng = makeRng(777);
  const counts = Object.fromEntries(CHAT_TOPICS.map((t) => [t, 0])) as Record<ChatTopic, number>;
  for (let i = 0; i < 2000; i++) {
    const t1 = pickTopic({ hour: Number.NaN, nearStall: false, raining: false, nearRoad: false }, rng);
    counts[t1]++;
  }
  for (const topic of CHAT_TOPICS) {
    assert.ok(counts[topic] > 100, `uniform fallback covers ${topic}`);
  }
  assert.ok(CHAT_TOPICS.includes(pickTopic(null as unknown as ChatContext, rng)));
  assert.ok(CHAT_TOPICS.includes(pickTopic({ hour: -5, nearStall: true, raining: true, nearRoad: true }, rng)));
});

test('ConversationPlanner never repeats back to back and avoids the last 3 conversations', () => {
  const rng = makeRng(2026);
  const planner = new ConversationPlanner(rng);
  const ctx: ChatContext = { hour: 12, nearStall: true, raining: false, nearRoad: false };
  const history: Array<readonly string[]> = [];

  for (let i = 0; i < 300; i++) {
    const res = planner.plan(ctx);
    assert.ok(CHAT_TOPICS.includes(res.topic));
    assert.ok(res.lines.length >= 4 && res.lines.length <= 6);
    for (let back = 1; back <= Math.min(3, history.length); back++) {
      assert.notEqual(
        res.lines,
        history[history.length - back],
        `conversation repeated within last ${back} steps at iteration ${i}`
      );
    }
    history.push(res.lines);
  }
});

test('pickLine never repeats lastIndex when pool has more than one line', () => {
  const rng = makeRng(555);
  let last = -1;
  for (let i = 0; i < 250; i++) {
    const idx = pickLine(PHONE_LINES, rng, last);
    assert.ok(idx >= 0 && idx < PHONE_LINES.length);
    assert.notEqual(idx, last, `pickLine repeated index ${idx} at step ${i}`);
    last = idx;
  }
  assert.equal(pickLine(['একটাই লাইন'], rng, 0), 0);
  assert.equal(pickLine([], rng, 0), -1);
});
