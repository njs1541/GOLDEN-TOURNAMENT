/**
 * 스위스-Elo 하이브리드 토너먼트 매칭 엔진
 * 1단계: 스위스 균등 노출 보정 (모든 영상이 최소 MIN_EXPOSURE회 대결할 때까지 우선 매칭)
 * 2단계: 정밀 Elo 라이벌 매치 (레이팅 격차가 가장 적은 후보끼리 접전)
 * 3단계: 목표 매치 수 달성 시 골든 파이널 4강 진출
 */

/**
 * 연승(Streak) 인디케이터 렌더링 헬퍼
 * 글씨 크기 설정(1줄 모드 / 2줄 모드) 및 불꽃 엠블럼 특수 연출 대응
 */
window.renderStreakIndicator = function(icon, line1, line2, theme = '') {
  const streakEl = document.getElementById('streak-indicator');
  if (!streakEl) return;

  if (!icon && !line1 && !line2) {
    streakEl.innerHTML = '';
    return;
  }

  streakEl.innerHTML = `
    <div class="streak-indicator-wrap ${theme}">
      <div class="streak-fire-wrap">
        <span class="streak-fire">${icon}</span>
      </div>
      <div class="streak-text-wrap">
        <span class="streak-line streak-line-primary">${line1}</span>
        <span class="streak-line streak-line-secondary">${line2}</span>
      </div>
    </div>
  `;
};

class TournamentEngine {
  constructor(candidates, app, mode = 'standard') {
    this.app = app;
    this.mode = mode; // 'quick' | 'standard' | 'deep'

    // 후보자 초기화 (GC 최소화를 위해 속성 사전 정의)
    this.candidates = candidates.map((c, index) => ({
      ...c,
      originalIndex: index,
      elo: c.elo !== undefined ? c.elo : 1200,
      matches: c.matches !== undefined ? c.matches : 0,
      wins: c.wins !== undefined ? c.wins : 0,
      losses: c.losses !== undefined ? c.losses : 0,
      streak: c.streak !== undefined ? c.streak : 0,
      opponents: c.opponents instanceof Set ? c.opponents : new Set(c.opponents || [])
    }));

    // 설정 파라미터 (후보자 수 N 비례 동적 인터락)
    const N = this.candidates.length;
    this.minExposure = 2; // 모든 영상 최소 2회 노출 보장 (스위스 단계)
    this.maxSwissMatches = Math.ceil((N * this.minExposure) / 2); // N 매치

    if (mode === 'quick') {
      // 퀵 코스: 스위스 기본 노출만 마치고 즉시 4강 진출 (N 매치)
      this.totalLadderMatches = this.maxSwissMatches;
    } else if (mode === 'deep') {
      // 마스터 래더: 충분한 라이벌 매칭 진행 (약 N * 2.8 매치)
      this.totalLadderMatches = Math.max(Math.ceil(N * 2.8), this.maxSwissMatches + 12);
    } else {
      // 표준 밸런스: 스위스 균등 + 적절한 라이벌 매치 (약 N * 1.75 매치)
      this.totalLadderMatches = Math.max(Math.ceil(N * 1.75), this.maxSwissMatches + 6);
    }
    
    this.currentMatchIndex = 0;
    this.currentMatch = null; // { candA, candB, phase }
    this.isProcessingVote = false;
    this.matchHistory = []; // 투표 취소(Undo)를 위한 스냅샷 스택
    this.hasShownEloTransition = false; // 스위스 -> Elo 래더 단계 전환 안내 노출 여부
    this.transTimerId = null;
    this.transKeyHandler = null;
  }

  start() {
    this.currentMatchIndex = 0;
    this.nextMatch();
  }

