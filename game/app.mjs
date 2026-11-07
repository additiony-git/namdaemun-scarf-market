import { CLOTH, JUNK, JUNK_LINES, LINES, SPAWN, STOCK, STOCK_TOTAL, START_MONEY, nextRound, niceName, roundAt } from './catalog.mjs';
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
const blank = () => ({ id:'solo', name:'새내기 상인', cash:START_MONEY, sold:0, collected:0, rank:null });
let token=read(tokenKey), model, world, mode=endpoint?'loading':'solo', modal='', busy=false, timeOffset=0, misses=0, lastPos='', syncTimer;
let muted=true, audioCtx, toastTimer, lastLine=0, tradeFeedback='';
const dialog=$('modal');
function demo(action='sync', extra={}) {
  let data;
  try {data=JSON.parse(read(demoKey));} catch { /* start fresh */ }
  data ??= { player:blank(), basket:[], round:-1, stock:{...STOCK} };
  const now=Date.now();
  if(data.round!==roundAt(now)){data.round=roundAt(now);data.stock={...STOCK};}
  const p=data.player;
  let event;
  if(action==='rename'){
    const name=niceName(extra.name);
    if(!name) throw Error('한 글자 이상 입력해 주세요.');
    p.name=name;event='간판에 새 닉네임을 걸었어요.';
  }
  if(action==='sell'){
    const item=CLOTH.find(i=>i.id===extra.item);
    if(!item||!data.stock[item.id]) throw Error('이번 회차는 품절이에요. 다음 입고를 기다려 주세요.');
    data.stock[item.id]--;p.sold++;p.cash+=item.price;
    event=item.name+' 판매! +'+format(item.price)+'원';
  }
  if(action==='buy'){
    const item=JUNK.find(i=>i.id===extra.item);
    if(!item||p.cash<item.price) throw Error('장터돈이 부족해요. 스카프나 손수건을 먼저 팔아 보세요.');
    p.cash-=item.price;p.collected++;
    const existing=data.basket.find(i=>i.item===item.id);
    if(existing){existing.qty++;existing.updated=now;}else data.basket.push({item:item.id,qty:1,updated:now});
    data.basket.sort((a,b)=>b.updated-a.updated);
    event=item.name+' 장바구니에 담았어요!';
  }
  p.rank=p.collected?1:null;
  write(demoKey,JSON.stringify(data));
  return {...data, online:1, peers:[], ranking:p.collected?[p]:[], now, next:nextRound(now), event};
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
  model=data;timeOffset=data.now-Date.now();world?.setPeers(data.peers);
  render();
}
function status() {
  $('live-mode').textContent=mode==='online'?'장터 영업 중':mode==='solo'?'혼자 체험':mode==='loading'?'장터 연결 중':'재연결 중';
  $('live').classList.toggle('offline',mode!=='online');
  $('live').title=mode==='solo'?'이 브라우저에만 기록되는 혼자 체험 모드':mode==='online'?'현재 이 골목에 접속한 상인 수':'온라인 장터 연결 상태';
  $('online').textContent=mode==='online'&&model?format(model.online):mode==='solo'?'1':'–';
}
function tick(){
  if(!model)return;
  if(mode==='solo'&&model.next<=Date.now()){setModel(demo());return;}
  const ms=Math.max(0,model.next-Date.now()-timeOffset), s=Math.ceil(ms/1000);
  $('countdown').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function rankRows(list, fill=false){
  return list.map((p,i)=>'<li class="rank-row"><span class="rank-pos">'+(i+1)+'</span><span class="rank-face">'+icon('user')+'</span><span class="rank-name">'+safe(p.name)+(p.id===model.player.id?'<small>나</small>':'')+'</span><span class="rank-num">'+format(p.collected)+'<small> 개</small></span></li>').join('')+
    (fill?Array.from({length:Math.max(0,3-list.length)},(_,i)=>'<li class="rank-row"><span class="rank-pos">'+(list.length+i+1)+'</span><span class="rank-face">'+icon('user')+'</span><span class="rank-name" style="color:var(--muted)">빈 자리</span><span class="rank-num">–</span></li>').join(''):'');
}
function render(){
  if(!model){status();return;}
  const {player:p,stock,ranking}=model;
  $('nickname').textContent=p.name;
  $('balance').textContent=format(p.cash);
  $('sold').innerHTML=format(p.sold)+'<small> 개</small>';
  $('collected').innerHTML=format(p.collected)+'<small> 개</small>';
  const total=stock.scarf+stock.hanky;
  $('stock-n').textContent=total+' / '+STOCK_TOTAL;
  const percent=Math.round(total/STOCK_TOTAL*100);
  $('meter').style.width=percent+'%';
  $('meter').parentElement.setAttribute('aria-valuenow',percent);
  $('rank-list').innerHTML=rankRows(ranking.slice(0,3),true);icons($('rank-list'));
  status();tick();
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
  for(const [tab,t] of [['market-nav','scarves'],['bag-nav','bag'],['rank-nav','rank']])$(tab).classList.toggle('current',type===t||(tab==='market-nav'&&!['bag','rank'].includes(type)));
  renderModal();
  if(!dialog.open)dialog.showModal();
}
function itemRow(item, detail, end){
  return '<div class="item"><span class="item-pic" aria-hidden="true">'+item.pic+'</span><span class="item-info"><strong>'+item.name+'</strong><small>'+detail+'</small></span>'+end+'</div>';
}
function renderModal(){
  const body=$('modal-body');
  const focus=document.activeElement?.dataset.item;
  const wait=acting||!['online','solo'].includes(mode);
  if(!model&&modal!=='profile'){body.innerHTML='<p class="empty">장터에 연결하고 있어요.</p>';return;}
  if(modal==='scarves'){
    body.innerHTML='<p class="modal-note">손님에게 한 장씩 팔아 장터돈을 벌어요. '+(mode==='solo'?'체험 재고는':'모든 상인이 공유하는 재고는')+' 10분마다 새로 들어와요.</p>'+
      CLOTH.map(item=>itemRow(item,item.detail+' · '+model.stock[item.id]+'장 남음',
        '<span class="item-price">+'+format(item.price)+'원</span><button class="primary" data-item="'+item.id+'" data-action="sell" aria-label="'+item.name+' 팔기" '+(wait||!model.stock[item.id]?'disabled':'')+'>'+(model.stock[item.id]?'팔기':'품절')+'</button>')).join('');
  } else if(modal==='junk'){
    body.innerHTML='<p class="modal-note">잔액 '+format(model.player.cash)+'원 · 무엇을 사든 한 개씩 수집 점수가 올라가요.</p>'+
      JUNK.map(item=>itemRow(item,item.detail,
        '<span class="item-price">'+format(item.price)+'원</span><button class="primary" data-item="'+item.id+'" data-action="buy" aria-label="'+item.name+' 사기" '+(wait||model.player.cash<item.price?'disabled':'')+'>사기</button>')).join('');
  } else if(modal==='bag'){
    body.innerHTML='<p class="modal-note">내가 사 모은 물건 '+format(model.player.collected)+'개</p>'+(
      model.basket.length?model.basket.map(entry=>{
        const item=JUNK.find(i=>i.id===entry.item);
        if(!item)return '';
        const date=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(entry.updated);
        return itemRow(item,'마지막 구매 · '+date,'<span class="item-price">'+format(entry.qty)+'개</span>');
      }).join(''):'<div class="empty">아직 빈 장바구니예요. 잡화점에서 첫 물건을 골라보세요.</div><button class="primary" data-trade="junk">잡화점 가기</button>');
  } else if(modal==='rank'){
    const p=model.player;
    body.innerHTML='<p class="modal-note">'+(mode==='solo'?'혼자 체험 기록입니다. ':'장터 상위 30명 · ')+'잡화가 많을수록, 동점이면 해당 수량에 먼저 도달한 순서로 앞서요.</p>'+
      (model.ranking.length?'<ol class="rank-list">'+rankRows(model.ranking)+'</ol>':'<div class="empty">아직 수집 기록이 없어요. 첫 수집왕에 도전하세요!</div>')+
      (p.rank?'<p class="modal-note" style="margin-top:10px">내 순위: '+p.rank+'위 · '+format(p.collected)+'개</p>':'');
  } else if(modal==='profile'){
    body.innerHTML='<p class="modal-note">이 이름이 골목과 랭킹에 표시됩니다.</p><form class="profile-form" id="rename-form"><label for="new-name">닉네임</label><div><input id="new-name" required maxlength="28" value="'+safe(model?.player.name??'새내기 상인')+'"><button class="primary" type="submit">저장</button></div></form>';
  }
  if(['scarves','junk','profile'].includes(modal))body.insertAdjacentHTML('beforeend','<p class="dialog-feedback" role="status">'+safe(tradeFeedback)+'</p>');
  icons(body);
  if(focus)body.querySelector('[data-item="'+focus+'"]:not(:disabled)')?.focus({preventScroll:true});
}
function toast(message){
  clearTimeout(toastTimer);
  $('toast').textContent=message;$('toast').classList.add('show');
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2900);
}
function line(junk=false){
  const source=junk?JUNK_LINES:LINES;
  const pos=(lastLine+1+Math.floor(Math.random()*(source.length-1)))%source.length;lastLine=pos;
  const copy=document.querySelector('.vendor-copy');
  copy.querySelector('strong').textContent=junk?'잡화점 이모':'스카프 아저씨';
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
    if(lastPos!==at||world?.moving()||data.peers.length>0)next=1800;
    lastPos=at;
  }catch{
    misses++;
    mode='retry';status();if(dialog.open&&modal!=='profile')renderModal();
    next=Math.min(15000,3000*misses);
  }finally{busy=false;if(mode!=='solo')queue(next);}
}
let acting=false;
async function act(action, extra){
  if(acting)return;
  if(!['online','solo'].includes(mode)){toast('장터에 연결한 뒤 다시 시도해 주세요.');return;}
  acting=true;
  try{
    if(mode==='online'&&busy){await new Promise(resolve=>{const p=setInterval(()=>{if(!busy){clearInterval(p);resolve();}},35);});}
    busy=true;
    if(modal!=='profile'&&dialog.open)renderModal();
    const result=mode==='solo'?demo(action,extra):await request(action,extra);
    if(result.event){tradeFeedback=result.event;toast(result.event);}
    if(action==='sell'||action==='buy'){line(action==='buy');chime();}
    setModel(result);
    if(action==='rename')dialog.close();
  }catch(error){
    tradeFeedback=error.message;toast(error.message);
    if(mode==='online')queue(250);
  }finally{
    busy=false;acting=false;
    if(dialog.open&&modal!=='profile')renderModal();
    else if(dialog.open){const feedback=$('modal-body').querySelector('.dialog-feedback');if(feedback)feedback.textContent=tradeFeedback;}
  }
}

