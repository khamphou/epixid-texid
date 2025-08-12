import { Grid } from '../engine/grid.js';
import { Bag } from '../engine/bag.js';
import { TETROMINOS, rotateCW } from '../engine/piece.js';
import { Scoring } from '../engine/scoring.js';
import { Input } from '../engine/input.js';
import { Garbage } from '../engine/garbage.js';
import { audio } from '../audio.js';

export class SoloScreen{
  constructor(core, { rules, objectives }){ this.core=core; this.rules=rules; this.objectives=objectives; }
  async init(){
  this.grid = new Grid(10,20); this.bag=new Bag(); this.active=spawn(this.bag);
    this.x=3; this.y=0; this.rot=0; this.score=0; this.combo=-1; this.b2b=false; this.time=0;
    this.gravity = 1; this.dropAcc=0; this.lockDelay= (this.rules?.speed?.lockDelayMs||500)/1000; this.lockTimer=0; this.holdDown=false;
  this.scoring = new Scoring();
    this.garbage = new Garbage();
  // Hold / Next
  this.hold = null; this.holdUsed = false;
  this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)];
  this.input = new Input({ dasMs: this.rules?.inputs?.dasMs, arrMs: this.rules?.inputs?.arrMs });
    this.input.start();
  // Audio: intensité musique
  this._musicT = 0; this._musicLevel = 0.2;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }
  update(dt){
    this.time+=dt; this.objectives?.tick?.(dt);
    const g = this.rules?.speed?.gravityCurve||[]; if(g.length){ const t=this.time; let cur=g[0].gravity; for(const p of g){ if(t>=p.t) cur=p.gravity; } this.gravity = cur; }
    // mouvements horizontaux répétés via input
    const dx = this.input.stepHorizontal(dt);
    if(dx){
      const step = Math.sign(dx);
      for(let i=0;i<Math.abs(dx);i++){
        const nx = this.x + step;
        if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; }
        else break;
      }
    }
    // soft drop
    const soft = this.input.softDrop();
    const gravityFactor = soft ? 24 : 1.6; // accélération du soft drop
    this.dropAcc += dt*this.gravity*gravityFactor;
    while(this.dropAcc>=1){ this.dropAcc-=1; this.y+=1; if(collide(this.grid,this.active,this.x,this.y)) { this.y--; this.lockTimer+=dt; if(this.lockTimer>=this.lockDelay){ lock(this); } break; } else { this.lockTimer=0; } }
    // garbage timers -> appliquer si écoulés
    const apply = this.garbage.tick(dt);
    if(apply>0){
      // insérer 'apply' lignes en bas avec un trou aléatoire, pousser la grille vers le haut
      for(let k=0;k<apply;k++){
        const hole = Math.floor(Math.random()*this.grid.w);
        // pop top row if needed (game over check minimal)
        this.grid.cells.shift();
        const row = Array(this.grid.w).fill(1); row[hole]=null;
        this.grid.cells.push(row);
      }
      // Ajuster la position de la pièce active si elle est dans le plafond
      if(collide(this.grid, this.active, this.x, this.y)){
        this.y -= apply; // remonter
        if(collide(this.grid,this.active,this.x,this.y)){
          // game over minimal: réinitialiser la grille
          try{ audio.playGameOverMusic?.(); }catch{}
          this.grid = new Grid(10,20); this.bag=new Bag(); this.active=spawn(this.bag); this.x=3; this.y=0; this.scoring=new Scoring();
        }
      }
    }
    // Musique: adapter l'intensité selon danger/gravité, rafraîchie toutes les 0.5s
    this._musicT += dt; if(this._musicT>=0.5){ this._musicT=0; try{
      const incoming = Math.min(10, this.garbage?.incoming||0);
      const danger = Math.min(1, incoming/6);
      const g = Math.min(1, this.gravity/4);
      const target = Math.max(0.15, Math.min(1, 0.2 + danger*0.6 + g*0.2));
      if(Math.abs(target - this._musicLevel) >= 0.05){ this._musicLevel = target; audio.setMusicIntensity?.(target); }
    }catch{} }
  }
  render(ctx){
    // Fond
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

  // Layout général (board + sidebar à droite) — responsive et centré
  const rect = ctx.canvas.getBoundingClientRect();
  const W = rect.width; const H = rect.height;
  const topbarEl = (typeof document!=='undefined') ? document.getElementById('topbar') : null;
  const topbarVisible = !!topbarEl && getComputedStyle(topbarEl).display !== 'none';
  const topbarH = topbarVisible ? (topbarEl.getBoundingClientRect().height||0) : 0;

  const cell = 24;
  const boardW = this.grid.w*cell;
  const boardH = this.grid.h*cell;
  const gap = 26;
  const desiredSideW = 300;
  const margin = 16;
  const needW = boardW + gap + desiredSideW + margin*2;
  const showSidebar = W >= needW;
  const totalW = showSidebar ? (boardW + gap + desiredSideW) : boardW;
  let offx = Math.max(margin, Math.floor((W - totalW)/2));
  let offy = Math.max(margin + topbarH, Math.floor((H - boardH)/2));

  const sideX = offx + boardW + gap;
  const sideY = offy;
  const sideW = showSidebar ? desiredSideW : 0;

    // Cadre verre du plateau
    drawGlassFrame(ctx, offx-14, offy-14, boardW+28, boardH+28);
    drawInnerFrame(ctx, offx, offy, boardW, boardH);

    // Grille
    drawGrid(ctx, offx, offy, this.grid.w, this.grid.h, cell);

    // Ghost piece
    const ghostY = computeGhostY(this.grid, this.active, this.x, this.y);
    drawMat(ctx, this.active.mat, offx+this.x*cell, offy+ghostY*cell, cell, 'ghost');

  // Tuiles posées: garder la couleur d'origine de la pièce
    for(let y=0;y<this.grid.h;y++){
      for(let x=0;x<this.grid.w;x++){
        const v = this.grid.cells[y][x];
        if(v){
      const col = typeof v==='string' ? v : pieceColor(v);
          drawTile(ctx, offx+x*cell, offy+y*cell, cell, col);
        }
      }
    }

    // Pièce active (couleur par type)
    const color = pieceColor(this.active.key);
    drawMat(ctx, this.active.mat, offx+this.x*cell, offy+Math.floor(this.y)*cell, cell, color);

    // Légende sous plateau
    ctx.fillStyle = '#b6c2cf'; ctx.font = '12px system-ui,Segoe UI,Roboto,Arial';
    ctx.textAlign='center'; ctx.fillText('kham', offx+boardW/2, offy+boardH+22);
    ctx.textAlign='left';

    // Sidebar: panneau statut
    if(showSidebar){
      drawPanelGlass(ctx, sideX, sideY, sideW, 120);
      drawLabelValue(ctx, sideX+14, sideY+22, 'Joueur', 'kham');
      drawLabelValue(ctx, sideX+14, sideY+44, 'Niveau', 'Pepouz');
      drawLabelValue(ctx, sideX+14, sideY+66, 'Score', String(this.scoring?.score||0), true);
      drawLabelValue(ctx, sideX+14, sideY+88, 'Lignes', String(this.scoring?.lines||0));
    }

    // Sidebar: panneau Hold/Next
    if(showSidebar){
      const panel2Y = sideY + 140;
      drawPanelGlass(ctx, sideX, panel2Y, sideW, 180);
      ctx.fillStyle = '#cfe7ff'; ctx.font = '12px Orbitron,system-ui'; ctx.fillText('Blocs', sideX+12, panel2Y+18);
      // Sous-panneaux
      drawSubPanel(ctx, sideX+12, panel2Y+28, (sideW-36)/2, 120);
      drawSubPanel(ctx, sideX+24+(sideW-36)/2, panel2Y+28, (sideW-36)/2, 120);
      // Hold
      if(this.hold){ drawMat(ctx, this.hold.mat, sideX+12+24, panel2Y+28+36, 18, pieceColor(this.hold.key)); }
      // Next: affiche 2 grosses previews
      for(let i=0;i<2 && i<this.nextQueue.length;i++){
        drawMat(ctx, this.nextQueue[i].mat, sideX+24+(sideW-36)/2 + 24, panel2Y+28+22 + i*54, 18, pieceColor(this.nextQueue[i].key));
      }
    }

    // Jauge garbage compacte (badge) en haut à droite du plateau
    const incoming = this.garbage?.incoming||0;
    if(incoming>0){
      drawDangerBadge(ctx, offx+boardW-10, offy-10, incoming);
    }
  }
  handleInput(){}
  dispose(){
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.input?.stop?.();
  }
  onKeyDown = (e)=>{
    if(e.repeat) return;
  if(e.key==='ArrowUp'){ const r=rotateCW(this.active.mat); if(!collide(this.grid,{mat:r},this.x,this.y)) this.active.mat=r; }
  else if(e.key==='ArrowDown'){ this.y++; if(collide(this.grid,this.active,this.x,this.y)){ this.y--; lock(this); } }
    else if(e.key===' '){ // hard drop
      while(!collide(this.grid,this.active,this.x,this.y+1)) this.y++;
      lock(this);
    } else if(e.key==='c' || e.key==='C' || e.key==='Shift'){
      // Hold
      if(this.rules?.inputs?.allowHold){
        const consumes = !!this.rules?.inputs?.holdConsumesLock;
        if(!consumes || !this.holdUsed){ this.swapHold(); }
      }
    }
  }
  onKeyUp = (e)=>{}
}

