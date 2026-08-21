# Verificación del envío de notificaciones

**Fecha de la prueba:** 21 de agosto de 2026
**Resultado:** el envío funciona. 6 de 6 notificaciones entregadas, 0 errores.

Los tests automáticos solo ejercitan el **encolado**: comprueban que se crea la fila
correcta y que no se duplica. El **envío** nunca se había ejecutado. Una cola que
encola perfectamente y no envía nada se ve idéntica a una que funciona, hasta el día
en que un acudiente pregunta por qué nunca le avisaron. Esta es la constancia de que
sí sale.

## Cómo se hizo

No hay Docker en esta máquina, así que en vez de MailHog se usó el servidor SMTP de
prueba de Python, que ya estaba instalado.

```bash
# 1. Servidor SMTP falso que imprime lo que recibe.
#    El -u es necesario: sin él la salida se queda en el búfer y el log sale vacío.
python -u -m aiosmtpd -n -l localhost:1025 -c aiosmtpd.handlers.Debugging

# 2. Backend apuntando a ese servidor, con el planificador acelerado a 10 segundos
#    para no esperar al siguiente cuarto de hora.
cd app/backend
DB_URL=jdbc:postgresql://localhost:5432/asistencia DB_USER=postgres DB_PASSWORD=postgres \
MAIL_HOST=localhost MAIL_PORT=1025 NOTIFY_ENABLED=true \
MAIL_FROM=asistencia@ggm.edu.co MAIL_COORDINACION=coord@ggm.edu.co \
SPRING_APPLICATION_JSON='{"app":{"notify":{"cron":"*/10 * * * * *"}}}' \
mvn -B spring-boot:run

# 3. Provocar una evasión.
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"fpalacios@ggm.edu.co","password":"cambiar123"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -X POST http://localhost:8080/api/attendance/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"records":[{"id":"e9999999-9999-4999-8999-999999999999","studentId":3,
       "scheduleBlockId":1,"classDate":"2026-08-19","status":"E",
       "recordedAt":"2026-08-19T12:00:00Z"}]}'
```

Para que el cron fuera configurable hubo que cambiar `NotificationJob` de
`@Scheduled(cron = "0 */15 * * * *")` a
`@Scheduled(cron = "${app.notify.cron:0 */15 * * * *}")`. El valor por defecto sigue
siendo cada quince minutos: solo se puede acelerar deliberadamente para probar.

## Correo recibido

```
Date: Fri, 21 Aug 2026 03:52:21 -0500 (COT)
From: asistencia@ggm.edu.co
To: coord@ggm.edu.co
Subject: Evasion de clase: DANIEL BARRIOS
Content-Type: text/plain; charset=UTF-8

El estudiante DANIEL BARRIOS (602) fue marcado como evadiendo clase
el 19/08/2026 por Francisco Palacios.
```

Nombre, curso, fecha en formato colombiano y docente responsable: todo correcto.

## Estado final de la cola

```sql
SELECT count(*) FILTER (WHERE sent_at IS NOT NULL) AS enviados,
       count(*) FILTER (WHERE error IS NOT NULL)   AS con_error
FROM notifications;
-- enviados: 6 | con_error: 0
```

Se comprobaron los dos tipos de aviso:

- `EVASION` a `coord@ggm.edu.co`, uno por cada registro marcado como evasión.
- `AUSENCIA_DIA` al correo de cada acudiente, **uno por estudiante y día**, no uno por
  bloque. Sin esa agrupación, un día de ausencia le mandaría seis correos al mismo
  padre.

## Dos hallazgos de la prueba

**El manejo de errores funciona como se diseñó.** En el primer intento el servidor SMTP
de prueba estaba mal configurado y rechazó los seis mensajes. El sistema guardó el
motivo exacto en la columna `error` de cada fila y **dejó de reintentar**, que es
justo lo previsto: un correo mal escrito reintentado en bucle bloquearía la cola
entera. Al corregir el servidor y limpiar la columna `error`, los seis salieron.

**Un fallo de envío es indistinguible de "no hay nada que enviar" si solo se miran los
logs**, porque la línea informativa solo se escribe cuando hay movimiento. Para saber
si el sistema está enviando, hay que mirar la tabla:

```sql
SELECT kind, recipient, sent_at, error FROM notifications
WHERE sent_at IS NULL ORDER BY created_at DESC;
```

## Configuración para producción

Variables de entorno obligatorias. Sin ellas el sistema **no manda nada** y no avisa:

| Variable | Ejemplo | Nota |
|---|---|---|
| `MAIL_HOST` | `smtp.gmail.com` | servidor SMTP institucional |
| `MAIL_PORT` | `587` | |
| `MAIL_USER` | `asistencia@ggm.edu.co` | |
| `MAIL_PASSWORD` | — | nunca en el repositorio |
| `MAIL_TLS` | `true` | obligatorio fuera de la red local |
| `MAIL_FROM` | `asistencia@ggm.edu.co` | remitente visible |
| `MAIL_COORDINACION` | correo real de coordinación | destino de los avisos de evasión |
| `NOTIFY_ENABLED` | `true` | ponerlo en `false` desactiva el envío sin tocar código |

`NOTIFY_ENABLED=false` es útil en la primera semana de uso: permite ver qué se
encolaría, mirando la tabla, antes de empezar a escribirles a los padres de verdad.
