# Órbita — Kanban con límites WIP y métricas de flujo

Tablero Kanban hecho con HTML, CSS y JavaScript puro: sin frameworks, sin dependencias y sin servidor. Todo se guarda en el navegador.

![Tablero con una columna que supera su límite WIP](captura.png)

## Por qué otro Kanban

La mayoría de tableros son listas de tareas con columnas. Kanban de verdad tiene dos ideas más, y este tablero las implementa:

- **Límite WIP por columna.** Cada columna puede tener un máximo de tareas en curso. Si se supera, la columna se marca en rojo: el objetivo es terminar antes de empezar más.
- **Métricas de flujo.** Cada tarjeta guarda cuándo entró a cada columna. Con eso el tablero calcula:
  - **Tiempo de ciclo:** desde que la tarea empieza a trabajarse hasta que se termina.
  - **Tiempo de entrega:** desde que se crea hasta que se termina.
  - Tareas abiertas, en flujo y terminadas en los últimos 7 días.

## Funciones

- Columnas configurables: nombre, límite WIP y si marcan la tarea como terminada.
- Tarjetas con título, descripción, prioridad, fecha de vencimiento (las vencidas se resaltan) y etiquetas.
- Arrastrar y soltar entre columnas y dentro de una columna.
- Teclado: selecciona una tarjeta y usa `Alt` + `←` `→` para cambiarla de columna, `Alt` + `↑` `↓` para ordenarla y `Enter` para editarla.
- Búsqueda por texto o por `#etiqueta` y filtro por prioridad.
- Exportar e importar el tablero en JSON, con validación del archivo.
- Guardado automático en `localStorage`; si el navegador no lo permite, la app sigue funcionando en memoria.

## Usarlo

Abre `index.html` en el navegador. No hay nada que instalar.

## Estructura

```
index.html   estructura y diálogos
styles.css   tema visual
app.js       estado, métricas, arrastre, teclado, exportar/importar
```

## Licencia

MIT
