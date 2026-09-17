/**
 * 메인 애플리케이션 진입점 & 화면 전환 컨트롤러
 */

const STORAGE_CANDIDATES_KEY = 'GOLDEN_TOURNAMENT_CANDIDATES_LIST';
const STORAGE_FONT_SETTINGS_KEY = 'GOLDEN_TOURNAMENT_FONT_SETTINGS';
const STORAGE_PERF_MODE_KEY = 'GOLDEN_TOURNAMENT_PERF_MODE';
const STORAGE_SAVED_SESSION_KEY = 'GOLDEN_TOURNAMENT_SAVED_SESSION';

// 치지직/유튜브 방송 송출 가독성 최적화 권장 기본값
const DEFAULT_FONT_SETTINGS = {
  scaleGlobal: 115,    // 115%
  battleTitle: 22,    // 22px
  battleChannel: 16,  // 16px
  battleMeta: 16,     // 16px
  battleBtn: 18,      // 18px
  bracketTitle: 16,   // 16px
  rankingTitle: 16    // 16px
};

class AppController {
  constructor() {
    this.candidates = [];
    this.fontSettings = { ...DEFAULT_FONT_SETTINGS };
    this.isLowPerfMode = false;
    this.currentView = 'setup'; // 'setup' | 'battle' | 'final' | 'result'
    this.engine = null; // engine.js에서 초기화
    this.bracket = null; // bracket.js에서 초기화
    this.tierMaker = null; // tiermaker.js에서 초기화
    this.chzzkChat = null; // chzzkChat.js에서 초기화
    this.embedCheckStatus = {}; // videoId -> 'ok' | 'warn' | 'checking'
  }

  init() {
    // 0. 화면 및 글씨 크기 설정 복원 및 즉시 적용
    this.initFontSettings();

    // 0-1. 저사양 / 하드웨어 가속 환경 자동 진단 및 성능 모드 복원
    this.initPerformanceMode();

    // 0-2. 치지직(CHZZK) 채팅 매니저 초기화
    this.initChzzk();

    // 1. 웹 저장소의 후보 목록 복원 (저장된 상태가 없으면 기본 16선 로드)
    this.loadDefaultCandidates();

    // 2. DOM 이벤트 리스너 등록
    this.bindEvents();

    // 3. 유튜브 플레이어 API 사전 로드
    if (window.dualPlayer) {
      window.dualPlayer.init();
    }

    // 4. 후보자 수에 비례한 적정 코스 매치 수 자동 갱신
    this.updateCourseMatchCounts();

    // 5. 초기 화면 렌더링
    this.renderCandidateList();
    this.switchView('setup');

    // 6. 진행 중이던 저장 세션 확인 및 복원 배너 표시
    this.checkSavedSession();
  }

  // 후보 목록 전체를 웹 저장소(localStorage)에 실시간 동기화
  saveCandidatesToStorage() {
    try {
      localStorage.setItem(STORAGE_CANDIDATES_KEY, JSON.stringify(this.candidates));
    } catch (e) {
      console.error('웹 저장소 동기화 실패:', e);
    }
  }

  loadDefaultCandidates() {
    // 웹 저장소에 사용자가 조작한 목록(빈 목록 포함)이 저장되어 있다면 그대로 복원!
    try {
      const stored = localStorage.getItem(STORAGE_CANDIDATES_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.candidates = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('웹 저장소 로드 오류, 기본값으로 초기화:', e);
    }

    // 저장소 데이터가 없는 최초 방문 시에만 기본 16선 로드 및 저장
    if (window.DEFAULT_VIDEOS && Array.isArray(window.DEFAULT_VIDEOS)) {
      this.candidates = window.DEFAULT_VIDEOS.map(v => ({ ...v }));
    } else {
      this.candidates = [];
    }
    this.saveCandidatesToStorage();
  }

  bindEvents() {
    // 후보 추가 버튼
    const btnAdd = document.getElementById('btn-add-video');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.handleAddVideo());
    }

    // 참가영상 목록 전체 임베드 재생 점검 버튼
    const btnCheckEmbed = document.getElementById('btn-check-embed-all');
    if (btnCheckEmbed) {
      btnCheckEmbed.addEventListener('click', () => this.checkAllEmbeds());
    }

