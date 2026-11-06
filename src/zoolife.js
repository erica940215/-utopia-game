/* =========================================================
   園區生態：遊客沿步道走（尋路）、員工步道、員工設施、疾病傳染與隔離、動物行為
   數值在 config.life；建築 kind: staff 在 buildings.json
   ========================================================= */
const LIFE=()=>DATA.config.life;
const staffBuildings=role=>save.zoo.buildings.filter(b=>{ const d=bdef(b.type); return d&&d.kind==='staff'&&d.role===role&&isWorking(b); });
/* 飼育員小屋：太遠的棲地照護打折（入口本身算一間小的） */
function hutFactor(b){
  const L=LIFE(), huts=staffBuildings('hut'), gate=save.zoo.buildings.find(x=>x.type==='gate');
  const near=(h,r)=>tileDist(h,b)<=r+Math.max(...bdef(b.type).size)/2;
  if(gate&&near(gate,L.gateHutRadius)) return 1;
  return huts.some(h=>near(h,bdef(h.type).radius))?1:L.farCoverage;
}
function restCapacity(){ return LIFE().gateRestServes+staffBuildings('rest').reduce((s,b)=>s+bdef(b.type).serves,0); }
const restPenalty=()=>{ const n=totalStaff(), cap=restCapacity(); return n>cap?LIFE().restMoralePenalty*Math.min(1,(n-cap)/Math.max(1,n)):0; };
const vetMult=()=>staffBuildings('vet').length?1:LIFE().vetNoClinic;
const researchMult=()=>1+Math.min(3,staffBuildings('research').length)*LIFE().researchPerCenter;
const repairMult=()=>1+Math.min(2,staffBuildings('repair').length)*LIFE().repairPerWorkshop;
const quarantineCap=()=>staffBuildings('quarantine').reduce((s,b)=>s+bdef(b.type).serves,0);

/* ---------- 疾病：同一座棲地會傳染；隔離區裡的不會 ---------- */
function contagionStep(min){
  const z=save.zoo, L=LIFE(), sick=new Map();
  for(const a of z.animals) if(a.sick) sick.set(a.habitat,(sick.get(a.habitat)||0)+1);
  for(const a of z.animals){ if(a.sick) continue; const n=sick.get(a.habitat)||0;
    if(n&&Math.random()<L.contagionPerMin*n*geneSickMult(a)*RF().sickChanceMult*min){ a.sick=true; zooSickLog.push(a); } }
  // 隔離區：治療比較快，好了就回原本的棲地
  z.quar=z.quar||[];
  let cure=staffPower('vet')*DATA.staffById.vet.curePerMin*L.quarantineCure*vetMult()*min;
  for(const a of [...z.quar]){
    a.health=Math.min(100,(a.health??60)+DATA.config.ops.healthRegenPerMin*2*min);
    if(a.sick&&cure>0&&Math.random()<Math.min(1,cure)){ a.sick=false; cure-=1; }
    if(!a.sick&&a.health>=80){ z.quar.splice(z.quar.indexOf(a),1); const b=findB(a.from); const room=b&&z.animals.filter(x=>x.habitat===b.uid).length<bdef(b.type).capacity;
      if(room){ a.habitat=b.uid; z.animals.push(a); } else { a.habitat=null; z.stored.push(a); } toast(`${nameOf(a)} 康復了，${room?'回到棲地':'先放進倉庫'}`); }
  }
}
let zooSickLog=[];
function sendToQuarantine(a){
  const z=save.zoo; z.quar=z.quar||[];
  if(z.quar.length>=quarantineCap()) { toast(quarantineCap()?'隔離區滿了':'先蓋一座隔離區'); return false; }
  z.animals.splice(z.animals.indexOf(a),1); delete a.preg; a.from=a.habitat; a.habitat=null; z.quar.push(a); return true;
}

