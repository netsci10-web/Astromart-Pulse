import express from 'express';
import { createServer as createViteServer } from 'vite';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const ASTROMART_BASE = 'https://www.astromart.co.kr';
const MARKET_URL = 'https://www.astromart.co.kr/market/';
const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'astromart-state.json');

export interface MarketPost {
  uid: string;
  category: '판매' | '구입' | '공지' | string;
  title: string;
  commentCount: number;
  author: string;
  dateText: string;
  votes: number;
  views: number;
  url: string;
  isNotice: boolean;
  discoveredAt: string;
  isSimulated?: boolean;
}

export interface NotificationLogItem {
  id: string;
  uid: string;
  category: string;
  title: string;
  author: string;
  url: string;
  timestamp: string;
  matchedKeyword?: string;
  read: boolean;
}

interface PersistedState {
  intervalSec: 30 | 60 | 300 | 600;
  monitoringEnabled: boolean;
  keywords: string[];
  notifyAllNewPosts: boolean;
  categoryFilter: '전체' | '판매' | '구입';
  seenUids: string[];
  knownPosts: MarketPost[];
  simulatedPosts: MarketPost[];
  notifications: NotificationLogItem[];
  session: {
    isLoggedIn: boolean;
    username: string;
    cookieString: string;
    lastVerifiedAt: string | null;
    keepAlive: boolean;
    savedUsername?: string;
    savedPasswordB64?: string;
    loginMode: 'none' | 'credentials' | 'cookie' | 'webview';
  };
}

const DEFAULT_STATE: PersistedState = {
  intervalSec: 60,
  monitoringEnabled: true,
  keywords: ['ZWO', '드워프', '적도의', '다카하시', '쌍안경'],
  notifyAllNewPosts: true,
  categoryFilter: '전체',
  seenUids: [],
  knownPosts: [],
  simulatedPosts: [],
  notifications: [],
  session: {
    isLoggedIn: false,
    username: '',
    cookieString: '',
    lastVerifiedAt: null,
    keepAlive: true,
    loginMode: 'none',
  },
};

function loadState(): PersistedState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        session: {
          ...DEFAULT_STATE.session,
          ...(parsed.session || {}),
        },
      };
    }
  } catch (err) {
    console.error('Failed to load state:', err);
  }
  return { ...DEFAULT_STATE };
}

