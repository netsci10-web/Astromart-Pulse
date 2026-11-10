import React, { useState } from 'react';
import { X, Github, Copy, Check, Server, Globe, Download, Upload } from 'lucide-react';
import { PollingIntervalSec } from '../types';

interface GitHubDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  isStaticMode: boolean;
  keywords: string[];
  intervalSec: PollingIntervalSec;
  onImportSettings: (data: { keywords?: string[]; intervalSec?: PollingIntervalSec }) => void;
}

export const GitHubDeployModal: React.FC<GitHubDeployModalProps> = ({
  isOpen,
  onClose,
  isStaticMode,
  keywords,
  intervalSec,
  onImportSettings,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deployTab, setDeployTab] = useState<'pages' | 'fullstack'>('pages');

  if (!isOpen) return null;

  const gitCommands = `git init
git add .
git commit -m "Deploy Astromart Pulse PWA"
git branch -M main
git remote add origin https://github.com/내아이디/astromart-pulse.git
git push -u origin main`;

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleExportConfig = () => {
    const config = {
      app: 'Astromart Pulse',
      exportedAt: new Date().toISOString(),
      intervalSec,
      keywords,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'astromart-pulse-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        onImportSettings({
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : undefined,
          intervalSec: [30, 60, 300, 600].includes(Number(parsed.intervalSec))
            ? (Number(parsed.intervalSec) as PollingIntervalSec)
            : undefined,
        });
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <Github className="w-5 h-5 text-sky-500" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              GitHub 업로드 및 배포 가이드 (Pages & 풀스택 지원)
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
          {/* Runtime Mode Indicator */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                현재 작동 엔진: {isStaticMode ? 'GitHub Pages / 정적 브라우저 엔진 모드' : 'Node.js 풀스택 서버 + SSE 실시간 엔진 모드'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                이 앱은 서버가 있는 환경과 GitHub Pages 무료 정적 호스팅 환경을 자동으로 감지하여 둘 다 100% 작동합니다.
              </p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setDeployTab('pages')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                deployTab === 'pages'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-sky-500" />
              <span>01. GitHub Pages 무료 배포 (서버 불필요)</span>
            </button>
            <button
              type="button"
              onClick={() => setDeployTab('fullstack')}
              className={`min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                deployTab === 'fullstack'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-emerald-500" />
              <span>02. 풀스택 서버 배포 (Render / Docker)</span>
            </button>
          </div>

          {deployTab === 'pages' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/25 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  GitHub에 올리기만 하면 GitHub Actions가 자동으로 앱을 빌드·배포합니다
                </h3>
                <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    우측 상단 <strong>GitHub 내보내기(Export to GitHub)</strong>를 클릭하거나 아래 Git 명령어로 저장소에 업로드합니다.
                  </li>
                  <li>
                    생성된 GitHub 저장소의 <strong>Settings → Pages</strong>로 이동합니다.
                  </li>
                  <li>
                    <strong>Build and deployment → Source</strong>를 <strong>GitHub Actions</strong>로 선택합니다.
                  </li>
                  <li>
                    포함된 <code>.github/workflows/deploy-pages.yml</code>이 자동 실행되어 <code>https://아이디.github.io/저장소명/</code>에 즉시 배포됩니다.
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    GitHub 업로드 명령어
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('git', gitCommands)}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    {copiedKey === 'git' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'git' ? '복사됨' : '명령어 복사'}</span>
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto leading-relaxed">
                  {gitCommands}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  풀스택 서버 배포 (`Dockerfile` & `render.yaml` 포함 완료)
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  아스트로마트 로그인 쿠키 유지(<code>wordpress_logged_in</code>)와 서버 사이드 인앱 웹뷰 프록시(<code>/api/webview</code>)를 그대로 사용하려면 GitHub 저장소를 <strong>Render.com</strong>, <strong>Railway</strong>, 또는 <strong>Cloud Run</strong>에 연결하세요.
                </p>
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                  <li>포함된 설정 파일: <code>Dockerfile</code>, <code>render.yaml</code>, <code>.gitignore</code> (개인 세션 폴더 <code>.data/</code> 자동 제외)</li>
                  <li>빌드 명령어: <code>npm install && npm run build</code></li>
                  <li>실행 명령어: <code>npm start</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* Settings Export / Import for portability */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                내 키워드 & 확인주기 설정 백업 / 복원
              </p>
              <p className="text-[11px] text-slate-500">
                GitHub 배포 후에도 내 관심 키워드 목록을 JSON 파일로 바로 불러올 수 있습니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportConfig}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>설정 내보내기</span>
              </button>
              <label className="min-h-[36px] px-3 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-xs font-semibold text-sky-600 dark:text-sky-300 flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>설정 불러오기</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleImportConfig}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
