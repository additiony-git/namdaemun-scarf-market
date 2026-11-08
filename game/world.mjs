import { AVATAR_OPTIONS, DEFAULT_LOOK, MAP, RARE_SCARVES, SCARF_STALL, SCARVES, SHOP_RADIUS, SPAWN, normalizeLook, roundCloth } from './catalog.mjs';

const ground = -0.09;
const hex = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = a => a.map(v => v/(Math.hypot(...a)||1));
const scaled = (a,k) => a.map(v => v*k);
const fade = (a,b,t) => a+(b-a)*t;
const unitLight = norm([-0.58, 1, 0.72]);
const eye = norm([6.4, 10.8, 16.8]);
const right = norm(cross([0,1,0], eye));
const up = cross(eye, right);
const T = (x=0,y=0,z=0,a=0) => (u,v,w) => [x+Math.cos(a)*u+Math.sin(a)*w,y+v,z-Math.sin(a)*u+Math.cos(a)*w];
const I = T();
const scarfCounter = T(-1.72, 0, -3.26);
const vendorPosition = [-2.06, 0, -.94];
const cloths = ['e68176','e6bc7b','c95a48','71949a','a798be','78a49e','e5ccac','af715e','eed0ac','686c90'];
const brick = ['856253','916b58','9d7661','96735e','8c6a57','a67a60','986a55','aa846b','aa8067','896254'];
const sideBrick = ['a56f56','aa785e','946b62','81594d','b18364'];
let randomSeed = 4937;
function rnd(){ randomSeed = (Math.imul(randomSeed,1664525)+1013904223)|0;return (randomSeed>>>0)/4294967296; }
const pick = arr => arr[Math.floor(rnd()*arr.length)];
function walkable(x,z){
  if(x<MAP.minX||x>MAP.maxX||z<MAP.minZ||z>MAP.maxZ)return false;
  const a=-.43,c=Math.cos(a),s=Math.sin(a),dx=x-4.92,dz=z+.38;
  const u=c*dx-s*dz,v=s*dx+c*dz;
  return Math.abs(u)>2.01||v>1.76||v< -3.6;
}

