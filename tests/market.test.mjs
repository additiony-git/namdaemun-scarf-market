import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Market, endpoint } from '../server/market.mjs';
import { CHAT_FEED_MS, CHAT_MS, DEFAULT_LOOK, LOBBY_CHAT_MS, MARKET_CAPACITY, MARKET_DURATION, MARKET_EXIT_MS, RARE_PICKUP_MS, RARE_SCARVES, ROUND_CURRENCY, marketRare, marketSession, roundCloth, roundStock, seoulDay } from '../game/catalog.mjs';

const midnight=Date.parse('2026-11-08T00:00:00+09:00');
const openingHours=[12,20,22];
const [start,evening,night]=openingHours.map(hour=>midnight+hour*3_600_000);
const firstStock=roundStock(1);

function setup() {
  const db=new DatabaseSync(':memory:');
  function create(testWindow, googleClientId, requireGoogleLogin) {
    return new Market((sql,...params)=>{
      const stmt=db.prepare(sql);
      if(/^SELECT\b|\bRETURNING\b/i.test(sql))return stmt.all(...params);
      stmt.run(...params);return [];
    }, fn=>{
      db.exec('BEGIN IMMEDIATE');
      try {const value=fn();db.exec('COMMIT');return value;} catch(e){db.exec('ROLLBACK');throw e;}
    },testWindow,googleClientId,requireGoogleLogin);
  }
  return {create, db, close:()=>db.close()};
}

test('the Seoul calendar opens on every hour and closes ten minutes before the featured markets', ()=>{
  for(let hour=0;hour<24;hour++){
    const opening=midnight+hour*3_600_000;
    const before=marketSession(opening-1);
    const current=marketSession(opening);
    assert.equal(before.next,opening);
    assert.equal(before.open,false);
    assert.equal(before.nextSlot,current.slot);
    assert.notEqual(before.slot,current.slot);
    assert.equal(current.open,true);
    assert.equal(current.next,opening+3_600_000);
    const duration=openingHours.includes(hour+1)?50*60_000:MARKET_DURATION;
    assert.equal(current.closes,opening+duration);
    assert.equal(marketSession(current.closes-1).open,true);
    assert.equal(marketSession(current.closes).open,false);
  }
  assert.deepEqual([start,evening,night].map(at=>marketSession(at).slot),[1,2,3]);
});

test('each round has distinct goods and rejects purchases from the other rounds', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join'},start);
  const allIds=new Set();
  for(let slot=1;slot<=3;slot++){
    const at=[start,evening,night][slot-1];
    const items=roundCloth(slot);
    assert.equal(items.filter(i=>i.group==='scarf').length,6);
    assert.equal(items.filter(i=>i.group==='hanky').length,4);
    for(const item of items){assert.ok(!allIds.has(item.id));allIds.add(item.id);}
    const state=market.inventory(at);
    const rare={[marketRare(state).id]:1};
    assert.deepEqual(state.stock,{...roundStock(slot),...rare});
    market.action({action:'sync',token:guest.token},at);
    const otherItem=roundCloth(slot%3+1)[0];
    const refused=market.action({action:'buy',item:otherItem.id,token:guest.token},at+100);
    assert.equal(refused.status,409);
    assert.match(refused.error,/이번 장에서 판매하지/);
    const bought=market.action({action:'buy',item:items[0].id,token:guest.token},at+400);
    assert.equal(bought.stock[items[0].id],items[0].count-1);
    assert.equal(bought.basket.length,slot);
  }
});

test('entrants receive 5,000 regional currency per round and keep only that round’s balance on reentry', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join',room:'lobby'},start-1);
  assert.equal(guest.player.cash,0);
  const sync=(room,at,instance=market)=>instance.action({action:'sync',room,token:guest.token},at);
  assert.equal(sync('market',start-1).currencyGrant,null);
  assert.equal(sync('lobby',start).currencyGrant,null);
  assert.equal(sync('market',start).currencyGrant,5000);
  market.action({action:'buy',item:'scarf',token:guest.token},start+500);
  sync('lobby',start+1000);
  const reentry=sync('market',start+1200,data.create());
  assert.equal(reentry.currencyGrant,null);
  assert.equal(reentry.player.cash,4300);
  const second=sync('market',evening);
  assert.equal(second.currencyGrant,5000);
  assert.equal(second.player.cash,5000);
});

test('returning from a test round keeps the regular round grant and respects older allowances', t=>{
  const data=setup();t.after(data.close);
  const from=start+5*60_000, until=from+2*60_000;
  const market=data.create({from,until});
  const legacy=market.action({action:'join',room:'lobby'},start-100);
  data.db.prepare('INSERT INTO allowances VALUES (?, ?)').run(legacy.player.id,marketSession(start).round);
  data.db.prepare('UPDATE players SET cash = 1200 WHERE id = ?').run(legacy.player.id);
  const sync=at=>market.action({action:'sync',token:legacy.token},at);
  assert.equal(sync(start).player.cash,1200);
  assert.equal(sync(from).currencyGrant,5000);
  const returned=sync(until);
  assert.equal(returned.currencyGrant,null);
  assert.equal(returned.player.cash,1200);
});

