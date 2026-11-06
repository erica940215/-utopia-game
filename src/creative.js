/* =========================================================
   自由建造（第六階段）：地形雕塑與上色、水面、自由擺放物件
   物件來自 data/props.json，地形數值來自 config.terrain
   ========================================================= */
const TRN=()=>DATA.config.terrain;
let zTerrain=null, zWater=null, zGrid=null, zPropRoot=null, zTerrN=0, zTerrSide=0;
const zPropMeshes=new Map();
let zRot=0, zSnap=true, zBrush=3, zBrushing=null, zMoveUid=null, zTab='facility', zSelProp=null;

/* ---------- 地形資料 ---------- */
function ensureTerrain(){
  const side=GN()*TS(), n=Math.round(side/TRN().resolution)+1;
  zTerrN=n; zTerrSide=side;
  const z=save.zoo;
  if(!z.terrain||z.terrain.n!==n){ z.terrain={n,h:new Array(n*n).fill(0),p:new Array(n*n).fill(0)}; }
  z.props=z.props||[];
}
const tIdx=(i,j)=>j*zTerrN+i;
function terrXY(x,z){ const r=TRN().resolution; return {fi:(x+zTerrSide/2)/r, fj:(z+zTerrSide/2)/r}; }
function ZH(x,z){
  const T=save.zoo&&save.zoo.terrain; if(!T) return 0;
  const {fi,fj}=terrXY(x,z); if(fi<0||fj<0||fi>zTerrN-1||fj>zTerrN-1) return 0;
  const i=Math.min(zTerrN-2,Math.floor(fi)), j=Math.min(zTerrN-2,Math.floor(fj)), u=fi-i, v=fj-j, h=T.h;
  return (h[tIdx(i,j)]*(1-u)+h[tIdx(i+1,j)]*u)*(1-v)+(h[tIdx(i,j+1)]*(1-u)+h[tIdx(i+1,j+1)]*u)*v;
}