function drawMat(ctx,mat,x0,y0,cell,color){
  for(let j=0;j<4;j++){
    for(let i=0;i<4;i++){
      if(!mat[j][i]) continue;
      const x = x0+i*cell, y=y0+j*cell;
      if(color==='ghost') drawGhostCell(ctx, x, y, cell);
      else drawTile(ctx, x, y, cell, color);
    }
  }
}
function spawn(bag){ const key=bag.next(); return { key, mat:TETROMINOS[key] }; }
function collide(grid, piece, x, y){ return grid.collide(piece.mat, x, y|0); }
function lock(self){
  const y=Math.floor(self.y);
  // fusionner en conservant la clé (on stocke la key pour colorier ensuite)
  self.grid.merge(self.active.mat, self.x, y, pieceColor(self.active.key));
  try{ audio.playImpactSfx?.(); }catch{}
  const cleared=self.grid.clear();
  // T-Spin très simplifié: si pièce T et collision de coins
  let tsp=null; if(self.active.key==='T' && cleared>0){ tsp = cleared===1? 'single' : cleared===2? 'double' : 'triple'; }
  self.scoring.onClear({ lines: cleared, tspin: tsp });
  if(cleared>0){ try{ audio.playBreakSfx?.(); }catch{} }
  self.combo = self.scoring.combo; self.b2b = self.scoring.b2b;
  const delaySec = (self.rules?.garbage?.delayMs ?? 600)/1000;
  const outgoing=self.rules.attackFor({ lines: cleared, tspinVariant:tsp, b2b:self.b2b, combo:Math.max(0,self.combo) });
  // Annulation net: d’abord annuler l’incoming, puis enqueuer le reste (solo: on simule du mirror pour test visuel)
  const cancelled = self.garbage.cancel(outgoing);
  const remain = Math.max(0, outgoing - cancelled);
  if(remain>0){ self.garbage.enqueue(remain, delaySec); }
  // Appliquer les garbage dont le délai est écoulé (tick depuis update)
  // Nouvelle pièce depuis la preview queue
  self.active = self.nextQueue.shift() || spawn(self.bag);
  self.nextQueue.push(spawn(self.bag));
  self.x=3; self.y=0; self.lockTimer=0; self.holdUsed=false;
}

