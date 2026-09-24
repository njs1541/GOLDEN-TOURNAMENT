/**
 * 메인 애플리케이션 진입점 & 화면 전환 컨트롤러
 */

const STORAGE_CANDIDATES_KEY = 'GOLDEN_TOURNAMENT_CANDIDATES_LIST';
const STORAGE_FONT_SETTINGS_KEY = 'GOLDEN_TOURNAMENT_FONT_SETTINGS';
const STORAGE_PERF_MODE_KEY = 'GOLDEN_TOURNAMENT_PERF_MODE';
const STORAGE_SAVED_SESSION_KEY = 'GOLDEN_TOURNAMENT_SAVED_SESSION';
const STORAGE_THEME_KEY = 'GOLDEN_TOURNAMENT_THEME';
const STORAGE_INTRO_DISMISSED_KEY = 'GOLDEN_TOURNAMENT_INTRO_DISMISSED';
const STORAGE_CURTAIN_KEY = 'GOLDEN_TOURNAMENT_CANDIDATE_CURTAIN';
const DEFAULT_THEME = 'golden-obsidian';

// 5개 디자인 테마 한글 레이블
const THEME_LABELS = {
  'golden-obsidian': '골든 옵시디언 (기본)',
  'chzzk-theme': '치지직 테마',
  'modern-theme': '모던 테마',
  'monochrome-theme': '흑백 테마',
  'white-theme': '화이트 테마'
};

// 치지직/유튜브 방송 송출 가독성 최적화 권장 기본값
const DEFAULT_FONT_SETTINGS = {
  scaleGlobal: 115,    // 115%
  battleTitle: 22,    // 22px
  battleChannel: 16,  // 16px
  battleMeta: 16,     // 16px
  battleBtn: 18,      // 18px
  bracketTitle: 18,   // 18px
  rankingTitle: 16    // 16px
};

class AppController {
  constructor() {
    this.candidates = [];
    this.currentTheme = DEFAULT_THEME;
    this.fontSettings = { ...DEFAULT_FONT_SETTINGS };
    this.isLowPerfMode = false;
    this.isCandidateCurtainActive = true; // 참가영상 목록 임시 가림막(스포일러 방지) 기본 활성화
    this.currentView = 'setup'; // 'setup' | 'battle' | 'final' | 'result'
    this.currentIntroStep = 0; // 온보딩 가이드 현재 슬라이드 인덱스
    this.engine = null; // engine.js에서 초기화
    this.bracket = null; // bracket.js에서 초기화
    this.tierMaker = null; // tiermaker.js에서 초기화
    this.chzzkChat = null; // chzzkChat.js에서 초기화
    this.embedCheckStatus = {}; // videoId -> 'ok' | 'warn' | 'checking'
    this.previewPlayerInstance = null; // 미리보기 모달 YT.Player
    this.isCheckingEmbeds = false;
  }

