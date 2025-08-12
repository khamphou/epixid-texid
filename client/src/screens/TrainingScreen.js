import { SoloScreen } from './SoloScreen.js';
import { TETROMINOS } from '../engine/piece.js';

// Écran Training: identique au Solo, avec assistance IA (Mode Easy)
export class TrainingScreen extends SoloScreen {
  constructor(core, { rules, objectives }){
    super(core, { rules, objectives });
    this.easyMode = true; // activé par défaut en Training
    this.aiProfile = 'equilibre'; // 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
    this._hint = null; // { x, rot, yLanding, score, cleared }
  this._hintKey = null; // clé de la pièce pour laquelle l'indice est calculé (active ou HOLD)
    this._lastState = { x: null, y: null, rot: null, gridHash: null, key: null, next0: null, next1: null };
  this._hintCooldown = 0; // (legacy) non utilisé si recalcul au spawn uniquement
  this._hintForKey = null; // clé de la pièce pour laquelle l'indice est valide
  this._needHintRecompute = true; // forcer un recalcul (ex: changement de profil)
  this._hintUseHold = false; // recommander HOLD ?
  this._holdBlinkT = 0; // timer clignotement HOLD
  this._helpInjectedEl = null; // bloc d'aide Training
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
    // Aide spécifique Training (uniquement sur cet écran)
    try{
      const dlg = document.getElementById('dlg-help');
      const body = dlg?.querySelector('.help-body');
      if(body && !body.querySelector('.training-help-note')){
        const note = document.createElement('div');
        note.className = 'training-help-note';
        note.innerHTML = `
          <div class="help-callout" role="note" aria-label="Aide Training">
            <strong>Training — IA Easy</strong>
            <ul style="margin:8px 0 0 18px; padding:0;">
              <li>Profils: Prudent (min trous), Conservateur, Équilibré, Agressif (max lignes).</li>
              <li>Utilise le HOLD quand c'est meilleur: le panneau HOLD clignote si recommandé.</li>
              <li>Prenez en compte les pièces NEXT disponibles (2 à 10 selon mode).</li>
            </ul>
          </div>`;
        body.appendChild(note);
        this._helpInjectedEl = note;
      }
    }catch{}
  }

  dispose(){
    try{
      const { btn, dd, onClick, onDocClick } = this._ui;
      if(btn && onClick) btn.removeEventListener('click', onClick);
      if(onDocClick) document.removeEventListener('click', onDocClick);
      // Réinitialiser et masquer le bouton IA hors Training
      if(btn){
        btn.setAttribute('aria-pressed','false');
        btn.setAttribute('aria-expanded','false');
        btn.classList.remove('active','easy-prudent','easy-conservateur','easy-equilibre','easy-agressif');
        btn.classList.add('hidden');
      }
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
  // Blink HOLD si recommandé
  if(this._hintUseHold){
    this._holdBlinkT = ((this._holdBlinkT||0) + dt) % 1.2;
    // Petit toast contextuel (une seule fois par pièce) pour suggérer HOLD
    if(!this._holdToastShown){
      try{ this.toast('HOLD (C/Shift)', { color:'#38bdf8', size:18, dur:1.4 }); }catch{}
      this._holdToastShown = true;
    }
  } else {
    this._holdBlinkT = 0;
  }
    } else {
  this._hint = null; this._hintForKey = null; this._hintUseHold = false; this._holdBlinkT = 0; this._holdToastShown = false;
    }
  }

