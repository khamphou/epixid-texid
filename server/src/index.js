import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAll } from './modes/loader.js';
import { modesRouter } from './routes/modes.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors({ origin: '*'}));

// Charger modes YAML
loadAll(path.resolve(__dirname, '../../shared/modes'));

app.use('/', modesRouter);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

import { attachGameSocket } from './sockets/game.socket.js';
attachGameSocket(io);

// --- Compat lobby HTTP minimal (rooms/players) ---
const rooms = new Map();
const zones = new Map(); // zoneId -> Set<ws>
const wss = new WebSocketServer({ noServer: true });

function roomInfo(){
	return Array.from(rooms.values()).map(r=>({
		id: r.id,
		count: r.clients.size,
		name: r.name||null,
		ownerName: r.ownerName||null,
		ownerTop: r.ownerTop||0,
		started: !!r.started,
		readyCount: r.ready ? r.ready.size : 0,
		doneCount: r.done ? r.done.size : 0,
		spectators: r.observers ? r.observers.size : 0,
		lastEndedTs: r.lastEndedTs || null,
	}));
}
function playersInfo(){
	const now = Date.now();
	const list = [];
	for(const c of wss.clients){
		const last = c.lastSeen || 0;
		if(now - last <= 30000){ list.push({ id: c.cid || c.id, name: c.name || c.pid || null, room: c.room || null, lastSeen: last, ageMs: now - last }); }
	}
	return list;
}
app.get('/rooms', (_req,res)=> res.json({ rooms: roomInfo() }));
app.get('/players', (_req,res)=> res.json({ players: playersInfo() }));

// Upgrade HTTP -> WS (legacy ws://host:PORT/)
server.on('upgrade', (req, socket, head)=>{
	try{
		const url = req.url || '/';
		if(url !== '/' && url !== '' && url !== '/lobby'){
			// Laisser d'autres upgrade handlers (ex: Socket.IO) gérer
			return;
		}
		wss.handleUpgrade(req, socket, head, (ws)=>{ wss.emit('connection', ws, req); });
	}catch{
		try{ socket.destroy(); }catch{}
	}
});

