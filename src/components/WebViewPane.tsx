import React, { useState, useRef, useEffect } from 'react';
import {
  RotateCw,
  Home,
  ExternalLink,
  Lock,
  Smartphone,
  Monitor,
  LogIn,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { SessionStatus } from '../types';

interface WebViewPaneProps {
  currentUrl: string;
  onNavigateUrl: (url: string) => void;
  session: SessionStatus;
  onOpenAuthModal: () => void;
  isStaticMode?: boolean;
}

export const WebViewPane: React.FC<WebViewPaneProps> = ({
  currentUrl,
  onNavigateUrl,
  session,
  onOpenAuthModal,
  isStaticMode = false,
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isLoading, setIsLoading] = useState(true);
  const [viewportMode, setViewportMode] = useState<'responsive' | 'mobile'>('responsive');
  const [historyStack, setHistoryStack] = useState<string[]>([currentUrl]);
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    setUrlInput(currentUrl);
    setIsLoading(true);
    setHistoryStack((prev) => {
      if (prev[prev.length - 1] === currentUrl) return prev;
      return [...prev.slice(-15), currentUrl];
    });
  }, [currentUrl]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'ASTROMART_WEBVIEW_NAV' && event.data.url) {
        setUrlInput(event.data.url);
        setIsLoading(false);
      } else if (event.data.type === 'ASTROMART_STATIC_GOTO' && event.data.url) {
        onNavigateUrl(event.data.url);
      } else if (event.data.type === 'OPEN_AUTH_MODAL') {
        onOpenAuthModal();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onNavigateUrl, onOpenAuthModal]);

  // In static mode (GitHub Pages), load currentUrl directly in the iframe since astromart.co.kr does not send X-Frame-Options
  const iframeSrc = isStaticMode
    ? `${currentUrl}${currentUrl.includes('?') ? '&' : '?'}_r=${reloadKey}`
    : `/api/webview?url=${encodeURIComponent(currentUrl)}&_r=${reloadKey}`;

  const handleGoBack = () => {
    if (historyStack.length > 1) {
      const nextStack = historyStack.slice(0, -1);
      const prevUrl = nextStack[nextStack.length - 1];
      setHistoryStack(nextStack);
      onNavigateUrl(prevUrl);
    } else {
      onNavigateUrl('https://www.astromart.co.kr/market/');
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('http')) {
      trimmed = `https://www.astromart.co.kr${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
    }
    onNavigateUrl(trimmed);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* WebView Browser Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 dark:bg-[#0B0F19] border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleGoBack}
            title="이전 페이지"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigateUrl('https://www.astromart.co.kr/market/')}
            title="장터 홈 (astromart.co.kr/market)"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <Home className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setReloadKey((k) => k + 1);
            }}
            title="웹뷰 새로고침"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-500' : ''}`} />
          </button>
        </div>

        {/* Address Bar */}
        <form onSubmit={handleUrlSubmit} className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
            <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              aria-label="웹뷰 주소창"
              className="w-full bg-transparent text-slate-700 dark:text-slate-200 font-mono text-xs focus:outline-none truncate"
            />
          </div>
        </form>

        {/* Right Controls: Session Status + Viewport Mode + External Link */}
        <div className="flex items-center gap-1.5">
          {session.isLoggedIn ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{session.username} 유지중</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigateUrl('https://www.astromart.co.kr/login/')}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-300 text-xs font-medium flex items-center gap-1.5 hover:bg-sky-500/20 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>웹뷰 로그인</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setViewportMode((m) => (m === 'responsive' ? 'mobile' : 'responsive'))
            }
            title={viewportMode === 'responsive' ? '모바일 폭으로 보기' : '전체 폭으로 보기'}
            className="hidden sm:flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
          >
            {viewportMode === 'responsive' ? (
              <Smartphone className="w-4 h-4" />
            ) : (
              <Monitor className="w-4 h-4" />
            )}
          </button>

          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="새 브라우저 탭에서 원본 열기"
            className="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">원본 열기</span>
          </a>
        </div>
      </div>

      {/* Quick Navigation Sub-bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-100/70 dark:bg-slate-900/70 border-b border-slate-200/70 dark:border-slate-800/80 text-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => onNavigateUrl('https://www.astromart.co.kr/market/?mod=list')}
            className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            전체 장터
          </button>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <button
            type="button"
            onClick={() =>
              onNavigateUrl('https://www.astromart.co.kr/market/?mod=list&category1=%ED%8C%90%EB%A7%A4')
            }
            className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            판매 목록
          </button>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <button
            type="button"
            onClick={() =>
              onNavigateUrl('https://www.astromart.co.kr/market/?mod=list&category1=%EA%B5%AC%EC%9E%85')
            }
            className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            구입 목록
          </button>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <button
            type="button"
            onClick={() => onNavigateUrl('https://www.astromart.co.kr/login/')}
            className="px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            로그인 페이지
          </button>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
          {isStaticMode ? 'GitHub Pages 직결 웹뷰' : '세션 프록시 연동됨'}
        </span>
      </div>

      {/* Embedded WebView Viewport */}
      <div className="relative flex-1 bg-slate-100 dark:bg-[#080B12] flex justify-center overflow-hidden min-h-[480px]">
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-sky-500/20 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
          </div>
        )}
        <div
          className={`h-full transition-all duration-150 bg-white ${
            viewportMode === 'mobile'
              ? 'w-[390px] max-w-full border-x border-slate-300 dark:border-slate-800 shadow-xl'
              : 'w-full'
          }`}
        >
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="Astromart Embedded WebView"
            onLoad={() => setIsLoading(false)}
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
