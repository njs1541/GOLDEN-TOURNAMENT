/**
 * 골든 파이널 4강 토너먼트 브래킷 매니저 (단위 3)
 * Elo 래더 상위 1~4위가 진출하여 4강전(2매치) -> 결승전(1매치)으로 1등 확정
 */

class GoldenBracketManager {
  constructor(finalFour, allCandidates, app) {
    this.finalFour = finalFour; // [1위, 2위, 3위, 4위]
    this.allCandidates = allCandidates;
    this.app = app;

    // 브래킷 매치 구조
    // 4강 1경기: 1위 vs 4위
    // 4강 2경기: 2위 vs 3위
    // 결승전: 4강 1경기 승자 vs 4강 2경기 승자
    this.semi1 = {
      candA: this.finalFour[0],
      candB: this.finalFour[3],
      winner: null
    };
    this.semi2 = {
      candA: this.finalFour[1],
      candB: this.finalFour[2],
      winner: null
    };
    this.grandFinal = {
      candA: null,
      candB: null,
      winner: null
    };

    this.currentFinalStep = 'semi1'; // 'semi1' | 'semi2' | 'final' | 'done'
  }

  start() {
    this.renderBracketView();
    this.app.switchView('final');

    const btnStart = document.getElementById('btn-start-final-match');
    if (btnStart) {
      btnStart.textContent = "4강 제1경기 시작 (1위 vs 4위) 🔥";
      btnStart.onclick = () => this.runNextFinalMatch();
    }

    // 화면 리사이즈 시 SVG 커넥터 좌표 동기화
    window.addEventListener('resize', () => {
      if (this.app && this.app.currentView === 'final') {
        this.updateConnectors();
      }
    });
  }

  // 브래킷 개별 슬롯 렌더링 헬퍼
  renderSlotHtml(cand, rankText, isWinner, placeholderText = '승자 대기 중...', slotId = '') {
    if (!cand) {
      return `
        <div class="bracket-slot slot-waiting" ${slotId ? `id="${slotId}"` : ''}>
          <div class="slot-placeholder-thumb">⏳</div>
          <div class="slot-info">
            <span class="slot-title text-dim">${placeholderText}</span>
            <span class="slot-sub">결과 대기 중</span>
          </div>
        </div>
      `;
    }

    const thumbUrl = `https://img.youtube.com/vi/${cand.youtubeId}/mqdefault.jpg`;
    return `
      <div class="bracket-slot ${isWinner ? 'winner' : ''}" ${slotId ? `id="${slotId}"` : ''}>
        <div class="slot-thumb-box">
          <img src="${thumbUrl}" alt="썸네일" class="slot-thumb" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'40\\' height=\\'40\\' fill=\\'%23333\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'">
          ${rankText ? `<span class="slot-rank-tag">${rankText}</span>` : ''}
        </div>
        <div class="slot-info">
          <span class="slot-title" title="${cand.title}">${cand.title}</span>
          <div class="slot-meta">
            <span class="slot-elo">ELO ${Math.round(cand.elo)}</span>
            <span class="slot-record">${cand.wins}승 ${cand.losses}패</span>
          </div>
        </div>
        ${isWinner ? `<div class="slot-winner-tag">👑 결승 진출!</div>` : ''}
      </div>
    `;
  }

