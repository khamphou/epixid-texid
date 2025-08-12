import { Grid } from '../engine/grid.js';
import { Bag } from '../engine/bag.js';
import { TETROMINOS, rotateCW } from '../engine/piece.js';
import { Scoring } from '../engine/scoring.js';
import { Garbage } from '../engine/garbage.js';
import { audio } from '../audio.js';
import { BaseGameScreen } from './BaseGameScreen.js';

export class SoloScreen extends BaseGameScreen {
  constructor(core, { rules, objectives }){
    super(core, { rules, objectives });
    this.core=core; this.rules=rules; this.objectives=objectives;
  }
  async init(){
    await super.init?.();
    // Bouton "Nouvelle partie" visible en Solo/Training
    try{
      const btn = document.getElementById('btn-new');
      if(btn){ btn.classList.remove('hidden'); btn.onclick = ()=> this.restart(); }
    }catch{}
    this.grid = new Grid(10,20); this.bag=new Bag(); this.active=spawn(this.bag);
  this.x=3; this.y=0; this.rot=0; this.score=0; this.combo=-1; this.b2b=false; this.time=0;
  // Vitesse et délais depuis le YAML
  const lockMs = this.rules?.speed?.lockDelayMs; this.lockDelay = (typeof lockMs==='number'? lockMs : 500)/1000;
  // Gravité initiale (sera recalculée chaque frame via la gravityCurve)
  const g0 = Array.isArray(this.rules?.speed?.gravityCurve) && this.rules.speed.gravityCurve.length ? this.rules.speed.gravityCurve[0].gravity : 1;
  this.gravity = (typeof g0==='number' ? g0 : 1);
  this.dropAcc=0; this.lockTimer=0; this.holdDown=false;
    this.scoring = new Scoring();
    this.garbage = new Garbage();
    // Hold / Next
    this.hold = null; this.holdUsed = false;
    this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)];
    // Audio: intensité musique
    this._musicT = 0; this._musicLevel = 0.2;
  window.addEventListener('keydown', this.onKeyDown);
  window.addEventListener('keyup', this.onKeyUp);
  }
  update(dt){
    if(this.gameOver) return; // freeze
    this.time+=dt; this.objectives?.tick?.(dt);
  // Entrées centralisées (DAS/ARR + soft drop) traitées avant la gravité
  super.update?.(dt);
  // Appliquer la gravityCurve YAML (paliers de vitesse)
  const g = this.rules?.speed?.gravityCurve||[];
  if(g.length){ const t=this.time; let cur=g[0].gravity; for(const p of g){ if(t>=p.t) cur=p.gravity; } this.gravity = (typeof cur==='number'? cur : 1); }
  // Gravité de base; l'accélération soft drop est appliquée via onSoftDropTick()
  const gravityFactor = 1.6;
    this.dropAcc += dt*this.gravity*gravityFactor;
    while(this.dropAcc>=1){
      this.dropAcc-=1; this.y+=1;
      if(collide(this.grid,this.active,this.x,this.y)) {
        this.y--; this.lockTimer+=dt;
        if(this.lockTimer>=this.lockDelay){
          lock(this);
          if(this.checkObjectivesAndMaybeEnd()) return;
        }
        break;
      } else { this.lockTimer=0; }
    }
    // garbage timers -> appliquer si écoulés
    const apply = this.garbage.tick(dt);
    if(apply>0){
      for(let k=0;k<apply;k++){
        const hole = Math.floor(Math.random()*this.grid.w);
        this.grid.cells.shift();
        const row = Array(this.grid.w).fill(1); row[hole]=null;
        this.grid.cells.push(row);
      }
      if(collide(this.grid, this.active, this.x, this.y)){
        this.y -= apply;
        if(collide(this.grid,this.active,this.x,this.y)){
          this.triggerGameOver();
        }
      }
    }
    // Musique: adapter l'intensité
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

    // Layout (board + sidebar). Sidebar toujours visible: si manque de place, elle passe dessous.
    const rect = ctx.canvas.getBoundingClientRect();
    const W = rect.width; const H = rect.height;
    const topbarEl = (typeof document!=='undefined') ? document.getElementById('topbar') : null;
    const topbarVisible = !!topbarEl && getComputedStyle(topbarEl).display !== 'none';
    const topbarH = topbarVisible ? (topbarEl.getBoundingClientRect().height||0) : 0;

    const cell = 24;
    const boardW = this.grid.w*cell;
    const boardH = this.grid.h*cell;
    const gap = 26;
    const sideMinW = 260; // min garanti
    const sideIdealW = 300;
    const margin = 16;

    // Essayons side à droite; si trop étroit, basculer en dessous (stack)
    const needW = boardW + gap + sideMinW + margin*2;
    const canSideBySide = W >= needW;

    let offx, offy, sideX, sideY, sideW, sideH;
    if(canSideBySide){
      const totalW = boardW + gap + sideIdealW;
      offx = Math.max(margin, Math.floor((W - totalW)/2));
      offy = Math.max(margin + topbarH, Math.floor((H - boardH)/2));
      sideX = offx + boardW + gap; sideY = offy; sideW = sideIdealW; sideH = Math.max(180, Math.min(boardH, 360));
    } else {
      // sous le board
      const totalH = boardH + gap + 180;
      offx = Math.max(margin, Math.floor((W - boardW)/2));
      offy = Math.max(margin + topbarH, Math.floor((H - totalH)/2));
      sideX = Math.max(margin, Math.floor((W - sideIdealW)/2));
      sideY = offy + boardH + gap; sideW = Math.min(sideIdealW, W - margin*2); sideH = 180;
    }

    // Cadre verre du plateau
    drawGlassFrame(ctx, offx-14, offy-14, boardW+28, boardH+28);
    drawInnerFrame(ctx, offx, offy, boardW, boardH);

    // Grille
    drawGrid(ctx, offx, offy, this.grid.w, this.grid.h, cell);

    // Ghost piece
    const ghostY = computeGhostY(this.grid, this.active, this.x, this.y);
    drawMat(ctx, this.active.mat, offx+this.x*cell, offy+ghostY*cell, cell, 'ghost');

    // Tuiles posées
    for(let y=0;y<this.grid.h;y++){
      for(let x=0;x<this.grid.w;x++){
        const v = this.grid.cells[y][x];
        if(v){
          const col = typeof v==='string' ? v : pieceColor(v);
          drawTile(ctx, offx+x*cell, offy+y*cell, cell, col);
        }
      }
    }

    // Pièce active
    const color = pieceColor(this.active.key);
    drawMat(ctx, this.active.mat, offx+this.x*cell, offy+Math.floor(this.y)*cell, cell, color);

    // Légende sous plateau
    ctx.fillStyle = '#b6c2cf'; ctx.font = '12px system-ui,Segoe UI,Roboto,Arial';
    ctx.textAlign='center'; ctx.fillText('kham', offx+boardW/2, offy+boardH+22);
    ctx.textAlign='left';

    // Sidebar (toujours visible)
    drawPanelGlass(ctx, sideX, sideY, sideW, sideH);
  drawLabelValue(ctx, sideX+14, sideY+22, 'Joueur', 'kham', false, sideW);
  drawLabelValue(ctx, sideX+14, sideY+44, 'Niveau', 'Pepouz', false, sideW);
  drawLabelValue(ctx, sideX+14, sideY+66, 'Score', String(this.scoring?.score||0), true, sideW);
  drawLabelValue(ctx, sideX+14, sideY+88, 'Lignes', String(this.scoring?.lines||0), false, sideW);

    // Sous-panneaux Hold/Next
    const subTop = sideY + 110;
    const subW = Math.floor((sideW - 36)/2);
    drawSubPanel(ctx, sideX+12, subTop, subW, 120);
    drawSubPanel(ctx, sideX+24+subW, subTop, subW, 120);
    if(this.hold){ drawMat(ctx, this.hold.mat, sideX+12+24, subTop+36, 18, pieceColor(this.hold.key)); }
    for(let i=0;i<2 && i<this.nextQueue.length;i++){
      drawMat(ctx, this.nextQueue[i].mat, sideX+24+subW + 24, subTop+22 + i*54, 18, pieceColor(this.nextQueue[i].key));
    }

    // Garbage badge
    const incoming = this.garbage?.incoming||0;
    if(incoming>0){ drawDangerBadge(ctx, offx+boardW-10, offy-10, incoming); }

    // Overlays du parent (toasts, game over)
    this._boardRect = { x:offx, y:offy, w:boardW, h:boardH, cell };
    super.render?.(ctx);
  }
  handleInput(){}
  dispose(){
  try{ const btn=document.getElementById('btn-new'); if(btn){ btn.classList.add('hidden'); btn.onclick=null; } }catch{}
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  this.input?.stop?.();
    super.dispose?.();
  }
  getBoardRect(){ return this._boardRect || { x:0,y:0,w:0,h:0,cell:24 }; }

  // BaseGameScreen hooks
  onRotate(){ const r=rotateCW(this.active.mat); if(!collide(this.grid,{mat:r},this.x,this.y)) this.active.mat=r; }
  onHardDrop(){ while(!collide(this.grid,this.active,this.x,this.y+1)) this.y++; lock(this); this.checkObjectivesAndMaybeEnd(); }
  onMove(step){ const nx = this.x + Math.sign(step); if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; } }
  onSoftDropTick(dt){ this.dropAcc += dt*this.gravity*18; }

  onKeyDown = (e)=>{
    if(e.repeat || this.gameOver) return;
    if(e.key==='c' || e.key==='C' || e.key==='Shift'){
      if(this.rules?.inputs?.allowHold){
        const consumes = !!this.rules?.inputs?.holdConsumesLock;
        if(!consumes || !this.holdUsed){ this.swapHold(); }
      }
    }
  }
  onKeyUp = (_e)=>{}
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
  self.grid.merge(self.active.mat, self.x, y, pieceColor(self.active.key));
  try{ audio.playImpactSfx?.(); }catch{}
  const cleared=self.grid.clear();
  let tsp=null; if(self.active.key==='T' && cleared>0){ tsp = cleared===1? 'single' : cleared===2? 'double' : 'triple'; }
  self.scoring.onClear({ lines: cleared, tspin: tsp });
  try{ self.objectives?.onClear?.({ lines: cleared, tspin: tsp, combo: self.scoring?.combo||0 }); }catch{}
  if(cleared>0){ try{ self.noteLineClear?.(cleared); }catch{} }
  self.combo = self.scoring.combo; self.b2b = self.scoring.b2b;
  const delaySec = (self.rules?.garbage?.delayMs ?? 600)/1000;
  const outgoing=self.rules.attackFor({ lines: cleared, tspinVariant:tsp, b2b:self.b2b, combo:Math.max(0,self.combo) });
  const cancelled = self.garbage.cancel(outgoing);
  const remain = Math.max(0, outgoing - cancelled);
  if(remain>0){ self.garbage.enqueue(remain, delaySec); }
  // Nouvelle pièce
  self.active = self.nextQueue.shift() || spawn(self.bag);
  self.nextQueue.push(spawn(self.bag));
  self.x=3; self.y=0; self.lockTimer=0; self.holdUsed=false;
  // Top-out: si la nouvelle pièce spawn en collision, c'est fini
  if(collide(self.grid, self.active, self.x, self.y)){
  try{ self.triggerGameOver?.(); self.objectives?.onKO?.(); }catch{}
  }
}

