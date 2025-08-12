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
		this.grid = new Grid(10,20); this.bag=new Bag(); this.active=spawn(this.bag);
		this.x=3; this.y=0; this.score=0; this.combo=-1; this.b2b=false; this.time=0; this.gravity=1.4; this.dropAcc=0; this.lockDelay=0.5; this.lockTimer=0;
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
	// Animation de chute lors du hard drop
	this._dropAnim = null;
	}
	async init(){
		await super.init?.();
		// Abonnements WS
		const push = (off)=> this._off.push(off);
		push(this.ws.on('peer', (m)=>{ this.connected = !!m.connected; }));
		push(this.ws.on('names', (m)=>{ try{ const me = (m.list||[]).find(x=>x.id===this.selfId); const opp = (m.list||[]).find(x=>x.id!==this.selfId); if(me?.name) this.selfName = me.name; if(opp?.name) this.oppName = opp.name; }catch{} }));
		push(this.ws.on('countdown', (m)=>{ this._countdown = { t: (m.seconds||5), start: performance.now(), dur: (m.seconds||5)*1000 }; try{ audio.playImpactSfx?.(); }catch{} }));
		push(this.ws.on('countdown_cancel', ()=>{ this._countdown=null; }));
		push(this.ws.on('start', (m)=>{ this.started = true; this._countdown=null; this.resetForRound(m?.seed); }));
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
		if(this.gameOver){ super.update?.(dt); return; }
		if(!this.started){ super.update?.(dt); return; }
		// Traiter les entrées centralisées (DAS/ARR + soft drop) avant la gravité
		super.update?.(dt);
		// Avancer l'animation de hard drop si présente
		if(this._dropAnim){ this._dropAnim.t += dt; if(this._dropAnim.t >= this._dropAnim.dur){ this._dropAnim = null; } }
		this.time+=dt;
		// Gravité simple (accélération soft drop via onSoftDropTick)
		const gravityFactor = 1.4;
		this.dropAcc += dt*this.gravity*gravityFactor;
		while(this.dropAcc>=1){ this.dropAcc-=1; this.y+=1; if(collide(this.grid,this.active,this.x,this.y)){ this.y--; this.lockTimer+=dt; if(this.lockTimer>=this.lockDelay){ lock(this); this.sendState(); } break; } else { this.lockTimer=0; } }
		// Envoyer un état régulier (incluant la grille et la pièce active)
		this._stateT = (this._stateT||0) + dt;
		if(this._stateT >= 0.08){ this._stateT = 0; this.sendState(); }
	}
	render(ctx){
		const { canvas } = ctx;
		ctx.fillStyle='#0b0f14'; ctx.fillRect(0,0,canvas.width,canvas.height);
		// Layout basique: 2 boards côte à côte
		const cell = 22;
		const bw = this.grid.w*cell, bh = this.grid.h*cell;
		const gap = 40; const totalW = bw*2 + gap; const x0 = Math.floor((canvas.width - totalW)/2); const y0 = Math.floor((canvas.height - bh)/2);
		drawInner(ctx, x0, y0, bw, bh); drawInner(ctx, x0+bw+gap, y0, bw, bh);
		// Moi (masquer temporairement les cellules de la pièce verrouillée si anim en cours)
		let hideSet = null; if(this._dropAnim){ hideSet = new Set(this._dropAnim.finalCells?.map(c=>`${c.x},${c.y}`)); }
		for(let y=0;y<this.grid.h;y++) for(let x=0;x<this.grid.w;x++){
			if(hideSet && hideSet.has(`${x},${y}`)) continue;
			const v=this.grid.cells[y][x]; if(v){ drawTile(ctx, x0+x*cell, y0+y*cell, cell, pieceColor(v)); }
		}
		// Ghost
		{
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
		{
			const mat=this.active.mat; const yAct=Math.floor(this.y); const xAct=this.x; const col=pieceColor(this.active.key);
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!mat[j][i]) continue; const gx=xAct+i, gy=yAct+j; if(gx<0||gx>=this.grid.w) continue;
					const px=x0+gx*cell, py=y0+gy*cell; ctx.save(); if(gy<0) ctx.globalAlpha=0.45; drawTile(ctx, px, py, cell, col); ctx.restore();
				}
			}
		}
		// Animation de chute rapide (overlay)
		if(this._dropAnim){
			const a=this._dropAnim; const k=Math.min(1, a.t/a.dur); const kk = (t=> 1-Math.pow(1-t,3))(k);
			const yInterp=a.yStart + (a.yEnd-a.yStart)*kk;
			for(let j=0;j<4;j++){
				for(let i=0;i<4;i++){
					if(!a.mat[j][i]) continue; const gx=a.x+i; const gyf=yInterp+j; if(gx<0||gx>=this.grid.w) continue;
					const px=x0+gx*cell, py=y0+gyf*cell; ctx.save(); ctx.globalAlpha=0.9; drawTile(ctx, px, py, cell, a.color); ctx.restore();
				}
			}
		}
		// Opp
		for(let y=0;y<this.oppGrid.h;y++) for(let x=0;x<this.oppGrid.w;x++){ const v=this.oppGrid.cells[y][x]; if(v){ drawTile(ctx, x0+bw+gap+x*cell, y0+y*cell, cell, pieceColor(v)); } }
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
		// Compte à rebours visuel
		if(this._countdown){ const left = Math.max(0, this._countdown.dur - (performance.now()-this._countdown.start)); const n = Math.ceil(left/1000); ctx.save(); ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle='#e5e7eb'; ctx.font='bold 72px Orbitron, system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(n>0? String(n):'GO', canvas.width/2, canvas.height/2); ctx.restore(); }
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
	}
	handleInput(){}
	getBoardRect(){ return this._boardRect; }

	// Hooks BaseGameScreen
	onRotate(){ const r=rotateCW(this.active.mat); if(!collide(this.grid,{mat:r},this.x,this.y)) this.active.mat=r; }
	onRotateCCW(){ const r=rotateCW(rotateCW(rotateCW(this.active.mat))); if(!collide(this.grid,{mat:r},this.x,this.y)) this.active.mat=r; }
	onHardDrop(){
		// Préparer animation
		const startY = Math.floor(this.y);
		const endY = computeGhostY(this.grid, this.active, this.x, this.y);
		const pieceCopy = { mat: this.active.mat.map(r=>r.slice()) };
		const color = pieceColor(this.active.key);
		const finalCells = []; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(pieceCopy.mat[j][i]) finalCells.push({ x:this.x+i, y:endY+j });
		const dist = Math.max(0, (endY - startY));
		const dur = Math.max(0.09, Math.min(0.22, 0.06 + dist*0.015));
		this._dropAnim = { mat: pieceCopy.mat, color, x:this.x, yStart:startY, yEnd:endY, t:0, dur, finalCells };
		// Verrouiller immédiatement pour le gameplay et envoyer l'état
		this.y = endY; while(!collide(this.grid,this.active,this.x,this.y+1)) this.y++; // s'assure d'être posé
		lock(this); this.sendState();
	}
	onMove(step){ const nx = this.x + Math.sign(step); if(!collide(this.grid,this.active,nx,this.y)){ this.x = nx; this.lockTimer=0; } }
	onSoftDropTick(dt){ this.dropAcc += dt*this.gravity*18; }
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
	// Nouvelle pièce
	self.active = spawn(self.bag);
	self.x=3; self.y=0; self.lockTimer=0;
	// Top-out KO à l'apparition
	if(collide(self.grid, self.active, self.x, self.y)){
		self.triggerGameOver?.();
	}
}

