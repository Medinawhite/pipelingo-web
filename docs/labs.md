# Labs y simuladores

La versión web hace lo mismo que la app Android (mapa, lecciones, las 5 pruebas con los 6 tipos de pregunta, repaso, perfil y test para saltar una unidad) y añade **laboratorios en directo**: una terminal y un editor simulados en el navegador donde el alumno escribe comandos y workflows de verdad y ve qué pasa.

Todo corre en el navegador, sin servidor y sin conexión una vez cargada. Se publica como web estática en GitHub Pages.

## Stack

- Vite + React + TypeScript.
- CodeMirror 6 para el editor (cargado solo al abrir un lab), `yaml` para leer YAML con números de línea y dnd-kit para ordenar pasos.
- Vitest para los tests.
- JetBrains Mono e Inter con `@fontsource` (licencia OFL).

## Contenido

`content/` es una copia del contenido de la app Android (repo `pipelingo`) más los labs, que solo usa la web. La web lo importa al compilar (`import.meta.glob`). Las preguntas tienen el formato de `docs/03-formato-preguntas.md`.

## Laboratorios

Cada lección puede tener `lab-1.json`, `lab-2.json`… junto a sus pruebas. Un lab tiene objetivos; cada objetivo tiene un texto, una pista y una comprobación automática.

```json
{
  "level": "junior",
  "unit": "docker",
  "lesson": "imagen-vs-contenedor",
  "lab": 1,
  "kind": "terminal",
  "title": "Tu primer servidor web",
  "intro": "Qué hay que hacer, en dos frases.",
  "outro": "Qué se ha aprendido, al terminar.",
  "setup": { "images": ["postgres:16"], "containers": [{ "name": "db", "image": "postgres:16", "state": "exited" }] },
  "objectives": [
    { "id": "o1", "text": "Descarga la imagen nginx.", "hint": "docker pull nginx", "check": { "type": "image_exists", "image": "nginx" } }
  ]
}
```

### Lab de terminal (`kind: "terminal"`)

Un simulador de Docker con estado real: imágenes, contenedores, puertos, variables y logs. Responde con mensajes como los de Docker, también en los errores típicos: nombre en uso, puerto ocupado, borrar un contenedor en marcha, imagen inexistente, contenedor en primer plano… `curl localhost:PUERTO` llega a un nginx publicado y deja una línea en sus logs.

Imágenes del registro simulado: `nginx`, `hello-world`, `alpine`, `node`, `postgres` (se para sin `POSTGRES_PASSWORD`) y `redis`.

Los objetivos van **en orden**: solo se comprueba el siguiente y, una vez conseguido, queda conseguido. Un comando puede cumplir varios seguidos (`docker run` también descarga la imagen).

| `check.type` | Se cumple cuando… |
| --- | --- |
| `image_exists` / `image_absent` | la imagen (`nginx` = `nginx:latest`) está o no está |
| `container` | existe el contenedor `name` en `state` (`running`, `exited` o `absent`), y opcionalmente con `image`, `port` (`"8080:80"`) y una variable que case con `env` (regex) |
| `command_ran` | se escribió un comando que casa con `pattern` (regex) **después** del objetivo anterior |
| `http_ok` | un `curl` a `localhost:port` respondió |

### Lab de editor (`kind: "editor"`)

Un editor de `file.path` con `file.starter` como punto de partida. Mientras se escribe, un analizador revisa el workflow como GitHub: YAML mal indentado, `on` o `runs-on` que faltan, claves mal escritas (con sugerencia), actions sin versión o inexistentes, inputs que no existen, `needs` a jobs que no existen o en ciclo, credenciales en claro… Cada aviso lleva su línea.

El botón **ejecutar** simula un run para el evento elegido (push a main, push a una rama, pull request, tag, push que solo cambia `.md`, ejecución manual):

- decide si el evento lanza el workflow (`branches`, `tags`, `paths`, `-ignore` y negaciones; los filtros de paths no se aplican a los tags);
- ordena los jobs por `needs`, expande `matrix` y salta los que no cumplen `if` o dependen de un fallo;
- evalúa las expresiones `${{ }}` (contextos `github`, `env`, `secrets`, `matrix`, `steps`, `needs`; operadores y funciones como `startsWith`, `contains`, `success()`);
- ejecuta cada step: `actions/checkout`, `setup-node`, `cache`, `upload/download-artifact`, `docker/login-action`, `build-push-action` y comandos (`echo`, `cat`, `npm`, `docker`, `exit`, `$GITHUB_OUTPUT`, `$GITHUB_ENV`). Sin checkout no hay código; cada job es un runner limpio; los secrets salen como `***`; subir a GHCR necesita `packages: write`.

| `check.type` | Se cumple cuando… |
| --- | --- |
| `yaml_valid` | el archivo es YAML válido |
| `yaml_path` | el valor en `path` (`jobs.*.steps[*].uses`; `*` es cualquier clave o elemento) cumple `equals`, `contains`, `matches` (regex) o `exists` |
| `regex` / `not_regex` | el texto casa (o no) con `pattern` |
| `order` | `first` aparece antes que `then` en el texto |
| `run` | al ejecutar con el evento `event`, el resultado es `expect`: `success`, `not_triggered` o `job_skipped` (con `job`) |

Los objetivos de texto se comprueban en directo; los de `run`, al ejecutar, y quedan conseguidos. `solution` es la solución de referencia que el alumno puede ver.

### Validación

- `scripts/validate_content.py` comprueba el formato de los labs (campos, tipos de comprobación, eventos, regex).
- `src/content/content.test.ts` **resuelve** cada lab: en los de terminal escribe las pistas en orden y comprueba que se cumple cada objetivo; en los de editor comprueba que la solución no tiene errores y cumple todo, y que el archivo inicial no.

Así, un lab que no se puede terminar no llega a `main`.

## Reglas del juego en la web

Las mismas que en Android: `src/domain/rules.ts` replica su `RulesEngine`. Todas las decisiones están en `docs/DECISIONS.md`.
