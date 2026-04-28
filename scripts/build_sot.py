"""
LOKI 창업레이더 — Single Source of Truth 빌더
=============================================
모든 콘텐츠(웹사이트 / 블로그 / 문서)가 동일 데이터를 참조하도록
하나의 JSON 파일을 생성합니다.

출력:
  - raw data/processed/loki_sot.json  (원본 JSON)
  - data/loki_data.js                 (브라우저용 JS 변수)

포함 데이터:
  - 업종별 핵심 지표 (개업률 / 폐업률 / 순증가율 / 창업점유율)
  - 업종별 판정 (긍정 / 검토 / 신중 / 위험)
  - 업종별 분기별 트렌드 (2019Q1 ~ 최신)
  - 자치구별 점포수
  - 자치구별 임대료 (직방)
  - 자치구별 창업 추천 점수
  - 창업레이더 상권 적합도 데이터 (서울시 행정동 추정매출 API 기반)

실행: python3 scripts/build_sot.py
"""

import pandas as pd
import numpy as np
import json
import os
from datetime import datetime

# ─────────────────────────────────────
# 경로 설정
# ─────────────────────────────────────
BASE      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HIST_FILE = os.path.join(BASE, "raw data", "processed", "historical", "all_quarters_merged.csv")
RENT_FILE = os.path.join(BASE, "raw data", "원본데이터", "직방", "서울_상가_임대료_DB.xlsx")
OUT_FILE  = os.path.join(BASE, "raw data", "processed", "loki_sot.json")
JS_FILE   = os.path.join(BASE, "data", "loki_data.js")

os.makedirs(os.path.join(BASE, "data"), exist_ok=True)

# ─────────────────────────────────────
# 창업레이더 상권 적합도 데이터 (T2)
# 출처: 서울시 상권분석 서비스 행정동 추정매출 API
# 구조: T2[업종명][자치구] = {sc,ps,pc,pg,pe,a,s,g}
#   sc=종합점수, ps=매출백분위, pc=경쟁백분위,
#   pg=성장백분위, pe=임대효율, a=월평균매출(만원),
#   s=점포수, g=성장률(%)
# name_map: T2업종명 → SOT업종명 매핑
# ─────────────────────────────────────
_RADAR_T2_FILE = os.path.join(BASE, "raw data", "processed", "radar_t2.json")
if os.path.exists(_RADAR_T2_FILE):
    with open(_RADAR_T2_FILE, encoding="utf-8") as _f:
        RADAR_T2 = json.load(_f)
else:
    RADAR_T2 = {"t2": {}, "name_map": {}}
    print("⚠️  radar_t2.json 없음 — radar 섹션 비어있음")


# ─────────────────────────────────────
# 판정 공식 (데이터 기반 확정)
# 기준: 서울 93개 업종 퍼센타일 분석
#   순증가율 P90 = 1.95  → 긍정 임계값 1.0
#   폐업률   P75 = 2.49  → 긍정 임계값 2.5
#   폐업률   P90 = 4.52  → 위험 임계값 4.0
#   순증가율 P10 = -2.09 → 위험 임계값 -2.0
# ─────────────────────────────────────
def get_verdict(net_growth: float, close_rate: float) -> str:
    """
    판정 기준:
      긍정(vp): 순증가율 >= 1.0  AND 폐업률 < 2.5
      위험(vd): 순증가율 < -2.0  OR  폐업률 >= 4.0
      검토(vr): 순증가율 >= -0.5 AND 폐업률 < 3.5
      신중(vc): 그 외
    """
    if net_growth >= 1.0 and close_rate < 2.5:
        return "긍정"
    elif net_growth < -2.0 or close_rate >= 4.0:
        return "위험"
    elif net_growth >= -0.5 and close_rate < 3.5:
        return "검토"
    else:
        return "신중"


VERDICT_META = {
    "긍정": {"code": "vp", "label": "긍정적",  "color": "green",  "icon": "✓"},
    "검토": {"code": "vr", "label": "검토 필요", "color": "blue",   "icon": "→"},
    "신중": {"code": "vc", "label": "신중 검토", "color": "amber",  "icon": "⚠"},
    "위험": {"code": "vd", "label": "위험",     "color": "red",    "icon": "✕"},
}


