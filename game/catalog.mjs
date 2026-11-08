export const ROUND_CURRENCY = 5000;
export const CHAT_MS = 7_000;
export const CHAT_FEED_MS = 20_000;
export const CHAT_LIMIT = 80;
export const LOBBY_CHAT_MS = 10 * 60_000;
export const LOBBY_CHAT_LIMIT = 20;
export const SPAWN = { x: -0.9, z: 3.9 };
export const MAP = { minX: -5.65, maxX: 5.55, minZ: -1.85, maxZ: 7.3 };
export const STALLS = { scarves: { x: -1.7, z: -0.65 }, junk: { x: 3.6, z: 1.9 } };
const firstCloth = [
  { id: 'scarf', group: 'scarf', name: '꽃무늬 스카프', price: 700, count: 6, color: '#bd5a59', ink: '#ffdec1', pattern: 'flower', detail: '살구색 꽃잎이 흩어진 장밋빛 스카프.' },
  { id: 'indigo-stripe', group: 'scarf', name: '쪽빛 줄무늬 스카프', price: 750, count: 6, color: '#426d91', ink: '#ddedeb', pattern: 'stripe', detail: '쪽빛 바탕에 흰 줄을 또렷하게 넣었어요.' },
  { id: 'amber-paisley', group: 'scarf', name: '호박빛 페이즐리 스카프', price: 900, count: 6, color: '#c48d46', ink: '#783c37', pattern: 'paisley', detail: '호박색 바탕에 굽은 잎사귀 무늬.' },
  { id: 'jade-wave', group: 'scarf', name: '비취 물결 스카프', price: 800, count: 6, color: '#477e71', ink: '#cce4c3', pattern: 'wave', detail: '비취색 천을 잔물결처럼 접었어요.' },
  { id: 'plum-dot', group: 'scarf', name: '자두 도트 스카프', price: 750, count: 6, color: '#8d597a', ink: '#f4c4c5', pattern: 'dot', detail: '자두색과 연분홍 물방울 무늬.' },
  { id: 'cream-check', group: 'scarf', name: '버터 체크 스카프', price: 700, count: 6, color: '#e6c88a', ink: '#a76954', pattern: 'check', detail: '버터색 천에 갈색 격자를 얹었어요.' },
  { id: 'hanky', group: 'hanky', name: '잔체크 손수건', price: 450, count: 3, color: '#729a88', ink: '#e1edcb', pattern: 'check', detail: '주머니에 접어 넣기 좋은 잔체크.' },
  { id: 'peach-flower', group: 'hanky', name: '복숭아 꽃잎 손수건', price: 500, count: 3, color: '#e6a08d', ink: '#fff1cc', pattern: 'flower', detail: '복숭아빛 위에 피어난 작은 꽃송이.' },
  { id: 'navy-dot', group: 'hanky', name: '밤하늘 점박이 손수건', price: 450, count: 3, color: '#4e547f', ink: '#e8dba6', pattern: 'dot', detail: '짙은 남색 사이로 별 같은 점이 보여요.' },
  { id: 'rice-stripe', group: 'hanky', name: '쌀빛 테두리 손수건', price: 400, count: 3, color: '#ebd9b2', ink: '#bc7f61', pattern: 'stripe', detail: '쌀빛 바탕에 부드러운 살구색 테두리.' },
];
export const RARE_SCARVES = [
  { id: 'moon-rabbit', group: 'scarf', name: '은빛 달토끼 스카프', price: 1200, count: 1, rare: true, color: '#675e9d', ink: '#f3e0c2', pattern: 'dot', detail: '보랏빛 밤하늘에 달빛을 한 올 섞었어요.' },
  { id: 'golden-knot', group: 'scarf', name: '금빛 매듭 스카프', price: 1200, count: 1, rare: true, color: '#8b3b52', ink: '#f3ca70', pattern: 'paisley', detail: '자줏빛 천 위로 금빛 매듭이 이어져요.' },
  { id: 'pearl-stars', group: 'scarf', name: '별빛 자개 스카프', price: 1200, count: 1, rare: true, color: '#286f6d', ink: '#d6f0dd', pattern: 'wave', detail: '물결에 비친 자개빛이 각도마다 달라 보여요.' },
];
const clothSet = (group, rows) => rows.map(([id, name, price, color, ink, pattern, detail]) => ({
  id, group, name, price, count:group==='scarf'?6:3, color, ink, pattern, detail,
}));
const secondCloth = [
  ...clothSet('scarf',[
    ['dusk-twill','노을 사선 스카프',740,'#aa6255','#f4c99d','stripe','노을빛 바탕 위로 살구색 사선이 흘러요.'],
    ['pine-check','솔잎 격자 스카프',820,'#527268','#c1c9a0','check','짙은 솔잎색에 바랜 금색 격자.'],
    ['fig-paisley','무화과 페이즐리 스카프',870,'#825367','#e9b193','paisley','무화과색 천에 말린 잎무늬를 넣었어요.'],
    ['river-blue','한강 잔물결 스카프',800,'#577b94','#d6e7dc','wave','햇빛 받은 물결처럼 은은한 파란 천.'],
    ['persimmon-dot','홍시 점무늬 스카프',720,'#c37343','#f9d6a4','dot','잘 익은 홍시색 위에 작은 크림색 점.'],
    ['magnolia-bloom','목련 꽃송이 스카프',780,'#debea1','#a06962','flower','아이보리 위에 말린 목련빛 꽃송이.'],
  ]),
  ...clothSet('hanky',[
    ['ink-edge','먹빛 테두리 손수건',430,'#525463','#d9d2be','stripe','담백한 먹색에 얇은 쌀빛 줄을 둘렀어요.'],
    ['citron-check','유자 잔격자 손수건',460,'#d0a647','#fff0bc','check','밝은 유자색에 크림색 실로 놓은 격자.'],
    ['apricot-petal','살구꽃 손수건',490,'#cf8e7d','#f7ded0','flower','살구색 천에 작은 흰 꽃잎을 흩뿌렸어요.'],
    ['fern-drop','고사리 이슬 손수건',420,'#768264','#e4e8c9','dot','고사리빛 천 위에 이슬처럼 촘촘한 점.'],
  ]),
];
const thirdCloth = [
  ...clothSet('scarf',[
    ['lantern-red','홍등 줄무늬 스카프',760,'#9f3d40','#edc578','stripe','붉은 초롱 아래 반짝이는 금빛 줄무늬.'],
    ['celadon-check','청자 격자 스카프',800,'#72988d','#deead9','check','빛바랜 청자색에 부드러운 흰 격자.'],
    ['chestnut-leaf','군밤 잎무늬 스카프',850,'#82563e','#dfa964','paisley','구운 밤색 바탕에 황금빛 잎이 이어져요.'],
    ['violet-wave','보랏빛 저녁 물결 스카프',790,'#6d628e','#d9b6cd','wave','어두운 보랏빛과 연분홍 물결이 교차해요.'],
    ['ivory-camellia','아이보리 동백 스카프',830,'#e6d1ab','#ad585b','flower','아이보리 천에 작고 붉은 동백을 수놓았어요.'],
    ['blue-hour','해질녘 별점 스카프',740,'#495b77','#edd59f','dot','짙은 남색에 별처럼 작은 노란 점.'],
  ]),
  ...clothSet('hanky',[
    ['clay-check','벽돌 잔체크 손수건',440,'#a56556','#ead2a6','check','벽돌색 골목을 닮은 조용한 체크무늬.'],
    ['moon-edge','달무리 테두리 손수건',470,'#dcd3b6','#75728f','stripe','달빛색 손수건에 옅은 보랏빛 테두리.'],
    ['mint-ripple','박하 물결 손수건',410,'#83a793','#eef0d2','wave','연한 박하색 천에 크림색 물결.'],
    ['copper-star','구리별 손수건',480,'#655968','#daa379','dot','회보라 천 위에 구릿빛 별점.'],
  ]),
];
const clothRounds = [firstCloth, secondCloth, thirdCloth];
export const MARKET_ITEMS = [...clothRounds.flat(), ...RARE_SCARVES];
export const EMPTY_STOCK = Object.freeze(Object.fromEntries(MARKET_ITEMS.map(item => [item.id, 0])));
export const roundCloth = slot => clothRounds[slot-1] ?? firstCloth;
export const roundStock = slot => ({ ...EMPTY_STOCK, ...Object.fromEntries(roundCloth(slot).map(item=>[item.id,item.count])) });
export const AVATAR_OPTIONS = {
  character: {
    classic: { name: '남성 캐릭터 · 기본', wardrobe: '남성 전용 소품' },
    female: { name: '여성 캐릭터', wardrobe: '여성 전용 소품' },
  },
  hat: {
    newsboy: { name: '밤색 헌팅캡', color: '765546', character: 'classic' },
    blossom: { name: '살구꽃 머리핀', color: 'e8a189', character: 'female' },
    ribbon: { name: '자두색 머리 리본', color: '99667f', character: 'female' },
    cap: { name: '쪽빛 볼캡', color: '546374' },
    knit: { name: '벽돌색 비니', color: '9c4840' },
    bucket: { name: '모래색 버킷햇', color: 'bc975f' },
    none: { name: '머리 소품 없음' },
  },
  coat: {
    marketVest: { name: '호박빛 작업 조끼', color: 'b8874c', character: 'classic' },
    fieldJacket: { name: '잣빛 필드 재킷', color: '7b8165', character: 'classic' },
    roseCardigan: { name: '말린 장미 가디건', color: 'b57777', character: 'female' },
    plumCoat: { name: '자두빛 칼라 코트', color: '826780', character: 'female' },
    teal: { name: '비취색 재킷', color: '638687' },
    brick: { name: '벽돌색 재킷', color: 'b36451' },
    navy: { name: '밤하늘색 재킷', color: '5d648f' },
    mustard: { name: '겨자색 재킷', color: 'c29e4e' },
  },
  bag: {
    satchel: { name: '밤색 캔버스 메신저백', color: '9c7555', character: 'classic' },
    wovenBasket: { name: '밀짚 꽃바구니', color: 'c39761', character: 'female' },
    plumPouch: { name: '자두빛 미니 손가방', color: '925d76', character: 'female' },
    backpack: { name: '가죽 배낭', color: 'deb268' },
    tote: { name: '쌀빛 장바구니', color: 'e3c99d' },
    crossbody: { name: '밤색 크로스백', color: '8f635a' },
    none: { name: '가방 없음' },
  },
};
// Keep the original character ID so existing profiles still load as the male visitor.
export const DEFAULT_LOOK = { character: 'classic', hat: 'newsboy', coat: 'fieldJacket', bag: 'satchel', scarf: 'classic' };
const FEMALE_LOOK = { character: 'female', hat: 'blossom', coat: 'roseCardigan', bag: 'wovenBasket', scarf: 'classic' };
export function avatarOptionsFor(part, character) {
  return Object.entries(AVATAR_OPTIONS[part]).filter(([,option])=>!option.character||option.character===character);
}
export const SCARVES = MARKET_ITEMS.filter(item => item.group === 'scarf');
export function normalizeLook(value) {
  const look = { ...(value?.character === 'female' ? FEMALE_LOOK : DEFAULT_LOOK) };
  for (const part of ['hat','coat','bag']) {
    if (avatarOptionsFor(part,look.character).some(([id])=>id===value?.[part])) look[part] = value[part];
  }
  if (value?.scarf === 'none' || SCARVES.some(item => item.id === value?.scarf)) look.scarf = value.scarf;
  return look;
}
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
export const SHOP_RADIUS = 2.05;
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
  '잡화점은 아직 준비 중이에요. 이쪽 천부터 한 번 봐요!',
  '남들 거 보지 말고 자기 취향 믿어요. 정 모르겠으면 꽃무늬!',
  '주머니 가벼워졌지? 어깨도 가벼워진 건 내 덕이라고 해요.',
];
const minute = 60_000;
const dayLength = 24 * 60 * minute;
const seoulOffset = 9 * 60 * minute;
export const seoulDay = now => Math.floor((now + seoulOffset) / dayLength);
export const seoulDayStart = now => seoulDay(now) * dayLength - seoulOffset;
export const dailyRare = now => RARE_SCARVES[((seoulDay(now) % RARE_SCARVES.length) + RARE_SCARVES.length) % RARE_SCARVES.length];
export const MARKET_DURATION = 45 * minute;
export const MARKET_INTERVAL = 60 * minute;
export const QUEUE_LEAD = 10 * minute;

