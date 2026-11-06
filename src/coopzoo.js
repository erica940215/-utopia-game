/* =========================================================
   合營園區：兩人（或更多人）一起經營同一座動物園
   - 資料存在 Supabase 的 coop_zoos；成員在 coop_members
   - 在線成員中排序第一的人當「主機」：只有主機跑模擬，每隔幾秒把園區狀態廣播給其他人
   - 其他人的操作（蓋建築、放動物、雇員工…）算成差異送給主機合併
   - 只有一人在線時就是主機；沒人在線時暫停，下次有人上線時補算（最多 8 小時）
   ========================================================= */
let coopZoo=null;   // {id,code,name,ch,host,members,base,gotSnap,uid,dbT,snapT}
const CZ_LIST={buildings:'uid',props:'uid',animals:'id',stored:'id',escaped:'id'};
const CZ_WHOLE=['terrain','unplaced','staff','ticket','assign','market','campaign','loan','tech','know','cons','wage','staffLv','memorial','ach'];
const CZ_DELTA=['coins','research','cp'];
const CZ_SAVE_WHOLE=['upgrades','gear','train','map','lore','food','bosses'];
const czKey=()=>coopId+'-'+((sbUser&&sbUser.id)||'x');
const jsonEq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const deep=o=>JSON.parse(JSON.stringify(o));
function czState(){ const o={zoo:save.zoo,resources:save.resources,collection:save.collection,runs:save.runs||0}; for(const k of CZ_SAVE_WHOLE) o[k]=save[k]; return o; }
function czLoadState(d){ save.resources=d.resources||{}; save.collection=d.collection||{}; save.zoo=d.zoo; save.runs=d.runs||0; for(const k of CZ_SAVE_WHOLE) if(d[k]!==undefined) save[k]=d[k]; }

/* ---------- 建立、加入、列出 ---------- */
async function createCoopZoo(name){
  const keep=save, s=emptySave(); s.mode='coop'; save=s; ensureZoo(); ensureOps(); ensureResearch(); s.zoo.unplaced={}; s.zoo.coins=WLD().coopStartCoins||1500; save=keep;
  const {data,error}=await sb.rpc('create_coop_zoo',{p_name:name,p_data:{zoo:s.zoo,resources:{feed:30,fuel:10,scrap:30},collection:{}},p_member_name:coopName()});
  if(error) throw error; const row=Array.isArray(data)?data[0]:data; return row;
}
async function joinCoopZoo(code){ const {data,error}=await sb.rpc('join_coop_zoo',{p_code:code,p_member_name:coopName()}); if(error) throw error; return data; }
async function myCoopZoos(){ const {data,error}=await sb.from('coop_zoos').select('id,code,name,updated_at').order('updated_at',{ascending:false}); if(error) throw error; return data||[]; }
async function coopZooHtml(){
  if(!sb) return '<p class="zp-empty">合營園區需要在遊戲網站上玩（Claude 裡的版本不能連線）。</p>';
  if(!sbUser) return '<p class="zp-empty">合營園區要先登入：到「圖鑑・倉庫」輸入 Email 登入。</p>';
  let list=[]; try{ list=await myCoopZoos(); }catch(e){}
  return `<div class="shoplist">${list.map(r=>`<div class="shopcard"><div class="sc-main"><b>${esc(r.name)}</b><span>邀請碼 <b class="num">${esc(r.code)}</b>・上次營運 ${new Date(r.updated_at).toLocaleString('zh-TW')}</span></div><button type="button" class="zmini add" data-czgo="${r.id}">進入</button></div>`).join('')||'<p class="zp-empty">還沒有合營園區。</p>'}</div>
    <div class="zp-btns"><input id="czName" class="coopin wide" maxlength="16" placeholder="新園區名稱"><button type="button" class="zmini add" id="czNew">建立合營園區</button></div>
    <div class="zp-btns"><input id="czCode" class="coopin" maxlength="6" placeholder="邀請碼"><button type="button" class="zmini" id="czJoin">用邀請碼加入</button></div>`;
}
function wireCoopZoo(){
  screenEl.querySelectorAll('[data-czgo]').forEach(el=>el.onclick=()=>enterCoopZoo(el.dataset.czgo));
  const n=$('czNew'); if(n) n.onclick=async()=>{ n.disabled=true; try{ const r=await createCoopZoo(($('czName').value.trim()||'我們的動物園').slice(0,16)); toast(`建好了！邀請碼 ${r.code}，傳給朋友就能一起經營`); enterCoopZoo(r.id); }catch(e){ toast('建立失敗：'+(e.message||e)); n.disabled=false; } };
  const j=$('czJoin'); if(j) j.onclick=async()=>{ const c=$('czCode').value.trim().toUpperCase(); if(c.length!==6) return; try{ const id=await joinCoopZoo(c); enterCoopZoo(id); }catch(e){ toast('找不到這個邀請碼'); } };
}

