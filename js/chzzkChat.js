/**
 * 치지직(CHZZK) 실시간 채팅 투표 매니저
 * - 치지직 채널 ID 또는 방송 URL을 파싱하여 실시간 채팅 WebSocket 연결
 * - 스트리머 채널 ID를 기반으로 생방송 채팅방 ID(chatChannelId) 및 토큰을 안정적으로 자동 추출
 * - 로컬 프록시(/api/proxy) 및 공용 프록시 fallback을 통한 완벽한 CORS 제약 우회
 * - 시청자가 채팅창에 1, 2, A, B (!1, !2 등) 입력 시 실시간 투표 집계 (1인 1표 보장)
 * - Zero-Lag 60FPS 최적화: 최소 객체 할당 및 경량 이벤트 디스패치
 */

const STORAGE_CHZZK_CHANNEL_KEY = 'GOLDEN_TOURNAMENT_CHZZK_CHANNEL';
const STORAGE_CHZZK_POLL_SCOPE_KEY = 'GOLDEN_TOURNAMENT_CHZZK_POLL_SCOPE';
const STORAGE_CHZZK_CUSTOM_PROXY_KEY = 'GOLDEN_TOURNAMENT_CHZZK_CUSTOM_PROXY';

class ChzzkChatManager {
  constructor(app) {
    this.app = app;
    this.channelId = '';      // 스트리머 채널 ID (32자리 해시)
    this.chatChannelId = '';  // 생방송 채팅방 ID (예: N2kWtN)
    this.accessToken = '';    // 채팅 세션 토큰
    this.extraToken = '';
    this.channelName = '';    // 스트리머 닉네임
    this.liveTitle = '';      // 방송 제목
    this.customProxyUrl = ''; // 사용자 지정 CORS 프록시 URL
    
    this.ws = null;
    this.pingInterval = null;
    this.isConnected = false;
    this.isConnecting = false;

    // 투표 진행 범위 설정: 'all' (전체 토너먼트) | 'final_only' (4강전 & 결승전에서만)
    this.pollScope = 'all';

    // 투표 상태
    this.isPolling = false;
    this.votes = { A: 0, B: 0 };
    this.voters = new Set(); // 1대결당 1인 1회 투표 엄격 보장 (중복 투표 차단)

    // UI 콜백
    this.onVoteUpdate = null;
    this.onStatusChange = null;

    this.loadSavedSettings();
  }

  loadSavedSettings() {
    try {
      const savedChannel = localStorage.getItem(STORAGE_CHZZK_CHANNEL_KEY);
      if (savedChannel) {
        this.channelId = savedChannel;
      }
      const savedScope = localStorage.getItem(STORAGE_CHZZK_POLL_SCOPE_KEY);
      if (savedScope === 'final_only' || savedScope === 'all') {
        this.pollScope = savedScope;
      }
      const savedProxy = localStorage.getItem(STORAGE_CHZZK_CUSTOM_PROXY_KEY);
      if (savedProxy) {
        this.customProxyUrl = savedProxy;
      }
    } catch (e) {}
  }

  saveChannel(channelId) {
    this.channelId = channelId;
    try {
      localStorage.setItem(STORAGE_CHZZK_CHANNEL_KEY, channelId);
    } catch (e) {}
  }

  setPollScope(scope) {
    if (scope === 'final_only' || scope === 'all') {
      this.pollScope = scope;
      try {
        localStorage.setItem(STORAGE_CHZZK_POLL_SCOPE_KEY, scope);
      } catch (e) {}
    }
  }

  saveCustomProxy(proxyUrl) {
    this.customProxyUrl = (proxyUrl || '').trim();
    try {
      if (this.customProxyUrl) {
        localStorage.setItem(STORAGE_CHZZK_CUSTOM_PROXY_KEY, this.customProxyUrl);
      } else {
        localStorage.removeItem(STORAGE_CHZZK_CUSTOM_PROXY_KEY);
      }
    } catch (e) {}
  }

  getCustomProxy() {
    return this.customProxyUrl || '';
  }

  /**
   * 현재 단계(스위스/Elo 래더 vs 4강전/결승전)에서 시청자 투표가 허용되는지 판별
   */
  isPollAllowedForCurrentPhase(isFinalPhase = false) {
    if (this.pollScope === 'all') return true;
    if (this.pollScope === 'final_only') return Boolean(isFinalPhase);
    return true;
  }

