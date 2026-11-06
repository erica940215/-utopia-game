/* =========================================================
   火車：車廂編組與模組、火車防守、行駛事件
   資料：data/cars.json（車廂、模組、防守數值）、data/events.json（行駛事件）
   ========================================================= */
const CARS=()=>DATA.cars, DEF=()=>DATA.cars.defense;
const carDef=id=>CARS().cars.find(c=>c.id===id);
const modDef=id=>CARS().modules.find(m=>m.id===id);
function ensureTrain(){
  save.train=save.train||{cars:JSON.parse(JSON.stringify(CARS().start))};
  for(const c of save.train.cars){ const d=carDef(c.type); c.mods=c.mods||[]; while(c.mods.length<d.slots) c.mods.push(null); }
  return save.train;
}
/* 把車廂與模組效果加進遠征數值 */
function applyTrainEffects(s){
  ensureTrain();
  const add=e=>{ for(const [k,v] of Object.entries(e||{})){ if(k.endsWith('Mult')) s[k]=(s[k]??1)*v; else s[k]=(s[k]||0)+v; } };
  for(const c of save.train.cars){ add(carDef(c.type).effects); for(const m of c.mods) if(m) add(modDef(m).effects); }
  s.trainHp=(s.trainHp||0)+DEF().baseHp;
  return s;
}

/* ---------- 車廂外觀：依編組重新排列，火車長度跟著變 ---------- */
let trainCarObjs=[];
function rebuildTrainCars(){
  ensureTrain(); const n=save.train.cars.length, A=DATA.assets;
  for(const o of trainCarObjs) trainGroup.remove(o); trainCarObjs=[];
  const files={box:'kenney-train/train-carriage-box',coal:'kenney-train/train-carriage-coal',wood:'kenney-train/train-carriage-wood'};
  const kenney=A&&assetCache[A.train.loco];
  if(kenney){
    for(const ch of trainGroup.children) if(ch.userData.baseCar) ch.visible=false;
    save.train.cars.forEach((c,i)=>{
      const g=assetCache[files[carDef(c.type).model]]||assetCache[A.train.cars[0]]; if(!g) return;
      const o=instAsset(g,{scale:A.train.scale}).obj; o.position.z+=17.5-12.5*i; trainGroup.add(o); trainCarObjs.push(o);
      if(c.mods.includes('auto_turret')||c.type==='turret'){ const t=makeTurretMesh(); t.position.set(0,4.6,17.5-12.5*i); trainGroup.add(t); trainCarObjs.push(t); }
    });
  }
  TRAIN_Z0=n?17.5-12.5*(n-1)-11:23.5;
  colliders[0]={x0:-1.8,x1:1.8,z0:TRAIN_Z0+0.5,z1:TRAIN_Z1+0.8};
}
function makeTurretMesh(){
  const g=new THREE.Group(), m=M(0x2b323b);
  const b=cyl(0.6,0.7,0.5,m,10); g.add(b);
  const gun=cyl(0.12,0.12,1.6,M(0x15181d),8); gun.rotation.x=Math.PI/2; gun.position.set(0,0.35,0.7); g.add(gun);
  g.userData.turret=true; return g;
}

