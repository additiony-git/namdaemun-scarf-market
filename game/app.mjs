import { AVATAR_OPTIONS, CHAT_FEED_MS, CHAT_LIMIT, CHAT_MS, DEFAULT_LOOK, EMPTY_STOCK, JUNK, LINES, LOBBY_CHAT_LIMIT, LOBBY_CHAT_MS, MARKET_CAPACITY, MARKET_HOURS, MARKET_ITEMS, RARE_PICKUP_MS, ROUND_CURRENCY, SCARVES, SPAWN, WAITING_LINES, avatarOptionsFor, chatText, marketRare, marketSession, niceName, normalizeLook, roundCloth, roundStock, seoulDay, seoulDayStart } from './catalog.mjs';
import { MARKET_API } from './config.mjs';
import { createWorld, drawAvatarPreview } from './world.mjs';

const shapes = {
  store: '<path d="M3 10v10h18V10M2 10l2-6h16l2 6M2 10c1 4 4 4 5 0 1 4 4 4 5 0 1 4 4 4 5 0 1 4 4 4 5 0M9 20v-5h6v5"/>',
  bag: '<path d="M5 8h14l2 13H3L5 8zm4 2V6a3 3 0 0 1 6 0v4"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3zM7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4m-5 3v5m-4 2h8"/>',
  user: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1"/>',
  down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 5-7 7 7 7"/>', arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3zm13 1 5 5m0-5-5 5"/>',
  sound: '<path d="M3 9h4l5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  expand: '<path d="M9 4H4v5m11-5h5v5m-5 11h5v-5m-11 5H4v-5"/>',
  collapse: '<path d="M4 9h5V4m11 5h-5V4m5 11h-5v5m-11-5h5v5"/>',
  shuffle: '<path d="M3 6h3c4 0 6 12 10 12h5m-4-4 4 4-4 4M3 18h3c4 0 6-12 10-12h5m-4-4 4 4-4 4"/>',
  scarf: '<path d="M6 3h12v7c0 2-2 3-4 3H6zm8 10v8l2-2 2 2 2-2V8a5 5 0 0 0-2-4M6 10h8m-5-7v7"/>',
  gift: '<path d="M3 8h18v4H3zm2 4v9h14v-9M12 8v13m0-13C4 9 4 2 8 3c2 0 4 5 4 5zm0 0c8 1 8-6 4-5-2 0-4 5-4 5z"/>',
  wallet: '<path d="M20 8V5H5a2 2 0 0 0-2 2v12h18V8H5a2 2 0 0 1 0-4m16 8h-6a2 2 0 0 0 0 4h6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 9h6m-6 6h6m-6-3h6m-3-4v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6h4"/>',
  message: '<path d="M20 16H9l-5 4V5h16zM8 9h8m-8 3h6"/>',
  turn: '<path d="M20 8a8 8 0 1 0 0 8M20 3v6h-6"/>',
  exit: '<path d="M11 4H5v16h6m-2-8h12m-4-4 4 4-4 4"/>',
};
const $ = id => document.getElementById(id);
const format = number => Number(number).toLocaleString('ko-KR');
const safe = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const icon = (name) => '<i data-icon="'+name+'" aria-hidden="true"></i>';
function icons(root=document) {
  for(const i of root.querySelectorAll('[data-icon]')){
    if(i.dataset.painted===i.dataset.icon) continue;
    i.dataset.painted=i.dataset.icon;
    i.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(shapes[i.dataset.icon]??'')+'</svg>';
  }
}
icons();

