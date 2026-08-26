-- Colegio completo: grados 0 a 11 (cursos 0A..11A), con estudiantes, docentes,
-- horario de lunes a viernes, acudientes y la asistencia del mes en curso.
--
--   psql -U postgres -d asistencia -f tools/datos-colegio.sql
--
-- Es la unica siembra de demostracion del proyecto: reemplaza a datos-locales.sql,
-- datos-realistas.sql, datos-casos-limite.sql y datos-estructura-real.sql, que iban
-- contra los cursos 601..607. BORRA esos datos viejos si siguen en la base (cursos de
-- tres digitos y sus docentes 'profe%'). Los usuarios reales del colegio (admin,
-- coordinacion, docentes con correo propio) no se tocan.
--
-- Es idempotente: se puede repetir sin duplicar nada.

\timing on

-- 0. Solo la base LOCAL ----------------------------------------------------------
-- Este script BORRA datos. La base de produccion vive en Supabase y alli se llama
-- "postgres"; la local se llama "asistencia". Si alguien pega por error la cadena de
-- Supabase, esto para en seco antes de tocar nada, en vez de vaciarle el colegio.
DO $$
BEGIN
  IF current_database() <> 'asistencia' THEN
    RAISE EXCEPTION
      'Semilla de DEMOSTRACION detenida: la base actual es "%", no "asistencia". '
      'Este script borra datos y solo debe correr en la base local.', current_database();
  END IF;
END $$;

-- 1. Fuera los datos de demostracion viejos --------------------------------------
-- Solo los cursos de tres digitos (601..607) de la siembra vieja. El patron era
-- LIKE '6%', que tambien cogia el curso '6A' de ESTA siembra: cada ejecucion borraba
-- y recreaba a sus 25 estudiantes con id nuevo, y la asistencia salia distinta.
DELETE FROM attendance a USING students s
      WHERE s.id = a.student_id AND s.grade ~ '^[0-9]{3}$';
DELETE FROM entry_log e USING students s
      WHERE s.id = e.student_id AND s.grade ~ '^[0-9]{3}$';
DELETE FROM schedule_blocks WHERE grade ~ '^[0-9]{3}$';
DELETE FROM students WHERE grade ~ '^[0-9]{3}$';   -- guardianships cae por CASCADE
DELETE FROM users WHERE email LIKE 'profe%';
-- Los acudientes se recrean por documento del estudiante: los sobrantes son de
-- estudiantes que ya no existen.
DELETE FROM users u WHERE u.email LIKE 'acudiente.%'
  AND NOT EXISTS (SELECT 1 FROM students s
                   WHERE 'acudiente.' || s.document_id || '@correo.com' = u.email);

-- 2. Materias --------------------------------------------------------------------
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ingles'), ('Ciencias Naturales'), ('Ciencias Sociales'),
  ('Informatica'), ('Educacion Fisica'), ('Artistica'), ('Etica'), ('Religion'),
  ('Fisica'), ('Quimica')
ON CONFLICT (name) DO NOTHING;

-- 3. Doce docentes, uno por materia ----------------------------------------------
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

-- 4. Cursos 0A..11A, 25 estudiantes cada uno -------------------------------------
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

-- 5. Horario: 12 cursos x 5 dias x 6 bloques de 60 minutos -----------------------
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

