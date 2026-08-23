-- Datos de desarrollo: un colegio pequeno pero completo, para poder ver las pantallas.
-- Para medir rendimiento esta tools/datos-de-carga.sql, que siembra 620.000 registros.
--
--   psql -U postgres -d asistencia -f tools/datos-locales.sql
--
-- Es idempotente: se puede volver a ejecutar sin duplicar nada.
-- No borra nada existente (sin TRUNCATE ni DELETE): conserva los usuarios y datos reales
-- que ya haya en la base.

\timing on

-- 12 docentes -----------------------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'profe' || n || '@ggm.edu.co',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       (ARRAY['Ana','Luis','Marta','Carlos','Sofia','Jorge',
              'Elena','Miguel','Paula','Andres','Clara','Diego'])[n]
       || ' ' ||
       (ARRAY['Rojas','Medina','Cardenas','Pineda','Vargas','Salazar',
              'Duarte','Ochoa','Beltran','Quintero','Nieto','Moreno'])[n],
       'DOCENTE', TRUE, FALSE
FROM generate_series(1, 12) AS n
ON CONFLICT (email) DO NOTHING;

-- 6 materias ------------------------------------------------------------------
INSERT INTO subjects (name) VALUES
  ('Matematicas'), ('Espanol'), ('Ciencias'), ('Sociales'), ('Ingles'), ('Informatica')
ON CONFLICT (name) DO NOTHING;

-- 180 estudiantes en 6 cursos (601 a 606, 30 por curso) ------------------------
INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname,
                      grade, active)
SELECT lpad((1100000000 + n)::text, 10, '0'),
       (ARRAY['Camila','Santiago','Valentina','Mateo','Isabella','Sebastian',
              'Salome','Emiliano','Antonia','Tomas'])[1 + (n % 10)],
       (ARRAY['Andrea','Jose','Lucia','David','Sofia','Alejandro',
              'Marcela','Nicolas','Daniela','Felipe'])[1 + ((n * 3) % 10)],
       (ARRAY['Gonzalez','Ramirez','Herrera','Castro','Molina','Reyes',
              'Acosta','Peralta','Suarez','Mendoza'])[1 + ((n * 7) % 10)],
       (ARRAY['Lopez','Torres','Rivas','Guzman','Pardo','Cordoba',
              'Silva','Naranjo','Bonilla','Escobar'])[1 + ((n * 11) % 10)],
       (600 + 1 + ((n - 1) / 30))::text,
       TRUE
FROM generate_series(1, 180) AS n
ON CONFLICT (document_id) DO NOTHING;

-- Horario: 6 cursos x 5 dias x 6 bloques, con aula --------------------------------
-- El aula sigue la convencion del colegio: piso + numero. 601 esta en el aula 201.
INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time,
                             subject_id, teacher_id, room)
SELECT g.grade,
       d.weekday,
       b.block_no,
       (TIME '06:30' + (b.block_no - 1) * INTERVAL '55 minutes'),
       (TIME '07:20' + (b.block_no - 1) * INTERVAL '55 minutes'),
       (SELECT id FROM subjects ORDER BY id
         LIMIT 1 OFFSET ((b.block_no - 1 + d.weekday) % 6)),
       (SELECT id FROM users WHERE email LIKE 'profe%' ORDER BY id
         LIMIT 1 OFFSET ((abs(hashtext(g.grade)) + b.block_no + d.weekday) % 12)),
       CASE WHEN (b.block_no + d.weekday) % 7 = 0 THEN 'Laboratorio'
            WHEN (b.block_no + d.weekday) % 5 = 0 THEN 'Sala de sistemas'
            ELSE 'Aula ' || (200 + (g.grade::int - 600)) END
FROM (SELECT DISTINCT grade FROM students WHERE grade LIKE '6%') g
CROSS JOIN generate_series(1, 5) AS d(weekday)
CROSS JOIN generate_series(1, 6) AS b(block_no)
ON CONFLICT (grade, weekday, block_no) DO UPDATE
  SET room = EXCLUDED.room, teacher_id = EXCLUDED.teacher_id;

-- Asistencia del mes en curso, incluyendo hoy si hoy es lectivo -------------------
-- Distribucion parecida a la real: ~92 % presentes, y el resto repartido.
INSERT INTO attendance (id, student_id, schedule_block_id, class_date, status,
                        recorded_by, recorded_at)
SELECT gen_random_uuid(), s.id, b.id, c.calendar_date,
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
                      AND c.calendar_date >= date_trunc('month', CURRENT_DATE)::date
                      AND c.calendar_date <= CURRENT_DATE
WHERE s.grade LIKE '6%'
ON CONFLICT ON CONSTRAINT attendance_unique_slot DO NOTHING;

-- Acudientes: uno por estudiante ---------------------------------------------------
INSERT INTO users (email, password_hash, full_name, role, active, must_change_password)
SELECT 'acudiente.' || s.document_id || '@correo.com',
       '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
       'Acudiente de ' || s.first_name || ' ' || s.last_name,
       'ACUDIENTE', TRUE, FALSE
FROM students s WHERE s.grade LIKE '6%'
ON CONFLICT (email) DO NOTHING;

INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s.id, u.id, 'Madre'
FROM students s
JOIN users u ON u.email = 'acudiente.' || s.document_id || '@correo.com'
ON CONFLICT (student_id, guardian_id) DO NOTHING;

-- Un acudiente con dos hijos: el acudiente del primer estudiante de 601 tambien
-- queda a cargo del segundo, para poder ver esa pantalla con mas de un hijo.
INSERT INTO guardianships (student_id, guardian_id, relationship)
SELECT s2.id, u.id, 'Padre'
FROM students s1
JOIN users u ON u.email = 'acudiente.' || s1.document_id || '@correo.com'
JOIN students s2 ON s2.grade = s1.grade AND s2.document_id <> s1.document_id
WHERE s1.grade = '601'
ORDER BY s1.document_id, s2.document_id
LIMIT 1
ON CONFLICT (student_id, guardian_id) DO NOTHING;

ANALYZE;

SELECT 'estudiantes' AS tabla, count(*) FROM students WHERE grade LIKE '6%'
UNION ALL SELECT 'docentes',    count(*) FROM users WHERE email LIKE 'profe%'
UNION ALL SELECT 'bloques',     count(*) FROM schedule_blocks
UNION ALL SELECT 'asistencias', count(*) FROM attendance
UNION ALL SELECT 'acudientes',  count(*) FROM users WHERE role = 'ACUDIENTE';
