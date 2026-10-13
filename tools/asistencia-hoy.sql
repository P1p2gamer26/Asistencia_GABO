-- ================================================================
-- Asistencia de HOY (lista para pegar en el SQL Editor de Supabase)
-- ================================================================
-- "Hoy" se calcula solo en hora de Bogota, asi que no hay nada que
-- editar: pegar y ejecutar. La tabla attendance tiene UNA fila por
-- (estudiante, bloque, dia); un ausente deja una fila 'F' por clase.

-- Abajo, "hoy" es la expresion (now() AT TIME ZONE 'America/Bogota')::date.
-- Si quieres otro dia, reemplazala por la fecha en comillas, p. ej. '2026-09-11'.

-- 1. RESUMEN DEL DIA -------------------------------------------------
-- % de presencia = sobre lo que YA se registro hoy (los cursos aun sin
-- marcar salen abajo en "sin registrar" y en la seccion 5, no castigan).
SELECT count(DISTINCT a.student_id) AS "estudiantes marcados hoy",
       (SELECT count(*) FROM students s
         WHERE s.active
           AND EXISTS (SELECT 1 FROM schedule_blocks b
                        WHERE b.grade = s.grade
                          AND b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota'))))
           AS "tenian que asistir",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'P') AS "presentes",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'T') AS "llegaron tarde",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'F') AS "faltaron",
       count(DISTINCT a.student_id) FILTER (WHERE a.status = 'E') AS "evadieron",
       (SELECT count(*) FROM students s
         WHERE s.active
           AND EXISTS (SELECT 1 FROM schedule_blocks b
                        WHERE b.grade = s.grade
                          AND b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota')))
           AND NOT EXISTS (SELECT 1 FROM attendance a
                            WHERE a.student_id = s.id
                              AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date))
           AS "sin registrar",
       round(100.0 * count(*) FILTER (WHERE a.status IN ('P','T'))
             / NULLIF(count(*), 0), 1) AS "% de presencia sobre lo marcado"
FROM attendance a
WHERE a.class_date = (now() AT TIME ZONE 'America/Bogota')::date;

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
      AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date
WHERE s.active
  AND EXISTS (SELECT 1 FROM schedule_blocks b
               WHERE b.grade = s.grade
                 AND b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota')))
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
WHERE a.class_date = (now() AT TIME ZONE 'America/Bogota')::date
  AND a.status = 'F'
ORDER BY orden_curso(s.grade), s.grade, s.last_name, b.block_no;

-- 4. ACTIVOS SIN NINGUNA MARCA HOY ---------------------------------------
SELECT s.grade AS curso,
       s.document_id AS documento,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre
FROM students s
WHERE s.active
  AND EXISTS (SELECT 1 FROM schedule_blocks b
               WHERE b.grade = s.grade
                 AND b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota')))
  AND NOT EXISTS (SELECT 1 FROM attendance a
                   WHERE a.student_id = s.id
                     AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date)
ORDER BY orden_curso(s.grade), s.grade, s.last_name;

-- 5. BLOQUES SIN COMPLETAR (clases de hoy con marcas incompletas) ----------
SELECT b.grade AS curso,
       sub.name AS materia,
       b.block_no AS bloque,
       b.room AS aula,
       u.full_name AS docente,
       (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active) AS estudiantes_del_curso,
       (SELECT count(*) FROM attendance a
         WHERE a.schedule_block_id = b.id AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date) AS marcados
FROM schedule_blocks b
JOIN subjects sub ON sub.id = b.subject_id
JOIN users u ON u.id = b.teacher_id
WHERE b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota'))
  AND (SELECT count(*) FROM attendance a
        WHERE a.schedule_block_id = b.id AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date)
      < (SELECT count(*) FROM students s WHERE s.grade = b.grade AND s.active)
  AND EXISTS (SELECT 1 FROM students s WHERE s.grade = b.grade AND s.active)
ORDER BY orden_curso(b.grade), b.grade, b.block_no;