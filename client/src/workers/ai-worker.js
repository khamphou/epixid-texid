/**
 * AI Worker - Offloads heavy AI computation to background thread
 *
 * Receives grid state and computes best placement hint asynchronously.
 * This prevents frame drops in the main thread during AI calculations.
 *
 * Message format:
 * - IN: { type: 'compute-hint', grid, active, hold, holdUsed, nextQueue, aiProfile }
 * - OUT: { type: 'hint-result', hint, hintUseHold, hintKey }
 */

// Import AI engine modules
import { TETROMINOS } from '../engine/piece.js';
import {
  rotateN,
  collideGrid,
  cloneSim,
  placeOn,
  simulateClear,
  detectRotIndex,
  matsEqual
} from '../engine/ai/simulation.js';
import {
  stackHeight,
  countHoles,
  bumpiness,
  columnHeights,
  columnDepthAt,
  deepWells,
  overhangs,
  countEdgeHoles
} from '../engine/ai/helpers.js';
import {
  bestPlacementScoreForNext,
  bestPlacementScoreWithFollow,
  bestPlacementThatReducesHoles,
  countLegalPlacements
} from '../engine/ai/evaluator.js';
import { getAIWeights } from '../engine/ai/profiles.js';

/**
 * Compute the best placement hint for given piece
 * @param {number[][]} gridNow - Current grid state
 * @param {number} COLS - Grid width
 * @param {number} ROWS - Grid height
 * @param {string} pieceKey - Piece type (I, O, T, S, Z, J, L)
 * @param {string[]} upcomingKeys - Next piece queue
 * @param {string} aiProfile - AI difficulty profile
 * @param {number} holesBefore - Holes count before placement
 * @param {number} heightBefore - Stack height before placement
 * @returns {{ hint, score, newHoles }}
 */
