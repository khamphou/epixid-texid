// Simple multiplayer server: Express + ws
// Rooms: max 2 players. Broadcasts state, rooms list, and basic lifecycle.
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const PORT = process.env.PORT || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
// Track last hello timestamps per cid (simple rate limit)
const lastHelloByCid = new Map();

// In-memory rooms
// id -> { id, clients:Set<ws>, ready:Set<ws>, started:boolean, seed:string|null, done:Set<ws>, scores:Map<ws,number>, countdownTimer: NodeJS.Timeout|null }
const rooms = new Map();

function makeId(){
  return Math.random().toString(36).slice(2,8).toUpperCase();
}

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
    lastEndedTs: r.lastEndedTs || null,
  }));
}

function playersInfo(){
  const now = Date.now();
  const list = [];
  for(const c of wss.clients){
    const last = c.lastSeen || 0;
  // only include sockets seen recently (<=30s)
  if(now - last <= 30000){
  list.push({ id: c.cid || c.id, name: c.name || c.pid || null, room: c.room || null, lastSeen: last, ageMs: now - last });
    }
  }
  return list;
}

app.get('/rooms', (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ rooms: roomInfo() });
});

app.get('/players', (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ players: playersInfo() });
});

// Purge all rooms (admin utility)
app.post('/purge', (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  rooms.clear();
  // notify everyone
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); }catch{} }
  res.json({ ok: true });
});

// --- Simple server-side Top 10 cache (persisted to JSON file) ---
const leaderboardPath = path.resolve(__dirname, 'leaderboard.json');
let leaderboard = [];
let leaderboardLock = false; // verrou simple en mémoire
try{
  if(fs.existsSync(leaderboardPath)){
    const raw = fs.readFileSync(leaderboardPath, 'utf-8');
    const data = JSON.parse(raw);
    if(Array.isArray(data)) leaderboard = data;
  }
}catch{}
function saveLeaderboard(){ try{ fs.writeFileSync(leaderboardPath, JSON.stringify(leaderboard.slice(0,100)), 'utf-8'); }catch{} }
function getTop10(){
  return leaderboard
  .filter(e=> e && typeof e.score==='number' && e.name)
  .sort((a,b)=> (b.score||0)-(a.score||0))
    .slice(0,10);
}
app.get('/top10', (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ list: getTop10() });
  // log for visibility
  logTop10('GET /top10');
});
app.post('/top10', (req,res)=>{
  res.setHeader('Access-Control-Allow-Origin', '*');
  const name = (req.body && (req.body.name||'')+'').slice(0,32) || 'Player';
  const score = Number(req.body && req.body.score) || 0;
  const durationMs = Math.max(0, Number(req.body && req.body.durationMs || 0));
  if(Number.isFinite(score) && score>=0){
    // entrée conditionnelle: uniquement si score dans le Top10
    const doInsert = ()=>{
      const currentTop = getTop10();
      const threshold = currentTop.length<10 ? 0 : (currentTop[9]?.score||0);
      if(score > threshold){
        leaderboard.push({ name, score, ts: Date.now(), durationMs });
        leaderboard = leaderboard.sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,1000);
        saveLeaderboard();
        logTop10('POST /top10 (accepted)');
      } else {
        // rejet silencieux
        logTop10('POST /top10 (ignored: below threshold)');
      }
    };
    if(!leaderboardLock){
      leaderboardLock = true;
      try{ doInsert(); }finally{ leaderboardLock = false; }
    } else {
      // backoff très court si lock : essayer une fois après 20ms
      setTimeout(()=>{ if(!leaderboardLock){ leaderboardLock=true; try{ doInsert(); }finally{ leaderboardLock=false; } } }, 20);
    }
  }
  res.json({ ok:true });
});

// Static hosting for built frontend (single server setup)
const distPath = path.resolve(__dirname, 'dist');
// Servir les assets avec fallthrough désactivé: si un asset est manquant, renvoyer 404 (pas index.html)
app.use('/assets', express.static(path.join(distPath, 'assets'), {
  fallthrough: false,
  immutable: true,
  maxAge: '1y',
}));
// Fichiers statiques restants (favicon, etc.)
app.use(express.static(distPath));
// SPA fallback (after API routes): send index.html for non-API GETs
app.get('*', (req, res, next)=>{
  // allow API routes to pass through
  if(
    req.path.startsWith('/rooms') ||
    req.path.startsWith('/players') ||
    req.path.startsWith('/purge') ||
    req.path.startsWith('/top10')
  ) return next();
  try{
    // Désactiver le cache pour index.html afin d’éviter de servir un ancien bundle
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(distPath, 'index.html'));
  }catch{ next(); }
});

