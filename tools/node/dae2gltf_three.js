// 備援轉檔：用 three.js 的 ColladaLoader 讀 .dae，再用 GLTFExporter 輸出 .gltf（JSON）
const {JSDOM}=require('jsdom'); const fs=require('fs');
const dom=new JSDOM(''); const w=dom.window;
global.window=w; global.document=w.document; global.DOMParser=w.DOMParser; global.Blob=w.Blob; global.FileReader=w.FileReader; global.self=global;
const THREE=require('three'); global.THREE=THREE;
const vm=require('vm');
for(const f of ['loaders/ColladaLoader.js','exporters/GLTFExporter.js']) vm.runInThisContext(fs.readFileSync(require.resolve('three/examples/js/'+f),'utf8'));
THREE.TextureLoader.prototype.load=function(){ return new THREE.Texture(); };
(async()=>{ for(const [inp,out] of process.argv.slice(2).map(a=>a.split(':'))){
  try{
    const txt=fs.readFileSync(inp,'utf8'); const c=new THREE.ColladaLoader().parse(txt,'');
    const scene=c.scene; scene.traverse(o=>{ if(o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; ms.forEach(m=>{ m.map=null; }); } });
    // 有些模型的骨架不在場景樹裡，匯出時骨頭會找不到：把骨架根節點補回場景
    const inScene=o=>{ while(o){ if(o===scene) return true; o=o.parent; } return false; };
    scene.traverse(o=>{ if(o.isSkinnedMesh) for(const b of o.skeleton.bones){ if(!inScene(b)){ let t=b; while(t.parent) t=t.parent; if(t!==scene) scene.add(t); } } });
    const anims=c.animations||scene.animations||[];
    await new Promise((res,rej)=>new THREE.GLTFExporter().parse(scene,g=>{ fs.writeFileSync(out,JSON.stringify(g)); res(); },{binary:false,animations:anims,embedImages:false,onlyVisible:false}));
    console.log('ok',out,anims.length);
  }catch(e){ console.log('FAIL',inp,e.message); }
}})();
