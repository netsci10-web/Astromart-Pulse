import React from 'react';
import { X, Download, Smartphone, CheckCircle2, BellRing } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-sky-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Android & iOS 크로스 플랫폼 설치 안내
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

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {isInstalled ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-emerald-600 dark:text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>현재 독립 실행형(Standalone) 앱 모드로 실행 중입니다. 백그라운드 푸시 알림과 로그인 세션이 유지됩니다.</span>
            </div>
          ) : isInstallable ? (
            <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  원클릭 홈 화면 앱 설치 지원 기기
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  브라우저 주소창 없이 네이티브 앱처럼 실행하고 백그라운드 푸시를 받으세요.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const ok = await install();
                  if (ok) onClose();
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>지금 앱 설치</span>
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                01. Android (Chrome / 삼성 인터넷)
              </h3>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>우측 상단 메뉴(⋮) 또는 하단 바를 탭합니다.</li>
                <li><strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택합니다.</li>
                <li>설치된 <strong>AstroPulse</strong> 실행 후 알림 권한을 허용하면 백그라운드 푸시가 즉시 작동합니다.</li>
              </ol>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                02. iOS / iPadOS (Safari 16.4+)
              </h3>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Safari 하단 툴바의 <strong>공유 버튼(□↑)</strong>을 탭합니다.</li>
                <li>아래로 스크롤하여 <strong>홈 화면에 추가</strong>를 탭합니다.</li>
                <li>홈 화면에 생성된 앱 아이콘으로 실행한 뒤 <strong>푸시 알림 권한 허용</strong>을 누르면 iOS 네이티브 알림이 활성화됩니다.</li>
              </ol>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
            <BellRing className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              서버 백그라운드 워커가 설정된 주기(<strong>30초 · 1분 · 5분 · 10분</strong>)마다 <code>astromart.co.kr/market</code>의 새 글을 감시하며, 새 게시물 발견 시 Service Worker 푸시 알림과 효과음·진동으로 즉시 알려줍니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
