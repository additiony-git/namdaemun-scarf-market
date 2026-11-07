import { AVATAR_OPTIONS, CHAT_FEED_MS, CHAT_LIMIT, CHAT_MS, CLOTH, DEFAULT_LOOK, JUNK, LINES, MARKET_ITEMS, SCARVES, SPAWN, STOCK, START_MONEY, chatText, dailyRare, marketSession, niceName, normalizeLook, seoulDay, seoulDayStart } from './catalog.mjs';
import { MARKET_API } from './config.mjs';
import { createWorld, drawAvatarPreview } from './world.mjs';

const shapes = {
  store: '<path d="M3 10v10h18V10M2 10l2-6h16l2 6M2 10c1 4 4 4 5 0 1 4 4 4 5 0 1 4 4 4 5 0 1 4 4 4 5 0M9 20v-5h6v5"/>',
  bag: '<path d="M5 8h14l2 13H3L5 8zm4 2V6a3 3 0 0 1 6 0v4"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0V3zM7 5H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4m-5 3v5m-4 2h8"/>',
  user: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 4 5v1"/>',
  down: '<path d="m6 9 6 6 6-6"/>', arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
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
const blank = () => ({ id:'solo', name:'새내기 손님', cash:START_MONEY, collected:0, rank:null });
let token=read(tokenKey), model, world, mode=endpoint?'loading':'solo', modal='', busy=false, timeOffset=0, misses=0, lastPos='', syncTimer;
let muted=true, audioCtx, toastTimer, acting=false;
let profileTab='avatar', profileFeedback='';
let nearby='', shop='', shopSignature='', inventory, feed, retryFeedAt=0, transitionRequested=0;
let soldoutPreview=false, soldoutPreviewTimer;
let lastLine=0, filter='all', sendingChat=false;
const seenChat=new Set();
const products=[...MARKET_ITEMS,...JUNK];
const partLabels={character:'캐릭터',hat:'모자',coat:'옷',bag:'가방',scarf:'목에 두른 스카프'};
const openingTime=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const closedStock=Object.fromEntries(MARKET_ITEMS.map(item=>[item.id,0]));
const dialog=$('modal');
function demo(action='sync', extra={}) {
  let data;
  try {data=JSON.parse(read(demoKey));} catch { /* start fresh */ }
  data ??= { player:blank(), basket:[], round:-1, stock:{...STOCK} };
  const now=Date.now();
  const session=marketSession(now);
  const rare=dailyRare(now).id;
  const day=seoulDay(now);
  if(data.player.name==='새내기 상인')data.player.name='새내기 손님';
  if(session.open&&data.round!==session.round){
    data.round=session.round;
    data.stock={...STOCK};
    data.player.cash=Math.max(data.player.cash,START_MONEY);
  }
  const p=data.player;
  const stock={...STOCK,...data.stock,[rare]:data.rareSoldDay===day?0:1};
  let event;
  if(action==='profile'){
    const name=niceName(extra.name);
    if(!name) throw Error('한 글자 이상 입력해 주세요.');
    const look=normalizeLook(extra.look);
    if(!['classic','none'].includes(look.scarf)&&!data.basket.some(item=>item.item===look.scarf&&item.qty>0)){
      throw Error('장바구니에 있는 스카프만 착용할 수 있어요.');
    }
    p.name=name;
    p.look=look;
    event='프로필을 저장했어요.';
  }
  if(action==='buy'){
    const item=MARKET_ITEMS.find(i=>i.id===extra.item);
    if(!item) throw Error('매대에 없는 물건이에요.');
    if(!session.open)throw Error('장이 닫혔어요. 다음 개장 시간을 확인해 주세요.');
    if(!stock[item.id]) throw Error('이번 장에는 품절이에요. 다음 장을 기다려 주세요.');
    if(p.cash<item.price) throw Error('장터돈이 부족해요. 다음 장이 열리면 예산이 다시 채워져요.');
    stock[item.id]--;
    if(item.rare)data.rareSoldDay=day;
    else data.stock[item.id]--;
    p.cash-=item.price;
    const existing=data.basket.find(i=>i.item===item.id);
    if(existing){existing.qty++;existing.updated=now;}else data.basket.push({item:item.id,qty:1,updated:now});
    data.basket.sort((a,b)=>b.updated-a.updated);
    event=item.name+' 장바구니에 담았어요!';
  }
  p.rank=p.collected?1:null;
  write(demoKey,JSON.stringify(data));
  const used=session.open?CLOTH.reduce((n,item)=>n+item.count-stock[item.id],0)+Number(data.rareSoldDay===day):500;
  const phase=Math.max(session.open?session.round:session.closes/60_000,seoulDayStart(now)/60_000);
  return {...data,...session,rare,stock:session.open?stock:closedStock,
    online:1,peers:[],ranking:p.collected?[p]:[],now,revision:phase*1000+used,event};
}
async function request(action, extra={}){
  const response=await fetch(endpoint,{
    method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({action, token, pos:world?.position()??SPAWN, ...extra}), signal:AbortSignal.timeout(6000),
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
  timeOffset=data.now-Date.now();
  world?.setPeers(data.peers,data.player.id,data.player.look);
  showChat(data.speech);
  for(const peer of data.peers)showChat(peer.speech);
  setInventory(data);
  render();
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
  if(snapshot.testing&&marketSession(snapshot.closes).open)return snapshot.closes;
  return snapshot.next;
}
function playSoldoutEffect(){
  const bubble=$('vendor-speech');
  bubble.classList.remove('soldout-pop');
  requestAnimationFrame(()=>{
    if(displayedAvailability()==='soldout')bubble.classList.add('soldout-pop');
  });
  const next=openingTime.format(nextSaleAt());
  toast((soldoutPreview?'완판 효과 미리보기':'이번 장 완판!')+' · '+next+'에 다시 와요.');
}
function setSoldoutPreview(active){
  clearTimeout(soldoutPreviewTimer);
  soldoutPreview=active;
  if(!active)$('vendor-speech').classList.remove('soldout-pop');
  world?.setStock(active?closedStock:inventory.stock);
  line();
  tick();
  renderShop();
  if(active){
    playSoldoutEffect();
    soldoutPreviewTimer=setTimeout(()=>setSoldoutPreview(false),8000);
  }
}
function setInventory(data){
  if(!data.stock||typeof data.open!=='boolean'||!Number.isSafeInteger(data.revision))return;
  if(inventory&&data.revision<=inventory.revision)return;
  const previous=marketAvailability();
  const previousNext=inventory&&nextSaleAt();
  inventory={stock:data.stock,revision:data.revision,next:data.next,open:data.open,closes:data.closes,testing:Boolean(data.testing),rare:data.rare};
  const current=marketAvailability();
  const becameSoldout=previous==='selling'&&current==='soldout';
  if(soldoutPreview&&(!inventory.testing||becameSoldout))setSoldoutPreview(false);
  world?.setStock(soldoutPreview?closedStock:inventory.stock);
  if(previous!==current||previousNext!==nextSaleAt())line();
  if(becameSoldout)playSoldoutEffect();
  tick();
  renderShop();
}
function showChat(speech){
  if(!speech||typeof speech.text!=='string')return;
  const now=Date.now()+timeOffset;
  const remaining=Math.min(CHAT_MS,speech.expiresAt-now);
  if(remaining>0)world?.showChat(speech,remaining);
  const duration=Math.min(CHAT_FEED_MS,speech.sentAt+CHAT_FEED_MS-now);
  const key=speech.playerId+':'+speech.sentAt;
  if(!(duration>0)||seenChat.has(key))return;
  seenChat.add(key);
  const log=$('chat-feed');
  const row=document.createElement('div');
  const name=document.createElement('b');
  name.textContent=speech.name||model?.peers.find(peer=>peer.id===speech.playerId)?.name||'손님';
  row.classList.toggle('own-message',speech.playerId===model?.player.id);
  row.append(name,document.createTextNode(speech.text));
  log.append(row);
  if(log.children.length>3)log.firstElementChild.remove();
  setTimeout(()=>row.remove(),duration);
  setTimeout(()=>seenChat.delete(key),duration+1000);
}
function connectFeed(){
  if(feed||document.hidden||Date.now()<retryFeedAt||!endpoint.startsWith('https://'))return;
  const url=new URL(endpoint);
  url.protocol='wss:';
  const socket=new WebSocket(url);
  feed=socket;
  socket.onmessage=({data})=>{
    if(feed!==socket)return;
    try {
      const update=JSON.parse(data);
      if(update.type==='chat')showChat(update.speech);
      else setInventory(update);
    } catch { /* wait for the next server sync */ }
  };
  socket.onclose=()=>{
    if(feed!==socket)return;
    feed=null;
    retryFeedAt=Date.now()+10_000;
  };
}
function status() {
  $('live-mode').textContent=mode==='online'?'골목 접속 중':mode==='solo'?'혼자 체험':mode==='loading'?'골목 연결 중':'재연결 중';
  $('live').classList.toggle('offline',mode!=='online');
  $('live').title=mode==='solo'?'이 브라우저에만 기록되는 혼자 체험 모드':mode==='online'?'현재 이 골목에 접속한 상인 수':'온라인 장터 연결 상태';
  $('online').textContent=mode==='online'&&model?format(model.online):mode==='solo'?'1':'–';
}
function tick(){
  if(!inventory)return;
  const transition=inventory.open?inventory.closes:inventory.next;
  const transitionPassed=transition<=Date.now()+timeOffset;
  if(transitionPassed&&mode==='solo'){setModel(demo());return;}
  if(transitionPassed&&mode==='online'&&transitionRequested!==transition){transitionRequested=transition;queue(0);}
  const waiting=!inventory.open||displayedAvailability()==='soldout';
  const deadline=waiting?nextSaleAt():transition;
  const ms=Math.max(0,deadline-Date.now()-timeOffset);
  const seconds=Math.ceil(ms/1000);
  const hours=Math.floor(seconds/3600);
  const minutes=String(Math.floor(seconds/60)%60).padStart(2,'0');
  $('clock-label').textContent=waiting?'다음 장':inventory.testing?'테스트 마감':'장 마감';
  $('countdown').textContent=(hours?hours+':':'')+minutes+':'+String(seconds%60).padStart(2,'0');
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
function itemRow(item, detail, end){
  const picture=item.pattern
    ? '<span class="item-pic" aria-hidden="true"><span class="swatch '+item.pattern+'" style="--cloth:'+item.color+';--ink:'+item.ink+'"></span></span>'
    : '<span class="item-pic" aria-hidden="true">'+item.pic+'</span>';
  const rare=item.rare?'<span class="rare-tag"><span aria-hidden="true">✦</span> 레어</span>':'';
  return '<div class="item'+(item.rare?' rare-item':'')+'">'+picture+'<span class="item-info"><strong>'+item.name+rare+'</strong><small>'+detail+'</small></span>'+end+'</div>';
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
  $('sale-label').textContent=inventory?.testing?'테스트 장 · 선착순 판매':'선착순 판매';
  if(shop==='junk'){
    body.innerHTML='<div class="shop-closed"><span class="closed-tag">OPENING SOON</span><strong>오픈 준비 중</strong><p>진열이 끝나면 잡화점 문을 열어요.</p></div>';
    return;
  }
  if(!model||!inventory){body.innerHTML='<p class="empty">상품을 불러오고 있어요.</p>';return;}
  const signature=[inventory.revision,model.player.cash,mode,acting,filter,soldoutPreview].join(':');
  if(signature===shopSignature)return;
  shopSignature=signature;
  if(!inventory.open){
    body.innerHTML='<div class="shop-closed"><span class="closed-tag">NEXT MARKET</span><strong>다음 장 '+openingTime.format(inventory.next)+'</strong><p>한국 시간 · 오전, 오후, 저녁에 한 번씩 45분 동안 열려요.</p></div>';
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
  const items=(rare?[rare,...CLOTH]:CLOTH).filter(item=>filter==='all'||item.group===filter);
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
function wardrobe(){
  const owned=new Set(model.basket.filter(item=>item.qty>0).map(item=>item.item));
  const scarves={classic:{name:'기본 주홍 스카프'},none:{name:'스카프 없음'}};
  for(const item of SCARVES)if(owned.has(item.id))scarves[item.id]=item;
  const look=normalizeLook(model.player.look);
  const fields=Object.entries({...AVATAR_OPTIONS,scarf:scarves}).map(([part,options])=>{
    const choices=Object.entries(options).map(([id,option])=>'<option value="'+id+'"'+(look[part]===id?' selected':'')+'>'+(option.rare?'✦ 레어 · ':'')+option.name+'</option>').join('');
    return '<label for="look-'+part+'">'+partLabels[part]+'</label><select id="look-'+part+'" name="'+part+'">'+choices+'</select>';
  }).join('');
  return '<form class="profile-form" id="profile-form"><fieldset id="profile-fields"><div class="profile-editor">'+
    '<div class="avatar-card"><canvas id="avatar-preview" width="230" height="230" role="img" aria-label="선택한 캐릭터 미리보기"></canvas>'+
    '<button id="rotate-avatar" class="glass" type="button" aria-pressed="false">'+icon('turn')+' 뒤집어 보기</button></div>'+
    '<div class="profile-choices"><label for="new-name">닉네임</label><input id="new-name" name="name" required maxlength="28" value="'+safe(model.player.name)+'">'+
    fields+'</div></div><p class="modal-note wardrobe-note">장바구니에 있는 스카프도 골라서 착용할 수 있어요.</p>'+
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
async function sendChat(){
  if(sendingChat)return;
  if(mode!=='online'){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  const input=$('chat-input');
  const original=input.value;
  const text=chatText(original);
  if(!text||[...text].length>CHAT_LIMIT){toast('채팅은 1~80자로 입력해 주세요.');return;}
  sendingChat=true;
  $('send-chat').disabled=true;
  try{
    const result=await request('chat',{text});
    showChat(result.speech);
    if(input.value===original){input.value='';setChatOpen(false);}
  }catch(error){
    toast(error.message);
  }finally{
    sendingChat=false;
    $('send-chat').disabled=false;
  }
}
function line(){
  const state=displayedAvailability();
  const bubble=$('vendor-speech');
  const reopen=$('vendor-reopen');
  bubble.dataset.state=state;
  const badge=$('vendor-soldout');
  badge.hidden=state!=='soldout';
  badge.textContent=soldoutPreview?'미리보기':'완판!';
  reopen.hidden=state!=='soldout'&&state!=='waiting';
  let message;
  if(state==='soldout')message='이건 아닌 거 같아… 벌써 다 팔렸네! 다음 장에 다시 와요!';
  else if(state==='waiting')message='지금은 장 준비 중이여. 다음 장에 다시 와요!';
  else{
    lastLine=(lastLine+1+Math.floor(Math.random()*(LINES.length-1)))%LINES.length;
    message=LINES[lastLine];
  }
  $('line').textContent='“'+message+'”';
  if(!reopen.hidden)reopen.textContent='다음 장 · '+openingTime.format(nextSaleAt());
  bubble.setAttribute('aria-label',reopen.hidden?'상인의 다음 멘트 듣기':message+' '+reopen.textContent);
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
function queue(ms) {clearTimeout(syncTimer);syncTimer=setTimeout(connect,ms);}
async function connect(){
  if(!endpoint||mode==='solo')return;
  if(busy){queue(800);return;}
  if(document.hidden&&model){queue(5000);return;}
  busy=true;
  const pos=world?.position()??SPAWN;
  const at=pos.x+','+pos.z;
  let next=3500;
  try{
    let data;
    try{data=await request(token?'sync':'join');}
    catch(e){if(e.status!==401)throw e;data=await request('join');}
    mode='online';misses=0;setModel(data);
    connectFeed();
    if(lastPos!==at||world?.moving()||data.peers.length>0)next=1800;
    if(shop&&feed?.readyState!==WebSocket.OPEN)next=1100;
    lastPos=at;
  }catch{
    misses++;
    mode='retry';status();renderShop();
    if(dialog.open&&modal==='profile')renderModal();
    next=Math.min(15000,3000*misses);
  }finally{busy=false;if(mode!=='solo')queue(next);}
}
async function act(action, extra){
  if(acting)return;
  if(!['online','solo'].includes(mode)){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  acting=true;
  renderShop();
  if(dialog.open&&modal==='profile')renderModal();
  try{
    if(mode==='online'&&busy){await new Promise(resolve=>{const p=setInterval(()=>{if(!busy){clearInterval(p);resolve();}},35);});}
    busy=true;
    const result=mode==='solo'?demo(action,extra):await request(action,extra);
    if(result.event){
      if(action==='profile'&&dialog.open&&modal==='profile')profileFeedback=result.event;
      else if(shop&&action==='buy')$('shop-feedback').textContent=result.event;
      else toast(result.event);
    }
    if(action==='buy'){line();chime();}
    setModel(result);
    if(action==='profile'&&$('new-name'))$('new-name').value=result.player.name;
  }catch(error){
    if(action==='profile'&&dialog.open&&modal==='profile')profileFeedback=error.message;
    else if(shop&&action==='buy')$('shop-feedback').textContent=error.message;
    else toast(error.message);
    if(mode==='online')queue(250);
  }finally{
    busy=false;acting=false;
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
  if(e.target.matches('#profile-form select'))previewLook();
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
  if(e.target.id==='chat-form'){e.preventDefault();void sendChat();}
});
$('bag-nav').onclick=()=>open('profile','bag');
$('rank-nav').onclick=()=>open('rank');
$('profile').onclick=()=>open('profile');
$('close-modal').onclick=()=>dialog.close();
dialog.addEventListener('click', e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{modal='';});
$('vendor-speech').onclick=()=>line();
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
const dirMap={w:'w',a:'a',s:'s',d:'d',ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'};
function direction(key){return dirMap[key]??dirMap[key.toLowerCase()];}
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;
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
  if(document.hidden){
    const socket=feed;
    feed=null;
    socket?.close();
  } else if(mode!=='solo')queue(100);
});
for(const control of document.querySelectorAll('[data-dir]')){
  control.addEventListener('pointerdown',e=>{control.setPointerCapture(e.pointerId);world?.dir.add(control.dataset.dir);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])control.addEventListener(event,()=>world?.dir.delete(control.dataset.dir));
}
function showWorldError(){
  world?.dir.clear();
  closeShop();
  nearby='';
  updateInteract();
  $('world-error').hidden=false;
  $('world-markers').hidden=true;
  $('stage-hint').hidden=true;
}
try{
  world=createWorld($('world'),{scarves:$('scarf-marker'),junk:$('junk-marker'),speech:$('vendor-speech')},type=>{
    nearby=type;
    if(type)openShop(type);
    else closeShop();
    updateInteract();
    if(type==='scarves')line();
    if(mode==='online'&&feed?.readyState!==WebSocket.OPEN)queue(0);
  });
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();showWorldError();});
  $('world').addEventListener('webglcontextrestored',()=>location.reload());
}catch(error){
  console.warn('3D 시장 화면:',error.message);showWorldError();
}
if(endpoint)void connect();else setModel(demo());
setInterval(tick,500);
setInterval(()=>{if(!dialog.open&&!document.hidden)line();},15000);
