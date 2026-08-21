# Estado de los tres tracks

Cada track anade una linea al terminar una tarea. Es el unico canal de
comunicacion entre las tres terminales: no hay mensajeria entre sesiones.

Formato: `- [<tarea>] <estado> <fecha> — <nota>`

## Bitacora
- [0.1] hecho — esqueletos y dependencias congeladas
- [0.2] hecho — esquema con calendario academico
- [0.3] hecho — contratos congelados; los tres tracks pueden arrancar
- [C2] hecho 2026-08-20 — dashboard con KPIs, barras por curso y tendencia diaria en SVG (geometria.ts + 5 tests de vitest en verde). `npm run build` falla por ahora con "Module has no exported member 'api'" en `frontend/src/api/client.ts`: ese fichero es de Track B (Task B1) y hoy es solo el stub de la Fase 0; no se toco por ser propiedad ajena. Se resuelve solo al fusionar con track-b-app.
- [A1] hecho 2026-08-20 — POST /api/auth/login y /api/auth/refresh operativos (SecurityConfig, JwtFilter/JwtService en shared/, AuthService+AuthController en user/); se corrigio el hash bcrypt de la semilla V3 (no correspondia a "cambiar123")
- [C1] hecho 2026-08-20 — ingreso por carnet (`POST /api/entry/sync`), reportes (`/api/reports/summary`, `/excel`, `/pending-today`) y `/api/reports/dashboard`, con `schoolDays` en el resumen y columna "Dias lectivos" en el Excel. Para compilar hizo falta traer del Track A el `calendar/` (Task A2 completa: DayType, SchoolDay, CalendarRepository/Service/Controller + CalendarTest) y crear `student/model/Student.java` + `student/repository/StudentRepository.java` (parte de la Task A3 que aun no existia): sin ellos ni `CalendarService.isSchoolDay` ni `EntryController`/`ReportRepository` compilaban. Se fusiono localmente `track-a-nucleo` (solo tenia A1) para no reescribir JwtService a mano. Track A: al retomar A2/A3 revisar que coincida con lo ya creado aqui (paquetes `calendar/` y `student/`) para fusionar sin duplicar. 23/23 tests backend en verde (`mvn test` contra `asistencia_test_c`).

## Cambios al contrato (requiere acuerdo de los tres)
_(vacio)_

## Bloqueos
_(vacio)_
