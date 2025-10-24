# Plan de Test Manuel - Refactoring P2

## 🎯 Objectif
Vérifier que toutes les fonctionnalités marchent après le refactoring :
- P2.1: Extraction des constantes AI
- P2.2: Décomposition des méthodes render()
- P2.3: Traduction des commentaires
- P2.4: AbortController pattern

---

## 🧪 Tests à Effectuer

### 1. Mode Solo (http://localhost:5173)

**Écran d'accueil:**
- [ ] La page charge sans erreur JavaScript (F12 → Console)
- [ ] Le bouton "Solo" est visible et cliquable

**Gameplay Solo:**
- [ ] Cliquer sur "Solo" charge l'écran de jeu
- [ ] Le compte à rebours s'affiche (3, 2, 1, GO) avec animations
- [ ] Les pièces tombent normalement
- [ ] **Les pièces fantômes (ghost pieces) s'affichent** en gris/transparent
- [ ] Le plateau se dessine correctement avec les tuiles colorées
- [ ] Les effets de shake fonctionnent quand la pile monte
- [ ] **Panneau HOLD:**
  - [ ] La pièce HOLD s'affiche
  - [ ] Animation de swap HOLD fonctionne (appuyer C ou Shift)
- [ ] **File NEXT:**
  - [ ] 6 pièces NEXT visibles en anneau
  - [ ] Animation de décalage quand une pièce spawn
  - [ ] Pièces diminuent en taille progressivement
- [ ] **Animation Hard Drop:**
  - [ ] Motion blur visible quand on fait Space
  - [ ] Pas de scintillement ou artefacts visuels
- [ ] Le score et les lignes s'affichent dans la sidebar
- [ ] Le jeu se termine correctement (Game Over)

**Contrôles à tester:**
- Flèches Gauche/Droite : déplacement
- Flèche Bas : soft drop
- Espace : hard drop
- Flèches Haut/X : rotation horaire
- Z/Ctrl : rotation anti-horaire
- C/Shift : HOLD

---

### 2. Mode Training (http://localhost:5173)

**Écran de sélection:**
- [ ] Cliquer sur "Training" affiche la sélection de profil AI
- [ ] Les 3 profils sont visibles (Beginner, Intermediate, Advanced)

**Gameplay Training:**
- [ ] Le compte à rebours fonctionne
- [ ] **Toutes les fonctionnalités Solo** fonctionnent (voir ci-dessus)
- [ ] **Hint AI:**
  - [ ] Contour bleu de la pièce recommandée s'affiche
  - [ ] Guides verticaux en pointillés visibles
- [ ] **Panneau HOLD clignote** quand l'AI recommande un HOLD
- [ ] **Cartouche d'aide:**
  - [ ] Nombre de rotations affiché
  - [ ] Flèche directionnelle visible
- [ ] Toggle Easy Mode (bouton en haut) active/désactive les hints

---

### 3. Mode Multijoueur (http://localhost:5173)

**Lobby:**
- [ ] Cliquer sur "Multiplayer" charge le lobby
- [ ] La liste des salons s'affiche
- [ ] Bouton "Create Room" fonctionne
- [ ] Bouton "Exit" retourne à l'accueil

**Gameplay Multiplayer (nécessite 2 joueurs):**
- [ ] Le compte à rebours synchronisé s'affiche
- [ ] **Plateau principal (gauche):**
  - [ ] Pièces tombent normalement
  - [ ] Pièces fantômes visibles
  - [ ] Animation hard drop fonctionne
- [ ] **Mini plateau adverse (sidebar droite):**
  - [ ] Grille adverse visible
  - [ ] Pièce active adverse visible avec transparence au-dessus
  - [ ] **Pièce fantôme adverse visible** (bug corrigé)
- [ ] **File NEXT:**
  - [ ] 6 pièces visibles en anneau
  - [ ] Animation de décalage
- [ ] **Labels:**
  - [ ] Nom du joueur affiché au-dessus du plateau principal
  - [ ] Nom de l'adversaire affiché au-dessus du mini plateau
- [ ] **Overlay "En attente":**
  - [ ] Message "En attente d'un joueur…" visible si seul dans la salle
  - [ ] Disparaît quand le 2ème joueur rejoint
- [ ] Le jeu se synchronise entre les deux joueurs

---

### 4. Test AbortController (Console DevTools)

**Ouvrir F12 → Console et tester:**

```javascript
// 1. Vérifier qu'aucune erreur n'apparaît lors du changement d'écran
// 2. Aller de Accueil → Solo → Accueil → Training → Accueil

// 3. Dans la console, vérifier les event listeners:
getEventListeners(window) // Devrait montrer les listeners actifs
getEventListeners(document.querySelector('canvas'))

// 4. Naviguer entre les écrans plusieurs fois
// Les event listeners devraient être nettoyés automatiquement
// Pas d'accumulation de listeners
```

**Test Memory Leak:**
- [ ] Ouvrir F12 → Performance → Memory
- [ ] Enregistrer un snapshot
- [ ] Naviguer Solo → Accueil → Solo → Accueil (x10 fois)
- [ ] Enregistrer un nouveau snapshot
- [ ] Comparer : pas d'augmentation massive de listeners ou d'objets

---

### 5. Tests de Régression

**Fonctionnalités qui ne doivent PAS être cassées:**

- [ ] Les sons fonctionnent (pièce posée, ligne clear, etc.)
- [ ] Les animations de ligne clear fonctionnent
- [ ] Le système de scoring fonctionne (points, combos, B2B)
- [ ] La musique dynamique s'adapte au stress (pile haute)
- [ ] Les effets visuels de stress (jitter, glow rouge)
- [ ] Le système de gravité accélère avec le niveau
- [ ] Le lock delay fonctionne (500ms avant verrouillage)
- [ ] Les rotations avec wall kicks fonctionnent
- [ ] Le système DAS/ARR fonctionne (déplacement continu)
- [ ] Le soft drop accélère la chute
- [ ] Les toasts de notification s'affichent

---

## 🐛 Bugs Connus Corrigés

- ✅ **MultiplayerGameScreen** : Fonctions manquantes `drawGhostCell`, `roundRect`, `computeGhostY` ajoutées
- ✅ **AbortController** : Pattern implémenté dans tous les écrans pour éviter memory leaks

---

## 📝 Comment Reporter un Bug

Si un test échoue :

1. **Ouvrir F12 → Console** et copier les erreurs JavaScript
2. **Noter les étapes** pour reproduire le bug
3. **Prendre une capture d'écran** si possible
4. **Vérifier le commit** qui a introduit le bug (git bisect)

Format du rapport :

```
❌ Test échoué : [Nom du test]

Étapes :
1. ...
2. ...

Comportement attendu :
...

Comportement observé :
...

Erreur console :
...
```

---

## ✅ Validation Finale

Une fois tous les tests passés :

- [ ] Aucune erreur JavaScript en console
- [ ] Toutes les animations fluides
- [ ] Aucun memory leak détecté
- [ ] Les 3 modes de jeu fonctionnent
- [ ] Les event listeners sont bien nettoyés
- [ ] Le code est plus maintenable (render() décomposées)

---

**Prêt pour production** ✨
