# 🏆 GOLDEN TOURNAMENT (스위스-Elo 골든 토너먼트)

> **"조기 탈락 없는 공정한 스위스 균등 노출과 실시간 Elo 래더, 골든 파이널 4강 챔피언십이 결합된 차세대 유튜브 영상/음악 토너먼트"**

기존 이상형 월드컵의 치명적인 단점이었던 **"1라운드 패배 시 다시는 볼 수 없는 문제(대진운에 따른 조기 탈락)"**를 완전히 해결하기 위해 설계된 차세대 반응형 웹 애플리케이션입니다.

---

## ✨ 핵심 기능 및 특징

### 1. 1단계: 스위스 균등 노출 (Fair Swiss Phase)
- 모든 참가 후보가 최소 2~3회 이상 의무적으로 대결에 등장합니다.
- 조기 탈락 없이 모든 영상의 초기 전적과 객관적인 레이팅을 수립합니다.

### 2. 2단계: 실시간 Elo 라이벌 래더 (Elo Ladder Phase)
- 실시간 Elo 레이팅 기반으로 점수 차가 적은 라이벌끼리 1:1 진검승부를 치릅니다.
- **실시간 승률 예측 게이지**: 대결 중인 두 후보의 Elo 차이를 바탕으로 예상 승률(%)이 실시간 연산되어 시각화됩니다.
- **코스 선택**: ⚡ 퀵 코스(16매치), ⚖️ 표준 밸런스(28매치), 🎯 마스터 래더(45매치) 중 취향에 맞게 진행 가능합니다.

### 3. 3단계: 골든 파이널 4강 토너먼트 (Golden Final 4)
- 래더 종료 후 상위 1~4위 후보가 자동으로 4강 브래킷에 진출합니다.
- **4강 1경기(1위 vs 4위) ➔ 4강 2경기(2위 vs 3위) ➔ 결승전(Grand Final)** 순으로 진행됩니다.
- 4강 및 결승전 전용 골든 뱃지와 전적, 승률 게이지, 투표 타격감 플래시 애니메이션이 적용됩니다.

### 4. 4단계: 명예의 전당 & 인터랙티브 티어표 (Tier Maker)
- **챔피언 헌정 세션**: 최종 우승 영상의 하이라이트 및 공식 YouTube 감상 링크 제공.
- **마노사바 스타일 드래그 & 드롭**: S, A, B, C, D 등급별 티어표에서 마우스 드래그로 순위를 미세 조정할 수 있습니다.
- **스마트 내보내기**:
  - 📋 **결과 순위표 텍스트 복사**: 커뮤니티 공유용 텍스트 클립보드 복사.
  - 🖼️ **티어표 고화질 이미지 저장**: HTML5 Canvas를 활용하여 워터마크가 포함된 고화질 PNG 이미지 원클릭 다운로드.

### 5. 방송 스트리머 특화 기능 (Streamer Optimization)
- **📺 치지직(CHZZK) 실시간 채팅 투표 연동**: 스트리머 채널 연결 시 시청자가 채팅창에 `1/A` 또는 `2/B` 입력 시 실시간 투표 게이지에 집계 & [시청자 다수결 반영] 지원.
- **↺ 투표 직전 취소 (Undo)**: 오클릭 발생 시 Elo 변동 및 이전 매치 스냅샷으로 1초 롤백.
- **⏩ 진행 세션 자동 저장 & 이어하기 (Save & Resume)**: 새로고침 또는 브라우저 재시작 시 이전 진행 상황 원클릭 복구.
- **🎬 임베드 사전 점검**: 외부 사이트 재생 차단(오류 150/101) 및 삭제 영상을 사전 스캔하여 방송 사고 방지.
- **⚙️ 후보 수 비례 코스 자동 보정 인터락**: 참가 영상 수($N$)에 따라 퀵, 표준, 마스터 매치 수 자동 산출.

