import { Core } from './core/core.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { initHero } from './hero.js';
import './style.css';

const root = document.getElementById('app-root');
const core = new Core(root);

function bindHomeDOM(){
  const qs = (s)=> document.querySelector(s);
  const openDrawer = ()=> document.getElementById('drawer-credits')?.classList.add('open');
  const closeDrawer = ()=> document.getElementById('drawer-credits')?.classList.remove('open');
  qs('#btn-credits')?.addEventListener('click', openDrawer);
  qs('#drawer-credits-close')?.addEventListener('click', closeDrawer);
  qs('#drawer-credits .drawer-backdrop')?.addEventListener('click', (e)=>{ if(e.target?.dataset?.close) closeDrawer(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });

  // Démarrages
  qs('#btn-start-solo')?.addEventListener('click', ()=> startSolo());
  qs('#btn-start-training')?.addEventListener('click', ()=> startSolo('daily_tspin_rush'));
  // Placeholder
  qs('#btn-start-arcade')?.addEventListener('click', ()=>{});
  qs('#btn-start-multi')?.addEventListener('click', ()=>{});

  function startSolo(modeId){ navigateToCanvas();
    core.sm.replace(new HomeScreen(core));
    core.sm.top()?._launchSolo?.(modeId||undefined);
  }
  function navigateToCanvas(){
    // Masquer le hero DOM pour laisser le canvas occuper la page
    const hero = document.getElementById('screen-start');
    hero?.classList.remove('active');
  }
}

core.boot().then(()=>{
  // Affiche le HomeScreen canvas superposé mais on garde le hero DOM jusqu’au clic
  core.sm.push(new HomeScreen(core));
  bindHomeDOM();
  // Animation hero (si présente dans le DOM)
  initHero();
});
