import { BaseGameScreen } from './BaseGameScreen.js';
import { Grid } from '../engine/grid.js';
import { Bag } from '../engine/bag.js';
import { TETROMINOS, rotateCW } from '../engine/piece.js';
import { Scoring } from '../engine/scoring.js';
import { audio } from '../audio.js';

export class MultiplayerGameScreen extends BaseGameScreen{
	constructor(core, { ws, meta }){
		super(core, { rules: {}, objectives: null });
		this.core = core;
		this.ws = ws; // RealtimeClient (déjà connecté)
		this.meta = meta||{};
		this._off = [];
		// Etats locaux
		this.grid = new Grid(10,20); this.bag=new Bag(); this.active=null; // spawn initial différé après countdown
		this.x=3; this.y=-4; this.score=0; this.combo=-1; this.b2b=false; this.time=0; this.gravity=1.4; this.dropAcc=0; this.lockDelay=0.5; this.lockTimer=0;
		this.scoring = new Scoring();
		// Entrées centralisées dans BaseGameScreen (DAS/ARR, soft drop)
		// Adversaire (aperçu minimal)
		this.oppGrid = new Grid(10,20);
		this.oppActive = null; // {key,mat,x,y}
		this.oppName = 'Adversaire';
		this.selfName = (localStorage.getItem('texid_name') || 'Player');
		this.inRoom = meta?.room || null;
		this.selfId = meta?.selfId || null;
		this.ready = false; this.peerReady = false; this.connected = false; this.started = !!meta?.started;
		this._boardRect = { x:0,y:0,w:0,h:0,cell:24 };
		// NEXT: préparer une file visible de 6 pièces
		this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)];
		// Animations
		this._dropAnim = null; // hard drop
		this._nextAnim = null; // NEXT -> spawn + décalage
		this._initialAnimDone = false; this._initialPiece = null; // première entrée depuis NEXT
		this._nextTop = null; this._nextRing = []; this._nextHit = null;
		this._go = null;
		this._stressK = 0;
		// Shake FX
		this._shake = 0; this._shakeX = 0; this._shakeY = 0;
		// KO au spawn: grâce jusqu'au premier pas de gravité ou 250ms
		this._spawnKoPending = false;
		this._spawnKoWait = false;
		this._spawnKoAnchorY = null;
		this._spawnKoDeadline = 0;
	}
	async init(){
		await super.init?.();
		// Abonnements WS
		const push = (off)=> this._off.push(off);
		push(this.ws.on('peer', (m)=>{ this.connected = !!m.connected; }));
		push(this.ws.on('names', (m)=>{ try{ const me = (m.list||[]).find(x=>x.id===this.selfId); const opp = (m.list||[]).find(x=>x.id!==this.selfId); if(me?.name) this.selfName = me.name; if(opp?.name) this.oppName = opp.name; }catch{} }));
		push(this.ws.on('countdown', (_m)=>{ this._countdown = { t: 3, start: performance.now(), dur: 3000 }; try{ audio.resume?.(); audio.playStartCue?.(3); }catch{} }));
		push(this.ws.on('countdown_cancel', ()=>{ this._countdown=null; }));
		push(this.ws.on('start', (m)=>{
			this.started = true; this._countdown=null; this._go = { start: performance.now(), dur: 450 };
			this.resetForRound?.(m?.seed);
			// Ré-initialiser la file NEXT (basée sur le sac potentiellement reseed)
			try{ this.nextQueue = [spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag), spawn(this.bag)]; }catch{}
			// Laisser l'anim initiale NEXT -> spawn gérer l'apparition de la 1ère pièce
			this.active = null; this._initialAnimDone = false; this._initialPiece = null; this.x=3; this.y=-4; this.lockTimer=0; this.dropAcc=0;
		}));
		push(this.ws.on('state', (m)=>{ if(m.who && m.who!==this.selfId){ if(Array.isArray(m.grid)) this.oppGrid.cells = m.grid.map(row=> row.slice()); this.oppActive = m.active||null; this.peerReady = !!m.ready; } }));
		push(this.ws.on('scores', (m)=>{ try{ const me = (m.list||[]).find(x=>x.id===this.selfId); const opp = (m.list||[]).find(x=>x.id!==this.selfId); if(opp){ this.oppScore = opp.score||0; this.oppLines = opp.lines||0; } }catch{} }));
		push(this.ws.on('ready', (m)=>{ if(m.who && m.who!==this.selfId) this.peerReady = !!m.ready; }));
		push(this.ws.on('gameover', (m)=>{ if(m.who && m.who!==this.selfId){ this.oppDead = true; this.toast('VICTOIRE!', { color:'#22c55e', size:28, dur:1.8 }); } }));
		push(this.ws.on('room_closed', ()=>{ this.toast('Salon fermé', { color:'#f87171' }); setTimeout(()=> this.navigateHome(), 800); }));
		// Fixer notre nom côté serveur
		try{ const nm = (localStorage.getItem('texid_name')||'Player'); this.ws.send('name', { name: nm }); }catch{}
		// Indiquer prêt dès init si partie déjà démarrée
		if(!this.started){ this.ready = true; this.ws.send('ready', { ready: true }); }
		// Intensité musique basse au lobby/compte à rebours
		try{ audio.setMusicIntensity?.(0.3); }catch{}
	}
	dispose(){
		try{ this.ws?.send('leave', {}); }catch{}
		try{ this.ws?.close?.(); }catch{}
		this._off.forEach(off=>{ try{ off(); }catch{} }); this._off = [];
		super.dispose?.();
	}
	update(dt){
		if(this.gameOver){
			// Laisser finir les animations visuelles, mais bloquer le gameplay
			if(this._dropAnim){ this._dropAnim.t += dt; if(this._dropAnim.t >= this._dropAnim.dur){ this._dropAnim = null; } }
			if(this._nextAnim){ this._nextAnim.t += dt; if(this._nextAnim.t >= this._nextAnim.dur){ this._nextAnim = null; } }
			super.update?.(dt);
			return;
		}
		if(!this.started){ super.update?.(dt); return; }
		// Countdown local côté client (si défini via event) bloque la gravité
		if(this._countdown){ super.update?.(dt); return; }
		// Traiter les entrées centralisées (DAS/ARR + soft drop) avant la gravité
		super.update?.(dt);
		// Avancer l'animation de hard drop si présente
		if(this._dropAnim){ this._dropAnim.t += dt; if(this._dropAnim.t >= this._dropAnim.dur){ this._dropAnim = null; } }
		// Avancer l'animation NEXT (incluant l'anim initiale)
		if(this._nextAnim){
			this._nextAnim.t += dt;
			if(this._nextAnim.t >= this._nextAnim.dur){
				if(this._nextAnim.mode === 'initial' && !this.active){
					this.active = this._initialPiece; this._initialPiece = null; this._initialAnimDone = true;
					this.x=3; this.y=-4; this.lockTimer=0; this.dropAcc=0;
					// Armer un délai d'un tick complet avant KO au spawn
					this._spawnKoPending = true; this._spawnKoWait = true; this._spawnKoAnchorY = Math.floor(this.y); this._spawnKoDeadline = performance.now() + 250;
				}
				this._nextAnim = null;
			}
		}
		this.time+=dt;
		// Si pas de pièce active, rien ne tombe (au tout début, on attend le start serveur)
		if(!this.active) return;
		// Délai d'un tick complet pour KO au spawn (parité Solo)
		if(this._spawnKoPending){
			if(this._spawnKoWait){
				this._spawnKoWait = false;
			} else {
				const now = performance.now();
				const anchor = (this._spawnKoAnchorY==null) ? Math.floor(this.y) : this._spawnKoAnchorY|0;
				const movedDown = Math.floor(this.y) > anchor;
				if(!movedDown && now < this._spawnKoDeadline){ /* attendre */ }
				else {
					this._spawnKoPending = false;
					if(collide(this.grid, this.active, this.x, this.y) || cannotEnterVisibleAtSpawn(this.grid, this.active, this.x, Math.floor(this.y)) ){
						this.triggerGameOver?.(); this.sendState();
						return;
					}
				}
			}
		}
		// Gravité simple (accélération soft drop via onSoftDropTick)
		const gravityFactor = 1.4;
		this.dropAcc += dt*this.gravity*gravityFactor;
		while(this.dropAcc>=1){ this.dropAcc-=1; this.y+=1; if(collide(this.grid,this.active,this.x,this.y)){ this.y--; this.lockTimer+=dt; if(this.lockTimer>=this.lockDelay){ lock(this); this.sendState(); } break; } else { this.lockTimer=0; } }
		// Stress visuel + musique basé sur la pile (>=80%)
		try{
			const hRatio = computeStackRatio(this.grid);
			const stress = Math.max(0, Math.min(1, (hRatio - 0.8)/0.2));
			const k=0.5; this._stressK = this._stressK*(1-k) + stress*k;
			const base = 0.22 + Math.min(1, this.gravity/4)*0.18;
			const target = Math.max(0.15, Math.min(1, base + stress*0.75));
			try{ audio.setMusicIntensity?.(target); }catch{}
		}catch{}
		// Envoyer un état régulier (incluant la grille et la pièce active)
		this._stateT = (this._stateT||0) + dt;
		if(this._stateT >= 0.08){ this._stateT = 0; this.sendState(); }
	}
	render(ctx){
		const { canvas } = ctx;
		ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,canvas.width,canvas.height);
		// Layout responsive avec sidebar à droite contenant un mini plateau adverse
		const gap = 20; const margin = 12;
		const topbarEl = (typeof document!=='undefined') ? document.getElementById('topbar') : null;
		const topbarVisible = !!topbarEl && getComputedStyle(topbarEl).display !== 'none';
		const topbarH = topbarVisible ? (topbarEl.getBoundingClientRect().height||0) : 0;
		const sideMinW = 240, sideIdealW = 300;
		const maxCellW = Math.floor((canvas.width - margin*2 - gap - sideMinW) / this.grid.w);
		const maxCellH = Math.floor((canvas.height - margin*2 - topbarH) / this.grid.h);
		const cell = Math.max(12, Math.min(24, Math.min(maxCellW, maxCellH)));
		const bw = this.grid.w*cell, bh = this.grid.h*cell;
		const sideW = Math.max(sideMinW, Math.min(sideIdealW, canvas.width - margin*2 - bw - gap));
		const x0 = Math.max(margin, Math.floor((canvas.width - (bw + gap + sideW))/2));
		const y0 = Math.max(margin + topbarH, Math.floor((canvas.height - bh)/2));
			const sideX = x0 + bw + gap; const sideY = y0; const sideH = Math.max(180, Math.min(bh, canvas.height - topbarH - margin*2));
			// Shake amorti
			if(this._shake>0){ this._shakeX = (Math.random()*2-1)*this._shake; this._shakeY = (Math.random()*2-1)*this._shake; this._shake = Math.max(0, this._shake - 0.4); } else { this._shakeX=0; this._shakeY=0; }
			// Jitter >90% stress
			const jAmp = BaseGameScreen.jitterForStress(this._stressK||0, 2.2);
			const jx = (Math.random()*2-1) * jAmp + this._shakeX;
			const jy = (Math.random()*2-1) * jAmp + this._shakeY;
			let nukeGlow = 0; if(this._nuke){ const k = Math.max(0, Math.min(1, (performance.now() - this._nuke.start)/this._nuke.dur)); nukeGlow = 1 - k; }
			drawInner(ctx, x0 + jx, y0 + jy, bw, bh, this._stressK||0, this.time||0, nukeGlow);
		// Moi (masquer temporairement les cellules de la pièce verrouillée si anim en cours)
		let hideSet = null; if(this._dropAnim){ hideSet = new Set(this._dropAnim.finalCells?.map(c=>`${c.x},${c.y}`)); }
		for(let y=0;y<this.grid.h;y++) for(let x=0;x<this.grid.w;x++){
			if(hideSet && hideSet.has(`${x},${y}`)) continue;
			const v=this.grid.cells[y][x]; if(v){ drawTile(ctx, x0+x*cell, y0+y*cell, cell, pieceColor(v)); }
		}
		// Ghost (si active)
		if(this.active){
			const gy = computeGhostY(this.grid, this.active, this.x, this.y);
			const mat=this.active.mat; const x0p=this.x;
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!mat[j][i]) continue; const gx=x0p+i, gy2=gy+j; if(gx<0||gx>=this.grid.w) continue;
					const px=x0+gx*cell, py=y0+gy2*cell; ctx.save(); ctx.globalAlpha=(gy2<0?0.35:0.75); drawGhostCell(ctx, px, py, cell); ctx.restore();
				}
			}
		}
		// Pièce active, avec transparence si au-dessus
		if(this.active){
			const mat=this.active.mat; const yAct=Math.floor(this.y); const xAct=this.x; const col=pieceColor(this.active.key);
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!mat[j][i]) continue; const gx=xAct+i, gy=yAct+j; if(gx<0||gx>=this.grid.w) continue;
					const px=x0+gx*cell, py=y0+gy*cell; ctx.save(); if(gy<0) ctx.globalAlpha=BaseGameScreen.alphaAboveBoard(this.time||0, 0.6); drawTile(ctx, px, py, cell, col); ctx.restore();
				}
			}
		}
		// Animation de chute rapide (overlay) avec léger motion blur
		if(this._dropAnim){
			const a=this._dropAnim; const k=Math.min(1, a.t/a.dur); const kk = (t=> 1-Math.pow(1-t,3))(k); const yInterp=a.yStart + (a.yEnd-a.yStart)*kk;
			const trailCount=2; const dyTotal=Math.max(0,(yInterp-a.yStart)); const trailStep=dyTotal/(trailCount+1);
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!a.mat[j][i]) continue; const gx=a.x+i; if(gx<0||gx>=this.grid.w) continue;
					const yMain=yInterp+j; let px=x0+gx*cell, py=y0+yMain*cell; ctx.save(); ctx.globalAlpha=0.92; drawTile(ctx, px, py, cell, a.color); ctx.restore();
					for(let t=1;t<=trailCount;t++){ const yTrail=(yInterp-t*trailStep)+j; px=x0+gx*cell; py=y0+yTrail*cell; ctx.save(); ctx.globalAlpha=0.12*(1-t/(trailCount+0.5)); drawTile(ctx, px, py, cell, a.color); ctx.restore(); }
				}
			}
		}
		// Mini plateau adverse dans la sidebar + NEXT (moi)
		{
			const miniCell = Math.max(8, Math.floor(Math.min((sideW-32)/this.oppGrid.w, (sideH-64)/this.oppGrid.h)));
			const mx = sideX + Math.floor((sideW - this.oppGrid.w*miniCell)/2);
			const my = sideY + Math.floor((sideH - this.oppGrid.h*miniCell)/2);
			// Appliquer aussi le shake/jitter sur la sidebar
			const sdx = this._shakeX + (BaseGameScreen.jitterForStress(this._stressK||0, 2.2) * (Math.random()*2-1));
			const sdy = this._shakeY + (BaseGameScreen.jitterForStress(this._stressK||0, 2.2) * (Math.random()*2-1));
			ctx.save(); ctx.translate(sdx, sdy);
			drawInner(ctx, mx, my, this.oppGrid.w*miniCell, this.oppGrid.h*miniCell);
			for(let y=0;y<this.oppGrid.h;y++) for(let x=0;x<this.oppGrid.w;x++){ const v=this.oppGrid.cells[y][x]; if(v){ drawTile(ctx, mx+x*miniCell, my+y*miniCell, miniCell, pieceColor(v)); } }
			if(this.oppActive){
				const mat=this.oppActive.mat; const yAct=Math.floor(this.oppActive.y||0); const xAct=this.oppActive.x|0; const col=pieceColor(this.oppActive.key);
				for(let j=0;j<4;j++){
					for(let i=0;i<4;i++){
						if(!mat[j][i]) continue; const gx=xAct+i, gy=yAct+j; if(gx<0||gx>=this.oppGrid.w) continue;
						const px=mx+gx*miniCell, py=my+gy*miniCell; ctx.save(); if(gy<0) ctx.globalAlpha=0.45; drawTile(ctx, px, py, miniCell, col); ctx.restore();
					}
				}
				const gy = computeGhostY(this.oppGrid, this.oppActive, xAct, yAct);
				for(let j=0;j<4;j++){
					for(let i=0;i<4;i++){
						if(!mat[j][i]) continue; const gx=xAct+i, gy2=gy+j; if(gx<0||gx>=this.oppGrid.w) continue;
						const px=mx+gx*miniCell, py=my+gy2*miniCell; ctx.save(); ctx.globalAlpha=(gy2<0?0.35:0.7); drawGhostCell(ctx, px, py, miniCell); ctx.restore();
					}
				}
			}
			ctx.restore();
			// NEXT: top + séparateur + anneau harmonisé avec Solo
			{
				const panelX = sideX, panelW = sideW;
				const panelH = Math.max(120, 160); // panneau généreux
				const panelY = sideY + sideH - panelH - 8;
				ctx.save(); ctx.globalAlpha=0.9; ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(panelX, panelY, panelW, panelH); ctx.restore();
				const showCount = Math.min(6, this.nextQueue?.length||0);
				// Zones top/bottom avec séparateur haut (~14%)
				let topAreaH = Math.max(48, Math.min(panelH - 64, Math.floor(panelH * 0.14)));
				let botAreaY = panelY + topAreaH + 6;
				let botAreaH = panelH - topAreaH - 6;
				const dividerY = panelY + topAreaH + 2.5;
				ctx.save(); ctx.strokeStyle='rgba(148,163,184,0.25)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(panelX+8, dividerY); ctx.lineTo(panelX+panelW-8, dividerY); ctx.stroke(); ctx.restore();
				// Géométrie de l’anneau
				const pad = 4; let cx2 = panelX + Math.floor(panelW/2); let cy2 = botAreaY + Math.floor(botAreaH/2);
				let Wc = panelW - pad*2, Hc = botAreaH - pad*2;
				let Rmax = Math.max(18, Math.floor(Math.min(Wc, Hc)/2) - 1);
				const ringCount = Math.max(0, showCount - 1);
				let Reff = Math.max(16, Math.floor(Rmax));
				const GAP = 100; let ringCell0;
				if(ringCount>0){ const spacing = (2*Math.PI*Reff)/ringCount; ringCell0 = Math.max(10, Math.min(22, Math.floor((spacing - GAP)/3.6))); } else { ringCell0 = 10; }
				const ratio = 0.88; const ringCells = Array.from({length: ringCount}, (_,i)=> Math.max(10, Math.round(ringCell0 * Math.pow(ratio, i))));
				let topCell = Math.round(ringCell0 * 1.3);
				const topCellMax = Math.max(10, Math.floor((topAreaH - 18) / 4));
				if(topCell > topCellMax){
					topAreaH = Math.min(panelH - 64, topCell*4 + 18);
					botAreaY = panelY + topAreaH + 6; botAreaH = panelH - topAreaH - 6;
					cx2 = panelX + Math.floor(panelW/2); cy2 = botAreaY + Math.floor(botAreaH/2);
					Wc = panelW - pad*2; Hc = botAreaH - pad*2; Rmax = Math.max(12, Math.floor(Math.min(Wc,Hc)/2) - 1); Reff = Math.max(16, Math.floor(Rmax));
					if(ringCount>0){ const spacing2 = (2*Math.PI*Reff)/ringCount; ringCell0 = Math.max(12, Math.min(22, Math.floor((spacing2 - GAP)/3.6))); } else { ringCell0 = 10; }
					for(let i=0;i<ringCells.length;i++) ringCells[i] = Math.max(8, Math.round(ringCell0 * Math.pow(ratio, i)));
					topCell = Math.round(ringCell0 * 1.3);
				}
				// Placer top et anneau
				this._nextTop = null; this._nextRing = []; this._nextHit = null;
				if(showCount>0){ const tx = Math.round(cx2 - topCell*2); const ty = Math.round(panelY + Math.floor(topAreaH/2) - topCell*2 + 4); this._nextTop = { x:tx, y:ty, cell:topCell }; this._nextHit = { x:tx, y:ty, w:topCell*4, h:topCell*4 }; }
				const a0 = -Math.PI/2; const aStep = ringCount>0 ? (2*Math.PI)/ringCount : 0; const centers=[];
				for(let i=0;i<ringCount;i++){
					const c = ringCells[i]; const ang = a0 + i*aStep; const pxC = Math.round(cx2 + Math.cos(ang)*Reff); const pyC = Math.round(cy2 + Math.sin(ang)*Reff);
					const x = Math.round(pxC - c*2); const y = Math.round(pyC - c*2);
					this._nextRing.push({ x, y, cell:c }); centers.push({ x:x + c*2, y:y + c*2 });
				}
				// Connecteurs
				if(!this._nextAnim){
					ctx.save();
					if(this._nextTop && centers.length>0){ const a = { x: this._nextTop.x + this._nextTop.cell*2, y: this._nextTop.y + this._nextTop.cell*2 }; const b = centers[0]; ctx.strokeStyle='rgba(148,163,184,0.28)'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
					for(let i=0;i<centers.length-1;i++){ const a=centers[i], b=centers[i+1]; const alpha = Math.max(0.06, 0.18 - i*0.02); ctx.strokeStyle=`rgba(148,163,184,${alpha.toFixed(2)})`; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
					ctx.restore();
				}
				// Dessin statique si pas d'anim
				if(!this._nextAnim){
					if(this._nextTop && this.nextQueue[0]){ const it=this.nextQueue[0]; ctx.save(); ctx.globalAlpha=1; drawMat(ctx, it.mat, this._nextTop.x, this._nextTop.y, this._nextTop.cell, pieceColor(it.key)); ctx.restore(); }
					for(let i=0;i<ringCount;i++){ const nd=this._nextRing[i]; const item=this.nextQueue[i+1]; if(!item) break; const alpha = Math.max(0.45, 1 - (i+1)*0.12); ctx.save(); ctx.globalAlpha=alpha; drawMat(ctx, item.mat, nd.x, nd.y, nd.cell, pieceColor(item.key)); ctx.restore(); }
				}
				// Animation initiale NEXT -> spawn si au début de la manche
				if(this.started && !this._countdown && !this.active && !this._initialAnimDone && !this._nextAnim && this._boardRect){
					const br=this._boardRect; const spawnX=br.x+3*br.cell; const spawnY=br.y+(-4)*br.cell; const spawnC=br.cell;
					const items=[]; const first = this.nextQueue.shift() || spawn(this.bag); this._initialPiece = first;
					if(this._nextTop){ items.push({ mat:first.mat.map(r=>r.slice()), color:pieceColor(first.key), x0:this._nextTop.x, y0:this._nextTop.y, c0:this._nextTop.cell, x1:spawnX, y1:spawnY, c1:spawnC }); }
					for(let j=1;j<showCount;j++){ const piece=this.nextQueue[j-1]; if(!piece) break; const from=this._nextRing[j-1]; const to=(j===1? this._nextTop : this._nextRing[j-2]); if(!from||!to) break; const color=pieceColor(piece.key); items.push({ mat:piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:to.x, y1:to.y, c1:to.cell }); }
					this.nextQueue.push(spawn(this.bag));
					if(items.length){ this._nextAnim = { t:0, dur:0.18, items, mode:'initial' }; }
					// Déclencher une vérification KO au tick suivant si la pièce spawn est bloquée
					this._spawnKoPending = true;
				}
			}
		}
		if(this.oppActive){
			// Pièce active adverse, avec transparence au-dessus
			const mat=this.oppActive.mat; const yAct=Math.floor(this.oppActive.y||0); const xAct=this.oppActive.x|0; const col=pieceColor(this.oppActive.key);
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!mat[j][i]) continue; const gx=xAct+i, gy=yAct+j; if(gx<0||gx>=this.oppGrid.w) continue;
					const px=x0+bw+gap+gx*cell, py=y0+gy*cell; ctx.save(); if(gy<0) ctx.globalAlpha=0.45; drawTile(ctx, px, py, cell, col); ctx.restore();
				}
			}
			// Ghost adverse (si pertinent)
			const gy = computeGhostY(this.oppGrid, this.oppActive, xAct, yAct);
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!mat[j][i]) continue; const gx=xAct+i, gy2=gy+j; if(gx<0||gx>=this.oppGrid.w) continue;
					const px=x0+bw+gap+gx*cell, py=y0+gy2*cell; ctx.save(); ctx.globalAlpha=(gy2<0?0.35:0.75); drawGhostCell(ctx, px, py, cell); ctx.restore();
				}
			}
		}
		// Labels
		ctx.fillStyle='#cbd5e1'; ctx.font='14px system-ui,Segoe UI,Roboto';
		ctx.textAlign='center'; ctx.fillText(this.selfName||'Moi', x0+bw/2, y0-14); ctx.fillText(this.oppName||'Adversaire', x0+bw+gap+bw/2, y0-14);
		this._boardRect = { x:x0, y:y0, w:bw, h:bh, cell };
		super.render?.(ctx);
		// Compte à rebours visuel (3s) avec bounce/zoom + glow + couleurs vives
		if(this._countdown){
			const left = Math.max(0, this._countdown.dur - (performance.now()-this._countdown.start));
			const n = Math.max(1, Math.ceil(left/1000)); // 3..2..1
			const msInBucket = (1000 - (left % 1000)) % 1000; // 0->999 pour chaque chiffre
			const p = Math.min(1, msInBucket/1000);
			const s = 0.6 + 0.6*easeOutBack(p);
			const cx = canvas.width/2, cy = canvas.height/2;
			const palette = { 3:'#22d3ee', 2:'#a78bfa', 1:'#fbbf24' };
			const col = palette[n] || '#22d3ee';
			ctx.save();
			ctx.fillStyle='rgba(0,0,0,0.45)';
			ctx.fillRect(0,0,canvas.width,canvas.height);
			ctx.translate(cx, cy);
			ctx.scale(s, s);
			ctx.textAlign='center'; ctx.textBaseline='middle';
			ctx.shadowColor = col; ctx.shadowBlur = 28;
			ctx.lineWidth = 6; ctx.strokeStyle='rgba(0,0,0,0.55)';
			ctx.font='bold 72px Orbitron, system-ui';
			ctx.strokeText(String(n), 0, 0);
			ctx.fillStyle = col; ctx.fillText(String(n), 0, 0);
			ctx.restore();
		}
		// Flash "GO" bref après le décompte
		if(!this._countdown && this._go){
			const p = Math.min(1, (performance.now() - this._go.start)/this._go.dur);
			const s = 0.9 + 0.3*easeOutBack(p);
			const col = '#34d399';
			ctx.save();
			ctx.translate(canvas.width/2, canvas.height/2);
			ctx.scale(s, s);
			ctx.textAlign='center'; ctx.textBaseline='middle';
			ctx.shadowColor = col; ctx.shadowBlur = 22;
			ctx.lineWidth = 5; ctx.strokeStyle='rgba(0,0,0,0.55)';
			ctx.font='bold 60px Orbitron, system-ui';
			ctx.strokeText('GO', 0, 0);
			ctx.fillStyle = col; ctx.fillText('GO', 0, 0);
			ctx.restore();
			if(performance.now() - this._go.start >= this._go.dur){ this._go = null; }
		}
			// Attente d'un joueur: afficher un bandeau
			if(!this.started){
				ctx.save();
				ctx.fillStyle = 'rgba(0,0,0,0.55)';
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.fillStyle = '#cbd5e1';
				ctx.font = 'bold 24px Orbitron, system-ui';
				ctx.textAlign = 'center'; ctx.textBaseline='middle';
				ctx.fillText("En attente d’un joueur…", canvas.width/2, canvas.height/2);
				ctx.restore();
			}
		// Animation NEXT (overlay)
		if(this._nextAnim){
			const a=this._nextAnim; const k=Math.min(1, a.t/a.dur); const kk=(t=>1-Math.pow(1-t,3))(k);
			const lerp=(v0,v1)=> v0 + (v1-v0)*kk;
			for(const it of a.items){ const x=lerp(it.x0,it.x1), y=lerp(it.y0,it.y1), c=lerp(it.c0,it.c1); drawMat(ctx, it.mat, x, y, c, it.color); }
		}
	}
	handleInput(){}
	getBoardRect(){ return this._boardRect; }

	// Hooks BaseGameScreen
	onRotate(){ if(!this.active || this._countdown) return; const r=rotateCW(this.active.mat); tryApplyRotation(this, r); }
	onRotateCCW(){ if(!this.active || this._countdown) return; const r=rotateCW(rotateCW(rotateCW(this.active.mat))); tryApplyRotation(this, r); }
	onHardDrop(){
		if(!this.active || this._countdown) return;
		// Préparer animation
		const startY = Math.floor(this.y);
		const endY = computeGhostY(this.grid, this.active, this.x, this.y);
		const pieceCopy = { mat: this.active.mat.map(r=>r.slice()) };
		const color = pieceColor(this.active.key);
		const finalCells = []; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(pieceCopy.mat[j][i]) finalCells.push({ x:this.x+i, y:endY+j });
		const dist = Math.max(0, (endY - startY));
		const dur = Math.max(0.05, Math.min(0.12, 0.04 + dist*0.008));
		this._dropAnim = { mat: pieceCopy.mat, color, x:this.x, yStart:startY, yEnd:endY, t:0, dur, finalCells };
		// Verrouiller immédiatement pour le gameplay et envoyer l'état
		this.y = endY; while(!collide(this.grid,this.active,this.x,this.y+1)) this.y++; // s'assure d'être posé
		lock(this); this.sendState();
	}
		onMove(step){ if(!this.active || this._countdown) return; const nx = this.x + Math.sign(step); if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; } }
	onSoftDropTick(dt){ if(!this.active || this._countdown) return; this.dropAcc += dt*this.gravity*18; }
	onHold(){ /* Hold non pris en charge en multi pour l’instant */ }

	// Synchronisation serveur
	sendState(){
		try{
			const gridSnap = this.grid.cells.map(row=> row.slice());
			const active = { key: this.active.key, mat: this.active.mat, x: this.x, y: this.y };
			this.ws.send('state', { grid: gridSnap, score: this.scoring?.score||0, active, level: 1, lines: this.scoring?.lines||0 });
		}catch{}
	}
		triggerGameOver(){
			if(this.gameOver) return;
			super.triggerGameOver();
			try{ this.ws?.send('gameover', {}); }catch{}
		}

	// Secousse nucléaire
	onNukeShake(){ try{ this._shake = Math.max(this._shake||0, 18); }catch{} }
}

