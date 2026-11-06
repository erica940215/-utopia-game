/* =========================================================
   戰鬥與探索：敵人種類、武器與改裝、料理、地下碉堡、場景種類、日誌
   資料：enemies.json、weaponmods.json、food.json、biomes.json、lore.json；武器在 equipment.json
   ========================================================= */
const enemyById=id=>DATA.enemies.find(e=>e.id===id);
function pickEnemyType(){
  const t=String((curNode&&curNode.tier)||1), list=DATA.enemies.filter(e=>e.weights[t]);
  let r=Math.random()*list.reduce((s,e)=>s+e.weights[t],0);
  for(const e of list){ r-=e.weights[t]; if(r<=0) return e; } return list[0]||DATA.enemies[0];
}
function makeEnemyMesh(def){
  const g=new THREE.Group(), mat=new THREE.MeshLambertMaterial({color:hex(def.color),transparent:true,opacity:0.86,emissive:0x0a1a2a});
  const eye=new THREE.MeshBasicMaterial({color:hex(def.eye)});
  const eyes=(y,z,s)=>{ for(const k of [-1,1]){ const e=sph(0.07*s,eye); e.position.set(k*0.18*s,y,z); g.add(e); } };
  if(def.look==='hound'){
    const b=sph(0.45,mat); b.scale.set(0.8,0.7,1.6); b.position.y=0.75; g.add(b);
    const h=sph(0.3,mat); h.position.set(0,0.95,0.75); g.add(h); eyes(1.0,1.0,1);
    for(const [x,z] of [[-.25,.45],[.25,.45],[-.25,-.45],[.25,-.45]]){ const l=new THREE.Mesh(new THREE.ConeGeometry(0.09,0.6,6),mat); l.rotation.x=Math.PI; l.position.set(x,0.3,z); g.add(l); }
  } else if(def.look==='revenant'||def.look==='soldier'||def.look==='brute'){
    const s=def.look==='brute'?1.6:1;
    const t=box(0.6*s,0.9*s,0.35*s,mat); t.position.y=1.25*s; g.add(t);
    const h=sph(0.22*s,mat); h.position.y=1.9*s; g.add(h); eyes(1.92*s,0.19*s,s);
    for(const k of [-1,1]){ const a=box(0.16*s,0.8*s,0.16*s,mat); a.position.set(k*0.42*s,1.2*s,def.look==='revenant'?0.25:0); if(def.look==='revenant') a.rotation.x=-1.1; g.add(a);
      const l=box(0.2*s,0.8*s,0.2*s,mat); l.position.set(k*0.17*s,0.4*s,0); g.add(l); }
    if(def.look==='soldier'){ const gun=box(0.08,0.08,0.8,M(0x15181d)); gun.position.set(0.42,1.3,0.4); g.add(gun); }
    if(def.look==='brute'){ const ice=new THREE.MeshPhongMaterial({color:0xcff2ff,shininess:90,emissive:0x1d4a66}); for(const k of [-1,1]){ const sp=new THREE.Mesh(new THREE.ConeGeometry(0.15,0.6,6),ice); sp.position.set(k*0.5*s,1.8*s,0); g.add(sp); } }
  } else {
    const b=sph(0.6,mat); b.scale.y=1.3; b.position.y=1.5; g.add(b);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.4,10),mat); tail.rotation.x=Math.PI; tail.position.y=0.6; g.add(tail); eyes(1.7,0.48,1);
  }
  return {g,mat};
}
const enemyHitY=w=>w.def&&w.def.look==='hound'?0.8:w.def&&w.def.look==='brute'?2:1.3;
/* 遠程敵人的冰刺 */
let eShots=[];
const shardMat=new THREE.MeshBasicMaterial({color:0xc8f4ff});
function enemyRanged(w,d,dx,dz,dt,inHeat,tg){
  const R=w.def.ranged, g=w.g; w.rcd=(w.rcd??R.every*Math.random())-dt;
  if(d<R.keep){ g.position.x-=dx/d*dt*2.5; g.position.z-=dz/d*dt*2.5; }
  if(d<R.range&&!inHeat&&w.rcd<=0){
    w.rcd=R.every; const from=g.position.clone().setY(g.position.y+1.4), to=tg?new THREE.Vector3(tg.x,heightAt(tg.x,tg.z)+1.3,tg.z):player.pos.clone().setY(player.pos.y+1.3), dir=to.sub(from).normalize();
    const m=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.5,5),shardMat); m.position.copy(from); m.lookAt(from.clone().add(dir)); m.rotateX(Math.PI/2); world.add(m);
    eShots.push({m,v:dir.multiplyScalar(R.speed),life:2,drain:R.drain});
    if(coop&&netPeersHere().length){ const v=eShots[eShots.length-1].v; coopSend('shot',{node:curNode.id,p:[from.x,from.y,from.z],v:[v.x,v.y,v.z],dr:R.drain}); }
  }
  return d<R.range;   // 在射程內就不再往前衝
}
function updateEnemyShots(dt){
  for(let i=eShots.length-1;i>=0;i--){
    const s=eShots[i]; s.life-=dt; s.m.position.addScaledVector(s.v,dt);
    const hit=Math.hypot(s.m.position.x-player.pos.x,s.m.position.z-player.pos.z)<0.8&&Math.abs(s.m.position.y-(player.pos.y+1.2))<1.2;
    if(hit){ hurt(s.drain*(CFG().wraithTouchMult||1)); hurtT=0.4; }
    if(hit||s.life<=0){ world.remove(s.m); eShots.splice(i,1); }
  }
}