class Mesh {
  constructor(){this.data=[];}
  face(points,color,lit=true) {
    const n = norm(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    const k = lit ? .67 + Math.max(0,dot(unitLight,n))*.36 + Math.max(0,n[1])*.07 : 1;
    const rgb=scaled(typeof color==='string'?hex(color):color,k);
    for(let i=1;i<points.length-1;i++) for(const p of [points[0],points[i],points[i+1]]) this.data.push(...p,...rgb);
  }
  box(tr,x,y,z,w,h,d,c){
    const a=tr(x-w/2,y,z-d/2), b=tr(x+w/2,y,z-d/2), p=tr(x+w/2,y,z+d/2), q=tr(x-w/2,y,z+d/2);
    const A=tr(x-w/2,y+h,z-d/2), B=tr(x+w/2,y+h,z-d/2), P=tr(x+w/2,y+h,z+d/2), Q=tr(x-w/2,y+h,z+d/2);
    this.face([Q,P,B,A],c);this.face([q,p,P,Q],c);this.face([p,b,B,P],c);this.face([a,q,Q,A],c);this.face([b,a,A,B],c);
  }
  segment(a,b,size,c){
    const v=norm(sub(b,a)), x=scaled(norm(cross(v,Math.abs(v[1])>.97?[0,0,1]:[0,1,0])),size/2), z=scaled(cross(x,v),size/2);
    const base=[[-1,-1],[1,-1],[1,1],[-1,1]];
    const ends = [a,b].map(p=>base.map(([i,j])=>p.map((n,k)=>n+x[k]*i+z[k]*j)));
    for(let i=0;i<4;i++) { const j=(i+1)%4;this.face([ends[0][i],ends[0][j],ends[1][j],ends[1][i]],c); }
  }
  disc(x,y,z,rx,rz,c){ this.face(Array.from({length:18},(_,i)=>{const a=i/-18*Math.PI*2;return [x+rx*Math.cos(a),y,z+rz*Math.sin(a)];}),c,false); }
  gem(tr,x,y,z,r,c){
    const p=tr(x,y+r,z), q=tr(x,y-r,z);
    const sides = [tr(x-r,y,z),tr(x,y,z+r),tr(x+r,y,z),tr(x,y,z-r)];
    sides.forEach((a,i)=>{const b=sides[(i+1)%4];this.face([p,a,b],c,false);this.face([q,b,a],c,false);});
  }
}

function character(m, x,z,angle, coat, type, phase=0, look=DEFAULT_LOOK) {
  const t=T(x,0,z,angle), walk=Math.sin(phase)*.16, skin=type===2?'c98a69':'dda074';
  const female=type===0&&look.character==='female';
  const male=type===0&&!female, arm=female?.255:male?.297:.28;
  const pants=female?'51434c':'3f3940';
  m.disc(x,.012,z,.38,.25,'60463e');
  m.box(t,-.13,0,walk,.17,.34,.19,pants);m.box(t,.13,0,-walk,.17,.34,.19,pants);
  m.box(t,-.13,0,.045+walk,.2,.09,.26,'27282e');m.box(t,.13,0,.045-walk,.2,.09,.26,'27282e');
  m.box(t,0,.31,0,female?.425:male?.495:.47,.48,.29,coat);
  m.box(t,-arm,.39,-walk,.13,.37,.16,coat);m.box(t,arm,.39,walk,.13,.37,.16,coat);
  m.box(t,-arm,.32,-walk,.115,.09,.14,skin);m.box(t,arm,.32,walk,.115,.09,.14,skin);
  m.box(t,0,.76,0,male?.36:.335,.34,.295,skin);m.box(t,0,.97,-.10,.35,.12,.125,'44302a');
  m.box(t,-.074,.902,.15,.033,.026,.014,'392927');m.box(t,.074,.902,.15,.033,.026,.014,'392927');
  if(male){
    for(const x of [-.075,.075])m.box(t,x,.954,.15,.064,.023,.014,'4b3328');
    m.box(t,0,.825,.15,.07,.016,.012,'a56551');
    for(const x of [-.177,.177])m.box(t,x,.955,-.044,.032,.094,.1,'44302a');
  }
  if(female){
    m.box(t,0,.87,-.115,.366,.235,.12,'49332d');
    m.box(t,-.156,.83,-.015,.064,.22,.20,'553932');
    m.box(t,.156,.86,-.044,.065,.18,.16,'553932');
    m.box(t,.07,.694,-.225,.125,.263,.135,'49332d');
    m.box(t,.07,.901,-.214,.139,.042,.142,'be8d69');
    m.box(t,-.062,.99,.095,.212,.055,.125,'553932');
    m.box(t,.025,.831,.15,.056,.018,.012,'a75e54');
  }
  if (type===0) {
    dressVisitor(m,t,look,walk);
  } else {
    m.box(t,0,1.025,0,.39,.135,.335,type===1?'332e2c':'9f5956');
    m.box(t,0,1.019,.10,.425,.045,.36,type===1?'3b3332':'ba7769');
    if(type===1){m.box(t,0,.723,.05,.44,.092,.33,'da6849');m.box(t,.12,.48,.174,.12,.26,.032,'f18862');}
  }
}

function dressVisitor(mesh, transform, look, walk) {
  const hat=AVATAR_OPTIONS.hat[look.hat];
  if(['none','blossom','ribbon'].includes(look.hat)) {
    mesh.box(transform,0,1.058,-.025,.35,.067,.31,'44302a');
    if(look.hat==='blossom'){
      for(const [x,y] of [[.109,1.028],[.159,1.031],[.135,1.054],[.135,1.007]])mesh.gem(transform,x,y,.155,.033,hat.color);
      mesh.gem(transform,.135,1.031,.177,.019,'f5d18d');
    }
    if(look.hat==='ribbon'){
      mesh.box(transform,.144,1.012,-.02,.094,.052,.238,hat.color);
      for(const z of [-.108,.082])mesh.gem(transform,.181,1.053,z,.063,hat.color);
      mesh.box(transform,.18,1.01,-.01,.076,.075,.05,'d0919b');
    }
  } else if(look.hat==='newsboy') {
    mesh.box(transform,0,1.018,0,.4,.073,.365,hat.color);
    mesh.box(transform,0,1.088,-.019,.34,.055,.295,'95725a');
    mesh.box(transform,0,1.012,.145,.35,.037,.238,'604439');
    mesh.box(transform,0,1.142,-.02,.042,.012,.045,'604439');
  } else {
    mesh.box(transform,0,1.025,0,.39,look.hat==='knit'?.158:.135,.335,hat.color);
    if(look.hat==='cap')mesh.box(transform,0,1.019,.10,.425,.045,.36,'647a87');
    if(look.hat==='bucket')mesh.box(transform,0,1.011,0,.49,.045,.435,'d5b681');
    if(look.hat==='knit'){
      mesh.box(transform,0,1.027,0,.407,.054,.351,'713733');
      mesh.gem(transform,0,1.205,0,.054,'ca6d55');
    }
  }
  if(['marketVest','fieldJacket','roseCardigan','plumCoat'].includes(look.coat)){
    const trim={marketVest:'785238',fieldJacket:'505d4c',roseCardigan:'e1a995',plumCoat:'c3a0a9'}[look.coat];
    mesh.box(transform,0,.324,.147,.035,.417,.022,trim);
    for(const x of [-.145,.145]){
      mesh.box(transform,x,.408,.154,.107,.076,.024,trim);
      mesh.box(transform,x,.708,.152,.114,.052,.035,trim);
    }
    for(const y of [.388,.447,.507,.567])mesh.box(transform,0,y,.166,.029,.022,.021,'deb477');
    if(look.coat==='marketVest')for(const x of [-.296,.296])mesh.box(transform,x,.395,x>0?walk:-walk,.135,.367,.165,'d8b888');
    if(look.coat==='plumCoat')mesh.box(transform,0,.269,0,.467,.074,.308,AVATAR_OPTIONS.coat.plumCoat.color);
  }
  if(look.scarf!=='none'){
    const scarf=SCARVES.find(item=>item.id===look.scarf);
    mesh.box(transform,0,.723,.05,.44,.092,.33,scarf?.color??'da6849');
    mesh.box(transform,.12,.48,.174,.12,.26,.032,scarf?.color??'f18862');
    if(scarf)for(const y of [.51,.57,.66])mesh.box(transform,.12,y,.193,.092,.019,.014,scarf.ink);
  }
  const bag=AVATAR_OPTIONS.bag[look.bag];
  if(look.bag==='backpack'){
    mesh.box(transform,0,.37,-.218,.35,.38,.19,bag.color);
    mesh.box(transform,0,.47,-.32,.27,.17,.018,'9d6f45');
  }else if(look.bag==='tote'){
    mesh.box(transform,.33,.087,walk+.065,.245,.215,.19,bag.color);
    mesh.box(transform,.33,.105,walk+.165,.165,.116,.017,'bb835f');
    for(const x of [.25,.41])mesh.box(transform,x,.298,walk+.062,.035,.077,.045,'ac805f');
  }else if(look.bag==='crossbody'){
    mesh.segment(transform(-.17,.764,.156),transform(.22,.426,.184),.042,'593e35');
    mesh.box(transform,.222,.31,.167,.22,.176,.105,bag.color);
    mesh.box(transform,.222,.383,.228,.179,.054,.029,'bc8a69');
  }else if(look.bag==='satchel'){
    mesh.segment(transform(-.181,.773,.172),transform(.218,.407,.177),.048,'7a533b');
    mesh.box(transform,.221,.28,.159,.243,.204,.16,bag.color);
    mesh.box(transform,.221,.41,.213,.238,.064,.064,'b48b64');
    mesh.box(transform,.221,.386,.253,.056,.048,.02,'e4ba69');
  }else if(look.bag==='wovenBasket'||look.bag==='plumPouch'){
    const woven=look.bag==='wovenBasket', x=.328, z=walk+.078, edge=woven?'e0bb80':'c58da1';
    mesh.box(transform,x,.094,z,.245,.178,.184,bag.color);
    mesh.box(transform,x,.263,z,.257,.036,.197,edge);
    for(const side of [-1,1])mesh.box(transform,x+side*.08,.288,z,.033,.105,.04,edge);
    mesh.box(transform,x,.38,z,.186,.033,.04,edge);
    if(woven){
      for(const y of [.127,.17,.215])mesh.box(transform,x,y,z+.094,.226,.017,.013,'a9774e');
      for(const [offset,color] of [[-.07,'d08b83'],[.02,'e6b95f'],[.085,'e9c7a1']])mesh.gem(transform,x+offset,.308,z+.037,.037,color);
    }else mesh.gem(transform,x,.231,z+.104,.035,'f4c982');
  }
}

export function drawAvatarPreview(canvas, appearance, turned=false) {
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const look=normalizeLook(appearance);
  const mesh=new Mesh();
  character(mesh,0,0,turned?2.62:-.15,AVATAR_OPTIONS.coat[look.coat].color,0,0,look);
  const {width,height}=canvas, image=ctx.createImageData(width,height);
  const depth=new Float32Array(width*height).fill(-Infinity);
  const view=norm([3.2,5.2,12]), side=norm(cross([0,1,0],view)), rise=cross(view,side);
  const scale=height*.69;
  const edge=(a,b,x,y)=>(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
  // Depth per pixel keeps tiny pins, hair and overlapping clothes in front of the right faces.
  for(let i=0;i<mesh.data.length;i+=18){
    const points=[0,6,12].map(offset=>mesh.data.slice(i+offset,i+offset+3));
    if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),view)<=0)continue;
    const [a,b,c]=points.map(p=>[width/2+dot(p,side)*scale,height*.875-dot(p,rise)*scale,dot(p,view)]);
    const area=edge(a,b,c[0],c[1]);
    if(!area)continue;
    const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))), maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0])));
    const minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))), maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const u=edge(b,c,x+.5,y+.5)/area, v=edge(c,a,x+.5,y+.5)/area, w=1-u-v;
      if(Math.min(u,v,w)<-1e-6)continue;
      const z=u*a[2]+v*b[2]+w*c[2], at=y*width+x;
      if(z<=depth[at])continue;
      depth[at]=z;
      for(let channel=0;channel<3;channel++)image.data[4*at+channel]=mesh.data[i+3+channel]*255;
      image.data[4*at+3]=255;
    }
  }
  ctx.putImageData(image,0,0);
}

