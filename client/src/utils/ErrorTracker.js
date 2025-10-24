/**
 * Error tracking and logging system.
 *
 * Captures and logs:
 * - **Uncaught Exceptions**: window.onerror
 * - **Unhandled Promise Rejections**: unhandledrejection event
 * - **Manual Error Logging**: trackError() method
 * - **Error Context**: User actions, game state, browser info
 *
 * Features:
 * - Automatic error capture with stack traces
 * - Error deduplication (same error not logged repeatedly)
 * - Severity levels (error, warning, info)
 * - Optional Sentry integration
 * - Local error history for debugging
 *
 * Usage:
 * ```javascript
 * const tracker = new ErrorTracker({
 *   dsn: 'https://...@sentry.io/...',  // Optional Sentry DSN
 *   autoCapture: true,
 *   maxErrors: 100
 * });
 *
 * // Manual error tracking
 * try {
 *   riskyOperation();
 * } catch (err) {
 *   tracker.trackError(err, { context: 'Game Loop', severity: 'error' });
 * }
 *
 * // Get error history
 * console.log(tracker.getRecentErrors(10));
 * ```
 *
 * @property {number} errorCount - Total errors tracked
 * @property {Array} errorHistory - Recent errors (limited by maxErrors)
 * @property {boolean} isEnabled - Whether tracking is enabled
 */
export class ErrorTracker {
  /**
   * Creates a new error tracker.
   *
   * @param {Object} [options] - Configuration options
   * @param {string} [options.dsn] - Sentry DSN for remote error tracking
   * @param {boolean} [options.autoCapture=true] - Automatically capture uncaught errors
   * @param {number} [options.maxErrors=100] - Maximum errors to keep in history
   * @param {boolean} [options.logToConsole=true] - Log errors to console
   * @param {string} [options.environment='production'] - Environment name (dev, staging, production)
   * @param {Object} [options.metadata={}] - Custom metadata to attach to all errors
   */
  constructor(options = {}) {
    this.dsn = options.dsn || null;
    this.autoCapture = options.autoCapture !== false;
    this.maxErrors = options.maxErrors || 100;
    this.logToConsole = options.logToConsole !== false;
    this.environment = options.environment || 'production';
    this.metadata = options.metadata || {};

    this.errorCount = 0;
    this.errorHistory = [];
    this.errorFingerprints = new Set(); // For deduplication
    this.isEnabled = true;

    // Bind event handlers
    this._handleError = this._handleError.bind(this);
    this._handleUnhandledRejection = this._handleUnhandledRejection.bind(this);

    // Install global error handlers if autoCapture is enabled
    if (this.autoCapture) {
      this._installGlobalHandlers();
    }

    // Initialize Sentry if DSN provided
    if (this.dsn) {
      this._initSentry();
    }
  }

  /**
   * Install global error handlers.
   *
   * Captures uncaught exceptions and unhandled promise rejections.
   *
   * @private
   * @returns {void}
   */
  _installGlobalHandlers() {
    // Capture uncaught exceptions
    window.addEventListener('error', this._handleError);

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', this._handleUnhandledRejection);
  }

  /**
   * Handle uncaught error event.
   *
   * @private
   * @param {ErrorEvent} event - Error event
   * @returns {void}
   */
  _handleError(event) {
    this.trackError(event.error || new Error(event.message), {
      type: 'uncaught_exception',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      severity: 'error'
    });
  }

  /**
   * Handle unhandled promise rejection.
   *
   * @private
   * @param {PromiseRejectionEvent} event - Rejection event
   * @returns {void}
   */
  _handleUnhandledRejection(event) {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    this.trackError(error, {
      type: 'unhandled_rejection',
      severity: 'error'
    });
  }

  /**
   * Initialize Sentry SDK (placeholder for future integration).
   *
   * @private
   * @returns {void}
   */
  _initSentry() {
    // Placeholder for Sentry initialization
    // In production, you would:
    // import * as Sentry from "@sentry/browser";
    // Sentry.init({ dsn: this.dsn, environment: this.environment });
    console.log('[ErrorTracker] Sentry DSN configured:', this.dsn);
  }

  /**
   * Generate fingerprint for error deduplication.
   *
   * @private
   * @param {Error} error - Error object
   * @returns {string} Error fingerprint
   */
  _generateFingerprint(error) {
    const message = error.message || 'unknown';
    const stack = error.stack || '';
    const firstLine = stack.split('\n')[1] || '';
    return `${message}:${firstLine}`;
  }

