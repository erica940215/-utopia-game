import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
for(const f of process.argv.slice(2)){
  const d=await io.read(f), r=d.getRoot();
  const prims=r.listMeshes().flatMap(m=>m.listPrimitives());
  const verts=prims.reduce((s,p)=>s+(p.getAttribute('POSITION')?.getCount()||0),0);
  console.log(f.split('/').pop(),'meshes',r.listMeshes().length,'verts',verts,'anims',r.listAnimations().length,'animChannels',r.listAnimations().reduce((s,a)=>s+a.listChannels().length,0),'keyframes',r.listAccessors().filter(a=>a.getType()==='SCALAR').reduce((s,a)=>s+a.getCount(),0),'textures',r.listTextures().length,'skins',r.listSkins().length);
}
