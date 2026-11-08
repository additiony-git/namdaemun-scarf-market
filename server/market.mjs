import { CHAT_FEED_MS, CHAT_LIMIT, CHAT_MS, EMPTY_STOCK, JUNK, LOBBY_CHAT_LIMIT, LOBBY_CHAT_MS, MAP, MARKET_CAPACITY, MARKET_EXIT_MS, MARKET_ITEMS, PAWN_LISTING_LIMIT, PAWN_MAX_PRICE, RARE_PICKUP_MS, RARE_SCARVES, ROUND_CURRENCY, SPAWN, chatText, fit, isNightMarket, lastMarketClose, marketRare, marketSession, niceName, normalizeLook, roundCloth, roundStock, seoulDay, seoulDayStart } from '../game/catalog.mjs';
import { verifyGoogleCredential } from './google.mjs';

const defaultName = '새내기 손님';
const presenceMs = 30_000;
const idleMarketPresenceMs = 55_000;
const lobbyPresenceMs = 270_000;
const queuePresenceMs = 270_000;
const queueRenewalMs = 220_000;
const tradeMs = 350;
const chatCooldown = 1800;
const guestChatCooldown = 3000;
const loginChallengeMs = 10 * 60_000;
const loginSessionMs = 90 * 86_400_000;
const minute = 60_000;
const rareIds = RARE_SCARVES.map(item => item.id);
const rareParams = rareIds.map(() => '?').join(', ');
const pawnActions = new Set(['pawn-sell', 'pawn-list', 'pawn-buy', 'pawn-cancel']);
const pawnPageSize = 20;
const pawnItems = new Map([...MARKET_ITEMS, ...JUNK].map(item => [item.id, item]));
const problem = (error, status = 400) => ({ error, status });
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
const validToken = token => typeof token === 'string' && /^[0-9a-f]{48}$/.test(token);
export class Market {
  constructor(query, transaction, testWindow, googleClientId = '', requireGoogleLogin = false) {
    this.query = query;
    this.transaction = transaction;
    this.testWindow = testWindow;
    this.googleClientId = googleClientId;
    this.loginRequired = requireGoogleLogin || Boolean(googleClientId);
    this.people = new Map();
    this.nextWatchId = 0;
    this.lobbyMessages = [];
    this.guestChats = new Map();
    this.joins = new Map();
    query('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, cash INTEGER NOT NULL, sold INTEGER NOT NULL DEFAULT 0, collected INTEGER NOT NULL DEFAULT 0, reached INTEGER NOT NULL DEFAULT 0, traded INTEGER NOT NULL DEFAULT 0)');
    query('CREATE INDEX IF NOT EXISTS ranking ON players (collected DESC, reached ASC, id ASC)');
    query('CREATE TABLE IF NOT EXISTS cloth_sales (round INTEGER NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY(round, item))');
    query('CREATE TABLE IF NOT EXISTS basket (player TEXT NOT NULL, item TEXT NOT NULL, qty INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(player, item))');
    query('CREATE TABLE IF NOT EXISTS allowances (player TEXT PRIMARY KEY, round INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS round_currency (player TEXT NOT NULL, round INTEGER NOT NULL, PRIMARY KEY (player, round))');
    query('CREATE TABLE IF NOT EXISTS market_balances (player TEXT NOT NULL, round INTEGER NOT NULL, balance INTEGER NOT NULL, PRIMARY KEY (player, round))');
    query('CREATE TABLE IF NOT EXISTS pawn_wallets (player TEXT PRIMARY KEY, balance INTEGER NOT NULL, updated INTEGER NOT NULL)');
    query('CREATE INDEX IF NOT EXISTS pawn_wallet_ranking ON pawn_wallets (balance DESC, updated, player)');
    query('CREATE TABLE IF NOT EXISTS pawn_listings (id TEXT PRIMARY KEY, seller TEXT NOT NULL, item TEXT NOT NULL, price INTEGER NOT NULL, cost INTEGER NOT NULL, acquired INTEGER NOT NULL, listed INTEGER NOT NULL)');
    query('CREATE INDEX IF NOT EXISTS pawn_listing_order ON pawn_listings (listed DESC, id)');
    query('CREATE INDEX IF NOT EXISTS pawn_listings_by_seller ON pawn_listings (seller)');
    // Only copies acquired above the market price need an explicit cost record.
    query('CREATE TABLE IF NOT EXISTS pawn_costs (player TEXT NOT NULL, item TEXT NOT NULL, cost INTEGER NOT NULL, qty INTEGER NOT NULL, PRIMARY KEY (player, item, cost))');
    query('CREATE TABLE IF NOT EXISTS looks (player TEXT PRIMARY KEY, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS avatar_styles (player TEXT PRIMARY KEY, character TEXT NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS character_outfits (player TEXT NOT NULL, character TEXT NOT NULL, hat TEXT NOT NULL, coat TEXT NOT NULL, bag TEXT NOT NULL, scarf TEXT NOT NULL, PRIMARY KEY (player, character))');
    query('CREATE TABLE IF NOT EXISTS daily_rare_sales (day INTEGER PRIMARY KEY)');
    query('CREATE TABLE IF NOT EXISTS market_queue (sequence INTEGER PRIMARY KEY, player TEXT UNIQUE NOT NULL, round INTEGER NOT NULL, seen INTEGER NOT NULL)');
    query('CREATE INDEX IF NOT EXISTS queue_seen ON market_queue (seen)');
    query('CREATE TABLE IF NOT EXISTS google_accounts (subject TEXT PRIMARY KEY, player TEXT UNIQUE NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS google_challenges (nonce TEXT PRIMARY KEY, origin TEXT NOT NULL, guest TEXT, ip TEXT NOT NULL, expires INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS player_sessions (token TEXT PRIMARY KEY, player TEXT NOT NULL, expires INTEGER NOT NULL)');
    query('CREATE TABLE IF NOT EXISTS market_migrations (name TEXT PRIMARY KEY)');
    transaction(() => {
      if (!query("INSERT OR IGNORE INTO market_migrations VALUES ('basket_ranking') RETURNING name").length) return;
      // Older purchases saved quantities and purchase times in the basket without updating the ranking.
      query(`UPDATE players SET collected = totals.quantity, reached = totals.last_purchase
        FROM (SELECT player, SUM(qty) AS quantity, MAX(updated) AS last_purchase FROM basket GROUP BY player) AS totals
        WHERE players.id = totals.player AND players.collected < totals.quantity`);
    });
  }
  get(sql, ...args) { return this.query(sql, ...args)[0]; }
  sessionPlayer(token, now) {
    if (!validToken(token)) return;
    return this.get('SELECT p.* FROM player_sessions s JOIN players p ON p.id = s.player WHERE s.token = ? AND s.expires > ?', token, now);
  }
  googleChallenge(guestToken, origin, now, ip) {
    return this.transaction(() => {
      this.query('DELETE FROM google_challenges WHERE expires <= ?', now);
      const { count } = this.get('SELECT COUNT(*) AS count FROM google_challenges WHERE ip = ?', ip);
      if (count >= 12) return problem('잠시 후 다시 로그인해 주세요.', 429);
      const guest = validToken(guestToken) ? this.get('SELECT id FROM players WHERE token = ?', guestToken)?.id : null;
      const nonce = newToken();
      this.query('INSERT INTO google_challenges VALUES (?, ?, ?, ?, ?)', nonce, origin, guest ?? null, ip, now + loginChallengeMs);
      return { nonce };
    });
  }
  googleLogin(identity, origin, now) {
    return this.transaction(() => {
      const challenge = this.get('DELETE FROM google_challenges WHERE nonce = ? AND origin = ? AND expires > ? RETURNING guest',
        identity.nonce, origin, now);
      if (!challenge) return problem('로그인 시간이 지났어요. Google 로그인을 다시 열어 주세요.', 401);
      let player = this.get('SELECT player FROM google_accounts WHERE subject = ?', identity.subject)?.player;
      let linkedGuest = false;
      if (!player) {
        if (challenge.guest) {
          if (this.get('SELECT 1 FROM google_accounts WHERE player = ?', challenge.guest)) {
            return problem('이 게스트 기록은 이미 Google 계정에 연결되어 있어요.', 409);
          }
          player = challenge.guest;
          linkedGuest = true;
          this.query('UPDATE players SET token = ? WHERE id = ?', newToken(), player);
        } else {
          player = crypto.randomUUID();
          this.query('INSERT INTO players (id, token, name, cash) VALUES (?, ?, ?, 0)', player, newToken(), defaultName);
        }
        this.query('INSERT INTO google_accounts VALUES (?, ?)', identity.subject, player);
      }
      this.query('DELETE FROM player_sessions WHERE expires <= ?', now);
      const token = newToken();
      this.query('INSERT INTO player_sessions VALUES (?, ?, ?)', token, player, now + loginSessionMs);
      return { token, linkedGuest, otherGuest: Boolean(challenge.guest && challenge.guest !== player) };
    });
  }
  logout(token) {
    if (!validToken(token)) return;
    this.transaction(() => {
      const session = this.get('DELETE FROM player_sessions WHERE token = ? RETURNING player', token);
      if (!session) return;
      this.people.delete(session.player);
      this.query('DELETE FROM market_queue WHERE player = ?', session.player);
    });
  }
  collectionRanking() {
    return this.query('SELECT id, name, collected FROM players WHERE collected > 0 ORDER BY collected DESC, reached ASC, id ASC LIMIT 30');
  }
  cashRanking(playerId = null) {
    const rows = this.query(`SELECT p.id, p.name, w.balance AS balance
      FROM pawn_wallets w JOIN players p ON p.id = w.player
      WHERE w.balance > 0 ORDER BY w.balance DESC, w.updated, w.player LIMIT 30`);
    const wallet = playerId && this.get('SELECT balance, updated FROM pawn_wallets WHERE player = ? AND balance > 0', playerId);
    const rank = wallet ? this.get(`SELECT COUNT(*) + 1 AS rank FROM pawn_wallets
      WHERE balance > ? OR (balance = ? AND (updated, player) < (?, ?))`,
      wallet.balance, wallet.balance, wallet.updated, playerId).rank : null;
    return { rows, rank, count: wallet?.balance ?? 0 };
  }
  rareRanking(playerId = null) {
    const ranks = this.query(`SELECT id, name, collected, rank, items FROM (
      SELECT p.id, p.name, SUM(b.qty) AS collected,
        ROW_NUMBER() OVER (ORDER BY SUM(b.qty) DESC, MAX(b.updated), p.id) AS rank,
        json_group_array(json_object('item', b.item, 'qty', b.qty)) AS items
      FROM (
        SELECT player, item, SUM(qty) AS qty, MAX(updated) AS updated
        FROM (
          SELECT player, item, qty, updated FROM basket WHERE item IN (${rareParams}) AND qty > 0
          UNION ALL SELECT seller, item, 1, acquired FROM pawn_listings
        ) GROUP BY player, item
      ) b JOIN players p ON p.id = b.player
      GROUP BY p.id, p.name
    ) WHERE rank <= 30 OR id = ? ORDER BY rank`, ...rareIds, playerId);
    const personal = ranks.find(row => row.id === playerId);
    const rows = ranks.filter(row => row.rank <= 30).map(row => ({ ...row, items: JSON.parse(row.items) }));
    return { rows, rank: personal?.rank ?? null, count: personal?.collected ?? 0 };
  }
  addLobbyMessage(speech) {
    this.lobbyMessages.push(speech);
    if (this.lobbyMessages.length > LOBBY_CHAT_LIMIT) this.lobbyMessages.shift();
  }
  guestLobbyChat(value, now, ip) {
    const text = chatText(value);
    if (!text || [...text].length > CHAT_LIMIT) return problem('채팅은 1~80자로 입력해 주세요.');
    this.prune(now);
    if (now - (this.guestChats.get(ip) ?? -Infinity) < guestChatCooldown) {
      return problem('잠시 후 다시 말해 주세요.', 429);
    }
    this.guestChats.set(ip, now);
    const speech = { playerId: crypto.randomUUID(), name: '구경 손님', text, sentAt: now, expiresAt: now + CHAT_MS };
    this.addLobbyMessage(speech);
    return { speech };
  }
  issueRoundCurrency(player, round) {
    const legacy = this.get('SELECT MAX(round) AS round FROM round_currency WHERE player = ?', player.id).round ??
      this.get('SELECT round FROM allowances WHERE player = ?', player.id)?.round;
    if (legacy == null && player.name === '새내기 상인') {
      this.query('UPDATE players SET name = ? WHERE id = ?', defaultName, player.id);
      player.name = defaultName;
    }
    // Preserve the active legacy allowance up to the new cap. Later rounds always start fresh.
    const balance = legacy === round ? Math.max(0, Math.min(player.cash, ROUND_CURRENCY)) : ROUND_CURRENCY;
    this.query('INSERT INTO market_balances VALUES (?, ?, ?)', player.id, round, balance);
    return { balance, grant: legacy === round ? null : ROUND_CURRENCY };
  }
  pawnWallet(player) {
    return this.get('SELECT balance FROM pawn_wallets WHERE player = ?', player)?.balance ?? 0;
  }
  creditPawn(player, amount, now) {
    this.query(`INSERT INTO pawn_wallets VALUES (?, ?, ?)
      ON CONFLICT(player) DO UPDATE SET balance = balance + excluded.balance, updated = excluded.updated`, player, amount, now);
  }
  rareCost(player, item, qty) {
    const { quantity, lowest } = this.get('SELECT SUM(qty) AS quantity, MIN(cost) AS lowest FROM pawn_costs WHERE player = ? AND item = ?',
      player, item.id);
    return quantity === qty ? lowest : item.price;
  }
  receivePawnItem(player, item, cost, acquired) {
    this.query(`INSERT INTO basket VALUES (?, ?, 1, ?)
      ON CONFLICT(player, item) DO UPDATE SET qty = qty + 1, updated = MAX(updated, excluded.updated)`, player, item.id, acquired);
    if (cost > item.price) {
      this.query('INSERT INTO pawn_costs VALUES (?, ?, ?, 1) ON CONFLICT(player, item, cost) DO UPDATE SET qty = qty + 1',
        player, item.id, cost);
    }
  }
  removePawnItem(player, item, qty) {
    if (qty > 1) {
      this.query('UPDATE basket SET qty = qty - 1 WHERE player = ? AND item = ?', player, item);
      return;
    }
    this.query('DELETE FROM basket WHERE player = ? AND item = ?', player, item);
    this.query("UPDATE looks SET scarf = 'classic' WHERE player = ? AND scarf = ?", player, item);
    this.query("UPDATE character_outfits SET scarf = 'classic' WHERE player = ? AND scarf = ?", player, item);
  }
  pawnView(player, page) {
    const { count } = this.get('SELECT COUNT(*) AS count FROM pawn_listings WHERE seller <> ?', player);
    const pages = Math.max(1, Math.ceil(count / pawnPageSize));
    page = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pages - 1)) : 0;
    const listings = this.query(`SELECT l.id, l.item, l.price, p.name
      FROM pawn_listings l JOIN players p ON p.id = l.seller WHERE l.seller <> ?
      ORDER BY l.listed DESC, l.id LIMIT ? OFFSET ?`, player, pawnPageSize, page * pawnPageSize);
    const mine = this.query('SELECT id, item, price FROM pawn_listings WHERE seller = ? ORDER BY listed DESC, id', player);
    const owned = this.query(`SELECT item, qty FROM basket WHERE player = ? AND qty > 0 AND item IN (${rareParams})`, player, ...rareIds);
    const floors = Object.fromEntries(owned.map(({ item, qty }) => [item, this.rareCost(player, pawnItems.get(item), qty)]));
    return { listings, mine, floors, page, pages };
  }
  pawnTrade(player, body, now) {
    if (body.action === 'pawn-sell' || body.action === 'pawn-list') {
      const item = pawnItems.get(body.item);
      const listing = body.action === 'pawn-list';
      if (!item || Boolean(item.rare) !== listing) return problem(listing ? '레어템만 판매 등록할 수 있어요.' : '일반템만 반값에 매입해요.');
      const owned = this.get('SELECT qty, updated FROM basket WHERE player = ? AND item = ? AND qty > 0', player, item.id);
      if (!owned) return problem('보유한 물건이 없어요.', 409);
      if (!listing) {
        const amount = Math.floor(item.price / 2);
        this.removePawnItem(player, item.id, owned.qty);
        this.creditPawn(player, amount, now);
        return { event: item.name + ' 매각 · 현금 ' + amount.toLocaleString('ko-KR') + '원을 받았어요.' };
      }
      const cost = this.rareCost(player, item, owned.qty);
      const { price } = body;
      if (!Number.isSafeInteger(price) || price < cost || price > PAWN_MAX_PRICE) {
        return problem('판매가는 ' + cost.toLocaleString('ko-KR') + '원부터 ' + PAWN_MAX_PRICE.toLocaleString('ko-KR') + '원까지 입력할 수 있어요.');
      }
      const { count } = this.get('SELECT COUNT(*) AS count FROM pawn_listings WHERE seller = ?', player);
      if (count >= PAWN_LISTING_LIMIT) return problem('판매 등록은 한 번에 ' + PAWN_LISTING_LIMIT + '개까지 할 수 있어요.', 409);
      this.removePawnItem(player, item.id, owned.qty);
      if (cost > item.price) {
        this.query('UPDATE pawn_costs SET qty = qty - 1 WHERE player = ? AND item = ? AND cost = ?', player, item.id, cost);
        this.query('DELETE FROM pawn_costs WHERE player = ? AND item = ? AND cost = ? AND qty = 0', player, item.id, cost);
      }
      this.query('INSERT INTO pawn_listings VALUES (?, ?, ?, ?, ?, ?, ?)', crypto.randomUUID(), player, item.id, price, cost, owned.updated, now);
      return { event: item.name + ' 판매를 등록했어요.' };
    }
    if (typeof body.listing !== 'string') return problem('판매 물건을 골라 주세요.');
    const listing = this.get('SELECT * FROM pawn_listings WHERE id = ?', body.listing);
    if (!listing) return problem('이미 팔렸거나 등록이 취소된 물건이에요.', 409);
    const item = pawnItems.get(listing.item);
    if (body.action === 'pawn-cancel') {
      if (listing.seller !== player) return problem('내가 등록한 물건만 취소할 수 있어요.', 403);
      this.query('DELETE FROM pawn_listings WHERE id = ?', listing.id);
      this.receivePawnItem(player, item, listing.cost, listing.acquired);
      return { event: item.name + ' 판매를 취소했어요.' };
    }
    if (listing.seller === player) return problem('내가 올린 물건은 구매할 수 없어요.', 409);
    if (this.pawnWallet(player) < listing.price) return problem('전당포 현금이 부족해요.', 409);
    this.query('DELETE FROM pawn_listings WHERE id = ?', listing.id);
    this.creditPawn(player, -listing.price, now);
    this.creditPawn(listing.seller, listing.price, now);
    this.receivePawnItem(player, item, listing.price, now);
    return { event: item.name + ' 전당포에서 구매했어요.', item: item.id };
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
    for (const [ip, at] of this.guestChats) if (now - at >= guestChatCooldown) this.guestChats.delete(ip);
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
  rarePickup(now, watching = false, preferredPlayer) {
    let latest;
    for (const person of this.people.values()) {
      if (person.room !== 'market' || !(person.pickup?.expiresAt > now)) continue;
      if (person.id === preferredPlayer) {
        latest = person;
        break;
      }
      if (!latest || person.pickup.sentAt > latest.pickup.sentAt) latest = person;
    }
    if (!latest) return;
    return watching ? { id: latest.watchId, ...latest.pickup } : { id: latest.id, watchId: latest.watchId, ...latest.pickup };
  }
  marketStatus(now, watch = false) {
    const lastClose = this.lastClose(now);
    this.prune(now, lastClose);
    return { now, lastClose, ...this.inventory(now), marketOnline: this.marketCount(), marketCapacity: MARKET_CAPACITY,
      loginRequired: this.loginRequired, googleClientId: this.googleClientId || undefined,
      crowd: watch ? this.marketCrowd(now) : undefined,
      rarePickup: watch ? this.rarePickup(now, true) : undefined };
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
      let player = this.sessionPlayer(token, now);
      if (this.loginRequired && !player) return problem('Google로 로그인한 뒤 시장에 입장해 주세요.', 401);
      if (!player && validToken(token)) player = this.get('SELECT * FROM players WHERE token = ?', token);
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
      const pawnAction = pawnActions.has(action);
      if (!pawnAction && !['join', 'sync', 'rename', 'profile', 'buy', 'chat'].includes(action)) {
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
      let allowance = open ? this.get('SELECT balance FROM market_balances WHERE player = ? AND round = ?', player.id, round) : null;
      if (!allowance && room === 'market' && open && !closing && connecting) allowance = this.issueRoundCurrency(player, round);
      let regionBalance = allowance?.balance ?? 0;
      const currencyGrant = allowance?.grant ?? null;
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
        if (regionBalance < item.price) {
          return problem(`지역화폐가 부족해요. 다음 장에 입장하면 ${ROUND_CURRENCY.toLocaleString('ko-KR')}원을 받아요.`, 409);
        }
        if (item.rare) pickup = { item: item.id, sentAt: now, expiresAt: now + RARE_PICKUP_MS };
        this.query('INSERT INTO cloth_sales VALUES (?, ?, 1) ON CONFLICT(round,item) DO UPDATE SET qty = qty + 1', round, item.id);
        this.query('DELETE FROM cloth_sales WHERE round < ?', round - 3 * 24 * 60);
        this.query('UPDATE market_balances SET balance = balance - ? WHERE player = ? AND round = ?', item.price, player.id, round);
        this.query('UPDATE players SET traded = ?, collected = collected + 1, reached = ? WHERE id = ?', now, now, player.id);
        this.query('INSERT INTO basket VALUES (?, ?, 1, ?) ON CONFLICT(player,item) DO UPDATE SET qty = qty + 1, updated = excluded.updated', player.id, item.id, now);
        regionBalance -= item.price;
        player.collected++;
        player.reached = now;
        event = item.name + ' 장바구니에 담았어요!';
      } else if (pawnAction) {
        const result = this.pawnTrade(player.id, body, now);
        if (result.error) return result;
        event = result.event;
        if (result.item && room === 'market') pickup = { item: result.item, sentAt: now, expiresAt: now + RARE_PICKUP_MS };
        if ((action === 'pawn-sell' || action === 'pawn-list') && look.scarf === body.item &&
            !this.get('SELECT 1 FROM basket WHERE player = ? AND item = ? AND qty > 0', player.id, body.item)) {
          look = { ...look, scarf: 'classic' };
        }
      } else if (action === 'chat') {
        const text = chatText(body.text);
        if (!text || [...text].length > CHAT_LIMIT) return problem('채팅은 1~80자로 입력해 주세요.');
        if (lastChat !== undefined && now - lastChat < chatCooldown) return problem('잠시 후 다시 말해 주세요.', 429);
        speech = { playerId: player.id, name: player.name, text, sentAt: now, expiresAt: now + CHAT_MS };
        lastChat = now;
        if (room === 'lobby') this.addLobbyMessage(speech);
      }
      const watchId = room === 'market' ? previous.watchId ?? ++this.nextWatchId : undefined;
      const entryRound = room === 'market' ? previous.entryRound ?? lastClose : undefined;
      this.people.set(player.id, { id: player.id, name: player.name, room, entryRound, x, z, seen: now, idle: !open, speech, lastChat, look, watchId, pickup });
      const roomPeople = [...this.people.values()].filter(person => person.room === room);
      const ranking = this.collectionRanking();
      const myRank = player.collected ? this.get(
        'SELECT COUNT(*) + 1 AS rank FROM players WHERE collected > ? OR (collected = ? AND (reached, id) < (?, ?))',
        player.collected, player.collected, player.reached, player.id).rank : null;
      const outfits = Object.fromEntries(this.query('SELECT character, hat, coat, bag, scarf FROM character_outfits WHERE player = ?', player.id).map(row=>[row.character,normalizeLook(row)]));
      outfits[look.character] = look;
      const queuePosition = room === 'lobby' ? this.get(
        'SELECT COUNT(*) AS position FROM market_queue WHERE seen >= ? AND sequence <= (SELECT sequence FROM market_queue WHERE player = ? AND seen >= ?)',
        queueSince, player.id, queueSince).position || null : null;
      return {
        token: issued, event, room, admission, currencyGrant, speech: speech?.sentAt + CHAT_FEED_MS > now ? speech : undefined, now, lastClose, ...this.inventory(now, session),
        marketOnline: this.marketCount(), marketCapacity: MARKET_CAPACITY, queuePosition, queueAdvanced,
        player: { id: player.id, name: player.name, cash: regionBalance, pawnCash: this.pawnWallet(player.id), sold: player.sold, collected: player.collected, rank: myRank, look, outfits },
        basket: this.query('SELECT item, qty, updated FROM basket WHERE player = ? ORDER BY updated DESC, item', player.id),
        ranking, rareRanking: body.includeRareRanking === true ? this.rareRanking(player.id) : undefined,
        cashRanking: body.includeCashRanking === true ? this.cashRanking(player.id) : undefined,
        pawn: pawnAction || body.includePawn === true ? this.pawnView(player.id, body.pawnPage) : undefined,
        online: roomPeople.length,
        lobbyMessages: room === 'lobby' ? this.lobbyMessages.slice() : undefined,
        crowd: room === 'lobby' && body.watch === true ? this.marketCrowd(now) : undefined,
        rarePickup: room === 'market' || body.watch === true ? this.rarePickup(now, room === 'lobby', pickup?.sentAt === now ? player.id : undefined) : undefined,
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
    const params = new URL(request.url).searchParams;
    const status = market.marketStatus(Date.now(), params.get('watch') === '1');
    if (params.get('lobby') === '1') status.lobbyMessages = market.lobbyMessages.slice();
    const ranking = params.get('ranking');
    if (ranking === 'all') status.publicRanking = { kind: ranking, rows: market.collectionRanking() };
    if (ranking === 'rare') status.publicRanking = { kind: ranking, rows: market.rareRanking().rows };
    if (ranking === 'cash') status.publicRanking = { kind: ranking, rows: market.cashRanking().rows };
    return send(status);
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
          if ((bytes += value.byteLength) > 12_000) { await reader.cancel(); return send({ error: '요청이 너무 커요.' }, 413); }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      }
      let data;
      try { data = JSON.parse(raw); } catch { return send({ error: '요청을 읽을 수 없어요.' }, 400); }
      if (data?.action === 'guest-lobby-chat') {
        if (!origin) return send({ error: '게임 화면에서 채팅해 주세요.' }, 403);
        const result = market.guestLobbyChat(data.text, Date.now(), ip);
        if (result.error) return send({ error: result.error }, result.status);
        publish?.('chat', { room: 'lobby', speech: result.speech });
        return send(result);
      }
      if (data?.action === 'logout') {
        market.logout(data.token);
        return send({ ok: true });
      }
      if (data?.action === 'google-challenge' || data?.action === 'google-login') {
        if (!origin) return send({ error: '게임 화면에서 로그인해 주세요.' }, 403);
        if (!market.googleClientId) return send({ error: 'Google 로그인 설정이 필요해요.' }, 503);
        const now = Date.now();
        if (data.action === 'google-challenge') {
          const result = market.googleChallenge(data.guestToken, origin, now, ip);
          return result.error ? send({ error: result.error }, result.status) : send(result);
        }
        const identity = await verifyGoogleCredential(data.credential, market.googleClientId, now);
        if (!identity) return send({ error: 'Google 계정을 확인할 수 없어요. 다시 로그인해 주세요.' }, 401);
        const result = market.googleLogin(identity, origin, Date.now());
        return result.error ? send({ error: result.error }, result.status) : send(result);
      }
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