### 6. Zero-Lag 60FPS 극강 최적화 (Extreme Performance)
- **Iframe 영구 풀링(Instance Reuse)**: 매 라운드마다 iframe을 파괴하고 생성하지 않고, 좌/우 2개의 플레이어 인스턴스를 영구 재활용하여 가비지 컬렉션(GC)으로 인한 프레임 드랍을 원천 차단했습니다.
- **GPU 가속 애니메이션**: 부드러운 글래스모피즘, 승리 타격감 플래시 효과, 실시간 프로그레스 바가 항시 60FPS를 유지합니다.

---

## ⌨️ 단축키 안내

대결 화면(`battle view`)에서 키보드로 빠른 조작이 가능합니다:

| 단축키 | 동작 |
| :--- | :--- |
| <kbd>A</kbd> 또는 <kbd>←</kbd> | 좌측(A) 후보 투표 |
| <kbd>D</kbd> 또는 <kbd>→</kbd> | 우측(B) 후보 투표 |
| <kbd>Z</kbd> 또는 <kbd>Ctrl</kbd> + <kbd>Z</kbd> | **직전 투표 취소 및 복원 (Undo)** |

---

## 🚀 실행 방법

### 방법 1: 로컬 원클릭 실행 (Windows 권장)
1. 폴더 내의 **`start.bat`** 파일을 더블 클릭합니다.
2. 내장된 Python 경량 HTTP 서버(`http://localhost:8000`)가 구동되며 기본 브라우저가 자동으로 실행됩니다.

### 방법 2: VS Code Live Server
- VS Code에서 `index.html` 우클릭 ➔ **"Open with Live Server"** 클릭.

---

## 🌐 웹 배포 안내 (GitHub Pages)

순수 정적 웹 애플리케이션(HTML5/CSS3/Vanilla JS)이므로 별도의 백엔드 구축 없이 무료 호스팅이 가능합니다:

1. GitHub 저장소의 **Settings** 메뉴로 이동합니다.
2. 좌측 메뉴의 **Pages**를 클릭합니다.
3. **Build and deployment** 항목의 Source를 `Deploy from a branch`로 설정합니다.
4. Branch를 `main` (또는 master) / `/ (root)` 로 선택 후 **Save**를 누릅니다.
5. 1~2분 후 제공되는 URL (`https://<username>.github.io/<repo-name>/`)로 전 세계 어디서나 접속할 수 있습니다.

---

## 🛠️ 기술 스택

- **Frontend Core**: Semantic HTML5, Vanilla JavaScript (ES6+ Class Architecture)
- **Styling**: Vanilla CSS3 (Custom Glassmorphism, CSS Variables, GPU Animation, Flex/Grid Layout)
- **External API**: YouTube Iframe Player API
- **Graphics / Export**: HTML5 Canvas 2D Context API (Zero-Lag Snapshot Rendering)

---

## 📁 프로젝트 구조

```text
토너먼트 프로그램/
├── css/
│   └── style.css          # 프리미엄 다크 글래스모피즘 디자인 시스템 및 60FPS 애니메이션
├── js/
│   ├── app.js             # 애플리케이션 진입점, 화면 라우팅 및 단축키 관리
│   ├── bracket.js         # 골든 파이널 4강/결승 토너먼트 트리 관리 및 연출
│   ├── defaultData.js     # 기본 16선 유튜브 영상 데이터
│   ├── engine.js          # 스위스 균등 노출 & 실시간 Elo 래더 엔진
│   ├── player.js          # YouTube Iframe 영구 풀링 듀얼 플레이어 (Zero-Lag)
│   └── tiermaker.js       # 드래그앤드롭 인터랙티브 티어표 & Canvas 이미지 생성기
├── index.html             # 시맨틱 마크업 메인 페이지
├── README.md              # 프로젝트 안내 및 배포 가이드 문서
└── start.bat              # 로컬 원클릭 실행 배치 스크립트
```