# ─────────────────────────────────────
# 업종 → 카테고리 매핑
# ─────────────────────────────────────
CATEGORY_MAP = {
    "외식업": [
        "한식음식점","중식음식점","일식음식점","양식음식점",
        "치킨전문점","분식전문점","제과점","패스트푸드",
        "해산물전문점","고기구이전문점","곱창전문점","샌드위치전문점",
    ],
    "음료·카페": [
        "커피-음료","버블티","쥬스바","빙수·디저트","베이커리카페",
    ],
    "주점·유흥": [
        "호프-간이주점","맥주전문점","와인바","포차","노래방","단란주점",
    ],
    "소매업": [
        "일반의류","화장품","슈퍼마켓","의약품","조명용품",
        "컴퓨터및주변장치판매","시계및귀금속","신발","서적","화초",
    ],
    "생활서비스": [
        "미용실","네일숍","세탁소","피부관리실","사진관",
        "건축물청소","인테리어","부동산중개업",
    ],
    "교육·건강": [
        "일반교습학원","예술학원","외국어학원","스포츠 강습","독서실",
        "스포츠클럽","일반의원","치과의원","한의원",
    ],
}

def get_category(industry_name: str) -> str:
    for cat, inds in CATEGORY_MAP.items():
        if industry_name in inds:
            return cat
    return "기타"


# ─────────────────────────────────────
# 1. 히스토리 데이터 로드
# ─────────────────────────────────────
print("=" * 60)
print("LOKI SOT 빌더 시작")
print("=" * 60)

print("\n[1/4] 히스토리 데이터 로드...")
df = pd.read_csv(HIST_FILE, encoding="utf-8-sig")
df["OPBIZ_RT"]   = pd.to_numeric(df["OPBIZ_RT"],   errors="coerce").fillna(0)
df["CLSBIZ_RT"]  = pd.to_numeric(df["CLSBIZ_RT"],  errors="coerce").fillna(0)
df["STOR_CO"]    = pd.to_numeric(df["STOR_CO"],     errors="coerce").fillna(0)
df["OPBIZ_STOR_CO"]  = pd.to_numeric(df["OPBIZ_STOR_CO"],  errors="coerce").fillna(0)
df["CLSBIZ_STOR_CO"] = pd.to_numeric(df["CLSBIZ_STOR_CO"], errors="coerce").fillna(0)

latest_q    = int(df["STDR_YYQU_CD"].max())
all_quarters = sorted(df["STDR_YYQU_CD"].unique().tolist())
print(f"  총 {len(df):,}행 / 분기 {len(all_quarters)}개 / 최신: {latest_q}")


# ─────────────────────────────────────
# 2. 직방 임대료 데이터 로드
# ─────────────────────────────────────
print("\n[2/4] 직방 임대료 데이터 로드...")
rent_df = pd.read_excel(RENT_FILE)
rent_df.columns = ["구", "동", "평당월임대료", "샘플수", "집계단위", "비고"]
rent_df["평당월임대료"] = pd.to_numeric(rent_df["평당월임대료"], errors="coerce")

# 자치구별 가중평균 (샘플수 가중)
rent_gu = rent_df.groupby("구").apply(
    lambda x: np.average(x["평당월임대료"].dropna(),
                         weights=x.loc[x["평당월임대료"].notna(), "샘플수"])
).round(2).reset_index()
rent_gu.columns = ["구", "평당월임대료"]
rent_dict = dict(zip(rent_gu["구"], rent_gu["평당월임대료"]))
print(f"  자치구 {len(rent_dict)}개 임대료 로드 완료")


# ─────────────────────────────────────
# 3. 업종별 지표 계산
# ─────────────────────────────────────
print("\n[3/4] 업종별 지표 계산...")

latest_df = df[df["STDR_YYQU_CD"] == latest_q].copy()

# 서울 전체 집계 (최신 분기)
seoul = latest_df.groupby("SVC_INDUTY_CD_NM").agg(
    store_count    =("STOR_CO",         "sum"),
    open_stores    =("OPBIZ_STOR_CO",   "sum"),
    close_stores   =("CLSBIZ_STOR_CO",  "sum"),
).reset_index()
seoul.columns = ["name", "store_count", "open_stores", "close_stores"]
seoul = seoul[seoul["store_count"] > 50].copy()

