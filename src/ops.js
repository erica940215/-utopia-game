/* =========================================================
   園區營運：員工、遊客、園區評價、成就
   員工在 data/staff.json，成就在 data/achievements.json，數值在 config.ops
   ========================================================= */
const OPS=()=>DATA.config.ops;
const opsStats={coverage:1,satisfaction:60,rating:1,score:0,parts:{},unpaid:false,theft:false,needs:{},salary:0,income:{ticket:0,spend:0}};
const staffCount=id=>((save.zoo&&save.zoo.staff)||{})[id]||0;
const totalStaff=()=>Object.values(save.zoo.staff||{}).reduce((a,b)=>a+b,0);
const isWorking=b=>(b.cond??100)>=OPS().brokenBelow;
function ensureOps(){
  const z=save.zoo; if(!z) return;
  z.staff=z.staff||{...OPS().startStaff};
  z.ticket=z.ticket??OPS().ticketDefault;
  z.clean=z.clean??100; z.births=z.births||0; z.ach=z.ach||{};
  for(const b of z.buildings) if(b.cond==null) b.cond=100;
  for(const a of z.animals) if(a.health==null) a.health=100;
}

/* 每次模擬：先處理員工（薪水、照護覆蓋、維修、清潔、醫療），再算動物需求 */
function opsBeforeAnimals(min){
  const z=save.zoo, O=OPS(), S=DATA.staffById;
  // 薪水
  const salary=Object.entries(z.staff).reduce((s,[id,n])=>s+(S[id]?S[id].salaryPerMin*n:0),0);
  opsStats.salary=salary; z.coins-=salary*min;
  opsStats.unpaid=z.coins<0; if(z.coins<0) z.coins=0;
  const eff=opsStats.unpaid?0.5:1;
  // 飼育員覆蓋率
  const need=z.animals.length;
  opsStats.coverage=need?Math.min(1,staffCount('keeper')*S.keeper.capacity*RF().keeperCapacityMult*eff/need):1;
  // 設施耗損與技工維修
  const wear=z.buildings.filter(b=>{ const k=bdef(b.type).kind; return k!=='path'&&k!=='gate'; });
  for(const b of wear) b.cond=Math.max(0,(b.cond??100)-O.conditionDecayPerMin*min);
  let repair=staffCount('mechanic')*S.mechanic.repairPerMin*RF().repairMult*eff*min;
  for(const b of wear.slice().sort((a,b)=>a.cond-b.cond)){ if(repair<=0) break; const r=Math.min(repair,100-b.cond); b.cond+=r; repair-=r; }
  // 清潔
  z.clean=Math.max(0,Math.min(100,z.clean-(zooStats.visitors||0)*O.litterPerVisitorMin*min+staffCount('janitor')*S.janitor.cleanPerMin*RF().cleanMult*eff*min));
  // 生病與獸醫
  let cure=staffCount('vet')*S.vet.curePerMin*eff*min;
  for(const a of z.animals){
    if(!a.sick&&Math.random()<O.sickChancePerMin*RF().sickChanceMult*min*(a.food<30?3:1)) a.sick=true;
    if(a.sick&&cure>=1){ a.sick=false; cure-=1; }
    else if(a.sick&&cure>0&&Math.random()<cure){ a.sick=false; cure=0; }
    a.health=Math.max(5,Math.min(100,(a.health??100)+(a.sick?-O.sickHealthLossPerMin:O.healthRegenPerMin)*min));
  }
}
function animalOpsPenalty(a,b){
  return (1-opsStats.coverage)*25+(100-(a.health??100))*0.3+(isWorking(b)?0:12);
}