// ---- Debug snapshot helpers ----
function _readyStateName(ws){
  try{
    const map = ['CONNECTING','OPEN','CLOSING','CLOSED'];
    return map[ws.readyState] || String(ws.readyState);
  }catch{ return '?'; }
}
function snapshotPlayersForLog(){
  const now = Date.now();
  const arr = [];
  for(const c of wss.clients){
    const last = c.lastSeen||0;
    const age = Math.max(0, Math.floor((now - last)/1000));
  const fresh = (now - last) <= 10000; // consider alive if seen in last 10s
  arr.push(`- id=${c.id} cid=${c.cid||'-'} name="${c.name||'-'}" room=${c.room||'-'} age=${age}s alive=${fresh?'Y':'N'} state=${_readyStateName(c)}`);
  }
  return arr;
}
function snapshotRoomsForLog(){
  const arr = [];
  for(const r of rooms.values()){
    const clients = Array.from(r.clients).map(c=> `${c.name||c.id}`).join(', ');
    arr.push(`- room=${r.id} count=${r.clients.size}/2 started=${!!r.started} ready=${r.ready? r.ready.size:0} clients=[${clients}]`);
  }
  return arr;
}
function logLobbySnapshot(reason){
  try{
    console.log(`[SNAPSHOT] ${reason||''} players=${wss.clients.size} rooms=${rooms.size}`);
    const pl = snapshotPlayersForLog(); if(pl.length){ pl.forEach(l=>console.log(l)); } else { console.log('- (no players)'); }
    const rl = snapshotRoomsForLog(); if(rl.length){ rl.forEach(l=>console.log(l)); } else { console.log('- (no rooms)'); }
  }catch{}
}
// Log Top 10 helper
function logTop10(reason){
  try{
    const list = getTop10();
    console.log(`[TOP10] ${reason || ''}`);
    if(!list.length){ console.log('- (vide)'); return; }
    list.forEach((e, i)=> console.log(`${i+1}. ${e.name} — ${e.score}`));
  }catch{}
}

