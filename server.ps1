# 픽리그 (PICK LEAGUE) Windows PowerShell 내장 로컬 서버 & 치지직 API 프록시
# 별도 Python 또는 Node.js 설치 없이 Windows 순정 기능만으로 동작합니다.

$port = 8000
$rootPath = $PSScriptRoot
if (-not $rootPath) { $rootPath = Get-Location }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "[Error] Port $port is already in use or access denied: $_" -ForegroundColor Red
    Write-Host "Please close any other web server using port $port and try again." -ForegroundColor Yellow
    Exit
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "[PICK LEAGUE] Windows Built-in Proxy Server Started!" -ForegroundColor Green
Write-Host "Address: http://localhost:$port" -ForegroundColor Green
Write-Host "Chzzk API Proxy: Active (/api/proxy?url=...)" -ForegroundColor Green
Write-Host "Keep this window open while using the program." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop the server." -ForegroundColor Gray
Write-Host "===================================================" -ForegroundColor Cyan

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
    ".mp3"  = "audio/mpeg"
    ".mp4"  = "video/mp4"
    ".webp" = "image/webp"
}

function Add-CorsHeaders($response) {
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $response.Headers.Add("Access-Control-Allow-Headers", "*")
    $response.Headers.Add("Access-Control-Allow-Private-Network", "true")
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        Add-CorsHeaders $response

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $rawUrl = $request.RawUrl
        $path = $request.Url.LocalPath

        # 치지직 프록시 엔드포인트 처리: /api/proxy?url=
        if ($path -eq "/api/proxy") {
            $targetUrl = $request.QueryString["url"]
            if ([string]::IsNullOrWhiteSpace($targetUrl)) {
                $response.StatusCode = 400
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Missing url parameter"}')
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }

            try {
                $uri = [System.Uri]$targetUrl
                $hostName = $uri.Host.ToLower()
                if ($hostName -ne "naver.com" -and -not $hostName.EndsWith(".naver.com")) {
                    $response.StatusCode = 403
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Only naver.com domains are allowed"}')
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    $response.Close()
                    continue
                }

                $webReq = [System.Net.HttpWebRequest]::Create($targetUrl)
                $webReq.Method = "GET"
                $webReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                $webReq.Referer = "https://chzzk.naver.com/"
                $webReq.Accept = "application/json, text/plain, */*"
                $webReq.Timeout = 8000

                $webResp = $webReq.GetResponse()
                $response.StatusCode = [int]$webResp.StatusCode
                $response.ContentType = $webResp.ContentType
                
                $stream = $webResp.GetResponseStream()
                $stream.CopyTo($response.OutputStream)
                $stream.Close()
                $webResp.Close()
            } catch [System.Net.WebException] {
                $webEx = $_.Exception
                if ($webEx.Response) {
                    $response.StatusCode = [int]$webEx.Response.StatusCode
                    $stream = $webEx.Response.GetResponseStream()
                    $stream.CopyTo($response.OutputStream)
                    $stream.Close()
                } else {
                    $response.StatusCode = 502
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("{`"error`":`"$($webEx.Message)`"}")
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } catch {
                $response.StatusCode = 500
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("{`"error`":`"$($_.Exception.Message)`"}")
                $response.ContentType = "application/json; charset=utf-8"
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }

            $response.Close()
            continue
        }

        # 정적 파일 서빙
        $localPath = $path.TrimStart('/')
        if ([string]::IsNullOrEmpty($localPath)) {
            $localPath = "index.html"
        }
        $localPath = [System.Uri]::UnescapeDataString($localPath).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $fullPath = [System.IO.Path]::Combine($rootPath, $localPath)

        if ([System.IO.File]::Exists($fullPath)) {
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            if ($mimeTypes.ContainsKey($ext)) {
                $response.ContentType = $mimeTypes[$ext]
            } else {
                $response.ContentType = "application/octet-stream"
            }

            $fileBytes = [System.IO.File]::ReadAllBytes($fullPath)
            $response.ContentLength64 = $fileBytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $notFoundBytes.Length
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }

        $response.Close()
    } catch {
        # Listener loop continues on individual request errors
    }
}
