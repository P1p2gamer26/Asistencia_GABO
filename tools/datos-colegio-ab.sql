-- Colegio completo A y B: cursos 0A,0B .. 11A,11B (24 cursos), 50 estudiantes por
-- curso = 1200, con docentes, horario de lunes a viernes, acudientes y la asistencia
-- del mes en curso. Pensado para pegar en el SQL Editor de Supabase y darle Run.
-- Es idempotente: se puede repetir sin duplicar nada.

-- 0. Fuera datos de demostracion viejos (cursos 6xx sin letra, si existieran) ------
DELETE FROM attendance a USING students s
      WHERE s.id = a.student_id AND s.grade LIKE '6%' AND s.grade !~ '[AB]$';
DELETE FROM entry_log e USING students s
      WHERE s.id = e.student_id AND s.grade LIKE '6%' AND s.grade !~ '[AB]$';
DELETE FROM schedule_blocks WHERE grade LIKE '6%' AND grade !~ '[AB]$';
DELETE FROM students WHERE grade LIKE '6%' AND grade !~ '[AB]$';
DELETE FROM users WHERE email LIKE 'profe%';

-- 1. Materias --------------------------------------------------------------------
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ingles'), ('Ciencias Naturales'), ('Ciencias Sociales'),
  ('Informatica'), ('Educacion Fisica'), ('Artistica'), ('Etica'), ('Religion'),
  ('Fisica'), ('Quimica')
ON CONFLICT (name) DO NOTHING;

-- 2. Veinticuatro docentes: dos por materia, para que en una misma franja los 24
--    cursos tengan 24 docentes distintos (nadie dicta dos cursos a la vez). --------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT d.email, '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       d.nombre, 'DOCENTE', TRUE, FALSE
FROM (VALUES
 ('docente01@ggm.edu.co','Marta Restrepo'),   ('docente02@ggm.edu.co','Jorge Gutierrez'),
 ('docente03@ggm.edu.co','Lucia Castano'),    ('docente04@ggm.edu.co','Andres Ramirez'),
 ('docente05@ggm.edu.co','Carmen Velasquez'), ('docente06@ggm.edu.co','Diego Ospina'),
 ('docente07@ggm.edu.co','Paula Montoya'),    ('docente08@ggm.edu.co','Ruben Zapata'),
 ('docente09@ggm.edu.co','Nubia Quintero'),   ('docente10@ggm.edu.co','Hernan Cardona'),
 ('docente11@ggm.edu.co','Sandra Arango'),    ('docente12@ggm.edu.co','Oscar Mesa'),
 ('docente13@ggm.edu.co','Beatriz Naranjo'),  ('docente14@ggm.edu.co','Gustavo Pineda'),
 ('docente15@ggm.edu.co','Liliana Rojas'),    ('docente16@ggm.edu.co','Fabian Duarte'),
 ('docente17@ggm.edu.co','Claudia Vargas'),   ('docente18@ggm.edu.co','Mario Salazar'),
 ('docente19@ggm.edu.co','Yolanda Prada'),    ('docente20@ggm.edu.co','Camilo Rios'),
 ('docente21@ggm.edu.co','Adriana Leon'),     ('docente22@ggm.edu.co','Julian Cortes'),
 ('docente23@ggm.edu.co','Monica Pena'),      ('docente24@ggm.edu.co','Raul Guerrero')
) AS d(email, nombre)
ON CONFLICT (email) DO NOTHING;

-- Par idx 0..23 -> (materia, docente). Docente k dicta la materia ((k-1) mod 12)+1.
CREATE TEMP TABLE semilla_par AS
WITH m AS (SELECT id, row_number() OVER (ORDER BY id) AS pos FROM subjects),
     p AS (SELECT id, row_number() OVER (ORDER BY id) AS pos FROM users
            WHERE email ~ '^docente[0-9]{2}@ggm[.]edu[.]co$')
