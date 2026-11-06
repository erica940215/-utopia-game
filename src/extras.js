/* =========================================================
   藍圖、玩家交易市場、拍照模式、劇情任務與新手教學
   劇情在 data/story.json；市場資料在 Supabase 的 market_listings
   ========================================================= */
/* ---------- 藍圖：框選物件存起來，之後一次放下 ---------- */
let bpSel=null;
const blueprints=()=>(save.blueprints=save.blueprints||[]);
function bpTools(){ return [{id:'bp_save',name:'框選存藍圖',sub:'點兩個對角'},{id:'bp_import',name:'匯入藍圖',sub:'貼上代碼'},...blueprints().map(b=>({id:'bpl_'+b.id,name:b.name,sub:costText(b.cost),cost:b.cost}))]; }
function bpTap(cx,cy){
  const h=groundHit(cx,cy); if(!h) return;
  if(zTool==='bp_save'){
    if(!bpSel){ bpSel={x:h.x,z:h.z}; toast('再點對角，框起要存的物件'); return; }
    const x0=Math.min(bpSel.x,h.x), x1=Math.max(bpSel.x,h.x), z0=Math.min(bpSel.z,h.z), z1=Math.max(bpSel.z,h.z); bpSel=null;
    const inside=(save.zoo.props||[]).filter(p=>p.x>=x0&&p.x<=x1&&p.z>=z0&&p.z<=z1);
    if(!inside.length){ toast('框裡沒有物件'); return; }
    const cx0=(x0+x1)/2, cz0=(z0+z1)/2, cost={};
    for(const p of inside) for(const [k,v] of Object.entries(pdef(p.type).cost)) cost[k]=(cost[k]||0)+v;
    const bp={id:Date.now().toString(36),name:`藍圖 ${blueprints().length+1}`,props:inside.map(p=>({type:p.type,dx:+(p.x-cx0).toFixed(2),dz:+(p.z-cz0).toFixed(2),y:p.y||0,rot:p.rot||0})),cost};
    blueprints().push(bp); persist(); zTool='bpl_'+bp.id; renderZooTools(); bpPanel(bp); toast(`存成藍圖了（${inside.length} 個物件）`); return;
  }
  const bp=blueprints().find(b=>'bpl_'+b.id===zTool); if(!bp) return;
  if(!affordable(bp.cost)){ toast(`不夠：需要 ${costText(bp.cost)}`); return; }
  pay(bp.cost,-1); const c=Math.cos(zRot), s=Math.sin(zRot);
  for(const q of bp.props){ const p={uid:save.zoo.nextUid++,type:q.type,x:h.x+q.dx*c+q.dz*s,z:h.z-q.dx*s+q.dz*c,y:q.y,rot:(q.rot||0)+zRot}; save.zoo.props.push(p); placePropMesh(p); }
  updateZooHud(); persist(); toast(`放下${bp.name}`);
}
async function bpPanel(bp){
  const code=await encodeShare({bp:{name:bp.name,props:bp.props,cost:bp.cost}});
  $('zPanel').hidden=false;
  $('zPanel').innerHTML=`<div class="zp-head"><div><b>${esc(bp.name)}</b><span>${bp.props.length} 個物件・${esc(costText(bp.cost))}・點地面放下，↺↻ 可以旋轉</span></div><button type="button" class="zclose" id="bpClose" aria-label="關閉">✕</button></div>
    <div class="zp-btns"><input id="bpName" class="coopin wide" maxlength="16" value="${esc(bp.name)}"><button type="button" class="zmini" id="bpRen">改名</button><button type="button" class="zmini" id="bpDel">刪除</button></div>
    <div class="zp-note">分享代碼（貼給朋友，他在「匯入藍圖」貼上就能用）<textarea class="sharebox" readonly id="bpCode">${esc(code)}</textarea></div>`;
  $('bpClose').onclick=()=>{ $('zPanel').hidden=true; };
  $('bpRen').onclick=()=>{ bp.name=$('bpName').value.trim().slice(0,16)||bp.name; persist(); renderZooTools(); bpPanel(bp); };
  $('bpDel').onclick=()=>{ save.blueprints=blueprints().filter(b=>b!==bp); zTool='select'; persist(); renderZooTools(); $('zPanel').hidden=true; };
}
function bpImportPanel(){
  $('zPanel').hidden=false;
  $('zPanel').innerHTML=`<div class="zp-head"><div><b>匯入藍圖</b><span>貼上朋友給的藍圖代碼</span></div><button type="button" class="zclose" id="bpClose" aria-label="關閉">✕</button></div>
    <textarea class="sharebox" id="bpIn"></textarea><div class="zp-btns"><button type="button" class="zmini add" id="bpGo">匯入</button></div>`;
  $('bpClose').onclick=()=>{ $('zPanel').hidden=true; };
  $('bpGo').onclick=async()=>{ try{ const d=await decodeShare($('bpIn').value); if(!d.bp||!Array.isArray(d.bp.props)) throw 0;
    const props=d.bp.props.filter(q=>pdef(q.type)), cost={}; for(const q of props) for(const [k,v] of Object.entries(pdef(q.type).cost)) cost[k]=(cost[k]||0)+v;
    const bp={id:Date.now().toString(36),name:(d.bp.name||'匯入的藍圖').slice(0,16),props,cost}; blueprints().push(bp); persist(); zTool='bpl_'+bp.id; renderZooTools(); bpPanel(bp); toast('匯入成功'); }
    catch(e){ toast('代碼看不懂，確認有完整貼上'); } };
}

