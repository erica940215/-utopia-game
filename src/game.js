(() => {
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window);
const screenEl = $('screen');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* =========================================================
   1. 載入設定表（data/*.json）——遊戲內容全部從這裡來
   ========================================================= */
const DATA = {};
async function loadData(){
  const names = ['config','species','items','equipment','stations','buildings','map','upgrades','props','assets','staff','achievements','research','challenges'];
  const res = await Promise.all(names.map(n => fetch(`data/${n}.json`).then(r => { if(!r.ok) throw new Error(n); return r.json(); })));
  names.forEach((n,i) => DATA[n] = res[i]);
  DATA.speciesById = Object.fromEntries(DATA.species.map(s => [s.id, s]));
  DATA.itemsById = Object.fromEntries(DATA.items.map(s => [s.id, s]));
  DATA.equipById = Object.fromEntries(DATA.equipment.map(s => [s.id, s]));
  DATA.stationById = Object.fromEntries(DATA.stations.map(s => [s.id, s]));
  DATA.researchById = Object.fromEntries(DATA.research.map(s => [s.id, s]));
  DATA.staffById = Object.fromEntries(DATA.staff.map(s => [s.id, s]));
  DATA.propById = Object.fromEntries(DATA.props.map(s => [s.id, s]));
  DATA.upgradeById = Object.fromEntries(DATA.upgrades.map(s => [s.id, s]));
  DATA.mapById = Object.fromEntries(DATA.map.map(s => [s.id, s]));
  DATA.buildingById = Object.fromEntries(DATA.buildings.map(s => [s.id, s]));
}

/* =========================================================
   2. 存檔層：雲端（artifact db）優先，失敗時改用本機
   之後搬到自己的網域時，只要換掉 CloudStore 為 Supabase 版本
   ========================================================= */
const SAVE_VERSION = 1;
function emptySave(){ return { version:SAVE_VERSION, runs:0, resources:{}, collection:{}, updatedAt:null }; }
const LocalStore = {
  mode:'local',
  async load(){ try{ const t = localStorage.getItem('utopia-save'); return t ? JSON.parse(t) : null; }catch(e){ return null; } },
  async save(d){ try{ localStorage.setItem('utopia-save', JSON.stringify(d)); return true; }catch(e){ return false; } }
};
function waitForClaude(ms){
  return new Promise(res => {
    const t0 = Date.now();
    (function poll(){ if(window.claude && window.claude.use) return res(window.claude); if(Date.now()-t0>ms) return res(null); setTimeout(poll, 100); })();
  });
}
async function makeCloudStore(){
  const c = await waitForClaude(1500);
  if(!c) return null;
  const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
  const db = await withTimeout(c.use('db'), 10000);
  const user = await withTimeout(c.use('user'), 10000);
  if(!db || !user) return null;
  const uid = await user.id();
  if(!uid) return null;
  const ref = db.collection('data/users/' + uid).doc('save');
  return {
    mode:'cloud',
    async load(){ const s = await ref.get(); return s.exists ? s.data() : null; },
    async save(d){ await ref.set(d); return true; }
  };
}
let store = LocalStore, save = emptySave(), saving = Promise.resolve();
const SB_URL='https://pujvupwghochfklrgvtq.supabase.co', SB_KEY='sb_publishable_jHEGIwFLfpGOriA-ijixGg_dytbHXQH';
const onOwnSite=/github\.io$|^localhost$|^127\./.test(location.hostname);
const sb=(onOwnSite&&window.supabase&&window.supabase.createClient)?window.supabase.createClient(SB_URL,SB_KEY):null;
let sbUser=null;
function makeSupabaseStore(u){
  return {
    mode:'cloud',
    async load(){ const {data,error}=await sb.from('saves').select('data').eq('user_id',u.id).maybeSingle(); if(error) throw error; return data?data.data:null; },
    async save(d){ const {error}=await sb.from('saves').upsert({user_id:u.id,data:d,updated_at:new Date().toISOString()}); if(error) throw error; return true; }
  };
}
async function initSave(){
  const local=await LocalStore.load();
  if(local&&local.version) save=Object.assign(emptySave(),local);
  if(sb){
    try{
      const {data}=await sb.auth.getSession();
      sbUser=data.session?data.session.user:null;
      if(sbUser){
        store=makeSupabaseStore(sbUser);
        const cloud=await store.load();
        if(cloud&&cloud.version) save=Object.assign(emptySave(),cloud);
        else if(local&&local.version) await store.save(save); // 第一次登入：把本機進度帶上雲端
      }
    }catch(e){ store=LocalStore; }
    return;
  }
  try{ const cloud=await makeCloudStore(); if(cloud){ store=cloud; const d=await store.load(); if(d&&d.version) save=Object.assign(emptySave(),d); } }catch(e){ store=LocalStore; }
}
function persist(){
  const root = (typeof rootSave==='function') ? rootSave() : save;
  root.updatedAt = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(root));
  LocalStore.save(snapshot);
  saving = saving.then(() => store.save(snapshot)).catch(() => { store = LocalStore; return LocalStore.save(snapshot); });
  return saving;
}

/* =========================================================
   3. Three.js 場景
   ========================================================= */
let renderer;
try{ renderer = new THREE.WebGLRenderer({canvas:$('c'), antialias:!isTouch, powerPreference:'high-performance'}); }
catch(e){ screenEl.innerHTML = '<div class="card"><h2>無法啟動 3D</h2><p>這個瀏覽器沒有開放 WebGL。請改用最新版 Chrome、Safari 或 Edge 開啟。</p></div>'; return; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.6));
const scene = new THREE.Scene();
const SKY = new THREE.Color(0x1b2c42), STORM_SKY = new THREE.Color(0x8ea3b6);
scene.background = SKY.clone();
scene.fog = new THREE.FogExp2(SKY.clone(), 0.016);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
camera.rotation.order = 'YXZ';
function resize(){ const w=innerWidth,h=innerHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0x9fbfe0, 0xe8f2ff, 0.62));
const moon = new THREE.DirectionalLight(0xbcd4ff, 0.45); moon.position.set(-40,80,-30); scene.add(moon);

const M = c => new THREE.MeshLambertMaterial({color:c});
const box = (w,h,d,c) => new THREE.Mesh(new THREE.BoxGeometry(w,h,d), typeof c==='number'?M(c):c);
const sph = (r,c) => new THREE.Mesh(new THREE.SphereGeometry(r,12,9), typeof c==='number'?M(c):c);
const cyl = (r1,r2,h,c,s=12) => new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,s), typeof c==='number'?M(c):c);
const hex = s => parseInt(String(s).replace('#',''),16);

let groundMesh=null;
function heightAt(x,z){
  const ax=Math.abs(x); let t=Math.min(1,Math.max(0,(ax-6)/14)); t=t*t*(3-2*t);
  const h=2.6*Math.sin(x*0.045)*Math.cos(z*0.038)+1.6*Math.sin(x*0.12+z*0.07)+0.8*Math.sin(z*0.19-x*0.1)+5*Math.sin(x*0.012+1.3)*Math.sin(z*0.015);
  return (h+1.2)*t;
}
{
  const g=new THREE.PlaneGeometry(420,420,140,140); g.rotateX(-Math.PI/2);
  const p=g.attributes.position; for(let i=0;i<p.count;i++) p.setY(i,heightAt(p.getX(i),p.getZ(i)));
  g.computeVertexNormals(); groundMesh=new THREE.Mesh(g,M(0xdfeaf2)); scene.add(groundMesh);
  const rail=M(0x50565e), sleeper=M(0x3a2c24);
  for(const x of [-0.75,0.75]){ const r=box(0.12,0.12,420,rail); r.position.set(x,0.18,0); scene.add(r); }
  const inst=new THREE.InstancedMesh(new THREE.BoxGeometry(2.4,0.12,0.35),sleeper,420), dm=new THREE.Object3D();
  for(let i=0;i<420;i++){ dm.position.set(0,0.06,-210+i); dm.updateMatrix(); inst.setMatrixAt(i,dm.matrix); }
  scene.add(inst);
}

/* 火車 */
const TRAIN_Z0=-6, TRAIN_Z1=35;
const DEPART=new THREE.Vector3(2.7,0,26);
const colliders=[];
let trainGroup=null;
{
  const t=new THREE.Group();
  const iron=M(0x2b323b), dark=M(0x15181d), plate=M(0x47352a), brass=M(0xb08a4a);
  const base=box(3.2,0.8,11,dark); base.position.set(0,1.0,29.5); t.add(base);
  const boiler=cyl(1.25,1.25,7.4,iron,16); boiler.rotation.x=Math.PI/2; boiler.position.set(0,2.6,31); t.add(boiler);
  for(const z of [28.5,31,33.5]){ const b=cyl(1.3,1.3,0.18,brass,16); b.rotation.x=Math.PI/2; b.position.set(0,2.6,z); t.add(b); }
  const cab=box(3.1,3.2,3.4,plate); cab.position.set(0,2.9,25.8); t.add(cab);
  const roof=box(3.5,0.25,3.8,dark); roof.position.set(0,4.6,25.8); t.add(roof);
  const chim=cyl(0.36,0.5,1.8,dark); chim.position.set(0,4.4,33.6); t.add(chim);
  const plow=box(3.2,1.2,1.2,iron); plow.position.set(0,0.9,35); plow.rotation.x=-0.5; t.add(plow);
  const lamp=sph(0.32,new THREE.MeshBasicMaterial({color:0xfff1c4})); lamp.position.set(0,3.2,34.7); t.add(lamp);
  const winMat=new THREE.MeshBasicMaterial({color:0xffb064});
  for(const s of [-1,1]){ const w=box(0.05,0.9,1.4,winMat); w.position.set(s*1.57,3.3,25.8); t.add(w); }
  for(const car of [{z:17.5,c:0x3d4a52},{z:5,c:0x5a3a2a}]){
    const b=box(3.2,0.7,11,dark); b.position.set(0,0.95,car.z); t.add(b);
    const body=box(3.1,3,10.6,car.c); body.position.set(0,2.8,car.z); t.add(body);
    const r=box(3.4,0.25,11,dark); r.position.set(0,4.4,car.z); t.add(r);
    for(const s of [-1,1]) for(let k=-3;k<=3;k+=2){ const w=box(0.05,0.7,1.1,winMat); w.position.set(s*1.57,3.2,car.z+k); t.add(w); }
  }
  const wg=new THREE.CylinderGeometry(0.55,0.55,0.25,14); wg.rotateZ(Math.PI/2);
  for(const z of [-3,1,3,9,13,17,21,25,29,33]) for(const s of [-1,1]){ const w=new THREE.Mesh(wg,dark); w.position.set(s*1.05,0.6,z); t.add(w); }
  scene.add(t); trainGroup=t;
  colliders.push({x0:-1.8,x1:1.8,z0:TRAIN_Z0+0.5,z1:TRAIN_Z1+0.8});
  const warm=new THREE.PointLight(0xff9a3c,1.7,30,1.2); warm.position.set(0,4.5,15); scene.add(warm);
  const warm2=new THREE.PointLight(0xff9a3c,1.1,18,1.2); warm2.position.set(3,3,26); scene.add(warm2);
  const head=new THREE.SpotLight(0xfff1c4,2.2,90,0.42,0.5,1); head.position.set(0,3.2,35); head.target.position.set(0,0,80); scene.add(head,head.target);
}

