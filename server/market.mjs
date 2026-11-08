import { CHAT_FEED_MS, CHAT_LIMIT, CHAT_MS, EMPTY_STOCK, JUNK, MAP, MARKET_ITEMS, SPAWN, START_MONEY, chatText, fit, marketRare, marketSession, niceName, normalizeLook, roundCloth, roundStock, seoulDay, seoulDayStart } from '../game/catalog.mjs';

const defaultName = '새내기 손님';
const presenceMs = 30_000;
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
    this.joins = new Map();
    query('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, cash INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, collected INTEGER NOT NULL DEFAULT 0, reached INTEGER NOT NULL DEFAULT 0, traded INTEGER NOT NULL DEFAULT 0)');
    query('CREATE INDEX IF NOT EXISTS ranking ON players (collected DESC, reached ASC, id ASC)');
    query('CREATE TABLE IF NOT EXISTS cloth_sales (round INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY(round, item))');
    query('CREATE TABLE IF NOT EXISTS basket (player TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, item))');
    query('CREATE TABLE IF NOT EXISTS allowances (player TEXT PRIMARY KEY, round INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS looks (player TEXT PRIMARY KEY, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS avatar_styles (player TEXT PRIMARY KEY, character TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS character_outfits (player TEXT NOT NULL, character TEXT NOT NULL, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL, PRIMARY KEY (player, character))');
    query('CREATE TABLE IF NOT EXISTS daily_rare_sales (day INTEGER PRIMARY KEY)');
  }
  get(sql, ...args) { return this.query(sql, ...args)[0]; }
  prune(now) {
    for (const [id, p] of this.people) if (now - p.seen > presenceMs) this.people.delete(id);
    for (const [ip, p] of this.joins) if (now - p.at > 60_000) this.joins.delete(ip);
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
    const rare = open ? marketRare(now,session)?.id ?? null : null;
    if (!open) return { ...session, stock: EMPTY_STOCK, goods: {}, rare, revision };
    const stock = roundStock(session.slot);
    let used = 0;
    for (const { item, qty } of this.query('SELECT item, qty FROM cloth_sales WHERE round = ?', round)) {
      const remaining=Math.max(0,(stock[item]??0)-qty);
      used+=(stock[item]??0)-remaining;
      if(Object.hasOwn(stock,item))stock[item]=remaining;
    }
    if (rare) {
      if (this.get('SELECT day FROM daily_rare_sales WHERE day = ?', seoulDay(now))) used++;
      else stock[rare] = 1;
    }
    return { ...session, stock, goods: {}, rare, revision: revision + used };
  }
  action(body, now = Date.now(), ip = 'local') {
    const { action, token, pos } = body ?? {};
    this.prune(now);
    return this.transaction(() => {
      let player = typeof token === 'string' && /^[0-9a-f]{48}$/.test(token)
        ? this.get('SELECT * FROM players WHERE token = ?', token) : undefined;
      let issued;
      if (!player && action === 'join') {
        const last = this.joins.get(ip);
        if (last?.count >= 12) return problem('잠시 후 다시 입장해 주세요.', 429);
        this.joins.set(ip, { at: last?.at ?? now, count: (last?.count ?? 0) + 1 });
        issued = newToken();
        player = { id: crypto.randomUUID(), token: issued, name: defaultName, cash: START_MONEY, sold: 0, collected: 0, reached: 0, traded: 0 };
        this.query('INSERT INTO players (id, token, name, cash) VALUES (?, ?, ?, ?)', player.id, issued, player.name, START_MONEY);
      }
      if (!player) return problem('장터에 다시 입장해 주세요.', 401);
      const session = this.session(now);
      const { round, open } = session;
      const allowance = this.get('SELECT round FROM allowances WHERE player = ?', player.id);
      if (open && allowance?.round !== round) {
        this.query('INSERT INTO allowances VALUES (?, ?) ON CONFLICT(player) DO UPDATE SET round = excluded.round', player.id, round);
        if (!allowance && player.name === '새내기 상인') {
          this.query('UPDATE players SET name = ? WHERE id = ?', defaultName, player.id);
          player.name = defaultName;
        }
        if (player.cash < START_MONEY) {
          this.query('UPDATE players SET cash = ? WHERE id = ?', START_MONEY, player.id);
          player.cash = START_MONEY;
        }
      }
      const previous = this.people.get(player.id) ?? SPAWN;
      const x = fit(pos?.x, MAP.minX, MAP.maxX, previous.x);
      const z = fit(pos?.z, MAP.minZ, MAP.maxZ, previous.z);
      let event;
      let speech = previous.speech;
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
        const item = MARKET_ITEMS.find(entry => entry.id === body.item);
        if (!item) return JUNK.some(entry => entry.id === body.item)
          ? problem('잡화점은 오픈 준비 중이에요.', 409) : problem('매대에 없는 물건이에요.');
        if (!open) return problem('장이 닫혔어요. 다음 개장 시간을 확인해 주세요.', 409);
        if (player.traded && now - player.traded < tradeMs) return problem('잠깐만요, 한 개씩 계산할게요.', 429);
        const inventory = this.inventory(now, session);
        if (inventory.rare!==item.id && !roundCloth(session.slot).some(entry=>entry.id===item.id)) {
          return problem('이 상품은 이번 장에서 판매하지 않아요.', 409);
        }
        if (!inventory.stock[item.id]) {
          return problem('다른 손님이 먼저 가져갔어요. 다음 장을 기다려 주세요.', 409);
        }
        if (player.cash < item.price) return problem('장터돈이 부족해요. 다음 장이 열리면 예산이 다시 채워져요.', 409);
        if (item.rare) {
          this.query('INSERT INTO daily_rare_sales VALUES (?)', seoulDay(now));
        } else {
          this.query('INSERT INTO cloth_sales VALUES (?, ?, 1) ON CONFLICT(round,item) DO UPDATE SET qty = qty + 1', round, item.id);
          this.query('DELETE FROM cloth_sales WHERE round < ?', round - 3 * 24 * 60);
        }
        this.query('UPDATE players SET cash = cash - ?, traded = ? WHERE id = ?', item.price, now, player.id);
        this.query('INSERT INTO basket VALUES (?, ?, 1, ?) ON CONFLICT(player,item) DO UPDATE SET qty = qty + 1, updated = excluded.updated', player.id, item.id, now);
        player.cash -= item.price;
        event = item.name + ' 장바구니에 담았어요!';
      } else if (action === 'chat') {
        const text = chatText(body.text);
        if (!text || [...text].length > CHAT_LIMIT) return problem('채팅은 1~80자로 입력해 주세요.');
        if (speech && now - speech.sentAt < chatCooldown) return problem('잠시 후 다시 말해 주세요.', 429);
        speech = { playerId: player.id, name: player.name, text, sentAt: now, expiresAt: now + CHAT_MS };
      } else if (action !== 'join' && action !== 'sync') {
        return problem('알 수 없는 거래입니다.');
      }
      this.people.set(player.id, { id: player.id, name: player.name, x, z, seen: now, speech, look });
      const ranking = this.query('SELECT id, name, collected FROM players WHERE collected > 0 ORDER BY collected DESC, reached ASC, id ASC LIMIT 30');
      const myRank = player.collected ? this.get('SELECT COUNT(*) + 1 AS rank FROM players WHERE collected > ? OR (collected = ? AND reached < ?)', player.collected, player.collected, player.reached).rank : null;
      const outfits = Object.fromEntries(this.query('SELECT character, hat, coat, bag, scarf FROM character_outfits WHERE player = ?', player.id).map(row=>[row.character,normalizeLook(row)]));
      outfits[look.character] = look;
      return {
        token: issued, event, speech: speech?.sentAt + CHAT_FEED_MS > now ? speech : undefined, now, ...this.inventory(now, session),
        player: { id: player.id, name: player.name, cash: player.cash, sold: player.sold, collected: player.collected, rank: myRank, look, outfits },
        basket: this.query('SELECT item, qty, updated FROM basket WHERE player = ? ORDER BY updated DESC, item', player.id),
        ranking, online: this.people.size,
        peers: [...this.people.values()].filter(p => p.id !== player.id).slice(0, 35).map(({ id, name, x, z, speech, look }) =>
          ({ id, name, x, z, look, speech: speech?.sentAt + CHAT_FEED_MS > now ? speech : undefined })),
      };
    });
  }
}

export function endpoint(market, request, allowedOrigin = '', ip = 'local', publish) {
  const origin = request.headers.get('Origin');
  const permitted = !origin || origin === (allowedOrigin || new URL(request.url).origin);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && permitted) headers['Access-Control-Allow-Origin'] = origin;
  const send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!permitted) return send({ error: '이 사이트에서는 장터에 연결할 수 없어요.' }, 403);
  if (request.method === 'GET') {
    const now=Date.now();
    return send({now,...market.session(now)});
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
      if (data.action === 'buy' || data.action === 'chat') publish?.(data.action, result);
      return send(result);
    } catch (error) {
      console.error('Market request failed:', error?.message);
      return send({ error: '장터 연결에 문제가 생겼어요.' }, 500);
    }
  })();
}
