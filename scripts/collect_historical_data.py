"""
LOKI 창업레이더 — 서울 상권분석 히스토리 수집기
서울 열린데이터광장 API → 2019 Q1 ~ 2025 Q4 전체 자동 수집

[핵심 수정사항 - API 문서 기준]
  - URL 형식: {BASE}/{SERVICE}/{start}/{end}/  ← 년분기 파라미터 없음
  - STDR_YYQU_CD 는 URL 파라미터가 아닌 응답 데이터 내 필드
  - 전체 데이터를 받아 STDR_YYQU_CD 기준으로 필터링

실행: python3 scripts/collect_historical_data.py
"""

import requests
import pandas as pd
import time
import os

# ───────────────────────────────────────────────
# 설정
# ───────────────────────────────────────────────
API_KEY      = "59707354546a6179313133724a4b6571"
BASE_URL     = f"http://openapi.seoul.go.kr:8088/{API_KEY}/json"

SERVICE_NAME = "VwsmSignguStorW"   # OA-22173 점포-자치구 확인된 서비스명

PAGE_SIZE    = 1000     # 한 번에 가져올 행 수 (최대 1000)

# 수집 기간: 기준년분기코드 형식 YYYYQ
# 예: 2019년 1분기 = 20191, 2025년 4분기 = 20254
QUARTERS_TO_COLLECT = [
    f"{y}{q}" for y in range(2019, 2026) for q in [1, 2, 3, 4]
    if not (y == 2026)  # 미래 분기 제외
]

# 출력 경로
OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), "..", "data", "historical")
MERGED_FILE = os.path.join(OUTPUT_DIR, "all_quarters_merged.csv")

os.makedirs(OUTPUT_DIR, exist_ok=True)


# ───────────────────────────────────────────────
# API 유틸
# ───────────────────────────────────────────────
def get_total_count() -> int:
    """전체 데이터 건수 조회 (1건만 요청)"""
    url = f"{BASE_URL}/{SERVICE_NAME}/1/1/"
    r   = requests.get(url, timeout=15)
    r.raise_for_status()
    data = r.json()

    if "RESULT" in data:
        code = data["RESULT"].get("CODE", "")
        msg  = data["RESULT"].get("MESSAGE", "")
        raise ValueError(f"API 오류 [{code}] {msg}")

    svc_key = SERVICE_NAME if SERVICE_NAME in data else list(data.keys())[0]
    meta    = data.get(svc_key, {})

    if "RESULT" in meta:
        code = meta["RESULT"].get("CODE", "")
        msg  = meta["RESULT"].get("MESSAGE", "")
        if code != "INFO-000":
            raise ValueError(f"API 오류 [{code}] {msg}")

    return int(meta.get("list_total_count", 0))


def fetch_page(start: int, end: int) -> list:
    """API 한 페이지 호출 — URL에 년분기 파라미터 없음"""
    url  = f"{BASE_URL}/{SERVICE_NAME}/{start}/{end}/"
    r    = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    svc_key = SERVICE_NAME if SERVICE_NAME in data else list(data.keys())[0]
    return data[svc_key].get("row", [])


# ───────────────────────────────────────────────
# 전체 수집 후 분기별 분리 저장
# ───────────────────────────────────────────────
def collect_all() -> pd.DataFrame:
    """전체 데이터 수집"""
    print("전체 데이터 건수 확인 중...")
    try:
        total = get_total_count()
    except Exception as e:
        print(f"❌ 총 건수 조회 실패: {e}")
        print()
        print("▶ 서비스명을 확인하세요:")
        print("  1. https://data.seoul.go.kr/dataList/OA-22173/S/1/datasetView.do 접속")
        print("  2. '오픈 API' 탭 클릭 → 서비스명 확인")
        print(f"  3. 이 스크립트의 SERVICE_NAME = '{SERVICE_NAME}' 을 올바른 값으로 수정")
        return pd.DataFrame()

    print(f"총 {total:,}건 확인. 수집 시작...")
    print(f"예상 API 호출 횟수: {(total // PAGE_SIZE) + 1}회\n")

    all_rows = []
    for s in range(1, total + 1, PAGE_SIZE):
        e = min(s + PAGE_SIZE - 1, total)
        try:
            rows = fetch_page(s, e)
            all_rows.extend(rows)
            progress = len(all_rows) / total * 100
            print(f"  수집 중... {len(all_rows):,}/{total:,}행 ({progress:.1f}%)", end="\r")
        except Exception as e:
            print(f"\n❌ {s}~{e}행 수집 실패: {e}")
        time.sleep(0.2)

    print(f"\n✅ 전체 수집 완료: {len(all_rows):,}행")
    return pd.DataFrame(all_rows)


# ───────────────────────────────────────────────
# 메인
# ───────────────────────────────────────────────
def main():
    print("=" * 60)
    print("LOKI 서울 상권분석 히스토리 수집 시작")
    print(f"서비스명: {SERVICE_NAME}")
    print(f"대상 분기: {QUARTERS_TO_COLLECT[0]} ~ {QUARTERS_TO_COLLECT[-1]}")
    print("=" * 60)

    # 1. 전체 데이터 수집
    df = collect_all()
    if df.empty:
        return

    # 2. 컬럼명 확인
    print(f"\n[수집된 컬럼]: {list(df.columns)}")

    # 3. STDR_YYQU_CD 컬럼 찾기 (한글 또는 영문)
    yyqu_col = None
    for col in df.columns:
        if "STDR_YY" in col.upper() or "기준_년" in col or "기준년" in col:
            yyqu_col = col
            break

    if yyqu_col is None:
        print("⚠️  년분기 코드 컬럼을 찾지 못했습니다. 컬럼 목록을 확인하세요.")
        # 전체 데이터 저장만 하고 종료
        df.to_csv(MERGED_FILE, index=False, encoding="utf-8-sig")
        print(f"   전체 데이터 저장: {MERGED_FILE}")
        return

    print(f"   년분기 컬럼: '{yyqu_col}'")
    print(f"   포함된 분기: {sorted(df[yyqu_col].unique())}")

    # 4. 분기별 필터링 & 개별 CSV 저장
    saved = []
    for yyqu in sorted(df[yyqu_col].unique()):
        yyqu_str = str(yyqu)
        if len(yyqu_str) == 5:  # 20191 형식
            year = int(yyqu_str[:4])
            q    = int(yyqu_str[4])
            label = f"{year}_Q{q}"
        else:
            label = yyqu_str

        sub  = df[df[yyqu_col] == yyqu].copy()
        path = os.path.join(OUTPUT_DIR, f"{label}.csv")
        sub.to_csv(path, index=False, encoding="utf-8-sig")
        print(f"  ✅ {label}: {len(sub):,}행 → {path}")
        saved.append(sub)

    # 5. 전체 병합 저장
    if saved:
        merged = pd.concat(saved, ignore_index=True)
        merged.to_csv(MERGED_FILE, index=False, encoding="utf-8-sig")

        print("\n" + "=" * 60)
        print(f"✅ 수집 완료!")
        print(f"   총 {len(merged):,}행 / {len(saved)}개 분기")
        print(f"   저장 위치: {OUTPUT_DIR}/")
        print(f"   병합 파일: {MERGED_FILE}")
        print("=" * 60)


if __name__ == "__main__":
    main()