function dotTex(){ const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d'); const g=x.createRadialGradient(16,16,0,16,16,16); g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,32,32); return new THREE.CanvasTexture(c); }
const DOT=dotTex();
const smoke=[];
for(let i=0;i<18;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0x6b7380,transparent:true,depthWrite:false})); s.userData.t=i/18; scene.add(s); smoke.push(s); }
const SNOW_N=isTouch?1400:2600;
const snowGeo=new THREE.BufferGeometry(), snowPos=new Float32Array(SNOW_N*3);
for(let i=0;i<SNOW_N;i++){ snowPos[i*3]=(Math.random()-.5)*60; snowPos[i*3+1]=Math.random()*25; snowPos[i*3+2]=(Math.random()-.5)*60; }
snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snow=new THREE.Points(snowGeo,new THREE.PointsMaterial({map:DOT,size:0.22,transparent:true,depthWrite:false,color:0xffffff}));
snow.frustumCulled=false; scene.add(snow);

/* =========================================================
   4. 物種模型（設定表的 model 欄位對應到這裡）
   ========================================================= */
function eyes(g,y,z,sp){ const e=new THREE.MeshBasicMaterial({color:0x111111}); for(const s of [-1,1]){ const m=sph(0.045,e); m.position.set(s*sp,y,z); g.add(m);} }
const MODELS = {
  penguin(g){ const b=sph(0.34,0x1b1f27); b.scale.y=1.45; b.position.y=0.5; g.add(b); const bl=sph(0.27,0xf3f4f6); bl.scale.y=1.3; bl.position.set(0,0.46,0.12); g.add(bl); const h=sph(0.22,0x1b1f27); h.position.y=1.0; g.add(h); const bk=new THREE.Mesh(new THREE.ConeGeometry(0.06,0.2,6),M(0xff9a2a)); bk.rotation.x=Math.PI/2; bk.position.set(0,0.98,0.26); g.add(bk); for(const s of [-1,1]){ const f=box(0.16,0.04,0.22,0xff9a2a); f.position.set(s*0.14,0.02,0.08); g.add(f);} eyes(g,1.05,0.19,0.08); },
  fox(g){ const b=box(0.42,0.38,0.8,0xf4f7fa); b.position.y=0.45; g.add(b); const h=box(0.34,0.3,0.34,0xf4f7fa); h.position.set(0,0.7,0.5); g.add(h); const sn=box(0.14,0.12,0.2,0xe8edf2); sn.position.set(0,0.64,0.74); g.add(sn); for(const s of [-1,1]){ const e=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.18,4),M(0xf4f7fa)); e.position.set(s*0.11,0.93,0.48); g.add(e);} for(const [x,z] of [[-.14,.28],[.14,.28],[-.14,-.28],[.14,-.28]]){ const l=box(0.1,0.3,0.1,0xe6ebf0); l.position.set(x,0.15,z); g.add(l);} const t=sph(0.18,0xf4f7fa); t.scale.set(0.9,0.9,2); t.position.set(0,0.5,-0.6); g.add(t); eyes(g,0.76,0.67,0.09); },
  redpanda(g){ const b=box(0.4,0.34,0.72,0xb5482a); b.position.y=0.4; g.add(b); const h=box(0.36,0.3,0.3,0xc25a35); h.position.set(0,0.62,0.44); g.add(h); const f=box(0.24,0.14,0.05,0xf2ead8); f.position.set(0,0.58,0.6); g.add(f); for(const s of [-1,1]){ const e=box(0.1,0.1,0.06,0xf2ead8); e.position.set(s*0.14,0.8,0.42); g.add(e);} for(const [x,z] of [[-.13,.24],[.13,.24],[-.13,-.24],[.13,-.24]]){ const l=box(0.1,0.24,0.1,0x2a1a14); l.position.set(x,0.12,z); g.add(l);} for(let i=0;i<4;i++){ const t=cyl(0.1,0.1,0.15,i%2?0xe8d3b0:0xb5482a,8); t.rotation.x=Math.PI/2; t.position.set(0,0.42+i*0.03,-0.45-i*0.15); g.add(t);} eyes(g,0.66,0.6,0.08); },
  monkey(g){ const b=sph(0.3,0x9a9590); b.scale.y=1.2; b.position.y=0.45; g.add(b); const h=sph(0.22,0x9a9590); h.position.y=0.92; g.add(h); const f=sph(0.15,0xd9726a); f.scale.z=0.5; f.position.set(0,0.9,0.15); g.add(f); for(const s of [-1,1]){ const a=cyl(0.06,0.06,0.45,0x9a9590,6); a.position.set(s*0.3,0.42,0.08); a.rotation.z=s*0.3; g.add(a);} eyes(g,0.94,0.22,0.06); },
  hare(g){ const b=sph(0.26,0xf6f7f9); b.scale.set(1,0.9,1.3); b.position.y=0.3; g.add(b); const h=sph(0.17,0xf6f7f9); h.position.set(0,0.52,0.28); g.add(h); for(const s of [-1,1]){ const e=box(0.06,0.32,0.05,0xf6f7f9); e.position.set(s*0.07,0.8,0.24); g.add(e);} eyes(g,0.56,0.42,0.07); }
};

