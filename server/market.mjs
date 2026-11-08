import { CHAT_FEED_MS, CHAT_LIMIT, CHAT_MS, EMPTY_STOCK, JUNK, LOBBY_CHAT_LIMIT, LOBBY_CHAT_MS, MAP, MARKET_CAPACITY, MARKET_EXIT_MS, MARKET_ITEMS, RARE_PICKUP_MS, ROUND_CURRENCY, SPAWN, chatText, fit, isNightMarket, lastMarketClose, marketRare, marketSession, niceName, normalizeLook, roundCloth, roundStock, seoulDay, seoulDayStart } from '../game/catalog.mjs';

const defaultName = '새내기 손님';
const presenceMs = 30_000;
const idleMarketPresenceMs = 55_000;
const lobbyPresenceMs = 270_000;
const queuePresenceMs = 270_000;
const queueRenewalMs = 220_000;
const tradeMs = 350;
const chatCooldown = 1800;
const minute = 60_000;
const problem = (error, status = 400) => ({ error, status });
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
export class Market {
  constructor(query, transaction, testWindow) {
    this.query = query;
    this.transaction = transaction;
    this.testWindow = testWindow;
    this.people = new Map();
    this.nextWatchId = 0;
    this.lobbyMessages = [];
    this.joins = new Map();
    query('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, cash INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, collected INTEGER NOT NULL DEFAULT 0, reached INTEGER NOT NULL DEFAULT 0, traded INTEGER NOT NULL DEFAULT 0)');
    query('CREATE INDEX IF NOT EXISTS ranking ON players (collected DESC, reached ASC, id ASC)');
    query('CREATE TABLE IF NOT EXISTS cloth_sales (round INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY(round, item))');
    query('CREATE TABLE IF NOT EXISTS basket (player TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, item))');
    query('CREATE TABLE IF NOT EXISTS allowances (player TEXT PRIMARY KEY, round INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS round_currency (player TEXT NOT NULL, round INTEGER NOT NULL, PRIMARY KEY (player, round))');
    query('CREATE TABLE IF NOT EXISTS looks (player TEXT PRIMARY KEY, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS avatar_styles (player TEXT PRIMARY KEY, character TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS character_outfits (player TEXT NOT NULL, character TEXT NOT NULL, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL, PRIMARY KEY (player, character))');
    query('CREATE TABLE IF NOT EXISTS daily_rare_sales (day INTEGER PRIMARY KEY)');
    query('CREATE TABLE IF NOT EXISTS market_queue (sequence INTEGER PRIMARY KEY, player TEXT UNIQUE NOT NULL, round INTEGER NOT NULL, seen INTEGER NOT NULL)');
    query('CREATE INDEX IF NOT EXISTS queue_seen ON market_queue (seen)');
  }
  get(sql, ...args) { return this.query(sql, ...args)[0]; }
  issueRoundCurrency(player, round) {
    if (this.get('SELECT 1 FROM round_currency WHERE player = ? AND round = ?', player.id, round)) return;
    const legacy = this.get('SELECT round FROM allowances WHERE player = ?', player.id);
    if (!legacy && player.name === '새내기 상인' &&
        !this.get('SELECT 1 FROM round_currency WHERE player = ? LIMIT 1', player.id)) {
      this.query('UPDATE players SET name = ? WHERE id = ?', defaultName, player.id);
      player.name = defaultName;
    }
    this.query('INSERT INTO round_currency (player, round) VALUES (?, ?)', player.id, round);
    // The old allowance already applied to anyone who entered this round before the update.
    if (legacy?.round === round) return;
    this.query('UPDATE players SET cash = cash + ? WHERE id = ?', ROUND_CURRENCY, player.id);
    player.cash += ROUND_CURRENCY;
    return ROUND_CURRENCY;
  }
  lastClose(now) {
    const window = this.testWindow;
    if (!window || now < window.from) return lastMarketClose(now);
    if (now < window.until) return lastMarketClose(window.from - 1);
    return Math.max(lastMarketClose(now), window.until);
  }
  prune(now, lastClose = this.lastClose(now)) {
    for (const [id, p] of this.people) {
      const lease = p.room === 'lobby' ? lobbyPresenceMs : p.idle ? idleMarketPresenceMs : presenceMs;
      const roundEnded = p.room === 'market' && p.entryRound < lastClose && now >= lastClose + MARKET_EXIT_MS;
      if (roundEnded || now - p.seen > lease) this.people.delete(id);
    }
    for (const [ip, p] of this.joins) if (now - p.at > 60_000) this.joins.delete(ip);
    this.lobbyMessages = this.lobbyMessages.filter(message => now - message.sentAt < LOBBY_CHAT_MS);
  }
  marketCount() {
    let count = 0;
    for (const person of this.people.values()) if (person.room === 'market') count++;
    return count;
  }
  marketCrowd(now) {
    return [...this.people.values()].filter(person => person.room === 'market')
      .map(({ watchId, x, z, look, speech }) => ({
        id: watchId, x, z, look,
        speech: speech?.expiresAt > now
          ? { playerId: watchId, text: speech.text, sentAt: speech.sentAt, expiresAt: speech.expiresAt }
          : undefined,
      }));
  }
  rarePickup(now, watching = false) {
    for (const person of this.people.values()) {
      if (person.room !== 'market' || !(person.pickup?.expiresAt > now)) continue;
      const { item, sentAt, expiresAt } = person.pickup;
      return watching ? { id: person.watchId, item, sentAt, expiresAt }
        : { id: person.id, watchId: person.watchId, item, sentAt, expiresAt };
    }
  }
  marketStatus(now) {
    const lastClose = this.lastClose(now);
    this.prune(now, lastClose);
    return { now, lastClose, ...this.inventory(now), marketOnline: this.marketCount(), marketCapacity: MARKET_CAPACITY };
  }
  session(now) {
    const regular = marketSession(now);
    const window = this.testWindow;
    if (window && now >= window.from && now < window.until) {
      const resume=marketSession(window.until);
      return { round: Math.floor(window.from / minute), slot: 1, open: true, closes: window.until,
        next: resume.open?window.until:resume.next, nextSlot: resume.open?resume.slot:resume.nextSlot, testing: true };
    }
    return regular;
  }
  inventory(now, session = this.session(now)) {
    const { round, open } = session;
    const phaseMinute = Math.max(open ? round : Math.floor(session.closes / minute), Math.floor(seoulDayStart(now) / minute));
    const scheduledRevision = phaseMinute * 1000 + (session.testing ? 700 : open ? 0 : 500);
    // Keep snapshots ordered when the test ends between regular sessions.
    const expired = this.testWindow && now >= this.testWindow.until;
    const expiryMinute = expired ? Math.floor(this.testWindow.until / minute) : 0;
    const shortWindow = expired && Math.floor(this.testWindow.from / minute) === expiryMinute;
    const revision = expired ? Math.max(scheduledRevision, expiryMinute * 1000 + (shortWindow ? 800 : 0)) : scheduledRevision;
    if (!open) return { ...session, stock: EMPTY_STOCK, goods: {}, rare: null, revision };
    const rare = marketRare(session)?.id ?? null;
    const stock = roundStock(session.slot);
    if (rare) stock[rare] = 1;
    let used = 0;
    for (const { item, qty } of this.query('SELECT item, qty FROM cloth_sales WHERE round = ?', round)) {
      const remaining=Math.max(0,(stock[item]??0)-qty);
      used+=(stock[item]??0)-remaining;
      if(Object.hasOwn(stock,item))stock[item]=remaining;
    }
    // Before per-round sales, the night and test markets recorded rare sales by day.
    const started = round * minute;
    if (rare && stock[rare] && (session.testing || isNightMarket(round)) &&
        this.get('SELECT 1 FROM daily_rare_sales WHERE day = ? AND EXISTS (SELECT 1 FROM basket WHERE item = ? AND updated >= ? AND updated < ?)',
          seoulDay(started), rare, started, session.closes)) {
      stock[rare] = 0;
      used++;
    }
    return { ...session, stock, goods: {}, rare, revision: revision + used };
  }
  action(body, now = Date.now(), ip = 'local') {
    const { action, token, pos } = body ?? {};
    const requestedRoom = body?.room === 'lobby' ? 'lobby' : 'market';
    const lastClose = this.lastClose(now);
    const closing = now < lastClose + MARKET_EXIT_MS;
    this.prune(now, lastClose);
    return this.transaction(() => {
      let player = typeof token === 'string' && /^[0-9a-f]{48}$/.test(token)
        ? this.get('SELECT * FROM players WHERE token = ?', token) : undefined;
      let issued;
      if (!player && action === 'join') {
        const last = this.joins.get(ip);
        if (last?.count >= 12) return problem('잠시 후 다시 입장해 주세요.', 429);
        this.joins.set(ip, { at: last?.at ?? now, count: (last?.count ?? 0) + 1 });
        issued = newToken();
        player = { id: crypto.randomUUID(), token: issued, name: defaultName, cash: 0, sold: 0, collected: 0, reached: 0, traded: 0 };
        this.query('INSERT INTO players (id, token, name, cash) VALUES (?, ?, ?, ?)', player.id, issued, player.name, player.cash);
      }
      if (!player) return problem('장터에 다시 입장해 주세요.', 401);
      if (!['join', 'sync', 'rename', 'profile', 'buy', 'chat'].includes(action)) {
        return problem('알 수 없는 거래입니다.');
      }
      const session = this.session(now);
      const { round, open } = session;
      const previous = this.people.get(player.id) ?? SPAWN;
      const connecting = action === 'join' || action === 'sync';
      const hasSeat = previous.room === 'market';
      // Queue rows from before the cutoff can never participate in the next round.
      const queueSince = Math.max(now - queuePresenceMs + 1, closing ? 0 : lastClose);
      let queueAdvanced = false;
      if (connecting) {
        queueAdvanced = this.query('DELETE FROM market_queue WHERE seen < ? RETURNING sequence', queueSince).length > 0;
        if (body.cancelQueue === true) {
          queueAdvanced = this.query('DELETE FROM market_queue WHERE player = ? RETURNING sequence', player.id).length > 0 || queueAdvanced;
        }
      }
      let admission;
      if (requestedRoom === 'market') {
        if (closing && (!hasSeat || !connecting)) admission = 'closing';
        else if (!closing && body.entryRound !== undefined && body.entryRound !== lastClose) admission = 'closed';
        else if (!hasSeat && !connecting) admission = 'enter-first';
        else if (!hasSeat) {
          const first = this.get('SELECT player FROM market_queue ORDER BY sequence LIMIT 1');
          if (this.marketCount() >= MARKET_CAPACITY || (first && first.player !== player.id)) {
            admission = 'full';
            this.query('INSERT INTO market_queue (player, round, seen) VALUES (?, ?, ?) ON CONFLICT(player) DO UPDATE SET seen = excluded.seen WHERE market_queue.seen <= ?',
              player.id, round, now, now - queueRenewalMs);
          } else if (first) {
            this.query('DELETE FROM market_queue WHERE player = ?', player.id);
            queueAdvanced = true;
          }
        }
        if (admission && !connecting) return problem(admission === 'closing' || admission === 'closed'
          ? '이번 장이 마감됐어요. 다음 장에 다시 입장해 주세요.' : '시장에 입장한 뒤 이용해 주세요.', 409);
      }
      const room = admission ? 'lobby' : requestedRoom;
      const currencyGrant = room === 'market' && open && !closing && connecting
        ? this.issueRoundCurrency(player, round) ?? null
        : null;
      const x = fit(pos?.x, MAP.minX, MAP.maxX, previous.x);
      const z = fit(pos?.z, MAP.minZ, MAP.maxZ, previous.z);
      let event;
      let speech = previous.room === room ? previous.speech : undefined;
      let pickup = room === 'market' && previous.pickup?.expiresAt > now ? previous.pickup : undefined;
      let lastChat = previous.lastChat;
      let look = normalizeLook(this.get('SELECT looks.hat, looks.coat, looks.bag, looks.scarf, avatar_styles.character FROM players LEFT JOIN looks ON looks.player = players.id LEFT JOIN avatar_styles ON avatar_styles.player = players.id WHERE players.id = ?', player.id));
      if (action === 'rename' || action === 'profile') {
        const name = niceName(typeof body.name === 'string' ? body.name.slice(0, 120) : '');
        if (!name) return problem('한 글자 이상 입력해 주세요.');
        if (action === 'profile') {
          const requested = { ...body.look, character: body.look?.character ?? look.character };
          const selected = normalizeLook(requested);
          if (Object.entries(selected).some(([key, value]) => requested[key] !== value)) {
            return problem('꾸미기 목록에 있는 아이템을 골라 주세요.');
          }
          if (!['classic','none'].includes(selected.scarf) && !this.get('SELECT qty FROM basket WHERE player = ? AND item = ? AND qty > 0', player.id, selected.scarf)) {
            return problem('장바구니에 있는 스카프만 착용할 수 있어요.', 409);
          }
          if (look.character !== selected.character) {
            this.query('INSERT OR IGNORE INTO character_outfits VALUES (?, ?, ?, ?, ?, ?)', player.id, look.character, look.hat, look.coat, look.bag, look.scarf);
          }
          this.query('INSERT INTO character_outfits VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(player, character) DO UPDATE SET hat = excluded.hat, coat = excluded.coat, bag = excluded.bag, scarf = excluded.scarf',
            player.id, selected.character, selected.hat, selected.coat, selected.bag, selected.scarf);
          this.query('INSERT INTO looks VALUES (?, ?, ?, ?, ?) ON CONFLICT(player) DO UPDATE SET hat = excluded.hat, coat = excluded.coat, bag = excluded.bag, scarf = excluded.scarf',
            player.id, selected.hat, selected.coat, selected.bag, selected.scarf);
          this.query('INSERT INTO avatar_styles VALUES (?, ?) ON CONFLICT(player) DO UPDATE SET character = excluded.character', player.id, selected.character);
          look = selected;
        }
        this.query('UPDATE players SET name = ? WHERE id = ?', name, player.id);
        player.name = name;
        event = action === 'profile' ? '프로필을 저장했어요.' : '간판에 새 닉네임을 걸었어요.';
      } else if (action === 'buy') {
        if (room === 'lobby') return problem('시장에 입장한 뒤 매대에서 구매해 주세요.', 409);
        const item = MARKET_ITEMS.find(entry => entry.id === body.item);
        if (!item) return JUNK.some(entry => entry.id === body.item)
          ? problem('잡화점은 오픈 준비 중이에요.', 409) : problem('매대에 없는 물건이에요.');
        if (!open) return problem('개장하면 상품을 구매할 수 있어요.', 409);
        if (player.traded && now - player.traded < tradeMs) return problem('잠깐만요, 한 개씩 계산할게요.', 429);
        const inventory = this.inventory(now, session);
        if (inventory.rare!==item.id && !roundCloth(session.slot).some(entry=>entry.id===item.id)) {
          return problem('이 상품은 이번 장에서 판매하지 않아요.', 409);
        }
        if (!inventory.stock[item.id]) {
          return problem('다른 손님이 먼저 가져갔어요. 다음 장을 기다려 주세요.', 409);
        }
        if (player.cash < item.price) {
          return problem(`지역화폐가 부족해요. 다음 장에 입장하면 ${ROUND_CURRENCY.toLocaleString('ko-KR')}원을 받아요.`, 409);
        }
        if (item.rare) pickup = { item: item.id, sentAt: now, expiresAt: now + RARE_PICKUP_MS };
        this.query('INSERT INTO cloth_sales VALUES (?, ?, 1) ON CONFLICT(round,item) DO UPDATE SET qty = qty + 1', round, item.id);
        this.query('DELETE FROM cloth_sales WHERE round < ?', round - 3 * 24 * 60);
        this.query('UPDATE players SET cash = cash - ?, traded = ? WHERE id = ?', item.price, now, player.id);
        this.query('INSERT INTO basket VALUES (?, ?, 1, ?) ON CONFLICT(player,item) DO UPDATE SET qty = qty + 1, updated = excluded.updated', player.id, item.id, now);
        player.cash -= item.price;
        event = item.name + ' 장바구니에 담았어요!';
      } else if (action === 'chat') {
        const text = chatText(body.text);
        if (!text || [...text].length > CHAT_LIMIT) return problem('채팅은 1~80자로 입력해 주세요.');
        if (lastChat !== undefined && now - lastChat < chatCooldown) return problem('잠시 후 다시 말해 주세요.', 429);
        speech = { playerId: player.id, name: player.name, text, sentAt: now, expiresAt: now + CHAT_MS };
        lastChat = now;
        if (room === 'lobby') {
          this.lobbyMessages.push(speech);
          if (this.lobbyMessages.length > LOBBY_CHAT_LIMIT) this.lobbyMessages.shift();
        }
      }
      const watchId = room === 'market' ? previous.watchId ?? ++this.nextWatchId : undefined;
      const entryRound = room === 'market' ? previous.entryRound ?? lastClose : undefined;
      this.people.set(player.id, { id: player.id, name: player.name, room, entryRound, x, z, seen: now, idle: !open, speech, lastChat, look, watchId, pickup });
      const roomPeople = [...this.people.values()].filter(person => person.room === room);
      const ranking = this.query('SELECT id, name, collected FROM players WHERE collected > 0 ORDER BY collected DESC, reached ASC, id ASC LIMIT 30');
      const myRank = player.collected ? this.get('SELECT COUNT(*) + 1 AS rank FROM players WHERE collected > ? OR (collected = ? AND reached < ?)', player.collected, player.collected, player.reached).rank : null;
      const outfits = Object.fromEntries(this.query('SELECT character, hat, coat, bag, scarf FROM character_outfits WHERE player = ?', player.id).map(row=>[row.character,normalizeLook(row)]));
      outfits[look.character] = look;
      const queuePosition = room === 'lobby' ? this.get(
        'SELECT COUNT(*) AS position FROM market_queue WHERE seen >= ? AND sequence <= (SELECT sequence FROM market_queue WHERE player = ? AND seen >= ?)',
        queueSince, player.id, queueSince).position || null : null;
      return {
        token: issued, event, room, admission, currencyGrant, speech: speech?.sentAt + CHAT_FEED_MS > now ? speech : undefined, now, lastClose, ...this.inventory(now, session),
        marketOnline: this.marketCount(), marketCapacity: MARKET_CAPACITY, queuePosition, queueAdvanced,
        player: { id: player.id, name: player.name, cash: player.cash, sold: player.sold, collected: player.collected, rank: myRank, look, outfits },
        basket: this.query('SELECT item, qty, updated FROM basket WHERE player = ? ORDER BY updated DESC, item', player.id),
        ranking, online: roomPeople.length,
        lobbyMessages: room === 'lobby' ? this.lobbyMessages.slice() : undefined,
        crowd: room === 'lobby' && body.watch === true ? this.marketCrowd(now) : undefined,
        rarePickup: room === 'market' || body.watch === true ? this.rarePickup(now, room === 'lobby') : undefined,
        peers: (room === 'market' ? roomPeople : []).filter(p => p.id !== player.id).slice(0, 35).map(({ id, name, x, z, speech, look }) =>
          ({ id, name, x, z, look, speech: speech?.sentAt + CHAT_FEED_MS > now ? speech : undefined })),
      };
    });
  }
}