  render(ctx){
    super.render(ctx);
    if(!this.easyMode || !this._hint || !this.active) return;
    const br = this.getBoardRect();
    const { x:bx, y:by, cell } = br;
    const useKey = this._hintKey || this.active.key;
  const mat = rotateN(TETROMINOS[useKey], this._hint.rot);
    const t = (performance.now()%1000)/1000; const pulse = 0.45 + 0.45*Math.abs(Math.sin(t*Math.PI*2));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45*pulse;
    ctx.strokeStyle='rgba(56,189,248,0.9)';
    ctx.lineWidth = 2;
    let minGX=Infinity, maxGX=-Infinity; const lowestByCol = new Map();
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
      const gx = this._hint.x + i; const gy = this._hint.yLanding + j; if(gx<0||gx>=this.grid.w||gy>=this.grid.h) continue;
      const px = bx + gx*cell, py = by + gy*cell;
      roundRect(ctx, px+2, py+2, cell-4, cell-4, 6); ctx.stroke();
      if(gx<minGX) minGX=gx; if(gx>maxGX) maxGX=gx;
      const curLow = lowestByCol.get(gx);
      if(curLow==null || gy>curLow) lowestByCol.set(gx, gy);
    }
    ctx.restore();
    // Lignes de projection depuis la pièce active (position actuelle) vers le bas (côtés extrêmes)
    try{
      const sim = this._asSim();
      const curMat = rotateN(TETROMINOS[this.active.key], this.rot);
      let minGX=Infinity, maxGX=-Infinity; const lowestByCol = new Map();
      for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(curMat[j][i]){
        const gx = (this.x|0) + i; const gy = (Math.floor(this.y)) + j;
        if(gx<0||gx>=this.grid.w) continue;
        if(gx<minGX) minGX=gx; if(gx>maxGX) maxGX=gx;
        const curLow = lowestByCol.get(gx);
        if(curLow==null || gy>curLow) lowestByCol.set(gx, gy);
      }
      const cols = [];
      if(Number.isFinite(minGX)) cols.push(minGX);
      if(Number.isFinite(maxGX) && maxGX!==minGX) cols.push(maxGX);
      ctx.save();
        ctx.strokeStyle = 'rgba(56,189,248,0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4,6]);
        ctx.lineDashOffset = 0;
      for(const c of cols){
        if(c<0 || c>=this.grid.w) continue;
        const lowGy = (lowestByCol.get(c) ?? Math.floor(this.y));
        const startGy = lowGy + 1;
        let hitY = this.grid.h;
        for(let y=startGy; y<this.grid.h; y++){
          if(sim[y][c]){ hitY = y; break; }
        }
        // X aligné aux bords visibles de la tuile (tile dessiné à x+1 .. x+cell-1)
        const X = (c===minGX)
          ? (bx + c*cell + 1)                // bord gauche visible
          : (bx + (c+1)*cell - 1);            // bord droit visible
        // y0: bas de la tuile la plus basse de cette colonne de la pièce
        const y0 = by + lowGy*cell + (cell - 1);
        // y1: haut de la première tuile touchée dessous (ou bas du plateau si aucune)
        const y1 = (hitY < this.grid.h)
          ? (by + hitY*cell + 1)
          : (by + this.grid.h*cell - 1);
        ctx.beginPath(); ctx.moveTo(X, y0); ctx.lineTo(X, y1); ctx.stroke();
      }
        ctx.setLineDash([]);
      ctx.restore();
    }catch{}
    
    // Clignoter le panneau HOLD si HOLD recommandé (fond + contour)
    if(this._hintUseHold && this._holdPanel){
      const k = this._holdBlinkT||0;
      // Courbe de pulsation douce
      const pulse = 0.5 + 0.5*Math.sin((k/1.2)*Math.PI*2);
      const fillAlpha = 0.20 + 0.30*pulse; // fond visible
      const strokeAlpha = 0.70 + 0.25*pulse; // contour plus marqué
      ctx.save();
      // Fond
      ctx.globalAlpha = Math.max(0.15, Math.min(0.65, fillAlpha));
      ctx.fillStyle = 'rgba(56,189,248,1)';
      roundRect(ctx, this._holdPanel.x+3, this._holdPanel.y+3, this._holdPanel.w-6, this._holdPanel.h-6, 10);
      ctx.fill();
      // Contour
      ctx.globalAlpha = Math.max(0.5, Math.min(0.95, strokeAlpha));
      ctx.strokeStyle = 'rgba(56,189,248,1)'; ctx.lineWidth = 2.2;
      roundRect(ctx, this._holdPanel.x+2, this._holdPanel.y+2, this._holdPanel.w-4, this._holdPanel.h-4, 10);
      ctx.stroke();
      ctx.restore();
    }
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
  // Forcer recalcul immédiat des lignes de projection après rotation
  onRotate(){
    // Effectuer la rotation réelle puis rafraîchir les guides/hints
    try{ super.onRotate(); }catch{}
    this._forceHintRecompute();
  }
  // Idem pour les rotations anti-horaires
  onRotateCCW(){
    try{ super.onRotateCCW?.(); }catch{}
    this._forceHintRecompute();
  }
  _stateChanged(s){ const p=this._lastState; const changed = !p || s.x!==p.x || s.y!==p.y || s.rot!==p.rot || s.gridHash!==p.gridHash || s.key!==p.key || s.next0!==p.next0 || s.next1!==p.next1; this._lastState = s; return changed; }