function drawProducts(mesh, stock, marketSlot) {
  let firstSlot=0;
  for (const item of roundCloth(marketSlot)) {
    for (let i=0;i<stock[item.id];i++) {
      const slot=firstSlot+i;
      const stack=Math.floor(slot/3);
      const x=-2.12+(stack%8)*.6;
      const y=.69+(slot%3)*.054;
      const z=1.16+Math.floor(stack/8)*.29;
      const w=item.group==='scarf'?.51:.36;
      const top=y+.052;
      mesh.box(scarfCounter,x,y,z,w,.052,.24,item.color);
      if(item.pattern==='check'||item.pattern==='stripe'){
        for(const dz of [-.065,.032,.083])mesh.box(scarfCounter,x,top,z+dz,w-.055,.003,.014,item.ink);
        if(item.pattern==='check')for(const dx of [-.105,.04,.13])mesh.box(scarfCounter,x+dx,top,z,.014,.003,.20,item.ink);
      } else {
        for(const dx of [-.12,0,.12]){
          const dz=dx===0?-.05:.045;
          const size=item.pattern==='wave'?.065:.039;
          mesh.box(scarfCounter,x+dx,top,z+dz,size,.003,.032,item.ink);
          if(item.pattern==='flower'||item.pattern==='paisley')mesh.box(scarfCounter,x+dx+.019,top,z+dz-.023,.028,.003,.032,item.ink);
        }
      }
    }
    // Reserve the same display position for every fabric even after a stack sells out.
    firstSlot+=item.count;
  }
  const rare=RARE_SCARVES.find(item=>stock[item.id]>0);
  if(rare){
    mesh.box(scarfCounter,2.20,.69,1.43,.34,.19,.27,'ba8044');
    mesh.box(scarfCounter,2.20,.876,1.43,.37,.037,.28,'e1b86d');
    mesh.box(scarfCounter,2.20,.912,1.43,.30,.07,.218,rare.color);
    mesh.box(scarfCounter,2.20,.981,1.46,.25,.006,.035,rare.ink);
    mesh.gem(scarfCounter,2.33,1.14,1.46,.062,'ffe6a3');
    mesh.gem(scarfCounter,2.09,1.08,1.47,.033,'f1c266');
  }
}

