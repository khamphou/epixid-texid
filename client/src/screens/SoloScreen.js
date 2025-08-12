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
  this.x=3; this.y=-2; this.rot=0; this.score=0; this.combo=-1; this.b2b=false; this.time=0;
  // Vitesse et délais depuis le YAML
  const lockMs = this.rules?.speed?.lockDelayMs; this.lockDelay = (typeof lockMs==='number'? lockMs : 500)/1000;
  // Gravité initiale (sera recalculée chaque frame via la gravityCurve)
  const g0 = Array.isArray(this.rules?.speed?.gravityCurve) && this.rules.speed.gravityCurve.length ? this.rules.speed.gravityCurve[0].gravity : 1;
  this.gravity = (typeof g0==='number' ? g0 : 1);
  this.dropAcc=0; this.lockTimer=0; this.holdDown=false; this._pendingLock=false;
    this.scoring = new Scoring();
    this.garbage = new Garbage();
    // Hold / Next
  this.hold = null; this.holdUsed = false;
    this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)];
    // Audio: intensité musique
  this._musicT = 0; this._musicLevel = 0.2;
  // Shake FX
  this._shake=0; this._shakeX=0; this._shakeY=0;
  // Animation de chute rapide lors d'un hard drop
  this._dropAnim = null;
  window.addEventListener('keydown', this.onKeyDown);
  window.addEventListener('keyup', this.onKeyUp);
  }
  update(dt){
    if(this.gameOver) return; // freeze
    this.time+=dt; this.objectives?.tick?.(dt);
    // Lock différé (au prochain tick)
    if(this._pendingLock){
      this._pendingLock=false;
      lock(this);
      if(this.checkObjectivesAndMaybeEnd()) return;
    }
    // Animation hard drop en cours ?
    if(this._dropAnim){
      this._dropAnim.t += dt;
      if(this._dropAnim.t >= this._dropAnim.dur){ this._dropAnim = null; }
    }
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
        this.y--;
        this._pendingLock = true; // coller au prochain tick
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

    // Shake léger: offsetter l’affichage du board
    if(this._shake>0){
      this._shakeX = (Math.random()*2-1) * this._shake;
      this._shakeY = (Math.random()*2-1) * this._shake;
      this._shake = Math.max(0, this._shake - 0.4);
    } else { this._shakeX=0; this._shakeY=0; }

    const bx = offx + this._shakeX;
    const by = offy + this._shakeY;

    // Cadre verre du plateau
    drawGlassFrame(ctx, bx-14, by-14, boardW+28, boardH+28);
    drawInnerFrame(ctx, bx, by, boardW, boardH);

    // Grille
    drawGrid(ctx, bx, by, this.grid.w, this.grid.h, cell);
    // Ghost piece (semi-transparent et plus léger si au-dessus)
    const ghostY = computeGhostY(this.grid, this.active, this.x, this.y);
    {
      const mat=this.active.mat; const y0=ghostY; const x0=this.x;
      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!mat[j][i]) continue; const gx=x0+i, gy=y0+j; if(gx<0||gx>=this.grid.w) continue;
          const px=bx+gx*cell, py=by+gy*cell; ctx.save(); ctx.globalAlpha = (gy<0? 0.35 : 0.75);
          drawGhostCell(ctx, px, py, cell);
          ctx.restore();
        }
      }
    }
    // Tuiles posées (masquer temporairement celles de la pièce verrouillée si une anim de drop est en cours)
    let hideSet = null;
    if(this._dropAnim){
      hideSet = new Set(this._dropAnim.finalCells?.map(c => `${c.x},${c.y}`));
    }
    for(let y=0;y<this.grid.h;y++){
      for(let x=0;x<this.grid.w;x++){
        if(hideSet && hideSet.has(`${x},${y}`)) continue;
        const v = this.grid.cells[y][x];
        if(v){
          const col = typeof v==='string' ? v : pieceColor(v);
          drawTile(ctx, bx+x*cell, by+y*cell, cell, col);
        }
      }
    }
    // Pièce active (parties au-dessus du plateau en transparence)
    {
      const mat = this.active.mat; const y0 = Math.floor(this.y); const x0 = this.x; const color = pieceColor(this.active.key);
      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!mat[j][i]) continue;
          const gy = y0 + j; const gx = x0 + i; if(gx<0||gx>=this.grid.w) continue;
          const px = bx + gx*cell; const py = by + gy*cell;
          ctx.save(); if(gy < 0){ ctx.globalAlpha = 0.45; }
          drawTile(ctx, px, py, cell, color);
          ctx.restore();
        }
      }
    }

    // Animation de chute rapide (overlay) – pièce précédente interpolée entre yStart -> yEnd
    if(this._dropAnim){
      const a = this._dropAnim;
      const k = Math.min(1, a.t / a.dur);
      const kk = easeOutCubic(k);
      const yInterp = a.yStart + (a.yEnd - a.yStart) * kk;
      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!a.mat[j][i]) continue;
          const gx = a.x + i; const gyf = yInterp + j; const gy = Math.floor(gyf);
          if(gx<0||gx>=this.grid.w) continue;
          const px = bx + gx*cell; const py = by + gyf*cell;
          ctx.save();
          // Légère transparence et flou de mouvement minimal
          ctx.globalAlpha = 0.9;
          drawTile(ctx, px, py, cell, a.color);
          ctx.restore();
        }
      }
    }

    // Légende sous plateau
  ctx.fillStyle = '#b6c2cf'; ctx.font = '12px system-ui,Segoe UI,Roboto,Arial';
  ctx.textAlign='center'; ctx.fillText('kham', bx+boardW/2, by+boardH+22);
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
  // Labels HOLD / NEXT (à l'intérieur, en haut-gauche)
  ctx.fillStyle='#94a3b8'; ctx.font='bold 12px system-ui,Segoe UI,Roboto';
  ctx.textAlign='left'; ctx.fillText('HOLD', sideX+12+10, subTop+16);
  ctx.textAlign='left'; ctx.fillText('NEXT', sideX+24+subW+10, subTop+16);
    if(this.hold){ drawMat(ctx, this.hold.mat, sideX+12+24, subTop+36, 18, pieceColor(this.hold.key)); }
    // Dessin des deux prochaines pièces et hitbox de la première pour HOLD
    this._nextHit = null;
    for(let i=0;i<2 && i<this.nextQueue.length;i++){
      const nx = sideX+24+subW + 24;
      const ny = subTop+22 + i*54;
      drawMat(ctx, this.nextQueue[i].mat, nx, ny, 18, pieceColor(this.nextQueue[i].key));
      if(i===0){ this._nextHit = { x:nx, y:ny, w:18*4, h:18*4 }; }
    }

    // Garbage badge
    const incoming = this.garbage?.incoming||0;
  if(incoming>0){ drawDangerBadge(ctx, bx+boardW-10, by-10, incoming); }

    // Overlays du parent (toasts, game over)
  this._boardRect = { x:bx, y:by, w:boardW, h:boardH, cell };
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
  onRotateCCW(){ const r=rotateCW(rotateCW(rotateCW(this.active.mat))); if(!collide(this.grid,{mat:r},this.x,this.y)) this.active.mat=r; }
  onHardDrop(){
    // Préparer l'animation de chute (copie de la pièce courante)
    const startY = Math.floor(this.y);
    const endY = computeGhostY(this.grid, this.active, this.x, this.y);
    const pieceCopy = { mat: this.active.mat.map(r=>r.slice()) };
    const color = pieceColor(this.active.key);
    const finalCells = [];
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(pieceCopy.mat[j][i]) finalCells.push({ x:this.x+i, y:endY+j });
    const dist = Math.max(0, (endY - startY));
    const dur = Math.max(0.09, Math.min(0.22, 0.06 + dist*0.015)); // 60ms + 15ms/ligne, borné
    this._dropAnim = { mat: pieceCopy.mat, color, x:this.x, yStart:startY, yEnd:endY, t:0, dur, finalCells };
    // Poser instantanément pour le gameplay et afficher la prochaine pièce tout de suite
    this.y = endY; // pas strictement nécessaire mais explicite
    lock(this);
    this.checkObjectivesAndMaybeEnd();
  }
  onMove(step){ const nx = this.x + Math.sign(step); if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; } }
  onSoftDropTick(dt){ this.dropAcc += dt*this.gravity*18; }
  onHold(){
    if(this.rules?.inputs?.allowHold){
      const consumes = !!this.rules?.inputs?.holdConsumesLock;
      if(!consumes || !this.holdUsed){ this.swapHold(); }
    }
  }

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
  // Secousse à l'impact
  try{ self._shake = Math.min(3, (self._shake||0) + 1.2); }catch{}
  const cleared=self.grid.clear();
  let tsp=null; if(self.active.key==='T' && cleared>0){ tsp = cleared===1? 'single' : cleared===2? 'double' : 'triple'; }
  self.scoring.onClear({ lines: cleared, tspin: tsp });
  try{ self.objectives?.onClear?.({ lines: cleared, tspin: tsp, combo: self.scoring?.combo||0 }); }catch{}
  if(cleared>0){ try{ self.noteLineClear?.(cleared); }catch{} }
  // Secousse plus forte selon nb de lignes
  if(cleared>0){ try{ self._shake = Math.min(6, (self._shake||0) + 0.8*cleared + (cleared>=4? 1.0:0)); }catch{} }
  self.combo = self.scoring.combo; self.b2b = self.scoring.b2b;
  const delaySec = (self.rules?.garbage?.delayMs ?? 600)/1000;
  const outgoing=self.rules.attackFor({ lines: cleared, tspinVariant:tsp, b2b:self.b2b, combo:Math.max(0,self.combo) });
  const cancelled = self.garbage.cancel(outgoing);
  const remain = Math.max(0, outgoing - cancelled);
  if(remain>0){ self.garbage.enqueue(remain, delaySec); }
  // Si l’impact s’est produit au-dessus de la grille, c’est un top-out
  if(y < 0){ try{ self.triggerGameOver?.(); self.objectives?.onKO?.(); }catch{} return; }
  // Nouvelle pièce
  self.active = self.nextQueue.shift() || spawn(self.bag);
  self.nextQueue.push(spawn(self.bag));
  self.x=3; self.y=-2; self.lockTimer=0; self.holdUsed=false;
  // Top-out: si la nouvelle pièce est bloquée dès le spawn -> KO
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
  this.x=3; this.y=-2; this.lockTimer=0;
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

function easeOutCubic(t){ t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