SELECT p.pos - 1 AS idx, m.id AS subject_id, p.id AS teacher_id
FROM p JOIN m ON m.pos = ((p.pos - 1) % 12) + 1;

-- 3. Cursos 0A,0B .. 11A,11B (idx 0..23) -----------------------------------------
CREATE TEMP TABLE semilla_cursos AS
SELECT g.n * 2 + s.k AS idx, g.n || s.letra AS grade
FROM generate_series(0, 11) AS g(n)
CROSS JOIN (VALUES (0,'A'), (1,'B')) AS s(k, letra);

-- Nombres: 4 componentes con desfases distintos y un termino por "grupo" (1..25 vs
-- 26..50) para que ningun nombre completo se repita dentro de un curso de 50.
CREATE TEMP TABLE semilla_nombres AS
SELECT n,
       ((n - 1) % 25) + 1                    AS i,
       (n - 1) / 25                          AS g
FROM generate_series(1, 50) AS n;

CREATE TEMP TABLE arr_nombres AS SELECT
  ARRAY['Camila','Santiago','Valentina','Mateo','Isabella','Sebastian','Salome',
        'Emiliano','Antonia','Tomas','Mariana','Nicolas','Luciana','Samuel',
        'Gabriela','Martin','Juliana','Alejandro','Sara','Simon','Manuela',
        'Andres','Catalina','Esteban','Paulina'] AS firsts,
  ARRAY['Andrea','Jose','Lucia','David','Sofia','Alejandro','Marcela','Nicolas',
        'Daniela','Felipe','Isabel','Mauricio','Elena','Javier','Carolina',
        'Ignacio','Fernanda','Ramiro','Beatriz','Julian','Adriana','Emilio',
        'Patricia','Tomas','Ximena'] AS middles,
  ARRAY['Gonzalez','Ramirez','Herrera','Castro','Molina','Reyes','Acosta',
        'Peralta','Suarez','Mendoza','Cardenas','Villamil','Beltran','Osorio',
        'Rincon','Camargo','Pineda','Sanabria','Trujillo','Cifuentes','Bermudez',
        'Chaparro','Galvis','Nino','Forero'] AS lasts,
  ARRAY['Lopez','Torres','Rivas','Guzman','Pardo','Cordoba','Silva','Naranjo',
        'Bonilla','Escobar','Prieto','Vera','Ayala','Roa','Cuellar','Barrera',
        'Solano','Aguirre','Ballesteros','Contreras','Merchan','Espinosa',
        'Mahecha','Riascos','Valbuena'] AS seconds;

INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((1200000000 + c.idx * 100 + nm.n)::text, 10, '0'),
       a.firsts [nm.i],
       a.middles[((nm.i - 1 + 7 ) % 25) + 1],
       a.lasts  [((nm.i - 1 + 13) % 25) + 1],
       a.seconds[((nm.i - 1 + 3 + 5 * nm.g) % 25) + 1],
       c.grade, TRUE
FROM semilla_cursos c
CROSS JOIN semilla_nombres nm
CROSS JOIN arr_nombres a
ON CONFLICT (document_id) DO UPDATE
  SET first_name = EXCLUDED.first_name, middle_name = EXCLUDED.middle_name,
      last_name = EXCLUDED.last_name, second_surname = EXCLUDED.second_surname;

-- 4. Horario: 24 cursos x 5 dias x 6 bloques de 60 min ---------------------------
-- Jornada 7:00-13:30 con media hora de descanso entre el bloque 3 y el 4. El par
-- (materia,docente) rota de forma que en cada franja los 24 cursos no repiten docente.
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT c.grade, d.weekday, b.block_no,
       TIME '07:00' + (b.block_no - 1) * INTERVAL '60 minutes'
                    + CASE WHEN b.block_no > 3 THEN INTERVAL '30 minutes' ELSE INTERVAL '0' END,
       TIME '08:00' + (b.block_no - 1) * INTERVAL '60 minutes'
                    + CASE WHEN b.block_no > 3 THEN INTERVAL '30 minutes' ELSE INTERVAL '0' END,
       p.subject_id, p.teacher_id,
       'Aula ' || (100 + c.idx)
