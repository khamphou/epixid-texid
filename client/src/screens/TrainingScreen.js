import { SoloScreen } from './SoloScreen.js';
import { TETROMINOS } from '../engine/piece.js';
import { SafeStorage } from '../utils/SafeStorage.js';
import {
  // Simulation
  rotateN, collideGrid, cloneSim, placeOn, simulateClear, detectRotIndex,
  // Helpers
  stackHeight, countHoles, countEdgeHoles, bumpiness, columnHeights,
  columnDepthAt, deepWells, overhangs,
  // Profiles & Evaluation
  getAIWeights, countLegalPlacements, bestPlacementScoreForNext,
  bestPlacementThatReducesHoles, bestPlacementScoreWithFollow,
} from '../engine/ai/index.js';
import {
  COPILOT_CONFIG,
  HINT_CONFIG,
  HOLD_BLINK_CONFIG,
  AI_PROFILE_NAMES,
  DEFAULT_AI_PROFILE,
} from '../config/ai-constants.js';

/**
 * Training screen with AI assistance (Easy mode).
 *
 * Extends SoloScreen with visual projections, placement hints, and optional Copilot (auto-pilot).
 * Uses Web Worker for background AI computation to maintain 60 FPS during hint calculation.
 *
 * Features:
 * - **AI Hints**: Ghost projection showing optimal piece placement
 * - **AI Profiles**: 'prudent', 'conservateur', 'equilibre', 'agressif' with different strategies
 * - **Copilot Mode**: Auto-pilot that executes AI recommendations (for demonstration)
 * - **Lookahead**: Evaluates 2-10 upcoming pieces for optimal play
 * - **Web Worker**: Offloads AI computation to background thread (150-300ms → 0ms blocking)
 *
 * AI Strategy:
 * - Lexicographic ordering: minimize new holes first, then maximize score
 * - Evaluates all rotations and positions for current piece
 * - Considers HOLD swap for better outcomes
 * - Uses profile-specific weights (holes, bumpiness, height, line clears)
 *
 * @extends SoloScreen
 * @property {boolean} easyMode - AI assistance enabled (default: true)
 * @property {string} aiProfile - AI profile name: 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
 * @property {Object|null} _hint - Current AI hint: { x, rot, yLanding, score, cleared }
 * @property {string|null} _hintKey - Piece key for which hint is calculated
 * @property {boolean} copilotOn - Auto-pilot mode enabled
 * @property {Worker|null} _aiWorker - Web Worker for background AI computation
 */
export class TrainingScreen extends SoloScreen {
  /**
   * Creates a new Training screen with AI assistance.
   *
   * @param {Object} core - Game core instance
   * @param {Object} options - Screen configuration
   * @param {Object} options.rules - Game rules (DAS, ARR, soft drop, gravity)
   * @param {Object} options.objectives - Win conditions (lines, score, time)
   */
  constructor(core, { rules, objectives }){
    super(core, { rules, objectives });
    this.easyMode = true; // enabled by default in Training
    this.aiProfile = DEFAULT_AI_PROFILE; // 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
    this._hint = null; // { x, rot, yLanding, score, cleared }
  this._hintKey = null; // piece key for which hint is calculated (active or HOLD)
    this._lastState = { x: null, y: null, rot: null, gridHash: null, key: null, next0: null, next1: null };
  this._hintCooldown = 0; // throttle cooldown timer (100ms)
  this._hintThrottled = false; // throttle flag to limit recomputes
  this._hintForKey = null; // piece key for which hint is valid
  this._needHintRecompute = true; // force recalculation (e.g. profile change)
  this._hintUseHold = false; // recommend HOLD?
  this._holdBlinkT = 0; // HOLD blink timer
  this._helpInjectedEl = null; // Training help block
  // Copilot
  this.copilotOn = false;
  this._copilotHeldForKey = null; // avoid HOLD loop for same piece (if strategy changes)
  this._copilotLastSeqKey = null; // piece key to trigger spawn/hold actions once per piece
  // Copilot action cooldowns (human-like rhythm close to DAS/ARR)
  this._copilotCdMs = COPILOT_CONFIG.ACTION_COOLDOWN_MS; // rotation/movement
  this._copilotDropCdMs = COPILOT_CONFIG.DROP_COOLDOWN_MS; // soft drop
  this._copilotLastAct = 0;
  this._copilotLastDrop = 0;
    // UI handlers
    this._ui = { btn:null, dd:null, ddOpen:false, onClick:null, onDocClick:null };
  }

