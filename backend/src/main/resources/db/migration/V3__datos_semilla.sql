INSERT INTO users (email, password_hash, full_name, role) VALUES
 ('admin@ggm.edu.co',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Administrador GGM', 'ADMIN'),
 ('coord@ggm.edu.co',    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Coordinacion GGM',  'COORDINADOR'),
 ('fpalacios@ggm.edu.co','$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Francisco Palacios','DOCENTE');

INSERT INTO subjects (name) VALUES ('Matematicas'), ('Espanol'), ('Informatica');

INSERT INTO students (document_id, first_name, middle_name, last_name, second_surname, grade) VALUES
 ('1010101010','LINDA','ISABELLA','AREVALO','FIGUEROA','601'),
 ('1010101011','JUAN','DIEGO','AVILA','VERGARA','601'),
 ('1010101012','DANIEL','ALEJANDRO','BARRIOS','PARATES','602');

INSERT INTO schedule_blocks (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id)
SELECT '601', 1, 1, '06:30', '07:20', s.id, u.id
FROM subjects s, users u
WHERE s.name = 'Matematicas' AND u.email = 'fpalacios@ggm.edu.co';
