-- Estructura real de cursos del colegio: grados 0 (transicion) a 11, cada uno con
-- grupo A y B -> 24 cursos ('0A','0B','1A','1B', ... '11A','11B').
--
--   psql -U postgres -d asistencia -f tools/datos-estructura-real.sql
--
-- Por que existe: tools/datos-locales.sql siembra cursos '601'..'607', que no es la
-- estructura de un colegio colombiano (ahi el "6" es el grado sexto y "01".."07" el
-- consecutivo del curso, no un grupo A/B). Este script siembra la estructura real:
-- grado (0 a 11) + grupo (A o B). No toca ni borra los cursos 601..607: usa un
-- patron de grade distinto ('0A'..'11B', dos o tres caracteres que terminan en
-- letra) por lo que ambos scripts pueden convivir en la misma base sin chocar
-- (ni en students.grade, ni en schedule_blocks por la clave unica
-- (grade, weekday, block_no)). Si se quiere dejar SOLO la estructura real, hay que
-- limpiar 601..607 a mano (no lo hace este script, porque tocaria tablas con datos
-- de otros scripts y el encargo prohibe TRUNCATE/DELETE contra la base real):
--
--   DELETE FROM attendance WHERE schedule_block_id IN
--     (SELECT id FROM schedule_blocks WHERE grade LIKE '6%' AND length(grade) = 3);
--   DELETE FROM schedule_blocks WHERE grade LIKE '6%' AND length(grade) = 3;
--   DELETE FROM guardianships WHERE student_id IN (SELECT id FROM students WHERE grade LIKE '6%' AND length(grade) = 3);
--   DELETE FROM students WHERE grade LIKE '6%' AND length(grade) = 3;
--
-- Orden recomendado: primero V1..V50 (Flyway), luego este script. datos-locales.sql
-- y datos-acentos.sql pueden correr antes o despues sin interferir.
--
-- ATENCION - orden de los cursos en pantalla: students.grade y schedule_blocks.grade
-- son VARCHAR y las pantallas hacen "ORDER BY grade" como TEXTO (ver
-- ReportRepository.java). Ordenado como texto, '10A' y '11A' quedan alfabeticamente
-- antes que '2A' (porque '1' < '2'), y el orden real que sale es:
--   0A,0B,10A,10B,11A,11B,1A,1B,2A,2B,3A,3B,4A,4B,5A,5B,6A,6B,7A,7B,8A,8B,9A,9B
-- que NO es el orden pedagogico esperado (0..11). Este script NO lo corrige (no se
-- pidio tocar codigo de backend/frontend). Propuesta para quien lo aborde: separar
-- el grado numerico del grupo en dos columnas (grade_number SMALLINT, grade_group
-- CHAR(1)) y ordenar por (grade_number, grade_group); o mientras tanto, ordenar con
-- "ORDER BY length(grade), grade" que ya deja 0..9 antes que 10/11 (funciona porque
-- todos los grados de un digito son mas cortos que los de dos).
--
-- Es idempotente: se puede volver a ejecutar sin duplicar nada (ON CONFLICT / claves
-- unicas en todo). No borra nada existente (sin TRUNCATE ni DELETE): conserva los
-- usuarios (admin@ggm.edu.co, coord@ggm.edu.co, fpalacios@ggm.edu.co, acudientes)
-- y cualquier dato real que ya haya en la base.

\timing on

-- Materias: las 6 de siempre mas Educacion Fisica y Artes, que hacen falta para la
-- rotacion de especialistas de primaria y para el pool de bachillerato.
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ciencias'), ('Sociales'), ('Ingles'), ('Informatica'),
  ('Educacion Fisica'), ('Artes')
ON CONFLICT (name) DO NOTHING;

-- Docentes de primaria (0A..5B): un titular por curso, que dicta casi todo -----------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'profe.home.' || lower(g.grade) || '@ggm.edu.co',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       (ARRAY['Ana Rojas','Luis Medina','Marta Cardenas','Carlos Pineda','Sofia Vargas','Jorge Salazar',
              'Elena Duarte','Miguel Ochoa','Paula Beltran','Andres Quintero','Clara Nieto','Diego Moreno'])
         [1 + ((row_number() OVER (ORDER BY g.grade) - 1) % 12)],
       'DOCENTE', TRUE, FALSE