/* 通用體型：species.json 的 body 欄位（type、size、color、accent 與特徵旗標）*/
function bodyModel(g,b){
  const C=hex(b.color||'#888888'), A=hex(b.accent||b.color||'#444444');
  const leg=(x,z,h,w=0.1,c=C)=>{ const l=box(w,h,w,c); l.position.set(x,h/2,z); g.add(l); };
  const t=b.type;
  if(t==='quad'){
    const L=b.long?1.15:0.9, H=b.bulky?0.55:0.42, W=b.bulky?0.55:0.4, lh=b.longLegs?0.6:(b.short?0.18:0.32), y=lh+H/2;
    const body=box(W,H,L,C); body.position.y=y; g.add(body);
    for(const [x,z] of [[-W/2+0.07,L/2-0.12],[W/2-0.07,L/2-0.12],[-W/2+0.07,-L/2+0.12],[W/2-0.07,-L/2+0.12]]) leg(x,z,lh,b.bulky?0.16:0.1);
    let hx=0, hy=y+H*0.35, hz=L/2+0.12;
    if(b.neck){ const n=box(0.16,b.neck,0.18,C); n.position.set(0,y+b.neck/2+H*0.2,L/2-0.05); g.add(n); hy=y+b.neck+H*0.2; hz=L/2; }
    const head=box(0.3,0.28,0.34,C); head.position.set(hx,hy,hz); g.add(head);
    if(b.snout){ const sn=box(0.1,0.1,0.45,C); sn.position.set(0,hy-0.08,hz+0.35); g.add(sn); }
    if(b.trunk){ const tr=cyl(0.07,0.11,0.6,C,6); tr.position.set(0,hy-0.3,hz+0.18); g.add(tr); }
    if(b.tusks) for(const sx of [-1,1]){ const k=new THREE.Mesh(new THREE.ConeGeometry(0.035,0.3,5),M(0xf2efe6)); k.rotation.x=Math.PI/2.4; k.position.set(sx*0.1,hy-0.12,hz+0.22); g.add(k); }
    if(b.horn){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.07,0.3,6),M(0xd9d4cc)); h.position.set(0,hy+0.05,hz+0.2); h.rotation.x=0.5; g.add(h); }
    if(b.horns||b.antlers) for(const sx of [-1,1]){ const h=cyl(0.025,0.04,b.antlers?0.35:0.3,b.antlers?0x6a4a2a:A,5); h.position.set(sx*0.09,hy+0.28,hz-0.05); h.rotation.z=-sx*0.35; g.add(h); }
    if(b.ears) for(const sx of [-1,1]){ const e=box(0.04,0.18,0.14,C); e.position.set(sx*0.2,hy+0.06,hz-0.05); g.add(e); }
    if(b.mane){ const m=sph(0.26,A); m.scale.set(1.1,1.1,0.8); m.position.set(0,hy,hz-0.1); g.add(m); }
    if(b.hump||b.humps){ for(let i=0;i<(b.humps||1);i++){ const h=sph(0.18,b.humps?C:A); h.position.set(0,y+H/2+0.05,(b.humps?(i-0.5)*0.35:L/2-0.25)); g.add(h); } }
    if(b.stripes||b.spots||b.saddle||b.scales) for(let i=-2;i<=2;i++){ if(b.saddle&&i!==0) continue; const s=box(W+0.01,b.spots?0.08:H*0.9,b.saddle?L*0.4:0.06,A); s.position.set(0,b.spots?y+H/2:y,i*L*0.18+(b.spots?(i%2)*0.05:0)); g.add(s); }
    if(b.panda){ for(const sx of [-1,1]){ const p=box(0.08,0.08,0.02,A); p.position.set(sx*0.08,hy+0.03,hz+0.17); g.add(p); } const s=box(W+0.01,H*0.45,L*0.3,A); s.position.set(0,y+H*0.2,L/2-0.2); g.add(s); }
    if(b.mask){ const m=box(0.31,0.07,0.1,A); m.position.set(0,hy+0.03,hz+0.13); g.add(m); }
    if(b.tail){ const tl=cyl(0.04,0.06,0.45,b.stripes?A:C,5); tl.rotation.x=-1.0; tl.position.set(0,y,-L/2-0.15); g.add(tl); }
    eyes(g,hy+0.04,hz+0.17,0.08);
  } else if(t==='bird'){
    const lh=b.longLegs?0.55:(b.ratite?0.7:0.18), body=sph(b.ratite?0.32:0.24,C); body.scale.set(1,0.9,1.3); body.position.y=lh+0.2; g.add(body);
    leg(-0.06,0,lh,0.03,A); leg(0.06,0,lh,0.03,A);
    const nh=b.neck||b.ratite?0.45:0.12, n=cyl(0.05,0.06,nh,C,6); n.position.set(0,lh+0.3+nh/2,0.18); g.add(n);
    const hd=sph(0.11,C); hd.position.set(0,lh+0.32+nh,0.22); g.add(hd);
    const bk=new THREE.Mesh(new THREE.ConeGeometry(0.04,0.18,5),M(A)); bk.rotation.x=Math.PI/2; bk.position.set(0,lh+0.3+nh,0.36); g.add(bk);
    if(b.casque){ const c=box(0.06,0.1,0.14,A); c.position.set(0,lh+0.42+nh,0.25); g.add(c); }
    if(!b.ratite) for(const sx of [-1,1]){ const w=box(0.03,0.16,0.36,C); w.position.set(sx*0.24,lh+0.22,0); g.add(w); }
    if(b.longTail){ const tl=box(0.06,0.03,0.6,A); tl.position.set(0,lh+0.2,-0.5); g.add(tl); }
    eyes(g,lh+0.35+nh,0.3,0.06);
  } else if(t==='primate'){
    const s=b.big?1.3:1, bd=sph(0.3*s,C); bd.scale.y=1.2; bd.position.y=0.45*s; g.add(bd);
    const hd=sph(0.2*s,C); hd.position.y=(b.upright?1.0:0.9)*s; g.add(hd);
    const f=sph(0.13*s,A); f.scale.z=0.5; f.position.set(0,0.88*s,0.13*s); g.add(f);
    for(const sx of [-1,1]){ const a=cyl(0.06*s,0.06*s,(b.longArms?0.75:0.45)*s,C,6); a.position.set(sx*0.3*s,0.42*s,0.05); a.rotation.z=sx*0.25; g.add(a); }
    if(b.ears) for(const sx of [-1,1]){ const e=sph(0.08*s,C); e.position.set(sx*0.18*s,1.0*s,0); g.add(e); }
    if(b.tail){ for(let i=0;i<5;i++){ const tl=sph(0.05*s,b.ringTail&&i%2?A:C); tl.position.set(0,0.3*s+i*0.06,-0.3*s-i*0.08); g.add(tl); } }
    eyes(g,0.93*s,0.17*s,0.06*s);
  } else if(t==='reptile'){
    if(b.snake){ for(let i=0;i<9;i++){ const p=sph(0.08,i%2?A:C); p.position.set(Math.sin(i*0.9)*0.25,0.08,0.4-i*0.12); g.add(p); } eyes(g,0.12,0.47,0.04); }
    else if(b.shell){ const sh=sph(0.35,C); sh.scale.set(1,0.6,1.2); sh.position.y=0.25; g.add(sh); const hd=sph(0.1,A); hd.position.set(0,0.2,0.45); g.add(hd); for(const [x,z] of [[-.22,.25],[.22,.25],[-.22,-.25],[.22,-.25]]) leg(x,z,0.14,0.1,A); eyes(g,0.24,0.53,0.05); }
    else { const L=b.croc?1.4:0.6, bd=box(0.3,0.16,L,C); bd.position.y=0.14; g.add(bd); const hd=box(0.2,0.12,b.croc?0.6:0.2,A); hd.position.set(0,0.14,L/2+(b.croc?0.3:0.1)); g.add(hd); const tl=new THREE.Mesh(new THREE.ConeGeometry(0.1,L*0.7,5),M(C)); tl.rotation.x=-Math.PI/2; tl.position.set(0,0.12,-L/2-L*0.35); g.add(tl); for(const [x,z] of [[-.18,L/3],[.18,L/3],[-.18,-L/3],[.18,-L/3]]) leg(x,z,0.1,0.07); eyes(g,0.22,L/2+0.12,0.06); }
  } else if(t==='frog'){
    const bd=sph(0.2,C); bd.scale.set(1,0.7,1.1); bd.position.y=0.14; g.add(bd);
    for(const sx of [-1,1]){ const e=sph(0.06,C); e.position.set(sx*0.1,0.27,0.12); g.add(e); const l=box(0.08,0.06,0.25,C); l.position.set(sx*0.17,0.04,-0.05); g.add(l); }
    eyes(g,0.29,0.17,0.1);
  } else if(t==='insect'){
    const bd=box(0.12,0.1,b.stick?0.7:0.35,C); bd.position.y=0.25; g.add(bd);
    if(b.wings) for(const sx of [-1,1]){ const w=box(0.4,0.02,0.32,A); w.position.set(sx*0.24,0.3,0); w.rotation.z=sx*0.3; g.add(w); }
    if(b.horn){ const h=new THREE.Mesh(new THREE.ConeGeometry(0.03,0.2,4),M(A)); h.rotation.x=-0.6; h.position.set(0,0.33,0.24); g.add(h); }
    if(b.pincers) for(const sx of [-1,1]){ const p=box(0.03,0.03,0.18,A); p.position.set(sx*0.05,0.26,0.25); p.rotation.y=-sx*0.4; g.add(p); }
    if(b.mantis||b.longArms) for(const sx of [-1,1]){ const p=box(0.03,0.03,b.longArms?0.35:0.2,A); p.position.set(sx*0.08,0.28,0.25); g.add(p); }
    for(const sx of [-1,1]) for(const z of [-0.1,0,0.1]){ const l=box(0.2,0.02,0.02,0x1d1c1e); l.position.set(sx*0.12,0.18,z); g.add(l); }
  } else if(t==='fish'){
    if(b.ray){ const bd=sph(0.4,C); bd.scale.set(1.2,0.15,1); bd.position.y=0.15; g.add(bd); const tl=box(0.04,0.04,0.7,A); tl.position.set(0,0.15,-0.7); g.add(tl); }
    else { const bd=sph(0.25,C); bd.scale.set(0.6,0.8,1.5); bd.position.y=0.3; g.add(bd); const tl=new THREE.Mesh(new THREE.ConeGeometry(0.18,0.3,4),M(A)); tl.rotation.x=Math.PI/2; tl.position.set(0,0.3,-0.45); g.add(tl); const fin=box(0.03,0.18,0.2,A); fin.position.set(0,0.52,0); g.add(fin); eyes(g,0.35,0.3,0.1); }
  } else if(t==='hare'){ MODELS.hare(g); g.children.forEach(m=>{ if(m.material&&m.material.color&&m.material.color.getHex()===0xf6f7f9) m.material=M(C); }); }
  else if(t==='penguin'){ MODELS.penguin(g); }
  else MODELS.hare(g);
  if(b.size) g.scale.setScalar(b.size);
}
function makeModel(sp){
  const g=new THREE.Group();
  if(typeof sp==='string') (MODELS[sp]||MODELS.hare)(g);
  else if(sp.model&&MODELS[sp.model]) MODELS[sp.model](g);
  else if(sp.body){ const inner=new THREE.Group(); bodyModel(inner,sp.body); g.add(inner); }
  else MODELS.hare(g);
  if(typeof sp!=='string'){ const a=speciesAsset(sp); if(a) swapInAsset(g,a.file,a.opt,a.anim); }
  return g;
}

/* =========================================================
   5. 站點生成（依 stations.json）
   ========================================================= */
let world=null, interactables=[], wraiths=[], flares=[], followers=[], rng;
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const R=(a,b)=>a+rng()*(b-a);
const RI=(a,b)=>Math.floor(R(a,b+1));
function pickWeighted(list, w){ const tot=list.reduce((s,x)=>s+w(x),0); let r=rng()*tot; for(const x of list){ r-=w(x); if(r<=0) return x; } return list[list.length-1]; }
const markerLoot=new THREE.MeshBasicMaterial({color:0xff9a3c});
const iceMat=new THREE.MeshPhongMaterial({color:0xa8e4ff,transparent:true,opacity:0.55,shininess:90,emissive:0x1d4a66});
const farFromTrain=(x,z,m)=>Math.abs(x)>9+m||z<TRAIN_Z0-20||z>TRAIN_Z1+20;
function addMarker(g,mat,y){ const m=new THREE.Mesh(new THREE.OctahedronGeometry(0.18),mat); m.position.y=y; m.userData.spin=true; g.add(m); return m; }

