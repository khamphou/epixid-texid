import { AudioFX } from './audio.js';

// Constantes jeu
const COLS = 10;
const ROWS = 20;
let TILE = 30; // pixels (ajustable)
const START_SPEED_MS = 800; // intervalle de chute initial
const SPEEDUP_EVERY_MS = 30000; // +vite toutes les 30s
// Système de 10 niveaux nommés
const LEVEL_NAMES = [
  'Pepouz', 'Tranquille', 'Cool', 'Posé', 'Rapide',
  'Furie', 'Chaud', 'Intense', 'Enfer 1', 'Enfer 2', 'Enfer 3'
];

// Pièces Tetris (Tetrominos) - matrices 4x4
const TETROMINOS = {
  I: [ [0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0] ],
  O: [ [0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0] ],
  T: [ [0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0] ],
  S: [ [0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0] ],
  Z: [ [1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0] ],
  J: [ [1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0] ],
  L: [ [0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0] ],
};
const SHAPES = Object.keys(TETROMINOS);

// Couleurs acier/carbone déclinées
const COLORS = {
  I: '#8AA3B2',
  O: '#9AA0A8',
  T: '#7D8AA0',
  S: '#8E9AA5',
  Z: '#8E949B',
  J: '#7F8C99',
  L: '#9BA7B3',
};

function randi(n){ return Math.floor(Math.random()*n); }
function clone(m){ return JSON.parse(JSON.stringify(m)); }
function rotateCW(m){
  const N=4; const r=Array.from({length:N},()=>Array(N).fill(0));
  for(let y=0;y<N;y++)for(let x=0;x<N;x++) r[x][N-1-y]=m[y][x];
  return r;
}

// Leaderboard côté serveur
// Origine du serveur (HTTP/WS):
// - En production Netlify: définir VITE_SERVER_ORIGIN (ex: https://mon-backend.example.com)
// - En développement: fallback vers localhost:8787
function getServerOrigin(){
  try{
    const cfg = (import.meta && import.meta.env && import.meta.env.VITE_SERVER_ORIGIN) || '';
    if(cfg){ return String(cfg).replace(/\/$/,''); }
  }catch{}
  return `${location.protocol}//${location.hostname}:8787`;
}
async function apiTop10List(){
  try{
  const base = getServerOrigin();
    const res = await fetch(`${base}/top10`, { cache:'no-store' });
    const data = await res.json();
    return Array.isArray(data.list)? data.list : [];
  }catch{ return []; }
}
async function apiTop10Push(name, score, durationMs){
  try{
  const base = getServerOrigin();
  const sc = Math.max(0, Number(score||0));
  const dur = Math.max(0, Number(durationMs||0));
  await fetch(`${base}/top10`, { method:'POST', headers:{ 'Content-Type': 'application/json' }, body: JSON.stringify({ name, score: sc, durationMs: dur }) });
  }catch{}
}


// DOM refs
const cvs = document.getElementById('game');

// --------- Compteur 5s piloté par serveur ---------
function onServerCountdown(seconds){
  serverCountdownActive = true;
  serverCountdownStart = performance.now();
  serverCountdownDur = (seconds||5)*1000;
  // Début de décompte: jouer l'intro start dès maintenant
  try{ fx.playStartCue(seconds||5); }catch{}
  // Ne pas afficher l'overlay DOM pour éviter le double-affichage; on dessine sur les canvas
  if(countdownOverlay){ countdownOverlay.classList.add('hidden'); }
  if(btnCancelCountdown){ btnCancelCountdown.onclick = ()=>{ if(myReady){ toggleReady(); } }; }
  requestAnimationFrame(drawServerCountdown);
  try{ updateInputLock(); }catch{}
}

function cancelServerCountdown(){
  if(!serverCountdownActive) return;
  serverCountdownActive = false;
  // nettoyer l'overlay
  if(countdownOverlay){ countdownOverlay.classList.add('hidden'); }
  // Stopper l'intro de départ si elle joue encore
  try{ fx.stopStartCue?.(); }catch{}
  draw(); if(peerConnected && oppCtx) drawOpponent();
  try{ updateInputLock(); }catch{}
}

function drawServerCountdown(){
  if(!serverCountdownActive) return;
  const now = performance.now();
  const left = Math.max(0, serverCountdownDur - (now - serverCountdownStart));
  const n = Math.ceil(left/1000);
  const drawNum = (c, cvsEl)=>{
    const t = n>0 ? String(n) : 'GO';
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0,0,cvsEl.width,cvsEl.height);
    c.fillStyle = '#e5e7eb'; c.textAlign='center'; c.textBaseline='middle';
    c.font = 'bold 72px Orbitron, system-ui';
    c.fillText(t, cvsEl.width/2, cvsEl.height/2);
    c.restore();
  };
  draw(); if(peerConnected && oppCtx) drawOpponent();
  drawNum(ctx, cvs);
  if(peerConnected && oppCtx){ drawNum(oppCtx, oppCvs); }
  // Pas de mise à jour de texte DOM pour éviter un deuxième compteur
  if(left>0 && serverCountdownActive){ requestAnimationFrame(drawServerCountdown); }
  else { serverCountdownActive=false; if(countdownOverlay){ countdownOverlay.classList.add('hidden'); } try{ updateInputLock(); }catch{} }
}
const ctx = cvs.getContext('2d');
const fxCvs = document.getElementById('fx');
const fxCtx = fxCvs.getContext('2d');
const nextCvs = document.getElementById('next');
const nextCtx = nextCvs.getContext('2d');
const next2Cvs = document.getElementById('next2');
const next2Ctx = next2Cvs ? next2Cvs.getContext('2d') : null;
// Miniatures overlay (mobile)
const nextMini = document.getElementById('next-mini');
const nextMiniCtx = nextMini ? nextMini.getContext('2d') : null;
const oppMini = document.getElementById('opp-mini');
const oppMiniCtx = oppMini ? oppMini.getContext('2d') : null;
// Opponent canvas (2 joueurs)
const oppCvs = document.getElementById('opp');
const oppCtx = oppCvs ? oppCvs.getContext('2d') : null;
const elScore = document.getElementById('score');
const elLevel = document.getElementById('level');
const elSpeed = document.getElementById('speed'); // deviendra l’étiquette du niveau nommé
const elTop10 = document.getElementById('top10');
const elPlayerName = document.getElementById('player-name');
const dlgName = document.getElementById('dlg-name');
const formName = document.getElementById('form-name');
const inputName = document.getElementById('input-name');
const dlgGameOver = document.getElementById('dlg-gameover');
const goNew = document.getElementById('go-new');
const goClose = document.getElementById('go-close');
const btnNew = document.getElementById('btn-new');
const btnHelp = document.getElementById('btn-help');
// Ecrans & multijoueur (nouvelle ergonomie)
const screenStart = document.getElementById('screen-start');
const screenJoin = document.getElementById('screen-join');
const screenGame = document.getElementById('app');
const btnStartSolo = document.getElementById('btn-start-solo');
const btnStartMulti = document.getElementById('btn-start-multi');
const btnJoinRefresh = document.getElementById('btn-join-refresh');
const btnJoinBack = document.getElementById('btn-join-back');
const btnJoinCreate = document.getElementById('btn-join-create');
const tabRooms = document.getElementById('tab-rooms');
const tabPlayers = document.getElementById('tab-players');
const mpCloseBtn = document.getElementById('btn-mp-close');
const mpLeaveBtn = document.getElementById('btn-mp-leave');
const roomsJoin = document.getElementById('rooms-join');
const playersJoin = document.getElementById('players-join');
const roomsSummary = document.getElementById('rooms-summary');
// Compat: certains rendus référencent encore joinTitle; fournir un fallback neutre
let joinTitle = document.getElementById('join-title');
if(!joinTitle){
  const dummy = document.createElement('span');
  // garder invisible; utilisée seulement pour éviter ReferenceError
  dummy.style.display = 'none';
  joinTitle = dummy;
}
const joinEmpty = document.getElementById('join-empty');
const waitBanner = document.getElementById('wait-banner');
const meScoreEl = null; // scores en-tête MP retirés
const oppScoreEl = null;
const meReadyEl = document.getElementById('me-ready');
const oppReadyEl = document.getElementById('opp-ready');
const dlgResult = document.getElementById('dlg-result');
// nouveaux boutons dans la modale résultat
const resReplay = document.getElementById('res-replay');
const resLeave = document.getElementById('res-leave');
const resultLines = document.getElementById('result-lines');
const playersListEl = document.getElementById('players-list');
const dlgTop10 = document.getElementById('dlg-top10');
const dlgHelp = document.getElementById('dlg-help');
const helpClose = document.getElementById('help-close');
const top10ModalList = document.getElementById('top10-modal');
const top10Close = document.getElementById('top10-close');
const dlgConfirmLeave = document.getElementById('dlg-confirm-leave');
const cancelLeave = document.getElementById('cancel-leave');
const confirmLeave = document.getElementById('confirm-leave');
// bloc serveur retiré
// éléments additionnels
const oppLabel = document.getElementById('opp-label');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownTextEl = document.getElementById('countdown-text');
const btnCancelCountdown = document.getElementById('btn-cancel-countdown');
// footer room tag
const roomTag = document.getElementById('room-tag');
const roomIdEl = document.getElementById('room-id');
const toastEl = document.getElementById('toast');
const panelMP = document.getElementById('panel-mp');

const fx = new AudioFX();
// Précharger toutes les pistes audio (MP3/SFX) dès le chargement
try{ fx.preloadAll?.(); }catch{}

// Etat jeu
let grid, active, nextPiece, x, y, score, level, speedMs, dropTimer, running=false, paused=false;
let nextQueue = []; // 7-bag queue, maintain at least 2 for preview
let bag = [];
let lastSpeedup = 0;
let playerName = localStorage.getItem('tetris_player') || '';
// Persistent player id (pid) across sessions
function genId(prefix){ return prefix + Math.random().toString(36).slice(2,8).toUpperCase() + '-' + Date.now().toString(36).toUpperCase(); }
let playerId = localStorage.getItem('tetris_pid');
if(!playerId){ playerId = genId('P'); try{ localStorage.setItem('tetris_pid', playerId); }catch{} }
// Per-tab connection id (cid) to avoid cross-tab conflicts
let connId = sessionStorage.getItem('tetris_sid');
if(!connId){ connId = genId('S'); try{ sessionStorage.setItem('tetris_sid', connId); }catch{} }
let wsConnecting = false;
// Easy Mode state
let easyMode = false; // activé via toggle UI
let hint = null; // { x, rot, yLanding, score }
// Multijoueur: état client
let ws = null;
let roomId = null;
let roomMeta = { name: null, ownerName: null, ownerTop: 0 };
let opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
let opponentScore = 0;
let peerConnected = false;
let seed = null;
let rng = Math.random;
let mpStarted = false;
let opponentActive = null; // { key, mat, x, y }
let opponentDead = false;
let selfDead = false;
let isOwner = false;
let myReady = false;
let peerReady = false;
let lastArrowDownTs = 0;
// Auto-shift horizontal (DAS/ARR)
let hDir = 0; // -1 gauche, 1 droite
let hHoldStart = 0;
let hLastMove = 0;
const H_DAS = 120; // délai initial ms
const H_ARR = 30;  // répétition ms
// Répétition verticale (soft drop maintenu)
let vHeld = false;
let vLastMove = 0;
const V_ARR = 35; // ms
// Timestamp début de partie pour durée de jeu
let gameStartAt = 0;
// Effet visuel de rotation (arcs lumineux plus lents et centrés sur le centre de gravité)
let rotFxStart = 0; const rotFxDur = 280; // ms
// Compteur de départ piloté par le serveur
let serverCountdownActive = false;
let serverCountdownStart = 0;
let serverCountdownDur = 0;
// Identité / noms / victoires
let selfId = null;
let oppName = 'Adversaire';
let myWins = 0;
let oppWins = 0;
// Cache de la liste des joueurs pour le résumé (écran Rejoindre)
let joinPlayersCache = [];
// Effet stress visuel à appliquer sur le plateau adverse (quand on l’envoie)
let oppStressUntil = 0;
let oppStressCount = 0;

function resetGrid(){
  grid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
}

