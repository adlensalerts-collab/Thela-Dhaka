import type { Obstacle } from './collision';

export interface PolicePoint { x: number; z: number }
export const POLICE_VISION_HALF_ANGLE = Math.PI / 5;
export const POLICE_CHASE_SPEED = 5.35;
export const POLICE_CLOSE_SIGHT = 2.1;

/** North-zero heading, shared by movement and the radar. */
export function inPoliceView(from: PolicePoint, heading: number, target: PolicePoint, range: number) {
  const dx=target.x-from.x, dz=target.z-from.z, distance=Math.hypot(dx,dz);
  if (![distance,heading,range].every(Number.isFinite) || range<=0 || distance>range) return false;
  if (distance<=Math.min(POLICE_CLOSE_SIGHT,range)) return true;
  return (dx*Math.sin(heading)-dz*Math.cos(heading))/distance >= Math.cos(POLICE_VISION_HALF_ANGLE)-1e-9;
}

function crosses(a: PolicePoint,b: PolicePoint,c: PolicePoint,d: PolicePoint) {
  const cross=(u: PolicePoint,v: PolicePoint,w: PolicePoint)=>(v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x);
  return Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-8 &&
    Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))+1e-8 &&
    cross(a,b,c)*cross(a,b,d)<=1e-8 && cross(c,d,a)*cross(c,d,b)<=1e-8;
}

/** Exact segment tests avoid seeing through thin or concave building footprints. */
export function policeLineOfSight(a: PolicePoint,b: PolicePoint,obstacles: readonly Obstacle[]) {
  for(const o of obstacles) {
    if(o.tag==='tree'||o.tag==='pole') continue;
    if(o.type==='circle') {
      const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
      const t=length?Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.z-a.z)*dz)/length)):0;
      if(Math.hypot(a.x+t*dx-o.x,a.z+t*dz-o.z)<=o.radius) return false;
      continue;
    }
    if(Math.max(a.x,b.x)<o.x-o.hw||Math.min(a.x,b.x)>o.x+o.hw||
      Math.max(a.z,b.z)<o.z-o.hd||Math.min(a.z,b.z)>o.z+o.hd) continue;
    const ring=o.type==='poly'?o.points:[[o.x-o.hw,o.z-o.hd],[o.x+o.hw,o.z-o.hd],
      [o.x+o.hw,o.z+o.hd],[o.x-o.hw,o.z+o.hd]];
    let insideA=false,insideB=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
      const [x,z]=ring[i],[px,pz]=ring[j];
      if((z>a.z)!==(pz>a.z)&&a.x<(px-x)*(a.z-z)/(pz-z)+x) insideA=!insideA;
      if((z>b.z)!==(pz>b.z)&&b.x<(px-x)*(b.z-z)/(pz-z)+x) insideB=!insideB;
      if(crosses(a,b,{x,z},{x:px,z:pz})) return false;
    }
    if(insideA||insideB) return false;
  }
  return true;
}

export function policeTactics(day: number) {
  return {search:day>=3,backup:day>=5,intercept:day>=8};
}