let curNode=null, curStation=null, warmZones=[], lakeInfo=null, container=[];
function speciesPool(node,cats){
  let pool=DATA.species.filter(s=>cats.includes(s.category)&&s.spawn.includes(node.type)&&((s.model&&MODELS[s.model])||s.body));
  if(node.zones&&node.zones.length){ const z=pool.filter(s=>node.zones.includes(s.zone)); if(z.length) pool=z; }
  return pool;
}
function pickSpecies(node,cats){
  const pool=speciesPool(node,cats); if(!pool.length) return null;
  const tw=DATA.config.tiers[node.tier]?DATA.config.tiers[node.tier].rarityWeight:{common:1,rare:1,endangered:1,legendary:1}, bonus=DATA.config.undiscoveredBonus||1;
  return pickWeighted(pool,s=>(tw[s.rarity]||0.01)*(save.collection[s.id]?1:bonus));
}
function buildStation(node, seed){
  const st=DATA.stationById[node.type]||DATA.stationById.ruins;
  curNode=node; curStation=st; warmZones=[]; lakeInfo=null;
  if(world) scene.remove(world);
  world=new THREE.Group(); scene.add(world);
  colliders.length=1; interactables=[]; wraiths=[]; flares=[]; followers=[];
  rng=mulberry32(seed);
  const wallMat=M(0x5b6068), woodMat=M(0x4a3a30), snowCap=M(0xf2f6fa);
  const avoid=(x,z)=>(lakeInfo&&Math.hypot(x-lakeInfo.x,z-lakeInfo.z)<lakeInfo.r+3)||warmZones.some(w=>Math.hypot(x-w.x,z-w.z)<w.r+2);
  if(st.lake){
    const L=st.lake; lakeInfo={x:L.x,z:L.z,r:L.radius};
    const lg=new THREE.CircleGeometry(L.radius,56); lg.rotateX(-Math.PI/2);
    const p=lg.attributes.position; for(let i=0;i<p.count;i++) p.setY(i,heightAt(p.getX(i)+L.x,p.getZ(i)+L.z)+0.07);
    lg.computeVertexNormals();
    const lake=new THREE.Mesh(lg,new THREE.MeshPhongMaterial({color:0x9fd2ea,shininess:90,emissive:0x0e2a3a})); lake.position.set(L.x,0,L.z); world.add(lake);
  }
  if(st.greenhouses){
    const glass=new THREE.MeshPhongMaterial({color:0xcfe9f0,transparent:true,opacity:0.28,shininess:100,depthWrite:false}), frame=M(0x3a4a44), leaf=M(0x3a7a3a), soil=M(0x4a3a2a);
    let t2=0;
    while(warmZones.length<st.greenhouses && t2++<300){
      const a=R(0,Math.PI*2), r=R(24,120), x=Math.cos(a)*r, z=Math.sin(a)*r;
      if(!farFromTrain(x,z,6)||warmZones.some(w=>Math.hypot(x-w.x,z-w.z)<20)) continue;
      const y=heightAt(x,z), W=st.warmRadius*1.6, H=4;
      const gnd=box(W,0.12,W,soil); gnd.position.set(x,y+0.05,z); world.add(gnd);
      const g=box(W,H,W,glass); g.position.set(x,y+H/2,z); world.add(g);
      for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){ const p=box(0.15,H,0.15,frame); p.position.set(x+sx*W/2,y+H/2,z+sz*W/2); world.add(p); }
      const ridge=box(W,0.15,0.15,frame); ridge.position.set(x,y+H,z); world.add(ridge);
      for(let k=0;k<6;k++){ const c=new THREE.Mesh(new THREE.ConeGeometry(R(0.4,0.8),R(1,2.2),6),leaf); c.position.set(x+R(-W/2+1,W/2-1),y+0.9,z+R(-W/2+1,W/2-1)); world.add(c); }
      warmZones.push({x,z,r:st.warmRadius});
    }
  }
  const ruins=[]; let tries=0;
  while(ruins.length<st.ruins && tries++<400){
    const a=R(0,Math.PI*2), r=R(26,135), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(!farFromTrain(x,z,4) || avoid(x,z) || ruins.some(o=>Math.hypot(o.x-x,o.z-z)<18)) continue;
    ruins.push({x,z});
  }
  for(const o of ruins){
    const y=heightAt(o.x,o.z), hgt=R(2.2,4.2), sz=R(5,7), skip=Math.floor(R(0,4)), mat=rng()<0.5?wallMat:woodMat;
    [{w:sz,d:0.4,x:0,z:-sz/2},{w:sz,d:0.4,x:0,z:sz/2},{w:0.4,d:sz,x:-sz/2,z:0},{w:0.4,d:sz,x:sz/2,z:0}].forEach((wl,i)=>{
      if(i===skip) return;
      const hh=hgt*R(0.5,1), m=box(wl.w,hh,wl.d,mat); m.position.set(o.x+wl.x,y+hh/2-0.3,o.z+wl.z); world.add(m);
      const cap=box(wl.w+0.1,0.15,wl.d+0.1,snowCap); cap.position.set(m.position.x,y+hh-0.25,m.position.z); world.add(cap);
      colliders.push({x0:m.position.x-wl.w/2,x1:m.position.x+wl.w/2,z0:m.position.z-wl.d/2,z1:m.position.z+wl.d/2});
    });
    const n=RI(st.cratesPerRuin[0],st.cratesPerRuin[1]);
    for(let k=0;k<n;k++) addCrate(o.x+R(-1.6,1.6),o.z+R(-1.6,1.6));
  }
  for(let i=0;i<st.looseCrates;i++){ const a=R(0,Math.PI*2), r=R(18,110), x=Math.cos(a)*r, z=Math.sin(a)*r; if(farFromTrain(x,z,2)&&!avoid(x,z)) addCrate(x,z); }
  const trunk=M(0x2b2420), pine=M(0x23362f);
  for(let i=0;i<st.trees;i++){
    const a=R(0,Math.PI*2), r=R(15,190), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(!farFromTrain(x,z,1)||avoid(x,z)) continue;
    const y=heightAt(x,z);
    const assetPick=(list,o)=>{ const A=DATA.assets; if(!A) return null; const f=A.nature[list][Math.floor(rng()*A.nature[list].length)]; return staticAsset(f,o); };
    if(rng()<0.65){
      const h=R(3,6), at=assetPick('snowTrees',{height:h*1.15});
      if(at){ at.rotation.y=R(0,6.28); const w=new THREE.Group(); w.add(at); w.position.set(x,y-0.1,z); w.rotation.y=R(0,6.28); world.add(w); colliders.push({x0:x-0.35,x1:x+0.35,z0:z-0.35,z1:z+0.35}); continue; }
      const g=new THREE.Group();
      const t=cyl(0.15,0.25,h,trunk,6); t.position.y=h/2; g.add(t);
      if(rng()<0.6){ const c=new THREE.Mesh(new THREE.ConeGeometry(R(1,1.6),h*0.8,7),pine); c.position.y=h*0.75; g.add(c); const s=new THREE.Mesh(new THREE.ConeGeometry(0.7,0.8,7),snowCap); s.position.y=h*1.1; g.add(s); }
      g.position.set(x,y-0.2,z); world.add(g); colliders.push({x0:x-0.3,x1:x+0.3,z0:z-0.3,z1:z+0.3});
    } else {
      const s=R(0.6,1.8), ar=assetPick('snowRocks',{height:s*1.3});
      if(ar){ const w=new THREE.Group(); w.add(ar); w.position.set(x,y-0.05,z); w.rotation.y=R(0,6.28); world.add(w); colliders.push({x0:x-s*0.7,x1:x+s*0.7,z0:z-s*0.7,z1:z+s*0.7}); continue; }
      const rk=new THREE.Mesh(new THREE.DodecahedronGeometry(s,0),M(0x6a7078)); rk.position.set(x,y+s*0.3,z); rk.rotation.set(R(0,3),R(0,3),0); world.add(rk);
      colliders.push({x0:x-s*0.8,x1:x+s*0.8,z0:z-s*0.8,z1:z+s*0.8});
    }
  }
  // 冰封生物：依站點類型的類別、路線節點的展區與層級稀有度抽選
  let placed=0; tries=0;
  while(st.ice && placed<st.ice.count && tries++<400){
    const sp=pickSpecies(node,st.ice.categories); if(!sp) break;
    const minD=DATA.config.rarity[sp.rarity].minDist;
    const a=R(0,Math.PI*2), r=R(minD,Math.max(minD+20,130)), x=Math.cos(a)*r, z=Math.sin(a)*r;
    if(!farFromTrain(x,z,6)||avoid(x,z)) continue;
    if(interactables.some(it=>it.type==='ice'&&Math.hypot(it.pos.x-x,it.pos.z-z)<25)) continue;
    placeIce(sp,x,z,R(0,6.28)); placed++;
  }
  // 釣魚洞／昆蟲
  const C=st.catch;
  if(C) for(let i=0;i<C.count;i++){
    const sp=pickSpecies(node,C.categories); if(!sp) break;
    let x,z;
    if(C.kind==='hole'&&lakeInfo){ const a=R(0,6.28), r=R(4,lakeInfo.r*0.85); x=lakeInfo.x+Math.cos(a)*r; z=lakeInfo.z+Math.sin(a)*r; }
    else if(warmZones.length){ const w=warmZones[Math.floor(R(0,warmZones.length))], a=R(0,6.28), r=R(0,w.r*0.7); x=w.x+Math.cos(a)*r; z=w.z+Math.sin(a)*r; }
    else { const a=R(0,6.28), r=R(20,110); x=Math.cos(a)*r; z=Math.sin(a)*r; }
    placeCatch(sp,C,x,z);
  }
}
function placeCatch(sp,C,x,z){
  const y=heightAt(x,z), g=new THREE.Group(); g.position.set(x,y,z);
  const rc=new THREE.MeshBasicMaterial({color:hex(DATA.config.rarity[sp.rarity].color)});
  let bug=null;
  if(C.kind==='hole'){ const h=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.7,0.05,20),new THREE.MeshBasicMaterial({color:0x0c2433})); h.position.y=0.1; g.add(h); const rim=new THREE.Mesh(new THREE.TorusGeometry(0.75,0.08,6,20),M(0xe8f4fa)); rim.rotation.x=Math.PI/2; rim.position.y=0.12; g.add(rim); }
  else { bug=makeModel(sp); bug.scale.multiplyScalar(1.6); bug.position.y=0.8; g.add(bug); }
  const mk=addMarker(g,rc,C.kind==='hole'?1.4:1.9); world.add(g);
  interactables.push({type:'catch',kind:C.kind,secs:C.seconds,species:sp,pos:new THREE.Vector3(x,y,z),group:g,marker:mk,bug,prog:0,ph:Math.random()*6});
}
function placeIce(sp,x,z,rot){
  const y=heightAt(x,z), g=new THREE.Group(); g.position.set(x,y,z);
  const an=makeModel(sp); an.rotation.y=rot; g.add(an); setAnim(an,'idle'); freezeAnim(an,true);
  const isz=Math.max(1,(sp.body&&sp.body.size)||1)*(sp.body&&sp.body.neck>1?1.6:1);
  const ice=box(1.5*isz,1.5*isz,1.5*isz,iceMat); ice.position.y=0.65*isz; ice.rotation.y=rot*0.3; g.add(ice);
  const mk=addMarker(g,new THREE.MeshBasicMaterial({color:hex(DATA.config.rarity[sp.rarity].color)}),2.2);
  world.add(g);
  const it={type:'ice',pos:new THREE.Vector3(x,y,z),group:g,animal:an,ice,marker:mk,species:sp,thaw:0};
  interactables.push(it); return it;
}
function addCrate(x,z){
  const lw=curStation&&curStation.lootWeights; const item=pickWeighted(DATA.items, i=>lw&&lw[i.id]!=null?lw[i.id]:i.lootWeight);
  const y=heightAt(x,z), g=new THREE.Group(); g.position.set(x,y,z); g.rotation.y=R(0,3);
  const c=box(0.9,0.6,0.6,hex(item.color)); c.position.y=0.3; g.add(c);
  const band=box(0.94,0.08,0.64,0x9a7a3a); band.position.y=0.45; g.add(band);
  const mk=addMarker(g,markerLoot,1.3); world.add(g);
  interactables.push({type:'crate',item,amount:RI(item.amount[0],item.amount[1]),pos:new THREE.Vector3(x,y,z),group:g,marker:mk});
}

