# LOKI 창업레이더 — 프로젝트 컨텍스트

> 이 파일은 세션이 바뀌어도 AI가 프로젝트 맥락을 유지하기 위한 Single Source of Context입니다.
> 작업 전 반드시 이 파일을 읽고, 작업 후 변경사항을 여기에 업데이트하세요.

---

## 프로젝트 개요
서울 창업 분석 플랫폼. 서울시 공공데이터를 기반으로 업종별 창업 리포트, 수익 계산, 상권 적합도를 제공.

**배포 URL**: https://loki-score.netlify.app  
**워크스페이스**: `/Users/thewaytonirvana/Desktop/loki-biz119/`

---

## 사이트 구조 (3페이지)

| 파일 | URL | 역할 | 상태 |
|---|---|---|---|
| `index.html` | `/` | 업종별 창업 리포트 | ✅ 실데이터 연동 완료 |
| `calc.html` | `/calc.html` | 수익 계산기 | ⚠️ 자체 META 하드코딩 (부분 연동) |
| `radar.html` | `/radar.html` | 창업레이더 (상권 적합도) | ⚠️ 자체 T2 하드코딩 (미연동) |

**GNB 3메뉴**: 업종별 리포트 → `index.html` / 수익 계산기 → `calc.html` / 창업레이더 → `radar.html`

---

## 데이터 아키텍처 (Single Source of Truth)

### 데이터 파이프라인
```
원본 CSV (36개 분기, 2019Q1~2025Q4)
  └── raw data/processed/historical/all_quarters_merged.csv
        └── scripts/build_sot.py (Python 빌드 스크립트)
              └── raw data/processed/loki_sot.json  ← SOT (원본)
                    └── data/loki_data.js            ← 브라우저용 JS 변수
                          └── index.html 로드: <script src="data/loki_data.js">
```

### SOT 빌드 명령
```bash
cd /Users/thewaytonirvana/Desktop/loki-biz119
python3 scripts/build_sot.py
```

### SOT 데이터 구조 (`loki_sot.json`)
```json
{
  "meta": { "built_at": "...", "quarters": 28, "industries": 100, "districts": 25 },
  "industries": {
    "한식음식점": {
      "name": "한식음식점",
      "category": "외식업",       ← SOT 내부 카테고리 (사이트 표시용 아님)
      "verdict": "위험",           ← 판정: 긍정/검토/신중/위험
      "metrics": { "store_count", "open_rate", "close_rate", "net_growth", "startup_share" },
      "trend": [ { "q": "20191", "sc": 점포수, "op": 창업률, "cl": 폐업률 }, ... ],
      "districts": { "강남구": 점포수, ... }   ← 자치구별 점포수 (매출 아님)
    }
  },
  "districts": {
    "금천구": {
      "rent_per_pyeong": 6.96,    ← 직방 데이터 (만원/평)
      "avg_close_rate": 2.48,
      "avg_open_rate": 1.9,
      "total_stores": 17237,
      "scores": {
        "competition": 54.6,      ← 25개 구 상대 백분위
        "rent": 100.0,
        "open": 48.0,
        "total": 71.4
      }
    }
  }
}
```

### 원본 데이터 소스
- **업종/창업 통계**: 서울 열린데이터광장 OA-22173 (VwsmSignguStorW) — **자치구 단위**
- **임대료**: 직방 서울_상가_임대료_DB.xlsx (434행, 25개 자치구, `raw data/원본데이터/직방/`)
- **데이터 기간**: 2019Q1 ~ 2025Q4 (28분기)
- **업종 수**: 100개, **자치구**: 25개

---

## 판정 공식 (데이터 기반, 93개 업종 백분위 분석으로 도출)

```python
def get_verdict(net_growth: float, close_rate: float) -> str:
    if net_growth >= 1.0 and close_rate < 2.5:   → "긍정"  (순증가 상위 25% + 폐업률 하위 25%)
    elif net_growth < -2.0 or close_rate >= 4.0:  → "위험"  (순감소 하위 10% OR 폐업률 상위 25%)
    elif net_growth >= -0.5 and close_rate < 3.5: → "검토"  (중간)
    else:                                          → "신중"
```

---

## 카테고리 체계 (전 페이지 통일 기준)

