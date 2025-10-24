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
      const mat = TETROMINOS['O'];
      const result = rotateN(mat, 0);
      expect(result).toEqual(mat);
    });

    it('should rotate matrix 90° clockwise for N=1', () => {
      const mat = TETROMINOS['I']; // [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]]
      const result = rotateN(mat, 1);
      // After 90° CW rotation, horizontal I becomes vertical
      // Should have 1s in a column instead of a row
      expect(result[0][2]).toBe(1); // vertical I piece
      expect(result[1][2]).toBe(1);
      expect(result[2][2]).toBe(1);
      expect(result[3][2]).toBe(1);
    });

    it('should rotate matrix 180° for N=2', () => {
      const mat = TETROMINOS['T'];
      const result = rotateN(mat, 2);
      // After 180° rotation, T should be upside down
      expect(result.length).toBe(4);
      expect(result[0].length).toBe(4);
    });

    it('should rotate matrix 270° for N=3', () => {
      const mat = TETROMINOS['L'];
      const result = rotateN(mat, 3);
      // After 270° CW rotation (same as 90° CCW)
      expect(result.length).toBe(4);
      expect(result[0].length).toBe(4);
    });
  });

  describe('collideGrid', () => {
    it('should return false for valid placement', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      const mat = TETROMINOS['I']; // 4x4 matrix
      expect(collideGrid(grid, 10, 4, 3, 0, mat)).toBe(false);
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
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      const mat = TETROMINOS['O']; // 4x4 matrix with O piece
      placeOn(grid, 10, 4, 3, 0, mat, 'O');

      // Check piece was placed (O piece has 1s at [0][1], [0][2], [1][1], [1][2])
      expect(grid[0][4]).toBe(1); // row 0, col 3+1
      expect(grid[0][5]).toBe(1); // row 0, col 3+2
      expect(grid[1][4]).toBe(1); // row 1, col 3+1
      expect(grid[1][5]).toBe(1); // row 1, col 3+2
    });

    it('should not place cells with 0 in matrix', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      const mat = TETROMINOS['T']; // T piece has some 0s
      placeOn(grid, 10, 4, 0, 0, mat, 'T');

      // T piece: [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]]
      // Only cells with 1 should be placed
      expect(grid[0][1]).toBe(1); // T top center
      expect(grid[1][0]).toBe(1); // T left
      expect(grid[1][1]).toBe(1); // T center
      expect(grid[1][2]).toBe(1); // T right
      expect(grid[0][0]).toBe(0); // matrix had 0 here
      expect(grid[0][2]).toBe(0); // matrix had 0 here
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
    it('should return true for identical 4x4 matrices', () => {
      const mat1 = TETROMINOS['O'];
      const mat2 = TETROMINOS['O'];
      expect(matsEqual(mat1, mat2)).toBe(true);
    });

    it('should return false for different 4x4 matrices', () => {
      const mat1 = TETROMINOS['O'];
      const mat2 = TETROMINOS['I'];
      expect(matsEqual(mat1, mat2)).toBe(false);
    });

    it('should compare using boolean conversion (truthy vs falsy)', () => {
      const mat1 = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      const mat2 = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      // Both have truthy value at [0][0], so should be equal
      expect(matsEqual(mat1, mat2)).toBe(true);
    });

    it('should return false for differently positioned blocks', () => {
      const mat1 = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      const mat2 = [[0, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      expect(matsEqual(mat1, mat2)).toBe(false);
    });
  });
});
