const fs = require('fs');

// ── HTML에서 데이터 추출 ──
const html1 = fs.readFileSync('mnt/loki-score/index.html', 'utf8');
const html2 = fs.readFileSync('mnt/loki-score/theme2/index.html', 'utf8');

// LOOKUP 추출
const lookupMatch = html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/);
const metaMatch   = html1.match(/const META=({[\s\S]*?});\s*\n/);
const t2Match     = html2.match(/const T2=({[\s\S]*?});\s*\n/);

const LOOKUP = eval('(' + lookupMatch[1] + ')');
const META   = eval('(' + metaMatch[1]   + ')');
const T2     = eval('(' + t2Match[1]     + ')');

// ── 상수 ──
const MIN_WAGE = 10030;
const HOURS    = 209;

function grade(s){ return s>=85?'S':s>=70?'A':s>=55?'B':s>=40?'C':'D'; }
function fmt(n){ return Math.round(n).toLocaleString(); }

// ── 전수조사 ──
const rows = [];
let conflicts = 0, dataIssues = 0;

Object.keys(LOOKUP).forEach(gu => {
  Object.keys(LOOKUP[gu]).forEach(ind => {
    const row = LOOKUP[gu][ind];
    const m   = META[ind];
    if(!m || !row) return;

    const pyeong   = m.p;
    const sqm      = pyeong * 3.3;
    const emp      = m.e;
    const otherPct = (m.o || 5) / 100;

    const rent  = Math.round(row.r * sqm / 10 * 10) / 10;
    const labor = Math.round(MIN_WAGE * HOURS * emp / 10000 * 10) / 10;
    const fixedCost = rent + labor;

    const hiSales  = row.a;
    const midSales = row.m;
    const loSales  = Math.round(row.m * 0.6 * 10) / 10;
    function calcNet(s){ return Math.round((s - fixedCost - s*m.c - s*otherPct)*10)/10; }
    const hiNet  = calcNet(hiSales);
    const midNet = calcNet(midSales);
    const loNet  = calcNet(loSales);
    const midRate = midSales > 0 ? Math.round(midNet/midSales*1000)/10 : 0;

    // 적합도 점수
    const t2Data  = T2[ind] && T2[ind][gu];
    const fitScore = t2Data ? t2Data.sc : null;
    const fitGrade = fitScore !== null ? grade(fitScore) : '-';

    // ── 플래그 판단 ──
    const flags = [];

    // 1. 적합도 A/S인데 중위 적자
    if((fitGrade==='S'||fitGrade==='A') && midNet < 0)
      flags.push('⚠️ 적합도A+이상인데중위적자');

    // 2. 적합도 D인데 중위 흑자 200만+ 
    if(fitGrade==='D' && midNet > 200)
      flags.push('⚠️ 적합도D인데고수익');

    // 3. 상위-중위 격차 200% 이상 (데이터 이상)
    const spread = midSales > 0 ? Math.round((hiSales-midSales)/midSales*100) : 0;
    if(spread > 200)
      flags.push(`🔴 상위중위격차${spread}%`);

    // 4. 중위매출 200만원 미만 (너무 낮음)
    if(midSales < 200)
      flags.push('🔴 중위매출200만미만');

    // 5. 중위매출 8000만원 초과 (보정 후에도 너무 높음)
    if(midSales > 8000)
      flags.push('🔴 중위매출8000초과');

    // 6. 임대료가 중위매출의 30% 초과
    const rentRatio = midSales > 0 ? Math.round(rent/midSales*100) : 0;
    if(rentRatio > 30)
      flags.push(`🟡 임대료${rentRatio}%과다`);

    // 7. 하위 25% 극단 적자 (300만원 이하)
    if(loNet < -300)
      flags.push(`🟡 하위적자${fmt(Math.abs(loNet))}만`);

    // 8. 성장률 극단값
    if((row.g||0) < -20) flags.push(`🟡 성장률${row.g}%급감`);
    if((row.g||0) >  30) flags.push(`🟡 성장률${row.g}%급증`);

    if(flags.length > 0){
      if(flags.some(f=>f.includes('적합도A'))||flags.some(f=>f.includes('적합도D'))) conflicts++;
      else dataIssues++;
    }

    rows.push({gu, ind, cat:m.cat,
      hiSales:Math.round(hiSales), midSales:Math.round(midSales),
      hiNet:Math.round(hiNet), midNet:Math.round(midNet), loNet:Math.round(loNet),
      midRate, fitGrade, fitScore:fitScore||0,
      rent:Math.round(rent), labor:Math.round(labor), spread,
      flags: flags.join(' / ')
    });
  });
});

// 플래그 있는 것 먼저, 그 안에서 적합도순
rows.sort((a,b)=>{
  const af = a.flags?1:0, bf = b.flags?1:0;
  if(af!==bf) return bf-af;
  return b.fitScore-a.fitScore;
});

console.log(`총 조합: ${rows.length}개`);
console.log(`적합도 충돌: ${conflicts}건 / 데이터 이상: ${dataIssues}건`);
console.log(`플래그 없음: ${rows.filter(r=>!r.flags).length}건`);

// ── HTML 리포트 생성 ──
const flaggedRows = rows.filter(r=>r.flags);
const okRows      = rows.filter(r=>!r.flags);

