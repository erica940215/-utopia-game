// 壓縮模型：動畫檔去掉重複的網格、刪掉多餘的關鍵影格、合併重複資料
// 用法：node optimize_models.mjs <models 資料夾>
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dedup, prune, resample, weld} from '@gltf-transform/functions';
import fs from 'fs'; import path from 'path';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
// 有些 0 A.D. 檔案指向作者電腦上的貼圖路徑；遊戲會另外載入貼圖，所以直接拿掉這些外部參照
function stripExternal(buf){
  const jl=buf.readUInt32LE(12), json=JSON.parse(buf.slice(20,20+jl).toString());
  if(json.images&&json.images.some(i=>i.uri)){ delete json.images; delete json.textures; delete json.samplers;
    for(const m of json.materials||[]){ const p=m.pbrMetallicRoughness; if(p){ delete p.baseColorTexture; delete p.metallicRoughnessTexture; } delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture; } }
  let js=Buffer.from(JSON.stringify(json)); const pad=(4-js.length%4)%4; js=Buffer.concat([js,Buffer.alloc(pad,0x20)]);
  const rest=buf.slice(20+jl), head=Buffer.alloc(20); head.writeUInt32LE(0x46546C67,0); head.writeUInt32LE(2,4); head.writeUInt32LE(20+js.length+rest.length,8); head.writeUInt32LE(js.length,12); head.writeUInt32LE(0x4E4F534A,16);
  return new Uint8Array(Buffer.concat([head,js,rest]));
}
const dir=process.argv[2]; let before=0, after=0;
const files=[]; (function walk(d){ for(const f of fs.readdirSync(d)){ const p=path.join(d,f); if(fs.statSync(p).isDirectory()) walk(p); else if(p.endsWith('.glb')) files.push(p); } })(dir);
for(const f of files){
  const s0=fs.statSync(f).size; before+=s0;
  let doc; try{ doc=await io.read(f); }catch(e){ doc=await io.readBinary(stripExternal(fs.readFileSync(f))); }
  const root=doc.getRoot();
  const isAnim=/__\w+\.glb$/.test(f);
  if(isAnim){
    // 動畫檔只要骨架和動畫：拿掉網格與皮膚
    for(const n of root.listNodes()){ if(n.getMesh()) n.setMesh(null); if(n.getSkin()) n.setSkin(null); }
    for(const m of root.listMeshes()) m.dispose();
    for(const s of root.listSkins()) s.dispose();
    for(const m of root.listMaterials()) m.dispose();
  }
  await doc.transform(dedup(), resample({tolerance:1e-4}), ...(isAnim?[]:[weld()]), prune({keepLeaves:true,keepAttributes:true}));
  await io.write(f,doc);
  const s1=fs.statSync(f).size; after+=s1;
}
console.log(`${files.length} files: ${(before/1048576).toFixed(1)} MB -> ${(after/1048576).toFixed(1)} MB`);