/* 霜影 */
const wraithBody=new THREE.MeshLambertMaterial({color:0x101722,transparent:true,opacity:0.82,emissive:0x0a1a2a});
const wraithEye=new THREE.MeshBasicMaterial({color:0x7fe8ff});
function spawnWraith(){
  const a=Math.random()*Math.PI*2, r=38+Math.random()*20, x=player.pos.x+Math.cos(a)*r, z=player.pos.z+Math.sin(a)*r;
  if(distToTrain(x,z)<CFG().heatRadius+8) return;
  const g=new THREE.Group();
  const mat=wraithBody.clone();
  const b=sph(0.6,mat); b.scale.y=1.3; b.position.y=1.5; g.add(b);
  const tail=new THREE.Mesh(new THREE.ConeGeometry(0.55,1.4,10),mat); tail.rotation.x=Math.PI; tail.position.y=0.6; g.add(tail);
  for(const s of [-1,1]){ const e=sph(0.08,wraithEye); e.position.set(s*0.2,1.7,0.48); g.add(e); }
  g.position.set(x,heightAt(x,z),z); world.add(g);
  const wm=(curNode&&DATA.config.tiers[curNode.tier])?DATA.config.tiers[curNode.tier].wraithMult:1;
  wraiths.push({g,mat,hp:Math.ceil(DATA.config.wraith.hp*wm),spd:Math.sqrt(wm),hit:0,phase:Math.random()*6});
}

/* =========================================================
   6. 遠征狀態
   ========================================================= */
let STATS=null;
const CFG=()=>STATS||DATA.config.expedition, TMP=()=>DATA.config.temperature;
const player={pos:new THREE.Vector3(),yaw:0,pitch:0,temp:100,bob:0};
let bag={}, haul={}, rescued=[], weapon, ammo, timeLeft=0, state='boot', sprint=false, nextSpawn=0, ammoTick=0, collapses=0, hurtT=0;
const bagCount=()=>Object.values(bag).reduce((a,b)=>a+b,0);
const zeroItems=()=>Object.fromEntries(DATA.items.map(i=>[i.id,0]));
function distToTrain(x,z){ const cz=Math.max(TRAIN_Z0,Math.min(TRAIN_Z1,z)); return Math.hypot(x,z-cz); }

function startExpedition(node){
  node=node||DATA.mapById.old_town;
  buildStation(node,(Date.now()^((save.runs+1)*7919))>>>0);
  bag=zeroItems(); haul=zeroItems(); rescued=[]; container=[];
  ensureProgress(); STATS=computeStats();
  weapon=DATA.equipById[save.gear.equipped.weapon]||DATA.equipById.flare_gun; ammo=weapon.ammo; fireCd=0; fireHeld=false;
  timeLeft=CFG().runSeconds; collapses=0; nextSpawn=DATA.config.wraith.firstSpawnAt; sprint=false;
  player.pos.set(4.5,0,8); player.yaw=-Math.PI/2; player.pitch=0; player.temp=TMP().max;
  buildBagHud();
  zooActive=false; $('zooUI').hidden=true;
  state='play'; screenEl.hidden=true; $('hud').hidden=false; $('touch').hidden=!isTouch;
  if(!isTouch) tryLock(); else goLandscape();
  $('rotateHint').hidden=!isTouch;
  if(node.type==='stall') toast(`煤炭用完，火車停在半路。下車找到 ${node.need} 塊煤炭，才能繼續開往${node.destName}。`); else toast(`抵達${node.name}。橘色燈號是物資，其他顏色是生物，顏色代表稀有度。${curStation.catch?(curStation.catch.kind==='hole'?'湖面上的冰洞可以釣魚。':'溫室裡比較溫暖，可以捕捉昆蟲。'):''}`);
}

async function goLandscape(){
  try{ if(!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); }catch(e){}
  try{ if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); }catch(e){}
}
/* 輸入 */
const keys={}; let actHeld=false, actPressed=false, locked=false, noLock=false;
const joy={x:0,y:0,id:null};
addEventListener('keydown',e=>{ keys[e.code]=true; if(e.code==='KeyE'){ if(!actHeld) actPressed=true; actHeld=true; } if(e.code.startsWith('Shift')) sprint=true; });
addEventListener('keyup',e=>{ keys[e.code]=false; if(e.code==='KeyE') actHeld=false; if(e.code.startsWith('Shift')) sprint=false; });
const canvas=$('c');
function tryLock(){ if(noLock||!canvas.requestPointerLock){ noLock=true; return; } try{ const p=canvas.requestPointerLock(); if(p&&p.catch) p.catch(()=>{noLock=true;}); }catch(e){ noLock=true; } }
document.addEventListener('pointerlockchange',()=>{ locked=document.pointerLockElement===canvas; });
document.addEventListener('pointerlockerror',()=>{ noLock=true; });
let mDown=false,mMoved=0,mx=0,my=0;
canvas.addEventListener('mousedown',e=>{ if(isTouch) return; mDown=true; mMoved=0; mx=e.clientX; my=e.clientY; if(state==='play'&&locked){ fireHeld=true; fire(); } });
addEventListener('mouseup',()=>{ if(isTouch||!mDown) return; mDown=false; if(state==='zoowalk'){ if(!locked&&!noLock) tryLock(); return; } fireHeld=false; if(state!=='play') return; if(locked){} else if(noLock){ if(mMoved<6) fire(); } else tryLock(); });
addEventListener('mousemove',e=>{ if(isTouch||(state!=='play'&&state!=='zoowalk')) return; if(locked) look(e.movementX,e.movementY,0.0022); else if(mDown&&noLock){ const dx=e.clientX-mx, dy=e.clientY-my; mMoved+=Math.abs(dx)+Math.abs(dy); mx=e.clientX; my=e.clientY; look(dx,dy,0.004); } });
function look(dx,dy,s){ player.yaw-=dx*s; player.pitch=Math.max(-1.35,Math.min(1.35,player.pitch-dy*s)); }
const stick=$('stick'), knob=$('knob'), lookTouch={id:null,x:0,y:0};
stick.addEventListener('touchstart',e=>{ e.preventDefault(); if(state==='ctrledit') return; const t=e.changedTouches[0]; joy.id=t.identifier; moveJoy(t); },{passive:false});
function moveJoy(t){ const r=stick.getBoundingClientRect(); let dx=t.clientX-(r.left+r.width/2), dy=t.clientY-(r.top+r.height/2); const d=Math.hypot(dx,dy), m=50; if(d>m){dx=dx/d*m;dy=dy/d*m;} joy.x=dx/m; joy.y=dy/m; knob.style.transform=`translate(${dx}px,${dy}px)`; }
canvas.addEventListener('touchstart',e=>{ for(const t of e.changedTouches) if(lookTouch.id===null){ lookTouch.id=t.identifier; lookTouch.x=t.clientX; lookTouch.y=t.clientY; } },{passive:true});
addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier===joy.id) moveJoy(t); else if(t.identifier===lookTouch.id){ look(t.clientX-lookTouch.x,t.clientY-lookTouch.y,0.006); lookTouch.x=t.clientX; lookTouch.y=t.clientY; } } if(state==='play'||state==='zoowalk'||state==='zoo') e.preventDefault(); },{passive:false});
const endTouch=e=>{ for(const t of e.changedTouches){ if(t.identifier===joy.id){ joy.id=null; joy.x=joy.y=0; knob.style.transform=''; } if(t.identifier===lookTouch.id) lookTouch.id=null; } };
addEventListener('touchend',endTouch); addEventListener('touchcancel',endTouch);
const btnAct=$('btnAct'), btnFire=$('btnFire'), btnRun=$('btnRun');
btnAct.addEventListener('pointerdown',e=>{ e.preventDefault(); if(state==='ctrledit') return; if(!actHeld) actPressed=true; actHeld=true; });
['pointerup','pointercancel','pointerleave'].forEach(ev=>btnAct.addEventListener(ev,()=>{ actHeld=false; }));
btnFire.addEventListener('pointerdown',e=>{ e.preventDefault(); if(state==='ctrledit') return; fireHeld=true; fire(); });
['pointerup','pointercancel','pointerleave'].forEach(ev=>btnFire.addEventListener(ev,()=>{ fireHeld=false; }));
btnRun.addEventListener('pointerdown',e=>{ e.preventDefault(); if(state==='ctrledit') return; sprint=!sprint; btnRun.classList.toggle('on',sprint); });