function drawInner(ctx, x,y,w,h){ ctx.save(); ctx.fillStyle='#0e1216'; ctx.fillRect(x-8,y-8,w+16,h+16); ctx.fillStyle='#0b0f14'; ctx.fillRect(x,y,w,h); ctx.restore(); }
function drawMat(ctx,mat,x0,y0,cell,color){ for(let j=0;j<4;j++){ for(let i=0;i<4;i++){ if(!mat[j][i]) continue; const x=x0+i*cell, y=y0+j*cell; drawTile(ctx, x, y, cell, color); } } }
function pieceColor(key){ return { I:'#22d3ee', O:'#fbbf24', T:'#a78bfa', S:'#22c55e', Z:'#ef4444', J:'#60a5fa', L:'#fb923c' }[key] || (typeof key==='string'? key : '#60a5fa'); }
function drawTile(ctx, x,y, size, color){ ctx.save(); const g=ctx.createLinearGradient(x,y,x,y+size); g.addColorStop(0, shade(color, 18)); g.addColorStop(1, shade(color,-14)); ctx.fillStyle=g; ctx.fillRect(x+1,y+1,size-2,size-2); ctx.restore(); }
function shade(hex, percent){ const {r,g,b}=hexToRgb(hex); const f=(v)=> Math.max(0, Math.min(255, Math.round(v + (percent/100)*255))); return rgbToHex(f(r),f(g),f(b)); }
function hexToRgb(hex){ const h=String(hex).replace('#',''); const n=parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h,16); return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }; }
function rgbToHex(r,g,b){ const to=(v)=> v.toString(16).padStart(2,'0'); return `#${to(r)}${to(g)}${to(b)}`; }
