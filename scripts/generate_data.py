#!/usr/bin/env python3
"""
LOKI Single Source of Truth 데이터 생성기
기준: Q4(20254), 전체 서울, 유사업종 1000개↑ 필터
출력: index.html DATA 블록 + 블로그용 JSON

BCG 판정 기준 (Industry Dynamics / OECD Net Entry Rate 기반)
  순증가율  = 개업율 - 폐업율
  창업점유율 = 업종 개업수 / 전체 개업수 × 100
  기준선    : 순증가율 0% / 창업점유율 1%

  진입 긍정 : 순증가율 ≥ 0  AND 창업점유율 ≥ 1%  (Star)
  진입 검토 : 순증가율 ≥ 0  AND 창업점유율 < 1%  (Question Mark)
  진입 신중 : 순증가율 < 0  AND 창업점유율 ≥ 1%  (Cash Cow)
  진입 위험 : 순증가율 < 0  AND 창업점유율 < 1%  (Dog)
"""
import pandas as pd, json, os

# ── 설정 ──────────────────────────────────────────────────
QTR        = 20254
MIN_STORE  = 1000
TOP_N      = 5
SHARE_LINE = 1.0   # 창업점유율 기준선 (%) — 서울 신규창업 100개 중 1개
BASE       = os.path.dirname(__file__)
DONG_CSV   = os.path.join(BASE, "../raw data/원본데이터/서울 열린데이터광장/서울시 상권분석서비스(점포-행정동)_25년.csv")
GU_CSV     = os.path.join(BASE, "../raw data/원본데이터/서울 열린데이터광장/서울시 상권분석서비스(점포-자치구).csv")

# ── 전문직 분리 (자격증 없이 개업 불가) ──────────────────
PROFESSIONAL_CSV = {
    "일반의원", "치과의원", "한의원", "동물병원",
    "변호사사무소", "변리사사무소", "법무사사무소", "기타법무서비스",
    "회계사사무소", "세무사사무소", "의약품"
}

# ── 업종명 표시 매핑 ──────────────────────────────────────
CSV_MAP = {
    "DVD방":"DVD방","PC방":"PC방","가구":"가구점","가방":"가방/핸드백",
    "가전제품":"가전제품판매점","가전제품수리":"가전수리점","가정용품임대":"가정용품임대",
    "건축물청소":"건물청소업","게스트하우스":"게스트하우스","고시원":"고시원",
    "골프연습장":"골프연습장","기타법무서비스":"법무서비스","기타오락장":"오락시설",
    "네일숍":"네일숍","노래방":"노래방","녹음실":"녹음실","당구장":"당구장",
    "독서실":"독서실","동물병원":"동물병원","모터사이클및부품":"오토바이판매",
    "모터사이클수리":"오토바이수리","문구":"문구점","미곡판매":"쌀가게",
    "미용실":"미용실","미용재료":"미용재료","반찬가게":"식료품가게",
    "법무사사무소":"법무사","변리사사무소":"변리사","변호사사무소":"변호사",
    "복권방":"복권/로또","볼링장":"볼링장","부동산중개업":"공인중개사",
    "분식전문점":"분식점","비디오/서적임대":"비디오임대","사진관":"사진관",
    "서적":"서점","섬유제품":"섬유/직물","세무사사무소":"세무사","세탁소":"세탁소",
    "수산물판매":"수산물가게","슈퍼마켓":"슈퍼마켓","스포츠 강습":"스포츠교실",
    "스포츠클럽":"헬스장·피트니스","시계및귀금속":"시계·귀금속점","신발":"신발가게",
    "악기":"악기점","안경":"안경점","애완동물":"반려동물샵","양식음식점":"양식당",
    "여관":"여관·모텔","여행사":"여행사","예술품":"예술품/갤러리","예술학원":"예술학원",
    "완구":"장난감가게","외국어학원":"어학원","운동/경기용품":"스포츠용품점",
    "유아의류":"유아의류","육류판매":"정육점","의료기기":"의료기기점",
    "의류임대":"의류임대","의약품":"약국","인테리어":"인테리어업체",
    "일반교습학원":"공부방·교습소","일반의류":"옷가게","일반의원":"의원·병원",
    "일식음식점":"일식당","자동차미용":"세차장·자동차관리","자동차부품":"자동차부품",
    "자동차수리":"자동차수리점","자전거 및 기타운송장비":"자전거판매점",
    "재생용품 판매점":"재활용품점","전자게임장":"전자게임장","전자상거래업":"온라인쇼핑몰",
    "제과점":"베이커리·제과점","조명용품":"조명용품","주류도매":"주류도매",
    "주유소":"주유소","중고가구":"중고가구","중고차판매":"중고차",
    "중식음식점":"중식당","철물점":"철물점","청과상":"과일·채소가게",
    "치과의원":"치과","치킨전문점":"치킨/배달","커피-음료":"카페·커피숍",
    "컴퓨터및주변장치판매":"컴퓨터판매점","컴퓨터학원":"컴퓨터학원",
    "통번역서비스":"통번역","통신기기수리":"통신기기수리","패스트푸드점":"패스트푸드",
    "편의점":"편의점","피부관리실":"피부관리실","한복점":"한복점",
    "한식음식점":"한식당","한의원":"한의원","핸드폰":"핸드폰가게",
    "호프-간이주점":"호프집·주점","화장품":"화장품가게","화초":"꽃집·화초점",
    "회계사사무소":"회계사"
}