/* ---------- 火車防守：霜影突襲車廂，砲塔自動開火 ---------- */
let trainHp=100, trainHpMax=100, nextRaid=0, turretCd=[], trainBrokenRun=false, runMods={};
function initTrainDefense(){
  trainHpMax=Math.max(20,STATS.trainHp+(runMods.trainHpDelta||0)); trainHp=trainHpMax;
  nextRaid=DEF().firstRaidAt; turretCd=Array.from({length:STATS.turrets||0},(_,i)=>i*0.3); trainBrokenRun=false;
}
function spawnRaid(){
  const D=DEF(), n=D.raidSize[0]+Math.floor(Math.random()*(D.raidSize[1]-D.raidSize[0]+1));
  const keep=player.pos.clone();
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, r=40+Math.random()*12, cz=(TRAIN_Z0+TRAIN_Z1)/2, x=Math.cos(a)*r, z=cz+Math.sin(a)*r;
    player.pos.set(x+60,0,z); const k=wraiths.length; spawnWraith();
    if(wraiths.length>k){ const w=wraiths[wraiths.length-1]; w.g.position.set(x,heightAt(x,z),z); w.raid=true; w.mat.color.setHex(0x2a1418); }
  }
  player.pos.copy(keep);
  toast(`霜影正在突襲火車！${STATS.turrets?'砲塔會幫忙，':''}快回去守住車廂`);
}
/* 突襲的霜影：直衝火車、抓車廂 */
function raidStep(w,dt){
  const g=w.g; w.phase+=dt;
  const tz=Math.max(TRAIN_Z0,Math.min(TRAIN_Z1,g.position.z)), tx=Math.sign(g.position.x||1)*1.8;
  const dx=tx-g.position.x, dz=tz-g.position.z, d=Math.hypot(dx,dz);
  if(d>0.6){ const s=DATA.config.wraith.speed*(w.spd||1)*dt; g.position.x+=dx/d*s; g.position.z+=dz/d*s; }
  else { trainHp-=DEF().raidTouchDamage*dt; trainHitT=0.3; }
  g.rotation.y=Math.atan2(dx,dz); g.position.y=heightAt(g.position.x,g.position.z)+Math.sin(w.phase*2)*0.25;
  if(w.hit>0){ w.hit-=dt; w.mat.emissive.setHex(0x553311); } else w.mat.emissive.setHex(0x2a0a0a);
  const pd=Math.hypot(player.pos.x-g.position.x,player.pos.z-g.position.z);
  if(pd<1.5){ hurt(DATA.config.wraith.touchDrainPerSec*0.5*(CFG().wraithTouchMult||1)*dt); hurtT=0.3; }
}
let trainHitT=0;
function updateTrainDefense(dt,elapsed){
  const D=DEF();
  if(netAuth&&elapsed>nextRaid){ spawnRaid(); nextRaid=elapsed+D.raidEvery*(timeLeft<=0?0.6:1); }
  // 砲塔
  for(let i=0;i<turretCd.length;i++){
    turretCd[i]-=dt; if(turretCd[i]>0) continue;
    let best=null,bd=D.turretRange;
    for(const w of wraiths){ const dd=distToTrain(w.g.position.x,w.g.position.z); if(dd<bd){ bd=dd; best=w; } }
    if(!best) continue; turretCd[i]=D.turretCooldown;   // 砲塔打中的傷害也走 damageEnemy
    const from=new THREE.Vector3(0,5,Math.max(TRAIN_Z0,Math.min(TRAIN_Z1,best.g.position.z))-i*2);
    const to=best.g.position.clone().setY(best.g.position.y+1.3), dir=to.sub(from).normalize();
    const m=sph(0.12,flareMat); m.position.copy(from); world.add(m);
    flares.push({m,v:dir.multiplyScalar(45),life:1.2,dmg:D.turretDamage,grav:0});
  }
  if(trainHitT>0) trainHitT-=dt;
  const el=$('trainHp'); el.textContent=`火車耐久 ${Math.max(0,Math.ceil(trainHp))}/${trainHpMax}`; el.className='num'+(trainHp<trainHpMax*0.35?' warn':'')+(trainHitT>0?' hit':'');
  if(trainHp<=0) trainBroken();
}
function trainBroken(){
  trainBrokenRun=true; const f=DEF().brokenLossFraction;
  depositAll(); for(const k in haul) haul[k]=Math.floor(haul[k]*(1-f));
  boardFollowers(); boardContainer();
  finish(true);
}

/* ---------- 行駛事件：出發後、抵達前 ---------- */
function travelEvent(node,go){
  runMods={};
  const E=DATA.events;
  if(!E||node.type==='stall'||Math.random()>E.chance){ go(); return; }
  const ev=E.events[Math.floor(Math.random()*E.events.length)];
  ensureProgress(); const st=computeStats();
  state='event'; screenEl.hidden=false; $('zooUI').hidden=true;
  const can=o=>(!o.cost||affordable(o.cost))&&(!o.need||Object.entries(o.need).every(([k,v])=>(st[k]||0)>=v));
  screenEl.innerHTML=`<div class="card"><h1><small>ON THE RAILS · 前往${esc(node.name)}的路上</small>${esc(ev.title)}</h1><p>${esc(ev.text)}</p>
    <div class="evopts">${ev.options.map((o,i)=>`<button type="button" class="btn ghost" data-ev="${i}" ${can(o)?'':'disabled'}>${esc(o.label)}${o.cost?`<small>${esc(costText(o.cost))}</small>`:''}${o.need&&!can(o)?'<small>需要砲塔</small>':''}</button>`).join('')}</div></div>`;
  screenEl.querySelectorAll('[data-ev]').forEach(el=>el.onclick=()=>{
    const o=ev.options[+el.dataset.ev]; if(!can(o)) return;
    if(o.cost) pay(o.cost,-1);
    let extra='';
    if(o.gain){ const g={...o.gain}; if(g.species){ const pool=DATA.species.filter(s=>s.rarity===g.species&&s.spawn.length); const sp=pool[Math.floor(Math.random()*pool.length)];
        if(sp){ ensureZoo(); save.collection[sp.id]=(save.collection[sp.id]||0)+1; save.zoo.unplaced[sp.id]=(save.zoo.unplaced[sp.id]||0)+1; extra=`（${sp.name}）`; } delete g.species; }
      pay(g,1); }
    Object.assign(runMods,o.effects||{}); persist();
    screenEl.innerHTML=`<div class="card"><h2>${esc(ev.title)}</h2><p>${esc(o.result)}${esc(extra)}</p><div class="btns"><button class="btn" id="evGo" type="button">繼續前往${esc(node.name)}</button></div></div>`;
    $('evGo').onclick=()=>go();
  });
}