export function permitsMarketOrigin(request, allowedOrigins = '') {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  if (Array.isArray(allowedOrigins)) return allowedOrigins.includes(origin);
  return origin === (allowedOrigins || new URL(request.url).origin);
}

export function endpoint(market, request, allowedOrigins = '', ip = 'local', publish) {
  const origin = request.headers.get('Origin');
  const permitted = permitsMarketOrigin(request, allowedOrigins);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && permitted) headers['Access-Control-Allow-Origin'] = origin;
  const send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!permitted) return send({ error: '이 사이트에서는 장터에 연결할 수 없어요.' }, 403);
  if (request.method === 'GET') {
    return send(market.marketStatus(Date.now()));
  }
  if (request.method !== 'POST') return send({ error: 'GET과 POST 요청만 받습니다.' }, 405);
  return (async () => {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const reader = request.body?.getReader();
      let bytes = 0, raw = '';
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if ((bytes += value.byteLength) > 2048) { await reader.cancel(); return send({ error: '요청이 너무 커요.' }, 413); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      }
      let data;
      try { data = JSON.parse(raw); } catch { return send({ error: '요청을 읽을 수 없어요.' }, 400); }
      const result = market.action(data, Date.now(), ip);
      if (result.error) return send({ error: result.error }, result.status);
      publish?.(data.action, result);
      return send(result);
    } catch (error) {
      console.error('Market request failed:', error?.message);
      return send({ error: '장터 연결에 문제가 생겼어요.' }, 500);
    }
  })();
}