FROM (SELECT n::text || letra AS grade
        FROM generate_series(0, 5) AS n
       CROSS JOIN unnest(ARRAY['A', 'B']) AS letra) g
ON CONFLICT (email) DO NOTHING;

-- Especialistas de primaria (comparten los 12 cursos: Ingles, Artes, Ed. Fisica) -----
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password) VALUES
 ('profe.ingles.primaria@ggm.edu.co', '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu', 'Patricia Cifuentes', 'DOCENTE', TRUE, FALSE),
 ('profe.artes.primaria@ggm.edu.co',  '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu', 'Ramiro Cuellar',     'DOCENTE', TRUE, FALSE),
 ('profe.edfis.primaria@ggm.edu.co',  '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu', 'Yolanda Trujillo',   'DOCENTE', TRUE, FALSE)
ON CONFLICT (email) DO NOTHING;

-- Docentes de bachillerato (6A..11B): dos por materia, cada uno dicta su materia -----
-- en varios cursos (la mitad de los 12 cursos de bachillerato cada uno).
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'profe.sec.' || sub.slug || '.' || t.n || '@ggm.edu.co',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       (ARRAY['Fernando Aguilar','Liliana Bustos','Ivan Rincon','Diana Zapata',
              'Cesar Montano','Natalia Osorio','Ricardo Puentes','Vivian Cano',
              'Alvaro Sarmiento','Monica Delgado','Hector Villamil','Gloria Espitia',
              'Wilson Prieto','Adriana Barreto','German Fajardo','Sandra Lozano'])
         [1 + ((sub.ord * 2 + t.n - 1) % 16)],
       'DOCENTE', TRUE, FALSE
  FROM (VALUES (0, 'mat'), (1, 'esp'), (2, 'cie'), (3, 'soc'),
               (4, 'ing'), (5, 'inf'), (6, 'edf'), (7, 'art')) AS sub(ord, slug)
 CROSS JOIN generate_series(1, 2) AS t(n)
ON CONFLICT (email) DO NOTHING;

-- 24 cursos: 0A..11B, unos 24-26 estudiantes en primaria y unos 30-32 en bachillerato -
INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((2200000000 + gs.n)::text, 10, '0'),
       (ARRAY['Camila','Santiago','Valentina','Mateo','Isabella','Sebastian',
              'Salome','Emiliano','Antonia','Tomas','Maria Jose','Juan Pablo'])[1 + (gs.n % 12)],
       (ARRAY['Andrea','Jose','Lucia','David','Sofia','Alejandro',
              'Marcela','Nicolas','Daniela','Felipe'])[1 + ((gs.n * 3) % 10)],
       (ARRAY['Gonzalez','Ramirez','Herrera','Castro','Molina','Reyes',
              'Acosta','Peralta','Suarez','Mendoza','Munoz','Pena'])[1 + ((gs.n * 7) % 12)],
       (ARRAY['Lopez','Torres','Rivas','Guzman','Pardo','Cordoba',
              'Silva','Naranjo','Bonilla','Escobar'])[1 + ((gs.n * 11) % 10)],
       g.grade,
       TRUE
  FROM (SELECT n::text || letra AS grade, n AS grado_num,
               row_number() OVER (ORDER BY n, letra) AS curso_ix
          FROM generate_series(0, 11) AS n
         CROSS JOIN unnest(ARRAY['A', 'B']) AS letra) g
  CROSS JOIN LATERAL generate_series(
               1,
               CASE WHEN g.grado_num <= 5 THEN 24 + (g.curso_ix % 3) ELSE 30 + (g.curso_ix % 3) END
             ) AS alumno_ix
  CROSS JOIN LATERAL (SELECT (g.curso_ix - 1) * 32 + alumno_ix AS n) gs
ON CONFLICT (document_id) DO NOTHING;

