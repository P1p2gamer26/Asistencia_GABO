CREATE VIEW calendario_ciclo AS
SELECT calendar_date,
       ((row_number() OVER (PARTITION BY EXTRACT(YEAR FROM calendar_date)
                            ORDER BY calendar_date) - 1) % 5 + 1)::smallint AS cycle_day
FROM school_calendar
WHERE day_type = 'LECTIVO';

COMMENT ON VIEW calendario_ciclo IS
    'Los dias lectivos se numeran 1 a 5 consecutivamente por ano calendario; los no lectivos no tienen dia de ciclo.';

CREATE FUNCTION dia_ciclo(fecha date) RETURNS smallint
LANGUAGE sql STABLE
AS $$
    SELECT cycle_day FROM calendario_ciclo WHERE calendar_date = fecha
$$;
