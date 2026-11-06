/* =========================================================
   外部 CC0 素材：glTF 模型（Quaternius、Kenney）與寫實材質（ambientCG）
   對應表在 data/assets.json；模型先用程序模型佔位，載入後再替換
   ========================================================= */
const MODEL_EXT='glb'/*@@MODEL_EXT@@*/;
const assetCache={}, assetWait={};
function modelUrl(file){
  const hasExt=/\.(glb|gltf)$/.test(file);
  if(MODEL_EXT==='json') return 'models/'+file.replace(/\.(glb|gltf)$/,'')+'.json';
  return 'models/'+file+(hasExt?'':'.glb');
}
/* 0 A.D. 動物：模型、動畫、貼圖分開放，載入後組合成一份 */
function loadZad(name){
  const key='zad:'+name; if(assetCache[key]) return Promise.resolve(assetCache[key]); if(assetWait[key]) return assetWait[key];
  const def=DATA.assets.zad[name]; if(!def) return Promise.reject(new Error('no zad'));
  const raw=f=>new Promise((res,rej)=>new THREE.GLTFLoader().load(modelUrl(f),res,undefined,rej));
  const tex=def.tex?new Promise(res=>{ try{ new THREE.TextureLoader().load('models/'+def.tex,t=>{ t.flipY=false; res(t); },undefined,()=>res(null)); }catch(e){ res(null); } }):Promise.resolve(null);
  assetWait[key]=Promise.all([raw(def.mesh),tex,...Object.entries(def.anims||{}).map(([k,f])=>raw(f).then(g=>[k,g]).catch(()=>null))]).then(([g,t,...an])=>{
    g.scene.traverse(o=>{ if(o.isMesh){ o.material=new THREE.MeshStandardMaterial({map:t||null,color:t?0xffffff:0x9a8a7a,roughness:0.9,metalness:0,skinning:!!o.isSkinnedMesh}); } });
    const clips=[];
    for(const x of an){ if(!x) continue; const [k,ga]=x; for(const c of ga.animations){ const cl=c.clone(); cl.name=k; cl.tracks=cl.tracks.filter(tr=>g.scene.getObjectByName(tr.name.split('.')[0])); if(cl.tracks.length) clips.push(cl); break; } }
    g.animations=clips; g.scene.updateMatrixWorld(true);
    g.userData={box:new THREE.Box3().setFromObject(g.scene)};
    assetCache[key]=g; return g;
  });
  return assetWait[key];
}
const mixers=new Set();
function loadAsset(file){
  if(assetCache[file]) return Promise.resolve(assetCache[file]);
  if(assetWait[file]) return assetWait[file];
  if(!THREE.GLTFLoader) return Promise.reject(new Error('no loader'));
  assetWait[file]=new Promise((res,rej)=>{
    try{ new THREE.GLTFLoader().load(modelUrl(file),g=>{
      g.scene.updateMatrixWorld(true);
      g.userData={box:new THREE.Box3().setFromObject(g.scene)};
      assetCache[file]=g; res(g);
    },undefined,e=>{ delete assetWait[file]; rej(e); }); }catch(e){ rej(e); }
  });
  return assetWait[file];
}
function tintObject(obj,tint){
  const c=new THREE.Color(hex(tint));
  obj.traverse(o=>{ if(!o.isMesh) return; const ms=Array.isArray(o.material)?o.material:[o.material];
    const nm=ms.map(m=>{ const k=m.clone(); if(k.color) k.color.lerp(c,0.65); return k; }); o.material=Array.isArray(o.material)?nm:nm[0]; });
}
/* 依高度（或長度）縮放，底部貼地、置中 */
function instAsset(g,opt){
  const animated=g.animations&&g.animations.length&&THREE.SkeletonUtils;
  const obj=animated?THREE.SkeletonUtils.clone(g.scene):g.scene.clone(true);
  const b=g.userData.box, sz=b.getSize(new THREE.Vector3());
  const s=opt.length?opt.length/Math.max(sz.z,sz.x,0.001):opt.scale?opt.scale:(opt.height||1)/Math.max(sz.y,0.001);
  obj.scale.setScalar(s);
  obj.position.set(-(b.min.x+b.max.x)/2*s,-b.min.y*s,-(b.min.z+b.max.z)/2*s);
  if(opt.tint) tintObject(obj,opt.tint);
  obj.traverse(o=>{ if(o.isMesh) o.frustumCulled=false; });
  const out={obj,mixer:null,actions:{},cur:null};
  if(animated){ out.mixer=new THREE.AnimationMixer(obj); for(const a of g.animations) out.actions[a.name.replace(/.*\|/,'')]=out.mixer.clipAction(a); mixers.add(out.mixer); }
  return out;
}
/* 把程序模型換成外部模型（載入完成才換，失敗就維持程序模型） */
function swapInAsset(group,file,opt,anims){
  (typeof file==='function'?file():loadAsset(file)).then(g=>{
    if(group.userData.disposed) return;
    for(const c of [...group.children]) group.remove(c);
    const inst=instAsset(g,opt); group.add(inst.obj);
    group.userData.asset=inst; group.userData.animMap=anims||{};
    setAnim(group,group.userData.wantAnim||'idle');
  }).catch(()=>{});
}
function setAnim(group,kind){
  group.userData.wantAnim=kind;
  const inst=group.userData.asset; if(!inst||!inst.mixer) return;
  const name=(group.userData.animMap||{})[kind]||(group.userData.animMap||{}).idle; const act=name&&inst.actions[name];
  if(!act||inst.cur===act) return;
  act.reset().play(); if(inst.cur) act.crossFadeFrom(inst.cur,0.25,false); inst.cur=act;
}
function freezeAnim(group,frozen){ const inst=group.userData.asset; if(inst&&inst.mixer) inst.mixer.timeScale=frozen?0:1; group.userData.frozen=frozen; }
const isAnimated=group=>!!(group.userData.asset&&group.userData.asset.mixer);
function updateMixers(dt){
  for(const m of mixers){
    let o=m.getRoot(); while(o.parent) o=o.parent;
    if(!o.isScene){ mixers.delete(m); continue; }
    m.update(dt);
  }
}
function speciesAsset(sp){
  const A=DATA.assets; if(!A) return null;
  const map=A.species[sp.id]; if(!map) return null;
  if(map.zad&&A.zad&&A.zad[map.zad]) return {file:()=>loadZad(map.zad),anim:{walk:'walk',idle:'idle',run:'walk',eat:'idle',swim:'walk'},opt:map};
  const an=A.animals[map.asset]; return an?{file:an.file,anim:an.anim,opt:map}:null;
}
/* 靜態物件（樹、岩石）：已載入就直接複製，否則先回傳 null */
function staticAsset(file,opt){ const g=assetCache[file]; if(!g) return null; return instAsset(g,opt).obj; }