function spawn(bag){ const key=bag.next(); return { key, mat:TETROMINOS[key] }; }
function collide(grid, piece, x, y){ return grid.collide(piece.mat, x, y|0); }
function lock(self){
	const y=Math.floor(self.y);
	self.grid.merge(self.active.mat, self.x, y, pieceColor(self.active.key));
	try{ audio.playImpactSfx?.(); }catch{}
	const cleared=self.grid.clear();
	self.scoring.onClear({ lines: cleared });
	if(cleared>0){ try{ self.noteLineClear?.(cleared); }catch{} }
	// Top-out au verrouillage: si une partie de la pièce est restée au-dessus (y<0) au moment du lock, c'est un KO.
	if(y < 0){
		let anyAbove=false; for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(self.active.mat[j][i] && (y+j) < 0){ anyAbove=true; break; } } if(anyAbove) break; }
		if(anyAbove){ self.triggerGameOver?.(); return; }
	}
	// Préparer animation NEXT -> spawn et décalage (top + anneau)
	try{
		const br = self._boardRect;
		if((self._nextTop || (self._nextRing && self._nextRing.length)) && br){
			const showCount = Math.min(6, self.nextQueue.length);
			const items=[]; const spawnX=br.x+3*br.cell; const spawnY=br.y+(-4)*br.cell; const spawnC=br.cell;
			for(let i=0;i<showCount;i++){
				const piece=self.nextQueue[i]; if(!piece) break; const color=pieceColor(piece.key);
				if(i===0){ const from=self._nextTop; if(from){ items.push({ mat:piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:spawnX, y1:spawnY, c1:spawnC }); } }
				else { const from=self._nextRing[i-1]; const to=(i===1? self._nextTop : self._nextRing[i-2]); if(from&&to){ items.push({ mat:piece.mat.map(r=>r.slice()), color, x0:from.x, y0:from.y, c0:from.cell, x1:to.x, y1:to.y, c1:to.cell }); } }
			}
			if(items.length){ self._nextAnim = { t:0, dur:0.16, items }; }
		}
	}catch{}
	// Nouvelle pièce depuis la file NEXT
	self.active = self.nextQueue.shift() || spawn(self.bag);
	self.nextQueue.push(spawn(self.bag));
	self.x=3; self.y=-4; self.lockTimer=0; self.dropAcc=0;
	// Top-out KO à l'apparition: différé d'un tick complet
	if(collide(self.grid, self.active, self.x, self.y) || cannotEnterVisibleAtSpawn(self.grid, self.active, self.x, Math.floor(self.y)) ){
		self._spawnKoPending = true; self._spawnKoWait = true; self._spawnKoAnchorY = Math.floor(self.y); self._spawnKoDeadline = performance.now() + 250;
	}
}

