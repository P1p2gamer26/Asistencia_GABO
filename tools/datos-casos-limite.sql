-- Casos que la siembra normal no produce y que dejan pantallas enteras sin poder
-- evaluarse. Se ejecuta DESPUES de datos-locales.sql y datos-realistas.sql:
--
--   psql -U postgres -d asistencia -f tools/datos-casos-limite.sql
--
-- Por que existe: con la siembra anterior, en la base local habia CERO bloques sin
-- reportar, CERO estudiantes retirados, CERO dias suspendidos, CERO jornadas
-- institucionales y CERO cursos sin registros. Es decir, varias ramas del codigo
-- -- incluida la que distingue "curso que nadie marco" de "curso con 100% real" --
-- no se podian ver funcionando ni fallando. Un dato que nunca ocurre es una rama que
-- nunca se prueba.
--
-- Es idempotente.

\timing off

-- 1. Un curso nuevo sin un solo registro ---------------------------------------
-- El 607 se acaba de crear: tiene estudiantes y horario, pero nadie ha pasado lista.
-- En la tabla "asistencia por curso" NO puede aparecer como 100%: eso seria leer la
-- ausencia de datos como si fuera un dato, y es el error que mas nos importa evitar.
INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((1190000000 + n)::text, 10, '0'),
       (ARRAY['Laura','Julian','Mariana','Esteban','Gabriela','Ricardo',
              'Natalia','Oscar','Carolina','Fabian'])[1 + (n % 10)],
       'De Jesus',
       (ARRAY['Zapata','Buitrago','Cifuentes','Osorio','Rincon',
              'Lozano','Pardo','Higuera','Trujillo','Mejia'])[1 + ((n * 3) % 10)],
       'Barrios', '607', TRUE
FROM generate_series(1, 28) AS n
ON CONFLICT (document_id) DO NOTHING;

INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT '607', d.weekday, b.block_no,
       (time '07:00' + (b.block_no - 1) * interval '55 minutes')::time,
       (time '07:50' + (b.block_no - 1) * interval '55 minutes')::time,
       (SELECT id FROM subjects ORDER BY id LIMIT 1 OFFSET ((b.block_no - 1) % 6)),
       (SELECT id FROM users WHERE email = 'profe1@ggm.edu.co'),
       'Aula 107'
FROM generate_series(1, 5) AS d(weekday), generate_series(1, 6) AS b(block_no)
WHERE NOT EXISTS (SELECT 1 FROM schedule_blocks x
                   WHERE x.grade = '607' AND x.weekday = d.weekday
                     AND x.block_no = b.block_no);

-- 2. Estudiantes retirados -----------------------------------------------------
-- Se van del colegio a mitad de ano y su asistencia pasada NO se borra. Sirve para
-- comprobar que los conteos de "cuantos estudiantes tiene el curso" usan `active` y
-- no cuentan a quien ya no esta, que inflaria los bloques como incompletos para
-- siempre.
UPDATE students SET active = FALSE
 WHERE (id % 53) = 0 AND grade <> '607' AND active;

-- 3. Bloques sin reportar en el ultimo dia lectivo ------------------------------
-- La realidad: siempre hay docentes que no alcanzaron a pasar lista. Sin esto, el
-- aviso "Faltan N bloques por reportar" nunca aparece y no se puede juzgar.
DELETE FROM attendance a
 USING schedule_blocks b,
       (SELECT max(calendar_date) AS ultimo FROM school_calendar
         WHERE day_type = 'LECTIVO' AND calendar_date <= CURRENT_DATE) u
 WHERE a.schedule_block_id = b.id
   AND a.class_date = u.ultimo
   AND b.block_no IN (5, 6)
   AND b.grade IN ('605', '606');

-- 4. Dias suspendidos y jornadas institucionales --------------------------------
-- El calendario solo tenia LECTIVO y FESTIVO, asi que dos de los cuatro tipos de dia
-- no se habian visto nunca pintados en la cuadricula.
UPDATE school_calendar
   SET day_type = 'SUSPENDIDO', description = 'Paro de transporte en Usme'
 WHERE calendar_date = (SELECT calendar_date FROM school_calendar
                         WHERE day_type = 'LECTIVO'
                           AND calendar_date BETWEEN date_trunc('month', CURRENT_DATE)
                                                 AND CURRENT_DATE
                         ORDER BY calendar_date LIMIT 1);

UPDATE school_calendar
   SET day_type = 'INSTITUCIONAL', description = 'Jornada pedagogica de docentes'
 WHERE calendar_date = (SELECT calendar_date FROM school_calendar
                         WHERE day_type = 'LECTIVO'
                           AND calendar_date > CURRENT_DATE
                         ORDER BY calendar_date LIMIT 1);

ANALYZE students;
ANALYZE attendance;
ANALYZE school_calendar;

-- Comprobacion: estos numeros son el entregable.
SELECT 'bloques sin reportar en el ultimo dia lectivo' AS caso, count(*) AS n
  FROM schedule_blocks b,
       (SELECT max(calendar_date) AS ultimo FROM school_calendar
         WHERE day_type = 'LECTIVO' AND calendar_date <= CURRENT_DATE) u
 WHERE b.weekday = EXTRACT(ISODOW FROM u.ultimo)
   AND NOT EXISTS (SELECT 1 FROM attendance a
                    WHERE a.schedule_block_id = b.id AND a.class_date = u.ultimo)
UNION ALL SELECT 'estudiantes retirados', count(*) FROM students WHERE NOT active
UNION ALL SELECT 'estudiantes del curso 607 (sin un solo registro)', count(*)
           FROM students WHERE grade = '607' AND active
UNION ALL SELECT 'dias suspendidos', count(*) FROM school_calendar
           WHERE day_type = 'SUSPENDIDO'
UNION ALL SELECT 'jornadas institucionales', count(*) FROM school_calendar
           WHERE day_type = 'INSTITUCIONAL';
