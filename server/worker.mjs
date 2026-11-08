import { DurableObject } from 'cloudflare:workers';
import { Market, endpoint } from './market.mjs';

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
      server.serializeAttachment(room);
      const status = this.ctx.storage.transactionSync(() => this.market.marketStatus(Date.now()));
      server.send(JSON.stringify({ type: 'market-status', ...status }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return endpoint(this.market, request, this.env.PAGES_ORIGIN, request.headers.get('CF-Connecting-IP') || 'unknown',
      (action, { now, stock, goods, revision, round, slot, nextSlot, next, open, closes, speech, testing, rare, room, marketOnline, marketCapacity }) => {
        const key = [round, open, revision, marketOnline].join(':');
        const changed = key !== this.lastMarketStatus;
        this.lastMarketStatus = key;
        if (!changed && action !== 'chat') return;
        const status = changed ? JSON.stringify({ type: 'market-status', now, stock, goods, revision, round, slot, nextSlot, next, open, closes, testing, rare, marketOnline, marketCapacity }) : null;
        const chat = action === 'chat' ? JSON.stringify({ type: 'chat', speech }) : null;
        for (const socket of this.ctx.getWebSockets()) {
          try {
            if (status) socket.send(status);
            if (chat && (socket.deserializeAttachment() ?? 'market') === room) socket.send(chat);
          } catch { /* the client has disconnected */ }
        }
      });
  }
  webSocketMessage(socket) {
    socket.close(1008, 'Market feed is read only');
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
