/* =========================================================
   研究所：技術研究、物種研究、保育計畫
   技術在 data/research.json；物種研究與保育的數值在 config.speciesResearch / config.conservation
   ========================================================= */
function ensureResearch(){
  const z=save.zoo; if(!z) return;
  z.tech=z.tech||{}; z.know=z.know||{}; z.cons=z.cons||{};
}
/* 已完成技術的效果合併（乘數相乘、加值相加） */
function RF(){
  const out={feedEfficiency:1,happinessBonus:0,sickChanceMult:1,breedChanceMult:1,adultMinutesMult:1,keeperCapacityMult:1,repairMult:1,cleanMult:1,
    visitorMult:1,priceElasticityMult:1,expDrainMult:1,expWraithMult:1,expContainerBonus:0};
  const done=(save.zoo&&save.zoo.tech)||{};
  for(const r of DATA.research){ if(!done[r.id]) continue;
    for(const [k,v] of Object.entries(r.effects||{})){ if(k.endsWith('Bonus')) out[k]+=v; else out[k]*=v; } }
  return out;
}
const techDone=id=>!!(save.zoo&&save.zoo.tech&&save.zoo.tech[id]);
const buildingUnlocked=d=>!d.requires||techDone(d.requires);
const knowLevel=id=>(save.zoo&&save.zoo.know&&save.zoo.know[id])||0;
function knowCost(sp){ const C=DATA.config.speciesResearch, lv=knowLevel(sp.id); if(lv>=C.costs.length) return null; return Math.round(C.costs[lv]*(C.rarityMult[sp.rarity]||1)); }

/* 保育計畫：瀕危、傳說級物種各有一個計畫——園區出生 N 隻，再野放 1 隻園區出生的個體 */
function consFor(id){ const z=save.zoo; z.cons[id]=z.cons[id]||{born:0,released:0,done:false}; return z.cons[id]; }
function consEligible(sp){ return DATA.config.conservation.rarities.includes(sp.rarity); }
function consOnBirth(baby){ ensureResearch(); const sp=DATA.speciesById[baby.species]; if(sp&&consEligible(sp)){ consFor(sp.id).born++; checkCons(sp); } }
function consOnRelease(a){ ensureResearch(); const sp=DATA.speciesById[a.species]; if(sp&&consEligible(sp)&&a.gen>0){ consFor(sp.id).released++; checkCons(sp); } }
function checkCons(sp){
  const C=DATA.config.conservation, c=consFor(sp.id);
  if(c.done||c.born<C.bornTarget||c.released<C.releaseTarget) return;
  c.done=true; const rw=C.reward[sp.rarity]; pay(rw,1);
  toast(`保育計畫完成：${sp.name}！獎勵 ${costText(rw)}`);
}
const consDoneCount=()=>Object.values((save.zoo&&save.zoo.cons)||{}).filter(c=>c.done).length;