  renderBracketView() {
    const treeEl = document.getElementById('final-bracket-tree');
    if (!treeEl) return;

    const isSemi1Done = !!this.semi1.winner;
    const isSemi2Done = !!this.semi2.winner;
    const isFinalDone = !!this.grandFinal.winner;

    treeEl.innerHTML = `
      <!-- 4강 라운드 (좌측) -->
      <div class="bracket-round round-semifinals">
        <div class="round-header-badge">
          <span class="round-dot"></span>
          <span>SEMIFINALS (4강전)</span>
        </div>
        
        <!-- 4강 1경기 -->
        <div class="bracket-match-node ${isSemi1Done ? 'completed' : 'ready'}" id="node-semi-1">
          <div class="node-header">
            <span class="match-tag">MATCH 1</span>
            <span class="match-desc">1위 vs 4위</span>
          </div>
          <div class="node-slots">
            ${this.renderSlotHtml(this.semi1.candA, '1위', this.semi1.winner?.id === this.semi1.candA.id, '', 'slot-s1-a')}
            <div class="slot-vs-divider">VS</div>
            ${this.renderSlotHtml(this.semi1.candB, '4위', this.semi1.winner?.id === this.semi1.candB.id, '', 'slot-s1-b')}
          </div>
        </div>

        <!-- 4강 2경기 -->
        <div class="bracket-match-node ${isSemi2Done ? 'completed' : 'ready'}" id="node-semi-2">
          <div class="node-header">
            <span class="match-tag">MATCH 2</span>
            <span class="match-desc">2위 vs 3위</span>
          </div>
          <div class="node-slots">
            ${this.renderSlotHtml(this.semi2.candA, '2위', this.semi2.winner?.id === this.semi2.candA.id, '', 'slot-s2-a')}
            <div class="slot-vs-divider">VS</div>
            ${this.renderSlotHtml(this.semi2.candB, '3위', this.semi2.winner?.id === this.semi2.candB.id, '', 'slot-s2-b')}
          </div>
        </div>
      </div>

      <!-- 대진표 동적 네온 연결선 (이긴 노래로부터 결승전으로 흐르는 인터랙티브 SVG) -->
      <div class="bracket-connectors" id="bracket-connectors-wrapper">
        <svg id="bracket-svg-canvas" class="bracket-svg" width="100%" height="100%">
          <defs>
            <linearGradient id="gold-stream-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f5b041"/>
              <stop offset="100%" stop-color="#ffd700"/>
            </linearGradient>
            <filter id="gold-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <path id="path-s1-a" class="conn-path path-idle" />
          <path id="path-s1-b" class="conn-path path-idle" />
          <path id="path-s2-a" class="conn-path path-idle" />
          <path id="path-s2-b" class="conn-path path-idle" />
        </svg>
      </div>

      <!-- 결승전 라운드 (우측) -->
      <div class="bracket-round round-final">
        <div class="round-header-badge badge-grand-final">
          <span class="round-dot-gold"></span>
          <span>👑 GRAND FINAL (결승전)</span>
        </div>

        <div class="bracket-match-node node-final ${isFinalDone ? 'completed' : 'ready'}" id="node-grand-final">
          <div class="node-header node-header-final">
            <span class="match-tag-final">CHAMPIONSHIP</span>
            <span class="match-desc">왕중왕전 결승</span>
          </div>
          <div class="node-slots">
            ${this.renderSlotHtml(this.grandFinal.candA, this.grandFinal.candA ? '4강 1경기 승자' : '', this.grandFinal.winner?.id === this.grandFinal.candA?.id, '4강 1경기 승자 대기 중', 'slot-gf-a')}
            <div class="slot-vs-divider vs-final">FINAL VS</div>
            ${this.renderSlotHtml(this.grandFinal.candB, this.grandFinal.candB ? '4강 2경기 승자' : '', this.grandFinal.winner?.id === this.grandFinal.candB?.id, '4강 2경기 승자 대기 중', 'slot-gf-b')}
          </div>
        </div>
      </div>
    `;

    // 렌더링 직후 슬롯 좌표를 읽어와 정확한 1:1 연결선 드로잉
    this.updateConnectors();
  }

