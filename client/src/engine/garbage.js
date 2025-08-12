// Garbage queue avec délai/telegraph et annulation policy (net)
export class Garbage{
  constructor(){
    /** @type {{ lines:number, timer:number, total:number }[]} */
    this.slabs = [];
    this.incoming = 0; // info HUD: total non-appliqué
  }
  /** Enqueue n lignes avec délai en secondes */
  enqueue(n, delaySec){ if(n<=0) return; this.slabs.push({ lines:n, timer: delaySec, total: delaySec }); this.incoming += n; }
  /** Cancel n lignes selon policy net (réduit depuis la fin) */
  cancel(n){ if(n<=0) return 0; let rem=n; for(let i=this.slabs.length-1;i>=0 && rem>0;i--){ const s=this.slabs[i]; const take=Math.min(s.lines, rem); s.lines -= take; rem -= take; this.incoming -= take; if(s.lines<=0){ this.slabs.splice(i,1); } }
    return n-rem; // annulées
  }
  /** Avance les timers, retourne le nb de lignes à appliquer ce tick */
  tick(dtSec){ let apply=0; for(let i=this.slabs.length-1;i>=0;i--){ const s=this.slabs[i]; s.timer -= dtSec; if(s.timer<=0){ apply += s.lines; this.incoming -= s.lines; this.slabs.splice(i,1); } }
    return apply;
  }
  /** copie immuable pour rendu UI */
  snapshot(){ return this.slabs.map(s=>({ lines:s.lines, timer:s.timer, total:s.total })); }
}