/* ---------- 地形網格 ---------- */
function noiseTexture(){
  const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d');
  for(let i=0;i<128;i+=2) for(let j=0;j<128;j+=2){ const v=200+Math.floor(Math.random()*55); x.fillStyle=`rgb(${v},${v},${v})`; x.fillRect(i,j,2,2); }
  for(let k=0;k<260;k++){ const v=150+Math.floor(Math.random()*40); x.fillStyle=`rgb(${v},${v},${v})`; x.fillRect(Math.random()*128,Math.random()*128,2+Math.random()*3,1+Math.random()*2); }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat&&t.repeat.set&&t.repeat.set(GN()*TS()/4,GN()*TS()/4); return t;
}
const PAINT_RGB=()=>TRN().paints.map(p=>new THREE.Color(hex(p.color)));
let zVarSeed=null;
function buildTerrainMesh(){
  ensureTerrain();
  const n=zTerrN, side=zTerrSide;
  const g=new THREE.PlaneGeometry(side,side,n-1,n-1); g.rotateX(-Math.PI/2);
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*n*3),3));
  zVarSeed=new Float32Array(n*n); for(let i=0;i<n*n;i++) zVarSeed[i]=0.93+Math.random()*0.1;
  g.setAttribute('w0',new THREE.BufferAttribute(new Float32Array(n*n*3),3));
  g.setAttribute('w1',new THREE.BufferAttribute(new Float32Array(n*n*3),3));
  zTerrain=new THREE.Mesh(g,terrainTex&&terrainTex.length===6?splatMaterial():new THREE.MeshLambertMaterial({vertexColors:true,map:noiseTexture()}));
  zooScene.add(zTerrain);
  zWater=new THREE.Mesh(new THREE.PlaneGeometry(side,side),new THREE.MeshPhongMaterial({color:0x2a6f99,transparent:true,opacity:0.78,shininess:90}));
  zWater.rotation.x=-Math.PI/2; zWater.position.y=TRN().waterLevel; zooScene.add(zWater);
  refreshTerrain();
}
function refreshTerrain(){
  const T=save.zoo.terrain, g=zTerrain.geometry, pos=g.attributes.position, col=g.attributes.color, pal=PAINT_RGB(), n=zTerrN, w0=g.attributes.w0, w1=g.attributes.w1;
  // PlaneGeometry 的頂點順序：列（z）由負到正、行（x）由負到正
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const k=j*n+i; pos.setY(k,T.h[k]);
    const c=pal[T.p[k]]||pal[0], v=zVarSeed[k]*(T.h[k]<TRN().waterLevel-0.2?0.8:1);
    col.setXYZ(k,c.r*v,c.g*v,c.b*v);
    if(w0){ const p=T.p[k]||0; w0.setXYZ(k,p===0?1:0,p===1?1:0,p===2?1:0); w1.setXYZ(k,p===3?1:0,p===4?1:0,p===5?1:0); }
  }
  if(w0){ w0.needsUpdate=true; w1.needsUpdate=true; }
  pos.needsUpdate=true; col.needsUpdate=true; g.computeVertexNormals(); g.computeBoundingSphere&&g.computeBoundingSphere();
}
function flattenRect(x0,z0,x1,z1,margin){
  const T=save.zoo.terrain, r=TRN().resolution, n=zTerrN;
  const cx=(x0+x1)/2, cz=(z0+z1)/2, target=ZH(cx,cz);
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){
    const x=i*r-zTerrSide/2, z=j*r-zTerrSide/2;
    const dx=Math.max(x0-x,0,x-x1), dz=Math.max(z0-z,0,z-z1), d=Math.hypot(dx,dz);
    if(d>margin) continue;
    const k=tIdx(i,j), w=d<=0?1:1-d/margin; T.h[k]+= (target-T.h[k])*w;
  }
}
function applyBrush(x,z,tool,dt){
  const T=save.zoo.terrain, C=TRN(), r=C.resolution, n=zTerrN, rad=zBrush, k0=C.brushStrength*dt;
  const {fi,fj}=terrXY(x,z), ri=Math.ceil(rad/r);
  let avg=0, cnt=0;
  if(tool==='t_smooth'){ for(let j=Math.max(0,Math.floor(fj)-ri);j<=Math.min(n-1,Math.ceil(fj)+ri);j++) for(let i=Math.max(0,Math.floor(fi)-ri);i<=Math.min(n-1,Math.ceil(fi)+ri);i++){ avg+=T.h[tIdx(i,j)]; cnt++; } avg/=Math.max(1,cnt); }
  for(let j=Math.max(0,Math.floor(fj)-ri);j<=Math.min(n-1,Math.ceil(fj)+ri);j++) for(let i=Math.max(0,Math.floor(fi)-ri);i<=Math.min(n-1,Math.ceil(fi)+ri);i++){
    const d=Math.hypot(i-fi,j-fj)*r; if(d>rad) continue;
    const w=Math.pow(1-d/rad,1.5), k=tIdx(i,j);
    if(tool==='t_raise') T.h[k]+=k0*w;
    else if(tool==='t_lower') T.h[k]-=k0*w;
    else if(tool==='t_flat') T.h[k]+=(zBrushing.target-T.h[k])*Math.min(1,k0*w*2);
    else if(tool==='t_smooth') T.h[k]+=(avg-T.h[k])*Math.min(1,k0*w*1.5);
    else if(tool.startsWith('t_paint_')) T.p[k]=parseInt(tool.slice(8),10);
    T.h[k]=Math.max(C.min,Math.min(C.max,Math.round(T.h[k]*100)/100));
  }
}

