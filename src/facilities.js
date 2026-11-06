/* =========================================================
   園區設施細節：冷氣、水溫調節、飲料店、販賣機、資訊中心、ATM、動物講座、廁所收費、
   教育與行銷物件（喇叭、教育站、保育看板、廣告看板、直播鏡頭）、保全（監視器、請勿餵食牌）、
   玻璃展示箱與步入式展館。數值在 config.fac
   ========================================================= */
const FAC=()=>DATA.config.fac;
function propEffects(){
  const out={clean:0,cons:0,edu:0,visit:0,online:0,security:0,nofeed:0,count:{}};
  for(const p of save.zoo.props||[]){ const d=pdef(p.type); if(!d||!d.effect) continue; out.count[d.id]=(out.count[d.id]||0)+1;
    for(const [k,v] of Object.entries(d.effect)) out[k]+=v; }
  const F=FAC(); out.visit=Math.min(F.billboardMax,out.count.billboard||0)*(pdef('billboard').effect.visit);
  out.online=Math.min(F.webcamMax,out.count.webcam||0)*(pdef('webcam').effect.online);
  return out;
}
const hasFacility=svc=>save.zoo.buildings.some(b=>{ const d=bdef(b.type); return d&&d.kind==='facility'&&d.service===svc&&isWorking(b); });
function drinkCoverage(v){
  const F=FAC(), serves=save.zoo.buildings.filter(b=>{ const d=bdef(b.type); return d&&d.kind==='facility'&&isWorking(b)&&(d.service==='drink'||(d.services||[]).includes('drink')||d.service==='food'); })
    .reduce((s,b)=>{ const d=bdef(b.type); return s+d.serves*(d.service==='drink'||(d.services||[]).includes('drink')?1:F.restaurantDrink); },0)*bizStats.power.ratio;
  return v<=0?1:Math.min(1,serves/v);
}
/* 教育分數的額外來源 */
function extraEducation(pe){
  const F=FAC(); let e=pe.edu;
  if(hasFacility('info')) e+=F.audioEdu;
  if(hasFacility('talk')&&staffCount('educator')>0) e+=F.talkEdu;
  if(save.zoo.buildings.some(b=>bdef(b.type).walk&&save.zoo.animals.some(a=>a.habitat===b.uid))) e+=F.walkEdu;
  return e;
}
/* 遊客人數的額外倍率 */
function extraVisitorMult(pe){
  const F=FAC(); let m=1+pe.visit;
  if(hasFacility('talk')&&staffCount('educator')>0) m*=F.talkVisit;
  if(hasFacility('info')&&typeof weatherNow==='function'){ const w=weatherNow().visit; if(w<1) m*=1+(1-w)*F.umbrellaRecover; }   // 雨傘
  return m;
}
/* 廁所收費 */
function toiletIncome(visitors){ const z=save.zoo, F=FAC(); const fee=z.toiletFee||0; return fee*visitors*F.toiletFeeShare*facilityCoverage('restroom',visitors)*0.05; }
const toiletSatPenalty=()=>(save.zoo.toiletFee||0)*FAC().toiletFeeSat;
/* 遊客亂餵：步道旁、附近沒有「請勿餵食牌」的棲地，動物比較容易生病 */
function guestFeedMult(b){
  if(!b) return 1; const d=bdef(b.type); if(d.house) return 1;
  const c=tileCenter(b), r=Math.max(...d.size)*TS()/2+6;
  const nearPath=save.zoo.buildings.some(o=>{ const od=bdef(o.type); if(od.kind!=='path'||od.staff) return false; const oc=tileCenter(o); return Math.hypot(oc.x-c.x,oc.z-c.z)<r; });
  if(!nearPath) return 1;
  const signed=(save.zoo.props||[]).some(p=>p.type==='nofeed_sign'&&Math.hypot(p.x-c.x,p.z-c.z)<r);
  return signed?1:FAC().guestFeedSick;
}
/* 冷氣與水溫調節器加進棲地溫度 */
function coolerOffset(b){
  const d=bdef(b.type); let t=0; if(d.house) return 0;
  for(const h of save.zoo.buildings){ const hd=bdef(h.type); if(hd.kind==='cooler'&&isWorking(h)&&tileDist(h,b)<=hd.radius+Math.max(...d.size)/2) t+=hd.heat*bizStats.power.ratio; }
  return t;
}
function waterRegulated(b){
  const d=bdef(b.type); if(!d.water) return false;
  return save.zoo.buildings.some(h=>{ const hd=bdef(h.type); return hd.kind==='waterreg'&&isWorking(h)&&bizStats.power.ratio>0.5&&tileDist(h,b)<=hd.radius+Math.max(...d.size)/2; });
}
/* 展示箱只能一種 */
function singleCheck(b){ const d=bdef(b.type); if(!d.single) return null; const n=new Set(save.zoo.animals.filter(a=>a.habitat===b.uid).map(a=>a.species)).size;
  return {k:'single',label:'展示箱只能放一種動物',ok:n<=1,pen:n<=1?0:FAC().singlePenalty}; }