/* ---------- 進入與離開 ---------- */
async function enterCoopZoo(id){
  const {data,error}=await sb.from('coop_zoos').select('id,code,name,data').eq('id',id).single();
  if(error||!data){ toast('讀取合營園區失敗'); return; }
  if(activeSlot!=='career'&&activeSlot!=='visit'&&activeSlot!=='coop'&&careerSave){ careerSave.slots=careerSave.slots||{}; careerSave.slots[activeSlot]=save; }
  leaveCoopZoo();
  activeSlot='coop';
  const s=emptySave(); s.mode='coop'; save=s; czLoadState(data.data);
  coopZoo={id:data.id,code:data.code,name:data.name,host:false,members:[],gotSnap:false,uid:1e6*(1+Math.floor(Math.random()*900)),dbT:0,snapT:0};
  coopZoo.base=deep(czState());
  save.zoo.nextUid=coopZoo.uid;
  const ch=sb.channel('czoo-'+data.id,{config:{broadcast:{self:false},presence:{key:czKey()}}}); coopZoo.ch=ch;
  ch.on('broadcast',{event:'snap'},({payload})=>czApplySnap(payload));
  ch.on('broadcast',{event:'edit'},({payload})=>{ if(coopZoo&&coopZoo.host){ czMerge(payload); czBroadcast(true); } });
  ch.on('presence',{event:'sync'},()=>czPresence());
  coopAttachZoo(ch);
  ch.on('presence',{event:'join'},()=>{ if(coopZoo&&coopZoo.host) czBroadcast(true); });
  ch.subscribe(async st=>{ if(st==='SUBSCRIBED'){ coopZoo.subscribed=true; await ch.track({name:coopName(),inZoo:true}); } });
  zooBaseBuilt&&clearPeople(); enterZoo();
  toast(`進入合營園區「${data.name}」・邀請碼 ${data.code}`);
}
function leaveCoopZoo(){
  if(!coopZoo) return;
  const z=coopZoo; if(z.host) czSaveDb(true);
  try{ sb.removeChannel(z.ch); }catch(e){} coopZoo=null; if(coop&&coop.zoo){ for(const p of coop.peers.values()) p.g.parent&&p.g.parent.remove(p.g); coop=null; }
}
function czPresence(){
  if(!coopZoo) return;
  const st=coopZoo.ch.presenceState(), keys=Object.keys(st).sort();
  coopZoo.members=keys.map(k=>st[k][0]&&st[k][0].name||'?');
  const inZoo=keys.filter(k=>st[k][0]&&st[k][0].inZoo!==false);   // 優先讓在園區裡的人當主機（去遠征的人不跑園區模擬）
  const wasHost=coopZoo.host; coopZoo.host=(inZoo.length?inZoo:keys)[0]===czKey();
  if(coopZoo.host&&!wasHost){
    if(!coopZoo.gotSnap){ const away=catchUp(); if(away&&away.minutes>=1) toast(`沒人在的 ${away.minutes} 分鐘裡：門票 +${away.coins} 金幣`); }
    save.zoo.nextUid=Math.max(save.zoo.nextUid||2,2); czBroadcast(true);
  }
  czHud();
}
function czHud(){
  const t=$('zModeTag'); if(!coopZoo||!t) return;
  t.hidden=false; t.textContent=`合營：${coopZoo.name}・邀請碼 ${coopZoo.code}・在線 ${coopZoo.members.length} 人（${coopZoo.members.join('、')}）${coopZoo.host?'・你是主機':''}`;
}