FROM semilla_cursos c
CROSS JOIN generate_series(1, 5) AS d(weekday)
CROSS JOIN generate_series(1, 6) AS b(block_no)
JOIN semilla_par p ON p.idx = (c.idx + (d.weekday - 1) * 6 + (b.block_no - 1)) % 24
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
      room = EXCLUDED.room,
      start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

-- 5. Asistencia del mes en curso --------------------------------------------------
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        recorded_by, recorded_at)
SELECT gen_random_uuid(), s.id, b.id, c.calendar_date,
       CASE WHEN random() < 0.03 THEN 'T' ELSE 'P' END,
       b.teacher_id,
       c.calendar_date + b.start_time + INTERVAL '10 minutes'
FROM students s
JOIN schedule_blocks b ON b.grade = s.grade
JOIN school_calendar c ON c.day_type = 'LECTIVO'
                      AND EXTRACT(ISODOW FROM c.calendar_date) = b.weekday
                      AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
                      AND c.calendar_date <= CURRENT_DATE
WHERE s.grade ~ '^[0-9]{1,2}[AB]$'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Ausencias por dia completo: ~1% de los pares estudiante-dia.
UPDATE attendance a
   SET status = 'F', comment = m.motivo
  FROM (
        SELECT student_id, class_date,
               (ARRAY['Cita medica','Incapacidad','Calamidad familiar',
                      'Viaje familiar','Excusa firmada por el acudiente'])[1 + (random() * 4)::int] AS motivo
          FROM (SELECT DISTINCT student_id, class_date FROM attendance) p
         WHERE random() < 0.01
       ) m
 WHERE a.student_id = m.student_id AND a.class_date = m.class_date;

-- Evasiones sueltas de un bloque: muy pocas.
UPDATE attendance
   SET status = 'E',
       comment = (ARRAY['Salio del salon y no regreso',
                        'Se quedo en la cancha despues del descanso',
                        'Se fue con companeros de otro curso',
                        'No entro a la clase, estaba en el pasillo'])[1 + (random() * 3)::int]
 WHERE id IN (SELECT id FROM attendance WHERE status = 'P'
               ORDER BY random() LIMIT 120);

-- 6. Un acudiente por estudiante --------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente.' || s.document_id || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente de ' || s.first_name || ' ' || s.last_name,
       'ACUDIENTE', TRUE, FALSE
FROM students s WHERE s.grade ~ '^[0-9]{1,2}[AB]$'
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
FROM students s
JOIN users u ON u.email = 'acudiente.' || s.document_id || '@correo.com'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

DROP TABLE semilla_par, semilla_cursos, semilla_nombres, arr_nombres;
ANALYZE;

SELECT 'cursos' AS tabla, count(DISTINCT grade)::text AS n FROM students WHERE grade ~ '^[0-9]{1,2}[AB]$'
UNION ALL SELECT 'estudiantes', count(*)::text FROM students WHERE grade ~ '^[0-9]{1,2}[AB]$'
UNION ALL SELECT 'docentes',    count(*)::text FROM users WHERE email ~ '^docente[0-9]{2}@'
UNION ALL SELECT 'bloques',     count(*)::text FROM schedule_blocks
UNION ALL SELECT 'asistencias', count(*)::text FROM attendance
UNION ALL SELECT 'presentes',   count(*)::text FROM attendance WHERE status = 'P'
UNION ALL SELECT 'tarde',       count(*)::text FROM attendance WHERE status = 'T'
UNION ALL SELECT 'ausencias',   count(*)::text FROM attendance WHERE status = 'F'
UNION ALL SELECT 'evasiones',   count(*)::text FROM attendance WHERE status = 'E'
UNION ALL SELECT 'acudientes',  count(*)::text FROM users WHERE role = 'ACUDIENTE';
