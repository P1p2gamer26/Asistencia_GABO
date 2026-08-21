# Estado de los tres tracks

Cada track anade una linea al terminar una tarea. Es el unico canal de
comunicacion entre las tres terminales: no hay mensajeria entre sesiones.

Formato: `- [<tarea>] <estado> <fecha> — <nota>`

## Bitacora
- [0.1] hecho — esqueletos y dependencias congeladas
- [0.2] hecho — esquema con calendario academico
- [0.3] hecho — contratos congelados; los tres tracks pueden arrancar
- [B1] hecho 2026-08-20 — cliente HTTP, login y modo mock (VITE_MOCK=1)
- [B2] hecho 2026-08-20 — IndexedDB con calendario; markAttendance bloquea dias no lectivos
- [B3] hecho 2026-08-20 — pantalla de asistencia con selector de fecha y bloqueo de no lectivos
- [B4] hecho 2026-08-20 — PWA instalable (manifest, iconos, service worker, BotonInstalar) y pantalla de ingreso por escaneo de carnet (BarcodeDetector nativo con respaldo @zxing/browser diferido); bundle inicial 92.3 KB gzip. TRACK B COMPLETO

## Cambios al contrato (requiere acuerdo de los tres)
- `index.html` (congelado en Fase 0) recibio las 3 etiquetas del manifest PWA (`link rel=manifest`, `link rel=apple-touch-icon`, `meta apple-mobile-web-app-capable`) requeridas por la Task 9 de v1, Step 3. No cambia ningun contrato de datos.

## Bloqueos
_(vacio)_