  /**
   * 다음 매치 생성 및 페어링
   */
  nextMatch() {
    // 목표 매치 수 달성 여부 확인 -> 골든 파이널 4강 전환
    if (this.currentMatchIndex >= this.totalLadderMatches) {
      this.finishLadderPhase();
      return;
    }

    this.currentMatchIndex++;
    
    // 현재 단계 판별
    // 1단계: 아직 최소 노출 수(minExposure)에 도달하지 못한 영상이 남아있으면 스위스 공정 노출
    const underExposed = this.candidates.filter(c => c.matches < this.minExposure);
    let candA = null;
    let candB = null;
    let phaseName = '';

    if (underExposed.length >= 1) {
      // [1단계: 배치고사 (전원 2회)] 노출이 적은 영상끼리 우선 매칭 (1명만 남아도 잔여 최소 노출 엄격 보장)
      phaseName = '배치고사 (전원 2회)';
      // 노출 수가 가장 적은 순으로 정렬 후 첫 번째 선택
      underExposed.sort((a, b) => a.matches - b.matches);
      candA = underExposed[0];

      // candA와 아직 붙어보지 않은 후보 중 노출 수가 적은 순으로 candB 선택
      const eligibleB = underExposed.filter(c => c.id !== candA.id && !candA.opponents.has(c.id));
      if (eligibleB.length > 0) {
        candB = eligibleB[Math.floor(Math.random() * eligibleB.length)];
      } else {
        // 이미 다 붙어봤다면 전체 후보 중 대결 횟수 적은 후보와 매칭
        const others = this.candidates.filter(c => c.id !== candA.id);
        others.sort((a, b) => a.matches - b.matches);
        candB = others[0];
      }
    } else {
      // [2단계: 본선 랭크 레이스] 레이팅이 가장 비슷한 두 후보 라이벌 매칭
      phaseName = '본선 랭크 레이스';
      // 무작위로 하나의 기준 후보 선택
      const randomIndex = Math.floor(Math.random() * this.candidates.length);
      candA = this.candidates[randomIndex];

      // candA와 Elo 차이가 가장 적고, 최근에 안 붙은 라이벌 탐색
      const rivals = this.candidates
        .filter(c => c.id !== candA.id)
        .map(c => ({
          candidate: c,
          diff: Math.abs(c.elo - candA.elo),
          hasFought: candA.opponents.has(c.id)
        }))
        .sort((a, b) => {
          // 아직 안 붙어본 라이벌 우선, 그 다음 Elo 차이가 적은 순
          if (a.hasFought !== b.hasFought) return a.hasFought ? 1 : -1;
          return a.diff - b.diff;
        });

      // 최상위 라이벌 3명 중 무작위 1명 선택 (매번 똑같은 매칭 방지)
      const topPool = rivals.slice(0, Math.min(3, rivals.length));
      candB = topPool[Math.floor(Math.random() * topPool.length)].candidate;
    }

    // 좌/우 배치 (50% 확률로 좌우 무작위 셔플)
    if (Math.random() > 0.5) {
      const temp = candA;
      candA = candB;
      candB = temp;
    }

    this.currentMatch = { candA, candB, phase: phaseName };

    // 화면 렌더링
    this.renderBattleMatch();
  }

