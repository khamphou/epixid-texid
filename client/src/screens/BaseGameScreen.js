// BaseGameScreen: comportement commun aux écrans de jeu (inputs, overlays, toasts, objectifs)

import { audio } from '../audio.js';

/**
 * Contrat attendu côté enfant:
 * - getBoardRect(): { x:number, y:number, w:number, h:number, cell?:number }
 * - onRotate(), onHardDrop(), onMove(step:+/-1), onSoftDropTick(dt)
 * - onLineClear?(count:number), onGameOver?()
 */
export class BaseGameScreen {
  constructor(core, { rules, objectives }){
    this.core = core;
    this.rules = rules || {};
    this.objectives = objectives || null;
    this.gameOver = false;
    this._toasts = [];
    this._lastPointer = null;
    this._pActive = false;
    this._pStart = null;
    this._pId = null;
  this._dragAccum = 0; // accumulation de déplacement horizontal lors du drag
    this._softDropHold = false;
  // Tap: rotation immédiate; on ne différencie plus simple/double
  this._tapPending = false; this._tapTimer = null; this._singleDelayMs = 0;
  // DAS/ARR intégrés (clavier) – valeurs par défaut adoucies
  this._dasMs = (this.rules?.inputs?.dasMs ?? 140);
  this._arrMs = (this.rules?.inputs?.arrMs ?? 20);
  this._dir = 0;        // -1 gauche, +1 droite, 0 neutre
  this._phase = 'idle'; // idle|initial|das|arr
  this._dasT = 0; this._arrT = 0;
  this._pendingInitial = 0; // premier pas immédiat
  this._lastLeftClickAt = 0; // pour double-clic chute
    this._kbHandlers = {
      keydown: (e)=> this._onKeyDown(e),
      keyup: (e)=> this._onKeyUp(e),
      contextmenu: (e)=> { e.preventDefault(); return false; }
    };
    this._ptrHandlers = {
      down: (ev)=> this._onPointerDown(ev),
      move: (ev)=> this._onPointerMove(ev),
      up: (ev)=> this._onPointerUp(ev)
    };
  }

  async init(){
  this._alive = true;
    // Entrées clavier
    window.addEventListener('keydown', this._kbHandlers.keydown);
    window.addEventListener('keyup', this._kbHandlers.keyup);
    // Pointeur sur le canvas géré par ScreenManager
    const cvs = this.core.sm.canvas;
    if(cvs){
      try{ cvs.style.touchAction = 'none'; }catch{}
      cvs.addEventListener('pointerdown', this._ptrHandlers.down);
      cvs.addEventListener('pointermove', this._ptrHandlers.move);
      cvs.addEventListener('pointerup', this._ptrHandlers.up);
      cvs.addEventListener('pointercancel', this._ptrHandlers.up);
      cvs.addEventListener('contextmenu', this._kbHandlers.contextmenu);
    }
  }

  dispose(){
    this._alive = false;
  try{ if(this._tapTimer){ clearTimeout(this._tapTimer); this._tapTimer=null; this._tapPending=false; } }catch{}
    window.removeEventListener('keydown', this._kbHandlers.keydown);
    window.removeEventListener('keyup', this._kbHandlers.keyup);
    const cvs = this.core.sm.canvas;
    if(cvs){
      try{ if(this._pId!=null) cvs.releasePointerCapture(this._pId); }catch{}
      cvs.removeEventListener('pointerdown', this._ptrHandlers.down);
      cvs.removeEventListener('pointermove', this._ptrHandlers.move);
      cvs.removeEventListener('pointerup', this._ptrHandlers.up);
      cvs.removeEventListener('pointercancel', this._ptrHandlers.up);
      cvs.removeEventListener('contextmenu', this._kbHandlers.contextmenu);
    }
  }

  // Gestion basique des touches (multi-keys simultanées supportées par le navigateur)
  _onKeyDown(e){
    if(this.gameOver) return;
    if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
  this._trackKey(e, true);
  if(e.key==='ArrowUp'){ this.onRotate?.(); return; }
  if(e.key===' '){ this.onHardDrop?.(); return; }
  if(e.key==='ArrowLeft'){ if(!e.repeat) this._setDir(-1); return; }
  if(e.key==='ArrowRight'){ if(!e.repeat) this._setDir(1); return; }
  if(e.key==='ArrowDown'){ this._softDropHold = true; return; }
  }
  _onKeyUp(e){
  this._trackKey(e, false);
  if(e.key==='ArrowDown') this._softDropHold = false;
    if(e.key==='ArrowLeft' && !this._rightHeld()){ this._setDir(0); }
    if(e.key==='ArrowRight' && !this._leftHeld()){ this._setDir(0); }
    if(e.key==='ArrowLeft' && this._rightHeld()){ this._setDir(1); }
    if(e.key==='ArrowRight' && this._leftHeld()){ this._setDir(-1); }
  }

