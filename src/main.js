import { AudioFX } from './audio.js';

// --- Modale Crédits ---
document.addEventListener('DOMContentLoaded', function() {
  const btnCredits = document.getElementById('btn-credits');
  const drawer = document.getElementById('drawer-credits');
  const panel = drawer ? drawer.querySelector('.drawer-panel') : null;
  const btnClose = document.getElementById('drawer-credits-close');
  const descSlot = document.getElementById('credits-desc-slot');
  let originalDescParent = null;
  let descNode = null;
  function lockBody(lock){ try{ document.body.style.overflow = lock? 'hidden':'auto'; }catch{} }
  function openDrawer(){ if(!drawer) return; drawer.classList.add('open'); drawer.setAttribute('aria-hidden','false'); lockBody(true); try{ panel?.focus?.(); }catch{} }
  function closeDrawer(){ if(!drawer) return; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden','true'); lockBody(false);
    // Rapatrier la description si on l’avait déplacée (sécurité)
    try{ if(descNode && originalDescParent){ originalDescParent.appendChild(descNode); } }catch{}
  }
  if(btnCredits && drawer){
    btnCredits.addEventListener('click', function() {
      // Insérer le texte si la description du hero n’existe plus
      try{
        descNode = document.querySelector('.hero-desc');
        if(descSlot){
          descSlot.innerHTML = '';
          if(descNode){ originalDescParent = descNode.parentElement; descSlot.appendChild(descNode); }
          else {
            const p = document.createElement('div');
            p.className = 'hero-desc';
            p.innerHTML = '<span class="hd-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 15.9 7.1 17.2 8 11.7 4 7.8l5.5-.8L12 2z"/></svg></span><p class="subtitle">Plongez dans une ambiance sombre et mystérieuse. Jouez en Solo, entraînez-vous en mode Easy, ou préparez-vous pour le mode Arcade à venir. Des ombres profondes, des faisceaux de lumière, et un challenge unique vous attendent.</p>';
            descSlot.appendChild(p);
          }
        }
      }catch{}
      openDrawer();
    });
  }
  if(btnClose){ btnClose.addEventListener('click', closeDrawer); }
  if(drawer){ drawer.addEventListener('click', (e)=>{ const t=e.target; if(t && (t.getAttribute && t.getAttribute('data-close')==='true')) closeDrawer(); }); }
});

// Constantes jeu
const COLS = 10;
const ROWS = 20;
let TILE = 30; // pixels (ajustable)
const START_SPEED_MS = 800; // intervalle de chute initial
const SPEEDUP_EVERY_MS = 30000; // +vite toutes les 30s

