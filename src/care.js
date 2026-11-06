/* =========================================================
   動物照護細節：棲地需求、豐富化、圍欄與脫逃、基因、打架與避孕
   數值在 config.care；豐富化物件是 props.json 裡 cat 為 enrich 的物件
   ========================================================= */
const CARE=()=>DATA.config.care;
/* ---------- 棲地環境：從地形、水、物件、周圍步道算出來 ---------- */
function habitatRect(b){ const d=bdef(b.type), c=tileCenter(b), hw=d.size[0]*TS()/2, hd=d.size[1]*TS()/2; return {x0:c.x-hw,x1:c.x+hw,z0:c.z-hd,z1:c.z+hd,tiles:d.size[0]*d.size[1]}; }
let envCache=new Map(), envCacheT=-1;
function habitatEnv(b){
  const key=b.uid; if(envCacheT===zEnvStamp&&envCache.has(key)) return envCache.get(key);
  if(envCacheT!==zEnvStamp){ envCache.clear(); envCacheT=zEnvStamp; }
  const r=habitatRect(b), T=save.zoo.terrain, paints=TRN().paints, cnt=new Array(paints.length).fill(0); let water=0, n=0;
  if(T) for(let x=r.x0+0.5;x<r.x1;x+=1) for(let z=r.z0+0.5;z<r.z1;z+=1){
    const {fi,fj}=terrXY(x,z), i=Math.round(fi), j=Math.round(fj); if(i<0||j<0||i>=zTerrN||j>=zTerrN) continue;
    n++; if(T.h[tIdx(i,j)]<TRN().waterLevel) water++; else cnt[T.p[tIdx(i,j)]||0]++;
  }
  const inside=(save.zoo.props||[]).filter(p=>p.x>r.x0&&p.x<r.x1&&p.z>r.z0&&p.z<r.z1);
  const foliage=inside.filter(p=>{ const d=pdef(p.type); return d&&d.cat==='nature'&&!/rock|log|stump/.test(d.kind); }).length;
  const shelter=inside.some(p=>{ const d=pdef(p.type); return d&&(/rock_l|log|stump|cave/.test(d.kind)||(d.likes&&d.likes.shelter)||/wall|roof/.test(d.kind)); });
  const enrich=[...new Set(inside.map(p=>pdef(p.type)).filter(d=>d&&d.cat==='enrich').map(d=>d.id))];
  // 遊客壓力：棲地外圍一格內的步道與設施格數 / 周長
  const d=bdef(b.type); let edge=0;
  for(const o of save.zoo.buildings){ const od=bdef(o.type); if(od.kind!=='path'&&od.kind!=='facility') continue;
    for(let ox=o.x;ox<o.x+od.size[0];ox++) for(let oz=o.z;oz<o.z+od.size[1];oz++)
      if(ox>=b.x-1&&ox<=b.x+d.size[0]&&oz>=b.z-1&&oz<=b.z+d.size[1]&&!(ox>=b.x&&ox<b.x+d.size[0]&&oz>=b.z&&oz<b.z+d.size[1])) edge++; }
  const per=2*(d.size[0]+d.size[1])+4;
  const env={tiles:r.tiles,ground:Object.fromEntries(paints.map((p,i)=>[p.id,n?cnt[i]/n:0])),water:n?water/n:0,foliage,foliageDensity:foliage/(r.tiles/4),shelter,enrich,pressure:Math.min(1,edge/per)};
  envCache.set(key,env); return env;
}
let zEnvStamp=0; const envDirty=()=>{ zEnvStamp++; };
/* ---------- 物種需求（從類別、體型、展區、名稱推出來，不必逐一填資料） ---------- */
function speciesNeeds(sp){
  const C=CARE(), size=(sp.body&&sp.body.size)||1;
  const space=sp.category==='bird'?1.5:sp.category==='mammal'?(size<0.7?2:size<1.2?3:size<1.8?5:8):1;
  return { space, ground:C.groundByZone[sp.zone]||C.groundByZone._default,
    water:C.waterNames.some(k=>sp.name.includes(k)), foliage:C.foliageByZone[sp.zone]??C.foliageByZone._default,
    shelter:sp.social==='獨居'||sp.rarity==='endangered'||sp.rarity==='legendary', shy:sp.social==='獨居',
    solitary:sp.social==='獨居' };
}
/* 回傳這種動物在這座棲地的每項需求檢查 */
function habitatChecks(b,sp){
  const d=bdef(b.type), C=CARE(), P=C.needPenalty, env=habitatEnv(b), need=speciesNeeds(sp), list=[];
  const same=save.zoo.animals.filter(a=>a.habitat===b.uid&&a.species===sp.id), adults=same.filter(isAdult).length;
  const used=save.zoo.animals.filter(a=>a.habitat===b.uid).reduce((s,a)=>s+speciesNeeds(DATA.speciesById[a.species]).space*(isAdult(a)?1:0.5),0);
  list.push({k:'space',label:`空間 已用 ${Math.ceil(used)}/${Math.round(env.tiles)} 格`,ok:used<=env.tiles,pen:P.space*Math.min(1,Math.max(0,used/env.tiles-1))});
  if(!d.indoor){
    const g=need.ground.reduce((s,id)=>s+(env.ground[id]||0),0);
    const gn=need.ground.map(id=>TRN().paints.find(p=>p.id===id).name).join('、');
    list.push({k:'ground',label:`地面要${gn}（${Math.round(g*100)}%）`,ok:g>=C.groundNeed,pen:g>=C.groundNeed?0:P.ground});
    if(need.water) list.push({k:'water',label:`要有水（${Math.round(env.water*100)}%）`,ok:env.water>=C.waterNeed,pen:env.water>=C.waterNeed?0:P.water});
    if(need.foliage) list.push({k:'foliage',label:`植物 ${env.foliage} 株（需要 ${Math.ceil(need.foliage*env.tiles/4)}）`,ok:env.foliageDensity>=need.foliage,pen:env.foliageDensity>=need.foliage?0:P.foliage});
    list.push({k:'pressure',label:`遊客壓力 ${Math.round(env.pressure*100)}%`,ok:env.pressure<=(need.shy?0.5:0.85),pen:env.pressure<=(need.shy?0.5:0.85)?0:P.pressure});
  }
  if(need.shelter) list.push({k:'shelter',label:'需要躲藏處（大石頭、木頭、岩洞、牆）',ok:env.shelter,pen:env.shelter?0:P.shelter});
  if(need.solitary&&adults>1){ const pair=same.filter(isAdult).every(a=>true)&&adults===2&&same.filter(isAdult).some(a=>a.sex==='M')&&same.filter(isAdult).some(a=>a.sex==='F');
    list.push({k:'solitary',label:'獨居動物，太多隻住一起會有壓力',ok:pair,pen:pair?0:P.solitary}); }
  return list;
}
function enrichBonus(b,sp){
  const C=CARE(), env=habitatEnv(b);
  const liked=env.enrich.map(id=>pdef(id)).filter(d=>{ const L=d.likes||{}; return (!L.cats||L.cats.includes(sp.category))&&(!L.diets||L.diets.some(x=>(sp.diet||'').includes(x)))&&(!L.bodies||L.bodies.includes(sp.body&&sp.body.type)); });
  return {n:liked.length,bonus:Math.min(C.enrichMax,liked.length*C.enrichPerItem),names:liked.map(d=>d.name)};
}
/* 給 simulate 用：需求扣分 − 豐富化加分 */
function careHappyDelta(a,b){
  const sp=DATA.speciesById[a.species]; if(!sp) return 0;
  const pen=Math.min(30,habitatChecks(b,sp).reduce((s,c)=>s+c.pen,0));
  return enrichBonus(b,sp).bonus-pen;
}

