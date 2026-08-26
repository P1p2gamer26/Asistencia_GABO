-- Colegio completo: grados 0 a 11 (cursos 0A..11A), con estudiantes, docentes,
-- horario de lunes a viernes, acudientes y la asistencia del mes en curso.
--
--   psql -U postgres -d asistencia -f tools/datos-colegio.sql
--
-- Reemplaza a tools/datos-locales.sql + tools/datos-realistas.sql, que sembraban
-- solo los cursos 601..607. BORRA esos datos de demostracion (estudiantes con
-- grade '6xx', sus docentes 'profe%' y todo lo que cuelgue de ellos). Los usuarios
-- reales del colegio (admin, coordinacion, docentes con correo propio) no se tocan.
--
-- Es idempotente: se puede repetir sin duplicar nada.

\timing on

-- 0. Fuera los datos de demostracion viejos --------------------------------------
DELETE FROM attendance a USING students s
      WHERE s.id = a.student_id AND s.grade LIKE '6%';
DELETE FROM entry_log e USING students s
      WHERE s.id = e.student_id AND s.grade LIKE '6%';
DELETE FROM schedule_blocks WHERE grade LIKE '6%';
DELETE FROM students WHERE grade LIKE '6%';        -- guardianships cae por CASCADE
DELETE FROM users WHERE email LIKE 'profe%' OR email LIKE 'acudiente.%';

-- 1. Materias --------------------------------------------------------------------
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ingles'), ('Ciencias Naturales'), ('Ciencias Sociales'),
  ('Informatica'), ('Educacion Fisica'), ('Artistica'), ('Etica'), ('Religion'),
  ('Fisica'), ('Quimica')
ON CONFLICT (name) DO NOTHING;

-- 2. Doce docentes, uno por materia ----------------------------------------------
-- Doce y no menos: doce cursos comparten cada franja horaria, asi que con menos
-- docentes alguno quedaria dictando dos cursos a la misma hora.
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT d.email, '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       d.nombre, 'DOCENTE', TRUE, FALSE
FROM (VALUES
 ('docente01@ggm.edu.co','Marta Restrepo'),   ('docente02@ggm.edu.co','Jorge Gutierrez'),
 ('docente03@ggm.edu.co','Lucia Castano'),    ('docente04@ggm.edu.co','Andres Ramirez'),
 ('docente05@ggm.edu.co','Carmen Velasquez'), ('docente06@ggm.edu.co','Diego Ospina'),
 ('docente07@ggm.edu.co','Paula Montoya'),    ('docente08@ggm.edu.co','Ruben Zapata'),
 ('docente09@ggm.edu.co','Nubia Quintero'),   ('docente10@ggm.edu.co','Hernan Cardona'),
 ('docente11@ggm.edu.co','Sandra Arango'),    ('docente12@ggm.edu.co','Oscar Mesa')
) AS d(email, nombre)
ON CONFLICT (email) DO NOTHING;

-- Materia i <-> docente i, por posicion, para que el horario no repita profesor.
CREATE TEMP TABLE semilla_par AS
WITH m AS (SELECT id, row_number() OVER (ORDER BY id) AS pos FROM subjects),
     p AS (SELECT id, row_number() OVER (ORDER BY id) AS pos FROM users
            WHERE email LIKE 'docente__@ggm.edu.co')
SELECT m.pos - 1 AS idx, m.id AS subject_id, p.id AS teacher_id
FROM m JOIN p ON p.pos = m.pos;

-- 3. Cursos 0A..11A, 25 estudiantes cada uno -------------------------------------
CREATE TEMP TABLE semilla_cursos AS
SELECT n AS idx, n || 'A' AS grade FROM generate_series(0, 11) AS n;

-- Los nombres se toman por el indice del estudiante dentro del curso (1..25) sobre
-- arreglos de 25: asi no se repite un nombre completo dentro del mismo curso, que
-- hacia parecer que las consultas devolvian filas duplicadas.
CREATE TEMP TABLE semilla_nombres AS
SELECT n AS i,
       (ARRAY['Camila','Santiago','Valentina','Mateo','Isabella','Sebastian','Salome',
              'Emiliano','Antonia','Tomas','Mariana','Nicolas','Luciana','Samuel',
              'Gabriela','Martin','Juliana','Alejandro','Sara','Simon','Manuela',
              'Andres','Catalina','Esteban','Paulina'])[n] AS nombre,
       (ARRAY['Andrea','Jose','Lucia','David','Sofia','Alejandro','Marcela','Nicolas',
              'Daniela','Felipe','Isabel','Mauricio','Elena','Javier','Carolina',
              'Ignacio','Fernanda','Ramiro','Beatriz','Julian','Adriana','Emilio',
              'Patricia','Tomas','Ximena'])[n] AS segundo,
       (ARRAY['Gonzalez','Ramirez','Herrera','Castro','Molina','Reyes','Acosta',
              'Peralta','Suarez','Mendoza','Cardenas','Villamil','Beltran','Osorio',
              'Rincon','Camargo','Pineda','Sanabria','Trujillo','Cifuentes','Bermudez',
              'Chaparro','Galvis','Nino','Forero'])[n] AS apellido,
       (ARRAY['Lopez','Torres','Rivas','Guzman','Pardo','Cordoba','Silva','Naranjo',
              'Bonilla','Escobar','Prieto','Vera','Ayala','Roa','Cuellar','Barrera',
              'Solano','Aguirre','Ballesteros','Contreras','Merchan','Espinosa',
              'Mahecha','Riascos','Valbuena'])[n] AS segundo_apellido
