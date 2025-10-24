/**
 * AI Engine - Main exports
 * Centralized exports for AI functionality
 */

// Simulation
export {
  rotateN,
  rotateCW,
  matsEqual,
  detectRotIndex,
  collideGrid,
  cloneSim,
  placeOn,
  simulateClear,
} from './simulation.js';

// Grid Analysis Helpers
export {
  stackHeight,
  countHoles,
  countEdgeHoles,
  columnHeights,
  bumpiness,
  columnDepthAt,
  deepWells,
  overhangs,
} from './helpers.js';

// Profiles & Weights
export {
  AI_PROFILES,
  getAIWeights,
  PROFILE_NAMES,
} from './profiles.js';

// Evaluators
export {
  countLegalPlacements,
  bestPlacementScoreForNext,
  bestPlacementThatReducesHoles,
  bestPlacementScoreWithFollow,
} from './evaluator.js';
