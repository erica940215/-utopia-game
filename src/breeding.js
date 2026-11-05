/* =========================================================
   繁殖（第五階段）：性別、成長、懷孕、品質星等、血緣與野放
   數值都在 config.breeding
   ========================================================= */
const BR=()=>DATA.config.breeding;
const STAR_TXT=n=>'★'.repeat(n)+'☆'.repeat(Math.max(0,BR().maxStars-n));
let zooBirthLog=[];
function rollStars(sp){ const r=BR().rescueStars[sp.rarity]||[1,2]; return r[0]+Math.floor(Math.random()*(r[1]-r[0]+1)); }
function newIndividual(speciesId,habitat,extra){
  const z=save.zoo, sp=DATA.speciesById[speciesId];
  return Object.assign({ id:'a'+(z.nextUid++), species:speciesId, habitat, sex:Math.random()<0.5?'M':'F', stars:rollStars(sp),
    born:(z.clock||0)-BR().adultMinutes, parents:[], gen:0, food:80, happy:60, breed:true }, extra||{});
}
function migrateAnimals(){
  const z=save.zoo; z.clock=z.clock||0; z.stored=z.stored||[];
  for(const a of z.animals){
    if(!a.sex) a.sex=Math.random()<0.5?'M':'F';
    if(!a.stars) a.stars=rollStars(DATA.speciesById[a.species]||{rarity:'common'});
    if(a.born==null) a.born=z.clock-BR().adultMinutes;
    if(!a.parents) a.parents=[];
    if(a.gen==null) a.gen=0;
    if(a.breed==null) a.breed=true;
  }
}
const isAdult=a=>(save.zoo.clock-a.born)>=BR().adultMinutes;
function related(a,b){
  if(a.parents.includes(b.id)||b.parents.includes(a.id)) return '親子';
  if(a.parents.length&&b.parents.some(p=>a.parents.includes(p))) return '手足';
  return null;
}
const nameOf=a=>`${DATA.speciesById[a.species].name} #${a.id.slice(1)}`;
function litterSize(sp){ const r=BR().litter[sp.category]||[1,1]; return r[0]+Math.floor(Math.random()*(r[1]-r[0]+1)); }
function breedingStep(min){
  const z=save.zoo, B=BR();
  z.clock=(z.clock||0)+min;
  // 生產
  for(const f of z.animals.filter(a=>a.preg)){
    if(z.clock<f.preg.due) continue;
    const hb=findB(f.habitat); if(!hb) { delete f.preg; continue; }
    const d=bdef(hb.type), room=d.capacity-z.animals.filter(a=>a.habitat===hb.uid).length;
    if(room<=0) continue;                     // 空間不足，延後生產
    const father=z.animals.find(a=>a.id===f.preg.father)||{id:f.preg.father,stars:f.stars,gen:0};
    const sp=DATA.speciesById[f.species], n=Math.min(room,litterSize(sp));
    for(let i=0;i<n;i++){
      let st=Math.round((f.stars+father.stars)/2);
      if(Math.random()<B.starUpChance) st++;
      if(Math.random()<B.starDownChance) st--;
      if(f.preg.inbred) st-=B.inbreedPenalty;
      st=Math.max(1,Math.min(B.maxStars,st));
      const baby=newIndividual(f.species,f.habitat,{stars:st,born:z.clock,parents:[father.id,f.id],gen:Math.max(f.gen,father.gen||0)+1,happy:80});
      z.animals.push(baby); zooBirthLog.push(baby); z.births=(z.births||0)+1;
    }
    f.cooldownUntil=z.clock+B.cooldownMinutes; delete f.preg;
  }
  // 受孕
  for(const f of z.animals){
    if(f.sex!=='F'||f.preg||!f.breed||!isAdult(f)||(f.happy??0)<B.minHappy||(f.cooldownUntil||0)>z.clock) continue;
    const mates=z.animals.filter(m=>m.sex==='M'&&m.habitat===f.habitat&&m.species===f.species&&m.breed&&isAdult(m)&&(m.happy??0)>=B.minHappy);
    if(!mates.length) continue;
    const unrelated=mates.filter(m=>!related(f,m));
    const m=(unrelated.length?unrelated:mates)[Math.floor(Math.random()*(unrelated.length||mates.length))];
    if(Math.random()<B.chancePerMin*min) f.preg={due:z.clock+B.gestationMinutes,father:m.id,inbred:!!related(f,m)};
  }
}
function habitatBreedNote(b){
  const z=save.zoo, inside=z.animals.filter(a=>a.habitat===b.uid), notes=[];
  for(const f of inside.filter(a=>a.sex==='F')) for(const m of inside.filter(a=>a.sex==='M'&&a.species===f.species)){
    const r=related(f,m); if(r) notes.push(`<em>⚠ ${esc(nameOf(f))} 和 ${esc(nameOf(m))} 是${r}，配對會讓後代品質下降</em>`);
  }
  const preg=inside.filter(a=>a.preg);
  if(preg.length) notes.push(`懷孕中：${preg.map(a=>`${esc(nameOf(a))}（${a.preg.due<=z.clock?'等空位就會生':`約 ${Math.ceil(a.preg.due-z.clock)} 分鐘後`}）`).join('、')}`);
  return notes.join('<br>');
}
function releaseAnimal(a){
  const B=BR(), sp=DATA.speciesById[a.species], rar=['common','rare','endangered','legendary'].indexOf(sp.rarity);
  const research=Math.round(B.releaseResearch*(1+rar)*(a.stars/2)), coins=Math.round(B.releaseCoins*(1+rar)*(a.stars/2));
  save.zoo.research=(save.zoo.research||0)+research; save.zoo.coins+=coins;
  save.zoo.released=(save.zoo.released||0)+1;
  return {research,coins};
}
