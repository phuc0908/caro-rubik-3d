# Caro Rubik 3D

A local two-player Gomoku game built with Three.js. Connect five across cube faces and twist one layer per player per match.

## Development

Requires Node.js 20.19+ (20.x) or 22.12+.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` to generate `dist/` and `npm run preview` to serve the production build locally.

## Source files

| File | Responsibility |
| --- | --- |
| `index.html` | Game layout and controls |
| `src/game.mjs` | Three.js scene, input, camera, and turn flow |
| `src/rules.mjs` | Cube coordinates, layer rotations, and winning lines |
| `src/style.css` | Responsive layout and visual styles |

## Controls

Drag the cube to orbit. Hover over a tile and use the arrow keys to preview a row or column twist. Press Esc to cancel or click an empty tile to apply the twist and place your mark. Clicking an empty tile advances the turn.
