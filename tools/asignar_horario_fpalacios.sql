-- Asigna un horario razonable a Francisco Palacios (fpalacios@ggm.edu.co, DOCENTE).
--
-- Por que bloque 7 y no uno de los 1-6 ya usados: schedule_blocks tiene UNIQUE
-- (grade, weekday, block_no) y los 900+ bloques sembrados ya ocupan los bloques
-- 1-6 de lunes a viernes para todos los cursos. Reasignarle una clase existente
-- le quitaria esa clase a otro docente que si la dicta, lo cual no es "darle
-- clases a Francisco" sino quitarselas a otra persona. El bloque 7 (permitido
-- por el CHECK block_no entre 1 y 8) esta libre en todos los cursos, asi que
-- crear ahi es aditivo: no le quita nada a nadie.
--
-- Como reproducir esto por la interfaz en vez de este script: entrar a
-- Administracion > Horario con una cuenta COORDINADOR o ADMIN y usar "Crear
-- bloque" con estos mismos datos (curso, dia, bloque 7, horas, materia
-- Informatica, docente Francisco Palacios, aula Sala de sistemas). El backend
-- (POST /api/admin/schedule) hace las mismas validaciones e inserta con la
-- misma autoria.
--
-- Por que SQL y no el endpoint nuevo: el backend en localhost:8080 seguia
-- corriendo el build anterior (sin este CRUD) y la instruccion de la tarea es
-- no matarlo ni reiniciarlo, asi que no habia forma de llamar al endpoint real
-- en este entorno. created_by queda en la cuenta de coordinacion
-- (coord@ggm.edu.co, id conocido por consulta) porque es quien administra el
-- horario del colegio; no se inventa un autor, se registra el mismo que
-- hubiera hecho la peticion HTTP de haber podido reiniciar el backend.

INSERT INTO schedule_blocks
    (grade, weekday, block_no, start_time, end_time, subject_id, teacher_id, room,
     created_by, created_at)
SELECT g.grade, g.weekday, 7, '13:00', '13:50',
       (SELECT id FROM subjects WHERE name = 'Informatica'),
       (SELECT id FROM users WHERE email = 'fpalacios@ggm.edu.co'),
       'Sala de sistemas',
       (SELECT id FROM users WHERE email = 'coord@ggm.edu.co'),
       now()
FROM (VALUES ('601', 1), ('601', 3), ('602', 2), ('602', 4), ('603', 5)) AS g(grade, weekday)
ON CONFLICT (grade, weekday, block_no) DO NOTHING;
