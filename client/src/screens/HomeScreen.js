import { Config } from '../core/config.js';
import { modeFactory } from '../modes/modeFactory.js';
import { SoloScreen } from './SoloScreen.js';
import { TrainingScreen } from './TrainingScreen.js';

export class HomeScreen{
  constructor(core){
    this.core=core;
    this.idx=0;
  this._logo = null; this._logoReady = false;
    this.items = [
      { key:'solo', label:'Solo', enabled:true },
      { key:'training', label:'Entraînement (facile)', enabled:true },
      { key:'arcade', label:'Arcade (Bientôt)', enabled:false },
  { key:'multi', label:'Multijoueur', enabled:true },
      { key:'top', label:'Top 10', enabled:false },
      { key:'credits', label:'Crédits', enabled:true },
    ];
    this._onKey=this._onKey.bind(this);
  }
  async init(){
    // Si l'accueil DOM (hero) est présent, on ne crée pas de drawer ni de raccourcis ici
    this.domHome = document.getElementById('screen-start');
    if(!this.domHome){
      window.addEventListener('keydown', this._onKey);
      this.drawer = document.createElement('div');
      Object.assign(this.drawer.style, { position:'fixed', top:'0', right:'0', width:'360px', height:'100%', background:'rgba(10,14,20,0.96)', color:'#e5e7eb', boxShadow:'-8px 0 24px rgba(0,0,0,0.5)', transform:'translateX(100%)', transition:'transform .25s ease', padding:'24px', zIndex:'10', overflow:'auto', font:'14px/1.5 system-ui,Segoe UI,Roboto,Arial' });
      this.drawer.innerHTML = `<h2 style="margin:0 0 12px;font-size:18px;color:#93c5fd">Crédits</h2>
        <p>TEXID — client modulaire (WIP). Menu, hold/preview, garbage, etc.</p>
        <p>Le plateau final (UI/skins) sera aligné avec la version legacy.</p>
        <p style="opacity:.7">Echap pour fermer</p>`;
      this.core.root.appendChild(this.drawer);
    }
    const btnTraining = document.getElementById('btn-training');
    if(btnTraining){
      btnTraining.addEventListener('click', ()=>{
        // Utiliser le lanceur standard pour charger des règles valides
        this._launchTraining('daily_tspin_rush');
      });
    }
  }
  update(){}
  render(ctx){
    if(this.domHome) return; // l'accueil DOM gère l'affichage
    const { canvas } = ctx;
    ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // Titre: afficher le logo au lieu du texte
    try{
      if(!this._logo){
        const url = new URL('../assets/images/logo-texid.png', import.meta.url).href;
        const img = new Image(); img.src = url; img.onload = ()=>{ this._logoReady = true; }; img.onerror = ()=>{ this._logoReady=false; };
        this._logo = img;
      }
      if(this._logoReady){
        const maxW = Math.min(320, Math.floor(canvas.width*0.6));
        const aspect = this._logo.naturalWidth && this._logo.naturalHeight ? (this._logo.naturalWidth/this._logo.naturalHeight) : (4/1);
        const w = maxW; const h = Math.floor(w / aspect);
        ctx.drawImage(this._logo, 40, 28, w, h);
      } else {
        ctx.fillStyle='#93c5fd'; ctx.font='24px system-ui,Segoe UI,Roboto,Arial';
        ctx.fillText('TEXID', 40, 60);
      }
    }catch{
      ctx.fillStyle='#93c5fd'; ctx.font='24px system-ui,Segoe UI,Roboto,Arial';
      ctx.fillText('TEXID', 40, 60);
    }
    // Menu vertical
    const x=60, y0=120, lh=40; ctx.font='18px system-ui,Segoe UI,Roboto,Arial';
    for(let i=0;i<this.items.length;i++){
      const it=this.items[i]; const y=y0+i*lh;
      ctx.fillStyle = i===this.idx ? '#e5e7eb' : it.enabled ? '#94a3b8' : '#475569';
      ctx.fillText((it.enabled?'':'[Bientôt] ')+it.label, x, y);
    }
    ctx.font='12px system-ui,Segoe UI,Roboto,Arial'; ctx.fillStyle='#64748b';
    ctx.fillText('↑/↓ naviguer, Entrée valider, C crédits', x, y0+this.items.length*lh + 20);
  }
  handleInput(){ }
  dispose(){ 
    if(!this.domHome){ 
      window.removeEventListener('keydown', this._onKey); 
      this.drawer?.remove?.(); 
    }
    const btnTraining = document.getElementById('btn-training');
    if(btnTraining){
      // remove listeners if needed
    }
  }
  async _launchSolo(modeId='br10'){
    try{
      const { rules, objectives } = await this.core.loadMode(modeId, { multiplayer:false });
      this.core.sm.replace(new (await import('./SoloScreen.js')).SoloScreen(this.core, { rules, objectives }));
    }catch(err){
      const fallbackCfg={ id:'local_solo',version:1,title:'Solo (local)',description:'Mode local',visibility:'public',mode:'solo',
        lobby:{minPlayers:1,maxPlayers:1,seedPolicy:'perPlayer'},
        rules:{ attackTable:{single:0,double:1,triple:2,tetris:4,tspin:{single:2,double:4,triple:6},backToBackBonus:1,comboTable:[0,1,1,2,2,3,3,4,4,5]},
          garbage:{delayMs:600,telegraphMs:600,messiness:0.35,cancelPolicy:'net'}, speed:{lockDelayMs:500, gravityCurve:[{t:0,gravity:1}]}, inputs:{dasMs:110,arrMs:10,allow180:true,allowHold:true,holdConsumesLock:true}, badges:{enabled:false,perKOPercent:0,maxStacks:0}},
        objectives:{winCondition:'first_to_objectives',targets:{survive:{seconds:9999}}}, leaderboard:{scope:'none',scoring:'score'} };
      const { rules, objectives } = modeFactory.fromConfig(fallbackCfg);
      this.core.sm.replace(new (await import('./SoloScreen.js')).SoloScreen(this.core, { rules, objectives }));
    }
  }
  _toggleCredits(show){ if(!this.drawer) return; this.drawer.style.transform = show? 'translateX(0)' : 'translateX(100%)'; this.drawerOpen = !!show; }
  async _onKey(e){
    if(e.key==='Escape'){ if(this.drawerOpen) return this._toggleCredits(false); }
    if(e.key==='c' || e.key==='C'){ if(this.drawer) this._toggleCredits(!this.drawerOpen); return; }
    if(e.key==='ArrowDown'){ do{ this.idx=(this.idx+1)%this.items.length; } while(!this.items[this.idx].enabled); }
    else if(e.key==='ArrowUp'){ do{ this.idx=(this.idx-1+this.items.length)%this.items.length; } while(!this.items[this.idx].enabled); }
    else if(e.key==='Enter'){
      const sel=this.items[this.idx];
      if(sel.key==='solo') return this._launchSolo(Config.defaultMode);
      if(sel.key==='training') return this._launchTraining('daily_tspin_rush');
      if(sel.key==='multi') return this._launchMulti();
      if(sel.key==='credits') return this._toggleCredits(true);
    }
  }
  async _launchTraining(modeId='daily_tspin_rush'){
    try{
      const { rules, objectives } = await this.core.loadMode(modeId, { multiplayer:false });
      this.core.sm.replace(new TrainingScreen(this.core, { rules, objectives }));
      try{ document.getElementById('topbar')?.classList.remove('hidden'); }catch{}
    }catch(err){
      // Fallback: même config que _launchSolo mais avec TrainingScreen
      const fallbackCfg={ id:'local_training',version:1,title:'Training (local)',description:'Mode entraînement',visibility:'public',mode:'solo',
        lobby:{minPlayers:1,maxPlayers:1,seedPolicy:'perPlayer'},
        rules:{ attackTable:{single:0,double:1,triple:2,tetris:4,tspin:{single:2,double:4,triple:6},backToBackBonus:1,comboTable:[0,1,1,2,2,3,3,4,4,5]},
          garbage:{delayMs:600,telegraphMs:600,messiness:0.35,cancelPolicy:'net'}, speed:{lockDelayMs:500, gravityCurve:[{t:0,gravity:1}]}, inputs:{dasMs:110,arrMs:10,allow180:true,allowHold:true,holdConsumesLock:true}, badges:{enabled:false,perKOPercent:0,maxStacks:0}},
        objectives:{winCondition:'first_to_objectives',targets:{survive:{seconds:9999}}}, leaderboard:{scope:'none',scoring:'score'} };
      const { rules, objectives } = modeFactory.fromConfig(fallbackCfg);
      this.core.sm.replace(new TrainingScreen(this.core, { rules, objectives }));
      try{ document.getElementById('topbar')?.classList.remove('hidden'); }catch{}
    }
  }
  async _launchMulti(){
    const mod = await import('./MultiplayerLobbyScreen.js');
    this.core.sm.replace(new mod.MultiplayerLobbyScreen(this.core));
    try{ document.getElementById('topbar')?.classList.remove('hidden'); }catch{}
  }
}
