-- ================================================================
-- DATOS SIMULADOS DE PRUEBA — asistencia de todo el mes en Supabase
-- ================================================================
-- LLENA con marcas falsas del 1 al hoy (hora Bogota) a TODOS los
-- salones que tengan horario cargado. Para primaria/preescolar (que
-- NO tienen horario en la base todavia) no inserta nada.
--
-- IMPORTANTE:
--  * Antes de correr esto, apaga NOTIFY_ENABLED en Render (averigue ahi;
--    son datos falsos y no deben generar correos a acudientes).
--  * Las filas quedan marcadas con comment='SIMULADO'. Para borrar todo
--    el inventario despues, pega (al final de este script):
--
--      DELETE FROM attendance WHERE comment = 'SIMULADO';
--
--  * Tus marcas manuales (comment NULL) NO se tocan.
-- ================================================================

-- 0. Limpieza previa: borra simulaciones anteriores para poder repetir sin duplicar.
DELETE FROM attendance
WHERE comment = 'SIMULADO'
  AND class_date BETWEEN date '2026-09-01'
                     AND (now() AT TIME ZONE 'America/Bogota')::date;

-- 1. Generar una marca por (estudiante activo, bloque, dia lectivo del mes).
--    El "azar" es determinista (hash) para que repetir de el mismo resultado.
WITH dias AS (
    SELECT generate_series(
             date '2026-09-01',
             (now() AT TIME ZONE 'America/Bogota')::date,
             interval '1 day')::date AS dia
),
marcas AS (
    SELECT s.id          AS student_id,
           b.id          AS schedule_block_id,
           d.dia         AS class_date,
           b.teacher_id  AS recorded_by,
           abs(('x' || substr(md5(s.id::text || '|' || b.id::text || '|' || d.dia::text), 1, 8))
               ::bit(32)::int) % 100 AS azar
    FROM dias d
    JOIN schedule_blocks b
      ON b.weekday = EXTRACT(ISODOW FROM d.dia)
    JOIN students s
      ON s.grade = b.grade
     AND s.active
)
INSERT INTO attendance (id, student_id, schedule_block_id, class_date,
                        status, comment, recorded_by, recorded_at)
SELECT gen_random_uuid(),
       student_id,
       schedule_block_id,
       class_date,
       CASE WHEN azar <  1 THEN 'E'
            WHEN azar <  6 THEN 'F'
            WHEN azar < 12 THEN 'T'
            ELSE 'P' END     AS status,
       'SIMULADO',
       recorded_by,
       (class_date::timestamp
        + interval '5 hours'
        + (azar % 5) * interval '1 hour'
        + (random() * interval '50 minutes')::interval)
         AT TIME ZONE 'America/Bogota' AS recorded_at
FROM marcas
ON CONFLICT DO NOTHING;

-- 2. Resumen de lo que quedo por curso (cierralo en "Rows affected").
SELECT s.grade AS curso,
       count(*)                                                       AS marcadas,
       count(*) FILTER (WHERE a.status = 'P')                         AS presentes,
       count(*) FILTER (WHERE a.status = 'T')                         AS tarde,
       count(*) FILTER (WHERE a.status = 'F')                         AS faltaron,
       count(*) FILTER (WHERE a.status = 'E')                         AS evadieron
FROM attendance a
JOIN students s ON s.id = a.student_id
WHERE a.comment = 'SIMULADO'
  AND a.class_date BETWEEN date '2026-09-01'
                       AND (now() AT TIME ZONE 'America/Bogota')::date
GROUP BY s.grade
ORDER BY orden_curso(s.grade), s.grade;