test('pawn transactions preserve balances, acquisition prices and public rankings across rounds and restarts', async t=>{
  const data=setup();t.after(data.close);
  let market=data.create();
  const enter=()=>market.action({action:'join'},start);
  const seller=enter(), buyer=enter(), secondBuyer=enter();
  const rare=marketRare(marketSession(start));
  const action=(guest,action,extra={},at=start+5000,room='lobby')=>
    market.action({action,token:guest.token,room,...extra},at);
  const view=guest=>action(guest,'sync',{includePawn:true,includeRareRanking:true,includeCashRanking:true});
  assert.equal(action(seller,'buy',{item:rare.id},start+500,'market').basket[0].item,rare.id);
  assert.equal(action(seller,'pawn-sell',{item:rare.id}).status,400);
  assert.equal(action(seller,'pawn-list',{item:rare.id,price:rare.price-1}).status,400);

  for(const [shopper,item] of [[buyer,'amber-paisley'],[secondBuyer,'jade-wave']]){
    for(let i=0;i<4;i++)assert.ok(action(shopper,'buy',{item},start+500+i*400,'market').event);
    for(let i=0;i<4;i++)assert.ok(action(shopper,'pawn-sell',{item}).event);
    const state=view(shopper);
    assert.equal(state.basket.length,0);
    assert.equal(state.player.collected,4);
    assert.equal(state.player.pawnCash,item==='amber-paisley'?1800:1600);
    assert.equal(action(shopper,'pawn-sell',{item}).status,409);
  }

  const ask=1500;
  const listed=action(seller,'pawn-list',{item:rare.id,price:ask});
  const listing=listed.pawn.mine[0].id;
  assert.equal(listed.basket.length,0);
  assert.equal(view(seller).rareRanking.count,1);
  assert.equal(action(seller,'pawn-buy',{listing}).status,409);
  assert.equal(action(buyer,'pawn-cancel',{listing}).status,403);
  assert.equal(view(buyer).pawn.listings[0].price,ask);
  const results=await Promise.all([buyer,secondBuyer].map(shopper=>
    Promise.resolve().then(()=>action(shopper,'pawn-buy',{listing}))));
  assert.equal(results[0].player.pawnCash,300);
  assert.equal(results[0].player.collected,4);
  assert.equal(results[0].basket[0].item,rare.id);
  assert.equal(results[1].status,409);
  assert.equal(view(secondBuyer).player.pawnCash,1600);
  assert.equal(view(seller).rareRanking.count,0);
  assert.equal(view(buyer).rareRanking.count,1);
  assert.equal(view(seller).player.pawnCash,ask);
  assert.equal(action(buyer,'pawn-list',{item:rare.id,price:ask-1}).status,400);
  const resale=action(buyer,'pawn-list',{item:rare.id,price:1800}).pawn.mine[0].id;
  const cancelled=action(buyer,'pawn-cancel',{listing:resale});
  assert.equal(cancelled.pawn.floors[rare.id],ask);
  assert.equal(cancelled.basket[0].qty,1);
  assert.equal(action(secondBuyer,'pawn-buy',{listing:resale}).status,409);

  market=data.create();
  const newRound=action(buyer,'sync',{includeCashRanking:true},evening,'market');
  assert.equal(newRound.player.cash,ROUND_CURRENCY);
  assert.equal(newRound.player.pawnCash,300);
  const response=await endpoint(market,new Request('https://market.example/api/market?ranking=cash'));
  const published=(await response.json()).publicRanking;
  assert.equal(published.kind,'cash');
  assert.deepEqual(published.rows.map(row=>row.balance),[1600,1500,300]);
  assert.equal(newRound.cashRanking.rank,3);
});

test('the last seat admits one contender and the other can watch inventory without buying', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guests=Array.from({length:MARKET_CAPACITY+1},(_,i)=>market.action({action:'join',room:'lobby'},start,'guest-'+i));
  const sync=(guest,room,now=start)=>market.action({action:'sync',room,token:guest.token},now);
  for(const guest of guests.slice(0,-2))assert.equal(sync(guest,'market').room,'market');
  const [winner,waiting]=guests.slice(-2);
  const admitted=await Promise.all([winner,waiting].map(guest=>Promise.resolve().then(()=>sync(guest,'market'))));
  assert.equal(admitted[0].currencyGrant,ROUND_CURRENCY);
  assert.equal(admitted[1].admission,'full');
  assert.equal(admitted[1].queuePosition,1);
  assert.equal(admitted[1].room,'lobby');
  assert.equal(admitted[1].currencyGrant,null);
  assert.equal(admitted[1].marketOnline,MARKET_CAPACITY);
  assert.equal(market.action({action:'buy',token:waiting.token,item:'scarf'},start).status,409);
  market.action({action:'buy',token:winner.token,item:'scarf'},start+400);
  const watched=market.marketStatus(start+500);
  assert.equal(watched.stock.scarf,firstStock.scarf-1);
  assert.equal(watched.player,undefined);
  const viewpoint=market.action({action:'sync',room:'lobby',watch:true,token:waiting.token},start+500);
  assert.equal(viewpoint.crowd.length,MARKET_CAPACITY);
  assert.equal(viewpoint.queuePosition,1);
  assert.deepEqual(Object.keys(viewpoint.crowd[0]).sort(),['id','look','speech','x','z']);
  assert.equal(typeof viewpoint.crowd[0].id,'number');
  assert.equal(sync(winner,'lobby',start+600).marketOnline,MARKET_CAPACITY-1);
  assert.equal(sync(waiting,'market',start+700).currencyGrant,ROUND_CURRENCY);
  const expired=market.marketStatus(start+31_000);
  assert.equal(expired.marketOnline,0);
  const closed=sync(waiting,'market',start+MARKET_DURATION+MARKET_EXIT_MS);
  assert.equal(closed.room,'market');
  assert.equal(closed.currencyGrant,null);
  assert.equal(closed.marketOnline,1);
});