function evalForKey(gridNow, COLS, ROWS, pieceKey, upcomingKeys, aiProfile, holesBefore, heightBefore) {
  let locBest = null;
  let locBestNonClear = null;
  let minNewHolesSeen = Infinity;
  let bestMinHoleCand = null;

  const hRatio = heightBefore / ROWS;
  const freeRows = ROWS - heightBefore;
  const inDanger = freeRows <= 4;

  const iIndex = upcomingKeys.findIndex(k => k === 'I');
  const iSoon = iIndex >= 0 && iIndex <= 4;
  const preferRightWell = iSoon || (aiProfile === 'agressif' && hRatio < 0.6);

  const w = getAIWeights(aiProfile);

  // Try all 4 rotations
  for (let rot = 0; rot < 4; rot++) {
    const mat = rotateN(TETROMINOS[pieceKey], rot);

    // Calculate piece bounds
    let minX = 4, maxX = 0;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        if (mat[j][i]) {
          minX = Math.min(minX, i);
          maxX = Math.max(maxX, i);
        }
      }
    }

    // Try all horizontal positions
    for (let px = -minX; px <= COLS - (maxX + 1); px++) {
      // Find landing Y position
      let py = -2;
      while (!collideGrid(gridNow, COLS, ROWS, px, py + 1, mat)) py++;
      if (py < -1) continue;

      // Simulate placement
      const sim = cloneSim(gridNow);
      placeOn(sim, COLS, ROWS, px, py, mat, pieceKey);
      const cleared = simulateClear(sim, COLS, ROWS);
      const h1 = stackHeight(sim, COLS, ROWS);
      const holes = countHoles(sim, COLS, ROWS);
      const bump = bumpiness(sim, COLS, ROWS);
      const edgeHoles = countEdgeHoles(sim, COLS, ROWS);
      const newHoles = Math.max(0, holes - holesBefore);
      const highPoseFactor = 1 + Math.max(0, (16 - Math.max(0, py))) * 0.06;

      let mobility = 0;
      if (upcomingKeys[0]) {
        mobility = countLegalPlacements(sim, COLS, ROWS, upcomingKeys[0]);
      }

      // Lookahead up to K next pieces (2..10)
      const K = Math.min(Math.max(2, upcomingKeys.length), 10);
      let la = 0;
      if (K >= 1) {
        la += bestPlacementScoreForNext(sim, COLS, ROWS, upcomingKeys[0], aiProfile) * w.look1;
      }
      if (K >= 2) {
        la += bestPlacementScoreWithFollow(sim, COLS, ROWS, upcomingKeys[0], upcomingKeys[1], aiProfile) * w.look2;
      }
      if (K > 2) {
        const extraBase = Math.max(0.08, Math.min(0.22, w.look2 * 0.5));
        for (let i = 2; i < K; i++) {
          const decay = Math.pow(0.82, i - 2);
          la += bestPlacementScoreForNext(sim, COLS, ROWS, upcomingKeys[i], aiProfile) * extraBase * decay;
        }
      }

      // Fill holes bonus
      let fillBonus = 0;
      if (upcomingKeys[0]) {
        const bestAfterNext = bestPlacementThatReducesHoles(sim, COLS, ROWS, upcomingKeys[0], holesBefore);
        if (bestAfterNext && bestAfterNext.holesReduced > 0) {
          fillBonus = Math.min(10, bestAfterNext.holesReduced * 4);
        }
      }

      let clearedBonus = (cleared >= 3 ? w.clear3Bonus : cleared * w.clearUnit);
      if (inDanger && cleared === 2) {
        clearedBonus *= w.clear2DangerBoost;
      }

      const deltaHeight = h1 - heightBefore;
      const dropReward = (deltaHeight < 0 ? (-deltaHeight) * w.heightDropReward * (inDanger ? 1.4 : 1.0) : 0);
      const wellPenalty = deepWells(sim, COLS, ROWS) * w.deepWell;
      const overhangPenalty = overhangs(sim, COLS, ROWS) * w.overhang;

      let score = clearedBonus + dropReward + fillBonus
        - holes * w.holes
        - bump * w.bump
        - h1 * (w.height * (inDanger ? 1.5 : 1.0))
        - (newHoles * w.newHole * highPoseFactor)
        - edgeHoles * w.edgeHole
        - wellPenalty - overhangPenalty
        + la + mobility * w.mobility;

      // Aggressive mode adjustments
      if (aiProfile === 'agressif') {
        if (hRatio < 0.6) {
          // Low stack: target Tetris (4 lines)
          if (cleared === 4) score += 120;
          if (cleared <= 2) score -= 30;
          if (newHoles > 0) score -= newHoles * 4;
        } else {
          // >60% stack: prioritize 3+ lines and safety
          if (cleared >= 3) score += 60;
          if (newHoles > 0) score -= newHoles * 8;
        }
      }

      // Right well preference (for I-piece setup)
      if (preferRightWell) {
        const rightDepth = columnDepthAt(sim, COLS, ROWS, COLS - 1);
        if (rightDepth >= 2) score += Math.min(12, rightDepth * 3);

        const heightsBefore = columnHeights(gridNow, COLS, ROWS);
        const heightsAfter = columnHeights(sim, COLS, ROWS);
        const deltaRight = heightsAfter[COLS - 1] - heightsBefore[COLS - 1];
        if (deltaRight > 0) {
          const rightClosePenalty = Math.min(10, deltaRight * 2) * (cleared >= 2 ? 0.5 : 1.0);
          score -= rightClosePenalty;
        }
      }

      const candidate = { x: px, rot, yLanding: py, score, cleared, newHoles };

      if (!locBest || score > locBest.score) locBest = candidate;
      if (cleared === 0) {
        if (!locBestNonClear || candidate.score > locBestNonClear.score) {
          locBestNonClear = candidate;
        }
      }

      // Track best for minimum new holes
      if (newHoles < minNewHolesSeen) {
        minNewHolesSeen = newHoles;
        bestMinHoleCand = candidate;
      } else if (newHoles === minNewHolesSeen && bestMinHoleCand && score > bestMinHoleCand.score) {
        bestMinHoleCand = candidate;
      }
    }
  }

  // Prefer non-clearing if only 1 line and not in danger
  if (locBest && locBest.cleared === 1 && locBestNonClear && !inDanger) {
    const margin = 20;
    if (locBest.score - locBestNonClear.score <= margin) {
      return { hint: locBestNonClear, score: locBestNonClear.score };
    }
  }

  // Always choose best with minimum new holes (lexicographic ordering)
  if (bestMinHoleCand) {
    return {
      hint: bestMinHoleCand,
      score: bestMinHoleCand.score,
      newHoles: bestMinHoleCand.newHoles
    };
  }

  return {
    hint: locBest,
    score: locBest ? locBest.score : -Infinity,
    newHoles: locBest ? locBest.newHoles : Infinity
  };
}

