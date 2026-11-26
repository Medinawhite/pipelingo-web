# Formato de preguntas

Cada pregunta es un objeto JSON con unos campos comunes y otros propios de su tipo; cada prueba es un archivo con 12–15 preguntas.

## Campos comunes

Las claves van en inglés, como en cualquier código; los textos que ve el alumno, en español.

| Campo | Tipo | Obligatorio | Para qué sirve |
| --- | --- | --- | --- |
| `id` | texto | sí | Identificador único: `unidad.leccion.prueba.numero`, p. ej. `docker.dockerfile-basico.p3.q07` |
| `type` | texto | sí | Uno de los 6 tipos: `multiple_choice`, `true_false`, `match`, `fill_command`, `find_error`, `order_steps` |
| `prompt` | texto | sí | El enunciado, corto: una o dos frases |
| `code` | objeto | no | Bloque de código que acompaña al enunciado: `{ "lang": "dockerfile", "content": "..." }` |
| `explanation` | texto | sí | El feedback: se muestra siempre tras responder, aciertes o falles |
| `tags` | lista | sí | Conceptos que evalúa; sirven para el repaso de fallos y para el test que salta una unidad |
| `difficulty` | 1–3 | sí | Dificultad dentro de su prueba, para ordenar las preguntas |

El nivel (Junior, Mid, Senior), la unidad, la lección y el número de prueba se declaran una vez en el archivo de la prueba, no en cada pregunta.

## Los 6 tipos de pregunta

Cada tipo añade a los campos comunes solo lo que necesita para corregirse sin intervención humana.

### multiple_choice · test

Una sola respuesta correcta entre 3 y 4 opciones. Cada opción incorrecta puede llevar su propio `why`, que se muestra si el alumno la elige.

```json
{
  "id": "docker.imagen-vs-contenedor.p1.q01",
  "type": "multiple_choice",
  "prompt": "¿Qué es un contenedor?",
  "options": [
    { "id": "a", "text": "Una instancia en ejecución de una imagen" },
    { "id": "b", "text": "Un archivo con instrucciones de build", "why": "Eso es el Dockerfile." },
    { "id": "c", "text": "Una máquina virtual completa", "why": "Comparte el kernel del host; no virtualiza hardware." }
  ],
  "answer": "a",
  "explanation": "La imagen es la plantilla; el contenedor es esa plantilla ejecutándose.",
  "tags": ["imagen", "contenedor"],
  "difficulty": 1
}
```

### true_false · verdadero o falso

```json
{
  "id": "docker.tags.p1.q04",
  "type": "true_false",
  "prompt": "Desplegar siempre con el tag latest garantiza saber qué versión corre en producción.",
  "answer": false,
  "explanation": "latest se mueve con cada push. Para desplegar se usa un tag fijo: el SHA del commit o un semver.",
  "tags": ["tags", "latest"],
  "difficulty": 1
}
```

### match · emparejar

De 3 a 5 parejas. La app baraja la columna derecha.

```json
{
  "id": "docker.dockerfile-basico.p2.q03",
  "type": "match",
  "prompt": "Empareja cada instrucción con lo que hace.",
  "pairs": [
    { "left": "FROM", "right": "Imagen base" },
    { "left": "COPY", "right": "Copia archivos al contenedor" },
    { "left": "RUN", "right": "Ejecuta un comando durante el build" },
    { "left": "CMD", "right": "Comando al arrancar el contenedor" }
  ],
  "explanation": "RUN se ejecuta al construir la imagen; CMD, cada vez que arranca un contenedor.",
  "tags": ["dockerfile"],
  "difficulty": 2
}
```

### fill_command · completar el comando

Cada hueco `{{nombre}}` del `template` tiene su lista de respuestas aceptadas. Se ignoran los espacios al principio y al final; mayúsculas y minúsculas cuentan, como en la terminal.

```json
{
  "id": "docker.imagen-vs-contenedor.p3.q02",
  "type": "fill_command",
  "prompt": "Construye la imagen hello-devops con el tag 1.0 usando el Dockerfile de la carpeta actual.",
  "template": "docker {{b1}} -t hello-devops:1.0 {{b2}}",
  "blanks": {
    "b1": ["build"],
    "b2": [".", "./"]
  },
  "explanation": "docker build crea la imagen; el punto final es el contexto de build: la carpeta actual.",
  "tags": ["docker-build", "contexto"],
  "difficulty": 2
}
```