REVERSE_MAP = {v: k for k, v in CSV_MAP.items()}

# ── 데이터 로드 ────────────────────────────────────────────
df_dong = pd.read_csv(DONG_CSV, encoding='cp949')
df_gu   = pd.read_csv(GU_CSV,   encoding='cp949')
q_dong  = df_dong[df_dong['기준_년분기_코드'] == QTR].copy()
q_gu    = df_gu[df_gu['기준_년분기_코드'] == QTR].copy()

# ── 헬퍼 ──────────────────────────────────────────────────
def top5_rows(df_grp, sort_col, n=TOP_N):
    return df_grp.sort_values(sort_col, ascending=False).head(n)

def fmt(val, count, total):
    return {'val': val, 'count': int(count), 'total': int(total)}

def bcg_judge(net_rate, share):
    """BCG 2×2 판정: 순증가율 0% / 창업점유율 1% 기준"""
    up  = net_rate >= 0
    big = share    >= SHARE_LINE
    if   up  and big:  return '진입 긍정'
    elif up  and not big: return '진입 검토'
    elif not up and big:  return '진입 신중'
    else:              return '진입 위험'

# ══════════════════════════════════════════════════════════
# 1. REGION (구별)
# ══════════════════════════════════════════════════════════
rg = q_gu.groupby('자치구_코드_명').agg(
    개업=('개업_점포_수','sum'), 총=('유사_업종_점포_수','sum'), 폐업=('폐업_점포_수','sum')
).reset_index()
rg['개업율'] = (rg['개업']/rg['총']*100).round(1)
rg['폐업율'] = (rg['폐업']/rg['총']*100).round(1)
rg['순증가율'] = (rg['개업율'] - rg['폐업율']).round(1)

region_open  = [{'label':r['자치구_코드_명'],**fmt(r['개업율'],r['개업'],r['총'])}
                for _,r in top5_rows(rg,'개업율').iterrows()]
region_close = [{'label':r['자치구_코드_명'],**fmt(r['폐업율'],r['폐업'],r['총'])}
                for _,r in top5_rows(rg,'폐업율').iterrows()]

