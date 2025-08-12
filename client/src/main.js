import { Core } from './core/core.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { TrainingScreen } from './screens/TrainingScreen.js';
import { modeFactory } from './modes/modeFactory.js';
import { initHero } from './hero.js';
import { bootAudio, resumeAudio, audio } from './audio.js';
import './style.css';

const root = document.getElementById('app-root');
const core = new Core(root);
let stopHero = null; // pour contrôler l'animation du hero
let audioBooted = false; // bootAudio après geste utilisateur uniquement

function bindHomeDOM(){
  const qs = (s)=> document.querySelector(s);
  const openDrawer = ()=> document.getElementById('drawer-credits')?.classList.add('open');
  const closeDrawer = ()=> document.getElementById('drawer-credits')?.classList.remove('open');
  qs('#btn-credits')?.addEventListener('click', openDrawer);
  qs('#drawer-credits-close')?.addEventListener('click', closeDrawer);
  qs('#drawer-credits .drawer-backdrop')?.addEventListener('click', (e)=>{ if(e.target?.dataset?.close) closeDrawer(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });
  // Reprise audio après interaction utilisateur (politique navigateur)
  const resumeOnUser = ()=>{
    try{ if(!audioBooted){ bootAudio(); audioBooted = true; } }catch{}
    try{ resumeAudio(); }catch{}
    document.removeEventListener('pointerdown', resumeOnUser);
    document.removeEventListener('keydown', resumeOnUser);
  };
  document.addEventListener('pointerdown', resumeOnUser); document.addEventListener('keydown', resumeOnUser);

  // Démarrages
  qs('#btn-start-solo')?.addEventListener('click', ()=> startSolo());
  // Supporte les deux IDs potentiels selon le markup
  qs('#btn-start-training')?.addEventListener('click', ()=> startTraining());
  qs('#btn-training')?.addEventListener('click', ()=> startTraining());
  // Placeholder
  qs('#btn-start-arcade')?.addEventListener('click', ()=>{});
  qs('#btn-start-multi')?.addEventListener('click', ()=> startMulti());

  function startSolo(modeId){
    // Masquer le hero DOM et afficher le canvas, puis demander au HomeScreen de lancer Solo
    navigateToCanvas();
    // Stopper l'animation du hero pendant le jeu
    try{ stopHero?.(); stopHero = null; }catch{}
    // Fermer les UI éventuelles de l'accueil
    try{ document.getElementById('drawer-credits')?.classList.remove('open'); }catch{}
    try{ document.getElementById('dlg-top10')?.close?.(); }catch{}
    // Si le haut de pile est déjà un HomeScreen (cas à l'arrivée), utiliser son lanceur directement
    const top = core.sm.top();
    if(top && typeof top._launchSolo === 'function'){
      top._launchSolo(modeId||undefined);
    } else {
      // Sinon, insérer un HomeScreen transitoire pour garantir un chemin consistant
      const hs = new HomeScreen(core);
      core.sm.replace(hs);
      hs._launchSolo(modeId||undefined);
    }
    try{ audio.setMusicIntensity?.(0.25); }catch{}
  }
  function navigateToCanvas(){
    // Masquer le hero DOM pour laisser le canvas occuper la page
    const hero = document.getElementById('screen-start');
    hero?.classList.remove('active');
    document.getElementById('topbar')?.classList.remove('hidden');
    // Afficher le canvas du ScreenManager
  try{ core.sm.canvas.style.display = 'block'; core.sm.canvas.style.pointerEvents = 'auto'; }catch{}
  }
  async function startTraining(){
    navigateToCanvas();
    try{ stopHero?.(); stopHero = null; }catch{}
    try{ document.getElementById('drawer-credits')?.classList.remove('open'); }catch{}
    try{ document.getElementById('dlg-top10')?.close?.(); }catch{}
    // Charger un mode d'entraînement réel pour obtenir des règles avec attackFor
    try{
      const { rules, objectives } = await core.loadMode('daily_tspin_rush', { multiplayer:false });
      core.sm.replace(new TrainingScreen(core, { rules, objectives }));
    }catch(err){
      // Fallback local minimal (mêmes valeurs que HomeScreen._launchTraining)
      const fallbackCfg={ id:'local_training',version:1,title:'Training (local)',description:'Mode entraînement',visibility:'public',mode:'solo',
        lobby:{minPlayers:1,maxPlayers:1,seedPolicy:'perPlayer'},
        rules:{ attackTable:{single:0,double:1,triple:2,tetris:4,tspin:{single:2,double:4,triple:6},backToBackBonus:1,comboTable:[0,1,1,2,2,3,3,4,4,5]},
          garbage:{delayMs:600,telegraphMs:600,messiness:0.35,cancelPolicy:'net'}, speed:{lockDelayMs:500, gravityCurve:[{t:0,gravity:1}]}, inputs:{dasMs:110,arrMs:10,allow180:true,allowHold:true,holdConsumesLock:true}, badges:{enabled:false,perKOPercent:0,maxStacks:0}},
        objectives:{winCondition:'first_to_objectives',targets:{survive:{seconds:9999}}}, leaderboard:{scope:'none',scoring:'score'} };
      const { rules, objectives } = modeFactory.fromConfig(fallbackCfg);
      core.sm.replace(new TrainingScreen(core, { rules, objectives }));
    }
    try{ audio.setMusicIntensity?.(0.25); }catch{}
  }
  async function startMulti(){
    navigateToCanvas();
    try{ stopHero?.(); stopHero = null; }catch{}
    // Pousser le Lobby multi
    const mod = await import('./screens/MultiplayerLobbyScreen.js');
    core.sm.replace(new mod.MultiplayerLobbyScreen(core));
    try{ audio.setMusicIntensity?.(0.25); }catch{}
  }
}

// Raccrochage topbar
function bindTopbar(){
  const tb = document.getElementById('topbar'); if(!tb) return;
  const btnTop10 = document.getElementById('btn-top10');
  const btnHelp = document.getElementById('btn-help');
  const btnExit = document.getElementById('btn-exit');
  const dlgTop10 = document.getElementById('dlg-top10');
  const dlgHelp = document.getElementById('dlg-help');
  const btnTop10Close = document.getElementById('top10-close-x');
  const btnHelpClose = document.getElementById('help-close');
  btnTop10?.addEventListener('click', async ()=> {
    try{ await populateTop10(); dlgTop10.showModal(); }catch{ try{ dlgTop10.showModal(); }catch{} }
  });
  btnHelp?.addEventListener('click', ()=> { try{ dlgHelp.showModal(); }catch{} });
  btnTop10Close?.addEventListener('click', ()=> { try{ dlgTop10.close(); }catch{} });
  btnHelpClose?.addEventListener('click', ()=> { try{ dlgHelp.close(); }catch{} });

  async function populateTop10(){
    const list = document.getElementById('top10-modal-solo'); if(!list) return;
    list.innerHTML = '';
    try{
      const res = await fetch('/leaderboard.json', { cache: 'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const entries = Array.isArray(data?.solo) ? data.solo.slice(0,10) : [];
      for(const e of entries){
        const li = document.createElement('li');
        li.innerHTML = `${escapeHtml(e.name||'—')} <span class="sc">${Number(e.score||0)}</span>`;
        list.appendChild(li);
      }
    }catch{
      const li = document.createElement('li'); li.textContent = 'Aucun score.'; list.appendChild(li);
    }
  }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
  btnExit?.addEventListener('click', ()=> {
    // Retour à l’accueil
    document.getElementById('screen-start')?.classList.add('active');
    document.getElementById('topbar')?.classList.add('hidden');
    // Vide le stack et remet HomeScreen par défaut
    core.sm.clear();
    core.sm.push(new HomeScreen(core));
    // Masquer le canvas quand on revient à l’accueil DOM
    try{ core.sm.canvas.style.display = 'none'; core.sm.canvas.style.pointerEvents = 'none'; }catch{}
    // Relancer l'animation du hero et forcer un resize après ré-affichage
    try{ stopHero?.(); }catch{}
    try{ stopHero = initHero(); }catch{}
    try{ requestAnimationFrame(()=> window.dispatchEvent(new Event('resize'))); }catch{}
  });
}

core.boot().then(()=>{
  // Affiche le HomeScreen canvas superposé mais on garde le hero DOM jusqu’au clic
  core.sm.push(new HomeScreen(core));
  bindHomeDOM();
  bindTopbar();
  // Animation hero (si présente dans le DOM)
  stopHero = initHero();
  // Audio: booté après geste utilisateur (voir resumeOnUser)
  // Par défaut, si le hero DOM est visible, masquer le canvas de rendu
  try{ core.sm.canvas.style.display = 'none'; }catch{}
});
