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
import { fetchHtmlViaCorsProxy } from '../utils/clientFallbackEngine';

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
  const [staticSrcDoc, setStaticSrcDoc] = useState<string | null>(null);
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
    if (!isStaticMode) {
      setStaticSrcDoc(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetchHtmlViaCorsProxy(currentUrl)
      .then((rawHtml) => {
        if (cancelled) return;
        const isPermissionDeniedAlert =
          rawHtml.includes("alert('권한이 없습니다.')") ||
          rawHtml.includes('alert("권한이 없습니다.")');
        if (isPermissionDeniedAlert) {
          setStaticSrcDoc(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/><style>
  body { margin:0; padding:24px; background:#0B0F19; color:#F8FAFC; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
  .card { max-width:560px; margin:0 auto; background:#111827; border:1px solid #1E293B; border-radius:16px; padding:24px; }
  .btn { display:inline-block; margin-top:16px; margin-right:8px; padding:10px 16px; border-radius:10px; background:#38BDF8; color:#0B0F19; font-weight:600; font-size:13px; text-decoration:none; }
</style></head><body>
  <div class="card">
    <h2 style="font-size:17px;margin-top:0;">아스트로마트 회원 전용 게시글 안내</h2>
    <p style="font-size:13px;color:#CBD5E1;line-height:1.6;">
      현재 GitHub Pages(정적 호스팅) 모드로 실행 중입니다. 아스트로마트 본문 열람은 정식 로그인 쿠키가 필요하므로 아래 버튼으로 원본 페이지에서 열람하거나 풀스택 서버 모드로 배포하여 인앱 쿠키 프록시를 이용하세요.
    </p>
    <a class="btn" href="${currentUrl}" target="_blank" rel="noopener noreferrer">아스트로마트 원본 창에서 바로 열기</a>
  </div>
</body></html>`);
        } else {
          const enhanced = rawHtml.replace(
            /<head([^>]*)>/i,
            `<head$1><base href="https://www.astromart.co.kr/" /><script>
              document.addEventListener('click', function(e) {
                var a = e.target && e.target.closest ? e.target.closest('a') : null;
                if (!a) return;
                var href = a.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
                try {
                  var resolved = new URL(href, ${JSON.stringify(currentUrl)});
                  if (resolved.hostname.endsWith('astromart.co.kr')) {
                    e.preventDefault();
                    window.parent.postMessage({ type: 'ASTROMART_STATIC_GOTO', url: resolved.toString() }, '*');
                  }
                } catch (err) {}
              }, true);
            </script>`
          );
          setStaticSrcDoc(enhanced);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStaticSrcDoc(`<!doctype html>
<html lang="ko"><body style="background:#0B0F19;color:#F8FAFC;font-family:sans-serif;padding:24px;">
  <h3>외부 페이지 연결 안내</h3>
  <p style="color:#94A3B8;font-size:13px;">브라우저 보안 정책으로 인해 새 탭에서 아스트로마트 원본 페이지를 열 수 있습니다.</p>
  <a href="${currentUrl}" target="_blank" rel="noopener noreferrer" style="color:#38BDF8;font-weight:bold;">새 탭에서 ${currentUrl} 열기</a>
</body></html>`);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUrl, reloadKey, isStaticMode]);

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

  const proxySrc = `/api/webview?url=${encodeURIComponent(currentUrl)}&_r=${reloadKey}`;

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
          {isStaticMode ? 'GitHub Pages 웹뷰' : '세션 프록시 연동됨'}
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
          {isStaticMode ? (
            <iframe
              ref={iframeRef}
              srcDoc={staticSrcDoc || ''}
              title="Astromart Static WebView"
              className="w-full h-full border-0 bg-white"
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={proxySrc}
              title="Astromart Embedded WebView"
              onLoad={() => setIsLoading(false)}
              className="w-full h-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};
