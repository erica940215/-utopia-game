/* =========================================================
   園區經營細節：交易中心、園內小火車、水電、員工（訓練・薪資・士氣・指派）、
   遊客（想法・退票・捐款箱）、行銷活動與貸款
   數值在 config.biz；建築在 buildings.json（kind: utility / transport）
   ========================================================= */
const BIZ=()=>DATA.config.biz;
function ensureBiz(){
  const z=save.zoo; if(!z) return;
  z.cp=z.cp||0; z.staffLv=z.staffLv||{}; z.wage=z.wage||1; z.morale=z.morale??70; z.assign=z.assign||{};
  z.market=z.market||{offers:[],refreshAt:0};
}
const bizStats={power:{supply:0,demand:0,ratio:1},water:{supply:0,demand:0,ratio:1},bill:0,rides:0,donations:0,refund:0,loanPay:0,thoughts:[],campaign:1,tram:false};

/* ---------- 員工：訓練、薪資、士氣 ---------- */
const staffLv=id=>(save.zoo.staffLv&&save.zoo.staffLv[id])||1;
function staffEff(id){ const B=BIZ(); return (1+(staffLv(id)-1)*B.trainBonus)*(0.6+0.4*Math.min(1.2,(save.zoo.morale??70)/70)); }
const staffPower=id=>staffCount(id)*staffEff(id);
function moraleStep(min){
  const z=save.zoo, B=BIZ();
  const target=Math.max(0,Math.min(100,55+(z.wage-1)*160+(opsStats.unpaid?-45:0)));
  z.morale+=(target-z.morale)*Math.min(1,min*0.05);
  if(z.morale<B.quitBelow&&totalStaff()>1&&Math.random()<B.quitChancePerMin*min){
    const ids=Object.keys(z.staff).filter(id=>z.staff[id]>0); const id=ids[Math.floor(Math.random()*ids.length)];
    z.staff[id]--; toast(`一位${DATA.staffById[id].name}因為士氣太低辭職了。調高薪資可以留住員工`);
  }
}
/* 飼育員指派：指派到棲地的飼育員優先照顧那裡 */
function habitatCoverage(b){ return (bizStats.habCov&&bizStats.habCov.get(b.uid))??opsStats.coverage; }
function computeHabCov(){
  const z=save.zoo, cap=DATA.staffById.keeper.capacity*RF().keeperCapacityMult*(opsStats.unpaid?0.5:1)*staffEff('keeper');
  const map=new Map(); let free=Math.max(0,staffCount('keeper')-Object.values(z.assign).reduce((a,b)=>a+b,0))*cap, rest=0;
  for(const b of z.buildings){ if(bdef(b.type).kind!=='habitat') continue; const n=z.animals.filter(a=>a.habitat===b.uid).length; if(!n) continue;
    const own=(z.assign[b.uid]||0)*cap; map.set(b.uid,Math.min(1,own/n)); if(own<n) rest+=n-own; }
  const share=rest?Math.min(1,free/rest):1;
  for(const [uid,c] of map) if(c<1) map.set(uid,Math.min(1,c+(1-c)*share));
  bizStats.habCov=map;
}

/* ---------- 水電 ---------- */
function utilityStep(min){
  const z=save.zoo, B=BIZ(); let ps=B.gatePower, ws=B.gateWater, pd=0, wd=0, fuel=0;
  for(const b of z.buildings){ const d=bdef(b.type);
    if(d.kind==='utility'&&isWorking(b)){ if(d.util==='power'){ ps+=d.supply; fuel+=d.fuelPerMin||0; } else ws+=d.supply; }
    pd+=d.power||0;
    if(d.kind==='habitat'&&(d.water||z.animals.some(a=>a.habitat===b.uid&&speciesNeeds(DATA.speciesById[a.species]||{}).water))) wd+=1;
  }
  // 發電機燒煤；沒煤就停
  if(fuel>0){ z.powerFuelDebt=(z.powerFuelDebt||0)+fuel*min; while(z.powerFuelDebt>=1&&(save.resources.fuel||0)>0){ save.resources.fuel--; z.powerFuelDebt--; }
    if((save.resources.fuel||0)<=0&&z.powerFuelDebt>=1){ ps-=z.buildings.filter(b=>bdef(b.type).util==='power'&&bdef(b.type).fuelPerMin).reduce((s,b)=>s+bdef(b.type).supply,0); } }
  bizStats.power={supply:ps,demand:pd,ratio:pd?Math.min(1,ps/pd):1};
  bizStats.water={supply:ws,demand:wd,ratio:wd?Math.min(1,ws/wd):1};
  bizStats.bill=pd*B.powerBillPerUnitMin; z.coins-=bizStats.bill*min;
}
function utilityPenalty(a,b){
  const d=bdef(b.type); let p=0;
  if(d.house&&bizStats.power.ratio<1) p+=BIZ().outagePenalty*(1-bizStats.power.ratio);
  if(bizStats.water.ratio<1&&(d.water||speciesNeeds(DATA.speciesById[a.species]||{}).water)) p+=BIZ().dirtyWaterPenalty*(1-bizStats.water.ratio);
  return p;
}

