import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Bell,
  BellRing,
  RefreshCw,
  Search,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  ShieldCheck,
  LogIn,
  Globe,
  SlidersHorizontal,
  ListFilter,
  Sparkles,
  Sun,
  Moon,
  Download,
  Check,
  ExternalLink,
  Pause,
  Play,
} from 'lucide-react';
import {
  MarketPost,
  NotificationLogItem,
  PollingIntervalSec,
  SessionStatus,
  MarketStateResponse,
} from './types';
import {
  getNotificationPermissionState,
  requestPushNotificationPermission,
  dispatchBackgroundPushNotification,
  playNotificationChime,
  updateAppBadge,
} from './utils/notifications';
import { WebViewPane } from './components/WebViewPane';
import { AuthSessionModal } from './components/AuthSessionModal';
import { PWAInstallModal } from './components/PWAInstallModal';
import { usePWAInstall } from './hooks/usePWAInstall';

const INTERVAL_OPTIONS: { value: PollingIntervalSec; label: string }[] = [
  { value: 30, label: '30초' },
  { value: 60, label: '1분' },
  { value: 300, label: '5분' },
  { value: 600, label: '10분' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'feed' | 'webview' | 'alerts' | 'settings'>('feed');
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [notifications, setNotifications] = useState<NotificationLogItem[]>([]);
  const [intervalSec, setIntervalSec] = useState<PollingIntervalSec>(60);
  const [monitoringEnabled, setMonitoringEnabled] = useState<boolean>(true);
  const [keywords, setKeywords] = useState<string[]>(['ZWO', '드워프', '적도의', '다카하시', '쌍안경']);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [notifyAllNewPosts, setNotifyAllNewPosts] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<'전체' | '판매' | '구입'>('전체');
  const [includeNotices, setIncludeNotices] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [nextCheckAt, setNextCheckAt] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(60);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [pollError, setPollError] = useState<string | null>(null);

  const [session, setSession] = useState<SessionStatus>({
    isLoggedIn: false,
    username: '',
    lastVerifiedAt: null,
    keepAlive: true,
    loginMode: 'none',
  });

  const [webViewUrl, setWebViewUrl] = useState<string>('https://www.astromart.co.kr/market/');
  const [selectedPostUid, setSelectedPostUid] = useState<string | null>(null);

  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getNotificationPermissionState()
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('astromart_sound') !== 'false';
  });
  const [vibrateEnabled, setVibrateEnabled] = useState<boolean>(() => {
    return localStorage.getItem('astromart_vibrate') !== 'false';
  });
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('astromart_theme') !== 'light';
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [liveToast, setLiveToast] = useState<NotificationLogItem | null>(null);
  const [selectedTestUids, setSelectedTestUids] = useState<string[]>([]);
  const [selectedNotifIds, setSelectedNotifIds] = useState<string[]>([]);

  const { isInstalled } = usePWAInstall();

  // Sync Dark / Light theme on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('astromart_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('astromart_theme', 'light');
    }
  }, [darkMode]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  useEffect(() => {
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  const openPostInWebView = useCallback((url: string, uid?: string) => {
    setWebViewUrl(url);
    if (uid) setSelectedPostUid(uid);
    if (window.innerWidth < 1024) {
      setActiveTab('webview');
    }
  }, []);

  // Fetch initial state from backend
  const fetchMarketData = useCallback(async (force = false) => {
    if (force) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/market${force ? '?force=true' : ''}`);
      if (!res.ok) throw new Error('장터 데이터를 불러오지 못했습니다.');
      const data: MarketStateResponse = await res.json();
      setPosts(data.posts || []);
      setNotifications(data.notifications || []);
      setIntervalSec(data.intervalSec || 60);
      setMonitoringEnabled(data.monitoringEnabled ?? true);
      setKeywords(data.keywords || []);
      setNotifyAllNewPosts(data.notifyAllNewPosts ?? true);
      setCategoryFilter(data.categoryFilter || '전체');
      setLastCheckedAt(data.lastCheckedAt);
      setNextCheckAt(data.nextCheckAt);
      setPollError(data.lastPollError);
      if (data.session) {
        setSession(data.session);
      }
    } catch (err: unknown) {
      setPollError(err instanceof Error ? err.message : '연결 오류');
    } finally {
      setIsRefreshing(false);
      setIsLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData(false);
  }, [fetchMarketData]);

  // Connect to Server-Sent Events (/api/events) for real-time background poll updates
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.addEventListener('poll_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.posts)) setPosts(data.posts);
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        if (data.lastCheckedAt) setLastCheckedAt(data.lastCheckedAt);
        if (data.nextCheckAt !== undefined) setNextCheckAt(data.nextCheckAt);
        if (data.intervalSec) setIntervalSec(data.intervalSec);
        if (typeof data.monitoringEnabled === 'boolean') {
          setMonitoringEnabled(data.monitoringEnabled);
        }
        setPollError(null);

        // If new notifications arrived, fire push notification + chime + toast
        if (Array.isArray(data.newNotifications) && data.newNotifications.length > 0) {
          const latestNotif: NotificationLogItem = data.newNotifications[0];
          setLiveToast(latestNotif);
          dispatchBackgroundPushNotification(latestNotif, {
            soundEnabled,
            vibrateEnabled,
            onClickUrl: (targetUrl) => openPostInWebView(targetUrl, latestNotif.uid),
          });
        }
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener('settings_updated', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.intervalSec) setIntervalSec(data.intervalSec);
        if (typeof data.monitoringEnabled === 'boolean') {
          setMonitoringEnabled(data.monitoringEnabled);
        }
        if (Array.isArray(data.keywords)) setKeywords(data.keywords);
        if (typeof data.notifyAllNewPosts === 'boolean') {
          setNotifyAllNewPosts(data.notifyAllNewPosts);
        }
        if (data.categoryFilter) setCategoryFilter(data.categoryFilter);
        if (data.nextCheckAt !== undefined) setNextCheckAt(data.nextCheckAt);
      } catch {
        // ignore
      }
    });

    return () => {
      es.close();
    };
  }, [soundEnabled, vibrateEnabled, openPostInWebView]);

  // Countdown Timer (1s tick) + Client-side fallback poll if background tab woke up past nextCheckAt
  useEffect(() => {
    if (!monitoringEnabled || !nextCheckAt) {
      setRemainingSec(intervalSec);
      return;
    }

    const tick = () => {
      const diffMs = new Date(nextCheckAt).getTime() - Date.now();
      const secs = Math.max(0, Math.ceil(diffMs / 1000));
      setRemainingSec(secs);
      if (diffMs < -3000 && !isRefreshing) {
        fetchMarketData(true);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [monitoringEnabled, nextCheckAt, intervalSec, isRefreshing, fetchMarketData]);

  // Update Server Settings helper
  const updateServerSettings = async (patch: Partial<{
    intervalSec: PollingIntervalSec;
    monitoringEnabled: boolean;
    keywords: string[];
    notifyAllNewPosts: boolean;
    categoryFilter: '전체' | '판매' | '구입';
  }>) => {
    if (patch.intervalSec) setIntervalSec(patch.intervalSec);
    if (typeof patch.monitoringEnabled === 'boolean') setMonitoringEnabled(patch.monitoringEnabled);
    if (patch.keywords) setKeywords(patch.keywords);
    if (typeof patch.notifyAllNewPosts === 'boolean') setNotifyAllNewPosts(patch.notifyAllNewPosts);
    if (patch.categoryFilter) setCategoryFilter(patch.categoryFilter);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.nextCheckAt !== undefined) {
        setNextCheckAt(data.nextCheckAt);
      }
    } catch {
      // ignore
    }
  };

  const handleSimulateNewPost = async () => {
    if (pushPermission === 'default') {
      const perm = await requestPushNotificationPermission();
      setPushPermission(perm);
    }
    try {
      const res = await fetch('/api/simulate-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.ok && data.notification) {
        setLiveToast(data.notification);
        dispatchBackgroundPushNotification(data.notification, {
          soundEnabled: true,
          vibrateEnabled: true,
          onClickUrl: (url) => openPostInWebView(url, data.notification.uid),
        });
      }
    } catch {
      // ignore
    }
  };

  const simulatedPostsInFeed = useMemo(
    () => posts.filter((p) => p.isSimulated),
    [posts]
  );

  // Keep selectedTestUids in sync with existing simulated posts
  useEffect(() => {
    const validSet = new Set(simulatedPostsInFeed.map((p) => p.uid));
    setSelectedTestUids((prev) => prev.filter((id) => validSet.has(id)));
  }, [simulatedPostsInFeed]);

  // Keep selectedNotifIds in sync with existing notifications
  useEffect(() => {
    const validSet = new Set(notifications.map((n) => n.id));
    setSelectedNotifIds((prev) => prev.filter((id) => validSet.has(id)));
  }, [notifications]);

  const toggleSelectTestUid = (uid: string) => {
    setSelectedTestUids((prev) =>
      prev.includes(uid) ? prev.filter((item) => item !== uid) : [...prev, uid]
    );
  };

  const toggleSelectAllTestPosts = () => {
    if (
      simulatedPostsInFeed.length > 0 &&
      selectedTestUids.length === simulatedPostsInFeed.length
    ) {
      setSelectedTestUids([]);
    } else {
      setSelectedTestUids(simulatedPostsInFeed.map((p) => p.uid));
    }
  };

  const handleDeleteTestPosts = async (options: {
    uids?: string[];
    notifIds?: string[];
    deleteAll?: boolean;
  }) => {
    try {
      const res = await fetch('/api/simulate-post/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const data = await res.json();
      if (data.ok) {
        if (Array.isArray(data.posts)) setPosts(data.posts);
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        if (options.deleteAll || options.uids) setSelectedTestUids([]);
        if (options.deleteAll || options.notifIds) setSelectedNotifIds([]);
        if (
          liveToast &&
          (options.deleteAll ||
            options.uids?.includes(liveToast.uid) ||
            options.notifIds?.includes(liveToast.id))
        ) {
          setLiveToast(null);
        }
      }
    } catch {
      // ignore
    }
  };

  const toggleSelectNotifId = (id: string) => {
    setSelectedNotifIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllNotifications = () => {
    if (
      notifications.length > 0 &&
      selectedNotifIds.length === notifications.length
    ) {
      setSelectedNotifIds([]);
    } else {
      setSelectedNotifIds(notifications.map((n) => n.id));
    }
  };

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newKeywordInput.trim();
    if (!trimmed || keywords.includes(trimmed)) return;
    const updated = [...keywords, trimmed];
    setNewKeywordInput('');
    updateServerSettings({ keywords: updated });
  };

  const handleRemoveKeyword = (kw: string) => {
    const updated = keywords.filter((item) => item !== kw);
    updateServerSettings({ keywords: updated });
  };

  const handleMarkAllRead = async () => {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearAll: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClearNotifications = async () => {
    const res = await fetch('/api/notifications', { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      setNotifications([]);
      setSelectedNotifIds([]);
      setSelectedTestUids([]);
      if (Array.isArray(data.posts)) setPosts(data.posts);
    }
  };

  // Filtered Posts for Feed
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (!includeNotices && post.isNotice) return false;
      if (categoryFilter !== '전체' && !post.isNotice && post.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          post.title.toLowerCase().includes(q) ||
          post.author.toLowerCase().includes(q) ||
          post.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [posts, includeNotices, categoryFilter, searchQuery]);

  const progressRatio = useMemo(() => {
    if (!monitoringEnabled || intervalSec <= 0) return 0;
    return Math.min(1, Math.max(0, (intervalSec - remainingSec) / intervalSec));
  }, [monitoringEnabled, intervalSec, remainingSec]);

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '대기 중';
    try {
      return new Date(iso).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100">
      {/* Top Bar Contract: Strictly 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-4 sm:px-6 h-14 bg-white/90 dark:bg-[#0B0F19]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#feed"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('feed');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white font-display whitespace-nowrap shrink-0"
        >
          Astromart Pulse
        </a>

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'feed'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            장터 피드
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('webview')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'webview'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            웹뷰 브라우저
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'alerts'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            알림 센터 {unreadCount > 0 ? `(${unreadCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'border-sky-500 text-slate-900 dark:text-white'
                : 'border-transparent hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            모니터 설정
          </button>
        </nav>

        {/* Zone 3: 1 primary contextual action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              session.isLoggedIn
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
            }`}
          >
            {session.isLoggedIn ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>{session.username} 로그인 유지됨</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>아스트로마트 로그인 유지</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Real-time New Post Toast Banner */}
      {liveToast && (
        <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="p-3.5 rounded-xl bg-sky-500/15 border border-sky-500/30 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <BellRing className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-sky-600 dark:text-sky-300">
                  새로운 아스트로마트 장터 게시물이 감지되었습니다 · {liveToast.category} · 작성자 {liveToast.author}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {liveToast.title}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  openPostInWebView(liveToast.url, liveToast.uid);
                  setLiveToast(null);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 transition-colors whitespace-nowrap"
              >
                웹뷰로 열기
              </button>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Responsive Workspace (1440px Split View on Desktop, Tabbed View on Mobile) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 pb-24 lg:pb-6">
        {/* Top Monitoring Control Bar (Interval: 30s / 1m / 5m / 10m + Countdown + Push Trigger) */}
        <section className="mb-5 p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Countdown Ring & Status */}
          <div className="flex items-center gap-4">
            <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeDasharray={2 * Math.PI * 18}
                  strokeDashoffset={2 * Math.PI * 18 * (1 - progressRatio)}
                  strokeLinecap="round"
                  className="text-sky-500 transition-all duration-300"
                />
              </svg>
              <span className="absolute text-[11px] font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                {monitoringEnabled ? formatCountdown(remainingSec) : '일시정지'}
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 dark:text-white">
                  아스트로마트 중고장터 실시간 모니터
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>대상: astromart.co.kr/market</span>
                <span aria-hidden="true">·</span>
                <span>최근 확인 {formatTime(lastCheckedAt)}</span>
                <span aria-hidden="true">·</span>
                <span>감지된 게시물 {posts.filter((p) => !p.isNotice).length}건</span>
                {pollError && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-500">{pollError}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Middle: Interval Selector (30초, 1분, 5분, 10분) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                확인 주기
              </span>
              <div
                role="group"
                aria-label="확인 주기 선택"
                className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F19] border border-slate-200/70 dark:border-slate-800"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateServerSettings({ intervalSec: opt.value, monitoringEnabled: true })}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                      intervalSec === opt.value && monitoringEnabled
                        ? 'bg-sky-500 text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Quick Action Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => updateServerSettings({ monitoringEnabled: !monitoringEnabled })}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {monitoringEnabled ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>감시 일시정지</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-sky-400" />
                    <span>감시 재개</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => fetchMarketData(true)}
                disabled={isRefreshing}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
                <span>지금 확인</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateNewPost}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>새 글 알림 테스트</span>
              </button>

              {!isInstalled && (
                <button
                  type="button"
                  onClick={() => setIsInstallModalOpen(true)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-sky-400" />
                  <span>Android/iOS 설치</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2-Column Split Grid on Desktop (Left: Feed/Alerts/Settings, Right: Embedded WebView) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left Column (6 cols on lg; hidden on lg only if user explicitly expanded full-screen webview tab) */}
          <div
            className={`${
              activeTab === 'webview' ? 'hidden lg:flex lg:col-span-5' : 'flex lg:col-span-6'
            } flex-col gap-4`}
          >
            {/* Sub-View 1: Market Feed */}
            {(activeTab === 'feed' || activeTab === 'webview') && (
              <div className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                {/* Filter & Search Bar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Interactive Category Filter Buttons */}
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F19]">
                      {(['전체', '판매', '구입'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => updateServerSettings({ categoryFilter: cat })}
                          className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            categoryFilter === cat
                              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIncludeNotices((v) => !v)}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          includeNotices
                            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        공지사항 {includeNotices ? '표시중' : '숨김'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !soundEnabled;
                          setSoundEnabled(next);
                          localStorage.setItem('astromart_sound', String(next));
                          if (next) playNotificationChime();
                        }}
                        title={soundEnabled ? '알림음 켜짐' : '알림음 꺼짐'}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="장비명, 브랜드(ZWO, 다카하시, 드워프 등) 또는 작성자 검색..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {/* Test Post Selection & Deletion Checkbox Bar */}
                  {simulatedPostsInFeed.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25">
                      <label className="flex items-center gap-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer select-none min-h-[34px]">
                        <input
                          type="checkbox"
                          checked={
                            simulatedPostsInFeed.length > 0 &&
                            selectedTestUids.length === simulatedPostsInFeed.length
                          }
                          onChange={toggleSelectAllTestPosts}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-500 cursor-pointer"
                        />
                        <span>
                          테스트 알림글 전체 선택 ({selectedTestUids.length}/{simulatedPostsInFeed.length})
                        </span>
                      </label>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={selectedTestUids.length === 0}
                          onClick={() => handleDeleteTestPosts({ uids: selectedTestUids })}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>선택 삭제 ({selectedTestUids.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTestPosts({ deleteAll: true })}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
                        >
                          테스트글 일괄 삭제
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live Market Post List */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[640px] overflow-y-auto">
                  {isLoadingInitial ? (
                    <div className="p-6 space-y-4">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className="animate-pulse space-y-2">
                          <div className="h-3 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
                          <div className="h-4 w-4/5 bg-slate-200 dark:bg-slate-800 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        조건에 일치하는 장터 게시물이 없습니다.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('전체');
                          setSearchQuery('');
                        }}
                        className="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold"
                      >
                        필터 초기화
                      </button>
                    </div>
                  ) : (
                    filteredPosts.map((post) => {
                      const isSelected = selectedPostUid === post.uid;
                      const isTestChecked = selectedTestUids.includes(post.uid);
                      const matchedKw = keywords.find((kw) =>
                        post.title.toLowerCase().includes(kw.toLowerCase())
                      );
                      return (
                        <div
                          key={post.uid}
                          onClick={() => openPostInWebView(post.url, post.uid)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openPostInWebView(post.url, post.uid);
                            }
                          }}
                          className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-sky-500/10 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          }`}
                        >
                          {post.isSimulated && (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              title="테스트 알림글 삭제 선택"
                              className="min-h-[36px] min-w-[36px] -ml-1 flex items-center justify-center cursor-pointer shrink-0"
                            >
                              <input
                                type="checkbox"
                                checked={isTestChecked}
                                onChange={() => toggleSelectTestUid(post.uid)}
                                aria-label={`${post.title} 삭제 선택`}
                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-500 cursor-pointer"
                              />
                            </label>
                          )}

                          <div className="space-y-1 min-w-0 flex-1">
                            {/* Zero-Pill Metadata Discipline: Clean unboxed text with · separators */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              <span
                                className={`font-semibold ${
                                  post.category === '판매'
                                    ? 'text-sky-600 dark:text-sky-400'
                                    : post.category === '구입'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-600 dark:text-amber-400'
                                }`}
                              >
                                {post.category}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{post.author}</span>
                              <span aria-hidden="true">·</span>
                              <span>{post.dateText}</span>
                              <span aria-hidden="true">·</span>
                              <span>조회 {post.views}</span>
                              {post.votes > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>추천 {post.votes}</span>
                                </>
                              )}
                              {matchedKw && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    키워드 일치: {matchedKw}
                                  </span>
                                </>
                              )}
                              {post.isSimulated && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-sky-500 font-medium">테스트 알림글</span>
                                </>
                              )}
                            </div>

                            {/* Primary Post Title */}
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                              {post.title}
                              {post.commentCount > 0 && (
                                <span className="ml-1.5 text-xs font-mono text-sky-500 tabular-nums">
                                  [{post.commentCount}]
                                </span>
                              )}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {post.isSimulated && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTestPosts({ uids: [post.uid] });
                                }}
                                title="이 테스트 알림글 삭제"
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <a
                              href={post.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="새 탭에서 원본 글 열기"
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Sub-View 2: Real-Time Alerts & Push Notification Log */}
            {activeTab === 'alerts' && (
              <div className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        실시간 새 게시물 푸시 알림 기록
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        백그라운드 감시 중 새로 올라온 게시물 알림 내역입니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        모두 읽음
                      </button>
                      <button
                        type="button"
                        onClick={handleClearNotifications}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        기록 비우기
                      </button>
                    </div>
                  </div>

                  {notifications.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800">
                      <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none min-h-[34px]">
                        <input
                          type="checkbox"
                          checked={
                            notifications.length > 0 &&
                            selectedNotifIds.length === notifications.length
                          }
                          onChange={toggleSelectAllNotifications}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-500 cursor-pointer"
                        />
                        <span>
                          알림글 전체 선택 ({selectedNotifIds.length}/{notifications.length})
                        </span>
                      </label>

                      <button
                        type="button"
                        disabled={selectedNotifIds.length === 0}
                        onClick={() => handleDeleteTestPosts({ notifIds: selectedNotifIds })}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-semibold hover:bg-rose-600 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>선택 알림 삭제 ({selectedNotifIds.length})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Permission Banner if not granted */}
                {pushPermission !== 'granted' && (
                  <div className="p-4 bg-sky-500/10 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-sky-600 dark:text-sky-300">
                        백그라운드 시스템 푸시 알림 권한이 필요합니다
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        화면이 꺼져 있거나 다른 앱을 사용 중일 때도 새 글 알림을 받으려면 권한을 허용해주세요.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const perm = await requestPushNotificationPermission();
                        setPushPermission(perm);
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold whitespace-nowrap"
                    >
                      푸시 권한 허용하기
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[560px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-12 text-center space-y-3">
                      <Bell className="w-8 h-8 text-slate-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          아직 도착한 새 게시물 알림이 없습니다
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          상단의 [새 글 알림 테스트] 버튼을 눌러 실시간 백그라운드 푸시와 알림음을 즉시 테스트해보세요.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSimulateNewPost}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>새 글 알림 테스트 실행</span>
                      </button>
                    </div>
                  ) : (
                    notifications.map((notif) => {
                      const isNotifChecked = selectedNotifIds.includes(notif.id);
                      return (
                        <div
                          key={notif.id}
                          onClick={() => openPostInWebView(notif.url, notif.uid)}
                          role="button"
                          tabIndex={0}
                          className={`p-4 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                            !notif.read
                              ? 'bg-sky-500/5 dark:bg-sky-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <label
                            onClick={(e) => e.stopPropagation()}
                            title="알림 삭제 선택"
                            className="min-h-[36px] min-w-[36px] -ml-1 flex items-center justify-center cursor-pointer shrink-0"
                          >
                            <input
                              type="checkbox"
                              checked={isNotifChecked}
                              onChange={() => toggleSelectNotifId(notif.id)}
                              aria-label={`${notif.title} 알림 삭제 선택`}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-sky-500 focus:ring-sky-500 cursor-pointer"
                            />
                          </label>

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              <span className="font-semibold text-sky-500">{notif.category}</span>
                              <span aria-hidden="true">·</span>
                              <span>{notif.author}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatTime(notif.timestamp)}</span>
                              {notif.matchedKeyword && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-500 font-medium">
                                    키워드: {notif.matchedKeyword}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {notif.title}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTestPosts({ notifIds: [notif.id], uids: [notif.uid] });
                              }}
                              title="이 알림 삭제"
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-sky-500 font-medium whitespace-nowrap">
                              웹뷰 보기
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Sub-View 3: Monitor Settings & Keyword Watchlist */}
            {activeTab === 'settings' && (
              <div className="flex flex-col bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    실시간 알림 조건 및 키워드 워치리스트
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    모든 새 글을 알림 받거나, 원하는 천체망원경·적도의·카메라 키워드만 골라서 푸시 알림을 받을 수 있습니다.
                  </p>
                </div>

                {/* Alert Mode Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateServerSettings({ notifyAllNewPosts: true })}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      notifyAllNewPosts
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        모든 새 게시물 즉시 알림
                      </span>
                      {notifyAllNewPosts && <Check className="w-4 h-4 text-sky-500" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      아스트로마트 장터에 새로운 판매/구입 글이 올라올 때마다 빠짐없이 푸시 알림을 보냅니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateServerSettings({ notifyAllNewPosts: false })}
                    className={`p-4 rounded-xl border text-left transition-colors ${
                      !notifyAllNewPosts
                        ? 'border-sky-500 bg-sky-500/10'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        등록 키워드 일치 시에만 알림
                      </span>
                      {!notifyAllNewPosts && <Check className="w-4 h-4 text-sky-500" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      아래에 등록한 관심 장비 키워드가 제목에 포함된 경우에만 정밀 푸시 알림을 보냅니다.
                    </p>
                  </button>
                </div>

                {/* Keyword Watchlist Manager */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    관심 장비 키워드 등록 (예: ZWO, 드워프3, 다카하시, AM5, 안시)
                  </label>
                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <input
                      type="text"
                      value={newKeywordInput}
                      onChange={(e) => setNewKeywordInput(e.target.value)}
                      placeholder="추가할 키워드 입력..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>키워드 추가</span>
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {keywords.map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        title="클릭하여 키워드 삭제"
                        className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/15 hover:text-rose-400 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors"
                      >
                        <span>{kw}</span>
                        <Trash2 className="w-3 h-3 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Push / Sound / Vibration / Theme Preferences */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    백그라운드 푸시 & 기기 환경 설정
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          시스템 푸시 알림 권한
                        </p>
                        <p className="text-[11px] text-slate-500">
                          상태: {pushPermission === 'granted' ? '허용됨' : pushPermission === 'denied' ? '차단됨' : '미설정'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const perm = await requestPushNotificationPermission();
                          setPushPermission(perm);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 text-xs font-semibold"
                      >
                        {pushPermission === 'granted' ? '권한 확인됨' : '권한 요청'}
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          진동 및 사운드 알림
                        </p>
                        <p className="text-[11px] text-slate-500">
                          새 글 도착 시 차임벨 및 진동 울림
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !vibrateEnabled;
                          setVibrateEnabled(next);
                          setSoundEnabled(next);
                          localStorage.setItem('astromart_vibrate', String(next));
                          localStorage.setItem('astromart_sound', String(next));
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                      >
                        {soundEnabled ? '켜짐' : '꺼짐'}
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          야간 관측 다크 모드
                        </p>
                        <p className="text-[11px] text-slate-500">
                          눈부심 방지 다크/라이트 테마 전환
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDarkMode((d) => !d)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"
                      >
                        {darkMode ? <Moon className="w-3.5 h-3.5 text-sky-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                        <span>{darkMode ? '다크 모드' : '라이트 모드'}</span>
                      </button>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          크로스 플랫폼 앱 설치
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Android / iOS 홈 화면 독립 실행
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsInstallModalOpen(true)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 text-xs font-semibold"
                      >
                        설치 가이드
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Session-Aware Embedded WebView (Always visible on Desktop lg+, or when 'webview' tab is active on Mobile) */}
          <div
            className={`${
              activeTab === 'webview' ? 'flex lg:col-span-7' : 'hidden lg:flex lg:col-span-6'
            } flex-col min-h-[620px]`}
          >
            <WebViewPane
              currentUrl={webViewUrl}
              onNavigateUrl={(url) => setWebViewUrl(url)}
              session={session}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
            />
          </div>
        </div>
      </main>

      {/* Mobile Bottom Tab Bar (Follows 15% Mobile Sticky Cap & 44x44px Hitboxes) */}
      <nav
        aria-label="모바일 하단 내비게이션"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0B0F19]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-4 items-center h-16 pb-safe"
      >
        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'feed'
              ? 'text-sky-500'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <ListFilter className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1">장터 피드</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('webview')}
          className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'webview'
              ? 'text-sky-500'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Globe className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1">웹뷰 브라우저</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('alerts')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'alerts'
              ? 'text-sky-500'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1">
            알림 {unreadCount > 0 ? `(${unreadCount})` : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
            activeTab === 'settings'
              ? 'text-sky-500'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span className="text-[11px] font-medium mt-1">설정·로그인</span>
        </button>
      </nav>

      {/* Modals */}
      <AuthSessionModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        session={session}
        onSessionUpdated={(updated) => setSession(updated)}
        onOpenWebViewLogin={() => {
          openPostInWebView('https://www.astromart.co.kr/login/');
        }}
      />

      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </div>
  );
}
