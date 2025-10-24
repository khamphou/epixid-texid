/**
 * AI Simulation Helpers
 * Grid manipulation and collision detection for AI evaluation
 */

import { TETROMINOS } from '../piece.js';

/**
 * Rotate matrix N times clockwise (0-3)
 * @param {number[][]} mat - 4x4 matrix
 * @param {number} n - Number of rotations
 * @returns {number[][]} Rotated matrix
 */
export function rotateN(mat, n) {
  let r = mat;
  const k = (n % 4 + 4) % 4;
  for (let i = 0; i < k; i++) {
    r = rotateCW(r);
  }
  return r;
}

/**
 * Rotate matrix 90° clockwise
 * @param {number[][]} m - 4x4 matrix
 * @returns {number[][]} Rotated matrix
 */
export function rotateCW(m) {
  const n = 4;
  const r = Array.from({ length: n }, () => Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      r[i][n - 1 - j] = m[j][i];
    }
  }
  return r;
}

/**
 * Check if two 4x4 matrices are equal
 * @param {number[][]} a - First matrix
 * @param {number[][]} b - Second matrix
 * @returns {boolean} True if equal
 */
export function matsEqual(a, b) {
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (!!a[j][i] !== !!b[j][i]) return false;
    }
  }
  return true;
}

/**
 * Detect rotation index of current piece matrix
 * @param {string} key - Piece key (I, O, T, S, Z, L, J)
 * @param {number[][]} currentMat - Current piece matrix
 * @returns {number} Rotation index 0-3
 */
export function detectRotIndex(key, currentMat) {
  const base = TETROMINOS[key];
  for (let r = 0; r < 4; r++) {
    const m = rotateN(base, r);
    if (matsEqual(m, currentMat)) return r;
  }
  return 0;
}

/**
 * Check collision with grid boundaries and blocks
 * @param {number[][]} sim - Simulated grid (ROWS x COLS)
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {number} px - Piece X position
 * @param {number} py - Piece Y position
 * @param {number[][]} mat - Piece matrix 4x4
 * @returns {boolean} True if collision detected
 */
export function collideGrid(sim, COLS, ROWS, px, py, mat) {
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (!mat[j][i]) continue;
      const x = px + i;
      const y = py + j;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && sim[y][x]) return true;
    }
  }
  return false;
}

/**
 * Clone simulated grid (deep copy)
 * @param {number[][]} sim - Grid to clone
 * @returns {number[][]} Cloned grid
 */
export function cloneSim(sim) {
  return sim.map(row => row.slice());
}

/**
 * Place piece on simulated grid (mutates sim)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {number} px - Piece X position
 * @param {number} py - Piece Y position
 * @param {number[][]} mat - Piece matrix 4x4
 * @param {string} key - Piece key (for future use)
 */
export function placeOn(sim, COLS, ROWS, px, py, mat, key) {
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      if (mat[j][i]) {
        const gx = px + i;
        const gy = py + j;
        if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
          sim[gy][gx] = 1;
        }
      }
    }
  }
}

/**
 * Simulate line clears (mutates sim)
 * @param {number[][]} sim - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @returns {number} Number of lines cleared
 */
export function simulateClear(sim, COLS, ROWS) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; ) {
    if (sim[r].every(v => !!v)) {
      sim.splice(r, 1);
      sim.unshift(Array(COLS).fill(0));
      cleared++;
    } else {
      r--;
    }
  }
  return cleared;
}