/* ---------- 武器改裝 ---------- */
const wmodById=id=>DATA.weaponmods.find(m=>m.id===id);
function effWeapon(id){
  const w={...(DATA.equipById[id]||DATA.equipById.flare_gun)};
  const mods=(save.gear.mods&&save.gear.mods[id])||[];
  for(const mid of mods){ const m=wmodById(mid); if(!m) continue;
    for(const [k,v] of Object.entries(m.mult||{})) if(w[k]!=null) w[k]*=v;
    for(const [k,v] of Object.entries(m.add||{})) w[k]=(w[k]||0)+v; }
  w.ammo=Math.round(w.ammo); return w;
}
function weaponModsHtml(g){
  const mods=(save.gear.mods&&save.gear.mods[g.id])||[], avail=DATA.weaponmods.filter(m=>m.for.includes(g.id)&&!mods.includes(m.id));
  return `<div class="modrow">${[0,1].map(i=>mods[i]?`<button type="button" class="carslot on" data-wmdel="${g.id}:${i}">${esc(wmodById(mods[i]).name)} ✕</button>`:'<span class="carslot">空改裝位</span>').join('')}</div>
    ${mods.length<2&&avail.length?`<div class="modrow">${avail.map(m=>`<button type="button" class="zmini" data-wm="${g.id}:${m.id}" ${affordable(m.cost)?'':'disabled'} title="${esc(m.desc)}">${esc(m.name)}：${esc(m.desc)}（${esc(costText(m.cost))}）</button>`).join('')}</div>`:''}`;
}
function wireWeaponMods(){
  save.gear.mods=save.gear.mods||{};
  screenEl.querySelectorAll('[data-wm]').forEach(el=>el.onclick=()=>{ const [w,m]=el.dataset.wm.split(':'), d=wmodById(m); if(!affordable(d.cost)) return;
    pay(d.cost,-1); (save.gear.mods[w]=save.gear.mods[w]||[]).push(m); persist(); showWorkshop(`${DATA.equipById[w].name}裝上了${d.name}`); });
  screenEl.querySelectorAll('[data-wmdel]').forEach(el=>el.onclick=()=>{ const [w,i]=el.dataset.wmdel.split(':'); save.gear.mods[w].splice(+i,1); persist(); showWorkshop('拆下改裝零件了（不退還材料）'); });
}
/* 近戰：冰斧，或沒子彈時用槍托敲 */
function meleeAttack(){
  const melee=!!weapon.melee, dmg=melee?weapon.damage:0.5, reach=melee?weapon.reach:2.2;
  fireCd=melee?weapon.cooldown:0.7;
  const fx=-Math.sin(player.yaw), fz=-Math.cos(player.yaw); let n=0;
  for(let j=wraiths.length-1;j>=0;j--){ const w=wraiths[j], dx=w.g.position.x-player.pos.x, dz=w.g.position.z-player.pos.z, d=Math.hypot(dx,dz);
    if(d<reach&&(dx*fx+dz*fz)/Math.max(d,0.01)>0.35){ if(netAuth){ w.g.position.x+=dx/d*1.2; w.g.position.z+=dz/d*1.2; } n++; damageEnemy(w,dmg); } }
  if(boss&&!boss.dead){ const dx=boss.g.position.x-player.pos.x, dz=boss.g.position.z-player.pos.z, d=Math.hypot(dx,dz);
    if(d<reach+boss.def.size*0.8){ n++; damageBoss(dmg); } }
  $('cross').classList.add('swing'); setTimeout(()=>$('cross').classList.remove('swing'),120);
  if(!melee&&!n) toast('沒子彈了，只能用槍托敲。回熱區補彈藥');
}

