/**
 * 치지직(CHZZK) 실시간 채팅 투표 매니저
 * - 치지직 채널 ID 또는 방송 URL을 파싱하여 채팅 WebSocket 연결
 * - 시청자가 채팅창에 1, 2, A, B (!1, !2 등) 입력 시 실시간 투표 집계
 * - CORS 보안 제약 우회를 위한 멀티 프록시 fallback 및 모의 테스트 투표 지원
 */

const STORAGE_CHZZK_CHANNEL_KEY = 'GOLDEN_TOURNAMENT_CHZZK_CHANNEL';

class ChzzkChatManager {
  constructor(app) {
    this.app = app;
    this.channelId = '';
    this.chatChannelId = '';
    this.accessToken = '';
    this.extraToken = '';
    this.ws = null;
    this.pingInterval = null;
    this.isConnected = false;
    this.isConnecting = false;

    // 투표 상태
    this.isPolling = false;
    this.votes = { A: 0, B: 0 };
    this.voters = new Map(); // userId -> 'A' | 'B' (중복 투표 방지 및 변경 허용)

    // UI 업데이트 콜백
    this.onVoteUpdate = null;
    this.onStatusChange = null;

    this.loadSavedChannel();
  }

  loadSavedChannel() {
    try {
      const saved = localStorage.getItem(STORAGE_CHZZK_CHANNEL_KEY);
      if (saved) {
        this.channelId = saved;
      }
    } catch (e) {}
  }

  saveChannel(channelId) {
    this.channelId = channelId;
    try {
      localStorage.setItem(STORAGE_CHZZK_CHANNEL_KEY, channelId);
    } catch (e) {}
  }