test('closing freezes admission and the next round discards old seats and wait numbers', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const close=start+MARKET_DURATION;
  const graceEnds=close+MARKET_EXIT_MS;
  const join=(i,now)=>market.action({action:'join'},now,'last-round-'+i);
  const seats=Array.from({length:MARKET_CAPACITY},(_,i)=>join(i,close-5_000));
  const seated=seats[0];
  const waiting=join('waiting',close-2);
  const guest=market.action({action:'join',room:'lobby'},close-1);
  const sync=(person,now,instance=market,entryRound=person.lastClose)=>
    instance.action({action:'sync',token:person.token,entryRound,watch:true},now);
  assert.equal(waiting.queuePosition,1);
  assert.equal(market.marketStatus(close).lastClose,close);
  assert.equal(market.marketStatus(close).marketOnline,MARKET_CAPACITY);
  assert.equal(sync(seated,close).room,'market');
  assert.equal(sync(waiting,close).admission,'closing');
  assert.equal(join('new',graceEnds-1).admission,'closing');
  assert.equal(market.action({action:'buy',token:seated.token,item:'scarf',entryRound:seated.lastClose},close).status,409);
  assert.equal(market.marketStatus(graceEnds).marketOnline,0);

  // Expired wait numbers remain expired after a restart, even inside the queue lease.
  const restarted=data.create();
  const first=sync(guest,graceEnds,restarted,close);
  assert.equal(first.room,'market');
  assert.equal(first.marketOnline,1);
  assert.equal(sync(seated,graceEnds+1,restarted).admission,'closed');
  const expired=sync(waiting,graceEnds+1,restarted);
  assert.equal(expired.admission,'closed');
  assert.equal(expired.queuePosition,null);
  assert.equal(sync(waiting,graceEnds+2,restarted,close).room,'market');
});

test('queues survive restarts, prevent passing the first guest, and drop canceled or expired requests', t=>{
  const data=setup();t.after(data.close);
  let market=data.create();
  const join=(i,room,at=start)=>market.action({action:'join',room},at,'queue-'+i);
  const sync=(guest,at,extra={})=>market.action({action:'sync',room:'market',token:guest.token,...extra},at);
  const early=join('early','lobby',start-1);
  for(let i=0;i<MARKET_CAPACITY;i++)assert.equal(join(i,'market').room,'market');
  const first=join('first','market',start+1);
  const second=join('second','market',start+1);
  assert.equal(first.queuePosition,1);
  assert.equal(second.queuePosition,2);
  market=data.create();
  const later=join('later','market',start+2);
  assert.equal(later.queuePosition,3);
  assert.equal(sync(second,start+3).queuePosition,2);
  assert.equal(sync(first,start+4).currencyGrant,ROUND_CURRENCY);
  const canceled=sync(second,start+5,{room:'lobby',cancelQueue:true});
  assert.equal(canceled.queuePosition,null);
  assert.equal(canceled.queueAdvanced,true);
  assert.equal(sync(later,start+6).room,'market');
  assert.equal(sync(early,evening).room,'market');

  for(let i=1;i<MARKET_CAPACITY;i++)join('evening-'+i,'market',evening);
  const disconnected=join('disconnected','market',evening+1);
  const staying=join('staying','market',evening+1);
  assert.equal(disconnected.queuePosition,1);
  assert.equal(staying.queuePosition,2);
  assert.equal(sync(staying,evening+240_000).queuePosition,2);
  assert.equal(sync(staying,evening+271_000).room,'market');
});

