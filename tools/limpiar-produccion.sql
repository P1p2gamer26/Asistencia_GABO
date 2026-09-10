-- Deja la base de PRODUCCION lista para los datos oficiales del colegio: borra todo
-- lo que quedo de la semilla de demostracion y deja solo las cuentas de acceso.
--
-- Se corre UNA vez contra la base de produccion, ANTES de subir estudiantes.csv por
-- /admin -> Carga de datos.
--
-- No es una migracion de Flyway a proposito: V3__datos_semilla.sql es de lo que
-- dependen las pruebas del backend, y una migracion que la borre las tumbaria todas.
-- Esto es una limpieza de una sola vez, no parte del esquema.
--
-- Lo que NO toca: school_calendar (el ano lectivo 2026 real, no es demo) ni el
-- historial de Flyway.

-- 0. Confirmacion explicita -------------------------------------------------------
-- tools/datos-colegio.sql se protege mirando el nombre de la base, pero aqui eso no
-- sirve: la base de produccion tambien se llama "asistencia" en el servidor. Toca
-- decirlo a mano. Descomenta la linea de abajo solo cuando estes seguro de que la
-- conexion apunta a produccion.
--
-- SET app.borrar_todo = 'si';
DO $$
BEGIN
  IF coalesce(current_setting('app.borrar_todo', true), '') <> 'si' THEN
    RAISE EXCEPTION
      'Limpieza detenida: esto BORRA todos los estudiantes, el horario y la '
      'asistencia de la base "%" en %. Si es la que quieres vaciar, descomenta el '
      'SET app.borrar_todo de arriba y vuelve a correrlo.',
      current_database(), inet_server_addr();
  END IF;
END $$;

BEGIN;

-- 1. Datos ------------------------------------------------------------------------
-- En orden de dependencia. notifications cae sola por el ON DELETE CASCADE de
-- attendance, pero se borra explicito para no depender de eso.
DELETE FROM notifications;
DELETE FROM attendance;
DELETE FROM entry_log;
DELETE FROM guardianships;
DELETE FROM schedule_blocks;
DELETE FROM students;
DELETE FROM subjects;

-- 2. Usuarios ---------------------------------------------------------------------
-- Fuera todo el que no sea ADMIN: los docentes y acudientes reales los vuelve a crear
-- ImportService al subir el horario y los acudientes.
DELETE FROM users WHERE role <> 'ADMIN';

-- 3. Las cuentas de acceso --------------------------------------------------------
-- Clave temporal "cambiar123" (el mismo hash BCrypt de V3 y V63). must_change_password
-- en TRUE: la aplicacion obliga a cambiarla en el primer acceso.
INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES
 ('mequinterog@educacionbogota.edu.co',
  '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
  'Coordinacion GGM', 'ADMIN', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Docentes del area de tecnologia. Son los que aparecen en
-- horario-docentes-secundaria-2026-2.pdf dictando Tecnologia e Informatica; falta
-- ponerles el correo institucional real (@educacionbogota.edu.co) y descomentar.
-- El resto de docentes los crea solos ImportService cuando se suba el horario.
--
-- INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES
--  ('...@educacionbogota.edu.co',
--   '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
--   'Miguel Bacca', 'DOCENTE', TRUE),
--  ('...@educacionbogota.edu.co',
--   '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
--   'Yamile Pachon', 'DOCENTE', TRUE),
--  ('...@educacionbogota.edu.co',
--   '$2a$10$Dj7iHjr8j08eQUlmQcVd5uM9.8ffEMX0WtxdQPz3IAsepUn6jQnTu',
--   'Andersson Tunjano', 'DOCENTE', TRUE)
-- ON CONFLICT (email) DO NOTHING;

-- admin2@ggm.edu.co (la cuenta de rescate de V63) queda como esta: es la unica con
-- clave conocida que no obliga a cambiarla.

COMMIT;

-- 4. Comprobar --------------------------------------------------------------------
SELECT email, role, must_change_password FROM users ORDER BY email;
SELECT
  (SELECT count(*) FROM students)        AS estudiantes,   -- 0 antes de importar
  (SELECT count(*) FROM schedule_blocks) AS bloques,       -- 0
  (SELECT count(*) FROM attendance)      AS asistencia,    -- 0
  (SELECT count(*) FROM school_calendar) AS calendario;    -- ~240, no se toca