  /**
   * 치지직 채널 URL 또는 ID 파싱
   * 지원 예시:
   * - 32자리 hex ID: a67b328bcc8eea4451ccfa754bc19ae1
   * - https://chzzk.naver.com/live/{channelId}
   * - https://chzzk.naver.com/{channelId}
   */
  parseChannelId(input) {
    if (!input) return null;
    const trimmed = String(input).trim();
    if (/^[a-f0-9]{32}$/i.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})/i);
    return match ? match[1] : null;
  }

  /**
   * 다중 프록시 및 로컬 서버를 활용한 범용 API 요청 헬퍼
   * - 사용자 정의 프록시 (Cloudflare Worker 등) 최우선 지원
   * - GitHub Pages(HTTPS) 환경 감지 및 안전한 다중 CORS 폴백 풀 구성
   * - HTTP 환경에서는 로컬 8000번 서버(start.bat) 자동 연결
   */
  async fetchWithProxyFallback(targetUrl) {
    const urlsToTry = [];
    const encodedTarget = encodeURIComponent(targetUrl);
    const isHttps = window.location.protocol === 'https:';
    const isGitHubPages = window.location.hostname.endsWith('github.io');

    // 0. 사용자가 직접 등록한 커스텀 프록시 (최우선)
    if (this.customProxyUrl) {
      let customUrl = this.customProxyUrl;
      if (customUrl.endsWith('=') || customUrl.includes('url=')) {
        customUrl = `${customUrl}${encodedTarget}`;
      } else if (customUrl.endsWith('/')) {
        customUrl = `${customUrl}${encodedTarget}`;
      } else {
        customUrl = `${customUrl}?url=${encodedTarget}`;
      }
      urlsToTry.push({
        type: 'custom-proxy',
        url: customUrl,
        timeout: 4000
      });
    }

    // 1. 현재 접속 오리진의 프록시 (/api/proxy) - 로컬 서버나 자체 호스팅 환경
    if (window.location.protocol.startsWith('http') && !isGitHubPages) {
      urlsToTry.push({
        type: 'current-origin-proxy',
        url: `${window.location.origin}/api/proxy?url=${encodedTarget}`,
        timeout: 1500
      });
    }

    // 2. 로컬 8000번 프록시 서버(start.bat) 탐색 (HTTP 및 HTTPS 공통 지원)
    // Chrome/Edge 등 최신 브라우저는 127.0.0.1/localhost를 안전한 로컬 사설 출처로 허용함
    if (window.location.port !== '8000') {
      urlsToTry.push({
        type: 'local-8000-ip',
        url: `http://127.0.0.1:8000/api/proxy?url=${encodedTarget}`,
        timeout: 1800
      });
      urlsToTry.push({
        type: 'local-8000-host',
        url: `http://localhost:8000/api/proxy?url=${encodedTarget}`,
        timeout: 1800
      });
    }

    // 3. 안정적인 공개 HTTPS CORS 프록시 게이트웨이들 순차 시도
    urlsToTry.push({
      type: 'codetabs-proxy',
      url: `https://api.codetabs.com/v1/proxy?quest=${encodedTarget}`,
      timeout: 3000
    });

    urlsToTry.push({
      type: 'allorigins-raw',
      url: `https://api.allorigins.win/raw?url=${encodedTarget}`,
      timeout: 3000
    });

    // 4. 브라우저 직접 요청 (네이버 API가 차후 직접 허용하거나 로컬 확장 프로그램 사용 시)
    urlsToTry.push({
      type: 'direct',
      url: targetUrl,
      timeout: 2000
    });

    let lastError = null;

    for (const attempt of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), attempt.timeout);

        const res = await fetch(attempt.url, {
          mode: 'cors',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (json && (json.code === 200 || json.content !== undefined)) {
            return json;
          }
        }
      } catch (err) {
        lastError = err;
      }
    }

    // 모든 시도 실패 시 환경에 맞춘 친절하고 구체적인 해결 가이드 메시지 생성
    if (isGitHubPages || isHttps) {
      throw new Error(
        `[GitHub Pages 환경 치지직 연동 안내]\n` +
        `GitHub 웹사이트(정적 호스팅)에서는 네이버의 보안 정책(CORS)으로 인해 브라우저 단독 호출이 차단됩니다.\n\n` +
        `💡 해결 방법 (2가지 중 택 1):\n` +
        `1. [추천] 치지직 연동 창의 [⚙️ 프록시 설정]을 열고 무료 Cloudflare Worker 프록시 주소를 입력하세요.\n` +
        `2. 프로그램을 다운로드 받아 내 PC에서 [start.bat]으로 실행하시면 별도 설정 없이 즉시 연동됩니다.`
      );
    } else {
      const isLiveServer = window.location.port === '5500' || (window.location.port && window.location.port !== '8000');
      if (isLiveServer) {
        throw new Error(
          `로컬 프록시 서버(start.bat)가 실행되어 있지 않습니다.\n\n` +
          `* 현재 [${window.location.host}] 환경에서 접속 중이십니다.\n` +
          `* 폴더 안의 [start.bat]을 더블 클릭하여 실행해 두시면 현재 화면에서도 치지직 실시간 연동이 즉시 가능합니다.`
        );
      } else {
        throw new Error(
          `로컬 프록시 서버(start.bat)를 실행해 주세요.\n` +
          `* [start.bat]을 실행하시면 치지직 실시간 채팅 서버에 CORS 차단 없이 즉시 연결됩니다.`
        );
      }
    }
  }


  /**
   * 1단계: 채널 생방송 상세 정보 조회 (chatChannelId 획득 및 방송 상태 판별)
   */
  async fetchLiveDetail(channelId) {
    const targetUrl = `https://api.chzzk.naver.com/service/v2/channels/${channelId}/live-detail`;
    const data = await this.fetchWithProxyFallback(targetUrl);

    if (!data || !data.content) {
      throw new Error('치지직 채널 정보를 불러오지 못했습니다. 채널 ID를 다시 확인해 주세요.');
    }

    const content = data.content;
    const isLive = content.status === 'OPEN';
    const chatChannelId = content.chatChannelId;

    if (!isLive || !chatChannelId) {
      const streamerName = content.channel ? content.channel.channelName : '스트리머';
      throw new Error(`[${streamerName}] 님이 현재 오프라인(방송 종료) 상태입니다.\n치지직은 생방송(LIVE ON) 중일 때만 실시간 채팅 서버가 열립니다.`);
    }

    this.chatChannelId = chatChannelId;
    this.liveTitle = content.liveTitle || '';
    if (content.channel && content.channel.channelName) {
      this.channelName = content.channel.channelName;
    }

    return content;
  }

  /**
   * 2단계: 생방송 채팅 접근 토큰 및 권한 정보 발급
   * 중요: 여기 들어가는 channelId는 스트리머 ID가 아니라 1단계에서 획득한 생방송 chatChannelId입니다!
   */
  async fetchChatTokens(chatChannelId) {
    const targetUrl = `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${chatChannelId}&chatType=STREAMING`;
    const data = await this.fetchWithProxyFallback(targetUrl);

    if (!data || !data.content || !data.content.accessToken) {
      throw new Error('치지직 채팅 토큰을 발급받지 못했습니다.');
    }

    this.accessToken = data.content.accessToken;
    this.extraToken = data.content.extraToken || '';
    return data.content;
  }

  /**
   * 치지직 채팅 연결 메인 메서드
   */
  async connect(channelInput) {
    const chId = this.parseChannelId(channelInput);
    if (!chId) {
      throw new Error('올바른 치지직 채널 ID (32자리 영문/숫자) 또는 방송 URL을 입력해 주세요.');
    }

    this.saveChannel(chId);
    this.isConnecting = true;

    try {
      // 1단계: 채널 생방송 상태 및 chatChannelId 확인
      this.notifyStatus('connecting', '치지직 생방송 상태 확인 중...');
      const liveInfo = await this.fetchLiveDetail(chId);

      // 2단계: 채팅 접근 토큰 발급
      this.notifyStatus('connecting', `[${this.channelName || '방송'}] 채팅 접근 토큰 발급 중...`);
      await this.fetchChatTokens(liveInfo.chatChannelId);

      // 3단계: 웹소켓 연결
      this.notifyStatus('connecting', '치지직 실시간 채팅 서버 접속 중...');
      this.initWebSocket();
    } catch (err) {
      this.isConnecting = false;
      this.isConnected = false;
      this.notifyStatus('error', err.message || '치지직 연결 실패');
      throw err;
    }
  }

  initWebSocket() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // 치지직 채팅 로드밸런싱 서버 목록 (1~3 중 랜덤 분산 연결)
    const serverNum = Math.floor(Math.random() * 3) + 1;
    const wsUrl = `wss://kr-ss${serverNum}.chat.naver.com/chat`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // 네이버 채팅 프로토콜 핸드셰이크: CMD 100 (CONNECT)
      const connectPayload = {
        ver: '2',
        cmd: 100,
        svcid: 'game',
        cid: this.chatChannelId,
        bdy: {
          uid: null, // 익명 시청자 모드로 접속 (읽기 전용)
          devType: 2001,
          accTkn: this.accessToken,
          auth: 'READ'
        },
        tid: 1
      };
      this.ws.send(JSON.stringify(connectPayload));

      // 20초 주기 PING 전송 (CMD 10000)
      this.pingInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ ver: '2', cmd: 10000 }));
        }
      }, 20000);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleSocketMessage(msg);
      } catch (e) {
        // 메시지 파싱 에러 무시
      }
    };

    this.ws.onerror = (error) => {
      this.notifyStatus('error', '채팅 서버 연결 오류');
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.isConnecting = false;
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.notifyStatus('disconnected', '채팅 연결 끊김');
    };
  }

  handleSocketMessage(msg) {
    // CMD 10100: CONNECT 인증 응답
    if (msg.cmd === 10100) {
      this.isConnected = true;
      this.isConnecting = false;
      const titleText = this.channelName ? `[${this.channelName}] ` : '';
      this.notifyStatus('connected', `${titleText}치지직 채팅 연동 완료 (실시간 수신 중)`);
      return;
    }

    // CMD 10000: PING / PONG
    if (msg.cmd === 10000) {
      return;
    }

    // CMD 93101: 실시간 채팅 메시지 리스트
    if (msg.cmd === 93101 && Array.isArray(msg.bdy)) {
      const len = msg.bdy.length;
      for (let i = 0; i < len; i++) {
        this.parseChatMessage(msg.bdy[i]);
      }
    }
  }

  /**
   * 시청자 채팅 메시지 파싱 및 투표 카운트 (Zero-Lag 초고속 정규식)
   */
  parseChatMessage(chatItem) {
    if (!this.isPolling) return; // 투표 활성화 상태일 때만 집계

    let messageText = '';
    let userId = chatItem.uid || null;

    try {
      if (chatItem.msg) {
        messageText = chatItem.msg.trim();
      }
      if (!userId && chatItem.profile) {
        const profile = typeof chatItem.profile === 'string' ? JSON.parse(chatItem.profile) : chatItem.profile;
        userId = profile.userIdHash || profile.nickname || null;
      }
    } catch (e) {}

    if (!messageText) return;
    if (!userId) userId = `anon_${Math.random()}`;

    // 투표 명령어 파싱
    // 좌측(A): 1, !1, 1., A, !A, A번, ㄱ, !ㄱ, 1번, 좌, 좌측, 왼, 왼쪽
    // 우측(B): 2, !2, 2., B, !B, B번, ㄴ, !ㄴ, 2번, 우, 우측, 오, 오른쪽
    let voteSide = null;
    const lower = messageText.toLowerCase();

    if (/^(1|!1|1\.|a|!a|a번|ㄱ|!ㄱ|1번|좌|좌측|왼|왼쪽)$/i.test(lower)) {
      voteSide = 'A';
    } else if (/^(2|!2|2\.|b|!b|b번|ㄴ|!ㄴ|2번|우|우측|오|오른쪽)$/i.test(lower)) {
      voteSide = 'B';
    }

    if (voteSide) {
      this.recordVote(userId, voteSide);
    }
  }

  recordVote(userId, side) {
    // 1대결당 1인 1회 투표 엄격 보장 (중복 투표 및 번복 차단)
    if (this.voters.has(userId)) {
      return;
    }

    this.votes[side] = (this.votes[side] || 0) + 1;
    this.voters.add(userId);

    this.notifyVoteUpdate();
  }

  // 투표 세션 시작
  startPoll() {
    this.isPolling = true;
    this.resetPoll();
    this.notifyVoteUpdate();
  }

  // 투표 세션 종료
  stopPoll() {
    this.isPolling = false;
    this.notifyVoteUpdate();
  }

  // 투표 집계 리셋 (새로운 대결 시작 시 호출)
  resetPoll() {
    this.votes.A = 0;
    this.votes.B = 0;
    this.voters.clear();
    this.notifyVoteUpdate();
  }

  // 현재 투표 통계 반환
  getPollStats() {
    const total = this.votes.A + this.votes.B;
    const percentA = total > 0 ? Math.round((this.votes.A / total) * 100) : 50;
    const percentB = total > 0 ? (100 - percentA) : 50;

    let leading = null;
    if (this.votes.A > this.votes.B) leading = 'A';
    else if (this.votes.B > this.votes.A) leading = 'B';

    return {
      votesA: this.votes.A,
      votesB: this.votes.B,
      total,
      percentA,
      percentB,
      leading,
      isPolling: this.isPolling
    };
  }

  // 모의 테스트 투표 (방송 시작 전 스트리머가 기능 검증)
  simulateVote(side, count = 1) {
    for (let i = 0; i < count; i++) {
      const dummyId = `test_user_${Math.random()}`;
      this.recordVote(dummyId, side);
    }
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.notifyStatus('disconnected', '연결 해제됨');
  }

  notifyVoteUpdate() {
    if (typeof this.onVoteUpdate === 'function') {
      this.onVoteUpdate(this.getPollStats());
    }
  }

  notifyStatus(status, text) {
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        status,
        text,
        isConnected: this.isConnected,
        isConnecting: this.isConnecting,
        channelName: this.channelName,
        liveTitle: this.liveTitle
      });
    }
  }
}

window.ChzzkChatManager = ChzzkChatManager;