  async init(){
    await super.init();

    // Initialize AI Web Worker for background computation
    try {
      this._aiWorker = new Worker(new URL('../workers/ai-worker.js', import.meta.url), { type: 'module' });
      this._aiWorker.onmessage = (e) => this._handleWorkerMessage(e);
      this._aiWorker.onerror = (err) => {
        console.error('AI Worker error:', err);
        this._aiWorker = null; // Fallback to sync computation
      };
    } catch(err) {
      console.warn('AI Worker not available, using sync computation:', err);
      this._aiWorker = null;
    }

    // Show topbar and Easy button in Training
    try{
      document.getElementById('topbar')?.classList.remove('hidden');
      const btn = document.getElementById('easy-btn');
      const dd = document.getElementById('ai-dd');
      if(btn && dd){
        btn.classList.remove('hidden');
        // Load persisted profile
        const saved = SafeStorage.getEnum('texid_ai_profile', ['off', ...AI_PROFILE_NAMES], null);
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
          this.aiProfile = this.aiProfile || DEFAULT_AI_PROFILE;
          btn.setAttribute('aria-pressed','true');
          btn.classList.add('active');
        }
        this._syncEasyClasses();

        // Synchroniser les checks menu à l'init
        const cur = this.easyMode ? (this.aiProfile||DEFAULT_AI_PROFILE) : 'off';
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

        const signal = this._abortController?.signal;
        btn.addEventListener('click', onClick, { signal });
        document.addEventListener('click', onDoc, { signal });

        // Profile selection
        dd.querySelectorAll('.ai-opt')?.forEach(el=>{
          el.addEventListener('click', (ev)=>{
            const v = ev.currentTarget?.dataset?.value || 'off';
            if(v==='off'){
              this.easyMode=false; this._hint=null; btn.setAttribute('aria-pressed','false'); btn.classList.remove('active'); this._syncEasyClasses();
              SafeStorage.set('texid_ai_profile','off');
              dd.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b.dataset.value==='off' ? 'true':'false'));
              try{ const copBtn=document.getElementById('btn-copilot'); if(copBtn){ copBtn.classList.add('hidden'); copBtn.setAttribute('aria-pressed','false'); copBtn.classList.remove('active'); this.copilotOn=false; } }catch{}
              closeDD();
              return;
            }
            const changed = (this.aiProfile !== v);
            this.aiProfile = v;
            if(!this.easyMode){ this.easyMode = true; }
            btn.setAttribute('aria-pressed','true'); btn.classList.add('active');
            this._syncEasyClasses();
            SafeStorage.set('texid_ai_profile', v);
            dd.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b.dataset.value===v ? 'true':'false'));
            if(changed) this._forceHintRecompute();
            // IA activée -> afficher Copilot bouton
            try{ const copBtn=document.getElementById('btn-copilot'); if(copBtn){ copBtn.classList.remove('hidden'); } }catch{}
            closeDD();
          });
        });
        this._ui = { btn, dd, ddOpen:false, onClick, onDocClick:onDoc };
      }
    }catch{}
    // Copilot button (visible in Training only AND if AI ≠ Off)
    try{
      const copBtn = document.getElementById('btn-copilot');
      if(copBtn){
        const syncVisible = ()=>{
          const iaOn = !!this.easyMode;
          copBtn.classList.toggle('hidden', !iaOn);
        };
        const syncState = ()=>{ copBtn.setAttribute('aria-pressed', this.copilotOn? 'true':'false'); copBtn.classList.toggle('active', !!this.copilotOn); };

        const signal = this._abortController?.signal;
        copBtn.addEventListener('click', ()=>{ this.copilotOn = !this.copilotOn; this._copilotHeldForKey = null; syncState(); }, { signal });
        syncVisible();
        syncState();
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
      const { btn, dd } = this._ui;
      // Event listeners automatically cleaned up by parent's AbortController

      // Terminate AI Web Worker
      if(this._aiWorker){
        try{
          this._aiWorker.terminate();
          this._aiWorker = null;
        }catch(err){
          console.error('Failed to terminate AI worker:', err);
        }
      }

      // Reset and hide AI button outside Training
      if(btn){
        btn.setAttribute('aria-pressed','false');
        btn.setAttribute('aria-expanded','false');
        btn.classList.remove('active','easy-prudent','easy-conservateur','easy-equilibre','easy-agressif');
        btn.classList.add('hidden');
      }
      if(dd){ dd.classList.add('hidden'); }
      // Hide Copilot button outside Training
  try{ const copBtn = document.getElementById('btn-copilot'); if(copBtn){ copBtn.setAttribute('aria-pressed','false'); copBtn.classList.remove('active'); copBtn.classList.add('hidden'); } }catch{}
    }catch{}
    super.dispose();
  }

  /**
   * Updates training screen state including AI hints and Copilot.
   *
   * Called every frame (60 FPS). Handles:
   * - Hint calculation throttling (max 10/sec)
   * - Web Worker hint requests (non-blocking)
   * - Copilot auto-pilot actions (DAS/ARR timing)
   * - HOLD blink animation
   *
   * @param {number} dt - Delta time in seconds since last frame
   * @override
   */
  update(dt){
    super.update(dt);
    if(this.gameOver) return;
    // Update hint throttle cooldown
    if(this._hintCooldown > 0){
      this._hintCooldown -= dt;
      if(this._hintCooldown <= 0){
        this._hintThrottled = false;
        this._hintCooldown = 0;
      }
    }
    // Compute hint on spawn (or profile change)
    if(this.easyMode && this.active){
      const curKey = this.active?.key || null;
      // Throttle: max 10 recomputes/sec (1 every 100ms)
      if((this._needHintRecompute || this._hintForKey !== curKey) && !this._hintThrottled){
        // Use Web Worker if available, otherwise fallback to sync
        if(this._aiWorker){
          this._requestHintFromWorker();
        } else {
          this._computeHint();
        }
        this._hintForKey = curKey;
        this._needHintRecompute = false;
        this._hintThrottled = true;
        this._hintCooldown = HINT_CONFIG.THROTTLE_COOLDOWN_SEC;
      }
  // Blink HOLD si recommandé
  if(this._hintUseHold){
    this._holdBlinkT = ((this._holdBlinkT||0) + dt) % HOLD_BLINK_CONFIG.PERIOD_SEC;
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
  // Copilot: conduire la pièce si activé (reprend la logique /src)
  if(this.copilotOn && this.active){ this._copilotUpdate(dt); }
  }

  render(ctx){
    super.render(ctx);
    if(!this.easyMode || !this._hint || !this.active) return;

    const br = this.getBoardRect();
    this._renderHintProjection(ctx, br);
    this._renderVerticalGuides(ctx, br);
    this._renderHoldBlink(ctx);
    this._renderHelpCartridge(ctx, br);
  }

  _renderHintProjection(ctx, br){
    const { x:bx, y:by, cell } = br;
    const useKey = this._hintKey || this.active.key;
    const mat = rotateN(TETROMINOS[useKey], this._hint.rot);
    const t = (performance.now()%1000)/1000;
    const pulse = 0.45 + 0.45*Math.abs(Math.sin(t*Math.PI*2));

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45*pulse;
    ctx.strokeStyle='rgba(56,189,248,0.9)';
    ctx.lineWidth = 2;

    let minGX=Infinity, maxGX=-Infinity;
    const lowestByCol = new Map();

    for(let j=0;j<4;j++){
      for(let i=0;i<4;i++){
        if(!mat[j][i]) continue;
        const gx = this._hint.x + i;
        const gy = this._hint.yLanding + j;
        if(gx<0||gx>=this.grid.w||gy>=this.grid.h) continue;

        const px = bx + gx*cell, py = by + gy*cell;
        roundRect(ctx, px+2, py+2, cell-4, cell-4, 6);
        ctx.stroke();

        if(gx<minGX) minGX=gx;
        if(gx>maxGX) maxGX=gx;
        const curLow = lowestByCol.get(gx);
        if(curLow==null || gy>curLow) lowestByCol.set(gx, gy);
      }
    }
    ctx.restore();
  }

  _renderVerticalGuides(ctx, br){
    const { x:bx, y:by, cell } = br;

    // Lignes de projection depuis la pièce active vers le bas
    try{
      const sim = this._asSim();
      const curMat = this.active?.mat || rotateN(TETROMINOS[this.active.key], 0);

      let minGX=Infinity, maxGX=-Infinity;
      const lowestByCol = new Map();

      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!curMat[j][i]) continue;
          const gx = (this.x|0) + i;
          const gy = (Math.floor(this.y)) + j;
          if(gx<0||gx>=this.grid.w) continue;

          if(gx<minGX) minGX=gx;
          if(gx>maxGX) maxGX=gx;
          const curLow = lowestByCol.get(gx);
          if(curLow==null || gy>curLow) lowestByCol.set(gx, gy);
        }
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

        // X aligné aux bords visibles de la tuile
        const X = (c===minGX)
          ? (bx + c*cell + 1)
          : (bx + (c+1)*cell - 1);

        const y0 = by + lowGy*cell + (cell - 1);
        const y1 = (hitY < this.grid.h)
          ? (by + hitY*cell + 1)
          : (by + this.grid.h*cell - 1);

        ctx.beginPath();
        ctx.moveTo(X, y0);
        ctx.lineTo(X, y1);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.restore();
    }catch{}
  }

  _renderHoldBlink(ctx){
    // Clignoter le panneau HOLD si HOLD recommandé
    if(!this._hintUseHold || !this._holdPanel) return;

    const k = this._holdBlinkT||0;
    const pulse = 0.5 + 0.5*Math.sin((k/HOLD_BLINK_CONFIG.PERIOD_SEC)*Math.PI*2);
    const fillAlpha = 0.20 + 0.30*pulse;
    const strokeAlpha = 0.70 + 0.25*pulse;

    ctx.save();

    // Fond
    ctx.globalAlpha = Math.max(0.15, Math.min(0.65, fillAlpha));
    ctx.fillStyle = 'rgba(56,189,248,1)';
    roundRect(ctx, this._holdPanel.x+3, this._holdPanel.y+3, this._holdPanel.w-6, this._holdPanel.h-6, 10);
    ctx.fill();

    // Contour
    ctx.globalAlpha = Math.max(0.5, Math.min(0.95, strokeAlpha));
    ctx.strokeStyle = 'rgba(56,189,248,1)';
    ctx.lineWidth = 2.2;
    roundRect(ctx, this._holdPanel.x+2, this._holdPanel.y+2, this._holdPanel.w-4, this._holdPanel.h-4, 10);
    ctx.stroke();

    ctx.restore();
  }

  _renderHelpCartridge(ctx, br){
    const { x:bx, y:by, cell } = br;

    // Cartouche d'aide: nb de rotations + direction
    try{
      const curRot = detectRotIndex(this.active.key, this.active.mat);
      const wantRot = ((this._hint.rot|0)+4)%4;
      const cwDist = (wantRot - curRot + 4) % 4;
      const rotCount = cwDist;

      const dx = Math.sign((this._hint.x|0) - (this.x|0));
      const arrowChar = dx<0? '←' : dx>0? '→' : '⇵';

      // Mesure séparée: texte (petit) + flèche (plus grande)
      const textFont = 'bold 12px system-ui,Segoe UI,Roboto';
      const arrowFont = '800 22px system-ui,Segoe UI,Roboto';
      const pad = 6, gap = 8;

      ctx.save();
      ctx.font = textFont;
      const textLabel = `${rotCount} rot ·`;
      const textW = Math.ceil(ctx.measureText(textLabel).width);
      ctx.font = arrowFont;
      const arrowW = Math.ceil(ctx.measureText(arrowChar).width);
      const th = 28;
      const tw = pad*2 + textW + gap + arrowW;

      // Boîte englobante de la pièce active
      const x0 = this.x|0;
      const y0 = Math.floor(this.y);
      const amat = this.active.mat;
      let minGX=Infinity, maxGX=-Infinity, minGY=Infinity;

      for(let j=0;j<4;j++){
        for(let i=0;i<4;i++){
          if(!amat[j][i]) continue;
          const gx=x0+i, gy=y0+j;
          if(gx<minGX) minGX=gx;
          if(gx>maxGX) maxGX=gx;
          if(gy<minGY) minGY=gy;
        }
      }

      // Position au-dessus de la pièce
      const cx = bx + ((minGX + maxGX + 1)/2) * cell;
      const topY = by + (minGY * cell);
      let rx = Math.round(cx - tw/2);
      let ry = Math.round(topY - th - 8);

      // Clamps pour rester dans le plateau
      const minX = bx + 4, maxX = bx + this.grid.w*cell - tw - 4;
      rx = Math.max(minX, Math.min(maxX, rx));
      ry = Math.max(8, ry);

      // Fond + contour
      ctx.fillStyle='rgba(2,6,23,0.85)';
      roundRect(ctx, rx, ry, tw, th, 8);
      ctx.fill();
      ctx.strokeStyle='rgba(56,189,248,0.35)';
      ctx.lineWidth=1;
      roundRect(ctx, rx, ry, tw, th, 8);
      ctx.stroke();

      // Texte (rotations)
      ctx.textAlign='left';
      ctx.textBaseline='middle';
      ctx.font = textFont;
      ctx.fillStyle='#e5f2ff';
      const textX = rx + pad;
      const cy = ry + th/2;
      ctx.fillText(textLabel, textX, cy);

      // Flèche
      const arrowX = textX + textW + gap;
      ctx.font = arrowFont;
      ctx.fillStyle='#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.strokeText(arrowChar, arrowX, cy + 0.5);
      ctx.fillText(arrowChar, arrowX, cy);

      ctx.restore();
    }catch{}
  }


  // ---- IA Easy (portée depuis legacy/src/main.js) ----
  _forceHintRecompute(){ this._lastState = { x:null, y:null, rot:null, gridHash:null, key:null, next0:null, next1:null }; this._hintCooldown=0; this._needHintRecompute = true; }
  _syncEasyClasses(){
    const btn = this._ui.btn; if(!btn) return;
    btn.classList.remove('easy-prudent','easy-conservateur','easy-equilibre','easy-agressif');
  if(!this.easyMode) return;
    const p = this.aiProfile||DEFAULT_AI_PROFILE;
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
  // En Training: rotation standard, pas de recalcul de hint ici (les projections sont recalculées en render)
  try{ super.onRotate(); }catch{}
  }
  // Idem pour les rotations anti-horaires
  onRotateCCW(){
  try{ super.onRotateCCW?.(); }catch{}
  }
  _stateChanged(s){ const p=this._lastState; const changed = !p || s.x!==p.x || s.y!==p.y || s.rot!==p.rot || s.gridHash!==p.gridHash || s.key!==p.key || s.next0!==p.next0 || s.next1!==p.next1; this._lastState = s; return changed; }

  /**
   * Request hint calculation from Web Worker (async, non-blocking).
   *
   * Serializes grid state and sends to background thread for AI evaluation.
   * Uses postMessage for thread communication. Falls back to sync computation on error.
   *
   * Worker performs:
   * - Evaluates all rotations (0-3) and columns for current piece
   * - Considers HOLD swap if it improves outcome
   * - Uses lookahead (2-10 pieces) with profile-specific weights
   * - Returns optimal placement: { x, rot, yLanding, score, cleared }
   *
   * @private
   * @returns {void} Result delivered via _handleWorkerMessage callback
   */
  _requestHintFromWorker(){
    if(!this._aiWorker || !this.active) return;

    try {
      // Serialize grid state for worker
      const gridSnapshot = this.grid.cells.map(row => row.slice());

      this._aiWorker.postMessage({
        type: 'compute-hint',
        data: {
          grid: gridSnapshot,
          active: {
            key: this.active.key,
            mat: this.active.mat
          },
          hold: this.hold ? { key: this.hold.key } : null,
          holdUsed: this.holdUsed,
          nextQueue: this.nextQueue.map(p => ({ key: p.key })),
          aiProfile: this.aiProfile,
          x: this.x,
          y: this.y
        }
      });
    } catch(err) {
      console.error('Failed to send message to AI worker:', err);
      // Fallback to sync computation
      this._computeHint();
    }
  }

  /**
   * Handle hint result from Web Worker.
   *
   * Receives computed hint via postMessage callback and updates internal state.
   * Called automatically when worker completes AI evaluation.
   *
   * @private
   * @param {MessageEvent} e - Worker message event
   * @param {string} e.data.type - Message type: 'hint-result' or 'hint-error'
   * @param {Object} [e.data.hint] - Optimal placement: { x, rot, yLanding, score, cleared }
   * @param {boolean} [e.data.hintUseHold] - Recommends using HOLD
   * @param {string} [e.data.hintKey] - Piece key for which hint is valid
   * @param {string} [e.data.error] - Error message if type is 'hint-error'
   */
  _handleWorkerMessage(e){
    const { type, hint, hintUseHold, hintKey, error } = e.data;

    if (type === 'hint-error') {
      console.error('AI Worker returned error:', error);
      return;
    }

    if (type === 'hint-result') {
      this._hint = hint;
      this._hintUseHold = hintUseHold;
      this._hintKey = hintKey;
    }
  }

  /**
   * Compute hint synchronously (fallback if worker unavailable).
   *
   * Blocks main thread for 150-300ms during evaluation. Use Web Worker instead for better performance.
   *
   * Algorithm:
   * 1. Evaluates all rotations (0-3) and column positions for current piece
   * 2. Simulates placement and line clears for each candidate
   * 3. Scores using profile weights (holes, bumpiness, height, clears)
   * 4. Considers HOLD swap if it reduces holes or improves score
   * 5. Uses lookahead (2-10 pieces) with diminishing weights
   * 6. Applies lexicographic ordering: minimize new holes first, then maximize score
   *
   * @private
   * @deprecated Use Web Worker (_requestHintFromWorker) for non-blocking computation
   * @returns {void} Updates this._hint, this._hintUseHold, this._hintKey
   */
  _computeHint(){
    try {
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
      const mat0 = this.active?.mat || rotateN(TETROMINOS[pieceKey], 0);
      // Essayer à partir de la position courante puis étendre gauche/droite
      const tryXs = [];
      const cx = this.x|0; for(let d=0; d<=this.grid.w; d++){ const L=cx-d, R=cx+d; if(L>=0 && !tryXs.includes(L)) tryXs.push(L); if(R< this.grid.w && !tryXs.includes(R)) tryXs.push(R); if(tryXs.length>=this.grid.w) break; }
      const COLS=this.grid.w|0, ROWS=this.grid.h|0; const simNow=this._asSim();
      for(const px of tryXs){
        // Si collision à la position courante, sauter
        if(collideGrid(simNow, COLS, ROWS, px, Math.floor(this.y), mat0)) continue;
        let py = -2; while(!collideGrid(simNow, COLS, ROWS, px, py+1, mat0)) py++;
        if(py<-3) continue;
        const curRot = detectRotIndex(pieceKey, mat0);
        this._hint = { x:px, rot:curRot, yLanding:py, score:0, cleared:0, newHoles:0 };
        this._hintKey = pieceKey;
        break;
      }
    }
    } catch(err) {
      console.error('AI hint computation failed:', err);
      this._hint = null;
      this._hintUseHold = false;
      this._hintKey = null;
    }
  }

  _asSim(){
    const COLS=this.grid.w|0, ROWS=this.grid.h|0;
    const sim = Array.from({length:ROWS}, (_,r)=> Array.from({length:COLS}, (__,c)=> this.grid.cells[r][c] ? 1 : 0));
    return sim;
  }

  // --- Copilot (conduit vers l'indice courant + HOLD si bénéfique) ---
  _copilotUpdate(_dt){
    if(this._countdown || !this.active) return;
    // Exiger IA (easyMode) + hint + pièce active comme dans /src
    if(!this.easyMode) return;
    // HOLD immédiat si l'indice le recommande et que HOLD est autorisé/non consommé
    if(this._hint && this._hintUseHold && this.rules?.inputs?.allowHold && !this.holdUsed){
      const curKey = this.active?.key || null;
      if(this._copilotHeldForKey !== curKey){
        this.onHold();
        this._copilotHeldForKey = curKey;
        return; // laisser l'update suivant recalculer l'indice sur la nouvelle pièce
      }
    }
    if(!this._hint) return;
    // Déclencheurs au changement de pièce: HOLD si aucun hint dispo (comportement /src)
    const curKey = this.active?.key || null;
    if(this._copilotLastSeqKey !== curKey){
      this._copilotLastSeqKey = curKey;
      try{ this._copilotMaybeHold(); }catch{}
    }
    // Si toujours aucun hint (après éventuel HOLD), rien à faire
    if(!this._hint || !this.active) return;
    const now = performance.now();
    // Alignement d’orientation: une rotation CW par tick jusqu’à atteindre l’orientation voulue (cooldown)
    const wantRot = ((this._hint.rot|0) + 4) % 4;
    const curRot = detectRotIndex(this.active.key, this.active.mat);
    const needRot = ((wantRot - curRot) % 4 + 4) % 4;
    if(needRot > 0){
      if(now - (this._copilotLastAct||0) >= this._copilotCdMs){ this.onRotate(); this._copilotLastAct = now; }
      return;
    }
    // Déplacement horizontal (un pas par tick)
    const dx = (this._hint.x|0) - (this.x|0);
    if(dx !== 0){
      if(now - (this._copilotLastAct||0) >= this._copilotCdMs){ this.onMove(Math.sign(dx)); this._copilotLastAct = now; }
      return;
    }
    // Aligné: soft drop seulement (pas de hard drop), laisser le lock gérer
    if(now - (this._copilotLastDrop||0) >= this._copilotDropCdMs){ this.onSoftDropTick(0.02); this._copilotLastDrop = now; }
  }

  _copilotMaybeHold(){
    if(!this.rules?.inputs?.allowHold) return;
    // Réplique /src: si aucun hint n'est dispo pour la pièce actuelle, tenter HOLD
    if(!this._hint){ this.onHold(); }
  }
}

// ---- All AI helpers now imported from /engine/ai/ ----
// (Previously 500+ lines of inline functions)

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
