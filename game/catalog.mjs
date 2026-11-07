export const ROUND_MS = 10 * 60 * 1000;
export const START_MONEY = 2000;
export const STOCK = { scarf: 36, hanky: 12 };
export const STOCK_TOTAL = STOCK.scarf + STOCK.hanky;
export const SPAWN = { x: -0.9, z: 3.9 };
export const MAP = { minX: -5.65, maxX: 5.55, minZ: -1.85, maxZ: 7.3 };
export const STALLS = { scarves: { x: -1.7, z: -0.65 }, junk: { x: 3.6, z: 1.9 } };
export const CLOTH = [
  { id: 'scarf', name: '꽃무늬 스카프', price: 1300, pic: '🧣', detail: '골목의 주인공. 오늘도 단골이 찾는 꽃무늬.' },
  { id: 'hanky', name: '잔체크 손수건', price: 800, pic: '▧', detail: '작은 손수건 한 장에도 골목의 기운을 담았어요.' },
];
export const JUNK = [
  { id: 'stone', name: '이름 없는 돌멩이', price: 350, pic: '🪨', detail: '이름을 지어 주기 전까지는 그냥 돌이에요.' },
  { id: 'sock', name: '왼쪽만 남은 양말', price: 500, pic: '🧦', detail: '오른쪽은 먼저 퇴근했어요.' },
  { id: 'clock', name: '늘 세 시인 시계', price: 600, pic: '🕰️', detail: '하루 두 번은 누구보다 정확해요.' },
  { id: 'duck', name: '울지 않는 고무 오리', price: 650, pic: '🐤', detail: '조용한 성격을 가진 욕조 친구.' },
  { id: 'key', name: '어디에도 안 맞는 열쇠', price: 800, pic: '🗝️', detail: '어느 문인지 몰라도 일단 갖고 있어요.' },
  { id: 'umbrella', name: '구멍 난 미니 우산', price: 900, pic: '☂️', detail: '비 오는 방향을 알아보기에 좋아요.' },
  { id: 'cup', name: '손잡이 없는 찻잔', price: 1000, pic: '🍵', detail: '양손을 쓰게 해 주는 전통의 미학.' },
  { id: 'trophy', name: '아무 대회도 안 한 트로피', price: 1500, pic: '🏆', detail: '참가하지 않은 데 대한 특별상.' },
];
export const LINES = [
  '스카프는 천천히 골라요. 놓친 건 재고 탓 하고!',
  '예쁜 거 찾지 마요. 찾다가 본인이 더 예뻐져!',
  '손수건은 땀 닦는 거지, 눈물 날 때까지 고르는 게 아녀!',
  '사지 말라니까 또 집네. 그럼 내가 포장해 주긴 할게.',
  '어울리냐고? 거울이 나보다 입이 무거워. 거울한테 물어봐!',
  '스카프가 두 장이면 목이 둘이냐? 그래도 한 장 더 줄까?',
  '고르는 데 한 시간, 사는 데 삼 초! 이게 남대문 시간이여.',
  '뒤집어 봐요. 스카프 앞뒤도 모르면서 가격은 잘 보네!',
  '늦으면 다음 장 기다려요. 스카프도 쉬는 시간이 있어.',
  '잡화점에서 돌 샀다고? 그 돌은 환불 생각도 없대요!',
  '남들 거 보지 말고 자기 취향 믿어요. 정 모르겠으면 꽃무늬!',
  '주머니 가벼워졌지? 어깨도 가벼워진 건 내 덕이라고 해요.',
];
export const JUNK_LINES = [
  '소용 없을수록 좋아요. 우리 가게 물건은 다 제 할 일을 합니다.',
  '돌멩이요? 종이가 날아갈 때만 출근해요.',
  '오리는 안 울어요. 지갑도 너무 울리지 말고!',
  '시계가 세 시라고요? 그럼 간식 시간이지!',
];
export const roundAt = (now) => Math.floor(now / ROUND_MS);
export const nextRound = (now) => (roundAt(now) + 1) * ROUND_MS;
export const niceName = (name) => [...String(name ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().replace(/\s+/g, ' ')].slice(0, 14).join('');
export const fit = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
