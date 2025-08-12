import { SoloScreen } from './SoloScreen.js';
import { TETROMINOS } from '../engine/piece.js';

// Écran Training: identique au Solo, avec assistance IA (Mode Easy)
export class TrainingScreen extends SoloScreen {
  constructor(core, { rules, objectives }){
    super(core, { rules, objectives });
    this.easyMode = true; // activé par défaut en Training
    this.aiProfile = 'equilibre'; // 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
    this._hint = null; // { x, rot, yLanding, score, cleared }
    this._lastState = { x: null, y: null, rot: null, gridHash: null, key: null, next0: null, next1: null };
  this._hintCooldown = 0; // (legacy) non utilisé si recalcul au spawn uniquement
  this._hintForKey = null; // clé de la pièce pour laquelle l'indice est valide
  this._needHintRecompute = true; // forcer un recalcul (ex: changement de profil)
    // UI handlers
    this._ui = { btn:null, dd:null, ddOpen:false, onClick:null, onDocClick:null };
  }

  async init(){
    await super.init();
    // Afficher la topbar et le bouton Easy en Training
    try{
      document.getElementById('topbar')?.classList.remove('hidden');
      const btn = document.getElementById('easy-btn');
      const dd = document.getElementById('ai-dd');
      if(btn && dd){
        btn.classList.remove('hidden');
        // Charger le profil persisté
        let saved = null;
        try{ saved = localStorage.getItem('texid_ai_profile'); }catch{}
        if(saved === 'off'){
          this.easyMode = false;
          btn.setAttribute('aria-pressed','false');
          btn.classList.remove('active');
        } else if(saved && ['prudent','conservateur','equilibre','agressif'].includes(saved)){
          this.aiProfile = saved;
          this.easyMode = true;
          btn.setAttribute('aria-pressed','true');
          btn.classList.add('active');
        } else {
          // défaut: équilibré actif
          this.easyMode = true;
          this.aiProfile = this.aiProfile || 'equilibre';
          btn.setAttribute('aria-pressed','true');
          btn.classList.add('active');
        }
        this._syncEasyClasses();

        // Synchroniser les checks menu à l'init
        const cur = this.easyMode ? (this.aiProfile||'equilibre') : 'off';
        dd.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b.dataset.value===cur ? 'true':'false'));

  const positionDropdown = ()=>{
          try{
            const r = btn.getBoundingClientRect();
            const wasHidden = dd.classList.contains('hidden');
            if(wasHidden){ dd.style.visibility='hidden'; dd.classList.remove('hidden'); }
            const menuW = dd.offsetWidth;
            const left = Math.max(8, Math.round(r.right - menuW));
            dd.style.left = left + 'px';
            dd.style.top = Math.round(r.bottom + 4) + 'px'; // petit écart de 4px
            if(wasHidden){ dd.classList.add('hidden'); dd.style.visibility=''; }
          }catch{}
        };

        const closeDD = ()=>{ dd.classList.add('hidden'); btn.setAttribute('aria-expanded','false'); this._ui.ddOpen=false; };
        const onClick = (e)=>{
          e.stopPropagation?.();
          if(this._ui.ddOpen){ closeDD(); return; }
          positionDropdown();
          dd.classList.remove('hidden');
          dd.classList.add('connector'); // connecteur visuel
          btn.setAttribute('aria-expanded','true');
          this._ui.ddOpen = true;
        };
        const onDoc = (e)=>{ if(!this._ui.ddOpen) return; if(!dd.contains(e.target) && e.target!==btn){ closeDD(); } };
        btn.addEventListener('click', onClick);
        document.addEventListener('click', onDoc);

        // Sélection d’un profil
        dd.querySelectorAll('.ai-opt')?.forEach(el=>{
          el.addEventListener('click', (ev)=>{
            const v = ev.currentTarget?.dataset?.value || 'off';
            if(v==='off'){
              this.easyMode=false; this._hint=null; btn.setAttribute('aria-pressed','false'); btn.classList.remove('active'); this._syncEasyClasses();
              try{ localStorage.setItem('texid_ai_profile','off'); }catch{}
              dd.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b.dataset.value==='off' ? 'true':'false'));
              closeDD();
              return;
            }
            const changed = (this.aiProfile !== v);
            this.aiProfile = v;
            if(!this.easyMode){ this.easyMode = true; }
            btn.setAttribute('aria-pressed','true'); btn.classList.add('active');
            this._syncEasyClasses();
            try{ localStorage.setItem('texid_ai_profile', v); }catch{}
            dd.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b.dataset.value===v ? 'true':'false'));
            if(changed) this._forceHintRecompute();
            closeDD();
          });
        });
        this._ui = { btn, dd, ddOpen:false, onClick, onDocClick:onDoc };
      }
    }catch{}
  }

  dispose(){
    try{
      const { btn, dd, onClick, onDocClick } = this._ui;
      if(btn && onClick) btn.removeEventListener('click', onClick);
      if(onDocClick) document.removeEventListener('click', onDocClick);
      // Réinitialiser l’état visuel du bouton (reste visible mais non actif hors Training)
      if(btn){ btn.setAttribute('aria-pressed','false'); btn.classList.remove('active','easy-prudent','easy-conservateur','easy-equilibre','easy-agressif'); }
      if(dd){ dd.classList.add('hidden'); }
    }catch{}
    super.dispose();
  }

  update(dt){
    super.update(dt);
    if(this.gameOver) return;
    // Ne calcule l'indice que lors du spawn (ou changement de profil)
    if(this.easyMode && this.active){
      const curKey = this.active?.key || null;
      if(this._needHintRecompute || this._hintForKey !== curKey){
        this._computeHint();
        this._hintForKey = curKey;
        this._needHintRecompute = false;
      }
    } else {
      this._hint = null; this._hintForKey = null;
    }
  }

  render(ctx){
    super.render(ctx);
    if(!this.easyMode || !this._hint || !this.active) return;
    const br = this.getBoardRect();
    const { x:bx, y:by, cell } = br;
    const mat = rotateN(TETROMINOS[this.active.key], this._hint.rot);
    const t = (performance.now()%1000)/1000; const pulse = 0.45 + 0.45*Math.abs(Math.sin(t*Math.PI*2));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45*pulse;
    ctx.strokeStyle='rgba(56,189,248,0.9)';
    ctx.lineWidth = 2;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
      const gx = this._hint.x + i; const gy = this._hint.yLanding + j; if(gx<0||gx>=this.grid.w||gy>=this.grid.h) continue;
      const px = bx + gx*cell, py = by + gy*cell;
      roundRect(ctx, px+2, py+2, cell-4, cell-4, 6); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- IA Easy (portée depuis legacy/src/main.js) ----
  _forceHintRecompute(){ this._lastState = { x:null, y:null, rot:null, gridHash:null, key:null, next0:null, next1:null }; this._hintCooldown=0; this._needHintRecompute = true; }
  _syncEasyClasses(){
    const btn = this._ui.btn; if(!btn) return;
    btn.classList.remove('easy-prudent','easy-conservateur','easy-equilibre','easy-agressif');
  if(!this.easyMode) return;
    const p = this.aiProfile||'equilibre';
    const cls = (p==='prudent')? 'easy-prudent' : (p==='conservateur')? 'easy-conservateur' : (p==='agressif')? 'easy-agressif' : 'easy-equilibre';
    btn.classList.add(cls);
  }
  _snapState(){
    // Hash léger de la grille
    let h=0; const c=this.grid.cells;
    for(let y=0;y<this.grid.h;y+=4){
      for(let x=0;x<this.grid.w;x+=3){ if(c[y] && c[y][x]) h=(h*131 + ((x+1)*(y+3)))|0; }
    }
    return { x:this.x|0, y:Math.floor(this.y), rot:this.rot|0, gridHash:h|0, key:this.active?.key||null, next0:this.nextQueue?.[0]?.key||null, next1:this.nextQueue?.[1]?.key||null };
  }
  _stateChanged(s){ const p=this._lastState; const changed = !p || s.x!==p.x || s.y!==p.y || s.rot!==p.rot || s.gridHash!==p.gridHash || s.key!==p.key || s.next0!==p.next0 || s.next1!==p.next1; this._lastState = s; return changed; }

  _computeHint(){
    if(!this.active){ this._hint=null; return; }
    const COLS = this.grid.w|0, ROWS = this.grid.h|0;
    const pieceKey = this.active.key;
    const gridNow = this._asSim();
    let best=null, bestNonClear=null;
    const holesBefore = countHoles(gridNow, COLS, ROWS);
    const heightBefore = stackHeight(gridNow, COLS, ROWS);
    const freeRows = ROWS - heightBefore;
    const inDanger = freeRows <= 4;
    const next1 = this.nextQueue?.[0]?.key || null;
    const next2 = this.nextQueue?.[1]?.key || null;
    const upcomingKeys = [next1, next2].concat(this.nextQueue.slice(2).map(p=>p.key));
    const iIndex = upcomingKeys.findIndex(k=> k==='I');
    const iSoon = iIndex>=0 && iIndex<=4;
    const preferRightWell = iSoon;
    for(let rot=0; rot<4; rot++){
      const mat = rotateN(TETROMINOS[pieceKey], rot);
      let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
      for(let px=-minX; px<=COLS-(maxX+1); px++){
        let py=-2; while(!collideGrid(gridNow, COLS, ROWS, px, py+1, mat)) py++;
        if(py<-1) continue;
        const sim = cloneSim(gridNow);
        placeOn(sim, COLS, ROWS, px, py, mat, pieceKey);
        const cleared = simulateClear(sim, COLS, ROWS);
        const h1 = stackHeight(sim, COLS, ROWS);
        const holes = countHoles(sim, COLS, ROWS);
        const bump = bumpiness(sim, COLS, ROWS);
        const edgeHoles = countEdgeHoles(sim, COLS, ROWS);
        const newHoles = Math.max(0, holes - holesBefore);
        const highPoseFactor = 1 + Math.max(0, (16 - Math.max(0, py))) * 0.06;
        let mobility=0; if(next1){ mobility = countLegalPlacements(sim, COLS, ROWS, next1); }
        const la1 = next1 ? bestPlacementScoreForNext(sim, COLS, ROWS, next1, this.aiProfile) : 0;
        let la2 = 0; if(next1 && next2){ la2 = bestPlacementScoreWithFollow(sim, COLS, ROWS, next1, next2, this.aiProfile); }
        let fillBonus=0; if(next1){ const bestAfterNext = bestPlacementThatReducesHoles(sim, COLS, ROWS, next1, holesBefore); if(bestAfterNext && bestAfterNext.holesReduced>0){ fillBonus = Math.min(10, bestAfterNext.holesReduced*4); } }
        const w = getAIWeights(this.aiProfile);
        let clearedBonus = (cleared>=3 ? w.clear3Bonus : cleared * w.clearUnit);
        if(inDanger && cleared===2){ clearedBonus *= w.clear2DangerBoost; }
        const deltaHeight = h1 - heightBefore;
        const dropReward = (deltaHeight<0 ? (-deltaHeight) * w.heightDropReward * (inDanger?1.4:1.0) : 0);
        const wellPenalty = deepWells(sim, COLS, ROWS) * w.deepWell;
        const overhangPenalty = overhangs(sim, COLS, ROWS) * w.overhang;
        let score = clearedBonus + dropReward + fillBonus
          - holes * w.holes
          - bump * w.bump
          - h1   * (w.height * (inDanger?1.5:1.0))
          - (newHoles * w.newHole * highPoseFactor)
          - edgeHoles * w.edgeHole
          - wellPenalty - overhangPenalty
          + la1*w.look1 + la2*w.look2 + mobility*w.mobility;
        if(preferRightWell){
          const rightDepth = columnDepthAt(sim, COLS, ROWS, COLS-1);
          if(rightDepth>=2) score += Math.min(12, rightDepth*3);
          const heightsBefore = columnHeights(gridNow, COLS, ROWS);
          const heightsAfter = columnHeights(sim, COLS, ROWS);
          const deltaRight = heightsAfter[COLS-1] - heightsBefore[COLS-1];
          if(deltaRight>0){ const rightClosePenalty = Math.min(10, deltaRight*2) * (cleared>=2? 0.5:1.0); score -= rightClosePenalty; }
        }
        const candidate = { x:px, rot, yLanding:py, score, cleared };
        if(!best || score>best.score) best=candidate;
        if(cleared===0){ if(!bestNonClear || candidate.score>bestNonClear.score) bestNonClear=candidate; }
      }
    }
    if(best && best.cleared===1 && bestNonClear && !inDanger){
      const margin = 20; if(best.score - bestNonClear.score <= margin){ this._hint = bestNonClear; return; }
    }
    this._hint = best;
  }

  _asSim(){
    const COLS=this.grid.w|0, ROWS=this.grid.h|0;
    const sim = Array.from({length:ROWS}, (_,r)=> Array.from({length:COLS}, (__,c)=> this.grid.cells[r][c] ? 1 : 0));
    return sim;
  }
}

