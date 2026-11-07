import { CLOTH, JUNK, JUNK_LINES, JUNK_STOCK, LINES, SPAWN, STOCK, START_MONEY, nextRound, niceName, roundAt } from './catalog.mjs';
import { MARKET_API } from './config.mjs';
import { createWorld } from './world.mjs';

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
let muted=true, audioCtx, toastTimer, tradeFeedback='', acting=false;
let nearby='', shop='', shopSignature='', inventory, feed, retryFeedAt=0, refillRequested=0;
const lastLine={scarves:0,junk:-1};
const products=[...CLOTH,...JUNK];
const dialog=$('modal');
function demo(action='sync', extra={}) {
  let data;
  try {data=JSON.parse(read(demoKey));} catch { /* start fresh */ }
  data ??= { player:blank(), basket:[], round:-1, stock:{...STOCK} };
  if(!data.goods&&data.player.name==='새내기 상인')data.player.name='새내기 손님';
  const now=Date.now();
  if(data.round!==roundAt(now)){
    data.round=roundAt(now);
    data.stock={...STOCK};
    data.goods={...JUNK_STOCK};
    data.player.cash=Math.max(data.player.cash,START_MONEY);
  }
  data.goods??={...JUNK_STOCK};
  const p=data.player;
  let event;
  if(action==='rename'){
    const name=niceName(extra.name);
    if(!name) throw Error('한 글자 이상 입력해 주세요.');
    p.name=name;event='간판에 새 닉네임을 걸었어요.';
  }
  if(action==='buy'){
    const item=products.find(i=>i.id===extra.item);
    if(!item) throw Error('매대에 없는 물건이에요.');
    const cloth=item.id in STOCK;
    const counts=cloth ? data.stock : data.goods;
    if(!counts[item.id]) throw Error('이번 회차는 품절이에요. 다음 입고를 기다려 주세요.');
    if(p.cash<item.price) throw Error('장터돈이 부족해요. 다음 입고 때 장보기 예산이 다시 채워져요.');
    counts[item.id]--;
    p.cash-=item.price;
    if(!cloth)p.collected++;
    const existing=data.basket.find(i=>i.item===item.id);
    if(existing){existing.qty++;existing.updated=now;}else data.basket.push({item:item.id,qty:1,updated:now});
    data.basket.sort((a,b)=>b.updated-a.updated);
    event=item.name+' 장바구니에 담았어요!';
  }
  p.rank=p.collected?1:null;
  write(demoKey,JSON.stringify(data));
  const used=products.reduce((n,item)=>n+(STOCK[item.id]??JUNK_STOCK[item.id])-(data.stock[item.id]??data.goods[item.id]),0);
  return {...data, online:1, peers:[], ranking:p.collected?[p]:[], now, next:nextRound(now), revision:data.round*1000+used, event};
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
  world?.setPeers(data.peers);
  setInventory(data);
  render();
}
function setInventory(data){
  if(!data.stock||!data.goods||!Number.isSafeInteger(data.revision))return;
  if(inventory&&data.revision<=inventory.revision)return;
  inventory={stock:data.stock,goods:data.goods,revision:data.revision,next:data.next};
  world?.setStock(inventory.stock,inventory.goods);
  renderShop();
}
function connectFeed(){
  if(feed||document.hidden||Date.now()<retryFeedAt||!endpoint.startsWith('https://'))return;
  const url=new URL(endpoint);
  url.protocol='wss:';
  const socket=new WebSocket(url);
  feed=socket;
  socket.onmessage=({data})=>{
    if(feed!==socket)return;
    try { setInventory(JSON.parse(data)); } catch { /* wait for the next server sync */ }
  };
  socket.onclose=()=>{
    if(feed!==socket)return;
    feed=null;
    retryFeedAt=Date.now()+10_000;
  };
}
function status() {
  $('live-mode').textContent=mode==='online'?'장터 영업 중':mode==='solo'?'혼자 체험':mode==='loading'?'장터 연결 중':'재연결 중';
  $('live').classList.toggle('offline',mode!=='online');
  $('live').title=mode==='solo'?'이 브라우저에만 기록되는 혼자 체험 모드':mode==='online'?'현재 이 골목에 접속한 상인 수':'온라인 장터 연결 상태';
  $('online').textContent=mode==='online'&&model?format(model.online):mode==='solo'?'1':'–';
}
function tick(){
  if(!model)return;
  const next=inventory?.next??model.next;
  if(mode==='solo'&&next<=Date.now()){setModel(demo());return;}
  const ms=Math.max(0,next-Date.now()-timeOffset), s=Math.ceil(ms/1000);
  if(!ms&&mode==='online'&&refillRequested!==next){refillRequested=next;queue(0);}
  $('countdown').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
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
  if(dialog.open&&modal!=='profile')renderModal();
}
function modalInfo(type){
  return ({
    scarves:['01 · SCARF STALL','스카프 매대'],
    junk:['02 · ODD GOODS','쓸데없는 잡화점'],
    bag:['MY COLLECTION','내 장바구니'],
    rank:['MARKET RANKING','쓸모없는 수집왕'],
    profile:['MY STALL','닉네임 바꾸기'],
  })[type];
}
function open(type){
  modal=type;tradeFeedback='';world?.dir.clear();
  const [label,title]=modalInfo(type);
  $('modal-kicker').textContent=label;$('modal-title').textContent=title;
  renderModal();
  if(!dialog.open)dialog.showModal();
}
function itemRow(item, detail, end){
  return '<div class="item"><span class="item-pic" aria-hidden="true">'+item.pic+'</span><span class="item-info"><strong>'+item.name+'</strong><small>'+detail+'</small></span>'+end+'</div>';
}
function openShop(type){
  shop=type;
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
  world?.focusShop(false);
  updateInteract();
}
function renderShop(){
  if(!shop)return;
  const body=$('shop-items');
  if(!model||!inventory){body.innerHTML='<p class="empty">상품을 불러오고 있어요.</p>';return;}
  const signature=[shop,inventory.revision,model.player.cash,mode,acting].join(':');
  if(signature===shopSignature)return;
  shopSignature=signature;
  const cloth=shop==='scarves';
  const counts=cloth?inventory.stock:inventory.goods;
  const items=cloth?CLOTH:JUNK;
  const total=items.reduce((sum,item)=>sum+counts[item.id],0);
  $('shop-stock').textContent='남은 상품 '+total+'개';
  const active=body.contains(document.activeElement)?document.activeElement.dataset:null;
  const canTrade=!acting&&['online','solo'].includes(mode);
  body.innerHTML=items.filter(item=>counts[item.id]>0).map(item=>{
    const affordable=model.player.cash>=item.price;
    const buy='<button class="primary" data-item="'+item.id+'" data-action="buy" aria-label="'+item.name+' 사기" '+(!canTrade||!affordable?'disabled':'')+'>'+format(item.price)+'원 '+(affordable?'사기':'예산 부족')+'</button>';
    return itemRow(item,counts[item.id]+(cloth?'장':'개')+' 남음 · '+item.detail,buy);
  }).join('')||'<p class="empty">이번 회차 상품이 모두 나갔어요.</p>';
  if(active?.item)body.querySelector('[data-item="'+active.item+'"][data-action="'+active.action+'"]:not(:disabled)')?.focus({preventScroll:true});
}
function renderModal(){
  const body=$('modal-body');
  if(!model&&modal!=='profile'){body.innerHTML='<p class="empty">장터에 연결하고 있어요.</p>';return;}
  if(modal==='bag'){
    const total=model.basket.reduce((sum,item)=>sum+item.qty,0);
    body.innerHTML='<p class="modal-note">구매한 물건 '+format(total)+'개 · 랭킹에 들어가는 잡화 '+format(model.player.collected)+'개</p>'+(
      model.basket.length?model.basket.map(entry=>{
        const item=products.find(i=>i.id===entry.item);
        if(!item)return '';
        const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(entry.updated);
        return itemRow(item,'마지막 구매 · '+date,'<span class="item-price">'+format(entry.qty)+'개</span>');
      }).join(''):'<div class="empty">아직 빈 장바구니예요. 매대에서 첫 물건을 골라보세요.</div>');
  } else if(modal==='rank'){
    const p=model.player;
    body.innerHTML='<p class="modal-note">'+(mode==='solo'?'혼자 체험 기록입니다. ':'장터 상위 30명 · ')+'잡화가 많을수록, 동점이면 해당 수량에 먼저 도달한 순서로 앞서요.</p>'+
      (model.ranking.length?'<ol class="rank-list">'+rankRows(model.ranking)+'</ol>':'<div class="empty">아직 수집 기록이 없어요. 첫 수집왕에 도전하세요!</div>')+
      (p.rank?'<p class="modal-note" style="margin-top:10px">내 순위: '+p.rank+'위 · '+format(p.collected)+'개</p>':'');
  } else if(modal==='profile'){
    body.innerHTML='<p class="modal-note">이 이름이 골목과 랭킹에 표시됩니다.</p><form class="profile-form" id="rename-form"><label for="new-name">닉네임</label><div><input id="new-name" required maxlength="28" value="'+safe(model?.player.name??'새내기 손님')+'"><button class="primary" type="submit">저장</button></div></form>';
  }
  if(modal==='profile')body.insertAdjacentHTML('beforeend','<p class="dialog-feedback" role="status">'+safe(tradeFeedback)+'</p>');
  icons(body);
}
function toast(message){
  clearTimeout(toastTimer);
  $('toast').textContent=message;$('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2900);
}
function line(stall=nearby||'scarves'){
  const junk=stall==='junk';
  const source=junk?JUNK_LINES:LINES;
  const pos=(lastLine[stall]+1+Math.floor(Math.random()*(source.length-1)))%source.length;
  lastLine[stall]=pos;
  $('vendor-name').textContent=junk?'잡화점 이모':'스카프 아저씨';
  $('vendor-avatar').hidden=junk;
  $('line').textContent='“'+source[pos]+'”';
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
    next=Math.min(15000,3000*misses);
  }finally{busy=false;if(mode!=='solo')queue(next);}
}
async function act(action, extra){
  if(acting)return;
  if(!['online','solo'].includes(mode)){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  acting=true;
  renderShop();
  try{
    if(mode==='online'&&busy){await new Promise(resolve=>{const p=setInterval(()=>{if(!busy){clearInterval(p);resolve();}},35);});}
    busy=true;
    const result=mode==='solo'?demo(action,extra):await request(action,extra);
    if(result.event){
      tradeFeedback=result.event;
      if(shop&&action!=='rename')$('shop-feedback').textContent=result.event;
      else toast(result.event);
    }
    if(action==='buy'){line(extra.item in STOCK?'scarves':'junk');chime();}
    setModel(result);
    if(action==='rename')dialog.close();
  }catch(error){
    tradeFeedback=error.message;
    if(shop&&action!=='rename')$('shop-feedback').textContent=error.message;
    else toast(error.message);
    if(mode==='online')queue(250);
  }finally{
    busy=false;acting=false;
    renderShop();
    if(dialog.open&&modal!=='profile')renderModal();
    else if(dialog.open){const feedback=$('modal-body').querySelector('.dialog-feedback');if(feedback)feedback.textContent=tradeFeedback;}
  }
}

document.addEventListener('click', e=>{
  const trade=e.target.closest('[data-trade]');
  const item=e.target.closest('[data-action][data-item]');
  if(trade){
    const type=trade.dataset.trade;
    if(nearby===type||!$('world-error').hidden)openShop(type);
    else toast(type==='scarves'?'스카프 아저씨 앞으로 다가가 보세요.':'잡화점 매대 앞으로 다가가 보세요.');
  }
  if(item)void act(item.dataset.action,{item:item.dataset.item});
});
document.addEventListener('submit', e=>{
  if(e.target.id==='rename-form'){e.preventDefault();void act('rename',{name:$('new-name').value});}
});
$('bag-nav').onclick=()=>open('bag');
$('rank-nav').onclick=()=>open('rank');
$('profile').onclick=()=>open('profile');
$('close-modal').onclick=()=>dialog.close();
dialog.addEventListener('click', e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{modal='';});
$('vendor-speech').onclick=()=>line();
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
const dirMap={w:'w',a:'a',s:'s',d:'d',ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'};
function direction(key){return dirMap[key]??dirMap[key.toLowerCase()];}
document.addEventListener('keydown',e=>{
  if(dialog.open||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input, textarea'))return;
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
    line();
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
