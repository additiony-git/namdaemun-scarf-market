import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Market, endpoint } from '../server/market.mjs';
import { CHAT_MS, MARKET_DURATION, STOCK, START_MONEY, marketSession } from '../game/catalog.mjs';

const midnight=Date.parse('2026-11-08T00:00:00+09:00');
const start=marketSession(midnight).next;

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
  return {create, db, close:()=>db.close()};
}

test('the Seoul calendar opens exactly three staggered 45 minute markets per day', ()=>{
  const hours=[ [9,12], [13,17], [18,22] ];
  const days=[];
  for(let day=0;day<7;day++){
    const dayStart=midnight+day*86_400_000;
    let at=dayStart;
    const starts=[];
    for(const [from,to] of hours){
      const opening=marketSession(at).next;
      const hour=(opening-dayStart)/3_600_000;
      assert.ok(hour>=from&&hour<to);
      assert.equal(marketSession(opening-1).open,false);
      assert.equal(marketSession(opening).open,true);
      assert.equal(marketSession(opening).closes,opening+MARKET_DURATION);
      assert.equal(marketSession(opening+MARKET_DURATION-1).open,true);
      at=opening+MARKET_DURATION;
      assert.equal(marketSession(at).open,false);
      starts.push(opening-dayStart);
    }
    assert.ok(marketSession(at).next>=dayStart+86_400_000);
    days.push(starts);
  }
  assert.ok(new Set(days.map(JSON.stringify)).size>1);
});

test('two shoppers share one limited stock; only the first gets the last item, then the next round refills', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const now=start+600;
  const a=market.action({action:'join'},now).token;
  const b=market.action({action:'join'},now).token;
  const c=market.action({action:'join'},now).token;
  market.action({action:'buy',item:'hanky',token:c},now+400);
  const first=market.action({action:'buy',item:'hanky',token:c},now+800);
  assert.equal(first.stock.hanky,1);
  const at=now+1200;
  const contenders=await Promise.all([b,a].map(token=>Promise.resolve().then(()=>market.action({action:'buy',item:'hanky',token},at))));
  assert.equal(contenders[0].stock.hanky,0);
  assert.equal(contenders[0].revision,first.revision+1);
  assert.equal(contenders[0].player.cash,START_MONEY-450);
  assert.equal(contenders[1].status,409);
  const state=market.action({action:'sync',token:a},at);
  assert.equal(state.stock.hanky,0);
  assert.deepEqual(state.basket,[]);
  assert.equal(state.player.cash,START_MONEY);
  assert.equal(state.online,3);
  assert.equal(state.peers[0].id,contenders[0].player.id);
  const closing=start+MARKET_DURATION;
  assert.equal(market.action({action:'buy',item:'scarf',token:b},closing).status,409);
  const closed=market.action({action:'sync',token:b},closing);
  assert.ok(closed.revision>contenders[0].revision);
  assert.equal(closed.player.cash,START_MONEY-450);
  assert.equal(closed.stock.scarf,0);
  const next=closed.next;
  const refill=market.action({action:'sync',token:b},next);
  assert.deepEqual(refill.stock,STOCK);
  assert.equal(refill.player.cash,START_MONEY);
  market.action({action:'buy',item:'hanky',token:b},next+400);
  assert.equal(market.action({action:'sync',token:b},next+800).player.cash,START_MONEY-450);
});

test('preparation pauses junk sales while preserving earlier baskets and rank ties', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const a=market.action({action:'join'},start);
  const b=market.action({action:'join'},start);
  const rank=data.db.prepare('UPDATE players SET collected = 2, reached = ? WHERE id = ?');
  rank.run(2,a.player.id);rank.run(1,b.player.id);
  data.db.prepare('INSERT INTO basket VALUES (?, ?, ?, ?)').run(b.player.id,'sock',2,start);
  const blocked=market.action({action:'buy',item:'sock',token:b.token},start+400);
  assert.equal(blocked.status,409);
  assert.match(blocked.error,/오픈 준비 중/);
  const restarted=data.create().action({action:'sync',token:b.token},start+30_100);
  assert.deepEqual(restarted.basket.map(r=>[r.item,r.qty]),[['sock',2]]);
  assert.deepEqual(restarted.ranking.map(p=>p.id),[b.player.id,a.player.id]);
  assert.ok(!JSON.stringify(restarted).includes(a.token));
  assert.equal(restarted.online,1);
});

test('HTTP requires the configured origin and a valid token for trades', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create(), origin='https://example.github.io';
  const req=(body,source=origin)=>new Request('https://market.example/api/market',{method:'POST',headers:{Origin:source},body:JSON.stringify(body)});
  const blocked=await endpoint(market,req({action:'join'},'https://other.example'),origin);
  assert.equal(blocked.status,403);
  const auth=await endpoint(market,req({action:'buy',item:'scarf'}),origin);
  assert.equal(auth.status,401);
  const join=await endpoint(market,req({action:'join'}),origin);
  assert.equal(join.status,200);assert.equal(join.headers.get('Access-Control-Allow-Origin'),origin);
  const p=await join.json();
  const sold=await endpoint(market,req({action:'sell',item:'scarf',token:p.token}),origin);
  assert.equal(sold.status,400);
  const bought=market.action({action:'buy',item:'scarf',token:p.token,price:0},marketSession(Date.now()).next);
  assert.equal(bought.player.cash,START_MONEY-700);
  assert.equal(bought.stock.scarf,STOCK.scarf-1);
  assert.equal(bought.basket[0].item,'scarf');
  assert.equal(bought.player.collected,0);
});

test('chat is authenticated, transient, limited and visible to another guest', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join'},midnight);
  const neighbor=market.action({action:'join'},midnight);
  assert.equal(market.action({action:'chat',text:'hello'},midnight).status,401);
  assert.equal(market.action({action:'chat',token:guest.token,text:'a'.repeat(81)},midnight).status,400);
  const sent=market.action({action:'chat',token:guest.token,text:'  안녕\n <b>골목</b>  '},midnight+100);
  assert.equal(sent.speech.text,'안녕 <b>골목</b>');
  assert.equal(sent.speech.playerId,guest.player.id);
  assert.equal(sent.speech.expiresAt,midnight+100+CHAT_MS);
  assert.equal(market.action({action:'chat',token:guest.token,text:'안녕'},midnight+101).status,429);
  const sync=now=>market.action({action:'sync',token:neighbor.token},now);
  assert.deepEqual(sync(midnight+500).peers[0].speech,sent.speech);
  assert.equal(sync(sent.speech.expiresAt).peers[0].speech,undefined);
});
