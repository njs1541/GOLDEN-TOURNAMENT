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

  // 썸네일 이미지 비동기 로드 헬퍼 (CORS 및 실패 안전 처리)
  loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  // 캔버스 라운드 사각형 헬퍼
  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  // 챔피언 영역부터 전체 영상 종합 티어표까지 통합 고해상도 이미지 다운로드
  async downloadTierImage() {
    const btnDownload = document.getElementById('btn-download-image');
    let originalBtnText = '';
    if (btnDownload) {
      originalBtnText = btnDownload.innerHTML;
      btnDownload.disabled = true;
      btnDownload.innerHTML = `<span>⏳</span> 고화질 이미지 생성 중...`;
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const width = 1240;
      const championAreaHeight = 360;
      const tierHeaderHeight = 60;
      const tierRowHeight = 95;
      const tierList = [
        { name: 'S', color: '#ef4444' },
        { name: 'A', color: '#f97316' },
        { name: 'B', color: '#eab308' },
        { name: 'C', color: '#10b981' },
        { name: 'D', color: '#3b82f6' }
      ];

      canvas.width = width;
      canvas.height = championAreaHeight + tierHeaderHeight + (tierRowHeight * tierList.length) + 40;

      // 1. 다크 프리미엄 배경 채우기
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#0a0b12');
      bgGrad.addColorStop(0.35, '#0e111a');
      bgGrad.addColorStop(1, '#08090d');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 상단 골드 라이트 글로우 효과
      const glowGrad = ctx.createRadialGradient(width / 2, 80, 20, width / 2, 80, 500);
      glowGrad.addColorStop(0, 'rgba(245, 176, 65, 0.14)');
      glowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, 400);

      // ================= 2. 챔피언 영역 (우승자 세리머니) =================
      ctx.save();
      // 헤드라인
      ctx.fillStyle = '#f5b041';
      ctx.font = 'bold 15px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '3px';
      ctx.fillText('👑 GOLDEN TOURNAMENT 2026', width / 2, 40);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Outfit", sans-serif';
      ctx.fillText('CHAMPION OF THE TOURNAMENT', width / 2, 74);

      // 챔피언 카드 배경 박스
      const champCardX = 80;
      const champCardY = 96;
      const champCardW = width - 160;
      const champCardH = 220;

      ctx.fillStyle = 'rgba(255, 215, 0, 0.04)';
      this.drawRoundedRect(ctx, champCardX, champCardY, champCardW, champCardH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 176, 65, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 우승 썸네일 로드 & 그리기
      if (this.champion) {
        const thumbUrl = `https://img.youtube.com/vi/${this.champion.youtubeId}/hqdefault.jpg`;
        const champImg = await this.loadImage(thumbUrl);

        const thumbX = champCardX + 24;
        const thumbY = champCardY + 20;
        const thumbW = 320;
        const thumbH = 180;

        if (champImg) {
          ctx.save();
          this.drawRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 12);
          ctx.clip();
          ctx.drawImage(champImg, thumbX, thumbY, thumbW, thumbH);
          ctx.restore();

          // 썸네일 테두리
          this.drawRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 12);
          ctx.strokeStyle = 'rgba(245, 176, 65, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#111';
          this.drawRoundedRect(ctx, thumbX, thumbY, thumbW, thumbH, 12);
          ctx.fill();
        }

        // 챔피언 텍스트 정보
        const infoX = thumbX + thumbW + 36;
        ctx.textAlign = 'left';

        // 챔피언 타이틀
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
        const titleText = this.champion.title.length > 34 ? this.champion.title.slice(0, 32) + '..' : this.champion.title;
        ctx.fillText(titleText, infoX, champCardY + 60);

        // 채널명
        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px "Noto Sans KR", sans-serif';
        ctx.fillText(`채널: ${this.champion.creator || 'YouTube'}`, infoX, champCardY + 95);

        // 스탯 뱃지들
        const eloVal = Math.round(this.champion.elo || 1200);
        const winRate = this.champion.matches > 0 ? Math.round((this.champion.wins / this.champion.matches) * 100) : 100;
        const recordStr = `${this.champion.wins || 0}승 ${this.champion.losses || 0}패`;

        // 뱃지 1: 최종 ELO
        ctx.fillStyle = 'rgba(245, 176, 65, 0.15)';
        this.drawRoundedRect(ctx, infoX, champCardY + 125, 170, 38, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245, 176, 65, 0.4)';
        ctx.stroke();
        ctx.fillStyle = '#f5b041';
        ctx.font = 'bold 15px "Outfit", sans-serif';
        ctx.fillText(`🏆 ELO: ${eloVal}`, infoX + 16, champCardY + 149);

        // 뱃지 2: 전적
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this.drawRoundedRect(ctx, infoX + 185, champCardY + 125, 140, 38, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 14px "Noto Sans KR", sans-serif';
        ctx.fillText(`전적: ${recordStr}`, infoX + 200, champCardY + 149);

        // 뱃지 3: 승률
        ctx.fillStyle = 'rgba(0, 242, 254, 0.1)';
        this.drawRoundedRect(ctx, infoX + 340, champCardY + 125, 130, 38, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
        ctx.stroke();
        ctx.fillStyle = '#00f2fe';
        ctx.font = 'bold 14px "Outfit", sans-serif';
        ctx.fillText(`승률: ${winRate}%`, infoX + 355, champCardY + 149);
      }
      ctx.restore();

      // ================= 3. 전체 영상 종합 티어표 헤더 =================
      const tierStartY = championAreaHeight + 20;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(80, tierStartY, width - 160, 1);

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 20px "Noto Sans KR", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('전체 영상 종합 티어표 (Tier Map)', 80, tierStartY + 38);

      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Noto Sans KR", sans-serif';
      ctx.fillText('조기 탈락 없는 스위스-Elo 래더 리그 최종 순위 랭킹', 430, tierStartY + 38);
      ctx.restore();

      // ================= 4. S/A/B/C/D 티어별 행 렌더링 =================
      const rowsStartY = tierStartY + tierHeaderHeight;

      // 썸네일 이미지 사전 로드 캐시
      const thumbCache = {};
      const dropzoneElements = tierList.map(t => ({
        tier: t,
        chips: document.getElementById(`dropzone-${t.name}`)?.querySelectorAll('.tier-chip') || []
      }));

      // 모든 칩의 썸네일 이미지 로드
      for (const group of dropzoneElements) {
        for (const chip of group.chips) {
          const imgEl = chip.querySelector('.tier-chip-thumb');
          if (imgEl && imgEl.src && !thumbCache[imgEl.src]) {
            thumbCache[imgEl.src] = await this.loadImage(imgEl.src);
          }
        }
      }

      tierList.forEach((tier, idx) => {
        const y = rowsStartY + (idx * tierRowHeight);

        // 티어 등급 사각형 뱃지
        ctx.fillStyle = tier.color;
        this.drawRoundedRect(ctx, 80, y, 76, tierRowHeight - 12, 10);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.font = '900 32px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tier.name, 80 + 38, y + (tierRowHeight - 12) / 2);

        // 티어 드롭존 배경 트랙
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
        this.drawRoundedRect(ctx, 166, y, width - 246, tierRowHeight - 12, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 칩들 렌더링
        const group = dropzoneElements.find(g => g.tier.name === tier.name);
        const chips = group ? group.chips : [];

        let chipX = 178;
        const chipY = y + 8;
        const chipW = 168;
        const chipH = tierRowHeight - 28;

        chips.forEach((chip) => {
          if (chipX + chipW > width - 90) return; // 오른쪽 넘침 방지

          const title = chip.dataset.title || chip.querySelector('.tier-chip-title')?.textContent || '영상';
          const elo = chip.querySelector('.tier-chip-elo')?.textContent || '';
          const imgEl = chip.querySelector('.tier-chip-thumb');
          const chipImg = imgEl ? thumbCache[imgEl.src] : null;

          // 칩 배경 카드
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          this.drawRoundedRect(ctx, chipX, chipY, chipW, chipH, 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // 칩 썸네일
          const thumbCardW = 44;
          const thumbCardH = 44;
          const thumbCardX = chipX + 6;
          const thumbCardY = chipY + (chipH - thumbCardH) / 2;

          if (chipImg) {
            ctx.save();
            this.drawRoundedRect(ctx, thumbCardX, thumbCardY, thumbCardW, thumbCardH, 6);
            ctx.clip();
            ctx.drawImage(chipImg, thumbCardX, thumbCardY, thumbCardW, thumbCardH);
            ctx.restore();
          } else {
            ctx.fillStyle = '#222';
            this.drawRoundedRect(ctx, thumbCardX, thumbCardY, thumbCardW, thumbCardH, 6);
            ctx.fill();
          }

          // 칩 텍스트
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';

          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 11.5px "Noto Sans KR", sans-serif';
          const shortTitle = title.length > 10 ? title.slice(0, 9) + '..' : title;
          ctx.fillText(shortTitle, chipX + thumbCardW + 12, chipY + 12);

          ctx.fillStyle = '#f5b041';
          ctx.font = 'bold 11px "Outfit", monospace';
          ctx.fillText(elo, chipX + thumbCardW + 12, chipY + 32);

          chipX += chipW + 10;
        });
      });

      // 5. 다운로드 트리거
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `golden_tournament_championship_report_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('티어표 이미지 생성 중 오류 발생:', err);
      alert('티어표 이미지 생성 중 오류가 발생했습니다. 브라우저 콘솔을 확인해 주세요.');
    } finally {
      if (btnDownload) {
        btnDownload.disabled = false;
        btnDownload.innerHTML = originalBtnText;
      }
    }
  }
}

window.TierMakerManager = TierMakerManager;