const flareMat=new THREE.MeshBasicMaterial({color:0xffb064});
let fireCd=0, fireHeld=false;
function fire(){
  if(state!=='play'||fireCd>0) return;
  if(ammo<=0){ if(!weapon.auto||Math.random()<0.05) toast(`${weapon.name}沒彈藥了，回火車補充`); return; }
  ammo--; fireCd=weapon.cooldown||0.2;
  const base=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation), n=weapon.pellets||1, sp=weapon.spread||0, flame=!!weapon.auto;
  for(let k=0;k<n;k++){
    const dir=base.clone(); if(sp){ dir.x+=(Math.random()-0.5)*sp*2; dir.y+=(Math.random()-0.5)*sp*2; dir.z+=(Math.random()-0.5)*sp*2; dir.normalize(); }
    const m=sph(flame?0.18:0.13,flareMat);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:flame?0xff6a1a:0xff9a3c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})); glow.scale.set(flame?2.2:1.6,flame?2.2:1.6,1); m.add(glow);
    m.position.copy(camera.position).addScaledVector(dir,0.6); world.add(m);
    flares.push({m,v:dir.multiplyScalar(weapon.projectileSpeed),life:weapon.life||1.6,dmg:weapon.damage,grav:flame?0:6});
  }
}

/* HUD */
let toastT=0;
function toast(msg){ const t=$('toast'); t.textContent=msg; t.style.opacity=1; toastT=2.8; }
const fmt=s=>{ s=Math.max(0,Math.ceil(s)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
function buildBagHud(){
  $('bagRows').innerHTML=DATA.items.map(i=>`<div class="row"><span>${esc(i.name)}</span><b id="bag_${i.id}">0</b></div>`).join('');
}
function hud(inHeat){
  const T=TMP(), c=31+(player.temp/T.max)*5.8, tt=$('tempTxt');
  tt.textContent=c.toFixed(1)+'°C';
  const pct=player.temp/T.max*100;
  tt.className='num'+(pct<25?' crit':pct<55?' cold':'');
  $('tempFill').style.width=pct+'%';
  $('heatTag').hidden=!inHeat;
  $('vignette').style.opacity=Math.max(0,(55-pct)/55)*0.95;
  $('bagCap').textContent=`${bagCount()}/${CFG().bagCapacity}`;
  for(const i of DATA.items) $('bag_'+i.id).textContent=bag[i.id];
  $('bFol').textContent=`${followers.length}/${CFG().followCapacity}`;
  $('bCon').textContent=`${container.length}/${CFG().containerCapacity}`;
  $('sRes').textContent=Object.values(haul).reduce((a,b)=>a+b,0); $('sAni').textContent=rescued.length;
  $('ammo').textContent=`${weapon.name} ${ammo}`;
  const st=$('storm');
  if(timeLeft>0){ st.textContent='暴風雪 '+fmt(timeLeft); st.className='num'+(timeLeft<CFG().stormWarnSeconds?' warn':''); }
  else { st.textContent='暴風雪來了・快登車'; st.className='num warn'; }
  const tz=Math.max(TRAIN_Z0,Math.min(TRAIN_Z1,player.pos.z)), dx=-player.pos.x, dz=tz-player.pos.z;
  const fx=-Math.sin(player.yaw), fz=-Math.cos(player.yaw), rx=Math.cos(player.yaw), rz=-Math.sin(player.yaw);
  $('arrow').style.transform=`rotate(${Math.atan2(dx*rx+dz*rz,dx*fx+dz*fz)}rad)`;
  $('trainDist').textContent=`火車 ${Math.round(Math.hypot(dx,dz))} m`;
}

/* 互動 */
function nearest(){
  let best=null,bd=3.2;
  for(const it of interactables){ if(it.done) continue; const d=Math.hypot(it.pos.x-player.pos.x,it.pos.z-player.pos.z); if(d<bd){bd=d;best=it;} }
  if(Math.hypot(DEPART.x-player.pos.x,DEPART.z-player.pos.z)<3.4) best={type:'depart'};
  return best;
}
let lastTarget=null;
function interact(dt){
  const it=nearest(), pr=$('prompt'), pt=$('promptTxt'), pg=$('prog'), key=isTouch?'互動':'E';
  if(it!==lastTarget && lastTarget && !lastTarget.done){ if(lastTarget.type==='ice'){ lastTarget.thaw=0; lastTarget.ice.scale.setScalar(1); } if(lastTarget.type==='catch') lastTarget.prog=0; }
  lastTarget=it;
  if(!it){ pr.hidden=true; actPressed=false; return; }
  pr.hidden=false; pg.style.width='0';
  if(it.type==='crate'){
    const full=bagCount()>=CFG().bagCapacity;
    pt.textContent=full?'背包已滿，先回火車存放':`[${key}] 搜刮${it.item.name}箱`;
    if(actPressed&&!full){
      const take=Math.min(it.amount,CFG().bagCapacity-bagCount());
      bag[it.item.id]+=take; it.amount-=take; toast(`取得 ${it.item.name} ×${take}`);
      if(it.amount<=0){ it.done=true; world.remove(it.group); }
    }
  } else if(it.type==='ice'){
    const sp=it.species, rar=DATA.config.rarity[sp.rarity];
    if(followers.length>=CFG().followCapacity) pt.textContent=`同時最多帶 ${CFG().followCapacity} 隻，先送回火車`;
    else{
      const known=save.collection[sp.id]?'':'・新物種';
      pt.textContent=`長按 [${key}] 融冰救援 ${sp.name}（${rar.name}${known}）`;
      if(actHeld){ it.thaw+=dt/1.8; it.ice.scale.setScalar(Math.max(0.05,1-it.thaw*0.9)); }
      else if(it.thaw>0){ it.thaw=Math.max(0,it.thaw-dt); it.ice.scale.setScalar(1-it.thaw*0.9); }
      pg.style.width=Math.min(100,it.thaw*100)+'%';
      if(it.thaw>=1){
        it.done=true; it.group.remove(it.ice); it.group.remove(it.marker);
        const an=it.animal; it.group.remove(an); an.position.copy(it.pos); world.add(an); freezeAnim(an,false); setAnim(an,'walk');
        followers.push({mesh:an,species:sp,origin:it.pos.clone(),rot:an.rotation.y,hop:Math.random()*6});
        toast(`${sp.name} 救出來了！帶牠回火車`);
      }
    }
  } else if(it.type==='catch'){
    const cap=CFG().containerCapacity, sp=it.species, rar=DATA.config.rarity[sp.rarity];
    if(container.length>=cap) pt.textContent=`容器滿了（${cap}），先回火車`;
    else{
      pt.textContent=it.kind==='hole'?`長按 [${key}] 釣魚（${rar.name}）`:`長按 [${key}] 捕捉 ${sp.name}（${rar.name}${save.collection[sp.id]?'':'・新物種'}）`;
      if(actHeld) it.prog+=dt*(CFG().catchSpeed||1)/it.secs; else it.prog=Math.max(0,it.prog-dt);
      pg.style.width=Math.min(100,it.prog*100)+'%';
      if(it.prog>=1){ it.done=true; world.remove(it.group); container.push(sp.id); toast(`${it.kind==='hole'?'釣到':'抓到'} ${sp.name}（${rar.name}${save.collection[sp.id]?'':'・新物種'}）`); }
    }
  } else if(it.type==='depart'){
    pt.textContent=`[${key}] 登車出發`;
    if(actPressed) askDepart();
  }
  actPressed=false;
}
function depositAll(){ for(const k in bag){ haul[k]+=bag[k]; bag[k]=0; } }
function boardContainer(){ const n=container.length; rescued.push(...container); container=[]; return n; }
function boardFollowers(){ for(const f of followers){ rescued.push(f.species.id); world.remove(f.mesh); } const names=followers.map(f=>f.species.name); followers=[]; return names; }

function askDepart(){
  state='confirm'; if(document.exitPointerLock) document.exitPointerLock();
  const left=followers.length?`還有 ${followers.length} 隻跟著你，牠們會一起上車。`:'';
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="card"><h2>現在出發？</h2><p>背包裡的物資會自動存進車廂。${left}還沒搜刮的地點就留在這片冰原了。</p>
    <div class="btns"><button class="btn ghost" id="stay" type="button">再找一下</button><button class="btn" id="go" type="button">鳴笛出發</button></div></div>`;
  $('stay').onclick=()=>{ screenEl.hidden=true; state='play'; if(!isTouch) tryLock(); };
  $('go').onclick=()=>{ depositAll(); boardFollowers(); boardContainer(); finish(false); };
}

function collapse(){
  const D=DATA.config.death, T=TMP();
  // 隨機掉落一部分背包物品
  const units=[]; for(const k in bag) for(let i=0;i<bag[k];i++) units.push(k);
  const dropN=Math.round(units.length*D.dropFraction);
  for(let i=0;i<dropN;i++){ const j=Math.floor(Math.random()*units.length); bag[units[j]]--; units.splice(j,1); }
  // 跟隨的生物跑回原地重新被冰封
  const lost=followers.length;
  for(const f of followers){ world.remove(f.mesh); if(D.followersReturnToIce) placeIce(f.species,f.origin.x,f.origin.z,f.rot); }
  followers=[]; collapses++;
  const lostC=container.length; container=[];
  if(timeLeft<=0){ finish(true); return; }
  player.pos.set(4.5,0,8); player.temp=T.respawnTemp; timeLeft=Math.max(5,timeLeft-T.collapseTimePenalty);
  toast(`你失溫倒下，被列車員拖回來。掉了 ${dropN} 件物資${lost?`，${lost} 隻生物跑回原地`:''}${lostC?`，容器裡的 ${lostC} 隻生物也跑掉了`:''}`);
}

/* 結算 → 寫入存檔 */
function finish(failed){
  state='result'; $('rotateHint').hidden=true; if(document.exitPointerLock) document.exitPointerLock();
  $('hud').hidden=true; $('touch').hidden=true;
  const newOnes=rescued.filter(id=>!save.collection[id]);
  ensureZoo(); save.zoo.research=(save.zoo.research||0)+new Set(newOnes).size*(DATA.config.researchPerNewSpecies||0);
  save.runs++;
  save.map=save.map||{visited:['utopia']}; if(curNode&&curNode.type!=='stall'&&!save.map.visited.includes(curNode.id)) save.map.visited.push(curNode.id);
  for(const k in haul) save.resources[k]=(save.resources[k]||0)+haul[k];
  ensureZoo();
  for(const id of rescued){ save.collection[id]=(save.collection[id]||0)+1; save.zoo.unplaced[id]=(save.zoo.unplaced[id]||0)+1; }
  persist();
  const total=Object.values(haul).reduce((a,b)=>a+b,0);
  const grade=failed?'列車在暴風雪中被迫出發':rescued.length>=4?'傳奇救援':rescued.length>=2?'順利歸隊':'勉強撐過';
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="card">
    <h1><small>EXPEDITION ${String(save.runs).padStart(2,'0')} · ${esc(curNode?curNode.name:'')}</small>${grade}</h1>
    ${failed?'<p>你在暴風雪中失溫，列車員把你拖上車後只能鳴笛離開。</p>':''}
    <div class="ledger">${DATA.items.map(i=>`<div><b class="num">${haul[i.id]}</b><span>${esc(i.name)}</span></div>`).join('')}<div><b class="num">${rescued.length}</b><span>生物</span></div></div>
    ${rescued.length?`<div class="tags">${rescued.map(id=>`<span>${esc(DATA.speciesById[id].name)}${newOnes.includes(id)?'・新':''}</span>`).join('')}</div>`:'<p>這趟沒有救到生物。</p>'}
    <p>共帶回物資 ${total} 單位${collapses?`，途中倒下 ${collapses} 次`:''}${newOnes.length?`，圖鑑新增 ${new Set(newOnes).size} 種`:''}。</p>
    ${curNode&&curNode.type==='stall'?stallButtons():''}
    <button class="btn${curNode&&curNode.type==='stall'?' ghost':''}" id="toHub" type="button">回到烏托邦</button>
  </div>`;
  $('toHub').onclick=()=>enterZoo();
  if(curNode&&curNode.type==='stall') wireStall();
}

/* =========================================================
   7. 營地：存檔總覽與圖鑑
   ========================================================= */
function showDex(){
  state='dex';
  const cats=DATA.config.categories, rar=DATA.config.rarity;
  const found=DATA.species.filter(s=>save.collection[s.id]).length;
  const dexHtml=`<div class="dextabs" role="tablist">${Object.keys(cats).map(c=>{ const list=DATA.species.filter(s=>s.category===c), got=list.filter(s=>save.collection[s.id]).length;
      return `<button type="button" role="tab" class="dextab${dexCat===c?' on':''}" data-cat="${c}" aria-selected="${dexCat===c}">${esc(cats[c].name)} <b class="num">${got}/${list.length}</b></button>`; }).join('')}</div>
    <div class="dexinfo" id="dexInfo">點一下已發現的物種，看牠的資料。</div>
    <div class="dex">${DATA.species.filter(s=>s.category===dexCat).sort((a,b)=>(save.collection[b.id]?1:0)-(save.collection[a.id]?1:0)||(a.zone||'').localeCompare(b.zone||'')).map(s=>{ const n=save.collection[s.id], r=rar[s.rarity];
      return n?`<button type="button" class="dexcell" data-sp="${s.id}" style="--rc:${r.color}"><b>${esc(s.name)}</b><span>${esc(r.name)}・${n} 隻</span></button>`
              :`<div class="unk" style="--rc:${r.color}"><b>？？？</b><span>${esc(r.name)}・${esc(s.zone||'')}${s.spawn.length?'':'・尚未開放'}</span></div>`; }).join('')}</div>`;
  screenEl.hidden=false;
  screenEl.innerHTML=`<div class="hub">
    <div class="hub-head">
      <h1><small>UTOPIA · 冰原最後的避難所</small>烏托邦</h1>
      <span class="savechip ${store.mode==='cloud'?'cloud':''}">${store.mode==='cloud'?'雲端存檔・可跨裝置':'本機存檔'}・已遠征 ${save.runs} 次</span>
    </div>
    ${sb?authHtml():''}
    <div class="sec"><div class="sec-title"><span>倉庫</span></div>
      <div class="ledger">${DATA.items.map(i=>`<div><b class="num">${save.resources[i.id]||0}</b><span>${esc(i.name)}</span></div>`).join('')}<div><b class="num">${Object.values(save.collection).reduce((a,b)=>a+b,0)}</b><span>生物</span></div></div>
    </div>
    <div class="sec"><div class="sec-title"><span>圖鑑</span><b>${found}/${DATA.species.length}</b></div></div>
    ${dexHtml}
    <div class="soon">水生與昆蟲要等冰湖、溫室站點開放後才能取得（第三階段）。</div>
    <div class="keys">${isTouch?`<kbd>左側搖桿</kbd><span>移動</span><kbd>右半邊拖曳</kbd><span>轉視角</span><kbd>互動</kbd><span>搜刮・長按融冰・登車出發</span><kbd>信號槍</kbd><span>驅散霜影</span>`
      :`<kbd>WASD</kbd><span>移動</span><kbd>滑鼠</kbd><span>轉視角（點畫面鎖定游標）</span><kbd>Shift</kbd><span>奔跑（更耗體溫）</span><kbd>E</kbd><span>搜刮・長按融冰・登車出發</span><kbd>左鍵</kbd><span>信號槍</span>`}</div>
    <details class="credits"><summary>製作群與素材授權</summary>
      <p>動物模型：0 A.D. © <a href="https://www.wildfiregames.com/" target="_blank" rel="noopener">Wildfire Games</a>，以 <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC-BY-SA 3.0</a> 授權（模型經過格式轉換）。</p>
      <p>動物、魚、樹木與岩石：<a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a>（CC0）。火車：<a href="https://kenney.nl" target="_blank" rel="noopener">Kenney</a>（CC0）。地形材質：<a href="https://ambientcg.com" target="_blank" rel="noopener">ambientCG</a>（CC0）。</p>
      <p>物種資料：臺北市立動物園開放資料。</p>
    </details>
    <div class="btns"><button class="btn ghost" id="backZoo" type="button">回到園區</button><button class="btn" id="goExp" type="button">出發遠征</button></div>
  </div>`;
  $('goExp').onclick=()=>showMap();
  $('backZoo').onclick=()=>{ screenEl.hidden=true; state='zoo'; $('zooUI').hidden=false; };
  if(sb) wireAuth();
  screenEl.querySelectorAll('.dextab').forEach(el=>el.onclick=()=>{ dexCat=el.dataset.cat; showDex(); });
  screenEl.querySelectorAll('.dexcell').forEach(el=>el.onclick=()=>{
    const sp=DATA.speciesById[el.dataset.sp], r=DATA.config.rarity[sp.rarity];
    $('dexInfo').innerHTML=`<b>${esc(sp.name)}</b> <i>${esc(sp.latin||'')}</i><span>${esc(sp.zone||'')}・${esc(r.name)}${sp.conservation?'・'+esc(sp.conservation):''}・適溫 ${sp.tempRange[0]}～${sp.tempRange[1]}°C・${esc(sp.diet)}・${esc(sp.social)}</span>${sp.fact?`<p>${esc(sp.fact)}</p>`:''}`;
  });
}
let dexCat='mammal';
if(sb) sb.auth.onAuthStateChange(async (ev)=>{ if(ev==='SIGNED_IN' && !sbUser && (state==='dex'||state==='zoo')){ await initSave(); careerSave=save; activeSlot='career'; enterZoo(); } });
function authHtml(){
  if(sbUser) return `<div class="sec"><div class="auth"><span class="auth-note">已登入 ${esc(sbUser.email||'')}，進度會同步到雲端</span><button class="btn ghost" id="logout" type="button">登出</button></div></div>`;
  return `<div class="sec"><form class="auth" id="loginForm"><input id="email" type="email" required placeholder="輸入 Email 登入，跨裝置同步存檔" autocomplete="email"><button class="btn" type="submit">寄登入連結</button></form><span class="auth-note" id="authMsg">沒登入也能玩，進度會先存在這台裝置。</span></div>`;
}
function wireAuth(){
  const f=$('loginForm');
  if(f) f.addEventListener('submit',async e=>{
    e.preventDefault();
    const email=$('email').value.trim(), msg=$('authMsg');
    msg.textContent='寄送中…';
    const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});
    msg.textContent=error?`寄送失敗：${error.message}`:`登入連結已寄到 ${email}，在這台裝置打開信件裡的連結就完成登入。`;
  });
  const lo=$('logout');
  if(lo) lo.onclick=async()=>{ await sb.auth.signOut(); sbUser=null; store=LocalStore; enterZoo(); };
}

