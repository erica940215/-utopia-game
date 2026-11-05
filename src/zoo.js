/* =========================================================
   動物園（第二階段）：俯視建造、需求模擬、門票、離線收益
   建築與數值都來自 data/buildings.json 與 config.zoo
   ========================================================= */
const zooScene=new THREE.Scene();
zooScene.background=new THREE.Color(0xb7ccdc);
zooScene.fog=new THREE.Fog(0xb7ccdc,110,230);
zooScene.add(new THREE.HemisphereLight(0xeaf4ff,0x8a9aa6,0.85));
const zsun=new THREE.DirectionalLight(0xfff1dc,0.75); zsun.position.set(30,60,20); zooScene.add(zsun);
const zooCam=new THREE.PerspectiveCamera(50,1,0.5,500);
function zooResize(){ zooCam.aspect=innerWidth/innerHeight; zooCam.updateProjectionMatrix(); }
addEventListener('resize',zooResize); zooResize();

let zooActive=false, zooBaseBuilt=false, zooRoot=null, zTool='select', zSelUid=null, zooAcc=0, zSaveT=0, zHudT=0;
const zooCamT={x:0,z:4,d:48};
const zooBMeshes=new Map();   // uid → THREE.Group
let zooAnimals=[];            // 動畫中的動物 {mesh,a,tx,tz,hop,wait}
const zooStats={visitors:0,coinsPerMin:0,heatOn:true};
const ZC=()=>DATA.config.zoo, GN=()=>ZC().gridSize, TS=()=>ZC().tile;
const bdef=t=>DATA.buildingById[t];
const SOCIAL_GROUP=['群居','小群','群聚','魚群'];

function ensureZoo(){
  if(save.zoo) return;
  const g=GN();
  save.zoo={ buildings:[{uid:1,type:'gate',x:Math.floor(g/2)-1,z:g-1,rot:0}], animals:[], unplaced:{...save.collection},
             coins:ZC().startCoins, fuelDebt:0, lastTick:Date.now(), nextUid:2 };
}
const tileCenter=(b)=>{ const d=bdef(b.type); return { x:(b.x+d.size[0]/2-GN()/2)*TS(), z:(b.z+d.size[1]/2-GN()/2)*TS() }; };
const tileDist=(a,b)=>{ const d1=bdef(a.type), d2=bdef(b.type); return Math.hypot((a.x+d1.size[0]/2)-(b.x+d2.size[0]/2),(a.z+d1.size[1]/2)-(b.z+d2.size[1]/2)); };
const findB=uid=>save.zoo.buildings.find(b=>b.uid===uid);
function occupancy(){ const m=new Map(); for(const b of save.zoo.buildings){ const d=bdef(b.type); for(let i=0;i<d.size[0];i++) for(let j=0;j<d.size[1];j++) m.set((b.x+i)+','+(b.z+j),b.uid); } return m; }
function canPlace(d,x,z){ if(x<0||z<0||x+d.size[0]>GN()||z+d.size[1]>GN()) return false; const o=occupancy(); for(let i=0;i<d.size[0];i++) for(let j=0;j<d.size[1];j++) if(o.has((x+i)+','+(z+j))) return false; return true; }
const resOf=k=>k==='coins'?save.zoo.coins:(save.resources[k]||0);
const resName=k=>k==='coins'?'金幣':(DATA.itemsById[k]?DATA.itemsById[k].name:k);
const affordable=c=>Object.entries(c).every(([k,v])=>resOf(k)>=v);
function pay(c,sign){ for(const [k,v] of Object.entries(c)){ if(k==='coins') save.zoo.coins+=sign*v; else save.resources[k]=(save.resources[k]||0)+sign*v; } }
const costText=c=>Object.entries(c).map(([k,v])=>`${resName(k)} ${v}`).join('・')||'免費';

