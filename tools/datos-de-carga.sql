-- Genera un volumen realista para medir el sistema con los datos del colegio:
-- 1200 estudiantes en 30 cursos, 80 docentes, horario completo y un semestre de
-- asistencia. Sirve para comprobar si las cifras del informe se sostienen, que hasta
-- ahora estaban calculadas pero no medidas.
--
--   psql -U postgres -d asistencia_carga -f tools/datos-de-carga.sql

\timing on

-- 80 docentes -----------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'docente' || n || '@ggm.edu.co',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Docente Numero ' || n, 'DOCENTE', TRUE, FALSE
FROM generate_series(1, 80) AS n
ON CONFLICT (email) DO NOTHING;

-- 6 materias ------------------------------------------------------------------
INSERT INTO subjects (name)
VALUES ('Matematicas'), ('Espanol'), ('Ciencias'), ('Sociales'), ('Ingles'), ('Informatica')
ON CONFLICT (name) DO NOTHING;

-- 1200 estudiantes en 30 cursos (grados 601 a 1105, 40 por curso) --------------
INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname, grade, active)
SELECT lpad((1000000000 + n)::text, 10, '0'),
       'NOMBRE' || n, 'SEGUNDO' || n, 'APELLIDO' || n, 'SEGUNDOAP' || n,
       ((600 + ((n - 1) / 40) % 5 * 100) + 1 + ((n - 1) / 200) % 6)::text,
       TRUE
FROM generate_series(1, 1200) AS n
ON CONFLICT (document_id) DO NOTHING;

-- Horario: cada curso, 5 dias, 6 bloques --------------------------------------
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
SELECT g.grade,
       d.weekday,
       b.block_no,
       (TIME '06:30' + (b.block_no - 1) * INTERVAL '50 minutes'),
       (TIME '07:20' + (b.block_no - 1) * INTERVAL '50 minutes'),
       (SELECT id FROM subjects ORDER BY id LIMIT 1 OFFSET (b.block_no - 1) % 6),
       (SELECT id FROM users WHERE role = 'DOCENTE' AND email LIKE 'docente%'
         ORDER BY id LIMIT 1 OFFSET (abs(hashtext(g.grade)) + b.block_no) % 80)
FROM (SELECT DISTINCT grade FROM students) g
CROSS JOIN generate_series(1, 5) AS d(weekday)
CROSS JOIN generate_series(1, 6) AS b(block_no)
ON CONFLICT (grade, weekday, block_no) DO NOTHING;

-- Asistencia: un semestre completo --------------------------------------------
-- Distribucion parecida a la real: ~92 % presentes, 4 % tarde, 3 % falta, 1 % evasion.
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        recorded_by, recorded_at)
SELECT gen_random_uuid(),
       s.id,
       b.id,
       c.calendar_date,
       CASE WHEN random() < 0.92 THEN 'P'
            WHEN random() < 0.50 THEN 'T'
            WHEN random() < 0.75 THEN 'F'
            ELSE 'E' END,
       b.teacher_id,
       c.calendar_date + TIME '07:00'
FROM students s
JOIN schedule_blocks b ON b.grade = s.grade
JOIN school_calendar c ON c.day_type = 'LECTIVO'
                      AND EXTRACT(ISODOW FROM c.calendar_date) = b.weekday
                      AND c.calendar_date BETWEEN DATE '2026-02-02' AND DATE '2026-06-12'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Acudientes: uno por estudiante ----------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente' || n || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente Numero ' || n, 'ACUDIENTE', TRUE, FALSE
FROM generate_series(1, 1200) AS n
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
FROM students s
JOIN users u ON u.email = 'acudiente' || (s.id - (SELECT min(id) FROM students) + 1) || '@correo.com'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

-- Estadisticas al dia para que el planificador elija bien ----------------------
ANALYZE;

-- Resumen ----------------------------------------------------------------------
SELECT 'estudiantes' AS tabla, count(*) FROM students
UNION ALL SELECT 'docentes',     count(*) FROM users WHERE role = 'DOCENTE'
UNION ALL SELECT 'acudientes',   count(*) FROM users WHERE role = 'ACUDIENTE'
UNION ALL SELECT 'bloques',      count(*) FROM schedule_blocks
UNION ALL SELECT 'asistencias',  count(*) FROM attendance;

SELECT pg_size_pretty(pg_database_size(current_database())) AS tamano_total,
       pg_size_pretty(pg_total_relation_size('attendance')) AS tamano_asistencia;