  // Helpers état touches horizontales (sans KeyUp globaux supplémentaires)
  _leftHeld(){ return !!(this._keys && this._keys['ArrowLeft']); }
  _rightHeld(){ return !!(this._keys && this._keys['ArrowRight']); }
  _trackKey(e, down){
    this._keys = this._keys || {};
    this._keys[e.key] = down;
  }

  _onPointerDown(ev){
    if(this.gameOver) return;
    const cvs = this.core.sm.canvas;
    try{ cvs.setPointerCapture(ev.pointerId); this._pId = ev.pointerId; }catch{}
  // Annuler un tap simple en attente si un nouvel appui commence
  if(this._tapTimer){ try{ clearTimeout(this._tapTimer); }catch{} this._tapTimer=null; this._tapPending=false; }
    this._pActive = true;
    this._pStart = { x: ev.clientX, y: ev.clientY, t: performance.now(), b: ev.button };
    this._lastPointer = { x: ev.clientX, y: ev.clientY, t: performance.now() };
    this._dragAccum = 0;
  }
  _onPointerMove(ev){
    if(!this._pActive || (this._pId!==null && ev.pointerId!==this._pId)) return;
    const now = performance.now();
    this._lastPointer = { x: ev.clientX, y: ev.clientY, t: now };
    // Si un bouton est enfoncé et qu'on déplace la souris, bouger la pièce vers le côté du drag
    // On utilise un petit seuil pour éviter les micro-mouvements
  const THRESH = 18;
  const dx = ev.clientX - this._pStart.x;
  const dy = ev.clientY - this._pStart.y;
  const stepUnits = (ev.buttons && ev.buttons!==0) ? Math.trunc((dx - this._dragAccum) / THRESH) : 0;
    if(stepUnits !== 0){
      const dir = Math.sign(stepUnits);
      for(let i=0;i<Math.abs(stepUnits);i++){ this.onMove?.(dir); }
      this._dragAccum += stepUnits * THRESH;
    }
  // Soft drop via glisser vers le bas (tant que le doigt/bouton est enfoncé)
  if(ev.buttons && ev.buttons!==0){ this._softDropHold = dy > 16; }
  }
  _onPointerUp(ev){
    if(!this._pActive || (this._pId!==null && ev.pointerId!==this._pId)) return;
    this._pActive = false; this._pId = null;
    const end = { x: ev.clientX, y: ev.clientY, t: performance.now(), b: ev.button };
  const cvs = this.core?.sm?.canvas;
  const rect = cvs ? cvs.getBoundingClientRect() : { left:0, top:0 };
  const endLocal = { x: end.x - rect.left, y: end.y - rect.top };
    const dx = end.x - this._pStart.x; const dy = end.y - this._pStart.y; const dt = end.t - this._pStart.t;
    const dist2 = dx*dx + dy*dy;
    const TAP_MS = 250; const TAP_DIST = 14; // tolérance légère
    // Tap court
    if(dt <= TAP_MS && dist2 <= (TAP_DIST*TAP_DIST)){
      // Priorité: clic dans NEXT => HOLD
      try{
        const nh = this._nextHit;
        if(nh && endLocal.x>=nh.x && endLocal.x<=nh.x+nh.w && endLocal.y>=nh.y && endLocal.y<=nh.y+nh.h){ this.onHold?.(); return; }
      }catch{}
      // Tap/clic: rotation (gauche = CW, droit = CCW)
      if((this._pStart.b ?? 0) === 2){ this.onRotateCCW?.(); } else { this.onRotate?.(); }
      return;
    }
    // Flick rapide
    if(dt < 200){
      // Swipe up => hard drop (meilleure pratique mobile)
      if(dy < -40){ this.onHardDrop?.(); return; }
      if(dx > 30){ this.onMove?.(1); return; }
      if(dx < -30){ this.onMove?.(-1); return; }
    }
    // Relâchement: arrêter soft drop
    this._softDropHold = false;
  }

  update(dt){
    if(!this._alive) return;
    // Suivi des touches pour _leftHeld/_rightHeld (basé sur events keydown/keyup)
    // Note: on mémorise à la volée ici pour simplifier la logique de recompute
    // (les appels viennent des handlers)
    
    // Émission des pas horizontaux selon DAS/ARR
    const steps = this._stepHorizontal(dt);
    if(steps){
      const step = Math.sign(steps);
      for(let i=0;i<Math.abs(steps);i++){ this.onMove?.(step); }
    }
    if(this._softDropHold){ this.onSoftDropTick?.(dt); }
    // Décroissance des toasts
    if(this._toasts.length){
      for(const t of this._toasts){ t.t += dt; }
      this._toasts = this._toasts.filter(t=> t.t < t.dur);
    }
  }