/* ---------- 物件 ---------- */
const pdef=t=>DATA.propById[t];
function makeProp(type){
  const d=pdef(type), g=new THREE.Group(), k=d.kind;
  const wood=0x6a4a32, stone=0x9a9a96, white=0xeeeae2, dark=0x2b3038, leaf=0x3f6f3a;
  const add=(m,x,y,z)=>{ m.position.set(x,y,z); g.add(m); return m; };
  const glassM=new THREE.MeshPhongMaterial({color:0xcfe9f0,transparent:true,opacity:0.35,shininess:100,depthWrite:false});
  switch(k){
    case 'pine': { add(cyl(0.18,0.28,1.6,0x4a3424,7),0,0.8,0); for(let i=0;i<3;i++) add(new THREE.Mesh(new THREE.ConeGeometry(1.5-i*0.35,1.8,8),M(0x2f4a3e)),0,1.8+i*1.0,0); add(new THREE.Mesh(new THREE.ConeGeometry(0.5,0.6,8),M(0xf2f6fa)),0,4.4,0); break; }
    case 'broadleaf': { add(cyl(0.2,0.32,2.2,0x5a4030,7),0,1.1,0); for(const [x,y,z,r] of [[0,3.2,0,1.5],[0.8,2.8,0.3,1.0],[-0.7,2.9,-0.4,1.1],[0.2,3.8,-0.3,1.0]]) add(sph(r,leaf),x,y,z); break; }
    case 'birch': { add(cyl(0.12,0.16,3.6,0xe8e4dc,7),0,1.8,0); for(let i=0;i<4;i++) add(box(0.26,0.05,0.26,0x2a2420),0,0.6+i*0.8,0); add(sph(0.9,0x9ab85a),0,3.8,0); break; }
    case 'palm': { const t=add(cyl(0.12,0.2,4,0x8a6a48,7),0,2,0); t.rotation.z=0.1; for(let i=0;i<7;i++){ const l=add(box(0.25,0.05,2,0x4a8a3a),0.2,4,0); l.rotation.y=i/7*Math.PI*2; l.rotation.x=0.45; l.position.x=Math.sin(l.rotation.y)*0.8+0.2; l.position.z=Math.cos(l.rotation.y)*0.8; } break; }
    case 'bamboo': { for(let i=0;i<9;i++){ const h=2.5+Math.random()*2; const s=add(cyl(0.05,0.06,h,0x7aa848,6),Math.random()*1.2-0.6,h/2,Math.random()*1.2-0.6); s.rotation.z=(Math.random()-0.5)*0.15; } break; }
    case 'bush': { for(const [x,z,r] of [[0,0,0.55],[0.35,0.2,0.4],[-0.3,-0.15,0.42]]) add(sph(r,0x4a7a3a),x,r*0.8,z); break; }
    case 'flowers': { add(sph(0.35,0x5a8a4a),0,0.15,0).scale.y=0.5; for(let i=0;i<9;i++) add(sph(0.07,[0xe8c040,0xd85a8a,0xf2efe6,0x8a5ad8][i%4]),Math.random()*0.7-0.35,0.3,Math.random()*0.7-0.35); break; }
    case 'grass': { for(let i=0;i<7;i++){ const b=add(box(0.04,0.5,0.04,0x6a8a4a),Math.random()*0.6-0.3,0.25,Math.random()*0.6-0.3); b.rotation.z=(Math.random()-0.5)*0.5; } break; }
    case 'rock_s': { const r=add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.45,0),M(0x7d8086)),0,0.25,0); r.rotation.set(0.4,0.8,0.2); break; }
    case 'rock_l': { const r=add(new THREE.Mesh(new THREE.DodecahedronGeometry(1.2,0),M(0x6e7176)),0,0.6,0); r.scale.set(1.1,0.75,1); r.rotation.y=0.6; add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.6,0),M(0x7d8086)),0.9,0.3,0.6); break; }
    case 'log': { const l=add(cyl(0.3,0.33,2.8,0x5a4030,10),0,0.3,0); l.rotation.z=Math.PI/2; break; }
    case 'stump': { add(cyl(0.35,0.42,0.5,0x5a4030,10),0,0.25,0); add(cyl(0.33,0.33,0.02,0xc8a878,10),0,0.51,0); break; }
    case 'bench': { add(box(1.8,0.08,0.45,wood),0,0.45,0); add(box(1.8,0.4,0.06,wood),0,0.75,-0.2); for(const x of [-0.75,0.75]) add(box(0.08,0.45,0.45,dark),x,0.22,0); break; }
    case 'lamp': { add(cyl(0.06,0.08,3,dark,8),0,1.5,0); add(box(0.5,0.08,0.08,dark),0.2,3,0); const s=add(new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xffd08a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})),0.42,2.85,0); s.scale.set(1.4,1.4,1); add(sph(0.12,new THREE.MeshBasicMaterial({color:0xfff1c4})),0.42,2.88,0); break; }
    case 'bin': { add(cyl(0.25,0.22,0.8,0x3a5a4a,10),0,0.4,0); add(cyl(0.27,0.27,0.06,dark,10),0,0.82,0); break; }
    case 'sign': { add(box(0.08,1.4,0.08,wood),0,0.7,0); const b=add(box(0.9,0.35,0.05,0xe8d8b0),0.25,1.25,0); b.rotation.y=0.1; break; }
    case 'info_board': { for(const x of [-0.7,0.7]) add(box(0.08,1.2,0.08,wood),x,0.6,0); add(box(1.6,0.9,0.08,0x2a5a7a),0,1.4,0); add(box(1.4,0.7,0.02,white),0,1.4,0.05); break; }
    case 'flowerbed': { add(box(2,0.35,2,stone),0,0.17,0); add(box(1.8,0.1,1.8,0x4a3a2a),0,0.36,0); for(let i=0;i<16;i++) add(sph(0.1,[0xe8c040,0xd85a8a,0xf2efe6,0xe0702a][i%4]),Math.random()*1.5-0.75,0.5,Math.random()*1.5-0.75); break; }
    case 'fountain': { add(cyl(1.4,1.5,0.5,stone,20),0,0.25,0); add(cyl(1.25,1.25,0.05,new THREE.MeshPhongMaterial({color:0x4aa0d0,shininess:90}),20),0,0.48,0); add(cyl(0.2,0.25,1.2,stone,10),0,0.9,0); add(cyl(0.5,0.3,0.15,stone,12),0,1.5,0); const s=add(new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xcfefff,transparent:true,depthWrite:false})),0,1.8,0); s.scale.set(0.8,1.2,1); break; }
    case 'statue': { add(box(1.2,0.8,1.2,stone),0,0.4,0); const p=new THREE.Group(); MODELS.penguin(p); p.traverse(o=>{ if(o.material) o.material=M(0xb8bcc0); }); p.scale.setScalar(1.4); add(p,0,0.8,0); break; }
    case 'parasol': { add(cyl(0.5,0.5,0.06,white,14),0,0.75,0); add(cyl(0.05,0.05,0.75,dark,6),0,0.37,0); add(cyl(0.04,0.04,2.2,dark,6),0,1.4,0); add(new THREE.Mesh(new THREE.ConeGeometry(1.2,0.5,10),M(0xe0702a)),0,2.4,0); for(const a of [0,2.1,4.2]) add(box(0.4,0.45,0.4,wood),Math.cos(a)*0.9,0.22,Math.sin(a)*0.9); break; }
    case 'wall': add(box(2,3,0.2,0xd8d2c4),0,1.5,0); break;
    case 'wall_window': { add(box(2,0.9,0.2,0xd8d2c4),0,0.45,0); add(box(2,0.8,0.2,0xd8d2c4),0,2.6,0); for(const x of [-0.85,0.85]) add(box(0.3,1.3,0.2,0xd8d2c4),x,1.55,0); add(box(1.4,1.3,0.05,glassM),0,1.55,0); break; }
    case 'wall_door': { for(const x of [-0.75,0.75]) add(box(0.5,3,0.2,0xd8d2c4),x,1.5,0); add(box(1,0.7,0.2,0xd8d2c4),0,2.65,0); break; }
    case 'wall_glass': { add(box(2,3,0.08,glassM),0,1.5,0); for(const x of [-0.97,0.97]) add(box(0.06,3,0.1,dark),x,1.5,0); add(box(2,0.06,0.1,dark),0,2.97,0); break; }
    case 'pillar': add(box(0.4,3,0.4,0xc8c2b4),0,1.5,0); break;
    case 'floor': add(box(2,0.15,2,0xa8a098),0,0.075,0); break;
    case 'roof_flat': add(box(2.1,0.2,2.1,0x5a4a42),0,3.1,0); break;
    case 'roof_slope': { const r=add(box(2.1,0.15,2.3,0x8a3a2a),0,3.5,0); r.rotation.x=0.45; break; }
    case 'stairs': for(let i=0;i<5;i++) add(box(2,0.3*(i+1),0.4,0xa8a098),0,0.15*(i+1),-0.8+i*0.4); break;
    case 'fence_wood': { for(const x of [-0.95,0,0.95]) add(box(0.1,1.1,0.1,wood),x,0.55,0); for(const y of [0.4,0.85]) add(box(2,0.1,0.05,wood),0,y,0); break; }
    case 'fence_stone': add(box(2,1.1,0.4,0x8a8a86),0,0.55,0); add(box(2.05,0.12,0.45,0xf2f6fa),0,1.15,0); break;
    case 'fence_glass': { add(box(2,1.1,0.06,glassM),0,0.6,0); add(box(2,0.06,0.1,dark),0,1.15,0); break; }
    case 'recycle_bin': { for(const [x,c] of [[-0.18,0x2a8a4a],[0.18,0x2a5aa8]]) add(cyl(0.16,0.14,0.75,c,10),x,0.37,0); break; }
    case 'speaker': { add(cyl(0.05,0.06,2.4,dark,6),0,1.2,0); const s=add(box(0.35,0.3,0.25,0x3a3a3e),0,2.35,0.1); s.rotation.x=0.3; break; }
    case 'edu_station': { add(box(0.8,1.0,0.5,0x3a6aa8),0,0.5,0); add(box(0.7,0.45,0.04,new THREE.MeshBasicMaterial({color:0x9fd8ff})),0,0.95,0.27).rotation.x=-0.4; break; }
    case 'cons_sign': { for(const x of [-0.5,0.5]) add(box(0.06,1.1,0.06,wood),x,0.55,0); add(box(1.2,0.7,0.06,0x3a8a4a),0,1.2,0); add(box(1.05,0.55,0.02,white),0,1.2,0.04); break; }
    case 'billboard': { for(const x of [-1.2,1.2]) add(box(0.14,3.2,0.14,dark),x,1.6,0); add(box(3,1.4,0.12,0xe9c46a),0,3,0); add(box(2.8,1.2,0.02,0xc8402a),0,3,0.07); break; }
    case 'webcam': { add(cyl(0.04,0.05,2,dark,6),0,1,0); add(box(0.2,0.14,0.28,0x2a2c30),0,2.05,0.1); add(sph(0.05,new THREE.MeshBasicMaterial({color:0xff3030})),0.06,2.12,0.25); break; }
    case 'sec_camera': { add(cyl(0.04,0.05,2.6,dark,6),0,1.3,0); const c=add(box(0.16,0.14,0.36,0xeeeae2),0,2.6,0.15); c.rotation.x=0.4; break; }
    case 'nofeed_sign': { add(box(0.06,1.0,0.06,wood),0,0.5,0); add(box(0.7,0.45,0.05,0xc84a4a),0,1.1,0); add(box(0.55,0.08,0.02,white),0,1.1,0.03); break; }
    case 'donation_box': { add(box(0.12,0.9,0.12,dark),0,0.45,0); add(box(0.55,0.55,0.4,0x2a6a4a),0,1.15,0); add(box(0.3,0.04,0.05,0xe9c46a),0,1.43,0); break; }
    case 'scratch_post': { add(cyl(0.18,0.2,1.8,0xb89a6a,8),0,0.9,0); add(cyl(0.5,0.5,0.1,wood,10),0,0.05,0); for(let i=0;i<5;i++) add(cyl(0.2,0.2,0.08,0x8a7a5a,8),0,0.3+i*0.3,0); break; }
    case 'ball': add(sph(0.45,0xd84a3a),0,0.45,0); add(box(0.92,0.12,0.12,0xf2efe6),0,0.45,0); break;
    case 'hay_feeder': { for(const x of [-0.5,0.5]) add(box(0.1,1.8,0.1,wood),x,0.9,0); add(box(1.1,0.1,0.1,wood),0,1.8,0); add(sph(0.4,0xc8b060),0,1.3,0).scale.y=1.3; break; }
    case 'scent_box': add(box(0.6,0.5,0.6,0x7a5a3a),0,0.25,0); for(let i=0;i<4;i++) add(cyl(0.05,0.05,0.05,dark,6),-0.2+i*0.13,0.5,0.31).rotation.x=Math.PI/2; break;
    case 'perch': { add(cyl(0.08,0.1,2.2,0x5a4030,7),0,1.1,0); for(const [y,r] of [[1.4,0.4],[1.9,1.6],[2.1,-0.9]]){ const b=add(cyl(0.05,0.05,1.2,0x5a4030,6),0,y,0); b.rotation.z=Math.PI/2; b.rotation.y=r; } break; }
    case 'climb_frame': { for(const [x,z] of [[-0.9,-0.9],[0.9,-0.9],[-0.9,0.9],[0.9,0.9]]) add(cyl(0.08,0.08,2.6,wood,7),x,1.3,z); for(const y of [0.9,1.8,2.5]){ add(box(1.9,0.08,0.08,wood),0,y,-0.9); add(box(1.9,0.08,0.08,wood),0,y,0.9); } const r=add(cyl(0.02,0.02,1.6,0xc8b080,4),0,1.6,0); add(box(1.9,0.06,1.9,0x8a6a48),0,2.55,0); break; }
    case 'mud_pool': { add(cyl(1,1,0.08,0x5a4030,16),0,0.04,0); add(cyl(0.85,0.85,0.02,0x6a5038,16),0,0.09,0); break; }
    case 'heat_rock': { const r=add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.45,0),M(0x8a6a5a)),0,0.25,0); r.scale.y=0.6; const s=add(new THREE.Sprite(new THREE.SpriteMaterial({map:DOT,color:0xff8a4a,transparent:true,opacity:0.6,depthWrite:false,blending:THREE.AdditiveBlending})),0,0.5,0); s.scale.set(1.2,0.8,1); break; }
    case 'cave': { const r=add(new THREE.Mesh(new THREE.SphereGeometry(1.2,10,8,0,Math.PI*2,0,Math.PI/2),M(0x6e7176)),0,0,0); r.scale.set(1,0.9,1); add(new THREE.Mesh(new THREE.CircleGeometry(0.6,12,0,Math.PI),new THREE.MeshBasicMaterial({color:0x111214,side:THREE.DoubleSide})),0,0.02,1.05); break; }
    default: add(box(1,1,1,0x888888),0,0.5,0);
  }
  return g;
}
function placePropMesh(p){
  const old=zPropMeshes.get(p.uid); if(old) zPropRoot.remove(old);
  const g=makeProp(p.type), pd=pdef(p.type);
  if(pd&&pd.asset){ const st=staticAsset(pd.asset,{height:pd.height}); if(st){ for(const ch of [...g.children]) g.remove(ch); g.add(st); } else swapInAsset(g,pd.asset,{height:pd.height}); } g.position.set(p.x,ZH(p.x,p.z)+(p.y||0),p.z); g.rotation.y=p.rot||0; g.userData.prop=p.uid;
  zPropRoot.add(g); zPropMeshes.set(p.uid,g);
}
function rebuildProps(){ for(const g of zPropMeshes.values()) zPropRoot.remove(g); zPropMeshes.clear(); for(const p of save.zoo.props) placePropMesh(p); }
function snapXZ(x,z){ return zSnap?{x:Math.round(x),z:Math.round(z)}:{x,z}; }
function pickProp(cx,cy){
  const r=canvas.getBoundingClientRect(); zNdc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1); zRay.setFromCamera(zNdc,zooCam);
  const hits=zRay.intersectObjects(zPropRoot.children,true);
  for(const h of hits){ let o=h.object; while(o&&o.userData.prop==null) o=o.parent; if(o) return save.zoo.props.find(p=>p.uid===o.userData.prop); }
  return null;
}
function groundHit(cx,cy){
  const r=canvas.getBoundingClientRect(); zNdc.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1); zRay.setFromCamera(zNdc,zooCam);
  const h=zTerrain?zRay.intersectObject(zTerrain,false)[0]:null;
  if(h) return h.point.clone();
  return zRay.ray.intersectPlane(zPlane,new THREE.Vector3());
}
function openPropPanel(p){
  const d=pdef(p.type);
  $('zPanel').innerHTML=`<div class="zp-head"><div><b>${esc(d.name)}</b><span>旋轉 ${Math.round((p.rot||0)*180/Math.PI)}°・高度 ${(p.y||0).toFixed(1)} m</span></div><button type="button" class="zclose" id="zpClose" aria-label="關閉">✕</button></div>
    <div class="zp-add">
      <button type="button" class="zmini" data-pa="rl">↺ 左轉 15°</button><button type="button" class="zmini" data-pa="rr">↻ 右轉 15°</button>
      <button type="button" class="zmini" data-pa="up">升高 0.5</button><button type="button" class="zmini" data-pa="dn">降低 0.5</button>
      <button type="button" class="zmini add" data-pa="mv">移動</button><button type="button" class="zmini add" data-pa="cp">複製</button><button type="button" class="zmini" data-pa="del">拆除</button>
    </div><p class="zp-empty">升高可以把牆、屋頂疊成多層建築。</p>`;
  $('zPanel').hidden=false;
  $('zpClose').onclick=()=>{ $('zPanel').hidden=true; zSelProp=null; zSelBox.visible=false; };
  $('zPanel').querySelectorAll('[data-pa]').forEach(el=>el.onclick=()=>{
    const a=el.dataset.pa, z=save.zoo;
    if(a==='rl') p.rot=(p.rot||0)-Math.PI/12; if(a==='rr') p.rot=(p.rot||0)+Math.PI/12;
    if(a==='up') p.y=Math.min(12,(p.y||0)+0.5); if(a==='dn') p.y=Math.max(-2,(p.y||0)-0.5);
    if(a==='mv'){ zMoveUid=p.uid; toast('點一下新的位置'); return; }
    if(a==='cp'){ if(!affordable(d.cost)){ toast(`不夠：需要 ${costText(d.cost)}`); return; } pay(d.cost,-1); const q=Object.assign({},p,{uid:z.nextUid++,x:p.x+(zSnap?2:1.5)}); z.props.push(q); placePropMesh(q); zSelProp=q.uid; persist(); updateZooHud(); openPropPanel(q); selPropBox(q); return; }
    if(a==='del'){ z.props=z.props.filter(x=>x.uid!==p.uid); const g=zPropMeshes.get(p.uid); if(g){ zPropRoot.remove(g); zPropMeshes.delete(p.uid); }
      const refund={}; for(const [k,v] of Object.entries(d.cost)) refund[k]=Math.floor(v*(ZC().propRefund||0.5)); pay(refund,1);
      $('zPanel').hidden=true; zSelProp=null; zSelBox.visible=false; persist(); updateZooHud(); return; }
    placePropMesh(p); persist(); openPropPanel(p); selPropBox(p);
  });
}
function selPropBox(p){ const d=pdef(p.type), g=zPropMeshes.get(p.uid); zSelBox.visible=true; zSelBox.scale.set(d.size[0]+0.3,Math.max(1,3),d.size[1]+0.3); zSelBox.rotation.y=p.rot||0; zSelBox.position.set(p.x,ZH(p.x,p.z)+(p.y||0)+1.5,p.z); }