/**
 * Main worker message handler
 */
self.onmessage = function(e) {
  const { type, data } = e.data;

  if (type === 'compute-hint') {
    try {
      const {
        grid,
        active,
        hold,
        holdUsed,
        nextQueue,
        aiProfile,
        x,
        y
      } = data;

      if (!active) {
        self.postMessage({
          type: 'hint-result',
          hint: null,
          hintUseHold: false,
          hintKey: null
        });
        return;
      }

      const COLS = grid[0].length;
      const ROWS = grid.length;
      const pieceKey = active.key;
      const gridNow = grid;

      const holesBefore = countHoles(gridNow, COLS, ROWS);
      const heightBefore = stackHeight(gridNow, COLS, ROWS);
      const upcomingKeys = nextQueue.map(p => p.key);

      // Evaluate active piece
      const resActive = evalForKey(gridNow, COLS, ROWS, pieceKey, upcomingKeys, aiProfile, holesBefore, heightBefore);

      // Evaluate hold piece if available
      let resHold = null;
      let holdKey = null;
      if (!holdUsed) {
        if (hold && hold.key) {
          holdKey = hold.key;
        } else if (upcomingKeys[0]) {
          holdKey = upcomingKeys[0];
        }
        if (holdKey) {
          resHold = evalForKey(gridNow, COLS, ROWS, holdKey, upcomingKeys, aiProfile, holesBefore, heightBefore);
        }
      }

      // Choose best between active and hold (lexicographic: min holes, then max score)
      let choose = resActive;
      let hintUseHold = false;
      let hintKey = pieceKey;

      if (resHold) {
        if (!resActive) {
          choose = resHold;
          hintUseHold = true;
        } else {
          const aH = Number.isFinite(resActive.newHoles) ? resActive.newHoles : Infinity;
          const hH = Number.isFinite(resHold.newHoles) ? resHold.newHoles : Infinity;
          if (hH < aH) {
            choose = resHold;
            hintUseHold = true;
          } else if (hH === aH && resHold.score > resActive.score) {
            choose = resHold;
            hintUseHold = true;
          }
        }
      }

      let hint = choose?.hint || null;
      hintKey = (hint && hintUseHold && holdKey) ? holdKey : (hint ? pieceKey : null);

      // Validate hint doesn't collide
      if (hint) {
        const k = hintKey || pieceKey;
        const mat = rotateN(TETROMINOS[k], hint.rot);
        if (collideGrid(gridNow, COLS, ROWS, hint.x, hint.yLanding, mat)) {
          hint = null;
          hintKey = null;
        }
      }

      // Fallback: safe drop for active piece if no hint
      if (!hint && active) {
        const mat0 = active?.mat || rotateN(TETROMINOS[pieceKey], 0);
        const tryXs = [];
        const cx = x | 0;
        for (let d = 0; d <= COLS; d++) {
          const L = cx - d, R = cx + d;
          if (L >= 0 && !tryXs.includes(L)) tryXs.push(L);
          if (R < COLS && !tryXs.includes(R)) tryXs.push(R);
          if (tryXs.length >= COLS) break;
        }

        for (const px of tryXs) {
          if (collideGrid(gridNow, COLS, ROWS, px, Math.floor(y), mat0)) continue;
          let py = -2;
          while (!collideGrid(gridNow, COLS, ROWS, px, py + 1, mat0)) py++;
          if (py < -3) continue;
          const curRot = detectRotIndex(pieceKey, mat0);
          hint = { x: px, rot: curRot, yLanding: py, score: 0, cleared: 0, newHoles: 0 };
          hintKey = pieceKey;
          break;
        }
      }

      // Send result back to main thread
      self.postMessage({
        type: 'hint-result',
        hint,
        hintUseHold,
        hintKey
      });

    } catch (error) {
      // Send error back to main thread
      self.postMessage({
        type: 'hint-error',
        error: error.message
      });
    }
  }
};
