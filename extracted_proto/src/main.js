import * as THREE from 'three';

// THELA DHAKA: original procedural 3D single-player gameplay prototype.
// No external textures, commercial models, or real-world identifiers are used.
const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b7d2ce');
scene.fog = new THREE.FogExp2('#c9c9af', 0.0075);
const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 470);
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.55;
$('game').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe6f2ff,0x9c8065,2.15));
const sun = new THREE.DirectionalLight(0xffecd0,2.55);sun.position.set(-55,115,70);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-125;sun.shadow.camera.right=125;sun.shadow.camera.top=125;sun.shadow.camera.bottom=-125;sun.shadow.bias=-.00035;scene.add(sun);
const matte=(color,roughness=0.92)=>new THREE.MeshStandardMaterial({color,roughness});
const mat={soil:matte('#a49e7a'),road:matte('#5b6260'),median:matte('#cbb880'),pavement:matte('#ae9580'),stripe:matte('#e7ddae'),yellow:matte('#f2c45d'),curb:matte('#252829'),red:matte('#c54f3c'),green:matte('#27835c'),leaf:matte('#51773e'),brown:matte('#604a37'),wood:matte('#a87843'),dark:matte('#292e36'),light:matte('#e8dfc1'),glass:new THREE.MeshStandardMaterial({color:'#b6d3c7',roughness:0.24,metalness:0.05}), concrete:matte('#a6a598'),metal:matte('#6a7678'),sky:matte('#93c1be')};
const block=(p,w,h,d,m,x=0,y=h/2,z=0,cast=true)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=cast;mesh.receiveShadow=true;p.add(mesh);return mesh;};
const cylinder=(p,rt,rb,h,m,x=0,y=h/2,z=0,s=10)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,s),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;p.add(mesh);return mesh;};
const sphere=(p,r,m,x,y,z,w=8,h=6)=>{const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),m);mesh.position.set(x,y,z);mesh.castShadow=true;p.add(mesh);return mesh;};
const rand=(a,b)=>a+Math.random()*(b-a), pick=a=>a[(Math.random()*a.length)|0];
function labelTexture(text,fg='#f9df85',bg='#16433b',width=384,height=96){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const cx=canvas.getContext('2d');cx.fillStyle=bg;cx.fillRect(0,0,width,height);cx.strokeStyle='#e0b45c';cx.lineWidth=7;cx.strokeRect(4,4,width-8,height-8);cx.fillStyle=fg;cx.textAlign='center';cx.textBaseline='middle';cx.font="bold 44px 'Hind Siliguri', sans-serif";cx.fillText(text,width/2,height/2+7,width-22);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:false});}
function sign(p,text,x,y,z,w=5){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),labelTexture(text));mesh.position.set(x,y,z);p.add(mesh);return mesh;}
// City: invented block layout inspired by (not geographically equivalent to) Dhaka streets.
block(scene,265,.7,265,mat.soil,0,-.45,0,false);
const street=[-80,-40,0,40,80];
for(const n of street){block(scene,246,.12,13,mat.road,0,.005,n,false);block(scene,13,.12,246,mat.road,n,.007,0,false);
  for(let k=-116;k<117;k+=8){block(scene,2.6,.018,.19,mat.stripe,k,.08,n,false);block(scene,.19,.018,2.6,mat.stripe,n,.08,k,false)}
  for(const s of [-1,1]){block(scene,246,.12,2.8,mat.pavement,0,.015,n+s*8.1,false);block(scene,2.8,.12,246,mat.pavement,n+s*8.1,.015,0,false)}
}
// Sidewalk junction stripes, with cheerful yellow-black kerbs.
for(const x of street) for(const z of street){for(let j=-3;j<=3;j++){
  block(scene,.72,.015,2.35,mat.stripe,x+j*1.45,.095,z+9,false);
  block(scene,2.35,.015,.72,mat.stripe,x+9,.095,z+j*1.45,false);
}}
const palette=['#dc9a6f','#b47e68','#a8a38b','#e0b883','#729da0','#8ba48b','#c3a5a0'];
const shops=['চায়ের দোকান','ফলের আড়ৎ','নিউ মার্কেট','সিটি স্টোর','ঢাকা খাবার','মা ফার্মেসি','সবজি বাজার','ফুচকা হাউস','মায়ের দোয়া','মিষ্টি ঘর'];
const obstacles=[];
function buildBuilding(x,z){const h=rand(10,31),color=pick(palette),width=rand(17,23),depth=rand(17,23);
const facade=matte(color);block(scene,width,h,depth,facade,x,h/2,z);block(scene,width+1,.5,depth+1,mat.concrete,x,h+.25,z);
const faces=Math.max(2,Math.floor(h/3.4));
for(let f=0;f<faces;f++)for(let j=-2;j<=2;j++){if(f===0) continue;const win=block(scene,1.8,1.7,.05,mat.glass,x+j*(width/6),f*3+2,z+depth/2+.03,false);win.castShadow=false;
block(scene,1.8,.12,.2,mat.concrete,x+j*width/6,f*3+1.2,z+depth/2+.18,false)}
block(scene,width*.74,2.4,.9,matte(pick(['#368778','#d78342','#b3a647','#c85b48'])),x,1.6,z+depth/2+.55);
sign(scene,pick(shops),x,3.7,z+depth/2+.65, Math.min(9,width*.75));
obstacles.push({x,z,hw:width/2+.55,hd:depth/2+.55});
}
for(let i=0;i<4;i++)for(let j=0;j<4;j++){const x=-60+i*40;const z=-60+j*40;if(x===20&&z===20)continue;buildBuilding(x,z)}
// Add a few far perimeter blocks and small alleys between building rows.
for(const x of [-100,100])for(const z of [-100,-60,-20,20,60,100]){if(Math.random()<.63)buildBuilding(x,z)}
function tree(x,z){cylinder(scene,.18,.22,3.9,mat.brown,x,1.95,z,7);sphere(scene,2.3,matte(pick(['#457a42','#638c4a','#356d46'])),x,5,z,7,5);}
for(const v of [-80,-40,0,40,80])for(let a=-115;a<116;a+=17){if(Math.abs(a-v)<10)continue;if(Math.random()<.57){tree(a,v+10.5)}if(Math.random()<.47)tree(v+10.5,a)}
function pole(x,z){cylinder(scene,.11,.14,8,mat.metal,x,4,z,8);block(scene,1.2,.13,.13,mat.dark,x+0.45,7.9,z,false);}
for(let z=-110;z<110;z+=27){pole(-10,z);pole(50,z)}
// Elevated roadway/metro on far background; actual clearance beneath is deliberately open.
for(let x=-115;x<115;x+=15){cylinder(scene,.95,1.2,8.1,mat.concrete,x,4,-79.5,8)}
block(scene,244,1.1,11.2,mat.concrete,0,8.4,-79.5,false);block(scene,244,.16,10,mat.road,0,9.1,-79.5,false);
// Fruit carts, roadside umbrellas and market stalls.
function stall(x,z){const g=new THREE.Group();g.position.set(x,0,z);block(g,3.9,1,2.5,mat.wood,0,.8,0);for(const xx of [-1.5,1.5])for(const zz of [-.8,.8])cylinder(g,.055,.055,2.5,mat.metal,xx,2.35,zz);block(g,4.4,.3,2.9,matte('#e7b344'),0,3.75,0);for(let i=0;i<9;i++)sphere(g,.25,matte(pick(['#dd4931','#86ae4a','#e6bc3c'])),rand(-1.6,1.6),1.5,rand(-.7,.7));scene.add(g);return g;}
for(const [x,z] of [[-9,-27],[11,25],[-49,-8],[71,51],[-35,70],[35,-42]])stall(x,z);
function rickshaw(x,z,color){const g=new THREE.Group();g.position.set(x,0,z);block(g,1.7,.4,2.6,matte(color),0,.86,0);block(g,1.5,1.4,1.2,matte('#efd87d'),0,1.73,.4);block(g,1.6,.11,2.7,matte('#c73c59'),0,2.5,.2);for(const xx of [-.85,.85])for(const zz of [-.8,.9]){const wheel=cylinder(g,.39,.39,.13,mat.dark,xx,.42,zz,12);wheel.rotation.z=Math.PI/2}return g;}
const traffic=[];for(let i=0;i<14;i++){const vertical=Math.random()<.5;const lane=pick(street)+(Math.random()<.5?2.8:-2.8);const r=rickshaw(vertical?lane:rand(-112,112),vertical?rand(-112,112):lane,pick(['#d24449','#e0b738','#469c8b','#d7723c']));if(vertical)r.rotation.y=Math.random()<.5?0:Math.PI;else r.rotation.y=Math.random()<.5?Math.PI/2:-Math.PI/2;scene.add(r);traffic.push({mesh:r,vertical,v:rand(.7,2.0)*(r.rotation.y===0||r.rotation.y===Math.PI/2?-1:1)});}
function makeHuman(police=false){const g=new THREE.Group();const shirt=matte(police?'#284970':pick(['#df8565','#69a89b','#d8bb70','#a0a0aa']));const pants=matte(police?'#20314a':'#414348');cylinder(g,.37,.46,1.2,shirt,0,1.36,0,8);cylinder(g,.31,.35,.8,pants,-.17,.39,0,8);cylinder(g,.31,.35,.8,pants,.17,.39,0,8);sphere(g,.34,matte('#b87954'),0,2.2,0);block(g,.38,.18,.32,matte('#24292c'),0,2.52,.01);for(const xx of [-.45,.45]){const arm=cylinder(g,.14,.13,.9,shirt,xx,1.44,-.05,8);arm.rotation.z=xx>0?-.3:.3;}if(police)block(g,.65,.23,.65,matte('#203b65'),0,2.61,0);return g;}
function createCart(isVendor=true){const g=new THREE.Group();const avatar=makeHuman(!isVendor);g.add(avatar);if(isVendor){const frame=new THREE.Group();frame.position.z=1.35;g.add(frame);block(frame,1.75,.2,1.75,mat.wood,0,.85,0);block(frame,1.9,.33,.12,mat.red,0,1.35,-.75);block(frame,1.9,.33,.12,mat.yellow,0,1.35,.75);for(const xx of [-.92,.92]){const wheel=cylinder(frame,.39,.39,.15,mat.dark,xx,.43,0,12);wheel.rotation.z=Math.PI/2;}for(let i=0;i<17;i++)sphere(frame,.24,matte(pick(['#d85e37','#d4a538','#82a755','#7e9f46'])),rand(-.7,.7),1.12,rand(-.64,.64));const signBoard=block(frame,1.65,.53,.12,matte('#216a58'),0,1.85,.79);signBoard.castShadow=false;sign(frame,'ঠেলা ঢাকা',0,1.85,.86,1.55);for(const xx of [-.55,.55])block(frame,.09,.14,1.45,mat.metal,xx,1.05,-.87);}return g;}
const human= createCart(true);scene.add(human);const officer=makeHuman(true);scene.add(officer);const npcVendor=createCart(true);scene.add(npcVendor);
const customers=[];for(let i=0;i<23;i++){const p=makeHuman(false);const nearRoad=pick(street)+pick([-8.9,8.9]);if(i<5)p.position.set((i-2)*2.2,0,1+(i%3)*4.6);else if(Math.random()<.5)p.position.set(nearRoad,0,rand(-100,100));else p.position.set(rand(-100,100),0,nearRoad);scene.add(p);customers.push({mesh:p,phase:rand(0,6),drift:rand(.1,.9)})}
const productNames=['আম','কলা','পেয়ারা','সবজি','চা','ফুচকা','পেয়াজ'];
const keys=new Set();let role='',state=null,pending=null,stalled=false;const clock=new THREE.Clock();let acc=0,tellUntil=0,noticeText='';
const vector2=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function notify(s,seconds=3){noticeText=s;tellUntil=performance.now()/1000+seconds;$('notice').textContent=s}
function newState(mode){return {mode,stage:'playing',cash:250,level:1,cap:10,stock:10,sales:0,total:0,heat:0,alert:false,escape:0,cooldown:0,sale:null,rank:1,arrests:0,integrity:100,stall:null,policeCash:0,charge:100,time:0,heading:0,speed:0,aiHeading:0};}
function startGame(mode){role=mode;state=newState(mode);human.visible=mode==='vendor';officer.visible=true;npcVendor.visible=mode==='police';human.position.set(0,0,7);officer.position.set(0,0,-23);npcVendor.position.set(0,0,-19);$('menu').classList.add('hide');$('hud').classList.remove('hidden');$('touch').style.display=matchMedia('(pointer:coarse)').matches?'flex':'';$('panel').style.display='none';camera.position.set(0,10,20);notify(mode==='vendor'?'Sell products, then escape police!':'Patrol the streets and catch the vendor!');updateHUD();}
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>startGame(b.dataset.mode);
function panel(title,text,buttons,eyebrow='GAME EVENT'){stalled=true;$('panel').style.display='flex';$('panelTitle').textContent=title;$('panelText').textContent=text;$('panelEyebrow').textContent=eyebrow;const zone=$('panelButtons');zone.replaceChildren();for(const [name,fn,cls] of buttons){const b=document.createElement('button');b.className=cls?'close secondary':'close';b.textContent=name;b.onclick=()=>{zone.replaceChildren();$('panel').style.display='none';stalled=false;fn()};zone.appendChild(b)}}
function gameOver(text){state.stage='over';panel('RUN OVER',text,[['Try again',()=>startGame(role)],['Main menu',()=>{$('menu').classList.remove('hide');$('hud').classList.add('hidden');role='';state=null}]],'THELA DHAKA · ARCADE');}
function distanceToCustomer(){let nearest=null,d=99;for(const c of customers){const dist=vector2(human.position,c.mesh.position);if(dist<d){d=dist;nearest=c}}return {nearest,d};}
function beginSale(){if(state.mode!=='vendor'||state.sale||state.stock<=0||state.cooldown>0)return;const {nearest,d}=distanceToCustomer();if(d>4.8){notify('Get closer to a customer to sell.');return;}const seconds=rand(5,10),product=pick(productNames),price=Math.max(20,Math.round((23+seconds*9+rand(-14,17))*(1+(state.level-1)*.28)));state.sale={seconds,start:state.time,price,product,customer:nearest};notify(`${product} · selling for ${seconds.toFixed(1)}s · ৳${price}`,seconds);}
function completeSale(){const s=state.sale;if(!s)return;state.cash+=s.price;state.total+=s.price;state.stock--;state.sales++;state.heat=Math.min(100,state.heat+18+state.level*3.7);state.sale=null;notify(`Sold ${s.product} · +৳${s.price}! Police attention rising.`,3.5);}
function upgrade(){if(state.mode!=='vendor')return;if(state.level>=12){notify('Maximum cart level reached.');return;}const cost=130+state.level*85;if(state.cash<cost){notify(`Need ৳${cost} to upgrade, you have ৳${state.cash}.`);return;}state.cash-=cost;state.level++;state.cap+=3;state.stock+=3;state.heat=Math.min(100,state.heat+5);notify(`Cart level ${state.level}! Capacity ${state.cap}; higher earnings and risk.`,4)}
function restock(){if(state.mode!=='vendor')return;const needed=state.cap-state.stock;const cost=needed*7;if(needed===0){notify('Inventory is full.');return;}if(cost>state.cash){notify(`Restock costs ৳${cost}. Earn more.`);return;}state.cash-=cost;state.stock=state.cap;notify(`Restocked ${needed} items for ৳${cost}.`)}
function placeStall(){if(state.mode!=='vendor')return;if(state.level<10){notify('Unlock large food stall at cart level 10.');return;}if(state.stall){notify('Your large stall is already placed.');return;}const g=stall(human.position.x+3,human.position.z+3);g.scale.set(1.8,1.35,1.8);state.stall=g;state.heat=100;notify('Large food stall opened! Higher earnings, high enforcement risk.',5)}
function bribeDemand(){const cost=90+state.level*45;state.sale=null;state.alert=false;panel('Caught by police','This is a fictional satirical encounter. Pay an unlawful in-game bribe of ৳'+cost+' or be sent to jail. No real payments.',[['Pay ৳'+cost,()=>{if(state.cash<cost){gameOver('You could not pay the fictional demand. Jail ends the vendor run.');return;}state.cash-=cost;state.heat=0;state.cooldown=10;officer.position.set(human.position.x+26,0,human.position.z-22);notify('Released. Stay clear until the cooldown finishes.',5)},false],['Go to jail',()=>gameOver(`You sold ${state.sales} items and earned ৳${state.total}.`),true]],'FICTIONAL STORY EVENT')}
function arrestVendor(){if(state.mode!=='police')return;const d=vector2(officer.position,npcVendor.position);if(d>3.2){notify('Move close to the vendor before arresting.');return;}panel('Vendor caught','Record a lawful arrest to advance your police career, or take an unlawful fictional payment and lose integrity.',[['Record arrest',()=>{state.arrests++;state.integrity=Math.min(100,state.integrity+2);npcVendor.position.set(rand(-45,-27),0,rand(24,50));if(state.arrests>=5)notify('Magistrate Operation EVENT unlocked (separate from police rank)!',6);else notify('Arrest recorded. Promotion progress +1.');state.rank=Math.min(4,1+Math.floor(state.arrests/2));},false],['Take illicit ৳150',()=>{state.policeCash+=150;state.integrity=Math.max(0,state.integrity-20);npcVendor.position.set(rand(-45,-27),0,rand(24,50));notify('Illicit payment received. No arrest credit; integrity reduced.');},true]],'PURSUE OR DECIDE')}
function operation(){if(state.mode!=='police')return;if(state.arrests<5){notify('Magistrate Operation event unlocks after 5 arrests.');return;}notify('Fictional court-authorized street clearing event initiated. Only fixed structures are removed.',6)}
function action(k){if(!state||stalled||state.stage!=='playing')return;if(k==='e')state.mode==='vendor'?beginSale():arrestVendor();else if(k==='u')upgrade();else if(k==='r')restock();else if(k==='b')placeStall();else if(k==='x')operation();else if(k==='c'){camera.fov=camera.fov===66?80:66;camera.updateProjectionMatrix();notify('Camera zoom changed')}}
window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();if(e.repeat)return;const normalized=key==='arrowup'?'w':key==='arrowleft'?'a':key==='arrowright'?'d':key==='arrowdown'?'s':key;keys.add(normalized);action(normalized)});
window.addEventListener('keyup',e=>{let k=e.key.toLowerCase();if(k==='arrowup')k='w';if(k==='arrowleft')k='a';if(k==='arrowdown')k='s';if(k==='arrowright')k='d';keys.delete(k)});
window.addEventListener('blur',()=>keys.clear());
for(const btn of document.querySelectorAll('[data-key]'))btn.onclick=()=>action(btn.dataset.key);
for(const btn of document.querySelectorAll('[data-hold]')){btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keys.add(btn.dataset.hold)};const clear=()=>keys.delete(btn.dataset.hold);btn.onpointerup=clear;btn.onpointercancel=clear;btn.onlostpointercapture=clear;}
function movePlayer(dt){const p=state.mode==='vendor'?human:officer;const turn=(keys.has('a')?1:0)-(keys.has('d')?1:0);state.heading+=turn*dt*2.15;const throttle=(keys.has('w')?1:0)-(keys.has('s')?.55:0);const sprint=keys.has(' ')||keys.has('shift');const speed=(state.mode==='vendor'?4.65:5.4)*(sprint?1.65:1)*throttle;
const nx=p.position.x+Math.sin(state.heading)*speed*dt;const nz=p.position.z-Math.cos(state.heading)*speed*dt;
const invalid=obstacles.some(b=>Math.abs(nx-b.x)<b.hw+.7&&Math.abs(nz-b.z)<b.hd+.7);
if(!invalid&&Math.abs(nx)<111&&Math.abs(nz)<111){p.position.set(nx,0,nz);state.speed=speed}else state.speed=0;
p.rotation.y=state.heading;}
function moveAI(dt){if(state.mode==='vendor'){if(state.heat>27&&state.cooldown===0&&vector2(human.position,officer.position)<55)state.alert=true;
const toHuman=new THREE.Vector3().subVectors(human.position,officer.position);const dist=toHuman.length();let dir;
if(state.alert){dir=toHuman.clone();dir.y=0;dir.normalize();officer.position.addScaledVector(dir,Math.min(dist,1)*3.55*dt);officer.rotation.y=Math.atan2(dir.x,-dir.z);
if(dist<2.1){bribeDemand();return}
if(dist>30){state.escape+=dt;if(state.escape>5){state.alert=false;state.heat=Math.max(0,state.heat-30);state.cooldown=11;state.escape=0;notify('Escaped! Stay out of sight during cooldown.',5)}}else state.escape=0;
}else{const angle=state.time*.3;officer.position.x+=Math.sin(angle)*dt*1.1;officer.position.z+=Math.cos(angle*.7)*dt*.9;officer.position.x=THREE.MathUtils.clamp(officer.position.x,-100,100);officer.position.z=THREE.MathUtils.clamp(officer.position.z,-100,100)}
}else{const t=state.time;const d=vector2(officer.position,npcVendor.position);if(d<13){let dx=npcVendor.position.x-officer.position.x,dz=npcVendor.position.z-officer.position.z;const n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;npcVendor.position.x+=dx*dt*3.8;npcVendor.position.z+=dz*dt*3.8;npcVendor.rotation.y=Math.atan2(dx,-dz)}else{npcVendor.position.x+=Math.sin(t*.58)*dt*2.2;npcVendor.position.z+=Math.cos(t*.34)*dt*2.2;npcVendor.rotation.y=Math.sin(t*.58)*1.3}npcVendor.position.x=THREE.MathUtils.clamp(npcVendor.position.x,-104,104);npcVendor.position.z=THREE.MathUtils.clamp(npcVendor.position.z,-104,104)}}
function updateCustomers(dt){for(const c of customers){c.phase+=dt*c.drift;const m=c.mesh;const nx=m.position.x+Math.sin(c.phase)*dt*.34,nz=m.position.z+Math.cos(c.phase*.71)*dt*.36;if(Math.abs(nx)<112&&Math.abs(nz)<112&&!obstacles.some(b=>Math.abs(nx-b.x)<b.hw+.65&&Math.abs(nz-b.z)<b.hd+.65)){m.position.x=nx;m.position.z=nz}m.rotation.y=Math.sin(c.phase)*.7;}}
function simulate(dt){if(!state||stalled||state.stage!=='playing')return;state.time+=dt;movePlayer(dt);moveAI(dt);updateCustomers(dt);if(state.cooldown>0)state.cooldown=Math.max(0,state.cooldown-dt);
if(state.sale){const s=state.sale;const elapsed=state.time-s.start;if(vector2(human.position,s.customer.mesh.position)>6||state.alert){state.sale=null;notify('Sale interrupted — no payment.');}else if(elapsed>=s.seconds)completeSale()}
if(state.mode==='vendor'){if(!state.alert&&state.heat>0)state.heat=Math.max(0,state.heat-dt*.9);if(state.stall&&Math.random()<dt*.07){state.cash+=45;state.total+=45}}
for(const item of traffic){const p=item.mesh.position;const d=item.v*dt;if(item.vertical){p.z+=d;if(Math.abs(p.z)>112)p.z=-Math.sign(p.z)*112;}else{p.x+=d;if(Math.abs(p.x)>112)p.x=-Math.sign(p.x)*112;}}
updateHUD()}
function updateHUD(){if(!state)return;const vendor=state.mode==='vendor';$('labelA').textContent=vendor?'Wallet':'Duty cash';$('cash').textContent='৳'+(vendor?state.cash:state.policeCash);$('labelB').textContent=vendor?'Cart level':'Police rank';$('level').textContent=vendor?String(state.level).padStart(2,'0'):['','CONST.','ASI','SI','INSP.'][state.rank];$('labelC').textContent=vendor?'Inventory':'Integrity';$('stock').textContent=vendor?`${state.stock}/${state.cap}`:`${state.integrity}%`;$('labelD').textContent=vendor?'Sales':'Arrests';$('sales').textContent=vendor?state.sales:state.arrests;$('role').textContent=vendor?'🛒 VENDOR · DHAKA':'👮 POLICE · DHAKA';const stars=Math.min(5,Math.ceil(state.heat/20));$('wanted').textContent=vendor?('★ '.repeat(stars)+'☆ '.repeat(5-stars)):(state.arrests>=5?'MAGISTRATE EVENT UNLOCKED':'ARRESTS FOR EVENT: '+state.arrests+'/5');
if(vendor){$('hint').firstElementChild.textContent=state.sale?`Selling ${state.sale.product} · ৳${state.sale.price}`:state.alert?'POLICE CHASE — RUN!':state.cooldown>0?`Cooldown ${Math.ceil(state.cooldown)}s`:'Earn, escape, upgrade.';$('hintText').textContent=state.sale?'Stay near the customer until the sale finishes.':`WASD move · E sell · Space run · U upgrade (৳${130+state.level*85}) · R restock${state.level>=10?' · B big stall':''}`;$('progressbar').style.width=state.sale?Math.min(100,100*(state.time-state.sale.start)/state.sale.seconds)+'%':state.cooldown>0?(100-state.cooldown/11*100)+'%':'0%'}else{$('hint').firstElementChild.textContent='Patrol, pursue, decide.';$('hintText').textContent=`WASD move · Space run · E capture · X operation after 5 arrests`;$('progressbar').style.width=Math.min(100,state.arrests/5*100)+'%'}
if(performance.now()/1000>tellUntil){$('notice').textContent=vendor?(state.alert?'🚨 Police nearby! Lose the chase.':`Selling in Dhaka · ${state.level} level · ৳${state.total} earned`):`Constable career · ${state.arrests} arrests · ${state.integrity}% integrity`};drawMap()}
function drawMap(){const c=$('minimap'),cx=c.getContext('2d'),size=200;cx.clearRect(0,0,size,size);cx.fillStyle='#d3c9a8';cx.fillRect(0,0,200,200);cx.strokeStyle='#67695f';cx.lineWidth=10;for(const v of street){const t=(v+120)/240*size;cx.beginPath();cx.moveTo(t,0);cx.lineTo(t,200);cx.stroke();cx.beginPath();cx.moveTo(0,t);cx.lineTo(200,t);cx.stroke();}
function dot(g,color,r=5){cx.fillStyle=color;cx.beginPath();cx.arc((g.position.x+120)/240*200,(g.position.z+120)/240*200,r,0,Math.PI*2);cx.fill()}dot(state.mode==='vendor'?human:npcVendor,'#f8c357',6);dot(officer,'#31569b',5);}
function render(){let dt=Math.min(clock.getDelta(),0.05);acc+=dt;if(acc>0.045){simulate(Math.min(acc,0.05));acc=0}if(state){const p=state.mode==='vendor'?human:officer;const forward=new THREE.Vector3(Math.sin(state.heading),0,-Math.cos(state.heading));const target=p.position.clone().addScaledVector(forward,-11).add(new THREE.Vector3(0,7,0));camera.position.lerp(target,.08);const look=p.position.clone().addScaledVector(forward,5).add(new THREE.Vector3(0,2.2,0));camera.lookAt(look)}else{const t=performance.now()*.00012;camera.position.set(Math.sin(t)*42,22,Math.cos(t)*45);camera.lookAt(0,1,0)}renderer.render(scene,camera);requestAnimationFrame(render)}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7))});
window.addEventListener('unhandledrejection',event=>{$('error').style.display='block';$('error').textContent='3D loading error: '+String(event.reason)});
render();
