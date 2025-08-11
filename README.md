# TEXID — Tetris Acier/Carbone

Tetris moderne (HTML5 Canvas + JS) avec thème acier/carbone, multi temps réel (2 joueurs), support observateurs, top 10, effets audio et HUD soigné.

## Objectifs clés
- Multijoueur stable (2 joueurs), observateurs supportés.
- Panneaux stats dupliqués (moi/adversaire) avec score/niveau/lignes.
- Statut prêt affiché avant le nom (✅ prêt, ⌛ pas prêt).
- Transmission et affichage: level, lines, ready, who.
- Observateurs: titre cliquable (liste), badge compteur, limite 10 (refus), affichage du gagnant en fin de match.
- Nettoyage/compaction de `src/main.js`.
- Afficher aussi les lignes locales dans “Moi” si `#lines` existe.
- Bannière “En attente d’un joueur…” visible tant que pas d’adversaire ou manche pas démarrée.
- Uniformisation `server.js` pour messages `scores` (list complet) et `observe_refused`.

## Contrat WebSocket (S=serveur, C=client)
- C→S hello: `{ type:'hello', name }`
- S→C joined: `{ type:'joined', room, selfId, started, observer, playersCount, spectatorsCount, owner?, name?, ownerName?, ownerTop? }`
- S→C names: `{ type:'names', list:[{id,name}] }`
- S→C peer: `{ type:'peer', connected, who?, name? }`
- C↔S ready: `C {type:'ready',ready}`, `S {type:'ready',who,ready}`
- S→C start: `{ type:'start', seed, room }`
- C→S state: `C { type:'state', grid, score, active:{key,mat,x,y}, level, lines, ready }`
	- Relai S→C (autres + observateurs): `{ type:'state', who, grid, score, active, level, lines, ready }`
- S→C scores (périodique/init): `{ type:'scores', list:[{id,name,score,lines,level,ready}] }`
- C→S/S→C gameover: `C {type:'gameover'}` / `S {type:'gameover',who}`
- S→C matchover: `{ type:'matchover', scores:[{id,name,score,lines}] }`
- S→C spectators: `{ type:'spectators', list:[{id,name}] }`
- S→C observe_refused: `{ type:'observe_refused', room, reason:'full', max:10, spectators }`

## Démarrage (dev)
Backend sur 8788 si 8787 occupé:
```powershell
npm install
$env:PORT='8788'
npm run server
```
Front (Vite) pointant sur ce backend:
```powershell
$env:VITE_WS_URL='ws://localhost:8788'
$env:VITE_API_ORIGIN='http://localhost:8788'
npm run dev
```
Ouvrir l’URL fournie par Vite.

## Build/Preview
```powershell
npm run build
npm run preview
```

## Déploiement Netlify
Frontend (Vite) statique (dist). Backend WebSocket déployé séparément (Render/Railway/Fly.io). 
Définir `VITE_SERVER_ORIGIN` côté Netlify vers l’URL HTTPS du backend.

## Notes
- Les assets audio sont générés via WebAudio (AudioFX).