/* ---------- 場景 ---------- */
function buildZooBase(){
  zooBaseBuilt=true;
  const side=GN()*TS();
  const snowG=new THREE.Mesh(new THREE.PlaneGeometry(400,400),M(0xe6eff5)); snowG.rotation.x=-Math.PI/2; snowG.position.y=-0.05; zooScene.add(snowG);
  const plot=new THREE.Mesh(new THREE.PlaneGeometry(side,side),M(0xcfdce4)); plot.rotation.x=-Math.PI/2; plot.position.y=-0.02; zooScene.add(plot);
  const grid=new THREE.GridHelper(side,GN(),0x90a4b2,0xa9bac6); grid.position.y=0.005; grid.material.transparent=true; grid.material.opacity=0.45; zooScene.add(grid);
  // 圍牆（入口處留缺口）
  const wall=M(0x6b7178), cap=M(0xf2f6fa), h=2.2, half=side/2;
  const gx0=(Math.floor(GN()/2)-1-GN()/2)*TS(), gx1=gx0+2*TS();
  const segs=[[-half,-half,half,-half],[-half,-half,-half,half],[half,-half,half,half],[-half,half,gx0,half],[gx1,half,half,half]];
  for(const [x0,z0,x1,z1] of segs){
    const w=Math.max(0.6,Math.abs(x1-x0)), d=Math.max(0.6,Math.abs(z1-z0));
    const m=box(w,h,d,wall); m.position.set((x0+x1)/2,h/2,(z0+z1)/2); zooScene.add(m);
    const c=box(w+0.1,0.18,d+0.1,cap); c.position.set(m.position.x,h+0.05,m.position.z); zooScene.add(c);
  }
  // 停靠在北側的火車
  if(trainGroup){ const t=trainGroup.clone(); t.rotation.y=Math.PI/2; t.position.set(-14,0,-half-7); zooScene.add(t);
    for(const x of [-0.75,0.75]){ const r=box(120,0.12,0.12,0x50565e); r.position.set(0,0.12,-half-7+x); zooScene.add(r); }
    const plat=box(46,0.5,4,0x8a8f95); plat.position.set(0,0.25,-half-3.5); zooScene.add(plat); }
  // 外圍的樹
  const trunk=M(0x2b2420), pine=M(0x2f4a3e), snowCap=M(0xf2f6fa);
  for(let i=0;i<60;i++){
    const a=Math.random()*Math.PI*2, r=half+10+Math.random()*60, x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(z<-half-2&&z>-half-12) continue;
    const g=new THREE.Group(), hh=3+Math.random()*3;
    const tr=cyl(0.15,0.25,hh,trunk,6); tr.position.y=hh/2; g.add(tr);
    const c=new THREE.Mesh(new THREE.ConeGeometry(1.2+Math.random()*0.6,hh*0.8,7),pine); c.position.y=hh*0.75; g.add(c);
    const s=new THREE.Mesh(new THREE.ConeGeometry(0.7,0.8,7),snowCap); s.position.y=hh*1.1; g.add(s);
    g.position.set(x,0,z); zooScene.add(g);
  }
  zooRoot=new THREE.Group(); zooScene.add(zooRoot);
  // 預覽框與選取框
  zGhost=new THREE.Mesh(new THREE.BoxGeometry(1,0.3,1),new THREE.MeshBasicMaterial({color:0x7cc8e8,transparent:true,opacity:0.45,depthWrite:false}));
  zGhost.visible=false; zooScene.add(zGhost);
  zSelBox=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xff9a3c,wireframe:true}));
  zSelBox.visible=false; zooScene.add(zSelBox);
}
let zGhost=null, zSelBox=null;