  updateConnectors() {
    requestAnimationFrame(() => {
      const wrapper = document.getElementById('bracket-connectors-wrapper');
      if (!wrapper) return;
      const wrapRect = wrapper.getBoundingClientRect();
      if (wrapRect.width === 0 || wrapRect.height === 0) return;

      const getSlotAnchor = (id, side = 'right') => {
        const el = document.getElementById(id);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: side === 'right' ? 0 : wrapRect.width,
          y: (rect.top + rect.height / 2) - wrapRect.top
        };
      };

      const s1A = getSlotAnchor('slot-s1-a', 'right');
      const s1B = getSlotAnchor('slot-s1-b', 'right');
      const s2A = getSlotAnchor('slot-s2-a', 'right');
      const s2B = getSlotAnchor('slot-s2-b', 'right');
      const gfA = getSlotAnchor('slot-gf-a', 'left');
      const gfB = getSlotAnchor('slot-gf-b', 'left');

      if (!s1A || !s1B || !s2A || !s2B || !gfA || !gfB) return;

      const makeBezier = (start, end) => {
        const dx = (end.x - start.x) * 0.55;
        return `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${end.x - dx} ${end.y}, ${end.x} ${end.y}`;
      };

      const pathS1A = document.getElementById('path-s1-a');
      const pathS1B = document.getElementById('path-s1-b');
      const pathS2A = document.getElementById('path-s2-a');
      const pathS2B = document.getElementById('path-s2-b');

      if (pathS1A) pathS1A.setAttribute('d', makeBezier(s1A, gfA));
      if (pathS1B) pathS1B.setAttribute('d', makeBezier(s1B, gfA));
      if (pathS2A) pathS2A.setAttribute('d', makeBezier(s2A, gfB));
      if (pathS2B) pathS2B.setAttribute('d', makeBezier(s2B, gfB));

      // 승리한 노래 슬롯에서 출발하는 선을 명확한 황금 네온으로 점등!
      const isWinnerS1A = this.semi1.winner && this.semi1.winner.id === this.semi1.candA.id;
      const isWinnerS1B = this.semi1.winner && this.semi1.winner.id === this.semi1.candB.id;
      const isWinnerS2A = this.semi2.winner && this.semi2.winner.id === this.semi2.candA.id;
      const isWinnerS2B = this.semi2.winner && this.semi2.winner.id === this.semi2.candB.id;

      if (pathS1A) {
        pathS1A.className.baseVal = `conn-path ${isWinnerS1A ? 'path-active-winner' : (this.semi1.winner ? 'path-eliminated' : 'path-idle')}`;
      }
      if (pathS1B) {
        pathS1B.className.baseVal = `conn-path ${isWinnerS1B ? 'path-active-winner' : (this.semi1.winner ? 'path-eliminated' : 'path-idle')}`;
      }
      if (pathS2A) {
        pathS2A.className.baseVal = `conn-path ${isWinnerS2A ? 'path-active-winner' : (this.semi2.winner ? 'path-eliminated' : 'path-idle')}`;
      }
      if (pathS2B) {
        pathS2B.className.baseVal = `conn-path ${isWinnerS2B ? 'path-active-winner' : (this.semi2.winner ? 'path-eliminated' : 'path-idle')}`;
      }
    });
  }

  runNextFinalMatch() {
    if (this.currentFinalStep === 'semi1') {
      this.playMatch(this.semi1.candA, this.semi1.candB, '4강 제1경기 (1위 vs 4위)', (winner) => {
        this.semi1.winner = winner;
        this.grandFinal.candA = winner;
        this.currentFinalStep = 'semi2';
        this.renderBracketView();
        this.app.switchView('final');
        const btnStart = document.getElementById('btn-start-final-match');
        if (btnStart) {
          btnStart.textContent = "4강 제2경기 시작 (2위 vs 3위) 🔥";
          btnStart.onclick = () => this.runNextFinalMatch();
        }
      });
    } else if (this.currentFinalStep === 'semi2') {
      this.playMatch(this.semi2.candA, this.semi2.candB, '4강 제2경기 (2위 vs 3위)', (winner) => {
        this.semi2.winner = winner;
        this.grandFinal.candB = winner;
        this.currentFinalStep = 'final';
        this.renderBracketView();
        this.app.switchView('final');
        const btnStart = document.getElementById('btn-start-final-match');
        if (btnStart) {
          btnStart.textContent = "🏆 GRAND FINAL 결승전 시작하기! 🏆";
          btnStart.onclick = () => this.runNextFinalMatch();
        }
      });
    } else if (this.currentFinalStep === 'final') {
      this.playMatch(this.grandFinal.candA, this.grandFinal.candB, '👑 골든 그랜드 파이널 (결승전)', (winner) => {
        this.grandFinal.winner = winner;
        this.currentFinalStep = 'done';
        this.finishTournament(winner);
      });
    }
  }

  playMatch(candA, candB, phaseTitle, onWon) {
    this.app.switchView('battle');

    // UI 헤더 및 뱃지 갱신
    const phasePill = document.getElementById('match-phase-badge');
    const phaseText = document.getElementById('phase-text');
    if (phasePill) phasePill.className = 'phase-pill pill-final';
    if (phaseText) phaseText.textContent = phaseTitle;

    // 메타데이터 렌더링
    document.getElementById('title-a').textContent = candA.title;
    document.getElementById('channel-a').textContent = candA.creator || 'YouTube';
    document.getElementById('badge-elo-a').textContent = `ELO ${Math.round(candA.elo)}`;
    document.getElementById('stats-record-a').textContent = `${candA.wins}승 ${candA.losses}패`;
    const statsMatchesA = document.getElementById('stats-matches-a');
    if (statsMatchesA) statsMatchesA.textContent = `${candA.matches}회 대결`;
    const linkDirectA = document.getElementById('link-direct-a');
    if (linkDirectA) linkDirectA.href = `https://www.youtube.com/watch?v=${candA.youtubeId}`;

    document.getElementById('title-b').textContent = candB.title;
    document.getElementById('channel-b').textContent = candB.creator || 'YouTube';
    document.getElementById('badge-elo-b').textContent = `ELO ${Math.round(candB.elo)}`;
    document.getElementById('stats-record-b').textContent = `${candB.wins}승 ${candB.losses}패`;
    const statsMatchesB = document.getElementById('stats-matches-b');
    if (statsMatchesB) statsMatchesB.textContent = `${candB.matches}회 대결`;
    const linkDirectB = document.getElementById('link-direct-b');
    if (linkDirectB) linkDirectB.href = `https://www.youtube.com/watch?v=${candB.youtubeId}`;

    // 실시간 예상 승률 계산 및 렌더링
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

    document.getElementById('current-match-indicator').textContent = phaseTitle;
    document.getElementById('streak-indicator').textContent = '⚡ 골든 파이널 진검승부!';

    // 4강/결승전에서는 스킵 및 4강 바로가기 버튼 숨김
    const btnSkip = document.getElementById('btn-battle-skip');
    const btnJump = document.getElementById('btn-jump-to-final');
    if (btnSkip) btnSkip.style.display = 'none';
    if (btnJump) btnJump.style.display = 'none';

    if (window.dualPlayer) {
      window.dualPlayer.loadMatch(candA, candB);
    }

    // 투표 버튼 일회성 바인딩 (타격감 플래시 포함)
    const btnA = document.getElementById('btn-vote-a');
    const btnB = document.getElementById('btn-vote-b');

    const handleFinalVote = (winnerCand, winnerSide) => {
      btnA.onclick = null;
      btnB.onclick = null;
      const winCard = document.getElementById(winnerSide === 'A' ? 'card-a' : 'card-b');
      if (winCard) winCard.classList.add('vote-win-flash');

      setTimeout(() => {
        // 하단 버튼 원상복구
        if (btnSkip) btnSkip.style.display = '';
        if (btnJump) btnJump.style.display = '';
        onWon(winnerCand);
      }, 250);
    };

    btnA.onclick = () => handleFinalVote(candA, 'A');
    btnB.onclick = () => handleFinalVote(candB, 'B');
  }

  finishTournament(champion) {
    if (window.dualPlayer) {
      window.dualPlayer.stopAll();
    }
    // 단위 4 티어메이커 호출
    if (window.TierMakerManager) {
      const tm = new window.TierMakerManager(champion, this.allCandidates, this.app);
      tm.render();
    } else {
      alert(`🎉 축하합니다! 최종 우승: ${champion.title}`);
      this.app.switchView('setup');
    }
  }
}

window.GoldenBracketManager = GoldenBracketManager;