function openings(day) {
  // The Seoul date gives everyone the same first opening, even after a restart.
  let roll = Math.imul(day ^ 0x21f0aaad, 53);
  roll = Math.imul(roll ^ (roll >>> 16), 0x45d9f3b);
  roll = Math.imul(roll ^ (roll >>> 16), 0x45d9f3b);
  roll = (roll ^ (roll >>> 16)) >>> 0;
  const first = day * dayLength - seoulOffset + (9 * 60 + roll % 180) * minute;
  return [first, first + MARKET_INTERVAL, first + 2 * MARKET_INTERVAL];
}

export function marketSession(now) {
  const day = seoulDay(now);
  const today = openings(day);
  const index = today.findLastIndex(opening => opening <= now);
  const previous = index<0 ? openings(day - 1)[2] : today[index];
  const next = today[index+1] ?? openings(day + 1)[0];
  const closes = previous + MARKET_DURATION;
  return { round: previous / minute, slot: index<0?3:index+1, open: now < closes, closes, next, nextSlot: (index+1)%3+1 };
}

export const marketRare = (now,session) => session.testing || session.slot===3 ? dailyRare(now) : null;
export function marketQueue(session,now) {
  const starts = session.next - QUEUE_LEAD;
  const closed = !session.open || now>=session.closes;
  return { starts, active: closed && now>=starts && now<session.next, warning: closed && now<starts && starts-now<=5*minute };
}

export const chatText = value => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()
  : '';
export const niceName = (name) => [...String(name ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().replace(/\s+/g, ' ')].slice(0, 14).join('');
export const fit = (n, min, max, fallback) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
