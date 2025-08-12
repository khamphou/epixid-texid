Modulaire (Front/Back) — Aperçu
================================

Ce dépôt contient désormais une architecture expérimentale modulaire en parallèle du client historique (index.html à la racine).

Lancer le serveur YAML/WS + client modulaire
--------------------------------------------

- npm run mod:server — démarre Express + Socket.io, charge les YAML depuis `shared/modes`.
- npm run mod:client — démarre Vite sur `client/` (bootstrap minimal).
- npm run mod:all — lance les deux en parallèle.

Client modulaire (client/src)
-----------------------------
- core/: orchestrateur, UI commune, loaders API/WS.
- engine/: moteur Tetris (à alimenter depuis `src/main.js`).
- screens/: écrans IScreen.
- modes/: `modeFactory` transforme le YAML en règles runtime.

Serveur (server/src)
--------------------
- routes `/modes/:id` renvoie la config YAML.
- sockets: `match_start` diffuse la config effective aux clients.

À faire (TODO)
--------------
- Migrer la logique de `src/main.js` dans engine/ et screens/ sans casser le comportement.
- Validation stricte des YAML via zod (server/src/modes/loader.js).
- Sélection de mode/écrans complets côté client.
