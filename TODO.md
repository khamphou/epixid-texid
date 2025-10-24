# TODO - TEXID (Epixid Tetris)

**Date** : 2025-10-24
**Auteur** : Revue de code automatisée + Analyse des problèmes de superposition

---

## 🔴 CRITIQUES - À résoudre immédiatement

### 1. 🐛 Problème de Superposition d'Écrans (URGENT)

**Description** :
Les écrans ne se "release" pas correctement lors des transitions. Le canvas reste visible par-dessus l'écran d'accueil DOM, créant des superpositions visuelles.

**Causes identifiées** :

1. **Manque de nettoyage DOM/Canvas** :
   - `navigateToCanvas()` (main.js:60) cache `screen-start` et montre le canvas
   - **MAIS** aucune fonction inverse `navigateToDOM()` pour revenir
   - Le canvas n'est jamais caché dans `dispose()` des écrans de jeu

2. **HomeScreen.init() incomplet** :
   ```javascript
   // HomeScreen.js:21 - Ne gère pas la visibilité du canvas
   async init(){
     this.domHome = document.getElementById('screen-start');
     // ❌ MANQUE : Cacher le canvas et afficher screen-start
   }
   ```

3. **BaseGameScreen.navigateHome() partiel** :
   ```javascript
   // BaseGameScreen.js:316
   navigateHome(){
     document.getElementById('screen-start')?.classList.add('active');
     // ❌ MANQUE : Cacher le canvas
     this.core.sm.clear();
   }
   ```

4. **Seul btnExit fait le nettoyage complet** :
   ```javascript
   // main.js:142 - SEUL endroit qui cache le canvas
   core.sm.canvas.style.display = 'none';
   ```

**Impact** :
- ❌ Écran d'accueil invisible sous le canvas noir
- ❌ Boutons cliquables mais invisibles
- ❌ Multiples écrans se superposent lors des transitions
- ❌ Game Over → Retour accueil montre les deux écrans

**Solutions proposées** :

#### Solution A : Centraliser la gestion dans ScreenManager
```javascript
// client/src/core/screenManager.js
class ScreenManager {
  showCanvas(){
    this.canvas.style.display = 'block';
    this.canvas.style.pointerEvents = 'auto';
    document.getElementById('screen-start')?.classList.remove('active');
  }

  hideCanvas(){
    this.canvas.style.display = 'none';
    this.canvas.style.pointerEvents = 'none';
    document.getElementById('screen-start')?.classList.add('active');
  }

  replace(s){
    const old = this.stack.pop();
    old?.dispose?.();
    this.stack.push(s);
    s.init?.();
    // Auto-gérer la visibilité selon le type d'écran
    if(s.usesDOM){ this.hideCanvas(); }
    else { this.showCanvas(); }
  }
}
```

#### Solution B : Chaque écran gère sa visibilité
```javascript
// HomeScreen.init()
async init(){
  this.domHome = document.getElementById('screen-start');
  if(this.domHome){
    // Afficher le DOM hero, cacher le canvas
    this.domHome.classList.add('active');
    this.core.sm.canvas.style.display = 'none';
    this.core.sm.canvas.style.pointerEvents = 'none';
    document.getElementById('topbar')?.classList.add('hidden');
  }
  // ...
}

// BaseGameScreen.init() (ajout)
async init(){
  // Cacher le hero DOM, afficher le canvas
  document.getElementById('screen-start')?.classList.remove('active');
  this.core.sm.canvas.style.display = 'block';
  this.core.sm.canvas.style.pointerEvents = 'auto';
  document.getElementById('topbar')?.classList.remove('hidden');
  // ...
}
```

**Estimation** : 3-4h (Solution A recommandée)

---

### 2. ⚡ Performance - TrainingScreen IA trop lourde

**Fichier** : `client/src/screens/TrainingScreen.js:384-536`

**Problème** :
`_computeHint()` calcule ~40+ évaluations par frame (4 rotations × 10 colonnes) avec lookahead complexe.

