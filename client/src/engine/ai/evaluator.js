/**
 * AI Placement Evaluator
 * Functions to evaluate and rank piece placements
 */

import { TETROMINOS } from '../piece.js';
import { rotateN, collideGrid, cloneSim, placeOn, simulateClear } from './simulation.js';
import { stackHeight, countHoles, bumpiness } from './helpers.js';
import { getAIWeights } from './profiles.js';

/**
 * Count number of legal placements for a piece
 * Higher = more future mobility
 * @param {number[][]} simGrid - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {string} key - Piece key
 * @returns {number} Number of legal placements
 */
export function countLegalPlacements(simGrid, COLS, ROWS, key) {
  let count = 0;
  for (let rot = 0; rot < 4; rot++) {
    const mat = rotateN(TETROMINOS[key], rot);
    let minX = 4, maxX = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        if (mat[j][i]) {
          minX = Math.min(minX, i);
          maxX = Math.max(maxX, i);
        }
      }
    }
    for (let px = -minX; px <= COLS - (maxX + 1); px++) {
      let py = -2;
      while (!collideGrid(simGrid, COLS, ROWS, px, py + 1, mat)) py++;
      if (py < -1) continue; // Never placed
      count++;
    }
  }
  return count;
}

/**
 * Find best placement score for next piece (1-deep lookahead)
 * @param {number[][]} simGrid - Simulated grid after current piece
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {string} nextKey - Next piece key
 * @param {string} profile - AI profile name
 * @returns {number} Best score achievable
 */
export function bestPlacementScoreForNext(simGrid, COLS, ROWS, nextKey, profile) {
  let best = -Infinity;
  const w = getAIWeights(profile);

  for (let rot = 0; rot < 4; rot++) {
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX = 4, maxX = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        if (mat[j][i]) {
          minX = Math.min(minX, i);
          maxX = Math.max(maxX, i);
        }
      }
    }

    for (let px = -minX; px <= COLS - (maxX + 1); px++) {
      let py = -2;
      while (!collideGrid(simGrid, COLS, ROWS, px, py + 1, mat)) py++;
      if (py < -1) continue;

      const sim = cloneSim(simGrid);
      placeOn(sim, COLS, ROWS, px, py, mat, nextKey);
      const cleared = simulateClear(sim, COLS, ROWS);
      const h1 = stackHeight(sim, COLS, ROWS);
      const holes = countHoles(sim, COLS, ROWS);
      const bump = bumpiness(sim, COLS, ROWS);

      const clearedBonus = cleared === 3 ? 60 : cleared * 10;
      const score = clearedBonus
        - holes * w.holes * 0.93
        - bump * w.bump * 1.0
        - h1 * w.height * 1.0;

      if (score > best) best = score;
    }
  }

  return best;
}

/**
 * Find best placement that reduces existing holes
 * @param {number[][]} simGrid - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {string} nextKey - Next piece key
 * @param {number} holesBefore - Number of holes before placement
 * @returns {Object|null} { holesReduced: number } or null
 */
export function bestPlacementThatReducesHoles(simGrid, COLS, ROWS, nextKey, holesBefore) {
  let best = null;

  for (let rot = 0; rot < 4; rot++) {
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX = 4, maxX = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        if (mat[j][i]) {
          minX = Math.min(minX, i);
          maxX = Math.max(maxX, i);
        }
      }
    }

    for (let px = -minX; px <= COLS - (maxX + 1); px++) {
      let py = -2;
      while (!collideGrid(simGrid, COLS, ROWS, px, py + 1, mat)) py++;
      if (py < -1) continue;

      const sim = cloneSim(simGrid);
      placeOn(sim, COLS, ROWS, px, py, mat, nextKey);
      const holesAfter = countHoles(sim, COLS, ROWS);
      const reduced = Math.max(0, holesBefore - holesAfter);

      if (reduced > 0) {
        const candidate = { holesReduced: reduced };
        if (!best || candidate.holesReduced > best.holesReduced) {
          best = candidate;
        }
      }
    }
  }

  return best;
}

/**
 * Find best placement score with 2-piece lookahead
 * @param {number[][]} simGrid - Simulated grid
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {string} k1 - First piece key
 * @param {string} k2 - Second piece key
 * @param {string} profile - AI profile name
 * @returns {number} Best score achievable
 */
export function bestPlacementScoreWithFollow(simGrid, COLS, ROWS, k1, k2, profile) {
  let best = -Infinity;

  for (let rot = 0; rot < 4; rot++) {
    const mat = rotateN(TETROMINOS[k1], rot);
    let minX = 4, maxX = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        if (mat[j][i]) {
          minX = Math.min(minX, i);
          maxX = Math.max(maxX, i);
        }
      }
    }

    for (let px = -minX; px <= COLS - (maxX + 1); px++) {
      let py = -2;
      while (!collideGrid(simGrid, COLS, ROWS, px, py + 1, mat)) py++;
      if (py < -1) continue;

      const sim1 = cloneSim(simGrid);
      placeOn(sim1, COLS, ROWS, px, py, mat, k1);
      simulateClear(sim1, COLS, ROWS);

      const score = bestPlacementScoreForNext(sim1, COLS, ROWS, k2, profile);
      if (score > best) best = score;
    }
  }

  return best;
}
