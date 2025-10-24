/**
 * Performance monitoring for game loop metrics.
 *
 * Tracks:
 * - **FPS** (Frames Per Second): Real-time and average over window
 * - **Frame Drops**: Frames that took > 20ms (below 50 FPS)
 * - **Frame Time**: Delta time for each frame
 * - **Performance Budget**: Warns when consistently below target FPS
 *
 * Usage:
 * ```javascript
 * const monitor = new PerformanceMonitor({ targetFPS: 60, sampleWindow: 60 });
 *
 * function gameLoop(timestamp) {
 *   monitor.startFrame(timestamp);
 *   // ... game logic ...
 *   monitor.endFrame();
 *
 *   if (monitor.shouldLog()) {
 *     console.log(monitor.getStats());
 *   }
 *   requestAnimationFrame(gameLoop);
 * }
 * ```
 *
 * @property {number} targetFPS - Target frames per second (default: 60)
 * @property {number} currentFPS - Current FPS based on last frame
 * @property {number} averageFPS - Rolling average FPS over sample window
 * @property {number} frameDrops - Total frames that exceeded budget
 * @property {number} totalFrames - Total frames processed since creation
 */
export class PerformanceMonitor {
  /**
   * Creates a new performance monitor.
   *
   * @param {Object} [options] - Configuration options
   * @param {number} [options.targetFPS=60] - Target frames per second
   * @param {number} [options.sampleWindow=60] - Number of frames to average (default: 1 second at 60 FPS)
   * @param {number} [options.dropThreshold=20] - Frame time in ms to consider a drop (default: 20ms = 50 FPS)
   * @param {number} [options.logInterval=300] - Log stats every N frames (default: 5 seconds at 60 FPS)
   * @param {boolean} [options.autoLog=false] - Automatically log performance warnings
   */
  constructor(options = {}) {
    this.targetFPS = options.targetFPS || 60;
    this.sampleWindow = options.sampleWindow || 60; // 1 second of frames at 60 FPS
    this.dropThreshold = options.dropThreshold || 20; // > 20ms = drop
    this.logInterval = options.logInterval || 300; // Log every 5 seconds
    this.autoLog = options.autoLog || false;

    // Frame timing
    this.lastTime = null;
    this.frameStart = null;
    this.currentFPS = this.targetFPS;
    this.averageFPS = this.targetFPS;

    // Statistics
    this.frameDrops = 0;
    this.totalFrames = 0;
    this.framesSinceLog = 0;

    // Rolling window for average FPS
    this.frameTimes = [];

    // Performance warnings
    this.consecutiveSlowFrames = 0;
    this.performanceWarnings = 0;
  }

  /**
   * Mark the start of a new frame.
   *
   * Call this at the beginning of your game loop, before any rendering or logic.
   *
   * @param {number} timestamp - High-resolution timestamp from requestAnimationFrame
   * @returns {void}
   */
  startFrame(timestamp) {
    this.frameStart = timestamp;

    if (this.lastTime !== null) {
      const delta = timestamp - this.lastTime;

      // Update current FPS
      if (delta > 0) {
        this.currentFPS = 1000 / delta;
      }

      // Track frame time for averaging
      this.frameTimes.push(delta);
      if (this.frameTimes.length > this.sampleWindow) {
        this.frameTimes.shift();
      }

      // Calculate average FPS
      const avgDelta = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.averageFPS = avgDelta > 0 ? 1000 / avgDelta : this.targetFPS;

      // Detect frame drops
      if (delta > this.dropThreshold) {
        this.frameDrops++;
        this.consecutiveSlowFrames++;

        // Warn if sustained poor performance
        if (this.consecutiveSlowFrames > 10) {
          this.performanceWarnings++;
          if (this.autoLog) {
            console.warn('[PerformanceMonitor] Sustained poor performance detected', {
              fps: this.currentFPS.toFixed(1),
              averageFPS: this.averageFPS.toFixed(1),
              consecutiveSlowFrames: this.consecutiveSlowFrames,
              frameDrops: this.frameDrops
            });
          }
          this.consecutiveSlowFrames = 0; // Reset to avoid spam
        }
      } else {
        this.consecutiveSlowFrames = 0;
      }
    }

    this.lastTime = timestamp;
    this.totalFrames++;
    this.framesSinceLog++;
  }

  /**
   * Mark the end of a frame (optional).
   *
   * Use this if you want to measure frame processing time separately from inter-frame delta.
   *
   * @returns {number} Frame processing time in milliseconds
   */
  endFrame() {
    if (this.frameStart === null) {
      return 0;
    }

    const now = performance.now();
    const frameTime = now - this.frameStart;
    this.frameStart = null;

    return frameTime;
  }

  /**
   * Check if it's time to log performance stats.
   *
   * @returns {boolean} True if logInterval frames have passed
   */
  shouldLog() {
    if (this.framesSinceLog >= this.logInterval) {
      this.framesSinceLog = 0;
      return true;
    }
    return false;
  }

  /**
   * Get current performance statistics.
   *
   * @returns {Object} Performance stats
   * @returns {number} stats.currentFPS - Current FPS based on last frame
   * @returns {number} stats.averageFPS - Rolling average FPS
   * @returns {number} stats.frameDrops - Total frame drops
   * @returns {number} stats.totalFrames - Total frames processed
   * @returns {number} stats.dropRate - Percentage of dropped frames
   * @returns {number} stats.performanceWarnings - Number of sustained performance issues
   * @returns {boolean} stats.isHealthy - True if average FPS >= 90% of target
   */
  getStats() {
    const dropRate = this.totalFrames > 0 ? (this.frameDrops / this.totalFrames) * 100 : 0;
    const isHealthy = this.averageFPS >= this.targetFPS * 0.9;

    return {
      currentFPS: Math.round(this.currentFPS * 10) / 10,
      averageFPS: Math.round(this.averageFPS * 10) / 10,
      frameDrops: this.frameDrops,
      totalFrames: this.totalFrames,
      dropRate: Math.round(dropRate * 100) / 100,
      performanceWarnings: this.performanceWarnings,
      isHealthy
    };
  }

  /**
   * Reset all statistics to initial state.
   *
   * Useful when transitioning between game modes or screens.
   *
   * @returns {void}
   */
  reset() {
    this.lastTime = null;
    this.frameStart = null;
    this.currentFPS = this.targetFPS;
    this.averageFPS = this.targetFPS;
    this.frameDrops = 0;
    this.totalFrames = 0;
    this.framesSinceLog = 0;
    this.frameTimes = [];
    this.consecutiveSlowFrames = 0;
    this.performanceWarnings = 0;
  }

  /**
   * Log current performance stats to console.
   *
   * @param {string} [prefix=''] - Optional prefix for log message
   * @returns {void}
   */
  log(prefix = '') {
    const stats = this.getStats();
    const status = stats.isHealthy ? '✓' : '⚠';
    console.log(`${status} ${prefix}Performance:`, stats);
  }

  /**
   * Get human-readable performance summary.
   *
   * @returns {string} Performance summary string
   */
  toString() {
    const stats = this.getStats();
    return `FPS: ${stats.currentFPS} (avg: ${stats.averageFPS}) | Drops: ${stats.frameDrops} (${stats.dropRate}%) | Health: ${stats.isHealthy ? 'Good' : 'Poor'}`;
  }
}