document.addEventListener('click', e=>{
  const trade=e.target.closest('[data-trade]');
  const item=e.target.closest('[data-action][data-item]');
  if(trade){open(trade.dataset.trade);line(trade.dataset.trade==='junk');}
  if(item)void act(item.dataset.action,{item:item.dataset.item});
});
document.addEventListener('submit', e=>{
  if(e.target.id==='rename-form'){e.preventDefault();void act('rename',{name:$('new-name').value});}
});
$('market-nav').onclick=()=>$('stage').scrollIntoView({block:'nearest',behavior:'smooth'});
$('bag-nav').onclick=()=>open('bag');
$('rank-nav').onclick=$('all-ranks').onclick=()=>open('rank');
$('profile').onclick=()=>open('profile');
$('close-modal').onclick=()=>dialog.close();
dialog.addEventListener('click', e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>{
  modal='';for(const id of ['market-nav','bag-nav','rank-nav'])$(id).classList.toggle('current',id==='market-nav');
});
$('next-line').onclick=()=>line(document.querySelector('.vendor-copy strong').textContent==='잡화점 이모');
$('sound').onclick=()=>{muted=!muted;$('sound').setAttribute('aria-pressed',String(!muted));$('sound').firstElementChild.dataset.icon=muted?'mute':'sound';icons($('sound'));if(!muted)chime();};
$('zoom').onclick=()=>{const zoom=world?.toggleZoom()??false;$('zoom').setAttribute('aria-pressed',String(zoom));$('zoom').firstElementChild.dataset.icon=zoom?'collapse':'expand';icons($('zoom'));};
const dirMap={w:'w',a:'a',s:'s',d:'d',ArrowUp:'w',ArrowDown:'s',ArrowLeft:'a',ArrowRight:'d'};
function direction(key){return dirMap[key]??dirMap[key.toLowerCase()];}
document.addEventListener('keydown',e=>{
  if(dialog.open||e.ctrlKey||e.metaKey||e.altKey||e.target.matches('input, textarea'))return;
  const dir=direction(e.key);
  if(dir){e.preventDefault();world?.dir.add(dir);}
  if(e.key.toLowerCase()==='e'&&!e.repeat){e.preventDefault();$('interact').click();}
});
document.addEventListener('keyup',e=>{const dir=direction(e.key);if(dir)world?.dir.delete(dir);});
window.addEventListener('blur',()=>world?.dir.clear());
document.addEventListener('visibilitychange',()=>{world?.dir.clear();if(!document.hidden&&mode!=='solo')queue(100);});
for(const control of document.querySelectorAll('[data-dir]')){
  control.addEventListener('pointerdown',e=>{control.setPointerCapture(e.pointerId);world?.dir.add(control.dataset.dir);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])control.addEventListener(event,()=>world?.dir.delete(control.dataset.dir));
}
try{
  world=createWorld($('world'),{scarves:$('scarf-marker'),junk:$('junk-marker')},type=>{
    $('interact').dataset.trade=type;$('interact').querySelector('span').textContent=(type==='scarves'?'스카프 매대':'잡화점')+' 거래하기';
  });
  $('world').addEventListener('webglcontextlost',e=>{e.preventDefault();$('world-error').hidden=false;$('world-markers').hidden=true;});
  $('world').addEventListener('webglcontextrestored',()=>location.reload());
}catch(error){
  console.warn('3D 시장 화면:',error.message);$('world-error').hidden=false;$('world-markers').hidden=true;$('zoom').disabled=true;
}
if(endpoint)void connect();else setModel(demo());
setInterval(tick,500);
setInterval(()=>{if(!dialog.open&&!document.hidden)line(document.querySelector('.vendor-copy strong').textContent==='잡화점 이모');},18000);
