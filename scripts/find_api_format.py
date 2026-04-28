"""
정확한 API URL 형식 탐색
python3 scripts/find_api_format.py
"""
import requests, time

API_KEY = "59707354546a6179313133724a4b6571"
BASE    = f"http://openapi.seoul.go.kr:8088/{API_KEY}/json"

# 알려진 서비스명 후보들
SERVICES = ["VwsmSignguStorQq", "VwsmAdstrdStorQq", "VwsmSignguStor"]

# 파라미터 형식 후보 (20254 = 2025년 4분기, 확실히 존재하는 데이터)
FORMATS = [
    "1/3",            # 파라미터 없음
    "1/3/20254",      # YYYYQ
    "1/3/2025/4",     # YYYY/Q
    "1/3/2025",       # YYYY만
    "1/3/?STDR_YYQU_CD=20254",  # 쿼리스트링
]

print("=" * 70)
for svc in SERVICES:
    for fmt in FORMATS:
        url = f"{BASE}/{svc}/{fmt}/"
        try:
            r    = requests.get(url, timeout=8)
            body = r.text[:150].replace('\n', ' ')

            # 성공 판별: INFO-000 이거나 row 데이터가 있으면
            ok = "INFO-000" in body or '"row"' in body
            mark = "✅" if ok else "  "
            print(f"{mark} {svc}/{fmt}")
            print(f"     {r.status_code} | {body}")
            if ok:
                print(f"\n>>> 정답: {url}\n")
        except Exception as e:
            print(f"  ✗ {svc}/{fmt} → {e}")
        time.sleep(0.3)

print("=" * 70)
