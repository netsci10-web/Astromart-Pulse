import React, { useEffect, useState } from 'react';
import {
  X,
  ExternalLink,
  RotateCw,
  LogIn,
  ShieldCheck,
  Columns,
  FileText,
  Globe,
  User,
  Clock,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { MarketPost, SessionStatus } from '../types';
import { fetchPostDetailViaJsonp } from '../utils/clientFallbackEngine';

interface PostDetailModalProps {
  post: MarketPost | null;
  isOpen: boolean;
  onClose: () => void;
  isStaticMode: boolean;
  session: SessionStatus;
  onOpenAuthModal: () => void;
  onSendToRightWebView: (url: string, uid: string) => void;
}

export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  post,
  isOpen,
  onClose,
  isStaticMode,
  session,
  onOpenAuthModal,
  onSendToRightWebView,
}) => {
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<'reader' | 'iframe' | 'login'>('reader');
  const [detailState, setDetailState] = useState<{
    checked: boolean;
    requiresLogin: boolean;
    contentHtml: string;
  }>({
    checked: false,
    requiresLogin: false,
    contentHtml: '',
  });

  useEffect(() => {
    if (!isOpen || !post) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, post, onClose]);

  useEffect(() => {
    if (!isOpen || !post) return;
    setLoading(true);

    if (!isStaticMode) {
      setViewMode('iframe');
      setDetailState({ checked: true, requiresLogin: false, contentHtml: '' });
      return;
    }

    let cancelled = false;
    setDetailState({ checked: false, requiresLogin: false, contentHtml: '' });

    fetchPostDetailViaJsonp(post.uid, 6500)
      .then((res) => {
        if (cancelled) return;
        setDetailState({
          checked: true,
          requiresLogin: res.requiresLogin,
          contentHtml: res.contentHtml,
        });
        setViewMode('reader');
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailState({
          checked: true,
          requiresLogin: true,
          contentHtml: '',
        });
        setViewMode('reader');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, post, isStaticMode, reloadKey]);

  if (!isOpen || !post) return null;

  const canonicalUrl = `https://www.astromart.co.kr/market/?mod=document&uid=${post.uid}`;
  const loginRedirectUrl = `https://www.astromart.co.kr/login/?redirect_to=${encodeURIComponent(canonicalUrl)}`;

  const iframeUrl =
    viewMode === 'login'
      ? isStaticMode
        ? loginRedirectUrl
        : `/api/webview?url=${encodeURIComponent(loginRedirectUrl)}&_r=${reloadKey}`
      : isStaticMode
      ? `${canonicalUrl}&_r=${reloadKey}`
      : `/api/webview?url=${encodeURIComponent(canonicalUrl)}&_r=${reloadKey}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[86vh] flex flex-col rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Popup Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-[#0B0F19] border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums mb-0.5">
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
              <span>작성자 {post.author}</span>
              <span aria-hidden="true">·</span>
              <span>{post.dateText}</span>
              <span aria-hidden="true">·</span>
              <span>조회 {post.views}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">#{post.uid}</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
              {post.title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              title="팝업 새로고침"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                onSendToRightWebView(canonicalUrl, post.uid);
                onClose();
              }}
              title="우측 웹뷰 영역으로 보내기"
              className="hidden lg:flex min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Columns className="w-3.5 h-3.5 text-sky-400" />
              <span>우측 웹뷰로 이동</span>
            </button>

            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>새 탭에서 원문 열기</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              aria-label="팝업 닫기"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Toolbar for View Mode Switching */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200/80 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode('reader')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'reader'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>게시물 요약 / 본문 리더</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setViewMode('iframe');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'iframe'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>임베디드 웹뷰 화면</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setViewMode('login');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'login'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              <span>팝업 내 아스트로마트 로그인</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {session.isLoggedIn ? (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:underline"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{session.username} 계정 유지 설정됨</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1 hover:underline"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>로그인 상태 유지 설정</span>
              </button>
            )}
          </div>
        </div>

        {/* Popup Body */}
        <div className="relative flex-1 overflow-y-auto bg-[#F8FAFC] dark:bg-[#0B0F19]">
          {viewMode === 'reader' ? (
            <div className="max-w-3xl mx-auto p-5 sm:p-8 space-y-6">
              {/* Post Summary Card */}
              <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      post.category === '판매'
                        ? 'text-sky-500'
                        : post.category === '구입'
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    }`}
                  >
                    아스트로마트 중고장터 · {post.category}
                  </span>
                  <span className="text-xs font-mono text-slate-400">UID #{post.uid}</span>
                </div>

                <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                  {post.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>작성자: <strong>{post.author}</strong></span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>등록일시: {post.dateText}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>조회수: {post.views}회</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                    <span>댓글: {post.commentCount}개</span>
                  </span>
                </div>
              </div>

              {/* Detail Content or Member Login Guide */}
              {!detailState.checked ? (
                <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4 animate-pulse">
                  <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-4 w-5/6 bg-slate-200 dark:bg-slate-800 rounded" />
                </div>
              ) : detailState.contentHtml && !detailState.requiresLogin ? (
                <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 prose dark:prose-invert max-w-none text-sm leading-relaxed overflow-x-auto">
                  <div dangerouslySetInnerHTML={{ __html: detailState.contentHtml }} />
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/25 space-y-2">
                    <p className="text-sm font-bold text-sky-600 dark:text-sky-300">
                      아스트로마트 장터 본문 열람 안내
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      아스트로마트 중고장터는 게시물 제목·분류·작성자·등록시각은 비회원에게도 실시간 공개하지만, 상세 본문 및 연락처는 아스트로마트 로그인 쿠키가 있는 상태에서만 열람할 수 있도록 제한하고 있습니다.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        setViewMode('login');
                      }}
                      className="min-h-[42px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>이 팝업창 안에서 아스트로마트 로그인하기</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        setViewMode('iframe');
                      }}
                      className="min-h-[42px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span>임베디드 웹뷰 화면으로 보기</span>
                    </button>

                    <a
                      href={canonicalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-emerald-400" />
                      <span>새 브라우저 탭에서 원본 게시글 열기</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col">
              {loading && (
                <div className="h-0.5 w-full bg-sky-500/20 overflow-hidden">
                  <div className="h-full w-1/3 bg-sky-500 animate-pulse" />
                </div>
              )}
              <iframe
                src={iframeUrl}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title={post.title}
                onLoad={() => setLoading(false)}
                className="w-full flex-1 border-0 bg-white"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
