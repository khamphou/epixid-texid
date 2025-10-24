// Orchestrateur global du client
// TODO: intégrer progressivement l'existant depuis src/main.js

import { ScreenManager } from './screenManager.js';
import { ResourceManager } from './resourceManager.js';
import { UI } from './core.ui.js';
import { ApiClient } from './apiClient.js';
import { Config } from './config.js';
import { RealtimeClient } from './realtimeClient.js';
import { loadMode } from './modeLoader.js';
import { PerformanceMonitor } from '../utils/PerformanceMonitor.js';
import { ErrorTracker } from '../utils/ErrorTracker.js';

/** @typedef {{ push: (screen:any)=>void, replace:(screen:any)=>void, pop:()=>void }} IScreenManager */

/**
 * Game core orchestrator.
 *
 * Manages:
 * - Screen management and transitions
 * - Resource loading
 * - Game loop (60 FPS target)
 * - Performance monitoring
 * - Error tracking
 * - Multiplayer connection
 *
 * @property {ScreenManager} sm - Screen manager
 * @property {ResourceManager} rm - Resource manager
 * @property {UI} ui - UI helper
 * @property {ApiClient} api - API client
 * @property {RealtimeClient} rt - Realtime WebSocket client
 * @property {PerformanceMonitor} perfMonitor - Performance monitor (FPS tracking)
 * @property {ErrorTracker} errorTracker - Error tracker (exception capture)
 */
export class Core {
  /** @param {HTMLElement} root */
  constructor(root){
    this.root = root;
    this.sm = new ScreenManager(root);
    this.rm = new ResourceManager();
    this.ui = new UI(document);
    this.api = new ApiClient(Config.apiBase);
    this.rt = new RealtimeClient(Config.wsUrl);
    this.last = 0;
    this._tick = this._tick.bind(this);

    // Initialize monitoring systems
    this.perfMonitor = new PerformanceMonitor({
      targetFPS: 60,
      sampleWindow: 60,
      logInterval: 300, // Log every 5 seconds
      autoLog: false // Manual logging control
    });

    this.errorTracker = new ErrorTracker({
      autoCapture: true, // Capture uncaught errors
      maxErrors: 100,
      logToConsole: true,
      environment: this._detectEnvironment(),
      metadata: {
        game: 'TEXID',
        version: '0.1.0'
      }
    });

    // TODO: wire inputs global, audio preload, resume from local state
  }

  /**
   * Detect current environment (development, staging, production).
   *
   * @private
   * @returns {string} Environment name
   */
  _detectEnvironment() {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    if (hostname.includes('staging')) {
      return 'staging';
    }
    return 'production';
  }

  async boot(){
    try {
      await this.rm.preload();
      requestAnimationFrame(this._tick);
    } catch (err) {
      this.errorTracker.trackError(err, {
        type: 'boot_failure',
        severity: 'error',
        extra: { phase: 'resource_preload' }
      });
      throw err;
    }
  }

  /** @param {number} ts */
  _tick(ts){
    try{
      // Start performance monitoring for this frame
      this.perfMonitor.startFrame(ts);

      const dt = this.last ? Math.min(0.05, (ts - this.last)/1000) : 0;
      this.last = ts;

      this.sm.update(dt);
      this.sm.render();

      // End frame measurement
      this.perfMonitor.endFrame();

      // Log performance stats periodically
      if (this.perfMonitor.shouldLog()) {
        const stats = this.perfMonitor.getStats();
        if (!stats.isHealthy) {
          this.errorTracker.trackWarning('Poor performance detected', {
            type: 'performance',
            extra: stats
          });
        }
      }
    }catch(err){
      // Track frame errors
      this.errorTracker.trackError(err, {
        type: 'game_loop',
        severity: 'error',
        extra: {
          frame: this.perfMonitor.totalFrames,
          fps: this.perfMonitor.currentFPS
        }
      });
      try{ console.error('[core.tick] frame error:', err); }catch{}
    } finally {
      requestAnimationFrame(this._tick);
    }
  }

  /** Charge un mode depuis YAML (ou serveur en multi) */
  async loadMode(modeId, { multiplayer=false }={}){
    try {
      return await loadMode(modeId, { multiplayer, api: this.api, rt: this.rt });
    } catch (err) {
      this.errorTracker.trackError(err, {
        type: 'mode_load_failure',
        severity: 'error',
        extra: { modeId, multiplayer }
      });
      throw err;
    }
  }

  /**
   * Get current performance stats.
   *
   * @returns {Object} Performance statistics
   */
  getPerformanceStats() {
    return this.perfMonitor.getStats();
  }

  /**
   * Get recent errors.
   *
   * @param {number} [count=10] - Number of errors to retrieve
   * @returns {Array} Recent error entries
   */
  getRecentErrors(count = 10) {
    return this.errorTracker.getRecentErrors(count);
  }

  /**
   * Dispose core resources and cleanup.
   *
   * @returns {void}
   */
  dispose() {
    this.errorTracker.dispose();
    this.sm.clear();
  }
}

