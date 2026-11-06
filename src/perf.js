/* =========================================================
   效能：畫質等級（自動／低／中／高）、自動降解析度、遠處動畫降頻
   ========================================================= */
const QUALITY={
  low :{name:'低',pr:1,   trees:0.45,snow:0.35,people:10,far:220,animDist:30, lambert:true, bubbles:false},
  mid :{name:'中',pr:1.25,trees:0.75,snow:0.65,people:22,far:320,animDist:55, lambert:false,bubbles:true},
  high:{name:'高',pr:1.75,trees:1,   snow:1,   people:36,far:400,animDist:110,lambert:false,bubbles:true}};
let qSetting=(()=>{ try{ return localStorage.getItem('utopia-quality')||'auto'; }catch(e){ return 'auto'; } })();
function autoQuality(){ if(!isTouch) return 'high'; const mem=navigator.deviceMemory||4, cores=navigator.hardwareConcurrency||4; return (mem<=3||cores<=4)?'low':'mid'; }
let qLevel=qSetting==='auto'?autoQuality():qSetting, dynScale=1, fpsNow=60;
const Q=()=>QUALITY[qLevel]||QUALITY.mid;
function applyQuality(){
  renderer.setPixelRatio(Math.max(0.5,Math.min(devicePixelRatio,Q().pr)*dynScale)); resize(); zooResize();
  camera.far=Q().far; camera.updateProjectionMatrix();
  snowGeo.setDrawRange(0,Math.floor(SNOW_N*Q().snow));
  if(typeof zSnow!=='undefined'&&zSnow) zSnow.geometry.setDrawRange(0,Math.floor(1500*Q().snow));
}
function setQuality(v){ qSetting=v; try{ localStorage.setItem('utopia-quality',v); }catch(e){} qLevel=v==='auto'?autoQuality():v; dynScale=1; applyQuality(); }
/* 自動模式：每 2 秒看一次 FPS，太低就降解析度，順了再慢慢調回來 */
let fpsAcc=0, fpsN=0;
function perfTick(dt){
  fpsAcc+=dt; fpsN++; if(fpsAcc<2) return;
  fpsNow=fpsN/fpsAcc; fpsAcc=0; fpsN=0;
  if(qSetting!=='auto'||document.hidden) return;
  if(fpsNow<27&&dynScale>0.55){ dynScale=Math.max(0.55,dynScale-0.15); applyQuality(); }
  else if(fpsNow<20&&qLevel!=='low'&&dynScale<=0.55){ qLevel=qLevel==='high'?'mid':'low'; dynScale=0.85; applyQuality(); }
  else if(fpsNow>52&&dynScale<1){ dynScale=Math.min(1,dynScale+0.1); applyQuality(); }
}
/* 動畫：只更新目前畫面上的場景；離鏡頭越遠更新得越少 */
const _mv=new THREE.Vector3();
function activeCam(){ return zooActive?(state==='zoowalk'?camera:zooCam):camera; }
function updateMixersLod(dt){
  const sc=zooActive?zooScene:scene, cam=activeCam(), far=Q().animDist;
  for(const m of mixers){
    const r=m.getRoot(); let o=r; while(o.parent) o=o.parent;
    if(!o.isScene){ mixers.delete(m); continue; }
    if(o!==sc){ m._acc=0; continue; }
    r.getWorldPosition(_mv); const d=_mv.distanceTo(cam.position);
    if(d<far){ if(m._acc){ m.update(m._acc); m._acc=0; } m.update(dt); }
    else { m._acc=(m._acc||0)+dt; if(m._acc>(d<far*2?0.2:0.6)){ m.update(m._acc); m._acc=0; } }
  }
}
function qualityHtml(){
  return `<label>畫質 <select id="qSel">${[['auto','自動'],['low','低（最省電）'],['mid','中'],['high','高']].map(([v,n])=>`<option value="${v}"${qSetting===v?' selected':''}>${n}</option>`).join('')}</select></label>
    <span>目前約 ${Math.round(fpsNow)} FPS・${Q().name}畫質${qSetting==='auto'&&dynScale<1?`・解析度 ${Math.round(dynScale*100)}%`:''}</span>`;
}
function wireQuality(){ const s=$('qSel'); if(s) s.onchange=e=>{ setQuality(e.target.value); const p=$('ctrlPanel'); const q=p&&p.querySelector('.qbox'); if(q){ q.innerHTML=qualityHtml(); wireQuality(); } }; }