  /**
   * 대결 화면 UI 및 영상 로드
   */
  renderBattleMatch() {
    if (!this.currentMatch) return;
    const { candA, candB, phase } = this.currentMatch;

    // 1. 헤더 뱃지 및 프로그레스 갱신
    const phasePill = document.getElementById('match-phase-badge');
    const phaseText = document.getElementById('phase-text');
    const progressBar = document.getElementById('main-progress-bar');
    const progressLabel = document.getElementById('progress-text');
    const matchIndicator = document.getElementById('current-match-indicator');

    const isPlacement = phase.includes('배치고사') || phase.includes('스위스');
    if (phaseText) phaseText.textContent = phase;
    if (phasePill) {
      if (isPlacement) {
        phasePill.className = 'phase-pill pill-swiss';
      } else {
        phasePill.className = 'phase-pill pill-elo';
      }
    }

    const progressPercent = Math.min(100, Math.round((this.currentMatchIndex / this.totalLadderMatches) * 100));
    if (progressBar) progressBar.style.width = `${progressPercent}%`;
    if (progressLabel) progressLabel.textContent = `진행도: ${this.currentMatchIndex} / ${this.totalLadderMatches} 매치 (${progressPercent}%)`;
    if (matchIndicator) {
      matchIndicator.classList.remove('badge-multiline');
      if (isPlacement) {
        matchIndicator.classList.remove('match-indicator-elo');
        matchIndicator.textContent = `MATCH ${this.currentMatchIndex} / ${this.totalLadderMatches}`;
      } else {
        matchIndicator.classList.add('match-indicator-elo');
        matchIndicator.textContent = `⚡ RIVAL MATCH ${this.currentMatchIndex} / ${this.totalLadderMatches}`;
      }
    }

    // 2. 카드 A 메타데이터 렌더링
    const titleA = document.getElementById('title-a');
    const channelA = document.getElementById('channel-a');
    const badgeEloA = document.getElementById('badge-elo-a');
    const statsRecordA = document.getElementById('stats-record-a');
    const statsMatchesA = document.getElementById('stats-matches-a');

    if (titleA) titleA.textContent = candA.title;
    if (channelA) channelA.textContent = candA.creator || 'YouTube';
    if (badgeEloA) badgeEloA.textContent = `${Math.round(candA.elo)} RP`;
    if (statsRecordA) statsRecordA.textContent = `${candA.wins}승 ${candA.losses}패`;
    if (statsMatchesA) statsMatchesA.textContent = `${candA.matches}회 대결`;
    const linkDirectA = document.getElementById('link-direct-a');
    if (linkDirectA) linkDirectA.href = `https://www.youtube.com/watch?v=${candA.youtubeId}`;

    // 3. 카드 B 메타데이터 렌더링
    const titleB = document.getElementById('title-b');
    const channelB = document.getElementById('channel-b');
    const badgeEloB = document.getElementById('badge-elo-b');
    const statsRecordB = document.getElementById('stats-record-b');
    const statsMatchesB = document.getElementById('stats-matches-b');

    if (titleB) titleB.textContent = candB.title;
    if (channelB) channelB.textContent = candB.creator || 'YouTube';
    if (badgeEloB) badgeEloB.textContent = `${Math.round(candB.elo)} RP`;
    if (statsRecordB) statsRecordB.textContent = `${candB.wins}승 ${candB.losses}패`;
    if (statsMatchesB) statsMatchesB.textContent = `${candB.matches}회 대결`;
    const linkDirectB = document.getElementById('link-direct-b');
    if (linkDirectB) linkDirectB.href = `https://www.youtube.com/watch?v=${candB.youtubeId}`;

    // 4. 실시간 예상 승률(Elo Expected Win Rate) 계산 및 렌더링
    const expectedA = 1 / (1 + Math.pow(10, (candB.elo - candA.elo) / 400));
    const percentA = Math.max(5, Math.min(95, Math.round(expectedA * 100)));
    const percentB = 100 - percentA;

    const probValA = document.getElementById('prob-val-a');
    const probValB = document.getElementById('prob-val-b');
    const probFillA = document.getElementById('prob-fill-a');
    const probFillB = document.getElementById('prob-fill-b');

    if (probValA) probValA.textContent = `${percentA}%`;
    if (probValB) probValB.textContent = `${percentB}%`;
    if (probFillA) probFillA.style.width = `${percentA}%`;
    if (probFillB) probFillB.style.width = `${percentB}%`;

    // 이전 매치 플래시 효과 리셋
    document.getElementById('card-a')?.classList.remove('vote-win-flash');
    document.getElementById('card-b')?.classList.remove('vote-win-flash');

    // 5. 연승(Streak) 인디케이터 정밀 판정 (둘 다 연승 시 맞대결, 한쪽만 연승 시 더 높은 쪽 표시)
    const sA = candA.streak || 0;
    const sB = candB.streak || 0;

    if (window.renderStreakIndicator) {
      if (sA >= 2 && sB >= 2) {
        window.renderStreakIndicator('⚡', `[A] ${sA}연승 vs [B] ${sB}연승`, '연승 맞대결', 'theme-rival');
      } else if (sA >= 2 && sA >= sB) {
        window.renderStreakIndicator('🔥', 'PLAYER A', `${sA}연승 기록 중`, 'theme-a');
      } else if (sB >= 2 && sB > sA) {
        window.renderStreakIndicator('🔥', 'PLAYER B', `${sB}연승 기록 중`, 'theme-b');
      } else {
        window.renderStreakIndicator('', '', '');
      }
    }

    // 6. 화면 전환 (대결 화면 활성화)
    this.app.switchView('battle');

    // 7. 유튜브 플레이어에 영상 로드 (Zero-Lag 인스턴스 재활용)
    if (window.dualPlayer) {
      window.dualPlayer.loadMatch(candA, candB);
    }

    // 8. 투표 버튼 리스너 바인딩
    this.bindVoteButtons();

    // 9. 되돌리기(Undo) 버튼 활성화 상태 갱신
    this.updateUndoButtonState();

    // 10. 치지직 실시간 투표 가시성(전체 vs 4강 전용) 적용 & 리셋
    if (this.app && typeof this.app.applyPollScopeVisibility === 'function') {
      this.app.applyPollScopeVisibility(false); // 래더 리그 단계
    }
    if (this.app && this.app.chzzkChat) {
      this.app.chzzkChat.resetPoll();
    }

    // 11. 배치고사 ➔ 본선 랭크 레이스 전환 안내 스플래시 모달 트리거
    if (!isPlacement && !this.hasShownEloTransition) {
      this.hasShownEloTransition = true;
      this.showPhaseTransitionNotice();
    }
  }

