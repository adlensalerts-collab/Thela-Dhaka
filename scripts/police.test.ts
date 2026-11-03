import test from 'node:test';
import assert from 'node:assert/strict';
import { inPoliceView, policeLineOfSight, policeTactics, POLICE_CHASE_SPEED, POLICE_VISION_HALF_ANGLE } from '../src/game/policePerception';
import type { Obstacle } from '../src/game/collision';

const ctx=new Proxy({}, {get:()=>()=>({addColorStop(){}}),set:()=>true});
(globalThis as any).document ??= {createElement:()=>({width:0,height:0,getContext:()=>ctx})};
const THREE=await import('three');
const { CampaignPolice }=await import('../src/game/campaignPolice');
const { SidewalkGraph }=await import('../src/game/pathfinding');
const { difficultyForDay }=await import('../src/game/difficulty');
const origin={x:0,z:0};
const wall: Obstacle={type:'box',x:0,z:-5,hw:2,hd:.05,tag:'building'};

test('sight matches the heading cone, weather range and close awareness',()=>{
  assert.ok(inPoliceView(origin,0,{x:0,z:-25},25));
  assert.ok(!inPoliceView(origin,0,{x:0,z:-25.01},25));
  assert.ok(!inPoliceView(origin,0,{x:0,z:10},25));
  assert.ok(inPoliceView(origin,Math.PI/2,{x:10,z:0},25));
  const angle=POLICE_VISION_HALF_ANGLE;
  assert.ok(inPoliceView(origin,0,{x:10*Math.sin(angle),z:-10*Math.cos(angle)},25));
  assert.ok(!inPoliceView(origin,0,{x:10*Math.sin(angle+.01),z:-10*Math.cos(angle+.01)},25));
  assert.ok(inPoliceView(origin,0,{x:0,z:2},25));
  assert.ok(!inPoliceView(origin,0,{x:0,z:-15},12.5));
  assert.ok(!inPoliceView(origin,NaN,{x:0,z:-10},25));
});

test('thin walls and concave footprints occlude sight, including endpoints inside a building',()=>{
  assert.ok(!policeLineOfSight(origin,{x:0,z:-10},[wall]));
  assert.ok(policeLineOfSight(origin,{x:5,z:-10},[wall]));
  const poly: Obstacle={type:'poly',x:0,z:0,hw:4,hd:4,tag:'building',points:[[-4,-4],[4,-4],[4,4],[1,4],[1,-1],[-1,-1],[-1,4],[-4,4]]};
  assert.ok(policeLineOfSight({x:0,z:0},{x:0,z:3},[poly]),'open notch stays visible');
  assert.ok(!policeLineOfSight({x:-3,z:0},{x:-3,z:2},[poly]),'inside solid wing');
  assert.ok(!policeLineOfSight({x:-5,z:0},{x:5,z:0},[poly]));
  assert.ok(policeLineOfSight(origin,{x:0,z:-10},[{type:'circle',x:0,z:-5,radius:1,tag:'tree'}]));
  assert.ok(!policeLineOfSight(origin,{x:0,z:-10},[{type:'circle',x:0,z:-5,radius:1,tag:'wall'}]));
});

test('tactics unlock gradually; chase is faster than normal push and slower than sprint',()=>{
  assert.deepEqual(policeTactics(1),{search:false,backup:false,intercept:false});
  assert.deepEqual(policeTactics(3),{search:true,backup:false,intercept:false});
  assert.deepEqual(policeTactics(5),{search:true,backup:true,intercept:false});
  assert.deepEqual(policeTactics(8),{search:true,backup:true,intercept:true});
  assert.ok(POLICE_CHASE_SPEED>4.85&&POLICE_CHASE_SPEED<4.85*1.65);
});

function fixture(day=1) {
  const graph=Object.create(SidewalkGraph.prototype) as InstanceType<typeof SidewalkGraph>;
  graph.nodes=[];
  for(let z=-60;z<=60;z+=5) for(let x=-60;x<=60;x+=5) graph.nodes.push({id:graph.nodes.length,x,z,neighbors:[]});
  for(const n of graph.nodes) for(const m of graph.nodes) if(Math.hypot(n.x-m.x,n.z-m.z)===5) n.neighbors.push(m.id);
  let obstacles: Obstacle[]=[];
  const scene=new THREE.Scene(),primary=new THREE.Group();scene.add(primary);
  const police=new CampaignPolice(primary,difficultyForDay(day),{graph,bounds:100,isRoad:()=>false,
    obstacles:()=>obstacles,sightObstacles:()=>obstacles,junctions:[{x:0,z:-25},{x:0,z:-30},{x:20,z:-20}]},scene);
  const player=new THREE.Vector3(0,0,-10),camera=new THREE.Vector3();
  const patrols=(police as any).patrols;
  return {police,primary,player,camera,graph,scene,patrols,setObstacles:(items: Obstacle[])=>{obstacles=items;}};
}

test('wanted heat cannot reveal a vendor behind an officer or a wall',()=>{
  const f=fixture();f.player.set(0,0,10);
  f.police.update(.1,f.player,false,0,f.camera,50,0);
  assert.equal(f.police.playerVisible,false);assert.equal(f.police.lastKnownPosition,null);
  f.player.z=-10;f.setObstacles([wall]);
  f.police.update(.1,f.player,false,0,f.camera,50,0);
  assert.equal(f.police.playerVisible,false);assert.equal(f.police.lastKnownPosition,null);
  f.setObstacles([]);f.primary.rotation.y=0;
  f.police.update(.1,f.player,false,0,f.camera,50,0);
  assert.equal(f.police.playerVisible,true);assert.deepEqual(f.police.lastKnownPosition,{x:0,z:-10});
});

