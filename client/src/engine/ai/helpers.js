/**
 * AI Grid Analysis Helpers
 * Functions to evaluate grid quality (holes, bumpiness, height, etc.)
 */

/**
 * Calculate stack height (distance from top to first filled cell)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Height in rows
 */
export function stackHeight(sim, COLS, ROWS) {
  let first = ROWS;
  for (let r = 0; r < ROWS; r++) {
    if (sim[r].some(Boolean)) {
      first = r;
      break;
    }
  }
  return ROWS - first;
}

/**
 * Count holes (empty cells below filled cells)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Number of holes
 */
export function countHoles(sim, COLS, ROWS) {
  let holes = 0;
  for (let c = 0; c < COLS; c++) {
    let blockSeen = false;
    for (let r = 0; r < ROWS; r++) {
      if (sim[r][c]) {
        blockSeen = true;
      } else if (blockSeen) {
        holes++;
      }
    }
  }
  return holes;
}

/**
 * Count holes at left and right edges
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Number of edge holes
 */
export function countEdgeHoles(sim, COLS, ROWS) {
  let holes = 0;
  for (const c of [0, COLS - 1]) {
    let blockSeen = false;
    for (let r = 0; r < ROWS; r++) {
      if (sim[r][c]) {
        blockSeen = true;
      } else if (blockSeen) {
        holes++;
      }
    }
  }
  return holes;
}

/**
 * Get height of each column
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number[]} Array of column heights
 */
export function columnHeights(sim, COLS, ROWS) {
  const heights = Array(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    let h = 0;
    for (let r = 0; r < ROWS; r++) {
      if (sim[r][c]) {
        h = ROWS - r;
        break;
      }
    }
    heights[c] = h;
  }
  return heights;
}

/**
 * Calculate bumpiness (sum of absolute height differences)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Bumpiness score
 */
export function bumpiness(sim, COLS, ROWS) {
  const heights = columnHeights(sim, COLS, ROWS);
  let sum = 0;
  for (let c = 0; c < COLS - 1; c++) {
    sum += Math.abs(heights[c] - heights[c + 1]);
  }
  return sum;
}

/**
 * Get depth of well at specific column
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {number} col - Column index
 * @returns {number} Well depth
 */
export function columnDepthAt(sim, COLS, ROWS, col) {
  const heights = columnHeights(sim, COLS, ROWS);
  const c = col;
  const left = c > 0 ? heights[c - 1] : heights[c];
  const right = c < COLS - 1 ? heights[c + 1] : heights[c];
  const depth = Math.max(0, Math.max(left, right) - heights[c]);
  return depth;
}

/**
 * Count deep wells (depth >= 4)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Deep well penalty score
 */
export function deepWells(sim, COLS, ROWS) {
  const heights = columnHeights(sim, COLS, ROWS);
  let wells = 0;
  for (let c = 0; c < COLS; c++) {
    const left = c > 0 ? heights[c - 1] : heights[c];
    const right = c < COLS - 1 ? heights[c + 1] : heights[c];
    const depth = Math.max(0, Math.max(left, right) - heights[c]);
    if (depth >= 4) {
      wells += depth - 3;
    }
  }
  return wells;
}

/**
 * Count overhang situations (empty cells covered by blocks)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Overhang count
 */
export function overhangs(sim, COLS, ROWS) {
  let count = 0;
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = sim[r][c];
      const b = sim[r][c + 1];
      const c1 = sim[r + 1][c];
      const d = sim[r + 1][c + 1];
      // Pattern: filled-filled on top, empty-filled below
      if (!c1 && a && b && d) {
        count++;
      }
    }
  }
  return count;
}