/* ---------- 玩家交易市場（自己的網站、登入後） ---------- */
async function marketHtml(){
  if(!sb) return '<p class="zp-empty">玩家市場要在遊戲網站上用（Claude 裡的版本不能連線）。</p>';
  if(!sbUser) return '<p class="zp-empty">玩家市場要先登入：到「圖鑑・倉庫」輸入 Email 登入。</p>';
  // 先領賣出的錢
  try{ const {data}=await sb.rpc('claim_sales'); if(data&&data.length){ const sum=data.reduce((s,r)=>s+r.price,0); save.zoo.coins+=sum; persist(); toast(`賣出了 ${data.length} 隻動物，收到 ${sum} 金幣`); } }catch(e){}
  let open=[], mine=[];
  try{ const {data}=await sb.from('market_listings').select('id,seller,seller_name,species,animal,price,status,created_at').eq('status','open').order('created_at',{ascending:false}).limit(60); open=(data||[]).filter(r=>r.seller!==sbUser.id); mine=(data||[]).filter(r=>r.seller===sbUser.id); }catch(e){}
  const row=(r,btn)=>{ const sp=DATA.speciesById[r.species], a=r.animal||{}; return `<div class="shopcard"><div class="sc-main"><b>${a.sex==='M'?'♂':'♀'} ${esc(sp?sp.name:r.species)} <span class="stars">${'★'.repeat(a.stars||1)}</span></b><span>${esc(r.seller_name||'玩家')}・${esc(genesTxt(a))}</span></div>${btn}</div>`; };
  return `<div class="sec-title"><span>其他玩家上架的動物</span></div><div class="shoplist">${open.map(r=>row(r,`<button type="button" class="zmini add" data-pbuy="${r.id}" ${save.zoo.coins>=r.price?'':'disabled'}>${r.price} 金幣</button>`)).join('')||'<p class="zp-empty">目前沒有人上架。</p>'}</div>
    <div class="sec-title"><span>我上架的</span></div><div class="shoplist">${mine.map(r=>row(r,`<button type="button" class="zmini" data-pcancel="${r.id}">下架（${r.price}）</button>`)).join('')||'<p class="zp-empty">還沒有上架動物。</p>'}</div>
    <div class="sec-title"><span>上架倉庫裡的動物</span></div><div class="shoplist">${(save.zoo.stored||[]).map(a=>`<div class="shopcard"><div class="sc-main"><b>${a.sex==='M'?'♂':'♀'} ${esc(nameOf(a))} <span class="stars">${'★'.repeat(a.stars)}</span></b></div><div class="zp-btns"><input class="coopin" type="number" min="0" max="999999" value="${sellPrice(a).coins*2}" id="pp_${a.id}"><button type="button" class="zmini add" data-psell="${a.id}">上架</button></div></div>`).join('')||'<p class="zp-empty">倉庫是空的。在棲地面板按「移出」就會進倉庫。</p>'}</div>
    <p class="zp-empty">賣出後，下次打開市場就會收到金幣。</p>`;
}
function wireMarket(){
  screenEl.querySelectorAll('[data-pbuy]').forEach(el=>el.onclick=async()=>{ el.disabled=true; const {data,error}=await sb.rpc('buy_listing',{p_id:el.dataset.pbuy}); const r=data&&data[0];
    if(error||!r){ toast('買不到，可能已經被別人買走'); showMarket(); return; } if(save.zoo.coins<r.price){ toast('金幣不夠'); return; }
    save.zoo.coins-=r.price; const a={...r.animal,id:'a'+(save.zoo.nextUid++),habitat:null}; delete a.preg; save.zoo.stored.push(a); save.collection[r.species]=(save.collection[r.species]||0)+1; persist(); showMarket(`買到了 ${DATA.speciesById[r.species].name}，在倉庫裡`); });
  screenEl.querySelectorAll('[data-pcancel]').forEach(el=>el.onclick=async()=>{ const {data}=await sb.rpc('cancel_listing',{p_id:el.dataset.pcancel}); const r=data&&data[0]; if(r){ const a={...r.animal,id:'a'+(save.zoo.nextUid++)}; save.zoo.stored.push(a); persist(); } showMarket('下架了，動物回到倉庫'); });
  screenEl.querySelectorAll('[data-psell]').forEach(el=>el.onclick=async()=>{ const i=save.zoo.stored.findIndex(a=>a.id===el.dataset.psell); if(i<0) return; const price=Math.max(0,Math.min(999999,parseInt($('pp_'+el.dataset.psell).value,10)||0));
    const a=save.zoo.stored[i]; el.disabled=true;
    const {error}=await sb.from('market_listings').insert({seller_name:coopName(),species:a.species,animal:a,price}); if(error){ toast('上架失敗：'+error.message); el.disabled=false; return; }
    save.zoo.stored.splice(i,1); persist(); showMarket(`${DATA.speciesById[a.species].name} 上架了，${price} 金幣`); });
}

