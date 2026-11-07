import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Market, endpoint } from '../server/market.mjs';
import { CHAT_FEED_MS, CHAT_MS, DEFAULT_LOOK, MARKET_DURATION, RARE_SCARVES, STOCK, START_MONEY, dailyRare, marketSession } from '../game/catalog.mjs';

const midnight=Date.parse('2026-11-08T00:00:00+09:00');
const start=marketSession(midnight).next;

function setup() {
  const db=new DatabaseSync(':memory:');
  function create(testWindow) {
    return new Market((sql,...params)=>{
      const stmt=db.prepare(sql);
      if(/^SELECT\b|\bRETURNING\b/i.test(sql))return stmt.all(...params);
      stmt.run(...params);return [];
    }, fn=>{
      db.exec('BEGIN IMMEDIATE');
      try {const value=fn();db.exec('COMMIT');return value;} catch(e){db.exec('ROLLBACK');throw e;}
    },testWindow);
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
  assert.deepEqual(refill.stock,{...STOCK,[dailyRare(next).id]:1});
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
  assert.equal(sent.speech.name,guest.player.name);
  assert.equal(sent.speech.expiresAt,midnight+100+CHAT_MS);
  assert.equal(market.action({action:'chat',token:guest.token,text:'안녕'},midnight+101).status,429);
  const sync=now=>market.action({action:'sync',token:neighbor.token},now);
  assert.deepEqual(sync(midnight+500).peers[0].speech,sent.speech);
  assert.deepEqual(sync(sent.speech.expiresAt).peers[0].speech,sent.speech);
  assert.deepEqual(market.action({action:'sync',token:guest.token},midnight+8000).speech,sent.speech);
  assert.equal(sync(sent.speech.sentAt+CHAT_FEED_MS).peers[0].speech,undefined);
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
  assert.equal(saved.player.cash,START_MONEY-750);
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
  const from=midnight+5*60_000,until=from+2*60_000;
  const market=data.create({from,until});
  const guest=market.action({action:'join'},from-1);
  assert.equal(guest.open,false);
  const opened=market.action({action:'sync',token:guest.token},from);
  assert.equal(opened.open,true);
  assert.equal(opened.closes,until);
  assert.ok(opened.revision>guest.revision);
  const bought=market.action({action:'buy',token:guest.token,item:'scarf'},from+1);
  assert.equal(bought.stock.scarf,STOCK.scarf-1);
  const closed=market.action({action:'sync',token:guest.token},until);
  assert.equal(closed.open,false);
  assert.equal(closed.next,start);
  assert.ok(closed.revision>bought.revision);
  assert.equal(closed.basket[0].item,'scarf');
  const regular=market.action({action:'sync',token:guest.token},start);
  assert.equal(regular.stock.scarf,STOCK.scarf);
  assert.ok(regular.revision>closed.revision);
});

test('a regular market can close after a test ends during its opening', t=>{
  const data=setup();t.after(data.close);
  const from=start-90_000,until=start+90_000;
  const market=data.create({from,until});
  const guest=market.action({action:'join'},from);
  const bought=market.action({action:'buy',token:guest.token,item:'scarf'},until+1);
  const closed=market.inventory(start+MARKET_DURATION);
  assert.equal(guest.testing,true);
  assert.equal(bought.testing,undefined);
  assert.ok(bought.revision>guest.revision);
  assert.ok(closed.revision>bought.revision);
  assert.equal(closed.open,false);
});

test('exactly one rare scarf can be bought across all sessions on the same Seoul date', t=>{
  const data=setup();t.after(data.close);
  const market=data.create();
  const first=market.action({action:'join'},start);
  const second=market.action({action:'join'},start);
  const rare=dailyRare(start);
  const count=state=>RARE_SCARVES.reduce((sum,item)=>sum+state.stock[item.id],0);
  assert.equal(count(first),1);
  const purchased=market.action({action:'buy',token:first.token,item:rare.id},start+100);
  assert.equal(purchased.player.cash,START_MONEY-rare.price);
  assert.equal(purchased.basket[0].item,rare.id);
  assert.equal(count(purchased),0);
  assert.equal(market.action({action:'buy',token:second.token,item:rare.id},start+100).status,409);
  const later=market.action({action:'sync',token:second.token},first.next);
  assert.equal(count(later),0);
  assert.equal(later.stock.scarf,STOCK.scarf);
  const nextDay=marketSession(midnight+86_400_000).next;
  const tomorrow=market.action({action:'sync',token:second.token},nextDay);
  assert.equal(count(tomorrow),1);
  assert.notEqual(tomorrow.rare,rare.id);
});
