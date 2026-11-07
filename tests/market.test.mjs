import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Market, endpoint } from '../server/market.mjs';
import { ROUND_MS, STOCK, START_MONEY } from '../game/catalog.mjs';

function setup() {
  const db=new DatabaseSync(':memory:');
  function create() {
    return new Market((sql,...params)=>{
      const stmt=db.prepare(sql);
      if(/^SELECT\b|\bRETURNING\b/i.test(sql))return stmt.all(...params);
      stmt.run(...params);return [];
    }, fn=>{
      db.exec('BEGIN IMMEDIATE');
      try {const value=fn();db.exec('COMMIT');return value;} catch(e){db.exec('ROLLBACK');throw e;}
    });
  }
  return {create, close:()=>db.close()};
}

test('two shoppers share one limited stock; only the first gets the last item, then the next round refills', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  // The economy accepts an explicit clock for round boundaries; HTTP uses the server's clock.
  const now=ROUND_MS*1000+600;
  const a=market.action({action:'join'},now).token;
  const b=market.action({action:'join'},now).token;
  for(let i=0;i<STOCK.hanky-1;i++){
    const result=market.action({action:'sell',item:'hanky',token:a},now+(i+1)*400);
    assert.equal(result.stock.hanky,STOCK.hanky-i-1);
  }
  const at=now+STOCK.hanky*400;
  const contenders=await Promise.all([b,a].map(token=>Promise.resolve().then(()=>market.action({action:'sell',item:'hanky',token},at))));
  assert.equal(contenders[0].stock.hanky,0);
  assert.equal(contenders[0].player.cash,START_MONEY+800);
  assert.equal(contenders[1].status,409);
  const state=market.action({action:'sync',token:a},at);
  assert.equal(state.player.sold,STOCK.hanky-1);
  assert.equal(state.player.cash,START_MONEY+(STOCK.hanky-1)*800);
  assert.equal(state.online,2);
  assert.equal(state.peers[0].id,contenders[0].player.id);
  assert.deepEqual(market.action({action:'sync',token:a},(1000+1)*ROUND_MS).stock,STOCK);
});

test('rank ties follow first achievement of the current quantity; purchases persist and stay private', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const start=ROUND_MS*1000;
  const a=market.action({action:'join'},start);
  const b=market.action({action:'join'},start);
  const buy=(player,item,elapsed)=>market.action({action:'buy',token:player.token,item},start+elapsed);
  assert.equal(buy(a,'stone',100).player.rank,1);
  assert.equal(buy(b,'sock',100).player.rank,2);
  assert.equal(buy(b,'clock',550).player.rank,1);
  const result=buy(a,'stone',700);
  assert.deepEqual(result.ranking.map(p=>p.id),[b.player.id,a.player.id]);
  assert.equal(result.player.rank,2);
  assert.equal(result.basket[0].qty,2);
  assert.equal(result.player.cash,1300);
  assert.equal(buy(a,'trophy',1100).status,409);
  assert.equal(buy(a,'unknown',1100).status,400);
  const restarted=data.create().action({action:'sync',token:b.token},start+30_100);
  assert.deepEqual(restarted.basket.map(r=>r.item),['clock','sock']);
  assert.equal(restarted.ranking[0].id,b.player.id);
  assert.ok(!JSON.stringify(restarted).includes(a.token));
  assert.equal(restarted.online,1);
});

test('HTTP requires the configured origin and a valid token for trades', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create(), origin='https://example.github.io';
  const req=(body,source=origin)=>new Request('https://market.example/api/market',{method:'POST',headers:{Origin:source},body:JSON.stringify(body)});
  const blocked=await endpoint(market,req({action:'join'},'https://other.example'),origin);
  assert.equal(blocked.status,403);
  const auth=await endpoint(market,req({action:'sell',item:'scarf'}),origin);
  assert.equal(auth.status,401);
  const join=await endpoint(market,req({action:'join'}),origin);
  assert.equal(join.status,200);assert.equal(join.headers.get('Access-Control-Allow-Origin'),origin);
  const p=await join.json();
  const sold=await endpoint(market,req({action:'sell',item:'scarf',token:p.token,price:900000}),origin);
  assert.equal((await sold.json()).player.cash,START_MONEY+1300);
});