function makeBuildingMesh(b){
  const d=bdef(b.type), c=tileCenter(b), W=d.size[0]*TS(), D=d.size[1]*TS(), g=new THREE.Group();
  g.position.set(c.x,0,c.z); g.userData.uid=b.uid;
  if(d.kind==='path'){ const p=box(W,0.08,D,hex(d.color)); p.position.y=0.04; g.add(p); }
  else if(d.kind==='habitat'){
    const gr=box(W-0.2,0.1,D-0.2,hex(d.ground)); gr.position.y=0.05; g.add(gr);
    if(d.water){ const w=box(W-1.2,0.05,D-1.2,new THREE.MeshPhongMaterial({color:0x2a6f99,shininess:90,transparent:true,opacity:0.9})); w.position.y=0.11; g.add(w); }
    const fm=M(hex(d.fence)), fh=d.house?2.6:1.0;
    if(d.house){
      const glass=box(W-0.4,fh,D-0.4,new THREE.MeshPhongMaterial({color:0xcfe9f0,transparent:true,opacity:0.32,shininess:100,depthWrite:false})); glass.position.y=fh/2+0.1; g.add(glass);
      for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const p=box(0.15,fh,0.15,fm); p.position.set(sx*(W/2-0.2),fh/2+0.1,sz*(D/2-0.2)); g.add(p); }
    } else {
      for(const [w,dd,x,z] of [[W,0.12,0,-D/2+0.06],[W,0.12,0,D/2-0.06],[0.12,D,-W/2+0.06,0],[0.12,D,W/2-0.06,0]]){ const f=box(w,fh,dd,fm); f.position.set(x,fh/2,z); g.add(f); }
    }
  }
  else if(d.kind==='feeder'){ const f=box(1.1,0.9,1.1,hex(d.color)); f.position.y=0.45; g.add(f); const t=box(1.4,0.2,1.4,0x5a4434); t.position.y=0.95; g.add(t); }
  else if(d.kind==='heater'){
    const h=cyl(0.45,0.55,1.2,hex(d.color),10); h.position.y=0.6; g.add(h);
    const pipe=cyl(0.12,0.12,0.9,0x15181d,6); pipe.position.y=1.6; g.add(pipe);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xff9a3c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); glow.scale.set(3.4,3.4,1); glow.position.y=0.8; g.add(glow); g.userData.glow=glow;
  }
  else if(d.kind==='gate'){
    const pm=M(hex(d.color));
    for(const s of [-1,1]){ const p=box(0.6,3.4,0.6,pm); p.position.set(s*(W/2-0.3),1.7,0); g.add(p); }
    const beam=box(W,0.5,0.7,pm); beam.position.y=3.4; g.add(beam);
    const sign=box(W*0.7,0.6,0.1,0xff9a3c); sign.position.set(0,2.8,0.4); g.add(sign);
  }
  return g;
}
function rebuildZoo(){
  for(const g of zooBMeshes.values()) zooRoot.remove(g);
  zooBMeshes.clear();
  for(const b of save.zoo.buildings){ const g=makeBuildingMesh(b); zooRoot.add(g); zooBMeshes.set(b.uid,g); }
  rebuildZooAnimals(); updateSelBox();
}
function rebuildZooAnimals(){
  for(const a of zooAnimals) zooRoot.remove(a.mesh);
  zooAnimals=[];
  for(const a of save.zoo.animals){
    const hb=findB(a.habitat); if(!hb) continue;
    const sp=DATA.speciesById[a.species]; if(!sp) continue;
    const m=makeModel(sp.model); const c=tileCenter(hb), d=bdef(hb.type);
    const hw=d.size[0]*TS()/2-0.8, hd=d.size[1]*TS()/2-0.8;
    m.position.set(c.x+(Math.random()*2-1)*hw,0.1,c.z+(Math.random()*2-1)*hd); m.scale.setScalar(1.3);
    zooRoot.add(m);
    zooAnimals.push({mesh:m,a,c,hw,hd,tx:m.position.x,tz:m.position.z,hop:Math.random()*6,wait:Math.random()*3});
  }
}
function updateSelBox(){
  const b=zSelUid&&findB(zSelUid);
  if(!b){ zSelBox.visible=false; return; }
  const d=bdef(b.type), c=tileCenter(b);
  zSelBox.visible=true; zSelBox.scale.set(d.size[0]*TS()+0.2,1.4,d.size[1]*TS()+0.2); zSelBox.position.set(c.x,0.7,c.z);
}

