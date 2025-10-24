import { describe, it, expect } from 'vitest';
import {
  stackHeight,
  countHoles,
  bumpiness,
  columnHeights,
  columnDepthAt,
  deepWells,
  overhangs,
  countEdgeHoles
} from '../helpers.js';

describe('AI Helpers - Grid Analysis', () => {
  describe('stackHeight', () => {
    it('should return 0 for empty grid', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      expect(stackHeight(grid, 10, 3)).toBe(0);
    });

    it('should calculate correct height for partial stack', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 0 - empty
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // row 1 - empty
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]  // row 2 - first block
      ];
      expect(stackHeight(grid, 10, 3)).toBe(1); // height = 3 - 2 = 1
    });

    it('should calculate correct height for full stack', () => {
      const grid = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // row 0 - top
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      ];
      expect(stackHeight(grid, 10, 3)).toBe(3);
    });
  });

  describe('countHoles', () => {
    it('should return 0 for empty grid', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      ];
      expect(countHoles(grid, 10, 3)).toBe(0);
    });

    it('should detect vertical holes', () => {
      const grid = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // top layer - solid
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // holes
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // bottom layer - solid
      ];
      expect(countHoles(grid, 10, 3)).toBe(10); // 10 holes in middle row
    });

    it('should not count empty cells above stack as holes', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // empty above
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // solid layer
        [1, 0, 1, 1, 1, 1, 1, 1, 1, 1]  // 1 hole at column 1
      ];
      expect(countHoles(grid, 10, 3)).toBe(1);
    });

    it('should detect multiple holes in same column', () => {
      const grid = [
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      ];
      expect(countHoles(grid, 10, 4)).toBe(3); // 3 holes in column 1
    });
  });

  describe('bumpiness', () => {
    it('should return 0 for flat surface', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      ];
      expect(bumpiness(grid, 10, 3)).toBe(0);
    });

    it('should calculate height differences', () => {
      const grid = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], // col 0: height 2
        [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]  // col 1: height 1
      ];
      // bumpiness = |2-1| = 1
      expect(bumpiness(grid, 10, 3)).toBe(1);
    });

    it('should sum all adjacent differences', () => {
      const grid = [
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0], // heights: 3,1,3,0,0,0,0,0,0,0
        [1, 0, 1, 0, 0, 0, 0, 0, 0, 0],
        [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
      ];
      // |3-1| + |1-3| + |3-0| = 2 + 2 + 3 = 7
      expect(bumpiness(grid, 10, 3)).toBe(7);
    });
  });

  describe('columnHeights', () => {
    it('should return all zeros for empty grid', () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      expect(columnHeights(grid, 5, 3)).toEqual([0, 0, 0, 0, 0]);
    });

    it('should calculate individual column heights', () => {
      const grid = [
        [1, 0, 0, 0, 1],
        [1, 0, 1, 0, 1],
        [1, 1, 1, 0, 1]
      ];
      expect(columnHeights(grid, 5, 3)).toEqual([3, 1, 2, 0, 3]);
    });
  });

  describe('columnDepthAt', () => {
    it('should return 0 for empty column', () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0]
      ];
      expect(columnDepthAt(grid, 5, 3, 2)).toBe(0);
    });

    it('should calculate depth from top block to surface', () => {
      const grid = [
        [0, 0, 0, 0, 0], // surface
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0], // top block at column 2
        [0, 0, 1, 0, 0],
        [0, 0, 1, 0, 0]
      ];
      // Depth from row 2 (first block) to row 0 (surface) = 2
      expect(columnDepthAt(grid, 5, 5, 2)).toBe(2);
    });
  });

  describe('deepWells', () => {
    it('should return 0 for flat surface', () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1]
      ];
      expect(deepWells(grid, 5, 3)).toBe(0);
    });

    it('should detect wells (columns lower than both neighbors)', () => {
      const grid = [
        [1, 0, 1, 0, 0], // col 0: h=3, col 1: h=1, col 2: h=3
        [1, 0, 1, 0, 0], // col 1 is a well (depth 2)
        [1, 1, 1, 0, 0]
      ];
      // Well at col 1: both neighbors are 2 cells higher
      // depth = min(2, 2) = 2
      expect(deepWells(grid, 5, 3)).toBeGreaterThan(0);
    });
  });

  describe('overhangs', () => {
    it('should return 0 when no overhangs', () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1]
      ];
      expect(overhangs(grid, 5, 3)).toBe(0);
    });

    it('should detect overhangs (empty cell with block above)', () => {
      const grid = [
        [0, 1, 0, 0, 0], // block above empty cell below
        [0, 0, 0, 0, 0], // empty cell (overhang)
        [1, 1, 1, 1, 1]
      ];
      expect(overhangs(grid, 5, 3)).toBe(1);
    });
  });

  describe('countEdgeHoles', () => {
    it('should return 0 for no edge holes', () => {
      const grid = [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [1, 1, 1, 1, 1]
      ];
      expect(countEdgeHoles(grid, 5, 3)).toBe(0);
    });

    it('should detect holes at left edge (column 0)', () => {
      const grid = [
        [1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1], // hole at left edge
        [1, 1, 1, 1, 1]
      ];
      expect(countEdgeHoles(grid, 5, 3)).toBe(1);
    });

    it('should detect holes at right edge (last column)', () => {
      const grid = [
        [1, 1, 1, 1, 1],
        [1, 1, 1, 1, 0], // hole at right edge
        [1, 1, 1, 1, 1]
      ];
      expect(countEdgeHoles(grid, 5, 3)).toBe(1);
    });

    it('should detect multiple edge holes', () => {
      const grid = [
        [1, 1, 1, 1, 1],
        [0, 1, 1, 1, 0], // holes at both edges
        [1, 1, 1, 1, 1]
      ];
      expect(countEdgeHoles(grid, 5, 3)).toBe(2);
    });
  });
});
