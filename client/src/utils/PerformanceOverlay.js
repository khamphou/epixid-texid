/**
 * Performance overlay for real-time FPS and metrics display.
 *
 * Shows:
 * - Current FPS and average FPS
 * - Frame drops count and percentage
 * - Memory usage (if available)
 * - Recent errors count
 *
 * Usage:
 * ```javascript
 * const overlay = new PerformanceOverlay(core.perfMonitor, core.errorTracker);
 * overlay.show(); // Display overlay
 * overlay.hide(); // Hide overlay
 *
 * // In game loop:
 * overlay.update();
 * ```
 *
 * Keyboard shortcut: Press ` (backtick) to toggle overlay
 *
 * @property {boolean} isVisible - Whether overlay is currently shown
 * @property {HTMLElement} element - Overlay DOM element
 */
export class PerformanceOverlay {
  /**
   * Creates a new performance overlay.
   *
   * @param {PerformanceMonitor} perfMonitor - Performance monitor instance
   * @param {ErrorTracker} [errorTracker] - Optional error tracker instance
   * @param {Object} [options] - Configuration options
   * @param {string} [options.position='top-left'] - Position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
   * @param {boolean} [options.autoShow=false] - Automatically show overlay on creation
   * @param {string} [options.toggleKey='`'] - Keyboard key to toggle overlay
   */
  constructor(perfMonitor, errorTracker = null, options = {}) {
    this.perfMonitor = perfMonitor;
    this.errorTracker = errorTracker;
    this.position = options.position || 'top-left';
    this.toggleKey = options.toggleKey || '`';

    this.isVisible = false;
    this.element = null;

    this._createOverlay();
    this._attachKeyboardShortcut();

    if (options.autoShow) {
      this.show();
    }
  }

  /**
   * Create overlay DOM element.
   *
   * @private
   * @returns {void}
   */
  _createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'performance-overlay';
    overlay.style.cssText = this._getPositionCSS();

    overlay.innerHTML = `
      <div class="perf-overlay-header">⚡ Performance</div>
      <div class="perf-overlay-content">
        <div class="perf-stat">
          <span class="perf-label">FPS:</span>
          <span class="perf-value" id="perf-fps">60.0</span>
        </div>
        <div class="perf-stat">
          <span class="perf-label">Avg:</span>
          <span class="perf-value" id="perf-avg">60.0</span>
        </div>
        <div class="perf-stat">
          <span class="perf-label">Drops:</span>
          <span class="perf-value" id="perf-drops">0 (0%)</span>
        </div>
        <div class="perf-stat">
          <span class="perf-label">Frames:</span>
          <span class="perf-value" id="perf-frames">0</span>
        </div>
        <div class="perf-stat" id="perf-memory-stat" style="display:none">
          <span class="perf-label">Memory:</span>
          <span class="perf-value" id="perf-memory">0 MB</span>
        </div>
        <div class="perf-stat" id="perf-errors-stat" style="display:none">
          <span class="perf-label">Errors:</span>
          <span class="perf-value" id="perf-errors">0</span>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = this._getCSS();
    document.head.appendChild(style);

    this.element = overlay;
    document.body.appendChild(overlay);

    // Initially hidden
    overlay.style.display = 'none';
  }

  /**
   * Get position-specific CSS.
   *
   * @private
   * @returns {string} CSS string
   */
  _getPositionCSS() {
    const baseCSS = `
      position: fixed;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.85);
      color: #00ff00;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 4px;
      border: 1px solid rgba(0, 255, 0, 0.3);
      min-width: 180px;
      backdrop-filter: blur(4px);
    `;

    const positions = {
      'top-left': 'top: 10px; left: 10px;',
      'top-right': 'top: 10px; right: 10px;',
      'bottom-left': 'bottom: 10px; left: 10px;',
      'bottom-right': 'bottom: 10px; right: 10px;'
    };

    return baseCSS + positions[this.position];
  }

  /**
   * Get overlay CSS styles.
   *
   * @private
   * @returns {string} CSS string
   */
  _getCSS() {
    return `
      .performance-overlay {
        user-select: none;
        pointer-events: none;
      }
      .perf-overlay-header {
        font-weight: bold;
        margin-bottom: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(0, 255, 0, 0.3);
        color: #00ffff;
      }
      .perf-overlay-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .perf-stat {
        display: flex;
        justify-content: space-between;
        gap: 10px;
      }
      .perf-label {
        color: #888;
      }
      .perf-value {
        font-weight: bold;
        text-align: right;
      }
      .perf-value.warning {
        color: #ffaa00;
      }
      .perf-value.error {
        color: #ff0000;
      }
    `;
  }

  /**
   * Attach keyboard shortcut listener.
   *
   * @private
   * @returns {void}
   */
  _attachKeyboardShortcut() {
    this._keyHandler = (e) => {
      if (e.key === this.toggleKey) {
        this.toggle();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  /**
   * Update overlay with current metrics.
   *
   * Call this every frame or every few frames for real-time updates.
   *
   * @returns {void}
   */
  update() {
    if (!this.isVisible) return;

    const stats = this.perfMonitor.getStats();

    // Update FPS
    const fpsEl = document.getElementById('perf-fps');
    if (fpsEl) {
      fpsEl.textContent = stats.currentFPS.toFixed(1);
      fpsEl.className = 'perf-value' + (stats.currentFPS < 30 ? ' error' : stats.currentFPS < 50 ? ' warning' : '');
    }

    // Update average FPS
    const avgEl = document.getElementById('perf-avg');
    if (avgEl) {
      avgEl.textContent = stats.averageFPS.toFixed(1);
      avgEl.className = 'perf-value' + (stats.averageFPS < 54 ? ' warning' : '');
    }

    // Update drops
    const dropsEl = document.getElementById('perf-drops');
    if (dropsEl) {
      dropsEl.textContent = `${stats.frameDrops} (${stats.dropRate.toFixed(1)}%)`;
      dropsEl.className = 'perf-value' + (stats.dropRate > 5 ? ' warning' : '');
    }

    // Update frame count
    const framesEl = document.getElementById('perf-frames');
    if (framesEl) {
      framesEl.textContent = stats.totalFrames.toString();
    }

    // Update memory usage if available
    if (performance.memory) {
      const memoryStat = document.getElementById('perf-memory-stat');
      const memoryEl = document.getElementById('perf-memory');
      if (memoryStat && memoryEl) {
        memoryStat.style.display = 'flex';
        const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        const limitMB = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0);
        memoryEl.textContent = `${usedMB} / ${limitMB} MB`;
      }
    }

    // Update error count if tracker available
    if (this.errorTracker) {
      const errorsStat = document.getElementById('perf-errors-stat');
      const errorsEl = document.getElementById('perf-errors');
      if (errorsStat && errorsEl) {
        errorsStat.style.display = 'flex';
        const errorStats = this.errorTracker.getStats();
        errorsEl.textContent = `${errorStats.errors} / ${errorStats.total}`;
        errorsEl.className = 'perf-value' + (errorStats.errors > 0 ? ' warning' : '');
      }
    }
  }

  /**
   * Show the overlay.
   *
   * @returns {void}
   */
  show() {
    if (this.element) {
      this.element.style.display = 'block';
      this.isVisible = true;
    }
  }

  /**
   * Hide the overlay.
   *
   * @returns {void}
   */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Toggle overlay visibility.
   *
   * @returns {void}
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Remove overlay and cleanup.
   *
   * @returns {void}
   */
  dispose() {
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
    }
    if (this.element) {
      this.element.remove();
    }
  }
}
