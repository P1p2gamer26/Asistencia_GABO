-- A. DIAGNOSTICO: que fechas tienen marcas reales?
--    Si hoy (2026-09-10) no aparece, la app todavia no ha guardado marcas
--    de hoy y las secciones "por curso" se ven todas iguales (todo 0).
SELECT class_date, count(*) AS marcas, count(DISTINCT student_id) AS estudiantes
FROM attendance
GROUP BY class_date
ORDER BY class_date DESC
LIMIT 10;

-- B. LISTA DE ASISTENCIA DE HOY (por estudiante)
SELECT s.grade AS curso,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre,
       s.document_id AS documento,
       count(*) FILTER (WHERE a.status = 'P') AS presentes,
       count(*) FILTER (WHERE a.status = 'T') AS tarde,
       count(*) FILTER (WHERE a.status = 'F') AS faltaron,
       count(*) FILTER (WHERE a.status = 'E') AS evadieron,
       CASE WHEN count(*) FILTER (WHERE a.status = 'E') > 0 THEN 'EVASION'
            WHEN count(*) FILTER (WHERE a.status = 'F') > 0 THEN 'FALTO'
            WHEN count(*) FILTER (WHERE a.status = 'T') > 0 THEN 'TARDE'
            WHEN count(*) FILTER (WHERE a.status = 'P') > 0 THEN 'PRESENTE'
            ELSE 'SIN MARCAR' END AS estado_del_dia,
       count(a.id) AS bloques_marcados
FROM students s
LEFT JOIN attendance a
       ON a.student_id = s.id
      AND a.class_date = (now() AT TIME ZONE 'America/Bogota')::date
WHERE s.active
  AND EXISTS (SELECT 1 FROM schedule_blocks b
               WHERE b.grade = s.grade
                 AND b.weekday = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'America/Bogota')))
GROUP BY s.id
ORDER BY orden_curso(s.grade), s.grade, s.last_name, s.first_name;

-- C. DETALLE DE HOY (quien fue marcado, en que clase y como)
SELECT s.grade AS curso,
       s.document_id AS documento,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre,
       sub.name AS materia,
       b.block_no AS bloque,
       a.status AS estado,
       a.comment AS observacion
FROM attendance a
JOIN students s ON s.id = a.student_id
JOIN schedule_blocks b ON b.id = a.schedule_block_id
JOIN subjects sub ON sub.id = b.subject_id
WHERE a.class_date = (now() AT TIME ZONE 'America/Bogota')::date
ORDER BY orden_curso(s.grade), s.grade, b.block_no, s.last_name;