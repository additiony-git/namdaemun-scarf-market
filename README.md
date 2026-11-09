# 쓸모없는 소비시장

남대문시장과 스카프 아저씨의 장사 화법에서 영감을 받은 브라우저 3D 수집 게임입니다. 현재 남대문 스카프 상회를 운영합니다.

## 지금 플레이하기

- **혼자:** `play.html`을 브라우저로 엽니다. 파일이 없으면 이 폴더에서 `node scripts/standalone.mjs`를 실행합니다. 체험 기록은 이 브라우저에 저장됩니다.
- **온라인 방식으로 로컬 실행:** Node.js 22.13 이상에서 `node server/local.mjs`를 실행하고 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)을 엽니다. 서로 다른 브라우저 프로필이나 일반·시크릿 창을 사용하면 별도 상인으로 입장합니다. 기록은 `.market-data/`에 저장됩니다. 같은 와이파이에서 테스트하려면 `node server/local.mjs --host 0.0.0.0`로 실행하고 참가자는 호스트 PC의 사설 IP로 접속합니다. 기본 실행은 이 PC 안에서만 열립니다.
- **조작:** WASD 또는 방향키로 이동합니다. 매대에 가까이 가면 상품 목록이 열리고, E로 닫거나 다시 열 수 있습니다. Enter 또는 **채팅**을 누르면 온라인 골목에서 80자까지 말할 수 있고, 말풍선은 7초 뒤 사라집니다. 휴대폰에서는 화면의 방향 버튼을 씁니다.
- **시장 소리:** 시장 안이나 관람 화면 상단의 스피커 버튼으로 장터 배경음과 거래 효과음을 켜고 끕니다. 배경음은 dikolson의 남대문시장 현장 녹음(CC0)을 반복 재생에 맞게 편집했습니다. [Freesound의 원본 녹음](https://freesound.org/people/dikolson/sounds/405399/)

## 장사 규칙

- 장이 열릴 때 시장 안에 있거나 개장 후 입장하면 이번 장 지역화폐 잔액이 5,000원으로 시작합니다. 같은 장에 다시 들어오면 그 장의 남은 잔액을 이어서 씁니다.
- 매대에서는 지역화폐부터 쓰고, 상품값에 모자라는 금액은 보유현금으로 결제합니다.
- 한국 시간으로 매시 정각에 개장합니다. 일반 마감은 매시 45분입니다. 12:00 점심 장, 20:00 퇴근 장, 22:00 야시장 직전 장은 각각 11:50, 19:50, 21:50에 마감하고, 10초 자동 퇴장 뒤 특별 장 선착순 입장을 시작합니다.
- 특별 장 세 곳은 레어 스카프가 한 장씩 나옵니다. 그 외 장은 회차마다 10% 확률로 레어 스카프가 한 장 나옵니다.
- 스카프 6종과 손수건 4종으로 구성된 상품 목록은 매 시간 바뀝니다. 상품이 팔리면 3D 매대에서 줄어듭니다. 구매 기록은 **내 장바구니**에서 확인할 수 있습니다.
- **전당포**는 일반템을 구매가의 절반에 매입합니다. 전당포에서 받은 게임 현금은 장이 바뀌어도 남습니다. 레어템은 구매가 이상으로 등록해 다른 손님에게 현금으로 판매할 수 있습니다.
- **랭킹**에서는 매대 누적 구매 수량, 보유 레어템 수량, 보유현금을 각각 볼 수 있습니다.
- 시작 화면의 **선착순 입장하기**로 개장 전에도 입장할 수 있습니다. 오픈 베타 정원인 16명이 차면 **선착순 다 참**이 표시되고, 같은 버튼이 **대기자 입장하기**로 바뀝니다. 누르면 관람 화면에서 순번을 받습니다.
- 대기 중에는 3D 골목의 손님, 채팅 말풍선, 매대 재고를 볼 수 있습니다. 순번은 개장 후에도 유지되며 자리가 나면 차례대로 자동 입장합니다.
- 레어 스카프가 팔리면 획득한 캐릭터 머리 위에 스카프 그림과 이름이 잠시 표시됩니다.
- 운영 시장에서는 Google 계정으로 여러 기기에서 같은 프로필과 장바구니를 불러올 수 있습니다. 처음 연결하는 Google 계정은 현재 브라우저의 게스트 기록을 이어받습니다. 로그인 없이도 시장을 구경할 수 있습니다.

## GitHub에서 무료로 시작하기

1. GitHub에서 빈 **공개 저장소**를 만듭니다. 이 프로젝트의 `main`을 올린 뒤 저장소 **Settings → Pages → Source → GitHub Actions**를 선택합니다. **Actions → Publish the market → Run workflow**를 실행하면 혼자 체험하는 웹 버전부터 열 수 있습니다. [GitHub Pages 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. 공용 장터를 열려면 Worker를 배포하고 `wrangler.toml`의 `PAGES_ORIGIN`을 GitHub Pages 출처로 설정합니다. 주소가 `https://example.github.io/scarf-market/`이라면 출처는 `https://example.github.io`입니다. 사용자 지정 도메인을 쓰면 `PAGES_CUSTOM_ORIGIN`에 해당 HTTPS 출처를 추가합니다. [Cloudflare Workers Free](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. 터미널에서 `npx wrangler login` 후 `npx wrangler deploy`를 실행합니다. Wrangler가 반환한 Worker 주소에 `/api/market`을 붙이고, GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 이름 `MARKET_API_URL`로 등록합니다. 주소는 공개 설정값이며, 인증 토큰을 변수나 저장소에 추가할 필요가 없습니다.
4. **Publish the market** 워크플로를 다시 실행합니다. 배포 주소를 서로 다른 브라우저에서 열고, 화면에 **골목 접속 중**과 접속 인원이 표시되는지 확인합니다. API 변수를 비워 두면 GitHub Pages는 혼자 체험 모드로 동작합니다.

GitHub Pages는 게임 화면을 제공하고, Worker의 SQLite Durable Object가 하나의 장터에서 재고·구매 목록·랭킹을 저장합니다. 이 초기 구성은 소규모 플레이를 위한 것입니다. 무료 할당량이 소진되면 온라인 요청이 멈출 수 있습니다.

Google 로그인을 활성화하려면 [Google Auth Platform](https://console.cloud.google.com/auth/clients)에서 웹 OAuth 클라이언트를 만들고 게임 주소의 출처를 등록합니다. 공개 클라이언트 ID를 Worker의 `GOOGLE_CLIENT_ID` 환경 변수에 설정합니다. Google 설정에 연결할 개인정보 안내는 `/privacy.html`에 있습니다.

## 확인

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
```

서버 테스트는 정각 개장, 레어 스카프 재고, 구매 목록 유지, 채팅 만료와 접근 권한을 확인합니다. 정적 빌드는 `dist/`에 생성됩니다.

모티브 참고: [서울신문의 남대문시장 스카프 상인 소개](https://m.seoul.co.kr/news/2026/11/06/20261106500314), [인사이트의 판매 방식 소개](https://api-v2.insight.co.kr/news/580780).
