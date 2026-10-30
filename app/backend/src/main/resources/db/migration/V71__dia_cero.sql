-- Dia 0: dia de colegio con bloques y dia de ciclo como cualquier lectivo, asistencia
-- que se puede tomar, y que cuenta en porcentajes. A diferencia de un lectivo, no
-- tomar asistencia ese dia NO genera pendientes ni alertas.
ALTER TABLE school_calendar DROP CONSTRAINT IF EXISTS school_calendar_day_type_check;
ALTER TABLE school_calendar ADD CONSTRAINT school_calendar_day_type_check
    CHECK (day_type IN ('LECTIVO','FESTIVO','VACACIONES','INSTITUCIONAL','SUSPENDIDO','DIA_CERO'));

-- El dia 0 entra en la numeracion del ciclo (tiene bloques), igual que un lectivo.
CREATE OR REPLACE VIEW calendario_ciclo AS
WITH lectivos AS (
    SELECT calendar_date, cycle_day_fixed,
           EXTRACT(YEAR FROM calendar_date) AS anio,
           count(cycle_day_fixed) OVER (PARTITION BY EXTRACT(YEAR FROM calendar_date)
                                        ORDER BY calendar_date) AS grp
    FROM school_calendar
    WHERE day_type IN ('LECTIVO','DIA_CERO')
)
SELECT calendar_date,
       ((coalesce(first_value(cycle_day_fixed) OVER w, 1) - 1
         + row_number() OVER w - 1) % 5 + 1)::smallint AS cycle_day,
       cycle_day_fixed
FROM lectivos
WINDOW w AS (PARTITION BY anio, grp ORDER BY calendar_date);

COMMENT ON VIEW calendario_ciclo IS
    'Dias con clase (lectivos y dia 0) numerados 1 a 5 en rotacion por ano; un cycle_day_fixed reinicia el conteo desde ese valor.';