/* 開場預先載入：火車、積雪樹木岩石、地形材質 */
let terrainTex=null;
function preloadCore(){
  const A=DATA.assets; if(!A||!THREE.GLTFLoader) return Promise.resolve();
  const files=[A.train.loco,...A.train.cars,'kenney-train/train-carriage-wood',...A.nature.snowTrees,...A.nature.snowRocks];
  const timeout=new Promise(r=>setTimeout(r,9000));
  const tex=new Promise(res=>{ try{ const L=new THREE.TextureLoader(); let n=0; terrainTex=A.terrain.map(u=>L.load(u,()=>{ if(++n===A.terrain.length) res(); },undefined,()=>{ if(++n===A.terrain.length) res(); }));
      terrainTex.forEach(t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; }); }catch(e){ res(); } });
  return Promise.race([Promise.all([...files.map(f=>loadAsset(f).catch(()=>null)),tex]),timeout]);
}
/* 把遠征火車換成 Kenney 火車模型（保留燈光與碰撞） */
function upgradeTrain(){
  const A=DATA.assets; if(!A||!trainGroup) return;
  const loco=assetCache[A.train.loco], cars=A.train.cars.map(f=>assetCache[f]).filter(Boolean);
  if(!loco||cars.length<2) return;
  for(const c of [...trainGroup.children]) c.visible=false;
  const s=A.train.scale;
  const place=(g,z)=>{ const o=instAsset(g,{scale:s}).obj; o.position.z+=z; trainGroup.add(o); return o; };
  place(loco,29.5); place(cars[0],17.5).userData.baseCar=true; place(cars[1],5).userData.baseCar=true;
}

/* 測試用：讓自動測試檢查場景與已載入的素材 */
try{ window.__utopiaDebug={assetCache,loadZad,get zooScene(){ return zooScene; },get scene(){ return scene; },run:src=>eval(src)}; }catch(e){}