/* 遊客、門票、消費、研究 */
function facilityCoverage(service,visitors){
  const serves=save.zoo.buildings.filter(b=>{ const d=bdef(b.type); return d.kind==='facility'&&d.service===service&&isWorking(b); }).reduce((s,b)=>s+bdef(b.type).serves,0);
  return visitors<=0?1:Math.min(1,serves/visitors);
}
function opsEconomy(attract,min){
  const z=save.zoo, O=OPS(), Z=ZC();
  const prevV=Math.max(1,zooStats.visitors||0);
  const viewing=z.animals.length?z.animals.reduce((s,a)=>s+(a.happy??60),0)/z.animals.length:20;
  const needs={food:facilityCoverage('food',prevV),restroom:facilityCoverage('restroom',prevV),rest:facilityCoverage('rest',prevV),shop:facilityCoverage('shop',prevV)};
  const boards=(z.props||[]).filter(p=>p.type==='info_board').length;
  const education=Math.min(100,staffCount('educator')*DATA.staffById.educator.satisfaction*4+boards*6);
  const decor=Math.min(100,(z.props||[]).length*2);
  const needScore=(needs.food+needs.restroom+needs.rest)/3*100;
  const sat=0.35*viewing+0.25*needScore+0.2*z.clean+0.1*education+0.1*decor;
  opsStats.needs=needs; opsStats.satisfaction=sat; opsStats.parts.sat={viewing,needScore,clean:z.clean,education,decor};
  const priceF=Math.max(0.2,1-(z.ticket-O.ticketDefault)*O.priceElasticity*RF().priceElasticityMult);
  const visitors=Math.round(attract*Z.visitorPerAttract*(0.5+sat/100)*priceF*(0.7+0.1*opsStats.rating)*RF().visitorMult);
  let ticket=visitors*z.ticket*O.coinsPerVisitorTicketMin;
  let spend=0;
  for(const b of z.buildings){ const d=bdef(b.type); if(d.kind==='facility'&&d.spendPerVisitorMin&&isWorking(b)) spend+=Math.min(visitors,d.serves)*d.spendPerVisitorMin; }
  opsStats.theft=staffCount('security')*DATA.staffById.security.capacity<visitors&&visitors>20;
  const mult=opsStats.theft?1-O.theftLoss:1;
  opsStats.income={ticket:ticket*mult,spend:spend*mult};
  zooStats.visitors=visitors; zooStats.coinsPerMin=(ticket+spend)*mult;
  z.coins+=zooStats.coinsPerMin*min;
  const distinct=new Set(z.animals.map(a=>a.species)).size;
  zooStats.researchPerMin=distinct*(Z.researchPerSpeciesPerMin||0)*(1+staffCount('educator')*DATA.staffById.educator.researchBonus);
  z.research=(z.research||0)+zooStats.researchPerMin*min;
}

/* 園區評價：動物福利、遊客滿意度、物種多樣性、保育、整潔 */
function computeRating(){
  const z=save.zoo, O=OPS(), W=O.ratingWeights;
  const welfare=z.animals.length?z.animals.reduce((s,a)=>s+(a.happy??60),0)/z.animals.length:0;
  const distinct=new Set(z.animals.map(a=>a.species));
  const diversity=Math.min(1,distinct.size/O.diversityFull)*100;
  const endangered=[...distinct].filter(id=>{ const r=DATA.speciesById[id]&&DATA.speciesById[id].rarity; return r==='endangered'||r==='legendary'; }).length;
  const conservation=Math.min(1,(endangered+(z.released||0)*0.5+consDoneCount()*2)/O.conservationFull)*100;
  const parts={welfare,satisfaction:opsStats.satisfaction,diversity,conservation,cleanliness:z.clean};
  const score=Object.entries(W).reduce((s,[k,w])=>s+w*parts[k],0);
  opsStats.parts.rating=parts; opsStats.score=score; opsStats.endangered=endangered;
  opsStats.rating=Math.max(1,Math.min(5,1+Math.floor(score/20)));
  return opsStats.rating;
}

/* 成就 */
function achStat(k){
  const z=save.zoo;
  return {species:Object.keys(save.collection).length,births:z.births||0,released:z.released||0,visitors:zooStats.visitors||0,
    rating:opsStats.rating,staff:totalStaff(),props:(z.props||[]).length,runs:save.runs||0,endangered:opsStats.endangered||0}[k]||0;
}
function checkAchievements(){
  if(modeOf()!=='career') return;
  const z=save.zoo; let got=[];
  for(const a of DATA.achievements){
    if(z.ach[a.id]) continue;
    if(achStat(a.stat)>=a.target){ z.ach[a.id]=Date.now(); pay(a.reward,1); got.push(a); }
  }
  if(got.length){ toast(`成就達成：${got.map(a=>a.name).join('、')}（獎勵 ${got.map(a=>costText(a.reward)).join('、')}）`); persist(); }
}

