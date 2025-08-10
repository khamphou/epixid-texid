// Audio synth minimal (WebAudio) + option MP3 externe pour la musique de fond
// - Effets SFX: move/rotate/drop/lines
// - Musique: soit synthé interne (fallback), soit 2 pistes MP3 (chill/stress) mixées par crossfade

export class AudioFX {
  constructor() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Master
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);

    // Bus musique (commun aux deux modes)
  this.musicGain = this.ctx.createGain();
  // Volume global de la musique (chill/stress + intros)
  this.musicGain.gain.value = 0.28;
    this.musicGain.connect(this.master);

    // État musique (synth)
    this.musicTimer = null;
    this.musicMode = null; // 'chill' | 'stress'
    this._beatCount = 0;

    // État musique (MP3 externe)
    this._extInit = false;
    this._extReady = false;
    this._intensity = 0; // 0..1
    this.chillEl = null;
    this.stressEl = null;
    this.chillSrc = null;
    this.stressSrc = null;
    this.chillGain = null;
    this.stressGain = null;
  // Playlist chill (dossier /assets/music/chill)
  this._chillList = [];
  this._chillIdx = 0;
  // Intro et SFX externes
  this._startList = [];
  this._startIdx = 0;
  this.introEl = null; this.introSrc = null; this.introGain = null;
  this._sfx = {
    break: { el: null, src: null, gain: null },
    join:  { el: null, src: null, gain: null },
    over:  { el: null, src: null, gain: null },
  impact:{ el: null, src: null, gain: null },
  };
  // Intro écran d'accueil
  this.homeEl = null; this.homeSrc = null; this.homeGain = null;
  // Pool local pour empêcher le GC des éléments préchargés
  this._preloads = [];
  }

  resume() {
    if (this.ctx.state !== 'running') return this.ctx.resume();
  }

  // --------- SFX court ----------
  oneShot() { /* SFX synth désactivés — mp3 uniquement */ }

  // Effet lignes: plus le combo est grand, plus c'est grave ET large
  linesCleared(count) {
    if(count>0){ try { this.playBreakSfx(); } catch {} }
  }

  rotate() { /* no-op */ }
  move() { /* no-op */ }
  drop() { /* no-op */ }

  // ----------- Musique MP3 externe (chill/stress) -----------
  async _initExternalMusic(options) {
    if (this._extInit) return this._extReady;
    this._extInit = true;
    const winTracks = (typeof window !== 'undefined' && window.MUSIC_TRACKS) || {};

    // Construire la playlist chill à partir de plusieurs sources possibles (priorité décroissante):
    // 1) options.chillList (array d'URLs)
    // 2) window.MUSIC_TRACKS.chillList (array d'URLs) ou window.MUSIC_TRACKS.chill (string unique)
    // 3) import.meta.glob sur /assets/music/chill/**/*.{mp3,ogg,wav}
    // 4) fallback sur l'ancien fichier unique assets/music/chill.mp3
    let chillList = Array.isArray(options?.chillList) ? options.chillList.slice() : [];
    if (!chillList.length) {
      if (Array.isArray(winTracks.chillList)) chillList = winTracks.chillList.slice();
      else if (typeof winTracks.chill === 'string') chillList = [winTracks.chill];
    }
    if (!chillList.length) {
      try {
        // Chemin relatif depuis src/audio.js vers assets/music/chill
        // Utilise Vite import.meta.glob pour récupérer des URLs directes
  const glob = import.meta && import.meta.glob ? import.meta.glob('../assets/music/chill/**/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) : null;
        if (glob) chillList = Object.values(glob).filter(Boolean);
      } catch {}
    }
    if (!chillList.length) {
      chillList = ['assets/music/chill.mp3'];
    }

    // Source stress (inchangé par défaut)
    let stressSrcUrl = (options && options.stress) || winTracks.stress || null;
    if(!stressSrcUrl){
      try { stressSrcUrl = new URL('../assets/music/stress.mp3', import.meta.url).href; }
      catch { stressSrcUrl = '/assets/music/stress.mp3'; }
    }

    // Créer les éléments audio
  const a1 = new Audio();
  // Mélanger la playlist pour un ordre aléatoire non répétitif
  const list = (Array.isArray(chillList) ? chillList.slice() : []).filter(Boolean);
  for(let i=list.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const tmp = list[i]; list[i]=list[j]; list[j]=tmp; }
  this._chillList = list;
  this._chillIdx = 0;
  a1.src = this._chillList[this._chillIdx];
    a1.loop = false; // on boucle sur la playlist, pas sur un seul fichier
    a1.preload = 'auto';
    a1.crossOrigin = 'anonymous';
    // Enchaîner les pistes du dossier en boucle
    a1.addEventListener('ended', () => {
      if (!this._chillList.length) return;
      this._chillIdx += 1;
      if (this._chillIdx >= this._chillList.length){
        // Re-mélanger pour un nouveau cycle aléatoire
        const l = this._chillList.slice();
        for(let i=l.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const tmp = l[i]; l[i]=l[j]; l[j]=tmp; }
        this._chillList = l;
        this._chillIdx = 0;
      }
      a1.src = this._chillList[this._chillIdx];
      a1.play().catch(() => {});
    });

    const a2 = new Audio(); a2.src = stressSrcUrl; a2.loop = true; a2.preload = 'auto'; a2.crossOrigin = 'anonymous';
    this.chillEl = a1; this.stressEl = a2;
    try {
      this.chillSrc = this.ctx.createMediaElementSource(a1);
      this.stressSrc = this.ctx.createMediaElementSource(a2);
      this.chillGain = this.ctx.createGain();
      this.stressGain = this.ctx.createGain();
      this.chillGain.gain.value = 1;
      this.stressGain.gain.value = 0;
      this.chillSrc.connect(this.chillGain).connect(this.musicGain);
      this.stressSrc.connect(this.stressGain).connect(this.musicGain);
      this._extReady = true;
    } catch (e) {
      this._extReady = false;
    }
    return this._extReady;
  }

  // Choisir un morceau chill aléatoire et l'amorcer dans l'élément audio
  _pickRandomChill(force=false){
    if(!this._chillList || this._chillList.length===0 || !this.chillEl) return;
    const idx = Math.floor(Math.random() * this._chillList.length);
    if(!force && idx === this._chillIdx) return;
    this._chillIdx = idx;
    const wasPlaying = this._extReady && !this.chillEl.paused;
    try { this.chillEl.pause(); } catch {}
    this.chillEl.src = this._chillList[this._chillIdx];
    if(wasPlaying){ try { this.chillEl.currentTime = 0; this.chillEl.play(); } catch {} }
  }
  // ------- Intro (début de partie) -------
  _ensureStartList(){
    if(this._startList && this._startList.length) return this._startList;
    try{
  const glob = import.meta && import.meta.glob ? import.meta.glob('../assets/music/start/**/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) : null;
      if(glob) this._startList = Object.values(glob).filter(Boolean);
    }catch{}
    if(!this._startList || !this._startList.length){
      try { this._startList = [ new URL('../assets/music/game/start.mp3', import.meta.url).href ]; }
      catch { this._startList = []; }
    }
    return this._startList;
  }
  _ensureIntroChain(){
    if(this.introEl && this.introSrc && this.introGain) return true;
    try{
      const el = new Audio(); el.crossOrigin='anonymous'; el.preload='auto'; el.loop=false;
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = 0.22;
      src.connect(g).connect(this.musicGain);
      this.introEl = el; this.introSrc = src; this.introGain = g;
      return true;
    }catch{ return false; }
  }
  async playStartCue(seconds=5){
    const list = this._ensureStartList();
    if(!list || !list.length) return false;
    if(!this._ensureIntroChain()) return false;
    this._startIdx = Math.floor(Math.random()*list.length);
    const url = list[this._startIdx];
    try{ this.introEl.pause(); }catch{}
    this.introEl.src = url;
    // Baisser temporairement la musique de fond pour laisser l'intro bien audible
    const now = this.ctx.currentTime;
    const t = Math.max(1, Number(seconds)||5);
    const oldChill = this.chillGain ? this.chillGain.gain.value : null;
    const oldStress = this.stressGain ? this.stressGain.gain.value : null;
    try{
      if(this.chillGain){
        this.chillGain.gain.cancelScheduledValues(now);
        this.chillGain.gain.setValueAtTime(this.chillGain.gain.value, now);
        this.chillGain.gain.linearRampToValueAtTime(0.0, now + 0.12);
        this.chillGain.gain.setValueAtTime(0.0, now + t);
        if(oldChill!==null) this.chillGain.gain.linearRampToValueAtTime(oldChill, now + t + 0.35);
      }
      if(this.stressGain){
        this.stressGain.gain.cancelScheduledValues(now);
        this.stressGain.gain.setValueAtTime(this.stressGain.gain.value, now);
        this.stressGain.gain.linearRampToValueAtTime(0.0, now + 0.12);
        this.stressGain.gain.setValueAtTime(0.0, now + t);
        if(oldStress!==null) this.stressGain.gain.linearRampToValueAtTime(oldStress, now + t + 0.35);
      }
    }catch{}
    try{ await this.introEl.play(); }catch{}
    try{
      this.introGain.gain.cancelScheduledValues(now);
      this.introGain.gain.setValueAtTime(this.introGain.gain.value, now);
      this.introGain.gain.setValueAtTime(0.30, now);
      this.introGain.gain.setValueAtTime(0.30, now + t - 0.4);
      this.introGain.gain.linearRampToValueAtTime(0.0, now + t);
    }catch{}
    setTimeout(()=>{ try{ this.introEl.pause(); }catch{} }, t*1000 + 30);
    return true;
  }
  stopStartCue(){
    try{ if(this.introEl){ this.introEl.pause(); this.introEl.currentTime = 0; } }catch{}
    // restaurer immédiatement les gains si on avait ducké
    try{
      const now = this.ctx.currentTime;
      if(this.chillGain){ this.chillGain.gain.cancelScheduledValues(now); this.chillGain.gain.setValueAtTime(1 - this._intensity, now); }
      if(this.stressGain){ this.stressGain.gain.cancelScheduledValues(now); this.stressGain.gain.setValueAtTime(this._intensity, now); }
    }catch{}
  }
  // ------- SFX externes (break/join/gameover) -------
  _ensureSfx(kind, url, vol=0.35){
    const k = this._sfx[kind]; if(!k) return false;
    if(k.el && k.src && k.gain) return true;
    try{
      const el = new Audio(); el.src = url; el.crossOrigin='anonymous'; el.preload='auto'; el.loop=false;
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(g).connect(this.master);
      k.el = el; k.src = src; k.gain = g;
      return true;
    }catch{ return false; }
  }
  playBreakSfx(){
    let url;
  try{ url = new URL('../assets/music/sounds/break.mp3', import.meta.url).href; }
  catch{ url = 'assets/music/sounds/break.mp3'; }
    if(!this._ensureSfx('break', url, 0.28)) return;
    const k = this._sfx.break;
    try{ k.el.currentTime = 0; k.el.play(); }catch{}
  }
  playJoinerSfx(){
    let url;
  try{ url = new URL('../assets/music/sounds/joiner.mp3', import.meta.url).href; }
  catch{ url = 'assets/music/sounds/joiner.mp3'; }
    if(!this._ensureSfx('join', url, 0.26)) return;
    const k = this._sfx.join;
    try{ k.el.currentTime = 0; k.el.play(); }catch{}
  }
  playGameOverMusic(){
    let url;
  try{ url = new URL('../assets/music/sounds/gameover.mp3', import.meta.url).href; }
  catch{ url = 'assets/music/sounds/gameover.mp3'; }
    if(!this._ensureSfx('over', url, 0.30)) return;
    const k = this._sfx.over;
    try{ if(this.chillEl) this.chillEl.pause(); }catch{}
    try{ if(this.stressEl) this.stressEl.pause(); }catch{}
    try{ k.el.currentTime = 0; k.el.play(); }catch{}
  }

  // Impact au sol d'une pièce
  playImpactSfx(){
    let url;
    try{ url = new URL('../assets/music/sounds/impact.mp3', import.meta.url).href; }
    catch{ url = 'assets/music/sounds/impact.mp3'; }
    if(!this._ensureSfx('impact', url, 0.26)) return;
    const k = this._sfx.impact;
    try{ k.el.currentTime = 0; k.el.play(); }catch{}
  }

  // ------- Intro écran d'accueil -------
  _ensureHomeIntroChain(){
    if(this.homeEl && this.homeSrc && this.homeGain) return true;
    try{
      const el = new Audio(); el.crossOrigin='anonymous'; el.preload='auto'; el.loop=false;
      const src = this.ctx.createMediaElementSource(el);
      const g = this.ctx.createGain(); g.gain.value = 0.22; // volume modéré
      src.connect(g).connect(this.musicGain);
      this.homeEl = el; this.homeSrc = src; this.homeGain = g;
      return true;
    }catch{ return false; }
  }
  async playHomeIntroMusic(){
    let url;
    try{ url = new URL('../assets/music/game/intro.mp3', import.meta.url).href; }
    catch{ url = '/assets/music/game/intro.mp3'; }
    if(!this._ensureHomeIntroChain()) return false;
    try{ this.homeEl.pause(); }catch{}
    this.homeEl.src = url;
    try{ await this.homeEl.play(); }catch{}
    // fade-out léger à la fin si besoin (best-effort, si durée inconnue on laisse jouer une fois)
    return true;
  }

  // --------- Préchargement global de tous les MP3 ---------
  async preloadAll(){
    // Initialiser et précharger chill/stress
    try{
      await this._initExternalMusic();
      if(this.chillEl){ this.chillEl.preload = 'auto'; try{ this.chillEl.load(); }catch{} }
      if(this.stressEl){ this.stressEl.preload = 'auto'; try{ this.stressEl.load(); }catch{} }
      // Précharger toute la playlist chill découverte
      if(Array.isArray(this._chillList)){
        for(const url of this._chillList){
          try{
            const el = new Audio(); el.crossOrigin='anonymous'; el.preload='auto'; el.src = url; el.load();
            this._preloads.push(el);
          }catch{}
        }
      }
    }catch{}
    // Précharger la liste start (intro de manche)
    try{
      const startList = this._ensureStartList();
      for(const url of startList){
        try{ const el = new Audio(); el.crossOrigin='anonymous'; el.preload='auto'; el.src=url; el.load(); this._preloads.push(el); }catch{}
      }
    }catch{}
    // Précharger l’intro écran d’accueil
    try{
      if(this._ensureHomeIntroChain()){
        let homeUrl; try{ homeUrl = new URL('../assets/music/game/intro.mp3', import.meta.url).href; }catch{ homeUrl = '/assets/music/game/intro.mp3'; }
        this.homeEl.src = homeUrl; try{ this.homeEl.load(); }catch{}
      }
    }catch{}
    // Précharger SFX
    try{
  let urlB, urlJ, urlO, urlI;
      try{ urlB = new URL('../assets/music/sounds/break.mp3', import.meta.url).href; }catch{ urlB = 'assets/music/sounds/break.mp3'; }
      try{ urlJ = new URL('../assets/music/sounds/joiner.mp3', import.meta.url).href; }catch{ urlJ = 'assets/music/sounds/joiner.mp3'; }
      try{ urlO = new URL('../assets/music/sounds/gameover.mp3', import.meta.url).href; }catch{ urlO = 'assets/music/sounds/gameover.mp3'; }
  try{ urlI = new URL('../assets/music/sounds/impact.mp3', import.meta.url).href; }catch{ urlI = 'assets/music/sounds/impact.mp3'; }
      this._ensureSfx('break', urlB, 0.28); if(this._sfx.break?.el){ try{ this._sfx.break.el.load(); }catch{} }
      this._ensureSfx('join', urlJ, 0.26); if(this._sfx.join?.el){ try{ this._sfx.join.el.load(); }catch{} }
      this._ensureSfx('over', urlO, 0.30); if(this._sfx.over?.el){ try{ this._sfx.over.el.load(); }catch{} }
  this._ensureSfx('impact', urlI, 0.26); if(this._sfx.impact?.el){ try{ this._sfx.impact.el.load(); }catch{} }
    }catch{}
    return true;
  }

  async _ensureExternalPlaying() {
    if (!this._extReady) return false;
    try { if (this.chillEl.paused) await this.chillEl.play(); } catch {}
    try { if (this.stressEl.paused) await this.stressEl.play(); } catch {}
    return true;
  }

  // 0..1 (0 = chill, 1 = stress). Crossfade 0.5s
  async setMusicIntensity(v) {
    this._intensity = Math.min(1, Math.max(0, Number(v) || 0));
    const ok = await this._initExternalMusic();
    if (ok) {
      await this._ensureExternalPlaying();
      const now = this.ctx.currentTime;
      const t = 0.5; // s
      const chill = 1 - this._intensity;
      const stress = this._intensity;
      try {
        this.chillGain.gain.cancelScheduledValues(now);
        this.stressGain.gain.cancelScheduledValues(now);
        this.chillGain.gain.setValueAtTime(this.chillGain.gain.value, now);
        this.stressGain.gain.setValueAtTime(this.stressGain.gain.value, now);
        this.chillGain.gain.linearRampToValueAtTime(chill, now + t);
        this.stressGain.gain.linearRampToValueAtTime(stress, now + t);
      } catch {}
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      this.musicMode = null;
      return true;
    }
  // Pas de fallback synth — mp3 uniquement
  return false;
  }

  // ---- Musique de fond (synthé fallback) ----
  startMusic(mode = 'chill') {
    // Essayer de basculer sur MP3 si possible (lancement asynchrone best-effort)
    if (!this._extInit) {
      // ne pas attendre
      this._initExternalMusic().then((ok) => {
        if (ok) {
          if(mode === 'chill') this._pickRandomChill(true);
          this.setMusicIntensity(mode === 'stress' ? 1 : 0);
        }
      }).catch(() => {});
    } else if (this._extReady) {
      if(mode === 'chill') this._pickRandomChill(true);
      this.setMusicIntensity(mode === 'stress' ? 1 : 0);
      return;
    }

    if (this.musicMode === mode && this.musicTimer) return;
    this.stopMusic();
    this.musicMode = mode;
    const bpm = mode === 'stress' ? 138 : 92;
    const beatMs = 60000 / bpm;
    this._beatCount = 0;

    const roots = [220.00, 174.61, 130.81, 196.00]; // A3, F3, C3, G3
    const thirdMinor = 1.1892; // ~ +3 semitones
    const fifth = 1.4983; // +7 semitones

    const playBeat = () => {
      const t0 = this.ctx.currentTime;
      const bar = Math.floor(this._beatCount / 4) % 4;
      const root = roots[bar];

      // basse douce sur chaque temps fort
      if (this._beatCount % 4 === 0) {
        this._note({ freq: root / 2, duration: beatMs / 1000 * 0.9, type: 'sine', volume: 0.22 });
      }

      // pad court (2 notes) pour ambiance
      this._note({ freq: root * thirdMinor, duration: beatMs / 1000 * 0.6, type: 'triangle', volume: 0.10 });
      this._note({ freq: root * fifth, duration: beatMs / 1000 * 0.6, type: 'triangle', volume: 0.07 });

      if (mode === 'stress') {
        // petit arpège rapide (trois 16e)
        const step = beatMs / 1000 / 4;
        this._note({ freq: root, duration: step * 0.9, type: 'square', volume: 0.08 }, t0);
        this._note({ freq: root * thirdMinor, duration: step * 0.9, type: 'square', volume: 0.08 }, t0 + step);
        this._note({ freq: root * fifth, duration: step * 0.9, type: 'square', volume: 0.08 }, t0 + step * 2);
      }

      this._beatCount++;
    };

    // démarrage immédiat puis boucle
    playBeat();
    this.musicTimer = setInterval(playBeat, beatMs);
  }

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    this.musicMode = null;
    // Mettre en pause les pistes externes (laisser position courante)
    try { if (this.chillEl) this.chillEl.pause(); } catch {}
    try { if (this.stressEl) this.stressEl.pause(); } catch {}
  }

  gameOverJingle() { /* no-op: jingle synth désactivé */ }

  _note({ freq, duration, type = 'sine', volume = 0.1 }, when) {
    const t0 = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }
}
