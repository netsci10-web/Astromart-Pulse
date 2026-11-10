import { MarketPost, NotificationLogItem, PollingIntervalSec, SessionStatus, MarketStateResponse } from '../types';

const STORAGE_KEY = 'astromart_pulse_static_state_v1';
const ASTROMART_BASE = 'https://www.astromart.co.kr';
const MARKET_URL = 'https://www.astromart.co.kr/market/?mod=list';

interface ClientLocalState {
  intervalSec: PollingIntervalSec;
  monitoringEnabled: boolean;
  keywords: string[];
  notifyAllNewPosts: boolean;
  categoryFilter: '전체' | '판매' | '구입';
  seenUids: string[];
  knownPosts: MarketPost[];
  simulatedPosts: MarketPost[];
  notifications: NotificationLogItem[];
  lastCheckedAt: string | null;
  session: SessionStatus;
}

const DEFAULT_CLIENT_STATE: ClientLocalState = {
  intervalSec: 60,
  monitoringEnabled: true,
  keywords: ['ZWO', '드워프', '적도의', '다카하시', '쌍안경'],
  notifyAllNewPosts: true,
  categoryFilter: '전체',
  seenUids: [],
  knownPosts: [],
  simulatedPosts: [],
  notifications: [],
  lastCheckedAt: null,
  session: {
    isLoggedIn: false,
    username: '',
    lastVerifiedAt: null,
    keepAlive: true,
    loginMode: 'none',
  },
};

export function loadClientState(): ClientLocalState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CLIENT_STATE, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CLIENT_STATE };
}

export function saveClientState(state: ClientLocalState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export async function fetchHtmlViaCorsProxy(targetUrl: string): Promise<string> {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}&_t=${Date.now()}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  ];

  let lastErr: Error | null = null;
  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('kboard')) {
          return text;
        }
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('CORS 프록시 연결 실패');
    }
  }
  throw lastErr || new Error('아스트로마트 데이터를 가져오지 못했습니다.');
}

