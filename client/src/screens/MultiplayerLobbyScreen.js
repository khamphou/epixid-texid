import { RealtimeClient } from '../core/realtimeClient.js';

// Lobby multi minimal: liste des salons + création/join, bascule vers l'écran de jeu
export class MultiplayerLobbyScreen{
	constructor(core){
		this.core = core;
		this.ws = null; // RealtimeClient
		this.rooms = [];
		this.players = [];
		this.sel = 0;
		this._tim = 0;
		this._handlers = [];
		this._pollTimer = 0;
		this._mouse = null;
		this._overlay = null;
		this._key = (e)=> this.onKey(e);
	}
	async init(){
		// Connexion WS
		const url = wsUrl();
		this.ws = new RealtimeClient();
		this.ws.connect(url);
		// Abonnements messages
		this._handlers.push(this.ws.on('rooms', (m)=>{ this.rooms = Array.isArray(m.rooms)? m.rooms : []; if(this.sel>=this.rooms.length) this.sel = Math.max(0,this.rooms.length-1); this.renderOverlay(); }));
		this._handlers.push(this.ws.on('players', (m)=>{ this.players = Array.isArray(m.players)? m.players : []; this.renderOverlay(); }));
		this._handlers.push(this.ws.on('joined', (m)=>{ this.startGame(m); }));
		this._handlers.push(this.ws.on('error', (m)=>{ this._toast = String(m.message||'Erreur'); setTimeout(()=> this._toast='', 1200); }));
			// Say hello (obligatoire côté serveur) et ping initial
			const { pid, cid, name } = ensureIdentity();
			this.ws.send('hello', { name, pid, cid });
			this.ws.send('ping', { cid });
		window.addEventListener('keydown', this._key);
			// Souris pour sélectionner / rejoindre
			const cvs = this.core.sm.canvas;
			this._onClick = (e)=> this.onClick(e);
			cvs.addEventListener('click', this._onClick);
			// Overlay UI legacy-like (DOM)
			this.mountOverlay();
			this.renderOverlay();
	}
	dispose(){
		window.removeEventListener('keydown', this._key);
		this._handlers.forEach(off=>{ try{ off(); }catch{} });
		this._handlers = [];
			try{ this.core.sm.canvas.removeEventListener('click', this._onClick); }catch{}
		try{ this._overlay?.remove?.(); this._overlay=null; }catch{}
	}
		update(dt){
			this._tim += dt;
			// Fallback REST sur /rooms si pas de WS update récent
			this._pollTimer += dt;
			if(this._pollTimer >= 2){ this._pollTimer = 0; refreshRoomsRest().then(list=>{ if(Array.isArray(list)) this.rooms = list; }).catch(()=>{}); }
		}
	render(ctx){
		// Le rendu se fait via l'overlay DOM; on garde un fond pour le canvas
		const { canvas } = ctx;
		ctx.fillStyle = '#0b0f14'; ctx.fillRect(0,0,canvas.width,canvas.height);
	}
	handleInput(){}

	onKey(e){
		if(e.key==='Escape'){ this.navigateHome(); return; }
		if(e.key==='ArrowDown'){ if(this.rooms.length){ this.sel = (this.sel+1)%this.rooms.length; } }
		else if(e.key==='ArrowUp'){ if(this.rooms.length){ this.sel = (this.sel-1+this.rooms.length)%this.rooms.length; } }
		else if(e.key==='n' || e.key==='N'){ this.create(); }
		else if(e.key==='Enter'){ this.joinSelected(); }
	}

	create(){
		const { name } = ensureIdentity();
		this.ws.send('create', { name: `Room of ${name}`, ownerName: name, ownerTop: 0 });
	}
	joinSelected(){ if(!this.rooms.length) return; const r = this.rooms[this.sel]; if(r?.id) this.ws.send('join', { room: r.id }); }

	async startGame(joinedMsg){
		const meta = { room: joinedMsg.room, selfId: joinedMsg.selfId, started: !!joinedMsg.started };
		const mod = await import('./MultiplayerGameScreen.js');
		this.core.sm.replace(new mod.MultiplayerGameScreen(this.core, { ws: this.ws, meta }));
	}
	navigateHome(){ try{ document.getElementById('btn-exit')?.click(); }catch{} }
		onClick(e){
			// calculer la ligne cliquée pour sélectionner/join
			const rect = this.core.sm.canvas.getBoundingClientRect();
			const x = e.clientX - rect.left; const y = e.clientY - rect.top;
			const xList = 60; const y0 = 120; const lh = 28;
			const idx = Math.floor((y - y0)/lh);
			if(idx>=0 && idx < this.rooms.length){ this.sel = idx; this.joinSelected(); }
		}

