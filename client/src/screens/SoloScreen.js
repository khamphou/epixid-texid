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
  // Cacher le bouton IA Training en Solo
  const easy = document.getElementById('easy-btn');
  const aiDD = document.getElementById('ai-dd');
  if(easy){ easy.classList.add('hidden'); easy.setAttribute('aria-expanded','false'); easy.setAttribute('aria-pressed','false'); easy.classList.remove('active','easy-prudent','easy-conservateur','easy-equilibre','easy-agressif'); }
  if(aiDD){ aiDD.classList.add('hidden'); }
    }catch{}
  this.grid = new Grid(10,20); this.bag=new Bag();
  // Démarrage: pas de pièce active posée, elle arrivera depuis NEXT via une animation
  this.active = null;
  this.x=3; this.y=-4; this.rot=0; this.score=0; this.combo=-1; this.b2b=false; this.time=0;
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
    // NEXT: on prépare 6 pièces visibles
    this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)];
    // Audio: intensité musique
  this._musicT = 0; this._musicLevel = 0.2;
  this._stressK = 0;
  // Shake FX
  this._shake=0; this._shakeX=0; this._shakeY=0;
  // Animation de chute rapide lors d'un hard drop
  this._dropAnim = null;
  // Animation HOLD (slide)
  this._holdAnim = null;
  // Animation NEXT (entrée de la prochaine pièce + décalage des suivantes)
  this._nextAnim = null;
  // KO au spawn: délai d'un tick avant validation
  this._spawnKoPending = false;
  this._spawnKoWait = false;
  this._spawnKoAnchorY = null;
  this._spawnKoDeadline = 0;
  // Animation de premier spawn depuis NEXT
  this._initialAnimDone = false;
  this._initialPiece = null;
  // Solo: pas de garbage entrant par défaut
  this._enableSoloGarbage = false;
  // Compte à rebours 3s avant départ
  this._countdown = { start: performance.now(), dur: 3000 };
  // Déclencher le jingle de départ (décompte)
  try{ await audio.resume?.(); audio.playStartCue?.(3); }catch{}
  // GO overlay bref après le décompte
  this._go = null;
  window.addEventListener('keydown', this.onKeyDown);
  window.addEventListener('keyup', this.onKeyUp);
  }
  update(dt){
    // Même après gameOver, on laisse finir l'anim de chute visuelle; mais on fige le gameplay
    if(this.gameOver){
      // Laisser vivre timers visuels
      if(this._dropAnim){ this._dropAnim.t += dt; if(this._dropAnim.t >= this._dropAnim.dur){ this._dropAnim = null; } }
      if(this._holdAnim){ this._holdAnim.t += dt; if(this._holdAnim.t >= this._holdAnim.dur){ this._holdAnim = null; } }
      if(this._nextAnim){ this._nextAnim.t += dt; if(this._nextAnim.t >= this._nextAnim.dur){ this._nextAnim = null; } }
      super.update?.(dt);
      return;
    }
    // Bloquer le gameplay pendant le compte à rebours
    if(this._countdown){
      const left = Math.max(0, this._countdown.dur - (performance.now() - this._countdown.start));
      if(left <= 0){ this._countdown = null; this._go = { start: performance.now(), dur: 450 }; }
      // Laisser quand même vivre les toasts/overlays du parent
      super.update?.(dt);
      return;
    }
    // GO flash timer
    if(this._go){ if(performance.now() - this._go.start >= this._go.dur){ this._go = null; } }
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
  // Animation HOLD en cours ?
  if(this._holdAnim){ this._holdAnim.t += dt; if(this._holdAnim.t >= this._holdAnim.dur){ this._holdAnim = null; } }
  // Animation NEXT en cours ? (si anim initiale se termine, activer la pièce ici avant de nettoyer)
  if(this._nextAnim){
    this._nextAnim.t += dt;
    if(this._nextAnim.t >= this._nextAnim.dur){
      if(this._nextAnim.mode === 'initial' && !this.active){
        this.active = this._initialPiece; this._initialPiece=null; this._initialAnimDone=true;
        this.x=3; this.y=-4; this.rot=0; this.lockTimer=0; this.dropAcc=0;
  // Armer: attendre au moins 1 descente OU 250ms max avant KO au spawn
  this._spawnKoPending = true; this._spawnKoWait = true; this._spawnKoAnchorY = Math.floor(this.y); this._spawnKoDeadline = performance.now() + 250;
      }
      this._nextAnim = null;
    }
  }
  // Entrées centralisées (DAS/ARR + soft drop) traitées avant la gravité
  super.update?.(dt);
  // Si aucune pièce active (au démarrage), pas de gravité
  if(!this.active){ return; }
  // KO au spawn: attendre 1 frame ET le 1er pas de gravité (y > anchor) OU un time-out court
  if(this._spawnKoPending){
    if(this._spawnKoWait){
      // attendre un frame complet avant de décider
      this._spawnKoWait = false;
    } else {
      const now = performance.now();
      const anchor = (this._spawnKoAnchorY==null) ? Math.floor(this.y) : this._spawnKoAnchorY|0;
      const movedDown = Math.floor(this.y) > anchor;
      if(!movedDown && now < this._spawnKoDeadline){ /* attendre */ }
      else {
        this._spawnKoPending = false;
        if(collide(this.grid, this.active, this.x, this.y) || cannotEnterVisibleAtSpawn(this.grid, this.active, this.x, Math.floor(this.y)) ){
          this.triggerGameOver?.();
          return;
        }
      }
    }
  }
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
    // garbage timers -> appliquer si écoulés (désactivé en Solo par défaut)
    if(this._enableSoloGarbage){
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
    }
    // Musique: adapter l'intensité — déclenche "stress" selon la hauteur de pile (>=80%)
    this._musicT += dt; if(this._musicT>=0.5){ this._musicT=0; try{
      const hRatio = computeStackRatio(this.grid); // 0..1 (1 = rempli)
      const stress = Math.max(0, Math.min(1, (hRatio - 0.8) / 0.2)); // 0 sous 80%, 1 à 100%
      const g = Math.min(1, this.gravity/4);
      const base = 0.22 + g*0.18; // fond léger + gravité
      const target = Math.max(0.15, Math.min(1, base + stress*0.75));
      if(Math.abs(target - this._musicLevel) >= 0.05){ this._musicLevel = target; audio.setMusicIntensity?.(target); }
      // Effet visuel lissé
      const k = 0.5; this._stressK = this._stressK*(1-k) + stress*k;
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

  // Mise à l'échelle responsive du plateau pour garder la sidebar à droite
  const gap = 14;
  const sideMinW = 160;
  const sideIdealW = 200;
  const margin = 12;
  const maxCellW = Math.floor((W - margin*2 - gap - sideMinW) / this.grid.w);
  const maxCellH = Math.floor((H - margin*2 - topbarH) / this.grid.h);
  const cell = Math.max(12, Math.min(30, Math.min(maxCellW, maxCellH)));
  const boardW = this.grid.w*cell;
  const boardH = this.grid.h*cell;
  const sideW = Math.max(sideMinW, Math.min(sideIdealW, W - margin*2 - boardW - gap));
  const sideH = Math.max(180, Math.min(boardH, Math.floor(H - topbarH - margin*2)));
  // Centrer horizontalement l'ensemble board + sidebar
  const totalW = boardW + gap + sideW;
  const offx = Math.max(margin, Math.floor((W - totalW)/2));
  const offy = Math.max(margin + topbarH, Math.floor((H - boardH)/2));
  const sideX = offx + boardW + gap; const sideY = offy;

    // Shake léger: offsetter l’affichage du board
    if(this._shake>0){
      this._shakeX = (Math.random()*2-1) * this._shake;
      this._shakeY = (Math.random()*2-1) * this._shake;
      this._shake = Math.max(0, this._shake - 0.4);
    } else { this._shakeX=0; this._shakeY=0; }

  // Jitter léger selon le stress visuel (>~90% de pile)
  const jAmp = BaseGameScreen.jitterForStress(this._stressK||0, 2.2);
  const jx = (Math.random()*2-1) * jAmp;
  const jy = (Math.random()*2-1) * jAmp;
  const bx = offx + this._shakeX + jx;
  const by = offy + this._shakeY + jy;

  // Cadre verre du plateau (glow si stress + heartbeat + flash nuke)
  let nukeGlow = 0; if(this._nuke){ const k = Math.max(0, Math.min(1, (performance.now() - this._nuke.start)/this._nuke.dur)); nukeGlow = 1 - k; }
  drawGlassFrame(ctx, bx-14, by-14, boardW+28, boardH+28, this._stressK||0, this.time||0, nukeGlow);
    drawInnerFrame(ctx, bx, by, boardW, boardH);

    // Grille
    drawGrid(ctx, bx, by, this.grid.w, this.grid.h, cell);
    // Ghost piece (si active existe)
    if(this.active){
      const ghostY = computeGhostY(this.grid, this.active, this.x, this.y);
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
    // Pièce active (si présente)
    if(this.active){
      const mat = this.active.mat; const y0 = Math.floor(this.y); const x0 = this.x; const color = pieceColor(this.active.key);
      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!mat[j][i]) continue;
          const gy = y0 + j; const gx = x0 + i; if(gx<0||gx>=this.grid.w) continue;
          const px = bx + gx*cell; const py = by + gy*cell;
          ctx.save(); if(gy < 0){ ctx.globalAlpha = BaseGameScreen.alphaAboveBoard(this.time||0, 0.6); }
          drawTile(ctx, px, py, cell, color);
          ctx.restore();
        }
      }
    }

    // Animation de chute rapide (overlay) – pièce précédente interpolée entre yStart -> yEnd avec léger motion blur
    if(this._dropAnim){
      const a = this._dropAnim;
      const k = Math.min(1, a.t / a.dur);
      const kk = easeOutCubic(k);
      const yInterp = a.yStart + (a.yEnd - a.yStart) * kk;
      const trailCount = 2; // plus léger
      const dyTotal = Math.max(0, (yInterp - a.yStart));
      const trailStep = dyTotal / (trailCount+1);
      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!a.mat[j][i]) continue;
          const gx = a.x + i; if(gx<0||gx>=this.grid.w) continue;
          // couche principale
          const yMain = yInterp + j;
          let px = bx + gx*cell, py = by + yMain*cell;
          ctx.save(); ctx.globalAlpha = 0.92; drawTile(ctx, px, py, cell, a.color); ctx.restore();
          // trails
          for(let t=1;t<=trailCount;t++){
            const yTrail = (yInterp - t*trailStep) + j;
            px = bx + gx*cell; py = by + yTrail*cell;
            ctx.save(); ctx.globalAlpha = 0.12 * (1 - t/(trailCount+0.5)); drawTile(ctx, px, py, cell, a.color); ctx.restore();
          }
        }
      }
    }

    // Légende sous plateau
  ctx.fillStyle = '#b6c2cf'; ctx.font = '12px system-ui,Segoe UI,Roboto,Arial';
  ctx.textAlign='center'; ctx.fillText('kham', bx+boardW/2, by+boardH+22);
    ctx.textAlign='left';

  // Sidebar (toujours visible) — applique aussi le shake/jitter
    const sdx = this._shakeX + jx;
    const sdy = this._shakeY + jy;
    ctx.save();
    ctx.translate(sdx, sdy);
    drawPanelGlass(ctx, sideX, sideY, sideW, sideH);
    const playerName = String(localStorage.getItem('texid_name') || 'Player').slice(0,16);
    drawLabelValue(ctx, sideX+12, sideY+22, 'Joueur', playerName, false, sideW);
    drawLabelValue(ctx, sideX+12, sideY+40, 'Niveau', 'Pepouz', false, sideW);
    drawLabelValue(ctx, sideX+12, sideY+58, 'Score', String(this.scoring?.score||0), true, sideW);
    drawLabelValue(ctx, sideX+12, sideY+76, 'Lignes', String(this.scoring?.lines||0), false, sideW);

    // Sous-panneaux: HOLD (au-dessus, réduit) puis NEXT en dessous
  const holdTop = sideY + 96;
    const holdH = 90; // réduit
    const nextTop = holdTop + holdH + 12;
    const nextH = Math.max(120, Math.min(sideH - (nextTop - sideY) - 12, 160));
  drawSubPanel(ctx, sideX+10, holdTop, sideW-20, holdH);
  // Exposer le rect du panneau HOLD pour l'assistance visuelle Training
  this._holdPanel = { x: sideX+10, y: holdTop, w: sideW-20, h: holdH };
    drawSubPanel(ctx, sideX+10, nextTop, sideW-20, nextH);
    // Labels
    ctx.fillStyle='#94a3b8'; ctx.font='bold 12px system-ui,Segoe UI,Roboto';
    ctx.textAlign='left'; ctx.fillText('HOLD', sideX+18, holdTop+16);
    ctx.textAlign='left'; ctx.fillText('NEXT', sideX+18, nextTop+16);
    // HOLD contenu (plus petit) + mémoriser l’ancre pour anim
    const cellH = 16; const holdX = sideX + Math.floor((sideW - 20 - cellH*4)/2) + 10; const holdY = holdTop + 26;
    this._holdDraw = { x: holdX, y: holdY, cell: cellH };
  if(this.hold){ drawMat(ctx, this.hold.mat, holdX, holdY, cellH, pieceColor(this.hold.key)); }
  ctx.restore();
  // Enregistrer le rect du board tôt pour l’anim initiale potentielle
  this._boardRect = { x:bx, y:by, w:boardW, h:boardH, cell };
  // NEXT contenu: séparé par un trait — en haut: prochaine pièce (grande), en bas: anneau des suivantes (20% plus petites à chaque pas)
    // Appliquer le shake/jitter aussi autour de la zone NEXT
    ctx.save(); ctx.translate(sdx, sdy);
    this._nextHit = null; this._nextDraw = undefined; this._nextTop = null; this._nextRing = [];
    {
    const showCount = Math.min(6, this.nextQueue.length);
      const panelX = sideX+10, panelW = sideW-20;
      const panelY = nextTop, panelH = nextH;
  // Séparateur très haut (~14% de la hauteur), proche de la 1ère pièce
  let topAreaH = Math.max(48, Math.min(panelH - 64, Math.floor(panelH * 0.14)));
      let botAreaY = panelY + topAreaH + 6;
      let botAreaH = panelH - topAreaH - 6;
      const dividerY = panelY + topAreaH + 2.5;
      // Dessiner le trait séparateur
      ctx.save(); ctx.strokeStyle='rgba(148,163,184,0.25)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(panelX+8, dividerY); ctx.lineTo(panelX+panelW-8, dividerY); ctx.stroke(); ctx.restore();
    // Calcul du cercle du bas — rayon maximal pour espacer les pièces, taille des items quasi fixe
  const pad = 4; let cx = panelX + Math.floor(panelW/2); let cy = botAreaY + Math.floor(botAreaH/2);
  let Wc = panelW - pad*2, Hc = botAreaH - pad*2;
  let Rmax = Math.max(18, Math.floor(Math.min(Wc, Hc)/2) - 1);
  const ringCount = Math.max(0, showCount - 1);
  let Reff = Math.max(16, Math.floor(Rmax)); // exploite tout l'espace dispo
  // Taille du 1er item du cercle basée sur l'espacement angulaire
  const GAP = 100;
  let ringCell0;
  if(ringCount>0){
    const spacing = (2*Math.PI*Reff)/ringCount;
    ringCell0 = Math.max(10, Math.min(22, Math.floor((spacing - GAP)/3.6)));
  } else { ringCell0 = 10; }
      // Appliquer un ratio plus doux pour garder de grosses pièces
      const ratio = 0.88;
    const ringCells = Array.from({length: ringCount}, (_,i)=> Math.max(10, Math.round(ringCell0 * Math.pow(ratio, i))));
  // Top réduit pour harmonie: ~+60% vs 1er du cercle
  let topCell = Math.round(ringCell0 * 1.3);
      const topCellMax = Math.max(10, Math.floor((topAreaH - 18) / 4));
      if(topCell > topCellMax){
        // Agrandir la zone haute si nécessaire et recalculer le cercle
        topAreaH = Math.min(panelH - 64, topCell*4 + 18);
        botAreaY = panelY + topAreaH + 6;
        botAreaH = panelH - topAreaH - 6;
        cx = panelX + Math.floor(panelW/2); cy = botAreaY + Math.floor(botAreaH/2);
  Wc = panelW - pad*2; Hc = botAreaH - pad*2;
  Rmax = Math.max(12, Math.floor(Math.min(Wc, Hc)/2) - 1);
  Reff = Math.max(16, Math.floor(Rmax));
  if(ringCount>0){ const spacing2 = (2*Math.PI*Reff)/ringCount; ringCell0 = Math.max(12, Math.min(22, Math.floor((spacing2 - GAP)/3.6))); } else { ringCell0 = 10; }
  for(let i=0;i<ringCells.length;i++) ringCells[i] = Math.max(8, Math.round(ringCell0 * Math.pow(ratio, i)));
  topCell = Math.round(ringCell0 * 1.3);
      }
      // Placer le top (prochaine pièce)
      if(showCount>0){
        const tx = Math.round(cx - topCell*2);
        const ty = Math.round(panelY + Math.floor(topAreaH/2) - topCell*2 + 4); // abaisse de 4px
        this._nextTop = { x: tx, y: ty, cell: topCell };
        this._nextHit = { x: tx, y: ty, w: topCell*4, h: topCell*4 };
      }
      // Placer l’anneau des suivantes
      const a0 = -Math.PI/2; const aStep = ringCount>0 ? (2*Math.PI)/ringCount : 0;
      const centers = [];
      this._nextRing = [];
      for(let i=0;i<ringCount;i++){
        const c = ringCells[i];
        const ang = a0 + i*aStep;
        const px = Math.round(cx + Math.cos(ang) * Reff);
        const py = Math.round(cy + Math.sin(ang) * Reff);
        const x = Math.round(px - c*2);
        const y = Math.round(py - c*2);
        this._nextRing.push({ x, y, cell: c });
        centers.push({ x: x + c*2, y: y + c*2 });
      }
      // Connecteurs visuels: top → premier du cercle (descente), puis segments entre items du cercle
      if(!this._nextAnim){
        ctx.save();
        // Descente du top vers le premier du cercle
        if(this._nextTop && centers.length>0){
          const a = { x: this._nextTop.x + this._nextTop.cell*2, y: this._nextTop.y + this._nextTop.cell*2 };
          const b = centers[0];
          ctx.strokeStyle = 'rgba(148,163,184,0.28)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        // Liaisons entre items du cercle
        if(centers.length>1){
          for(let i=0;i<centers.length-1;i++){
            const a = centers[i], b = centers[i+1];
            const alpha = Math.max(0.06, 0.18 - i*0.02);
            ctx.strokeStyle = `rgba(148,163,184,${alpha.toFixed(2)})`;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // Dessin statique si pas d'animation
      if(!this._nextAnim){
        // Top
        if(this._nextTop && this.nextQueue[0]){ const it=this.nextQueue[0]; ctx.save(); ctx.globalAlpha=1; drawMat(ctx, it.mat, this._nextTop.x, this._nextTop.y, this._nextTop.cell, pieceColor(it.key)); ctx.restore(); }
        // Cercle
        for(let i=0;i<ringCount;i++){
          const nd=this._nextRing[i]; const item=this.nextQueue[i+1]; if(!item) break;
          const alpha = Math.max(0.45, 1 - (i+1)*0.12);
          ctx.save(); ctx.globalAlpha = alpha; drawMat(ctx, item.mat, nd.x, nd.y, nd.cell, pieceColor(item.key)); ctx.restore();
        }
      }
      // Animation initiale NEXT -> spawn + décalage
      if(!this._countdown && !this.active && !this._initialAnimDone && !this._nextAnim && this._boardRect){
        const br=this._boardRect; const spawnX=br.x+3*br.cell; const spawnY=br.y+(-4)*br.cell; const spawnC=br.cell;
        const items=[]; const first = this.nextQueue.shift() || spawn(this.bag); this._initialPiece = first;
        if(this._nextTop){ items.push({ mat:first.mat.map(r=>r.slice()), color:pieceColor(first.key), x0:this._nextTop.x, y0:this._nextTop.y, c0:this._nextTop.cell, x1:spawnX, y1:spawnY, c1:spawnC }); }
        // Les suivantes se décalent: ring[0] -> top, ring[i] -> ring[i-1]
        for(let j=1;j<showCount;j++){
          const piece = this.nextQueue[j-1]; if(!piece) break;
          const from = this._nextRing[j-1]; const to = (j===1 ? this._nextTop : this._nextRing[j-2]); if(!from || !to) break;
          const color = pieceColor(piece.key);
          items.push({ mat: piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:to.x, y1:to.y, c1:to.cell });
        }
        this.nextQueue.push(spawn(this.bag));
        if(items.length){ this._nextAnim = { t:0, dur:0.18, items, mode:'initial' }; }
      }
  }
  ctx.restore();

    // Garbage badge
    const incoming = this.garbage?.incoming||0;
  if(incoming>0){ drawDangerBadge(ctx, bx+boardW-10, by-10, incoming); }

  // Overlays du parent (toasts, game over)
    super.render?.(ctx);
    // Animation HOLD (slide entre plateau et panneau HOLD)
    if(this._holdAnim){
      const a = this._holdAnim; const k = Math.min(1, a.t/a.dur); const kk = easeOutCubic(k);
      const lerp = (v0,v1)=> v0 + (v1-v0)*kk;
      if(a.fromActive){
        const x = lerp(a.fromActive.x0, a.fromActive.x1);
        const y = lerp(a.fromActive.y0, a.fromActive.y1);
        const c = lerp(a.fromActive.c0, a.fromActive.c1);
        drawMat(ctx, a.fromActive.mat, x, y, c, a.fromActive.color);
      }
      if(a.fromHold){
        const x = lerp(a.fromHold.x0, a.fromHold.x1);
        const y = lerp(a.fromHold.y0, a.fromHold.y1);
        const c = lerp(a.fromHold.c0, a.fromHold.c1);
        drawMat(ctx, a.fromHold.mat, x, y, c, a.fromHold.color);
      }
      if(a.fromNext){
        const x = lerp(a.fromNext.x0, a.fromNext.x1);
        const y = lerp(a.fromNext.y0, a.fromNext.y1);
        const c = lerp(a.fromNext.c0, a.fromNext.c1);
        drawMat(ctx, a.fromNext.mat, x, y, c, a.fromNext.color);
      }
    }
    // Animation NEXT (overlay) – la 1ère glisse vers le spawn, les autres prennent sa place
    if(this._nextAnim){
      const a = this._nextAnim; const k = Math.min(1, a.t/a.dur); const kk = easeOutCubic(k);
      const lerp = (v0,v1)=> v0 + (v1-v0)*kk;
      for(const it of a.items){
        const x = lerp(it.x0, it.x1);
        const y = lerp(it.y0, it.y1);
        const c = lerp(it.c0, it.c1);
        drawMat(ctx, it.mat, x, y, c, it.color);
      }
    }
    // Compte à rebours (3,2,1) avec bounce/zoom + glow + couleurs vives
    if(this._countdown){
      const left = Math.max(0, this._countdown.dur - (performance.now() - this._countdown.start));
      const n = Math.max(1, Math.ceil(left/1000)); // affiche 3..2..1
      const msInBucket = (1000 - (left % 1000)) % 1000; // 0->999 pour chaque chiffre
      const p = Math.min(1, msInBucket/1000);
      const s = 0.6 + 0.6*easeOutBack(p); // 0.6 -> 1.2 avec overshoot
      const cx = bx + boardW/2; const cy = by + boardH*(1/3);
      // Couleurs vives par chiffre
      const palette = { 3:'#22d3ee', 2:'#a78bfa', 1:'#fbbf24' };
      const col = palette[n] || '#22d3ee';
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      // Glow
      ctx.shadowColor = col; ctx.shadowBlur = 28;
      // Contour
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.font='bold 72px Orbitron, system-ui';
      ctx.strokeText(String(n), 0, 0);
      // Remplissage
      ctx.fillStyle = col;
      ctx.fillText(String(n), 0, 0);
      ctx.restore();
    }
    // Flash "GO" bref après le décompte
    if(!this._countdown && this._go){
      const cx2 = bx + boardW/2; const cy2 = by + boardH*(1/3);
      const p = Math.min(1, (performance.now() - this._go.start)/this._go.dur);
      const s = 0.9 + 0.3*easeOutBack(p);
      const col = '#34d399';
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.scale(s, s);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowColor = col; ctx.shadowBlur = 22;
      ctx.lineWidth = 5; ctx.strokeStyle='rgba(0,0,0,0.55)';
      ctx.font='bold 60px Orbitron, system-ui';
      ctx.strokeText('GO', 0, 0);
      ctx.fillStyle = col; ctx.fillText('GO', 0, 0);
      ctx.restore();
    }
  // (overlay fullscreen de countdown supprimé: on garde la version en haut du plateau)
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
  onRotate(){ if(this._countdown || !this.active) return; const r=rotateCW(this.active.mat); tryApplyRotation(this, r); }
  onRotateCCW(){ if(this._countdown || !this.active) return; const r=rotateCW(rotateCW(rotateCW(this.active.mat))); tryApplyRotation(this, r); }
  onHardDrop(){
    if(this._countdown || !this.active) return;
    // Préparer l'animation de chute (copie de la pièce courante)
    const startY = Math.floor(this.y);
  const endY = computeGhostY(this.grid, this.active, this.x, this.y);
    const pieceCopy = { mat: this.active.mat.map(r=>r.slice()) };
    const color = pieceColor(this.active.key);
    const finalCells = [];
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(pieceCopy.mat[j][i]) finalCells.push({ x:this.x+i, y:endY+j });
    const dist = Math.max(0, (endY - startY));
    // Plus court et plus nerveux
    const dur = Math.max(0.05, Math.min(0.12, 0.04 + dist*0.008));
    this._dropAnim = { mat: pieceCopy.mat, color, x:this.x, yStart:startY, yEnd:endY, t:0, dur, finalCells };
    // Poser instantanément pour le gameplay et afficher la prochaine pièce tout de suite
    this.y = endY; // pas strictement nécessaire mais explicite
    lock(this);
    this.checkObjectivesAndMaybeEnd();
  }
  onMove(step){ if(this._countdown || !this.active) return; const nx = this.x + Math.sign(step); if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; } }
  onSoftDropTick(dt){ if(this._countdown || !this.active) return; this.dropAcc += dt*this.gravity*18; }
  onHold(){ if(this._countdown) return;
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
function tryApplyRotation(self, newMat){
  // Appliquer rotation avec petits wall-kicks: 0, ±1, ±2 cellules horizontales si possible
  const kicks = [0, -1, 1, -2, 2];
  for(const dx of kicks){ if(!self.grid.collide(newMat, self.x+dx, Math.floor(self.y))){ self.active.mat = newMat; if(dx) self.x += dx; return true; } }
  // Essai léger vertical si nécessaire (cas rares au sommet): y-1
  if(!self.grid.collide(newMat, self.x, Math.floor(self.y)-1)){ self.active.mat = newMat; self.y = Math.floor(self.y)-1; return true; }
  return false;
}
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
  // Top-out au verrouillage: si une partie de la pièce est restée au-dessus (y<0) au moment du lock, c'est un KO.
  if(y < 0){
    let anyAbove=false; for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(self.active.mat[j][i] && (y+j) < 0){ anyAbove=true; break; } } if(anyAbove) break; }
    if(anyAbove){ try{ self.triggerGameOver?.(); self.objectives?.onKO?.(); }catch{} return; }
  }
  // Préparer animation NEXT -> spawn et décalage des suivants (top + anneau)
  try{
    const br = self._boardRect;
    if((self._nextTop || (self._nextRing && self._nextRing.length)) && br){
      const showCount = Math.min(6, self.nextQueue.length);
      const items=[]; const spawnX=br.x+3*br.cell; const spawnY=br.y+(-4)*br.cell; const spawnC=br.cell;
      for(let i=0;i<showCount;i++){
        const piece=self.nextQueue[i]; if(!piece) break; const color=pieceColor(piece.key);
        if(i===0){ const from=self._nextTop; if(from){ items.push({ mat:piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:spawnX, y1:spawnY, c1:spawnC }); } }
        else {
          const from=self._nextRing[i-1]; const to = (i===1 ? self._nextTop : self._nextRing[i-2]); if(from && to){ items.push({ mat:piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:to.x, y1:to.y, c1:to.cell }); }
        }
      }
      if(items.length){ self._nextAnim = { t:0, dur:0.16, items }; }
    }
  }catch{}
  // Nouvelle pièce
  self.active = self.nextQueue.shift() || spawn(self.bag);
  self.nextQueue.push(spawn(self.bag));
  self.x=3; self.y=-4; self.lockTimer=0; self.holdUsed=false;
  self.dropAcc = 0; // éviter d'hériter de l'accélération du coup précédent
  // Top-out: si la nouvelle pièce est bloquée dès le spawn -> KO
  if(collide(self.grid, self.active, self.x, self.y) || cannotEnterVisibleAtSpawn(self.grid, self.active, self.x, Math.floor(self.y)) ){
  // Armer la grâce: attendre 1er pas de gravité ou 250ms
  try{ self._spawnKoPending = true; self._spawnKoWait = true; self._spawnKoAnchorY = Math.floor(self.y); self._spawnKoDeadline = performance.now() + 250; }catch{}
  }
}

function drawPanel(ctx,x,y,w,h,title){ ctx.strokeStyle='#475569'; ctx.strokeRect(x,y,w,h); ctx.fillStyle='#94a3b8'; ctx.fillText(title, x+6, y+14); }
// Swap hold/active selon règles
SoloScreen.prototype.swapHold = function(){
  if(!(this.rules?.inputs?.allowHold)) return;
  const hasHeldBefore = !!this.hold;
  const current = this.active ? { key:this.active.key, mat: this.active.mat.map(r=>r.slice()) } : null;
  // Préparer anim HOLD si positions connues
  const br = this._boardRect; const hd = this._holdDraw; const nh = this._nextHit;
  const canAnim = br && hd;
  if(canAnim){
  const spawnX = br.x + 3*br.cell, spawnY = br.y + (-4)*br.cell;
    const anim = { t:0, dur:0.14 };
    if(current){ anim.fromActive = { mat: current.mat.map(r=>r.slice()), color: pieceColor(current.key), x0: br.x + this.x*br.cell, y0: br.y + Math.floor(this.y)*br.cell, c0: br.cell, x1: hd.x, y1: hd.y, c1: hd.cell }; }
    if(hasHeldBefore){
      anim.fromHold = { mat: this.hold.mat.map(r=>r.slice()), color: pieceColor(this.hold.key), x0: hd.x, y0: hd.y, c0: hd.cell, x1: spawnX, y1: spawnY, c1: br.cell };
    } else if(nh){
      // Première utilisation: faire glisser la prochaine pièce affichée vers le spawn
      const firstNext = this.nextQueue[0];
  if(firstNext){ anim.fromNext = { mat: firstNext.mat.map(r=>r.slice()), color: pieceColor(firstNext.key), x0: nh.x, y0: nh.y, c0: nh.w/4, x1: spawnX, y1: spawnY, c1: br.cell }; }
    }
    this._holdAnim = anim;
  }
  if(hasHeldBefore){
    this.active = this.hold;
    this.hold = current;
  } else {
    this.hold = current;
    // Si pas d'active (début), on prend directement depuis NEXT
    if(!this.active){ this.active = this.nextQueue.shift() || spawn(this.bag); this.nextQueue.push(spawn(this.bag)); }
    else { this.active = this.nextQueue.shift() || spawn(this.bag); this.nextQueue.push(spawn(this.bag)); }
  }
  this.x=3; this.y=-4; this.lockTimer=0;
  if(this.rules?.inputs?.holdConsumesLock){ this.holdUsed = true; }
  // Top-out à l'apparition post-hold
  if(collide(this.grid, this.active, this.x, this.y) || cannotEnterVisibleAtSpawn(this.grid, this.active, this.x, Math.floor(this.y)) ){
  try{ this._spawnKoPending = true; this._spawnKoWait = true; this._spawnKoAnchorY = Math.floor(this.y); this._spawnKoDeadline = performance.now() + 250; }catch{}
  }
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

// Secousse nucléaire au Game Over (cadre et plateau vibrent fortement puis s'amortissent)
SoloScreen.prototype.onNukeShake = function(){
  try{ this._shake = Math.max(this._shake||0, 18); }catch{}
};

// Game Over: relance automatique en Solo après 5s
SoloScreen.prototype.triggerGameOver = function(){
  if(this.gameOver) return;
  BaseGameScreen.prototype.triggerGameOver.call(this);
  try{
    setTimeout(()=>{ if(!this._alive) return; if(typeof this.restart==='function') this.restart(); }, 5000);
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

function drawGlassFrame(ctx, x,y,w,h, stress=0, t=0, nukeGlow=0){
  ctx.save();
  // Outer glow when stressed
  const glow = Math.max(0, Math.min(1, stress||0));
  // Heartbeat: deux impulsions par période (~1.1 Hz) atténuées quand pas stressé
  const hb = heartbeat(t, 1.1);
  const hbAmp = 0.35 * (0.25 + 0.75*glow); // amplitude croît avec le stress
  const hbMul = 1 + hb * hbAmp;
  // Nuke flash: surcouche rouge intense (0..1)
  const nukeK = Math.max(0, Math.min(1, nukeGlow||0));
  const glowBlur = (40 + glow*30 + nukeK*50) * hbMul;
  const baseAlpha = (0.25 + 0.35*glow) * hbMul;
  const glowAlpha = Math.min(1, baseAlpha + nukeK*0.8);
  const glowCol = glow>0 || nukeK>0 ? `rgba(239,68,68,${glowAlpha})` : 'rgba(0,0,0,0.55)';
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.shadowColor = glowCol; ctx.shadowBlur = glowBlur;
  roundRect(ctx, x+2, y+8, w, h, 16); ctx.fill();
  // Inner stroke tint shifts with stress
  const strokeCol = (glow>0 || nukeK>0) ? `rgba(239,68,68,${Math.min(1,(0.12 + 0.08*glow + nukeK*0.3) * (0.9 + 0.4*hb))})` : 'rgba(56,189,248,.14)';
  ctx.strokeStyle=strokeCol; ctx.lineWidth=2; roundRect(ctx, x+2, y+8, w, h, 16); ctx.stroke();
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
  const rr = Math.max(0, Math.min(r, Math.abs(w)/2, Math.abs(h)/2));
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
  const valueX = x + Math.max(110, Math.min(160, (panelW||200) - 36));
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

// KO si la pièce spawn entièrement au-dessus (toutes ses cases y<0) et ne peut pas descendre d’un cran (collision à y+1)
function cannotEnterVisibleAtSpawn(grid, piece, x, y){
  if(y >= 0) return false;
  // Essayer la colonne actuelle et quelques décalages proches pour voir si une issue latérale existe
  const offsets = [0,-1,1,-2,2,-3,3];
  for(const dx of offsets){
    let yy = Math.floor(y);
    while(!grid.collide(piece.mat, x+dx, yy+1)) yy++;
    let anyVisible=false; for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(piece.mat[j][i] && (yy+j)>=0){ anyVisible=true; break; } } if(anyVisible) break; }
    if(anyVisible) return false; // une voie d'entrée visible existe en se décalant
  }
  // Aucune colonne proche ne permet d'entrer dans la zone visible
  return true;
}

function easeOutCubic(t){ t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
// Légère sur-élan pour l’effet bounce du décompte
function easeOutBack(t){ t = Math.max(0, Math.min(1, t)); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Fonction heartbeat (deux battements par période): pics nets, dépendants du temps
function heartbeat(t, freq=1.1){
  // Fraction de phase 0..1
  const phase = (t*freq) % 1;
  // Deux impulsions: une forte vers 0, une plus faible vers ~0.35
  const p1 = Math.max(0, 1 - Math.abs((phase - 0.03)/0.06));
  const p2 = Math.max(0, 1 - Math.abs((phase - 0.38)/0.08));
  // Accentuer en puissance pour des pics courts
  return Math.pow(p1, 3) + 0.65*Math.pow(p2, 3);
}

// Ratio de remplissage de la pile: 0 (vide) .. 1 (jusqu'en haut)
function computeStackRatio(grid){
  const h = grid.h|0, w = grid.w|0;
  let firstFilled = h; // index de la première ligne contenant quelque chose
  for(let y=0;y<h;y++){
    let any=false; for(let x=0;x<w;x++){ if(grid.cells[y][x]){ any=true; break; } }
    if(any){ firstFilled = y; break; }
  }
  if(firstFilled===h) return 0; // vide
  const filledHeight = h - firstFilled;
  return Math.max(0, Math.min(1, filledHeight / h));
}