export function parseAstromartHtmlInBrowser(html: string): MarketPost[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const rows = doc.querySelectorAll('.kboard-list tbody tr');
  const posts: MarketPost[] = [];
  const nowIso = new Date().toISOString();

  rows.forEach((row) => {
    const isNotice = row.classList.contains('kboard-list-notice');
    const catEl =
      row.querySelector('td.kboard-list-category1') ||
      row.querySelector('.kboard-mobile-contents.kboard-category1');
    const cat = catEl?.textContent?.trim() || (isNotice ? '공지' : '기타');

    const titleLink = row.querySelector('td.kboard-list-title a');
    const href = titleLink?.getAttribute('href') || '';
    const uidMatch = href.match(/uid=(\d+)/);
    const uid = uidMatch ? uidMatch[1] : '';
    if (!uid) return;

    const commentRaw = titleLink?.querySelector('.kboard-comments-count')?.textContent?.trim() || '';
    const commentMatch = commentRaw.match(/\[(\d+)\]/);
    const commentCount = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    const cutStrings = titleLink?.querySelector('.kboard-default-cut-strings')?.cloneNode(true) as HTMLElement | null;
    if (cutStrings) {
      cutStrings
        .querySelectorAll('.kboard-comments-count, .kboard-default-new-notify')
        .forEach((el) => el.remove());
    }
    const title = (cutStrings?.textContent || titleLink?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();

    const author = row.querySelector('td.kboard-list-user')?.textContent?.trim() || '익명';
    const dateText = row.querySelector('td.kboard-list-date')?.textContent?.trim() || '';
    const votes = parseInt(row.querySelector('td.kboard-list-vote')?.textContent?.trim() || '0', 10) || 0;
    const views = parseInt(row.querySelector('td.kboard-list-view')?.textContent?.trim() || '0', 10) || 0;
    const fullUrl = href.startsWith('http')
      ? href
      : `${ASTROMART_BASE}${href.startsWith('/') ? '' : '/market/'}${href}`;

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

  return posts;
}

export async function pollClientFallback(): Promise<{
  response: MarketStateResponse;
  newNotifications: NotificationLogItem[];
}> {
  const state = loadClientState();
  const html = await fetchHtmlViaCorsProxy(MARKET_URL);
  const fetchedPosts = parseAstromartHtmlInBrowser(html);

  const regularLivePosts = fetchedPosts.filter((p) => !p.isNotice);
  const noticeLivePosts = fetchedPosts.filter((p) => p.isNotice);
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

  if (state.seenUids.length > 500) {
    state.seenUids = state.seenUids.slice(-500);
  }

  state.knownPosts = [
    ...state.simulatedPosts,
    ...regularLivePosts,
    ...noticeLivePosts,
  ];
  state.lastCheckedAt = new Date().toISOString();

  const newNotifications: NotificationLogItem[] = [];
  for (const post of newDetectedPosts) {
    if (state.categoryFilter !== '전체' && post.category !== state.categoryFilter) {
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
      newNotifications.push(notif);
    }
  }

  saveClientState(state);

  const nextCheckAt = state.monitoringEnabled
    ? new Date(Date.now() + state.intervalSec * 1000).toISOString()
    : null;

  return {
    response: {
      posts: state.knownPosts,
      notifications: state.notifications,
      intervalSec: state.intervalSec,
      monitoringEnabled: state.monitoringEnabled,
      keywords: state.keywords,
      notifyAllNewPosts: state.notifyAllNewPosts,
      categoryFilter: state.categoryFilter,
      lastCheckedAt: state.lastCheckedAt,
      nextCheckAt,
      lastPollError: null,
      session: state.session,
    },
    newNotifications,
  };
}

export function simulatePostClientFallback(): {
  post: MarketPost;
  notification: NotificationLogItem;
  posts: MarketPost[];
  notifications: NotificationLogItem[];
} {
  const state = loadClientState();
  const sampleItems = [
    { category: '판매', title: '다카하시 FSQ-85EDP 경통 세트 및 전용 리듀서 일괄 양도', author: '김천문' },
    { category: '판매', title: 'ZWO AM5 하모닉 적도의 + TC40 삼각대 풀박스 미사용급', author: '박성단' },
    { category: '구입', title: '드워프3 (DWARF 3) 스마트 망원경 정발 제품 구합니다', author: '이은하' },
    { category: '판매', title: 'ZWO ASI2600MC Pro 냉각 컬러 CMOS 카메라 상태 최상', author: '최성운' },
    { category: '판매', title: '스와로브스키 NL Pure 10x42 쌍안경 정품 등록 완료', author: '정한별' },
  ];
  const picked = sampleItems[Math.floor(Math.random() * sampleItems.length)];
  const simUid = String(130000 + Math.floor(Math.random() * 90000));
  const latestRealUid = state.knownPosts.find((p) => !p.isSimulated && !p.isNotice)?.uid || '121723';

  const newPost: MarketPost = {
    uid: simUid,
    category: picked.category,
    title: picked.title,
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
  saveClientState(state);

  return {
    post: newPost,
    notification: notif,
    posts: state.knownPosts,
    notifications: state.notifications,
  };
}

export function deleteSimulatedClientFallback(options: {
  uids?: string[];
  notifIds?: string[];
  deleteAll?: boolean;
}) {
  const state = loadClientState();
  if (options.deleteAll) {
    const simUidSet = new Set(state.simulatedPosts.map((p) => p.uid));
    state.simulatedPosts = [];
    state.knownPosts = state.knownPosts.filter((p) => !p.isSimulated);
    state.notifications = state.notifications.filter((n) => !simUidSet.has(n.uid));
  } else {
    if (Array.isArray(options.uids) && options.uids.length > 0) {
      const uidSet = new Set(options.uids.map(String));
      state.simulatedPosts = state.simulatedPosts.filter((p) => !uidSet.has(p.uid));
      state.knownPosts = state.knownPosts.filter((p) => !(p.isSimulated && uidSet.has(p.uid)));
      state.notifications = state.notifications.filter((n) => !uidSet.has(n.uid));
    }
    if (Array.isArray(options.notifIds) && options.notifIds.length > 0) {
      const idSet = new Set(options.notifIds.map(String));
      state.notifications = state.notifications.filter((n) => !idSet.has(n.id));
    }
  }
  saveClientState(state);
  return {
    posts: state.knownPosts,
    notifications: state.notifications,
  };
}
