/* =========================================================
   世界：晝夜・天氣・季節、多座園區、分享動物園（參觀模式）、多人合作遠征
   數值在 config.world；分享在自己的網站用 Supabase 短網址，其他地方用分享代碼
   ========================================================= */
const WLD=()=>DATA.config.world;
/* ---------- 晝夜、季節、天氣 ---------- */
function worldTime(){
  const W=WLD(), c=(save.zoo&&save.zoo.clock)||0, day=Math.floor(c/W.dayMinutes), frac=(c/W.dayMinutes)%1;
  const season=W.seasons[Math.floor(day/W.seasonDays)%W.seasons.length];
  return {day,frac,hour:frac*24,season,night:frac*24<W.dawn||frac*24>=W.dusk};
}
function weatherNow(){ const z=save.zoo, W=WLD(); return W.weathers.find(w=>w.id===(z.weather&&z.weather.id))||W.weathers[0]; }
function worldStep(){
  const z=save.zoo, W=WLD(), t=worldTime();
  if(!z.weather||z.clock>=z.weather.until){
    const list=W.weathers.filter(w=>!w.seasons||w.seasons.includes(t.season.id));
    let r=Math.random()*list.reduce((s,w)=>s+w.weight,0), pick=list[0]; for(const w of list){ r-=w.weight; if(r<=0){ pick=w; break; } }
    z.weather={id:pick.id,until:z.clock+W.weatherMinutes[0]+Math.random()*(W.weatherMinutes[1]-W.weatherMinutes[0])};
  }
}
function worldTempOffset(b){ if(bdef(b.type).house) return 0; return worldTime().season.temp+weatherNow().temp+(worldTime().night?WLD().nightTemp:0); }
function worldVisitorMult(){ const t=worldTime(); return t.season.visit*weatherNow().visit*(t.night?WLD().nightVisitors:1); }
function worldChip(){ const t=worldTime(), w=weatherNow(), h=Math.floor(t.hour), m=Math.floor((t.hour%1)*60);
  return `<span class="wchip">${t.season.name}・第 ${t.day+1} 天 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${t.night?' 夜':''}・${w.name}</span>`; }
let zSnow=null, zHemi=null;
const DAY_SKY=new THREE.Color(0xb7ccdc), NIGHT_SKY=new THREE.Color(0x1a2433), STORM=new THREE.Color(0xd8e0e6);
function updateWorldVisual(dt){
  if(!save.zoo||!WLD()) return;
  if(!zHemi) zHemi=zooScene.children.find(o=>o.isHemisphereLight);
  const t=worldTime(), w=weatherNow();
  // 白天亮度：日出日落之間平滑過渡
  const W=WLD(), h=t.hour, k=h<W.dawn-1||h>W.dusk+1?0:h<W.dawn+1?(h-(W.dawn-1))/2:h>W.dusk-1?((W.dusk+1)-h)/2:1;
  const sky=NIGHT_SKY.clone().lerp(DAY_SKY,k); if(w.id==='blizzard'||w.id==='fog') sky.lerp(STORM,0.5*k+0.2);
  zooScene.background.copy(sky); zooScene.fog.color.copy(sky);
  zooScene.fog.near=w.id==='fog'?30:w.id==='blizzard'?40:110; zooScene.fog.far=w.id==='fog'?110:w.id==='blizzard'?140:230;
  if(zHemi) zHemi.intensity=0.25+0.6*k; zsun.intensity=0.08+0.67*k*(w.id==='clear'?1:0.6);
  // 下雪粒子
  if(!zSnow){ const n=1500, g=new THREE.BufferGeometry(), p=new Float32Array(n*3); for(let i=0;i<n;i++){ p[i*3]=(Math.random()-0.5)*90; p[i*3+1]=Math.random()*40; p[i*3+2]=(Math.random()-0.5)*90; }
    g.setAttribute('position',new THREE.BufferAttribute(p,3)); zSnow=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.25,transparent:true,opacity:0.85,depthWrite:false})); zooScene.add(zSnow); }
  const snowing=w.id==='snow'||w.id==='blizzard'; zSnow.visible=snowing;
  if(snowing){ const p=zSnow.geometry.attributes.position.array, sp=w.id==='blizzard'?9:3, wind=w.id==='blizzard'?6:0.6;
    for(let i=0;i<p.length;i+=3){ p[i+1]-=dt*sp; p[i]+=dt*wind; if(p[i+1]<0){ p[i+1]+=40; } if(p[i]>45) p[i]-=90; }
    zSnow.geometry.attributes.position.needsUpdate=true; }
}