-- 6. Asistencia del mes en curso --------------------------------------------------
-- Un colegio normal: casi todos presentes, alguna llegada tarde, pocas ausencias y
-- muy pocas evasiones. recorded_by es el docente del bloque, que es quien de verdad
-- pasa la lista: de ahi sale el "quien tomo la asistencia" que se ve en pantalla.
--
-- El estado sale de hashtext y no de random(): asi es el mismo en cada ejecucion.
-- Con random() en un UPDATE posterior, cada pasada del script anadia otro 1 % de
-- faltas encima de las anteriores y el colegio se degradaba solo.
--
-- La falta se decide por estudiante-DIA, asi que quien no vino falta a sus seis
-- clases, no a una suelta. La evasion y la tardanza son por bloque.
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        comment, recorded_by, recorded_at)
SELECT gen_random_uuid(), s.id, b.id, c.calendar_date,
       CASE WHEN h.dia % 100 = 0 THEN 'F'
            WHEN h.fila % 1000 < 4 THEN 'E'
            WHEN h.fila % 100 < 3 THEN 'T'
            ELSE 'P' END,
       CASE WHEN h.dia % 100 = 0
              THEN (ARRAY['Cita medica','Incapacidad','Calamidad familiar',
                          'Viaje familiar','Excusa firmada por el acudiente'])[1 + h.dia % 5]
            WHEN h.fila % 1000 < 4
              THEN (ARRAY['Salio del salon y no regreso',
                          'Se quedo en la cancha despues del descanso',
                          'Se fue con companeros de otro curso',
                          'No entro a la clase, estaba en el pasillo'])[1 + h.fila % 4]
            ELSE NULL END,
       b.teacher_id,
       c.calendar_date + b.start_time + INTERVAL '10 minutes'
FROM students s
JOIN schedule_blocks b ON b.grade = s.grade
JOIN school_calendar c ON c.day_type = 'LECTIVO'
                      AND EXTRACT(ISODOW FROM c.calendar_date) = b.weekday
                      AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
                      AND c.calendar_date <= CURRENT_DATE
CROSS JOIN LATERAL (
    SELECT abs(hashtext(s.id::text || ':' || c.calendar_date::text)) AS dia,
           abs(hashtext(s.id::text || ':' || b.id::text || ':' || c.calendar_date::text)) AS fila
) h
WHERE s.grade ~ '^[0-9]{1,2}A$'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- 7. Un acudiente por estudiante --------------------------------------------------
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

-- 8. Casos que la siembra normal no produce ---------------------------------------
-- Un dato que nunca ocurre es una rama de codigo que nunca se prueba. Sin esto, en la
-- base local habia CERO bloques sin reportar, CERO estudiantes retirados y CERO
-- cursos sin registros, asi que varias pantallas no se podian ver funcionando.
-- Vienen de tools/datos-casos-limite.sql, que iba contra los cursos 601..607.

-- 11A no tiene NINGUN registro: es lo que distingue "curso que nadie marco" de
-- "curso con 100 % de asistencia", dos cosas que en pantalla no pueden verse igual.
DELETE FROM attendance a USING students s
      WHERE s.id = a.student_id AND s.grade = '11A';

-- Los bloques del ultimo dia lectivo de 10A quedan sin reportar: asi el inicio y las
-- consultas tienen pendientes de verdad que mostrar.
DELETE FROM attendance a
 USING students s, schedule_blocks b
      WHERE s.id = a.student_id AND b.id = a.schedule_block_id
        AND s.grade = '10A'
        AND a.class_date = (SELECT max(class_date) FROM attendance);

-- Un estudiante retirado: sigue en la base con su historial, pero no aparece en las
-- listas de clase. Sin uno, la diferencia entre active y borrado no se ve.
UPDATE students SET active = FALSE
 WHERE document_id = (SELECT min(document_id) FROM students WHERE grade = '9A');

-- Una jornada institucional (sin clase) en medio del mes, para que el calendario y
-- el aviso de "hoy no hay clase" tengan un caso real que mostrar.
UPDATE school_calendar SET day_type = 'INSTITUCIONAL', description = 'Jornada pedagogica'
 WHERE calendar_date = (SELECT max(class_date) - 7 FROM attendance)
   AND day_type = 'LECTIVO';

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
UNION ALL SELECT 'acudientes',  count(*) FROM users WHERE role = 'ACUDIENTE'
UNION ALL SELECT 'retirados',   count(*) FROM students WHERE NOT active
UNION ALL SELECT 'sin registros (cursos)',
                 count(*) FROM (SELECT s.grade FROM students s
                                 WHERE s.grade ~ '^[0-9]{1,2}A$'
                                 GROUP BY s.grade
                                HAVING count(*) FILTER (WHERE EXISTS
                                       (SELECT 1 FROM attendance a WHERE a.student_id = s.id)) = 0) x;
