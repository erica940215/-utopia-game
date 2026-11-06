/* =========================================================
   多人遠征的敵人同步：同一站裡最早到的玩家負責敵人（產生、移動、扣血），
   每秒廣播 10 次敵人、Boss、火車耐久給其他玩家；其他玩家的攻擊送給他結算。
   敵人會追最近的玩家，所以大家打的是同一群怪。
   ========================================================= */
let netAuth=true, netSince=0, netNid=1, netEstT=0, netEst=null;
function netPeersHere(){
  if(!coop) return [];
  const now=performance.now(), node=curNode&&curNode.id, out=[];
  for(const [id,p] of coop.peers) if(p.node===node&&now-(p.seen||0)<3000) out.push({id,p});
  return out;
}
function netComputeAuth(){
  if(!coop) return (netAuth=true);
  for(const {id,p} of netPeersHere()){ const s=p.since||0; if(s<netSince||(s===netSince&&id<coopId)) return (netAuth=false); }
  return (netAuth=true);
}
/* 敵人要追的對象：最近、而且不在熱區裡的玩家 */
function netTargets(){
  const H=CFG().heatRadius, t=[{x:player.pos.x,z:player.pos.z,me:true}];
  for(const {p} of netPeersHere()) t.push({x:p.to.x,z:p.to.z});
  for(const o of t) o.inHeat=distToTrain(o.x,o.z)<H;
  return t;
}
function netTarget(pos){
  let best=null, bd=1e9, bestAny=null, ba=1e9;
  for(const o of netTargets()){ const d=Math.hypot(o.x-pos.x,o.z-pos.z); if(d<ba){ ba=d; bestAny=o; } if(!o.inHeat&&d<bd){ bd=d; best=o; } }
  return best||bestAny;
}
function netMinDist(pos){ let m=1e9; for(const o of netTargets()) m=Math.min(m,Math.hypot(o.x-pos.x,o.z-pos.z)); return m; }

/* ---------- 傷害：負責的人直接扣血，其他人送給他 ---------- */
function damageEnemy(w,d){
  w.hit=0.25;
  if(!netAuth){ coopSend('ehit',{n:w.nid,d}); return false; }
  w.hp-=d;
  if(w.hp<=0){ const i=wraiths.indexOf(w); if(i>=0) wraiths.splice(i,1); world.remove(w.g); toast(`${w.def?w.def.name:'霜影'}被打倒了`); return true; }
  return false;
}
function damageBoss(d){
  if(!boss||boss.dead) return; boss.hit=0.2;
  if(!netAuth){ coopSend('boss',{d}); return; }
  boss.hp-=d; boss.aggro=true; if(boss.hp<=0) defeatBoss();
}

/* ---------- 頻道事件 ---------- */
function netHandlers(ch){
  ch.on('broadcast',{event:'est'},({payload})=>{ if(state==='play'&&payload.node===(curNode&&curNode.id)) netEst=payload; });
  ch.on('broadcast',{event:'ehit'},({payload})=>{ if(!netAuth||state!=='play') return; const w=wraiths.find(x=>x.nid===payload.n); if(w) damageEnemy(w,payload.d); });
  ch.on('broadcast',{event:'shot'},({payload})=>{ if(state!=='play'||payload.node!==(curNode&&curNode.id)) return;
    const m=new THREE.Mesh(new THREE.ConeGeometry(0.08,0.5,5),shardMat); m.position.set(...payload.p); const v=new THREE.Vector3(...payload.v);
    m.lookAt(m.position.clone().add(v)); m.rotateX(Math.PI/2); world.add(m); eShots.push({m,v,life:2,drain:payload.dr}); });
  ch.on('broadcast',{event:'nova'},({payload})=>{ if(state!=='play'||payload.node!==(curNode&&curNode.id)) return;
    const d=Math.hypot(player.pos.x-payload.x,player.pos.z-payload.z);
    if(d<payload.r&&distToTrain(player.pos.x,player.pos.z)>=CFG().heatRadius){ player.temp-=payload.dr*(CFG().wraithTouchMult||1); hurtT=0.6; toast('被寒氣爆發打中了！'); } });
  ch.on('broadcast',{event:'leave'},({payload})=>{ if(!coop) return; const p=coop.peers.get(payload.id); if(p){ p.g.parent&&p.g.parent.remove(p.g); coop.peers.delete(payload.id); } });
}