/* ---------- 工具列分頁 ---------- */
const Z_TABS=[['facility','設施'],['terrain','地形'],['nature','自然'],['enrich','豐富化'],['decor','裝飾'],['build','建築構件'],['blueprint','藍圖']];
function creativeTools(){
  if(zTab==='terrain') return [
    {id:'t_raise',name:'抬高',sub:'按住塗抹'},{id:'t_lower',name:'降低',sub:'低於水位就變水'},{id:'t_flat',name:'整平',sub:'以起點高度'},{id:'t_smooth',name:'平滑',sub:'柔化地形'},
    ...TRN().paints.map((p,i)=>({id:'t_paint_'+i,name:p.name,sub:'上色',swatch:p.color}))];
  if(zTab==='blueprint') return bpTools();
  return DATA.props.filter(p=>p.cat===zTab).map(p=>({id:'p_'+p.id,name:p.name,sub:costText(p.cost),cost:p.cost}));
}
function creativeOptions(){
  if(zTab==='terrain') return `<label class="zopt">筆刷 <input type="range" id="zBrushSz" min="1" max="8" step="1" value="${zBrush}"> <b class="num">${zBrush} m</b></label>`;
  if(zTab==='facility') return `<label class="zopt"><input type="checkbox" id="zGridOn" ${zGrid&&zGrid.visible?'checked':''}> 顯示格線</label>`;
  return `<label class="zopt"><input type="checkbox" id="zSnapOn" ${zSnap?'checked':''}> 對齊 1 m 格線</label>
    <button type="button" class="zmini" id="zRotL">↺</button><span class="zopt num">${Math.round(zRot*180/Math.PI)}°</span><button type="button" class="zmini" id="zRotR">↻</button>`;
}
function wireCreativeOptions(){
  const b=$('zBrushSz'); if(b) b.oninput=e=>{ zBrush=parseInt(e.target.value,10); b.nextElementSibling.textContent=zBrush+' m'; };
  const s=$('zSnapOn'); if(s) s.onchange=e=>{ zSnap=e.target.checked; };
  const gOn=$('zGridOn'); if(gOn) gOn.onchange=e=>{ zGrid.visible=e.target.checked; };
  const l=$('zRotL'), r=$('zRotR');
  if(l) l.onclick=()=>{ zRot-=Math.PI/12; renderZooTools(); };
  if(r) r.onclick=()=>{ zRot+=Math.PI/12; renderZooTools(); };
}
function placeProp(cx,cy){
  const d=pdef(zTool.slice(2)), h=groundHit(cx,cy); if(!d||!h) return;
  const lim=zTerrSide/2; if(Math.abs(h.x)>lim||Math.abs(h.z)>lim){ toast('只能蓋在園區圍牆內'); return; }
  if(!affordable(d.cost)){ toast(`不夠：需要 ${costText(d.cost)}`); return; }
  pay(d.cost,-1);
  const s=snapXZ(h.x,h.z), p={uid:save.zoo.nextUid++,type:d.id,x:s.x,z:s.z,y:0,rot:zRot};
  save.zoo.props.push(p); placePropMesh(p); updateZooHud(); renderZooTools(); persist();
}
function moveProp(cx,cy){
  const p=save.zoo.props.find(q=>q.uid===zMoveUid); zMoveUid=null; if(!p) return;
  const h=groundHit(cx,cy); if(!h) return; const s=snapXZ(h.x,h.z); p.x=s.x; p.z=s.z;
  placePropMesh(p); selPropBox(p); openPropPanel(p); persist();
}
function afterTerrainEdit(){
  refreshTerrain();
  for(const [uid,g] of zooBMeshes){ const b=findB(uid); if(!b) continue; const c=tileCenter(b); g.position.y=ZH(c.x,c.z); }
  for(const p of save.zoo.props){ const g=zPropMeshes.get(p.uid); if(g) g.position.y=ZH(p.x,p.z)+(p.y||0); }
}

