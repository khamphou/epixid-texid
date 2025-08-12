// Wrapper Audio pour le client modulaire: réutilise le legacy src/audio.js
import { AudioFX as LegacyAudioFX } from '../../src/audio.js';

export const audio = new LegacyAudioFX();

export async function bootAudio(){
  try{ await audio.preloadAll(); }catch{}
  try{ await audio.playHomeIntroMusic(); }catch{}
}

export async function resumeAudio(){
  try{ await audio.resume(); }catch{}
}

// Renforcer le SFX de clear selon le nombre de lignes
// 1 -> base, 2 -> +3 dB env., 3 -> +6 dB, 4 -> +8 dB
// Utilise les champs internes du legacy; fallback simple sinon
try{
  audio.linesCleared = function(count){
    const k = Math.max(1, Math.min(4, Number(count)||1));
    const base = 0.22; // point de départ plus doux
    const gain = base + (k-1) * 0.08; // 0.22..0.46
    // assurer la chaîne SFX
    try{
      // Force init SFX break sans rejouer si non prêt
      let url; try{ url = new URL('../assets/music/sounds/break.mp3', import.meta.url).href; }catch{ url = 'assets/music/sounds/break.mp3'; }
      this._ensureSfx?.('break', url, gain);
      if(this._sfx?.break?.gain){ this._sfx.break.gain.gain.value = gain; }
    }catch{}
    try{ this.playBreakSfx?.(); }catch{}
  };
}catch{}
