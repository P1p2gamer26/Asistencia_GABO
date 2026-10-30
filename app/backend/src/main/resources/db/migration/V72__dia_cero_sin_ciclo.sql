-- Dia 0: no tiene numero de ciclo ni avanza la rotacion. La vista vuelve a contar solo
-- los lectivos: el dia 0 queda fuera, igual que un festivo, y el siguiente lectivo sigue
-- la numeracion donde iba.
CREATE OR REPLACE VIEW calendario_ciclo AS
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
    'Dias lectivos numerados 1 a 5 en rotacion por ano; un cycle_day_fixed reinicia el conteo desde ese valor. El dia 0 no entra.';

-- Asistencia general del dia 0: una marca por estudiante y fecha, sin bloques ni materia.
CREATE TABLE attendance_general (
    id           BIGSERIAL PRIMARY KEY,
    student_id   BIGINT       NOT NULL REFERENCES students(id),
    class_date   DATE         NOT NULL,
    status       CHAR(1)      NOT NULL CHECK (status IN ('P','T','F','E')),
    comment      VARCHAR(255),
    recorded_by  BIGINT       REFERENCES users(id),
    recorded_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (student_id, class_date)
);

COMMENT ON TABLE attendance_general IS
    'Asistencia de los dias 0 (dia de colegio sin clases por bloque). Una marca por estudiante y dia.';
