/**
 * 명예의 전당 & 인터랙티브 티어표 매니저 (단위 4)
 * 1위 챔피언 연출 및 S/A/B/C/D 마노사바 스타일 티어 차트
 */

class TierMakerManager {
  constructor(champion, allCandidates, app) {
    this.champion = champion;
    this.candidates = [...allCandidates].sort((a, b) => b.elo - a.elo);
    this.app = app;
  }

  render() {
    this.app.switchView('result');

    // 1. 1위 우승자 세리머니 카드 렌더링
    const winnerCard = document.getElementById('winner-video-card');
    if (winnerCard && this.champion) {
      const thumbUrl = `https://img.youtube.com/vi/${this.champion.youtubeId}/hqdefault.jpg`;
      winnerCard.innerHTML = `
        <div style="position:relative; aspect-ratio:16/9; border-radius:12px; overflow:hidden; margin-bottom:16px;">
          <img src="${thumbUrl}" alt="우승 영상" style="width:100%; height:100%; object-fit:cover;">
          <a href="https://www.youtube.com/watch?v=${this.champion.youtubeId}" target="_blank" rel="noopener noreferrer" 
             style="position:absolute; inset:0; background:rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; text-decoration:none; color:#fff; font-size:18px; font-weight:800; transition:background 0.2s;">
            ▶ YouTube에서 바로 감상하기
          </a>
        </div>
        <h3 style="font-size:20px; font-weight:800; margin-bottom:6px; color:var(--gold-primary);">${this.champion.title}</h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:10px;">${this.champion.creator || 'YouTube'}</p>
        <div style="display:flex; justify-content:center; gap:16px; font-size:13px; color:var(--text-main);">
          <span>🏆 최종 ELO: <strong>${Math.round(this.champion.elo)}</strong></span>
          <span>전적: <strong>${this.champion.wins}승 ${this.champion.losses}패</strong></span>
          <span>승률: <strong>${this.champion.matches > 0 ? Math.round((this.champion.wins / this.champion.matches) * 100) : 0}%</strong></span>
        </div>
      `;
    }

    // 2. S, A, B, C, D 티어 보드 자동 분배 렌더링
    this.renderTierBoard();

    // 3. 복사 및 이미지 다운로드 버튼 바인딩
    const btnExport = document.getElementById('btn-export-ranking');
    if (btnExport) {
      btnExport.onclick = () => this.copyRankingToClipboard();
    }
    const btnDownload = document.getElementById('btn-download-image');
    if (btnDownload) {
      btnDownload.onclick = () => this.downloadTierImage();
    }
  }

  renderTierBoard() {
    const boardEl = document.getElementById('tier-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    const tiers = [
      { grade: 'S', labelClass: 'tier-s', minPercentile: 0.85 },
      { grade: 'A', labelClass: 'tier-a', minPercentile: 0.65 },
      { grade: 'B', labelClass: 'tier-b', minPercentile: 0.40 },
      { grade: 'C', labelClass: 'tier-c', minPercentile: 0.20 },
      { grade: 'D', labelClass: 'tier-d', minPercentile: 0.00 }
    ];

    const total = this.candidates.length;

    // 각 티어별 드롭존 생성
    tiers.forEach((tier, tIdx) => {
      const row = document.createElement('div');
      row.className = 'tier-row';
      row.innerHTML = `
        <div class="tier-label ${tier.labelClass}">${tier.grade}</div>
        <div class="tier-items-dropzone" data-tier="${tier.grade}" id="dropzone-${tier.grade}"></div>
      `;
      boardEl.appendChild(row);

      const dropzone = row.querySelector('.tier-items-dropzone');
      this.setupDropzone(dropzone);
    });

    // 점수 순으로 티어에 아이템 배치
    this.candidates.forEach((cand, idx) => {
      const percentile = 1 - (idx / total);
      let targetTier = 'D';
      if (percentile >= 0.85) targetTier = 'S';
      else if (percentile >= 0.65) targetTier = 'A';
      else if (percentile >= 0.40) targetTier = 'B';
      else if (percentile >= 0.20) targetTier = 'C';

      const dropzone = document.getElementById(`dropzone-${targetTier}`);
      if (dropzone) {
        const chip = this.createChip(cand);
        dropzone.appendChild(chip);
      }
    });
  }

