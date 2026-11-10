# Astromart Pulse — 아스트로마트 중고장터 실시간 알림 & 크로스 플랫폼 웹뷰 앱

[아스트로마트 중고장터 (`https://www.astromart.co.kr/market/`)](https://www.astromart.co.kr/market/)에 새로운 판매/구입 게시물이 올라오면 **30초 · 1분 · 5분 · 10분** 주기로 실시간 감지하여 **백그라운드 푸시 알림**을 보내고, **로그인 상태를 유지하는 인앱 웹뷰**를 제공하는 Android / iOS / 데스크톱 크로스 플랫폼 PWA 애플리케이션입니다.

---

## 주요 기능

1. **실시간 새 게시물 감지 (30초 / 1분 / 5분 / 10분 주기)**
   - 아스트로마트 KBoard 장터의 신규 게시글(`UID`)을 주기적으로 스캔하고, 전체 새 글 또는 관심 키워드(`ZWO`, `드워프`, `적도의`, `다카하시`, `쌍안경` 등) 일치 시 즉시 푸시 알림을 발송합니다.
2. **백그라운드 푸시 알림 & 테스트 알림글 체크박스 관리**
   - Service Worker 기반 시스템 알림, 차임벨 사운드, 모바일 진동, 앱 아이콘 배지를 지원합니다.
   - **[새 글 알림 테스트]** 버튼으로 즉시 알림을 시험해볼 수 있으며, 체크박스를 통해 테스트 알림글을 개별 또는 일괄 삭제할 수 있습니다.
3. **로그인 상태 유지 (Session Keep-Alive) & 인앱 웹뷰**
   - 풀스택 서버 모드에서는 `wp-login.php` 세션 쿠키(`wordpress_logged_in_*`)를 서버가 유지·자동 갱신하며, 인앱 프록시 웹뷰에서 로그인된 상태로 본문을 바로 열람할 수 있습니다.
   - GitHub Pages 정적 호스팅 모드에서도 브라우저 CORS 프록시 기반 실시간 장터 파싱과 외부/인앱 뷰어 연동이 자동으로 작동합니다.
4. **Android & iOS 크로스 플랫폼 PWA**
   - Android (Chrome / 삼성 인터넷 **홈 화면에 앱 설치**) 및 iOS/iPadOS (Safari **홈 화면에 추가**, iOS 16.4+ 웹 푸시) 완벽 지원.

---

## GitHub에 올려서 사용하는 2가지 방법

### 방법 1: GitHub Pages로 무료 정적 호스팅 (서버 없이 즉시 사용)
이 저장소에는 `.github/workflows/deploy-pages.yml` 워크플로우와 **클라이언트 단독 폴링 엔진**이 내장되어 있어, GitHub Pages만 켜면 별도 서버 없이도 실시간 장터 모니터링과 푸시 알림이 작동합니다.

1. AI Studio 우측 상단의 **GitHub 아이콘(Export to GitHub)**을 클릭하거나 아래 명령어로 내 GitHub 저장소에 푸시합니다:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Astromart Pulse PWA"
   git branch -M main
   git remote add origin https://github.com/<내-아이디>/<저장소-이름>.git
   git push -u origin main
   ```
2. GitHub 저장소의 **Settings → Pages** 메뉴로 이동합니다.
3. **Build and deployment → Source**를 **`GitHub Actions`**로 선택합니다.
4. 자동으로 워크플로우가 실행되며 `https://<내-아이디>.github.io/<저장소-이름>/` 주소로 배포됩니다.

### 방법 2: GitHub 연동 풀스택 서버 배포 (Render / Railway / Cloud Run)
아스트로마트 로그인 세션 쿠키 유지(`Session Keep-Alive`)와 서버 사이드 인앱 웹뷰 프록시(`/api/webview`)까지 100% 활용하려면 포함된 `Dockerfile` 또는 `render.yaml`을 사용하여 배포하세요.

- **Render.com**: GitHub 저장소 연결 → `New Web Service` → Build Command: `npm install && npm run build`, Start Command: `npm start`
- **로컬 / 개인 서버 실행**:
  ```bash
  npm install
  npm run dev
  # 프로덕션 실행 시:
  npm run build && npm start
  ```
