# Pipelingo web

Versión web de **Pipelingo**, app estilo Duolingo para aprender el flujo DevOps: **GitHub → Docker → GitHub Actions → GHCR → Helm → OpenShift**. Añade a la app Android **laboratorios en directo**: terminal Docker y editor de workflows simulados en el navegador.

La app Android está en otro repo (`pipelingo`). Ambas comparten formato de contenido y reglas del juego; si cambian allí, se replican aquí.

## Stack

- Vite + React + TypeScript, CodeMirror 6, `yaml`, dnd-kit. Tests con Vitest.
- Web estática, sin servidor, desplegada en GitHub Pages. Rutas con `HashRouter`.

## Dónde está cada cosa

| Ruta | Qué es |
| --- | --- |
| `content/` | Preguntas (`prueba-N.json`) y labs (`lab-N.json`). Copia del contenido Android + labs |
| `docs/03-formato-preguntas.md` | Formato de las preguntas (6 tipos) |
| `docs/labs.md` | Formato de los labs, comprobaciones y qué simulan los simuladores |
| `docs/DECISIONS.md` | Decisiones tomadas; añade aquí las nuevas |
| `docs/tokens.json` | Tokens de diseño (colores, tipografía, medidas) |
| `src/domain/` | Correctores, reglas, desbloqueo y comprobación de labs: **funciones puras con tests** |
| `src/sim/` | Simuladores de Docker y GitHub Actions: **puros, con tests** |
| `scripts/validate_content.py` | Validador del contenido (corre en CI) |

## Reglas

- Las reglas del juego (XP, vidas, racha, desbloqueo, repaso) son las de la app Android; están en `docs/DECISIONS.md`.
- Cada lab debe poder resolverse: `src/content/content.test.ts` lo comprueba con sus pistas o su solución.
- Diseño "terminal nocturna": fondo oscuro, JetBrains Mono, verde para avanzar, ámbar para XP, rojo solo para errores. Objetivos táctiles ≥ 48 px, contraste ≥ 4.5:1, textos alternativos en iconos.

## Convenciones

- Código, identificadores y commits en inglés; textos de la interfaz (`src/ui/strings.ts`) y contenido en español.
- No inventes preguntas: si falta contenido, la lección queda como "Próximamente".
- Si algo es ambiguo, elige la opción más simple, anótala en `docs/DECISIONS.md` y sigue.
- Antes de dar algo por terminado: `npm run validate`, `npm run typecheck`, `npm test` y `npm run build`.