test('the closed market supports entry, chat and spectating, and seats and the queue carry through opening', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const join=(id,at,extra={})=>market.action({action:'join',...extra},at,'preopen-'+id);
  const action=(guest,action,at,extra={})=>market.action({action,token:guest.token,...extra},at);
  const earlyAt=start-9*60_000;
  const early=join('early',earlyAt);
  assert.equal(early.room,'market');
  assert.equal(early.open,false);
  assert.equal(early.player.cash,0);
  assert.equal(early.currencyGrant,null);
  const earlyPurchase=action(early,'buy',earlyAt+1000,{item:'scarf'});
  assert.equal(earlyPurchase.status,409);
  assert.match(earlyPurchase.error,/개장하면/);

  const before=start-30_000;
  action(early,'sync',before,{pos:{x:-1,z:2}});
  const seats=Array.from({length:MARKET_CAPACITY-1},(_,i)=>join(i,before));
  const queued=join('queued',before+1,{watch:true});
  assert.equal(queued.room,'lobby');
  assert.equal(queued.queuePosition,1);
  assert.equal(queued.currencyGrant,null);
  assert.equal(queued.crowd.length,MARKET_CAPACITY);
  const avatar=queued.crowd.find(person=>person.x===-1&&person.z===2);
  const message=action(early,'chat',before+2,{text:'개장 기다리는 중이에요.'});
  assert.equal(message.speech.text,'개장 기다리는 중이에요.');
  const listening=action(seats[0],'sync',before+3);
  assert.equal(listening.peers.find(peer=>peer.id===early.player.id).speech.text,message.speech.text);
  const outfit={character:'female',hat:'ribbon',coat:'roseCardigan',bag:'wovenBasket',scarf:'none'};
  const dressed=action(early,'profile',before+3,{name:'기다리는 손님',look:outfit});
  assert.deepEqual(dressed.player.look,outfit);
  const live=action(queued,'sync',before+4,{room:'lobby',watch:true}).crowd.find(person=>person.id===avatar.id);
  assert.deepEqual(live.look,outfit);
  assert.deepEqual(live.speech,{playerId:avatar.id,text:message.speech.text,sentAt:before+2,expiresAt:before+2+CHAT_MS});
  assert.equal(live.name,undefined);
  assert.equal(action(queued,'chat',before+4,{text:'시장 채팅'}).status,409);
  const afterSpeech=action(queued,'sync',before+2+CHAT_MS,{room:'lobby',watch:true});
  assert.equal(afterSpeech.crowd.find(person=>person.id===avatar.id).speech,undefined);

  const opened=action(early,'sync',start);
  assert.equal(opened.room,'market');
  assert.equal(opened.marketOnline,MARKET_CAPACITY);
  assert.equal(opened.currencyGrant,ROUND_CURRENCY);
  assert.equal(opened.stock.scarf,firstStock.scarf);
  assert.equal(action(early,'sync',start+1).currencyGrant,null);
  const stillWaiting=action(queued,'sync',start+2,{watch:true});
  assert.equal(stillWaiting.queuePosition,1);
  assert.equal(stillWaiting.currencyGrant,null);
  assert.ok(stillWaiting.crowd.some(person=>person.id===avatar.id));
  action(seats[0],'sync',start+3,{room:'lobby'});
  const admitted=action(queued,'sync',start+4);
  assert.equal(admitted.room,'market');
  assert.equal(admitted.currencyGrant,ROUND_CURRENCY);
  assert.equal(admitted.queuePosition,null);
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
  assert.equal(contenders[0].player.cash,ROUND_CURRENCY-450);
  assert.equal(contenders[1].status,409);
  const state=market.action({action:'sync',token:a},at);
  assert.equal(state.stock.hanky,0);
  assert.deepEqual(state.basket,[]);
  assert.equal(state.player.cash,ROUND_CURRENCY);
  assert.equal(state.online,3);
  assert.equal(state.peers[0].id,contenders[0].player.id);
  const closing=start+MARKET_DURATION;
  assert.equal(market.action({action:'buy',item:'scarf',token:b},closing).status,409);
  const closed=market.action({action:'sync',token:b},closing);
  assert.ok(closed.revision>contenders[0].revision);
  assert.equal(closed.player.cash,0);
  assert.equal(closed.stock.scarf,0);
  const next=closed.next;
  const refill=market.action({action:'sync',token:b},next);
  const rare=marketRare(marketSession(next));
  assert.equal(next,start+3_600_000);
  assert.deepEqual(refill.stock,{...roundStock(2),...(rare?{[rare.id]:1}:{})});
  assert.equal(refill.player.cash,ROUND_CURRENCY);
  market.action({action:'buy',item:'ink-edge',token:b},next+400);
  assert.equal(market.action({action:'sync',token:b},next+800).player.cash,ROUND_CURRENCY-430);
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

test('the ranking restores older purchases and counts new purchases once', t=>{
  const data=setup();t.after(data.close);
  let market=data.create();
  const first=market.action({action:'join'},start);
  const second=market.action({action:'join'},start);
  const addBasket=data.db.prepare('INSERT INTO basket VALUES (?, ?, ?, ?)');
  addBasket.run(first.player.id,'sock',1,start-2000);
  addBasket.run(first.player.id,'hanky',2,start-1000);
  data.db.prepare('UPDATE players SET collected = 3, reached = ? WHERE id = ?').run(start-1500,second.player.id);
  data.db.exec('DROP TABLE market_migrations');

  market=data.create();
  const sync=(guest,now)=>market.action({action:'sync',token:guest.token},now);
  const restored=sync(first,start);
  assert.equal(restored.player.collected,3);
  assert.equal(restored.player.rank,2);
  assert.deepEqual(restored.ranking.map(row=>row.id),[second.player.id,first.player.id]);
  sync(second,start);

  for(const guest of [first,second]){
    const bought=market.action({action:'buy',token:guest.token,item:'scarf'},start+500);
    assert.equal(bought.player.collected,4);
  }
  market=data.create();
  for(const guest of [first,second]){
    const state=sync(guest,start+600);
    assert.equal(state.player.collected,4);
    assert.equal(state.player.rank,state.ranking.findIndex(row=>row.id===guest.player.id)+1);
  }
});

test('the rare ranking counts existing and newly acquired rare copies separately', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const first=market.action({action:'join'},start);
  const second=market.action({action:'join'},start);
  const regular=market.action({action:'join'},start);
  const rare=marketRare(marketSession(start));
  const addBasket=data.db.prepare('INSERT INTO basket VALUES (?, ?, ?, ?)');
  addBasket.run(first.player.id,rare.id,2,start-1000);
  addBasket.run(second.player.id,rare.id,1,start-500);
  addBasket.run(regular.player.id,'scarf',10,start-200);
  const action=(guest,action,now,extra={})=>market.action({action,token:guest.token,includeRareRanking:true,...extra},now);

  const before=action(regular,'sync',start).rareRanking;
  assert.deepEqual(before.rows.map(row=>[row.id,row.collected]),[[first.player.id,2],[second.player.id,1]]);
  assert.equal(before.count,0);
  assert.equal(before.rank,null);
  const after=action(second,'buy',start+500,{item:rare.id}).rareRanking;
  assert.equal(after.count,2);
  assert.equal(after.rank,2);
  assert.deepEqual(after.rows[1].items,[{item:rare.id,qty:2}]);
  assert.equal(market.action({action:'sync',token:second.token},start+600).rareRanking,undefined);
});