function refillBag(){
  bag = SHAPES.slice();
  for(let i=bag.length-1;i>0;i--){ const j = Math.floor(rng()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
}
function nextFromBag(){
  if(bag.length===0) refillBag();
  const key = bag.pop();
  return { key, mat: clone(TETROMINOS[key]) };
}

function spawn(){
  if(nextQueue.length<2){ while(nextQueue.length<2){ nextQueue.push(nextFromBag()); } }
  active = nextQueue.shift();
  nextQueue.push(nextFromBag());
  x = 3; y = 0;
  if (collide(x,y,active.mat)) {
    gameOver();
  }
  drawNext();
  // recalculer le hint pour la nouvelle pièce
  computeHint();
  // broadcast après nouvelle pièce
  broadcastState();
}

function collide(px,py,mat){
  for(let j=0;j<4;j++){
    for(let i=0;i<4;i++){
      const v = mat[j][i];
      if(!v) continue;
      const gx = px+i, gy = py+j;
      if(gx<0||gx>=COLS||gy>=ROWS) return true;
      if(gy>=0 && grid[gy][gx]) return true;
    }
  }
  return false;
}

function lock(){
  for(let j=0;j<4;j++)for(let i=0;i<4;i++){
    if(active.mat[j][i]){
      const gx=x+i, gy=y+j;
      if(gy>=0) grid[gy][gx] = active.key;
    }
  }
  // petit effet pop sur mon plateau
  try{ const frame = document.querySelector('.boards .board-wrap .frame'); if(frame){ frame.classList.remove('pop'); void frame.offsetWidth; frame.classList.add('pop'); setTimeout(()=>frame.classList.remove('pop'), 180); } }catch{}
  // SFX impact au sol
  try{ fx.playImpactSfx?.(); }catch{}
  const cleared = clearLines();
  if(cleared>0){
    // Score: standard Tetris-ish
    const points = [0,40,100,300,1200][cleared] * Math.max(1, level);
  score += points;
  elScore.textContent = score;
  try{ elScore.classList.remove('pulse'); void elScore.offsetWidth; elScore.classList.add('pulse'); setTimeout(()=> elScore.classList.remove('pulse'), 360); }catch{}
    // Audio + FX
    fx.linesCleared(cleared, level);
    flashLines(cleared);
    // Si 3 ou 4 lignes: envoyer un signal de stress à l'adversaire
    if(roomId && (cleared>=3)){
      try{ mpSend({ type:'stress', count: cleared }); }catch{}
      // Marquer un effet stress côté adversaire (dessiné dans drawOpponent)
      oppStressUntil = performance.now() + 800; // 0.8s de pulse
      oppStressCount = cleared;
    }
  }
  ensureMusicMode();
  spawn();
  // après spawn on calcule un nouveau hint
  computeHint();
}

function clearLines(){
  let count=0;
  outer: for(let r=ROWS-1;r>=0;){
    for(let c=0;c<COLS;c++) if(!grid[r][c]){ r--; continue outer; }
    // ligne pleine
    grid.splice(r,1);
    grid.unshift(Array(COLS).fill(null));
    count++;
  }
  return count;
}

function rotate(){
  const rot = rotateCW(active.mat);
  if(!collide(x,y,rot)){
    active.mat = rot;
    fx.rotate();
  rotFxStart = performance.now();
    // mise à jour hint
    computeHint();
  broadcastState();
  }
}

function move(dx){
  if(!collide(x+dx,y,active.mat)){
  x+=dx;
    // mise à jour hint
    computeHint();
  broadcastState();
  }
}

function softDrop(){
  if(!collide(x,y+1,active.mat)) { y++; score += 1; elScore.textContent = score; try{ elScore.classList.remove('pulse'); void elScore.offsetWidth; elScore.classList.add('pulse'); setTimeout(()=> elScore.classList.remove('pulse'), 300); }catch{} broadcastState(); }
  else { lock(); }
}

function hardDrop(){
  let dy=0;
  while(!collide(x,y+1,active.mat)){ y++; dy++; }
  // pas de SFX à la pose
  // petit bonus pour hard drop
  if(dy>0){ score += Math.min(20, dy*2); elScore.textContent = score; try{ elScore.classList.remove('pulse'); void elScore.offsetWidth; elScore.classList.add('pulse'); setTimeout(()=> elScore.classList.remove('pulse'), 300); }catch{} }
  lock();
}

function step(ts){
  if(!running||paused) return;
  if(!lastSpeedup) lastSpeedup = ts;

  // chute
  if(!step.last) step.last = ts;
  const elapsed = ts - step.last;
  if(elapsed >= speedMs){ softDrop(); step.last = ts; }

  // accélération toutes les 30s
  if(ts - lastSpeedup >= SPEEDUP_EVERY_MS){
    level = Math.min(10, level+1);
    // Accélération plus sensible par palier: plus le niveau monte, plus le facteur se réduit.
    // Exemple: L1≈0.88, L5≈0.80, plancher 0.78
    const factor = Math.max(0.78, 0.9 - 0.02*level);
    speedMs = Math.max(60, Math.floor(speedMs * factor));
    lastSpeedup = ts;
    updateHUD();
  }

  // auto-repeat horizontal
  handleHorizontal(ts);
  // auto-repeat vertical (soft drop maintenu)
  handleVertical(ts);

  draw();
  // adapter musique si la pile évolue
  ensureMusicMode();
  // tenir la miniature adverse à jour en continu
  try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
  requestAnimationFrame(step);
}

function handleHorizontal(ts){
  if(!hDir) return;
  const held = ts - hHoldStart;
  if(held >= H_DAS){
    if(ts - hLastMove >= H_ARR){
      move(hDir);
      hLastMove = ts;
    }
  }
}

function handleVertical(ts){
  if(!vHeld) return;
  if(ts - vLastMove >= V_ARR){
    softDrop();
    vLastMove = ts;
  }
}

function draw(){
  ctx.clearRect(0,0,cvs.width,cvs.height);
  // grille de fond
  ctx.fillStyle = '#0e1116';
  ctx.fillRect(0,0,cvs.width,cvs.height);
  ctx.strokeStyle = '#1f242c';
  ctx.lineWidth = 1;
    for(let i=1;i<COLS;i++){ 
    ctx.beginPath(); ctx.moveTo(i*TILE,0); ctx.lineTo(i*TILE,ROWS*TILE); ctx.stroke();
  }
  for(let j=1;j<ROWS;j++){
    ctx.beginPath(); ctx.moveTo(0,j*TILE); ctx.lineTo(COLS*TILE,j*TILE); ctx.stroke();
  }
  // cellules posées
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const k = grid[r][c];
      if(!k) continue;
      drawCell(c,r,COLORS[k]);
    }
  }
  // pièce active
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(active.mat[j][i]){
    drawCell(x+i,y+j,COLORS[active.key], true);
  }

    // Ombre projetée (ghost) + guides (Easy uniquement)
  const landing = getLandingY(x, y, active.mat);
  drawGhost(x, landing, active);
  if(easyMode){
    drawLandingVerticals(x, landing, active.mat);
    drawLandingEdges(x, landing, active.mat);
  }

    // Effet arcs lumineux si rotation récente
    const now = performance.now();
    const elapsed = now - (rotFxStart||0);
    if(elapsed >= 0 && elapsed < rotFxDur){
      const t = 1 - (elapsed/rotFxDur);
      const ang = t * Math.PI * 2; // rotation rapide
  const { cx, cy } = getActiveCenterOfMass();
  const bounds = getActiveBounds();
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(56,189,248,${0.25 + 0.55*t})`;
      ctx.lineWidth = 2 + 2*t;
      for(let k=0;k<3;k++){
        const r = Math.max(bounds.w, bounds.h)/2 + 6 + k*4;
        ctx.beginPath(); ctx.arc(0,0, r, 0.3, 1.1); ctx.stroke();
      }
      ctx.restore();
    }

  // Hint (Mode Easy)
  if(easyMode && hint){
    drawHint(hint);
  }
  // overlay Game Over pour nous si perdu
  if(selfDead){
    ctx.save();
    if(roomId){
      // En multijoueur: message discret en bas du plateau
      const h = 42;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, cvs.height - h, cvs.width, h);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 20px Orbitron, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Éliminé', cvs.width/2, cvs.height - h/2);
    } else {
      // En solo: overlay complet avec texte plus petit
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0,0,cvs.width,cvs.height);
      ctx.fillStyle = '#ef4444';
      const fs = Math.max(20, Math.floor(cvs.width * 0.08));
      ctx.font = `bold ${fs}px Orbitron, system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', cvs.width/2, Math.floor(cvs.height*0.46));
    }
    ctx.restore();
  }
  // Mettre à jour le HUD en continu
  updateHUD();
  // Opponent board
  if(oppCtx){ drawOpponent(); }
  // Miniatures (mobile)
  try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
}

function drawCell(cx,cy,color,glow=false){
  const px=cx*TILE, py=cy*TILE;
  const grad = ctx.createLinearGradient(px,py,px,py+TILE);
  grad.addColorStop(0, shade(color, 10));
  grad.addColorStop(1, shade(color,-12));
  ctx.fillStyle = grad;
  roundRect(ctx, px+2, py+2, TILE-4, TILE-4, 6);
  ctx.fill();
  // liseré
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, px+2, py+2, TILE-4, TILE-4, 6);
  ctx.stroke();
  if(glow){
    ctx.save();
    ctx.shadowColor = 'rgba(56,189,248,.35)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(125, 211, 252, .35)';
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function shade(hex, amt){
  const c = parseInt(hex.slice(1),16);
  let r=(c>>16)+amt, g=((c>>8)&255)+amt, b=(c&255)+amt;
  r=Math.max(0,Math.min(255,r));
  g=Math.max(0,Math.min(255,g));
  b=Math.max(0,Math.min(255,b));
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1).toUpperCase();
}

function drawNext(){
  nextCtx.clearRect(0,0,nextCvs.width,nextCvs.height);
  if(next2Ctx) next2Ctx.clearRect(0,0,next2Cvs.width,next2Cvs.height);
  const p1 = nextQueue[0]; const p2 = nextQueue[1];
  if(p1) drawMiniPiece(nextCtx, nextCvs, p1);
  if(p2 && next2Ctx) drawMiniPiece(next2Ctx, next2Cvs, p2);
  // plus d'overlay next-mini (déplacé en sidebar native)
}

function drawMiniPiece(ctxMini, cvsMini, piece, sizeOverride){
  const m = piece.mat; const key = piece.key; const color = COLORS[key];
  let minX=4,maxX=0,minY=4,maxY=0;
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); minY=Math.min(minY,j); maxY=Math.max(maxY,j); }
  const w=maxX-minX+1; const h=maxY-minY+1;
  const size = sizeOverride || 24;
  const offx = Math.floor((cvsMini.width - w*size)/2);
  const offy = Math.floor((cvsMini.height - h*size)/2);
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
    const px=offx+(i-minX)*size, py=offy+(j-minY)*size;
    const grad = ctxMini.createLinearGradient(px,py,px,py+size);
    grad.addColorStop(0, shade(color,10));
    grad.addColorStop(1, shade(color,-12));
    ctxMini.fillStyle = grad;
    roundRect(ctxMini, px+2, py+2, size-4, size-4, 6);
    ctxMini.fill();
    ctxMini.strokeStyle='rgba(0,0,0,.35)';
    ctxMini.lineWidth=2;
    roundRect(ctxMini, px+2, py+2, size-4, size-4, 6);
    ctxMini.stroke();
  }
}

function getLandingY(px, py, mat){
  let gy = py;
  while(!collide(px, gy+1, mat)) gy++;
  return gy;
}

function drawGhost(px, py, piece){
  ctx.save();
  ctx.globalAlpha = 0.25;
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(piece.mat[j][i]){
    const cx = px+i, cy = py+j;
    // bordure uniquement, remplissage léger
    const pxl=cx*TILE, pyl=cy*TILE;
    ctx.fillStyle='rgba(125, 211, 252, 0.12)';
    roundRect(ctx, pxl+2, pyl+2, TILE-4, TILE-4, 6);
    ctx.fill();
    ctx.strokeStyle='rgba(125, 211, 252, 0.55)';
    ctx.lineWidth=1.5;
    roundRect(ctx, pxl+2, pyl+2, TILE-4, TILE-4, 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLandingLine(row){
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.75)';
  ctx.setLineDash([6,6]);
  ctx.lineWidth = 2;
  const y = (row+1)*TILE; // au bas de la pièce
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(COLS*TILE, y);
  ctx.stroke();
  ctx.restore();
}
// Lignes verticales de projection (bords gauche/droite) du bas de la pièce jusqu'au bas du plateau
function drawLandingVerticals(px, py, mat){
  const b = getPieceBounds(mat);
  const yPix = ROWS * TILE; // descendre jusqu’au bas du plateau
  // Trouver, pour chaque bord, la case la plus basse de la colonne correspondante
  const colLeft = b.minX;
  const colRight = b.maxX;
  let bottomJL = b.minY, bottomJR = b.minY;
  for(let j=0;j<4;j++){ if(mat[j][colLeft]) bottomJL = j; }
  for(let j=0;j<4;j++){ if(mat[j][colRight]) bottomJR = j; }
  const topPixL = (y + bottomJL + 1) * TILE; // bas de la case la plus basse du bord gauche
  const topPixR = (y + bottomJR + 1) * TILE; // bas de la case la plus basse du bord droit
  const leftX = (px + colLeft) * TILE;
  const rightX = (px + colRight + 1) * TILE;
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.45)';
  ctx.setLineDash([4,8]);
  ctx.lineWidth = 1.5;
  // gauche
  ctx.beginPath(); ctx.moveTo(leftX, topPixL); ctx.lineTo(leftX, yPix); ctx.stroke();
  // droite
  ctx.beginPath(); ctx.moveTo(rightX, topPixR); ctx.lineTo(rightX, yPix); ctx.stroke();
  ctx.restore();
}
// Calcule les bornes (min/max) d'une matrice 4x4 de pièce
function getPieceBounds(mat){
  let minX = 4, maxX = -1, minY = 4, maxY = -1;
  for(let j=0;j<4;j++){
    for(let i=0;i<4;i++){
      if(mat[j][i]){
        if(i < minX) minX = i;
        if(i > maxX) maxX = i;
        if(j < minY) minY = j;
        if(j > maxY) maxY = j;
      }
    }
  }
  if(maxX < 0){
    return { minX:0, maxX:0, minY:0, maxY:0, w:0, h:0 };
  }
  return { minX, maxX, minY, maxY, w: (maxX-minX+1), h: (maxY-minY+1) };
}
// Deux traits au bas de la projection: marque les bords gauche/droit de l'empreinte
function drawLandingEdges(px, py, mat){
  const b = getPieceBounds(mat);
  const yPix = (py + b.maxY + 1) * TILE;
  const leftPix = (px + b.minX) * TILE;
  const rightPix = (px + b.maxX + 1) * TILE;
  const seg = Math.floor(TILE * 0.55);
  ctx.save();
  ctx.strokeStyle = 'rgba(125,211,252,0.9)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  // Gauche
  ctx.beginPath();
  ctx.moveTo(leftPix, yPix);
  ctx.lineTo(leftPix + seg, yPix);
  ctx.stroke();
  // Droit
  ctx.beginPath();
  ctx.moveTo(rightPix - seg, yPix);
  ctx.lineTo(rightPix, yPix);
  ctx.stroke();
  ctx.restore();
}

// Centre de gravité (moyenne des cellules occupées) en pixels pour la pièce active
function getActiveCenterOfMass(){
  let sx=0, sy=0, c=0;
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(active && active.mat[j][i]){ sx += (x+i+0.5)*TILE; sy += (y+j+0.5)*TILE; c++; }
  if(!c){ const b=getActiveBounds(); return { cx:(b.l+b.r)/2, cy:(b.t+b.b)/2 }; }
  return { cx: sx/c, cy: sy/c };
}

function drawHint(h){
  // Encadre les cases de la pièce à la position recommandée, effet pulsant
  const t = (performance.now()%1000)/1000;
  const pulse = 0.4 + 0.6*Math.abs(Math.sin(t*Math.PI*2));
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.45*pulse;
  const mat = rotateN(TETROMINOS[active.key], h.rot);
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
    const pxl=(h.x+i)*TILE, pyl=(h.yLanding+j)*TILE;
    ctx.strokeStyle='rgba(56,189,248,0.9)';
    ctx.lineWidth=2;
    roundRect(ctx, pxl+2, pyl+2, TILE-4, TILE-4, 6);
    ctx.stroke();
  }
  ctx.restore();
}
function getActiveBounds(){
  // retourne {l,t,r,b,w,h} en pixels pour la pièce active
  let minI=4, maxI=-1, minJ=4, maxJ=-1;
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(active.mat[j][i]){ minI=Math.min(minI,i); maxI=Math.max(maxI,i); minJ=Math.min(minJ,j); maxJ=Math.max(maxJ,j); }
  if(maxI<0){ minI=maxI=0; minJ=maxJ=0; }
  const l = (x+minI)*TILE, t = (y+minJ)*TILE, r = (x+maxI+1)*TILE, b = (y+maxJ+1)*TILE;
  return { l,t,r,b, w:r-l, h:b-t };
}