**Code problématique** :
```javascript
_computeHint(){
  // 4 rotations × 10 colonnes = 40 placements possibles
  for(let rot=0; rot<4; rot++){
    for(let px=-minX; px<=COLS-(maxX+1); px++){
      // Calculs lourds pour chaque position :
      // - countHoles, bumpiness, stackHeight
      // - Lookahead jusqu'à 10 pièces (K=10)
      // - bestPlacementScoreForNext (récursif)
    }
  }
}
```

**Impact** :
- Lags sur mobiles/anciennes machines
- Frame drops visibles pendant le calcul
- ~150 lignes dans une seule fonction (complexité cyclomatique > 40)

**Solutions** :
1. **Web Worker** (recommandé)
   - Déplacer calculs IA dans `/client/src/workers/ai-worker.js`
   - Communication via `postMessage`
   - Libère le thread principal

2. **Cache intelligent**
   - Invalider uniquement sur changement de grille/pièce
   - Actuellement recalcule à chaque frame si `_needHintRecompute`

3. **Limiter lookahead dynamique**
   - K=2 si faible pile (< 50%)
   - K=10 si pile > 80% (danger)

**Estimation** : 6-8h

---

### 3. 💾 Fuites Mémoire - Event Listeners

**Fichiers** : Tous les screens

**Problème** :
Event listeners non nettoyés si `dispose()` échoue.

**Exemples** :
```javascript
// SoloScreen.js:69
window.addEventListener('keydown', this.onKeyDown);
// TrainingScreen.js:91
document.addEventListener('click', onDoc);

// dispose() peut échouer silencieusement
dispose(){
  try{
    window.removeEventListener('keydown', this.onKeyDown);
  }catch{}
}
```

**Solution moderne - AbortController** :
```javascript
class SoloScreen {
  init(){
    this._abortController = new AbortController();
    const signal = this._abortController.signal;

    window.addEventListener('keydown', this.onKeyDown, { signal });
    document.addEventListener('click', onDoc, { signal });
  }

  dispose(){
    this._abortController?.abort(); // Retire TOUS les listeners d'un coup
    super.dispose();
  }
}
```

**Estimation** : 2-3h (audit complet + tests)

---

### 4. 📦 Code Duplication - Helpers IA (500+ lignes)

**Fichiers** :
- `client/src/screens/TrainingScreen.js:593-729` (137 lignes)
- `/src/main.js` (legacy, ~400 lignes similaires)

**Fonctions dupliquées** :
```javascript
// Présentes dans 2 fichiers :
rotateN(), rotCW(), collideGrid(), cloneSim(), placeOn()
simulateClear(), stackHeight(), countHoles(), bumpiness()
columnHeights(), deepWells(), overhangs()
bestPlacementScoreForNext(), getAIWeights()
// ... + 10 autres
```

**Solution - Extraction en module** :
```
client/src/engine/ai/
  ├── AIEngine.js        # Classe principale
  ├── helpers.js         # countHoles, bumpiness, etc.
  ├── profiles.js        # Poids par profil (prudent, agressif...)
  ├── evaluator.js       # Logique d'évaluation placement
  └── simulation.js      # rotateN, collideGrid, simulateClear
```

**Estimation** : 6-8h + tests unitaires

---

## 🟠 MAJEURS - Qualité de code

### 5. 📏 Fonctions Trop Longues

**Problèmes** :
- `SoloScreen.render()` : **360 lignes** (187-547)
- `TrainingScreen.render()` : **145 lignes** (205-352)
- `TrainingScreen._computeHint()` : **150+ lignes** (384-536)
- `lock()` fonction : **50+ lignes** (622-672)

**Solution - Décomposition** :
```javascript
// SoloScreen.render() AVANT (360 lignes)
render(ctx){
  // Fond, layout, shake, jitter...
  // Board, ghost, pièces...
  // Sidebar, HOLD, NEXT...
  // Overlays, animations...
}

// APRÈS (lisible)
render(ctx){
  this._renderBackground(ctx);
  this._renderBoard(ctx);
  this._renderSidebar(ctx);
  this._renderOverlays(ctx);
  this._renderAnimations(ctx);
}

_renderBoard(ctx){
  const { bx, by, boardW, boardH, cell } = this._computeBoardLayout();
  this._drawFrame(ctx, bx, by, boardW, boardH);
  this._drawGrid(ctx, bx, by, cell);
  this._drawGhost(ctx, bx, by, cell);
  this._drawPieces(ctx, bx, by, cell);
}
```

