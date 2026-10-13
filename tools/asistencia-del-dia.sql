-- ================================================================
-- Asistencia del dia en produccion
-- ================================================================
-- Pega esto en el SQL Editor de Supabase.
-- Cambia la fecha en la linea de abajo (SET app.dia) si quieres otro dia.
--
-- La tabla attendance tiene UNA fila por (estudiante, bloque, dia), asi que un
-- estudiante ausente todo el dia deja varias filas 'F' (una por clase). Los
-- resumenes cuentan estudiantes DISTINTOS cuando hace falta; los listados
-- muestran el detalle por bloque.

SET app.dia = '2026-09-10';

-- 1. RESUMEN DEL DIA -------------------------------------------------
-- % asistencia = sobre las MARCAS tomadas hoy (igual que el reporte de la app: si
-- a media mañana nadie ha marcado el 901, eso no baja al 901; sale en "sin
-- registrar" y en la seccion "SIN TOMAR"). De lo que YA se registro, que tanto fue
-- presencia.
SELECT count(DISTINCT a.student_id) AS "estudiantes marcados hoy",
       (SELECT count(*) FROM students s
         WHERE s.active
           AND EXISTS (SELECT 1 FROM schedule_blocks b
                        WHERE b.grade = s.grade
                          AND b.weekday = EXTRACT(ISODOW FROM current_setting('app.dia')::date)))
           AS "tenian que asistir",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'P') AS "presentes",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'T') AS "llegaron tarde",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'F') AS "faltaron",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'E') AS "evadieron",
       (SELECT count(*) FROM students s
         WHERE s.active
           AND EXISTS (SELECT 1 FROM schedule_blocks b
                        WHERE b.grade = s.grade
                          AND b.weekday = EXTRACT(ISODOW FROM current_setting('app.dia')::date))
           AND NOT EXISTS (SELECT 1 FROM attendance a
                            WHERE a.student_id = s.id
                              AND a.class_date = current_setting('app.dia')::date))
           AS "sin registrar",
       round(100.0 * count(*) FILTER (WHERE a.status IN ('P','T'))
             / NULLIF(count(*), 0), 1) AS "% de presencia sobre lo marcado"
FROM attendance a
WHERE a.class_date = current_setting('app.dia')::date;

-- 2. POR CURSO ---------------------------------------------------------
SELECT s.grade AS curso,
       count(DISTINCT s.id) AS estudiantes,
       count(DISTINCT s.id) FILTER (WHERE a.status = 'P') AS presentes,
       count(DISTINCT s.id) FILTER (WHERE a.status = 'T') AS tarde,
       count(DISTINCT s.id) FILTER (WHERE a.status = 'F') AS faltaron,
       count(DISTINCT s.id) FILTER (WHERE a.status = 'E') AS evadieron,
       count(DISTINCT s.id) FILTER (WHERE a.id IS NULL)   AS sin_marca
FROM students s
LEFT JOIN attendance a
       ON a.student_id = s.id
      AND a.class_date = current_setting('app.dia')::date
WHERE s.active
  AND EXISTS (SELECT 1 FROM schedule_blocks b
               WHERE b.grade = s.grade
                 AND b.weekday = EXTRACT(ISODOW FROM current_setting('app.dia')::date))
GROUP BY s.grade
ORDER BY orden_curso(s.grade), s.grade;

-- 3. LOS QUE FALTARON (detalle por bloque) ------------------------------
SELECT s.grade AS curso,
       s.document_id AS documento,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre,
       sub.name AS materia,
       b.block_no AS bloque,
       b.start_time::text AS desde,
       a.comment AS observacion
FROM attendance a
JOIN students s ON s.id = a.student_id
JOIN schedule_blocks b ON b.id = a.schedule_block_id
JOIN subjects sub ON sub.id = b.subject_id
WHERE a.class_date = current_setting('app.dia')::date
  AND a.status = 'F'
ORDER BY orden_curso(s.grade), s.grade, s.last_name, b.block_no;

-- 4. LOS QUE ESTAN ACTIVOS PERO NO APARECEN (sin ninguna marca) ----------
SELECT s.grade AS curso,
       s.document_id AS documento,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre
FROM students s
WHERE s.active
  AND EXISTS (SELECT 1 FROM schedule_blocks b
               WHERE b.grade = s.grade
                 AND b.weekday = EXTRACT(ISODOW FROM current_setting('app.dia')::date))
  AND NOT EXISTS (SELECT 1 FROM attendance a
                   WHERE a.student_id = s.id
                     AND a.class_date = current_setting('app.dia')::date)
ORDER BY orden_curso(s.grade), s.grade, s.last_name;

-- 5. BLOQUES SIN COMPLETAR (clases de hoy sin marcas o con marcas incompletas) --
SELECT b.grade AS curso,
       sub.name AS materia,
       b.block_no AS bloque,
       b.room AS aula,
       u.full_name AS docente,
       (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active) AS estudiantes_del_curso,
       (SELECT count(*) FROM attendance a
         WHERE a.schedule_block_id = b.id AND a.class_date = current_setting('app.dia')::date) AS marcados
FROM schedule_blocks b
JOIN subjects sub ON sub.id = b.subject_id
JOIN users u ON u.id = b.teacher_id
WHERE b.weekday = EXTRACT(ISODOW FROM current_setting('app.dia')::date)
  AND (SELECT count(*) FROM attendance a
        WHERE a.schedule_block_id = b.id AND a.class_date = current_setting('app.dia')::date)
      < (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active)
  AND EXISTS (SELECT 1 FROM students s WHERE s.grade = b.grade AND s.active)
ORDER BY orden_curso(b.grade), b.grade, b.block_no;