/* ---------- 多座園區（生涯模式） ---------- */
function ensureParks(){ save.parks=save.parks||{active:'main',zoos:{},open:['main']}; return save.parks; }
const parkName=id=>id==='main'?'烏托邦站':(WLD().parks.find(p=>p.id===id)||{}).name||id;
function switchPark(id){
  const P=ensureParks(); if(P.active===id) return;
  P.zoos[P.active]=save.zoo; save.zoo=P.zoos[id]||null; delete P.zoos[id]; P.active=id;
  if(!save.zoo){ ensureZoo(); save.zoo.unplaced={}; save.zoo.coins=WLD().newParkCoins; }
  zooBaseBuilt&&clearPeople(); persist(); enterZoo(); toast(`來到${parkName(id)}`);
}
function showParks(msg){
  const P=ensureParks(), z=save.zoo; state='parks'; screenEl.hidden=false;
  const others=P.open.filter(id=>id!==P.active), stored=z.stored||[];
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>NETWORK · 避難所網路</small>園區</h1><span class="savechip">目前在：${esc(parkName(P.active))}</span></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <p class="zp-empty">每座園區有自己的建築、動物和金幣；倉庫物資、圖鑑、火車共用。沒在看的園區會暫停，回去時補算最多 8 小時。遠征救回的動物會送到目前所在的園區。</p>
    <div class="shoplist">${['main',...WLD().parks.map(p=>p.id)].map(id=>{ const open=P.open.includes(id), def=WLD().parks.find(p=>p.id===id), zz=id===P.active?z:P.zoos[id];
      return `<div class="shopcard${id===P.active?' on':''}"><div class="sc-main"><b>${esc(parkName(id))}</b><span>${open?`動物 ${zz?zz.animals.length:0} 隻・金幣 ${zz?Math.floor(zz.coins):0}`:esc(def.desc)}</span></div>
        ${id===P.active?'<span class="sc-max">目前所在</span>':open?`<button type="button" class="zmini add" data-park="${id}">前往</button>`
        :`<button type="button" class="zmini add" data-open="${id}" ${affordable(def.cost)&&opsStats.rating>=def.needRating?'':'disabled'}>開設：${esc(costText(def.cost))}・需要 ${def.needRating} 星</button>`}</div>`; }).join('')}</div>
    ${others.length?`<div class="sec-title"><span>調動倉庫裡的動物</span></div><div class="shoplist">${stored.length?stored.map(a=>`<div class="shopcard"><div class="sc-main"><b>${a.sex==='M'?'♂':'♀'} ${esc(nameOf(a))}</b></div>${others.map(o=>`<button type="button" class="zmini" data-move="${a.id}:${o}">送到${esc(parkName(o))}</button>`).join('')}</div>`).join('')
      :'<p class="zp-empty">倉庫是空的。在棲地面板按「移出」，再回來這裡調動。</p>'}</div>
      <div class="sec-title"><span>調度金幣</span></div><div class="zp-btns">${others.map(o=>`<button type="button" class="zmini" data-coin="${o}" ${z.coins>=1000?'':'disabled'}>送 1000 金幣到${esc(parkName(o))}</button>`).join('')}</div>`:''}
    <div class="sec-title"><span>合營園區（和朋友一起經營）</span></div><div id="czBox"><p class="zp-empty">讀取中…</p></div>
    <button class="btn ghost" id="parkBack" type="button">回到園區</button></div>`;
  coopZooHtml().then(h=>{ const b=$('czBox'); if(b&&state==='parks'){ b.innerHTML=h; wireCoopZoo(); } });
  screenEl.querySelectorAll('[data-park]').forEach(el=>el.onclick=()=>switchPark(el.dataset.park));
  screenEl.querySelectorAll('[data-open]').forEach(el=>el.onclick=()=>{ const d=WLD().parks.find(p=>p.id===el.dataset.open); if(!affordable(d.cost)) return; pay(d.cost,-1); P.open.push(d.id); switchPark(d.id); });
  screenEl.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{ const [aid,to]=el.dataset.move.split(':'), i=z.stored.findIndex(a=>a.id===aid); if(i<0||!P.zoos[to]) return;
    const a=z.stored.splice(i,1)[0], tz=P.zoos[to]; a.id='a'+(tz.nextUid++); tz.stored=tz.stored||[]; tz.stored.push(a); persist(); showParks(`${DATA.speciesById[a.species].name} 送到${parkName(to)}了`); });
  screenEl.querySelectorAll('[data-coin]').forEach(el=>el.onclick=()=>{ const to=el.dataset.coin; if(z.coins<1000||!P.zoos[to]) return; z.coins-=1000; P.zoos[to].coins+=1000; persist(); showParks(`送了 1000 金幣到${parkName(to)}`); });
  $('parkBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}

/* ---------- 分享動物園 ---------- */
function shareSnapshot(){
  const z=save.zoo;
  return {v:1,name:(save.parks?parkName(save.parks.active):'烏托邦站'),rating:opsStats.rating,
    zoo:{buildings:z.buildings.map(b=>({uid:b.uid,type:b.type,x:b.x,z:b.z,rot:b.rot||0,fence:b.fence})),props:z.props||[],terrain:z.terrain,ticket:z.ticket,
      animals:z.animals.map(a=>({species:a.species,sex:a.sex,stars:a.stars,habitat:a.habitat,genes:a.genes}))}};
}
const b64u={enc:u8=>{ let s=''; for(let i=0;i<u8.length;i+=0x8000) s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000)); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); },
  dec:t=>{ const s=atob(t.replace(/-/g,'+').replace(/_/g,'/')); const u=new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; }};
async function encodeShare(obj){
  const raw=new TextEncoder().encode(JSON.stringify(obj));
  if(window.CompressionStream){ const buf=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer(); return 'z1.'+b64u.enc(new Uint8Array(buf)); }
  return 'j1.'+b64u.enc(raw);
}
async function decodeShare(code){
  code=code.trim(); const kind=code.slice(0,3), u=b64u.dec(code.slice(3));
  if(kind==='z1.'){ const buf=await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer(); return JSON.parse(new TextDecoder().decode(buf)); }
  return JSON.parse(new TextDecoder().decode(u));
}
async function showShare(){
  state='share'; screenEl.hidden=false; screenEl.innerHTML='<div class="loading">產生分享內容…</div>';
  const snap=shareSnapshot(), code=await encodeShare(snap);
  const base=location.origin&&location.origin!=='null'?location.origin+location.pathname:'';
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>SHARE · 分享動物園</small>分享</h1></div>
    <p class="zp-empty">朋友打開連結或貼上代碼，就能參觀你的動物園（只能看，不會影響你的存檔）。</p>
    ${sb?`<div class="sec-title"><span>短網址</span></div><div class="zp-btns"><button type="button" class="zmini add" id="shShort" ${sbUser?'':'disabled'}>${sbUser?'產生短網址':'登入後才能產生短網址'}</button></div><div class="dexinfo" id="shShortOut" hidden></div>`:''}
    ${base?`<div class="sec-title"><span>完整連結</span></div><textarea class="sharebox" readonly id="shLink">${esc(base+'#zoo='+code)}</textarea><button type="button" class="zmini" id="shCopyL">複製連結</button>`:''}
    <div class="sec-title"><span>分享代碼</span><b>${Math.round(code.length/1024)} KB</b></div><textarea class="sharebox" readonly id="shCode">${esc(code)}</textarea><button type="button" class="zmini" id="shCopy">複製代碼</button>
    <div class="sec-title"><span>參觀別人的動物園</span></div><textarea class="sharebox" id="shIn" placeholder="把朋友給的代碼或連結貼在這裡"></textarea><button type="button" class="zmini add" id="shVisit">去參觀</button>
    <button class="btn ghost" id="shBack" type="button">回到園區</button></div>`;
  const copy=(id,btn)=>{ const t=$(id); t.select(); try{ navigator.clipboard.writeText(t.value).then(()=>{ $(btn).textContent='已複製'; },()=>{ document.execCommand('copy'); $(btn).textContent='已複製'; }); }catch(e){ try{ document.execCommand('copy'); $(btn).textContent='已複製'; }catch(_){} } };
  if($('shCopyL')) $('shCopyL').onclick=()=>copy('shLink','shCopyL');
  $('shCopy').onclick=()=>copy('shCode','shCopy');
  $('shVisit').onclick=async()=>{ let v=$('shIn').value.trim(); const m=v.match(/#zoo=([^&\s]+)/)||v.match(/[?&]visit=([0-9a-f-]{36})/i);
    try{ if(m&&m[0].includes('visit=')){ await visitById(m[1]); return; } enterVisit(await decodeShare(m?m[1]:v)); }catch(e){ toast('代碼看不懂，確認有完整貼上'); } };
  const ss=$('shShort'); if(ss) ss.onclick=async()=>{ ss.disabled=true; ss.textContent='上傳中…';
    const {data,error}=await sb.from('shared_zoos').insert({name:snap.name,data:snap}).select('id').single();
    const out=$('shShortOut'); out.hidden=false; out.textContent=error?`上傳失敗：${error.message}`:`${base}?visit=${data.id}`; ss.textContent='產生短網址'; ss.disabled=false; };
  $('shBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}
async function visitById(id){ const {data,error}=await sb.from('shared_zoos').select('data').eq('id',id).single(); if(error||!data) throw error||new Error('not found'); enterVisit(data.data); }
let visitName='';
function enterVisit(snap){
  if(!snap||!snap.zoo) throw new Error('bad');
  if(activeSlot!=='visit'){ if(activeSlot!=='career'&&careerSave){ careerSave.slots=careerSave.slots||{}; careerSave.slots[activeSlot]=save; } }
  activeSlot='visit'; visitName=snap.name||'朋友';
  const s=emptySave(); s.mode='visit'; save=s;
  const z=snap.zoo; save.zoo={buildings:z.buildings,props:z.props||[],terrain:z.terrain,ticket:z.ticket,animals:[],unplaced:{},coins:0,fuelDebt:0,lastTick:Date.now(),nextUid:100000,clock:600};
  ensureOps(); save.zoo.staff={keeper:9,vet:3,mechanic:3,janitor:4,security:3,educator:2}; save.zoo.noAging=true;
  for(const a of z.animals){ const ind=newIndividual(a.species,a.habitat,{sex:a.sex,stars:a.stars,genes:a.genes,happy:80,food:90}); save.zoo.animals.push(ind); }
  zooBaseBuilt&&clearPeople(); enterZoo(); toast(`正在參觀「${visitName}」，按「模式」回到自己的動物園`);
}

/* ---------- 多人合作遠征（只在自己的網站，用 Supabase Realtime） ---------- */
let coop=null;   // {code, ch, host, id, name, peers:Map}
const coopId=Math.random().toString(36).slice(2,10);
function coopName(){ return (sbUser&&sbUser.email&&sbUser.email.split('@')[0])||('列車長'+coopId.slice(0,3)); }
function coopJoin(code,host){
  if(!sb) return; if(coop&&coop.zoo) return; coopLeave();
  const ch=sb.channel('coop-'+code,{config:{broadcast:{self:false},presence:{key:coopId}}});
  coop={code,ch,host,peers:new Map()};
  ch.on('broadcast',{event:'start'},({payload})=>{ if(coop.host) return; const n=payload.node; toast(`隊長出發去${n.name}了，跟上！`); if(state==='zoo'||state==='dex'||state==='map') { zooActive=false; $('zooUI').hidden=true; $('zPanel').hidden=true; screenEl.hidden=true; startExpedition(n,payload.seed); } });
  ch.on('broadcast',{event:'pos'},({payload})=>coopPeer(payload));
  ch.on('broadcast',{event:'take'},({payload})=>{ if(state!=='play') return; const it=interactables.find(i=>!i.done&&i.type===payload.t&&Math.hypot(i.pos.x-payload.x,i.pos.z-payload.z)<0.6); if(it){ it.done=true; world.remove(it.group); } });
  ch.on('broadcast',{event:'boss'},({payload})=>{ if(boss&&!boss.dead&&state==='play'){ boss.hp-=payload.d; boss.hit=0.2; if(boss.hp<=0) defeatBoss(); } });
  ch.on('presence',{event:'sync'},()=>{ const st=ch.presenceState(); coop.members=Object.values(st).map(v=>v[0]); if(state==='dex') renderCoopBox(); });
  ch.subscribe(async s=>{ if(s==='SUBSCRIBED'){ await ch.track({id:coopId,name:coopName(),host:!!host}); toast(host?`房間 ${code} 建好了，把房號告訴朋友`:`加入了房間 ${code}`); } });
}
function coopLeave(){ if(coop&&coop.zoo) return; if(coop){ try{ sb.removeChannel(coop.ch); }catch(e){} for(const p of coop.peers.values()) p.g.parent&&p.g.parent.remove(p.g); } coop=null; }
function coopSend(event,payload){ if(coop) coop.ch.send({type:'broadcast',event,payload}); }
let coopPosT=0;
function coopTick(dt){
  if(!coop||state!=='play') return; coopPosT-=dt; updateMatesHud();
  if(coopPosT<=0){ coopPosT=0.1; coopSend('pos',{id:coopId,name:coopName(),x:player.pos.x,z:player.pos.z,yaw:player.yaw,node:curNode&&curNode.id}); }
  for(const p of coop.peers.values()){ if(!p.g.parent&&world&&p.node===(curNode&&curNode.id)) world.add(p.g); p.g.position.lerp(p.to,Math.min(1,dt*10)); p.g.position.y=heightAt(p.g.position.x,p.g.position.z); p.g.visible=p.node===(curNode&&curNode.id); }
  animateMates(dt);
}
const MATE_COLORS=[0x2a5ad8,0xc8402a,0x3a8a4a,0xe0a02a,0x8a3a9a];
function makeMate(name,i){
  const g=new THREE.Group(), c=MATE_COLORS[i%MATE_COLORS.length], coat=M(c), dark=M(0x2a2c34);
  const torso=box(0.6,0.75,0.35,coat); torso.position.y=1.15; g.add(torso);
  const hood=sph(0.24,coat); hood.position.y=1.72; g.add(hood); const face=sph(0.17,0xe8c0a0); face.position.set(0,1.7,-0.12); g.add(face);
  const pack=box(0.45,0.5,0.22,0x5a4030); pack.position.set(0,1.2,0.28); g.add(pack);
  const legs=[], arms=[];
  for(const s of [-1,1]){ const lp=new THREE.Group(); lp.position.set(s*0.16,0.78,0); const l=box(0.2,0.78,0.22,dark); l.position.y=-0.39; lp.add(l); g.add(lp); legs.push(lp);
    const ap=new THREE.Group(); ap.position.set(s*0.4,1.45,0); const a=box(0.16,0.65,0.18,coat); a.position.y=-0.32; ap.add(a); g.add(ap); arms.push(ap); }
  const lamp=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xffb064,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); lamp.scale.set(1.2,1.2,1); lamp.position.set(0.42,0.8,-0.15); g.add(lamp);
  try{ const label=bubbleSprite(name,true); label.position.y=2.35; label.scale.set(2.4,0.45,1); g.add(label); }catch(e){}
  return {g,legs,arms,phase:0};
}
function coopPeer(m){
  let p=coop.peers.get(m.id);
  if(!p){ p={...makeMate(m.name,coop.peers.size),to:new THREE.Vector3(m.x,0,m.z),name:m.name}; p.g.position.copy(p.to); coop.peers.set(m.id,p); }
  const moved=Math.hypot(m.x-p.to.x,m.z-p.to.z);
  p.node=m.node; p.to.set(m.x,0,m.z); p.g.rotation.y=m.yaw; p.speed=moved/0.1; p.seen=performance.now();
}
function animateMates(dt){
  for(const p of coop.peers.values()){ if(!p.legs) continue; const sp=Math.min(1,(p.speed||0)/5); p.phase+=dt*(4+sp*8);
    const sw=Math.sin(p.phase)*0.7*sp; p.legs[0].rotation.x=sw; p.legs[1].rotation.x=-sw; p.arms[0].rotation.x=-sw*0.8; p.arms[1].rotation.x=sw*0.8;
    if(performance.now()-(p.seen||0)>3000) p.g.visible=false; }
}
function updateMatesHud(){
  const el=$('mates'); if(!el) return;
  const list=[...coop.peers.values()].filter(p=>p.node===(curNode&&curNode.id)&&performance.now()-(p.seen||0)<3000);
  el.hidden=!list.length;
  el.innerHTML=list.map(p=>`<span>${esc(p.name)} ${Math.round(Math.hypot(p.g.position.x-player.pos.x,p.g.position.z-player.pos.z))} m</span>`).join('');
}
function renderCoopBox(){
  const el=$('coopBox'); if(!el) return;
  if(!sb){ el.innerHTML='<span class="auth-note">多人合作需要在遊戲網站上玩（Claude 裡的版本不能連線）。</span>'; return; }
  if(coop&&coop.zoo){ el.innerHTML='<span class="auth-note">你在多人記錄檔裡：有人出發遠征時，其他人會看到「一起去」的按鈕。</span>'; return; }
  el.innerHTML=coop?`<span class="auth-note">房間 <b class="num">${esc(coop.code)}</b>・${coop.host?'你是隊長，你出發時隊友會一起去同一站':'等隊長出發'}・成員：${(coop.members||[]).map(m=>esc(m.name)).join('、')||'連線中…'}</span><button type="button" class="zmini" id="coopLeave">離開房間</button>
      <span class="auth-note">同一站的地圖、物資和冰封生物都一樣；被隊友撿走的東西會消失；Boss 血量共用。各自救回的動物進各自的園區。</span>`
    :`<button type="button" class="zmini add" id="coopNew">建立房間</button><input id="coopCode" maxlength="4" placeholder="房號" class="coopin"><button type="button" class="zmini" id="coopGo">加入</button>`;
  const n=$('coopNew'); if(n) n.onclick=()=>{ coopJoin(Math.random().toString(36).slice(2,6).toUpperCase(),true); renderCoopBox(); };
  const g=$('coopGo'); if(g) g.onclick=()=>{ const c=$('coopCode').value.trim().toUpperCase(); if(c.length===4){ coopJoin(c,false); renderCoopBox(); } };
  const l=$('coopLeave'); if(l) l.onclick=()=>{ coopLeave(); renderCoopBox(); };
}
