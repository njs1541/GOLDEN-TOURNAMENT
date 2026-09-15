/**
 * 메인 애플리케이션 진입점 & 화면 전환 컨트롤러
 */

const STORAGE_CANDIDATES_KEY = 'GOLDEN_TOURNAMENT_CANDIDATES_LIST';

class AppController {
  constructor() {
    this.candidates = [];
    this.currentView = 'setup'; // 'setup' | 'battle' | 'final' | 'result'
    this.engine = null; // engine.js에서 초기화
    this.bracket = null; // bracket.js에서 초기화
    this.tierMaker = null; // tiermaker.js에서 초기화
  }

  init() {
    // 1. 웹 저장소의 후보 목록 복원 (저장된 상태가 없으면 기본 16선 로드)
    this.loadDefaultCandidates();

    // 2. DOM 이벤트 리스너 등록
    this.bindEvents();

    // 3. 유튜브 플레이어 API 사전 로드
    if (window.dualPlayer) {
      window.dualPlayer.init();
    }

    // 4. 초기 화면 렌더링
    this.renderCandidateList();
    this.switchView('setup');
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

    // 키보드 단축키 (A / D, 좌 / 우 화살표)
    window.addEventListener('keydown', (e) => {
      if (this.currentView !== 'battle') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
}

// 앱 시작
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
  window.app.init();
});
