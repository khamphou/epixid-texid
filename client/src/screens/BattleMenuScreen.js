import { ApiClient } from '../core/apiClient.js';
import { TrainingScreen } from './TrainingScreen.js';
import { SoloScreen } from './SoloScreen.js';
import { RealtimeClient } from '../core/realtimeClient.js';

export class BattleMenuScreen{
  constructor(core){
    this.core=core; this.api=new ApiClient();
    this.list=[]; this.grouped=new Map(); this.selIdx=0; this._loaded=false; this._off=[];
    this._hoverCache=new Map(); this._preview=null; this._rooms=[]; this._timer=null;
  this._level='root'; this._activeCat=null; this._flat=[]; this._selInView=0;
  // Index de sélection pour la navigation clavier
  this._catSelIdx=0; this._roomSelIdx=0; this._rootSelIdx=0; this._rootCatSelIdx=0;
  // Chat global (lobby)
  this._wsChat=null; this._chatMsgs=[]; this._chatOnline=0; this._chatKind='global'; this._chatZone=null;
  }
  async init(){
    // DOM overlay: sidebar tabs (left), stage (center), preview (right)
    this.root = document.createElement('div'); this.root.id='battle-menu';
  Object.assign(this.root.style,{ position:'absolute', left:'0', right:'0', bottom:'0', top:'0', color:'#e5e7eb', font:'14px/1.45 system-ui,Segoe UI,Roboto,Arial', display:'grid', gridTemplateColumns:'180px 220px 1fr 1fr', gap:'12px', padding:'16px'});
  this.root.innerHTML = `
      <style>
        #battle-menu{ --bd: rgba(148,163,184,.2); --bg: rgba(15,23,42,.6); }
        #battle-menu .bm-row{ transition: background-color .12s ease, transform .08s ease; }
        #battle-menu .bm-row:hover{ background: rgba(148,163,184,0.16)!important; transform: translateX(2px); }
        #battle-menu .bm-row.sel{ background: rgba(148,163,184,0.12); }
  #battle-menu .bm-cats-grid{ display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; padding:8px 12px; }
  #battle-menu .bm-cat-panel{ border:1px solid var(--bd); border-radius:10px; background:rgba(10,15,25,.35); overflow:hidden; }
  #battle-menu .bm-cat-title{ display:flex; justify-content:space-between; align-items:center; padding:8px 10px; font-weight:700; color:#93c5fd; border-bottom:1px solid var(--bd); }
  #battle-menu .bm-cat-open{ border:0; background:transparent; color:#93c5fd; cursor:pointer; border-radius:6px; padding:4px 6px; }
  #battle-menu .bm-cat-open:hover{ background: rgba(148,163,184,.12); }
    #battle-menu .bm-tabs{ border:1px solid var(--bd); border-radius:10px; background:var(--bg); padding:6px 4px; overflow:auto; }
  #battle-menu .bm-tab{ display:flex; align-items:center; justify-content:center; gap:4px; width:100%; min-height:120px; border:0; background:transparent; color:#e5e7eb; padding:6px 4px; border-radius:8px; cursor:pointer; text-align:center; position:relative; }
    #battle-menu .bm-tab.active{ background: rgba(148,163,184,.16); }
    #battle-menu .bm-tab.back{ color:#93c5fd; font-weight:600; }
    #battle-menu .bm-tab.back:hover{ background: rgba(148,163,184,.16); }
  #battle-menu .bm-tab .bm-icon{ display:block; font-size:16px; }
  #battle-menu .bm-tab .bm-label{ display:inline-block; transform: rotate(-90deg); transform-origin: left center; white-space: nowrap; font-size:11px; line-height:1; opacity:.95; }
  /* Masquer les barres à la racine, mais conserver la place si on veut un layout stable */
  #battle-menu.is-root #bm-tabs, #battle-menu.is-root #bm-stack{ visibility:hidden; }
    #battle-menu .bm-stack{ border:1px solid var(--bd); border-radius:10px; background:var(--bg); padding:8px; overflow:auto; transition: opacity .25s ease, transform .25s ease; }
    #battle-menu.is-root .bm-stack{ pointer-events:none; opacity:0; transform: translateX(-10px); }
        #battle-menu .bm-stack-item{ border:1px dashed var(--bd); border-radius:8px; padding:6px; margin-bottom:8px; background:rgba(10,15,25,.35); }
        #battle-menu .bm-stack-title{ font-size:12px; color:#93c5fd; font-weight:600; margin:0 0 6px; opacity:.95; }
        #battle-menu .bm-stack-list .bm-stack-link{ display:block; width:100%; border:0; background:transparent; color:#cbd5e1; text-align:left; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:12px; }
        #battle-menu .bm-stack-list .bm-stack-link:hover{ background: rgba(148,163,184,.14); }
  #battle-menu .bm-stack-list .bm-stack-link.active{ background: rgba(148,163,184,.18); color:#e5e7eb; }
        #battle-menu .bm-main{ position:relative; overflow:hidden; border:1px solid var(--bd); border-radius:10px; background:var(--bg); }
    #battle-menu .bm-stage{ position:absolute; inset:0; width:200%; display:flex; transition: transform .28s cubic-bezier(.22,.61,.36,1); }
  #battle-menu .bm-level{ width:50%; padding:8px 0; overflow:auto; transition: transform .28s cubic-bezier(.22,.61,.36,1), opacity .25s ease; }
    #battle-menu .bm-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 12px; border-bottom:1px solid var(--bd); position:sticky; top:0; background:linear-gradient(180deg, rgba(15,23,42,.9), rgba(15,23,42,.7)); z-index:2; }
        #battle-menu .bm-back{ border:0; background:transparent; color:#93c5fd; cursor:pointer; padding:6px 8px; border-radius:8px; font-weight:600; }
        #battle-menu .bm-back:hover{ background: rgba(148,163,184,.12); }
        #battle-menu .bm-hdr{ color:#93c5fd; font-weight:600; text-transform:uppercase; letter-spacing:.03em; opacity:.95; padding:6px 12px; }
        #battle-menu .bm-preview{ overflow:auto; border:1px solid var(--bd); padding:12px; border-radius:10px; background:rgba(15,23,42,.5) }
    #battle-menu .bm-crumb{ display:flex; align-items:center; gap:8px; color:#94a3b8; font-size:12px; padding:4px 12px 8px; }
    #battle-menu .bm-crumb a{ color:#93c5fd; text-decoration:none; cursor:pointer; }
    #battle-menu .bm-crumb a:hover{ text-decoration:underline; }
  #battle-menu.is-sub #bm-root{ transform: translateX(-8px) scale(.985); opacity:.82; }
  /* Tabs horizontaux (petits écrans) */
  #battle-menu .bm-top-tabs{ display:flex; gap:8px; flex-wrap:wrap; overflow-x:visible; padding:8px 12px; border-bottom:1px solid var(--bd); background:transparent; z-index:1; }
  #battle-menu .bm-top-tabs .ttab{ display:inline-block; white-space:nowrap; border:1px solid var(--bd); background:transparent; color:#e5e7eb; border-radius:999px; padding:6px 10px; cursor:pointer; }
  #battle-menu .bm-top-tabs .ttab.active{ background: rgba(148,163,184,.16); }
      </style>
  <div id="bm-tabs" class="bm-tabs" role="tablist" aria-label="Navigation"></div>
      <div id="bm-stack" class="bm-stack" aria-label="Fil d’Ariane"></div>
      <div class="bm-main">
        <div class="bm-head">
          <div style="display:flex; align-items:center; gap:8px">
            <button id="bm-back" class="bm-back" title="Retour" aria-label="Retour" style="display:none">← Retour</button>
            <div id="bm-title" style="font-weight:600">Modes</div>
          </div>
          <div id="bm-breadcrumb" class="bm-crumb"></div>
        </div>
        <div id="bm-stage" class="bm-stage" aria-live="polite">
          <div id="bm-root" class="bm-level" role="region" aria-label="Racine"></div>
          <div id="bm-cat" class="bm-level" role="region" aria-label="Catégorie"></div>
        </div>
      </div>
      <div id="bm-preview" class="bm-preview">
        <h2 style="margin:0 0 8px;font-size:16px;color:#93c5fd">Aperçu</h2>
        <div id="bm-details" style="opacity:.9">Survolez un mode pour voir les détails.</div>
        <div style="margin-top:12px;opacity:.7">Esc: Retour</div>
        <div style="height:1px;background:var(--bd);margin:12px 0 10px"></div>
        <h2 style="margin:0 0 8px;font-size:16px;color:#93c5fd;display:flex;align-items:center;gap:8px">Chat 
          <select id="bm-chat-scope" style="margin-left:auto;background:#0f141a;color:#e5e7eb;border:1px solid var(--bd);border-radius:8px;padding:2px 6px;font-size:12px">
            <option value="global">Global</option>
            <option value="zone">Zone</option>
          </select>
          <span id="bm-chat-online" style="opacity:.75;font-weight:500;font-size:12px"></span>
        </h2>
        <div id="bm-chat-box" style="display:flex;flex-direction:column;gap:8px">
          <div id="bm-chat-log" style="height:150px;overflow:auto;background:rgba(255,255,255,.03);border-radius:8px;padding:8px;font:13px system-ui"></div>
          <input id="bm-chat-input" placeholder="Message…" style="width:100%;border:1px solid rgba(148,163,184,.25);background:#0f141a;color:#e5e7eb;padding:8px 10px;border-radius:8px;outline:none" />
        </div>
      </div>`;
    this.core.root.appendChild(this.root);
  await this._load();
    // Catégorie active par défaut (première si non définie)
    if(!this._activeCat){ const cats=[...this.grouped.keys()]; if(cats.length) this._activeCat=cats[0]; }
    this._renderTabs(); this._renderRoot(); this._updateStack(); this._updateBreadcrumb(); this._loaded=true; this._pollRooms();
    this._onKey = (e)=> this._handleKey(e);
    window.addEventListener('keydown', this._onKey);
    this.root.querySelector('#bm-back')?.addEventListener('click', ()=> this._goBack());
    // Responsive: recalculer la grille et re-render selon le niveau
    this._onResize = ()=>{
      try{
        this._applyResponsiveGrid();
        this._placePreview();
        if(this._level==='cat') this._renderCat(); else this._renderTabs();
      }catch{}
    };
  window.addEventListener('resize', this._onResize);
  this._applyResponsiveGrid();
  this._applyTopOffset();
  // Démarrer le chat global (lobby)
  try{ this._initLobbyChat(); }catch{}
  }
  dispose(){ window.removeEventListener('keydown', this._onKey); window.removeEventListener('resize', this._onResize); if(this._timer){ try{ clearInterval(this._timer); }catch{} this._timer=null; } try{ if(this._wsChat && this._chatZone){ this._wsChat.send('zone_unsub', { zone: this._chatZone }); } }catch{} try{ this._wsChat?.close?.(); }catch{} this._wsChat=null; this.root?.remove?.(); }
  update(){}
  render(ctx){ ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height); }
  async _load(){
    try{ const r=await this.api.get('/modes/index'); const arr=Array.isArray(r?.list)?r.list:[]; this.list=arr; if(!this.list.length) this._fallbackList(); this._group(); }
    catch{ this._fallbackList(); this._group(); }
  }
  _fallbackList(){
    // Fallback local si le serveur n'est pas joignable
    this.list = [
      { id:'daily_tspin_rush', title:'Daily — T-Spin Rush', description:"Série d’exos T-Spin (offline)", category:'Training', visibility:'public', mode:'solo' },
      { id:'sprint_40l', title:'Sprint 40L', description:'Détruisez 40 lignes (offline)', category:'Time Attack', visibility:'public', mode:'solo' },
      { id:'br10', title:'Battle Royale 10', description:'Affrontement 1v1 (multi)', category:'Battle Royale', visibility:'public', mode:'multi' },
    ];
  }
  _group(){ this.grouped.clear(); for(const it of this.list){ const k=it.category||'Autres'; if(!this.grouped.has(k)) this.grouped.set(k,[]); this.grouped.get(k).push(it); } }
  _renderTabs(){
  const el = this.root.querySelector('#bm-tabs'); if(!el) return; el.innerHTML='';
  // Barre latérale supprimée: ne rien rendre ici.
  }
  _highlightTab(){
    const el=this.root.querySelector('#bm-tabs'); if(!el) return; const tabs=el.querySelectorAll('.bm-tab'); tabs.forEach(b=> b.classList.remove('active'));
    if(this._level==='cat'){
      const idx=this._catSelIdx|0; const cur=tabs[idx]; if(cur) cur.classList.add('active');
    }
  }
  _renderRoot(){
    const host = this.root.querySelector('#bm-root'); if(!host) return; host.innerHTML='';
    const hdr = document.createElement('div'); hdr.className='bm-hdr'; hdr.textContent='Modes'; host.appendChild(hdr);
    let cats=[...this.grouped.keys()];
    // Prioriser les 3 catégories principales
    const mainCats=['Training','Time Attack','Battle Royale'];
    const mainPresent=mainCats.filter(c=> this.grouped.has(c));
    cats = mainPresent.length ? mainPresent : cats;
    if(!cats.length){
      // Fallback dur si aucune catégorie n’est chargée
      this._fallbackList(); this._group(); cats=[...this.grouped.keys()];
    }
    const grid=document.createElement('div'); grid.className='bm-cats-grid'; host.appendChild(grid);
    cats.forEach((cat,i)=>{
      const panel=document.createElement('div'); panel.className='bm-cat-panel'; grid.appendChild(panel);
      const title=document.createElement('div'); title.className='bm-cat-title';
      title.innerHTML = `<span>${escapeHtml(cat)}</span>`; panel.appendChild(title);
      const openBtn=document.createElement('button'); openBtn.className='bm-cat-open'; openBtn.textContent='Ouvrir'; openBtn.addEventListener('click', ()=> this._openCat(cat)); title.appendChild(openBtn);
      const list=document.createElement('div'); panel.appendChild(list);
      const items=(this.grouped.get(cat)||[]).slice(0,4); // aperçu de quelques items
      items.forEach((it)=>{
        const row=document.createElement('div'); row.className='bm-row'; Object.assign(row.style,{ padding:'8px 10px', display:'flex', gap:'8px', alignItems:'start', cursor:'pointer' });
        row.innerHTML = `<div style="flex:1 1 auto"><div style="font-weight:600">${escapeHtml(it.title)}</div><div style="opacity:.8">${escapeHtml(it.description||'')}</div></div><div style="opacity:.7;font-size:12px">${it.mode==='solo'?'Solo':'Multi'}</div>`;
        row.addEventListener('mouseenter', ()=>{ this._lastHoverItem=it; this._prefetch(it.id); this._updatePreview(it); });
        row.addEventListener('click', ()=> this._openCat(cat));
        list.appendChild(row);
      });
      if((this.grouped.get(cat)||[]).length>items.length){ const more=document.createElement('div'); more.style.cssText='padding:6px 10px;opacity:.7;font-size:12px'; more.textContent='…'; panel.appendChild(more); }
    });
    if(!cats.length){ const empty=document.createElement('div'); empty.style.cssText='padding:6px 12px;color:#64748b;opacity:.9'; empty.textContent='Aucun mode disponible'; host.appendChild(empty); }
    this._setStage('root');
    this._updateRootClass();
    this._applySelection('#bm-root');
  }
  _openRooms(){ this._activeCat='Battle Royale'; this._level='cat'; this._highlightTab(); this._renderCat(); }
  _renderRoomsLevel(){
    const host = this.root.querySelector('#bm-cat'); if(!host) return; host.innerHTML='';
    const h = document.createElement('div'); h.className='bm-hdr'; h.textContent='Salles actives'; host.appendChild(h);
    if(this._rooms.length){
      this._rooms.forEach((r,i)=>{
        const row=document.createElement('div'); row.className='bm-row'; row.setAttribute('data-idx', String(i)); Object.assign(row.style,{ padding:'8px 12px', display:'flex', gap:'8px', alignItems:'start', cursor:'pointer' });
        row.innerHTML = `<div style="flex:1 1 auto"><div style="font-weight:600">Salon ${escapeHtml(r.id)}</div><div style="opacity:.8">${(r.count||0)}/2 joueurs ${r.started?'(en cours)':''}</div></div><div style="opacity:.7;font-size:12px">Rejoindre</div>`;
        row.addEventListener('mouseenter', ()=>{ this._roomSelIdx=i; this._applySelection('#bm-cat'); });
        row.addEventListener('click', ()=> this._joinRoom(r.id)); host.appendChild(row);
      });
    } else {
      const empty=document.createElement('div'); empty.style.cssText='padding:6px 12px;color:#64748b;opacity:.9'; empty.textContent='Aucune salle'; host.appendChild(empty);
    }
    this._setStage('cat','Salles'); this._updateStack();
    this._applySelection('#bm-cat');
  }
  _openCat(cat){ this._activeCat=cat; this._level='cat'; this._highlightTab(); this._renderCat(); }
  _renderCat(){
    const host = this.root.querySelector('#bm-cat'); if(!host) return; host.innerHTML='';
  const h = document.createElement('div'); h.className='bm-hdr';
  // Lien Retour uniquement (le titre est déjà dans le breadcrumb)
  const backLink=document.createElement('a'); backLink.href='#'; backLink.textContent='Retour'; backLink.style.cssText='margin-right:12px';
  backLink.addEventListener('click', (e)=>{ e.preventDefault(); this._goBack(); });
  h.appendChild(backLink); host.appendChild(h);
  const items = this._catItems();
    // Définit la sélection par défaut
    if(this._catSelIdx<0 || this._catSelIdx>=items.length) this._catSelIdx=0;
    const current = items[this._catSelIdx] || null; this._lastHoverItem=current||null;
    // Rendu du contenu du mode sélectionné
    // Afficher des onglets HORIZONTAUX en HAUT (toutes largeurs)
    const tabs=document.createElement('div'); tabs.className='bm-top-tabs';
    items.forEach((it, idx)=>{
      const tb=document.createElement('button'); tb.className='ttab'; tb.textContent=it.title; if(this._catSelIdx===idx) tb.classList.add('active');
      tb.addEventListener('click', ()=>{ this._catSelIdx=idx; this._lastHoverItem=it; if(it.special==='rooms'){ this._renderRoomsInside(); } else if(it.special==='create_br'){ this._renderCreateBR(); } else { this._renderCatContent(it); } this._renderCat(); });
      tabs.appendChild(tb);
    });
    host.appendChild(tabs);
    const content=document.createElement('div'); content.id='bm-cat-content'; content.style.cssText='padding:12px'; host.appendChild(content);
  this._setStage('cat', this._activeCat); this._updateStack();
  this._renderTabs(); // onglets verticaux = items de la catégorie
  if(current?.special==='rooms') this._renderRoomsInside();
  else if(current?.special==='create_br') this._renderCreateBR();
  else this._renderCatContent(current);
  // Repositionner la preview selon la largeur
  this._placePreview();
  // Basculer le chat en "Zone" quand on est dans une catégorie (hors racine)
  try{
    const scopeSel=this.root.querySelector('#bm-chat-scope');
    if(scopeSel){
      // Si on est dans Battle Royale, forcer Zone; sinon laisser Global possible
      this._chatKind='zone';
      scopeSel.value='zone';
      this._chatZone = this._activeCat ? `zone/${this._activeCat}` : 'zone/General';
      this._chatMsgs=[];
      if(this._wsChat){ try{ this._wsChat.send('zone_sub', { zone: this._chatZone }); }catch{} }
      this._renderChat();
    }
  }catch{}
  }
  _renderCatContent(it){
    const box=this.root.querySelector('#bm-cat #bm-cat-content'); if(!box) return; box.innerHTML='';
    if(!it){ box.innerHTML = '<div style="opacity:.7">Aucun mode</div>'; return; }
    // preview à droite
    this._prefetch(it.id); this._updatePreview(it);
    const title=document.createElement('div'); title.style.cssText='font-weight:700;font-size:16px;margin-bottom:6px'; title.textContent=it.title; box.appendChild(title);
    const desc=document.createElement('div'); desc.style.cssText='opacity:.85;margin-bottom:12px'; desc.textContent=it.description||''; box.appendChild(desc);
    const meta=document.createElement('div'); meta.style.cssText='opacity:.75;margin-bottom:12px;font-size:12px'; meta.textContent = it.mode==='solo'?'Solo':'Multi'; box.appendChild(meta);
    const actions=document.createElement('div'); actions.style.cssText='display:flex;gap:8px;align-items:center';
    const play=document.createElement('button'); play.textContent='Lancer'; play.className='bm-tab'; play.style.cssText='width:auto;padding:8px 12px;background:rgba(148,163,184,.12)'; play.addEventListener('click', ()=> this._launch(it)); actions.appendChild(play);
    box.appendChild(actions);
  }
  _setStage(level, title){
    this._level = level||this._level; const stage=this.root.querySelector('#bm-stage'); const back=this.root.querySelector('#bm-back'); const titleEl=this.root.querySelector('#bm-title');
    if(stage){ stage.style.transform = (this._level==='root') ? 'translateX(0%)' : 'translateX(-50%)'; }
    if(back){ back.style.display = (this._level==='root') ? 'none' : ''; }
  // Masquer le titre (on garde seulement le breadcrumb)
  if(titleEl){ titleEl.textContent = ''; titleEl.style.display='none'; }
    this._applyResponsiveGrid();
    this._updateRootClass();
  this._renderTabs();
      this._updateBreadcrumb();
    this._placePreview();
    // Ajuster le scope de chat quand on change de niveau
    try{
      const scopeSel=this.root.querySelector('#bm-chat-scope');
      if(scopeSel){
        if(this._level==='root'){
          // revenir au chat global
          if(this._wsChat && this._chatZone){ try{ this._wsChat.send('zone_unsub', { zone: this._chatZone }); }catch{} }
          this._chatZone=null; this._chatKind='global'; scopeSel.value='global'; this._chatMsgs=[]; this._renderChat();
        }
      }
    }catch{}
  }
  _startEmbeddedLobby({ modeId, title }){
    try{ this._disposeEmbeddedLobby(); }catch{}
    const prev = this.root.querySelector('#bm-preview'); if(!prev) return;
    prev.innerHTML = `
      <h2 style="margin:0 0 8px;font-size:16px;color:#93c5fd">${escapeHtml(title||'Battle')}</h2>
      <div id="emb-lobby" class="emb">
        <div class="row"><span>Salon:</span> <code id="emb-room">—</code></div>
        <div class="row"><span>Moi:</span> <strong>(prêt: <span id="emb-me">non</span>)</strong></div>
        <div class="row"><span>Adversaire:</span> <strong>(prêt: <span id="emb-peer">non</span>)</strong></div>
        <div class="row" style="gap:8px">
          <button id="emb-ready" class="btn primary">Je suis prêt</button>
          <button id="emb-leave" class="btn">Quitter</button>
        </div>
        <div id="emb-log" class="log" aria-live="polite"></div>
        <input id="emb-input" class="input" placeholder="Message…" />
      </div>`;
    const st = document.createElement('style'); st.textContent = `
      #bm-preview .emb{ display:flex; flex-direction:column; gap:10px }
      #bm-preview .row{ display:flex; align-items:center; gap:10px }
      #bm-preview .btn{ border:0; background:#0f141a; color:#e5e7eb; padding:8px 12px; border-radius:10px; cursor:pointer; }
      #bm-preview .btn.primary{ background:#0ea5e9; color:#0b0f14; }
      #bm-preview .log{ height:160px; overflow:auto; background:rgba(255,255,255,.03); border-radius:8px; padding:8px; font:13px system-ui; }
      #bm-preview .input{ width:100%; border:1px solid rgba(148,163,184,.25); background:#0f141a; color:#e5e7eb; padding:8px 10px; border-radius:8px; }
    `; prev.appendChild(st);

    // Connexion WS + création de salon
    const ws = new RealtimeClient(); ws.connect(wsUrl());
    const { pid, cid, name } = ensureIdentity();
    try{ ws.send('hello', { name, pid, cid }); ws.send('ping', { cid }); }catch{}
    ws.send('create', { name: `${title||'Battle'} — ${name}`, ownerName: name, ownerTop: 0, modeId: modeId||null });
    const emb = this._emb = { ws, room:null, selfId:null, ready:false, peerReady:false, chat:[], rootEl: prev };
    const setTxt=(sel,txt)=>{ try{ const n=prev.querySelector(sel); if(n) n.textContent=txt; }catch{} };
    const render=()=>{
      setTxt('#emb-me', emb.ready?'oui':'non');
      setTxt('#emb-peer', emb.peerReady?'oui':'non');
      const box=prev.querySelector('#emb-log'); if(box){ box.innerHTML = emb.chat.map(x=>`<div>${x}</div>`).join(''); box.scrollTop = box.scrollHeight; }
    };
    this._off.push(ws.on('joined', (m)=>{ emb.room=m.room; emb.selfId=m.selfId; setTxt('#emb-room', m.room); }));
    this._off.push(ws.on('ready', (m)=>{ if(m.who && m.who!==emb.selfId) emb.peerReady = !!m.ready; render(); }));
    this._off.push(ws.on('chat', (m)=>{ const from = m.from||'Lui'; const t = String(m.text||''); if(t){ emb.chat.push(`${from}: ${escapeHtml(t)}`); render(); } }));
    this._off.push(ws.on('emote', (m)=>{ const t = String(m.emoji||''); if(t){ emb.chat.push(`${escapeHtml(t)}`); render(); } }));
    this._off.push(ws.on('start', async (m)=>{ const mod = await import('./MultiplayerGameScreen.js'); this.core.sm.replace(new mod.MultiplayerGameScreen(this.core, { ws, meta: { room: emb.room, selfId: emb.selfId, started:true } })); }));
    prev.querySelector('#emb-ready')?.addEventListener('click', ()=>{ emb.ready=!emb.ready; try{ ws.send('ready', { ready: emb.ready }); }catch{} render(); });
    prev.querySelector('#emb-leave')?.addEventListener('click', ()=>{ this._disposeEmbeddedLobby(true); });
    const inp = prev.querySelector('#emb-input');
    inp?.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ const v=String(inp.value||'').slice(0,280); if(v){ try{ ws.send('chat', { text:v }); }catch{} emb.chat.push(`Moi: ${escapeHtml(v)}`); inp.value=''; render(); } } });
    render();
  }
  _disposeEmbeddedLobby(closeRoom=false){
    const emb = this._emb; if(!emb) return; this._emb=null;
    try{ if(closeRoom){ emb.ws?.send?.('close', {}); } }catch{}
    try{ emb.ws?.close?.(); }catch{}
    const prev = this.root?.querySelector('#bm-preview'); if(prev){
      prev.innerHTML = `
        <h2 style="margin:0 0 8px;font-size:16px;color:#93c5fd">Aperçu</h2>
        <div id="bm-details" style="opacity:.9">Survolez un mode pour voir les détails.</div>
        <div style="margin-top:12px;opacity:.7">Esc: Retour</div>
        <div style="height:1px;background:var(--bd);margin:12px 0 10px"></div>
        <h2 style="margin:0 0 8px;font-size:16px;color:#93c5fd;display:flex;align-items:center;gap:8px">Chat <span id="bm-chat-online" style="opacity:.75;font-weight:500;font-size:12px"></span></h2>
        <div id="bm-chat-box" style="display:flex;flex-direction:column;gap:8px">
          <div id="bm-chat-log" style="height:150px;overflow:auto;background:rgba(255,255,255,.03);border-radius:8px;padding:8px;font:13px system-ui"></div>
          <input id="bm-chat-input" placeholder="Message…" style="width:100%;border:1px solid rgba(148,163,184,.25);background:#0f141a;color:#e5e7eb;padding:8px 10px;border-radius:8px;outline:none" />
        </div>`;
      try{ this._initLobbyChat(); }catch{}
    }
  }
  _initLobbyChat(){
    if(this._wsChat) return;
    const ws = new RealtimeClient();
    const url = wsUrl();
    ws.connect(url);
    const id = ensureIdentity();
    // Envoyer hello/ping une fois qu'on est prêt
    setTimeout(()=>{ try{ ws.send('hello', { name: id.name, pid: id.pid, cid: id.cid }); ws.send('ping', { cid: id.cid }); }catch{} }, 50);
    // Messages lobby (global)
    this._off.push(ws.on('lobby_chat', (m)=>{ if(this._chatKind!=='global') return; const from = m.from||'Player'; const t = String(m.text||''); if(t){ this._chatMsgs.push({ from, t }); this._renderChat(); } }));
    // Messages zone
    this._off.push(ws.on('zone_chat', (m)=>{ if(this._chatKind!=='zone') return; const z=String(m.zone||''); if(!this._chatZone || z!==this._chatZone) return; const from=m.from||'Player'; const t=String(m.text||''); if(t){ this._chatMsgs.push({ from, t }); this._renderChat(); } }));
    // Nombre de joueurs en ligne
    this._off.push(ws.on('players', (m)=>{ try{ const n = Array.isArray(m.players)? m.players.length : 0; this._chatOnline = n; this._renderChat(); }catch{} }));
    // Bind input
    const inp = this.root.querySelector('#bm-chat-input');
    inp?.addEventListener('keydown', (e)=>{
      if(e.key==='Enter'){
        const val = String(inp.value||'').slice(0,280);
        if(!val) return;
        if(this._chatKind==='global'){ ws.send('lobby_chat', { text: val }); }
        else if(this._chatKind==='zone' && this._chatZone){ ws.send('zone_chat', { zone: this._chatZone, text: val }); }
        inp.value='';
      }
    });
    // Scope selector
    const scopeSel = this.root.querySelector('#bm-chat-scope');
    scopeSel?.addEventListener('change', ()=>{
      this._chatKind = scopeSel.value==='zone' ? 'zone' : 'global';
      this._chatMsgs = [];
      if(this._chatKind==='zone'){
        // Abonner à la zone de la catégorie actuelle
        this._chatZone = this._activeCat ? `zone/${this._activeCat}` : 'zone/General';
        try{ ws.send('zone_sub', { zone: this._chatZone }); }catch{}
      } else {
        // Se désabonner de la zone si besoin
        if(this._chatZone){ try{ ws.send('zone_unsub', { zone: this._chatZone }); }catch{} }
      }
      this._renderChat();
    });
    this._wsChat = ws;
    this._renderChat();
  }
  _renderChat(){
    const box = this.root?.querySelector('#bm-chat-log'); if(!box) return;
    const online = this.root?.querySelector('#bm-chat-online'); if(online) online.textContent = this._chatOnline? `(${this._chatOnline} en ligne)` : '';
    const items = this._chatMsgs.slice(-200);
    box.innerHTML = items.map(m=>`<div><span style="opacity:.8">${escapeHtml(m.from)}:</span> ${escapeHtml(m.t)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  }
  _placePreview(){
    const prev = this.root.querySelector('#bm-preview'); if(!prev) return;
    const narrow = this._isNarrow();
    if(narrow){
      // En mode étroit, mettre la preview sous le contenu courant
      if(this._level==='cat'){
        const target = this.root.querySelector('#bm-cat #bm-cat-content');
        if(target && prev.parentElement!==target){ target.appendChild(prev); prev.style.marginTop='16px'; }
      } else if(this._level==='root'){
        const target = this.root.querySelector('#bm-root');
        if(target && prev.parentElement!==target){ target.appendChild(prev); prev.style.marginTop='16px'; }
      }
    } else {
      // En mode large/moyen, replacer la preview dans la grille principale (colonne de droite)
      if(prev.parentElement!==this.root){ this.root.appendChild(prev); prev.style.marginTop='0'; }
    }
  }
  _applyResponsiveGrid(){
    const w = window.innerWidth || 1200;
    const narrow = w < 900; const medium = w < 1200;
    this._applyTopOffset();
    if(this._level==='root'){
      // Root: sur petit écran, masquer l’aperçu; sur très petit, full-width
  if(narrow) this.root.style.gridTemplateColumns = '0px 0px 1fr 0px';
  else if(medium) this.root.style.gridTemplateColumns = '0px 0px 1fr 0px';
      else this.root.style.gridTemplateColumns = '0px 0px 1fr 1fr';
    } else {
      // Cat: supprimer la barre verticale; utiliser uniquement contenu (+ aperçu large)
      if(narrow) this.root.style.gridTemplateColumns = '0px 0px 1fr 0px';
      else if(medium) this.root.style.gridTemplateColumns = '0px 0px 1fr 0px';
      else this.root.style.gridTemplateColumns = '0px 0px 1fr 1fr';
    }
  }
  _applyTopOffset(){
    try{
      const topbar = document.getElementById('topbar');
      const visible = !!topbar && getComputedStyle(topbar).display !== 'none';
      const h = visible ? Math.ceil(topbar.getBoundingClientRect().height||0) : 0;
      this.root.style.top = h ? `${h}px` : '0';
    }catch{}
  }
  _isNarrow(){ try{ return (window.innerWidth||0) < 900; }catch{ return false; } }
    _updateBreadcrumb(){
      const el=this.root.querySelector('#bm-breadcrumb'); if(!el) return; el.innerHTML='';
      const home=document.createElement('a'); home.textContent='Modes'; home.href='#'; home.addEventListener('click',(e)=>{ e.preventDefault(); this._goBackToRoot?.()||this._goBack(); }); el.appendChild(home);
      if(this._level==='cat' && this._activeCat){ const sep=document.createElement('span'); sep.textContent='›'; sep.style.opacity='.6'; sep.style.padding='0 2px'; el.appendChild(sep); const leaf=document.createElement('span'); leaf.textContent=this._activeCat; el.appendChild(leaf); }
      if(this._level==='rooms'){ const sep=document.createElement('span'); sep.textContent='›'; sep.style.opacity='.6'; sep.style.padding='0 2px'; el.appendChild(sep); const leaf=document.createElement('span'); leaf.textContent='Battle Royale'; el.appendChild(leaf); }
    }
  _goBack(){ if(this._level==='root'){ this.core.navigateHome?.() || this.core.goHome?.(); return; } this._activeCat=null; this._level='root'; this._highlightTab(); this._setStage('root','Modes'); this._updateStack(); }
  _updateRootClass(){ if(!this.root) return; const isRoot=this._level==='root'; this.root.classList.toggle('is-root', isRoot); this.root.classList.toggle('is-sub', !isRoot); }
  _updateStack(){
    const stack=this.root.querySelector('#bm-stack'); if(!stack) return; stack.innerHTML='';
    // En sous-menu, le panneau central est inutile (les items sont dans la barre de gauche)
    // On laisse vide pour conserver la structure DOM, mais la colonne est à 0px.
  }
  _handleKey(e){
    if(e.key==='Escape'){ if(this._level!=='root'){ this._goBack(); } else { this.core.navigateHome?.() || this.core.goHome?.(); } return; }
    if(e.key==='Enter'){
      if(this._level==='cat'){
        const items=this._catItems(); const it=items[this._catSelIdx]; if(it){
          if(it.special==='rooms'){ this._renderRoomsInside(); return; }
          if(it.special==='create_br'){ this._renderCreateBR(); return; }
          this._launch(it); return;
        }
      }
      if(this._level==='rooms' && this._rooms?.length){ const idx=Math.max(0,Math.min(this._roomSelIdx, this._rooms.length-1)); this._joinRoom(this._rooms[idx].id); return; }
      if(this._level==='root'){ const cats=[...this.grouped.keys()]; if(cats.length){ const cat=cats[Math.max(0,Math.min(this._rootCatSelIdx, cats.length-1))]; this._openCat(cat); return; } }
    }
    if(e.key==='ArrowUp' || e.key==='ArrowDown'){
      const dir = e.key==='ArrowUp' ? -1 : 1;
      if(this._level==='cat'){
        const items = this.grouped.get(this._activeCat)||[]; if(!items.length) return;
        this._catSelIdx = Math.max(0, Math.min(this._catSelIdx + dir, items.length-1));
        this._lastHoverItem = items[this._catSelIdx];
        this._highlightTab(); this._renderCatContent(this._lastHoverItem);
        return;
      }
      if(this._level==='rooms'){
        if(!this._rooms.length) return; this._roomSelIdx = Math.max(0, Math.min(this._roomSelIdx + dir, this._rooms.length-1)); this._applySelection('#bm-cat'); return;
      }
      if(this._level==='root'){
        const cats=[...this.grouped.keys()]; if(!cats.length) return; this._rootCatSelIdx = Math.max(0, Math.min(this._rootCatSelIdx + dir, cats.length-1)); this._applySelection('#bm-root'); return;
      }
    }
  }
  _catItems(){
    const base = this.grouped.get(this._activeCat)||[];
    if((this._activeCat||'').toLowerCase().includes('battle')){
      const specials = [
        { id:'__rooms__', title:'Salles (BR)', special:'rooms' },
        { id:'__create__', title:'Créer un BR', special:'create_br' },
      ];
      return [...specials, ...base];
    }
    return base;
  }
  _renderRoomsInside(){
    const host=this.root.querySelector('#bm-cat #bm-cat-content'); if(!host) return; host.innerHTML='';
    const h=document.createElement('div'); h.style.cssText='font-weight:700;font-size:16px;margin-bottom:10px;color:#93c5fd'; h.textContent='Salles Battle Royale'; host.appendChild(h);
    if(this._rooms.length){
      this._rooms.forEach((r)=>{
        const row=document.createElement('div'); row.className='bm-row'; Object.assign(row.style,{ padding:'8px 12px', display:'flex', gap:'8px', alignItems:'start', cursor:'pointer', border:'1px solid var(--bd)', borderRadius:'8px', marginBottom:'8px', background:'rgba(10,15,25,.35)' });
        row.innerHTML = `<div style="flex:1 1 auto"><div style="font-weight:600">Salon ${escapeHtml(r.id)}</div><div style="opacity:.8">${(r.count||0)}/2 joueurs ${r.started?'(en cours)':''}</div></div><div style="opacity:.7;font-size:12px">Rejoindre</div>`;
        row.addEventListener('click', ()=> this._joinRoom(r.id)); host.appendChild(row);
      });
    } else {
      const empty=document.createElement('div'); empty.style.cssText='padding:6px 12px;color:#64748b;opacity:.9'; empty.textContent='Aucune salle'; host.appendChild(empty);
    }
  }
  _renderCreateBR(){
    const host=this.root.querySelector('#bm-cat #bm-cat-content'); if(!host) return; host.innerHTML='';
    const h=document.createElement('div'); h.style.cssText='font-weight:700;font-size:16px;margin-bottom:10px;color:#93c5fd'; h.textContent='Créer un Battle Royale'; host.appendChild(h);
    // Lister les modes BR (multi) disponibles dans la catégorie
    const modes = (this.grouped.get(this._activeCat)||[]).filter(x=> (x.mode||'')==='multi');
    if(!modes.length){ const p=document.createElement('div'); p.style.cssText='opacity:.8'; p.textContent='Aucun mode BR disponible.'; host.appendChild(p); return; }
    const selWrap=document.createElement('div'); selWrap.style.cssText='display:flex;gap:8px;align-items:center;margin:8px 0 12px';
    const lab=document.createElement('label'); lab.textContent='Mode: '; lab.style.cssText='opacity:.9'; selWrap.appendChild(lab);
    const sel=document.createElement('select'); sel.style.cssText='background:#0f141a;color:#e5e7eb;border:1px solid var(--bd);border-radius:8px;padding:6px 8px;';
    modes.forEach(m=>{ const o=document.createElement('option'); o.value=m.id; o.textContent=m.title; sel.appendChild(o); }); selWrap.appendChild(sel);
    host.appendChild(selWrap);
    const act=document.createElement('div'); act.style.cssText='margin-top:6px;display:flex;gap:10px;align-items:center';
    const btn=document.createElement('button'); btn.textContent='Créer'; btn.className='bm-tab'; btn.style.cssText='width:auto;padding:8px 12px;background:rgba(148,163,184,.12)';
    btn.addEventListener('click', async ()=>{
      const modeId=sel.value; if(!modeId) return;
      const mod = await import('./BattleLobbyScreen.js');
      const title = `BR — ${modes.find(m=>m.id===modeId)?.title||'Battle'}`;
      this.core.sm.replace(new mod.BattleLobbyScreen(this.core, { modeId, title }));
    });
    act.appendChild(btn); host.appendChild(act);
    // Aide
  const help=document.createElement('div'); help.style.cssText='opacity:.75;margin-top:10px;font-size:12px'; help.textContent='Après création, un salon s’ouvre en overlay avec chat de partie.'; host.appendChild(help);
  }
  // API inchangée (préfetch/lancement/preview)
  _itemAt(i){ let n=-1; for(const cat of this.grouped.values()){ for(const it of cat){ n++; if(n===i) return it; } } return null; }
  _select(i){ this.selIdx=Math.max(0,Math.min(i, (this.list?.length||1)-1)); /* legacy keyboard sel */ }
  async _prefetch(id){ if(!id || this._hoverCache.has(id)) return; try{ const cfg=await this.api.get(`/modes/${encodeURIComponent(id)}`); this._hoverCache.set(id, cfg); if(this._itemAt(this.selIdx)?.id===id) this._updatePreview(this._itemAt(this.selIdx)); }catch{ this._hoverCache.set(id, this._fallbackCfg(id)); } }
  _updatePreview(it){ const box=this.root.querySelector('#bm-details'); if(!box) return; if(!it){ box.textContent=''; return; } const cfg = this._hoverCache.get(it.id); if(!cfg){ box.textContent = `${it.title}\n${it.description||''}`; return; } try{ box.innerHTML = `<div style=\"font-weight:600;margin-bottom:4px\">${cfg.title}</div><div style=\"opacity:.85\">${cfg.description||''}</div><div style=\"margin-top:8px;opacity:.75\">Règles: lock=${cfg.rules?.speed?.lockDelayMs||500}ms, DAS=${cfg.rules?.inputs?.dasMs||110}ms, ARR=${cfg.rules?.inputs?.arrMs||10}ms</div>`; }catch{ box.textContent = `${it.title}`; }
  }
  _pollRooms(){
    clearTimeout(this._timer);
    const tick = async()=>{
      try{
        const r = await this.api.get('/rooms');
        this._rooms = Array.isArray(r?.rooms) ? r.rooms : [];
        if(this._level==='root'){
          this._renderRoot();
        } else if(this._level==='rooms'){
          this._renderRoomsLevel();
        } else if(this._level==='cat'){
          // Si l’onglet actif est "Salles (BR)", re-render dedans
          try{
            const items = this._catItems();
            const cur = items[this._catSelIdx];
            if(cur && cur.special==='rooms'){ this._renderRoomsInside(); }
          }catch{}
        }
      }catch{}
      finally{
        this._timer = setTimeout(tick, 4000);
      }
    };
    tick();
  }
  _joinRoom(id){ try{ this.core.goto?.('battle-lobby', { roomId:id }) || this.core.startBattleLobby?.(id); }catch(e){ console.warn('joinRoom failed', e); }
  }
  async _launch(it){
    try{
      const cfg = await this.api.get(`/modes/${encodeURIComponent(it.id)}`);
      // Si mode multi -> passer par le lobby Battle, sinon Solo/Training
      if((cfg.mode||it.mode)==='multi'){
        const mod = await import('./BattleLobbyScreen.js');
        this.core.sm.replace(new mod.BattleLobbyScreen(this.core, { modeId: it.id, title: cfg.title||it.title }));
      } else {
        const mf = await import('../modes/modeFactory.js');
        const { rules, objectives } = mf.modeFactory.fromConfig(cfg);
        const useTraining = (it.category||'').toLowerCase().includes('training') || it.id==='daily_tspin_rush';
        if(useTraining) this.core.sm.replace(new TrainingScreen(this.core, { rules, objectives }));
        else this.core.sm.replace(new SoloScreen(this.core, { rules, objectives }));
      }
      try{ document.getElementById('topbar')?.classList.remove('hidden'); }catch{}
    }catch{
      // Fallback offline
      const cfg = this._fallbackCfg(it.id);
      if(cfg && (cfg.mode||it.mode)!=='multi'){
        const mf = await import('../modes/modeFactory.js');
        const { rules, objectives } = mf.modeFactory.fromConfig(cfg);
        const useTraining = (it.category||'').toLowerCase().includes('training') || it.id==='daily_tspin_rush';
        if(useTraining) this.core.sm.replace(new TrainingScreen(this.core, { rules, objectives }));
        else this.core.sm.replace(new SoloScreen(this.core, { rules, objectives }));
        try{ document.getElementById('topbar')?.classList.remove('hidden'); }catch{}
      }
    }
  }
  _applySelection(scopeSel){
    const scope=this.root.querySelector(scopeSel); if(!scope) return;
    scope.querySelectorAll('.bm-row').forEach(n=> n.classList.remove('sel'));
    if(scopeSel==='#bm-cat' && this._level==='rooms'){
      const idx=this._roomSelIdx|0; const el=scope.querySelector(`.bm-row[data-idx="${idx}"]`); if(el) el.classList.add('sel'); return;
    }
    if(scopeSel==='#bm-cat' && this._level==='cat'){
      // Rien ici, la sélection d’item se fait via onglets; on garde la preview à droite
      return;
    }
    if(scopeSel==='#bm-root' && this._level==='root'){
      const idx=this._rootCatSelIdx|0; const el=scope.querySelector(`.bm-row[data-idx="${idx}"]`); if(el) el.classList.add('sel'); return;
    }
  }
  _fallbackCfg(id){
    if(id==='daily_tspin_rush') return { id, version:1, title:'Daily — T-Spin Rush', description:'Offline', visibility:'public', mode:'solo', lobby:{minPlayers:1,maxPlayers:1,seedPolicy:'perPlayer'}, rules:{ attackTable:{ single:0,double:1,triple:2,tetris:4, tspin:{single:2,double:4,triple:6}, backToBackBonus:1, comboTable:[0,1,1,2,2,3,3,4,4,5] }, garbage:{ delayMs:600, telegraphMs:600, messiness:0.35, cancelPolicy:'net' }, speed:{ lockDelayMs:500, gravityCurve:[{t:0,gravity:1}] }, inputs:{ dasMs:110, arrMs:10, allow180:true, allowHold:true, holdConsumesLock:true }, badges:{ enabled:false } }, objectives:{ winCondition:'first_to_objectives', targets:{ survive:{ seconds:9999 } } }, leaderboard:{ scope:'none', scoring:'score' } };
    if(id==='sprint_40l') return { id, version:1, title:'Sprint 40L', description:'Offline', visibility:'public', mode:'solo', lobby:{minPlayers:1,maxPlayers:1,seedPolicy:'perPlayer'}, rules:{ attackTable:{ single:0,double:0,triple:0,tetris:0, tspin:{single:0,double:0,triple:0}, backToBackBonus:0, comboTable:[0,0,0,0,0] }, garbage:{ delayMs:0, telegraphMs:0, messiness:0, cancelPolicy:'net' }, speed:{ lockDelayMs:500, gravityCurve:[{t:0,gravity:1}] }, inputs:{ dasMs:110, arrMs:10, allow180:true, allowHold:true, holdConsumesLock:true }, badges:{ enabled:false } }, objectives:{ winCondition:'first_to_objectives', targets:{ lines_cleared:{ count:40 } } }, leaderboard:{ scope:'none', scoring:'time' } };
    return null;
  }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
// Helpers duplicés (évite une dépendance transversale)
function ensureIdentity(){
  const gen=(p)=> p+Math.random().toString(36).slice(2,8).toUpperCase()+'-'+Date.now().toString(36).toUpperCase();
  let pid=null,cid=null,name=null;
  try{ pid=localStorage.getItem('texid_pid'); if(!pid){ pid=gen('P'); localStorage.setItem('texid_pid',pid);} }catch{}
  try{ cid=sessionStorage.getItem('texid_cid'); if(!cid){ cid=gen('S'); sessionStorage.setItem('texid_cid',cid);} }catch{}
  try{ name=localStorage.getItem('texid_name')||'Player'; }catch{ name='Player'; }
  return { pid,cid,name };
}
function wsUrl(){
  try{
    const dev=!!(import.meta&&import.meta.env&&import.meta.env.DEV);
    const proto=location.protocol==='https:'?'wss':'ws';
    const host=dev?(location.hostname+':8787'):location.host;
    return `${proto}://${host}`;
  }catch{ return 'ws://localhost:8787'; }
}