# 구별 드릴다운
def region_drill(target_regions, sort_col, min_store=300):
    result = {}
    for gu in target_regions:
        sub = q_gu[q_gu['자치구_코드_명'] == gu].copy()
        sub = sub[sub['유사_업종_점포_수'] >= min_store]
        sub['label'] = sub['서비스_업종_코드_명'].map(CSV_MAP).fillna(sub['서비스_업종_코드_명'])
        sub['개업율'] = (sub['개업_점포_수']/sub['유사_업종_점포_수']*100).round(1)
        sub['폐업율'] = (sub['폐업_점포_수']/sub['유사_업종_점포_수']*100).round(1)
        top = top5_rows(sub, sort_col)
        if sort_col == '개업율':
            result[gu] = [{'label':r['label'],**fmt(r['개업율'],r['개업_점포_수'],r['유사_업종_점포_수'])} for _,r in top.iterrows()]
        else:
            result[gu] = [{'label':r['label'],**fmt(r['폐업율'],r['폐업_점포_수'],r['유사_업종_점포_수'])} for _,r in top.iterrows()]
    return result

open_regions  = [r['label'] for r in region_open]
close_regions = [r['label'] for r in region_close]
all_regions   = list(set(open_regions + close_regions))

drill_region_open  = region_drill(all_regions, '개업율')
drill_region_close = region_drill(all_regions, '폐업율')

# 전체 지역 리스트 (지역 컨텐츠용)
region_all = []
for _, r in rg.sort_values('개업율', ascending=False).iterrows():
    region_all.append({
        'label':   r['자치구_코드_명'],
        'open':    r['개업율'],
        'close':   r['폐업율'],
        'net':     r['순증가율'],
        'openCnt': int(r['개업']),
        'closeCnt':int(r['폐업']),
        'total':   int(r['총']),
    })

# ══════════════════════════════════════════════════════════
# 2. BIZ (업종별)
# ══════════════════════════════════════════════════════════
biz_grp = q_dong.groupby('서비스_업종_코드_명').agg(
    개업=('개업_점포_수','sum'), 총=('유사_업종_점포_수','sum'), 폐업=('폐업_점포_수','sum')
).reset_index()
biz_grp['label']    = biz_grp['서비스_업종_코드_명'].map(CSV_MAP).fillna(biz_grp['서비스_업종_코드_명'])
biz_grp['개업율']   = (biz_grp['개업']/biz_grp['총']*100).round(1)
biz_grp['폐업율']   = (biz_grp['폐업']/biz_grp['총']*100).round(1)
biz_grp['순증가율'] = (biz_grp['개업율'] - biz_grp['폐업율']).round(1)

# 창업점유율 (전체 개업 기준)
total_open = biz_grp['개업'].sum()
biz_grp['창업점유율'] = (biz_grp['개업']/total_open*100).round(1)

# 전문직 분리
biz_pro  = biz_grp[biz_grp['서비스_업종_코드_명'].isin(PROFESSIONAL_CSV)].copy()
biz_gen  = biz_grp[~biz_grp['서비스_업종_코드_명'].isin(PROFESSIONAL_CSV)].copy()

# MIN_STORE 필터 (일반 업종)
biz_f = biz_gen[biz_gen['총'] >= MIN_STORE].copy()

# BCG 판정 적용
biz_f['판정'] = biz_f.apply(
    lambda r: bcg_judge(r['순증가율'], r['창업점유율']), axis=1
)

# 기존 TOP5 (일반 업종 기준)
biz_open  = [{'label':r['label'],**fmt(r['개업율'],r['개업'],r['총'])}
             for _,r in top5_rows(biz_f,'개업율').iterrows()]
biz_close = [{'label':r['label'],**fmt(r['폐업율'],r['폐업'],r['총'])}
             for _,r in top5_rows(biz_f,'폐업율').iterrows()]

# 전체 업종 BCG 리스트 (사이트 신규 섹션용)
biz_bcg = []
for _, r in biz_f.sort_values('순증가율', ascending=False).iterrows():
    biz_bcg.append({
        'label':   r['label'],
        'open':    r['개업율'],
        'close':   r['폐업율'],
        'net':     r['순증가율'],
        'share':   r['창업점유율'],
        'judge':   r['판정'],
        'total':   int(r['총']),
    })