**Estimation** : 4-5h

---

### 6. 🔢 Magic Numbers Partout

**Exemples** :
```javascript
// TrainingScreen.js
this._copilotCdMs = 35;          // ❓ Pourquoi 35 ?
this._copilotDropCdMs = 28;      // ❓ Pourquoi 28 ?

// Poids IA en dur (ligne 709-716)
return { holes:9.2, bump:0.7, height:0.28, ... }
```

**Solution - Fichiers de constantes** :
```javascript
// client/src/config/ai-constants.js
export const AI_CONFIG = {
  COPILOT: {
    ACTION_COOLDOWN_MS: 35,  // Temps entre rotations/déplacements
    DROP_COOLDOWN_MS: 28,    // Temps entre soft drops
    REASON: 'Simule timing humain proche DAS/ARR'
  },
  PROFILES: {
    PRUDENT: {
      holes: 9.2,
      bump: 0.7,
      height: 0.28,
      description: 'Minimise trous et surplombs'
    },
    // ...
  }
};
```

**Estimation** : 2-3h

---

### 7. 🌍 Mélange Langue FR/EN

**Problème** :
```javascript
// Incohérent
this._holdBlinkT = 0;        // EN
this.easyMode = true;        // EN
// Commentaires:
// "Sélection d'un profil"   // FR
```

**Solution** :
- Variables/fonctions : **Tout EN**
- Commentaires techniques : **EN**
- UI strings (texte visible) : **FR**

```javascript
// AVANT
this._holdBlinkT = 0;  // timer clignotement HOLD

// APRÈS
this._holdBlinkTime = 0;  // Blinking timer for HOLD panel
```

**Estimation** : 3-4h

---

### 8. 🔒 Sécurité localStorage

**Problème** :
```javascript
// HomeScreen.js:319 - Pas de validation
const playerName = String(localStorage.getItem('texid_name') || 'Player').slice(0,16);

// TrainingScreen.js:43 - Pas de sanitization
let saved = localStorage.getItem('texid_ai_profile');
if(saved === 'off'){ /* ... */ }
```

**Risque** :
- Valeurs corrompues/malicieuses
- XSS si utilisé dans innerHTML
- Quota localStorage dépassé

**Solution - SafeStorage utility** :
```javascript
// client/src/utils/SafeStorage.js
export class SafeStorage {
  static get(key, validator, defaultValue){
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return defaultValue;
      return validator(raw) ? raw : defaultValue;
    } catch { return defaultValue; }
  }

  static set(key, value){
    try {
      localStorage.setItem(key, value);
      return true;
    } catch { return false; }
  }
}

// Usage
const AI_PROFILES = ['prudent', 'conservateur', 'equilibre', 'agressif'];
const profile = SafeStorage.get(
  'texid_ai_profile',
  v => AI_PROFILES.includes(v) || v === 'off',
  'equilibre'
);
```

**Estimation** : 2h

---

## 🟡 IMPORTANTS - Tests & Documentation

### 9. 🧪 Aucun Test

**Constat** : Aucun fichier `.test.js` ou `.spec.js` trouvé.

**Solution - Infrastructure Vitest** :
```bash
npm install --save-dev vitest @testing-library/dom
```

**Tests prioritaires** :
1. **Helpers IA** (countHoles, bumpiness, stackHeight, etc.)
2. **Collision detection** (collideGrid, cannotEnterVisibleAtSpawn)
3. **Grid operations** (merge, clear)
4. **Scoring system** (onClear, combo, B2B)
5. **Bag random** (7-bag algorithm)