// ---- Helpers IA (simu grille bool/entier) ----
function rotateN(mat, n){ let r = mat; const k=(n%4+4)%4; for(let i=0;i<k;i++){ r = rotCW(r); } return r; }
function rotCW(m){ const n=4; const r=Array.from({length:n},()=>Array(n).fill(0)); for(let j=0;j<n;j++) for(let i=0;i<n;i++) r[i][n-1-j]=m[j][i]; return r; }
function collideGrid(sim, COLS, ROWS, px, py, mat){
  for(let j=0;j<4;j++){
    for(let i=0;i<4;i++){
      if(!mat[j][i]) continue;
      const x=px+i, y=py+j;
      if(x<0||x>=COLS||y>=ROWS) return true;
      if(y>=0 && sim[y][x]) return true;
    }
  }
  return false;
}
function cloneSim(sim){ return sim.map(row=>row.slice()); }
function placeOn(sim, COLS, ROWS, px, py, mat, key){ for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ const gx=px+i, gy=py+j; if(gy>=0&&gy<ROWS&&gx>=0&&gx<COLS) sim[gy][gx]=1; } }
function simulateClear(sim, COLS, ROWS){ let c=0; for(let r=ROWS-1;r>=0;){ if(sim[r].every(v=>!!v)){ sim.splice(r,1); sim.unshift(Array(COLS).fill(0)); c++; } else r--; } return c; }
function stackHeight(sim, COLS, ROWS){ let first=ROWS; for(let r=0;r<ROWS;r++){ if(sim[r].some(Boolean)){ first=r; break; } } return ROWS-first; }
function countHoles(sim, COLS, ROWS){ let holes=0; for(let c=0;c<COLS;c++){ let block=false; for(let r=0;r<ROWS;r++){ if(sim[r][c]) block=true; else if(block) holes++; } } return holes; }
function countEdgeHoles(sim, COLS, ROWS){ let holes=0; for(const c of [0, COLS-1]){ let block=false; for(let r=0;r<ROWS;r++){ if(sim[r][c]) block=true; else if(block) holes++; } } return holes; }
function bumpiness(sim, COLS, ROWS){ const h=columnHeights(sim, COLS, ROWS); let s=0; for(let c=0;c<COLS-1;c++) s+=Math.abs(h[c]-h[c+1]); return s; }
function columnHeights(sim, COLS, ROWS){ const h=Array(COLS).fill(0); for(let c=0;c<COLS;c++){ let v=0; for(let r=0;r<ROWS;r++){ if(sim[r][c]){ v=ROWS-r; break; } } h[c]=v; } return h; }
function columnDepthAt(sim, COLS, ROWS, col){ const h=columnHeights(sim, COLS, ROWS); const c=col; const left=c>0? h[c-1]:h[c]; const right=c<COLS-1? h[c+1]:h[c]; const depth=Math.max(0, Math.max(left,right)-h[c]); return depth; }
function deepWells(sim, COLS, ROWS){ const h=columnHeights(sim, COLS, ROWS); let wells=0; for(let c=0;c<COLS;c++){ const left=c>0? h[c-1]:h[c]; const right=c<COLS-1? h[c+1]:h[c]; const depth=Math.max(0, Math.max(left,right)-h[c]); if(depth>=4) wells += (depth-3); } return wells; }
function overhangs(sim, COLS, ROWS){
  // cases vides recouvertes par un toit horizontal simple
  let cnt=0;
  for(let r=0;r<ROWS-1;r++){
    for(let c=0;c<COLS-1;c++){
      const a=sim[r][c], b=sim[r][c+1];
      const c1=sim[r+1][c], d=sim[r+1][c+1];
      if(!c1 && a && b && d) cnt++;
    }
  }
  return cnt;
}