function buildScene(m, signs) {
  randomSeed=4937;
  m.box(I,0,-.47,-1,60,.34,55,'7b5750');
  for(let j=-21;j<=16;j++) for(let i=-16;i<=16;i++){
    const z=j*.72,x=(i+(j%2)*.5)*.91;
    m.box(I,x,ground,z,.898,.072+rnd()*.016,.707,pick(brick));
  }
  for(let i=0;i<30;i++){
    const z=i*.62-13.1;
    m.box(I,-5.83,-.01,z,.26,.15,.60,pick(['9f7d66','8b6b59','a7846d']));
    m.box(I,5.8,-.01,z,.25,.15,.60,pick(['9f7d66','8b6b59','a7846d']));
    if(i%4===0) for(let k=0;k<5;k++) m.box(I,5.45+k*.037,.003,z,.017,.014,.27,'55443b');
  }
  const sign = (tr,x,y,z,w,h,top,bottom,bg,fg) => signs.push({tr,x,y,z,w,h,top,bottom,bg,fg});
  function building(x,z,w,h,a,c, accents) {
    const tr=T(x,0,z,a), depth=3.5;
    m.box(tr,0,0,-depth/2,w,h,depth,c);
    m.box(tr,0,h,-depth/2,w+.24,.19,depth+.24,accents[0]);
    m.box(tr,0,h+.19,-depth/2,w-.22,.12,depth-.2,'61413d');
    m.box(tr,0,1.94,.038,w-.13,.10,.10,accents[0]);
    for(let j=0;j<Math.floor((h-2.8)/1.06)+1;j++){
      const y=2.63+j*1.07;
      for(let i=0;i<Math.floor(w/1.24);i++){
        const u=-w/2+.66+i*1.24;
        m.box(tr,u,y,.018,.87,.69,.072,'715c51');
        m.box(tr,u,y+.065,.067,.73,.565,.035,pick(['484854','5b514e','6c6260','bc8355','807266']));
        m.box(tr,u,y+.065,.09,.036,.57,.036,'b99b80');
        m.box(tr,u,y+.323,.093,.74,.031,.03,'a78b70');
        m.box(tr,u,y-.03,.11,.94,.071,.18,accents[0]);
      }
      m.box(tr,0,y-.16,.036,w+.02,.035,.075,accents[1]);
    }
    for(let i=0;i<w*2;i++){
      const u=-w/2+.2+i*.5;
      m.box(tr,u,.08,.014,.025,.13+rnd()*.3,.047,accents[1]);
    }
    m.box(tr,w/2-.13,0,.084,.07,h-.13,.068,accents[0]);
    m.box(tr,w/2-.52,h-.60,.13,.55,.36,.35,'968278');
    for(let k=0;k<5;k++) m.box(tr,w/2-.70+k*.083,h-.54,.32,.022,.21,.015,'625950');
    return tr;
  }
  function signBoard(tr, x,y,z,w,h, top,bottom,bg,fg) {
    m.box(tr,x,y-h/2,z-.06,w+.12,h+.11,.13,'643d2d');
    m.box(tr,x,y-h/2+.025,z+.004,w+.06,h+.065,.032,'bf8554');
    sign(tr,x,y,z+.031,w,h,top,bottom,bg,fg);
  }
  function canopy(tr,w,z,y,stripes, rise=.57, dep=1.22){
    const back=z-dep, front=z, segments=12;
    for(let i=0;i<segments;i++){
      const l=-w/2+(i*w)/segments,r=-w/2+(i+1)*w/segments;
      const c=stripes[i%stripes.length];
      m.face([tr(l,y,front),tr(r,y,front),tr(r,y+rise,back),tr(l,y+rise,back)],c);
      m.face([tr(l,y-.16,front+.013),tr(r,y-.16,front+.013),tr(r,y,front),tr(l,y,front)],c);
      m.face([tr(l,y-.16,front+.013),tr(r,y-.16,front+.013),tr((l+r)/2,y-.217,front+.013)],c);
    }
    m.segment(tr(-w/2-.045,y,front),tr(w/2+.045,y,front),.033,'bf845b');
  }
  function crate(tr,x,z,c='9d6441',y=0,w=.68,d=.57){
    m.box(tr,x,y,z,w,.37,d,c);
    for(let j=0;j<3;j++)m.box(tr,x,y+.055+j*.113,z+d/2+.004,w,.022,.019,'6b4836');
    for(const side of [-1,1])m.box(tr,x+side*(w/2-.058),y,z+d/2+.02,.067,.36,.04,'b68251');
    m.box(tr,x,y+.37,z,w+.03,.052,d+.028,'a57649');
  }
  function merchandise(tr,x,y,z,kind,index){
    const c=cloths[index%cloths.length];
    if(kind==='junk'){
      if(index%3===0){m.box(tr,x,y,z,.20,.145,.17,c);m.gem(tr,x,y+.2,z,.13,c);m.box(tr,x,y+.16,z+.13,.13,.04,.05,'e3a253');}
      else if(index%3===1){m.box(tr,x,y,z,.28,.04,.22,'905843');m.box(tr,x,y+.04,z,.078,.18,.079,'d8a850');m.gem(tr,x,y+.24,z,.13,'e5c46a');}
      else {m.box(tr,x,y,z,.22,.25,.21,'696a8a');m.box(tr,x,y+.02,z+.11,.17,.19,.021,'d8c19d');m.box(tr,x,y+.11,z+.128,.105,.015,.014,'694833');}
    } else {m.gem(tr,x,y+.12,z,.14,pick(['d8894c','deac58','a8a85b','c56c44']));}
  }
  function store({x,z,w,a,wall,h=4.4, top,bottom,signColor,ink, stripes,kind, front=1.34, width=w+.28}) {
    const tr=building(x,z,w,h,a,wall,['784f45',pick(sideBrick)]);
    m.box(tr,0,0,front*.39,w,.075,front*1.23,'846457');
    m.box(tr,0,.09,.068,w-.25,1.72,.13,'4f3b33');
    m.box(tr,0,.15,.152,w-.40,1.49,.03,'634330');
    for(let j=0;j<2;j++){
      m.box(tr,0,.53+j*.48,.21,w-.55,.052,.23,'9b6443');
      if(kind)for(let i=0;i<Math.floor((w-.50)/.5);i++) merchandise(tr,-(w-.56)/2+.20+i*.5,.582+j*.48,.24,kind,i+j*3);
    }
    signBoard(tr,0,2.22,.16,w-.22,.47,top,bottom,signColor,ink);
    canopy(tr,width,front,1.77,stripes, .22,front-.13);
    for(const d of [-1,1]){
      m.box(tr,d*(w/2-.08),.03,front-.04,.075,1.75,.085,'86684e');
      m.box(tr,d*(w/2-.10),.03,front-.04,.14,.15,.14,'654b3d');
    }
    const depth=.53;
    m.box(tr,0,.04,front-.13,w-.53,.56,depth,'85533a');
    for(let k=0;k<Math.floor((w-.56)/.19);k++)m.box(tr,-(w-.57)/2+.06+k*.19,.06,front+.143,.025,.53,.029,'ad7349');
    m.box(tr,0,.60,front-.13,w-.37,.09,depth+.10,'c18a52');
    if(kind)for(let i=0;i<Math.floor((w-.52)/.51);i++) merchandise(tr,-(w-.56)/2+.22+i*.51,.69,front-.13,kind,i);
    for(let i=0;i<Math.floor(w/.52);i++){
      const u=-w/2+.22+i*.54;
      m.segment(tr(u,1.77,front-.10),tr(u,1.65,front-.10),.018,'64452d');
      m.gem(tr,u,1.645,front-.10,.065,'ffe29a');
    }
    return tr;
  }
  store({x:-7.5,z:-2.1,w:4.5,a:Math.PI*.46,wall:'9d6f5c',h:4.8,top:'남대문 잡채호떡',bottom:'갓 구운 골목 간식',signColor:'824d35',ink:'ffdb9d',stripes:['b26349','efad70'],kind:'fruit'});
  store({x:-8.2,z:3.1,w:4.7,a:Math.PI*.45,wall:'a57358',h:4.1,top:'오늘은 장날',bottom:'남대문 식품',signColor:'466454',ink:'ffe2a7',stripes:['80917c','d8be8f'],kind:'fruit'});
  const scarf=store({x:-1.72,z:-3.26,w:5.28,a:0,wall:'a67459',h:4.63,top:'남대문 스카프 상회',bottom:'스카프 · 손수건 · 골목의 멋',signColor:'922f2d',ink:'ffe0a4',stripes:['c75b4e','f0c695'],front:1.45});
  const warehouse=store({x:4.92,z:-.38,w:3.75,a:-.43,wall:'83646a',h:3.9,top:'남대문 창고',bottom:'시장 물류',signColor:'55415f',ink:'f5d1ec',stripes:['8a627d','d3a7a7'],front:1.41});
  const near=store({x:8.3,z:3.4,w:3.1,a:-1.12,wall:'8e725f',h:3.25,top:'남문 그릇',bottom:'사기 · 잡화',signColor:'585a45',ink:'f4d295',stripes:['7e8469','d7a77c'],kind:'junk'});
  building(2.5,-9.8,3.9,6.7,0,'916358',['855749','a07560']);
  building(-1.5,-10.9,4.0,6.1,.12,'89635b',['7c544e','a07564']);
  building(-5.3,-8.9,3.5,5.7,0,'88685f',['74574d','a8826c']);
  building(7.05,-7.7,4.2,6.32,-.25,'9c7863',['795345','b4886f']);
  building(-9.4,-8.1,4.3,6.4,.15,'89645b',['6f514e','9f7766']);
  building(10.2,-4.1,3.9,5.0,-.65,'a27464',['8e5d4e','b38869']);
  for(let i=0;i<17;i++){
    const x=-30+i*3.7,z=-17-rnd()*6;
    m.box(I,x,0,z,2.8+rnd(),5+rnd()*5,2.8,pick(['87646a','906b6b','9d736b','a17971','785b64']));
  }
  signBoard(scarf,-2.13,1.21,1.89,.57,.25,'스카프','', 'f1d298','742f30');
  signBoard(warehouse,.04,1.02,1.62,1.42,.34,'창고','', '503442','ffe0a8');
  signBoard(near,-.9,1.39,1.62,.46,.24,'그릇','', 'dec092','554b38');
  for(let i=0;i<8;i++) {crate(I,-5.74+(i%2)*.35,-1.2-i*.61,'9a6546',0,.55,.46);}
  crate(warehouse,-1.57,2.05,'a57750'); crate(warehouse,-1.57,2.05,'a06b4b',.423,.59,.49);
  crate(I,5.57,5.8,'ac7c54'); crate(I,5.61,6.35,'996449');
  crate(I,-5.65,4.25,'a67652');crate(I,-5.65,4.25,'926341',.421,.57,.46);
  for(let i=0;i<6;i++){
    const x=i%2===0?-6.45:6.15,z=-2.5+i*1.55;
    m.box(I,x,.04,z,.36,.36,.36,'7d4f3f');m.box(I,x,.38,z,.44,.105,.42,'a66d52');
    for(let j=0;j<5;j++)m.gem(I,x+(rnd()-.5)*.36,.53+rnd()*.22,z+(rnd()-.5)*.3,.20+rnd()*.10,pick(['707f53','74825a','87945d','9a9857']));
  }
  for(const [x,z] of [[-5.62,4.7],[5.53,-2.5],[-6.05,-5.5],[5.62,7.8]]){
    m.box(I,x,0,z,.29,.18,.29,'574334'); m.box(I,x,0,z,.075,2.97,.075,'5c4435');
    m.box(I,x,2.89,z,.37,.10,.33,'564032');m.box(I,x,2.62,z,.29,.26,.26,'edaa63');
    m.box(I,x,2.61,z,.32,.05,.32,'614737');m.gem(I,x,3.04,z,.22,'725040');
  }
  for(const [za,zb,h] of [[-2.2,-3.7,3.8],[2.3,1.0,3.62],[6.55,4.9,3.58]]){
    let a;
    for(let i=0;i<=22;i++){
      const t=i/22,x=-7+t*14,y=h-Math.sin(t*Math.PI)*.46,z=fade(za,zb,t);
      const b=[x,y,z];if(a)m.segment(a,b,.023,'5f423b');a=b;
      if(i%2){m.segment(b,[x,y-.12,z],.023,'614435');m.gem(I,x,y-.15,z,.084,'ffcd78');m.gem(I,x,y-.15,z,.051,'fff0b6');}
      if(i%4===0&&i>0&&i<22&&za!==6.55) m.face([[x+.07,y,z],[x+.35,y,z-.035],[x+.25,y-.26,z-.035]],pick(['e6a263','bc6052','8f9d80','b58796']),false);
    }
  }
  character(m,vendorPosition[0],vendorPosition[2],.22,'5c4838',1);
  for(const [x,z,a,c] of [[-4.22,1.2,.67,'ac6755'],[2.44,-1.27,-.5,'7b9081'],[-4.9,-4.35,.1,'c69c70'],[-3.72,5.25,1.3,'b59b77'],[3.33,5.68,-.6,'8c718c'],[.57,-4.65,-1.1,'9b755c']]) character(m,x,z,a,c,2);
}

