-- ================================================================
-- Diagnóstico: encontrar estudiantes retirados en producción
-- ================================================================
-- Pega esto en el SQL Editor de Supabase y revisa los resultados.

-- 1. Estudiantes que el sistema marca como INACTIVOS (retirados)
--    El upsert del CSV los re-activa, así que si alguno sigue
--    inactivo es porque NO estaba en el CSV (retirado manualmente
--    o no incluido en la carga).
SELECT
    s.id,
    s.document_id,
    s.first_name || ' ' || coalesce(s.middle_name, '') || ' ' ||
        s.last_name || ' ' || coalesce(s.second_surname, '') AS nombre,
    s.grade,
    s.active,
    s.created_at
FROM students s
WHERE s.active = FALSE
ORDER BY s.grade, s.last_name;

-- 2. Resumen: cuántos activos/inactivos hay por grado
SELECT
    grade,
    count(*) FILTER (WHERE active)   AS activos,
    count(*) FILTER (WHERE NOT active) AS inactivos,
    count(*) AS total
FROM students
GROUP BY grade
ORDER BY
    CASE
        WHEN grade ~ '^\d{4}$' THEN 0           -- 601-1102
        WHEN grade ~ '^PB' THEN 10
        WHEN grade ~ '^PJ' THEN 11
        WHEN grade ~ '^J\d' THEN 12
        WHEN grade ~ '^T\d' THEN 13
        WHEN grade ~ '^99' THEN 14
        WHEN grade ~ '^SA' THEN 15
        ELSE 5
    END,
    grade;

-- 3. Grados que NO tienen ningún bloque de horario
--    (si la escuela secundaria es 601-1102, todo lo demás
--    podría ser primaria/preescolar que no usa el sistema)
SELECT
    s.grade,
    count(*) AS alumnos,
    (SELECT count(*)
     FROM schedule_blocks sb
     WHERE sb.grade = s.grade) AS bloques_horario
FROM students s
GROUP BY s.grade
HAVING (SELECT count(*)
        FROM schedule_blocks sb
        WHERE sb.grade = s.grade) = 0
ORDER BY s.grade;

-- 4. Lista de TODOS los estudiantes sin horario, por si necesitas
--    exportarlos o revisarlos
SELECT
    s.document_id,
    s.first_name,
    s.middle_name,
    s.last_name,
    s.second_surname,
    s.grade,
    s.active
FROM students s
WHERE NOT EXISTS (
    SELECT 1
    FROM schedule_blocks sb
    WHERE sb.grade = s.grade
)
ORDER BY s.grade, s.last_name, s.first_name;