/* ---------- 拍照模式 ---------- */
function enterPhoto(){
  $('zooUI').classList.add('photo'); $('photoBar').hidden=false; zGhost.visible=false; zSelBox.visible=false;
}
function exitPhoto(){ $('zooUI').classList.remove('photo'); $('photoBar').hidden=true; }
async function takePhoto(){
  const name=`烏托邦-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.png`;
  renderer.render(zooScene,zooCam);
  const blob=await new Promise(r=>{ try{ renderer.domElement.toBlob(r,'image/png'); }catch(e){ r(null); } });
  if(!blob){ toast('這裡沒辦法存照片，可以直接截圖'); return; }
  // 在 Claude 裡要透過下載功能，會先問你要不要存
  if(window.claude&&window.claude.use){
    const dl=await window.claude.use('downloads');
    if(!dl){ toast('這裡沒辦法存照片，可以直接截圖'); return; }
    try{ await dl.save({filename:name,data:blob}); toast('照片存好了'); }catch(e){ if(e&&e.code!=='declined') toast('照片沒有存成功'); }
    return;
  }
  const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); toast('拍好了，照片已下載');
}

/* ---------- 劇情任務與新手教學 ---------- */
const STORY=()=>DATA.story;
function storyStat(k){
  const z=save.zoo, B=z?z.buildings:[], kind=k2=>B.filter(b=>{ const d=bdef(b.type); return d&&d.kind===k2; }).length;
  switch(k){
    case 'paths': return kind('path'); case 'habitats': return kind('habitat'); case 'feeders': return kind('feeder');
    case 'animals': return z?z.animals.length:0; case 'runs': return save.runs||0;
    case 'upgrades': return Object.values(save.upgrades||{}).reduce((a,b)=>a+b,0)+Math.max(0,((save.gear&&save.gear.owned)||[]).length-1);
    case 'staff': return z?totalStaff():0; case 'visitors': return zooStats.visitors||0; case 'rating': return opsStats.rating||1;
    case 'restaurant': return B.filter(b=>b.type==='restaurant').length; case 'restroom': return B.filter(b=>b.type==='restroom').length;
    case 'tier2': return (save.map&&save.map.visited||[]).filter(id=>DATA.mapById[id]&&DATA.mapById[id].tier>=2).length;
    case 'rare': return Object.keys(save.collection).filter(id=>DATA.speciesById[id]&&DATA.speciesById[id].rarity!=='common').length;
    case 'crafted': return (save.stats&&save.stats.crafted)||0; case 'births': return z?z.births||0:0; case 'released': return z?z.released||0:0;
    case 'techs': return Object.keys((z&&z.tech)||{}).length; case 'bosses': return bossesDefeated(); case 'species': return Object.keys(save.collection).length;
    case 'cars': return ((save.train&&save.train.cars)||[]).length; case 'freehab': return B.filter(b=>b.poly).length;
    default: return 0;
  }
}
function storyState(){ save.story=save.story||{ch:0,step:0,seen:-1}; return save.story; }
function storyCurrent(){ const s=storyState(), ch=STORY().chapters[s.ch]; return ch?{ch,step:ch.steps[s.step],s}:null; }
let storyT=0;
function storyTick(dt){
  if(modeOf()!=='career'||!DATA.story) return; storyT+=dt; if(storyT<1.5) return; storyT=0;
  const cur=storyCurrent(); if(!cur) { $('zStory').hidden=true; return; }
  const {ch,s}=cur;
  if(s.seen!==s.ch){ s.seen=s.ch; persist(); showStoryCard(ch); return; }
  let done=0, rw={};
  while(s.ch<STORY().chapters.length){ const C=STORY().chapters[s.ch], st=C.steps[s.step]; if(!st||storyStat(st.stat)<st.target) break;
    for(const [k,v] of Object.entries(st.reward||{})) rw[k]=(rw[k]||0)+v; done++; s.step++;
    if(s.step>=C.steps.length){ s.ch++; s.step=0; for(const [k,v] of Object.entries(C.reward||{})) rw[k]=(rw[k]||0)+v; toast(`完成章節「${C.name}」！`); break; } }
  if(done){ pay(rw,1); persist(); if(Object.keys(rw).length) toast(`任務完成 ×${done}：${costText(rw)}`); }
  storyHud();
}
function storyHud(){
  const el=$('zStory'), cur=storyCurrent(); if(!el) return;
  if(!cur||modeOf()!=='career'){ el.hidden=true; return; }
  const {ch,step,s}=cur; el.hidden=false;
  el.innerHTML=`<b>${esc(ch.name)} ${s.step+1}/${ch.steps.length}</b><span>${esc(step.text)}</span><span class="num">${Math.min(storyStat(step.stat),step.target)}/${step.target}</span>`;
  el.onclick=()=>toast(step.hint||step.text);
}
function showStoryCard(ch){
  state='story'; $('zooUI').hidden=true; screenEl.hidden=false;
  screenEl.innerHTML=`<div class="card"><h1><small>CHAPTER ${STORY().chapters.indexOf(ch)+1}</small>${esc(ch.name)}</h1>${ch.intro.map(p=>`<p>${esc(p)}</p>`).join('')}
    <div class="btns"><button class="btn" id="stGo" type="button">開始</button></div></div>`;
  $('stGo').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; storyHud(); };
}