  _computeHint(){
    if(!this.active){ this._hint=null; this._hintUseHold=false; return; }
    const COLS = this.grid.w|0, ROWS = this.grid.h|0;
    const pieceKey = this.active.key;
    const gridNow = this._asSim();
    let best=null, bestNonClear=null;
  const holesBefore = countHoles(gridNow, COLS, ROWS);
  const heightBefore = stackHeight(gridNow, COLS, ROWS);
  const hRatio = heightBefore / ROWS;
    const freeRows = ROWS - heightBefore;
    const inDanger = freeRows <= 4;
    const upcomingKeys = this.nextQueue.map(p=>p.key);
    const iIndex = upcomingKeys.findIndex(k=> k==='I');
  const iSoon = iIndex>=0 && iIndex<=4;
  const preferRightWell = iSoon || (this.aiProfile==='agressif' && hRatio < 0.6);
    const evalForKey = (key)=>{
      let locBest=null, locBestNonClear=null;
      // Sélection lexicographique: minimiser d'abord les nouveaux trous, puis maximiser le score
      let minNewHolesSeen = Infinity; let bestMinHoleCand = null;
      for(let rot=0; rot<4; rot++){
        const mat = rotateN(TETROMINOS[key], rot);
        let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
        for(let px=-minX; px<=COLS-(maxX+1); px++){
          let py=-2; while(!collideGrid(gridNow, COLS, ROWS, px, py+1, mat)) py++;
          if(py<-1) continue;
          const sim = cloneSim(gridNow);
          placeOn(sim, COLS, ROWS, px, py, mat, key);
          const cleared = simulateClear(sim, COLS, ROWS);
          const h1 = stackHeight(sim, COLS, ROWS);
          const holes = countHoles(sim, COLS, ROWS);
          const bump = bumpiness(sim, COLS, ROWS);
          const edgeHoles = countEdgeHoles(sim, COLS, ROWS);
          const newHoles = Math.max(0, holes - holesBefore);
          const highPoseFactor = 1 + Math.max(0, (16 - Math.max(0, py))) * 0.06;
          const w = getAIWeights(this.aiProfile);
          let mobility=0; if(upcomingKeys[0]){ mobility = countLegalPlacements(sim, COLS, ROWS, upcomingKeys[0]); }
          // Lookahead jusqu'à K prochains (2..10)
          const K = Math.min(Math.max(2, upcomingKeys.length), 10);
          let la = 0;
          if(K>=1){ la += bestPlacementScoreForNext(sim, COLS, ROWS, upcomingKeys[0], this.aiProfile) * w.look1; }
          if(K>=2){ la += bestPlacementScoreWithFollow(sim, COLS, ROWS, upcomingKeys[0], upcomingKeys[1], this.aiProfile) * w.look2; }
          if(K>2){
            const extraBase = Math.max(0.08, Math.min(0.22, w.look2*0.5));
            for(let i=2;i<K;i++){
              const decay = Math.pow(0.82, i-2);
              la += bestPlacementScoreForNext(sim, COLS, ROWS, upcomingKeys[i], this.aiProfile) * extraBase * decay;
            }
          }
          // Bonus comble-trous si possible dès le prochain
          let fillBonus=0; if(upcomingKeys[0]){ const bestAfterNext = bestPlacementThatReducesHoles(sim, COLS, ROWS, upcomingKeys[0], holesBefore); if(bestAfterNext && bestAfterNext.holesReduced>0){ fillBonus = Math.min(10, bestAfterNext.holesReduced*4); } }
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
            + la + mobility*w.mobility;
          // Ajustements ciblés pour le mode Agressif
          if(this.aiProfile==='agressif'){
            if(hRatio < 0.6){
              // Bas de plateau: cibler le Tetris (4 lignes)
              if(cleared===4) score += 120;
              if(cleared<=2) score -= 30; // éviter 1-2 lignes quand mieux existe
              if(newHoles>0) score -= newHoles * 4; // limiter la création de trous
            } else {
              // >60% de pile: privilégier 3+ lignes et sécurité
              if(cleared>=3) score += 60;
              if(newHoles>0) score -= newHoles * 8; // trous très pénalisants
            }
          }
          if(preferRightWell){
            const rightDepth = columnDepthAt(sim, COLS, ROWS, COLS-1);
            if(rightDepth>=2) score += Math.min(12, rightDepth*3);
            const heightsBefore = columnHeights(gridNow, COLS, ROWS);
            const heightsAfter = columnHeights(sim, COLS, ROWS);
            const deltaRight = heightsAfter[COLS-1] - heightsBefore[COLS-1];
            if(deltaRight>0){ const rightClosePenalty = Math.min(10, deltaRight*2) * (cleared>=2? 0.5:1.0); score -= rightClosePenalty; }
          }
          const candidate = { x:px, rot, yLanding:py, score, cleared, newHoles };
          if(!locBest || score>locBest.score) locBest=candidate;
          if(cleared===0){ if(!locBestNonClear || candidate.score>locBestNonClear.score) locBestNonClear=candidate; }
          // Mémoriser le meilleur pour le minimum de nouveaux trous
          if(newHoles < minNewHolesSeen){
            minNewHolesSeen = newHoles; bestMinHoleCand = candidate;
          } else if(newHoles === minNewHolesSeen && bestMinHoleCand && score > bestMinHoleCand.score){
            bestMinHoleCand = candidate;
          }
        }
      }
  if(locBest && locBest.cleared===1 && locBestNonClear && !inDanger){
        const margin = 20; if(locBest.score - locBestNonClear.score <= margin){ return { hint:locBestNonClear, score:locBestNonClear.score }; }
      }
  // Choisir systématiquement le meilleur avec le moins de nouveaux trous
  if(bestMinHoleCand){ return { hint:bestMinHoleCand, score:bestMinHoleCand.score, newHoles: bestMinHoleCand.newHoles }; }
  return { hint:locBest, score:locBest?locBest.score:-Infinity, newHoles: locBest?locBest.newHoles:Infinity };
    };

    const resActive = evalForKey(pieceKey);
    let resHold = null; let holdKey = null;
    if(!this.holdUsed){
      if(this.hold && this.hold.key){ holdKey = this.hold.key; }
      else if(upcomingKeys[0]){ holdKey = upcomingKeys[0]; }
      if(holdKey){ resHold = evalForKey(holdKey); }
    }
    let choose = resActive; this._hintUseHold = false; this._hintKey = pieceKey;
    if(resHold){
      if(!resActive){ choose = resHold; this._hintUseHold = true; }
      else {
        // Comparaison lexicographique globale: min newHoles d'abord, puis max score
        const aH = Number.isFinite(resActive.newHoles)? resActive.newHoles : Infinity;
        const hH = Number.isFinite(resHold.newHoles)? resHold.newHoles : Infinity;
        if(hH < aH){ choose = resHold; this._hintUseHold = true; }
        else if(hH === aH && resHold.score > resActive.score){ choose = resHold; this._hintUseHold = true; }
      }
    }
    this._hint = choose?.hint || null;
    this._hintKey = (this._hint && this._hintUseHold && holdKey) ? holdKey : (this._hint ? pieceKey : null);
    // Validation supplémentaire: ne jamais suggérer un placement qui chevauche des blocs existants
    if(this._hint){
      const COLS = this.grid.w|0, ROWS = this.grid.h|0;
      const k = this._hintKey || pieceKey;
      const mat = rotateN(TETROMINOS[k], this._hint.rot);
      const simNow = this._asSim();
      if(collideGrid(simNow, COLS, ROWS, this._hint.x, this._hint.yLanding, mat)){
        this._hint = null;
        this._hintKey = null;
      }
    }
    // Fallback robuste: si aucun hint sélectionné, proposer un drop sûr pour la pièce active (meilleur atterrissage accessible)
    if(!this._hint && this.active){
      const mat0 = rotateN(TETROMINOS[pieceKey], this.rot|0);
      // Essayer à partir de la position courante puis étendre gauche/droite
      const tryXs = [];
      const cx = this.x|0; for(let d=0; d<=this.grid.w; d++){ const L=cx-d, R=cx+d; if(L>=0 && !tryXs.includes(L)) tryXs.push(L); if(R< this.grid.w && !tryXs.includes(R)) tryXs.push(R); if(tryXs.length>=this.grid.w) break; }
      const COLS=this.grid.w|0, ROWS=this.grid.h|0; const simNow=this._asSim();
      for(const px of tryXs){
        // Si collision à la position courante, sauter
        if(collideGrid(simNow, COLS, ROWS, px, Math.floor(this.y), mat0)) continue;
        let py = -2; while(!collideGrid(simNow, COLS, ROWS, px, py+1, mat0)) py++;
        if(py<-3) continue;
        this._hint = { x:px, rot:(this.rot|0), yLanding:py, score:0, cleared:0, newHoles:0 };
        this._hintKey = pieceKey;
        break;
      }
    }
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
