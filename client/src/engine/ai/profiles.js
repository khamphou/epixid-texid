/**
 * AI Profiles Configuration
 * Weight sets for different AI play styles
 */

/**
 * AI weight configuration object
 * @typedef {Object} AIWeights
 * @property {number} holes - Weight for hole penalty
 * @property {number} bump - Weight for bumpiness penalty
 * @property {number} height - Weight for stack height penalty
 * @property {number} look1 - Weight for 1-piece lookahead bonus
 * @property {number} look2 - Weight for 2-piece lookahead bonus
 * @property {number} mobility - Weight for placement mobility bonus
 * @property {number} deepWell - Weight for deep well penalty
 * @property {number} overhang - Weight for overhang penalty
 * @property {number} clear3Bonus - Bonus for clearing 3+ lines
 * @property {number} clearUnit - Bonus per line cleared
 * @property {number} newHole - Penalty for creating new holes
 * @property {number} heightDropReward - Reward for lowering stack
 * @property {number} clear2DangerBoost - Multiplier for 2-line clears when in danger
 * @property {number} edgeHole - Penalty for edge holes
 */

/**
 * AI Profile definitions
 */
export const AI_PROFILES = {
  /**
   * Prudent: Avoid holes and overhangs at all costs
   * Best for beginners or defensive play
   */
  prudent: {
    holes: 9.2,
    bump: 0.7,
    height: 0.28,
    look1: 0.45,
    look2: 0.22,
    mobility: 0.35,
    deepWell: 1.6,
    overhang: 2.6,
    clear3Bonus: 65,
    clearUnit: 2,
    newHole: 12.0,
    heightDropReward: 3.2,
    clear2DangerBoost: 1.5,
    edgeHole: 1.2,
  },

  /**
   * Conservateur (Conservative): Safe stacking
   * Balanced safety with moderate clearing
   */
  conservateur: {
    holes: 8.5,
    bump: 0.65,
    height: 0.26,
    look1: 0.5,
    look2: 0.25,
    mobility: 0.35,
    deepWell: 1.4,
    overhang: 2.2,
    clear3Bonus: 70,
    clearUnit: 3,
    newHole: 10.0,
    heightDropReward: 3.5,
    clear2DangerBoost: 1.6,
    edgeHole: 1.0,
  },

  /**
   * Équilibré (Balanced): Default profile
   * Good mix of safety and aggression
   */
  equilibre: {
    holes: 7.5,
    bump: 0.6,
    height: 0.24,
    look1: 0.6,
    look2: 0.32,
    mobility: 0.30,
    deepWell: 1.2,
    overhang: 1.9,
    clear3Bonus: 80,
    clearUnit: 5,
    newHole: 8.5,
    heightDropReward: 3.0,
    clear2DangerBoost: 1.4,
    edgeHole: 0.9,
  },

  /**
   * Agressif (Aggressive): Favor 3+ line clears and Tetris
   * Risky but high-scoring play
   */
  agressif: {
    holes: 6.2,
    bump: 0.5,
    height: 0.18,
    look1: 0.7,
    look2: 0.45,
    mobility: 0.25,
    deepWell: 1.0,
    overhang: 1.6,
    clear3Bonus: 95,
    clearUnit: 7,
    newHole: 7.2,
    heightDropReward: 2.2,
    clear2DangerBoost: 1.3,
    edgeHole: 0.8,
  },
};

/**
 * Get AI weights for a profile
 * @param {string} profile - Profile name: 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
 * @returns {AIWeights} Weight configuration
 */
export function getAIWeights(profile) {
  const weights = AI_PROFILES[profile];
  if (weights) return weights;

  // Default to equilibre if profile not found
  console.warn(`Unknown AI profile "${profile}", using "equilibre"`);
  return AI_PROFILES.equilibre;
}

/**
 * List of available profile names
 */
export const PROFILE_NAMES = Object.keys(AI_PROFILES);
