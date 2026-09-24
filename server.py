# -*- coding: utf-8 -*-
"""
골든 토너먼트 로컬 서버 & 치지직 API 프록시
- 별도의 외부 패키지 설치 없이 Python 표준 라이브러리만 사용합니다.
- HTML, CSS, JS 정적 파일 서빙 (포트 8000)
- /api/proxy?url= 엔드포인트를 통해 브라우저의 치지직 API CORS 제약을 100% 해소합니다.
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import sys

PORT = 8000

class TournamentRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 모든 정적 파일 및 응답에 CORS 및 로컬 사설 네트워크 허용 헤더 주입
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # 치지직 API 프록시 라우팅: /api/proxy?url=<인코딩된URL>
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/proxy':
            query_params = urllib.parse.parse_qs(parsed.query)
            target_url = query_params.get('url', [None])[0]

            if not target_url:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(b'{"error": "Missing url parameter"}')
                return

            try:
                # 네이버/치지직 도메인 안전성 정밀 검증
                parsed_target = urllib.parse.urlparse(target_url)
                host = parsed_target.netloc.lower().split(':')[0]
                if not (host == 'naver.com' or host.endswith('.naver.com')):
                    self.send_response(403)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Only naver.com domains are allowed"}')
                    return

                req = urllib.request.Request(
                    target_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'application/json, text/plain, */*',
                        'Referer': 'https://chzzk.naver.com/'
                    }
                )
                with urllib.request.urlopen(req, timeout=8) as response:
                    content = response.read()
                    content_type = response.headers.get('Content-Type', 'application/json; charset=utf-8')

                    self.send_response(response.status)
                    self.send_header('Content-Type', content_type)
                    self.end_headers()
                    self.wfile.write(content)

            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                try:
                    self.wfile.write(e.read())
                except Exception:
                    self.wfile.write(f'{{"error": "HTTP Error {e.code}"}}'.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))
            return

        # 일반 정적 파일 서빙
        super().do_GET()

if __name__ == '__main__':
    # 포트 재사용 허용 설정 (재시작 시 포트 충돌 방지)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", PORT), TournamentRequestHandler) as httpd:
            print(f"===================================================")
            print(f"[골든 토너먼트 - 랭크 레이스] 로컬 서버가 시작되었습니다.")
            print(f"주소: http://localhost:{PORT}")
            print(f"치지직 API 프록시가 활성화되었습니다.")
            print(f"종료하려면 Ctrl+C를 누르거나 이 창을 닫아주세요.")
            print(f"===================================================")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
        sys.exit(0)
