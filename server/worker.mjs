import { DurableObject } from 'cloudflare:workers';
import { Market, endpoint } from './market.mjs';

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
    this.market = new Market((sql,...params) => storage.sql.exec(sql,...params).toArray(), fn => storage.transactionSync(fn), testWindow);
  }
  fetch(request) {
    const origin = request.headers.get('Origin');
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (origin && origin !== this.env.PAGES_ORIGIN) return new Response('Forbidden', { status: 403 });
      if (this.ctx.getWebSockets().length >= 120) return new Response('Market is busy', { status: 503 });
      const room = new URL(request.url).searchParams.get('room') === 'lobby' ? 'lobby' : 'market';
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ room });
      const status = this.ctx.storage.transactionSync(() => this.market.marketStatus(Date.now()));
      server.send(JSON.stringify({ type: 'market-status', ...status }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return endpoint(this.market, request, this.env.PAGES_ORIGIN, request.headers.get('CF-Connecting-IP') || 'unknown',
      (action, { now, stock, goods, revision, round, slot, nextSlot, next, open, closes, speech, testing, rare, dailyRareSold, room, marketOnline, marketCapacity }) => {
        const key = [round, open, revision, marketOnline].join(':');
        const changed = key !== this.lastMarketStatus;
        this.lastMarketStatus = key;
        const checkCrowd = changed || (room === 'market' && now - (this.lastCrowdAt ?? 0) >= 2000);
        if (!changed && action !== 'chat' && !checkCrowd) return;
        const status = changed ? JSON.stringify({ type: 'market-status', now, stock, goods, revision, round, slot, nextSlot, next, open, closes, testing, rare, dailyRareSold, marketOnline, marketCapacity }) : null;
        const chat = action === 'chat' ? JSON.stringify({ type: 'chat', speech }) : null;
        let crowd;
        if (checkCrowd) {
          this.lastCrowdAt = now;
          const snapshot = JSON.stringify({ type: 'market-crowd', crowd: this.market.marketCrowd() });
          if (snapshot !== this.lastCrowd) {
            this.lastCrowd = snapshot;
            crowd = snapshot;
          }
        }
        for (const socket of this.ctx.getWebSockets()) {
          try {
            const state = socketState(socket);
            if (status) socket.send(status);
            if (chat && state.room === room) socket.send(chat);
            if (crowd && state.watching) socket.send(crowd);
          } catch { /* the client has disconnected */ }
        }
      });
  }
  webSocketMessage(socket, message) {
    const state = socketState(socket);
    if (state.room !== 'lobby' || (message !== 'watch' && message !== 'unwatch')) {
      socket.close(1008, 'Unsupported feed action');
      return;
    }
    const watching = message === 'watch';
    if (Boolean(state.watching) === watching) return;
    socket.serializeAttachment({ ...state, watching });
    if (watching) {
      this.market.prune(Date.now());
      socket.send(JSON.stringify({ type: 'market-crowd', crowd: this.market.marketCrowd() }));
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
