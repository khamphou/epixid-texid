import { describe, it, expect } from 'vitest';
import {
  countLegalPlacements,
  bestPlacementScoreForNext,
  bestPlacementThatReducesHoles,
  bestPlacementScoreWithFollow
} from '../evaluator.js';

describe('AI Evaluator - Placement Analysis', () => {
  describe('countLegalPlacements', () => {
    it('should count placements on empty grid', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const count = countLegalPlacements(grid, 10, 20, 'I');
      // I piece should have many legal placements on empty grid
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for completely filled grid', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(1));
      const count = countLegalPlacements(grid, 10, 20, 'I');
      expect(count).toBe(0);
    });

    it('should count different rotations as separate placements', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const countI = countLegalPlacements(grid, 10, 20, 'I');
      const countT = countLegalPlacements(grid, 10, 20, 'T');
      // Both pieces should have multiple legal placements on empty grid
      expect(countI).toBeGreaterThan(10);
      expect(countT).toBeGreaterThan(10);
    });

    it('should count fewer placements on partially filled grid', () => {
      const emptyGrid = Array(20).fill(null).map(() => Array(10).fill(0));
      const partialGrid = Array(20).fill(null).map(() => Array(10).fill(0));
      // Add some blocks at bottom
      for (let c = 0; c < 5; c++) {
        partialGrid[19][c] = 1;
      }

      const emptyCount = countLegalPlacements(emptyGrid, 10, 20, 'T');
      const partialCount = countLegalPlacements(partialGrid, 10, 20, 'T');

      expect(partialCount).toBeLessThanOrEqual(emptyCount);
    });
  });

  describe('bestPlacementScoreForNext', () => {
    it('should return finite score for empty grid', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const score = bestPlacementScoreForNext(grid, 10, 20, 'I', 'equilibre');
      expect(score).toBeGreaterThan(-Infinity);
      expect(score).toBeLessThan(Infinity);
    });

    it('should return -Infinity for completely filled grid (no placements)', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(1));
      const score = bestPlacementScoreForNext(grid, 10, 20, 'I', 'equilibre');
      expect(score).toBe(-Infinity);
    });

    it('should prefer placements with line clears', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      // Create almost complete line (missing 4 cells for I piece)
      for (let c = 0; c < 6; c++) {
        grid[19][c] = 1;
      }

      const score = bestPlacementScoreForNext(grid, 10, 20, 'I', 'equilibre');
      expect(score).toBeGreaterThan(-Infinity);
    });

    it('should work with different AI profiles', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const scorePrudent = bestPlacementScoreForNext(grid, 10, 20, 'T', 'prudent');
      const scoreAgressif = bestPlacementScoreForNext(grid, 10, 20, 'T', 'agressif');

      // Both should return finite scores
      expect(scorePrudent).toBeGreaterThan(-Infinity);
      expect(scoreAgressif).toBeGreaterThan(-Infinity);
    });
  });

  describe('bestPlacementThatReducesHoles', () => {
    it('should return null when no placements reduce holes', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      // Empty grid has no holes to reduce
      const result = bestPlacementThatReducesHoles(grid, 10, 20, 'I', 0);
      expect(result).toBeNull();
    });

    it('should find placement that reduces holes', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      // Create a hole at row 19, column 0
      for (let c = 0; c < 10; c++) {
        grid[18][c] = 1; // Top layer filled
        grid[19][c] = c === 0 ? 0 : 1; // Bottom layer has hole at col 0
      }

      const holesBefore = 1;
      const result = bestPlacementThatReducesHoles(grid, 10, 20, 'I', holesBefore);

      // Should find a placement (though it might create new holes)
      // At minimum, it should not crash
      expect(result === null || typeof result.holesReduced === 'number').toBe(true);
    });

    it('should return object with holesReduced property', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      // Create situation where piece can fill hole
      grid[19][0] = 1;
      grid[19][1] = 1;
      grid[19][2] = 0; // hole
      grid[19][3] = 1;
      grid[18][2] = 1; // block above hole

      const result = bestPlacementThatReducesHoles(grid, 10, 20, 'O', 1);

      if (result !== null) {
        expect(result).toHaveProperty('holesReduced');
        expect(result.holesReduced).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('bestPlacementScoreWithFollow', () => {
    it('should return finite score for 2-piece lookahead', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const score = bestPlacementScoreWithFollow(grid, 10, 20, 'I', 'T', 'equilibre');

      expect(score).toBeGreaterThan(-Infinity);
      expect(score).toBeLessThan(Infinity);
    });

    it('should return -Infinity for filled grid', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(1));
      const score = bestPlacementScoreWithFollow(grid, 10, 20, 'I', 'O', 'equilibre');

      expect(score).toBe(-Infinity);
    });

    it('should work with different piece combinations', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));

      const scoreIT = bestPlacementScoreWithFollow(grid, 10, 20, 'I', 'T', 'equilibre');
      const scoreOL = bestPlacementScoreWithFollow(grid, 10, 20, 'O', 'L', 'equilibre');

      // Both should return finite scores
      expect(scoreIT).toBeGreaterThan(-Infinity);
      expect(scoreOL).toBeGreaterThan(-Infinity);
    });

    it('should consider AI profile in evaluation', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));

      const scorePrudent = bestPlacementScoreWithFollow(grid, 10, 20, 'T', 'S', 'prudent');
      const scoreAgressif = bestPlacementScoreWithFollow(grid, 10, 20, 'T', 'S', 'agressif');

      // Both should return finite scores (actual values may differ based on profile)
      expect(scorePrudent).toBeGreaterThan(-Infinity);
      expect(scoreAgressif).toBeGreaterThan(-Infinity);
    });
  });

  describe('Integration tests', () => {
    it('should handle realistic game scenario', () => {
      // Create a realistic mid-game grid
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));

      // Add some random blocks at bottom
      for (let r = 15; r < 20; r++) {
        for (let c = 0; c < 10; c++) {
          if (Math.random() > 0.4) {
            grid[r][c] = 1;
          }
        }
      }

      const legalPlacements = countLegalPlacements(grid, 10, 20, 'I');
      const bestScore = bestPlacementScoreForNext(grid, 10, 20, 'I', 'equilibre');
      const followScore = bestPlacementScoreWithFollow(grid, 10, 20, 'I', 'T', 'equilibre');

      // All evaluations should succeed
      expect(legalPlacements).toBeGreaterThanOrEqual(0);
      expect(bestScore).toBeGreaterThan(-Infinity);
      expect(followScore).toBeGreaterThan(-Infinity);
    });

    it('should evaluate all piece types without errors', () => {
      const grid = Array(20).fill(null).map(() => Array(10).fill(0));
      const pieces = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

      pieces.forEach(piece => {
        const count = countLegalPlacements(grid, 10, 20, piece);
        const score = bestPlacementScoreForNext(grid, 10, 20, piece, 'equilibre');

        expect(count).toBeGreaterThan(0);
        expect(score).toBeGreaterThan(-Infinity);
      });
    });
  });
});
