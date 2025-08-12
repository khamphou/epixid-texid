import { Grid } from '../engine/grid.js';
import { Bag } from '../engine/bag.js';
import { TETROMINOS, rotateCW } from '../engine/piece.js';
import { Scoring } from '../engine/scoring.js';
import { Input } from '../engine/input.js';
import { Garbage } from '../engine/garbage.js';

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
          this.grid = new Grid(10,20); this.bag=new Bag(); this.active=spawn(this.bag); this.x=3; this.y=0; this.scoring=new Scoring();
        }
      }
    }
  }
  render(ctx){
    ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
    const cell=24, offx=40, offy=20;
    // draw grid
    for(let y=0;y<this.grid.h;y++) for(let x=0;x<this.grid.w;x++){ const c=this.grid.cells[y][x]; if(c){ ctx.fillStyle='#1f2937'; ctx.fillRect(offx+x*cell, offy+y*cell, cell-2, cell-2);} }
    // active
  drawMat(ctx, this.active.mat, offx+this.x*cell, offy+Math.floor(this.y)*cell, cell, '#60A5FA');
  ctx.fillStyle='#9ca3af';
  ctx.fillText('Score: '+(this.scoring?.score||0), 10, 16);
  ctx.fillText('Lignes: '+(this.scoring?.lines||0), 10, 34);
  ctx.fillText('Combo: '+(this.scoring?.combo>=0?this.scoring.combo:0), 10, 52);
  ctx.fillText('B2B: '+(this.scoring?.b2b?'ON':'OFF'), 10, 70);
  // Jauge garbage
  const slabs = this.garbage.snapshot();
  const gx=10, gy=90, gw=120, gh=8, gap=4;
  ctx.fillText('Incoming: '+(this.garbage?.incoming||0), gx, gy-6);
  for(let i=0;i<slabs.length;i++){
    const s=slabs[i]; const y=gy+i*(gh+gap); const pct= Math.max(0, Math.min(1, 1 - (s.timer/(s.total||1e-6))));
    ctx.fillStyle='#334155'; ctx.fillRect(gx, y, gw, gh);
    ctx.fillStyle='#ef4444'; ctx.fillRect(gx, y, gw*pct, gh);
    ctx.fillStyle='#e5e7eb'; ctx.fillText('+'+s.lines, gx+gw+6, y+gh-1);
  }
  // Hold & Next panels à droite
  drawPanel(ctx, offx+10*cell+24, offy, 100, 100, 'Hold');
  if(this.hold){ drawMat(ctx, this.hold.mat, offx+10*cell+24+16, offy+24, 16, '#10b981'); }
  drawPanel(ctx, offx+10*cell+24, offy+120, 100, 160, 'Next');
  for(let i=0;i<Math.min(5,this.nextQueue.length);i++){
    drawMat(ctx, this.nextQueue[i].mat, offx+10*cell+24+16, offy+150+i*28, 16, '#60A5FA');
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

function drawMat(ctx,mat,x0,y0,cell,color){ ctx.fillStyle=color; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]) ctx.fillRect(x0+i*cell, y0+j*cell, cell-2, cell-2); }
function spawn(bag){ const key=bag.next(); return { key, mat:TETROMINOS[key] }; }
function collide(grid, piece, x, y){ return grid.collide(piece.mat, x, y|0); }
function lock(self){
  const y=Math.floor(self.y);
  self.grid.merge(self.active.mat, self.x, y);
  const cleared=self.grid.clear();
  // T-Spin très simplifié: si pièce T et collision de coins
  let tsp=null; if(self.active.key==='T' && cleared>0){ tsp = cleared===1? 'single' : cleared===2? 'double' : 'triple'; }
  self.scoring.onClear({ lines: cleared, tspin: tsp });
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