| 카테고리 | 포함 업종 (SOT 키 기준) |
|---|---|
| **음식·숙박** | 한식음식점, 중식음식점, 일식음식점, 양식음식점, 치킨전문점, 분식전문점, 제과점, 커피-음료, 호프-간이주점, 패스트푸드점 |
| **소매** | 일반의류, 화장품, 슈퍼마켓, 의약품, 시계및귀금속, 서적, 신발, 핸드폰, 편의점, 안경 |
| **서비스·기타** | 미용실, 네일숍, 세탁소, 피부관리실, 사진관, 부동산중개업, 인테리어, 일반교습학원, 예술학원, 외국어학원, 스포츠 강습, 독서실, 스포츠클럽, 일반의원, 치과의원, 한의원, 노래방, 당구장, PC방 |

---

## 데이터 일관성 현황 및 과제

### 현재 상태
| 페이지 | 데이터 소스 | SOT 연동 | 비고 |
|---|---|---|---|
| `index.html` | `LOKI_SOT` (loki_data.js) | ✅ 완전 연동 | 창업률/폐업률/트렌드/계절성/판정 |
| `calc.html` | 하드코딩 `META` | ⚠️ 부분 | 임대료는 SOT 연동 가능, 원가율/평수는 SOT에 없음 |
| `radar.html` | 하드코딩 `T2` | ❌ 미연동 | 행정동 API 기반 (SOT와 다른 데이터셋) |

### radar.html T2 데이터 특성
- **업종 수**: 58개 (SOT: 100개)
- **업종명**: 행정동 API 기준 (커피음료점, 호프주점 등) — SOT와 다름 (커피-음료, 호프-간이주점)
- **데이터 항목**: `sc`(종합점수), `ps`(매출백분위), `pc`(경쟁백분위), `pg`(성장백분위), `pe`(임대효율), `a`(월매출만원), `s`(점포수), `g`(성장률)
- **출처**: 서울시 상권분석 서비스 **행정동 추정매출 API** (자치구 API와 다른 엔드포인트)
- **→ SOT 통합 필요 시**: build_sot.py에 행정동 매출 API 데이터 추가 필요

### calc.html META 데이터 특성
- `p`: 기준 매장 평수, `s`: 기준 면적(㎡), `e`: 직원수, `c`: 원가율, `cat`: 카테고리, `o`: 기타비용(%)
- 이 데이터는 국세청 소득통계 추정치 — SOT에 없는 비용구조 데이터
- **임대료만 SOT 연동 가능**: `districts[gu].rent_per_pyeong` 활용

---

## 파일 구조

```
loki-biz119/
├── index.html          ← 업종별 리포트 (메인)
├── calc.html           ← 수익 계산기
├── radar.html          ← 창업레이더 (theme2/index.html 기반)
├── data/
│   └── loki_data.js    ← 브라우저용 SOT (빌드 생성, 197KB)
├── raw data/
│   ├── processed/
│   │   ├── loki_sot.json              ← SOT 원본 JSON
│   │   └── historical/
│   │       └── all_quarters_merged.csv ← 36개 분기 통합 CSV
│   └── 원본데이터/
│       └── 직방/서울_상가_임대료_DB.xlsx
├── scripts/
│   └── build_sot.py   ← SOT 빌드 스크립트
├── theme2/
│   └── index.html     ← radar.html의 원본 (백업)
└── history/           ← 버전 히스토리 보관
```

---

## 주요 결정사항 (히스토리)

1. **라이트 테마 전환**: 다크모드 소글씨 가독성 문제 → 화이트 테마로 전환
2. **2-depth 드롭다운**: 카테고리 카드버튼 제거 → 심플 select 드롭다운
3. **SOT 도입**: 사이트/블로그/문서 전체 데이터 일관성을 위해 Single Source of Truth 생성
4. **판정 임계값**: 임의값 아닌 실데이터 93개 업종 백분위 분석으로 도출
5. **CSV 분리**: 원본 CSV는 `raw data/`로 이동, 웹 공개 폴더에는 `loki_data.js`만 노출
6. **카테고리 통일**: 전 페이지 음식·숙박 / 소매 / 서비스·기타 3개로 통일
7. **파일명 정리**: 구 index.html(calc) → calc.html / 구 theme2/index.html(radar) → radar.html / 신 index.html = 리포트

---

## 다음 작업 우선순위

- [ ] radar.html T2 데이터를 SOT 기반으로 재생성 (build_sot.py에 행정동 매출 API 통합)
- [ ] calc.html 임대료를 SOT `districts.rent_per_pyeong`으로 연동
- [ ] 블로그/콘텐츠 데이터도 loki_sot.json에서 자동 추출하는 스크립트 작성