-- Horario de primaria: el titular dicta casi todo; los especialistas se quedan con -----
-- un bloque fijo a la semana (ingles lunes, artes miercoles, ed. fisica viernes).
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT g.grade, d.weekday, b.block_no,
       TIME '06:30' + (b.block_no - 1) * INTERVAL '55 minutes',
       TIME '07:20' + (b.block_no - 1) * INTERVAL '55 minutes',
       (SELECT id FROM subjects WHERE name = esp.subject_name),
       (SELECT id FROM users WHERE email = esp.teacher_email),
       CASE
         WHEN esp.subject_name IN ('Educacion Fisica', 'Artes') THEN 'Aula multiple'
         WHEN esp.subject_name = 'Ingles' THEN 'Aula ' || (100 + ((b.block_no + d.weekday) % 8))
         WHEN (b.block_no * d.weekday + abs(hashtext(g.grade))) % 9 = 0 THEN NULL
         ELSE 'Aula ' || (150 + (('x' || md5(g.grade))::bit(16)::int % 12))
       END
  FROM (SELECT n::text || letra AS grade
          FROM generate_series(0, 5) AS n
         CROSS JOIN unnest(ARRAY['A', 'B']) AS letra) g
 CROSS JOIN generate_series(1, 5) AS d(weekday)
 CROSS JOIN generate_series(1, 6) AS b(block_no)
 CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN d.weekday = 1 AND b.block_no = 6 THEN 'Ingles'
                 WHEN d.weekday = 3 AND b.block_no = 6 THEN 'Artes'
                 WHEN d.weekday = 5 AND b.block_no = 6 THEN 'Educacion Fisica'
                 ELSE (ARRAY['Matematicas','Espanol','Ciencias','Sociales','Informatica'])
                        [1 + ((b.block_no + d.weekday) % 5)]
               END AS subject_name,
               CASE
                 WHEN d.weekday = 1 AND b.block_no = 6 THEN 'profe.ingles.primaria@ggm.edu.co'
                 WHEN d.weekday = 3 AND b.block_no = 6 THEN 'profe.artes.primaria@ggm.edu.co'
                 WHEN d.weekday = 5 AND b.block_no = 6 THEN 'profe.edfis.primaria@ggm.edu.co'
                 ELSE 'profe.home.' || lower(g.grade) || '@ggm.edu.co'
               END AS teacher_email
      ) esp
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET room = EXCLUDED.room, teacher_id = EXCLUDED.teacher_id, subject_id = EXCLUDED.subject_id;

-- Horario de bachillerato: cada materia rota por bloque y el docente que le toca -------
-- (1 o 2 de esa materia, segun el curso) la dicta en varios cursos.
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT g.grade, d.weekday, b.block_no,
       TIME '06:30' + (b.block_no - 1) * INTERVAL '55 minutes',
       TIME '07:20' + (b.block_no - 1) * INTERVAL '55 minutes',
       (SELECT id FROM subjects WHERE name = sub.name),
       (SELECT id FROM users
         WHERE email = 'profe.sec.' || sub.slug || '.' ||
                       (1 + (abs(hashtext(g.grade || sub.slug)) % 2)) || '@ggm.edu.co'),
       CASE
         WHEN sub.slug = 'cie' THEN 'Laboratorio'
         WHEN sub.slug = 'inf' THEN 'Sala de sistemas'
         WHEN sub.slug IN ('edf', 'art') THEN 'Aula multiple'
         WHEN (b.block_no * d.weekday + abs(hashtext(g.grade))) % 9 = 0 THEN NULL
         ELSE 'Aula ' || (100 + ((b.block_no + d.weekday) % 8))
       END
  FROM (SELECT n::text || letra AS grade
          FROM generate_series(6, 11) AS n
         CROSS JOIN unnest(ARRAY['A', 'B']) AS letra) g
 CROSS JOIN generate_series(1, 5) AS d(weekday)
 CROSS JOIN generate_series(1, 6) AS b(block_no)
 CROSS JOIN LATERAL (
        SELECT *
          FROM (VALUES (0, 'Matematicas', 'mat'), (1, 'Espanol', 'esp'), (2, 'Ciencias', 'cie'),
                       (3, 'Sociales', 'soc'), (4, 'Ingles', 'ing'), (5, 'Informatica', 'inf'),
                       (6, 'Educacion Fisica', 'edf'), (7, 'Artes', 'art')) AS s(ord, name, slug)
         WHERE s.ord = (b.block_no + d.weekday + abs(hashtext(g.grade))) % 8
      ) sub
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET room = EXCLUDED.room, teacher_id = EXCLUDED.teacher_id, subject_id = EXCLUDED.subject_id;