let labTab='tech';
function showLab(msg){
  ensureOps(); ensureResearch(); state='lab';
  const z=save.zoo, catName={care:'動物照護',facility:'設施',ops:'營運',expedition:'遠征'};
  let body='';
  if(labTab==='tech'){
    body=Object.keys(catName).map(cat=>`<div class="sec-title"><span>${catName[cat]}</span></div>`+DATA.research.filter(r=>r.cat===cat).map(r=>{
      const done=techDone(r.id), reqOK=r.requires.every(techDone), can=!done&&reqOK&&(z.research||0)>=r.cost;
      const btn=done?'<span class="sc-max">已完成</span>':!reqOK?`<span class="sc-max">需要先完成：${r.requires.map(x=>DATA.researchById[x].name).join('、')}</span>`
        :`<button type="button" class="zmini add" data-tech="${r.id}" ${can?'':'disabled'}>研究 ${r.cost}</button>`;
      return `<div class="shopcard${done?' on':''}"><div class="sc-main"><b>${esc(r.name)}</b><span>${esc(r.desc)}</span></div>${btn}</div>`; }).join('')).join('');
  } else if(labTab==='species'){
    const owned=[...new Set(z.animals.map(a=>a.species))].map(id=>DATA.speciesById[id]).filter(Boolean);
    body=owned.length?owned.map(sp=>{ const lv=knowLevel(sp.id), cost=knowCost(sp), max=DATA.config.speciesResearch.costs.length;
      return `<div class="shopcard${lv>=max?' on':''}"><div class="sc-main"><b>${esc(sp.name)} <em class="num">Lv${lv}/${max}</em></b><span>每級：這種動物幸福度 +${DATA.config.speciesResearch.happinessPerLevel}、吸引力 +${Math.round(DATA.config.speciesResearch.attractPerLevel*100)}%</span></div>
        ${cost==null?'<span class="sc-max">已研究完成</span>':`<button type="button" class="zmini add" data-know="${sp.id}" ${(z.research||0)>=cost?'':'disabled'}>研究 ${cost}</button>`}</div>`; }).join('')
      :'<p class="zp-empty">先把動物放進園區，才能研究牠們。</p>';
  } else {
    const C=DATA.config.conservation;
    const list=Object.keys(save.collection).map(id=>DATA.speciesById[id]).filter(sp=>sp&&consEligible(sp));
    body=`<p class="zp-empty">瀕危與傳說級物種各有一個保育計畫：在園區繁殖出 ${C.bornTarget} 隻寶寶，再野放 ${C.releaseTarget} 隻園區出生的個體。完成後可以拿到大量研究點數，也會提高園區的保育評價。</p>`+
      (list.length?list.map(sp=>{ const c=consFor(sp.id), r=DATA.config.rarity[sp.rarity];
        return `<div class="shopcard${c.done?' on':''}"><div class="sc-main"><b>${c.done?'✔ ':''}${esc(sp.name)} <em>${esc(r.name)}</em></b>
          <span>園區出生 ${Math.min(c.born,C.bornTarget)}/${C.bornTarget}・野放園區出生個體 ${Math.min(c.released,C.releaseTarget)}/${C.releaseTarget}</span><span>獎勵 ${esc(costText(C.reward[sp.rarity]))}</span></div></div>`; }).join('')
       :'<p class="zp-empty">還沒有發現瀕危或傳說級物種。往遠方的站點找找看。</p>');
  }
  const tabs=[['tech','技術'],['species','物種研究'],['cons','保育計畫']];
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>RESEARCH · 研究所</small>研究所</h1><span class="savechip">研究點數 ${Math.floor(z.research||0)}</span></div>
    <div class="dextabs" role="tablist">${tabs.map(([id,n])=>`<button type="button" role="tab" class="dextab${labTab===id?' on':''}" data-ltab="${id}" aria-selected="${labTab===id}">${n}</button>`).join('')}</div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <div class="shoplist">${body}</div>
    <button class="btn ghost" id="labBack" type="button">回到園區</button>
  </div>`;
  screenEl.querySelectorAll('[data-ltab]').forEach(el=>el.onclick=()=>{ labTab=el.dataset.ltab; showLab(); });
  screenEl.querySelectorAll('[data-tech]').forEach(el=>el.onclick=()=>{ const r=DATA.researchById[el.dataset.tech]; if((z.research||0)<r.cost) return; z.research-=r.cost; z.tech[r.id]=Date.now(); persist(); renderZooTools(); showLab(`完成研究：${r.name}`); });
  screenEl.querySelectorAll('[data-know]').forEach(el=>el.onclick=()=>{ const sp=DATA.speciesById[el.dataset.know], cost=knowCost(sp); if(cost==null||(z.research||0)<cost) return; z.research-=cost; z.know[sp.id]=knowLevel(sp.id)+1; persist(); showLab(`${sp.name} 研究到 Lv${z.know[sp.id]}`); });
  $('labBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}
