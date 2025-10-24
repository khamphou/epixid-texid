import { describe, it, expect } from 'vitest';
import { AI_PROFILES, getAIWeights } from '../profiles.js';

describe('AI Profiles - Weight Configuration', () => {
  describe('AI_PROFILES', () => {
    it('should have all 4 profiles defined', () => {
      expect(AI_PROFILES.prudent).toBeDefined();
      expect(AI_PROFILES.conservateur).toBeDefined();
      expect(AI_PROFILES.equilibre).toBeDefined();
      expect(AI_PROFILES.agressif).toBeDefined();
    });

    it('should have required weight properties for each profile', () => {
      const requiredProps = [
        'holes', 'bump', 'height', 'newHole', 'edgeHole',
        'deepWell', 'overhang', 'mobility', 'look1', 'look2',
        'clearUnit', 'clear3Bonus', 'clear2DangerBoost', 'heightDropReward'
      ];

      Object.values(AI_PROFILES).forEach(profile => {
        requiredProps.forEach(prop => {
          expect(profile[prop]).toBeDefined();
          expect(typeof profile[prop]).toBe('number');
        });
      });
    });

    it('should have prudent profile prioritize hole avoidance', () => {
      const prudent = AI_PROFILES.prudent;
      // Prudent should have high hole penalty
      expect(prudent.holes).toBeGreaterThan(8);
      expect(prudent.newHole).toBeGreaterThan(10);
    });

    it('should have agressif profile prioritize line clears', () => {
      const agressif = AI_PROFILES.agressif;
      // Aggressive should have high clear bonuses
      expect(agressif.clear3Bonus).toBeGreaterThan(40);
    });

    it('should have equilibre as balanced profile', () => {
      const equilibre = AI_PROFILES.equilibre;
      // Balanced should have moderate values
      expect(equilibre.holes).toBeGreaterThan(AI_PROFILES.agressif.holes);
      expect(equilibre.holes).toBeLessThan(AI_PROFILES.prudent.holes);
    });
  });

  describe('getAIWeights', () => {
    it('should return correct weights for valid profile names', () => {
      expect(getAIWeights('prudent')).toEqual(AI_PROFILES.prudent);
      expect(getAIWeights('conservateur')).toEqual(AI_PROFILES.conservateur);
      expect(getAIWeights('equilibre')).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights('agressif')).toEqual(AI_PROFILES.agressif);
    });

    it('should be case-sensitive (lowercase only)', () => {
      // Uppercase profiles should fall back to equilibre
      expect(getAIWeights('PRUDENT')).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights('Prudent')).toEqual(AI_PROFILES.equilibre);
    });

    it('should return equilibre for invalid profile names', () => {
      expect(getAIWeights('invalid')).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights('')).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights(null)).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights(undefined)).toEqual(AI_PROFILES.equilibre);
    });

    it('should return equilibre for non-string inputs', () => {
      expect(getAIWeights(123)).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights({})).toEqual(AI_PROFILES.equilibre);
      expect(getAIWeights([])).toEqual(AI_PROFILES.equilibre);
    });
  });

  describe('Weight value ranges', () => {
    it('should have positive penalty weights', () => {
      Object.values(AI_PROFILES).forEach(profile => {
        expect(profile.holes).toBeGreaterThan(0);
        expect(profile.bump).toBeGreaterThan(0);
        expect(profile.height).toBeGreaterThan(0);
        expect(profile.newHole).toBeGreaterThan(0);
      });
    });

    it('should have positive bonus weights', () => {
      Object.values(AI_PROFILES).forEach(profile => {
        expect(profile.clearUnit).toBeGreaterThan(0);
        expect(profile.clear3Bonus).toBeGreaterThan(0);
        expect(profile.heightDropReward).toBeGreaterThan(0);
      });
    });

    it('should have lookahead weights less than 1', () => {
      Object.values(AI_PROFILES).forEach(profile => {
        expect(profile.look1).toBeLessThan(1);
        expect(profile.look1).toBeGreaterThan(0);
        expect(profile.look2).toBeLessThan(profile.look1); // look2 < look1
      });
    });
  });
});
