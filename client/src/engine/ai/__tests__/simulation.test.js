import { describe, it, expect } from 'vitest';
import { TETROMINOS } from '../../piece.js';
import {
  rotateN,
  collideGrid,
  cloneSim,
  placeOn,
  simulateClear,
  detectRotIndex,
  matsEqual
} from '../simulation.js';

describe('AI Simulation - Grid Operations', () => {
  describe('rotateN', () => {
    it('should return same matrix for N=0', () => {
      const mat = [[1, 1], [1, 1]]; // O piece
      const result = rotateN(mat, 0);
      expect(result).toEqual(mat);
    });

    it('should rotate matrix 90° clockwise for N=1', () => {
      const mat = [
        [1, 0],
        [1, 0],
        [1, 1]
      ]; // L piece lying down
      const result = rotateN(mat, 1);
      // After 90° CW rotation
      expect(result.length).toBe(2); // width becomes height
      expect(result[0].length).toBe(3); // height becomes width
    });

    it('should rotate matrix 180° for N=2', () => {
      const mat = [[1, 1, 1, 1]]; // I piece horizontal
      const result = rotateN(mat, 2);
      // After 180° rotation, horizontal I should still be horizontal
      expect(result).toEqual([[1, 1, 1, 1]]);
    });

    it('should rotate matrix 270° for N=3', () => {
      const mat = [
        [0, 1, 0],
        [1, 1, 1]
      ]; // T piece
      const result = rotateN(mat, 3);
      // After 270° CW rotation (same as 90° CCW)
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('collideGrid', () => {
    it('should return false for valid placement', () => {
      const grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ];
      const mat = [[1, 1, 1, 1]]; // I piece horizontal
      expect(collideGrid(grid, 4, 4, 0, 0, mat)).toBe(false);
    });

    it('should detect collision with existing blocks', () => {
      const grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 1, 1, 0], // existing blocks
        [1, 1, 1, 1]
      ];
      const mat = [[1, 1]]; // O piece part
      expect(collideGrid(grid, 4, 4, 1, 2, mat)).toBe(true);
    });

    it('should detect collision with left wall', () => {
      const grid = [[0, 0, 0, 0]];
      const mat = [[1, 1]];
      expect(collideGrid(grid, 4, 1, -1, 0, mat)).toBe(true); // x < 0
    });

    it('should detect collision with right wall', () => {
      const grid = [[0, 0, 0, 0]];
      const mat = [[1, 1]];
      expect(collideGrid(grid, 4, 1, 3, 0, mat)).toBe(true); // x + width > COLS
    });

    it('should detect collision with bottom', () => {
      const grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ];
      const mat = [[1], [1]];
      expect(collideGrid(grid, 4, 2, 0, 1, mat)).toBe(true); // y + height > ROWS
    });
  });

  describe('cloneSim', () => {
    it('should create deep copy of grid', () => {
      const original = [
        [1, 0, 1],
        [0, 1, 0]
      ];
      const clone = cloneSim(original);

      // Modify clone
      clone[0][0] = 9;

      // Original should be unchanged
      expect(original[0][0]).toBe(1);
      expect(clone[0][0]).toBe(9);
    });

    it('should handle empty grid', () => {
      const original = [[0, 0], [0, 0]];
      const clone = cloneSim(original);
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original); // different reference
    });
  });

  describe('placeOn', () => {
    it('should place piece on grid', () => {
      const grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ];
      const mat = [[1, 1]]; // 2-cell piece
      placeOn(grid, 4, 2, 1, 1, mat, 'O');

      // Check piece was placed
      expect(grid[1][1]).toBe('O');
      expect(grid[1][2]).toBe('O');
    });

    it('should not place cells outside matrix', () => {
      const grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ];
      const mat = [
        [1, 0],
        [1, 0]
      ];
      placeOn(grid, 4, 2, 0, 0, mat, 'L');

      // Only cells with 1 should be placed
      expect(grid[0][0]).toBe('L');
      expect(grid[1][0]).toBe('L');
      expect(grid[0][1]).toBe(0); // matrix had 0 here
    });
  });

  describe('simulateClear', () => {
    it('should return 0 for no complete lines', () => {
      const grid = [
        [1, 0, 1, 1],
        [1, 0, 1, 1],
        [1, 0, 1, 1]
      ];
      const cleared = simulateClear(grid, 4, 3);
      expect(cleared).toBe(0);
    });

    it('should clear single complete line', () => {
      const grid = [
        [0, 0, 0, 0],
        [1, 0, 1, 1],
        [1, 1, 1, 1]  // complete line
      ];
      const cleared = simulateClear(grid, 4, 3);
      expect(cleared).toBe(1);

      // Complete line should be cleared and moved to top as empty
      expect(grid[0]).toEqual([0, 0, 0, 0]);
      expect(grid[2]).toEqual([1, 0, 1, 1]);
    });

    it('should clear multiple complete lines', () => {
      const grid = [
        [1, 1, 1, 1],  // complete
        [1, 1, 1, 1],  // complete
        [1, 0, 1, 1]
      ];
      const cleared = simulateClear(grid, 4, 3);
      expect(cleared).toBe(2);

      // Both complete lines cleared
      expect(grid[0]).toEqual([0, 0, 0, 0]);
      expect(grid[1]).toEqual([0, 0, 0, 0]);
      expect(grid[2]).toEqual([1, 0, 1, 1]);
    });

    it('should handle Tetris (4 lines)', () => {
      const grid = [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1]
      ];
      const cleared = simulateClear(grid, 4, 4);
      expect(cleared).toBe(4);

      // All lines cleared
      expect(grid).toEqual([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]);
    });
  });

  describe('detectRotIndex', () => {
    it('should detect rotation 0 for standard I piece', () => {
      const mat = TETROMINOS['I']; // horizontal
      const rotIndex = detectRotIndex('I', mat);
      expect(rotIndex).toBe(0);
    });

    it('should detect rotation 1 for rotated I piece', () => {
      const mat = rotateN(TETROMINOS['I'], 1); // vertical
      const rotIndex = detectRotIndex('I', mat);
      expect(rotIndex).toBe(1);
    });

    it('should handle O piece (all rotations same)', () => {
      const mat = TETROMINOS['O'];
      const rotIndex = detectRotIndex('O', mat);
      // O piece is symmetric, any rotation index valid
      expect(rotIndex).toBeGreaterThanOrEqual(0);
      expect(rotIndex).toBeLessThan(4);
    });

    it('should detect rotation for T piece', () => {
      const mat = rotateN(TETROMINOS['T'], 2); // upside down T
      const rotIndex = detectRotIndex('T', mat);
      expect(rotIndex).toBe(2);
    });
  });

  describe('matsEqual', () => {
    it('should return true for identical matrices', () => {
      const mat1 = [[1, 0], [1, 1]];
      const mat2 = [[1, 0], [1, 1]];
      expect(matsEqual(mat1, mat2)).toBe(true);
    });

    it('should return false for different matrices', () => {
      const mat1 = [[1, 0], [1, 1]];
      const mat2 = [[1, 1], [1, 1]];
      expect(matsEqual(mat1, mat2)).toBe(false);
    });

    it('should return false for different sizes', () => {
      const mat1 = [[1, 1]];
      const mat2 = [[1, 1], [1, 1]];
      expect(matsEqual(mat1, mat2)).toBe(false);
    });

    it('should handle empty matrices', () => {
      const mat1 = [];
      const mat2 = [];
      expect(matsEqual(mat1, mat2)).toBe(true);
    });
  });
});