// Effets visuels lignes
function flashLines(count){
  const t0 = performance.now();
  const dur = Math.min(600, 250 + count*120);
  const amplitude = 6 + count*3;
  function anim(now){
    const t = Math.min(1, (now - t0)/dur);
    fxCtx.clearRect(0,0,fxCvs.width,fxCvs.height);
    // flash radial
    const g = fxCtx.createRadialGradient(fxCvs.width/2, fxCvs.height/2, 10, fxCvs.width/2, fxCvs.height/2, 200+count*40);
    g.addColorStop(0, `rgba(125,211,252,${0.35*(1-t)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fxCtx.fillStyle = g;
    fxCtx.fillRect(0,0,fxCvs.width,fxCvs.height);
    // shake
    const s = Math.sin(t*Math.PI);
    fxCvs.style.transform = `translate(${(Math.random()*2-1)*amplitude*s}px, ${(Math.random()*2-1)*amplitude*s}px)`;
    if(t<1) requestAnimationFrame(anim); else fxCvs.style.transform = '';
  }
  requestAnimationFrame(anim);
}

function updateHUD(){
  // niveau numérique (1..10) + nom
  const lvl = Math.min(10, Math.max(1, Number(level||1)));
  const nameIdx = Math.min(LEVEL_NAMES.length-1, lvl-1);
  elLevel && (elLevel.textContent = `${lvl} — ${LEVEL_NAMES[nameIdx]}`);
  elScore && (elScore.textContent = score);
}

function updateScoreLabels(){
  if(meScoreEl){ meScoreEl.textContent = `${Number(score||0)}${myWins? ` (V:${myWins})` : ''}`; }
    if(oppScoreEl){ oppScoreEl.textContent = `${Number(opponentScore||0)}${oppWins? ` (V:${oppWins})` : ''} (Adversaire)`; }
}

function renderTop10(){
  if(!elTop10) return;
  elTop10.innerHTML = '';
    apiTop10List().then((list) => {
    elTop10.innerHTML = '';
    list.slice(0,10).forEach((e,i)=>{
      const li = document.createElement('li');
  const dur = formatDur(e.durationMs);
  li.textContent = `${i+1}. ${e.name} — ${e.score}${dur?` (${dur})`:''}`;
      elTop10.appendChild(li);
    });
  });
}

function gameOver(){
  running=false; paused=false;
  selfDead = true;
    fx.stopMusic();
  try{ fx.playGameOverMusic(); }catch{}
  document.getElementById('final-score').textContent = score;
  const oppFinal = document.getElementById('opp-final-score'); if(oppFinal) oppFinal.textContent = String(opponentScore||0);
  draw();
  // En multijoueur, pas de modale; en solo on affiche la modale
  // En solo: ne plus afficher la modale Game Over; le bouton "Nouvelle partie" suffit
  try{
    const dur = Math.max(0, Math.floor((performance.now() - (gameStartAt||performance.now()))));
    if(playerName) apiTop10Push(playerName, score, dur);
  }catch{ if(playerName) apiTop10Push(playerName, score); }
  fx.gameOverJingle();
  // notifier le serveur
  mpSend({type:'gameover'});
  // rafraîchir les statuts (Moi: Perdu, Adversaire: Gagnant)
  renderPlayersList();
}

function askName(){
  if(playerName){ elPlayerName.textContent = playerName; return Promise.resolve(playerName); }
  return new Promise((resolve)=>{
    dlgName.showModal();
    setTimeout(()=> inputName.select(), 40);
    formName.addEventListener('submit', (e)=>{
      e.preventDefault();
      const v = (inputName.value||'').trim().slice(0,16) || 'Player';
      playerName = v; localStorage.setItem('tetris_player', v);
      elPlayerName.textContent = v;
      dlgName.close();
      resolve(v);
    }, { once:true });
    dlgName.addEventListener('close', ()=>{
      if(!playerName){ playerName = 'Player'; elPlayerName.textContent='Player'; }
    }, { once:true });
  });
}

function start(){
  // RNG: en solo, repartir sur Math.random; en multi, onMatchStart fixe rng
  if(!roomId){ rng = Math.random; }
  score = 0; level = 1; speedMs = START_SPEED_MS; lastSpeedup = 0; step.last = 0;
  selfDead = false; opponentDead = false; opponentActive = null;
  gameStartAt = performance.now();
  resetGrid(); nextQueue = []; bag = []; spawn(); updateHUD(); renderTop10();
  // Nettoyer effets/overlays résiduels
  try{ fxCtx.clearRect(0,0,fxCvs.width,fxCvs.height); fxCvs.style.transform=''; }catch{}
  cancelServerCountdown();
  running=true; paused=false; fx.resume();
  // Démarrer la musique en mode « chill » immédiatement
  fx.startMusic('chill');
  // Et forcer l'intensité vers 0 dès que possible (crossfade MP3)
  try{ fx.setMusicIntensity?.(0); }catch{}
  requestAnimationFrame(step);
  try{ updateInputLock(); }catch{}
}

// Remet l'UI/plateaux à un état « neutre » hors partie
function resetIdleView(){
  // ne pas impacter une manche en cours
  if(mpStarted) return;
  running = false; paused = false; fx.stopMusic();
  selfDead = false; opponentDead = false; opponentActive = null;
  // solo: RNG standard
  if(!roomId){ rng = Math.random; }
  // scores visibles
  score = 0; opponentScore = 0; level = 1; speedMs = START_SPEED_MS; updateHUD(); updateScoreLabels();
  // grilles vides et previews reset
  resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  nextQueue = []; bag = [];
  // donner une pièce d'aperçu pour affichage neutre
  spawn();
  // FX/overlays
  cancelServerCountdown();
  try{ fxCtx.clearRect(0,0,fxCvs.width,fxCvs.height); fxCvs.style.transform=''; }catch{}
  // redraw
  draw(); if(oppCtx && roomId) drawOpponent();
  try{ updateInputLock(); }catch{}
}

// Inputs
window.addEventListener('keydown', (e)=>{
  // Bloquer toute entrée si non-running, en pause, ou (en multi) avant le départ / sans adversaire
  if(!running || paused || (roomId && (!mpStarted || !peerConnected)) || serverCountdownActive){ return; }
  // Empêcher le scroll en jeu
  try{
    if(screenGame && screenGame.classList && screenGame.classList.contains('active')){
      if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
    }
  }catch{}
  switch(e.code){
    case 'ArrowLeft': {
      move(-1);
      hDir = -1; hHoldStart = performance.now(); hLastMove = performance.now();
    } break;
    case 'ArrowRight': {
      move(1);
      hDir = 1; hHoldStart = performance.now(); hLastMove = performance.now();
    } break;
    case 'ArrowUp': rotate(); break;
    case 'ArrowDown': {
      const now = performance.now();
      if(!e.repeat && (now - lastArrowDownTs) < 200){ hardDrop(); lastArrowDownTs = 0; break; }
      lastArrowDownTs = now; vHeld = true; vLastMove = now; softDrop(); break;
    }
    case 'Space': hardDrop(); break;
    case 'KeyP': togglePause(); break;
  }
});

window.addEventListener('keyup', (e)=>{
  if(e.code === 'ArrowLeft' && hDir === -1){ hDir = 0; }
  if(e.code === 'ArrowRight' && hDir === 1){ hDir = 0; }
  if(e.code === 'ArrowDown'){ vHeld = false; }
});

function togglePause(){
  paused = !paused;
  if(paused) fx.stopMusic();
  else { ensureMusicMode(); requestAnimationFrame(step); }
  try{ updateInputLock(); }catch{}
}

// ======== Contrôles souris/pointeur (gestes type mobile) ========
// Gestes sur le canvas principal: 
// - Tap court: rotation
// - Glisser gauche/droite: déplacements par pas (seuil)
// - Glisser vers le bas: soft drop progressif
// - Flick rapide vers le bas: hard drop
;(function setupPointerControls(){
  if(!cvs) return;
  try{ cvs.style.touchAction = 'none'; }catch{}
  let pid = null;
  let pActive = false;
  let startX=0, startY=0, lastX=0, lastY=0, startT=0;
  let accX=0, accY=0; // accumulateurs pour pas de déplacement
  const TAP_MS = 220;
  const TAP_DIST = 12; // px
  const H_STEP = 20; // px par pas horizontal
  const V_STEP = 26; // px par soft drop
  const FLICK_MIN_DY = 60; // px
  const FLICK_MIN_V = 0.8; // px/ms

  function canControl(){
    // Autoriser si l’écran jeu est actif et qu’on n’est pas en pause
  if(paused) return false;
  if(!active) return false;
  // Ne rien autoriser si la boucle n'est pas en cours
  if(!running) return false;
  // En multi: n’autoriser que quand la manche a démarré
  if(roomId && (!mpStarted || !peerConnected)) return false;
  // Pendant le compte à rebours piloté serveur: bloquer
  if(serverCountdownActive) return false;
    const isGame = !!(screenGame && screenGame.classList && screenGame.classList.contains('active'));
    return isGame;
  }

  function onDown(ev){
    if(!canControl()) return;
    try{ cvs.setPointerCapture(ev.pointerId); pid = ev.pointerId; }catch{}
    pActive = true; startX = lastX = ev.clientX; startY = lastY = ev.clientY; startT = performance.now();
    accX = 0; accY = 0;
    // éviter le scroll/bounce
    try{ ev.preventDefault(); }catch{}
  }
  function onMove(ev){
    if(!pActive || (pid!==null && ev.pointerId!==pid)) return;
    if(!canControl()) return;
    const dx = ev.clientX - lastX; const dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    accX += dx; accY += dy;
    // Déplacements horizontaux par pas
    while(Math.abs(accX) >= H_STEP){
      if(accX > 0){ move(1); accX -= H_STEP; }
      else { move(-1); accX += H_STEP; }
    }
    // Soft drop progressif en glisser
    while(accY >= V_STEP){ softDrop(); accY -= V_STEP; }
    try{ ev.preventDefault(); }catch{}
  }
  function onUp(ev){
    if(!pActive || (pid!==null && ev.pointerId!==pid)) return;
    const dt = Math.max(1, performance.now() - startT);
    const totalDX = ev.clientX - startX; const totalDY = ev.clientY - startY;
    // Tap court -> rotation
    const dist2 = totalDX*totalDX + totalDY*totalDY;
    if(dt <= TAP_MS && dist2 <= (TAP_DIST*TAP_DIST)){
      rotate();
    } else {
      // Flick bas rapide -> hard drop
      const vy = totalDY / dt; // px/ms
      if(totalDY >= FLICK_MIN_DY && vy >= FLICK_MIN_V){
        hardDrop();
      }
    }
    try{ cvs.releasePointerCapture(ev.pointerId); }catch{}
    pActive = false; pid = null;
    accX = accY = 0;
    try{ ev.preventDefault(); }catch{}
  }
  cvs.addEventListener('pointerdown', onDown, { passive:false });
  cvs.addEventListener('pointermove', onMove, { passive:false });
  cvs.addEventListener('pointerup', onUp, { passive:false });
  cvs.addEventListener('pointercancel', onUp, { passive:false });
  try{ updateInputLock(); }catch{}
})();

// Indicateur visuel d'entrée verrouillée (curseur, aria)
function isInputLocked(){
  try{
    const inGame = !!(screenGame && screenGame.classList && screenGame.classList.contains('active'));
    if(!inGame) return true;
    if(paused) return true;
    if(!running) return true;
    if(serverCountdownActive) return true;
    if(roomId && (!mpStarted || !peerConnected)) return true;
    return false;
  }catch{ return false; }
}
function updateInputLock(){
  try{
    if(!cvs) return;
    const locked = isInputLocked();
    cvs.classList.toggle('input-locked', locked);
    if(locked) cvs.setAttribute('aria-disabled','true'); else cvs.removeAttribute('aria-disabled');
  }catch{}
}

// Boutons UI
document.getElementById('btn-new').addEventListener('click', async ()=>{
  await askName();
  // En multijoueur: toujours gérer l'état "prêt"; le serveur lancera quand les deux sont prêts
  if(roomId){ toggleReady(); return; }
  // Solo
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  start();
});

// bouton pause retiré de l'UI

document.getElementById('btn-leaderboard').addEventListener('click', ()=>{
  if(dlgTop10 && top10ModalList){
    top10ModalList.innerHTML = '';
    apiTop10List().then((list)=>{
      top10ModalList.innerHTML = '';
      list.slice(0,10).forEach((e,i)=>{
        const li = document.createElement('li');
        li.textContent = `${i+1}. ${e.name} — ${e.score}`;
        top10ModalList.appendChild(li);
      });
    });
    dlgTop10.showModal();
  } else {
    renderTop10();
  }
});
if(top10Close){ top10Close.addEventListener('click', ()=> dlgTop10.close()); }
  // Aide
  try{
    const btnHelp = document.getElementById('btn-help');
    const dlgHelp = document.getElementById('dlg-help');
    const helpClose = document.getElementById('help-close');
    if(btnHelp && dlgHelp){ btnHelp.addEventListener('click', ()=> dlgHelp.showModal()); }
    if(helpClose && dlgHelp){ helpClose.addEventListener('click', ()=> dlgHelp.close()); }
  }catch{}

goNew.addEventListener('click', ()=>{ dlgGameOver.close(); start(); });

goClose.addEventListener('click', ()=>{ dlgGameOver.close(); running=false; paused=false; fx.stopMusic(); showStart(); });

// Init
(async function init(){
  if(playerName) elPlayerName.textContent = playerName; else await askName();
  // Taille gérée par fitBoardToContainer selon breakpoint
  resetGrid();
  spawn();
  // Fit-to-container après un tick pour que le layout soit appliqué
  try{ setTimeout(()=>{ placeMPPanel(); fitBoardToContainer(); draw(); }, 0); }catch{}
  draw();
  renderTop10();
  // Toggle Mode Easy
  const toggle = document.getElementById('easy-toggle');
  if(toggle){
    easyMode = toggle.checked;
    toggle.addEventListener('change', ()=>{ easyMode = toggle.checked; computeHint(); });
  }
  // Navigation écrans
  if(btnStartSolo){ btnStartSolo.addEventListener('click', (e)=>{ try{ e.stopPropagation(); }catch{} showGame(); start(); }); }
  if(btnStartMulti){ btnStartMulti.addEventListener('click', (e)=>{ try{ e.stopPropagation(); }catch{} showJoin(); }); }
  // Déverrouillage audio au premier geste (autoplay policy)
  try{
    const unlock = ()=>{ try{ fx.resume(); fx.playHomeIntroMusic(); }catch{} window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock, { once:true });
    window.addEventListener('keydown', unlock, { once:true });
  }catch{}
  // Délégation sur le conteneur héros (sécurité si certains listeners tombent)
  try{
    const heroContent = document.querySelector('.hero-content');
    if(heroContent){
      heroContent.addEventListener('click', (ev)=>{
        const btn = ev.target && (ev.target.closest && ev.target.closest('button'));
        if(!btn) return;
  if(btn.id === 'btn-start-solo'){ showGame(); start(); }
  else if(btn.id === 'btn-start-multi'){ showJoin(); }
        else if(btn.id === 'btn-hero-top10'){
          const b = document.getElementById('btn-hero-top10');
          if(b){ b.click(); }
        }
      });
    }
  }catch{}
  // Parallax léger sur le héros
  try{
    const hero = document.querySelector('.hero');
    if(hero){
  // sécurité: s’assurer qu’aucun overlay ne bloque les clics
  try{
    const veil = document.querySelector('.hero-veil');
    if(veil){ veil.style.pointerEvents = 'none'; veil.style.zIndex = '2'; }
    const bg = document.getElementById('hero-bg'); if(bg){ bg.style.pointerEvents='none'; bg.style.zIndex='1'; }
    const fx = document.getElementById('hero-fx'); if(fx){ fx.style.pointerEvents='none'; fx.style.zIndex='3'; }
    const content = document.querySelector('.hero-content'); if(content){ content.style.pointerEvents='auto'; content.style.zIndex='5'; }
  }catch{}
  hero.addEventListener('pointermove', (ev)=>{
        const r = hero.getBoundingClientRect();
        const px = Math.max(0, Math.min(100, ((ev.clientX - r.left)/r.width)*100));
        const py = Math.max(0, Math.min(100, ((ev.clientY - r.top)/r.height)*100));
        hero.style.setProperty('--px', String(px));
        hero.style.setProperty('--py', String(py));
      });
  // pas d'event.preventDefault ici: on ne bloque pas les clics
      hero.addEventListener('pointerleave', ()=>{ hero.style.removeProperty('--px'); hero.style.removeProperty('--py'); });
    }
  }catch{}
  const btnTopHero = document.getElementById('btn-hero-top10');
  const dlgTopHero = document.getElementById('dlg-top10-hero');
  const topHeroList = document.getElementById('top10-hero-list');
  const topHeroClose = document.getElementById('top10-hero-close');
  if(btnTopHero && dlgTopHero && topHeroList){
    btnTopHero.addEventListener('click', async ()=>{
      topHeroList.innerHTML = '';
      const list = await apiTop10List();
      list.slice(0,10).forEach((e,i)=>{
        const li = document.createElement('li');
        const date = e.ts ? new Date(e.ts) : null;
        const dateTxt = date ? date.toLocaleDateString() : '';
        const scoreTxt = Number(e.score||0).toLocaleString('fr-FR');
  const durTxt = formatDur(e.durationMs);
        li.className = i<3 ? 'prime' : '';
  // nom … score (avec liseré points), durée et date en dessous
  li.innerHTML = `<div class="line"><span class="nm">${escapeHtml(e.name||'Joueur')}</span><span class="dots"></span><span class="sc">${scoreTxt}${durTxt?` • ${durTxt}`:''}</span></div>${dateTxt?`<div class="sub">${dateTxt}</div>`:''}`;
        topHeroList.appendChild(li);
      });
      dlgTopHero.showModal();
    });
  }
  if(topHeroClose && dlgTopHero){ topHeroClose.addEventListener('click', ()=> dlgTopHero.close()); }
  if(btnJoinCreate){ btnJoinCreate.addEventListener('click', ()=>{ createRoom(); /* basculera vers le jeu à 'joined' */ }); }
  // bouton Rafraîchir retiré (plus de binding nécessaire)
  if(btnJoinBack){ btnJoinBack.addEventListener('click', ()=> showStart()); }
  // Onglets (Salons / Joueurs)
  if(tabRooms){ tabRooms.addEventListener('click', ()=>{ setJoinTab('rooms'); fetchRoomsJoin(); }); }
  if(tabPlayers){ tabPlayers.addEventListener('click', ()=>{ setJoinTab('players'); fetchPlayersJoin(); }); }
  if(mpCloseBtn){ mpCloseBtn.addEventListener('click', closeRoom); }
  if(mpLeaveBtn){
    // Quitter: pas de boîte de dialogue; retour direct titre + fermeture salon si besoin
    mpLeaveBtn.addEventListener('click', ()=>{
      if(roomId){
  leaveRoom();
      } else {
  running=false; paused=false; fx.stopMusic(); showStart();
      }
    });
  }
  connectWS();
  // envoyer un ping lors de la fermeture de l'onglet
  try{
    window.addEventListener('beforeunload', ()=>{
      try{ if(ws && ws.readyState===1){ ws.send(JSON.stringify({ type:'ping' })); } }catch{}
    });
  }catch{}
  // boutons de la modale résultat (rejouer/quitter)
  if(resReplay){
    resReplay.addEventListener('click', ()=>{
      dlgResult.close();
      if(roomId){
        // reset visuel immédiat en attente du compte à rebours
        mpStarted = false; selfDead = false; opponentDead = false; opponentActive = null;
        resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
        nextQueue = []; bag = []; draw(); if(oppCtx) drawOpponent();
  // Afficher le bandeau d'attente uniquement si l'adversaire n'est pas connecté
  showWaiting(!peerConnected);
  // marquer prêt côté UI
  myReady = true; updateReadyBadges();
        // marquer prêt/relancer côté serveur
        try{
          if(ws && ws.readyState===1){ ws.send(JSON.stringify({ type:'replay', room: roomId })); }
          else if(!myReady){ toggleReady(); }
        }catch{}
      } else {
        start();
      }
    });
  }
  if(resLeave){
    resLeave.addEventListener('click', ()=>{
      dlgResult.close();
      if(roomId){ leaveRoom(); } else { showStart(); }
    });
  }
  // cacher le plateau adverse par défaut
  updateOpponentVisibility();
  updateStartButtonLabel();
  // Animation héro (écran d'accueil)
  try{ setupHeroAnimation(); }catch{}
  // Repositionner le toast quand la fenêtre change en mode jeu
  try{
    window.addEventListener('resize', ()=>{ if(screenGame && screenGame.classList.contains('active')) positionToastForGame(); });
    window.addEventListener('scroll', ()=>{ if(screenGame && screenGame.classList.contains('active')) positionToastForGame(); }, { passive:true });
  }catch{}

  // Refit sur changement de breakpoint mobile/desktop
  try{
    const mq = window.matchMedia('(max-width: 900px)');
  const handler = ()=>{ placeMPPanel(); fitBoardToContainer(); draw(); balanceUnderPanelsHeight(); };
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
    // Affiner en mobile: écouter visualViewport et l'orientation si disponibles
    if(window.visualViewport){
  const vvHandler = ()=>{ if(screenGame && screenGame.classList.contains('active')){ fitBoardToContainer(); draw(); positionToastForGame(); balanceUnderPanelsHeight(); } };
      window.visualViewport.addEventListener('resize', vvHandler);
      window.visualViewport.addEventListener('scroll', vvHandler);
    }
  window.addEventListener('orientationchange', ()=>{ setTimeout(()=>{ fitBoardToContainer(); draw(); positionToastForGame(); balanceUnderPanelsHeight(); }, 50); });
  }catch{}
  try{ updateInputLock(); }catch{}

})();


// Gestion des onglets de l'écran "Rejoindre"
function setJoinTab(which){
  const showRooms = which === 'rooms';
  const showPlayers = which === 'players';
  if(roomsJoin){ roomsJoin.style.display = showRooms ? 'block' : 'none'; }
  // .players a un display:none en CSS, il faut forcer 'block' ici quand actif
  if(playersJoin){ playersJoin.style.display = showPlayers ? 'block' : 'none'; }
  if(tabRooms){ tabRooms.classList.toggle('active', showRooms); }
  if(tabPlayers){ tabPlayers.classList.toggle('active', showPlayers); }
  // Masquer le bouton Créer sur l'onglet Joueurs
  try{ const b = document.getElementById('btn-join-create'); if(b) b.style.display = showRooms ? '' : 'none'; }catch{}
  // empty-state visibility is managed by render functions, keep as-is
}

// Onglet par défaut: Salons
setJoinTab('rooms');

function ensureMusicMode(){
  // Intensité basée sur le niveau (augmente toutes les 30s) et la hauteur de pile
  const stackH = getStackHeight(); // 0..ROWS
  const lvl = Math.min(10, Math.max(1, Number(level||1)));
  const lvlNorm = (lvl - 1) / 9; // 0..1
  // Normaliser la pile: 0 quand vide, 1 quand proche du haut (dans ~3 lignes du plafond)
  const stackNorm = Math.min(1, Math.max(0, stackH / Math.max(1, ROWS - 3)));
  // Composer (max = montée rapide avec danger ou progression via niveau). Un peu plus sensible à la pile.
  const intensity = Math.max(lvlNorm * 0.9, stackNorm * 1.05);
  if(typeof fx.setMusicIntensity === 'function'){
    fx.setMusicIntensity(intensity);
  } else {
    fx.startMusic(intensity > 0.6 ? 'stress' : 'chill');
  }
  const frames = document.querySelectorAll('.boards .board-wrap .frame');
  // Blink uniquement en vrai mode « stress »: quand la pile entre dans la zone de risque (<=3 lignes du haut)
  // et que l'intensité dépasse le seuil.
  const inRiskZone = stackH >= (ROWS - 4); // déclenche un peu plus tôt
  const stressBlink = inRiskZone && (intensity > 0.6);
  if(frames && frames[0]){ frames[0].classList.toggle('stress-blink', stressBlink); }
}

function getStackHeight(){
  // retourne le nombre de lignes vides en haut (ou inversement hauteur de pile)
  let firstFilled = ROWS; // index de la première ligne non vide du haut
  for(let r=0;r<ROWS;r++){
    if(grid[r].some(Boolean)){ firstFilled = r; break; }
  }
  // lignes libres en haut
  return ROWS - firstFilled;
}

// ================== Multiplayer client ==================
function sanitizeHost(v){
  if(!v) return '';
  // strip protocol and leading slashes
  return v.replace(/^\s*/,'')
          .replace(/^https?:\/\//i,'')
          .replace(/^\/+/, '')
          .trim();
}

// getServerHost n'est plus utilisé; conserver pour compat si référencé
function getServerHost(){ return location.hostname; }

function connectWS(){
  if(ws && ws.readyState===1) return;
  if(wsConnecting) return; wsConnecting = true;
  try{
    const httpOrigin = getServerOrigin();
    const wsUrl = httpOrigin.replace(/^http(s?):\/\//i, 'ws$1://');
    ws = new WebSocket(wsUrl);
    ws.onopen = ()=>{
      // envoyer le nom et démarrer le heartbeat
  try{ ws.send(JSON.stringify({ type:'hello', name: playerName||'Player', cid: connId, pid: playerId })); }catch{}
      // Heartbeat toutes les 5s
      try{
        if(window._hb) clearInterval(window._hb);
        window._hb = setInterval(()=>{
      try{ if(ws && ws.readyState===1){ ws.send(JSON.stringify({ type:'ping', cid: connId })); } }catch{}
        }, 5000);
      }catch{}
      wsConnecting = false;
    };
    ws.onclose = (ev)=>{
      try{ if(window._hb) { clearInterval(window._hb); window._hb=null; } }catch{}
      wsConnecting = false;
      // If closed due to cid conflicts or rate-limit, do not auto-reconnect
      if(ev && (ev.code === 4001 || ev.code === 4002 || ev.code === 4003)){ return; }
      setTimeout(connectWS, 2000);
    };
    ws.onmessage = (ev)=>{
      let msg; try{ msg = JSON.parse(ev.data); }catch{return}
  switch(msg.type){
        case 'rooms': renderRoomsJoin(msg.rooms); break;
        case 'players':
          // Mettre à jour l'onglet "Joueurs" (écran Rejoindre) et le cache pour le résumé
          joinPlayersCache = Array.isArray(msg.players) ? msg.players : [];
          renderPlayersJoin(joinPlayersCache);
          // rafraîchir le résumé des salons avec le nombre total de joueurs connectés
          // (on réutilise la dernière liste de salons affichée via fetchRoomsJoin polling)
          // Le prochain tick de polling mettra aussi à jour, donc c'est best-effort
          break;
        case 'joined':
          roomId = msg.room; isOwner = !!msg.owner;
          roomMeta = { name: msg.name||null, ownerName: msg.ownerName||null, ownerTop: Number(msg.ownerTop||0) };
          // enregistrer notre id côté client
          if(msg.selfId) { try{ selfId = msg.selfId; }catch{} }
          // Reset complet : grilles, scores, statuts, victoires, overlays
          resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
          selfDead=false; opponentDead=false; opponentActive=null; mpStarted=false; serverCountdownActive=false;
          score=0; opponentScore=0; elScore && (elScore.textContent='0'); oppScoreEl && (oppScoreEl.textContent='0');
          myWins=0; oppWins=0; meScoreEl && (meScoreEl.textContent='0'); oppScoreEl && (oppScoreEl.textContent='0');
          myReady = !!isOwner; // l'hôte est prêt par défaut (miroir du serveur)
          peerReady=false; updateReadyBadges();
          // nom de l’adversaire si on n’est pas l’hôte
          if(!isOwner && roomMeta.ownerName){ const el= document.getElementById('opp-label'); if(el) el.textContent = roomMeta.ownerName; }
          updateOwnerUI(); updateStartButtonLabel(); showGame(); showWaiting(!peerConnected); updateOpponentVisibility(); renderPlayersList();
          try{ updateInputLock(); }catch{}
          // Si je suis hôte et prêt par défaut, envoyer l'état au serveur
          if(isOwner){ try{ ws && ws.readyState===1 && ws.send(JSON.stringify({type:'ready', ready:true})); }catch{} }
          // envoyer notre nom au serveur pour que l'autre voie notre pseudo
          if(ws && ws.readyState===1 && playerName){ ws.send(JSON.stringify({ type:'name', name: playerName })); }
          // afficher l'ID du salon
          if(roomTag && roomIdEl){ roomIdEl.textContent = roomId; roomTag.classList.remove('hidden'); }
          break;
        case 'state':
          if(msg.grid){ opponentGrid = msg.grid; }
          if(typeof msg.score==='number'){ opponentScore=msg.score; }
          if(msg.active){ opponentActive = msg.active; }
          // Redessiner immédiatement le plateau adverse pour qu’un joueur éliminé voie l’action en direct
          if(oppCtx){ drawOpponent(); }
          try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
          // ne pas toucher à opponentDead ici pour conserver l'affichage "Éliminé" jusqu'au prochain start
          break;
        case 'scores': {
          const list = Array.isArray(msg.list)? msg.list : [];
          const mine = list.find(e=> e && e.id === selfId);
          const other = list.find(e=> e && e.id !== selfId);
          if(mine && typeof mine.score==='number'){ score = mine.score; elScore && (elScore.textContent = String(score)); }
          if(other && typeof other.score==='number'){ opponentScore = other.score; }
          updateScoreLabels(); updateHUD(); renderPlayersList();
        } break;
        case 'peer': {
          const was = !!peerConnected;
          peerConnected = !!msg.connected;
          if(peerConnected){
            try{ fx.playJoinerSfx(); }catch{}
            showWaiting(false);
            try{ updateInputLock(); }catch{}
            // Annonce d'arrivée quand un joueur rejoint une partie ouverte
            if(!was){
              const nm = (msg && msg.name) || 'Un joueur';
              showToast(`${escapeHtml(nm)} a rejoint la partie`);
              setTimeout(()=>{ if(toastEl) toastEl.classList.add('hidden'); }, 3000);
            }
          } else {
            // l'autre joueur est absent. Ne pas écraser mon état "Prêt" (ex: hôte prêt par défaut)
            peerReady=false; updateReadyBadges(); showWaiting(true);
            if(mpStarted){
              mpStarted = false; selfDead = false; opponentDead = false; opponentActive = null;
              running = false; paused = false; fx.stopMusic();
              cancelServerCountdown();
            }
            resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
            nextQueue = []; bag = [];
            draw(); if(oppCtx) drawOpponent();
            try{ updateInputLock(); }catch{}
            if(was){
              const leaverName = (msg && (msg.name || null)) || (document.getElementById('opp-label')?.textContent) || 'Le joueur';
              showToast(`${leaverName} a quitté la partie`);
            }
          }
          updateOpponentVisibility(); updateStartButtonLabel(); renderPlayersList();
        } break;
        case 'gameover':
          opponentDead = true;
          // force un redraw immédiat pour afficher le bandeau Éliminé côté adverse
          draw(); if(oppCtx) drawOpponent();
          try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
          renderPlayersList();
          break;
        case 'ready': {
          // en cours de manche on n’altère pas l’affichage des statuts
          if(mpStarted) break;
          // Le serveur peut envoyer un snapshot ciblé avec 'who'
          const who = msg.who || null;
          if(who && selfId && who === selfId){
            myReady = !!msg.ready;
          } else if(who){
            peerReady = !!msg.ready;
          } else {
            // fallback historique (sans "who"): traiter comme l'état de l'adversaire
            peerReady = !!msg.ready;
          }
          updateReadyBadges(); renderPlayersList();
        } break;
        case 'countdown': onServerCountdown(msg.seconds||5); break;
        case 'countdown_cancel': cancelServerCountdown(); break;
        case 'start': onMatchStart(msg.seed); break;
        case 'matchover': onMatchOver(msg.scores); break;
        case 'room_closed': {
          // Afficher un message spécifique si l'hôte nous a éjecté ou a quitté
          const name = (roomMeta && roomMeta.ownerName) || 'L’hôte';
          showToast(`${name} a quitté la partie. Retour au salon…`);
          // revenir à l’écran join après 5s
          setTimeout(()=>{ onRoomClosed(); showJoin(); }, 5000);
        } break;
        case 'names': {
          const arr = msg.list || [];
          const other = arr.find(p=> p.id !== selfId);
          if(other && other.name){ const el= document.getElementById('opp-label'); if(el) el.textContent = other.name; }
          renderPlayersList();
        } break;
        case 'stress': {
          // Stress reçu: effet flash côté adversaire et musique stress temporaire
          const count = Number(msg.count||0);
          // petit flash visuel sur mon plateau (je suis la cible du stress)
          flashLines(Math.min(4, Math.max(1, count||3)));
          // forcer musique en mode stress pendant ~3s
          fx.startMusic('stress');
          setTimeout(()=>{ ensureMusicMode(); }, 3000);
          // shake léger du cadre
          try{ const frame = document.querySelector('.boards .board-wrap .frame'); if(frame){ frame.classList.add('shake'); setTimeout(()=>frame.classList.remove('shake'), 650); } }catch{}
        } break;
        case 'error': {
          const m = (msg && (msg.message||msg.msg||'Action refusée'))+'';
          showToast(m);
        } break;
      }
    };
  }catch{}
}

function mpSend(payload){
  if(ws && ws.readyState===1 && roomId){ ws.send(JSON.stringify({room: roomId, ...payload})); }
}

async function ensureWSReady(timeoutMs=4000){
  if(ws && ws.readyState === 1) return true;
  if(!ws || ws.readyState === 3){ try{ connectWS(); }catch{} }
  return await new Promise((resolve)=>{
    let settled = false;
    const to = setTimeout(()=>{ if(!settled){ settled = true; resolve(false); } }, timeoutMs);
    const attach = ()=>{
      try{
        if(ws){
          if(ws.readyState === 1){ if(!settled){ settled = true; clearTimeout(to); resolve(true); } return; }
          ws.addEventListener('open', ()=>{ if(!settled){ settled = true; clearTimeout(to); resolve(true); } }, { once:true });
        } else {
          setTimeout(attach, 50);
        }
      }catch{ if(!settled){ settled = true; clearTimeout(to); resolve(false); } }
    };
    attach();
  });
}

async function createRoom(){
  const ok = await ensureWSReady();
  if(!(ok && ws && ws.readyState===1)){
    showToast('Connexion serveur indisponible.');
    return;
  }
  const randomName = 'Salon-' + Math.random().toString(36).slice(2,6).toUpperCase();
  let myTop = 0;
  try{
    const list = await apiTop10List();
    myTop = (list||[]).filter(e=> e.name === playerName).map(e=> e.score).sort((a,b)=>b-a)[0] || 0;
  }catch{}
  try{ ws.send(JSON.stringify({type:'create', name: randomName, ownerName: playerName||'Player', ownerTop: myTop })); }catch{}
  // Rester sur l’écran courant: on basculera vers le jeu à la réception de 'joined'
  // Mettre à jour la liste des salons pour afficher rapidement le nouveau salon
  fetchRoomsJoin();
}

function closeRoom(){
  if(ws && ws.readyState===1 && roomId){ ws.send(JSON.stringify({type:'close', room: roomId})); }
}

function leaveRoom(){
  if(ws && ws.readyState===1 && roomId){
    if(isOwner){ ws.send(JSON.stringify({type:'close', room: roomId})); }
    else { ws.send(JSON.stringify({type:'leave'})); }
    onRoomClosed();
    fetchRoomsJoin();
  }
}

async function fetchRoomsJoin(){
  try{
  // Utilise l'origine serveur configurée (VITE_SERVER_ORIGIN en prod)
  const base = getServerOrigin();
    const res = await fetch(`${base}/rooms`, { cache:'no-store' });
    const data = await res.json();
    renderRoomsJoin(data.rooms||[]);
  }catch(e){
    // afficher une info vide mais permettre de réessayer
    renderRoomsJoin([]);
  }
}

async function fetchPlayersJoin(){
  try{
  const base = getServerOrigin();
    const res = await fetch(`${base}/players`, { cache:'no-store' });
    const data = await res.json();
  joinPlayersCache = Array.isArray(data.players)? data.players : [];
  renderPlayersJoin(joinPlayersCache);
  }catch(e){
    renderPlayersJoin([]);
  }
}

function renderRoomsJoin(rooms){
  if(!roomsJoin) return;
  roomsJoin.innerHTML = '';
  // Ne modifier le titre que si l'onglet Salons est actif
  if(joinTitle && tabRooms && tabRooms.classList.contains('active')) joinTitle.textContent = 'Salons';
  // Stats globales (côté serveur uniquement)
 
  const total = Number(rooms.length||0);
  // joueurs connectés = tous les joueurs actifs côté serveur, pas seulement dans les salons
  const players = Array.isArray(joinPlayersCache) ? joinPlayersCache.length : 0;
  const inBattle = rooms.reduce((s,r)=> s + (r.started?1:0), 0);
  if(roomsSummary){ roomsSummary.textContent = `Salons: ${total} • Joueurs connectés: ${players} • Parties en cours: ${inBattle}`; }
  // Tri: non pleins d'abord, puis en bataille, puis récents
  const statusRank = (r)=> (r.count<2 ? 0 : (r.started?1:2));
  const sorted = rooms.slice().sort((a,b)=> statusRank(a)-statusRank(b) || (b.lastEndedTs||0)-(a.lastEndedTs||0));
  // Empty state uniquement si l'onglet Salons est actif
  if(tabRooms && tabRooms.classList.contains('active')){
    if(sorted.length===0 && joinEmpty){ joinEmpty.classList.remove('hidden'); }
    else if(joinEmpty){ joinEmpty.classList.add('hidden'); }
  }
  sorted.forEach(r=>{
    const li = document.createElement('li');
    const title = r.name || r.id;
    const statusKey = r.count>=2 && r.started ? 'battle' : (r.count>=2 ? 'done' : 'open');
    const statusText = statusKey==='battle' ? 'Bataille' : statusKey==='done' ? 'Terminé' : 'Ouvert';
    // Bloc gauche (titre + meta)
    const left = document.createElement('div'); left.className = 'room-title';
    const meta = [];
  if(r.ownerName){ meta.push(`Hôte: ${r.ownerName}${r.ownerTop?` (Top ${r.ownerTop})`:''}`); }
    meta.push(`${r.count}/2`);
  left.innerHTML = `<strong>${escapeHtml(title)}</strong> <small>— ${escapeHtml(r.id)}</small><br><small>${escapeHtml(meta.join(' • '))}</small>`;
    // Bloc droit (statut + bouton)
    const right = document.createElement('div'); right.className = 'room-right';
    const badge = document.createElement('span'); badge.className = 'badge status ' + (statusKey==='battle'?'danger':(statusKey==='open'?'good':'')); badge.textContent = statusText;
    const btn = document.createElement('button'); btn.className='btn sm'; btn.textContent='Rejoindre';
    btn.disabled = r.count>=2; // non joignable si plein
    btn.addEventListener('click', ()=>{ joinRoom(r.id); /* basculera vers le jeu à 'joined' */ });
    right.appendChild(badge); right.appendChild(btn);
    li.appendChild(left); li.appendChild(right);
    roomsJoin.appendChild(li);
  });
}

function renderPlayersJoin(players){
  if(!playersJoin) return;
  playersJoin.innerHTML = '';
  // Ne modifier le titre que si l'onglet Joueurs est actif
  if(joinTitle && tabPlayers && tabPlayers.classList.contains('active')) joinTitle.textContent = 'Joueurs';
  const now = Date.now();
  const sorted = (players||[]).slice().sort((a,b)=>{
    // ordre: d'abord ceux en salon (room non nul), puis par nom croissant
    const ar = a.room?0:1, br = b.room?0:1; if(ar!==br) return ar-br;
    const an = (a.name||'').toLowerCase();
    const bn = (b.name||'').toLowerCase();
    if(an<bn) return -1; if(an>bn) return 1; return 0;
  });
  // Empty state uniquement si l'onglet Joueurs est actif
  if(tabPlayers && tabPlayers.classList.contains('active')){
    if(sorted.length===0 && joinEmpty){ joinEmpty.classList.remove('hidden'); }
    else if(joinEmpty){ joinEmpty.classList.add('hidden'); }
  }
  sorted.forEach(p=>{
    const li = document.createElement('li');
    const age = Math.max(0, Math.floor((now - (p.lastSeen||0))/1000));
    const nm = p.name || 'Joueur';
    const room = p.room ? `Salon: ${p.room}` : '—';
    li.innerHTML = `<span>${nm}</span><span class="badge">${room} • ${age}s</span>`;
    playersJoin.appendChild(li);
  });
}

async function joinRoom(id){
  const ok = await ensureWSReady();
  if(ok && ws && ws.readyState===1){ ws.send(JSON.stringify({type:'join', room:id})); roomId = id; }
}

function drawOpponent(){
  oppCtx.clearRect(0,0,oppCvs.width,oppCvs.height);
  // fond grille
  oppCtx.fillStyle = '#0e1116';
  oppCtx.fillRect(0,0,oppCvs.width,oppCvs.height);
  oppCtx.strokeStyle = '#1f242c';
  oppCtx.lineWidth = 1;
  for(let i=1;i<COLS;i++){ oppCtx.beginPath(); oppCtx.moveTo(i*TILE,0); oppCtx.lineTo(i*TILE,ROWS*TILE); oppCtx.stroke(); }
  for(let j=1;j<ROWS;j++){ oppCtx.beginPath(); oppCtx.moveTo(0,j*TILE); oppCtx.lineTo(COLS*TILE,j*TILE); oppCtx.stroke(); }
  // cellules adverses
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const k = opponentGrid[r][c]; if(!k) continue; drawOppCell(c,r,COLORS[k]);
  }

  // Effet stress si on vient d'envoyer des lignes à l'adversaire
  if(oppStressUntil && performance.now() < oppStressUntil){
    const t = 1 - Math.max(0, (oppStressUntil - performance.now())/800);
    const alpha = 0.15 + 0.25*Math.sin(t*Math.PI*2);
    oppCtx.save();
    oppCtx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
    oppCtx.fillRect(0,0,oppCvs.width,oppCvs.height);
    oppCtx.restore();
  }
  // pièce active adverse
  if(opponentActive && opponentActive.mat){
    oppCtx.save(); oppCtx.globalAlpha = 0.65;
    const color = COLORS[opponentActive.key] || '#9AA0A8';
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(opponentActive.mat[j][i]){
      drawOppCell(opponentActive.x+i, opponentActive.y+j, color);
    }
    oppCtx.restore();
  }
  // overlay Game Over si l'adversaire a perdu
  if(opponentDead){
  oppCtx.save();
  const h = 42;
  oppCtx.fillStyle = 'rgba(0,0,0,0.6)';
  oppCtx.fillRect(0, oppCvs.height - h, oppCvs.width, h);
  oppCtx.fillStyle = '#ef4444';
  oppCtx.font = 'bold 20px Orbitron, system-ui';
  oppCtx.textAlign = 'center';
  oppCtx.textBaseline = 'middle';
  oppCtx.fillText('Éliminé', oppCvs.width/2, oppCvs.height - h/2);
  oppCtx.restore();
  }
}

function drawOppCell(cx,cy,color){
  const px=cx*TILE, py=cy*TILE;
  const grad = oppCtx.createLinearGradient(px,py,px,py+TILE);
  grad.addColorStop(0, shade(color, 6));
  grad.addColorStop(1, shade(color,-8));
  oppCtx.fillStyle = grad;
  roundRect(oppCtx, px+2, py+2, TILE-4, TILE-4, 6);
  oppCtx.fill();
  oppCtx.strokeStyle = 'rgba(0,0,0,.25)';
  oppCtx.lineWidth = 1.5;
  roundRect(oppCtx, px+2, py+2, TILE-4, TILE-4, 6);
  oppCtx.stroke();
}

function drawOppMini(){
  if(!oppMiniCtx || !oppMini) return;
  const W = oppMini.clientWidth || oppMini.width, H = oppMini.clientHeight || oppMini.height;
  if(oppMini.width !== W) oppMini.width = W;
  if(oppMini.height !== H) oppMini.height = H;
  oppMiniCtx.clearRect(0,0,W,H);
  oppMiniCtx.fillStyle = '#0e1116'; oppMiniCtx.fillRect(0,0,W,H);
  oppMiniCtx.strokeStyle = '#1f242c'; oppMiniCtx.lineWidth = 1;
  const s = Math.min(Math.floor(W/COLS), Math.floor(H/ROWS));
  for(let i=1;i<COLS;i++){ oppMiniCtx.beginPath(); oppMiniCtx.moveTo(i*s,0); oppMiniCtx.lineTo(i*s,ROWS*s); oppMiniCtx.stroke(); }
  for(let j=1;j<ROWS;j++){ oppMiniCtx.beginPath(); oppMiniCtx.moveTo(0,j*s); oppMiniCtx.lineTo(COLS*s,j*s); oppMiniCtx.stroke(); }
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const k = opponentGrid[r][c]; if(!k) continue;
    const px=c*s, py=r*s;
    const grad = oppMiniCtx.createLinearGradient(px,py,px,py+s);
    grad.addColorStop(0, shade(COLORS[k], 6));
    grad.addColorStop(1, shade(COLORS[k], -8));
    oppMiniCtx.fillStyle = grad;
    roundRect(oppMiniCtx, px+1, py+1, s-2, s-2, 3); oppMiniCtx.fill();
  }
  // pièce active adverse (pour voir “défiler” dans la miniature)
  if(opponentActive && opponentActive.mat){
    oppMiniCtx.save();
    oppMiniCtx.globalAlpha = 0.8;
    const color = COLORS[opponentActive.key] || '#9AA0A8';
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(opponentActive.mat[j][i]){
      const cx = opponentActive.x + i;
      const cy = opponentActive.y + j;
      if(cx<0||cx>=COLS||cy<0||cy>=ROWS) continue;
      const px=cx*s, py=cy*s;
      const grad = oppMiniCtx.createLinearGradient(px,py,px,py+s);
      grad.addColorStop(0, shade(color, 6));
      grad.addColorStop(1, shade(color, -8));
      oppMiniCtx.fillStyle = grad;
      roundRect(oppMiniCtx, px+1, py+1, s-2, s-2, 3); oppMiniCtx.fill();
    }
    oppMiniCtx.restore();
  }
}

// Broadcast state periodically
setInterval(()=>{
  if(!roomId) return;
  // Émettre seulement si une manche est en cours
  if(!mpStarted || !running) return;
  updateScoreLabels();
  mpSend({type:'state', grid, score, active: active? { key: active.key, mat: active.mat, x, y } : null});
}, 250);

function broadcastState(){
  if(!roomId) return;
  // N’envoyer que pendant la partie
  if(!mpStarted || !running) return;
  mpSend({type:'state', grid, score, active: active? { key: active.key, mat: active.mat, x, y } : null});
}

// ------------- Ready/Start/Seeded RNG -------------
function toggleReady(){
  myReady = !myReady;
  updateReadyBadges();
  updateStartButtonLabel();
  if(!myReady){ cancelServerCountdown(); }
  ws && ws.readyState===1 && ws.send(JSON.stringify({type:'ready', ready:myReady}));
}

function onMatchStart(seedStr){
  seed = seedStr || (Date.now()+':'+Math.random());
  rng = mulberry32(hashSeed(seed));
  mpStarted = true;
  score = 0; opponentScore = 0; elScore && (elScore.textContent='0');
  updateScoreLabels();
  bag = []; nextQueue = [];
  opponentDead = false; opponentActive = null; selfDead = false;
  // démarrer immédiatement (le serveur a affiché le compte à rebours)
  cancelServerCountdown();
  start();
  // conserver l’état "Prêt" affiché durant la manche
  updateReadyBadges();
  updateStartButtonLabel();
  try{ updateInputLock(); }catch{}
}

function onMatchOver(scores){
  mpStarted = false;
  running=false; paused=false; fx.stopMusic();
  cancelServerCountdown();
  // Purge affichage plateau
  selfDead = false; opponentDead = false; opponentActive = null;
  resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  nextQueue = []; bag = [];
  draw(); if(oppCtx && roomId) drawOpponent();
  // Affiche un récap simple basé sur nos valeurs locales
  const me = Number(score||0);
  const opp = Number(opponentScore||0);
  let verdict = 'Égalité';
  if(me>opp) verdict = 'Victoire'; else if(me<opp) verdict = 'Défaite';
  const html = `Vous: ${me}<br>Adversaire: ${opp}<br><strong>${verdict}</strong>`;
  if(resultLines){ resultLines.innerHTML = html; }
  dlgResult && dlgResult.showModal();
  // nouvelle manche: réafficher le bouton et remettre les statuts toggleables
  myReady = false; peerReady = false; updateReadyBadges();
  updateStartButtonLabel();
  if(verdict==='Victoire') myWins++; else if(verdict==='Défaite') oppWins++;
  updateScoreLabels();
  try{ updateInputLock(); }catch{}
}
// références doublons supprimées (gérées au début du fichier et dans init())

function onRoomClosed(){
  // Le salon est fermé (par l'hôte ou purge). Ici on revient à l'écran de titre.
  roomId = null; peerConnected = false; opponentScore = 0;
  opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  if(oppScoreEl) oppScoreEl.textContent = '0';
  myReady=false; peerReady=false; updateReadyBadges();
  opponentDead = false; opponentActive = null;
  updateOpponentVisibility();
  updateStartButtonLabel();
  isOwner = false; updateOwnerUI();
  // stopper le jeu si une boucle tournait encore
  running=false; paused=false; fx.stopMusic();
  showStart();
  try{ updateInputLock(); }catch{}
  // fermer modales éventuelles
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  // reset compteurs de victoires
  if(meScoreEl) meScoreEl.textContent = '0';
  if(oppScoreEl) oppScoreEl.textContent = '0';
  // masquer l'ID du salon
  if(roomTag){ roomTag.classList.add('hidden'); }
}
function updateOwnerUI(){
  if(mpCloseBtn){ mpCloseBtn.disabled = !isOwner; }
}

function updateReadyBadges(){
  if(meReadyEl){ meReadyEl.textContent = myReady ? 'Prêt' : 'Pas prêt'; meReadyEl.classList.toggle('ready', myReady); meReadyEl.classList.toggle('wait', !myReady); }
  if(oppReadyEl){ oppReadyEl.textContent = peerReady ? 'Prêt' : 'Pas prêt'; oppReadyEl.classList.toggle('ready', peerReady); oppReadyEl.classList.toggle('wait', !peerReady); }
  renderPlayersList();
}

function showCountdown(seconds, onDone){
  const startT = performance.now();
  const dur = seconds*1000;
  function drawCountdown(){
    const now = performance.now();
    const left = Math.max(0, dur - (now - startT));
    const n = Math.ceil(left/1000);
    // clear overlays
    if(ctx){ ctx.save(); ctx.clearRect(0,0,0,0); ctx.restore(); }
    // Draw on both boards: big number centered
    const drawNum = (c, cvsEl)=>{
      const t = n>0 ? String(n) : 'GO';
      c.save();
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(0,0,cvsEl.width,cvsEl.height);
      c.fillStyle = '#e5e7eb'; c.textAlign='center'; c.textBaseline='middle';
      c.font = 'bold 72px Orbitron, system-ui';
      c.fillText(t, cvsEl.width/2, cvsEl.height/2);
      c.restore();
    };
    // Draw to our board (overlay using main ctx on top of frame contents)
    draw(); // ensure background
    drawNum(ctx, cvs);
    if(peerConnected && oppCtx){ drawOpponent(); drawNum(oppCtx, oppCvs); }
    if(left>0){ requestAnimationFrame(drawCountdown); }
    else { draw(); if(peerConnected && oppCtx) drawOpponent(); onDone && onDone(); }
  }
  requestAnimationFrame(drawCountdown);
}

// (anciennes fonctions UI prêtes supprimées)

function hashSeed(str){
  let h=1779033703^str.length; for(let i=0;i<str.length;i++){ h = Math.imul(h^str.charCodeAt(i), 3432918353); h = (h<<13)|(h>>>19); }
  return (h>>>0);
}

function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rngInt(n){ return Math.floor(rng()*n); }

// UI helpers
function fitBoardToContainer(){
  if(!cvs || !cvs.parentElement) return;
  const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  if(!isMobile){
    // Desktop: en solo, agrandir le plateau selon l'espace; en multi, rester sur 300x600
    const app = document.getElementById('app');
    const isSolo = !!(app && app.classList.contains('solo-mode'));
    // Mesures d'espace dispo
    const gap = 16; // gap de la grille desktop
    let topH=0, botH=0;
    try{
      const topbar = document.querySelector('.topbar');
      const bottombar = document.querySelector('.bottombar');
      topH = topbar ? topbar.getBoundingClientRect().height : 0;
      botH = bottombar ? bottombar.getBoundingClientRect().height : 0;
    }catch{}
    const appEl = document.getElementById('app');
    const appPadX = 32; // padding latéral ~16px * 2
    const appW = (appEl ? appEl.clientWidth : window.innerWidth) - appPadX;
    const viewH = window.innerHeight - topH - botH - 48; // marge de respiration
    // Sidebar desktop fixe 300px
    const sidebarW = 300;
    if(isSolo){
      // Largeur disponible pour le plateau (colonne gauche)
      const maxWFromWidth = Math.max(280, Math.floor(appW - sidebarW - gap));
      const maxWFromHeight = Math.max(280, Math.floor(viewH / 2));
      let targetW = Math.min(maxWFromWidth, maxWFromHeight);
  // bornes raisonnables (élargies pour réduire l'espace vide en solo desktop)
  targetW = Math.max(300, Math.min(820, targetW));
  TILE = Math.max(16, Math.min(56, Math.floor(targetW / COLS)));
      const pxW = TILE * COLS;
      const pxH = TILE * ROWS;
      if(cvs.width !== pxW) cvs.width = pxW;
      if(cvs.height !== pxH) cvs.height = pxH;
      if(fxCvs.width !== pxW) fxCvs.width = pxW;
      if(fxCvs.height !== pxH) fxCvs.height = pxH;
      cvs.style.width = pxW + 'px';
      cvs.style.height = pxH + 'px';
      fxCvs.style.width = pxW + 'px';
      fxCvs.style.height = pxH + 'px';
      // Mettre à jour la variable CSS --board-w (canvas + padding/bordure ≈ 22px)
      try{ document.documentElement.style.setProperty('--board-w', (pxW + 22) + 'px'); }catch{}
      return;
    } else {
      // Multi: taille fixe
      TILE = 30;
      if(cvs.width !== COLS*TILE) cvs.width = COLS*TILE;
      if(cvs.height !== ROWS*TILE) cvs.height = ROWS*TILE;
      if(fxCvs.width !== COLS*TILE) fxCvs.width = COLS*TILE;
      if(fxCvs.height !== ROWS*TILE) fxCvs.height = ROWS*TILE;
      cvs.style.width = cvs.width + 'px';
      cvs.style.height = cvs.height + 'px';
      fxCvs.style.width = fxCvs.width + 'px';
      fxCvs.style.height = fxCvs.height + 'px';
      // Remettre --board-w sur la valeur par défaut (322px) si besoin
      try{ document.documentElement.style.setProperty('--board-w', '322px'); }catch{}
      return;
    }
  }
  // Fit to container (mobile):
  // 1) Largeur réelle du conteneur boards (en mobile: pleine largeur)
  let availW = (()=>{
    try{
      const boards = document.querySelector('#app .boards');
      if(boards && boards.clientWidth) return boards.clientWidth;
      const layout = document.querySelector('#app .layout');
      if(layout && layout.clientWidth) return layout.clientWidth;
      return window.innerWidth - 24;
    }catch{ return Math.max(120, window.innerWidth - 24); }
  })();
  // 2) Hauteur visible (précise) = visualViewport.height - topbar - bottombar - petite marge
  let vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
  try{
    const topbar = document.querySelector('.topbar');
    const bottombar = document.querySelector('.bottombar');
    const topH = topbar ? topbar.getBoundingClientRect().height : 0;
    const botH = bottombar ? bottombar.getBoundingClientRect().height : 0;
    // marge plus serrée pour maximiser la hauteur du plateau
    vh = Math.max(240, vh - topH - botH - 4);
  }catch{}
  // 3) Le canvas est dans .frame (padding 10, bordure ≈ 2) -> extra ≈ 22 px en largeur, 20px en hauteur
  const frameExtraW = 22, frameExtraH = 20;
  const maxCanvasWByWidth = Math.max(100, Math.floor(availW - frameExtraW));
  const maxCanvasWByHeight = Math.max(100, Math.floor((vh - frameExtraH) / 2)); // ratio 1:2
  const targetCanvasW = Math.max(120, Math.min(maxCanvasWByWidth, maxCanvasWByHeight));
  // 4) Recalcul TILE (entier) à partir de la largeur visée du canvas
  TILE = Math.max(12, Math.floor(targetCanvasW / COLS));
  const pxW = TILE * COLS; // taille intrinsèque du canvas
  const pxH = TILE * ROWS;
  // appliquer taille intrinsèque (backing store) pour éviter le flou
  if(cvs.width !== pxW) cvs.width = pxW;
  if(cvs.height !== pxH) cvs.height = pxH;
  if(fxCvs.width !== pxW) fxCvs.width = pxW;
  if(fxCvs.height !== pxH) fxCvs.height = pxH;
  // appliquer tailles CSS pour l’affichage (peuvent différer légèrement)
  cvs.style.width = pxW + 'px';
  cvs.style.height = pxH + 'px';
  fxCvs.style.width = pxW + 'px';
  fxCvs.style.height = pxH + 'px';
  try{ document.documentElement.style.setProperty('--board-w', (pxW + 22) + 'px'); }catch{}
}

function updateOpponentVisibility(){
  if(!oppCvs) return;
  const wrap = oppCvs.closest('.board-wrap');
  // Ne pas forcer l'affichage en mobile; laisser le CSS masquer #board-opp
  if(wrap){
    if(window.matchMedia && window.matchMedia('(max-width: 900px)').matches){
      wrap.style.display = ''; // laisser CSS décider
    } else {
      wrap.style.display = roomId ? 'flex' : 'none';
    }
  }
  if(waitBanner){ waitBanner.classList.toggle('hidden', !roomId || !!peerConnected); }
  try{
    const app = document.getElementById('app');
    if(app){ app.classList.toggle('solo-mode', !roomId); }
  }catch{}
  if(panelMP){ panelMP.classList.toggle('hidden', !roomId); }
  // Positionner le panneau MP selon le breakpoint (mobile: plein largeur sous les plateaux)
  try{ placeMPPanel(); }catch{}
  // Recalibrer la taille du plateau au basculement solo/multi
  try{ fitBoardToContainer(); draw(); balanceUnderPanelsHeight(); }catch{}
  // miniature en sidebar: visible seulement en multi (gérée par CSS via .solo-mode)
}

// ---------- UI helpers ----------
function updateStartButtonLabel(){
  if(!btnNew) return;
  // En salon: montrer toujours "Je suis prêt"; désactiver tant qu'aucun adversaire
  if(roomId){
    // Pendant une manche, masquer le bouton pour éviter les changements d'état
    if(mpStarted){
      btnNew.style.display = 'none';
    } else {
      btnNew.style.display = '';
      btnNew.textContent = 'Je suis prêt';
      // Laisser cliquable même durant le compte à rebours pour permettre d'annuler
      btnNew.disabled = false;
      // Visibilité accrue: clignoter tant que je ne suis pas prêt
      btnNew.classList.toggle('cta-blink', !myReady);
    }
  } else {
    btnNew.style.display = '';
    btnNew.textContent = 'Nouvelle partie';
    btnNew.disabled = false;
    btnNew.classList.remove('cta-blink');
  }
}

// Navigation entre écrans (Start / Join / Game)
function showStart(){
  setScreen('start');
  try{ fx.playHomeIntroMusic(); }catch{}
}
let joinPoll = null;
function showJoin(){
  setScreen('join');
  // Onglet par défaut: Salons (Créer accessible uniquement ici)
  setJoinTab('rooms');
  fetchRoomsJoin();
  fetchPlayersJoin();
  if(joinPoll) clearInterval(joinPoll);
  joinPoll = setInterval(()=>{ fetchRoomsJoin(); fetchPlayersJoin(); }, 1500);
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  // Remettre l'UI à plat
  resetIdleView();
}
function showGame(){
  setScreen('game');
  if(joinPoll) { clearInterval(joinPoll); joinPoll = null; }
  try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch{}
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  // Si aucune manche ne tourne, basculer sur un état propre
  if(!running && !mpStarted){ resetIdleView(); }
  try{ placeMPPanel(); fitBoardToContainer(); balanceUnderPanelsHeight(); }catch{}
  draw(); updateOpponentVisibility(); updateStartButtonLabel(); renderPlayersList();
  positionToastForGame();
}
function setScreen(which){
  if(screenStart) screenStart.classList.toggle('active', which==='start');
  if(screenJoin) screenJoin.classList.toggle('active', which==='join');
  if(screenGame) screenGame.classList.toggle('active', which==='game');
  // démarrer/arrêter l'animation du héro selon l'écran
  if(which==='start'){ try{ startHeroAnimation(); }catch{} }
  else { try{ stopHeroAnimation(); }catch{} }
  // Adapter la position du toast au contexte
  if(which==='game') positionToastForGame(); else resetToastPosition();
}
function showWaiting(on){
  if(!waitBanner) return;
  waitBanner.classList.toggle('hidden', !on);
  if(on){
    // stop any running solo game while waiting for an opponent
  if(running){ running = false; paused = false; fx.stopMusic(); }
    updateStartButtonLabel();
  }
}

function renderPlayersList(){
  if(!playersListEl) return;
  playersListEl.innerHTML = '';
  // Afficher uniquement les joueurs du salon courant (Moi + Adversaire)
  const me = document.createElement('li');
  me.innerHTML = `<span>Moi</span><span class="badge">${Number(score||0)}</span>`;
  playersListEl.appendChild(me);
  const opp = document.createElement('li');
  if(peerConnected){
    const name = (document.getElementById('opp-label')?.textContent)||'Adversaire';
    opp.innerHTML = `<span>${name}</span><span class="badge">${Number(opponentScore||0)}</span>`;
  } else {
    opp.innerHTML = `<span>—</span><span class="badge">Absent</span>`;
  }
  playersListEl.appendChild(opp);
}

// --------- Toast helper ---------
function showToast(msg){
  if(!toastEl) return;
  toastEl.innerHTML = `<span class="msg">${msg}</span>`;
  toastEl.classList.remove('hidden');
  // En jeu: centrage entre les plateaux
  if(screenGame && screenGame.classList.contains('active')){ positionToastForGame(); toastEl.classList.add('at-center'); }
  setTimeout(()=>{ toastEl.classList.add('hidden'); }, 5000);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (ch)=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  }[ch]));
}

// -------- Positionnement toast (centre entre les plateaux) --------
function positionToastForGame(){
  if(!toastEl) return;
  try{
    const boards = document.querySelector('.boards');
    if(!boards){ resetToastPosition(); return; }
    const r = boards.getBoundingClientRect();
    const cx = r.left + r.width/2 + window.scrollX;
    const cy = r.top + r.height/2 + window.scrollY;
    toastEl.style.setProperty('--toast-left', cx+'px');
    toastEl.style.setProperty('--toast-top', cy+'px');
    toastEl.classList.add('at-center');
  }catch{}
}
function resetToastPosition(){
  if(!toastEl) return;
  toastEl.classList.remove('at-center');
  toastEl.style.removeProperty('--toast-left');
  toastEl.style.removeProperty('--toast-top');
}

function formatDur(ms){
  const t = Number(ms||0); if(!t || !Number.isFinite(t)) return '';
  const s = Math.floor(t/1000);
  const m = Math.floor(s/60);
  const r = s%60;
  return `${m}:${String(r).padStart(2,'0')}`;
}

// --------- Placement adaptatif du panneau Multijoueur ---------
function placeMPPanel(){
  if(!panelMP) return;
  const layout = document.querySelector('#app .layout');
  const sidebar = document.querySelector('#app .sidebar');
  const under = document.getElementById('under-panels');
  if(!layout || !sidebar) return;
  const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  const appEl = document.getElementById('app');
  const isSolo = !!(appEl && appEl.classList.contains('solo-mode'));
  if(isMobile){
    // Sidebar à droite: on garde Next et Aperçu adversaire dans la sidebar
    try{
      const panelNext = document.querySelector('#app .panel.next');
      const oppPrev = document.querySelector('#app .panel.opp-preview');
      if(panelNext && panelNext.parentElement !== sidebar) sidebar.appendChild(panelNext);
      if(oppPrev && oppPrev.parentElement !== sidebar) sidebar.appendChild(oppPrev);
    }catch{}
    const status = document.querySelector('#app .panel.status');
  if(isSolo){
      // SOLO: laisser le statut dans la sidebar, au-dessus de Next
      if(status && status.parentElement !== sidebar){
        // insérer avant le premier panel de la sidebar (Next s’il existe)
        const firstPanel = sidebar.querySelector('.panel');
        if(firstPanel){ sidebar.insertBefore(status, firstPanel); }
        else { sidebar.appendChild(status); }
      }
      // MP (masqué en solo) peut rester où il est; pas de zone under nécessaire
  } else {
      // MULTI: Statut + Multijoueur sous le plateau, même rangée
      if(under){
        if(status){
          status.style.removeProperty('grid-area');
          status.style.removeProperty('gridColumn');
          status.style.removeProperty('gridRow');
          if(status.parentElement !== under) under.appendChild(status);
        }
        panelMP.style.removeProperty('grid-area');
        panelMP.style.removeProperty('gridColumn');
        panelMP.style.removeProperty('gridRow');
        if(panelMP.parentElement !== under) under.appendChild(panelMP);
      }
    }
    panelMP.style.removeProperty('grid-area');
    panelMP.style.removeProperty('gridColumn');
    panelMP.style.removeProperty('gridRow');
  } else {
    // Revenir en desktop: tous les panneaux dans la sidebar comme avant
    try{
      const status = document.querySelector('#app .panel.status');
      const next = document.querySelector('#app .panel.next');
      const oppPrev = document.querySelector('#app .panel.opp-preview');
      if(status && status.parentElement !== sidebar) sidebar.appendChild(status);
      if(next && next.parentElement !== sidebar) sidebar.appendChild(next);
      if(oppPrev && oppPrev.parentElement !== sidebar) sidebar.appendChild(oppPrev);
    }catch{}
    if(panelMP.parentElement !== sidebar){ sidebar.appendChild(panelMP); }
    panelMP.style.removeProperty('grid-area');
  }
}

// Uniformiser la hauteur des panneaux sous le plateau (mobile + multi)
function balanceUnderPanelsHeight(){
  try{
    const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
    const appEl = document.getElementById('app');
    const isSolo = !!(appEl && appEl.classList.contains('solo-mode'));
    if(!isMobile || isSolo) return;
    const under = document.getElementById('under-panels');
    if(!under) return;
    const cards = under.querySelectorAll('.panel');
    if(cards.length<2) return;
    // reset
    cards.forEach(c=> c.style.removeProperty('minHeight'));
    // aligner sur la plus grande
    let h = 0; cards.forEach(c=>{ h = Math.max(h, c.getBoundingClientRect().height); });
    cards.forEach(c=> c.style.minHeight = Math.ceil(h)+ 'px');
  }catch{}
}

// ======== Animation Héro (canvas) ========
let heroCvs=null, heroFxCvs=null, heroCtx=null, heroFxCtx=null, heroRAF=0, heroBlocks=[], heroParticles=[];
function setupHeroAnimation(){
  heroCvs = document.getElementById('hero-bg');
  heroFxCvs = document.getElementById('hero-fx');
  if(!heroCvs) return;
  heroCtx = heroCvs.getContext('2d');
  heroFxCtx = heroFxCvs ? heroFxCvs.getContext('2d') : null;
  const resize=()=>{ 
    heroCvs.width = heroCvs.clientWidth; heroCvs.height = heroCvs.clientHeight;
    if(heroFxCvs){ heroFxCvs.width = heroFxCvs.clientWidth; heroFxCvs.height = heroFxCvs.clientHeight; }
  };
  resize(); window.addEventListener('resize', resize);
  // graines initiales
  heroBlocks = [];
  for(let i=0;i<28;i++){ heroBlocks.push(makeHeroBlock()); }
  // burst d'intro
  try{
    const rect = heroCvs.getBoundingClientRect();
    for(let k=0;k<3;k++){ spawnHeroBurst(rect.left + rect.width*0.5, rect.top + rect.height*(0.35 + k*0.1), 1); }
  }catch{}
  // Explosions au survol boutons
  try{
    const hero = document.querySelector('.hero');
    hero.addEventListener('pointermove', (e)=>{
      const t = e.target;
      if(!(t instanceof HTMLElement)) return;
      if(t.classList.contains('btn')){
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 100;
        const y = (e.clientY - r.top) / r.height * 100;
        t.style.setProperty('--x', x+'%');
        t.style.setProperty('--y', y+'%');
      }
    });
    hero.querySelectorAll('.btn').forEach((b)=>{
      b.addEventListener('mouseenter', (e)=> spawnHeroBurst(e.clientX, e.clientY));
      b.addEventListener('click', (e)=> spawnHeroBurst(e.clientX, e.clientY, 1));
    });
  }catch{}
  startHeroAnimation();
}
function startHeroAnimation(){ if(heroRAF) return; const loop=(t)=>{ drawHero(t); heroRAF = requestAnimationFrame(loop); }; heroRAF = requestAnimationFrame(loop); }
function stopHeroAnimation(){ if(heroRAF){ cancelAnimationFrame(heroRAF); heroRAF=0; } }
function makeHeroBlock(){
  // Désormais: véritables tétriminos 4×4
  const keys = SHAPES;
  const key = keys[(Math.random()*keys.length)|0];
  const mat = clone(TETROMINOS[key]);
  const color = COLORS[key] || '#9AA0A8';
  const baseCell = 14 + Math.random()*10; // taille cell (px) pour le rendu héro
  return {
    type: 'tetromino',
    key,
    mat,
    color,
    cell: baseCell,
    x: Math.random(), // 0..1 (ratio largeur)
    y: -Math.random()*0.25, // au-dessus
    size: baseCell*4, // taille globale indicative
    speed: 0.10 + Math.random()*0.18, // rapide
    rot: Math.random()*Math.PI*2,
    rotSpeed: (-1.2+Math.random()*2.4)*1.2, // rotation plus vive
    life: 1, // garder en vie jusqu’à explosion
    exploded: false,
    wobble: Math.random()*Math.PI*2
  };
}
function spawnHeroBurst(clientX, clientY, power=0){
  if(!heroFxCtx) return;
  const rect = heroFxCtx.canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const n = 26 + Math.floor(Math.random()*20) + (power?20:0);
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2;
    const v = 120 + Math.random()*220 + (power?140:0);
    heroParticles.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, life: 1, size: 2+Math.random()*3, hue: 195 + Math.random()*30 });
  }
}
function drawHero(ts){
  if(!heroCtx||!heroCvs) return;
  const w=heroCvs.width, h=heroCvs.height;
  // fond déjà géré par CSS; on dessine juste des blocs additifs
  heroCtx.clearRect(0,0,w,h);
  const dt = 1/60;
  // parfois, ajouter un bloc
  const target = 30 + Math.floor(Math.sin(ts*0.0015)*4);
  if(heroBlocks.length<target && Math.random()<0.16){ heroBlocks.push(makeHeroBlock()); }
  heroBlocks.forEach(b=>{
    if(b.exploded){ b.life -= 0.02; }
    else {
      b.y += b.speed*dt;
      b.rot += b.rotSpeed*dt;
      // wobble latéral léger
      b.x += Math.sin((ts*0.001) + b.wobble) * 0.0005;
      if(b.y>0.92){ b.exploded = true; }
    }
    const x = b.x*w, y = b.y*h;
    heroCtx.save();
    heroCtx.translate(x,y); heroCtx.rotate(b.rot);
    // glow plus visible
    heroCtx.globalAlpha = 0.9;
    heroCtx.shadowColor = 'rgba(56,189,248,0.35)'; heroCtx.shadowBlur = 18;
    // Dessiner un tétrimino centré en fonction de son empreinte (min/max)
    const m = b.mat;
    let minX=4,maxX=0,minY=4,maxY=0;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); minY=Math.min(minY,j); maxY=Math.max(maxY,j); }
    const wCells = (maxX-minX+1), hCells = (maxY-minY+1);
    const cell = b.cell || 16;
    const offx = - (wCells*cell)/2;
    const offy = - (hCells*cell)/2;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(m[j][i]){
      const px = offx + (i-minX)*cell;
      const py = offy + (j-minY)*cell;
  const grad = heroCtx.createLinearGradient(px,py,px,py+cell);
  // légère oscillation de teinte pour animer le visuel
  const osc = Math.sin((ts*0.002) + i + j) * 6;
  grad.addColorStop(0, shade(b.color, 10 + osc));
  grad.addColorStop(1, shade(b.color,-12 + osc*0.5));
      heroCtx.fillStyle = grad;
      roundRect(heroCtx, px+2, py+2, cell-4, cell-4, 5);
      heroCtx.fill();
      heroCtx.strokeStyle = 'rgba(0,0,0,.28)';
      heroCtx.lineWidth = 1.5;
      roundRect(heroCtx, px+2, py+2, cell-4, cell-4, 5);
      heroCtx.stroke();
    }
    // explosion simple: halo
    if(b.exploded){
      heroCtx.globalCompositeOperation='lighter'; heroCtx.globalAlpha = 0.85;
      const s = Math.max(wCells,hCells)*cell;
      heroCtx.fillStyle='rgba(56,189,248,0.15)';
      heroCtx.beginPath(); heroCtx.arc(0,0, s*0.9*(1.1-b.life), 0, Math.PI*2); heroCtx.fill();
    }
    heroCtx.restore();
  });
  // supprimer blocs trop fades
  heroBlocks = heroBlocks.filter(b=> b.life>0.05 && b.y<1.2);
  // Particules FX
  if(heroFxCtx){
    heroFxCtx.clearRect(0,0,heroFxCvs.width, heroFxCvs.height);
    const dtp = 1/60;
    heroParticles.forEach(p=>{
      p.vy += 400*dtp; // gravité
      p.x += p.vx*dtp; p.y += p.vy*dtp;
      p.life -= 0.018;
      heroFxCtx.save();
      heroFxCtx.globalCompositeOperation = 'lighter';
      heroFxCtx.globalAlpha = Math.max(0, p.life);
      heroFxCtx.fillStyle = `hsl(${p.hue}deg 90% 65%)`;
      heroFxCtx.beginPath(); heroFxCtx.arc(p.x, p.y, p.size, 0, Math.PI*2); heroFxCtx.fill();
      heroFxCtx.restore();
    });
    heroParticles = heroParticles.filter(p=> p.life>0 && p.y < heroFxCvs.height+20);
  }
}

// --------- Easy Mode: calcul du meilleur placement avec lookahead (1) ---------
function rotateN(mat, n){
  let r = clone(mat);
  const k = (n%4+4)%4;
  for(let i=0;i<k;i++) r = rotateCW(r);
  return r;
}

function computeHint(){
  if(!easyMode || !active){ hint = null; return; }
  const pieceKey = active.key;
  let best = null;
  let bestNonClear = null; // meilleure position qui ne clear pas (0 lignes)
  for(let rot=0; rot<4; rot++){
    const mat = rotateN(TETROMINOS[pieceKey], rot);
    // largeur utile
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      // tomber sur la grille actuelle
      let py = -2;
      while(!collide(px, py+1, mat)) py++;
      if(py < -1) continue;
      const sim = clone(grid);
      placeOn(sim, px, py, mat, pieceKey);
  const cleared = simulateClear(sim);
      const h1 = stackHeight(sim);
  const next1 = nextQueue[0] ? nextQueue[0].key : null;
  const la = next1 ? bestPlacementScoreForNext(sim, next1) : 0;
  const clearedBonus = (cleared===3? 60 : cleared*10);
      const holes = countHoles(sim);
      const bump = bumpiness(sim);
  const score = clearedBonus - holes*6 - bump*0.5 - h1*0.2 + la*0.6;
      const candidate = { x:px, rot, yLanding:py, score, cleared };
      if(!best || score > best.score){ best = candidate; }
      if(cleared === 0){ if(!bestNonClear || score > bestNonClear.score){ bestNonClear = candidate; } }
    }
  }
  // Politique Easy: éviter de suggérer une pose qui détruit 1 à 2 lignes, à moins qu'il n'existe aucune bonne alternative.
  // On autorise si cleared >=3 (attaque) ou si aucune option cleared===0 n'existe avec un score proche.
  if(best && (best.cleared===1 || best.cleared===2)){
    if(bestNonClear){
      // Si la meilleure non-clear est raisonnablement proche, on la préfère.
      const margin = 15; // tolérance de score
      if(best.score - bestNonClear.score <= margin){
        hint = bestNonClear;
        return;
      }
    }
  }
  hint = best;
}

function placeOn(sim, px, py, mat, key){
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
    const gx=px+i, gy=py+j; if(gy>=0&&gy<ROWS&&gx>=0&&gx<COLS) sim[gy][gx]=key;
  }
}

function simulateClear(sim){
  let c=0;
  for(let r=ROWS-1;r>=0;){
    if(sim[r].every(Boolean)){ sim.splice(r,1); sim.unshift(Array(COLS).fill(null)); c++; }
    else r--;
  }
  return c;
}

function stackHeight(sim){
  let first=ROWS; for(let r=0;r<ROWS;r++){ if(sim[r].some(Boolean)){ first=r; break; } }
  return ROWS-first;
}

function countHoles(sim){
  let holes=0;
  for(let c=0;c<COLS;c++){
    let block=false;
    for(let r=0;r<ROWS;r++){
      if(sim[r][c]) block=true; else if(block) holes++;
    }
  }
  return holes;
}

function bumpiness(sim){
  const heights = Array(COLS).fill(0);
  for(let c=0;c<COLS;c++){
    let h=0; for(let r=0;r<ROWS;r++){ if(sim[r][c]){ h=ROWS-r; break; } }
    heights[c]=h;
  }
  let sum=0; for(let c=0;c<COLS-1;c++) sum+=Math.abs(heights[c]-heights[c+1]);
  return sum;
}

function bestPlacementScoreForNext(simGrid, nextKey){
  let best=-Infinity;
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim = clone(simGrid);
      placeOn(sim, px, py, mat, nextKey);
  const cleared = simulateClear(sim);
      const h1 = stackHeight(sim);
      const holes = countHoles(sim);
      const bump = bumpiness(sim);
  const clearedBonus = (cleared===3? 60 : cleared*10);
  const sc = clearedBonus - holes*6 - bump*0.5 - h1*0.2;
      if(sc>best) best=sc;
    }
  }
  return best;
}

function collideGrid(simGrid, px, py, mat){
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
    const gx=px+i, gy=py+j;
    if(gx<0||gx>=COLS||gy>=ROWS) return true;
    if(gy>=0 && simGrid[gy][gx]) return true;
  }
  return false;
}

