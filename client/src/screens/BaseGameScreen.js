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
    this._softDropHold = false;
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
    if(e.repeat) return;
    if(e.key==='ArrowUp'){ this.onRotate?.(); }
    else if(e.key===' '){ this.onHardDrop?.(); }
    else if(e.key==='ArrowLeft'){ this.onMove?.(-1); }
    else if(e.key==='ArrowRight'){ this.onMove?.(1); }
    else if(e.key==='ArrowDown'){ this._softDropHold = true; }
  }
  _onKeyUp(e){ if(e.key==='ArrowDown') this._softDropHold = false; }

  _onPointerDown(ev){
    if(this.gameOver) return;
    const cvs = this.core.sm.canvas;
    try{ cvs.setPointerCapture(ev.pointerId); this._pId = ev.pointerId; }catch{}
    this._pActive = true;
    this._pStart = { x: ev.clientX, y: ev.clientY, t: performance.now(), b: ev.button };
    this._lastPointer = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  }
  _onPointerMove(ev){
    if(!this._pActive || (this._pId!==null && ev.pointerId!==this._pId)) return;
    this._lastPointer = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  }
  _onPointerUp(ev){
    if(!this._pActive || (this._pId!==null && ev.pointerId!==this._pId)) return;
    this._pActive = false; this._pId = null;
    const end = { x: ev.clientX, y: ev.clientY, t: performance.now(), b: ev.button };
    const dx = end.x - this._pStart.x; const dy = end.y - this._pStart.y; const dt = end.t - this._pStart.t;
    const dist2 = dx*dx + dy*dy;
    const TAP_MS = 220; const TAP_DIST = 12; // proche du legacy
    // Tap court
    if(dt <= TAP_MS && dist2 <= (TAP_DIST*TAP_DIST)){
      if((this._pStart.b ?? 0) === 2){ // clic droit => rotate
        this.onRotate?.();
      } else {
        // Souris: clic gauche court = hard drop, tactile = rotate
        if(ev.pointerType === 'mouse') this.onHardDrop?.(); else this.onRotate?.();
      }
      return;
    }
    // Flick rapide
    if(dt < 200){
      if(dy > 40){ this.onHardDrop?.(); return; }
      if(dx > 30){ this.onMove?.(1); return; }
      if(dx < -30){ this.onMove?.(-1); return; }
    }
  }

  update(dt){
    if(!this._alive) return;
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
