# Laberinto Egipcio Rectangular · 10.000 preguntas por tipo · inicio corregido

Versión corregida para Chrome.

## Corrección principal
- Se restauraron las utilidades internas `randInt`, `clamp`, `keyOf`, `cellOf` y `showScreen`.
- El botón **Entrar a la pirámide** ahora inicia correctamente la partida con el banco dinámico de preguntas.
- El juego no precarga las 40.000 preguntas; las genera cuando las necesita.

## Características mantenidas
- 10.000 preguntas de verdadero/falso.
- 10.000 preguntas de afirmaciones I, II y III.
- 10.000 preguntas de valor entero.
- 10.000 preguntas de selección múltiple.
- 20 obstáculos, 10 portales y 30 botones trampa.
- Pantalla completa obligatoria.
- Bloqueos de seguridad con clave docente: hora militar del dispositivo.
- Hora visible durante el juego y los bloqueos.
- Informe HTML tipo libro con LaTeX visible.


## Ajustes recientes
- Portada inicial resumida.
- Nota limitada a máximo 5.5.
- Retos de tesoro en nivel experto y sin pistas.


## Corrección final
- Nota máxima: 5.0.
- Si se responden correctamente los 4 tesoros y se llega a la salida final, la nota se fija en 5.0.
- Se agregaron muchas casillas transportadoras alrededor de la salida, pero se reserva un único corredor seguro de acceso.
- Los portales normales quedan excluidos de la zona cercana a la salida; cerca de ella solo aparecen transportadores finales y un único camino seguro.


## Actualización: guardianes finales
- El único corredor seguro hacia la casilla final contiene 3 casillas de guardián final.
- Cada guardián final lanza una pregunta avanzada de alta dificultad y sin pista.
- Si el estudiante falla un guardián final, pierde 1.0 unidad, el laberinto se regenera por completo y la ficha reaparece en el punto más lejano de la nueva salida.
- Si los 4 tesoros están completos y el jugador supera el corredor seguro hasta la salida, la nota final queda en 5.0.
