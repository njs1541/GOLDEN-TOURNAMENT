/**
 * 메인 애플리케이션 진입점 & 화면 전환 컨트롤러
 */

class AppController {
  constructor() {
    this.candidates = [];
    this.currentView = 'setup'; // 'setup' | 'battle' | 'final' | 'result'
    this.engine = null; // engine.js에서 초기화
    this.bracket = null; // bracket.js에서 초기화
    this.tierMaker = null; // tiermaker.js에서 초기화
  }

  init() {
    // 1. 기본 영상 리스트 복원
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

  loadDefaultCandidates() {
    if (window.DEFAULT_VIDEOS && Array.isArray(window.DEFAULT_VIDEOS)) {
      // 복사본 생성
      this.candidates = window.DEFAULT_VIDEOS.map(v => ({ ...v }));
    }
  }

  bindEvents() {
    // 후보 추가 버튼
    const btnAdd = document.getElementById('btn-add-video');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => this.handleAddVideo());
    }

    // 기본 16선 복구 버튼
    const btnReset = document.getElementById('btn-reset-default');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.loadDefaultCandidates();
        this.renderCandidateList();
      });
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

  handleAddVideo() {
    const inputUrl = document.getElementById('input-yt-url');
    const inputTitle = document.getElementById('input-yt-title');
    const ytId = this.parseYouTubeId(inputUrl.value);

    if (!ytId) {
      alert("올바른 YouTube URL 또는 11자리 영상 ID를 입력해 주세요.");
      return;
    }

    const title = inputTitle.value.trim() || `YouTube Video (${ytId})`;
    this.candidates.push({
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      youtubeId: ytId,
      title: title,
      creator: "사용자 추가",
      startSec: 0
    });

    inputUrl.value = '';
    inputTitle.value = '';
    this.renderCandidateList();
  }

  removeCandidate(index) {
    if (this.candidates.length <= 4) {
      alert("최소 4개 이상의 영상이 등록되어 있어야 토너먼트를 진행할 수 있습니다.");
      return;
    }
    this.candidates.splice(index, 1);
    this.renderCandidateList();
  }

  renderCandidateList() {
    const listEl = document.getElementById('candidate-list');
    const countEl = document.getElementById('candidate-count');
    if (!listEl) return;

    if (countEl) {
      countEl.textContent = this.candidates.length;
    }
    listEl.innerHTML = '';

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
            <span class="item-title" title="${cand.title}">${cand.title}</span>
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

      itemEl.querySelector('.btn-remove-item').addEventListener('click', () => {
        this.removeCandidate(idx);
      });

      listEl.appendChild(itemEl);
    });
  }

  // 화면 전환 (Zero-Lag 60FPS: display + opacity 트랜지션)
  switchView(viewName) {
    this.currentView = viewName;
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
      row.className = 'candidate-item';
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