  /**
   * 치지직 채널 URL 또는 ID 파싱
   * 지원 예시:
   * - 32자리 hex ID: 671295b9d3164a...
   * - https://chzzk.naver.com/live/{channelId}
   * - https://chzzk.naver.com/{channelId}
   */
  parseChannelId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-f0-9]{32}$/i.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/chzzk\.naver\.com\/(?:live\/)?([a-f0-9]{32})/i);
    return match ? match[1] : null;
  }

  /**
   * 치지직 채팅 토큰 및 채팅방 ID 발급
   */
  async fetchChatTokens(channelId) {
    const targetUrl = `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${channelId}&chatType=STREAMING`;
    
    // 1단계: 브라우저 직접 fetch 시도
    try {
      const res = await fetch(targetUrl, { mode: 'cors' });
      if (res.ok) {
        const json = await res.json();
        if (json && json.content) {
          return json.content;
        }
      }
    } catch (e) {
      console.warn('[ChzzkChat] 직접 통신 CORS 제한 감지, 안전 프록시로 fallback 전환...');
    }

    // 2단계: 공개 CORS 프록시 fallback (AllOrigins)
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && json.content) {
          return json.content;
        }
      }
    } catch (e) {
      console.warn('[ChzzkChat] AllOrigins 프록시 시도 실패, 2차 프록시 시도...');
    }

    // 3단계: 2차 CORS 프록시 fallback (CorsProxy.io)
    try {
      const proxyUrl2 = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl2);
      if (res.ok) {
        const json = await res.json();
        if (json && json.content) {
          return json.content;
        }
      }
    } catch (e) {
      console.error('[ChzzkChat] 모든 프록시 통신 실패:', e);
    }

    return null;
  }

  /**
   * 치지직 채팅 WebSocket 연결
   */
  async connect(channelInput) {
    const chId = this.parseChannelId(channelInput);
    if (!chId) {
      throw new Error('올바른 치지직 채널 ID (32자리) 또는 방송 URL을 입력해 주세요.');
    }

    this.saveChannel(chId);
    this.isConnecting = true;
    this.notifyStatus('connecting', '치지직 채팅 서버 접속 중...');

    try {
      const tokens = await this.fetchChatTokens(chId);
      if (!tokens || !tokens.accessToken || !tokens.chatChannelId) {
        throw new Error('채팅 접근 토큰을 발급받지 못했습니다. 채널이 현재 방송 중인지 확인해 주세요.');
      }

      this.chatChannelId = tokens.chatChannelId;
      this.accessToken = tokens.accessToken;
      this.extraToken = tokens.extraToken;

      this.initWebSocket();
    } catch (err) {
      this.isConnecting = false;
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

    // 치지직 채팅 WebSocket 서버 주소 (로드밸런싱 ss1 / ss2)
    const wsUrl = 'wss://kr-ss1.chat.naver.com/chat';
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[ChzzkChat] WebSocket 연결 성공, 인증 핸드셰이크 전송...');
      // 네이버 채팅 프로토콜: CMD 100 (CONNECT)
      const connectPayload = {
        ver: '2',
        cmd: 100,
        svcid: 'game',
        cid: this.chatChannelId,
        bdy: {
          uid: null, // 익명 시청자 모드
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
        console.warn('[ChzzkChat] 메시지 파싱 오류:', e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[ChzzkChat] WebSocket 오류:', error);
      this.notifyStatus('error', '채팅 서버 연결 오류');
    };

    this.ws.onclose = () => {
      console.log('[ChzzkChat] WebSocket 연결 종료');
      this.isConnected = false;
      this.isConnecting = false;
      if (this.pingInterval) clearInterval(this.pingInterval);
      this.notifyStatus('disconnected', '채팅 연결 끊김');
    };
  }

  handleSocketMessage(msg) {
    // CMD 10100: CONNECT 응답
    if (msg.cmd === 10100) {
      this.isConnected = true;
      this.isConnecting = false;
      console.log('[ChzzkChat] 치지직 채팅 인증 완료! 실시간 채팅 수신 대기 중');
      this.notifyStatus('connected', '치지직 채팅 연결됨 (실시간 수신 중)');
      return;
    }

    // CMD 10000: PING -> CMD 10000 (PONG 수신)
    if (msg.cmd === 10000) {
      return;
    }

    // CMD 93101: 실시간 채팅 메시지 (bdy array)
    if (msg.cmd === 93101 && Array.isArray(msg.bdy)) {
      msg.bdy.forEach(item => {
        this.parseChatMessage(item);
      });
    }
  }

  /**
   * 시청자 채팅 메시지 파싱 및 투표 카운트
   */
  parseChatMessage(chatItem) {
    if (!this.isPolling) return; // 투표 진행 중일 때만 집계

    let messageText = '';
    let userId = chatItem.uid || `anon_${Math.random()}`;

    try {
      if (chatItem.msg) {
        messageText = chatItem.msg.trim();
      } else if (chatItem.profile) {
        const profile = JSON.parse(chatItem.profile);
        userId = profile.userIdHash || userId;
      }
    } catch (e) {}

    if (!messageText) return;

    // 투표 명령어 정규식 매칭
    // 좌측(A): 1, !1, A, !A, ㄱ, 1번, a
    // 우측(B): 2, !2, B, !B, ㄴ, 2번, b
    let voteSide = null;

    const lower = messageText.toLowerCase();
    if (/^(1|!1|a|!a|1번|좌|좌측|왼|왼쪽)$/i.test(lower)) {
      voteSide = 'A';
    } else if (/^(2|!2|b|!b|2번|우|우측|오|오른쪽)$/i.test(lower)) {
      voteSide = 'B';
    }

    if (voteSide) {
      this.recordVote(userId, voteSide);
    }
  }

  recordVote(userId, side) {
    const prevVote = this.voters.get(userId);
    if (prevVote === side) return; // 이미 같은 곳에 투표함

    if (prevVote) {
      // 기존 투표 취소 후 재투표
      this.votes[prevVote] = Math.max(0, this.votes[prevVote] - 1);
    }

    this.votes[side] = (this.votes[side] || 0) + 1;
    this.voters.set(userId, side);

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

  // 투표 결과 리셋
  resetPoll() {
    this.votes = { A: 0, B: 0 };
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

  // 모의 테스트 투표 (방송 시작 전 스트리머가 기능 확인할 수 있도록)
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
      this.onStatusChange({ status, text, isConnected: this.isConnected, isConnecting: this.isConnecting });
    }
  }
}

window.ChzzkChatManager = ChzzkChatManager;
