/**
 * AI Configuration Constants
 * Centralized magic numbers for AI behavior
 */

/**
 * Copilot (Auto-pilot) Configuration
 * Controls automatic piece placement timing
 */
export const COPILOT_CONFIG = {
  /**
   * Cooldown between copilot actions (rotation/movement)
   * Simulates human-like DAS/ARR timing
   * @type {number} milliseconds
   */
  ACTION_COOLDOWN_MS: 35,

  /**
   * Cooldown between soft drops
   * Prevents too-fast descent
   * @type {number} milliseconds
   */
  DROP_COOLDOWN_MS: 28,
};

/**
 * Hint Computation Configuration
 */
export const HINT_CONFIG = {
  /**
   * Throttle limit for hint recomputation
   * Maximum recomputes per second
   * @type {number} per second
   */
  MAX_RECOMPUTES_PER_SECOND: 10,

  /**
   * Throttle cooldown period
   * Derived from MAX_RECOMPUTES_PER_SECOND
   * @type {number} seconds
   */
  get THROTTLE_COOLDOWN_SEC() {
    return 1.0 / this.MAX_RECOMPUTES_PER_SECOND;
  },

  /**
   * Maximum lookahead depth (pieces)
   * @type {number} pieces
   */
  MAX_LOOKAHEAD_DEPTH: 10,

  /**
   * Minimum lookahead depth (pieces)
   * @type {number} pieces
   */
  MIN_LOOKAHEAD_DEPTH: 2,
};

/**
 * HOLD Blink Animation Configuration
 */
export const HOLD_BLINK_CONFIG = {
  /**
   * Blink cycle period
   * @type {number} seconds
   */
  PERIOD_SEC: 1.2,
};

/**
 * AI Profile Names
 * Available AI difficulty/style profiles
 */
export const AI_PROFILE_NAMES = [
  'prudent',
  'conservateur',
  'equilibre',
  'agressif',
];

/**
 * Default AI Profile
 */
export const DEFAULT_AI_PROFILE = 'equilibre';
