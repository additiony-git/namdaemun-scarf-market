import { DurableObject } from 'cloudflare:workers';
import { Market, endpoint, permitsMarketOrigin } from './market.mjs';

function socketState(socket) {
  const state = socket.deserializeAttachment();
  return typeof state === 'string' ? { room: state } : state ?? { room: 'market' };
}

export class MarketRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const storage = ctx.storage;
    const from = Date.parse(env.TEST_MARKET_FROM);
    const until = Date.parse(env.TEST_MARKET_UNTIL);
    const testWindow = Number.isFinite(from) && Number.isFinite(until) && until > from ? { from, until } : undefined;
    this.market = new Market((sql,...params) => storage.sql.exec(sql,...params).toArray(), fn => storage.transactionSync(fn), testWindow, env.GOOGLE_CLIENT_ID);
    this.allowedOrigins = [env.PAGES_ORIGIN, env.PAGES_CUSTOM_ORIGIN].filter(Boolean);
  }
  fetch(request) {
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (!permitsMarketOrigin(request, this.allowedOrigins)) return new Response('Forbidden', { status: 403 });
      if (this.ctx.getWebSockets().length >= 120) return new Response('Market is busy', { status: 503 });
      const requestedRoom = new URL(request.url).searchParams.get('room');
      const room = requestedRoom === 'watch' ? 'watch' : requestedRoom === 'lobby' ? 'lobby' : 'market';
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(this.market.googleClientId && room !== 'watch' ? { room: 'watch', requestedRoom: room } : { room });
      const status = this.ctx.storage.transactionSync(() => this.market.marketStatus(Date.now()));
      server.send(JSON.stringify({ type: 'market-status', ...status }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return endpoint(this.market, request, this.allowedOrigins, request.headers.get('CF-Connecting-IP') || 'unknown',
      (action, { now, lastClose, stock, goods, revision, round, slot, nextSlot, next, open, closes, speech, testing, rare, room, marketOnline, marketCapacity, rarePickup, player, queueAdvanced }) => {
        const key = [round, open, revision, lastClose, marketOnline].join(':');
        const changed = key !== this.lastMarketStatus;
        this.lastMarketStatus = key;
        const pickup = action === 'buy' && rarePickup?.id === player.id && rarePickup.sentAt === now ? rarePickup : null;
        const checkCrowd = changed || pickup || (room === 'market' &&
          (action === 'chat' || action === 'profile' || now - (this.lastCrowdAt ?? 0) >= 2000));
        if (!changed && action !== 'chat' && !checkCrowd && !queueAdvanced) return;
        const status = changed ? JSON.stringify({ type: 'market-status', now, lastClose, stock, goods, revision, round, slot, nextSlot, next, open, closes, testing, rare, marketOnline, marketCapacity }) : null;
        const chat = action === 'chat' ? JSON.stringify({ type: 'chat', speech }) : null;
        let crowd;
        if (checkCrowd) {
          this.lastCrowdAt = now;
          const visitors = this.market.marketCrowd(now);
          const snapshot = JSON.stringify(visitors);
          if (snapshot !== this.lastCrowd) {
            this.lastCrowd = snapshot;
            crowd = JSON.stringify({ type: 'market-crowd', now, crowd: visitors });
          }
        }
        for (const socket of this.ctx.getWebSockets()) {
          try {
            const state = socketState(socket);
            if (status) socket.send(status);
            if (chat && state.room === room) socket.send(chat);
            if (queueAdvanced && state.room === 'lobby') socket.send('{"type":"queue-advanced"}');
            if (crowd && state.watching) socket.send(crowd);
            if (pickup && (state.watching || state.room === 'market')) {
              const { id, watchId, ...details } = pickup;
              socket.send(JSON.stringify({ type: 'rare-pickup', pickup: { ...details, id: state.watching ? watchId : id } }));
            }
          } catch { /* the client has disconnected */ }
        }
      });
  }
  webSocketMessage(socket, message) {
    const state = socketState(socket);
    if (state.requestedRoom && typeof message === 'string' && message.startsWith('session:')) {
      const player = this.market.sessionPlayer(message.slice(8), Date.now());
      if (player && this.market.people.get(player.id)?.room === state.requestedRoom) {
        socket.serializeAttachment({ room: state.requestedRoom, watching: state.watching });
      } else socket.close(1008, 'Invalid session');
      return;
    }
    if (!['lobby', 'watch'].includes(state.room) || (message !== 'watch' && message !== 'unwatch')) {
      socket.close(1008, 'Unsupported feed action');
      return;
    }
    const watching = message === 'watch';
    if (Boolean(state.watching) === watching) return;
    socket.serializeAttachment({ ...state, watching });
    if (watching) {
      const now = Date.now();
      this.market.prune(now);
      socket.send(JSON.stringify({ type: 'market-crowd', now, crowd: this.market.marketCrowd(now) }));
      const pickup = this.market.rarePickup(now, true);
      if (pickup) socket.send(JSON.stringify({ type: 'rare-pickup', pickup }));
    }
  }
  webSocketClose(socket) {
    socket.close(1000);
  }
}
export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/market') return new Response('Not found', { status:404 });
    return env.MARKET_ROOM.get(env.MARKET_ROOM.idFromName('namdaemun-main')).fetch(request);
  },
};