const endpoint = MARKET_API;
const tokenKey = 'ndm-token-v1:' + (endpoint || 'offline');
const demoKey = 'ndm-demo-v1';
const temporary=new Map();
function read(key){try{return localStorage.getItem(key);}catch{return temporary.get(key)??null;}}
function write(key,value){temporary.set(key,value);try{localStorage.setItem(key,value);}catch{/* keep this session playable */}}
const blank = () => ({ id:'solo', name:'새내기 손님', cash:0, collected:0, rank:null });
let token=read(tokenKey), model, world, mode=endpoint?'loading':'solo', modal='', busy=false, timeOffset=0, misses=0, syncTimer;
let enteredMarket=false, entryRequested=false, waitingPosition=0, cancelQueue=false, roomRevision=0;
let watchingMarket=false;
let feedWatching=false;
let queueAdvancePending=false, marketPositionSent;
let watchStatus, watchSignature='', watchRefreshAt=0, watchCrowdAt=0, watchCrowdCount;
let entranceSchedule;
let muted=true, audioCtx, toastTimer, acting=false;
let profileTab='avatar', profileFeedback='';
const profileDrafts=new Map();
let nearby='', shop='', shopSignature='', inventory, feed, retryFeedAt=0, transitionRequested=0;
let soldoutPreview=false, soldoutPreviewTimer;
let soldoutEffectFrame, soldoutEffectTimer;
let lastLine='', filter='all', sendingChat=false;
let watchVendorSignature='';
const seenChat=new Set();
const products=[...MARKET_ITEMS,...JUNK];
const partLabels={character:'캐릭터',hat:'머리 소품',coat:'옷',bag:'가방',scarf:'목에 두른 스카프'};
const openingTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const closedStock=EMPTY_STOCK;
const shortTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dialog=$('modal');
const activeRoom=()=>enteredMarket?'market':'lobby';
const lobbySyncDelay=endpoint.startsWith('https://')?240_000:5_000;
const marketSyncDelay=6_000;
const idleMarketSyncDelay=40_000;
const watchSyncDelay=Math.min(lobbySyncDelay,15_000);
function demo(action='sync', extra={}) {
  let data;
  try {data=JSON.parse(read(demoKey));} catch { /* start fresh */ }
  data ??= { player:blank(), basket:[], round:-1, stock:{} };
  const now=Date.now();
  const session=marketSession(now);
  const rare=session.open?marketRare(now,session)?.id??null:null;
  const initial=roundStock(session.slot);
  const day=seoulDay(now);
  if(data.player.name==='새내기 상인')data.player.name='새내기 손님';
  let currencyGrant;
  if(enteredMarket&&session.open&&data.round!==session.round){
    data.round=session.round;
    data.stock={...initial};
    data.player.cash+=ROUND_CURRENCY;
    currencyGrant=ROUND_CURRENCY;
  }
  const p=data.player;
  const stock={...initial};
  if(data.round===session.round)for(const item of roundCloth(session.slot))stock[item.id]=data.stock[item.id]??item.count;
  if(rare)stock[rare]=data.rareSoldDay===day?0:1;
  let event, rarePickup;
  if(action==='profile'){
    const name=niceName(extra.name);
    if(!name) throw Error('한 글자 이상 입력해 주세요.');
    const look=normalizeLook(extra.look);
    if(!['classic','none'].includes(look.scarf)&&!data.basket.some(item=>item.item===look.scarf&&item.qty>0)){
      throw Error('장바구니에 있는 스카프만 착용할 수 있어요.');
    }
    p.name=name;
    const previous=normalizeLook(p.look);
    p.outfits={...p.outfits,[previous.character]:previous,[look.character]:look};
    p.look=look;
    event='프로필을 저장했어요.';
  }
  if(action==='buy'){
    const item=MARKET_ITEMS.find(i=>i.id===extra.item);
    if(!item) throw Error('매대에 없는 물건이에요.');
    if(!session.open)throw Error('개장하면 상품을 구매할 수 있어요.');
    if(!initial[item.id]&&item.id!==rare)throw Error('이 상품은 이번 장에서 판매하지 않아요.');
    if(!stock[item.id]) throw Error('이번 장에는 품절이에요. 다음 장을 기다려 주세요.');
    if(p.cash<item.price) throw Error('지역화폐가 부족해요. 다음 장에 입장하면 '+format(ROUND_CURRENCY)+'원을 받아요.');
    stock[item.id]--;
    if(item.rare){
      data.rareSoldDay=day;
      rarePickup={id:p.id,item:item.id,sentAt:now,expiresAt:now+RARE_PICKUP_MS};
    }
    else data.stock[item.id]=stock[item.id];
    p.cash-=item.price;
    const existing=data.basket.find(i=>i.item===item.id);
    if(existing){existing.qty++;existing.updated=now;}else data.basket.push({item:item.id,qty:1,updated:now});
    data.basket.sort((a,b)=>b.updated-a.updated);
    event=item.name+' 장바구니에 담았어요!';
  }
  p.rank=p.collected?1:null;
  write(demoKey,JSON.stringify(data));
  const used=session.open?roundCloth(session.slot).reduce((n,item)=>n+item.count-stock[item.id],0)+Number(Boolean(rare)&&data.rareSoldDay===day):500;
  const phase=Math.max(session.open?session.round:session.closes/60_000,seoulDayStart(now)/60_000);
  return {...data,...session,rare,stock:session.open?stock:closedStock,
    online:1,peers:[],ranking:p.collected?[p]:[],now,dailyRareSold:data.rareSoldDay===day,revision:phase*1000+used,event,currencyGrant,rarePickup};
}
async function request(action, extra={}, room=activeRoom()){
  const pos=room==='market'?world?.position()??SPAWN:SPAWN;
  if(room==='market'&&enteredMarket)marketPositionSent={...pos,at:Date.now()};
  const response=await fetch(endpoint,{
    method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({action, token, room, watch:watchingMarket&&!feedWatching, pos, ...extra}), signal:AbortSignal.timeout(6000),
  });
  let data;
  try {data=await response.json();}catch{throw Error('장터 서버에 연결할 수 없어요.');}
  if(!response.ok){
    const error=new Error(data.error??'장터 서버에 연결할 수 없어요.');error.status=response.status;throw error;
  }
  if(!data.player||!data.stock) throw Error('장터 서버 주소를 확인해 주세요.');
  if(data.token){token=data.token;write(tokenKey,token);}
  return data;
}
function setModel(data){
  model=data;
  noteSchedule(data);
  setWatchStatus(data);
  if(enteredMarket){
    world?.setPeers(data.peers,data.player.id,data.player.look);
    showChat(data.speech);
    for(const peer of data.peers)showChat(peer.speech);
    setInventory(data);
  }else{
    for(const speech of data.lobbyMessages??[])showLobbyChat(speech);
    if(watchingMarket&&data.crowd)setWatchCrowd(data.crowd,data.now);
  }
  if(enteredMarket||watchingMarket)showRarePickup(data.rarePickup);
  render();
  if(enteredMarket&&data.currencyGrant)toast('이번 장 지역화폐 '+format(data.currencyGrant)+'원을 받았어요.');
}
function marketAvailability(snapshot=inventory){
  if(!snapshot)return 'loading';
  if(!snapshot.open)return 'waiting';
  return MARKET_ITEMS.some(item=>snapshot.stock[item.id]>0)?'selling':'soldout';
}
function displayedAvailability(){
  return soldoutPreview?'soldout':marketAvailability();
}
function nextSaleAt(snapshot=inventory){
  return snapshot.next;
}
function clearSoldoutEffect(){
  cancelAnimationFrame(soldoutEffectFrame);
  clearTimeout(soldoutEffectTimer);
  $('soldout-scene').hidden=true;
  $('vendor-speech').classList.remove('soldout-pop');
}
function playSoldoutEffect(){
  clearSoldoutEffect();
  const next=openingTime.format(nextSaleAt());
  const scene=$('soldout-scene');
  $('soldout-scene-label').textContent=soldoutPreview?'테스트 미리보기':'남대문 스카프 매대';
  $('soldout-scene-next').textContent='다음 장 · '+next;
  soldoutEffectFrame=requestAnimationFrame(()=>{
    if(displayedAvailability()!=='soldout')return;
    scene.hidden=false;
    $('vendor-speech').classList.add('soldout-pop');
    soldoutEffectTimer=setTimeout(()=>{scene.hidden=true;},2500);
  });
  toast((soldoutPreview?'완판 효과 미리보기':'이번 장 완판!')+' · '+next+'에 다시 와요.');
}
function setSoldoutPreview(active){
  clearTimeout(soldoutPreviewTimer);
  soldoutPreview=active;
  if(!active)clearSoldoutEffect();
  world?.setStock(active?closedStock:inventory.stock,inventory.slot);
  line();
  tick();
  renderShop();
  if(active&&enteredMarket){
    playSoldoutEffect();
    soldoutPreviewTimer=setTimeout(()=>setSoldoutPreview(false),8000);
  }
}
function setInventory(data){
  if(!data.stock||typeof data.open!=='boolean'||!Number.isSafeInteger(data.revision))return;
  if(inventory&&data.revision<=inventory.revision)return;
  const previous=marketAvailability();
  const previousNext=inventory&&nextSaleAt();
  inventory={stock:data.stock,revision:data.revision,round:data.round,slot:data.slot,nextSlot:data.nextSlot,next:data.next,open:data.open,closes:data.closes,testing:Boolean(data.testing),rare:data.rare};
  const current=marketAvailability();
  const becameSoldout=previous==='selling'&&current==='soldout';
  if(soldoutPreview&&(!inventory.testing||becameSoldout))setSoldoutPreview(false);
  else if(previous==='soldout'&&current!=='soldout'&&!soldoutPreview)clearSoldoutEffect();
  if(!enteredMarket)return;
  world?.setStock(soldoutPreview?closedStock:inventory.stock,inventory.slot);
  if(previous!==current||previousNext!==nextSaleAt())line();
  if(becameSoldout)playSoldoutEffect();
  tick();
  renderShop();
}
function showSpeechBubble(speech,now){
  if(!speech||typeof speech.text!=='string')return;
  const remaining=Math.min(CHAT_MS,speech.expiresAt-now);
  if(remaining>0)world?.showChat(speech,remaining);
}
function showChat(speech){
  if(!speech||typeof speech.text!=='string')return;
  const now=Date.now()+timeOffset;
  showSpeechBubble(speech,now);
  const duration=Math.min(CHAT_FEED_MS,speech.sentAt+CHAT_FEED_MS-now);
  const key=speech.playerId+':'+speech.sentAt;
  if(!(duration>0)||seenChat.has(key))return;
  seenChat.add(key);
  const log=$('chat-feed');
  const row=chatRow(speech);
  log.append(row);
  if(log.children.length>3)log.firstElementChild.remove();
  setTimeout(()=>row.remove(),duration);
  setTimeout(()=>seenChat.delete(key),duration+1000);
}
function chatRow(speech){
  const row=document.createElement('div');
  const name=document.createElement('b');
  name.textContent=speech.name||model?.peers.find(peer=>peer.id===speech.playerId)?.name||'손님';
  row.classList.toggle('own-message',speech.playerId===model?.player.id);
  row.append(name,document.createTextNode(speech.text));
  return row;
}
function showLobbyChat(speech){
  if(!speech||typeof speech.text!=='string'||!Number.isFinite(speech.sentAt)||
    Date.now()+timeOffset-speech.sentAt>=LOBBY_CHAT_MS)return;
  const log=$('lobby-chat-feed');
  const key=speech.playerId+':'+speech.sentAt;
  const rows=[...log.children];
  if(rows.some(row=>row.dataset.key===key))return;
  const row=chatRow(speech);
  row.dataset.key=key;
  row.dataset.sentAt=String(speech.sentAt);
  const follow=log.scrollHeight-log.scrollTop-log.clientHeight<28;
  log.insertBefore(row,rows.find(message=>Number(message.dataset.sentAt)>speech.sentAt)??null);
  if(log.children.length>LOBBY_CHAT_LIMIT)log.firstElementChild.remove();
  $('lobby-chat-empty').hidden=true;
  if(follow)log.scrollTop=log.scrollHeight;
}
function closeFeed(){
  const socket=feed;
  feed=null;
  feedWatching=false;
  socket?.close();
  retryFeedAt=0;
}
function connectFeed(){
  if(feed||document.hidden||Date.now()<retryFeedAt||!endpoint.startsWith('https://'))return;
  const url=new URL(endpoint);
  url.protocol='wss:';
  const room=activeRoom();
  if(room==='lobby')url.searchParams.set('room','lobby');
  const socket=new WebSocket(url);
  feed=socket;
  socket.onopen=()=>{if(feed===socket&&room==='lobby'&&watchingMarket)subscribeToWatch(true);};
  socket.onmessage=({data})=>{
    if(feed!==socket)return;
    try {
      const update=JSON.parse(data);
      if(room==='lobby'){
        if(update.type==='chat')showLobbyChat(update.speech);
        if(update.type==='queue-advanced'&&waitingPosition){
          queueAdvancePending=true;
          if(!busy)queue(0);
        }
        if(watchingMarket&&update.type==='market-crowd')setWatchCrowd(update.crowd,update.now);
        if(watchingMarket&&update.type==='rare-pickup')showRarePickup(update.pickup);
        if(update.type==='market-status'){
          const wasFull=seatsFull();
          noteSchedule(update);
          setWatchStatus(update);
          tick();
          if(wasFull&&!seatsFull()&&waitingPosition===1&&!busy)queue(0);
        }
      }else if(update.type==='chat')showChat(update.speech);
      else if(update.type==='rare-pickup')showRarePickup(update.pickup);
      else if(update.type==='market-status'){
        const opened=inventory&&!inventory.open&&update.open;
        setInventory(update);
        if(opened&&!busy)queue(0);
      }
    } catch { /* wait for the next server sync */ }
  };
  socket.onclose=()=>{
    if(feed!==socket)return;
    feed=null;
    feedWatching=false;
    retryFeedAt=Date.now()+10_000;
    if((watchingMarket||entryRequested)&&!busy)queue(watchSyncDelay);
  };
}
function status() {
  $('live-mode').textContent=mode==='online'?'골목 접속 중':mode==='solo'?'혼자 체험':mode==='loading'?'골목 연결 중':'재연결 중';
  $('live').classList.toggle('offline',mode!=='online');
  $('live').title=mode==='solo'?'이 브라우저에만 기록되는 혼자 체험 모드':mode==='online'?'현재 이 골목에 접속한 상인 수':'온라인 장터 연결 상태';
  $('online').textContent=mode==='online'&&model?format(model.online):mode==='solo'?'1':'–';
  const lobbyOnline=!enteredMarket&&mode==='online';
  setText('lobby-chat-status',lobbyOnline?'대기 중 '+format(model.online)+'명':mode==='solo'?'온라인에서 함께 대화할 수 있어요':mode==='retry'?'대기실에 다시 연결하고 있어요':'대기실에 연결하고 있어요');
  $('lobby-chat-input').disabled=!lobbyOnline;
  $('lobby-send-chat').disabled=!lobbyOnline||sendingChat;
}
function noteSchedule(data){
  if(!Number.isFinite(data.now)||!Number.isFinite(data.next)||!Number.isFinite(data.closes)||
    ![1,2,3].includes(data.nextSlot)||typeof data.open!=='boolean'||data.now<(entranceSchedule?.now??0))return;
  timeOffset=data.now-Date.now();
  const { now, round, slot, nextSlot, open, next, closes, testing }=data;
  entranceSchedule={ now, round, slot, nextSlot, open, next, closes, testing };
}
function scheduleAt(now){
  const current=entranceSchedule;
  return current&&now<(current.open?current.closes:current.next)?current:marketSession(now);
}
function countdownText(ms){
  const seconds=Math.ceil(Math.max(0,ms)/1000);
  const hours=Math.floor(seconds/3600);
  return (hours?hours+':':'')+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
function setText(id,text){const node=$(id);if(node.textContent!==text)node.textContent=text;}
function showMarketHours(){
  const rows=MARKET_HOURS.map(({hour,name})=>{
    const time=String(hour).padStart(2,'0')+':00';
    return '<li><span>'+name+'</span><time datetime="'+time+'">'+time+'</time></li>';
  }).join('');
  $('market-hours-list').innerHTML=rows;
  $('watch-hours-list').innerHTML=rows;
}
function setWatchStatus(data){
  if(!data.stock||!Number.isFinite(data.now)||data.now<(watchStatus?.now??0))return;
  const {now, round, open, rare, stock, revision, marketOnline, marketCapacity}=data;
  watchStatus={now,round,open,rare,stock,revision,marketOnline,marketCapacity};
  if(watchingMarket){
    subscribeToWatch(true);
    renderSpectator();
  }
}
function seatsFull(){
  return watchStatus?.marketOnline >= (watchStatus?.marketCapacity??MARKET_CAPACITY);
}
function renderEntrance(session, now){
  const open=session.open&&now<session.closes;
  const full=seatsFull();
  const button=$('enter-market');
  button.disabled=cancelQueue||(entryRequested&&!waitingPosition);
  const label=waitingPosition?'내 대기 '+waitingPosition+'번'
    :entryRequested?'입장 확인 중':endpoint?'선착순 입장하기':'시장 입장하기';
  setText('enter-market-label',label);
  if(waitingPosition)button.setAttribute('aria-label',label+' · 관람 화면 열기');
  else button.removeAttribute('aria-label');
  $('queue-card').dataset.state=waitingPosition?'queue':full?'full':open?'open':'waiting';
  setText('queue-heading',open?(session.testing?'테스트 장 판매 중':session.slot+'차 판매 중'):session.nextSlot+'차 개장까지');
  const nextDate=seoulDay(session.next)===seoulDay(now)?shortTime.format(session.next):openingTime.format(session.next);
  const marketOnline=watchStatus?.marketOnline??0;
  const capacity=watchStatus?.marketCapacity??MARKET_CAPACITY;
  const entryDetail=endpoint?'입장 '+marketOnline+'/'+capacity+'명':'혼자 체험';
  const entryNote=endpoint?' · '+(full?'줄서기 가능':'선착순'):'';
  setText('queue-detail',(open?'':'개장 '+nextDate+' · ')+entryDetail+entryNote);
  setText('queue-countdown',countdownText((open?session.closes:session.next)-now));
}
function returnToEntrance(message='시작 화면으로 돌아왔어요.'){
  if(!enteredMarket)return;
  enteredMarket=false;
  roomRevision++;
  closeFeed();
  if(dialog.open)dialog.close();
  setChatOpen(false);
  nearby='';
  closeShop();
  clearSoldoutEffect();
  clearTimeout(toastTimer);
  $('toast').classList.remove('show');
  world?.leaveMarket();
  inventory=undefined;
  mode=endpoint?'loading':'solo';
  transitionRequested=0;
  $('chat-feed').replaceChildren();
  $('market-ui').hidden=true;
  $('world').setAttribute('aria-hidden','true');
  $('entrance').hidden=false;
  const now=Date.now()+timeOffset, current=scheduleAt(now);
  renderEntrance(current,now);
  const notice=$('entrance-notice');
  notice.textContent=message;
  notice.hidden=false;
  notice.focus({preventScroll:true});
  status();
  if(endpoint)queue(0);
}
function tick(){
  const now=Date.now()+timeOffset, session=scheduleAt(now);
  if(!enteredMarket){
    renderEntrance(session,now);
    const boundary=entranceSchedule?.open?entranceSchedule.closes:entranceSchedule?.next;
    if(boundary<=now&&transitionRequested!==boundary){
      transitionRequested=boundary;
      if(endpoint)queue(0);
      else setModel(demo());
    }
    if(watchingMarket)renderSpectator();
    const log=$('lobby-chat-feed');
    while(log.firstElementChild&&now-Number(log.firstElementChild.dataset.sentAt)>=LOBBY_CHAT_MS)log.firstElementChild.remove();
    $('lobby-chat-empty').hidden=Boolean(log.children.length);
    return;
  }
  if(!inventory)return;
  if(endpoint&&!session.open&&mode==='online'&&!busy&&!document.hidden&&
      Date.now()-(marketPositionSent?.at??0)>=marketSyncDelay){
    const pos=world?.position();
    if(pos&&(!marketPositionSent||Math.hypot(pos.x-marketPositionSent.x,pos.z-marketPositionSent.z)>=.1))queue(0);
  }
  const transition=inventory.open?inventory.closes:inventory.next;
  const transitionPassed=transition<=now;
  if(transitionPassed&&mode==='solo'){setModel(demo());return;}
  if(transitionPassed&&mode==='online'&&transitionRequested!==transition){transitionRequested=transition;queue(0);}
  const waiting=!inventory.open||displayedAvailability()==='soldout';
  const deadline=waiting?nextSaleAt():transition;
  $('clock-label').textContent=waiting?(inventory.nextSlot??session.nextSlot)+'차 개장':inventory.testing?'테스트 마감':(inventory.slot??session.slot)+'차 마감';
  $('countdown').textContent=countdownText(deadline-now);
  $('countdown').title=openingTime.format(deadline)+' (한국 시간)';
}
function rankRows(list){
  return list.map((p,i)=>'<li class="rank-row"><span class="rank-pos">'+(i+1)+'</span><span class="rank-face">'+icon('user')+'</span><span class="rank-name">'+safe(p.name)+(p.id===model.player.id?'<small>나</small>':'')+'</span><span class="rank-num">'+format(p.collected)+'<small> 개</small></span></li>').join('');
}
function render(){
  if(!model){status();return;}
  const p=model.player;
  $('nickname').textContent=p.name;
  $('balance').textContent=format(p.cash);
  status();tick();
  renderShop();
  if(dialog.open)renderModal();
}
function modalInfo(type){
  return ({
    scarves:['01 · SCARF STALL','스카프 매대'],
    junk:['02 · ODD GOODS','잡화점'],
    rank:['MARKET RANKING','쓸모없는 수집왕'],
    profile:['MY MARKET PROFILE','내 프로필'],
  })[type];
}
function open(type, tab='avatar'){
  profileDrafts.clear();
  modal=type;
  profileTab=tab;
  profileFeedback='';
  $('modal-body').replaceChildren();
  world?.dir.clear();
  const [label,title]=modalInfo(type);
  $('modal-kicker').textContent=label;$('modal-title').textContent=title;
  renderModal();
  if(!dialog.open)dialog.showModal();
}
function itemPicture(item){
  return item.pattern
    ? '<span class="item-pic" aria-hidden="true"><span class="swatch '+item.pattern+'" style="--cloth:'+item.color+';--ink:'+item.ink+'"></span></span>'
    : '<span class="item-pic" aria-hidden="true">'+item.pic+'</span>';
}
function showRarePickup(pickup){
  if(!world||!pickup)return;
  const item=SCARVES.find(item=>item.rare&&item.id===pickup.item);
  const remaining=Math.min(RARE_PICKUP_MS,pickup.expiresAt-(Date.now()+timeOffset));
  if(!item||!(remaining>0))return;
  const node=document.createElement('div');
  node.className='rare-pickup';
  node.innerHTML=itemPicture(item)+'<span><small>✦ 레어 획득!</small><strong>'+item.name+'</strong></span>';
  world.showRarePickup(pickup,node,remaining);
}
function itemRow(item, detail, end){
  const rare=item.rare?'<span class="rare-tag"><span aria-hidden="true">✦</span> 레어</span>':'';
  return '<div class="item'+(item.rare?' rare-item':'')+'">'+itemPicture(item)+'<span class="item-info"><strong>'+item.name+rare+'</strong><small>'+detail+'</small></span>'+end+'</div>';
}
function openShop(type){
  if(soldoutPreview&&type!=='scarves')setSoldoutPreview(false);
  shop=type;
  filter='all';
  shopSignature='';
  $('shop-feedback').textContent='';
  const [label,title]=modalInfo(type);
  $('shop-kicker').textContent=label;
  $('shop-title').textContent=title;
  $('shop').hidden=false;
  world?.focusShop(true);
  updateInteract();
  renderShop();
}
function closeShop(){
  shop='';
  $('shop').hidden=true;
  if(soldoutPreview)setSoldoutPreview(false);
  world?.focusShop(false);
  updateInteract();
}
function renderShop(){
  if(!shop)return;
  const body=$('shop-items');
  const status=displayedAvailability();
  const previewButton=$('soldout-preview');
  previewButton.hidden=shop!=='scarves'||!inventory?.testing;
  previewButton.disabled=acting;
  previewButton.setAttribute('aria-pressed',String(soldoutPreview));
  previewButton.textContent=soldoutPreview?'미리보기 닫기':'✦ 완판 효과 보기';
  $('shop-summary').hidden=shop==='junk'||status!=='selling';
  $('shop-filters').hidden=shop==='junk'||status!=='selling';
  $('daily-rare').hidden=shop==='junk'||status!=='selling'||!inventory?.rare;
  $('sale-label').textContent=inventory?.testing?'테스트 장 · 선착순 판매':(inventory?.slot??1)+'차 · 선착순 판매';
  if(shop==='junk'){
    body.innerHTML='<div class="shop-closed"><span class="closed-tag">OPENING SOON</span><strong>오픈 준비 중</strong><p>진열이 끝나면 잡화점 문을 열어요.</p></div>';
    return;
  }
  if(!model||!inventory){body.innerHTML='<p class="empty">상품을 불러오고 있어요.</p>';return;}
  const signature=[inventory.revision,model.player.cash,mode,acting,filter,soldoutPreview].join(':');
  if(signature===shopSignature)return;
  shopSignature=signature;
  if(!inventory.open){
    body.innerHTML='<div class="shop-closed"><span class="closed-tag">NEXT MARKET</span><strong>'+inventory.nextSlot+'차 장 · '+openingTime.format(inventory.next)+'</strong><p>골목에서 채팅하며 기다려요. 개장하면 매대에서 구매할 수 있어요.</p></div>';
    return;
  }
  if(status==='soldout'){
    const label=soldoutPreview?'테스트 미리보기':'SOLD OUT';
    body.innerHTML='<div class="shop-closed shop-soldout"><span class="closed-tag">'+label+'</span><strong>이번 장 완판!</strong><p>다음 장은 '+openingTime.format(nextSaleAt())+'에 열려요. <span>한국 시간</span></p></div>';
    return;
  }
  for(const button of $('shop-filters').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.filter===filter));
  const counts=inventory.stock;
  const rare=SCARVES.find(item=>item.id===inventory.rare);
  const dailyLabel=$('daily-rare');
  if(rare)dailyLabel.textContent='✦ 오늘의 레어 · '+rare.name+' · '+(counts[rare.id]?'하루 1장':'오늘 품절');
  const regular=roundCloth(inventory.slot);
  const items=(rare?[rare,...regular]:regular).filter(item=>filter==='all'||item.group===filter);
  const total=MARKET_ITEMS.reduce((sum,item)=>sum+(counts[item.id]??0),0);
  $('shop-stock').textContent='남은 상품 '+total+'개';
  const active=body.contains(document.activeElement)?document.activeElement.dataset:null;
  const canTrade=!acting&&['online','solo'].includes(mode);
  body.innerHTML=items.filter(item=>counts[item.id]>0).map(item=>{
    const affordable=model.player.cash>=item.price;
    const buy='<button class="primary" data-item="'+item.id+'" data-action="buy" aria-label="'+item.name+' 사기" '+(!canTrade||!affordable?'disabled':'')+'>'+format(item.price)+'원 '+(affordable?'사기':'예산 부족')+'</button>';
    return itemRow(item,counts[item.id]+'장 남음 · '+item.detail,buy);
  }).join('')||'<p class="empty">이 종류의 상품은 모두 나갔어요.</p>';
  if(active?.item)body.querySelector('[data-item="'+active.item+'"][data-action="'+active.action+'"]:not(:disabled)')?.focus({preventScroll:true});
}
function basketRows(){
  const total=model.basket.reduce((sum,item)=>sum+item.qty,0);
  return '<p class="modal-note">구매한 물건 '+format(total)+'개</p>'+(
    model.basket.length?model.basket.map(entry=>{
      const item=products.find(i=>i.id===entry.item);
      if(!item)return '';
      const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(entry.updated);
      return itemRow(item,'마지막 구매 · '+date,'<span class="item-price">'+format(entry.qty)+'개</span>');
    }).join(''):'<div class="empty">아직 빈 장바구니예요. 매대에서 첫 물건을 골라보세요.</div>');
}
function selectedLook(form){
  return Object.fromEntries(Object.keys(DEFAULT_LOOK).map(part=>[part,form.elements.namedItem(part).value]));
}
function previewLook(){
  const form=$('profile-form'),canvas=$('avatar-preview');
  if(form&&canvas)drawAvatarPreview(canvas,selectedLook(form),canvas.dataset.turned==='true');
}
function wardrobeOptions(part,look){
  let options;
  if(part==='scarf'){
    const owned=new Set(model.basket.filter(item=>item.qty>0).map(item=>item.item));
    options=[['classic',{name:'기본 주홍 스카프'}],['none',{name:'스카프 없음'}],...SCARVES.filter(item=>owned.has(item.id)).map(item=>[item.id,item])];
  }else options=avatarOptionsFor(part,look.character);
  const markup=items=>items.map(([id,option])=>'<option value="'+id+'"'+(look[part]===id?' selected':'')+'>'+(option.rare?'✦ 레어 · ':'')+option.name+'</option>').join('');
  const exclusive=options.filter(([,option])=>option.character);
  return exclusive.length
    ? '<optgroup label="'+AVATAR_OPTIONS.character[look.character].wardrobe+'">'+markup(exclusive)+'</optgroup><optgroup label="공용 소품">'+markup(options.filter(([,option])=>!option.character))+'</optgroup>'
    : markup(options);
}
function switchCharacter(form){
  const choice=selectedLook(form),previous=form.dataset.character;
  profileDrafts.set(previous,{...choice,character:previous});
  const next=profileDrafts.get(choice.character)??model.player.outfits?.[choice.character];
  const look=normalizeLook({...next,character:choice.character});
  form.dataset.character=look.character;
  for(const part of ['hat','coat','bag','scarf'])form.elements.namedItem(part).innerHTML=wardrobeOptions(part,look);
  $('wardrobe-label').textContent=AVATAR_OPTIONS.character[look.character].wardrobe;
}
function wardrobe(){
  const look=normalizeLook(model.player.look);
  const fields=Object.keys(partLabels).map(part=>
    '<label for="look-'+part+'">'+partLabels[part]+'</label><select id="look-'+part+'" name="'+part+'">'+wardrobeOptions(part,look)+'</select>'
  ).join('');
  return '<form class="profile-form" id="profile-form" data-character="'+look.character+'"><fieldset id="profile-fields"><div class="profile-editor">'+
    '<div class="avatar-card"><canvas id="avatar-preview" width="230" height="230" role="img" aria-label="선택한 캐릭터 미리보기"></canvas>'+
    '<p id="wardrobe-label" class="wardrobe-label" aria-live="polite">'+AVATAR_OPTIONS.character[look.character].wardrobe+'</p>'+
    '<button id="rotate-avatar" class="glass" type="button" aria-pressed="false">'+icon('turn')+' 뒤집어 보기</button></div>'+
    '<div class="profile-choices"><label for="new-name">닉네임</label><input id="new-name" name="name" required maxlength="28" value="'+safe(model.player.name)+'">'+
    fields+'</div></div><p class="modal-note wardrobe-note">차림은 캐릭터별로 저장돼요. 장바구니의 스카프도 착용할 수 있어요.</p>'+
    '<div class="profile-save"><p id="profile-feedback" class="dialog-feedback" role="status"></p><button class="primary" type="submit">프로필 저장</button></div></fieldset></form>';
}
function renderProfile(body){
  if(!$('profile-content')){
    body.innerHTML='<div class="profile-tabs" role="group" aria-label="내 프로필 메뉴">'+
      '<button type="button" data-profile-tab="avatar">'+icon('user')+' 캐릭터 꾸미기</button>'+
      '<button type="button" data-profile-tab="bag">'+icon('bag')+' 내 장바구니</button></div><div id="profile-content"></div>';
    icons(body);
  }
  for(const button of body.querySelectorAll('[data-profile-tab]')){
    button.setAttribute('aria-pressed',String(button.dataset.profileTab===profileTab));
  }
  const content=$('profile-content');
  if(!model){content.innerHTML='<p class="empty">내 프로필을 불러오고 있어요.</p>';return;}
  if(!$('profile-avatar'))content.innerHTML='<div id="profile-avatar"></div><div id="profile-bag"></div>';
  const avatar=$('profile-avatar'),bag=$('profile-bag');
  avatar.hidden=profileTab!=='avatar';
  bag.hidden=profileTab!=='bag';
  if(profileTab==='bag'){
    const stamp=JSON.stringify(model.basket);
    if(bag.dataset.basket!==stamp){
      bag.dataset.basket=stamp;
      bag.innerHTML=basketRows();
    }
    return;
  }
  if(!$('profile-form')){
    avatar.innerHTML=wardrobe();
    icons(avatar);
    previewLook();
  }
  $('profile-fields').disabled=acting||!['online','solo'].includes(mode);
  $('profile-feedback').textContent=profileFeedback;
}
function renderModal(){
  const body=$('modal-body');
  if(modal==='profile'){renderProfile(body);return;}
  if(!model){body.innerHTML='<p class="empty">장터에 연결하고 있어요.</p>';return;}
  if(modal==='rank'){
    const p=model.player;
    body.innerHTML='<p class="modal-note">'+(mode==='solo'?'혼자 체험 기록입니다. ':'장터 상위 30명 · ')+'잡화가 많을수록, 동점이면 해당 수량에 먼저 도달한 순서로 앞서요.</p>'+
      (model.ranking.length?'<ol class="rank-list">'+rankRows(model.ranking)+'</ol>':'<div class="empty">아직 수집 기록이 없어요. 첫 수집왕에 도전하세요!</div>')+
      (p.rank?'<p class="modal-note" style="margin-top:10px">내 순위: '+p.rank+'위 · '+format(p.collected)+'개</p>':'');
  }
  icons(body);
}
function renderSpectator(rotateVendor=false){
  const now=Date.now()+timeOffset;
  const session=scheduleAt(now);
  const current=watchStatus?.open&&session.open&&watchStatus.round===session.round;
  const count=watchCrowdCount??watchStatus?.marketOnline??0;
  const capacity=watchStatus?.marketCapacity??MARKET_CAPACITY;
  setText('watch-connection',!endpoint?'● 구경 모드':!watchCrowdAt?'● 시장 연결 중':feedWatching?'● 실시간 관람':'● 시장 상황 갱신 중');
  $('watch-queue').hidden=!waitingPosition;
  if(waitingPosition)setText('watch-position','내 대기 순번 '+waitingPosition+'번');
  const stock=current?watchStatus.stock:closedStock;
  const total=current?MARKET_ITEMS.reduce((sum,item)=>sum+(stock[item.id]??0),0):0;
  const heading=current?(total?session.slot+'차 장 판매 중':'이번 장 완판'):session.open?'시장 상황 확인 중':'개장 전 · 골목 구경 중';
  const vendorState=current?marketAvailability(watchStatus):session.open?'loading':'waiting';
  const vendorSignature=vendorState+':'+session.next;
  if(rotateVendor||vendorSignature!==watchVendorSignature){
    watchVendorSignature=vendorSignature;
    line(vendorState,session.next);
  }
  setText('watch-heading',heading+(endpoint?' · '+count+'/'+capacity+'명':''));
  setText('watch-time',countdownText((session.open?session.closes:session.next)-now));
  $('watch-enter').hidden=Boolean(waitingPosition);
  $('watch-enter').disabled=cancelQueue||entryRequested;
  const watchEntryLabel=endpoint?'대기자 입장하기':'시장 입장하기';
  setText('watch-enter',cancelQueue?'줄서기 취소 중':entryRequested?'입장 확인 중':watchEntryLabel);
  $('watch-refresh').hidden=!endpoint||feed?.readyState===WebSocket.OPEN;
  $('watch-refresh').disabled=Date.now()<watchRefreshAt;
  const signature=[session.round,session.open,watchStatus?.revision,current].join(':');
  if(signature!==watchSignature){
    watchSignature=signature;
    world?.setStock(stock,session.slot);
    const list=$('watch-stock');
    const scrollTop=list.scrollTop;
    const rareItem=current?MARKET_ITEMS.find(item=>item.id===watchStatus.rare):undefined;
    const items=current?[...(rareItem?[rareItem]:[]),...roundCloth(session.slot)]:[];
    const rows=items.map(item=>{
      const quantity=stock[item.id]??0;
      const status=quantity?quantity+'개 남음':'품절';
      return itemRow(item,format(item.price)+'원','<span class="item-price'+(quantity?'':' watch-soldout')+'">'+status+'</span>');
    }).join('');
    list.innerHTML=rows||'<p class="empty">개장하면 판매 상품과 수량이 표시돼요.</p>';
    list.scrollTop=scrollTop;
  }
}
function setWatchCrowd(crowd,now=Date.now()+timeOffset){
  if(!Array.isArray(crowd)||now<watchCrowdAt)return;
  watchCrowdAt=now;
  watchCrowdCount=crowd.length;
  world?.setPeers(crowd);
  const serverNow=Date.now()+timeOffset;
  for(const person of crowd)showSpeechBubble(person.speech,serverNow);
  renderSpectator();
}
function subscribeToWatch(active){
  if(feed?.readyState!==WebSocket.OPEN||active===feedWatching)return;
  feed.send(active?'watch':'unwatch');
  feedWatching=active;
}
function showWatchFeedback(message=''){
  setText('watch-feedback',message);
  $('watch-feedback').hidden=!message;
}
function setWatchView(view){
  world?.watchMarket(view);
  $('watch-wide').setAttribute('aria-pressed',String(view==='wide'));
  $('watch-stall').setAttribute('aria-pressed',String(view==='stall'));
}
function setWatchPanel(open){
  $('watch-panel').hidden=!open;
  $('watch-stock-toggle').setAttribute('aria-expanded',String(open));
}
function refreshSpectator(){
  if(!endpoint||Date.now()<watchRefreshAt)return;
  watchRefreshAt=Date.now()+20_000;
  queue(0);
  renderSpectator();
}
function openSpectator(message){
  if(enteredMarket)return;
  if(!watchingMarket){
    if(dialog.open)dialog.close();
    setLobbyChatOpen(false,false);
    watchingMarket=true;
    watchCrowdAt=0;
    watchCrowdCount=undefined;
    watchSignature='';
    watchVendorSignature='';
    $('entrance').hidden=true;
    $('watch-ui').hidden=false;
    $('world').removeAttribute('aria-hidden');
    $('world').setAttribute('aria-label','남대문시장 골목 구경');
    setWatchView('wide');
    setWatchPanel(!world||(scheduleAt(Date.now()+timeOffset).open&&!matchMedia('(max-width: 640px)').matches));
    $('watch-exit').focus({preventScroll:true});
    if(feed?.readyState===WebSocket.OPEN)subscribeToWatch(true);
    else queue(0);
  }
  showWatchFeedback(message||(!world?'3D 화면을 열 수 없어 재고 목록을 보여드려요.':''));
  renderSpectator();
}
function closeSpectator(){
  if(!watchingMarket)return;
  subscribeToWatch(false);
  watchingMarket=false;
  $('watch-ui').hidden=true;
  $('world').setAttribute('aria-label','남대문 시장 3D 골목');
  $('world').setAttribute('aria-hidden','true');
  world?.leaveMarket();
  $('entrance').hidden=false;
  $('spectate-market').focus({preventScroll:true});
  if(!waitingPosition&&endpoint)queue(0);
}
function toast(message){
  clearTimeout(toastTimer);
  $('toast').textContent=message;$('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2900);
}
function setChatOpen(open){
  if(open&&mode!=='online'){
    toast('온라인 장터에 연결되면 채팅할 수 있어요.');
    return;
  }
  $('chat-form').hidden=!open;
  $('chat-toggle').setAttribute('aria-expanded',String(open));
  if(open){
    world?.dir.clear();
    $('chat-input').focus();
  }else{
    $('chat-input').blur();
  }
}
function setLobbyChatOpen(open, focus=true){
  $('lobby-chat').hidden=!open;
  $('lobby-chat-toggle').setAttribute('aria-expanded',String(open));
  if(!focus)return;
  if(open){
    const log=$('lobby-chat-feed');
    log.scrollTop=log.scrollHeight;
    if(!$('lobby-chat-input').disabled)$('lobby-chat-input').focus();
    else $('lobby-chat-close').focus();
  }else $('lobby-chat-toggle').focus();
}
async function claimRoomRequest(revision){
  while(busy&&revision===roomRevision)await new Promise(resolve=>setTimeout(resolve,35));
  if(revision!==roomRevision)return false;
  busy=true;
  return true;
}
async function sendChat(room){
  if(room!==activeRoom()||sendingChat)return;
  if(mode!=='online'){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  const revision=roomRevision;
  const lobby=room==='lobby';
  const input=$(lobby?'lobby-chat-input':'chat-input');
  const button=$(lobby?'lobby-send-chat':'send-chat');
  const errorMessage=$('lobby-chat-error');
  const report=message=>{
    if(lobby){errorMessage.textContent=message;errorMessage.hidden=false;}
    else toast(message);
  };
  const original=input.value;
  const text=chatText(original);
  if(!text||[...text].length>CHAT_LIMIT){report('채팅은 1~80자로 입력해 주세요.');return;}
  sendingChat=true;
  if(lobby)errorMessage.hidden=true;
  button.disabled=true;
  let claimed=false;
  try{
    claimed=await claimRoomRequest(revision);
    if(!claimed)return;
    const result=await request('chat',{text},room);
    if(revision!==roomRevision)return;
    setModel(result);
    if(input.value===original){
      input.value='';
      if(!lobby)setChatOpen(false);
    }
  }catch(error){
    if(revision===roomRevision)report(error.message);
  }finally{
    if(claimed)busy=false;
    sendingChat=false;
    if(!lobby)button.disabled=false;
    status();
    if(revision!==roomRevision)queue(0);
  }
}
function line(state=displayedAvailability(),next=inventory?.next){
  const bubble=$('vendor-speech');
  const reopen=$('vendor-reopen');
  bubble.dataset.state=state;
  const badge=$('vendor-soldout');
  badge.hidden=state!=='soldout';
  badge.textContent=soldoutPreview?'미리보기':'완판!';
  reopen.hidden=state!=='soldout'&&state!=='waiting';
  let message;
  if(state==='soldout')message='이건 아닌 거 같아… 벌써 다 팔렸네! 다음 장에 다시 와요!';
  else if(state==='loading')message='매대 상황을 확인하는 중이여.';
  else{
    const lines=state==='waiting'?WAITING_LINES:LINES;
    const choices=lines.filter(text=>text!==lastLine);
    message=choices[Math.floor(Math.random()*choices.length)];
    lastLine=message;
  }
  $('line').textContent='“'+message+'”';
  if(!reopen.hidden)reopen.textContent='다음 장 · '+openingTime.format(next);
  const nextLine=state==='waiting'?' 다른 준비 멘트 듣기':'';
  bubble.setAttribute('aria-label',reopen.hidden?'상인의 다음 멘트 듣기':message+' '+reopen.textContent+nextLine);
}
function nextVendorLine(){
  if(watchingMarket)renderSpectator(true);
  else line();
}
function chime(){
  if(muted)return;
  try{
    audioCtx??=new AudioContext();void audioCtx.resume();
    const t=audioCtx.currentTime;
    for(const [f,d] of [[570,0],[760,.07]]){
      const osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
      osc.type='sine';osc.frequency.value=f;gain.gain.setValueAtTime(.0001,t+d);gain.gain.exponentialRampToValueAtTime(.085,t+d+.02);gain.gain.exponentialRampToValueAtTime(.0001,t+d+.15);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start(t+d);osc.stop(t+d+.16);
    }
  }catch{/* sound is optional */}
}
function queue(ms) {
  if(!endpoint)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(connect,ms);
}
async function connect(){
  if(!endpoint)return;
  if(busy){queue(800);return;}
  if(document.hidden){queue(5000);return;}
  const requestingEntry=entryRequested;
  const room=requestingEntry?'market':activeRoom(), revision=roomRevision;
  queueAdvancePending=false;
  const extra={cancelQueue};
  if(requestingEntry&&!watchingMarket)extra.watch=true;
  busy=true;
  let retryDelay;
  try{
    let data;
    try{data=await request(token?'sync':'join',extra,room);}
    catch(e){if(e.status!==401||revision!==roomRevision)throw e;data=await request('join',extra,room);}
    if(revision!==roomRevision)return;
    const wasWaiting=Boolean(waitingPosition);
    cancelQueue=false;
    waitingPosition=data.queuePosition??0;
    entryRequested=Boolean(waitingPosition);
    if(!enteredMarket&&data.room==='market')showMarket(data);
    else if(enteredMarket&&data.room==='lobby')returnToEntrance(admissionMessage(data));
    else if(!wasWaiting&&waitingPosition){
      openSpectator();
      $('watch-queue-status').focus({preventScroll:true});
    }
    else if(requestingEntry&&data.admission==='closed'){
      setText('entrance-notice',admissionMessage(data));
      $('entrance-notice').hidden=false;
      if(watchingMarket)showWatchFeedback(admissionMessage(data));
    }else if(data.admission==='full'&&!waitingPosition){
      openSpectator(admissionMessage(data));
    }
    mode='online';misses=0;setModel(data);
    if(extra.cancelQueue&&watchingMarket&&!waitingPosition)$('watch-enter').focus({preventScroll:true});
    connectFeed();
  }catch{
    if(revision!==roomRevision)return;
    misses++;
    mode='retry';status();renderShop();
    if(dialog.open&&modal==='profile')renderModal();
    retryDelay=room==='lobby'&&!watchingMarket&&!cancelQueue&&endpoint.startsWith('https://')
      ?Math.min(lobbySyncDelay,30_000*misses):Math.min(15_000,3000*misses);
    if(requestingEntry&&!waitingPosition){
      const message='입장 요청을 다시 연결하고 있어요.';
      setText('entrance-notice',message);
      $('entrance-notice').hidden=false;
      if(watchingMarket)showWatchFeedback(message);
    }
  }finally{
    busy=false;
    let next=lobbySyncDelay;
    if(enteredMarket)next=scheduleAt(Date.now()+timeOffset).open?marketSyncDelay:idleMarketSyncDelay;
    else if((entryRequested||watchingMarket)&&feed?.readyState!==WebSocket.OPEN)next=watchSyncDelay;
    if(waitingPosition&&queueAdvancePending&&!retryDelay)next=0;
    queue(revision===roomRevision?(retryDelay??next):0);
  }
}
async function act(action, extra){
  if((!enteredMarket&&action!=='profile')||acting)return;
  if(!['online','solo'].includes(mode)){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  acting=true;
  const revision=roomRevision, room=activeRoom();
  let claimed=false;
  renderShop();
  if(dialog.open&&modal==='profile')renderModal();
  try{
    claimed=await claimRoomRequest(revision);
    if(!claimed)return;
    const result=mode==='solo'?demo(action,extra):await request(action,extra,room);
    if(revision!==roomRevision)return;
    if(result.event){
      if(action==='profile'&&dialog.open&&modal==='profile')profileFeedback=result.event;
      else if(shop&&action==='buy')$('shop-feedback').textContent=result.event;
      else toast(result.event);
    }
    if(action==='buy'){line();chime();}
    setModel(result);
    if(action==='profile'&&$('new-name'))$('new-name').value=result.player.name;
  }catch(error){
    if(revision!==roomRevision)return;
    if(action==='profile'&&dialog.open&&modal==='profile')profileFeedback=error.message;
    else if(shop&&action==='buy')$('shop-feedback').textContent=error.message;
    else toast(error.message);
    if(mode==='online')queue(250);
  }finally{
    if(claimed)busy=false;
    acting=false;
    if(revision!==roomRevision)queue(0);
    renderShop();
    if(dialog.open)renderModal();
  }
}

document.addEventListener('click', e=>{
  const trade=e.target.closest('[data-trade]');
  const item=e.target.closest('[data-action][data-item]');
  const category=e.target.closest('[data-filter]');
  const tab=e.target.closest('[data-profile-tab]');
  if(trade){
    const type=trade.dataset.trade;
    if(nearby===type||!$('world-error').hidden)openShop(type);
    else toast(type==='scarves'?'스카프 아저씨 앞으로 다가가 보세요.':'잡화점 매대 앞으로 다가가 보세요.');
  }
  if(item)void act(item.dataset.action,{item:item.dataset.item});
  if(category){
    filter=category.dataset.filter;
    $('shop-items').scrollTop=0;
    renderShop();
  }
  if(tab&&profileTab!==tab.dataset.profileTab){
    profileTab=tab.dataset.profileTab;
    renderModal();
  }
  if(e.target.closest('#rotate-avatar')){
    const canvas=$('avatar-preview');
    const turned=canvas.dataset.turned!=='true';
    canvas.dataset.turned=String(turned);
    $('rotate-avatar').setAttribute('aria-pressed',String(turned));
    previewLook();
  }
});
document.addEventListener('change',e=>{
  if(e.target.matches('#profile-form select')){
    if(e.target.name==='character')switchCharacter(e.target.form);
    previewLook();
  }
});
document.addEventListener('input',e=>{
  if(e.target.closest('#profile-form')){
    profileFeedback='';
    $('profile-feedback').textContent='';
  }
});
document.addEventListener('submit', e=>{
  if(e.target.id==='profile-form'){
    e.preventDefault();
    void act('profile',{name:$('new-name').value,look:selectedLook(e.target)});
  }
  if(e.target.id==='chat-form'){e.preventDefault();void sendChat('market');}
  if(e.target.id==='lobby-chat-form'){e.preventDefault();void sendChat('lobby');}
});
for(const id of ['bag-nav','lobby-bag'])$(id).onclick=()=>open('profile','bag');
for(const id of ['rank-nav','lobby-rank'])$(id).onclick=()=>open('rank');
for(const id of ['profile','lobby-profile'])$(id).onclick=()=>open('profile');
$('close-modal').onclick=()=>dialog.close();
dialog.addEventListener('click', e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{modal='';});
$('vendor-speech').onclick=nextVendorLine;
$('soldout-preview').onclick=()=>{
  if(inventory?.testing&&shop==='scarves'&&!acting)setSoldoutPreview(!soldoutPreview);
};
$('sound').onclick=()=>{muted=!muted;$('sound').setAttribute('aria-pressed',String(!muted));$('sound').firstElementChild.dataset.icon=muted?'mute':'sound';icons($('sound'));if(!muted)chime();};
const fullscreen=$('fullscreen');
fullscreen.onclick=async()=>{
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { toast('이 브라우저에서는 골목을 창 크기로 표시해요.'); }
};
document.addEventListener('fullscreenchange',()=>{
  const active=Boolean(document.fullscreenElement);
  fullscreen.setAttribute('aria-pressed',String(active));
  fullscreen.setAttribute('aria-label',active?'전체화면 종료':'전체화면');
  fullscreen.title=fullscreen.getAttribute('aria-label');
  fullscreen.firstElementChild.dataset.icon=active?'collapse':'expand';
  icons(fullscreen);
});
function updateInteract(){
  const interact=$('interact');
  interact.hidden=!nearby;
  interact.querySelector('span').textContent=shop?'상품 목록 닫기':'상품 보기';
  $('stage-hint').hidden=Boolean(nearby);
}
function toggleShop(){
  if(shop)closeShop();
  else if(nearby)openShop(nearby);
}
$('interact').onclick=toggleShop;
$('close-shop').onclick=closeShop;
$('chat-toggle').onclick=()=>setChatOpen($('chat-form').hidden);
$('close-chat').onclick=()=>setChatOpen(false);
$('lobby-chat-toggle').onclick=()=>setLobbyChatOpen($('lobby-chat').hidden);
$('lobby-chat-close').onclick=()=>setLobbyChatOpen(false);
$('exit-market').onclick=()=>returnToEntrance();
const dirMap={w:'w',a:'a',s:'s',d:'d',ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'};
function direction(key){return dirMap[key]??dirMap[key.toLowerCase()];}
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(!enteredMarket){
    if(e.key==='Escape'&&watchingMarket){e.preventDefault();closeSpectator();return;}
    if(e.key==='Escape'&&!$('lobby-chat').hidden&&!dialog.open){e.preventDefault();setLobbyChatOpen(false);}
    return;
  }
  if(e.key==='Escape'&&!$('chat-form').hidden&&!dialog.open){e.preventDefault();setChatOpen(false);return;}
  if(dialog.open||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input, textarea'))return;
  if(e.key==='Enter'&&!e.repeat&&!e.target.closest('button, a')){e.preventDefault();setChatOpen(true);return;}
  const dir=direction(e.key);
  if(dir){e.preventDefault();world?.dir.add(dir);}
  if(e.key.toLowerCase()==='e'&&!e.repeat){e.preventDefault();toggleShop();}
  if(e.key==='Escape'&&shop&&!document.fullscreenElement){e.preventDefault();closeShop();}
});
document.addEventListener('keyup',e=>{const dir=direction(e.key);if(dir)world?.dir.delete(dir);});
window.addEventListener('blur',()=>world?.dir.clear());
document.addEventListener('visibilitychange',()=>{
  world?.dir.clear();
  if(document.hidden)closeFeed();
  else{tick();queue(100);}
});
for(const control of document.querySelectorAll('[data-dir]')){
  control.addEventListener('pointerdown',e=>{
    e.preventDefault();
    control.setPointerCapture(e.pointerId);
    world?.dir.add(control.dataset.dir);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])control.addEventListener(event,()=>world?.dir.delete(control.dataset.dir));
}
function showWorldError(){
  world?.dir.clear();
  closeShop();
  nearby='';
  updateInteract();
  $('world-error').hidden=false;
  $('world-markers').hidden=true;
  $('vendor-marker').hidden=true;
  $('stage-hint').hidden=true;
  if(watchingMarket){
    setWatchPanel(true);
    showWatchFeedback('3D 화면을 열 수 없어 재고 목록을 보여드려요.');
  }
}
try{
  world=createWorld($('world'),{scarves:$('scarf-marker'),junk:$('junk-marker'),speech:$('vendor-speech'),watchSpeech:$('watch-speech'),rare:$('rare-pickups')},type=>{
    nearby=type;
    if(type)openShop(type);
    else closeShop();
    updateInteract();
    if(type==='scarves')line();
  });
  world.setStock(closedStock,1);
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();showWorldError();});
  $('world').addEventListener('webglcontextrestored',()=>location.reload());
}catch(error){
  console.warn('3D 시장 화면:',error.message);showWorldError();
}
function admissionMessage(data){
  return data.admission==='full'?'정원이 가득 찼어요. 구경하며 빈자리를 기다려 주세요.':'장이 닫혔어요. 다음 개장 시각을 확인해 주세요.';
}
function stopWaiting(){
  entryRequested=false;
  waitingPosition=0;
  cancelQueue=true;
  roomRevision++;
  queue(0);
}
function enterMarket(){
  if(waitingPosition){openSpectator();return;}
  if(enteredMarket||entryRequested||cancelQueue)return;
  const session=scheduleAt(Date.now()+timeOffset);
  if(!endpoint){showMarket(session);setModel(demo());return;}
  entryRequested=true;
  roomRevision++;
  $('entrance-notice').hidden=true;
  if(watchingMarket)showWatchFeedback();
  tick();
  queue(0);
}
function showMarket(session){
  if(watchingMarket)closeSpectator();
  if(dialog.open)dialog.close();
  enteredMarket=true;
  roomRevision++;
  closeFeed();
  setLobbyChatOpen(false,false);
  $('entrance-notice').hidden=true;
  $('entrance').hidden=true;
  $('market-ui').hidden=false;
  $('world').removeAttribute('aria-hidden');
  $('stage').focus({preventScroll:true});
  world?.enterMarket();
  world?.setStock(closedStock,session.slot);
}
$('enter-market').onclick=enterMarket;
$('spectate-market').onclick=()=>openSpectator();
$('watch-exit').onclick=closeSpectator;
$('watch-enter').onclick=enterMarket;
$('watch-cancel').onclick=()=>{
  stopWaiting();
  showWatchFeedback('줄서기를 취소했어요. 시장은 계속 구경할 수 있어요.');
  tick();
};
$('watch-wide').onclick=()=>setWatchView('wide');
$('watch-stall').onclick=()=>setWatchView('stall');
$('watch-refresh').onclick=refreshSpectator;
$('watch-stock-toggle').onclick=()=>setWatchPanel($('watch-panel').hidden);
showMarketHours();
tick();
if(endpoint)queue(0);else setModel(demo());
setInterval(tick,500);
setInterval(()=>{if((enteredMarket||watchingMarket)&&!dialog.open&&!document.hidden)nextVendorLine();},15000);
