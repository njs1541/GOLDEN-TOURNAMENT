/**
 * YouTube Iframe Player 최적화 매니저
 * [Zero-Lag 원칙] iframe 엘리먼트를 매 라운드마다 재생성하지 않고,
 * 좌/우 2개의 플레이어 인스턴스를 영구 풀(Pool)로 재활용하여 GC 스파이크 차단
 */

class DualPlayerManager {
  constructor() {
    this.playerA = null;
    this.playerB = null;
    this.isApiReady = false;
    this.activePlayer = null; // 'A' | 'B' | null
    this.currentVideoA = null;
    this.currentVideoB = null;
    this.readyCallbacks = [];
  }

  // YouTube Iframe API 스크립트 로드
  init() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        this.onApiReady();
        resolve();
        return;
      }

      this.readyCallbacks.push(resolve);

      // 이미 스크립트 태그가 삽입되었는지 확인
      if (!document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
          this.onApiReady();
        };
      }
    });
  }

  onApiReady() {
    this.isApiReady = true;
    this.initPlayers();
    while (this.readyCallbacks.length > 0) {
      const cb = this.readyCallbacks.shift();
      cb();
    }
    // 대기 중인 매치가 있을 경우 즉시 로드
    if (this.pendingMatch) {
      const { videoA, videoB, autoplay } = this.pendingMatch;
      this.pendingMatch = null;
      this.loadMatch(videoA, videoB, autoplay);
    }
  }

  // 좌/우 고정 플레이어 인스턴스 초기화 (1회만 실행)
  initPlayers() {
    const isHttp = window.location.protocol.startsWith('http');
    const playerOptions = {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        enablejsapi: 1,
        modestbranding: 1,
        playsinline: 1
      },
      events: {
        onStateChange: (event) => this.handleStateChange(event),
        onError: (event) => this.handlePlayerError(event)
      }
    };

    if (isHttp && window.location.origin && window.location.origin !== 'null') {
      playerOptions.playerVars.origin = window.location.origin;
    }

    if (!this.playerA && document.getElementById('player-a-iframe')) {
      this.playerA = new YT.Player('player-a-iframe', {
        ...playerOptions,
        events: {
          ...playerOptions.events,
          onStateChange: (e) => this.handleStateChange(e, 'A'),
          onError: (e) => this.handlePlayerError(e, 'A')
        }
      });
    }

    if (!this.playerB && document.getElementById('player-b-iframe')) {
      this.playerB = new YT.Player('player-b-iframe', {
        ...playerOptions,
        events: {
          ...playerOptions.events,
          onStateChange: (e) => this.handleStateChange(e, 'B'),
          onError: (e) => this.handlePlayerError(e, 'B')
        }
      });
    }
  }

  // 한쪽 영상 재생 시 반대쪽 영상 자동 일시정지 (동시 소리 중첩 방지)
  handleStateChange(event, side) {
    if (event.data === YT.PlayerState.PLAYING) {
      if (side === 'A' && this.playerB && typeof this.playerB.pauseVideo === 'function') {
        try { this.playerB.pauseVideo(); } catch (e) {}
      } else if (side === 'B' && this.playerA && typeof this.playerA.pauseVideo === 'function') {
        try { this.playerA.pauseVideo(); } catch (e) {}
      }
      this.activePlayer = side;
    }
  }

  handlePlayerError(event, side) {
    console.warn(`[DualPlayerManager] Player ${side} Error code:`, event.data);
    const cardEl = document.getElementById(`card-${side.toLowerCase()}`);
    const video = side === 'A' ? this.currentVideoA : this.currentVideoB;

    if (cardEl && video) {
      cardEl.classList.add('embed-error');
      const loader = document.getElementById(`loader-${side.toLowerCase()}`);
      if (loader) {
        loader.classList.add('active');
        const thumbUrl = `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`;
        loader.innerHTML = `
          <div class="embed-error-notice" style="background: linear-gradient(rgba(10,11,16,0.85), rgba(10,11,16,0.92)), url('${thumbUrl}') center/cover no-repeat;">
            <div style="font-size:32px;margin-bottom:8px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.8));">⚠️</div>
            <p style="font-size:14px;font-weight:800;color:#ff6b6b;margin-bottom:4px;">YouTube 외부 재생 제한 영상</p>
            <p style="font-size:12px;color:#94a3b8;margin-bottom:14px;">(원작자의 임베드 보안 정책)</p>
            <a href="https://www.youtube.com/watch?v=${video.youtubeId}" target="_blank" rel="noopener noreferrer" class="btn-direct-hero">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              YouTube에서 직접 듣기 ↗
            </a>
          </div>
        `;
      }
    }
  }

  // 매치 로드: 기존 iframe 객체를 버리지 않고 비디오 ID만 즉시 전환 (GC 0)
  loadMatch(videoA, videoB, autoplay = false) {
    this.currentVideoA = videoA;
    this.currentVideoB = videoB;

    // 플레이어가 아직 준비되지 않았다면 pendingMatch에 저장하고 대기
    if (!this.playerA || !this.playerB || typeof this.playerA.cueVideoById !== 'function') {
      this.pendingMatch = { videoA, videoB, autoplay };
      // 만약 iframe 컨테이너가 비어있다면 즉시 표준 iframe src로 fallback 주입
      this.injectFallbackIframe('player-a-iframe', videoA.youtubeId);
      this.injectFallbackIframe('player-b-iframe', videoB.youtubeId);
      return;
    }

    // 양쪽 에러 상태 및 로더 초기화
    document.getElementById('card-a')?.classList.remove('embed-error');
    document.getElementById('card-b')?.classList.remove('embed-error');
    const loaderA = document.getElementById('loader-a');
    const loaderB = document.getElementById('loader-b');
    if (loaderA) {
      loaderA.classList.remove('active');
      loaderA.innerHTML = '<div class="spinner"></div>';
    }
    if (loaderB) {
      loaderB.classList.remove('active');
      loaderB.innerHTML = '<div class="spinner"></div>';
    }

    const cueOrPlay = (player, video, containerId) => {
      if (!player || typeof player.cueVideoById !== 'function') {
        this.injectFallbackIframe(containerId, video.youtubeId);
        return;
      }
      try {
        const payload = {
          videoId: video.youtubeId,
          startSeconds: video.startSec || 0
        };
        if (autoplay) {
          player.loadVideoById(payload);
        } else {
          player.cueVideoById(payload);
        }
      } catch (err) {
        console.error("비디오 로드 오류:", err);
        this.injectFallbackIframe(containerId, video.youtubeId);
      }
    };

    cueOrPlay(this.playerA, videoA, 'player-a-iframe');
    cueOrPlay(this.playerB, videoB, 'player-b-iframe');
  }

  injectFallbackIframe(containerId, youtubeId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    // 태그가 iframe이 아니거나 비어있을 때
    if (el.tagName !== 'IFRAME') {
      el.innerHTML = `
        <iframe 
          width="100%" 
          height="100%" 
          src="https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&rel=0&playsinline=1" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen>
        </iframe>
      `;
    } else {
      el.src = `https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&rel=0&playsinline=1`;
    }
  }

  // 양쪽 모두 정지
  stopAll() {
    try {
      if (this.playerA && typeof this.playerA.pauseVideo === 'function') this.playerA.pauseVideo();
      if (this.playerB && typeof this.playerB.pauseVideo === 'function') this.playerB.pauseVideo();
    } catch (e) {}
  }
}

// 전역 싱글턴 인스턴스
window.dualPlayer = new DualPlayerManager();
