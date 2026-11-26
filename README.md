# Pipelingo web

Aprende el flujo DevOps completo, estilo Duolingo y en el navegador: **GitHub → Docker → GitHub Actions → GHCR → Helm → OpenShift**.

Preguntas cortas por niveles y **laboratorios en directo**: una terminal Docker y un editor de workflows de GitHub Actions simulados, donde escribes comandos y YAML de verdad y ves qué pasa. Todo corre en el navegador, sin servidor y sin instalar nada.

La app Android vive en otro repo (`pipelingo`); comparten el formato del contenido y las reglas del juego.

## Qué incluye

- Recorrido **Junior**: mapa del flujo, lecciones, 5 pruebas por lección con 6 tipos de pregunta, repaso de fallos, perfil y test para saltar una unidad.
- **7 labs**: 2 de Docker (terminal) y 5 de GitHub Actions (editor con validación en directo y ejecución simulada del workflow).
- Progreso guardado en el navegador (`localStorage`).

## Comandos

Requisitos: Node 22 o posterior y Python 3 (para el validador).

```
npm install
npm run dev        # http://localhost:5173
npm test           # correctores, reglas, simuladores y que cada lab se puede resolver
npm run validate   # validar el contenido
npm run build      # web estática en dist/
```

### Empezar en otra unidad

Ahora la web empieza en **GitHub Actions**: `.env` tiene `VITE_START_UNIT=actions`, y GitHub y Docker cuentan como superadas. Para empezar desde el principio, deja la variable vacía. También puedes poner otra unidad (`docker`, `ghcr`…).

## Estructura

```
content/           preguntas y labs (copia del contenido de la app Android + labs)
src/content/       ContentRepository y modelos del JSON
src/domain/        correctores, reglas, desbloqueo, comprobación de labs (funciones puras)
src/sim/           simuladores: terminal Docker, expresiones ${{ }} y runs de GitHub Actions
src/state/         progreso en localStorage
src/ui/            pantallas, quiz y labs
docs/              formato de preguntas, labs y decisiones
scripts/           validador del contenido
```

- Formato de las preguntas: [`docs/03-formato-preguntas.md`](docs/03-formato-preguntas.md)
- Formato de los labs y qué simula cada uno: [`docs/labs.md`](docs/labs.md)
- Decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## CI/CD

`.github/workflows/ci.yml` valida el contenido, comprueba tipos, pasa los tests y compila en cada PR y push a `main`. En cada push a `main` publica la web en GitHub Pages (*Settings → Pages → Source: GitHub Actions*).

**Recomendado:** protege `main` exigiendo un pull request y que pase el check **"Validate, typecheck, test and build"**.

## Licencias

JetBrains Mono e Inter, vía `@fontsource`, bajo la SIL Open Font License 1.1.
