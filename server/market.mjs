import { CLOTH, JUNK, MAP, SPAWN, START_MONEY, STOCK, nextRound, niceName, roundAt, fit } from '../game/catalog.mjs';

const defaultName = '새내기 상인';
const presenceMs = 30_000;
const tradeMs = 350;
const problem = (error, status = 400) => ({ error, status });
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
export class Market {
  constructor(query, transaction) {
    this.query = query;
    this.transaction = transaction;
    this.people = new Map();
    this.joins = new Map();
    query('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, cash INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, collected INTEGER NOT NULL DEFAULT 0, reached INTEGER NOT NULL DEFAULT 0, traded INTEGER NOT NULL DEFAULT 0)');
    query('CREATE INDEX IF NOT EXISTS ranking ON players (collected DESC, reached ASC, id ASC)');
    query('CREATE TABLE IF NOT EXISTS stock (round INTEGER PRIMARY KEY, scarf INTEGER NOT NULL, hanky INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS basket (player TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, item))');
    query('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL)');
    query('INSERT OR IGNORE INTO counter VALUES (1, 0)');
  }
  get(sql, ...args) { return this.query(sql, ...args)[0]; }
  prune(now) {
    for (const [id, p] of this.people) if (now - p.seen > presenceMs) this.people.delete(id);
    for (const [ip, p] of this.joins) if (now - p.at > 60_000) this.joins.delete(ip);
  }
  stock(now) {
    const round = roundAt(now);
    let record = this.get('SELECT scarf, hanky FROM stock WHERE round = ?', round);
    if (!record) {
      this.query('INSERT INTO stock VALUES (?, ?, ?)', round, STOCK.scarf, STOCK.hanky);
      this.query('DELETE FROM stock WHERE round < ?', round - 2);
      record = { ...STOCK };
    }
    return record;
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
      let event;
      if (action === 'rename') {
        const name = niceName(typeof body.name === 'string' ? body.name.slice(0, 120) : '');
        if (!name) return problem('한 글자 이상 입력해 주세요.');
        this.query('UPDATE players SET name = ? WHERE id = ?', name, player.id);
        player.name = name;
        event = '간판에 새 닉네임을 걸었어요.';
      } else if (action === 'sell' || action === 'buy') {
        if (player.traded && now - player.traded < tradeMs) return problem('잠깐만요, 한 개씩 계산할게요.', 429);
        if (action === 'sell') {
          const item = CLOTH.find(entry => entry.id === body.item);
          if (!item) return problem('판매할 수 없는 물건이에요.');
          if (!this.stock(now)[item.id]) return problem('이번 회차는 품절이에요. 다음 입고를 기다려 주세요.', 409);
          const column = item.id === 'scarf' ? 'scarf' : 'hanky';
          this.query('UPDATE stock SET ' + column + ' = ' + column + ' - 1 WHERE round = ?', roundAt(now));
          this.query('UPDATE players SET cash = cash + ?, sold = sold + 1, traded = ? WHERE id = ?', item.price, now, player.id);
          player.cash += item.price;
          player.sold++;
          event = item.name + ' 판매! +' + item.price.toLocaleString('ko-KR') + '원';
        } else {
          const item = JUNK.find(entry => entry.id === body.item);
          if (!item) return problem('잡화점에 없는 물건이에요.');
          if (player.cash < item.price) return problem('장터돈이 부족해요. 스카프나 손수건을 먼저 팔아 보세요.', 409);
          const order = this.get('UPDATE counter SET n = n + 1 WHERE id = 1 RETURNING n').n;
          this.query('UPDATE players SET cash = cash - ?, collected = collected + 1, reached = ?, traded = ? WHERE id = ?', item.price, order, now, player.id);
          this.query('INSERT INTO basket VALUES (?, ?, 1, ?) ON CONFLICT(player,item) DO UPDATE SET qty = qty + 1, updated = excluded.updated', player.id, item.id, now);
          player.cash -= item.price;
          player.collected++;
          player.reached = order;
          event = item.name + ' 장바구니에 담았어요!';
        }
      } else if (action !== 'join' && action !== 'sync') {
        return problem('알 수 없는 거래입니다.');
      }
      const previous = this.people.get(player.id) ?? SPAWN;
      const x = fit(pos?.x, MAP.minX, MAP.maxX, previous.x);
      const z = fit(pos?.z, MAP.minZ, MAP.maxZ, previous.z);
      this.people.set(player.id, { id: player.id, name: player.name, x, z, seen: now });
      const ranking = this.query('SELECT id, name, collected FROM players WHERE collected > 0 ORDER BY collected DESC, reached ASC, id ASC LIMIT 30');
      const myRank = player.collected ? this.get('SELECT COUNT(*) + 1 AS rank FROM players WHERE collected > ? OR (collected = ? AND reached < ?)', player.collected, player.collected, player.reached).rank : null;
      return {
        token: issued, event, now, next: nextRound(now), stock: this.stock(now),
        player: { id: player.id, name: player.name, cash: player.cash, sold: player.sold, collected: player.collected, rank: myRank },
        basket: this.query('SELECT item, qty, updated FROM basket WHERE player = ? ORDER BY updated DESC, item', player.id),
        ranking, online: this.people.size, peers: [...this.people.values()].filter(p => p.id !== player.id).slice(0, 35).map(({ id, name, x, z }) => ({ id, name, x, z })),
      };
    });
  }
}

export function endpoint(market, request, allowedOrigin = '', ip = 'local') {
  const origin = request.headers.get('Origin');
  const permitted = !origin || origin === (allowedOrigin || new URL(request.url).origin);
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && permitted) headers['Access-Control-Allow-Origin'] = origin;
  const send = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!permitted) return send({ error: '이 사이트에서는 장터에 연결할 수 없어요.' }, 403);
  if (request.method !== 'POST') return send({ error: 'POST 요청만 받습니다.' }, 405);
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
      return send(result);
    } catch (error) {
      console.error('Market request failed:', error?.message);
      return send({ error: '장터 연결에 문제가 생겼어요.' }, 500);
    }
  })();
}