/* ---------- 工坊「車廂編組」分頁 ---------- */
let carPick=null;   // {car:index, slot:index} 或 {add:true}
function trainTabHtml(st){
  const T=ensureTrain(), slots=st.carSlots||2;
  const cards=T.cars.map((c,i)=>{ const d=carDef(c.type);
    return `<div class="carcard"><div class="sc-main"><b>${i+1}. ${esc(d.name)}</b><span>${esc(d.desc)}</span></div>
      <div class="carslots">${c.mods.map((m,j)=>`<button type="button" class="carslot${m?' on':''}${carPick&&carPick.car===i&&carPick.slot===j?' sel':''}" data-slot="${i}:${j}">${m?esc(modDef(m).name):'＋ 空模組位'}</button>`).join('')}</div>
      <div class="zp-btns"><button type="button" class="zmini" data-carup="${i}" ${i?'':'disabled'}>往前</button><button type="button" class="zmini" data-cardel="${i}">拆除</button></div></div>`; }).join('');
  let pick='';
  if(carPick&&carPick.add) pick=`<div class="sec-title"><span>選一種車廂加掛</span></div>`+CARS().cars.map(d=>`<div class="shopcard"><div class="sc-main"><b>${esc(d.name)}</b><span>${esc(d.desc)}・模組位 ${d.slots}</span></div><button type="button" class="zmini add" data-addcar="${d.id}" ${affordable(d.cost)?'':'disabled'}>${esc(costText(d.cost))}</button></div>`).join('');
  else if(carPick){ const c=T.cars[carPick.car], cur=c.mods[carPick.slot];
    const list=CARS().modules.filter(m=>!m.cars||m.cars.includes(c.type));
    pick=`<div class="sec-title"><span>${esc(carDef(c.type).name)}・第 ${carPick.slot+1} 格模組</span></div>`+(cur?`<button type="button" class="zmini" data-moddel="1">拆下${esc(modDef(cur).name)}（不退還材料）</button>`:'')+
      list.map(m=>`<div class="shopcard"><div class="sc-main"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></div><button type="button" class="zmini add" data-mod="${m.id}" ${affordable(m.cost)?'':'disabled'}>${esc(costText(m.cost))}</button></div>`).join(''); }
  return `<div class="statline">火車耐久 ${st.trainHp}・砲塔 ${st.turrets||0} 座・車廂 ${T.cars.length}/${slots}${st.kitchen?'・可以烹飪':''}${st.researchPerRun?`・每趟研究 +${st.researchPerRun}`:''}</div>
    ${cards}
    ${T.cars.length<slots?`<button type="button" class="zmini add" id="carAdd">＋ 加掛車廂</button>`:`<p class="zp-empty">車廂已滿。到「火車升級」升級連結器，就能加掛更多。</p>`}
    ${pick}`;
}
function wireTrainTab(){
  const T=save.train, back=m=>{ persist(); showWorkshop(m); };
  screenEl.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>{ const [i,j]=el.dataset.slot.split(':').map(Number); carPick={car:i,slot:j}; showWorkshop(); });
  const ad=$('carAdd'); if(ad) ad.onclick=()=>{ carPick={add:true}; showWorkshop(); };
  screenEl.querySelectorAll('[data-addcar]').forEach(el=>el.onclick=()=>{ const d=carDef(el.dataset.addcar); if(!affordable(d.cost)) return; pay(d.cost,-1); T.cars.push({type:d.id,mods:Array(d.slots).fill(null)}); carPick=null; back(`加掛了${d.name}`); });
  screenEl.querySelectorAll('[data-mod]').forEach(el=>el.onclick=()=>{ const m=modDef(el.dataset.mod); if(!affordable(m.cost)) return; pay(m.cost,-1); T.cars[carPick.car].mods[carPick.slot]=m.id; carPick=null; back(`裝上了${m.name}`); });
  screenEl.querySelectorAll('[data-moddel]').forEach(el=>el.onclick=()=>{ T.cars[carPick.car].mods[carPick.slot]=null; carPick=null; back('拆下模組了'); });
  screenEl.querySelectorAll('[data-cardel]').forEach(el=>el.onclick=()=>{
    if(el.dataset.confirm!=='1'){ el.dataset.confirm='1'; el.textContent='確定拆除？'; return; }
    const c=T.cars.splice(+el.dataset.cardel,1)[0]; carPick=null; back(`拆掉了${carDef(c.type).name}`); });
  screenEl.querySelectorAll('[data-carup]').forEach(el=>el.onclick=()=>{ const i=+el.dataset.carup; if(i<1) return; [T.cars[i-1],T.cars[i]]=[T.cars[i],T.cars[i-1]]; carPick=null; back(); });
}