/* ---------- 遊客沿步道走：在步道格子上找路 ---------- */
function walkGrid(){
  const m=new Map();
  for(const b of save.zoo.buildings){ const d=bdef(b.type); if(!d) continue; const ok=(d.kind==='path'&&!d.staff)||d.kind==='gate'||d.kind==='facility'||d.kind==='transport';
    if(!ok) continue; for(let i=0;i<d.size[0];i++) for(let j=0;j<d.size[1];j++) m.set((b.x+i)+','+(b.z+j),d.kind==='path'||d.kind==='gate'); }
  return m;
}
let walkCache=null, walkStamp='';
function walkTiles(){ const s=save.zoo.buildings.length+':'+(save.zoo.nextUid||0); if(s!==walkStamp){ walkStamp=s; walkCache=walkGrid(); } return walkCache; }
const tileXZ=k=>{ const [i,j]=k.split(',').map(Number); return {x:(i+0.5-GN()/2)*TS(),z:(j+0.5-GN()/2)*TS()}; };
function findRoute(fromK,toK){
  const G=walkTiles(); if(!G.has(fromK)||!G.has(toK)) return null;
  const prev=new Map([[fromK,null]]), q=[fromK];
  while(q.length){ const k=q.shift(); if(k===toK) break; const [i,j]=k.split(',').map(Number);
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){ const n=(i+di)+','+(j+dj); if(G.has(n)&&!prev.has(n)){ prev.set(n,k); q.push(n); } } }
  if(!prev.has(toK)) return null;
  const r=[]; for(let k=toK;k;k=prev.get(k)) r.unshift(k); return r;
}
function keyAt(x,z){ return Math.floor(x/TS()+GN()/2)+','+Math.floor(z/TS()+GN()/2); }
/* 給 updatePeople 用：替一位遊客挑下一段路 */
function nextWalk(p){
  const G=walkTiles(), keys=[...G.keys()]; if(!keys.length) return null;
  const from=keyAt(p.m.position.x,p.m.position.z), to=keys[Math.floor(Math.random()*keys.length)];
  const r=G.has(from)?findRoute(from,to):null;
  if(r&&r.length>1) return r.slice(1).map(k=>{ const c=tileXZ(k); return {x:c.x+(Math.random()-0.5)*0.9,z:c.z+(Math.random()-0.5)*0.9}; });
  const c=tileXZ(to); p.m.position.set(c.x,0,c.z); return [{x:c.x,z:c.z}];   // 不在步道上就直接放到步道
}
/* 員工步道與一般步道：拖曳就能一路鋪 */
const isPathTool=()=>{ const d=bdef(zTool); return d&&d.kind==='path'; };
function pathDragAt(cx,cy){
  const t=screenToTile(cx,cy); if(!t) return; const d=bdef(zTool), z=save.zoo;
  if(!canPlace(d,t.x,t.z)||!affordable(d.cost)) return;
  pay(d.cost,-1); const b={uid:z.nextUid++,type:d.id,x:t.x,z:t.z,rot:0}; z.buildings.push(b);
  const g=makeBuildingMesh(b); zooRoot.add(g); zooBMeshes.set(b.uid,g); zPathDirty=true;
}
let zPathDirty=false;
function pathDragEnd(){ if(zPathDirty){ zPathDirty=false; simulate(0); updateZooHud(); renderZooTools(); persist(); } }

/* ---------- 動物行為：睡覺、玩玩具、吃東西、游泳、打架 ---------- */
const ACT_NAME={walk:'散步',sleep:'睡覺',play:'玩玩具',eat:'吃東西',swim:'游泳',fight:'打架',sick:'生病休息'};
function pickBehavior(z){
  const a=z.a, L=LIFE(), b=findB(a.habitat); if(!b) return 'walk';
  if(a.sick) return 'sick';
  if((a.fightUntil||0)>(save.zoo.clock||0)) return 'fight';
  if(typeof worldTime==='function'&&worldTime().night) return 'sleep';
  if((a.food??80)<L.eatBelow) return 'eat';
  const env=habitatEnv(b);
  if(env.water>0.05&&Math.random()<L.swimChance) return 'swim';
  if(env.enrich.length&&Math.random()<L.playChance) return 'play';
  return 'walk';
}
function behaviorTarget(z,act){
  const b=findB(z.a.habitat); if(!b) return null; const r=habitatRect(b);
  const inside=(x,zz)=>!r.poly||pointInPoly(x,zz,r.poly);
  if(act==='play'){ const ps=(save.zoo.props||[]).filter(p=>{ const d=pdef(p.type); return d&&d.cat==='enrich'&&p.x>r.x0&&p.x<r.x1&&p.z>r.z0&&p.z<r.z1&&inside(p.x,p.z); }); if(ps.length){ const p=ps[Math.floor(Math.random()*ps.length)]; return {x:p.x+(Math.random()-0.5)*1.5,z:p.z+(Math.random()-0.5)*1.5}; } }
  if(act==='swim'){ const T=save.zoo.terrain; for(let t=0;t<30;t++){ const x=r.x0+Math.random()*(r.x1-r.x0), zz=r.z0+Math.random()*(r.z1-r.z0); if(inside(x,zz)&&ZH(x,zz)<TRN().waterLevel) return {x,z:zz}; } }
  if(act==='eat'){ const c=tileCenter(b); const f=save.zoo.buildings.find(o=>bdef(o.type).kind==='feeder'); if(f){ const fc=tileCenter(f), k=0.75; const x=c.x+(fc.x-c.x)*k*0.5, zz=c.z+(fc.z-c.z)*k*0.5; if(inside(x,zz)) return {x,z:zz}; } }
  if(act==='fight'){ const rival=zooAnimals.find(o=>o!==z&&o.a.habitat===z.a.habitat&&o.a.species===z.a.species&&o.a.sex==='M'); if(rival) return {x:rival.mesh.position.x,z:rival.mesh.position.z}; }
  return null;
}
/* 每隻動物每幀呼叫：回傳 true 表示這幀已經處理過移動 */
function animalBehave(z,dt,gy,lift){
  const m=z.mesh;
  if(!z.act||z.actT<=0){ z.act=pickBehavior(z); z.a.act=z.act; z.actT=6+Math.random()*8; const t=behaviorTarget(z,z.act); if(t){ z.tx=t.x; z.tz=t.z; z.wait=0; } }
  z.actT-=dt;
  const sy=z.baseScale||(z.baseScale=m.scale.y);
  if(z.act==='sleep'||z.act==='sick'){ m.scale.y=sy*(z.act==='sleep'?LIFE().sleepScaleY:0.85); m.position.y=gy+0.05+lift; setAnim(m,'idle'); freezeAnim(m,z.act==='sleep'); return true; }
  if(m.scale.y!==sy){ m.scale.y=sy; freezeAnim(m,false); }
  if(z.act==='swim'&&ZH(m.position.x,m.position.z)<TRN().waterLevel){ m.position.y=TRN().waterLevel-0.25; }
  if(z.act==='fight'){ m.rotation.y+=Math.sin(performance.now()/60)*0.08; }
  return false;
}
