// Pièces + rotations SRS (stubs)
export const TETROMINOS={
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J:[[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  L:[[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  O:[[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  S:[[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
  T:[[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
  Z:[[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
};
export function rotateCW(mat){ const n=4; const r=Array.from({length:n},()=>Array(n).fill(0)); for(let j=0;j<n;j++) for(let i=0;i<n;i++) r[i][n-1-j]=mat[j][i]; return r; }
export function clone(m){ return m.map(r=>r.slice()); }