  init() {
    // 0. 디자인 테마 복원 및 즉시 적용
    this.initTheme();

    // 0-1. 화면 및 글씨 크기 설정 복원 및 즉시 적용
    this.initFontSettings();

    // 0-2. 저사양 / 하드웨어 가속 환경 자동 진단 및 성능 모드 복원
    this.initPerformanceMode();

    // 0-3. 치지직(CHZZK) 채팅 매니저 초기화
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
    this.initCandidateCurtain();
    this.switchView('setup');

    // 6. 진행 중이던 저장 세션 확인 및 복원 배너 표시
    this.checkSavedSession();

    // 7. 시작 화면 온보딩 가이드 팝업 자동 진단 및 초기화
    this.initIntroGuide();

    // 8. 상단 헤더 메뉴 팝업 및 리그 진행 단계 트래커 초기화
    this.initHeaderMoreMenu();
    this.initLeagueStageTracker();
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

    // 참가영상 목록 가림막 토글 버튼 (접었다 폈다)
    const btnToggleCurtain = document.getElementById('btn-toggle-curtain');
    if (btnToggleCurtain) {
      btnToggleCurtain.addEventListener('click', () => this.toggleCandidateCurtain());
    }

    // 가림막 내부의 원클릭 해제(접기) 버튼
    const btnCurtainUnfold = document.getElementById('btn-curtain-unfold');
    if (btnCurtainUnfold) {
      btnCurtainUnfold.addEventListener('click', () => this.toggleCandidateCurtain(false));
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

    // 영상 빠른 미리보기 모달 닫기
    const btnClosePreview = document.getElementById('btn-close-preview-modal');
    const modalPreview = document.getElementById('modal-video-preview');
    if (btnClosePreview) {
      btnClosePreview.addEventListener('click', () => this.closePreviewModal());
    }
    if (modalPreview) {
      modalPreview.addEventListener('click', (e) => {
        if (e.target === modalPreview) this.closePreviewModal();
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
        this.syncThemeUI();
        this.syncFontSettingsUI();
        modalFontSettings.classList.add('active');
      });
    }

    // 테마 선택 카드 클릭 이벤트 위임
    const themeCardGrid = document.getElementById('theme-card-grid');
    if (themeCardGrid) {
      themeCardGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.theme-card');
        if (card && card.dataset.themeId) {
          this.applyTheme(card.dataset.themeId, true);
        }
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

    // 치지직 투표 적용 범위(전체 vs 4강/결승 전용) 선택 라디오 카드 이벤트
    const scopeCards = document.querySelectorAll('.scope-option-card');
    scopeCards.forEach(card => {
      card.addEventListener('click', () => {
        scopeCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const radio = card.querySelector('input[name="chzzk-poll-scope"]');
        if (radio) {
          radio.checked = true;
          if (this.chzzkChat) {
            this.chzzkChat.setPollScope(radio.value);
            const isFinal = this.currentView === 'final' || Boolean(document.getElementById('match-phase-badge')?.classList.contains('pill-final'));
            this.applyPollScopeVisibility(isFinal);
          }
        }
      });
    });

    // 치지직 투표 토글 및 다수결 반영 버튼
    const btnTogglePoll = document.getElementById('btn-chzzk-toggle-poll');
    const btnApplyMajority = document.getElementById('btn-chzzk-apply-majority');
    if (btnTogglePoll) {
      btnTogglePoll.addEventListener('click', () => this.handleChzzkTogglePoll());
    }
    if (btnApplyMajority) {
      btnApplyMajority.addEventListener('click', () => this.handleChzzkApplyMajority());
    }

    // 치지직 커스텀 CORS 프록시 저장 버튼
    const btnSaveProxy = document.getElementById('btn-save-chzzk-proxy');
    const inputProxy = document.getElementById('input-chzzk-proxy');
    const msgProxyStatus = document.getElementById('msg-chzzk-proxy-status');
    if (btnSaveProxy && inputProxy) {
      btnSaveProxy.addEventListener('click', () => {
        const val = inputProxy.value.trim();
        if (this.chzzkChat) {
          this.chzzkChat.saveCustomProxy(val);
          if (msgProxyStatus) {
            msgProxyStatus.style.color = '#00ffa3';
            msgProxyStatus.textContent = val ? '✓ 프록시 설정이 저장되었습니다.' : '✓ 프록시 설정이 초기화되었습니다.';
            setTimeout(() => {
              msgProxyStatus.style.color = '';
              msgProxyStatus.textContent = '미설정 시 공용 프록시 및 로컬 서버 자동 탐색이 적용됩니다.';
            }, 3000);
          }
          this.showPerfToast('⚙️ 프록시 설정 저장', val ? 'CORS 프록시 주소가 저장되었습니다.' : '프록시가 기본값으로 초기화되었습니다.', 'info', 2500);
        }
      });
    }

    // start.bat 다운로드 안내 토스트 바인딩
    const btnDownloadBat = document.getElementById('btn-download-start-bat');
    if (btnDownloadBat) {
      btnDownloadBat.addEventListener('click', () => {
        this.showPerfToast('📥 start.bat 다운로드 시작', '다운로드된 start.bat 파일을 실행해 두시면 치지직이 즉시 연동됩니다.', 'info', 4000);
      });
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
        if (this.bracket && this.bracket.currentFinalStep !== 'done') {
          this.showPerfToast('⚠️ 결승 토너먼트 진행 중', '파이널 4강 및 결승전에서는 래더 투표 취소가 불가능합니다.', 'warning', 2500);
          return;
        }
        if (this.engine) this.engine.undoVote();
      });
    }

    // 키보드 단축키 (A / D, 좌 / 우 화살표, 1 / 2, Z: 되돌리기)
    window.addEventListener('keydown', (e) => {
      if (this.currentView !== 'battle') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (document.querySelector('.modal-backdrop.active, .modal-overlay.active')) return;

      const isInBracket = this.bracket && this.bracket.currentFinalStep !== 'done';

      // 투표 취소 단축키: Z 또는 Ctrl+Z
      if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (isInBracket) {
          this.showPerfToast('⚠️ 결승 토너먼트 진행 중', '파이널 4강 및 결승전에서는 래더 투표 취소가 불가능합니다.', 'warning', 2500);
          return;
        }
        if (this.engine) this.engine.undoVote();
        return;
      }

      // 1번 / A / 좌측 화살표 -> A 투표
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft' || e.key === '1') {
        const btnA = document.getElementById('btn-vote-a');
        if (btnA) btnA.click();
      } 
      // 2번 / D / 우측 화살표 -> B 투표
      else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight' || e.key === '2') {
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
    const inputCreator = document.getElementById('input-yt-creator');
    const handleEnterAdd = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleAddVideo();
      }
    };
    if (inputUrl) inputUrl.addEventListener('keydown', handleEnterAdd);
    if (inputTitle) inputTitle.addEventListener('keydown', handleEnterAdd);
    if (inputCreator) inputCreator.addEventListener('keydown', handleEnterAdd);

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

    // 온보딩 가이드 팝업 이벤트 바인딩
    this.bindIntroGuideEvents();

    // 저작권 정책 & 소유권 & 문의 모달 및 이메일 복사 바인딩
    this.bindCopyrightEvents();
  }

  // 저작권 정책 & 소유권 & 문의 모달 및 이메일 복사 이벤트 바인딩
  bindCopyrightEvents() {
    const modalCopyright = document.getElementById('modal-copyright');
    const btnOpenHeader = document.getElementById('btn-open-copyright-modal');
    const btnOpenFooter = document.getElementById('btn-footer-open-copyright');
    const btnCloseModal = document.getElementById('btn-close-copyright-modal');
    const btnConfirmModal = document.getElementById('btn-close-copyright-confirm');

    const openModal = () => {
      if (modalCopyright) modalCopyright.classList.add('active');
    };
    const closeModal = () => {
      if (modalCopyright) modalCopyright.classList.remove('active');
    };

    if (btnOpenHeader) btnOpenHeader.addEventListener('click', openModal);
    if (btnOpenFooter) btnOpenFooter.addEventListener('click', openModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnConfirmModal) btnConfirmModal.addEventListener('click', closeModal);

    if (modalCopyright) {
      modalCopyright.addEventListener('click', (e) => {
        if (e.target === modalCopyright) closeModal();
      });
    }

    // Escape 키 입력 시 모달 닫기
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalCopyright && modalCopyright.classList.contains('active')) {
        closeModal();
      }
    });

    // 이메일 클립보드 복사 버튼 (푸터 & 모달 공통)
    const emailToCopy = 'njs1541@naver.com';

    const handleCopyEmail = async (btnEl, textElId, originalText) => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(emailToCopy);
        } else {
          // 구형 브라우저 fallback
          const tempInput = document.createElement('input');
          tempInput.value = emailToCopy;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }

        this.showPerfToast('📋 이메일 복사 완료', `문의 이메일(${emailToCopy})이 클립보드에 복사되었습니다!`, 'info', 3000);

        if (btnEl) {
          btnEl.classList.add('copied');
          const textEl = textElId ? document.getElementById(textElId) : null;
          if (textEl) {
            textEl.textContent = '✓ 복사됨!';
          } else {
            btnEl.textContent = '✓ 복사됨!';
          }

          setTimeout(() => {
            btnEl.classList.remove('copied');
            if (textEl) {
              textEl.textContent = originalText;
            } else {
              btnEl.textContent = originalText;
            }
          }, 2000);
        }
      } catch (err) {
        console.error('클립보드 복사 실패:', err);
        prompt('아래 이메일 주소를 직접 복사(Ctrl+C)하세요:', emailToCopy);
      }
    };

    const btnCopyFooter = document.getElementById('btn-copy-footer-email');
    if (btnCopyFooter) {
      btnCopyFooter.addEventListener('click', () => {
        handleCopyEmail(btnCopyFooter, 'text-copy-footer-email', '이메일 복사');
      });
    }

    const btnCopyModal = document.getElementById('btn-copy-modal-email');
    if (btnCopyModal) {
      btnCopyModal.addEventListener('click', () => {
        handleCopyEmail(btnCopyModal, null, '📋 이메일 복사');
      });
    }
  }

  // 온보딩 가이드 모달 초기화 (첫 방문 시 자동 노출)
  initIntroGuide() {
    try {
      const isDismissed = localStorage.getItem(STORAGE_INTRO_DISMISSED_KEY);
      if (!isDismissed) {
        // 첫 방문 시 사용자가 화면 구성을 인지할 수 있도록 약간의 딜레이 후 부드럽게 노출
        setTimeout(() => {
          // 이미 배틀 중이거나 다른 모달이 뜬 상태가 아닐 때만 노출
          if (this.currentView === 'setup' && !document.querySelector('.modal-backdrop.active')) {
            this.openIntroGuideModal(0);
          }
        }, 500);
      }
    } catch (e) {
      console.warn('온보딩 가이드 설정 로드 실패:', e);
    }
  }

  // 온보딩 가이드 이벤트 바인딩
  bindIntroGuideEvents() {
    const btnOpenGuide = document.getElementById('btn-open-intro-guide');
    const btnCloseModal = document.getElementById('btn-close-intro-modal');
    const modal = document.getElementById('modal-intro-guide');
    const btnPrev = document.getElementById('btn-intro-prev');
    const btnNext = document.getElementById('btn-intro-next');
    const chkDontShow = document.getElementById('chk-intro-dont-show');
    const dots = document.querySelectorAll('.intro-dot');

    if (btnOpenGuide) {
      btnOpenGuide.addEventListener('click', () => this.openIntroGuideModal(0));
    }

    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => this.closeIntroGuideModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeIntroGuideModal();
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        this.showIntroStep(this.currentIntroStep - 1);
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (this.currentIntroStep >= 4) {
          this.closeIntroGuideModal();
        } else {
          this.showIntroStep(this.currentIntroStep + 1);
        }
      });
    }

    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        this.showIntroStep(index);
      });
    });

    if (chkDontShow) {
      chkDontShow.addEventListener('change', (e) => {
        try {
          if (e.target.checked) {
            localStorage.setItem(STORAGE_INTRO_DISMISSED_KEY, 'true');
          } else {
            localStorage.removeItem(STORAGE_INTRO_DISMISSED_KEY);
          }
        } catch (err) {
          console.warn('localStorage 저장 실패:', err);
        }
      });
    }

    // 키보드 네비게이션: 가이드 모달 활성화 시 좌/우 화살표, ESC, Enter 처리
    window.addEventListener('keydown', (e) => {
      if (!modal || !modal.classList.contains('active')) return;

      if (e.key === 'Escape') {
        this.closeIntroGuideModal();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.showIntroStep(this.currentIntroStep - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.currentIntroStep >= 4) {
          this.closeIntroGuideModal();
        } else {
          this.showIntroStep(this.currentIntroStep + 1);
        }
      } else if (e.key === 'Enter') {
        if (this.currentIntroStep >= 4) {
          e.preventDefault();
          this.closeIntroGuideModal();
        } else {
          e.preventDefault();
          this.showIntroStep(this.currentIntroStep + 1);
        }
      }
    });
  }

  // 온보딩 가이드 모달 열기
  openIntroGuideModal(step = 0) {
    const modal = document.getElementById('modal-intro-guide');
    if (!modal) return;
    this.showIntroStep(step);
    modal.classList.add('active');

    // 체크박스 상태 동기화
    const chkDontShow = document.getElementById('chk-intro-dont-show');
    if (chkDontShow) {
      try {
        chkDontShow.checked = localStorage.getItem(STORAGE_INTRO_DISMISSED_KEY) === 'true';
      } catch (e) {}
    }
  }

  // 온보딩 가이드 모달 닫기
  closeIntroGuideModal() {
    const modal = document.getElementById('modal-intro-guide');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  // 온보딩 가이드 특정 스텝(0~4) 표시 및 UI 갱신
  showIntroStep(stepIndex) {
    const totalSteps = 5;
    const targetStep = Math.max(0, Math.min(stepIndex, totalSteps - 1));
    this.currentIntroStep = targetStep;

    const slides = document.querySelectorAll('.intro-slide');
    const dots = document.querySelectorAll('.intro-dot');
    const btnPrev = document.getElementById('btn-intro-prev');
    const btnNext = document.getElementById('btn-intro-next');

    slides.forEach((slide, idx) => {
      if (idx === targetStep) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    });

    dots.forEach((dot, idx) => {
      if (idx === targetStep) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });

    if (btnPrev) {
      btnPrev.style.visibility = targetStep === 0 ? 'hidden' : 'visible';
    }

    if (btnNext) {
      if (targetStep === totalSteps - 1) {
        btnNext.innerHTML = '<span>토너먼트 시작하기 🚀</span>';
      } else {
        btnNext.innerHTML = '<span>다음 ▶</span>';
      }
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
    // 1순위: CORS 허용 엔드포인트 (noembed)
    try {
      const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
      const res = await fetch(noembedUrl);
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          return {
            title: data.title,
            author_name: data.author_name || 'YouTube'
          };
        }
      }
    } catch (err) {}

    // 2순위: 유튜브 공식 oEmbed (CORS 프록시 또는 브라우저 환경에 따라 시도)
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res2 = await fetch(oembedUrl);
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

    return null;
  }

  // 신규 영상 추가 (미입력 시 유튜브 원본 타이틀 및 채널명 자동 추출)
  async handleAddVideo() {
    const inputUrl = document.getElementById('input-yt-url');
    const inputTitle = document.getElementById('input-yt-title');
    const inputCreator = document.getElementById('input-yt-creator');
    const btnAdd = document.getElementById('btn-add-video');
    const ytId = this.parseYouTubeId(inputUrl ? inputUrl.value : '');

    if (!ytId) {
      alert("올바른 YouTube URL 또는 11자리 영상 ID를 입력해 주세요.");
      return;
    }

    let title = inputTitle ? inputTitle.value.trim() : '';
    let creator = inputCreator ? inputCreator.value.trim() : '';

    // 영상 제목이나 가수명 중 하나라도 비어있는 경우 YouTube 공식 oEmbed API로 원본 정보 자동 조회
    if (!title || !creator) {
      let originalBtnHtml = '';
      if (btnAdd) {
        originalBtnHtml = btnAdd.innerHTML;
        btnAdd.disabled = true;
        btnAdd.innerHTML = `<span>⏳</span> 유튜브 정보 조회 중...`;
      }

      try {
        const info = await this.fetchYouTubeInfo(ytId);
        if (info) {
          if (!title && info.title) {
            title = info.title;
          }
          if (!creator && info.author_name) {
            creator = info.author_name;
          }
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
    if (!creator) {
      creator = "사용자 추가";
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
    if (inputCreator) inputCreator.value = '';
    this.renderCandidateList();
  }

  // 참가영상 목록 텍스트 클립보드 복사 (공유용)
  handleCopyCandidates() {
    if (!this.candidates || this.candidates.length === 0) {
      alert("복사할 참가 영상이 없습니다. 영상을 먼저 추가해 주세요.");
      return;
    }

    const lines = [
      `🏆 [픽리그 참가 영상 목록] (총 ${this.candidates.length}곡)`,
      `─────────────────────────────────────────`
    ];

    this.candidates.forEach((cand, idx) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const ytUrl = `https://www.youtube.com/watch?v=${cand.youtubeId}`;
      const creatorName = (cand.creator || '').trim() || '미지정';
      lines.push(`${numStr}. ${cand.title} | ${ytUrl}`);
      lines.push(`   👤 가수: ${creatorName}`);
    });

    lines.push(`─────────────────────────────────────────`);
    lines.push(`✨ 위 내용을 복사한 뒤, 픽리그의 [목록 붙여넣기]를 누르면 동일한 참가 목록이 그대로 추가됩니다!`);

    const textToCopy = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert(`📋 참가 영상 목록(${this.candidates.length}곡)이 클립보드에 복사되었습니다!\n\n영상 제목과 가수 이름, 유튜브 링크가 모두 포함되어 있습니다.\n다른 사람에게 공유하면 [목록 붙여넣기]로 가수 정보까지 온전히 복원됩니다.`);
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
      alert(`📋 참가 영상 목록이 클립보드에 복사되었습니다!\n\n영상 제목과 가수 이름, 유튜브 링크가 모두 포함되어 있습니다.\n붙여넣기(Ctrl+V)하여 공유해 보세요.`);
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
                creator: item.creator || item.channel || item.artist || '사용자 추가',
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

        // 바로 아랫줄에 '👤 가수: XXX' 또는 '👤 채널: XXX' 등 서식이 있다면 가수/채널명 보존
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const creatorMatch = nextLine.match(/(?:👤\s*(?:가수|채널|아티스트|부른\s*사람|작곡가|보컬)\s*[:|]\s*)([^\n]+)/i);
          if (creatorMatch) {
            creator = creatorMatch[1].trim();
          }
        }

        // 아랫줄에 없고 URL 뒷부분에 파이프로 가수명이 붙은 경우 (예: '제목 | URL | 가수')
        if (creator === '공유 영상') {
          const parts = line.split(match[0]);
          if (parts.length > 1) {
            let afterUrl = parts[1].replace(/^[|–—\-:\s]+|[|–—\-:\s]+$/g, '').trim();
            if (afterUrl.length > 0 && !afterUrl.match(ytRegex)) {
              creator = afterUrl;
              if (title && title.endsWith(afterUrl)) {
                title = title.substring(0, title.length - afterUrl.length).replace(/[|–—\-:\s]+$/, '').trim();
              }
            }
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

  // 영상 가수/부른 사람 직접 수정 모드
  startEditingCreator(idx, channelRowEl) {
    const cand = this.candidates[idx];
    if (!cand || !channelRowEl) return;

    const currentCreator = cand.creator || '';
    channelRowEl.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.6; flex-shrink:0;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
      <input type="text" class="input-edit-creator" value="${currentCreator.replace(/"/g, '&quot;')}" placeholder="가수 / 부른 사람 입력...">
    `;

    const input = channelRowEl.querySelector('.input-edit-creator');
    if (!input) return;

    input.focus();
    input.select();

    let isSaved = false;
    const saveCreator = () => {
      if (isSaved) return;
      isSaved = true;
      const newCreator = input.value.trim();
      if (newCreator && newCreator !== currentCreator) {
        cand.creator = newCreator;
        this.saveCandidatesToStorage();
      }
      this.renderCandidateList();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveCreator();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        isSaved = true;
        this.renderCandidateList();
      }
    });

    input.addEventListener('blur', () => {
      saveCreator();
    });
  }

  // ================= 참가 영상 목록 임시 가림막 (스포일러 방지) =================

  // 참가 영상 목록 가림막 상태 복원 (처음 접속 시 기본적으로 펼쳐진 상태 true)
  initCandidateCurtain() {
    try {
      const stored = localStorage.getItem(STORAGE_CURTAIN_KEY);
      // 저장된 설정이 없으면(최초 접속) 기본적으로 펼쳐진 상태로 둠
      this.isCandidateCurtainActive = stored === null ? true : (stored === 'true');
    } catch (e) {
      this.isCandidateCurtainActive = true;
    }
    this.applyCandidateCurtain(this.isCandidateCurtainActive, false);
  }

  // 참가 영상 목록 가림막 펴기/접기 토글 (forceState가 주어지면 해당 상태로 설정)
  toggleCandidateCurtain(forceState = null) {
    const nextState = forceState !== null ? Boolean(forceState) : !this.isCandidateCurtainActive;
    this.isCandidateCurtainActive = nextState;
    try {
      localStorage.setItem(STORAGE_CURTAIN_KEY, String(this.isCandidateCurtainActive));
    } catch (e) {
      // 로컬 스토리지 예외 무시
    }
    this.applyCandidateCurtain(this.isCandidateCurtainActive, true);
  }

  // 참가 영상 목록 가림막 UI 상태 반영 (저사양 환경 최적화: 가벼운 opacity/display 제어)
  applyCandidateCurtain(isActive, showToast = false) {
    const wrapperEl = document.getElementById('candidate-list-wrapper');
    const curtainEl = document.getElementById('candidate-curtain');
    const btnToggle = document.getElementById('btn-toggle-curtain');
    const iconFold = document.getElementById('icon-curtain-fold');
    const iconUnfold = document.getElementById('icon-curtain-unfold');
    const textToggle = document.getElementById('text-curtain-toggle');

    if (isActive) {
      // 가림막 펼침 (목록 가림 상태)
      if (wrapperEl) {
        wrapperEl.classList.add('is-curtain-active');
      }
      if (curtainEl) {
        curtainEl.style.display = 'flex';
        requestAnimationFrame(() => {
          curtainEl.classList.add('active');
          curtainEl.setAttribute('aria-hidden', 'false');
        });
      }
      if (btnToggle) {
        btnToggle.classList.add('is-curtain-active');
        btnToggle.setAttribute('title', '가림막을 접고 참가 영상 목록을 표시합니다');
      }
      if (iconFold) iconFold.style.display = 'none';
      if (iconUnfold) iconUnfold.style.display = 'inline-block';
      if (textToggle) textToggle.textContent = '가림막 접기';

      if (showToast) {
        this.showPerfToast('🙈 가림막 적용', '참가 영상 목록을 임시로 가렸습니다 (스포일러 방지).', 'info', 2500);
      }
    } else {
      // 가림막 접힘 (목록 표시 상태)
      if (wrapperEl) {
        wrapperEl.classList.remove('is-curtain-active');
      }
      if (curtainEl) {
        curtainEl.classList.remove('active');
        curtainEl.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
          if (!this.isCandidateCurtainActive) {
            curtainEl.style.display = 'none';
          }
        }, 160);
      }
      if (btnToggle) {
        btnToggle.classList.remove('is-curtain-active');
        btnToggle.setAttribute('title', '가림막을 펴서 참가 영상 목록을 숨깁니다 (스포일러 방지)');
      }
      if (iconFold) iconFold.style.display = 'inline-block';
      if (iconUnfold) iconUnfold.style.display = 'none';
      if (textToggle) textToggle.textContent = '가림막 펴기';

      if (showToast) {
        this.showPerfToast('👁️ 가림막 해제', '참가 영상 목록을 다시 표시합니다.', 'info', 2500);
      }
    }
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
      itemEl.setAttribute('data-youtube-id', cand.youtubeId);
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
          <div class="item-thumb-wrapper" title="클릭하여 영상 미리보기 및 재생 테스트">
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
            <div class="item-channel-row" data-idx="${idx}">
              <span class="item-channel" title="클릭하여 가수/부른 사람 수정" data-idx="${idx}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
                ${cand.creator || 'YouTube 영상'}
              </span>
              <button class="btn-edit-creator" title="가수/부른 사람 수정" data-idx="${idx}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
          </div>
        </div>
        <button class="btn-remove-item" title="제거" data-idx="${idx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      // 썸네일 클릭 시 빠른 영상 미리보기 모달 오픈
      const thumbWrapper = itemEl.querySelector('.item-thumb-wrapper');
      if (thumbWrapper) {
        thumbWrapper.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openPreviewModal(cand);
        });
      }

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

      // 가수/부른 사람 클릭 또는 수정 버튼 클릭 시 인라인 편집 모드 전환
      const channelRow = itemEl.querySelector('.item-channel-row');
      const channelEl = itemEl.querySelector('.item-channel');
      const editCreatorBtn = itemEl.querySelector('.btn-edit-creator');

      if (channelEl && channelRow) {
        channelEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startEditingCreator(idx, channelRow);
        });
      }
      if (editCreatorBtn && channelRow) {
        editCreatorBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startEditingCreator(idx, channelRow);
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

    // 팝업 메뉴 닫기
    const popover = document.getElementById('header-menu-popover');
    if (popover) popover.style.display = 'none';

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

    // 화면 전환 시 진행 단계 트래커 상태 동기화
    if (viewName === 'setup') {
      this.updateLeagueStageTracker('setup');
    } else if (viewName === 'result') {
      this.updateLeagueStageTracker('result');
    } else if (viewName === 'final') {
      if (this.bracket) {
        this.updateLeagueStageTracker(this.bracket.currentFinalStep || 'semi1');
      } else {
        this.updateLeagueStageTracker('semi1');
      }
    } else if (viewName === 'battle') {
      if (this.bracket && this.bracket.currentFinalStep !== 'done') {
        this.updateLeagueStageTracker(this.bracket.currentFinalStep);
      } else if (this.engine && this.engine.currentMatch) {
        const isPlacement = this.engine.currentMatch.phase.includes('배치고사') || this.engine.currentMatch.phase.includes('스위스');
        this.updateLeagueStageTracker(isPlacement ? 'placement' : 'ladder');
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 상단 헤더 통합 팝업 메뉴 초기화
  initHeaderMoreMenu() {
    const btnMore = document.getElementById('btn-header-more-menu');
    const popover = document.getElementById('header-menu-popover');
    if (!btnMore || !popover) return;

    const togglePopover = (forceState) => {
      const isVisible = popover.style.display !== 'none';
      const nextState = forceState !== undefined ? forceState : !isVisible;
      popover.style.display = nextState ? 'block' : 'none';
      btnMore.setAttribute('aria-expanded', String(nextState));
      if (nextState) {
        popover.classList.add('popover-animate-in');
      }
    };

    btnMore.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover();
    });

    // 팝업 내부 아이템 클릭 연동
    const itemFont = document.getElementById('pop-item-font-settings');
    const itemGuide = document.getElementById('pop-item-intro-guide');
    const itemCopyright = document.getElementById('pop-item-copyright');
    const itemManual = document.getElementById('pop-item-manual');

    if (itemFont) {
      itemFont.addEventListener('click', () => {
        togglePopover(false);
        const originalBtn = document.getElementById('btn-open-font-settings');
        if (originalBtn) originalBtn.click();
      });
    }

    if (itemGuide) {
      itemGuide.addEventListener('click', () => {
        togglePopover(false);
        const originalBtn = document.getElementById('btn-open-intro-guide');
        if (originalBtn) originalBtn.click();
      });
    }

    if (itemCopyright) {
      itemCopyright.addEventListener('click', () => {
        togglePopover(false);
        const originalBtn = document.getElementById('btn-open-copyright-modal');
        if (originalBtn) originalBtn.click();
      });
    }

    if (itemManual) {
      itemManual.addEventListener('click', () => {
        togglePopover(false);
      });
    }

    // 바깥 영역 클릭 시 닫기
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && !btnMore.contains(e.target)) {
        togglePopover(false);
      }
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popover.style.display !== 'none') {
        togglePopover(false);
      }
    });
  }

  // 리그 5단계 진행도 트래커 초기화 및 단계 갱신
  initLeagueStageTracker() {
    window.updateLeagueStageTracker = (stage) => this.updateLeagueStageTracker(stage);
    this.updateLeagueStageTracker(this.currentView === 'setup' ? 'setup' : 'placement');
  }

  updateLeagueStageTracker(stage) {
    const stepMap = {
      placement: document.getElementById('stage-step-placement'),
      ladder: document.getElementById('stage-step-ladder'),
      semi1: document.getElementById('stage-step-semi1'),
      semi2: document.getElementById('stage-step-semi2'),
      final: document.getElementById('stage-step-final'),
    };

    const stageOrder = ['placement', 'ladder', 'semi1', 'semi2', 'final'];
    const currentIndex = stageOrder.indexOf(stage);

    stageOrder.forEach((sKey, idx) => {
      const stepEl = stepMap[sKey];
      if (!stepEl) return;

      stepEl.classList.remove('is-active', 'is-completed', 'is-waiting');

      if (stage === 'result') {
        // 모든 경기 종료 후 최종 결과
        stepEl.classList.add('is-completed');
      } else if (currentIndex === -1) {
        // 셋업 화면 등
        stepEl.classList.add('is-waiting');
      } else if (idx < currentIndex) {
        // 이전 단계는 완료
        stepEl.classList.add('is-completed');
      } else if (idx === currentIndex) {
        // 현재 진행 중인 단계는 불빛 점등!
        stepEl.classList.add('is-active');
      } else {
        // 다음 단계는 대기
        stepEl.classList.add('is-waiting');
      }
    });
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

      let rankColor = 'var(--text-dim)';
      if (idx === 0) rankColor = 'var(--gold-primary)';
      else if (idx === 1) rankColor = '#94a3b8';
      else if (idx === 2) rankColor = '#d97706';

      const safeTitle = (item.title || '제목 없음').replace(/"/g, '&quot;');
      const wins = item.wins || 0;
      const losses = item.losses || 0;
      const elo = Math.round(item.elo || 1200);

      row.innerHTML = `
        <div class="item-thumb-title">
          <span class="rank-badge" style="color: ${rankColor};">${idx + 1}</span>
          <img class="ranking-thumb" src="https://img.youtube.com/vi/${item.youtubeId}/mqdefault.jpg" alt="${safeTitle}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2236%22 fill=%22%23222%22%3E%3Crect width=%22100%25%22 height=%22100%25%22/%3E%3C/svg%3E';">
          <div class="item-info">
            <span class="item-title" title="${safeTitle}">${safeTitle}</span>
            <div class="item-channel">
              <span class="ranking-record-badge">${wins}승 ${losses}패</span>
              <span class="ranking-elo-badge">${elo} RP</span>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(row);
    });
  }

  // ================= 디자인 테마 시스템 매니저 (5종 테마) =================
  initTheme() {
    this.loadTheme();
    this.applyTheme(this.currentTheme, false);
  }

  loadTheme() {
    try {
      const stored = localStorage.getItem(STORAGE_THEME_KEY);
      if (stored && THEME_LABELS[stored]) {
        this.currentTheme = stored;
        return;
      }
    } catch (e) {
      console.warn('테마 설정 로드 실패, 기본 테마로 초기화:', e);
    }
    this.currentTheme = DEFAULT_THEME;
  }

  applyTheme(themeId, save = true) {
    if (!THEME_LABELS[themeId]) {
      themeId = DEFAULT_THEME;
    }
    this.currentTheme = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    this.syncThemeUI();
    if (save) {
      this.saveTheme();
    }
  }

  saveTheme() {
    try {
      localStorage.setItem(STORAGE_THEME_KEY, this.currentTheme);
    } catch (e) {
      console.error('테마 설정 로컬스토리지 저장 실패:', e);
    }
  }

  resetTheme() {
    this.applyTheme(DEFAULT_THEME, true);
  }

  syncThemeUI() {
    const currentNameEl = document.getElementById('current-theme-name');
    if (currentNameEl) {
      currentNameEl.textContent = THEME_LABELS[this.currentTheme] || '골든 옵시디언';
    }

    const cards = document.querySelectorAll('.theme-card');
    cards.forEach(card => {
      const isSelected = card.dataset.themeId === this.currentTheme;
      card.classList.toggle('active', isSelected);
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
    this.resetTheme();
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

  // 단일 아이템 뱃지 실시간 부분 갱신 (Zero-Lag 60FPS: 전체 리스트 재렌더링 방지)
  updateSingleEmbedBadge(youtubeId, status, customTitle = '') {
    this.embedCheckStatus[youtubeId] = status;
    const itemEl = document.querySelector(`.candidate-item[data-youtube-id="${youtubeId}"]`);
    if (!itemEl) return;

    const titleRow = itemEl.querySelector('.item-title-row');
    if (!titleRow) return;

    let badgeEl = titleRow.querySelector('.badge-embed-status');
    if (!badgeEl) {
      badgeEl = document.createElement('span');
      badgeEl.className = 'badge-embed-status';
      const editBtn = titleRow.querySelector('.btn-edit-title');
      if (editBtn) {
        titleRow.insertBefore(badgeEl, editBtn);
      } else {
        titleRow.appendChild(badgeEl);
      }
    }

    badgeEl.className = 'badge-embed-status';
    if (status === 'ok') {
      badgeEl.classList.add('badge-embed-ok');
      badgeEl.innerHTML = '✅ 정상';
      badgeEl.title = customTitle || '유튜브 외부 재생 가능';
    } else if (status === 'warn') {
      badgeEl.classList.add('badge-embed-warn');
      badgeEl.innerHTML = '⚠️ 임베드 주의';
      badgeEl.title = customTitle || '외부 재생 차단(오류 150/101) 또는 비공개/삭제 영상일 수 있습니다';
    } else if (status === 'checking') {
      badgeEl.classList.add('badge-embed-checking');
      badgeEl.innerHTML = '⏳ 점검 중';
      badgeEl.title = '임베드 재생 가능 여부를 점검하는 중입니다...';
    }
  }

  // YouTube IFrame API 준비 보장 헬퍼
  async ensureYouTubeApiReady() {
    if (window.YT && window.YT.Player) {
      return true;
    }
    if (window.dualPlayer && typeof window.dualPlayer.init === 'function') {
      await window.dualPlayer.init();
    } else {
      await new Promise((resolve) => {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if ((window.YT && window.YT.Player) || attempts > 50) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }
    return !!(window.YT && window.YT.Player);
  }

  // 유튜브 썸네일 이미지 크기 유효성 검사 (보조 빠른 사전 필터)
  checkThumbnailValidity(videoId) {
    return new Promise((resolve) => {
      const img = new Image();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        resolve(true); // 타임아웃 시 보수적으로 통과
      }, 2000);

      img.onload = () => {
        if (timedOut) return;
        clearTimeout(timer);
        if (img.naturalWidth === 120 && img.naturalHeight === 90) {
          resolve(false); // 삭제 또는 미존재 영상
        } else {
          resolve(true); // 정상 유효 영상
        }
      };
      img.onerror = () => {
        if (timedOut) return;
        clearTimeout(timer);
        resolve(false);
      };
      img.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    });
  }

  // 단일 영상 IFrame Player 테스트 (미리보기 모달과 동일한 videoId 직접 생성 방식)
  checkSingleVideoEmbed(videoId) {
    return new Promise((resolve) => {
      const container = document.getElementById('embed-check-runner-container');
      if (!container || !window.YT || !window.YT.Player) {
        this.checkThumbnailValidity(videoId).then(isValid => {
          resolve({ ok: isValid, reason: isValid ? '정상' : '영상 미존재 또는 삭제' });
        });
        return;
      }

      // 고유 타겟 div 주입
      const targetId = `embed-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      container.innerHTML = `<div id="${targetId}" style="width:240px;height:135px;"></div>`;

      let isSettled = false;
      let checkTimeout = null;
      let playerInstance = null;

      const finish = (result) => {
        if (isSettled) return;
        isSettled = true;
        if (checkTimeout) clearTimeout(checkTimeout);
        if (playerInstance && typeof playerInstance.destroy === 'function') {
          try {
            playerInstance.pauseVideo?.();
            playerInstance.destroy();
          } catch (e) {}
          playerInstance = null;
        }
        if (container) container.innerHTML = '';
        resolve(result);
      };

      // 타임아웃 2.5초: 시간 내에 에러 또는 재생 신호가 없으면 실패 판정
      checkTimeout = setTimeout(() => {
        finish({ ok: false, reason: '외부 임베드 응답 시간 초과 (재생 제한)' });
      }, 2500);

      const isHttp = window.location.protocol.startsWith('http');
      const origin = (isHttp && window.location.origin && window.location.origin !== 'null') ? window.location.origin : undefined;

      const playerOptions = {
        height: '135',
        width: '240',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: (e) => {
            try {
              e.target.mute();
              e.target.playVideo();
            } catch (err) {}
          },
          onError: (e) => {
            const code = e ? e.data : 0;
            let reason = '임베드 재생 불가';
            if (code === 101 || code === 150) {
              reason = '원작자의 외부 임베드 차단 (Error 150/101)';
            } else if (code === 100) {
              reason = '삭제 또는 비공개 영상 (Error 100)';
            } else if (code === 2) {
              reason = '잘못된 영상 ID (Error 2)';
            }
            finish({ ok: false, errorCode: code, reason });
          },
          onStateChange: (e) => {
            const state = e ? e.data : -1;
            // 1: PLAYING, 3: BUFFERING -> 실제 비디오 스트림 수신 성공!
            if (state === 1 || state === 3) {
              finish({ ok: true, reason: '정상 재생 가능' });
            }
          }
        }
      };
      if (origin) {
        playerOptions.playerVars.origin = origin;
      }

      try {
        playerInstance = new YT.Player(targetId, playerOptions);
      } catch (err) {
        finish({ ok: false, reason: '플레이어 생성 실패' });
      }
    });
  }

  // 전체 영상 순차 점검
  async checkAllEmbeds() {
    if (this.isCheckingEmbeds) {
      return;
    }
    if (!this.candidates || this.candidates.length === 0) {
      alert("점검할 참가 영상이 없습니다. 영상을 먼저 등록해 주세요.");
      return;
    }

    this.isCheckingEmbeds = true;
    const btn = document.getElementById('btn-check-embed-all');
    let originalHtml = '';
    if (btn) {
      originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> 점검 준비 중...`;
    }

    this.showPerfToast('🎬 임베드 점검 시작', `등록된 ${this.candidates.length}개 영상의 유튜브 외부 재생 허용 여부(오류 150/101 및 삭제)를 점검합니다...`, 'info', 3000);

    // YouTube API 준비 확인
    await this.ensureYouTubeApiReady();

    // 초기 상태: 전체를 'checking'으로 표시
    for (const cand of this.candidates) {
      this.embedCheckStatus[cand.youtubeId] = 'checking';
    }
    this.renderCandidateList();

    let okCount = 0;
    let warnCount = 0;
    const total = this.candidates.length;

    // 순차적 실시간 점검 (Zero-Lag: 한 곡씩 점검하면서 즉시 뱃지와 진행률 갱신)
    for (let i = 0; i < total; i++) {
      const cand = this.candidates[i];
      if (btn) {
        btn.innerHTML = `<span>⏳</span> 점검 중 (${i + 1}/${total})...`;
      }

      // 1단계: 썸네일 이미지 삭제/비공개 검사 (초고속)
      const isThumbValid = await this.checkThumbnailValidity(cand.youtubeId);
      if (!isThumbValid) {
        this.updateSingleEmbedBadge(cand.youtubeId, 'warn', '삭제되었거나 비공개된 영상입니다');
        warnCount++;
        continue;
      }

      // 2단계: 플레이어 임베드 및 퍼가기 차단(150/101) 검사 (미리보기 모달과 동일한 인스턴스 정밀 검증)
      const result = await this.checkSingleVideoEmbed(cand.youtubeId);

      if (result.ok) {
        this.updateSingleEmbedBadge(cand.youtubeId, 'ok', '유튜브 외부 재생 정상 확인');
        okCount++;
      } else {
        this.updateSingleEmbedBadge(cand.youtubeId, 'warn', result.reason || '임베드 재생 주의');
        warnCount++;
      }
    }

    this.isCheckingEmbeds = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }

    if (warnCount > 0) {
      this.showPerfToast(
        '⚠️ 재생 주의 영상 발견',
        `정상 재생: ${okCount}곡 / 임베드 주의: ${warnCount}곡. [임베드 주의] 뱃지가 붙은 영상을 확인하고 교체해 주세요.`,
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

  // 영상 빠른 미리보기 모달 열기 (YT.Player 기반 실시간 에러 감지 및 뱃지 자동 동기화)
  openPreviewModal(cand) {
    if (!cand || !cand.youtubeId) return;
    const modal = document.getElementById('modal-video-preview');
    const titleEl = document.getElementById('preview-modal-title');
    const linkEl = document.getElementById('preview-yt-link');
    const playerWrap = document.getElementById('preview-player-iframe');
    const tipEl = document.getElementById('preview-status-tip');

    if (titleEl) titleEl.textContent = cand.title || '영상 미리보기';
    if (linkEl) linkEl.href = `https://www.youtube.com/watch?v=${cand.youtubeId}`;
    if (tipEl) {
      const state = this.embedCheckStatus[cand.youtubeId];
      if (state === 'ok') {
        tipEl.innerHTML = `<span style="color:#10b981;font-weight:bold;">✅ 외부 임베드 재생 정상 확인됨</span>`;
      } else if (state === 'warn') {
        tipEl.innerHTML = `<span style="color:#f87171;font-weight:bold;">⚠️ 원작자의 외부 임베드 재생 차단 (Error 150/101)</span>`;
      } else {
        tipEl.innerHTML = `<span>영상 로딩 및 임베드 상태를 확인하는 중...</span>`;
      }
    }

    if (playerWrap) {
      if (this.previewPlayerInstance && typeof this.previewPlayerInstance.destroy === 'function') {
        try { this.previewPlayerInstance.destroy(); } catch (e) {}
        this.previewPlayerInstance = null;
      }
      playerWrap.innerHTML = '<div id="preview-yt-embed-target" style="width:100%;height:100%;"></div>';

      const isHttp = window.location.protocol.startsWith('http');
      const origin = (isHttp && window.location.origin && window.location.origin !== 'null') ? window.location.origin : undefined;

      const playerOptions = {
        height: '100%',
        width: '100%',
        videoId: cand.youtubeId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: (e) => {
            try { e.target.playVideo(); } catch (err) {}
          },
          onError: (e) => {
            const code = e ? e.data : 0;
            let reason = '임베드 재생 불가';
            if (code === 101 || code === 150) {
              reason = '원작자의 외부 임베드 차단 (Error 150/101)';
            } else if (code === 100) {
              reason = '삭제 또는 비공개 영상 (Error 100)';
            } else if (code === 2) {
              reason = '잘못된 영상 ID (Error 2)';
            }
            if (tipEl) {
              tipEl.innerHTML = `<span style="color:#f87171;font-weight:bold;">⚠️ ${reason} - 다른 영상으로 교체 권장</span>`;
            }
            this.updateSingleEmbedBadge(cand.youtubeId, 'warn', reason);
          },
          onStateChange: (e) => {
            if (e && (e.data === 1 || e.data === 3)) {
              if (tipEl) {
                tipEl.innerHTML = `<span style="color:#10b981;font-weight:bold;">✅ 외부 임베드 재생 정상 확인됨</span>`;
              }
              this.updateSingleEmbedBadge(cand.youtubeId, 'ok', '유튜브 외부 재생 정상 확인');
            }
          }
        }
      };
      if (origin) {
        playerOptions.playerVars.origin = origin;
      }

      try {
        if (window.YT && window.YT.Player) {
          this.previewPlayerInstance = new YT.Player('preview-yt-embed-target', playerOptions);
        } else {
          playerWrap.innerHTML = `
            <iframe
              src="https://www.youtube.com/embed/${cand.youtubeId}?autoplay=1&rel=0&playsinline=1"
              title="${cand.title || 'YouTube video'}"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              style="width: 100%; height: 100%; border: none;">
            </iframe>
          `;
        }
      } catch (err) {
        playerWrap.innerHTML = `
          <iframe
            src="https://www.youtube.com/embed/${cand.youtubeId}?autoplay=1&rel=0&playsinline=1"
            title="${cand.title || 'YouTube video'}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            style="width: 100%; height: 100%; border: none;">
          </iframe>
        `;
      }
    }

    if (modal) {
      modal.classList.add('active');
    }
  }

  // 영상 빠른 미리보기 모달 닫기
  closePreviewModal() {
    const modal = document.getElementById('modal-video-preview');
    if (this.previewPlayerInstance && typeof this.previewPlayerInstance.destroy === 'function') {
      try { this.previewPlayerInstance.destroy(); } catch (e) {}
      this.previewPlayerInstance = null;
    }
    const playerWrap = document.getElementById('preview-player-iframe');
    if (playerWrap) {
      playerWrap.innerHTML = '';
    }
    if (modal) {
      modal.classList.remove('active');
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

    // 투표 적용 범위 라디오 버튼 상태 동기화
    const scope = this.chzzkChat.pollScope || 'all';
    const radioScope = document.querySelector(`input[name="chzzk-poll-scope"][value="${scope}"]`);
    if (radioScope) {
      radioScope.checked = true;
      document.querySelectorAll('.scope-option-card').forEach(card => card.classList.remove('selected'));
      radioScope.closest('.scope-option-card')?.classList.add('selected');
    }

    // 커스텀 프록시 주소 동기화
    const proxyInput = document.getElementById('input-chzzk-proxy');
    if (proxyInput) {
      proxyInput.value = this.chzzkChat.getCustomProxy();
    }
  }

  /**
   * 치지직 시청자 투표 패널 표시 범위 제어
   * (전체 모드 vs 4강전&결승전 전용 모드에 따른 잠금/노출 처리)
   */
  applyPollScopeVisibility(isFinalPhase = false) {
    if (!this.chzzkChat) return;
    const isAllowed = this.chzzkChat.isPollAllowedForCurrentPhase(isFinalPhase);

    const lockedNotice = document.getElementById('chzzk-poll-locked-notice');
    const barWrap = document.querySelector('.chzzk-poll-bar-wrapper');
    const controlsWrap = document.getElementById('chzzk-poll-controls-wrap');

    if (!isAllowed) {
      // 4강전 전용 모드이고 현재 래더 리그인 경우 -> 잠금 안내 노출 및 투표 비활성화
      if (lockedNotice) lockedNotice.style.display = 'flex';
      if (barWrap) barWrap.style.display = 'none';
      if (controlsWrap) controlsWrap.style.display = 'none';
      if (this.chzzkChat.isPolling) {
        this.chzzkChat.stopPoll();
      }
    } else {
      // 투표 허용 구간인 경우 -> 정상 활성화
      if (lockedNotice) lockedNotice.style.display = 'none';
      if (barWrap) barWrap.style.display = 'block';
      if (controlsWrap) controlsWrap.style.display = 'flex';
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
      alert(`[치지직 연결 실패]\n\n${err.message}`);
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

  downloadStartBat() {
    const batScript = `@echo off
title Golden Tournament - Local Proxy Server
cls
echo ========================================================
echo  [Golden Tournament] Chzzk Proxy Server (Port 8000)
echo  https://njs1541.github.io/GOLDEN-TOURNAMENT/
echo  Keep this window open while using Chzzk integration.
echo ========================================================
echo.

rem 브라우저 자동 실행 (창이 뜨는 것을 원치 않으시면 아래 줄 맨 앞에 rem을 입력하세요)
start https://njs1541.github.io/GOLDEN-TOURNAMENT/

if exist server.py goto run_server

echo [Info] server.py not found. Downloading proxy script...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/njs1541/GOLDEN-TOURNAMENT/main/server.py', 'server.py')" 2>nul

if exist server.py goto run_server

echo [Warning] Using fallback HTTP server...
python -m http.server 8000
goto end

:run_server
python server.py
goto end

:end
pause
`;
    const blob = new Blob([batScript], { type: 'application/x-bat;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'start.bat';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);

    this.showPerfToast('📥 start.bat 다운로드 완료', '다운로드된 start.bat 파일을 실행해 두시면 치지직이 즉시 연동됩니다.', 'info', 4000);
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
        const viewText = data.currentView === 'final' ? '파이널 4강전' : '본선 랭크 레이스';
        
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
      if (this.bracket && data.bracketState && data.bracketState.currentFinalStep !== 'done') {
        this.bracket.renderBracketView();
        this.switchView('final');
        const btnStart = document.getElementById('btn-start-final-match');
        if (btnStart) {
          if (this.bracket.currentFinalStep === 'semi1') {
            btnStart.textContent = "4강 제1경기 시작 (1위 vs 4위)";
          } else if (this.bracket.currentFinalStep === 'semi2') {
            btnStart.textContent = "4강 제2경기 시작 (2위 vs 3위)";
          } else if (this.bracket.currentFinalStep === 'final') {
            btnStart.textContent = "결승전 시작하기 🏆";
          }
          btnStart.onclick = () => this.bracket.runNextFinalMatch();
        }
      } else {
        this.engine.renderBattleMatch();
        this.switchView('battle');
      }

      // 배너 숨김
      const banner = document.getElementById('session-resume-banner');
      if (banner) banner.style.display = 'none';

      this.showPerfToast('⏩ 토너먼트 이어하기 완료', '이전 진행 매치와 랭크 점수가 성공적으로 복원되었습니다!', 'info', 3000);
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