/* ---------- 每幀：負責的人廣播；其他人照著畫 ---------- */
function netTick(dt){
  if(!coop||state!=='play') return;
  if(netAuth){
    netEstT-=dt; if(netEstT>0||!netPeersHere().length) return; netEstT=0.1;
    const types=DATA.enemies.map(e=>e.id);
    const e=wraiths.map(w=>{ if(!w.nid) w.nid=coopId+':'+(netNid++); return [w.nid,types.indexOf(w.def?w.def.id:'wraith'),+w.g.position.x.toFixed(2),+w.g.position.z.toFixed(2),+w.g.rotation.y.toFixed(2),+w.hp.toFixed(2),w.raid?1:0]; });
    const b=boss?[+boss.g.position.x.toFixed(2),+boss.g.position.z.toFixed(2),+boss.g.rotation.y.toFixed(2),+boss.hp.toFixed(2),boss.windup>0?+(1-boss.windup/boss.def.attacks.nova.windup).toFixed(2):0,boss.dead?1:0,boss.aggro?1:0]:null;
    coopSend('est',{node:curNode.id,e,b,th:Math.round(trainHp),thm:trainHpMax});
    return;
  }
  // 照負責玩家的資料更新敵人
  const E=netEst; if(!E) return; netEst=null;
  const seen=new Set();
  for(const [nid,ti,x,z,ry,hp,raid] of E.e){
    seen.add(nid); let w=wraiths.find(o=>o.nid===nid);
    if(!w){ const def=DATA.enemies[ti]||DATA.enemies[0], m=makeEnemyMesh(def); m.g.position.set(x,heightAt(x,z),z); world.add(m.g);
      w={g:m.g,mat:m.mat,def,hp,spd:1,hit:0,phase:Math.random()*6,nid,raid:!!raid}; if(raid) w.mat.color.setHex(0x2a1418); wraiths.push(w); }
    w.to={x,z}; w.ry=ry; w.hp=hp;
  }
  for(let i=wraiths.length-1;i>=0;i--) if(!seen.has(wraiths[i].nid)){ world.remove(wraiths[i].g); wraiths.splice(i,1); }
  if(E.b&&boss){ const [x,z,ry,hp,wf,dead,ag]=E.b; boss.to={x,z}; boss.ry=ry; boss.hp=hp; boss.wf=wf; boss.aggro=!!ag; if(dead&&!boss.dead) defeatBoss(); }
  trainHpMax=E.thm; trainHp=E.th;
}
/* 其他玩家這邊的敵人：只移動到同步位置，碰到自己才扣自己的體溫 */
function netFollowEnemy(w,dt,inHeat){
  const g=w.g, W=DATA.config.wraith; w.phase+=dt;
  if(w.to){ g.position.x+=(w.to.x-g.position.x)*Math.min(1,dt*10); g.position.z+=(w.to.z-g.position.z)*Math.min(1,dt*10); g.rotation.y=w.ry||0; }
  g.position.y=heightAt(g.position.x,g.position.z)+(w.def&&w.def.look!=='wraith'?0:Math.sin(w.phase*2)*0.25);
  if(w.hit>0){ w.hit-=dt; w.mat.emissive.setHex(0x553311); } else w.mat.emissive.setHex(w.raid?0x2a0a0a:0x0a1a2a);
  const dx=player.pos.x-g.position.x, dz=player.pos.z-g.position.z, d=Math.max(0.01,Math.hypot(dx,dz));
  if(d<1.5&&!inHeat){ player.temp-=W.touchDrainPerSec*(w.raid?0.5:1)*(w.def?w.def.touchMult:1)*(CFG().wraithTouchMult||1)*dt; hurtT=0.3; player.pos.x+=dx/d*dt*3; player.pos.z+=dz/d*dt*3; }
}
function netFollowBoss(dt,inHeat){
  if(!boss||boss.dead){ $('bossBar').hidden=true; return; }
  const b=boss, B=b.def, g=b.g, s=B.size; b.phase+=dt;
  if(b.to){ g.position.x+=(b.to.x-g.position.x)*Math.min(1,dt*8); g.position.z+=(b.to.z-g.position.z)*Math.min(1,dt*8); g.rotation.y=b.ry||0; }
  g.position.y=heightAt(g.position.x,g.position.z)+Math.sin(b.phase*1.6)*0.3;
  if(B.attacks.nova&&b.wf>0){ const r=B.attacks.nova.radius*b.wf; b.ring.scale.set(r,r,r); b.ring.material.opacity=0.25+b.wf*0.5; } else b.ring.material.opacity=0;
  const dx=player.pos.x-g.position.x, dz=player.pos.z-g.position.z, d=Math.max(0.01,Math.hypot(dx,dz));
  if(d<1.1*s&&!inHeat){ player.temp-=B.touchDrain*(CFG().wraithTouchMult||1)*dt; hurtT=0.3; player.pos.x+=dx/d*dt*5; player.pos.z+=dz/d*dt*5; }
  if(b.hit>0){ b.hit-=dt; b.mat.emissive.setHex(0x553311); } else b.mat.emissive.setHex(b.wf>0?0x2a4a6a:0x0a1a2a);
  const bar=$('bossBar'); bar.hidden=!(b.aggro||b.hp<b.max); $('bossName').textContent=B.name; $('bossFill').style.width=Math.max(0,b.hp/b.max*100)+'%';
}