wss.on('connection', (ws)=>{
  ws.id = makeId();
  ws.room = null;
  ws.name = null;
  ws.ownsRoomId = null;
  ws.lastSeen = Date.now();
  ws.cid = null;
  ws.isAlive = true;
  ws.pid = null;
  // Guard: close sockets that never send 'hello' within 3s (ghost sessions)
  try{
    ws._helloGuard = setTimeout(()=>{
      try{
        if(!ws.cid){
          console.log(`[WS] Ghost (no hello), closing: id=${ws.id}`);
          ws.close(4000, 'no_hello');
        }
      }catch{}
    }, 3000);
  }catch{}
  const ip = ws._socket && ws._socket.remoteAddress;
  try{ console.log(`[WS] Connexion: id=${ws.id} ip=${ip||'-'}`); }catch{}
  
    // WS protocol-level heartbeat (browser auto-responds to ping with pong)
    try{
  ws.on('pong', ()=>{ ws.lastSeen = Date.now(); ws.isAlive = true; try{ console.log(`[WS] Pong: id=${ws.id} cid=${ws.cid||'-'}`); }catch{} });
    }catch{}

  ws.on('message', (data)=>{
    let msg; try{ msg = JSON.parse(data); }catch{ return; }
    const type = msg.type;
    // heartbeat update on any valid message
  ws.lastSeen = Date.now();
  ws.isAlive = true;
    if(type === 'ping'){
      if(msg.cid) ws.cid = String(msg.cid);
      ws.isAlive = true;
      try{ console.log(`[WS] Ping: id=${ws.id} cid=${ws.cid||'-'}`); }catch{}
      return;
    }
    if(type === 'hello'){
      ws.name = ((msg.name||'')+'').slice(0,32) || 'Player';
      if(msg.cid) ws.cid = String(msg.cid);
      if(msg.pid) ws.pid = String(msg.pid);
      if(ws._helloGuard){ try{ clearTimeout(ws._helloGuard); }catch{} ws._helloGuard = null; }
      ws.isAlive = true; ws.lastSeen = Date.now();
      try{ console.log(`[WS] Hello: id=${ws.id} cid=${ws.cid||'-'} name="${ws.name}"`); }catch{}
      // dedupe: if another client with same cid exists, close the older one
      try{
        if(ws.cid){
          const nowTs = Date.now();
          const prevHello = lastHelloByCid.get(ws.cid) || 0;
          lastHelloByCid.set(ws.cid, nowTs);
          // rate limit: if hellos come too fast (< 800ms), reject newcomer
          if(nowTs - prevHello < 800){
            try{ console.log(`[WS] Rate-limit cid, closing newcomer: id=${ws.id} cid=${ws.cid}`); }catch{}
            try{ ws.close(4003, 'cid_rate_limit'); }catch{}
            return; // don't proceed further
          }
          let keptExisting = false;
          for(const c of Array.from(wss.clients)){
            if(c!==ws && c.cid === ws.cid){
              // If existing connection is OPEN, prefer keeping it; close the newcomer
              if(c.readyState === 1 /* OPEN */){
                try{ console.log(`[WS] Duplicate cid, keeping existing: keep id=${c.id} close newcomer id=${ws.id} cid=${ws.cid}`); }catch{}
                try{ ws.close(4002, 'cid_in_use'); }catch{}
                keptExisting = true;
                break;
              } else {
                // otherwise, close the stale previous
                try{ console.log(`[WS] Duplicate cid, closing previous (stale): keep id=${ws.id} close id=${c.id} cid=${ws.cid}`); }catch{}
                try{ c.close(4001, 'duplicate_cid'); }catch{}
              }
            }
          }
          if(keptExisting){ return; }
        }
      }catch{}
      // broadcast players list
      for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
  // log snapshot for diagnostics
  logLobbySnapshot('after hello');
      return;
    }
  if(type === 'create'){
      // one room per connection and per player (pid), not per IP (avoid blocking local multi-tabs)
      const ip = ws._socket && ws._socket.remoteAddress;
      try{ console.log(`[ROOM] Create requested by id=${ws.id} name="${ws.name||'-'}" pid=${ws.pid||'-'} ip=${ip||'-'}`); }catch{}
      if(ws.ownsRoomId && rooms.has(ws.ownsRoomId)){
        try{ console.log(`[ROOM] Create refused (already owns room): id=${ws.id} owns=${ws.ownsRoomId}`); }catch{}
        return send(ws, { type:'error', message:'Vous possédez déjà un salon.' });
      }
      const id = makeId();
      const r = { id, name: (msg.name||null), ownerName: (msg.ownerName||null), ownerTop: Number(msg.ownerTop||0), clients: new Set(), ready: new Set(), started: false, seed: null, done: new Set(), scores: new Map(), owner: ws, ownerAddr: ip||null, ownerPid: ws.pid||null, countdownTimer: null, lastEndedTs: null };
      rooms.set(id, r);
      ws.ownsRoomId = id;
      join(ws, id);
      // Rigueur: l'hôte est prêt par défaut côté serveur (cache), pour que readyCount reflète 1/2 immédiatement
      try{ r.ready.add(ws); }catch{}
  try{ console.log(`[ROOM] Créé: room=${id} owner=${ws.name||'-'}`); }catch{}
  // notify everyone rooms changed
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
    } else if(type === 'join'){
  const id = msg.room;
  if(!rooms.has(id)) rooms.set(id, { id, name:null, ownerName:null, ownerTop:0, clients: new Set(), ready:new Set(), started:false, seed:null, done:new Set(), scores:new Map(), owner: null, countdownTimer: null, lastEndedTs: null });
      join(ws, id);
      // Informer seulement le nouvel entrant des états "ready" existants (ex: hôte prêt par défaut)
      try{
        const r = rooms.get(id);
        if(r){
          for(const u of Array.from(r.clients)){
            if(u!==ws && r.ready && r.ready.has(u)){
              send(ws, { type:'ready', who: u.id, ready: true });
            }
          }
        }
      }catch{}
  try{ console.log(`[ROOM] Join: room=${id} id=${ws.id} name="${ws.name||'-'}"`); }catch{}
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
    } else if(type === 'state'){
      // relay to peers
      const r = ws.room && rooms.get(ws.room);
      if(r){
        r.scores.set(ws, Number(msg.score||0));
        // synchroniser périodiquement les scores côté clients
        const scoreList = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null, score: r.scores.get(c)||0 }));
        for(const c of r.clients){ send(c, { type:'scores', list: scoreList }); }
      }
      broadcast(ws, { type: 'state', grid: msg.grid, score: msg.score, active: msg.active||null }, true);
    } else if(type === 'stress'){
      // Notifier uniquement l'autre joueur de la salle
      const r = ws.room && rooms.get(ws.room); if(!r) return;
      const count = Number(msg.count||0);
      for(const c of r.clients){ if(c!==ws){ send(c, { type:'stress', count }); } }
    } else if(type === 'name'){
      // set player name and broadcast the list to room
      ws.name = (msg.name||'')+'';
  try{ console.log(`[WS] Name set: id=${ws.id} name="${ws.name}"`); }catch{}
      const r = ws.room && rooms.get(ws.room);
      if(r){
        const list = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null }));
        for(const c of r.clients){ send(c, { type:'names', list }); }
      }
  // also refresh global players list for lobby
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
    } else if(type === 'start'){
      ws.name = msg.name || ws.name;
      broadcast(ws, { type: 'peer', connected: true }, true);
    } else if(type === 'ready'){
      const r = ws.room && rooms.get(ws.room); if(!r) return;
      if(msg.ready){ r.ready.add(ws); } else { r.ready.delete(ws); }
      try{ console.log(`[READY] room=${r.id} by=${ws.name||ws.id} readyCount=${r.ready.size}/${r.clients.size} started=${!!r.started}`); }catch{}
      broadcast(ws, { type: 'ready', who: ws.id, ready: msg.ready }, true);
      // if two clients are ready and not started -> start with 5s countdown
      if(r.clients.size === 2 && r.ready.size === 2 && !r.started){
        if(!r.countdownTimer){
          for(const c of r.clients){ send(c, { type:'countdown', seconds: 5 }); }
          r.countdownTimer = setTimeout(()=>{
            // verify still ready and not started
            if(r.clients.size === 2 && r.ready.size === 2 && !r.started){
              r.started = true;
              r.seed = makeId()+Date.now();
              r.done.clear();
              r.scores.clear();
              // initialiser les scores à 0 pour chaque joueur
              for(const c of r.clients){ r.scores.set(c, 0); }
              // notifier un reset des scores
              const initScores = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null, score: 0 }));
              for(const c of r.clients){ send(c, { type:'scores', list: initScores }); }
              // démarrer la manche
              for(const c of r.clients){ send(c, { type:'start', seed: r.seed, room: r.id }); }
      try{ const names = Array.from(r.clients).map(c=> c.name||c.id).join(' vs '); console.log(`[MATCH] Démarrée: room=${r.id} joueurs=${names}`); }catch{}
            }
            if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; }
          }, 5000);
        }
      } else {
        // if someone un-ready, cancel countdown
        if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; for(const c of r.clients){ send(c, { type:'countdown_cancel' }); } }
      }
    } else if(type === 'replay'){
      // Alias pratique: marquer prêt et déclencher la même logique que 'ready'
      const r = ws.room && rooms.get(ws.room); if(!r) return;
      r.ready.add(ws);
      try{ console.log(`[REPLAY] request: room=${r.id} by=${ws.name||ws.id} readyCount=${r.ready.size}/${r.clients.size}`); }catch{}
      broadcast(ws, { type: 'ready', who: ws.id, ready: true }, true);
      if(r.clients.size === 2 && r.ready.size === 2 && !r.started){
        if(!r.countdownTimer){
          for(const c of r.clients){ send(c, { type:'countdown', seconds: 5 }); }
          r.countdownTimer = setTimeout(()=>{
            if(r.clients.size === 2 && r.ready.size === 2 && !r.started){
              r.started = true;
              r.seed = makeId()+Date.now();
              r.done.clear();
              r.scores.clear();
              for(const c of r.clients){ r.scores.set(c, 0); }
              const initScores2 = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null, score: 0 }));
              for(const c of r.clients){ send(c, { type:'scores', list: initScores2 }); }
              for(const c of r.clients){ send(c, { type:'start', seed: r.seed, room: r.id }); }
              try{ const names = Array.from(r.clients).map(c=> c.name||c.id).join(' vs '); console.log(`[MATCH] Démarrée: room=${r.id} joueurs=${names}`); }catch{}
            }
            if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; }
          }, 5000);
        }
      }
    } else if(type === 'gameover'){
      const r = ws.room && rooms.get(ws.room); if(!r) return;
      r.done.add(ws);
      broadcast(ws, { type: 'gameover', who: ws.id }, true);
      if(r.clients.size >= 2 && r.done.size >= 2){
        // match over
        const scores = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null, score: r.scores.get(c)||0 }));
        for(const c of r.clients){ send(c, { type:'matchover', scores }); }
    try{ console.log(`[MATCH] Terminée: room=${r.id} scores=${scores.map(s=>`${s.name||s.id}:${s.score}`).join(', ')}`); }catch{}
        // persist to server-side leaderboard
  try{
      const pushIfTop = (nm, sc)=>{
            const doInsert = ()=>{
              const currentTop = getTop10();
              const threshold = currentTop.length<10 ? 0 : (currentTop[9]?.score||0);
              if(sc > threshold){
        leaderboard.push({ name: nm, score: sc, ts: Date.now(), durationMs: 0 });
                leaderboard = leaderboard.sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,1000);
                saveLeaderboard();
              }
            };
            if(!leaderboardLock){ leaderboardLock=true; try{ doInsert(); }finally{ leaderboardLock=false; } }
            else { setTimeout(()=>{ if(!leaderboardLock){ leaderboardLock=true; try{ doInsert(); }finally{ leaderboardLock=false; } } }, 20); }
          };
          for(const s of scores){
            const nm = (s.name && String(s.name).slice(0,32)) || 'Player';
            const sc = Number(s.score)||0;
            if(sc>0){ pushIfTop(nm, sc); }
          }
          logTop10('Après matchover');
        }catch{}
    // reset state for possible rematch
  r.started = false; r.seed = null; r.ready.clear(); r.done.clear(); r.lastEndedTs = Date.now(); if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; }
  // push updated rooms & players list to everyone
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
      }
    } else if(type === 'close'){
      // Close room if sender is owner
      const id = ws.room;
      if(!id) return;
      const r = rooms.get(id); if(!r) return;
      if(r.owner && r.owner !== ws){ return send(ws, { type:'error', message:'Seul le créateur peut fermer le salon.' }); }
  // notify clients and clear
  if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; for(const c of r.clients){ send(c, { type:'countdown_cancel' }); } }
  // reset state to allow clean relaunch on future reuse
  r.started = false; r.seed = null; r.ready.clear(); r.done.clear();
      for(const c of r.clients){ send(c, { type:'room_closed', room: id }); c.room = null; }
  rooms.delete(id);
      if(ws.ownsRoomId === id) ws.ownsRoomId = null;
  try{ console.log(`[ROOM] Fermé: room=${id} by=${ws.name||ws.id}`); }catch{}
  // refresh lists to everyone
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
    } else if(type === 'leave'){
      const id = ws.room; if(!id) return;
      const r = rooms.get(id); if(!r) return;
  r.clients.delete(ws);
      r.ready.delete(ws);
      r.done.delete(ws);
      r.scores.delete(ws);
  if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; for(const c of r.clients){ send(c, { type:'countdown_cancel' }); } }
  // si quelqu'un part, reposer la salle à un état non démarré pour permettre une relance propre
  r.started = false; r.seed = null; r.ready.clear(); r.done.clear();
      ws.room = null;
      // notify remaining peers
  const connected = r.clients.size >= 2;
  for(const c of r.clients){ send(c, { type:'peer', connected, who: ws.id, name: ws.name||null }); }
  // if room empty, delete; else update rooms list
  if(r.clients.size === 0){ rooms.delete(id); try{ console.log(`[ROOM] Détruit (vide): room=${id}`); }catch{} }
  else { try{ console.log(`[ROOM] Leave: room=${id} id=${ws.id} name="${ws.name||'-'}"`); }catch{} }
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
    }
  });

  ws.on('close', ()=>{
    try{ console.log(`[WS] Fermeture: id=${ws.id} name="${ws.name||'-'}" room=${ws.room||'-'}`); }catch{}
    const id = ws.room;
    if(id && rooms.has(id)){
      const r = rooms.get(id);
      r.clients.delete(ws);
      r.ready.delete(ws);
      r.done.delete(ws);
      r.scores.delete(ws);
      // annuler un compte à rebours actif et informer les clients restants
      if(r.countdownTimer){
        clearTimeout(r.countdownTimer); r.countdownTimer = null;
        for(const c of r.clients){ send(c, { type:'countdown_cancel' }); }
      }
  // Replacer la salle dans un état neutre pour permettre un nouveau compte à rebours
  r.started = false; r.seed = null; r.ready.clear(); r.done.clear();
      if(r.clients.size === 0){
        rooms.delete(id);
        try{ console.log(`[ROOM] Détruit (close): room=${id}`); }catch{}
      } else {
        const connected = r.clients.size >= 2;
  for(const c of r.clients){ send(c, { type:'peer', connected, who: ws.id, name: ws.name||null }); }
      }
    }
    // if owner leaves, free ownership; if room still has clients, keep it (owner can be null)
    if(ws.ownsRoomId){ ws.ownsRoomId = null; }
    // rafraîchir la liste des salons pour tous
    for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); c.send(JSON.stringify({ type:'players', players: playersInfo() })); }catch{} }
  // snapshot after close
  logLobbySnapshot('after close');
  });

  ws.on('error', (err)=>{
    try{ console.error(`[WS] Erreur: id=${ws.id} cid=${ws.cid||'-'} name="${ws.name||'-'}"`, err?.message||err); }catch{}
  });

  // send initial rooms & players list
  send(ws, { type: 'rooms', rooms: roomInfo() });
  send(ws, { type: 'players', players: playersInfo() });
});