/* ---------- 模擬：需求、溫度、門票 ---------- */
function heatersOn(){ return zooStats.heatOn; }
function habitatTemp(b){
  const d=bdef(b.type); let t=d.baseTemp||0;
  if(heatersOn()) for(const h of save.zoo.buildings){ const hd=bdef(h.type); if(hd.kind==='heater' && tileDist(h,b)<=hd.radius+Math.max(...d.size)/2) t+=hd.heat; }
  return t;
}
function habitatFed(b){ const d=bdef(b.type); return save.zoo.buildings.some(f=>{ const fd=bdef(f.type); return fd.kind==='feeder' && tileDist(f,b)<=fd.radius+Math.max(...d.size)/2; }); }
function simulate(min){
  const Z=ZC(), zoo=save.zoo;
  // 暖爐耗煤
  const heaters=zoo.buildings.filter(b=>bdef(b.type).kind==='heater');
  if(heaters.length){
    zoo.fuelDebt+=heaters.reduce((s,h)=>s+bdef(h.type).fuelPerMin,0)*min;
    while(zoo.fuelDebt>=1 && (save.resources.fuel||0)>0){ save.resources.fuel--; zoo.fuelDebt--; }
    zooStats.heatOn=(save.resources.fuel||0)>0 || zoo.fuelDebt<1;
  } else zooStats.heatOn=true;
  const temps=new Map(), fed=new Map(), counts=new Map();
  for(const a of zoo.animals){ const k=a.habitat+'|'+a.species; counts.set(k,(counts.get(k)||0)+1); }
  let attract=0;
  for(const a of zoo.animals){
    const b=findB(a.habitat), sp=DATA.speciesById[a.species]; if(!b||!sp) continue;
    if(!temps.has(b.uid)){ temps.set(b.uid,habitatTemp(b)); fed.set(b.uid,habitatFed(b)); }
    a.food=Math.max(0,(a.food??80)-Z.foodDecayPerMin*min);
    while(a.food<Z.feedRefillAt && fed.get(b.uid) && (save.resources.feed||0)>=1){ save.resources.feed--; a.food=Math.min(100,a.food+Z.feedRefillAmount); }
    const T=temps.get(b.uid), tempOK=T>=sp.tempRange[0]&&T<=sp.tempRange[1];
    const socialOK=!SOCIAL_GROUP.includes(sp.social) || counts.get(b.uid+'|'+a.species)>=2;
    const target=Math.min(40,a.food/30*40)+(tempOK?40:0)+(socialOK?20:5);
    const h=a.happy??60, step=Z.happinessPerMin*min;
    a.happy=Math.abs(target-h)<=step?target:h+Math.sign(target-h)*step;
    attract+=sp.attract*a.happy/100;
  }
  zooStats.coinsPerMin=attract*Z.coinPerAttractPerMin;
  zooStats.visitors=Math.round(attract*Z.visitorPerAttract);
  zoo.coins+=zooStats.coinsPerMin*min;
  zoo.lastTick=Date.now();
}
function catchUp(){
  const zoo=save.zoo, Z=ZC();
  let m=Math.min(Z.offlineCapMinutes,Math.max(0,(Date.now()-(zoo.lastTick||Date.now()))/60000));
  if(m<0.05){ simulate(0); return null; }
  const c0=zoo.coins, f0=save.resources.feed||0, total=m;
  while(m>0){ const s=Math.min(1,m); simulate(s); m-=s; }
  return { minutes:Math.round(total), coins:Math.floor(zoo.coins-c0), feed:f0-(save.resources.feed||0) };
}

