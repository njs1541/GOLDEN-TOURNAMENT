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
  }

  renderBracketView() {
    const treeEl = document.getElementById('final-bracket-tree');
    if (!treeEl) return;

    treeEl.innerHTML = `
      <div class="bracket-round">
        <h4 style="font-size: 13px; color: var(--gold-primary); margin-bottom: 12px;">SEMIFINALS (4강전)</h4>
        
        <!-- 4강 1경기 -->
        <div class="bracket-match-node" id="node-semi-1">
          <div class="bracket-slot ${this.semi1.winner?.id === this.semi1.candA.id ? 'winner' : ''}">
            <span>1위. ${this.semi1.candA.title}</span>
            <span style="color:var(--gold-primary)">ELO ${Math.round(this.semi1.candA.elo)}</span>
          </div>
          <div class="bracket-slot ${this.semi1.winner?.id === this.semi1.candB.id ? 'winner' : ''}">
            <span>4위. ${this.semi1.candB.title}</span>
            <span style="color:var(--gold-primary)">ELO ${Math.round(this.semi1.candB.elo)}</span>
          </div>
        </div>

        <!-- 4강 2경기 -->
        <div class="bracket-match-node" id="node-semi-2">
          <div class="bracket-slot ${this.semi2.winner?.id === this.semi2.candA.id ? 'winner' : ''}">
            <span>2위. ${this.semi2.candA.title}</span>
            <span style="color:var(--gold-primary)">ELO ${Math.round(this.semi2.candA.elo)}</span>
          </div>
          <div class="bracket-slot ${this.semi2.winner?.id === this.semi2.candB.id ? 'winner' : ''}">
            <span>3위. ${this.semi2.candB.title}</span>
            <span style="color:var(--gold-primary)">ELO ${Math.round(this.semi2.candB.elo)}</span>
          </div>
        </div>
      </div>

      <!-- 결승전 -->
      <div class="bracket-round">
        <h4 style="font-size: 13px; color: var(--accent-rose); margin-bottom: 12px;">GRAND FINAL (결승전)</h4>
        <div class="bracket-match-node" id="node-grand-final">
          <div class="bracket-slot ${this.grandFinal.winner?.id === this.grandFinal.candA?.id ? 'winner' : ''}">
            <span>${this.grandFinal.candA ? this.grandFinal.candA.title : '4강 1경기 승자'}</span>
          </div>
          <div class="bracket-slot ${this.grandFinal.winner?.id === this.grandFinal.candB?.id ? 'winner' : ''}">
            <span>${this.grandFinal.candB ? this.grandFinal.candB.title : '4강 2경기 승자'}</span>
          </div>
        </div>
      </div>
    `;
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
    const linkDirectA = document.getElementById('link-direct-a');
    if (linkDirectA) linkDirectA.href = `https://www.youtube.com/watch?v=${candA.youtubeId}`;

    document.getElementById('title-b').textContent = candB.title;
    document.getElementById('channel-b').textContent = candB.creator || 'YouTube';
    document.getElementById('badge-elo-b').textContent = `ELO ${Math.round(candB.elo)}`;
    document.getElementById('stats-record-b').textContent = `${candB.wins}승 ${candB.losses}패`;
    const linkDirectB = document.getElementById('link-direct-b');
    if (linkDirectB) linkDirectB.href = `https://www.youtube.com/watch?v=${candB.youtubeId}`;

    document.getElementById('current-match-indicator').textContent = phaseTitle;
    document.getElementById('streak-indicator').textContent = '⚡ 골든 파이널 진검승부!';

    if (window.dualPlayer) {
      window.dualPlayer.loadMatch(candA, candB);
    }

    // 투표 버튼 일회성 바인딩
    const btnA = document.getElementById('btn-vote-a');
    const btnB = document.getElementById('btn-vote-b');

    btnA.onclick = () => {
      btnA.onclick = null;
      btnB.onclick = null;
      onWon(candA);
    };

    btnB.onclick = () => {
      btnA.onclick = null;
      btnB.onclick = null;
      onWon(candB);
    };
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
