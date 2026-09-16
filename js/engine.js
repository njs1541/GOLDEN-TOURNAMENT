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
      elo: 1200,
      matches: 0,
      wins: 0,
      losses: 0,
      streak: 0,
      opponents: new Set() // 중복 대결 방지용
    }));

    // 설정 파라미터
    this.minExposure = 2; // 모든 영상 최소 2회 노출 보장 (스위스 단계)
    this.maxSwissMatches = Math.ceil((this.candidates.length * this.minExposure) / 2);

    if (mode === 'quick') {
      // 퀵 코스: 스위스 기본 노출만 마치고 즉시 4강 진출 (16개 기준 16매치)
      this.totalLadderMatches = this.maxSwissMatches;
    } else if (mode === 'deep') {
      // 마스터 래더: 충분한 라이벌 매칭 진행 (16개 기준 약 45매치)
      this.totalLadderMatches = Math.floor(this.candidates.length * 2.8);
    } else {
      // 표준 밸런스: 스위스 균등 + 적절한 라이벌 매치 (16개 기준 약 28매치)
      this.totalLadderMatches = Math.max(this.maxSwissMatches + 12, Math.floor(this.candidates.length * 1.75));
    }
    
    this.currentMatchIndex = 0;
    this.currentMatch = null; // { candA, candB, phase }
    this.isProcessingVote = false;
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

    if (underExposed.length >= 2) {
      // [1단계: 스위스 균등 노출] 노출이 적은 영상끼리 우선 매칭
      phaseName = '스위스 균등 노출';
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
      // [2단계: 정밀 Elo 라이벌 매치] 레이팅이 가장 비슷한 두 후보 매칭
      phaseName = 'Elo 래더 라이벌 매치';
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

    if (phaseText) phaseText.textContent = phase;
    if (phasePill) {
      if (phase.includes('스위스')) {
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
      matchIndicator.textContent = `MATCH ${this.currentMatchIndex} / ${this.totalLadderMatches}`;
    }

    // 2. 카드 A 메타데이터 렌더링
    const titleA = document.getElementById('title-a');
    const channelA = document.getElementById('channel-a');
    const badgeEloA = document.getElementById('badge-elo-a');
    const statsRecordA = document.getElementById('stats-record-a');
    const statsMatchesA = document.getElementById('stats-matches-a');

    if (titleA) titleA.textContent = candA.title;
    if (channelA) channelA.textContent = candA.creator || 'YouTube';
    if (badgeEloA) badgeEloA.textContent = `ELO ${Math.round(candA.elo)}`;
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
    if (badgeEloB) badgeEloB.textContent = `ELO ${Math.round(candB.elo)}`;
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
        window.renderStreakIndicator('⚡', `[A] ${sA}연승 vs [B] ${sB}연승`, '라이벌 맞대결!', 'theme-rival');
      } else if (sA >= 2 && sA >= sB) {
        window.renderStreakIndicator('🔥', 'PLAYER A', `${sA}연승 질주 중!`, 'theme-a');
      } else if (sB >= 2 && sB > sA) {
        window.renderStreakIndicator('🔥', 'PLAYER B', `${sB}연승 질주 중!`, 'theme-b');
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
   * 투표 처리 및 Elo 점수 계산
   */
  handleVote(winnerSide) {
    if (this.isProcessingVote || !this.currentMatch) return;
    this.isProcessingVote = true;

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
    if (!this.currentMatch) return;
    const { candA, candB } = this.currentMatch;
    candA.matches++;
    candB.matches++;
    candA.opponents.add(candB.id);
    candB.opponents.add(candA.id);
    this.nextMatch();
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
      bracketManager.start();
    } else {
      // 단위 3 구현 전 fallback
      alert("골든 파이널 4강 진출자가 확정되었습니다!\n1위: " + finalFour[0].title + "\n2위: " + finalFour[1].title);
      this.app.switchView('setup');
    }
  }
}

// 전역 등록
window.TournamentEngine = TournamentEngine;