/* ---------- 主機：廣播狀態、寫資料庫 ---------- */
function czBroadcast(force){
  const z=coopZoo; if(!z||!z.host) return; const now=performance.now();
  if(!force&&now-z.snapT<3000) return; z.snapT=now;
  const stats={zooStats:{...zooStats},opsStats:{coverage:opsStats.coverage,satisfaction:opsStats.satisfaction,rating:opsStats.rating,score:opsStats.score,parts:opsStats.parts,needs:opsStats.needs,salary:opsStats.salary,income:opsStats.income,unpaid:opsStats.unpaid,theft:opsStats.theft,endangered:opsStats.endangered},
    bizStats:{power:bizStats.power,water:bizStats.water,bill:bizStats.bill,rides:bizStats.rides,donations:bizStats.donations,refund:bizStats.refund,loanPay:bizStats.loanPay,thoughts:bizStats.thoughts,tram:bizStats.tram}};
  z.ch.send({type:'broadcast',event:'snap',payload:{...czState(),stats}});
  czSaveDb(false);
}
async function czSaveDb(force){
  const z=coopZoo; if(!z||!z.host) return; const now=performance.now();
  if(!force&&now-z.dbT<20000) return; z.dbT=now;
  try{ await sb.from('coop_zoos').update({data:deep(czState()),updated_at:new Date().toISOString()}).eq('id',z.id); }catch(e){}
}