function drawPanel(ctx,x,y,w,h,title){ ctx.strokeStyle='#475569'; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#94a3b8'; ctx.fillText(title, x+6, y+14); }
// Swap hold/active selon règles
SoloScreen.prototype.swapHold = function(){
  if(!(this.rules?.inputs?.allowHold)) return;
  const hasHeldBefore = !!this.hold;
  const current = { key:this.active.key, mat: this.active.mat.map(r=>r.slice()) };
  if(hasHeldBefore){
    this.active = this.hold;
    this.hold = current;
  } else {
    this.hold = current;
    this.active = this.nextQueue.shift() || spawn(this.bag);
    this.nextQueue.push(spawn(this.bag));
  }
  this.x=3; this.y=0; this.lockTimer=0;
  if(this.rules?.inputs?.holdConsumesLock){ this.holdUsed = true; }
};

// Redémarrage propre (réinitialise l’état et repart avec le même mode)
SoloScreen.prototype.restart = function(){
  // Récrée un SoloScreen avec les mêmes règles/objectifs
  try{
    const ctor = this.constructor; // SoloScreen
    const next = new ctor(this.core, { rules: this.rules, objectives: this.objectives });
    this.core.sm.replace(next);
  }catch{}
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
  ctx.fillStyle='rgba(0,0,0,0.6)';
  roundRect(ctx, x+2, y+8, w, h, 16); ctx.shadowColor='rgba(0,0,0,0.55)'; ctx.shadowBlur=40; ctx.fill();
  ctx.strokeStyle='rgba(56,189,248,.14)'; ctx.lineWidth=2; roundRect(ctx, x+2, y+8, w, h, 16); ctx.stroke();
  ctx.restore();
}

function drawInnerFrame(ctx, x,y,w,h){
  ctx.save();
  const grd = ctx.createLinearGradient(0,y,0,y+h);
  grd.addColorStop(0,'#12161b'); grd.addColorStop(1,'#0e1216');
  ctx.fillStyle = grd;
  roundRect(ctx, x, y, w, h, 12); ctx.fill();
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
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 10;
  if(theme){ ctx.fillStyle = theme.base || '#2b3139'; }
  else {
    const g = ctx.createLinearGradient(x, y, x, y+size);
    g.addColorStop(0, shade(color, 18));
    g.addColorStop(1, shade(color, -14));
    ctx.fillStyle = g;
  }
  roundRect(ctx, x+1, y+1, size-2, size-2, 6); ctx.fill();
  if(theme){ ctx.fillStyle = 'rgba(255,255,255,.06)'; }
  else { ctx.fillStyle = shade(color, 30); }
  roundRect(ctx, x+3, y+3, size-6, size-10, 5); ctx.fill();
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

function drawSubPanel(ctx,x,y,w,h){ ctx.save(); ctx.fillStyle='rgba(255,255,255,.04)'; roundRect(ctx, x, y, w, h, 10); ctx.fill(); ctx.restore(); }

function drawLabelValue(ctx, x,y, label, value, strong=false, panelW=240){
  ctx.save();
  ctx.fillStyle='#c8cfda'; ctx.font='12px system-ui,Segoe UI,Roboto,Arial';
  ctx.fillText(label, x, y);
  ctx.textAlign='right'; ctx.fillStyle = strong ? '#ffffff' : '#e5e7eb'; ctx.font = strong ? 'bold 12px system-ui,Segoe UI,Roboto,Arial' : '12px system-ui,Segoe UI,Roboto,Arial';
  const valueX = x + Math.max(160, Math.min(240, (panelW||240) - 40));
  ctx.fillText(value, valueX, y);
  ctx.textAlign='left';
  ctx.restore();
}

function drawDangerBadge(ctx, x, y, n){
  ctx.save();
  const w=22, h=18;
  roundRect(ctx, x-w, y-h, w, h, 6);
  ctx.fillStyle='linear-gradient(180deg,#ef4444,#b91c1c)';
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 12px system-ui,Segoe UI,Roboto'; ctx.textAlign='center'; ctx.fillText(String(n), x-w/2, y-h/2+4);
  ctx.textAlign='left';
  ctx.restore();
}

function pieceColor(key){
  return { I:'#22d3ee', O:'#fbbf24', T:'#a78bfa', S:'#22c55e', Z:'#ef4444', J:'#60a5fa', L:'#fb923c' }[key] || '#60a5fa';
}

function shade(hex, percent){
  const {r,g,b} = hexToRgb(hex);
  const f = (v)=> Math.max(0, Math.min(255, Math.round(v + (percent/100)*255)));
  return rgbToHex(f(r), f(g), f(b));
}
function hexToRgb(hex){ const h = hex.replace('#',''); const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
function rgbToHex(r,g,b){ const to = (v)=> v.toString(16).padStart(2,'0'); return `#${to(r)}${to(g)}${to(b)}`; }

function computeGhostY(grid, active, x, y){ let yy = Math.floor(y); while(!grid.collide(active.mat, x, yy+1)) yy++; return yy; }