total_open = seoul["open_stores"].sum()
seoul["open_rate"]       = (seoul["open_stores"]  / seoul["store_count"] * 100).round(2)
seoul["close_rate"]      = (seoul["close_stores"] / seoul["store_count"] * 100).round(2)
seoul["net_growth"]      = (seoul["open_rate"] - seoul["close_rate"]).round(2)
seoul["startup_share"]   = (seoul["open_stores"] / total_open * 100).round(2)
seoul["verdict"]         = seoul.apply(
    lambda r: get_verdict(r["net_growth"], r["close_rate"]), axis=1
)

# 분기별 트렌드 (서울 전체)
trend_data = {}
for q in all_quarters:
    qdf = df[df["STDR_YYQU_CD"] == q].groupby("SVC_INDUTY_CD_NM").agg(
        store_count =("STOR_CO",       "sum"),
        open_stores =("OPBIZ_STOR_CO", "sum"),
        close_stores=("CLSBIZ_STOR_CO","sum"),
    ).reset_index()
    qdf.columns = ["name","store_count","open_stores","close_stores"]
    for _, row in qdf.iterrows():
        nm = row["name"]
        if nm not in trend_data:
            trend_data[nm] = []
        trend_data[nm].append({
            "q":   str(q),
            "sc":  int(row["store_count"]),
            "op":  round(float(row["open_stores"]  / row["store_count"] * 100), 2) if row["store_count"] > 0 else 0,
            "cl":  round(float(row["close_stores"] / row["store_count"] * 100), 2) if row["store_count"] > 0 else 0,
        })

# 자치구별 점포수 (최신 분기)
dist_data = {}
for _, row in latest_df.iterrows():
    nm   = row["SVC_INDUTY_CD_NM"]
    gu   = row["SIGNGU_CD_NM"]
    cnt  = row["STOR_CO"]
    if nm not in dist_data:
        dist_data[nm] = {}
    dist_data[nm][gu] = dist_data[nm].get(gu, 0) + float(cnt)

print(f"  업종 {len(seoul)}개 처리 완료")


# ─────────────────────────────────────
# 4. 자치구별 창업 추천 점수 계산
# ─────────────────────────────────────
print("\n[4/4] 자치구별 추천 점수 계산...")

# 자치구별 전체 업종 폐업률 평균 (경쟁 강도 proxy)
gu_stats = latest_df.groupby("SIGNGU_CD_NM").agg(
    total_stores=("STOR_CO",        "sum"),
    total_open  =("OPBIZ_STOR_CO",  "sum"),
    total_close =("CLSBIZ_STOR_CO", "sum"),
).reset_index()
gu_stats.columns = ["name","total_stores","total_open","total_close"]
gu_stats["avg_close_rate"] = (gu_stats["total_close"] / gu_stats["total_stores"] * 100).round(2)
gu_stats["avg_open_rate"]  = (gu_stats["total_open"]  / gu_stats["total_stores"] * 100).round(2)
gu_stats["rent"]           = gu_stats["name"].map(rent_dict).fillna(rent_df["평당월임대료"].mean())

# 정규화 (0~100점, 낮은 폐업률·낮은 임대료 = 높은 점수)
def norm_inv(s):
    mn, mx = s.min(), s.max()
    return ((mx - s) / (mx - mn) * 100).round(1) if mx != mn else pd.Series([50.0]*len(s), index=s.index)

def norm(s):
    mn, mx = s.min(), s.max()
    return ((s - mn) / (mx - mn) * 100).round(1) if mx != mn else pd.Series([50.0]*len(s), index=s.index)

gu_stats["score_competition"] = norm_inv(gu_stats["avg_close_rate"])  # 낮을수록 좋음
gu_stats["score_rent"]        = norm_inv(gu_stats["rent"])             # 낮을수록 좋음
gu_stats["score_open"]        = norm(gu_stats["avg_open_rate"])        # 높을수록 좋음