function rowHtml(r){
  const netColor = r.midNet>=0 ? '#2ecc8a' : '#f7615a';
  const gradeColor = {S:'#2ecc8a',A:'#4f8ef7',B:'#f7c948',C:'#f7a548',D:'#f7615a'}[r.fitGrade]||'#888';
  const flagHtml = r.flags ? `<td style="font-size:10px;color:#f7a548">${r.flags.replace(/ \/ /g,'<br>')}</td>` : '<td style="color:#4a5268">-</td>';
  return `<tr>
    <td>${r.gu}</td><td>${r.ind}</td>
    <td style="color:#a8b4c8;font-size:11px">${r.cat}</td>
    <td style="color:#4f8ef7">${r.midSales.toLocaleString()}</td>
    <td style="color:${netColor};font-weight:700">${r.midNet>=0?'+':''}${r.midNet.toLocaleString()}</td>
    <td style="color:${netColor}">${r.midRate}%</td>
    <td style="color:${gradeColor};font-weight:700">${r.fitGrade}</td>
    <td style="color:#a8b4c8">${r.spread}%</td>
    <td style="color:#6a7890">${r.rent.toLocaleString()}</td>
    ${flagHtml}
  </tr>`;
}

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LOKI 데이터 전수조사 리포트</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0f1a;color:#e8ecf4;font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;font-size:13px;padding:20px}
h1{font-size:18px;margin-bottom:6px;color:#fff}
.summary{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:#151825;border-radius:10px;padding:12px 16px;min-width:120px}
.stat-v{font-size:22px;font-weight:800;margin-bottom:2px}
.stat-l{font-size:11px;color:#6a7890}
.red{color:#f7615a}.orange{color:#f7a548}.green{color:#2ecc8a}.blue{color:#4f8ef7}.white{color:#fff}
h2{font-size:14px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #1c2035}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1c2035;padding:8px 10px;text-align:left;color:#6a7890;font-weight:600;position:sticky;top:0;cursor:pointer;white-space:nowrap}
th:hover{color:#4f8ef7}
td{padding:7px 10px;border-bottom:1px solid #151825;vertical-align:top}
tr:hover td{background:#151825}
.flag-row td{background:#1c150a}
input{background:#151825;border:1px solid #1c2035;border-radius:6px;padding:6px 10px;color:#e8ecf4;font-size:12px;width:200px;margin-bottom:12px}
input:focus{outline:none;border-color:#4f8ef7}
</style>
</head>
<body>
<h1>🔍 LOKI 데이터 전수조사 리포트</h1>
<p style="color:#6a7890;font-size:12px;margin-bottom:16px">생성일: ${new Date().toLocaleString('ko-KR')}</p>

<div class="summary">
  <div class="stat"><div class="stat-v white">${rows.length}</div><div class="stat-l">전체 조합</div></div>
  <div class="stat"><div class="stat-v red">${flaggedRows.length}</div><div class="stat-l">플래그 발생</div></div>
  <div class="stat"><div class="stat-v orange">${conflicts}</div><div class="stat-l">적합도 충돌</div></div>
  <div class="stat"><div class="stat-v orange">${dataIssues}</div><div class="stat-l">데이터 이상값</div></div>
  <div class="stat"><div class="stat-v green">${okRows.length}</div><div class="stat-l">이상 없음</div></div>
</div>

<input type="text" id="searchBox" placeholder="검색 (구, 업종, 등급...)" oninput="filterTable()">

<h2>⚠️ 플래그 발생 항목 (${flaggedRows.length}건)</h2>
<table id="mainTable">
<thead><tr>
  <th onclick="sortTable(0)">구</th>
  <th onclick="sortTable(1)">업종</th>
  <th onclick="sortTable(2)">카테고리</th>
  <th onclick="sortTable(3)">중위매출↕</th>
  <th onclick="sortTable(4)">중위순이익↕</th>
  <th onclick="sortTable(5)">수익률</th>
  <th onclick="sortTable(6)">적합도</th>
  <th onclick="sortTable(7)">상중격차</th>
  <th onclick="sortTable(8)">임대료</th>
  <th>플래그</th>
</tr></thead>
<tbody>
${flaggedRows.map(r=>`<tr class="flag-row">${rowHtml(r).replace('<tr>','').replace('</tr>','')}</tr>`).join('')}
</tbody>
</table>

<h2 style="margin-top:32px">✅ 이상 없는 항목 (${okRows.length}건)</h2>
<table>
<thead><tr>
  <th>구</th><th>업종</th><th>카테고리</th>
  <th>중위매출</th><th>중위순이익</th><th>수익률</th>
  <th>적합도</th><th>상중격차</th><th>임대료</th><th>플래그</th>
</tr></thead>
<tbody>
${okRows.map(rowHtml).join('')}
</tbody>
</table>

<script>
function filterTable(){
  const q=document.getElementById('searchBox').value.toLowerCase();
  document.querySelectorAll('table tbody tr').forEach(tr=>{
    tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none';
  });
}
let sortDir={};
function sortTable(col){
  const tbody=document.querySelector('#mainTable tbody');
  const rows=[...tbody.querySelectorAll('tr')];
  const dir=(sortDir[col]=!sortDir[col])?1:-1;
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.replace(/[,+%]/g'')||'';
    const bv=b.cells[col]?.textContent.replace(/[,+%]/g'')||'';
    const an=parseFloat(av), bn=parseFloat(bv);
    if(!isNaN(an)&&!isNaN(bn)) return (an-bn)*dir;
    return av.localeCompare(bv,'ko')*dir;
  });
  rows.forEach(r=>tbody.appendChild(r));
}
</script>
</body>
</html>`;

fs.writeFileSync('/tmp/loki_audit.html', html);
console.log('\n리포트 생성: /tmp/loki_audit.html');