/* ---------- 遊客：交通、捐款、退票、想法、行銷、貸款 ---------- */
function bizEconomy(visitors,ticketIncome,min){
  const z=save.zoo, B=BIZ();
  const stations=z.buildings.filter(b=>bdef(b.type).kind==='transport'&&isWorking(b)).length;
  bizStats.tram=stations>=2;
  bizStats.rides=bizStats.tram?visitors*B.rideShare*B.rideFare*bizStats.power.ratio:0;
  const boxes=Math.min(B.donationMaxBoxes,(z.props||[]).filter(p=>p.type==='donation_box').length);
  bizStats.donations=boxes*visitors*B.donationPerVisitorMin*(1+(opsStats.parts.rating?opsStats.parts.rating.conservation:0)/100);
  const sat=opsStats.satisfaction;
  bizStats.refund=sat<B.refundBelow?ticketIncome*(B.refundBelow-sat)/(B.refundBelow*2):0;
  // 貸款
  bizStats.loanPay=0;
  if(z.loan&&z.loan.left>0){ const pay=Math.min(z.loan.left,z.loan.perMin*min); z.loan.left-=pay; bizStats.loanPay=pay/Math.max(min,1e-6); z.coins-=pay; if(z.loan.left<=0){ z.loan=null; toast('貸款還清了'); } }
  z.coins+=(bizStats.rides+bizStats.donations-bizStats.refund)*min;
  thoughtsUpdate(visitors);
}
function campaignMult(){ const z=save.zoo, c=z.campaign; if(!c) return 1; if((z.clock||0)>c.until){ z.campaign=null; return 1; } const d=BIZ().campaigns.find(x=>x.id===c.id); return d?d.visitorMult:1; }
const tramSatBonus=()=>bizStats.tram?BIZ().tramSatisfaction:0;
function thoughtsUpdate(v){
  const z=save.zoo, n=opsStats.needs||{}, O=OPS(), T=[];
  const add=(cond,t,good)=>{ if(cond) T.push({t,good:!!good}); };
  add(n.restroom<0.6,'好想上廁所，廁所在哪裡？'); add(n.food<0.6,'肚子好餓，餐廳都排好長'); add(n.rest<0.6,'走好累，沒地方坐'); add(z.clean<50,'這裡好髒喔');
  add(z.ticket>O.ticketDefault*1.8,'門票有點貴'); add(z.animals.length<4,'動物好少'); add((z.escaped||[]).length,'剛剛有動物跑出來，好可怕！');
  add(bizStats.power.ratio<1,'室內館怎麼停電了'); add(bizStats.tram,'小火車好好玩！',true);
  const happy=z.animals.length?z.animals.filter(a=>(a.happy??60)>=75).length/z.animals.length:0;
  add(happy>0.6,'動物看起來好開心！',true); add(opsStats.parts.sat&&opsStats.parts.sat.education>40,'解說好有趣，學到好多',true);
  add((z.props||[]).length>25,'造景好漂亮',true);
  bizStats.thoughts=T;
}
/* 遊客頭上的想法泡泡 */
let bubbleT=0, bubbles=[];
function bubbleSprite(text,good){
  const c=document.createElement('canvas'); c.width=512; c.height=96; const x=c.getContext('2d');
  x.fillStyle=good?'rgba(230,250,232,.92)':'rgba(255,240,228,.92)'; x.strokeStyle='rgba(0,0,0,.25)'; x.lineWidth=3;
  if(x.roundRect){ x.beginPath(); x.roundRect(4,4,504,80,28); x.fill(); x.stroke(); } else x.fillRect(4,4,504,80);
  x.fillStyle='#1a1d22'; x.font='bold 34px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(text,256,46);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false})); s.scale.set(4,0.75,1); return s;
}
function updateBubbles(dt){
  bubbleT-=dt; if(!Q().bubbles){ for(const b of bubbles) b.p.m.remove(b.s); bubbles=[]; return; }
  for(let i=bubbles.length-1;i>=0;i--){ const b=bubbles[i]; b.life-=dt; if(b.life<=0||!b.p.m.parent){ b.p.m.remove(b.s); bubbles.splice(i,1); } }
  if(bubbleT>0||!zooPeople.length||!bizStats.thoughts.length) return;
  bubbleT=2.5; const p=zooPeople[Math.floor(Math.random()*zooPeople.length)], t=bizStats.thoughts[Math.floor(Math.random()*bizStats.thoughts.length)];
  if(bubbles.some(b=>b.p===p)) return;
  let s; try{ s=bubbleSprite(t.t,t.good); }catch(e){ return; } s.position.y=2.1; p.m.add(s); bubbles.push({p,s,life:4});
}