  /**
   * 스위스 균등 노출 ➔ Elo 래더 리그 단계 전환 스플래시 모달 표시
   */
  showPhaseTransitionNotice() {
    const modal = document.getElementById('modal-phase-transition');
    if (!modal) return;

    this.closePhaseTransitionNotice(); // 기존 타이머/리스너 정리

    const btnStart = document.getElementById('btn-start-elo-match');
    const timerBar = document.getElementById('trans-countdown-bar');
    const timerText = document.getElementById('trans-timer-text');

    modal.classList.add('active');

    const totalDuration = 3500; // 3.5초 자동 진행
    const startTime = performance.now();

    const updateCountdown = (currentTime) => {
      const elapsed = currentTime - startTime;
      const remaining = Math.max(0, totalDuration - elapsed);
      const ratio = remaining / totalDuration;

      if (timerBar) {
        timerBar.style.transform = `scaleX(${ratio})`;
      }
      if (timerText) {
        const sec = (remaining / 1000).toFixed(1);
        timerText.textContent = `${sec}초 후 대결이 자동으로 시작됩니다...`;
      }

      if (remaining > 0) {
        this.transTimerId = requestAnimationFrame(updateCountdown);
      } else {
        this.closePhaseTransitionNotice();
      }
    };

    this.transTimerId = requestAnimationFrame(updateCountdown);

    // 시작 버튼 및 키보드(Space, Enter, Escape) 리스너
    const handleClose = () => {
      this.closePhaseTransitionNotice();
    };

    if (btnStart) {
      btnStart.onclick = handleClose;
    }

    this.transKeyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', this.transKeyHandler);
  }

  /**
   * 단계 전환 모달 닫기 및 상단 뱃지/토스트 피드백 활성화
   */
  closePhaseTransitionNotice() {
    if (this.transTimerId) {
      cancelAnimationFrame(this.transTimerId);
      this.transTimerId = null;
    }
    if (this.transKeyHandler) {
      window.removeEventListener('keydown', this.transKeyHandler);
      this.transKeyHandler = null;
    }

    const modal = document.getElementById('modal-phase-transition');
    if (modal && modal.classList.contains('active')) {
      modal.classList.remove('active');

      // 헤더 뱃지에 글로우 애니메이션 부여
      const phasePill = document.getElementById('match-phase-badge');
      if (phasePill) {
        phasePill.classList.remove('pill-transition-glow');
        void phasePill.offsetWidth; // CSS 애니메이션 재시작 트리거
        phasePill.classList.add('pill-transition-glow');
      }

      // 토스트 알림 연동
      if (this.app && typeof this.app.showPerfToast === 'function') {
        this.app.showPerfToast('⚡ 실시간 Elo 래더 리그 돌입', '이제 레이팅이 비슷한 라이벌끼리 매칭됩니다!', 'info', 3000);
      }
    }
  }

  bindVoteButtons() {
    const btnA = document.getElementById('btn-vote-a');
    const btnB = document.getElementById('btn-vote-b');

    if (btnA) {
      btnA.onclick = () => this.handleVote('A');
    }
    if (btnB) {
      btnB.onclick = () => this.handleVote('B');
    }
  }

  /**
   * 투표 직전 상태 스냅샷 저장 (Undo 전용)
   */
  recordSnapshot(actionType, winnerSide = null) {
    if (!this.currentMatch) return;
    const snapshot = {
      actionType,
      winnerSide,
      matchIndex: this.currentMatchIndex,
      currentMatch: {
        candAId: this.currentMatch.candA.id,
        candBId: this.currentMatch.candB.id,
        phase: this.currentMatch.phase
      },
      candidates: this.candidates.map(c => ({
        id: c.id,
        elo: c.elo,
        matches: c.matches,
        wins: c.wins,
        losses: c.losses,
        streak: c.streak,
        opponents: Array.from(c.opponents)
      }))
    };
    this.matchHistory.push(snapshot);
    // 최대 30개까지 보관
    if (this.matchHistory.length > 30) {
      this.matchHistory.shift();
    }
    this.updateUndoButtonState();
  }

