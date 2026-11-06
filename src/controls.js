/* =========================================================
   觸控操作設定：搖桿與按鈕可以調整大小、拖曳位置
   設定只存在這台裝置（localStorage）
   ========================================================= */
const CTRL_IDS={stick:'搖桿',btnFire:'開火',btnAct:'互動',btnRun:'奔跑',btnEat:'吃',btnHeal:'治療'};
const CTRL_BASE={stick:120,btnFire:78,btnAct:66,btnRun:56,btnEat:50,btnHeal:50};
let ctrlCfg={size:{},pos:{}};
try{ const t=localStorage.getItem('utopia-controls'); if(t) ctrlCfg=Object.assign({size:{},pos:{}},JSON.parse(t)); }catch(e){}
function saveCtrl(){ try{ localStorage.setItem('utopia-controls',JSON.stringify(ctrlCfg)); }catch(e){} }
function applyCtrl(){
  for(const id of Object.keys(CTRL_IDS)){
    const el=$(id), sz=Math.round(CTRL_BASE[id]*(ctrlCfg.size[id]||1)), p=ctrlCfg.pos[id];
    el.style.width=sz+'px'; el.style.height=sz+'px';
    if(p){ el.style.left=(p.x*100)+'%'; el.style.top=(p.y*100)+'%'; el.style.right='auto'; el.style.bottom='auto'; el.style.transform='translate(-50%,-50%)'; }
    else { el.style.left=el.style.top=el.style.right=el.style.bottom=el.style.transform=''; }
  }
  const k=$('knob'), ks=Math.round(50*(ctrlCfg.size.stick||1)); k.style.width=k.style.height=ks+'px'; k.style.margin=`${-ks/2}px 0 0 ${-ks/2}px`;
}
applyCtrl();
let ctrlDrag=null;
function startCtrlEdit(){
  state='ctrledit';
  $('touch').hidden=false; $('touch').classList.remove('walk'); $('touch').classList.add('edit');
  const p=$('ctrlPanel'); p.hidden=false;
  p.innerHTML=`<b>操作設定</b><span>直接拖曳按鈕調整位置，用滑桿調整大小。</span>
    ${Object.entries(CTRL_IDS).map(([id,n])=>`<label>${n}<input type="range" id="sz_${id}" min="0.6" max="1.6" step="0.05" value="${ctrlCfg.size[id]||1}"></label>`).join('')}
    <div class="qbox">${qualityHtml()}</div>
    <div class="btns"><button type="button" class="btn ghost" id="ctrlReset">重設</button><button type="button" class="btn" id="ctrlDone">完成</button></div>`;
  wireQuality();
  for(const id of Object.keys(CTRL_IDS)) $('sz_'+id).oninput=e=>{ ctrlCfg.size[id]=parseFloat(e.target.value); applyCtrl(); };
  $('ctrlReset').onclick=()=>{ ctrlCfg={size:{},pos:{}}; applyCtrl(); saveCtrl(); startCtrlEdit(); };
  $('ctrlDone').onclick=()=>endCtrlEdit();
}
function endCtrlEdit(){
  saveCtrl(); $('ctrlPanel').hidden=true; $('touch').classList.remove('edit'); $('touch').hidden=true;
  state='zoo'; $('zooUI').hidden=false;
}
for(const id of Object.keys(CTRL_IDS)){
  const el=$(id);
  el.addEventListener('pointerdown',e=>{ if(state!=='ctrledit') return; e.preventDefault(); ctrlDrag=id; el.setPointerCapture&&el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove',e=>{ if(state!=='ctrledit'||ctrlDrag!==id) return;
    ctrlCfg.pos[id]={x:Math.max(0.04,Math.min(0.96,e.clientX/innerWidth)),y:Math.max(0.08,Math.min(0.94,e.clientY/innerHeight))}; applyCtrl(); });
  el.addEventListener('pointerup',()=>{ if(ctrlDrag===id){ ctrlDrag=null; saveCtrl(); } });
}