/* 遊客小人：在步道上走動 */
let zooPeople=[];
const PEOPLE_COLORS=[0xc8402a,0x2a5ad8,0xe8c040,0x3a8a4a,0x8a3a9a,0xe0802a,0xf2efe6,0x2a2828];
function makePerson(){
  const g=new THREE.Group(), c=PEOPLE_COLORS[Math.floor(Math.random()*PEOPLE_COLORS.length)];
  const body=cyl(0.18,0.22,0.8,c,8); body.position.y=0.6; g.add(body);
  const legs=cyl(0.14,0.14,0.4,0x2a2c34,6); legs.position.y=0.2; g.add(legs);
  const head=sph(0.15,0xe8c0a0); head.position.y=1.15; g.add(head);
  return g;
}
function pathTargets(){
  const ps=save.zoo.buildings.filter(b=>bdef(b.type).kind==='path'||bdef(b.type).kind==='facility'||b.type==='gate').map(tileCenter);
  return ps.length?ps:[{x:0,z:GN()*TS()/2-3}];
}
function updatePeople(dt){
  const want=Math.min(36,Math.round((zooStats.visitors||0)/4));
  const targets=pathTargets();
  while(zooPeople.length<want){ const p=makePerson(), t=targets[Math.floor(Math.random()*targets.length)]; p.position.set(t.x+(Math.random()-0.5),0,t.z+(Math.random()-0.5)); zooRoot.add(p); zooPeople.push({m:p,tx:p.position.x,tz:p.position.z,wait:Math.random()*3,ph:Math.random()*6}); }
  while(zooPeople.length>want){ const p=zooPeople.pop(); zooRoot.remove(p.m); }
  for(const p of zooPeople){
    const m=p.m;
    if(p.wait>0){ p.wait-=dt; }
    else{
      const dx=p.tx-m.position.x, dz=p.tz-m.position.z, d=Math.hypot(dx,dz);
      if(d<0.3){ const t=targets[Math.floor(Math.random()*targets.length)]; p.tx=t.x+(Math.random()-0.5)*1.4; p.tz=t.z+(Math.random()-0.5)*1.4; p.wait=Math.random()*4; }
      else{ const s=Math.min(d,dt*1.3); m.position.x+=dx/d*s; m.position.z+=dz/d*s; m.rotation.y=Math.atan2(dx,dz); p.ph+=dt*9; }
    }
    m.position.y=ZH(m.position.x,m.position.z)+Math.abs(Math.sin(p.ph))*0.05;
  }
}
function clearPeople(){ for(const p of zooPeople) zooRoot.remove(p.m); zooPeople=[]; }

