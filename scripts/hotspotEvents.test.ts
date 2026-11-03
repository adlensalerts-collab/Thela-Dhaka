import assert from 'node:assert/strict';
import test from 'node:test';
import { activeHotspotEvent } from '../src/game/hotspotEvents';

test('junction is active at 09:00 with office rush label', () => {
  const ev = activeHotspotEvent('junction', 9 * 60);
  assert.equal(ev.active, true);
  assert.ok(ev.strength > 0 && ev.strength <= 1);
  assert.equal(`${ev.labelBn} · ${ev.labelEn}`, 'অফিস যাত্রা · Office rush');
});

test('marketplace is active at 12:00 and 18:30 with bazaar and evening market labels', () => {
  const bazaar = activeHotspotEvent('marketplace', 12 * 60);
  assert.equal(bazaar.active, true);
  assert.ok(bazaar.strength > 0 && bazaar.strength <= 1);
  assert.equal(`${bazaar.labelBn} · ${bazaar.labelEn}`, 'বাজারের সময় · Bazaar hour');

  const evening = activeHotspotEvent('marketplace', 18 * 60 + 30);
  assert.equal(evening.active, true);
  assert.ok(evening.strength > 0 && evening.strength <= 1);
  assert.equal(`${evening.labelBn} · ${evening.labelEn}`, 'সন্ধ্যার বাজার · Evening market');
});

test('college and school are active at 13:30 with school release label', () => {
  for (const kind of ['college', 'school']) {
    const ev = activeHotspotEvent(kind, 13 * 60 + 30);
    assert.equal(ev.active, true);
    assert.equal(ev.strength, 1);
    assert.equal(`${ev.labelBn} · ${ev.labelEn}`, 'ছুটির সময় · School release');
  }
});

test('junction is not active at 12:00', () => {
  const ev = activeHotspotEvent('junction', 12 * 60);
  assert.equal(ev.active, false);
  assert.equal(ev.strength, 0);
});

test('bad minutes and unknown kinds do not throw', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -500, 99999]) {
    const ev = activeHotspotEvent('marketplace', bad);
    assert.equal(typeof ev.active, 'boolean');
    assert.ok(Number.isFinite(ev.strength) && ev.strength >= 0 && ev.strength <= 1);
  }
  const unknown = activeHotspotEvent('', 9 * 60);
  assert.equal(unknown.active, false);
});
