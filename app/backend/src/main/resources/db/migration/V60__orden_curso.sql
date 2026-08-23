-- Funcion de orden natural para el nombre de curso (grade). La columna es texto
-- libre (VARCHAR(10)) y hoy tiene valores como '601'..'607'; en breve pasara a
-- '0A'..'11B' (grado + paralelo). El orden alfabetico de texto pondria '10A' y
-- '11B' entre '0A' y '1A', que es absurdo para quien busca un curso.
--
-- Esta funcion vive en un unico lugar (en vez de repetir la expresion en cada
-- consulta) y nunca falla: un valor que no calce con el formato "<numero><letra>"
-- (por ejemplo '601' o 'Transicion') se manda al final, ordenado alfabeticamente
-- entre si, pero nunca desaparece ni rompe la consulta.
CREATE OR REPLACE FUNCTION orden_curso(g VARCHAR) RETURNS VARCHAR AS $$
    SELECT CASE
        WHEN g ~ '^[0-9]{1,2}[A-Za-z]'
            THEN '0' || lpad(substring(g FROM '^[0-9]{1,2}'), 2, '0')
                      || substring(g FROM '^[0-9]{1,2}(.*)$')
        ELSE '1' || coalesce(g, '')
    END;
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION orden_curso(VARCHAR) IS
  'Clave de orden natural para grade: 0A..11B en orden humano; lo que no calza queda al final sin romper nada.';