function shader(gl, type, src){
  const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs){
  const p=gl.createProgram();
  gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
  return p;
}
const vBase = 'uniform vec3 uCam; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uEye; uniform vec2 uScale; attribute vec3 aPos; varying float vFog; vec4 project(){ vec3 v=aPos-uCam; float d=dot(v,uEye); vFog=clamp((-d-7.0)/31.0,0.0,0.87); return vec4(dot(v,uRight)*uScale.x,dot(v,uUp)*uScale.y,-d/63.0,1.0); }';
const fBase = 'precision mediump float; varying float vFog; vec3 mist(vec3 color){ return mix(color,vec3(0.62,0.40,0.38),vFog); }';
const colorProgram = gl => program(gl, vBase+'attribute vec3 aColor; varying vec3 vColor; void main(){vColor=aColor;gl_Position=project();}',fBase+'varying vec3 vColor; void main(){gl_FragColor=vec4(mist(vColor),1.0);}');
const signProgram = gl => program(gl, vBase+'attribute vec2 aUV; varying vec2 vUV; void main(){vUV=aUV;gl_Position=project();}',fBase+'varying vec2 vUV; uniform sampler2D uTex; void main(){gl_FragColor=vec4(mist(texture2D(uTex,vUV).rgb),1.0);}');
function texture(gl, s){
  const cv=document.createElement('canvas');cv.width=512;cv.height=128;
  const c=cv.getContext('2d'),w=cv.width,h=cv.height;
  c.fillStyle='#'+s.bg;c.fillRect(0,0,w,h);
  c.strokeStyle='#'+s.fg;c.globalAlpha=.52;c.lineWidth=2;c.strokeRect(6,6,w-12,h-12);c.globalAlpha=1;
  c.textAlign='center';c.textBaseline='middle';c.fillStyle='#'+s.fg;
  c.font='bold '+(s.bottom?'62':'79')+'px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';c.fillText(s.top,w/2,s.bottom?48:66,w-32);
  if(s.bottom){c.font='bold 22px "Malgun Gothic", sans-serif';c.fillText(s.bottom,w/2,97,w-40);}
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

export function createWorld(canvas, markers, onNearby) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl) throw Error('WebGL unavailable');
  gl.enable(gl.DEPTH_TEST);gl.clearColor(.58,.34,.31,1);
  const geom=colorProgram(gl), texprog=signProgram(gl);
  const programs=[geom,texprog].map(p=>({p,pos:gl.getAttribLocation(p,'aPos'),extra:gl.getAttribLocation(p,p===geom?'aColor':'aUV'), uniforms:Object.fromEntries(['uCam','uRight','uUp','uEye','uScale'].map(k=>[k,gl.getUniformLocation(p,k)]))}));
  function buffer(data, usage=gl.STATIC_DRAW){
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),usage);return b;
  }
  const world=new Mesh(), signs=[];buildScene(world,signs);
  const staticMesh=buffer(world.data), dynamicMesh=buffer([],gl.DYNAMIC_DRAW), productMesh=buffer([],gl.DYNAMIC_DRAW);
  let productVertices=0;
  function setStock(stock, marketSlot){
    const mesh=new Mesh();
    drawProducts(mesh,stock,marketSlot);
    gl.bindBuffer(gl.ARRAY_BUFFER,productMesh);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);
    productVertices=mesh.data.length/6;
  }
  const lettering=signs.map(s=>{
    const pos=(x,y,u,v)=>[...s.tr(s.x+x*s.w,s.y+y*s.h,s.z),u,v];
    const a=pos(-.5,-.5,0,1),b=pos(.5,-.5,1,1),c=pos(.5,.5,1,0),d=pos(-.5,.5,0,0);
    return { b:buffer([...a,...b,...c,...a,...c,...d]), tex:texture(gl,s) };
  });
  const self={...SPAWN,a:.25,look:DEFAULT_LOOK};
  let near=false, shopFocused=false, last=0, walk=0, width=1,height=1;
  let entranceShot=true, entranceRendered=false, snapCamera=false, watchView='';
  let cam=[.20,1.07,.75], sx=.11,sy=.17;
  let peers = new Map();
  let viewerId;
  const speeches=new Map();
  let rarePickup;
  const labels=markers.scarves.parentElement;
  const dir=new Set();
  function setView(prog){
    gl.useProgram(prog.p);
    gl.uniform3fv(prog.uniforms.uCam,cam);gl.uniform3fv(prog.uniforms.uRight,right);
    gl.uniform3fv(prog.uniforms.uUp,up);gl.uniform3fv(prog.uniforms.uEye,eye);
    gl.uniform2f(prog.uniforms.uScale,sx,sy);
  }
  function draw(prog,b,n,stride){
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.enableVertexAttribArray(prog.pos);gl.vertexAttribPointer(prog.pos,3,gl.FLOAT,false,stride*4,0);
    gl.enableVertexAttribArray(prog.extra);gl.vertexAttribPointer(prog.extra,stride-3,gl.FLOAT,false,stride*4,12);
    gl.drawArrays(gl.TRIANGLES,0,n);
  }
  function project(x,y,z){
    const vec=sub([x,y,z],cam);
    return [(dot(vec,right)*sx/2+.5)*width,(.5-dot(vec,up)*sy/2)*height];
  }
  let motion = false;
  function frame(ms){
    const dt=Math.min(.044,(ms-(last||ms))/1000);last=ms;
    const resizeW=canvas.clientWidth,resizeH=canvas.clientHeight;
    let resized=resizeW!==width||resizeH!==height;
    if(resizeW&&resizeH){
      width=resizeW;height=resizeH;
      const dpr=Math.min(devicePixelRatio||1,1.65);
      if(canvas.width!==Math.floor(width*dpr)||canvas.height!==Math.floor(height*dpr)){
        canvas.width=Math.floor(width*dpr);
        canvas.height=Math.floor(height*dpr);
        gl.viewport(0,0,canvas.width,canvas.height);
        resized=true;
      }
    }
    if(entranceShot&&entranceRendered&&!resized){requestAnimationFrame(frame);return;}
    const dx=Number(dir.has('d'))-Number(dir.has('a')), dz=Number(dir.has('s'))-Number(dir.has('w'));
    motion=!watchView&&Boolean(dx||dz);
    if(motion){
      const horiz=norm([up[0],0,up[2]]);
      const v=norm([right[0]*dx-horiz[0]*dz,0,right[2]*dx-horiz[2]*dz]);
      const x=self.x+v[0]*3.35*dt,z=self.z+v[2]*3.35*dt;
      if(walkable(x,self.z))self.x=x;
      if(walkable(self.x,z))self.z=z;
      self.a=Math.atan2(v[0],v[2]);walk+=dt*14;
    }
    const distance=Math.hypot(self.x-SCARF_STALL.x,self.z-SCARF_STALL.z);
    const current=distance<=SHOP_RADIUS+(near?.24:0);
    if(!entranceShot&&!watchView&&current!==near){near=current;onNearby(current);}
    const follow=snapCamera?1:1-Math.exp(-dt*4);
    snapCamera=false;
    const compact=width<=640;
    const stall=shopFocused&&near?SCARF_STALL:null;
    if(entranceShot){
      cam=compact?[-1.6,2.85,.62]:[-4.45,1.24,.38];
    }else if(watchView==='stall'){
      cam=compact?[-1.6,1.1,-1.1]:[-1.1,1.24,-1.0];
    }else if(watchView){
      cam=compact?[-1.15,1.12,.2]:[-.65,1.12,.6];
    }else{
      cam[0]=fade(cam[0],stall?stall.x+(compact?1.05:2):.2+(self.x-SPAWN.x)*(compact?.72:.26),follow);
      cam[1]=fade(cam[1],compact&&stall?-2.05:1.02,follow);
      cam[2]=fade(cam[2],stall?stall.z+(compact?3.3:1.9):.8+(self.z-SPAWN.z)*.25,follow);
    }
    const ratio=width/height;
    const span=watchView==='stall'?Math.max(6.2,(compact?6.5:10.2)/ratio):Math.max(8.9,(compact?10.1:14.2)/ratio);
    sy=2/span;sx=sy/ratio;
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const dynamic=new Mesh();
    for(const p of peers.values()){
      const travel=Math.hypot(p.tx-p.x,p.tz-p.z);
      if(travel>.025){p.a=Math.atan2(p.tx-p.x,p.tz-p.z);p.walk+=dt*12;}
      p.x=fade(p.x,p.tx,follow);p.z=fade(p.z,p.tz,follow);
      character(dynamic,p.x,p.z,p.a,AVATAR_OPTIONS.coat[p.look.coat].color,0,travel>.025?p.walk:0,p.look);
    }
    if(!entranceShot&&!watchView){
      dynamic.disc(self.x,.014,self.z,.44,.31,'f1bb57');
      dynamic.disc(self.x,.016,self.z,.36,.24,'805d45');
      character(dynamic,self.x,self.z,self.a,AVATAR_OPTIONS.coat[self.look.coat].color,0,motion?walk:0,self.look);
    }
    setView(programs[0]);draw(programs[0],staticMesh,world.data.length/6,6);
    draw(programs[0],productMesh,productVertices,6);
    gl.bindBuffer(gl.ARRAY_BUFFER,dynamicMesh);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(dynamic.data),gl.DYNAMIC_DRAW);
    draw(programs[0],dynamicMesh,dynamic.data.length/6,6);
    setView(programs[1]);
    for(const s of lettering){gl.bindTexture(gl.TEXTURE_2D,s.tex);draw(programs[1],s.b,6,5);}
    if(entranceShot){entranceRendered=true;requestAnimationFrame(frame);return;}
    if(rarePickup){
      const { id, node, until }=rarePickup;
      if(ms>=until){node.remove();rarePickup=undefined;}
      else{
        const collector=id===viewerId?self:peers.get(id);
        if(!collector)node.hidden=true;
        else{
          const [x,y]=project(collector.x,1.76,collector.z);
          node.hidden=x<0||x>width||y<62||y>height-35;
          const margin=node.offsetWidth/2+8;
          node.style.left=Math.max(margin,Math.min(width-margin,x))+'px';
          node.style.top=y+'px';
        }
      }
    }
    for(const [id,bubble] of speeches){
      if(ms>=bubble.until){
        bubble.node.remove();
        speeches.delete(id);
        continue;
      }
      const speaker=id===viewerId?self:peers.get(id);
      if(!speaker){bubble.node.hidden=true;continue;}
      const [x,y]=project(speaker.x,id===viewerId?1.36:1.56,speaker.z);
      bubble.node.hidden=x<0||x>width||y<74||y>height-34;
      const margin=bubble.node.offsetWidth/2+8;
      bubble.node.style.left=Math.max(margin,Math.min(width-margin,x))+'px';
      bubble.node.style.top=y+'px';
    }
    const [bubbleX,bubbleY]=project(vendorPosition[0],1.32,vendorPosition[2]);
    markers.speech.hidden=bubbleX<0||bubbleX>width||bubbleY<95||bubbleY>height-50;
    const half=markers.speech.offsetWidth/2+10;
    markers.speech.style.left=Math.max(half,Math.min(width-half,bubbleX))+'px';
    markers.speech.style.top=bubbleY+'px';
    if(!watchView){
      const [scarfX,scarfY]=project(-1.67,2.94,-1.98);
      markers.scarves.style.left=scarfX+'px';
      markers.scarves.style.top=scarfY+'px';
      markers.scarves.hidden=scarfX<35||scarfX>width-35||scarfY<52||scarfY>height-60;
      for(const p of peers.values()){
        const [x,y]=project(p.x,1.33,p.z);
        p.label.style.left=x+'px';p.label.style.top=y+'px';
        p.label.hidden=x<26||x>width-26||y<55||y>height-62;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    dir, position:()=>({x:+self.x.toFixed(2),z:+self.z.toFixed(2)}), moving:()=>motion,
    enterMarket(){
      watchView='';
      entranceShot=false;
      snapCamera=matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
    leaveMarket(){
      dir.clear();
      markers.speech.hidden=true;
      Object.assign(self,SPAWN,{a:.25});
      near=false;
      shopFocused=false;
      entranceShot=true;
      entranceRendered=false;
      watchView='';
      for(const peer of peers.values())peer.label.remove();
      peers.clear();
      for(const speech of speeches.values())speech.node.remove();
      speeches.clear();
      rarePickup?.node.remove();
      rarePickup=undefined;
    },
    watchMarket(view){
      dir.clear();
      entranceShot=false;
      watchView=view;
    },
    focusShop(active){shopFocused=active;},
    setStock,
    showRarePickup(pickup, node, remaining){
      if(rarePickup?.sentAt>=pickup.sentAt)return;
      rarePickup?.node.remove();
      node.hidden=true;
      markers.rare.append(node);
      rarePickup={id:pickup.id,sentAt:pickup.sentAt,node,until:performance.now()+remaining};
    },
    showChat(speech, remaining){
      const id=speech.playerId;
      const existing=speeches.get(id);
      if(existing?.sentAt>=speech.sentAt)return;
      const node=existing?.node??document.createElement('span');
      if(!existing){
        node.className='player-speech';
        node.hidden=true;
        const layer=watchView?markers.watchSpeech:labels;
        layer.append(node);
      }
      node.classList.toggle('own-speech',id===viewerId);
      node.textContent=speech.text;
      speeches.set(id,{node,sentAt:speech.sentAt,until:performance.now()+remaining});
    },
    setPeers(list, selfId, look){
      viewerId=selfId;
      self.look=normalizeLook(look);
      const current=new Map();
      for(const p of list){
        const old=peers.get(p.id);
        const label=old?.label??document.createElement('span');
        if(!old){label.className='peer-label';labels.append(label);}
        const name=p.name??'';
        if(label.textContent!==name)label.textContent=name;
        const s=old??{x:p.x,z:p.z,a:.15,walk:0,label};
        s.tx=p.x;s.tz=p.z;s.look=normalizeLook(p.look);current.set(p.id,s);
      }
      for(const [id,p] of peers)if(!current.has(id))p.label.remove();
      peers=current;
    }
  };
}
