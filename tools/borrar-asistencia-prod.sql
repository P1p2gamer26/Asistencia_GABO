-- ================================================================
-- Deja produccion sin NINGUN registro de asistencia, como recien instalada.
-- Borra: listas de clase (attendance), entradas por porteria (entry_log)
-- y los avisos generados (notifications, se van solos con attendance).
-- NO toca: estudiantes, docentes, usuarios, horario, calendario, acudientes.
-- Pegar en el SQL Editor de Supabase y ejecutar. NO se puede deshacer.
-- ================================================================

-- 1. Antes: cuanto hay
SELECT (SELECT count(*) FROM attendance)    AS listas,
       (SELECT count(*) FROM entry_log)     AS entradas,
       (SELECT count(*) FROM notifications) AS avisos;

-- 2. Borrado
BEGIN;
DELETE FROM notifications;
DELETE FROM attendance;
DELETE FROM entry_log;
COMMIT;

-- 3. Despues: debe salir 0 | 0 | 0
SELECT (SELECT count(*) FROM attendance)    AS listas,
       (SELECT count(*) FROM entry_log)     AS entradas,
       (SELECT count(*) FROM notifications) AS avisos;