**Exemple** :
```javascript
// client/src/engine/ai/__tests__/helpers.test.js
import { describe, it, expect } from 'vitest';
import { countHoles, stackHeight } from '../helpers.js';

describe('AI Helpers', () => {
  it('countHoles should detect vertical holes', () => {
    const grid = [
      [1,1,1,1,1,1,1,1,1,1], // Bloc
      [0,0,0,0,0,0,0,0,0,0], // Trou
      [1,1,1,1,1,1,1,1,1,1], // Bloc
    ];
    expect(countHoles(grid, 10, 3)).toBe(10);
  });

  it('stackHeight should return correct height', () => {
    const grid = [
      [0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,0,0],
      [1,1,1,0,0,0,0,0,0,0], // Premier bloc ligne 2
    ];
    expect(stackHeight(grid, 10, 3)).toBe(1); // 3 - 2
  });
});
```

**Objectif** : Coverage 70%+

**Estimation** : 8-10h

---

### 10. 📖 Documentation JSDoc

**Problème** : Classes et fonctions non documentées.

**Solution** :
```javascript
/**
 * Training screen with AI assistance (Easy mode).
 * Extends SoloScreen with visual projections, placement hints,
 * and optional Copilot (auto-pilot).
 *
 * @extends SoloScreen
 * @property {boolean} easyMode - AI assistance enabled
 * @property {string} aiProfile - AI profile: 'prudent' | 'conservateur' | 'equilibre' | 'agressif'
 * @property {Object|null} _hint - Current AI hint: { x, rot, yLanding, score, cleared }
 */
export class TrainingScreen extends SoloScreen {
  /**
   * Computes the best placement hint for the active piece.
   * Uses lookahead (2-10 pieces) and lexicographic ordering:
   * minimize new holes first, then maximize score.
   *
   * @private
   * @returns {void} Updates this._hint and this._hintUseHold
   */
  _computeHint(){
    // ...
  }
}
```

**Outils** :
- JSDoc inline
- TypeDoc pour générer documentation HTML
- VS Code IntelliSense amélioré

**Estimation** : 4-5h

---

## 🔵 NICE-TO-HAVE - Améliorations futures

### 11. 🔷 Migration TypeScript (Progressif)

**Plan** :
1. **Phase 1** : `/client/src/engine/` (types stricts)
2. **Phase 2** : `/client/src/screens/`
3. **Phase 3** : `/client/src/core/`

**Config** :
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "allowJs": true,           // Cohabitation JS/TS
    "checkJs": true,           // Vérifier .js aussi
    "strict": true,
    "moduleResolution": "node"
  }
}
```

**Exemple** :
```typescript
// client/src/engine/ai/types.ts
export interface AIHint {
  x: number;
  rot: number;
  yLanding: number;
  score: number;
  cleared: number;
  newHoles: number;
}

export type AIProfile = 'prudent' | 'conservateur' | 'equilibre' | 'agressif';

export interface AIWeights {
  holes: number;
  bump: number;
  height: number;
  look1: number;
  look2: number;
  // ...
}
```

**Estimation** : 12-15h

---

### 12. 📦 Code Splitting & Lazy Loading

**Objectif** : Réduire bundle initial

**Solution** :
```javascript
// Lazy load TrainingScreen
async function startTraining(){
  const { TrainingScreen } = await import('./screens/TrainingScreen.js');
  // ...
}

// Vite config
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'ai-engine': [
            './client/src/engine/ai/AIEngine.js',
            './client/src/engine/ai/helpers.js'
          ]
        }
      }
    }
  }
}
```

**Gains estimés** :
- Bundle initial : -40%
- First load : -300ms

**Estimation** : 3-4h

---

### 13. 📊 Monitoring & Error Tracking

**Outils** :
- Sentry (error tracking)
- Custom logger (FPS, frame drops)

**Implémentation** :
```javascript
// client/src/utils/monitor.js
export class PerformanceMonitor {
  constructor(){
    this.fps = 60;
    this.frameDrops = 0;
    this.lastTime = performance.now();
  }

