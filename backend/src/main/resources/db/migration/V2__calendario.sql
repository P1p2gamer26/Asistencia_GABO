CREATE TABLE school_calendar (
    calendar_date DATE        PRIMARY KEY,
    day_type      VARCHAR(16) NOT NULL
                  CHECK (day_type IN ('LECTIVO','FESTIVO','VACACIONES','INSTITUCIONAL','SUSPENDIDO')),
    description   VARCHAR(120),
    updated_by    BIGINT      REFERENCES users(id),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calendar_lectivos ON school_calendar (calendar_date)
    WHERE day_type = 'LECTIVO';

COMMENT ON TABLE school_calendar IS
    'Una fila por fecha del ano escolar. LECTIVO es el unico tipo en el que se puede registrar asistencia.';

-- Todos los dias habiles del ano escolar 2026 como lectivos
INSERT INTO school_calendar (calendar_date, day_type)
SELECT d::date, 'LECTIVO'
FROM generate_series(DATE '2026-01-19', DATE '2026-12-04', INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5;

-- Festivos nacionales de Colombia 2026 (Ley Emiliany ya aplicada: varios caen en lunes)
INSERT INTO school_calendar (calendar_date, day_type, description) VALUES
 ('2026-01-01','FESTIVO','Ano nuevo'),
 ('2026-01-12','FESTIVO','Reyes Magos'),
 ('2026-03-23','FESTIVO','San Jose'),
 ('2026-04-02','FESTIVO','Jueves Santo'),
 ('2026-04-03','FESTIVO','Viernes Santo'),
 ('2026-05-01','FESTIVO','Dia del trabajo'),
 ('2026-05-18','FESTIVO','Ascension'),
 ('2026-06-08','FESTIVO','Corpus Christi'),
 ('2026-06-15','FESTIVO','Sagrado Corazon'),
 ('2026-06-29','FESTIVO','San Pedro y San Pablo'),
 ('2026-07-20','FESTIVO','Independencia'),
 ('2026-08-07','FESTIVO','Batalla de Boyaca'),
 ('2026-08-17','FESTIVO','Asuncion'),
 ('2026-10-12','FESTIVO','Dia de la raza'),
 ('2026-11-02','FESTIVO','Todos los santos'),
 ('2026-11-16','FESTIVO','Independencia de Cartagena'),
 ('2026-12-08','FESTIVO','Inmaculada Concepcion'),
 ('2026-12-25','FESTIVO','Navidad')
ON CONFLICT (calendar_date) DO UPDATE
  SET day_type = EXCLUDED.day_type, description = EXCLUDED.description;

-- Recesos escolares (calendario A, ajustar con la rectoria antes de produccion)
INSERT INTO school_calendar (calendar_date, day_type, description)
SELECT d::date, 'VACACIONES', r.nombre
FROM (VALUES
        (DATE '2026-03-30', DATE '2026-04-03', 'Semana Santa'),
        (DATE '2026-06-15', DATE '2026-07-10', 'Receso de mitad de ano'),
        (DATE '2026-10-05', DATE '2026-10-09', 'Receso de octubre')
     ) AS r(inicio, fin, nombre),
     LATERAL generate_series(r.inicio, r.fin, INTERVAL '1 day') AS d
WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
ON CONFLICT (calendar_date) DO UPDATE
  SET day_type = EXCLUDED.day_type, description = EXCLUDED.description;