test('HTTP requires the configured origin and a valid token for trades', async t=>{
  const data=setup();t.after(data.close);
  const market=data.create(), origin='https://example.github.io';
  const get=source=>new Request('https://market.example/api/market',{headers:{Origin:source}});
  assert.equal((await endpoint(market,get('https://other.example'),origin)).status,403);
  const calendar=await endpoint(market,get(origin),origin);
  const customOrigin='https://market.setting41.com';
  const allowedOrigins=[origin,customOrigin];
  for(const allowed of allowedOrigins){
    const reply=await endpoint(market,get(allowed),allowedOrigins);
    assert.equal(reply.status,200);
    assert.equal(reply.headers.get('Access-Control-Allow-Origin'),allowed);
  }
  assert.equal((await endpoint(market,get(customOrigin+'.other.example'),allowedOrigins)).status,403);
  assert.equal(calendar.status,200);
  assert.equal(calendar.headers.get('Access-Control-Allow-Origin'),origin);
  const schedule=await calendar.json();
  assert.equal(schedule.next,marketSession(schedule.now).next);
  assert.equal(schedule.player,undefined);
  assert.equal(schedule.token,undefined);
  const req=(body,source=origin)=>new Request('https://market.example/api/market',{method:'POST',headers:{Origin:source},body:JSON.stringify(body)});
  const blocked=await endpoint(market,req({action:'join'},'https://other.example'),origin);
  assert.equal(blocked.status,403);
  const auth=await endpoint(market,req({action:'buy',item:'scarf'}),origin);
  assert.equal(auth.status,401);
  const join=await endpoint(market,req({action:'join',room:'lobby'}),origin);
  assert.equal(join.status,200);assert.equal(join.headers.get('Access-Control-Allow-Origin'),origin);
  const p=await join.json();
  const sold=await endpoint(market,req({action:'sell',item:'scarf',token:p.token}),origin);
  assert.equal(sold.status,400);
  market.action({action:'sync',token:p.token},start);
  const bought=market.action({action:'buy',item:'scarf',token:p.token,price:0},start);
  assert.equal(bought.player.cash,ROUND_CURRENCY-700);
  assert.equal(bought.stock.scarf,firstStock.scarf-1);
  assert.equal(bought.basket[0].item,'scarf');
  assert.equal(bought.player.collected,1);
  assert.equal(bought.player.rank,1);
});

test('Google sign-in connects existing guest records and restores the same player on another device', async t=>{
  const data=setup();t.after(data.close);
  const legacy=data.create();
  const guest=legacy.action({action:'join'},start);
  legacy.action({action:'buy',token:guest.token,item:'scarf'},start+500);
  legacy.action({action:'buy',token:guest.token,item:'hanky'},start+900);
  legacy.action({action:'pawn-sell',token:guest.token,item:'hanky',room:'lobby'},start+1000);
  const clientId='test.apps.googleusercontent.com';
  const market=data.create(undefined,clientId);
  const origin='https://market.setting41.com';
  const url='https://market.example/api/market';
  const post=body=>endpoint(market,new Request(url,{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)}),origin);
  const algorithm={name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'};
  const {publicKey,privateKey}=await crypto.subtle.generateKey(algorithm,true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',publicKey),kid:'test-key',alg:'RS256'};
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({keys:[jwk]});
  });
  const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const googleCredential=async (nonce,aud=clientId)=>{
    const now=Math.floor(Date.now()/1000);
    const input=encoded({alg:'RS256',kid:jwk.kid})+'.'+encoded({iss:'https://accounts.google.com',aud,sub:'google-player',nonce,iat:now,exp:now+120});
    const signature=await crypto.subtle.sign(algorithm,privateKey,Buffer.from(input));
    return input+'.'+Buffer.from(signature).toString('base64url');
  };

  const publicView=await (await endpoint(market,new Request(url+'?watch=1'),origin)).json();
  assert.equal(publicView.googleClientId,clientId);
  assert.ok(Array.isArray(publicView.crowd));
  assert.equal(publicView.player,undefined);
  assert.equal((await post({action:'join'})).status,401);
  assert.equal((await post({action:'sync',token:guest.token})).status,401);

  const {nonce}=await (await post({action:'google-challenge',guestToken:guest.token})).json();
  assert.equal((await post({action:'google-login',credential:await googleCredential(nonce,'other-client')})).status,401);
  const credential=await googleCredential(nonce);
  const first=await (await post({action:'google-login',credential})).json();
  assert.equal(first.linkedGuest,true);
  assert.equal((await post({action:'google-login',credential})).status,401);
  const another=await (await post({action:'google-challenge'})).json();
  const second=await (await post({action:'google-login',credential:await googleCredential(another.nonce)})).json();
  assert.notEqual(first.token,second.token);
  const profile=await (await post({action:'sync',token:second.token,room:'lobby'})).json();
  assert.equal(profile.player.id,guest.player.id);
  assert.equal(profile.player.pawnCash,225);
  assert.equal(profile.player.rank,1);
  assert.equal(profile.basket[0].item,'scarf');
  assert.equal((await post({action:'logout',token:first.token})).status,200);
  assert.equal((await post({action:'sync',token:first.token,room:'lobby'})).status,401);
  assert.equal((await post({action:'sync',token:second.token,room:'lobby'})).status,200);
});