// Nombre de placements légaux pour éviter les pièges (helper manquant)
function countLegalPlacements(simGrid, COLS, ROWS, key){
  let count=0;
  for(let rot=0; rot<4; rot++){
    const mat = rotateN(TETROMINOS[key], rot);
    let minX=4, maxX=0;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, COLS, ROWS, px, py+1, mat)) py++;
      if(py<-1) continue; // jamais posé
      count++;
    }
  }
  return count;
}
function bestPlacementScoreForNext(simGrid, COLS, ROWS, nextKey, profile){
  let best=-Infinity; const w=getAIWeights(profile);
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, COLS, ROWS, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim = cloneSim(simGrid);
      placeOn(sim, COLS, ROWS, px, py, mat, nextKey);
      const cleared = simulateClear(sim, COLS, ROWS);
      const h1 = stackHeight(sim, COLS, ROWS);
      const holes = countHoles(sim, COLS, ROWS);
      const bump = bumpiness(sim, COLS, ROWS);
      const clearedBonus = (cleared===3? 60 : cleared*10);
      const sc = clearedBonus - holes*w.holes*0.93 - bump*w.bump*1.0 - h1*w.height*1.0;
      if(sc>best) best=sc;
    }
  }
  return best;
}
function bestPlacementThatReducesHoles(simGrid, COLS, ROWS, nextKey, holesBefore){
  let best=null;
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, COLS, ROWS, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim = cloneSim(simGrid);
      placeOn(sim, COLS, ROWS, px, py, mat, nextKey);
      const h = countHoles(sim, COLS, ROWS);
      const reduced = Math.max(0, holesBefore - h);
      if(reduced>0){ const cand={ holesReduced:reduced }; if(!best || cand.holesReduced>best.holesReduced) best=cand; }
    }
  }
  return best;
}
function bestPlacementScoreWithFollow(simGrid, COLS, ROWS, k1, k2, profile){
  let best=-Infinity;
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[k1], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, COLS, ROWS, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim1 = cloneSim(simGrid);
      placeOn(sim1, COLS, ROWS, px, py, mat, k1);
      simulateClear(sim1, COLS, ROWS);
      const sc = bestPlacementScoreForNext(sim1, COLS, ROWS, k2, profile);
      if(sc>best) best=sc;
    }
  }
  return best;
}
function getAIWeights(profile){
  switch(profile){
    case 'prudent':
      return { holes:9.2, bump:0.7, height:0.28, look1:0.45, look2:0.22, mobility:0.35, deepWell:1.6, overhang:2.6, clear3Bonus:65, clearUnit:2, newHole:12.0, heightDropReward:3.2, clear2DangerBoost:1.5, edgeHole:1.2 };
    case 'conservateur':
      return { holes:8.5, bump:0.65, height:0.26, look1:0.5, look2:0.25, mobility:0.35, deepWell:1.4, overhang:2.2, clear3Bonus:70, clearUnit:3, newHole:10.0, heightDropReward:3.5, clear2DangerBoost:1.6, edgeHole:1.0 };
    case 'agressif':
      return { holes:6.2, bump:0.5, height:0.18, look1:0.7, look2:0.45, mobility:0.25, deepWell:1.0, overhang:1.6, clear3Bonus:95, clearUnit:7, newHole:7.2, heightDropReward:2.2, clear2DangerBoost:1.3, edgeHole:0.8 };
    default:
      return { holes:7.2, bump:0.55, height:0.22, look1:0.6, look2:0.35, mobility:0.3, deepWell:1.2, overhang:2.0, clear3Bonus:80, clearUnit:6, newHole:8.5, heightDropReward:2.8, clear2DangerBoost:1.5, edgeHole:0.9 };
  }
}

// Utilitaire pour tracer des arrondis (repris de SoloScreen)
function roundRect(ctx,x,y,w,h,r){
  const rr=Math.max(0, Math.min(r, Math.abs(w)/2, Math.abs(h)/2));
  ctx.beginPath();
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}