/* ---------- 料理 ---------- */
const FOOD=()=>DATA.food;
let foodBuffs=[], runElapsed=0;
const foodStock=()=>(save.food=save.food||{});
const foodCount=()=>Object.values(foodStock()).reduce((a,b)=>a+b,0);
function eatFood(){
  if(state!=='play') return;
  const r=FOOD().recipes.find(r=>foodStock()[r.id]>0);
  if(!r){ toast('身上沒有料理。有廚房車廂的話，可以在工坊做料理'); return; }
  if(foodBuffs.some(b=>b.id===r.id)){ toast(`${r.name}的效果還在`); return; }
  foodStock()[r.id]--;
  const map={walkSpeedMult:'walkSpeed',sprintSpeedMult:'sprintSpeed',catchSpeedMult:'catchSpeed'}, applied=[];
  for(const [k,v] of Object.entries(r.effects)){ const key=map[k]||k; const before=STATS[key]??1; STATS[key]=before*v; applied.push([key,before]); }
  foodBuffs.push({id:r.id,name:r.name,until:runElapsed+r.seconds*(STATS.foodDurationMult||1),applied});
  toast(`吃了${r.name}：${r.desc}`);
}
function updateFood(dt){
  runElapsed+=dt;
  for(let i=foodBuffs.length-1;i>=0;i--){ const b=foodBuffs[i]; if(runElapsed<b.until) continue;
    for(const [k,v] of b.applied) STATS[k]=v; foodBuffs.splice(i,1); toast(`${b.name}的效果消失了`); }
  const el=$('buffTag'); el.hidden=!foodBuffs.length&&!foodCount();
  el.textContent=(foodBuffs.length?foodBuffs.map(b=>`${b.name} ${Math.ceil(b.until-runElapsed)}s`).join('・'):'')+(foodCount()?`${foodBuffs.length?'・':''}料理 ${foodCount()}（${isTouch?'吃':'Q'}）`:'');
}
function foodTabHtml(st){
  if(!st.kitchen) return '<p class="zp-empty">要先在「車廂編組」加掛廚房車廂，才能做料理。</p>';
  const F=FOOD(), carry=foodCount();
  return `<div class="statline">身上的料理 ${carry}/${F.maxCarry}。遠征時按 ${isTouch?'「吃」':'Q'} 吃掉最上面那一種，效果是暫時的。</div>`+
    F.recipes.map(r=>`<div class="shopcard"><div class="sc-main"><b>${esc(r.name)} <em class="num">×${foodStock()[r.id]||0}</em></b><span>${esc(r.desc)}・持續 ${Math.round(r.seconds*(st.foodDurationMult||1))} 秒</span></div>
      <button type="button" class="zmini add" data-cook="${r.id}" ${affordable(r.cost)&&carry<F.maxCarry?'':'disabled'}>做：${esc(costText(r.cost))}</button></div>`).join('');
}
function wireFoodTab(){
  screenEl.querySelectorAll('[data-cook]').forEach(el=>el.onclick=()=>{ const r=FOOD().recipes.find(x=>x.id===el.dataset.cook);
    if(!affordable(r.cost)||foodCount()>=FOOD().maxCarry) return; pay(r.cost,-1); foodStock()[r.id]=(foodStock()[r.id]||0)+1; persist(); showWorkshop(`做好了${r.name}`); });
}

