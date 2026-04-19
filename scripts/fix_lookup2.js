const fs = require('fs');
const idx1 = 'mnt/loki-score/index.html';
let html1 = fs.readFileSync(idx1, 'utf8');
const LOOKUP = eval('(' + html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/)[1] + ')');
const META   = eval('(' + html1.match(/const META=({[\s\S]*?});\s*\n/)[1] + ')');

// ═══ META.p 추가 조정 (면적 현실화) ════
const META_P2 = {
  '스포츠교육기관': 25,   // 45.5→25 (소형 스튜디오)
  '당구장':         20,   // 39.4→20 (일반 당구장)
  '여관ㆍ모텔':     30.3, // 60.6→30.3 (소형 여관 기준)
  '실외골프연습장': 60.6, // 75.8→60.6 (현실적 조정)
};
Object.entries(META_P2).forEach(([ind,p]) => {
  if(META[ind]){ console.log(`META[${ind}].p: ${META[ind].p}→${p}`); META[ind].p=p; }
});

// ═══ LOOKUP 2차 스케일 보정 ════
const SCALE2 = {
  '애완용품점':   10,  // 115만→1150만 (현실: 500~2000만)
  '신발가게':      4,  // 504만→2016만
  '화장품가게':    4,  // 475만→1900만
  '휴대폰가게':    5,  // 236만→1180만
  '꽃가게':        5,  // 180만→900만
  '세탁소':        3,  // 222만→666만
  '여관ㆍ모텔':    8,  // 805만→6440만 (숙박업 현실)
  '일식음식점':    5,  // 617만→3085만
  '헬스클럽':      3,  // 541만→1623만
  '스포츠교육기관':5,  // 359만→1795만
  '당구장':        4,  // 302만→1208만
  '미용실':        3,  // 329만→987만
  '가전제품수리점':3,  // 261만→783만 (기존 ×5 후 추가 ×3)
  '가전제품판매점':5,  // 새로 추가
  '식료품가게':    5,  // 435만→2175만
};

Object.entries(SCALE2).forEach(([ind, factor]) => {
  const vals_before = Object.values(LOOKUP).map(g=>g[ind]?.m||0).filter(v=>v>0);
  const avgBefore = Math.round(vals_before.reduce((s,v)=>s+v,0)/vals_before.length);
  
  Object.keys(LOOKUP).forEach(gu => {
    if(!LOOKUP[gu][ind]) return;
    LOOKUP[gu][ind].m = Math.round(LOOKUP[gu][ind].m * factor * 10)/10;
    LOOKUP[gu][ind].a = Math.round(LOOKUP[gu][ind].a * factor * 10)/10;
  });
  
  const vals_after = Object.values(LOOKUP).map(g=>g[ind]?.m||0).filter(v=>v>0);
  const avgAfter = Math.round(vals_after.reduce((s,v)=>s+v,0)/vals_after.length);
  console.log(`LOOKUP ${ind} ×${factor}: ${avgBefore}만 → ${avgAfter}만`);
});

// ═══ 저장 ════
html1 = html1.replace(/const META=({[\s\S]*?});\s*\n/, `const META=${JSON.stringify(META)};\n`);
html1 = html1.replace(/const LOOKUP=({[\s\S]*?});\s*\n/, `const LOOKUP=${JSON.stringify(LOOKUP)};\n`);
fs.writeFileSync(idx1, html1);
console.log('\n✅ 저장 완료');

// ═══ 최종 검증 ════
const MIN_WAGE=10030, HOURS=209;
function grade(s){ return s>=85?'S':s>=70?'A':s>=55?'B':s>=40?'C':'D'; }
const html2 = fs.readFileSync('mnt/loki-score/theme2/index.html', 'utf8');
const T2 = eval('(' + html2.match(/const T2=({[\s\S]*?});\s*\n/)[1] + ')');

// 주요 업종 검증
const CHECKS = [
  ['강남구','애완용품점'],['강남구','신발가게'],['강남구','화장품가게'],
  ['강남구','헬스클럽'],['강남구','여관ㆍ모텔'],['강남구','미용실'],
  ['강남구','일식음식점'],['노원구','헬스클럽'],
];
CHECKS.forEach(([gu,ind]) => {
  const row=LOOKUP[gu]?.[ind]; const m=META[ind];
  if(!row||!m) return;
  const rent=Math.round(row.r*m.p*3.3/10);
  const labor=Math.round(MIN_WAGE*HOURS*m.e/10000);
  const net=Math.round(row.m-rent-labor-row.m*m.c-row.m*(m.o/100));
  console.log(`${gu} ${ind}: 매출 ${Math.round(row.m)}만 | 순이익 ${net}만`);
});

// 충돌 재집계
let conflict=0, total=0;
Object.keys(LOOKUP).forEach(gu => {
  Object.keys(LOOKUP[gu]).forEach(ind => {
    const row=LOOKUP[gu][ind]; const m=META[ind];
    if(!m||!row||!row.m) return; total++;
    const rent=Math.round(row.r*m.p*3.3/10);
    const labor=Math.round(MIN_WAGE*HOURS*m.e/10000);
    const net=Math.round(row.m-rent-labor-row.m*m.c-row.m*(m.o/100));
    const t2d=T2[ind]?.[gu];
    if(t2d&&(grade(t2d.sc)==='A'||grade(t2d.sc)==='S')&&net<-100) conflict++;
  });
});
console.log(`\n최종 적합도 충돌: ${conflict}건 / ${total}건`);