/* ---------- 園內小火車：在車站之間的高架軌道上繞圈 ---------- */
let tramGroup=null, tramCar=null, tramPath=[], tramS=0;
function rebuildTram(){
  if(tramGroup) zooRoot.remove(tramGroup); tramGroup=null; tramCar=null; tramPath=[];
  const st=save.zoo.buildings.filter(b=>bdef(b.type).kind==='transport').sort((a,b)=>a.uid<b.uid?-1:1).map(tileCenter);
  if(st.length<2) return;
  tramGroup=new THREE.Group(); zooRoot.add(tramGroup); const H=3.4, rail=M(0x4a4f56);
  const pts=st.map(c=>new THREE.Vector3(c.x,H,c.z)); if(pts.length>2) pts.push(pts[0].clone());
  for(let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1], L=a.distanceTo(b), mid=a.clone().add(b).multiplyScalar(0.5);
    const beam=box(0.5,0.25,L,rail); beam.position.copy(mid); beam.lookAt(b); tramGroup.add(beam);
    for(let k=1;k<Math.floor(L/6);k++){ const p=a.clone().lerp(b,k/Math.floor(L/6)); const pl=box(0.3,H,0.3,rail); pl.position.set(p.x,ZH(p.x,p.z)+H/2,p.z); tramGroup.add(pl); } }
  tramPath=pts.length>2?pts:[pts[0],pts[1],pts[0].clone()];
  tramCar=new THREE.Group(); const body=box(1.4,1.2,3,0xc8402a); body.position.y=0.8; tramCar.add(body);
  const roof=box(1.5,0.15,3.1,0xf2efe6); roof.position.y=1.5; tramCar.add(roof);
  for(const s of [-1,1]) for(let k=-1;k<=1;k++){ const w=box(0.05,0.45,0.6,new THREE.MeshBasicMaterial({color:0xffe8b0})); w.position.set(s*0.72,1.0,k*0.9); tramCar.add(w); }
  tramGroup.add(tramCar);
}
function updateTram(dt){
  if(!tramCar||tramPath.length<2) return;
  let total=0; const seg=[]; for(let i=0;i<tramPath.length-1;i++){ const L=tramPath[i].distanceTo(tramPath[i+1]); seg.push(L); total+=L; }
  tramS=(tramS+dt*4*bizStats.power.ratio)%total; let s=tramS, i=0; while(s>seg[i]){ s-=seg[i]; i++; }
  const a=tramPath[i], b=tramPath[i+1], p=a.clone().lerp(b,s/seg[i]);
  tramCar.position.set(p.x,p.y+0.15,p.z); tramCar.lookAt(b.x,p.y+0.15,b.z);
}