  tick(){
    const now = performance.now();
    const delta = now - this.lastTime;
    this.fps = 1000 / delta;
    if(delta > 20){ this.frameDrops++; } // > 20ms = drop
    this.lastTime = now;

    // Log si problème
    if(this.frameDrops > 10){
      console.warn('Performance issue:', { fps: this.fps, drops: this.frameDrops });
    }
  }
}
```

**Estimation** : 3-4h

---

## 📊 Résumé & Priorisation

### Temps Estimé Total : **53-68 heures**

| Priorité | Tâche | Temps | Impact |
|----------|-------|-------|--------|
| 🔴 P0 | **1. Fix superposition écrans** | 3-4h | CRITIQUE - Bug UX majeur |
| 🔴 P1 | 2. Optimiser IA (Web Worker) | 6-8h | Performance |
| 🔴 P1 | 3. Fix fuites mémoire | 2-3h | Stabilité |
| 🔴 P1 | 4. Extraire helpers IA | 6-8h | Maintenabilité |
| 🟠 P2 | 5. Décomposer fonctions longues | 4-5h | Lisibilité |
| 🟠 P2 | 6. Extraire constantes | 2-3h | Maintenabilité |
| 🟠 P2 | 7. Standardiser langue | 3-4h | Cohérence |
| 🟠 P2 | 8. Sécuriser localStorage | 2h | Sécurité |
| 🟡 P3 | 9. Ajouter tests (70% coverage) | 8-10h | Qualité |
| 🟡 P3 | 10. JSDoc complet | 4-5h | Documentation |
| 🔵 P4 | 11. Migration TypeScript | 12-15h | Future-proof |
| 🔵 P4 | 12. Code splitting | 3-4h | Performance |
| 🔵 P4 | 13. Monitoring | 3-4h | Observabilité |

---

## 🚀 Quick Wins (1-2h)

Avant les gros refactorings :

### A. Ajouter try/catch autour calculs IA (30 min)
```javascript
// TrainingScreen.js:384
_computeHint(){
  try {
    // ... calculs existants
  } catch(err) {
    console.error('AI hint failed:', err);
    this._hint = null; // fallback sûr
    this._hintUseHold = false;
  }
}
```

### B. Throttle recalcul hint (15 min)
```javascript
// TrainingScreen.js:182
if(this._needHintRecompute || (this._hintForKey !== curKey && !this._hintThrottled)){
  this._computeHint();
  this._hintThrottled = true;
  setTimeout(() => this._hintThrottled = false, 100); // Max 10 calculs/sec
}
```

### C. Valider localStorage (30 min)
```javascript
// Wrapper simple
function safeGetStorage(key, fallback){
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}
```

---

## 📁 Fichiers à Créer

```
client/src/
  ├── config/
  │   ├── ai-constants.js      # Poids IA, cooldowns
  │   ├── game-constants.js    # Vitesse, gravité, DAS/ARR
  │   └── ui-constants.js      # Tailles, marges, couleurs
  ├── engine/ai/
  │   ├── AIEngine.js          # Classe principale IA
  │   ├── helpers.js           # countHoles, bumpiness, etc.
  │   ├── profiles.js          # Profils (prudent, agressif, etc.)
  │   ├── evaluator.js         # Logique évaluation
  │   ├── simulation.js        # rotateN, collideGrid
  │   └── __tests__/
  │       └── helpers.test.js
  ├── utils/
  │   ├── SafeStorage.js       # Wrapper localStorage
  │   └── PerformanceMonitor.js
  └── workers/
      └── ai-worker.js         # Web Worker pour calculs IA
```

---

## 📝 Checklist Prochaine Session

- [ ] **P0** : Fix superposition écrans (HomeScreen.init() + dispose())
- [ ] **P0** : Test manuel transitions (Home → Solo → Home)
- [ ] **Quick Win A** : try/catch calculs IA
- [ ] **Quick Win B** : throttle hint
- [ ] **Quick Win C** : valider localStorage
- [ ] **P1** : Créer structure `/engine/ai/`
- [ ] **P1** : Migrer helpers IA (countHoles, etc.)
- [ ] **P1** : Tests unitaires helpers IA

---

**Maintenu par** : Claude Code
**Dernière mise à jour** : 2025-10-24
