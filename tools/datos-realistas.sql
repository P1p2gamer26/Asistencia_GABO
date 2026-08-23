-- Completa la siembra de tools/datos-locales.sql con los casos que un colegio de
-- verdad produce y que la siembra base no generaba. Se ejecuta DESPUES de ella:
--
--   psql -U postgres -d asistencia -f tools/datos-locales.sql
--   psql -U postgres -d asistencia -f tools/datos-realistas.sql
--
-- Por que existe: la siembra base marcaba pocos bloques por estudiante, nunca ponia
-- comentarios y no registraba ni un ingreso por porteria. Con esos datos varias
-- pantallas se veian bien sin estarlo, y un defecto real del tablero -- contar filas
-- de asistencia en vez de estudiantes -- era invisible, porque hacen falta faltas
-- repartidas en varios bloques del mismo dia para que se note.
--
-- Es idempotente: se puede repetir sin duplicar nada.

\timing off

-- 1. Ausencias de dia completo -------------------------------------------------
-- El caso normal en un colegio: el estudiante no vino, y falta en TODOS los bloques
-- del dia, no en uno. Es lo que distingue "cuantos estudiantes faltaron" de "cuantas
-- ausencias se registraron", dos numeros que no son el mismo.
--
-- Va como UPDATE y no como INSERT: la siembra base ya creo esas filas marcadas como
-- presente, asi que un INSERT chocaba con attendance_unique_slot y no hacia nada.
UPDATE attendance a
   SET status = 'F',
       comment = CASE WHEN (a.student_id % 3) = 0
                      THEN 'Incapacidad medica, la acudiente aviso' END
  FROM (SELECT calendar_date FROM school_calendar
         WHERE day_type = 'LECTIVO' AND calendar_date <= CURRENT_DATE
         ORDER BY calendar_date DESC LIMIT 4) d
 WHERE a.class_date = d.calendar_date
   AND (a.student_id % 37) = 0;

-- 2. Motivos escritos en las novedades -----------------------------------------
-- Un listado de ausencias sin motivo no deja actuar: el rector necesita distinguir
-- la incapacidad avisada del que simplemente no llego.
UPDATE attendance a
   SET comment = m.texto
  FROM (VALUES
          (0, 'Cita medica, presento soporte'),
          (1, 'La acudiente aviso por telefono'),
          (2, 'Llego despues del descanso'),
          (3, 'Se ausento sin permiso'),
          (4, 'Problema de transporte en la ruta'))
        AS m(resto, texto)
 WHERE a.status IN ('F', 'T', 'E')
   AND a.comment IS NULL
   AND (a.student_id % 5) = m.resto
   AND (a.student_id % 2) = 0;

-- 3. Evasiones concentradas en pocos estudiantes -------------------------------
-- Las evasiones no se reparten al azar: son casi siempre los mismos. Si se siembran
-- uniformes, la pantalla de novedades no sirve para lo que se pidio -- ver a quien
-- hay que llamar. Tambien UPDATE, por la misma razon que el bloque 1.
UPDATE attendance a
   SET status = 'E', comment = 'Salio del salon y no regreso'
  FROM schedule_blocks b,
       (SELECT calendar_date FROM school_calendar
         WHERE day_type = 'LECTIVO' AND calendar_date <= CURRENT_DATE
         ORDER BY calendar_date DESC LIMIT 6) d
 WHERE a.schedule_block_id = b.id
   AND a.class_date = d.calendar_date
   AND b.block_no IN (4, 5)
   AND (a.student_id % 61) = 0;

-- 4. Ingresos por porteria -----------------------------------------------------
-- Sin esto el KPI "Ingresos por porteria" muestra 0 todos los dias, que se lee como
-- "no entro nadie al colegio" cuando en realidad es "nadie escaneo un carnet".
INSERT INTO entry_log (id, student_id, entry_date, scanned_at, recorded_by)
SELECT gen_random_uuid(), s.id, d.calendar_date,
       ((d.calendar_date + time '06:40' + ((s.id % 40) * interval '1 minute'))
         AT TIME ZONE 'America/Bogota'),
       (SELECT id FROM users WHERE email = 'admin@ggm.edu.co')
FROM (SELECT calendar_date FROM school_calendar
       WHERE day_type = 'LECTIVO' AND calendar_date <= CURRENT_DATE
       ORDER BY calendar_date DESC LIMIT 5) d
JOIN students s ON s.active AND (s.id % 2) = 0
WHERE NOT EXISTS (SELECT 1 FROM entry_log e
                   WHERE e.student_id = s.id AND e.entry_date = d.calendar_date);

-- 5. Mas acudientes con varios hijos -------------------------------------------
-- Un acudiente con un solo hijo no ejercita la pantalla que se pidio. Se emparejan
-- hermanos: mismo apellido, cursos distintos.
INSERT INTO guardianships (student_id, guardian_id)
SELECT s2.id, g.guardian_id
FROM guardianships g
JOIN students s1 ON s1.id = g.student_id
JOIN LATERAL (
      SELECT s.id FROM students s
       WHERE s.active AND s.last_name = s1.last_name AND s.id <> s1.id
         AND s.grade <> s1.grade
       ORDER BY s.id LIMIT 1) s2 ON TRUE
WHERE (g.guardian_id % 4) = 0
ON CONFLICT DO NOTHING;

ANALYZE attendance;
ANALYZE entry_log;

-- Comprobacion: estos numeros son el entregable, no que el script no falle.
SELECT 'ausencias de dia completo' AS caso, count(*) AS n FROM (
    SELECT student_id, class_date FROM attendance WHERE status = 'F'
     GROUP BY student_id, class_date HAVING count(*) >= 4) x
UNION ALL SELECT 'novedades con motivo escrito', count(*) FROM attendance
           WHERE comment IS NOT NULL
UNION ALL SELECT 'ingresos por porteria', count(*) FROM entry_log
UNION ALL SELECT 'acudientes con dos o mas hijos', count(*) FROM (
    SELECT guardian_id FROM guardianships GROUP BY guardian_id HAVING count(*) > 1) y
UNION ALL SELECT 'estudiantes con evasiones repetidas', count(*) FROM (
    SELECT student_id FROM attendance WHERE status = 'E'
     GROUP BY student_id HAVING count(*) >= 3) z;