test('required Google login blocks guest admission before OAuth is configured', t=>{
  const data=setup();t.after(data.close);
  const guest=data.create().action({action:'join'},start);
  const market=data.create(undefined,'',true);
  assert.equal(market.action({action:'join'},start).status,401);
  assert.equal(market.action({action:'sync',token:guest.token},start).status,401);
  const view=market.marketStatus(start,true);
  assert.equal(view.loginRequired,true);
  assert.equal(view.googleClientId,undefined);
  assert.deepEqual(view.crowd,[]);
  assert.equal(view.stock.scarf,firstStock.scarf);
});

test('guests can read rankings and use lobby chat without creating a player or market seat', async t=>{
  const data=setup();t.after(data.close);
  const legacy=data.create();
  const player=legacy.action({action:'join'},start);
  const rare=marketRare(marketSession(start));
  legacy.action({action:'buy',token:player.token,item:rare.id},start+500);
  const market=data.create(undefined,'',true);
  const origin='https://market.setting41.com';
  const url='https://market.example/api/market';
  const events=[];
  const request=(suffix,body,source=origin)=>endpoint(market,new Request(url+suffix,body?
    {method:'POST',headers:{Origin:source},body:JSON.stringify(body)}:undefined),origin,'guest-ip',(action,state)=>events.push([action,state.room]));

  const message={action:'guest-lobby-chat',text:'구경 왔어요.',name:'임의 닉네임',room:'market'};
  assert.equal((await request('',message,'https://other.example')).status,403);
  const posted=await (await request('',message)).json();
  assert.equal(posted.speech.name,'구경 손님');
  assert.deepEqual(events,[['chat','lobby']]);
  assert.equal((await request('',message)).status,429);
  const all=await (await request('?lobby=1&ranking=all&watch=1')).json();
  assert.deepEqual(all.lobbyMessages,[posted.speech]);
  assert.deepEqual(all.publicRanking.rows.map(row=>row.collected),[1]);
  assert.deepEqual(all.crowd,[]);
  assert.equal(all.player,undefined);
  const rares=await (await request('?ranking=rare')).json();
  assert.deepEqual(rares.publicRanking.rows[0].items,[{item:rare.id,qty:1}]);
  assert.equal(data.db.prepare('SELECT COUNT(*) AS count FROM players').get().count,1);
});

test('chat is authenticated, transient, limited and visible to another guest', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join'},start);
  const neighbor=market.action({action:'join'},start);
  assert.equal(market.action({action:'chat',text:'hello'},start).status,401);
  assert.equal(market.action({action:'chat',token:guest.token,text:'a'.repeat(81)},start).status,400);
  const sent=market.action({action:'chat',token:guest.token,text:'  안녕\n <b>골목</b>  '},start+100);
  assert.equal(sent.speech.text,'안녕 <b>골목</b>');
  assert.equal(sent.speech.playerId,guest.player.id);
  assert.equal(sent.speech.name,guest.player.name);
  assert.equal(sent.speech.expiresAt,start+100+CHAT_MS);
  assert.equal(market.action({action:'chat',token:guest.token,text:'안녕'},start+101).status,429);
  const sync=now=>market.action({action:'sync',token:neighbor.token},now);
  assert.deepEqual(sync(start+500).peers[0].speech,sent.speech);
  assert.deepEqual(sync(sent.speech.expiresAt).peers[0].speech,sent.speech);
  assert.deepEqual(market.action({action:'sync',token:guest.token},start+8000).speech,sent.speech);
  assert.equal(sync(sent.speech.sentAt+CHAT_FEED_MS).peers[0].speech,undefined);
});

test('the lobby shares recent chat without leaking to the market or creating a market avatar', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join',room:'lobby'},start);
  const waiting=market.action({action:'join',room:'lobby'},start);
  const shopping=market.action({action:'join'},start);
  assert.equal(shopping.online,1);
  assert.deepEqual(shopping.peers,[]);
  const say=(token,room,text,at)=>market.action({action:'chat',token,room,text},at);
  say(shopping.token,'market','골목 인사',start+10);
  const first=say(guest.token,'lobby','대기실 인사',start+20);
  assert.equal(first.online,2);
  assert.deepEqual(first.lobbyMessages.map(message=>message.text),['대기실 인사']);
  assert.deepEqual(first.peers,[]);
  assert.equal(market.action({action:'buy',token:guest.token,room:'lobby',item:'scarf'},start+50).status,409);
  const entered=market.action({action:'sync',token:guest.token},start+100);
  assert.equal(entered.online,2);
  assert.equal(entered.lobbyMessages,undefined);
  assert.equal(entered.speech,undefined);
  assert.equal(say(guest.token,'market','빠른 전환',start+150).status,429);
  const remaining=market.action({action:'sync',token:waiting.token,room:'lobby'},start+200);
  assert.equal(remaining.online,1);
  assert.deepEqual(remaining.lobbyMessages.map(message=>message.text),['대기실 인사']);
  const returned=market.action({action:'sync',token:guest.token,room:'lobby'},start+LOBBY_CHAT_MS+20);
  assert.equal(returned.player.id,guest.player.id);
  assert.deepEqual(returned.lobbyMessages,[]);
});

