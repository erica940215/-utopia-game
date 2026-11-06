/* =========================================================
   自由畫棲地：在地上點出圍欄的轉角，繞一圈回到起點就圍成棲地
   圍欄種類與氣候在 data/habitats.json
   ========================================================= */
const HABS=()=>DATA.habitats;
const barrierDef=id=>HABS().barriers.find(b=>b.id===id)||HABS().barriers[0];
const climateDef=id=>HABS().climates.find(c=>c.id===id)||HABS().climates[1];
function pointInPoly(x,z,poly){ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const [xi,zi]=poly[i],[xj,zj]=poly[j]; if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside; } return inside; }
const polyArea=p=>Math.abs(p.reduce((s,[x,z],i)=>{ const [x2,z2]=p[(i+1)%p.length]; return s+x*z2-x2*z; },0))/2;
const polyPerim=p=>p.reduce((s,[x,z],i)=>{ const [x2,z2]=p[(i+1)%p.length]; return s+Math.hypot(x2-x,z2-z); },0);
function freeHabCost(poly,barrier,climate){
  const P=polyPerim(poly), c={...climateDef(climate).base};
  for(const [k,v] of Object.entries(barrierDef(barrier).costPerM)) c[k]=Math.ceil((c[k]||0)+v*P);
  return c;
}
/* 自由棲地用的「建築定義」：每座都不一樣，所以依實例產生 */
function registerFreeHab(b){
  const H=HABS(), cl=climateDef(b.climate), br=barrierDef(b.barrier), areaT=polyArea(b.poly)/(TS()*TS());
  const xs=b.poly.map(p=>p[0]), zs=b.poly.map(p=>p[1]);
  const def={id:b.type,name:`${cl.name}棲地（自訂）`,kind:'habitat',free:true,size:[b.w,b.h],baseTemp:cl.temp,accepts:H.accepts,
    capacity:Math.max(2,Math.floor(areaT/H.tilesPerAnimal)),ground:'#7a8a6a',groundPaint:cl.paint,cost:b.cost||{},barrier:br.id,areaTiles:areaT,
    power:br.power?Math.ceil(br.power*polyPerim(b.poly)):0};
  DATA.buildingById[b.type]=def; return def;
}
function registerAllFreeHabs(){ for(const b of save.zoo.buildings) if(b.poly) registerFreeHab(b); }
/* 圍欄外觀 */
function makeFenceMesh(b,c){
  const g=new THREE.Group(), br=barrierDef(b.barrier), H=br.height, col=hex(br.color);
  const glass=br.id==='glass'||br.id==='oneway';
  const panelM=glass?new THREE.MeshPhongMaterial({color:col,transparent:true,opacity:br.id==='oneway'?0.7:0.3,shininess:100,depthWrite:false,side:THREE.DoubleSide}):br.id==='steel'?new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:0.55,side:THREE.DoubleSide}):M(col);
  const postM=M(br.id==='wood'?0x5a4030:0x4a4f56);
  const n=b.poly.length;
  for(let i=0;i<n;i++){
    const [x1,z1]=b.poly[i], [x2,z2]=b.poly[(i+1)%n], L=Math.hypot(x2-x1,z2-z1), a=Math.atan2(x2-x1,z2-z1);
    const steps=Math.max(1,Math.round(L/2));
    for(let k=0;k<steps;k++){
      const t0=k/steps, t1=(k+1)/steps, xa=x1+(x2-x1)*t0, za=z1+(z2-z1)*t0, xb=x1+(x2-x1)*t1, zb=z1+(z2-z1)*t1, mx=(xa+xb)/2, mz=(za+zb)/2, y=ZH(mx,mz), seg=L/steps;
      if(br.id==='wood'){ for(const yy of [0.45,0.95]){ const r=box(0.06,0.1,seg,panelM); r.position.set(mx-c.x,y+yy,mz-c.z); r.rotation.y=a; g.add(r); } }
      else if(br.id==='electric'){ for(const yy of [0.5,1.1,1.7,2.3]){ const r=box(0.03,0.03,seg,M(0xd8c060)); r.position.set(mx-c.x,y+yy,mz-c.z); r.rotation.y=a; g.add(r); } }
      else { const p=box(br.id==='concrete'?0.35:0.06,H,seg,panelM); p.position.set(mx-c.x,y+H/2,mz-c.z); p.rotation.y=a; g.add(p); }
      const post=box(0.14,H+0.1,0.14,postM); post.position.set(xa-c.x,ZH(xa,za)+H/2,za-c.z); g.add(post);
    }
  }
  return g;
}
/* ---------- 畫圖工具 ---------- */
let zDraw=null;   // {pts:[], line, dots}
function drawHabTap(cx,cy){
  const h=groundHit(cx,cy); if(!h) return;
  const half=GN()*TS()/2-0.5, x=Math.round(Math.max(-half,Math.min(half,h.x))*2)/2, z=Math.round(Math.max(-half,Math.min(half,h.z))*2)/2;
  if(!zDraw) zDraw={pts:[]};
  const P=zDraw.pts;
  if(P.length>=3&&Math.hypot(P[0][0]-x,P[0][1]-z)<1.5){ finishDrawHab(); return; }
  P.push([x,z]); drawPreview();
  toast(P.length<3?`第 ${P.length} 個轉角，繼續點下一個`:'點回第一個轉角（或按「完成」）就能圍起來');
}
function drawPreview(){
  if(zDraw.line){ zooRoot.remove(zDraw.line); } const g=new THREE.Group(); zDraw.line=g; zooRoot.add(g);
  const P=zDraw.pts, mat=new THREE.LineBasicMaterial({color:0xff9a3c});
  if(P.length>1){ const pts=P.map(([x,z])=>new THREE.Vector3(x,ZH(x,z)+0.3,z)); g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat)); }
  P.forEach(([x,z],i)=>{ const d=sph(i?0.25:0.4,new THREE.MeshBasicMaterial({color:i?0xff9a3c:0x7cc8e8})); d.position.set(x,ZH(x,z)+0.3,z); g.add(d); });
  renderDrawBar();
}
function renderDrawBar(){
  const P=zDraw?zDraw.pts:[];
  $('zPanel').hidden=false;
  $('zPanel').innerHTML=`<div class="zp-head"><div><b>畫棲地</b><span>在地上點出圍欄的轉角，點回第一個點（藍色）就會圍起來</span></div><button type="button" class="zclose" id="dhClose" aria-label="取消">✕</button></div>
    <div class="zp-note">已經點了 ${P.length} 個轉角${P.length>=3?`・面積約 ${Math.round(polyArea(P))} m²・周長 ${Math.round(polyPerim(P))} m`:''}</div>
    <div class="zp-btns"><button type="button" class="zmini" id="dhUndo" ${P.length?'':'disabled'}>退一步</button><button type="button" class="zmini add" id="dhDone" ${P.length>=3?'':'disabled'}>完成</button></div>`;
  $('dhClose').onclick=cancelDrawHab; $('dhUndo').onclick=()=>{ zDraw.pts.pop(); drawPreview(); }; $('dhDone').onclick=finishDrawHab;
}
function cancelDrawHab(){ if(zDraw&&zDraw.line) zooRoot.remove(zDraw.line); zDraw=null; $('zPanel').hidden=true; }
function finishDrawHab(){
  const P=zDraw.pts, H=HABS();
  if(polyArea(P)<H.minArea){ toast(`太小了，至少要 ${H.minArea} m²`); return; }
  // 檢查跟其他建築重疊
  const occ=occupancy(); for(const k of occ.keys()){ const [tx,tz]=k.split(',').map(Number), x=(tx+0.5-GN()/2)*TS(), z=(tz+0.5-GN()/2)*TS(); if(pointInPoly(x,z,P)){ toast('圍欄裡面有其他建築，換個地方畫'); return; } }
  let barrier='wood', climate='temperate';
  const render=()=>{ const cost=freeHabCost(P,barrier,climate), br=barrierDef(barrier);
    $('zPanel').innerHTML=`<div class="zp-head"><div><b>新棲地</b><span>面積 ${Math.round(polyArea(P))} m²・周長 ${Math.round(polyPerim(P))} m・約可住 ${Math.max(2,Math.floor(polyArea(P)/(TS()*TS())/H.tilesPerAnimal))} 隻</span></div><button type="button" class="zclose" id="dhClose" aria-label="取消">✕</button></div>
      <div class="zp-note"><b>氣候</b><div class="zp-btns">${H.climates.map(c=>`<button type="button" class="zmini${c.id===climate?' add':''}" data-cl="${c.id}">${esc(c.name)} ${c.temp}°C</button>`).join('')}</div></div>
      <div class="zp-note"><b>圍欄</b><div class="zp-btns">${H.barriers.map(b=>`<button type="button" class="zmini${b.id===barrier?' add':''}" data-br="${b.id}">${esc(b.name)}</button>`).join('')}</div>
        <span>${esc(barrierInfo(br))}</span></div>
      <div class="zp-btns"><button type="button" class="zmini add" id="dhBuild" ${affordable(cost)?'':'disabled'}>建造：${esc(costText(cost))}</button><button type="button" class="zmini" id="dhBack">繼續修改形狀</button></div>`;
    $('dhClose').onclick=cancelDrawHab; $('dhBack').onclick=()=>drawPreview();
    $('zPanel').querySelectorAll('[data-cl]').forEach(el=>el.onclick=()=>{ climate=el.dataset.cl; render(); });
    $('zPanel').querySelectorAll('[data-br]').forEach(el=>el.onclick=()=>{ barrier=el.dataset.br; render(); });
    $('dhBuild').onclick=()=>{ if(!affordable(cost)) return; pay(cost,-1); createFreeHab(P.map(p=>[...p]),barrier,climate,cost); };
  };
  render();
}
function barrierInfo(br){ return `耐撞 ${br.grade} 級・${br.climbproof?'防攀爬':'會被攀爬'}・${br.oneway?'單面玻璃（動物看不到遊客）':br.opaque?'不透明（遊客看不到動物）':'看得見'}・${br.watertight?'防水（可以有水池）':'不防水（水會漏，水池無效）'}・高 ${br.height} m${br.power?'・要用電':''}`; }
function createFreeHab(poly,barrier,climate,cost){
  const z=save.zoo, xs=poly.map(p=>p[0]), zs=poly.map(p=>p[1]);
  const tx0=Math.floor(Math.min(...xs)/TS()+GN()/2), tz0=Math.floor(Math.min(...zs)/TS()+GN()/2), tx1=Math.ceil(Math.max(...xs)/TS()+GN()/2), tz1=Math.ceil(Math.max(...zs)/TS()+GN()/2);
  const uid=z.nextUid++, b={uid,type:'free:'+uid,x:tx0,z:tz0,w:Math.max(1,tx1-tx0),h:Math.max(1,tz1-tz0),rot:0,poly,barrier,climate,cost,cond:100};
  registerFreeHab(b); z.buildings.push(b);
  if(zDraw&&zDraw.line) zooRoot.remove(zDraw.line); zDraw=null;
  const g=makeBuildingMesh(b); zooRoot.add(g); zooBMeshes.set(b.uid,g);
  simulate(0); updateZooHud(); persist(); zTool='select'; zSelUid=b.uid; updateSelBox(); renderZooTools(); openHabitatPanel(b);
  toast('棲地圍好了！把動物放進去吧');
}
function randomInPoly(poly){ const xs=poly.map(p=>p[0]), zs=poly.map(p=>p[1]); for(let t=0;t<40;t++){ const x=Math.min(...xs)+Math.random()*(Math.max(...xs)-Math.min(...xs)), z=Math.min(...zs)+Math.random()*(Math.max(...zs)-Math.min(...zs)); if(pointInPoly(x,z,poly)) return {x,z}; } return {x:xs[0],z:zs[0]}; }
/* 棲地面板：換圍欄 */
function freeBarrierHtml(b){
  if(!b.poly) return ''; const br=barrierDef(b.barrier);
  return `<div class="zp-note">圍欄：<b>${esc(br.name)}</b>・${esc(barrierInfo(br))}<div class="zp-btns">${HABS().barriers.filter(x=>x.id!==br.id).map(x=>{ const c=freeHabCost(b.poly,x.id,b.climate); delete c.coins; const cc={...c,coins:Math.ceil(polyPerim(b.poly)*(x.costPerM.coins||0))}; return `<button type="button" class="zmini" data-rebar="${x.id}" ${affordable(cc)?'':'disabled'} title="${esc(costText(cc))}">換成${esc(x.name)}</button>`; }).join('')}</div></div>`;
}
function wireFreeBarrier(b){
  $('zPanel').querySelectorAll('[data-rebar]').forEach(el=>el.onclick=()=>{ const x=barrierDef(el.dataset.rebar), c=freeHabCost(b.poly,x.id,b.climate); delete c.coins; const cc={...c,coins:Math.ceil(polyPerim(b.poly)*(x.costPerM.coins||0))};
    if(!affordable(cc)) return; pay(cc,-1); b.barrier=x.id; registerFreeHab(b); persist(); rebuildZoo(); openHabitatPanel(b); toast(`圍欄換成${x.name}`); });
}