function drawPanel(ctx,x,y,w,h,title){ ctx.strokeStyle='#475569'; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#94a3b8'; ctx.fillText(title, x+6, y+14); }
// Swap hold/active selon règles
SoloScreen.prototype.swapHold = function(){
  if(!(this.rules?.inputs?.allowHold)) return;
  const hasHeldBefore = !!this.hold;
  const current = { key:this.active.key, mat: this.active.mat.map(r=>r.slice()) };
  if(hasHeldBefore){
    // échanger
    this.active = this.hold;
    this.hold = current;
  } else {
    // stocker, prendre depuis next
    this.hold = current;
    this.active = this.nextQueue.shift() || spawn(this.bag);
    this.nextQueue.push(spawn(this.bag));
  }
  this.x=3; this.y=0; this.lockTimer=0;
  if(this.rules?.inputs?.holdConsumesLock){ this.holdUsed = true; }
};

// --- Helpers de rendu style legacy ---
function drawGrid(ctx, x0, y0, w, h, cell){
  ctx.save();
  ctx.strokeStyle = 'rgba(100,116,139,0.18)';
  ctx.lineWidth = 1;
  for(let x=0;x<=w;x++){ const X=x0+x*cell; ctx.beginPath(); ctx.moveTo(X+0.5, y0+0.5); ctx.lineTo(X+0.5, y0+h*cell+0.5); ctx.stroke(); }
  for(let y=0;y<=h;y++){ const Y=y0+y*cell; ctx.beginPath(); ctx.moveTo(x0+0.5, Y+0.5); ctx.lineTo(x0+w*cell+0.5, Y+0.5); ctx.stroke(); }
  ctx.restore();
}

function drawGlassFrame(ctx, x,y,w,h){
  ctx.save();
  // Ombre externe
  ctx.fillStyle='rgba(0,0,0,0.6)';
  roundRect(ctx, x+2, y+8, w, h, 16); ctx.shadowColor='rgba(0,0,0,0.55)'; ctx.shadowBlur=40; ctx.fill();
  // Liseré
  ctx.strokeStyle='rgba(56,189,248,.14)'; ctx.lineWidth=2; roundRect(ctx, x+2, y+8, w, h, 16); ctx.stroke();
  ctx.restore();
}

function drawInnerFrame(ctx, x,y,w,h){
  ctx.save();
  // Fond verre sombre
  const grd = ctx.createLinearGradient(0,y,0,y+h);
  grd.addColorStop(0,'#12161b'); grd.addColorStop(1,'#0e1216');
  ctx.fillStyle = grd;
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  // Lueur interne subtile
  ctx.strokeStyle='rgba(56,189,248,.08)'; ctx.lineWidth=1; roundRect(ctx, x+6, y+6, w-12, h-12, 10); ctx.stroke();
  ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

function drawTile(ctx, x,y, size, color){
  const theme = typeof color==='string' ? null : color;
  ctx.save();
  // Glow doux
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 10;
  // Remplissage
  if(theme){
    ctx.fillStyle = theme.base || '#2b3139';
  } else {
    const g = ctx.createLinearGradient(x, y, x, y+size);
    g.addColorStop(0, shade(color, 18));
    g.addColorStop(1, shade(color, -14));
    ctx.fillStyle = g;
  }
  roundRect(ctx, x+1, y+1, size-2, size-2, 6); ctx.fill();
  // Reflet
  if(theme){
    ctx.fillStyle = 'rgba(255,255,255,.06)';
  } else {
    ctx.fillStyle = shade(color, 30);
  }
  roundRect(ctx, x+3, y+3, size-6, size-10, 5); ctx.fill();
  // Liseré
  ctx.strokeStyle = theme ? 'rgba(56,189,248,.16)' : shade(color, -30);
  ctx.lineWidth=1; roundRect(ctx, x+1, y+1, size-2, size-2, 6); ctx.stroke();
  ctx.restore();
}

function drawGhostCell(ctx, x,y,size){
  ctx.save();
  ctx.strokeStyle='rgba(148,163,184,.55)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x+3, y+3, size-6, size-6, 6);
  ctx.stroke();
  ctx.restore();
}

function drawPanelGlass(ctx,x,y,w,h){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.35)';
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle='rgba(56,189,248,.12)'; ctx.lineWidth=1; roundRect(ctx, x, y, w, h, 12); ctx.stroke();
  ctx.restore();
}

function drawSubPanel(ctx,x,y,w,h){
  ctx.save(); ctx.fillStyle='rgba(255,255,255,.04)'; roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.restore();
}

function drawLabelValue(ctx, x,y, label, value, strong=false){
  ctx.save();
  ctx.fillStyle='#c8cfda'; ctx.font='12px system-ui,Segoe UI,Roboto,Arial';
  ctx.fillText(label, x, y);
  ctx.textAlign='right'; ctx.fillStyle = strong ? '#ffffff' : '#e5e7eb'; ctx.font = strong ? 'bold 12px system-ui,Segoe UI,Roboto,Arial' : '12px system-ui,Segoe UI,Roboto,Arial';
  ctx.fillText(value, x+240, y);
  ctx.textAlign='left';
  ctx.restore();
}

function drawDangerBadge(ctx, x, y, n){
  ctx.save();
  const w=22, h=18;
  roundRect(ctx, x-w, y-h, w, h, 6);
  ctx.fillStyle='linear-gradient(180deg,#ef4444,#b91c1c)'; // fallback simple
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 12px system-ui,Segoe UI,Roboto'; ctx.textAlign='center'; ctx.fillText(String(n), x-w/2, y-h/2+4);
  ctx.textAlign='left';
  ctx.restore();
}

function pieceColor(key){
  return {
    I:'#22d3ee', O:'#fbbf24', T:'#a78bfa', S:'#22c55e', Z:'#ef4444', J:'#60a5fa', L:'#fb923c'
  }[key] || '#60a5fa';
}

// Helpers couleur
function shade(hex, percent){
  // percent [-100..100]
  const {r,g,b} = hexToRgb(hex);
  const f = (v)=> Math.max(0, Math.min(255, Math.round(v + (percent/100)*255)));
  return rgbToHex(f(r), f(g), f(b));
}
function hexToRgb(hex){
  const h = hex.replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex(r,g,b){
  const to = (v)=> v.toString(16).padStart(2,'0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function computeGhostY(grid, active, x, y){
  let yy = Math.floor(y);
  while(!grid.collide(active.mat, x, yy+1)) yy++;
  return yy;
}