/* ---------- 場景種類 ---------- */
const biomeOf=node=>DATA.biomes.find(b=>b.id===(node&&node.biome))||DATA.biomes[0];
function applyBiome(node){
  const b=biomeOf(node); SKY.set(b.sky); scene.fog.color.copy(SKY); scene.background=SKY.clone();
  if(groundMesh) groundMesh.material.color.set(b.ground);
  return b;
}
function biomeExtras(b,avoid){
  const out=[], n={village:9,mining:8,port:10,spikes:22}[b.style]||0;
  for(let i=0,t=0;i<n&&t<300;t++){
    const a=R(0,Math.PI*2), r=R(22,120), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(!farFromTrain(x,z,5)||avoid(x,z)||out.some(o=>Math.hypot(o.x-x,o.z-z)<12)) continue;
    out.push({x,z}); i++;
    const y=heightAt(x,z), col=(w,d)=>colliders.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2});
    if(b.style==='village'){
      const w=R(5,7), d=R(5,8), h=R(2.6,3.4), wall=M(rng()<0.5?0x6b4a36:0x8a7a68), roof=M(0x3a2a24);
      const body=box(w,h,d,wall); body.position.set(x,y+h/2-0.2,z); world.add(body);
      const rf=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*0.75,2,4),roof); rf.rotation.y=Math.PI/4; rf.position.set(x,y+h+0.8,z); rf.scale.set(w/Math.max(w,d),1,d/Math.max(w,d)); world.add(rf);
      const snow=new THREE.Mesh(new THREE.ConeGeometry(Math.max(w,d)*0.77,0.5,4),M(0xf2f6fa)); snow.rotation.y=Math.PI/4; snow.position.set(x,y+h+1.65,z); snow.scale.copy(rf.scale); world.add(snow);
      const win=new THREE.MeshBasicMaterial({color:rng()<0.4?0xffb064:0x2a3038}); const wn=box(0.9,0.8,0.05,win); wn.position.set(x,y+h*0.6,z+d/2+0.03); world.add(wn);
      col(w,d); addCrate(x+w/2+1,z+R(-1,1));
    } else if(b.style==='mining'){
      if(rng()<0.35){ const tower=M(0x3a3028); for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const p=box(0.3,9,0.3,tower); p.position.set(x+sx*1.6,y+4.5,z+sz*1.6); world.add(p); }
        const wh=new THREE.Mesh(new THREE.TorusGeometry(1.2,0.12,6,16),tower); wh.position.set(x,y+9.2,z); world.add(wh); col(3.6,3.6); }
      else { const pile=new THREE.Mesh(new THREE.ConeGeometry(R(2,3.5),R(1.5,3),7),M(0x2a2a2e)); pile.position.set(x,y+1,z); world.add(pile); col(4,4);
        const cart=box(1.4,0.8,2,M(0x5a4a3a)); cart.position.set(x+3.5,y+0.6,z); world.add(cart); colliders.push({x0:x+2.8,x1:x+4.2,z0:z-1,z1:z+1});
        const coal=box(1.2,0.3,1.8,M(0x15161a)); coal.position.set(x+3.5,y+1.1,z); world.add(coal); addCrate(x+R(-3,3),z+3); }
    } else if(b.style==='port'){
      const cols=[0x8a3a2a,0x2a5a7a,0x6a7a3a,0x9a7a2a];
      for(let k=0;k<RI(1,3);k++){ const c=box(2.5,2.6,6,M(cols[Math.floor(rng()*4)])); c.position.set(x,y+1.3+k*2.6,z); world.add(c); }
      col(2.6,6.1); if(rng()<0.6) addCrate(x+2.2,z+R(-2,2));
    } else if(b.style==='spikes'){
      const ice=new THREE.MeshPhongMaterial({color:0xbfe8ff,transparent:true,opacity:0.8,shininess:90,emissive:0x1d4a66});
      for(let k=0;k<RI(2,5);k++){ const h=R(2,8), sp=new THREE.Mesh(new THREE.ConeGeometry(R(0.4,1.2),h,6),ice); sp.position.set(x+R(-2,2),y+h/2-0.3,z+R(-2,2)); sp.rotation.z=R(-0.25,0.25); world.add(sp); }
      col(3,3);
    }
  }
}