  /**
   * Track an error with optional context.
   *
   * @param {Error|string} error - Error object or error message
   * @param {Object} [context={}] - Additional context
   * @param {string} [context.type] - Error type (e.g., 'game_logic', 'network', 'rendering')
   * @param {string} [context.severity='error'] - Severity level: 'error' | 'warning' | 'info'
   * @param {Object} [context.extra] - Extra data to attach
   * @returns {void}
   */
  trackError(error, context = {}) {
    if (!this.isEnabled) {
      return;
    }

    // Normalize error
    const errorObj = error instanceof Error ? error : new Error(String(error));

    // Generate fingerprint for deduplication
    const fingerprint = this._generateFingerprint(errorObj);

    // Skip if duplicate (within short window)
    if (this.errorFingerprints.has(fingerprint)) {
      return;
    }

    // Add to fingerprint set (with timeout to allow re-reporting after 10s)
    this.errorFingerprints.add(fingerprint);
    setTimeout(() => this.errorFingerprints.delete(fingerprint), 10000);

    // Create error entry
    const entry = {
      timestamp: new Date().toISOString(),
      message: errorObj.message,
      stack: errorObj.stack,
      type: context.type || 'unknown',
      severity: context.severity || 'error',
      metadata: {
        ...this.metadata,
        ...context.extra,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`
      }
    };

    // Add to history
    this.errorHistory.push(entry);
    if (this.errorHistory.length > this.maxErrors) {
      this.errorHistory.shift();
    }

    this.errorCount++;

    // Log to console if enabled
    if (this.logToConsole) {
      const prefix = entry.severity === 'error' ? '❌' : entry.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.error(`${prefix} [ErrorTracker] ${entry.type}:`, entry.message);
      if (errorObj.stack) {
        console.error(errorObj.stack);
      }
      if (context.extra) {
        console.error('Context:', context.extra);
      }
    }

    // Send to Sentry if configured
    if (this.dsn) {
      this._sendToSentry(errorObj, entry);
    }
  }

  /**
   * Send error to Sentry (placeholder).
   *
   * @private
   * @param {Error} error - Error object
   * @param {Object} entry - Error entry with context
   * @returns {void}
   */
  _sendToSentry(error, entry) {
    // Placeholder for Sentry integration
    // In production:
    // Sentry.captureException(error, {
    //   level: entry.severity,
    //   tags: { type: entry.type },
    //   extra: entry.metadata
    // });
  }

  /**
   * Track a warning (non-critical error).
   *
   * @param {string} message - Warning message
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  trackWarning(message, context = {}) {
    this.trackError(new Error(message), {
      ...context,
      severity: 'warning'
    });
  }

  /**
   * Track informational message.
   *
   * @param {string} message - Info message
   * @param {Object} [context={}] - Additional context
   * @returns {void}
   */
  trackInfo(message, context = {}) {
    this.trackError(new Error(message), {
      ...context,
      severity: 'info'
    });
  }

  /**
   * Get recent errors from history.
   *
   * @param {number} [count=10] - Number of errors to retrieve
   * @returns {Array} Recent error entries
   */
  getRecentErrors(count = 10) {
    return this.errorHistory.slice(-count);
  }

  /**
   * Get errors filtered by severity.
   *
   * @param {string} severity - Severity level to filter ('error' | 'warning' | 'info')
   * @returns {Array} Filtered error entries
   */
  getErrorsBySeverity(severity) {
    return this.errorHistory.filter(e => e.severity === severity);
  }

  /**
   * Clear error history and reset counters.
   *
   * @returns {void}
   */
  clear() {
    this.errorHistory = [];
    this.errorFingerprints.clear();
    this.errorCount = 0;
  }

  /**
   * Enable error tracking.
   *
   * @returns {void}
   */
  enable() {
    this.isEnabled = true;
  }

  /**
   * Disable error tracking.
   *
   * @returns {void}
   */
  disable() {
    this.isEnabled = false;
  }

  /**
   * Remove global error handlers.
   *
   * Call this when disposing the tracker to avoid memory leaks.
   *
   * @returns {void}
   */
  dispose() {
    window.removeEventListener('error', this._handleError);
    window.removeEventListener('unhandledrejection', this._handleUnhandledRejection);
    this.clear();
  }

  /**
   * Get summary statistics.
   *
   * @returns {Object} Error statistics
   */
  getStats() {
    return {
      total: this.errorCount,
      inHistory: this.errorHistory.length,
      errors: this.getErrorsBySeverity('error').length,
      warnings: this.getErrorsBySeverity('warning').length,
      info: this.getErrorsBySeverity('info').length
    };
  }
}
