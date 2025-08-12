// Orchestrateur global du client
// TODO: intégrer progressivement l'existant depuis src/main.js

import { ScreenManager } from './screenManager.js';
import { ResourceManager } from './resourceManager.js';
import { UI } from './core.ui.js';
import { ApiClient } from './apiClient.js';
import { Config } from './config.js';
import { RealtimeClient } from './realtimeClient.js';
import { loadMode } from './modeLoader.js';

/** @typedef {{ push: (screen:any)=>void, replace:(screen:any)=>void, pop:()=>void }} IScreenManager */

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
    // TODO: wire inputs global, audio preload, resume from local state
  }

  async boot(){
    await this.rm.preload();
    requestAnimationFrame(this._tick);
  }

  /** @param {number} ts */
  _tick(ts){
    try{
      const dt = this.last ? Math.min(0.05, (ts - this.last)/1000) : 0; this.last = ts;
      this.sm.update(dt);
      this.sm.render();
    }catch(err){
      try{ console.error('[core.tick] frame error:', err); }catch{}
    } finally {
      requestAnimationFrame(this._tick);
    }
  }

  /** Charge un mode depuis YAML (ou serveur en multi) */
  async loadMode(modeId, { multiplayer=false }={}){
    return loadMode(modeId, { multiplayer, api: this.api, rt: this.rt });
  }
}
