/**
 * Tetris game grid with collision detection and line clearing.
 *
 * Represents the playfield as a 2D array (rows × columns).
 * Standard Tetris dimensions: 10 columns × 20 visible rows (+ 2-4 hidden rows above for spawning).
 *
 * Coordinate System:
 * - Origin (0,0) is top-left
 * - X increases right (columns)
 * - Y increases down (rows)
 * - Negative Y values are above visible grid (spawn zone)
 *
 * Features:
 * - Collision detection with boundaries and locked pieces
 * - Line clearing with gravity (completed rows removed, empty rows added at top)
 * - T-Spin detection (simplified: counts occupied corners around pivot)
 * - Piece locking (merge piece matrix into grid)
 *
 * @property {number} w - Grid width in cells (default: 10)
 * @property {number} h - Grid height in cells (default: 20)
 * @property {Array<Array<number|null>>} cells - 2D array: cells[row][col], null=empty, number=color
 */
export class Grid{
  /**
   * Creates a new empty grid.
   *
   * @param {number} [w=10] - Grid width in cells
   * @param {number} [h=20] - Grid height in cells
   */
  constructor(w=10,h=20){ this.w=w; this.h=h; this.cells=Array.from({length:h},()=>Array(w).fill(null)); }

  /**
   * Check if coordinates are inside grid boundaries.
   *
   * @param {number} x - Column index
   * @param {number} y - Row index
   * @returns {boolean} True if (x,y) is within bounds
   */
  inside(x,y){ return x>=0&&x<this.w&&y>=0&&y<this.h; }

  /**
   * Check if piece matrix collides with grid boundaries or locked pieces.
   *
   * Collision occurs when:
   * - Piece extends outside left/right/bottom boundaries
   * - Piece overlaps with locked cells in visible grid (y >= 0)
   * - Above-grid cells (y < 0) are ignored to allow spawning
   *
   * @param {number[][]} mat - Piece matrix (4×4, 1=filled, 0=empty)
   * @param {number} x - Piece X position (column of top-left matrix cell)
   * @param {number} y - Piece Y position (row of top-left matrix cell)
   * @returns {boolean} True if collision detected
   */
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

  /**
   * Lock piece into grid by merging its matrix cells.
   *
   * Writes piece cells into grid at given position. Only cells within grid boundaries are merged.
   * Above-grid cells (y < 0) are ignored.
   *
   * @param {number[][]} mat - Piece matrix (4×4, 1=filled, 0=empty)
   * @param {number} x - Piece X position
   * @param {number} y - Piece Y position
   * @param {number} [color=1] - Color value to write (cell value)
   * @returns {void} Mutates this.cells
   */
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

  /**
   * Clear completed lines and apply gravity.
   *
   * Removes all rows where every cell is filled.
   * Adds empty rows at top to maintain grid height.
   * Processes bottom-to-top to handle multiple consecutive clears correctly.
   *
   * @returns {number} Number of lines cleared (0-4)
   */
  clear(){ let lines=0; for(let y=this.h-1;y>=0;y--){ if(this.cells[y].every(v=>v)){ this.cells.splice(y,1); this.cells.unshift(Array(this.w).fill(null)); lines++; y++; } } return lines; }

  /**
   * Detect T-Spin (simplified algorithm).
   *
   * Counts occupied corners around piece pivot (assumed at matrix center 2,2).
   * T-Spin detected if 3+ corners are filled or out-of-bounds.
   *
   * Note: This is a simplified detection. True T-Spin requires:
   * - Last action was rotation (not movement)
   * - Specific rotation patterns (3-corner vs 4-corner)
   * - Kick data from rotation system
   *
   * @param {Object} piece - Piece object (unused in simplified version)
   * @param {number} x - Piece X position
   * @param {number} y - Piece Y position
   * @returns {boolean} True if T-Spin pattern detected
   */
  detectTSpin(piece,x,y){
    // pivot approximatif (2,2) pour matrice 4x4
    const corners = [ [x, y], [x+2, y], [x, y+2], [x+2, y+2] ];
    let occ=0; for(const [cx,cy] of corners){ if(!this.inside(cx,cy) || this.cells[cy][cx]) occ++; }
    if(occ>=3) return true; return false;
  }
}