/* ---------- 地下碉堡 ---------- */
let vault=null;
function placeVault(node,avoid){
  vault=null;
  if(!node.vault||rng()>node.vault) return;
  let vx=null,vz=null;
  for(let t=0;t<200;t++){ const a=R(0,Math.PI*2), r=R(50,105), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(farFromTrain(x,z,14)&&!avoid(x,z)&&!(boss&&Math.hypot(boss.lair.x-x,boss.lair.z-z)<30)){ vx=x; vz=z; break; } }
  if(vx==null) return;
  const W=14, D=22, H=3.2, y=heightAt(vx,vz), con=M(0x55595e), dark=M(0x2a2c30);
  const wall=(cx,cz,w,d)=>{ const m=box(w,H,d,con); m.position.set(cx,y+H/2-0.2,cz); world.add(m); colliders.push({x0:cx-w/2,x1:cx+w/2,z0:cz-d/2,z1:cz+d/2}); };
  // 外牆（南側留門）
  wall(vx,vz-D/2,W,0.5); wall(vx-W/2,vz,0.5,D); wall(vx+W/2,vz,0.5,D);
  wall(vx-W/4-1,vz+D/2,W/2-2,0.5); wall(vx+W/4+1,vz+D/2,W/2-2,0.5);
  // 內牆
  wall(vx-W/4-1.5,vz+2,W/2-3,0.4); wall(vx+W/4+1.5,vz-4,W/2-3,0.4);
  const roof=box(W+0.6,0.4,D+0.6,dark); roof.position.set(vx,y+H,vz); world.add(roof);
  const sign=box(3,0.8,0.1,new THREE.MeshBasicMaterial({color:0xff9a3c})); sign.position.set(vx,y+H+0.7,vz+D/2+0.1); world.add(sign);
  const lamp=new THREE.PointLight(0xff6a3a,1.2,16,1.5); lamp.position.set(vx,y+H-0.6,vz-4); world.add(lamp);
  const lamp2=new THREE.PointLight(0xff6a3a,0.8,12,1.5); lamp2.position.set(vx,y+H-0.6,vz+6); world.add(lamp2);
  for(const [dx,dz] of [[-4,-8],[4,-8],[-4,6],[4,0],[0,-2]]){ addCrate(vx+dx,vz+dz); const it=interactables[interactables.length-1]; it.amount*=2; }
  // 寶箱
  const cg=new THREE.Group(); cg.position.set(vx,y,vz-9);
  const chest=box(1.4,0.9,0.9,M(0x3a4a5a)); chest.position.y=0.45; cg.add(chest);
  const trim=box(1.46,0.12,0.96,M(0xe9c46a)); trim.position.y=0.8; cg.add(trim);
  const mk=addMarker(cg,new THREE.MeshBasicMaterial({color:0xe9c46a}),1.6); world.add(cg);
  interactables.push({type:'vault',pos:new THREE.Vector3(vx,y,vz-9),group:cg,marker:mk});
  placeNote(vx+3,vz+8,true);
  vault={x:vx,z:vz,W,D,woke:false};
}
const inVault=()=>vault&&Math.abs(player.pos.x-vault.x)<vault.W/2&&Math.abs(player.pos.z-vault.z)<vault.D/2;
function updateVault(){
  if(!vault||vault.woke||!netAuth) return;
  if(netMinDist({x:vault.x,z:vault.z})<20){
    vault.woke=true; toast('碉堡裡有東西在動……');
    const keep=player.pos.clone();
    for(const [type,dx,dz] of [['revenant',-3,-6],['revenant',3,-6],['revenant',0,4],['soldier',0,-8]]){
      const x=vault.x+dx, z=vault.z+dz; player.pos.set(x+60,0,z); const k=wraiths.length; spawnWraith(type,true);
      if(wraiths.length>k){ const w=wraiths[wraiths.length-1]; w.g.position.set(x,heightAt(x,z),z); }
    }
    player.pos.copy(keep);
  }
}
function openVaultChest(it){
  it.done=true; world.remove(it.group);
  const reward={research:15,scrap:12,coins:120}; pay(reward,1);
  // 隨機送一個這把武器還沒有的改裝零件
  const cand=DATA.weaponmods.filter(m=>m.for.includes(weapon.id)&&!((save.gear.mods||{})[weapon.id]||[]).includes(m.id));
  let extra='';
  if(cand.length&&(((save.gear.mods||{})[weapon.id]||[]).length<2)){ const m=cand[Math.floor(Math.random()*cand.length)]; save.gear.mods=save.gear.mods||{}; (save.gear.mods[weapon.id]=save.gear.mods[weapon.id]||[]).push(m.id); extra=`，還有一個${m.name}（已裝到${weapon.name}上）`; }
  toast(`打開碉堡寶箱：${costText(reward)}${extra}`);
}

