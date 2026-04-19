const fs = require('fs');

// ── 파일 로드 ──
const idx1 = 'mnt/loki-score/index.html';
const idx2 = 'mnt/loki-score/theme2/index.html';
let html1 = fs.readFileSync(idx1, 'utf8');
let html2 = fs.readFileSync(idx2, 'utf8');

const lookupMatch = html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/);
const metaMatch   = html1.match(/const META=({[\s\S]*?});\s*\n/);
const t2Match     = html2.match(/const T2=({[\s\S]*?});\s*\n/);
const LOOKUP = eval('(' + lookupMatch[1] + ')');
const META   = eval('(' + metaMatch[1]   + ')');
const T2     = eval('(' + t2Match[1]     + ')');

// ═══════════════════════════════════════════════════════
// 1. META.p 수정 (임대면적 → 현실적 소형 기준)
// ═══════════════════════════════════════════════════════
const META_P_UPDATES = {
  '헬스클럽':  { p: 35 },   // 75.8→35 (소형 피트니스 스튜디오 기준)
  '교습학원':  { p: 24.2 }, // 30.3→24.2평 (중형 학원)
  '실외골프연습장': { p: 75.8 }, // 이미 큰 값이지만 업종 특성상 유지
};

Object.entries(META_P_UPDATES).forEach(([ind, upd]) => {
  if(META[ind]) {
    Object.entries(upd).forEach(([key, val]) => {
      console.log(`META[${ind}].${key}: ${META[ind][key]} → ${val}`);
      META[ind][key] = val;
    });
  }
});

// ═══════════════════════════════════════════════════════
// 2. LOOKUP 매출 스케일 보정 (카드매출 저포착 보정)
// ═══════════════════════════════════════════════════════
// 이유: 카드결제 비중 낮은 업종은 서울 상권분석 데이터에서 
//       실제 매출의 5~20% 수준만 포착됨 → 업종별 보정계수 적용
const SCALE = {
  '실내장식가게':  10,  // B2B 현금거래 많음 → ×10
  '피부관리업':    10,  // 현금/계좌이체 많음
  '교습학원':      15,  // 계좌이체 위주
  '철물점':         5,  // B2B 거래 많음
  '패스트푸드점':  10,  // 지역 소형점 포함 → ×10
  '노래방':         3,  // 현금 많음
  '가전제품수리점': 5,  // 현금 많음
  '자전거판매점':   5,
  '장난감가게':     5,
  '곡물가게':       5,
  '시계ㆍ귀금속점': 5,
  '가구점':         8,  // B2B 및 대형거래
  '서점':           5,
  '통신판매업':     8,
};

let scaleFixed = 0;
Object.entries(SCALE).forEach(([ind, factor]) => {
  let before = [], after = [];
  Object.keys(LOOKUP).forEach(gu => {
    const row = LOOKUP[gu][ind];
    if(!row) return;
    before.push(row.m);
    const newM = Math.round(row.m * factor * 10) / 10;
    const newA = Math.round(row.a * factor * 10) / 10;
    LOOKUP[gu][ind] = { ...row, m: newM, a: newA };
    after.push(newM);
  });
  const bAvg = Math.round(before.reduce((s,v)=>s+v,0)/before.length);
  const aAvg = Math.round(after.reduce((s,v)=>s+v,0)/after.length);
  console.log(`LOOKUP ${ind} ×${factor}: 평균 ${bAvg}만 → ${aAvg}만`);
  scaleFixed++;
});
console.log(`\n✅ LOOKUP 스케일 보정: ${scaleFixed}개 업종\n`);

// ═══════════════════════════════════════════════════════
// 3. HTML에 적용
// ═══════════════════════════════════════════════════════
html1 = html1.replace(
  /const META=({[\s\S]*?});\s*\n/,
  `const META=${JSON.stringify(META)};\n`
);
html1 = html1.replace(
  /const LOOKUP=({[\s\S]*?});\s*\n/,
  `const LOOKUP=${JSON.stringify(LOOKUP)};\n`
);

fs.writeFileSync(idx1, html1);
console.log('✅ 파일 저장 완료!');

// ═══════════════════════════════════════════════════════
// 4. 최종 검증
// ═══════════════════════════════════════════════════════
const MIN_WAGE = 10030, HOURS = 209;
function grade(s){ return s>=85?'S':s>=70?'A':s>=55?'B':s>=40?'C':'D'; }

console.log('\n=== 최종 수익 계산 검증 ===');
const CHECKS = [
  ['강남구','편의점'], ['강동구','편의점'],
  ['강남구','패스트푸드점'], ['서초구','패스트푸드점'],
  ['강남구','헬스클럽'], ['노원구','헬스클럽'],
  ['강남구','실내장식가게'], ['강남구','교습학원'],
  ['강남구','부동산중개업'], ['강남구','커피음료점'],
  ['강남구','한식음식점'], ['강남구','피부관리업'],
];
CHECKS.forEach(([gu,ind]) => {
  const row = LOOKUP[gu]?.[ind];
  const m = META[ind];
  if(!row||!m){ console.log(gu,ind,'데이터없음'); return; }
  const rent = Math.round(row.r * m.p * 3.3 / 10);
  const labor = Math.round(MIN_WAGE * HOURS * m.e / 10000);
  const net = Math.round(row.m - rent - labor - row.m*m.c - row.m*(m.o/100));
  const rate = row.m > 0 ? Math.round(net/row.m*1000)/10 : 0;
  const bep = Math.round((rent+labor)/(1-m.c-m.o/100));
  console.log(`${gu} ${ind}: 매출 ${Math.round(row.m)}만 | 임대 ${rent}만 | 인건 ${labor}만 | 순이익 ${net}만 (${rate}%) | BEP:${bep}만`);
});

// 전수조사 재집계
let total=0, conflict=0, ok=0;
const T2_LOADED = eval('(' + html2.match(/const T2=({[\s\S]*?});\s*\n/)[1] + ')');
Object.keys(LOOKUP).forEach(gu => {
  Object.keys(LOOKUP[gu]).forEach(ind => {
    const row=LOOKUP[gu][ind]; const m=META[ind];
    if(!m||!row||!row.m) return;
    total++;
    const rent=Math.round(row.r*m.p*3.3/10);
    const labor=Math.round(MIN_WAGE*HOURS*m.e/10000);
    const net=Math.round(row.m-rent-labor-row.m*m.c-row.m*(m.o/100));
    const t2d=T2_LOADED[ind]?.[gu];
    if(t2d){
      const g=grade(t2d.sc);
      if((g==='A'||g==='S')&&net<-100) conflict++;
      else ok++;
    }
  });
});
console.log(`\n전수조사 결과: 총 ${total}건 | 적합도 충돌: ${conflict}건 | 정상: ${ok}건`);