/* ---------- 交易中心 ---------- */
function refreshMarket(force){
  const z=save.zoo, B=BIZ(); ensureBiz();
  if(!force&&(z.clock||0)<z.market.refreshAt&&z.market.offers.length) return;
  const pool=DATA.species.filter(s=>s.spawn&&s.spawn.length&&((s.model&&MODELS[s.model])||s.body)), offers=[];
  const w={common:10,rare:5,endangered:2,legendary:0.4};
  while(offers.length<B.marketOffers&&pool.length){ let r=Math.random()*pool.reduce((s,x)=>s+(w[x.rarity]||0),0), pick=pool[0];
    for(const x of pool){ r-=(w[x.rarity]||0); if(r<=0){ pick=x; break; } }
    if(offers.some(o=>o.species===pick.id)) continue;
    const pr=B.prices[pick.rarity], stars=rollStars(pick), sex=Math.random()<0.5?'M':'F';
    offers.push({id:'o'+Math.random().toString(36).slice(2,8),species:pick.id,sex,stars,cost:{coins:Math.round(pr.coins*(0.7+stars*0.15)),...(pr.cp?{cp:pr.cp}:{})}}); }
  z.market={offers,refreshAt:(z.clock||0)+B.marketRefreshMinutes};
}
const cpAfford=c=>affordable(Object.fromEntries(Object.entries(c).filter(([k])=>k!=='cp')))&&(save.zoo.cp||0)>=(c.cp||0);
function cpPay(c,sign){ const rest={...c}; if(rest.cp){ save.zoo.cp+=sign*rest.cp; delete rest.cp; } pay(rest,sign); }
const cpText=c=>Object.entries(c).map(([k,v])=>k==='cp'?`保育點數 ${v}`:`${resName(k)} ${v}`).join('・');
function sellPrice(a){ const B=BIZ(), sp=DATA.speciesById[a.species], pr=B.prices[sp.rarity]; return {coins:Math.round(pr.coins*B.sellRatio*(0.6+a.stars*0.2)),cp:Math.round((pr.cp||1)*B.sellRatio*a.stars)}; }
function showMarket(msg){
  ensureBiz(); refreshMarket(); state='market';
  const z=save.zoo, offers=z.market.offers, stored=z.stored||[];
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>EXCHANGE · 動物交易中心</small>交易中心</h1><span class="savechip">保育點數 ${Math.floor(z.cp)}・金幣 ${Math.floor(z.coins)}</span></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <p class="zp-empty">跟其他避難所交換動物。保育點數來自野放、保育計畫和瀕危動物出生。名單約每 ${BIZ().marketRefreshMinutes} 分鐘更新一次。</p>
    <div class="sec-title"><span>可以領養的動物</span><button type="button" class="zmini" id="mkRefresh" ${(z.cp||0)>=BIZ().refreshCostCp?'':'disabled'}>花 ${BIZ().refreshCostCp} 保育點數換一批</button></div>
    <div class="shoplist">${offers.map(o=>{ const sp=DATA.speciesById[o.species], r=DATA.config.rarity[sp.rarity];
      return `<div class="shopcard"><div class="sc-main"><b>${o.sex==='M'?'♂':'♀'} ${esc(sp.name)} <span class="stars">${'★'.repeat(o.stars)}</span> <em style="color:${r.color}">${esc(r.name)}</em></b><span>${esc(sp.zone||'')}・適溫 ${sp.tempRange[0]}～${sp.tempRange[1]}°C${save.collection[sp.id]?'':'・圖鑑新物種'}</span></div>
        <button type="button" class="zmini add" data-buy="${o.id}" ${cpAfford(o.cost)?'':'disabled'}>${esc(cpText(o.cost))}</button></div>`; }).join('')||'<p class="zp-empty">目前沒有動物可以領養。</p>'}</div>
    <div class="sec-title"><span>送出倉庫裡的動物</span></div>
    <div class="shoplist">${stored.length?stored.map(a=>{ const p=sellPrice(a); return `<div class="shopcard"><div class="sc-main"><b>${a.sex==='M'?'♂':'♀'} ${esc(nameOf(a))} <span class="stars">${'★'.repeat(a.stars)}</span></b><span>${esc(genesTxt(a))}</span></div><button type="button" class="zmini" data-sell="${a.id}">換 ${esc(cpText(p))}</button></div>`; }).join('')
      :'<p class="zp-empty">倉庫是空的。在棲地面板按「移出」，動物就會進倉庫，可以在這裡送出。</p>'}</div>
    <button class="btn ghost" id="mkBack" type="button">回到園區</button></div>`;
  screenEl.querySelectorAll('[data-buy]').forEach(el=>el.onclick=()=>{ const i=z.market.offers.findIndex(o=>o.id===el.dataset.buy), o=z.market.offers[i]; if(!o||!cpAfford(o.cost)) return;
    cpPay(o.cost,-1); const a=newIndividual(o.species,null,{sex:o.sex,stars:o.stars}); a.genes=rollGenes(o.stars); z.stored.push(a); save.collection[o.species]=(save.collection[o.species]||0)+1; z.market.offers.splice(i,1); persist();
    showMarket(`領養了 ${DATA.speciesById[o.species].name}，牠在倉庫裡，打開棲地就能放進去`); });
  screenEl.querySelectorAll('[data-sell]').forEach(el=>el.onclick=()=>{ const i=z.stored.findIndex(a=>a.id===el.dataset.sell); if(i<0) return; const a=z.stored.splice(i,1)[0], p=sellPrice(a); cpPay(p,1); persist(); showMarket(`${nameOf(a)} 送到其他避難所了，換到 ${cpText(p)}`); });
  const rf=$('mkRefresh'); if(rf) rf.onclick=()=>{ if(z.cp<BIZ().refreshCostCp) return; z.cp-=BIZ().refreshCostCp; refreshMarket(true); persist(); showMarket('換了一批新的動物'); };
  $('mkBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}
function earnCp(n,why){ ensureBiz(); save.zoo.cp+=n; if(why) toast(`${why}：保育點數 +${n}`); }

/* ---------- 營運面板：財務分頁、員工訓練與指派 ---------- */
function financeHtml(){
  const z=save.zoo, B=BIZ(), inc=opsStats.income||{ticket:0,spend:0};
  const row=(n,v,neg)=>`<label>${n}<b class="num ${neg?'neg':''}">${neg?'-':'+'}${Math.abs(v).toFixed(1)}</b></label>`;
  const c=z.campaign&&BIZ().campaigns.find(x=>x.id===z.campaign.id);
  return `<div class="statline">每分鐘收支（金幣）</div>
    <div class="fin">${row('門票',inc.ticket)}${row('消費',inc.spend)}${row('小火車',bizStats.rides)}${row('捐款箱',bizStats.donations)}${bizStats.refund?row('退票',bizStats.refund,true):''}
      ${row('薪水',opsStats.salary*z.wage,true)}${row('電費',bizStats.bill,true)}${bizStats.loanPay?row('貸款還款',bizStats.loanPay,true):''}</div>
    <div class="statline">電力 ${bizStats.power.supply}/${bizStats.power.demand}${bizStats.power.ratio<1?'・<em>電力不足，室內館和設施效率下降</em>':''}・水處理 ${bizStats.water.supply}/${bizStats.water.demand}${bizStats.water.ratio<1?'・<em>水質變差，水生動物不舒服</em>':''}</div>
    <div class="sec-title"><span>行銷活動</span>${c?`<b>進行中：${esc(c.name)}・剩 ${Math.ceil(z.campaign.until-z.clock)} 分鐘</b>`:''}</div>
    ${B.campaigns.map(x=>`<div class="shopcard"><div class="sc-main"><b>${esc(x.name)}</b><span>遊客 +${Math.round((x.visitorMult-1)*100)}%・持續 ${x.minutes} 分鐘</span></div><button type="button" class="zmini add" data-camp="${x.id}" ${c||!affordable(x.cost)?'disabled':''}>${esc(costText(x.cost))}</button></div>`).join('')}
    <div class="sec-title"><span>貸款</span>${z.loan?`<b>還剩 ${Math.ceil(z.loan.left)} 金幣・每分鐘還 ${z.loan.perMin.toFixed(1)}</b>`:''}</div>
    ${z.loan?`<button type="button" class="zmini add" id="loanRepay" ${z.coins>=z.loan.left?'':'disabled'}>一次還清 ${Math.ceil(z.loan.left)}</button>`
      :B.loans.map(l=>`<div class="shopcard"><div class="sc-main"><b>借 ${l.amount} 金幣</b><span>要還 ${Math.round(l.amount*(1+l.interest))}（利息 ${Math.round(l.interest*100)}%），分 ${l.minutes} 分鐘自動扣款</span></div><button type="button" class="zmini" data-loan="${l.amount}">借款</button></div>`).join('')}`;
}
function staffExtraHtml(){
  const z=save.zoo, B=BIZ();
  return `<div class="statline">士氣 ${Math.round(z.morale)}${z.morale<B.quitBelow?'・<em>士氣太低，員工可能辭職</em>':''}・薪資水準
    ${B.wages.map(w=>`<button type="button" class="zmini${z.wage===w.mult?' add':''}" data-wage="${w.mult}">${esc(w.name)}</button>`).join('')}</div>
    ${DATA.staff.map(s=>{ const lv=staffLv(s.id), cost=B.trainCost[lv-1]; return `<div class="zp-row"><span>${esc(s.name)} 訓練 Lv${lv}（效率 ${Math.round(staffEff(s.id)*100)}%）</span>${cost?`<button type="button" class="zmini" data-train="${s.id}" ${affordable(cost)?'':'disabled'}>訓練：${esc(costText(cost))}</button>`:'<span class="sc-max">已滿級</span>'}</div>`; }).join('')}`;
}
function wireBizOps(){
  const z=save.zoo, B=BIZ();
  screenEl.querySelectorAll('[data-camp]').forEach(el=>el.onclick=()=>{ const c=B.campaigns.find(x=>x.id===el.dataset.camp); if(z.campaign||!affordable(c.cost)) return; pay(c.cost,-1); z.campaign={id:c.id,until:(z.clock||0)+c.minutes}; persist(); showOps(`開始${c.name}`); });
  screenEl.querySelectorAll('[data-loan]').forEach(el=>el.onclick=()=>{ const l=B.loans.find(x=>x.amount===+el.dataset.loan); z.coins+=l.amount; const total=l.amount*(1+l.interest); z.loan={left:total,perMin:total/l.minutes}; persist(); showOps(`借了 ${l.amount} 金幣`); });
  const rp=$('loanRepay'); if(rp) rp.onclick=()=>{ if(z.coins<z.loan.left) return; z.coins-=z.loan.left; z.loan=null; persist(); showOps('貸款還清了'); };
  screenEl.querySelectorAll('[data-wage]').forEach(el=>el.onclick=()=>{ z.wage=+el.dataset.wage; persist(); showOps(`薪資調整為${B.wages.find(w=>w.mult===z.wage).name}`); });
  screenEl.querySelectorAll('[data-train]').forEach(el=>el.onclick=()=>{ const id=el.dataset.train, cost=B.trainCost[staffLv(id)-1]; if(!cost||!affordable(cost)) return; pay(cost,-1); z.staffLv[id]=staffLv(id)+1; persist(); showOps(`${DATA.staffById[id].name}訓練到 Lv${z.staffLv[id]}`); });
}
/* 棲地面板：指派飼育員 */
function assignHtml(b){ const z=save.zoo, n=z.assign[b.uid]||0, used=Object.values(z.assign).reduce((a,c)=>a+c,0);
  return `<div class="zp-note">指派飼育員 <button type="button" class="zmini" data-asg="-1">－</button> <b class="num">${n}</b> <button type="button" class="zmini" data-asg="1" ${used<staffCount('keeper')?'':'disabled'}>＋</button>・照護 ${Math.round(habitatCoverage(b)*100)}%・全園已指派 ${used}/${staffCount('keeper')}</div>`; }
function wireAssign(b){ const z=save.zoo;
  $('zPanel').querySelectorAll('[data-asg]').forEach(el=>el.onclick=()=>{ const d=+el.dataset.asg, used=Object.values(z.assign).reduce((a,c)=>a+c,0);
    if(d>0&&used>=staffCount('keeper')) return; z.assign[b.uid]=Math.max(0,(z.assign[b.uid]||0)+d); if(!z.assign[b.uid]) delete z.assign[b.uid]; simulate(0); persist(); openHabitatPanel(b); }); }
