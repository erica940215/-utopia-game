/* =========================================================
   工坊（第四階段）：火車升級、武器與裝備
   等級效果來自 data/upgrades.json，裝備來自 data/equipment.json
   ========================================================= */
function ensureProgress(){
  save.upgrades=save.upgrades||{};
  save.gear=save.gear||{owned:['flare_gun'],equipped:{weapon:'flare_gun'}};
  if(!save.gear.owned.includes('flare_gun')) save.gear.owned.push('flare_gun');
  if(!save.starterKit){ save.starterKit=1; save.resources.ammo=(save.resources.ammo||0)+20; save.resources.bandage=(save.resources.bandage||0)+2; }
  ensureZoo();
}
function upLevel(id){ return (save.upgrades&&save.upgrades[id])||0; }
function computeStats(){
  const s=Object.assign({drainMult:1,wraithTouchMult:1,catchSpeed:1,workshop:0},DATA.config.expedition);
  for(const u of DATA.upgrades){ const lv=upLevel(u.id); for(let i=0;i<lv&&i<u.levels.length;i++) Object.assign(s,u.levels[i].effects); }
  const eq=(save.gear&&save.gear.equipped)||{};
  for(const id of Object.values(eq)){
    const g=DATA.equipById[id]; if(!g||g.slot==='weapon') continue;
    if(g.drainMult) s.drainMult*=g.drainMult;
    if(g.bagBonus) s.bagCapacity+=g.bagBonus;
    if(g.catchSpeed) s.catchSpeed=Math.max(s.catchSpeed,g.catchSpeed);
    if(g.sprintSpeed) s.sprintSpeed=Math.max(s.sprintSpeed,g.sprintSpeed);
    if(g.walkSpeed) s.walkSpeed=Math.max(s.walkSpeed,g.walkSpeed);
  }
  applyTrainEffects(s);
  const rf=RF(); s.drainMult*=rf.expDrainMult; s.wraithTouchMult*=rf.expWraithMult; s.containerCapacity+=rf.expContainerBonus;
  return s;
}
let shopTab='train';
function showWorkshop(msg){
  ensureProgress(); state='shop';
  const st=computeStats(), z=save.zoo;
  const wallet=['coins','research',...DATA.items.map(i=>i.id)].map(k=>`<span><i>${esc(resName(k))}</i><b class="num">${Math.floor(resOf(k))}</b></span>`).join('');
  let body='';
  if(shopTab==='train'){
    body=DATA.upgrades.map(u=>{
      const lv=upLevel(u.id), max=u.levels.length, next=u.levels[lv];
      return `<div class="shopcard"><div class="sc-main"><b>${esc(u.name)} <em class="num">Lv${lv}/${max}</em></b><span>${esc(u.desc)}</span>
        <span>${lv?`目前：${esc(u.levels[lv-1].text)}`:'目前：基本配備'}${next?`　→ 下一級：${esc(next.text)}`:''}</span></div>
        ${next?`<button type="button" class="zmini add" data-up="${u.id}" ${affordable(next.cost)?'':'disabled'}>${esc(costText(next.cost))}</button>`:'<span class="sc-max">已滿級</span>'}</div>`;
    }).join('');
  } else if(shopTab==='cars'){
    body=trainTabHtml(st);
  } else if(shopTab==='craft'){
    body=DATA.recipes.recipes.map(r=>`<div class="shopcard"><div class="sc-main"><b>${esc(r.name)}</b><span>${esc(costText(r.give))} → ${esc(costText(r.get))}</span></div>
      <div class="zp-btns"><button type="button" class="zmini add" data-rc="${r.id}" ${affordable(r.give)?'':'disabled'}>製作</button><button type="button" class="zmini" data-rc5="${r.id}" ${affordable(Object.fromEntries(Object.entries(r.give).map(([k,v])=>[k,v*5])))?'':'disabled'}>×5</button></div></div>`).join('')
      +'<p class="zp-empty">材料在遠征時搜刮：森林多木材、村莊多布料、礦區和港口多零件與火藥、溫室多草藥。獵槍、步槍、機槍在熱區補子彈要消耗彈藥；火焰噴射器燒煤炭。</p>';
  } else if(shopTab==='food'){
    body=foodTabHtml(st);
  } else {
    const slots=DATA.config.gearSlots;
    body=Object.keys(slots).map(slot=>{
      const items=DATA.equipment.filter(g=>g.slot===slot);
      return `<div class="sec-title"><span>${esc(slots[slot])}</span></div>`+items.map(g=>{
        const owned=save.gear.owned.includes(g.id), on=save.gear.equipped[slot]===g.id, lockedW=g.requires>st.workshop;
        let btn;
        if(on) btn=slot==='weapon'?'<span class="sc-max">使用中</span>':`<button type="button" class="zmini" data-unequip="${slot}">卸下</button>`;
        else if(owned) btn=`<button type="button" class="zmini add" data-equip="${g.id}">裝備</button>`;
        else if(lockedW) btn=`<span class="sc-max">需要工作台 Lv${g.requires}</span>`;
        else btn=`<button type="button" class="zmini add" data-craft="${g.id}" ${affordable(g.cost)?'':'disabled'}>製作：${esc(costText(g.cost))}</button>`;
        return `<div class="shopcard${on?' on':''}"><div class="sc-main"><b>${esc(g.name)}</b><span>${esc(g.text)}</span>${slot==='weapon'&&owned&&DATA.weaponmods.some(m=>m.for.includes(g.id))?weaponModsHtml(g):''}</div>${btn}</div>`;
      }).join('');
    }).join('');
  }
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>WORKSHOP · 火車工坊</small>工坊</h1></div>
    <div class="zres">${wallet}</div>
    <div class="dextabs" role="tablist">
      <button type="button" role="tab" class="dextab${shopTab==='train'?' on':''}" data-tab="train" aria-selected="${shopTab==='train'}">火車升級</button>
      <button type="button" role="tab" class="dextab${shopTab==='cars'?' on':''}" data-tab="cars" aria-selected="${shopTab==='cars'}">車廂編組</button>
      <button type="button" role="tab" class="dextab${shopTab==='craft'?' on':''}" data-tab="craft" aria-selected="${shopTab==='craft'}">製作</button>
      <button type="button" role="tab" class="dextab${shopTab==='food'?' on':''}" data-tab="food" aria-selected="${shopTab==='food'}">廚房</button>
      <button type="button" role="tab" class="dextab${shopTab==='gear'?' on':''}" data-tab="gear" aria-selected="${shopTab==='gear'}">武器與裝備</button>
    </div>
    <div class="statline">背包 ${st.bagCapacity}・跟隨 ${st.followCapacity}・容器 ${st.containerCapacity}・熱區 ${st.heatRadius} m・體溫流失 ${Math.round(st.drainMult*100)}%・可去：${esc(DATA.config.tiers[st.maxTier].name)}</div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    <div class="shoplist">${body}</div>
    <p class="zp-empty">研究點數來自園區：每多養一種不同的物種，研究就累積得越快；圖鑑每新增一種也會加研究。</p>
    <button class="btn ghost" id="shopBack" type="button">回到園區</button>
  </div>`;
  screenEl.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>{ shopTab=el.dataset.tab; carPick=null; showWorkshop(); });
  if(shopTab==='cars') wireTrainTab();
  if(shopTab==='food') wireFoodTab();
  const craft=(id,n)=>{ const r=DATA.recipes.recipes.find(x=>x.id===id), g=Object.fromEntries(Object.entries(r.give).map(([k,v])=>[k,v*n])); if(!affordable(g)) return; pay(g,-1); pay(Object.fromEntries(Object.entries(r.get).map(([k,v])=>[k,v*n])),1); save.stats=save.stats||{}; save.stats.crafted=(save.stats.crafted||0)+n; persist(); showWorkshop(`做好了 ${r.name}${n>1?' ×'+n:''}`); };
  screenEl.querySelectorAll('[data-rc]').forEach(el=>el.onclick=()=>craft(el.dataset.rc,1));
  screenEl.querySelectorAll('[data-rc5]').forEach(el=>el.onclick=()=>craft(el.dataset.rc5,5));
  if(shopTab==='gear') wireWeaponMods();
  screenEl.querySelectorAll('[data-up]').forEach(el=>el.onclick=()=>{
    const u=DATA.upgradeById[el.dataset.up], lv=upLevel(u.id), next=u.levels[lv];
    if(!next||!affordable(next.cost)) return;
    pay(next.cost,-1); save.upgrades[u.id]=lv+1; persist(); showWorkshop(`${u.name}升到 Lv${lv+1}：${next.text}`);
  });
  screenEl.querySelectorAll('[data-craft]').forEach(el=>el.onclick=()=>{
    const g=DATA.equipById[el.dataset.craft]; if(!affordable(g.cost)) return;
    pay(g.cost,-1); save.gear.owned.push(g.id); save.gear.equipped[g.slot]=g.id; persist(); showWorkshop(`做好了${g.name}，已經裝備上去`);
  });
  screenEl.querySelectorAll('[data-equip]').forEach(el=>el.onclick=()=>{ const g=DATA.equipById[el.dataset.equip]; save.gear.equipped[g.slot]=g.id; persist(); showWorkshop(); });
  screenEl.querySelectorAll('[data-unequip]').forEach(el=>el.onclick=()=>{ delete save.gear.equipped[el.dataset.unequip]; persist(); showWorkshop(); });
  $('shopBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; updateZooHud(); };
}
