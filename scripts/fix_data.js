const fs = require('fs');

// ── 파일 로드 ──
const idx1 = 'mnt/loki-score/index.html';
const idx2 = 'mnt/loki-score/theme2/index.html';
let html1 = fs.readFileSync(idx1, 'utf8');
let html2 = fs.readFileSync(idx2, 'utf8');

// ── 데이터 추출 ──
const lookupMatch = html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/);
const metaMatch   = html1.match(/const META=({[\s\S]*?});\s*\n/);
const t2Match     = html2.match(/const T2=({[\s\S]*?});\s*\n/);

const LOOKUP = eval('(' + lookupMatch[1] + ')');
const META   = eval('(' + metaMatch[1]   + ')');
const T2     = eval('(' + t2Match[1]     + ')');

// ═══════════════════════════════════════════════════════
// 1. META 원가율 업데이트
// ═══════════════════════════════════════════════════════
const META_UPDATES = {
  '편의점':      { c: 0.78, o: 9 },      // 본사공급가 78% 포함
  '패스트푸드점': { c: 0.48, o: 11 },    // 재료+폐기 48%
  '슈퍼마켓':    { c: 0.68, o: 8 },      // 식재료 중심 원가 높음
  '부동산중개업': { c: 0.05, o: 4 },     // 서비스업 → 직접원가 거의 없음
  '커피음료점':  { o: 12 },              // 임차+인건 높음
  '제과점':      { c: 0.45, o: 10 },
  '일식음식점':  { c: 0.45, o: 9 },
  'pc방':        { o: 15 },              // 전기·장비유지 높음
  '헬스클럽':    { o: 12 },
  '한식음식점':  { c: 0.42, o: 10 },
  '호프주점':    { c: 0.40, o: 10 },
  '기타음식점':  { c: 0.40, o: 10 },
  '중식음식점':  { c: 0.43, o: 9 },
  '분식점':      { c: 0.42, o: 9 },
  '기타외국식음식점': { c: 0.40, o: 10 },
};

let metaChanges = 0;
Object.entries(META_UPDATES).forEach(([ind, updates]) => {
  if (META[ind]) {
    Object.entries(updates).forEach(([key, val]) => {
      console.log(`META[${ind}].${key}: ${META[ind][key]} → ${val}`);
      META[ind][key] = val;
    });
    metaChanges++;
  } else {
    console.warn(`META 업종 없음: ${ind}`);
  }
});
console.log(`\n✅ META 수정: ${metaChanges}개 업종\n`);

// ═══════════════════════════════════════════════════════
// 2. LOOKUP 부동산중개업 수정 (×100 단위 보정 + 누락 지역 추가)
// ═══════════════════════════════════════════════════════

// 구별 임대료 r값 수집 (LOOKUP 내 다른 업종에서)
const rentByGu = {};
Object.keys(LOOKUP).forEach(gu => {
  const vals = Object.values(LOOKUP[gu]).map(v => v.r).filter(v => v > 0);
  if (vals.length > 0) rentByGu[gu] = vals[0];
});

// 기존 10개 구 × 100 보정 + 추정 s·g값 설정
const RE_EXISTING_FIX = {
  '강동구':  { m: 350,  a: 600,  s: 1530, g: -5.4 }, // 원래 0→추정치
  '강남구':  { m: 1350, a: 2200, s: 5130, g: -0.5 },  // 13.5×100
  '관악구':  { m: 870,  a: 2040, s: 1149, g: 1.5  },  // 8.7×100
  '영등포구': { m: 2000, a: 2170, s: 1700, g: -1.6 }, // 20×100
  '금천구':  { m: 300,  a: 500,  s: 970,  g: -3.3 },  // 0.1→추정치
  '강서구':  { m: 400,  a: 650,  s: 1640, g: -1.9 },  // 4×100
  '마포구':  { m: 1460, a: 2200, s: 1525, g: -0.8 },  // 14.6×100
  '성북구':  { m: 350,  a: 600,  s: 928,  g: -2.5 },  // 1.6→추정치(너무 낮아 재설정)
  '중랑구':  { m: 300,  a: 500,  s: 819,  g: -4.4 },  // 0.2→추정치
  '중구':    { m: 2380, a: 3200, s: 830,  g: -0.4 },  // 23.8×100
};