  render(ctx){
    if(this.gameOver){ this._renderGameOver(ctx); }
    if(this._toasts.length){ this._renderToasts(ctx); }
  }

  _renderGameOver(ctx){
    const { x,y,w,h } = this.getBoardRect();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x-14, y-14, w+28, h+28);
    const fs = Math.max(22, Math.floor(Math.min(w,h)*0.12));
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${fs}px Orbitron, system-ui`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('GAME OVER', x + w/2, y + h/2);
    ctx.restore();
  }

  _renderToasts(ctx){
    const { x,y,w,h } = this.getBoardRect();
    const cx = x + w/2; const cy = y + h*0.35;
    // Parallax léger selon la dernière position pointeur
    let ox=0, oy=0; const lp = this._lastPointer; if(lp){ ox = Math.max(-8, Math.min(8, (lp.x - cx)*0.02)); oy = Math.max(-8, Math.min(8, (lp.y - cy)*0.02)); }
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const t of this._toasts){
      const k = Math.min(1, t.t / t.dur);
      const up = -20 * k; // dérive verticale
      const alpha = k<0.2 ? (k/0.2) : (k>0.85 ? Math.max(0, 1-(k-0.85)/0.15) : 1);
      ctx.globalAlpha = alpha * 0.95;
      const fs = t.size || 20;
      ctx.font = `bold ${fs}px Orbitron, system-ui`;
      ctx.fillStyle = t.color || '#e5e7eb';
      ctx.fillText(t.msg, cx + ox, cy + oy + up);
    }
    ctx.restore();
  }

  // API toasts
  toast(msg, { color, size=20, dur=1.4 }={}){ this._toasts.push({ msg, color, size, dur, t:0 }); }

  // Implémentation DAS/ARR centralisée
  _setDir(d){
    if(d===this._dir) return;
    this._dir = d;
    if(d===0){ this._phase='idle'; this._dasT=0; this._arrT=0; this._pendingInitial=0; return; }
    this._phase='initial'; this._dasT=0; this._arrT=0; this._pendingInitial = d; // premier pas immédiat
  }
  _stepHorizontal(dtSec){
    // initial step
    if(this._pendingInitial){ const s=this._pendingInitial; this._pendingInitial=0; this._phase='das'; return s; }
    if(this._dir===0) return 0;
    if(this._phase==='das'){
      this._dasT += dtSec*1000;
      if(this._dasT >= this._dasMs){
        this._dasT = this._dasMs; // clamp
        this._phase='arr';
        this._arrT = 0;
        return this._dir;
      }
      return 0;
    }
    if(this._phase==='arr'){
      this._arrT += dtSec*1000;
      let steps = 0;
      while(this._arrT >= this._arrMs){ this._arrT -= this._arrMs; steps++; }
      return steps ? steps * this._dir : 0;
    }
    return 0;
  }

  // Hooks jeu
  noteLineClear(count){
    try{
      // Utiliser l’implémentation legacy et moduler le volume par le count
      if(typeof audio.linesCleared === 'function') audio.linesCleared(count);
      else if(typeof audio.playBreakSfx === 'function') audio.playBreakSfx();
    }catch{}
    // Toast visuel
    if(count>=4) this.toast('TETRIS!', { color:'#60a5fa', size:26 });
    else if(count===3) this.toast('TRIPLE', { color:'#93c5fd', size:22 });
    else if(count===2) this.toast('DOUBLE', { color:'#a7f3d0', size:20 });
    else if(count===1) this.toast('SINGLE', { color:'#e5e7eb', size:18 });
  }

  // Valeur par défaut: si un écran enfant ne définit pas onSoftDropTick, ne rien faire
  onSoftDropTick(_dt){}

  triggerGameOver(){
    if(this.gameOver) return;
    this.gameOver = true;
    try{ audio.playGameOverMusic?.(); }catch{}
  }

  // Vérifier les objectifs et agir (rediriger Home en solo)
  checkObjectivesAndMaybeEnd(){
    try{
      if(this.objectives?.check?.()){
        // Fin de partie (victoire)
        this.toast('GG!', { color:'#facc15', size:26, dur:1.6 });
        setTimeout(()=> this.navigateHome(), 900);
        return true;
      }
    }catch{}
    return false;
  }

  navigateHome(){
    // Revenir à l’accueil DOM via main.js
    try{
      document.getElementById('screen-start')?.classList.add('active');
      document.getElementById('topbar')?.classList.add('hidden');
      this.core.sm.clear();
      // bouton Exit existant fait déjà la remise à zéro propre
    }catch{}
    try{ document.getElementById('btn-exit')?.click(); }catch{}
  }
}
