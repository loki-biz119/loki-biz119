const fs = require('fs');
const idx1 = 'mnt/loki-score/index.html';
let html1 = fs.readFileSync(idx1, 'utf8');
const LOOKUP = eval('(' + html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/)[1] + ')');

// 업종별 최대값 캡 (만원/월)
// 근거: 해당 업종 서울 최상위 단일 점포 현실 범위
const CAPS = {
  '화장품가게':     3000,
  '신발가게':       4500,
  '애완용품점':     2500,
  '여관ㆍ모텔':     8000,  // 강남 소형 모텔 상한
  '가전제품판매점': 5000,
  '식료품가게':     8000,  // 슈퍼마켓급
  '일식음식점':     6000,
  '미용실':         2000,
  '헬스클럽':       5000,
  '세탁소':         1500,
  '꽃가게':         1500,
  '곡물가게':       5000,  // ×5 이후 극단값 있을 수 있음
  '통신판매업':     2000,
  '자전거판매점':   3000,
  '장난감가게':     3000,
  '서점':           4000,
};

let capApplied = 0;
Object.entries(CAPS).forEach(([ind, cap]) => {
  Object.keys(LOOKUP).forEach(gu => {
    const row = LOOKUP[gu][ind];
    if(!row) return;
    if(row.m > cap) {
      const oldM = row.m;
      LOOKUP[gu][ind].m = cap;
      LOOKUP[gu][ind].a = Math.min(row.a, cap * 1.3); // a도 캡
      capApplied++;
    }
  });
});
console.log(`캡 적용: ${capApplied}건`);

// 저장
html1 = html1.replace(/const LOOKUP=({[\s\S]*?});\s*\n/, `const LOOKUP=${JSON.stringify(LOOKUP)};\n`);
fs.writeFileSync(idx1, html1);

// 최종 전수조사
const html2 = fs.readFileSync('mnt/loki-score/theme2/index.html', 'utf8');
const T2 = eval('(' + html2.match(/const T2=({[\s\S]*?});\s*\n/)[1] + ')');
const META = eval('(' + html1.match(/const META=({[\s\S]*?});\s*\n/)[1] + ')');
const MIN_WAGE=10030, HOURS=209;
function grade(s){ return s>=85?'S':s>=70?'A':s>=55?'B':s>=40?'C':'D'; }

let conflict=0, total=0, ok=0;
const conflictDetails = [];
Object.keys(LOOKUP).forEach(gu => {
  Object.keys(LOOKUP[gu]).forEach(ind => {
    const row=LOOKUP[gu][ind]; const m=META[ind];
    if(!m||!row||!row.m) return; total++;
    const rent=Math.round(row.r*m.p*3.3/10);
    const labor=Math.round(MIN_WAGE*HOURS*m.e/10000);
    const net=Math.round(row.m-rent-labor-row.m*m.c-row.m*(m.o/100));
    const t2d=T2[ind]?.[gu];
    if(t2d&&(grade(t2d.sc)==='A'||grade(t2d.sc)==='S')&&net<-100) {
      conflict++;
      conflictDetails.push({gu,ind,grade:grade(t2d.sc),sc:t2d.sc,net,sales:row.m});
    } else ok++;
  });
});

console.log(`\n최종 전수조사: 총 ${total}건`);
console.log(`적합도 충돌: ${conflict}건 (A/S등급 + 순이익 -100만 미만)`);
console.log(`정상: ${ok}건`);

// 남은 충돌 업종 요약
const byInd = {};
conflictDetails.forEach(d => { byInd[d.ind]=(byInd[d.ind]||[]); byInd[d.ind].push(d); });
console.log('\n남은 충돌 업종:');
Object.entries(byInd).sort((a,b)=>b[1].length-a[1].length).forEach(([ind,arr]) => {
  const avgNet = Math.round(arr.reduce((s,d)=>s+d.net,0)/arr.length);
  const avgSales = Math.round(arr.reduce((s,d)=>s+d.sales,0)/arr.length);
  console.log(` ${ind}: ${arr.length}건 | 평균매출 ${avgSales}만 | 평균순이익 ${avgNet}만`);
});

// 개선율
console.log(`\n개선율: 167건 → ${conflict}건 (${Math.round((1-conflict/167)*100)}% 개선)`);