FROM generate_series(1, 25) AS n;

INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((1200000000 + c.idx * 100 + n.i)::text, 10, '0'),
       n.nombre, n.segundo, n.apellido, n.segundo_apellido, c.grade, TRUE
FROM semilla_cursos c
JOIN semilla_nombres n ON TRUE
ON CONFLICT (document_id) DO UPDATE
  SET first_name = EXCLUDED.first_name, middle_name = EXCLUDED.middle_name,
      last_name = EXCLUDED.last_name, second_surname = EXCLUDED.second_surname;

-- 4. Horario: 12 cursos x 5 dias x 6 bloques de 60 minutos -----------------------
-- La jornada es de 7:00 a 1:30, con media hora de descanso entre el bloque 3 y el 4.
-- La materia rota con el curso ademas del dia y del bloque: en una misma franja los
-- doce cursos tienen doce materias distintas, luego doce docentes distintos.
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
JOIN semilla_par p ON p.idx = (c.idx + (d.weekday - 1) * 6 + (b.block_no - 1)) % 12
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET subject_id = EXCLUDED.subject_id, teacher_id = EXCLUDED.teacher_id,
      room = EXCLUDED.room,
      start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time;

-- 5. Asistencia del mes en curso --------------------------------------------------
-- Un colegio normal: casi todos presentes, alguna llegada tarde, pocas ausencias y
-- muy pocas evasiones. recorded_by es el docente del bloque, que es quien de verdad
-- pasa la lista: de ahi sale el "quien tomo la asistencia" que se ve en pantalla.
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
WHERE s.grade ~ '^[0-9]{1,2}A$'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Las ausencias van por dia completo, no por bloque suelto: el que no vino falta a
-- todas sus clases. Un 1 % de los pares estudiante-dia, con el motivo del acudiente.
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

-- Y las evasiones son de un bloque suelto: el estudiante entro al colegio y se salio
-- de esa clase. Muy pocas, siempre con el motivo que anoto el docente.
UPDATE attendance
   SET status = 'E',
       comment = (ARRAY['Salio del salon y no regreso',
                        'Se quedo en la cancha despues del descanso',
                        'Se fue con companeros de otro curso',
                        'No entro a la clase, estaba en el pasillo'])[1 + (random() * 3)::int]
 WHERE id IN (SELECT id FROM attendance WHERE status = 'P'
               ORDER BY random() LIMIT 40);

-- 6. Un acudiente por estudiante --------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente.' || s.document_id || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente de ' || s.first_name || ' ' || s.last_name,
       'ACUDIENTE', TRUE, FALSE
FROM students s WHERE s.grade ~ '^[0-9]{1,2}A$'
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
FROM students s
JOIN users u ON u.email = 'acudiente.' || s.document_id || '@correo.com'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

DROP TABLE semilla_par, semilla_cursos, semilla_nombres;
ANALYZE;

SELECT 'cursos' AS tabla, count(DISTINCT grade) FROM students WHERE grade ~ '^[0-9]{1,2}A$'
UNION ALL SELECT 'estudiantes', count(*) FROM students WHERE grade ~ '^[0-9]{1,2}A$'
UNION ALL SELECT 'docentes',    count(*) FROM users WHERE email LIKE 'docente__@ggm.edu.co'
UNION ALL SELECT 'bloques',     count(*) FROM schedule_blocks
UNION ALL SELECT 'asistencias', count(*) FROM attendance
UNION ALL SELECT 'presentes',   count(*) FROM attendance WHERE status = 'P'
UNION ALL SELECT 'tarde',       count(*) FROM attendance WHERE status = 'T'
UNION ALL SELECT 'ausencias',   count(*) FROM attendance WHERE status = 'F'
UNION ALL SELECT 'evasiones',   count(*) FROM attendance WHERE status = 'E'
UNION ALL SELECT 'acudientes',  count(*) FROM users WHERE role = 'ACUDIENTE';
