/* =========================================================
   遊戲模式：生涯、沙盒、挑戰
   生涯存檔就是原本的存檔；沙盒與挑戰存在 save.slots 底下，互不影響
   挑戰關卡在 data/challenges.json
   ========================================================= */
let careerSave=null, activeSlot='career';
function rootSave(){
  if(activeSlot==='career'||!careerSave) return save;
  careerSave.slots=careerSave.slots||{}; careerSave.slots[activeSlot]=save; return careerSave;
}
const modeOf=()=>save.mode||'career';
function switchSlot(slot,fresh){
  if(activeSlot!=='career'&&careerSave){ careerSave.slots=careerSave.slots||{}; careerSave.slots[activeSlot]=save; }
  activeSlot=slot;
  if(slot==='career'){ save=careerSave; }
  else{ careerSave.slots=careerSave.slots||{}; if(!careerSave.slots[slot]) careerSave.slots[slot]=fresh(); save=careerSave.slots[slot]; }
  zooBaseBuilt&&clearPeople();
}
function newSandbox(){
  const s=emptySave(); s.mode='sandbox';
  s.resources={fuel:9999,scrap:9999,feed:9999};
  for(const sp of DATA.species) s.collection[sp.id]=2;
  s.upgrades=Object.fromEntries(DATA.upgrades.map(u=>[u.id,u.levels.length]));
  s.gear={owned:DATA.equipment.map(e=>e.id),equipped:{weapon:'flamethrower',body:'polar_suit',pack:'heater_pack',tool:'pro_kit',feet:'snow_boots'}};
  s.map={visited:DATA.map.map(n=>n.id)};
  const keep=save; save=s; ensureZoo(); ensureOps(); ensureResearch();
  s.zoo.coins=999999; s.zoo.research=99999; s.zoo.tech=Object.fromEntries(DATA.research.map(r=>[r.id,1]));
  s.zoo.staff={keeper:4,vet:2,mechanic:2,janitor:3,security:2,educator:1}; s.zoo.noAging=true;
  save=keep; return s;
}
function newChallenge(ch){
  const s=emptySave(); s.mode='challenge'; s.challenge=ch.id;
  s.resources=Object.assign({fuel:0,scrap:0,feed:0},ch.start.resources||{});
  for(const [id,n] of Object.entries(ch.start.animals||{})) s.collection[id]=n;
  const keep=save; save=s; ensureZoo(); ensureOps(); ensureResearch();
  s.zoo.coins=ch.start.coins||0; s.zoo.research=ch.start.research||0; s.zoo.unplaced={...(ch.start.animals||{})};
  if(ch.start.staff) s.zoo.staff={...ch.start.staff};
  s.zoo.chStart=0; save=keep; return s;
}
const MODE_NAME={career:'生涯',sandbox:'沙盒',challenge:'挑戰'};