test('profile saves purchased clothing and shares the look without sharing the basket', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join'},start);
  const neighbor=market.action({action:'join'},start);
  assert.deepEqual(guest.player.look,DEFAULT_LOOK);
  const look={character:'female',hat:'knit',coat:'mustard',bag:'tote',scarf:'indigo-stripe'};
  const save={action:'profile',token:guest.token,name:'시장 단골',look};
  assert.equal(market.action(save,start+100).status,409);
  assert.equal(market.action({...save,look:{...look,hat:'constructor'}},start+200).status,400);
  assert.equal(market.action({action:'sync',token:guest.token},start+250).player.name,guest.player.name);
  market.action({action:'buy',token:guest.token,item:look.scarf},start+400);
  const saved=market.action(save,start+500);
  assert.deepEqual(saved.player.look,look);
  assert.equal(saved.player.cash,ROUND_CURRENCY-750);
  assert.equal(saved.basket[0].item,look.scarf);
  const other=market.action({action:'sync',token:neighbor.token},start+700);
  assert.deepEqual(other.peers[0].look,look);
  assert.deepEqual(other.basket,[]);
  const restored=data.create().action({action:'sync',token:guest.token},start+800);
  assert.deepEqual(restored.player.look,look);
  assert.equal(restored.player.name,'시장 단골');
  const {character,...legacyLook}=look;
  const olderClient=market.action({...save,look:legacyLook},start+900);
  assert.equal(olderClient.player.look.character,character);
});

test('male and female visitors keep their own wardrobes and only share the active look', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const guest=market.action({action:'join'},start);
  const neighbor=market.action({action:'join'},start);
  assert.equal(guest.player.look.character,'classic');
  const female={character:'female',hat:'ribbon',coat:'plumCoat',bag:'plumPouch',scarf:'none'};
  const male={...guest.player.look,coat:'marketVest'};
  const save=look=>({action:'profile',token:guest.token,name:'시장 손님',look});
  assert.equal(market.action(save({...male,hat:female.hat}),start+100).status,400);
  assert.equal(market.action(save({...female,bag:male.bag}),start+200).status,400);
  const changed=market.action(save(female),start+300);
  assert.deepEqual(changed.player.outfits,{classic:guest.player.look,female});
  const changedBack=market.action(save(male),start+400);
  assert.deepEqual(changedBack.player.outfits,{classic:male,female});
  const peer=market.action({action:'sync',token:neighbor.token},start+500).peers.find(p=>p.id===guest.player.id);
  assert.deepEqual(peer.look,male);
  assert.equal(peer.outfits,undefined);
  const restored=data.create().action({action:'sync',token:guest.token},start+600);
  assert.deepEqual(restored.player.look,male);
  assert.deepEqual(restored.player.outfits,{classic:male,female});
});

test('the test window accepts purchases and returns to the regular schedule at expiry', t=>{
  const data=setup();t.after(data.close);
  const from=start-8*60_000,until=from+2*60_000;
  const market=data.create({from,until});
  const guest=market.action({action:'join'},from-1);
  assert.equal(guest.open,false);
  const opened=market.action({action:'sync',token:guest.token},from);
  assert.equal(opened.open,true);
  assert.equal(opened.closes,until);
  assert.ok(opened.revision>guest.revision);
  const bought=market.action({action:'buy',token:guest.token,item:'scarf'},from+1);
  assert.equal(bought.stock.scarf,firstStock.scarf-1);
  const closed=market.action({action:'sync',token:guest.token},until);
  assert.equal(closed.open,false);
  assert.equal(closed.next,start);
  assert.ok(closed.revision>bought.revision);
  assert.equal(closed.basket[0].item,'scarf');
  const regular=market.action({action:'sync',token:guest.token},start);
  assert.equal(regular.stock.scarf,firstStock.scarf);
  assert.ok(regular.revision>closed.revision);
});

test('a regular market can close after a test ends during its opening', t=>{
  const data=setup();t.after(data.close);
  const from=start-90_000,until=start+90_000;
  const market=data.create({from,until});
  const guest=market.action({action:'join'},from);
  const closedTest=market.action({action:'sync',token:guest.token,entryRound:guest.lastClose},until+MARKET_EXIT_MS);
  assert.equal(closedTest.admission,'closed');
  market.action({action:'sync',token:guest.token,entryRound:closedTest.lastClose},until+MARKET_EXIT_MS);
  const bought=market.action({action:'buy',token:guest.token,item:'scarf'},until+MARKET_EXIT_MS+1);
  const closed=market.inventory(start+MARKET_DURATION);
  assert.equal(guest.testing,true);
  assert.equal(bought.testing,undefined);
  assert.ok(bought.revision>guest.revision);
  assert.ok(closed.revision>bought.revision);
  assert.equal(closed.open,false);
});