/* ---------- 其他成員：套用主機狀態 ---------- */
function czApplySnap(p){
  const z=coopZoo; if(!z||z.host) return;
  const structChanged=!z.gotSnap||!jsonEq(p.zoo.buildings,save.zoo.buildings)||!jsonEq(p.zoo.props,save.zoo.props)||!jsonEq(p.zoo.terrain,save.zoo.terrain);
  const animalsChanged=!jsonEq(p.zoo.animals.map(a=>a.id+a.habitat),save.zoo.animals.map(a=>a.id+a.habitat));
  czLoadState(p); save.zoo.nextUid=z.uid;
  Object.assign(zooStats,p.stats.zooStats); Object.assign(opsStats,p.stats.opsStats); Object.assign(bizStats,p.stats.bizStats);
  z.base=deep(czState()); z.gotSnap=true;
  if(structChanged){ ensureTerrain(); rebuildZoo(); } else if(animalsChanged) rebuildZooAnimals();
  updateZooHud(); czHud();
  if(!$('zPanel').hidden&&zSelUid){ const b=findB(zSelUid); if(b&&bdef(b.type).kind==='habitat') openHabitatPanel(b); }
}
/* 跟上一次的狀態比，算出自己改了什麼 */
function czDiff(){
  const z=coopZoo, base=z.base, cur=czState(), d={lists:{},whole:{},delta:{},res:{},col:{}}; let any=false;
  for(const [k,key] of Object.entries(CZ_LIST)){
    const a=(base.zoo[k]||[]), b=(cur.zoo[k]||[]), am=new Map(a.map(x=>[x[key],x])), bm=new Map(b.map(x=>[x[key],x]));
    const add=b.filter(x=>!am.has(x[key])), del=a.filter(x=>!bm.has(x[key])).map(x=>x[key]), mod=[];
    for(const x of b){ const o=am.get(x[key]); if(!o||jsonEq(o,x)) continue; const f={}; for(const kk of Object.keys(x)) if(!jsonEq(o[kk],x[kk])) f[kk]=x[kk]; if(k==='animals'){ for(const s of ['food','happy','health','sick','preg','cooldownUntil']) delete f[s]; } if(Object.keys(f).length) mod.push([x[key],f]); }
    if(add.length||del.length||mod.length){ d.lists[k]={add,del,mod}; any=true; }
  }
  for(const k of CZ_WHOLE) if(!jsonEq(base.zoo[k],cur.zoo[k])){ d.whole[k]=cur.zoo[k]; any=true; }
  for(const k of CZ_DELTA){ const v=(cur.zoo[k]||0)-(base.zoo[k]||0); if(Math.abs(v)>1e-6){ d.delta[k]=v; any=true; } }
  for(const k of new Set([...Object.keys(base.resources),...Object.keys(cur.resources)])){ const v=(cur.resources[k]||0)-(base.resources[k]||0); if(Math.abs(v)>1e-6){ d.res[k]=v; any=true; } }
  for(const k of Object.keys(cur.collection)) if((cur.collection[k]||0)!==(base.collection[k]||0)){ d.col[k]=(cur.collection[k]||0)-(base.collection[k]||0); any=true; }
  d.save={}; for(const k of CZ_SAVE_WHOLE) if(!jsonEq(base[k],cur[k])){ d.save[k]=cur[k]; any=true; }
  if(cur.runs!==base.runs){ d.runs=cur.runs-base.runs; any=true; }
  return any?d:null;
}
function czSendEdit(){ const z=coopZoo; if(!z||z.host) return; const d=czDiff(); if(!d) return; z.ch.send({type:'broadcast',event:'edit',payload:d}); z.base=deep(czState()); }
/* 主機合併別人的修改 */
function czMerge(d){
  const z=save.zoo;
  for(const [k,c] of Object.entries(d.lists||{})){ const key=CZ_LIST[k]; z[k]=z[k]||[];
    z[k]=z[k].filter(x=>!c.del.includes(x[key]));
    for(const x of c.add) if(!z[k].some(y=>y[key]===x[key])) z[k].push(x);
    for(const [id,f] of c.mod){ const t=z[k].find(y=>y[key]===id); if(t) Object.assign(t,f); } }
  for(const [k,v] of Object.entries(d.whole||{})) z[k]=v;
  for(const [k,v] of Object.entries(d.delta||{})) z[k]=(z[k]||0)+v;
  for(const [k,v] of Object.entries(d.res||{})) save.resources[k]=(save.resources[k]||0)+v;
  for(const [k,v] of Object.entries(d.col||{})) save.collection[k]=(save.collection[k]||0)+v;
  for(const [k,v] of Object.entries(d.save||{})) save[k]=v;
  if(d.runs) save.runs=(save.runs||0)+d.runs;
  migrateAnimals(); envDirty(); rebuildZoo(); simulate(0); updateZooHud();
}
/* persist() 在合營園區裡改走這裡 */
function czPersist(){ if(!coopZoo) return; if(coopZoo.host) czBroadcast(true); else czSendEdit(); }