# 전문직 리스트
biz_pro_f = biz_pro[biz_pro['총'] >= 500].copy()
biz_pro_f['판정'] = biz_pro_f.apply(
    lambda r: bcg_judge(r['순증가율'], r['창업점유율']), axis=1
)
biz_professional = []
for _, r in biz_pro_f.sort_values('순증가율', ascending=False).iterrows():
    biz_professional.append({
        'label':  r['label'],
        'open':   r['개업율'],
        'close':  r['폐업율'],
        'net':    r['순증가율'],
        'share':  r['창업점유율'],
        'judge':  r['판정'],
        'total':  int(r['총']),
    })

# 업종별 드릴다운
def biz_drill(target_labels_map, sort_col):
    result = {}
    for site_label, csv_name in target_labels_map.items():
        sub = q_gu[q_gu['서비스_업종_코드_명'] == csv_name].copy()
        sub['개업율'] = (sub['개업_점포_수']/sub['유사_업종_점포_수']*100).round(1)
        sub['폐업율'] = (sub['폐업_점포_수']/sub['유사_업종_점포_수']*100).round(1)
        sub = sub[sub['유사_업종_점포_수'] >= 50]
        top = top5_rows(sub, sort_col)
        if sort_col == '개업율':
            result[site_label] = [{'label':r['자치구_코드_명'],**fmt(r['개업율'],r['개업_점포_수'],r['유사_업종_점포_수'])} for _,r in top.iterrows()]
        else:
            result[site_label] = [{'label':r['자치구_코드_명'],**fmt(r['폐업율'],r['폐업_점포_수'],r['유사_업종_점포_수'])} for _,r in top.iterrows()]
    return result

# 드릴다운: TOP5 + BCG 전체 업종
drill_targets_open  = {r['label']: REVERSE_MAP.get(r['label'], r['label']) for r in biz_open}
drill_targets_close = {r['label']: REVERSE_MAP.get(r['label'], r['label']) for r in biz_close}
drill_targets_bcg   = {r['label']: REVERSE_MAP.get(r['label'], r['label']) for r in biz_bcg}
all_biz_labels = {**drill_targets_open, **drill_targets_close, **drill_targets_bcg}

drill_biz_open  = biz_drill(all_biz_labels, '개업율')
drill_biz_close = biz_drill(all_biz_labels, '폐업율')

# ══════════════════════════════════════════════════════════
# 3. 출력
# ══════════════════════════════════════════════════════════
DATA = {
    'meta': {
        'qtr': QTR,
        'shareLine': SHARE_LINE,
        'minStore':  MIN_STORE,
    },
    'region': {
        'open':       region_open,
        'close':      region_close,
        'all':        region_all,
        'drillOpen':  drill_region_open,
        'drillClose': drill_region_close,
    },
    'biz': {
        'open':         biz_open,
        'close':        biz_close,
        'bcg':          biz_bcg,
        'professional': biz_professional,
        'drillOpen':    drill_biz_open,
        'drillClose':   drill_biz_close,
    }
}

out_path = os.path.join(BASE, "data_output.json")
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(DATA, f, ensure_ascii=False, indent=2)

print("✅ 저장:", out_path)
print()
print(f"=== BCG 판정별 업종 수 (일반 {len(biz_f)}개) ===")
for j in ['진입 긍정','진입 검토','진입 신중','진입 위험']:
    cnt = biz_f[biz_f['판정']==j]
    print(f"  {j}: {len(cnt)}개")
print()
print("=== biz.open TOP5 (일반 업종) ===")
for r in biz_open:  print(f"  {r['label']:15s} {r['val']}% ({r['count']}/{r['total']})")
print()
print("=== biz.close TOP5 (일반 업종) ===")
for r in biz_close: print(f"  {r['label']:15s} {r['val']}% ({r['count']}/{r['total']})")
print()
print("=== 전문직 업종 ===")
for r in biz_professional:
    print(f"  {r['label']:12s}  순증가율 {r['net']:+.1f}%  창업점유율 {r['share']:.1f}%  {r['judge']}")
print()
print("=== region.open TOP5 ===")
for r in region_open:  print(f"  {r['label']:6s} {r['val']}%")
print()
print("=== region.close TOP5 ===")
for r in region_close: print(f"  {r['label']:6s} {r['val']}%")