/*@@ZOO@@*/
/*@@MAP@@*/
/*@@WORKSHOP@@*/
/*@@BREEDING@@*/
/*@@CREATIVE@@*/
/*@@ASSETS@@*/
/*@@OPS@@*/
/*@@RESEARCH@@*/
/*@@MODES@@*/
/*@@CONTROLS@@*/
/* =========================================================
   8. 主迴圈
   ========================================================= */
const clock=new THREE.Clock(), tmpV=new THREE.Vector3();
function collide(p,r){
  for(const b of colliders){
    const cx=Math.max(b.x0,Math.min(p.x,b.x1)), cz=Math.max(b.z0,Math.min(p.z,b.z1)), dx=p.x-cx, dz=p.z-cz, d2=dx*dx+dz*dz;
    if(d2<r*r){ if(d2>1e-6){ const d=Math.sqrt(d2); p.x=cx+dx/d*r; p.z=cz+dz/d*r; } else { const mx=(b.x0+b.x1)/2; p.x=p.x>mx?b.x1+r:b.x0-r; } }
  }
  const d=Math.hypot(p.x,p.z); if(d>185){ p.x*=185/d; p.z*=185/d; }
}
function update(dt){
  if(zooActive){ zooUpdate(dt); return; }
  const t=clock.elapsedTime;
  if(world) world.traverse(o=>{ if(o.userData.spin){ o.rotation.y+=dt*2; o.position.y+=Math.sin(t*3)*0.003; } });
  for(const it of interactables) if(it.bug&&!it.done){ it.bug.position.y=0.8+Math.sin(t*4+it.ph)*0.25; it.bug.rotation.y+=dt*1.5; }
  for(const s of smoke){ s.userData.t=(s.userData.t+dt*0.18)%1; const k=s.userData.t; s.position.set(Math.sin(k*5)*0.6,5+k*9,33.6-k*7); const sc=0.8+k*4; s.scale.set(sc,sc,1); s.material.opacity=0.55*(1-k); }
  const playing=state==='play'||state==='confirm';
  const stormK=playing?(timeLeft<=0?1:Math.max(0,1-timeLeft/45)):0;
  const p=snowGeo.attributes.position.array, wind=2+stormK*14;
  for(let i=0;i<SNOW_N;i++){ p[i*3+1]-=dt*(2.2+stormK*3); p[i*3]+=dt*wind*0.6; p[i*3+2]+=dt*wind*0.3; if(p[i*3+1]<0)p[i*3+1]+=25; if(p[i*3]>30)p[i*3]-=60; if(p[i*3+2]>30)p[i*3+2]-=60; }
  snowGeo.attributes.position.needsUpdate=true;
  snow.position.set(player.pos.x,player.pos.y-6,player.pos.z);
  scene.fog.density=0.016+stormK*0.05;
  scene.fog.color.copy(SKY).lerp(STORM_SKY,stormK*0.7); scene.background.copy(scene.fog.color);
  if(state!=='play'){
    if(state==='hub'||state==='boot') player.yaw+=dt*0.03;
    camera.position.set(player.pos.x,heightAt(player.pos.x,player.pos.z)+1.65,player.pos.z); camera.rotation.set(player.pitch,player.yaw,0); return;
  }
  const C=CFG(), T=TMP(), W=DATA.config.wraith;
  timeLeft-=dt;
  if(toastT>0){ toastT-=dt; if(toastT<=0) $('toast').style.opacity=0; }
  let ix=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joy.x, iz=(keys.KeyS?1:0)-(keys.KeyW?1:0)+joy.y;
  const il=Math.hypot(ix,iz); if(il>1){ix/=il;iz/=il;}
  const speed=sprint?C.sprintSpeed:C.walkSpeed, sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  player.pos.x+=(ix*cy+iz*sy)*speed*dt; player.pos.z+=(-ix*sy+iz*cy)*speed*dt;
  collide(player.pos,0.45);
  const moving=il>0.1; if(moving) player.bob+=dt*(sprint?13:9);
  const gy=heightAt(player.pos.x,player.pos.z);
  camera.position.set(player.pos.x,gy+1.65+(moving?Math.sin(player.bob)*0.06:0),player.pos.z);
  camera.rotation.set(player.pitch,player.yaw,0); player.pos.y=gy;

  const inHeat=distToTrain(player.pos.x,player.pos.z)<C.heatRadius;
  if(inHeat){
    player.temp=Math.min(T.max,player.temp+T.heatRegenPerSec*dt);
    if(bagCount()>0){ const n=bagCount(); depositAll(); toast(`存入車廂 ${n} 單位物資`); }
    if(container.length){ const n=boardContainer(); toast(`${n} 隻生物從容器移進車廂`); }
    if(followers.length){ const names=boardFollowers(); toast(`${names.join('、')} 安全上車了`); }
    ammoTick+=dt; if(ammoTick>weapon.refillSeconds&&ammo<weapon.ammo){ ammo++; ammoTick=0; }
    if(curNode&&curNode.type==='stall'&&haul.fuel+bag.fuel>=(curNode.need||0)&&!curNode.told){ curNode.told=true; toast(`煤炭夠了，可以繼續前往${curNode.destName}`); }
  } else {
    const warm=warmZones.some(w=>Math.hypot(player.pos.x-w.x,player.pos.z-w.z)<w.r)?(curStation.warmDrainMult||1):1;
    player.temp-=warm*(CFG().drainMult||1)*(timeLeft<=0?T.stormDrainPerSec:T.drainPerSec+(sprint&&moving?T.sprintExtraDrain:0)+followers.length*T.perFollowerDrain)*dt;
  }
  followers.forEach((f,i)=>{
    const back=1.6+i*1.3; tmpV.set(player.pos.x+Math.sin(player.yaw)*back,0,player.pos.z+Math.cos(player.yaw)*back);
    const m=f.mesh, dx=tmpV.x-m.position.x, dz=tmpV.z-m.position.z, d=Math.hypot(dx,dz);
    if(d>0.3){ const s=Math.min(d,dt*(d>4?9:5)); m.position.x+=dx/d*s; m.position.z+=dz/d*s; m.rotation.y=Math.atan2(dx,dz); f.hop+=dt*12; setAnim(m,d>4?'run':'walk'); } else setAnim(m,'idle');
    m.position.y=heightAt(m.position.x,m.position.z)+(isAnimated(m)?0:Math.abs(Math.sin(f.hop))*0.12);
  });
  const elapsed=C.runSeconds-timeLeft;
  if(elapsed>nextSpawn){
    const max=timeLeft<=0?W.stormMax:W.baseMax+Math.floor(elapsed/W.addMaxEverySeconds);
    if(wraiths.length<max) spawnWraith();
    nextSpawn=elapsed+(timeLeft<=0?W.stormSpawnInterval:W.spawnInterval);
  }
  for(const w of wraiths){
    const g=w.g; w.phase+=dt;
    const dx=player.pos.x-g.position.x, dz=player.pos.z-g.position.z, d=Math.max(0.01,Math.hypot(dx,dz));
    if(d<W.chaseRange&&!inHeat){ const s=(timeLeft<=0?W.stormSpeed:W.speed)*(w.spd||1)*dt; g.position.x+=dx/d*s; g.position.z+=dz/d*s; }
    else { g.position.x+=Math.sin(w.phase*0.5)*dt; g.position.z+=Math.cos(w.phase*0.4)*dt; }
    if(distToTrain(g.position.x,g.position.z)<C.heatRadius+1){ g.position.x-=dx/d*dt*4; g.position.z-=dz/d*dt*4; }
    g.rotation.y=Math.atan2(dx,dz); g.position.y=heightAt(g.position.x,g.position.z)+Math.sin(w.phase*2)*0.25;
    if(w.hit>0){ w.hit-=dt; w.mat.emissive.setHex(0x553311); } else w.mat.emissive.setHex(0x0a1a2a);
    if(d<1.5&&!inHeat){ player.temp-=W.touchDrainPerSec*(CFG().wraithTouchMult||1)*dt; hurtT=0.3; player.pos.x+=dx/d*dt*3; player.pos.z+=dz/d*dt*3; }
  }
  if(hurtT>0) hurtT-=dt; $('hurt').style.opacity=hurtT>0?1:0;
  for(let i=flares.length-1;i>=0;i--){
    const f=flares[i]; f.life-=dt; f.v.y-=(f.grav??6)*dt; f.m.position.addScaledVector(f.v,dt);
    let hit=false;
    for(let j=wraiths.length-1;j>=0;j--){
      const w=wraiths[j];
      if(f.m.position.distanceTo(tmpV.copy(w.g.position).setY(w.g.position.y+1.3))<weapon.range){
        hit=true; w.hp-=f.dmg||1; w.hit=0.25;
        if(w.hp<=0){ world.remove(w.g); wraiths.splice(j,1); toast('霜影被驅散了'); }
        break;
      }
    }
    if(hit||f.life<=0||f.m.position.y<heightAt(f.m.position.x,f.m.position.z)){ world.remove(f.m); flares.splice(i,1); }
  }
  fireCd-=dt; if(weapon.auto&&fireHeld) fire();
  interact(dt);
  if(player.temp<=0) collapse();
  if(state==='play') hud(inHeat);
}
function loop(){ requestAnimationFrame(loop); const dt=Math.min(clock.getDelta(),0.05); update(dt); updateMixers(dt); if(zooActive) renderer.render(zooScene,state==='zoowalk'?camera:zooCam); else renderer.render(scene,camera); }

/* =========================================================
   9. 啟動
   ========================================================= */
player.pos.set(6,0,12); player.yaw=-0.6; player.pitch=0.05;
screenEl.innerHTML='<div class="loading">讀取存檔中…</div>';
loop();
(async()=>{
  try{ await loadData(); }
  catch(e){ screenEl.innerHTML='<div class="card"><h2>遊戲資料讀取失敗</h2><p>設定表沒有載入成功，請重新整理頁面再試一次。</p></div>'; return; }
  screenEl.innerHTML='<div class="loading">載入模型與材質…</div>';
  try{ await preloadCore(); }catch(e){}
  upgradeTrain();
  if(terrainTex&&terrainTex[0]&&groundMesh){ const t=terrainTex[0].clone(); t.needsUpdate=true; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(140,140); groundMesh.material.map=t; groundMesh.material.color.setHex(0xffffff); groundMesh.material.needsUpdate=true; }
  buildStation(DATA.mapById.old_town,12345);
  await initSave(); careerSave=save; activeSlot='career';
  showModeSelect();
})();
})();