    // 참가영상 목록 복사/공유 버튼
    const btnCopy = document.getElementById('btn-copy-candidates');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => this.handleCopyCandidates());
    }

    // 참가영상 목록 붙여넣기 모달 열기
    const btnPaste = document.getElementById('btn-paste-candidates');
    if (btnPaste) {
      btnPaste.addEventListener('click', () => this.openPasteModal());
    }

    // 붙여넣기 모달 닫기
    const btnClosePaste = document.getElementById('btn-close-paste-modal');
    const btnCancelPaste = document.getElementById('btn-cancel-paste');
    const modalPaste = document.getElementById('modal-paste-candidates');

    if (btnClosePaste) {
      btnClosePaste.addEventListener('click', () => this.closePasteModal());
    }
    if (btnCancelPaste) {
      btnCancelPaste.addEventListener('click', () => this.closePasteModal());
    }
    if (modalPaste) {
      modalPaste.addEventListener('click', (e) => {
        if (e.target === modalPaste) this.closePasteModal();
      });
    }

    // 클립보드 빠른 읽기 버튼
    const btnQuickRead = document.getElementById('btn-read-clipboard-quick');
    if (btnQuickRead) {
      btnQuickRead.addEventListener('click', () => this.handleQuickReadClipboard());
    }

    // 붙여넣기 확정 버튼 (기존 목록 + 신규 추가)
    const btnConfirmPaste = document.getElementById('btn-confirm-paste');
    if (btnConfirmPaste) {
      btnConfirmPaste.addEventListener('click', () => this.handleConfirmPaste());
    }

    // 참가영상 목록 한번에 지우기 버튼
    const btnClearAll = document.getElementById('btn-clear-all-videos');
    if (btnClearAll) {
      btnClearAll.addEventListener('click', () => this.handleClearAllCandidates());
    }

    // 기본 16선 복구 버튼
    const btnReset = document.getElementById('btn-reset-default');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.handleResetDefault());
    }

    // 토너먼트 시작 버튼
    const btnStart = document.getElementById('btn-start-tournament');
    if (btnStart) {
      btnStart.addEventListener('click', () => this.startTournament());
    }

    // 세션 복원 배너 버튼들 (이어하기 / 새로 시작)
    const btnResume = document.getElementById('btn-resume-session');
    const btnDiscard = document.getElementById('btn-discard-session');
    if (btnResume) {
      btnResume.addEventListener('click', () => this.resumeTournamentSession());
    }
    if (btnDiscard) {
      btnDiscard.addEventListener('click', () => {
        if (confirm("이전에 진행 중이던 토너먼트 기록을 삭제하시겠습니까?")) {
          this.clearTournamentSession();
        }
      });
    }

    // 실시간 랭킹 모달 열기/닫기
    const btnRanking = document.getElementById('btn-show-live-ranking');
    const modalRanking = document.getElementById('modal-live-ranking');
    const btnCloseModal = document.getElementById('btn-close-modal');

    if (btnRanking && modalRanking) {
      btnRanking.addEventListener('click', () => {
        this.renderLiveRanking();
        modalRanking.classList.add('active');
      });
    }
    if (btnCloseModal && modalRanking) {
      btnCloseModal.addEventListener('click', () => {
        modalRanking.classList.remove('active');
      });
    }

    // 모달 내 성능 최적화 모드 토글 스위치
    const modalTogglePerf = document.getElementById('modal-toggle-perf-mode');
    if (modalTogglePerf) {
      modalTogglePerf.addEventListener('change', (e) => {
        this.setPerformanceMode(e.target.checked, true, true);
      });
    }

    // 화면 & 글씨 크기 설정 모달 열기/닫기
    const btnFontSettings = document.getElementById('btn-open-font-settings');
    const modalFontSettings = document.getElementById('modal-font-settings');
    const btnCloseFontModal = document.getElementById('btn-close-font-modal');
    const btnCloseFontConfirm = document.getElementById('btn-close-font-settings-confirm');
    const btnResetFont = document.getElementById('btn-reset-font-settings');

    if (btnFontSettings && modalFontSettings) {
      btnFontSettings.addEventListener('click', () => {
        this.syncFontSettingsUI();
        modalFontSettings.classList.add('active');
      });
    }

    const closeFontModal = () => {
      if (modalFontSettings) modalFontSettings.classList.remove('active');
    };

    if (btnCloseFontModal) btnCloseFontModal.addEventListener('click', closeFontModal);
    if (btnCloseFontConfirm) btnCloseFontConfirm.addEventListener('click', closeFontModal);
    if (modalFontSettings) {
      modalFontSettings.addEventListener('click', (e) => {
        if (e.target === modalFontSettings) closeFontModal();
      });
    }

    if (btnResetFont) {
      btnResetFont.addEventListener('click', () => this.resetFontSettings());
    }

    // 치지직 연동 모달 열기/닫기
    const btnHeaderChzzk = document.getElementById('btn-header-chzzk');
    const btnOpenChzzkSetup = document.getElementById('btn-open-chzzk-setup');
    const modalChzzk = document.getElementById('modal-chzzk-settings');
    const btnCloseChzzk = document.getElementById('btn-close-chzzk-modal');
    const btnCloseChzzkConfirm = document.getElementById('btn-close-chzzk-confirm');

    const openChzzkModal = () => {
      if (modalChzzk) {
        this.syncChzzkModalUI();
        modalChzzk.classList.add('active');
      }
    };
    const closeChzzkModal = () => {
      if (modalChzzk) modalChzzk.classList.remove('active');
    };

    if (btnHeaderChzzk) btnHeaderChzzk.addEventListener('click', openChzzkModal);
    if (btnOpenChzzkSetup) btnOpenChzzkSetup.addEventListener('click', openChzzkModal);
    if (btnCloseChzzk) btnCloseChzzk.addEventListener('click', closeChzzkModal);
    if (btnCloseChzzkConfirm) btnCloseChzzkConfirm.addEventListener('click', closeChzzkModal);
    if (modalChzzk) {
      modalChzzk.addEventListener('click', (e) => {
        if (e.target === modalChzzk) closeChzzkModal();
      });
    }

    // 치지직 연결 / 연결 끊기
    const btnConnectChzzk = document.getElementById('btn-chzzk-connect');
    const btnDisconnectChzzk = document.getElementById('btn-chzzk-disconnect');
    if (btnConnectChzzk) {
      btnConnectChzzk.addEventListener('click', () => this.handleChzzkConnect());
    }
    if (btnDisconnectChzzk) {
      btnDisconnectChzzk.addEventListener('click', () => this.handleChzzkDisconnect());
    }

    // 치지직 모의 투표 버튼들
    const btnSimA = document.getElementById('btn-chzzk-sim-a');
    const btnSimB = document.getElementById('btn-chzzk-sim-b');
    const btnSimReset = document.getElementById('btn-chzzk-sim-reset');
    if (btnSimA) btnSimA.addEventListener('click', () => this.chzzkChat?.simulateVote('A', 5));
    if (btnSimB) btnSimB.addEventListener('click', () => this.chzzkChat?.simulateVote('B', 5));
    if (btnSimReset) btnSimReset.addEventListener('click', () => this.chzzkChat?.resetPoll());

    // 치지직 투표 토글 및 다수결 반영 버튼
    const btnTogglePoll = document.getElementById('btn-chzzk-toggle-poll');
    const btnApplyMajority = document.getElementById('btn-chzzk-apply-majority');
    if (btnTogglePoll) {
      btnTogglePoll.addEventListener('click', () => this.handleChzzkTogglePoll());
    }
    if (btnApplyMajority) {
      btnApplyMajority.addEventListener('click', () => this.handleChzzkApplyMajority());
    }

    // 각 글씨 조절 슬라이더 실시간 바인딩 (Zero-Lag 60FPS)
    this.bindFontSlider('slider-scale-global', 'val-scale-global', 'scaleGlobal', '%');
    this.bindFontSlider('slider-battle-title', 'val-battle-title', 'battleTitle', 'px');
    this.bindFontSlider('slider-battle-channel', 'val-battle-channel', 'battleChannel', 'px');
    this.bindFontSlider('slider-battle-meta', 'val-battle-meta', 'battleMeta', 'px');
    this.bindFontSlider('slider-battle-btn', 'val-battle-btn', 'battleBtn', 'px');
    this.bindFontSlider('slider-bracket-title', 'val-bracket-title', 'bracketTitle', 'px');
    this.bindFontSlider('slider-ranking-title', 'val-ranking-title', 'rankingTitle', 'px');

    // 투표 직전 취소(Undo) 버튼
    const btnUndo = document.getElementById('btn-battle-undo');
    if (btnUndo) {
      btnUndo.addEventListener('click', () => {
        if (this.engine) this.engine.undoVote();
      });
    }

    // 키보드 단축키 (A / D, 좌 / 우 화살표, Z: 되돌리기)
    window.addEventListener('keydown', (e) => {
      if (this.currentView !== 'battle') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // 투표 취소 단축키: Z 또는 Ctrl+Z
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (this.engine) this.engine.undoVote();
        return;
      }

      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        const btnA = document.getElementById('btn-vote-a');
        if (btnA) btnA.click();
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        const btnB = document.getElementById('btn-vote-b');
        if (btnB) btnB.click();
      }
    });

    // 스킵(무승부) 버튼
    const btnSkip = document.getElementById('btn-battle-skip');
    if (btnSkip) {
      btnSkip.addEventListener('click', () => {
        if (this.engine) this.engine.skipMatch();
      });
    }

    // 동시 일시정지 버튼
    const btnTogglePlay = document.getElementById('btn-toggle-play-both');
    if (btnTogglePlay) {
      btnTogglePlay.addEventListener('click', () => {
        if (window.dualPlayer) window.dualPlayer.stopAll();
      });
    }

    // 즉시 4강 결승전 진출 버튼
    const btnJumpFinal = document.getElementById('btn-jump-to-final');
    if (btnJumpFinal) {
      btnJumpFinal.addEventListener('click', () => {
        if (confirm("현재 실시간 순위 상위 1~4위로 즉시 4강 결승 토너먼트를 시작하시겠습니까?")) {
          if (this.engine) this.engine.finishLadderPhase();
        }
      });
    }

    // 신규 영상 입력 엔터 키 지원
    const inputUrl = document.getElementById('input-yt-url');
    const inputTitle = document.getElementById('input-yt-title');
    const handleEnterAdd = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleAddVideo();
      }
    };
    if (inputUrl) inputUrl.addEventListener('keydown', handleEnterAdd);
    if (inputTitle) inputTitle.addEventListener('keydown', handleEnterAdd);

    // 모드 선택 카드 UI 동기화
    const modeCards = document.querySelectorAll('.mode-card');
    modeCards.forEach(card => {
      card.addEventListener('click', () => {
        modeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const radio = card.querySelector('input[name="match-mode"]');
        if (radio) radio.checked = true;
      });
    });

    // 처음부터 다시하기
    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        if (window.dualPlayer) window.dualPlayer.stopAll();
        this.switchView('setup');
      });
    }
  }

  // 유튜브 URL / ID 파싱 헬퍼
  parseYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  // 유튜브 oEmbed API를 이용해 원본 영상 제목 및 채널명 자동 추출
  async fetchYouTubeInfo(videoId) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          return {
            title: data.title,
            author_name: data.author_name || 'YouTube'
          };
        }
      }
    } catch (err) {
      // 백업 noembed 시도
      try {
        const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
        const res2 = await fetch(noembedUrl);
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2 && data2.title) {
            return {
              title: data2.title,
              author_name: data2.author_name || 'YouTube'
            };
          }
        }
      } catch (err2) {}
    }
    return null;
  }

  // 신규 영상 추가 (미입력 시 유튜브 원본 타이틀 자동 추출)
  async handleAddVideo() {
    const inputUrl = document.getElementById('input-yt-url');
    const inputTitle = document.getElementById('input-yt-title');
    const btnAdd = document.getElementById('btn-add-video');
    const ytId = this.parseYouTubeId(inputUrl ? inputUrl.value : '');

    if (!ytId) {
      alert("올바른 YouTube URL 또는 11자리 영상 ID를 입력해 주세요.");
      return;
    }

    let title = inputTitle ? inputTitle.value.trim() : '';
    let creator = "사용자 추가";

    // 영상 제목 미입력 시 YouTube 공식 oEmbed API로 원본 영상 제목 및 채널명 자동 추출
    if (!title) {
      let originalBtnHtml = '';
      if (btnAdd) {
        originalBtnHtml = btnAdd.innerHTML;
        btnAdd.disabled = true;
        btnAdd.innerHTML = `<span>⏳</span> 유튜브 원본 제목 가져오는 중...`;
      }

      try {
        const info = await this.fetchYouTubeInfo(ytId);
        if (info && info.title) {
          title = info.title;
          creator = info.author_name || 'YouTube';
        }
      } catch (e) {
        console.warn('유튜브 정보 조회 오류:', e);
      } finally {
        if (btnAdd) {
          btnAdd.disabled = false;
          btnAdd.innerHTML = originalBtnHtml;
        }
      }
    }

    if (!title) {
      title = `YouTube Video (${ytId})`;
    }

    const newVideo = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      youtubeId: ytId,
      title: title,
      creator: creator,
      startSec: 0,
      isCustom: true
    };

    // 가장 최근에 추가한 신규 영상이 참가 목록 최상단으로 오도록 unshift 사용
    this.candidates.unshift(newVideo);
    this.saveCandidatesToStorage();

    if (inputUrl) inputUrl.value = '';
    if (inputTitle) inputTitle.value = '';
    this.renderCandidateList();
  }

  // 참가영상 목록 텍스트 클립보드 복사 (공유용)
  handleCopyCandidates() {
    if (!this.candidates || this.candidates.length === 0) {
      alert("복사할 참가 영상이 없습니다. 영상을 먼저 추가해 주세요.");
      return;
    }

    const lines = [
      `🏆 [골든 토너먼트 참가 영상 목록] (총 ${this.candidates.length}곡)`,
      `─────────────────────────────────────────`
    ];

    this.candidates.forEach((cand, idx) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const ytUrl = `https://www.youtube.com/watch?v=${cand.youtubeId}`;
      lines.push(`${numStr}. ${cand.title} | ${ytUrl}`);
    });

    lines.push(`─────────────────────────────────────────`);
    lines.push(`✨ 위 내용을 복사한 뒤, 골든 토너먼트의 [목록 붙여넣기]를 누르면 동일한 참가 목록이 그대로 추가됩니다!`);

    const textToCopy = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`📋 참가 영상 목록(${this.candidates.length}곡)이 클립보드에 복사되었습니다!\n\n수정한 영상 제목과 유튜브 링크가 모두 포함되어 있습니다.\n다른 사람에게 공유하면 [목록 붙여넣기]로 동일한 목록을 즉시 생성/추가할 수 있습니다.`);
      }).catch(err => {
        this.fallbackCopyText(textToCopy);
      });
    } else {
      this.fallbackCopyText(textToCopy);
    }
  }

  fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      alert(`📋 참가 영상 목록이 클립보드에 복사되었습니다!\n\n수정한 영상 제목과 유튜브 링크가 모두 포함되어 있습니다.\n붙여넣기(Ctrl+V)하여 공유해 보세요.`);
    } catch (e) {
      prompt("아래 텍스트를 복사(Ctrl+C)하여 공유하세요:", text);
    }
    document.body.removeChild(textarea);
  }

  // 참가영상 목록 붙여넣기 모달 열기
  openPasteModal() {
    const modal = document.getElementById('modal-paste-candidates');
    const textarea = document.getElementById('paste-candidates-text');
    if (modal) {
      modal.classList.add('active');
    }
    if (textarea) {
      textarea.value = '';
      textarea.focus();
      // 가능한 경우 클립보드 자동 읽기 시도
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(text => {
          if (text && textarea && !textarea.value) {
            textarea.value = text;
          }
        }).catch(() => {});
      }
    }
  }

  // 참가영상 목록 붙여넣기 모달 닫기
  closePasteModal() {
    const modal = document.getElementById('modal-paste-candidates');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // [클립보드에서 자동 가져오기] 빠른 실행
  handleQuickReadClipboard() {
    const textarea = document.getElementById('paste-candidates-text');
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(text => {
        if (text) {
          if (textarea) {
            textarea.value = text;
            textarea.focus();
          }
        } else {
          alert("클립보드에 복사된 내용이 없습니다.");
        }
      }).catch(err => {
        alert("브라우저의 클립보드 읽기 권한이 허용되지 않았습니다.\n입력창을 클릭하신 후 Ctrl + V로 직접 붙여넣어 주세요.");
      });
    } else {
      alert("현재 브라우저에서는 클립보드 자동 읽기를 지원하지 않습니다.\n입력창을 클릭하신 후 키보드로 Ctrl + V를 눌러 붙여넣어 주세요.");
    }
  }

  // 공유 텍스트 지능형 파싱 (한 줄 포맷, 여러 줄 포맷, 단순 URL, JSON 모두 지원)
  parseCandidatesText(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const text = rawText.trim();
    if (!text) return [];

    const results = [];

    // 1. JSON 포맷 시도
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const jsonList = JSON.parse(text);
        if (Array.isArray(jsonList)) {
          jsonList.forEach((item, idx) => {
            const ytId = item.youtubeId || this.parseYouTubeId(item.url || item.link || '');
            if (ytId) {
              results.push({
                id: `custom_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
                title: (item.title || item.name || 'YouTube 영상').trim(),
                youtubeId: ytId,
                creator: item.creator || item.channel || '사용자 추가',
                startSec: Number(item.startSec) || 0,
                isCustom: true
              });
            }
          });
          if (results.length > 0) return results;
        }
      } catch (e) {}
    }

    // 2. 줄(Line) 단위 지능형 정규식 파싱
    const lines = text.split(/\r?\n/);
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // 구분선 및 헤더/푸터 안내 문구 스킵
      if (line.startsWith('🏆') || line.startsWith('───') || line.startsWith('===') || line.startsWith('✨') || line.startsWith('*')) {
        continue;
      }

      const match = line.match(ytRegex);
      if (match) {
        const ytId = match[1];
        let title = '';
        let creator = '공유 영상';

        // 같은 줄에서 URL을 제외한 나머지 텍스트 추출
        let remaining = line.replace(match[0], '').trim();

        // 파이프(|), 하이픈(-), 링크 이모지(🔗), 앞쪽 순번('01. ', '1) ') 등 불필요한 서식 정돈
        remaining = remaining.replace(/^🔗\s*/, '');
        remaining = remaining.replace(/^[|–—\-:\s]+|[|–—\-:\s]+$/g, '');
        remaining = remaining.replace(/^#?\d+[\.\)\s\-]+\s*/, '');
        remaining = remaining.replace(/^[|–—\-:\s]+|[|–—\-:\s]+$/g, '').trim();

        if (remaining.length > 0) {
          title = remaining;
        } else {
          // 같은 줄에 제목이 없다면 바로 윗줄 확인 (예: 윗줄에 '01. 영상 제목'이 배치된 포맷)
          if (i > 0) {
            let prevLine = lines[i - 1].trim();
            if (prevLine && !prevLine.match(ytRegex) && !prevLine.startsWith('───') && !prevLine.startsWith('🏆')) {
              prevLine = prevLine.replace(/^#?\d+[\.\)\s\-]+\s*/, '').trim();
              if (prevLine.length > 0) {
                title = prevLine;
              }
            }
          }
        }

        // 바로 아랫줄에 '👤 채널: XXX' 서식이 있다면 채널명 보존
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const channelMatch = nextLine.match(/(?:👤\s*채널\s*[:|]\s*)([^\n]+)/i);
          if (channelMatch) {
            creator = channelMatch[1].trim();
          }
        }

        if (!title) {
          title = `YouTube 영상 (${ytId})`;
        }

        results.push({
          id: `custom_${Date.now()}_${results.length}_${Math.random().toString(36).substring(2, 6)}`,
          title: title,
          youtubeId: ytId,
          creator: creator,
          startSec: 0,
          isCustom: true
        });
      }
    }

    return results;
  }

  // 목록 붙여넣기 확정: 원래 가지고 있는 목록 + 신규 붙여넣은 목록 추가
  handleConfirmPaste() {
    const textarea = document.getElementById('paste-candidates-text');
    if (!textarea) return;

    const rawText = textarea.value.trim();
    if (!rawText) {
      alert("붙여넣을 텍스트를 입력해 주세요.");
      textarea.focus();
      return;
    }

    const parsedList = this.parseCandidatesText(rawText);
    if (parsedList.length === 0) {
      alert("입력한 텍스트에서 올바른 YouTube 영상 링크를 찾을 수 없습니다.\n\nYouTube 영상 URL(예: https://www.youtube.com/watch?v=...)이 포함된 목록 텍스트를 붙여넣어 주세요.");
      return;
    }

    // 사용자 핵심 요구사항: 원래 가지고 있는 목록 + 신규로 붙여넣은 목록 추가
    this.candidates = [...this.candidates, ...parsedList];
    this.saveCandidatesToStorage();
    this.renderCandidateList();

    this.closePasteModal();
    alert(`🎉 총 ${parsedList.length}개의 영상이 기존 참가 목록에 성공적으로 추가되었습니다!\n\n(현재 참가 목록: 총 ${this.candidates.length}곡)`);
  }

  // 참가영상 목록 한번에 지우기 (웹 저장소 실시간 동기화)
  handleClearAllCandidates() {
    if (this.candidates.length === 0) {
      alert("참가 영상 목록이 이미 비어 있습니다.");
      return;
    }
    if (confirm("등록된 모든 참가 영상을 목록에서 비우시겠습니까?\n(언제든 [기본 16선 복구] 버튼으로 복원할 수 있습니다)")) {
      this.candidates = [];
      this.saveCandidatesToStorage();
      this.renderCandidateList();
    }
  }

  // 기본 16선 복구 (웹 저장소 초기화 후 기본값 저장)
  handleResetDefault() {
    if (confirm("웹 저장소에 저장된 목록을 초기화하고 기본 16선으로 복구하시겠습니까?")) {
      try {
        localStorage.removeItem(STORAGE_CANDIDATES_KEY);
      } catch (e) {
        console.error('웹 저장소 초기화 실패:', e);
      }
      if (window.DEFAULT_VIDEOS && Array.isArray(window.DEFAULT_VIDEOS)) {
        this.candidates = window.DEFAULT_VIDEOS.map(v => ({ ...v }));
      } else {
        this.candidates = [];
      }
      this.saveCandidatesToStorage();
      this.renderCandidateList();
    }
  }

  // 영상 개별 제거 (웹 저장소 실시간 동기화)
  removeCandidate(index) {
    this.candidates.splice(index, 1);
    this.saveCandidatesToStorage();
    this.renderCandidateList();
  }

  // 영상 제목 직접 수정 모드
  startEditingTitle(idx, titleRowEl) {
    const cand = this.candidates[idx];
    if (!cand || !titleRowEl) return;

    const currentTitle = cand.title;
    titleRowEl.innerHTML = `
      <input type="text" class="input-edit-title" value="${currentTitle.replace(/"/g, '&quot;')}" placeholder="새 영상 제목 입력...">
    `;

    const input = titleRowEl.querySelector('.input-edit-title');
    if (!input) return;

    input.focus();
    input.select();

    let isSaved = false;
    const saveTitle = () => {
      if (isSaved) return;
      isSaved = true;
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== currentTitle) {
        cand.title = newTitle;
        this.saveCandidatesToStorage();
      }
      this.renderCandidateList();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveTitle();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        isSaved = true;
        this.renderCandidateList();
      }
    });

    input.addEventListener('blur', () => {
      saveTitle();
    });
  }

  renderCandidateList() {
    const listEl = document.getElementById('candidate-list');
    const countEl = document.getElementById('candidate-count');
    if (!listEl) return;

    if (countEl) {
      countEl.textContent = this.candidates.length;
    }
    listEl.innerHTML = '';

    // 후보가 0개일 때 빈 상태 안내
    if (this.candidates.length === 0) {
      listEl.innerHTML = `
        <div class="empty-candidate-state">
          <span class="empty-icon">📭</span>
          <p class="empty-title">참가 영상 목록이 비어 있습니다</p>
          <p class="empty-desc">신규 영상을 추가하거나, 우측 하단의 [기본 16선 복구] 버튼을 눌러 기본 영상을 불러오세요.</p>
        </div>
      `;
      return;
    }

    this.candidates.forEach((cand, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'candidate-item';
      const thumbUrl = `https://img.youtube.com/vi/${cand.youtubeId}/mqdefault.jpg`;
      const numStr = String(idx + 1).padStart(2, '0');

      let embedBadgeHtml = '';
      const checkState = this.embedCheckStatus[cand.youtubeId];
      if (checkState === 'ok') {
        embedBadgeHtml = `<span class="badge-embed-status badge-embed-ok" title="유튜브 외부 재생 가능">✅ 정상</span>`;
      } else if (checkState === 'warn') {
        embedBadgeHtml = `<span class="badge-embed-status badge-embed-warn" title="유튜브 외부 재생이 차단되었거나 삭제된 영상일 수 있습니다">⚠️ 임베드 주의</span>`;
      } else if (checkState === 'checking') {
        embedBadgeHtml = `<span class="badge-embed-status badge-embed-checking">⏳ 점검 중</span>`;
      }

      itemEl.innerHTML = `
        <div class="item-left-area">
          <span class="item-index-badge">${numStr}</span>
          <div class="item-thumb-wrapper">
            <img class="item-thumb" src="${thumbUrl}" alt="썸네일" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'80\\' height=\\'45\\' fill=\\'%23222\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'">
            <div class="thumb-overlay-play">▶</div>
          </div>
          <div class="item-info">
            <div class="item-title-row" data-idx="${idx}">
              <span class="item-title" title="클릭하여 제목 수정" data-idx="${idx}">${cand.title}</span>
              ${embedBadgeHtml}
              <button class="btn-edit-title" title="제목 직접 수정" data-idx="${idx}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
            <span class="item-channel">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
              ${cand.creator || 'YouTube 영상'}
            </span>
          </div>
        </div>
        <button class="btn-remove-item" title="제거" data-idx="${idx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      // 제목 클릭 또는 수정 버튼 클릭 시 인라인 편집 모드 전환
      const titleRow = itemEl.querySelector('.item-title-row');
      const titleEl = itemEl.querySelector('.item-title');
      const editBtn = itemEl.querySelector('.btn-edit-title');

      if (titleEl && titleRow) {
        titleEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startEditingTitle(idx, titleRow);
        });
      }
      if (editBtn && titleRow) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startEditingTitle(idx, titleRow);
        });
      }

      itemEl.querySelector('.btn-remove-item').addEventListener('click', () => {
        this.removeCandidate(idx);
      });

      listEl.appendChild(itemEl);
    });

    // 참가자 수 변동에 따른 코스 매치 수 자동 갱신
    this.updateCourseMatchCounts();
  }

  // 화면 전환 (Zero-Lag 60FPS: display + opacity 트랜지션)
  switchView(viewName) {
    this.currentView = viewName;
    const viewport = document.getElementById('view-viewport');
    if (viewport) {
      viewport.setAttribute('data-view', viewName);
    }
    document.body.setAttribute('data-current-view', viewName);

    const views = ['setup', 'battle', 'final', 'result'];
    views.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) {
        if (v === viewName) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  startTournament() {
    if (this.candidates.length < 4) {
      alert("토너먼트를 시작하려면 최소 4개 이상의 영상이 필요합니다.");
      return;
    }

    // 선택된 코스 모드 확인 ('quick' | 'standard' | 'deep')
    const selectedMode = document.querySelector('input[name="match-mode"]:checked')?.value || 'standard';

    // 엔진 초기화 후 대결 화면으로 전환
    if (window.TournamentEngine) {
      this.engine = new window.TournamentEngine(this.candidates, this, selectedMode);
      this.engine.start();
    } else {
      this.switchView('battle');
    }
  }

  renderLiveRanking() {
    const listEl = document.getElementById('live-ranking-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const sorted = this.engine 
      ? this.engine.getSortedRankings() 
      : [...this.candidates].map((c, i) => ({ ...c, elo: 1200, wins: 0, losses: 0, rank: i + 1 }));

    sorted.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'candidate-item ranking-item';
      row.innerHTML = `
        <div class="item-thumb-title">
          <span style="font-weight: 800; width: 24px; color: ${idx < 3 ? 'var(--gold-primary)' : 'var(--text-dim)'};">${idx + 1}</span>
          <img class="item-thumb" src="https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg" style="width:36px;height:36px;">
          <div class="item-info">
            <span class="item-title">${item.title}</span>
            <span class="item-channel">${item.wins || 0}승 ${item.losses || 0}패 &bull; ELO: ${Math.round(item.elo || 1200)}</span>
          </div>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  // ================= 화면 & 글씨 크기 설정 매니저 (치지직/방송 최적화) =================
  initFontSettings() {
    this.loadFontSettings();
    this.applyFontSettings();
  }

  loadFontSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_FONT_SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          this.fontSettings = Object.assign({}, DEFAULT_FONT_SETTINGS, parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('폰트 설정 로드 실패, 기본값으로 초기화:', e);
    }
    this.fontSettings = { ...DEFAULT_FONT_SETTINGS };
  }

  applyFontSettings() {
    const s = this.fontSettings;
    const root = document.documentElement;

    // CSS Custom Properties 즉시 주입 (GPU 하드웨어 가속, 60fps 무지연)
    root.style.setProperty('--font-scale-global', (s.scaleGlobal / 100).toString());
    root.style.setProperty('--fs-battle-title', `${s.battleTitle}px`);
    root.style.setProperty('--fs-battle-channel', `${s.battleChannel}px`);
    root.style.setProperty('--fs-battle-meta', `${s.battleMeta}px`);
    root.style.setProperty('--fs-battle-btn', `${s.battleBtn}px`);
    root.style.setProperty('--fs-bracket-title', `${s.bracketTitle}px`);
    root.style.setProperty('--fs-ranking-title', `${s.rankingTitle}px`);

    // 배틀 메타 정보 폰트 크기가 16px 이상이면 2줄 모드 + 불꽃 특수 엠블럼 연출 모드 활성화
    const streakEl = document.getElementById('streak-indicator');
    if (streakEl) {
      streakEl.classList.toggle('multiline', s.battleMeta >= 16);
    }

    this.syncFontSettingsUI();
  }

  saveFontSettings() {
    try {
      localStorage.setItem(STORAGE_FONT_SETTINGS_KEY, JSON.stringify(this.fontSettings));
    } catch (e) {
      console.error('폰트 설정 로컬스토리지 저장 실패:', e);
    }
  }

  resetFontSettings() {
    this.fontSettings = { ...DEFAULT_FONT_SETTINGS };
    this.applyFontSettings();
    this.saveFontSettings();
  }

  syncFontSettingsUI() {
    const mapping = [
      { slider: 'slider-scale-global', val: 'val-scale-global', key: 'scaleGlobal', unit: '%' },
      { slider: 'slider-battle-title', val: 'val-battle-title', key: 'battleTitle', unit: 'px' },
      { slider: 'slider-battle-channel', val: 'val-battle-channel', key: 'battleChannel', unit: 'px' },
      { slider: 'slider-battle-meta', val: 'val-battle-meta', key: 'battleMeta', unit: 'px' },
      { slider: 'slider-battle-btn', val: 'val-battle-btn', key: 'battleBtn', unit: 'px' },
      { slider: 'slider-bracket-title', val: 'val-bracket-title', key: 'bracketTitle', unit: 'px' },
      { slider: 'slider-ranking-title', val: 'val-ranking-title', key: 'rankingTitle', unit: 'px' }
    ];

    mapping.forEach(m => {
      const sliderEl = document.getElementById(m.slider);
      const valEl = document.getElementById(m.val);
      const currentVal = this.fontSettings[m.key];
      if (sliderEl && currentVal !== undefined) {
        sliderEl.value = currentVal;
      }
      if (valEl && currentVal !== undefined) {
        valEl.textContent = `${currentVal}${m.unit}`;
      }
    });

    // 모달 내 성능 최적화 토글 체크박스 상태 동기화
    const modalToggle = document.getElementById('modal-toggle-perf-mode');
    if (modalToggle) {
      modalToggle.checked = this.isLowPerfMode;
    }
  }

  bindFontSlider(sliderId, valId, key, unit) {
    const sliderEl = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    if (!sliderEl) return;

    sliderEl.addEventListener('input', (e) => {
      const num = Number(e.target.value);
      this.fontSettings[key] = num;
      if (valEl) {
        valEl.textContent = `${num}${unit}`;
      }
      this.applyFontSettings();
      this.saveFontSettings();
    });
  }

  // ================= 저사양 / 하드웨어 가속 최적화 모드 컨트롤러 =================

  // 브라우저 하드웨어 가속 (WebGL / GPU 래스터라이저) 동작 여부 진단
  detectHardwareAcceleration() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        return { isHardwareAccelerated: false, reason: 'WebGL 미지원 또는 브라우저 가속 비활성화' };
      }

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        const vendor = (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '').toLowerCase();

        // 크롬 SwiftShader, Mesa llvmpipe, 윈도우 기본 래스터라이저 등 소프트웨어 렌더링 키워드
        const softwareKeywords = [
          'swiftshader',
          'llvmpipe',
          'software',
          'software rasterizer',
          'basic render',
          'microsoft basic',
          'gdi generic',
          'swrast'
        ];

        const isSoftware = softwareKeywords.some(keyword => renderer.includes(keyword) || vendor.includes(keyword));
        if (isSoftware) {
          return { isHardwareAccelerated: false, reason: `소프트웨어 래스터라이저 감지 (${renderer})` };
        }
      }

      return { isHardwareAccelerated: true, reason: '하드웨어 가속 정상 작동' };
    } catch (e) {
      return { isHardwareAccelerated: false, reason: '가속 진단 오류 (소프트웨어 fallback)' };
    }
  }

  // 초기 로드 시 성능 모드 상태 복원 또는 자동 감지 적용
  initPerformanceMode() {
    let savedMode = null;
    try {
      savedMode = localStorage.getItem(STORAGE_PERF_MODE_KEY);
    } catch (e) {
      console.warn('성능 모드 설정 로드 실패:', e);
    }

    if (savedMode === 'low') {
      // 사용자가 이전에 저사양 모드를 켜둔 경우
      this.setPerformanceMode(true, false, false);
    } else if (savedMode === 'high') {
      // 사용자가 이전에 명시적으로 일반 모드를 유지한 경우
      this.setPerformanceMode(false, false, false);
    } else {
      // 최초 방문: 하드웨어 가속 자동 진단 실행
      const hwCheck = this.detectHardwareAcceleration();
      if (!hwCheck.isHardwareAccelerated) {
        // 하드웨어 가속 꺼짐 감지 -> 성능 모드 자동 활성화 및 안내 토스트 표시
        this.setPerformanceMode(true, true, false);
        setTimeout(() => {
          this.showPerfToast(
            '⚡ 그래픽 가속 비활성화 감지',
            '원활한 재생을 위해 [성능 최적화 모드]를 켰습니다. (화면 설정에서 언제든 변경 가능)',
            'warning',
            6000
          );
        }, 700);
      } else {
        // 일반 환경 -> 기본 고화질 모드
        this.setPerformanceMode(false, false, false);
      }
    }
  }

  // 성능 최적화 모드 켜기/끄기 및 UI/스토리지 일괄 동기화
  setPerformanceMode(enable, saveToStorage = true, showToast = true, toastTitle = null, toastMsg = null) {
    this.isLowPerfMode = Boolean(enable);

    // 1. body 클래스 토글 (CSS 룰셋 즉시 발동)
    document.body.classList.toggle('low-perf-mode', this.isLowPerfMode);

    // 2. 헤더 토글 버튼 UI 업데이트
    const btnToggle = document.getElementById('btn-toggle-perf-mode');
    const textToggle = document.getElementById('btn-toggle-perf-text');
    if (btnToggle) {
      btnToggle.classList.toggle('active', this.isLowPerfMode);
      btnToggle.title = this.isLowPerfMode 
        ? '성능 최적화 모드 작동 중 (클릭 시 원본 화려한 모드로 복원)' 
        : '저사양 환경을 위한 성능 최적화 모드 (클릭 시 켜기)';
    }
    if (textToggle) {
      textToggle.textContent = this.isLowPerfMode ? '성능 모드 ON' : '성능 모드';
    }

    // 3. 모달 내 토글 스위치 동기화
    const modalToggle = document.getElementById('modal-toggle-perf-mode');
    if (modalToggle) {
      modalToggle.checked = this.isLowPerfMode;
    }

    // 4. 로컬스토리지 저장
    if (saveToStorage) {
      try {
        localStorage.setItem(STORAGE_PERF_MODE_KEY, this.isLowPerfMode ? 'low' : 'high');
      } catch (e) {
        console.error('성능 모드 로컬스토리지 저장 오류:', e);
      }
    }

    // 5. 알림 토스트 표시
    if (showToast) {
      if (this.isLowPerfMode) {
        this.showPerfToast(
          toastTitle || '⚡ 성능 최적화 모드 켜짐',
          toastMsg || '블러, 무거운 그림자, 애니메이션을 단순화하여 렉 없이 부드럽게 동작합니다.',
          'info'
        );
      } else {
        this.showPerfToast(
          toastTitle || '✨ 화려한 그래픽 모드 켜짐',
          toastMsg || '글래스모피즘 블러 및 네온 글로우 효과가 복원되었습니다.',
          'info'
        );
      }
    }
  }

  // 플로팅 토스트 알림창 띄우기
  showPerfToast(title, message, type = 'info', duration = 4500) {
    const container = document.getElementById('perf-toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `perf-toast toast-${type}`;
    const icon = type === 'warning' ? '⚠️' : '⚡';

    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" title="닫기">&times;</button>
    `;

    const btnClose = toast.querySelector('.toast-close');
    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    if (btnClose) {
      btnClose.addEventListener('click', dismiss);
    }

    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  }

  // ================= 1. 후보자 수 비례 코스 자동 보정 인터락 =================
  updateCourseMatchCounts() {
    const N = this.candidates.length;
    const quickMatches = Math.ceil((N * 2) / 2); // N
    const standardMatches = Math.max(Math.ceil(N * 1.75), quickMatches + 6);
    const deepMatches = Math.max(Math.ceil(N * 2.8), quickMatches + 12);

    const elQuick = document.getElementById('course-match-quick');
    const elStandard = document.getElementById('course-match-standard');
    const elDeep = document.getElementById('course-match-deep');

    if (elQuick) elQuick.textContent = quickMatches;
    if (elStandard) elStandard.textContent = standardMatches;
    if (elDeep) elDeep.textContent = deepMatches;

    // 시작 버튼 활성화/비활성화 인터락 (최소 4개 이상)
    const btnStart = document.getElementById('btn-start-tournament');
    if (btnStart) {
      if (N < 4) {
        btnStart.disabled = true;
        btnStart.style.opacity = '0.5';
        btnStart.title = '토너먼트를 시작하려면 최소 4개 이상의 영상이 필요합니다.';
      } else {
        btnStart.disabled = false;
        btnStart.style.opacity = '1';
        btnStart.title = '토너먼트 시작하기';
      }
    }
  }

  // ================= 2. 등록 영상 임베드 재생 가능 여부 사전 점검 =================
  async checkAllEmbeds() {
    if (!this.candidates || this.candidates.length === 0) {
      alert("점검할 참가 영상이 없습니다. 영상을 먼저 등록해 주세요.");
      return;
    }

    const btn = document.getElementById('btn-check-embed-all');
    let originalHtml = '';
    if (btn) {
      originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> 점검 중...`;
    }

    this.showPerfToast('🎬 임베드 점검 시작', `등록된 ${this.candidates.length}개 영상의 유튜브 외부 재생 허용 여부를 점검합니다...`, 'info', 3000);

    let okCount = 0;
    let warnCount = 0;

    for (const cand of this.candidates) {
      this.embedCheckStatus[cand.youtubeId] = 'checking';
    }
    this.renderCandidateList();

    // 순차적 oEmbed 점검
    for (const cand of this.candidates) {
      try {
        const info = await this.fetchYouTubeInfo(cand.youtubeId);
        if (info && info.title) {
          this.embedCheckStatus[cand.youtubeId] = 'ok';
          okCount++;
        } else {
          this.embedCheckStatus[cand.youtubeId] = 'warn';
          warnCount++;
        }
      } catch (e) {
        this.embedCheckStatus[cand.youtubeId] = 'warn';
        warnCount++;
      }
    }

    this.renderCandidateList();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }

    if (warnCount > 0) {
      this.showPerfToast(
        '⚠️ 재생 주의 영상 발견',
        `정상 재생: ${okCount}곡 / 임베드 주의: ${warnCount}곡. [임베드 주의] 뱃지가 붙은 영상을 확인해 주세요.`,
        'warning',
        7000
      );
    } else {
      this.showPerfToast(
        '✅ 모든 영상 정상 재생 가능',
        `총 ${okCount}개의 영상 모두 외부 사이트 임베드 재생이 원활합니다!`,
        'info',
        4500
      );
    }
  }

  // ================= 3. 치지직(CHZZK) 실시간 채팅 투표 컨트롤러 =================
  initChzzk() {
    if (window.ChzzkChatManager) {
      this.chzzkChat = new window.ChzzkChatManager(this);

      // 투표 변경 시 UI 실시간 동기화 콜백
      this.chzzkChat.onVoteUpdate = (stats) => {
        this.updateChzzkPollUI(stats);
      };

      // 연결 상태 변경 시 헤더 및 모달 뱃지 동기화 콜백
      this.chzzkChat.onStatusChange = (statusInfo) => {
        this.updateChzzkStatusUI(statusInfo);
      };

      // 저장된 채널이 있으면 모달 입력창에 프리셋 주입
      this.syncChzzkModalUI();
    }
  }

  syncChzzkModalUI() {
    if (!this.chzzkChat) return;
    const inputEl = document.getElementById('input-chzzk-channel');
    if (inputEl && this.chzzkChat.channelId) {
      inputEl.value = this.chzzkChat.channelId;
    }
  }

  async handleChzzkConnect() {
    const inputEl = document.getElementById('input-chzzk-channel');
    const channelInput = inputEl ? inputEl.value.trim() : '';
    if (!channelInput) {
      alert("치지직 채널 ID 또는 방송 URL을 입력해 주세요.");
      return;
    }

    const btnConnect = document.getElementById('btn-chzzk-connect');
    let originalHtml = '';
    if (btnConnect) {
      originalHtml = btnConnect.innerHTML;
      btnConnect.disabled = true;
      btnConnect.innerHTML = `<span>⏳</span> 접속 중...`;
    }

    try {
      await this.chzzkChat.connect(channelInput);
      this.showPerfToast('📺 치지직 채팅 연동 완료', '치지직 실시간 채팅 서버에 성공적으로 연결되었습니다!', 'info', 4000);
      const modal = document.getElementById('modal-chzzk-settings');
      if (modal) modal.classList.remove('active');
    } catch (err) {
      alert(`치지직 채팅 연결에 실패했습니다.\n사유: ${err.message}\n\n* 채널 주소가 올바른지, 현재 생방송 중인지 확인해 주세요.`);
    } finally {
      if (btnConnect) {
        btnConnect.disabled = false;
        btnConnect.innerHTML = originalHtml;
      }
    }
  }

  handleChzzkDisconnect() {
    if (this.chzzkChat) {
      this.chzzkChat.disconnect();
      this.showPerfToast('📺 치지직 연결 해제', '치지직 채팅 연결이 종료되었습니다.', 'info', 2500);
    }
  }

  handleChzzkTogglePoll() {
    if (!this.chzzkChat) return;
    if (this.chzzkChat.isPolling) {
      this.chzzkChat.stopPoll();
    } else {
      this.chzzkChat.startPoll();
    }
  }

  handleChzzkApplyMajority() {
    if (!this.chzzkChat) return;
    const stats = this.chzzkChat.getPollStats();
    if (!stats.leading) {
      alert("현재 동점이거나 투표된 표가 없어 다수결을 판정할 수 없습니다.");
      return;
    }

    const winnerSide = stats.leading; // 'A' | 'B'
    const btnVote = document.getElementById(`btn-vote-${winnerSide.toLowerCase()}`);
    if (btnVote) {
      this.showPerfToast(
        '👑 시청자 다수결 반영',
        `시청자 투표 결과 [${winnerSide}] 후보 (${winnerSide === 'A' ? stats.percentA : stats.percentB}%)가 선택되었습니다!`,
        'info',
        2500
      );
      btnVote.click();
    }
  }

  updateChzzkPollUI(stats) {
    const votesAEl = document.getElementById('chzzk-votes-a');
    const votesBEl = document.getElementById('chzzk-votes-b');
    const pctAEl = document.getElementById('chzzk-pct-a');
    const pctBEl = document.getElementById('chzzk-pct-b');
    const barA = document.getElementById('chzzk-bar-a');
    const barB = document.getElementById('chzzk-bar-b');
    const btnToggle = document.getElementById('btn-chzzk-toggle-poll');
    const btnToggleText = document.getElementById('chzzk-poll-btn-text');
    const btnToggleIcon = document.getElementById('chzzk-poll-btn-icon');
    const btnMajority = document.getElementById('btn-chzzk-apply-majority');
    const statusText = document.getElementById('chzzk-poll-status-text');

    if (votesAEl) votesAEl.textContent = stats.votesA;
    if (votesBEl) votesBEl.textContent = stats.votesB;
    if (pctAEl) pctAEl.textContent = `${stats.percentA}%`;
    if (pctBEl) pctBEl.textContent = `${stats.percentB}%`;
    if (barA) barA.style.width = `${stats.percentA}%`;
    if (barB) barB.style.width = `${stats.percentB}%`;

    if (btnToggle) {
      btnToggle.classList.toggle('active', stats.isPolling);
    }
    if (btnToggleText) {
      btnToggleText.textContent = stats.isPolling ? '투표 마감' : '투표 시작';
    }
    if (btnToggleIcon) {
      btnToggleIcon.textContent = stats.isPolling ? '⏹' : '▶';
    }
    if (statusText) {
      if (stats.isPolling) {
        statusText.textContent = `🔴 투표 진행 중 (총 ${stats.total}표)`;
        statusText.style.color = '#00ffa3';
      } else {
        statusText.textContent = stats.total > 0 ? `⏹ 투표 마감 (총 ${stats.total}표)` : '투표 대기';
        statusText.style.color = 'var(--text-dim)';
      }
    }

    if (btnMajority) {
      btnMajority.disabled = !stats.leading;
    }
  }

  updateChzzkStatusUI(statusInfo) {
    const headerDot = document.getElementById('header-chzzk-dot');
    const liveDot = document.getElementById('chzzk-live-dot');
    const statusBadge = document.getElementById('btn-chzzk-status-badge');
    const modalBadge = document.getElementById('chzzk-conn-status-badge');
    const modalMsg = document.getElementById('chzzk-conn-status-msg');
    const btnDisconnect = document.getElementById('btn-chzzk-disconnect');

    const isConn = statusInfo.status === 'connected';
    const isConnIng = statusInfo.status === 'connecting';

    if (headerDot) {
      headerDot.className = `chzzk-dot ${statusInfo.status}`;
    }
    if (liveDot) {
      liveDot.style.background = isConn ? '#00ffa3' : '#64748b';
      liveDot.style.animation = isConn ? 'chzzkPulse 1.5s infinite' : 'none';
    }
    if (statusBadge) {
      statusBadge.textContent = isConn ? '연결됨' : (isConnIng ? '접속 중..' : '대기 중');
      statusBadge.className = `badge-chzzk-status ${isConn ? 'connected' : ''}`;
    }
    if (modalBadge) {
      modalBadge.className = isConn ? 'badge-status-connected' : (isConnIng ? 'badge-status-connecting' : 'badge-status-disconnected');
      modalBadge.textContent = isConn ? '연결됨 ✅' : (isConnIng ? '접속 중 ⏳' : '연결 안 됨 ❌');
    }
    if (modalMsg) {
      modalMsg.textContent = statusInfo.text;
    }
    if (btnDisconnect) {
      btnDisconnect.style.display = isConn ? 'block' : 'none';
    }
  }

  // ================= 4. 진행 세션 자동 저장 및 이어하기 (Save & Resume) =================
  saveTournamentSession() {
    if (!this.engine) return;

    try {
      const sessionData = {
        timestamp: Date.now(),
        currentView: this.currentView,
        engineState: this.engine ? this.engine.exportState() : null,
        bracketState: this.bracket ? this.bracket.exportState() : null,
        candidates: this.candidates
      };
      localStorage.setItem(STORAGE_SAVED_SESSION_KEY, JSON.stringify(sessionData));
    } catch (e) {
      console.error('세션 저장 실패:', e);
    }
  }

  checkSavedSession() {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_SESSION_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (!data || !data.engineState) return;

      const banner = document.getElementById('session-resume-banner');
      const bannerTitle = document.getElementById('resume-banner-title');
      const bannerDesc = document.getElementById('resume-banner-desc');

      if (banner && bannerTitle && bannerDesc) {
        const eng = data.engineState;
        const percent = Math.round((eng.currentMatchIndex / eng.totalLadderMatches) * 100) || 0;
        const viewText = data.currentView === 'final' ? '골든 파이널 4강전' : '스위스-Elo 래더 리그';
        
        bannerTitle.textContent = `진행 중이던 ${viewText} 세션이 있습니다!`;
        bannerDesc.textContent = `진행도: ${eng.currentMatchIndex} / ${eng.totalLadderMatches} 매치 (${percent}%) &bull; 언제든 바로 이어서 진행할 수 있습니다.`;
        banner.style.display = 'flex';
      }
    } catch (e) {
      console.warn('저장 세션 파싱 오류:', e);
    }
  }

  resumeTournamentSession() {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_SESSION_KEY);
      if (!raw) {
        alert("복원할 이전 토너먼트 기록이 없습니다.");
        return;
      }

      const data = JSON.parse(raw);
      if (!data || !data.engineState) return;

      // 후보자 복원
      if (Array.isArray(data.candidates)) {
        this.candidates = data.candidates;
      }

      // 엔진 초기화 및 상태 주입
      this.engine = new window.TournamentEngine(this.candidates, this, data.engineState.mode || 'standard');
      this.engine.importState(data.engineState);

      // 브래킷 상태 복원
      if (data.bracketState && window.GoldenBracketManager) {
        const sorted = this.engine.getSortedRankings();
        this.bracket = new window.GoldenBracketManager(data.bracketState.finalFour || sorted.slice(0, 4), sorted, this);
        this.bracket.importState(data.bracketState);
      }

      // 화면 라우팅 복원
      if (data.currentView === 'final' && this.bracket) {
        this.bracket.renderBracketView();
        this.switchView('final');
      } else {
        this.engine.renderBattleMatch();
        this.switchView('battle');
      }

      // 배너 숨김
      const banner = document.getElementById('session-resume-banner');
      if (banner) banner.style.display = 'none';

      this.showPerfToast('⏩ 토너먼트 이어하기 완료', '이전 진행 매치와 ELO 점수가 성공적으로 복원되었습니다!', 'info', 3000);
    } catch (e) {
      console.error('세션 복원 실패:', e);
      alert("세션 복원 중 오류가 발생했습니다. 새로 시작해 주세요.");
    }
  }

  clearTournamentSession() {
    try {
      localStorage.removeItem(STORAGE_SAVED_SESSION_KEY);
    } catch (e) {}

    const banner = document.getElementById('session-resume-banner');
    if (banner) banner.style.display = 'none';
  }
}

// 앱 시작
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
  window.app.init();
});