  createChip(cand) {
    const chip = document.createElement('div');
    chip.className = 'tier-chip';
    chip.draggable = true;
    chip.dataset.id = cand.id;
    chip.dataset.title = cand.title;

    chip.innerHTML = `
      <img src="https://img.youtube.com/vi/${cand.youtubeId}/default.jpg" alt="thumb">
      <span class="tier-chip-title">${cand.title}</span>
      <span class="tier-chip-elo">${Math.round(cand.elo)}</span>
    `;

    // 드래그 앤 드롭 이벤트
    chip.addEventListener('dragstart', (e) => {
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', cand.id);
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
    });

    return chip;
  }

  setupDropzone(dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.background = 'rgba(255, 255, 255, 0.08)';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.background = '';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.background = '';
      const draggingEl = document.querySelector('.tier-chip.dragging');
      if (draggingEl) {
        dropzone.appendChild(draggingEl);
      }
    });
  }

  copyRankingToClipboard() {
    let text = `🏆 [스위스-Elo 골든 토너먼트 최종 순위 결과]\n`;
    text += `👑 1위 우승: ${this.champion.title}\n\n`;

    const tiers = ['S', 'A', 'B', 'C', 'D'];
    tiers.forEach(t => {
      const dropzone = document.getElementById(`dropzone-${t}`);
      if (dropzone) {
        const chips = dropzone.querySelectorAll('.tier-chip');
        if (chips.length > 0) {
          text += `[${t} 티어]\n`;
          chips.forEach(chip => {
            text += `- ${chip.dataset.title} (${chip.querySelector('.tier-chip-elo').textContent}점)\n`;
          });
          text += `\n`;
        }
      }
    });

    navigator.clipboard.writeText(text).then(() => {
      alert("전체 순위표 텍스트가 클립보드에 복사되었습니다! 친구나 커뮤니티에 공유해보세요.");
    }).catch(() => {
      alert("클립보드 복사에 실패했습니다.");
    });
  }

  downloadTierImage() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = 1000;
    const headerHeight = 120;
    const rowHeight = 90;
    const tierList = [
      { name: 'S', color: '#ef4444' },
      { name: 'A', color: '#f97316' },
      { name: 'B', color: '#eab308' },
      { name: 'C', color: '#10b981' },
      { name: 'D', color: '#3b82f6' }
    ];

    canvas.width = width;
    canvas.height = headerHeight + (rowHeight * tierList.length) + 40;

    // 1. 다크 배경 채우기
    ctx.fillStyle = '#0a0b10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. 상단 헤더
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 26px "Noto Sans KR", sans-serif';
    ctx.fillText('🏆 SWISS-ELO GOLDEN TOURNAMENT RESULT', 40, 50);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px "Noto Sans KR", sans-serif';
    ctx.fillText(`👑 우승: ${this.champion ? this.champion.title : 'Champion'} (ELO: ${Math.round(this.champion?.elo || 1200)})`, 40, 85);

    // 3. 티어별 렌더링
    tierList.forEach((tier, idx) => {
      const y = headerHeight + (idx * rowHeight);

      // 티어 라벨 박스
      ctx.fillStyle = tier.color;
      ctx.fillRect(40, y, 70, rowHeight - 8);

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 28px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tier.name, 75, y + (rowHeight - 8) / 2);

      // 티어 아이템 영역 배경
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fillRect(115, y, width - 155, rowHeight - 8);

      // 현재 DOM에 들어있는 해당 티어 칩들 텍스트 그리기
      const dropzone = document.getElementById(`dropzone-${tier.name}`);
      const chips = dropzone ? dropzone.querySelectorAll('.tier-chip') : [];

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let xOffset = 130;

      chips.forEach((chip) => {
        if (xOffset > width - 180) return; // 폭 초과 방지
        const title = chip.dataset.title || '';
        const elo = chip.querySelector('.tier-chip-elo')?.textContent || '';

        // 칩 배경
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        const textToDraw = `${title.slice(0, 12)}.. (${elo})`;
        ctx.font = '13px "Noto Sans KR", sans-serif';
        const textWidth = ctx.measureText(textToDraw).width;

        ctx.fillRect(xOffset, y + 15, textWidth + 16, rowHeight - 38);
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(textToDraw, xOffset + 8, y + (rowHeight - 8) / 2);

        xOffset += textWidth + 24;
      });
    });

    // 이미지 다운로드 트리거
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `golden_tournament_tier_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

window.TierMakerManager = TierMakerManager;
