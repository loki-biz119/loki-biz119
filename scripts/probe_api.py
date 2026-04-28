"""
API 서비스명 자동 탐색 (수정버전)
- URL에 년분기 파라미터 없음 (API 문서 확인)
- STDR_YYQU_CD 는 응답 데이터 내 필드
python3 scripts/probe_api.py
"""
import requests, json, time

API_KEY  = "59707354546a6179313133724a4b6571"
BASE_URL = f"http://openapi.seoul.go.kr:8088/{API_KEY}/json"

# 후보 서비스명 (자치구 점포 관련)
# 올바른 URL 형식: {BASE}/{SERVICE}/1/3/
SERVICES = [
    "VwsmSignguStorW",       # ✅ OA-22173 오픈API 탭 확인된 서비스명
    "VwsmSignguStorQq",      # 기존 후보 (비교용)
    "VwsmAdstrdStorQq",      # 행정동 버전
]

print("=" * 70)
print("서비스명 탐색 (URL 형식: /SERVICE/1/3/ — 파라미터 없음)")
print("=" * 70)

found = []

for svc in SERVICES:
    url = f"{BASE_URL}/{svc}/1/3/"
    try:
        r    = requests.get(url, timeout=10)
        text = r.text[:300].strip()

        ok = r.status_code == 200 and ("list_total_count" in text or "INFO-000" in text or '"row"' in text)
        mark = "✅" if ok else "  "
        print(f"\n{mark} {svc}")
        print(f"   상태: {r.status_code}")
        print(f"   응답: {text[:150]}")
        if ok:
            found.append(svc)
            print(f"  >>> 정답!")
    except Exception as e:
        print(f"  ✗ {svc} → 오류: {e}")
    time.sleep(0.3)

print("\n" + "=" * 70)
if found:
    print(f"✅ 작동하는 서비스명: {found}")
else:
    print("❌ 작동하는 서비스명 없음")
    print()
    print("▶ 해결방법:")
    print("  1. https://data.seoul.go.kr/dataList/OA-22173/S/1/datasetView.do 접속")
    print("  2. '오픈 API' 탭 클릭")
    print("  3. '서비스명' 항목 확인 (예: VwsmXxxxxXxxxxx)")
    print("  4. collect_historical_data.py 의 SERVICE_NAME 을 해당 값으로 변경")
print("=" * 70)