/* 挑戰進度 */
function challengeDef(){ return save.mode==='challenge'?DATA.challenges.find(c=>c.id===save.challenge):null; }
function challengeStat(k){ if(k==='coins') return Math.floor(save.zoo.coins); if(k==='animals') return save.zoo.animals.length; if(k==='satisfaction') return Math.round(opsStats.satisfaction); return achStat(k); }
function challengeStatus(){
  const ch=challengeDef(); if(!ch) return null;
  const used=(save.zoo.clock||0)-(save.zoo.chStart||0), left=Math.max(0,ch.minutes-used);
  const goals=ch.goals.map(g=>({...g,v:challengeStat(g.stat)}));
  const done=goals.every(g=>g.v>=g.target);
  return {ch,left,goals,done,failed:!done&&left<=0};
}
let chResolved=false;
function checkChallenge(){
  const st=challengeStatus(); if(!st||chResolved||save.chResult) return;
  if(st.done){ chResolved=true; save.chResult='won'; careerSave.chDone=careerSave.chDone||{}; const best=careerSave.chDone[st.ch.id];
    const t=Math.round(st.ch.minutes-st.left); if(!best||t<best) careerSave.chDone[st.ch.id]=t; persist(); showChallengeEnd(st,true,t); }
  else if(st.failed){ chResolved=true; save.chResult='lost'; persist(); showChallengeEnd(st,false); }
}
function challengeHud(){
  const el=$('zChal'); const st=challengeStatus();
  if(!st){ el.hidden=true; return; }
  el.hidden=false;
  el.innerHTML=`<b>${esc(st.ch.name)}</b><span class="num">剩 ${Math.floor(st.left)} 分鐘</span>${st.goals.map(g=>`<span class="${g.v>=g.target?'ok':''}">${esc(g.label)} ${Math.min(g.v,g.target)}/${g.target}</span>`).join('')}`;
}
function showChallengeEnd(st,won,t){
  state='chend'; $('zooUI').hidden=true; screenEl.hidden=false;
  screenEl.innerHTML=`<div class="card"><h1><small>CHALLENGE · ${won?'挑戰成功':'挑戰失敗'}</small>${esc(st.ch.name)}</h1>
    <p>${won?`用了 ${t} 分鐘完成所有目標。`:'時間到了，還有目標沒有完成。'}</p>
    <div class="tags">${st.goals.map(g=>`<span>${esc(g.label)} ${Math.min(g.v,g.target)}/${g.target}</span>`).join('')}</div>
    <div class="btns"><button class="btn ghost" id="chRetry" type="button">重新挑戰</button><button class="btn" id="chMenu" type="button">回到模式選擇</button></div></div>`;
  $('chRetry').onclick=()=>startChallenge(st.ch);
  $('chMenu').onclick=()=>showModeSelect();
}
function startChallenge(ch){ chResolved=false; if(careerSave&&careerSave.slots) careerSave.slots['ch_'+ch.id]=null; switchSlot('ch_'+ch.id,()=>newChallenge(ch)); persist(); enterZoo(); toast(ch.brief); }

/* 模式選擇畫面 */
function showModeSelect(){
  state='mode'; $('zooUI').hidden=true; $('hud').hidden=true; screenEl.hidden=false;
  const done=(careerSave&&careerSave.chDone)||{}, c=careerSave||save;
  const sbx=careerSave&&careerSave.slots&&careerSave.slots.sandbox;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head"><h1><small>UTOPIA · 冰原最後的避難所</small>烏托邦</h1></div>
    <div class="modecards">
      <button type="button" class="modecard main" id="mCareer"><b>生涯模式</b><span>遠征救援、經營動物園、集滿圖鑑。已遠征 ${c.runs||0} 次・圖鑑 ${Object.keys(c.collection||{}).length} 種</span></button>
      <button type="button" class="modecard" id="mSandbox"><b>沙盒模式</b><span>資源無限、全部物種與設施解鎖，專心蓋自己的動物園。${sbx?'繼續上次的沙盒':''}</span></button>
    </div>
    ${sbx?'<button type="button" class="zmini" id="mSandboxNew">重新開一座沙盒動物園</button>':''}
    <div class="sec-title"><span>挑戰模式</span><b>${Object.keys(done).length}/${DATA.challenges.length}</b></div>
    <div class="shoplist">${DATA.challenges.map(ch=>`<div class="shopcard${done[ch.id]?' on':''}"><div class="sc-main"><b>${done[ch.id]?'✔ ':''}${esc(ch.name)}</b><span>${esc(ch.desc)}</span><span>限時 ${ch.minutes} 分鐘${done[ch.id]?`・最佳紀錄 ${done[ch.id]} 分鐘`:''}</span></div>
      <button type="button" class="zmini add" data-ch="${ch.id}">開始</button></div>`).join('')}</div>
    <p class="zp-empty">沙盒和挑戰的進度分開存，不會影響生涯存檔。挑戰時間是遊戲內時間，跟現實時間一樣快。</p>
  </div>`;
  $('mCareer').onclick=()=>{ switchSlot('career'); enterZoo(); };
  $('mSandbox').onclick=()=>{ switchSlot('sandbox',()=>newSandbox()); persist(); enterZoo(); };
  const nb=$('mSandboxNew'); if(nb) nb.onclick=()=>{ careerSave.slots.sandbox=null; switchSlot('sandbox',()=>newSandbox()); persist(); enterZoo(); };
  screenEl.querySelectorAll('[data-ch]').forEach(el=>el.onclick=()=>startChallenge(DATA.challenges.find(c=>c.id===el.dataset.ch)));
}