function send(ws, obj){
  try{ ws.send(JSON.stringify(obj)); }catch{}
}

function broadcast(ws, obj, toOthers=false){
  const id = ws.room; if(!id) return;
  const r = rooms.get(id); if(!r) return;
  for(const c of r.clients){ if(toOthers && c===ws) continue; send(c, obj); }
}

function join(ws, id){
  // ensure room
  if(!rooms.has(id)) rooms.set(id, { id, name:null, ownerName:null, ownerTop:0, clients: new Set(), ready:new Set(), started:false, seed:null, done:new Set(), scores:new Map(), owner: null, countdownTimer: null, lastEndedTs: null });
  const r = rooms.get(id);
  if(r.clients.size >= 2){ send(ws,{ type:'error', message:'Room full' }); return; }
  r.clients.add(ws);
  ws.room = id;
  send(ws, { type: 'joined', room: id, selfId: ws.id, started: r.started, owner: r.owner===ws, name: r.name||null, ownerName: r.ownerName||null, ownerTop: r.ownerTop||0 });
  // notifier tout le monde de l'état de présence (connecté si 2 joueurs)
  const connected = r.clients.size >= 2;
  for(const c of r.clients){ send(c, { type:'peer', connected }); }
  // broadcast current names to all in room
  const list = Array.from(r.clients).map(c=>({ id: c.id, name: c.name||null }));
  for(const c of r.clients){ send(c, { type:'names', list }); }
}