  /**
   * 직전 투표 되돌리기 (Undo)
   */
  undoVote() {
    if (this.matchHistory.length === 0 || this.isProcessingVote) return false;
    const lastSnapshot = this.matchHistory.pop();

    // 1. 후보자 상태 복원
    lastSnapshot.candidates.forEach(saved => {
      const target = this.candidates.find(c => c.id === saved.id);
      if (target) {
        target.elo = saved.elo;
        target.matches = saved.matches;
        target.wins = saved.wins;
        target.losses = saved.losses;
        target.streak = saved.streak;
        target.opponents = new Set(saved.opponents);
      }
    });

    // 2. 매치 인덱스 및 현재 매치 복원
    this.currentMatchIndex = lastSnapshot.matchIndex;
    const candA = this.candidates.find(c => c.id === lastSnapshot.currentMatch.candAId);
    const candB = this.candidates.find(c => c.id === lastSnapshot.currentMatch.candBId);
    this.currentMatch = { candA, candB, phase: lastSnapshot.currentMatch.phase };

    // 배치고사 단계로 되돌아갔다면 단계 전환 노출 플래그 복원
    this.closePhaseTransitionNotice();
    if (lastSnapshot.currentMatch.phase && (lastSnapshot.currentMatch.phase.includes('배치고사') || lastSnapshot.currentMatch.phase.includes('스위스'))) {
      this.hasShownEloTransition = false;
    }

    // 3. 화면 재렌더링
    this.renderBattleMatch();
    this.updateUndoButtonState();

    // 4. 세션 실시간 갱신 & 토스트 알림
    if (this.app && typeof this.app.saveTournamentSession === 'function') {
      this.app.saveTournamentSession();
    }
    if (this.app && typeof this.app.showPerfToast === 'function') {
      this.app.showPerfToast('↺ 직전 투표 취소됨', '이전 매치 및 ELO 변동이 정상 복구되었습니다.', 'info', 2500);
    }
    return true;
  }

  updateUndoButtonState() {
    const btnUndo = document.getElementById('btn-battle-undo');
    if (btnUndo) {
      const canUndo = this.matchHistory.length > 0;
      btnUndo.disabled = !canUndo;
      btnUndo.classList.toggle('disabled', !canUndo);
      btnUndo.title = canUndo ? `직전 투표 취소 및 복원 (단축키: Z 또는 Ctrl+Z)` : `되돌릴 이전 매치가 없습니다`;
    }
  }

  /**
   * 투표 처리 및 Elo 점수 계산
   */
  handleVote(winnerSide) {
    if (this.isProcessingVote || !this.currentMatch) return;
    this.isProcessingVote = true;

    // 1. 투표 직전 스냅샷 저장
    this.recordSnapshot('vote', winnerSide);

    const { candA, candB } = this.currentMatch;
    const isWinnerA = winnerSide === 'A';

    // 선택된 카드에 시각적 타격감(플래시) 부여
    const winCard = document.getElementById(isWinnerA ? 'card-a' : 'card-b');
    if (winCard) {
      winCard.classList.add('vote-win-flash');
    }

    // Elo K-Factor (대결 횟수가 적을수록 변동폭을 크게 부여하여 빠른 수렴)
    const kFactorA = candA.matches < 3 ? 48 : 32;
    const kFactorB = candB.matches < 3 ? 48 : 32;

    // 예상 승률 계산 (Logistic Function)
    const expectedA = 1 / (1 + Math.pow(10, (candB.elo - candA.elo) / 400));
    const expectedB = 1 - expectedA;

    // 실제 점수 (승자 1, 패자 0)
    const scoreA = isWinnerA ? 1 : 0;
    const scoreB = isWinnerA ? 0 : 1;

    // Elo 갱신
    candA.elo += kFactorA * (scoreA - expectedA);
    candB.elo += kFactorB * (scoreB - expectedB);

    // 전적 및 연승 갱신
    candA.matches++;
    candB.matches++;
    candA.opponents.add(candB.id);
    candB.opponents.add(candA.id);

    if (isWinnerA) {
      candA.wins++;
      candA.streak++;
      candB.losses++;
      candB.streak = 0;
    } else {
      candB.wins++;
      candB.streak++;
      candA.losses++;
      candA.streak = 0;
    }

    // 세션 자동 저장 훅
    if (this.app && typeof this.app.saveTournamentSession === 'function') {
      this.app.saveTournamentSession();
    }

    // 다음 매치로 전환
    setTimeout(() => {
      this.isProcessingVote = false;
      this.nextMatch();
    }, 200);
  }