/* ---------- 圍欄與脫逃 ---------- */
const fenceLv=b=>b.fence||1;
function fenceNeed(sp){ const size=(sp.body&&sp.body.size)||1;
  if(sp.body&&sp.body.type==='primate') return 3;
  if(sp.category!=='mammal') return 1;
  if(size>=1.6||((sp.diet||'').includes('肉')&&size>=1)) return 2;
  return 1; }
let zooEscapeLog=[];
function escapeStep(min){
  const z=save.zoo, C=CARE(); z.escaped=z.escaped||[];
  for(const a of [...z.animals]){
    const b=findB(a.habitat), sp=DATA.speciesById[a.species]; if(!b||!sp||bdef(b.type).indoor) continue;
    const gap=Math.max(0,fenceNeed(sp)-fenceLv(b)), p=gap*C.escapePerMinPerLevel+(isWorking(b)?0:C.escapeBrokenPerMin);
    if(p>0&&Math.random()<p*min){ z.animals.splice(z.animals.indexOf(a),1); delete a.preg; a.escapedAt=z.clock; a.from=b.uid; z.escaped.push(a); zooEscapeLog.push(a); }
  }
  // 保全與飼育員把逃走的動物抓回來
  const rate=(staffCount('security')*C.recapturePerSecurity+staffCount('keeper')*C.recapturePerKeeper)*min;
  for(const a of [...z.escaped]){
    if(Math.random()<rate){ z.escaped.splice(z.escaped.indexOf(a),1); const b=findB(a.from); const room=b&&z.animals.filter(x=>x.habitat===b.uid).length<bdef(b.type).capacity;
      if(room){ a.habitat=b.uid; z.animals.push(a); } else { a.habitat=null; z.stored.push(a); } toast(`${nameOf(a)} 被抓回來了`); }
    else if(z.clock-a.escapedAt>C.escapeLostMinutes){ z.escaped.splice(z.escaped.indexOf(a),1); toast(`${nameOf(a)} 跑進荒野，再也找不到了`); }
  }
}
const escapeAttract=()=>Math.pow(CARE().escapeAttractMult,(save.zoo.escaped||[]).length);