// Inactivity sweeper: remove players not seen for >30s
setInterval(()=>{
  const now = Date.now();
  for(const ws of Array.from(wss.clients)){
    const last = ws.lastSeen || 0;
    // purge strictly on lastSeen threshold (30s) to avoid false positives
    if((now - last) > 30000){
      // consider inactive: if in room, perform leave-like cleanup
  try{ console.log(`[WS] Inactif >30s, purge: id=${ws.id} cid=${ws.cid||'-'} name="${ws.name||'-'}" lastSeen=${new Date(last).toISOString()}`); }catch{}
      const id = ws.room;
      if(id && rooms.has(id)){
        const r = rooms.get(id);
        r.clients.delete(ws);
        r.ready.delete(ws);
        r.done.delete(ws);
        r.scores.delete(ws);
        if(r.countdownTimer){ clearTimeout(r.countdownTimer); r.countdownTimer = null; for(const c of r.clients){ send(c, { type:'countdown_cancel' }); } }
        // notify remaining peers
        const connected = r.clients.size >= 2;
        for(const c of r.clients){ send(c, { type:'peer', connected, who: ws.id, name: ws.name||null }); }
  if(r.clients.size === 0){ rooms.delete(id); try{ console.log(`[ROOM] Détruit (purge): room=${id}`); }catch{} }
      }
      try{ ws.terminate(); }catch{}
      continue;
    }
    // probe with ping and expect a pong to flip isAlive back to true
    ws.isAlive = false;
    try{ ws.ping(); }catch{}
    }
  // broadcast updated players/rooms periodically
  for(const c of wss.clients){ try{ c.send(JSON.stringify({ type:'players', players: playersInfo() })); c.send(JSON.stringify({ type:'rooms', rooms: roomInfo() })); }catch{} }
  // periodic snapshot for debugging heartbeats
  logLobbySnapshot('sweep');
}, 5000);

httpServer.listen(PORT, ()=>{
  console.log('MP server listening on', PORT);
});