### find_error · encontrar el error

El alumno toca la línea que falla (numeradas desde 1). `fix` muestra cómo debería quedar.

```json
{
  "id": "docker.seguridad.p4.q05",
  "type": "find_error",
  "prompt": "Esta imagen no arranca en OpenShift. ¿Qué línea lo provoca?",
  "code": {
    "lang": "dockerfile",
    "content": "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci\nUSER root\nCMD [\"node\", \"server.js\"]"
  },
  "answer": [5],
  "fix": "USER node",
  "explanation": "OpenShift no deja ejecutar contenedores como root por defecto. Usa un usuario sin privilegios.",
  "tags": ["seguridad", "no-root", "openshift"],
  "difficulty": 2
}
```

### order_steps · ordenar pasos

De 4 a 6 pasos. La app los baraja y `answer` guarda el orden correcto. `acceptAlso` es opcional: sirve para cuando hay más de un orden válido.

```json
{
  "id": "docker.tags.p5.q01",
  "type": "order_steps",
  "prompt": "Ordena los pasos para publicar una nueva versión de la imagen.",
  "steps": [
    { "id": "s1", "text": "docker build -t hello-devops:1.1 ." },
    { "id": "s2", "text": "docker login ghcr.io" },
    { "id": "s3", "text": "docker tag hello-devops:1.1 ghcr.io/user/hello-devops:1.1" },
    { "id": "s4", "text": "docker push ghcr.io/user/hello-devops:1.1" }
  ],
  "answer": ["s1", "s3", "s2", "s4"],
  "acceptAlso": [["s2", "s1", "s3", "s4"], ["s1", "s2", "s3", "s4"]],
  "explanation": "El login puede hacerse en cualquier momento antes del push; el tag con el nombre del registro, siempre antes de subir.",
  "tags": ["tags", "push", "ghcr"],
  "difficulty": 3
}
```

## Organización de los archivos

El contenido vive en el repo como archivos JSON: una carpeta por nivel, otra por unidad y otra por lección, y un archivo por prueba. Añadir preguntas es abrir un PR.

```
content/
  junior/
    curriculum.json          ← índice: fases, unidades, lecciones, puentes y jefes en orden
    01-github/
      01-repos-y-commits/
        lesson.json
        prueba-1.json … prueba-5.json
      ...
    02-docker/
      01-imagen-vs-contenedor/   ← lección piloto (ya escrita)
    ...
    bridges/
      github-docker.json
      ...
    bosses/
      jefe-1-fundamentos.json
      ...
      jefe-final.json
  mid/
  senior/
```

`curriculum.json` fija el orden del mapa y los títulos; cada lección enlaza su carpeta con `path`. Una lección cuya carpeta no existe todavía se muestra como "Próximamente". `lesson.json` solo lleva el título y el objetivo. El test para saltar una unidad no tiene archivo propio: la app lo genera con preguntas de las pruebas 3–5 de esa unidad.

Cabecera de un archivo de prueba:

```json
{
  "level": "junior",
  "unit": "docker",
  "lesson": "dockerfile-basico",
  "test": 3,
  "title": "Aplicar",
  "questions": [ ]
}
```

Puentes y jefes usan la misma cabecera, cambiando `lesson` y `test` por `bridge` o `boss`.

## Feedback y validación

Como no hay teoría previa, el feedback es lo que enseña: tiene que explicar el porqué, no solo dar la respuesta.

**Reglas del feedback**

- Máximo 200 caracteres en `explanation` y 120 en cada `why`.
- Explica la razón, no repite la respuesta ("RUN se ejecuta al construir…", no "La correcta es la b").
- Si hay un error típico, nómbralo en el `why` de esa opción.
- Tono de senior que enseña: directo, sin regañar.

**Validación automática en cada PR**

`scripts/validate_content.py` (y, más adelante, un JSON Schema por tipo) se ejecuta en GitHub Actions antes de poder fusionar. Comprueba:

- Que cada pregunta cumple el formato de su tipo.
- Que los `id` son únicos y siguen el patrón `unidad.leccion.prueba.numero`.
- Que cada prueba tiene entre 12 y 15 preguntas.
- Que `answer` apunta a opciones, pasos o líneas que existen.
- Que los textos no superan los límites de longitud.

Así el propio proyecto practica el CI que enseña: un PR con contenido roto no llega a `main`.
