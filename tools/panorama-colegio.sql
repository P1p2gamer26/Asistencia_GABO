-- ================================================================
-- Panorama del colegio: estudiantes activos/inactivos por salon y
-- que salones ya tienen horario cargado.
-- ================================================================
-- Pega esto en el SQL Editor de Supabase. Responde de un vistazo:
--   * cuantos estudiantes activos/inactivos tiene cada salon
--   * que salones tienen horario (bloques, materias, docentes)
--   * que salones NO tienen horario (los pendientes por cargar)
--   * quienes son los inactivos (retirados)
-- No modifica nada: solo consulta.

-- 1. RESUMEN GENERAL -------------------------------------------------
SELECT (SELECT count(*) FROM students)                                  AS estudiantes,
       (SELECT count(*) FROM students WHERE active)                     AS activos,
       (SELECT count(*) FROM students WHERE NOT active)                 AS inactivos,
       (SELECT count(DISTINCT grade) FROM students)                     AS salones_con_estudiantes,
       (SELECT count(DISTINCT grade) FROM schedule_blocks)              AS salones_con_horario,
       (SELECT count(DISTINCT grade)
          FROM students s
         WHERE NOT EXISTS (SELECT 1 FROM schedule_blocks b
                            WHERE b.grade = s.grade))                   AS salones_sin_horario,
       (SELECT count(*) FROM schedule_blocks)                           AS bloques_de_horario,
       (SELECT count(DISTINCT subject_id) FROM schedule_blocks)         AS materias,
       (SELECT count(DISTINCT teacher_id) FROM schedule_blocks)         AS docentes;

-- 2. UN REGLON POR SALON (los 47) --------------------------------------
-- activos/inactivos de estudiantes + si tiene horario cargado y cuan completo.
SELECT s.grade AS salon,
       count(*) FILTER (WHERE s.active)            AS activos,
       count(*) FILTER (WHERE NOT s.active)        AS inactivos,
       count(*)                                    AS total,
       (SELECT count(*) FROM schedule_blocks b
         WHERE b.grade = s.grade)                  AS bloques_horario,
       (SELECT count(DISTINCT b.subject_id)
          FROM schedule_blocks b
         WHERE b.grade = s.grade)                  AS materias,
       (SELECT count(DISTINCT b.teacher_id)
          FROM schedule_blocks b
         WHERE b.grade = s.grade)                  AS docentes
FROM students s
GROUP BY s.grade
ORDER BY orden_curso(s.grade), s.grade;

-- 3. SALONES SIN HORARIO (los pendientes por pedir/cargar) --------------
SELECT s.grade AS salon,
       count(*) FILTER (WHERE s.active)     AS activos,
       count(*) FILTER (WHERE NOT s.active) AS inactivos,
       count(*)                             AS total
FROM students s
WHERE NOT EXISTS (SELECT 1 FROM schedule_blocks b WHERE b.grade = s.grade)
GROUP BY s.grade
ORDER BY orden_curso(s.grade), s.grade;

-- 4. LOS INACTIVOS (retirados) ------------------------------------------
SELECT s.document_id AS documento,
       trim(regexp_replace(concat_ws(' ', s.first_name, s.middle_name,
            s.last_name, s.second_surname), '\s+', ' ', 'g')) AS nombre,
       s.grade AS salon,
       s.active
FROM students s
WHERE NOT s.active
ORDER BY orden_curso(s.grade), s.grade, s.last_name;