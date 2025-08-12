// Score/combos/B2B/T-Spins (impl simplifiée)
export class Scoring{
  constructor(){ this.combo=-1; this.b2b=false; this.score=0; this.lines=0; }
  /**
   * @param {{ lines:number, tspin?:'single'|'double'|'triple'|null }} ev
   */
  onClear(ev){
    const l = ev.lines||0; const tsp = ev.tspin||null;
    // combo
    this.combo = (l>0) ? this.combo+1 : -1;
    if(l>0) this.lines += l;
    // B2B active si tetris/tspin et on a clear
    const isB2B = (l===4 || tsp);
    let pts = 0;
    if(tsp){
      pts = tsp==='single' ? 800 : tsp==='double' ? 1200 : 1600;
    } else {
      pts = l===1?100 : l===2?300 : l===3?500 : l===4?800 : 0;
    }
    if(isB2B && this.b2b) pts = Math.floor(pts*1.5);
    if(this.combo>0) pts += this.combo*50;
    this.score += pts;
    // maj b2b
    if(l>0){ this.b2b = isB2B ? true : false; }
  }
}