function makeId(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function send(ws, obj){ try{ ws.send(JSON.stringify(obj)); }catch{} }
function join(ws, id){
	if(!rooms.has(id)) rooms.set(id, { id, name:null, ownerName:null, ownerTop:0, clients:new Set(), observers:new Set(), ready:new Set(), started:false, seed:null, done:new Set(), scores:new Map(), lines:new Map(), levels:new Map(), grids:new Map(), actives:new Map(), startedAt:null, owner:null, countdownTimer:null, lastEndedTs:null });
	const r = rooms.get(id);
	if(r.clients.size >= 2){ return send(ws,{ type:'error', message:'Room full' }); }
	r.clients.add(ws);
	ws.room = id;
	send(ws, { type:'joined', room:id, selfId: ws.id, started: r.started, owner: r.owner===ws, name: r.name||null, ownerName: r.ownerName||null, ownerTop: r.ownerTop||0 });
	const connected = r.clients.size >= 2;
	for(const c of r.clients){ send(c, { type:'peer', connected }); }
}
const lastHelloByCid = new Map();
wss.on('connection', (ws)=>{
	ws.id = makeId(); ws.room = null; ws.name = null; ws.ownsRoomId = null; ws.lastSeen = Date.now(); ws.cid = null; ws.isAlive = true; ws.pid = null;
	ws.on('pong', ()=>{ ws.lastSeen=Date.now(); ws.isAlive=true; });
	// Envoyer un snapshot initial aux nouveaux connectés (utile pour remplir le salon immédiatement)
	try{
		send(ws, { type:'rooms', rooms: roomInfo() });
		send(ws, { type:'players', players: playersInfo() });
	}catch{}
	ws.on('message', (buf)=>{
		let msg; try{ msg = JSON.parse(buf); }catch{ return; }
		const type = msg?.type; ws.lastSeen = Date.now(); ws.isAlive = true;
		if(type==='ping'){ if(msg.cid) ws.cid=String(msg.cid); return; }
		if(type==='hello'){
			if(msg.cid) ws.cid = String(msg.cid);
			if(msg.pid) ws.pid = String(msg.pid);
			ws.name = (msg.name||'')+'';
			if(ws.cid){ const now=Date.now(); const prev=lastHelloByCid.get(ws.cid)||0; lastHelloByCid.set(ws.cid, now); if(now - prev < 200){ /* no eviction */ } }
			// Retourner au client un snapshot frais et informer le lobby
			try{ send(ws, { type:'rooms', rooms: roomInfo() }); }catch{}
			for(const c of wss.clients){ send(c, { type:'players', players: playersInfo() }); }
			return;
		}
		if(type==='create'){
			if(ws.ownsRoomId && rooms.has(ws.ownsRoomId)){ return send(ws,{ type:'error', message:'Vous possédez déjà un salon.' }); }
			const id = makeId();
			const r = { id, name:(msg.name||null), ownerName:(msg.ownerName||null), ownerTop:Number(msg.ownerTop||0), modeId:(msg.modeId||null), clients:new Set(), observers:new Set(), ready:new Set(), started:false, seed:null, done:new Set(), scores:new Map(), lines:new Map(), levels:new Map(), grids:new Map(), actives:new Map(), startedAt:null, owner:ws, ownerAddr:null, ownerPid: ws.pid||null, countdownTimer:null, lastEndedTs:null };
			rooms.set(id, r); ws.ownsRoomId = id; join(ws, id); try{ r.ready.add(ws); }catch{}
			for(const c of wss.clients){ send(c, { type:'rooms', rooms: roomInfo() }); send(c, { type:'players', players: playersInfo() }); }
			return;
		}
		if(type==='join'){
			const id = msg.room; if(!id) return;
			if(!rooms.has(id)) rooms.set(id, { id, name:null, ownerName:null, ownerTop:0, clients:new Set(), observers:new Set(), ready:new Set(), started:false, seed:null, done:new Set(), scores:new Map(), lines:new Map(), levels:new Map(), grids:new Map(), actives:new Map(), startedAt:null, owner:null, countdownTimer:null, lastEndedTs:null });
			join(ws, id);
			for(const c of wss.clients){ send(c, { type:'rooms', rooms: roomInfo() }); send(c, { type:'players', players: playersInfo() }); }
			return;
		}
			if(type==='lobby_chat'){
			const text = (msg && msg.text) ? String(msg.text).slice(0, 280) : '';
			if(!text) return; const from = ws.name || ws.cid || 'Player';
			for(const c of wss.clients){ send(c, { type:'lobby_chat', from, text }); }
			return;
		}
			// --- Zone chat minimal (utilisé par l'UI BattleMenuScreen) ---
			if(type==='zone_sub'){
				const z = (msg && msg.zone) ? String(msg.zone) : '';
				if(!z) return;
				if(!zones.has(z)) zones.set(z, new Set());
				zones.get(z).add(ws);
				return;
			}
			if(type==='zone_unsub'){
				const z = (msg && msg.zone) ? String(msg.zone) : '';
				if(!z) return;
				if(zones.has(z)) zones.get(z).delete(ws);
				return;
			}
			if(type==='zone_chat'){
				const z = (msg && msg.zone) ? String(msg.zone) : '';
				const text = (msg && msg.text) ? String(msg.text).slice(0, 280) : '';
				if(!z || !text) return;
				const from = ws.name || ws.cid || 'Player';
				const set = zones.get(z);
				if(set && set.size){ for(const c of set){ send(c, { type:'zone_chat', zone: z, from, text }); } }
				return;
			}
	});
	ws.on('close', ()=>{
		const id = ws.room; if(id && rooms.has(id)){ const r = rooms.get(id); r.clients.delete(ws); r.ready.delete(ws); r.done.delete(ws); r.scores.delete(ws); if(r.clients.size===0) rooms.delete(id); }
			// Nettoyer l'abonnement zones
			try{ for(const set of zones.values()){ set.delete(ws); } }catch{}
		if(ws.ownsRoomId) ws.ownsRoomId = null;
		for(const c of wss.clients){ send(c, { type:'rooms', rooms: roomInfo() }); send(c, { type:'players', players: playersInfo() }); }
	});
});

// Démarrage HTTP principal (API + socket.io) et support ws legacy via upgrade	sur le même port
const PORT = process.env.PORT || 8787;
server.listen(PORT, ()=> console.log('[server] listening on', PORT));