/* ---------- 進出園區 ---------- */
function enterZoo(){
  ensureZoo();
  if(!zooBaseBuilt) buildZooBase();
  rebuildZoo();
  const away=catchUp();
  zooActive=true; state='zoo'; zTool='select'; zSelUid=null; updateSelBox();
  screenEl.hidden=true; $('hud').hidden=true; $('touch').hidden=true; $('touch').classList.remove('walk');
  $('zooUI').hidden=false; $('zWalkExit').hidden=true; $('zMain').hidden=false; $('zPanel').hidden=true;
  if(document.exitPointerLock) document.exitPointerLock();
  renderZooTools(); updateZooHud();
  if(away && away.minutes>=1) toast(`離開的 ${away.minutes} 分鐘裡：門票 +${away.coins} 金幣，吃掉飼料 ${away.feed}`);
  else if(!save.zoo.animals.length) toast(Object.values(save.zoo.unplaced).some(n=>n>0)?'先蓋一座棲地，再把救回來的動物放進去':'先出發遠征，把動物救回來');
  persist();
}
function leaveZooForExpedition(){
  simulate(0); persist();
  zooActive=false; $('zooUI').hidden=true; $('zPanel').hidden=true;
  startExpedition();
}

/* ---------- 介面 ---------- */
function updateZooHud(){
  const z=save.zoo;
  $('zRes').innerHTML=[['金幣',Math.floor(z.coins)],...DATA.items.map(i=>[i.name,Math.floor(save.resources[i.id]||0)]),['遊客',zooStats.visitors]]
    .map(([n,v])=>`<span><i>${esc(n)}</i><b class="num">${v}</b></span>`).join('')
    +(zooStats.heatOn?'':'<span class="warnchip">煤炭用完，暖爐停了</span>');
  const avail=Object.values(z.unplaced).reduce((a,b)=>a+b,0);
  $('zPool').textContent=avail?`待安置 ${avail}`:'';
}
function renderZooTools(){
  const tools=[{id:'select',name:'選取',sub:'查看・放動物'},{id:'demolish',name:'拆除',sub:`退還 ${Math.round(ZC().demolishRefund*100)}%`}]
    .concat(DATA.buildings.filter(b=>b.buildable!==false).map(b=>({id:b.id,name:b.name,sub:costText(b.cost),cost:b.cost})));
  $('zTools').innerHTML=tools.map(t=>`<button type="button" class="ztool${zTool===t.id?' on':''}${t.cost&&!affordable(t.cost)?' poor':''}" data-tool="${t.id}"><b>${esc(t.name)}</b><span>${esc(t.sub)}</span></button>`).join('');
  $('zTools').querySelectorAll('.ztool').forEach(el=>el.onclick=()=>{ zTool=el.dataset.tool; zGhost.visible=false; if(zTool!=='select'){ zSelUid=null; updateSelBox(); $('zPanel').hidden=true; } renderZooTools(); });
}
function openHabitatPanel(b){
  const d=bdef(b.type), z=save.zoo, inside=z.animals.filter(a=>a.habitat===b.uid), T=habitatTemp(b), fed=habitatFed(b);
  const cand=Object.entries(z.unplaced).filter(([id,n])=>n>0&&DATA.speciesById[id]&&d.accepts.includes(DATA.speciesById[id].category));
  const full=inside.length>=d.capacity;
  const bar=(v,cls='')=>`<span class="zbar ${cls}"><i style="width:${Math.round(v)}%"></i></span>`;
  $('zPanel').innerHTML=`
    <div class="zp-head"><div><b>${esc(d.name)}</b><span>${T}°C・${inside.length}/${d.capacity} 隻・${fed?'有飼料站':'<em>附近沒有飼料站</em>'}</span></div><button type="button" class="zclose" id="zpClose" aria-label="關閉">✕</button></div>
    ${inside.length?inside.map(a=>{ const sp=DATA.speciesById[a.species], ok=T>=sp.tempRange[0]&&T<=sp.tempRange[1];
      return `<div class="zp-row"><div class="zp-name"><b>${esc(sp.name)}</b><span>適溫 ${sp.tempRange[0]}～${sp.tempRange[1]}°C${ok?'':'・<em>溫度不合</em>'}・${esc(sp.social)}</span></div>
        <div class="zp-bars"><label>幸福${bar(a.happy??60,(a.happy??60)<40?'low':'')}</label><label>飽足${bar(a.food??80,(a.food??80)<30?'low':'')}</label></div>
        <button type="button" class="zmini" data-out="${a.id}">移出</button></div>`; }).join('')
      :`<p class="zp-empty">這裡還沒有動物。</p>`}
    <div class="zp-add">${cand.length&&!full?cand.map(([id,n])=>`<button type="button" class="zmini add" data-in="${id}">放入 ${esc(DATA.speciesById[id].name)}（${n}）</button>`).join('')
      :`<span class="zp-empty">${full?'已經住滿了':`沒有可以放進${esc(d.name)}的${d.accepts.map(c=>DATA.config.categories[c].name).join('、')}生物`}</span>`}</div>`;
  $('zPanel').hidden=false;
  $('zpClose').onclick=()=>{ $('zPanel').hidden=true; zSelUid=null; updateSelBox(); };
  $('zPanel').querySelectorAll('[data-in]').forEach(el=>el.onclick=()=>{
    const id=el.dataset.in; z.unplaced[id]--;
    z.animals.push({id:'a'+(z.nextUid++),species:id,habitat:b.uid,food:80,happy:60});
    rebuildZooAnimals(); simulate(0); openHabitatPanel(b); updateZooHud(); persist();
  });
  $('zPanel').querySelectorAll('[data-out]').forEach(el=>el.onclick=()=>{
    const i=z.animals.findIndex(a=>a.id===el.dataset.out); if(i<0) return;
    const a=z.animals.splice(i,1)[0]; z.unplaced[a.species]=(z.unplaced[a.species]||0)+1;
    rebuildZooAnimals(); simulate(0); openHabitatPanel(b); updateZooHud(); persist();
  });
}

