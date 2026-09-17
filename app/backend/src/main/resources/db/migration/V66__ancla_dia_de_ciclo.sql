-- Ancla manual del dia de ciclo: coordinacion puede decir "este dia es el 3" y
-- desde ahi se sigue contando. Sin ancla, se cuenta desde el primer lectivo del ano.
ALTER TABLE school_calendar
    ADD COLUMN cycle_day_fixed SMALLINT CHECK (cycle_day_fixed BETWEEN 1 AND 5);

COMMENT ON COLUMN school_calendar.cycle_day_fixed IS
    'Ancla manual: este dia lectivo es el dia de ciclo indicado y los siguientes cuentan desde aqui';

DROP FUNCTION dia_ciclo(date);
DROP VIEW calendario_ciclo;

CREATE VIEW calendario_ciclo AS
WITH lectivos AS (
    SELECT calendar_date, cycle_day_fixed,
           EXTRACT(YEAR FROM calendar_date) AS anio,
           count(cycle_day_fixed) OVER (PARTITION BY EXTRACT(YEAR FROM calendar_date)
                                        ORDER BY calendar_date) AS grp
    FROM school_calendar
    WHERE day_type = 'LECTIVO'
)
SELECT calendar_date,
       ((coalesce(first_value(cycle_day_fixed) OVER w, 1) - 1
         + row_number() OVER w - 1) % 5 + 1)::smallint AS cycle_day,
       cycle_day_fixed
FROM lectivos
WINDOW w AS (PARTITION BY anio, grp ORDER BY calendar_date);

COMMENT ON VIEW calendario_ciclo IS
    'Dias lectivos numerados 1 a 5 en rotacion por ano; un cycle_day_fixed reinicia el conteo desde ese valor.';

CREATE FUNCTION dia_ciclo(fecha date) RETURNS smallint
LANGUAGE sql STABLE
AS $$
    SELECT cycle_day FROM calendario_ciclo WHERE calendar_date = fecha
$$;