# 종합 점수: 경쟁(40%) + 임대료(40%) + 개업활성도(20%)
gu_stats["total_score"] = (
    gu_stats["score_competition"] * 0.4 +
    gu_stats["score_rent"]        * 0.4 +
    gu_stats["score_open"]        * 0.2
).round(1)

gu_stats = gu_stats.sort_values("total_score", ascending=False)
print(f"  자치구 {len(gu_stats)}개 점수 계산 완료")
print("\n  TOP 5 추천 자치구:")
for _, r in gu_stats.head(5).iterrows():
    print(f"    {r['name']:8s}  종합:{r['total_score']:5.1f}점  폐업률:{r['avg_close_rate']:4.2f}%  임대료:{r['rent']:5.2f}만/평")


# ─────────────────────────────────────
# 5. SOT JSON 조립
# ─────────────────────────────────────
industries = {}
for _, row in seoul.iterrows():
    nm = row["name"]
    v  = row["verdict"]
    industries[nm] = {
        "name":          nm,
        "category":      get_category(nm),
        "verdict":       v,
        "verdict_meta":  VERDICT_META[v],
        "metrics": {
            "store_count":   int(row["store_count"]),
            "open_rate":     float(row["open_rate"]),
            "close_rate":    float(row["close_rate"]),
            "net_growth":    float(row["net_growth"]),
            "startup_share": float(row["startup_share"]),
        },
        "trend":     trend_data.get(nm, []),
        "districts": {
            k: round(v2, 0) for k, v2 in sorted(
                dist_data.get(nm, {}).items(),
                key=lambda x: x[1], reverse=True
            )
        },
    }

districts = {}
for _, row in gu_stats.iterrows():
    nm = row["name"]
    districts[nm] = {
        "name":             nm,
        "rent_per_pyeong":  float(round(row["rent"], 2)),
        "avg_close_rate":   float(row["avg_close_rate"]),
        "avg_open_rate":    float(row["avg_open_rate"]),
        "total_stores":     int(row["total_stores"]),
        "scores": {
            "competition": float(row["score_competition"]),
            "rent":        float(row["score_rent"]),
            "open":        float(row["score_open"]),
            "total":       float(row["total_score"]),
        },
    }

sot = {
    "_meta": {
        "description":    "LOKI 창업레이더 Single Source of Truth",
        "generated_at":   datetime.now().strftime("%Y-%m-%d %H:%M"),
        "latest_quarter": str(latest_q),
        "all_quarters":   [str(q) for q in all_quarters],
        "total_industries": len(industries),
        "total_districts":  len(districts),
        "verdict_thresholds": {
            "긍정": "순증가율 >= 1.0 AND 폐업률 < 2.5",
            "위험": "순증가율 < -2.0 OR 폐업률 >= 4.0",
            "검토": "순증가율 >= -0.5 AND 폐업률 < 3.5",
            "신중": "그 외",
        },
        "district_score_weights": {
            "competition": "40% (낮은 폐업률)",
            "rent":        "40% (낮은 임대료)",
            "open":        "20% (높은 개업 활성도)",
        },
        "data_sources": {
            "store_data":  "서울 열린데이터광장 OA-22173 (VwsmSignguStorW)",
            "rent_data":   "직방 서울 상가 임대료 DB (평당 월임대료)",
        },
    },
    "industries": industries,
    "districts":  districts,
    "radar": RADAR_T2,
}

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(sot, f, ensure_ascii=False, indent=2)

# ── loki_data.js 생성 (브라우저용) ──
js_str = "const LOKI_SOT=" + json.dumps(sot, ensure_ascii=False, separators=(',', ':')) + ";"
with open(JS_FILE, "w", encoding="utf-8") as f:
    f.write(js_str)

size_kb = os.path.getsize(OUT_FILE) / 1024
js_kb   = os.path.getsize(JS_FILE) / 1024
print(f"\n{'='*60}")
print(f"✅ SOT 생성 완료!")
print(f"   JSON: {OUT_FILE} ({size_kb:.0f} KB)")
print(f"   JS  : {JS_FILE} ({js_kb:.0f} KB)")
print(f"   업종: {len(industries)}개 / 자치구: {len(districts)}개")
print(f"   분기: {all_quarters[0]} ~ {all_quarters[-1]}")
print(f"{'='*60}")
