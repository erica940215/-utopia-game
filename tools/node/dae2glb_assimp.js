const fs=require('fs'); const assimpjs=require('assimpjs');
assimpjs().then(ajs=>{
  for(const [inp,out] of process.argv.slice(2).map(a=>a.split(':'))){
    const fl=new ajs.FileList(); fl.AddFile(inp,new Uint8Array(fs.readFileSync(inp)));
    const r=ajs.ConvertFileList(fl,'glb2');
    if(!r.IsSuccess()||r.FileCount()==0){ console.log('FAIL',inp,r.GetErrorCode()); continue; }
    fs.writeFileSync(out,Buffer.from(r.GetFile(0).GetContent())); console.log('ok',out,fs.statSync(out).size);
  }
});
