# Estado de los tres tracks

Cada track anade una linea al terminar una tarea. Es el unico canal de
comunicacion entre las tres terminales: no hay mensajeria entre sesiones.
Formato: `- [<tarea>] <estado> <fecha> — <nota>`
## Bitacora
- [0.1] hecho — esqueletos y dependencias congeladas
- [0.2] hecho — esquema con calendario academico
- [0.3] hecho — contratos congelados; los tres tracks pueden arrancar
- [A1] hecho 2026-08-20 — POST /api/auth/login y /api/auth/refresh operativos (SecurityConfig, JwtFilter/JwtService en shared/, AuthService+AuthController en user/); se corrigio el hash bcrypt de la semilla V3 (no correspondia a "cambiar123")
- [A2] hecho 2026-08-20 — GET/PUT /api/calendar/school-days e isSchoolDay operativos (paquete calendar/ con controller, service, repository, model)
## Cambios al contrato (requiere acuerdo de los tres)
_(vacio)_
## Bloqueos
- [A3] hecho — /api/sync/bootstrap incluye schoolDays; contrato verificado
- [A4] hecho — sync valida dia lectivo; TRACK A COMPLETO
- [B1] hecho 2026-08-20 — cliente HTTP, login y modo mock (VITE_MOCK=1)
- [B2] hecho 2026-08-20 — IndexedDB con calendario; markAttendance bloquea dias no lectivos
- [B3] hecho 2026-08-20 — pantalla de asistencia con selector de fecha y bloqueo de no lectivos
- [B4] hecho 2026-08-20 — PWA instalable (manifest, iconos, service worker, BotonInstalar) y pantalla de ingreso por escaneo de carnet (BarcodeDetector nativo con respaldo @zxing/browser diferido); bundle inicial 92.3 KB gzip. TRACK B COMPLETO
