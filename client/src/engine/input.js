// Gestion des entrées clavier avec DAS/ARR + soft drop
export class Input{
  /**
   * @param {{ dasMs?:number, arrMs?:number }} [opts]
   */
  constructor(opts){
    this.dasMs = opts?.dasMs ?? 110;
    this.arrMs = opts?.arrMs ?? 10;
    this.left=false; this.right=false; this.down=false;
    this._dir = 0; // -1 left, +1 right, 0 none
    this._phase = 'idle'; // idle|initial|das|arr
    this._dasT = 0; this._arrT = 0;
    this._pendingInitial = 0; // steps to emit immediately after press/flip
    this._keydown = this._keydown.bind(this);
    this._keyup = this._keyup.bind(this);
  }
  start(){ window.addEventListener('keydown', this._keydown); window.addEventListener('keyup', this._keyup); }
  stop(){ window.removeEventListener('keydown', this._keydown); window.removeEventListener('keyup', this._keyup); }
  _keydown(e){
    if(e.repeat) return;
    if(e.key==='ArrowLeft'){ this.left=true; this._setDir(-1); }
    else if(e.key==='ArrowRight'){ this.right=true; this._setDir(1); }
    else if(e.key==='ArrowDown'){ this.down=true; }
  }
  _keyup(e){
    if(e.key==='ArrowLeft'){ this.left=false; if(this._dir<0) this._recomputeDir(); }
    else if(e.key==='ArrowRight'){ this.right=false; if(this._dir>0) this._recomputeDir(); }
    else if(e.key==='ArrowDown'){ this.down=false; }
  }
  _recomputeDir(){
    const nd = this.right && !this.left ? 1 : this.left && !this.right ? -1 : 0;
    this._setDir(nd);
  }
  _setDir(d){
    if(d===this._dir) return;
    this._dir = d;
    if(d===0){ this._phase='idle'; this._dasT=0; this._arrT=0; return; }
    // nouvelle direction -> pas immédiat + reset timers
    this._phase='initial'; this._dasT=0; this._arrT=0; this._pendingInitial = d; // un step à émettre
  }
  /**
   * Calcule le nombre de pas horizontaux à effectuer ce frame selon DAS/ARR
   * @param {number} dtSec
   * @returns {number} négatif=vers gauche, positif=vers droite
   */
  stepHorizontal(dtSec){
    // initial step
    if(this._pendingInitial){ const s=this._pendingInitial; this._pendingInitial=0; this._phase='das'; return s; }
    if(this._dir===0) return 0;
    if(this._phase==='das'){
      this._dasT += dtSec*1000;
      if(this._dasT >= this.dasMs){
        // émettre un premier step puis passer en phase ARR
        this._dasT = this.dasMs; // clamp
        this._phase='arr';
        this._arrT = 0;
        return this._dir;
      }
      return 0;
    }
    if(this._phase==='arr'){
      this._arrT += dtSec*1000;
      let steps = 0;
      while(this._arrT >= this.arrMs){ this._arrT -= this.arrMs; steps++; }
      return steps ? steps * this._dir : 0;
    }
    return 0;
  }
  softDrop(){ return !!this.down; }
}
