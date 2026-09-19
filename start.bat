@echo off
chcp 65001 > nul
title [스위스-Elo 골든 토너먼트] 로컬 서버 & 치지직 API 프록시
echo ========================================================
echo [스위스-Elo 골든 토너먼트] 로컬 서버를 시작합니다...
echo 브라우저에서 http://localhost:8000 으로 자동 접속됩니다.
echo 치지직 CORS 우회 프록시(/api/proxy)가 가동됩니다.
echo 종료하시려면 이 창을 닫아주세요.
echo ========================================================

start http://localhost:8000

if exist server.py (
    python server.py
) else (
    echo [안내] server.py 파일이 감지되지 않아 인라인 프록시 서버로 즉시 구동합니다...
    python -c "import http.server, socketserver, urllib.request, urllib.parse; class H(http.server.SimpleHTTPRequestHandler): end_headers=lambda s:(s.send_header('Access-Control-Allow-Origin','*'),s.send_header('Access-Control-Allow-Methods','*'),s.send_header('Access-Control-Allow-Headers','*'),super(H,s).end_headers()); do_OPTIONS=lambda s:(s.send_response(200),s.end_headers()); do_GET=lambda s:(s.proxy() if s.path.startswith('/api/proxy') else super(H,s).do_GET()); proxy=lambda s:(lambda p,q: (s.send_response(400),s.end_headers()) if not q.get('url') else (lambda u: (lambda req: (lambda res: (s.send_response(res.status),s.send_header('Content-Type',res.headers.get('Content-Type','application/json')),s.end_headers(),s.wfile.write(res.read())))(urllib.request.urlopen(req,timeout=8)))(urllib.request.Request(u[0],headers={'User-Agent':'Mozilla/5.0','Referer':'https://chzzk.naver.com/'})))(q['url']))(urllib.parse.urlparse(s.path),urllib.parse.parse_qs(urllib.parse.urlparse(s.path).query)); socketserver.TCPServer.allow_reuse_address=True; print('✓ 치지직 로컬 프록시 서버 실행 중 (http://localhost:8000/api/proxy)'); socketserver.TCPServer(('', 8000), H).serve_forever()"
)
pause
