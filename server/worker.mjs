import { DurableObject } from 'cloudflare:workers';
import { Market, endpoint } from './market.mjs';

export class MarketRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const storage = ctx.storage;
    this.market = new Market((sql,...params) => storage.sql.exec(sql,...params).toArray(), fn => storage.transactionSync(fn));
  }
  fetch(request) {
    const origin = request.headers.get('Origin');
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      if (origin && origin !== this.env.PAGES_ORIGIN) return new Response('Forbidden', { status: 403 });
      if (this.ctx.getWebSockets().length >= 120) return new Response('Market is busy', { status: 503 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      const now = Date.now();
      const inventory = this.ctx.storage.transactionSync(() => this.market.inventory(now));
      server.send(JSON.stringify(inventory));
      return new Response(null, { status: 101, webSocket: client });
    }
    return endpoint(this.market, request, this.env.PAGES_ORIGIN, request.headers.get('CF-Connecting-IP') || 'unknown',
      ({ stock, goods, revision, next }) => {
        const update = JSON.stringify({ stock, goods, revision, next });
        for (const socket of this.ctx.getWebSockets()) {
          try { socket.send(update); } catch { /* the client has disconnected */ }
        }
      });
  }
  webSocketMessage(socket) {
    socket.close(1008, 'Inventory feed is read only');
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