/* ---------- 日誌 ---------- */
const loreRead=()=>(save.lore=save.lore||{});
const paperMat=new THREE.MeshBasicMaterial({color:0xf4ecd8});
function placeNote(x,z,rare){
  const pool=DATA.lore.filter(l=>!loreRead()[l.id]&&!!l.rare===!!rare&&!interactables.some(i=>i.type==='note'&&i.lore.id===l.id));
  const r=rng(), l=pool.length?pool[Math.floor(r*pool.length)]:null; if(!l) return;
  const y=heightAt(x,z), g=new THREE.Group(); g.position.set(x,y,z);
  const post=box(0.1,1,0.1,M(0x4a3a30)); post.position.y=0.5; g.add(post);
  const p=box(0.5,0.35,0.04,paperMat); p.position.set(0,1.05,0.06); p.rotation.x=-0.3; g.add(p);
  const mk=addMarker(g,paperMat,1.6); world.add(g);
  interactables.push({type:'note',lore:l,pos:new THREE.Vector3(x,y,z),group:g,marker:mk});
}
function placeNotes(avoid){
  const n=RI(1,2);
  for(let i=0,t=0;i<n&&t<100;t++){ const a=R(0,Math.PI*2), r=R(20,90), x=Math.cos(a)*r, z=Math.sin(a)*r; if(farFromTrain(x,z,3)&&!avoid(x,z)){ placeNote(x,z,false); i++; } }
}
function readNote(it){
  it.done=true; world.remove(it.group); loreRead()[it.lore.id]=Date.now();
  toast(`撿到日誌「${it.lore.title}」：${it.lore.text}`); toastT=7;
}
function loreHtml(){
  const L=DATA.lore, got=L.filter(l=>loreRead()[l.id]);
  return `<details class="credits lore"><summary>冰原日誌 ${got.length}/${L.length}</summary>${got.length?got.sort((a,b)=>L.indexOf(a)-L.indexOf(b)).map(l=>`<p><b>${esc(l.title)}</b>　${esc(l.text)}</p>`).join(''):'<p>在遠征的站點和碉堡裡可以撿到日誌，慢慢拼出這個世界為什麼結冰。</p>'}</details>`;
}
