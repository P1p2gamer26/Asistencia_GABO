-- Nombres colombianos de verdad: con tildes y con enie.
--
--   psql -U postgres -d asistencia -f tools/datos-acentos.sql
--
-- Por que existe: los 211 estudiantes sembrados no tenian ni una tilde ni una enie,
-- y los nombres reales del colegio estan llenos de ellos. Ya nos mordio antes: el
-- Excel real del colegio llegaba con "CASTA?EDA", y no se puede comprobar que eso
-- este resuelto si en la base no hay un solo caracter fuera del ASCII.
--
-- Toca a la exportacion a Excel, al PDF si lo hubiera, a las busquedas por nombre y
-- a la ordenacion alfabetica, que en espanol no coloca la enie donde la pone el
-- orden binario de bytes.
--
-- Es idempotente.

\timing off

-- Se cambian los apellidos de una parte de los estudiantes por versiones con tilde
-- y enie, repartidas por curso para que aparezcan en todas las pantallas.
UPDATE students s
   SET last_name = v.apellido,
       first_name = v.nombre
  FROM (VALUES
          (0,  'MUÑOZ',      'JOSÉ MARÍA'),
          (1,  'PEÑA',       'ANGÉLICA'),
          (2,  'CASTAÑEDA',  'SEBASTIÁN'),
          (3,  'IBÁÑEZ',     'MARÍA JOSÉ'),
          (4,  'NÚÑEZ',      'ANDRÉS FELIPE'),
          (5,  'ORDÓÑEZ',    'VALENTÍN'),
          (6,  'PIÑEROS',    'LUCÍA'),
          (7,  'BOHÓRQUEZ',  'JERÓNIMO'),
          (8,  'GÓMEZ',      'NICOLÁS'),
          (9,  'MARTÍNEZ',   'BEATRIZ ADRIÁN'),
          (10, 'RODRÍGUEZ',  'MARÍA DEL PILAR'),
          (11, 'HERNÁNDEZ',  'JOSÉ ÁNGEL'))
        AS v(resto, apellido, nombre)
 WHERE (s.id % 12) = v.resto
   AND s.active;

ANALYZE students;

-- Comprobacion: estos numeros son el entregable.
SELECT 'estudiantes con tilde o enie en el nombre' AS caso,
       count(*) AS n
  FROM students
 WHERE active AND (first_name || last_name) ~ '[^ -~]'
UNION ALL
SELECT 'de ellos, con enie concretamente', count(*)
  FROM students
 WHERE active AND (first_name || last_name) LIKE '%Ñ%'
UNION ALL
SELECT 'cursos alcanzados', count(DISTINCT grade)
  FROM students
 WHERE active AND (first_name || last_name) ~ '[^ -~]';
