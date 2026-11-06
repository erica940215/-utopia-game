/* =========================================================
   走進火車：車門進出、車廂內部、模組實體擺在車廂裡、駕駛室的製作台
   車廂順序和模組來自 save.train（工坊的「車廂編組」也看得到）
   ========================================================= */
const TRAIN_FLOOR=1.35, CAR_HALF=5.3, CAB_Z0=24.2, CAB_Z1=27.4;
let inTrain=false, trainInterior=null, interiorLights=[];
const carCenter=i=>17.5-12.5*i;
function moduleMesh(id){
  const g=new THREE.Group(), add=(m,x,y,z)=>{ m.position.set(x,y,z); g.add(m); return m; };
  const metal=M(0x5a6068), wood=M(0x7a5a3a), dark=M(0x2a2c30);
  const glow=(c,s)=>{ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); sp.scale.set(s,s,1); return sp; };
  switch(id){
    case 'stove': add(cyl(0.35,0.4,0.9,dark,10),0,0.45,0); add(glow(0xff8a3a,1.2),0,0.5,0.3); add(cyl(0.08,0.08,1.2,dark,6),0,1.5,0); break;
    case 'shelf': for(let k=0;k<3;k++){ add(box(0.5,0.05,1.4,wood),0,0.4+k*0.55,0); add(box(0.4,0.3,0.4,M(0x8a6a3a)),0,0.6+k*0.55,-0.3); } for(const z of [-0.68,0.68]) add(box(0.05,1.6,0.05,wood),0,0.8,z); break;
    case 'cage': { const wire=new THREE.MeshBasicMaterial({color:0x9aa3ab,wireframe:true}); add(new THREE.Mesh(new THREE.BoxGeometry(0.8,0.9,1.2),wire),0,0.45,0); add(box(0.8,0.05,1.2,wood),0,0.02,0); break; }
    case 'aquarium': add(box(0.6,0.6,1.3,new THREE.MeshPhongMaterial({color:0x4aa0d0,transparent:true,opacity:0.55,shininess:90})),0,0.75,0); add(box(0.62,0.45,1.32,dark),0,0.22,0); break;
    case 'auto_turret': add(box(0.5,1.0,0.7,metal),0,0.5,0); add(box(0.3,0.25,0.5,new THREE.MeshBasicMaterial({color:0x7fe8a8})),0.12,0.95,0); break;
    case 'plating': add(box(0.08,1.6,1.4,metal),-0.25,0.8,0); for(const y of [0.3,0.8,1.3]) add(box(0.1,0.06,1.42,dark),-0.2,y,0); break;
    case 'searchlight': add(cyl(0.05,0.05,1.4,dark,6),0,0.7,0); add(cyl(0.18,0.25,0.3,metal,10),0,1.45,0).rotation.z=Math.PI/2; add(glow(0xfff1c4,0.9),0.2,1.45,0); break;
    case 'medkit': add(box(0.4,0.3,0.55,M(0xeeeae2)),0,0.9,0); add(box(0.41,0.08,0.3,M(0xc84a4a)),0,0.9,0); add(box(0.41,0.22,0.08,M(0xc84a4a)),0,0.9,0); add(box(0.5,0.8,0.7,wood),0,0.4,0); break;
    case 'cookstove': add(box(0.6,0.85,1.0,metal),0,0.42,0); add(cyl(0.2,0.2,0.25,dark,10),0,0.98,0.2); add(glow(0xff8a3a,0.6),0.3,0.5,0); break;
    case 'desk': add(box(0.7,0.06,1.2,wood),0,0.75,0); for(const [x,z] of [[-0.3,-0.55],[0.3,-0.55],[-0.3,0.55],[0.3,0.55]]) add(box(0.05,0.75,0.05,wood),x,0.37,z); add(box(0.3,0.02,0.4,M(0xf4ecd8)),0,0.79,0.1); break;
    case 'bed': for(const y of [0.35,1.25]){ add(box(0.75,0.12,1.8,wood),0,y,0); add(box(0.7,0.12,1.7,M(0x6a7a9a)),0,y+0.12,0); } for(const z of [-0.88,0.88]) add(box(0.05,1.6,0.05,wood),0.35,0.8,z); break;
    default: add(box(0.5,0.6,0.8,metal),0,0.3,0);
  }
  return g;
}
function buildTrainInterior(){
  if(trainInterior) scene.remove(trainInterior); interiorLights=[];
  trainInterior=new THREE.Group(); trainInterior.visible=inTrain; scene.add(trainInterior);
  ensureTrain(); const T=save.train, F=TRAIN_FLOOR, H=2.55;
  const floorM=M(0x5a4030), wallM=new THREE.MeshLambertMaterial({color:0x4a3a2e,side:THREE.DoubleSide}), ceilM=new THREE.MeshLambertMaterial({color:0x2a2420,side:THREE.DoubleSide}), trim=M(0x8a6a48);
  const add=(m,x,y,z)=>{ m.position.set(x,y,z); trainInterior.add(m); return m; };
  const section=(z0,z1,door)=>{ const L=z1-z0, c=(z0+z1)/2;
    add(box(2.9,0.12,L,floorM),0,F-0.06,c); add(box(3,0.08,L,ceilM),0,F+H,c);
    for(const s of [-1,1]){
      if(s>0&&door!=null){ // 右側有車門：下半牆留出門的位置
        const d0=door-0.65, d1=door+0.65; if(d0>z0) add(box(0.08,1.0,d0-z0,wallM),1.45,F+0.5,(z0+d0)/2); if(z1>d1) add(box(0.08,1.0,z1-d1,wallM),1.45,F+0.5,(d1+z1)/2);
        add(box(0.1,2.1,0.08,trim),1.45,F+1.05,d0); add(box(0.1,2.1,0.08,trim),1.45,F+1.05,d1);
      } else add(box(0.08,1.0,L,wallM),s*1.45,F+0.5,c);
      add(box(0.08,0.6,L,wallM),s*1.45,F+H-0.3,c);
      for(let z=z0;z<=z1+0.01;z+=2.6) if(!(s>0&&door!=null&&Math.abs(z-door)<0.8)) add(box(0.1,0.95,0.12,trim),s*1.45,F+1.45,Math.min(z1,z));
    }
    const lamp=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xffd08a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); lamp.scale.set(0.8,0.8,1); add(lamp,0,F+H-0.2,c);
  };
  const lights=(z)=>{ const l=new THREE.PointLight(0xffc888,0.9,12,1.6); l.position.set(0,F+H-0.4,z); trainInterior.add(l); interiorLights.push(l); };
  // 駕駛室：鍋爐、製作台
  section(CAB_Z0,CAB_Z1,25.8); lights(25.8);
  const boiler=add(cyl(0.9,0.9,0.4,M(0x2b323b),16),0,F+0.9,CAB_Z1-0.25); boiler.rotation.x=Math.PI/2;
  const fire=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xff6a1a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); fire.scale.set(0.9,0.9,1); add(fire,0,F+0.7,CAB_Z1-0.5);
  add(box(3,H,0.1,wallM),0,F+H/2,CAB_Z1);
  const bench=moduleMesh('desk'); bench.position.set(-0.95,F,24.9); trainInterior.add(bench);
  interactables.push({type:'tbench',inside:true,pos:new THREE.Vector3(-0.8,0,24.9)});
  interactables.push({type:'depart',inside:true,pos:new THREE.Vector3(0.5,0,26.7)});
  interactables.push({type:'tdoor',inside:true,pos:new THREE.Vector3(1.1,0,25.8),car:-1});
  interactables.push({type:'tdoor',inside:false,pos:new THREE.Vector3(2.4,0,25.8),car:-1});
  // 每節車廂
  T.cars.forEach((car,i)=>{
    const c=carCenter(i), d=carDef(car.type);
    section(c-CAR_HALF,c+CAR_HALF,c); if(i%2===0) lights(c);
    add(box(2.2,0.1,(i===0?CAB_Z0-(c+CAR_HALF):12.5-2*CAR_HALF)+0.2,floorM),0,F-0.06,i===0?(c+CAR_HALF+CAB_Z0)/2:c+6.25);   // 車廂之間的通道
    if(i===T.cars.length-1) add(box(3,H,0.1,wallM),0,F+H/2,c-CAR_HALF);
    const n=car.mods.length;
    car.mods.forEach((m,j)=>{ const z=c-3.6+j*(n>1?7.2/(n-1):0);
      if(m){ const mm=moduleMesh(m); mm.position.set(-0.95,F,z); trainInterior.add(mm); }
      else { const ring=new THREE.Mesh(new THREE.RingGeometry(0.35,0.45,24),new THREE.MeshBasicMaterial({color:0x7cc8e8,transparent:true,opacity:0.7,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; add(ring,-0.95,F+0.02,z); }
      interactables.push({type:'tslot',inside:true,pos:new THREE.Vector3(-0.85,0,z),car:i,slot:j}); });
    interactables.push({type:'tdoor',inside:true,pos:new THREE.Vector3(1.1,0,c),car:i,name:d.name});
    interactables.push({type:'tdoor',inside:false,pos:new THREE.Vector3(2.4,0,c),car:i,name:d.name});
  });
  for(const l of interiorLights) l.visible=inTrain;
}
function setInTrain(v){
  inTrain=v; if(trainInterior) trainInterior.visible=v; for(const l of interiorLights) l.visible=v;
  trainGroup.visible=!v;
  if(v){ player.pos.x=0.6; } else { player.pos.x=2.9; }
}
/* 車廂裡的移動範圍 */
function clampInTrain(){
  const zMin=carCenter(save.train.cars.length-1)-CAR_HALF+0.4, zMax=CAB_Z1-0.6;
  player.pos.x=Math.max(-1.1,Math.min(1.1,player.pos.x)); player.pos.z=Math.max(zMin,Math.min(zMax,player.pos.z));
}
/* 互動提示 */
function trainInteract(it,pt,key){
  if(it.type==='tdoor'){
    pt.textContent=inTrain?`[${key}] 下車`:`[${key}] 進入${it.car<0?'駕駛室':it.name||'車廂'}`;
    if(actPressed){ setInTrain(!inTrain); if(inTrain) player.pos.z=it.pos.z; }
  } else if(it.type==='tslot'){
    const m=save.train.cars[it.car].mods[it.slot];
    pt.textContent=m?`[${key}] ${modDef(m).name}：更換或拆下`:`[${key}] 在這裡裝模組`;
    if(actPressed) showSlotPicker(it.car,it.slot);
  } else if(it.type==='tbench'){
    pt.textContent=`[${key}] 使用製作台`;
    if(actPressed) showTrainCraft();
  }
}
function trainMenu(html,wire){
  state='trainmenu'; if(document.exitPointerLock) document.exitPointerLock();
  screenEl.hidden=false; screenEl.innerHTML=`<div class="hub">${html}<button class="btn ghost" id="tmBack" type="button">回到車廂</button></div>`;
  wire&&wire(); $('tmBack').onclick=closeTrainMenu;
}
function closeTrainMenu(){ screenEl.hidden=true; state='play'; if(!isTouch) tryLock(); }
function showSlotPicker(ci,sj,msg){
  const car=save.train.cars[ci], cur=car.mods[sj], list=CARS().modules.filter(m=>!m.cars||m.cars.includes(car.type));
  trainMenu(`<div class="hub-head"><h1><small>CARRIAGE · ${esc(carDef(car.type).name)}</small>第 ${sj+1} 格模組</h1></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <div class="zres">${DATA.items.filter(i=>!i.consumable&&(i.core||save.resources[i.id]>0)).map(i=>`<span><i>${esc(i.name)}</i><b class="num">${Math.floor(save.resources[i.id]||0)}</b></span>`).join('')}<span><i>金幣</i><b class="num">${Math.floor(save.zoo?save.zoo.coins:0)}</b></span></div>
    ${cur?`<button type="button" class="zmini" id="tmDel">拆下${esc(modDef(cur).name)}（不退還材料）</button>`:''}
    <div class="shoplist">${list.map(m=>`<div class="shopcard${cur===m.id?' on':''}"><div class="sc-main"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></div><button type="button" class="zmini add" data-tm="${m.id}" ${affordable(m.cost)&&cur!==m.id?'':'disabled'}>${esc(costText(m.cost))}</button></div>`).join('')}</div>
    <p class="zp-empty">模組效果下一次出發時生效。車廂本身要在烏托邦的工坊加掛。</p>`,()=>{
    screenEl.querySelectorAll('[data-tm]').forEach(el=>el.onclick=()=>{ const m=modDef(el.dataset.tm); if(!affordable(m.cost)) return; pay(m.cost,-1); car.mods[sj]=m.id; persist(); buildTrainInterior(); showSlotPicker(ci,sj,`裝好了${m.name}`); });
    const d=$('tmDel'); if(d) d.onclick=()=>{ car.mods[sj]=null; persist(); buildTrainInterior(); showSlotPicker(ci,sj,'拆下來了'); };
  });
}
function showTrainCraft(msg){
  const R=DATA.recipes.recipes;
  for(const k in haul){ if(haul[k]){ save.resources[k]=(save.resources[k]||0)+haul[k]; haulBanked[k]=(haulBanked[k]||0)+haul[k]; haul[k]=0; } }   // 車上的物資先收進倉庫才能用
  trainMenu(`<div class="hub-head"><h1><small>WORKBENCH · 駕駛室</small>製作台</h1></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <div class="zres">${DATA.items.filter(i=>save.resources[i.id]>0).map(i=>`<span><i>${esc(i.name)}</i><b class="num">${Math.floor(save.resources[i.id]||0)}</b></span>`).join('')}</div>
    <p class="zp-empty">背包裡的東西要先帶回火車（走進熱區會自動存進車廂），才能拿來製作。</p>
    <div class="shoplist">${R.map(r=>`<div class="shopcard"><div class="sc-main"><b>${esc(r.name)}</b><span>${esc(costText(r.give))} → ${esc(costText(r.get))}</span></div><button type="button" class="zmini add" data-tc="${r.id}" ${affordable(r.give)?'':'disabled'}>製作</button></div>`).join('')}</div>`,()=>{
    screenEl.querySelectorAll('[data-tc]').forEach(el=>el.onclick=()=>{ const r=R.find(x=>x.id===el.dataset.tc); if(!affordable(r.give)) return; pay(r.give,-1); pay(r.get,1); save.stats=save.stats||{}; save.stats.crafted=(save.stats.crafted||0)+1; showTrainCraft(`做好了 ${r.name}`); });
  });
}
