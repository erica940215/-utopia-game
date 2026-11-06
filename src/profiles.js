/* =========================================================
   記錄檔：單人可以開很多個記錄檔；多人記錄檔就是合營園區（可以一起遠征、一起經營）
   ========================================================= */
const profileLabel=(p,i)=>p.name||(p.id==='p1'?'記錄檔 1':`記錄檔 ${i+1}`);
async function listProfiles(){
  let L=[]; try{ L=await store.list(); }catch(e){}
  if(store!==LocalStore){ try{ for(const p of await LocalStore.list()) if(!L.some(x=>x.id===p.id)) L.push({...p,localOnly:true}); }catch(e){} }
  if(!L.some(p=>p.id===saveProfile)) L.unshift({id:saveProfile,name:careerSave&&careerSave.profileName,updatedAt:careerSave&&careerSave.updatedAt,runs:careerSave&&careerSave.runs});
  return L.sort((a,b)=>a.id==='p1'?-1:b.id==='p1'?1:String(a.id).localeCompare(String(b.id)));
}
async function loadProfile(id,name){
  if(activeSlot==='coop') leaveCoopZoo();
  if(activeSlot!=='career'){ activeSlot='career'; save=careerSave||save; }
  await persist();
  saveProfile=id; try{ localStorage.setItem('utopia-profile',id); }catch(e){}
  let d=null; try{ d=await store.load(id); }catch(e){} if(!d) d=await LocalStore.load(id);
  save=Object.assign(emptySave(),d&&d.version?d:{profileName:name||''});
  careerSave=save; activeSlot='career'; zooBaseBuilt&&clearPeople();
  if(!d) await persist();
  showModeSelect();
}
async function showProfiles(msg){
  state='profiles'; $('zooUI').hidden=true; screenEl.hidden=false; screenEl.innerHTML='<div class="loading">讀取記錄檔…</div>';
  const L=await listProfiles();
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>SAVES · 記錄檔</small>記錄檔</h1><span class="savechip ${store.mode==='cloud'?'cloud':''}">${store.mode==='cloud'?'雲端存檔・可跨裝置':'本機存檔'}</span></div>
    ${msg?`<div class="dexinfo">${esc(msg)}</div>`:''}
    ${sb?authHtml():''}
    <div class="sec-title"><span>單人記錄檔</span><b>${L.length}</b></div>
    <div class="shoplist">${L.map((p,i)=>{ const cur=p.id===saveProfile; return `<div class="shopcard${cur?' on':''}"><div class="sc-main"><b>${esc(profileLabel(p,i))}${cur?'（目前）':''}</b><span>已遠征 ${p.runs||0} 次${p.updatedAt?`・${new Date(p.updatedAt).toLocaleString('zh-TW')}`:''}${p.localOnly?'・只在這台裝置':''}</span></div>
      <div class="zp-btns">${cur?'':`<button type="button" class="zmini add" data-pload="${esc(p.id)}">載入</button>`}<button type="button" class="zmini" data-pren="${esc(p.id)}">改名</button>${cur||p.id==='p1'?'':`<button type="button" class="zmini" data-pdel="${esc(p.id)}">刪除</button>`}</div></div>`; }).join('')}</div>
    <div class="zp-btns"><input id="pNew" class="coopin wide" maxlength="16" placeholder="新記錄檔名稱（也用來改名）"><button type="button" class="zmini add" id="pNewBtn">新增記錄檔</button></div>
    <div class="sec-title"><span>多人記錄檔（和朋友一起遠征、一起經營）</span></div><div id="czBox"><p class="zp-empty">讀取中…</p></div>
    <button class="btn ghost" id="pBack" type="button">回到模式選擇</button></div>`;
  screenEl.querySelectorAll('[data-pload]').forEach(el=>el.onclick=()=>loadProfile(el.dataset.pload));
  screenEl.querySelectorAll('[data-pren]').forEach(el=>el.onclick=async()=>{ const id=el.dataset.pren, name=$('pNew').value.trim(); if(!name){ toast('先在下面的欄位輸入新名稱，再按改名'); $('pNew').focus(); return; }
    if(id===saveProfile){ careerSave.profileName=name.slice(0,16); await persist(); }
    else { let d=null; try{ d=await store.load(id); }catch(e){} if(!d) d=await LocalStore.load(id); if(d){ d.profileName=name.slice(0,16); await LocalStore.save(d,id); try{ await store.save(d,id); }catch(e){} } }
    showProfiles('改好名字了'); });
  screenEl.querySelectorAll('[data-pdel]').forEach(el=>el.onclick=async()=>{ if(el.dataset.confirm!=='1'){ el.dataset.confirm='1'; el.textContent='確定刪除？刪了就救不回來'; return; }
    const id=el.dataset.pdel; await LocalStore.remove(id); try{ await store.remove(id); }catch(e){} showProfiles('刪除了'); });
  $('pNewBtn').onclick=()=>{ const name=($('pNew').value.trim()||`記錄檔 ${L.length+1}`).slice(0,16); loadProfile('p'+Date.now().toString(36),name); };
  $('pBack').onclick=()=>showModeSelect();
  if(sb) wireAuth();
  coopZooHtml().then(h=>{ const b=$('czBox'); if(b&&state==='profiles'){ b.innerHTML=h; wireCoopZoo(); } });
}
