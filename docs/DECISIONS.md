# Decisiones de implementación (web)

Puntos en los que la especificación era ambigua o dejaba hueco. En cada uno se eligió la opción más simple. Las reglas del juego son las mismas que en la app Android (repo `pipelingo`); aquí se repiten para que este repo se entienda solo.

## Reglas del juego (compartidas con Android)

1. **Desbloqueo con huecos de contenido.** GitHub va antes que Docker en el temario, pero todavía no tiene contenido. Las lecciones "Próximamente", los puentes y los jefes **no bloquean** la cadena: el recorrido empieza en la primera lección que tiene contenido (Docker · Imagen vs contenedor). Una lección tiene contenido solo si existen su `lesson.json` y sus cinco `prueba-N.json`.
2. **Unidad hecha.** Una unidad está hecha cuando todas sus lecciones *con contenido* están superadas o cuando se aprueba su test de salto.
3. **Unidad actual.** Es la primera unidad no terminada que tiene alguna lección jugable o hecha.
4. **Vidas a cero en mitad de una prueba.** La prueba sigue hasta el final, con las vidas en 0 (nunca negativas). La regla solo impide *empezar* una prueba nueva.
5. **Racha.** Cuenta cualquier prueba completada, aprobada o no, igual que el test de salto. La racha mostrada pasa a 0 si pasa un día entero sin completar ninguna.
6. **Aprobado.** `aciertos × 100 ≥ 80 × total`, sin redondear (11/13 aprueba y 10/13 no).
7. **XP.** +10 por acierto en las pruebas y en el test de salto, y +20 al terminar sin fallos. En Repaso no se gana XP. Repetir una prueba ya aprobada también da XP.
8. **Repaso.** En Repaso fallar no quita vidas. Cada 3 aciertos dan +1 vida, hasta 5. El contador se guarda entre sesiones.
9. **Fallos pendientes.** Una pregunta fallada queda pendiente hasta que se acierta, ya sea en Repaso, en la prueba 5 de una lección posterior o al repetir su prueba.
10. **Repaso dentro de la prueba 5.** Se añaden hasta 3 fallos pendientes de lecciones *anteriores*, empezando por los más antiguos. Cuentan para el resultado como una pregunta más.
11. **Barajado.** Se barajan las opciones de test, la columna derecha de emparejar y los pasos de ordenar. Emparejar y ordenar nunca empiezan ya resueltos.
12. **Camino a Mid.** Porcentaje de pruebas superadas sobre el total de pruebas del temario Junior.
13. **Test de salto.** Se ofrece en cualquier unidad con contenido que no esté hecha: 15 preguntas al azar de sus pruebas 3–5 (todas si hay menos). Si se aprueba, todas sus lecciones cuentan como hechas.
14. **Vidas desactivadas por ahora.** `GameRules.LIVES_ENABLED = false`, como en Android: fallar no quita vidas y la interfaz no las muestra. Las reglas de vidas siguen implementadas y probadas.
15. **Salir a mitad de una prueba.** Las respuestas se guardan solo al terminarla: XP, fallos y resultado van juntos. Si sales antes, no se guarda nada y un diálogo lo avisa en cuanto hay una respuesta comprobada. El repaso guarda cada respuesta al momento.

## Interfaz

16. **Corrección visible al fallar.** Además del `fix` de `find_error`, el bloque `# así queda bien` muestra el comando completo en `fill_command`, las parejas en `match` y el orden en `order_steps`. En test y verdadero/falso, el título dice cuál era la respuesta (`exit 1 · era la b`).
17. **Orden de las preguntas.** Dentro de una prueba, por `difficulty`, conservando el orden del archivo cuando empatan.
18. **Perfil sin cuentas.** El perfil se muestra como "Tú", con el avatar `$_`.
19. **Test de acceso.** No se implementa: Mid y Senior aparecen en el registro con "Test de acceso · 20 preguntas" y "Próximamente".
20. **Lecciones desde el mapa.** La tarjeta de cada unidad jugable lista sus lecciones; `continuar →` abre la primera disponible.
21. **Puentes y jefes.** Se dibujan en el mapa siempre con "Próximamente", porque no tienen contenido.
22. **Mapa abierto en la unidad actual.** Al entrar, el mapa se desplaza una vez hasta la unidad actual.

## Propias de la web

23. **Repo propio.** La web vive en este repo, separada de la app Android.
24. **Contenido copiado.** `content/` es una copia del de la app Android, más los labs (que solo usa la web). Al añadir preguntas en Android hay que copiarlas aquí. `scripts/validate_content.py` es el mismo validador, ampliado con los labs.
25. **Labs simulados, no reales.** "Código en directo" es una terminal y un editor simulados en el navegador (Docker y GitHub Actions), sin servidor ni contenedores de verdad. Funciona sin conexión, se publica gratis en GitHub Pages y es seguro. Ejecutar de verdad queda para una fase con backend. Detalles en `docs/labs.md`.
26. **Stack.** Vite + React + TypeScript, con CodeMirror 6, `yaml` y dnd-kit. El contenido se importa de `content/` al compilar.
27. **Labs como contenido.** Un lab es `lab-N.json` en la carpeta de su lección. Hay 7 labs, solo en lecciones con preguntas (2 de Docker y 5 de Actions); "Environments" no tiene lab todavía.
28. **Los labs no bloquean.** Un lab se abre cuando su lección está disponible, pero completarlo no es necesario para avanzar.
29. **XP de un lab.** +30 XP la primera vez; repetirlo no da XP. Completar un lab cuenta para la racha.
30. **Objetivos.** En terminal van en orden y una vez conseguidos se quedan, porque el estado cambia (el contenedor del objetivo 2 se borra en el 6). En el editor, los objetivos de texto se comprueban en directo y los de `run` quedan conseguidos al ejecutar.
31. **Persistencia.** El progreso va en `localStorage` (`pipelingo.progress.v1`), con lo mismo que guarda Android más los labs completados. El texto de cada lab de editor también se guarda.
32. **Reiniciar progreso.** Siempre disponible en el *Perfil*, con confirmación: no hay cuentas y los datos son solo de ese navegador.
33. **Sin modo de inicio en Actions.** El recorrido empieza en la lección piloto de Docker.
34. **Rutas con `#`.** `HashRouter`, para funcionar en GitHub Pages y en cualquier hosting estático sin reescrituras.
35. **Ligaduras desactivadas.** JetBrains Mono convierte `--` y `->` en ligaduras; en comandos tiene que verse lo que se escribe.
36. **Enter en el editor.** Tras una línea que acaba en `:`, Enter sangra dos espacios; si no, mantiene la sangría.
