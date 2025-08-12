// Animation tétriminos pour l'écran d'accueil
// Rendu sur #hero-fx (au-dessus du fond, sous le menu)

let fxCvs = null, fxCtx = null, rafId = 0, blocks = [], cssW = 0, cssH = 0, dpr = 1, lastTs = 0;

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
  const x = anywhere ? Math.random()*cssW : Math.random()*cssW;
  const y = anywhere ? Math.random()*cssH : -Math.random()*cssH*0.4;
  // Mode de mouvement: chute ou zoom latéral
  const isZoom = !!opts.forceZoom || (!opts.seed && Math.random() < 0.27); // ~27% zoom en routine
  let mode='fall', vx=0, vy=speed, scale=1, scaleVel=0, zoomDir='in', side='right', targetX=cssW+200;
  if(isZoom){
    mode='zoom';
    zoomDir = Math.random()<0.5? 'in':'out';
    side = Math.random()<0.5? 'left':'right';
    targetX = side==='left'? -200 : cssW+200;
    // vitesse latérale vers le bord
    vx = ( (side==='left'? -1:1) ) * (40 + depth*120);
    // échelle initiale et vitesse
    scale = anywhere ? (0.7 + Math.random()*0.9) : (zoomDir==='in'? 0.4 + Math.random()*0.6 : 1.2 + Math.random()*0.6);
    scaleVel = (zoomDir==='in' ? (0.45 + depth*0.85) : (-0.35 - depth*0.65));
    // légère dérive verticale
    vy = (-10 + Math.random()*20);
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
    b.x += (b.vx||0)*dt;
    b.y += b.vy*dt;
    if(b.mode==='zoom'){
      b.scale += b.scaleVel*dt;
    }
    b.rot += b.rotSpeed*dt;
    const m=b.mat; let minX=4,maxX=0,minY=4,maxY=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); minY=Math.min(minY,j); maxY=Math.max(maxY,j); }
    const w=maxX-minX+1, h=maxY-minY+1; const cell=b.cell;
    fxCtx.save(); fxCtx.translate(b.x, b.y);
    // effet perspective léger sur le zoom: scaleX != scaleY
    const s = (b.mode==='zoom') ? Math.max(0.12, b.scale) : 1;
    const sy = (b.mode==='zoom') ? s*0.9 : 1;
    fxCtx.scale(s, sy);
    fxCtx.rotate(b.rot);
    // apparaitre en fondu sur 0.6s
    const fade = Math.min(1, b.age/0.6);
    fxCtx.globalAlpha = b.alpha * fade;
    // Pass 1: glow externe (addition)
    const prevComp = fxCtx.globalCompositeOperation; fxCtx.globalCompositeOperation = 'lighter';
    fxCtx.shadowColor = 'rgba(56,189,248,0.55)'; // cyan
    fxCtx.shadowBlur = b.blur * dpr;
    const offx = -(w*cell)/2, offy=-(h*cell)/2;
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
  seed(26);
}

export function startHeroAnimation(){ if(!fxCtx) initHeroAnimation(); if(rafId) return; rafId = requestAnimationFrame(draw); }
export function stopHeroAnimation(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
