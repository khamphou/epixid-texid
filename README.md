# Tetris Acier/Carbone

Un Tetris moderne (HTML5 Canvas + JS) avec thème acier/carbone, score, top 10 (localStorage), vitesse qui augmente toutes les 30s, aperçu de la prochaine pièce et effets audio/visuels lors de la suppression de lignes.

## Fonctionnalités

## Démarrer
 Lancez le serveur puis l’appli, créez un salon et partagez l’ID. Chaque connexion peut posséder un salon à la fois (l’onglet qui l’a créé peut le fermer). Cliquez sur « Je suis prêt » des deux côtés: le serveur envoie une seed commune pour un ordre de pièces identique (PRNG déterministe, 7-bag).

- Créer: « Créer partie » (si vous n’êtes pas déjà propriétaire d’un salon)
- Rejoindre: choisissez un salon dans la liste
- Prêt: « Je suis prêt » (démarrage quand les 2 sont prêts)
- Fermer salon: le créateur peut fermer le salon pour tout le monde
- Résultat: affiché quand les 2 ont terminé

Option B (recommandé) : serveur de dev via Vite

- Le mode Easy favorise fortement les effacements de 3 lignes pour maximiser le score.
- Deux prochaines pièces sont visibles.
- Le contour du plateau clignote en situation de stress (pile haute).
```powershell
npm install
npm run dev
```

Puis ouvrez l’URL affichée.

## Build/Preview
```powershell
npm run build
npm run preview
```

## Notes
- Les scores sont stockés dans `localStorage` sous la clé `tetris_top10_v1`.
- Les assets audio sont synthétisés via WebAudio, pas de fichiers externes.