  /**
   * 스킵(무승부) 처리
   */
  skipMatch() {
    if (this.isProcessingVote || !this.currentMatch) return;
    this.isProcessingVote = true;
    this.recordSnapshot('skip');

    const { candA, candB } = this.currentMatch;
    candA.matches++;
    candB.matches++;
    candA.opponents.add(candB.id);
    candB.opponents.add(candA.id);

    if (this.app && typeof this.app.saveTournamentSession === 'function') {
      this.app.saveTournamentSession();
    }

    setTimeout(() => {
      this.isProcessingVote = false;
      this.nextMatch();
    }, 200);
  }

  /**
   * 현재 점수 기준 내림차순 정렬된 랭킹 반환 (실시간 랭킹 모달 및 티어표용)
   */
  getSortedRankings() {
    return [...this.candidates].sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      return b.wins - a.wins;
    });
  }

  /**
   * 현재 래더 진행 상태 직렬화 (세션 저장용)
   */
  exportState() {
    return {
      mode: this.mode,
      currentMatchIndex: this.currentMatchIndex,
      totalLadderMatches: this.totalLadderMatches,
      minExposure: this.minExposure,
      maxSwissMatches: this.maxSwissMatches,
      hasShownEloTransition: this.hasShownEloTransition,
      currentMatch: this.currentMatch ? {
        candAId: this.currentMatch.candA.id,
        candBId: this.currentMatch.candB.id,
        phase: this.currentMatch.phase
      } : null,
      candidates: this.candidates.map(c => ({
        ...c,
        opponents: Array.from(c.opponents)
      })),
      matchHistory: this.matchHistory
    };
  }

  /**
   * 저장된 세션 상태로부터 복원
   */
  importState(data) {
    if (!data) return;
    this.mode = data.mode || this.mode;
    this.currentMatchIndex = data.currentMatchIndex || 0;
    this.totalLadderMatches = data.totalLadderMatches || this.totalLadderMatches;
    this.minExposure = data.minExposure || 2;
    this.maxSwissMatches = data.maxSwissMatches || Math.ceil((this.candidates.length * 2) / 2);
    this.hasShownEloTransition = Boolean(data.hasShownEloTransition);
    this.matchHistory = data.matchHistory || [];

    if (Array.isArray(data.candidates)) {
      this.candidates = data.candidates.map(c => ({
        ...c,
        opponents: new Set(c.opponents || [])
      }));
    }

    if (data.currentMatch) {
      const candA = this.candidates.find(c => c.id === data.currentMatch.candAId);
      const candB = this.candidates.find(c => c.id === data.currentMatch.candBId);
      if (candA && candB) {
        this.currentMatch = { candA, candB, phase: data.currentMatch.phase };
      }
    }
  }

  /**
   * Elo 래더 단계 종료 -> 상위 4개 후보 골든 파이널 4강 진출
   */
  finishLadderPhase() {
    const sorted = this.getSortedRankings();
    const finalFour = sorted.slice(0, 4);

    console.log("[TournamentEngine] 골든 파이널 4강 진출자:", finalFour);

    if (window.dualPlayer) {
      window.dualPlayer.stopAll();
    }

    // 단위 3 브래킷 매니저 호출
    if (window.GoldenBracketManager) {
      const bracketManager = new window.GoldenBracketManager(finalFour, sorted, this.app);
      this.app.bracket = bracketManager;
      bracketManager.start();
      // 브래킷 상태 저장
      if (this.app && typeof this.app.saveTournamentSession === 'function') {
        this.app.saveTournamentSession();
      }
    } else {
      alert("골든 파이널 4강 진출자가 확정되었습니다!\n1위: " + finalFour[0].title + "\n2위: " + finalFour[1].title);
      this.app.switchView('setup');
    }
  }
}

// 전역 등록
window.TournamentEngine = TournamentEngine;
