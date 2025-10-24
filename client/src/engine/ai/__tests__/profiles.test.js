import { describe, it, expect } from 'vitest';
import { AI_WEIGHTS, getAIWeights } from '../profiles.js';

describe('AI Profiles - Weight Configuration', () => {
  describe('AI_WEIGHTS', () => {
    it('should have all 4 profiles defined', () => {
      expect(AI_WEIGHTS.PRUDENT).toBeDefined();
      expect(AI_WEIGHTS.CONSERVATEUR).toBeDefined();
      expect(AI_WEIGHTS.EQUILIBRE).toBeDefined();
      expect(AI_WEIGHTS.AGRESSIF).toBeDefined();
    });

    it('should have required weight properties for each profile', () => {
      const requiredProps = [
        'holes', 'bump', 'height', 'newHole', 'edgeHole',
        'deepWell', 'overhang', 'mobility', 'look1', 'look2',
        'clearUnit', 'clear3Bonus', 'clear2DangerBoost', 'heightDropReward'
      ];

      Object.values(AI_WEIGHTS).forEach(profile => {
        requiredProps.forEach(prop => {
          expect(profile[prop]).toBeDefined();
          expect(typeof profile[prop]).toBe('number');
        });
      });
    });

    it('should have PRUDENT profile prioritize hole avoidance', () => {
      const prudent = AI_WEIGHTS.PRUDENT;
      // Prudent should have high hole penalty
      expect(prudent.holes).toBeGreaterThan(8);
      expect(prudent.newHole).toBeGreaterThan(25);
    });

    it('should have AGRESSIF profile prioritize line clears', () => {
      const agressif = AI_WEIGHTS.AGRESSIF;
      // Aggressive should have high clear bonuses
      expect(agressif.clear3Bonus).toBeGreaterThan(40);
    });

    it('should have EQUILIBRE as balanced profile', () => {
      const equilibre = AI_WEIGHTS.EQUILIBRE;
      // Balanced should have moderate values
      expect(equilibre.holes).toBeGreaterThan(AI_WEIGHTS.AGRESSIF.holes);
      expect(equilibre.holes).toBeLessThan(AI_WEIGHTS.PRUDENT.holes);
    });
  });

  describe('getAIWeights', () => {
    it('should return correct weights for valid profile names', () => {
      expect(getAIWeights('prudent')).toEqual(AI_WEIGHTS.PRUDENT);
      expect(getAIWeights('conservateur')).toEqual(AI_WEIGHTS.CONSERVATEUR);
      expect(getAIWeights('equilibre')).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights('agressif')).toEqual(AI_WEIGHTS.AGRESSIF);
    });

    it('should be case-insensitive', () => {
      expect(getAIWeights('PRUDENT')).toEqual(AI_WEIGHTS.PRUDENT);
      expect(getAIWeights('Prudent')).toEqual(AI_WEIGHTS.PRUDENT);
      expect(getAIWeights('pRuDeNt')).toEqual(AI_WEIGHTS.PRUDENT);
    });

    it('should return EQUILIBRE for invalid profile names', () => {
      expect(getAIWeights('invalid')).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights('')).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights(null)).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights(undefined)).toEqual(AI_WEIGHTS.EQUILIBRE);
    });

    it('should return EQUILIBRE for non-string inputs', () => {
      expect(getAIWeights(123)).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights({})).toEqual(AI_WEIGHTS.EQUILIBRE);
      expect(getAIWeights([])).toEqual(AI_WEIGHTS.EQUILIBRE);
    });
  });

  describe('Weight value ranges', () => {
    it('should have positive penalty weights', () => {
      Object.values(AI_WEIGHTS).forEach(profile => {
        expect(profile.holes).toBeGreaterThan(0);
        expect(profile.bump).toBeGreaterThan(0);
        expect(profile.height).toBeGreaterThan(0);
        expect(profile.newHole).toBeGreaterThan(0);
      });
    });

    it('should have positive bonus weights', () => {
      Object.values(AI_WEIGHTS).forEach(profile => {
        expect(profile.clearUnit).toBeGreaterThan(0);
        expect(profile.clear3Bonus).toBeGreaterThan(0);
        expect(profile.heightDropReward).toBeGreaterThan(0);
      });
    });

    it('should have lookahead weights less than 1', () => {
      Object.values(AI_WEIGHTS).forEach(profile => {
        expect(profile.look1).toBeLessThan(1);
        expect(profile.look1).toBeGreaterThan(0);
        expect(profile.look2).toBeLessThan(profile.look1); // look2 < look1
      });
    });
  });
});