// --- Définitions tétriminos et utilitaires ---
// Matrices 4x4 (1 = bloc). Orientation de base standard (I horizontal, etc.)
const TETROMINOS = {
  I: [
    [0,0,0,0],
    [1,1,1,1],
    [0,0,0,0],
    [0,0,0,0],
  ],
  J: [
    [1,0,0,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  L: [
    [0,0,1,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  O: [
    [0,1,1,0],
    [0,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  S: [
    [0,1,1,0],
    [1,1,0,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  T: [
    [0,1,0,0],
    [1,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
  Z: [
    [1,1,0,0],
    [0,1,1,0],
    [0,0,0,0],
    [0,0,0,0],
  ],
};
const SHAPES = Object.keys(TETROMINOS);
const COLORS = {
  I: '#7DD3FC', // light cyan
  J: '#60A5FA', // blue
  L: '#F59E0B', // amber
  O: '#FDE047', // yellow
  S: '#22C55E', // green
  T: '#A78BFA', // purple
  Z: '#EF4444', // red
};
// Helpers
function clone(mat){ return mat.map(row => row.slice()); }
function rotateCW(mat){
  const n = 4; const r = Array.from({length:n},()=>Array(n).fill(0));
  for(let j=0;j<n;j++) for(let i=0;i<n;i++){ r[i][n-1-j] = mat[j][i]; }
  return r;
}
// Noms de niveaux (affichage HUD)
const LEVEL_NAMES = [
  'Pepouz', 'Détendu', 'Focus', 'Vif', 'Nervuré',
  'Aiguisé', 'Tranchant', 'Fougueux', 'Fulgurant', 'Légende'
];

// Utilitaires serveur (restaurés)
function getServerOrigin(){
  try{
    const env = (import.meta && import.meta.env) || {};
    if(env.DEV){ return ''; }
    if(env.VITE_SERVER_ORIGIN){ return String(env.VITE_SERVER_ORIGIN).replace(/\/$/,''); }
    return `${location.protocol}//${location.host}`;
  }catch{
    return '';
  }
}
async function apiTop10List(mode){
  try{
    const base = getServerOrigin();
    const bust = `bust=${Date.now()}`;
    const url = mode ? `${base}/top10?mode=${encodeURIComponent(mode)}&${bust}` : `${base}/top10?${bust}`;
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();
    if(mode){ return Array.isArray(data.list)? data.list : []; }
    return { solo: Array.isArray(data.solo)?data.solo:[], multi: Array.isArray(data.multi)?data.multi:[] };
  }catch{ return []; }
}
async function apiTop10Push(name, score, durationMs, mode){
  try{
    const base = getServerOrigin();
    const sc = Math.max(0, Number(score||0));
    const dur = Math.max(0, Number(durationMs||0));
    const ln = Math.max(0, Number(linesClearedTotal||0));
    const body = { name, score: sc, durationMs: dur, lines: ln, mode: mode||'solo' };
    await fetch(`${base}/top10`, { method:'POST', headers:{ 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }catch{}
}
// Canvas principal du jeu
const cvs = document.getElementById('game');
// Canvas d'effets (hero-fx) animé par l'animation tétriminos (setupHeroAnimation)

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
// Vue dédiée spectateur (grille droite)
const obsRightCvs = document.getElementById('obs-right');
const obsRightCtx = obsRightCvs ? obsRightCvs.getContext('2d') : null;
const obsRightLabel = document.getElementById('obs-right-label');
const elScore = document.getElementById('score');
const elLevel = document.getElementById('level');
// Panneaux stats (moi / adversaire)
const nameSelfEl = document.getElementById('name-self');
const nameOppEl = document.getElementById('name-opp');
const scoreOppEl = document.getElementById('score-opp');
const levelOppEl = document.getElementById('level-opp');
const linesOppEl = document.getElementById('lines-opp');
// Emotes panel
const panelEmotes = document.getElementById('panel-emotes');
// Observateurs badge
const obsBadgeEl = document.getElementById('obs-badge');
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
// Nouveaux compteurs stylés dans le résumé
const rsTotal = document.getElementById('rs-total');
const rsPlayers = document.getElementById('rs-players');
const rsBattle = document.getElementById('rs-battle');
// Compteurs sur le héro (panneau résumé)
const hsTotal = document.getElementById('hs-total');
const hsPlayers = document.getElementById('hs-players');
const hsBattle = document.getElementById('hs-battle');
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
const meLabelEl = document.getElementById('me-label');
const oppLabel = document.getElementById('opp-label');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownTextEl = document.getElementById('countdown-text');
const btnCancelCountdown = document.getElementById('btn-cancel-countdown');
// footer room tag
const roomTag = document.getElementById('room-tag');
const roomIdEl = document.getElementById('room-id');
const toastEl = document.getElementById('toast');
const panelMP = document.getElementById('panel-mp');
// Modale observateurs
const dlgSpectators = document.getElementById('dlg-spectators');
const spectatorsListEl = document.getElementById('spectators-list');
const spectatorsCloseBtn = document.getElementById('spectators-close');
// Observateurs: état UI et suivi de la salle observée
let obsCount = 0;
let spectatorsList = [];
let observingRoom = null; // id de la salle observée si on n'est pas joueur
let pendingObserveRoom = null; // demande en attente
// Mappage spectateur: joueurs gauche/droite
let obsLeftId = null, obsRightId = null;
let obsLeftName = '', obsRightName = '';
let obsLeftGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
let obsRightGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
let obsLeftActive = null;
let obsRightActive = null;
let obsLeftDead = false;
let obsRightDead = false;
// Emotes UI
const emotesGridEl = document.getElementById('emotes-grid');
const emotesTopEl = document.getElementById('emotes-top');
const emotesMoreBtn = document.getElementById('emotes-more');

const fx = new AudioFX();
// Ne pas précharger ni démarrer l'audio avant un geste utilisateur (réduit les warnings autoplay)
// On déclenchera preloadAll() au premier geste (cf. init() -> unlock).

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
// Profil IA (influence les poids de l'heuristique Easy)
let aiProfile = 'equilibre'; // 'conservateur' | 'equilibre' | 'agressif'
// Multijoueur: état client
let ws = null;
let roomId = null;
let roomMeta = { name: null, ownerName: null, ownerTop: 0 };
let opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
let opponentScore = 0;
let opponentLevel = 1;
let opponentLines = 0;
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
let linesClearedTotal = 0; // total de lignes supprimées (HUD)
let hideActivePiece = false; // en multi avant départ
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
// Effet d'apparition (fade/zoom) à chaque spawn
let spawnFxStart = 0; const spawnFxDur = 220; // ms
// Compteur de départ piloté par le serveur
let serverCountdownActive = false;
let serverCountdownStart = 0;
let serverCountdownDur = 0;
// Identité / noms / victoires
let selfId = null;
let oppName = '';
let myWins = 0;
let oppWins = 0;
// Cache de la liste des joueurs pour le résumé (écran Rejoindre)
let joinPlayersCache = [];
// Effet stress visuel à appliquer sur le plateau adverse (quand on l’envoie)
let oppStressUntil = 0;
let oppStressCount = 0;
// Invite toast guard pour le bouton Prêt (éviter le spam)
let inviteToastShown = false;
let _toastTO = null;
// Rejouer: préserver Easy pour la toute prochaine partie uniquement
let nextStartPreserveEasy = false;
// Anti-flood emotes: max 3 / 10s
const EMOTE_WINDOW_MS = 10000;
const EMOTE_MAX_IN_WINDOW = 3;
let emoteSendTimes = [];
let emoteCooldownTO = null;
let emoteCdTicker = null; // interval pour MAJ visuelle du décompte sur boutons
function emoteCanSend(){
  const now = Date.now();
  emoteSendTimes = emoteSendTimes.filter(t=> now - t < EMOTE_WINDOW_MS);
  return emoteSendTimes.length < EMOTE_MAX_IN_WINDOW;
}
function emoteNoteSend(){
  const now = Date.now();
  emoteSendTimes.push(now);
}
function emoteCooldownLeft(){
  const now = Date.now();
  emoteSendTimes = emoteSendTimes.filter(t=> now - t < EMOTE_WINDOW_MS);
  if(emoteSendTimes.length < EMOTE_MAX_IN_WINDOW) return 0;
  const first = emoteSendTimes[0];
  return Math.max(0, EMOTE_WINDOW_MS - (now - first));
}
function setEmotesDisabled(dis){
  try{
    if(!emotesGridEl) return;
    const btns = emotesGridEl.querySelectorAll('.emote');
    btns.forEach(b=> dis ? b.setAttribute('disabled','') : b.removeAttribute('disabled'));
    if(emotesTopEl){ emotesTopEl.querySelectorAll('.emote').forEach(b=> dis ? b.setAttribute('disabled','') : b.removeAttribute('disabled')); }
  }catch{}
}

// Démarre/rafraîchit le timer de cooldown UI quand la limite est atteinte
function startEmoteCooldownTimer(){
  try{
    const left = emoteCooldownLeft();
    setEmotesDisabled(true);
    clearTimeout(emoteCooldownTO);
    // Démarrer/rafraîchir l'affichage du décompte sur les boutons
    startEmoteCooldownVisual();
    emoteCooldownTO = setTimeout(()=>{
      setEmotesDisabled(false);
      stopEmoteCooldownVisual();
      try{ updateEmotesEnabled(); }catch{}
    }, Math.max(500, left));
  }catch{}
}

// Décompte visuel: ajoute data-cd et classe .cooldown sur chaque bouton
function startEmoteCooldownVisual(){
  try{
    stopEmoteCooldownVisual();
    const tick = ()=>{
      const ms = emoteCooldownLeft();
      const secs = Math.ceil(ms/1000);
      const label = secs > 0 ? String(secs) : '';
      const apply = (btn)=>{
        if(!btn) return;
        if(label){
          btn.classList.add('cooldown');
          btn.setAttribute('data-cd', label);
        } else {
          btn.classList.remove('cooldown');
          btn.removeAttribute('data-cd');
        }
      };
      try{
        if(emotesGridEl){ emotesGridEl.querySelectorAll('.emote').forEach(apply); }
        if(emotesTopEl){ emotesTopEl.querySelectorAll('.emote').forEach(apply); }
      }catch{}
      if(!label){ stopEmoteCooldownVisual(); }
    };
    // Premier tick immédiat puis chaque 200ms pour fluidité
    tick();
    emoteCdTicker = setInterval(tick, 200);
  }catch{}
}
function stopEmoteCooldownVisual(){
  try{ if(emoteCdTicker){ clearInterval(emoteCdTicker); emoteCdTicker=null; } }catch{}
  try{
    const clearBtn = (btn)=>{ btn.classList.remove('cooldown'); btn.removeAttribute('data-cd'); };
    if(emotesGridEl){ emotesGridEl.querySelectorAll('.emote').forEach(clearBtn); }
    if(emotesTopEl){ emotesTopEl.querySelectorAll('.emote').forEach(clearBtn); }
  }catch{}
}

// Usage tracking to populate Top row (persist in localStorage)
const EMOTE_USE_KEY = 'tetris_emotes_usage_v1';
function loadEmoteUsage(){
  try{ return JSON.parse(localStorage.getItem(EMOTE_USE_KEY)||'{}')||{}; }catch{ return {}; }
}
function saveEmoteUsage(map){ try{ localStorage.setItem(EMOTE_USE_KEY, JSON.stringify(map)); }catch{} }
function bumpEmoteUsage(emo){ const map = loadEmoteUsage(); map[emo] = (map[emo]||0)+1; saveEmoteUsage(map); renderTopEmotes(); }
function renderTopEmotes(){
  try{
    if(!emotesTopEl || !emotesGridEl) return;
  // Desktop: pas de Top 3, laisser vide pour n'afficher que la grille complète
  if(!matchMedia('(max-width: 900px)').matches){ emotesTopEl.innerHTML=''; return; }
  const all = Array.from(emotesGridEl.querySelectorAll('.emote')).map(b=>({ emo:b.getAttribute('data-emote'), title:b.title||'', aria:b.getAttribute('role')||'listitem' }));
    const usage = loadEmoteUsage();
  const sorted = all.sort((a,b)=> (usage[b.emo]||0) - (usage[a.emo]||0));
  const top = sorted.slice(0,3);
    emotesTopEl.innerHTML = '';
    top.forEach(it=>{
      const btn = document.createElement('button');
      btn.className = 'emote';
      btn.setAttribute('data-emote', it.emo);
      btn.setAttribute('title', it.title);
      btn.setAttribute('role','listitem');
      btn.textContent = it.emo;
      emotesTopEl.appendChild(btn);
    });
  // Répercuter l’état de cooldown sur les favoris nouvellement rendus
  try{ updateEmotesEnabled(); }catch{}
  }catch{}
}

function showEmoteBubbleOn(boardWrapId, emo, withSound){
  try{
  let wrap = document.getElementById(boardWrapId);
  if(!wrap) return;
  // Si la cible est masquée (mobile cache #board-opp), basculer sur la mini preview adversaire
  try{
    const cs = getComputedStyle(wrap);
    const hidden = cs.display==='none' || wrap.offsetParent===null;
    if(hidden){
      const alt = document.querySelector('.panel.opp-preview');
      if(alt) wrap = alt;
    }
  }catch{}
  const frame = wrap.querySelector('.frame') || wrap;
    let bubble = frame.querySelector('.emote-bubble');
    if(!bubble){
      bubble = document.createElement('div');
      bubble.className = 'emote-bubble';
      bubble.setAttribute('aria-live','polite');
      frame.appendChild(bubble);
    }
    // Fill content
    bubble.innerHTML = '';
    const em = document.createElement('span'); em.className='emoji'; em.textContent = emo; bubble.appendChild(em);
    // reset anim
    bubble.classList.remove('show'); void bubble.offsetWidth; bubble.classList.add('show');
    // Son désactivé pour l’instant
    // if(withSound === true){ try{ fx.playEmoteSfx?.(); }catch{} }
    clearTimeout(bubble._t);
    // Durée totale ~2s: fade-in court, maintien bref, fade-out court
    bubble._t = setTimeout(()=>{ bubble && bubble.classList.remove('show'); }, 2000);
  }catch{}
}

function resetGrid(){
  grid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
  linesClearedTotal = 0;
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
  // démarrer l'effet d'apparition
  spawnFxStart = performance.now();
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
  linesClearedTotal += cleared; updateHUD();
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
  // Rotation avec conservation approximative du centre et petits "kicks"
  const rot = rotateCW(active.mat);
  // Centre de masse (en cellules) avant/après pour ajuster le pivot
  const getCenter = (mat, ox, oy)=>{
    let sx=0, sy=0, c=0;
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ sx += (ox+i+0.5); sy += (oy+j+0.5); c++; }
    if(!c) return { cx: ox+2, cy: oy+2 };
    return { cx: sx/c, cy: sy/c };
  };
  const prevC = getCenter(active.mat, x, y);
  const newC0 = getCenter(rot, x, y);
  // Ajustement initial pour garder le centre stable
  const baseDx = Math.round(prevC.cx - newC0.cx);
  const baseDy = Math.round(prevC.cy - newC0.cy);
  const candidates = [
    [0, 0],
    [baseDx, baseDy],
    [baseDx+1, baseDy], [baseDx-1, baseDy], [baseDx, baseDy-1], [baseDx, baseDy+1],
    [baseDx+2, baseDy], [baseDx-2, baseDy],
    // fallback kicks classiques
    [1,0],[ -1,0],[0,-1],[2,0],[-2,0]
  ];
  for(const [dx,dy] of candidates){
    if(!collide(x+dx, y+dy, rot)){
      x += dx; y += dy; active.mat = rot;
      fx.rotate();
      rotFxStart = performance.now();
      broadcastState();
      return;
    }
  }
  // Si aucun kick ne passe, ne pas tourner
}

function move(dx){
  if(!collide(x+dx,y,active.mat)){
  x+=dx;
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
  const hasActive = !!active;

  // chute
  if(!step.last) step.last = ts;
  const elapsed = ts - step.last;
  if(hasActive && elapsed >= speedMs){ softDrop(); step.last = ts; }

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

  // auto-repeat horizontal/vertical uniquement si une pièce est active
  if(hasActive){
    handleHorizontal(ts);
    // auto-repeat vertical (soft drop maintenu)
    handleVertical(ts);
  }

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
  // pièce active (joueur ou observation)
  const isObserving = !!(observingRoom && !roomId);
  if(isObserving){
    // Dessiner la pièce active du joueur de gauche (obsLeftActive) sans FX
    const a = obsLeftActive;
    if(a && a.mat){ for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(a.mat[j][i]){ drawCell((a.x||0)+i, (a.y||0)+j, COLORS[a.key]||'#9AA0A8', true); } }
  } else {
    const canShowActive = !!active && !(roomId && !mpStarted);
    if(canShowActive){
      const now = performance.now();
      const spElapsed = now - (spawnFxStart||0);
      const showSpawn = spElapsed >= 0 && spElapsed < spawnFxDur;
      if(showSpawn){
        drawActiveWithSpawnFX(spElapsed / spawnFxDur);
      } else {
        for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(active.mat[j][i]){
          drawCell(x+i,y+j,COLORS[active.key], true);
        }
      }
    }
  }

    // Ombre projetée (ghost) + guides (Easy uniquement)
  if(!isObserving){
    const canShowActive = !!active && !(roomId && !mpStarted);
    if(canShowActive){
      const landing = getLandingY(x, y, active.mat);
      drawGhost(x, landing, active);
      if(easyMode){
        drawLandingVerticals(x, landing, active.mat);
        drawLandingEdges(x, landing, active.mat);
      }
    }
  }

    // Effet arcs lumineux si rotation récente
  const now = performance.now();
  const elapsed = now - (rotFxStart||0);
  const canFx = !isObserving && !!active && !(roomId && !mpStarted);
  if(canFx && elapsed >= 0 && elapsed < rotFxDur){
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

  // Hint (Mode Easy) — uniquement pour le joueur (pas en observation)
  if(!isObserving && !!active && !(roomId && !mpStarted) && easyMode && hint){
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
  if(observingRoom && !roomId){
    // Mode spectateur: dessiner la grille gauche sur notre canvas principal (grid) et la droite sur obsRight
    drawObserverBoards();
  } else {
    if(oppCtx){ drawOpponent(); }
  }
  // Miniatures (mobile)
  try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
}

function drawObserverBoards(){
  // Notre canvas principal utilise obsLeftGrid comme source (déjà injecté dans grid pour simplifier)
  // Canvas droit dédié
  if(!obsRightCtx || !obsRightCvs) return;
  // Ajuster tailles pour cohérence
  const pxW = TILE * COLS; const pxH = TILE * ROWS;
  if(obsRightCvs.width !== pxW) obsRightCvs.width = pxW;
  if(obsRightCvs.height !== pxH) obsRightCvs.height = pxH;
  obsRightCvs.style.width = pxW + 'px';
  obsRightCvs.style.height = pxH + 'px';
  // Fond
  obsRightCtx.clearRect(0,0,pxW,pxH);
  obsRightCtx.fillStyle = '#0e1116';
  obsRightCtx.fillRect(0,0,pxW,pxH);
  obsRightCtx.strokeStyle = '#1f242c';
  obsRightCtx.lineWidth = 1;
  for(let i=1;i<COLS;i++){ obsRightCtx.beginPath(); obsRightCtx.moveTo(i*TILE,0); obsRightCtx.lineTo(i*TILE,ROWS*TILE); obsRightCtx.stroke(); }
  for(let j=1;j<ROWS;j++){ obsRightCtx.beginPath(); obsRightCtx.moveTo(0,j*TILE); obsRightCtx.lineTo(COLS*TILE,j*TILE); obsRightCtx.stroke(); }
  // Cellules droites
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){ const k = obsRightGrid[r][c]; if(k){ const px=c*TILE, py=r*TILE; const g=obsRightCtx.createLinearGradient(px,py,px,py+TILE); g.addColorStop(0,shade(COLORS[k],6)); g.addColorStop(1,shade(COLORS[k],-8)); obsRightCtx.fillStyle=g; roundRect(obsRightCtx, px+2, py+2, TILE-4, TILE-4, 6); obsRightCtx.fill(); obsRightCtx.strokeStyle='rgba(0,0,0,.25)'; obsRightCtx.lineWidth=1.5; roundRect(obsRightCtx, px+2, py+2, TILE-4, TILE-4, 6); obsRightCtx.stroke(); } }
  // Pièce active droite
  if(obsRightActive && obsRightActive.mat){
    obsRightCtx.save(); obsRightCtx.globalAlpha = 0.65;
    const color = COLORS[obsRightActive.key] || '#9AA0A8';
    for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(obsRightActive.mat[j][i]){
      const cx = obsRightActive.x + i, cy = obsRightActive.y + j;
      const px=cx*TILE, py=cy*TILE;
      const g=obsRightCtx.createLinearGradient(px,py,px,py+TILE);
      g.addColorStop(0, shade(color,6)); g.addColorStop(1, shade(color,-8));
      obsRightCtx.fillStyle=g; roundRect(obsRightCtx, px+2, py+2, TILE-4, TILE-4, 6); obsRightCtx.fill();
    }
    obsRightCtx.restore();
  }
  // Overlay "GAME OVER" centré pour gauche et droite
  if(obsLeftDead){
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,cvs.width,cvs.height);
    ctx.fillStyle = '#ef4444';
    const fs = Math.max(24, Math.floor(cvs.width * 0.10));
    ctx.font = `bold ${fs}px Orbitron, system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', cvs.width/2, Math.floor(cvs.height*0.46));
    ctx.restore();
  }
  if(obsRightDead){
    obsRightCtx.save();
    obsRightCtx.fillStyle = 'rgba(0,0,0,0.55)';
    obsRightCtx.fillRect(0,0,obsRightCvs.width,obsRightCvs.height);
    obsRightCtx.fillStyle = '#ef4444';
    const fs = Math.max(24, Math.floor(obsRightCvs.width * 0.10));
    obsRightCtx.font = `bold ${fs}px Orbitron, system-ui`;
    obsRightCtx.textAlign = 'center';
    obsRightCtx.textBaseline = 'middle';
    obsRightCtx.fillText('GAME OVER', obsRightCvs.width/2, Math.floor(obsRightCvs.height*0.46));
    obsRightCtx.restore();
  }
  // Libellés
  const meLabel = document.getElementById('me-label');
  if(meLabel){ meLabel.textContent = String(obsLeftName||''); }
  if(obsRightLabel){ obsRightLabel.textContent = String(obsRightName||''); }
}

// Dessine la pièce active avec un petit zoom et un fade-in (t in 0..1)
function drawActiveWithSpawnFX(t){
  const ease = (u)=> u<0?0 : u>1?1 : (1 - Math.pow(1-u, 2)); // ease-out quad
  const k = ease(t);
  const scale = 1.12 - 0.12 * k; // 1.12 -> 1.00
  const alpha = 0.10 + 0.90 * k; // 0.10 -> 1.00
  const { l,t:top,r,b } = getActiveBounds();
  const cx = (l + r) / 2;
  const cy = (top + b) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = alpha;
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(active.mat[j][i]){
    drawCell(x+i, y+j, COLORS[active.key], true);
  }
  ctx.restore();
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
  // Afficher uniquement le libellé du niveau (sans nombre ni tiret)
  elLevel && (elLevel.textContent = `${LEVEL_NAMES[nameIdx]}`);
  elScore && (elScore.textContent = score);
  try{ const elLines = document.getElementById('lines'); if(elLines) elLines.textContent = String(linesClearedTotal||0); }catch{}
  try{ refreshStatsPanels(); }catch{}
  try{ refreshBoardLabels(); }catch{}
}

function refreshStatsPanels(){
  try{
    if(nameSelfEl){
      const nmSelf = (observingRoom && !roomId) ? (obsLeftName || '') : (playerName || '');
      nameSelfEl.textContent = String(nmSelf);
    }
    if(nameOppEl){
      const nm = (observingRoom && !roomId)
        ? (obsRightName || '')
        : ((document.getElementById('opp-label')?.textContent) || '');
      nameOppEl.textContent = nm;
    }
    if(scoreOppEl){ scoreOppEl.textContent = String(opponentScore||0); }
    if(levelOppEl){
      const idx = Math.min(LEVEL_NAMES.length-1, Math.max(1, Number(opponentLevel||1)) - 1);
      levelOppEl.textContent = LEVEL_NAMES[idx];
    }
    if(linesOppEl){ linesOppEl.textContent = String(opponentLines||0); }
  }catch{}
}

function refreshBoardLabels(){
  try{
    // Mon libellé
    if(meLabelEl){
      const nmSelf = (observingRoom && !roomId) ? (obsLeftName || '') : (playerName || '');
      meLabelEl.textContent = String(nmSelf);
    }
    // Libellé adversaire (côté plateau secondaire)
    if(oppLabel){
      const nmOpp = (observingRoom && !roomId) ? (obsRightName || '') : (peerConnected ? (oppName || oppLabel.textContent || '') : '');
      oppLabel.textContent = String(nmOpp);
    }
    // Libellé plateau droit en mode spectateur
    if(obsRightLabel && (observingRoom && !roomId)){
      obsRightLabel.textContent = String(obsRightName || '');
    }
  }catch{}
}

function updateObserversBadge(){
  try{
    if(obsBadgeEl){
      const n = Number(obsCount||0);
      obsBadgeEl.textContent = `👁️ ${n}`;
      obsBadgeEl.style.display = n>0 ? '' : 'none';
      obsBadgeEl.onclick = ()=>{ showSpectatorsModal(); };
    }
  }catch{}
}

function updateScoreLabels(){
  if(meScoreEl){ meScoreEl.textContent = `${Number(score||0)}${myWins? ` (V:${myWins})` : ''}`; }
  if(oppScoreEl){ oppScoreEl.textContent = `${Number(opponentScore||0)}${oppWins? ` (V:${oppWins})` : ''}`; }
}

function renderTop10(){
  if(!elTop10) return;
  elTop10.classList.add('top10');
  elTop10.classList.add('neon');
  elTop10.innerHTML = '';
    apiTop10List('solo').then(async (list) => {
        const top10List = list.slice(0,10).map((e,i)=> {
          const date = e.ts ? new Date(e.ts) : null;
          const dateTxt = date ? date.toLocaleDateString() : '';
          const scoreTxt = Number(e.score || 0).toLocaleString('fr-FR');
          const durTxt = formatDur(e.durationMs);
          const hasLines = Object.prototype.hasOwnProperty.call(e, 'lines');
          const linesTxt = hasLines ? Number(e.lines||0) : null;
          return `<li class="${i < 3 ? 'prime' : ''}"><div class="line"><span class="nm">${escapeHtml(e.name || 'Joueur')}</span><span class="dots"></span><span class="sc">${scoreTxt}${linesTxt!==null ? ` • ${linesTxt}L` : ''}${durTxt ? ` • ${durTxt}` : ''}</span></div>${dateTxt ? `<div class=\"sub\">${dateTxt}</div>` : ''}</li>`;
        }).join('');
        elTop10.innerHTML = top10List;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second before resolving
    }).catch(err => console.error(err));
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
    // Enregistrer le score côté client uniquement en solo; en multi, le serveur l'enregistrera après matchover
    if(!roomId && playerName) apiTop10Push(playerName, score, dur, 'solo');
  }catch{}
  fx.gameOverJingle();
  // notifier le serveur
  mpSend({type:'gameover'});
  // rafraîchir les statuts (Moi: Perdu, Adversaire: Gagnant)
    renderPlayersList(); // Refresh player list after game over
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
  // Politique Boost (Easy):
  // - En solo: OFF par défaut à chaque nouvelle partie, sauf "Rejouer" (préservation 1 coup)
  // - En multi: ne pas reset ici; le reset se fait à l'entrée dans le salon (création/join)
  try{
    const easyBtnEl = document.getElementById('easy-btn');
    const aiDD = document.getElementById('ai-dd');
    if(!roomId){
      if(!nextStartPreserveEasy){
        easyMode = false; hint = null;
        if(easyBtnEl){
          easyBtnEl.setAttribute('aria-pressed','false');
          easyBtnEl.classList.remove('active','easy-conservateur','easy-equilibre','easy-agressif');
        }
        if(aiDD){
          aiDD.querySelectorAll('.ai-opt').forEach(b=>{
            const v = b.getAttribute('data-value');
            b.setAttribute('aria-checked', v==='off' ? 'true' : 'false');
          });
        }
      }
    }
  }catch{}
  nextStartPreserveEasy = false;
  // Easy reste OFF par défaut (sauf si "Rejouer" demande la préservation via nextStartPreserveEasy)
  resetGrid(); nextQueue = []; bag = [];
  // préparer l’aperçu mais ne pas afficher d’actif si en multi avant start
  if(roomId){
    // remplir la file d’attente pour le preview
    if(nextQueue.length<2){ while(nextQueue.length<2){ nextQueue.push(nextFromBag()); } }
    drawNext();
  } else {
  nextStartPreserveEasy = false; spawn();
  }
  updateHUD(); renderTop10();
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
  // Clic souris: gérer explicitement pour distinguer clic court vs drag
  try{
    cvs.addEventListener('contextmenu', (e)=>{
      e.preventDefault();
      if(!isInputLocked()) rotate();
    });
  }catch{}
  let pid = null;
  let pActive = false;
  let startX=0, startY=0, lastX=0, lastY=0, startT=0;
  let accX=0, accY=0; // accumulateurs pour pas de déplacement
  let downButton = 0; // 0:gauche, 2:droit sur souris
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
    downButton = (typeof ev.button === 'number') ? ev.button : 0;
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
      // Spécifique souris: clic gauche court = hard drop; tactile/stylet = rotation
      if(ev.pointerType === 'mouse'){
        if(downButton === 0){ if(!isInputLocked()) hardDrop(); }
        // le clic droit est géré via contextmenu
      } else {
        rotate();
      }
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
    downButton = 0;
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
  // En mode observateur, on bloque toujours les entrées
  if(observingRoom && !roomId) return true;
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
  // Si on observe une salle, ne rien faire
  if(observingRoom && !roomId){ return; }
  // Solo
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  nextStartPreserveEasy = false;
  start();
});

// bouton pause retiré de l'UI

document.getElementById('btn-leaderboard').addEventListener('click', async ()=>{
  // Toujours utiliser la modale héro (unifiée) pour l’affichage du Top 10 avec onglets Solo/Multi
  const dlgTopHero = document.getElementById('dlg-top10-hero');
  const ulHeroSolo = document.getElementById('top10-hero-list-solo');
  const ulHeroMulti = document.getElementById('top10-hero-list-multi');
  const tabHeroSolo = document.getElementById('tab-hero-solo');
  const tabHeroMulti = document.getElementById('tab-hero-multi');
  const paneHeroSolo = document.getElementById('hero-top10-solo');
  const paneHeroMulti = document.getElementById('hero-top10-multi');
  if(dlgTopHero && ulHeroSolo && ulHeroMulti){
    const renderList = (ul, list)=>{
      ul.innerHTML = '';
      if(!Array.isArray(list) || list.length === 0){
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Pas de résultat';
        ul.appendChild(li);
        return;
      }
      list.slice(0,10).forEach((e,i)=>{
        const li = document.createElement('li');
        const date = e.ts ? new Date(e.ts) : null;
        const dateTxt = date ? date.toLocaleDateString() : '';
        const scoreTxt = Number(e.score||0).toLocaleString('fr-FR');
        const durTxt = formatDur(e.durationMs);
        const hasLines = Object.prototype.hasOwnProperty.call(e, 'lines');
        const linesTxt = hasLines ? Number(e.lines||0) : null;
        li.className = i<3 ? 'prime' : '';
        li.innerHTML = `<div class="line"><span class="nm">${escapeHtml(e.name||'Joueur')}</span><span class="dots"></span><span class="sc">${scoreTxt}${linesTxt!==null?` • ${linesTxt}L`:''}${durTxt?` • ${durTxt}`:''}</span></div>${dateTxt?`<div class=\"sub\">${dateTxt}</div>`:''}`;
        ul.appendChild(li);
      });
    };
    try{
      const [solo, multi] = await Promise.all([apiTop10List('solo'), apiTop10List('multi')]);
      renderList(ulHeroSolo, solo);
      renderList(ulHeroMulti, multi);
    }catch(err){
      console.error('Erreur chargement Top 10:', err);
      renderList(ulHeroSolo, []);
      renderList(ulHeroMulti, []);
    }
    const selectTab = (mode)=>{
      const soloOn = mode==='solo';
      tabHeroSolo?.classList.toggle('active', soloOn);
      tabHeroMulti?.classList.toggle('active', !soloOn);
      tabHeroSolo?.setAttribute('aria-selected', soloOn?'true':'false');
      tabHeroMulti?.setAttribute('aria-selected', soloOn?'false':'true');
      if(paneHeroSolo) paneHeroSolo.hidden = !soloOn;
      if(paneHeroMulti) paneHeroMulti.hidden = soloOn;
    };
    tabHeroSolo?.addEventListener('click', ()=> selectTab('solo'));
    tabHeroMulti?.addEventListener('click', ()=> selectTab('multi'));
    selectTab('solo');
    dlgTopHero.showModal();
    return;
  }
  // Fallback: modale simple avec onglets
  const dlg = document.getElementById('dlg-top10');
  const tabSolo = document.getElementById('tab-top-solo');
  const tabMulti = document.getElementById('tab-top-multi');
  const paneSolo = document.getElementById('top10-solo');
  const paneMulti = document.getElementById('top10-multi');
  const ulSolo = document.getElementById('top10-modal-solo');
  const ulMulti = document.getElementById('top10-modal-multi');
  if(dlg && tabSolo && tabMulti && paneSolo && paneMulti && ulSolo && ulMulti){
    const renderList = (ul, list)=>{
      ul.innerHTML = '';
      if(!Array.isArray(list) || list.length === 0){
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'Pas de résultat';
        ul.appendChild(li);
        return;
      }
      list.slice(0,10).forEach((e,i)=>{
        const li = document.createElement('li');
        const date = e.ts ? new Date(e.ts) : null;
        const dateTxt = date ? date.toLocaleDateString() : '';
        const scoreTxt = Number(e.score||0).toLocaleString('fr-FR');
        const durTxt = formatDur(e.durationMs);
        const hasLines = Object.prototype.hasOwnProperty.call(e, 'lines');
        const linesTxt = hasLines ? Number(e.lines||0) : null;
        li.className = i<3 ? 'prime' : '';
        li.innerHTML = `<div class="line"><span class="nm">${escapeHtml(e.name||'Joueur')}</span><span class="dots"></span><span class="sc">${scoreTxt}${linesTxt!==null?` • ${linesTxt}L`:''}${durTxt?` • ${durTxt}`:''}</span></div>${dateTxt?`<div class=\"sub\">${dateTxt}</div>`:''}`;
        ul.appendChild(li);
      });
    };
    try{
      const [solo, multi] = await Promise.all([apiTop10List('solo'), apiTop10List('multi')]);
      renderList(ulSolo, solo);
      renderList(ulMulti, multi);
    }catch(err){
      console.error('Erreur chargement Top 10:', err);
      renderList(ulSolo, []);
      renderList(ulMulti, []);
    }
    const selectTab = (mode)=>{
      const soloOn = mode==='solo';
      tabSolo?.classList.toggle('active', soloOn);
      tabMulti?.classList.toggle('active', !soloOn);
      tabSolo?.setAttribute('aria-selected', soloOn?'true':'false');
      tabMulti?.setAttribute('aria-selected', soloOn?'false':'true');
      paneSolo.hidden = !soloOn;
      paneMulti.hidden = soloOn;
    };
    tabSolo.addEventListener('click', ()=> selectTab('solo'));
    tabMulti.addEventListener('click', ()=> selectTab('multi'));
    selectTab('solo');
    dlg.showModal();
    return;
  }
  // Sinon, petit fallback legacy
  renderTop10();
});
if(top10Close){ top10Close.addEventListener('click', ()=> dlgTop10.close()); }
try{
  const top10CloseX = document.getElementById('top10-close-x');
  if(top10CloseX && dlgTop10){ top10CloseX.addEventListener('click', ()=> dlgTop10.close()); }
}catch{}
  // Aide
  try{
    const btnHelp = document.getElementById('btn-help');
    const dlgHelp = document.getElementById('dlg-help');
    const helpClose = document.getElementById('help-close');
    // Masquer la modale aide au chargement
    if(dlgHelp && typeof dlgHelp.close === 'function') dlgHelp.close();
    if(btnHelp && dlgHelp){ btnHelp.addEventListener('click', ()=> dlgHelp.showModal()); }
    if(helpClose && dlgHelp){ helpClose.addEventListener('click', ()=> dlgHelp.close()); }
  }catch{}

goNew.addEventListener('click', ()=>{ dlgGameOver.close(); nextStartPreserveEasy = false; start(); });

goClose.addEventListener('click', ()=>{ dlgGameOver.close(); running=false; paused=false; fx.stopMusic(); showStart(); });

// Init
(async function init(){
  // Empêcher le flash de scrollbars pendant l'init (calculs layout)
  try{ document.documentElement.classList.add('init-lock'); document.body.classList.add('init-lock'); }catch{}
  if(playerName) elPlayerName.textContent = playerName; else await askName();
  // Taille gérée par fitBoardToContainer selon breakpoint
  resetGrid();
  spawn();
  // Fit-to-container après un tick pour que le layout soit appliqué
  try{ setTimeout(()=>{ placeMPPanel(); fitBoardToContainer(); draw(); }, 0); }catch{}
  draw();
  renderTop10();
  // Toggle Mode Easy via bouton (plus de checkbox)
  const easyBtn = document.getElementById('easy-btn');
  const aiDD = document.getElementById('ai-dd');
  if(easyBtn && aiDD){
  // OFF par défaut
  easyMode = false;
  aiProfile = 'equilibre';
  const syncEasy = ()=>{
      easyBtn.setAttribute('aria-pressed', easyMode ? 'true' : 'false');
      easyBtn.classList.toggle('active', !!easyMode);
      // Couleur par profil
      easyBtn.classList.remove('easy-prudent','easy-conservateur','easy-equilibre','easy-agressif');
      if(easyMode){
        if(aiProfile==='prudent') easyBtn.classList.add('easy-prudent');
        else if(aiProfile==='conservateur') easyBtn.classList.add('easy-conservateur');
        else if(aiProfile==='agressif') easyBtn.classList.add('easy-agressif');
        else easyBtn.classList.add('easy-equilibre');
      }
    };
    syncEasy();
  const openDD = ()=>{ aiDD.classList.remove('hidden'); easyBtn.setAttribute('aria-expanded','true'); positionDropdown(); };
    const closeDD = ()=>{ aiDD.classList.add('hidden'); easyBtn.setAttribute('aria-expanded','false'); };
    let ddOpen = false;
  function positionDropdown(){
      try{
        const r = easyBtn.getBoundingClientRect();
        // Offset parent = .topbar (position:relative)
        const topbar = document.querySelector('.topbar');
        const pr = topbar ? topbar.getBoundingClientRect() : { left:0, top:0 };
        // Mesurer la largeur du menu (le rendre visible si nécessaire le temps du calcul)
        const wasHidden = aiDD.classList.contains('hidden');
        if(wasHidden){ aiDD.style.visibility = 'hidden'; aiDD.classList.remove('hidden'); }
        const menuW = aiDD.offsetWidth;
        if(wasHidden){ aiDD.classList.add('hidden'); aiDD.style.visibility = ''; }
        // Coller au bouton: aligner la droite du menu à la droite du bouton
        let left = Math.round(r.right - pr.left - menuW);
        const maxLeft = Math.max(0, Math.floor((pr.left + (topbar?.clientWidth||window.innerWidth)) - pr.left - menuW - 8));
        if(left < 8) left = 8;
        if(left > maxLeft) left = maxLeft;
        aiDD.style.left = left + 'px';
        // Coller au bas du bouton (sans marge)
        const top = Math.round(r.bottom - pr.top);
        aiDD.style.top = top + 'px';
      }catch{}
    }
    easyBtn.addEventListener('click', (e)=>{
      e.stopPropagation();
      ddOpen = !ddOpen; if(ddOpen){ openDD(); } else { closeDD(); }
    });
    document.addEventListener('click', (e)=>{ if(aiDD.classList.contains('hidden')) return; if(!aiDD.contains(e.target) && e.target!==easyBtn){ ddOpen=false; closeDD(); } });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ ddOpen=false; closeDD(); }});
    // Sélection d'option
    aiDD.addEventListener('click', (ev)=>{
      const btn = ev.target && ev.target.closest('.ai-opt'); if(!btn) return;
      const val = btn.getAttribute('data-value');
      // mettre à jour les checks
      aiDD.querySelectorAll('.ai-opt').forEach(b=> b.setAttribute('aria-checked', b===btn ? 'true' : 'false'));
      if(val==='off'){
        if(easyMode){ easyMode=false; syncEasy(); hint=null; }
      } else {
        const newProfile = val || 'equilibre';
        const profileChanged = (newProfile !== aiProfile);
        aiProfile = newProfile;
        if(!easyMode){ easyMode = true; syncEasy(); computeHint(); }
        else if(profileChanged){ syncEasy(); computeHint(); }
      }
      ddOpen=false; closeDD();
    });
  const repositionIfOpen = ()=>{ if(!aiDD.classList.contains('hidden')) positionDropdown(); };
  window.addEventListener('resize', repositionIfOpen);
  window.addEventListener('scroll', repositionIfOpen, { passive:true });
  if(window.visualViewport){ window.visualViewport.addEventListener('resize', repositionIfOpen); window.visualViewport.addEventListener('scroll', repositionIfOpen); }
  }
  // Navigation écrans
  if(btnStartSolo){ btnStartSolo.addEventListener('click', (e)=>{ try{ e.stopPropagation(); }catch{} nextStartPreserveEasy = false; showGame(); start(); }); }
  if(btnStartMulti){ btnStartMulti.addEventListener('click', (e)=>{ try{ e.stopPropagation(); }catch{} showJoin(); }); }
  // Déverrouillage audio au premier geste (autoplay policy)
  try{
  const unlock = ()=>{ try{ fx.resume(); fx.preloadAll?.(); fx.playHomeIntroMusic(); }catch{} window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
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
  if(btn.id === 'btn-start-solo'){ nextStartPreserveEasy = false; showGame(); start(); }
  else if(btn.id === 'btn-start-multi'){ showJoin(); }
    // ne pas relayer btn-hero-top10 ici pour éviter un double déclenchement
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
  // Bouton Top10 (héros): ouvre la modale stylée et charge Solo/Multi
  try{
    const heroTopBtn = document.getElementById('btn-hero-top10');
    const dlgTopHero = document.getElementById('dlg-top10-hero');
    const ulHeroSolo = document.getElementById('top10-hero-list-solo');
    const ulHeroMulti = document.getElementById('top10-hero-list-multi');
    const tabHeroSolo = document.getElementById('tab-hero-solo');
    const tabHeroMulti = document.getElementById('tab-hero-multi');
    const paneHeroSolo = document.getElementById('hero-top10-solo');
    const paneHeroMulti = document.getElementById('hero-top10-multi');
    const btnHeroClose = document.getElementById('top10-hero-close');
    if(heroTopBtn && dlgTopHero){
      const renderList = (ul, list)=>{
        if(!ul) return;
        ul.innerHTML = '';
        if(!Array.isArray(list) || list.length===0){
          const li = document.createElement('li');
          li.className = 'empty';
          li.textContent = 'Pas de résultat';
          ul.appendChild(li);
          return;
        }
        list.slice(0,10).forEach((e,i)=>{
          const li = document.createElement('li');
          const date = e.ts ? new Date(e.ts) : null;
          const dateTxt = date ? date.toLocaleDateString() : '';
          const scoreTxt = Number(e.score||0).toLocaleString('fr-FR');
          const durTxt = formatDur(e.durationMs);
          const hasLines = Object.prototype.hasOwnProperty.call(e, 'lines');
          const linesTxt = hasLines ? Number(e.lines||0) : null;
          li.className = i<3 ? 'prime' : '';
          li.innerHTML = `<div class="line"><span class="nm">${escapeHtml(e.name||'Joueur')}</span><span class="dots"></span><span class="sc">${scoreTxt}${linesTxt!==null?` • ${linesTxt}L`:''}${durTxt?` • ${durTxt}`:''}</span></div>${dateTxt?`<div class=\"sub\">${dateTxt}</div>`:''}`;
          ul.appendChild(li);
        });
      };
      const selectTab = (mode)=>{
        const soloOn = mode==='solo';
        tabHeroSolo?.classList.toggle('active', soloOn);
        tabHeroMulti?.classList.toggle('active', !soloOn);
        tabHeroSolo?.setAttribute('aria-selected', soloOn?'true':'false');
        tabHeroMulti?.setAttribute('aria-selected', soloOn?'false':'true');
        if(paneHeroSolo) paneHeroSolo.hidden = !soloOn;
        if(paneHeroMulti) paneHeroMulti.hidden = soloOn;
      };
      heroTopBtn.addEventListener('click', async ()=>{
        try{
          const [solo, multi] = await Promise.all([apiTop10List('solo'), apiTop10List('multi')]);
          renderList(ulHeroSolo, solo);
          renderList(ulHeroMulti, multi);
        }catch(err){
          console.error('Erreur chargement Top 10 (héro):', err);
          renderList(ulHeroSolo, []);
          renderList(ulHeroMulti, []);
        }
        selectTab('solo');
        dlgTopHero.showModal();
      });
      tabHeroSolo?.addEventListener('click', ()=> selectTab('solo'));
      tabHeroMulti?.addEventListener('click', ()=> selectTab('multi'));
      btnHeroClose?.addEventListener('click', ()=> dlgTopHero.close());
    }
  }catch{}
  if(btnJoinCreate){ btnJoinCreate.addEventListener('click', ()=>{ createRoom(); /* basculera vers le jeu à 'joined' */ }); }
  // bouton Rafraîchir retiré (plus de binding nécessaire)
  if(btnJoinBack){ btnJoinBack.addEventListener('click', ()=> showStart()); }
  // Onglets (Parties / Joueurs)
  if(tabRooms){ tabRooms.addEventListener('click', ()=>{ setJoinTab('rooms'); fetchRoomsJoin(); }); }
  if(tabPlayers){ tabPlayers.addEventListener('click', ()=>{ setJoinTab('players'); fetchPlayersJoin(); }); }
  if(mpCloseBtn){ mpCloseBtn.addEventListener('click', closeRoom); }
  if(mpLeaveBtn){
  // Quitter: pas de boîte de dialogue; retour direct titre + fermeture partie si besoin
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
  // Marquer la prochaine partie comme un "rejouer" (préserve l'état Easy)
  nextStartPreserveEasy = true;
      if(roomId){
        // reset visuel immédiat en attente du compte à rebours
        mpStarted = false; selfDead = false; opponentDead = false; opponentActive = null;
        resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
        nextQueue = []; bag = []; draw(); if(oppCtx) drawOpponent();
  // Afficher le bandeau d'attente uniquement si l'adversaire n'est pas connecté
  showWaiting(!peerConnected);
  // marquer prêt côté UI
  myReady = true; updateReadyBadges(); updateStartButtonLabel();
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

  // Lever le verrou scroll après premier fit/draw
  try{ setTimeout(()=>{ document.documentElement.classList.remove('init-lock'); document.body.classList.remove('init-lock'); }, 60); }catch{}

  // Événements Emotes (sidebar)
  try{
    const grid = emotesGridEl;
    if(grid){
      // Réordonner: positifs en haut (DOM) puis négatifs
      try{
        const pos = Array.from(grid.querySelectorAll('.emote-pos'));
        const neg = Array.from(grid.querySelectorAll('.emote-neg'));
        [...pos, ...neg].forEach(b=> grid.appendChild(b));
      }catch{}
  grid.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest ? e.target.closest('.emote') : null;
        if(!btn) return;
        const emo = btn.getAttribute('data-emote');
        if(!emo) return;
  // anti-flood s'applique dans tous les modes
  // anti-flood
  if(!emoteCanSend()){
    // désactiver pendant le cooldown restant
    const left = emoteCooldownLeft();
    setEmotesDisabled(true);
    clearTimeout(emoteCooldownTO);
  startEmoteCooldownVisual();
  emoteCooldownTO = setTimeout(()=>{ setEmotesDisabled(false); stopEmoteCooldownVisual(); updateEmotesEnabled(); }, Math.max(500, left));
    return;
  }
  // envoyer (si multi en partie) et compter usage dans tous les cas
  try{ if(roomId && mpStarted){ mpSend({ type:'emote', emoji: emo }); }
          emoteNoteSend(); bumpEmoteUsage(emo);
        }catch{}
  // Si on vient d'atteindre la limite, déclencher le verrou UI proactif
  if(!emoteCanSend()){
  startEmoteCooldownTimer();
  } else {
    try{ updateEmotesEnabled(); }catch{}
  }
  // feedback local léger (flash du bouton) — aucun affichage sur nos plateaux
  btn.classList.add('active'); setTimeout(()=>btn.classList.remove('active'), 120);
        // En mobile: refermer la grille pour ne laisser que Top
        try{
          if(matchMedia('(max-width: 900px)').matches){
            const panel = btn.closest('.panel.emotes');
            if(panel){ panel.classList.remove('expanded'); emotesMoreBtn?.setAttribute('aria-expanded','false'); }
          }
        }catch{}
      });
    }
    // clicks on Top row
    if(emotesTopEl){
      emotesTopEl.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest ? e.target.closest('.emote') : null;
        if(!btn) return;
        const emo = btn.getAttribute('data-emote');
        if(!emo) return;
        if(!emoteCanSend()){
          const left = emoteCooldownLeft();
          setEmotesDisabled(true);
          clearTimeout(emoteCooldownTO);
          startEmoteCooldownVisual();
          emoteCooldownTO = setTimeout(()=>{ setEmotesDisabled(false); stopEmoteCooldownVisual(); updateEmotesEnabled(); }, Math.max(500, left));
          return;
        }
  try{ if(roomId && mpStarted){ mpSend({ type:'emote', emoji: emo }); }
          emoteNoteSend(); bumpEmoteUsage(emo);
        }catch{}
  if(!emoteCanSend()){
  startEmoteCooldownTimer();
  } else {
    try{ updateEmotesEnabled(); }catch{}
  }
  btn.classList.add('active'); setTimeout(()=>btn.classList.remove('active'), 120);
        try{
          if(matchMedia('(max-width: 900px)').matches){
            const panel = btn.closest('.panel.emotes');
            if(panel){ panel.classList.remove('expanded'); emotesMoreBtn?.setAttribute('aria-expanded','false'); }
          }
        }catch{}
      });
    }
    // toggle "Plus" to expand grid on mobile
    if(emotesMoreBtn){
      emotesMoreBtn.addEventListener('click', ()=>{
        const panel = emotesMoreBtn.closest('.panel.emotes');
        if(!panel) return;
        const expanded = panel.classList.toggle('expanded');
        emotesMoreBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        emotesMoreBtn.textContent = expanded ? 'Moins' : 'Plus';
      });
    }
    // initial populate
    renderTopEmotes();
  }catch{}
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

// Onglet par défaut: Parties
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
    // En dev, getServerOrigin() renvoie '' (proxy HTTP via Vite). Pour WS, se connecter en direct au serveur MP.
    const wsUrl = httpOrigin
      ? httpOrigin.replace(/^http(s?):\/\//i, 'ws$1://')
      : `ws://${location.hostname}:8787`;
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
          // rafraîchir le résumé des parties avec le nombre total de joueurs connectés
          // (on réutilise la dernière liste de parties affichée via fetchRoomsJoin polling)
          // Le prochain tick de polling mettra aussi à jour, donc c'est best-effort
          break;
        case 'joined':
          roomId = msg.room; isOwner = !!msg.owner;
          // Si on observait une autre salle, arrêter
          if(observingRoom && observingRoom !== roomId){ try{ ws && ws.readyState===1 && ws.send(JSON.stringify({ type:'unobserve' })); }catch{} observingRoom = null; }
          roomMeta = { name: msg.name||null, ownerName: msg.ownerName||null, ownerTop: Number(msg.ownerTop||0) };
          // enregistrer notre id côté client
          if(msg.selfId) { try{ selfId = msg.selfId; }catch{} }
          // Reset complet : grilles, scores, statuts, victoires, overlays
          resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
          selfDead=false; opponentDead=false; opponentActive=null; mpStarted=false; serverCountdownActive=false;
          score=0; opponentScore=0; elScore && (elScore.textContent='0'); oppScoreEl && (oppScoreEl.textContent='0');
          myWins=0; oppWins=0; meScoreEl && (meScoreEl.textContent='0'); oppScoreEl && (oppScoreEl.textContent='0');
          // Multi: à l'entrée dans le salon (création/join), on réinitialise le mode Boost
          try{
            const easyBtnEl = document.getElementById('easy-btn');
            const aiDD = document.getElementById('ai-dd');
            easyMode = false; hint = null;
            if(easyBtnEl){
              easyBtnEl.setAttribute('aria-pressed','false');
              easyBtnEl.classList.remove('active','easy-conservateur','easy-equilibre','easy-agressif');
            }
            if(aiDD){
              aiDD.querySelectorAll('.ai-opt').forEach(b=>{
                const v = b.getAttribute('data-value');
                b.setAttribute('aria-checked', v==='off' ? 'true' : 'false');
              });
            }
          }catch{}
          myReady = !!isOwner; // l'hôte est prêt par défaut (miroir du serveur)
          peerReady=false; updateReadyBadges();
          // nom de l’adversaire si on n’est pas l’hôte
          if(!isOwner && roomMeta.ownerName){ oppName = roomMeta.ownerName; const el= document.getElementById('opp-label'); if(el) el.textContent = roomMeta.ownerName; try{ refreshBoardLabels(); }catch{} }
          updateOwnerUI(); updateStartButtonLabel(); showGame(); showWaiting(!peerConnected); updateOpponentVisibility(); renderPlayersList(); try{ updateEmotesEnabled(); }catch{} try{ refreshStatsPanels(); updateObserversBadge(); }catch{}
          try{ updateInputLock(); }catch{}
          // Si je suis hôte et prêt par défaut, envoyer l'état au serveur
          if(isOwner){ try{ ws && ws.readyState===1 && ws.send(JSON.stringify({type:'ready', ready:true})); }catch{} }
          // envoyer notre nom au serveur pour que l'autre voie notre pseudo
          if(ws && ws.readyState===1 && playerName){ ws.send(JSON.stringify({ type:'name', name: playerName })); }
          // afficher l'ID de la partie
          if(roomTag && roomIdEl){ roomIdEl.textContent = roomId; roomTag.classList.remove('hidden'); }
          break;
        case 'state':
          if(observingRoom && !roomId){
            const who = msg.who || null;
            if(who){
              // Assigner who à gauche/droite si nécessaire
              if(!obsLeftId || (obsLeftId!==who && obsRightId!==who)){
                if(!obsLeftId) obsLeftId = who; else obsRightId = who;
              }
              const toLeft = (who === obsLeftId);
              const gridRef = toLeft ? obsLeftGrid : obsRightGrid;
              const actRef = toLeft ? 'obsLeftActive' : 'obsRightActive';
              if(msg.grid){
                // Copie superficielle de la grille reçue
                const g = Array.isArray(msg.grid) ? msg.grid : [];
                for(let r=0;r<ROWS;r++){
                  for(let c=0;c<COLS;c++){
                    const v = (g[r] && g[r][c]) || null;
                    gridRef[r][c] = v;
                  }
                }
                if(toLeft){ grid = obsLeftGrid; } // refléter à gauche pour draw()
              }
              if(msg.active){ if(toLeft){ obsLeftActive = msg.active; } else { obsRightActive = msg.active; } }
              // Scores affichés via 'scores', ici on redessine
              draw();
            }
          } else {
            if(msg.grid){ opponentGrid = msg.grid; }
            if(typeof msg.score==='number'){ opponentScore=msg.score; }
            if(typeof msg.level==='number'){ opponentLevel = Math.max(1, Number(msg.level||1)); }
            if(typeof msg.lines==='number'){ opponentLines = Math.max(0, Number(msg.lines||0)); }
            if(msg.active){ opponentActive = msg.active; }
            if(oppCtx){ drawOpponent(); }
            try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
          }
          // ne pas toucher à opponentDead ici pour conserver l'affichage "Éliminé" jusqu'au prochain start
          break;
  case 'scores': {
          const list = Array.isArray(msg.list)? msg.list : [];
          if(observingRoom && !roomId){
            // Mode spectateur: trier par nom/id stable pour l’affichage
            const a = list[0]||null, b = list[1]||null;
            if(a && b){
              // Fixer le mapping la première fois
              if(!obsLeftId || (obsLeftId!==a.id && obsLeftId!==b.id)){
                obsLeftId = a.id; obsRightId = b.id;
                obsLeftName = a.name || a.id || '';
                obsRightName = b.name || b.id || '';
              }
              const left = (a.id===obsLeftId)? a : b;
              const right = (left===a)? b : a;
              // Injecter dans nos panneaux comme si left=moi, right=adversaire (lecture seule)
              score = Number(left?.score||0); linesClearedTotal = Math.max(0, Number(left?.lines||0)); level = Math.max(1, Number(left?.level||1));
              opponentScore = Number(right?.score||0); opponentLines = Math.max(0, Number(right?.lines||0)); opponentLevel = Math.max(1, Number(right?.level||1));
              const oppl = document.getElementById('opp-label'); if(oppl) oppl.textContent = String(obsRightName||''); try{ refreshBoardLabels(); }catch{}
              // Statuts prêts (affichage non bloquant)
              myReady = !!left?.ready; peerReady = !!right?.ready; updateReadyBadges();
              // Etats d'élimination pilotés par snapshot
              obsLeftDead = !!left?.dead;
              obsRightDead = !!right?.dead;
            }
            updateScoreLabels(); updateHUD(); renderPlayersList();
          } else {
            const mine = list.find(e=> e && e.id === selfId);
            const other = list.find(e=> e && e.id !== selfId);
            if(mine && typeof mine.score==='number'){ score = mine.score; elScore && (elScore.textContent = String(score)); }
            if(other && typeof other.score==='number'){ opponentScore = other.score; }
            if(other && typeof other.level==='number'){ opponentLevel = Math.max(1, Number(other.level||1)); }
            if(other && typeof other.lines==='number'){ opponentLines = Math.max(0, Number(other.lines||0)); }
            updateScoreLabels(); updateHUD(); renderPlayersList();
          }
        } break;
        case 'emote': {
          // Le receveur voit l'emote au-dessus de son propre plateau (board-me), aucun son
          const emo = (msg && msg.emoji) ? String(msg.emoji) : '';
          if(emo){ showEmoteBubbleOn('board-me', emo, false); }
        } break;
        case 'peer': {
          const was = !!peerConnected;
          peerConnected = !!msg.connected;
      if(peerConnected){
            try{ fx.playJoinerSfx(); }catch{}
            showWaiting(false);
            try{ updateInputLock(); }catch{} try{ updateEmotesEnabled(); }catch{}
            // Annonce d'arrivée quand un joueur rejoint une partie ouverte
            if(!was){
              const nm = (msg && msg.name) || 'Un joueur';
        showToast(`${escapeHtml(nm)} a rejoint la partie`, 3000);
            }
          } else {
            // l'autre joueur est absent. Ne pas écraser mon état "Prêt" (ex: hôte prêt par défaut)
            peerReady=false; updateReadyBadges(); showWaiting(true); try{ updateEmotesEnabled(); }catch{}
            if(mpStarted){
              mpStarted = false; selfDead = false; opponentDead = false; opponentActive = null;
              running = false; paused = false; fx.stopMusic();
              cancelServerCountdown();
            }
            resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null)); opponentScore=0; opponentLevel=1; opponentLines=0;
            nextQueue = []; bag = [];
            draw(); if(oppCtx) drawOpponent();
            try{ updateInputLock(); }catch{}
            if(was){
              const leaverName = (msg && (msg.name || null)) || (document.getElementById('opp-label')?.textContent) || 'Le joueur';
              showToast(`${leaverName} a quitté la partie`, 3000);
            }
          }
          updateOpponentVisibility(); updateStartButtonLabel(); renderPlayersList();
        } break;
        case 'gameover': {
          // Un seul handler pour tous les contextes (joueur vs observateur)
          if(observingRoom && !roomId){
            const who = msg.who || null;
            if(who){
              if(who === obsLeftId) obsLeftDead = true;
              if(who === obsRightId) obsRightDead = true;
              draw();
            }
          } else {
            opponentDead = true;
            // force un redraw immédiat pour afficher le bandeau Éliminé côté adverse
            draw(); if(oppCtx) drawOpponent();
            try{ if(oppMiniCtx){ drawOppMini(); } }catch{}
            renderPlayersList();
          }
        } break;
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
          updateReadyBadges(); renderPlayersList(); updateStartButtonLabel();
        } break;
        case 'countdown': onServerCountdown(msg.seconds||5); break;
        case 'countdown_cancel': cancelServerCountdown(); break;
        case 'start': onMatchStart(msg.seed); break;
        case 'matchover': {
          // Mode observateur: afficher seulement le gagnant
          if(msg && msg.room && observingRoom && !roomId && msg.room === observingRoom){
            const arr = Array.isArray(msg.scores)? msg.scores : [];
            const winner = arr.slice().sort((a,b)=> (Number(b.score||0) - Number(a.score||0)))[0];
            if(winner){
              const nm = winner.name || winner.id || 'Gagnant';
              const sc = Number(winner.score||0);
              showToast(`Gagnant: ${escapeHtml(nm)} (${sc})`, 5000);
            } else {
              showToast('Fin de partie', 3000);
            }
          } else {
            onMatchOver(msg.scores);
          }
        } break;
  // (case 'gameover' fusionné plus haut)
        case 'room_closed': {
          // Pas de toast demandé quand l’hôte quitte; retour direct à l’écran des parties
          onRoomClosed();
          showJoin();
          // Réinitialiser compteur obs local au changement d’écran
          obsCount = 0; spectatorsList = [];
        } break;
        case 'names': {
          const arr = msg.list || [];
          if(observingRoom && !roomId){
            // Peaufiner les noms observés
            if(arr.length>=2){
              const a = arr[0], b = arr[1];
              // Respecter le mappage déjà fixé par scores si présent
              if(obsLeftId){
                const left = arr.find(p=> p.id===obsLeftId) || a;
                const right = arr.find(p=> p.id===obsRightId) || b;
                obsLeftName = left?.name || left?.id || '';
                obsRightName = right?.name || right?.id || '';
              } else {
                obsLeftId = a?.id||null; obsRightId = b?.id||null;
                obsLeftName = a?.name || a?.id || '';
                obsRightName = b?.name || b?.id || '';
              }
              const oppl = document.getElementById('opp-label'); if(oppl) oppl.textContent = String(obsRightName||''); try{ refreshBoardLabels(); }catch{}
              renderPlayersList();
            }
          } else {
            const other = arr.find(p=> p.id !== selfId);
            if(other && other.name){ oppName = other.name; const el= document.getElementById('opp-label'); if(el) el.textContent = other.name; try{ refreshBoardLabels(); }catch{} }
          }
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
        case 'observe_refused': {
          // Refus de passer en observateur (cap atteint ou autre raison)
          const reason = (msg && msg.reason) || 'Refusé';
          showToast(`Observateur refusé${msg && msg.max? ` (max ${msg.max})` : ''}: ${reason}`);
          pendingObserveRoom = null;
        } break;
    case 'spectators': {
          // Mise à jour du compteur et de la liste des observateurs pour la salle courante
      if(msg && msg.room && roomId && msg.room === roomId){
            obsCount = Number(msg.count||0);
            spectatorsList = Array.isArray(msg.list)? msg.list : [];
    renderPlayersList(); updateObserversBadge();
      try{ if(dlgSpectators && typeof dlgSpectators.open === 'boolean' && dlgSpectators.open){ renderSpectatorsModal(); } }catch{}
          }
          // Si on est en mode observation d'une autre salle
      if(msg && msg.room && observingRoom && !roomId && msg.room === observingRoom){
            obsCount = Number(msg.count||0);
            spectatorsList = Array.isArray(msg.list)? msg.list : [];
    try{ if(dlgSpectators && typeof dlgSpectators.open === 'boolean' && dlgSpectators.open){ renderSpectatorsModal(); } }catch{}
    updateObserversBadge();
          }
          // Première confirmation d'observation -> fixer observingRoom
          if(pendingObserveRoom && msg && msg.room === pendingObserveRoom && !roomId){
            observingRoom = pendingObserveRoom; pendingObserveRoom = null;
            // Reset affichage et bascule vers l'écran de jeu en mode observateur
            try{
              screenGame && showGame();
              // Nettoyer nos états locaux
              resetGrid(); opponentGrid = Array.from({length:ROWS},()=>Array(COLS).fill(null));
              score=0; opponentScore=0; linesClearedTotal=0; opponentLines=0; level=1; opponentLevel=1;
              mpStarted=false; running=false; paused=false; selfDead=false; opponentDead=false; opponentActive=null;
              obsLeftDead = false; obsRightDead = false;
              // Labels adversaire génériques
              const oppl = document.getElementById('opp-label'); if(oppl) oppl.textContent = ''; try{ refreshBoardLabels(); }catch{}
              // Afficher les deux plateaux (lecture seule)
              updateOpponentVisibility(); updateStartButtonLabel(); renderPlayersList(); updateObserversBadge(); draw(); if(oppCtx) drawOpponent();
              updateInputLock(); updateEmotesEnabled();
              showToast('Mode observateur', 2000);
            }catch{}
          }
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
  const randomName = 'Partie-' + Math.random().toString(36).slice(2,6).toUpperCase();
  let myTop = 0;
  try{
    const list = await apiTop10List('solo');
    myTop = (Array.isArray(list)?list:[]).filter(e=> e.name === playerName).map(e=> e.score).sort((a,b)=>b-a)[0] || 0;
  }catch{}
  try{ ws.send(JSON.stringify({type:'create', name: randomName, ownerName: playerName||'Player', ownerTop: myTop })); }catch{}
  // Rester sur l’écran courant: on basculera vers le jeu à la réception de 'joined'
  // Mettre à jour la liste des parties pour afficher rapidement la nouvelle partie
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
  // Ne modifier le titre que si l'onglet Parties est actif
  if(joinTitle && tabRooms && tabRooms.classList.contains('active')) joinTitle.textContent = 'Parties';
  // Stats globales (côté serveur uniquement)
 
  const total = Number(rooms.length||0);
  // joueurs connectés = tous les joueurs actifs côté serveur, pas seulement dans les parties
  const players = Array.isArray(joinPlayersCache) ? joinPlayersCache.length : 0;
  const inBattle = rooms.reduce((s,r)=> s + (r.started?1:0), 0);
  // Mise à jour du résumé visuel si présent, sinon fallback texte
  if(rsTotal && rsPlayers && rsBattle){
    rsTotal.textContent = String(total);
    rsPlayers.textContent = String(players);
    rsBattle.textContent = String(inBattle);
  }else if(roomsSummary){
    roomsSummary.textContent = `Parties: ${total} • Joueurs connectés: ${players} • Parties en cours: ${inBattle}`;
  }
  // Héro: refléter les mêmes chiffres + barres de progression douces
  try{
    if(hsTotal) hsTotal.textContent = String(total);
    if(hsPlayers) hsPlayers.textContent = String(players);
    if(hsBattle) hsBattle.textContent = String(inBattle);
    const heroStats = document.querySelector('.hero-stats');
    if(heroStats){
      const bars = heroStats.querySelectorAll('.hs-bar>span');
      const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
      const maxRef = Math.max(1, Math.max(total||0, players||0, inBattle||0));
      const widths = [
        clamp(((total||0)/maxRef)*100, 4, 100),
        clamp(((players||0)/maxRef)*100, 4, 100),
        clamp(((inBattle||0)/maxRef)*100, 4, 100)
      ];
      bars.forEach((b,i)=>{ b.style.width = (widths[i]||4) + '%'; });
    }
  }catch{}
  // Tri: non pleins d'abord, puis en bataille, puis récents
  const statusRank = (r)=> (r.count<2 ? 0 : (r.started?1:2));
  const sorted = rooms.slice().sort((a,b)=> statusRank(a)-statusRank(b) || (b.lastEndedTs||0)-(a.lastEndedTs||0));
  // Empty state uniquement si l'onglet Parties est actif
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
    if(typeof r.spectators === 'number'){ meta.push(`👁️ ${r.spectators}`); }
  left.innerHTML = `<strong>${escapeHtml(title)}</strong> <small>— ${escapeHtml(r.id)}</small><br><small>${escapeHtml(meta.join(' • '))}</small>`;
    // Bloc droit (statut + bouton)
    const right = document.createElement('div'); right.className = 'room-right';
    const badge = document.createElement('span'); badge.className = 'badge status ' + (statusKey==='battle'?'danger':(statusKey==='open'?'good':'')); badge.textContent = statusText;
  const btn = document.createElement('button'); btn.className='btn sm'; btn.textContent='Rejoindre';
  // Masquer « Rejoindre » si la salle est pleine
  if(r.count>=2){ btn.style.display = 'none'; }
  else { btn.addEventListener('click', ()=>{ joinRoom(r.id); /* basculera vers le jeu à 'joined' */ }); }
    // Bouton Observer
    const btnObs = document.createElement('button'); btnObs.className = 'btn sm ghost';
    const canObserve = r.count > 0; // éviter d’observer une salle vide
    btnObs.textContent = 'Observer';
    btnObs.disabled = !canObserve || (observingRoom && observingRoom===r.id);
    btnObs.addEventListener('click', async ()=>{
      const ok = await ensureWSReady(); if(!ok) return;
      if(observingRoom && observingRoom===r.id){ return; }
      try{ ws && ws.readyState===1 && ws.send(JSON.stringify({ type:'observe', room: r.id })); pendingObserveRoom = r.id; }catch{}
      // rester sur l’écran "Rejoindre"; l’affichage live viendra via messages
      renderRoomsJoin(rooms);
    });
    right.appendChild(badge); right.appendChild(btn); right.appendChild(btnObs);
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
  // ordre: d'abord ceux en partie (room non nul), puis par nom croissant
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
  const room = p.room ? `Partie: ${p.room}` : '—';
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
  mpSend({
    type:'state',
    grid,
    score,
    lines: linesClearedTotal||0,
    level,
    ready: !!myReady,
    active: active? { key: active.key, mat: active.mat, x, y } : null
  });
}, 250);

function broadcastState(){
  if(!roomId) return;
  // N’envoyer que pendant la partie
  if(!mpStarted || !running) return;
  mpSend({
    type:'state',
    grid,
    score,
    lines: linesClearedTotal||0,
    level,
    ready: !!myReady,
    active: active? { key: active.key, mat: active.mat, x, y } : null
  });
}

// ------------- Ready/Start/Seeded RNG -------------
function toggleReady(){
  myReady = !myReady;
  updateReadyBadges();
  updateStartButtonLabel();
  if(!myReady){ cancelServerCountdown(); }
  // si on vient de repasser en "pas prêt", autoriser à ré-afficher l'invite plus tard
  if(!myReady){ inviteToastShown = false; }
  ws && ws.readyState===1 && ws.send(JSON.stringify({type:'ready', ready:myReady}));
}

function onMatchStart(seedStr){
  seed = seedStr || (Date.now()+':'+Math.random());
  rng = mulberry32(hashSeed(seed));
  mpStarted = true;
  score = 0; opponentScore = 0; elScore && (elScore.textContent='0');
  updateScoreLabels();
  bag = []; nextQueue = [];
  linesClearedTotal = 0;
  opponentDead = false; opponentActive = null; selfDead = false;
  // Reset états observateur
  obsLeftDead = false; obsRightDead = false;
  // démarrer immédiatement (le serveur a affiché le compte à rebours)
  cancelServerCountdown();
  start();
  nextStartPreserveEasy = false;
  // conserver l’état "Prêt" affiché durant la manche
  updateReadyBadges();
  updateStartButtonLabel();
  inviteToastShown = true; // plus d'invite pendant la manche
  try{ updateInputLock(); }catch{}
  try{ updateEmotesEnabled(); }catch{}
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
  try{ updateEmotesEnabled(); }catch{}
  // autoriser une future invite
  inviteToastShown = false;
}

function updateEmotesEnabled(){
  try{
  const grid = document.getElementById('emotes-grid');
  if(!grid) return;
  const enable = emoteCanSend();
  const set = (btn)=>{ if(enable){ btn.removeAttribute('disabled'); } else { btn.setAttribute('disabled',''); } };
  grid.querySelectorAll('.emote').forEach(set);
  if(emotesTopEl){ emotesTopEl.querySelectorAll('.emote').forEach(set); }
  }catch{}
}
// références doublons supprimées (gérées au début du fichier et dans init())

function onRoomClosed(){
  // La partie est fermée (par l'hôte ou purge). Ici on revient à l'écran de titre.
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
  // masquer l'ID de la partie
  if(roomTag){ roomTag.classList.add('hidden'); }
  inviteToastShown = false;
}
function updateOwnerUI(){
  if(mpCloseBtn){ mpCloseBtn.disabled = !isOwner; }
}

function updateReadyBadges(){
  if(meReadyEl){ meReadyEl.textContent = myReady ? '✅' : '⌛'; meReadyEl.classList.toggle('ready', myReady); meReadyEl.classList.toggle('wait', !myReady); }
  if(oppReadyEl){ oppReadyEl.textContent = peerReady ? '✅' : '⌛'; oppReadyEl.classList.toggle('ready', peerReady); oppReadyEl.classList.toggle('wait', !peerReady); }
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
    // Desktop: agrandir le plateau selon l'espace disponible (solo et multi)
    const app = document.getElementById('app');
    const isSolo = !!(app && app.classList.contains('solo-mode'));
    // Mesures d'espace dispo
    const gridGap = 20; // gap de la grille desktop (voir .layout{gap:20px})
    // écart entre les deux plateaux (voir --board-gap en CSS)
    let boardGapVal = 26;
    try{ const v = getComputedStyle(document.documentElement).getPropertyValue('--board-gap'); const n = parseInt(v,10); if(Number.isFinite(n)) boardGapVal = n; }catch{}
    let topH=0, botH=0;
    try{
      const topbar = document.querySelector('.topbar');
      const bottombar = document.querySelector('.bottombar');
      topH = topbar ? topbar.getBoundingClientRect().height : 0;
      botH = bottombar ? bottombar.getBoundingClientRect().height : 0;
    }catch{}
    const appEl = document.getElementById('app');
    const appPadX = 32; // padding latéral ~16px * 2
    const appPadY = 24; // padding vertical ~12px * 2
    const appW = (appEl ? appEl.clientWidth : window.innerWidth) - appPadX;
    // Hauteur utile: viewport - topbar - margeBottom topbar - bottombar - padding vertical du conteneur - petite marge
    let topbarMargin = 0; try{ const tb = document.querySelector('.topbar'); if(tb){ const cs = getComputedStyle(tb); topbarMargin = parseFloat(cs.marginBottom)||0; } }catch{}
    const viewH = window.innerHeight - topH - topbarMargin - botH - appPadY - 6;
    // Sidebar desktop fixe 300px
    const sidebarW = 300;
    {
      // Largeur disponible pour un plateau (colonne gauche contient 2 plateaux + boardGap)
      const maxWFromWidth = Math.max(280, Math.floor((appW - sidebarW - gridGap - boardGapVal) / 2));
      // Contrainte hauteur: h_canvas = 2 * w_canvas, et la frame ajoute ~20px
      const frameExtraH = 20;
      const maxWFromHeight = Math.max(280, Math.floor((viewH - frameExtraH) / 2));
      let targetW = Math.min(maxWFromWidth, maxWFromHeight);
  // bornes raisonnables (élargies pour réduire l'espace vide en desktop)
  targetW = Math.max(300, Math.min(880, targetW));
  TILE = Math.max(16, Math.min(56, Math.floor(targetW / COLS)));
      const pxW = TILE * COLS;
      const pxH = TILE * ROWS;
      if(cvs.width !== pxW) cvs.width = pxW;
      if(cvs.height !== pxH) cvs.height = pxH;
      if(fxCvs.width !== pxW) fxCvs.width = pxW;
      if(fxCvs.height !== pxH) fxCvs.height = pxH;
      // Opponent canvas même dimension en desktop
      if(oppCvs){
        if(oppCvs.width !== pxW) oppCvs.width = pxW;
        if(oppCvs.height !== pxH) oppCvs.height = pxH;
        oppCvs.style.width = pxW + 'px';
        oppCvs.style.height = pxH + 'px';
      }
      cvs.style.width = pxW + 'px';
      cvs.style.height = pxH + 'px';
      fxCvs.style.width = pxW + 'px';
      fxCvs.style.height = pxH + 'px';
      // Mettre à jour la variable CSS --board-w (canvas + padding/bordure ≈ 22px)
      try{ document.documentElement.style.setProperty('--board-w', (pxW + 22) + 'px'); }catch{}
      return;
    }
  }
  // Fit to container (mobile):
  const appEl = document.getElementById('app');
  const isObserverMobile = !!(appEl && appEl.classList && appEl.classList.contains('observer-mode'));
  // 1) Largeur réelle du conteneur boards (en mobile: pleine largeur moins sidebar, sauf observer-mode où la sidebar passe dessous)
  let availW = (()=>{
    try{
      const layout = document.querySelector('#app .layout');
      const sidebar = document.querySelector('#app .sidebar');
      let layoutW = layout && layout.clientWidth ? layout.clientWidth : (window.innerWidth - 24);
      if(isObserverMobile){
        // Sidebar en dessous: 100% pour les deux plateaux
        return Math.max(120, layoutW);
      }
      // Estimer largeur sidebar selon breakpoints (voir CSS @media)
      let sbW = 0;
      const mq420 = window.matchMedia && window.matchMedia('(max-width: 420px)').matches;
      const mq600 = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
      const mq900 = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
      if(sidebar && sidebar.clientWidth){ sbW = sidebar.clientWidth; }
      else {
        if(mq420) sbW = Math.min(92, Math.floor(window.innerWidth * 0.25));
        else if(mq600) sbW = Math.min(100, Math.floor(window.innerWidth * 0.26));
        else if(mq900) sbW = Math.min(108, Math.floor(window.innerWidth * 0.26));
        else sbW = 300; // fallback desktop
      }
      const gridGap = 8; // gap mobile entre boards et sidebar
      return Math.max(120, layoutW - sbW - gridGap);
    }catch{ return Math.max(120, window.innerWidth - 24); }
  })();
  // 2) Hauteur visible (précise) = visualViewport.height - topbar - bottombar - petite marge
  let vh = (window.visualViewport && window.visualViewport.height) ? window.visualViewport.height : window.innerHeight;
  try{
    const topbar = document.querySelector('.topbar');
    const bottombar = document.querySelector('.bottombar');
    const topH = topbar ? topbar.getBoundingClientRect().height : 0;
    const botH = bottombar ? bottombar.getBoundingClientRect().height : 0;
  // marge ajustée pour ne pas mordre les bords
  vh = Math.max(240, vh - topH - botH - 10);
  }catch{}
  // 3) Le canvas est dans .frame (padding 10, bordure ≈ 2) -> extra ≈ 22 px en largeur, 20px en hauteur
  const frameExtraW = 22, frameExtraH = 20;
  let maxCanvasWByWidth;
  if(isObserverMobile){
    // Deux plateaux côte à côte -> partager la largeur (incluant l'espace entre)
    const boardsGap = 8; // synchronisé avec CSS observer-mode
    const totalExtras = (frameExtraW*2) + boardsGap + 4;
    maxCanvasWByWidth = Math.max(100, Math.floor((availW - totalExtras) / 2));
  } else {
    maxCanvasWByWidth = Math.max(100, Math.floor(availW - frameExtraW - 4));
  }
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
  // Opponent canvas même dimension en mobile
  if(oppCvs){
    if(oppCvs.width !== pxW) oppCvs.width = pxW;
    if(oppCvs.height !== pxH) oppCvs.height = pxH;
    oppCvs.style.width = pxW + 'px';
    oppCvs.style.height = pxH + 'px';
  }
  // Observer right canvas (si présent)
  try{
    if(typeof obsRightCvs !== 'undefined' && obsRightCvs){
      if(obsRightCvs.width !== pxW) obsRightCvs.width = pxW;
      if(obsRightCvs.height !== pxH) obsRightCvs.height = pxH;
      obsRightCvs.style.width = pxW + 'px';
      obsRightCvs.style.height = pxH + 'px';
    }
  }catch{}
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
    if(window.matchMedia && window.matchMedia('(max-width: 900px)').matches){ wrap.style.display = ''; }
    else {
      // En mode observateur, on utilise le cadre dédié et on cache le plateau adverse standard
      wrap.style.display = (observingRoom && !roomId) ? 'none' : (roomId ? 'flex' : 'none');
    }
  }
  if(waitBanner){
    const hideForSpectate = !!(observingRoom && !roomId);
    waitBanner.classList.toggle('hidden', hideForSpectate || !roomId || !!peerConnected);
  }
  try{
    const app = document.getElementById('app');
    if(app){
      app.classList.toggle('solo-mode', !roomId && !observingRoom);
      // En mode observateur, activer une classe dédiée pour le layout mobile
      app.classList.toggle('observer-mode', !!(observingRoom && !roomId));
    }
  }catch{}
  if(panelMP){ panelMP.classList.toggle('hidden', !roomId && !observingRoom); }
  // Positionner le panneau MP selon le breakpoint (mobile: plein largeur sous les plateaux)
  try{ placeMPPanel(); }catch{}
  // Recalibrer la taille du plateau au basculement solo/multi
  try{ fitBoardToContainer(); draw(); balanceUnderPanelsHeight(); }catch{}
  // miniature en sidebar: visible seulement en multi (gérée par CSS via .solo-mode)
  // Visibilité du bouton Easy: masqué en solo, sauf si le joueur s'appelle "kham"; visible en multi
  try{
    const easyBtn = document.getElementById('easy-btn');
    const aiDD = document.getElementById('ai-dd');
    if(easyBtn){
  const isObserving = !!(observingRoom && !roomId);
  const isSolo = !roomId && !observingRoom;
  const isKham = (playerName||'').trim().toLowerCase() === 'kham';
  // En mode observateur: jamais visible
      if(isObserving){ easyBtn.style.display = 'none'; if(aiDD){ aiDD.classList.add('hidden'); easyBtn.setAttribute('aria-expanded','false'); } }
  else if(isSolo && !isKham){ easyBtn.style.display = 'none'; }
  else { easyBtn.style.display = ''; }
    }
  }catch{}
  // Cadre spectateur droit
  try{
    const obsWrap = document.getElementById('board-obs-right');
    if(obsWrap){ obsWrap.classList.toggle('hidden', !(observingRoom && !roomId)); }
  const meLabel = document.getElementById('me-label'); if(meLabel && (observingRoom && !roomId)){ meLabel.textContent = String(obsLeftName||'—'); }
  if(obsRightLabel && (observingRoom && !roomId)){ obsRightLabel.textContent = String(obsRightName||'—'); }
  }catch{}
  // Emotes masqué en mode observateur
  try{ if(panelEmotes){ panelEmotes.style.display = (observingRoom && !roomId) ? 'none' : ''; } }catch{}
  // Bouton Prêt/Nouvelle partie masqué en mode observateur
  try{ if(btnNew){ btnNew.style.display = (observingRoom && !roomId) ? 'none' : ''; } }catch{}
  // Badge observateurs
  try{ updateObserversBadge(); }catch{}
  // Rafraîchir les libellés
  try{ refreshBoardLabels(); }catch{}
}

// ---------- UI helpers ----------
function updateStartButtonLabel(){
  if(!btnNew) return;
  // Helpers pour afficher l'icône contextuelle
  const showIcon = (which)=>{
    try{
      const plus = btnNew.querySelector('.ico-plus');
  const up = btnNew.querySelector('.ico-thumb-up');
  const down = btnNew.querySelector('.ico-thumb-down');
  if(plus) plus.style.display = (which==='plus')? '' : 'none';
  if(up) up.style.display = (which==='up')? '' : 'none';
  if(down) down.style.display = (which==='down')? '' : 'none';
    }catch{}
  };
  // En partie: montrer toujours "Je suis prêt"; désactiver tant qu'aucun adversaire
  if(roomId){
    // Pendant une manche, masquer le bouton pour éviter les changements d'état
    if(mpStarted){
      btnNew.style.display = 'none';
    } else {
  btnNew.style.display = '';
  // En partie, on garde l'icône; on met à jour l'aria-label uniquement
  btnNew.setAttribute('aria-label', myReady ? 'Prêt' : 'Pas prêt');
  // Icône pouce selon prêt/pas prêt
  showIcon(myReady ? 'up' : 'down');
      // Laisser cliquable même durant le compte à rebours pour permettre d'annuler
      btnNew.disabled = false;
      // Visibilité accrue: clignoter tant que je ne suis pas prêt
      const blink = !myReady;
      btnNew.classList.toggle('cta-blink', blink);
      btnNew.classList.toggle('cta-strong', blink);
      // Couleurs d'état demandées
      btnNew.classList.toggle('ready', !!myReady);
      btnNew.classList.toggle('attn', !myReady);
      // Afficher une invite une fois quand l'adversaire est là et que je ne suis pas prêt
      if(!inviteToastShown && peerConnected && !myReady){
        showToast('Appuyez sur « Prêt » pour commencer la partie', 5000);
        inviteToastShown = true;
      }
    }
  } else {
    btnNew.style.display = '';
    // En solo, l’icône représente “Nouvelle partie” (texte masqué dans le HTML)
    btnNew.setAttribute('aria-label', 'Nouvelle partie');
    btnNew.disabled = false;
    btnNew.classList.remove('cta-blink');
    btnNew.classList.remove('cta-strong');
    btnNew.classList.remove('ready');
    btnNew.classList.remove('attn');
  // Icône plus en solo
  showIcon('plus');
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
  // Onglet par défaut: Parties (Créer accessible uniquement ici)
  setJoinTab('rooms');
  fetchRoomsJoin();
  fetchPlayersJoin();
  if(joinPoll) clearInterval(joinPoll);
  joinPoll = setInterval(()=>{ fetchRoomsJoin(); fetchPlayersJoin(); }, 1500);
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  try{ dlgSpectators && dlgSpectators.close(); }catch{}
  // Rétablir le scroll/navigations par défaut hors jeu
  try{ document.documentElement.style.overscrollBehaviorY='auto'; document.body.style.overscrollBehaviorY='auto'; }catch{}
  // Si on était observateur, se désinscrire automatiquement côté serveur
  try{ if(observingRoom && ws && ws.readyState===1){ ws.send(JSON.stringify({ type:'unobserve' })); } }catch{}
  observingRoom = null; pendingObserveRoom = null; obsLeftId = obsRightId = null; obsCount = 0; spectatorsList = [];
  // Remettre l'UI à plat
  resetIdleView();
}
function showGame(){
  try{ document.body.classList.add('game-open'); }catch{}
  setScreen('game');
  // Limiter les gestes de navigation/refresh quand le jeu est actif
  try{ document.documentElement.style.overscrollBehaviorY='contain'; document.body.style.overscrollBehaviorY='contain'; }catch{}
  if(joinPoll) { clearInterval(joinPoll); joinPoll = null; }
  try{ window.scrollTo({ top: 0, behavior: 'smooth' }); }catch{}
  try{ dlgGameOver && dlgGameOver.close(); }catch{}
  try{ dlgResult && dlgResult.close(); }catch{}
  // Si aucune manche ne tourne, basculer sur un état propre
  if(!running && !mpStarted){ resetIdleView(); }
  // Mobile: séquence de chargement rapide pour éviter les sauts de layout
  const isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
  if(isMobile){
    try{ showToast('Chargement en cours…'); }catch{}
    // Masquer temporairement les frames pour éviter le clignotement
    try{ document.querySelectorAll('.boards .frame').forEach(f=> f.style.visibility='hidden'); }catch{}
    setTimeout(()=>{
      try{ placeMPPanel(); fitBoardToContainer(); balanceUnderPanelsHeight(); }catch{}
      try{ document.querySelectorAll('.boards .frame').forEach(f=> f.style.visibility=''); }catch{}
      draw(); positionToastForGame();
      setTimeout(()=>{ if(toastEl) toastEl.classList.add('hidden'); }, 800);
    }, 20);
  } else {
    try{ placeMPPanel(); fitBoardToContainer(); balanceUnderPanelsHeight(); }catch{}
  }
  draw(); updateOpponentVisibility(); updateStartButtonLabel(); renderPlayersList();
  positionToastForGame();
}
function setScreen(which){
  if(screenStart) screenStart.classList.toggle('active', which==='start');
  if(screenJoin) screenJoin.classList.toggle('active', which==='join');
  if(screenGame) screenGame.classList.toggle('active', which==='game');
  try{ document.body.classList.toggle('game-open', which==='game'); }catch{}
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
  const icon = (r)=> r? '✅' : '⌛';
  const crop = (s)=>{ s = String(s||''); return s.length>8 ? (s.slice(0,8)+'…') : s; };
  // Badge spectateurs dans l’entête du panneau
  try{
    const panel = document.getElementById('panel-mp');
    if(panel){
      let h2 = panel.querySelector('h2');
      if(h2){
        let badge = h2.querySelector('.spectators-badge');
        if(!badge){
          badge = document.createElement('button');
          badge.className = 'spectators-badge';
          badge.type = 'button';
          badge.title = 'Voir les observateurs';
          badge.setAttribute('aria-label','Observateurs');
          badge.addEventListener('click', ()=>{ showSpectatorsModal(); });
          h2.appendChild(badge);
        }
        badge.textContent = `👁️ ${Number(obsCount||0)}`;
        badge.style.display = (Number(obsCount||0) > 0) ? '' : 'none';
      }
    }
  }catch{}
  // Moi
  const me = document.createElement('li');
  const myLabel = (observingRoom && !roomId) ? (obsLeftName || '—') : (playerName||'Moi');
  me.innerHTML = `
    <div class="row row1"><span class="name"><span class="st">${icon(myReady)}</span><span class="nm">${crop(myLabel)}</span></span></div>
    <div class="row row2"><span class="sc">Score ${Number(score||0)} • Lignes ${Number(linesClearedTotal||0)} • Niv ${Number(level||1)}</span></div>`;
  playersListEl.appendChild(me);
  // Adversaire
  const opp = document.createElement('li');
  if(peerConnected){
  const name = (observingRoom && !roomId) ? (obsRightName || '—') : ((document.getElementById('opp-label')?.textContent)||'Adversaire');
    opp.innerHTML = `
      <div class="row row1"><span class="name"><span class="st">${icon(peerReady)}</span><span class="nm">${crop(name)}</span></span></div>
      <div class="row row2"><span class="sc">Score ${Number(opponentScore||0)} • Lignes ${Number(opponentLines||0)} • Niv ${Number(opponentLevel||1)}</span></div>`;
  } else {
    opp.innerHTML = `
      <div class="row row1"><span class="name"><span class="st">⌛</span><span class="nm">—</span></span></div>
      <div class="row row2"><span class="sc">–</span></div>`;
  }
  playersListEl.appendChild(opp);
}

// --------- Toast helper ---------
function showToast(msg, dur){
  if(!toastEl) return;
  toastEl.innerHTML = `<span class="msg">${msg}</span>`;
  toastEl.classList.remove('hidden');
  // En jeu: centrage entre les plateaux
  if(screenGame && screenGame.classList.contains('active')){ positionToastForGame(); toastEl.classList.add('at-center'); }
  // annuler un hide en cours et programmer le nouveau
  try{ if(_toastTO){ clearTimeout(_toastTO); _toastTO = null; } }catch{}
  const delay = Math.max(0, Number(dur ?? 5000));
  _toastTO = setTimeout(()=>{ try{ toastEl.classList.add('hidden'); }finally{ _toastTO=null; } }, delay);
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

// ===== Observateurs: modale liste =====
function renderSpectatorsModal(){
  if(!spectatorsListEl) return;
  spectatorsListEl.innerHTML = '';
  const list = Array.isArray(spectatorsList) ? spectatorsList : [];
  if(list.length === 0){
    const li = document.createElement('li');
    li.textContent = 'Aucun observateur';
    spectatorsListEl.appendChild(li);
    return;
  }
  list.forEach(p=>{
    const li = document.createElement('li');
    const nm = p && (p.name||p.id) ? String(p.name||p.id) : 'Observateur';
    li.textContent = nm;
    spectatorsListEl.appendChild(li);
  });
}
function showSpectatorsModal(){
  if(!dlgSpectators) return;
  renderSpectatorsModal();
  try{ dlgSpectators.showModal(); }catch{}
}
if(spectatorsCloseBtn){ spectatorsCloseBtn.addEventListener('click', ()=>{ try{ dlgSpectators && dlgSpectators.close(); }catch{} }); }

// --------- Placement adaptatif du panneau Multijoueur ---------
function placeMPPanel(){
  if(!panelMP) return;
  const sidebar = document.querySelector('#app .sidebar');
  if(!sidebar) return;
  try{
    const status = document.querySelector('#app .panel.status');
    const next = document.querySelector('#app .panel.next');
    const oppPrev = document.querySelector('#app .panel.opp-preview');
  // Ordre: Status -> Blocs -> Multijoueur -> Miniature
  if(status && status.parentElement !== sidebar) sidebar.appendChild(status);
  if(next && next.parentElement !== sidebar) sidebar.appendChild(next);
  if(panelMP && panelMP.parentElement !== sidebar) sidebar.appendChild(panelMP);
    if(oppPrev && oppPrev.parentElement !== sidebar) sidebar.appendChild(oppPrev);
    // Réordonner même s'ils sont déjà dans la sidebar
  if(status) sidebar.insertBefore(status, sidebar.firstChild);
  if(next) sidebar.insertBefore(next, status.nextSibling);
  if(panelMP) sidebar.insertBefore(panelMP, next.nextSibling);
  if(oppPrev) sidebar.insertBefore(oppPrev, panelMP.nextSibling);
  }catch{}
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
let _heroCssW=0, _heroCssH=0; // dimensions CSS (px) pour le dessin
let _heroLastFrame=0, _heroFallbackTimer=null, _heroInterval=null, _heroHasDrawn=false;
function setupHeroAnimation(){
  heroCvs = document.getElementById('hero-bg');
  heroFxCvs = document.getElementById('hero-fx');
  if(!heroCvs) return;
  heroCtx = heroCvs.getContext('2d');
  heroFxCtx = heroFxCvs ? heroFxCvs.getContext('2d') : null;
  // Resize robuste: prend en compte le devicePixelRatio et les 0px initiaux
  const doResize = ()=>{
    try{
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const cssW = heroCvs.clientWidth || heroCvs.offsetWidth || 0;
      const cssH = heroCvs.clientHeight || heroCvs.offsetHeight || 0;
      _heroCssW = cssW; _heroCssH = cssH;
      // BG canvas
      heroCvs.width = Math.max(1, Math.floor(cssW * dpr));
      heroCvs.height = Math.max(1, Math.floor(cssH * dpr));
      if(heroCtx){ heroCtx.setTransform(dpr,0,0,dpr,0,0); }
      // FX canvas (au-dessus du fond, sous le menu)
      if(heroFxCvs){
        const cssW2 = heroFxCvs.clientWidth || heroFxCvs.offsetWidth || cssW;
        const cssH2 = heroFxCvs.clientHeight || heroFxCvs.offsetHeight || cssH;
        heroFxCvs.width = Math.max(1, Math.floor(cssW2 * dpr));
        heroFxCvs.height = Math.max(1, Math.floor(cssH2 * dpr));
        if(heroFxCtx){ heroFxCtx.setTransform(dpr,0,0,dpr,0,0); }
      }
    }catch{}
  };
  const resize=()=>{
    doResize();
    // Si la mise en page n’est pas encore prête (0px), réessayer rapidement
    if((_heroCssW|0)===0 || (_heroCssH|0)===0){ setTimeout(doResize, 50); setTimeout(doResize, 150); }
  };
  resize();
  // Suivre les changements de taille du conteneur .hero
  try{
    const hero = document.querySelector('.hero');
    if(hero && window.ResizeObserver){ const ro = new ResizeObserver(()=> resize()); ro.observe(hero); }
  }catch{}
  window.addEventListener('resize', resize);
  // graines initiales
  heroBlocks = [];
  for(let i=0;i<34;i++){ heroBlocks.push(makeHeroBlock()); }
  // watchdog: si rien n'a été dessiné au bout de 900ms, forcer un burst + fallback interval
  try{ if(_heroFallbackTimer) clearTimeout(_heroFallbackTimer); }catch{}
  _heroHasDrawn = false; _heroLastFrame = 0;
  _heroFallbackTimer = setTimeout(()=>{
    try{
      if(!_heroHasDrawn){
        // forcer des blocs très visibles + un burst au centre
        for(let k=0;k<20;k++) heroBlocks.push(makeHeroBlock());
        const rect = (heroFxCvs||heroCvs).getBoundingClientRect();
        spawnHeroBurst(rect.left + rect.width*0.5, rect.top + rect.height*0.5, 1);
        if(!_heroInterval){ _heroInterval = setInterval(()=> drawHero(performance.now()), 1000/30); }
        if(heroFxCvs){ heroFxCvs.style.visibility='visible'; heroFxCvs.style.opacity='1'; }
      }
    }catch{}
  }, 900);
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
function stopHeroAnimation(){ if(heroRAF){ cancelAnimationFrame(heroRAF); heroRAF=0; } try{ if(_heroInterval){ clearInterval(_heroInterval); _heroInterval=null; } }catch{} }
function makeHeroBlock(){
  // Désormais: véritables tétriminos 4×4
  const keys = SHAPES;
  const key = keys[(Math.random()*keys.length)|0];
  const mat = clone(TETROMINOS[key]);
  const color = COLORS[key] || '#9AA0A8';
  const baseCell = 16 + Math.random()*12; // un peu plus grand pour la lisibilité
  return {
    type: 'tetromino',
    key,
    mat,
    color,
    cell: baseCell,
    x: Math.random(), // 0..1 (ratio largeur)
    y: -Math.random()*0.25, // au-dessus
    size: baseCell*4, // taille globale indicative
  speed: 0.16 + Math.random()*0.24, // un peu plus rapide
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
  if(!(heroFxCtx||heroCtx)) return;
  const baseCvs = (heroFxCvs && heroFxCtx) ? heroFxCvs : heroCvs;
  if(!baseCvs) return;
  const cssW = _heroCssW || baseCvs.clientWidth || baseCvs.width;
  const cssH = _heroCssH || baseCvs.clientHeight || baseCvs.height;
  if(!cssW || !cssH) return;
  _heroLastFrame = ts||performance.now(); _heroHasDrawn = true;
  // Nettoyer les deux canvases, en neutralisant la transform pour clearRect
  const safeClear = (ctx, cvs)=>{
    if(!ctx || !cvs) return;
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,cvs.width,cvs.height);
    ctx.restore();
  };
  safeClear(heroCtx, heroCvs);
  safeClear(heroFxCtx, heroFxCvs);
  // Dessiner au-dessus du fond mais sous le menu → préférer heroFxCtx quand dispo
  const ctx = heroFxCtx || heroCtx;
  const dt = 1/60;
  // parfois, ajouter un bloc
  const target = 34 + Math.floor(Math.sin(ts*0.0015)*6);
  if(heroBlocks.length<target && Math.random()<0.22){ heroBlocks.push(makeHeroBlock()); }
  heroBlocks.forEach(b=>{
    if(b.exploded){ b.life -= 0.02; }
    else {
      b.y += b.speed*dt;
      b.rot += b.rotSpeed*dt;
      // wobble latéral léger
      b.x += Math.sin((ts*0.001) + b.wobble) * 0.0005;
      if(b.y>0.92){ b.exploded = true; }
    }
  const x = b.x*cssW, y = b.y*cssH;
    ctx.save();
    ctx.translate(x,y); ctx.rotate(b.rot);
    // glow plus visible
    ctx.globalAlpha = 0.92;
    ctx.shadowColor = 'rgba(56,189,248,0.35)'; ctx.shadowBlur = 18;
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
  const grad = ctx.createLinearGradient(px,py,px,py+cell);
  // légère oscillation de teinte pour animer le visuel
  const osc = Math.sin((ts*0.002) + i + j) * 6;
  grad.addColorStop(0, shade(b.color, 10 + osc));
  grad.addColorStop(1, shade(b.color,-12 + osc*0.5));
      ctx.fillStyle = grad;
      roundRect(ctx, px+2, py+2, cell-4, cell-4, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, px+2, py+2, cell-4, cell-4, 5);
      ctx.stroke();
    }
    // explosion simple: halo
    if(b.exploded){
      ctx.globalCompositeOperation='lighter'; ctx.globalAlpha = 0.85;
      const s = Math.max(wCells,hCells)*cell;
      ctx.fillStyle='rgba(56,189,248,0.15)';
      ctx.beginPath(); ctx.arc(0,0, s*0.9*(1.1-b.life), 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
  // supprimer blocs trop fades
  heroBlocks = heroBlocks.filter(b=> b.life>0.05 && b.y<1.2);
  // Particules FX au-dessus (même canvas si heroFxCtx)
  const pcv = baseCvs; const ctxp = ctx; const dtp = 1/60;
  heroParticles.forEach(p=>{
    p.vy += 400*dtp; // gravité
    p.x += p.vx*dtp; p.y += p.vy*dtp;
    p.life -= 0.018;
    ctxp.save();
    ctxp.globalCompositeOperation = 'lighter';
    ctxp.globalAlpha = Math.max(0, p.life);
    ctxp.fillStyle = `hsl(${p.hue}deg 90% 65%)`;
    ctxp.beginPath(); ctxp.arc(p.x, p.y, p.size, 0, Math.PI*2); ctxp.fill();
    ctxp.restore();
  });
  heroParticles = heroParticles.filter(p=> p.life>0 && p.y < (pcv ? pcv.height : h)+20);
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
  // Contexte courant pour comparer les deltas
  const holesBefore = countHoles(grid);
  const heightBefore = stackHeight(grid);
  const freeRows = ROWS - heightBefore;
  const inDanger = freeRows <= 4; // on touche le plafond
  // second lookahead (2-plies) si dispo
  const next1 = nextQueue[0] ? nextQueue[0].key : null;
  const next2 = nextQueue[1] ? nextQueue[1].key : null;
  // Bag-aware: estimer si un 'I' est imminent dans le sac courant (prochaines 5 pièces env.)
  const upcomingKeys = [next1, next2].concat(nextQueue.slice(2).map(p=>p.key));
  const iIndex = upcomingKeys.findIndex(k=> k==='I');
  const iSoon = iIndex >= 0 && iIndex <= 4; // I attendu dans peu de temps
  // Préférence de puits à droite si I bientôt là
  const preferRightWell = iSoon;
  for(let rot=0; rot<4; rot++){
    const mat = rotateN(TETROMINOS[pieceKey], rot);
    // largeur utile
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      // tomber sur la grille actuelle
      let py = -2; while(!collide(px, py+1, mat)) py++;
      if(py < -1) continue;
      const sim = clone(grid);
      placeOn(sim, px, py, mat, pieceKey);
      const cleared = simulateClear(sim);
  const h1 = stackHeight(sim);
  const holes = countHoles(sim);
  const bump = bumpiness(sim);
  // Trous collés au bord (c=0 ou c=COLS-1) après ce coup
  const edgeHoles = countEdgeHoles(sim);
  // Nouveaux trous créés par ce coup (pénalisés fortement, surtout si posés haut)
  const newHoles = Math.max(0, holes - holesBefore);
  // Plus la pose est haute (py petit), plus on pénalise un trou créé
  const highPoseFactor = 1 + Math.max(0, (16 - Math.max(0, py))) * 0.06; // jusqu'à ~1.96x
      // score mobilité: combien de placements légaux pour la prochaine pièce (plus = moins de pièges)
      let mobility = 0;
      if(next1){ mobility = countLegalPlacements(sim, next1); }
      // score lookahead 1 et 2
      const la1 = next1 ? bestPlacementScoreForNext(sim, next1) : 0;
      let la2 = 0;
      if(next1 && next2){
        // estimer la suite: on simule le meilleur placement pour next1 puis évalue next2
        la2 = bestPlacementScoreWithFollow(sim, next1, next2);
      }
      // Bonus potentiel si on bouche un trou existant au coup suivant (heuristique cheap)
      let fillBonus = 0;
      if(next1){
        const beforeHoles = holesBefore;
        const bestAfterNext = bestPlacementThatReducesHoles(sim, next1, beforeHoles);
        if(bestAfterNext && bestAfterNext.holesReduced>0){
          fillBonus = Math.min(10, bestAfterNext.holesReduced * 4);
        }
      }
      // bonus/malus
      // Poids par profil IA
      const weights = getAIWeights(aiProfile);
      // Récompense clears; booster 2 lignes si on est haut
      let clearedBonus = (cleared>=3 ? weights.clear3Bonus : cleared * weights.clearUnit);
      if(inDanger && cleared===2){ clearedBonus *= weights.clear2DangerBoost; }
      // Récompenser la baisse de hauteur (utile quand on est haut)
      const deltaHeight = h1 - heightBefore; // <0 si on a abaissé la pile globale
      const dropReward = (deltaHeight < 0 ? (-deltaHeight) * weights.heightDropReward * (inDanger ? 1.4 : 1.0) : 0);
      const wellPenalty = deepWells(sim) * weights.deepWell;
      const overhangPenalty = overhangs(sim) * weights.overhang;
      // Pénalités classiques, avec poids height amplifié en danger
      let score = clearedBonus + dropReward + fillBonus
        - holes * weights.holes
        - bump * weights.bump
        - h1   * (weights.height * (inDanger ? 1.5 : 1.0))
        - (newHoles * weights.newHole * highPoseFactor)
        - edgeHoles * weights.edgeHole
        - wellPenalty - overhangPenalty
        + la1  * weights.look1
        + la2  * weights.look2
        + mobility * weights.mobility;
      // Bag-aware bonus/malus: favoriser un puits sur le bord droit si un I arrive bientôt
      if(preferRightWell){
        const rightDepth = columnDepthAt(sim, COLS-1);
        // bonus si bord droit plus bas que voisins (puits ouvert)
        if(rightDepth >= 2) score += Math.min(12, rightDepth*3);
        // petite pénalité si on bouche le bord droit (surface remonte fortement)
        const heightsBefore = columnHeights(grid);
        const heightsAfter = columnHeights(sim);
        const deltaRight = heightsAfter[COLS-1] - heightsBefore[COLS-1];
        if(deltaRight > 0){
          // Si on clear 2+ lignes, alléger la pénalité pour ne pas refuser un bon move de survie
          const rightClosePenalty = Math.min(10, deltaRight*2) * (cleared>=2 ? 0.5 : 1.0);
          score -= rightClosePenalty;
        }
      }
      const candidate = { x:px, rot, yLanding:py, score, cleared };
      if(!best || score > best.score){ best = candidate; }
      if(cleared === 0){ if(!bestNonClear || score > bestNonClear.score){ bestNonClear = candidate; } }
    }
  }
  // Politique Easy révisée:
  // - On peut décourager les 1-ligne si alternative non-clear proche ET qu'on n'est pas en danger.
  // - Ne PAS décourager les 2-lignes (souvent des sauvetages), surtout en hauteur.
  if(best && best.cleared===1 && bestNonClear && !inDanger){
    const margin = 20; // tolérance
    if(best.score - bestNonClear.score <= margin){ hint = bestNonClear; return; }
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

// Compte les trous adjacents au bord (colonne 0 ou 9)
function countEdgeHoles(sim){
  let holes=0;
  for(let c of [0, COLS-1]){
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
  const w = getAIWeights(aiProfile);
  const sc = clearedBonus - holes*w.holes*0.93 - bump*w.bump*1.0 - h1*w.height*1.0;
      if(sc>best) best=sc;
    }
  }
  return best;
}

// Cherche un placement de la prochaine pièce qui réduit le nombre de trous
function bestPlacementThatReducesHoles(simGrid, nextKey, holesBefore){
  let best=null;
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[nextKey], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim = clone(simGrid);
      placeOn(sim, px, py, mat, nextKey);
      const h = countHoles(sim);
      const reduced = Math.max(0, holesBefore - h);
      if(reduced>0){
        const cand = { holesReduced: reduced };
        if(!best || cand.holesReduced > best.holesReduced){ best = cand; }
      }
    }
  }
  return best;
}

function getAIWeights(profile){
  switch(profile){
    case 'prudent':
      return { holes:9.2, bump:0.7, height:0.28, look1:0.45, look2:0.22, mobility:0.35, deepWell:1.6, overhang:2.6, clear3Bonus:65, clearUnit:2, newHole:12.0, heightDropReward:3.2, clear2DangerBoost:1.5, edgeHole:1.2 };
    case 'conservateur':
  return { holes:8.5, bump:0.65, height:0.26, look1:0.5, look2:0.25, mobility:0.35, deepWell:1.4, overhang:2.2, clear3Bonus:70, clearUnit:3, newHole:10.0, heightDropReward:3.5, clear2DangerBoost:1.6, edgeHole:1.0 };
    case 'agressif':
  return { holes:6.2, bump:0.5, height:0.18, look1:0.7, look2:0.45, mobility:0.25, deepWell:1.0, overhang:1.6, clear3Bonus:95, clearUnit:7, newHole:7.2, heightDropReward:2.2, clear2DangerBoost:1.3, edgeHole:0.8 };
    default: // équilibré
  return { holes:7.2, bump:0.55, height:0.22, look1:0.6, look2:0.35, mobility:0.3, deepWell:1.2, overhang:2.0, clear3Bonus:80, clearUnit:6, newHole:8.5, heightDropReward:2.8, clear2DangerBoost:1.5, edgeHole:0.9 };
  }
}

// Lookahead: applique le meilleur placement pour k1, puis évalue k2
function bestPlacementScoreWithFollow(simGrid, k1, k2){
  let best=-Infinity;
  for(let rot=0;rot<4;rot++){
    const mat = rotateN(TETROMINOS[k1], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, px, py+1, mat)) py++;
      if(py<-1) continue;
      const sim1 = clone(simGrid);
      placeOn(sim1, px, py, mat, k1);
      simulateClear(sim1);
      const sc = bestPlacementScoreForNext(sim1, k2);
      if(sc>best) best=sc;
    }
  }
  return best;
}

// Nombre de placements légaux pour éviter les pièges
function countLegalPlacements(simGrid, key){
  let count=0;
  for(let rot=0; rot<4; rot++){
    const mat = rotateN(TETROMINOS[key], rot);
    let minX=4, maxX=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){ minX=Math.min(minX,i); maxX=Math.max(maxX,i); }
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      let py=-2; while(!collideGrid(simGrid, px, py+1, mat)) py++;
      if(py<-1) continue; count++;
    }
  }
  return count;
}

// Détecter puits profonds (colonnes nettement plus basses que voisines)
function deepWells(sim){
  const h = columnHeights(sim);
  let wells=0; for(let c=0;c<COLS;c++){
    const left = c>0 ? h[c-1] : h[c];
    const right = c<COLS-1 ? h[c+1] : h[c];
    const depth = Math.max(0, Math.max(left, right) - h[c]);
    if(depth >= 4) wells += (depth-3); // pénalise surtout puits >=4
  }
  return wells;
}

function overhangs(sim){
  // cases vides recouvertes par un toit horizontal
  let count=0;
  for(let r=0;r<ROWS-1;r++){
    for(let c=0;c<COLS;c++){
      if(!sim[r][c] && sim[r+1][c]){
        // vérifier un toit à c-1..c+1
        const left = c>0 && sim[r+1][c-1];
        const right = c<COLS-1 && sim[r+1][c+1];
        if(left || right) count++;
      }
    }
  }
  return count*0.5;
}

function columnHeights(sim){
  const heights = Array(COLS).fill(ROWS);
  for(let c=0;c<COLS;c++){
    for(let r=0;r<ROWS;r++){ if(sim[r][c]){ heights[c]=r; break; } }
  }
  return heights.map(r=> ROWS - r);
}

// Profondeur relative de la colonne c par rapport à ses voisins (puits si négatif)
function columnDepthAt(sim, c){
  const h = columnHeights(sim);
  const here = h[c];
  const left = c>0 ? h[c-1] : here;
  const right = c<COLS-1 ? h[c+1] : here;
  const maxNei = Math.max(left, right);
  return Math.max(0, maxNei - here);
}

function collideGrid(simGrid, px, py, mat){
  for(let j=0;j<4;j++) for(let i=0;i<4;i++) if(mat[j][i]){
    const gx=px+i, gy=py+j;
    if(gx<0||gx>=COLS||gy>=ROWS) return true;
    if(gy>=0 && simGrid[gy][gx]) return true;
  }
  return false;
}