function drawInner(ctx, x,y,w,h, stress=0, t=0, nukeGlow=0){ ctx.save();
	const glow = Math.max(0, Math.min(1, stress||0));
	const hb = heartbeat(t, 1.1);
	const hbAmp = 0.35 * (0.25 + 0.75*glow);
	const hbMul = 1 + hb * hbAmp;
	const nukeK = Math.max(0, Math.min(1, nukeGlow||0));
	const glowBlur = (30 + glow*28 + nukeK*50) * hbMul;
	const baseAlpha = (0.22 + 0.30*glow) * hbMul;
	const glowAlpha = Math.min(1, baseAlpha + nukeK*0.8);
	const glowCol = (glow>0 || nukeK>0) ? `rgba(239,68,68,${glowAlpha})` : 'rgba(0,0,0,0.5)';
	ctx.shadowColor = glowCol; ctx.shadowBlur = glowBlur;
	ctx.fillStyle='#0e1216'; ctx.fillRect(x-8,y-8,w+16,h+16);
	ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
	ctx.fillStyle='#0b0f14'; ctx.fillRect(x,y,w,h); ctx.restore(); }
function drawMat(ctx,mat,x0,y0,cell,color){ for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(!mat[j][i]) continue; const x=x0+i*cell, y=y0+j*cell; drawTile(ctx, x, y, cell, color); } } }
function pieceColor(key){ return { I:'#22d3ee', O:'#fbbf24', T:'#a78bfa', S:'#22c55e', Z:'#ef4444', J:'#60a5fa', L:'#fb923c' }[key] || (typeof key==='string'? key : '#60a5fa'); }
function drawTile(ctx, x,y, size, color){ ctx.save(); const g=ctx.createLinearGradient(x,y,x,y+size); g.addColorStop(0, shade(color, 18)); g.addColorStop(1, shade(color,-14)); ctx.fillStyle=g; ctx.fillRect(x+1,y+1,size-2,size-2); ctx.restore(); }
function tryApplyRotation(self, newMat){
	const kicks = [0, -1, 1, -2, 2];
	for(const dx of kicks){ if(!self.grid.collide(newMat, self.x+dx, Math.floor(self.y))){ self.active.mat = newMat; if(dx) self.x += dx; return true; } }
	if(!self.grid.collide(newMat, self.x, Math.floor(self.y)-1)){ self.active.mat = newMat; self.y = Math.floor(self.y)-1; return true; }
	return false;
}
function shade(hex, percent){ const {r,g,b}=hexToRgb(hex); const f=(v)=> Math.max(0, Math.min(255, Math.round(v + (percent/100)*255))); return rgbToHex(f(r),f(g),f(b)); }
function hexToRgb(hex){ const h=String(hex).replace('#',''); const n=parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
function rgbToHex(r,g,b){ const to=(v)=> v.toString(16).padStart(2,'0'); return `#${to(r)}${to(g)}${to(b)}`; }
// Utilitaire commun pour ratio de pile
function computeStackRatio(grid){
	const h=grid.h|0, w=grid.w|0; let first=h;
	for(let y=0;y<h;y++){ let any=false; for(let x=0;x<w;x++){ if(grid.cells[y][x]){ any=true; break; } } if(any){ first=y; break; } }
	if(first===h) return 0; return (h-first)/h;
}
// Easing pour l'effet bounce/zoom du décompte
function easeOutBack(t){ t = Math.max(0, Math.min(1, t)); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Heartbeat utilitaire (deux battements par cycle)
function heartbeat(t, freq=1.1){
	const phase = (t*freq) % 1;
	const p1 = Math.max(0, 1 - Math.abs((phase - 0.03)/0.06));
	const p2 = Math.max(0, 1 - Math.abs((phase - 0.38)/0.08));
	return Math.pow(p1,3) + 0.65*Math.pow(p2,3);
}

// KO si la pièce spawn entièrement au-dessus et ne peut pas descendre d’un cran
function cannotEnterVisibleAtSpawn(grid, piece, x, y){
	if(y >= 0) return false;
	const offsets = [0,-1,1,-2,2,-3,3];
	for(const dx of offsets){
		let yy = Math.floor(y);
		while(!grid.collide(piece.mat, x+dx, yy+1)) yy++;
		let anyVisible=false; for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(piece.mat[j][i] && (yy+j)>=0){ anyVisible=true; break; } } if(anyVisible) break; }
		if(anyVisible) return false;
	}
	return true;
}
