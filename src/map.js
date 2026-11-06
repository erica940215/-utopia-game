/* =========================================================
   路線圖（第三階段）：選站點出發、倖存者聚落交易
   節點來自 data/map.json，層級規則來自 config.tiers
   ========================================================= */
const STYPE={home:'起點',ruins:'廢墟',lake:'湖泊',greenhouse:'溫室',settlement:'聚落'};
let mapSel=null;
function mapState(){
  save.map=save.map||{visited:['utopia']};
  const v=new Set(save.map.visited); v.add('utopia');
  const avail=new Set(); for(const n of DATA.map) if(v.has(n.id)) n.links.forEach(l=>avail.add(l));
  return {v,avail};
}
const nodeFuel=n=>n.tier?DATA.config.tiers[n.tier].fuel:0;
function nodeCats(n){ const st=DATA.stationById[n.type]; if(!st||st.trade) return []; return [...new Set([...(st.ice?st.ice.categories:[]),...(st.catch?st.catch.categories:[])])]; }
function nodeProgress(n){
  const cats=nodeCats(n); if(!cats.length) return null;
  const pool=speciesPool(n,cats); const got=pool.filter(s=>save.collection[s.id]).length;
  return {got,total:pool.length};
}
function showMap(){
  state='map'; $('zooUI').hidden=true; $('zPanel').hidden=true;
  const {v,avail}=mapState(), fuel=Math.floor(save.resources.fuel||0);
  if(!mapSel||!DATA.mapById[mapSel]) mapSel=[...avail].find(id=>!v.has(id))||'old_town';
  const lines=[], seen=new Set();
  for(const n of DATA.map) for(const l of n.links){ const k=[n.id,l].sort().join('|'); if(seen.has(k)) continue; seen.add(k); const m=DATA.mapById[l]; if(!m) continue;
    const open=(v.has(n.id)||v.has(l)); lines.push(`<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="${open?'lk open':'lk'}"/>`); }
  const dots=DATA.map.map(n=>{
    const cls=n.type==='home'?'home':v.has(n.id)?'visited':avail.has(n.id)?'avail':'locked';
    const r=n.type==='home'?3.4:2.6+(n.tier||0)*0.25;
    return `<g class="nd ${cls}${mapSel===n.id?' sel':''}" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.name)}">
      <circle cx="${n.x}" cy="${n.y}" r="${r+2.4}" class="hit"/><circle cx="${n.x}" cy="${n.y}" r="${r}" class="dot t-${n.type}"/>
      <text x="${n.x}" y="${n.y+r+4.2}" text-anchor="middle">${esc(cls==='locked'?'？？？':n.name)}</text></g>`;
  }).join('');
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="mapwrap">
    <div class="maphead"><h2>路線圖</h2><span class="num">煤炭 ${fuel}</span><button type="button" class="btn ghost" id="mapBack">回到園區</button></div>
    <div class="mapbox"><svg viewBox="0 0 100 100" aria-label="冰原路線圖">${lines.join('')}${dots}</svg></div>
    <div class="mapinfo" id="mapInfo"></div>
  </div>`;
  $('mapBack').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; };
  screenEl.querySelectorAll('.nd').forEach(el=>{ const pick=()=>{ mapSel=el.dataset.node; showMap(); }; el.addEventListener('click',pick); el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); pick(); } }); });
  renderMapInfo(v,avail,fuel);
}
function renderMapInfo(v,avail,fuel){
  const n=DATA.mapById[mapSel], box=$('mapInfo');
  if(n.type==='home'){ box.innerHTML=`<b>${esc(n.name)}</b><span>烏托邦的月台。從這裡出發，越往北越遠、越稀有。</span>`; return; }
  const locked=!avail.has(n.id)&&!v.has(n.id), tier=DATA.config.tiers[n.tier], cost=nodeFuel(n), prog=nodeProgress(n);
  if(locked){ box.innerHTML=`<b>？？？</b><span>${esc(tier.name)}・先抵達相鄰的站點才會解鎖。</span>`; return; }
  ensureProgress(); const maxTier=computeStats().maxTier||1;
  const enough=fuel>=cost, tierOK=n.tier<=maxTier, zones=(n.zones&&n.zones.length)?n.zones.join('、'):'所有展區';
  const cats=[...new Set(speciesPool(n,nodeCats(n)).map(s=>s.category))].map(c=>DATA.config.categories[c].name).join('、');
  const label=!tierOK?`需要鍋爐 Lv${n.tier-1}（到工坊升級）`:enough?(n.type==='settlement'?'前往交易':'出發'):`出發（煤炭只有 ${fuel}，會在半路停車）`;
  box.innerHTML=`<b>${esc(n.name)}</b>
    <span>${esc(STYPE[n.type])}・${esc(tier.name)}・路程煤炭 ${cost}${v.has(n.id)?'・去過':''}</span>
    ${n.type==='settlement'?`<span>倖存者會拿物資和你交易，也能換到稀有物種。</span>`
      :`<span>可能出現：${esc(zones)}（${esc(cats)}）</span>${prog?`<span>這裡的圖鑑 ${prog.got}/${prog.total}</span>`:''}${bossForNode(n)?`<span class="warnline">⚠ 霜影首領「${esc(bossForNode(n).name)}」守在這裡${bossKills(bossForNode(n).id)?`・已擊敗 ${bossKills(bossForNode(n).id)} 次`:''}。牠身邊封著一隻${esc(DATA.config.rarity[bossForNode(n).guard].name)}生物，附近有彈藥箱。</span>`:''}`}
    ${tierOK&&!enough?`<span class="warnline">煤炭不夠時火車會停在半路的荒原，要下車找到煤炭才能繼續。</span>`:''}
    <button type="button" class="btn" id="mapGo" ${tierOK?'':'disabled'}>${label}</button>`;
  if(tierOK) $('mapGo').onclick=()=>{
    if(!enough){
      const need=cost-fuel; save.resources.fuel=0;
      leaveZooForExpedition({id:'stall',name:'半路荒原',type:'stall',tier:Math.max(1,n.tier-1),zones:n.zones||[],links:[],dest:n.id,destName:n.name,need});
      return;
    }
    save.resources.fuel=(save.resources.fuel||0)-cost;
    if(n.type==='settlement'){ save.map.visited.includes(n.id)||save.map.visited.push(n.id); persist(); showTrade(n); }
    else leaveZooForExpedition(n);
  };
}
function stallButtons(){
  const fuel=Math.floor(save.resources.fuel||0), need=curNode.need||0;
  return `<button class="btn" id="contBtn" type="button" ${fuel>=need?'':'disabled'}>${fuel>=need?`繼續前往${esc(curNode.destName)}（用掉煤炭 ${need}）`:`煤炭還差 ${need-fuel}，沒辦法繼續`}</button>`;
}
function wireStall(){
  const b=$('contBtn'); if(!b||b.disabled) return;
  const dest=DATA.mapById[curNode.dest], need=curNode.need||0;
  b.onclick=()=>{
    save.resources.fuel=(save.resources.fuel||0)-need;
    if(dest.type==='settlement'){ save.map.visited.includes(dest.id)||save.map.visited.push(dest.id); persist(); showTrade(dest); }
    else { persist(); startExpedition(dest); }
  };
}
function showTrade(n){
  state='map';
  const trades=DATA.config.trades;
  const giveTxt=g=>Object.entries(g).map(([k,v])=>`${resName(k)} ${v}`).join('・');
  const getTxt=g=>g.species?'一隻沒見過的稀有物種':Object.entries(g).map(([k,v])=>`${resName(k)} ${v}`).join('・');
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="card">
    <h1><small>SETTLEMENT · 交易</small>${esc(n.name)}</h1>
    <p>倉庫：${['coins',...DATA.items.map(i=>i.id)].map(k=>`${resName(k)} ${Math.floor(resOf(k))}`).join('・')}</p>
    <div class="trades">${trades.map(t=>`<div class="trade"><div><b>${esc(t.name)}</b><span>付 ${esc(giveTxt(t.give))} → 得 ${esc(getTxt(t.get))}</span></div>
      <button type="button" class="zmini add" data-trade="${t.id}" ${affordable(t.give)?'':'disabled'}>交易</button></div>`).join('')}</div>
    <p id="tradeMsg" class="zp-empty"></p>
    <button class="btn" id="tradeDone" type="button">回到烏托邦</button>
  </div>`;
  screenEl.querySelectorAll('[data-trade]').forEach(el=>el.onclick=()=>{
    const t=trades.find(x=>x.id===el.dataset.trade); if(!affordable(t.give)) return;
    let msg='';
    if(t.get.species){
      const pool=DATA.species.filter(s=>s.rarity===t.get.species&&!save.collection[s.id]);
      const sp=pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
      if(!sp){ $('tradeMsg').textContent='這個等級的物種你都有了。'; return; }
      pay(t.give,-1); ensureZoo();
      save.collection[sp.id]=1; save.zoo.unplaced[sp.id]=(save.zoo.unplaced[sp.id]||0)+1;
      msg=`換到 ${sp.name}！牠已經在園區等著安置。`;
    } else { pay(t.give,-1); pay(t.get,1); msg=`交易完成：得到 ${getTxt(t.get)}`; }
    persist(); showTrade(n); $('tradeMsg').textContent=msg;
  });
  $('tradeDone').onclick=()=>enterZoo();
}