/* 寫實地形材質：六張 ambientCG 貼圖依每個頂點的上色權重混合 */
function splatMaterial(){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    t0:{value:terrainTex[0]},t1:{value:terrainTex[1]},t2:{value:terrainTex[2]},t3:{value:terrainTex[3]},t4:{value:terrainTex[4]},t5:{value:terrainTex[5]},
    sunDir:{value:new THREE.Vector3(30,60,20).normalize()},sky:{value:new THREE.Color(0xeaf4ff)},ground:{value:new THREE.Color(0x8a9aa6)},water:{value:TRN().waterLevel}}]);
  return new THREE.ShaderMaterial({uniforms:u,fog:true,
    vertexShader:`attribute vec3 w0; attribute vec3 w1; attribute vec3 color;
      varying vec3 vW0; varying vec3 vW1; varying vec2 vUv; varying vec3 vN; varying float vShade; varying float vH;
      #include <fog_pars_vertex>
      void main(){ vW0=w0; vW1=w1; vUv=position.xz/2.5; vN=normalize(normalMatrix*normal); vShade=dot(color,vec3(0.333)); vH=position.y;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader:`uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3; uniform sampler2D t4; uniform sampler2D t5;
      uniform vec3 sunDir; uniform vec3 sky; uniform vec3 ground; uniform float water;
      varying vec3 vW0; varying vec3 vW1; varying vec2 vUv; varying vec3 vN; varying float vShade; varying float vH;
      #include <fog_pars_fragment>
      void main(){
        vec3 c=texture2D(t0,vUv).rgb*vW0.x+texture2D(t1,vUv).rgb*vW0.y+texture2D(t2,vUv).rgb*vW0.z
              +texture2D(t3,vUv).rgb*vW1.x+texture2D(t4,vUv).rgb*vW1.y+texture2D(t5,vUv).rgb*vW1.z;
        float wsum=vW0.x+vW0.y+vW0.z+vW1.x+vW1.y+vW1.z; c/=max(wsum,0.001);
        vec3 n=normalize(vN); vec3 hemi=mix(ground,sky,n.y*0.5+0.5)*0.75;
        float d=max(dot(n,normalize((viewMatrix*vec4(sunDir,0.0)).xyz)),0.0);
        vec3 col=c*(hemi+vec3(1.0,0.95,0.86)*d*0.6);
        if(vH<water-0.15) col*=0.75;
        gl_FragColor=vec4(col,1.0);
        #include <fog_fragment>
      }`});
}
