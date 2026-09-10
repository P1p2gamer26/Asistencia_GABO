-- Los cursos reales del colegio no son '0A'..'11B' (el formato que supuso V60), sino los
-- codigos del plano de matricula: '101'..'1102' para primero a once, y preescolar y
-- aceleracion aparte ('PJ01', 'J01'..'J03', 'T01'..'T03', '9901'..'9903').
--
-- Con esos valores, orden_curso() de V60 mandaba TODO a la rama "no calza" y los
-- ordenaba como texto: 1001 < 101 < 1101 < 201. Los cuatro reportes por curso de
-- ReportRepository salian revueltos.
--
-- Se amplia la misma funcion en vez de anadir otra: las consultas no cambian. La clave
-- sigue siendo texto y sigue sin fallar nunca; lo que no calza con ningun formato se va
-- al final, ordenado alfabeticamente entre si, igual que antes.
--
-- El grado va desplazado en +2 y con tres digitos para que prejardin (-2) y jardin (-1)
-- no den negativo y para que aceleracion (99) quede al final sin trucos.
CREATE OR REPLACE FUNCTION orden_curso(g VARCHAR) RETURNS VARCHAR AS $$
    SELECT CASE
        -- Preescolar: prejardin, jardin, transicion.
        WHEN g ~ '^PJ[0-9]+$' THEN '0000' || substring(g FROM 3)
        WHEN g ~ '^J[0-9]+$'  THEN '0001' || substring(g FROM 2)
        WHEN g ~ '^T[0-9]+$'  THEN '0002' || substring(g FROM 2)
        -- Codigo oficial: los dos ultimos digitos son el grupo, el resto el grado.
        -- '601' -> grado 6 grupo 01; '1001' -> grado 10 grupo 01; '9901' -> aceleracion.
        WHEN g ~ '^[0-9]{3,4}$'
            THEN '0' || lpad((left(g, length(g) - 2)::int + 2)::text, 3, '0') || right(g, 2)
        -- Formato "<grado><paralelo>" ('0A'..'11B'), el que suponia V60.
        WHEN g ~ '^[0-9]{1,2}[A-Za-z]'
            THEN '0' || lpad((substring(g FROM '^[0-9]{1,2}')::int + 2)::text, 3, '0')
                     || substring(g FROM '^[0-9]{1,2}(.*)$')
        ELSE '1' || coalesce(g, '')
    END;
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION orden_curso(VARCHAR) IS
  'Clave de orden natural para grade: PJ01, J01, T01, 101..1102, 9901 y 0A..11B en orden humano; lo que no calza queda al final sin romper nada.';