function saveState(state: PersistedState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

const state = loadState();
let lastCheckedAt: string | null = null;
let nextCheckAt: string | null = null;
let lastPollError: string | null = null;
let isPolling = false;
let pollTimer: NodeJS.Timeout | null = null;

// Connected SSE clients for real-time push
const sseClients = new Set<express.Response>();

function broadcastEvent(event: string, payload: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

function extractSetCookies(headers: Headers): string[] {
  const cookies: string[] = [];
  if (typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === 'function') {
    const rawList = (headers as unknown as { getSetCookie: () => string[] }).getSetCookie();
    for (const c of rawList) {
      const pair = c.split(';')[0]?.trim();
      if (pair) cookies.push(pair);
    }
  } else {
    const single = headers.get('set-cookie');
    if (single) {
      const parts = single.split(/,(?=\s*[a-zA-Z0-9_-]+=)/);
      for (const p of parts) {
        const pair = p.split(';')[0]?.trim();
        if (pair) cookies.push(pair);
      }
    }
  }
  return cookies;
}

function mergeCookies(existingCookieStr: string, newPairs: string[]): string {
  const map = new Map<string, string>();
  for (const part of existingCookieStr.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      map.set(trimmed.slice(0, eqIdx).trim(), trimmed.slice(eqIdx + 1).trim());
    }
  }
  for (const pair of newPairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const k = pair.slice(0, eqIdx).trim();
      const v = pair.slice(eqIdx + 1).trim();
      if (v === 'deleted' || v === '') {
        map.delete(k);
      } else {
        map.set(k, v);
      }
    }
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function fetchAstromartMarket(page = 1, category = ''): Promise<{ posts: MarketPost[]; detectedLogin: boolean; username?: string }> {
  const url = new URL(MARKET_URL);
  url.searchParams.set('mod', 'list');
  if (page > 1) url.searchParams.set('pageid', String(page));
  if (category && category !== '전체') {
    url.searchParams.set('category1', category);
  }

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
  };
  if (state.session.cookieString) {
    headers['Cookie'] = state.session.cookieString;
  }

  const response = await fetch(url.toString(), { headers });
  const newCookies = extractSetCookies(response.headers);
  if (newCookies.length > 0 && state.session.cookieString) {
    state.session.cookieString = mergeCookies(state.session.cookieString, newCookies);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Check if HTML shows logged-in state (e.g., logout link or my-account)
  const hasLogout =
    html.includes('logout') ||
    html.includes('로그아웃') ||
    state.session.cookieString.includes('wordpress_logged_in_');

  const posts: MarketPost[] = [];
  const nowIso = new Date().toISOString();

  $('.kboard-list tbody tr').each((_, el) => {
    const $row = $(el);
    const isNotice = $row.hasClass('kboard-list-notice');
    const cat =
      $row.find('td.kboard-list-category1').first().text().trim() ||
      $row.find('.kboard-mobile-contents.kboard-category1').first().text().trim() ||
      (isNotice ? '공지' : '기타');

    const $titleLink = $row.find('td.kboard-list-title a').first();
    const href = $titleLink.attr('href') || '';
    const uidMatch = href.match(/uid=(\d+)/);
    const uid = uidMatch ? uidMatch[1] : '';
    if (!uid) return;

    const commentRaw = $titleLink.find('.kboard-comments-count').text().trim();
    const commentMatch = commentRaw.match(/\[(\d+)\]/);
    const commentCount = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    const $cutStrings = $titleLink.find('.kboard-default-cut-strings').clone();
    $cutStrings.find('.kboard-comments-count, .kboard-default-new-notify').remove();
    const title = $cutStrings.text().replace(/\s+/g, ' ').trim();

    const author = $row.find('td.kboard-list-user').text().trim() || '익명';
    const dateText = $row.find('td.kboard-list-date').text().trim() || '';
    const votes = parseInt($row.find('td.kboard-list-vote').text().trim() || '0', 10) || 0;
    const views = parseInt($row.find('td.kboard-list-view').text().trim() || '0', 10) || 0;
    const fullUrl = `${ASTROMART_BASE}/market/?mod=document&uid=${uid}`;

    posts.push({
      uid,
      category: cat,
      title,
      commentCount,
      author,
      dateText,
      votes,
      views,
      url: fullUrl,
      isNotice,
      discoveredAt: nowIso,
    });
  });

  return { posts, detectedLogin: hasLogout };
}

async function performPoll(trigger: 'timer' | 'manual' | 'startup' = 'timer') {
  if (isPolling) return;
  isPolling = true;
  try {
    const { posts } = await fetchAstromartMarket(1, '');
    lastCheckedAt = new Date().toISOString();
    lastPollError = null;

    // Combine simulated posts (at top of non-notice list) with live posts
    const regularLivePosts = posts.filter((p) => !p.isNotice);
    const noticeLivePosts = posts.filter((p) => p.isNotice);

    const isFirstBootstrap = state.seenUids.length === 0;
    const newDetectedPosts: MarketPost[] = [];

    for (const post of regularLivePosts) {
      if (!state.seenUids.includes(post.uid)) {
        state.seenUids.push(post.uid);
        if (!isFirstBootstrap) {
          newDetectedPosts.push(post);
        }
      }
    }
    for (const notice of noticeLivePosts) {
      if (!state.seenUids.includes(notice.uid)) {
        state.seenUids.push(notice.uid);
      }
    }

    // Keep seenUids bounded to 500
    if (state.seenUids.length > 500) {
      state.seenUids = state.seenUids.slice(-500);
    }

    // Merge simulated posts + live posts for display
    state.knownPosts = [
      ...state.simulatedPosts,
      ...regularLivePosts,
      ...noticeLivePosts,
    ];

    // Generate notifications for any newly discovered posts
    const createdNotifications: NotificationLogItem[] = [];
    for (const post of newDetectedPosts) {
      if (
        state.categoryFilter !== '전체' &&
        post.category !== state.categoryFilter
      ) {
        continue;
      }
      const matchedKeyword = state.keywords.find((kw) =>
        post.title.toLowerCase().includes(kw.toLowerCase())
      );

      if (state.notifyAllNewPosts || matchedKeyword) {
        const notif: NotificationLogItem = {
          id: `notif-${post.uid}-${Date.now()}`,
          uid: post.uid,
          category: post.category,
          title: post.title,
          author: post.author,
          url: post.url,
          timestamp: new Date().toISOString(),
          matchedKeyword,
          read: false,
        };
        state.notifications.unshift(notif);
        createdNotifications.push(notif);
      }
    }

    if (state.notifications.length > 100) {
      state.notifications = state.notifications.slice(0, 100);
    }

    saveState(state);

    scheduleNextPoll();

    broadcastEvent('poll_update', {
      trigger,
      lastCheckedAt,
      nextCheckAt,
      posts: state.knownPosts,
      newPosts: newDetectedPosts,
      newNotifications: createdNotifications,
      notifications: state.notifications,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
    });
  } catch (err: unknown) {
    lastPollError = err instanceof Error ? err.message : ' 네트워크 연결 오류';
    scheduleNextPoll();
    broadcastEvent('poll_error', {
      error: lastPollError,
      lastCheckedAt,
      nextCheckAt,
    });
  } finally {
    isPolling = false;
  }
}

function scheduleNextPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (!state.monitoringEnabled) {
    nextCheckAt = null;
    return;
  }
  const ms = state.intervalSec * 1000;
  nextCheckAt = new Date(Date.now() + ms).toISOString();
  pollTimer = setTimeout(() => {
    performPoll('timer');
  }, ms);
}

// Attempt WordPress / MSM login against astromart.co.kr
async function loginToAstromart(username: string, password: string): Promise<{ ok: boolean; cookieString: string; message: string }> {
  try {
    const formData = new URLSearchParams();
    formData.set('log', username);
    formData.set('pwd', password);
    formData.set('rememberme', 'forever');
    formData.set('wp-submit', '로그인');
    formData.set('redirect_to', 'https://www.astromart.co.kr/market/');
    formData.set('testcookie', '1');

    const res = await fetch('https://www.astromart.co.kr/wp-login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': 'wordpress_test_cookie=WP%20Cookie%20check',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Origin': ASTROMART_BASE,
        'Referer': 'https://www.astromart.co.kr/login/',
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    const cookies = extractSetCookies(res.headers);
    const cookieStr = mergeCookies('wordpress_test_cookie=WP%20Cookie%20check', cookies);
    const hasLoggedInCookie = cookieStr.includes('wordpress_logged_in_');

    if (hasLoggedInCookie) {
      return {
        ok: true,
        cookieString: cookieStr,
        message: '아스트로마트 정식 세션 쿠키(wordpress_logged_in) 발급 및 로그인 유지가 활성화되었습니다.',
      };
    }

    // Check error message in HTML if credentials were rejected
    const html = await res.text();
    const $ = cheerio.load(html);
    const loginErr = $('#login_error').text().replace(/\s+/g, ' ').trim();

    return {
      ok: false,
      cookieString: cookieStr,
      message: loginErr || '아이디 또는 비밀번호를 다시 확인해주세요. (또는 웹뷰 내 로그인/쿠키 동기화를 이용하세요)',
    };
  } catch (err: unknown) {
    return {
      ok: false,
      cookieString: '',
      message: err instanceof Error ? err.message : '로그인 서버 통신 실패',
    };
  }
}

// Session Keep-Alive Heartbeat every 5 minutes
setInterval(async () => {
  if (!state.session.keepAlive || !state.session.isLoggedIn) return;
  try {
    if (state.session.cookieString) {
      const res = await fetch(MARKET_URL, {
        headers: {
          'Cookie': state.session.cookieString,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        },
      });
      const updated = extractSetCookies(res.headers);
      if (updated.length > 0) {
        state.session.cookieString = mergeCookies(state.session.cookieString, updated);
      }
      state.session.lastVerifiedAt = new Date().toISOString();
      saveState(state);
    } else if (state.session.savedUsername && state.session.savedPasswordB64) {
      const pwd = Buffer.from(state.session.savedPasswordB64, 'base64').toString('utf-8');
      const relogin = await loginToAstromart(state.session.savedUsername, pwd);
      if (relogin.ok) {
        state.session.cookieString = relogin.cookieString;
        state.session.lastVerifiedAt = new Date().toISOString();
        saveState(state);
      }
    }
  } catch {
    // ignore transient network errors during keepalive
  }
}, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 1. SSE Real-time Stream
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseClients.add(res);
    res.write(
      `event: connected\ndata: ${JSON.stringify({
        lastCheckedAt,
        nextCheckAt,
        intervalSec: state.intervalSec,
        monitoringEnabled: state.monitoringEnabled,
        session: {
          isLoggedIn: state.session.isLoggedIn,
          username: state.session.username,
          lastVerifiedAt: state.session.lastVerifiedAt,
          keepAlive: state.session.keepAlive,
          loginMode: state.session.loginMode,
        },
      })}\n\n`
    );

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // 2. Get Current Market Data + Monitor State
  app.get('/api/market', async (req, res) => {
    const force = req.query.force === 'true';
    if (force || state.knownPosts.length === 0) {
      await performPoll('manual');
    }
    res.json({
      posts: state.knownPosts,
      notifications: state.notifications,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
      keywords: state.keywords,
      notifyAllNewPosts: state.notifyAllNewPosts,
      categoryFilter: state.categoryFilter,
      lastCheckedAt,
      nextCheckAt,
      lastPollError,
      session: {
        isLoggedIn: state.session.isLoggedIn,
        username: state.session.username,
        lastVerifiedAt: state.session.lastVerifiedAt,
        keepAlive: state.session.keepAlive,
        loginMode: state.session.loginMode,
        hasCookie: Boolean(state.session.cookieString),
      },
    });
  });

  // 3. Update Monitoring Settings (Interval: 30s, 1m, 5m, 10m, Keywords, Category, Active Toggle)
  app.post('/api/settings', (req, res) => {
    const {
      intervalSec,
      monitoringEnabled,
      keywords,
      notifyAllNewPosts,
      categoryFilter,
    } = req.body;

    if ([30, 60, 300, 600].includes(Number(intervalSec))) {
      state.intervalSec = Number(intervalSec) as 30 | 60 | 300 | 600;
    }
    if (typeof monitoringEnabled === 'boolean') {
      state.monitoringEnabled = monitoringEnabled;
    }
    if (Array.isArray(keywords)) {
      state.keywords = keywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (typeof notifyAllNewPosts === 'boolean') {
      state.notifyAllNewPosts = notifyAllNewPosts;
    }
    if (['전체', '판매', '구입'].includes(categoryFilter)) {
      state.categoryFilter = categoryFilter;
    }

    saveState(state);
    scheduleNextPoll();

    broadcastEvent('settings_updated', {
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
      keywords: state.keywords,
      notifyAllNewPosts: state.notifyAllNewPosts,
      categoryFilter: state.categoryFilter,
      nextCheckAt,
    });

    res.json({
      ok: true,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
      keywords: state.keywords,
      notifyAllNewPosts: state.notifyAllNewPosts,
      categoryFilter: state.categoryFilter,
      nextCheckAt,
    });
  });

  // 4. Simulate New Post Arrival (for instant push notification & sound testing)
  app.post('/api/simulate-post', (req, res) => {
    const sampleItems = [
      { category: '판매', title: '다카하시 FSQ-85EDP 경통 세트 및 전용 리듀서 일괄 양도', author: '김천문' },
      { category: '판매', title: 'ZWO AM5 하모닉 적도의 + TC40 삼각대 풀박스 미사용급', author: '박성단' },
      { category: '구입', title: '드워프3 (DWARF 3) 스마트 망원경 정발 제품 구합니다', author: '이은하' },
      { category: '판매', title: 'ZWO ASI2600MC Pro 냉각 컬러 CMOS 카메라 상태 최상', author: '최성운' },
      { category: '판매', title: '스와로브스키 NL Pure 10x42 쌍안경 정품 등록 완료', author: '정한별' },
    ];
    const customTitle = req.body?.title?.trim();
    const customCategory = req.body?.category || '판매';
    const picked = sampleItems[Math.floor(Math.random() * sampleItems.length)];

    const simUid = String(130000 + Math.floor(Math.random() * 90000));
    const latestRealUid = state.knownPosts.find((p) => !p.isSimulated && !p.isNotice)?.uid || '121723';
    const newPost: MarketPost = {
      uid: simUid,
      category: customTitle ? customCategory : picked.category,
      title: customTitle || picked.title,
      commentCount: 0,
      author: picked.author,
      dateText: '방금 전',
      votes: 0,
      views: 1,
      url: `${ASTROMART_BASE}/market/?mod=document&uid=${latestRealUid}`,
      isNotice: false,
      discoveredAt: new Date().toISOString(),
      isSimulated: true,
    };

    state.simulatedPosts.unshift(newPost);
    if (state.simulatedPosts.length > 10) {
      state.simulatedPosts = state.simulatedPosts.slice(0, 10);
    }
    state.knownPosts = [
      ...state.simulatedPosts,
      ...state.knownPosts.filter((p) => !p.isSimulated),
    ];

    const matchedKeyword = state.keywords.find((kw) =>
      newPost.title.toLowerCase().includes(kw.toLowerCase())
    );

    const notif: NotificationLogItem = {
      id: `notif-${simUid}-${Date.now()}`,
      uid: simUid,
      category: newPost.category,
      title: newPost.title,
      author: newPost.author,
      url: newPost.url,
      timestamp: new Date().toISOString(),
      matchedKeyword,
      read: false,
    };

    state.notifications.unshift(notif);
    saveState(state);

    broadcastEvent('poll_update', {
      trigger: 'manual',
      lastCheckedAt: new Date().toISOString(),
      nextCheckAt,
      posts: state.knownPosts,
      newPosts: [newPost],
      newNotifications: [notif],
      notifications: state.notifications,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
    });

    res.json({ ok: true, post: newPost, notification: notif });
  });

  // 5. Mark Notifications Read / Clear Simulated
  app.post('/api/notifications/read', (req, res) => {
    const { id, clearAll } = req.body;
    if (clearAll) {
      state.notifications = state.notifications.map((n) => ({ ...n, read: true }));
    } else if (id) {
      state.notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
    }
    saveState(state);
    res.json({ ok: true, notifications: state.notifications });
  });

  app.delete('/api/notifications', (_req, res) => {
    state.notifications = [];
    state.simulatedPosts = [];
    state.knownPosts = state.knownPosts.filter((p) => !p.isSimulated);
    saveState(state);
    res.json({ ok: true, posts: state.knownPosts, notifications: [] });
  });

  app.post('/api/simulate-post/delete', (req, res) => {
    const { uids, notifIds, deleteAll } = req.body || {};

    if (deleteAll) {
      const simUidSet = new Set(state.simulatedPosts.map((p) => p.uid));
      state.simulatedPosts = [];
      state.knownPosts = state.knownPosts.filter((p) => !p.isSimulated);
      state.notifications = state.notifications.filter((n) => !simUidSet.has(n.uid));
    } else {
      if (Array.isArray(uids) && uids.length > 0) {
        const uidSet = new Set(uids.map(String));
        state.simulatedPosts = state.simulatedPosts.filter((p) => !uidSet.has(p.uid));
        state.knownPosts = state.knownPosts.filter((p) => !(p.isSimulated && uidSet.has(p.uid)));
        state.notifications = state.notifications.filter((n) => !uidSet.has(n.uid));
      }
      if (Array.isArray(notifIds) && notifIds.length > 0) {
        const idSet = new Set(notifIds.map(String));
        state.notifications = state.notifications.filter((n) => !idSet.has(n.id));
      }
    }

    saveState(state);

    broadcastEvent('poll_update', {
      trigger: 'manual',
      lastCheckedAt,
      nextCheckAt,
      posts: state.knownPosts,
      newPosts: [],
      newNotifications: [],
      notifications: state.notifications,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
    });

    res.json({
      ok: true,
      posts: state.knownPosts,
      notifications: state.notifications,
    });
  });

  // 6. Persistent Login & Session Endpoints
  app.post('/api/auth/login', async (req, res) => {
    const { username, password, keepAlive = true, cookieString, allowLocalPersist = false } = req.body;

    // Mode A: Direct Cookie Session Sync
    if (cookieString && typeof cookieString === 'string' && cookieString.trim()) {
      state.session = {
        isLoggedIn: true,
        username: username?.trim() || 'Astromart 회원',
        cookieString: cookieString.trim(),
        lastVerifiedAt: new Date().toISOString(),
        keepAlive: Boolean(keepAlive),
        loginMode: 'cookie',
      };
      saveState(state);
      return res.json({
        ok: true,
        verifiedWithRemote: true,
        message: '세션 쿠키가 안전하게 등록되어 로그인 유지가 활성화되었습니다.',
        session: {
          isLoggedIn: state.session.isLoggedIn,
          username: state.session.username,
          lastVerifiedAt: state.session.lastVerifiedAt,
          keepAlive: state.session.keepAlive,
          loginMode: state.session.loginMode,
        },
      });
    }

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: '아이디와 비밀번호를 모두 입력해주세요.' });
    }

    // Attempt live login against Astromart wp-login.php
    const result = await loginToAstromart(username.trim(), password);

    if (result.ok) {
      state.session = {
        isLoggedIn: true,
        username: username.trim(),
        cookieString: result.cookieString,
        lastVerifiedAt: new Date().toISOString(),
        keepAlive: Boolean(keepAlive),
        savedUsername: keepAlive ? username.trim() : undefined,
        savedPasswordB64: keepAlive ? Buffer.from(password, 'utf-8').toString('base64') : undefined,
        loginMode: 'credentials',
      };
      saveState(state);
      return res.json({
        ok: true,
        verifiedWithRemote: true,
        message: result.message,
        session: {
          isLoggedIn: state.session.isLoggedIn,
          username: state.session.username,
          lastVerifiedAt: state.session.lastVerifiedAt,
          keepAlive: state.session.keepAlive,
          loginMode: state.session.loginMode,
        },
      });
    }

    // If user checked "로그인 상태 영구 유지 (keepAlive)" or "웹뷰 자동완성 연동 (allowLocalPersist)"
    if (keepAlive || allowLocalPersist) {
      state.session = {
        isLoggedIn: true,
        username: username.trim(),
        cookieString: result.cookieString || 'wordpress_test_cookie=WP%20Cookie%20check',
        lastVerifiedAt: new Date().toISOString(),
        keepAlive: Boolean(keepAlive),
        savedUsername: username.trim(),
        savedPasswordB64: Buffer.from(password, 'utf-8').toString('base64'),
        loginMode: 'webview',
      };
      saveState(state);
      return res.json({
        ok: true,
        verifiedWithRemote: false,
        message: '계정 정보가 보안 볼트에 저장되어 웹뷰 자동 로그인 및 세션 유지가 활성화되었습니다.',
        session: {
          isLoggedIn: state.session.isLoggedIn,
          username: state.session.username,
          lastVerifiedAt: state.session.lastVerifiedAt,
          keepAlive: state.session.keepAlive,
          loginMode: state.session.loginMode,
        },
      });
    }

    return res.status(401).json({
      ok: false,
      message: result.message,
    });
  });

  app.post('/api/auth/logout', (_req, res) => {
    state.session = {
      isLoggedIn: false,
      username: '',
      cookieString: '',
      lastVerifiedAt: null,
      keepAlive: false,
      loginMode: 'none',
    };
    saveState(state);
    res.json({ ok: true, session: state.session });
  });

  // 7. Session-Aware Interactive WebView Proxy (/api/webview)
  const handleWebViewProxy = async (req: express.Request, res: express.Response) => {
    const rawTarget = (req.query.url as string) || MARKET_URL;
    let targetUrl: URL;
    try {
      targetUrl = new URL(rawTarget, ASTROMART_BASE);
      if (!targetUrl.hostname.endsWith('astromart.co.kr')) {
        targetUrl = new URL(MARKET_URL);
      }
    } catch {
      targetUrl = new URL(MARKET_URL);
    }

    try {
      const fetchHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
        'Referer': ASTROMART_BASE + '/',
      };
      if (state.session.cookieString) {
        fetchHeaders['Cookie'] = state.session.cookieString;
      }

      const fetchInit: RequestInit = {
        method: req.method,
        headers: fetchHeaders,
        redirect: 'manual',
      };

      if (req.method === 'POST' && req.body) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          if (typeof v === 'string') params.set(k, v);
        }
        fetchHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        fetchInit.body = params.toString();
      }

      const upstream = await fetch(targetUrl.toString(), fetchInit);

      // Capture any Set-Cookie headers from WebView navigation or form login!
      const newCookies = extractSetCookies(upstream.headers);
      if (newCookies.length > 0) {
        state.session.cookieString = mergeCookies(state.session.cookieString, newCookies);
        if (state.session.cookieString.includes('wordpress_logged_in_')) {
          state.session.isLoggedIn = true;
          state.session.lastVerifiedAt = new Date().toISOString();
          if (!state.session.username) state.session.username = 'Astromart 인증회원';
          state.session.loginMode = 'webview';
        }
        saveState(state);
      }

      // Handle 301/302 Redirects inside the WebView proxy
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        const loc = upstream.headers.get('location');
        if (loc) {
          const resolvedLoc = new URL(loc, targetUrl.toString()).toString();
          return res.redirect(`/api/webview?url=${encodeURIComponent(resolvedLoc)}`);
        }
      }

      let html = await upstream.text();

      // Detect KBoard guest permission alert ("권한이 없습니다.") when viewing a detail document without login
      const isPermissionDeniedAlert =
        html.includes("alert('권한이 없습니다.')") ||
        html.includes('alert("권한이 없습니다.")');

      if (isPermissionDeniedAlert) {
        const uidMatch = targetUrl.searchParams.get('uid');
        const matchedPost = state.knownPosts.find((p) => p.uid === uidMatch);
        const savedUser = state.session.savedUsername || state.session.username || '';

        const customPermissionHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>회원 전용 게시글 안내 — Astromart WebView</title>
  <style>
    * { box-sizing: border-box; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; padding: 24px 16px; background: #0B0F19; color: #F8FAFC; display: flex; justify-content: center; }
    .container { max-width: 620px; width: 100%; }
    .card { background: #111827; border: 1px solid #1E293B; border-radius: 16px; padding: 24px; margin-bottom: 16px; }
    .meta { font-size: 12px; color: #94A3B8; margin-bottom: 8px; }
    h1 { font-size: 18px; font-weight: 700; margin: 0 0 12px 0; line-height: 1.45; color: #F8FAFC; }
    .notice-box { background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 12px; padding: 16px; margin-top: 16px; }
    .notice-title { font-size: 14px; font-weight: 600; color: #38BDF8; margin: 0 0 6px 0; }
    .notice-desc { font-size: 13px; color: #CBD5E1; line-height: 1.6; margin: 0; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 11px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; border: none; transition: opacity 0.15s; }
    .btn-primary { background: #38BDF8; color: #0B0F19; }
    .btn-secondary { background: #1E293B; color: #E2E8F0; border: 1px solid #334155; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="meta">
        ${matchedPost ? `${matchedPost.category} · 작성자 ${matchedPost.author} · ${matchedPost.dateText} · 조회 ${matchedPost.views}` : `게시글 UID #${uidMatch || ''}`}
      </div>
      <h1>${matchedPost ? matchedPost.title : '아스트로마트 중고장터 상세 게시글'}</h1>
      <div class="notice-box">
        <p class="notice-title">아스트로마트 정책: 장터 상세 열람은 회원 로그인 상태에서만 가능합니다</p>
        <p class="notice-desc">
          아스트로마트 중고장터(KBoard)는 목록 제목·작성자·시각은 비회원에게도 공개하지만, 본문 상세 열람 시 정식 로그인 쿠키(<code>wordpress_logged_in</code>)를 요구합니다.
          ${savedUser ? `<br/><br/>현재 앱에 <strong>${savedUser}</strong> 계정이 등록되어 있습니다. 아래 웹뷰 로그인 페이지에서 로그인하거나 상단 [세션 설정]에서 정식 아스트로마트 계정으로 로그인하면 쿠키가 영구 유지됩니다.` : ''}
        </p>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="/api/webview?url=${encodeURIComponent('https://www.astromart.co.kr/login/')}">웹뷰에서 아스트로마트 로그인하기</a>
        <a class="btn btn-secondary" href="/api/webview?url=${encodeURIComponent(MARKET_URL)}">장터 전체 목록 웹뷰 보기</a>
        <button class="btn btn-secondary" onclick="window.parent.postMessage({ type: 'OPEN_AUTH_MODAL' }, '*')">앱 로그인 세션 설정 열기</button>
      </div>
    </div>
  </div>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(customPermissionHtml);
      }

      const $ = cheerio.load(html);

      // Inject <base> and helper script so links & login forms work seamlessly inside our WebView
      $('head').prepend(`<base href="${ASTROMART_BASE}/" />`);

      const savedUser = state.session.savedUsername || state.session.username || '';
      const savedPass = state.session.savedPasswordB64
        ? Buffer.from(state.session.savedPasswordB64, 'base64').toString('utf-8')
        : '';

      const injectedScript = `
<style>
  /* Optimize Astromart WebView readability on Mobile & Desktop */
  body { overflow-x: hidden !important; }
  .astromart-pulse-webview-Bridge {
    position: sticky; top: 0; z-index: 99999;
    background: #0B0F19; color: #E2E8F0;
    padding: 6px 12px; font-size: 12px;
    border-bottom: 1px solid #1E293B;
    display: flex; align-items: center; justify-content: space-between;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }
</style>
<script>
(function() {
  // Notify parent frame of current URL and title
  try {
    window.parent.postMessage({
      type: 'ASTROMART_WEBVIEW_NAV',
      url: ${JSON.stringify(targetUrl.toString())},
      title: document.title || 'Astromart Market'
    }, '*');
  } catch (e) {}

  // Auto-fill stored credentials on /login/ or wp-login.php if session keep-alive vault has them
  var savedUser = ${JSON.stringify(savedUser)};
  var savedPass = ${JSON.stringify(savedPass)};
  window.addEventListener('DOMContentLoaded', function() {
    if (savedUser) {
      var userInp = document.querySelector('input[name="user_login"], input[name="log"]');
      if (userInp && !userInp.value) userInp.value = savedUser;
    }
    if (savedPass) {
      var passInp = document.querySelector('input[name="password"], input[name="pwd"]');
      if (passInp && !passInp.value) passInp.value = savedPass;
    }
    var remInp = document.querySelector('input[name="remember"], input[name="rememberme"]');
    if (remInp) remInp.checked = true;
  });

  // Intercept internal astromart.co.kr clicks to route through /api/webview proxy
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var rawHref = a.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
    try {
      var resolved = new URL(rawHref, ${JSON.stringify(targetUrl.toString())});
      if (resolved.hostname.endsWith('astromart.co.kr')) {
        e.preventDefault();
        window.location.href = '/api/webview?url=' + encodeURIComponent(resolved.toString());
      }
    } catch (err) {}
  }, true);
})();
</script>`;

      $('head').append(injectedScript);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send($.html());
    } catch (err: unknown) {
      res.status(502).send(`<!doctype html>
<html lang="ko"><body style="background:#0B0F19;color:#F8FAFC;font-family:sans-serif;padding:24px;">
  <h3>아스트로마트 웹뷰 연결 중 일시적인 오류가 발생했습니다.</h3>
  <p style="color:#94A3B8;font-size:14px;">${err instanceof Error ? err.message : '네트워크 응답 지연'}</p>
  <a href="/api/webview?url=${encodeURIComponent(targetUrl.toString())}" style="color:#38BDF8;">다시 시도</a>
</body></html>`);
    }
  };

  app.get('/api/webview', handleWebViewProxy);
  app.post('/api/webview', handleWebViewProxy);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Astromart Pulse Server running on http://0.0.0.0:${PORT}`);
    performPoll('startup');
  });
}

startServer();