// 15개 누락 구 추정치
const RE_NEW = {
  '서초구':   { m: 1500, a: 2500, s: 3800, g: -0.5 },
  '송파구':   { m: 900,  a: 1500, s: 2200, g: -0.8 },
  '동작구':   { m: 500,  a: 850,  s: 700,  g: -2.0 },
  '구로구':   { m: 400,  a: 700,  s: 900,  g: -2.5 },
  '양천구':   { m: 450,  a: 780,  s: 800,  g: -1.8 },
  '서대문구': { m: 500,  a: 850,  s: 700,  g: -2.0 },
  '은평구':   { m: 350,  a: 600,  s: 850,  g: -2.5 },
  '노원구':   { m: 350,  a: 600,  s: 1200, g: -2.8 },
  '도봉구':   { m: 300,  a: 520,  s: 600,  g: -3.0 },
  '강북구':   { m: 280,  a: 480,  s: 700,  g: -3.2 },
  '동대문구': { m: 450,  a: 780,  s: 900,  g: -2.0 },
  '광진구':   { m: 500,  a: 860,  s: 800,  g: -1.5 },
  '성동구':   { m: 650,  a: 1100, s: 700,  g: -1.0 },
  '용산구':   { m: 750,  a: 1300, s: 900,  g: -0.8 },
  '종로구':   { m: 700,  a: 1200, s: 800,  g: -1.0 },
};

let lookupREfixed = 0, lookupREadded = 0;

// 기존 10개 구 수정
Object.entries(RE_EXISTING_FIX).forEach(([gu, vals]) => {
  LOOKUP[gu]['부동산중개업'] = {
    a: vals.a,
    m: vals.m,
    r: rentByGu[gu] || 40,
    s: vals.s,
    g: vals.g,
    n: ''
  };
  lookupREfixed++;
});

// 15개 누락 구 추가
Object.entries(RE_NEW).forEach(([gu, vals]) => {
  if (!LOOKUP[gu]) { console.warn('구 없음:', gu); return; }
  LOOKUP[gu]['부동산중개업'] = {
    a: vals.a,
    m: vals.m,
    r: rentByGu[gu] || 40,
    s: vals.s,
    g: vals.g,
    n: ''
  };
  lookupREadded++;
});

console.log(`✅ LOOKUP 부동산중개업: ${lookupREfixed}개 수정, ${lookupREadded}개 추가`);

// ═══════════════════════════════════════════════════════
// 3. T2 부동산중개업 a값 동기화
// ═══════════════════════════════════════════════════════
if (T2['부동산중개업']) {
  Object.keys(LOOKUP).forEach(gu => {
    const lkp = LOOKUP[gu]['부동산중개업'];
    if (!lkp) return;
    if (!T2['부동산중개업'][gu]) {
      // 없는 구 T2 추가 (score는 임시 중간값, a만 동기화)
      T2['부동산중개업'][gu] = { sc: 40, ps: 40, pc: 40, pg: 40, pe: 40, a: lkp.m, s: lkp.s, g: lkp.g };
    } else {
      T2['부동산중개업'][gu].a = lkp.m;
      T2['부동산중개업'][gu].s = lkp.s;
      T2['부동산중개업'][gu].g = lkp.g;
    }
  });
  console.log(`✅ T2 부동산중개업 a값 동기화 완료`);
}

// ═══════════════════════════════════════════════════════
// 4. HTML에 적용
// ═══════════════════════════════════════════════════════
function toJS(obj) {
  return JSON.stringify(obj);
}

html1 = html1.replace(
  /const META=({[\s\S]*?});\s*\n/,
  `const META=${toJS(META)};\n`
);
html1 = html1.replace(
  /const LOOKUP=({[\s\S]*?});\s*\n/,
  `const LOOKUP=${toJS(LOOKUP)};\n`
);
html2 = html2.replace(
  /const T2=({[\s\S]*?});\s*\n/,
  `const T2=${toJS(T2)};\n`
);

fs.writeFileSync(idx1, html1);
fs.writeFileSync(idx2, html2);
console.log('\n✅ 파일 저장 완료!');

// ═══════════════════════════════════════════════════════
// 5. 검증: 주요 업종 수익 재계산
// ═══════════════════════════════════════════════════════
console.log('\n=== 검증: 수정 후 주요 업종 순이익 ===');
const MIN_WAGE = 10030, HOURS = 209;
const tests = [
  ['강남구','편의점'], ['강동구','편의점'],
  ['강남구','패스트푸드점'], ['강남구','커피음료점'],
  ['강남구','부동산중개업'], ['강동구','부동산중개업'],
  ['강남구','헬스클럽'], ['강남구','한식음식점'],
];
tests.forEach(([gu, ind]) => {
  const row = LOOKUP[gu]?.[ind];
  const m = META[ind];
  if (!row || !m) { console.log(gu, ind, '데이터 없음'); return; }
  const rent = Math.round(row.r * m.p * 3.3 / 10);
  const labor = Math.round(MIN_WAGE * HOURS * m.e / 10000);
  const midSales = row.m;
  const net = Math.round(midSales - rent - labor - midSales*m.c - midSales*(m.o/100));
  const rate = midSales > 0 ? Math.round(net/midSales*1000)/10 : 0;
  console.log(`${gu} ${ind}: 매출 ${midSales}만 → 순이익 ${net}만 (${rate}%)`);
});
