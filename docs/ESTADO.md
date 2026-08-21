# Estado de los tres tracks

Cada track anade una linea al terminar una tarea. Es el unico canal de
comunicacion entre las tres terminales: no hay mensajeria entre sesiones.

Formato: `- [<tarea>] <estado> <fecha> — <nota>`

## Bitacora
- [0.1] hecho — esqueletos y dependencias congeladas
- [0.2] hecho — esquema con calendario academico
- [0.3] hecho — contratos congelados; los tres tracks pueden arrancar
- [C2] hecho 2026-08-20 — dashboard con KPIs, barras por curso y tendencia diaria en SVG (geometria.ts + 5 tests de vitest en verde). `npm run build` falla por ahora con "Module has no exported member 'api'" en `frontend/src/api/client.ts`: ese fichero es de Track B (Task B1) y hoy es solo el stub de la Fase 0; no se toco por ser propiedad ajena. Se resuelve solo al fusionar con track-b-app.

## Cambios al contrato (requiere acuerdo de los tres)
_(vacio)_

## Bloqueos
_(vacio)_