test('featured rounds stock distinct rare scarves and only the first shopper gets one', t=>{
  const data=setup();t.after(data.close);
  const third=night;
  const from=third+MARKET_DURATION+60_000;
  const market=data.create({from,until:from+120_000});
  const first=market.action({action:'join'},start);
  const second=market.action({action:'join'},start);
  const rare=marketRare(marketSession(third));
  const count=state=>RARE_SCARVES.reduce((sum,item)=>sum+state.stock[item.id],0);
  const regularRares=[start,evening,night].map(at=>market.inventory(at).rare);
  assert.equal(new Set(regularRares).size,3);
  for(const at of [start,evening]){
    const stock=market.inventory(at);
    assert.equal(count(stock),1);
    market.action({action:'sync',token:second.token},at);
    const bought=market.action({action:'buy',token:second.token,item:stock.rare},at+100);
    assert.equal(count(bought),0);
    market.action({action:'sync',token:first.token},at+100);
    assert.equal(market.action({action:'buy',token:first.token,item:stock.rare},at+100).status,409);
  }
  assert.equal(count(market.inventory(third)),1);
  market.action({action:'sync',token:first.token},third);
  market.action({action:'sync',token:second.token},third);
  const purchased=market.action({action:'buy',token:first.token,item:rare.id},third+100);
  assert.equal(purchased.player.cash,ROUND_CURRENCY-rare.price);
  assert.equal(purchased.basket[0].item,rare.id);
  assert.equal(count(purchased),0);
  assert.equal(count(data.create().inventory(third+100)),0);
  const pickup={id:first.player.id,item:rare.id,sentAt:third+100,expiresAt:third+100+RARE_PICKUP_MS};
  const {watchId,...announcement}=purchased.rarePickup;
  assert.ok(Number.isInteger(watchId));
  assert.deepEqual(announcement,pickup);
  assert.equal(market.action({action:'buy',token:second.token,item:rare.id},third+100).status,409);
  const peer=market.action({action:'sync',token:second.token},third+200);
  assert.deepEqual(peer.rarePickup,purchased.rarePickup);
  const watcher=market.action({action:'join',room:'lobby',watch:true},third+300);
  assert.deepEqual(watcher.rarePickup,{...pickup,id:watchId});
  assert.ok(watcher.crowd.some(person=>person.id===watcher.rarePickup.id));
  assert.equal(market.action({action:'sync',token:second.token},pickup.expiresAt).rarePickup,undefined);
  assert.equal(count(market.marketStatus(third+MARKET_DURATION)),0);
  const later=market.action({action:'sync',token:second.token},from);
  assert.equal(count(later),1);
  assert.equal(later.stock.scarf,firstStock.scarf);
  const tomorrow=market.action({action:'sync',token:second.token},night+86_400_000);
  assert.equal(count(tomorrow),1);
  assert.notEqual(tomorrow.rare,rare.id);
});

test('ordinary rounds sometimes stock one rare scarf and share the draw across restarts', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const ordinary=Array.from({length:24*14},(_,hour)=>midnight+hour*3_600_000)
    .filter(at=>!openingHours.includes((at-midnight)/3_600_000%24));
  const bonus=ordinary.filter(at=>marketRare(marketSession(at)));
  assert.ok(bonus.length>0&&bonus.length<ordinary.length/4);
  const at=bonus[0];
  const rare=marketRare(marketSession(at));
  const guest=market.action({action:'join'},at);
  assert.equal(guest.stock[rare.id],1);
  assert.equal(market.action({action:'buy',item:rare.id,token:guest.token},at+500).stock[rare.id],0);
  const restarted=data.create();
  assert.equal(restarted.inventory(at+500).rare,rare.id);
  assert.equal(restarted.inventory(at+500).stock[rare.id],0);

  const noBonus=ordinary.find(time=>!marketRare(marketSession(time)));
  const regular=restarted.action({action:'join'},noBonus);
  assert.equal(regular.rare,null);
  assert.ok(RARE_SCARVES.every(item=>regular.stock[item.id]===0));
  assert.equal(restarted.action({action:'buy',item:rare.id,token:regular.token},noBonus+500).status,409);
});

test('a previously sold daily rare stays sold in its original round', t=>{
  const data=setup();t.after(data.close);
  const from=start-3*60_000;
  const market=data.create({from,until:from+60_000});
  const guest=market.action({action:'join',room:'lobby'},from);
  const rare=marketRare(marketSession(night)).id;
  data.db.prepare('INSERT INTO daily_rare_sales VALUES (?)').run(seoulDay(night));
  data.db.prepare('INSERT INTO basket VALUES (?, ?, ?, ?)').run(guest.player.id,rare,1,from+1000);
  assert.equal(market.inventory(from+2000).stock[rare],0);
  assert.equal(market.inventory(night).stock[rare],1);
  data.db.prepare('UPDATE basket SET updated = ? WHERE player = ? AND item = ?').run(night+1000,guest.player.id,rare);
  assert.equal(market.inventory(night+2000).stock[rare],0);
  const entrant=market.action({action:'sync',token:guest.token},night+2000);
  assert.equal(entrant.basket[0].item,rare);
  assert.equal(market.action({action:'buy',token:guest.token,item:rare},night+2100).status,409);
});
