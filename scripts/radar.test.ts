import assert from 'node:assert/strict';
import { test } from 'node:test';
import { radarPosition, radarEdge, nearbyRadarPoints, radarPois, RADAR_RADIUS, type RadarPoi } from '../src/game/ui/radar';

const origin = { x: 0, z: 0 };
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8);

test('player is centered at any world coordinate and heading', () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI * 4]) {
    const player = {x:315,z:-218}, point = radarPosition(player, player, heading);
    close(point.x,0); close(point.y,0); assert.equal(point.inside,true);
  }
});

test('north-up and east-up coordinates agree with tank movement headings', () => {
  const north = radarPosition({x:0,z:-90},origin,0);
  close(north.x,0);close(north.y,-RADAR_RADIUS);
  const eastAhead = radarPosition({x:90,z:0},origin,Math.PI/2);
  close(eastAhead.x,0);close(eastAhead.y,-RADAR_RADIUS);
  const northLeft = radarPosition({x:0,z:-90},origin,Math.PI/2);
  close(northLeft.x,-RADAR_RADIUS);close(northLeft.y,0);
  const behind = radarPosition({x:0,z:90},origin,0);
  close(behind.y,RADAR_RADIUS);
});

test('rotation retains distance and district boundaries do not move the centered player', () => {
  for (let heading = 0; heading <= Math.PI * 2; heading += .1) {
    const result = radarPosition({x:30,z:40},origin,heading);
    close(Math.hypot(result.x,result.y),50/90*RADAR_RADIUS);
  }
  assert.equal(radarPosition({x:91,z:0},origin,0).inside,false);
  assert.equal(radarPosition({x:90,z:0},origin,0).inside,true);
});

test('edge markers preserve bearings without drawing outside the circular mask', () => {
  const point = radarEdge({x:300,y:400});
  close(Math.hypot(point.x,point.y),RADAR_RADIUS-10);close(point.x/point.y,.75);
  assert.equal(point.edge,true);
  assert.deepEqual(radarEdge({x:0,y:0}),{x:0,y:0,edge:false});
});

test('HUD actor payloads are nearest-first, bounded, finite and do not mutate the source', () => {
  const source = [{x:60,z:0},{x:5,z:0},{x:NaN,z:0},{x:100,z:0},{x:12,z:0}];
  const before = [...source];
  assert.deepEqual(nearbyRadarPoints(source,origin,2),[{x:5,z:0},{x:12,z:0}]);
  assert.deepEqual(source,before);
  assert.deepEqual(nearbyRadarPoints(source,origin,0),[]);
});

test('POIs retain visible services and one nearest off-screen bearing per missing kind', () => {
  const source: RadarPoi[] = [
    {x:10,z:0,kind:'G'},{x:15,z:0,kind:'G'},{x:200,z:0,kind:'G'},
    {x:180,z:0,kind:'A'},{x:300,z:0,kind:'A'},{x:400,z:0,kind:'M'},
  ];
  assert.deepEqual(radarPois(source,origin),[source[0],source[1],source[3],source[5]]);
  assert.deepEqual(radarPois([],origin),[]);
  assert.equal(source.length,6);
});
