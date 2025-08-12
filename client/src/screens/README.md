Ces écrans sont des squelettes. Chaque écran doit implémenter l'interface IScreen:

- init(params)
- update(dt)
- render(ctx)
- handleInput(evt)
- dispose()

HomeScreen doit permettre la sélection d'un `modeId`, puis demander à `core.loadMode(modeId, { multiplayer:false })` et naviguer vers `SoloScreen` ou `MultiplayerLobbyScreen`.
