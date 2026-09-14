@echo off
chcp 65001 > nul
echo ===================================================
echo [스위스-Elo 골든 토너먼트] 로컬 서버를 실행합니다...
echo 브라우저에서 http://localhost:8000 으로 자동 접속됩니다.
echo 종료하시려면 이 창을 닫아주세요.
echo ===================================================

start http://localhost:8000
python -m http.server 8000