/* ---------- 點擊與鏡頭 ---------- */
const zRay=new THREE.Raycaster(), zNdc=new THREE.Vector2(), zPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0), zHit=new THREE.Vector3();
function screenToTile(cx,cy){
  const r=canvas.getBoundingClientRect();
  zNdc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1);
  zRay.setFromCamera(zNdc,zooCam);
  if(!zRay.ray.intersectPlane(zPlane,zHit)) return null;
  return { x:Math.floor(zHit.x/TS()+GN()/2), z:Math.floor(zHit.z/TS()+GN()/2) };
}
function placeOffset(d,t){ return { x:t.x-Math.floor((d.size[0]-1)/2), z:t.z-Math.floor((d.size[1]-1)/2) }; }
function zooTap(cx,cy){
  const t=screenToTile(cx,cy); if(!t) return;
  const z=save.zoo, uid=occupancy().get(t.x+','+t.z);
  if(zTool==='select'){
    const b=uid&&findB(uid);
    if(!b){ zSelUid=null; updateSelBox(); $('zPanel').hidden=true; return; }
    zSelUid=b.uid; updateSelBox();
    const d=bdef(b.type);
    if(d.kind==='habitat') openHabitatPanel(b);
    else { $('zPanel').hidden=true;
      if(d.kind==='feeder') toast(`飼料站：半徑 ${d.radius} 格內的棲地會自動餵食（倉庫飼料 ${Math.floor(save.resources.feed||0)}）`);
      else if(d.kind==='heater') toast(`暖爐：半徑 ${d.radius} 格內的棲地 +${d.heat}°C，會慢慢消耗煤炭`);
      else toast(d.name); }
    return;
  }
  if(zTool==='demolish'){
    const b=uid&&findB(uid); if(!b) return;
    const d=bdef(b.type);
    if(d.buildable===false){ toast(`${d.name}不能拆除`); return; }
    for(const a of z.animals.filter(a=>a.habitat===b.uid)) z.unplaced[a.species]=(z.unplaced[a.species]||0)+1;
    z.animals=z.animals.filter(a=>a.habitat!==b.uid);
    z.buildings=z.buildings.filter(x=>x.uid!==b.uid);
    const refund={}; for(const [k,v] of Object.entries(d.cost)) refund[k]=Math.floor(v*ZC().demolishRefund);
    pay(refund,1); rebuildZoo(); simulate(0); updateZooHud(); renderZooTools(); persist();
    toast(`拆除${d.name}，退還 ${costText(refund)}`);
    return;
  }
  const d=bdef(zTool); if(!d) return;
  const p=placeOffset(d,t);
  if(!canPlace(d,p.x,p.z)){ toast('這裡放不下'); return; }
  if(!affordable(d.cost)){ toast(`不夠：需要 ${costText(d.cost)}`); return; }
  pay(d.cost,-1);
  const b={uid:z.nextUid++,type:d.id,x:p.x,z:p.z,rot:0};
  z.buildings.push(b);
  const g=makeBuildingMesh(b); zooRoot.add(g); zooBMeshes.set(b.uid,g);
  simulate(0); updateZooHud(); renderZooTools(); persist();
  if(d.kind==='habitat'){ zTool='select'; zSelUid=b.uid; updateSelBox(); renderZooTools(); openHabitatPanel(b); }
}
function updateGhost(cx,cy){
  const d=bdef(zTool);
  if(!d||state!=='zoo'){ zGhost.visible=false; return; }
  const t=screenToTile(cx,cy); if(!t){ zGhost.visible=false; return; }
  const p=placeOffset(d,t), ok=canPlace(d,p.x,p.z)&&affordable(d.cost);
  zGhost.visible=true; zGhost.scale.set(d.size[0]*TS(),1,d.size[1]*TS());
  zGhost.position.set((p.x+d.size[0]/2-GN()/2)*TS(),0.15,(p.z+d.size[1]/2-GN()/2)*TS());
  zGhost.material.color.setHex(ok?0x7cc8e8:0xff5d5d);
}
const zPtrs=new Map(); let zDrag=0, zPinch=0;
canvas.addEventListener('pointerdown',e=>{ if(state!=='zoo') return; zPtrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); zDrag=0; if(zPtrs.size===2){ const [a,b]=[...zPtrs.values()]; zPinch=Math.hypot(a.x-b.x,a.y-b.y); } });
canvas.addEventListener('pointermove',e=>{
  if(state!=='zoo') return;
  const p=zPtrs.get(e.pointerId);
  if(!p){ if(e.pointerType==='mouse') updateGhost(e.clientX,e.clientY); return; }
  const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
  if(zPtrs.size===1){
    zDrag+=Math.abs(dx)+Math.abs(dy);
    if(zDrag>6){ const k=zooCamT.d*0.0022; zooCamT.x-=dx*k; zooCamT.z-=dy*k; const lim=GN()*TS()/2; zooCamT.x=Math.max(-lim,Math.min(lim,zooCamT.x)); zooCamT.z=Math.max(-lim,Math.min(lim+6,zooCamT.z)); }
    if(e.pointerType==='mouse') updateGhost(e.clientX,e.clientY);
  } else if(zPtrs.size===2){
    const [a,b]=[...zPtrs.values()], dd=Math.hypot(a.x-b.x,a.y-b.y);
    if(zPinch) zooCamT.d=Math.max(14,Math.min(80,zooCamT.d*zPinch/dd)); zPinch=dd; zDrag=99;
  }
});
const zUp=e=>{ if(!zPtrs.has(e.pointerId)) return; const single=zPtrs.size===1; zPtrs.delete(e.pointerId); if(state==='zoo'&&single&&zDrag<=6) zooTap(e.clientX,e.clientY); if(zPtrs.size<2) zPinch=0; };
canvas.addEventListener('pointerup',zUp); canvas.addEventListener('pointercancel',e=>zPtrs.delete(e.pointerId));
canvas.addEventListener('wheel',e=>{ if(state!=='zoo') return; e.preventDefault(); zooCamT.d=Math.max(14,Math.min(80,zooCamT.d*(1+Math.sign(e.deltaY)*0.1))); },{passive:false});

