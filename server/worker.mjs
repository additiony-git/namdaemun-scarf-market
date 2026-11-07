import { DurableObject } from 'cloudflare:workers';
import { Market, endpoint } from './market.mjs';

export class MarketRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const storage = ctx.storage;
    this.market = new Market((sql,...params) => storage.sql.exec(sql,...params).toArray(), fn => storage.transactionSync(fn));
  }
  fetch(request) {
    return endpoint(this.market, request, this.env.PAGES_ORIGIN, request.headers.get('CF-Connecting-IP') || 'unknown');
  }
}
export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/market') return new Response('Not found', { status:404 });
    return env.MARKET_ROOM.get(env.MARKET_ROOM.idFromName('namdaemun-main')).fetch(request);
  },
};
