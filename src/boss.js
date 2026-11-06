/* =========================================================
   遠征 Boss：霜影首領
   資料在 data/bosses.json；每個首領守在一個路線節點，身邊冰封著一隻稀有生物
   招式：charge 衝撞、nova 寒氣爆發（先蓄力再爆開）、summon 召喚霜影
   ========================================================= */
let boss=null, bossPending=null;
const bossForNode=node=>node&&DATA.bosses?DATA.bosses.find(b=>b.node===node.id):null;
const bossKills=id=>(save.bosses&&save.bosses[id]&&save.bosses[id].kills)||0;
const bossesDefeated=()=>Object.values(save.bosses||{}).filter(b=>b.kills>0).length;

function makeBossMesh(B){
  const g=new THREE.Group(), s=B.size;
  const mat=new THREE.MeshLambertMaterial({color:hex(B.color),transparent:true,opacity:0.88,emissive:0x0a1a2a});
  const eye=new THREE.MeshBasicMaterial({color:hex(B.eye)});
  const body=sph(0.6*s,mat); body.scale.y=1.35; body.position.y=1.5*s; g.add(body);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.55*s,1.5*s,12),mat); tail.rotation.x=Math.PI; tail.position.y=0.6*s; g.add(tail);
  for(const k of [-1,1]){ const e=sph(0.09*s,eye); e.position.set(k*0.22*s,1.75*s,0.5*s); g.add(e); }
  const ice=new THREE.MeshPhongMaterial({color:0xcff2ff,shininess:90,emissive:0x1d4a66});
  if(B.look==='horns') for(const k of [-1,1]){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.12*s,0.9*s,8),ice); h.position.set(k*0.4*s,2.2*s,0.1*s); h.rotation.z=-k*0.5; g.add(h); }
  if(B.look==='crown') for(let i=0;i<7;i++){ const a=i/7*Math.PI*2, h=new THREE.Mesh(new THREE.ConeGeometry(0.08*s,0.6*s,6),ice); h.position.set(Math.cos(a)*0.35*s,2.25*s,Math.sin(a)*0.35*s); g.add(h); }
  if(B.look==='shards') for(let i=0;i<5;i++){ const a=i/5*Math.PI*2, h=new THREE.Mesh(new THREE.OctahedronGeometry(0.18*s),ice); h.position.set(Math.cos(a)*0.95*s,1.6*s,Math.sin(a)*0.95*s); h.userData.orbit=a; g.add(h); }
  const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:hex(B.eye),transparent:true,opacity:0.35,depthWrite:false,blending:THREE.AdditiveBlending}));
  aura.scale.set(4.5*s,4.5*s,1); aura.position.y=1.4*s; g.add(aura);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.85,1,48),new THREE.MeshBasicMaterial({color:hex(B.eye),transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=0.15; g.add(ring);
  return {g,mat,ring};
}

/* 在站點放首領：巢穴離火車 55～80 m，旁邊放一隻被封住的稀有生物和兩個彈藥箱 */
function placeBoss(node){
  boss=null; bossPending=null;
  const B=bossForNode(node); if(!B) return;
  const avoid=(x,z)=>(lakeInfo&&Math.hypot(x-lakeInfo.x,z-lakeInfo.z)<lakeInfo.r+6)||warmZones.some(w=>Math.hypot(x-w.x,z-w.z)<w.r+4);
  let lx=0,lz=-70;
  for(let t=0;t<200;t++){ const a=R(0,Math.PI*2), r=R(55,80), x=Math.cos(a)*r, z=Math.sin(a)*r; if(farFromTrain(x,z,10)&&!avoid(x,z)){ lx=x; lz=z; break; } }
  // 巢穴：一圈冰柱
  const ice=new THREE.MeshPhongMaterial({color:0xa8e4ff,transparent:true,opacity:0.75,shininess:90,emissive:0x1d4a66});
  for(let i=0;i<9;i++){ const a=i/9*Math.PI*2+R(-0.2,0.2), r=R(9,12), x=lx+Math.cos(a)*r, z=lz+Math.sin(a)*r, h=R(2,5);
    const c=new THREE.Mesh(new THREE.ConeGeometry(R(0.5,0.9),h,6),ice); c.position.set(x,heightAt(x,z)+h/2-0.2,z); world.add(c); }
  // 被守護的生物
  const st=curStation, cats=(st.ice&&st.ice.categories)||['mammal'];
  let pool=speciesPool(node,cats).filter(s=>s.rarity===B.guard);
  if(!pool.length) pool=DATA.species.filter(s=>s.rarity===B.guard&&cats.includes(s.category)&&((s.model&&MODELS[s.model])||s.body));
  let guarded=null;
  if(pool.length){ const sp=pickWeighted(pool,s=>save.collection[s.id]||coop?1:(DATA.config.undiscoveredBonus||1)); guarded=placeIce(sp,lx+R(-2,2),lz+R(-2,2),R(0,6.28)); guarded.locked=true; }
  // 彈藥箱
  for(let k=0;k<2;k++){ const a=Math.atan2(lz,lx)+Math.PI+(k?0.5:-0.5), x=lx+Math.cos(a)*22, z=lz+Math.sin(a)*22; placeAmmoCache(x,z); }
  const m=makeBossMesh(B), y=heightAt(lx,lz); m.g.position.set(lx,y,lz); world.add(m.g);
  const wm=DATA.config.tiers[node.tier]?DATA.config.tiers[node.tier].wraithMult:1;
  boss={def:B,...m,hp:B.hp,max:B.hp,lair:new THREE.Vector3(lx,y,lz),aggro:false,hit:0,phase:0,
    cd:{charge:B.attacks.charge?B.attacks.charge.every*0.6:0,nova:B.attacks.nova?B.attacks.nova.every*0.5:0,summon:B.attacks.summon?B.attacks.summon.every*0.5:0},
    charging:0,chargeDir:new THREE.Vector3(),windup:0,guarded,announced:false,minions:[],spdMult:Math.sqrt(wm)};
}
function placeAmmoCache(x,z){
  const y=heightAt(x,z), g=new THREE.Group(); g.position.set(x,y,z);
  const c=box(0.8,0.5,0.5,0x3a5a3a); c.position.y=0.25; g.add(c);
  const band=box(0.84,0.08,0.54,0xff9a3c); band.position.y=0.4; g.add(band);
  const mk=addMarker(g,markerLoot,1.2); world.add(g);
  interactables.push({type:'ammo',pos:new THREE.Vector3(x,y,z),group:g,marker:mk});
}

/* 每幀更新（遠征中） */
function updateBoss(dt,inHeat,storm){
  if(!boss||boss.dead) { $('bossBar').hidden=true; return; }
  const b=boss, B=b.def, A=B.attacks, g=b.g, s=B.size;
  b.phase+=dt;
  const dx=player.pos.x-g.position.x, dz=player.pos.z-g.position.z, d=Math.max(0.01,Math.hypot(dx,dz));
  const fromLair=Math.hypot(player.pos.x-b.lair.x,player.pos.z-b.lair.z);
  if(!b.aggro && fromLair<B.aggro && !inHeat){ b.aggro=true; if(!b.announced){ b.announced=true; toast(`${B.name}醒過來了！${B.desc}`); } }
  if(b.aggro && (fromLair>B.leash || inHeat)){ b.aggro=false; b.windup=0; b.charging=0; }
  const spd=B.speed*b.spdMult*(storm?1.2:1);
  if(b.charging>0){
    b.charging-=dt; g.position.addScaledVector(b.chargeDir,A.charge.speed*dt);
  } else if(b.aggro && b.windup<=0){
    if(d>1.2*s){ g.position.x+=dx/d*spd*dt; g.position.z+=dz/d*spd*dt; }
  } else if(!b.aggro){
    const lx=b.lair.x-g.position.x, lz=b.lair.z-g.position.z, ld=Math.hypot(lx,lz);
    if(ld>2){ g.position.x+=lx/ld*spd*dt; g.position.z+=lz/ld*spd*dt; }
    if(b.hp<b.max && ld<3) b.hp=Math.min(b.max,b.hp+B.regenPerSec*dt);   // 回巢慢慢恢復
  }
  if(distToTrain(g.position.x,g.position.z)<CFG().heatRadius+2*s){ g.position.x-=dx/d*dt*6; g.position.z-=dz/d*dt*6; b.charging=0; }
  if(b.charging<=0) g.rotation.y=Math.atan2(dx,dz);
  g.position.y=heightAt(g.position.x,g.position.z)+Math.sin(b.phase*1.6)*0.3;
  g.children.forEach(c=>{ if(c.userData.orbit!=null){ const a=c.userData.orbit+b.phase*1.2; c.position.x=Math.cos(a)*0.95*s; c.position.z=Math.sin(a)*0.95*s; } });
  // 招式
  if(b.aggro){
    for(const k in b.cd) b.cd[k]-=dt;
    if(A.charge && b.cd.charge<=0 && b.windup<=0 && b.charging<=0 && d>6 && d<28){
      b.cd.charge=A.charge.every; b.charging=A.charge.secs; b.chargeDir.set(dx/d,0,dz/d); toast(`${B.name}衝過來了，往旁邊閃！`);
    }
    if(A.nova && b.cd.nova<=0 && b.windup<=0 && b.charging<=0 && d<A.nova.radius*1.6){ b.cd.nova=A.nova.every; b.windup=A.nova.windup; }
    if(A.summon && b.cd.summon<=0){ b.cd.summon=A.summon.every; for(let i=0;i<A.summon.count;i++) spawnMinion(g.position); }
  }
  // 寒氣爆發：地上的圈越來越大，蓄力完爆開
  if(b.windup>0){
    b.windup-=dt; const k=1-Math.max(0,b.windup)/A.nova.windup, r=A.nova.radius*k;
    b.ring.scale.set(r,r,r); b.ring.material.opacity=0.25+k*0.5;
    if(b.windup<=0){
      b.ring.material.opacity=0.9; setTimeout(()=>{ if(b.ring) b.ring.material.opacity=0; },180);
      if(d<A.nova.radius && !inHeat){ player.temp-=A.nova.drain*(CFG().wraithTouchMult||1); hurtT=0.6; player.pos.x+=dx/d*2.5; player.pos.z+=dz/d*2.5; toast('被寒氣爆發打中了！'); }
    }
  } else b.ring.material.opacity=0;
  // 碰撞
  if(d<1.1*s && !inHeat){ player.temp-=B.touchDrain*(CFG().wraithTouchMult||1)*dt; hurtT=0.3; player.pos.x+=dx/d*dt*5; player.pos.z+=dz/d*dt*5; if(b.charging>0){ player.temp-=A.charge.hitDrain; b.charging=0; player.pos.x+=dx/d*3; player.pos.z+=dz/d*3; toast('被撞飛了！'); } }
  if(b.hit>0){ b.hit-=dt; b.mat.emissive.setHex(0x553311); } else b.mat.emissive.setHex(b.windup>0?0x2a4a6a:0x0a1a2a);
  // 血條
  const bar=$('bossBar'); bar.hidden=!(b.aggro||b.hp<b.max) || fromLair>B.leash+20;
  $('bossName').textContent=B.name; $('bossFill').style.width=Math.max(0,b.hp/b.max*100)+'%';
}
function spawnMinion(at){
  if(wraiths.length>=12) return;
  const a=Math.random()*Math.PI*2, x=at.x+Math.cos(a)*4, z=at.z+Math.sin(a)*4;
  const keep=player.pos.clone(); player.pos.set(x+60,0,z);   // spawnWraith 以玩家為中心，暫時借用位置
  const n=wraiths.length; spawnWraith(); player.pos.copy(keep);
  if(wraiths.length>n){ const w=wraiths[wraiths.length-1]; w.g.position.set(x,heightAt(x,z),z); }
}
/* 彈丸命中檢查，回傳是否打中 */
function bossHitTest(f){
  if(!boss||boss.dead) return false;
  const s=boss.def.size; tmpV.copy(boss.g.position); tmpV.y+=1.4*s;
  if(f.m.position.distanceTo(tmpV)>(weapon.range||1.5)+0.7*s) return false;
  boss.hp-=f.dmg||1; boss.hit=0.2; boss.aggro=true; coopSend('boss',{d:f.dmg||1});
  if(boss.hp<=0) defeatBoss();
  return true;
}
function defeatBoss(){
  const b=boss, B=b.def; b.dead=true; world.remove(b.g); $('bossBar').hidden=true;
  const first=bossKills(B.id)===0, rw=first?B.reward.first:B.reward.repeat;
  bossPending={id:B.id,reward:rw,first};
  // 掉落物資箱
  for(let i=0;i<B.dropCrates;i++){ const a=i/B.dropCrates*Math.PI*2, x=b.g.position.x+Math.cos(a)*3, z=b.g.position.z+Math.sin(a)*3; addCrate(x,z); }
  if(b.guarded) b.guarded.locked=false;
  for(const w of wraiths) world.remove(w.g); wraiths.length=0;
  toast(`擊敗了${B.name}！${b.guarded?`${b.guarded.species.name}的冰封鬆動了，`:''}旁邊掉了 ${B.dropCrates} 箱物資`);
}
/* 結算時寫入存檔，回傳結算畫面要顯示的文字 */
function bossSettle(){
  if(!bossPending) return '';
  const p=bossPending; bossPending=null;
  save.bosses=save.bosses||{}; const r=save.bosses[p.id]=save.bosses[p.id]||{kills:0};
  r.kills++; if(!r.firstAt) r.firstAt=Date.now();
  pay(p.reward,1);
  const B=DATA.bosses.find(b=>b.id===p.id);
  return `<p class="bossline">擊敗 ${esc(B.name)}${p.first?'（第一次）':''}：獲得 ${esc(costText(p.reward))}</p>`;
}
