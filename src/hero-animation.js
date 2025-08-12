// Animation tétriminos pour l'écran d'accueil
// Rendu sur #hero-fx (au-dessus du fond, sous le menu)

let fxCvs = null, fxCtx = null, rafId = 0, blocks = [], cssW = 0, cssH = 0, dpr = 1;

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
const COLORS = { I:'#7DD3FC', J:'#60A5FA', L:'#F59E0B', O:'#FDE047', S:'#22C55E', T:'#A78BFA', Z:'#EF4444' };
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

function makeBlock(){
  const key = KEYS[(Math.random()*KEYS.length)|0];
  const mat = TETROMINOS[key];
  const cell = 18 + Math.random()*10;
  return {
    key, mat, color: COLORS[key],
    x: Math.random()*cssW,
    y: -Math.random()*cssH*0.3,
    vy: 20 + Math.random()*60,
    rot: Math.random()*Math.PI*2,
    rotSpeed: (-0.6 + Math.random()*1.2),
    cell
  };
}

function seed(n){ blocks = []; for(let i=0;i<n;i++) blocks.push(makeBlock()); }

function draw(ts){
  if(!fxCtx || !fxCvs || !cssW || !cssH){ rafId = requestAnimationFrame(draw); return; }
  // clear
  fxCtx.save(); fxCtx.setTransform(1,0,0,1,0,0); fxCtx.clearRect(0,0,fxCvs.width,fxCvs.height); fxCtx.restore();
  const dt = 1/60;
  const target = Math.max(24, Math.floor(cssW*cssH/55000));
  if(blocks.length < target){ blocks.push(makeBlock()); }
  for(const b of blocks){
    b.y += b.vy*dt; b.rot += b.rotSpeed*dt;
    const m=b.mat; let minX=4,maxX=0,minY=4,maxY=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); minY=Math.min(minY,j); maxY=Math.max(maxY,j); }
    const w=maxX-minX+1, h=maxY-minY+1; const cell=b.cell;
    fxCtx.save(); fxCtx.translate(b.x, b.y); fxCtx.rotate(b.rot); fxCtx.globalAlpha = 0.95; fxCtx.shadowColor='rgba(56,189,248,0.28)'; fxCtx.shadowBlur=14;
    const offx = -(w*cell)/2, offy=-(h*cell)/2;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
      const px=offx+(i-minX)*cell, py=offy+(j-minY)*cell;
      const g = fxCtx.createLinearGradient(px,py,px,py+cell);
      g.addColorStop(0, shade(b.color, 10)); g.addColorStop(1, shade(b.color,-12));
      fxCtx.fillStyle=g; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, 5); fxCtx.fill();
      fxCtx.strokeStyle='rgba(0,0,0,.28)'; fxCtx.lineWidth=1.5; roundRect(fxCtx, px+2, py+2, cell-4, cell-4, 5); fxCtx.stroke();
    }
    fxCtx.restore();
  }
  // recycle
  for(let i=0;i<blocks.length;i++) if(blocks[i].y > cssH + 80){ blocks[i] = makeBlock(); blocks[i].y = -60; blocks[i].x = Math.random()*cssW; }
  rafId = requestAnimationFrame(draw);
}

export function initHeroAnimation(){
  fxCvs = document.getElementById('hero-fx');
  if(!fxCvs) return;
  fxCtx = fxCvs.getContext('2d');
  resize();
  try{ const hero = document.querySelector('.hero'); if(hero && window.ResizeObserver){ const ro = new ResizeObserver(()=> resize()); ro.observe(hero); } }catch{}
  seed(28);
}

export function startHeroAnimation(){ if(!fxCtx) initHeroAnimation(); if(rafId) return; rafId = requestAnimationFrame(draw); }
export function stopHeroAnimation(){ if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
