import React, { useState } from 'react';
import { X, ShieldCheck, KeyRound, Cookie, Globe, LogOut, CheckCircle2 } from 'lucide-react';
import { SessionStatus } from '../types';

interface AuthSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionStatus;
  onSessionUpdated: (session: SessionStatus) => void;
  onOpenWebViewLogin: () => void;
}

export const AuthSessionModal: React.FC<AuthSessionModalProps> = ({
  isOpen,
  onClose,
  session,
  onSessionUpdated,
  onOpenWebViewLogin,
}) => {
  const [mode, setMode] = useState<'credentials' | 'cookie'>('credentials');
  const [username, setUsername] = useState(session.username || '');
  const [password, setPassword] = useState('');
  const [keepAlive, setKeepAlive] = useState(true);
  const [allowLocalPersist, setAllowLocalPersist] = useState(true);
  const [cookieString, setCookieString] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);

    try {
      const payload =
        mode === 'cookie'
          ? { username: username || 'Astromart 회원', cookieString, keepAlive }
          : { username, password, keepAlive, allowLocalPersist };

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        onSessionUpdated(data.session);
        localStorage.setItem('astromart_saved_user', data.session.username || username);
        setStatusMessage({
          type: 'success',
          text: data.message || '로그인 세션 유지가 활성화되었습니다.',
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.message || '로그인 연동에 실패했습니다.',
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: '서버와 통신하는 중 오류가 발생했습니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        localStorage.removeItem('astromart_saved_user');
        onSessionUpdated(data.session);
        setStatusMessage({ type: 'success', text: '세션이 안전하게 해제되었습니다.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-sky-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              아스트로마트 로그인 상태 유지 설정
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Active Session Summary */}
          {session.isLoggedIn && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>로그인 세션 유지 활성화됨 (Keep-Alive 작동 중)</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  계정: <strong>{session.username}</strong> · 5분 주기로 세션 쿠키 자동 갱신
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-rose-500/20 hover:text-rose-400 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>연동 해제</span>
              </button>
            </div>
          )}

          {/* Mode Selector Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMode('credentials')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'credentials'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>계정 로그인 유지</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('cookie')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'cookie'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Cookie className="w-3.5 h-3.5" />
              <span>쿠키 직접 입력</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'credentials' ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    아스트로마트 아이디 또는 이메일
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="astromart.co.kr 아이디 입력"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-2.5 pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={keepAlive}
                      onChange={(e) => setKeepAlive(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong>로그인 상태 영구 유지 (Session Keep-Alive)</strong>: 백그라운드에서 세션 만료를 방지하고 앱 재실행 시에도 로그인을 유지합니다.
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowLocalPersist}
                      onChange={(e) => setAllowLocalPersist(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      <strong>웹뷰 로그인 폼 자동완성 연동</strong>: 인앱 웹뷰에서 아스트로마트 로그인 페이지 접속 시 아이디/비밀번호를 자동으로 채웁니다.
                    </span>
                  </label>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    표시할 회원 별칭 (선택)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="예: 내 아스트로마트 계정"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    세션 쿠키 문자열 (`wordpress_logged_in_...=...`)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={cookieString}
                    onChange={(e) => setCookieString(e.target.value)}
                    placeholder="wordpress_logged_in_xxxx=..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </>
            )}

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs leading-relaxed ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/20'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {loading ? '세션 동기화 중...' : '로그인 유지 저장 및 활성화'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenWebViewLogin();
                }}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Globe className="w-4 h-4" />
                <span>웹뷰에서 직접 로그인</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
