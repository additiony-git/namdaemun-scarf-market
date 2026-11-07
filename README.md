# 남대문 스카프 상회

남대문시장과 스카프 아저씨의 장사 화법에서 영감을 받은 브라우저 3D 수집 게임입니다. 실제 매장과 인물을 그대로 재현하는 대신 가상의 골목과 상인, 대사와 아이템을 만들었습니다.

## 지금 플레이하기

- **혼자:** `play.html`을 브라우저로 엽니다. 파일이 없으면 이 폴더에서 `node scripts/standalone.mjs`를 실행합니다. 체험 기록은 이 브라우저에 저장됩니다.
- **온라인 방식으로 로컬 실행:** Node.js 22.13 이상에서 `node server/local.mjs`를 실행하고 [http://127.0.0.1:8787/](http://127.0.0.1:8787/)을 엽니다. 서로 다른 브라우저 프로필이나 일반·시크릿 창을 사용하면 별도 상인으로 입장합니다. 기록은 `.market-data/`에 저장됩니다. 같은 와이파이에서 테스트하려면 `node server/local.mjs --host 0.0.0.0`로 실행하고 참가자는 호스트 PC의 사설 IP로 접속합니다. 기본 실행은 이 PC 안에서만 열립니다.
- **조작:** WASD 또는 방향키로 이동, E로 가까운 매대 열기. 매대 이름표를 눌러 바로 거래할 수도 있습니다. 휴대폰에서는 화면의 방향 버튼을 씁니다. 상단 프로필에서 닉네임을 정합니다.

## 장사 규칙

- 처음에 장터돈 2,000원을 받습니다. 스카프를 손님에게 한 장 팔면 1,300원, 손수건은 800원을 받습니다.
- 매시 정각부터 **10분 간격**으로 스카프 36장과 손수건 12장이 들어옵니다. 온라인에서는 모든 상인이 이 재고를 함께 사용합니다. 마지막 한 장은 서버가 먼저 처리한 거래에 배정합니다.
- 별난 잡화는 같은 종류도 여러 개 살 수 있습니다. 구매한 종류, 수량, 최근 구매 시각은 **내 장바구니**에 표시됩니다. 한 개를 살 때마다 수집 수가 하나 늘어납니다.
- 랭킹은 총 구매 수량이 큰 순서입니다. 동점이면 해당 수량에 먼저 도달한 상인이 앞섭니다. 대사와 거래에 쓰는 돈은 게임 안에서만 쓰입니다.
- 온라인 계정은 브라우저 저장소의 게스트 토큰으로 복원합니다. 다른 기기에서 같은 계정을 사용하거나 지운 계정을 복원하는 기능은 없습니다.

## GitHub에서 무료로 시작하기

1. GitHub에서 빈 **공개 저장소**를 만듭니다. 이 프로젝트의 `main`을 올린 뒤 저장소 **Settings → Pages → Source → GitHub Actions**를 선택합니다. **Actions → Publish the market → Run workflow**를 실행하면 혼자 체험하는 웹 버전부터 열 수 있습니다. [GitHub Pages 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. 공용 장터를 열려면 [Cloudflare Workers Free](https://developers.cloudflare.com/durable-objects/platform/pricing/) 계정에서 Worker를 배포합니다. `wrangler.toml`의 `PAGES_ORIGIN`을 실제 GitHub Pages 주소의 출처로 바꿉니다. 주소가 `https://example.github.io/scarf-market/`이라면 출처는 `https://example.github.io`입니다. GitHub Pages에 사용자 지정 도메인을 사용하면 그 도메인을 설정합니다.
3. 터미널에서 `npx wrangler login` 후 `npx wrangler deploy`를 실행합니다. Wrangler가 반환한 Worker 주소에 `/api/market`을 붙이고, GitHub 저장소 **Settings → Secrets and variables → Actions → Variables**에 이름 `MARKET_API_URL`로 등록합니다. 주소는 공개 설정값이며, 인증 토큰을 변수나 저장소에 추가할 필요가 없습니다.
4. **Publish the market** 워크플로를 다시 실행합니다. 배포 주소를 서로 다른 브라우저에서 열고, 화면에 **장터 영업 중**과 접속 인원이 표시되는지 확인합니다. API 변수를 비워 두면 GitHub Pages는 혼자 체험 모드로 동작합니다.

GitHub Pages는 게임 화면을 제공하고, Worker의 SQLite Durable Object가 하나의 장터에서 재고·구매 목록·랭킹을 저장합니다. 이 초기 구성은 소규모 플레이를 위한 것입니다. 무료 할당량이 소진되면 온라인 요청이 멈출 수 있습니다.

## 확인

```powershell
node --test tests/*.test.mjs
node scripts/build.mjs
```

서버 테스트는 재고 선착순과 회차 갱신, 동점 순서, 구매 목록 유지, 거래 권한을 확인합니다. 정적 빌드는 `dist/`에 생성됩니다.

모티브 참고: [서울신문의 남대문시장 스카프 상인 소개](https://m.seoul.co.kr/news/2026/11/06/20261106500314), [인사이트의 판매 방식 소개](https://api-v2.insight.co.kr/news/580780).