-- Asistencia del mes en curso ---------------------------------------------------------
-- ~90% presentes. Ademas: bloques enteros sin reportar (docente que no alcanzo a
-- pasar lista, ~4% de los bloques de cada dia -mismo para todo el curso-) y
-- estudiantes con inasistencia de dia completo (~3% estudiante-dia: falta a TODOS
-- los bloques de ese dia, salvo los que ya estan sin reportar).
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        recorded_by, recorded_at)
SELECT gen_random_uuid(), s.id, b.id, c.calendar_date,
       CASE
         WHEN abs(hashtext(s.id::text || c.calendar_date::text)) % 100 < 3 THEN 'F'
         WHEN random() < 0.90 THEN 'P'
         WHEN random() < 0.55 THEN 'T'
         WHEN random() < 0.75 THEN 'F'
         ELSE 'E'
       END,
       b.teacher_id,
       c.calendar_date + TIME '07:00'
  FROM students s
  JOIN schedule_blocks b ON b.grade = s.grade
  JOIN school_calendar c ON c.day_type = 'LECTIVO'
                        AND EXTRACT(ISODOW FROM c.calendar_date) = b.weekday
                        AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
                        AND c.calendar_date <= CURRENT_DATE
 WHERE s.grade ~ '^([0-9]|1[01])[AB]$'
   AND abs(hashtext(b.id::text || c.calendar_date::text)) % 100 >= 4
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Acudientes: uno por estudiante nuevo -------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente.' || s.document_id || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente de ' || s.first_name || ' ' || s.last_name,
       'ACUDIENTE', TRUE, FALSE
  FROM students s WHERE s.grade ~ '^([0-9]|1[01])[AB]$'
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
  FROM students s
  JOIN users u ON u.email = 'acudiente.' || s.document_id || '@correo.com'
 WHERE s.grade ~ '^([0-9]|1[01])[AB]$'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

ANALYZE;

-- Comprobacion: estos numeros son el entregable.
SELECT 'cursos' AS metrica, count(*) FROM (SELECT DISTINCT grade FROM students WHERE grade ~ '^([0-9]|1[01])[AB]$') x
UNION ALL SELECT 'estudiantes',           count(*) FROM students WHERE grade ~ '^([0-9]|1[01])[AB]$'
UNION ALL SELECT 'docentes',              count(*) FROM users WHERE email LIKE 'profe.%'
UNION ALL SELECT 'bloques',               count(*) FROM schedule_blocks WHERE grade ~ '^([0-9]|1[01])[AB]$'
UNION ALL SELECT 'bloques sin aula',      count(*) FROM schedule_blocks WHERE grade ~ '^([0-9]|1[01])[AB]$' AND room IS NULL
UNION ALL SELECT 'asistencias',           count(*) FROM attendance a JOIN students s ON s.id = a.student_id WHERE s.grade ~ '^([0-9]|1[01])[AB]$'
UNION ALL SELECT 'ausencias dia completo', count(DISTINCT (a.student_id, a.class_date))
  FROM attendance a JOIN students s ON s.id = a.student_id
 WHERE s.grade ~ '^([0-9]|1[01])[AB]$' AND a.status = 'F'
   AND NOT EXISTS (SELECT 1 FROM attendance a2 JOIN schedule_blocks b2 ON b2.id = a2.schedule_block_id
                     WHERE a2.student_id = a.student_id AND a2.class_date = a.class_date AND a2.status <> 'F')
UNION ALL SELECT 'acudientes', count(*) FROM users u
  JOIN guardianships gu ON gu.guardian_id = u.id
  JOIN students s ON s.id = gu.student_id AND s.grade ~ '^([0-9]|1[01])[AB]$';
