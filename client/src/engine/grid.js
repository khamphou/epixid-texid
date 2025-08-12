// Grille + collisions/lock/clear (stub minimal)
export class Grid{
  constructor(w=10,h=20){ this.w=w; this.h=h; this.cells=Array.from({length:h},()=>Array(w).fill(null)); }
  inside(x,y){ return x>=0&&x<this.w&&y>=0&&y<this.h; }
  collide(mat,x,y){
    for(let j=0;j<4;j++){
      for(let i=0;i<4;i++){
        if(!mat[j][i]) continue;
        const xx = x+i, yy = y+j;
        // hors côtés ou sous le fond => collision
        if(xx<0 || xx>=this.w || yy>=this.h) return true;
        // au-dessus de la grille: ignorer (pas de collision)
        if(yy<0) continue;
        if(this.cells[yy][xx]) return true;
      }
    }
    return false;
  }
  merge(mat,x,y,color){
    for(let j=0;j<4;j++){
      for(let i=0;i<4;i++){
        if(!mat[j][i]) continue;
        const xx=x+i, yy=y+j;
        if(yy<0 || yy>=this.h || xx<0 || xx>=this.w) continue;
        this.cells[yy][xx]=color||1;
      }
    }
  }
  clear(){ let lines=0; for(let y=this.h-1;y>=0;y--){ if(this.cells[y].every(v=>v)){ this.cells.splice(y,1); this.cells.unshift(Array(this.w).fill(null)); lines++; y++; } } return lines; }
  // Détection T-Spin simplifiée (compte des coins occupés autour du pivot pour T)
  detectTSpin(piece,x,y){
    // pivot approximatif (2,2) pour matrice 4x4
    const corners = [ [x, y], [x+2, y], [x, y+2], [x+2, y+2] ];
    let occ=0; for(const [cx,cy] of corners){ if(!this.inside(cx,cy) || this.cells[cy][cx]) occ++; }
    if(occ>=3) return true; return false;
  }
}