			// --- Overlay DOM (legacy-like) ---
			mountOverlay(){
				const el = document.createElement('div');
				el.id = 'mp-overlay';
				Object.assign(el.style, { position:'fixed', inset:'0', display:'grid', placeItems:'center', pointerEvents:'auto', zIndex: 20 });
				el.innerHTML = `
					<div class="mp-panel" role="dialog" aria-label="Multijoueurs">
						<h2 class="mp-title">Multijoueurs</h2>
						<div class="mp-toolbar">
							<div class="mp-tabs" role="tablist">
								<button class="mp-tab active" data-tab="rooms" role="tab" aria-selected="true">Parties</button>
								<button class="mp-tab" data-tab="players" role="tab" aria-selected="false">Joueurs</button>
							</div>
							<div class="mp-actions">
								<button id="mp-create" class="mp-btn primary">Créer une partie</button>
						<button id="mp-purge" class="mp-btn danger" title="Purger les salons (admin)">🧹</button>
						<button id="mp-exit" class="mp-btn" title="Accueil">⏹</button>
							</div>
						</div>
						<div class="mp-body">
							<ul id="mp-rooms" class="mp-list" role="list"></ul>
							<ul id="mp-players" class="mp-list hidden" role="list"></ul>
							<div id="mp-empty" class="mp-empty hidden">Aucun élément à afficher.</div>
						</div>
						<div class="mp-footer">
							<div class="mp-counters">
								<span class="chip">🗂️ Parties <strong id="mp-count-rooms">–</strong></span>
								<span class="chip">👤 Joueurs <strong id="mp-count-players">–</strong></span>
								<span class="chip">▶︎ Batailles <strong id="mp-count-battles">–</strong></span>
							</div>
						</div>
					</div>`;
				// Styles minimaux (rappel legacy)
				const st = document.createElement('style');
				st.textContent = `
					.mp-panel{ width:min(960px,90vw); background:linear-gradient(180deg, rgba(10,14,20,.92), rgba(10,14,20,.86)); color:#e5e7eb; border-radius:16px; box-shadow:0 10px 40px rgba(0,0,0,.5); padding:24px; }
					.mp-title{ margin:0 0 10px; font:600 28px Orbitron,system-ui; }
					.mp-toolbar{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,.03); border-radius:12px; }
					.mp-tabs{ display:flex; gap:8px; }
					.mp-tab{ border:0; background:#0f141a; color:#cbd5e1; padding:8px 12px; border-radius:10px; cursor:pointer; }
					.mp-tab.active{ background:#0b0f14; color:#e5e7eb; box-shadow: inset 0 0 0 1px rgba(148,163,184,.25); }
					.mp-actions{ display:flex; gap:10px; }
					.mp-btn{ border:0; background:#0f141a; color:#e5e7eb; padding:8px 12px; border-radius:10px; cursor:pointer; }
					.mp-btn.primary{ background:#0ea5e9; color:#0b0f14; }
					.mp-btn.danger{ background:#ef4444; color:#0b0f14; }
					.mp-body{ padding:16px 8px; max-height:52vh; overflow:auto; }
					.mp-list{ list-style:none; margin:0; padding:0; display:grid; gap:12px; }
					.mp-room{ padding:14px; background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.02)); border-radius:12px; display:flex; align-items:center; justify-content:space-between; box-shadow: inset 0 0 0 1px rgba(148,163,184,.12); }
					.mp-room h3{ margin:0 0 6px; font:600 16px system-ui; color:#e2e8f0; }
					.mp-room .meta{ font:12px system-ui; color:#94a3b8; display:flex; gap:10px; align-items:center; }
					.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:12px; color:#a3b2c2; }
					.badge{ display:inline-block; padding:2px 8px; border-radius:999px; font:600 11px system-ui; }
					.badge.open{ background:#064e3b; color:#d1fae5; }
					.badge.running{ background:#4c0519; color:#fecdd3; }
					.muted{ opacity:.9 }
					.mp-room .actions{ display:flex; gap:8px; }
					.mp-btn[disabled]{ opacity:.5; cursor:not-allowed; }
					.chip{ background:#0f141a; color:#cbd5e1; padding:6px 10px; border-radius:999px; box-shadow: inset 0 0 0 1px rgba(148,163,184,.2); }
					.mp-empty{ padding:20px; color:#94a3b8; text-align:center; }
					.hidden{ display:none; }
				`;
				el.appendChild(st);
				document.body.appendChild(el);
				this._overlay = el;
				// Bind overlay events
				el.querySelector('#mp-create')?.addEventListener('click', ()=> this.create());
				el.querySelector('#mp-exit')?.addEventListener('click', ()=> this.navigateHome());
				el.querySelector('#mp-purge')?.addEventListener('click', async ()=>{ try{ await fetch('/purge', { method:'POST' }); }catch{} finally{ this.renderOverlay(); } });
				const tabs = el.querySelectorAll('.mp-tab');
				tabs.forEach(t=> t.addEventListener('click', ()=>{
					tabs.forEach(x=> x.classList.remove('active'));
					t.classList.add('active');
					const tab = t.getAttribute('data-tab');
					el.querySelector('#mp-rooms')?.classList.toggle('hidden', tab!=='rooms');
					el.querySelector('#mp-players')?.classList.toggle('hidden', tab!=='players');
					el.querySelector('#mp-empty')?.classList.add('hidden');
					this.renderOverlay();
				}));
			}
			renderOverlay(){
				const el = this._overlay; if(!el) return;
				// Rooms
				const roomsEl = el.querySelector('#mp-rooms');
				const emptyEl = el.querySelector('#mp-empty');
				if(roomsEl){
					roomsEl.innerHTML = '';
					if(!this.rooms.length){ emptyEl?.classList.remove('hidden'); }
					else { emptyEl?.classList.add('hidden'); }
							for(const r of this.rooms){
						const li = document.createElement('li'); li.className='mp-room';
								const name = r.name || `Partie-${r.id}`;
								const owner = r.ownerName || '—'; const count = `${r.count||0}/2`;
								const spect = (typeof r.spectators==='number'? r.spectators : 0);
								const ready = (typeof r.readyCount==='number'? r.readyCount : 0);
								const started = !!r.started;
								const badge = started ? '<span class="badge running">En cours</span>' : '<span class="badge open">Ouvert</span>';
								li.innerHTML = `
									<div class="info">
										<h3>${escapeHtml(name)}</h3>
										<div class="meta">
											<span class="mono">${escapeHtml(r.id)}</span>
											${badge}
											<span class="muted">Hôte: ${escapeHtml(owner)}</span>
											<span>${count}</span>
											<span>👁️ ${spect}</span>
											<span>Prêts: ${ready}</span>
											<button class="mp-btn" data-act="copy" data-id="${r.id}" title="Copier l’ID">📋</button>
										</div>
									</div>
									<div class="actions">
										<button class="mp-btn" data-act="join" data-id="${r.id}" ${started||((r.count||0)>=2)?'disabled':''}>Rejoindre</button>
										<button class="mp-btn" data-act="observe" data-id="${r.id}">Observer</button>
									</div>`;
								li.querySelector('[data-act="join"]').addEventListener('click', ()=> this.ws.send('join', { room: r.id }));
								li.querySelector('[data-act="copy"]').addEventListener('click', ()=> copyText(String(r.id||'')));
						li.querySelector('[data-act="observe"]').addEventListener('click', ()=> this.ws.send('observe', { room: r.id }));
						roomsEl.appendChild(li);
					}
				}
				// Players
				const playersEl = el.querySelector('#mp-players');
				if(playersEl){
					playersEl.innerHTML = '';
					for(const p of this.players){
						const li = document.createElement('li'); li.className='mp-room';
						li.innerHTML = `<div class="info"><h3>${escapeHtml(p.name||p.id)}</h3><div class="meta">vu il y a ${(Math.max(0,Math.round((p.ageMs||0)/1000)))}s</div></div>`;
						playersEl.appendChild(li);
					}
				}
				// Counters
				const cR = el.querySelector('#mp-count-rooms'); if(cR) cR.textContent = String(this.rooms.length||0);
				const cP = el.querySelector('#mp-count-players'); if(cP) cP.textContent = String(this.players.length||0);
				const cB = el.querySelector('#mp-count-battles'); if(cB) cB.textContent = String((this.rooms||[]).filter(r=>r.started).length);
			}
}

function ensureIdentity(){
	// Persistent identifiers for player/session
	const gen = (p)=> p + Math.random().toString(36).slice(2,8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
	let pid = null; let cid = null; let name = null;
	try{ pid = localStorage.getItem('texid_pid'); if(!pid){ pid = gen('P'); localStorage.setItem('texid_pid', pid); } }catch{}
	try{ cid = sessionStorage.getItem('texid_cid'); if(!cid){ cid = gen('S'); sessionStorage.setItem('texid_cid', cid); } }catch{}
	try{ name = localStorage.getItem('texid_name') || 'Player'; }catch{ name = 'Player'; }
	return { pid, cid, name };
}

function wsUrl(){
	try{
		const dev = !!(import.meta && import.meta.env && import.meta.env.DEV);
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		const host = dev ? (location.hostname+':8787') : location.host;
		return `${proto}://${host}`;
	}catch{ return 'ws://localhost:8787'; }
}

async function refreshRoomsRest(){
	try{ const res = await fetch('/rooms', { cache:'no-store' }); const data = await res.json(); return Array.isArray(data.rooms)? data.rooms : []; }catch{ return []; }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c])); }
function copyText(t){ try{ navigator.clipboard?.writeText(String(t)); }catch{} }