test('actual pursuit closes on normal movement, loses ground to sprinting and respects weather',()=>{
  for(const [vendorSpeed,weather] of [[0,1],[4.85,1],[4.85*1.65,1],[0,.5]]) {
    const f=fixture();const initial=10;
    for(let i=0;i<10;i++) {
      f.player.z-=vendorSpeed*.1;
      f.police.update(.1,f.player,true,weather,f.camera,50,0);
    }
    const gap=f.police.nearestDistance(f.player.x,f.player.z);
    if(vendorSpeed===0) assert.ok(Math.abs(gap-(initial-POLICE_CHASE_SPEED*weather))<.001);
    else if(vendorSpeed===4.85) assert.ok(gap<initial,'walking vendor cannot outrun police');
    else assert.ok(gap>initial,'sprinting creates distance');
  }
});

test('hidden movement cannot update the last sighting and escape clears pursuit memory',()=>{
  const f=fixture(3);for(let i=1;i<f.patrols.length;i++) f.patrols[i].object.position.set(50,0,50);
  f.police.update(.1,f.player,true,0,f.camera,50,0);
  const last=f.police.lastKnownPosition;f.setObstacles([wall]);f.player.set(6,0,-20);
  // A wider wall occludes both the original and displaced vendor.
  f.setObstacles([{...wall,hw:20} as Obstacle]);
  f.police.update(.1,f.player,true,0,f.camera,50,0);
  assert.equal(f.police.playerVisible,false);assert.deepEqual(f.police.lastKnownPosition,last);
  assert.equal(f.police.positions()[0].mode,'search');
  f.police.update(.1,f.player,false,0,f.camera,50,11);
  assert.equal(f.police.lastKnownPosition,null);assert.equal(f.police.positions()[0].mode,'patrol');
});

test('arrests require unobstructed contact, and cooldown suppresses new pursuit memory',()=>{
  const f=fixture();f.player.z=-1.5;f.setObstacles([{...wall,z:-.75,hw:2} as Obstacle]);
  assert.equal(f.police.canArrest(f.player),false);f.setObstacles([]);assert.equal(f.police.canArrest(f.player),true);
  f.police.update(.1,f.player,false,0,f.camera,100,10);assert.equal(f.police.lastKnownPosition,null);
});

test('backup is delayed, uses existing officers, and later days intercept an ahead junction',()=>{
  for(const day of [3,5,8]) {
    const f=fixture(day);
    for(let i=1;i<f.patrols.length;i++) {f.patrols[i].object.position.set(20,0,0);f.patrols[i].object.rotation.y=-Math.PI/2;}
    f.police.update(.1,f.player,true,0,f.camera,50,0);
    assert.ok(f.police.positions().slice(1).every(p=>p.mode==='patrol'));
    for(let i=0;i<40;i++) {f.player.z-=.1;f.police.update(.1,f.player,true,0,f.camera,50,0);}
    const modes=f.police.positions().map(p=>p.mode);
    if(day===3) assert.equal(modes[1],'patrol');
    if(day===5) assert.equal(modes[1],'backup');
    if(day===8) {
      assert.equal(modes.at(-1),'intercept');
      const route=f.patrols.at(-1).route;assert.ok(route.at(-1).z<f.player.z,'interception targets a junction ahead');
    }
    assert.equal(f.police.count,difficultyForDay(day).policeCount);
  }
});

test('route replans preserve progress and cannot bridge disconnected graph components',()=>{
  const f=fixture(3),p=f.patrols[0];
  (f.police as any).planChaseRoute(p,0,-40);p.step=2;
  (f.police as any).planChaseRoute(p,0,-40);assert.equal(p.step,2);
  const isolated=f.graph.nodes.length;f.graph.nodes.push({id:isolated,x:90,z:90,neighbors:[]});
  // Reconstruct after adding a disconnected node so component discovery includes it.
  const police=new CampaignPolice(new THREE.Group(),difficultyForDay(1),{graph:f.graph,bounds:100,isRoad:()=>false,obstacles:()=>[]},new THREE.Scene());
  const patrol=(police as any).patrols[0];(police as any).planChaseRoute(patrol,90,90);
  assert.ok(patrol.route.every((point: {x:number;z:number})=>point.x<=60&&point.z<=60));
});

test('new day/bribe reset clears sightings and routes; invalid dt does not advance AI; teardown removes extras',()=>{
  const f=fixture(10);f.police.resetPositions(0,0);
  assert.equal(f.police.count,5);assert.ok(f.police.positions().every(p=>Math.hypot(p.x,p.z)>=50));
  const before=f.police.positions();for(const dt of [0,-1,NaN,Infinity]) f.police.update(dt,f.player,true,1,f.camera,100,0);
  assert.deepEqual(f.police.positions(),before);
  f.police.resetPositions(0,0);assert.equal(f.police.lastKnownPosition,null);assert.equal(f.police.playerVisible,false);
  assert.equal(f.police.detachExtras().length,4);assert.equal(f.police.count,0);
});
