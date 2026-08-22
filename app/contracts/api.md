# Contrato de API — congelado en la Fase 0

Todas las rutas cuelgan de `/api`. Todas menos `/auth/**` exigen
`Authorization: Bearer <token>`. Errores: 401 sin token o token vencido,
403 rol incorrecto, 400 cuerpo invalido.

## Auth  (Track A)
POST /auth/login    {email, password} -> {token, refreshToken, role, fullName, userId, mustChangePassword}
                    429 si el correo acumula 5 fallos (bloqueo de 15 minutos)
POST /auth/refresh  {refreshToken}    -> igual que login
POST /auth/change-password  {currentPassword, newPassword} -> 204
                    401 si la actual no coincide; 400 si la nueva tiene menos de 8
                    caracteres o es igual a la actual

## Calendario  (Track A)
GET  /calendar/school-days?from=YYYY-MM-DD&to=YYYY-MM-DD
     -> [{calendarDate, dayType, description}]
PUT  /calendar/school-days/{date}   (ADMIN, COORDINADOR)
     {dayType, description} -> {calendarDate, dayType, description}

## Sincronizacion  (Track A)
GET  /sync/bootstrap
     -> {blocks:[{id, grade, weekday, blockNo, subject, startTime}],
         students:[{id, documentId, fullName, grade}],
         schoolDays:[{calendarDate, dayType}]}
GET  /schedule/mine -> blocks del bootstrap

## Asistencia  (Track A)
POST /attendance/sync
     {records:[{id, studentId, scheduleBlockId, classDate, status, comment?, recordedAt}]}
     -> {accepted, rejected:[{id, reason}]}
GET  /attendance?blockId=&date= -> [{id, studentId, status, comment}]

## Ingreso  (Track C)
POST /entry/sync  {entries:[{id, documentId, scannedAt}]}
     -> {accepted, rejected:[{id, reason}], names:{<uuid>: "NOMBRE"}}

## Reportes  (Track C)
GET  /reports/summary?grade=&from=&to=
     -> [{studentId, documentId, fullName, grade, present, late, absent, evasion, schoolDays}]
GET  /reports/excel?grade=&from=&to=   -> binario .xlsx
GET  /reports/pending-today -> [{blockId, grade, subject, blockNo}]
GET  /reports/dashboard?from=&to=&grade=
     -> {kpi:{attendanceRate, absentToday, evasionsWeek, blocksPending, schoolDays},
         byGrade:[{grade, present, late, absent, evasion}],
         trend:[{classDate, attendanceRate}]}

## Acudiente  (Track C)
GET  /guardian/children
     -> [{studentId, fullName, grade, recent:[{classDate, subject, status, comment}]}]

## Administracion  (Track C)
POST /admin/import/students  multipart file=CSV -> {imported, errors:[String]}

## Reglas transversales
- `status` es siempre uno de P, T, F, E.
- `classDate` solo puede ser una fecha con dayType = LECTIVO. Si no, el registro
  se rechaza con reason = "La fecha no es un dia lectivo".
- Los `id` son UUID v4 generados por el cliente. Reenviar el mismo lote nunca duplica.
- `POST /attendance/sync` acepta como maximo 500 registros por lote.