/* ---------- 基因：體型、壽命、生育力、免疫力（0～100） ---------- */
const GENE_KEYS=[['size','體型'],['life','壽命'],['fert','生育'],['immune','免疫']];
function rollGenes(stars){ const g={}; for(const [k] of GENE_KEYS) g[k]=Math.max(5,Math.min(100,Math.round(stars*16+12+(Math.random()*2-1)*15))); return g; }
function inheritGenes(m,f,inbred){ const C=CARE().genes, g={};
  for(const [k] of GENE_KEYS){ const pm=(m.genes||rollGenes(m.stars||2))[k], pf=(f.genes||rollGenes(f.stars||2))[k];
    g[k]=Math.max(5,Math.min(100,Math.round((pm+pf)/2+(Math.random()*2-1)*C.mutation-(inbred?C.inbreedLoss:0)))); }
  return g; }
const gene=(a,k)=>(a.genes&&a.genes[k])??50;
const geneSizeMult=a=>0.85+gene(a,'size')/100*0.3;
const geneLifeMult=a=>0.8+gene(a,'life')/100*0.4;
const geneFertMult=a=>0.5+gene(a,'fert')/100;
const geneSickMult=a=>1.5-gene(a,'immune')/100;
const genesTxt=a=>GENE_KEYS.map(([k,n])=>`${n} ${gene(a,k)}`).join('・');

/* ---------- 打架 ---------- */
function fightStep(min){
  const z=save.zoo, C=CARE(), groups=new Map();
  for(const a of z.animals){ if(!isAdult(a)) continue; const k=a.habitat+'|'+a.species; if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(a); }
  for(const list of groups.values()){
    const m=list.filter(a=>a.sex==='M'), f=list.length-m.length; if(m.length<2) continue;
    const sp=DATA.speciesById[list[0].species];
    if(!(sp.social==='獨居'||m.length>Math.max(1,f))) continue;
    if(Math.random()<C.fightChancePerMin*min*(m.length-1)){ const v=m[Math.floor(Math.random()*m.length)];
      v.happy=Math.max(0,(v.happy??60)-C.fightHappy); v.health=Math.max(5,(v.health??100)-C.fightHealth);
      toast(`${sp.name}的公獸打架了，${nameOf(v)} 受了傷。公的太多時，可以移出幾隻`); }
  }
}

/* ---------- 棲地面板用的 HTML ---------- */
function habitatCareHtml(b){
  const d=bdef(b.type), z=save.zoo, sps=[...new Set(z.animals.filter(a=>a.habitat===b.uid).map(a=>a.species))].map(id=>DATA.speciesById[id]).filter(Boolean);
  const F=CARE().fences, lv=fenceLv(b), next=F.find(f=>f.lv===lv+1);
  const need=Math.max(1,...sps.map(fenceNeed));
  let html=d.indoor?'':`<div class="zp-note">圍欄：${esc(F[lv-1].name)}${need>lv?`・<em>需要${esc(F[need-1].name)}，動物可能會逃走</em>`:''}${next?` <button type="button" class="zmini add" data-fence="${b.uid}" ${affordable(next.cost)?'':'disabled'}>升級成${esc(next.name)}（${esc(costText(next.cost))}）</button>`:''}</div>`;
  for(const sp of sps){
    const checks=habitatChecks(b,sp), en=enrichBonus(b,sp);
    html+=`<div class="zp-note"><b>${esc(sp.name)}的需求</b><div class="needs">${checks.map(c=>`<span class="${c.ok?'ok':'bad'}">${c.ok?'✔':'✗'} ${esc(c.label)}</span>`).join('')}
      <span class="${en.n?'ok':''}">豐富化 +${en.bonus}${en.n?`（${esc(en.names.join('、'))}）`:'：到「豐富化」分頁放玩具'}</span></div></div>`;
  }
  return html;
}
function wireHabitatCare(b){
  const el=$('zPanel').querySelector('[data-fence]'); if(!el) return;
  el.onclick=()=>{ const next=CARE().fences.find(f=>f.lv===fenceLv(b)+1); if(!next||!affordable(next.cost)) return; pay(next.cost,-1); b.fence=next.lv; persist(); rebuildZoo(); openHabitatPanel(b); toast(`圍欄升級成${next.name}`); };
}