/* 營運面板 */
let opsTab='staff';
const bar100=(v,cls='')=>`<span class="zbar ${cls}"><i style="width:${Math.max(0,Math.min(100,Math.round(v)))}%"></i></span>`;
const starsTxt=n=>'★'.repeat(n)+'☆'.repeat(5-n);
function showOps(msg){
  ensureOps(); state='ops'; computeRating();
  const z=save.zoo, O=OPS();
  let body='';
  if(opsTab==='staff'){
    body=DATA.staff.map(s=>{ const n=staffCount(s.id);
      return `<div class="shopcard"><div class="sc-main"><b>${esc(s.name)} <em class="num">×${n}</em></b><span>${esc(s.desc)}</span><span>薪水每人每分鐘 ${s.salaryPerMin} 金幣・雇用費 ${s.hireCost}</span></div>
        <div class="zp-btns"><button type="button" class="zmini add" data-hire="${s.id}" ${z.coins>=s.hireCost?'':'disabled'}>雇用</button><button type="button" class="zmini" data-fire="${s.id}" ${n?'':'disabled'}>解雇</button></div></div>`; }).join('');
    const broken=z.buildings.filter(b=>!isWorking(b)).length, sick=z.animals.filter(a=>a.sick).length;
    body=`<div class="statline">每分鐘薪水 ${opsStats.salary.toFixed(1)} 金幣・照護覆蓋 ${Math.round(opsStats.coverage*100)}%・生病動物 ${sick} 隻・損壞設施 ${broken} 座・整潔 ${Math.round(z.clean)}%${opsStats.unpaid?'・<em>金幣不足，員工效率減半</em>':''}</div>`+body;
  } else if(opsTab==='visitors'){
    const p=opsStats.parts.sat||{}, n=opsStats.needs||{};
    body=`<div class="statline">遊客 ${zooStats.visitors} 人・滿意度 ${Math.round(opsStats.satisfaction)}・每分鐘收入：門票 ${opsStats.income.ticket.toFixed(1)}、消費 ${opsStats.income.spend.toFixed(1)}${opsStats.theft?'・<em>保全不足，損失 '+Math.round(O.theftLoss*100)+'%</em>':''}</div>
      <label class="zopt ticket">門票價格 <input type="range" id="ticketIn" min="${O.ticketMin}" max="${O.ticketMax}" step="1" value="${z.ticket}"> <b class="num" id="ticketOut">${z.ticket} 金幣</b></label>
      <div class="opsgrid">
        <label>看動物（動物平均幸福度）${bar100(p.viewing)}</label>
        <label>餐飲 ${bar100((n.food||0)*100,n.food<0.6?'low':'')}</label>
        <label>廁所 ${bar100((n.restroom||0)*100,n.restroom<0.6?'low':'')}</label>
        <label>休息區 ${bar100((n.rest||0)*100,n.rest<0.6?'low':'')}</label>
        <label>整潔 ${bar100(p.clean,p.clean<50?'low':'')}</label>
        <label>教育（教育人員、解說牌）${bar100(p.education)}</label>
        <label>造景（自由擺放物件）${bar100(p.decor)}</label>
      </div>
      <p class="zp-empty">票價越高，來的人越少。餐廳、廁所、休息區在「設施」分頁建造；遊客越多，需要的數量越多。</p>`;
  } else if(opsTab==='rating'){
    const r=opsStats.parts.rating||{}, names={welfare:'動物福利',satisfaction:'遊客滿意度',diversity:'物種多樣性',conservation:'保育成果',cleanliness:'整潔'};
    body=`<div class="rating"><span class="bigstars">${starsTxt(opsStats.rating)}</span><span class="num">總分 ${Math.round(opsStats.score)}／100</span></div>
      <div class="opsgrid">${Object.keys(names).map(k=>`<label>${names[k]}（權重 ${Math.round(O.ratingWeights[k]*100)}%）${bar100(r[k])}</label>`).join('')}</div>
      <p class="zp-empty">評價越高，遊客越多。保育成果看園區裡的瀕危與傳說級物種數量，以及野放的動物。</p>`;
  } else {
    body=DATA.achievements.map(a=>{ const done=z.ach[a.id], v=achStat(a.stat);
      return `<div class="shopcard${done?' on':''}"><div class="sc-main"><b>${done?'✔ ':''}${esc(a.name)}</b><span>${esc(a.desc)}・獎勵 ${esc(costText(a.reward))}</span>${done?'':bar100(v/a.target*100)}</div><span class="sc-max num">${Math.min(v,a.target)}/${a.target}</span></div>`; }).join('');
  }
  const tabs=[['staff','員工'],['visitors','遊客'],['rating','評價'],['ach','成就']];
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>OPERATIONS · 園區營運</small>營運</h1><span class="savechip">${starsTxt(opsStats.rating)}・金幣 ${Math.floor(z.coins)}</span></div>
    <div class="dextabs" role="tablist">${tabs.map(([id,n])=>`<button type="button" role="tab" class="dextab${opsTab===id?' on':''}" data-otab="${id}" aria-selected="${opsTab===id}">${n}</button>`).join('')}</div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <div class="shoplist">${body}</div>
    <button class="btn ghost" id="opsBack" type="button">回到園區</button>
  </div>`;
  screenEl.querySelectorAll('[data-otab]').forEach(el=>el.onclick=()=>{ opsTab=el.dataset.otab; showOps(); });
  screenEl.querySelectorAll('[data-hire]').forEach(el=>el.onclick=()=>{ const s=DATA.staffById[el.dataset.hire]; if(z.coins<s.hireCost) return; z.coins-=s.hireCost; z.staff[s.id]=(z.staff[s.id]||0)+1; simulate(0); persist(); showOps(`雇用了一位${s.name}`); });
  screenEl.querySelectorAll('[data-fire]').forEach(el=>el.onclick=()=>{ const id=el.dataset.fire; if(!z.staff[id]) return; z.staff[id]--; simulate(0); persist(); showOps(`解雇了一位${DATA.staffById[id].name}`); });
  const ti=$('ticketIn'); if(ti){ ti.oninput=e=>{ $('ticketOut').textContent=e.target.value+' 金幣'; }; ti.onchange=e=>{ z.ticket=parseInt(e.target.value,10); simulate(0); persist(); showOps(); }; }
  $('opsBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}
