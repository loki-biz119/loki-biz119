const fs = require('fs');
const html = fs.readFileSync('/sessions/zealous-loving-wright/mnt/loki-score/index.html','utf8');

const startIdx = html.indexOf('const LOOKUP={');
let depth=0, i=startIdx + 'const LOOKUP='.length, end=-1;
while(i<html.length){
  if(html[i]==='{') depth++;
  else if(html[i]==='}'){
    depth--;
    if(depth===0){end=i+1;break;}
  }
  i++;
}
const before = html.slice(0, startIdx+'const LOOKUP='.length);
const lookupStr = html.slice(startIdx+'const LOOKUP='.length, end);
const after = html.slice(end);

let LOOKUP;
eval('LOOKUP='+lookupStr);

const SCALE = 2.5;
const CAP = 8000; // 제과점 최대 캡

let changed = 0;
Object.keys(LOOKUP).forEach(gu=>{
  const d = LOOKUP[gu]['제과점'];
  if(d){
    const newM = Math.round(Math.min(d.m * SCALE, CAP) * 10) / 10;
    const newA = Math.round(Math.min(d.a * SCALE, CAP) * 10) / 10;
    console.log(`${gu}: m ${d.m} → ${newM}, a ${d.a} → ${newA}`);
    d.m = newM;
    d.a = newA;
    changed++;
  }
});

console.log(`\n총 ${changed}개구 수정`);
const avg = Object.keys(LOOKUP).filter(g=>LOOKUP[g]['제과점']).map(g=>LOOKUP[g]['제과점'].m);
console.log('보정 후 평균m:', (avg.reduce((s,v)=>s+v,0)/avg.length).toFixed(1));

const newLookupStr = JSON.stringify(LOOKUP);
const newHtml = before + newLookupStr + after;
fs.writeFileSync('/sessions/zealous-loving-wright/mnt/loki-score/index.html', newHtml, 'utf8');
console.log('\nindex.html 저장 완료');
