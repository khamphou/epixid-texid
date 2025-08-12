// Chargement de modes (YAML) côté client
import { ApiClient } from './apiClient.js';
import { modeFactory } from '../modes/modeFactory.js';

/**
 * @param {string} id
 * @param {{ multiplayer?: boolean, api?: ApiClient, rt?: any }} ctx
 */
export async function loadMode(id, { multiplayer=false, api=new ApiClient(), rt=null }={}){
  if(multiplayer && rt){
    // Attendre la config côté serveur
    const cfg = await new Promise(resolve=>{
      const off = rt.on('match_start', (m)=>{ if(m.modeId===id && m.cfg){ off(); resolve(m.cfg); } });
    });
    return modeFactory.fromConfig(cfg);
  }
  // Solo: demander au backend
  const cfg = await api.get(`/modes/${encodeURIComponent(id)}`);
  return modeFactory.fromConfig(cfg);
}
