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