/* ---------- 第一人稱逛園 ---------- */
function startZooWalk(){
  state='zoowalk'; $('zMain').hidden=true; $('zPanel').hidden=true; $('zWalkExit').hidden=false; zGhost.visible=false; zSelBox.visible=false;
  const g=save.zoo.buildings.find(b=>b.type==='gate'), c=g?tileCenter(g):{x:0,z:GN()*TS()/2-2};
  player.pos.set(c.x,0,c.z-1.5); player.yaw=0; player.pitch=-0.05;
  if(isTouch){ $('touch').hidden=false; $('touch').classList.add('walk'); } else tryLock();
}
function endZooWalk(){
  state='zoo'; $('zMain').hidden=false; $('zWalkExit').hidden=true; $('touch').hidden=true; $('touch').classList.remove('walk');
  if(document.exitPointerLock) document.exitPointerLock(); updateSelBox();
}

/* ---------- 每幀 ---------- */
function zooUpdate(dt){
  if(toastT>0){ toastT-=dt; if(toastT<=0) $('toast').style.opacity=0; }
  zooAcc+=dt; if(zooAcc>=0.5){ simulate(zooAcc/60); zooAcc=0; }
  zSaveT+=dt; if(zSaveT>=ZC().autosaveSeconds){ zSaveT=0; persist(); }
  zHudT+=dt; if(zHudT>=0.5){ zHudT=0; updateZooHud(); }
  for(const g of zooBMeshes.values()) if(g.userData.glow) g.userData.glow.material.opacity=heatersOn()?0.55+Math.sin(clock.elapsedTime*3)*0.15:0;
  for(const z of zooAnimals){
    const m=z.mesh;
    if(z.wait>0){ z.wait-=dt; m.position.y=0.1; continue; }
    const dx=z.tx-m.position.x, dz=z.tz-m.position.z, d=Math.hypot(dx,dz);
    if(d<0.2){ z.tx=z.c.x+(Math.random()*2-1)*z.hw; z.tz=z.c.z+(Math.random()*2-1)*z.hd; z.wait=1+Math.random()*4; continue; }
    const s=Math.min(d,dt*1.4); m.position.x+=dx/d*s; m.position.z+=dz/d*s; m.rotation.y=Math.atan2(dx,dz);
    z.hop+=dt*10; m.position.y=0.1+Math.abs(Math.sin(z.hop))*0.12;
  }
  if(state==='zoowalk'){
    let ix=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joy.x, iz=(keys.KeyS?1:0)-(keys.KeyW?1:0)+joy.y;
    const il=Math.hypot(ix,iz); if(il>1){ix/=il;iz/=il;}
    const sp=sprint?6.5:3.6, sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
    player.pos.x+=(ix*cy+iz*sy)*sp*dt; player.pos.z+=(-ix*sy+iz*cy)*sp*dt;
    const lim=GN()*TS()/2-0.6; player.pos.x=Math.max(-lim,Math.min(lim,player.pos.x)); player.pos.z=Math.max(-lim,Math.min(lim+4,player.pos.z));
    if(il>0.1) player.bob+=dt*8;
    camera.position.set(player.pos.x,1.65+(il>0.1?Math.sin(player.bob)*0.05:0),player.pos.z); camera.rotation.set(player.pitch,player.yaw,0);
  } else {
    zooCam.position.set(zooCamT.x,zooCamT.d*0.82,zooCamT.z+zooCamT.d*0.58); zooCam.lookAt(zooCamT.x,0,zooCamT.z);
  }
}

$('zWalk').onclick=()=>startZooWalk();
$('zWalkExit').onclick=()=>endZooWalk();
$('zDex').onclick=()=>{ $('zooUI').hidden=true; showDex(); };
$('zGo').onclick=()=>leaveZooForExpedition();