/* ---------- 從自己的生涯園區送東西過來 ---------- */
function showCoopGift(msg){
  const home=careerSave&&careerSave.zoo, z=save.zoo; state='gift'; screenEl.hidden=false;
  const stored=(home&&home.stored)||[];
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>SUPPLY · 從我的園區支援</small>送東西過來</h1></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <p class="zp-empty">多人記錄檔的遠征收穫會直接進這座園區；也可以從自己單人記錄檔的倉庫送動物和物資過來支援。</p>
    <div class="sec-title"><span>我的倉庫動物</span></div>
    <div class="shoplist">${stored.length?stored.map(a=>`<div class="shopcard"><div class="sc-main"><b>${a.sex==='M'?'♂':'♀'} ${esc(DATA.speciesById[a.species].name)} <span class="stars">${'★'.repeat(a.stars)}</span></b></div><button type="button" class="zmini add" data-gift="${a.id}">送過來</button></div>`).join('')
      :'<p class="zp-empty">生涯園區的倉庫是空的。回自己的園區，在棲地面板按「移出」就會進倉庫。</p>'}</div>
    <div class="sec-title"><span>物資</span></div>
    <div class="zp-btns">${DATA.items.map(i=>`<button type="button" class="zmini" data-giftr="${i.id}" ${(careerSave.resources[i.id]||0)>=10?'':'disabled'}>送 10 ${esc(i.name)}（我有 ${Math.floor(careerSave.resources[i.id]||0)}）</button>`).join('')}
      <button type="button" class="zmini" data-giftc="1" ${home&&home.coins>=500?'':'disabled'}>送 500 金幣（我有 ${Math.floor(home?home.coins:0)}）</button></div>
    <button class="btn ghost" id="giftBack" type="button">回到合營園區</button></div>`;
  screenEl.querySelectorAll('[data-gift]').forEach(el=>el.onclick=()=>{ const i=home.stored.findIndex(a=>a.id===el.dataset.gift); if(i<0) return;
    const a=home.stored.splice(i,1)[0]; a.id='a'+(z.nextUid++); a.habitat=null; z.stored=z.stored||[]; z.stored.push(a); save.collection[a.species]=(save.collection[a.species]||0)+1; persist(); showCoopGift(`送了${DATA.speciesById[a.species].name}過來，在棲地面板就能放進去`); });
  screenEl.querySelectorAll('[data-giftr]').forEach(el=>el.onclick=()=>{ const k=el.dataset.giftr; if((careerSave.resources[k]||0)<10) return; careerSave.resources[k]-=10; save.resources[k]=(save.resources[k]||0)+10; persist(); showCoopGift(); });
  screenEl.querySelectorAll('[data-giftc]').forEach(el=>el.onclick=()=>{ if(!home||home.coins<500) return; home.coins-=500; z.coins+=500; persist(); showCoopGift(); });
  $('giftBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}

/* ---------- 多人記錄檔裡一起遠征：用同一個頻道同步位置、撿東西、Boss 血量 ---------- */
let czPendingExp=null;
function coopAttachZoo(ch){
  coop={code:'zoo',ch,host:false,peers:new Map(),zoo:true};
  ch.on('broadcast',{event:'start'},({payload})=>{ if(state==='play'||state==='confirm') return;
    czPendingExp={node:payload.node,seed:payload.seed,by:payload.by,at:payload.at,until:performance.now()+90000};
    const b=$('zJoinExp'); if(b){ b.hidden=false; b.textContent=`${payload.by||'隊友'} 出發去${payload.node.name}了，按這裡一起去`; } toast(`${payload.by||'隊友'} 出發去${payload.node.name}了，可以一起去！`); });
  ch.on('broadcast',{event:'pos'},({payload})=>coopPeer(payload));
  ch.on('broadcast',{event:'take'},({payload})=>{ if(state!=='play') return; const it=interactables.find(i=>!i.done&&i.type===payload.t&&Math.hypot(i.pos.x-payload.x,i.pos.z-payload.z)<0.6); if(it){ it.done=true; world.remove(it.group); } });
  ch.on('broadcast',{event:'boss'},({payload})=>{ if(netAuth&&boss&&!boss.dead&&state==='play') damageBoss(payload.d); });
  netHandlers(ch);
}
function czJoinPending(){
  const p=czPendingExp; $('zJoinExp').hidden=true; if(!p||performance.now()>p.until){ toast('隊友已經出發太久了'); return; }
  czPendingExp=null; if(coop) coop.host=false; czSetInZoo(false);
  simulate(0); persist(); zooActive=false; $('zooUI').hidden=true; $('zPanel').hidden=true; screenEl.hidden=true; startExpedition(p.node,p.seed,p.at);
}
function czSetInZoo(v){ const z=coopZoo; if(!z||!z.subscribed) return; if(!v&&z.host){ czBroadcast(true); czSaveDb(true); } z.ch.track({name:coopName(),inZoo:v}); }
