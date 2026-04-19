const fs = require('fs');
const html1 = fs.readFileSync('mnt/loki-score/index.html', 'utf8');
const html2 = fs.readFileSync('mnt/loki-score/theme2/index.html', 'utf8');
const LOOKUP = eval('(' + html1.match(/const LOOKUP=({[\s\S]*?});\s*\n/)[1] + ')');
const META   = eval('(' + html1.match(/const META=({[\s\S]*?});\s*\n/)[1] + ')');
const T2     = eval('(' + html2.match(/const T2=({[\s\S]*?});\s*\n/)[1] + ')');

const MIN_WAGE=10030, HOURS=209;
function grade(s){ return s>=85?'S':s>=70?'A':s>=55?'B':s>=40?'C':'D'; }
function fmt(n){ return Math.round(n).toLocaleString(); }

const rows=[];
let conflicts=0, ok=0;

Object.keys(LOOKUP).forEach(gu => {
  Object.keys(LOOKUP[gu]).forEach(ind => {
    const row=LOOKUP[gu][ind]; const m=META[ind];
    if(!m||!row||!row.m) return;
    const rent=Math.round(row.r*m.p*3.3/10);
    const labor=Math.round(MIN_WAGE*HOURS*m.e/10000);
    const midSales=row.m;
    const net=Math.round(midSales-rent-labor-midSales*m.c-midSales*(m.o/100));
    const rate=Math.round(net/midSales*1000)/10;
    const bep=Math.round((rent+labor)/(1-m.c-m.o/100));
    const t2d=T2[ind]?.[gu];
    const sc=t2d?.sc||0;
    const g=grade(sc);
    const isConflict = (g==='A'||g==='S')&&net<-100;
    if(isConflict) conflicts++;
    else ok++;
    rows.push({gu,ind,g,sc,midSales,net,rate,rent,labor,bep,isConflict});
  });
});

const total=rows.length;
const sortedRows=[...rows].sort((a,b)=>b.isConflict-a.isConflict||a.net-b.net);

const html=`<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8">
<title>LOKI 데이터 감사 v2 (클렌징 후)</title>
<style>
body{font-family:sans-serif;font-size:12px;background:#0d0f1a;color:#fff;padding:16px}
h2{color:#4f8ef7}
.summary{display:flex;gap:16px;margin-bottom:16px}
.stat{background:#151825;border-radius:8px;padding:12px 20px;text-align:center}
.stat .n{font-size:24px;font-weight:800}
.stat .l{font-size:11px;color:#6a7890}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#1c2035;padding:6px 8px;text-align:left;cursor:pointer;position:sticky;top:0}
th:hover{background:#253060}
tr:hover td{background:#1c2035}
td{padding:5px 8px;border-bottom:1px solid #ffffff11}
.conflict{background:#f7615a18!important}
.ok{background:transparent}
.g-S{color:#ffd700}.g-A{color:#4f8ef7}.g-B{color:#a8b4c8}.g-C{color:#f7a548}.g-D{color:#f7615a}
.pos{color:#2ecc8a}.neg{color:#f7615a}
input{background:#1c2035;border:1px solid #ffffff22;color:#fff;padding:4px 8px;border-radius:4px;margin-right:6px}
</style>
</head>
<body>
<h2>LOKI 데이터 감사 v2 — 클렌징 후</h2>
<div class="summary">
  <div class="stat"><div class="n">${total}</div><div class="l">전체 조합</div></div>
  <div class="stat"><div class="n" style="color:#f7615a">${conflicts}</div><div class="l">적합도 충돌 (A/S등급 적자)</div></div>
  <div class="stat"><div class="n" style="color:#2ecc8a">${ok}</div><div class="l">정상</div></div>
  <div class="stat"><div class="n" style="color:#4f8ef7">${Math.round((1-conflicts/167)*100)}%</div><div class="l">충돌 개선율</div></div>
</div>
<div style="margin-bottom:12px">
  <input id="filter" placeholder="업종 또는 구 검색..." oninput="filterTable()">
  <span style="font-size:11px;color:#6a7890">클릭해서 정렬 | 빨간 행 = 충돌</span>
</div>
<table id="tbl">
<thead><tr>
  <th onclick="sortTable(0)">구</th>
  <th onclick="sortTable(1)">업종</th>
  <th onclick="sortTable(2)">적합도</th>
  <th onclick="sortTable(3)">점수</th>
  <th onclick="sortTable(4)">중위매출</th>
  <th onclick="sortTable(5)">임대료</th>
  <th onclick="sortTable(6)">인건비</th>
  <th onclick="sortTable(7)">순이익</th>
  <th onclick="sortTable(8)">순이익률%</th>
  <th onclick="sortTable(9)">BEP</th>
  <th onclick="sortTable(10)">상태</th>
</tr></thead>
<tbody>
${sortedRows.map(r=>`<tr class="${r.isConflict?'conflict':'ok'}">
  <td>${r.gu}</td><td>${r.ind}</td>
  <td class="g-${r.g}">${r.g}</td>
  <td>${r.sc}</td>
  <td>${fmt(r.midSales)}만</td>
  <td>${fmt(r.rent)}만</td>
  <td>${fmt(r.labor)}만</td>
  <td class="${r.net>=0?'pos':'neg'}">${r.net>=0?'+':''}${fmt(r.net)}만</td>
  <td class="${r.rate>=0?'pos':'neg'}">${r.rate}%</td>
  <td>${fmt(r.bep)}만</td>
  <td>${r.isConflict?'⚠️ 충돌':'✅'}</td>
</tr>`).join('')}
</tbody></table>
<script>
let asc={};
function sortTable(col){
  asc[col]=!asc[col];
  const tbody=document.querySelector('#tbl tbody');
  const rows=[...tbody.querySelectorAll('tr')];
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.replace(/[,+%]/g, '')||'';
    const bv=b.cells[col]?.textContent.replace(/[,+%]/g, '')||'';
    const an=parseFloat(av), bn=parseFloat(bv);
    const cmp=isNaN(an)||isNaN(bn)?av.localeCompare(bv,undefined,{sensitivity:'base'}):an-bn;
    return asc[col]?cmp:-cmp;
  });
  rows.forEach(r=>tbody.appendChild(r));
}
function filterTable(){
  const q=document.getElementById('filter').value.toLowerCase();
  document.querySelectorAll('#tbl tbody tr').forEach(r=>{
    r.style.display=(r.cells[0].textContent+r.cells[1].textContent).toLowerCase().includes(q)?'':'none';
  });
}
</script>
</body></html>`;

fs.writeFileSync('/tmp/loki_audit_v2.html', html);
console.log('리포트 생성 완료:', rows.length, '건 / 충돌:', conflicts, '건');
