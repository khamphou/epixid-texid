// Animation tétriminos pour l'écran d'accueil
// Rendu sur #hero-fx (au-dessus du fond, sous le menu)

let fxCvs = null, fxCtx = null, rafId = 0, blocks = [], cssW = 0, cssH = 0, dpr = 1, lastTs = 0;
let vanishX = 0, vanishY = 0; // point de fuite (centre du logo TEXID)

// Défs locales (4x4)
const TETROMINOS = {
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J:[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  L:[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  O:[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  S:[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
  T:[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  Z:[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
};
// Palette monochrome bleu néon (variantes pour éviter l'uniformité)
const BLUE_PALETTE = ['#7DD3FC', '#60A5FA', '#38BDF8', '#93C5FD', '#67E8F9'];
const ACCENT_PALETTE = ['#F59E0B', '#FDE047', '#22C55E', '#A78BFA', '#EF4444'];
function pickColor(){
  // 75% bleu, 25% accent
  return (Math.random() < 0.75)
    ? BLUE_PALETTE[(Math.random()*BLUE_PALETTE.length)|0]
    : ACCENT_PALETTE[(Math.random()*ACCENT_PALETTE.length)|0];
}
const KEYS = Object.keys(TETROMINOS);

function shade(hex, amt){
  const c = parseInt(hex.slice(1),16);
  let r=(c>>16)+amt, g=((c>>8)&255)+amt, b=(c&255)+amt;
  r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1).toUpperCase();
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function resize(){
  if(!fxCvs) return;
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
  cssW = fxCvs.clientWidth||fxCvs.offsetWidth||0;
  cssH = fxCvs.clientHeight||fxCvs.offsetHeight||0;
  fxCvs.width = Math.max(1, Math.floor(cssW*dpr));
  fxCvs.height = Math.max(1, Math.floor(cssH*dpr));
  if(fxCtx) fxCtx.setTransform(dpr,0,0,dpr,0,0);
  updateVanishPoint();
}

function updateVanishPoint(){
  try{
    const logoWrap = document.querySelector('.hero .logo-wrap');
    if(!logoWrap || !fxCvs) { vanishX = cssW/2; vanishY = Math.max(40, cssH*0.18); return; }
    const cvr = fxCvs.getBoundingClientRect();
    const lr = logoWrap.getBoundingClientRect();
    vanishX = (lr.left + lr.width/2) - cvr.left;
    vanishY = (lr.top + lr.height/2) - cvr.top;
  }catch{
    vanishX = cssW/2; vanishY = cssH*0.2;
  }
}

function makeBlock(opts={}){
  const key = KEYS[(Math.random()*KEYS.length)|0];
  const mat = TETROMINOS[key];
  // profondeur: 0 (loin) -> 1 (près)
  const depth = Math.random()*0.8 + 0.2; // éviter 0 strict
  const baseCell = 20; // taille de base augmentée
  const cell = baseCell + depth*22; // 20..42 px (avant DPR)
  const color = pickColor();
  const speed = 30 + depth*60; // vitesse augmentée
  const blur = 6 + depth*14; // glow plus marqué au premier plan
  const alpha = 0.4 + depth*0.55; // 0.4..0.95
  // position initiale: partout à l'écran si anywhere, sinon spawn par le haut
  const anywhere = !!opts.anywhere;
  let x = anywhere ? Math.random()*cssW : Math.random()*cssW;
  let y = anywhere ? Math.random()*cssH : -Math.random()*cssH*0.4;
  // Mode de mouvement: chute ou zoom radial vers/depuis le point de fuite
  const isZoom = !!opts.forceZoom || (!opts.seed && Math.random() < 0.5); // 50% zoom en routine
  let mode='fall', vx=(Math.random()*40-20)*(0.4+depth*0.8), vy=speed, scale=1, scaleVel=0, zoomDir='in', side='right', targetX=cssW+200;
  if(isZoom){
    mode='zoom';
    zoomDir = Math.random()<0.55? 'out':'in'; // majorité vers l'extérieur
    // spawn logique pour l'effet de perspective
    if(zoomDir==='out'){
      // partir près du point de fuite
      const ang = Math.random()*Math.PI*2;
      const r = 20 + Math.random()*100; // couronne autour du logo
      x = vanishX + Math.cos(ang)*r;
      y = vanishY + Math.sin(ang)*r;
      const dirx = x - vanishX, diry = y - vanishY; const len = Math.hypot(dirx,diry)||1;
      vx = (dirx/len) * (60 + depth*220);
      vy = (diry/len) * (60 + depth*220);
      scale = 0.5 + Math.random()*0.6; // petit au centre -> grossit
      scaleVel = 0.6 + depth*1.2;
    } else {
      // entrer depuis le bord vers le logo
      const edge = Math.floor(Math.random()*4);
      if(edge===0){ x = -80; y = Math.random()*cssH; }
      else if(edge===1){ x = cssW+80; y = Math.random()*cssH; }
      else if(edge===2){ y = -80; x = Math.random()*cssW; }
      else { y = cssH+80; x = Math.random()*cssW; }
      const dirx = vanishX - x, diry = vanishY - y; const len = Math.hypot(dirx,diry)||1;
      vx = (dirx/len) * (60 + depth*220);
      vy = (diry/len) * (60 + depth*220);
      scale = 1.3 + Math.random()*0.8; // gros -> rapetisse vers le centre
      scaleVel = - (0.5 + depth*1.0);
    }
  }
  return {
    key, mat, color,
    x, y,
    vy,
    vx,
    rot: Math.random()*Math.PI*2,
    rotSpeed: (-0.25 + Math.random()*0.5), // rotations lentes
    cell,
    depth, blur, alpha,
    mode, scale, scaleVel, zoomDir, side, targetX,
    age: 0 // pour le fondu d'apparition
  };
}

function seed(n){
  blocks = [];
  for(let i=0;i<n;i++){
    // Au démarrage: partout à l'écran, fondu d'apparition, et un peu plus de zooms pour l'effet
    const b = makeBlock({anywhere:true, seed:true});
    if(Math.random()<0.35){ // booster la présence de zoom à l'initialisation
      b.mode='zoom'; b.zoomDir = Math.random()<0.5? 'in':'out'; b.side = Math.random()<0.5?'left':'right'; b.targetX = b.side==='left'? -200 : cssW+200; b.vx = (b.side==='left'?-1:1)*(40 + b.depth*120); b.scale = 0.7 + Math.random()*1.1; b.scaleVel = (b.zoomDir==='in'? 0.5 : -0.45);
    }
    blocks.push(b);
  }
}

function draw(ts){
  if(!fxCtx || !fxCvs || !cssW || !cssH){ rafId = requestAnimationFrame(draw); return; }
  // clear
  fxCtx.save(); fxCtx.setTransform(1,0,0,1,0,0); fxCtx.clearRect(0,0,fxCvs.width,fxCvs.height); fxCtx.restore();
  const dt = lastTs ? Math.min(0.05, (ts - lastTs)/1000) : 1/60; // clamp 50ms
  lastTs = ts||lastTs;
  // densité légèrement réduite pour un rendu élégant
  const target = Math.max(18, Math.floor(cssW*cssH/80000));
  if(blocks.length < target){ blocks.push(makeBlock()); }
  for(const b of blocks){
    b.age += dt;
    if(b.mode==='zoom'){
      // accélération progressive
      if(b.vx0===undefined){ b.vx0 = b.vx||0; b.vy0 = b.vy||0; }
      const sf = 1 + Math.min(1.8, b.age*0.9);
      b.vx = b.vx0 * sf; b.vy = b.vy0 * sf;
      b.scale += b.scaleVel*dt;
    }
    b.x += (b.vx||0)*dt;
    b.y += b.vy*dt;
    b.rot += b.rotSpeed*dt;
    const m=b.mat; let minX=4,maxX=0,minY=4,maxY=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); minY=Math.min(minY,j); maxY=Math.max(maxY,j); }
    const w=maxX-minX+1, h=maxY-minY+1; const cell=b.cell;
    fxCtx.save(); fxCtx.translate(b.x, b.y);
    // effet perspective léger sur le zoom: scaleX != scaleY
    const s = (b.mode==='zoom') ? Math.max(0.12, b.scale) : 1;
    const sy = (b.mode==='zoom') ? s*0.86 : 1;
    fxCtx.scale(s, sy);
    fxCtx.rotate(b.rot);
    // Opacité: zoomers visibles sans fade; IN devient plus transparent près du centre
    let opa;
    if(b.mode==='zoom'){
      if(b.zoomDir==='out') opa = 0.9;
      else {
        const dx = b.x - vanishX, dy = b.y - vanishY; const dist = Math.hypot(dx,dy);
        const dn = Math.min(1, dist / (Math.max(cssW, cssH)*0.6));
        opa = 0.35 + dn*0.55; // 0.35 au centre -> 0.9 en bord
      }
    } else {
      const fade = Math.min(1, b.age/0.6);
      opa = b.alpha * fade;
    }
    fxCtx.globalAlpha = opa;
    // Pass 1: glow externe (addition)
    const prevComp = fxCtx.globalCompositeOperation; fxCtx.globalCompositeOperation = 'lighter';
    fxCtx.shadowColor = 'rgba(56,189,248,0.65)'; // cyan plus intense
    fxCtx.shadowBlur = (b.mode==='zoom' ? b.blur*1.4 : b.blur) * dpr;
    const offx = -(w*cell)/2, offy=-(h*cell)/2;
    // Traînées lumineuses pour les zoomers (motion trail)
    if(b.mode==='zoom'){
      const vx = b.vx||0, vy = b.vy||0; const len = Math.hypot(vx,vy)||1; const ux = vx/len, uy = vy/len;
      const trailN = 5; const gap = 10 + b.depth*16;
      for(let kk=trailN; kk>=1; kk--){
        fxCtx.save();
        fxCtx.translate(-ux*gap*kk/s, -uy*gap*kk/s); // compenser l'échelle pour rester en coord locales
        const tAlpha = (opa*0.14) * (1 - kk/trailN);
        fxCtx.globalAlpha = tAlpha;
        for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
          const px=offx+(i-minX)*cell, py=offy+(j-minY)*cell;
          fxCtx.fillStyle=b.color; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, Math.max(4, cell*0.18)); fxCtx.fill();
        }
        fxCtx.restore();
      }
    }
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
      const px=offx+(i-minX)*cell, py=offy+(j-minY)*cell; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, Math.max(4, cell*0.18)); fxCtx.fillStyle=b.color; fxCtx.fill();
    }
  fxCtx.globalCompositeOperation = prevComp;
    // Pass 2: corps "verre" avec dégradés et reflets
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
      const px=offx+(i-minX)*cell, py=offy+(j-minY)*cell;
      // dégradé vertical principal
      const g = fxCtx.createLinearGradient(px,py,px,py+cell);
      g.addColorStop(0, shade(b.color, 30));
      g.addColorStop(0.55, shade(b.color, -8));
      g.addColorStop(1, shade(b.color, -18));
      fxCtx.fillStyle=g; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, Math.max(4, cell*0.18)); fxCtx.fill();
      // liseré clair
      fxCtx.strokeStyle=shade(b.color, 40); fxCtx.lineWidth=1; roundRect(fxCtx, px+2.5, py+2.5, cell-5, cell-5, Math.max(3, cell*0.16)); fxCtx.stroke();
      // reflet doux haut-gauche
      const rg = fxCtx.createRadialGradient(px+cell*0.35, py+cell*0.35, 0, px+cell*0.35, py+cell*0.35, cell*0.6);
      rg.addColorStop(0, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      fxCtx.fillStyle = rg; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, Math.max(4, cell*0.18)); fxCtx.fill();
      // trait d'ombre interne bas
      fxCtx.strokeStyle='rgba(0,0,0,0.25)'; fxCtx.lineWidth=1; fxCtx.beginPath(); fxCtx.moveTo(px+5, py+cell-4); fxCtx.lineTo(px+cell-5, py+cell-4); fxCtx.stroke();
    }
    fxCtx.restore();
  }
  // collisions (rebonds) entre blocs en chute seulement
  for(let i=0;i<blocks.length;i++){
    const a = blocks[i]; if(a.mode!=='fall') continue;
    // approx rayon basé sur taille et shape
    const ma=a.mat; let minXa=4,maxXa=0,minYa=4,maxYa=0; for(let j=0;j<4;j++) for(let k=0;k<4;k++) if(ma[j][k]){ minXa=Math.min(minXa,k); maxXa=Math.max(maxXa,k); minYa=Math.min(minYa,j); maxYa=Math.max(maxYa,j);}    
    const wa=maxXa-minXa+1, ha=maxYa-minYa+1; const ra = Math.max(wa,ha)*a.cell*0.42;
    for(let j=i+1;j<blocks.length;j++){
      const b = blocks[j]; if(b.mode!=='fall') continue;
      const mb=b.mat; let minXb=4,maxXb=0,minYb=4,maxYb=0; for(let y2=0;y2<4;y2++) for(let x2=0;x2<4;x2++) if(mb[y2][x2]){ minXb=Math.min(minXb,x2); maxXb=Math.max(maxXb,x2); minYb=Math.min(minYb,y2); maxYb=Math.max(maxYb,y2);}    
      const wb=maxXb-minXb+1, hb=maxYb-minYb+1; const rb = Math.max(wb,hb)*b.cell*0.42;
      const dx = b.x - a.x, dy = b.y - a.y; const dist = Math.hypot(dx,dy);
      const minDist = ra + rb;
      if(dist>0 && dist < minDist){
        // séparer
        const overlap = (minDist - dist) * 0.5;
        const nx = dx/dist, ny = dy/dist;
        a.x -= nx*overlap; a.y -= ny*overlap;
        b.x += nx*overlap; b.y += ny*overlap;
        // échange élastique des composantes le long de la normale
        const va = {x:a.vx||0, y:a.vy};
        const vb = {x:b.vx||0, y:b.vy};
        const ua = va.x*nx + va.y*ny;
        const ub = vb.x*nx + vb.y*ny;
        const damp = 0.9; // amortissement léger
        const dua = (ub - ua)*damp;
        const dub = (ua - ub)*damp;
        a.vx = va.x + dua*nx; a.vy = va.y + dua*ny;
        b.vx = vb.x + dub*nx; b.vy = vb.y + dub*ny;
      }
    }
  }
  // recycle
  for(let i=0;i<blocks.length;i++){
    const b = blocks[i];
    let out = false;
    if(b.mode==='fall'){
      out = (b.y > cssH + 140);
    }else{ // zoom
      out = (b.scale<0.15 || b.scale>3.2 || b.x < -240 || b.x > cssW+240);
    }
    if(out){
      blocks[i] = makeBlock();
      blocks[i].y = -100 - Math.random()*120;
      blocks[i].x = Math.random()*cssW;
    }
  }
  rafId = requestAnimationFrame(draw);
}

export function initHeroAnimation(){
  fxCvs = document.getElementById('hero-fx');
  if(!fxCvs) return;
  fxCtx = fxCvs.getContext('2d');
  resize();
  try{ const hero = document.querySelector('.hero'); if(hero && window.ResizeObserver){ const ro = new ResizeObserver(()=> resize()); ro.observe(hero); } }catch{}
  updateVanishPoint();
  seed(26);
}

export function startHeroAnimation(){ if(!fxCtx) initHeroAnimation(); if(rafId) return; rafId = requestAnimationFrame(draw); }
export function stopHeroAnimation(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
