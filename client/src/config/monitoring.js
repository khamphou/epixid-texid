/**
 * Monitoring configuration.
 *
 * Configure Sentry DSN and other monitoring options here.
 * In production, set SENTRY_DSN environment variable or update this file.
 *
 * To enable Sentry:
 * 1. Install: `npm install @sentry/browser`
 * 2. Set DSN below or via environment variable
 * 3. Uncomment Sentry initialization in ErrorTracker.js
 */

/**
 * Monitoring configuration object.
 *
 * @typedef {Object} MonitoringConfig
 * @property {string|null} sentryDSN - Sentry DSN for error tracking
 * @property {boolean} enablePerformanceMonitoring - Enable FPS tracking
 * @property {boolean} enableErrorTracking - Enable error capture
 * @property {boolean} showPerformanceOverlay - Show FPS overlay in development
 * @property {number} performanceLogInterval - Log performance every N frames (300 = 5s at 60 FPS)
 * @property {number} maxErrorHistory - Maximum errors to keep in memory
 */

/**
 * Get monitoring configuration based on environment.
 *
 * @returns {MonitoringConfig} Monitoring configuration
 */
export function getMonitoringConfig() {
  const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return {
    // Sentry configuration
    sentryDSN: import.meta.env.VITE_SENTRY_DSN || null,

    // Performance monitoring
    enablePerformanceMonitoring: true,
    showPerformanceOverlay: isDevelopment, // Only show in development by default

    // Error tracking
    enableErrorTracking: true,

    // Logging intervals
    performanceLogInterval: isDevelopment ? 300 : 1800, // 5s in dev, 30s in prod

    // History limits
    maxErrorHistory: isDevelopment ? 100 : 50,

    // Environment detection
    environment: isDevelopment ? 'development' : 'production',

    // Game metadata
    metadata: {
      game: 'TEXID',
      version: '0.1.0'
    }
  };
}

/**
 * Example .env configuration:
 *
 * ```
 * # Sentry DSN (optional - for error tracking)
 * VITE_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
 * ```
 */

/**
 * To install Sentry:
 *
 * ```bash
 * npm install @sentry/browser @sentry/tracing
 * ```
 *
 * Then in ErrorTracker._initSentry():
 * ```javascript
 * import * as Sentry from "@sentry/browser";
 * import { BrowserTracing } from "@sentry/tracing";
 *
 * Sentry.init({
 *   dsn: this.dsn,
 *   environment: this.environment,
 *   integrations: [new BrowserTracing()],
 *   tracesSampleRate: 0.1, // 10% of transactions
 * });
 * ```
 */
