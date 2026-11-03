# Pixel Tennis Tournament 🎾

Videojoc de tennis pixel art de 16 bits: torneig de 8 jugadors, partits al millor de 3 sets,
física de pilota pròpia (timestep fix), IA amb tres dificultats, públic i àudio sintetitzat (Web Audio).
Vite + React + TypeScript + HTML5 Canvas. Un jugador contra la IA, per a ordinador i mòbil.

## Executar

```bash
npm install
npm run dev        # joc en local
npm run build      # typecheck + build de producció
npm test           # proves (puntuació, física, torneig, IA)
```

## Controls

| Ordinador | |
|---|---|
| WASD / fletxes | moure i apuntar |
| Espai | cop / servei |
| J · K · L | slice · topspin · lob |
| Shift | córrer |

Mòbil: joystick virtual (esquerra), botons de cop i servei (dreta), botó de pausa.

## Arquitectura (`src/`)

| Carpeta | Contingut |
|---|---|
| `engine/` | constants del món, matemàtiques, RNG determinista |
| `physics/` | pilota (gravetat, arrossegament, Magnus, rebot amb fricció, xarxa) i solucionador de trajectòries |
| `players/` | plantilla dels 8 tennistes, estadístiques, estils, tipus de cop |
| `scoring/` | puntuació oficial (deuce, avantatge, tie-break, sets) |
| `ai/` | predicció de la pilota, tria de cop, errors, dificultats |
| `game/` | partit (regles i fases), bucle de joc, desat |
| `tournament/` | quadre de 8 jugadors (quarts, semis i final) i simulació |
| `render/` | càmera, pista, sprites, públic (tot procedural, sense emojis) |
| `audio/` | efectes i música amb Web Audio API |
| `controls/` | teclat i tàctil |
| `ui/` | menús, marcador, quadre, resultats, cerimònia del campió |

## Proves

- `npm test`: proves unitàries i de simulació (`tests/run.ts`).
- `tests/sim-batch.ts`: tanda de partits IA contra IA per ajustar l'equilibri.
- `tests/e2e/`: proves al navegador amb Playwright (`?autosim=1` simula el torneig sencer).
